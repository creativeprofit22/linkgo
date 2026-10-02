//! Native approval reads: the approval queue (with each approval's schedule
//! jobs, publish attempts, linked agent-run counts and draft audits), the
//! approval-eligible drafts list, and the renderer's LinkedIn publish
//! preflight. Each read runs in one transaction so every part comes from the
//! same snapshot. Lists are capped; the renderer never gets an unbounded read.

use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteRow, Row, SqliteConnection, SqlitePool};
use tauri::State;

use crate::approval_review::assert_publish_ready;

const READ_ERROR: &str = "Could not load approvals";
pub(crate) const APPROVAL_LIST_LIMIT: i64 = 500;
pub(crate) const ELIGIBLE_DRAFT_LIMIT: i64 = 200;

/// Readiness of variant `dv` at its current revision, as one SQL literal so
/// both constants below are built from the same text.
macro_rules! ready_sql {
    () => {
        "EXISTS (
    SELECT 1 FROM approval_ready_variants ready
    WHERE ready.draft_variant_id = dv.id
      AND ready.content_revision = dv.content_revision
  )"
    };
}

/// Readiness at the variant's current revision (same rule as the renderer SQL).
const READY_SQL: &str = ready_sql!();

/// Variant-level approval gate for `dv`: readiness at the current revision and
/// no `block` audit at any revision. Shared by the eligible-drafts list and
/// the draft list's `approval_ready` flag so the two cannot drift; draft,
/// campaign and existing-approval checks stay with each caller.
pub(crate) const VARIANT_APPROVAL_READY_SQL: &str = concat!(
    "(",
    ready_sql!(),
    " AND NOT EXISTS (
    SELECT 1 FROM draft_audits da
    WHERE da.draft_variant_id = dv.id AND da.severity = 'block'
  ))"
);

/// Draft, campaign, target and variant columns shared by both lists.
const SNAPSHOT_COLUMNS: &str = "d.candidate_post_id AS draft_candidate_post_id,
      d.angle AS draft_angle, d.notes AS draft_notes, d.status AS draft_status,
      c.name AS campaign_name, c.status AS campaign_status,
      cp.source_keyword AS candidate_source_keyword,
      tp.url AS target_url, tp.author_name AS target_author_name,
      tp.author_profile_url AS target_author_profile_url, tp.content AS target_content,
      dv.variant_number, dv.hook AS variant_hook, dv.body AS variant_body,
      dv.cta AS variant_cta, dv.hashtags AS variant_hashtags, dv.status AS variant_status";

fn read_error(_: sqlx::Error) -> String {
    READ_ERROR.to_string()
}

fn validate_campaign(campaign_id: Option<i64>) -> Result<(), String> {
    if campaign_id.is_some_and(|id| id <= 0) {
        return Err("Campaign id must be a positive integer".to_string());
    }
    Ok(())
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApprovalListInput {
    #[serde(default)]
    pub campaign_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublishPreflightInput {
    pub approval_id: i64,
    #[serde(default)]
    pub schedule_job_id: Option<i64>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct DraftSnapshotRow {
    pub campaign_id: i64,
    pub draft_id: i64,
    pub draft_variant_id: i64,
    pub draft_candidate_post_id: i64,
    pub draft_angle: String,
    pub draft_notes: String,
    pub draft_status: String,
    pub campaign_name: String,
    pub campaign_status: String,
    pub candidate_source_keyword: String,
    pub target_url: String,
    pub target_author_name: String,
    pub target_author_profile_url: String,
    pub target_content: String,
    pub variant_number: i64,
    pub variant_hook: String,
    pub variant_body: String,
    pub variant_cta: String,
    pub variant_hashtags: String,
    pub variant_status: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Mirrors the renderer `ApprovalDetailRow`.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ApprovalDetailRow {
    pub id: i64,
    pub status: String,
    pub reviewed_content_revision: Option<i64>,
    pub current_content_revision: i64,
    pub readiness: i64,
    pub reviewer_notes: String,
    pub approved_at: Option<String>,
    pub rejected_at: Option<String>,
    #[serde(flatten)]
    pub snapshot: DraftSnapshotRow,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ScheduleJobRow {
    pub id: i64,
    pub approval_id: i64,
    pub platform: String,
    pub scheduled_for: String,
    pub timezone: String,
    pub status: String,
    pub idempotency_key: String,
    pub attempt_count: i64,
    pub max_attempts: i64,
    pub next_attempt_at: Option<String>,
    pub last_attempted_at: Option<String>,
    pub last_error: String,
    pub locked_at: Option<String>,
    pub locked_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct PublishAttemptRow {
    pub id: i64,
    pub approval_id: i64,
    pub schedule_job_id: Option<i64>,
    pub platform: String,
    pub status: String,
    pub external_post_url: String,
    pub platform_post_id: String,
    pub error_message: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct LinkedAgentRunCountRow {
    pub approval_id: i64,
    pub count: i64,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct DraftAuditRow {
    pub id: i64,
    pub draft_variant_id: i64,
    pub rule_key: String,
    pub severity: String,
    pub message: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalListSnapshot {
    pub rows: Vec<ApprovalDetailRow>,
    pub schedule_jobs: Vec<ScheduleJobRow>,
    pub publish_attempts: Vec<PublishAttemptRow>,
    pub linked_agent_run_counts: Vec<LinkedAgentRunCountRow>,
    pub audits: Vec<DraftAuditRow>,
    /// Uncapped number of matching approvals; `rows` stops at the list limit.
    pub total_count: i64,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EligibleDraftsSnapshot {
    pub rows: Vec<DraftSnapshotRow>,
    pub audits: Vec<DraftAuditRow>,
    /// Uncapped number of eligible drafts; `rows` stops at the list limit.
    pub total_count: i64,
}

fn snapshot_row(row: &SqliteRow) -> DraftSnapshotRow {
    DraftSnapshotRow {
        campaign_id: row.get("campaign_id"),
        draft_id: row.get("draft_id"),
        draft_variant_id: row.get("draft_variant_id"),
        draft_candidate_post_id: row.get("draft_candidate_post_id"),
        draft_angle: row.get("draft_angle"),
        draft_notes: row.get("draft_notes"),
        draft_status: row.get("draft_status"),
        campaign_name: row.get("campaign_name"),
        campaign_status: row.get("campaign_status"),
        candidate_source_keyword: row.get("candidate_source_keyword"),
        target_url: row.get("target_url"),
        target_author_name: row.get("target_author_name"),
        target_author_profile_url: row.get("target_author_profile_url"),
        target_content: row.get("target_content"),
        variant_number: row.get("variant_number"),
        variant_hook: row.get("variant_hook"),
        variant_body: row.get("variant_body"),
        variant_cta: row.get("variant_cta"),
        variant_hashtags: row.get("variant_hashtags"),
        variant_status: row.get("variant_status"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn placeholders(count: usize) -> String {
    (1..=count)
        .map(|index| format!("?{index}"))
        .collect::<Vec<_>>()
        .join(", ")
}

async fn fetch_by_ids(
    connection: &mut SqliteConnection,
    sql: &str,
    ids: &[i64],
) -> Result<Vec<SqliteRow>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let sql = sql.replace("{ids}", &placeholders(ids.len()));
    let mut query = sqlx::query(&sql);
    for id in ids {
        query = query.bind(id);
    }
    query.fetch_all(&mut *connection).await.map_err(read_error)
}

pub(crate) async fn audits_for(
    connection: &mut SqliteConnection,
    variant_ids: &[i64],
) -> Result<Vec<DraftAuditRow>, String> {
    let mut unique = variant_ids.to_vec();
    unique.sort_unstable();
    unique.dedup();
    Ok(fetch_by_ids(
        connection,
        "SELECT id, draft_variant_id, rule_key, severity, message, created_at
         FROM draft_audits WHERE draft_variant_id IN ({ids}) ORDER BY id ASC",
        &unique,
    )
    .await?
    .iter()
    .map(|row| DraftAuditRow {
        id: row.get("id"),
        draft_variant_id: row.get("draft_variant_id"),
        rule_key: row.get("rule_key"),
        severity: row.get("severity"),
        message: row.get("message"),
        created_at: row.get("created_at"),
    })
    .collect())
}

pub(crate) async fn list_approvals(
    pool: &SqlitePool,
    input: ApprovalListInput,
) -> Result<ApprovalListSnapshot, String> {
    validate_campaign(input.campaign_id)?;
    let mut transaction = pool.begin().await.map_err(read_error)?;
    // Rows and total share one FROM/WHERE so the count matches the cap.
    let from_where = "FROM approvals a
         INNER JOIN campaigns c ON c.id = a.campaign_id
         INNER JOIN drafts d ON d.id = a.draft_id
         INNER JOIN draft_variants dv ON dv.id = a.draft_variant_id
         INNER JOIN candidate_posts cp ON cp.id = d.candidate_post_id
         INNER JOIN target_posts tp ON tp.id = cp.target_post_id
         WHERE (?1 IS NULL OR a.campaign_id = ?1)";
    let sql = format!(
        "SELECT a.id, a.campaign_id, a.draft_id, a.draft_variant_id, a.status,
                a.reviewed_content_revision, dv.content_revision AS current_content_revision,
                {READY_SQL} AS readiness, a.reviewer_notes, a.approved_at, a.rejected_at,
                a.created_at, a.updated_at, {SNAPSHOT_COLUMNS}
         {from_where}
         ORDER BY a.status IN ('published', 'cancelled', 'rejected'),
                  datetime(a.updated_at) DESC, a.id DESC
         LIMIT ?2"
    );
    let rows: Vec<ApprovalDetailRow> = sqlx::query(&sql)
        .bind(input.campaign_id)
        .bind(APPROVAL_LIST_LIMIT)
        .fetch_all(&mut *transaction)
        .await
        .map_err(read_error)?
        .iter()
        .map(|row| ApprovalDetailRow {
            id: row.get("id"),
            status: row.get("status"),
            reviewed_content_revision: row.get("reviewed_content_revision"),
            current_content_revision: row.get("current_content_revision"),
            readiness: row.get("readiness"),
            reviewer_notes: row.get("reviewer_notes"),
            approved_at: row.get("approved_at"),
            rejected_at: row.get("rejected_at"),
            snapshot: snapshot_row(row),
        })
        .collect();
    let total_count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) {from_where}"))
        .bind(input.campaign_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(read_error)?;

    let approval_ids: Vec<i64> = rows.iter().map(|row| row.id).collect();
    let variant_ids: Vec<i64> = rows
        .iter()
        .map(|row| row.snapshot.draft_variant_id)
        .collect();
    let schedule_jobs = fetch_by_ids(
        &mut transaction,
        "SELECT id, approval_id, platform, scheduled_for, timezone, status, idempotency_key,
                attempt_count, max_attempts, next_attempt_at, last_attempted_at, last_error,
                locked_at, locked_by, created_at, updated_at
         FROM schedule_jobs WHERE approval_id IN ({ids})
         ORDER BY datetime(updated_at) DESC, id DESC",
        &approval_ids,
    )
    .await?
    .iter()
    .map(|row| ScheduleJobRow {
        id: row.get("id"),
        approval_id: row.get("approval_id"),
        platform: row.get("platform"),
        scheduled_for: row.get("scheduled_for"),
        timezone: row.get("timezone"),
        status: row.get("status"),
        idempotency_key: row.get("idempotency_key"),
        attempt_count: row.get("attempt_count"),
        max_attempts: row.get("max_attempts"),
        next_attempt_at: row.get("next_attempt_at"),
        last_attempted_at: row.get("last_attempted_at"),
        last_error: row.get("last_error"),
        locked_at: row.get("locked_at"),
        locked_by: row.get("locked_by"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
    .collect();
    let publish_attempts = fetch_by_ids(
        &mut transaction,
        "SELECT id, approval_id, schedule_job_id, platform, status, external_post_url,
                platform_post_id, error_message, created_at
         FROM publish_attempts WHERE approval_id IN ({ids})
         ORDER BY datetime(created_at) DESC, id DESC",
        &approval_ids,
    )
    .await?
    .iter()
    .map(|row| PublishAttemptRow {
        id: row.get("id"),
        approval_id: row.get("approval_id"),
        schedule_job_id: row.get("schedule_job_id"),
        platform: row.get("platform"),
        status: row.get("status"),
        external_post_url: row.get("external_post_url"),
        platform_post_id: row.get("platform_post_id"),
        error_message: row.get("error_message"),
        created_at: row.get("created_at"),
    })
    .collect();
    let linked_agent_run_counts = fetch_by_ids(
        &mut transaction,
        "SELECT approval_id, COUNT(*) AS count FROM agent_run_approval_checkpoints
         WHERE approval_id IN ({ids}) GROUP BY approval_id ORDER BY approval_id",
        &approval_ids,
    )
    .await?
    .iter()
    .map(|row| LinkedAgentRunCountRow {
        approval_id: row.get("approval_id"),
        count: row.get("count"),
    })
    .collect();
    let audits = audits_for(&mut transaction, &variant_ids).await?;
    transaction.commit().await.map_err(read_error)?;
    Ok(ApprovalListSnapshot {
        rows,
        schedule_jobs,
        publish_attempts,
        linked_agent_run_counts,
        audits,
        total_count,
    })
}

pub(crate) async fn list_eligible_drafts(
    pool: &SqlitePool,
    input: ApprovalListInput,
) -> Result<EligibleDraftsSnapshot, String> {
    validate_campaign(input.campaign_id)?;
    let mut transaction = pool.begin().await.map_err(read_error)?;
    // Rows and total share one FROM/WHERE so the count matches the cap.
    let from_where = format!(
        "FROM drafts d
         INNER JOIN campaigns c ON c.id = d.campaign_id
         INNER JOIN candidate_posts cp ON cp.id = d.candidate_post_id
         INNER JOIN target_posts tp ON tp.id = cp.target_post_id
         INNER JOIN draft_variants dv ON dv.draft_id = d.id AND dv.status = 'selected'
         LEFT JOIN approvals a ON a.draft_id = d.id
         WHERE d.status = 'ready_for_review'
           AND a.id IS NULL
           AND c.status <> 'archived'
           AND (?1 IS NULL OR d.campaign_id = ?1)
           AND (SELECT COUNT(*) FROM draft_variants selected_dv
                WHERE selected_dv.draft_id = d.id AND selected_dv.status = 'selected') = 1
           AND {VARIANT_APPROVAL_READY_SQL}"
    );
    let sql = format!(
        "SELECT d.campaign_id, d.id AS draft_id, dv.id AS draft_variant_id,
                d.created_at, d.updated_at, {SNAPSHOT_COLUMNS}
         {from_where}
         ORDER BY datetime(d.updated_at) DESC, d.id DESC
         LIMIT ?2"
    );
    let rows: Vec<DraftSnapshotRow> = sqlx::query(&sql)
        .bind(input.campaign_id)
        .bind(ELIGIBLE_DRAFT_LIMIT)
        .fetch_all(&mut *transaction)
        .await
        .map_err(read_error)?
        .iter()
        .map(snapshot_row)
        .collect();
    let total_count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) {from_where}"))
        .bind(input.campaign_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(read_error)?;
    let variant_ids: Vec<i64> = rows.iter().map(|row| row.draft_variant_id).collect();
    let audits = audits_for(&mut transaction, &variant_ids).await?;
    transaction.commit().await.map_err(read_error)?;
    Ok(EligibleDraftsSnapshot {
        rows,
        audits,
        total_count,
    })
}

/// Read-only publish preflight with the renderer's previous checks and
/// messages, in order: kill switch, approval, campaign, status, prior
/// success, reviewed-revision readiness, then the current schedule job.
pub(crate) async fn publish_preflight(
    pool: &SqlitePool,
    input: PublishPreflightInput,
) -> Result<(), String> {
    if input.approval_id <= 0 {
        return Err("Approval id must be a positive integer".to_string());
    }
    if input.schedule_job_id.is_some_and(|id| id <= 0) {
        return Err("Schedule job id must be a positive integer".to_string());
    }
    let mut transaction = pool.begin().await.map_err(read_error)?;
    let safety = sqlx::query(
        "SELECT global_kill_switch, kill_switch_reason FROM safety_settings WHERE id = 1 LIMIT 1",
    )
    .fetch_optional(&mut *transaction)
    .await
    .map_err(read_error)?;
    if let Some(row) = safety {
        if row.get::<i64, _>("global_kill_switch") == 1 {
            let reason: String = row.get("kill_switch_reason");
            return Err(if reason.is_empty() {
                "Global kill switch is enabled".to_string()
            } else {
                format!("Global kill switch is enabled: {reason}")
            });
        }
    }
    let approval = sqlx::query(
        "SELECT a.status, c.status AS campaign_status,
                (SELECT COUNT(*) FROM publish_attempts pa
                 WHERE pa.approval_id = a.id AND pa.status = 'succeeded') AS successes
         FROM approvals a INNER JOIN campaigns c ON c.id = a.campaign_id
         WHERE a.id = ?1 LIMIT 1",
    )
    .bind(input.approval_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(read_error)?
    .ok_or_else(|| "Approval was not found".to_string())?;
    let status: String = approval.get("status");
    if approval.get::<String, _>("campaign_status") == "archived" {
        return Err("Campaign is archived".to_string());
    }
    if !matches!(status.as_str(), "approved" | "scheduled") {
        return Err("Only approved or scheduled approvals can publish via LinkedIn".to_string());
    }
    if approval.get::<i64, _>("successes") > 0 {
        return Err("Approval already has a successful publish attempt".to_string());
    }
    assert_publish_ready(&mut transaction, input.approval_id, READ_ERROR).await?;
    let current = sqlx::query(
        "SELECT id, status FROM schedule_jobs WHERE approval_id = ?1
         ORDER BY datetime(updated_at) DESC, id DESC LIMIT 1",
    )
    .bind(input.approval_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(read_error)?;
    transaction.commit().await.map_err(read_error)?;

    let Some(requested) = input.schedule_job_id else {
        return if status == "scheduled" {
            Err("Scheduled approvals require the current schedule job".to_string())
        } else {
            Ok(())
        };
    };
    let is_current = current.is_some_and(|row| {
        row.get::<i64, _>("id") == requested && row.get::<String, _>("status") == "scheduled"
    });
    if is_current {
        Ok(())
    } else {
        Err("Schedule job is not the current scheduled job".to_string())
    }
}

#[tauri::command]
pub async fn linkgo_approval_list(
    pool: State<'_, SqlitePool>,
    input: ApprovalListInput,
) -> Result<ApprovalListSnapshot, String> {
    list_approvals(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_approval_eligible_drafts(
    pool: State<'_, SqlitePool>,
    input: ApprovalListInput,
) -> Result<EligibleDraftsSnapshot, String> {
    list_eligible_drafts(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_approval_publish_preflight(
    pool: State<'_, SqlitePool>,
    input: PublishPreflightInput,
) -> Result<(), String> {
    publish_preflight(pool.inner(), input).await
}

#[cfg(test)]
#[path = "approval_reads_tests.rs"]
mod tests;
