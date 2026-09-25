use super::*;
use crate::test_support::{count, fail_on, migrated, seed, snapshot, text, Fixture};

const TABLES: &[&str] = &["content_calendar_slots"];

/// Approvals: 1 approved (campaign 1), 2 needs_review (campaign 1),
/// 3 approved in archived campaign 2, 4 approved (campaign 1, already slotted).
async fn fixture() -> Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Old','active',5);
         INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES
           (1,'u1','n1','c','h1'),(2,'u2','n2','c','h2'),(3,'u3','n3','c','h3'),(4,'u4','n4','c','h4');
         INSERT INTO candidate_posts (id,campaign_id,target_post_id) VALUES (1,1,1),(2,1,2),(3,2,3),(4,1,4);
         INSERT INTO drafts (id,campaign_id,candidate_post_id,status) VALUES
           (1,1,1,'ready_for_review'),(2,1,2,'ready_for_review'),(3,2,3,'ready_for_review'),(4,1,4,'ready_for_review');
         INSERT INTO draft_variants (id,draft_id,variant_number,hook,body,status) VALUES
           (1,1,1,'h','b','selected'),(2,2,1,'h','b','selected'),(3,3,1,'h','b','selected'),(4,4,1,'h','b','selected');
         INSERT INTO draft_audits (draft_variant_id,rule_key,severity,message) VALUES (1,'hook','warning','weak');",
    )
    .await;
    // Approved rows require readiness evidence at the current revision.
    for variant in 1..=4 {
        seed(
            &f.pool,
            &format!(
                "INSERT INTO draft_audits (draft_variant_id,rule_key,severity,message) SELECT {variant},value,'pass','ok' FROM json_each('[\"required_text\",\"total_length\",\"external_link\",\"hashtag_limit\"]');
                 INSERT INTO draft_ai_audit_runs (draft_variant_id,content_revision,provider_key,status,completed_at) VALUES ({variant},1,'dry_run','completed',datetime('now'));
                 INSERT INTO draft_ai_audit_findings (audit_run_id,rule_key,severity,message) SELECT (SELECT MAX(id) FROM draft_ai_audit_runs),value,'pass','ok' FROM json_each('[\"hook\",\"specificity\",\"generic_language\",\"authenticity\",\"clarity\",\"safety\"]');
                 INSERT INTO draft_quality_runs (draft_variant_id,starting_content_revision,current_content_revision,provider_key,status,final_score,completed_at) VALUES ({variant},1,1,'dry_run','passed',80,datetime('now'));"
            ),
        )
        .await;
    }
    seed(
        &f.pool,
        "INSERT INTO approvals (id,campaign_id,draft_id,draft_variant_id,status,reviewed_content_revision,updated_at) VALUES
           (1,1,1,1,'approved',1,'2026-09-02 00:00:00'),(2,1,2,2,'needs_review',NULL,'2026-09-01 00:00:00'),
           (3,2,3,3,'approved',1,'2026-09-03 00:00:00'),(4,1,4,4,'approved',1,'2026-09-04 00:00:00');
         INSERT INTO content_calendar_slots (id,campaign_id,approval_id,purpose,slot_for,format,angle,visual_direction,cta) VALUES
           (1,1,4,'reach','2026-10-02T09:00:00Z','text','a','v','c');
         UPDATE campaigns SET status='archived' WHERE id=2;",
    )
    .await;
    f
}

fn create(approval_id: i64) -> CreateSlotInput {
    CreateSlotInput {
        approval_id,
        purpose: "trust".to_string(),
        slot_for: " 2026-10-01T09:00:00Z ".to_string(),
        timezone: None,
        format: "image".to_string(),
        angle: " Angle ".to_string(),
        visual_direction: "Visual".to_string(),
        cta: "CTA".to_string(),
        notes: String::new(),
    }
}

fn update(id: i64, angle: &str) -> UpdateSlotInput {
    UpdateSlotInput {
        id,
        purpose: "proof".to_string(),
        slot_for: "2026-10-05T09:00:00Z".to_string(),
        timezone: Some("UTC".to_string()),
        format: "text".to_string(),
        angle: angle.to_string(),
        visual_direction: "V".to_string(),
        cta: "C".to_string(),
        notes: "n".to_string(),
    }
}

#[test]
fn inputs_reject_unknown_fields() {
    assert!(
        serde_json::from_value::<CreateSlotInput>(serde_json::json!({
            "approvalId": 1, "purpose": "reach", "slotFor": "x", "format": "text",
            "angle": "a", "visualDirection": "v", "cta": "c", "extra": 1
        }))
        .is_err()
    );
    assert!(serde_json::from_value::<SlotIdInput>(serde_json::json!({ "id": 1, "x": 1 })).is_err());
    assert!(serde_json::from_value::<CalendarListInput>(
        serde_json::json!({ "campaignId": 1, "x": 1 })
    )
    .is_err());
}

#[tokio::test]
async fn invalid_fields_write_nothing() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    let bad_inputs = [
        CreateSlotInput {
            purpose: "fame".to_string(),
            ..create(1)
        },
        CreateSlotInput {
            format: "gif".to_string(),
            ..create(1)
        },
        CreateSlotInput {
            angle: "   ".to_string(),
            ..create(1)
        },
        CreateSlotInput {
            cta: "x".repeat(501),
            ..create(1)
        },
        CreateSlotInput {
            notes: "x".repeat(1001),
            ..create(1)
        },
        CreateSlotInput {
            slot_for: "x".repeat(81),
            ..create(1)
        },
        create(0),
    ];
    for input in bad_inputs {
        assert!(create_slot(&f.pool, input).await.is_err());
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn create_checks_approval_and_trims_fields() {
    let f = fixture().await;
    let id = create_slot(&f.pool, create(1)).await.unwrap();
    assert_eq!(
        text(&f.pool, &format!("SELECT campaign_id||'|'||slot_for||'|'||timezone||'|'||angle FROM content_calendar_slots WHERE id={id}")).await,
        "1|2026-10-01T09:00:00Z|local|Angle"
    );
    for (approval, message) in [
        (99, "Approval was not found"),
        (2, "Approval must be approved before calendar planning"),
        (3, "Campaign is archived"),
        (4, "Approval already has a calendar slot"),
        (1, "Approval already has a calendar slot"),
    ] {
        assert_eq!(
            create_slot(&f.pool, create(approval)).await.unwrap_err(),
            message
        );
    }
}

#[tokio::test]
async fn update_archive_and_schedule_preflight_follow_slot_state() {
    let f = fixture().await;
    update_slot(&f.pool, update(1, " New angle "))
        .await
        .unwrap();
    assert_eq!(
        text(
            &f.pool,
            "SELECT purpose||'|'||angle||'|'||timezone FROM content_calendar_slots WHERE id=1"
        )
        .await,
        "proof|New angle|UTC"
    );
    let target = schedule_preflight(&f.pool, SlotIdInput { id: 1 })
        .await
        .unwrap();
    assert_eq!(
        target,
        SlotScheduleTarget {
            approval_id: 4,
            scheduled_for: "2026-10-05T09:00:00Z".to_string(),
            timezone: "UTC".to_string(),
        }
    );

    archive_slot(&f.pool, SlotIdInput { id: 1 }).await.unwrap();
    assert_eq!(
        update_slot(&f.pool, update(1, "x")).await.unwrap_err(),
        "Archived calendar slots cannot be edited"
    );
    assert_eq!(
        schedule_preflight(&f.pool, SlotIdInput { id: 1 })
            .await
            .unwrap_err(),
        "Archived slots cannot be scheduled"
    );
    assert_eq!(
        archive_slot(&f.pool, SlotIdInput { id: 9 })
            .await
            .unwrap_err(),
        "Calendar slot was not found"
    );
}

#[tokio::test]
async fn preflight_requires_approved_and_live_campaign() {
    let f = fixture().await;
    let id = create_slot(&f.pool, create(1)).await.unwrap();
    seed(
        &f.pool,
        "UPDATE approvals SET status='scheduled' WHERE id=1;",
    )
    .await;
    assert_eq!(
        schedule_preflight(&f.pool, SlotIdInput { id })
            .await
            .unwrap_err(),
        "Only approved posts can be scheduled"
    );
    seed(
        &f.pool,
        "UPDATE campaigns SET status='archived' WHERE id=1;",
    )
    .await;
    assert_eq!(
        schedule_preflight(&f.pool, SlotIdInput { id })
            .await
            .unwrap_err(),
        "Campaign is archived"
    );
    assert_eq!(
        archive_slot(&f.pool, SlotIdInput { id }).await.unwrap_err(),
        "Campaign is archived"
    );
}

#[tokio::test]
async fn lists_are_ordered_filtered_and_carry_audits() {
    let f = fixture().await;
    create_slot(&f.pool, create(1)).await.unwrap();
    archive_slot(&f.pool, SlotIdInput { id: 1 }).await.unwrap();
    let slots = list_slots(
        &f.pool,
        CalendarListInput {
            campaign_id: Some(1),
        },
    )
    .await
    .unwrap();
    // Planned before archived.
    let order: Vec<(i64, &str)> = slots
        .rows
        .iter()
        .map(|row| (row.approval.approval_id, row.status.as_str()))
        .collect();
    assert_eq!(order, vec![(1, "planned"), (4, "archived")]);
    // One warning plus four deterministic passes for variant 1 and for variant 4.
    assert_eq!(slots.audits.len(), 9);
    assert_eq!(slots.rows[0].publish_attempt_id, None);

    let eligible = list_eligible_approvals(&f.pool, CalendarListInput::default())
        .await
        .unwrap();
    // 1 and 4 have slots, 2 is not approved, 3 is archived.
    assert!(eligible.rows.is_empty());
    assert!(list_slots(
        &f.pool,
        CalendarListInput {
            campaign_id: Some(0)
        }
    )
    .await
    .is_err());
}

#[tokio::test]
async fn storage_failure_rolls_back_and_hides_errors() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    fail_on(&f.pool, "BEFORE INSERT ON content_calendar_slots").await;
    assert_eq!(
        create_slot(&f.pool, create(1)).await.unwrap_err(),
        STORAGE_ERROR
    );
    fail_on(&f.pool, "BEFORE UPDATE ON content_calendar_slots").await;
    assert_eq!(
        update_slot(&f.pool, update(1, "x")).await.unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(
        archive_slot(&f.pool, SlotIdInput { id: 1 })
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn concurrent_creates_for_one_approval_leave_one_slot() {
    let f = fixture().await;
    let (a, b) = tokio::join!(
        create_slot(&f.pool, create(1)),
        create_slot(&f.pool, create(1))
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
    let loser = a.err().or(b.err()).unwrap();
    assert_eq!(loser, "Approval already has a calendar slot");
    assert_eq!(count(&f.pool, "content_calendar_slots").await, 2);
}

#[tokio::test]
async fn concurrent_update_and_archive_stay_consistent() {
    let f = fixture().await;
    let (updated, archived) = tokio::join!(
        update_slot(&f.pool, update(1, "raced")),
        archive_slot(&f.pool, SlotIdInput { id: 1 }),
    );
    archived.unwrap();
    let state = text(
        &f.pool,
        "SELECT status||'|'||angle FROM content_calendar_slots WHERE id=1",
    )
    .await;
    match updated {
        // Update won the lock first, then archive applied on top.
        Ok(()) => assert_eq!(state, "archived|raced"),
        Err(message) => {
            assert_eq!(message, "Archived calendar slots cannot be edited");
            assert_eq!(state, "archived|a");
        }
    }
}
