//! Native scheduler dashboard read. Recreates a missing `scheduler_settings`
//! row and reads settings, safety state, counts and the bounded job, event
//! and attempt lists inside one pinned `BEGIN IMMEDIATE` transaction, so the
//! whole dashboard comes from one snapshot and a failure leaves nothing
//! half-written.

use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteRow, Row, SqliteConnection, SqlitePool};
use tauri::State;

use crate::db_transaction::{settle, Settlement};

const READ_ERROR: &str = "Could not load the scheduler dashboard";
/// Same caps the renderer SQL used.
pub(crate) const DUE_JOBS_LIMIT: i64 = 20;
pub(crate) const EVENTS_LIMIT: i64 = 50;
pub(crate) const ATTEMPTS_LIMIT: i64 = 25;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SchedulerDashboardInput {
    #[serde(default)]
    pub campaign_id: Option<i64>,
}

/// Mirrors the renderer `SchedulerSettings` row shape.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SchedulerSettingsRow {
    pub id: i64,
    pub enabled: i64,
    pub poll_interval_seconds: i64,
    pub max_jobs_per_tick: i64,
    pub retry_backoff_minutes: i64,
    pub updated_at: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerDashboardSummary {
    pub pending_jobs: i64,
    pub due_jobs: i64,
    pub failed_jobs: i64,
    pub recent_attempts: i64,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct DueScheduleJobRow {
    pub id: i64,
    pub approval_id: i64,
    pub platform: String,
    pub scheduled_for: String,
    pub timezone: String,
    pub status: String,
    pub idempotency_key: String,
    pub attempt_count: i64,
    pub max_attempts: i64,
    pub next_attempt_at: Option<String>,
    pub last_attempted_at: Option<String>,
    pub last_error: String,
    pub locked_at: Option<String>,
    pub locked_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub campaign_id: i64,
    pub approval_status: String,
    pub campaign_name: String,
    pub campaign_status: String,
    pub variant_hook: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct SchedulerEventRow {
    pub id: i64,
    pub campaign_id: Option<i64>,
    pub approval_id: Option<i64>,
    pub schedule_job_id: Option<i64>,
    pub event_type: String,
    pub severity: String,
    pub summary: String,
    pub metadata_json: String,
    pub created_at: String,
    pub campaign_name: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct SchedulerPublishAttemptRow {
    pub id: i64,
    pub approval_id: i64,
    pub schedule_job_id: Option<i64>,
    pub platform: String,
    pub status: String,
    pub external_post_url: String,
    pub platform_post_id: String,
    pub error_message: String,
    pub created_at: String,
    pub campaign_id: Option<i64>,
    pub campaign_name: Option<String>,
    /// The approved variant's opening line; empty when the variant is gone.
    pub variant_hook: String,
}

/// Mirrors the renderer `SchedulerDashboard` shape.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerDashboard {
    pub settings: SchedulerSettingsRow,
    pub summary: SchedulerDashboardSummary,
    pub due_jobs: Vec<DueScheduleJobRow>,
    pub recent_events: Vec<SchedulerEventRow>,
    pub recent_attempts: Vec<SchedulerPublishAttemptRow>,
    pub global_kill_switch_enabled: bool,
    pub kill_switch_reason: String,
}

fn read_error(_: sqlx::Error) -> String {
    READ_ERROR.to_string()
}

async fn ensure_settings(
    connection: &mut SqliteConnection,
) -> Result<SchedulerSettingsRow, String> {
    sqlx::query("INSERT OR IGNORE INTO scheduler_settings (id) VALUES (1)")
        .execute(&mut *connection)
        .await
        .map_err(read_error)?;
    let row = sqlx::query(
        "SELECT id, enabled, poll_interval_seconds, max_jobs_per_tick,
                retry_backoff_minutes, updated_at
         FROM scheduler_settings WHERE id = 1 LIMIT 1",
    )
    .fetch_one(&mut *connection)
    .await
    .map_err(read_error)?;
    Ok(SchedulerSettingsRow {
        id: row.get("id"),
        enabled: row.get("enabled"),
        poll_interval_seconds: row.get("poll_interval_seconds"),
        max_jobs_per_tick: row.get("max_jobs_per_tick"),
        retry_backoff_minutes: row.get("retry_backoff_minutes"),
        updated_at: row.get("updated_at"),
    })
}

async fn count(
    connection: &mut SqliteConnection,
    sql: &str,
    campaign_id: Option<i64>,
) -> Result<i64, String> {
    sqlx::query_scalar(sql)
        .bind(campaign_id)
        .fetch_one(&mut *connection)
        .await
        .map_err(read_error)
}

async fn rows(
    connection: &mut SqliteConnection,
    sql: &str,
    campaign_id: Option<i64>,
    limit: i64,
) -> Result<Vec<SqliteRow>, String> {
    sqlx::query(sql)
        .bind(campaign_id)
        .bind(limit)
        .fetch_all(&mut *connection)
        .await
        .map_err(read_error)
}

fn due_job(row: &SqliteRow) -> DueScheduleJobRow {
    DueScheduleJobRow {
        id: row.get("id"),
        approval_id: row.get("approval_id"),
        platform: row.get("platform"),
        scheduled_for: row.get("scheduled_for"),
        timezone: row.get("timezone"),
        status: row.get("status"),
        idempotency_key: row.get("idempotency_key"),
        attempt_count: row.get("attempt_count"),
        max_attempts: row.get("max_attempts"),
        next_attempt_at: row.get("next_attempt_at"),
        last_attempted_at: row.get("last_attempted_at"),
        last_error: row.get("last_error"),
        locked_at: row.get("locked_at"),
        locked_by: row.get("locked_by"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        campaign_id: row.get("campaign_id"),
        approval_status: row.get("approval_status"),
        campaign_name: row.get("campaign_name"),
        campaign_status: row.get("campaign_status"),
        variant_hook: row.get("variant_hook"),
    }
}

fn event(row: &SqliteRow) -> SchedulerEventRow {
    SchedulerEventRow {
        id: row.get("id"),
        campaign_id: row.get("campaign_id"),
        approval_id: row.get("approval_id"),
        schedule_job_id: row.get("schedule_job_id"),
        event_type: row.get("event_type"),
        severity: row.get("severity"),
        summary: row.get("summary"),
        metadata_json: row.get("metadata_json"),
        created_at: row.get("created_at"),
        campaign_name: row.get("campaign_name"),
    }
}

fn attempt(row: &SqliteRow) -> SchedulerPublishAttemptRow {
    SchedulerPublishAttemptRow {
        id: row.get("id"),
        approval_id: row.get("approval_id"),
        schedule_job_id: row.get("schedule_job_id"),
        platform: row.get("platform"),
        status: row.get("status"),
        external_post_url: row.get("external_post_url"),
        platform_post_id: row.get("platform_post_id"),
        error_message: row.get("error_message"),
        created_at: row.get("created_at"),
        campaign_id: row.get("campaign_id"),
        campaign_name: row.get("campaign_name"),
        variant_hook: row.get("variant_hook"),
    }
}

pub(crate) async fn get_scheduler_dashboard(
    pool: &SqlitePool,
    input: SchedulerDashboardInput,
) -> Result<SchedulerDashboard, String> {
    if input.campaign_id.is_some_and(|id| id <= 0) {
        return Err("Campaign id must be a positive integer".to_string());
    }
    let campaign = input.campaign_id;
    settle(pool, READ_ERROR, move |connection| {
        Box::pin(async move {
            let settings = ensure_settings(connection).await?;
            let safety = sqlx::query(
                "SELECT global_kill_switch, kill_switch_reason
                 FROM safety_settings WHERE id = 1 LIMIT 1",
            )
            .fetch_optional(&mut *connection)
            .await
            .map_err(read_error)?;
            let pending_jobs = count(
                connection,
                "SELECT COUNT(*) FROM schedule_jobs sj
                 INNER JOIN approvals a ON a.id = sj.approval_id
                 WHERE sj.status = 'scheduled' AND (?1 IS NULL OR a.campaign_id = ?1)",
                campaign,
            )
            .await?;
            let due_count = count(
                connection,
                "SELECT COUNT(*) FROM schedule_jobs sj
                 INNER JOIN approvals a ON a.id = sj.approval_id
                 WHERE sj.status = 'scheduled'
                   AND datetime(sj.scheduled_for) <= datetime('now')
                   AND (sj.next_attempt_at IS NULL OR datetime(sj.next_attempt_at) <= datetime('now'))
                   AND (?1 IS NULL OR a.campaign_id = ?1)",
                campaign,
            )
            .await?;
            let failed_jobs = count(
                connection,
                "SELECT COUNT(*) FROM schedule_jobs sj
                 INNER JOIN approvals a ON a.id = sj.approval_id
                 WHERE sj.status = 'failed' AND (?1 IS NULL OR a.campaign_id = ?1)",
                campaign,
            )
            .await?;
            let due_jobs: Vec<DueScheduleJobRow> = rows(
                connection,
                "SELECT sj.id, sj.approval_id, sj.platform, sj.scheduled_for, sj.timezone,
                        sj.status, sj.idempotency_key, sj.attempt_count, sj.max_attempts,
                        sj.next_attempt_at, sj.last_attempted_at, sj.last_error,
                        sj.locked_at, sj.locked_by, sj.created_at, sj.updated_at,
                        a.campaign_id, a.status AS approval_status,
                        c.name AS campaign_name, c.status AS campaign_status,
                        dv.hook AS variant_hook
                 FROM schedule_jobs sj
                 INNER JOIN approvals a ON a.id = sj.approval_id
                 INNER JOIN campaigns c ON c.id = a.campaign_id
                 INNER JOIN draft_variants dv ON dv.id = a.draft_variant_id
                 WHERE sj.status = 'scheduled'
                   AND (datetime(sj.scheduled_for) <= datetime('now', '+24 hours') OR sj.last_error <> '')
                   AND (?1 IS NULL OR a.campaign_id = ?1)
                 ORDER BY datetime(sj.scheduled_for) ASC, sj.id ASC
                 LIMIT ?2",
                campaign,
                DUE_JOBS_LIMIT,
            )
            .await?
            .iter()
            .map(due_job)
            .collect();
            let recent_events: Vec<SchedulerEventRow> = rows(
                connection,
                "SELECT se.id, se.campaign_id, se.approval_id, se.schedule_job_id,
                        se.event_type, se.severity, se.summary, se.metadata_json,
                        se.created_at, c.name AS campaign_name
                 FROM scheduler_events se
                 LEFT JOIN campaigns c ON c.id = se.campaign_id
                 WHERE (?1 IS NULL OR se.campaign_id = ?1)
                 ORDER BY datetime(se.created_at) DESC, se.id DESC
                 LIMIT ?2",
                campaign,
                EVENTS_LIMIT,
            )
            .await?
            .iter()
            .map(event)
            .collect();
            let recent_attempts: Vec<SchedulerPublishAttemptRow> = rows(
                connection,
                "SELECT pa.id, pa.approval_id, pa.schedule_job_id, pa.platform, pa.status,
                        pa.external_post_url, pa.platform_post_id, pa.error_message,
                        pa.created_at, a.campaign_id, c.name AS campaign_name,
                        COALESCE(dv.hook, '') AS variant_hook
                 FROM publish_attempts pa
                 LEFT JOIN approvals a ON a.id = pa.approval_id
                 LEFT JOIN campaigns c ON c.id = a.campaign_id
                 LEFT JOIN draft_variants dv ON dv.id = a.draft_variant_id
                 WHERE pa.schedule_job_id IS NOT NULL AND (?1 IS NULL OR a.campaign_id = ?1)
                 ORDER BY datetime(pa.created_at) DESC, pa.id DESC
                 LIMIT ?2",
                campaign,
                ATTEMPTS_LIMIT,
            )
            .await?
            .iter()
            .map(attempt)
            .collect();
            let (global_kill_switch_enabled, kill_switch_reason) = match safety {
                Some(row) => (
                    row.get::<i64, _>("global_kill_switch") == 1,
                    row.get::<String, _>("kill_switch_reason"),
                ),
                None => (false, String::new()),
            };
            Ok(Settlement::Accepted(SchedulerDashboard {
                settings,
                summary: SchedulerDashboardSummary {
                    pending_jobs,
                    due_jobs: due_count,
                    failed_jobs,
                    recent_attempts: recent_attempts.len() as i64,
                },
                due_jobs,
                recent_events,
                recent_attempts,
                global_kill_switch_enabled,
                kill_switch_reason,
            }))
        })
    })
    .await
}

#[tauri::command]
pub async fn linkgo_scheduler_dashboard_get(
    pool: State<'_, SqlitePool>,
    input: SchedulerDashboardInput,
) -> Result<SchedulerDashboard, String> {
    get_scheduler_dashboard(pool.inner(), input).await
}

#[cfg(test)]
#[path = "scheduler_store_tests.rs"]
mod tests;
