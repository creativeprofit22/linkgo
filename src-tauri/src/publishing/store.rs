//! Durable execution ledger: reservation before LinkedIn I/O, fenced evidence
//! capture, and one-transaction settlement of every linked local record.
//!
//! Every owner write carries `(id, owner_token, fence)`. Recovery and operator
//! reconciliation take over by rotating the token and bumping the fence, so a
//! late owner can never overwrite a newer owner's settlement.

use serde_json::json;
use sqlx::{Row, SqliteConnection, SqlitePool};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use super::types::{ExecutionCaller, ExecutionKind, ExecutionLease, TransportOutcome};
use crate::approvals::{
    execute_record_publish_attempt, validate_record_publish_attempt, PublishRecordMode,
    RecordPublishAttemptInput,
};
use crate::auth::publish::{
    check_comment_preflight, check_post_preflight, LinkedInPublishCommentInput,
    LinkedInPublishPostInput,
};
use crate::comments::{
    execute_record_comment_attempt, CommentRecordMode, RecordCommentAttemptInput,
    Settlement as CommentSettlement,
};
use crate::db_transaction::{settle as settle_transaction, Settlement};

pub(crate) const STORAGE_ERROR: &str = "Could not record publishing execution";
pub(crate) const OPEN_EXECUTION_ERROR: &str =
    "Another publish for this item is in progress or awaiting reconciliation";
pub(crate) const OPEN_STATUSES_SQL: &str = "('reserved', 'in_flight', 'outcome_unknown')";

static TOKEN_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Unique (not secret) owner identity for one reservation or takeover.
pub(crate) fn new_owner_token() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let counter = TOKEN_COUNTER.fetch_add(1, Ordering::SeqCst);
    format!("{}-{nanos:x}-{counter:x}", std::process::id())
}

/// Deterministic FNV-1a 64-bit digest of the exact commentary sent.
pub(crate) fn content_hash(text: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in text.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

fn storage(_: sqlx::Error) -> String {
    STORAGE_ERROR.to_string()
}

pub(crate) async fn ensure_no_open_execution(
    connection: &mut SqliteConnection,
    kind: ExecutionKind,
    subject_id: i64,
) -> Result<(), String> {
    let open = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(*) FROM publish_executions
         WHERE kind = ?1 AND subject_id = ?2 AND status IN {OPEN_STATUSES_SQL}"
    ))
    .bind(kind.as_str())
    .bind(subject_id)
    .fetch_one(&mut *connection)
    .await
    .map_err(storage)?;
    if open > 0 {
        return Err(OPEN_EXECUTION_ERROR.to_string());
    }
    Ok(())
}

pub(crate) async fn insert_event(
    connection: &mut SqliteConnection,
    execution_id: i64,
    event_type: &str,
    fence: i64,
    summary: &str,
    metadata: serde_json::Value,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO publish_execution_events (execution_id, event_type, fence, summary, metadata_json)
         VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(execution_id)
    .bind(event_type)
    .bind(fence)
    .bind(summary)
    .bind(metadata.to_string())
    .execute(&mut *connection)
    .await
    .map_err(storage)?;
    Ok(())
}

/// What the owner needs to perform the LinkedIn call after reserving.
#[derive(Debug, Clone)]
pub(crate) struct Reservation {
    pub lease: ExecutionLease,
    pub commentary: String,
    pub target_urn: Option<String>,
}

/// Why a reservation was refused. No row is written for either case.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ReserveRefusal {
    /// Another execution for the same subject is open.
    OpenExecution,
    /// A publish policy gate refused (kill switch, readiness, limits…).
    Policy(String),
}

pub(crate) enum ReserveRequest {
    Post(LinkedInPublishPostInput),
    Comment(LinkedInPublishCommentInput),
}

impl ReserveRequest {
    fn kind(&self) -> ExecutionKind {
        match self {
            Self::Post(_) => ExecutionKind::Post,
            Self::Comment(_) => ExecutionKind::Comment,
        }
    }

    fn subject_id(&self) -> i64 {
        match self {
            Self::Post(input) => input.approval_id,
            Self::Comment(input) => input.comment_thread_id,
        }
    }
}

/// Runs every existing publish gate and inserts a `reserved` execution row in
/// one `BEGIN IMMEDIATE` transaction, before any network I/O.
pub(crate) async fn reserve(
    pool: &SqlitePool,
    request: ReserveRequest,
    caller: ExecutionCaller,
) -> Result<Result<Reservation, ReserveRefusal>, String> {
    settle_transaction(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let kind = request.kind();
            let subject_id = request.subject_id();
            if ensure_no_open_execution(connection, kind, subject_id)
                .await
                .is_err()
            {
                return Ok(Settlement::Accepted(Err(ReserveRefusal::OpenExecution)));
            }
            let (campaign_id, commentary, target_urn, schedule_job_id, idempotency_key) =
                match &request {
                    ReserveRequest::Post(input) => {
                        match check_post_preflight(connection, input).await {
                            Ok(preflight) => (
                                preflight.campaign_id,
                                preflight.commentary,
                                None,
                                input.schedule_job_id,
                                input.idempotency_key.clone(),
                            ),
                            Err(message) => {
                                return Ok(Settlement::Accepted(Err(ReserveRefusal::Policy(
                                    message,
                                ))))
                            }
                        }
                    }
                    ReserveRequest::Comment(input) => {
                        match check_comment_preflight(connection, input).await {
                            Ok(preflight) => (
                                preflight.campaign_id,
                                preflight.commentary,
                                Some(preflight.target_urn),
                                None,
                                input.idempotency_key.clone(),
                            ),
                            Err(message) => {
                                return Ok(Settlement::Accepted(Err(ReserveRefusal::Policy(
                                    message,
                                ))))
                            }
                        }
                    }
                };
            let owner_token = new_owner_token();
            let execution_id = sqlx::query(
                "INSERT INTO publish_executions (
                    kind, subject_id, campaign_id, schedule_job_id, caller, status,
                    owner_token, fence, idempotency_key, content_hash
                 ) VALUES (?1, ?2, ?3, ?4, ?5, 'reserved', ?6, 1, ?7, ?8)",
            )
            .bind(kind.as_str())
            .bind(subject_id)
            .bind(campaign_id)
            .bind(schedule_job_id)
            .bind(caller.as_str())
            .bind(&owner_token)
            .bind(&idempotency_key)
            .bind(content_hash(&commentary))
            .execute(&mut *connection)
            .await
            .map_err(storage)?
            .last_insert_rowid();
            insert_event(
                connection,
                execution_id,
                "reserved",
                1,
                "Publishing execution reserved before contacting LinkedIn.",
                json!({ "caller": caller.as_str(), "scheduleJobId": schedule_job_id }),
            )
            .await?;
            Ok(Settlement::Accepted(Ok(Reservation {
                lease: ExecutionLease {
                    execution_id,
                    owner_token,
                    fence: 1,
                },
                commentary,
                target_urn,
            })))
        })
    })
    .await
}

/// Commits `in_flight` before the LinkedIn request is sent. Returns false when
/// this owner no longer holds the lease.
pub(crate) async fn mark_in_flight(
    pool: &SqlitePool,
    lease: &ExecutionLease,
) -> Result<bool, String> {
    let lease = lease.clone();
    settle_transaction(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let changed = sqlx::query(
                "UPDATE publish_executions
                 SET status = 'in_flight', sent_at = datetime('now'), updated_at = datetime('now')
                 WHERE id = ?1 AND owner_token = ?2 AND fence = ?3 AND status = 'reserved'",
            )
            .bind(lease.execution_id)
            .bind(&lease.owner_token)
            .bind(lease.fence)
            .execute(&mut *connection)
            .await
            .map_err(storage)?
            .rows_affected();
            if changed == 1 {
                insert_event(
                    connection,
                    lease.execution_id,
                    "sent",
                    lease.fence,
                    "Publishing execution is contacting LinkedIn.",
                    json!({}),
                )
                .await?;
            }
            Ok(Settlement::Accepted(changed == 1))
        })
    })
    .await
}

fn outcome_columns(outcome: &TransportOutcome) -> (Option<i64>, String, String, String, String) {
    match outcome {
        TransportOutcome::Created {
            platform_id,
            urn,
            url,
        } => (
            None,
            platform_id.clone(),
            urn.clone(),
            url.clone(),
            String::new(),
        ),
        TransportOutcome::Rejected {
            status_code,
            message,
        }
        | TransportOutcome::Ambiguous {
            status_code,
            message,
        } => (
            status_code.map(i64::from),
            String::new(),
            String::new(),
            String::new(),
            message.clone(),
        ),
    }
}

/// First durable write after LinkedIn answers: one statement, so the remote
/// evidence survives even if full settlement later fails. A fenced-out owner
/// still stores evidence when the row has none, but never changes status.
pub(crate) async fn record_remote_result(
    pool: &SqlitePool,
    lease: &ExecutionLease,
    outcome: &TransportOutcome,
) -> Result<bool, String> {
    let (status_code, platform_id, urn, url, error_message) = outcome_columns(outcome);
    let changed = sqlx::query(
        "UPDATE publish_executions
         SET remote_outcome = ?4, remote_status_code = ?5, remote_platform_id = ?6,
             remote_urn = ?7, remote_url = ?8, error_message = ?9,
             remote_recorded_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?1 AND owner_token = ?2 AND fence = ?3 AND status = 'in_flight'",
    )
    .bind(lease.execution_id)
    .bind(&lease.owner_token)
    .bind(lease.fence)
    .bind(outcome.remote_outcome())
    .bind(status_code)
    .bind(&platform_id)
    .bind(&urn)
    .bind(&url)
    .bind(&error_message)
    .execute(pool)
    .await
    .map_err(storage)?
    .rows_affected();
    Ok(changed == 1)
}

/// Late owner path: keep the evidence for the operator without touching
/// status, and never overwrite evidence already on the row.
pub(crate) async fn record_stale_owner_evidence(
    pool: &SqlitePool,
    lease: &ExecutionLease,
    outcome: &TransportOutcome,
) -> Result<(), String> {
    let lease = lease.clone();
    let outcome = outcome.clone();
    settle_transaction(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let (status_code, platform_id, urn, url, error_message) = outcome_columns(&outcome);
            sqlx::query(
                "UPDATE publish_executions
                 SET remote_outcome = ?2, remote_status_code = ?3, remote_platform_id = ?4,
                     remote_urn = ?5, remote_url = ?6,
                     error_message = CASE WHEN error_message = '' THEN ?7 ELSE error_message END,
                     remote_recorded_at = datetime('now'), updated_at = datetime('now')
                 WHERE id = ?1 AND remote_outcome = ''",
            )
            .bind(lease.execution_id)
            .bind(outcome.remote_outcome())
            .bind(status_code)
            .bind(&platform_id)
            .bind(&urn)
            .bind(&url)
            .bind(&error_message)
            .execute(&mut *connection)
            .await
            .map_err(storage)?;
            insert_event(
                connection,
                lease.execution_id,
                "stale_owner",
                lease.fence,
                "A fenced-out owner finished after recovery took over; its result was kept as evidence only.",
                json!({
                    "staleFence": lease.fence,
                    "remoteOutcome": outcome.remote_outcome(),
                    "platformId": platform_id,
                    "url": url,
                }),
            )
            .await?;
            Ok(Settlement::Accepted(()))
        })
    })
    .await
}

/// How settlement should finish an execution.
#[derive(Debug, Clone, Copy)]
pub(crate) struct SettleOptions {
    /// Scheduler jobs may retry after a definite failure when attempts remain.
    pub allow_retry: bool,
    pub retry_backoff_minutes: i64,
    /// Operator reconciliation writes `reconciled_*` statuses.
    pub reconciled: bool,
}

impl SettleOptions {
    pub fn standard(retry_backoff_minutes: i64) -> Self {
        Self {
            allow_retry: true,
            retry_backoff_minutes,
            reconciled: false,
        }
    }
}

/// Result of one settlement transaction.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum SettleResult {
    Succeeded {
        platform_id: String,
        url: String,
    },
    Failed {
        message: String,
        retry_scheduled: bool,
    },
    OutcomeUnknown {
        message: String,
    },
    /// The lease was superseded; nothing was settled.
    StaleOwner,
}

struct ExecutionRow {
    kind: ExecutionKind,
    subject_id: i64,
    campaign_id: i64,
    schedule_job_id: Option<i64>,
    caller: String,
    idempotency_key: String,
}

async fn load_owned_row(
    connection: &mut SqliteConnection,
    lease: &ExecutionLease,
) -> Result<Option<ExecutionRow>, String> {
    let row = sqlx::query(
        "SELECT kind, subject_id, campaign_id, schedule_job_id, caller, idempotency_key
         FROM publish_executions
         WHERE id = ?1 AND owner_token = ?2 AND fence = ?3
           AND status IN ('in_flight', 'outcome_unknown')",
    )
    .bind(lease.execution_id)
    .bind(&lease.owner_token)
    .bind(lease.fence)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage)?;
    let Some(row) = row else {
        return Ok(None);
    };
    let kind: String = row.try_get("kind").map_err(storage)?;
    Ok(Some(ExecutionRow {
        kind: ExecutionKind::parse(&kind).ok_or_else(|| STORAGE_ERROR.to_string())?,
        subject_id: row.try_get("subject_id").map_err(storage)?,
        campaign_id: row.try_get("campaign_id").map_err(storage)?,
        schedule_job_id: row.try_get("schedule_job_id").map_err(storage)?,
        caller: row.try_get("caller").map_err(storage)?,
        idempotency_key: row.try_get("idempotency_key").map_err(storage)?,
    }))
}

async fn finish_execution(
    connection: &mut SqliteConnection,
    lease: &ExecutionLease,
    status: &str,
    attempt_id: Option<i64>,
    summary: &str,
) -> Result<(), String> {
    let changed = sqlx::query(
        "UPDATE publish_executions
         SET status = ?4, attempt_id = COALESCE(?5, attempt_id),
             settled_at = CASE WHEN ?4 = 'outcome_unknown' THEN settled_at ELSE datetime('now') END,
             updated_at = datetime('now')
         WHERE id = ?1 AND owner_token = ?2 AND fence = ?3
           AND status IN ('in_flight', 'outcome_unknown')",
    )
    .bind(lease.execution_id)
    .bind(&lease.owner_token)
    .bind(lease.fence)
    .bind(status)
    .bind(attempt_id)
    .execute(&mut *connection)
    .await
    .map_err(storage)?
    .rows_affected();
    if changed != 1 {
        // Load and finish run in one transaction, so this only happens if the
        // row changed underneath us; roll back rather than half-settle.
        return Err(STORAGE_ERROR.to_string());
    }
    let event_type = match status {
        "outcome_unknown" => "outcome_unknown",
        "reconciled_posted" | "reconciled_not_posted" => "reconciled",
        _ => "settled",
    };
    insert_event(
        connection,
        lease.execution_id,
        event_type,
        lease.fence,
        summary,
        json!({ "status": status, "attemptId": attempt_id }),
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn insert_scheduler_event(
    connection: &mut SqliteConnection,
    campaign_id: i64,
    approval_id: i64,
    schedule_job_id: i64,
    event_type: &str,
    severity: &str,
    summary: &str,
    metadata: serde_json::Value,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO scheduler_events (
            campaign_id, approval_id, schedule_job_id, event_type, severity, summary, metadata_json
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(campaign_id)
    .bind(approval_id)
    .bind(schedule_job_id)
    .bind(event_type)
    .bind(severity)
    .bind(summary)
    .bind(metadata.to_string())
    .execute(&mut *connection)
    .await
    .map_err(storage)?;
    Ok(())
}

async fn release_job_lock(
    connection: &mut SqliteConnection,
    schedule_job_id: i64,
    last_error: &str,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE schedule_jobs
         SET locked_at = NULL, locked_by = NULL, last_error = ?2, updated_at = datetime('now')
         WHERE id = ?1",
    )
    .bind(schedule_job_id)
    .bind(last_error)
    .execute(&mut *connection)
    .await
    .map_err(storage)?;
    Ok(())
}

/// Error queue entry so an ambiguous outcome is visible in the Safety view.
/// Posts attach to the schedule job or approval; comments use the existing
/// comment-thread (`manual`) source.
async fn upsert_unknown_outcome_error(
    connection: &mut SqliteConnection,
    row: &ExecutionRow,
    detail: &str,
) -> Result<(), String> {
    let (source_type, source_id, title) = match (row.kind, row.schedule_job_id) {
        (ExecutionKind::Post, Some(job_id)) => ("schedule_job", job_id, "Publish outcome unknown"),
        (ExecutionKind::Post, None) => ("approval", row.subject_id, "Publish outcome unknown"),
        (ExecutionKind::Comment, _) => ("manual", row.subject_id, "Comment outcome unknown"),
    };
    let existing = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM error_queue_items
         WHERE source_type = ?1 AND source_id = ?2
           AND status IN ('open', 'in_progress', 'awaiting_review')
         LIMIT 1",
    )
    .bind(source_type)
    .bind(source_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage)?;
    let (item_id, event_type) = if let Some(id) = existing {
        sqlx::query(
            "UPDATE error_queue_items
             SET title = ?2, detail = ?3, severity = 'critical', updated_at = datetime('now')
             WHERE id = ?1",
        )
        .bind(id)
        .bind(title)
        .bind(detail)
        .execute(&mut *connection)
        .await
        .map_err(storage)?;
        (id, "error_item_updated")
    } else {
        let id = sqlx::query(
            "INSERT INTO error_queue_items (
                campaign_id, source_type, source_id, title, detail, severity, status, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, 'critical', 'open', datetime('now'))",
        )
        .bind(row.campaign_id)
        .bind(source_type)
        .bind(source_id)
        .bind(title)
        .bind(detail)
        .execute(&mut *connection)
        .await
        .map_err(storage)?
        .last_insert_rowid();
        (id, "error_item_created")
    };
    sqlx::query(
        "INSERT INTO safety_audit_events (
            campaign_id, subject_type, subject_id, event_type, severity, summary, metadata_json
         ) VALUES (?1, 'error_queue_item', ?2, ?3, 'warning', ?4, ?5)",
    )
    .bind(row.campaign_id)
    .bind(item_id)
    .bind(event_type)
    .bind(format!("Error item: {title}"))
    .bind(json!({ "sourceType": source_type, "sourceId": source_id }).to_string())
    .execute(&mut *connection)
    .await
    .map_err(storage)?;
    Ok(())
}

fn remote_post_reference(platform_id: &str, urn: &str) -> String {
    if urn.is_empty() {
        platform_id.to_string()
    } else {
        urn.to_string()
    }
}

async fn settle_created(
    connection: &mut SqliteConnection,
    lease: &ExecutionLease,
    row: &ExecutionRow,
    platform_id: &str,
    urn: &str,
    url: &str,
    options: SettleOptions,
) -> Result<SettleResult, String> {
    let attempt_id = match row.kind {
        ExecutionKind::Post => {
            let input = validate_record_publish_attempt(RecordPublishAttemptInput {
                approval_id: row.subject_id,
                schedule_job_id: row.schedule_job_id,
                status: "succeeded".to_string(),
                external_post_url: url.to_string(),
                platform_post_id: remote_post_reference(platform_id, urn),
                error_message: String::new(),
            })?;
            execute_record_publish_attempt(connection, &input, PublishRecordMode::RemoteConfirmed)
                .await?
        }
        ExecutionKind::Comment => {
            let input = RecordCommentAttemptInput {
                comment_thread_id: row.subject_id,
                status: "succeeded".to_string(),
                external_comment_url: url.to_string(),
                platform_comment_id: remote_post_reference(platform_id, urn),
                idempotency_key: row.idempotency_key.clone(),
                error_message: String::new(),
            };
            match execute_record_comment_attempt(
                connection,
                &input,
                CommentRecordMode::RemoteConfirmed,
            )
            .await?
            {
                CommentSettlement::Accepted(id) => id,
                CommentSettlement::Rejected(message) => return Err(message),
            }
        }
    };
    if let Some(job_id) = row.schedule_job_id {
        release_job_lock(connection, job_id, "").await?;
        if row.caller == "scheduler" {
            insert_scheduler_event(
                connection,
                row.campaign_id,
                row.subject_id,
                job_id,
                "job_published",
                "info",
                "Scheduled LinkedIn post was published.",
                json!({ "platformPostId": platform_id, "executionId": lease.execution_id }),
            )
            .await?;
        }
    }
    let status = if options.reconciled {
        "reconciled_posted"
    } else {
        "succeeded"
    };
    finish_execution(
        connection,
        lease,
        status,
        Some(attempt_id),
        "LinkedIn created the item; local records settled.",
    )
    .await?;
    Ok(SettleResult::Succeeded {
        platform_id: platform_id.to_string(),
        url: url.to_string(),
    })
}

async fn schedule_job_attempts(
    connection: &mut SqliteConnection,
    job_id: i64,
) -> Result<(i64, i64), String> {
    let row = sqlx::query("SELECT attempt_count, max_attempts FROM schedule_jobs WHERE id = ?1")
        .bind(job_id)
        .fetch_one(&mut *connection)
        .await
        .map_err(storage)?;
    Ok((
        row.try_get("attempt_count").map_err(storage)?,
        row.try_get("max_attempts").map_err(storage)?,
    ))
}

async fn settle_rejected(
    connection: &mut SqliteConnection,
    lease: &ExecutionLease,
    row: &ExecutionRow,
    message: &str,
    options: SettleOptions,
    now_epoch: i64,
) -> Result<SettleResult, String> {
    let message = if message.trim().is_empty() {
        "LinkedIn rejected the request".to_string()
    } else {
        message.chars().take(1000).collect()
    };
    let scheduler_job = row
        .schedule_job_id
        .filter(|_| row.kind == ExecutionKind::Post);
    let mut retry_scheduled = false;
    let attempt_id = match (row.kind, scheduler_job) {
        (ExecutionKind::Post, Some(job_id)) => {
            let (attempt_count, max_attempts) = schedule_job_attempts(connection, job_id).await?;
            if options.allow_retry && row.caller == "scheduler" && attempt_count < max_attempts {
                retry_scheduled = true;
                // Retry keeps the approval scheduled; only the job backs off.
                let attempt_id = sqlx::query(
                    "INSERT INTO publish_attempts (
                        approval_id, schedule_job_id, platform, status, external_post_url,
                        platform_post_id, error_message
                     ) VALUES (?1, ?2, 'linkedin', 'failed', '', '', ?3)",
                )
                .bind(row.subject_id)
                .bind(job_id)
                .bind(&message)
                .execute(&mut *connection)
                .await
                .map_err(storage)?
                .last_insert_rowid();
                let next_attempt_epoch = crate::scheduler::compute_next_attempt_unix_seconds(
                    now_epoch,
                    attempt_count,
                    options.retry_backoff_minutes,
                );
                sqlx::query(
                    "UPDATE schedule_jobs
                     SET next_attempt_at = datetime(?2, 'unixepoch'), locked_at = NULL,
                         locked_by = NULL, last_error = ?3, updated_at = datetime('now')
                     WHERE id = ?1",
                )
                .bind(job_id)
                .bind(next_attempt_epoch)
                .bind(&message)
                .execute(&mut *connection)
                .await
                .map_err(storage)?;
                sqlx::query(
                    "INSERT INTO safety_audit_events (
                        campaign_id, subject_type, subject_id, event_type, severity, summary, metadata_json
                     ) VALUES (?1, 'schedule_job', ?2, 'publish_failed', 'warning',
                        'Scheduled LinkedIn publish failed and will retry.', ?3)",
                )
                .bind(row.campaign_id)
                .bind(job_id)
                .bind(json!({ "attemptCount": attempt_count }).to_string())
                .execute(&mut *connection)
                .await
                .map_err(storage)?;
                insert_scheduler_event(
                    connection,
                    row.campaign_id,
                    row.subject_id,
                    job_id,
                    "job_retry_scheduled",
                    "warning",
                    "Scheduled LinkedIn publish failed and will retry.",
                    json!({ "attemptCount": attempt_count, "executionId": lease.execution_id }),
                )
                .await?;
                attempt_id
            } else {
                let input = validate_record_publish_attempt(RecordPublishAttemptInput {
                    approval_id: row.subject_id,
                    schedule_job_id: Some(job_id),
                    status: "failed".to_string(),
                    external_post_url: String::new(),
                    platform_post_id: String::new(),
                    error_message: message.clone(),
                })?;
                let attempt_id = execute_record_publish_attempt(
                    connection,
                    &input,
                    PublishRecordMode::RemoteConfirmed,
                )
                .await?;
                release_job_lock(connection, job_id, &message).await?;
                if row.caller == "scheduler" {
                    insert_scheduler_event(
                        connection,
                        row.campaign_id,
                        row.subject_id,
                        job_id,
                        "job_failed",
                        "error",
                        "Scheduled LinkedIn publish failed permanently.",
                        json!({ "attemptCount": attempt_count, "executionId": lease.execution_id }),
                    )
                    .await?;
                }
                attempt_id
            }
        }
        (ExecutionKind::Post, None) => {
            let input = validate_record_publish_attempt(RecordPublishAttemptInput {
                approval_id: row.subject_id,
                schedule_job_id: None,
                status: "failed".to_string(),
                external_post_url: String::new(),
                platform_post_id: String::new(),
                error_message: message.clone(),
            })?;
            execute_record_publish_attempt(connection, &input, PublishRecordMode::RemoteConfirmed)
                .await?
        }
        (ExecutionKind::Comment, _) => {
            let input = RecordCommentAttemptInput {
                comment_thread_id: row.subject_id,
                status: "failed".to_string(),
                external_comment_url: String::new(),
                platform_comment_id: String::new(),
                idempotency_key: String::new(),
                error_message: message.clone(),
            };
            match execute_record_comment_attempt(
                connection,
                &input,
                CommentRecordMode::RemoteConfirmed,
            )
            .await?
            {
                CommentSettlement::Accepted(id) => id,
                CommentSettlement::Rejected(error) => return Err(error),
            }
        }
    };
    let status = if options.reconciled {
        "reconciled_not_posted"
    } else {
        "failed"
    };
    finish_execution(
        connection,
        lease,
        status,
        Some(attempt_id),
        "LinkedIn did not create the item; local records settled as a failure.",
    )
    .await?;
    Ok(SettleResult::Failed {
        message,
        retry_scheduled,
    })
}

async fn settle_ambiguous(
    connection: &mut SqliteConnection,
    lease: &ExecutionLease,
    row: &ExecutionRow,
    message: &str,
) -> Result<SettleResult, String> {
    let detail = format!(
        "LinkedIn may have created this item ({message}). It will not be retried automatically. Check LinkedIn, then reconcile it in Safety."
    );
    if let Some(job_id) = row.schedule_job_id {
        // The job keeps status `scheduled` but is skipped while the execution
        // is open, so it is never retried blindly.
        release_job_lock(connection, job_id, &detail).await?;
        if row.caller == "scheduler" {
            insert_scheduler_event(
                connection,
                row.campaign_id,
                row.subject_id,
                job_id,
                "job_blocked",
                "error",
                "Scheduled LinkedIn publish outcome is unknown; waiting for operator reconciliation.",
                json!({ "executionId": lease.execution_id }),
            )
            .await?;
        }
    }
    upsert_unknown_outcome_error(connection, row, &detail).await?;
    finish_execution(connection, lease, "outcome_unknown", None, &detail).await?;
    Ok(SettleResult::OutcomeUnknown { message: detail })
}

/// Settles every linked local record for one execution in one transaction.
/// Fenced: if the lease was superseded nothing is written.
pub(crate) async fn settle(
    pool: &SqlitePool,
    lease: &ExecutionLease,
    outcome: &TransportOutcome,
    options: SettleOptions,
    now_epoch: i64,
) -> Result<SettleResult, String> {
    let lease = lease.clone();
    let outcome = outcome.clone();
    settle_transaction(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            settle_on_connection(connection, &lease, &outcome, options, now_epoch)
                .await
                .map(Settlement::Accepted)
        })
    })
    .await
}

pub(crate) async fn settle_on_connection(
    connection: &mut SqliteConnection,
    lease: &ExecutionLease,
    outcome: &TransportOutcome,
    options: SettleOptions,
    now_epoch: i64,
) -> Result<SettleResult, String> {
    let Some(row) = load_owned_row(connection, lease).await? else {
        return Ok(SettleResult::StaleOwner);
    };
    match outcome {
        TransportOutcome::Created {
            platform_id,
            urn,
            url,
        } => settle_created(connection, lease, &row, platform_id, urn, url, options).await,
        TransportOutcome::Rejected { message, .. } => {
            settle_rejected(connection, lease, &row, message, options, now_epoch).await
        }
        TransportOutcome::Ambiguous { message, .. } => {
            settle_ambiguous(connection, lease, &row, message).await
        }
    }
}

/// Takes over an execution by rotating the owner token and bumping the fence.
/// Returns the new lease, or `None` when `expected_fence` is no longer current.
pub(crate) async fn take_over(
    connection: &mut SqliteConnection,
    execution_id: i64,
    expected_fence: i64,
    allowed_statuses_sql: &str,
) -> Result<Option<ExecutionLease>, String> {
    let owner_token = new_owner_token();
    let changed = sqlx::query(&format!(
        "UPDATE publish_executions
         SET owner_token = ?3, fence = fence + 1, updated_at = datetime('now')
         WHERE id = ?1 AND fence = ?2 AND status IN {allowed_statuses_sql}"
    ))
    .bind(execution_id)
    .bind(expected_fence)
    .bind(&owner_token)
    .execute(&mut *connection)
    .await
    .map_err(storage)?
    .rows_affected();
    Ok((changed == 1).then_some(ExecutionLease {
        execution_id,
        owner_token,
        fence: expected_fence + 1,
    }))
}
