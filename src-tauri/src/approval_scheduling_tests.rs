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
         CREATE TABLE approvals (id INTEGER PRIMARY KEY, campaign_id INTEGER NOT NULL, draft_id INTEGER NOT NULL, draft_variant_id INTEGER NOT NULL, reviewed_content_revision INTEGER, status TEXT NOT NULL, updated_at TEXT);
         CREATE TABLE draft_variants (id INTEGER PRIMARY KEY, content_revision INTEGER NOT NULL);
         CREATE TABLE approval_ready_variants (draft_variant_id INTEGER, draft_id INTEGER, campaign_id INTEGER, content_revision INTEGER);
         CREATE TABLE schedule_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, approval_id INTEGER NOT NULL UNIQUE, platform TEXT NOT NULL, scheduled_for TEXT NOT NULL, timezone TEXT NOT NULL, status TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT);
         CREATE TABLE safety_settings (id INTEGER PRIMARY KEY, global_kill_switch INTEGER NOT NULL DEFAULT 0, kill_switch_reason TEXT NOT NULL DEFAULT '');
         INSERT INTO safety_settings (id) VALUES (1);
         CREATE TABLE rate_limit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER NOT NULL, action TEXT NOT NULL, window_key TEXT NOT NULL, limit_value INTEGER NOT NULL, current_count INTEGER NOT NULL, decision TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
         CREATE TABLE safety_audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER, subject_type TEXT NOT NULL, subject_id INTEGER, event_type TEXT NOT NULL, severity TEXT NOT NULL, summary TEXT NOT NULL, metadata_json TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));",
    ).await.unwrap();
    // Readiness is modelled as a table here; the real view is exercised by the
    // migrated-database tests in approval_review_tests.rs.
    pool.execute(
        "INSERT INTO campaigns VALUES (1, 'active', 2);
         INSERT INTO draft_variants VALUES (1, 1);
         INSERT INTO approval_ready_variants VALUES (1, 1, 1, 1);
         INSERT INTO approvals VALUES (1, 1, 1, 1, 1, 'approved', NULL);",
    )
    .await
    .unwrap();
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
    let outcomes = [first.await.unwrap(), second.await.unwrap()];
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
async fn unready_or_stale_approval_is_rejected_before_any_write() {
    for setup in [
        "DELETE FROM approval_ready_variants",
        "UPDATE draft_variants SET content_revision = 2",
        "UPDATE approvals SET reviewed_content_revision = NULL",
    ] {
        let pool = test_pool().await;
        pool.execute(setup).await.unwrap();
        assert_eq!(
            schedule_approval(&pool, input()).await.unwrap_err(),
            crate::approval_review::STALE_APPROVAL_ERROR
        );
        assert_eq!(count(&pool, "schedule_jobs").await, 0);
        assert_eq!(count(&pool, "rate_limit_events").await, 0);
        assert_eq!(count(&pool, "safety_audit_events").await, 0);
    }
}

async fn assert_no_schedule_writes(pool: &SqlitePool) {
    assert_eq!(count(pool, "schedule_jobs").await, 0);
    assert_eq!(count(pool, "rate_limit_events").await, 0);
    assert_eq!(count(pool, "safety_audit_events").await, 0);
}

#[tokio::test]
async fn unparseable_scheduled_for_is_rejected_before_any_write() {
    for scheduled_for in [
        "",
        "   ",
        "not a date",
        "tomorrow 09:00",
        "2026-10-01",
        "2026-13-01T09:00",
        "2026-02-30T09:00",
        "2026-10-01T25:00",
        "+2026-10-01T09:00",
        "2026-10-01T09:00+99:00",
        "2026-10-01T09:00 UTC",
    ] {
        let pool = test_pool().await;
        let result = schedule_approval(
            &pool,
            ScheduleApprovalInput {
                scheduled_for: scheduled_for.to_string(),
                ..input()
            },
        )
        .await;
        assert_eq!(
            result.unwrap_err(),
            "Scheduled time must be a valid date",
            "{scheduled_for:?}"
        );
        assert_no_schedule_writes(&pool).await;
    }
}

#[tokio::test]
async fn invalid_ids_and_long_text_are_rejected_before_any_write() {
    let pool = test_pool().await;
    let cases = [
        (
            ScheduleApprovalInput {
                approval_id: 0,
                ..input()
            },
            "Approval id must be a positive integer",
        ),
        (
            ScheduleApprovalInput {
                scheduled_for: format!("2026-10-01T09:00:00.{}", "0".repeat(70)),
                ..input()
            },
            "Scheduled time must be 80 characters or fewer",
        ),
        (
            ScheduleApprovalInput {
                timezone: "x".repeat(81),
                ..input()
            },
            "Timezone must be 80 characters or fewer",
        ),
    ];
    for (bad, message) in cases {
        assert_eq!(schedule_approval(&pool, bad).await.unwrap_err(), message);
    }
    assert_eq!(
        cancel_schedule(&pool, CancelScheduleInput { id: -1 })
            .await
            .unwrap_err(),
        "Schedule job id must be a positive integer"
    );
    assert_no_schedule_writes(&pool).await;
}

#[test]
fn unknown_fields_are_rejected() {
    let schedule = serde_json::from_value::<ScheduleApprovalInput>(serde_json::json!({
        "approvalId": 1,
        "scheduledFor": "2026-10-01T09:00",
        "timezone": "local",
        "dailyPostLimit": 99,
    }));
    assert!(schedule.unwrap_err().to_string().contains("unknown field"));
    let cancel = serde_json::from_value::<CancelScheduleInput>(serde_json::json!({
        "id": 1,
        "force": true,
    }));
    assert!(cancel.unwrap_err().to_string().contains("unknown field"));
}

#[test]
fn accepted_formats_are_trimmed_and_timezone_defaults_to_local() {
    for scheduled_for in [
        "2026-10-01T09:00",
        "2026-10-01T09:00:30",
        "2026-10-01T09:00:30.123Z",
        "2026-10-01T09:00+02:00",
        "2026-10-01 09:00",
        "2026-10-01 09:00:30",
    ] {
        assert!(
            is_supported_timestamp(scheduled_for),
            "{scheduled_for:?} should be accepted"
        );
    }
    let valid = validate_schedule(ScheduleApprovalInput {
        approval_id: 1,
        scheduled_for: "  2026-10-01T09:00  ".to_string(),
        timezone: "   ".to_string(),
    })
    .unwrap();
    assert_eq!(valid.scheduled_for, "2026-10-01T09:00");
    assert_eq!(valid.timezone, "local");
}

#[tokio::test]
async fn datetime_local_value_schedules_and_counts_toward_daily_limit() {
    let pool = test_pool().await;
    pool.execute(
        "UPDATE campaigns SET daily_post_limit=1 WHERE id=1;
         INSERT INTO draft_variants VALUES (2, 1);
         INSERT INTO approval_ready_variants VALUES (2, 2, 1, 1);
         INSERT INTO approvals VALUES (2, 1, 2, 2, 1, 'approved', NULL);",
    )
    .await
    .unwrap();
    let first = ScheduleApprovalInput {
        approval_id: 1,
        scheduled_for: "2026-10-01T09:00".to_string(),
        timezone: "local".to_string(),
    };
    schedule_approval(&pool, first).await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT window_key FROM rate_limit_events")
            .fetch_one(&pool)
            .await
            .unwrap(),
        "2026-10-01"
    );
    let second = ScheduleApprovalInput {
        approval_id: 2,
        scheduled_for: "2026-10-01 17:30:00".to_string(),
        timezone: "local".to_string(),
    };
    assert_eq!(
        schedule_approval(&pool, second).await.unwrap_err(),
        "Daily post scheduling limit reached for 2026-10-01: 1/1 used"
    );
    assert_eq!(count(&pool, "schedule_jobs").await, 1);
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
