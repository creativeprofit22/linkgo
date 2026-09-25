//! Native source-import batches with enforced candidate intake policy.
//!
//! Port of the renderer `writePolicyEnforcedSourceBatch`. The batch and its
//! pending items are created in one transaction; each row then settles in its
//! own pinned `BEGIN IMMEDIATE` transaction (candidate insert + item outcome
//! together); the batch outcome is written last. Any storage failure
//! terminalizes the batch as `failed` with per-row reasons, as before.
//!
//! In-flight imports are tracked in `SourceImportActivity` so interrupted
//! batches from a previous session can be recovered without touching a live
//! one. The activity check runs inside the recovery transaction, after the
//! write lock is held, so it cannot race a starting import.

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqliteConnection, SqlitePool};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::State;

use crate::candidate_policy::{evaluate_intake_policy, PolicySubject};
use crate::candidate_queue::{
    assert_campaign_can_mutate, insert_candidate, validate_candidate, CreateCandidateInput,
    DUPLICATE_CANDIDATE_MESSAGE,
};
use crate::db_transaction::{settle, Settlement};
use crate::js_text::{utf16_len, utf16_prefix};

const MAX_ROWS: usize = 50;
const MAX_INPUT_JSON_UTF16: usize = 20_000;
const MAX_REASON_UTF16: usize = 2_000;
const DUPLICATE_REASON: &str = "Duplicate URL or post text for this campaign.";
const STORAGE_ERROR_REASON: &str =
    "Candidate could not be stored. Review the row and retry the import.";
const SKIPPED_AFTER_ERROR_REASON: &str =
    "Not processed because the import stopped after a local storage error.";
const BATCH_STORAGE_ERROR: &str = "Import stopped after a local storage error.";
const INTERRUPTED_ITEM_REASON: &str =
    "Not processed because the previous app session ended before the import finished.";
const INTERRUPTED_BATCH_ERROR: &str =
    "Import stopped because the previous app session ended before processing finished.";
const START_ERROR: &str = "Source import could not be started";
const TERMINALIZE_ERROR: &str = "Source import failed and its outcome could not be recorded";
const ROW_STORAGE_ERROR: &str = "Source import row could not be stored";

/// Counts of in-flight imports per campaign. Cheap to clone; clones share
/// the same counters so a transaction closure can own one.
#[derive(Clone, Default)]
pub struct SourceImportActivity {
    active: Arc<Mutex<HashMap<i64, usize>>>,
}

impl SourceImportActivity {
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<i64, usize>> {
        // A poisoned map only holds counters; keep using it.
        self.active
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn start(&self, campaign_id: i64) -> ActiveImport<'_> {
        *self.lock().entry(campaign_id).or_insert(0) += 1;
        ActiveImport {
            activity: self,
            campaign_id,
        }
    }

    fn is_active(&self, campaign_id: i64) -> bool {
        self.lock().contains_key(&campaign_id)
    }
}

/// Decrements the campaign's in-flight count on every exit path.
struct ActiveImport<'a> {
    activity: &'a SourceImportActivity,
    campaign_id: i64,
}

impl Drop for ActiveImport<'_> {
    fn drop(&mut self) {
        let mut active = self.activity.lock();
        if let Some(count) = active.get_mut(&self.campaign_id) {
            *count -= 1;
            if *count == 0 {
                active.remove(&self.campaign_id);
            }
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceImportRowValue {
    pub url: String,
    pub content: String,
    #[serde(default)]
    pub author_name: String,
    #[serde(default)]
    pub author_profile_url: String,
    #[serde(default)]
    pub posted_at: Option<String>,
    #[serde(default)]
    pub platform_resource_urn: String,
    #[serde(default)]
    pub source_keyword: String,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceImportRowInput {
    pub row_number: i64,
    pub input_json: String,
    pub value: Option<SourceImportRowValue>,
    #[serde(default)]
    pub validation_error: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WriteSourceImportBatchInput {
    pub campaign_id: i64,
    pub connector_key: String,
    pub rows: Vec<SourceImportRowInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecoverSourceImportsInput {
    pub campaign_id: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SourceImportBatchResult {
    pub batch_id: i64,
    pub status: String,
    pub total_count: i64,
    pub accepted_count: i64,
    pub duplicate_count: i64,
    pub rejected_count: i64,
    pub error_message: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecoverSourceImportsResult {
    pub recovered: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RowOutcome {
    Accepted,
    Duplicate,
    Rejected,
}

fn validate(input: &WriteSourceImportBatchInput) -> Result<(), String> {
    if input.campaign_id <= 0 {
        return Err("Campaign is required".to_string());
    }
    if input.connector_key != "local_json" {
        return Err("Unsupported source connector".to_string());
    }
    if input.rows.is_empty() {
        return Err("Include at least one source post".to_string());
    }
    if input.rows.len() > MAX_ROWS {
        return Err(format!("Import up to {MAX_ROWS} rows"));
    }
    for (index, row) in input.rows.iter().enumerate() {
        if usize::try_from(row.row_number).ok() != Some(index + 1) {
            return Err("Source import rows must be numbered in order".to_string());
        }
        if utf16_len(&row.input_json) > MAX_INPUT_JSON_UTF16 {
            return Err("Source import row audit JSON is too long".to_string());
        }
        if utf16_len(&row.validation_error) > MAX_REASON_UTF16 {
            return Err("Source import row reason is too long".to_string());
        }
        if row.value.is_none() && row.validation_error.trim().is_empty() {
            return Err("Invalid source import rows need a validation reason".to_string());
        }
    }
    Ok(())
}

async fn update_item_outcome(
    connection: &mut SqliteConnection,
    batch_id: i64,
    row_number: i64,
    outcome: (&str, Option<i64>, &str, &str),
) -> Result<(), String> {
    let (status, candidate_post_id, reason, policy_rule_key) = outcome;
    let result = sqlx::query(
        "UPDATE source_import_items
         SET status = ?1, candidate_post_id = ?2, reason = ?3, policy_rule_key = ?4,
             updated_at = datetime('now')
         WHERE source_import_batch_id = ?5 AND row_number = ?6",
    )
    .bind(status)
    .bind(candidate_post_id)
    .bind(utf16_prefix(reason, MAX_REASON_UTF16))
    .bind(policy_rule_key)
    .bind(batch_id)
    .bind(row_number)
    .execute(&mut *connection)
    .await
    .map_err(|_| ROW_STORAGE_ERROR.to_string())?;
    if result.rows_affected() != 1 {
        return Err("Source import item outcome was not stored".to_string());
    }
    Ok(())
}

async fn update_batch_outcome(
    connection: &mut SqliteConnection,
    result: &SourceImportBatchResult,
) -> Result<(), String> {
    let updated = sqlx::query(
        "UPDATE source_import_batches
         SET status = ?1, accepted_count = ?2, duplicate_count = ?3, rejected_count = ?4,
             error_message = ?5, updated_at = datetime('now')
         WHERE id = ?6",
    )
    .bind(&result.status)
    .bind(result.accepted_count)
    .bind(result.duplicate_count)
    .bind(result.rejected_count)
    .bind(&result.error_message)
    .bind(result.batch_id)
    .execute(&mut *connection)
    .await
    .map_err(|_| ROW_STORAGE_ERROR.to_string())?;
    if updated.rows_affected() != 1 {
        return Err("Source import batch outcome was not stored".to_string());
    }
    Ok(())
}

struct FailureReasons<'a> {
    failed_row_number: Option<i64>,
    failed_reason: &'a str,
    remaining_reason: &'a str,
    batch_error: &'a str,
}

/// Rejects every still-pending item and marks the batch failed. Port of
/// `terminalizeFailedBatch`; caller owns the transaction.
async fn terminalize_batch(
    connection: &mut SqliteConnection,
    batch_id: i64,
    total_count: i64,
    reasons: &FailureReasons<'_>,
) -> Result<SourceImportBatchResult, String> {
    let items = sqlx::query(
        "SELECT row_number, status FROM source_import_items
         WHERE source_import_batch_id = ?1 ORDER BY row_number ASC",
    )
    .bind(batch_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|_| TERMINALIZE_ERROR.to_string())?;
    let (mut accepted, mut duplicate, mut rejected) = (0, 0, 0);
    for item in items {
        let row_number: i64 = item.get("row_number");
        let status: String = item.get("status");
        match status.as_str() {
            "pending" => {
                let reason = if reasons
                    .failed_row_number
                    .is_none_or(|row| row == row_number)
                {
                    reasons.failed_reason
                } else {
                    reasons.remaining_reason
                };
                update_item_outcome(
                    connection,
                    batch_id,
                    row_number,
                    ("rejected", None, reason, ""),
                )
                .await?;
                rejected += 1;
            }
            "accepted" => accepted += 1,
            "duplicate" => duplicate += 1,
            "rejected" => rejected += 1,
            _ => {}
        }
    }
    let result = SourceImportBatchResult {
        batch_id,
        status: "failed".to_string(),
        total_count,
        accepted_count: accepted,
        duplicate_count: duplicate,
        rejected_count: rejected,
        error_message: reasons.batch_error.to_string(),
    };
    update_batch_outcome(connection, &result).await?;
    Ok(result)
}

async fn create_batch_rows(
    pool: &SqlitePool,
    input: &WriteSourceImportBatchInput,
) -> Result<i64, String> {
    let campaign_id = input.campaign_id;
    let connector_key = input.connector_key.clone();
    let rows: Vec<(i64, String)> = input
        .rows
        .iter()
        .map(|row| (row.row_number, row.input_json.clone()))
        .collect();
    settle(pool, START_ERROR, move |connection| {
        Box::pin(async move {
            assert_campaign_can_mutate(connection, campaign_id)
                .await
                .map_err(|error| {
                    if error == "Campaign was not found" || error == "Campaign is archived" {
                        error
                    } else {
                        START_ERROR.to_string()
                    }
                })?;
            let batch_id = sqlx::query(
                "INSERT INTO source_import_batches (
                    campaign_id, source_type, status, total_count, accepted_count,
                    duplicate_count, rejected_count, error_message, updated_at
                 ) VALUES (?1, ?2, 'processing', ?3, 0, 0, 0, '', datetime('now'))",
            )
            .bind(campaign_id)
            .bind(&connector_key)
            .bind(i64::try_from(rows.len()).unwrap_or(i64::MAX))
            .execute(&mut *connection)
            .await
            .map_err(|_| START_ERROR.to_string())?
            .last_insert_rowid();
            for (row_number, input_json) in &rows {
                sqlx::query(
                    "INSERT INTO source_import_items (
                        source_import_batch_id, row_number, status, input_json,
                        candidate_post_id, reason, policy_rule_key, updated_at
                     ) VALUES (?1, ?2, 'pending', ?3, NULL, '', '', datetime('now'))",
                )
                .bind(batch_id)
                .bind(row_number)
                .bind(input_json)
                .execute(&mut *connection)
                .await
                .map_err(|_| START_ERROR.to_string())?;
            }
            Ok(Settlement::Accepted(batch_id))
        })
    })
    .await
}

/// Settles one row: validation rejection, policy rejection, duplicate, or a
/// new candidate, each together with its item outcome.
async fn settle_row(
    pool: &SqlitePool,
    campaign_id: i64,
    batch_id: i64,
    row: SourceImportRowInput,
    now_ms: i64,
) -> Result<RowOutcome, String> {
    settle(pool, ROW_STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let row_number = row.row_number;
            let Some(value) = row.value else {
                update_item_outcome(
                    connection,
                    batch_id,
                    row_number,
                    ("rejected", None, &row.validation_error, ""),
                )
                .await?;
                return Ok(Settlement::Accepted(RowOutcome::Rejected));
            };
            let candidate = validate_candidate(&CreateCandidateInput {
                campaign_id,
                url: value.url,
                content: value.content,
                author_name: value.author_name,
                author_profile_url: value.author_profile_url,
                posted_at: value.posted_at,
                platform_resource_urn: value.platform_resource_urn,
                source_keyword: value.source_keyword,
                relevance_score: None,
                score_reason: String::new(),
                notes: value.notes,
            })?;
            assert_campaign_can_mutate(connection, campaign_id).await?;

            let findings = evaluate_intake_policy(
                connection,
                &PolicySubject {
                    campaign_id,
                    url: &candidate.url,
                    normalized_url: &candidate.normalized_url,
                    author_profile_url: &candidate.author_profile_url,
                    platform_resource_urn: &candidate.platform_resource_urn,
                    posted_at: candidate.posted_at.as_deref(),
                    content: &candidate.content,
                    source_keyword: &candidate.source_keyword,
                },
                now_ms,
            )
            .await
            .map_err(|_| ROW_STORAGE_ERROR.to_string())?;
            if let Some(primary) = findings.first() {
                let reason = findings
                    .iter()
                    .map(|finding| finding.message.as_str())
                    .collect::<Vec<_>>()
                    .join(" ");
                update_item_outcome(
                    connection,
                    batch_id,
                    row_number,
                    ("rejected", None, &reason, primary.rule.as_str()),
                )
                .await?;
                return Ok(Settlement::Accepted(RowOutcome::Rejected));
            }

            // The savepoint lets a duplicate discard any partial candidate
            // writes while keeping the item outcome in this transaction.
            sqlx::query("SAVEPOINT source_import_row")
                .execute(&mut *connection)
                .await
                .map_err(|_| ROW_STORAGE_ERROR.to_string())?;
            match insert_candidate(connection, &candidate).await {
                Ok(candidate_id) => {
                    sqlx::query("RELEASE source_import_row")
                        .execute(&mut *connection)
                        .await
                        .map_err(|_| ROW_STORAGE_ERROR.to_string())?;
                    update_item_outcome(
                        connection,
                        batch_id,
                        row_number,
                        (
                            "accepted",
                            Some(candidate_id),
                            &format!("Candidate {candidate_id} created."),
                            "",
                        ),
                    )
                    .await?;
                    Ok(Settlement::Accepted(RowOutcome::Accepted))
                }
                Err(error) if error == DUPLICATE_CANDIDATE_MESSAGE => {
                    for statement in ["ROLLBACK TO source_import_row", "RELEASE source_import_row"]
                    {
                        sqlx::query(statement)
                            .execute(&mut *connection)
                            .await
                            .map_err(|_| ROW_STORAGE_ERROR.to_string())?;
                    }
                    update_item_outcome(
                        connection,
                        batch_id,
                        row_number,
                        ("duplicate", None, DUPLICATE_REASON, ""),
                    )
                    .await?;
                    Ok(Settlement::Accepted(RowOutcome::Duplicate))
                }
                Err(error) => Err(error),
            }
        })
    })
    .await
}

async fn terminalize_after_failure(
    pool: &SqlitePool,
    batch_id: i64,
    total_count: i64,
    failed_row_number: Option<i64>,
) -> Result<SourceImportBatchResult, String> {
    settle(pool, TERMINALIZE_ERROR, move |connection| {
        Box::pin(async move {
            let result = terminalize_batch(
                connection,
                batch_id,
                total_count,
                &FailureReasons {
                    failed_row_number,
                    failed_reason: STORAGE_ERROR_REASON,
                    remaining_reason: SKIPPED_AFTER_ERROR_REASON,
                    batch_error: BATCH_STORAGE_ERROR,
                },
            )
            .await
            .map_err(|_| TERMINALIZE_ERROR.to_string())?;
            Ok(Settlement::Accepted(result))
        })
    })
    .await
}

pub(crate) async fn write_batch(
    pool: &SqlitePool,
    activity: &SourceImportActivity,
    input: WriteSourceImportBatchInput,
    now_ms: i64,
) -> Result<SourceImportBatchResult, String> {
    validate(&input)?;
    let _active = activity.start(input.campaign_id);
    let batch_id = create_batch_rows(pool, &input).await?;
    let total_count = i64::try_from(input.rows.len()).unwrap_or(i64::MAX);
    let (mut accepted, mut duplicate, mut rejected) = (0, 0, 0);

    for row in input.rows {
        let row_number = row.row_number;
        match settle_row(pool, input.campaign_id, batch_id, row, now_ms).await {
            Ok(RowOutcome::Accepted) => accepted += 1,
            Ok(RowOutcome::Duplicate) => duplicate += 1,
            Ok(RowOutcome::Rejected) => rejected += 1,
            Err(_) => {
                return terminalize_after_failure(pool, batch_id, total_count, Some(row_number))
                    .await;
            }
        }
    }

    let result = SourceImportBatchResult {
        batch_id,
        status: if accepted == total_count {
            "completed"
        } else {
            "completed_with_errors"
        }
        .to_string(),
        total_count,
        accepted_count: accepted,
        duplicate_count: duplicate,
        rejected_count: rejected,
        error_message: String::new(),
    };
    let outcome = result.clone();
    let stored = settle(pool, ROW_STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            update_batch_outcome(connection, &outcome).await?;
            Ok(Settlement::Accepted(()))
        })
    })
    .await;
    match stored {
        Ok(()) => Ok(result),
        Err(_) => terminalize_after_failure(pool, batch_id, total_count, None).await,
    }
}

/// Fails `processing` batches left behind by an ended app session, unless an
/// import for the campaign is running in this process.
pub(crate) async fn recover_interrupted(
    pool: &SqlitePool,
    activity: &SourceImportActivity,
    input: RecoverSourceImportsInput,
) -> Result<RecoverSourceImportsResult, String> {
    if input.campaign_id <= 0 {
        return Err("Campaign is required".to_string());
    }
    let campaign_id = input.campaign_id;
    let activity = activity.clone();
    settle(pool, TERMINALIZE_ERROR, move |connection| {
        Box::pin(async move {
            if activity.is_active(campaign_id) {
                return Ok(Settlement::Accepted(RecoverSourceImportsResult {
                    recovered: 0,
                }));
            }
            let batches = sqlx::query(
                "SELECT id, total_count FROM source_import_batches
                 WHERE campaign_id = ?1 AND status = 'processing' ORDER BY id ASC",
            )
            .bind(campaign_id)
            .fetch_all(&mut *connection)
            .await
            .map_err(|_| TERMINALIZE_ERROR.to_string())?;
            let mut recovered = 0;
            for batch in batches {
                terminalize_batch(
                    connection,
                    batch.get("id"),
                    batch.get("total_count"),
                    &FailureReasons {
                        failed_row_number: None,
                        failed_reason: INTERRUPTED_ITEM_REASON,
                        remaining_reason: INTERRUPTED_ITEM_REASON,
                        batch_error: INTERRUPTED_BATCH_ERROR,
                    },
                )
                .await
                .map_err(|_| TERMINALIZE_ERROR.to_string())?;
                recovered += 1;
            }
            Ok(Settlement::Accepted(RecoverSourceImportsResult {
                recovered,
            }))
        })
    })
    .await
}

#[tauri::command]
pub async fn linkgo_source_import_write_batch(
    pool: State<'_, SqlitePool>,
    activity: State<'_, SourceImportActivity>,
    input: WriteSourceImportBatchInput,
) -> Result<SourceImportBatchResult, String> {
    let now_ms = chrono::Utc::now().timestamp_millis();
    write_batch(pool.inner(), activity.inner(), input, now_ms).await
}

#[tauri::command]
pub async fn linkgo_source_import_recover_interrupted(
    pool: State<'_, SqlitePool>,
    activity: State<'_, SourceImportActivity>,
    input: RecoverSourceImportsInput,
) -> Result<RecoverSourceImportsResult, String> {
    recover_interrupted(pool.inner(), activity.inner(), input).await
}

#[cfg(test)]
#[path = "source_imports_tests.rs"]
mod tests;
