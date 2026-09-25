use super::*;
use crate::test_support::{count as table_count, fail_on, migrated, seed, snapshot};

const TABLES: &[&str] = &["scheduler_settings", "schedule_jobs", "scheduler_events"];

async fn fixture() -> crate::test_support::Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        "DROP TRIGGER IF EXISTS approvals_validate_insert;
         DROP TRIGGER IF EXISTS approvals_bind_insert;
         INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Other','active',5);
         INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES (1,'u1','n1','a','h1'),(2,'u2','n2','b','h2'),(3,'u3','n3','c','h3');
         INSERT INTO candidate_posts (id,campaign_id,target_post_id) VALUES (1,1,1),(2,1,2),(3,2,3);
         INSERT INTO drafts (id,campaign_id,candidate_post_id,status) VALUES (1,1,1,'ready_for_review'),(2,1,2,'ready_for_review'),(3,2,3,'ready_for_review');
         INSERT INTO draft_variants (id,draft_id,variant_number,hook,body,status) VALUES (1,1,1,'Hook one','b','selected'),(2,2,1,'Hook two','b','selected'),(3,3,1,'Hook three','b','selected');
         INSERT INTO approvals (id,campaign_id,draft_id,draft_variant_id,status) VALUES (1,1,1,1,'scheduled'),(2,1,2,2,'scheduled'),(3,2,3,3,'scheduled');
         INSERT INTO schedule_jobs (id,approval_id,platform,scheduled_for,timezone,status,idempotency_key) VALUES
            (1,1,'linkedin',datetime('now','-1 hour'),'UTC','scheduled','k1'),
            (2,2,'linkedin',datetime('now','+30 days'),'UTC','failed','k2'),
            (3,3,'linkedin',datetime('now','+2 hours'),'UTC','scheduled','k3');
         INSERT INTO publish_attempts (approval_id,schedule_job_id,status,error_message) VALUES
            (1,1,'failed','boom'),(3,3,'succeeded',''),(2,NULL,'failed','manual');
         INSERT INTO scheduler_events (campaign_id,approval_id,schedule_job_id,event_type,summary) VALUES
            (1,1,1,'job_claimed','claimed'),(2,3,3,'job_published','published'),(NULL,NULL,NULL,'tick_started','tick');
         UPDATE safety_settings SET global_kill_switch = 1, kill_switch_reason = 'paused' WHERE id = 1;",
    )
    .await;
    f
}

#[test]
fn rejects_unknown_fields() {
    assert!(serde_json::from_value::<SchedulerDashboardInput>(
        serde_json::json!({ "campaignId": 1, "extra": true })
    )
    .is_err());
    assert!(serde_json::from_value::<SchedulerDashboardInput>(serde_json::json!({})).is_ok());
}

#[tokio::test]
async fn invalid_campaign_id_is_rejected_before_storage() {
    let f = migrated().await;
    seed(&f.pool, "DELETE FROM scheduler_settings;").await;
    let before = snapshot(&f.pool, TABLES).await;
    for id in [0, -3] {
        let error = get_scheduler_dashboard(
            &f.pool,
            SchedulerDashboardInput {
                campaign_id: Some(id),
            },
        )
        .await
        .unwrap_err();
        assert_eq!(error, "Campaign id must be a positive integer");
    }
    // The missing settings row is not recreated for rejected input.
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn dashboard_counts_and_lists_across_all_campaigns() {
    let f = fixture().await;
    let dashboard = get_scheduler_dashboard(&f.pool, SchedulerDashboardInput::default())
        .await
        .unwrap();
    assert_eq!(
        dashboard.summary,
        SchedulerDashboardSummary {
            pending_jobs: 2,
            due_jobs: 1,
            failed_jobs: 1,
            recent_attempts: 2,
        }
    );
    let due: Vec<i64> = dashboard.due_jobs.iter().map(|j| j.id).collect();
    assert_eq!(due, vec![1, 3]);
    assert_eq!(dashboard.due_jobs[0].variant_hook, "Hook one");
    assert_eq!(dashboard.due_jobs[0].campaign_name, "Live");
    assert_eq!(dashboard.due_jobs[0].approval_status, "scheduled");
    assert_eq!(dashboard.recent_events.len(), 3);
    assert!(dashboard
        .recent_attempts
        .iter()
        .all(|a| a.schedule_job_id.is_some()));
    assert!(dashboard.global_kill_switch_enabled);
    assert_eq!(dashboard.kill_switch_reason, "paused");
    assert_eq!(dashboard.settings.id, 1);
    let json = serde_json::to_value(&dashboard).unwrap();
    assert!(json["dueJobs"][0]["scheduled_for"].is_string());
    assert!(json["settings"]["poll_interval_seconds"].is_number());
    assert!(json["summary"]["pendingJobs"].is_number());
}

#[tokio::test]
async fn dashboard_filters_to_one_campaign() {
    let f = fixture().await;
    let dashboard = get_scheduler_dashboard(
        &f.pool,
        SchedulerDashboardInput {
            campaign_id: Some(2),
        },
    )
    .await
    .unwrap();
    assert_eq!(dashboard.summary.pending_jobs, 1);
    assert_eq!(dashboard.summary.due_jobs, 0);
    assert_eq!(dashboard.summary.failed_jobs, 0);
    assert_eq!(dashboard.summary.recent_attempts, 1);
    assert!(dashboard.due_jobs.iter().all(|j| j.campaign_id == 2));
    assert!(dashboard
        .recent_events
        .iter()
        .all(|e| e.campaign_id == Some(2)));
    assert_eq!(
        dashboard.recent_events[0].campaign_name.as_deref(),
        Some("Other")
    );
}

#[tokio::test]
async fn dashboard_lists_are_bounded() {
    let f = migrated().await;
    seed(
        &f.pool,
        "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 60)
         INSERT INTO scheduler_events (event_type,summary) SELECT 'tick_started','x' FROM n;",
    )
    .await;
    let dashboard = get_scheduler_dashboard(&f.pool, SchedulerDashboardInput::default())
        .await
        .unwrap();
    assert_eq!(dashboard.recent_events.len() as i64, EVENTS_LIMIT);
    assert_eq!(dashboard.summary.recent_attempts, 0);
}

#[tokio::test]
async fn dashboard_recreates_a_missing_settings_row() {
    let f = migrated().await;
    seed(&f.pool, "DELETE FROM scheduler_settings;").await;
    let dashboard = get_scheduler_dashboard(&f.pool, SchedulerDashboardInput::default())
        .await
        .unwrap();
    assert_eq!(dashboard.settings.id, 1);
    assert_eq!(dashboard.settings.enabled, 0);
    assert_eq!(dashboard.settings.poll_interval_seconds, 60);
    assert_eq!(table_count(&f.pool, "scheduler_settings").await, 1);
}

#[tokio::test]
async fn storage_failure_rolls_back_row_recreation_and_hides_errors() {
    let f = fixture().await;
    seed(&f.pool, "DELETE FROM scheduler_settings;").await;
    fail_on(&f.pool, "BEFORE INSERT ON scheduler_settings").await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        get_scheduler_dashboard(&f.pool, SchedulerDashboardInput::default())
            .await
            .unwrap_err(),
        READ_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn concurrent_reads_and_job_writes_stay_consistent() {
    let f = fixture().await;
    seed(&f.pool, "DELETE FROM scheduler_settings;").await;
    let write = async {
        sqlx::query("UPDATE schedule_jobs SET status = 'failed' WHERE id = 1")
            .execute(&f.pool)
            .await
    };
    let (a, b, written) = tokio::join!(
        get_scheduler_dashboard(&f.pool, SchedulerDashboardInput::default()),
        get_scheduler_dashboard(&f.pool, SchedulerDashboardInput::default()),
        write,
    );
    written.unwrap();
    assert_eq!(table_count(&f.pool, "scheduler_settings").await, 1);
    for dashboard in [a.unwrap(), b.unwrap()] {
        let s = &dashboard.summary;
        // Every snapshot sees job 1 either before or after the write, never torn.
        assert!(
            (s.pending_jobs, s.due_jobs, s.failed_jobs) == (2, 1, 1)
                || (s.pending_jobs, s.due_jobs, s.failed_jobs) == (1, 0, 2),
            "{s:?}"
        );
        assert_eq!(
            dashboard.due_jobs.len() as i64,
            s.pending_jobs,
            "due list agrees with the pending count"
        );
    }
}
