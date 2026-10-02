//! Per-campaign watchlist of LinkedIn profiles and companies.

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};

use super::direct::{validate_watch_url, WatchKind};
use super::store::STORAGE_ERROR;

const MAX_LABEL_CHARS: usize = 160;
const MAX_ENTRIES_PER_CAMPAIGN: i64 = 50;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WatchlistEntry {
    pub id: i64,
    pub campaign_id: i64,
    pub kind: String,
    pub url: String,
    pub label: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AddWatchlistEntryInput {
    pub campaign_id: i64,
    pub kind: String,
    pub url: String,
    #[serde(default)]
    pub label: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateWatchlistEntryInput {
    pub id: i64,
    pub enabled: bool,
    pub label: String,
}

fn entry_from_row(row: &sqlx::sqlite::SqliteRow) -> WatchlistEntry {
    WatchlistEntry {
        id: row.get("id"),
        campaign_id: row.get("campaign_id"),
        kind: row.get("kind"),
        url: row.get("url"),
        label: row.get("label"),
        enabled: row.get::<i64, _>("enabled") == 1,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn clean_label(label: &str) -> Result<String, String> {
    let label = label.trim();
    if label.chars().count() > MAX_LABEL_CHARS {
        return Err(format!(
            "Labels are limited to {MAX_LABEL_CHARS} characters"
        ));
    }
    Ok(label.to_string())
}

pub(crate) async fn list(
    pool: &SqlitePool,
    campaign_id: i64,
) -> Result<Vec<WatchlistEntry>, String> {
    let rows = sqlx::query(
        "SELECT id, campaign_id, kind, url, label, enabled, created_at, updated_at
         FROM source_watchlist_entries WHERE campaign_id = ?1 ORDER BY id ASC",
    )
    .bind(campaign_id)
    .fetch_all(pool)
    .await
    .map_err(|_| STORAGE_ERROR.to_string())?;
    Ok(rows.iter().map(entry_from_row).collect())
}

pub(crate) async fn add(
    pool: &SqlitePool,
    input: AddWatchlistEntryInput,
) -> Result<WatchlistEntry, String> {
    let kind =
        WatchKind::parse(&input.kind).ok_or_else(|| "Choose profile or company".to_string())?;
    let url = validate_watch_url(kind, &input.url)?;
    let label = clean_label(&input.label)?;
    let existing: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM source_watchlist_entries WHERE campaign_id = ?1")
            .bind(input.campaign_id)
            .fetch_one(pool)
            .await
            .map_err(|_| STORAGE_ERROR.to_string())?;
    if existing >= MAX_ENTRIES_PER_CAMPAIGN {
        return Err(format!(
            "A campaign can watch up to {MAX_ENTRIES_PER_CAMPAIGN} profiles and companies"
        ));
    }
    let result = sqlx::query(
        "INSERT INTO source_watchlist_entries (campaign_id, kind, url, label) VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(input.campaign_id)
    .bind(kind.as_str())
    .bind(&url)
    .bind(&label)
    .execute(pool)
    .await;
    let id = match result {
        Ok(done) => done.last_insert_rowid(),
        Err(sqlx::Error::Database(error)) if error.is_unique_violation() => {
            return Err("That URL is already on this campaign's watchlist".to_string())
        }
        Err(sqlx::Error::Database(error)) if error.is_foreign_key_violation() => {
            return Err("Campaign not found".to_string())
        }
        Err(_) => return Err(STORAGE_ERROR.to_string()),
    };
    get(pool, id).await
}

async fn get(pool: &SqlitePool, id: i64) -> Result<WatchlistEntry, String> {
    let row = sqlx::query(
        "SELECT id, campaign_id, kind, url, label, enabled, created_at, updated_at
         FROM source_watchlist_entries WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|_| STORAGE_ERROR.to_string())?
    .ok_or_else(|| "Watchlist entry not found".to_string())?;
    Ok(entry_from_row(&row))
}

pub(crate) async fn update(
    pool: &SqlitePool,
    input: UpdateWatchlistEntryInput,
) -> Result<WatchlistEntry, String> {
    let label = clean_label(&input.label)?;
    let done = sqlx::query(
        "UPDATE source_watchlist_entries SET enabled = ?2, label = ?3, updated_at = datetime('now') WHERE id = ?1",
    )
    .bind(input.id)
    .bind(i64::from(input.enabled))
    .bind(&label)
    .execute(pool)
    .await
    .map_err(|_| STORAGE_ERROR.to_string())?;
    if done.rows_affected() == 0 {
        return Err("Watchlist entry not found".to_string());
    }
    get(pool, input.id).await
}

pub(crate) async fn remove(pool: &SqlitePool, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM source_watchlist_entries WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|_| STORAGE_ERROR.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{migrated, seed};

    #[tokio::test]
    async fn add_validates_dedupes_and_updates() {
        let f = migrated().await;
        seed(
            &f.pool,
            "INSERT INTO campaigns (id,name,status) VALUES (1,'C','active');",
        )
        .await;
        let added = add(
            &f.pool,
            AddWatchlistEntryInput {
                campaign_id: 1,
                kind: "profile".into(),
                url: "https://www.linkedin.com/in/someone?trk=x".into(),
                label: "  Someone ".into(),
            },
        )
        .await
        .unwrap();
        assert_eq!(added.url, "https://www.linkedin.com/in/someone");
        assert_eq!(added.label, "Someone");
        assert!(added.enabled);

        let duplicate = add(
            &f.pool,
            AddWatchlistEntryInput {
                campaign_id: 1,
                kind: "profile".into(),
                url: "https://www.linkedin.com/in/someone".into(),
                label: String::new(),
            },
        )
        .await;
        assert_eq!(
            duplicate.unwrap_err(),
            "That URL is already on this campaign's watchlist"
        );

        let wrong_kind = add(
            &f.pool,
            AddWatchlistEntryInput {
                campaign_id: 1,
                kind: "company".into(),
                url: "https://www.linkedin.com/in/other".into(),
                label: String::new(),
            },
        )
        .await;
        assert!(wrong_kind.is_err());

        let updated = update(
            &f.pool,
            UpdateWatchlistEntryInput {
                id: added.id,
                enabled: false,
                label: "Paused".into(),
            },
        )
        .await
        .unwrap();
        assert!(!updated.enabled);
        assert_eq!(updated.label, "Paused");

        remove(&f.pool, added.id).await.unwrap();
        assert!(list(&f.pool, 1).await.unwrap().is_empty());
    }
}
