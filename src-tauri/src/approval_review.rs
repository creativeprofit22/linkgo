//! Native approval review mutations: creating an approval for a ready draft
//! and moving an approval through its human review lifecycle.
//!
//! Layers:
//! - domain: pure status/transition/eligibility rules over loaded facts;
//! - storage: reads facts and writes side effects on one connection;
//! - commands: validate IPC input and settle through one `BEGIN IMMEDIATE`
//!   transaction so every write commits or rolls back together.

use serde::Deserialize;
use serde_json::json;
use sqlx::{Row, SqliteConnection, SqlitePool};
use tauri::State;

use crate::agent_continuations::reject_linked_continuations;
use crate::approval_transaction::{insert_safety_audit, settle, SafetyAuditEvent, Settlement};

const STORAGE_ERROR: &str = "Could not settle approval review";
const MAX_NOTES_CHARS: usize = 1000;
const DEFAULT_REJECTION_DETAIL: &str = "Approval rejected by operator review";
pub(crate) const STALE_APPROVAL_ERROR: &str =
    "Approval is stale or not ready. Reload and run current AI audit and quality checks.";
const NOT_READY_FOR_APPROVAL_ERROR: &str = "Selected variant requires both a completed current-revision AI audit with six canonical non-blocking findings and a passed quality score of at least 70";

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ApprovalStatus {
    NeedsReview,
    ChangesRequested,
    Approved,
    Rejected,
    Scheduled,
    Published,
    Cancelled,
}

impl ApprovalStatus {
    pub(crate) fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "needs_review" => Self::NeedsReview,
            "changes_requested" => Self::ChangesRequested,
            "approved" => Self::Approved,
            "rejected" => Self::Rejected,
            "scheduled" => Self::Scheduled,
            "published" => Self::Published,
            "cancelled" => Self::Cancelled,
            _ => return None,
        })
    }

    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::NeedsReview => "needs_review",
            Self::ChangesRequested => "changes_requested",
            Self::Approved => "approved",
            Self::Rejected => "rejected",
            Self::Scheduled => "scheduled",
            Self::Published => "published",
            Self::Cancelled => "cancelled",
        }
    }
}

/// Human review transitions. Scheduling and publishing are owned by their
/// own native commands and are never reachable from here.
pub(crate) fn assert_transition(
    current: ApprovalStatus,
    next: ApprovalStatus,
) -> Result<(), &'static str> {
    use ApprovalStatus::*;
    let allowed: &[ApprovalStatus] = match current {
        NeedsReview => &[Approved, ChangesRequested, Rejected, Cancelled],
        ChangesRequested => &[NeedsReview, Approved, Rejected, Cancelled],
        Approved => &[NeedsReview, ChangesRequested, Cancelled],
        Cancelled => &[NeedsReview],
        Rejected | Scheduled | Published => &[],
    };
    if allowed.contains(&next) {
        Ok(())
    } else {
        Err("Unsupported approval transition")
    }
}

/// Facts loaded for a draft before creating its approval.
#[derive(Debug, Clone, Default)]
pub(crate) struct CreateFacts {
    pub campaign_id: i64,
    pub campaign_status: String,
    pub draft_status: String,
    pub selected_variant_id: Option<i64>,
    pub selected_count: i64,
    pub current_revision_ready: bool,
    pub block_audit_count: i64,
    pub existing_approval_count: i64,
}

/// Returns the selected variant id when the draft may enter review.
pub(crate) fn evaluate_create(facts: &CreateFacts) -> Result<i64, &'static str> {
    if facts.campaign_status == "archived" {
        return Err("Campaign is archived");
    }
    if facts.draft_status != "ready_for_review" {
        return Err("Draft is not ready for review");
    }
    let variant_id = match facts.selected_variant_id {
        Some(id) if facts.selected_count == 1 => id,
        _ => return Err("Select a draft variant before review"),
    };
    if !facts.current_revision_ready {
        return Err(NOT_READY_FOR_APPROVAL_ERROR);
    }
    // Any block finding, even on an older revision, keeps the variant out.
    if facts.block_audit_count > 0 {
        return Err("Blocked variants cannot be sent for approval");
    }
    if facts.existing_approval_count > 0 {
        return Err("Draft already has an approval record");
    }
    Ok(variant_id)
}

// ---------------------------------------------------------------------------
// Command input validation
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateApprovalInput {
    pub draft_id: i64,
    #[serde(default)]
    pub reviewer_notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetApprovalStatusInput {
    pub id: i64,
    pub status: String,
    #[serde(default)]
    pub content_revision: Option<i64>,
    #[serde(default)]
    pub reviewer_notes: Option<String>,
}

pub(crate) struct ValidCreate {
    draft_id: i64,
    reviewer_notes: String,
}

pub(crate) struct ValidSetStatus {
    id: i64,
    status: ApprovalStatus,
    content_revision: Option<i64>,
    reviewer_notes: Option<String>,
}

fn validate_notes(value: Option<String>) -> Result<Option<String>, String> {
    let Some(value) = value else { return Ok(None) };
    let trimmed = value.trim();
    if trimmed.chars().count() > MAX_NOTES_CHARS {
        return Err("Reviewer notes must be 1000 characters or fewer".to_string());
    }
    Ok(Some(trimmed.to_string()))
}

pub(crate) fn validate_create(input: CreateApprovalInput) -> Result<ValidCreate, String> {
    if input.draft_id <= 0 {
        return Err("Draft id must be a positive integer".to_string());
    }
    Ok(ValidCreate {
        draft_id: input.draft_id,
        reviewer_notes: validate_notes(input.reviewer_notes)?.unwrap_or_default(),
    })
}

pub(crate) fn validate_set_status(input: SetApprovalStatusInput) -> Result<ValidSetStatus, String> {
    if input.id <= 0 {
        return Err("Approval id must be a positive integer".to_string());
    }
    let status = ApprovalStatus::parse(&input.status)
        .ok_or_else(|| "Approval status is invalid".to_string())?;
    if matches!(input.content_revision, Some(revision) if revision <= 0) {
        return Err("Content revision must be a positive integer".to_string());
    }
    if status == ApprovalStatus::Approved && input.content_revision.is_none() {
        return Err(
            "Reload the approval and review its current content before approving".to_string(),
        );
    }
    Ok(ValidSetStatus {
        id: input.id,
        status,
        content_revision: input.content_revision,
        reviewer_notes: validate_notes(input.reviewer_notes)?,
    })
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

fn storage<E>(_: E) -> String {
    STORAGE_ERROR.to_string()
}

async fn load_create_facts(
    connection: &mut SqliteConnection,
    draft_id: i64,
) -> Result<Option<CreateFacts>, String> {
    let row = sqlx::query(
        "SELECT d.campaign_id, c.status AS campaign_status, d.status AS draft_status,
                (SELECT dv.id FROM draft_variants dv
                  WHERE dv.draft_id = d.id AND dv.status = 'selected'
                  ORDER BY dv.id LIMIT 1) AS selected_variant_id,
                (SELECT COUNT(*) FROM draft_variants dv
                  WHERE dv.draft_id = d.id AND dv.status = 'selected') AS selected_count,
                (SELECT COUNT(*) FROM approvals a WHERE a.draft_id = d.id) AS existing_count
         FROM drafts d INNER JOIN campaigns c ON c.id = d.campaign_id
         WHERE d.id = ?1 LIMIT 1",
    )
    .bind(draft_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage)?;
    let Some(row) = row else { return Ok(None) };
    let mut facts = CreateFacts {
        campaign_id: row.try_get("campaign_id").map_err(storage)?,
        campaign_status: row.try_get("campaign_status").map_err(storage)?,
        draft_status: row.try_get("draft_status").map_err(storage)?,
        selected_variant_id: row.try_get("selected_variant_id").map_err(storage)?,
        selected_count: row.try_get("selected_count").map_err(storage)?,
        existing_approval_count: row.try_get("existing_count").map_err(storage)?,
        ..CreateFacts::default()
    };
    if let Some(variant_id) = facts.selected_variant_id {
        facts.current_revision_ready = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM approval_ready_variants ready
             INNER JOIN draft_variants dv ON dv.id = ready.draft_variant_id
             WHERE ready.draft_variant_id = ?1 AND ready.content_revision = dv.content_revision",
        )
        .bind(variant_id)
        .fetch_one(&mut *connection)
        .await
        .map_err(storage)?
            == 1;
        facts.block_audit_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM draft_audits WHERE draft_variant_id = ?1 AND severity = 'block'",
        )
        .bind(variant_id)
        .fetch_one(&mut *connection)
        .await
        .map_err(storage)?;
    }
    Ok(Some(facts))
}

struct ApprovalRow {
    id: i64,
    campaign_id: i64,
    campaign_status: String,
    status: String,
    draft_id: i64,
    reviewed_content_revision: Option<i64>,
}

async fn load_approval(
    connection: &mut SqliteConnection,
    id: i64,
) -> Result<Option<ApprovalRow>, String> {
    let row = sqlx::query(
        "SELECT a.id, a.campaign_id, c.status AS campaign_status, a.status, a.draft_id,
                a.reviewed_content_revision
         FROM approvals a INNER JOIN campaigns c ON c.id = a.campaign_id
         WHERE a.id = ?1 LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage)?;
    let Some(row) = row else { return Ok(None) };
    Ok(Some(ApprovalRow {
        id: row.try_get("id").map_err(storage)?,
        campaign_id: row.try_get("campaign_id").map_err(storage)?,
        campaign_status: row.try_get("campaign_status").map_err(storage)?,
        status: row.try_get("status").map_err(storage)?,
        draft_id: row.try_get("draft_id").map_err(storage)?,
        reviewed_content_revision: row.try_get("reviewed_content_revision").map_err(storage)?,
    }))
}

/// True when the approval's variant is ready at exactly `revision`, which must
/// also be the variant's current content revision.
pub(crate) async fn is_ready_at_revision(
    connection: &mut SqliteConnection,
    approval_id: i64,
    revision: Option<i64>,
    storage_error: &str,
) -> Result<bool, String> {
    let Some(revision) = revision else {
        return Ok(false);
    };
    let count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM approval_ready_variants ready
         INNER JOIN approvals a ON a.draft_variant_id = ready.draft_variant_id
             AND a.draft_id = ready.draft_id AND a.campaign_id = ready.campaign_id
         INNER JOIN draft_variants dv ON dv.id = ready.draft_variant_id
         WHERE a.id = ?1 AND ready.content_revision = ?2 AND dv.content_revision = ?2",
    )
    .bind(approval_id)
    .bind(revision)
    .fetch_one(&mut *connection)
    .await
    .map_err(|_| storage_error.to_string())?;
    Ok(count == 1)
}

/// Publish gate shared by the renderer preflight and publish recording: the
/// approval's variant must still be ready at exactly the revision the reviewer
/// approved. A newer pending, failed or blocking AI audit (or any other lost
/// evidence) fails it even though the approval status is still `approved`.
pub(crate) async fn assert_publish_ready(
    connection: &mut SqliteConnection,
    approval_id: i64,
    storage_error: &str,
) -> Result<(), String> {
    let reviewed_revision = sqlx::query_scalar::<_, Option<i64>>(
        "SELECT reviewed_content_revision FROM approvals WHERE id = ?1 LIMIT 1",
    )
    .bind(approval_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(|_| storage_error.to_string())?
    .ok_or_else(|| "Approval was not found".to_string())?;
    if is_ready_at_revision(connection, approval_id, reviewed_revision, storage_error).await? {
        Ok(())
    } else {
        Err(STALE_APPROVAL_ERROR.to_string())
    }
}

async fn set_draft_status(
    connection: &mut SqliteConnection,
    draft_id: i64,
    status: &str,
) -> Result<(), String> {
    sqlx::query("UPDATE drafts SET status = ?1, updated_at = datetime('now') WHERE id = ?2")
        .bind(status)
        .bind(draft_id)
        .execute(&mut *connection)
        .await
        .map_err(storage)?;
    Ok(())
}

async fn upsert_rejection_error(
    connection: &mut SqliteConnection,
    campaign_id: i64,
    approval_id: i64,
    detail: &str,
) -> Result<(), String> {
    const TITLE: &str = "Approval rejected";
    let existing_id = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM error_queue_items
         WHERE source_type = 'approval' AND source_id = ?1
           AND status IN ('open', 'in_progress', 'awaiting_review')
         LIMIT 1",
    )
    .bind(approval_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage)?;

    let (error_item_id, event_type, summary) = if let Some(id) = existing_id {
        sqlx::query(
            "UPDATE error_queue_items
             SET campaign_id = ?1, title = ?2, detail = ?3, severity = 'warning',
                 updated_at = datetime('now')
             WHERE id = ?4",
        )
        .bind(campaign_id)
        .bind(TITLE)
        .bind(detail)
        .bind(id)
        .execute(&mut *connection)
        .await
        .map_err(storage)?;
        (
            id,
            "error_item_updated",
            format!("Error item updated: {TITLE}"),
        )
    } else {
        let id = sqlx::query(
            "INSERT INTO error_queue_items (
                campaign_id, source_type, source_id, title, detail, severity, status, updated_at
             ) VALUES (?1, 'approval', ?2, ?3, ?4, 'warning', 'open', datetime('now'))",
        )
        .bind(campaign_id)
        .bind(approval_id)
        .bind(TITLE)
        .bind(detail)
        .execute(&mut *connection)
        .await
        .map_err(storage)?
        .last_insert_rowid();
        (
            id,
            "error_item_created",
            format!("Error item created: {TITLE}"),
        )
    };

    insert_safety_audit(
        connection,
        SafetyAuditEvent {
            campaign_id,
            subject_type: "error_queue_item",
            subject_id: Some(error_item_id),
            event_type,
            severity: "warning",
            summary: &summary,
            metadata: json!({ "sourceType": "approval", "sourceId": approval_id }),
        },
        STORAGE_ERROR,
    )
    .await
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

async fn execute_create(
    connection: &mut SqliteConnection,
    input: ValidCreate,
) -> Result<Settlement<i64>, String> {
    let Some(facts) = load_create_facts(connection, input.draft_id).await? else {
        return Ok(Settlement::Rejected("Draft was not found".to_string()));
    };
    let variant_id = match evaluate_create(&facts) {
        Ok(id) => id,
        Err(error) => return Ok(Settlement::Rejected(error.to_string())),
    };
    let id = sqlx::query(
        "INSERT INTO approvals (
            campaign_id, draft_id, draft_variant_id, status, reviewer_notes, updated_at
         ) VALUES (?1, ?2, ?3, 'needs_review', ?4, datetime('now'))",
    )
    .bind(facts.campaign_id)
    .bind(input.draft_id)
    .bind(variant_id)
    .bind(&input.reviewer_notes)
    .execute(&mut *connection)
    .await
    .map_err(storage)?
    .last_insert_rowid();
    Ok(Settlement::Accepted(id))
}

async fn execute_set_status(
    connection: &mut SqliteConnection,
    input: ValidSetStatus,
) -> Result<Settlement<()>, String> {
    let Some(approval) = load_approval(connection, input.id).await? else {
        return Ok(Settlement::Rejected("Approval was not found".to_string()));
    };
    if approval.campaign_status == "archived" {
        return Ok(Settlement::Rejected("Campaign is archived".to_string()));
    }
    let transition = ApprovalStatus::parse(&approval.status)
        .ok_or("Unsupported approval transition")
        .and_then(|current| assert_transition(current, input.status));
    if let Err(error) = transition {
        return Ok(Settlement::Rejected(error.to_string()));
    }

    // Statuses the database only accepts for ready content are checked here
    // first so the operator sees a domain error instead of a storage failure.
    let readiness_revision = match input.status {
        ApprovalStatus::Approved => Some(input.content_revision),
        ApprovalStatus::NeedsReview => Some(approval.reviewed_content_revision),
        _ => None,
    };
    if let Some(revision) = readiness_revision {
        if !is_ready_at_revision(connection, approval.id, revision, STORAGE_ERROR).await? {
            return Ok(Settlement::Rejected(STALE_APPROVAL_ERROR.to_string()));
        }
    }

    let is_approved = input.status == ApprovalStatus::Approved;
    let is_rejected = input.status == ApprovalStatus::Rejected;
    sqlx::query(
        "UPDATE approvals SET
            status = ?1,
            reviewer_notes = COALESCE(?2, reviewer_notes),
            reviewed_content_revision = CASE WHEN ?3 THEN ?4 ELSE reviewed_content_revision END,
            approved_at = CASE WHEN ?3 THEN datetime('now') ELSE approved_at END,
            rejected_at = CASE WHEN ?3 THEN NULL WHEN ?5 THEN datetime('now') ELSE rejected_at END,
            updated_at = datetime('now')
         WHERE id = ?6",
    )
    .bind(input.status.as_str())
    .bind(input.reviewer_notes.as_deref())
    .bind(is_approved)
    .bind(input.content_revision)
    .bind(is_rejected)
    .bind(approval.id)
    .execute(&mut *connection)
    .await
    .map_err(storage)?;

    match input.status {
        ApprovalStatus::ChangesRequested => {
            set_draft_status(connection, approval.draft_id, "needs_revision").await?
        }
        ApprovalStatus::NeedsReview => {
            set_draft_status(connection, approval.draft_id, "ready_for_review").await?
        }
        ApprovalStatus::Rejected => {
            let detail = input
                .reviewer_notes
                .as_deref()
                .filter(|notes| !notes.is_empty())
                .unwrap_or(DEFAULT_REJECTION_DETAIL);
            // Errors from the continuation settlement are already bounded.
            reject_linked_continuations(connection, approval.id, detail).await?;
            insert_safety_audit(
                connection,
                SafetyAuditEvent {
                    campaign_id: approval.campaign_id,
                    subject_type: "approval",
                    subject_id: Some(approval.id),
                    event_type: "approval_rejected",
                    severity: "warning",
                    summary: "Approval rejected",
                    metadata: json!({ "reviewerNotes": detail }),
                },
                STORAGE_ERROR,
            )
            .await?;
            upsert_rejection_error(connection, approval.campaign_id, approval.id, detail).await?;
        }
        _ => {}
    }
    Ok(Settlement::Accepted(()))
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

pub(crate) async fn create_approval(
    pool: &SqlitePool,
    input: CreateApprovalInput,
) -> Result<i64, String> {
    let input = validate_create(input)?;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(execute_create(connection, input))
    })
    .await
}

pub(crate) async fn set_approval_status(
    pool: &SqlitePool,
    input: SetApprovalStatusInput,
) -> Result<(), String> {
    let input = validate_set_status(input)?;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(execute_set_status(connection, input))
    })
    .await
}

#[tauri::command]
pub async fn linkgo_approval_create(
    pool: State<'_, SqlitePool>,
    input: CreateApprovalInput,
) -> Result<i64, String> {
    create_approval(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_approval_set_status(
    pool: State<'_, SqlitePool>,
    input: SetApprovalStatusInput,
) -> Result<(), String> {
    set_approval_status(pool.inner(), input).await
}

#[cfg(test)]
#[path = "approval_review_tests.rs"]
mod tests;
