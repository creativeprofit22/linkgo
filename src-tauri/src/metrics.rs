//! Native manual metric and campaign-memory mutations.
//!
//! Each command validates input, then re-reads ownership (approval, publish
//! attempt, post metric or memory belongs to the stated campaign; campaign not
//! archived) and writes the row plus its `learning_events` entry on one pinned
//! `BEGIN IMMEDIATE` connection.

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqliteConnection, SqlitePool};
use tauri::State;

use crate::db_transaction::{settle, Settlement};

const STORAGE_ERROR: &str = "Could not save metrics change";
const MAX_METRIC_COUNT: i64 = 1_000_000_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecordPostMetricInput {
    pub campaign_id: i64,
    pub approval_id: i64,
    #[serde(default)]
    pub publish_attempt_id: Option<i64>,
    pub measured_at: String,
    pub impressions: i64,
    pub reactions: i64,
    pub comments: i64,
    pub reposts: i64,
    pub profile_visits: i64,
    pub link_clicks: i64,
    #[serde(default)]
    pub ctr: Option<f64>,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateCampaignMemoryInput {
    pub campaign_id: i64,
    #[serde(default)]
    pub post_metric_id: Option<i64>,
    pub signal: String,
    pub summary: String,
    #[serde(default)]
    pub evidence: String,
    #[serde(default = "default_confidence")]
    pub confidence: i64,
}

fn default_confidence() -> i64 {
    50
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetCampaignMemoryStatusInput {
    pub id: i64,
    pub status: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MetricsMutationResult {
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

fn bounded(value: &str, max: usize, label: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.chars().count() > max {
        return Err(format!("{label} must be at most {max} characters"));
    }
    Ok(trimmed.to_string())
}

async fn insert_learning_event(
    connection: &mut SqliteConnection,
    campaign_id: i64,
    post_metric_id: Option<i64>,
    campaign_memory_id: Option<i64>,
    event_type: &str,
    summary: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO learning_events (campaign_id, post_metric_id, campaign_memory_id, event_type, summary)
         VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(campaign_id)
    .bind(post_metric_id)
    .bind(campaign_memory_id)
    .bind(event_type)
    .bind(summary)
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?;
    Ok(())
}

struct ValidMetric {
    measured_at: String,
    notes: String,
}

fn validate_metric(input: &RecordPostMetricInput) -> Result<ValidMetric, String> {
    positive(input.campaign_id, "Campaign id")?;
    positive(input.approval_id, "Approval id")?;
    if let Some(id) = input.publish_attempt_id {
        positive(id, "Publish attempt id")?;
    }
    let measured_at = bounded(&input.measured_at, 80, "Measured time")?;
    if measured_at.is_empty() {
        return Err("Measured time must be a valid date".to_string());
    }
    for (value, label) in [
        (input.impressions, "Impressions"),
        (input.reactions, "Reactions"),
        (input.comments, "Comments"),
        (input.reposts, "Reposts"),
        (input.profile_visits, "Profile visits"),
        (input.link_clicks, "Link clicks"),
    ] {
        if !(0..=MAX_METRIC_COUNT).contains(&value) {
            return Err(format!("{label} must be between 0 and {MAX_METRIC_COUNT}"));
        }
    }
    if let Some(ctr) = input.ctr {
        if !ctr.is_finite() || !(0.0..=100.0).contains(&ctr) {
            return Err("CTR must be between 0 and 100".to_string());
        }
    }
    let notes = bounded(&input.notes, 1000, "Notes")?;
    Ok(ValidMetric { measured_at, notes })
}

pub(crate) async fn record_post_metric(
    pool: &SqlitePool,
    input: RecordPostMetricInput,
) -> Result<MetricsMutationResult, String> {
    let valid = validate_metric(&input)?;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let approval = sqlx::query(
                "SELECT a.campaign_id, a.status, c.status AS campaign_status
                 FROM approvals a INNER JOIN campaigns c ON c.id = a.campaign_id
                 WHERE a.id = ?1",
            )
            .bind(input.approval_id)
            .fetch_optional(&mut *connection)
            .await
            .map_err(storage_error)?
            .ok_or_else(|| "Approval was not found".to_string())?;
            if approval.get::<i64, _>("campaign_id") != input.campaign_id {
                return Err("Approval does not belong to this campaign".to_string());
            }
            if approval.get::<String, _>("campaign_status") == "archived" {
                return Err("Campaign is archived".to_string());
            }
            if approval.get::<String, _>("status") != "published" {
                return Err("Only published approvals can record metrics".to_string());
            }
            let attempt = match input.publish_attempt_id {
                None => sqlx::query(
                    "SELECT id, approval_id FROM publish_attempts
                     WHERE approval_id = ?1 AND status = 'succeeded'
                     ORDER BY datetime(created_at) DESC, id DESC LIMIT 1",
                )
                .bind(input.approval_id),
                Some(id) => sqlx::query(
                    "SELECT id, approval_id FROM publish_attempts
                     WHERE id = ?1 AND status = 'succeeded' LIMIT 1",
                )
                .bind(id),
            }
            .fetch_optional(&mut *connection)
            .await
            .map_err(storage_error)?
            .filter(|row| row.get::<i64, _>("approval_id") == input.approval_id)
            .ok_or_else(|| "Published approval needs a successful publish attempt".to_string())?;
            let attempt_id: i64 = attempt.get("id");
            let metric_id = sqlx::query(
                "INSERT INTO post_metrics (
                    campaign_id, approval_id, publish_attempt_id, platform, measured_at,
                    impressions, reactions, comments, reposts, profile_visits, link_clicks,
                    ctr, notes, collection_source, raw_payload_json, updated_at
                 ) VALUES (?1, ?2, ?3, 'linkedin', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                           'manual', '', datetime('now'))",
            )
            .bind(input.campaign_id)
            .bind(input.approval_id)
            .bind(attempt_id)
            .bind(&valid.measured_at)
            .bind(input.impressions)
            .bind(input.reactions)
            .bind(input.comments)
            .bind(input.reposts)
            .bind(input.profile_visits)
            .bind(input.link_clicks)
            .bind(input.ctr)
            .bind(&valid.notes)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?
            .last_insert_rowid();
            insert_learning_event(
                connection,
                input.campaign_id,
                Some(metric_id),
                None,
                "metric_recorded",
                &format!(
                    "Metric snapshot recorded for approval #{}",
                    input.approval_id
                ),
            )
            .await?;
            Ok(Settlement::Accepted(MetricsMutationResult {
                id: metric_id,
            }))
        })
    })
    .await
}

pub(crate) async fn create_campaign_memory(
    pool: &SqlitePool,
    input: CreateCampaignMemoryInput,
) -> Result<MetricsMutationResult, String> {
    positive(input.campaign_id, "Campaign id")?;
    if let Some(id) = input.post_metric_id {
        positive(id, "Post metric id")?;
    }
    if !matches!(
        input.signal.as_str(),
        "winner" | "underperformer" | "insight" | "avoid"
    ) {
        return Err("Unsupported memory signal".to_string());
    }
    let summary = bounded(&input.summary, 500, "Summary")?;
    if summary.is_empty() {
        return Err("Summary is required".to_string());
    }
    let evidence = bounded(&input.evidence, 1000, "Evidence")?;
    if !(0..=100).contains(&input.confidence) {
        return Err("Confidence must be between 0 and 100".to_string());
    }
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let status: Option<String> =
                sqlx::query_scalar("SELECT status FROM campaigns WHERE id = ?1")
                    .bind(input.campaign_id)
                    .fetch_optional(&mut *connection)
                    .await
                    .map_err(storage_error)?;
            match status.as_deref() {
                None => return Err("Campaign was not found".to_string()),
                Some("archived") => return Err("Campaign is archived".to_string()),
                Some(_) => {}
            }
            if let Some(metric_id) = input.post_metric_id {
                let owner: Option<i64> =
                    sqlx::query_scalar("SELECT campaign_id FROM post_metrics WHERE id = ?1")
                        .bind(metric_id)
                        .fetch_optional(&mut *connection)
                        .await
                        .map_err(storage_error)?;
                match owner {
                    None => return Err("Post metric was not found".to_string()),
                    Some(owner) if owner != input.campaign_id => {
                        return Err("Post metric does not belong to this campaign".to_string())
                    }
                    Some(_) => {}
                }
            }
            let memory_id = sqlx::query(
                "INSERT INTO campaign_memory (
                    campaign_id, post_metric_id, signal, summary, evidence, confidence, status, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', datetime('now'))",
            )
            .bind(input.campaign_id)
            .bind(input.post_metric_id)
            .bind(&input.signal)
            .bind(&summary)
            .bind(&evidence)
            .bind(input.confidence)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?
            .last_insert_rowid();
            insert_learning_event(
                connection,
                input.campaign_id,
                input.post_metric_id,
                Some(memory_id),
                "memory_created",
                &format!("Campaign memory created: {summary}"),
            )
            .await?;
            Ok(Settlement::Accepted(MetricsMutationResult { id: memory_id }))
        })
    })
    .await
}

pub(crate) async fn set_campaign_memory_status(
    pool: &SqlitePool,
    input: SetCampaignMemoryStatusInput,
) -> Result<MetricsMutationResult, String> {
    positive(input.id, "Campaign memory id")?;
    let archived = match input.status.as_str() {
        "archived" => true,
        "active" => false,
        _ => return Err("Unsupported campaign memory status".to_string()),
    };
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let memory = sqlx::query(
                "SELECT cm.campaign_id, c.status AS campaign_status
                 FROM campaign_memory cm INNER JOIN campaigns c ON c.id = cm.campaign_id
                 WHERE cm.id = ?1",
            )
            .bind(input.id)
            .fetch_optional(&mut *connection)
            .await
            .map_err(storage_error)?
            .ok_or_else(|| "Campaign memory was not found".to_string())?;
            if memory.get::<String, _>("campaign_status") == "archived" {
                return Err("Campaign is archived".to_string());
            }
            let campaign_id: i64 = memory.get("campaign_id");
            sqlx::query(
                "UPDATE campaign_memory SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
            )
            .bind(&input.status)
            .bind(input.id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            insert_learning_event(
                connection,
                campaign_id,
                None,
                Some(input.id),
                if archived {
                    "memory_archived"
                } else {
                    "memory_restored"
                },
                if archived {
                    "Campaign memory archived"
                } else {
                    "Campaign memory restored"
                },
            )
            .await?;
            Ok(Settlement::Accepted(MetricsMutationResult { id: input.id }))
        })
    })
    .await
}

#[tauri::command]
pub async fn linkgo_metrics_record_post_metric(
    pool: State<'_, SqlitePool>,
    input: RecordPostMetricInput,
) -> Result<MetricsMutationResult, String> {
    record_post_metric(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_metrics_create_campaign_memory(
    pool: State<'_, SqlitePool>,
    input: CreateCampaignMemoryInput,
) -> Result<MetricsMutationResult, String> {
    create_campaign_memory(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_metrics_set_campaign_memory_status(
    pool: State<'_, SqlitePool>,
    input: SetCampaignMemoryStatusInput,
) -> Result<MetricsMutationResult, String> {
    set_campaign_memory_status(pool.inner(), input).await
}

#[cfg(test)]
#[path = "metrics_tests.rs"]
mod tests;
