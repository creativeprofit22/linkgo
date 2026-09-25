use super::*;
use crate::approval_scheduling::{schedule_approval, ScheduleApprovalInput};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::Executor;
use std::time::Duration;
use tempfile::TempDir;

const AUDIT_RULES: &str =
    r#"["hook","specificity","generic_language","authenticity","clarity","safety"]"#;
const DETERMINISTIC_RULES: &str =
    r#"["required_text","total_length","external_link","hashtag_limit"]"#;

/// Every table a review mutation may touch; snapshots prove full rollback.
const TABLES: &[&str] = &[
    "approvals",
    "drafts",
    "draft_variants",
    "agent_tool_calls",
    "agent_runs",
    "agent_run_events",
    "agent_run_approval_checkpoints",
    "workflow_runs",
    "workflow_steps",
    "workflow_step_executions",
    "workflow_events",
    "safety_audit_events",
    "error_queue_items",
    "schedule_jobs",
    "rate_limit_events",
];

struct Fixture {
    _directory: TempDir,
    pool: SqlitePool,
}

async fn migrated() -> Fixture {
    let directory = tempfile::tempdir().unwrap();
    let options = SqliteConnectOptions::new()
        .filename(directory.path().join("approvals.db"))
        .create_if_missing(true)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(10));
    crate::migrations::migrate_database(&options).await.unwrap();
    let pool = SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(options)
        .await
        .unwrap();
    pool.execute(
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Approvals','active',5);
         INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES (1,'https://example.com/a','https://example.com/a','Source','hash');
         INSERT INTO candidate_posts (id,campaign_id,target_post_id) VALUES (1,1,1);
         INSERT INTO drafts (id,campaign_id,candidate_post_id,status) VALUES (1,1,1,'ready_for_review');
         INSERT INTO draft_variants (id,draft_id,variant_number,hook,body,status) VALUES (1,1,1,'We learned from 12 customer interviews','Our team tested a specific change.','selected');",
    )
    .await
    .unwrap();
    Fixture {
        _directory: directory,
        pool,
    }
}

async fn deterministic_and_ai_evidence(pool: &SqlitePool) {
    pool.execute(
        format!(
            "DELETE FROM draft_audits WHERE draft_variant_id=1 AND severity <> 'block';
             INSERT INTO draft_audits (draft_variant_id,rule_key,severity,message) SELECT 1,value,'pass','Deterministic check passed' FROM json_each('{DETERMINISTIC_RULES}');
             INSERT INTO draft_ai_audit_runs (draft_variant_id,content_revision,provider_key,status,completed_at) SELECT id,content_revision,'dry_run','completed',datetime('now') FROM draft_variants WHERE id=1;
             INSERT INTO draft_ai_audit_findings (audit_run_id,rule_key,severity,message) SELECT (SELECT MAX(id) FROM draft_ai_audit_runs),value,'pass','Checked current text' FROM json_each('{AUDIT_RULES}');"
        )
        .as_str(),
    )
    .await
    .unwrap();
}

async fn quality(pool: &SqlitePool, status: &str, score: Option<i64>) {
    sqlx::query(
        "INSERT INTO draft_quality_runs (draft_variant_id,starting_content_revision,current_content_revision,provider_key,status,final_score,completed_at)
         SELECT id,content_revision,content_revision,'dry_run',?1,?2,datetime('now') FROM draft_variants WHERE id=1",
    )
    .bind(status)
    .bind(score)
    .execute(pool)
    .await
    .unwrap();
}

async fn ready(pool: &SqlitePool) {
    deterministic_and_ai_evidence(pool).await;
    quality(pool, "passed", Some(80)).await;
}

async fn ready_fixture() -> Fixture {
    let fixture = migrated().await;
    ready(&fixture.pool).await;
    fixture
}

fn create_input() -> CreateApprovalInput {
    CreateApprovalInput {
        draft_id: 1,
        reviewer_notes: Some("  Looks good  ".to_string()),
    }
}

fn status_input(
    status: &str,
    revision: Option<i64>,
    notes: Option<&str>,
) -> SetApprovalStatusInput {
    SetApprovalStatusInput {
        id: 1,
        status: status.to_string(),
        content_revision: revision,
        reviewer_notes: notes.map(str::to_string),
    }
}

async fn text(pool: &SqlitePool, sql: &str) -> String {
    sqlx::query_scalar(sql).fetch_one(pool).await.unwrap()
}

async fn number(pool: &SqlitePool, sql: &str) -> i64 {
    sqlx::query_scalar(sql).fetch_one(pool).await.unwrap()
}

async fn snapshot(pool: &SqlitePool) -> Vec<String> {
    let mut rows = Vec::new();
    for table in TABLES {
        let columns: Vec<String> =
            sqlx::query_scalar(&format!("SELECT name FROM pragma_table_info('{table}')"))
                .fetch_all(pool)
                .await
                .unwrap();
        let sql = format!(
            "SELECT COALESCE(json_group_array(json_array({})), '[]') FROM (SELECT * FROM {table} ORDER BY rowid)",
            columns.join(",")
        );
        rows.push(format!("{table}:{}", text(pool, &sql).await));
    }
    rows
}

/// Links a waiting schedule_post agent run and its workflow to approval 1.
async fn seed_waiting_agent(pool: &SqlitePool) {
    pool.execute(
        "INSERT INTO workflow_runs (id,campaign_id,title,status,current_step_key) VALUES (1,1,'Flow','waiting_approval','schedule');
         INSERT INTO workflow_steps (id,workflow_run_id,step_key,title,sort_order,status) VALUES
            (1,1,'draft','Draft',1,'completed'),(2,1,'schedule','Schedule',2,'waiting_approval');
         INSERT INTO agent_runs (id,campaign_id,workflow_run_id,workflow_step_id,agent_role,provider_key,status)
            VALUES (1,1,1,2,'scheduler','dry_run','waiting_approval');
         INSERT INTO agent_tool_calls (id,agent_run_id,tool_name,status,requires_approval)
            VALUES (1,1,'schedule_post','waiting_approval',1);
         INSERT INTO workflow_step_executions (id,workflow_step_id,agent_run_id,executor_role,status)
            VALUES (1,2,1,'scheduler','waiting_approval');
         INSERT INTO agent_run_approval_checkpoints (agent_run_id,pending_tool_call_id,approval_id,phase,messages_json,iteration_count)
            VALUES (1,1,1,'waiting_approval','[]',1);",
    )
    .await
    .unwrap();
}

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

#[test]
fn transition_matrix_matches_review_lifecycle() {
    use ApprovalStatus::*;
    let all = [
        NeedsReview,
        ChangesRequested,
        Approved,
        Rejected,
        Scheduled,
        Published,
        Cancelled,
    ];
    let allowed = [
        (NeedsReview, Approved),
        (NeedsReview, ChangesRequested),
        (NeedsReview, Rejected),
        (NeedsReview, Cancelled),
        (ChangesRequested, NeedsReview),
        (ChangesRequested, Approved),
        (ChangesRequested, Rejected),
        (ChangesRequested, Cancelled),
        (Approved, NeedsReview),
        (Approved, ChangesRequested),
        (Approved, Cancelled),
        (Cancelled, NeedsReview),
    ];
    for current in all {
        assert_eq!(ApprovalStatus::parse(current.as_str()), Some(current));
        for next in all {
            assert_eq!(
                assert_transition(current, next).is_ok(),
                allowed.contains(&(current, next)),
                "{current:?} -> {next:?}"
            );
        }
    }
    assert_eq!(ApprovalStatus::parse("published_later"), None);
}

#[test]
fn create_eligibility_rejects_in_documented_order() {
    let ready = CreateFacts {
        campaign_id: 1,
        campaign_status: "active".into(),
        draft_status: "ready_for_review".into(),
        selected_variant_id: Some(7),
        selected_count: 1,
        current_revision_ready: true,
        block_audit_count: 0,
        existing_approval_count: 0,
    };
    assert_eq!(evaluate_create(&ready), Ok(7));
    let cases: Vec<(CreateFacts, &str)> = vec![
        (
            CreateFacts {
                campaign_status: "archived".into(),
                ..ready.clone()
            },
            "Campaign is archived",
        ),
        (
            CreateFacts {
                draft_status: "drafting".into(),
                ..ready.clone()
            },
            "Draft is not ready for review",
        ),
        (
            CreateFacts {
                selected_variant_id: None,
                selected_count: 0,
                ..ready.clone()
            },
            "Select a draft variant before review",
        ),
        (
            CreateFacts {
                selected_count: 2,
                ..ready.clone()
            },
            "Select a draft variant before review",
        ),
        (
            CreateFacts {
                current_revision_ready: false,
                ..ready.clone()
            },
            NOT_READY_FOR_APPROVAL_ERROR,
        ),
        (
            CreateFacts {
                block_audit_count: 1,
                ..ready.clone()
            },
            "Blocked variants cannot be sent for approval",
        ),
        (
            CreateFacts {
                existing_approval_count: 1,
                ..ready.clone()
            },
            "Draft already has an approval record",
        ),
    ];
    for (facts, message) in cases {
        assert_eq!(evaluate_create(&facts), Err(message));
    }
}

#[test]
fn native_input_validation_fails_closed() {
    assert!(validate_create(CreateApprovalInput {
        draft_id: 0,
        reviewer_notes: None
    })
    .is_err());
    assert!(validate_create(CreateApprovalInput {
        draft_id: 1,
        reviewer_notes: Some("x".repeat(1001))
    })
    .is_err());
    assert_eq!(
        validate_create(create_input())
            .map(|v| v.reviewer_notes)
            .ok(),
        Some("Looks good".to_string())
    );
    assert!(validate_set_status(status_input("approved", None, None)).is_err());
    assert!(validate_set_status(status_input("approved", Some(0), None)).is_err());
    assert!(validate_set_status(status_input("unknown", None, None)).is_err());
    let mut bad_id = status_input("rejected", None, None);
    bad_id.id = -1;
    assert!(validate_set_status(bad_id).is_err());
    assert!(serde_json::from_value::<SetApprovalStatusInput>(
        json!({"id":1,"status":"approved","contentRevision":1,"sql":"DROP TABLE approvals"})
    )
    .is_err());
    assert!(
        serde_json::from_value::<CreateApprovalInput>(json!({"draftId":1,"extra":true})).is_err()
    );
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

#[tokio::test]
async fn create_writes_one_needs_review_row() {
    let f = ready_fixture().await;
    let id = create_approval(&f.pool, create_input()).await.unwrap();
    assert_eq!(id, 1);
    assert_eq!(
        text(
            &f.pool,
            "SELECT status || ':' || reviewer_notes || ':' || reviewed_content_revision FROM approvals"
        )
        .await,
        "needs_review:Looks good:1"
    );
    assert_eq!(number(&f.pool, "SELECT COUNT(*) FROM approvals").await, 1);
}

async fn assert_create_rejected(f: &Fixture, expected: &str) {
    let before = snapshot(&f.pool).await;
    assert_eq!(
        create_approval(&f.pool, create_input()).await.unwrap_err(),
        expected
    );
    assert_eq!(snapshot(&f.pool).await, before);
}

#[tokio::test]
async fn create_rejects_stale_revision() {
    let f = ready_fixture().await;
    f.pool
        .execute("UPDATE draft_variants SET body='An unchecked edit' WHERE id=1")
        .await
        .unwrap();
    assert_create_rejected(&f, NOT_READY_FOR_APPROVAL_ERROR).await;
}

#[tokio::test]
async fn create_rejects_block_audit_from_any_revision() {
    let f = ready_fixture().await;
    f.pool
        .execute("INSERT INTO draft_audits (draft_variant_id,rule_key,severity,message) VALUES (1,'external_link','block','Old revision link')")
        .await
        .unwrap();
    f.pool
        .execute("UPDATE draft_variants SET body='A fixed revision' WHERE id=1")
        .await
        .unwrap();
    ready(&f.pool).await;
    assert_create_rejected(&f, "Blocked variants cannot be sent for approval").await;
}

#[tokio::test]
async fn create_rejects_insufficient_quality_or_missing_ai_audit() {
    for case in ["low", "failed", "missing_quality", "missing_ai_audit"] {
        let f = migrated().await;
        match case {
            "low" => {
                deterministic_and_ai_evidence(&f.pool).await;
                quality(&f.pool, "needs_revision", Some(60)).await;
            }
            "failed" => {
                deterministic_and_ai_evidence(&f.pool).await;
                quality(&f.pool, "failed", None).await;
            }
            "missing_quality" => deterministic_and_ai_evidence(&f.pool).await,
            _ => quality(&f.pool, "passed", Some(90)).await,
        }
        assert_create_rejected(&f, NOT_READY_FOR_APPROVAL_ERROR).await;
    }
}

#[tokio::test]
async fn create_rejects_archived_campaign_and_duplicate() {
    let f = ready_fixture().await;
    create_approval(&f.pool, create_input()).await.unwrap();
    assert_create_rejected(&f, "Draft already has an approval record").await;
    f.pool
        .execute("UPDATE campaigns SET status='archived'")
        .await
        .unwrap();
    assert_create_rejected(&f, "Campaign is archived").await;
}

#[tokio::test]
async fn create_rejects_unknown_draft() {
    let f = ready_fixture().await;
    let mut input = create_input();
    input.draft_id = 99;
    assert_eq!(
        create_approval(&f.pool, input).await.unwrap_err(),
        "Draft was not found"
    );
}

// ---------------------------------------------------------------------------
// Set status
// ---------------------------------------------------------------------------

async fn created() -> Fixture {
    let f = ready_fixture().await;
    create_approval(&f.pool, create_input()).await.unwrap();
    f
}

#[tokio::test]
async fn approve_stamps_reviewed_revision_and_time() {
    let f = created().await;
    set_approval_status(&f.pool, status_input("approved", Some(1), Some("Ship it")))
        .await
        .unwrap();
    assert_eq!(
        text(
            &f.pool,
            "SELECT status || ':' || reviewer_notes || ':' || reviewed_content_revision || ':' || (approved_at IS NOT NULL) || ':' || (rejected_at IS NULL) FROM approvals"
        )
        .await,
        "approved:Ship it:1:1:1"
    );
}

#[tokio::test]
async fn approve_with_stale_revision_is_rejected_without_writes() {
    let f = created().await;
    let before = snapshot(&f.pool).await;
    assert_eq!(
        set_approval_status(&f.pool, status_input("approved", Some(2), None))
            .await
            .unwrap_err(),
        STALE_APPROVAL_ERROR
    );
    assert_eq!(snapshot(&f.pool).await, before);

    // An edit after review revokes readiness even for the reviewed revision.
    f.pool
        .execute("UPDATE draft_variants SET body='Edited after review' WHERE id=1")
        .await
        .unwrap();
    let before = snapshot(&f.pool).await;
    assert_eq!(
        set_approval_status(&f.pool, status_input("approved", Some(1), None))
            .await
            .unwrap_err(),
        STALE_APPROVAL_ERROR
    );
    assert_eq!(snapshot(&f.pool).await, before);
}

#[tokio::test]
async fn illegal_transition_and_archived_campaign_are_rejected() {
    let f = created().await;
    set_approval_status(&f.pool, status_input("rejected", None, None))
        .await
        .unwrap();
    let before = snapshot(&f.pool).await;
    assert_eq!(
        set_approval_status(&f.pool, status_input("approved", Some(1), None))
            .await
            .unwrap_err(),
        "Unsupported approval transition"
    );
    assert_eq!(snapshot(&f.pool).await, before);

    let f = created().await;
    f.pool
        .execute("UPDATE campaigns SET status='archived'")
        .await
        .unwrap();
    assert_eq!(
        set_approval_status(&f.pool, status_input("cancelled", None, None))
            .await
            .unwrap_err(),
        "Campaign is archived"
    );
}

#[tokio::test]
async fn changes_requested_and_needs_review_update_draft_status() {
    let f = created().await;
    set_approval_status(
        &f.pool,
        status_input("changes_requested", None, Some("Tighten")),
    )
    .await
    .unwrap();
    assert_eq!(
        text(&f.pool, "SELECT status FROM drafts").await,
        "needs_revision"
    );
    set_approval_status(&f.pool, status_input("needs_review", None, None))
        .await
        .unwrap();
    assert_eq!(
        text(&f.pool, "SELECT status FROM drafts").await,
        "ready_for_review"
    );
    assert_eq!(
        text(
            &f.pool,
            "SELECT status || ':' || reviewer_notes FROM approvals"
        )
        .await,
        "needs_review:Tighten"
    );
}

#[tokio::test]
async fn reject_settles_agents_audit_and_error_queue() {
    let f = created().await;
    seed_waiting_agent(&f.pool).await;
    set_approval_status(&f.pool, status_input("rejected", None, Some("Off brand")))
        .await
        .unwrap();
    let p = &f.pool;
    assert_eq!(
        text(
            p,
            "SELECT status || ':' || (rejected_at IS NOT NULL) FROM approvals"
        )
        .await,
        "rejected:1"
    );
    assert_eq!(
        text(
            p,
            "SELECT status || ':' || error_message FROM agent_tool_calls"
        )
        .await,
        "rejected:Approval rejected: Off brand"
    );
    assert_eq!(
        text(p, "SELECT status || ':' || error_message FROM agent_runs").await,
        "cancelled:Approval rejected: Off brand"
    );
    assert_eq!(
        text(p, "SELECT status FROM workflow_step_executions").await,
        "cancelled"
    );
    assert_eq!(
        text(p, "SELECT status FROM workflow_steps WHERE id=2").await,
        "blocked"
    );
    assert_eq!(
        text(
            p,
            "SELECT status || ':' || current_step_key FROM workflow_runs"
        )
        .await,
        "blocked:schedule"
    );
    assert_eq!(
        text(
            p,
            "SELECT event_type || ':' || summary FROM workflow_events WHERE event_type='step_blocked'"
        )
        .await,
        "step_blocked:Schedule blocked"
    );
    assert_eq!(
        text(
            p,
            "SELECT summary FROM agent_run_events WHERE event_type='run_cancelled'"
        )
        .await,
        "Agent run cancelled after approval rejection: Off brand"
    );
    assert_eq!(
        number(p, "SELECT COUNT(*) FROM agent_run_approval_checkpoints").await,
        0
    );
    assert_eq!(
        text(
            p,
            "SELECT json_extract(metadata_json,'$.reviewerNotes') FROM safety_audit_events WHERE event_type='approval_rejected'"
        )
        .await,
        "Off brand"
    );
    assert_eq!(
        text(
            p,
            "SELECT source_type || ':' || source_id || ':' || title || ':' || detail || ':' || status FROM error_queue_items"
        )
        .await,
        "approval:1:Approval rejected:Off brand:open"
    );
    assert_eq!(
        number(
            p,
            "SELECT COUNT(*) FROM safety_audit_events WHERE event_type='error_item_created' AND subject_type='error_queue_item'"
        )
        .await,
        1
    );
}

#[tokio::test]
async fn reject_without_notes_uses_default_detail_and_updates_open_error() {
    let f = created().await;
    f.pool
        .execute("INSERT INTO error_queue_items (campaign_id,source_type,source_id,title,detail,severity,status) VALUES (1,'approval',1,'Old','Old detail','critical','open')")
        .await
        .unwrap();
    set_approval_status(&f.pool, status_input("rejected", None, Some("   ")))
        .await
        .unwrap();
    assert_eq!(
        text(
            &f.pool,
            "SELECT title || ':' || detail || ':' || severity FROM error_queue_items"
        )
        .await,
        format!("Approval rejected:{DEFAULT_REJECTION_DETAIL}:warning")
    );
    assert_eq!(
        number(
            &f.pool,
            "SELECT COUNT(*) FROM safety_audit_events WHERE event_type='error_item_updated'"
        )
        .await,
        1
    );
}

// ---------------------------------------------------------------------------
// Rollback after each intermediate write
// ---------------------------------------------------------------------------

async fn fail_on(pool: &SqlitePool, timing_and_target: &str) {
    pool.execute(
        format!(
            "CREATE TRIGGER inject_failure {timing_and_target} BEGIN SELECT RAISE(ABORT, 'private injected failure'); END;"
        )
        .as_str(),
    )
    .await
    .unwrap();
}

#[tokio::test]
async fn create_rolls_back_when_approval_insert_fails() {
    let f = ready_fixture().await;
    fail_on(&f.pool, "BEFORE INSERT ON approvals").await;
    let before = snapshot(&f.pool).await;
    assert_eq!(
        create_approval(&f.pool, create_input()).await.unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool).await, before);
}

#[tokio::test]
async fn status_writes_roll_back_after_each_failure_point() {
    let reject_points = [
        "BEFORE UPDATE ON approvals",
        "BEFORE UPDATE ON agent_tool_calls",
        "BEFORE UPDATE ON agent_runs",
        "BEFORE UPDATE ON workflow_step_executions",
        "BEFORE UPDATE ON workflow_steps",
        "BEFORE UPDATE ON workflow_runs",
        "BEFORE INSERT ON workflow_events",
        "BEFORE INSERT ON agent_run_events",
        "BEFORE DELETE ON agent_run_approval_checkpoints",
        "BEFORE INSERT ON safety_audit_events WHEN NEW.event_type = 'approval_rejected'",
        "BEFORE INSERT ON error_queue_items",
        "BEFORE INSERT ON safety_audit_events WHEN NEW.event_type = 'error_item_created'",
    ];
    let cases = reject_points
        .iter()
        .map(|point| ("rejected", *point))
        .chain([
            ("changes_requested", "BEFORE UPDATE ON drafts"),
            ("approved", "BEFORE UPDATE ON approvals"),
        ]);
    for (status, point) in cases {
        let f = created().await;
        seed_waiting_agent(&f.pool).await;
        fail_on(&f.pool, point).await;
        let before = snapshot(&f.pool).await;
        let revision = (status == "approved").then_some(1);
        let error = set_approval_status(&f.pool, status_input(status, revision, Some("Off brand")))
            .await
            .unwrap_err();
        assert!(
            error == STORAGE_ERROR || error == crate::agent_continuations::SETTLEMENT_ERROR,
            "{status} {point}: {error}"
        );
        assert_eq!(snapshot(&f.pool).await, before, "{status} {point}");
    }
}

#[tokio::test]
async fn needs_review_rolls_back_when_draft_update_fails() {
    let f = created().await;
    set_approval_status(&f.pool, status_input("cancelled", None, None))
        .await
        .unwrap();
    fail_on(&f.pool, "BEFORE UPDATE ON drafts").await;
    let before = snapshot(&f.pool).await;
    assert_eq!(
        set_approval_status(&f.pool, status_input("needs_review", None, None))
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool).await, before);
}

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

#[tokio::test]
async fn concurrent_creates_insert_exactly_one_approval() {
    let f = ready_fixture().await;
    let (first, second) = tokio::join!(
        create_approval(&f.pool, create_input()),
        create_approval(&f.pool, create_input())
    );
    let outcomes = [first, second];
    assert_eq!(outcomes.iter().filter(|r| r.is_ok()).count(), 1);
    assert!(outcomes
        .iter()
        .any(|r| r.as_ref().err().map(String::as_str)
            == Some("Draft already has an approval record")));
    assert_eq!(number(&f.pool, "SELECT COUNT(*) FROM approvals").await, 1);
}

#[tokio::test]
async fn concurrent_approve_and_reject_settle_one_consistent_state() {
    let f = created().await;
    seed_waiting_agent(&f.pool).await;
    let (approve, reject) = tokio::join!(
        set_approval_status(&f.pool, status_input("approved", Some(1), None)),
        set_approval_status(&f.pool, status_input("rejected", None, Some("No")))
    );
    let final_status = text(&f.pool, "SELECT status FROM approvals").await;
    let checkpoints = number(
        &f.pool,
        "SELECT COUNT(*) FROM agent_run_approval_checkpoints",
    )
    .await;
    let rejection_audits = number(
        &f.pool,
        "SELECT COUNT(*) FROM safety_audit_events WHERE event_type='approval_rejected'",
    )
    .await;
    match final_status.as_str() {
        // Reject won the last write; either approve ran first (both Ok) or
        // approve observed the terminal rejection and was refused.
        "rejected" => {
            assert!(reject.is_ok());
            if let Err(error) = approve {
                assert_eq!(error, "Unsupported approval transition");
            }
            assert_eq!((checkpoints, rejection_audits), (0, 1));
        }
        // Approve after reject is impossible (rejected is terminal), so
        // reject must have seen `approved` and been refused.
        "approved" => {
            assert!(approve.is_ok());
            assert_eq!(reject.unwrap_err(), "Unsupported approval transition");
            assert_eq!((checkpoints, rejection_audits), (1, 0));
        }
        other => panic!("unexpected final status {other}"),
    }
}

// ---------------------------------------------------------------------------
// Direct native schedule rejection
// ---------------------------------------------------------------------------

async fn approved() -> Fixture {
    let f = created().await;
    set_approval_status(&f.pool, status_input("approved", Some(1), None))
        .await
        .unwrap();
    f
}

fn schedule_input() -> ScheduleApprovalInput {
    ScheduleApprovalInput {
        approval_id: 1,
        scheduled_for: "2026-12-01T10:00:00Z".to_string(),
        timezone: "UTC".to_string(),
    }
}

#[tokio::test]
async fn ready_approved_approval_schedules() {
    let f = approved().await;
    schedule_approval(&f.pool, schedule_input()).await.unwrap();
    assert_eq!(
        text(&f.pool, "SELECT status FROM approvals").await,
        "scheduled"
    );
}

#[tokio::test]
async fn schedule_rejects_stale_blocked_or_low_quality_approval() {
    for mutation in [
        // Stale: keep `approved` by bypassing the revocation trigger.
        "DROP TRIGGER approvals_revoke_on_revision_change; UPDATE draft_variants SET body='Edited after approval' WHERE id=1",
        "UPDATE draft_audits SET severity='block' WHERE rule_key='total_length'",
        "UPDATE draft_ai_audit_findings SET severity='block' WHERE rule_key='safety'",
        "INSERT INTO draft_quality_runs (draft_variant_id,starting_content_revision,current_content_revision,provider_key,status,final_score,completed_at) VALUES (1,1,1,'dry_run','needs_revision',55,datetime('now'))",
        "INSERT INTO draft_quality_runs (draft_variant_id,starting_content_revision,current_content_revision,provider_key,status,completed_at) VALUES (1,1,1,'dry_run','failed',datetime('now'))",
    ] {
        let f = approved().await;
        f.pool.execute(mutation).await.unwrap();
        assert_eq!(
            text(&f.pool, "SELECT status FROM approvals").await,
            "approved",
            "{mutation}"
        );
        assert_eq!(
            schedule_approval(&f.pool, schedule_input())
                .await
                .unwrap_err(),
            STALE_APPROVAL_ERROR,
            "{mutation}"
        );
        assert_eq!(number(&f.pool, "SELECT COUNT(*) FROM schedule_jobs").await, 0);
        assert_eq!(
            number(&f.pool, "SELECT COUNT(*) FROM rate_limit_events").await,
            0
        );
    }
}

// ---------------------------------------------------------------------------
// Publish readiness gate
// ---------------------------------------------------------------------------

/// Runs the shared read-only gate the publish preflight and posting command use.
async fn check_publish_ready(pool: &SqlitePool, approval_id: i64) -> Result<(), String> {
    let mut connection = pool.acquire().await.map_err(storage)?;
    assert_publish_ready(&mut connection, approval_id, STORAGE_ERROR).await
}

fn publish_input() -> i64 {
    1
}

#[tokio::test]
async fn ready_approved_approval_passes_publish_gate() {
    let f = approved().await;
    check_publish_ready(&f.pool, publish_input()).await.unwrap();
}

#[tokio::test]
async fn newer_ai_audit_run_blocks_publish_without_writes() {
    for (status, completed_at) in [
        ("pending", "NULL"),
        ("running", "NULL"),
        ("failed", "datetime('now')"),
    ] {
        let f = approved().await;
        // A new AI audit on the same revision leaves the approval `approved`
        // but the variant is no longer ready.
        f.pool
            .execute(
                format!(
                    "INSERT INTO draft_ai_audit_runs (draft_variant_id,content_revision,provider_key,status,completed_at) VALUES (1,1,'dry_run','{status}',{completed_at})"
                )
                .as_str(),
            )
            .await
            .unwrap();
        assert_eq!(
            text(&f.pool, "SELECT status FROM approvals").await,
            "approved"
        );
        assert_eq!(
            check_publish_ready(&f.pool, publish_input())
                .await
                .unwrap_err(),
            STALE_APPROVAL_ERROR,
            "{status}"
        );
        let before = snapshot(&f.pool).await;
        let recorded = crate::approvals::record_publish_attempt(
            &f.pool,
            crate::approvals::RecordPublishAttemptInput {
                approval_id: 1,
                schedule_job_id: None,
                status: "succeeded".to_string(),
                external_post_url: "https://www.linkedin.com/posts/test".to_string(),
                platform_post_id: "post-1".to_string(),
                error_message: String::new(),
            },
        )
        .await;
        assert_eq!(recorded.unwrap_err(), STALE_APPROVAL_ERROR, "{status}");
        assert_eq!(
            number(&f.pool, "SELECT COUNT(*) FROM publish_attempts").await,
            0
        );
        assert_eq!(snapshot(&f.pool).await, before);
    }
}

#[tokio::test]
async fn unready_publish_failure_is_recorded_and_revokes_approval() {
    let f = approved().await;
    f.pool
        .execute("UPDATE draft_ai_audit_findings SET severity='block' WHERE rule_key='safety'")
        .await
        .unwrap();
    crate::approvals::record_publish_attempt(
        &f.pool,
        crate::approvals::RecordPublishAttemptInput {
            approval_id: 1,
            schedule_job_id: None,
            status: "failed".to_string(),
            external_post_url: String::new(),
            platform_post_id: String::new(),
            error_message: "network error".to_string(),
        },
    )
    .await
    .unwrap();
    assert_eq!(
        number(&f.pool, "SELECT COUNT(*) FROM publish_attempts").await,
        1
    );
    assert_eq!(
        text(&f.pool, "SELECT status FROM approvals").await,
        "changes_requested"
    );
}

#[tokio::test]
async fn publish_gate_rejects_unknown_or_invalid_approval() {
    let f = approved().await;
    assert_eq!(
        check_publish_ready(&f.pool, 99).await.unwrap_err(),
        "Approval was not found"
    );
    assert!(check_publish_ready(&f.pool, 0).await.is_err());
}
