use super::*;
use crate::test_support::{count, fail_on, migrated, seed, snapshot};

const TABLES: &[&str] = &["app_settings"];

fn sync(os_enabled: bool, last_error: Option<&str>) -> SyncLaunchOnLoginInput {
    SyncLaunchOnLoginInput {
        os_enabled,
        last_error: last_error.map(str::to_string),
    }
}

#[test]
fn rejects_unknown_fields() {
    assert!(serde_json::from_value::<SyncLaunchOnLoginInput>(
        serde_json::json!({ "osEnabled": true, "extra": 1 })
    )
    .is_err());
    assert!(serde_json::from_value::<RecordLaunchOnLoginErrorInput>(
        serde_json::json!({ "message": "x", "extra": 1 })
    )
    .is_err());
}

#[test]
fn bounds_error_text_without_splitting_characters() {
    assert_eq!(bounded_error(&"x".repeat(600)).len(), 500);
    // 499 ASCII units + a 2-unit emoji would be 501, so the emoji is dropped.
    let message = format!("{}😀tail", "x".repeat(499));
    assert_eq!(bounded_error(&message), "x".repeat(499));
}

#[tokio::test]
async fn sync_recreates_missing_row_and_mirrors_os_state() {
    let f = migrated().await;
    seed(&f.pool, "DELETE FROM app_settings;").await;
    let row = sync_launch_on_login(&f.pool, sync(true, None))
        .await
        .unwrap();
    assert_eq!(row.id, 1);
    assert_eq!(row.launch_on_login_enabled, 1);
    assert_eq!(row.launch_on_login_last_error, "");
    let synced_at = row.launch_on_login_last_synced_at.unwrap();
    assert!(
        synced_at.ends_with('Z') && synced_at.contains('T'),
        "{synced_at}"
    );
    assert_eq!(count(&f.pool, "app_settings").await, 1);
}

#[tokio::test]
async fn sync_keeps_or_replaces_stored_error() {
    let f = migrated().await;
    record_launch_on_login_error(
        &f.pool,
        RecordLaunchOnLoginErrorInput {
            message: "denied".to_string(),
        },
    )
    .await
    .unwrap();
    let kept = sync_launch_on_login(&f.pool, sync(false, None))
        .await
        .unwrap();
    assert_eq!(kept.launch_on_login_last_error, "denied");
    let cleared = sync_launch_on_login(&f.pool, sync(true, Some("")))
        .await
        .unwrap();
    assert_eq!(cleared.launch_on_login_last_error, "");
    assert_eq!(cleared.launch_on_login_enabled, 1);
}

#[tokio::test]
async fn storage_failure_rolls_back_and_hides_private_errors() {
    let f = migrated().await;
    fail_on(&f.pool, "BEFORE UPDATE ON app_settings").await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        sync_launch_on_login(&f.pool, sync(true, Some("x")))
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(
        record_launch_on_login_error(
            &f.pool,
            RecordLaunchOnLoginErrorInput {
                message: "x".to_string()
            }
        )
        .await
        .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn concurrent_syncs_keep_a_single_consistent_row() {
    let f = migrated().await;
    seed(&f.pool, "DELETE FROM app_settings;").await;
    let (a, b) = tokio::join!(
        sync_launch_on_login(&f.pool, sync(true, Some("a"))),
        sync_launch_on_login(&f.pool, sync(false, Some("b"))),
    );
    let (a, b) = (a.unwrap(), b.unwrap());
    assert_eq!(count(&f.pool, "app_settings").await, 1);
    for row in [a, b] {
        let pair = (row.launch_on_login_enabled, row.launch_on_login_last_error);
        assert!(pair == (1, "a".to_string()) || pair == (0, "b".to_string()));
    }
}
