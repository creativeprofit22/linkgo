//! Native workflow-run mutations (port of `src/workflows/data.ts`).
//!
//! Each command validates input, re-reads the run/step/campaign and writes on
//! one pinned `BEGIN IMMEDIATE` connection. `reconcile_workflow_agent_run`
//! and `sync_planner_scoring_backlog` are connection-level so the agent
//! runtime can compose them inside its own transactions.

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqliteConnection, SqlitePool};
use tauri::State;

use crate::db_transaction::{settle, Settlement};
use crate::js_text::{js_trim, utf16_len};

const STORAGE_ERROR: &str = "Could not save workflow change";
pub(crate) const PLANNER_DRAFT_SAVE_ONLY_MESSAGE: &str = "Planner-linked draft steps are save-only. Open Drafts, generate variants, and save a generated draft to continue to audit.";
const MAX_TITLE_UTF16: usize = 160;
const MAX_SUMMARY_UTF16: usize = 1000;

/// (step_key, title, description, sort_order) — mirrors `CONTENT_PIPELINE_STEPS`.
const CONTENT_PIPELINE_STEPS: [(&str, &str, &str, i64); 7] = [
    (
        "research",
        "Research",
        "Research source posts and campaign context.",
        1,
    ),
    (
        "score",
        "Score relevance",
        "Dedupe and score candidate relevance.",
        2,
    ),
    ("draft", "Draft variants", "Create draft variants.", 3),
    (
        "audit",
        "Audit drafts",
        "Run deterministic/AI audit checks.",
        4,
    ),
    ("approve", "Approve", "Wait for human review.", 5),
    ("schedule", "Schedule", "Schedule approved content.", 6),
    ("measure", "Measure", "Record metrics and learning.", 7),
];
const STEP_STATUSES: [&str; 7] = [
    "pending",
    "running",
    "waiting_approval",
    "blocked",
    "completed",
    "failed",
    "skipped",
];
const ARTIFACT_TYPES: [&str; 3] = ["agent_run", "candidate_post", "draft"];

fn storage_error(_: sqlx::Error) -> String {
    STORAGE_ERROR.to_string()
}

fn positive(value: i64, label: &str) -> Result<(), String> {
    if value <= 0 {
        return Err(format!("{label} must be a positive integer"));
    }
    Ok(())
}

fn bounded(value: &str, max: usize, label: &str, required: bool) -> Result<String, String> {
    let trimmed = js_trim(value);
    if required && trimmed.is_empty() {
        return Err(format!("{label} is required"));
    }
    if utf16_len(trimmed) > max {
        return Err(format!("{label} must be at most {max} characters"));
    }
    Ok(trimmed.to_string())
}

fn is_finished(status: &str) -> bool {
    matches!(status, "completed" | "skipped")
}

pub(crate) fn can_transition(current: &str, next: &str) -> bool {
    let allowed: &[&str] = match current {
        "pending" => &["running", "skipped"],
        "running" => &[
            "completed",
            "waiting_approval",
            "blocked",
            "failed",
            "skipped",
        ],
        "waiting_approval" => &["completed", "blocked", "failed", "running"],
        "blocked" => &["running", "failed", "skipped"],
        "failed" => &["running", "blocked", "skipped"],
        "completed" | "skipped" => &["running"],
        _ => &[],
    };
    allowed.contains(&next)
}

fn assert_transition(current: &str, next: &str) -> Result<(), String> {
    if can_transition(current, next) {
        Ok(())
    } else {
        Err("Unsupported workflow step transition".to_string())
    }
}

fn step_event_type(current: &str, next: &str) -> &'static str {
    match next {
        "running" if current == "pending" => "step_started",
        "running" => "step_resumed",
        "waiting_approval" => "step_waiting_approval",
        "blocked" => "step_blocked",
        "completed" => "step_completed",
        "failed" => "step_failed",
        "skipped" => "step_skipped",
        _ => "note_added",
    }
}

fn step_event_summary(title: &str, current: &str, next: &str) -> String {
    match next {
        "running" if current == "pending" => format!("{title} started"),
        "running" => format!("{title} resumed"),
        "waiting_approval" => format!("{title} waiting for approval"),
        "blocked" => format!("{title} blocked"),
        "completed" => format!("{title} completed"),
        "failed" => format!("{title} failed"),
        "skipped" => format!("{title} skipped"),
        _ => format!("{title} updated"),
    }
}

struct StepRow {
    id: i64,
    step_key: String,
    title: String,
    sort_order: i64,
    status: String,
}

async fn load_steps(
    connection: &mut SqliteConnection,
    workflow_run_id: i64,
) -> Result<Vec<StepRow>, String> {
    let rows = sqlx::query(
        "SELECT id, step_key, title, sort_order, status FROM workflow_steps
         WHERE workflow_run_id = ?1 ORDER BY sort_order ASC",
    )
    .bind(workflow_run_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(storage_error)?;
    Ok(rows
        .into_iter()
        .map(|row| StepRow {
            id: row.get("id"),
            step_key: row.get("step_key"),
            title: row.get("title"),
            sort_order: row.get("sort_order"),
            status: row.get("status"),
        })
        .collect())
}

pub(crate) async fn insert_event(
    connection: &mut SqliteConnection,
    workflow_run_id: i64,
    workflow_step_id: Option<i64>,
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
    .map_err(storage_error)?;
    Ok(())
}

struct RunRow {
    campaign_id: i64,
    status: String,
    current_step_key: String,
    started_at: Option<String>,
    campaign_status: String,
    autopilot_plan_id: Option<i64>,
}

async fn load_run(connection: &mut SqliteConnection, id: i64) -> Result<RunRow, String> {
    let row = sqlx::query(
        "SELECT wr.campaign_id, wr.status, wr.current_step_key, wr.started_at,
                c.status AS campaign_status, ap.id AS autopilot_plan_id
         FROM workflow_runs wr
         INNER JOIN campaigns c ON c.id = wr.campaign_id
         LEFT JOIN autopilot_plans ap ON ap.workflow_run_id = wr.id
         WHERE wr.id = ?1 LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage_error)?
    .ok_or_else(|| "Workflow run was not found".to_string())?;
    Ok(RunRow {
        campaign_id: row.get("campaign_id"),
        status: row.get("status"),
        current_step_key: row.get("current_step_key"),
        started_at: row.get("started_at"),
        campaign_status: row.get("campaign_status"),
        autopilot_plan_id: row.get("autopilot_plan_id"),
    })
}

fn run_status_from_steps(steps: &[StepRow]) -> &'static str {
    match steps.iter().find(|step| !is_finished(&step.status)) {
        None => "completed",
        Some(step) => match step.status.as_str() {
            "waiting_approval" => "waiting_approval",
            "blocked" => "blocked",
            "failed" => "failed",
            _ => "running",
        },
    }
}

fn current_step_key(steps: &[StepRow]) -> String {
    steps
        .iter()
        .find(|step| !is_finished(&step.status))
        .map_or_else(|| "measure".to_string(), |step| step.step_key.clone())
}

async fn update_run_from_steps(
    connection: &mut SqliteConnection,
    workflow_run_id: i64,
    previous_status: &str,
) -> Result<(), String> {
    let steps = load_steps(connection, workflow_run_id).await?;
    let next_status = run_status_from_steps(&steps);
    sqlx::query(
        "UPDATE workflow_runs
         SET status = ?1, current_step_key = ?2,
             started_at = CASE WHEN ?1 = 'running' THEN COALESCE(started_at, datetime('now')) ELSE started_at END,
             completed_at = CASE WHEN ?1 = 'completed' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END,
             updated_at = datetime('now')
         WHERE id = ?3",
    )
    .bind(next_status)
    .bind(current_step_key(&steps))
    .bind(workflow_run_id)
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?;
    if next_status == "completed" && previous_status != "completed" {
        insert_event(
            connection,
            workflow_run_id,
            None,
            "run_completed",
            "Workflow run completed",
        )
        .await?;
    }
    Ok(())
}

/// Port of `syncPlannerScoringBacklogInTransaction`: projects the score
/// step's status onto its planned autopilot scoring backlog item.
pub(crate) async fn sync_planner_scoring_backlog(
    connection: &mut SqliteConnection,
    workflow_run_id: i64,
    score_step_status: &str,
) -> Result<(), String> {
    let backlog_status = match score_step_status {
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
             ELSE NULL END,
           cancelled_at = CASE
             WHEN ?1 = 'cancelled' THEN COALESCE(cancelled_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             ELSE NULL END,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = (
           SELECT ap.campaign_backlog_item_id
           FROM autopilot_plans ap
           INNER JOIN workflow_steps ws
             ON ws.workflow_run_id = ap.workflow_run_id AND ws.step_key = 'score'
           WHERE ap.workflow_run_id = ?2 AND ap.status = 'planned' AND ws.status = ?3
           LIMIT 1
         )
           AND owner_type = 'linkgo' AND work_type = 'scoring'
           AND recurrence = 'none' AND status NOT IN ('completed', 'cancelled')",
    )
    .bind(backlog_status)
    .bind(workflow_run_id)
    .bind(score_step_status)
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?;
    Ok(())
}

async fn set_step_running(connection: &mut SqliteConnection, step_id: i64) -> Result<(), String> {
    sqlx::query(
        "UPDATE workflow_steps
         SET status = 'running', started_at = COALESCE(started_at, datetime('now')),
             completed_at = NULL, updated_at = datetime('now')
         WHERE id = ?1",
    )
    .bind(step_id)
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?;
    Ok(())
}

async fn start_next_pending_step(
    connection: &mut SqliteConnection,
    workflow_run_id: i64,
    sort_order: i64,
) -> Result<(), String> {
    let steps = load_steps(connection, workflow_run_id).await?;
    let Some(next) = steps
        .iter()
        .find(|step| step.sort_order == sort_order + 1 && step.status == "pending")
    else {
        return Ok(());
    };
    assert_transition(&next.status, "running")?;
    set_step_running(connection, next.id).await?;
    insert_event(
        connection,
        workflow_run_id,
        Some(next.id),
        "step_started",
        &format!("{} started", next.title),
    )
    .await
}

pub(crate) struct ReconcileAgentRun<'a> {
    pub agent_run_id: i64,
    pub status: &'a str,
    pub output_summary: &'a str,
    pub error_message: &'a str,
}

/// Port of `reconcileWorkflowAgentRunInTransaction`: projects an agent run's
/// status onto its linked workflow step, execution row and run. Returns
/// whether a linked step was reconciled.
pub(crate) async fn reconcile_workflow_agent_run(
    connection: &mut SqliteConnection,
    input: &ReconcileAgentRun<'_>,
) -> Result<bool, String> {
    let link = sqlx::query(
        "SELECT workflow_run_id, workflow_step_id FROM agent_runs WHERE id = ?1 LIMIT 1",
    )
    .bind(input.agent_run_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage_error)?;
    let Some(link) = link else { return Ok(false) };
    let (Some(link_run_id), Some(link_step_id)) = (
        link.get::<Option<i64>, _>("workflow_run_id"),
        link.get::<Option<i64>, _>("workflow_step_id"),
    ) else {
        return Ok(false);
    };
    let step = sqlx::query(
        "SELECT ws.id, ws.workflow_run_id, ws.step_key, ws.title, ws.sort_order, ws.status,
                wr.status AS run_status, ap.id AS autopilot_plan_id
         FROM workflow_steps ws
         INNER JOIN workflow_runs wr ON wr.id = ws.workflow_run_id
         INNER JOIN campaigns c ON c.id = wr.campaign_id
         LEFT JOIN autopilot_plans ap ON ap.workflow_run_id = wr.id
         WHERE ws.id = ?1 LIMIT 1",
    )
    .bind(link_step_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage_error)?;
    let Some(step) = step else { return Ok(false) };
    let run_id: i64 = step.get("workflow_run_id");
    let run_status: String = step.get("run_status");
    if run_id != link_run_id || run_status == "cancelled" {
        return Ok(false);
    }
    let step_key: String = step.get("step_key");
    // Planner draft audits settle through their native complete/fail commands.
    if step_key == "audit" && step.get::<Option<i64>, _>("autopilot_plan_id").is_some() {
        return Ok(false);
    }
    let (step_status, execution_status) = match input.status {
        "completed" => ("completed", "completed"),
        "waiting_approval" => ("waiting_approval", "waiting_approval"),
        "failed" => ("failed", "failed"),
        "cancelled" => ("blocked", "cancelled"),
        _ => ("running", "running"),
    };
    let step_id: i64 = step.get("id");
    let current: String = step.get("status");
    let title: String = step.get("title");
    let sort_order: i64 = step.get("sort_order");
    sqlx::query(
        "UPDATE workflow_step_executions
         SET status = ?1, error_summary = ?2,
             completed_at = CASE
               WHEN ?1 IN ('completed', 'failed', 'blocked', 'cancelled') THEN COALESCE(completed_at, datetime('now'))
               ELSE NULL END,
             updated_at = datetime('now')
         WHERE agent_run_id = ?3 AND workflow_step_id = ?4",
    )
    .bind(execution_status)
    .bind(input.error_message)
    .bind(input.agent_run_id)
    .bind(step_id)
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?;
    if current != step_status {
        assert_transition(&current, step_status)?;
    }
    sqlx::query(
        "UPDATE workflow_steps
         SET status = ?1, output_summary = ?2, error_message = ?3,
             started_at = CASE WHEN ?1 = 'running' THEN COALESCE(started_at, datetime('now')) ELSE started_at END,
             completed_at = CASE
               WHEN ?1 IN ('completed', 'skipped') THEN COALESCE(completed_at, datetime('now'))
               WHEN ?1 IN ('running', 'blocked', 'failed', 'waiting_approval') THEN NULL
               ELSE completed_at END,
             updated_at = datetime('now')
         WHERE id = ?4",
    )
    .bind(step_status)
    .bind(input.output_summary)
    .bind(input.error_message)
    .bind(step_id)
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?;
    if current != step_status {
        insert_event(
            connection,
            run_id,
            Some(step_id),
            step_event_type(&current, step_status),
            &step_event_summary(&title, &current, step_status),
        )
        .await?;
        if step_status == "completed" {
            start_next_pending_step(connection, run_id, sort_order).await?;
        }
    }
    update_run_from_steps(connection, run_id, &run_status).await?;
    if step_key == "score" {
        sync_planner_scoring_backlog(connection, run_id, step_status).await?;
    }
    Ok(true)
}

// ---- Commands ----

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateWorkflowRunInput {
    pub campaign_id: i64,
    pub title: String,
    #[serde(default)]
    pub context_summary: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkflowRunIdInput {
    pub id: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetWorkflowStepStatusInput {
    pub step_id: i64,
    pub status: String,
    #[serde(default)]
    pub output_summary: String,
    #[serde(default)]
    pub error_message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AddWorkflowNoteInput {
    pub workflow_run_id: i64,
    pub note: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateWorkflowArtifactInput {
    pub workflow_run_id: i64,
    #[serde(default)]
    pub workflow_step_id: Option<i64>,
    pub artifact_type: String,
    pub artifact_id: i64,
    #[serde(default)]
    pub summary: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowMutationResult {
    pub id: i64,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResumeWorkflowRunResult {
    pub linked_agent_is_active: bool,
}

fn accepted<T>(value: T) -> Result<Settlement<T>, String> {
    Ok(Settlement::Accepted(value))
}

pub(crate) async fn create_run(
    pool: &SqlitePool,
    input: CreateWorkflowRunInput,
) -> Result<WorkflowMutationResult, String> {
    positive(input.campaign_id, "Campaign id")?;
    let title = bounded(&input.title, MAX_TITLE_UTF16, "Title", true)?;
    let context = bounded(
        &input.context_summary,
        MAX_SUMMARY_UTF16,
        "Context summary",
        false,
    )?;
    let campaign_id = input.campaign_id;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let status: Option<String> =
                sqlx::query_scalar("SELECT status FROM campaigns WHERE id = ?1")
                    .bind(campaign_id)
                    .fetch_optional(&mut *connection)
                    .await
                    .map_err(storage_error)?;
            match status.as_deref() {
                None => return Err("Campaign was not found".to_string()),
                Some("archived") => return Err("Campaign is archived".to_string()),
                Some(_) => {}
            }
            let run_id = sqlx::query(
                "INSERT INTO workflow_runs (campaign_id, workflow_type, title, status, current_step_key, context_summary, updated_at)
                 VALUES (?1, 'content_pipeline', ?2, 'queued', 'research', ?3, datetime('now'))",
            )
            .bind(campaign_id)
            .bind(&title)
            .bind(&context)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?
            .last_insert_rowid();
            for (step_key, step_title, description, sort_order) in CONTENT_PIPELINE_STEPS {
                sqlx::query(
                    "INSERT INTO workflow_steps (workflow_run_id, step_key, title, description, sort_order, status, output_summary, error_message, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, 'pending', '', '', datetime('now'))",
                )
                .bind(run_id)
                .bind(step_key)
                .bind(step_title)
                .bind(description)
                .bind(sort_order)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
            }
            insert_event(connection, run_id, None, "run_created", &format!("Run created: {title}")).await?;
            accepted(WorkflowMutationResult { id: run_id })
        })
    })
    .await
}

async fn score_step_status(
    connection: &mut SqliteConnection,
    run_id: i64,
) -> Result<Option<(i64, String)>, String> {
    let row = sqlx::query("SELECT id, status FROM workflow_steps WHERE workflow_run_id = ?1 AND step_key = 'score' LIMIT 1")
        .bind(run_id)
        .fetch_optional(&mut *connection)
        .await
        .map_err(storage_error)?;
    Ok(row.map(|row| (row.get("id"), row.get("status"))))
}

pub(crate) async fn start_run(
    pool: &SqlitePool,
    input: WorkflowRunIdInput,
) -> Result<WorkflowMutationResult, String> {
    positive(input.id, "Workflow run id")?;
    let id = input.id;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let run = load_run(connection, id).await?;
            if run.campaign_status == "archived" {
                return Err("Campaign is archived".to_string());
            }
            if matches!(run.status.as_str(), "completed" | "cancelled") {
                return Err("Terminal workflow runs cannot be started".to_string());
            }
            sqlx::query(
                "UPDATE workflow_runs SET status = 'running', started_at = COALESCE(started_at, datetime('now')),
                 updated_at = datetime('now') WHERE id = ?1",
            )
            .bind(id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            let summary = if run.started_at.is_none() {
                "Workflow run started"
            } else {
                "Workflow run resumed"
            };
            insert_event(connection, id, None, "run_started", summary).await?;
            let steps = load_steps(connection, id).await?;
            let resumable = |step: &&StepRow| matches!(step.status.as_str(), "blocked" | "failed");
            let resumable_step = steps
                .iter()
                .find(|step| step.step_key == run.current_step_key && resumable(step))
                .or_else(|| steps.iter().find(resumable));
            if let Some(step) = resumable_step {
                set_step_running(connection, step.id).await?;
                insert_event(connection, id, Some(step.id), "step_resumed", &format!("{} resumed", step.title)).await?;
            } else if !steps
                .iter()
                .any(|step| matches!(step.status.as_str(), "running" | "waiting_approval"))
            {
                let first = steps
                    .iter()
                    .find(|step| step.step_key == run.current_step_key && step.status == "pending")
                    .or_else(|| steps.iter().find(|step| step.status == "pending"));
                if let Some(step) = first {
                    set_step_running(connection, step.id).await?;
                    insert_event(connection, id, Some(step.id), "step_started", &format!("{} started", step.title)).await?;
                }
            }
            if let Some((_, status)) = score_step_status(connection, id).await? {
                sync_planner_scoring_backlog(connection, id, &status).await?;
            }
            accepted(WorkflowMutationResult { id })
        })
    })
    .await
}

pub(crate) async fn resume_run(
    pool: &SqlitePool,
    input: WorkflowRunIdInput,
) -> Result<ResumeWorkflowRunResult, String> {
    positive(input.id, "Workflow run id")?;
    let id = input.id;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let run = load_run(connection, id).await?;
            if run.autopilot_plan_id.is_some() && run.current_step_key == "draft" {
                return Err(PLANNER_DRAFT_SAVE_ONLY_MESSAGE.to_string());
            }
            let steps = load_steps(connection, id).await?;
            let waiting = steps
                .iter()
                .find(|step| {
                    step.step_key == run.current_step_key && step.status == "waiting_approval"
                })
                .or_else(|| steps.iter().find(|step| step.status == "waiting_approval"));
            let mut linked_agent_is_active = false;
            if let Some(step) = waiting {
                let agent = sqlx::query(
                    "SELECT id, status, output_summary, error_message FROM agent_runs
                     WHERE workflow_run_id = ?1 AND workflow_step_id = ?2 ORDER BY id DESC LIMIT 1",
                )
                .bind(id)
                .bind(step.id)
                .fetch_optional(&mut *connection)
                .await
                .map_err(storage_error)?;
                if let Some(agent) = agent {
                    let status: String = agent.get("status");
                    let output: String = agent.get("output_summary");
                    let error: String = agent.get("error_message");
                    reconcile_workflow_agent_run(
                        connection,
                        &ReconcileAgentRun {
                            agent_run_id: agent.get("id"),
                            status: &status,
                            output_summary: &output,
                            error_message: &error,
                        },
                    )
                    .await?;
                    linked_agent_is_active =
                        matches!(status.as_str(), "queued" | "running" | "waiting_approval");
                }
            }
            accepted(ResumeWorkflowRunResult {
                linked_agent_is_active,
            })
        })
    })
    .await
}

pub(crate) async fn set_step_status(
    pool: &SqlitePool,
    input: SetWorkflowStepStatusInput,
) -> Result<WorkflowMutationResult, String> {
    positive(input.step_id, "Workflow step id")?;
    if !STEP_STATUSES.contains(&input.status.as_str()) {
        return Err("Unsupported workflow step status".to_string());
    }
    let output = bounded(
        &input.output_summary,
        MAX_SUMMARY_UTF16,
        "Output summary",
        false,
    )?;
    let error = bounded(
        &input.error_message,
        MAX_SUMMARY_UTF16,
        "Error message",
        false,
    )?;
    let next = input.status;
    let step_id = input.step_id;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let step = sqlx::query(
                "SELECT ws.workflow_run_id, ws.step_key, ws.title, ws.sort_order, ws.status,
                        wr.status AS run_status, c.status AS campaign_status, ap.id AS autopilot_plan_id
                 FROM workflow_steps ws
                 INNER JOIN workflow_runs wr ON wr.id = ws.workflow_run_id
                 INNER JOIN campaigns c ON c.id = wr.campaign_id
                 LEFT JOIN autopilot_plans ap ON ap.workflow_run_id = wr.id
                 WHERE ws.id = ?1 LIMIT 1",
            )
            .bind(step_id)
            .fetch_optional(&mut *connection)
            .await
            .map_err(storage_error)?
            .ok_or_else(|| "Workflow step was not found".to_string())?;
            let run_id: i64 = step.get("workflow_run_id");
            let run_status: String = step.get("run_status");
            let current: String = step.get("status");
            let step_key: String = step.get("step_key");
            let title: String = step.get("title");
            let sort_order: i64 = step.get("sort_order");
            if step.get::<String, _>("campaign_status") == "archived" {
                return Err("Campaign is archived".to_string());
            }
            if run_status == "cancelled" {
                return Err("Cancelled workflow runs cannot change steps".to_string());
            }
            if run_status == "completed" && next != "running" {
                return Err("Completed workflow runs can only reopen steps".to_string());
            }
            if step.get::<Option<i64>, _>("autopilot_plan_id").is_some()
                && step_key == "draft"
                && is_finished(&next)
            {
                return Err(PLANNER_DRAFT_SAVE_ONLY_MESSAGE.to_string());
            }
            assert_transition(&current, &next)?;
            sqlx::query(
                "UPDATE workflow_steps
                 SET status = ?1, output_summary = ?2, error_message = ?3,
                     started_at = CASE WHEN ?1 = 'running' THEN COALESCE(started_at, datetime('now')) ELSE started_at END,
                     completed_at = CASE
                       WHEN ?1 IN ('completed', 'skipped') THEN datetime('now')
                       WHEN ?1 IN ('running', 'blocked', 'failed', 'waiting_approval') THEN NULL
                       ELSE completed_at END,
                     updated_at = datetime('now')
                 WHERE id = ?4",
            )
            .bind(&next)
            .bind(&output)
            .bind(&error)
            .bind(step_id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            insert_event(
                connection,
                run_id,
                Some(step_id),
                step_event_type(&current, &next),
                &step_event_summary(&title, &current, &next),
            )
            .await?;
            if next == "completed" {
                start_next_pending_step(connection, run_id, sort_order).await?;
            }
            update_run_from_steps(connection, run_id, &run_status).await?;
            if step_key == "score" {
                sync_planner_scoring_backlog(connection, run_id, &next).await?;
            }
            accepted(WorkflowMutationResult { id: step_id })
        })
    })
    .await
}

pub(crate) async fn cancel_run(
    pool: &SqlitePool,
    input: WorkflowRunIdInput,
) -> Result<WorkflowMutationResult, String> {
    positive(input.id, "Workflow run id")?;
    let id = input.id;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let run = load_run(connection, id).await?;
            if run.campaign_status == "archived" {
                return Err("Campaign is archived".to_string());
            }
            sqlx::query(
                "UPDATE workflow_runs SET status = 'cancelled', completed_at = datetime('now'),
                 updated_at = datetime('now') WHERE id = ?1",
            )
            .bind(id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            insert_event(connection, id, None, "run_cancelled", "Workflow run cancelled").await?;
            if let Some((score_id, status)) = score_step_status(connection, id).await? {
                if !is_finished(&status) {
                    sqlx::query(
                        "UPDATE workflow_steps SET status = 'skipped',
                         completed_at = COALESCE(completed_at, datetime('now')), updated_at = datetime('now')
                         WHERE id = ?1",
                    )
                    .bind(score_id)
                    .execute(&mut *connection)
                    .await
                    .map_err(storage_error)?;
                    sync_planner_scoring_backlog(connection, id, "skipped").await?;
                }
            }
            accepted(WorkflowMutationResult { id })
        })
    })
    .await
}

pub(crate) async fn add_note(
    pool: &SqlitePool,
    input: AddWorkflowNoteInput,
) -> Result<WorkflowMutationResult, String> {
    positive(input.workflow_run_id, "Workflow run id")?;
    let note = bounded(&input.note, MAX_SUMMARY_UTF16, "Note", true)?;
    let id = input.workflow_run_id;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let run = load_run(connection, id).await?;
            if run.campaign_status == "archived" {
                return Err("Campaign is archived".to_string());
            }
            insert_event(connection, id, None, "note_added", &note).await?;
            sqlx::query("UPDATE workflow_runs SET updated_at = datetime('now') WHERE id = ?1")
                .bind(id)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
            accepted(WorkflowMutationResult { id })
        })
    })
    .await
}

async fn assert_artifact_ownership(
    connection: &mut SqliteConnection,
    input: &CreateWorkflowArtifactInput,
    campaign_id: i64,
) -> Result<(), String> {
    if let Some(step_id) = input.workflow_step_id {
        let step = sqlx::query(
            "SELECT wr.campaign_id, ws.workflow_run_id FROM workflow_steps ws
             INNER JOIN workflow_runs wr ON wr.id = ws.workflow_run_id WHERE ws.id = ?1 LIMIT 1",
        )
        .bind(step_id)
        .fetch_optional(&mut *connection)
        .await
        .map_err(storage_error)?
        .ok_or_else(|| "Workflow step was not found".to_string())?;
        if step.get::<i64, _>("workflow_run_id") != input.workflow_run_id {
            return Err("Workflow step belongs to a different workflow run".to_string());
        }
        if step.get::<i64, _>("campaign_id") != campaign_id {
            return Err("Workflow step belongs to a different campaign".to_string());
        }
    }
    let query = match input.artifact_type.as_str() {
        "agent_run" => "SELECT campaign_id, workflow_run_id, workflow_step_id FROM agent_runs WHERE id = ?1 LIMIT 1",
        "draft" => "SELECT campaign_id, NULL AS workflow_run_id, NULL AS workflow_step_id FROM drafts WHERE id = ?1 LIMIT 1",
        _ => "SELECT campaign_id, NULL AS workflow_run_id, NULL AS workflow_step_id FROM candidate_posts WHERE id = ?1 LIMIT 1",
    };
    let artifact = sqlx::query(query)
        .bind(input.artifact_id)
        .fetch_optional(&mut *connection)
        .await
        .map_err(storage_error)?
        .ok_or_else(|| "Workflow artifact was not found".to_string())?;
    if artifact.get::<i64, _>("campaign_id") != campaign_id {
        return Err("Artifact belongs to a different campaign".to_string());
    }
    if artifact
        .get::<Option<i64>, _>("workflow_run_id")
        .is_some_and(|run| run != input.workflow_run_id)
    {
        return Err("Artifact belongs to a different workflow run".to_string());
    }
    if let (Some(expected), Some(actual)) = (
        input.workflow_step_id,
        artifact.get::<Option<i64>, _>("workflow_step_id"),
    ) {
        if expected != actual {
            return Err("Artifact belongs to a different workflow step".to_string());
        }
    }
    Ok(())
}

pub(crate) async fn create_artifact(
    pool: &SqlitePool,
    input: CreateWorkflowArtifactInput,
) -> Result<WorkflowMutationResult, String> {
    positive(input.workflow_run_id, "Workflow run id")?;
    positive(input.artifact_id, "Artifact id")?;
    if let Some(step_id) = input.workflow_step_id {
        positive(step_id, "Workflow step id")?;
    }
    if !ARTIFACT_TYPES.contains(&input.artifact_type.as_str()) {
        return Err("Unsupported workflow artifact type".to_string());
    }
    let summary = bounded(&input.summary, MAX_SUMMARY_UTF16, "Summary", false)?;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let run = load_run(connection, input.workflow_run_id).await?;
            if run.campaign_status == "archived" {
                return Err("Campaign is archived".to_string());
            }
            assert_artifact_ownership(connection, &input, run.campaign_id).await?;
            sqlx::query(
                "INSERT INTO workflow_artifacts (workflow_run_id, workflow_step_id, artifact_type, artifact_id, summary, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
                 ON CONFLICT(workflow_run_id, artifact_type, artifact_id) DO UPDATE SET
                   workflow_step_id = excluded.workflow_step_id, summary = excluded.summary,
                   updated_at = datetime('now')",
            )
            .bind(input.workflow_run_id)
            .bind(input.workflow_step_id)
            .bind(&input.artifact_type)
            .bind(input.artifact_id)
            .bind(&summary)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            let artifact_id: i64 = sqlx::query_scalar(
                "SELECT id FROM workflow_artifacts
                 WHERE workflow_run_id = ?1 AND artifact_type = ?2 AND artifact_id = ?3 LIMIT 1",
            )
            .bind(input.workflow_run_id)
            .bind(&input.artifact_type)
            .bind(input.artifact_id)
            .fetch_one(&mut *connection)
            .await
            .map_err(storage_error)?;
            sqlx::query("UPDATE workflow_runs SET updated_at = datetime('now') WHERE id = ?1")
                .bind(input.workflow_run_id)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
            accepted(WorkflowMutationResult { id: artifact_id })
        })
    })
    .await
}

#[tauri::command]
pub async fn linkgo_workflow_create_run(
    pool: State<'_, SqlitePool>,
    input: CreateWorkflowRunInput,
) -> Result<WorkflowMutationResult, String> {
    create_run(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_workflow_start_run(
    pool: State<'_, SqlitePool>,
    input: WorkflowRunIdInput,
) -> Result<WorkflowMutationResult, String> {
    start_run(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_workflow_resume_run(
    pool: State<'_, SqlitePool>,
    input: WorkflowRunIdInput,
) -> Result<ResumeWorkflowRunResult, String> {
    resume_run(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_workflow_set_step_status(
    pool: State<'_, SqlitePool>,
    input: SetWorkflowStepStatusInput,
) -> Result<WorkflowMutationResult, String> {
    set_step_status(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_workflow_cancel_run(
    pool: State<'_, SqlitePool>,
    input: WorkflowRunIdInput,
) -> Result<WorkflowMutationResult, String> {
    cancel_run(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_workflow_add_note(
    pool: State<'_, SqlitePool>,
    input: AddWorkflowNoteInput,
) -> Result<WorkflowMutationResult, String> {
    add_note(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_workflow_create_artifact(
    pool: State<'_, SqlitePool>,
    input: CreateWorkflowArtifactInput,
) -> Result<WorkflowMutationResult, String> {
    create_artifact(pool.inner(), input).await
}

#[cfg(test)]
#[path = "workflows_tests.rs"]
mod tests;
