use super::*;
use crate::approval_review::{
    create_approval, set_approval_status, CreateApprovalInput, SetApprovalStatusInput,
    STALE_APPROVAL_ERROR,
};
use crate::test_support::{migrated, seed, Fixture};

const AUDIT_RULES: &str =
    r#"["hook","specificity","generic_language","authenticity","clarity","safety"]"#;
const DETERMINISTIC_RULES: &str =
    r#"["required_text","total_length","external_link","hashtag_limit"]"#;
const HOOK: &str = "We learned from 12 customer interviews";
const BODY: &str = "Our team tested a specific change.";

/// One campaign with one draft whose selected variant has full readiness
/// evidence at content revision 1, approved by a reviewer.
async fn approved_fixture() -> (Fixture, i64) {
    let f = migrated().await;
    seed(
        &f.pool,
        &format!(
            "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5);
             INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES (1,'https://e.com/1','https://e.com/1','One','h1');
             INSERT INTO candidate_posts (id,campaign_id,target_post_id,source_keyword) VALUES (1,1,1,'ai');
             INSERT INTO drafts (id,campaign_id,candidate_post_id,status) VALUES (1,1,1,'ready_for_review');
             INSERT INTO draft_variants (id,draft_id,variant_number,hook,body,status) VALUES (1,1,1,'{HOOK}','{BODY}','selected');
             INSERT INTO draft_audits (draft_variant_id,rule_key,severity,message) SELECT 1,value,'pass','ok' FROM json_each('{DETERMINISTIC_RULES}');
             INSERT INTO draft_ai_audit_runs (draft_variant_id,content_revision,provider_key,status,completed_at) SELECT id,content_revision,'dry_run','completed',datetime('now') FROM draft_variants WHERE id=1;
             INSERT INTO draft_ai_audit_findings (audit_run_id,rule_key,severity,message) SELECT (SELECT MAX(id) FROM draft_ai_audit_runs),value,'pass','ok' FROM json_each('{AUDIT_RULES}');
             INSERT INTO draft_quality_runs (draft_variant_id,starting_content_revision,current_content_revision,provider_key,status,final_score,completed_at)
               SELECT id,content_revision,content_revision,'dry_run','passed',80,datetime('now') FROM draft_variants WHERE id=1;"
        ),
    )
    .await;
    let id = create_approval(
        &f.pool,
        CreateApprovalInput {
            draft_id: 1,
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
    (f, id)
}

fn manual_input(approval_id: i64, hook: &str) -> LinkedInPublishPostInput {
    LinkedInPublishPostInput {
        approval_id,
        schedule_job_id: None,
        commentary: escape_linkedin_little_text(&compose_linkedin_commentary(hook, BODY, "", "")),
        idempotency_key: format!("approval:{approval_id}:linkedin:manual"),
    }
}

#[tokio::test]
async fn ready_approval_passes_native_publish_gate() {
    let (f, id) = approved_fixture().await;
    let input = manual_input(id, HOOK);

    let preflight = load_publish_preflight_from_pool(&f.pool, &input)
        .await
        .unwrap();

    assert_eq!(preflight.commentary, input.commentary);
}

#[tokio::test]
async fn edit_after_approval_never_publishes_unreviewed_text() {
    let (f, id) = approved_fixture().await;
    seed(
        &f.pool,
        "UPDATE draft_variants SET hook='edited', content_revision=content_revision+1 WHERE id=1;",
    )
    .await;

    // The revision trigger demotes the approval, so even a caller sending the
    // edited text is refused before any LinkedIn call.
    let error = load_publish_preflight_from_pool(&f.pool, &manual_input(id, "edited"))
        .await
        .err();

    assert_eq!(
        error.as_deref(),
        Some("Only approved or scheduled approvals can publish via LinkedIn")
    );
}

#[tokio::test]
async fn lost_readiness_while_still_approved_is_rejected_as_stale() {
    let (f, id) = approved_fixture().await;
    // A newer pending AI audit on the reviewed revision keeps the approval
    // `approved` but removes it from approval_ready_variants.
    seed(
        &f.pool,
        "INSERT INTO draft_ai_audit_runs (draft_variant_id,content_revision,provider_key,status) VALUES (1,1,'dry_run','pending');",
    )
    .await;

    let error = load_publish_preflight_from_pool(&f.pool, &manual_input(id, HOOK))
        .await
        .err();

    assert_eq!(error.as_deref(), Some(STALE_APPROVAL_ERROR));
}

#[tokio::test]
async fn kill_switch_fails_before_readiness() {
    let (f, id) = approved_fixture().await;
    seed(
        &f.pool,
        "INSERT INTO draft_ai_audit_runs (draft_variant_id,content_revision,provider_key,status) VALUES (1,1,'dry_run','pending');
         UPDATE safety_settings SET global_kill_switch=1, kill_switch_reason='stop' WHERE id=1;",
    )
    .await;

    let error = load_publish_preflight_from_pool(&f.pool, &manual_input(id, HOOK))
        .await
        .err();

    assert_eq!(
        error.as_deref(),
        Some("Global kill switch is enabled: stop")
    );
}

#[tokio::test]
async fn unknown_schedule_job_is_rejected_for_approved_approval() {
    let (f, id) = approved_fixture().await;
    let mut input = manual_input(id, HOOK);
    input.schedule_job_id = Some(9);
    input.idempotency_key = format!("approval:{id}:linkedin:9");

    let error = load_publish_preflight_from_pool(&f.pool, &input)
        .await
        .err();

    assert_eq!(
        error.as_deref(),
        Some("Schedule job is not the current scheduled job")
    );
}
