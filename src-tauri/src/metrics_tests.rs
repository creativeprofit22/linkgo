use super::*;
use crate::test_support::{count, fail_on, migrated, number, seed, snapshot, text, Fixture};

const TABLES: &[&str] = &["post_metrics", "campaign_memory", "learning_events"];

/// Seeds two campaigns with a published approval each (campaign 2 archived)
/// plus one needs_review approval. Approval readiness triggers are dropped:
/// metrics only reads approval status/ownership, and the readiness chain is
/// covered by the approval tests.
async fn fixture() -> Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        "DROP TRIGGER IF EXISTS approvals_validate_insert;
         DROP TRIGGER IF EXISTS approvals_bind_insert;
         INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Old','archived',5);
         INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES
           (1,'https://e.com/1','https://e.com/1','a','h1'),(2,'https://e.com/2','https://e.com/2','b','h2'),(3,'https://e.com/3','https://e.com/3','c','h3');
         INSERT INTO candidate_posts (id,campaign_id,target_post_id) VALUES (1,1,1),(2,2,2),(3,1,3);
         INSERT INTO drafts (id,campaign_id,candidate_post_id,status) VALUES (1,1,1,'ready_for_review'),(2,2,2,'ready_for_review'),(3,1,3,'ready_for_review');
         INSERT INTO draft_variants (id,draft_id,variant_number,hook,body,status) VALUES (1,1,1,'h','b','selected'),(2,2,1,'h','b','selected'),(3,3,1,'h','b','selected');
         INSERT INTO approvals (id,campaign_id,draft_id,draft_variant_id,status) VALUES (1,1,1,1,'published'),(2,2,2,2,'published'),(3,1,3,3,'needs_review');
         INSERT INTO publish_attempts (id,approval_id,status,created_at) VALUES
           (1,1,'succeeded','2026-01-01 00:00:00'),(2,1,'succeeded','2026-02-01 00:00:00'),(3,1,'failed','2026-03-01 00:00:00'),(4,2,'succeeded','2026-01-01 00:00:00');
         INSERT INTO post_metrics (id,campaign_id,approval_id,publish_attempt_id,measured_at) VALUES (1,1,1,1,'2026-01-02T00:00');
         INSERT INTO campaign_memory (id,campaign_id,signal,summary) VALUES (1,1,'insight','Keep'),(2,2,'winner','Old');",
    )
    .await;
    f
}

fn metric(campaign_id: i64, approval_id: i64, attempt: Option<i64>) -> RecordPostMetricInput {
    RecordPostMetricInput {
        campaign_id,
        approval_id,
        publish_attempt_id: attempt,
        measured_at: " 2026-09-23T10:30 ".to_string(),
        impressions: 100,
        reactions: 5,
        comments: 2,
        reposts: 1,
        profile_visits: 3,
        link_clicks: 4,
        ctr: Some(4.0),
        notes: " good ".to_string(),
    }
}

fn memory(campaign_id: i64, post_metric_id: Option<i64>) -> CreateCampaignMemoryInput {
    CreateCampaignMemoryInput {
        campaign_id,
        post_metric_id,
        signal: "winner".to_string(),
        summary: " Hooks with numbers ".to_string(),
        evidence: "".to_string(),
        confidence: 70,
    }
}

fn memory_status(id: i64, status: &str) -> SetCampaignMemoryStatusInput {
    SetCampaignMemoryStatusInput {
        id,
        status: status.to_string(),
    }
}

#[test]
fn inputs_reject_unknown_fields() {
    assert!(serde_json::from_value::<SetCampaignMemoryStatusInput>(
        serde_json::json!({"id":1,"status":"archived","campaignId":1})
    )
    .is_err());
}

#[tokio::test]
async fn records_metric_against_latest_successful_attempt_with_learning_event() {
    let f = fixture().await;
    let id = record_post_metric(&f.pool, metric(1, 1, None))
        .await
        .unwrap()
        .id;
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT publish_attempt_id||'|'||measured_at||'|'||notes||'|'||collection_source||'|'||ctr FROM post_metrics WHERE id={id}")
        )
        .await,
        "2|2026-09-23T10:30|good|manual|4.0"
    );
    assert_eq!(
        text(
            &f.pool,
            "SELECT campaign_id||'|'||post_metric_id||'|'||COALESCE(campaign_memory_id,'null')||'|'||event_type||'|'||summary FROM learning_events"
        )
        .await,
        format!("1|{id}|null|metric_recorded|Metric snapshot recorded for approval #1")
    );
    // Explicit attempt is honoured.
    let explicit = record_post_metric(&f.pool, metric(1, 1, Some(1)))
        .await
        .unwrap()
        .id;
    assert_eq!(
        number(
            &f.pool,
            &format!("SELECT publish_attempt_id FROM post_metrics WHERE id={explicit}")
        )
        .await,
        1
    );
}

#[tokio::test]
async fn metric_ownership_and_validation_rejections_write_nothing() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    let mut bad_count = metric(1, 1, None);
    bad_count.impressions = -1;
    let mut bad_ctr = metric(1, 1, None);
    bad_ctr.ctr = Some(100.5);
    let mut empty_time = metric(1, 1, None);
    empty_time.measured_at = "  ".to_string();
    for (input, expected) in [
        (metric(1, 99, None), "Approval was not found"),
        (
            metric(2, 1, None),
            "Approval does not belong to this campaign",
        ),
        (metric(2, 2, None), "Campaign is archived"),
        (
            metric(1, 3, None),
            "Only published approvals can record metrics",
        ),
        (
            metric(1, 1, Some(3)),
            "Published approval needs a successful publish attempt",
        ),
        (
            metric(1, 1, Some(4)),
            "Published approval needs a successful publish attempt",
        ),
        (bad_count, "Impressions must be between 0 and 1000000000"),
        (bad_ctr, "CTR must be between 0 and 100"),
        (empty_time, "Measured time must be a valid date"),
    ] {
        assert_eq!(
            record_post_metric(&f.pool, input).await.unwrap_err(),
            expected
        );
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn metric_rolls_back_when_learning_event_fails() {
    let f = fixture().await;
    fail_on(&f.pool, "BEFORE INSERT ON learning_events").await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        record_post_metric(&f.pool, metric(1, 1, None))
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn creates_memory_with_metric_link_and_learning_event() {
    let f = fixture().await;
    let id = create_campaign_memory(&f.pool, memory(1, Some(1)))
        .await
        .unwrap()
        .id;
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT post_metric_id||'|'||signal||'|'||summary||'|'||confidence||'|'||status FROM campaign_memory WHERE id={id}")
        )
        .await,
        "1|winner|Hooks with numbers|70|active"
    );
    assert_eq!(
        text(
            &f.pool,
            "SELECT post_metric_id||'|'||campaign_memory_id||'|'||event_type||'|'||summary FROM learning_events"
        )
        .await,
        format!("1|{id}|memory_created|Campaign memory created: Hooks with numbers")
    );
}

#[tokio::test]
async fn memory_rejections_write_nothing() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    let mut blank = memory(1, None);
    blank.summary = " ".to_string();
    let mut bad_signal = memory(1, None);
    bad_signal.signal = "loser".to_string();
    for (input, expected) in [
        (memory(99, None), "Campaign was not found"),
        (memory(2, None), "Campaign is archived"),
        (memory(1, Some(99)), "Post metric was not found"),
        (blank, "Summary is required"),
        (bad_signal, "Unsupported memory signal"),
    ] {
        assert_eq!(
            create_campaign_memory(&f.pool, input).await.unwrap_err(),
            expected
        );
    }
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (3,'Other','active',5);",
    )
    .await;
    assert_eq!(
        create_campaign_memory(&f.pool, memory(3, Some(1)))
            .await
            .unwrap_err(),
        "Post metric does not belong to this campaign"
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn memory_status_archives_and_restores_with_events() {
    let f = fixture().await;
    set_campaign_memory_status(&f.pool, memory_status(1, "archived"))
        .await
        .unwrap();
    set_campaign_memory_status(&f.pool, memory_status(1, "active"))
        .await
        .unwrap();
    assert_eq!(
        text(
            &f.pool,
            "SELECT group_concat(event_type||':'||summary, ';') FROM (SELECT * FROM learning_events ORDER BY id)"
        )
        .await,
        "memory_archived:Campaign memory archived;memory_restored:Campaign memory restored"
    );
    assert_eq!(
        text(&f.pool, "SELECT status FROM campaign_memory WHERE id=1").await,
        "active"
    );
}

#[tokio::test]
async fn memory_status_rejections_and_rollback() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    for (input, expected) in [
        (
            memory_status(99, "archived"),
            "Campaign memory was not found",
        ),
        (memory_status(2, "archived"), "Campaign is archived"),
        (
            memory_status(1, "deleted"),
            "Unsupported campaign memory status",
        ),
    ] {
        assert_eq!(
            set_campaign_memory_status(&f.pool, input)
                .await
                .unwrap_err(),
            expected
        );
    }
    fail_on(&f.pool, "BEFORE INSERT ON learning_events").await;
    assert_eq!(
        set_campaign_memory_status(&f.pool, memory_status(1, "archived"))
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn concurrent_metric_writes_each_get_one_learning_event() {
    let f = fixture().await;
    let (a, b) = tokio::join!(
        record_post_metric(&f.pool, metric(1, 1, None)),
        create_campaign_memory(&f.pool, memory(1, Some(1)))
    );
    a.unwrap();
    b.unwrap();
    assert_eq!(count(&f.pool, "learning_events").await, 2);
    assert_eq!(count(&f.pool, "post_metrics").await, 2);
    assert_eq!(count(&f.pool, "campaign_memory").await, 3);
}
