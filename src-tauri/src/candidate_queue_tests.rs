use super::*;
use crate::test_support::{count, fail_on, migrated, number, seed, snapshot, text, Fixture};

const TABLES: &[&str] = &[
    "target_posts",
    "candidate_posts",
    "dedupe_keys",
    "candidate_discovery_items",
    "campaign_keywords",
    "draft_generation_requests",
    "agent_runs",
    "agent_run_events",
    "workflow_runs",
    "workflow_steps",
    "workflow_events",
];

async fn fixture() -> Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Old','archived',5);
         INSERT INTO candidate_discovery_items (id,campaign_id,kind,keyword) VALUES
           (1,1,'keyword','  ai ops  '),(2,1,'trend',''),(3,2,'keyword','x');",
    )
    .await;
    f
}

fn input(campaign_id: i64, url: &str, content: &str) -> CreateCandidateInput {
    CreateCandidateInput {
        campaign_id,
        url: url.to_string(),
        content: content.to_string(),
        author_name: " Ada ".to_string(),
        author_profile_url: String::new(),
        posted_at: None,
        platform_resource_urn: String::new(),
        source_keyword: String::new(),
        relevance_score: Some(70),
        score_reason: String::new(),
        notes: String::new(),
    }
}

const POST: &str = "https://www.linkedin.com/feed/update/urn:li:activity:42/";

#[test]
fn content_hash_matches_renderer_fnv1a_over_utf16() {
    // Reference values from the renderer createContentHash.
    assert_eq!(content_hash(""), "811c9dc5");
    assert_eq!(content_hash("a"), "e40c292c");
    assert_eq!(
        content_hash("  hello \n  world "),
        content_hash("hello world")
    );
    // Astral chars hash as two UTF-16 units, so they differ from the scalar.
    assert_ne!(content_hash("😀"), content_hash("\u{F600}"));
}

#[test]
fn inputs_reject_unknown_fields() {
    assert!(serde_json::from_value::<DeleteCandidateInput>(
        serde_json::json!({"id":1,"force":true})
    )
    .is_err());
}

#[tokio::test]
async fn create_inserts_target_candidate_and_both_dedupe_keys() {
    let f = fixture().await;
    let id = create_candidate(&f.pool, input(1, POST, "Hello   world"))
        .await
        .unwrap()
        .id;
    assert_eq!(
        text(
            &f.pool,
            "SELECT author_name||'|'||platform_resource_urn||'|'||content_hash FROM target_posts"
        )
        .await,
        format!("Ada|urn:li:activity:42|{}", content_hash("Hello world"))
    );
    assert_eq!(
        text(&f.pool, &format!("SELECT group_concat(key_type, ',') FROM (SELECT key_type FROM dedupe_keys WHERE candidate_post_id={id} ORDER BY id)")).await,
        "normalized_url,content_hash"
    );
}

#[tokio::test]
async fn duplicate_url_or_content_is_rejected_without_writes() {
    let f = fixture().await;
    create_candidate(&f.pool, input(1, POST, "first"))
        .await
        .unwrap();
    let before = snapshot(&f.pool, TABLES).await;
    for candidate in [
        input(1, POST, "other"),
        input(1, "https://x.com/2", "first"),
    ] {
        assert_eq!(
            create_candidate(&f.pool, candidate).await.unwrap_err(),
            DUPLICATE_CANDIDATE_MESSAGE
        );
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
    // Same post in another campaign reuses the target row.
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (3,'B','active',5);",
    )
    .await;
    create_candidate(&f.pool, input(3, POST, "first"))
        .await
        .unwrap();
    assert_eq!(count(&f.pool, "target_posts").await, 1);
}

#[tokio::test]
async fn create_rejections_write_nothing() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    let mut bad_score = input(1, POST, "x");
    bad_score.relevance_score = Some(101);
    for (candidate, expected) in [
        (input(99, POST, "x"), "Campaign was not found"),
        (input(2, POST, "x"), "Campaign is archived"),
        (input(1, " ", "x"), "LinkedIn post URL is required"),
        (input(1, POST, "  "), "Post text is required"),
        (bad_score, "Relevance score must be between 0 and 100"),
    ] {
        assert_eq!(
            create_candidate(&f.pool, candidate).await.unwrap_err(),
            expected
        );
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn create_rolls_back_target_and_candidate_when_dedupe_insert_fails() {
    let f = fixture().await;
    fail_on(
        &f.pool,
        "BEFORE INSERT ON dedupe_keys WHEN NEW.key_type = 'content_hash'",
    )
    .await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        create_candidate(&f.pool, input(1, POST, "x"))
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn concurrent_duplicate_creates_have_one_winner() {
    let f = fixture().await;
    let (a, b) = tokio::join!(
        create_candidate(&f.pool, input(1, POST, "same")),
        create_candidate(&f.pool, input(1, POST, "same"))
    );
    assert_eq!([a.is_ok(), b.is_ok()].iter().filter(|ok| **ok).count(), 1);
    assert_eq!(count(&f.pool, "candidate_posts").await, 1);
    assert_eq!(count(&f.pool, "dedupe_keys").await, 2);
}

async fn seed_linked_request(f: &Fixture, run_status: &str, step_status: &str) -> i64 {
    let candidate = create_candidate(&f.pool, input(1, POST, "linked"))
        .await
        .unwrap()
        .id;
    seed(
        &f.pool,
        &format!(
            "INSERT INTO workflow_runs (id,campaign_id,title,status,current_step_key) VALUES (5,1,'Run','{run_status}','draft');
             INSERT INTO workflow_steps (id,workflow_run_id,step_key,title,sort_order,status) VALUES (6,5,'draft','Draft',3,'{step_status}');
             INSERT INTO agent_runs (id,campaign_id,agent_role,status) VALUES (7,1,'drafter','running');
             INSERT INTO draft_generation_requests (id,campaign_id,candidate_post_id,agent_run_id,provider_key,variant_count,status,workflow_run_id,workflow_step_id)
               VALUES (8,1,{candidate},7,'openai',3,'pending',5,6);"
        ),
    )
    .await;
    candidate
}

#[tokio::test]
async fn delete_settles_linked_draft_request_and_blocks_workflow() {
    let f = fixture().await;
    let candidate = seed_linked_request(&f, "running", "running").await;
    delete_candidate(&f.pool, DeleteCandidateInput { id: candidate })
        .await
        .unwrap();
    assert_eq!(count(&f.pool, "candidate_posts").await, 0);
    assert_eq!(count(&f.pool, "dedupe_keys").await, 0);
    assert_eq!(
        text(&f.pool, "SELECT status FROM agent_runs WHERE id=7").await,
        "cancelled"
    );
    assert_eq!(
        number(&f.pool, "SELECT COUNT(*) FROM agent_run_events WHERE agent_run_id=7 AND event_type='run_cancelled'").await,
        1
    );
    // The request is dismissed, then removed by the candidate FK cascade.
    assert_eq!(count(&f.pool, "draft_generation_requests").await, 0);
    assert_eq!(
        text(&f.pool, "SELECT (SELECT status FROM workflow_steps WHERE id=6)||'|'||(SELECT status FROM workflow_runs WHERE id=5)").await,
        "blocked|blocked"
    );
    assert_eq!(
        number(&f.pool, "SELECT COUNT(*) FROM workflow_events WHERE workflow_run_id=5 AND event_type='step_blocked'").await,
        1
    );
}

#[tokio::test]
async fn delete_rejects_request_without_active_draft_step() {
    let f = fixture().await;
    let candidate = seed_linked_request(&f, "completed", "completed").await;
    let before = snapshot(&f.pool, TABLES).await;
    let error = delete_candidate(&f.pool, DeleteCandidateInput { id: candidate })
        .await
        .unwrap_err();
    assert!(
        error.contains("linked draft request #8 is not attached"),
        "{error}"
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn delete_rolls_back_settlement_when_workflow_event_fails() {
    let f = fixture().await;
    let candidate = seed_linked_request(&f, "running", "running").await;
    fail_on(&f.pool, "BEFORE INSERT ON workflow_events").await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        delete_candidate(&f.pool, DeleteCandidateInput { id: candidate })
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn delete_missing_candidate_is_rejected() {
    let f = fixture().await;
    assert_eq!(
        delete_candidate(&f.pool, DeleteCandidateInput { id: 99 })
            .await
            .unwrap_err(),
        "Candidate was not found"
    );
}

#[tokio::test]
async fn promote_keyword_adds_trimmed_keyword_once() {
    let f = fixture().await;
    let promote = |id| PromoteDiscoveryItemInput { id, campaign_id: 1 };
    promote_discovery_item(&f.pool, promote(1)).await.unwrap();
    promote_discovery_item(&f.pool, promote(1)).await.unwrap();
    promote_discovery_item(&f.pool, promote(2)).await.unwrap();
    assert_eq!(
        text(&f.pool, "SELECT group_concat(keyword||':'||source, ',') FROM campaign_keywords WHERE campaign_id=1").await,
        "ai ops:generated"
    );
    assert_eq!(
        number(
            &f.pool,
            "SELECT COUNT(*) FROM candidate_discovery_items WHERE status='promoted'"
        )
        .await,
        2
    );
}

#[tokio::test]
async fn promote_rejections_write_nothing() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    for (id, campaign_id, expected) in [
        (1, 99, "Campaign was not found"),
        (3, 2, "Campaign is archived"),
        (3, 1, "Discovery suggestion was not found"),
        (99, 1, "Discovery suggestion was not found"),
    ] {
        assert_eq!(
            promote_discovery_item(&f.pool, PromoteDiscoveryItemInput { id, campaign_id })
                .await
                .unwrap_err(),
            expected
        );
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}
