//! Native content-calendar persistence: slot and eligible-approval lists,
//! slot create/update/archive, and the read-only schedule preflight.
//!
//! Writes run in one pinned transaction with the same ownership checks and
//! messages the renderer used. Slot-time parsing stays in the renderer
//! (`Date.parse` semantics); native bounds the text and the approval
//! scheduling command re-validates the time when a slot is scheduled.

use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteRow, Row, SqliteConnection, SqlitePool};
use tauri::State;

use crate::approval_reads::{audits_for, DraftAuditRow};
use crate::db_transaction::{settle, Settlement};
use crate::js_text::{js_trim, utf16_len};

const STORAGE_ERROR: &str = "Could not save calendar slot";
const READ_ERROR: &str = "Could not load content calendar";
pub(crate) const SLOT_LIST_LIMIT: i64 = 500;
pub(crate) const ELIGIBLE_LIMIT: i64 = 200;
const PURPOSES: [&str; 5] = ["reach", "trust", "proof", "conversion", "community"];
const FORMATS: [&str; 7] = [
    "text", "image", "carousel", "document", "video", "poll", "event",
];

fn storage_error(_: sqlx::Error) -> String {
    STORAGE_ERROR.to_string()
}

fn read_error(_: sqlx::Error) -> String {
    READ_ERROR.to_string()
}

fn positive(id: i64, label: &str) -> Result<(), String> {
    if id <= 0 {
        return Err(format!("{label} must be a positive integer"));
    }
    Ok(())
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CalendarListInput {
    #[serde(default)]
    pub campaign_id: Option<i64>,
}

/// Editable slot fields shared by create and update (serde's `flatten`
/// cannot be combined with `deny_unknown_fields`, so each input lists them).
#[derive(Debug, Clone)]
pub struct SlotFieldsInput {
    pub purpose: String,
    pub slot_for: String,
    pub timezone: Option<String>,
    pub format: String,
    pub angle: String,
    pub visual_direction: String,
    pub cta: String,
    pub notes: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateSlotInput {
    pub approval_id: i64,
    pub purpose: String,
    pub slot_for: String,
    #[serde(default)]
    pub timezone: Option<String>,
    pub format: String,
    pub angle: String,
    pub visual_direction: String,
    pub cta: String,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateSlotInput {
    pub id: i64,
    pub purpose: String,
    pub slot_for: String,
    #[serde(default)]
    pub timezone: Option<String>,
    pub format: String,
    pub angle: String,
    pub visual_direction: String,
    pub cta: String,
    #[serde(default)]
    pub notes: String,
}

impl CreateSlotInput {
    fn fields(&self) -> SlotFieldsInput {
        SlotFieldsInput {
            purpose: self.purpose.clone(),
            slot_for: self.slot_for.clone(),
            timezone: self.timezone.clone(),
            format: self.format.clone(),
            angle: self.angle.clone(),
            visual_direction: self.visual_direction.clone(),
            cta: self.cta.clone(),
            notes: self.notes.clone(),
        }
    }
}

impl UpdateSlotInput {
    fn fields(&self) -> SlotFieldsInput {
        SlotFieldsInput {
            purpose: self.purpose.clone(),
            slot_for: self.slot_for.clone(),
            timezone: self.timezone.clone(),
            format: self.format.clone(),
            angle: self.angle.clone(),
            visual_direction: self.visual_direction.clone(),
            cta: self.cta.clone(),
            notes: self.notes.clone(),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SlotIdInput {
    pub id: i64,
}

/// Validated, trimmed slot fields.
#[derive(Debug, Clone, PartialEq, Eq)]
struct SlotFields {
    purpose: String,
    slot_for: String,
    timezone: String,
    format: String,
    angle: String,
    visual_direction: String,
    cta: String,
    notes: String,
}

fn bounded(value: &str, label: &str, min: usize, max: usize) -> Result<String, String> {
    let trimmed = js_trim(value);
    let length = utf16_len(trimmed);
    if length < min {
        return Err(format!("{label} is required"));
    }
    if length > max {
        return Err(format!("{label} must be at most {max} characters"));
    }
    Ok(trimmed.to_string())
}

fn validate_fields(input: &SlotFieldsInput) -> Result<SlotFields, String> {
    if !PURPOSES.contains(&input.purpose.as_str()) {
        return Err("Invalid calendar purpose".to_string());
    }
    if !FORMATS.contains(&input.format.as_str()) {
        return Err("Invalid calendar format".to_string());
    }
    let timezone = bounded(
        input.timezone.as_deref().unwrap_or("local"),
        "Timezone",
        0,
        80,
    )?;
    Ok(SlotFields {
        purpose: input.purpose.clone(),
        slot_for: bounded(&input.slot_for, "Slot time", 1, 80)?,
        timezone: if timezone.is_empty() {
            "local".to_string()
        } else {
            timezone
        },
        format: input.format.clone(),
        angle: bounded(&input.angle, "Angle", 1, 500)?,
        visual_direction: bounded(&input.visual_direction, "Visual direction", 1, 500)?,
        cta: bounded(&input.cta, "CTA", 1, 500)?,
        notes: bounded(&input.notes, "Notes", 0, 1000)?,
    })
}

/// Shared approval/draft/variant/schedule columns (renderer row shape).
const APPROVAL_COLUMNS: &str = "a.status AS approval_status,
      a.reviewer_notes AS approval_reviewer_notes, a.approved_at AS approval_approved_at,
      c.name AS campaign_name, c.status AS campaign_status,
      d.id AS draft_id, d.angle AS draft_angle, d.notes AS draft_notes, d.candidate_post_id,
      cp.source_keyword AS candidate_source_keyword,
      tp.url AS target_url, tp.author_name AS target_author_name,
      tp.author_profile_url AS target_author_profile_url, tp.content AS target_content,
      dv.id AS variant_id, dv.variant_number, dv.hook AS variant_hook,
      dv.body AS variant_body, dv.cta AS variant_cta, dv.hashtags AS variant_hashtags,
      sj.id AS schedule_job_id, sj.scheduled_for AS schedule_scheduled_for,
      sj.timezone AS schedule_timezone, sj.status AS schedule_status,
      sj.attempt_count AS schedule_attempt_count, sj.last_error AS schedule_last_error,
      sj.updated_at AS schedule_updated_at";

const APPROVAL_JOINS: &str = "INNER JOIN drafts d ON d.id = a.draft_id
    INNER JOIN draft_variants dv ON dv.id = a.draft_variant_id
    INNER JOIN candidate_posts cp ON cp.id = d.candidate_post_id
    INNER JOIN target_posts tp ON tp.id = cp.target_post_id
    LEFT JOIN schedule_jobs sj ON sj.id = (
      SELECT latest_sj.id FROM schedule_jobs latest_sj
      WHERE latest_sj.approval_id = a.id
      ORDER BY datetime(latest_sj.updated_at) DESC, latest_sj.id DESC LIMIT 1
    )";

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ApprovalSnapshotRow {
    pub approval_id: i64,
    pub campaign_id: i64,
    pub approval_status: String,
    pub approval_reviewer_notes: String,
    pub approval_approved_at: Option<String>,
    pub campaign_name: String,
    pub campaign_status: String,
    pub draft_id: i64,
    pub draft_angle: String,
    pub draft_notes: String,
    pub candidate_post_id: i64,
    pub candidate_source_keyword: String,
    pub target_url: String,
    pub target_author_name: String,
    pub target_author_profile_url: String,
    pub target_content: String,
    pub variant_id: i64,
    pub variant_number: i64,
    pub variant_hook: String,
    pub variant_body: String,
    pub variant_cta: String,
    pub variant_hashtags: String,
    pub schedule_job_id: Option<i64>,
    pub schedule_scheduled_for: Option<String>,
    pub schedule_timezone: Option<String>,
    pub schedule_status: Option<String>,
    pub schedule_attempt_count: Option<i64>,
    pub schedule_last_error: Option<String>,
    pub schedule_updated_at: Option<String>,
}

/// Mirrors the renderer `ContentCalendarSlotDetailRow`.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct SlotDetailRow {
    pub id: i64,
    pub purpose: String,
    pub slot_for: String,
    pub timezone: String,
    pub format: String,
    pub angle: String,
    pub visual_direction: String,
    pub cta: String,
    pub notes: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(flatten)]
    pub approval: ApprovalSnapshotRow,
    pub publish_attempt_id: Option<i64>,
    pub publish_status: Option<String>,
    pub publish_external_post_url: Option<String>,
    pub publish_platform_post_id: Option<String>,
    pub publish_error_message: Option<String>,
    pub publish_created_at: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SlotListSnapshot {
    pub rows: Vec<SlotDetailRow>,
    pub audits: Vec<DraftAuditRow>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EligibleApprovalsSnapshot {
    pub rows: Vec<ApprovalSnapshotRow>,
    pub audits: Vec<DraftAuditRow>,
}

/// Approval id, date and zone the renderer passes to the approval
/// scheduling command after a successful preflight.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SlotScheduleTarget {
    pub approval_id: i64,
    pub scheduled_for: String,
    pub timezone: String,
}

fn approval_snapshot(row: &SqliteRow) -> ApprovalSnapshotRow {
    ApprovalSnapshotRow {
        approval_id: row.get("approval_id"),
        campaign_id: row.get("campaign_id"),
        approval_status: row.get("approval_status"),
        approval_reviewer_notes: row.get("approval_reviewer_notes"),
        approval_approved_at: row.get("approval_approved_at"),
        campaign_name: row.get("campaign_name"),
        campaign_status: row.get("campaign_status"),
        draft_id: row.get("draft_id"),
        draft_angle: row.get("draft_angle"),
        draft_notes: row.get("draft_notes"),
        candidate_post_id: row.get("candidate_post_id"),
        candidate_source_keyword: row.get("candidate_source_keyword"),
        target_url: row.get("target_url"),
        target_author_name: row.get("target_author_name"),
        target_author_profile_url: row.get("target_author_profile_url"),
        target_content: row.get("target_content"),
        variant_id: row.get("variant_id"),
        variant_number: row.get("variant_number"),
        variant_hook: row.get("variant_hook"),
        variant_body: row.get("variant_body"),
        variant_cta: row.get("variant_cta"),
        variant_hashtags: row.get("variant_hashtags"),
        schedule_job_id: row.get("schedule_job_id"),
        schedule_scheduled_for: row.get("schedule_scheduled_for"),
        schedule_timezone: row.get("schedule_timezone"),
        schedule_status: row.get("schedule_status"),
        schedule_attempt_count: row.get("schedule_attempt_count"),
        schedule_last_error: row.get("schedule_last_error"),
        schedule_updated_at: row.get("schedule_updated_at"),
    }
}

pub(crate) async fn list_slots(
    pool: &SqlitePool,
    input: CalendarListInput,
) -> Result<SlotListSnapshot, String> {
    if let Some(id) = input.campaign_id {
        positive(id, "Campaign id")?;
    }
    let mut transaction = pool.begin().await.map_err(read_error)?;
    let sql = format!(
        "SELECT ccs.id, ccs.campaign_id, ccs.approval_id, ccs.purpose, ccs.slot_for,
                ccs.timezone, ccs.format, ccs.angle, ccs.visual_direction, ccs.cta, ccs.notes,
                ccs.status, ccs.created_at, ccs.updated_at, {APPROVAL_COLUMNS},
                pa.id AS publish_attempt_id, pa.status AS publish_status,
                pa.external_post_url AS publish_external_post_url,
                pa.platform_post_id AS publish_platform_post_id,
                pa.error_message AS publish_error_message, pa.created_at AS publish_created_at
         FROM content_calendar_slots ccs
         INNER JOIN campaigns c ON c.id = ccs.campaign_id
         INNER JOIN approvals a ON a.id = ccs.approval_id
         {APPROVAL_JOINS}
         LEFT JOIN publish_attempts pa ON pa.id = (
           SELECT latest_pa.id FROM publish_attempts latest_pa
           WHERE latest_pa.approval_id = a.id AND latest_pa.status = 'succeeded'
           ORDER BY datetime(latest_pa.created_at) DESC, latest_pa.id DESC LIMIT 1
         )
         WHERE (?1 IS NULL OR ccs.campaign_id = ?1)
         ORDER BY ccs.status = 'archived', datetime(ccs.slot_for) ASC, ccs.id ASC
         LIMIT ?2"
    );
    let rows: Vec<SlotDetailRow> = sqlx::query(&sql)
        .bind(input.campaign_id)
        .bind(SLOT_LIST_LIMIT)
        .fetch_all(&mut *transaction)
        .await
        .map_err(read_error)?
        .iter()
        .map(|row| SlotDetailRow {
            id: row.get("id"),
            purpose: row.get("purpose"),
            slot_for: row.get("slot_for"),
            timezone: row.get("timezone"),
            format: row.get("format"),
            angle: row.get("angle"),
            visual_direction: row.get("visual_direction"),
            cta: row.get("cta"),
            notes: row.get("notes"),
            status: row.get("status"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
            approval: approval_snapshot(row),
            publish_attempt_id: row.get("publish_attempt_id"),
            publish_status: row.get("publish_status"),
            publish_external_post_url: row.get("publish_external_post_url"),
            publish_platform_post_id: row.get("publish_platform_post_id"),
            publish_error_message: row.get("publish_error_message"),
            publish_created_at: row.get("publish_created_at"),
        })
        .collect();
    let variant_ids: Vec<i64> = rows.iter().map(|row| row.approval.variant_id).collect();
    let audits = audits_for(&mut transaction, &variant_ids).await?;
    transaction.commit().await.map_err(read_error)?;
    Ok(SlotListSnapshot { rows, audits })
}

pub(crate) async fn list_eligible_approvals(
    pool: &SqlitePool,
    input: CalendarListInput,
) -> Result<EligibleApprovalsSnapshot, String> {
    if let Some(id) = input.campaign_id {
        positive(id, "Campaign id")?;
    }
    let mut transaction = pool.begin().await.map_err(read_error)?;
    let sql = format!(
        "SELECT a.id AS approval_id, a.campaign_id, {APPROVAL_COLUMNS}
         FROM approvals a
         INNER JOIN campaigns c ON c.id = a.campaign_id
         {APPROVAL_JOINS}
         LEFT JOIN content_calendar_slots ccs ON ccs.approval_id = a.id
         WHERE a.status IN ('approved', 'scheduled', 'published')
           AND ccs.id IS NULL
           AND c.status <> 'archived'
           AND (?1 IS NULL OR a.campaign_id = ?1)
         ORDER BY datetime(a.updated_at) DESC, a.id DESC
         LIMIT ?2"
    );
    let rows: Vec<ApprovalSnapshotRow> = sqlx::query(&sql)
        .bind(input.campaign_id)
        .bind(ELIGIBLE_LIMIT)
        .fetch_all(&mut *transaction)
        .await
        .map_err(read_error)?
        .iter()
        .map(approval_snapshot)
        .collect();
    let variant_ids: Vec<i64> = rows.iter().map(|row| row.variant_id).collect();
    let audits = audits_for(&mut transaction, &variant_ids).await?;
    transaction.commit().await.map_err(read_error)?;
    Ok(EligibleApprovalsSnapshot { rows, audits })
}

struct SlotState {
    approval_id: i64,
    approval_status: String,
    status: String,
    slot_for: String,
    timezone: String,
}

/// Loads a slot for mutation with the renderer's previous checks.
async fn slot_for_mutation(
    connection: &mut SqliteConnection,
    id: i64,
) -> Result<SlotState, String> {
    let row = sqlx::query(
        "SELECT ccs.approval_id, c.status AS campaign_status, a.status AS approval_status,
                ccs.status, ccs.slot_for, ccs.timezone
         FROM content_calendar_slots ccs
         INNER JOIN campaigns c ON c.id = ccs.campaign_id
         INNER JOIN approvals a ON a.id = ccs.approval_id
         WHERE ccs.id = ?1 LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage_error)?
    .ok_or_else(|| "Calendar slot was not found".to_string())?;
    if row.get::<String, _>("campaign_status") == "archived" {
        return Err("Campaign is archived".to_string());
    }
    Ok(SlotState {
        approval_id: row.get("approval_id"),
        approval_status: row.get("approval_status"),
        status: row.get("status"),
        slot_for: row.get("slot_for"),
        timezone: row.get("timezone"),
    })
}

pub(crate) async fn create_slot(pool: &SqlitePool, input: CreateSlotInput) -> Result<i64, String> {
    positive(input.approval_id, "Approval id")?;
    let fields = validate_fields(&input.fields())?;
    let approval_id = input.approval_id;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let approval = sqlx::query(
                "SELECT a.campaign_id, c.status AS campaign_status, a.status AS approval_status,
                        (SELECT COUNT(*) FROM content_calendar_slots existing
                         WHERE existing.approval_id = a.id) AS slot_count
                 FROM approvals a INNER JOIN campaigns c ON c.id = a.campaign_id
                 WHERE a.id = ?1 LIMIT 1",
            )
            .bind(approval_id)
            .fetch_optional(&mut *connection)
            .await
            .map_err(storage_error)?
            .ok_or_else(|| "Approval was not found".to_string())?;
            if approval.get::<String, _>("campaign_status") == "archived" {
                return Err("Campaign is archived".to_string());
            }
            let status: String = approval.get("approval_status");
            if !matches!(status.as_str(), "approved" | "scheduled" | "published") {
                return Err("Approval must be approved before calendar planning".to_string());
            }
            if approval.get::<i64, _>("slot_count") > 0 {
                return Err("Approval already has a calendar slot".to_string());
            }
            let id = sqlx::query(
                "INSERT INTO content_calendar_slots (
                   campaign_id, approval_id, purpose, slot_for, timezone, format, angle,
                   visual_direction, cta, notes, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'))",
            )
            .bind(approval.get::<i64, _>("campaign_id"))
            .bind(approval_id)
            .bind(&fields.purpose)
            .bind(&fields.slot_for)
            .bind(&fields.timezone)
            .bind(&fields.format)
            .bind(&fields.angle)
            .bind(&fields.visual_direction)
            .bind(&fields.cta)
            .bind(&fields.notes)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?
            .last_insert_rowid();
            Ok(Settlement::Accepted(id))
        })
    })
    .await
}

pub(crate) async fn update_slot(pool: &SqlitePool, input: UpdateSlotInput) -> Result<(), String> {
    positive(input.id, "Calendar slot id")?;
    let fields = validate_fields(&input.fields())?;
    let id = input.id;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let slot = slot_for_mutation(connection, id).await?;
            if slot.status != "planned" {
                return Err("Archived calendar slots cannot be edited".to_string());
            }
            sqlx::query(
                "UPDATE content_calendar_slots
                 SET purpose = ?1, slot_for = ?2, timezone = ?3, format = ?4, angle = ?5,
                     visual_direction = ?6, cta = ?7, notes = ?8, updated_at = datetime('now')
                 WHERE id = ?9",
            )
            .bind(&fields.purpose)
            .bind(&fields.slot_for)
            .bind(&fields.timezone)
            .bind(&fields.format)
            .bind(&fields.angle)
            .bind(&fields.visual_direction)
            .bind(&fields.cta)
            .bind(&fields.notes)
            .bind(id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            Ok(Settlement::Accepted(()))
        })
    })
    .await
}

pub(crate) async fn archive_slot(pool: &SqlitePool, input: SlotIdInput) -> Result<(), String> {
    positive(input.id, "Calendar slot id")?;
    let id = input.id;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            slot_for_mutation(connection, id).await?;
            sqlx::query(
                "UPDATE content_calendar_slots
                 SET status = 'archived', updated_at = datetime('now') WHERE id = ?1",
            )
            .bind(id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            Ok(Settlement::Accepted(()))
        })
    })
    .await
}

/// Read-only check before scheduling a slot's approval. Returns what the
/// renderer passes to `linkgo_approval_schedule`, which re-checks natively.
pub(crate) async fn schedule_preflight(
    pool: &SqlitePool,
    input: SlotIdInput,
) -> Result<SlotScheduleTarget, String> {
    positive(input.id, "Calendar slot id")?;
    let mut transaction = pool.begin().await.map_err(storage_error)?;
    let slot = slot_for_mutation(&mut transaction, input.id).await?;
    transaction.commit().await.map_err(storage_error)?;
    if slot.status == "archived" {
        return Err("Archived slots cannot be scheduled".to_string());
    }
    if slot.approval_status != "approved" {
        return Err("Only approved posts can be scheduled".to_string());
    }
    Ok(SlotScheduleTarget {
        approval_id: slot.approval_id,
        scheduled_for: slot.slot_for,
        timezone: slot.timezone,
    })
}

#[tauri::command]
pub async fn linkgo_content_calendar_list(
    pool: State<'_, SqlitePool>,
    input: CalendarListInput,
) -> Result<SlotListSnapshot, String> {
    list_slots(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_content_calendar_eligible_approvals(
    pool: State<'_, SqlitePool>,
    input: CalendarListInput,
) -> Result<EligibleApprovalsSnapshot, String> {
    list_eligible_approvals(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_content_calendar_create_slot(
    pool: State<'_, SqlitePool>,
    input: CreateSlotInput,
) -> Result<i64, String> {
    create_slot(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_content_calendar_update_slot(
    pool: State<'_, SqlitePool>,
    input: UpdateSlotInput,
) -> Result<(), String> {
    update_slot(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_content_calendar_archive_slot(
    pool: State<'_, SqlitePool>,
    input: SlotIdInput,
) -> Result<(), String> {
    archive_slot(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_content_calendar_schedule_preflight(
    pool: State<'_, SqlitePool>,
    input: SlotIdInput,
) -> Result<SlotScheduleTarget, String> {
    schedule_preflight(pool.inner(), input).await
}

#[cfg(test)]
#[path = "content_calendar_tests.rs"]
mod tests;
