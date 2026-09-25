//! Native agent-run persistence (port of the writes in
//! `src/features/agent-runtime/data.ts`).
//!
//! Provider streaming and the tool loop stay in the renderer. Every write
//! they need goes through these commands, each on one pinned
//! `BEGIN IMMEDIATE` connection that re-reads the run, campaign, workflow
//! step and linked approval:
//! create → start (preflight, kill switch, claim) → progress events →
//! persist result | fail after persistence error; plus cancel.
//!
//! Per-tool input/output contracts are Zod schemas in the renderer and are
//! checked there before persisting; native enforces structure and size, the
//! conversation shape, and every ownership rule.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{Row, SqliteConnection, SqlitePool};
use tauri::State;

use crate::agent_continuations::validate_messages_with_tools;
use crate::db_transaction::{settle, Settlement};
use crate::js_text::{js_trim, utf16_len, utf16_prefix};
use crate::workflows::{reconcile_workflow_agent_run, ReconcileAgentRun};

const STORAGE_ERROR: &str = "Could not save agent run change";
const MAX_SUMMARY_UTF16: usize = 1000;
const MAX_CONTEXT_JSON_UTF16: usize = 50_000;
const MAX_TOOL_JSON_UTF16: usize = 200_000;
const MAX_CONVERSATION_JSON_UTF16: usize = 2_000_000;
const MAX_TOOL_CALLS: usize = 64;
const MAX_ITERATIONS: i64 = 20;

const ROLES: [&str; 6] = [
    "researcher",
    "scorer",
    "drafter",
    "auditor",
    "scheduler",
    "analyst",
];
use crate::agent_providers::AGENT_PROVIDER_KEYS as PROVIDERS;
const TOOLS: [&str; 7] = [
    "research_posts",
    "score_relevance",
    "draft_post",
    "audit_post",
    "score_draft_quality",
    "schedule_post",
    "collect_metrics",
];
const TOOL_CALL_STATUSES: [&str; 6] = [
    "requested",
    "running",
    "waiting_approval",
    "completed",
    "failed",
    "rejected",
];
const EVENT_TYPES: [&str; 10] = [
    "run_created",
    "model_started",
    "model_streamed",
    "tool_requested",
    "tool_completed",
    "tool_failed",
    "approval_required",
    "run_completed",
    "run_failed",
    "run_cancelled",
];
const RESULT_STATUSES: [&str; 3] = ["completed", "failed", "waiting_approval"];

/// (playbook, compatible role, usable at runtime) — mirrors `AGENT_PLAYBOOKS`
/// (`runtimeEnabled && !operatorGuidanceOnly`).
const PLAYBOOKS: [(&str, Option<&str>, bool); 5] = [
    ("linkedin_writer", Some("drafter"), true),
    ("linkedin_humanizer", Some("auditor"), true),
    ("content_calendar", Some("scheduler"), true),
    ("linkedin_commenter", None, false),
    ("campaign_analyst", Some("analyst"), true),
];

fn default_playbook(role: &str) -> Option<&'static str> {
    match role {
        "drafter" => Some("linkedin_writer"),
        "auditor" => Some("linkedin_humanizer"),
        "scheduler" => Some("content_calendar"),
        "analyst" => Some("campaign_analyst"),
        _ => None,
    }
}

fn storage_error(_: sqlx::Error) -> String {
    STORAGE_ERROR.to_string()
}

fn positive(value: i64, label: &str) -> Result<(), String> {
    if value <= 0 {
        return Err(format!("{label} must be a positive integer"));
    }
    Ok(())
}

fn bounded(value: &str, max: usize, label: &str) -> Result<String, String> {
    let trimmed = js_trim(value);
    if utf16_len(trimmed) > max {
        return Err(format!("{label} must be at most {max} characters"));
    }
    Ok(trimmed.to_string())
}

fn one_of(value: &str, allowed: &[&str], label: &str) -> Result<(), String> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(format!("Unsupported {label}"))
    }
}

fn json_within(value: &Value, max: usize, label: &str) -> Result<String, String> {
    let text = value.to_string();
    if utf16_len(&text) > max {
        return Err(format!("{label} is too large"));
    }
    Ok(text)
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunMutationResult {
    pub id: i64,
}

// ------------------------------------------------------------- helpers ---

async fn insert_run_event(
    connection: &mut SqliteConnection,
    agent_run_id: i64,
    event_type: &str,
    summary: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO agent_run_events (agent_run_id, event_type, summary) VALUES (?1, ?2, ?3)",
    )
    .bind(agent_run_id)
    .bind(event_type)
    .bind(summary)
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?;
    Ok(())
}

struct SafetyAudit<'a> {
    campaign_id: Option<i64>,
    subject_type: &'a str,
    subject_id: Option<i64>,
    event_type: &'a str,
    severity: &'a str,
    summary: &'a str,
    metadata: Value,
}

async fn insert_safety_audit(
    connection: &mut SqliteConnection,
    audit: SafetyAudit<'_>,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO safety_audit_events
           (campaign_id, subject_type, subject_id, event_type, severity, summary, metadata_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(audit.campaign_id)
    .bind(audit.subject_type)
    .bind(audit.subject_id)
    .bind(audit.event_type)
    .bind(audit.severity)
    .bind(audit.summary)
    .bind(audit.metadata.to_string())
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?;
    Ok(())
}

/// Port of `upsertErrorQueueItem` for agent-run failures.
async fn upsert_agent_error(
    connection: &mut SqliteConnection,
    campaign_id: i64,
    agent_run_id: i64,
    detail: &str,
) -> Result<(), String> {
    const TITLE: &str = "Agent run failed";
    let existing: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM error_queue_items
         WHERE source_type = 'agent_run' AND source_id = ?1
           AND status IN ('open', 'in_progress', 'awaiting_review')
         LIMIT 1",
    )
    .bind(agent_run_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage_error)?;
    let (item_id, event_type, summary) = match existing {
        Some(id) => {
            sqlx::query(
                "UPDATE error_queue_items
                 SET campaign_id = ?1, title = ?2, detail = ?3, severity = 'error',
                     updated_at = datetime('now')
                 WHERE id = ?4",
            )
            .bind(campaign_id)
            .bind(TITLE)
            .bind(detail)
            .bind(id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            (
                id,
                "error_item_updated",
                format!("Error item updated: {TITLE}"),
            )
        }
        None => {
            let id = sqlx::query(
                "INSERT INTO error_queue_items
                   (campaign_id, source_type, source_id, title, detail, severity, status, updated_at)
                 VALUES (?1, 'agent_run', ?2, ?3, ?4, 'error', 'open', datetime('now'))",
            )
            .bind(campaign_id)
            .bind(agent_run_id)
            .bind(TITLE)
            .bind(detail)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?
            .last_insert_rowid();
            (
                id,
                "error_item_created",
                format!("Error item created: {TITLE}"),
            )
        }
    };
    insert_safety_audit(
        connection,
        SafetyAudit {
            campaign_id: Some(campaign_id),
            subject_type: "error_queue_item",
            subject_id: Some(item_id),
            event_type,
            severity: "warning",
            summary: &summary,
            metadata: json!({ "sourceType": "agent_run", "sourceId": agent_run_id }),
        },
    )
    .await
}

struct RunState {
    campaign_id: i64,
    campaign_status: String,
    status: String,
    agent_role: String,
    provider_key: String,
    output_summary: String,
    error_message: String,
}

async fn load_run(connection: &mut SqliteConnection, id: i64) -> Result<RunState, String> {
    let row = sqlx::query(
        "SELECT ar.campaign_id, ar.status, ar.agent_role, ar.provider_key, ar.output_summary,
                ar.error_message, c.status AS campaign_status
         FROM agent_runs ar INNER JOIN campaigns c ON c.id = ar.campaign_id
         WHERE ar.id = ?1 LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage_error)?
    .ok_or_else(|| "Agent run was not found".to_string())?;
    Ok(RunState {
        campaign_id: row.get("campaign_id"),
        campaign_status: row.get("campaign_status"),
        status: row.get("status"),
        agent_role: row.get("agent_role"),
        provider_key: row.get("provider_key"),
        output_summary: row.get("output_summary"),
        error_message: row.get("error_message"),
    })
}

// -------------------------------------------------------------- create ---

fn default_model_name() -> String {
    "dry-run-local".to_string()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateAgentRunInput {
    pub campaign_id: i64,
    #[serde(default)]
    pub workflow_run_id: Option<i64>,
    #[serde(default)]
    pub workflow_step_id: Option<i64>,
    pub agent_role: String,
    pub provider_key: String,
    #[serde(default = "default_model_name")]
    pub model_name: String,
    #[serde(default)]
    pub playbook_key: Option<String>,
    #[serde(default)]
    pub input_summary: String,
    #[serde(default)]
    pub input_context: Option<Value>,
}

fn validate_input_context(value: Option<&Value>) -> Result<String, String> {
    let context = value.cloned().unwrap_or_else(|| json!({}));
    let object = context
        .as_object()
        .ok_or_else(|| "Agent input context must be an object".to_string())?;
    for key in object.keys() {
        let length = utf16_len(js_trim(key));
        if length == 0 || length > 120 {
            return Err("Agent input context keys must be 1-120 characters".to_string());
        }
    }
    let text = context.to_string();
    if utf16_len(&text) > MAX_CONTEXT_JSON_UTF16 {
        return Err(format!(
            "Agent input context cannot exceed {MAX_CONTEXT_JSON_UTF16} characters"
        ));
    }
    Ok(text)
}

/// Port of `validateWorkflowOwnership`.
async fn workflow_ownership(
    connection: &mut SqliteConnection,
    campaign_id: i64,
    workflow_run_id: Option<i64>,
    workflow_step_id: Option<i64>,
) -> Result<(Option<i64>, Option<i64>), String> {
    let mut run_id = workflow_run_id;
    if let Some(id) = workflow_run_id {
        let owner: Option<i64> =
            sqlx::query_scalar("SELECT campaign_id FROM workflow_runs WHERE id = ?1")
                .bind(id)
                .fetch_optional(&mut *connection)
                .await
                .map_err(storage_error)?;
        match owner {
            None => return Err("Workflow run was not found".to_string()),
            Some(owner) if owner != campaign_id => {
                return Err("Workflow run belongs to a different campaign".to_string())
            }
            Some(_) => {}
        }
    }
    if let Some(step_id) = workflow_step_id {
        let row = sqlx::query(
            "SELECT ws.workflow_run_id, wr.campaign_id FROM workflow_steps ws
             INNER JOIN workflow_runs wr ON wr.id = ws.workflow_run_id
             WHERE ws.id = ?1 LIMIT 1",
        )
        .bind(step_id)
        .fetch_optional(&mut *connection)
        .await
        .map_err(storage_error)?
        .ok_or_else(|| "Workflow step was not found".to_string())?;
        if row.get::<i64, _>("campaign_id") != campaign_id {
            return Err("Workflow step belongs to a different campaign".to_string());
        }
        let step_run: i64 = row.get("workflow_run_id");
        if run_id.is_some_and(|id| id != step_run) {
            return Err("Workflow step belongs to a different workflow run".to_string());
        }
        run_id = Some(step_run);
    }
    Ok((run_id, workflow_step_id))
}

/// Port of `resolvePlaybookKeyForCreate`, including operator overrides.
async fn resolve_playbook(
    connection: &mut SqliteConnection,
    role: &str,
    requested: Option<&str>,
) -> Result<String, String> {
    let candidate = match requested {
        Some(key) => key.to_string(),
        None => default_playbook(role).unwrap_or_default().to_string(),
    };
    if candidate.is_empty() {
        return Ok(String::new());
    }
    let (key, compatible_role, runtime_usable) = PLAYBOOKS
        .iter()
        .copied()
        .find(|(key, _, _)| *key == candidate)
        .ok_or_else(|| "Playbook was not found".to_string())?;
    let override_enabled: Option<i64> =
        sqlx::query_scalar("SELECT enabled FROM agent_playbook_overrides WHERE playbook_key = ?1")
            .bind(key)
            .fetch_optional(&mut *connection)
            .await
            .map_err(storage_error)?;
    if !runtime_usable || override_enabled.is_some_and(|enabled| enabled != 1) {
        if requested.is_some() {
            return Err("Playbook is disabled".to_string());
        }
        return Ok(String::new());
    }
    if compatible_role != Some(role) {
        return Err("Playbook is not compatible with the selected agent role".to_string());
    }
    Ok(key.to_string())
}

pub(crate) async fn create_run(
    pool: &SqlitePool,
    input: CreateAgentRunInput,
) -> Result<AgentRunMutationResult, String> {
    positive(input.campaign_id, "Campaign id")?;
    if let Some(id) = input.workflow_run_id {
        positive(id, "Workflow run id")?;
    }
    if let Some(id) = input.workflow_step_id {
        positive(id, "Workflow step id")?;
    }
    one_of(&input.agent_role, &ROLES, "agent role")?;
    one_of(&input.provider_key, &PROVIDERS, "agent provider")?;
    let model_name = bounded(&input.model_name, 120, "Model name")?;
    let input_summary = bounded(&input.input_summary, MAX_SUMMARY_UTF16, "Input summary")?;
    let context_json = validate_input_context(input.input_context.as_ref())?;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let status: Option<String> =
                sqlx::query_scalar("SELECT status FROM campaigns WHERE id = ?1")
                    .bind(input.campaign_id)
                    .fetch_optional(&mut *connection)
                    .await
                    .map_err(storage_error)?;
            match status.as_deref() {
                None => return Err("Campaign was not found".to_string()),
                Some("archived") => return Err("Campaign is archived".to_string()),
                Some(_) => {}
            }
            let (workflow_run_id, workflow_step_id) = workflow_ownership(
                connection,
                input.campaign_id,
                input.workflow_run_id,
                input.workflow_step_id,
            )
            .await?;
            let playbook_key =
                resolve_playbook(connection, &input.agent_role, input.playbook_key.as_deref())
                    .await?;
            let id = sqlx::query(
                "INSERT INTO agent_runs (
                    campaign_id, workflow_run_id, workflow_step_id, agent_role, provider_key,
                    model_name, playbook_key, status, input_summary, input_context_json, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'queued', ?8, ?9, datetime('now'))",
            )
            .bind(input.campaign_id)
            .bind(workflow_run_id)
            .bind(workflow_step_id)
            .bind(&input.agent_role)
            .bind(&input.provider_key)
            .bind(&model_name)
            .bind(&playbook_key)
            .bind(&input_summary)
            .bind(&context_json)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?
            .last_insert_rowid();
            insert_run_event(
                connection,
                id,
                "run_created",
                &format!("Agent run created for {}.", input.agent_role),
            )
            .await?;
            Ok(Settlement::Accepted(AgentRunMutationResult { id }))
        })
    })
    .await
}

// --------------------------------------------------------------- start ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartAgentRunInput {
    pub id: i64,
    /// `false` for planner scorers, whose native scorer claims the run itself.
    pub claim: bool,
}

/// Start preflight (port of the checks in `startAgentRun`), the kill-switch
/// gate and, when `claim`, the running claim plus its safety audit. A
/// kill-switch block commits its durable audit while rejecting.
pub(crate) async fn start_run(
    pool: &SqlitePool,
    input: StartAgentRunInput,
) -> Result<AgentRunMutationResult, String> {
    positive(input.id, "Agent run id")?;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let run = load_run(connection, input.id).await?;
            if run.campaign_status == "archived" {
                return Err("Campaign is archived".to_string());
            }
            match run.status.as_str() {
                "completed" | "cancelled" => {
                    return Err("Terminal agent runs cannot be restarted".to_string())
                }
                "running" => return Err("Agent run is already running".to_string()),
                "waiting_approval" => return Err("Agent run is waiting for approval".to_string()),
                _ => {}
            }
            let has_checkpoint: Option<i64> = sqlx::query_scalar(
                "SELECT agent_run_id FROM agent_run_approval_checkpoints WHERE agent_run_id = ?1",
            )
            .bind(input.id)
            .fetch_optional(&mut *connection)
            .await
            .map_err(storage_error)?;
            if has_checkpoint.is_some() {
                return Err("Use approval continuation recovery for this agent run".to_string());
            }
            sqlx::query("INSERT OR IGNORE INTO safety_settings (id) VALUES (1)")
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
            let settings = sqlx::query(
                "SELECT global_kill_switch, kill_switch_reason FROM safety_settings WHERE id = 1",
            )
            .fetch_one(&mut *connection)
            .await
            .map_err(storage_error)?;
            if settings.get::<i64, _>("global_kill_switch") == 1 {
                let reason: String = settings.get("kill_switch_reason");
                insert_safety_audit(
                    connection,
                    SafetyAudit {
                        campaign_id: Some(run.campaign_id),
                        subject_type: "agent_run",
                        subject_id: Some(input.id),
                        event_type: "agent_run_failed",
                        severity: "block",
                        summary: "Agent run start blocked by global kill switch",
                        metadata: json!({ "reason": reason }),
                    },
                )
                .await?;
                return Ok(Settlement::Rejected(if reason.is_empty() {
                    "Global kill switch is enabled".to_string()
                } else {
                    format!("Global kill switch is enabled: {reason}")
                }));
            }
            if input.claim {
                let claimed = sqlx::query(
                    "UPDATE agent_runs
                     SET status = 'running', started_at = COALESCE(started_at, datetime('now')),
                         completed_at = NULL, error_message = '', updated_at = datetime('now')
                     WHERE id = ?1 AND status IN ('queued', 'failed')",
                )
                .bind(input.id)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
                if claimed.rows_affected() != 1 {
                    return Err("Agent run could not be claimed for start".to_string());
                }
                insert_safety_audit(
                    connection,
                    SafetyAudit {
                        campaign_id: Some(run.campaign_id),
                        subject_type: "agent_run",
                        subject_id: Some(input.id),
                        event_type: "agent_run_started",
                        severity: "info",
                        summary: "Agent run started",
                        metadata: json!({
                            "agentRole": run.agent_role,
                            "providerKey": run.provider_key,
                        }),
                    },
                )
                .await?;
            }
            Ok(Settlement::Accepted(AgentRunMutationResult {
                id: input.id,
            }))
        })
    })
    .await
}

// -------------------------------------------------------------- events ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecordAgentRunEventInput {
    pub agent_run_id: i64,
    pub event_type: String,
    pub summary: String,
}

pub(crate) async fn record_event(
    pool: &SqlitePool,
    input: RecordAgentRunEventInput,
) -> Result<AgentRunMutationResult, String> {
    positive(input.agent_run_id, "Agent run id")?;
    one_of(&input.event_type, &EVENT_TYPES, "agent run event type")?;
    let summary = bounded(&input.summary, MAX_SUMMARY_UTF16, "Event summary")?;
    if summary.is_empty() {
        return Err("Event summary is required".to_string());
    }
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            load_run(connection, input.agent_run_id).await?;
            insert_run_event(connection, input.agent_run_id, &input.event_type, &summary).await?;
            Ok(Settlement::Accepted(AgentRunMutationResult {
                id: input.agent_run_id,
            }))
        })
    })
    .await
}

// ------------------------------------------------------ persist result ---

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentLoopToolCall {
    #[serde(default)]
    pub provider_tool_call_id: String,
    pub tool_name: String,
    pub status: String,
    pub requires_approval: bool,
    pub input: Value,
    #[serde(default)]
    pub output: Option<Value>,
    #[serde(default)]
    pub error_message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentLoopResult {
    pub status: String,
    #[serde(default)]
    pub output_summary: String,
    #[serde(default)]
    pub error_message: String,
    pub iteration_count: i64,
    pub conversation: Value,
    pub tool_calls: Vec<AgentLoopToolCall>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistAgentResultInput {
    pub agent_run_id: i64,
    /// `true` when persisting an approved-continuation turn (resume).
    pub continuation: bool,
    pub result: AgentLoopResult,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PersistAgentResultOutput {
    pub checkpoint_phase: Option<String>,
}

struct ValidToolCall {
    provider_tool_call_id: String,
    tool_name: String,
    status: String,
    requires_approval: bool,
    input_json: String,
    output_json: String,
    error_message: String,
    input: Value,
}

struct ValidResult {
    status: String,
    output_summary: String,
    error_message: String,
    iteration_count: i64,
    conversation_json: String,
    tool_calls: Vec<ValidToolCall>,
}

fn validate_result(result: AgentLoopResult) -> Result<ValidResult, String> {
    one_of(&result.status, &RESULT_STATUSES, "agent result status")?;
    if !(0..=MAX_ITERATIONS).contains(&result.iteration_count) {
        return Err("Agent iteration count is out of range".to_string());
    }
    if result.tool_calls.len() > MAX_TOOL_CALLS {
        return Err("Agent result has too many tool calls".to_string());
    }
    validate_messages_with_tools(&result.conversation, &TOOLS)?;
    let conversation_json = json_within(
        &result.conversation,
        MAX_CONVERSATION_JSON_UTF16,
        "Agent conversation",
    )?;
    let mut tool_calls = Vec::with_capacity(result.tool_calls.len());
    for call in result.tool_calls {
        one_of(&call.tool_name, &TOOLS, "agent tool")?;
        one_of(&call.status, &TOOL_CALL_STATUSES, "agent tool call status")?;
        let output = call.output.unwrap_or_else(|| json!({}));
        tool_calls.push(ValidToolCall {
            provider_tool_call_id: bounded(
                &call.provider_tool_call_id,
                200,
                "Provider tool call id",
            )?,
            input_json: json_within(&call.input, MAX_TOOL_JSON_UTF16, "Tool input")?,
            output_json: json_within(&output, MAX_TOOL_JSON_UTF16, "Tool output")?,
            error_message: bounded(&call.error_message, MAX_SUMMARY_UTF16, "Tool error")?,
            tool_name: call.tool_name,
            status: call.status,
            requires_approval: call.requires_approval,
            input: call.input,
        });
    }
    Ok(ValidResult {
        output_summary: bounded(&result.output_summary, MAX_SUMMARY_UTF16, "Output summary")?,
        error_message: bounded(&result.error_message, MAX_SUMMARY_UTF16, "Error message")?,
        status: result.status,
        iteration_count: result.iteration_count,
        conversation_json,
        tool_calls,
    })
}

/// Port of `getPersistedCheckpointPhase`.
fn checkpoint_phase(result: &ValidResult, continuation: bool) -> Option<&'static str> {
    if result.status == "waiting_approval" {
        return Some("waiting_approval");
    }
    let retain = result.status == "failed"
        && result.tool_calls.is_empty()
        && !result.error_message.contains("maximum turn limit");
    (continuation && retain).then_some("continuation_ready")
}

/// Port of `validateApprovalInterrupt`: the one pending call must be a
/// `schedule_post` for this run's campaign and an approval it owns.
async fn approval_interrupt(
    connection: &mut SqliteConnection,
    campaign_id: i64,
    result: &ValidResult,
) -> Result<Option<i64>, String> {
    if result.status != "waiting_approval" {
        return Ok(None);
    }
    let waiting: Vec<&ValidToolCall> = result
        .tool_calls
        .iter()
        .filter(|call| call.status == "waiting_approval")
        .collect();
    let [pending] = waiting.as_slice() else {
        return Err("Approval interrupt must contain one pending tool call".to_string());
    };
    if pending.tool_name != "schedule_post" {
        return Err("Only schedule_post can create an approval checkpoint".to_string());
    }
    let requested_campaign = pending.input.get("campaignId").and_then(Value::as_i64);
    let approval_id = pending
        .input
        .get("approvalId")
        .and_then(Value::as_i64)
        .filter(|id| *id > 0)
        .ok_or_else(|| "Schedule request is missing its approval".to_string())?;
    if requested_campaign != Some(campaign_id) {
        return Err("Schedule request belongs to a different campaign".to_string());
    }
    let owner: i64 = sqlx::query_scalar("SELECT campaign_id FROM approvals WHERE id = ?1")
        .bind(approval_id)
        .fetch_optional(&mut *connection)
        .await
        .map_err(storage_error)?
        .ok_or_else(|| "Linked approval was not found".to_string())?;
    if owner != campaign_id {
        return Err("Linked approval belongs to a different campaign".to_string());
    }
    Ok(Some(approval_id))
}

/// Port of `persistAgentLoopResult`. Only a run that is still `running`
/// (claimed by start or by continuation settlement) can be finalized, so a
/// cancel issued during the loop is never overwritten.
pub(crate) async fn persist_result(
    pool: &SqlitePool,
    input: PersistAgentResultInput,
) -> Result<PersistAgentResultOutput, String> {
    positive(input.agent_run_id, "Agent run id")?;
    let result = validate_result(input.result)?;
    let run_id = input.agent_run_id;
    let continuation = input.continuation;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let run = load_run(connection, run_id).await?;
            if run.status != "running" {
                return Err("Agent run is no longer running".to_string());
            }
            if continuation {
                let active: i64 = sqlx::query_scalar(
                    "SELECT COUNT(*) FROM agent_run_approval_checkpoints
                     WHERE agent_run_id = ?1 AND phase = 'continuation_ready'",
                )
                .bind(run_id)
                .fetch_one(&mut *connection)
                .await
                .map_err(storage_error)?;
                if active != 1 {
                    return Err("Agent continuation checkpoint is no longer active".to_string());
                }
            }
            let approval_id = approval_interrupt(connection, run.campaign_id, &result).await?;
            let phase = checkpoint_phase(&result, continuation);

            let mut pending_tool_call_id = None;
            for call in &result.tool_calls {
                let id = sqlx::query(
                    "INSERT INTO agent_tool_calls (
                        agent_run_id, provider_tool_call_id, tool_name, status, requires_approval,
                        input_json, output_json, error_message, started_at, completed_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'),
                        CASE WHEN ?4 IN ('completed', 'failed', 'rejected') THEN datetime('now') ELSE NULL END)",
                )
                .bind(run_id)
                .bind(&call.provider_tool_call_id)
                .bind(&call.tool_name)
                .bind(&call.status)
                .bind(i64::from(call.requires_approval))
                .bind(&call.input_json)
                .bind(&call.output_json)
                .bind(&call.error_message)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?
                .last_insert_rowid();
                if call.status == "waiting_approval" {
                    pending_tool_call_id = Some(id);
                }
            }

            match phase {
                Some("waiting_approval") => {
                    let (Some(approval_id), Some(pending)) = (approval_id, pending_tool_call_id)
                    else {
                        return Err("Approval checkpoint is missing its pending tool call".to_string());
                    };
                    sqlx::query("DELETE FROM agent_run_approval_checkpoints WHERE agent_run_id = ?1")
                        .bind(run_id)
                        .execute(&mut *connection)
                        .await
                        .map_err(storage_error)?;
                    sqlx::query(
                        "INSERT INTO agent_run_approval_checkpoints (
                            agent_run_id, pending_tool_call_id, approval_id, phase, messages_json,
                            iteration_count, updated_at
                         ) VALUES (?1, ?2, ?3, 'waiting_approval', ?4, ?5, datetime('now'))",
                    )
                    .bind(run_id)
                    .bind(pending)
                    .bind(approval_id)
                    .bind(&result.conversation_json)
                    .bind(result.iteration_count)
                    .execute(&mut *connection)
                    .await
                    .map_err(storage_error)?;
                }
                Some(_) => {
                    let updated = sqlx::query(
                        "UPDATE agent_run_approval_checkpoints
                         SET phase = 'continuation_ready', messages_json = ?1, iteration_count = ?2,
                             updated_at = datetime('now')
                         WHERE agent_run_id = ?3",
                    )
                    .bind(&result.conversation_json)
                    .bind(result.iteration_count)
                    .bind(run_id)
                    .execute(&mut *connection)
                    .await
                    .map_err(storage_error)?;
                    if updated.rows_affected() != 1 {
                        return Err("Agent continuation checkpoint was lost".to_string());
                    }
                }
                None => {
                    sqlx::query("DELETE FROM agent_run_approval_checkpoints WHERE agent_run_id = ?1")
                        .bind(run_id)
                        .execute(&mut *connection)
                        .await
                        .map_err(storage_error)?;
                }
            }

            sqlx::query(
                "UPDATE agent_runs
                 SET status = ?1, output_summary = ?2, error_message = ?3, iteration_count = ?4,
                     completed_at = CASE WHEN ?1 IN ('completed', 'failed', 'cancelled') THEN datetime('now') ELSE NULL END,
                     updated_at = datetime('now')
                 WHERE id = ?5",
            )
            .bind(&result.status)
            .bind(&result.output_summary)
            .bind(&result.error_message)
            .bind(result.iteration_count)
            .bind(run_id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            reconcile_workflow_agent_run(
                connection,
                &ReconcileAgentRun {
                    agent_run_id: run_id,
                    status: &result.status,
                    output_summary: &result.output_summary,
                    error_message: &result.error_message,
                },
            )
            .await?;

            if result.status == "failed" {
                let summary = if result.error_message.is_empty() {
                    "Agent run failed"
                } else {
                    result.error_message.as_str()
                };
                insert_safety_audit(
                    connection,
                    SafetyAudit {
                        campaign_id: Some(run.campaign_id),
                        subject_type: "agent_run",
                        subject_id: Some(run_id),
                        event_type: "agent_run_failed",
                        severity: "warning",
                        summary,
                        metadata: json!({ "iterationCount": result.iteration_count }),
                    },
                )
                .await?;
                upsert_agent_error(connection, run.campaign_id, run_id, summary).await?;
            }
            Ok(Settlement::Accepted(PersistAgentResultOutput {
                checkpoint_phase: phase.map(str::to_string),
            }))
        })
    })
    .await
}

// ----------------------------------------------- fail after persistence ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FailAgentRunInput {
    pub agent_run_id: i64,
    pub error_message: String,
}

/// Port of `failAgentRunAfterPersistenceError`: marks a still-running run
/// failed with one `run_failed` event. A run that already left `running` is
/// left untouched.
pub(crate) async fn fail_after_persistence_error(
    pool: &SqlitePool,
    input: FailAgentRunInput,
) -> Result<AgentRunMutationResult, String> {
    positive(input.agent_run_id, "Agent run id")?;
    let message = js_trim(&input.error_message);
    let message = if message.is_empty() {
        "Agent result persistence failed".to_string()
    } else {
        utf16_prefix(message, MAX_SUMMARY_UTF16).to_string()
    };
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let failed = sqlx::query(
                "UPDATE agent_runs
                 SET status = 'failed', error_message = ?1, completed_at = datetime('now'),
                     updated_at = datetime('now')
                 WHERE id = ?2 AND status = 'running'",
            )
            .bind(&message)
            .bind(input.agent_run_id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            if failed.rows_affected() == 1 {
                insert_run_event(connection, input.agent_run_id, "run_failed", &message).await?;
            }
            Ok(Settlement::Accepted(AgentRunMutationResult {
                id: input.agent_run_id,
            }))
        })
    })
    .await
}

// -------------------------------------------------------------- cancel ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentRunIdInput {
    pub id: i64,
}

/// Port of `cancelAgentRun`.
pub(crate) async fn cancel_run(
    pool: &SqlitePool,
    input: AgentRunIdInput,
) -> Result<AgentRunMutationResult, String> {
    positive(input.id, "Agent run id")?;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let run = load_run(connection, input.id).await?;
            if run.campaign_status == "archived" {
                return Err("Campaign is archived".to_string());
            }
            if run.status == "completed" {
                return Err("Completed agent runs cannot be cancelled".to_string());
            }
            let error_message = if run.error_message.is_empty() {
                "Agent run cancelled".to_string()
            } else {
                run.error_message.clone()
            };
            sqlx::query(
                "UPDATE agent_runs
                 SET status = 'cancelled', error_message = ?1, completed_at = datetime('now'),
                     updated_at = datetime('now')
                 WHERE id = ?2",
            )
            .bind(&error_message)
            .bind(input.id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            reconcile_workflow_agent_run(
                connection,
                &ReconcileAgentRun {
                    agent_run_id: input.id,
                    status: "cancelled",
                    output_summary: &run.output_summary,
                    error_message: &error_message,
                },
            )
            .await?;
            sqlx::query("DELETE FROM agent_run_approval_checkpoints WHERE agent_run_id = ?1")
                .bind(input.id)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
            insert_run_event(connection, input.id, "run_cancelled", "Agent run cancelled").await?;
            Ok(Settlement::Accepted(AgentRunMutationResult {
                id: input.id,
            }))
        })
    })
    .await
}

// ------------------------------------------------------------ commands ---

#[tauri::command]
pub async fn linkgo_agent_run_create(
    pool: State<'_, SqlitePool>,
    input: CreateAgentRunInput,
) -> Result<AgentRunMutationResult, String> {
    create_run(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_agent_run_start(
    pool: State<'_, SqlitePool>,
    input: StartAgentRunInput,
) -> Result<AgentRunMutationResult, String> {
    start_run(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_agent_run_record_event(
    pool: State<'_, SqlitePool>,
    input: RecordAgentRunEventInput,
) -> Result<AgentRunMutationResult, String> {
    record_event(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_agent_run_persist_result(
    pool: State<'_, SqlitePool>,
    input: PersistAgentResultInput,
) -> Result<PersistAgentResultOutput, String> {
    persist_result(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_agent_run_fail_after_persistence_error(
    pool: State<'_, SqlitePool>,
    input: FailAgentRunInput,
) -> Result<AgentRunMutationResult, String> {
    fail_after_persistence_error(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_agent_run_cancel(
    pool: State<'_, SqlitePool>,
    input: AgentRunIdInput,
) -> Result<AgentRunMutationResult, String> {
    cancel_run(pool.inner(), input).await
}

#[cfg(test)]
#[path = "agent_run_store_tests.rs"]
mod tests;
