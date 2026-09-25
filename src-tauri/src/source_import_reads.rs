//! Native source-import dashboard read: the 10 most recent batches for a
//! campaign with their items (each batch holds at most 50 rows), read from
//! one transaction snapshot. Interrupted-batch recovery stays a separate
//! write command that the renderer calls first.

use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteRow, Row, SqlitePool};
use tauri::State;

const READ_ERROR: &str = "Could not load source imports";
pub(crate) const RECENT_BATCH_LIMIT: i64 = 10;
/// Matches the write-side `MAX_ROWS`, so a full batch is never cut off.
pub(crate) const BATCH_ITEM_LIMIT: i64 = 50;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceImportDashboardInput {
    pub campaign_id: i64,
}

/// Mirrors the renderer `SourceImportItem`.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct SourceImportItemRow {
    pub id: i64,
    pub source_import_batch_id: i64,
    pub row_number: i64,
    pub status: String,
    pub input_json: String,
    pub candidate_post_id: Option<i64>,
    pub reason: String,
    pub policy_rule_key: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Mirrors the renderer `SourceImportBatch` plus its items.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct SourceImportBatchRow {
    pub id: i64,
    pub campaign_id: i64,
    pub source_type: String,
    pub status: String,
    pub total_count: i64,
    pub accepted_count: i64,
    pub duplicate_count: i64,
    pub rejected_count: i64,
    pub error_message: String,
    pub created_at: String,
    pub updated_at: String,
    pub items: Vec<SourceImportItemRow>,
}

fn read_error(_: sqlx::Error) -> String {
    READ_ERROR.to_string()
}

fn item_row(row: &SqliteRow) -> SourceImportItemRow {
    SourceImportItemRow {
        id: row.get("id"),
        source_import_batch_id: row.get("source_import_batch_id"),
        row_number: row.get("row_number"),
        status: row.get("status"),
        input_json: row.get("input_json"),
        candidate_post_id: row.get("candidate_post_id"),
        reason: row.get("reason"),
        policy_rule_key: row.get("policy_rule_key"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

pub(crate) async fn source_import_dashboard(
    pool: &SqlitePool,
    input: SourceImportDashboardInput,
) -> Result<Vec<SourceImportBatchRow>, String> {
    if input.campaign_id <= 0 {
        return Err("Campaign is required".to_string());
    }
    let mut transaction = pool.begin().await.map_err(read_error)?;
    let batches = sqlx::query(
        "SELECT id, campaign_id, source_type, status, total_count, accepted_count,
                duplicate_count, rejected_count, error_message, created_at, updated_at
         FROM source_import_batches
         WHERE campaign_id = ?1
         ORDER BY datetime(created_at) DESC, id DESC
         LIMIT ?2",
    )
    .bind(input.campaign_id)
    .bind(RECENT_BATCH_LIMIT)
    .fetch_all(&mut *transaction)
    .await
    .map_err(read_error)?;

    let mut details = Vec::with_capacity(batches.len());
    for batch in &batches {
        let batch_id: i64 = batch.get("id");
        let items = sqlx::query(
            "SELECT id, source_import_batch_id, row_number, status, input_json,
                    candidate_post_id, reason, policy_rule_key, created_at, updated_at
             FROM source_import_items
             WHERE source_import_batch_id = ?1
             ORDER BY row_number ASC
             LIMIT ?2",
        )
        .bind(batch_id)
        .bind(BATCH_ITEM_LIMIT)
        .fetch_all(&mut *transaction)
        .await
        .map_err(read_error)?;
        details.push(SourceImportBatchRow {
            id: batch_id,
            campaign_id: batch.get("campaign_id"),
            source_type: batch.get("source_type"),
            status: batch.get("status"),
            total_count: batch.get("total_count"),
            accepted_count: batch.get("accepted_count"),
            duplicate_count: batch.get("duplicate_count"),
            rejected_count: batch.get("rejected_count"),
            error_message: batch.get("error_message"),
            created_at: batch.get("created_at"),
            updated_at: batch.get("updated_at"),
            items: items.iter().map(item_row).collect(),
        });
    }
    transaction.commit().await.map_err(read_error)?;
    Ok(details)
}

#[tauri::command]
pub async fn linkgo_source_import_dashboard(
    pool: State<'_, SqlitePool>,
    input: SourceImportDashboardInput,
) -> Result<Vec<SourceImportBatchRow>, String> {
    source_import_dashboard(pool.inner(), input).await
}

#[cfg(test)]
#[path = "source_import_reads_tests.rs"]
mod tests;
