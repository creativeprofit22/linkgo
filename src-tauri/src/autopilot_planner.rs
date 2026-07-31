use serde::Serialize;
use serde_json::json;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    Row, SqliteConnection, SqlitePool,
};
use std::future::Future;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::pin::Pin;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{async_runtime::JoinHandle, AppHandle, State};
use tokio::sync::oneshot;
use tokio::time::{interval_at, timeout, Instant, MissedTickBehavior};
use tokio_util::sync::CancellationToken;

use crate::auth::publish::app_sqlite_path;

const CANONICAL_WORKFLOW_STEPS: [(&str, &str, &str, i64); 7] = [
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

struct AutopilotPlannerWorker {
    runner_id: String,
    cancellation: CancellationToken,
    task: Option<JoinHandle<()>>,
    running: bool,
}

#[derive(Default)]
pub(crate) struct AutopilotPlannerWorkerState {
    worker: Mutex<Option<AutopilotPlannerWorker>>,
}

enum StartReservation {
    Reserved,
    AlreadyRunning,
    AlreadyStarting,
}

type WorkerFuture = Pin<Box<dyn Future<Output = ()> + Send + 'static>>;
type WorkerSpawner = fn(WorkerFuture) -> Result<JoinHandle<()>, String>;

const WORKER_START_TIMEOUT: Duration = Duration::from_secs(5);
const WORKER_STOP_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutopilotPlannerSettingsPayload {
    pub enabled: bool,
    pub poll_interval_minutes: i64,
    pub max_batches_per_tick: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutopilotPlannerStatusPayload {
    pub enabled: bool,
    pub running: bool,
    pub runner_id: Option<String>,
    pub settings: AutopilotPlannerSettingsPayload,
}

#[derive(Debug, Clone)]
pub(crate) struct AutopilotPlannerSettings {
    pub enabled: bool,
    pub poll_interval_minutes: i64,
    pub max_batches_per_tick: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutopilotPlannerTickResult {
    pub claimed: i64,
    pub planned: i64,
    pub skipped: i64,
    pub failed: i64,
    pub blocked: i64,
}

#[derive(Debug, Clone)]
struct EligibleSourceBatch {
    id: i64,
    campaign_id: i64,
}

#[derive(Debug, Clone)]
struct RevalidatedSourceBatch {
    id: i64,
    campaign_id: i64,
    source_type: String,
    candidate_count: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BatchPlanningOutcome {
    Planned,
    Skipped,
    Blocked,
    AlreadyPlanned,
    Ineligible,
}

pub(crate) async fn ensure_settings_row(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query("INSERT OR IGNORE INTO autopilot_planner_settings (id) VALUES (1)")
        .execute(pool)
        .await
        .map_err(|_| "Could not initialize autopilot planner settings".to_string())?;
    Ok(())
}

pub(crate) async fn load_settings(pool: &SqlitePool) -> Result<AutopilotPlannerSettings, String> {
    ensure_settings_row(pool).await?;
    let row = sqlx::query(
        "SELECT enabled, poll_interval_minutes, max_batches_per_tick, updated_at
           FROM autopilot_planner_settings
          WHERE id = 1",
    )
    .fetch_one(pool)
    .await
    .map_err(|_| "Could not read autopilot planner settings".to_string())?;

    Ok(AutopilotPlannerSettings {
        enabled: row.try_get::<i64, _>("enabled").unwrap_or(0) == 1,
        poll_interval_minutes: row.try_get("poll_interval_minutes").unwrap_or(60),
        max_batches_per_tick: row.try_get("max_batches_per_tick").unwrap_or(3),
        updated_at: row.try_get("updated_at").unwrap_or_default(),
    })
}

pub(crate) async fn set_enabled(pool: &SqlitePool, enabled: bool) -> Result<(), String> {
    ensure_settings_row(pool).await?;
    sqlx::query(
        "UPDATE autopilot_planner_settings
            SET enabled = ?1,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = 1",
    )
    .bind(if enabled { 1 } else { 0 })
    .execute(pool)
    .await
    .map_err(|_| "Could not update autopilot planner settings".to_string())?;
    Ok(())
}

fn enabled_kill_switch_reason(global_kill_switch: i64, reason: &str) -> Option<String> {
    if global_kill_switch != 1 {
        return None;
    }

    Some(if reason.trim().is_empty() {
        "Global kill switch is enabled".to_string()
    } else {
        format!("Global kill switch is enabled: {}", reason.trim())
    })
}

pub(crate) async fn kill_switch_block_reason(pool: &SqlitePool) -> Result<Option<String>, String> {
    let row = sqlx::query(
        "SELECT global_kill_switch, kill_switch_reason
           FROM safety_settings
          WHERE id = 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(|_| "Could not read safety settings".to_string())?;

    let Some(row) = row else {
        return Ok(None);
    };
    Ok(enabled_kill_switch_reason(
        row.try_get::<i64, _>("global_kill_switch").unwrap_or(0),
        &row.try_get::<String, _>("kill_switch_reason")
            .unwrap_or_default(),
    ))
}

async fn kill_switch_block_reason_on_connection(
    connection: &mut SqliteConnection,
) -> Result<Option<String>, String> {
    let row = sqlx::query(
        "SELECT global_kill_switch, kill_switch_reason
           FROM safety_settings
          WHERE id = 1",
    )
    .fetch_optional(&mut *connection)
    .await
    .map_err(|_| "Could not read safety settings".to_string())?;

    let Some(row) = row else {
        return Ok(None);
    };
    Ok(enabled_kill_switch_reason(
        row.try_get::<i64, _>("global_kill_switch").unwrap_or(0),
        &row.try_get::<String, _>("kill_switch_reason")
            .unwrap_or_default(),
    ))
}

#[allow(clippy::too_many_arguments)]
async fn insert_event_on_connection(
    connection: &mut SqliteConnection,
    campaign_id: Option<i64>,
    source_import_batch_id: Option<i64>,
    autopilot_plan_id: Option<i64>,
    event_type: &str,
    severity: &str,
    summary: &str,
    metadata_json: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO autopilot_planner_events (
            campaign_id,
            source_import_batch_id,
            autopilot_plan_id,
            event_type,
            severity,
            summary,
            metadata_json
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(campaign_id)
    .bind(source_import_batch_id)
    .bind(autopilot_plan_id)
    .bind(event_type)
    .bind(severity)
    .bind(summary)
    .bind(metadata_json)
    .execute(connection)
    .await
    .map_err(|_| "Could not record autopilot planner event".to_string())?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn insert_event(
    pool: &SqlitePool,
    campaign_id: Option<i64>,
    source_import_batch_id: Option<i64>,
    autopilot_plan_id: Option<i64>,
    event_type: &str,
    severity: &str,
    summary: &str,
    metadata_json: &str,
) -> Result<(), String> {
    let mut connection = pool
        .acquire()
        .await
        .map_err(|_| "Could not open autopilot planner event connection".to_string())?;
    insert_event_on_connection(
        &mut connection,
        campaign_id,
        source_import_batch_id,
        autopilot_plan_id,
        event_type,
        severity,
        summary,
        metadata_json,
    )
    .await
}

async fn select_eligible_batches(
    pool: &SqlitePool,
    max_batches: i64,
) -> Result<Vec<EligibleSourceBatch>, String> {
    let rows = sqlx::query(
        "SELECT sib.id, sib.campaign_id
           FROM source_import_batches sib
           INNER JOIN campaigns c ON c.id = sib.campaign_id
           LEFT JOIN autopilot_plans ap ON ap.source_import_batch_id = sib.id
          WHERE c.status = 'active'
            AND c.auto_pilot = 1
            AND sib.status IN ('completed', 'completed_with_errors')
            AND sib.accepted_count > 0
            AND ap.id IS NULL
          ORDER BY datetime(sib.created_at) ASC, sib.id ASC
          LIMIT ?1",
    )
    .bind(max_batches.clamp(1, 20))
    .fetch_all(pool)
    .await
    .map_err(|_| "Could not read eligible autopilot source batches".to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| EligibleSourceBatch {
            id: row.try_get("id").unwrap_or_default(),
            campaign_id: row.try_get("campaign_id").unwrap_or_default(),
        })
        .collect())
}

async fn revalidate_source_batch(
    connection: &mut SqliteConnection,
    source_import_batch_id: i64,
) -> Result<Option<RevalidatedSourceBatch>, String> {
    let row = sqlx::query(
        "SELECT
            sib.id,
            sib.campaign_id,
            sib.source_type,
            sib.status AS batch_status,
            sib.accepted_count,
            c.status AS campaign_status,
            c.auto_pilot,
            ap.id AS autopilot_plan_id,
            (
                SELECT COUNT(*)
                  FROM source_import_items sii
                 WHERE sii.source_import_batch_id = sib.id
                   AND sii.status = 'accepted'
                   AND sii.candidate_post_id IS NOT NULL
            ) AS candidate_count
           FROM source_import_batches sib
           INNER JOIN campaigns c ON c.id = sib.campaign_id
           LEFT JOIN autopilot_plans ap ON ap.source_import_batch_id = sib.id
          WHERE sib.id = ?1
          LIMIT 1",
    )
    .bind(source_import_batch_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(|_| "Could not revalidate autopilot source batch".to_string())?;

    let Some(row) = row else {
        return Ok(None);
    };
    let already_planned = row
        .try_get::<Option<i64>, _>("autopilot_plan_id")
        .unwrap_or(None)
        .is_some();
    if already_planned {
        return Ok(None);
    }
    let campaign_status: String = row.try_get("campaign_status").unwrap_or_default();
    let auto_pilot: i64 = row.try_get("auto_pilot").unwrap_or(0);
    let batch_status: String = row.try_get("batch_status").unwrap_or_default();
    let accepted_count: i64 = row.try_get("accepted_count").unwrap_or(0);
    if campaign_status != "active"
        || auto_pilot != 1
        || !matches!(batch_status.as_str(), "completed" | "completed_with_errors")
        || accepted_count <= 0
    {
        return Ok(None);
    }

    Ok(Some(RevalidatedSourceBatch {
        id: row.try_get("id").unwrap_or_default(),
        campaign_id: row.try_get("campaign_id").unwrap_or_default(),
        source_type: row.try_get("source_type").unwrap_or_default(),
        candidate_count: row.try_get("candidate_count").unwrap_or(0),
    }))
}

async fn source_batch_has_plan(
    connection: &mut SqliteConnection,
    source_import_batch_id: i64,
) -> Result<bool, String> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM autopilot_plans WHERE source_import_batch_id = ?1",
    )
    .bind(source_import_batch_id)
    .fetch_one(connection)
    .await
    .map_err(|_| "Could not check autopilot source ownership".to_string())?;
    Ok(count > 0)
}

async fn insert_skipped_plan(
    connection: &mut SqliteConnection,
    batch: &RevalidatedSourceBatch,
) -> Result<(), String> {
    let summary = format!(
        "No current accepted candidates remain for source batch #{}.",
        batch.id
    );
    let plan_result = sqlx::query(
        "INSERT INTO autopilot_plans (
            campaign_id,
            source_import_batch_id,
            source_type,
            status,
            candidate_count,
            summary
        ) VALUES (?1, ?2, ?3, 'skipped', 0, ?4)",
    )
    .bind(batch.campaign_id)
    .bind(batch.id)
    .bind(&batch.source_type)
    .bind(&summary)
    .execute(&mut *connection)
    .await
    .map_err(|_| "Could not store skipped autopilot plan".to_string())?;
    let plan_id = plan_result.last_insert_rowid();

    insert_event_on_connection(
        connection,
        Some(batch.campaign_id),
        Some(batch.id),
        Some(plan_id),
        "batch_skipped",
        "warning",
        "Source batch skipped because no current accepted candidates remain.",
        &json!({ "candidateCount": 0 }).to_string(),
    )
    .await
}

async fn insert_planned_work(
    connection: &mut SqliteConnection,
    batch: &RevalidatedSourceBatch,
) -> Result<(), String> {
    let workflow_title = format!("Autopilot scoring for source batch #{}", batch.id);
    let workflow_context = format!(
        "Policy-enforced {} source batch #{} has {} current accepted candidate(s). Research is complete; scoring awaits operator execution.",
        batch.source_type, batch.id, batch.candidate_count
    );
    let workflow_result = sqlx::query(
        "INSERT INTO workflow_runs (
            campaign_id,
            workflow_type,
            title,
            status,
            current_step_key,
            context_summary
        ) VALUES (?1, 'content_pipeline', ?2, 'queued', 'score', ?3)",
    )
    .bind(batch.campaign_id)
    .bind(&workflow_title)
    .bind(&workflow_context)
    .execute(&mut *connection)
    .await
    .map_err(|_| "Could not create autopilot workflow run".to_string())?;
    let workflow_run_id = workflow_result.last_insert_rowid();

    let mut research_step_id = None;
    let mut score_step_id = None;
    for (step_key, title, description, sort_order) in CANONICAL_WORKFLOW_STEPS {
        let is_research = step_key == "research";
        let output_summary = if is_research {
            format!(
                "Research completed from policy-enforced source batch #{} with {} current accepted candidate(s).",
                batch.id, batch.candidate_count
            )
        } else {
            String::new()
        };
        let step_result = sqlx::query(
            "INSERT INTO workflow_steps (
                workflow_run_id,
                step_key,
                title,
                description,
                sort_order,
                status,
                output_summary,
                started_at,
                completed_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7,
                CASE WHEN ?6 = 'completed' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE NULL END,
                CASE WHEN ?6 = 'completed' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE NULL END
            )",
        )
        .bind(workflow_run_id)
        .bind(step_key)
        .bind(title)
        .bind(description)
        .bind(sort_order)
        .bind(if is_research { "completed" } else { "pending" })
        .bind(output_summary)
        .execute(&mut *connection)
        .await
        .map_err(|_| "Could not create autopilot workflow steps".to_string())?;
        if is_research {
            research_step_id = Some(step_result.last_insert_rowid());
        } else if step_key == "score" {
            score_step_id = Some(step_result.last_insert_rowid());
        }
    }

    let score_step_id = score_step_id
        .ok_or_else(|| "Could not resolve the autopilot workflow scoring step".to_string())?;
    let artifact_result = sqlx::query(
        "INSERT INTO workflow_artifacts (
            workflow_run_id, workflow_step_id, artifact_type, artifact_id, summary
         )
         SELECT
            ?1, ?2, 'candidate_post', sii.candidate_post_id,
            'Planner scoring candidate from source batch #' || ?3
         FROM source_import_items sii
         INNER JOIN candidate_posts cp
            ON cp.id = sii.candidate_post_id
           AND cp.campaign_id = ?4
         WHERE sii.source_import_batch_id = ?3
           AND sii.status = 'accepted'
           AND sii.candidate_post_id IS NOT NULL
         ORDER BY sii.id ASC",
    )
    .bind(workflow_run_id)
    .bind(score_step_id)
    .bind(batch.id)
    .bind(batch.campaign_id)
    .execute(&mut *connection)
    .await
    .map_err(|_| "Could not attach autopilot candidate scope".to_string())?;
    if artifact_result.rows_affected() != batch.candidate_count as u64 {
        return Err("Autopilot candidate scope changed during materialization".to_string());
    }

    sqlx::query(
        "INSERT INTO workflow_events (
            workflow_run_id, workflow_step_id, event_type, summary
        ) VALUES (?1, NULL, 'run_created', 'Workflow run created')",
    )
    .bind(workflow_run_id)
    .execute(&mut *connection)
    .await
    .map_err(|_| "Could not record autopilot workflow creation".to_string())?;
    sqlx::query(
        "INSERT INTO workflow_events (
            workflow_run_id, workflow_step_id, event_type, summary
        ) VALUES (?1, ?2, 'step_completed', 'Research completed from source batch')",
    )
    .bind(workflow_run_id)
    .bind(research_step_id)
    .execute(&mut *connection)
    .await
    .map_err(|_| "Could not record autopilot research completion".to_string())?;

    let backlog_details = format!(
        "Score {} current accepted candidate(s) from source batch #{}. Queued workflow #{}; no model or external action has started.",
        batch.candidate_count, batch.id, workflow_run_id
    );
    let backlog_result = sqlx::query(
        "INSERT INTO campaign_backlog_items (
            campaign_id,
            work_type,
            title,
            details,
            owner_type,
            status,
            due_at,
            recurrence,
            recurrence_timezone
        ) VALUES (
            ?1,
            'scoring',
            ?2,
            ?3,
            'linkgo',
            'pending',
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            'none',
            ''
        )",
    )
    .bind(batch.campaign_id)
    .bind(format!("Score source batch #{}", batch.id))
    .bind(backlog_details)
    .execute(&mut *connection)
    .await
    .map_err(|_| "Could not create autopilot backlog item".to_string())?;
    let backlog_item_id = backlog_result.last_insert_rowid();

    let plan_summary = format!(
        "Created backlog item #{} and queued workflow #{} from {} current accepted candidate(s).",
        backlog_item_id, workflow_run_id, batch.candidate_count
    );
    let plan_result = sqlx::query(
        "INSERT INTO autopilot_plans (
            campaign_id,
            source_import_batch_id,
            source_type,
            status,
            campaign_backlog_item_id,
            workflow_run_id,
            candidate_count,
            summary
        ) VALUES (?1, ?2, ?3, 'planned', ?4, ?5, ?6, ?7)",
    )
    .bind(batch.campaign_id)
    .bind(batch.id)
    .bind(&batch.source_type)
    .bind(backlog_item_id)
    .bind(workflow_run_id)
    .bind(batch.candidate_count)
    .bind(&plan_summary)
    .execute(&mut *connection)
    .await
    .map_err(|_| "Could not store autopilot plan linkage".to_string())?;
    let plan_id = plan_result.last_insert_rowid();

    insert_event_on_connection(
        connection,
        Some(batch.campaign_id),
        Some(batch.id),
        Some(plan_id),
        "batch_planned",
        "info",
        "Source batch converted into a Linkgo backlog item and queued workflow.",
        &json!({
            "candidateCount": batch.candidate_count,
            "campaignBacklogItemId": backlog_item_id,
            "workflowRunId": workflow_run_id
        })
        .to_string(),
    )
    .await
}

async fn materialize_batch_in_transaction(
    connection: &mut SqliteConnection,
    source_import_batch_id: i64,
) -> Result<BatchPlanningOutcome, String> {
    if let Some(reason) = kill_switch_block_reason_on_connection(connection).await? {
        insert_event_on_connection(
            connection,
            None,
            Some(source_import_batch_id),
            None,
            "planner_blocked",
            "warning",
            "Source batch materialization blocked by the global kill switch.",
            &json!({ "reason": reason }).to_string(),
        )
        .await?;
        return Ok(BatchPlanningOutcome::Blocked);
    }

    if source_batch_has_plan(connection, source_import_batch_id).await? {
        return Ok(BatchPlanningOutcome::AlreadyPlanned);
    }
    let Some(batch) = revalidate_source_batch(connection, source_import_batch_id).await? else {
        return Ok(BatchPlanningOutcome::Ineligible);
    };

    if batch.candidate_count == 0 {
        insert_skipped_plan(connection, &batch).await?;
        return Ok(BatchPlanningOutcome::Skipped);
    }

    insert_planned_work(connection, &batch).await?;
    Ok(BatchPlanningOutcome::Planned)
}

async fn materialize_batch(
    pool: &SqlitePool,
    source_import_batch_id: i64,
) -> Result<BatchPlanningOutcome, String> {
    let mut connection = pool
        .acquire()
        .await
        .map_err(|_| "Could not open autopilot planner transaction".to_string())?;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *connection)
        .await
        .map_err(|_| "Could not start autopilot planner transaction".to_string())?;

    let result = materialize_batch_in_transaction(&mut connection, source_import_batch_id).await;
    match result {
        Ok(outcome) => {
            sqlx::query("COMMIT")
                .execute(&mut *connection)
                .await
                .map_err(|_| "Could not commit autopilot planner transaction".to_string())?;
            Ok(outcome)
        }
        Err(error) => {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            Err(error)
        }
    }
}

pub(crate) async fn run_tick_with_pool(
    pool: &SqlitePool,
    runner_id: &str,
) -> Result<AutopilotPlannerTickResult, String> {
    let settings = load_settings(pool).await?;
    let mut result = AutopilotPlannerTickResult {
        claimed: 0,
        planned: 0,
        skipped: 0,
        failed: 0,
        blocked: 0,
    };

    insert_event(
        pool,
        None,
        None,
        None,
        "tick_started",
        "info",
        "Autopilot planner tick started.",
        &json!({ "runnerId": runner_id }).to_string(),
    )
    .await?;

    if let Some(reason) = kill_switch_block_reason(pool).await? {
        result.blocked = 1;
        insert_event(
            pool,
            None,
            None,
            None,
            "planner_blocked",
            "warning",
            "Autopilot planner tick blocked by the global kill switch.",
            &json!({ "reason": reason }).to_string(),
        )
        .await?;
        insert_event(
            pool,
            None,
            None,
            None,
            "tick_completed",
            "info",
            "Autopilot planner tick completed without creating work.",
            &json!({ "blocked": result.blocked }).to_string(),
        )
        .await?;
        return Ok(result);
    }

    let eligible_batches = select_eligible_batches(pool, settings.max_batches_per_tick).await?;
    for eligible in eligible_batches {
        match materialize_batch(pool, eligible.id).await {
            Ok(BatchPlanningOutcome::Planned) => {
                result.claimed += 1;
                result.planned += 1;
            }
            Ok(BatchPlanningOutcome::Skipped) => {
                result.claimed += 1;
                result.skipped += 1;
            }
            Ok(BatchPlanningOutcome::Blocked) => {
                result.blocked += 1;
                break;
            }
            Ok(BatchPlanningOutcome::AlreadyPlanned | BatchPlanningOutcome::Ineligible) => {}
            Err(_) => {
                result.claimed += 1;
                result.failed += 1;
                let _ = insert_event(
                    pool,
                    Some(eligible.campaign_id),
                    Some(eligible.id),
                    None,
                    "batch_failed",
                    "error",
                    &format!(
                        "Source batch #{} could not be planned due to a local database error.",
                        eligible.id
                    ),
                    "{}",
                )
                .await;
            }
        }
    }

    insert_event(
        pool,
        None,
        None,
        None,
        "tick_completed",
        "info",
        "Autopilot planner tick completed.",
        &json!({
            "claimed": result.claimed,
            "planned": result.planned,
            "skipped": result.skipped,
            "failed": result.failed,
            "blocked": result.blocked
        })
        .to_string(),
    )
    .await?;

    Ok(result)
}

impl AutopilotPlannerWorkerState {
    fn reserve_start(
        &self,
        runner_id: String,
        cancellation: CancellationToken,
    ) -> StartReservation {
        let mut guard = self
            .worker
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(worker) = guard.as_ref() {
            let task_is_active = worker
                .task
                .as_ref()
                .is_some_and(|task| !task.inner().is_finished());
            if worker.running && !worker.cancellation.is_cancelled() && task_is_active {
                return StartReservation::AlreadyRunning;
            }
            if !worker.running && !worker.cancellation.is_cancelled() {
                return StartReservation::AlreadyStarting;
            }
        }

        *guard = Some(AutopilotPlannerWorker {
            runner_id,
            cancellation,
            task: None,
            running: false,
        });
        StartReservation::Reserved
    }

    fn attach_task(&self, runner_id: &str, task: JoinHandle<()>) -> Result<(), JoinHandle<()>> {
        let mut guard = self
            .worker
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(worker) = guard.as_mut() else {
            return Err(task);
        };
        if worker.runner_id != runner_id
            || worker.cancellation.is_cancelled()
            || worker.task.is_some()
        {
            return Err(task);
        }
        worker.task = Some(task);
        Ok(())
    }

    fn mark_running(&self, runner_id: &str) -> bool {
        let mut guard = self
            .worker
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(worker) = guard.as_mut() else {
            return false;
        };
        let task_is_active = worker
            .task
            .as_ref()
            .is_some_and(|task| !task.inner().is_finished());
        if worker.runner_id != runner_id || worker.cancellation.is_cancelled() || !task_is_active {
            return false;
        }
        worker.running = true;
        true
    }

    fn take_matching(&self, runner_id: &str) -> Option<AutopilotPlannerWorker> {
        let mut guard = self
            .worker
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if guard
            .as_ref()
            .is_some_and(|worker| worker.runner_id == runner_id)
        {
            guard.take()
        } else {
            None
        }
    }

    fn take_worker(&self) -> Option<AutopilotPlannerWorker> {
        self.worker
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take()
    }

    fn current_worker(&self) -> (bool, Option<String>) {
        let mut guard = self
            .worker
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(worker) = guard.as_ref() else {
            return (false, None);
        };
        let task_is_active = worker
            .task
            .as_ref()
            .is_some_and(|task| !task.inner().is_finished());
        if worker.running && !worker.cancellation.is_cancelled() && task_is_active {
            return (true, Some(worker.runner_id.clone()));
        }
        if worker.running {
            guard.take();
        }
        (false, None)
    }
}

fn unix_timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn create_runner_id(prefix: &str) -> String {
    format!("{prefix}-{}", unix_timestamp_millis())
}

pub(crate) fn managed_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let options = SqliteConnectOptions::new()
        .filename(app_sqlite_path(app)?)
        .create_if_missing(true)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5));
    Ok(SqlitePoolOptions::new()
        .max_connections(4)
        .connect_lazy_with(options))
}

fn current_worker(worker_state: &AutopilotPlannerWorkerState) -> (bool, Option<String>) {
    worker_state.current_worker()
}

fn status_from_settings(
    settings: AutopilotPlannerSettings,
    running: bool,
    runner_id: Option<String>,
) -> AutopilotPlannerStatusPayload {
    AutopilotPlannerStatusPayload {
        enabled: settings.enabled,
        running,
        runner_id,
        settings: AutopilotPlannerSettingsPayload {
            enabled: settings.enabled,
            poll_interval_minutes: settings.poll_interval_minutes,
            max_batches_per_tick: settings.max_batches_per_tick,
            updated_at: settings.updated_at,
        },
    }
}

fn poll_interval(poll_interval_minutes: i64) -> Duration {
    Duration::from_secs(poll_interval_minutes.clamp(5, 1440) as u64 * 60)
}

async fn record_tick_failure(pool: &SqlitePool, runner_id: &str) -> Result<(), String> {
    insert_event(
        pool,
        None,
        None,
        None,
        "tick_failed",
        "error",
        "Autopilot planner tick failed due to a local database error.",
        &json!({ "runnerId": runner_id }).to_string(),
    )
    .await
}

async fn run_worker_tick(pool: &SqlitePool, runner_id: &str) {
    if run_tick_with_pool(pool, runner_id).await.is_err() {
        let _ = record_tick_failure(pool, runner_id).await;
    }
}

async fn run_worker(
    pool: SqlitePool,
    runner_id: String,
    cancellation: CancellationToken,
    mut activation: oneshot::Receiver<()>,
    ready: oneshot::Sender<()>,
    initial_poll_interval: Duration,
) {
    let activated = tokio::select! {
        _ = cancellation.cancelled() => false,
        result = &mut activation => result.is_ok(),
    };
    if !activated {
        return;
    }

    run_worker_tick(&pool, &runner_id).await;
    if ready.send(()).is_err() {
        return;
    }

    let next_poll_interval = load_settings(&pool)
        .await
        .map(|settings| poll_interval(settings.poll_interval_minutes))
        .unwrap_or(initial_poll_interval);
    let mut ticker = interval_at(Instant::now() + next_poll_interval, next_poll_interval);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
    loop {
        tokio::select! {
            _ = cancellation.cancelled() => break,
            _ = ticker.tick() => {}
        }

        run_worker_tick(&pool, &runner_id).await;

        let next_poll_interval = load_settings(&pool)
            .await
            .map(|settings| poll_interval(settings.poll_interval_minutes))
            .unwrap_or_else(|_| poll_interval(60));
        ticker = interval_at(Instant::now() + next_poll_interval, next_poll_interval);
        ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
    }
}

fn spawn_worker_task(task: WorkerFuture) -> Result<JoinHandle<()>, String> {
    catch_unwind(AssertUnwindSafe(|| tauri::async_runtime::spawn(task)))
        .map_err(|_| "Could not spawn the autopilot planner worker".to_string())
}

async fn cancel_worker(mut worker: AutopilotPlannerWorker) {
    worker.cancellation.cancel();
    let Some(mut task) = worker.task.take() else {
        return;
    };
    if timeout(WORKER_STOP_TIMEOUT, &mut task).await.is_err() {
        task.abort();
    }
}

async fn status_with_pool(
    pool: &SqlitePool,
    worker_state: &AutopilotPlannerWorkerState,
) -> Result<AutopilotPlannerStatusPayload, String> {
    let settings = load_settings(pool).await?;
    let (running, runner_id) = current_worker(worker_state);
    Ok(status_from_settings(settings, running, runner_id))
}

async fn rollback_failed_start(
    pool: &SqlitePool,
    worker_state: &AutopilotPlannerWorkerState,
    runner_id: &str,
) {
    let _ = set_enabled(pool, false).await;
    if let Some(worker) = worker_state.take_matching(runner_id) {
        cancel_worker(worker).await;
    }
}

async fn start_worker_with_pool(
    pool: &SqlitePool,
    worker_state: &AutopilotPlannerWorkerState,
    spawn: WorkerSpawner,
) -> Result<AutopilotPlannerStatusPayload, String> {
    if let Some(reason) = kill_switch_block_reason(pool).await? {
        insert_event(
            pool,
            None,
            None,
            None,
            "planner_blocked",
            "warning",
            "Autopilot planner start blocked by the global kill switch.",
            &json!({ "reason": reason }).to_string(),
        )
        .await?;
        return Err(reason);
    }

    set_enabled(pool, true).await?;
    let settings = match load_settings(pool).await {
        Ok(settings) => settings,
        Err(error) => {
            let _ = set_enabled(pool, false).await;
            return Err(error);
        }
    };
    let runner_id = create_runner_id("autopilot");
    let cancellation = CancellationToken::new();
    match worker_state.reserve_start(runner_id.clone(), cancellation.clone()) {
        StartReservation::AlreadyRunning => {
            let (running, active_runner_id) = current_worker(worker_state);
            return Ok(status_from_settings(settings, running, active_runner_id));
        }
        StartReservation::AlreadyStarting => {
            return Err("Autopilot planner startup is already in progress".to_string());
        }
        StartReservation::Reserved => {}
    }

    let (activation_sender, activation_receiver) = oneshot::channel();
    let (ready_sender, ready_receiver) = oneshot::channel();
    let task = Box::pin(run_worker(
        pool.clone(),
        runner_id.clone(),
        cancellation,
        activation_receiver,
        ready_sender,
        poll_interval(settings.poll_interval_minutes),
    ));
    let task = match spawn(task) {
        Ok(task) => task,
        Err(error) => {
            rollback_failed_start(pool, worker_state, &runner_id).await;
            return Err(error);
        }
    };
    if let Err(task) = worker_state.attach_task(&runner_id, task) {
        task.abort();
        rollback_failed_start(pool, worker_state, &runner_id).await;
        return Err("Autopilot planner startup was interrupted".to_string());
    }

    if let Err(error) = insert_event(
        pool,
        None,
        None,
        None,
        "planner_started",
        "info",
        "Background autopilot planner started.",
        &json!({ "runnerId": &runner_id }).to_string(),
    )
    .await
    {
        rollback_failed_start(pool, worker_state, &runner_id).await;
        return Err(error);
    }

    if activation_sender.send(()).is_err() {
        rollback_failed_start(pool, worker_state, &runner_id).await;
        return Err("Autopilot planner task stopped during startup".to_string());
    }
    match timeout(WORKER_START_TIMEOUT, ready_receiver).await {
        Ok(Ok(())) if worker_state.mark_running(&runner_id) => {}
        Ok(Ok(())) => {
            rollback_failed_start(pool, worker_state, &runner_id).await;
            return Err("Autopilot planner startup was interrupted".to_string());
        }
        Ok(Err(_)) => {
            rollback_failed_start(pool, worker_state, &runner_id).await;
            return Err("Autopilot planner task stopped during startup".to_string());
        }
        Err(_) => {
            rollback_failed_start(pool, worker_state, &runner_id).await;
            return Err("Autopilot planner startup timed out".to_string());
        }
    }

    status_with_pool(pool, worker_state).await
}

async fn stop_worker_with_pool(
    pool: &SqlitePool,
    worker_state: &AutopilotPlannerWorkerState,
) -> Result<AutopilotPlannerStatusPayload, String> {
    set_enabled(pool, false).await?;
    let worker = worker_state.take_worker();
    let runner_id = worker.as_ref().map(|worker| worker.runner_id.clone());
    if let Some(worker) = worker {
        cancel_worker(worker).await;
    }

    insert_event(
        pool,
        None,
        None,
        None,
        "planner_stopped",
        "info",
        "Background autopilot planner stopped.",
        &json!({ "runnerId": runner_id.as_deref().unwrap_or("none") }).to_string(),
    )
    .await?;
    status_with_pool(pool, worker_state).await
}

#[tauri::command]
pub async fn linkgo_autopilot_planner_status(
    pool: State<'_, SqlitePool>,
    worker_state: State<'_, AutopilotPlannerWorkerState>,
) -> Result<AutopilotPlannerStatusPayload, String> {
    status_with_pool(pool.inner(), worker_state.inner()).await
}

#[tauri::command]
pub async fn linkgo_autopilot_planner_start(
    pool: State<'_, SqlitePool>,
    worker_state: State<'_, AutopilotPlannerWorkerState>,
) -> Result<AutopilotPlannerStatusPayload, String> {
    start_worker_with_pool(pool.inner(), worker_state.inner(), spawn_worker_task).await
}

#[tauri::command]
pub async fn linkgo_autopilot_planner_stop(
    pool: State<'_, SqlitePool>,
    worker_state: State<'_, AutopilotPlannerWorkerState>,
) -> Result<AutopilotPlannerStatusPayload, String> {
    stop_worker_with_pool(pool.inner(), worker_state.inner()).await
}

#[tauri::command]
pub async fn linkgo_autopilot_planner_tick(
    pool: State<'_, SqlitePool>,
    worker_state: State<'_, AutopilotPlannerWorkerState>,
) -> Result<AutopilotPlannerTickResult, String> {
    let runner_id = current_worker(worker_state.inner())
        .1
        .unwrap_or_else(|| create_runner_id("manual"));
    run_tick_with_pool(pool.inner(), &runner_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations;
    use sqlx::{sqlite::SqliteConnectOptions, sqlite::SqlitePoolOptions, Executor};
    use std::str::FromStr;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::Duration;
    use tauri_plugin_sql::MigrationKind;

    static DATABASE_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    async fn migrated_pool(max_connections: u32) -> SqlitePool {
        let sequence = DATABASE_SEQUENCE.fetch_add(1, Ordering::SeqCst);
        let url = format!("sqlite:file:autopilot-planner-{sequence}?mode=memory&cache=shared");
        let options = SqliteConnectOptions::from_str(&url)
            .expect("planner test URL should be valid")
            .foreign_keys(true)
            .busy_timeout(Duration::from_secs(5));
        let pool = SqlitePoolOptions::new()
            .max_connections(max_connections)
            .connect_lazy_with(options);
        for migration in migrations::get_migrations()
            .into_iter()
            .filter(|migration| {
                matches!(migration.kind, MigrationKind::Up)
                    && matches!(
                        migration.version,
                        1 | 2 | 6 | 7 | 8 | 20 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29
                    )
            })
        {
            pool.execute(migration.sql)
                .await
                .unwrap_or_else(|error| panic!("{} migration failed: {error}", migration.version));
        }
        pool
    }

    async fn seed_campaign(pool: &SqlitePool, id: i64, status: &str, auto_pilot: bool) {
        sqlx::query(
            "INSERT INTO campaigns (id, name, status, auto_pilot)
             VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(id)
        .bind(format!("Campaign {id}"))
        .bind(status)
        .bind(if auto_pilot { 1 } else { 0 })
        .execute(pool)
        .await
        .expect("campaign should insert");
    }

    async fn seed_terminal_batch(
        pool: &SqlitePool,
        id: i64,
        campaign_id: i64,
        status: &str,
        created_at: &str,
        with_current_candidate: bool,
    ) {
        sqlx::query(
            "INSERT INTO source_import_batches (
                id, campaign_id, source_type, status, total_count, accepted_count,
                duplicate_count, rejected_count, error_message, created_at, updated_at
             ) VALUES (?1, ?2, 'local_json', ?3, 1, 1, 0, 0, '', ?4, ?4)",
        )
        .bind(id)
        .bind(campaign_id)
        .bind(status)
        .bind(created_at)
        .execute(pool)
        .await
        .expect("source batch should insert");

        let candidate_id = if with_current_candidate {
            let target_id = id * 10;
            let candidate_id = id * 10;
            sqlx::query(
                "INSERT INTO target_posts (
                    id, url, normalized_url, content, content_hash
                 ) VALUES (?1, ?2, ?2, ?3, ?4)",
            )
            .bind(target_id)
            .bind(format!("https://example.com/posts/{id}"))
            .bind(format!("Post {id}"))
            .bind(format!("hash-{id}"))
            .execute(pool)
            .await
            .expect("target post should insert");
            sqlx::query(
                "INSERT INTO candidate_posts (id, campaign_id, target_post_id)
                 VALUES (?1, ?2, ?3)",
            )
            .bind(candidate_id)
            .bind(campaign_id)
            .bind(target_id)
            .execute(pool)
            .await
            .expect("candidate should insert");
            Some(candidate_id)
        } else {
            None
        };
        sqlx::query(
            "INSERT INTO source_import_items (
                source_import_batch_id, row_number, status, input_json,
                candidate_post_id, reason, policy_rule_key
             ) VALUES (?1, 1, 'accepted', '{}', ?2, 'Accepted', '')",
        )
        .bind(id)
        .bind(candidate_id)
        .execute(pool)
        .await
        .expect("source item should insert");
    }

    async fn table_count(pool: &SqlitePool, table: &str) -> i64 {
        sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
            .fetch_one(pool)
            .await
            .expect("table count should be readable")
    }

    #[test]
    fn canonical_steps_match_frontend_contract() {
        assert_eq!(
            CANONICAL_WORKFLOW_STEPS,
            [
                (
                    "research",
                    "Research",
                    "Research source posts and campaign context.",
                    1
                ),
                (
                    "score",
                    "Score relevance",
                    "Dedupe and score candidate relevance.",
                    2
                ),
                ("draft", "Draft variants", "Create draft variants.", 3),
                (
                    "audit",
                    "Audit drafts",
                    "Run deterministic/AI audit checks.",
                    4
                ),
                ("approve", "Approve", "Wait for human review.", 5),
                ("schedule", "Schedule", "Schedule approved content.", 6),
                ("measure", "Measure", "Record metrics and learning.", 7),
            ]
        );
    }

    #[test]
    fn tick_materializes_one_linked_plan_and_is_idempotent() {
        tauri::async_runtime::block_on(async {
            let pool = migrated_pool(2).await;
            seed_campaign(&pool, 1, "active", true).await;
            seed_terminal_batch(&pool, 10, 1, "completed", "2026-07-31T10:00:00.000Z", true).await;

            let first = run_tick_with_pool(&pool, "test-first")
                .await
                .expect("first tick should succeed");
            let second = run_tick_with_pool(&pool, "test-second")
                .await
                .expect("second tick should succeed");
            assert_eq!(first.planned, 1);
            assert_eq!(second.planned, 0);
            assert_eq!(table_count(&pool, "autopilot_plans").await, 1);
            assert_eq!(table_count(&pool, "campaign_backlog_items").await, 1);
            assert_eq!(table_count(&pool, "workflow_runs").await, 1);
            assert_eq!(table_count(&pool, "workflow_steps").await, 7);
            assert_eq!(table_count(&pool, "workflow_artifacts").await, 1);

            let artifact = sqlx::query(
                "SELECT wa.artifact_type, wa.artifact_id, ws.step_key
                   FROM workflow_artifacts wa
                   INNER JOIN workflow_steps ws ON ws.id = wa.workflow_step_id",
            )
            .fetch_one(&pool)
            .await
            .expect("candidate scoring artifact should be readable");
            assert_eq!(artifact.get::<String, _>("artifact_type"), "candidate_post");
            assert_eq!(artifact.get::<i64, _>("artifact_id"), 100);
            assert_eq!(artifact.get::<String, _>("step_key"), "score");

            let run = sqlx::query("SELECT status, current_step_key FROM workflow_runs LIMIT 1")
                .fetch_one(&pool)
                .await
                .expect("workflow should be readable");
            assert_eq!(run.get::<String, _>("status"), "queued");
            assert_eq!(run.get::<String, _>("current_step_key"), "score");
            let research_status: String =
                sqlx::query_scalar("SELECT status FROM workflow_steps WHERE step_key = 'research'")
                    .fetch_one(&pool)
                    .await
                    .expect("research step should be readable");
            assert_eq!(research_status, "completed");
            pool.close().await;
        });
    }

    #[test]
    fn tick_uses_oldest_first_bound_and_rejects_ineligible_campaigns() {
        tauri::async_runtime::block_on(async {
            let pool = migrated_pool(2).await;
            sqlx::query(
                "UPDATE autopilot_planner_settings SET max_batches_per_tick = 2 WHERE id = 1",
            )
            .execute(&pool)
            .await
            .expect("planner bound should update");
            seed_campaign(&pool, 1, "active", true).await;
            seed_campaign(&pool, 2, "paused", true).await;
            seed_campaign(&pool, 3, "archived", true).await;
            seed_campaign(&pool, 4, "active", false).await;
            for (id, campaign_id, created_at) in [
                (12, 1, "2026-07-31T12:00:00.000Z"),
                (10, 1, "2026-07-31T10:00:00.000Z"),
                (11, 1, "2026-07-31T11:00:00.000Z"),
                (20, 2, "2026-07-31T09:00:00.000Z"),
                (30, 3, "2026-07-31T08:00:00.000Z"),
                (40, 4, "2026-07-31T07:00:00.000Z"),
            ] {
                seed_terminal_batch(&pool, id, campaign_id, "completed", created_at, true).await;
            }

            let result = run_tick_with_pool(&pool, "bounded")
                .await
                .expect("bounded tick should succeed");
            assert_eq!(result.planned, 2);
            let planned_batch_ids: Vec<i64> = sqlx::query_scalar(
                "SELECT source_import_batch_id FROM autopilot_plans ORDER BY source_import_batch_id",
            )
            .fetch_all(&pool)
            .await
            .expect("planned batches should be readable");
            assert_eq!(planned_batch_ids, vec![10, 11]);
            pool.close().await;
        });
    }

    #[test]
    fn tick_ignores_nonterminal_and_zero_accepted_batches() {
        tauri::async_runtime::block_on(async {
            let pool = migrated_pool(2).await;
            seed_campaign(&pool, 1, "active", true).await;
            seed_terminal_batch(&pool, 10, 1, "processing", "2026-07-31T10:00:00.000Z", true).await;
            seed_terminal_batch(&pool, 11, 1, "failed", "2026-07-31T11:00:00.000Z", true).await;
            sqlx::query(
                "INSERT INTO source_import_batches (
                    id, campaign_id, source_type, status, total_count, accepted_count,
                    duplicate_count, rejected_count, error_message, created_at, updated_at
                 ) VALUES (12, 1, 'local_json', 'completed', 1, 0, 0, 1, '',
                           '2026-07-31T12:00:00.000Z', '2026-07-31T12:00:00.000Z')",
            )
            .execute(&pool)
            .await
            .expect("zero-accepted batch should insert");

            let result = run_tick_with_pool(&pool, "ineligible-batches")
                .await
                .expect("ineligible tick should succeed");
            assert_eq!(result.claimed, 0);
            assert_eq!(result.planned, 0);
            assert_eq!(result.skipped, 0);
            assert_eq!(table_count(&pool, "autopilot_plans").await, 0);
            pool.close().await;
        });
    }

    #[test]
    fn tick_records_one_skipped_plan_when_candidates_were_deleted() {
        tauri::async_runtime::block_on(async {
            let pool = migrated_pool(2).await;
            seed_campaign(&pool, 1, "active", true).await;
            seed_terminal_batch(
                &pool,
                10,
                1,
                "completed_with_errors",
                "2026-07-31T10:00:00.000Z",
                false,
            )
            .await;

            let first = run_tick_with_pool(&pool, "skip-first")
                .await
                .expect("skip tick should succeed");
            let second = run_tick_with_pool(&pool, "skip-second")
                .await
                .expect("repeat skip tick should succeed");
            assert_eq!(first.skipped, 1);
            assert_eq!(second.skipped, 0);
            let plan = sqlx::query(
                "SELECT status, candidate_count, campaign_backlog_item_id, workflow_run_id
                   FROM autopilot_plans",
            )
            .fetch_one(&pool)
            .await
            .expect("skipped plan should be readable");
            assert_eq!(plan.get::<String, _>("status"), "skipped");
            assert_eq!(plan.get::<i64, _>("candidate_count"), 0);
            assert_eq!(plan.get::<Option<i64>, _>("campaign_backlog_item_id"), None);
            assert_eq!(plan.get::<Option<i64>, _>("workflow_run_id"), None);
            pool.close().await;
        });
    }

    #[test]
    fn kill_switch_blocks_materialization() {
        tauri::async_runtime::block_on(async {
            let pool = migrated_pool(2).await;
            seed_campaign(&pool, 1, "active", true).await;
            seed_terminal_batch(&pool, 10, 1, "completed", "2026-07-31T10:00:00.000Z", true).await;
            sqlx::query(
                "UPDATE safety_settings
                    SET global_kill_switch = 1, kill_switch_reason = 'Operator pause'
                  WHERE id = 1",
            )
            .execute(&pool)
            .await
            .expect("kill switch should enable");

            let result = run_tick_with_pool(&pool, "blocked")
                .await
                .expect("blocked tick should return a result");
            assert_eq!(result.blocked, 1);
            assert_eq!(table_count(&pool, "autopilot_plans").await, 0);
            let blocked_events: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM autopilot_planner_events
                  WHERE event_type = 'planner_blocked'",
            )
            .fetch_one(&pool)
            .await
            .expect("blocked events should be readable");
            assert_eq!(blocked_events, 1);
            pool.close().await;
        });
    }

    #[test]
    fn kill_switch_enabled_after_first_plan_blocks_second_batch_transaction() {
        tauri::async_runtime::block_on(async {
            let pool = migrated_pool(2).await;
            sqlx::query(
                "UPDATE autopilot_planner_settings SET max_batches_per_tick = 2 WHERE id = 1",
            )
            .execute(&pool)
            .await
            .expect("planner bound should update");
            seed_campaign(&pool, 1, "active", true).await;
            seed_terminal_batch(&pool, 10, 1, "completed", "2026-07-31T10:00:00.000Z", true).await;
            seed_terminal_batch(&pool, 11, 1, "completed", "2026-07-31T11:00:00.000Z", true).await;
            pool.execute(
                "CREATE TRIGGER enable_kill_switch_after_first_plan
                 AFTER INSERT ON autopilot_plans
                 WHEN NEW.source_import_batch_id = 10
                 BEGIN
                    UPDATE safety_settings
                       SET global_kill_switch = 1,
                           kill_switch_reason = 'Operator pause after first plan'
                     WHERE id = 1;
                 END",
            )
            .await
            .expect("kill-switch trigger should be created");

            let first = run_tick_with_pool(&pool, "mid-tick-block")
                .await
                .expect("tick should stop safely after the switch changes");
            assert_eq!(first.claimed, 1);
            assert_eq!(first.planned, 1);
            assert_eq!(first.blocked, 1);
            assert_eq!(first.skipped, 0);
            assert_eq!(first.failed, 0);
            assert_eq!(table_count(&pool, "autopilot_plans").await, 1);
            assert_eq!(table_count(&pool, "campaign_backlog_items").await, 1);
            assert_eq!(table_count(&pool, "workflow_runs").await, 1);
            assert_eq!(table_count(&pool, "workflow_steps").await, 7);
            let planned_batch_ids: Vec<i64> = sqlx::query_scalar(
                "SELECT source_import_batch_id FROM autopilot_plans ORDER BY source_import_batch_id",
            )
            .fetch_all(&pool)
            .await
            .expect("planned batches should be readable");
            assert_eq!(planned_batch_ids, vec![10]);
            let blocked_event = sqlx::query(
                "SELECT source_import_batch_id, metadata_json
                   FROM autopilot_planner_events
                  WHERE event_type = 'planner_blocked'
                    AND source_import_batch_id IS NOT NULL",
            )
            .fetch_one(&pool)
            .await
            .expect("blocked batch event should be recorded");
            assert_eq!(blocked_event.get::<i64, _>("source_import_batch_id"), 11);
            assert!(blocked_event
                .get::<String, _>("metadata_json")
                .contains("Operator pause after first plan"));

            sqlx::query(
                "UPDATE safety_settings
                    SET global_kill_switch = 0, kill_switch_reason = ''
                  WHERE id = 1",
            )
            .execute(&pool)
            .await
            .expect("kill switch should disable");
            let resumed = run_tick_with_pool(&pool, "mid-tick-resume")
                .await
                .expect("remaining batch should plan after resuming");
            let repeated = run_tick_with_pool(&pool, "mid-tick-repeat")
                .await
                .expect("repeat tick should remain idempotent");
            assert_eq!(resumed.planned, 1);
            assert_eq!(resumed.blocked, 0);
            assert_eq!(repeated.planned, 0);
            assert_eq!(table_count(&pool, "autopilot_plans").await, 2);
            assert_eq!(table_count(&pool, "campaign_backlog_items").await, 2);
            assert_eq!(table_count(&pool, "workflow_runs").await, 2);
            pool.close().await;
        });
    }

    #[test]
    fn insertion_failure_rolls_back_all_linked_records() {
        tauri::async_runtime::block_on(async {
            let pool = migrated_pool(2).await;
            seed_campaign(&pool, 1, "active", true).await;
            seed_terminal_batch(&pool, 10, 1, "completed", "2026-07-31T10:00:00.000Z", true).await;
            pool.execute(
                "CREATE TRIGGER fail_autopilot_plan_insert
                 BEFORE INSERT ON autopilot_plans
                 BEGIN
                    SELECT RAISE(ABORT, 'injected planner failure');
                 END",
            )
            .await
            .expect("failure trigger should be created");

            let result = run_tick_with_pool(&pool, "rollback")
                .await
                .expect("tick should continue after one batch failure");
            assert_eq!(result.failed, 1);
            assert_eq!(table_count(&pool, "autopilot_plans").await, 0);
            assert_eq!(table_count(&pool, "campaign_backlog_items").await, 0);
            assert_eq!(table_count(&pool, "workflow_runs").await, 0);
            assert_eq!(table_count(&pool, "workflow_steps").await, 0);
            assert_eq!(table_count(&pool, "workflow_events").await, 0);
            let failure_event = sqlx::query(
                "SELECT campaign_id, source_import_batch_id
                   FROM autopilot_planner_events
                  WHERE event_type = 'batch_failed'",
            )
            .fetch_one(&pool)
            .await
            .expect("failure event should be readable");
            assert_eq!(failure_event.get::<Option<i64>, _>("campaign_id"), Some(1));
            assert_eq!(
                failure_event.get::<Option<i64>, _>("source_import_batch_id"),
                Some(10)
            );
            pool.close().await;
        });
    }

    #[test]
    fn worker_tick_failure_uses_distinct_valid_event_contract() {
        tauri::async_runtime::block_on(async {
            let pool = migrated_pool(2).await;

            record_tick_failure(&pool, "worker-failure")
                .await
                .expect("tick_failed should satisfy the planner event constraint");

            let event = sqlx::query(
                "SELECT campaign_id, source_import_batch_id, autopilot_plan_id,
                        event_type, severity, metadata_json
                   FROM autopilot_planner_events",
            )
            .fetch_one(&pool)
            .await
            .expect("worker failure event should be readable");
            assert_eq!(event.get::<String, _>("event_type"), "tick_failed");
            assert_eq!(event.get::<String, _>("severity"), "error");
            assert_eq!(event.get::<Option<i64>, _>("campaign_id"), None);
            assert_eq!(event.get::<Option<i64>, _>("source_import_batch_id"), None);
            assert_eq!(event.get::<Option<i64>, _>("autopilot_plan_id"), None);
            assert!(event
                .get::<String, _>("metadata_json")
                .contains("worker-failure"));
            pool.close().await;
        });
    }

    #[test]
    fn shared_pool_concurrent_ticks_preserve_begin_immediate_exactly_once() {
        tauri::async_runtime::block_on(async {
            let pool = migrated_pool(4).await;
            seed_campaign(&pool, 1, "active", true).await;
            seed_terminal_batch(&pool, 10, 1, "completed", "2026-07-31T10:00:00.000Z", true).await;

            let first_pool = pool.clone();
            let second_pool = pool.clone();
            let first = tauri::async_runtime::spawn(async move {
                run_tick_with_pool(&first_pool, "concurrent-first").await
            });
            let second = tauri::async_runtime::spawn(async move {
                run_tick_with_pool(&second_pool, "concurrent-second").await
            });
            first
                .await
                .expect("first task should finish")
                .expect("first tick should return");
            second
                .await
                .expect("second task should finish")
                .expect("second tick should return");

            assert_eq!(table_count(&pool, "autopilot_plans").await, 1);
            assert_eq!(table_count(&pool, "campaign_backlog_items").await, 1);
            assert_eq!(table_count(&pool, "workflow_runs").await, 1);
            pool.close().await;
        });
    }

    fn reject_worker_spawn(_: WorkerFuture) -> Result<JoinHandle<()>, String> {
        Err("injected worker spawn failure".to_string())
    }

    #[test]
    fn worker_readiness_waits_for_initial_tick_materialization() {
        tauri::async_runtime::block_on(async {
            let pool = migrated_pool(2).await;
            seed_campaign(&pool, 1, "active", true).await;
            seed_terminal_batch(&pool, 10, 1, "completed", "2026-07-31T10:00:00.000Z", true).await;

            let mut write_lock = pool
                .acquire()
                .await
                .expect("write-lock connection should be available");
            write_lock
                .execute("BEGIN IMMEDIATE")
                .await
                .expect("write lock should begin");

            let cancellation = CancellationToken::new();
            let (activation_sender, activation_receiver) = oneshot::channel();
            let (ready_sender, mut ready_receiver) = oneshot::channel();
            let worker = tauri::async_runtime::spawn(run_worker(
                pool.clone(),
                "readiness-test".to_string(),
                cancellation.clone(),
                activation_receiver,
                ready_sender,
                poll_interval(60),
            ));
            activation_sender
                .send(())
                .expect("worker should receive activation");

            assert!(
                timeout(Duration::from_millis(100), &mut ready_receiver)
                    .await
                    .is_err(),
                "worker must not report readiness while the initial tick is blocked",
            );
            write_lock
                .execute("ROLLBACK")
                .await
                .expect("write lock should release");
            drop(write_lock);

            timeout(Duration::from_secs(2), &mut ready_receiver)
                .await
                .expect("worker readiness should not time out")
                .expect("worker should report readiness");
            assert_eq!(table_count(&pool, "autopilot_plans").await, 1);
            assert_eq!(table_count(&pool, "campaign_backlog_items").await, 1);
            assert_eq!(table_count(&pool, "workflow_runs").await, 1);

            cancellation.cancel();
            timeout(Duration::from_secs(2), worker)
                .await
                .expect("worker should stop after cancellation")
                .expect("worker task should finish");
            pool.close().await;
        });
    }

    #[test]
    fn worker_lifecycle_retains_handle_and_stops_cleanly() {
        tauri::async_runtime::block_on(async {
            let pool = migrated_pool(2).await;
            let worker_state = AutopilotPlannerWorkerState::default();

            let started = start_worker_with_pool(&pool, &worker_state, spawn_worker_task)
                .await
                .expect("worker should start");
            assert!(started.enabled);
            assert!(started.running);
            assert!(started.runner_id.is_some());
            {
                let guard = worker_state
                    .worker
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                let worker = guard.as_ref().expect("worker state should be retained");
                assert!(worker.running);
                assert!(worker.task.is_some());
                assert!(!worker.task.as_ref().unwrap().inner().is_finished());
            }

            let stopped = stop_worker_with_pool(&pool, &worker_state)
                .await
                .expect("worker should stop");
            assert!(!stopped.enabled);
            assert!(!stopped.running);
            assert_eq!(stopped.runner_id, None);
            assert!(worker_state
                .worker
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .is_none());
            let lifecycle_events: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM autopilot_planner_events
                  WHERE event_type IN ('planner_started', 'planner_stopped')",
            )
            .fetch_one(&pool)
            .await
            .expect("lifecycle events should be readable");
            assert_eq!(lifecycle_events, 2);
            pool.close().await;
        });
    }

    #[test]
    fn event_persistence_failure_never_reports_phantom_running() {
        tauri::async_runtime::block_on(async {
            let pool = migrated_pool(2).await;
            let worker_state = AutopilotPlannerWorkerState::default();
            pool.execute(
                "CREATE TRIGGER fail_planner_started_event
                 BEFORE INSERT ON autopilot_planner_events
                 WHEN NEW.event_type = 'planner_started'
                 BEGIN
                    SELECT RAISE(ABORT, 'injected planner event failure');
                 END",
            )
            .await
            .expect("failure trigger should be created");

            let error = start_worker_with_pool(&pool, &worker_state, spawn_worker_task)
                .await
                .expect_err("event persistence should fail startup");
            assert_eq!(error, "Could not record autopilot planner event");
            assert_eq!(current_worker(&worker_state), (false, None));
            assert!(worker_state
                .worker
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .is_none());
            assert!(!load_settings(&pool).await.unwrap().enabled);
            let started_events: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM autopilot_planner_events
                  WHERE event_type = 'planner_started'",
            )
            .fetch_one(&pool)
            .await
            .expect("started events should be readable");
            assert_eq!(started_events, 0);
            pool.close().await;
        });
    }

    #[test]
    fn spawn_setup_failure_rolls_back_enabled_and_worker_state() {
        tauri::async_runtime::block_on(async {
            let pool = migrated_pool(2).await;
            let worker_state = AutopilotPlannerWorkerState::default();

            let error = start_worker_with_pool(&pool, &worker_state, reject_worker_spawn)
                .await
                .expect_err("spawn setup should fail startup");
            assert_eq!(error, "injected worker spawn failure");
            assert_eq!(current_worker(&worker_state), (false, None));
            assert!(worker_state
                .worker
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .is_none());
            assert!(!load_settings(&pool).await.unwrap().enabled);
            let started_events: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM autopilot_planner_events
                  WHERE event_type = 'planner_started'",
            )
            .fetch_one(&pool)
            .await
            .expect("started events should be readable");
            assert_eq!(started_events, 0);
            pool.close().await;
        });
    }
}
