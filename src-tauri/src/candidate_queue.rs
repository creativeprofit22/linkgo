//! Native candidate-queue mutations: manual candidate creation, deletion and
//! discovery-item promotion.
//!
//! `insert_candidate` is connection-level so other native slices (source
//! imports) can reuse it inside their own pinned transaction.
//!
//! Dedupe keys are computed natively: the normalized URL (WHATWG port in
//! `js_url`), the content hash and the target URN all match the values the
//! renderer used to write, so existing dedupe rows keep matching.

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqliteConnection, SqlitePool};
use tauri::State;

use crate::auth::linkedin_api::resolve_linkedin_target_urn;
use crate::db_transaction::{settle, Settlement};
use crate::draft_generation_links::settle_linked_draft_requests_for_candidate_deletion;
use crate::js_text::{js_collapse_whitespace, js_trim, utf16_len};
use crate::js_url::normalize_candidate_url;

const STORAGE_ERROR: &str = "Could not save candidate change";
pub(crate) const DUPLICATE_CANDIDATE_MESSAGE: &str = "Candidate already exists for this campaign";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateCandidateInput {
    pub campaign_id: i64,
    pub url: String,
    pub content: String,
    #[serde(default)]
    pub author_name: String,
    #[serde(default)]
    pub author_profile_url: String,
    #[serde(default)]
    pub posted_at: Option<String>,
    #[serde(default)]
    pub platform_resource_urn: String,
    #[serde(default)]
    pub source_keyword: String,
    #[serde(default)]
    pub relevance_score: Option<i64>,
    #[serde(default)]
    pub score_reason: String,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeleteCandidateInput {
    pub id: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PromoteDiscoveryItemInput {
    pub id: i64,
    pub campaign_id: i64,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CandidateMutationResult {
    pub id: i64,
}

fn storage_error(_: sqlx::Error) -> String {
    STORAGE_ERROR.to_string()
}

/// Port of the renderer `createContentHash`: FNV-1a over the UTF-16 code
/// units of the whitespace-collapsed content, as 8 lowercase hex digits.
pub(crate) fn content_hash(content: &str) -> String {
    let normalized = js_collapse_whitespace(content);
    let mut hash: u32 = 0x811c_9dc5;
    for unit in normalized.encode_utf16() {
        hash ^= u32::from(unit);
        hash = hash.wrapping_mul(0x0100_0193);
    }
    format!("{hash:08x}")
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

/// Validated, trimmed candidate ready to insert.
pub(crate) struct CandidateInsert {
    pub campaign_id: i64,
    pub url: String,
    pub normalized_url: String,
    pub content: String,
    pub content_hash: String,
    pub author_name: String,
    pub author_profile_url: String,
    pub posted_at: Option<String>,
    pub platform_resource_urn: String,
    pub source_keyword: String,
    pub relevance_score: Option<i64>,
    pub score_reason: String,
    pub notes: String,
}

pub(crate) fn validate_candidate(input: &CreateCandidateInput) -> Result<CandidateInsert, String> {
    if input.campaign_id <= 0 {
        return Err("Campaign id must be a positive integer".to_string());
    }
    let url = bounded(&input.url, 1000, "LinkedIn post URL", true)?;
    let normalized_url = normalize_candidate_url(&url);
    let content = bounded(&input.content, 3000, "Post text", true)?;
    let author_name = bounded(&input.author_name, 160, "Author name", false)?;
    let author_profile_url = bounded(&input.author_profile_url, 1000, "Author profile URL", false)?;
    let posted_at = input
        .posted_at
        .as_deref()
        .map(|value| bounded(value, 80, "Posted time", false))
        .transpose()?;
    let explicit_urn = bounded(
        &input.platform_resource_urn,
        500,
        "Platform resource URN",
        false,
    )?;
    let source_keyword = bounded(&input.source_keyword, 80, "Source keyword", false)?;
    if let Some(score) = input.relevance_score {
        if !(0..=100).contains(&score) {
            return Err("Relevance score must be between 0 and 100".to_string());
        }
    }
    let score_reason = bounded(&input.score_reason, 500, "Score reason", false)?;
    let notes = bounded(&input.notes, 1000, "Notes", false)?;
    let platform_resource_urn = if explicit_urn.is_empty() {
        resolve_linkedin_target_urn(&url).unwrap_or_default()
    } else {
        explicit_urn
    };
    Ok(CandidateInsert {
        campaign_id: input.campaign_id,
        content_hash: content_hash(&content),
        url,
        normalized_url,
        content,
        author_name,
        author_profile_url,
        posted_at,
        platform_resource_urn,
        source_keyword,
        relevance_score: input.relevance_score,
        score_reason,
        notes,
    })
}

pub(crate) const CAMPAIGN_ARCHIVED_ERROR: &str = "Campaign is archived";

/// Whether a campaign status blocks new work (shared with the Bright Data gates).
pub(crate) fn campaign_status_is_archived(status: &str) -> bool {
    status == "archived"
}

/// Rejects a missing or archived campaign.
pub(crate) async fn assert_campaign_can_mutate(
    connection: &mut SqliteConnection,
    campaign_id: i64,
) -> Result<(), String> {
    let status: Option<String> = sqlx::query_scalar("SELECT status FROM campaigns WHERE id = ?1")
        .bind(campaign_id)
        .fetch_optional(&mut *connection)
        .await
        .map_err(storage_error)?;
    match status.as_deref() {
        None => Err("Campaign was not found".to_string()),
        Some(status) if campaign_status_is_archived(status) => {
            Err(CAMPAIGN_ARCHIVED_ERROR.to_string())
        }
        Some(_) => Ok(()),
    }
}

fn duplicate_or_storage(error: sqlx::Error) -> String {
    let unique = error
        .as_database_error()
        .is_some_and(|db| db.is_unique_violation());
    if unique {
        DUPLICATE_CANDIDATE_MESSAGE.to_string()
    } else {
        STORAGE_ERROR.to_string()
    }
}

/// Inserts (or reuses) the target post, the candidate and its two dedupe keys.
/// Caller owns the transaction and has already checked campaign mutability.
pub(crate) async fn insert_candidate(
    connection: &mut SqliteConnection,
    candidate: &CandidateInsert,
) -> Result<i64, String> {
    let duplicate: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM dedupe_keys
         WHERE campaign_id = ?1
           AND ((key_type = 'normalized_url' AND key_value = ?2)
             OR (key_type = 'content_hash' AND key_value = ?3))
         LIMIT 1",
    )
    .bind(candidate.campaign_id)
    .bind(&candidate.normalized_url)
    .bind(&candidate.content_hash)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage_error)?;
    if duplicate.is_some() {
        return Err(DUPLICATE_CANDIDATE_MESSAGE.to_string());
    }

    let existing_target: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM target_posts
         WHERE platform = 'linkedin' AND (normalized_url = ?1 OR content_hash = ?2)
         ORDER BY normalized_url = ?1 DESC, id ASC
         LIMIT 1",
    )
    .bind(&candidate.normalized_url)
    .bind(&candidate.content_hash)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage_error)?;
    let target_post_id = match existing_target {
        Some(id) => id,
        None => sqlx::query(
            "INSERT INTO target_posts (
                platform, url, normalized_url, author_name, author_profile_url,
                platform_resource_urn, posted_at, content, content_hash, updated_at
             ) VALUES ('linkedin', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))",
        )
        .bind(&candidate.url)
        .bind(&candidate.normalized_url)
        .bind(&candidate.author_name)
        .bind(&candidate.author_profile_url)
        .bind(&candidate.platform_resource_urn)
        .bind(&candidate.posted_at)
        .bind(&candidate.content)
        .bind(&candidate.content_hash)
        .execute(&mut *connection)
        .await
        .map_err(storage_error)?
        .last_insert_rowid(),
    };

    let candidate_id = sqlx::query(
        "INSERT INTO candidate_posts (
            campaign_id, target_post_id, source_keyword, relevance_score, score_reason, notes, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
    )
    .bind(candidate.campaign_id)
    .bind(target_post_id)
    .bind(&candidate.source_keyword)
    .bind(candidate.relevance_score)
    .bind(&candidate.score_reason)
    .bind(&candidate.notes)
    .execute(&mut *connection)
    .await
    .map_err(duplicate_or_storage)?
    .last_insert_rowid();

    for (key_type, key_value) in [
        ("normalized_url", &candidate.normalized_url),
        ("content_hash", &candidate.content_hash),
    ] {
        sqlx::query(
            "INSERT INTO dedupe_keys (campaign_id, key_type, key_value, candidate_post_id)
             VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(candidate.campaign_id)
        .bind(key_type)
        .bind(key_value)
        .bind(candidate_id)
        .execute(&mut *connection)
        .await
        .map_err(duplicate_or_storage)?;
    }
    Ok(candidate_id)
}

pub(crate) async fn create_candidate(
    pool: &SqlitePool,
    input: CreateCandidateInput,
) -> Result<CandidateMutationResult, String> {
    let candidate = validate_candidate(&input)?;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            assert_campaign_can_mutate(connection, candidate.campaign_id).await?;
            let id = insert_candidate(connection, &candidate).await?;
            Ok(Settlement::Accepted(CandidateMutationResult { id }))
        })
    })
    .await
}

pub(crate) async fn delete_candidate(
    pool: &SqlitePool,
    input: DeleteCandidateInput,
) -> Result<CandidateMutationResult, String> {
    if input.id <= 0 {
        return Err("Candidate id must be a positive integer".to_string());
    }
    let id = input.id;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            settle_linked_draft_requests_for_candidate_deletion(connection, id, STORAGE_ERROR)
                .await?;
            sqlx::query("DELETE FROM dedupe_keys WHERE candidate_post_id = ?1")
                .bind(id)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
            let deleted = sqlx::query("DELETE FROM candidate_posts WHERE id = ?1")
                .bind(id)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
            if deleted.rows_affected() != 1 {
                return Err("Candidate was not found".to_string());
            }
            Ok(Settlement::Accepted(CandidateMutationResult { id }))
        })
    })
    .await
}

pub(crate) async fn promote_discovery_item(
    pool: &SqlitePool,
    input: PromoteDiscoveryItemInput,
) -> Result<CandidateMutationResult, String> {
    if input.id <= 0 || input.campaign_id <= 0 {
        return Err(
            "Discovery suggestion id and campaign id must be positive integers".to_string(),
        );
    }
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            assert_campaign_can_mutate(connection, input.campaign_id).await?;
            let item = sqlx::query(
                "SELECT kind, keyword FROM candidate_discovery_items
                 WHERE id = ?1 AND campaign_id = ?2 LIMIT 1",
            )
            .bind(input.id)
            .bind(input.campaign_id)
            .fetch_optional(&mut *connection)
            .await
            .map_err(storage_error)?
            .ok_or_else(|| "Discovery suggestion was not found".to_string())?;
            let kind: String = item.get("kind");
            let keyword_raw: String = item.get("keyword");
            let keyword = if kind == "keyword" {
                js_trim(&keyword_raw)
            } else {
                ""
            };
            if !keyword.is_empty() {
                sqlx::query(
                    "INSERT OR IGNORE INTO campaign_keywords (campaign_id, keyword, source)
                     VALUES (?1, ?2, 'generated')",
                )
                .bind(input.campaign_id)
                .bind(keyword)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
            }
            let updated = sqlx::query(
                "UPDATE candidate_discovery_items
                 SET status = 'promoted', updated_at = datetime('now')
                 WHERE id = ?1 AND campaign_id = ?2",
            )
            .bind(input.id)
            .bind(input.campaign_id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            if updated.rows_affected() != 1 {
                return Err("Discovery suggestion was not found".to_string());
            }
            Ok(Settlement::Accepted(CandidateMutationResult {
                id: input.id,
            }))
        })
    })
    .await
}

#[tauri::command]
pub async fn linkgo_candidate_create(
    pool: State<'_, SqlitePool>,
    input: CreateCandidateInput,
) -> Result<CandidateMutationResult, String> {
    create_candidate(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_candidate_delete(
    pool: State<'_, SqlitePool>,
    input: DeleteCandidateInput,
) -> Result<CandidateMutationResult, String> {
    delete_candidate(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_candidate_promote_discovery_item(
    pool: State<'_, SqlitePool>,
    input: PromoteDiscoveryItemInput,
) -> Result<CandidateMutationResult, String> {
    promote_discovery_item(pool.inner(), input).await
}

#[cfg(test)]
#[path = "candidate_queue_tests.rs"]
mod tests;
