//! Run orchestration: gates, run lifecycle and import through the existing
//! Source Imports writer. Transport is injected so tests never make a paid
//! call or spawn a process.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::SqlitePool;

use super::direct::{validate_snapshot_id, DirectError, Download, SnapshotStatus, WatchKind};
use super::mapping::{is_linkedin_post_url, map_records};
use super::recovery::recover_locked;
use super::store::{
    check_gates, insert_run, kill_switch_on, load_run, update_run, BrightDataRunRecord, GateScope,
    RunUpdate, KILL_SWITCH_ERROR, STORAGE_ERROR,
};
use super::{
    watchlist, ActiveRun, BrightDataActivity, RunMode, DEFAULT_WINDOW_DAYS, MAX_POSTS_PER_RUN,
    MAX_WATCHLIST_ENTRIES_PER_RUN, MAX_WINDOW_DAYS,
};
use crate::source_imports::{write_batch, SourceImportActivity, WriteSourceImportBatchInput};

pub(crate) const CANCELLED_MESSAGE: &str = "Cancelled";
pub(crate) const STILL_RUNNING_MESSAGE: &str =
    "Bright Data is still collecting posts. Use Resume to check again.";

/// Blocking Bright Data operations. Implemented by the live transport and by
/// test fakes.
pub(crate) trait Transport: Send + Sync {
    fn check_cli(&self, cancel: &Arc<AtomicBool>) -> Result<(), String>;
    fn collect_post(&self, post_url: &str, cancel: &Arc<AtomicBool>) -> Result<Vec<Value>, String>;
    fn trigger(
        &self,
        kind: WatchKind,
        urls: &[String],
        start_date: &str,
        end_date: &str,
        limit_per_input: usize,
    ) -> Result<String, DirectError>;
    fn progress(&self, snapshot_id: &str) -> Result<SnapshotStatus, DirectError>;
    fn download(&self, snapshot_id: &str) -> Result<Download, DirectError>;
    fn cancel_snapshot(&self, snapshot_id: &str) -> Result<(), DirectError>;
}

/// Polling cadence for watchlist snapshots; injected so tests run fast.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Timing {
    pub poll_interval: Duration,
    pub poll_budget: Duration,
}

impl Timing {
    pub(crate) const LIVE: Timing = Timing {
        poll_interval: Duration::from_secs(10),
        poll_budget: Duration::from_secs(10 * 60),
    };
}

#[derive(Debug, Deserialize, Clone)]
#[serde(tag = "mode", rename_all = "snake_case", deny_unknown_fields)]
pub enum RunRequest {
    #[serde(rename_all = "camelCase")]
    PostUrl { post_urls: Vec<String> },
    #[serde(rename_all = "camelCase")]
    Watchlist {
        kind: String,
        #[serde(default)]
        entry_ids: Option<Vec<i64>>,
        #[serde(default)]
        days: Option<i64>,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartRunInput {
    pub campaign_id: i64,
    pub request: RunRequest,
}

/// Validated, normalized run plan stored as `input_json`.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum RunPlan {
    PostUrl {
        urls: Vec<String>,
    },
    Watchlist {
        kind: WatchKind,
        urls: Vec<String>,
        label: String,
        start_date: String,
        end_date: String,
    },
}

impl RunPlan {
    pub(crate) fn mode(&self) -> RunMode {
        match self {
            RunPlan::PostUrl { .. } => RunMode::PostUrl,
            RunPlan::Watchlist { .. } => RunMode::Watchlist,
        }
    }

    fn requested_count(&self) -> i64 {
        let count = match self {
            RunPlan::PostUrl { urls } | RunPlan::Watchlist { urls, .. } => urls.len(),
        };
        i64::try_from(count).unwrap_or(i64::MAX)
    }

    fn to_json(&self) -> String {
        match self {
            RunPlan::PostUrl { urls } => json!({ "postUrls": urls }),
            RunPlan::Watchlist {
                kind,
                urls,
                label,
                start_date,
                end_date,
            } => json!({
                "kind": kind.as_str(),
                "urls": urls,
                "label": label,
                "startDate": start_date,
                "endDate": end_date,
            }),
        }
        .to_string()
    }
}

fn window_dates(days: Option<i64>, now_ms: i64) -> Result<(String, String), String> {
    let days = days.unwrap_or(DEFAULT_WINDOW_DAYS);
    if !(1..=MAX_WINDOW_DAYS).contains(&days) {
        return Err(format!(
            "Choose a window between 1 and {MAX_WINDOW_DAYS} days"
        ));
    }
    // Bright Data documents ISO datetimes. The window starts at UTC midnight
    // `days` ago and ends at the current instant so today's posts are included.
    let now = chrono::DateTime::from_timestamp_millis(now_ms).unwrap_or_default();
    let start = now.date_naive() - chrono::Duration::days(days);
    Ok((
        format!("{}T00:00:00.000Z", start.format("%Y-%m-%d")),
        now.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
    ))
}

/// Validates a request into a plan (watchlist entries are read from storage).
pub(crate) async fn plan_run(
    pool: &SqlitePool,
    campaign_id: i64,
    request: RunRequest,
    now_ms: i64,
) -> Result<RunPlan, String> {
    match request {
        RunRequest::PostUrl { post_urls } => {
            let mut urls: Vec<String> = Vec::new();
            for raw in post_urls {
                let url = raw.trim().to_string();
                if !is_linkedin_post_url(&url) || url.len() > 1000 {
                    return Err("Only LinkedIn post URLs can be fetched".to_string());
                }
                if !urls.contains(&url) {
                    urls.push(url);
                }
            }
            if urls.is_empty() {
                return Err("Add at least one LinkedIn post URL".to_string());
            }
            if urls.len() > MAX_POSTS_PER_RUN {
                return Err(format!("Fetch up to {MAX_POSTS_PER_RUN} posts per run"));
            }
            Ok(RunPlan::PostUrl { urls })
        }
        RunRequest::Watchlist {
            kind,
            entry_ids,
            days,
        } => {
            let kind =
                WatchKind::parse(&kind).ok_or_else(|| "Choose profile or company".to_string())?;
            let (start_date, end_date) = window_dates(days, now_ms)?;
            let entries: Vec<_> = watchlist::list(pool, campaign_id)
                .await?
                .into_iter()
                .filter(|entry| entry.enabled && entry.kind == kind.as_str())
                .filter(|entry| entry_ids.as_ref().is_none_or(|ids| ids.contains(&entry.id)))
                .collect();
            if entries.is_empty() {
                return Err("No enabled watchlist entries of that kind".to_string());
            }
            if entries.len() > MAX_WATCHLIST_ENTRIES_PER_RUN {
                return Err(format!(
                    "Fetch up to {MAX_WATCHLIST_ENTRIES_PER_RUN} watchlist entries per run"
                ));
            }
            let label = match entries.as_slice() {
                [only] if !only.label.is_empty() => only.label.clone(),
                _ => "watchlist".to_string(),
            };
            Ok(RunPlan::Watchlist {
                kind,
                urls: entries.into_iter().map(|entry| entry.url).collect(),
                label,
                start_date,
                end_date,
            })
        }
    }
}

/// Everything a run needs besides the plan.
pub(crate) struct RunContext<'a> {
    pub pool: &'a SqlitePool,
    pub activity: &'a BrightDataActivity,
    pub source_activity: &'a SourceImportActivity,
    pub transport: Arc<dyn Transport>,
    pub timing: Timing,
    pub now_ms: fn() -> i64,
}

async fn blocking<T: Send + 'static>(
    transport: &Arc<dyn Transport>,
    work: impl FnOnce(&dyn Transport) -> T + Send + 'static,
) -> Result<T, String> {
    let transport = Arc::clone(transport);
    tokio::task::spawn_blocking(move || work(transport.as_ref()))
        .await
        .map_err(|_| "Bright Data work stopped unexpectedly".to_string())
}

/// Why a run must stop now, if it must.
async fn stop_reason(
    ctx: &RunContext<'_>,
    cancel: &AtomicBool,
) -> Result<Option<&'static str>, String> {
    if cancel.load(Ordering::SeqCst) {
        return Ok(Some(CANCELLED_MESSAGE));
    }
    if kill_switch_on(ctx.pool).await? {
        cancel.store(true, Ordering::SeqCst);
        return Ok(Some(KILL_SWITCH_ERROR));
    }
    Ok(None)
}

async fn finish(
    ctx: &RunContext<'_>,
    run_id: i64,
    update: RunUpdate<'_>,
) -> Result<BrightDataRunRecord, String> {
    update_run(ctx.pool, run_id, update, (ctx.now_ms)()).await?;
    let mut record = load_run(ctx.pool, ctx.activity, run_id).await?.record;
    // This process stops driving the run as soon as it returns.
    record.resumable = record.mode == RunMode::Watchlist.as_str()
        && (record.status == "running" || record.status == "ready")
        && record.snapshot_id.is_some();
    Ok(record)
}

async fn fail(
    ctx: &RunContext<'_>,
    run_id: i64,
    message: &str,
) -> Result<BrightDataRunRecord, String> {
    finish(
        ctx,
        run_id,
        RunUpdate {
            status: "failed",
            error_message: Some(message),
            ..RunUpdate::default()
        },
    )
    .await
}

async fn cancelled(
    ctx: &RunContext<'_>,
    run_id: i64,
    message: &str,
) -> Result<BrightDataRunRecord, String> {
    finish(
        ctx,
        run_id,
        RunUpdate {
            status: "cancelled",
            error_message: Some(message),
            ..RunUpdate::default()
        },
    )
    .await
}

/// Imports mapped rows through the Source Imports writer.
async fn import_records(
    ctx: &RunContext<'_>,
    run_id: i64,
    campaign_id: i64,
    records: &[Value],
    mode: RunMode,
    source_keyword: &str,
) -> Result<BrightDataRunRecord, String> {
    let rows = map_records(records, mode, source_keyword, MAX_POSTS_PER_RUN);
    if rows.is_empty() {
        return finish(
            ctx,
            run_id,
            RunUpdate {
                status: "imported",
                row_count: Some(0),
                error_message: Some("Bright Data found no LinkedIn posts"),
                ..RunUpdate::default()
            },
        )
        .await;
    }
    let row_count = i64::try_from(rows.len()).unwrap_or(i64::MAX);
    let result = write_batch(
        ctx.pool,
        ctx.source_activity,
        WriteSourceImportBatchInput {
            campaign_id,
            connector_key: "brightdata".to_string(),
            rows,
        },
        (ctx.now_ms)(),
    )
    .await;
    match result {
        Ok(batch) => {
            finish(
                ctx,
                run_id,
                RunUpdate {
                    status: "imported",
                    row_count: Some(row_count),
                    source_import_batch_id: Some(batch.batch_id),
                    error_message: Some(&batch.error_message),
                    ..RunUpdate::default()
                },
            )
            .await
        }
        Err(message) => fail(ctx, run_id, &message).await,
    }
}

/// Collects each post URL with the CLI. A failed URL becomes a rejected row;
/// if every URL fails the run fails with the first error.
async fn collect_urls(
    ctx: &RunContext<'_>,
    run_id: i64,
    campaign_id: i64,
    urls: Vec<String>,
    mode: RunMode,
    source_keyword: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<BrightDataRunRecord, String> {
    let mut records: Vec<Value> = Vec::new();
    let mut first_error: Option<String> = None;
    let mut successes = 0;
    for url in urls {
        if let Some(reason) = stop_reason(ctx, cancel).await? {
            return cancelled(ctx, run_id, reason).await;
        }
        let worker_cancel = Arc::clone(cancel);
        let worker_url = url.clone();
        match blocking(&ctx.transport, move |t| {
            t.collect_post(&worker_url, &worker_cancel)
        })
        .await?
        {
            Ok(found) => {
                successes += 1;
                records.extend(found);
            }
            Err(_) if cancel.load(Ordering::SeqCst) => {
                let reason = stop_reason(ctx, cancel).await?.unwrap_or(CANCELLED_MESSAGE);
                return cancelled(ctx, run_id, reason).await;
            }
            Err(message) => {
                records
                    .push(json!({ "url": url, "error": message, "error_code": "collect_failed" }));
                first_error.get_or_insert(message);
            }
        }
    }
    if successes == 0 {
        if let Some(message) = first_error {
            return fail(ctx, run_id, &message).await;
        }
    }
    import_records(ctx, run_id, campaign_id, &records, mode, source_keyword).await
}

async fn run_cli_plan(
    ctx: &RunContext<'_>,
    run_id: i64,
    campaign_id: i64,
    plan: RunPlan,
    cancel: &Arc<AtomicBool>,
) -> Result<BrightDataRunRecord, String> {
    let worker_cancel = Arc::clone(cancel);
    if let Err(message) = blocking(&ctx.transport, move |t| t.check_cli(&worker_cancel)).await? {
        return fail(ctx, run_id, &message).await;
    }
    update_run(
        ctx.pool,
        run_id,
        RunUpdate {
            status: "running",
            ..RunUpdate::default()
        },
        (ctx.now_ms)(),
    )
    .await?;
    match plan {
        RunPlan::PostUrl { urls } => {
            collect_urls(ctx, run_id, campaign_id, urls, RunMode::PostUrl, "", cancel).await
        }
        RunPlan::Watchlist { .. } => Err("Watchlist runs do not use the CLI".to_string()),
    }
}

/// Best-effort server-side cancel, then marks the run cancelled.
async fn cancel_watchlist(
    ctx: &RunContext<'_>,
    run_id: i64,
    snapshot_id: &str,
    reason: &str,
) -> Result<BrightDataRunRecord, String> {
    let id = snapshot_id.to_string();
    let _ = blocking(&ctx.transport, move |t| t.cancel_snapshot(&id)).await?;
    cancelled(ctx, run_id, reason).await
}

/// Polls a snapshot until ready, then downloads and imports. Leaves the run
/// resumable when the poll budget runs out or Bright Data is unreachable.
pub(crate) async fn drive_snapshot(
    ctx: &RunContext<'_>,
    run_id: i64,
    campaign_id: i64,
    snapshot_id: &str,
    source_keyword: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<BrightDataRunRecord, String> {
    let snapshot_id = validate_snapshot_id(snapshot_id)
        .map_err(|error| error.message().to_string())?
        .to_string();
    let started = std::time::Instant::now();
    loop {
        if let Some(reason) = stop_reason(ctx, cancel).await? {
            return cancel_watchlist(ctx, run_id, &snapshot_id, reason).await;
        }
        let id = snapshot_id.clone();
        let status = blocking(&ctx.transport, move |t| t.progress(&id)).await?;
        let ready = match status {
            Ok(SnapshotStatus::Ready) => true,
            Ok(SnapshotStatus::Running) => false,
            Ok(SnapshotStatus::Failed) => {
                return fail(ctx, run_id, "Bright Data could not collect these posts").await
            }
            Ok(SnapshotStatus::Cancelled) => {
                return cancelled(ctx, run_id, "Cancelled in Bright Data").await
            }
            Err(DirectError::Terminal(message)) => return fail(ctx, run_id, &message).await,
            Err(DirectError::Transient(message)) => {
                return finish(
                    ctx,
                    run_id,
                    RunUpdate {
                        status: "running",
                        error_message: Some(&message),
                        ..RunUpdate::default()
                    },
                )
                .await
            }
        };
        if ready {
            update_run(
                ctx.pool,
                run_id,
                RunUpdate {
                    status: "ready",
                    error_message: Some(""),
                    ..RunUpdate::default()
                },
                (ctx.now_ms)(),
            )
            .await?;
            let id = snapshot_id.clone();
            match blocking(&ctx.transport, move |t| t.download(&id)).await? {
                Ok(Download::Records(records)) => {
                    return import_records(
                        ctx,
                        run_id,
                        campaign_id,
                        &records,
                        RunMode::Watchlist,
                        source_keyword,
                    )
                    .await
                }
                Ok(Download::NotReady) => {}
                Err(DirectError::Terminal(message)) => return fail(ctx, run_id, &message).await,
                Err(DirectError::Transient(message)) => {
                    return finish(
                        ctx,
                        run_id,
                        RunUpdate {
                            status: "ready",
                            error_message: Some(&message),
                            ..RunUpdate::default()
                        },
                    )
                    .await
                }
            }
        }
        if started.elapsed() >= ctx.timing.poll_budget {
            return finish(
                ctx,
                run_id,
                RunUpdate {
                    status: if ready { "ready" } else { "running" },
                    error_message: Some(STILL_RUNNING_MESSAGE),
                    ..RunUpdate::default()
                },
            )
            .await;
        }
        sleep_unless_cancelled(ctx.timing.poll_interval, cancel).await;
    }
}

async fn sleep_unless_cancelled(total: Duration, cancel: &AtomicBool) {
    let step = Duration::from_millis(200).min(total);
    let mut waited = Duration::ZERO;
    while waited < total && !cancel.load(Ordering::SeqCst) {
        tokio::time::sleep(step).await;
        waited += step;
    }
}

async fn run_watchlist_plan(
    ctx: &RunContext<'_>,
    run_id: i64,
    campaign_id: i64,
    plan: RunPlan,
    cancel: &Arc<AtomicBool>,
) -> Result<BrightDataRunRecord, String> {
    let RunPlan::Watchlist {
        kind,
        urls,
        label,
        start_date,
        end_date,
    } = plan
    else {
        return Err("Expected a watchlist run".to_string());
    };
    if let Some(reason) = stop_reason(ctx, cancel).await? {
        return cancelled(ctx, run_id, reason).await;
    }
    let per_input = (MAX_POSTS_PER_RUN / urls.len().max(1)).max(1);
    let triggered = blocking(&ctx.transport, move |t| {
        t.trigger(kind, &urls, &start_date, &end_date, per_input)
    })
    .await?;
    let snapshot_id = match triggered {
        Ok(id) => id,
        Err(error) => return fail(ctx, run_id, error.message()).await,
    };
    if validate_snapshot_id(&snapshot_id).is_err() {
        return fail(ctx, run_id, "Bright Data returned an invalid snapshot id").await;
    }
    update_run(
        ctx.pool,
        run_id,
        RunUpdate {
            status: "running",
            snapshot_id: Some(&snapshot_id),
            ..RunUpdate::default()
        },
        (ctx.now_ms)(),
    )
    .await?;
    drive_snapshot(ctx, run_id, campaign_id, &snapshot_id, &label, cancel).await
}

/// Starts a run. Gate failures return `Err` and create nothing; failures
/// after the run row exists are recorded on the run and returned as `Ok`.
pub(crate) async fn start_run(
    ctx: &RunContext<'_>,
    input: StartRunInput,
    api_key_present: bool,
) -> Result<BrightDataRunRecord, String> {
    let campaign_id = input.campaign_id;
    if campaign_id <= 0 {
        return Err("Campaign is required".to_string());
    }
    let slot = ctx
        .activity
        .try_start(campaign_id)
        .ok_or_else(|| super::store::ACTIVE_RUN_ERROR.to_string())?;
    let now_ms = (ctx.now_ms)();
    recover_locked(ctx.pool, &slot, campaign_id, now_ms).await?;
    check_gates(
        ctx.pool,
        campaign_id,
        api_key_present,
        GateScope::NewRun,
        now_ms,
    )
    .await?;
    let plan = plan_run(ctx.pool, campaign_id, input.request, now_ms).await?;
    let run_id = insert_run(
        ctx.pool,
        campaign_id,
        plan.mode(),
        &plan.to_json(),
        plan.requested_count(),
        now_ms,
    )
    .await?;
    execute(ctx, &slot, run_id, campaign_id, plan).await
}

async fn execute(
    ctx: &RunContext<'_>,
    slot: &ActiveRun,
    run_id: i64,
    campaign_id: i64,
    plan: RunPlan,
) -> Result<BrightDataRunRecord, String> {
    let cancel = slot.cancel_flag();
    let outcome = match plan.mode() {
        RunMode::Watchlist => run_watchlist_plan(ctx, run_id, campaign_id, plan, &cancel).await,
        RunMode::PostUrl => run_cli_plan(ctx, run_id, campaign_id, plan, &cancel).await,
    };
    match outcome {
        Ok(record) => Ok(record),
        // Storage trouble mid-run: try to leave a terminal record behind.
        Err(message) => fail(ctx, run_id, &message).await.or(Err(message)),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunIdInput {
    pub run_id: i64,
}

/// Continues a watchlist run left `running`/`ready` by a previous process or
/// an exhausted poll budget.
pub(crate) async fn resume_run(
    ctx: &RunContext<'_>,
    run_id: i64,
    api_key_present: bool,
) -> Result<BrightDataRunRecord, String> {
    let stored = load_run(ctx.pool, ctx.activity, run_id).await?;
    let campaign_id = stored.record.campaign_id;
    let slot = ctx
        .activity
        .try_start(campaign_id)
        .ok_or_else(|| "This run is already in progress".to_string())?;
    let now_ms = (ctx.now_ms)();
    recover_locked(ctx.pool, &slot, campaign_id, now_ms).await?;
    check_gates(
        ctx.pool,
        campaign_id,
        api_key_present,
        GateScope::Resume,
        now_ms,
    )
    .await?;
    let stored = load_run(ctx.pool, ctx.activity, run_id).await?;
    let record = stored.record;
    let is_resumable_status = record.status == "running" || record.status == "ready";
    let Some(snapshot_id) = record
        .snapshot_id
        .clone()
        .filter(|_| record.mode == RunMode::Watchlist.as_str() && is_resumable_status)
    else {
        return Err("Only an unfinished watchlist run can be resumed".to_string());
    };
    let label = serde_json::from_str::<Value>(&stored.input_json)
        .ok()
        .and_then(|value| {
            value
                .get("label")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| "watchlist".to_string());
    let cancel = slot.cancel_flag();
    match drive_snapshot(ctx, run_id, campaign_id, &snapshot_id, &label, &cancel).await {
        Ok(record) => Ok(record),
        Err(message) => fail(ctx, run_id, &message).await.or(Err(message)),
    }
}

/// Cancels the campaign's run: signals the in-process run, or marks a
/// resumable run cancelled (and cancels its snapshot, best effort).
pub(crate) async fn cancel_run(
    ctx: &RunContext<'_>,
    run_id: i64,
) -> Result<BrightDataRunRecord, String> {
    let stored = load_run(ctx.pool, ctx.activity, run_id).await?;
    let record = stored.record;
    if !["starting", "running", "ready"].contains(&record.status.as_str()) {
        return Ok(record);
    }
    if ctx.activity.signal_cancel(record.campaign_id) {
        return Ok(record);
    }
    let Some(slot) = ctx.activity.try_start(record.campaign_id) else {
        ctx.activity.signal_cancel(record.campaign_id);
        return Ok(record);
    };
    if let Some(snapshot_id) = record.snapshot_id.as_deref() {
        if validate_snapshot_id(snapshot_id).is_ok() {
            let id = snapshot_id.to_string();
            let _ = blocking(&ctx.transport, move |t| t.cancel_snapshot(&id)).await;
        }
    }
    drop(slot);
    cancelled(ctx, run_id, CANCELLED_MESSAGE)
        .await
        .map_err(|_| STORAGE_ERROR.to_string())
}

#[cfg(test)]
#[path = "runs_tests.rs"]
mod tests;
