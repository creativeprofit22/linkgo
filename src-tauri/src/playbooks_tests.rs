use super::*;
use crate::test_support::{count, fail_on, migrated, snapshot, text};

const TABLES: &[&str] = &["agent_playbook_overrides"];

fn input(key: &str, enabled: bool, instructions: &str) -> UpsertPlaybookOverrideInput {
    UpsertPlaybookOverrideInput {
        playbook_key: key.to_string(),
        enabled,
        custom_instructions: instructions.to_string(),
    }
}

#[test]
fn rejects_unknown_fields_and_keys() {
    assert!(
        serde_json::from_value::<UpsertPlaybookOverrideInput>(serde_json::json!({
            "playbookKey": "linkedin_writer", "enabled": true, "extra": 1
        }))
        .is_err()
    );
    assert_eq!(
        validate_upsert(&input("bad_playbook", true, "")).err(),
        Some("Unknown playbook".to_string())
    );
}

#[test]
fn trims_and_bounds_instructions_by_utf16_length() {
    let valid = validate_upsert(&input("linkedin_writer", true, "  keep  ")).unwrap();
    assert_eq!(valid.custom_instructions, "keep");
    assert!(validate_upsert(&input("linkedin_writer", true, &"x".repeat(2000))).is_ok());
    assert!(validate_upsert(&input("linkedin_writer", true, &"x".repeat(2001))).is_err());
    // Each emoji is two UTF-16 units: 1001 emoji = 2002 units.
    assert!(validate_upsert(&input("linkedin_writer", true, &"😀".repeat(1001))).is_err());
}

#[tokio::test]
async fn upsert_inserts_then_updates_and_list_is_ordered() {
    let f = migrated().await;
    upsert_playbook_override(&f.pool, input("linkedin_writer", true, " first "))
        .await
        .unwrap();
    upsert_playbook_override(&f.pool, input("campaign_analyst", false, ""))
        .await
        .unwrap();
    upsert_playbook_override(&f.pool, input("linkedin_writer", false, "second"))
        .await
        .unwrap();

    let rows = list_playbook_overrides(&f.pool).await.unwrap();
    let summary: Vec<_> = rows
        .iter()
        .map(|row| {
            (
                row.playbook_key.as_str(),
                row.enabled,
                row.custom_instructions.as_str(),
            )
        })
        .collect();
    assert_eq!(
        summary,
        vec![
            ("campaign_analyst", 0, ""),
            ("linkedin_writer", 0, "second")
        ]
    );
    assert_eq!(count(&f.pool, "agent_playbook_overrides").await, 2);
}

#[tokio::test]
async fn invalid_input_writes_nothing() {
    let f = migrated().await;
    let before = snapshot(&f.pool, TABLES).await;
    assert!(upsert_playbook_override(&f.pool, input("nope", true, ""))
        .await
        .is_err());
    assert!(
        upsert_playbook_override(&f.pool, input("linkedin_writer", true, &"x".repeat(2001)))
            .await
            .is_err()
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn storage_failure_rolls_back_and_hides_private_errors() {
    let f = migrated().await;
    upsert_playbook_override(&f.pool, input("linkedin_writer", true, "kept"))
        .await
        .unwrap();
    fail_on(&f.pool, "BEFORE UPDATE ON agent_playbook_overrides").await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        upsert_playbook_override(&f.pool, input("linkedin_writer", false, "lost"))
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn concurrent_upserts_leave_one_consistent_row() {
    let f = migrated().await;
    let (a, b) = tokio::join!(
        upsert_playbook_override(&f.pool, input("linkedin_writer", true, "alpha")),
        upsert_playbook_override(&f.pool, input("linkedin_writer", false, "beta")),
    );
    a.unwrap();
    b.unwrap();
    assert_eq!(count(&f.pool, "agent_playbook_overrides").await, 1);
    let state = text(
        &f.pool,
        "SELECT enabled || ':' || custom_instructions FROM agent_playbook_overrides",
    )
    .await;
    assert!(state == "1:alpha" || state == "0:beta", "torn row: {state}");
}
