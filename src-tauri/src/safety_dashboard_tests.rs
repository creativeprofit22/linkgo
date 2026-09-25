use super::*;
use crate::safety::{set_global_kill_switch, SetGlobalKillSwitchInput};
use crate::test_support::{count as table_count, fail_on, migrated, seed, snapshot, Fixture};

async fn fixture() -> Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Other','active',5);
         INSERT INTO error_queue_items (id,campaign_id,source_type,title,status,updated_at) VALUES
            (1,1,'manual','Open newer','open','2026-09-02 00:00:00'),
            (2,1,'manual','Resolved','resolved','2026-09-03 00:00:00'),
            (3,2,'manual','Other open','in_progress','2026-09-01 00:00:00'),
            (4,NULL,'manual','Global','awaiting_review','2026-09-01 00:00:00');
         INSERT INTO rate_limit_events (campaign_id,action,window_key,limit_value,current_count,decision,summary) VALUES
            (1,'schedule_post','d',5,1,'allowed','ok'),
            (1,'schedule_post','d',5,5,'blocked','no'),
            (2,'comment','d',5,1,'allowed','ok');
         INSERT INTO safety_audit_events (campaign_id,subject_type,subject_id,event_type,summary) VALUES
            (1,'campaign',1,'schedule_allowed','a'),
            (2,'campaign',2,'schedule_blocked','b');",
    )
    .await;
    f
}

#[test]
fn rejects_unknown_fields() {
    assert!(serde_json::from_value::<SafetyDashboardInput>(
        serde_json::json!({ "campaignId": 1, "extra": true })
    )
    .is_err());
}

#[tokio::test]
async fn invalid_campaign_id_is_rejected_before_storage() {
    let f = fixture().await;
    let error = get_safety_dashboard(
        &f.pool,
        SafetyDashboardInput {
            campaign_id: Some(0),
        },
    )
    .await
    .unwrap_err();
    assert_eq!(error, "Campaign id must be a positive integer");
}

#[tokio::test]
async fn dashboard_counts_and_lists_across_all_campaigns() {
    let f = fixture().await;
    let dashboard = get_safety_dashboard(&f.pool, SafetyDashboardInput::default())
        .await
        .unwrap();
    assert_eq!(
        dashboard.summary,
        SafetyDashboardSummary {
            open_errors: 3,
            blocked_today: 1,
            allowed_today: 2,
            audit_events: 2,
        }
    );
    let order: Vec<i64> = dashboard.error_queue_items.iter().map(|i| i.id).collect();
    // Unresolved first, newest update first, then resolved last.
    assert_eq!(order, vec![1, 4, 3, 2]);
    assert_eq!(
        dashboard.error_queue_items[0].campaign_name.as_deref(),
        Some("Live")
    );
    assert_eq!(dashboard.error_queue_items[1].campaign_name, None);
    assert_eq!(dashboard.rate_limit_events.len(), 3);
    assert_eq!(dashboard.audit_events.len(), 2);
}

#[tokio::test]
async fn dashboard_filters_to_one_campaign() {
    let f = fixture().await;
    let dashboard = get_safety_dashboard(
        &f.pool,
        SafetyDashboardInput {
            campaign_id: Some(1),
        },
    )
    .await
    .unwrap();
    assert_eq!(dashboard.summary.open_errors, 1);
    assert_eq!(dashboard.summary.allowed_today, 1);
    assert_eq!(dashboard.summary.audit_events, 1);
    assert!(dashboard
        .error_queue_items
        .iter()
        .all(|i| i.campaign_id == Some(1)));
    assert!(dashboard
        .rate_limit_events
        .iter()
        .all(|e| e.campaign_id == 1));
}

#[tokio::test]
async fn dashboard_lists_are_bounded() {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5);
         WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 60)
         INSERT INTO safety_audit_events (campaign_id,subject_type,subject_id,event_type,summary)
         SELECT 1,'campaign',1,'schedule_allowed','x' FROM n;",
    )
    .await;
    let dashboard = get_safety_dashboard(&f.pool, SafetyDashboardInput::default())
        .await
        .unwrap();
    assert_eq!(dashboard.audit_events.len() as i64, DASHBOARD_LIST_LIMIT);
    assert_eq!(dashboard.summary.audit_events, 60);
}

#[tokio::test]
async fn settings_get_recreates_a_missing_row() {
    let f = migrated().await;
    seed(&f.pool, "DELETE FROM safety_settings;").await;
    let settings = get_safety_settings(&f.pool).await.unwrap();
    assert_eq!(settings.id, 1);
    assert_eq!(settings.global_kill_switch, 0);
    assert_eq!(table_count(&f.pool, "safety_settings").await, 1);
}

#[tokio::test]
async fn storage_failure_rolls_back_row_recreation_and_hides_errors() {
    let f = migrated().await;
    seed(&f.pool, "DELETE FROM safety_settings;").await;
    fail_on(&f.pool, "BEFORE INSERT ON safety_settings").await;
    let before = snapshot(&f.pool, &["safety_settings"]).await;
    assert_eq!(get_safety_settings(&f.pool).await.unwrap_err(), READ_ERROR);
    assert_eq!(
        get_safety_dashboard(&f.pool, SafetyDashboardInput::default())
            .await
            .unwrap_err(),
        READ_ERROR
    );
    assert_eq!(snapshot(&f.pool, &["safety_settings"]).await, before);
}

#[tokio::test]
async fn concurrent_reads_and_kill_switch_writes_stay_consistent() {
    let f = fixture().await;
    seed(&f.pool, "DELETE FROM safety_settings;").await;
    let (a, b, write) = tokio::join!(
        get_safety_settings(&f.pool),
        get_safety_dashboard(&f.pool, SafetyDashboardInput::default()),
        set_global_kill_switch(
            &f.pool,
            SetGlobalKillSwitchInput {
                enabled: true,
                reason: "stop".to_string(),
            }
        ),
    );
    write.unwrap();
    assert_eq!(table_count(&f.pool, "safety_settings").await, 1);
    for settings in [a.unwrap(), b.unwrap().settings] {
        let pair = (settings.global_kill_switch, settings.kill_switch_reason);
        assert!(
            pair == (0, String::new()) || pair == (1, "stop".to_string()),
            "{pair:?}"
        );
    }
}
