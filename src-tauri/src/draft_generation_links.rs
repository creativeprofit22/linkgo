//! Native port of the renderer's linked draft-generation workflow helpers
//! (`src/workflows/draft-generation.ts`). Connection-level only: callers own
//! the pinned transaction.

use sqlx::{Row, SqliteConnection};

use crate::js_text::bound_workflow_summary;

const RESUMABLE_RUN_STATUSES: [&str; 3] = ["running", "blocked", "failed"];
const CLAIMABLE_STEP_STATUSES: [&str; 4] = ["pending", "running", "blocked", "failed"];

pub(crate) struct LinkedDraftScope {
    pub workflow_run_id: Option<i64>,
    pub workflow_step_id: Option<i64>,
    pub campaign_id: i64,
}

/// Blocks a linked draft step and its run, unless the scope is gone, moved
/// past drafting, or already terminal. Port of
/// `blockLinkedDraftGenerationInTransaction`.
pub(crate) async fn block_linked_draft_generation(
    connection: &mut SqliteConnection,
    scope: &LinkedDraftScope,
    reason: &str,
) -> Result<(), sqlx::Error> {
    let (Some(run_id), Some(step_id)) = (scope.workflow_run_id, scope.workflow_step_id) else {
        return Ok(());
    };
    let summary = bound_workflow_summary(if reason.is_empty() {
        "Draft generation stopped"
    } else {
        reason
    });
    let row = sqlx::query(
        "SELECT ws.status AS step_status, wr.status AS run_status, wr.current_step_key
         FROM workflow_steps ws INNER JOIN workflow_runs wr ON wr.id = ws.workflow_run_id
         WHERE ws.id = ?1 AND ws.workflow_run_id = ?2 AND ws.step_key = 'draft'
           AND wr.campaign_id = ?3
         LIMIT 1",
    )
    .bind(step_id)
    .bind(run_id)
    .bind(scope.campaign_id)
    .fetch_optional(&mut *connection)
    .await?;
    let Some(row) = row else { return Ok(()) };
    let run_status: String = row.get("run_status");
    let step_status: String = row.get("step_status");
    let current_step_key: String = row.get("current_step_key");
    if current_step_key != "draft"
        || ["completed", "cancelled"].contains(&run_status.as_str())
        || ["completed", "skipped"].contains(&step_status.as_str())
    {
        return Ok(());
    }
    sqlx::query(
        "UPDATE workflow_steps
         SET status = 'blocked', output_summary = '', error_message = ?1,
             completed_at = NULL, updated_at = datetime('now')
         WHERE id = ?2",
    )
    .bind(&summary)
    .bind(step_id)
    .execute(&mut *connection)
    .await?;
    sqlx::query(
        "UPDATE workflow_runs
         SET status = 'blocked', current_step_key = 'draft', completed_at = NULL,
             updated_at = datetime('now')
         WHERE id = ?1",
    )
    .bind(run_id)
    .execute(&mut *connection)
    .await?;
    sqlx::query(
        "INSERT INTO workflow_events (workflow_run_id, workflow_step_id, event_type, summary)
         VALUES (?1, ?2, 'step_blocked', ?3)",
    )
    .bind(run_id)
    .bind(step_id)
    .bind(&summary)
    .execute(&mut *connection)
    .await?;
    Ok(())
}

/// Dismisses a deleted candidate's open linked draft requests, cancelling
/// their pending agent runs and blocking their workflow draft steps. Rejects
/// (as a domain error) when a request is not attached to an active draft
/// step. Port of `settleLinkedDraftRequestsForCandidateDeletionInTransaction`.
pub(crate) async fn settle_linked_draft_requests_for_candidate_deletion(
    connection: &mut SqliteConnection,
    candidate_id: i64,
    storage_error: &str,
) -> Result<(), String> {
    let storage = |_: sqlx::Error| storage_error.to_string();
    let requests = sqlx::query(
        "SELECT dgr.id AS request_id, dgr.status AS request_status, dgr.agent_run_id,
                dgr.campaign_id, dgr.workflow_run_id, dgr.workflow_step_id,
                wr.status AS run_status, wr.current_step_key, ws.status AS step_status
         FROM draft_generation_requests dgr
         LEFT JOIN workflow_runs wr ON wr.id = dgr.workflow_run_id
         LEFT JOIN workflow_steps ws ON ws.id = dgr.workflow_step_id
           AND ws.workflow_run_id = dgr.workflow_run_id AND ws.step_key = 'draft'
         WHERE dgr.candidate_post_id = ?1
           AND dgr.status IN ('pending', 'generated')
           AND (dgr.workflow_run_id IS NOT NULL OR dgr.workflow_step_id IS NOT NULL)
         ORDER BY dgr.id ASC",
    )
    .bind(candidate_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(storage)?;

    for request in requests {
        let request_id: i64 = request.get("request_id");
        let run_status: Option<String> = request.get("run_status");
        let step_status: Option<String> = request.get("step_status");
        let current_step_key: Option<String> = request.get("current_step_key");
        let workflow_run_id: Option<i64> = request.get("workflow_run_id");
        let workflow_step_id: Option<i64> = request.get("workflow_step_id");
        let active = workflow_run_id.is_some()
            && workflow_step_id.is_some()
            && current_step_key.as_deref() == Some("draft")
            && run_status
                .as_deref()
                .is_some_and(|s| RESUMABLE_RUN_STATUSES.contains(&s))
            && step_status
                .as_deref()
                .is_some_and(|s| CLAIMABLE_STEP_STATUSES.contains(&s));
        if !active {
            return Err(format!(
                "Candidate cannot be deleted because linked draft request #{request_id} is not attached to an active draft workflow step. Resolve the request from Drafts first."
            ));
        }
        let reason = bound_workflow_summary(&format!(
            "Candidate #{candidate_id} was deleted. Linked draft request #{request_id} was removed, and the candidate remains recorded as a removed workflow artifact."
        ));
        let request_status: String = request.get("request_status");
        let agent_run_id: Option<i64> = request.get("agent_run_id");
        if let (true, Some(agent_run_id)) = (request_status == "pending", agent_run_id) {
            let cancelled = sqlx::query(
                "UPDATE agent_runs
                 SET status = 'cancelled', error_message = ?1,
                     completed_at = COALESCE(completed_at, datetime('now')),
                     updated_at = datetime('now')
                 WHERE id = ?2 AND status IN ('queued', 'running')",
            )
            .bind(&reason)
            .bind(agent_run_id)
            .execute(&mut *connection)
            .await
            .map_err(storage)?;
            if cancelled.rows_affected() == 1 {
                sqlx::query("DELETE FROM agent_run_approval_checkpoints WHERE agent_run_id = ?1")
                    .bind(agent_run_id)
                    .execute(&mut *connection)
                    .await
                    .map_err(storage)?;
                sqlx::query(
                    "INSERT INTO agent_run_events (agent_run_id, event_type, summary)
                     VALUES (?1, 'run_cancelled', ?2)",
                )
                .bind(agent_run_id)
                .bind(&reason)
                .execute(&mut *connection)
                .await
                .map_err(storage)?;
            }
        }
        let dismissed = sqlx::query(
            "UPDATE draft_generation_requests
             SET status = 'dismissed', error_message = ?1, updated_at = datetime('now')
             WHERE id = ?2 AND status IN ('pending', 'generated')",
        )
        .bind(&reason)
        .bind(request_id)
        .execute(&mut *connection)
        .await
        .map_err(storage)?;
        if dismissed.rows_affected() != 1 {
            return Err(format!(
                "Linked draft request #{request_id} changed before candidate deletion"
            ));
        }
        block_linked_draft_generation(
            connection,
            &LinkedDraftScope {
                workflow_run_id,
                workflow_step_id,
                campaign_id: request.get("campaign_id"),
            },
            &reason,
        )
        .await
        .map_err(storage)?;
    }
    Ok(())
}
