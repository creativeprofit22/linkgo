use chrono::{
    DateTime, Days, Duration as ChronoDuration, LocalResult, Offset, SecondsFormat, TimeZone, Utc,
};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteConnectOptions, Connection, Row, Sqlite, SqliteConnection, Transaction};
use std::time::Duration;
use tauri::AppHandle;

use crate::auth::publish::app_sqlite_path;

const OPEN_STATUSES: [&str; 3] = ["pending", "in_progress", "blocked"];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCampaignBacklogItemInput {
    pub campaign_id: i64,
    pub work_type: String,
    pub title: String,
    #[serde(default)]
    pub details: String,
    pub owner_type: String,
    pub due_at: String,
    pub recurrence: String,
    pub recurrence_timezone: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCampaignBacklogItemInput {
    pub id: i64,
    pub work_type: String,
    pub title: String,
    #[serde(default)]
    pub details: String,
    pub owner_type: String,
    pub due_at: String,
    pub recurrence: String,
    pub recurrence_timezone: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetCampaignBacklogItemStatusInput {
    pub id: i64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CampaignBacklogItemDetail {
    pub id: i64,
    pub campaign_id: i64,
    pub recurrence_parent_id: Option<i64>,
    pub work_type: String,
    pub title: String,
    pub details: String,
    pub owner_type: String,
    pub status: String,
    pub due_at: String,
    pub recurrence: String,
    pub recurrence_timezone: String,
    pub completed_at: Option<String>,
    pub cancelled_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub campaign_name: String,
    pub campaign_status: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CampaignBacklogMutationResult {
    pub item: CampaignBacklogItemDetail,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CampaignBacklogStatusMutationResult {
    pub item: CampaignBacklogItemDetail,
    pub successor: Option<CampaignBacklogItemDetail>,
}

#[derive(Debug)]
struct MutableBacklogItem {
    id: i64,
    campaign_id: i64,
    work_type: String,
    title: String,
    details: String,
    owner_type: String,
    status: String,
    due_at: String,
    recurrence: String,
    recurrence_timezone: String,
    campaign_status: String,
}

async fn open_connection(app: &AppHandle) -> Result<SqliteConnection, String> {
    let options = SqliteConnectOptions::new()
        .filename(app_sqlite_path(app)?)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5));
    SqliteConnection::connect_with(&options)
        .await
        .map_err(|_| "Could not open Linkgo database".to_string())
}

async fn begin_transaction(
    connection: &mut SqliteConnection,
) -> Result<Transaction<'_, Sqlite>, String> {
    connection
        .begin()
        .await
        .map_err(|_| "Could not start backlog transaction".to_string())
}

async fn ensure_campaign_mutable(
    transaction: &mut Transaction<'_, Sqlite>,
    campaign_id: i64,
) -> Result<(), String> {
    let status =
        sqlx::query_scalar::<_, String>("SELECT status FROM campaigns WHERE id = ?1 LIMIT 1")
            .bind(campaign_id)
            .fetch_optional(&mut **transaction)
            .await
            .map_err(|_| "Could not read campaign".to_string())?
            .ok_or_else(|| "Campaign was not found".to_string())?;

    if status == "archived" {
        return Err("Archived campaigns are read-only".to_string());
    }
    Ok(())
}

async fn read_mutable_item(
    transaction: &mut Transaction<'_, Sqlite>,
    item_id: i64,
) -> Result<MutableBacklogItem, String> {
    let row = sqlx::query(
        "SELECT cbi.id, cbi.campaign_id, cbi.work_type, cbi.title, cbi.details,
                cbi.owner_type, cbi.status, cbi.due_at, cbi.recurrence,
                cbi.recurrence_timezone, c.status AS campaign_status
         FROM campaign_backlog_items cbi
         INNER JOIN campaigns c ON c.id = cbi.campaign_id
         WHERE cbi.id = ?1
         LIMIT 1",
    )
    .bind(item_id)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|_| "Could not read backlog item".to_string())?
    .ok_or_else(|| "Backlog item was not found".to_string())?;

    let item = MutableBacklogItem {
        id: row
            .try_get("id")
            .map_err(|_| "Backlog item data is invalid".to_string())?,
        campaign_id: row
            .try_get("campaign_id")
            .map_err(|_| "Backlog item data is invalid".to_string())?,
        work_type: row
            .try_get("work_type")
            .map_err(|_| "Backlog item data is invalid".to_string())?,
        title: row
            .try_get("title")
            .map_err(|_| "Backlog item data is invalid".to_string())?,
        details: row
            .try_get("details")
            .map_err(|_| "Backlog item data is invalid".to_string())?,
        owner_type: row
            .try_get("owner_type")
            .map_err(|_| "Backlog item data is invalid".to_string())?,
        status: row
            .try_get("status")
            .map_err(|_| "Backlog item data is invalid".to_string())?,
        due_at: row
            .try_get("due_at")
            .map_err(|_| "Backlog item data is invalid".to_string())?,
        recurrence: row
            .try_get("recurrence")
            .map_err(|_| "Backlog item data is invalid".to_string())?,
        recurrence_timezone: row
            .try_get("recurrence_timezone")
            .map_err(|_| "Backlog item data is invalid".to_string())?,
        campaign_status: row
            .try_get("campaign_status")
            .map_err(|_| "Backlog item data is invalid".to_string())?,
    };

    if item.campaign_status == "archived" {
        return Err("Archived campaigns are read-only".to_string());
    }
    Ok(item)
}

async fn read_item_detail(
    transaction: &mut Transaction<'_, Sqlite>,
    item_id: i64,
) -> Result<CampaignBacklogItemDetail, String> {
    let row = sqlx::query(
        "SELECT cbi.*, c.name AS campaign_name, c.status AS campaign_status
         FROM campaign_backlog_items cbi
         INNER JOIN campaigns c ON c.id = cbi.campaign_id
         WHERE cbi.id = ?1
         LIMIT 1",
    )
    .bind(item_id)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|_| "Could not read saved backlog item".to_string())?
    .ok_or_else(|| "Saved backlog item was not found".to_string())?;

    Ok(CampaignBacklogItemDetail {
        id: row
            .try_get("id")
            .map_err(|_| "Saved backlog item data is invalid".to_string())?,
        campaign_id: row
            .try_get("campaign_id")
            .map_err(|_| "Saved backlog item data is invalid".to_string())?,
        recurrence_parent_id: row
            .try_get("recurrence_parent_id")
            .map_err(|_| "Saved backlog item data is invalid".to_string())?,
        work_type: row
            .try_get("work_type")
            .map_err(|_| "Saved backlog item data is invalid".to_string())?,
        title: row
            .try_get("title")
            .map_err(|_| "Saved backlog item data is invalid".to_string())?,
        details: row
            .try_get("details")
            .map_err(|_| "Saved backlog item data is invalid".to_string())?,
        owner_type: row
            .try_get("owner_type")
            .map_err(|_| "Saved backlog item data is invalid".to_string())?,
        status: row
            .try_get("status")
            .map_err(|_| "Saved backlog item data is invalid".to_string())?,
        due_at: row
            .try_get("due_at")
            .map_err(|_| "Saved backlog item data is invalid".to_string())?,
        recurrence: row
            .try_get("recurrence")
            .map_err(|_| "Saved backlog item data is invalid".to_string())?,
        recurrence_timezone: row
            .try_get("recurrence_timezone")
            .map_err(|_| "Saved backlog item data is invalid".to_string())?,
        completed_at: row
            .try_get("completed_at")
            .map_err(|_| "Saved backlog item data is invalid".to_string())?,
        cancelled_at: row
            .try_get("cancelled_at")
            .map_err(|_| "Saved backlog item data is invalid".to_string())?,
        created_at: row
            .try_get("created_at")
            .map_err(|_| "Saved backlog item data is invalid".to_string())?,
        updated_at: row
            .try_get("updated_at")
            .map_err(|_| "Saved backlog item data is invalid".to_string())?,
        campaign_name: row
            .try_get("campaign_name")
            .map_err(|_| "Saved backlog item data is invalid".to_string())?,
        campaign_status: row
            .try_get("campaign_status")
            .map_err(|_| "Saved backlog item data is invalid".to_string())?,
    })
}

fn transition_is_allowed(current: &str, next: &str) -> bool {
    match current {
        "pending" => matches!(next, "in_progress" | "blocked" | "completed" | "cancelled"),
        "in_progress" => matches!(next, "pending" | "blocked" | "completed" | "cancelled"),
        "blocked" => matches!(next, "pending" | "in_progress" | "completed" | "cancelled"),
        _ => false,
    }
}

fn parse_recurrence_time_zone(
    recurrence: &str,
    recurrence_time_zone: &str,
) -> Result<Option<Tz>, String> {
    match recurrence {
        "none" if recurrence_time_zone.is_empty() => Ok(None),
        "none" => Err("One-off backlog items cannot have a recurrence time zone".to_string()),
        "daily" | "weekly" => recurrence_time_zone
            .parse::<Tz>()
            .map(Some)
            .map_err(|_| "Backlog recurrence time zone is invalid".to_string()),
        _ => Err("Backlog recurrence is invalid".to_string()),
    }
}

fn choose_earlier(first: DateTime<Tz>, second: DateTime<Tz>) -> DateTime<Tz> {
    if first.timestamp_millis() <= second.timestamp_millis() {
        first
    } else {
        second
    }
}

fn resolve_zoned_datetime(
    time_zone: Tz,
    local_datetime: chrono::NaiveDateTime,
) -> Result<DateTime<Tz>, String> {
    match time_zone.from_local_datetime(&local_datetime) {
        LocalResult::Single(value) => Ok(value),
        LocalResult::Ambiguous(first, second) => Ok(choose_earlier(first, second)),
        LocalResult::None => {
            let before = (1..=180).find_map(|minutes| {
                let candidate =
                    local_datetime.checked_sub_signed(ChronoDuration::minutes(minutes))?;
                match time_zone.from_local_datetime(&candidate) {
                    LocalResult::Single(value) => Some(value),
                    LocalResult::Ambiguous(first, second) => Some(choose_earlier(first, second)),
                    LocalResult::None => None,
                }
            });
            let after = (1..=180).find_map(|minutes| {
                let candidate =
                    local_datetime.checked_add_signed(ChronoDuration::minutes(minutes))?;
                match time_zone.from_local_datetime(&candidate) {
                    LocalResult::Single(value) => Some(value),
                    LocalResult::Ambiguous(first, second) => Some(choose_earlier(first, second)),
                    LocalResult::None => None,
                }
            });
            let (before, after) = before
                .zip(after)
                .ok_or_else(|| "The next recurring due time could not be calculated".to_string())?;
            let offset_change =
                after.offset().fix().local_minus_utc() - before.offset().fix().local_minus_utc();
            if offset_change <= 0 {
                return Err("The next recurring due time could not be calculated".to_string());
            }
            let adjusted = local_datetime
                .checked_add_signed(ChronoDuration::seconds(i64::from(offset_change)))
                .ok_or_else(|| "The next recurring due time could not be calculated".to_string())?;
            match time_zone.from_local_datetime(&adjusted) {
                LocalResult::Single(value) => Ok(value),
                LocalResult::Ambiguous(first, second) => Ok(choose_earlier(first, second)),
                LocalResult::None => {
                    Err("The next recurring due time could not be calculated".to_string())
                }
            }
        }
    }
}

fn next_recurring_due_at(
    due_at: &str,
    recurrence: &str,
    recurrence_time_zone: &str,
    now: DateTime<Utc>,
) -> Result<String, String> {
    let days = match recurrence {
        "daily" => 1,
        "weekly" => 7,
        _ => return Err("Backlog recurrence is invalid".to_string()),
    };
    let time_zone = parse_recurrence_time_zone(recurrence, recurrence_time_zone)?
        .ok_or_else(|| "Backlog recurrence time zone is invalid".to_string())?;
    let due_utc = DateTime::parse_from_rfc3339(due_at)
        .map_err(|_| "Due time is invalid".to_string())?
        .with_timezone(&Utc);
    let mut next_local = due_utc.with_timezone(&time_zone);

    for _ in 0..10_000 {
        let next_naive = next_local
            .naive_local()
            .checked_add_days(Days::new(days))
            .ok_or_else(|| "The next recurring due time could not be calculated".to_string())?;
        next_local = resolve_zoned_datetime(time_zone, next_naive)?;
        let next_utc = next_local.with_timezone(&Utc);
        if next_utc > now {
            return Ok(next_utc.to_rfc3339_opts(SecondsFormat::Millis, true));
        }
    }

    Err("The next recurring due time could not be calculated".to_string())
}

async fn create_on_connection(
    connection: &mut SqliteConnection,
    input: &CreateCampaignBacklogItemInput,
) -> Result<CampaignBacklogMutationResult, String> {
    parse_recurrence_time_zone(&input.recurrence, &input.recurrence_timezone)?;
    let mut transaction = begin_transaction(connection).await?;
    ensure_campaign_mutable(&mut transaction, input.campaign_id).await?;

    let result = sqlx::query(
        "INSERT INTO campaign_backlog_items (
             campaign_id, work_type, title, details, owner_type, status,
             due_at, recurrence, recurrence_timezone, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?7, ?8,
             strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(input.campaign_id)
    .bind(&input.work_type)
    .bind(&input.title)
    .bind(&input.details)
    .bind(&input.owner_type)
    .bind(&input.due_at)
    .bind(&input.recurrence)
    .bind(&input.recurrence_timezone)
    .execute(&mut *transaction)
    .await
    .map_err(|_| "Could not create backlog item".to_string())?;

    let item_id = result.last_insert_rowid();
    let item = read_item_detail(&mut transaction, item_id).await?;
    transaction
        .commit()
        .await
        .map_err(|_| "Could not commit backlog item creation".to_string())?;
    Ok(CampaignBacklogMutationResult { item })
}

async fn update_on_connection(
    connection: &mut SqliteConnection,
    input: &UpdateCampaignBacklogItemInput,
) -> Result<CampaignBacklogMutationResult, String> {
    parse_recurrence_time_zone(&input.recurrence, &input.recurrence_timezone)?;
    let mut transaction = begin_transaction(connection).await?;
    let current = read_mutable_item(&mut transaction, input.id).await?;
    if !OPEN_STATUSES.contains(&current.status.as_str()) {
        return Err("Completed and cancelled backlog items cannot be edited".to_string());
    }

    let result = sqlx::query(
        "UPDATE campaign_backlog_items
         SET work_type = ?1, title = ?2, details = ?3, owner_type = ?4,
             due_at = ?5, recurrence = ?6, recurrence_timezone = ?7,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?8 AND status = ?9",
    )
    .bind(&input.work_type)
    .bind(&input.title)
    .bind(&input.details)
    .bind(&input.owner_type)
    .bind(&input.due_at)
    .bind(&input.recurrence)
    .bind(&input.recurrence_timezone)
    .bind(input.id)
    .bind(&current.status)
    .execute(&mut *transaction)
    .await
    .map_err(|_| "Could not update backlog item".to_string())?;

    if result.rows_affected() != 1 {
        return Err("Backlog item changed before it could be saved".to_string());
    }
    let item = read_item_detail(&mut transaction, input.id).await?;
    transaction
        .commit()
        .await
        .map_err(|_| "Could not commit backlog item update".to_string())?;
    Ok(CampaignBacklogMutationResult { item })
}

async fn set_status_on_connection(
    connection: &mut SqliteConnection,
    input: &SetCampaignBacklogItemStatusInput,
    now: DateTime<Utc>,
) -> Result<CampaignBacklogStatusMutationResult, String> {
    let mut transaction = begin_transaction(connection).await?;
    let current = read_mutable_item(&mut transaction, input.id).await?;
    if !OPEN_STATUSES.contains(&current.status.as_str()) {
        return Err("Completed and cancelled backlog items are final".to_string());
    }
    if !transition_is_allowed(&current.status, &input.status) {
        return Err(format!(
            "Backlog item cannot move from {} to {}",
            current.status, input.status
        ));
    }

    let terminal_timestamp = now.to_rfc3339_opts(SecondsFormat::Millis, true);
    let completed_at = (input.status == "completed").then_some(terminal_timestamp.as_str());
    let cancelled_at = (input.status == "cancelled").then_some(terminal_timestamp.as_str());
    let result = sqlx::query(
        "UPDATE campaign_backlog_items
         SET status = ?1, completed_at = ?2, cancelled_at = ?3,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?4 AND status = ?5",
    )
    .bind(&input.status)
    .bind(completed_at)
    .bind(cancelled_at)
    .bind(input.id)
    .bind(&current.status)
    .execute(&mut *transaction)
    .await
    .map_err(|_| "Could not update backlog item status".to_string())?;

    if result.rows_affected() != 1 {
        return Err("Backlog item changed before its status could be updated".to_string());
    }

    let successor_id = if input.status == "completed" && current.recurrence != "none" {
        let next_due_at = next_recurring_due_at(
            &current.due_at,
            &current.recurrence,
            &current.recurrence_timezone,
            now,
        )?;
        let successor = sqlx::query(
            "INSERT INTO campaign_backlog_items (
                 campaign_id, recurrence_parent_id, work_type, title, details,
                 owner_type, status, due_at, recurrence, recurrence_timezone, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?8, ?9,
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        )
        .bind(current.campaign_id)
        .bind(current.id)
        .bind(&current.work_type)
        .bind(&current.title)
        .bind(&current.details)
        .bind(&current.owner_type)
        .bind(next_due_at)
        .bind(&current.recurrence)
        .bind(&current.recurrence_timezone)
        .execute(&mut *transaction)
        .await
        .map_err(|_| "Could not create recurring backlog successor".to_string())?;
        Some(successor.last_insert_rowid())
    } else {
        None
    };

    let item = read_item_detail(&mut transaction, input.id).await?;
    let successor = match successor_id {
        Some(successor_id) => Some(read_item_detail(&mut transaction, successor_id).await?),
        None => None,
    };
    transaction
        .commit()
        .await
        .map_err(|_| "Could not commit backlog status update".to_string())?;
    Ok(CampaignBacklogStatusMutationResult { item, successor })
}

#[tauri::command]
pub async fn linkgo_campaign_backlog_create(
    app: AppHandle,
    input: CreateCampaignBacklogItemInput,
) -> Result<CampaignBacklogMutationResult, String> {
    let mut connection = open_connection(&app).await?;
    create_on_connection(&mut connection, &input).await
}

#[tauri::command]
pub async fn linkgo_campaign_backlog_update(
    app: AppHandle,
    input: UpdateCampaignBacklogItemInput,
) -> Result<CampaignBacklogMutationResult, String> {
    let mut connection = open_connection(&app).await?;
    update_on_connection(&mut connection, &input).await
}

#[tauri::command]
pub async fn linkgo_campaign_backlog_set_status(
    app: AppHandle,
    input: SetCampaignBacklogItemStatusInput,
) -> Result<CampaignBacklogStatusMutationResult, String> {
    let mut connection = open_connection(&app).await?;
    set_status_on_connection(&mut connection, &input, Utc::now()).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations;
    use sqlx::{sqlite::SqlitePoolOptions, Executor, SqlitePool};
    use tauri_plugin_sql::MigrationKind;

    async fn migrated_pool(_test_name: &str) -> SqlitePool {
        let options = SqliteConnectOptions::new()
            .in_memory(true)
            .foreign_keys(true)
            .busy_timeout(Duration::from_secs(5));
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .expect("campaign backlog test database should open");
        pool.execute(
            "CREATE TABLE campaigns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft'
                    CHECK(status IN ('draft', 'active', 'paused', 'archived'))
            )",
        )
        .await
        .expect("campaign prerequisite should be created");
        for migration in migrations::campaign_backlog::migrations()
            .into_iter()
            .filter(|migration| matches!(migration.kind, MigrationKind::Up))
        {
            pool.execute(migration.sql)
                .await
                .expect("campaign backlog migration should execute");
        }
        pool
    }

    async fn seed_campaign(pool: &SqlitePool, status: &str) {
        sqlx::query("INSERT INTO campaigns (id, name, status) VALUES (1, 'Launch', ?1)")
            .bind(status)
            .execute(pool)
            .await
            .expect("campaign should insert");
    }

    async fn seed_recurring_item(pool: &SqlitePool) {
        sqlx::query(
            "INSERT INTO campaign_backlog_items
             (id, campaign_id, work_type, title, details, owner_type, status, due_at, recurrence, recurrence_timezone)
             VALUES (10, 1, 'research', 'Review market', 'Keep context', 'operator',
                     'pending', '2026-07-20T09:30:00.000Z', 'daily', 'America/New_York')",
        )
        .execute(pool)
        .await
        .expect("recurring item should insert");
    }

    #[test]
    fn campaign_backlog_recurrence_uses_stored_zone_across_dst() {
        let before_spring = DateTime::parse_from_rfc3339("2026-03-07T15:00:00.000Z")
            .expect("test timestamp should parse")
            .with_timezone(&Utc);
        assert_eq!(
            next_recurring_due_at(
                "2026-03-07T14:00:00.000Z",
                "daily",
                "America/New_York",
                before_spring,
            )
            .expect("spring successor should resolve"),
            "2026-03-08T13:00:00.000Z"
        );

        let before_fall = DateTime::parse_from_rfc3339("2026-10-31T06:00:00.000Z")
            .expect("test timestamp should parse")
            .with_timezone(&Utc);
        assert_eq!(
            next_recurring_due_at(
                "2026-10-31T05:30:00.000Z",
                "daily",
                "America/New_York",
                before_fall,
            )
            .expect("ambiguous successor should resolve"),
            "2026-11-01T05:30:00.000Z"
        );
    }

    #[test]
    fn campaign_backlog_nonexistent_wall_time_shifts_forward_by_the_gap() {
        let now = DateTime::parse_from_rfc3339("2026-03-07T08:00:00.000Z")
            .expect("test timestamp should parse")
            .with_timezone(&Utc);
        assert_eq!(
            next_recurring_due_at("2026-03-07T07:30:00.000Z", "daily", "America/New_York", now,)
                .expect("nonexistent successor should resolve"),
            "2026-03-08T07:30:00.000Z"
        );
    }

    #[test]
    fn campaign_backlog_successor_failure_rolls_back_completion() {
        tauri::async_runtime::block_on(async {
            let pool = migrated_pool("rollback").await;
            seed_campaign(&pool, "active").await;
            seed_recurring_item(&pool).await;
            pool.execute(
                "CREATE TRIGGER fail_campaign_backlog_successor
                 BEFORE INSERT ON campaign_backlog_items
                 WHEN NEW.recurrence_parent_id IS NOT NULL
                 BEGIN
                     SELECT RAISE(ABORT, 'injected successor failure');
                 END",
            )
            .await
            .expect("failure trigger should be created");

            let mut connection = pool
                .acquire()
                .await
                .expect("connection should be available");
            let result = set_status_on_connection(
                &mut connection,
                &SetCampaignBacklogItemStatusInput {
                    id: 10,
                    status: "completed".to_string(),
                },
                DateTime::parse_from_rfc3339("2026-07-28T12:00:00.000Z")
                    .expect("test timestamp should parse")
                    .with_timezone(&Utc),
            )
            .await;
            assert_eq!(
                result.expect_err("successor insertion should fail"),
                "Could not create recurring backlog successor"
            );
            drop(connection);

            let status: String =
                sqlx::query_scalar("SELECT status FROM campaign_backlog_items WHERE id = 10")
                    .fetch_one(&pool)
                    .await
                    .expect("item status should be readable");
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM campaign_backlog_items")
                .fetch_one(&pool)
                .await
                .expect("item count should be readable");
            assert_eq!(status, "pending");
            assert_eq!(count, 1);
            pool.close().await;
        });
    }

    #[test]
    fn campaign_backlog_concurrent_status_compare_and_set_creates_one_successor() {
        tauri::async_runtime::block_on(async {
            let pool = migrated_pool("concurrent").await;
            seed_campaign(&pool, "active").await;
            seed_recurring_item(&pool).await;
            let now = DateTime::parse_from_rfc3339("2026-07-28T12:00:00.000Z")
                .expect("test timestamp should parse")
                .with_timezone(&Utc);

            let run_mutation = |pool: SqlitePool| {
                tauri::async_runtime::spawn(async move {
                    let mut connection = pool
                        .acquire()
                        .await
                        .expect("connection should be available");
                    set_status_on_connection(
                        &mut connection,
                        &SetCampaignBacklogItemStatusInput {
                            id: 10,
                            status: "completed".to_string(),
                        },
                        now,
                    )
                    .await
                })
            };
            let first = run_mutation(pool.clone());
            let second = run_mutation(pool.clone());
            let first_result = first.await.expect("first mutation task should finish");
            let second_result = second.await.expect("second mutation task should finish");
            assert_eq!(
                usize::from(first_result.is_ok()) + usize::from(second_result.is_ok()),
                1
            );

            let successor_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM campaign_backlog_items WHERE recurrence_parent_id = 10",
            )
            .fetch_one(&pool)
            .await
            .expect("successor count should be readable");
            assert_eq!(successor_count, 1);
            pool.close().await;
        });
    }

    #[test]
    fn campaign_backlog_archived_campaign_rejects_all_mutations() {
        tauri::async_runtime::block_on(async {
            let pool = migrated_pool("archived").await;
            seed_campaign(&pool, "archived").await;
            seed_recurring_item(&pool).await;

            let create_input = CreateCampaignBacklogItemInput {
                campaign_id: 1,
                work_type: "other".to_string(),
                title: "Blocked create".to_string(),
                details: String::new(),
                owner_type: "operator".to_string(),
                due_at: "2026-07-30T09:30:00.000Z".to_string(),
                recurrence: "none".to_string(),
                recurrence_timezone: String::new(),
            };
            let update_input = UpdateCampaignBacklogItemInput {
                id: 10,
                work_type: "other".to_string(),
                title: "Blocked update".to_string(),
                details: String::new(),
                owner_type: "operator".to_string(),
                due_at: "2026-07-30T09:30:00.000Z".to_string(),
                recurrence: "none".to_string(),
                recurrence_timezone: String::new(),
            };
            let status_input = SetCampaignBacklogItemStatusInput {
                id: 10,
                status: "in_progress".to_string(),
            };

            for error in [
                {
                    let mut connection = pool
                        .acquire()
                        .await
                        .expect("connection should be available");
                    create_on_connection(&mut connection, &create_input)
                        .await
                        .expect_err("archived create should fail")
                },
                {
                    let mut connection = pool
                        .acquire()
                        .await
                        .expect("connection should be available");
                    update_on_connection(&mut connection, &update_input)
                        .await
                        .expect_err("archived update should fail")
                },
                {
                    let mut connection = pool
                        .acquire()
                        .await
                        .expect("connection should be available");
                    set_status_on_connection(&mut connection, &status_input, Utc::now())
                        .await
                        .expect_err("archived status should fail")
                },
            ] {
                assert_eq!(error, "Archived campaigns are read-only");
            }

            let row: (String, String) =
                sqlx::query_as("SELECT title, status FROM campaign_backlog_items WHERE id = 10")
                    .fetch_one(&pool)
                    .await
                    .expect("item should remain readable");
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM campaign_backlog_items")
                .fetch_one(&pool)
                .await
                .expect("item count should be readable");
            assert_eq!(row, ("Review market".to_string(), "pending".to_string()));
            assert_eq!(count, 1);
            pool.close().await;
        });
    }
}
