//! SQLite access for Bright Data runs, the enable flag and the gates.

use serde::Serialize;
use sqlx::{Row, SqlitePool};

use super::{BrightDataActivity, RunMode, MAX_RUNS_PER_CAMPAIGN_PER_DAY};

pub(crate) const STORAGE_ERROR: &str = "Bright Data run storage failed";
pub(crate) const ACTIVE_RUN_ERROR: &str = "A Bright Data run is already active for this campaign";
pub(crate) const ACTIVE_STATUSES: &str = "('starting', 'running', 'ready')";

/// UTC timestamp in SQLite `datetime()` format so string comparison orders.
pub(crate) fn sql_time(now_ms: i64) -> String {
    chrono::DateTime::from_timestamp_millis(now_ms)
        .unwrap_or_default()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string()
}

pub(crate) fn sql_date(now_ms: i64) -> String {
    chrono::DateTime::from_timestamp_millis(now_ms)
        .unwrap_or_default()
        .format("%Y-%m-%d")
        .to_string()
}

pub(crate) fn parse_sql_time_ms(value: &str) -> Option<i64> {
    chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S")
        .ok()
        .map(|time| time.and_utc().timestamp_millis())
}

fn bounded_error(message: &str) -> String {
    message.chars().take(1000).collect()
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BrightDataRunRecord {
    pub id: i64,
    pub campaign_id: i64,
    pub mode: String,
    pub status: String,
    pub snapshot_id: Option<String>,
    pub requested_count: i64,
    pub row_count: i64,
    pub source_import_batch_id: Option<i64>,
    pub error_message: String,
    pub created_at: String,
    pub updated_at: String,
    /// A watchlist run left running/ready that this process is not driving.
    pub resumable: bool,
}

#[derive(Debug, Clone)]
pub(crate) struct StoredRun {
    pub record: BrightDataRunRecord,
    pub input_json: String,
}

const RUN_COLUMNS: &str = "id, campaign_id, mode, status, snapshot_id, requested_count, row_count,
     source_import_batch_id, error_message, created_at, updated_at, input_json";

fn run_from_row(row: &sqlx::sqlite::SqliteRow, in_process: bool) -> StoredRun {
    let mode: String = row.get("mode");
    let status: String = row.get("status");
    let snapshot_id: Option<String> = row.get("snapshot_id");
    let resumable = !in_process
        && mode == RunMode::Watchlist.as_str()
        && (status == "running" || status == "ready")
        && snapshot_id.is_some();
    StoredRun {
        record: BrightDataRunRecord {
            id: row.get("id"),
            campaign_id: row.get("campaign_id"),
            mode,
            status,
            snapshot_id,
            requested_count: row.get("requested_count"),
            row_count: row.get("row_count"),
            source_import_batch_id: row.get("source_import_batch_id"),
            error_message: row.get("error_message"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
            resumable,
        },
        input_json: row.get("input_json"),
    }
}

pub(crate) async fn load_run(
    pool: &SqlitePool,
    activity: &BrightDataActivity,
    run_id: i64,
) -> Result<StoredRun, String> {
    let row = sqlx::query(&format!(
        "SELECT {RUN_COLUMNS} FROM brightdata_runs WHERE id = ?1"
    ))
    .bind(run_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| STORAGE_ERROR.to_string())?
    .ok_or_else(|| "Bright Data run not found".to_string())?;
    let campaign_id: i64 = row.get("campaign_id");
    Ok(run_from_row(&row, activity.is_active(campaign_id)))
}

pub(crate) async fn list_runs(
    pool: &SqlitePool,
    activity: &BrightDataActivity,
    campaign_id: i64,
) -> Result<Vec<BrightDataRunRecord>, String> {
    let in_process = activity.is_active(campaign_id);
    let rows = sqlx::query(&format!(
        "SELECT {RUN_COLUMNS} FROM brightdata_runs WHERE campaign_id = ?1
         ORDER BY created_at DESC, id DESC LIMIT 20"
    ))
    .bind(campaign_id)
    .fetch_all(pool)
    .await
    .map_err(|_| STORAGE_ERROR.to_string())?;
    Ok(rows
        .iter()
        .map(|row| run_from_row(row, in_process).record)
        .collect())
}

pub(crate) async fn insert_run(
    pool: &SqlitePool,
    campaign_id: i64,
    mode: RunMode,
    input_json: &str,
    requested_count: i64,
    now_ms: i64,
) -> Result<i64, String> {
    let now = sql_time(now_ms);
    let result = sqlx::query(
        "INSERT INTO brightdata_runs (campaign_id, mode, input_json, status, requested_count, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'starting', ?4, ?5, ?5)",
    )
    .bind(campaign_id)
    .bind(mode.as_str())
    .bind(input_json)
    .bind(requested_count)
    .bind(&now)
    .execute(pool)
    .await;
    match result {
        Ok(done) => Ok(done.last_insert_rowid()),
        Err(sqlx::Error::Database(error)) if error.is_unique_violation() => {
            Err(ACTIVE_RUN_ERROR.to_string())
        }
        Err(_) => Err(STORAGE_ERROR.to_string()),
    }
}

/// Field updates applied together with a status change.
#[derive(Debug, Default)]
pub(crate) struct RunUpdate<'a> {
    pub status: &'a str,
    pub snapshot_id: Option<&'a str>,
    pub requested_count: Option<i64>,
    pub row_count: Option<i64>,
    pub source_import_batch_id: Option<i64>,
    pub error_message: Option<&'a str>,
}

pub(crate) async fn update_run(
    pool: &SqlitePool,
    run_id: i64,
    update: RunUpdate<'_>,
    now_ms: i64,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE brightdata_runs SET
            status = ?2,
            snapshot_id = COALESCE(?3, snapshot_id),
            requested_count = COALESCE(?4, requested_count),
            row_count = COALESCE(?5, row_count),
            source_import_batch_id = COALESCE(?6, source_import_batch_id),
            error_message = COALESCE(?7, error_message),
            updated_at = ?8
         WHERE id = ?1",
    )
    .bind(run_id)
    .bind(update.status)
    .bind(update.snapshot_id)
    .bind(update.requested_count)
    .bind(update.row_count)
    .bind(update.source_import_batch_id)
    .bind(update.error_message.map(bounded_error))
    .bind(sql_time(now_ms))
    .execute(pool)
    .await
    .map_err(|_| STORAGE_ERROR.to_string())?;
    Ok(())
}

pub(crate) async fn connector_enabled(pool: &SqlitePool) -> Result<bool, String> {
    let value: i64 =
        sqlx::query_scalar("SELECT brightdata_connector_enabled FROM app_settings WHERE id = 1")
            .fetch_optional(pool)
            .await
            .map_err(|_| STORAGE_ERROR.to_string())?
            .unwrap_or(0);
    Ok(value == 1)
}

pub(crate) async fn set_connector_enabled(pool: &SqlitePool, enabled: bool) -> Result<(), String> {
    sqlx::query(
        "UPDATE app_settings SET brightdata_connector_enabled = ?1, updated_at = datetime('now') WHERE id = 1",
    )
    .bind(i64::from(enabled))
    .execute(pool)
    .await
    .map_err(|_| STORAGE_ERROR.to_string())?;
    Ok(())
}

pub(crate) async fn kill_switch_on(pool: &SqlitePool) -> Result<bool, String> {
    let value: i64 =
        sqlx::query_scalar("SELECT global_kill_switch FROM safety_settings WHERE id = 1")
            .fetch_optional(pool)
            .await
            .map_err(|_| STORAGE_ERROR.to_string())?
            // No safety row means safety state is unknown: fail closed.
            .unwrap_or(1);
    Ok(value == 1)
}

pub(crate) async fn runs_today(
    pool: &SqlitePool,
    campaign_id: i64,
    now_ms: i64,
) -> Result<i64, String> {
    sqlx::query_scalar(
        "SELECT COUNT(*) FROM brightdata_runs WHERE campaign_id = ?1 AND substr(created_at, 1, 10) = ?2",
    )
    .bind(campaign_id)
    .bind(sql_date(now_ms))
    .fetch_one(pool)
    .await
    .map_err(|_| STORAGE_ERROR.to_string())
}

pub(crate) const DISABLED_ERROR: &str =
    "The Bright Data connector is turned off. Turn it on after the connector review is signed off.";
pub(crate) const KILL_SWITCH_ERROR: &str =
    "The global kill switch is on, so Bright Data runs are blocked";
pub(crate) const NO_KEY_ERROR: &str = "Add a Bright Data API key in Connected accounts first";

/// Which gates a command needs. Every run-starting or resuming command
/// checks, in order: enabled flag, kill switch, campaign exists, campaign not
/// archived, API key, then (for new runs) the daily cap and the
/// one-active-run rule. Cancelling is never gated.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum GateScope {
    NewRun,
    Resume,
}

pub(crate) async fn check_gates(
    pool: &SqlitePool,
    campaign_id: i64,
    api_key_present: bool,
    scope: GateScope,
    now_ms: i64,
) -> Result<(), String> {
    if !connector_enabled(pool).await? {
        return Err(DISABLED_ERROR.to_string());
    }
    if kill_switch_on(pool).await? {
        return Err(KILL_SWITCH_ERROR.to_string());
    }
    let campaign_status: Option<String> =
        sqlx::query_scalar("SELECT status FROM campaigns WHERE id = ?1")
            .bind(campaign_id)
            .fetch_optional(pool)
            .await
            .map_err(|_| STORAGE_ERROR.to_string())?;
    let Some(campaign_status) = campaign_status else {
        return Err("Campaign not found".to_string());
    };
    if crate::candidate_queue::campaign_status_is_archived(&campaign_status) {
        return Err(crate::candidate_queue::CAMPAIGN_ARCHIVED_ERROR.to_string());
    }
    if !api_key_present {
        return Err(NO_KEY_ERROR.to_string());
    }
    if scope == GateScope::Resume {
        return Ok(());
    }
    if runs_today(pool, campaign_id, now_ms).await? >= MAX_RUNS_PER_CAMPAIGN_PER_DAY {
        return Err(format!(
            "This campaign already used its {MAX_RUNS_PER_CAMPAIGN_PER_DAY} Bright Data runs today"
        ));
    }
    let active: bool = sqlx::query_scalar(&format!(
        "SELECT EXISTS(SELECT 1 FROM brightdata_runs WHERE campaign_id = ?1 AND status IN {ACTIVE_STATUSES})"
    ))
    .bind(campaign_id)
    .fetch_one(pool)
    .await
    .map_err(|_| STORAGE_ERROR.to_string())?;
    if active {
        return Err(ACTIVE_RUN_ERROR.to_string());
    }
    Ok(())
}
