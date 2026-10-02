//! Native draft reads and the plain draft-field update.
//!
//! - `linkgo_draft_list`: drafts with variants, audits, current-revision AI
//!   audit runs and findings, and current quality runs with attempts and
//!   category scores, read from one transaction snapshot, plus `totalCount`
//!   (drafts matching the filter before the cap). Each variant carries
//!   `approval_ready` (0/1): the shared variant-level approval gate from
//!   `approval_reads::VARIANT_APPROVAL_READY_SQL`. Optional filters: campaign
//!   and one idea (`candidatePostId`).
//! - `linkgo_draft_generation_request_list` and
//!   `linkgo_draft_workflow_options`: bounded lists.
//! - `linkgo_draft_update`: angle/notes/status in one transaction.
//!
//! Every query names its columns, so the renderer's strict schemas see a
//! fixed shape.

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use sqlx::{SqliteConnection, SqlitePool};
use tauri::State;

use crate::approval_reads::VARIANT_APPROVAL_READY_SQL;
use crate::db_transaction::{settle, Settlement};
use crate::js_text::{js_trim, utf16_len};
use crate::row_json::rows_to_json;

const READ_ERROR: &str = "Could not load drafts";
const STORAGE_ERROR: &str = "Could not save draft";
pub(crate) const DRAFT_LIST_LIMIT: i64 = 500;
pub(crate) const GENERATION_REQUEST_LIMIT: i64 = 500;
pub(crate) const WORKFLOW_OPTION_LIMIT: i64 = 200;
const DRAFT_STATUSES: [&str; 4] = ["drafting", "needs_revision", "ready_for_review", "archived"];

fn read_error(_: sqlx::Error) -> String {
    READ_ERROR.to_string()
}

fn storage_error(_: sqlx::Error) -> String {
    STORAGE_ERROR.to_string()
}

fn optional_campaign(campaign_id: Option<i64>) -> Result<Option<i64>, String> {
    if campaign_id.is_some_and(|id| id <= 0) {
        return Err("Campaign id must be a positive integer".to_string());
    }
    Ok(campaign_id)
}

fn optional_candidate(candidate_post_id: Option<i64>) -> Result<Option<i64>, String> {
    if candidate_post_id.is_some_and(|id| id <= 0) {
        return Err("Idea id must be a positive integer".to_string());
    }
    Ok(candidate_post_id)
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DraftListInput {
    #[serde(default)]
    pub campaign_id: Option<i64>,
    /// Only drafts for this idea; `totalCount` counts the same filter.
    #[serde(default)]
    pub candidate_post_id: Option<i64>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DraftGenerationRequestListInput {
    #[serde(default)]
    pub campaign_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DraftWorkflowOptionsInput {
    pub campaign_id: i64,
}

/// Absent fields stay unchanged; `status` must be a known draft status.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateDraftInput {
    pub id: i64,
    #[serde(default, deserialize_with = "present")]
    pub angle: Option<String>,
    #[serde(default, deserialize_with = "present")]
    pub notes: Option<String>,
    #[serde(default, deserialize_with = "present")]
    pub status: Option<String>,
}

/// Rejects an explicit `null` (the renderer schema only allows omission).
fn present<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    String::deserialize(deserializer).map(Some)
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DraftListSnapshot {
    pub drafts: Vec<Value>,
    pub variants: Vec<Value>,
    pub audits: Vec<Value>,
    pub ai_audit_runs: Vec<Value>,
    pub ai_audit_findings: Vec<Value>,
    pub quality_runs: Vec<Value>,
    pub quality_attempts: Vec<Value>,
    pub quality_scores: Vec<Value>,
    /// Drafts matching the filter before the `DRAFT_LIST_LIMIT` cap.
    pub total_count: i64,
}

const CANDIDATE_TARGET_COLUMNS: &str = "c.name AS campaign_name,
      cp.source_keyword AS candidate_source_keyword, cp.status AS candidate_status,
      cp.relevance_score AS candidate_relevance_score,
      cp.score_reason AS candidate_score_reason, cp.notes AS candidate_notes,
      cp.created_at AS candidate_created_at, cp.updated_at AS candidate_updated_at,
      tp.id AS target_id, tp.platform AS target_platform, tp.url AS target_url,
      tp.normalized_url AS target_normalized_url,
      tp.platform_resource_urn AS target_platform_resource_urn,
      tp.author_name AS target_author_name,
      tp.author_profile_url AS target_author_profile_url,
      tp.posted_at AS target_posted_at, tp.content AS target_content,
      tp.content_hash AS target_content_hash, tp.created_at AS target_created_at,
      tp.updated_at AS target_updated_at";

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
    let sql = sql.replace("{ids}", &placeholders);
    let mut query = sqlx::query(&sql);
    for id in ids {
        query = query.bind(id);
    }
    let rows = query
        .fetch_all(&mut *connection)
        .await
        .map_err(read_error)?;
    Ok(rows_to_json(&rows))
}

fn ids_of(rows: &[Value], key: &str) -> Vec<i64> {
    let mut ids: Vec<i64> = rows.iter().filter_map(|row| row[key].as_i64()).collect();
    ids.sort_unstable();
    ids.dedup();
    ids
}

/// Keeps the newest (highest id) row per `group_key`; rows arrive id DESC.
fn latest_per(rows: Vec<Value>, group_key: &str) -> Vec<Value> {
    let mut seen = std::collections::BTreeSet::new();
    rows.into_iter()
        .filter(|row| row[group_key].as_i64().is_some_and(|id| seen.insert(id)))
        .collect()
}

pub(crate) async fn list_drafts(
    pool: &SqlitePool,
    input: DraftListInput,
) -> Result<DraftListSnapshot, String> {
    let campaign_id = optional_campaign(input.campaign_id)?;
    let candidate_post_id = optional_candidate(input.candidate_post_id)?;
    let mut tx = pool.begin().await.map_err(read_error)?;
    let sql = format!(
        "SELECT d.id, d.campaign_id, d.candidate_post_id, d.angle, d.notes,
                d.content_intent, d.status, d.created_at, d.updated_at,
                {CANDIDATE_TARGET_COLUMNS}
         FROM drafts d
         INNER JOIN campaigns c ON c.id = d.campaign_id
         INNER JOIN candidate_posts cp ON cp.id = d.candidate_post_id
         INNER JOIN target_posts tp ON tp.id = cp.target_post_id
         WHERE (?1 IS NULL OR d.campaign_id = ?1)
           AND (?3 IS NULL OR d.candidate_post_id = ?3)
         ORDER BY d.status = 'archived', datetime(d.updated_at) DESC, d.id DESC
         LIMIT ?2"
    );
    let rows = sqlx::query(&sql)
        .bind(campaign_id)
        .bind(DRAFT_LIST_LIMIT)
        .bind(candidate_post_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(read_error)?;
    let drafts = rows_to_json(&rows);
    let total_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)
         FROM drafts d
         INNER JOIN campaigns c ON c.id = d.campaign_id
         INNER JOIN candidate_posts cp ON cp.id = d.candidate_post_id
         INNER JOIN target_posts tp ON tp.id = cp.target_post_id
         WHERE (?1 IS NULL OR d.campaign_id = ?1)
           AND (?2 IS NULL OR d.candidate_post_id = ?2)",
    )
    .bind(campaign_id)
    .bind(candidate_post_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(read_error)?;
    // `approval_ready` (0/1) is the native variant-level approval gate, so
    // the renderer can explain a blocked Send for approval before navigating.
    let variants_sql = format!(
        "SELECT dv.id, dv.draft_id, dv.variant_number, dv.hook, dv.body, dv.cta,
                dv.hashtags, dv.content_revision, dv.status, dv.created_at,
                dv.updated_at, {VARIANT_APPROVAL_READY_SQL} AS approval_ready
         FROM draft_variants dv WHERE dv.draft_id IN ({{ids}})
         ORDER BY dv.variant_number ASC, dv.id ASC"
    );
    let variants = by_ids(&mut tx, &variants_sql, &ids_of(&drafts, "id")).await?;
    let variant_ids = ids_of(&variants, "id");
    let audits = by_ids(
        &mut tx,
        "SELECT id, draft_variant_id, rule_key, severity, message, created_at
         FROM draft_audits WHERE draft_variant_id IN ({ids}) ORDER BY id ASC",
        &variant_ids,
    )
    .await?;
    let ai_audit_runs = latest_per(
        by_ids(
            &mut tx,
            "SELECT dar.id, dar.draft_variant_id, dar.content_revision, dar.agent_run_id,
                    dar.workflow_step_execution_id, dar.provider_key, dar.model_name,
                    dar.status, dar.summary, dar.error_message, dar.started_at,
                    dar.completed_at, dar.created_at, dar.updated_at
             FROM draft_ai_audit_runs dar
             INNER JOIN draft_variants dv ON dv.id = dar.draft_variant_id
             WHERE dar.draft_variant_id IN ({ids})
               AND dar.content_revision = dv.content_revision
             ORDER BY dar.id DESC",
            &variant_ids,
        )
        .await?,
        "draft_variant_id",
    );
    let completed_run_ids: Vec<i64> = ai_audit_runs
        .iter()
        .filter(|run| run["status"] == "completed")
        .filter_map(|run| run["id"].as_i64())
        .collect();
    let ai_audit_findings = by_ids(
        &mut tx,
        "SELECT id, audit_run_id, rule_key, severity, message, created_at
         FROM draft_ai_audit_findings WHERE audit_run_id IN ({ids}) ORDER BY id ASC",
        &completed_run_ids,
    )
    .await?;
    let quality_runs = latest_per(
        by_ids(
            &mut tx,
            "SELECT dqr.id, dqr.draft_variant_id, dqr.starting_content_revision,
                    dqr.current_content_revision, dqr.provider_key, dqr.model_name,
                    dqr.threshold, dqr.maximum_rewrite_count, dqr.applied_rewrite_count,
                    dqr.status, dqr.final_score, dqr.summary, dqr.error_message,
                    dqr.active_agent_run_id, dqr.active_ai_audit_run_id, dqr.started_at,
                    dqr.completed_at, dqr.created_at, dqr.updated_at
             FROM draft_quality_runs dqr
             INNER JOIN draft_variants dv ON dv.id = dqr.draft_variant_id
             WHERE dqr.draft_variant_id IN ({ids})
               AND dqr.current_content_revision = dv.content_revision
             ORDER BY dqr.id DESC",
            &variant_ids,
        )
        .await?,
        "draft_variant_id",
    );
    let quality_attempts = by_ids(
        &mut tx,
        "SELECT id, run_id, attempt_number, content_revision, input_hook, input_body,
                input_cta, input_hashtags, rewritten_hook, rewritten_body, rewritten_cta,
                rewritten_hashtags, overall_score, status, agent_run_id, ai_audit_run_id,
                created_at, updated_at, completed_at
         FROM draft_quality_attempts WHERE run_id IN ({ids})
         ORDER BY attempt_number ASC, id ASC",
        &ids_of(&quality_runs, "id"),
    )
    .await?;
    let quality_scores = by_ids(
        &mut tx,
        "SELECT id, attempt_id, category_key, score, feedback, created_at
         FROM draft_quality_category_scores WHERE attempt_id IN ({ids})
         ORDER BY category_key ASC, id ASC",
        &ids_of(&quality_attempts, "id"),
    )
    .await?;
    tx.commit().await.map_err(read_error)?;
    Ok(DraftListSnapshot {
        drafts,
        variants,
        audits,
        ai_audit_runs,
        ai_audit_findings,
        quality_runs,
        quality_attempts,
        quality_scores,
        total_count,
    })
}

pub(crate) async fn list_generation_requests(
    pool: &SqlitePool,
    input: DraftGenerationRequestListInput,
) -> Result<Vec<Value>, String> {
    let campaign_id = optional_campaign(input.campaign_id)?;
    let sql = format!(
        "SELECT dgr.id, dgr.campaign_id, dgr.candidate_post_id, dgr.agent_run_id,
                dgr.provider_key, dgr.model_name, dgr.playbook_key, dgr.variant_count,
                dgr.content_intent, dgr.workflow_run_id, dgr.workflow_step_id, dgr.angle,
                dgr.voice_notes, dgr.status, dgr.summary, dgr.generated_variants_json,
                dgr.error_message, dgr.created_draft_id, dgr.created_at, dgr.updated_at,
                {CANDIDATE_TARGET_COLUMNS}
         FROM draft_generation_requests dgr
         INNER JOIN campaigns c ON c.id = dgr.campaign_id
         INNER JOIN candidate_posts cp ON cp.id = dgr.candidate_post_id
         INNER JOIN target_posts tp ON tp.id = cp.target_post_id
         WHERE (?1 IS NULL OR dgr.campaign_id = ?1)
         ORDER BY CASE dgr.status
             WHEN 'generated' THEN 1 WHEN 'failed' THEN 2 WHEN 'pending' THEN 3
             WHEN 'saved' THEN 4 WHEN 'dismissed' THEN 5 ELSE 6
           END, datetime(dgr.updated_at) DESC, dgr.id DESC
         LIMIT ?2"
    );
    let rows = sqlx::query(&sql)
        .bind(campaign_id)
        .bind(GENERATION_REQUEST_LIMIT)
        .fetch_all(pool)
        .await
        .map_err(read_error)?;
    Ok(rows_to_json(&rows))
}

pub(crate) async fn list_workflow_options(
    pool: &SqlitePool,
    input: DraftWorkflowOptionsInput,
) -> Result<Vec<Value>, String> {
    if input.campaign_id <= 0 {
        return Err("Campaign id must be a positive integer".to_string());
    }
    let rows = sqlx::query(
        "SELECT wr.id AS workflow_run_id, ws.id AS workflow_step_id,
                cp.id AS candidate_id, wr.title, wr.status
         FROM workflow_runs wr
         INNER JOIN workflow_steps ws ON ws.workflow_run_id = wr.id AND ws.step_key = 'draft'
         INNER JOIN workflow_artifacts wa
           ON wa.workflow_run_id = wr.id AND wa.artifact_type = 'candidate_post'
         INNER JOIN candidate_posts cp
           ON cp.id = wa.artifact_id AND cp.campaign_id = wr.campaign_id
         WHERE wr.campaign_id = ?1
           AND wr.current_step_key = 'draft'
           AND wr.status IN ('running', 'blocked', 'failed')
           AND ws.status IN ('pending', 'running', 'blocked', 'failed')
           AND cp.status IN ('new', 'shortlisted')
           AND cp.relevance_score IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM draft_generation_requests dgr
             WHERE dgr.workflow_step_id = ws.id AND dgr.status IN ('pending', 'generated')
           )
         ORDER BY datetime(wr.updated_at) DESC, wr.id DESC, wa.id ASC
         LIMIT ?2",
    )
    .bind(input.campaign_id)
    .bind(WORKFLOW_OPTION_LIMIT)
    .fetch_all(pool)
    .await
    .map_err(read_error)?;
    Ok(rows_to_json(&rows))
}

struct ValidUpdate {
    angle: Option<String>,
    notes: Option<String>,
    status: Option<String>,
}

fn bounded(value: &str, label: &str, max: usize) -> Result<String, String> {
    let trimmed = js_trim(value);
    if utf16_len(trimmed) > max {
        return Err(format!("{label} must be at most {max} characters"));
    }
    Ok(trimmed.to_string())
}

fn validate_update(input: &UpdateDraftInput) -> Result<ValidUpdate, String> {
    if input.id <= 0 {
        return Err("Draft id must be a positive integer".to_string());
    }
    if let Some(status) = &input.status {
        if !DRAFT_STATUSES.contains(&status.as_str()) {
            return Err("Invalid draft status".to_string());
        }
    }
    Ok(ValidUpdate {
        angle: input
            .angle
            .as_deref()
            .map(|v| bounded(v, "Angle", 240))
            .transpose()?,
        notes: input
            .notes
            .as_deref()
            .map(|v| bounded(v, "Notes", 1000))
            .transpose()?,
        status: input.status.clone(),
    })
}

/// Sets only the provided fields; nothing provided or a missing id is a
/// silent no-op, as before.
pub(crate) async fn update_draft(pool: &SqlitePool, input: UpdateDraftInput) -> Result<(), String> {
    let valid = validate_update(&input)?;
    if valid.angle.is_none() && valid.notes.is_none() && valid.status.is_none() {
        return Ok(());
    }
    let id = input.id;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            sqlx::query(
                "UPDATE drafts SET
                   angle = CASE WHEN ?2 THEN ?3 ELSE angle END,
                   notes = CASE WHEN ?4 THEN ?5 ELSE notes END,
                   status = CASE WHEN ?6 THEN ?7 ELSE status END,
                   updated_at = datetime('now')
                 WHERE id = ?1",
            )
            .bind(id)
            .bind(valid.angle.is_some())
            .bind(valid.angle.as_deref())
            .bind(valid.notes.is_some())
            .bind(valid.notes.as_deref())
            .bind(valid.status.is_some())
            .bind(valid.status.as_deref())
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            Ok(Settlement::Accepted(()))
        })
    })
    .await
}

#[tauri::command]
pub async fn linkgo_draft_list(
    pool: State<'_, SqlitePool>,
    input: DraftListInput,
) -> Result<DraftListSnapshot, String> {
    list_drafts(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_draft_generation_request_list(
    pool: State<'_, SqlitePool>,
    input: DraftGenerationRequestListInput,
) -> Result<Vec<Value>, String> {
    list_generation_requests(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_draft_workflow_options(
    pool: State<'_, SqlitePool>,
    input: DraftWorkflowOptionsInput,
) -> Result<Vec<Value>, String> {
    list_workflow_options(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_draft_update(
    pool: State<'_, SqlitePool>,
    input: UpdateDraftInput,
) -> Result<(), String> {
    update_draft(pool.inner(), input).await
}

#[cfg(test)]
#[path = "drafts_reads_tests.rs"]
mod tests;
