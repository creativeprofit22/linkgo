//! Native safety reads: the singleton settings row and the bounded safety
//! dashboard. Both recreate a missing settings row and read inside one
//! pinned `BEGIN IMMEDIATE` transaction, so every count and list comes from
//! the same snapshot and a failure leaves nothing half-written.

use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteRow, Row, SqliteConnection, SqlitePool};
use tauri::State;

use crate::db_transaction::{settle, Settlement};

const READ_ERROR: &str = "Could not load safety settings";
/// Each dashboard list is capped; the renderer never gets an unbounded read.
pub(crate) const DASHBOARD_LIST_LIMIT: i64 = 50;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SafetyDashboardInput {
    #[serde(default)]
    pub campaign_id: Option<i64>,
}

/// Mirrors the renderer `SafetySettings` row shape.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SafetySettings {
    pub id: i64,
    pub global_kill_switch: i64,
    pub kill_switch_reason: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SafetyDashboardSummary {
    pub open_errors: i64,
    pub blocked_today: i64,
    pub allowed_today: i64,
    pub audit_events: i64,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ErrorQueueItemRow {
    pub id: i64,
    pub campaign_id: Option<i64>,
    pub source_type: String,
    pub source_id: Option<i64>,
    pub title: String,
    pub detail: String,
    pub severity: String,
    pub status: String,
    pub resolution_notes: String,
    pub created_at: String,
    pub updated_at: String,
    pub campaign_name: Option<String>,
    pub campaign_status: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct RateLimitEventRow {
    pub id: i64,
    pub campaign_id: i64,
    pub action: String,
    pub window_key: String,
    pub limit_value: i64,
    pub current_count: i64,
    pub decision: String,
    pub summary: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct SafetyAuditEventRow {
    pub id: i64,
    pub campaign_id: Option<i64>,
    pub subject_type: String,
    pub subject_id: Option<i64>,
    pub event_type: String,
    pub severity: String,
    pub summary: String,
    pub metadata_json: String,
    pub created_at: String,
}

/// Mirrors the renderer `SafetyDashboard` shape.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SafetyDashboard {
    pub settings: SafetySettings,
    pub summary: SafetyDashboardSummary,
    pub error_queue_items: Vec<ErrorQueueItemRow>,
    pub rate_limit_events: Vec<RateLimitEventRow>,
    pub audit_events: Vec<SafetyAuditEventRow>,
}

fn read_error(_: sqlx::Error) -> String {
    READ_ERROR.to_string()
}

async fn ensure_settings(connection: &mut SqliteConnection) -> Result<SafetySettings, String> {
    sqlx::query("INSERT OR IGNORE INTO safety_settings (id) VALUES (1)")
        .execute(&mut *connection)
        .await
        .map_err(read_error)?;
    let row = sqlx::query(
        "SELECT id, global_kill_switch, kill_switch_reason, updated_at
         FROM safety_settings WHERE id = 1 LIMIT 1",
    )
    .fetch_one(&mut *connection)
    .await
    .map_err(read_error)?;
    Ok(SafetySettings {
        id: row.get("id"),
        global_kill_switch: row.get("global_kill_switch"),
        kill_switch_reason: row.get("kill_switch_reason"),
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
) -> Result<Vec<SqliteRow>, String> {
    sqlx::query(sql)
        .bind(campaign_id)
        .bind(DASHBOARD_LIST_LIMIT)
        .fetch_all(&mut *connection)
        .await
        .map_err(read_error)
}

fn error_item(row: &SqliteRow) -> ErrorQueueItemRow {
    ErrorQueueItemRow {
        id: row.get("id"),
        campaign_id: row.get("campaign_id"),
        source_type: row.get("source_type"),
        source_id: row.get("source_id"),
        title: row.get("title"),
        detail: row.get("detail"),
        severity: row.get("severity"),
        status: row.get("status"),
        resolution_notes: row.get("resolution_notes"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        campaign_name: row.get("campaign_name"),
        campaign_status: row.get("campaign_status"),
    }
}

fn rate_limit_event(row: &SqliteRow) -> RateLimitEventRow {
    RateLimitEventRow {
        id: row.get("id"),
        campaign_id: row.get("campaign_id"),
        action: row.get("action"),
        window_key: row.get("window_key"),
        limit_value: row.get("limit_value"),
        current_count: row.get("current_count"),
        decision: row.get("decision"),
        summary: row.get("summary"),
        created_at: row.get("created_at"),
    }
}

fn audit_event(row: &SqliteRow) -> SafetyAuditEventRow {
    SafetyAuditEventRow {
        id: row.get("id"),
        campaign_id: row.get("campaign_id"),
        subject_type: row.get("subject_type"),
        subject_id: row.get("subject_id"),
        event_type: row.get("event_type"),
        severity: row.get("severity"),
        summary: row.get("summary"),
        metadata_json: row.get("metadata_json"),
        created_at: row.get("created_at"),
    }
}

pub(crate) async fn get_safety_settings(pool: &SqlitePool) -> Result<SafetySettings, String> {
    settle(pool, READ_ERROR, |connection| {
        Box::pin(async move { Ok(Settlement::Accepted(ensure_settings(connection).await?)) })
    })
    .await
}

pub(crate) async fn get_safety_dashboard(
    pool: &SqlitePool,
    input: SafetyDashboardInput,
) -> Result<SafetyDashboard, String> {
    if input.campaign_id.is_some_and(|id| id <= 0) {
        return Err("Campaign id must be a positive integer".to_string());
    }
    let campaign = input.campaign_id;
    settle(pool, READ_ERROR, move |connection| {
        Box::pin(async move {
            let settings = ensure_settings(connection).await?;
            let summary = SafetyDashboardSummary {
                open_errors: count(
                    connection,
                    "SELECT COUNT(*) FROM error_queue_items
                     WHERE status IN ('open', 'in_progress', 'awaiting_review')
                       AND (?1 IS NULL OR campaign_id = ?1)",
                    campaign,
                )
                .await?,
                blocked_today: count(
                    connection,
                    "SELECT COUNT(*) FROM rate_limit_events
                     WHERE decision = 'blocked' AND date(created_at) = date('now')
                       AND (?1 IS NULL OR campaign_id = ?1)",
                    campaign,
                )
                .await?,
                allowed_today: count(
                    connection,
                    "SELECT COUNT(*) FROM rate_limit_events
                     WHERE decision = 'allowed' AND date(created_at) = date('now')
                       AND (?1 IS NULL OR campaign_id = ?1)",
                    campaign,
                )
                .await?,
                audit_events: count(
                    connection,
                    "SELECT COUNT(*) FROM safety_audit_events
                     WHERE (?1 IS NULL OR campaign_id = ?1)",
                    campaign,
                )
                .await?,
            };
            let error_queue_items = rows(
                connection,
                "SELECT eqi.*, c.name AS campaign_name, c.status AS campaign_status
                 FROM error_queue_items eqi
                 LEFT JOIN campaigns c ON c.id = eqi.campaign_id
                 WHERE (?1 IS NULL OR eqi.campaign_id = ?1)
                 ORDER BY eqi.status IN ('resolved'), datetime(eqi.updated_at) DESC, eqi.id DESC
                 LIMIT ?2",
                campaign,
            )
            .await?
            .iter()
            .map(error_item)
            .collect();
            let rate_limit_events = rows(
                connection,
                "SELECT * FROM rate_limit_events
                 WHERE (?1 IS NULL OR campaign_id = ?1)
                 ORDER BY datetime(created_at) DESC, id DESC
                 LIMIT ?2",
                campaign,
            )
            .await?
            .iter()
            .map(rate_limit_event)
            .collect();
            let audit_events = rows(
                connection,
                "SELECT * FROM safety_audit_events
                 WHERE (?1 IS NULL OR campaign_id = ?1)
                 ORDER BY datetime(created_at) DESC, id DESC
                 LIMIT ?2",
                campaign,
            )
            .await?
            .iter()
            .map(audit_event)
            .collect();
            Ok(Settlement::Accepted(SafetyDashboard {
                settings,
                summary,
                error_queue_items,
                rate_limit_events,
                audit_events,
            }))
        })
    })
    .await
}

#[tauri::command]
pub async fn linkgo_safety_settings_get(
    pool: State<'_, SqlitePool>,
) -> Result<SafetySettings, String> {
    get_safety_settings(pool.inner()).await
}

#[tauri::command]
pub async fn linkgo_safety_dashboard_get(
    pool: State<'_, SqlitePool>,
    input: SafetyDashboardInput,
) -> Result<SafetyDashboard, String> {
    get_safety_dashboard(pool.inner(), input).await
}

#[cfg(test)]
#[path = "safety_dashboard_tests.rs"]
mod tests;
