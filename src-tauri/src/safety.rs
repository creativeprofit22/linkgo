//! Native safety mutations: the global kill switch and error-queue triage.
//!
//! Each command validates its input before touching storage, then re-reads and
//! writes on one pinned `BEGIN IMMEDIATE` connection together with its safety
//! audit row, so a failure at any point rolls back every write.

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqliteConnection, SqlitePool};
use tauri::State;

use crate::db_transaction::{settle, Settlement};

const STORAGE_ERROR: &str = "Could not save safety change";
const MAX_REASON_CHARS: usize = 1000;
const MAX_RESOLUTION_NOTES_CHARS: usize = 2000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetGlobalKillSwitchInput {
    pub enabled: bool,
    #[serde(default)]
    pub reason: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GlobalKillSwitchResult {
    pub enabled: bool,
    pub reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetErrorQueueItemStatusInput {
    pub id: i64,
    pub status: String,
    #[serde(default)]
    pub resolution_notes: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ErrorQueueItemStatusResult {
    pub id: i64,
    pub previous_status: String,
    pub status: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ErrorQueueStatus {
    Open,
    InProgress,
    AwaitingReview,
    Resolved,
    Failed,
}

impl ErrorQueueStatus {
    pub(crate) fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "open" => Self::Open,
            "in_progress" => Self::InProgress,
            "awaiting_review" => Self::AwaitingReview,
            "resolved" => Self::Resolved,
            "failed" => Self::Failed,
            _ => return None,
        })
    }

    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::InProgress => "in_progress",
            Self::AwaitingReview => "awaiting_review",
            Self::Resolved => "resolved",
            Self::Failed => "failed",
        }
    }

    fn can_move_to(self, next: Self) -> bool {
        use ErrorQueueStatus::*;
        let allowed: &[Self] = match self {
            Open => &[InProgress, Failed],
            InProgress => &[AwaitingReview, Failed],
            AwaitingReview => &[Resolved, Failed],
            Resolved | Failed => &[InProgress],
        };
        allowed.contains(&next)
    }
}

fn bounded(value: &str, max: usize, label: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.chars().count() > max {
        return Err(format!("{label} must be at most {max} characters"));
    }
    Ok(trimmed.to_string())
}

fn storage_error(_: sqlx::Error) -> String {
    STORAGE_ERROR.to_string()
}

struct AuditRow<'a> {
    campaign_id: Option<i64>,
    subject_type: &'a str,
    subject_id: i64,
    event_type: &'a str,
    severity: &'a str,
    summary: &'a str,
    metadata: serde_json::Value,
}

async fn insert_audit(connection: &mut SqliteConnection, row: AuditRow<'_>) -> Result<(), String> {
    let AuditRow {
        campaign_id,
        subject_type,
        subject_id,
        event_type,
        severity,
        summary,
        metadata,
    } = row;
    sqlx::query(
        "INSERT INTO safety_audit_events (
            campaign_id, subject_type, subject_id, event_type, severity, summary, metadata_json
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(campaign_id)
    .bind(subject_type)
    .bind(subject_id)
    .bind(event_type)
    .bind(severity)
    .bind(summary)
    .bind(metadata.to_string())
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?;
    Ok(())
}

pub(crate) async fn set_global_kill_switch(
    pool: &SqlitePool,
    input: SetGlobalKillSwitchInput,
) -> Result<GlobalKillSwitchResult, String> {
    let reason = bounded(&input.reason, MAX_REASON_CHARS, "Kill switch reason")?;
    let enabled = input.enabled;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            sqlx::query("INSERT OR IGNORE INTO safety_settings (id) VALUES (1)")
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
            sqlx::query(
                "UPDATE safety_settings
                 SET global_kill_switch = ?1, kill_switch_reason = ?2, updated_at = datetime('now')
                 WHERE id = 1",
            )
            .bind(i64::from(enabled))
            .bind(&reason)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            let summary = if enabled {
                if reason.is_empty() {
                    "Global kill switch enabled".to_string()
                } else {
                    format!("Global kill switch enabled: {reason}")
                }
            } else {
                "Global kill switch disabled".to_string()
            };
            insert_audit(
                connection,
                AuditRow {
                    campaign_id: None,
                    subject_type: "safety_settings",
                    subject_id: 1,
                    event_type: if enabled {
                        "kill_switch_enabled"
                    } else {
                        "kill_switch_disabled"
                    },
                    severity: if enabled { "block" } else { "info" },
                    summary: &summary,
                    metadata: serde_json::json!({ "reason": reason }),
                },
            )
            .await?;
            Ok(Settlement::Accepted(GlobalKillSwitchResult {
                enabled,
                reason,
            }))
        })
    })
    .await
}

pub(crate) async fn set_error_queue_item_status(
    pool: &SqlitePool,
    input: SetErrorQueueItemStatusInput,
) -> Result<ErrorQueueItemStatusResult, String> {
    if input.id <= 0 {
        return Err("Error queue item id must be a positive integer".to_string());
    }
    let next = ErrorQueueStatus::parse(&input.status)
        .ok_or_else(|| "Unsupported error queue status".to_string())?;
    let notes = bounded(
        &input.resolution_notes,
        MAX_RESOLUTION_NOTES_CHARS,
        "Resolution notes",
    )?;
    let id = input.id;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let row = sqlx::query(
                "SELECT eqi.campaign_id, eqi.status, c.status AS campaign_status
                 FROM error_queue_items eqi
                 LEFT JOIN campaigns c ON c.id = eqi.campaign_id
                 WHERE eqi.id = ?1",
            )
            .bind(id)
            .fetch_optional(&mut *connection)
            .await
            .map_err(storage_error)?
            .ok_or_else(|| "Error queue item was not found".to_string())?;
            let campaign_id: Option<i64> = row.get("campaign_id");
            let current_raw: String = row.get("status");
            let campaign_status: Option<String> = row.get("campaign_status");
            if campaign_status.as_deref() == Some("archived") {
                return Err("Archived campaign error items cannot be changed".to_string());
            }
            let current = ErrorQueueStatus::parse(&current_raw)
                .ok_or_else(|| "Unsupported error queue status transition".to_string())?;
            if !current.can_move_to(next) {
                return Err("Unsupported error queue status transition".to_string());
            }
            sqlx::query(
                "UPDATE error_queue_items
                 SET status = ?1, resolution_notes = ?2, updated_at = datetime('now')
                 WHERE id = ?3",
            )
            .bind(next.as_str())
            .bind(&notes)
            .bind(id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            let summary = format!(
                "Error item moved from {} to {}",
                current.as_str(),
                next.as_str()
            );
            insert_audit(
                connection,
                AuditRow {
                    campaign_id,
                    subject_type: "error_queue_item",
                    subject_id: id,
                    event_type: "error_item_updated",
                    severity: "info",
                    summary: &summary,
                    metadata: serde_json::json!({ "resolutionNotes": notes }),
                },
            )
            .await?;
            Ok(Settlement::Accepted(ErrorQueueItemStatusResult {
                id,
                previous_status: current.as_str().to_string(),
                status: next.as_str().to_string(),
            }))
        })
    })
    .await
}

#[tauri::command]
pub async fn linkgo_safety_set_global_kill_switch(
    pool: State<'_, SqlitePool>,
    input: SetGlobalKillSwitchInput,
) -> Result<GlobalKillSwitchResult, String> {
    set_global_kill_switch(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_safety_set_error_queue_item_status(
    pool: State<'_, SqlitePool>,
    input: SetErrorQueueItemStatusInput,
) -> Result<ErrorQueueItemStatusResult, String> {
    set_error_queue_item_status(pool.inner(), input).await
}

#[cfg(test)]
#[path = "safety_tests.rs"]
mod tests;
