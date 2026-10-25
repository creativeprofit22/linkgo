//! Automatic local snapshots of the Linkgo SQLite database.
//!
//! Linkgo keeps the only copy of campaign, approval and publish history in
//! one local file. Two snapshot kinds are written with `VACUUM INTO` (a
//! consistent copy that is safe while the file is open) into a `backups`
//! folder next to the database:
//!
//! - `pre-migration`: taken before startup applies pending migrations to an
//!   existing database. Failure stops startup so an upgrade never runs
//!   without a way back.
//! - `daily`: taken at most once every 24 hours on startup.
//!
//! Each kind keeps its newest files only (`PRE_MIGRATION_KEEP` / `DAILY_KEEP`);
//! pruning only touches files this module named. Restoring is the manual
//! procedure in `docs/operations/backup-restore.md`.

use chrono::{DateTime, NaiveDateTime, TimeDelta, Utc};
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{Connection, SqliteConnection};
use std::path::{Path, PathBuf};

pub(crate) const BACKUP_DIR: &str = "backups";
pub(crate) const PRE_MIGRATION_KEEP: usize = 5;
pub(crate) const DAILY_KEEP: usize = 7;
const STAMP_FORMAT: &str = "%Y%m%dT%H%M%SZ";
const PRE_MIGRATION_PREFIX: &str = "linkgo-pre-migration-";
const DAILY_PREFIX: &str = "linkgo-daily-";

/// Snapshot an existing database before pending migrations run.
/// Returns the snapshot path, or `None` when there is nothing to protect
/// (no file yet, an empty new database, or no pending migrations).
pub(crate) async fn backup_before_migration(
    db_path: &Path,
    latest_version: i64,
    now: DateTime<Utc>,
) -> Result<Option<PathBuf>, String> {
    let Some(mut connection) = open_existing(db_path).await? else {
        return Ok(None);
    };
    let has_user_tables: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .fetch_one(&mut connection)
    .await
    .map_err(|error| format!("Could not inspect Linkgo database before backup: {error}"))?;
    if has_user_tables == 0 {
        return Ok(None);
    }
    let applied = applied_version(&mut connection).await?;
    if applied >= latest_version {
        return Ok(None);
    }
    let name = format!(
        "{PRE_MIGRATION_PREFIX}v{applied}-{}.db",
        now.format(STAMP_FORMAT)
    );
    let target = snapshot(&mut connection, db_path, &name).await?;
    prune(db_path, PRE_MIGRATION_PREFIX, PRE_MIGRATION_KEEP)?;
    Ok(Some(target))
}

/// Snapshot the database when the newest daily snapshot is at least 24
/// hours old (or missing). Returns the snapshot path when one was written.
pub(crate) async fn backup_daily(
    db_path: &Path,
    now: DateTime<Utc>,
) -> Result<Option<PathBuf>, String> {
    let newest = list(db_path, DAILY_PREFIX)?
        .last()
        .and_then(|name| parse_stamp(name, DAILY_PREFIX));
    if newest.is_some_and(|taken| now - taken < TimeDelta::hours(24)) {
        return Ok(None);
    }
    let Some(mut connection) = open_existing(db_path).await? else {
        return Ok(None);
    };
    let name = format!("{DAILY_PREFIX}{}.db", now.format(STAMP_FORMAT));
    let target = snapshot(&mut connection, db_path, &name).await?;
    prune(db_path, DAILY_PREFIX, DAILY_KEEP)?;
    Ok(Some(target))
}

fn backup_dir(db_path: &Path) -> PathBuf {
    db_path
        .parent()
        .map(|parent| parent.join(BACKUP_DIR))
        .unwrap_or_else(|| PathBuf::from(BACKUP_DIR))
}

async fn open_existing(db_path: &Path) -> Result<Option<SqliteConnection>, String> {
    if !db_path.is_file() {
        return Ok(None);
    }
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(false);
    SqliteConnection::connect_with(&options)
        .await
        .map(Some)
        .map_err(|error| format!("Could not open Linkgo database for backup: {error}"))
}

async fn applied_version(connection: &mut SqliteConnection) -> Result<i64, String> {
    let has_table: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table' AND name = '_sqlx_migrations'",
    )
    .fetch_one(&mut *connection)
    .await
    .map_err(|error| format!("Could not inspect Linkgo migrations before backup: {error}"))?;
    if has_table == 0 {
        return Ok(0);
    }
    sqlx::query_scalar("SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations")
        .fetch_one(&mut *connection)
        .await
        .map_err(|error| format!("Could not read Linkgo migration version: {error}"))
}

async fn snapshot(
    connection: &mut SqliteConnection,
    db_path: &Path,
    name: &str,
) -> Result<PathBuf, String> {
    let dir = backup_dir(db_path);
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create Linkgo backup folder: {error}"))?;
    let target = dir.join(name);
    if target.exists() {
        return Err(format!("Linkgo backup {} already exists", target.display()));
    }
    let target_text = target
        .to_str()
        .ok_or_else(|| "Linkgo backup path is not valid UTF-8".to_string())?;
    sqlx::query("VACUUM INTO ?1")
        .bind(target_text)
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Could not write Linkgo backup: {error}"))?;
    Ok(target)
}

/// Snapshot names of one kind, oldest first (the UTC stamp sorts by name).
fn list(db_path: &Path, prefix: &str) -> Result<Vec<String>, String> {
    let dir = backup_dir(db_path);
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let entries = std::fs::read_dir(&dir)
        .map_err(|error| format!("Could not read Linkgo backup folder: {error}"))?;
    let mut names: Vec<String> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_file())
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| parse_stamp(name, prefix).is_some())
        .collect();
    names.sort_by_key(|name| parse_stamp(name, prefix));
    Ok(names)
}

fn parse_stamp(name: &str, prefix: &str) -> Option<DateTime<Utc>> {
    let rest = name.strip_prefix(prefix)?.strip_suffix(".db")?;
    // Pre-migration names carry `v<version>-` before the stamp.
    let stamp = rest.rsplit('-').next()?;
    NaiveDateTime::parse_from_str(stamp, STAMP_FORMAT)
        .ok()
        .map(|naive| naive.and_utc())
}

fn prune(db_path: &Path, prefix: &str, keep: usize) -> Result<(), String> {
    let names = list(db_path, prefix)?;
    let excess = names.len().saturating_sub(keep);
    let dir = backup_dir(db_path);
    for name in names.iter().take(excess) {
        std::fs::remove_file(dir.join(name))
            .map_err(|error| format!("Could not prune old Linkgo backup: {error}"))?;
    }
    Ok(())
}

#[cfg(test)]
#[path = "db_backup_tests.rs"]
mod tests;
