use serde::Serialize;
use sqlx::{Row, SqlitePool};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, OnceLock,
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

use crate::auth::{
    publish::{
        compose_linkedin_commentary, escape_linkedin_little_text, publish_approved_linkedin_post,
        sqlite_pool, LinkedInPublishPostInput,
    },
    redact_error,
};

const LOCK_STALE_MINUTES: i64 = 10;

static WORKER: OnceLock<Mutex<Option<SchedulerWorker>>> = OnceLock::new();

#[derive(Clone)]
struct SchedulerWorker {
    runner_id: String,
    stop: Arc<AtomicBool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerSettingsPayload {
    pub enabled: bool,
    pub poll_interval_seconds: i64,
    pub max_jobs_per_tick: i64,
    pub retry_backoff_minutes: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerStatusPayload {
    pub enabled: bool,
    pub running: bool,
    pub runner_id: Option<String>,
    pub settings: SchedulerSettingsPayload,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerTickResult {
    pub claimed: i64,
    pub published: i64,
    pub retry_scheduled: i64,
    pub failed: i64,
    pub blocked: i64,
}

#[derive(Debug, Clone)]
struct SchedulerSettings {
    enabled: bool,
    poll_interval_seconds: i64,
    max_jobs_per_tick: i64,
    retry_backoff_minutes: i64,
    updated_at: String,
}

#[derive(Debug, Clone)]
struct DueScheduleJob {
    id: i64,
    approval_id: i64,
    campaign_id: i64,
    attempt_count: i64,
    max_attempts: i64,
    hook: String,
    body: String,
    cta: String,
    hashtags: String,
}

#[cfg(test)]
#[derive(Debug, Clone)]
pub(crate) struct DueJobEligibilityInput<'a> {
    pub schedule_status: &'a str,
    pub approval_status: &'a str,
    pub campaign_status: &'a str,
    pub scheduled_for_epoch: i64,
    pub next_attempt_at_epoch: Option<i64>,
    pub locked_at_epoch: Option<i64>,
    pub now_epoch: i64,
    pub stale_lock_after_seconds: i64,
}

fn worker_slot() -> &'static Mutex<Option<SchedulerWorker>> {
    WORKER.get_or_init(|| Mutex::new(None))
}

fn runner_id() -> String {
    format!("scheduler-{}", unix_timestamp())
}

fn unix_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}

pub(crate) fn compute_next_attempt_unix_seconds(
    now_epoch: i64,
    attempt_count: i64,
    retry_backoff_minutes: i64,
) -> i64 {
    now_epoch + attempt_count.max(1) * retry_backoff_minutes.max(1) * 60
}

#[cfg(test)]
pub(crate) fn is_due_schedule_job(input: &DueJobEligibilityInput<'_>) -> bool {
    if input.schedule_status != "scheduled" {
        return false;
    }
    if input.approval_status != "scheduled" {
        return false;
    }
    if input.campaign_status == "archived" {
        return false;
    }
    if input.scheduled_for_epoch > input.now_epoch {
        return false;
    }
    if input
        .next_attempt_at_epoch
        .is_some_and(|next_attempt_at| next_attempt_at > input.now_epoch)
    {
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

fn payload_from_settings(
    settings: SchedulerSettings,
    running: bool,
    runner_id: Option<String>,
) -> SchedulerStatusPayload {
    SchedulerStatusPayload {
        enabled: settings.enabled,
        running,
        runner_id,
        settings: SchedulerSettingsPayload {
            enabled: settings.enabled,
            poll_interval_seconds: settings.poll_interval_seconds,
            max_jobs_per_tick: settings.max_jobs_per_tick,
            retry_backoff_minutes: settings.retry_backoff_minutes,
            updated_at: settings.updated_at,
        },
    }
}

async fn ensure_settings_row(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query("INSERT OR IGNORE INTO scheduler_settings (id) VALUES (1)")
        .execute(pool)
        .await
        .map_err(|_| "Could not initialize scheduler settings".to_string())?;
    Ok(())
}

async fn load_settings(pool: &SqlitePool) -> Result<SchedulerSettings, String> {
    ensure_settings_row(pool).await?;
    let row = sqlx::query(
        "SELECT enabled, poll_interval_seconds, max_jobs_per_tick, retry_backoff_minutes, updated_at
        FROM scheduler_settings
        WHERE id = 1",
    )
    .fetch_one(pool)
    .await
    .map_err(|_| "Could not read scheduler settings".to_string())?;

    Ok(SchedulerSettings {
        enabled: row.try_get::<i64, _>("enabled").unwrap_or(0) == 1,
        poll_interval_seconds: row.try_get("poll_interval_seconds").unwrap_or(60),
        max_jobs_per_tick: row.try_get("max_jobs_per_tick").unwrap_or(1),
        retry_backoff_minutes: row.try_get("retry_backoff_minutes").unwrap_or(15),
        updated_at: row.try_get("updated_at").unwrap_or_default(),
    })
}

async fn set_enabled(pool: &SqlitePool, enabled: bool) -> Result<(), String> {
    ensure_settings_row(pool).await?;
    sqlx::query(
        "UPDATE scheduler_settings
        SET enabled = ?, updated_at = datetime('now')
        WHERE id = 1",
    )
    .bind(if enabled { 1 } else { 0 })
    .execute(pool)
    .await
    .map_err(|_| "Could not update scheduler settings".to_string())?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn insert_scheduler_event(
    pool: &SqlitePool,
    campaign_id: Option<i64>,
    approval_id: Option<i64>,
    schedule_job_id: Option<i64>,
    event_type: &str,
    severity: &str,
    summary: &str,
    metadata_json: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO scheduler_events (
            campaign_id,
            approval_id,
            schedule_job_id,
            event_type,
            severity,
            summary,
            metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(campaign_id)
    .bind(approval_id)
    .bind(schedule_job_id)
    .bind(event_type)
    .bind(severity)
    .bind(summary)
    .bind(metadata_json)
    .execute(pool)
    .await
    .map_err(|_| "Could not record scheduler event".to_string())?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn insert_safety_audit_event(
    pool: &SqlitePool,
    campaign_id: i64,
    subject_type: &str,
    subject_id: i64,
    event_type: &str,
    severity: &str,
    summary: &str,
    metadata_json: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO safety_audit_events (
            campaign_id,
            subject_type,
            subject_id,
            event_type,
            severity,
            summary,
            metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(campaign_id)
    .bind(subject_type)
    .bind(subject_id)
    .bind(event_type)
    .bind(severity)
    .bind(summary)
    .bind(metadata_json)
    .execute(pool)
    .await
    .map_err(|_| "Could not record safety audit event".to_string())?;
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

async fn is_kill_switch_enabled(pool: &SqlitePool) -> Result<bool, String> {
    Ok(kill_switch_block_reason(pool).await?.is_some())
}

async fn select_due_jobs(pool: &SqlitePool, max_jobs: i64) -> Result<Vec<DueScheduleJob>, String> {
    let rows = sqlx::query(
        "SELECT
            sj.id,
            sj.approval_id,
            a.campaign_id,
            sj.scheduled_for,
            sj.attempt_count,
            sj.max_attempts,
            dv.hook,
            dv.body,
            dv.cta,
            dv.hashtags
        FROM schedule_jobs sj
        INNER JOIN approvals a ON a.id = sj.approval_id
        INNER JOIN campaigns c ON c.id = a.campaign_id
        INNER JOIN draft_variants dv ON dv.id = a.draft_variant_id
        WHERE sj.status = 'scheduled'
            AND a.status = 'scheduled'
            AND c.status <> 'archived'
            AND datetime(sj.scheduled_for) <= datetime('now')
            AND (sj.next_attempt_at IS NULL OR datetime(sj.next_attempt_at) <= datetime('now'))
            AND (
                sj.locked_at IS NULL
                OR datetime(sj.locked_at) <= datetime('now', ?)
            )
        ORDER BY datetime(sj.scheduled_for) ASC, sj.id ASC
        LIMIT ?",
    )
    .bind(format!("-{LOCK_STALE_MINUTES} minutes"))
    .bind(max_jobs)
    .fetch_all(pool)
    .await
    .map_err(|_| "Could not read due schedule jobs".to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| DueScheduleJob {
            id: row.try_get("id").unwrap_or_default(),
            approval_id: row.try_get("approval_id").unwrap_or_default(),
            campaign_id: row.try_get("campaign_id").unwrap_or_default(),
            attempt_count: row.try_get("attempt_count").unwrap_or_default(),
            max_attempts: row.try_get("max_attempts").unwrap_or(3),
            hook: row.try_get("hook").unwrap_or_default(),
            body: row.try_get("body").unwrap_or_default(),
            cta: row.try_get("cta").unwrap_or_default(),
            hashtags: row.try_get("hashtags").unwrap_or_default(),
        })
        .collect())
}

async fn claim_job(
    pool: &SqlitePool,
    job: &mut DueScheduleJob,
    runner_id: &str,
) -> Result<bool, String> {
    let result = sqlx::query(
        "UPDATE schedule_jobs
        SET
            locked_at = datetime('now'),
            locked_by = ?,
            last_attempted_at = datetime('now'),
            attempt_count = attempt_count + 1,
            updated_at = datetime('now')
        WHERE id = ?
            AND status = 'scheduled'
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
    .map_err(|_| "Could not claim schedule job".to_string())?;

    let claimed = result.rows_affected() == 1;
    if claimed {
        job.attempt_count += 1;
        insert_scheduler_event(
            pool,
            Some(job.campaign_id),
            Some(job.approval_id),
            Some(job.id),
            "job_claimed",
            "info",
            "Scheduler claimed a due LinkedIn post.",
            &format!("{{\"runnerId\":\"{}\"}}", runner_id),
        )
        .await?;
    }
    Ok(claimed)
}

async fn insert_publish_attempt(
    pool: &SqlitePool,
    approval_id: i64,
    schedule_job_id: i64,
    status: &str,
    external_post_url: &str,
    platform_post_id: &str,
    error_message: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO publish_attempts (
            approval_id,
            schedule_job_id,
            platform,
            status,
            external_post_url,
            platform_post_id,
            error_message
        ) VALUES (?, ?, 'linkedin', ?, ?, ?, ?)",
    )
    .bind(approval_id)
    .bind(schedule_job_id)
    .bind(status)
    .bind(external_post_url)
    .bind(platform_post_id)
    .bind(error_message)
    .execute(pool)
    .await
    .map_err(|_| "Could not record publish attempt".to_string())?;
    Ok(())
}

async fn mark_success(
    pool: &SqlitePool,
    job: &DueScheduleJob,
    platform_post_id: &str,
    external_post_url: &str,
) -> Result<(), String> {
    insert_publish_attempt(
        pool,
        job.approval_id,
        job.id,
        "succeeded",
        external_post_url,
        platform_post_id,
        "",
    )
    .await?;
    sqlx::query(
        "UPDATE approvals
        SET status = 'published', updated_at = datetime('now')
        WHERE id = ?",
    )
    .bind(job.approval_id)
    .execute(pool)
    .await
    .map_err(|_| "Could not update approval after scheduled publish".to_string())?;
    sqlx::query(
        "UPDATE schedule_jobs
        SET
            status = 'completed',
            locked_at = NULL,
            locked_by = NULL,
            last_error = '',
            updated_at = datetime('now')
        WHERE id = ?",
    )
    .bind(job.id)
    .execute(pool)
    .await
    .map_err(|_| "Could not complete schedule job".to_string())?;
    insert_safety_audit_event(
        pool,
        job.campaign_id,
        "schedule_job",
        job.id,
        "publish_succeeded",
        "info",
        "Scheduled LinkedIn post was published.",
        &format!("{{\"platformPostId\":\"{}\"}}", platform_post_id),
    )
    .await?;
    insert_scheduler_event(
        pool,
        Some(job.campaign_id),
        Some(job.approval_id),
        Some(job.id),
        "job_published",
        "info",
        "Scheduled LinkedIn post was published.",
        &format!("{{\"platformPostId\":\"{}\"}}", platform_post_id),
    )
    .await?;
    Ok(())
}

async fn mark_retry(
    pool: &SqlitePool,
    job: &DueScheduleJob,
    error: &str,
    retry_backoff_minutes: i64,
) -> Result<(), String> {
    insert_publish_attempt(pool, job.approval_id, job.id, "failed", "", "", error).await?;
    let next_attempt_epoch = compute_next_attempt_unix_seconds(
        unix_timestamp(),
        job.attempt_count,
        retry_backoff_minutes,
    );
    sqlx::query(
        "UPDATE schedule_jobs
        SET
            next_attempt_at = datetime(?, 'unixepoch'),
            locked_at = NULL,
            locked_by = NULL,
            last_error = ?,
            updated_at = datetime('now')
        WHERE id = ?",
    )
    .bind(next_attempt_epoch)
    .bind(error)
    .bind(job.id)
    .execute(pool)
    .await
    .map_err(|_| "Could not schedule retry for schedule job".to_string())?;
    insert_safety_audit_event(
        pool,
        job.campaign_id,
        "schedule_job",
        job.id,
        "publish_failed",
        "warning",
        "Scheduled LinkedIn publish failed and will retry.",
        &format!("{{\"attemptCount\":{}}}", job.attempt_count),
    )
    .await?;
    insert_scheduler_event(
        pool,
        Some(job.campaign_id),
        Some(job.approval_id),
        Some(job.id),
        "job_retry_scheduled",
        "warning",
        "Scheduled LinkedIn publish failed and will retry.",
        &format!("{{\"attemptCount\":{}}}", job.attempt_count),
    )
    .await?;
    Ok(())
}

async fn mark_terminal_failure(
    pool: &SqlitePool,
    job: &DueScheduleJob,
    error: &str,
) -> Result<(), String> {
    insert_publish_attempt(pool, job.approval_id, job.id, "failed", "", "", error).await?;
    sqlx::query(
        "UPDATE approvals
        SET status = 'approved', updated_at = datetime('now')
        WHERE id = ?",
    )
    .bind(job.approval_id)
    .execute(pool)
    .await
    .map_err(|_| "Could not restore approval after scheduler failure".to_string())?;
    sqlx::query(
        "UPDATE schedule_jobs
        SET
            status = 'failed',
            locked_at = NULL,
            locked_by = NULL,
            last_error = ?,
            updated_at = datetime('now')
        WHERE id = ?",
    )
    .bind(error)
    .bind(job.id)
    .execute(pool)
    .await
    .map_err(|_| "Could not fail schedule job".to_string())?;
    sqlx::query(
        "INSERT OR IGNORE INTO error_queue_items (
            campaign_id,
            source_type,
            source_id,
            title,
            detail,
            severity,
            status,
            updated_at
        ) VALUES (?, 'schedule_job', ?, 'Scheduled publish failed', ?, 'error', 'open', datetime('now'))",
    )
    .bind(job.campaign_id)
    .bind(job.id)
    .bind(error)
    .execute(pool)
    .await
    .map_err(|_| "Could not create scheduler error queue item".to_string())?;
    sqlx::query(
        "UPDATE error_queue_items
        SET detail = ?, status = 'open', updated_at = datetime('now')
        WHERE source_type = 'schedule_job'
            AND source_id = ?
            AND status IN ('open', 'in_progress', 'awaiting_review')",
    )
    .bind(error)
    .bind(job.id)
    .execute(pool)
    .await
    .map_err(|_| "Could not update scheduler error queue item".to_string())?;
    insert_safety_audit_event(
        pool,
        job.campaign_id,
        "schedule_job",
        job.id,
        "publish_failed",
        "warning",
        "Scheduled LinkedIn publish failed permanently.",
        &format!("{{\"attemptCount\":{}}}", job.attempt_count),
    )
    .await?;
    insert_scheduler_event(
        pool,
        Some(job.campaign_id),
        Some(job.approval_id),
        Some(job.id),
        "job_failed",
        "error",
        "Scheduled LinkedIn publish failed permanently.",
        &format!("{{\"attemptCount\":{}}}", job.attempt_count),
    )
    .await?;
    Ok(())
}

async fn run_tick(app: &AppHandle, runner_id: &str) -> Result<SchedulerTickResult, String> {
    let pool = sqlite_pool(app).await?;
    let settings = load_settings(&pool).await?;
    let mut result = SchedulerTickResult {
        claimed: 0,
        published: 0,
        retry_scheduled: 0,
        failed: 0,
        blocked: 0,
    };

    insert_scheduler_event(
        &pool,
        None,
        None,
        None,
        "tick_started",
        "info",
        "Scheduler tick started.",
        &format!("{{\"runnerId\":\"{}\"}}", runner_id),
    )
    .await?;

    let due_jobs = select_due_jobs(&pool, settings.max_jobs_per_tick).await?;
    if is_kill_switch_enabled(&pool).await? {
        for job in due_jobs {
            result.blocked += 1;
            insert_scheduler_event(
                &pool,
                Some(job.campaign_id),
                Some(job.approval_id),
                Some(job.id),
                "job_blocked",
                "warning",
                "Scheduler skipped a due job because the global kill switch is enabled.",
                "{}",
            )
            .await?;
        }
        insert_scheduler_event(
            &pool,
            None,
            None,
            None,
            "tick_completed",
            "info",
            "Scheduler tick completed.",
            &format!("{{\"blocked\":{}}}", result.blocked),
        )
        .await?;
        return Ok(result);
    }

    for mut job in due_jobs {
        if !claim_job(&pool, &mut job, runner_id).await? {
            continue;
        }
        result.claimed += 1;

        let raw_commentary =
            compose_linkedin_commentary(&job.hook, &job.body, &job.cta, &job.hashtags);
        let input = LinkedInPublishPostInput {
            approval_id: job.approval_id,
            schedule_job_id: Some(job.id),
            commentary: escape_linkedin_little_text(&raw_commentary),
            idempotency_key: format!("approval:{}:linkedin:{}", job.approval_id, job.id),
        };

        match publish_approved_linkedin_post(app, input) {
            Ok(publish) => {
                mark_success(
                    &pool,
                    &job,
                    &publish.platform_post_id,
                    &publish.external_post_url,
                )
                .await?;
                result.published += 1;
            }
            Err(error) => {
                let redacted = redact_error(error);
                if job.attempt_count >= job.max_attempts {
                    mark_terminal_failure(&pool, &job, &redacted).await?;
                    result.failed += 1;
                } else {
                    mark_retry(&pool, &job, &redacted, settings.retry_backoff_minutes).await?;
                    result.retry_scheduled += 1;
                }
            }
        }
    }

    insert_scheduler_event(
        &pool,
        None,
        None,
        None,
        "tick_completed",
        "info",
        "Scheduler tick completed.",
        &format!(
            "{{\"claimed\":{},\"published\":{},\"retryScheduled\":{},\"failed\":{},\"blocked\":{}}}",
            result.claimed, result.published, result.retry_scheduled, result.failed, result.blocked
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
            let sleep_seconds = tauri::async_runtime::block_on(async {
                let pool = sqlite_pool(&app).await?;
                let settings = load_settings(&pool).await?;
                Ok::<i64, String>(settings.poll_interval_seconds)
            })
            .unwrap_or(60)
            .clamp(15, 3600);

            for _ in 0..sleep_seconds {
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
pub fn linkgo_scheduler_status(app: AppHandle) -> Result<SchedulerStatusPayload, String> {
    let pool = tauri::async_runtime::block_on(sqlite_pool(&app))?;
    let settings = tauri::async_runtime::block_on(load_settings(&pool))?;
    let (running, runner_id) = current_worker();
    Ok(payload_from_settings(settings, running, runner_id))
}

#[tauri::command]
pub fn linkgo_scheduler_start(app: AppHandle) -> Result<SchedulerStatusPayload, String> {
    let pool = tauri::async_runtime::block_on(sqlite_pool(&app))?;
    if let Some(reason) = tauri::async_runtime::block_on(kill_switch_block_reason(&pool))? {
        return Err(reason);
    }
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
            *guard = Some(SchedulerWorker {
                runner_id: runner_id.clone(),
                stop: stop.clone(),
            });
            should_spawn = Some((runner_id, stop));
        }
    }

    if let Some((runner_id, stop)) = should_spawn {
        tauri::async_runtime::block_on(insert_scheduler_event(
            &pool,
            None,
            None,
            None,
            "scheduler_started",
            "info",
            "Background scheduler started.",
            &format!("{{\"runnerId\":\"{}\"}}", runner_id),
        ))?;
        spawn_worker(app.clone(), runner_id, stop);
    }

    linkgo_scheduler_status(app)
}

#[tauri::command]
pub fn linkgo_scheduler_stop(app: AppHandle) -> Result<SchedulerStatusPayload, String> {
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

    tauri::async_runtime::block_on(insert_scheduler_event(
        &pool,
        None,
        None,
        None,
        "scheduler_stopped",
        "info",
        "Background scheduler stopped.",
        &format!(
            "{{\"runnerId\":\"{}\"}}",
            runner_id.unwrap_or_else(|| "none".to_string())
        ),
    ))?;

    linkgo_scheduler_status(app)
}

#[tauri::command]
pub fn linkgo_scheduler_tick(app: AppHandle) -> Result<SchedulerTickResult, String> {
    let runner = current_worker()
        .1
        .unwrap_or_else(|| format!("manual-{}", unix_timestamp()));
    tauri::async_runtime::block_on(run_tick(&app, &runner))
}

#[cfg(test)]
mod tests {
    use super::{compute_next_attempt_unix_seconds, is_due_schedule_job, DueJobEligibilityInput};

    fn due_input() -> DueJobEligibilityInput<'static> {
        DueJobEligibilityInput {
            schedule_status: "scheduled",
            approval_status: "scheduled",
            campaign_status: "active",
            scheduled_for_epoch: 100,
            next_attempt_at_epoch: None,
            locked_at_epoch: None,
            now_epoch: 200,
            stale_lock_after_seconds: 600,
        }
    }

    #[test]
    fn retry_backoff_uses_attempt_count_and_configured_minutes() {
        assert_eq!(compute_next_attempt_unix_seconds(1_000, 2, 15), 2_800);
        assert_eq!(compute_next_attempt_unix_seconds(1_000, 0, 5), 1_300);
    }

    #[test]
    fn due_job_eligibility_accepts_due_scheduled_jobs() {
        assert!(is_due_schedule_job(&due_input()));
    }

    #[test]
    fn due_job_eligibility_excludes_non_due_jobs() {
        let mut input = due_input();
        input.schedule_status = "completed";
        assert!(!is_due_schedule_job(&input));

        let mut input = due_input();
        input.approval_status = "approved";
        assert!(!is_due_schedule_job(&input));

        let mut input = due_input();
        input.campaign_status = "archived";
        assert!(!is_due_schedule_job(&input));

        let mut input = due_input();
        input.scheduled_for_epoch = 300;
        assert!(!is_due_schedule_job(&input));

        let mut input = due_input();
        input.next_attempt_at_epoch = Some(300);
        assert!(!is_due_schedule_job(&input));

        let mut input = due_input();
        input.locked_at_epoch = Some(100);
        input.now_epoch = 200;
        assert!(!is_due_schedule_job(&input));

        let mut input = due_input();
        input.locked_at_epoch = Some(100);
        input.now_epoch = 701;
        assert!(is_due_schedule_job(&input));
    }
}
