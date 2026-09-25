use super::*;
use crate::metrics::{
    create_campaign_memory, record_post_metric, CreateCampaignMemoryInput, RecordPostMetricInput,
};
use crate::test_support::{migrated, seed, Fixture};

/// Mirrors `metrics_tests.rs`: approval readiness triggers are dropped so the
/// fixture can seed published approvals directly.
async fn fixture() -> Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        "DROP TRIGGER IF EXISTS approvals_validate_insert;
         DROP TRIGGER IF EXISTS approvals_bind_insert;
         INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Old','archived',5),(3,'Other','active',5);
         INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES
           (1,'https://e.com/1','https://e.com/1','a','h1'),(2,'https://e.com/2','https://e.com/2','b','h2'),(3,'https://e.com/3','https://e.com/3','c','h3');
         INSERT INTO candidate_posts (id,campaign_id,target_post_id) VALUES (1,1,1),(2,2,2),(3,3,3);
         INSERT INTO drafts (id,campaign_id,candidate_post_id,status) VALUES (1,1,1,'ready_for_review'),(2,2,2,'ready_for_review'),(3,3,3,'ready_for_review');
         INSERT INTO draft_variants (id,draft_id,variant_number,hook,body,status) VALUES (1,1,1,'h','b','selected'),(2,2,1,'h','b','selected'),(3,3,1,'h','b','selected');
         INSERT INTO approvals (id,campaign_id,draft_id,draft_variant_id,status) VALUES (1,1,1,1,'published'),(2,2,2,2,'published'),(3,3,3,3,'published');
         INSERT INTO publish_attempts (id,approval_id,status,created_at) VALUES
           (1,1,'succeeded','2026-01-01 00:00:00'),(2,1,'succeeded','2026-02-01 00:00:00'),(3,2,'succeeded','2026-01-01 00:00:00'),(4,3,'succeeded','2026-03-01 00:00:00');
         INSERT INTO post_metrics (id,campaign_id,approval_id,publish_attempt_id,measured_at,ctr) VALUES
           (1,1,1,1,'2026-01-02T00:00',2.5),(2,3,3,4,'2026-03-02T00:00',NULL);
         INSERT INTO campaign_memory (id,campaign_id,signal,summary,status,updated_at) VALUES
           (1,1,'insight','Keep','archived','2026-01-03 00:00:00'),(2,1,'winner','Win','active','2026-01-01 00:00:00'),(3,3,'avoid','No','active','2026-01-01 00:00:00');
         INSERT INTO learning_events (campaign_id,event_type,summary) VALUES (1,'metric_recorded','a'),(3,'memory_created','b');
         INSERT INTO metric_refresh_jobs (id,campaign_id,approval_id,target_urn,status,next_refresh_at) VALUES
           (1,1,1,'urn:1','active','2000-01-01 00:00:00'),(2,2,2,'urn:2','failed','2000-01-01 00:00:00'),(3,3,3,'urn:3','unavailable','2999-01-01 00:00:00');
         INSERT INTO metric_refresh_events (campaign_id,event_type,severity,summary) VALUES (1,'refresh_started','info','s'),(3,'refresh_failed','error','f');",
    )
    .await;
    f
}

fn all() -> MetricsListInput {
    MetricsListInput::default()
}

fn campaign(id: i64) -> MetricsListInput {
    MetricsListInput {
        campaign_id: Some(id),
    }
}

fn ids(rows: &[Value], key: &str) -> Vec<i64> {
    rows.iter().map(|row| row[key].as_i64().unwrap()).collect()
}

#[test]
fn input_rejects_unknown_fields() {
    assert!(serde_json::from_value::<MetricsListInput>(
        serde_json::json!({ "campaignId": 1, "extra": 1 })
    )
    .is_err());
}

#[tokio::test]
async fn invalid_campaign_is_rejected_by_every_read() {
    let f = migrated().await;
    assert!(list_eligible_approvals(&f.pool, campaign(0)).await.is_err());
    assert!(list_post_metrics(&f.pool, campaign(-1)).await.is_err());
    assert!(list_campaign_memory(&f.pool, campaign(0)).await.is_err());
    assert!(list_learning_events(&f.pool, campaign(0)).await.is_err());
    assert!(refresh_dashboard(&f.pool, campaign(0)).await.is_err());
}

#[tokio::test]
async fn eligible_uses_latest_success_and_skips_archived() {
    let f = fixture().await;
    let rows = list_eligible_approvals(&f.pool, all()).await.unwrap();
    // Newest publish first; approval 2 is in an archived campaign.
    assert_eq!(ids(&rows, "approval_id"), vec![3, 1]);
    assert_eq!(rows[1]["publish_attempt_id"], 2);
    assert_eq!(rows[1]["campaign_name"], "Live");
    let one = list_eligible_approvals(&f.pool, campaign(1)).await.unwrap();
    assert_eq!(ids(&one, "approval_id"), vec![1]);
}

#[tokio::test]
async fn post_metrics_memory_and_events_are_filtered_and_ordered() {
    let f = fixture().await;
    let metrics = list_post_metrics(&f.pool, all()).await.unwrap();
    assert_eq!(ids(&metrics, "id"), vec![2, 1]);
    assert_eq!(metrics[1]["ctr"], 2.5);
    assert_eq!(metrics[0]["ctr"], Value::Null);
    assert_eq!(metrics[1]["publish_external_post_url"], "");

    // Active before archived.
    let memory = list_campaign_memory(&f.pool, campaign(1)).await.unwrap();
    assert_eq!(ids(&memory, "id"), vec![2, 1]);
    let events = list_learning_events(&f.pool, campaign(3)).await.unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0]["event_type"], "memory_created");
}

#[tokio::test]
async fn refresh_dashboard_counts_and_filters() {
    let f = fixture().await;
    let dashboard = refresh_dashboard(&f.pool, all()).await.unwrap();
    assert_eq!(dashboard.settings.as_ref().unwrap()["id"], 1);
    assert_eq!(ids(&dashboard.jobs, "id"), vec![1, 2, 3]);
    assert_eq!(dashboard.events.len(), 2);
    assert_eq!(
        dashboard.summary,
        RefreshSummary {
            total_jobs: 3,
            active_jobs: 1,
            due_jobs: 1,
            unavailable_jobs: 1,
            failed_jobs: 1,
            api_snapshots: 0,
        }
    );
    let one = refresh_dashboard(&f.pool, campaign(3)).await.unwrap();
    assert_eq!(one.summary.total_jobs, 1);
    assert_eq!(one.jobs.len(), 1);
    assert_eq!(one.events.len(), 1);
}

#[tokio::test]
async fn lists_are_capped() {
    let f = fixture().await;
    seed(
        &f.pool,
        "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 520)
         INSERT INTO learning_events (campaign_id,event_type,summary) SELECT 1,'metric_recorded','x' FROM n;
         WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 30)
         INSERT INTO metric_refresh_events (campaign_id,event_type,severity,summary) SELECT 1,'tick_started','info','x' FROM n;",
    )
    .await;
    let events = list_learning_events(&f.pool, all()).await.unwrap();
    assert_eq!(events.len() as i64, METRICS_LIST_LIMIT);
    let dashboard = refresh_dashboard(&f.pool, all()).await.unwrap();
    assert_eq!(dashboard.events.len() as i64, REFRESH_EVENTS_LIMIT);
}

#[tokio::test]
async fn reads_during_writes_see_whole_rows() {
    let f = fixture().await;
    let memory = CreateCampaignMemoryInput {
        campaign_id: 1,
        post_metric_id: None,
        signal: "insight".to_string(),
        summary: "Concurrent".to_string(),
        evidence: String::new(),
        confidence: 60,
    };
    let metric = RecordPostMetricInput {
        campaign_id: 1,
        approval_id: 1,
        publish_attempt_id: Some(2),
        measured_at: "2026-09-23T10:30".to_string(),
        impressions: 100,
        reactions: 5,
        comments: 2,
        reposts: 1,
        profile_visits: 0,
        link_clicks: 3,
        ctr: None,
        notes: String::new(),
    };
    let (created, recorded, memory_rows, metric_rows, events) = tokio::join!(
        create_campaign_memory(&f.pool, memory),
        record_post_metric(&f.pool, metric),
        list_campaign_memory(&f.pool, campaign(1)),
        list_post_metrics(&f.pool, campaign(1)),
        list_learning_events(&f.pool, campaign(1)),
    );
    created.unwrap();
    recorded.unwrap();
    // Each read sees either 2 or 3 memory rows, never a partial row.
    let memory_rows = memory_rows.unwrap();
    assert!(memory_rows.len() == 2 || memory_rows.len() == 3);
    assert!(memory_rows.iter().all(|row| row["summary"].is_string()));
    let metric_rows = metric_rows.unwrap();
    assert!(metric_rows.len() == 1 || metric_rows.len() == 2);
    assert!(events.is_ok());
    // After both settle, every write is visible.
    assert_eq!(
        list_campaign_memory(&f.pool, campaign(1))
            .await
            .unwrap()
            .len(),
        3
    );
    assert_eq!(
        list_post_metrics(&f.pool, campaign(1)).await.unwrap().len(),
        2
    );
}
