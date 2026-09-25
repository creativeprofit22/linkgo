//! Native campaign persistence: create/update/status writes and the bounded
//! campaign list read (campaigns with their keywords).
//!
//! Validation mirrors the renderer `createCampaignSchema` / `updateCampaignSchema`
//! (JS `trim`, UTF-16 lengths) so native never trusts renderer normalisation.
//! Missing campaigns are a silent no-op for update/status, matching the
//! previous renderer SQL (an UPDATE that matched no row).

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqliteConnection, SqlitePool};
use tauri::State;

use crate::db_transaction::{settle, Settlement};
use crate::js_text::{js_trim, utf16_len};

const STORAGE_ERROR: &str = "Could not save campaign";
const READ_ERROR: &str = "Could not load campaigns";
const DUPLICATE_NAME_ERROR: &str = "A campaign with this name already exists";
pub(crate) const DEFAULT_LIST_LIMIT: i64 = 500;
pub(crate) const MAX_LIST_LIMIT: i64 = 500;
const MAX_NAME_LENGTH: usize = 120;
const MAX_TEXT_LENGTH: usize = 500;
const MAX_TONE_LENGTH: usize = 240;
const MAX_KEYWORD_LENGTH: usize = 80;
const MAX_KEYWORDS: usize = 30;
const MAX_DAILY_POST_LIMIT: i64 = 10;
const MAX_DAILY_COMMENT_LIMIT: i64 = 50;
const STATUSES: &[&str] = &["draft", "active", "paused", "archived"];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateCampaignInput {
    pub name: String,
    #[serde(default)]
    pub product: String,
    #[serde(default)]
    pub audience: String,
    #[serde(default)]
    pub voice: String,
    #[serde(default)]
    pub tone: String,
    #[serde(default)]
    pub auto_pilot: bool,
    #[serde(default = "default_daily_post_limit")]
    pub daily_post_limit: i64,
    #[serde(default = "default_daily_comment_limit")]
    pub daily_comment_limit: i64,
    #[serde(default)]
    pub keywords: Vec<String>,
}

fn default_daily_post_limit() -> i64 {
    1
}

fn default_daily_comment_limit() -> i64 {
    5
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateCampaignInput {
    pub id: i64,
    pub name: Option<String>,
    pub product: Option<String>,
    pub audience: Option<String>,
    pub voice: Option<String>,
    pub tone: Option<String>,
    pub auto_pilot: Option<bool>,
    pub status: Option<String>,
    pub daily_post_limit: Option<i64>,
    pub daily_comment_limit: Option<i64>,
    pub keywords: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetCampaignStatusInput {
    pub id: i64,
    pub status: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListCampaignsInput {
    pub limit: Option<i64>,
}

/// Mirrors the renderer `CampaignKeyword` row shape.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CampaignKeyword {
    pub id: i64,
    pub campaign_id: i64,
    pub keyword: String,
    pub source: String,
    pub created_at: String,
}

/// Mirrors the renderer `CampaignWithKeywords` shape.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CampaignWithKeywords {
    pub id: i64,
    pub name: String,
    pub product: String,
    pub audience: String,
    pub voice: String,
    pub tone: String,
    pub auto_pilot: i64,
    pub status: String,
    pub daily_post_limit: i64,
    pub daily_comment_limit: i64,
    pub created_at: String,
    pub updated_at: String,
    pub keywords: Vec<CampaignKeyword>,
}

fn storage_error(error: sqlx::Error) -> String {
    if let sqlx::Error::Database(db) = &error {
        if db
            .message()
            .contains("UNIQUE constraint failed: campaigns.name")
        {
            return DUPLICATE_NAME_ERROR.to_string();
        }
    }
    STORAGE_ERROR.to_string()
}

fn read_error(_: sqlx::Error) -> String {
    READ_ERROR.to_string()
}

fn validate_id(id: i64) -> Result<(), String> {
    if id <= 0 {
        return Err("Campaign id must be a positive integer".to_string());
    }
    Ok(())
}

fn text_field(label: &str, value: &str, min: usize, max: usize) -> Result<String, String> {
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

fn range_field(label: &str, value: i64, max: i64) -> Result<i64, String> {
    if !(0..=max).contains(&value) {
        return Err(format!("{label} must be between 0 and {max}"));
    }
    Ok(value)
}

fn status_field(value: &str) -> Result<String, String> {
    if STATUSES.contains(&value) {
        Ok(value.to_string())
    } else {
        Err("Unsupported campaign status".to_string())
    }
}

/// Validates like `keywordListSchema`, then trims and case-insensitively
/// dedupes like the renderer `uniqueKeywords` (first spelling wins).
fn keyword_list(keywords: &[String]) -> Result<Vec<String>, String> {
    if keywords.len() > MAX_KEYWORDS {
        return Err(format!("At most {MAX_KEYWORDS} keywords are allowed"));
    }
    let mut unique: Vec<String> = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    for keyword in keywords {
        let keyword = text_field("Keyword", keyword, 1, MAX_KEYWORD_LENGTH)?;
        let key = keyword.to_lowercase();
        if seen.contains(&key) {
            continue;
        }
        seen.push(key);
        unique.push(keyword);
    }
    Ok(unique)
}

struct ValidCreate {
    name: String,
    product: String,
    audience: String,
    voice: String,
    tone: String,
    auto_pilot: i64,
    daily_post_limit: i64,
    daily_comment_limit: i64,
    keywords: Vec<String>,
}

fn validate_create(input: &CreateCampaignInput) -> Result<ValidCreate, String> {
    Ok(ValidCreate {
        name: text_field("Name", &input.name, 1, MAX_NAME_LENGTH)?,
        product: text_field("Product", &input.product, 0, MAX_TEXT_LENGTH)?,
        audience: text_field("Audience", &input.audience, 0, MAX_TEXT_LENGTH)?,
        voice: text_field("Voice", &input.voice, 0, MAX_TEXT_LENGTH)?,
        tone: text_field("Tone", &input.tone, 0, MAX_TONE_LENGTH)?,
        auto_pilot: i64::from(input.auto_pilot),
        daily_post_limit: range_field(
            "Daily post limit",
            input.daily_post_limit,
            MAX_DAILY_POST_LIMIT,
        )?,
        daily_comment_limit: range_field(
            "Daily comment limit",
            input.daily_comment_limit,
            MAX_DAILY_COMMENT_LIMIT,
        )?,
        keywords: keyword_list(&input.keywords)?,
    })
}

enum ColumnValue {
    Text(String),
    Integer(i64),
}

/// Validated column assignments plus the optional replacement keyword list.
type ValidUpdate = (Vec<(&'static str, ColumnValue)>, Option<Vec<String>>);

fn validate_update(input: &UpdateCampaignInput) -> Result<ValidUpdate, String> {
    validate_id(input.id)?;
    let mut columns: Vec<(&'static str, ColumnValue)> = Vec::new();
    let texts: [(&'static str, &str, &Option<String>, usize, usize); 5] = [
        ("name", "Name", &input.name, 1, MAX_NAME_LENGTH),
        ("product", "Product", &input.product, 0, MAX_TEXT_LENGTH),
        ("audience", "Audience", &input.audience, 0, MAX_TEXT_LENGTH),
        ("voice", "Voice", &input.voice, 0, MAX_TEXT_LENGTH),
        ("tone", "Tone", &input.tone, 0, MAX_TONE_LENGTH),
    ];
    for (column, label, value, min, max) in texts {
        if let Some(value) = value {
            columns.push((
                column,
                ColumnValue::Text(text_field(label, value, min, max)?),
            ));
        }
    }
    if let Some(auto_pilot) = input.auto_pilot {
        columns.push(("auto_pilot", ColumnValue::Integer(i64::from(auto_pilot))));
    }
    if let Some(status) = &input.status {
        columns.push(("status", ColumnValue::Text(status_field(status)?)));
    }
    if let Some(limit) = input.daily_post_limit {
        columns.push((
            "daily_post_limit",
            ColumnValue::Integer(range_field(
                "Daily post limit",
                limit,
                MAX_DAILY_POST_LIMIT,
            )?),
        ));
    }
    if let Some(limit) = input.daily_comment_limit {
        columns.push((
            "daily_comment_limit",
            ColumnValue::Integer(range_field(
                "Daily comment limit",
                limit,
                MAX_DAILY_COMMENT_LIMIT,
            )?),
        ));
    }
    let keywords = input.keywords.as_deref().map(keyword_list).transpose()?;
    Ok((columns, keywords))
}

async fn campaign_exists(connection: &mut SqliteConnection, id: i64) -> Result<bool, String> {
    let found: Option<i64> = sqlx::query_scalar("SELECT id FROM campaigns WHERE id = ?1")
        .bind(id)
        .fetch_optional(&mut *connection)
        .await
        .map_err(storage_error)?;
    Ok(found.is_some())
}

async fn insert_manual_keywords(
    connection: &mut SqliteConnection,
    campaign_id: i64,
    keywords: &[String],
) -> Result<(), String> {
    for keyword in keywords {
        sqlx::query(
            "INSERT OR IGNORE INTO campaign_keywords (campaign_id, keyword, source)
             VALUES (?1, ?2, 'manual')",
        )
        .bind(campaign_id)
        .bind(keyword)
        .execute(&mut *connection)
        .await
        .map_err(storage_error)?;
    }
    Ok(())
}

pub(crate) async fn create_campaign(
    pool: &SqlitePool,
    input: CreateCampaignInput,
) -> Result<i64, String> {
    let valid = validate_create(&input)?;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let id = sqlx::query(
                "INSERT INTO campaigns (
                   name, product, audience, voice, tone, auto_pilot,
                   daily_post_limit, daily_comment_limit, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))",
            )
            .bind(&valid.name)
            .bind(&valid.product)
            .bind(&valid.audience)
            .bind(&valid.voice)
            .bind(&valid.tone)
            .bind(valid.auto_pilot)
            .bind(valid.daily_post_limit)
            .bind(valid.daily_comment_limit)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?
            .last_insert_rowid();
            insert_manual_keywords(connection, id, &valid.keywords).await?;
            Ok(Settlement::Accepted(id))
        })
    })
    .await
}

pub(crate) async fn update_campaign(
    pool: &SqlitePool,
    input: UpdateCampaignInput,
) -> Result<(), String> {
    let (columns, keywords) = validate_update(&input)?;
    let id = input.id;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            if !campaign_exists(connection, id).await? {
                return Ok(Settlement::Accepted(()));
            }
            if !columns.is_empty() {
                let assignments = columns
                    .iter()
                    .enumerate()
                    .map(|(index, (column, _))| format!("{column} = ?{}", index + 1))
                    .collect::<Vec<_>>()
                    .join(", ");
                let sql = format!(
                    "UPDATE campaigns SET {assignments}, updated_at = datetime('now') WHERE id = ?{}",
                    columns.len() + 1
                );
                let mut query = sqlx::query(&sql);
                for (_, value) in &columns {
                    query = match value {
                        ColumnValue::Text(text) => query.bind(text),
                        ColumnValue::Integer(number) => query.bind(*number),
                    };
                }
                query
                    .bind(id)
                    .execute(&mut *connection)
                    .await
                    .map_err(storage_error)?;
            }
            if let Some(keywords) = &keywords {
                sqlx::query("DELETE FROM campaign_keywords WHERE campaign_id = ?1")
                    .bind(id)
                    .execute(&mut *connection)
                    .await
                    .map_err(storage_error)?;
                insert_manual_keywords(connection, id, keywords).await?;
            }
            Ok(Settlement::Accepted(()))
        })
    })
    .await
}

pub(crate) async fn set_campaign_status(
    pool: &SqlitePool,
    input: SetCampaignStatusInput,
) -> Result<(), String> {
    validate_id(input.id)?;
    let status = status_field(&input.status)?;
    let id = input.id;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            sqlx::query(
                "UPDATE campaigns SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
            )
            .bind(&status)
            .bind(id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            Ok(Settlement::Accepted(()))
        })
    })
    .await
}

const CAMPAIGN_COLUMNS: &str = "id, name, product, audience, voice, tone, auto_pilot, status,
    daily_post_limit, daily_comment_limit, created_at, updated_at";

fn map_campaign(row: &sqlx::sqlite::SqliteRow) -> CampaignWithKeywords {
    CampaignWithKeywords {
        id: row.get("id"),
        name: row.get("name"),
        product: row.get("product"),
        audience: row.get("audience"),
        voice: row.get("voice"),
        tone: row.get("tone"),
        auto_pilot: row.get("auto_pilot"),
        status: row.get("status"),
        daily_post_limit: row.get("daily_post_limit"),
        daily_comment_limit: row.get("daily_comment_limit"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        keywords: Vec::new(),
    }
}

/// Attaches keywords (ordered `keyword ASC`) to already-loaded campaigns.
async fn attach_keywords(
    connection: &mut SqliteConnection,
    campaigns: &mut [CampaignWithKeywords],
) -> Result<(), sqlx::Error> {
    if campaigns.is_empty() {
        return Ok(());
    }
    let placeholders = (1..=campaigns.len())
        .map(|index| format!("?{index}"))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "SELECT id, campaign_id, keyword, source, created_at FROM campaign_keywords
         WHERE campaign_id IN ({placeholders}) ORDER BY keyword ASC"
    );
    let mut query = sqlx::query(&sql);
    for campaign in campaigns.iter() {
        query = query.bind(campaign.id);
    }
    for row in query.fetch_all(&mut *connection).await? {
        let keyword = CampaignKeyword {
            id: row.get("id"),
            campaign_id: row.get("campaign_id"),
            keyword: row.get("keyword"),
            source: row.get("source"),
            created_at: row.get("created_at"),
        };
        if let Some(campaign) = campaigns
            .iter_mut()
            .find(|campaign| campaign.id == keyword.campaign_id)
        {
            campaign.keywords.push(keyword);
        }
    }
    Ok(())
}

pub(crate) async fn list_campaigns(
    pool: &SqlitePool,
    input: ListCampaignsInput,
) -> Result<Vec<CampaignWithKeywords>, String> {
    let limit = match input.limit {
        None => DEFAULT_LIST_LIMIT,
        Some(limit) if limit <= 0 => {
            return Err("Campaign list limit must be a positive integer".to_string())
        }
        Some(limit) => limit.min(MAX_LIST_LIMIT),
    };
    let mut transaction = pool.begin().await.map_err(read_error)?;
    let sql = format!(
        "SELECT {CAMPAIGN_COLUMNS} FROM campaigns
         ORDER BY status = 'archived', datetime(updated_at) DESC, id DESC LIMIT ?1"
    );
    let rows = sqlx::query(&sql)
        .bind(limit)
        .fetch_all(&mut *transaction)
        .await
        .map_err(read_error)?;
    let mut campaigns: Vec<CampaignWithKeywords> = rows.iter().map(map_campaign).collect();
    attach_keywords(&mut transaction, &mut campaigns)
        .await
        .map_err(read_error)?;
    transaction.commit().await.map_err(read_error)?;
    Ok(campaigns)
}

#[tauri::command]
pub async fn linkgo_campaign_create(
    pool: State<'_, SqlitePool>,
    input: CreateCampaignInput,
) -> Result<i64, String> {
    create_campaign(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_campaign_update(
    pool: State<'_, SqlitePool>,
    input: UpdateCampaignInput,
) -> Result<(), String> {
    update_campaign(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_campaign_status_set(
    pool: State<'_, SqlitePool>,
    input: SetCampaignStatusInput,
) -> Result<(), String> {
    set_campaign_status(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_campaign_list(
    pool: State<'_, SqlitePool>,
    input: Option<ListCampaignsInput>,
) -> Result<Vec<CampaignWithKeywords>, String> {
    list_campaigns(pool.inner(), input.unwrap_or_default()).await
}

#[cfg(test)]
#[path = "campaigns_tests.rs"]
mod tests;
