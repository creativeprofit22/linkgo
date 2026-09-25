use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{Row, SqliteConnection, SqlitePool};
use tauri::State;

pub(crate) const SETTLEMENT_ERROR: &str = "Agent continuation could not be settled";
const REJECTION_DETAIL: &str = "Approval rejected before continuation";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SettleApprovedContinuationInput {
    pub agent_run_id: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SchedulePostInput {
    campaign_id: i64,
    approval_id: i64,
    scheduled_for: String,
    timezone: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovedContinuationSettlement {
    pub agent_run_id: i64,
    pub campaign_id: i64,
    pub workflow_run_id: Option<i64>,
    pub workflow_step_id: Option<i64>,
    pub agent_role: String,
    pub provider_key: String,
    pub model_name: String,
    pub playbook_key: String,
    pub input_summary: String,
    pub input_context: Value,
    pub messages: Value,
    pub iteration_count: i64,
    pub handled_provider_tool_call_ids: Vec<String>,
    pub checkpoint_phase: String,
    pub recovered: bool,
}

struct SettlementState {
    run_id: i64,
    campaign_id: i64,
    workflow_run_id: Option<i64>,
    workflow_step_id: Option<i64>,
    agent_role: String,
    provider_key: String,
    model_name: String,
    playbook_key: String,
    input_summary: String,
    input_context_json: String,
    run_status: String,
    output_summary: String,
    campaign_status: String,
    pending_tool_call_id: i64,
    approval_id: i64,
    phase: String,
    messages_json: String,
    iteration_count: i64,
    approval_status: String,
    tool_name: String,
    tool_status: String,
    requires_approval: i64,
    provider_tool_call_id: String,
    input_json: String,
    approval_campaign_id: i64,
}

fn storage_error<T>() -> Result<T, String> {
    Err(SETTLEMENT_ERROR.to_string())
}

async fn load_state(
    connection: &mut SqliteConnection,
    agent_run_id: i64,
) -> Result<SettlementState, String> {
    let checkpoint = sqlx::query(
        "SELECT cp.pending_tool_call_id, cp.approval_id, cp.phase, cp.messages_json,
                cp.iteration_count, a.status AS approval_status, a.campaign_id AS approval_campaign_id
         FROM agent_run_approval_checkpoints cp
         INNER JOIN approvals a ON a.id = cp.approval_id
         WHERE cp.agent_run_id = ?1 LIMIT 1",
    )
    .bind(agent_run_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(|_| SETTLEMENT_ERROR.to_string())?
    .ok_or_else(|| "Agent approval checkpoint was not found".to_string())?;

    let run = sqlx::query(
        "SELECT ar.id, ar.campaign_id, ar.workflow_run_id, ar.workflow_step_id,
                ar.agent_role, ar.provider_key, ar.model_name, ar.playbook_key,
                ar.input_summary, ar.input_context_json, ar.status, ar.output_summary,
                c.status AS campaign_status
         FROM agent_runs ar INNER JOIN campaigns c ON c.id = ar.campaign_id
         WHERE ar.id = ?1 LIMIT 1",
    )
    .bind(agent_run_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(|_| SETTLEMENT_ERROR.to_string())?
    .ok_or_else(|| "Agent run cannot resume from its current status".to_string())?;

    let pending_tool_call_id: i64 = checkpoint
        .try_get("pending_tool_call_id")
        .map_err(|_| SETTLEMENT_ERROR.to_string())?;
    let tool = sqlx::query(
        "SELECT tool_name, status, requires_approval, provider_tool_call_id, input_json
         FROM agent_tool_calls WHERE id = ?1 AND agent_run_id = ?2 LIMIT 1",
    )
    .bind(pending_tool_call_id)
    .bind(agent_run_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(|_| SETTLEMENT_ERROR.to_string())?
    .ok_or_else(|| "Pending approval tool call was not found".to_string())?;

    macro_rules! get {
        ($row:expr, $name:literal) => {
            $row.try_get($name)
                .map_err(|_| SETTLEMENT_ERROR.to_string())?
        };
    }
    Ok(SettlementState {
        run_id: get!(run, "id"),
        campaign_id: get!(run, "campaign_id"),
        workflow_run_id: get!(run, "workflow_run_id"),
        workflow_step_id: get!(run, "workflow_step_id"),
        agent_role: get!(run, "agent_role"),
        provider_key: get!(run, "provider_key"),
        model_name: get!(run, "model_name"),
        playbook_key: get!(run, "playbook_key"),
        input_summary: get!(run, "input_summary"),
        input_context_json: get!(run, "input_context_json"),
        run_status: get!(run, "status"),
        output_summary: get!(run, "output_summary"),
        campaign_status: get!(run, "campaign_status"),
        pending_tool_call_id,
        approval_id: get!(checkpoint, "approval_id"),
        phase: get!(checkpoint, "phase"),
        messages_json: get!(checkpoint, "messages_json"),
        iteration_count: get!(checkpoint, "iteration_count"),
        approval_status: get!(checkpoint, "approval_status"),
        tool_name: get!(tool, "tool_name"),
        tool_status: get!(tool, "status"),
        requires_approval: get!(tool, "requires_approval"),
        provider_tool_call_id: get!(tool, "provider_tool_call_id"),
        input_json: get!(tool, "input_json"),
        approval_campaign_id: get!(checkpoint, "approval_campaign_id"),
    })
}

async fn reconcile_workflow(
    connection: &mut SqliteConnection,
    state: &SettlementState,
    status: &str,
    error_message: &str,
) -> Result<(), String> {
    let (Some(workflow_run_id), Some(workflow_step_id)) =
        (state.workflow_run_id, state.workflow_step_id)
    else {
        return Ok(());
    };
    let step_status = if status == "cancelled" {
        "blocked"
    } else {
        "running"
    };
    let execution_status = if status == "cancelled" {
        "cancelled"
    } else {
        "running"
    };
    sqlx::query(
        "UPDATE workflow_step_executions SET status = ?1, error_summary = ?2,
         completed_at = CASE WHEN ?1 = 'cancelled' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END,
         updated_at = datetime('now') WHERE agent_run_id = ?3 AND workflow_step_id = ?4",
    )
    .bind(execution_status)
    .bind(error_message)
    .bind(state.run_id)
    .bind(workflow_step_id)
    .execute(&mut *connection)
    .await
    .map_err(|_| SETTLEMENT_ERROR.to_string())?;
    sqlx::query(
        "UPDATE workflow_steps SET status = ?1, output_summary = ?2, error_message = ?3,
         started_at = CASE WHEN ?1 = 'running' THEN COALESCE(started_at, datetime('now')) ELSE started_at END,
         completed_at = NULL, updated_at = datetime('now')
         WHERE id = ?4 AND workflow_run_id = ?5",
    )
    .bind(step_status)
    .bind(if status == "running" { &state.output_summary } else { "" })
    .bind(error_message)
    .bind(workflow_step_id)
    .bind(workflow_run_id)
    .execute(&mut *connection)
    .await
    .map_err(|_| SETTLEMENT_ERROR.to_string())?;
    sqlx::query(
        "UPDATE workflow_runs SET status = ?1, completed_at = NULL, updated_at = datetime('now')
         WHERE id = ?2 AND status <> 'cancelled'",
    )
    .bind(if status == "cancelled" {
        "blocked"
    } else {
        "running"
    })
    .bind(workflow_run_id)
    .execute(&mut *connection)
    .await
    .map_err(|_| SETTLEMENT_ERROR.to_string())?;
    Ok(())
}

/// Step statuses that may move to (or already are) `blocked`.
const BLOCKABLE_STEP_STATUSES: &[&str] = &["running", "waiting_approval", "failed", "blocked"];

/// Projects a rejected (cancelled) agent run onto its workflow step and run,
/// mirroring the renderer workflow projection: the step becomes `blocked`, a
/// `step_blocked` event is recorded when the status changes, and the run
/// status/current step are recomputed from the ordered steps.
async fn reconcile_rejected_workflow(
    connection: &mut SqliteConnection,
    state: &SettlementState,
    error_message: &str,
) -> Result<(), String> {
    let (Some(workflow_run_id), Some(workflow_step_id)) =
        (state.workflow_run_id, state.workflow_step_id)
    else {
        return Ok(());
    };
    let step = sqlx::query(
        "SELECT ws.workflow_run_id, ws.step_key, ws.title, ws.status,
                wr.status AS run_status, ap.id AS autopilot_plan_id
         FROM workflow_steps ws
         INNER JOIN workflow_runs wr ON wr.id = ws.workflow_run_id
         LEFT JOIN autopilot_plans ap ON ap.workflow_run_id = wr.id
         WHERE ws.id = ?1 LIMIT 1",
    )
    .bind(workflow_step_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(|_| SETTLEMENT_ERROR.to_string())?;
    let Some(step) = step else {
        return Ok(());
    };
    macro_rules! get {
        ($row:expr, $name:literal) => {
            $row.try_get($name)
                .map_err(|_| SETTLEMENT_ERROR.to_string())?
        };
    }
    let step_run_id: i64 = get!(step, "workflow_run_id");
    let step_key: String = get!(step, "step_key");
    let title: String = get!(step, "title");
    let step_status: String = get!(step, "status");
    let run_status: String = get!(step, "run_status");
    let autopilot_plan_id: Option<i64> = get!(step, "autopilot_plan_id");
    if step_run_id != workflow_run_id || run_status == "cancelled" {
        return Ok(());
    }
    // Planner draft audits are settled by their own native commands.
    if step_key == "audit" && autopilot_plan_id.is_some() {
        return Ok(());
    }
    if !BLOCKABLE_STEP_STATUSES.contains(&step_status.as_str()) {
        return Err("Unsupported workflow step transition".to_string());
    }
    sqlx::query(
        "UPDATE workflow_step_executions SET status = 'cancelled', error_summary = ?1,
         completed_at = COALESCE(completed_at, datetime('now')), updated_at = datetime('now')
         WHERE agent_run_id = ?2 AND workflow_step_id = ?3",
    )
    .bind(error_message)
    .bind(state.run_id)
    .bind(workflow_step_id)
    .execute(&mut *connection)
    .await
    .map_err(|_| SETTLEMENT_ERROR.to_string())?;
    sqlx::query(
        "UPDATE workflow_steps SET status = 'blocked', output_summary = '', error_message = ?1,
         completed_at = NULL, updated_at = datetime('now') WHERE id = ?2",
    )
    .bind(error_message)
    .bind(workflow_step_id)
    .execute(&mut *connection)
    .await
    .map_err(|_| SETTLEMENT_ERROR.to_string())?;
    if step_status != "blocked" {
        sqlx::query(
            "INSERT INTO workflow_events (workflow_run_id, workflow_step_id, event_type, summary)
             VALUES (?1, ?2, 'step_blocked', ?3)",
        )
        .bind(workflow_run_id)
        .bind(workflow_step_id)
        .bind(format!("{title} blocked"))
        .execute(&mut *connection)
        .await
        .map_err(|_| SETTLEMENT_ERROR.to_string())?;
    }

    let steps = sqlx::query(
        "SELECT step_key, status FROM workflow_steps
         WHERE workflow_run_id = ?1 ORDER BY sort_order ASC",
    )
    .bind(workflow_run_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|_| SETTLEMENT_ERROR.to_string())?;
    let mut current: Option<(String, String)> = None;
    for row in &steps {
        let status: String = get!(row, "status");
        if status != "completed" && status != "skipped" {
            current = Some((get!(row, "step_key"), status));
            break;
        }
    }
    // The rejected step is now blocked, so an unfinished step always exists.
    let (current_step_key, next_run_status) = match current {
        Some((key, status)) => {
            let run_status = match status.as_str() {
                "waiting_approval" => "waiting_approval",
                "blocked" => "blocked",
                "failed" => "failed",
                _ => "running",
            };
            (key, run_status)
        }
        None => ("measure".to_string(), "completed"),
    };
    sqlx::query(
        "UPDATE workflow_runs SET status = ?1, current_step_key = ?2,
         started_at = CASE WHEN ?1 = 'running' THEN COALESCE(started_at, datetime('now')) ELSE started_at END,
         completed_at = CASE WHEN ?1 = 'completed' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END,
         updated_at = datetime('now') WHERE id = ?3",
    )
    .bind(next_run_status)
    .bind(&current_step_key)
    .bind(workflow_run_id)
    .execute(&mut *connection)
    .await
    .map_err(|_| SETTLEMENT_ERROR.to_string())?;
    if step_key == "score" {
        sync_planner_scoring_backlog_blocked(connection, workflow_run_id).await?;
    }
    Ok(())
}

async fn sync_planner_scoring_backlog_blocked(
    connection: &mut SqliteConnection,
    workflow_run_id: i64,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE campaign_backlog_items
         SET status = 'blocked', completed_at = NULL, cancelled_at = NULL,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = (
             SELECT ap.campaign_backlog_item_id FROM autopilot_plans ap
             INNER JOIN workflow_steps ws
               ON ws.workflow_run_id = ap.workflow_run_id AND ws.step_key = 'score'
             WHERE ap.workflow_run_id = ?1 AND ap.status = 'planned' AND ws.status = 'blocked'
             LIMIT 1
         )
           AND owner_type = 'linkgo' AND work_type = 'scoring' AND recurrence = 'none'
           AND status NOT IN ('completed', 'cancelled')",
    )
    .bind(workflow_run_id)
    .execute(&mut *connection)
    .await
    .map_err(|_| SETTLEMENT_ERROR.to_string())?;
    Ok(())
}

async fn reject_continuation_run(
    connection: &mut SqliteConnection,
    state: &SettlementState,
    detail: &str,
) -> Result<(), String> {
    let error_message = format!("Approval rejected: {detail}");
    sqlx::query(
        "UPDATE agent_tool_calls SET status = 'rejected', error_message = ?1,
         completed_at = datetime('now') WHERE id = ?2 AND status IN ('waiting_approval', 'running')",
    )
    .bind(&error_message)
    .bind(state.pending_tool_call_id)
    .execute(&mut *connection)
    .await
    .map_err(|_| SETTLEMENT_ERROR.to_string())?;
    sqlx::query(
        "UPDATE agent_runs SET status = 'cancelled', error_message = ?1,
         completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?2",
    )
    .bind(&error_message)
    .bind(state.run_id)
    .execute(&mut *connection)
    .await
    .map_err(|_| SETTLEMENT_ERROR.to_string())?;
    reconcile_rejected_workflow(connection, state, &error_message).await?;
    sqlx::query(
        "INSERT INTO agent_run_events (agent_run_id, event_type, summary)
         VALUES (?1, 'run_cancelled', ?2)",
    )
    .bind(state.run_id)
    .bind(format!(
        "Agent run cancelled after approval rejection: {detail}"
    ))
    .execute(&mut *connection)
    .await
    .map_err(|_| SETTLEMENT_ERROR.to_string())?;
    Ok(())
}

/// Cancels every agent run waiting on `approval_id`, rejects its pending tool
/// call, projects the cancellation onto the linked workflow, and deletes the
/// approval checkpoints. Runs inside the caller's transaction.
pub(crate) async fn reject_linked_continuations(
    connection: &mut SqliteConnection,
    approval_id: i64,
    detail: &str,
) -> Result<(), String> {
    let run_ids = sqlx::query_scalar::<_, i64>(
        "SELECT agent_run_id FROM agent_run_approval_checkpoints
         WHERE approval_id = ?1 ORDER BY agent_run_id",
    )
    .bind(approval_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|_| SETTLEMENT_ERROR.to_string())?;
    for run_id in run_ids {
        let linked_state = load_state(connection, run_id).await?;
        reject_continuation_run(connection, &linked_state, detail).await?;
    }
    sqlx::query("DELETE FROM agent_run_approval_checkpoints WHERE approval_id = ?1")
        .bind(approval_id)
        .execute(&mut *connection)
        .await
        .map_err(|_| SETTLEMENT_ERROR.to_string())?;
    Ok(())
}

fn validate_settlement_state(state: &SettlementState) -> Result<(), String> {
    const ROLES: &[&str] = &[
        "researcher",
        "scorer",
        "drafter",
        "auditor",
        "scheduler",
        "analyst",
    ];
    const PROVIDERS: &[&str] = &[
        "dry_run",
        "anthropic",
        "xiaomi",
        "openai",
        "gemini",
        "glm",
        "moonshot",
        "deepseek",
        "openrouter",
        "sakana",
        "minimax",
        "custom",
    ];
    const PLAYBOOKS: &[&str] = &[
        "",
        "linkedin_writer",
        "linkedin_humanizer",
        "content_calendar",
        "linkedin_commenter",
        "campaign_analyst",
    ];
    if state.run_id <= 0
        || state.campaign_id <= 0
        || state.workflow_run_id.is_some_and(|id| id <= 0)
        || state.workflow_step_id.is_some_and(|id| id <= 0)
        || state.pending_tool_call_id <= 0
        || state.approval_id <= 0
        || !ROLES.contains(&state.agent_role.as_str())
        || !PROVIDERS.contains(&state.provider_key.as_str())
        || !PLAYBOOKS.contains(&state.playbook_key.as_str())
        || state.model_name != state.model_name.trim()
        || state.model_name.chars().count() > 120
        || state.input_summary != state.input_summary.trim()
        || state.input_summary.chars().count() > 1000
        || !(0..=20).contains(&state.iteration_count)
        || state.provider_tool_call_id.chars().count() > 200
    {
        return storage_error();
    }
    Ok(())
}

/// Tools an approved continuation may replay (excludes `score_draft_quality`).
pub(crate) const CONTINUATION_TOOLS: &[&str] = &[
    "research_posts",
    "score_relevance",
    "draft_post",
    "audit_post",
    "schedule_post",
    "collect_metrics",
];

fn validate_messages(messages: &Value) -> Result<(), String> {
    validate_messages_with_tools(messages, CONTINUATION_TOOLS)
}

/// Structural check of a persisted agent conversation: known roles, exact
/// field sets, and every tool result answering one earlier assistant call.
pub(crate) fn validate_messages_with_tools(messages: &Value, tools: &[&str]) -> Result<(), String> {
    let rows = messages
        .as_array()
        .ok_or_else(|| SETTLEMENT_ERROR.to_string())?;
    let mut pending_calls = std::collections::HashMap::<&str, &str>::new();
    for message in rows {
        let object = message
            .as_object()
            .ok_or_else(|| SETTLEMENT_ERROR.to_string())?;
        let role = object
            .get("role")
            .and_then(Value::as_str)
            .ok_or_else(|| SETTLEMENT_ERROR.to_string())?;
        let content = object
            .get("content")
            .and_then(Value::as_str)
            .ok_or_else(|| SETTLEMENT_ERROR.to_string())?;
        let _ = content;
        match role {
            "system" | "user" => {
                if object.len() != 2 {
                    return storage_error();
                }
            }
            "assistant" if object.len() == 2 => {}
            "assistant" => {
                if object.len() != 4 {
                    return storage_error();
                }
                let tool_name = object
                    .get("toolName")
                    .and_then(Value::as_str)
                    .filter(|name| tools.contains(name))
                    .ok_or_else(|| SETTLEMENT_ERROR.to_string())?;
                let call_id = object
                    .get("providerToolCallId")
                    .and_then(Value::as_str)
                    .filter(|id| !id.trim().is_empty())
                    .ok_or_else(|| SETTLEMENT_ERROR.to_string())?;
                if pending_calls.insert(call_id, tool_name).is_some() {
                    return storage_error();
                }
            }
            "tool" => {
                if object.len() != 4 {
                    return storage_error();
                }
                let tool_name = object
                    .get("toolName")
                    .and_then(Value::as_str)
                    .filter(|name| tools.contains(name))
                    .ok_or_else(|| SETTLEMENT_ERROR.to_string())?;
                let call_id = object
                    .get("providerToolCallId")
                    .and_then(Value::as_str)
                    .filter(|id| !id.trim().is_empty())
                    .ok_or_else(|| SETTLEMENT_ERROR.to_string())?;
                if pending_calls.remove(call_id) != Some(tool_name) {
                    return storage_error();
                }
            }
            _ => return storage_error(),
        }
    }
    Ok(())
}

async fn execute_settlement(
    connection: &mut SqliteConnection,
    agent_run_id: i64,
) -> Result<ApprovedContinuationSettlement, String> {
    let state = load_state(connection, agent_run_id).await?;
    validate_settlement_state(&state)?;
    if state.tool_name != "schedule_post" || state.requires_approval != 1 {
        return Err("Approval checkpoint does not reference schedule_post".to_string());
    }
    let schedule_input: SchedulePostInput =
        serde_json::from_str(&state.input_json).map_err(|_| SETTLEMENT_ERROR.to_string())?;
    if schedule_input.campaign_id <= 0
        || schedule_input.approval_id <= 0
        || schedule_input.scheduled_for.trim().is_empty()
        || schedule_input.scheduled_for.trim().len() > 120
        || schedule_input.timezone.trim().is_empty()
        || schedule_input.timezone.trim().len() > 80
    {
        return storage_error();
    }
    if schedule_input.campaign_id != state.campaign_id
        || schedule_input.approval_id != state.approval_id
    {
        return Err("Approval checkpoint does not match the run campaign".to_string());
    }
    if state.approval_campaign_id != state.campaign_id {
        return Err("Linked approval belongs to a different campaign".to_string());
    }
    if state.approval_status == "rejected" {
        reject_linked_continuations(connection, state.approval_id, REJECTION_DETAIL).await?;
        return Err("Linked approval was rejected".to_string());
    }
    if state.approval_status != "approved" {
        return Err("Linked approval must be approved before resume".to_string());
    }
    if state.campaign_status == "archived" {
        return Err("Campaign is archived".to_string());
    }
    let kill_switch = sqlx::query_scalar::<_, i64>(
        "SELECT global_kill_switch FROM safety_settings WHERE id = 1 LIMIT 1",
    )
    .fetch_optional(&mut *connection)
    .await
    .map_err(|_| SETTLEMENT_ERROR.to_string())?
    .unwrap_or(0);
    if kill_switch == 1 {
        return Err("Global kill switch is enabled".to_string());
    }

    let recovered = state.phase == "continuation_ready" && state.run_status == "failed";
    if state.phase == "continuation_ready" && state.run_status == "running" {
        return Err("Agent continuation is already running".to_string());
    }
    if !recovered && (state.phase != "waiting_approval" || state.run_status != "waiting_approval") {
        return Err("Agent run cannot resume from its current status".to_string());
    }
    if recovered && state.tool_status != "completed" {
        return Err("Approved tool call was already handled".to_string());
    }

    let mut messages: Value =
        serde_json::from_str(&state.messages_json).map_err(|_| SETTLEMENT_ERROR.to_string())?;
    let input_context: Value = serde_json::from_str(&state.input_context_json)
        .map_err(|_| SETTLEMENT_ERROR.to_string())?;
    validate_messages(&messages)?;
    let input_context_object = input_context
        .as_object()
        .ok_or_else(|| SETTLEMENT_ERROR.to_string())?;
    if state.input_context_json.len() > 50_000
        || input_context_object
            .keys()
            .any(|key| key.trim().is_empty() || key.trim().len() > 120)
    {
        return storage_error();
    }

    let claim = sqlx::query(
        "UPDATE agent_runs SET status = 'running', completed_at = NULL, error_message = '',
         updated_at = datetime('now') WHERE id = ?1 AND status = ?2",
    )
    .bind(state.run_id)
    .bind(if recovered {
        "failed"
    } else {
        "waiting_approval"
    })
    .execute(&mut *connection)
    .await
    .map_err(|_| SETTLEMENT_ERROR.to_string())?;
    if claim.rows_affected() != 1 {
        return Err("Agent continuation is already running".to_string());
    }
    reconcile_workflow(connection, &state, "running", "").await?;

    if !recovered {
        if state.tool_status != "waiting_approval" && state.tool_status != "running" {
            return Err("Pending approval tool is not executable".to_string());
        }
        let output = json!({
            "scheduled": false,
            "approvalId": state.approval_id,
            "scheduledFor": schedule_input.scheduled_for,
            "timezone": schedule_input.timezone,
            "summary": "Approval confirmed for schedule metadata only; no schedule record or publish action was created."
        });
        let updated = sqlx::query(
            "UPDATE agent_tool_calls SET status = 'completed', output_json = ?1, error_message = '',
             completed_at = datetime('now') WHERE id = ?2 AND status IN ('waiting_approval', 'running')",
        )
        .bind(output.to_string())
        .bind(state.pending_tool_call_id)
        .execute(&mut *connection)
        .await
        .map_err(|_| SETTLEMENT_ERROR.to_string())?;
        if updated.rows_affected() != 1 {
            return Err("Approved tool call was already handled".to_string());
        }
        messages
            .as_array_mut()
            .ok_or_else(|| SETTLEMENT_ERROR.to_string())?
            .push(json!({
                "role": "tool",
                "content": output.to_string(),
                "toolName": "schedule_post",
                "providerToolCallId": state.provider_tool_call_id,
            }));
        let checkpoint_update = sqlx::query(
            "UPDATE agent_run_approval_checkpoints SET phase = 'continuation_ready',
             messages_json = ?1, updated_at = datetime('now')
             WHERE agent_run_id = ?2 AND phase = 'waiting_approval'",
        )
        .bind(messages.to_string())
        .bind(state.run_id)
        .execute(&mut *connection)
        .await
        .map_err(|_| SETTLEMENT_ERROR.to_string())?;
        if checkpoint_update.rows_affected() != 1 {
            return storage_error();
        }
    }

    let handled_provider_tool_call_ids = sqlx::query_scalar::<_, String>(
        "SELECT provider_tool_call_id FROM agent_tool_calls
         WHERE agent_run_id = ?1 AND provider_tool_call_id <> '' ORDER BY id",
    )
    .bind(state.run_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|_| SETTLEMENT_ERROR.to_string())?;

    Ok(ApprovedContinuationSettlement {
        agent_run_id: state.run_id,
        campaign_id: state.campaign_id,
        workflow_run_id: state.workflow_run_id,
        workflow_step_id: state.workflow_step_id,
        agent_role: state.agent_role,
        provider_key: state.provider_key,
        model_name: state.model_name,
        playbook_key: state.playbook_key,
        input_summary: state.input_summary,
        input_context,
        messages,
        iteration_count: state.iteration_count,
        handled_provider_tool_call_ids,
        checkpoint_phase: "continuation_ready".to_string(),
        recovered,
    })
}

async fn settle_approved_continuation(
    pool: &SqlitePool,
    input: SettleApprovedContinuationInput,
) -> Result<ApprovedContinuationSettlement, String> {
    let mut connection = pool
        .acquire()
        .await
        .map_err(|_| SETTLEMENT_ERROR.to_string())?;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *connection)
        .await
        .map_err(|_| SETTLEMENT_ERROR.to_string())?;
    match execute_settlement(&mut connection, input.agent_run_id).await {
        Ok(result) => {
            sqlx::query("COMMIT")
                .execute(&mut *connection)
                .await
                .map_err(|_| SETTLEMENT_ERROR.to_string())?;
            Ok(result)
        }
        Err(error) if error == "Linked approval was rejected" => {
            sqlx::query("COMMIT")
                .execute(&mut *connection)
                .await
                .map_err(|_| SETTLEMENT_ERROR.to_string())?;
            Err(error)
        }
        Err(error) => {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn linkgo_agent_settle_approved_continuation(
    pool: State<'_, SqlitePool>,
    input: SettleApprovedContinuationInput,
) -> Result<ApprovedContinuationSettlement, String> {
    settle_approved_continuation(pool.inner(), input).await
}

#[cfg(test)]
#[path = "agent_continuations_tests.rs"]
mod tests;
