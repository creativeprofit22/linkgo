//! Crash recovery and operator reconciliation for publishing executions.
//!
//! Recovery never contacts LinkedIn and never retries an execution that may
//! have been sent. It fences out the old owner (new token, fence + 1) before
//! writing, so a late owner can only leave evidence.

use serde_json::json;
use sqlx::{Row, SqliteConnection, SqlitePool};
use tauri::State;

use super::store::{
    self, settle_on_connection, take_over, SettleOptions, SettleResult, STORAGE_ERROR,
};
use super::types::{
    ExecutionKind, OpenPublishExecution, ReconcileExecutionInput, ReconcileExecutionResult,
    ReconcileResolution, RecoverySweepReport, TransportOutcome, RECONCILE_CONFIRMATION,
};
use crate::auth::linkedin_api::{linked_in_post_url, resolve_linkedin_target_urn};
use crate::db_transaction::{settle as settle_transaction, Settlement};

/// Far longer than one LinkedIn call can take (30s HTTP timeout plus a token
/// refresh), so only crashed or frozen owners are recovered.
pub(crate) const STALE_EXECUTION_SECONDS: i64 = 600;
const MAX_NOTE_CHARS: usize = 1000;
const MAX_URL_CHARS: usize = 2048;
const INTERRUPTED_MESSAGE: &str =
    "Linkgo stopped after contacting LinkedIn but before its answer was recorded";

fn storage(_: sqlx::Error) -> String {
    STORAGE_ERROR.to_string()
}

struct StaleRow {
    id: i64,
    fence: i64,
    status: String,
    schedule_job_id: Option<i64>,
    remote_outcome: String,
    remote_status_code: Option<i64>,
    remote_platform_id: String,
    remote_urn: String,
    remote_url: String,
    error_message: String,
}

fn evidence_outcome(row: &StaleRow) -> Option<TransportOutcome> {
    let status_code = row
        .remote_status_code
        .and_then(|code| u16::try_from(code).ok());
    match row.remote_outcome.as_str() {
        "created" => Some(TransportOutcome::Created {
            platform_id: row.remote_platform_id.clone(),
            urn: row.remote_urn.clone(),
            url: row.remote_url.clone(),
        }),
        "rejected" => Some(TransportOutcome::Rejected {
            status_code,
            message: row.error_message.clone(),
        }),
        "ambiguous" => Some(TransportOutcome::Ambiguous {
            status_code,
            message: row.error_message.clone(),
        }),
        _ => None,
    }
}

async fn stale_rows(pool: &SqlitePool, cutoff_epoch: i64) -> Result<Vec<StaleRow>, String> {
    let rows = sqlx::query(
        "SELECT id, fence, status, schedule_job_id, remote_outcome, remote_status_code,
                remote_platform_id, remote_urn, remote_url, error_message
         FROM publish_executions
         WHERE status IN ('reserved', 'in_flight')
           AND updated_at <= datetime(?1, 'unixepoch')
         ORDER BY id",
    )
    .bind(cutoff_epoch)
    .fetch_all(pool)
    .await
    .map_err(storage)?;
    rows.into_iter()
        .map(|row| {
            Ok(StaleRow {
                id: row.try_get("id").map_err(storage)?,
                fence: row.try_get("fence").map_err(storage)?,
                status: row.try_get("status").map_err(storage)?,
                schedule_job_id: row.try_get("schedule_job_id").map_err(storage)?,
                remote_outcome: row.try_get("remote_outcome").map_err(storage)?,
                remote_status_code: row.try_get("remote_status_code").map_err(storage)?,
                remote_platform_id: row.try_get("remote_platform_id").map_err(storage)?,
                remote_urn: row.try_get("remote_urn").map_err(storage)?,
                remote_url: row.try_get("remote_url").map_err(storage)?,
                error_message: row.try_get("error_message").map_err(storage)?,
            })
        })
        .collect()
}

#[derive(Clone, Copy)]
enum SweepAction {
    Abandoned,
    SettledFromEvidence,
    MarkedUnknown,
    Skipped,
}

async fn abandon(
    connection: &mut SqliteConnection,
    lease: &crate::publishing::types::ExecutionLease,
    schedule_job_id: Option<i64>,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE publish_executions
         SET status = 'abandoned', settled_at = datetime('now'), updated_at = datetime('now'),
             error_message = CASE WHEN error_message = '' THEN ?4 ELSE error_message END
         WHERE id = ?1 AND owner_token = ?2 AND fence = ?3 AND status = 'reserved'",
    )
    .bind(lease.execution_id)
    .bind(&lease.owner_token)
    .bind(lease.fence)
    .bind("Reserved but never sent to LinkedIn")
    .execute(&mut *connection)
    .await
    .map_err(storage)?;
    if let Some(job_id) = schedule_job_id {
        sqlx::query(
            "UPDATE schedule_jobs SET locked_at = NULL, locked_by = NULL, updated_at = datetime('now')
             WHERE id = ?1",
        )
        .bind(job_id)
        .execute(&mut *connection)
        .await
        .map_err(storage)?;
    }
    store::insert_event(
        connection,
        lease.execution_id,
        "abandoned",
        lease.fence,
        "Recovery released a reservation that never contacted LinkedIn.",
        json!({}),
    )
    .await
}

async fn recover_row(
    pool: &SqlitePool,
    row: StaleRow,
    retry_backoff_minutes: i64,
    now_epoch: i64,
) -> Result<SweepAction, String> {
    settle_transaction(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let Some(lease) =
                take_over(connection, row.id, row.fence, "('reserved', 'in_flight')").await?
            else {
                return Ok(Settlement::Accepted(SweepAction::Skipped));
            };
            if row.status == "reserved" {
                abandon(connection, &lease, row.schedule_job_id).await?;
                return Ok(Settlement::Accepted(SweepAction::Abandoned));
            }
            let (outcome, action) = match evidence_outcome(&row) {
                Some(outcome) => (outcome, SweepAction::SettledFromEvidence),
                None => (
                    TransportOutcome::Ambiguous {
                        status_code: None,
                        message: INTERRUPTED_MESSAGE.to_string(),
                    },
                    SweepAction::MarkedUnknown,
                ),
            };
            store::insert_event(
                connection,
                lease.execution_id,
                "recovered",
                lease.fence,
                "Recovery took over a stale in-flight execution.",
                json!({ "remoteOutcome": row.remote_outcome, "previousFence": row.fence }),
            )
            .await?;
            let result = settle_on_connection(
                connection,
                &lease,
                &outcome,
                SettleOptions::standard(retry_backoff_minutes),
                now_epoch,
            )
            .await?;
            let action = match result {
                SettleResult::OutcomeUnknown { .. } => SweepAction::MarkedUnknown,
                SettleResult::StaleOwner => SweepAction::Skipped,
                _ => action,
            };
            Ok(Settlement::Accepted(action))
        })
    })
    .await
}

/// Recovers executions whose owner stopped making progress. Runs at app
/// start, scheduler start and every tick, before each manual publish, and
/// before the reconciliation list. Each row is recovered in its own
/// transaction.
pub(crate) async fn sweep(
    pool: &SqlitePool,
    retry_backoff_minutes: i64,
    now_epoch: i64,
) -> Result<RecoverySweepReport, String> {
    let mut report = RecoverySweepReport::default();
    for row in stale_rows(pool, now_epoch - STALE_EXECUTION_SECONDS).await? {
        match recover_row(pool, row, retry_backoff_minutes, now_epoch).await? {
            SweepAction::Abandoned => report.abandoned += 1,
            SweepAction::SettledFromEvidence => report.settled_from_evidence += 1,
            SweepAction::MarkedUnknown => report.marked_unknown += 1,
            SweepAction::Skipped => {}
        }
    }
    Ok(report)
}

/// Mirrors the `scheduler_settings.retry_backoff_minutes` column default.
const DEFAULT_RETRY_BACKOFF_MINUTES: i64 = 15;

/// Read-only lookup of the scheduler backoff so the sweep can run without the
/// scheduler worker. A missing settings row falls back to the column default.
async fn retry_backoff_minutes(pool: &SqlitePool) -> Result<i64, String> {
    let value: Option<i64> =
        sqlx::query_scalar("SELECT retry_backoff_minutes FROM scheduler_settings WHERE id = 1")
            .fetch_optional(pool)
            .await
            .map_err(storage)?;
    Ok(value.unwrap_or(DEFAULT_RETRY_BACKOFF_MINUTES))
}

/// Runs the stale-execution sweep independently of the scheduler worker,
/// using the persisted scheduler backoff.
pub(crate) async fn sweep_with_saved_settings(
    pool: &SqlitePool,
    now_epoch: i64,
) -> Result<RecoverySweepReport, String> {
    let backoff = retry_backoff_minutes(pool).await?;
    sweep(pool, backoff, now_epoch).await
}

/// Recovers stale executions, then lists what is still open, so a crashed
/// manual publish surfaces as reconcilable even while the scheduler is off.
pub(crate) async fn sweep_and_list_open(
    pool: &SqlitePool,
    now_epoch: i64,
) -> Result<Vec<OpenPublishExecution>, String> {
    sweep_with_saved_settings(pool, now_epoch).await?;
    list_open(pool).await
}

pub(crate) async fn list_open(pool: &SqlitePool) -> Result<Vec<OpenPublishExecution>, String> {
    let rows = sqlx::query(
        "SELECT pe.id, pe.kind, pe.subject_id, pe.campaign_id, c.name AS campaign_name,
                pe.schedule_job_id, pe.caller, pe.status, pe.fence, pe.remote_outcome,
                pe.remote_status_code, pe.error_message, pe.reserved_at, pe.sent_at, pe.updated_at
         FROM publish_executions pe
         INNER JOIN campaigns c ON c.id = pe.campaign_id
         WHERE pe.status IN ('reserved', 'in_flight', 'outcome_unknown')
         ORDER BY pe.id",
    )
    .fetch_all(pool)
    .await
    .map_err(storage)?;
    rows.into_iter()
        .map(|row| {
            Ok(OpenPublishExecution {
                id: row.try_get("id").map_err(storage)?,
                kind: row.try_get("kind").map_err(storage)?,
                subject_id: row.try_get("subject_id").map_err(storage)?,
                campaign_id: row.try_get("campaign_id").map_err(storage)?,
                campaign_name: row.try_get("campaign_name").map_err(storage)?,
                schedule_job_id: row.try_get("schedule_job_id").map_err(storage)?,
                caller: row.try_get("caller").map_err(storage)?,
                status: row.try_get("status").map_err(storage)?,
                fence: row.try_get("fence").map_err(storage)?,
                remote_outcome: row.try_get("remote_outcome").map_err(storage)?,
                remote_status_code: row.try_get("remote_status_code").map_err(storage)?,
                error_message: row.try_get("error_message").map_err(storage)?,
                reserved_at: row.try_get("reserved_at").map_err(storage)?,
                sent_at: row.try_get("sent_at").map_err(storage)?,
                updated_at: row.try_get("updated_at").map_err(storage)?,
            })
        })
        .collect()
}

fn is_linkedin_https_url(value: &str) -> bool {
    value.starts_with("https://www.linkedin.com/") || value.starts_with("https://linkedin.com/")
}

/// Validates the operator-supplied LinkedIn reference for a `posted`
/// resolution and returns the `Created` evidence to settle with.
pub(crate) fn posted_outcome(
    kind: ExecutionKind,
    reference: &str,
) -> Result<TransportOutcome, String> {
    let reference = reference.trim();
    if reference.is_empty() {
        return Err("Paste the LinkedIn URL or URN of the published item".to_string());
    }
    if reference.chars().count() > MAX_URL_CHARS {
        return Err("LinkedIn reference is too long".to_string());
    }
    let is_url = is_linkedin_https_url(reference);
    if !is_url && !reference.starts_with("urn:li:") {
        return Err("Use a https://www.linkedin.com/ URL or a urn:li: identifier".to_string());
    }
    match kind {
        ExecutionKind::Post => {
            let urn = resolve_linkedin_target_urn(reference)
                .ok_or_else(|| "Could not find a LinkedIn post id in that reference".to_string())?;
            let url = if is_url {
                reference.to_string()
            } else {
                linked_in_post_url(&urn)
            };
            Ok(TransportOutcome::Created {
                platform_id: urn.clone(),
                urn,
                url,
            })
        }
        ExecutionKind::Comment => {
            let urn = if reference.starts_with("urn:li:comment:") {
                reference.to_string()
            } else {
                String::new()
            };
            Ok(TransportOutcome::Created {
                platform_id: if urn.is_empty() {
                    reference.to_string()
                } else {
                    urn.clone()
                },
                urn,
                url: if is_url {
                    reference.to_string()
                } else {
                    String::new()
                },
            })
        }
    }
}

/// Operator resolution of an `outcome_unknown` execution. Requires the typed
/// confirmation and the fence the operator saw, so a stale screen cannot
/// resolve a newer state. Nothing is deleted.
pub(crate) async fn reconcile(
    pool: &SqlitePool,
    input: ReconcileExecutionInput,
    now_epoch: i64,
) -> Result<ReconcileExecutionResult, String> {
    if input.confirmation != RECONCILE_CONFIRMATION {
        return Err(format!("Type {RECONCILE_CONFIRMATION} to confirm"));
    }
    if input.execution_id <= 0 || input.fence <= 0 {
        return Err("Execution id and fence must be positive".to_string());
    }
    let note: String = input.note.clone().unwrap_or_default().trim().to_string();
    if note.chars().count() > MAX_NOTE_CHARS {
        return Err("Reconciliation note is too long".to_string());
    }
    settle_transaction(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let row =
                sqlx::query("SELECT kind, status, fence FROM publish_executions WHERE id = ?1")
                    .bind(input.execution_id)
                    .fetch_optional(&mut *connection)
                    .await
                    .map_err(storage)?;
            let Some(row) = row else {
                return Ok(Settlement::Rejected(
                    "Publishing execution was not found".to_string(),
                ));
            };
            let status: String = row.try_get("status").map_err(storage)?;
            let fence: i64 = row.try_get("fence").map_err(storage)?;
            if status != "outcome_unknown" || fence != input.fence {
                return Ok(Settlement::Rejected(
                    "This execution changed since it was loaded; refresh and try again".to_string(),
                ));
            }
            let kind_text: String = row.try_get("kind").map_err(storage)?;
            let kind = ExecutionKind::parse(&kind_text).ok_or_else(|| STORAGE_ERROR.to_string())?;
            let outcome = match input.resolution {
                ReconcileResolution::Posted => {
                    match posted_outcome(kind, input.external_url.as_deref().unwrap_or_default()) {
                        Ok(outcome) => outcome,
                        Err(message) => return Ok(Settlement::Rejected(message)),
                    }
                }
                ReconcileResolution::NotPosted => TransportOutcome::Rejected {
                    status_code: None,
                    message: "Operator confirmed on LinkedIn that this was not posted".to_string(),
                },
            };
            let Some(lease) =
                take_over(connection, input.execution_id, fence, "('outcome_unknown')").await?
            else {
                return Ok(Settlement::Rejected(
                    "This execution changed since it was loaded; refresh and try again".to_string(),
                ));
            };
            sqlx::query("UPDATE publish_executions SET reconciliation_note = ?2 WHERE id = ?1")
                .bind(input.execution_id)
                .bind(&note)
                .execute(&mut *connection)
                .await
                .map_err(storage)?;
            let options = SettleOptions {
                allow_retry: false,
                retry_backoff_minutes: 0,
                reconciled: true,
            };
            let result =
                settle_on_connection(connection, &lease, &outcome, options, now_epoch).await?;
            let status = match result {
                SettleResult::Succeeded { .. } => "reconciled_posted",
                SettleResult::Failed { .. } => "reconciled_not_posted",
                // Unreachable for Created/Rejected with a fresh lease; roll back.
                _ => return Err(STORAGE_ERROR.to_string()),
            };
            resolve_unknown_outcome_errors(connection, input.execution_id).await?;
            Ok(Settlement::Accepted(ReconcileExecutionResult {
                execution_id: input.execution_id,
                status: status.to_string(),
            }))
        })
    })
    .await
}

/// Closes the "outcome unknown" error queue item raised for this execution.
async fn resolve_unknown_outcome_errors(
    connection: &mut SqliteConnection,
    execution_id: i64,
) -> Result<(), String> {
    let row = sqlx::query(
        "SELECT kind, subject_id, schedule_job_id FROM publish_executions WHERE id = ?1",
    )
    .bind(execution_id)
    .fetch_one(&mut *connection)
    .await
    .map_err(storage)?;
    let kind: String = row.try_get("kind").map_err(storage)?;
    let subject_id: i64 = row.try_get("subject_id").map_err(storage)?;
    let schedule_job_id: Option<i64> = row.try_get("schedule_job_id").map_err(storage)?;
    let (source_type, source_id) = match (kind.as_str(), schedule_job_id) {
        ("post", Some(job_id)) => ("schedule_job", job_id),
        ("post", None) => ("approval", subject_id),
        _ => ("manual", subject_id),
    };
    sqlx::query(
        "UPDATE error_queue_items
         SET status = 'resolved', updated_at = datetime('now')
         WHERE source_type = ?1 AND source_id = ?2
           AND title IN ('Publish outcome unknown', 'Comment outcome unknown')
           AND status IN ('open', 'in_progress', 'awaiting_review')",
    )
    .bind(source_type)
    .bind(source_id)
    .execute(&mut *connection)
    .await
    .map_err(storage)?;
    Ok(())
}

pub(crate) fn now_epoch() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}

#[tauri::command]
pub async fn linkgo_publish_execution_list_open(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<OpenPublishExecution>, String> {
    sweep_and_list_open(pool.inner(), now_epoch()).await
}

#[tauri::command]
pub async fn linkgo_publish_execution_reconcile(
    pool: State<'_, SqlitePool>,
    input: ReconcileExecutionInput,
) -> Result<ReconcileExecutionResult, String> {
    reconcile(pool.inner(), input, now_epoch()).await
}
