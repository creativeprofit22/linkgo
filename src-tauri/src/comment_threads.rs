//! Native comment-thread mutations and the LinkedIn comment publish gate.
//!
//! Every command validates input, then re-reads the thread/variant/campaign
//! and writes on one pinned `BEGIN IMMEDIATE` connection. Audit findings are
//! computed natively (`comment_audit`) so the renderer cannot supply them.

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqliteConnection, SqlitePool};
use tauri::State;

use crate::auth::linkedin_api::resolve_linkedin_target_urn;
use crate::auth::publish::escape_linkedin_little_text;
use crate::comment_audit::audit_comment_variant;
use crate::comments::{comment_limit_decision, insert_rate_limit_event, ThreadState};
use crate::db_transaction::{settle, Settlement};

const STORAGE_ERROR: &str = "Could not save comment change";
const MAX_BODY_UTF16: usize = 1250;
const MAX_NOTES_CHARS: usize = 2000;
const TERMINAL: [&str; 3] = ["posted", "rejected", "cancelled"];
const THREAD_STATUSES: [&str; 7] = [
    "drafting",
    "needs_review",
    "changes_requested",
    "approved",
    "rejected",
    "posted",
    "cancelled",
];
const VARIANT_STATUSES: [&str; 3] = ["draft", "selected", "rejected"];

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VariantBodyInput {
    pub body: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateCommentThreadInput {
    pub candidate_id: i64,
    #[serde(default)]
    pub operator_notes: String,
    pub variants: Vec<VariantBodyInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateCommentThreadInput {
    pub id: i64,
    #[serde(default)]
    pub operator_notes: Option<String>,
    #[serde(default)]
    pub reviewer_notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateCommentVariantInput {
    pub id: i64,
    #[serde(default)]
    pub body: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetCommentVariantStatusInput {
    pub id: i64,
    pub status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetCommentThreadStatusInput {
    pub id: i64,
    pub status: String,
    #[serde(default)]
    pub reviewer_notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommentPublishPreflightInput {
    pub comment_thread_id: i64,
    pub commentary: String,
    pub target_urn: String,
    pub idempotency_key: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommentMutationResult {
    pub id: i64,
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

fn notes(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.chars().count() > MAX_NOTES_CHARS {
        return Err(format!(
            "Notes must be at most {MAX_NOTES_CHARS} characters"
        ));
    }
    Ok(trimmed.to_string())
}

fn body(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    let length = trimmed.encode_utf16().count();
    if length == 0 {
        return Err("Comment text is required".to_string());
    }
    if length > MAX_BODY_UTF16 {
        return Err(format!(
            "Comments must be at most {MAX_BODY_UTF16} characters"
        ));
    }
    Ok(trimmed.to_string())
}

async fn insert_audits(
    connection: &mut SqliteConnection,
    variant_id: i64,
    text: &str,
) -> Result<(), String> {
    for finding in audit_comment_variant(text) {
        sqlx::query(
            "INSERT INTO comment_audits (comment_variant_id, rule_key, severity, message)
             VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(variant_id)
        .bind(finding.rule_key)
        .bind(finding.severity)
        .bind(finding.message)
        .execute(&mut *connection)
        .await
        .map_err(storage_error)?;
    }
    Ok(())
}

/// Loads a thread whose campaign is not archived.
async fn mutable_thread(
    connection: &mut SqliteConnection,
    thread_id: i64,
) -> Result<ThreadState, String> {
    let row = sqlx::query(
        "SELECT ct.campaign_id, ct.status, c.status AS campaign_status, c.daily_comment_limit
         FROM comment_threads ct INNER JOIN campaigns c ON c.id = ct.campaign_id
         WHERE ct.id = ?1",
    )
    .bind(thread_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage_error)?
    .ok_or_else(|| "Comment thread was not found".to_string())?;
    if row.get::<String, _>("campaign_status") == "archived" {
        return Err("Campaign is archived".to_string());
    }
    Ok(ThreadState {
        campaign_id: row.get("campaign_id"),
        status: row.get("status"),
        daily_comment_limit: row.get("daily_comment_limit"),
    })
}

async fn thread_for_variant(
    connection: &mut SqliteConnection,
    variant_id: i64,
) -> Result<(i64, ThreadState), String> {
    let thread_id: i64 =
        sqlx::query_scalar("SELECT comment_thread_id FROM comment_variants WHERE id = ?1")
            .bind(variant_id)
            .fetch_optional(&mut *connection)
            .await
            .map_err(storage_error)?
            .ok_or_else(|| "Comment variant was not found".to_string())?;
    Ok((thread_id, mutable_thread(connection, thread_id).await?))
}

/// Returns the single selected, non-blocked variant body.
async fn selected_variant_ready(
    connection: &mut SqliteConnection,
    thread_id: i64,
) -> Result<String, String> {
    let rows = sqlx::query(
        "SELECT cv.body,
                SUM(CASE WHEN ca.severity = 'block' THEN 1 ELSE 0 END) AS blocked_count
         FROM comment_variants cv
         LEFT JOIN comment_audits ca ON ca.comment_variant_id = cv.id
         WHERE cv.comment_thread_id = ?1 AND cv.status = 'selected'
         GROUP BY cv.id ORDER BY cv.id ASC",
    )
    .bind(thread_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(storage_error)?;
    if rows.len() > 1 {
        return Err("Choose exactly one selected comment variant".to_string());
    }
    let row = rows
        .first()
        .ok_or_else(|| "Choose one comment variant before review".to_string())?;
    if row.get::<i64, _>("blocked_count") > 0 {
        return Err("Blocked comment variants cannot be reviewed".to_string());
    }
    Ok(row.get("body"))
}

async fn request_changes_if_reviewing(
    connection: &mut SqliteConnection,
    thread_id: i64,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE comment_threads
         SET status = CASE WHEN status IN ('needs_review', 'approved') THEN 'changes_requested' ELSE status END,
             updated_at = datetime('now')
         WHERE id = ?1",
    )
    .bind(thread_id)
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?;
    Ok(())
}

pub(crate) async fn create_thread(
    pool: &SqlitePool,
    input: CreateCommentThreadInput,
) -> Result<CommentMutationResult, String> {
    positive(input.candidate_id, "Candidate id")?;
    let operator_notes = notes(&input.operator_notes)?;
    if input.variants.is_empty() || input.variants.len() > 3 {
        return Err("Add one to three comment variants".to_string());
    }
    let bodies = input
        .variants
        .iter()
        .map(|v| body(&v.body))
        .collect::<Result<Vec<_>, _>>()?;
    let candidate_id = input.candidate_id;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let row = sqlx::query(
                "SELECT cp.campaign_id, cp.status, c.status AS campaign_status
                 FROM candidate_posts cp INNER JOIN campaigns c ON c.id = cp.campaign_id
                 WHERE cp.id = ?1",
            )
            .bind(candidate_id)
            .fetch_optional(&mut *connection)
            .await
            .map_err(storage_error)?
            .ok_or_else(|| "Candidate was not found".to_string())?;
            if row.get::<String, _>("campaign_status") == "archived" {
                return Err("Campaign is archived".to_string());
            }
            let status: String = row.get("status");
            if status != "shortlisted" && status != "drafted" {
                return Err("Only shortlisted or drafted candidates can become comments".to_string());
            }
            let existing: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM comment_threads WHERE candidate_post_id = ?1",
            )
            .bind(candidate_id)
            .fetch_one(&mut *connection)
            .await
            .map_err(storage_error)?;
            if existing > 0 {
                return Err("Candidate already has a comment thread".to_string());
            }
            let campaign_id: i64 = row.get("campaign_id");
            let thread_id = sqlx::query(
                "INSERT INTO comment_threads (campaign_id, candidate_post_id, operator_notes, updated_at)
                 VALUES (?1, ?2, ?3, datetime('now'))",
            )
            .bind(campaign_id)
            .bind(candidate_id)
            .bind(&operator_notes)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?
            .last_insert_rowid();
            for (index, text) in bodies.iter().enumerate() {
                let variant_id = sqlx::query(
                    "INSERT INTO comment_variants (comment_thread_id, variant_number, body, updated_at)
                     VALUES (?1, ?2, ?3, datetime('now'))",
                )
                .bind(thread_id)
                .bind(index as i64 + 1)
                .bind(text)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?
                .last_insert_rowid();
                insert_audits(connection, variant_id, text).await?;
            }
            Ok(Settlement::Accepted(CommentMutationResult { id: thread_id }))
        })
    })
    .await
}

pub(crate) async fn update_thread(
    pool: &SqlitePool,
    input: UpdateCommentThreadInput,
) -> Result<CommentMutationResult, String> {
    positive(input.id, "Comment thread id")?;
    let operator = input.operator_notes.as_deref().map(notes).transpose()?;
    let reviewer = input.reviewer_notes.as_deref().map(notes).transpose()?;
    let id = input.id;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            mutable_thread(connection, id).await?;
            if operator.is_none() && reviewer.is_none() {
                return Ok(Settlement::Accepted(CommentMutationResult { id }));
            }
            sqlx::query(
                "UPDATE comment_threads
                 SET operator_notes = COALESCE(?1, operator_notes),
                     reviewer_notes = COALESCE(?2, reviewer_notes),
                     updated_at = datetime('now')
                 WHERE id = ?3",
            )
            .bind(&operator)
            .bind(&reviewer)
            .bind(id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            Ok(Settlement::Accepted(CommentMutationResult { id }))
        })
    })
    .await
}

pub(crate) async fn update_variant(
    pool: &SqlitePool,
    input: UpdateCommentVariantInput,
) -> Result<CommentMutationResult, String> {
    positive(input.id, "Comment variant id")?;
    let Some(raw) = input.body.as_deref() else {
        return Ok(CommentMutationResult { id: input.id });
    };
    let text = body(raw)?;
    let id = input.id;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let (thread_id, thread) = thread_for_variant(connection, id).await?;
            if TERMINAL.contains(&thread.status.as_str()) {
                return Err("Posted, rejected, and cancelled comments cannot be edited".to_string());
            }
            sqlx::query(
                "UPDATE comment_variants SET body = ?1, updated_at = datetime('now') WHERE id = ?2",
            )
            .bind(&text)
            .bind(id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            sqlx::query("DELETE FROM comment_audits WHERE comment_variant_id = ?1")
                .bind(id)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
            insert_audits(connection, id, &text).await?;
            request_changes_if_reviewing(connection, thread_id).await?;
            Ok(Settlement::Accepted(CommentMutationResult { id }))
        })
    })
    .await
}

pub(crate) async fn set_variant_status(
    pool: &SqlitePool,
    input: SetCommentVariantStatusInput,
) -> Result<CommentMutationResult, String> {
    positive(input.id, "Comment variant id")?;
    if !VARIANT_STATUSES.contains(&input.status.as_str()) {
        return Err("Unsupported comment variant status".to_string());
    }
    let SetCommentVariantStatusInput { id, status } = input;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let (thread_id, thread) = thread_for_variant(connection, id).await?;
            if TERMINAL.contains(&thread.status.as_str()) {
                return Err(
                    "Posted, rejected, and cancelled comments cannot change variants".to_string(),
                );
            }
            if status == "selected" {
                let blocked: i64 = sqlx::query_scalar(
                    "SELECT COUNT(*) FROM comment_audits WHERE comment_variant_id = ?1 AND severity = 'block'",
                )
                .bind(id)
                .fetch_one(&mut *connection)
                .await
                .map_err(storage_error)?;
                if blocked > 0 {
                    return Err("Blocked comment variants cannot be selected".to_string());
                }
                sqlx::query(
                    "UPDATE comment_variants SET status = 'draft', updated_at = datetime('now')
                     WHERE comment_thread_id = ?1 AND id <> ?2",
                )
                .bind(thread_id)
                .bind(id)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
            }
            sqlx::query(
                "UPDATE comment_variants SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
            )
            .bind(&status)
            .bind(id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            request_changes_if_reviewing(connection, thread_id).await?;
            Ok(Settlement::Accepted(CommentMutationResult { id }))
        })
    })
    .await
}

pub(crate) async fn set_thread_status(
    pool: &SqlitePool,
    input: SetCommentThreadStatusInput,
) -> Result<CommentMutationResult, String> {
    positive(input.id, "Comment thread id")?;
    if !THREAD_STATUSES.contains(&input.status.as_str()) {
        return Err("Unsupported comment thread status".to_string());
    }
    let reviewer = input.reviewer_notes.as_deref().map(notes).transpose()?;
    let SetCommentThreadStatusInput { id, status, .. } = input;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            // Check order mirrors the previous renderer implementation.
            let thread = mutable_thread(connection, id).await?;
            if status == "needs_review" || status == "approved" {
                selected_variant_ready(connection, id).await?;
            }
            if status == "posted" {
                return Err("Use record posted to move comments to posted".to_string());
            }
            if status == "approved" && thread.status != "needs_review" {
                return Err("Only comments needing review can be approved".to_string());
            }
            if status == "changes_requested" && thread.status != "needs_review" {
                return Err("Only comments needing review can request changes".to_string());
            }
            if TERMINAL.contains(&thread.status.as_str()) {
                return Err("Terminal comment threads cannot change status".to_string());
            }
            sqlx::query(
                "UPDATE comment_threads
                 SET status = ?1,
                     reviewer_notes = COALESCE(?2, reviewer_notes),
                     approved_at = CASE WHEN ?1 = 'approved' THEN datetime('now') ELSE approved_at END,
                     rejected_at = CASE WHEN ?1 = 'rejected' THEN datetime('now') ELSE rejected_at END,
                     updated_at = datetime('now')
                 WHERE id = ?3",
            )
            .bind(&status)
            .bind(&reviewer)
            .bind(id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            Ok(Settlement::Accepted(CommentMutationResult { id }))
        })
    })
    .await
}

/// Publish gate: every check is read-only except blocked kill-switch or
/// daily-limit decisions, whose `rate_limit_events` row commits with the
/// rejection so the block is auditable.
pub(crate) async fn assert_can_publish(
    pool: &SqlitePool,
    input: CommentPublishPreflightInput,
) -> Result<(), String> {
    positive(input.comment_thread_id, "Comment thread id")?;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let thread_id = input.comment_thread_id;
            let row = sqlx::query(
                "SELECT ct.status, tp.url, tp.platform_resource_urn
                 FROM comment_threads ct
                 INNER JOIN candidate_posts cp ON cp.id = ct.candidate_post_id
                 INNER JOIN target_posts tp ON tp.id = cp.target_post_id
                 WHERE ct.id = ?1",
            )
            .bind(thread_id)
            .fetch_optional(&mut *connection)
            .await
            .map_err(storage_error)?
            .ok_or_else(|| "Comment thread was not found".to_string())?;
            let thread = mutable_thread(connection, thread_id).await?;
            if thread.status != "approved" {
                return Err("Only approved comments can publish via LinkedIn".to_string());
            }
            let selected = selected_variant_ready(connection, thread_id).await?;
            if escape_linkedin_little_text(&selected) != input.commentary {
                return Err("Commentary does not match the approved comment variant".to_string());
            }
            let resource_urn: String = row.get("platform_resource_urn");
            let url: String = row.get("url");
            let source = if resource_urn.is_empty() { url } else { resource_urn };
            let expected_urn = resolve_linkedin_target_urn(&source).ok_or_else(|| {
                "LinkedIn target URN could not be resolved from the candidate URL".to_string()
            })?;
            if expected_urn != input.target_urn {
                return Err("LinkedIn target URN does not match the comment target".to_string());
            }
            if input.idempotency_key != format!("comment-thread:{thread_id}:linkedin:manual") {
                return Err("Comment idempotency key does not match thread state".to_string());
            }
            let succeeded: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM comment_attempts WHERE comment_thread_id = ?1 AND status = 'succeeded'",
            )
            .bind(thread_id)
            .fetch_one(&mut *connection)
            .await
            .map_err(storage_error)?;
            if succeeded > 0 {
                return Err("Comment thread already has a successful posting attempt".to_string());
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
            let decision = comment_limit_decision(connection, &thread).await?;
            if settings.get::<i64, _>("global_kill_switch") == 1 {
                let reason: String = settings.get("kill_switch_reason");
                let (summary, error) = if reason.is_empty() {
                    (
                        "Comment posting blocked by global kill switch".to_string(),
                        "Global kill switch is enabled".to_string(),
                    )
                } else {
                    (
                        format!("Comment posting blocked by global kill switch: {reason}"),
                        format!("Global kill switch is enabled: {reason}"),
                    )
                };
                insert_rate_limit_event(connection, &thread, &decision, "blocked", &summary)
                    .await?;
                return Ok(Settlement::Rejected(error));
            }
            if !decision.allowed {
                insert_rate_limit_event(connection, &thread, &decision, "blocked", &decision.summary)
                    .await?;
                return Ok(Settlement::Rejected(decision.summary));
            }
            Ok(Settlement::Accepted(()))
        })
    })
    .await
}

#[tauri::command]
pub async fn linkgo_comment_thread_create(
    pool: State<'_, SqlitePool>,
    input: CreateCommentThreadInput,
) -> Result<CommentMutationResult, String> {
    create_thread(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_comment_thread_update(
    pool: State<'_, SqlitePool>,
    input: UpdateCommentThreadInput,
) -> Result<CommentMutationResult, String> {
    update_thread(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_comment_variant_update(
    pool: State<'_, SqlitePool>,
    input: UpdateCommentVariantInput,
) -> Result<CommentMutationResult, String> {
    update_variant(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_comment_variant_set_status(
    pool: State<'_, SqlitePool>,
    input: SetCommentVariantStatusInput,
) -> Result<CommentMutationResult, String> {
    set_variant_status(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_comment_thread_set_status(
    pool: State<'_, SqlitePool>,
    input: SetCommentThreadStatusInput,
) -> Result<CommentMutationResult, String> {
    set_thread_status(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_comment_assert_can_publish(
    pool: State<'_, SqlitePool>,
    input: CommentPublishPreflightInput,
) -> Result<(), String> {
    assert_can_publish(pool.inner(), input).await
}

#[cfg(test)]
#[path = "comment_threads_tests.rs"]
mod tests;
