//! Tauri commands and the live transport for the Bright Data connector.

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::SqlitePool;
use tauri::{AppHandle, State};

use crate::auth::storage::AuthStorage;
use crate::auth::StoredCredential;
use crate::source_imports::SourceImportActivity;

use super::cli::{self, child_env, CliClient, SystemProcessRunner};
use super::direct::{DirectClient, DirectError, Download, SnapshotStatus, WatchKind};
use super::runs::{self, RunContext, RunIdInput, StartRunInput, Timing, Transport};
use super::store::{self, BrightDataRunRecord};
use super::watchlist::{self, AddWatchlistEntryInput, UpdateWatchlistEntryInput, WatchlistEntry};
use super::{
    recovery, BrightDataActivity, DEFAULT_WINDOW_DAYS, MAX_POSTS_PER_RUN,
    MAX_RUNS_PER_CAMPAIGN_PER_DAY, MAX_WATCHLIST_ENTRIES_PER_RUN, MAX_WINDOW_DAYS, PROVIDER_KEY,
    REVIEW_STATUS,
};

/// Production transport: CLI for post URLs, fixed-host HTTPS for the
/// watchlist. Blocking; always called from `spawn_blocking`.
struct LiveTransport {
    api_key: String,
}

impl LiveTransport {
    fn cli(&self, cancel: &Arc<AtomicBool>) -> Result<CliClient<'static>, String> {
        if self.api_key.is_empty() {
            return Err(store::NO_KEY_ERROR.to_string());
        }
        Ok(CliClient {
            runner: &SystemProcessRunner,
            program: cli::resolve_from_env()?,
            env: child_env(&self.api_key, |name| std::env::var(name).ok()),
            api_key: self.api_key.clone(),
            cancel: Arc::clone(cancel),
        })
    }

    /// Built per call inside the blocking thread (reqwest's blocking client
    /// must not be created or dropped on an async worker).
    fn direct(&self) -> Result<DirectClient, DirectError> {
        if self.api_key.is_empty() {
            return Err(DirectError::Terminal(store::NO_KEY_ERROR.to_string()));
        }
        DirectClient::new(self.api_key.clone()).map_err(DirectError::Transient)
    }
}

impl Transport for LiveTransport {
    fn check_cli(&self, cancel: &Arc<AtomicBool>) -> Result<(), String> {
        self.cli(cancel)?.check_version()
    }

    fn collect_post(&self, post_url: &str, cancel: &Arc<AtomicBool>) -> Result<Vec<Value>, String> {
        self.cli(cancel)?.collect_post(post_url)
    }

    fn trigger(
        &self,
        kind: WatchKind,
        urls: &[String],
        start_date: &str,
        end_date: &str,
        limit_per_input: usize,
    ) -> Result<String, DirectError> {
        self.direct()?
            .trigger(kind, urls, start_date, end_date, limit_per_input)
    }

    fn progress(&self, snapshot_id: &str) -> Result<SnapshotStatus, DirectError> {
        self.direct()?.progress(snapshot_id)
    }

    fn download(&self, snapshot_id: &str) -> Result<Download, DirectError> {
        self.direct()?.download(snapshot_id)
    }

    fn cancel_snapshot(&self, snapshot_id: &str) -> Result<(), DirectError> {
        self.direct()?.cancel(snapshot_id)
    }
}

/// Loads the API key from the OS credential store. Never logged or returned.
fn load_api_key(app: &AppHandle) -> Result<Option<String>, String> {
    match AuthStorage::new(app)?.load(PROVIDER_KEY)? {
        Some(StoredCredential::ApiKey(credentials)) if !credentials.api_key.trim().is_empty() => {
            Ok(Some(credentials.api_key))
        }
        _ => Ok(None),
    }
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn context<'a>(
    pool: &'a SqlitePool,
    activity: &'a BrightDataActivity,
    source_activity: &'a SourceImportActivity,
    api_key: Option<String>,
) -> RunContext<'a> {
    RunContext {
        pool,
        activity,
        source_activity,
        transport: Arc::new(LiveTransport {
            api_key: api_key.unwrap_or_default(),
        }),
        timing: Timing::LIVE,
        now_ms,
    }
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BrightDataCaps {
    pub max_posts_per_run: usize,
    pub max_watchlist_entries_per_run: usize,
    pub max_runs_per_campaign_per_day: i64,
    pub default_window_days: i64,
    pub max_window_days: i64,
}

pub(crate) const CAPS: BrightDataCaps = BrightDataCaps {
    max_posts_per_run: MAX_POSTS_PER_RUN,
    max_watchlist_entries_per_run: MAX_WATCHLIST_ENTRIES_PER_RUN,
    max_runs_per_campaign_per_day: MAX_RUNS_PER_CAMPAIGN_PER_DAY,
    default_window_days: DEFAULT_WINDOW_DAYS,
    max_window_days: MAX_WINDOW_DAYS,
};

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BrightDataStatus {
    pub enabled: bool,
    pub kill_switch_active: bool,
    pub api_key_configured: bool,
    pub cli_found: bool,
    pub pinned_cli_version: &'static str,
    pub review_status: &'static str,
    pub runs_today: i64,
    pub caps: BrightDataCaps,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CampaignInput {
    pub campaign_id: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetEnabledInput {
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WatchlistEntryIdInput {
    pub id: i64,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecoverRunsResult {
    pub recovered: i64,
}

fn require_campaign(campaign_id: i64) -> Result<(), String> {
    if campaign_id <= 0 {
        return Err("Campaign is required".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn linkgo_brightdata_status(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    input: CampaignInput,
) -> Result<BrightDataStatus, String> {
    require_campaign(input.campaign_id)?;
    let pool = pool.inner();
    Ok(BrightDataStatus {
        enabled: store::connector_enabled(pool).await?,
        kill_switch_active: store::kill_switch_on(pool).await?,
        api_key_configured: load_api_key(&app)?.is_some(),
        cli_found: cli::resolve_from_env().is_ok(),
        pinned_cli_version: cli::PINNED_CLI_VERSION,
        review_status: REVIEW_STATUS,
        runs_today: store::runs_today(pool, input.campaign_id, now_ms()).await?,
        caps: CAPS,
    })
}

/// Explicit user action only; storage defaults to off.
#[tauri::command]
pub async fn linkgo_brightdata_set_enabled(
    pool: State<'_, SqlitePool>,
    input: SetEnabledInput,
) -> Result<bool, String> {
    store::set_connector_enabled(pool.inner(), input.enabled).await?;
    store::connector_enabled(pool.inner()).await
}

#[tauri::command]
pub async fn linkgo_brightdata_watchlist_list(
    pool: State<'_, SqlitePool>,
    input: CampaignInput,
) -> Result<Vec<WatchlistEntry>, String> {
    require_campaign(input.campaign_id)?;
    watchlist::list(pool.inner(), input.campaign_id).await
}

#[tauri::command]
pub async fn linkgo_brightdata_watchlist_add(
    pool: State<'_, SqlitePool>,
    input: AddWatchlistEntryInput,
) -> Result<WatchlistEntry, String> {
    require_campaign(input.campaign_id)?;
    watchlist::add(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_brightdata_watchlist_update(
    pool: State<'_, SqlitePool>,
    input: UpdateWatchlistEntryInput,
) -> Result<WatchlistEntry, String> {
    watchlist::update(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_brightdata_watchlist_remove(
    pool: State<'_, SqlitePool>,
    input: WatchlistEntryIdInput,
) -> Result<(), String> {
    watchlist::remove(pool.inner(), input.id).await
}

#[tauri::command]
pub async fn linkgo_brightdata_recover_interrupted(
    pool: State<'_, SqlitePool>,
    activity: State<'_, BrightDataActivity>,
    input: CampaignInput,
) -> Result<RecoverRunsResult, String> {
    require_campaign(input.campaign_id)?;
    let recovered = recovery::recover_interrupted_runs(
        pool.inner(),
        activity.inner(),
        input.campaign_id,
        now_ms(),
    )
    .await?;
    Ok(RecoverRunsResult { recovered })
}

/// Lists recent runs; recovers interrupted ones first.
#[tauri::command]
pub async fn linkgo_brightdata_list_runs(
    pool: State<'_, SqlitePool>,
    activity: State<'_, BrightDataActivity>,
    input: CampaignInput,
) -> Result<Vec<BrightDataRunRecord>, String> {
    require_campaign(input.campaign_id)?;
    recovery::recover_interrupted_runs(pool.inner(), activity.inner(), input.campaign_id, now_ms())
        .await?;
    store::list_runs(pool.inner(), activity.inner(), input.campaign_id).await
}

#[tauri::command]
pub async fn linkgo_brightdata_start_run(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    activity: State<'_, BrightDataActivity>,
    source_activity: State<'_, SourceImportActivity>,
    input: StartRunInput,
) -> Result<BrightDataRunRecord, String> {
    // The enable flag is checked before the keyring is touched.
    if !store::connector_enabled(pool.inner()).await? {
        return Err(store::DISABLED_ERROR.to_string());
    }
    let api_key = load_api_key(&app)?;
    let present = api_key.is_some();
    let ctx = context(
        pool.inner(),
        activity.inner(),
        source_activity.inner(),
        api_key,
    );
    runs::start_run(&ctx, input, present).await
}

#[tauri::command]
pub async fn linkgo_brightdata_resume_run(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    activity: State<'_, BrightDataActivity>,
    source_activity: State<'_, SourceImportActivity>,
    input: RunIdInput,
) -> Result<BrightDataRunRecord, String> {
    if !store::connector_enabled(pool.inner()).await? {
        return Err(store::DISABLED_ERROR.to_string());
    }
    let api_key = load_api_key(&app)?;
    let present = api_key.is_some();
    let ctx = context(
        pool.inner(),
        activity.inner(),
        source_activity.inner(),
        api_key,
    );
    runs::resume_run(&ctx, input.run_id, present).await
}

/// Cancelling is always allowed, even with the connector off or the kill
/// switch on.
#[tauri::command]
pub async fn linkgo_brightdata_cancel_run(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    activity: State<'_, BrightDataActivity>,
    source_activity: State<'_, SourceImportActivity>,
    input: RunIdInput,
) -> Result<BrightDataRunRecord, String> {
    let api_key = load_api_key(&app).ok().flatten();
    let ctx = context(
        pool.inner(),
        activity.inner(),
        source_activity.inner(),
        api_key,
    );
    runs::cancel_run(&ctx, input.run_id).await
}

#[cfg(test)]
#[path = "live_smoke.rs"]
mod live_smoke;
