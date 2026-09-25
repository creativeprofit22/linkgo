//! Shared real-SQLite fixtures for native capability tests.
//!
//! Each fixture is a fully migrated file database in a temp directory (so
//! concurrent pooled connections see the same data), plus helpers to snapshot
//! tables for rollback equality and to inject write failures via triggers.

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{Executor, SqlitePool};
use std::time::Duration;
use tempfile::TempDir;

pub(crate) struct Fixture {
    _directory: TempDir,
    pub pool: SqlitePool,
}

/// Opens a fresh database with every production migration applied.
pub(crate) async fn migrated() -> Fixture {
    let directory = tempfile::tempdir().unwrap();
    let options = SqliteConnectOptions::new()
        .filename(directory.path().join("linkgo-test.db"))
        .create_if_missing(true)
        .foreign_keys(true)
        // Tests never need to survive a crash, so skip fsync: on Windows each
        // synced migration commit made a fixture take 30-50s. Locking,
        // rollback and BEGIN IMMEDIATE behavior are unchanged.
        .synchronous(SqliteSynchronous::Off)
        .busy_timeout(Duration::from_secs(10));
    crate::migrations::migrate_database(&options).await.unwrap();
    let pool = SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(options)
        .await
        .unwrap();
    Fixture {
        _directory: directory,
        pool,
    }
}

/// Runs a multi-statement seed script.
pub(crate) async fn seed(pool: &SqlitePool, sql: &str) {
    pool.execute(sql).await.unwrap();
}

pub(crate) async fn number(pool: &SqlitePool, sql: &str) -> i64 {
    sqlx::query_scalar(sql).fetch_one(pool).await.unwrap()
}

pub(crate) async fn text(pool: &SqlitePool, sql: &str) -> String {
    sqlx::query_scalar(sql).fetch_one(pool).await.unwrap()
}

pub(crate) async fn count(pool: &SqlitePool, table: &str) -> i64 {
    number(pool, &format!("SELECT COUNT(*) FROM {table}")).await
}

/// Serialises every row of `tables` so tests can assert full rollback.
pub(crate) async fn snapshot(pool: &SqlitePool, tables: &[&str]) -> Vec<String> {
    let mut rows = Vec::new();
    for table in tables {
        let columns: Vec<String> =
            sqlx::query_scalar(&format!("SELECT name FROM pragma_table_info('{table}')"))
                .fetch_all(pool)
                .await
                .unwrap();
        assert!(!columns.is_empty(), "unknown snapshot table {table}");
        let sql = format!(
            "SELECT COALESCE(json_group_array(json_array({})), '[]') FROM (SELECT * FROM {table} ORDER BY rowid)",
            columns.join(",")
        );
        rows.push(format!("{table}:{}", text(pool, &sql).await));
    }
    rows
}

/// Installs a trigger that aborts the matching write, e.g.
/// `"BEFORE INSERT ON safety_audit_events"`.
pub(crate) async fn fail_on(pool: &SqlitePool, timing_and_target: &str) {
    pool.execute(
        format!(
            "DROP TRIGGER IF EXISTS inject_failure;
             CREATE TRIGGER inject_failure {timing_and_target} BEGIN SELECT RAISE(ABORT, 'private injected failure'); END;"
        )
        .as_str(),
    )
    .await
    .unwrap();
}

#[tokio::test]
async fn fixture_snapshot_detects_changes_and_fail_on_aborts_writes() {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Fixture','active',5);",
    )
    .await;
    let before = snapshot(&f.pool, &["campaigns"]).await;
    fail_on(&f.pool, "BEFORE UPDATE ON campaigns").await;
    assert!(sqlx::query("UPDATE campaigns SET name='X' WHERE id=1")
        .execute(&f.pool)
        .await
        .is_err());
    assert_eq!(snapshot(&f.pool, &["campaigns"]).await, before);
    f.pool.execute("DROP TRIGGER inject_failure").await.unwrap();
    sqlx::query("UPDATE campaigns SET name='X' WHERE id=1")
        .execute(&f.pool)
        .await
        .unwrap();
    assert_ne!(snapshot(&f.pool, &["campaigns"]).await, before);
    assert_eq!(count(&f.pool, "campaigns").await, 1);
}
