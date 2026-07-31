use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Row, SqliteConnection, SqlitePool};
use std::collections::HashSet;
use tauri::State;

const MAX_CONTEXT_BYTES: usize = 50_000;
const MAX_SUMMARY_BYTES: usize = 1_000;
const MAX_RATIONALE_CHARS: usize = 500;
const KILL_SWITCH_SCORE_ERROR_PREFIX: &str =
    "Global kill switch is enabled; candidate score application was blocked";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClaimRelevanceScoringInput {
    pub workflow_run_id: i64,
    pub provider_key: String,
    pub model_name: String,
    pub playbook_key: String,
    pub input_summary: String,
    pub input_context: Value,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RelevanceScoringClaimPayload {
    pub execution_id: i64,
    pub agent_run_id: i64,
    pub workflow_run_id: i64,
    pub workflow_step_id: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartRelevanceScorerInput {
    pub agent_run_id: i64,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RelevanceScoreInput {
    pub candidate_post_id: i64,
    pub score: i64,
    pub rationale: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApplyRelevanceScoresInput {
    pub agent_run_id: i64,
    pub campaign_id: i64,
    pub candidate_post_ids: Vec<i64>,
    pub minimum_score: i64,
    pub auto_reject_below_minimum: bool,
    pub scores: Vec<RelevanceScoreInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SettleRelevanceScoringInput {
    pub workflow_run_id: i64,
    pub outcome: String,
    pub summary: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FailRelevanceScoringInput {
    pub execution_id: i64,
    pub workflow_run_id: i64,
    pub workflow_step_id: i64,
    pub error_summary: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReconcileScorerToolCallInput {
    pub provider_tool_call_id: String,
    pub tool_name: String,
    pub status: String,
    pub requires_approval: bool,
    pub input: Value,
    pub output: Value,
    pub error_message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReconcileRelevanceScorerInput {
    pub agent_run_id: i64,
    pub status: String,
    pub output_summary: String,
    pub error_message: String,
    pub iteration_count: i64,
    pub tool_calls: Vec<ReconcileScorerToolCallInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FailRelevanceScorerAgentInput {
    pub agent_run_id: i64,
    pub error_summary: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScoringContext {
    campaign: ScoringContextCampaign,
    source_batch_id: i64,
    autopilot_plan_id: i64,
    workflow_run_id: i64,
    workflow_step_id: i64,
    minimum_score: i64,
    auto_reject_below_minimum: bool,
    candidates: Vec<ScoringContextCandidate>,
}

#[derive(Debug, Deserialize)]
struct ScoringContextCampaign {
    id: i64,
}

#[derive(Debug, Deserialize)]
struct ScoringContextCandidate {
    id: i64,
}

#[derive(Debug)]
struct PlannerScopeHeader {
    workflow_run_id: i64,
    workflow_step_id: i64,
    score_step_status: String,
    campaign_id: i64,
    autopilot_plan_id: i64,
    source_import_batch_id: i64,
}

#[derive(Debug)]
struct PlannerScope {
    header: PlannerScopeHeader,
    unscored_candidate_ids: Vec<i64>,
}

#[derive(Debug)]
struct ScorerRunLink {
    agent_run_id: i64,
    campaign_id: i64,
    workflow_run_id: i64,
    workflow_step_id: i64,
    execution_id: i64,
    status: String,
    error_message: String,
}

enum ApplyScoresOutcome {
    Applied(Vec<RelevanceScoreInput>),
    Blocked(String),
}

fn db_error(message: &str) -> impl FnOnce(sqlx::Error) -> String + '_ {
    move |_| message.to_string()
}

async fn begin_immediate(
    pool: &SqlitePool,
    label: &str,
) -> Result<sqlx::pool::PoolConnection<sqlx::Sqlite>, String> {
    let mut connection = pool
        .acquire()
        .await
        .map_err(|_| format!("Could not open {label} transaction"))?;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *connection)
        .await
        .map_err(|_| format!("Could not start {label} transaction"))?;
    Ok(connection)
}

async fn finish_transaction<T>(
    connection: &mut SqliteConnection,
    result: Result<T, String>,
    label: &str,
) -> Result<T, String> {
    match result {
        Ok(value) => {
            sqlx::query("COMMIT")
                .execute(&mut *connection)
                .await
                .map_err(|_| format!("Could not commit {label} transaction"))?;
            Ok(value)
        }
        Err(error) => {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            Err(error)
        }
    }
}

fn bounded_summary(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    let source = if trimmed.is_empty() {
        fallback
    } else {
        trimmed
    };
    source.chars().take(MAX_SUMMARY_BYTES).collect()
}

fn compact_rationale(value: &str) -> Result<String, String> {
    let compact = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.is_empty() {
        return Err("Score rationale is required".to_string());
    }
    Ok(compact.chars().take(MAX_RATIONALE_CHARS).collect())
}

fn validate_provider_key(provider_key: &str) -> Result<(), String> {
    if provider_key == "dry_run" {
        return Err("Planner scoring requires a connected model provider".to_string());
    }
    if matches!(
        provider_key,
        "openai"
            | "anthropic"
            | "xiaomi"
            | "gemini"
            | "glm"
            | "moonshot"
            | "deepseek"
            | "openrouter"
            | "sakana"
            | "minimax"
            | "custom"
    ) {
        Ok(())
    } else {
        Err("Unsupported scorer provider".to_string())
    }
}

async fn load_planner_scope(
    connection: &mut SqliteConnection,
    workflow_run_id: i64,
) -> Result<PlannerScope, String> {
    let row = sqlx::query(
        "SELECT
            wr.id AS workflow_run_id,
            wr.status AS workflow_status,
            wr.current_step_key,
            ws.id AS workflow_step_id,
            ws.status AS score_step_status,
            c.id AS campaign_id,
            c.status AS campaign_status,
            ap.id AS autopilot_plan_id,
            ap.status AS plan_status,
            ap.source_import_batch_id,
            sib.campaign_id AS source_campaign_id
         FROM workflow_runs wr
         INNER JOIN campaigns c ON c.id = wr.campaign_id
         INNER JOIN workflow_steps ws
            ON ws.workflow_run_id = wr.id AND ws.step_key = 'score'
         INNER JOIN autopilot_plans ap ON ap.workflow_run_id = wr.id
         INNER JOIN source_import_batches sib ON sib.id = ap.source_import_batch_id
         WHERE wr.id = ?1
         LIMIT 1",
    )
    .bind(workflow_run_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(db_error("Could not load planner scoring workflow scope"))?
    .ok_or_else(|| "Planner scoring workflow scope was not found".to_string())?;

    let campaign_id: i64 = row.try_get("campaign_id").unwrap_or_default();
    let source_campaign_id: i64 = row.try_get("source_campaign_id").unwrap_or_default();
    let workflow_status: String = row.try_get("workflow_status").unwrap_or_default();
    let current_step_key: String = row.try_get("current_step_key").unwrap_or_default();
    let score_step_status: String = row.try_get("score_step_status").unwrap_or_default();
    let plan_status: String = row.try_get("plan_status").unwrap_or_default();
    let campaign_status: String = row.try_get("campaign_status").unwrap_or_default();
    if plan_status != "planned" {
        return Err("Autopilot plan is not available for scoring".to_string());
    }
    if source_campaign_id != campaign_id {
        return Err("Source batch belongs to a different campaign".to_string());
    }
    if campaign_status == "archived" {
        return Err("Campaign is archived".to_string());
    }
    if workflow_status == "cancelled" {
        return Err("Workflow is cancelled".to_string());
    }
    if current_step_key != "score" && score_step_status != "completed" {
        return Err("Workflow score step is not runnable".to_string());
    }

    let header = PlannerScopeHeader {
        workflow_run_id: row.try_get("workflow_run_id").unwrap_or_default(),
        workflow_step_id: row.try_get("workflow_step_id").unwrap_or_default(),
        score_step_status,
        campaign_id,
        autopilot_plan_id: row.try_get("autopilot_plan_id").unwrap_or_default(),
        source_import_batch_id: row.try_get("source_import_batch_id").unwrap_or_default(),
    };
    let artifacts = sqlx::query(
        "SELECT
            wa.artifact_id,
            wa.workflow_step_id,
            cp.id AS candidate_id,
            cp.campaign_id AS candidate_campaign_id,
            cp.status AS candidate_status,
            cp.relevance_score
         FROM workflow_artifacts wa
         LEFT JOIN candidate_posts cp
            ON wa.artifact_type = 'candidate_post' AND cp.id = wa.artifact_id
         WHERE wa.workflow_run_id = ?1
           AND wa.artifact_type = 'candidate_post'
         ORDER BY wa.id ASC, wa.artifact_id ASC",
    )
    .bind(workflow_run_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(db_error("Could not load planner scoring candidates"))?;
    if artifacts.is_empty() {
        return Err("No candidate scope is attached to this score step".to_string());
    }

    let mut unscored_candidate_ids = Vec::new();
    for artifact in &artifacts {
        let artifact_step_id: Option<i64> = artifact.try_get("workflow_step_id").unwrap_or(None);
        if artifact_step_id != Some(header.workflow_step_id) {
            return Err("Candidate scope is attached to a different workflow step".to_string());
        }
        let candidate_id: Option<i64> = artifact.try_get("candidate_id").unwrap_or(None);
        let Some(candidate_id) = candidate_id else {
            continue;
        };
        let candidate_campaign_id: Option<i64> =
            artifact.try_get("candidate_campaign_id").unwrap_or(None);
        if candidate_campaign_id != Some(header.campaign_id) {
            return Err("Candidate scope contains a cross-campaign artifact".to_string());
        }
        let status: Option<String> = artifact.try_get("candidate_status").unwrap_or(None);
        let relevance_score: Option<i64> = artifact.try_get("relevance_score").unwrap_or(None);
        if status.as_deref() == Some("new") && relevance_score.is_none() {
            unscored_candidate_ids.push(candidate_id);
        }
    }

    Ok(PlannerScope {
        header,
        unscored_candidate_ids,
    })
}

fn parse_context(value: &Value) -> Result<(ScoringContext, String), String> {
    let serialized = serde_json::to_string(value)
        .map_err(|_| "Scorer input context must be valid JSON".to_string())?;
    if serialized.len() > MAX_CONTEXT_BYTES {
        return Err("Scorer input context is too large".to_string());
    }
    let context = serde_json::from_value::<ScoringContext>(value.clone())
        .map_err(|_| "Scorer input context is invalid".to_string())?;
    Ok((context, serialized))
}

fn exact_id_set(left: &[i64], right: &[i64]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let left_set = left.iter().copied().collect::<HashSet<_>>();
    let right_set = right.iter().copied().collect::<HashSet<_>>();
    left_set.len() == left.len() && right_set.len() == right.len() && left_set == right_set
}

async fn sync_backlog(
    connection: &mut SqliteConnection,
    workflow_run_id: i64,
    step_status: &str,
) -> Result<(), String> {
    let backlog_status = match step_status {
        "pending" => "pending",
        "running" | "waiting_approval" => "in_progress",
        "completed" => "completed",
        "skipped" => "cancelled",
        _ => "blocked",
    };
    sqlx::query(
        "UPDATE campaign_backlog_items
            SET status = ?1,
                completed_at = CASE
                    WHEN ?1 = 'completed' THEN COALESCE(completed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                    ELSE NULL
                END,
                cancelled_at = CASE
                    WHEN ?1 = 'cancelled' THEN COALESCE(cancelled_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                    ELSE NULL
                END,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = (
                SELECT campaign_backlog_item_id
                  FROM autopilot_plans
                 WHERE workflow_run_id = ?2 AND status = 'planned'
                 LIMIT 1
          )
            AND owner_type = 'linkgo'
            AND work_type = 'scoring'
            AND recurrence = 'none'
            AND status NOT IN ('completed', 'cancelled')",
    )
    .bind(backlog_status)
    .bind(workflow_run_id)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not reconcile planner scoring backlog"))?;
    Ok(())
}

async fn insert_workflow_event(
    connection: &mut SqliteConnection,
    workflow_run_id: i64,
    workflow_step_id: i64,
    event_type: &str,
    summary: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO workflow_events (workflow_run_id, workflow_step_id, event_type, summary)
         VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(workflow_run_id)
    .bind(workflow_step_id)
    .bind(event_type)
    .bind(summary)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not record planner scoring workflow event"))?;
    Ok(())
}

async fn claim_on_connection(
    connection: &mut SqliteConnection,
    input: ClaimRelevanceScoringInput,
) -> Result<RelevanceScoringClaimPayload, String> {
    validate_provider_key(&input.provider_key)?;
    if input.model_name.trim().is_empty() || input.model_name.chars().count() > 120 {
        return Err("Scorer model name is invalid".to_string());
    }
    if input.input_summary.chars().count() > MAX_SUMMARY_BYTES {
        return Err("Scorer input summary is too large".to_string());
    }
    let scope = load_planner_scope(connection, input.workflow_run_id).await?;
    if scope.unscored_candidate_ids.is_empty() {
        return Err("No unscored candidates remain to claim".to_string());
    }
    if !matches!(
        scope.header.score_step_status.as_str(),
        "pending" | "blocked" | "failed"
    ) {
        return Err("Workflow score step is already active or complete".to_string());
    }
    let (context, input_context_json) = parse_context(&input.input_context)?;
    let context_ids = context
        .candidates
        .iter()
        .map(|candidate| candidate.id)
        .collect::<Vec<_>>();
    if context.campaign.id != scope.header.campaign_id
        || context.source_batch_id != scope.header.source_import_batch_id
        || context.autopilot_plan_id != scope.header.autopilot_plan_id
        || context.workflow_run_id != scope.header.workflow_run_id
        || context.workflow_step_id != scope.header.workflow_step_id
        || !exact_id_set(&context_ids, &scope.unscored_candidate_ids)
    {
        return Err("Scorer context does not match the current planner scope".to_string());
    }

    let active_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM workflow_step_executions
          WHERE workflow_step_id = ?1
            AND status IN ('claimed', 'running', 'waiting_approval')",
    )
    .bind(scope.header.workflow_step_id)
    .fetch_one(&mut *connection)
    .await
    .map_err(db_error("Could not check active scorer executions"))?;
    if active_count > 0 {
        return Err("Workflow score execution is already active".to_string());
    }

    let step_update = sqlx::query(
        "UPDATE workflow_steps
            SET status = 'running', error_message = '', completed_at = NULL,
                started_at = COALESCE(started_at, datetime('now')),
                updated_at = datetime('now')
          WHERE id = ?1 AND status IN ('pending', 'blocked', 'failed')",
    )
    .bind(scope.header.workflow_step_id)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not claim workflow score step"))?;
    if step_update.rows_affected() != 1 {
        return Err("Workflow score step could not be claimed".to_string());
    }
    let run_update = sqlx::query(
        "UPDATE workflow_runs
            SET status = 'running', current_step_key = 'score', completed_at = NULL,
                started_at = COALESCE(started_at, datetime('now')),
                updated_at = datetime('now')
          WHERE id = ?1 AND status <> 'cancelled'",
    )
    .bind(input.workflow_run_id)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not project scorer claim to workflow"))?;
    if run_update.rows_affected() != 1 {
        return Err("Workflow score run could not be claimed".to_string());
    }

    let next_attempt: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(attempt_count), 0) + 1
           FROM workflow_step_executions WHERE workflow_step_id = ?1",
    )
    .bind(scope.header.workflow_step_id)
    .fetch_one(&mut *connection)
    .await
    .map_err(db_error("Could not allocate scorer attempt"))?;
    let execution_id = sqlx::query(
        "INSERT INTO workflow_step_executions
            (workflow_step_id, executor_role, attempt_count, status, updated_at)
         VALUES (?1, 'scorer', ?2, 'claimed', datetime('now'))",
    )
    .bind(scope.header.workflow_step_id)
    .bind(next_attempt)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not create scorer execution"))?
    .last_insert_rowid();

    let agent_run_id = sqlx::query(
        "INSERT INTO agent_runs (
            campaign_id, workflow_run_id, workflow_step_id, agent_role,
            provider_key, model_name, playbook_key, status, input_summary,
            input_context_json, updated_at
         ) VALUES (?1, ?2, ?3, 'scorer', ?4, ?5, ?6, 'queued', ?7, ?8, datetime('now'))",
    )
    .bind(scope.header.campaign_id)
    .bind(input.workflow_run_id)
    .bind(scope.header.workflow_step_id)
    .bind(input.provider_key.trim())
    .bind(input.model_name.trim())
    .bind(input.playbook_key.trim())
    .bind(input.input_summary.trim())
    .bind(input_context_json)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not create planner scorer run"))?
    .last_insert_rowid();

    sqlx::query(
        "INSERT INTO agent_run_events (agent_run_id, event_type, summary)
         VALUES (?1, 'run_created', 'Agent run created for scorer.')",
    )
    .bind(agent_run_id)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not record planner scorer creation"))?;
    sqlx::query(
        "INSERT INTO workflow_artifacts (
            workflow_run_id, workflow_step_id, artifact_type, artifact_id, summary, updated_at
         ) VALUES (?1, ?2, 'agent_run', ?3, ?4, datetime('now'))",
    )
    .bind(input.workflow_run_id)
    .bind(scope.header.workflow_step_id)
    .bind(agent_run_id)
    .bind(format!(
        "Scorer run for {} attached candidates",
        context_ids.len()
    ))
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not attach planner scorer artifact"))?;
    sqlx::query(
        "UPDATE workflow_step_executions
            SET agent_run_id = ?1, updated_at = datetime('now')
          WHERE id = ?2 AND workflow_step_id = ?3 AND status = 'claimed'",
    )
    .bind(agent_run_id)
    .bind(execution_id)
    .bind(scope.header.workflow_step_id)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not attach planner scorer execution"))?;

    let event_type = if scope.header.score_step_status == "pending" {
        "step_started"
    } else {
        "step_resumed"
    };
    let event_summary = if event_type == "step_started" {
        "Score relevance started"
    } else {
        "Score relevance resumed"
    };
    insert_workflow_event(
        connection,
        input.workflow_run_id,
        scope.header.workflow_step_id,
        event_type,
        event_summary,
    )
    .await?;
    sync_backlog(connection, input.workflow_run_id, "running").await?;

    Ok(RelevanceScoringClaimPayload {
        execution_id,
        agent_run_id,
        workflow_run_id: input.workflow_run_id,
        workflow_step_id: scope.header.workflow_step_id,
    })
}

pub(crate) async fn claim_with_pool(
    pool: &SqlitePool,
    input: ClaimRelevanceScoringInput,
) -> Result<RelevanceScoringClaimPayload, String> {
    let mut connection = begin_immediate(pool, "planner scoring claim").await?;
    let result = claim_on_connection(&mut connection, input).await;
    finish_transaction(&mut connection, result, "planner scoring claim").await
}

async fn load_scorer_run_link(
    connection: &mut SqliteConnection,
    agent_run_id: i64,
) -> Result<ScorerRunLink, String> {
    let row = sqlx::query(
        "SELECT
            ar.id AS agent_run_id,
            ar.campaign_id,
            ar.workflow_run_id,
            ar.workflow_step_id,
            ar.status,
            ar.error_message,
            ar.input_context_json,
            wse.id AS execution_id,
            c.status AS campaign_status,
            ws.step_key,
            ap.status AS plan_status
         FROM agent_runs ar
         INNER JOIN campaigns c ON c.id = ar.campaign_id
         INNER JOIN workflow_steps ws ON ws.id = ar.workflow_step_id
         INNER JOIN autopilot_plans ap ON ap.workflow_run_id = ar.workflow_run_id
         INNER JOIN workflow_step_executions wse
            ON wse.agent_run_id = ar.id AND wse.workflow_step_id = ar.workflow_step_id
         WHERE ar.id = ?1 AND ar.agent_role = 'scorer'
         LIMIT 1",
    )
    .bind(agent_run_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(db_error("Could not load planner scorer run"))?
    .ok_or_else(|| "Planner scorer run was not found".to_string())?;
    if row
        .try_get::<String, _>("campaign_status")
        .unwrap_or_default()
        == "archived"
    {
        return Err("Campaign is archived".to_string());
    }
    if row.try_get::<String, _>("step_key").unwrap_or_default() != "score"
        || row.try_get::<String, _>("plan_status").unwrap_or_default() != "planned"
    {
        return Err("Agent run is not linked to planner scoring".to_string());
    }
    Ok(ScorerRunLink {
        agent_run_id: row.try_get("agent_run_id").unwrap_or_default(),
        campaign_id: row.try_get("campaign_id").unwrap_or_default(),
        workflow_run_id: row
            .try_get::<Option<i64>, _>("workflow_run_id")
            .unwrap_or(None)
            .unwrap_or_default(),
        workflow_step_id: row
            .try_get::<Option<i64>, _>("workflow_step_id")
            .unwrap_or(None)
            .unwrap_or_default(),
        execution_id: row.try_get("execution_id").unwrap_or_default(),
        status: row.try_get("status").unwrap_or_default(),
        error_message: row.try_get("error_message").unwrap_or_default(),
    })
}

async fn start_scorer_on_connection(
    connection: &mut SqliteConnection,
    agent_run_id: i64,
) -> Result<(), String> {
    let link = load_scorer_run_link(connection, agent_run_id).await?;
    if link.status != "queued" {
        return Err("Planner scorer run could not be claimed for start".to_string());
    }
    let kill_switch: i64 =
        sqlx::query_scalar("SELECT global_kill_switch FROM safety_settings WHERE id = 1")
            .fetch_optional(&mut *connection)
            .await
            .map_err(db_error("Could not read safety settings"))?
            .unwrap_or(0);
    if kill_switch == 1 {
        return Err("Global kill switch is enabled".to_string());
    }
    let update = sqlx::query(
        "UPDATE agent_runs
            SET status = 'running', started_at = COALESCE(started_at, datetime('now')),
                completed_at = NULL, error_message = '', updated_at = datetime('now')
          WHERE id = ?1 AND status = 'queued'",
    )
    .bind(agent_run_id)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not start planner scorer run"))?;
    if update.rows_affected() != 1 {
        return Err("Planner scorer run could not be claimed for start".to_string());
    }
    sqlx::query(
        "UPDATE workflow_step_executions
            SET status = 'running', updated_at = datetime('now')
          WHERE id = ?1 AND agent_run_id = ?2 AND status = 'claimed'",
    )
    .bind(link.execution_id)
    .bind(agent_run_id)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not start planner scorer execution"))?;
    sqlx::query(
        "INSERT INTO safety_audit_events (
            campaign_id, subject_type, subject_id, event_type, severity, summary, metadata_json
         ) VALUES (?1, 'agent_run', ?2, 'agent_run_started', 'info', 'Agent run started', ?3)",
    )
    .bind(link.campaign_id)
    .bind(agent_run_id)
    .bind("{\"agentRole\":\"scorer\"}")
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not record planner scorer safety event"))?;
    Ok(())
}

pub(crate) async fn start_with_pool(pool: &SqlitePool, agent_run_id: i64) -> Result<(), String> {
    let mut connection = begin_immediate(pool, "planner scorer start").await?;
    let result = start_scorer_on_connection(&mut connection, agent_run_id).await;
    finish_transaction(&mut connection, result, "planner scorer start").await
}

fn kill_switch_score_error(reason: &str) -> String {
    let compact_reason = reason.split_whitespace().collect::<Vec<_>>().join(" ");
    let summary = if compact_reason.is_empty() {
        KILL_SWITCH_SCORE_ERROR_PREFIX.to_string()
    } else {
        format!("{KILL_SWITCH_SCORE_ERROR_PREFIX}: {compact_reason}")
    };
    bounded_summary(&summary, KILL_SWITCH_SCORE_ERROR_PREFIX)
}

async fn block_score_application_for_kill_switch(
    connection: &mut SqliteConnection,
    link: &ScorerRunLink,
    reason: &str,
) -> Result<String, String> {
    let summary = kill_switch_score_error(reason);
    let metadata = serde_json::to_string(&serde_json::json!({
        "boundary": "relevance_score_application",
        "reason": reason.chars().take(MAX_SUMMARY_BYTES).collect::<String>(),
    }))
    .map_err(|_| "Could not serialize score safety evidence".to_string())?;

    let run_update = sqlx::query(
        "UPDATE agent_runs
            SET status = 'failed', output_summary = '', error_message = ?1,
                completed_at = COALESCE(completed_at, datetime('now')),
                updated_at = datetime('now')
          WHERE id = ?2 AND status = 'running'",
    )
    .bind(&summary)
    .bind(link.agent_run_id)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not block planner scorer run"))?;
    if run_update.rows_affected() != 1 {
        return Err("Planner scorer run is no longer active".to_string());
    }
    sqlx::query(
        "UPDATE workflow_step_executions
            SET status = 'blocked', error_summary = ?1,
                completed_at = COALESCE(completed_at, datetime('now')),
                updated_at = datetime('now')
          WHERE id = ?2 AND agent_run_id = ?3 AND status = 'running'",
    )
    .bind(&summary)
    .bind(link.execution_id)
    .bind(link.agent_run_id)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not block planner scorer execution"))?;
    sqlx::query(
        "UPDATE workflow_steps
            SET status = 'blocked', output_summary = '', error_message = ?1,
                completed_at = NULL, updated_at = datetime('now')
          WHERE id = ?2 AND status = 'running'",
    )
    .bind(&summary)
    .bind(link.workflow_step_id)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not block workflow score step"))?;
    sqlx::query(
        "UPDATE workflow_runs
            SET status = 'blocked', current_step_key = 'score', completed_at = NULL,
                updated_at = datetime('now')
          WHERE id = ?1 AND status <> 'cancelled'",
    )
    .bind(link.workflow_run_id)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not block workflow score run"))?;
    sync_backlog(connection, link.workflow_run_id, "blocked").await?;
    insert_workflow_event(
        connection,
        link.workflow_run_id,
        link.workflow_step_id,
        "step_blocked",
        &summary,
    )
    .await?;
    sqlx::query(
        "INSERT INTO agent_run_events (agent_run_id, event_type, summary)
         VALUES (?1, 'run_failed', ?2)",
    )
    .bind(link.agent_run_id)
    .bind(&summary)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not record blocked planner scorer run"))?;
    sqlx::query(
        "INSERT INTO safety_audit_events (
            campaign_id, subject_type, subject_id, event_type, severity, summary, metadata_json
         ) VALUES (?1, 'agent_run', ?2, 'agent_run_failed', 'block', ?3, ?4)",
    )
    .bind(link.campaign_id)
    .bind(link.agent_run_id)
    .bind(&summary)
    .bind(metadata)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not record score kill-switch evidence"))?;

    Ok(summary)
}

async fn apply_scores_on_connection(
    connection: &mut SqliteConnection,
    input: ApplyRelevanceScoresInput,
) -> Result<ApplyScoresOutcome, String> {
    if input.candidate_post_ids.is_empty() || input.candidate_post_ids.len() > 50 {
        return Err("Scoring scope must contain 1 to 50 candidates".to_string());
    }
    if !(0..=100).contains(&input.minimum_score) {
        return Err("Minimum score is invalid".to_string());
    }
    let run = sqlx::query(
        "SELECT ar.campaign_id, ar.workflow_run_id, ar.workflow_step_id, ar.status,
                ar.input_context_json, c.status AS campaign_status,
                EXISTS(
                    SELECT 1 FROM autopilot_plans ap
                     WHERE ap.workflow_run_id = ar.workflow_run_id AND ap.status = 'planned'
                ) AS planner_linked
           FROM agent_runs ar
           INNER JOIN campaigns c ON c.id = ar.campaign_id
          WHERE ar.id = ?1 AND ar.agent_role = 'scorer'
          LIMIT 1",
    )
    .bind(input.agent_run_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(db_error("Could not load scorer run"))?
    .ok_or_else(|| "Scorer run was not found".to_string())?;
    let run_campaign_id: i64 = run.try_get("campaign_id").unwrap_or_default();
    let run_status: String = run.try_get("status").unwrap_or_default();
    let campaign_status: String = run.try_get("campaign_status").unwrap_or_default();
    if run_status != "running" || run_campaign_id != input.campaign_id {
        return Err("Score request belongs to a different campaign".to_string());
    }
    if campaign_status == "archived" {
        return Err("Campaign is archived".to_string());
    }

    let safety_row = sqlx::query(
        "SELECT global_kill_switch, kill_switch_reason
           FROM safety_settings WHERE id = 1 LIMIT 1",
    )
    .fetch_optional(&mut *connection)
    .await
    .map_err(db_error("Could not read safety settings"))?;
    if safety_row
        .as_ref()
        .and_then(|row| row.try_get::<i64, _>("global_kill_switch").ok())
        == Some(1)
    {
        let reason = safety_row
            .as_ref()
            .and_then(|row| row.try_get::<String, _>("kill_switch_reason").ok())
            .unwrap_or_default();
        let link = load_scorer_run_link(connection, input.agent_run_id).await?;
        let summary = block_score_application_for_kill_switch(connection, &link, &reason).await?;
        return Ok(ApplyScoresOutcome::Blocked(summary));
    }
    let score_ids = input
        .scores
        .iter()
        .map(|score| score.candidate_post_id)
        .collect::<Vec<_>>();
    if !exact_id_set(&input.candidate_post_ids, &score_ids) {
        return Err(
            "Score entries must match the requested candidate post IDs exactly".to_string(),
        );
    }
    let input_context_json: String = run
        .try_get("input_context_json")
        .unwrap_or_else(|_| "{}".to_string());
    let planner_linked = run.try_get::<i64, _>("planner_linked").unwrap_or(0) == 1;
    let stored_context = serde_json::from_str::<ScoringContext>(&input_context_json);
    if planner_linked && stored_context.is_err() {
        return Err("Stored planner scorer context is invalid".to_string());
    }
    if let Ok(context) = stored_context {
        let context_ids = context
            .candidates
            .iter()
            .map(|candidate| candidate.id)
            .collect::<Vec<_>>();
        let workflow_run_id: Option<i64> = run.try_get("workflow_run_id").unwrap_or(None);
        let workflow_step_id: Option<i64> = run.try_get("workflow_step_id").unwrap_or(None);
        if context.campaign.id != input.campaign_id
            || Some(context.workflow_run_id) != workflow_run_id
            || Some(context.workflow_step_id) != workflow_step_id
            || context.minimum_score != input.minimum_score
            || context.auto_reject_below_minimum != input.auto_reject_below_minimum
            || !exact_id_set(&context_ids, &input.candidate_post_ids)
        {
            return Err("Score request does not match the attached workflow scope".to_string());
        }
    }
    if input
        .scores
        .iter()
        .any(|score| !(0..=100).contains(&score.score))
    {
        return Err("Candidate relevance score is invalid".to_string());
    }

    for candidate_id in &input.candidate_post_ids {
        let row = sqlx::query(
            "SELECT campaign_id, status, relevance_score FROM candidate_posts WHERE id = ?1 LIMIT 1",
        )
        .bind(candidate_id)
        .fetch_optional(&mut *connection)
        .await
        .map_err(db_error("Could not validate scoring candidate"))?
        .ok_or_else(|| "Scoring scope contains a missing or foreign candidate".to_string())?;
        let campaign_id: i64 = row.try_get("campaign_id").unwrap_or_default();
        let status: String = row.try_get("status").unwrap_or_default();
        let relevance_score: Option<i64> = row.try_get("relevance_score").unwrap_or(None);
        if campaign_id != input.campaign_id {
            return Err("Scoring scope contains a missing or foreign candidate".to_string());
        }
        if status != "new" || relevance_score.is_some() {
            return Err(format!(
                "Candidate #{candidate_id} changed before scores were committed"
            ));
        }
    }

    let mut applied_scores = Vec::with_capacity(input.scores.len());
    for score in input.scores {
        let rationale = compact_rationale(&score.rationale)?;
        let update = sqlx::query(
            "UPDATE candidate_posts
                SET relevance_score = ?1,
                    score_reason = ?2,
                    status = CASE WHEN ?3 = 1 AND ?1 < ?4 THEN 'rejected' ELSE status END,
                    updated_at = datetime('now')
              WHERE id = ?5 AND campaign_id = ?6 AND status = 'new' AND relevance_score IS NULL",
        )
        .bind(score.score)
        .bind(&rationale)
        .bind(if input.auto_reject_below_minimum {
            1
        } else {
            0
        })
        .bind(input.minimum_score)
        .bind(score.candidate_post_id)
        .bind(input.campaign_id)
        .execute(&mut *connection)
        .await
        .map_err(db_error("Could not apply candidate relevance score"))?;
        if update.rows_affected() != 1 {
            return Err(format!(
                "Candidate #{} changed before scores were committed",
                score.candidate_post_id
            ));
        }
        applied_scores.push(RelevanceScoreInput {
            candidate_post_id: score.candidate_post_id,
            score: score.score,
            rationale,
        });
    }
    Ok(ApplyScoresOutcome::Applied(applied_scores))
}

pub(crate) async fn apply_scores_with_pool(
    pool: &SqlitePool,
    input: ApplyRelevanceScoresInput,
) -> Result<Vec<RelevanceScoreInput>, String> {
    let mut connection = begin_immediate(pool, "relevance score application").await?;
    let result = apply_scores_on_connection(&mut connection, input).await;
    match finish_transaction(&mut connection, result, "relevance score application").await? {
        ApplyScoresOutcome::Applied(scores) => Ok(scores),
        ApplyScoresOutcome::Blocked(error) => Err(error),
    }
}

async fn settle_without_model_on_connection(
    connection: &mut SqliteConnection,
    input: SettleRelevanceScoringInput,
) -> Result<(), String> {
    if !matches!(input.outcome.as_str(), "completed" | "blocked") {
        return Err("Unsupported no-model scoring outcome".to_string());
    }
    let summary = bounded_summary(
        &input.summary,
        "Planner scoring settled without a model call",
    );
    let scope = load_planner_scope(connection, input.workflow_run_id).await?;
    if input.outcome == "completed" && !scope.unscored_candidate_ids.is_empty() {
        return Err("Unscored candidates appeared before no-work completion".to_string());
    }
    if input.outcome == "blocked" {
        sqlx::query(
            "UPDATE workflow_steps
                SET status = 'blocked', error_message = ?1, completed_at = NULL,
                    updated_at = datetime('now')
              WHERE id = ?2 AND status <> 'completed'",
        )
        .bind(&summary)
        .bind(scope.header.workflow_step_id)
        .execute(&mut *connection)
        .await
        .map_err(db_error("Could not block no-work scoring step"))?;
        sqlx::query(
            "UPDATE workflow_runs
                SET status = 'blocked', current_step_key = 'score', completed_at = NULL,
                    updated_at = datetime('now')
              WHERE id = ?1 AND status <> 'cancelled'",
        )
        .bind(input.workflow_run_id)
        .execute(&mut *connection)
        .await
        .map_err(db_error("Could not block no-work scoring workflow"))?;
        insert_workflow_event(
            connection,
            input.workflow_run_id,
            scope.header.workflow_step_id,
            "step_blocked",
            &summary,
        )
        .await?;
    } else {
        sqlx::query(
            "UPDATE workflow_steps
                SET status = 'completed', output_summary = ?1, error_message = '',
                    started_at = COALESCE(started_at, datetime('now')),
                    completed_at = COALESCE(completed_at, datetime('now')),
                    updated_at = datetime('now')
              WHERE id = ?2 AND status <> 'completed'",
        )
        .bind(&summary)
        .bind(scope.header.workflow_step_id)
        .execute(&mut *connection)
        .await
        .map_err(db_error("Could not complete no-work scoring step"))?;
        insert_workflow_event(
            connection,
            input.workflow_run_id,
            scope.header.workflow_step_id,
            "step_completed",
            &summary,
        )
        .await?;
        start_draft_step(connection, input.workflow_run_id).await?;
    }
    sync_backlog(connection, input.workflow_run_id, &input.outcome).await?;
    Ok(())
}

pub(crate) async fn settle_with_pool(
    pool: &SqlitePool,
    input: SettleRelevanceScoringInput,
) -> Result<(), String> {
    let mut connection = begin_immediate(pool, "no-model scoring settlement").await?;
    let result = settle_without_model_on_connection(&mut connection, input).await;
    finish_transaction(&mut connection, result, "no-model scoring settlement").await
}

async fn start_draft_step(
    connection: &mut SqliteConnection,
    workflow_run_id: i64,
) -> Result<(), String> {
    let draft_step_id: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM workflow_steps
          WHERE workflow_run_id = ?1 AND step_key = 'draft' AND status = 'pending'
          LIMIT 1",
    )
    .bind(workflow_run_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(db_error("Could not load draft workflow step"))?;
    let Some(draft_step_id) = draft_step_id else {
        return Ok(());
    };
    sqlx::query(
        "UPDATE workflow_steps
            SET status = 'running', started_at = COALESCE(started_at, datetime('now')),
                completed_at = NULL, updated_at = datetime('now')
          WHERE id = ?1 AND status = 'pending'",
    )
    .bind(draft_step_id)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not start draft workflow step"))?;
    sqlx::query(
        "UPDATE workflow_runs
            SET status = 'running', current_step_key = 'draft', completed_at = NULL,
                started_at = COALESCE(started_at, datetime('now')),
                updated_at = datetime('now')
          WHERE id = ?1 AND status <> 'cancelled'",
    )
    .bind(workflow_run_id)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not advance workflow to draft"))?;
    insert_workflow_event(
        connection,
        workflow_run_id,
        draft_step_id,
        "step_started",
        "Draft variants started",
    )
    .await?;
    Ok(())
}

async fn fail_claim_on_connection(
    connection: &mut SqliteConnection,
    execution_id: i64,
    workflow_run_id: i64,
    workflow_step_id: i64,
    error_summary: &str,
) -> Result<(), String> {
    let summary = bounded_summary(error_summary, "Workflow scorer failed");
    let row = sqlx::query(
        "SELECT wse.agent_run_id, wse.status, ws.workflow_run_id
           FROM workflow_step_executions wse
           INNER JOIN workflow_steps ws ON ws.id = wse.workflow_step_id
          WHERE wse.id = ?1 AND wse.workflow_step_id = ?2
          LIMIT 1",
    )
    .bind(execution_id)
    .bind(workflow_step_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(db_error("Could not load scorer claim for failure"))?
    .ok_or_else(|| "Workflow score execution claim was not found".to_string())?;
    if row.try_get::<i64, _>("workflow_run_id").unwrap_or_default() != workflow_run_id {
        return Err("Workflow score execution belongs to a different workflow".to_string());
    }
    let execution_status: String = row.try_get("status").unwrap_or_default();
    if !matches!(
        execution_status.as_str(),
        "claimed" | "running" | "waiting_approval"
    ) {
        return Ok(());
    }
    let agent_run_id: Option<i64> = row.try_get("agent_run_id").unwrap_or(None);
    sqlx::query(
        "UPDATE workflow_step_executions
            SET status = 'failed', error_summary = ?1,
                completed_at = COALESCE(completed_at, datetime('now')),
                updated_at = datetime('now')
          WHERE id = ?2 AND status IN ('claimed', 'running', 'waiting_approval')",
    )
    .bind(&summary)
    .bind(execution_id)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not fail scorer execution"))?;
    if let Some(agent_run_id) = agent_run_id {
        sqlx::query(
            "UPDATE agent_runs
                SET status = 'failed', error_message = ?1,
                    completed_at = COALESCE(completed_at, datetime('now')),
                    updated_at = datetime('now')
              WHERE id = ?2 AND status IN ('queued', 'running', 'waiting_approval')",
        )
        .bind(&summary)
        .bind(agent_run_id)
        .execute(&mut *connection)
        .await
        .map_err(db_error("Could not fail planner scorer run"))?;
        sqlx::query(
            "INSERT INTO agent_run_events (agent_run_id, event_type, summary)
             VALUES (?1, 'run_failed', ?2)",
        )
        .bind(agent_run_id)
        .bind(&summary)
        .execute(&mut *connection)
        .await
        .map_err(db_error("Could not record planner scorer failure"))?;
    }
    project_failure(connection, workflow_run_id, workflow_step_id, &summary).await
}

async fn project_failure(
    connection: &mut SqliteConnection,
    workflow_run_id: i64,
    workflow_step_id: i64,
    summary: &str,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE workflow_steps
            SET status = 'failed', error_message = ?1, completed_at = NULL,
                updated_at = datetime('now')
          WHERE id = ?2 AND status IN ('running', 'blocked', 'failed')",
    )
    .bind(summary)
    .bind(workflow_step_id)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not fail workflow score step"))?;
    sqlx::query(
        "UPDATE workflow_runs
            SET status = 'failed', current_step_key = 'score', completed_at = NULL,
                updated_at = datetime('now')
          WHERE id = ?1 AND status <> 'cancelled'",
    )
    .bind(workflow_run_id)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not fail workflow score run"))?;
    sync_backlog(connection, workflow_run_id, "failed").await?;
    insert_workflow_event(
        connection,
        workflow_run_id,
        workflow_step_id,
        "step_failed",
        summary,
    )
    .await
}

pub(crate) async fn fail_claim_with_pool(
    pool: &SqlitePool,
    input: FailRelevanceScoringInput,
) -> Result<(), String> {
    let mut connection = begin_immediate(pool, "planner scoring failure").await?;
    let result = fail_claim_on_connection(
        &mut connection,
        input.execution_id,
        input.workflow_run_id,
        input.workflow_step_id,
        &input.error_summary,
    )
    .await;
    finish_transaction(&mut connection, result, "planner scoring failure").await
}

async fn reconcile_on_connection(
    connection: &mut SqliteConnection,
    input: ReconcileRelevanceScorerInput,
) -> Result<(), String> {
    if !matches!(input.status.as_str(), "completed" | "failed") {
        return Err("Planner scorer result must be completed or failed".to_string());
    }
    if !(0..=20).contains(&input.iteration_count) {
        return Err("Planner scorer iteration count is invalid".to_string());
    }
    let link = load_scorer_run_link(connection, input.agent_run_id).await?;
    if link.status != "running" {
        if link.status == "failed"
            && input.status == "failed"
            && link
                .error_message
                .starts_with(KILL_SWITCH_SCORE_ERROR_PREFIX)
        {
            return Ok(());
        }
        return Err("Planner scorer run is no longer active".to_string());
    }
    if input.status == "completed" {
        let scope = load_planner_scope(connection, link.workflow_run_id).await?;
        if !scope.unscored_candidate_ids.is_empty() {
            return Err("Unscored candidates remain after scorer completion".to_string());
        }
    }

    for tool_call in input.tool_calls {
        if !matches!(
            tool_call.tool_name.as_str(),
            "research_posts"
                | "score_relevance"
                | "draft_post"
                | "audit_post"
                | "schedule_post"
                | "collect_metrics"
        ) || !matches!(
            tool_call.status.as_str(),
            "requested" | "running" | "waiting_approval" | "completed" | "failed" | "rejected"
        ) {
            return Err("Planner scorer tool result is invalid".to_string());
        }
        let input_json = serde_json::to_string(&tool_call.input)
            .map_err(|_| "Planner scorer tool input is invalid".to_string())?;
        let output_json = serde_json::to_string(&tool_call.output)
            .map_err(|_| "Planner scorer tool output is invalid".to_string())?;
        sqlx::query(
            "INSERT INTO agent_tool_calls (
                agent_run_id, provider_tool_call_id, tool_name, status,
                requires_approval, input_json, output_json, error_message,
                started_at, completed_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'),
                CASE WHEN ?4 IN ('completed', 'failed', 'rejected') THEN datetime('now') ELSE NULL END)",
        )
        .bind(link.agent_run_id)
        .bind(tool_call.provider_tool_call_id)
        .bind(tool_call.tool_name)
        .bind(tool_call.status)
        .bind(if tool_call.requires_approval { 1 } else { 0 })
        .bind(input_json)
        .bind(output_json)
        .bind(bounded_summary(&tool_call.error_message, ""))
        .execute(&mut *connection)
        .await
        .map_err(db_error("Could not persist planner scorer tool result"))?;
    }

    let output_summary =
        bounded_summary(&input.output_summary, "Planner relevance scoring completed");
    let error_summary = bounded_summary(&input.error_message, "Workflow scorer failed");
    sqlx::query(
        "UPDATE agent_runs
            SET status = ?1, output_summary = ?2, error_message = ?3,
                iteration_count = ?4, completed_at = datetime('now'),
                updated_at = datetime('now')
          WHERE id = ?5 AND status = 'running'",
    )
    .bind(&input.status)
    .bind(&output_summary)
    .bind(if input.status == "failed" {
        &error_summary
    } else {
        ""
    })
    .bind(input.iteration_count)
    .bind(link.agent_run_id)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not persist planner scorer result"))?;

    let (step_status, execution_status, event_type, event_summary) = if input.status == "completed"
    {
        (
            "completed",
            "completed",
            "step_completed",
            "Score relevance completed",
        )
    } else {
        ("failed", "failed", "step_failed", "Score relevance failed")
    };
    sqlx::query(
        "UPDATE workflow_step_executions
            SET status = ?1, error_summary = ?2,
                completed_at = COALESCE(completed_at, datetime('now')),
                updated_at = datetime('now')
          WHERE id = ?3 AND agent_run_id = ?4",
    )
    .bind(execution_status)
    .bind(if input.status == "failed" {
        &error_summary
    } else {
        ""
    })
    .bind(link.execution_id)
    .bind(link.agent_run_id)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not reconcile planner scorer execution"))?;
    sqlx::query(
        "UPDATE workflow_steps
            SET status = ?1, output_summary = ?2, error_message = ?3,
                completed_at = CASE WHEN ?1 = 'completed' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END,
                updated_at = datetime('now')
          WHERE id = ?4",
    )
    .bind(step_status)
    .bind(if input.status == "completed" { &output_summary } else { "" })
    .bind(if input.status == "failed" { &error_summary } else { "" })
    .bind(link.workflow_step_id)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not reconcile planner scorer step"))?;
    insert_workflow_event(
        connection,
        link.workflow_run_id,
        link.workflow_step_id,
        event_type,
        if input.status == "completed" {
            &output_summary
        } else if error_summary.is_empty() {
            event_summary
        } else {
            &error_summary
        },
    )
    .await?;

    if input.status == "completed" {
        start_draft_step(connection, link.workflow_run_id).await?;
        sync_backlog(connection, link.workflow_run_id, "completed").await?;
    } else {
        sqlx::query(
            "UPDATE workflow_runs
                SET status = 'failed', current_step_key = 'score', completed_at = NULL,
                    updated_at = datetime('now')
              WHERE id = ?1 AND status <> 'cancelled'",
        )
        .bind(link.workflow_run_id)
        .execute(&mut *connection)
        .await
        .map_err(db_error("Could not reconcile failed scorer workflow"))?;
        sync_backlog(connection, link.workflow_run_id, "failed").await?;
        record_agent_failure(connection, &link, &error_summary).await?;
    }
    Ok(())
}

async fn record_agent_failure(
    connection: &mut SqliteConnection,
    link: &ScorerRunLink,
    summary: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO safety_audit_events (
            campaign_id, subject_type, subject_id, event_type, severity, summary, metadata_json
         ) VALUES (?1, 'agent_run', ?2, 'agent_run_failed', 'warning', ?3, '{}')",
    )
    .bind(link.campaign_id)
    .bind(link.agent_run_id)
    .bind(summary)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not record planner scorer failure audit"))?;
    sqlx::query(
        "INSERT INTO error_queue_items (
            campaign_id, source_type, source_id, title, detail, severity, status, updated_at
         ) VALUES (?1, 'agent_run', ?2, 'Agent run failed', ?3, 'error', 'open', datetime('now'))
         ON CONFLICT(source_type, source_id) WHERE source_id IS NOT NULL
            AND status IN ('open', 'in_progress', 'awaiting_review')
         DO UPDATE SET detail = excluded.detail, severity = excluded.severity,
            status = 'open', updated_at = datetime('now')",
    )
    .bind(link.campaign_id)
    .bind(link.agent_run_id)
    .bind(summary)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not queue planner scorer failure"))?;
    Ok(())
}

pub(crate) async fn reconcile_with_pool(
    pool: &SqlitePool,
    input: ReconcileRelevanceScorerInput,
) -> Result<(), String> {
    let mut connection = begin_immediate(pool, "planner scorer reconciliation").await?;
    let result = reconcile_on_connection(&mut connection, input).await;
    finish_transaction(&mut connection, result, "planner scorer reconciliation").await
}

pub(crate) async fn fail_agent_with_pool(
    pool: &SqlitePool,
    agent_run_id: i64,
    error_summary: &str,
) -> Result<(), String> {
    let mut connection = begin_immediate(pool, "planner scorer persistence failure").await?;
    let result = async {
        let link = load_scorer_run_link(&mut connection, agent_run_id).await?;
        fail_claim_on_connection(
            &mut connection,
            link.execution_id,
            link.workflow_run_id,
            link.workflow_step_id,
            error_summary,
        )
        .await
    }
    .await;
    finish_transaction(
        &mut connection,
        result,
        "planner scorer persistence failure",
    )
    .await
}

#[tauri::command]
pub async fn linkgo_relevance_scoring_claim(
    pool: State<'_, SqlitePool>,
    input: ClaimRelevanceScoringInput,
) -> Result<RelevanceScoringClaimPayload, String> {
    claim_with_pool(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_relevance_scoring_start(
    pool: State<'_, SqlitePool>,
    input: StartRelevanceScorerInput,
) -> Result<(), String> {
    start_with_pool(pool.inner(), input.agent_run_id).await
}

#[tauri::command]
pub async fn linkgo_relevance_scoring_apply_scores(
    pool: State<'_, SqlitePool>,
    input: ApplyRelevanceScoresInput,
) -> Result<Vec<RelevanceScoreInput>, String> {
    apply_scores_with_pool(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_relevance_scoring_settle(
    pool: State<'_, SqlitePool>,
    input: SettleRelevanceScoringInput,
) -> Result<(), String> {
    settle_with_pool(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_relevance_scoring_fail(
    pool: State<'_, SqlitePool>,
    input: FailRelevanceScoringInput,
) -> Result<(), String> {
    fail_claim_with_pool(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_relevance_scoring_reconcile(
    pool: State<'_, SqlitePool>,
    input: ReconcileRelevanceScorerInput,
) -> Result<(), String> {
    reconcile_with_pool(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_relevance_scoring_fail_agent(
    pool: State<'_, SqlitePool>,
    input: FailRelevanceScorerAgentInput,
) -> Result<(), String> {
    fail_agent_with_pool(pool.inner(), input.agent_run_id, &input.error_summary).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{autopilot_planner, migrations};
    use serde_json::json;
    use sqlx::{sqlite::SqliteConnectOptions, sqlite::SqlitePoolOptions, Executor};
    use std::str::FromStr;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::Duration;
    use tauri_plugin_sql::MigrationKind;

    static DATABASE_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    async fn migrated_pool() -> SqlitePool {
        let sequence = DATABASE_SEQUENCE.fetch_add(1, Ordering::SeqCst);
        let url = format!("sqlite:file:relevance-scoring-{sequence}?mode=memory&cache=shared");
        let options = SqliteConnectOptions::from_str(&url)
            .expect("scoring test URL should be valid")
            .foreign_keys(true)
            .busy_timeout(Duration::from_secs(5));
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect_lazy_with(options);
        for migration in migrations::get_migrations()
            .into_iter()
            .filter(|migration| {
                matches!(migration.kind, MigrationKind::Up)
                    && matches!(
                        migration.version,
                        1 | 2 | 6 | 7 | 8 | 10 | 15 | 20 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29
                    )
            })
        {
            pool.execute(migration.sql)
                .await
                .unwrap_or_else(|error| panic!("{} migration failed: {error}", migration.version));
        }
        pool
    }

    async fn seeded_planner_pool() -> SqlitePool {
        let pool = migrated_pool().await;
        pool.execute(
            "INSERT INTO campaigns (id, name, status, auto_pilot) VALUES
                (1, 'Scoring', 'active', 1),
                (2, 'Foreign', 'active', 0);
             INSERT INTO target_posts (id, url, normalized_url, content, content_hash) VALUES
                (100, 'https://example.com/100', 'https://example.com/100', 'First', 'hash-100'),
                (101, 'https://example.com/101', 'https://example.com/101', 'Second', 'hash-101');
             INSERT INTO candidate_posts (id, campaign_id, target_post_id) VALUES
                (10, 1, 100), (11, 1, 101);
             INSERT INTO source_import_batches (
                id, campaign_id, source_type, status, total_count, accepted_count,
                duplicate_count, rejected_count, error_message
             ) VALUES (20, 1, 'local_json', 'completed', 2, 2, 0, 0, '');
             INSERT INTO source_import_items (
                source_import_batch_id, row_number, status, input_json,
                candidate_post_id, reason, policy_rule_key
             ) VALUES
                (20, 1, 'accepted', '{}', 10, 'Accepted', ''),
                (20, 2, 'accepted', '{}', 11, 'Accepted', '');",
        )
        .await
        .expect("scoring fixture should insert");
        let tick = autopilot_planner::run_tick_with_pool(&pool, "scoring-test")
            .await
            .expect("planner should materialize scoring fixture");
        assert_eq!(tick.planned, 1);
        pool
    }

    async fn workflow_ids(pool: &SqlitePool) -> (i64, i64, i64) {
        let row = sqlx::query(
            "SELECT wr.id AS workflow_run_id, ws.id AS workflow_step_id, ap.id AS plan_id
               FROM workflow_runs wr
               INNER JOIN workflow_steps ws ON ws.workflow_run_id = wr.id AND ws.step_key = 'score'
               INNER JOIN autopilot_plans ap ON ap.workflow_run_id = wr.id",
        )
        .fetch_one(pool)
        .await
        .expect("planner workflow IDs should exist");
        (
            row.get("workflow_run_id"),
            row.get("workflow_step_id"),
            row.get("plan_id"),
        )
    }

    async fn claim_input(pool: &SqlitePool) -> ClaimRelevanceScoringInput {
        let (workflow_run_id, workflow_step_id, plan_id) = workflow_ids(pool).await;
        ClaimRelevanceScoringInput {
            workflow_run_id,
            provider_key: "openai".to_string(),
            model_name: "gpt-test".to_string(),
            playbook_key: "".to_string(),
            input_summary: "Planner scoring test".to_string(),
            input_context: json!({
                "campaign": { "id": 1 },
                "sourceBatchId": 20,
                "autopilotPlanId": plan_id,
                "workflowRunId": workflow_run_id,
                "workflowStepId": workflow_step_id,
                "minimumScore": 60,
                "autoRejectBelowMinimum": false,
                "candidates": [{ "id": 10 }, { "id": 11 }]
            }),
        }
    }

    async fn claimed_and_started(pool: &SqlitePool) -> RelevanceScoringClaimPayload {
        let claim = claim_with_pool(pool, claim_input(pool).await)
            .await
            .expect("scoring claim should succeed");
        start_with_pool(pool, claim.agent_run_id)
            .await
            .expect("scorer should start");
        claim
    }

    fn valid_scores(agent_run_id: i64) -> ApplyRelevanceScoresInput {
        ApplyRelevanceScoresInput {
            agent_run_id,
            campaign_id: 1,
            candidate_post_ids: vec![10, 11],
            minimum_score: 60,
            auto_reject_below_minimum: false,
            scores: vec![
                RelevanceScoreInput {
                    candidate_post_id: 10,
                    score: 81,
                    rationale: "Strong fit".to_string(),
                },
                RelevanceScoreInput {
                    candidate_post_id: 11,
                    score: 72,
                    rationale: "Useful fit".to_string(),
                },
            ],
        }
    }

    async fn candidate_scores(pool: &SqlitePool) -> Vec<Option<i64>> {
        sqlx::query_scalar("SELECT relevance_score FROM candidate_posts ORDER BY id")
            .fetch_all(pool)
            .await
            .expect("candidate scores should be readable")
    }

    async fn candidate_state(pool: &SqlitePool) -> Vec<(i64, String, Option<i64>, String, String)> {
        sqlx::query_as(
            "SELECT id, status, relevance_score, score_reason, updated_at
               FROM candidate_posts ORDER BY id",
        )
        .fetch_all(pool)
        .await
        .expect("candidate state should be readable")
    }

    async fn table_count(pool: &SqlitePool, table: &str) -> i64 {
        sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
            .fetch_one(pool)
            .await
            .expect("table count should be readable")
    }

    #[test]
    fn dry_run_provider_cannot_claim_planner_scoring() {
        tauri::async_runtime::block_on(async {
            let pool = seeded_planner_pool().await;
            let mut input = claim_input(&pool).await;
            input.provider_key = "dry_run".to_string();

            let error = claim_with_pool(&pool, input)
                .await
                .expect_err("dry run must not claim planner scoring");

            assert_eq!(error, "Planner scoring requires a connected model provider");
            assert_eq!(table_count(&pool, "workflow_step_executions").await, 0);
            assert_eq!(table_count(&pool, "agent_runs").await, 0);
            let score_step_status: String =
                sqlx::query_scalar("SELECT status FROM workflow_steps WHERE step_key = 'score'")
                    .fetch_one(&pool)
                    .await
                    .expect("score step status should remain readable");
            assert_eq!(score_step_status, "pending");
        });
    }

    #[test]
    fn exact_score_set_commits_every_candidate_write() {
        tauri::async_runtime::block_on(async {
            let pool = seeded_planner_pool().await;
            let claim = claimed_and_started(&pool).await;

            let applied = apply_scores_with_pool(&pool, valid_scores(claim.agent_run_id))
                .await
                .expect("exact score set should commit");
            assert_eq!(
                applied,
                vec![
                    RelevanceScoreInput {
                        candidate_post_id: 10,
                        score: 81,
                        rationale: "Strong fit".to_string(),
                    },
                    RelevanceScoreInput {
                        candidate_post_id: 11,
                        score: 72,
                        rationale: "Useful fit".to_string(),
                    },
                ]
            );
            let rows = sqlx::query(
                "SELECT id, relevance_score, score_reason, status
                   FROM candidate_posts ORDER BY id",
            )
            .fetch_all(&pool)
            .await
            .expect("committed scores should be readable");
            assert_eq!(rows.len(), 2);
            assert_eq!(rows[0].get::<i64, _>("id"), 10);
            assert_eq!(rows[0].get::<Option<i64>, _>("relevance_score"), Some(81));
            assert_eq!(rows[0].get::<String, _>("score_reason"), "Strong fit");
            assert_eq!(rows[0].get::<String, _>("status"), "new");
            assert_eq!(rows[1].get::<i64, _>("id"), 11);
            assert_eq!(rows[1].get::<Option<i64>, _>("relevance_score"), Some(72));
            assert_eq!(rows[1].get::<String, _>("score_reason"), "Useful fit");
            assert_eq!(rows[1].get::<String, _>("status"), "new");
            pool.close().await;
        });
    }

    #[test]
    fn kill_switch_enabled_after_claim_blocks_scores_and_persists_evidence() {
        tauri::async_runtime::block_on(async {
            let pool = seeded_planner_pool().await;
            let claim = claimed_and_started(&pool).await;
            let candidate_state_before = candidate_state(&pool).await;
            pool.execute(
                "UPDATE safety_settings
                    SET global_kill_switch = 1,
                        kill_switch_reason = 'Operator pause during provider latency'
                  WHERE id = 1",
            )
            .await
            .expect("kill switch race should be injected after scorer claim");

            let error = apply_scores_with_pool(&pool, valid_scores(claim.agent_run_id))
                .await
                .expect_err("score application must stop at the final safety boundary");
            assert_eq!(
                error,
                "Global kill switch is enabled; candidate score application was blocked: Operator pause during provider latency"
            );
            assert!(error.chars().count() <= MAX_SUMMARY_BYTES);

            let candidate_state_after = candidate_state(&pool).await;
            assert_eq!(candidate_state_after, candidate_state_before);
            assert_eq!(candidate_state_after.len(), 2);

            let projection = sqlx::query(
                "SELECT ar.status AS agent_status, ar.error_message,
                        wse.status AS execution_status, ws.status AS step_status,
                        wr.status AS workflow_status, cbi.status AS backlog_status
                   FROM agent_runs ar
                   INNER JOIN workflow_step_executions wse ON wse.agent_run_id = ar.id
                   INNER JOIN workflow_steps ws ON ws.id = wse.workflow_step_id
                   INNER JOIN workflow_runs wr ON wr.id = ws.workflow_run_id
                   INNER JOIN autopilot_plans ap ON ap.workflow_run_id = wr.id
                   INNER JOIN campaign_backlog_items cbi ON cbi.id = ap.campaign_backlog_item_id
                  WHERE ar.id = ?1",
            )
            .bind(claim.agent_run_id)
            .fetch_one(&pool)
            .await
            .expect("blocked scoring projection should be readable");
            assert_eq!(projection.get::<String, _>("agent_status"), "failed");
            assert_eq!(projection.get::<String, _>("error_message"), error);
            assert_eq!(projection.get::<String, _>("execution_status"), "blocked");
            assert_eq!(projection.get::<String, _>("step_status"), "blocked");
            assert_eq!(projection.get::<String, _>("workflow_status"), "blocked");
            assert_eq!(projection.get::<String, _>("backlog_status"), "blocked");

            let audit = sqlx::query(
                "SELECT event_type, severity, summary, metadata_json
                   FROM safety_audit_events
                  WHERE subject_type = 'agent_run' AND subject_id = ?1
                  ORDER BY id DESC LIMIT 1",
            )
            .bind(claim.agent_run_id)
            .fetch_one(&pool)
            .await
            .expect("kill-switch safety evidence should be durable");
            assert_eq!(audit.get::<String, _>("event_type"), "agent_run_failed");
            assert_eq!(audit.get::<String, _>("severity"), "block");
            assert_eq!(audit.get::<String, _>("summary"), error);
            let metadata: Value = serde_json::from_str(&audit.get::<String, _>("metadata_json"))
                .expect("kill-switch audit metadata should be valid JSON");
            assert_eq!(metadata["boundary"], "relevance_score_application");
            assert_eq!(metadata["reason"], "Operator pause during provider latency");
            pool.close().await;
        });
    }

    #[test]
    fn non_exact_score_sets_write_nothing() {
        tauri::async_runtime::block_on(async {
            for mode in ["missing", "duplicate", "extra"] {
                let pool = seeded_planner_pool().await;
                let claim = claimed_and_started(&pool).await;
                let mut input = valid_scores(claim.agent_run_id);
                match mode {
                    "missing" => {
                        input.scores.pop();
                    }
                    "duplicate" => input.scores[1].candidate_post_id = 10,
                    "extra" => input.scores.push(RelevanceScoreInput {
                        candidate_post_id: 999,
                        score: 65,
                        rationale: "Unexpected candidate".to_string(),
                    }),
                    _ => unreachable!(),
                }

                let error = apply_scores_with_pool(&pool, input)
                    .await
                    .expect_err("non-exact score set must fail closed");
                assert_eq!(
                    error,
                    "Score entries must match the requested candidate post IDs exactly"
                );
                assert_eq!(candidate_scores(&pool).await, vec![None, None]);
                pool.close().await;
            }
        });
    }

    #[test]
    fn sqlite_write_failure_rolls_back_earlier_candidate_scores() {
        tauri::async_runtime::block_on(async {
            let pool = seeded_planner_pool().await;
            let claim = claimed_and_started(&pool).await;
            pool.execute(
                "CREATE TRIGGER fail_second_relevance_score
                 BEFORE UPDATE OF relevance_score ON candidate_posts
                 WHEN NEW.id = 11
                 BEGIN
                    SELECT RAISE(ABORT, 'injected score write failure');
                 END",
            )
            .await
            .expect("score failure trigger should be created");

            let error = apply_scores_with_pool(&pool, valid_scores(claim.agent_run_id))
                .await
                .expect_err("second SQLite write should abort the score transaction");
            assert_eq!(error, "Could not apply candidate relevance score");
            let rows = sqlx::query(
                "SELECT relevance_score, score_reason, status
                   FROM candidate_posts ORDER BY id",
            )
            .fetch_all(&pool)
            .await
            .expect("rolled-back candidates should be readable");
            assert_eq!(rows.len(), 2);
            for row in rows {
                assert_eq!(row.get::<Option<i64>, _>("relevance_score"), None);
                assert_eq!(row.get::<String, _>("score_reason"), "");
                assert_eq!(row.get::<String, _>("status"), "new");
            }
            pool.close().await;
        });
    }

    #[test]
    fn all_scored_scope_completes_without_creating_a_model_run() {
        tauri::async_runtime::block_on(async {
            let pool = seeded_planner_pool().await;
            let (workflow_run_id, _, _) = workflow_ids(&pool).await;
            pool.execute(
                "UPDATE candidate_posts
                    SET relevance_score = CASE id WHEN 10 THEN 91 ELSE 83 END,
                        score_reason = 'Existing score'",
            )
            .await
            .expect("existing scores should be seeded");

            settle_with_pool(
                &pool,
                SettleRelevanceScoringInput {
                    workflow_run_id,
                    outcome: "completed".to_string(),
                    summary: "All attached candidates were already scored".to_string(),
                },
            )
            .await
            .expect("all-scored scope should complete without a model");

            let projection = sqlx::query(
                "SELECT wr.status AS run_status, wr.current_step_key,
                        score.status AS score_status, draft.status AS draft_status,
                        cbi.status AS backlog_status
                   FROM workflow_runs wr
                   INNER JOIN workflow_steps score
                      ON score.workflow_run_id = wr.id AND score.step_key = 'score'
                   INNER JOIN workflow_steps draft
                      ON draft.workflow_run_id = wr.id AND draft.step_key = 'draft'
                   INNER JOIN autopilot_plans ap ON ap.workflow_run_id = wr.id
                   INNER JOIN campaign_backlog_items cbi ON cbi.id = ap.campaign_backlog_item_id",
            )
            .fetch_one(&pool)
            .await
            .expect("all-scored projection should be readable");
            assert_eq!(projection.get::<String, _>("run_status"), "running");
            assert_eq!(projection.get::<String, _>("current_step_key"), "draft");
            assert_eq!(projection.get::<String, _>("score_status"), "completed");
            assert_eq!(projection.get::<String, _>("draft_status"), "running");
            assert_eq!(projection.get::<String, _>("backlog_status"), "completed");
            assert_eq!(table_count(&pool, "workflow_step_executions").await, 0);
            assert_eq!(table_count(&pool, "agent_runs").await, 0);
            pool.close().await;
        });
    }

    #[test]
    fn all_removed_scope_blocks_and_preserves_durable_artifacts() {
        tauri::async_runtime::block_on(async {
            let pool = seeded_planner_pool().await;
            let (workflow_run_id, _, _) = workflow_ids(&pool).await;
            pool.execute("DELETE FROM candidate_posts WHERE id IN (10, 11)")
                .await
                .expect("attached candidates should be removable");

            settle_with_pool(
                &pool,
                SettleRelevanceScoringInput {
                    workflow_run_id,
                    outcome: "blocked".to_string(),
                    summary: "All attached candidates were removed".to_string(),
                },
            )
            .await
            .expect("all-removed scope should block without a model");

            let projection = sqlx::query(
                "SELECT wr.status AS run_status, wr.current_step_key,
                        score.status AS score_status, draft.status AS draft_status,
                        cbi.status AS backlog_status
                   FROM workflow_runs wr
                   INNER JOIN workflow_steps score
                      ON score.workflow_run_id = wr.id AND score.step_key = 'score'
                   INNER JOIN workflow_steps draft
                      ON draft.workflow_run_id = wr.id AND draft.step_key = 'draft'
                   INNER JOIN autopilot_plans ap ON ap.workflow_run_id = wr.id
                   INNER JOIN campaign_backlog_items cbi ON cbi.id = ap.campaign_backlog_item_id",
            )
            .fetch_one(&pool)
            .await
            .expect("all-removed projection should be readable");
            assert_eq!(projection.get::<String, _>("run_status"), "blocked");
            assert_eq!(projection.get::<String, _>("current_step_key"), "score");
            assert_eq!(projection.get::<String, _>("score_status"), "blocked");
            assert_eq!(projection.get::<String, _>("draft_status"), "pending");
            assert_eq!(projection.get::<String, _>("backlog_status"), "blocked");
            assert_eq!(table_count(&pool, "candidate_posts").await, 0);
            assert_eq!(table_count(&pool, "workflow_artifacts").await, 2);
            assert_eq!(table_count(&pool, "workflow_step_executions").await, 0);
            assert_eq!(table_count(&pool, "agent_runs").await, 0);
            pool.close().await;
        });
    }

    #[test]
    fn two_connection_claim_allows_only_one_active_execution() {
        tauri::async_runtime::block_on(async {
            let pool = seeded_planner_pool().await;
            let first_input = claim_input(&pool).await;
            let second_input = claim_input(&pool).await;
            let (first, second) = tokio::join!(
                claim_with_pool(&pool, first_input),
                claim_with_pool(&pool, second_input)
            );
            assert_ne!(first.is_ok(), second.is_ok());
            let active_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM workflow_step_executions
                  WHERE status IN ('claimed', 'running', 'waiting_approval')",
            )
            .fetch_one(&pool)
            .await
            .expect("active execution count should be readable");
            assert_eq!(active_count, 1);
            pool.close().await;
        });
    }

    #[test]
    fn score_application_rolls_back_every_score_on_late_failure() {
        tauri::async_runtime::block_on(async {
            let pool = seeded_planner_pool().await;
            let claim = claimed_and_started(&pool).await;
            let mut input = valid_scores(claim.agent_run_id);
            input.scores[1].rationale = "   ".to_string();
            let error = apply_scores_with_pool(&pool, input)
                .await
                .expect_err("empty second rationale should fail after the first update");
            assert_eq!(error, "Score rationale is required");
            assert_eq!(candidate_scores(&pool).await, vec![None, None]);
            pool.close().await;
        });
    }

    #[test]
    fn stale_and_cross_campaign_candidates_write_no_partial_scores() {
        tauri::async_runtime::block_on(async {
            for mutation in [
                "UPDATE candidate_posts SET status = 'shortlisted' WHERE id = 11",
                "UPDATE candidate_posts SET campaign_id = 2 WHERE id = 11",
            ] {
                let pool = seeded_planner_pool().await;
                let claim = claimed_and_started(&pool).await;
                pool.execute(mutation)
                    .await
                    .expect("candidate race should be injected");
                apply_scores_with_pool(&pool, valid_scores(claim.agent_run_id))
                    .await
                    .expect_err("candidate race must fail closed");
                assert_eq!(candidate_scores(&pool).await, vec![None, None]);
                pool.close().await;
            }
        });
    }

    #[test]
    fn completed_scorer_reconciles_workflow_execution_and_backlog() {
        tauri::async_runtime::block_on(async {
            let pool = seeded_planner_pool().await;
            let claim = claimed_and_started(&pool).await;
            apply_scores_with_pool(&pool, valid_scores(claim.agent_run_id))
                .await
                .expect("exact scores should apply");
            reconcile_with_pool(
                &pool,
                ReconcileRelevanceScorerInput {
                    agent_run_id: claim.agent_run_id,
                    status: "completed".to_string(),
                    output_summary: "Scoring completed".to_string(),
                    error_message: "".to_string(),
                    iteration_count: 2,
                    tool_calls: Vec::new(),
                },
            )
            .await
            .expect("completed scorer should reconcile");

            let projection = sqlx::query(
                "SELECT wr.status AS run_status, wr.current_step_key,
                        score.status AS score_status, draft.status AS draft_status,
                        cbi.status AS backlog_status, wse.status AS execution_status,
                        ar.status AS agent_status
                   FROM workflow_runs wr
                   INNER JOIN workflow_steps score
                      ON score.workflow_run_id = wr.id AND score.step_key = 'score'
                   INNER JOIN workflow_steps draft
                      ON draft.workflow_run_id = wr.id AND draft.step_key = 'draft'
                   INNER JOIN autopilot_plans ap ON ap.workflow_run_id = wr.id
                   INNER JOIN campaign_backlog_items cbi ON cbi.id = ap.campaign_backlog_item_id
                   INNER JOIN workflow_step_executions wse ON wse.workflow_step_id = score.id
                   INNER JOIN agent_runs ar ON ar.id = wse.agent_run_id",
            )
            .fetch_one(&pool)
            .await
            .expect("reconciled projection should be readable");
            assert_eq!(projection.get::<String, _>("run_status"), "running");
            assert_eq!(projection.get::<String, _>("current_step_key"), "draft");
            assert_eq!(projection.get::<String, _>("score_status"), "completed");
            assert_eq!(projection.get::<String, _>("draft_status"), "running");
            assert_eq!(projection.get::<String, _>("backlog_status"), "completed");
            assert_eq!(projection.get::<String, _>("execution_status"), "completed");
            assert_eq!(projection.get::<String, _>("agent_status"), "completed");
            pool.close().await;
        });
    }
}
