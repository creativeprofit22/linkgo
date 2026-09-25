//! Native app-settings persistence for the launch-on-login mirror.
//!
//! The OS autostart state is still read/changed by the renderer through the
//! autostart plugin (never inside a database transaction); these commands only
//! persist the mirrored result in the singleton `app_settings` row.
//! Timestamps use the renderer's previous `toISOString()` format.

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqliteConnection, SqlitePool};
use tauri::State;

use crate::db_transaction::{settle, Settlement};

const STORAGE_ERROR: &str = "Could not save app settings";
const MAX_ERROR_LENGTH: usize = 500;
const ISO_NOW: &str = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyncLaunchOnLoginInput {
    pub os_enabled: bool,
    /// `None` keeps the stored error; `Some` replaces it.
    #[serde(default)]
    pub last_error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecordLaunchOnLoginErrorInput {
    pub message: String,
}

/// Mirrors the renderer `AppSettingsRow` shape.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct AppSettingsRow {
    pub id: i64,
    pub launch_on_login_enabled: i64,
    pub launch_on_login_last_synced_at: Option<String>,
    pub launch_on_login_last_error: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Truncates to at most `MAX_ERROR_LENGTH` UTF-16 units without splitting a
/// character. Error text is diagnostic, so it is bounded rather than rejected.
fn bounded_error(message: &str) -> String {
    let mut units = 0;
    let mut out = String::new();
    for character in message.chars() {
        units += character.len_utf16();
        if units > MAX_ERROR_LENGTH {
            break;
        }
        out.push(character);
    }
    out
}

fn storage_error(_: sqlx::Error) -> String {
    STORAGE_ERROR.to_string()
}

async fn ensure_row(connection: &mut SqliteConnection) -> Result<(), String> {
    sqlx::query("INSERT OR IGNORE INTO app_settings (id) VALUES (1)")
        .execute(&mut *connection)
        .await
        .map_err(storage_error)?;
    Ok(())
}

async fn load_row(connection: &mut SqliteConnection) -> Result<AppSettingsRow, String> {
    let row = sqlx::query(
        "SELECT id, launch_on_login_enabled, launch_on_login_last_synced_at,
                launch_on_login_last_error, created_at, updated_at
         FROM app_settings WHERE id = 1 LIMIT 1",
    )
    .fetch_one(&mut *connection)
    .await
    .map_err(storage_error)?;
    Ok(AppSettingsRow {
        id: row.get("id"),
        launch_on_login_enabled: row.get("launch_on_login_enabled"),
        launch_on_login_last_synced_at: row.get("launch_on_login_last_synced_at"),
        launch_on_login_last_error: row.get("launch_on_login_last_error"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

pub(crate) async fn sync_launch_on_login(
    pool: &SqlitePool,
    input: SyncLaunchOnLoginInput,
) -> Result<AppSettingsRow, String> {
    let enabled = i64::from(input.os_enabled);
    let last_error = input.last_error.as_deref().map(bounded_error);
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            ensure_row(connection).await?;
            let sql = format!(
                "UPDATE app_settings
                 SET launch_on_login_enabled = ?1,
                     launch_on_login_last_synced_at = {ISO_NOW},
                     launch_on_login_last_error = COALESCE(?2, launch_on_login_last_error),
                     updated_at = {ISO_NOW}
                 WHERE id = 1"
            );
            sqlx::query(&sql)
                .bind(enabled)
                .bind(last_error.as_deref())
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
            Ok(Settlement::Accepted(load_row(connection).await?))
        })
    })
    .await
}

pub(crate) async fn record_launch_on_login_error(
    pool: &SqlitePool,
    input: RecordLaunchOnLoginErrorInput,
) -> Result<(), String> {
    let message = bounded_error(&input.message);
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            ensure_row(connection).await?;
            let sql = format!(
                "UPDATE app_settings
                 SET launch_on_login_last_error = ?1, updated_at = {ISO_NOW}
                 WHERE id = 1"
            );
            sqlx::query(&sql)
                .bind(&message)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
            Ok(Settlement::Accepted(()))
        })
    })
    .await
}

#[tauri::command]
pub async fn linkgo_settings_launch_on_login_sync(
    pool: State<'_, SqlitePool>,
    input: SyncLaunchOnLoginInput,
) -> Result<AppSettingsRow, String> {
    sync_launch_on_login(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_settings_launch_on_login_error_record(
    pool: State<'_, SqlitePool>,
    input: RecordLaunchOnLoginErrorInput,
) -> Result<(), String> {
    record_launch_on_login_error(pool.inner(), input).await
}

#[cfg(test)]
#[path = "settings_tests.rs"]
mod tests;
