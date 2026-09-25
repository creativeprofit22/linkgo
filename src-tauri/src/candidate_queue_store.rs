//! Native candidate-queue reads and the remaining single-row writes: the
//! candidate and discovery lists, candidate field updates, discovery dismissal,
//! agent-run preparation context and the `research_posts` discovery insert.
//!
//! Every list is capped so the renderer never receives an unbounded read.
//! The candidate list also returns its uncapped `totalCount`.
//! Provider calls never run here: the renderer asks for context, closes the
//! transaction, then starts the agent run.

use serde::{Deserialize, Deserializer, Serialize};
use sqlx::{sqlite::SqliteRow, Row, SqliteConnection, SqlitePool};
use tauri::State;

use crate::candidate_queue::assert_campaign_can_mutate;
use crate::db_transaction::{settle, Settlement};
use crate::js_text::{js_collapse_whitespace, js_trim, utf16_len, utf16_prefix};

const STORAGE_ERROR: &str = "Could not save candidate change";
const READ_ERROR: &str = "Could not load candidates";
pub(crate) const CANDIDATE_LIST_LIMIT: i64 = 500;
pub(crate) const DISCOVERY_LIST_LIMIT: i64 = 200;
const SEED_KEYWORD_LIMIT: i64 = 12;
const SCORING_CANDIDATE_LIMIT: i64 = 50;
const MAX_SUGGESTIONS: usize = 25;
const CANDIDATE_STATUSES: [&str; 4] = ["new", "shortlisted", "rejected", "drafted"];
const DISCOVERY_KINDS: [&str; 3] = ["keyword", "trend", "source_prompt"];

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

/// Distinguishes an absent field (`None`) from an explicit `null`
/// (`Some(None)`), matching the renderer's `relevanceScore?: number | null`.
fn explicit_nullable<'de, D>(deserializer: D) -> Result<Option<Option<i64>>, D::Error>
where
    D: Deserializer<'de>,
{
    Option::<i64>::deserialize(deserializer).map(Some)
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListCandidatesInput {
    #[serde(default)]
    pub campaign_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CampaignScopedInput {
    pub campaign_id: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateCandidateInput {
    pub id: i64,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default, deserialize_with = "explicit_nullable")]
    pub relevance_score: Option<Option<i64>>,
    #[serde(default)]
    pub score_reason: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DismissDiscoveryItemInput {
    pub id: i64,
    pub campaign_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiscoverySuggestionInput {
    pub kind: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub keyword: String,
    #[serde(default)]
    pub rationale: String,
    #[serde(default)]
    pub source_keyword: String,
    #[serde(default)]
    pub confidence_score: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InsertDiscoveryItemsInput {
    pub campaign_id: i64,
    pub agent_run_id: i64,
    #[serde(default)]
    pub workflow_run_id: Option<i64>,
    pub suggestions: Vec<DiscoverySuggestionInput>,
}

/// Flat candidate + target row; mirrors the renderer `CandidateWithTargetRow`.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct CandidateWithTargetRow {
    pub id: i64,
    pub campaign_id: i64,
    pub target_post_id: i64,
    pub source_keyword: String,
    pub status: String,
    pub relevance_score: Option<i64>,
    pub score_reason: String,
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
    pub campaign_name: String,
    pub target_id: i64,
    pub target_platform: String,
    pub target_url: String,
    pub target_normalized_url: String,
    pub target_platform_resource_urn: String,
    pub target_author_name: String,
    pub target_author_profile_url: String,
    pub target_posted_at: Option<String>,
    pub target_content: String,
    pub target_content_hash: String,
    pub target_created_at: String,
    pub target_updated_at: String,
}

/// Mirrors the renderer `CandidateDiscoveryItemRow`.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct DiscoveryItemRow {
    pub id: i64,
    pub campaign_id: i64,
    pub agent_run_id: Option<i64>,
    pub workflow_run_id: Option<i64>,
    pub kind: String,
    pub title: String,
    pub keyword: String,
    pub rationale: String,
    pub source_keyword: String,
    pub confidence_score: Option<i64>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

/// A capped candidate list plus the uncapped count for the same filter, so
/// the renderer can tell when `rows` was truncated.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CandidateListPage {
    pub rows: Vec<CandidateWithTargetRow>,
    pub total_count: i64,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CandidateAgentRunContext {
    pub seed_keywords: Vec<String>,
    pub scoring_candidate_ids: Vec<i64>,
}

fn candidate_row(row: &SqliteRow) -> CandidateWithTargetRow {
    CandidateWithTargetRow {
        id: row.get("id"),
        campaign_id: row.get("campaign_id"),
        target_post_id: row.get("target_post_id"),
        source_keyword: row.get("source_keyword"),
        status: row.get("status"),
        relevance_score: row.get("relevance_score"),
        score_reason: row.get("score_reason"),
        notes: row.get("notes"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        campaign_name: row.get("campaign_name"),
        target_id: row.get("target_id"),
        target_platform: row.get("target_platform"),
        target_url: row.get("target_url"),
        target_normalized_url: row.get("target_normalized_url"),
        target_platform_resource_urn: row.get("target_platform_resource_urn"),
        target_author_name: row.get("target_author_name"),
        target_author_profile_url: row.get("target_author_profile_url"),
        target_posted_at: row.get("target_posted_at"),
        target_content: row.get("target_content"),
        target_content_hash: row.get("target_content_hash"),
        target_created_at: row.get("target_created_at"),
        target_updated_at: row.get("target_updated_at"),
    }
}

fn discovery_row(row: &SqliteRow) -> DiscoveryItemRow {
    DiscoveryItemRow {
        id: row.get("id"),
        campaign_id: row.get("campaign_id"),
        agent_run_id: row.get("agent_run_id"),
        workflow_run_id: row.get("workflow_run_id"),
        kind: row.get("kind"),
        title: row.get("title"),
        keyword: row.get("keyword"),
        rationale: row.get("rationale"),
        source_keyword: row.get("source_keyword"),
        confidence_score: row.get("confidence_score"),
        status: row.get("status"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

const DISCOVERY_COLUMNS: &str = "id, campaign_id, agent_run_id, workflow_run_id, kind, title,
    keyword, rationale, source_keyword, confidence_score, status, created_at, updated_at";

pub(crate) async fn list_candidates(
    pool: &SqlitePool,
    input: ListCandidatesInput,
) -> Result<CandidateListPage, String> {
    if let Some(id) = input.campaign_id {
        positive(id, "Campaign id")?;
    }
    // One transaction so the rows and the count come from the same snapshot.
    let mut tx = pool.begin().await.map_err(read_error)?;
    let rows = sqlx::query(
        "SELECT
           cp.id, cp.campaign_id, cp.target_post_id, cp.source_keyword, cp.status,
           cp.relevance_score, cp.score_reason, cp.notes, cp.created_at, cp.updated_at,
           c.name AS campaign_name,
           tp.id AS target_id, tp.platform AS target_platform, tp.url AS target_url,
           tp.normalized_url AS target_normalized_url,
           tp.platform_resource_urn AS target_platform_resource_urn,
           tp.author_name AS target_author_name,
           tp.author_profile_url AS target_author_profile_url,
           tp.posted_at AS target_posted_at, tp.content AS target_content,
           tp.content_hash AS target_content_hash,
           tp.created_at AS target_created_at, tp.updated_at AS target_updated_at
         FROM candidate_posts cp
         INNER JOIN target_posts tp ON tp.id = cp.target_post_id
         INNER JOIN campaigns c ON c.id = cp.campaign_id
         WHERE (?1 IS NULL OR cp.campaign_id = ?1)
         ORDER BY cp.status = 'rejected', datetime(cp.updated_at) DESC, cp.id DESC
         LIMIT ?2",
    )
    .bind(input.campaign_id)
    .bind(CANDIDATE_LIST_LIMIT)
    .fetch_all(&mut *tx)
    .await
    .map_err(read_error)?;
    let total_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)
         FROM candidate_posts cp
         INNER JOIN target_posts tp ON tp.id = cp.target_post_id
         INNER JOIN campaigns c ON c.id = cp.campaign_id
         WHERE (?1 IS NULL OR cp.campaign_id = ?1)",
    )
    .bind(input.campaign_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(read_error)?;
    tx.commit().await.map_err(read_error)?;
    Ok(CandidateListPage {
        rows: rows.iter().map(candidate_row).collect(),
        total_count,
    })
}

pub(crate) async fn list_discovery_items(
    pool: &SqlitePool,
    input: CampaignScopedInput,
) -> Result<Vec<DiscoveryItemRow>, String> {
    positive(input.campaign_id, "Campaign id")?;
    let sql = format!(
        "SELECT {DISCOVERY_COLUMNS} FROM candidate_discovery_items
         WHERE campaign_id = ?1 AND status != 'dismissed'
         ORDER BY status = 'promoted', confidence_score DESC, datetime(updated_at) DESC, id DESC
         LIMIT ?2"
    );
    let rows = sqlx::query(&sql)
        .bind(input.campaign_id)
        .bind(DISCOVERY_LIST_LIMIT)
        .fetch_all(pool)
        .await
        .map_err(read_error)?;
    Ok(rows.iter().map(discovery_row).collect())
}

/// Checks the campaign can mutate and returns the seed keywords and default
/// scoring candidates, all from one transaction. The agent run starts after.
pub(crate) async fn agent_run_context(
    pool: &SqlitePool,
    input: CampaignScopedInput,
) -> Result<CandidateAgentRunContext, String> {
    positive(input.campaign_id, "Campaign id")?;
    let campaign_id = input.campaign_id;
    settle(pool, READ_ERROR, move |connection| {
        Box::pin(async move {
            assert_campaign_can_mutate(connection, campaign_id).await?;
            let seed_keywords: Vec<String> = sqlx::query_scalar(
                "SELECT keyword FROM campaign_keywords WHERE campaign_id = ?1
                 ORDER BY keyword ASC LIMIT ?2",
            )
            .bind(campaign_id)
            .bind(SEED_KEYWORD_LIMIT)
            .fetch_all(&mut *connection)
            .await
            .map_err(read_error)?;
            let scoring_candidate_ids: Vec<i64> = sqlx::query_scalar(
                "SELECT id FROM candidate_posts
                 WHERE campaign_id = ?1 AND status = 'new' AND relevance_score IS NULL
                 ORDER BY datetime(created_at) ASC, id ASC LIMIT ?2",
            )
            .bind(campaign_id)
            .bind(SCORING_CANDIDATE_LIMIT)
            .fetch_all(&mut *connection)
            .await
            .map_err(read_error)?;
            Ok(Settlement::Accepted(CandidateAgentRunContext {
                seed_keywords,
                scoring_candidate_ids,
            }))
        })
    })
    .await
}

struct ValidUpdate {
    id: i64,
    status: Option<String>,
    relevance_score: Option<Option<i64>>,
    score_reason: Option<String>,
    notes: Option<String>,
}

fn bounded_text(value: &str, max: usize, label: &str) -> Result<String, String> {
    let trimmed = js_trim(value);
    if utf16_len(trimmed) > max {
        return Err(format!("{label} must be at most {max} characters"));
    }
    Ok(trimmed.to_string())
}

fn validate_update(input: UpdateCandidateInput) -> Result<ValidUpdate, String> {
    positive(input.id, "Candidate id")?;
    if let Some(status) = input.status.as_deref() {
        if !CANDIDATE_STATUSES.contains(&status) {
            return Err("Unknown candidate status".to_string());
        }
    }
    if let Some(Some(score)) = input.relevance_score {
        if !(0..=100).contains(&score) {
            return Err("Relevance score must be between 0 and 100".to_string());
        }
    }
    Ok(ValidUpdate {
        id: input.id,
        status: input.status,
        relevance_score: input.relevance_score,
        score_reason: input
            .score_reason
            .as_deref()
            .map(|value| bounded_text(value, 500, "Score reason"))
            .transpose()?,
        notes: input
            .notes
            .as_deref()
            .map(|value| bounded_text(value, 1000, "Notes"))
            .transpose()?,
    })
}

/// Updates only the provided fields. A missing candidate is a silent no-op,
/// matching the previous renderer behaviour.
pub(crate) async fn update_candidate(
    pool: &SqlitePool,
    input: UpdateCandidateInput,
) -> Result<(), String> {
    let valid = validate_update(input)?;
    if valid.status.is_none()
        && valid.relevance_score.is_none()
        && valid.score_reason.is_none()
        && valid.notes.is_none()
    {
        return Ok(());
    }
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            // Each boolean flag keeps the column unchanged when the field was absent.
            sqlx::query(
                "UPDATE candidate_posts SET
                   status = CASE WHEN ?2 THEN ?3 ELSE status END,
                   relevance_score = CASE WHEN ?4 THEN ?5 ELSE relevance_score END,
                   score_reason = CASE WHEN ?6 THEN ?7 ELSE score_reason END,
                   notes = CASE WHEN ?8 THEN ?9 ELSE notes END,
                   updated_at = datetime('now')
                 WHERE id = ?1",
            )
            .bind(valid.id)
            .bind(valid.status.is_some())
            .bind(valid.status.as_deref())
            .bind(valid.relevance_score.is_some())
            .bind(valid.relevance_score.flatten())
            .bind(valid.score_reason.is_some())
            .bind(valid.score_reason.as_deref())
            .bind(valid.notes.is_some())
            .bind(valid.notes.as_deref())
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            Ok(Settlement::Accepted(()))
        })
    })
    .await
}

pub(crate) async fn dismiss_discovery_item(
    pool: &SqlitePool,
    input: DismissDiscoveryItemInput,
) -> Result<(), String> {
    positive(input.id, "Discovery suggestion id")?;
    positive(input.campaign_id, "Campaign id")?;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            assert_campaign_can_mutate(connection, input.campaign_id).await?;
            let updated = sqlx::query(
                "UPDATE candidate_discovery_items
                 SET status = 'dismissed', updated_at = datetime('now')
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
            Ok(Settlement::Accepted(()))
        })
    })
    .await
}

/// Port of the renderer `compactText`: trim, collapse whitespace, then cap.
fn compact(value: &str, max_units: usize) -> String {
    utf16_prefix(&js_collapse_whitespace(value), max_units).to_string()
}

struct CompactSuggestion {
    kind: String,
    title: String,
    keyword: String,
    rationale: String,
    source_keyword: String,
    confidence_score: Option<i64>,
}

/// Validates and compacts suggestions, dropping empty and in-batch duplicate
/// ones in their original order.
fn prepare_suggestions(
    input: &InsertDiscoveryItemsInput,
) -> Result<Vec<CompactSuggestion>, String> {
    positive(input.campaign_id, "Campaign id")?;
    positive(input.agent_run_id, "Agent run id")?;
    if let Some(id) = input.workflow_run_id {
        positive(id, "Workflow run id")?;
    }
    if input.suggestions.len() > MAX_SUGGESTIONS {
        return Err(format!(
            "Save up to {MAX_SUGGESTIONS} discovery suggestions"
        ));
    }
    let mut seen = std::collections::BTreeSet::new();
    let mut prepared = Vec::new();
    for suggestion in &input.suggestions {
        if !DISCOVERY_KINDS.contains(&suggestion.kind.as_str()) {
            return Err("Unknown discovery suggestion kind".to_string());
        }
        if let Some(score) = suggestion.confidence_score {
            if !(0..=100).contains(&score) {
                return Err("Confidence score must be between 0 and 100".to_string());
            }
        }
        let title = compact(&suggestion.title, 160);
        let keyword = compact(&suggestion.keyword, 80);
        if title.is_empty() && keyword.is_empty() {
            continue;
        }
        let dedupe_key = (
            suggestion.kind.clone(),
            keyword.to_lowercase(),
            title.to_lowercase(),
        );
        if !seen.insert(dedupe_key) {
            continue;
        }
        prepared.push(CompactSuggestion {
            kind: suggestion.kind.clone(),
            title,
            keyword,
            rationale: compact(&suggestion.rationale, 500),
            source_keyword: compact(&suggestion.source_keyword, 80),
            confidence_score: suggestion.confidence_score,
        });
    }
    Ok(prepared)
}

async fn assert_agent_run_owned(
    connection: &mut SqliteConnection,
    agent_run_id: i64,
    campaign_id: i64,
) -> Result<(), String> {
    let owner: Option<i64> = sqlx::query_scalar("SELECT campaign_id FROM agent_runs WHERE id = ?1")
        .bind(agent_run_id)
        .fetch_optional(&mut *connection)
        .await
        .map_err(storage_error)?;
    match owner {
        Some(owner) if owner == campaign_id => Ok(()),
        Some(_) => Err("Research request belongs to a different campaign".to_string()),
        None => Err("Agent run was not found".to_string()),
    }
}

/// Saves `research_posts` suggestions: reuses a matching live item, otherwise
/// inserts one. All rows settle in one transaction or none do.
pub(crate) async fn insert_discovery_items(
    pool: &SqlitePool,
    input: InsertDiscoveryItemsInput,
) -> Result<Vec<DiscoveryItemRow>, String> {
    let suggestions = prepare_suggestions(&input)?;
    let campaign_id = input.campaign_id;
    let agent_run_id = input.agent_run_id;
    let workflow_run_id = input.workflow_run_id;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            assert_campaign_can_mutate(connection, campaign_id).await?;
            assert_agent_run_owned(connection, agent_run_id, campaign_id).await?;
            let existing_sql = format!(
                "SELECT {DISCOVERY_COLUMNS} FROM candidate_discovery_items
                 WHERE campaign_id = ?1 AND kind = ?2 AND keyword = ?3 AND title = ?4
                   AND status != 'dismissed'
                 LIMIT 1"
            );
            let by_id_sql =
                format!("SELECT {DISCOVERY_COLUMNS} FROM candidate_discovery_items WHERE id = ?1");
            let mut saved = Vec::with_capacity(suggestions.len());
            for suggestion in &suggestions {
                let existing = sqlx::query(&existing_sql)
                    .bind(campaign_id)
                    .bind(&suggestion.kind)
                    .bind(&suggestion.keyword)
                    .bind(&suggestion.title)
                    .fetch_optional(&mut *connection)
                    .await
                    .map_err(storage_error)?;
                if let Some(row) = existing {
                    saved.push(discovery_row(&row));
                    continue;
                }
                let id = sqlx::query(
                    "INSERT INTO candidate_discovery_items (
                       campaign_id, agent_run_id, workflow_run_id, kind, title, keyword,
                       rationale, source_keyword, confidence_score, updated_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))",
                )
                .bind(campaign_id)
                .bind(agent_run_id)
                .bind(workflow_run_id)
                .bind(&suggestion.kind)
                .bind(&suggestion.title)
                .bind(&suggestion.keyword)
                .bind(&suggestion.rationale)
                .bind(&suggestion.source_keyword)
                .bind(suggestion.confidence_score)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?
                .last_insert_rowid();
                let row = sqlx::query(&by_id_sql)
                    .bind(id)
                    .fetch_one(&mut *connection)
                    .await
                    .map_err(storage_error)?;
                saved.push(discovery_row(&row));
            }
            Ok(Settlement::Accepted(saved))
        })
    })
    .await
}

#[tauri::command]
pub async fn linkgo_candidate_list(
    pool: State<'_, SqlitePool>,
    input: ListCandidatesInput,
) -> Result<CandidateListPage, String> {
    list_candidates(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_candidate_discovery_list(
    pool: State<'_, SqlitePool>,
    input: CampaignScopedInput,
) -> Result<Vec<DiscoveryItemRow>, String> {
    list_discovery_items(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_candidate_agent_run_context(
    pool: State<'_, SqlitePool>,
    input: CampaignScopedInput,
) -> Result<CandidateAgentRunContext, String> {
    agent_run_context(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_candidate_update(
    pool: State<'_, SqlitePool>,
    input: UpdateCandidateInput,
) -> Result<(), String> {
    update_candidate(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_candidate_dismiss_discovery_item(
    pool: State<'_, SqlitePool>,
    input: DismissDiscoveryItemInput,
) -> Result<(), String> {
    dismiss_discovery_item(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_candidate_discovery_insert(
    pool: State<'_, SqlitePool>,
    input: InsertDiscoveryItemsInput,
) -> Result<Vec<DiscoveryItemRow>, String> {
    insert_discovery_items(pool.inner(), input).await
}

#[cfg(test)]
#[path = "candidate_queue_store_tests.rs"]
mod tests;
