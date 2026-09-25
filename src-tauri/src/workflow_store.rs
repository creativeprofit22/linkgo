//! Native workflow and agent-run reads plus step-execution writes used by the
//! renderer workflow executor, planner executors and Agent Runtime:
//!
//! - `linkgo_workflow_run_list`: runs with steps, events and artifacts from
//!   one transaction snapshot (runs capped at 200, events per run at 100).
//! - `linkgo_workflow_run_validation`: the single run row the executor checks.
//! - `linkgo_workflow_step_execution_create`: one transaction, with step
//!   existence and agent-run ownership checks.
//! - `linkgo_workflow_step_execution_update`: one transaction, with agent-run
//!   ownership checks and error text bounded to 2000 characters.
//! - `linkgo_workflow_planner_scoring_scope`: planner score-step scope from one
//!   transaction (artifacts capped at 500, campaign keywords at 12).
//! - `linkgo_workflow_planner_draft_audit_scope`: saved-draft provenance for
//!   the audit step; reads at most 2 rows so the renderer can reject an
//!   ambiguous scope.
//! - `linkgo_agent_run_list`: agent runs with tool calls, events and approval
//!   checkpoints from one transaction (runs capped at 200, events per run at
//!   100).
//! - `linkgo_agent_run_validation`: the single agent-run row checked before
//!   any provider call.
//!
//! Validation reads are single-row. Provider calls never run here; callers
//! invoke these before and after their agent runs.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{SqliteConnection, SqlitePool};
use tauri::State;

use crate::db_transaction::{settle, Settlement};
use crate::js_text::utf16_prefix;
use crate::row_json::{row_to_json, rows_to_json};

const READ_ERROR: &str = "Could not load workflows";
const STORAGE_ERROR: &str = "Could not save workflow step execution";
pub(crate) const RUN_LIST_LIMIT: i64 = 200;
pub(crate) const EVENTS_PER_RUN_LIMIT: i64 = 100;
const MAX_ERROR_SUMMARY: usize = 2000;
const EXECUTOR_ROLES: [&str; 6] = [
    "researcher",
    "scorer",
    "drafter",
    "auditor",
    "scheduler",
    "analyst",
];
const EXECUTION_STATUSES: [&str; 7] = [
    "claimed",
    "running",
    "completed",
    "waiting_approval",
    "failed",
    "blocked",
    "cancelled",
];

fn read_error(_: sqlx::Error) -> String {
    READ_ERROR.to_string()
}

fn storage_error(_: sqlx::Error) -> String {
    STORAGE_ERROR.to_string()
}

fn positive(id: i64, label: &str) -> Result<(), String> {
    if id <= 0 {
        return Err(format!("{label} must be a positive integer"));
    }
    Ok(())
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkflowRunListInput {
    #[serde(default)]
    pub campaign_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkflowRunIdInput {
    pub id: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateStepExecutionInput {
    pub workflow_step_id: i64,
    #[serde(default)]
    pub agent_run_id: Option<i64>,
    pub executor_role: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateStepExecutionInput {
    pub id: i64,
    #[serde(default)]
    pub agent_run_id: Option<i64>,
    pub status: String,
    #[serde(default)]
    pub error_summary: String,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct WorkflowRunListSnapshot {
    pub runs: Vec<Value>,
    pub steps: Vec<Value>,
    pub events: Vec<Value>,
    pub artifacts: Vec<Value>,
}

const RUN_COLUMNS: &str = "wr.id, wr.campaign_id, wr.workflow_type, wr.title, wr.status,
    wr.current_step_key, wr.context_summary, wr.started_at, wr.completed_at,
    wr.created_at, wr.updated_at";

async fn by_ids(
    connection: &mut SqliteConnection,
    sql: &str,
    ids: &[i64],
) -> Result<Vec<Value>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = (1..=ids.len())
        .map(|index| format!("?{index}"))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = sql
        .replace("{ids}", &placeholders)
        .replace("{limit}", &format!("?{}", ids.len() + 1));
    let mut query = sqlx::query(&sql);
    for id in ids {
        query = query.bind(id);
    }
    let rows = query
        .bind(EVENTS_PER_RUN_LIMIT)
        .fetch_all(&mut *connection)
        .await
        .map_err(read_error)?;
    Ok(rows_to_json(&rows))
}

pub(crate) async fn list_runs(
    pool: &SqlitePool,
    input: WorkflowRunListInput,
) -> Result<WorkflowRunListSnapshot, String> {
    if let Some(id) = input.campaign_id {
        positive(id, "Campaign id")?;
    }
    let mut tx = pool.begin().await.map_err(read_error)?;
    let sql = format!(
        "SELECT {RUN_COLUMNS}, c.name AS campaign_name, c.status AS campaign_status,
                ap.id AS autopilot_plan_id, ap.source_import_batch_id
         FROM workflow_runs wr
         INNER JOIN campaigns c ON c.id = wr.campaign_id
         LEFT JOIN autopilot_plans ap ON ap.workflow_run_id = wr.id
         WHERE (?1 IS NULL OR wr.campaign_id = ?1)
         ORDER BY CASE wr.status
           WHEN 'running' THEN 1 WHEN 'waiting_approval' THEN 2 WHEN 'blocked' THEN 3
           WHEN 'queued' THEN 4 WHEN 'failed' THEN 5 WHEN 'completed' THEN 6
           WHEN 'cancelled' THEN 7 ELSE 8 END,
           datetime(wr.updated_at) DESC, wr.id DESC
         LIMIT ?2"
    );
    let rows = sqlx::query(&sql)
        .bind(input.campaign_id)
        .bind(RUN_LIST_LIMIT)
        .fetch_all(&mut *tx)
        .await
        .map_err(read_error)?;
    let runs = rows_to_json(&rows);
    let run_ids: Vec<i64> = runs.iter().filter_map(|run| run["id"].as_i64()).collect();
    let steps = by_ids(
        &mut tx,
        "SELECT id, workflow_run_id, step_key, title, description, sort_order, status,
                output_summary, error_message, started_at, completed_at, created_at, updated_at
         FROM workflow_steps WHERE workflow_run_id IN ({ids}) AND {limit} > 0
         ORDER BY workflow_run_id ASC, sort_order ASC",
        &run_ids,
    )
    .await?;
    // Newest events per run, capped per run with a window function.
    let events = by_ids(
        &mut tx,
        "SELECT id, workflow_run_id, workflow_step_id, event_type, summary, created_at
         FROM (
           SELECT we.*, ROW_NUMBER() OVER (
             PARTITION BY we.workflow_run_id
             ORDER BY datetime(we.created_at) DESC, we.id DESC
           ) AS event_rank
           FROM workflow_events we WHERE we.workflow_run_id IN ({ids})
         )
         WHERE event_rank <= {limit}
         ORDER BY workflow_run_id ASC, datetime(created_at) DESC, id DESC",
        &run_ids,
    )
    .await?;
    let artifacts = by_ids(
        &mut tx,
        "SELECT wa.id, wa.workflow_run_id, wa.workflow_step_id, wa.artifact_type,
                wa.artifact_id, wa.summary, wa.created_at, wa.updated_at,
                ar.agent_role, ar.status AS agent_status,
                cp.id AS candidate_id, cp.status AS candidate_status,
                cp.relevance_score AS candidate_relevance_score,
                d.id AS draft_id, d.status AS draft_status,
                d.content_intent AS draft_content_intent
         FROM workflow_artifacts wa
         LEFT JOIN agent_runs ar ON wa.artifact_type = 'agent_run' AND ar.id = wa.artifact_id
         LEFT JOIN candidate_posts cp ON wa.artifact_type = 'candidate_post' AND cp.id = wa.artifact_id
         LEFT JOIN drafts d ON wa.artifact_type = 'draft' AND d.id = wa.artifact_id
         WHERE wa.workflow_run_id IN ({ids}) AND {limit} > 0
         ORDER BY wa.workflow_run_id ASC, wa.id ASC",
        &run_ids,
    )
    .await?;
    tx.commit().await.map_err(read_error)?;
    Ok(WorkflowRunListSnapshot {
        runs,
        steps,
        events,
        artifacts,
    })
}

pub(crate) async fn run_validation(
    pool: &SqlitePool,
    input: WorkflowRunIdInput,
) -> Result<Value, String> {
    positive(input.id, "Workflow run id")?;
    let sql = format!(
        "SELECT {RUN_COLUMNS}, c.status AS campaign_status, ap.id AS autopilot_plan_id
         FROM workflow_runs wr
         INNER JOIN campaigns c ON c.id = wr.campaign_id
         LEFT JOIN autopilot_plans ap ON ap.workflow_run_id = wr.id
         WHERE wr.id = ?1 LIMIT 1"
    );
    let row = sqlx::query(&sql)
        .bind(input.id)
        .fetch_optional(pool)
        .await
        .map_err(read_error)?
        .ok_or_else(|| "Workflow run was not found".to_string())?;
    Ok(row_to_json(&row))
}

/// Confirms `agent_run_id` belongs to the same workflow run as the step.
async fn assert_agent_run_owned(
    connection: &mut SqliteConnection,
    step_id: i64,
    agent_run_id: i64,
) -> Result<(), String> {
    let owned: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM agent_runs ar
         INNER JOIN workflow_steps ws ON ws.id = ?1
         WHERE ar.id = ?2 AND ar.workflow_run_id = ws.workflow_run_id",
    )
    .bind(step_id)
    .bind(agent_run_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage_error)?;
    if owned.is_none() {
        return Err("Agent run does not belong to this workflow".to_string());
    }
    Ok(())
}

pub(crate) async fn create_step_execution(
    pool: &SqlitePool,
    input: CreateStepExecutionInput,
) -> Result<i64, String> {
    positive(input.workflow_step_id, "Workflow step id")?;
    if let Some(id) = input.agent_run_id {
        positive(id, "Agent run id")?;
    }
    if !EXECUTOR_ROLES.contains(&input.executor_role.as_str()) {
        return Err("Invalid executor role".to_string());
    }
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let step: Option<i64> =
                sqlx::query_scalar("SELECT id FROM workflow_steps WHERE id = ?1")
                    .bind(input.workflow_step_id)
                    .fetch_optional(&mut *connection)
                    .await
                    .map_err(storage_error)?;
            if step.is_none() {
                return Err("Workflow step was not found".to_string());
            }
            if let Some(agent_run_id) = input.agent_run_id {
                assert_agent_run_owned(connection, input.workflow_step_id, agent_run_id).await?;
            }
            let id = sqlx::query(
                "INSERT INTO workflow_step_executions (
                   workflow_step_id, agent_run_id, executor_role, attempt_count, status, updated_at
                 ) VALUES (
                   ?1, ?2, ?3,
                   COALESCE((SELECT MAX(attempt_count) + 1 FROM workflow_step_executions
                             WHERE workflow_step_id = ?1), 1),
                   'claimed', datetime('now')
                 )",
            )
            .bind(input.workflow_step_id)
            .bind(input.agent_run_id)
            .bind(&input.executor_role)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?
            .last_insert_rowid();
            Ok(Settlement::Accepted(id))
        })
    })
    .await
}

pub(crate) async fn update_step_execution(
    pool: &SqlitePool,
    input: UpdateStepExecutionInput,
) -> Result<(), String> {
    positive(input.id, "Workflow step execution id")?;
    if let Some(id) = input.agent_run_id {
        positive(id, "Agent run id")?;
    }
    if !EXECUTION_STATUSES.contains(&input.status.as_str()) {
        return Err("Invalid workflow step execution status".to_string());
    }
    // Error text comes from arbitrary failures, so it is bounded rather
    // than rejected (rejecting would lose the failure record).
    let error_summary = utf16_prefix(&input.error_summary, MAX_ERROR_SUMMARY).to_string();
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let step_id: Option<i64> =
                sqlx::query_scalar("SELECT workflow_step_id FROM workflow_step_executions WHERE id = ?1")
                    .bind(input.id)
                    .fetch_optional(&mut *connection)
                    .await
                    .map_err(storage_error)?;
            // A missing execution is a silent no-op, as before.
            let Some(step_id) = step_id else {
                return Ok(Settlement::Accepted(()));
            };
            if let Some(agent_run_id) = input.agent_run_id {
                assert_agent_run_owned(connection, step_id, agent_run_id).await?;
            }
            sqlx::query(
                "UPDATE workflow_step_executions
                 SET agent_run_id = COALESCE(?1, agent_run_id),
                     status = ?2,
                     error_summary = ?3,
                     completed_at = CASE WHEN ?2 IN ('completed', 'waiting_approval', 'failed', 'blocked', 'cancelled')
                                    THEN datetime('now') ELSE completed_at END,
                     updated_at = datetime('now')
                 WHERE id = ?4",
            )
            .bind(input.agent_run_id)
            .bind(&input.status)
            .bind(&error_summary)
            .bind(input.id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            Ok(Settlement::Accepted(()))
        })
    })
    .await
}

/// Rows the renderer planner executors validate before claiming work. The
/// validation rules and messages stay in the renderer; native only owns the
/// fixed, bounded reads.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlannerScoringScopeRows {
    pub header: Option<Value>,
    pub artifacts: Vec<Value>,
    pub keywords: Vec<String>,
}

const PLANNER_ARTIFACT_LIMIT: i64 = 500;

pub(crate) async fn planner_scoring_scope(
    pool: &SqlitePool,
    input: WorkflowRunIdInput,
) -> Result<PlannerScoringScopeRows, String> {
    positive(input.id, "Workflow run id")?;
    let mut tx = pool.begin().await.map_err(read_error)?;
    let header = sqlx::query(
        "SELECT wr.id AS workflow_run_id, wr.status AS workflow_status, wr.current_step_key,
                ws.id AS workflow_step_id, ws.status AS score_step_status,
                c.id AS campaign_id, c.name AS campaign_name, c.product AS campaign_product,
                c.audience AS campaign_audience, c.voice AS campaign_voice,
                c.tone AS campaign_tone, c.status AS campaign_status,
                ap.id AS autopilot_plan_id, ap.status AS plan_status,
                ap.source_import_batch_id, sib.campaign_id AS source_campaign_id
         FROM workflow_runs wr
         INNER JOIN campaigns c ON c.id = wr.campaign_id
         INNER JOIN workflow_steps ws ON ws.workflow_run_id = wr.id AND ws.step_key = 'score'
         INNER JOIN autopilot_plans ap ON ap.workflow_run_id = wr.id
         INNER JOIN source_import_batches sib ON sib.id = ap.source_import_batch_id
         WHERE wr.id = ?1 LIMIT 1",
    )
    .bind(input.id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(read_error)?
    .as_ref()
    .map(row_to_json);
    let artifacts = sqlx::query(
        "SELECT wa.artifact_id, wa.id AS artifact_order, wa.workflow_step_id,
                cp.id AS candidate_id, cp.campaign_id AS candidate_campaign_id,
                cp.status AS candidate_status, cp.relevance_score, cp.source_keyword,
                tp.author_name, tp.author_profile_url, tp.posted_at,
                tp.url AS source_url, tp.content
         FROM workflow_artifacts wa
         LEFT JOIN candidate_posts cp ON wa.artifact_type = 'candidate_post' AND cp.id = wa.artifact_id
         LEFT JOIN target_posts tp ON tp.id = cp.target_post_id
         WHERE wa.workflow_run_id = ?1 AND wa.artifact_type = 'candidate_post'
         ORDER BY wa.id ASC, wa.artifact_id ASC
         LIMIT ?2",
    )
    .bind(input.id)
    .bind(PLANNER_ARTIFACT_LIMIT)
    .fetch_all(&mut *tx)
    .await
    .map_err(read_error)?;
    let keywords = match header.as_ref().and_then(|row| row["campaign_id"].as_i64()) {
        Some(campaign_id) => sqlx::query_scalar(
            "SELECT keyword FROM campaign_keywords WHERE campaign_id = ?1 ORDER BY id ASC LIMIT 12",
        )
        .bind(campaign_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(read_error)?,
        None => Vec::new(),
    };
    tx.commit().await.map_err(read_error)?;
    Ok(PlannerScoringScopeRows {
        header,
        artifacts: rows_to_json(&artifacts),
        keywords,
    })
}

/// Saved-draft provenance rows for a planner audit step (normally one; at
/// most two are read so the renderer can reject an ambiguous scope).
pub(crate) async fn planner_draft_audit_scope(
    pool: &SqlitePool,
    input: WorkflowRunIdInput,
) -> Result<Vec<Value>, String> {
    positive(input.id, "Workflow run id")?;
    let rows = sqlx::query(
        "SELECT wr.campaign_id, ws.id AS workflow_step_id, wa.artifact_id AS draft_id,
                dgr.id AS request_id, dgr.provider_key, dgr.model_name,
                dgr.workflow_run_id AS request_run_id, dgr.workflow_step_id AS request_step_id,
                dgr.campaign_id AS request_campaign_id, dgr.created_draft_id,
                d.campaign_id AS draft_campaign_id
         FROM workflow_runs wr
         INNER JOIN workflow_steps ws ON ws.workflow_run_id = wr.id AND ws.step_key = 'audit'
         INNER JOIN workflow_artifacts wa ON wa.workflow_run_id = wr.id AND wa.artifact_type = 'draft'
         INNER JOIN drafts d ON d.id = wa.artifact_id
         INNER JOIN draft_generation_requests dgr ON dgr.created_draft_id = d.id AND dgr.status = 'saved'
         INNER JOIN autopilot_plans ap
           ON ap.workflow_run_id = wr.id AND ap.campaign_id = wr.campaign_id AND ap.status = 'planned'
         WHERE wr.id = ?1
         LIMIT 2",
    )
    .bind(input.id)
    .fetch_all(pool)
    .await
    .map_err(read_error)?;
    Ok(rows_to_json(&rows))
}

/// Agent-run list snapshot: runs (capped at 200) with tool calls, events
/// (newest 100 per run) and approval checkpoints, read in one transaction.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunListSnapshot {
    pub runs: Vec<Value>,
    pub tool_calls: Vec<Value>,
    pub events: Vec<Value>,
    pub checkpoints: Vec<Value>,
}

const AGENT_RUN_COLUMNS: &str = "ar.id, ar.campaign_id, ar.workflow_run_id, ar.workflow_step_id,
    ar.agent_role, ar.provider_key, ar.model_name, ar.playbook_key, ar.status,
    ar.input_summary, ar.input_context_json, ar.output_summary, ar.error_message,
    ar.iteration_count, ar.started_at, ar.completed_at, ar.created_at, ar.updated_at";

pub(crate) async fn list_agent_runs(
    pool: &SqlitePool,
    input: WorkflowRunListInput,
) -> Result<AgentRunListSnapshot, String> {
    if let Some(id) = input.campaign_id {
        positive(id, "Campaign id")?;
    }
    let mut tx = pool.begin().await.map_err(read_error)?;
    let sql = format!(
        "SELECT {AGENT_RUN_COLUMNS}, c.name AS campaign_name, c.status AS campaign_status
         FROM agent_runs ar
         INNER JOIN campaigns c ON c.id = ar.campaign_id
         WHERE (?1 IS NULL OR ar.campaign_id = ?1)
         ORDER BY CASE ar.status
           WHEN 'running' THEN 1 WHEN 'waiting_approval' THEN 2 WHEN 'queued' THEN 3
           WHEN 'failed' THEN 4 WHEN 'completed' THEN 5 WHEN 'cancelled' THEN 6 ELSE 7 END,
           datetime(ar.updated_at) DESC, ar.id DESC
         LIMIT ?2"
    );
    let rows = sqlx::query(&sql)
        .bind(input.campaign_id)
        .bind(RUN_LIST_LIMIT)
        .fetch_all(&mut *tx)
        .await
        .map_err(read_error)?;
    let runs = rows_to_json(&rows);
    let run_ids: Vec<i64> = runs.iter().filter_map(|run| run["id"].as_i64()).collect();
    let tool_calls = by_ids(
        &mut tx,
        "SELECT id, agent_run_id, provider_tool_call_id, tool_name, status,
                requires_approval, input_json, output_json, error_message,
                started_at, completed_at, created_at
         FROM agent_tool_calls WHERE agent_run_id IN ({ids}) AND {limit} > 0
         ORDER BY agent_run_id ASC, id ASC",
        &run_ids,
    )
    .await?;
    let events = by_ids(
        &mut tx,
        "SELECT id, agent_run_id, event_type, summary, created_at
         FROM (
           SELECT e.*, ROW_NUMBER() OVER (
             PARTITION BY e.agent_run_id ORDER BY datetime(e.created_at) DESC, e.id DESC
           ) AS event_rank
           FROM agent_run_events e WHERE e.agent_run_id IN ({ids})
         )
         WHERE event_rank <= {limit}
         ORDER BY agent_run_id ASC, datetime(created_at) DESC, id DESC",
        &run_ids,
    )
    .await?;
    let checkpoints = by_ids(
        &mut tx,
        "SELECT cp.agent_run_id, cp.pending_tool_call_id, cp.approval_id, cp.phase,
                cp.messages_json, cp.iteration_count, cp.created_at, cp.updated_at,
                a.status AS approval_status
         FROM agent_run_approval_checkpoints cp
         INNER JOIN approvals a ON a.id = cp.approval_id
         WHERE cp.agent_run_id IN ({ids}) AND {limit} > 0",
        &run_ids,
    )
    .await?;
    tx.commit().await.map_err(read_error)?;
    Ok(AgentRunListSnapshot {
        runs,
        tool_calls,
        events,
        checkpoints,
    })
}

/// The single agent-run row `startAgentRun`/`resumeAgentRun` check before any
/// provider call (the provider call happens after this read returns).
pub(crate) async fn agent_run_validation(
    pool: &SqlitePool,
    input: WorkflowRunIdInput,
) -> Result<Value, String> {
    positive(input.id, "Agent run id")?;
    let sql = format!(
        "SELECT {AGENT_RUN_COLUMNS}, c.status AS campaign_status
         FROM agent_runs ar
         INNER JOIN campaigns c ON c.id = ar.campaign_id
         WHERE ar.id = ?1 LIMIT 1"
    );
    let row = sqlx::query(&sql)
        .bind(input.id)
        .fetch_optional(pool)
        .await
        .map_err(read_error)?
        .ok_or_else(|| "Agent run was not found".to_string())?;
    Ok(row_to_json(&row))
}

#[tauri::command]
pub async fn linkgo_agent_run_list(
    pool: State<'_, SqlitePool>,
    input: WorkflowRunListInput,
) -> Result<AgentRunListSnapshot, String> {
    list_agent_runs(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_agent_run_validation(
    pool: State<'_, SqlitePool>,
    input: WorkflowRunIdInput,
) -> Result<Value, String> {
    agent_run_validation(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_workflow_planner_scoring_scope(
    pool: State<'_, SqlitePool>,
    input: WorkflowRunIdInput,
) -> Result<PlannerScoringScopeRows, String> {
    planner_scoring_scope(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_workflow_planner_draft_audit_scope(
    pool: State<'_, SqlitePool>,
    input: WorkflowRunIdInput,
) -> Result<Vec<Value>, String> {
    planner_draft_audit_scope(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_workflow_run_list(
    pool: State<'_, SqlitePool>,
    input: WorkflowRunListInput,
) -> Result<WorkflowRunListSnapshot, String> {
    list_runs(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_workflow_run_validation(
    pool: State<'_, SqlitePool>,
    input: WorkflowRunIdInput,
) -> Result<Value, String> {
    run_validation(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_workflow_step_execution_create(
    pool: State<'_, SqlitePool>,
    input: CreateStepExecutionInput,
) -> Result<i64, String> {
    create_step_execution(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_workflow_step_execution_update(
    pool: State<'_, SqlitePool>,
    input: UpdateStepExecutionInput,
) -> Result<(), String> {
    update_step_execution(pool.inner(), input).await
}

#[cfg(test)]
#[path = "workflow_store_tests.rs"]
mod tests;
