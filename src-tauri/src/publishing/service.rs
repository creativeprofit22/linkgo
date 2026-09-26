//! Single execution path for LinkedIn posts and comments, shared by manual
//! commands and the scheduler:
//!
//! reserve (BEGIN IMMEDIATE) → mark in_flight (commit) → LinkedIn call (no
//! transaction held) → record remote evidence (one statement) → settle every
//! local record (one transaction, fenced) → typed outcome.

use sqlx::SqlitePool;
use std::sync::Arc;
use std::time::Duration;

use super::store::{
    self, Reservation, ReserveRefusal, ReserveRequest, SettleOptions, SettleResult,
    OPEN_EXECUTION_ERROR,
};
use super::transport::LinkedInTransport;
use super::types::{ExecutionCaller, ExecutionOutcome, TransportOutcome};

/// Settlement is retried in-process this many times on storage errors. The
/// remote evidence is already durable, so recovery can finish it otherwise.
const SETTLE_ATTEMPTS: usize = 3;
const SETTLE_RETRY_DELAY: Duration = Duration::from_millis(200);

pub(crate) struct ExecuteContext<'a> {
    pub pool: &'a SqlitePool,
    pub transport: Arc<dyn LinkedInTransport>,
    pub caller: ExecutionCaller,
    pub retry_backoff_minutes: i64,
    /// Injected clock (unix seconds) for scheduler retry timing.
    pub now_epoch: i64,
}

async fn call_transport(
    transport: Arc<dyn LinkedInTransport>,
    reservation: &Reservation,
) -> TransportOutcome {
    let commentary = reservation.commentary.clone();
    let target_urn = reservation.target_urn.clone();
    // The live transport uses blocking HTTP; run it off the async executor.
    let joined = tauri::async_runtime::spawn_blocking(move || match target_urn {
        Some(target_urn) => transport.create_comment(&target_urn, &commentary),
        None => transport.create_post(&commentary),
    })
    .await;
    joined.unwrap_or_else(|_| TransportOutcome::Ambiguous {
        status_code: None,
        message: "LinkedIn request was interrupted before its result was known".to_string(),
    })
}

async fn settle_with_retry(
    context: &ExecuteContext<'_>,
    reservation: &Reservation,
    outcome: &TransportOutcome,
) -> Result<SettleResult, String> {
    let options = SettleOptions::standard(context.retry_backoff_minutes);
    let mut last_error = String::new();
    for attempt in 0..SETTLE_ATTEMPTS {
        match store::settle(
            context.pool,
            &reservation.lease,
            outcome,
            options,
            context.now_epoch,
        )
        .await
        {
            Ok(result) => return Ok(result),
            Err(error) => {
                last_error = error;
                if attempt + 1 < SETTLE_ATTEMPTS {
                    tokio::time::sleep(SETTLE_RETRY_DELAY).await;
                }
            }
        }
    }
    Err(last_error)
}

/// Runs one approval-gated LinkedIn create end to end.
pub(crate) async fn execute(
    context: ExecuteContext<'_>,
    request: ReserveRequest,
) -> Result<ExecutionOutcome, String> {
    let reservation = match store::reserve(context.pool, request, context.caller).await? {
        Ok(reservation) => reservation,
        Err(ReserveRefusal::OpenExecution) => {
            return Ok(ExecutionOutcome::Blocked {
                message: OPEN_EXECUTION_ERROR.to_string(),
            })
        }
        Err(ReserveRefusal::Policy(message)) => return Ok(ExecutionOutcome::Blocked { message }),
    };
    let execution_id = reservation.lease.execution_id;

    if !store::mark_in_flight(context.pool, &reservation.lease).await? {
        return Ok(ExecutionOutcome::StaleOwner {
            execution_id,
            message: "Publishing execution was taken over before contacting LinkedIn".to_string(),
        });
    }

    // Boundary observability is durable: `sent_at`, `remote_recorded_at`,
    // `remote_outcome` and `remote_status_code` on the execution row record
    // the request, its classified result and elapsed time.
    let outcome = call_transport(context.transport.clone(), &reservation).await;

    // Evidence first. A storage failure here is not fatal: settlement below
    // carries the same outcome, and recovery treats missing evidence as
    // unknown rather than retrying.
    let owns = store::record_remote_result(context.pool, &reservation.lease, &outcome)
        .await
        .unwrap_or(true);
    if !owns {
        store::record_stale_owner_evidence(context.pool, &reservation.lease, &outcome).await?;
        return Ok(stale_owner(execution_id));
    }

    match settle_with_retry(&context, &reservation, &outcome).await {
        Ok(SettleResult::Succeeded { platform_id, url }) => Ok(ExecutionOutcome::Succeeded {
            execution_id,
            platform_id,
            external_url: url,
        }),
        Ok(SettleResult::Failed { message, .. }) => Ok(ExecutionOutcome::Failed {
            execution_id,
            message,
        }),
        Ok(SettleResult::OutcomeUnknown { message }) => Ok(ExecutionOutcome::OutcomeUnknown {
            execution_id,
            message,
        }),
        Ok(SettleResult::StaleOwner) => {
            store::record_stale_owner_evidence(context.pool, &reservation.lease, &outcome).await?;
            Ok(stale_owner(execution_id))
        }
        Err(error) => Ok(ExecutionOutcome::OutcomeUnknown {
            execution_id,
            message: format!(
                "LinkedIn answered ({}) but local records could not be saved: {error}. The result is kept and recovery will finish it; do not publish again.",
                outcome.remote_outcome()
            ),
        }),
    }
}

fn stale_owner(execution_id: i64) -> ExecutionOutcome {
    ExecutionOutcome::StaleOwner {
        execution_id,
        message:
            "Recovery took over this execution; the LinkedIn result was kept for reconciliation"
                .to_string(),
    }
}
