//! Native metrics reads: published approvals eligible for metrics, recorded
//! post metrics, campaign memory, learning events and the metric-refresh
//! dashboard. Each command owns fixed SQL with a campaign filter and a cap;
//! the dashboard reads all of its parts from one transaction.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{SqliteConnection, SqlitePool};
use tauri::State;

use crate::row_json::{row_to_json, rows_to_json};

const READ_ERROR: &str = "Could not load metrics";
pub(crate) const METRICS_LIST_LIMIT: i64 = 500;
const REFRESH_EVENTS_LIMIT: i64 = 20;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MetricsListInput {
    #[serde(default)]
    pub campaign_id: Option<i64>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RefreshSummary {
    pub total_jobs: i64,
    pub active_jobs: i64,
    pub due_jobs: i64,
    pub unavailable_jobs: i64,
    pub failed_jobs: i64,
    pub api_snapshots: i64,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct RefreshDashboard {
    pub settings: Option<Value>,
    pub jobs: Vec<Value>,
    pub events: Vec<Value>,
    pub summary: RefreshSummary,
}

fn read_error(_: sqlx::Error) -> String {
    READ_ERROR.to_string()
}

fn validate(input: &MetricsListInput) -> Result<Option<i64>, String> {
    if input.campaign_id.is_some_and(|id| id <= 0) {
        return Err("Campaign id must be a positive integer".to_string());
    }
    Ok(input.campaign_id)
}

/// Runs a fixed list query whose `?1` is the optional campaign id and `?2`
/// the row cap.
async fn list(
    connection: &mut SqliteConnection,
    sql: &str,
    campaign_id: Option<i64>,
    limit: i64,
) -> Result<Vec<Value>, String> {
    let rows = sqlx::query(sql)
        .bind(campaign_id)
        .bind(limit)
        .fetch_all(&mut *connection)
        .await
        .map_err(read_error)?;
    Ok(rows_to_json(&rows))
}

async fn read_list(
    pool: &SqlitePool,
    input: MetricsListInput,
    sql: &str,
) -> Result<Vec<Value>, String> {
    let campaign_id = validate(&input)?;
    let mut connection = pool.acquire().await.map_err(read_error)?;
    list(&mut connection, sql, campaign_id, METRICS_LIST_LIMIT).await
}

const ELIGIBLE_SQL: &str = "SELECT
    c.id AS campaign_id, c.name AS campaign_name, c.status AS campaign_status,
    a.id AS approval_id, a.status AS approval_status,
    d.id AS draft_id, d.angle AS draft_angle, d.notes AS draft_notes,
    dv.id AS variant_id, dv.variant_number, dv.hook AS variant_hook,
    dv.body AS variant_body, dv.cta AS variant_cta, dv.hashtags AS variant_hashtags,
    dv.status AS variant_status,
    tp.author_name AS target_author_name, tp.author_profile_url AS target_author_profile_url,
    tp.content AS target_content, tp.url AS target_url,
    pa.id AS publish_attempt_id, pa.external_post_url AS publish_external_post_url,
    pa.platform_post_id AS publish_platform_post_id, pa.created_at AS publish_created_at
  FROM approvals a
  INNER JOIN campaigns c ON c.id = a.campaign_id
  INNER JOIN drafts d ON d.id = a.draft_id
  INNER JOIN draft_variants dv ON dv.id = a.draft_variant_id
  INNER JOIN candidate_posts cp ON cp.id = d.candidate_post_id
  INNER JOIN target_posts tp ON tp.id = cp.target_post_id
  INNER JOIN publish_attempts pa ON pa.id = (
    SELECT latest_pa.id FROM publish_attempts latest_pa
    WHERE latest_pa.approval_id = a.id AND latest_pa.status = 'succeeded'
    ORDER BY datetime(latest_pa.created_at) DESC, latest_pa.id DESC LIMIT 1
  )
  WHERE a.status = 'published' AND c.status <> 'archived'
    AND (?1 IS NULL OR a.campaign_id = ?1)
  ORDER BY datetime(pa.created_at) DESC, a.id DESC
  LIMIT ?2";

const POST_METRICS_SQL: &str = "SELECT
    pm.id, pm.campaign_id, pm.approval_id, pm.publish_attempt_id, pm.platform,
    pm.measured_at, pm.impressions, pm.reactions, pm.comments, pm.reposts,
    pm.profile_visits, pm.link_clicks, pm.ctr, pm.notes, pm.collection_source,
    pm.raw_payload_json, pm.created_at, pm.updated_at,
    c.name AS campaign_name, c.status AS campaign_status, a.status AS approval_status,
    d.id AS draft_id, d.angle AS draft_angle, d.notes AS draft_notes,
    dv.id AS variant_id, dv.variant_number, dv.hook AS variant_hook,
    dv.body AS variant_body, dv.cta AS variant_cta, dv.hashtags AS variant_hashtags,
    dv.status AS variant_status,
    tp.author_name AS target_author_name, tp.author_profile_url AS target_author_profile_url,
    tp.content AS target_content, tp.url AS target_url,
    pa.external_post_url AS publish_external_post_url,
    pa.platform_post_id AS publish_platform_post_id, pa.created_at AS publish_created_at
  FROM post_metrics pm
  INNER JOIN campaigns c ON c.id = pm.campaign_id
  INNER JOIN approvals a ON a.id = pm.approval_id
  INNER JOIN drafts d ON d.id = a.draft_id
  INNER JOIN draft_variants dv ON dv.id = a.draft_variant_id
  INNER JOIN candidate_posts cp ON cp.id = d.candidate_post_id
  INNER JOIN target_posts tp ON tp.id = cp.target_post_id
  LEFT JOIN publish_attempts pa ON pa.id = pm.publish_attempt_id
  WHERE (?1 IS NULL OR pm.campaign_id = ?1)
  ORDER BY datetime(pm.measured_at) DESC, pm.id DESC
  LIMIT ?2";

const MEMORY_SQL: &str = "SELECT id, campaign_id, post_metric_id, signal, summary,
    evidence, confidence, status, created_at, updated_at
  FROM campaign_memory
  WHERE (?1 IS NULL OR campaign_id = ?1)
  ORDER BY status = 'archived', datetime(updated_at) DESC, id DESC
  LIMIT ?2";

const LEARNING_SQL: &str = "SELECT id, campaign_id, post_metric_id, campaign_memory_id,
    event_type, summary, created_at
  FROM learning_events
  WHERE (?1 IS NULL OR campaign_id = ?1)
  ORDER BY datetime(created_at) DESC, id DESC
  LIMIT ?2";

const JOBS_SQL: &str = "SELECT id, campaign_id, approval_id, publish_attempt_id, platform,
    target_urn, status, next_refresh_at, last_refreshed_at, last_attempted_at,
    attempt_count, max_attempts, failure_count, last_error, locked_at, locked_by,
    created_at, updated_at
  FROM metric_refresh_jobs
  WHERE (?1 IS NULL OR campaign_id = ?1)
  ORDER BY status = 'active' DESC, datetime(next_refresh_at) ASC, id ASC
  LIMIT ?2";

const EVENTS_SQL: &str = "SELECT id, campaign_id, approval_id, metric_refresh_job_id,
    post_metric_id, event_type, severity, summary, metadata_json, created_at
  FROM metric_refresh_events
  WHERE (?1 IS NULL OR campaign_id = ?1)
  ORDER BY datetime(created_at) DESC, id DESC
  LIMIT ?2";

const SUMMARY_SQL: &str = "SELECT
    (SELECT COUNT(*) FROM metric_refresh_jobs WHERE (?1 IS NULL OR campaign_id = ?1)),
    (SELECT COUNT(*) FROM metric_refresh_jobs WHERE (?1 IS NULL OR campaign_id = ?1) AND status = 'active'),
    (SELECT COUNT(*) FROM metric_refresh_jobs WHERE (?1 IS NULL OR campaign_id = ?1)
       AND status = 'active' AND datetime(next_refresh_at) <= datetime('now')),
    (SELECT COUNT(*) FROM metric_refresh_jobs WHERE (?1 IS NULL OR campaign_id = ?1) AND status = 'unavailable'),
    (SELECT COUNT(*) FROM metric_refresh_jobs WHERE (?1 IS NULL OR campaign_id = ?1) AND status = 'failed'),
    (SELECT COUNT(*) FROM post_metrics WHERE (?1 IS NULL OR campaign_id = ?1)
       AND collection_source = 'linkedin_social_metadata')";

pub(crate) async fn list_eligible_approvals(
    pool: &SqlitePool,
    input: MetricsListInput,
) -> Result<Vec<Value>, String> {
    read_list(pool, input, ELIGIBLE_SQL).await
}

pub(crate) async fn list_post_metrics(
    pool: &SqlitePool,
    input: MetricsListInput,
) -> Result<Vec<Value>, String> {
    read_list(pool, input, POST_METRICS_SQL).await
}

pub(crate) async fn list_campaign_memory(
    pool: &SqlitePool,
    input: MetricsListInput,
) -> Result<Vec<Value>, String> {
    read_list(pool, input, MEMORY_SQL).await
}

pub(crate) async fn list_learning_events(
    pool: &SqlitePool,
    input: MetricsListInput,
) -> Result<Vec<Value>, String> {
    read_list(pool, input, LEARNING_SQL).await
}

pub(crate) async fn refresh_dashboard(
    pool: &SqlitePool,
    input: MetricsListInput,
) -> Result<RefreshDashboard, String> {
    let campaign_id = validate(&input)?;
    let mut transaction = pool.begin().await.map_err(read_error)?;
    let settings = sqlx::query(
        "SELECT id, enabled, poll_interval_minutes, max_jobs_per_tick,
                refresh_interval_hours, retry_backoff_minutes, updated_at
         FROM metric_refresh_settings WHERE id = 1 LIMIT 1",
    )
    .fetch_optional(&mut *transaction)
    .await
    .map_err(read_error)?
    .as_ref()
    .map(row_to_json);
    let jobs = list(&mut transaction, JOBS_SQL, campaign_id, METRICS_LIST_LIMIT).await?;
    let events = list(
        &mut transaction,
        EVENTS_SQL,
        campaign_id,
        REFRESH_EVENTS_LIMIT,
    )
    .await?;
    let counts: (i64, i64, i64, i64, i64, i64) = sqlx::query_as(SUMMARY_SQL)
        .bind(campaign_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(read_error)?;
    transaction.commit().await.map_err(read_error)?;
    Ok(RefreshDashboard {
        settings,
        jobs,
        events,
        summary: RefreshSummary {
            total_jobs: counts.0,
            active_jobs: counts.1,
            due_jobs: counts.2,
            unavailable_jobs: counts.3,
            failed_jobs: counts.4,
            api_snapshots: counts.5,
        },
    })
}

#[tauri::command]
pub async fn linkgo_metrics_eligible_approvals(
    pool: State<'_, SqlitePool>,
    input: MetricsListInput,
) -> Result<Vec<Value>, String> {
    list_eligible_approvals(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_metrics_post_metrics_list(
    pool: State<'_, SqlitePool>,
    input: MetricsListInput,
) -> Result<Vec<Value>, String> {
    list_post_metrics(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_metrics_campaign_memory_list(
    pool: State<'_, SqlitePool>,
    input: MetricsListInput,
) -> Result<Vec<Value>, String> {
    list_campaign_memory(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_metrics_learning_events_list(
    pool: State<'_, SqlitePool>,
    input: MetricsListInput,
) -> Result<Vec<Value>, String> {
    list_learning_events(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_metrics_refresh_dashboard(
    pool: State<'_, SqlitePool>,
    input: MetricsListInput,
) -> Result<RefreshDashboard, String> {
    refresh_dashboard(pool.inner(), input).await
}

#[cfg(test)]
#[path = "metrics_reads_tests.rs"]
mod tests;
