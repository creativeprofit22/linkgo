use super::*;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::Executor;
use std::str::FromStr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

static SEQUENCE: AtomicU64 = AtomicU64::new(1);

async fn test_pool() -> SqlitePool {
    let id = SEQUENCE.fetch_add(1, Ordering::SeqCst);
    let url = format!("sqlite:file:approval-scheduling-{id}?mode=memory&cache=shared");
    let options = SqliteConnectOptions::from_str(&url)
        .unwrap()
        .busy_timeout(Duration::from_secs(5));
    let pool = SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(options)
        .await
        .unwrap();
    pool.execute(
        "CREATE TABLE campaigns (id INTEGER PRIMARY KEY, status TEXT NOT NULL, daily_post_limit INTEGER NOT NULL);
         CREATE TABLE approvals (id INTEGER PRIMARY KEY, campaign_id INTEGER NOT NULL, status TEXT NOT NULL, updated_at TEXT);
         CREATE TABLE schedule_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, approval_id INTEGER NOT NULL UNIQUE, platform TEXT NOT NULL, scheduled_for TEXT NOT NULL, timezone TEXT NOT NULL, status TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT);
         CREATE TABLE safety_settings (id INTEGER PRIMARY KEY, global_kill_switch INTEGER NOT NULL DEFAULT 0, kill_switch_reason TEXT NOT NULL DEFAULT '');
         INSERT INTO safety_settings (id) VALUES (1);
         CREATE TABLE rate_limit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER NOT NULL, action TEXT NOT NULL, window_key TEXT NOT NULL, limit_value INTEGER NOT NULL, current_count INTEGER NOT NULL, decision TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE safety_audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER, subject_type TEXT NOT NULL, subject_id INTEGER, event_type TEXT NOT NULL, severity TEXT NOT NULL, summary TEXT NOT NULL, metadata_json TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));",
    ).await.unwrap();
    pool.execute("INSERT INTO campaigns VALUES (1, 'active', 2); INSERT INTO approvals VALUES (1, 1, 'approved', NULL);")
        .await.unwrap();
    pool
}

fn input() -> ScheduleApprovalInput {
    ScheduleApprovalInput {
        approval_id: 1,
        scheduled_for: "2026-08-20T10:00:00Z".to_string(),
        timezone: "UTC".to_string(),
    }
}

async fn count(pool: &SqlitePool, table: &str) -> i64 {
    sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
        .fetch_one(pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn scheduling_commits_all_rows() {
    let pool = test_pool().await;
    assert_eq!(schedule_approval(&pool, input()).await.unwrap(), 1);
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT status FROM approvals WHERE id=1")
            .fetch_one(&pool)
            .await
            .unwrap(),
        "scheduled"
    );
    assert_eq!(count(&pool, "schedule_jobs").await, 1);
    assert_eq!(count(&pool, "rate_limit_events").await, 1);
    assert_eq!(count(&pool, "safety_audit_events").await, 1);
}

#[tokio::test]
async fn late_audit_failure_rolls_back_all_rows() {
    let pool = test_pool().await;
    pool.execute("CREATE TRIGGER fail_audit BEFORE INSERT ON safety_audit_events BEGIN SELECT RAISE(ABORT, 'private failure'); END;").await.unwrap();
    assert_eq!(
        schedule_approval(&pool, input()).await.unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(count(&pool, "schedule_jobs").await, 0);
    assert_eq!(count(&pool, "rate_limit_events").await, 0);
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT status FROM approvals WHERE id=1")
            .fetch_one(&pool)
            .await
            .unwrap(),
        "approved"
    );
}

#[tokio::test]
async fn concurrent_schedule_has_one_winner_and_no_duplicates() {
    let pool = test_pool().await;
    let first = tokio::spawn({
        let pool = pool.clone();
        async move { schedule_approval(&pool, input()).await }
    });
    let second = tokio::spawn({
        let pool = pool.clone();
        async move { schedule_approval(&pool, input()).await }
    });
    let outcomes = vec![first.await.unwrap(), second.await.unwrap()];
    assert_eq!(outcomes.iter().filter(|result| result.is_ok()).count(), 1);
    assert_eq!(
        outcomes
            .iter()
            .filter(|result| result
                .as_ref()
                .err()
                .is_some_and(|e| e == "Approval already has an active schedule job"
                    || e == "Only approved posts can be scheduled"))
            .count(),
        1
    );
    assert_eq!(count(&pool, "schedule_jobs").await, 1);
    assert_eq!(count(&pool, "rate_limit_events").await, 1);
}

#[tokio::test]
async fn cancelled_job_can_be_rescheduled_in_place() {
    let pool = test_pool().await;
    let id = schedule_approval(&pool, input()).await.unwrap();
    cancel_schedule(&pool, CancelScheduleInput { id })
        .await
        .unwrap();
    let retried = schedule_approval(&pool, input()).await.unwrap();
    assert_eq!(retried, id);
    assert_eq!(count(&pool, "schedule_jobs").await, 1);
}

#[tokio::test]
async fn blocked_limit_commits_durable_audits_without_schedule() {
    let pool = test_pool().await;
    pool.execute("UPDATE campaigns SET daily_post_limit=0 WHERE id=1")
        .await
        .unwrap();
    assert!(schedule_approval(&pool, input())
        .await
        .unwrap_err()
        .starts_with("Daily post scheduling limit reached"));
    assert_eq!(count(&pool, "schedule_jobs").await, 0);
    assert_eq!(count(&pool, "rate_limit_events").await, 1);
    assert_eq!(count(&pool, "safety_audit_events").await, 1);
}

#[tokio::test]
async fn kill_switch_rejection_commits_durable_decision() {
    let pool = test_pool().await;
    pool.execute(
        "UPDATE safety_settings SET global_kill_switch=1, kill_switch_reason='pause' WHERE id=1",
    )
    .await
    .unwrap();
    assert_eq!(
        schedule_approval(&pool, input()).await.unwrap_err(),
        "Global kill switch is enabled: pause"
    );
    assert_eq!(count(&pool, "schedule_jobs").await, 0);
    assert_eq!(count(&pool, "rate_limit_events").await, 1);
    assert_eq!(count(&pool, "safety_audit_events").await, 1);
}

#[tokio::test]
async fn cancel_late_audit_failure_rolls_back_state() {
    let pool = test_pool().await;
    let id = schedule_approval(&pool, input()).await.unwrap();
    pool.execute("CREATE TRIGGER fail_cancel_audit BEFORE INSERT ON safety_audit_events WHEN NEW.event_type='schedule_cancelled' BEGIN SELECT RAISE(ABORT, 'private failure'); END;").await.unwrap();
    assert_eq!(
        cancel_schedule(&pool, CancelScheduleInput { id })
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT status FROM schedule_jobs WHERE id=1")
            .fetch_one(&pool)
            .await
            .unwrap(),
        "scheduled"
    );
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT status FROM approvals WHERE id=1")
            .fetch_one(&pool)
            .await
            .unwrap(),
        "scheduled"
    );
}
