use super::*;
use chrono::TimeZone;
use sqlx::Executor;

fn at(hour: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 25, hour, 0, 0).unwrap()
}

fn backups(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(dir.join(BACKUP_DIR))
        .map(|entries| {
            entries
                .filter_map(|entry| entry.ok())
                .filter_map(|entry| entry.file_name().into_string().ok())
                .collect()
        })
        .unwrap_or_default();
    names.sort();
    names
}

/// Database at `version` with one canary row in a user table.
async fn database(dir: &Path, version: i64) -> PathBuf {
    let path = dir.join("linkgo.db");
    let options = SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(true);
    let mut connection = SqliteConnection::connect_with(&options).await.unwrap();
    connection
        .execute(
            "CREATE TABLE canary (id INTEGER PRIMARY KEY, note TEXT NOT NULL);
             INSERT INTO canary (note) VALUES ('keep me');
             CREATE TABLE _sqlx_migrations (version BIGINT PRIMARY KEY);",
        )
        .await
        .unwrap();
    for applied in 1..=version {
        sqlx::query("INSERT INTO _sqlx_migrations (version) VALUES (?1)")
            .bind(applied)
            .execute(&mut connection)
            .await
            .unwrap();
    }
    connection.close().await.unwrap();
    path
}

async fn canary(path: &Path) -> String {
    let options = SqliteConnectOptions::new().filename(path);
    let mut connection = SqliteConnection::connect_with(&options).await.unwrap();
    sqlx::query_scalar("SELECT note FROM canary")
        .fetch_one(&mut connection)
        .await
        .unwrap()
}

#[tokio::test]
async fn pre_migration_snapshot_copies_data_when_migrations_are_pending() {
    let dir = tempfile::tempdir().unwrap();
    let db = database(dir.path(), 3).await;
    let target = backup_before_migration(&db, 5, at(9))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        target.file_name().unwrap().to_str().unwrap(),
        "linkgo-pre-migration-v3-20261025T090000Z.db"
    );
    assert_eq!(canary(&target).await, "keep me");
}

#[tokio::test]
async fn pre_migration_snapshot_skips_current_new_and_missing_databases() {
    let dir = tempfile::tempdir().unwrap();
    let missing = dir.path().join("linkgo.db");
    assert_eq!(
        backup_before_migration(&missing, 5, at(9)).await.unwrap(),
        None
    );
    assert!(!missing.exists(), "backup must not create the database");

    let db = database(dir.path(), 5).await;
    assert_eq!(backup_before_migration(&db, 5, at(9)).await.unwrap(), None);

    let empty_dir = tempfile::tempdir().unwrap();
    let empty = empty_dir.path().join("linkgo.db");
    std::fs::write(&empty, b"").unwrap();
    assert_eq!(
        backup_before_migration(&empty, 5, at(9)).await.unwrap(),
        None
    );
    assert!(backups(empty_dir.path()).is_empty());
    assert!(backups(dir.path()).is_empty());
}

#[tokio::test]
async fn pre_migration_snapshots_keep_only_the_newest() {
    let dir = tempfile::tempdir().unwrap();
    let db = database(dir.path(), 1).await;
    for hour in 0..(PRE_MIGRATION_KEEP as u32 + 2) {
        backup_before_migration(&db, 2, at(hour)).await.unwrap();
    }
    let names = backups(dir.path());
    assert_eq!(names.len(), PRE_MIGRATION_KEEP);
    assert_eq!(names[0], "linkgo-pre-migration-v1-20261025T020000Z.db");
}

#[tokio::test]
async fn daily_snapshot_runs_once_per_24_hours_and_prunes() {
    let dir = tempfile::tempdir().unwrap();
    let db = database(dir.path(), 1).await;
    // Unrelated files in the folder are never pruned.
    std::fs::create_dir_all(dir.path().join(BACKUP_DIR)).unwrap();
    std::fs::write(dir.path().join(BACKUP_DIR).join("manual-copy.db"), b"x").unwrap();

    let first = backup_daily(&db, at(1)).await.unwrap().unwrap();
    assert_eq!(canary(&first).await, "keep me");
    assert_eq!(backup_daily(&db, at(23)).await.unwrap(), None);

    let mut day = at(1);
    for _ in 0..DAILY_KEEP {
        day += TimeDelta::hours(24);
        assert!(backup_daily(&db, day).await.unwrap().is_some());
    }
    let names = backups(dir.path());
    let daily: Vec<&String> = names
        .iter()
        .filter(|n| n.starts_with(DAILY_PREFIX))
        .collect();
    assert_eq!(daily.len(), DAILY_KEEP);
    assert_eq!(daily[0].as_str(), "linkgo-daily-20261026T010000Z.db");
    assert!(names.contains(&"manual-copy.db".to_string()));
}

#[tokio::test]
async fn daily_snapshot_skips_missing_database() {
    let dir = tempfile::tempdir().unwrap();
    let missing = dir.path().join("linkgo.db");
    assert_eq!(backup_daily(&missing, at(1)).await.unwrap(), None);
    assert!(!missing.exists());
}
