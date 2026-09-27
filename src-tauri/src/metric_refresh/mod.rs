use serde::Serialize;
use sqlx::{Row, SqlitePool};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, OnceLock,
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

use crate::auth::storage::AuthStorage;
use crate::auth::{
    linkedin::refresh_linkedin_credential,
    linkedin_api::{get_linkedin_social_metadata, resolve_linkedin_target_urn},
    publish::{
        credentials_need_refresh, linkedin_oauth_credentials, merge_refreshed_linkedin_credential,
        sqlite_pool,
    },
    redact_error, OAuthCredentials, StoredCredential,
};

const LOCK_STALE_MINUTES: i64 = 10;
const LINKEDIN_READ_SCOPE_ERROR: &str =
    "LinkedIn read access with r_member_social_feed is required; reconnect after access is approved";
const API_SOURCE_NOTE: &str =
    "LinkedIn social metadata API snapshot: reactions and comments only. Impressions, reposts, profile visits, link clicks, and CTR remain manual-only for member posts.";

static WORKER: OnceLock<Mutex<Option<MetricRefreshWorker>>> = OnceLock::new();

#[derive(Clone)]
struct MetricRefreshWorker {
    runner_id: String,
    stop: Arc<AtomicBool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricRefreshSettingsPayload {
    pub enabled: bool,
    pub poll_interval_minutes: i64,
    pub max_jobs_per_tick: i64,
    pub refresh_interval_hours: i64,
    pub retry_backoff_minutes: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricRefreshStatusPayload {
    pub enabled: bool,
    pub running: bool,
    pub runner_id: Option<String>,
    pub settings: MetricRefreshSettingsPayload,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricRefreshTickResult {
    pub claimed: i64,
    pub refreshed: i64,
    pub retry_scheduled: i64,
    pub unavailable: i64,
    pub failed: i64,
    pub blocked: i64,
    pub seeded: i64,
}

#[derive(Debug, Clone)]
struct MetricRefreshSettings {
    enabled: bool,
    poll_interval_minutes: i64,
    max_jobs_per_tick: i64,
    refresh_interval_hours: i64,
    retry_backoff_minutes: i64,
    updated_at: String,
}

#[derive(Debug, Clone)]
struct DueMetricRefreshJob {
    id: i64,
    campaign_id: i64,
    approval_id: i64,
    publish_attempt_id: Option<i64>,
    target_urn: String,
    attempt_count: i64,
    max_attempts: i64,
}

#[cfg(test)]
#[derive(Debug, Clone)]
pub(crate) struct DueMetricRefreshEligibilityInput<'a> {
    pub job_status: &'a str,
    pub approval_status: &'a str,
    pub campaign_status: &'a str,
    pub next_refresh_at_epoch: i64,
    pub locked_at_epoch: Option<i64>,
    pub now_epoch: i64,
    pub stale_lock_after_seconds: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum RefreshFailureKind {
    Retryable,
    PermissionUnavailable,
}

fn worker_slot() -> &'static Mutex<Option<MetricRefreshWorker>> {
    WORKER.get_or_init(|| Mutex::new(None))
}

fn runner_id() -> String {
    format!("metric-refresh-{}", unix_timestamp())
}

fn unix_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}

pub(crate) fn compute_next_refresh_unix_seconds(
    now_epoch: i64,
    refresh_interval_hours: i64,
) -> i64 {
    now_epoch + refresh_interval_hours.clamp(1, 168) * 3600
}

pub(crate) fn compute_retry_unix_seconds(
    now_epoch: i64,
    attempt_count: i64,
    retry_backoff_minutes: i64,
) -> i64 {
    now_epoch + attempt_count.max(1) * retry_backoff_minutes.clamp(5, 1440) * 60
}

#[cfg(test)]
pub(crate) fn is_due_metric_refresh_job(input: &DueMetricRefreshEligibilityInput<'_>) -> bool {
    if input.job_status != "active" {
        return false;
    }
    if input.approval_status != "published" {
        return false;
    }
    if input.campaign_status == "archived" {
        return false;
    }
    if input.next_refresh_at_epoch > input.now_epoch {
        return false;
    }
    if input
        .locked_at_epoch
        .is_some_and(|locked_at| locked_at + input.stale_lock_after_seconds > input.now_epoch)
    {
        return false;
    }
    true
}

pub(crate) fn resolve_refresh_target_urn(
    platform_post_id: &str,
    external_post_url: &str,
) -> Option<String> {
    resolve_linkedin_target_urn(platform_post_id)
        .or_else(|| resolve_linkedin_target_urn(external_post_url))
}

pub(crate) fn has_linkedin_metric_read_scope(credentials: &OAuthCredentials) -> bool {
    credentials
        .scopes
        .iter()
        .any(|scope| scope == "r_member_social_feed")
}

pub(crate) fn classify_refresh_error(error: &str) -> RefreshFailureKind {
    let lowered = error.to_ascii_lowercase();
    if lowered.contains("401")
        || lowered.contains("403")
        || lowered.contains("unauthorized")
        || lowered.contains("forbidden")
        || lowered.contains("permission")
        || lowered.contains("scope")
        || lowered.contains("r_member_social_feed")
    {
        RefreshFailureKind::PermissionUnavailable
    } else {
        RefreshFailureKind::Retryable
    }
}

fn payload_from_settings(
    settings: MetricRefreshSettings,
    running: bool,
    runner_id: Option<String>,
) -> MetricRefreshStatusPayload {
    MetricRefreshStatusPayload {
        enabled: settings.enabled,
        running,
        runner_id,
        settings: MetricRefreshSettingsPayload {
            enabled: settings.enabled,
            poll_interval_minutes: settings.poll_interval_minutes,
            max_jobs_per_tick: settings.max_jobs_per_tick,
            refresh_interval_hours: settings.refresh_interval_hours,
            retry_backoff_minutes: settings.retry_backoff_minutes,
            updated_at: settings.updated_at,
        },
    }
}

async fn ensure_settings_row(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query("INSERT OR IGNORE INTO metric_refresh_settings (id) VALUES (1)")
        .execute(pool)
        .await
        .map_err(|_| "Could not initialize metric refresh settings".to_string())?;
    Ok(())
}

async fn load_settings(pool: &SqlitePool) -> Result<MetricRefreshSettings, String> {
    ensure_settings_row(pool).await?;
    let row = sqlx::query(
        "SELECT enabled, poll_interval_minutes, max_jobs_per_tick, refresh_interval_hours, retry_backoff_minutes, updated_at
        FROM metric_refresh_settings
        WHERE id = 1",
    )
    .fetch_one(pool)
    .await
    .map_err(|_| "Could not read metric refresh settings".to_string())?;

    Ok(MetricRefreshSettings {
        enabled: row.try_get::<i64, _>("enabled").unwrap_or(0) == 1,
        poll_interval_minutes: row.try_get("poll_interval_minutes").unwrap_or(360),
        max_jobs_per_tick: row.try_get("max_jobs_per_tick").unwrap_or(3),
        refresh_interval_hours: row.try_get("refresh_interval_hours").unwrap_or(6),
        retry_backoff_minutes: row.try_get("retry_backoff_minutes").unwrap_or(60),
        updated_at: row.try_get("updated_at").unwrap_or_default(),
    })
}

async fn set_enabled(pool: &SqlitePool, enabled: bool) -> Result<(), String> {
    ensure_settings_row(pool).await?;
    sqlx::query(
        "UPDATE metric_refresh_settings
        SET enabled = ?, updated_at = datetime('now')
        WHERE id = 1",
    )
    .bind(if enabled { 1 } else { 0 })
    .execute(pool)
    .await
    .map_err(|_| "Could not update metric refresh settings".to_string())?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn insert_refresh_event(
    pool: &SqlitePool,
    campaign_id: Option<i64>,
    approval_id: Option<i64>,
    metric_refresh_job_id: Option<i64>,
    post_metric_id: Option<i64>,
    event_type: &str,
    severity: &str,
    summary: &str,
    metadata_json: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO metric_refresh_events (
            campaign_id,
            approval_id,
            metric_refresh_job_id,
            post_metric_id,
            event_type,
            severity,
            summary,
            metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(campaign_id)
    .bind(approval_id)
    .bind(metric_refresh_job_id)
    .bind(post_metric_id)
    .bind(event_type)
    .bind(severity)
    .bind(summary)
    .bind(metadata_json)
    .execute(pool)
    .await
    .map_err(|_| "Could not record metric refresh event".to_string())?;
    Ok(())
}

async fn kill_switch_block_reason(pool: &SqlitePool) -> Result<Option<String>, String> {
    let row = sqlx::query(
        "SELECT global_kill_switch, kill_switch_reason FROM safety_settings WHERE id = 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(|_| "Could not read safety settings".to_string())?;

    let Some(row) = row else {
        return Ok(None);
    };
    let global_kill_switch: i64 = row.try_get("global_kill_switch").unwrap_or(0);
    if global_kill_switch != 1 {
        return Ok(None);
    }

    let reason: String = row.try_get("kill_switch_reason").unwrap_or_default();
    Ok(Some(if reason.trim().is_empty() {
        "Global kill switch is enabled".to_string()
    } else {
        format!("Global kill switch is enabled: {reason}")
    }))
}

async fn seed_jobs(pool: &SqlitePool) -> Result<i64, String> {
    let rows = sqlx::query(
        "SELECT
            a.campaign_id,
            a.id AS approval_id,
            pa.id AS publish_attempt_id,
            pa.platform_post_id,
            pa.external_post_url
        FROM approvals a
        INNER JOIN campaigns c ON c.id = a.campaign_id
        INNER JOIN publish_attempts pa ON pa.id = (
            SELECT latest_pa.id FROM publish_attempts latest_pa
            WHERE latest_pa.approval_id = a.id
                AND latest_pa.status = 'succeeded'
                AND latest_pa.platform = 'linkedin'
            ORDER BY datetime(latest_pa.created_at) DESC, latest_pa.id DESC
            LIMIT 1
        )
        WHERE a.status = 'published'
            AND c.status <> 'archived'",
    )
    .fetch_all(pool)
    .await
    .map_err(|_| "Could not seed metric refresh jobs".to_string())?;

    let mut seeded = 0;
    for row in rows {
        let campaign_id: i64 = row.try_get("campaign_id").unwrap_or_default();
        let approval_id: i64 = row.try_get("approval_id").unwrap_or_default();
        let publish_attempt_id: i64 = row.try_get("publish_attempt_id").unwrap_or_default();
        let platform_post_id: String = row.try_get("platform_post_id").unwrap_or_default();
        let external_post_url: String = row.try_get("external_post_url").unwrap_or_default();
        let target_urn =
            resolve_refresh_target_urn(&platform_post_id, &external_post_url).unwrap_or_default();
        let status = if target_urn.is_empty() {
            "unavailable"
        } else {
            "active"
        };
        let result = sqlx::query(
            "INSERT OR IGNORE INTO metric_refresh_jobs (
                campaign_id,
                approval_id,
                publish_attempt_id,
                platform,
                target_urn,
                status,
                last_error,
                updated_at
            ) VALUES (?, ?, ?, 'linkedin', ?, ?, ?, datetime('now'))",
        )
        .bind(campaign_id)
        .bind(approval_id)
        .bind(publish_attempt_id)
        .bind(&target_urn)
        .bind(status)
        .bind(if target_urn.is_empty() {
            "LinkedIn target URN could not be resolved"
        } else {
            ""
        })
        .execute(pool)
        .await
        .map_err(|_| "Could not create metric refresh job".to_string())?;
        if result.rows_affected() == 1 {
            seeded += 1;
            if target_urn.is_empty() {
                insert_refresh_event(
                    pool,
                    Some(campaign_id),
                    Some(approval_id),
                    Some(result.last_insert_rowid()),
                    None,
                    "refresh_unavailable",
                    "warning",
                    "Metric refresh is unavailable because no LinkedIn target URN could be resolved.",
                    "{}",
                )
                .await?;
            }
        } else if !target_urn.is_empty() {
            sqlx::query(
                "UPDATE metric_refresh_jobs
                SET publish_attempt_id = ?, target_urn = ?, updated_at = datetime('now')
                WHERE approval_id = ? AND status = 'active'",
            )
            .bind(publish_attempt_id)
            .bind(&target_urn)
            .bind(approval_id)
            .execute(pool)
            .await
            .map_err(|_| "Could not update metric refresh job target".to_string())?;
        }
    }
    Ok(seeded)
}

async fn select_due_jobs(
    pool: &SqlitePool,
    max_jobs: i64,
) -> Result<Vec<DueMetricRefreshJob>, String> {
    let rows = sqlx::query(
        "SELECT
            mrj.id,
            mrj.campaign_id,
            mrj.approval_id,
            mrj.publish_attempt_id,
            mrj.target_urn,
            mrj.attempt_count,
            mrj.max_attempts
        FROM metric_refresh_jobs mrj
        INNER JOIN approvals a ON a.id = mrj.approval_id
        INNER JOIN campaigns c ON c.id = mrj.campaign_id
        WHERE mrj.status = 'active'
            AND mrj.target_urn <> ''
            AND a.status = 'published'
            AND c.status <> 'archived'
            AND datetime(mrj.next_refresh_at) <= datetime('now')
            AND (
                mrj.locked_at IS NULL
                OR datetime(mrj.locked_at) <= datetime('now', ?)
            )
        ORDER BY datetime(mrj.next_refresh_at) ASC, mrj.id ASC
        LIMIT ?",
    )
    .bind(format!("-{LOCK_STALE_MINUTES} minutes"))
    .bind(max_jobs)
    .fetch_all(pool)
    .await
    .map_err(|_| "Could not read due metric refresh jobs".to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| DueMetricRefreshJob {
            id: row.try_get("id").unwrap_or_default(),
            campaign_id: row.try_get("campaign_id").unwrap_or_default(),
            approval_id: row.try_get("approval_id").unwrap_or_default(),
            publish_attempt_id: row.try_get("publish_attempt_id").ok(),
            target_urn: row.try_get("target_urn").unwrap_or_default(),
            attempt_count: row.try_get("attempt_count").unwrap_or_default(),
            max_attempts: row.try_get("max_attempts").unwrap_or(3),
        })
        .collect())
}

async fn claim_job(
    pool: &SqlitePool,
    job: &mut DueMetricRefreshJob,
    runner_id: &str,
) -> Result<bool, String> {
    let result = sqlx::query(
        "UPDATE metric_refresh_jobs
        SET
            locked_at = datetime('now'),
            locked_by = ?,
            last_attempted_at = datetime('now'),
            attempt_count = attempt_count + 1,
            updated_at = datetime('now')
        WHERE id = ?
            AND status = 'active'
            AND (
                locked_at IS NULL
                OR datetime(locked_at) <= datetime('now', ?)
            )",
    )
    .bind(runner_id)
    .bind(job.id)
    .bind(format!("-{LOCK_STALE_MINUTES} minutes"))
    .execute(pool)
    .await
    .map_err(|_| "Could not claim metric refresh job".to_string())?;

    let claimed = result.rows_affected() == 1;
    if claimed {
        job.attempt_count += 1;
        insert_refresh_event(
            pool,
            Some(job.campaign_id),
            Some(job.approval_id),
            Some(job.id),
            None,
            "refresh_started",
            "info",
            "Metric refresh job started.",
            &format!("{{\"runnerId\":\"{}\"}}", runner_id),
        )
        .await?;
    }
    Ok(claimed)
}

async fn mark_success(
    pool: &SqlitePool,
    job: &DueMetricRefreshJob,
    reactions: i64,
    comments: i64,
    raw_payload_json: &str,
    refresh_interval_hours: i64,
) -> Result<(), String> {
    let metric = sqlx::query(
        "INSERT INTO post_metrics (
            campaign_id,
            approval_id,
            publish_attempt_id,
            platform,
            measured_at,
            impressions,
            reactions,
            comments,
            reposts,
            profile_visits,
            link_clicks,
            ctr,
            notes,
            collection_source,
            raw_payload_json,
            updated_at
        ) VALUES (?, ?, ?, 'linkedin', datetime('now'), 0, ?, ?, 0, 0, 0, NULL, ?, 'linkedin_social_metadata', ?, datetime('now'))",
    )
    .bind(job.campaign_id)
    .bind(job.approval_id)
    .bind(job.publish_attempt_id)
    .bind(reactions)
    .bind(comments)
    .bind(API_SOURCE_NOTE)
    .bind(raw_payload_json)
    .execute(pool)
    .await
    .map_err(|_| "Could not record LinkedIn metric snapshot".to_string())?;
    let post_metric_id = metric.last_insert_rowid();

    sqlx::query(
        "INSERT INTO learning_events (
            campaign_id,
            post_metric_id,
            campaign_memory_id,
            event_type,
            summary
        ) VALUES (?, ?, NULL, 'metric_recorded', ?)",
    )
    .bind(job.campaign_id)
    .bind(post_metric_id)
    .bind(format!(
        "LinkedIn social metadata recorded for approval #{}",
        job.approval_id
    ))
    .execute(pool)
    .await
    .map_err(|_| "Could not record metric learning event".to_string())?;

    let next_refresh_epoch =
        compute_next_refresh_unix_seconds(unix_timestamp(), refresh_interval_hours);
    sqlx::query(
        "UPDATE metric_refresh_jobs
        SET
            next_refresh_at = datetime(?, 'unixepoch'),
            last_refreshed_at = datetime('now'),
            failure_count = 0,
            last_error = '',
            locked_at = NULL,
            locked_by = NULL,
            updated_at = datetime('now')
        WHERE id = ?",
    )
    .bind(next_refresh_epoch)
    .bind(job.id)
    .execute(pool)
    .await
    .map_err(|_| "Could not schedule next metric refresh".to_string())?;

    insert_refresh_event(
        pool,
        Some(job.campaign_id),
        Some(job.approval_id),
        Some(job.id),
        Some(post_metric_id),
        "refresh_completed",
        "info",
        "LinkedIn social metadata refresh completed.",
        &format!("{{\"reactions\":{},\"comments\":{}}}", reactions, comments),
    )
    .await?;
    Ok(())
}

async fn mark_unavailable(
    pool: &SqlitePool,
    job: &DueMetricRefreshJob,
    error: &str,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE metric_refresh_jobs
        SET
            status = 'unavailable',
            failure_count = failure_count + 1,
            last_error = ?,
            locked_at = NULL,
            locked_by = NULL,
            updated_at = datetime('now')
        WHERE id = ?",
    )
    .bind(error)
    .bind(job.id)
    .execute(pool)
    .await
    .map_err(|_| "Could not mark metric refresh unavailable".to_string())?;

    insert_refresh_event(
        pool,
        Some(job.campaign_id),
        Some(job.approval_id),
        Some(job.id),
        None,
        "refresh_unavailable",
        "warning",
        error,
        "{}",
    )
    .await?;
    Ok(())
}

async fn mark_retry(
    pool: &SqlitePool,
    job: &DueMetricRefreshJob,
    error: &str,
    retry_backoff_minutes: i64,
) -> Result<(), String> {
    let next_retry_epoch =
        compute_retry_unix_seconds(unix_timestamp(), job.attempt_count, retry_backoff_minutes);
    sqlx::query(
        "UPDATE metric_refresh_jobs
        SET
            next_refresh_at = datetime(?, 'unixepoch'),
            failure_count = failure_count + 1,
            last_error = ?,
            locked_at = NULL,
            locked_by = NULL,
            updated_at = datetime('now')
        WHERE id = ?",
    )
    .bind(next_retry_epoch)
    .bind(error)
    .bind(job.id)
    .execute(pool)
    .await
    .map_err(|_| "Could not schedule metric refresh retry".to_string())?;

    insert_refresh_event(
        pool,
        Some(job.campaign_id),
        Some(job.approval_id),
        Some(job.id),
        None,
        "refresh_retry_scheduled",
        "warning",
        "LinkedIn metric refresh failed and will retry.",
        &format!("{{\"attemptCount\":{}}}", job.attempt_count),
    )
    .await?;
    Ok(())
}

async fn mark_terminal_failure(
    pool: &SqlitePool,
    job: &DueMetricRefreshJob,
    error: &str,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE metric_refresh_jobs
        SET
            status = 'failed',
            failure_count = failure_count + 1,
            last_error = ?,
            locked_at = NULL,
            locked_by = NULL,
            updated_at = datetime('now')
        WHERE id = ?",
    )
    .bind(error)
    .bind(job.id)
    .execute(pool)
    .await
    .map_err(|_| "Could not fail metric refresh job".to_string())?;

    insert_refresh_event(
        pool,
        Some(job.campaign_id),
        Some(job.approval_id),
        Some(job.id),
        None,
        "refresh_failed",
        "error",
        "LinkedIn metric refresh failed permanently.",
        &format!("{{\"attemptCount\":{}}}", job.attempt_count),
    )
    .await?;
    Ok(())
}

fn linked_in_credentials(app: &AppHandle) -> Result<OAuthCredentials, String> {
    let storage = AuthStorage::new(app)?;
    let mut credentials = linkedin_oauth_credentials(storage.load("linkedin")?)?;
    if credentials_need_refresh(&credentials) {
        let refreshed = refresh_linkedin_credential(credentials.clone())?;
        credentials = merge_refreshed_linkedin_credential(credentials, refreshed)?;
        storage.save(StoredCredential::OAuth(credentials.clone()))?;
    }
    if !has_linkedin_metric_read_scope(&credentials) {
        return Err(LINKEDIN_READ_SCOPE_ERROR.to_string());
    }
    Ok(credentials)
}

async fn run_tick(app: &AppHandle, runner_id: &str) -> Result<MetricRefreshTickResult, String> {
    let pool = sqlite_pool(app).await?;
    let settings = load_settings(&pool).await?;
    let mut result = MetricRefreshTickResult {
        claimed: 0,
        refreshed: 0,
        retry_scheduled: 0,
        unavailable: 0,
        failed: 0,
        blocked: 0,
        seeded: 0,
    };

    insert_refresh_event(
        &pool,
        None,
        None,
        None,
        None,
        "tick_started",
        "info",
        "Metric refresh tick started.",
        &format!("{{\"runnerId\":\"{}\"}}", runner_id),
    )
    .await?;

    result.seeded = seed_jobs(&pool).await?;
    let due_jobs = select_due_jobs(&pool, settings.max_jobs_per_tick).await?;

    if let Some(reason) = kill_switch_block_reason(&pool).await? {
        for job in due_jobs {
            result.blocked += 1;
            insert_refresh_event(
                &pool,
                Some(job.campaign_id),
                Some(job.approval_id),
                Some(job.id),
                None,
                "refresh_blocked",
                "warning",
                &format!("Metric refresh skipped: {reason}"),
                "{}",
            )
            .await?;
        }
        insert_refresh_event(
            &pool,
            None,
            None,
            None,
            None,
            "tick_completed",
            "info",
            "Metric refresh tick completed.",
            &format!("{{\"blocked\":{}}}", result.blocked),
        )
        .await?;
        return Ok(result);
    }

    let credentials_result = if due_jobs.is_empty() {
        None
    } else {
        Some(linked_in_credentials(app).map_err(redact_error))
    };

    for mut job in due_jobs {
        if !claim_job(&pool, &mut job, runner_id).await? {
            continue;
        }
        result.claimed += 1;

        let credentials = match &credentials_result {
            Some(Ok(credentials)) => credentials,
            Some(Err(error)) => {
                mark_unavailable(&pool, &job, error).await?;
                result.unavailable += 1;
                continue;
            }
            None => continue,
        };

        match get_linkedin_social_metadata(&credentials.access_token, &job.target_urn) {
            Ok(metadata) => {
                mark_success(
                    &pool,
                    &job,
                    metadata.reactions,
                    metadata.comments,
                    &metadata.raw_payload_json,
                    settings.refresh_interval_hours,
                )
                .await?;
                result.refreshed += 1;
            }
            Err(error) => {
                let redacted = redact_error(error);
                if classify_refresh_error(&redacted) == RefreshFailureKind::PermissionUnavailable {
                    mark_unavailable(&pool, &job, &redacted).await?;
                    result.unavailable += 1;
                } else if job.attempt_count >= job.max_attempts {
                    mark_terminal_failure(&pool, &job, &redacted).await?;
                    result.failed += 1;
                } else {
                    mark_retry(&pool, &job, &redacted, settings.retry_backoff_minutes).await?;
                    result.retry_scheduled += 1;
                }
            }
        }
    }

    insert_refresh_event(
        &pool,
        None,
        None,
        None,
        None,
        "tick_completed",
        "info",
        "Metric refresh tick completed.",
        &format!(
            "{{\"claimed\":{},\"refreshed\":{},\"retryScheduled\":{},\"unavailable\":{},\"failed\":{},\"blocked\":{},\"seeded\":{}}}",
            result.claimed,
            result.refreshed,
            result.retry_scheduled,
            result.unavailable,
            result.failed,
            result.blocked,
            result.seeded
        ),
    )
    .await?;

    Ok(result)
}

fn current_worker() -> (bool, Option<String>) {
    let guard = worker_slot()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let Some(worker) = guard.as_ref() else {
        return (false, None);
    };
    if worker.stop.load(Ordering::SeqCst) {
        (false, Some(worker.runner_id.clone()))
    } else {
        (true, Some(worker.runner_id.clone()))
    }
}

fn spawn_worker(app: AppHandle, runner_id: String, stop: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        while !stop.load(Ordering::SeqCst) {
            let _ = tauri::async_runtime::block_on(run_tick(&app, &runner_id));
            let sleep_minutes = tauri::async_runtime::block_on(async {
                let pool = sqlite_pool(&app).await?;
                let settings = load_settings(&pool).await?;
                Ok::<i64, String>(settings.poll_interval_minutes)
            })
            .unwrap_or(360)
            .clamp(15, 1440);

            for _ in 0..(sleep_minutes * 60) {
                if stop.load(Ordering::SeqCst) {
                    break;
                }
                std::thread::sleep(Duration::from_secs(1));
            }
        }

        let mut guard = worker_slot()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if guard
            .as_ref()
            .is_some_and(|worker| worker.runner_id == runner_id)
        {
            *guard = None;
        }
    });
}

#[tauri::command]
pub fn linkgo_metric_refresh_status(app: AppHandle) -> Result<MetricRefreshStatusPayload, String> {
    let pool = tauri::async_runtime::block_on(sqlite_pool(&app))?;
    let settings = tauri::async_runtime::block_on(load_settings(&pool))?;
    let (running, runner_id) = current_worker();
    Ok(payload_from_settings(settings, running, runner_id))
}

#[tauri::command]
pub fn linkgo_metric_refresh_start(app: AppHandle) -> Result<MetricRefreshStatusPayload, String> {
    let pool = tauri::async_runtime::block_on(sqlite_pool(&app))?;
    tauri::async_runtime::block_on(set_enabled(&pool, true))?;

    let mut should_spawn = None;
    {
        let mut guard = worker_slot()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if guard
            .as_ref()
            .is_none_or(|worker| worker.stop.load(Ordering::SeqCst))
        {
            let runner_id = runner_id();
            let stop = Arc::new(AtomicBool::new(false));
            *guard = Some(MetricRefreshWorker {
                runner_id: runner_id.clone(),
                stop: stop.clone(),
            });
            should_spawn = Some((runner_id, stop));
        }
    }

    if let Some((runner_id, stop)) = should_spawn {
        tauri::async_runtime::block_on(insert_refresh_event(
            &pool,
            None,
            None,
            None,
            None,
            "worker_started",
            "info",
            "Metric refresh worker started.",
            &format!("{{\"runnerId\":\"{}\"}}", runner_id),
        ))?;
        spawn_worker(app.clone(), runner_id, stop);
    }

    linkgo_metric_refresh_status(app)
}

#[tauri::command]
pub fn linkgo_metric_refresh_stop(app: AppHandle) -> Result<MetricRefreshStatusPayload, String> {
    let pool = tauri::async_runtime::block_on(sqlite_pool(&app))?;
    tauri::async_runtime::block_on(set_enabled(&pool, false))?;

    let runner_id = {
        let guard = worker_slot()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.as_ref().map(|worker| {
            worker.stop.store(true, Ordering::SeqCst);
            worker.runner_id.clone()
        })
    };

    tauri::async_runtime::block_on(insert_refresh_event(
        &pool,
        None,
        None,
        None,
        None,
        "worker_stopped",
        "info",
        "Metric refresh worker stopped.",
        &format!(
            "{{\"runnerId\":\"{}\"}}",
            runner_id.unwrap_or_else(|| "none".to_string())
        ),
    ))?;

    linkgo_metric_refresh_status(app)
}

#[tauri::command]
pub fn linkgo_metric_refresh_tick(app: AppHandle) -> Result<MetricRefreshTickResult, String> {
    let runner = current_worker()
        .1
        .unwrap_or_else(|| format!("manual-{}", unix_timestamp()));
    tauri::async_runtime::block_on(run_tick(&app, &runner))
}

#[cfg(test)]
mod tests {
    use super::{
        classify_refresh_error, compute_next_refresh_unix_seconds, compute_retry_unix_seconds,
        has_linkedin_metric_read_scope, insert_refresh_event, is_due_metric_refresh_job,
        resolve_refresh_target_urn, DueMetricRefreshEligibilityInput, RefreshFailureKind,
    };
    use crate::auth::OAuthCredentials;
    use sqlx::{sqlite::SqlitePoolOptions, Row};

    fn due_input() -> DueMetricRefreshEligibilityInput<'static> {
        DueMetricRefreshEligibilityInput {
            job_status: "active",
            approval_status: "published",
            campaign_status: "active",
            next_refresh_at_epoch: 100,
            locked_at_epoch: None,
            now_epoch: 200,
            stale_lock_after_seconds: 600,
        }
    }

    fn credentials(scopes: Vec<&str>) -> OAuthCredentials {
        OAuthCredentials {
            access_token: "access".to_string(),
            refresh_token: None,
            expires_at: None,
            refresh_expires_at: None,
            account_id: None,
            account_label: None,
            scopes: scopes.into_iter().map(ToString::to_string).collect(),
            provider_key: "linkedin".to_string(),
            needs_reauth: false,
        }
    }

    #[test]
    fn due_job_eligibility_accepts_due_active_published_jobs() {
        assert!(is_due_metric_refresh_job(&due_input()));
    }

    #[test]
    fn refresh_event_insert_matches_migration_schema() {
        tauri::async_runtime::block_on(async {
            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect("sqlite::memory:")
                .await
                .expect("in-memory SQLite pool should connect");
            for create_parent_table in [
                "CREATE TABLE campaigns (id INTEGER PRIMARY KEY)",
                "CREATE TABLE approvals (id INTEGER PRIMARY KEY)",
                "CREATE TABLE metric_refresh_jobs (id INTEGER PRIMARY KEY)",
                "CREATE TABLE post_metrics (id INTEGER PRIMARY KEY)",
            ] {
                sqlx::query(create_parent_table)
                    .execute(&pool)
                    .await
                    .expect("parent table should be created");
            }

            sqlx::query(
                "CREATE TABLE metric_refresh_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
                    approval_id INTEGER REFERENCES approvals(id) ON DELETE SET NULL,
                    metric_refresh_job_id INTEGER REFERENCES metric_refresh_jobs(id) ON DELETE SET NULL,
                    post_metric_id INTEGER REFERENCES post_metrics(id) ON DELETE SET NULL,
                    event_type TEXT NOT NULL CHECK(event_type IN ('refresh_started', 'refresh_completed', 'refresh_retry_scheduled', 'refresh_unavailable', 'refresh_failed', 'refresh_blocked', 'worker_started', 'worker_stopped', 'tick_started', 'tick_completed')),
                    severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info', 'warning', 'error')),
                    summary TEXT NOT NULL,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                )",
            )
            .execute(&pool)
            .await
            .expect("metric_refresh_events schema should be created");

            insert_refresh_event(
                &pool,
                None,
                None,
                None,
                None,
                "worker_started",
                "info",
                "Metric refresh worker started.",
                "{\"runnerId\":\"test-runner\"}",
            )
            .await
            .expect("metric refresh event insert should match schema");

            let row = sqlx::query(
                "SELECT event_type, severity, summary, metadata_json FROM metric_refresh_events",
            )
            .fetch_one(&pool)
            .await
            .expect("inserted metric refresh event should be readable");

            assert_eq!(row.get::<String, _>("event_type"), "worker_started");
            assert_eq!(row.get::<String, _>("severity"), "info");
            assert_eq!(
                row.get::<String, _>("summary"),
                "Metric refresh worker started."
            );
            assert_eq!(
                row.get::<String, _>("metadata_json"),
                "{\"runnerId\":\"test-runner\"}"
            );
        });
    }

    #[test]
    fn due_job_eligibility_excludes_ineligible_jobs() {
        let mut input = due_input();
        input.job_status = "paused";
        assert!(!is_due_metric_refresh_job(&input));

        let mut input = due_input();
        input.approval_status = "approved";
        assert!(!is_due_metric_refresh_job(&input));

        let mut input = due_input();
        input.campaign_status = "archived";
        assert!(!is_due_metric_refresh_job(&input));

        let mut input = due_input();
        input.next_refresh_at_epoch = 300;
        assert!(!is_due_metric_refresh_job(&input));

        let mut input = due_input();
        input.locked_at_epoch = Some(100);
        assert!(!is_due_metric_refresh_job(&input));

        let mut input = due_input();
        input.locked_at_epoch = Some(100);
        input.now_epoch = 701;
        assert!(is_due_metric_refresh_job(&input));
    }

    #[test]
    fn retry_and_refresh_backoff_use_configured_intervals() {
        assert_eq!(compute_next_refresh_unix_seconds(1_000, 6), 22_600);
        assert_eq!(compute_retry_unix_seconds(1_000, 2, 60), 8_200);
    }

    #[test]
    fn target_urn_selection_prefers_platform_post_id_then_external_url() {
        assert_eq!(
            resolve_refresh_target_urn(
                "urn:li:ugcPost:123",
                "https://www.linkedin.com/feed/update/urn:li:activity:456/"
            )
            .as_deref(),
            Some("urn:li:ugcPost:123")
        );
        assert_eq!(
            resolve_refresh_target_urn(
                "",
                "https://www.linkedin.com/feed/update/urn%3Ali%3Aactivity%3A456/"
            )
            .as_deref(),
            Some("urn:li:activity:456")
        );
        assert!(resolve_refresh_target_urn("", "https://example.com/post").is_none());
    }

    #[test]
    fn metric_read_scope_requires_member_feed_scope() {
        assert!(!has_linkedin_metric_read_scope(&credentials(Vec::new())));
        assert!(has_linkedin_metric_read_scope(&credentials(vec![
            "r_member_social_feed"
        ])));
        assert!(!has_linkedin_metric_read_scope(&credentials(vec![
            "w_member_social"
        ])));
    }

    #[test]
    fn permission_errors_are_classified_as_unavailable() {
        assert_eq!(
            classify_refresh_error("LinkedIn API request failed with HTTP 403 Forbidden"),
            RefreshFailureKind::PermissionUnavailable
        );
        assert_eq!(
            classify_refresh_error("timeout while reading response"),
            RefreshFailureKind::Retryable
        );
    }
}
