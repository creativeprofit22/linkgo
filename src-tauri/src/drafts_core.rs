//! Native manual draft mutations (port of `createDraft`,
//! `updateDraftVariant` and `setDraftVariantStatus` in
//! `src/features/drafts/data.ts`).
//!
//! Each command validates its input, re-reads the candidate/variant and
//! writes on one pinned `BEGIN IMMEDIATE` connection. Deterministic audit
//! findings are computed natively (`deterministic_draft_findings`), so the
//! renderer cannot supply its own. `insert_draft` is connection-level so the
//! generated-draft save path can reuse it inside its own transaction.

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqliteConnection, SqlitePool};
use tauri::State;

use crate::db_transaction::{settle, Settlement};
use crate::draft_quality::deterministic_draft_findings;
use crate::js_text::{js_trim, utf16_len};

const STORAGE_ERROR: &str = "Could not save draft change";
const CONTENT_INTENTS: [&str; 4] = ["event", "launch", "idea", "community"];
const VARIANT_STATUSES: [&str; 3] = ["draft", "selected", "rejected"];

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DraftVariantInput {
    #[serde(default)]
    pub hook: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub cta: String,
    #[serde(default)]
    pub hashtags: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateDraftInput {
    pub candidate_id: i64,
    #[serde(default)]
    pub angle: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default = "default_content_intent")]
    pub content_intent: String,
    pub variants: Vec<DraftVariantInput>,
}

fn default_content_intent() -> String {
    "idea".to_string()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateDraftVariantInput {
    pub id: i64,
    #[serde(default)]
    pub hook: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub cta: Option<String>,
    #[serde(default)]
    pub hashtags: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetDraftVariantStatusInput {
    pub id: i64,
    pub status: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DraftMutationResult {
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

/// Trims like the renderer schema (`z.string().trim().max(n)`) and bounds by
/// UTF-16 length.
fn bounded(value: &str, max: usize, label: &str) -> Result<String, String> {
    let trimmed = js_trim(value);
    if utf16_len(trimmed) > max {
        return Err(format!("{label} must be at most {max} characters"));
    }
    Ok(trimmed.to_string())
}

fn clean_variant(variant: &DraftVariantInput) -> Result<DraftVariantInput, String> {
    Ok(DraftVariantInput {
        hook: bounded(&variant.hook, 500, "Hook")?,
        body: bounded(&variant.body, 3000, "Body")?,
        cta: bounded(&variant.cta, 500, "CTA")?,
        hashtags: bounded(&variant.hashtags, 300, "Hashtags")?,
    })
}

/// Replaces a variant's deterministic audit with freshly computed findings.
/// `content_revision` is bound by the `draft_audits_bind_revision` trigger.
pub(crate) async fn write_deterministic_audit(
    connection: &mut SqliteConnection,
    variant_id: i64,
    variant: &DraftVariantInput,
) -> Result<(), String> {
    sqlx::query("DELETE FROM draft_audits WHERE draft_variant_id = ?1")
        .bind(variant_id)
        .execute(&mut *connection)
        .await
        .map_err(storage_error)?;
    for (rule_key, severity, message) in deterministic_draft_findings(
        &variant.hook,
        &variant.body,
        &variant.cta,
        &variant.hashtags,
    ) {
        sqlx::query(
            "INSERT INTO draft_audits (draft_variant_id, rule_key, severity, message)
             VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(variant_id)
        .bind(rule_key)
        .bind(severity)
        .bind(message)
        .execute(&mut *connection)
        .await
        .map_err(storage_error)?;
    }
    Ok(())
}

async fn assert_campaign_mutable(
    connection: &mut SqliteConnection,
    campaign_id: i64,
) -> Result<(), String> {
    let status: Option<String> =
        sqlx::query_scalar("SELECT status FROM campaigns WHERE id = ?1 LIMIT 1")
            .bind(campaign_id)
            .fetch_optional(&mut *connection)
            .await
            .map_err(storage_error)?;
    match status.as_deref() {
        None => Err("Campaign was not found".to_string()),
        Some("archived") => Err("Campaign is archived".to_string()),
        Some(_) => Ok(()),
    }
}

/// Port of `getEligibleDraftCandidate`; returns the candidate's campaign.
pub(crate) async fn eligible_draft_candidate(
    connection: &mut SqliteConnection,
    candidate_id: i64,
    campaign_id: Option<i64>,
) -> Result<i64, String> {
    let row = sqlx::query(
        "SELECT cp.campaign_id, cp.status AS candidate_status
         FROM candidate_posts cp
         INNER JOIN campaigns c ON c.id = cp.campaign_id
         INNER JOIN target_posts tp ON tp.id = cp.target_post_id
         WHERE cp.id = ?1 LIMIT 1",
    )
    .bind(candidate_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage_error)?
    .ok_or_else(|| "Candidate was not found".to_string())?;
    let candidate_campaign: i64 = row.get("campaign_id");
    if campaign_id.is_some_and(|expected| expected != candidate_campaign) {
        return Err("Candidate belongs to a different campaign".to_string());
    }
    assert_campaign_mutable(connection, candidate_campaign).await?;
    match row.get::<String, _>("candidate_status").as_str() {
        "rejected" => Err("Rejected candidates cannot be drafted".to_string()),
        "drafted" => Err("Candidate already has a draft".to_string()),
        _ => Ok(candidate_campaign),
    }
}

pub(crate) struct DraftInsert<'a> {
    pub campaign_id: i64,
    pub candidate_id: i64,
    pub angle: &'a str,
    pub notes: &'a str,
    pub content_intent: &'a str,
    pub variants: &'a [DraftVariantInput],
}

/// Port of `insertDraftInTransaction`: draft, variants with deterministic
/// audits, and the candidate moved to `drafted`. Caller owns the transaction.
pub(crate) async fn insert_draft(
    connection: &mut SqliteConnection,
    draft: &DraftInsert<'_>,
) -> Result<i64, String> {
    let draft_id = sqlx::query(
        "INSERT INTO drafts (campaign_id, candidate_post_id, angle, notes, content_intent, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
    )
    .bind(draft.campaign_id)
    .bind(draft.candidate_id)
    .bind(draft.angle)
    .bind(draft.notes)
    .bind(draft.content_intent)
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?
    .last_insert_rowid();
    for (index, variant) in draft.variants.iter().enumerate() {
        let variant_number = i64::try_from(index + 1).map_err(|_| STORAGE_ERROR.to_string())?;
        let variant_id = sqlx::query(
            "INSERT INTO draft_variants (draft_id, variant_number, hook, body, cta, hashtags, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
        )
        .bind(draft_id)
        .bind(variant_number)
        .bind(&variant.hook)
        .bind(&variant.body)
        .bind(&variant.cta)
        .bind(&variant.hashtags)
        .execute(&mut *connection)
        .await
        .map_err(storage_error)?
        .last_insert_rowid();
        write_deterministic_audit(connection, variant_id, variant).await?;
    }
    let moved = sqlx::query(
        "UPDATE candidate_posts SET status = 'drafted', updated_at = datetime('now')
         WHERE id = ?1 AND campaign_id = ?2 AND status IN ('new', 'shortlisted')",
    )
    .bind(draft.candidate_id)
    .bind(draft.campaign_id)
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?;
    if moved.rows_affected() != 1 {
        return Err("Candidate is no longer eligible for drafting".to_string());
    }
    Ok(draft_id)
}

pub(crate) async fn create_draft(
    pool: &SqlitePool,
    input: CreateDraftInput,
) -> Result<DraftMutationResult, String> {
    positive(input.candidate_id, "Candidate id")?;
    let angle = bounded(&input.angle, 240, "Angle")?;
    let notes = bounded(&input.notes, 1000, "Notes")?;
    if !CONTENT_INTENTS.contains(&input.content_intent.as_str()) {
        return Err("Unsupported content intent".to_string());
    }
    if input.variants.is_empty() || input.variants.len() > 5 {
        return Err("Add one to five draft variants".to_string());
    }
    let variants = input
        .variants
        .iter()
        .map(clean_variant)
        .collect::<Result<Vec<_>, _>>()?;
    let candidate_id = input.candidate_id;
    let content_intent = input.content_intent;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let campaign_id = eligible_draft_candidate(connection, candidate_id, None).await?;
            let id = insert_draft(
                connection,
                &DraftInsert {
                    campaign_id,
                    candidate_id,
                    angle: &angle,
                    notes: &notes,
                    content_intent: &content_intent,
                    variants: &variants,
                },
            )
            .await?;
            Ok(Settlement::Accepted(DraftMutationResult { id }))
        })
    })
    .await
}

pub(crate) async fn update_variant(
    pool: &SqlitePool,
    input: UpdateDraftVariantInput,
) -> Result<DraftMutationResult, String> {
    positive(input.id, "Draft variant id")?;
    let clean = |value: &Option<String>, max: usize, label: &str| {
        value.as_deref().map(|v| bounded(v, max, label)).transpose()
    };
    let hook = clean(&input.hook, 500, "Hook")?;
    let body = clean(&input.body, 3000, "Body")?;
    let cta = clean(&input.cta, 500, "CTA")?;
    let hashtags = clean(&input.hashtags, 300, "Hashtags")?;
    let id = input.id;
    // No content fields: nothing to do (the renderer never touched storage).
    if hook.is_none() && body.is_none() && cta.is_none() && hashtags.is_none() {
        return Ok(DraftMutationResult { id });
    }
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let row = sqlx::query(
                "SELECT draft_id, hook, body, cta, hashtags FROM draft_variants WHERE id = ?1 LIMIT 1",
            )
            .bind(id)
            .fetch_optional(&mut *connection)
            .await
            .map_err(storage_error)?
            .ok_or_else(|| "Draft variant was not found".to_string())?;
            let current = DraftVariantInput {
                hook: row.get("hook"),
                body: row.get("body"),
                cta: row.get("cta"),
                hashtags: row.get("hashtags"),
            };
            let next = DraftVariantInput {
                hook: hook.unwrap_or_else(|| current.hook.clone()),
                body: body.unwrap_or_else(|| current.body.clone()),
                cta: cta.unwrap_or_else(|| current.cta.clone()),
                hashtags: hashtags.unwrap_or_else(|| current.hashtags.clone()),
            };
            let unchanged = next.hook == current.hook
                && next.body == current.body
                && next.cta == current.cta
                && next.hashtags == current.hashtags;
            if unchanged {
                return Ok(Settlement::Accepted(DraftMutationResult { id }));
            }
            // The content-revision trigger bumps the revision for changed fields.
            sqlx::query(
                "UPDATE draft_variants
                 SET hook = ?1, body = ?2, cta = ?3, hashtags = ?4, updated_at = datetime('now')
                 WHERE id = ?5",
            )
            .bind(&next.hook)
            .bind(&next.body)
            .bind(&next.cta)
            .bind(&next.hashtags)
            .bind(id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            write_deterministic_audit(connection, id, &next).await?;
            let draft_id: i64 = row.get("draft_id");
            sqlx::query("UPDATE drafts SET updated_at = datetime('now') WHERE id = ?1")
                .bind(draft_id)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
            Ok(Settlement::Accepted(DraftMutationResult { id }))
        })
    })
    .await
}

pub(crate) async fn set_variant_status(
    pool: &SqlitePool,
    input: SetDraftVariantStatusInput,
) -> Result<DraftMutationResult, String> {
    positive(input.id, "Draft variant id")?;
    if !VARIANT_STATUSES.contains(&input.status.as_str()) {
        return Err("Unsupported draft variant status".to_string());
    }
    let id = input.id;
    let status = input.status;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let draft_id: i64 =
                sqlx::query_scalar("SELECT draft_id FROM draft_variants WHERE id = ?1 LIMIT 1")
                    .bind(id)
                    .fetch_optional(&mut *connection)
                    .await
                    .map_err(storage_error)?
                    .ok_or_else(|| "Draft variant was not found".to_string())?;
            if status == "selected" {
                let blocked: i64 = sqlx::query_scalar(
                    "SELECT COUNT(*) FROM draft_audits WHERE draft_variant_id = ?1 AND severity = 'block'",
                )
                .bind(id)
                .fetch_one(&mut *connection)
                .await
                .map_err(storage_error)?;
                if blocked > 0 {
                    return Err("Blocked variants cannot be selected".to_string());
                }
                sqlx::query(
                    "UPDATE draft_variants SET status = 'draft', updated_at = datetime('now')
                     WHERE draft_id = ?1 AND id <> ?2",
                )
                .bind(draft_id)
                .bind(id)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
                sqlx::query(
                    "UPDATE draft_variants SET status = 'selected', updated_at = datetime('now') WHERE id = ?1",
                )
                .bind(id)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
                sqlx::query(
                    "UPDATE drafts SET status = 'ready_for_review', updated_at = datetime('now') WHERE id = ?1",
                )
                .bind(draft_id)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
            } else {
                sqlx::query(
                    "UPDATE draft_variants SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
                )
                .bind(&status)
                .bind(id)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
                if status == "draft" {
                    let selected: i64 = sqlx::query_scalar(
                        "SELECT COUNT(*) FROM draft_variants WHERE draft_id = ?1 AND status = 'selected'",
                    )
                    .bind(draft_id)
                    .fetch_one(&mut *connection)
                    .await
                    .map_err(storage_error)?;
                    if selected == 0 {
                        sqlx::query(
                            "UPDATE drafts SET status = 'needs_revision', updated_at = datetime('now') WHERE id = ?1",
                        )
                        .bind(draft_id)
                        .execute(&mut *connection)
                        .await
                        .map_err(storage_error)?;
                    }
                }
            }
            Ok(Settlement::Accepted(DraftMutationResult { id }))
        })
    })
    .await
}

#[tauri::command]
pub async fn linkgo_draft_create(
    pool: State<'_, SqlitePool>,
    input: CreateDraftInput,
) -> Result<DraftMutationResult, String> {
    create_draft(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_draft_variant_update(
    pool: State<'_, SqlitePool>,
    input: UpdateDraftVariantInput,
) -> Result<DraftMutationResult, String> {
    update_variant(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_draft_variant_set_status(
    pool: State<'_, SqlitePool>,
    input: SetDraftVariantStatusInput,
) -> Result<DraftMutationResult, String> {
    set_variant_status(pool.inner(), input).await
}

#[cfg(test)]
#[path = "drafts_core_tests.rs"]
mod tests;
