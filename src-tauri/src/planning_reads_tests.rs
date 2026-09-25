use super::*;
use crate::test_support::{migrated, seed, Fixture};

async fn fixture() -> Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit,auto_pilot) VALUES (1,'Live','active',5,1),(2,'Other','active',5,0);
         INSERT INTO campaign_backlog_items (id,campaign_id,work_type,title,owner_type,status,due_at,completed_at) VALUES
           (1,1,'research','Due later','operator','pending','2999-01-01T00:00:00.000Z',NULL),
           (2,1,'research','Due now','linkgo','blocked','2000-01-01T00:00:00.000Z',NULL),
           (3,2,'research','Other','operator','in_progress','2500-01-01T00:00:00.000Z',NULL),
           (4,1,'research','Done','operator','completed','2000-01-01T00:00:00.000Z','2026-09-01T00:00:00.000Z');
         INSERT INTO source_import_batches (id,campaign_id,source_type,status,total_count,accepted_count) VALUES
           (1,1,'local_json','completed',2,2),(2,1,'local_json','completed',1,1),(3,2,'local_json','completed',1,1);
         INSERT INTO workflow_runs (id,campaign_id,title,status,current_step_key) VALUES (1,1,'Flow','running','score');
         INSERT INTO autopilot_plans (id,campaign_id,source_import_batch_id,source_type,status,campaign_backlog_item_id,workflow_run_id,candidate_count) VALUES (1,1,1,'local_json','planned',2,1,2);
         INSERT INTO autopilot_planner_events (campaign_id,event_type,severity,summary) VALUES
           (1,'batch_failed','error','boom'),(2,'batch_failed','error','other');",
    )
    .await;
    f
}

fn backlog(campaign_id: Option<i64>, owner: &str, view: &str) -> BacklogDashboardInput {
    BacklogDashboardInput {
        campaign_id,
        owner: owner.to_string(),
        view: view.to_string(),
    }
}

fn ids(rows: &[Value]) -> Vec<i64> {
    rows.iter().map(|row| row["id"].as_i64().unwrap()).collect()
}

#[test]
fn inputs_reject_unknown_fields() {
    assert!(
        serde_json::from_value::<BacklogDashboardInput>(serde_json::json!({
            "owner": "all", "view": "open", "extra": 1
        }))
        .is_err()
    );
    assert!(serde_json::from_value::<PlannerDashboardInput>(
        serde_json::json!({ "campaignId": 1, "x": 1 })
    )
    .is_err());
}

#[tokio::test]
async fn invalid_filters_are_rejected() {
    let f = migrated().await;
    assert!(backlog_dashboard(&f.pool, backlog(Some(0), "all", "open"))
        .await
        .is_err());
    assert!(backlog_dashboard(&f.pool, backlog(None, "robot", "open"))
        .await
        .is_err());
    assert!(backlog_dashboard(&f.pool, backlog(None, "all", "archive"))
        .await
        .is_err());
    // A filter value is never treated as SQL.
    assert!(
        backlog_dashboard(&f.pool, backlog(None, "all' OR '1'='1", "open"))
            .await
            .is_err()
    );
    let bad = PlannerDashboardInput {
        campaign_id: Some(-1),
    };
    assert!(planner_dashboard(&f.pool, bad).await.is_err());
}

#[tokio::test]
async fn backlog_views_filter_order_and_count() {
    let f = fixture().await;
    let open = backlog_dashboard(&f.pool, backlog(None, "all", "open"))
        .await
        .unwrap();
    assert_eq!(ids(&open.items), vec![2, 3, 1]);
    assert_eq!(open.items[0]["autopilot_plan_id"], 1);
    assert_eq!(
        open.summary,
        BacklogSummary {
            due_now: 1,
            in_progress: 1,
            blocked: 1,
            linkgo_owned: 1,
        }
    );
    assert_eq!(open.total_items, 4);

    let mine = backlog_dashboard(&f.pool, backlog(Some(1), "operator", "open"))
        .await
        .unwrap();
    assert_eq!(ids(&mine.items), vec![1]);
    assert_eq!(mine.summary.linkgo_owned, 0);

    let history = backlog_dashboard(&f.pool, backlog(Some(1), "all", "history"))
        .await
        .unwrap();
    assert_eq!(ids(&history.items), vec![4]);
    let all_history = backlog_dashboard(&f.pool, backlog(None, "all", "history"))
        .await
        .unwrap();
    assert_eq!(ids(&all_history.items), vec![4]);
}

#[tokio::test]
async fn planner_dashboard_counts_and_lists() {
    let f = fixture().await;
    let all = planner_dashboard(&f.pool, PlannerDashboardInput::default())
        .await
        .unwrap();
    // Batch 2 is eligible; batch 1 is planned; batch 3's campaign is not autopilot.
    assert_eq!(
        all.summary,
        PlannerSummary {
            eligible_batches: 1,
            planned_batches: 1,
            skipped_batches: 0,
            recent_failures: 2,
        }
    );
    assert_eq!(all.recent_plans.len(), 1);
    assert_eq!(all.recent_plans[0]["backlog_title"], "Due now");
    assert_eq!(all.recent_plans[0]["current_candidate_count"], 0);
    assert_eq!(all.recent_events.len(), 2);
    assert!(!all.global_kill_switch_enabled);

    let one = planner_dashboard(
        &f.pool,
        PlannerDashboardInput {
            campaign_id: Some(2),
        },
    )
    .await
    .unwrap();
    assert_eq!(one.summary.recent_failures, 1);
    assert!(one.recent_plans.is_empty());
}

#[tokio::test]
async fn dashboard_reads_during_writes_stay_consistent() {
    let f = fixture().await;
    let write = async {
        seed(
            &f.pool,
            "UPDATE campaign_backlog_items SET status='completed', completed_at='2026-09-02T00:00:00.000Z' WHERE id=2;
             UPDATE safety_settings SET global_kill_switch=1, kill_switch_reason='stop' WHERE id=1;",
        )
        .await;
    };
    let (_, open, planner) = tokio::join!(
        write,
        backlog_dashboard(&f.pool, backlog(None, "all", "open")),
        planner_dashboard(&f.pool, PlannerDashboardInput::default()),
    );
    let open = open.unwrap();
    // The summary and items come from the same snapshot.
    let blocked_in_items = open
        .items
        .iter()
        .filter(|item| item["status"] == "blocked")
        .count() as i64;
    assert_eq!(open.summary.blocked, blocked_in_items);
    let planner = planner.unwrap();
    assert_eq!(
        planner.global_kill_switch_enabled,
        planner.kill_switch_reason == "stop"
    );
}
