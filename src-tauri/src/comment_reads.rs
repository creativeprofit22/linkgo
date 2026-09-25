//! Native comment reads: threads with their variants, audits and attempts
//! (one transaction snapshot), and the candidates eligible for a new thread.
//! Lists are capped; related rows are fetched only for the returned threads.
//! The thread snapshot carries `totalCount`, the uncapped match count.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{SqliteConnection, SqlitePool};
use tauri::State;

use crate::row_json::rows_to_json;

const READ_ERROR: &str = "Could not load comments";
pub(crate) const THREAD_LIST_LIMIT: i64 = 500;
pub(crate) const ELIGIBLE_LIMIT: i64 = 200;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommentListInput {
    #[serde(default)]
    pub campaign_id: Option<i64>,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct CommentThreadsSnapshot {
    pub threads: Vec<Value>,
    pub variants: Vec<Value>,
    pub audits: Vec<Value>,
    pub attempts: Vec<Value>,
    /// Threads matching the filter before the `THREAD_LIST_LIMIT` cap.
    #[serde(rename = "totalCount")]
    pub total_count: i64,
}

fn read_error(_: sqlx::Error) -> String {
    READ_ERROR.to_string()
}

fn validate(input: &CommentListInput) -> Result<Option<i64>, String> {
    if input.campaign_id.is_some_and(|id| id <= 0) {
        return Err("Campaign id must be a positive integer".to_string());
    }
    Ok(input.campaign_id)
}

/// Runs `sql` with `{ids}` expanded to one numbered placeholder per id.
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

fn ids(rows: &[Value]) -> Vec<i64> {
    rows.iter().filter_map(|row| row["id"].as_i64()).collect()
}

pub(crate) async fn list_threads(
    pool: &SqlitePool,
    input: CommentListInput,
) -> Result<CommentThreadsSnapshot, String> {
    let campaign_id = validate(&input)?;
    let mut transaction = pool.begin().await.map_err(read_error)?;
    let rows = sqlx::query(
        "SELECT ct.id, ct.campaign_id, ct.candidate_post_id, ct.status, ct.operator_notes,
                ct.reviewer_notes, ct.approved_at, ct.rejected_at, ct.posted_at,
                ct.created_at, ct.updated_at,
                c.name AS campaign_name, c.status AS campaign_status,
                cp.status AS candidate_status, cp.source_keyword AS candidate_source_keyword,
                cp.relevance_score AS candidate_relevance_score,
                tp.id AS target_post_id, tp.url AS target_url,
                tp.platform_resource_urn AS target_platform_resource_urn,
                tp.author_name AS target_author_name,
                tp.author_profile_url AS target_author_profile_url,
                tp.content AS target_content, tp.posted_at AS target_posted_at
         FROM comment_threads ct
         INNER JOIN campaigns c ON c.id = ct.campaign_id
         INNER JOIN candidate_posts cp ON cp.id = ct.candidate_post_id
         INNER JOIN target_posts tp ON tp.id = cp.target_post_id
         WHERE (?1 IS NULL OR ct.campaign_id = ?1)
         ORDER BY ct.status IN ('posted', 'rejected', 'cancelled'),
                  datetime(ct.updated_at) DESC, ct.id DESC
         LIMIT ?2",
    )
    .bind(campaign_id)
    .bind(THREAD_LIST_LIMIT)
    .fetch_all(&mut *transaction)
    .await
    .map_err(read_error)?;
    let threads = rows_to_json(&rows);
    let total_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)
         FROM comment_threads ct
         INNER JOIN campaigns c ON c.id = ct.campaign_id
         INNER JOIN candidate_posts cp ON cp.id = ct.candidate_post_id
         INNER JOIN target_posts tp ON tp.id = cp.target_post_id
         WHERE (?1 IS NULL OR ct.campaign_id = ?1)",
    )
    .bind(campaign_id)
    .fetch_one(&mut *transaction)
    .await
    .map_err(read_error)?;
    let thread_ids = ids(&threads);
    let variants = by_ids(
        &mut transaction,
        "SELECT id, comment_thread_id, variant_number, body, status, created_at, updated_at
         FROM comment_variants WHERE comment_thread_id IN ({ids})
         ORDER BY variant_number ASC, id ASC",
        &thread_ids,
    )
    .await?;
    let audits = by_ids(
        &mut transaction,
        "SELECT id, comment_variant_id, rule_key, severity, message, created_at
         FROM comment_audits WHERE comment_variant_id IN ({ids}) ORDER BY id ASC",
        &ids(&variants),
    )
    .await?;
    let attempts = by_ids(
        &mut transaction,
        "SELECT id, comment_thread_id, platform, status, external_comment_url,
                platform_comment_id, idempotency_key, error_message, created_at
         FROM comment_attempts WHERE comment_thread_id IN ({ids})
         ORDER BY datetime(created_at) DESC, id DESC",
        &thread_ids,
    )
    .await?;
    transaction.commit().await.map_err(read_error)?;
    Ok(CommentThreadsSnapshot {
        threads,
        variants,
        audits,
        attempts,
        total_count,
    })
}

pub(crate) async fn list_eligible_candidates(
    pool: &SqlitePool,
    input: CommentListInput,
) -> Result<Vec<Value>, String> {
    let campaign_id = validate(&input)?;
    let rows = sqlx::query(
        "SELECT cp.id AS candidate_id, cp.campaign_id, c.name AS campaign_name,
                c.status AS campaign_status, cp.status AS candidate_status,
                cp.source_keyword, cp.relevance_score,
                tp.id AS target_post_id, tp.url AS target_url,
                tp.platform_resource_urn AS target_platform_resource_urn,
                tp.author_name AS target_author_name,
                tp.author_profile_url AS target_author_profile_url,
                tp.content AS target_content, tp.posted_at AS target_posted_at
         FROM candidate_posts cp
         INNER JOIN campaigns c ON c.id = cp.campaign_id
         INNER JOIN target_posts tp ON tp.id = cp.target_post_id
         LEFT JOIN comment_threads ct ON ct.candidate_post_id = cp.id
         WHERE c.status <> 'archived'
           AND cp.status IN ('shortlisted', 'drafted')
           AND ct.id IS NULL
           AND (?1 IS NULL OR cp.campaign_id = ?1)
         ORDER BY datetime(cp.updated_at) DESC, cp.id DESC
         LIMIT ?2",
    )
    .bind(campaign_id)
    .bind(ELIGIBLE_LIMIT)
    .fetch_all(pool)
    .await
    .map_err(read_error)?;
    Ok(rows_to_json(&rows))
}

#[tauri::command]
pub async fn linkgo_comment_thread_list(
    pool: State<'_, SqlitePool>,
    input: CommentListInput,
) -> Result<CommentThreadsSnapshot, String> {
    list_threads(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_comment_eligible_candidates(
    pool: State<'_, SqlitePool>,
    input: CommentListInput,
) -> Result<Vec<Value>, String> {
    list_eligible_candidates(pool.inner(), input).await
}

#[cfg(test)]
#[path = "comment_reads_tests.rs"]
mod tests;
