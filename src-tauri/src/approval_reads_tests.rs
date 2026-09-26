use super::*;
use crate::approval_review::{
    create_approval, set_approval_status, CreateApprovalInput, SetApprovalStatusInput,
};
use crate::test_support::{migrated, seed, Fixture};

const AUDIT_RULES: &str =
    r#"["hook","specificity","generic_language","authenticity","clarity","safety"]"#;
const DETERMINISTIC_RULES: &str =
    r#"["required_text","total_length","external_link","hashtag_limit"]"#;

/// Two campaigns; draft 1 (campaign 1) and draft 2 (campaign 2) each have one
/// selected variant with full readiness evidence.
async fn fixture() -> Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Other','active',5),(3,'Old','archived',5);
         INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES
           (1,'https://e.com/1','https://e.com/1','One','h1'),(2,'https://e.com/2','https://e.com/2','Two','h2'),(3,'https://e.com/3','https://e.com/3','Three','h3');
         INSERT INTO candidate_posts (id,campaign_id,target_post_id,source_keyword) VALUES (1,1,1,'ai'),(2,2,2,'ops'),(3,3,3,'old');
         INSERT INTO drafts (id,campaign_id,candidate_post_id,status,updated_at) VALUES
           (1,1,1,'ready_for_review','2026-09-01 00:00:00'),(2,2,2,'ready_for_review','2026-09-02 00:00:00'),(3,3,3,'ready_for_review','2026-09-03 00:00:00');
         INSERT INTO draft_variants (id,draft_id,variant_number,hook,body,status) VALUES
           (1,1,1,'We learned from 12 customer interviews','Our team tested a specific change.','selected'),
           (2,2,1,'We learned from 12 customer interviews','Our team tested a specific change.','selected'),
           (3,3,1,'We learned from 12 customer interviews','Our team tested a specific change.','selected');",
    )
    .await;
    for variant in 1..=3 {
        seed(
            &f.pool,
            &format!(
                "INSERT INTO draft_audits (draft_variant_id,rule_key,severity,message) SELECT {variant},value,'pass','ok' FROM json_each('{DETERMINISTIC_RULES}');
                 INSERT INTO draft_ai_audit_runs (draft_variant_id,content_revision,provider_key,status,completed_at) SELECT id,content_revision,'dry_run','completed',datetime('now') FROM draft_variants WHERE id={variant};
                 INSERT INTO draft_ai_audit_findings (audit_run_id,rule_key,severity,message) SELECT (SELECT MAX(id) FROM draft_ai_audit_runs),value,'pass','ok' FROM json_each('{AUDIT_RULES}');
                 INSERT INTO draft_quality_runs (draft_variant_id,starting_content_revision,current_content_revision,provider_key,status,final_score,completed_at)
                   SELECT id,content_revision,content_revision,'dry_run','passed',80,datetime('now') FROM draft_variants WHERE id={variant};"
            ),
        )
        .await;
    }
    f
}

async fn approve_draft(f: &Fixture, draft_id: i64) -> i64 {
    let id = create_approval(
        &f.pool,
        CreateApprovalInput {
            draft_id,
            reviewer_notes: None,
        },
    )
    .await
    .unwrap();
    set_approval_status(
        &f.pool,
        SetApprovalStatusInput {
            id,
            status: "approved".to_string(),
            content_revision: Some(1),
            reviewer_notes: None,
        },
    )
    .await
    .unwrap();
    id
}

fn preflight(approval_id: i64, schedule_job_id: Option<i64>) -> PublishPreflightInput {
    PublishPreflightInput {
        approval_id,
        schedule_job_id,
    }
}

#[test]
fn inputs_reject_unknown_fields() {
    assert!(serde_json::from_value::<ApprovalListInput>(
        serde_json::json!({ "campaignId": 1, "extra": 1 })
    )
    .is_err());
    assert!(serde_json::from_value::<PublishPreflightInput>(
        serde_json::json!({ "approvalId": 1, "extra": 1 })
    )
    .is_err());
}

#[tokio::test]
async fn invalid_ids_are_rejected_before_storage() {
    let f = migrated().await;
    let bad = ApprovalListInput {
        campaign_id: Some(0),
    };
    assert!(list_approvals(&f.pool, bad).await.is_err());
    let bad = ApprovalListInput {
        campaign_id: Some(-1),
    };
    assert!(list_eligible_drafts(&f.pool, bad).await.is_err());
    assert_eq!(
        publish_preflight(&f.pool, preflight(0, None))
            .await
            .unwrap_err(),
        "Approval id must be a positive integer"
    );
    assert_eq!(
        publish_preflight(&f.pool, preflight(1, Some(0)))
            .await
            .unwrap_err(),
        "Schedule job id must be a positive integer"
    );
}

#[tokio::test]
async fn eligible_drafts_skip_archived_approved_and_blocked() {
    let f = fixture().await;
    let all = list_eligible_drafts(&f.pool, ApprovalListInput::default())
        .await
        .unwrap();
    // Draft 3 is in an archived campaign; newest update first.
    let ids: Vec<i64> = all.rows.iter().map(|row| row.draft_id).collect();
    assert_eq!(ids, vec![2, 1]);
    assert_eq!(all.total_count, 2);
    assert_eq!(all.rows[1].target_url, "https://e.com/1");
    assert!(all.audits.iter().all(|audit| audit.severity == "pass"));

    approve_draft(&f, 1).await;
    seed(
        &f.pool,
        "INSERT INTO draft_audits (draft_variant_id,rule_key,severity,message) VALUES (2,'safety','block','no');",
    )
    .await;
    let none = list_eligible_drafts(&f.pool, ApprovalListInput::default())
        .await
        .unwrap();
    assert!(none.rows.is_empty());
    assert!(none.audits.is_empty());
    assert_eq!(none.total_count, 0);
}

#[tokio::test]
async fn approval_list_includes_related_rows_and_filters_by_campaign() {
    let f = fixture().await;
    let first = approve_draft(&f, 1).await;
    let second = approve_draft(&f, 2).await;
    seed(
        &f.pool,
        &format!(
            "INSERT INTO schedule_jobs (approval_id,scheduled_for,timezone,status,idempotency_key) VALUES ({first},'2026-10-01T09:00:00Z','UTC','cancelled','k1');
             INSERT INTO publish_attempts (approval_id,status,error_message) VALUES ({first},'failed','boom');"
        ),
    )
    .await;

    let all = list_approvals(&f.pool, ApprovalListInput::default())
        .await
        .unwrap();
    let mut ids: Vec<i64> = all.rows.iter().map(|row| row.id).collect();
    ids.sort_unstable();
    assert_eq!(ids, vec![first, second]);
    assert_eq!(all.total_count, 2);
    let row = all.rows.iter().find(|row| row.id == first).unwrap();
    assert_eq!(row.status, "approved");
    assert_eq!(row.readiness, 1);
    assert_eq!(row.current_content_revision, 1);
    assert_eq!(row.snapshot.campaign_name, "Live");
    assert_eq!(all.schedule_jobs.len(), 1);
    assert_eq!(all.publish_attempts[0].error_message, "boom");
    assert_eq!(all.audits.len(), 8);

    let one = list_approvals(
        &f.pool,
        ApprovalListInput {
            campaign_id: Some(2),
        },
    )
    .await
    .unwrap();
    assert_eq!(one.rows.len(), 1);
    assert_eq!(one.total_count, 1);
    assert_eq!(one.rows[0].id, second);
    assert!(one.schedule_jobs.is_empty());
    assert!(one.publish_attempts.is_empty());
}

/// Seeds `count` extra ready drafts (ids from 100) in campaign 1, each with
/// one selected variant and full readiness evidence, set-based for speed.
async fn seed_ready_drafts(f: &Fixture, count: i64) {
    let last = 99 + count;
    seed(
        &f.pool,
        &format!(
            "WITH RECURSIVE n(i) AS (SELECT 100 UNION ALL SELECT i+1 FROM n WHERE i < {last})
             INSERT INTO target_posts (id,url,normalized_url,content,content_hash)
               SELECT i,'https://e.com/'||i,'https://e.com/'||i,'Post','h'||i FROM n;
             INSERT INTO candidate_posts (id,campaign_id,target_post_id,source_keyword)
               SELECT id,1,id,'ai' FROM target_posts WHERE id >= 100;
             INSERT INTO drafts (id,campaign_id,candidate_post_id,status,updated_at)
               SELECT id,1,id,'ready_for_review','2026-08-01 00:00:00' FROM candidate_posts WHERE id >= 100;
             INSERT INTO draft_variants (id,draft_id,variant_number,hook,body,status)
               SELECT id,id,1,'We learned from 12 customer interviews','Our team tested a specific change.','selected'
               FROM drafts WHERE id >= 100;
             INSERT INTO draft_audits (draft_variant_id,rule_key,severity,message)
               SELECT dv.id,j.value,'pass','ok' FROM draft_variants dv, json_each('{DETERMINISTIC_RULES}') j WHERE dv.id >= 100;
             INSERT INTO draft_ai_audit_runs (draft_variant_id,content_revision,provider_key,status,completed_at)
               SELECT id,content_revision,'dry_run','completed',datetime('now') FROM draft_variants WHERE id >= 100;
             INSERT INTO draft_ai_audit_findings (audit_run_id,rule_key,severity,message)
               SELECT r.id,j.value,'pass','ok' FROM draft_ai_audit_runs r, json_each('{AUDIT_RULES}') j WHERE r.draft_variant_id >= 100;
             INSERT INTO draft_quality_runs (draft_variant_id,starting_content_revision,current_content_revision,provider_key,status,final_score,completed_at)
               SELECT id,content_revision,content_revision,'dry_run','passed',80,datetime('now') FROM draft_variants WHERE id >= 100;"
        ),
    )
    .await;
}

#[tokio::test]
async fn capped_lists_report_the_uncapped_total_count() {
    let f = fixture().await;
    seed_ready_drafts(&f, APPROVAL_LIST_LIMIT + 1).await;
    let campaign = || ApprovalListInput {
        campaign_id: Some(1),
    };

    // 501 seeded + draft 1 are eligible; rows stop at the eligible cap.
    let eligible = list_eligible_drafts(&f.pool, campaign()).await.unwrap();
    assert_eq!(eligible.rows.len() as i64, ELIGIBLE_DRAFT_LIMIT);
    assert_eq!(eligible.total_count, APPROVAL_LIST_LIMIT + 2);

    for draft_id in 100..100 + APPROVAL_LIST_LIMIT + 1 {
        create_approval(
            &f.pool,
            CreateApprovalInput {
                draft_id,
                reviewer_notes: None,
            },
        )
        .await
        .unwrap();
    }
    approve_draft(&f, 2).await;

    let approvals = list_approvals(&f.pool, campaign()).await.unwrap();
    assert_eq!(approvals.rows.len() as i64, APPROVAL_LIST_LIMIT);
    assert_eq!(approvals.total_count, APPROVAL_LIST_LIMIT + 1);
    // The count follows the campaign filter, not the whole table.
    let all = list_approvals(&f.pool, ApprovalListInput::default())
        .await
        .unwrap();
    assert_eq!(all.total_count, APPROVAL_LIST_LIMIT + 2);

    let eligible = list_eligible_drafts(&f.pool, campaign()).await.unwrap();
    assert_eq!(eligible.rows.len(), 1);
    assert_eq!(eligible.total_count, 1);
}

#[tokio::test]
async fn publish_preflight_enforces_state_and_schedule() {
    let f = fixture().await;
    let id = approve_draft(&f, 1).await;
    publish_preflight(&f.pool, preflight(id, None))
        .await
        .unwrap();
    assert_eq!(
        publish_preflight(&f.pool, preflight(id, Some(9)))
            .await
            .unwrap_err(),
        "Schedule job is not the current scheduled job"
    );
    assert_eq!(
        publish_preflight(&f.pool, preflight(99, None))
            .await
            .unwrap_err(),
        "Approval was not found"
    );

    seed(
        &f.pool,
        "UPDATE safety_settings SET global_kill_switch=1, kill_switch_reason='stop' WHERE id=1;",
    )
    .await;
    assert_eq!(
        publish_preflight(&f.pool, preflight(id, None))
            .await
            .unwrap_err(),
        "Global kill switch is enabled: stop"
    );
    seed(
        &f.pool,
        "UPDATE safety_settings SET global_kill_switch=0, kill_switch_reason='' WHERE id=1;",
    )
    .await;

    seed(
        &f.pool,
        &format!("INSERT INTO publish_attempts (approval_id,status) VALUES ({id},'succeeded');"),
    )
    .await;
    assert_eq!(
        publish_preflight(&f.pool, preflight(id, None))
            .await
            .unwrap_err(),
        "Approval already has a successful publish attempt"
    );

    seed(
        &f.pool,
        "UPDATE campaigns SET status='archived' WHERE id=1;",
    )
    .await;
    assert_eq!(
        publish_preflight(&f.pool, preflight(id, None))
            .await
            .unwrap_err(),
        "Campaign is archived"
    );
}

#[tokio::test]
async fn publish_preflight_rejects_stale_readiness() {
    let f = fixture().await;
    let id = approve_draft(&f, 1).await;
    seed(
        &f.pool,
        "INSERT INTO draft_ai_audit_runs (draft_variant_id,content_revision,provider_key,status) VALUES (1,1,'dry_run','pending');",
    )
    .await;
    let error = publish_preflight(&f.pool, preflight(id, None))
        .await
        .unwrap_err();
    assert_eq!(error, crate::approval_review::STALE_APPROVAL_ERROR);
}

#[tokio::test]
async fn list_during_status_change_sees_one_consistent_state() {
    let f = fixture().await;
    let id = approve_draft(&f, 1).await;
    let (write, read) = tokio::join!(
        set_approval_status(
            &f.pool,
            SetApprovalStatusInput {
                id,
                status: "changes_requested".to_string(),
                content_revision: None,
                reviewer_notes: Some("redo".to_string()),
            },
        ),
        list_approvals(&f.pool, ApprovalListInput::default()),
    );
    write.unwrap();
    let read = read.unwrap();
    let row = read.rows.iter().find(|row| row.id == id).unwrap();
    // Either fully before (approved, no notes) or fully after (both changed).
    let seen = (row.status.as_str(), row.reviewer_notes.as_str());
    assert!(
        seen == ("approved", "") || seen == ("changes_requested", "redo"),
        "{seen:?}"
    );
}
