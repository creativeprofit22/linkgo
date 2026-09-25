//! Approval-side helpers for single-connection settlement.
//!
//! The pinned-transaction runner lives in `db_transaction`; it is re-exported
//! here so approval capability modules keep their existing imports.

use sqlx::SqliteConnection;

pub(crate) use crate::db_transaction::{settle, Settlement};

pub(crate) struct SafetyAuditEvent<'a> {
    pub campaign_id: i64,
    pub subject_type: &'a str,
    pub subject_id: Option<i64>,
    pub event_type: &'a str,
    pub severity: &'a str,
    pub summary: &'a str,
    pub metadata: serde_json::Value,
}

pub(crate) async fn insert_safety_audit(
    connection: &mut SqliteConnection,
    event: SafetyAuditEvent<'_>,
    storage_error: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO safety_audit_events (
            campaign_id, subject_type, subject_id, event_type, severity, summary, metadata_json
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(event.campaign_id)
    .bind(event.subject_type)
    .bind(event.subject_id)
    .bind(event.event_type)
    .bind(event.severity)
    .bind(event.summary)
    .bind(event.metadata.to_string())
    .execute(&mut *connection)
    .await
    .map_err(|_| storage_error.to_string())?;
    Ok(())
}
