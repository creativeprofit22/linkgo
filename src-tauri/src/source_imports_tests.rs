use super::*;
use crate::test_support::{count, fail_on, migrated, number, seed, snapshot, text, Fixture};

const TABLES: &[&str] = &[
    "source_import_batches",
    "source_import_items",
    "target_posts",
    "candidate_posts",
    "dedupe_keys",
];
const NOW_MS: i64 = 1_767_225_600_000; // 2026-01-01T00:00:00Z
const FRESH: &str = "2025-12-31T12:00:00Z";

async fn fixture() -> Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Old','archived',5);
         INSERT INTO candidate_intake_policies (campaign_id,max_post_age_days) VALUES (1,30);
         INSERT INTO candidate_policy_banned_topics (campaign_id,topic,normalized_topic) VALUES (1,'Crypto','crypto');",
    )
    .await;
    f
}

fn value(url: &str, content: &str) -> SourceImportRowValue {
    SourceImportRowValue {
        url: url.to_string(),
        content: content.to_string(),
        author_name: "Ada".to_string(),
        author_profile_url: String::new(),
        posted_at: Some(FRESH.to_string()),
        platform_resource_urn: String::new(),
        source_keyword: String::new(),
        notes: String::new(),
    }
}

fn row(row_number: i64, value: Option<SourceImportRowValue>) -> SourceImportRowInput {
    SourceImportRowInput {
        row_number,
        input_json: format!("{{\"row\":{row_number}}}"),
        validation_error: if value.is_none() {
            "Row 1: url is required".to_string()
        } else {
            String::new()
        },
        value,
    }
}

fn batch(campaign_id: i64, rows: Vec<SourceImportRowInput>) -> WriteSourceImportBatchInput {
    WriteSourceImportBatchInput {
        campaign_id,
        connector_key: "local_json".to_string(),
        rows,
    }
}

const POST_1: &str = "HTTPS://WWW.LinkedIn.com/feed/update/urn:li:activity:1/?utm=x#top";
const POST_2: &str = "https://www.linkedin.com/feed/update/urn:li:activity:2/";

async fn items(f: &Fixture, batch_id: i64) -> Vec<String> {
    sqlx::query_scalar::<_, String>(
        "SELECT row_number||'|'||status||'|'||reason||'|'||policy_rule_key
         FROM source_import_items WHERE source_import_batch_id = ?1 ORDER BY row_number",
    )
    .bind(batch_id)
    .fetch_all(&f.pool)
    .await
    .unwrap()
}

#[test]
fn inputs_reject_unknown_fields() {
    assert!(
        serde_json::from_value::<SourceImportRowValue>(serde_json::json!({
            "url": "u", "content": "c", "normalizedUrl": "forged"
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<WriteSourceImportBatchInput>(serde_json::json!({
            "campaignId": 1, "connectorKey": "local_json", "rows": [], "enforcePolicy": false
        }))
        .is_err()
    );
}

#[tokio::test]
async fn mixed_batch_settles_each_row_with_native_policy_and_dedupe() {
    let f = fixture().await;
    let activity = SourceImportActivity::default();
    let mut banned = value(
        POST_2,
        "New \u{ff23}\u{ff32}\u{ff39}\u{ff30}\u{ff34}\u{ff2f} launch",
    );
    banned.source_keyword = "tokens".to_string();
    let mut foreign = value("https://evil.com/post", "Other post body");
    foreign.posted_at = Some("2025-01-01T00:00:00Z".to_string());
    let result = write_batch(
        &f.pool,
        &activity,
        batch(
            1,
            vec![
                row(1, Some(value(POST_1, "  Hello   world  "))),
                row(
                    2,
                    // Same post as row 1 after WHATWG normalization (host case,
                    // trailing slash, fragment); the query string is kept.
                    Some(value(
                        "https://www.linkedin.COM/feed/update/urn:li:activity:1?utm=x#other",
                        "different",
                    )),
                ),
                row(3, None),
                row(4, Some(banned)),
                row(5, Some(foreign)),
            ],
        ),
        NOW_MS,
    )
    .await
    .unwrap();
    assert_eq!(
        (
            result.status.as_str(),
            result.accepted_count,
            result.duplicate_count,
            result.rejected_count
        ),
        ("completed_with_errors", 1, 1, 3)
    );
    let candidate: i64 = number(&f.pool, "SELECT MIN(id) FROM candidate_posts").await;
    assert_eq!(
        items(&f, result.batch_id).await,
        vec![
            format!("1|accepted|Candidate {candidate} created.|"),
            "2|duplicate|Duplicate URL or post text for this campaign.|".to_string(),
            "3|rejected|Row 1: url is required|".to_string(),
            "4|rejected|Post matches banned topic: Crypto.|banned_topic".to_string(),
            "5|rejected|Source must be an HTTPS linkedin.com URL or LinkedIn subdomain. Post is older than the 30-day campaign limit.|source".to_string(),
        ]
    );
    // The WHATWG-normalized URL is what was stored as the dedupe key.
    assert_eq!(
        text(
            &f.pool,
            "SELECT key_value FROM dedupe_keys WHERE key_type='normalized_url'"
        )
        .await,
        "https://www.linkedin.com/feed/update/urn:li:activity:1?utm=x"
    );
    // Duplicate rows leave no partial target/candidate writes behind.
    assert_eq!(count(&f.pool, "candidate_posts").await, 1);
    assert_eq!(count(&f.pool, "target_posts").await, 1);
    assert_eq!(
        text(
            &f.pool,
            &format!(
                "SELECT status||'|'||error_message FROM source_import_batches WHERE id={}",
                result.batch_id
            )
        )
        .await,
        "completed_with_errors|"
    );
}

#[tokio::test]
async fn all_accepted_batch_is_completed() {
    let f = fixture().await;
    let result = write_batch(
        &f.pool,
        &SourceImportActivity::default(),
        batch(
            1,
            vec![
                row(1, Some(value(POST_1, "one"))),
                row(2, Some(value(POST_2, "two"))),
            ],
        ),
        NOW_MS,
    )
    .await
    .unwrap();
    assert_eq!(
        (result.status.as_str(), result.accepted_count),
        ("completed", 2)
    );
}

#[tokio::test]
async fn brightdata_batch_is_stored_with_its_source_type_and_policy() {
    let f = fixture().await;
    let mut input = batch(
        1,
        vec![
            row(1, Some(value(POST_1, "one"))),
            row(2, Some(value(POST_2, "crypto tips"))),
        ],
    );
    input.connector_key = "brightdata".to_string();
    let result = write_batch(&f.pool, &SourceImportActivity::default(), input, NOW_MS)
        .await
        .unwrap();
    assert_eq!(
        (
            result.accepted_count,
            result.rejected_count,
            result.status.as_str()
        ),
        (1, 1, "completed_with_errors")
    );
    assert_eq!(
        text(
            &f.pool,
            &format!(
                "SELECT source_type FROM source_import_batches WHERE id={}",
                result.batch_id
            )
        )
        .await,
        "brightdata"
    );
}

#[test]
fn renderer_cannot_write_brightdata_batches() {
    assert!(RENDERER_CONNECTOR_KEYS.contains(&"local_json"));
    assert!(!RENDERER_CONNECTOR_KEYS.contains(&"brightdata"));
    assert!(NATIVE_CONNECTOR_KEYS.contains(&"brightdata"));
}

#[tokio::test]
async fn rejected_inputs_write_nothing() {
    let f = fixture().await;
    let activity = SourceImportActivity::default();
    let before = snapshot(&f.pool, TABLES).await;
    let mut wrong_connector = batch(1, vec![row(1, Some(value(POST_1, "x")))]);
    wrong_connector.connector_key = "scraper".to_string();
    let too_many = batch(
        1,
        (1..=51).map(|n| row(n, Some(value(POST_1, "x")))).collect(),
    );
    let mut unnumbered = batch(1, vec![row(2, Some(value(POST_1, "x")))]);
    unnumbered.rows[0].row_number = 2;
    let mut silent_invalid = batch(1, vec![row(1, None)]);
    silent_invalid.rows[0].validation_error = " ".to_string();
    let mut oversized_json = batch(1, vec![row(1, Some(value(POST_1, "x")))]);
    oversized_json.rows[0].input_json = "x".repeat(20_001);
    for (input, expected) in [
        (
            batch(99, vec![row(1, Some(value(POST_1, "x")))]),
            "Campaign was not found",
        ),
        (
            batch(2, vec![row(1, Some(value(POST_1, "x")))]),
            "Campaign is archived",
        ),
        (batch(0, vec![row(1, None)]), "Campaign is required"),
        (batch(1, vec![]), "Include at least one source post"),
        (wrong_connector, "Unsupported source connector"),
        (too_many, "Import up to 50 rows"),
        (unnumbered, "Source import rows must be numbered in order"),
        (
            silent_invalid,
            "Invalid source import rows need a validation reason",
        ),
        (oversized_json, "Source import row audit JSON is too long"),
    ] {
        assert_eq!(
            write_batch(&f.pool, &activity, input, NOW_MS)
                .await
                .unwrap_err(),
            expected
        );
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
    assert!(!activity.is_active(1), "activity released on rejection");
}

#[tokio::test]
async fn storage_failure_rolls_back_the_row_and_terminalizes_the_batch() {
    let f = fixture().await;
    // Row 2's candidate write fails after its target post insert.
    fail_on(&f.pool, "BEFORE INSERT ON dedupe_keys WHEN NEW.key_value = 'https://www.linkedin.com/feed/update/urn:li:activity:2'").await;
    let result = write_batch(
        &f.pool,
        &SourceImportActivity::default(),
        batch(
            1,
            vec![
                row(1, Some(value(POST_1, "one"))),
                row(2, Some(value(POST_2, "two"))),
                row(
                    3,
                    Some(value(
                        "https://www.linkedin.com/feed/update/urn:li:activity:3/",
                        "three",
                    )),
                ),
            ],
        ),
        NOW_MS,
    )
    .await
    .unwrap();
    assert_eq!(
        (
            result.status.as_str(),
            result.accepted_count,
            result.rejected_count,
            result.error_message.as_str()
        ),
        (
            "failed",
            1,
            2,
            "Import stopped after a local storage error."
        )
    );
    let items = items(&f, result.batch_id).await;
    assert_eq!(
        items[1..],
        [
            "2|rejected|Candidate could not be stored. Review the row and retry the import.|"
                .to_string(),
            "3|rejected|Not processed because the import stopped after a local storage error.|"
                .to_string(),
        ]
    );
    // Row 1 committed; row 2's partial target/candidate rows rolled back.
    assert_eq!(count(&f.pool, "candidate_posts").await, 1);
    assert_eq!(count(&f.pool, "target_posts").await, 1);
}

#[tokio::test]
async fn failure_while_creating_the_batch_leaves_no_rows() {
    let f = fixture().await;
    fail_on(
        &f.pool,
        "BEFORE INSERT ON source_import_items WHEN NEW.row_number = 2",
    )
    .await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        write_batch(
            &f.pool,
            &SourceImportActivity::default(),
            batch(
                1,
                vec![
                    row(1, Some(value(POST_1, "a"))),
                    row(2, Some(value(POST_2, "b")))
                ]
            ),
            NOW_MS,
        )
        .await
        .unwrap_err(),
        "Source import could not be started"
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn recovery_fails_interrupted_batches_but_skips_active_campaigns() {
    let f = fixture().await;
    seed(
        &f.pool,
        "INSERT INTO source_import_batches (id,campaign_id,source_type,status,total_count) VALUES (9,1,'local_json','processing',2);
         INSERT INTO source_import_items (source_import_batch_id,row_number,status,input_json) VALUES (9,1,'accepted','{}'),(9,2,'pending','{}');",
    )
    .await;
    let activity = SourceImportActivity::default();
    {
        let _running = activity.start(1);
        let skipped = recover_interrupted(
            &f.pool,
            &activity,
            RecoverSourceImportsInput { campaign_id: 1 },
        )
        .await
        .unwrap();
        assert_eq!(skipped.recovered, 0);
    }
    let recovered = recover_interrupted(
        &f.pool,
        &activity,
        RecoverSourceImportsInput { campaign_id: 1 },
    )
    .await
    .unwrap();
    assert_eq!(recovered.recovered, 1);
    assert_eq!(
        text(&f.pool, "SELECT status||'|'||accepted_count||'|'||rejected_count||'|'||error_message FROM source_import_batches WHERE id=9").await,
        "failed|1|1|Import stopped because the previous app session ended before processing finished."
    );
    assert_eq!(
        items(&f, 9).await[1],
        "2|rejected|Not processed because the previous app session ended before the import finished.|"
    );
}

#[tokio::test]
async fn concurrent_batches_with_the_same_post_create_one_candidate() {
    let f = fixture().await;
    let activity = SourceImportActivity::default();
    let (a, b) = tokio::join!(
        write_batch(
            &f.pool,
            &activity,
            batch(1, vec![row(1, Some(value(POST_1, "same")))]),
            NOW_MS
        ),
        write_batch(
            &f.pool,
            &activity,
            batch(1, vec![row(1, Some(value(POST_1, "same")))]),
            NOW_MS
        )
    );
    let (a, b) = (a.unwrap(), b.unwrap());
    assert_eq!(a.accepted_count + b.accepted_count, 1);
    assert_eq!(a.duplicate_count + b.duplicate_count, 1);
    assert_eq!(count(&f.pool, "candidate_posts").await, 1);
    assert!(!activity.is_active(1));
}
