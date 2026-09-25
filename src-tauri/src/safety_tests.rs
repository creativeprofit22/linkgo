use super::*;
use crate::test_support::{count, fail_on, migrated, number, seed, snapshot, text, Fixture};

const TABLES: &[&str] = &[
    "safety_settings",
    "safety_audit_events",
    "error_queue_items",
];

async fn fixture() -> Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Old','archived',5);
         INSERT INTO error_queue_items (id,campaign_id,source_type,title,status) VALUES
            (1,1,'manual','Open item','open'),
            (2,2,'manual','Archived item','open'),
            (3,NULL,'manual','Global item','resolved');",
    )
    .await;
    f
}

fn kill(enabled: bool, reason: &str) -> SetGlobalKillSwitchInput {
    SetGlobalKillSwitchInput {
        enabled,
        reason: reason.to_string(),
    }
}

fn status(id: i64, status: &str, notes: &str) -> SetErrorQueueItemStatusInput {
    SetErrorQueueItemStatusInput {
        id,
        status: status.to_string(),
        resolution_notes: notes.to_string(),
    }
}

#[test]
fn error_queue_transitions_match_renderer_matrix() {
    use ErrorQueueStatus::*;
    let all = [Open, InProgress, AwaitingReview, Resolved, Failed];
    let allowed = [
        (Open, InProgress),
        (Open, Failed),
        (InProgress, AwaitingReview),
        (InProgress, Failed),
        (AwaitingReview, Resolved),
        (AwaitingReview, Failed),
        (Resolved, InProgress),
        (Failed, InProgress),
    ];
    for from in all {
        for to in all {
            assert_eq!(
                from.can_move_to(to),
                allowed.contains(&(from, to)),
                "{from:?} -> {to:?}"
            );
        }
    }
}

#[test]
fn input_rejects_unknown_fields() {
    assert!(serde_json::from_value::<SetGlobalKillSwitchInput>(
        serde_json::json!({ "enabled": true, "sql": "x" })
    )
    .is_err());
    assert!(serde_json::from_value::<SetErrorQueueItemStatusInput>(
        serde_json::json!({ "id": 1, "status": "failed", "campaignId": 2 })
    )
    .is_err());
}

#[tokio::test]
async fn kill_switch_enable_and_disable_write_setting_and_audit() {
    let f = fixture().await;
    let result = set_global_kill_switch(&f.pool, kill(true, "  Incident  "))
        .await
        .unwrap();
    assert_eq!(
        result,
        GlobalKillSwitchResult {
            enabled: true,
            reason: "Incident".to_string()
        }
    );
    assert_eq!(
        number(
            &f.pool,
            "SELECT global_kill_switch FROM safety_settings WHERE id=1"
        )
        .await,
        1
    );
    assert_eq!(
        text(
            &f.pool,
            "SELECT event_type||'|'||severity||'|'||summary||'|'||metadata_json||'|'||COALESCE(campaign_id,'null')||'|'||subject_type||'|'||subject_id FROM safety_audit_events"
        )
        .await,
        r#"kill_switch_enabled|block|Global kill switch enabled: Incident|{"reason":"Incident"}|null|safety_settings|1"#
    );
    set_global_kill_switch(&f.pool, kill(false, ""))
        .await
        .unwrap();
    assert_eq!(
        text(
            &f.pool,
            "SELECT global_kill_switch||'|'||kill_switch_reason FROM safety_settings WHERE id=1"
        )
        .await,
        "0|"
    );
    assert_eq!(
        text(
            &f.pool,
            "SELECT summary||'|'||severity FROM safety_audit_events ORDER BY id DESC LIMIT 1"
        )
        .await,
        "Global kill switch disabled|info"
    );
}

#[tokio::test]
async fn kill_switch_rejects_oversized_reason_without_writes() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    assert!(
        set_global_kill_switch(&f.pool, kill(true, &"x".repeat(1001)))
            .await
            .is_err()
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn kill_switch_rolls_back_when_audit_fails() {
    let f = fixture().await;
    fail_on(&f.pool, "BEFORE INSERT ON safety_audit_events").await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        set_global_kill_switch(&f.pool, kill(true, "x"))
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn error_item_moves_and_audits_with_campaign() {
    let f = fixture().await;
    let result = set_error_queue_item_status(&f.pool, status(1, "in_progress", " Looking "))
        .await
        .unwrap();
    assert_eq!(result.previous_status, "open");
    assert_eq!(
        text(
            &f.pool,
            "SELECT status||'|'||resolution_notes FROM error_queue_items WHERE id=1"
        )
        .await,
        "in_progress|Looking"
    );
    assert_eq!(
        text(
            &f.pool,
            "SELECT campaign_id||'|'||subject_id||'|'||summary||'|'||metadata_json FROM safety_audit_events"
        )
        .await,
        r#"1|1|Error item moved from open to in_progress|{"resolutionNotes":"Looking"}"#
    );
    // Global items (no campaign) may be reopened.
    set_error_queue_item_status(&f.pool, status(3, "in_progress", ""))
        .await
        .unwrap();
    assert_eq!(
        count(&f.pool, "safety_audit_events").await,
        2,
        "one audit per change"
    );
}

#[tokio::test]
async fn error_item_rejections_write_nothing() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    for (input, expected) in [
        (status(99, "failed", ""), "Error queue item was not found"),
        (
            status(2, "in_progress", ""),
            "Archived campaign error items cannot be changed",
        ),
        (
            status(1, "resolved", ""),
            "Unsupported error queue status transition",
        ),
        (status(1, "deleted", ""), "Unsupported error queue status"),
        (
            status(0, "failed", ""),
            "Error queue item id must be a positive integer",
        ),
    ] {
        assert_eq!(
            set_error_queue_item_status(&f.pool, input)
                .await
                .unwrap_err(),
            expected
        );
    }
    assert!(
        set_error_queue_item_status(&f.pool, status(1, "failed", &"n".repeat(2001)))
            .await
            .is_err()
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn error_item_rolls_back_when_audit_fails() {
    let f = fixture().await;
    fail_on(&f.pool, "BEFORE INSERT ON safety_audit_events").await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        set_error_queue_item_status(&f.pool, status(1, "failed", "x"))
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn concurrent_identical_transitions_have_one_winner() {
    let f = fixture().await;
    let (first, second) = tokio::join!(
        set_error_queue_item_status(&f.pool, status(1, "in_progress", "a")),
        set_error_queue_item_status(&f.pool, status(1, "in_progress", "b"))
    );
    let outcomes = [first, second];
    assert_eq!(outcomes.iter().filter(|r| r.is_ok()).count(), 1);
    assert!(outcomes.iter().any(|r| r.as_ref().err().map(String::as_str)
        == Some("Unsupported error queue status transition")));
    assert_eq!(count(&f.pool, "safety_audit_events").await, 1);
}

#[tokio::test]
async fn concurrent_kill_switch_writes_serialise_with_one_audit_each() {
    let f = fixture().await;
    let (on, off) = tokio::join!(
        set_global_kill_switch(&f.pool, kill(true, "a")),
        set_global_kill_switch(&f.pool, kill(false, ""))
    );
    on.unwrap();
    off.unwrap();
    assert_eq!(count(&f.pool, "safety_audit_events").await, 2);
    // Final setting matches the last committed audit.
    let last = text(
        &f.pool,
        "SELECT event_type FROM safety_audit_events ORDER BY id DESC LIMIT 1",
    )
    .await;
    let flag = number(
        &f.pool,
        "SELECT global_kill_switch FROM safety_settings WHERE id=1",
    )
    .await;
    assert_eq!(last == "kill_switch_enabled", flag == 1);
}
