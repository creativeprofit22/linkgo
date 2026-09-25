//! Native planning dashboard reads: the campaign backlog dashboard and the
//! autopilot planner dashboard. Each reads its counts and lists from one
//! transaction snapshot with fixed SQL and caps.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{SqliteConnection, SqlitePool};
use tauri::State;

use crate::row_json::rows_to_json;

const READ_ERROR: &str = "Could not load planning dashboard";
pub(crate) const BACKLOG_OPEN_LIMIT: i64 = 500;
pub(crate) const BACKLOG_HISTORY_LIMIT: i64 = 100;
const RECENT_PLANS_LIMIT: i64 = 30;
const RECENT_EVENTS_LIMIT: i64 = 50;
const OWNERS: [&str; 3] = ["all", "operator", "linkgo"];

fn read_error(_: sqlx::Error) -> String {
    READ_ERROR.to_string()
}

fn positive_campaign(campaign_id: Option<i64>) -> Result<Option<i64>, String> {
    if campaign_id.is_some_and(|id| id <= 0) {
        return Err("Campaign id must be a positive integer".to_string());
    }
    Ok(campaign_id)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BacklogDashboardInput {
    #[serde(default)]
    pub campaign_id: Option<i64>,
    pub owner: String,
    pub view: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlannerDashboardInput {
    #[serde(default)]
    pub campaign_id: Option<i64>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BacklogSummary {
    pub due_now: i64,
    pub in_progress: i64,
    pub blocked: i64,
    pub linkgo_owned: i64,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BacklogDashboardSnapshot {
    pub items: Vec<Value>,
    pub summary: BacklogSummary,
    pub total_items: i64,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlannerSummary {
    pub eligible_batches: i64,
    pub planned_batches: i64,
    pub skipped_batches: i64,
    pub recent_failures: i64,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlannerDashboardSnapshot {
    pub summary: PlannerSummary,
    pub recent_plans: Vec<Value>,
    pub recent_events: Vec<Value>,
    pub global_kill_switch_enabled: bool,
    pub kill_switch_reason: String,
}

async fn scalar(
    connection: &mut SqliteConnection,
    sql: &str,
    campaign_id: Option<i64>,
) -> Result<i64, String> {
    sqlx::query_scalar(sql)
        .bind(campaign_id)
        .fetch_one(&mut *connection)
        .await
        .map_err(read_error)
}

const BACKLOG_COLUMNS: &str = "cbi.id, cbi.campaign_id, cbi.recurrence_parent_id, cbi.work_type,
    cbi.title, cbi.details, cbi.owner_type, cbi.status, cbi.due_at, cbi.recurrence,
    cbi.recurrence_timezone, cbi.completed_at, cbi.cancelled_at, cbi.created_at,
    cbi.updated_at, c.name AS campaign_name, c.status AS campaign_status,
    ap.id AS autopilot_plan_id, ap.source_import_batch_id, ap.workflow_run_id,
    wr.status AS linked_workflow_status, score_step.status AS linked_score_step_status";

pub(crate) async fn backlog_dashboard(
    pool: &SqlitePool,
    input: BacklogDashboardInput,
) -> Result<BacklogDashboardSnapshot, String> {
    let campaign_id = positive_campaign(input.campaign_id)?;
    if !OWNERS.contains(&input.owner.as_str()) {
        return Err("Invalid backlog owner filter".to_string());
    }
    let history = match input.view.as_str() {
        "open" => false,
        "history" => true,
        _ => return Err("Invalid backlog view".to_string()),
    };
    // Every clause below is a fixed string chosen from validated enums; the
    // campaign id and owner are always bound, never interpolated.
    let (status_clause, order_clause, index_clause, limit) = if history {
        (
            "cbi.status IN ('completed', 'cancelled')",
            "COALESCE(cbi.completed_at, cbi.cancelled_at) DESC, cbi.id DESC",
            if campaign_id.is_none() {
                "INDEXED BY idx_campaign_backlog_history_terminal_at"
            } else {
                "INDEXED BY idx_campaign_backlog_campaign_history_terminal_at"
            },
            BACKLOG_HISTORY_LIMIT,
        )
    } else {
        (
            "cbi.status IN ('pending', 'in_progress', 'blocked')",
            "cbi.due_at ASC, cbi.id ASC",
            "",
            BACKLOG_OPEN_LIMIT,
        )
    };
    let owner = (input.owner != "all").then_some(input.owner);
    let filters = "(?1 IS NULL OR cbi.campaign_id = ?1) AND (?2 IS NULL OR cbi.owner_type = ?2)";

    let mut tx = pool.begin().await.map_err(read_error)?;
    let items_sql = format!(
        "SELECT {BACKLOG_COLUMNS}
         FROM campaign_backlog_items AS cbi {index_clause}
         INNER JOIN campaigns c ON c.id = cbi.campaign_id
         LEFT JOIN autopilot_plans ap ON ap.campaign_backlog_item_id = cbi.id
         LEFT JOIN workflow_runs wr ON wr.id = ap.workflow_run_id
         LEFT JOIN workflow_steps score_step
           ON score_step.workflow_run_id = wr.id AND score_step.step_key = 'score'
         WHERE {status_clause} AND {filters}
         ORDER BY {order_clause}
         LIMIT ?3"
    );
    let rows = sqlx::query(&items_sql)
        .bind(campaign_id)
        .bind(owner.as_deref())
        .bind(limit)
        .fetch_all(&mut *tx)
        .await
        .map_err(read_error)?;
    let summary_sql = format!(
        "SELECT
           COALESCE(SUM(CASE WHEN cbi.due_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN 1 ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN cbi.status = 'in_progress' THEN 1 ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN cbi.status = 'blocked' THEN 1 ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN cbi.owner_type = 'linkgo' THEN 1 ELSE 0 END), 0)
         FROM campaign_backlog_items cbi
         WHERE cbi.status IN ('pending', 'in_progress', 'blocked') AND {filters}"
    );
    let (due_now, in_progress, blocked, linkgo_owned): (i64, i64, i64, i64) =
        sqlx::query_as(&summary_sql)
            .bind(campaign_id)
            .bind(owner.as_deref())
            .fetch_one(&mut *tx)
            .await
            .map_err(read_error)?;
    let total_items: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM campaign_backlog_items")
        .fetch_one(&mut *tx)
        .await
        .map_err(read_error)?;
    tx.commit().await.map_err(read_error)?;
    Ok(BacklogDashboardSnapshot {
        items: rows_to_json(&rows),
        summary: BacklogSummary {
            due_now,
            in_progress,
            blocked,
            linkgo_owned,
        },
        total_items,
    })
}

pub(crate) async fn planner_dashboard(
    pool: &SqlitePool,
    input: PlannerDashboardInput,
) -> Result<PlannerDashboardSnapshot, String> {
    let campaign_id = positive_campaign(input.campaign_id)?;
    let mut tx = pool.begin().await.map_err(read_error)?;
    let safety: Option<(i64, String)> = sqlx::query_as(
        "SELECT global_kill_switch, kill_switch_reason FROM safety_settings WHERE id = 1 LIMIT 1",
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(read_error)?;
    let summary = PlannerSummary {
        eligible_batches: scalar(
            &mut tx,
            "SELECT COUNT(*) FROM source_import_batches sib
             INNER JOIN campaigns c ON c.id = sib.campaign_id
             LEFT JOIN autopilot_plans ap ON ap.source_import_batch_id = sib.id
             WHERE c.status = 'active' AND c.auto_pilot = 1
               AND sib.status IN ('completed', 'completed_with_errors')
               AND sib.accepted_count > 0 AND ap.id IS NULL
               AND (?1 IS NULL OR sib.campaign_id = ?1)",
            campaign_id,
        )
        .await?,
        planned_batches: scalar(
            &mut tx,
            "SELECT COUNT(*) FROM autopilot_plans ap
             WHERE ap.status = 'planned' AND (?1 IS NULL OR ap.campaign_id = ?1)",
            campaign_id,
        )
        .await?,
        skipped_batches: scalar(
            &mut tx,
            "SELECT COUNT(*) FROM autopilot_plans ap
             WHERE ap.status = 'skipped' AND (?1 IS NULL OR ap.campaign_id = ?1)",
            campaign_id,
        )
        .await?,
        recent_failures: scalar(
            &mut tx,
            "SELECT COUNT(*) FROM autopilot_planner_events ape
             WHERE ape.event_type = 'batch_failed'
               AND datetime(ape.created_at) >= datetime('now', '-7 days')
               AND (?1 IS NULL OR ape.campaign_id = ?1)",
            campaign_id,
        )
        .await?,
    };
    let plans = sqlx::query(
        "SELECT ap.id, ap.campaign_id, ap.source_import_batch_id, ap.source_type, ap.status,
                ap.campaign_backlog_item_id, ap.workflow_run_id, ap.candidate_count,
                ap.summary, ap.created_at, ap.updated_at,
                c.name AS campaign_name, c.status AS campaign_status,
                sib.status AS source_batch_status, sib.total_count AS source_total_count,
                sib.accepted_count AS source_accepted_count,
                (SELECT COUNT(*) FROM source_import_items sii
                  WHERE sii.source_import_batch_id = ap.source_import_batch_id
                    AND sii.status = 'accepted' AND sii.candidate_post_id IS NOT NULL
                ) AS current_candidate_count,
                cbi.title AS backlog_title, cbi.status AS backlog_status,
                cbi.work_type AS backlog_work_type,
                wr.title AS workflow_title, wr.status AS workflow_status,
                wr.current_step_key AS workflow_current_step_key,
                score_step.status AS score_step_status,
                scorer.status AS latest_scorer_run_status,
                scorer.provider_key AS latest_scorer_provider_key,
                scorer.model_name AS latest_scorer_model_name
         FROM autopilot_plans ap
         INNER JOIN campaigns c ON c.id = ap.campaign_id
         INNER JOIN source_import_batches sib ON sib.id = ap.source_import_batch_id
         LEFT JOIN campaign_backlog_items cbi ON cbi.id = ap.campaign_backlog_item_id
         LEFT JOIN workflow_runs wr ON wr.id = ap.workflow_run_id
         LEFT JOIN workflow_steps score_step
           ON score_step.workflow_run_id = wr.id AND score_step.step_key = 'score'
         LEFT JOIN agent_runs scorer ON scorer.id = (
           SELECT ar.id FROM agent_runs ar
           WHERE ar.workflow_run_id = wr.id AND ar.workflow_step_id = score_step.id
             AND ar.agent_role = 'scorer'
           ORDER BY ar.id DESC LIMIT 1
         )
         WHERE (?1 IS NULL OR ap.campaign_id = ?1)
         ORDER BY datetime(ap.created_at) DESC, ap.id DESC
         LIMIT ?2",
    )
    .bind(campaign_id)
    .bind(RECENT_PLANS_LIMIT)
    .fetch_all(&mut *tx)
    .await
    .map_err(read_error)?;
    let events = sqlx::query(
        "SELECT ape.id, ape.campaign_id, ape.source_import_batch_id, ape.autopilot_plan_id,
                ape.event_type, ape.severity, ape.summary, ape.metadata_json, ape.created_at,
                c.name AS campaign_name, c.status AS campaign_status
         FROM autopilot_planner_events ape
         LEFT JOIN campaigns c ON c.id = ape.campaign_id
         WHERE (?1 IS NULL OR ape.campaign_id = ?1)
         ORDER BY datetime(ape.created_at) DESC, ape.id DESC
         LIMIT ?2",
    )
    .bind(campaign_id)
    .bind(RECENT_EVENTS_LIMIT)
    .fetch_all(&mut *tx)
    .await
    .map_err(read_error)?;
    tx.commit().await.map_err(read_error)?;
    let (kill_switch, reason) = safety.unwrap_or((0, String::new()));
    Ok(PlannerDashboardSnapshot {
        summary,
        recent_plans: rows_to_json(&plans),
        recent_events: rows_to_json(&events),
        global_kill_switch_enabled: kill_switch == 1,
        kill_switch_reason: reason,
    })
}

#[tauri::command]
pub async fn linkgo_campaign_backlog_dashboard(
    pool: State<'_, SqlitePool>,
    input: BacklogDashboardInput,
) -> Result<BacklogDashboardSnapshot, String> {
    backlog_dashboard(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_autopilot_planner_dashboard(
    pool: State<'_, SqlitePool>,
    input: PlannerDashboardInput,
) -> Result<PlannerDashboardSnapshot, String> {
    planner_dashboard(pool.inner(), input).await
}

#[cfg(test)]
#[path = "planning_reads_tests.rs"]
mod tests;
