use super::*;
use crate::test_support::{count, fail_on, migrated, number, seed, snapshot, text, Fixture};

const TABLES: &[&str] = &[
    "comment_threads",
    "comment_variants",
    "comment_audits",
    "rate_limit_events",
];
const GOOD: &str = "We cut onboarding time by 30% after trying exactly this approach.";
const URN: &str = "urn:li:activity:123";

/// Campaign 1 active (limit 5), campaign 2 archived.
/// Candidate 1 shortlisted, 2 new, 3 in archived campaign, 4 shortlisted.
/// Thread 10 approved with selected variant 100 on candidate 4.
async fn fixture() -> Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        &format!(
            "INSERT INTO campaigns (id,name,status,daily_post_limit,daily_comment_limit) VALUES (1,'Live','active',5,5),(2,'Old','archived',5,5);
             INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES
               (1,'https://www.linkedin.com/feed/update/urn:li:activity:1/','u1','a','h1'),
               (2,'https://e.com/2','u2','b','h2'),
               (3,'https://e.com/3','u3','c','h3'),
               (4,'https://www.linkedin.com/posts/x-activity-123-abc','u4','d','h4');
             INSERT INTO candidate_posts (id,campaign_id,target_post_id,status) VALUES
               (1,1,1,'shortlisted'),(2,1,2,'new'),(3,2,3,'shortlisted'),(4,1,4,'shortlisted');
             INSERT INTO comment_threads (id,campaign_id,candidate_post_id,status) VALUES (10,1,4,'approved');
             INSERT INTO comment_variants (id,comment_thread_id,variant_number,body,status) VALUES
               (100,10,1,'{GOOD}','selected'),(101,10,2,'Other','draft');"
        ),
    )
    .await;
    f
}

fn create(candidate_id: i64, bodies: &[&str]) -> CreateCommentThreadInput {
    CreateCommentThreadInput {
        candidate_id,
        operator_notes: " note ".to_string(),
        variants: bodies
            .iter()
            .map(|b| VariantBodyInput {
                body: b.to_string(),
            })
            .collect(),
    }
}

fn thread_status(id: i64, status: &str) -> SetCommentThreadStatusInput {
    SetCommentThreadStatusInput {
        id,
        status: status.to_string(),
        reviewer_notes: None,
    }
}

fn variant_status(id: i64, status: &str) -> SetCommentVariantStatusInput {
    SetCommentVariantStatusInput {
        id,
        status: status.to_string(),
    }
}

fn preflight() -> CommentPublishPreflightInput {
    CommentPublishPreflightInput {
        comment_thread_id: 10,
        commentary: escape_linkedin_little_text(GOOD),
        target_urn: URN.to_string(),
        idempotency_key: "comment-thread:10:linkedin:manual".to_string(),
    }
}

#[test]
fn inputs_reject_unknown_fields() {
    assert!(serde_json::from_value::<SetCommentThreadStatusInput>(
        serde_json::json!({"id":1,"status":"approved","approvedAt":"x"})
    )
    .is_err());
    assert!(
        serde_json::from_value::<CreateCommentThreadInput>(serde_json::json!({
            "candidateId":1,"variants":[{"body":"x","severity":"pass"}]
        }))
        .is_err()
    );
}

#[tokio::test]
async fn create_writes_thread_variants_and_native_audits() {
    let f = fixture().await;
    let id = create_thread(&f.pool, create(1, &[GOOD, "Great post! www.x.com"]))
        .await
        .unwrap()
        .id;
    assert_eq!(
        text(&f.pool, &format!("SELECT campaign_id||'|'||status||'|'||operator_notes FROM comment_threads WHERE id={id}")).await,
        "1|drafting|note"
    );
    assert_eq!(
        number(
            &f.pool,
            &format!("SELECT COUNT(*) FROM comment_variants WHERE comment_thread_id={id}")
        )
        .await,
        2
    );
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT group_concat(severity||':'||rule_key, ',') FROM (SELECT ca.severity, ca.rule_key FROM comment_audits ca JOIN comment_variants cv ON cv.id=ca.comment_variant_id WHERE cv.comment_thread_id={id} AND cv.variant_number=2 ORDER BY ca.id)")
        )
        .await,
        "block:external_link,warning:generic_reply,warning:specificity,pass:comment_length,pass:hashtag_limit,pass:required_text"
    );
}

#[tokio::test]
async fn create_rejections_write_nothing() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    for (input, expected) in [
        (create(99, &[GOOD]), "Candidate was not found"),
        (create(3, &[GOOD]), "Campaign is archived"),
        (
            create(2, &[GOOD]),
            "Only shortlisted or drafted candidates can become comments",
        ),
        (create(4, &[GOOD]), "Candidate already has a comment thread"),
        (create(1, &[]), "Add one to three comment variants"),
        (
            create(1, &[GOOD, GOOD, GOOD, GOOD]),
            "Add one to three comment variants",
        ),
        (create(1, &["  "]), "Comment text is required"),
    ] {
        assert_eq!(create_thread(&f.pool, input).await.unwrap_err(), expected);
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn create_rolls_back_thread_when_audit_insert_fails() {
    let f = fixture().await;
    fail_on(&f.pool, "BEFORE INSERT ON comment_audits").await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        create_thread(&f.pool, create(1, &[GOOD]))
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn concurrent_creates_for_one_candidate_have_one_winner() {
    let f = fixture().await;
    let (a, b) = tokio::join!(
        create_thread(&f.pool, create(1, &[GOOD])),
        create_thread(&f.pool, create(1, &[GOOD]))
    );
    assert_eq!([a.is_ok(), b.is_ok()].iter().filter(|ok| **ok).count(), 1);
    assert_eq!(
        number(
            &f.pool,
            "SELECT COUNT(*) FROM comment_threads WHERE candidate_post_id=1"
        )
        .await,
        1
    );
}

#[tokio::test]
async fn update_thread_sets_only_given_notes() {
    let f = fixture().await;
    update_thread(
        &f.pool,
        UpdateCommentThreadInput {
            id: 10,
            operator_notes: None,
            reviewer_notes: Some(" ok ".to_string()),
        },
    )
    .await
    .unwrap();
    assert_eq!(
        text(
            &f.pool,
            "SELECT operator_notes||'|'||reviewer_notes FROM comment_threads WHERE id=10"
        )
        .await,
        "|ok"
    );
    assert_eq!(
        update_thread(
            &f.pool,
            UpdateCommentThreadInput {
                id: 99,
                operator_notes: Some("x".to_string()),
                reviewer_notes: None
            }
        )
        .await
        .unwrap_err(),
        "Comment thread was not found"
    );
}

#[tokio::test]
async fn editing_variant_reaudits_and_requests_changes() {
    let f = fixture().await;
    update_variant(
        &f.pool,
        UpdateCommentVariantInput {
            id: 100,
            body: Some("see https://x.com".to_string()),
        },
    )
    .await
    .unwrap();
    assert_eq!(
        text(&f.pool, "SELECT status FROM comment_threads WHERE id=10").await,
        "changes_requested"
    );
    assert_eq!(
        number(&f.pool, "SELECT COUNT(*) FROM comment_audits WHERE comment_variant_id=100 AND severity='block' AND rule_key='external_link'").await,
        1
    );
}

#[tokio::test]
async fn variant_edit_rolls_back_when_reaudit_fails() {
    let f = fixture().await;
    create_thread(&f.pool, create(1, &[GOOD])).await.unwrap();
    let variant: i64 = number(&f.pool, "SELECT MAX(id) FROM comment_variants").await;
    fail_on(&f.pool, "BEFORE INSERT ON comment_audits").await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        update_variant(
            &f.pool,
            UpdateCommentVariantInput {
                id: variant,
                body: Some("changed text".to_string())
            }
        )
        .await
        .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn selecting_variant_clears_others_and_blocks_blocked_variants() {
    let f = fixture().await;
    set_variant_status(&f.pool, variant_status(101, "selected"))
        .await
        .unwrap();
    assert_eq!(
        text(&f.pool, "SELECT group_concat(id||':'||status, ',') FROM (SELECT id,status FROM comment_variants WHERE comment_thread_id=10 ORDER BY id)").await,
        "100:draft,101:selected"
    );
    assert_eq!(
        text(&f.pool, "SELECT status FROM comment_threads WHERE id=10").await,
        "changes_requested"
    );
    seed(
        &f.pool,
        "INSERT INTO comment_audits (comment_variant_id,rule_key,severity,message) VALUES (100,'external_link','block','x');",
    )
    .await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        set_variant_status(&f.pool, variant_status(100, "selected"))
            .await
            .unwrap_err(),
        "Blocked comment variants cannot be selected"
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn thread_status_rules_match_renderer() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    for (input, expected) in [
        (
            thread_status(10, "posted"),
            "Use record posted to move comments to posted",
        ),
        (
            thread_status(10, "approved"),
            "Only comments needing review can be approved",
        ),
        (
            thread_status(10, "changes_requested"),
            "Only comments needing review can request changes",
        ),
        (
            thread_status(10, "bogus"),
            "Unsupported comment thread status",
        ),
    ] {
        assert_eq!(
            set_thread_status(&f.pool, input).await.unwrap_err(),
            expected
        );
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
    set_thread_status(
        &f.pool,
        SetCommentThreadStatusInput {
            id: 10,
            status: "rejected".to_string(),
            reviewer_notes: Some("no".to_string()),
        },
    )
    .await
    .unwrap();
    assert_eq!(
        text(&f.pool, "SELECT status||'|'||reviewer_notes||'|'||(rejected_at IS NOT NULL) FROM comment_threads WHERE id=10").await,
        "rejected|no|1"
    );
    assert_eq!(
        set_thread_status(&f.pool, thread_status(10, "drafting"))
            .await
            .unwrap_err(),
        "Terminal comment threads cannot change status"
    );
}

#[tokio::test]
async fn review_requires_one_ready_selected_variant() {
    let f = fixture().await;
    seed(
        &f.pool,
        "UPDATE comment_variants SET status='draft' WHERE id=100;",
    )
    .await;
    assert_eq!(
        set_thread_status(&f.pool, thread_status(10, "needs_review"))
            .await
            .unwrap_err(),
        "Choose one comment variant before review"
    );
    seed(&f.pool, "UPDATE comment_variants SET status='selected';").await;
    assert_eq!(
        set_thread_status(&f.pool, thread_status(10, "needs_review"))
            .await
            .unwrap_err(),
        "Choose exactly one selected comment variant"
    );
}

#[tokio::test]
async fn publish_gate_accepts_matching_request_without_writes() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_path(&f, preflight(), Ok(())).await;
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

async fn assert_path(f: &Fixture, input: CommentPublishPreflightInput, expected: Result<(), &str>) {
    assert_eq!(
        assert_can_publish(&f.pool, input).await,
        expected.map_err(str::to_string)
    );
}

#[tokio::test]
async fn publish_gate_rejects_mismatches_without_writes() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    let mut commentary = preflight();
    commentary.commentary = "edited".to_string();
    let mut urn = preflight();
    urn.target_urn = "urn:li:activity:999".to_string();
    let mut key = preflight();
    key.idempotency_key = "comment-thread:11:linkedin:manual".to_string();
    assert_path(
        &f,
        commentary,
        Err("Commentary does not match the approved comment variant"),
    )
    .await;
    assert_path(
        &f,
        urn,
        Err("LinkedIn target URN does not match the comment target"),
    )
    .await;
    assert_path(
        &f,
        key,
        Err("Comment idempotency key does not match thread state"),
    )
    .await;
    seed(&f.pool, "INSERT INTO comment_attempts (comment_thread_id,status,platform_comment_id) VALUES (10,'succeeded','c');").await;
    let before_with_attempt = snapshot(&f.pool, TABLES).await;
    assert_path(
        &f,
        preflight(),
        Err("Comment thread already has a successful posting attempt"),
    )
    .await;
    assert_eq!(snapshot(&f.pool, TABLES).await, before_with_attempt);
    assert_eq!(
        before, before_with_attempt,
        "attempt table is not snapshotted"
    );
}

#[tokio::test]
async fn publish_gate_commits_blocked_rate_limit_event_for_kill_switch_and_limit() {
    let f = fixture().await;
    seed(&f.pool, "INSERT OR REPLACE INTO safety_settings (id,global_kill_switch,kill_switch_reason) VALUES (1,1,'Incident');").await;
    assert_path(
        &f,
        preflight(),
        Err("Global kill switch is enabled: Incident"),
    )
    .await;
    assert_eq!(
        text(
            &f.pool,
            "SELECT decision||'|'||summary FROM rate_limit_events"
        )
        .await,
        "blocked|Comment posting blocked by global kill switch: Incident"
    );
    seed(&f.pool, "UPDATE safety_settings SET global_kill_switch=0; UPDATE campaigns SET daily_comment_limit=0 WHERE id=1;").await;
    let result = assert_can_publish(&f.pool, preflight()).await.unwrap_err();
    assert!(
        result.starts_with("Daily comment limit reached"),
        "{result}"
    );
    assert_eq!(count(&f.pool, "rate_limit_events").await, 2);
}

#[tokio::test]
async fn publish_gate_rejects_unapproved_and_archived_threads() {
    let f = fixture().await;
    seed(
        &f.pool,
        "UPDATE comment_threads SET status='needs_review' WHERE id=10;",
    )
    .await;
    assert_path(
        &f,
        preflight(),
        Err("Only approved comments can publish via LinkedIn"),
    )
    .await;
    seed(
        &f.pool,
        "UPDATE campaigns SET status='archived' WHERE id=1;",
    )
    .await;
    assert_path(&f, preflight(), Err("Campaign is archived")).await;
    let mut missing = preflight();
    missing.comment_thread_id = 99;
    assert_path(&f, missing, Err("Comment thread was not found")).await;
}
