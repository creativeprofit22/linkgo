use super::*;
use crate::test_support::{count, fail_on, migrated, number, seed, snapshot, text, Fixture};
use serde_json::json;

const TABLES: &[&str] = &[
    "draft_ai_audit_runs",
    "draft_ai_audit_findings",
    "agent_runs",
    "agent_run_events",
    "agent_run_approval_checkpoints",
    "draft_variants",
];
const HOOK: &str = "Exact revision hook";
const BODY: &str = "Exact revision body with a concrete operator detail.";
const CTA: &str = "Review the exact revision.";
const TAGS: &str = "#Linkgo";

/// Campaign 1 active with variant 1 (revision 1); campaign 2 archived with
/// variant 2. Agent run 30 is an auditor for campaign 1.
async fn fixture() -> Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        &format!(
            "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Old','archived',5);
             INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES (1,'u1','n1','a','h1'),(2,'u2','n2','b','h2');
             INSERT INTO candidate_posts (id,campaign_id,target_post_id,status) VALUES (1,1,1,'drafted'),(2,2,2,'drafted');
             INSERT INTO drafts (id,campaign_id,candidate_post_id,status) VALUES (1,1,1,'drafting'),(2,2,2,'drafting');
             INSERT INTO draft_variants (id,draft_id,variant_number,hook,body,cta,hashtags) VALUES
               (1,1,1,'{HOOK}','{BODY}','{CTA}','{TAGS}'),(2,2,1,'h','b','','');
             INSERT INTO agent_runs (id,campaign_id,agent_role,status) VALUES (30,1,'auditor','running');"
        ),
    )
    .await;
    f
}

fn canonical() -> String {
    format!("{HOOK}\n\n{BODY}\n\n{CTA}\n\n{TAGS}")
}

fn start_input(revision: i64) -> StartDraftAiAuditInput {
    StartDraftAiAuditInput {
        draft_variant_id: 1,
        content_revision: Some(revision),
        agent_run_id: None,
        provider_key: "dry_run".to_string(),
        model_name: String::new(),
    }
}

fn findings(block_safety: bool) -> Value {
    Value::Array(
        RULE_KEYS
            .iter()
            .map(|key| {
                let severity = if block_safety && *key == "safety" {
                    "block"
                } else {
                    "pass"
                };
                json!({ "ruleKey": key, "severity": severity, "message": format!("{key} ok") })
            })
            .collect(),
    )
}

/// Records a completed audit_post call on agent 30 for audit run `run_id`.
async fn record_auditor_output(f: &Fixture, run_id: i64, text_value: &str, findings: Value) {
    record_auditor_output_with(f, run_id, text_value, findings.clone(), findings).await;
}

/// Like `record_auditor_output`, but the output may carry different findings.
async fn record_auditor_output_with(
    f: &Fixture,
    run_id: i64,
    text_value: &str,
    authored: Value,
    returned: Value,
) {
    let input = json!({
        "campaignId": 1, "draftVariantId": 1, "contentRevision": 1,
        "auditRunId": run_id, "text": text_value, "findings": authored,
    });
    let output = json!({ "summary": " Audited ", "findings": returned });
    sqlx::query(
        "INSERT INTO agent_tool_calls (agent_run_id, provider_tool_call_id, tool_name, status, requires_approval, input_json, output_json)
         VALUES (30, 'c1', 'audit_post', 'completed', 0, ?1, ?2)",
    )
    .bind(input.to_string())
    .bind(output.to_string())
    .execute(&f.pool)
    .await
    .unwrap();
    // The tool loop completes the auditor after persisting its call.
    seed(
        &f.pool,
        "UPDATE agent_runs SET status = 'completed' WHERE id = 30;",
    )
    .await;
}

async fn started_and_linked(f: &Fixture) -> i64 {
    let run = start(&f.pool, start_input(1)).await.unwrap().run.id;
    link_agent_run(
        &f.pool,
        LinkDraftAiAuditAgentInput {
            audit_run_id: run,
            agent_run_id: 30,
        },
    )
    .await
    .unwrap();
    run
}

fn complete_input(run: i64) -> CompleteDraftAiAuditInput {
    CompleteDraftAiAuditInput {
        audit_run_id: run,
        draft_variant_id: 1,
        content_revision: 1,
    }
}

#[test]
fn inputs_reject_caller_supplied_findings() {
    assert!(serde_json::from_value::<CompleteDraftAiAuditInput>(json!({
        "auditRunId": 1, "draftVariantId": 1, "contentRevision": 1,
        "summary": "x", "findings": []
    }))
    .is_err());
}

#[test]
fn finding_validation_requires_exactly_one_per_rule() {
    assert_eq!(validate_findings(&findings(false)).unwrap().len(), 6);
    let mut duplicate = findings(false);
    duplicate.as_array_mut().unwrap()[5]["ruleKey"] = json!("hook");
    assert!(validate_findings(&duplicate).is_err());
    let mut short = findings(false);
    short.as_array_mut().unwrap().pop();
    assert!(validate_findings(&short).is_err());
    let mut bad_severity = findings(false);
    bad_severity.as_array_mut().unwrap()[0]["severity"] = json!("fatal");
    assert!(validate_findings(&bad_severity).is_err());
}

#[test]
fn bound_error_trims_defaults_and_caps() {
    assert_eq!(bound_error("  "), "Draft AI audit failed");
    assert_eq!(bound_error(" boom "), "boom");
    assert_eq!(utf16_len(&bound_error(&"x".repeat(1500))), 1000);
}

#[tokio::test]
async fn start_reserves_a_run_and_returns_the_canonical_text() {
    let f = fixture().await;
    let started = start(&f.pool, start_input(1)).await.unwrap();
    assert_eq!(started.text, canonical());
    assert_eq!(started.campaign_id, 1);
    assert_eq!(
        (started.run.status.as_str(), started.run.content_revision),
        ("running", 1)
    );
}

#[tokio::test]
async fn start_without_a_revision_uses_the_current_one() {
    let f = fixture().await;
    seed(
        &f.pool,
        "UPDATE draft_variants SET body = 'Edited body' WHERE id = 1;",
    )
    .await;
    let mut input = start_input(1);
    input.content_revision = None;
    let started = start(&f.pool, input).await.unwrap();
    assert_eq!(started.run.content_revision, 2);
    assert!(started.text.contains("Edited body"));
}

#[tokio::test]
async fn start_rejections_write_nothing() {
    let f = fixture().await;
    seed(&f.pool, "UPDATE draft_variants SET hook=' ', body=char(10), cta=char(9), hashtags=' ' WHERE id=2; UPDATE campaigns SET status='active' WHERE id=2;").await;
    let before = snapshot(&f.pool, TABLES).await;
    let mut empty_variant = start_input(1);
    empty_variant.draft_variant_id = 2;
    let mut bad_provider = start_input(1);
    bad_provider.provider_key = "shell".to_string();
    let mut missing = start_input(1);
    missing.draft_variant_id = 99;
    for (input, expected) in [
        (start_input(2), STALE_START_MESSAGE),
        (empty_variant, EMPTY_TEXT_MESSAGE),
        (bad_provider, "Unsupported provider"),
        (missing, "Draft variant was not found"),
    ] {
        assert_eq!(start(&f.pool, input).await.unwrap_err(), expected);
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn concurrent_starts_for_one_revision_have_one_winner() {
    let f = fixture().await;
    let (a, b) = tokio::join!(
        start(&f.pool, start_input(1)),
        start(&f.pool, start_input(1))
    );
    let outcomes = [a, b];
    assert_eq!(outcomes.iter().filter(|r| r.is_ok()).count(), 1);
    assert!(outcomes
        .iter()
        .any(|r| r.as_ref().err().map(String::as_str) == Some(ACTIVE_AUDIT_MESSAGE)));
    assert_eq!(count(&f.pool, "draft_ai_audit_runs").await, 1);
}

#[tokio::test]
async fn link_rejects_cross_campaign_and_non_auditor_agents() {
    let f = fixture().await;
    seed(
        &f.pool,
        "INSERT INTO agent_runs (id,campaign_id,agent_role,status) VALUES (31,2,'auditor','running'),(32,1,'drafter','running');",
    )
    .await;
    let run = start(&f.pool, start_input(1)).await.unwrap().run.id;
    let before = snapshot(&f.pool, TABLES).await;
    for agent in [31, 32, 99] {
        assert!(link_agent_run(
            &f.pool,
            LinkDraftAiAuditAgentInput {
                audit_run_id: run,
                agent_run_id: agent
            }
        )
        .await
        .is_err());
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
    link_agent_run(
        &f.pool,
        LinkDraftAiAuditAgentInput {
            audit_run_id: run,
            agent_run_id: 30,
        },
    )
    .await
    .unwrap();
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT status||'|'||agent_run_id FROM draft_ai_audit_runs WHERE id={run}")
        )
        .await,
        "running|30"
    );
}

#[tokio::test]
async fn complete_reads_the_auditors_own_findings() {
    let f = fixture().await;
    let run = started_and_linked(&f).await;
    record_auditor_output(&f, run, &canonical(), findings(true)).await;
    let completed = complete(&f.pool, complete_input(run)).await.unwrap();
    assert_eq!(
        (completed.status.as_str(), completed.summary.as_str()),
        ("completed", "Audited")
    );
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT group_concat(rule_key||':'||severity, ',') FROM (SELECT rule_key, severity FROM draft_ai_audit_findings WHERE audit_run_id={run} ORDER BY id)")
        )
        .await,
        "hook:pass,specificity:pass,generic_language:pass,authenticity:pass,clarity:pass,safety:block"
    );
}

#[tokio::test]
async fn complete_rejects_output_for_other_text_or_run_without_writes() {
    let f = fixture().await;
    let run = started_and_linked(&f).await;
    record_auditor_output(&f, run, "Tampered text", findings(false)).await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        complete(&f.pool, complete_input(run)).await.unwrap_err(),
        MISMATCHED_OUTPUT_MESSAGE
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
    let mut wrong_revision = complete_input(run);
    wrong_revision.content_revision = 2;
    assert!(complete(&f.pool, wrong_revision).await.is_err());
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn complete_rejects_output_that_rewrites_the_authored_findings() {
    let f = fixture().await;
    let run = started_and_linked(&f).await;
    record_auditor_output_with(&f, run, &canonical(), findings(true), findings(false)).await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        complete(&f.pool, complete_input(run)).await.unwrap_err(),
        PRESERVED_FINDINGS_MESSAGE
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn complete_refuses_a_stale_revision() {
    let f = fixture().await;
    let run = started_and_linked(&f).await;
    record_auditor_output(&f, run, &canonical(), findings(false)).await;
    // The operator edits the draft while the audit runs.
    seed(
        &f.pool,
        "UPDATE draft_variants SET body='Edited body' WHERE id=1;",
    )
    .await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        complete(&f.pool, complete_input(run)).await.unwrap_err(),
        STALE_COMPLETE_MESSAGE
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn complete_rolls_back_the_run_when_a_finding_insert_fails() {
    let f = fixture().await;
    let run = started_and_linked(&f).await;
    record_auditor_output(&f, run, &canonical(), findings(false)).await;
    fail_on(
        &f.pool,
        "BEFORE INSERT ON draft_ai_audit_findings WHEN NEW.rule_key = 'clarity'",
    )
    .await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        complete(&f.pool, complete_input(run)).await.unwrap_err(),
        STORAGE_ERROR
    );
    // Run still active, no partial findings.
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT status FROM draft_ai_audit_runs WHERE id={run}")
        )
        .await,
        "running"
    );
}

#[tokio::test]
async fn concurrent_completes_settle_once() {
    let f = fixture().await;
    let run = started_and_linked(&f).await;
    record_auditor_output(&f, run, &canonical(), findings(false)).await;
    let (a, b) = tokio::join!(
        complete(&f.pool, complete_input(run)),
        complete(&f.pool, complete_input(run))
    );
    assert_eq!([a.is_ok(), b.is_ok()].iter().filter(|ok| **ok).count(), 1);
    assert_eq!(count(&f.pool, "draft_ai_audit_findings").await, 6);
}

#[tokio::test]
async fn fail_marks_run_and_agent_failed_and_clears_checkpoint() {
    let f = fixture().await;
    let run = started_and_linked(&f).await;
    seed(
        &f.pool,
        "INSERT INTO agent_tool_calls (id, agent_run_id, provider_tool_call_id, tool_name, status, requires_approval, input_json, output_json) VALUES (70, 30, 'p1', 'schedule_post', 'waiting_approval', 1, '{}', '{}');
         DROP TRIGGER IF EXISTS approvals_validate_insert;
         DROP TRIGGER IF EXISTS approvals_bind_insert;
         INSERT INTO approvals (id, campaign_id, draft_id, draft_variant_id, status) VALUES (60, 1, 1, 1, 'approved');
         INSERT INTO agent_run_approval_checkpoints (agent_run_id, pending_tool_call_id, approval_id, phase, messages_json, iteration_count) VALUES (30, 70, 60, 'waiting_approval', '[]', 1);",
    )
    .await;
    fail(
        &f.pool,
        FailDraftAiAuditInput {
            audit_run_id: run,
            draft_variant_id: 1,
            content_revision: 1,
            error_message: " Provider down ".to_string(),
            agent_run_id: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT status||'|'||error_message FROM draft_ai_audit_runs WHERE id={run}")
        )
        .await,
        "failed|Provider down"
    );
    assert_eq!(
        text(&f.pool, "SELECT status FROM agent_runs WHERE id=30").await,
        "failed"
    );
    assert_eq!(count(&f.pool, "agent_run_approval_checkpoints").await, 0);
    assert_eq!(
        number(&f.pool, "SELECT COUNT(*) FROM agent_run_events WHERE agent_run_id=30 AND event_type='run_failed'").await,
        1
    );
}

#[tokio::test]
async fn fail_rolls_back_the_run_when_the_agent_event_fails() {
    let f = fixture().await;
    let run = started_and_linked(&f).await;
    fail_on(&f.pool, "BEFORE INSERT ON agent_run_events").await;
    let before = snapshot(&f.pool, TABLES).await;
    let result = fail(
        &f.pool,
        FailDraftAiAuditInput {
            audit_run_id: run,
            draft_variant_id: 1,
            content_revision: 1,
            error_message: "x".to_string(),
            agent_run_id: None,
        },
    )
    .await;
    assert_eq!(result.unwrap_err(), STORAGE_ERROR);
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn reconcile_fails_stale_reservations_executions_and_orphans() {
    let f = fixture().await;
    seed(
        &f.pool,
        "INSERT INTO draft_variants (id,draft_id,variant_number,hook,body) VALUES (3,1,2,'h','b'),(4,1,3,'h','b');
         INSERT INTO agent_runs (id,campaign_id,agent_role,status,input_context_json,updated_at) VALUES
           (40,1,'auditor','running','{}',datetime('now','-2 hours')),
           (41,1,'auditor','running','{\"auditRequest\":{\"auditRunId\":999}}',datetime('now','-2 hours')),
           (42,1,'auditor','running','{\"auditRequest\":{\"auditRunId\":998}}',datetime('now'));
         INSERT INTO draft_ai_audit_runs (id,draft_variant_id,content_revision,provider_key,status,updated_at) VALUES
           (50,1,1,'dry_run','pending',datetime('now','-10 minutes'));
         INSERT INTO draft_ai_audit_runs (id,draft_variant_id,content_revision,agent_run_id,provider_key,status,updated_at) VALUES
           (51,3,1,40,'dry_run','running',datetime('now','-2 hours'));
         INSERT INTO draft_ai_audit_runs (id,draft_variant_id,content_revision,provider_key,status,updated_at) VALUES
           (52,4,1,'dry_run','pending',datetime('now'));",
    )
    .await;
    let output = reconcile(
        &f.pool,
        ReconcileDraftAiAuditInput {
            max_audit_runs: 25,
            max_orphan_agent_runs: 25,
        },
    )
    .await
    .unwrap();
    assert_eq!(output.failed_audit_run_ids, vec![51, 50]);
    // 40 via its stale execution, 41 as an orphan; 42 is recent.
    assert_eq!(output.failed_agent_run_ids, vec![40, 41]);
    assert_eq!(
        text(
            &f.pool,
            "SELECT status FROM draft_ai_audit_runs WHERE id=52"
        )
        .await,
        "pending"
    );
    assert_eq!(
        text(&f.pool, "SELECT status FROM agent_runs WHERE id=42").await,
        "running"
    );
}

#[tokio::test]
async fn complete_requires_the_auditor_agent_to_have_completed() {
    let f = fixture().await;
    let run = started_and_linked(&f).await;
    record_auditor_output(&f, run, &canonical(), findings(false)).await;
    seed(
        &f.pool,
        "UPDATE agent_runs SET status = 'running' WHERE id = 30;",
    )
    .await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        complete(&f.pool, complete_input(run)).await.unwrap_err(),
        "Auditor agent did not complete"
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn complete_refreshes_the_deterministic_audit_for_the_same_revision() {
    let f = fixture().await;
    // A variant with no deterministic audit yet (e.g. historical or rewritten).
    assert_eq!(
        number(
            &f.pool,
            "SELECT COUNT(*) FROM draft_audits WHERE draft_variant_id = 1"
        )
        .await,
        0
    );
    let run = started_and_linked(&f).await;
    record_auditor_output(&f, run, &canonical(), findings(false)).await;
    complete(&f.pool, complete_input(run)).await.unwrap();
    assert_eq!(
        text(
            &f.pool,
            "SELECT group_concat(rule_key||'@'||content_revision, ',') FROM (SELECT rule_key, content_revision FROM draft_audits WHERE draft_variant_id = 1 AND severity = 'pass' ORDER BY rule_key)"
        )
        .await,
        "external_link@1,hashtag_limit@1,required_text@1,total_length@1"
    );
}
