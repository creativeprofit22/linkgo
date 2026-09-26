//! Lifecycle recovery tests on real file-backed SQLite: failure, reconciliation
//! and resume must settle every linked agent/audit record with the quality run.
use super::tests::durable_snapshot;
use super::*;
use crate::agent_run_store::{start_run, StartAgentRunInput};
use crate::draft_ai_audits::{reconcile as reconcile_audits, ReconcileDraftAiAuditInput};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    Executor,
};
use std::time::Duration;

struct Fixture {
    _directory: tempfile::TempDir,
    pool: SqlitePool,
}

async fn fixture() -> Fixture {
    let directory = tempfile::tempdir().unwrap();
    let options = SqliteConnectOptions::new()
        .filename(directory.path().join("quality-lifecycle.db"))
        .create_if_missing(true)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(10));
    crate::migrations::migrate_database(&options).await.unwrap();
    let pool = SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(options)
        .await
        .unwrap();
    pool.execute("INSERT INTO campaigns (id,name,status) VALUES (1,'Quality','active');
        INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES (1,'https://example.com/a','https://example.com/a','Source','hash');
        INSERT INTO candidate_posts (id,campaign_id,target_post_id,relevance_score) VALUES (1,1,1,90);
        INSERT INTO drafts (id,campaign_id,candidate_post_id,status) VALUES (1,1,1,'ready_for_review');
        INSERT INTO draft_variants (id,draft_id,variant_number,hook,body,status) VALUES (1,1,1,'Original hook','Original body','selected');
        INSERT INTO draft_ai_audit_runs (id,draft_variant_id,content_revision,provider_key,status,completed_at) VALUES (1,1,1,'dry_run','completed',datetime('now'));").await.unwrap();
    complete_audit_findings(&pool, 1).await;
    Fixture {
        _directory: directory,
        pool,
    }
}

async fn complete_audit_findings(pool: &SqlitePool, audit_id: i64) {
    for key in AUDIT_RULES {
        sqlx::query("INSERT INTO draft_ai_audit_findings (audit_run_id,rule_key,severity,message) VALUES (?1,?2,'pass','Evidence')")
            .bind(audit_id).bind(key).execute(pool).await.unwrap();
    }
}

async fn claim(pool: &SqlitePool) -> ClaimPayload {
    claim_with_pool(
        pool,
        ClaimInput {
            draft_variant_id: 1,
            provider_key: "dry_run".into(),
            model_name: "dry-run-local".into(),
        },
    )
    .await
    .unwrap()
}

async fn start(pool: &SqlitePool, agent_run_id: i64) -> Result<(), String> {
    start_run(
        pool,
        StartAgentRunInput {
            id: agent_run_id,
            claim: true,
        },
    )
    .await
    .map(|_| ())
}

fn run_input(quality_run_id: i64) -> RunInput {
    RunInput {
        quality_run_id,
        draft_variant_id: 1,
    }
}

fn fail_input(quality_run_id: i64, attempt_id: i64) -> FailInput {
    FailInput {
        quality_run_id,
        draft_variant_id: 1,
        attempt_id,
        error_message: "Provider failed".into(),
    }
}

async fn text(pool: &SqlitePool, sql: &str, id: i64) -> String {
    sqlx::query_scalar(sql)
        .bind(id)
        .fetch_one(pool)
        .await
        .unwrap()
}

async fn agent_status(pool: &SqlitePool, id: i64) -> String {
    text(pool, "SELECT status FROM agent_runs WHERE id=?1", id).await
}

async fn audit_status(pool: &SqlitePool, id: i64) -> String {
    text(
        pool,
        "SELECT status FROM draft_ai_audit_runs WHERE id=?1",
        id,
    )
    .await
}

async fn run_status(pool: &SqlitePool, id: i64) -> String {
    text(
        pool,
        "SELECT status FROM draft_quality_runs WHERE id=?1",
        id,
    )
    .await
}

async fn count(pool: &SqlitePool, sql: &str, id: i64) -> i64 {
    sqlx::query_scalar(sql)
        .bind(id)
        .fetch_one(pool)
        .await
        .unwrap()
}

async fn failed_events(pool: &SqlitePool, agent_run_id: i64) -> i64 {
    count(
        pool,
        "SELECT COUNT(*) FROM agent_run_events WHERE agent_run_id=?1 AND event_type='run_failed'",
        agent_run_id,
    )
    .await
}

async fn checkpoints(pool: &SqlitePool, agent_run_id: i64) -> i64 {
    count(
        pool,
        "SELECT COUNT(*) FROM agent_run_approval_checkpoints WHERE agent_run_id=?1",
        agent_run_id,
    )
    .await
}

/// Parks an agent in `waiting_approval` with a durable approval checkpoint.
async fn park_for_approval(pool: &SqlitePool, agent_run_id: i64) {
    pool.execute(
        "DROP TRIGGER IF EXISTS approvals_validate_insert;
         DROP TRIGGER IF EXISTS approvals_bind_insert;
         INSERT OR IGNORE INTO approvals (id,campaign_id,draft_id,draft_variant_id,status) VALUES (1,1,1,1,'approved');",
    )
    .await
    .unwrap();
    let call = sqlx::query("INSERT INTO agent_tool_calls (agent_run_id,tool_name,status,input_json,output_json) VALUES (?1,'score_draft_quality','waiting_approval','{}','{}')")
        .bind(agent_run_id).execute(pool).await.unwrap().last_insert_rowid();
    sqlx::query("INSERT INTO agent_run_approval_checkpoints (agent_run_id,pending_tool_call_id,approval_id,phase,messages_json,iteration_count) VALUES (?1,?2,1,'waiting_approval','[]',1)")
        .bind(agent_run_id).bind(call).execute(pool).await.unwrap();
    sqlx::query("UPDATE agent_runs SET status='waiting_approval' WHERE id=?1")
        .bind(agent_run_id)
        .execute(pool)
        .await
        .unwrap();
}

fn scores(value: i64) -> Vec<CategoryScore> {
    CATEGORIES
        .iter()
        .map(|key| CategoryScore {
            category_key: (*key).into(),
            score: value,
            feedback: "Grounded feedback".into(),
        })
        .collect()
}

fn rewrite() -> Rewrite {
    Rewrite {
        hook: "A sharper hook for operators".into(),
        body: "We cut review time from 40 to 12 minutes by pairing drafts with a checklist.".into(),
        cta: "What would you check first?".into(),
        hashtags: "#Operations".into(),
    }
}

/// Completes the scorer with durable evidence and returns the apply input.
async fn completed_scorer(
    pool: &SqlitePool,
    claim: &ClaimPayload,
    value: i64,
    with_rewrite: bool,
) -> ApplyScoreInput {
    let context: String =
        sqlx::query_scalar("SELECT input_context_json FROM agent_runs WHERE id=?1")
            .bind(claim.agent_run_id)
            .fetch_one(pool)
            .await
            .unwrap();
    let category_scores = scores(value);
    let rewrite = with_rewrite.then(rewrite);
    let mut request =
        serde_json::from_str::<serde_json::Value>(&context).unwrap()["qualityRequest"].clone();
    request["categoryScores"] = json!(category_scores);
    let mut output = json!({"campaignId":1,"draftVariantId":1,"qualityRunId":claim.quality_run_id,"attemptId":claim.attempt_id,"contentRevision":claim.content_revision,"categoryScores":category_scores,"summary":"Scored."});
    if let Some(rewrite) = &rewrite {
        request["rewrite"] = json!(rewrite);
        output["rewrite"] = json!(rewrite);
    }
    sqlx::query(
        "UPDATE agent_runs SET status='completed',completed_at=datetime('now') WHERE id=?1",
    )
    .bind(claim.agent_run_id)
    .execute(pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO agent_tool_calls (agent_run_id,tool_name,status,input_json,output_json,completed_at) VALUES (?1,'score_draft_quality','completed',?2,?3,datetime('now'))")
        .bind(claim.agent_run_id).bind(request.to_string()).bind(output.to_string()).execute(pool).await.unwrap();
    ApplyScoreInput {
        quality_run_id: claim.quality_run_id,
        draft_variant_id: 1,
        attempt_id: claim.attempt_id,
        content_revision: claim.content_revision,
        agent_run_id: claim.agent_run_id,
        category_scores,
        rewrite,
        summary: "Scored.".into(),
    }
}

/// Claim, start and score below threshold with a rewrite: the run then awaits
/// its rewrite AI audit, whose auditor agent is started (running).
async fn awaiting_rewrite_audit(pool: &SqlitePool) -> (ClaimPayload, i64, i64) {
    let claim = claim(pool).await;
    start(pool, claim.agent_run_id).await.unwrap();
    let input = completed_scorer(pool, &claim, 50, true).await;
    let settled = apply_with_pool(pool, input).await.unwrap();
    assert_eq!(settled.status, "awaiting_audit");
    let audit = settled.ai_audit_run_id.unwrap();
    let audit_agent = settled.agent_run_id.unwrap();
    start(pool, audit_agent).await.unwrap();
    (claim, audit, audit_agent)
}

async fn age_everything(pool: &SqlitePool, minutes: i64) {
    let modifier = format!("-{minutes} minutes");
    for table in ["draft_quality_runs", "agent_runs", "draft_ai_audit_runs"] {
        sqlx::query(&format!("UPDATE {table} SET updated_at=datetime('now',?1)"))
            .bind(&modifier)
            .execute(pool)
            .await
            .unwrap();
    }
}

#[tokio::test]
async fn fail_settles_linked_scorer_agent_events_and_checkpoint() {
    let f = fixture().await;
    let claim = claim(&f.pool).await;
    start(&f.pool, claim.agent_run_id).await.unwrap();
    park_for_approval(&f.pool, claim.agent_run_id).await;

    fail_with_pool(&f.pool, fail_input(claim.quality_run_id, claim.attempt_id))
        .await
        .unwrap();

    assert_eq!(run_status(&f.pool, claim.quality_run_id).await, "failed");
    assert_eq!(agent_status(&f.pool, claim.agent_run_id).await, "failed");
    assert_eq!(failed_events(&f.pool, claim.agent_run_id).await, 1);
    assert_eq!(checkpoints(&f.pool, claim.agent_run_id).await, 0);
    let active: Option<i64> =
        sqlx::query_scalar("SELECT active_agent_run_id FROM draft_quality_runs WHERE id=?1")
            .bind(claim.quality_run_id)
            .fetch_one(&f.pool)
            .await
            .unwrap();
    assert_eq!(active, None);
}

#[tokio::test]
async fn fail_while_awaiting_rewrite_audit_settles_audit_and_its_agent() {
    let f = fixture().await;
    let (claim, audit, audit_agent) = awaiting_rewrite_audit(&f.pool).await;

    fail_with_pool(&f.pool, fail_input(claim.quality_run_id, claim.attempt_id))
        .await
        .unwrap();

    assert_eq!(run_status(&f.pool, claim.quality_run_id).await, "failed");
    assert_eq!(audit_status(&f.pool, audit).await, "failed");
    assert_eq!(agent_status(&f.pool, audit_agent).await, "failed");
    assert_eq!(failed_events(&f.pool, audit_agent).await, 1);
    // The completed scorer is terminal history and must not be rewritten.
    assert_eq!(agent_status(&f.pool, claim.agent_run_id).await, "completed");
    assert_eq!(failed_events(&f.pool, claim.agent_run_id).await, 0);
}

#[tokio::test]
async fn reconcile_settles_linked_scorer_and_is_idempotent() {
    let f = fixture().await;
    let claim = claim(&f.pool).await;
    start(&f.pool, claim.agent_run_id).await.unwrap();
    age_everything(&f.pool, 20).await;

    let first = reconcile_with_pool(&f.pool, ReconcileInput { limit: 25 })
        .await
        .unwrap();
    assert_eq!(first.reconciled_run_ids, vec![claim.quality_run_id]);
    assert_eq!(agent_status(&f.pool, claim.agent_run_id).await, "failed");
    assert_eq!(failed_events(&f.pool, claim.agent_run_id).await, 1);

    let snapshot = durable_snapshot(&f.pool).await;
    let second = reconcile_with_pool(&f.pool, ReconcileInput { limit: 25 })
        .await
        .unwrap();
    assert!(second.reconciled_run_ids.is_empty());
    assert_eq!(durable_snapshot(&f.pool).await, snapshot);
}

#[tokio::test]
async fn reconcile_awaiting_rewrite_audit_settles_the_whole_group() {
    let f = fixture().await;
    let (claim, audit, audit_agent) = awaiting_rewrite_audit(&f.pool).await;
    age_everything(&f.pool, 20).await;

    let result = reconcile_with_pool(&f.pool, ReconcileInput { limit: 25 })
        .await
        .unwrap();

    assert_eq!(result.reconciled_run_ids, vec![claim.quality_run_id]);
    assert_eq!(audit_status(&f.pool, audit).await, "failed");
    assert_eq!(agent_status(&f.pool, audit_agent).await, "failed");
    assert_eq!(failed_events(&f.pool, audit_agent).await, 1);
}

#[tokio::test]
async fn stale_loop_cannot_reclaim_a_failed_quality_agent() {
    let f = fixture().await;
    // The loop claimed, then was interrupted before starting its provider call.
    let claim = claim(&f.pool).await;
    fail_with_pool(&f.pool, fail_input(claim.quality_run_id, claim.attempt_id))
        .await
        .unwrap();

    let restarted = start(&f.pool, claim.agent_run_id).await;

    assert!(restarted.is_err(), "failed quality agent was re-claimed");
    assert_eq!(agent_status(&f.pool, claim.agent_run_id).await, "failed");
}

#[tokio::test]
async fn failed_agent_of_settled_attempt_cannot_be_reclaimed() {
    let f = fixture().await;
    let claim = claim(&f.pool).await;
    start(&f.pool, claim.agent_run_id).await.unwrap();
    // The provider error failed the agent before the loop failed the quality run.
    sqlx::query(
        "UPDATE agent_runs SET status='failed',error_message='Provider failed' WHERE id=?1",
    )
    .bind(claim.agent_run_id)
    .execute(&f.pool)
    .await
    .unwrap();
    fail_with_pool(&f.pool, fail_input(claim.quality_run_id, claim.attempt_id))
        .await
        .unwrap();

    let restarted = start(&f.pool, claim.agent_run_id).await;

    assert!(restarted.is_err(), "failed quality agent was re-claimed");
    assert_eq!(agent_status(&f.pool, claim.agent_run_id).await, "failed");
}

#[tokio::test]
async fn late_fail_from_prior_attempt_cannot_fail_the_resumed_run() {
    let f = fixture().await;
    let claim = claim(&f.pool).await;
    fail_with_pool(&f.pool, fail_input(claim.quality_run_id, claim.attempt_id))
        .await
        .unwrap();
    let resumed = resume_with_pool(&f.pool, run_input(claim.quality_run_id))
        .await
        .unwrap();
    let snapshot = durable_snapshot(&f.pool).await;

    let late = fail_with_pool(&f.pool, fail_input(claim.quality_run_id, claim.attempt_id)).await;

    assert!(late.is_err(), "late prior-attempt failure was accepted");
    assert_eq!(durable_snapshot(&f.pool).await, snapshot);
    assert_eq!(run_status(&f.pool, claim.quality_run_id).await, "running");
    assert_eq!(agent_status(&f.pool, resumed.agent_run_id).await, "queued");
}

#[tokio::test]
async fn recent_linked_activity_defers_quality_reconcile() {
    let f = fixture().await;
    let (claim, _audit, audit_agent) = awaiting_rewrite_audit(&f.pool).await;
    age_everything(&f.pool, 20).await;
    sqlx::query("UPDATE agent_runs SET updated_at=datetime('now') WHERE id=?1")
        .bind(audit_agent)
        .execute(&f.pool)
        .await
        .unwrap();

    let result = reconcile_with_pool(&f.pool, ReconcileInput { limit: 25 })
        .await
        .unwrap();

    assert!(result.reconciled_run_ids.is_empty());
    assert_eq!(run_status(&f.pool, claim.quality_run_id).await, "running");
}

#[tokio::test]
async fn audit_reconciler_leaves_quality_owned_audits_to_the_quality_owner() {
    let f = fixture().await;
    let (claim, audit, audit_agent) = awaiting_rewrite_audit(&f.pool).await;
    // Audit lifecycle looks 40 minutes stale; the quality run itself is fresh.
    age_everything(&f.pool, 40).await;
    sqlx::query("UPDATE draft_quality_runs SET updated_at=datetime('now') WHERE id=?1")
        .bind(claim.quality_run_id)
        .execute(&f.pool)
        .await
        .unwrap();

    let result = reconcile_audits(
        &f.pool,
        ReconcileDraftAiAuditInput {
            max_audit_runs: 25,
            max_orphan_agent_runs: 25,
        },
    )
    .await
    .unwrap();

    assert!(result.failed_audit_run_ids.is_empty());
    assert_eq!(audit_status(&f.pool, audit).await, "running");
    assert_eq!(agent_status(&f.pool, audit_agent).await, "running");
    assert_eq!(run_status(&f.pool, claim.quality_run_id).await, "running");
}

#[tokio::test]
async fn concurrent_resumes_create_exactly_one_replacement_attempt() {
    let f = fixture().await;
    let claim = claim(&f.pool).await;
    fail_with_pool(&f.pool, fail_input(claim.quality_run_id, claim.attempt_id))
        .await
        .unwrap();

    let (a, b) = tokio::join!(
        resume_with_pool(&f.pool, run_input(claim.quality_run_id)),
        resume_with_pool(&f.pool, run_input(claim.quality_run_id)),
    );

    assert_eq!(
        usize::from(a.is_ok()) + usize::from(b.is_ok()),
        1,
        "{a:?} {b:?}"
    );
    assert_eq!(
        count(
            &f.pool,
            "SELECT COUNT(*) FROM draft_quality_attempts WHERE run_id=?1",
            claim.quality_run_id
        )
        .await,
        2
    );
    let agents: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM agent_runs WHERE json_extract(input_context_json,'$.qualityRequest.qualityRunId')=?1",
    )
    .bind(claim.quality_run_id)
    .fetch_one(&f.pool)
    .await
    .unwrap();
    assert_eq!(agents, 2);
    assert_eq!(run_status(&f.pool, claim.quality_run_id).await, "running");
}

/// Makes every `run_failed` agent event insert abort, simulating a failed
/// linked lifecycle write inside the settlement transaction.
async fn break_agent_failure_events(pool: &SqlitePool) {
    pool.execute(
        "CREATE TRIGGER test_break_run_failed BEFORE INSERT ON agent_run_events
         WHEN NEW.event_type='run_failed' BEGIN SELECT RAISE(ABORT,'injected'); END;",
    )
    .await
    .unwrap();
}

async fn break_audit_failure(pool: &SqlitePool) {
    pool.execute(
        "CREATE TRIGGER test_break_audit_fail BEFORE UPDATE OF status ON draft_ai_audit_runs
         WHEN NEW.status='failed' BEGIN SELECT RAISE(ABORT,'injected'); END;",
    )
    .await
    .unwrap();
}

#[tokio::test]
async fn fail_rolls_back_quality_records_when_linked_agent_write_fails() {
    let f = fixture().await;
    let claim = claim(&f.pool).await;
    start(&f.pool, claim.agent_run_id).await.unwrap();
    break_agent_failure_events(&f.pool).await;
    let snapshot = durable_snapshot(&f.pool).await;

    let result = fail_with_pool(&f.pool, fail_input(claim.quality_run_id, claim.attempt_id)).await;

    assert!(result.is_err());
    assert_eq!(durable_snapshot(&f.pool).await, snapshot);
    assert_eq!(run_status(&f.pool, claim.quality_run_id).await, "running");
}

#[tokio::test]
async fn reconcile_rolls_back_quality_records_when_linked_audit_write_fails() {
    let f = fixture().await;
    let (claim, audit, _agent) = awaiting_rewrite_audit(&f.pool).await;
    age_everything(&f.pool, 20).await;
    break_audit_failure(&f.pool).await;
    let snapshot = durable_snapshot(&f.pool).await;

    let result = reconcile_with_pool(&f.pool, ReconcileInput { limit: 25 }).await;

    assert!(result.is_err());
    assert_eq!(durable_snapshot(&f.pool).await, snapshot);
    assert_eq!(run_status(&f.pool, claim.quality_run_id).await, "running");
    assert_eq!(audit_status(&f.pool, audit).await, "running");
}

#[tokio::test]
async fn late_apply_from_prior_attempt_is_rejected_without_writes() {
    let f = fixture().await;
    let claim = claim(&f.pool).await;
    start(&f.pool, claim.agent_run_id).await.unwrap();
    // The provider finished, but the loop was reconciled before settling.
    let late = completed_scorer(&f.pool, &claim, 90, false).await;
    fail_with_pool(&f.pool, fail_input(claim.quality_run_id, claim.attempt_id))
        .await
        .unwrap();
    resume_with_pool(&f.pool, run_input(claim.quality_run_id))
        .await
        .unwrap();
    let snapshot = durable_snapshot(&f.pool).await;

    let result = apply_with_pool(&f.pool, late).await;

    assert!(result.is_err(), "late prior-attempt score was accepted");
    assert_eq!(durable_snapshot(&f.pool).await, snapshot);
}

#[tokio::test]
async fn late_start_of_prior_rewrite_auditor_is_rejected() {
    let f = fixture().await;
    let (claim, _audit, audit_agent) = awaiting_rewrite_audit(&f.pool).await;
    fail_with_pool(&f.pool, fail_input(claim.quality_run_id, claim.attempt_id))
        .await
        .unwrap();

    let restarted = start(&f.pool, audit_agent).await;

    assert!(restarted.is_err(), "settled rewrite auditor was re-claimed");
    assert_eq!(agent_status(&f.pool, audit_agent).await, "failed");
}

/// `quality_start_blocked` as reported by the Agent Runtime list read.
async fn listed_start_blocked(pool: &SqlitePool, agent_run_id: i64) -> i64 {
    let snapshot = crate::workflow_store::list_agent_runs(pool, Default::default())
        .await
        .unwrap();
    snapshot
        .runs
        .iter()
        .find(|run| run["id"].as_i64() == Some(agent_run_id))
        .and_then(|run| run["quality_start_blocked"].as_i64())
        .unwrap()
}

#[tokio::test]
async fn list_start_flag_matches_the_native_start_guard() {
    let f = fixture().await;
    let (claim, _audit, audit_agent) = awaiting_rewrite_audit(&f.pool).await;
    // Active rewrite auditor of a running run: startable.
    assert_eq!(listed_start_blocked(&f.pool, audit_agent).await, 0);
    // The scorer of the same attempt is no longer the active agent.
    assert_eq!(listed_start_blocked(&f.pool, claim.agent_run_id).await, 1);
    sqlx::query(
        "INSERT INTO agent_runs (id,campaign_id,agent_role,provider_key,status) VALUES (900,1,'researcher','dry_run','failed')",
    )
    .execute(&f.pool)
    .await
    .unwrap();
    // Unlinked agents are never blocked by quality ownership.
    assert_eq!(listed_start_blocked(&f.pool, 900).await, 0);

    fail_with_pool(&f.pool, fail_input(claim.quality_run_id, claim.attempt_id))
        .await
        .unwrap();

    assert_eq!(listed_start_blocked(&f.pool, claim.agent_run_id).await, 1);
    // The settled auditor is `failed` (restartable status), so only the
    // quality guard rejects it — and the list flag says so.
    assert_eq!(agent_status(&f.pool, audit_agent).await, "failed");
    assert_eq!(listed_start_blocked(&f.pool, audit_agent).await, 1);
    assert_eq!(
        start(&f.pool, audit_agent).await.unwrap_err(),
        "Quality attempt is no longer active"
    );
    assert_eq!(listed_start_blocked(&f.pool, 900).await, 0);
    assert!(start(&f.pool, 900).await.is_ok());
}

#[tokio::test]
async fn resume_rejects_a_revision_change() {
    let f = fixture().await;
    let claim = claim(&f.pool).await;
    fail_with_pool(&f.pool, fail_input(claim.quality_run_id, claim.attempt_id))
        .await
        .unwrap();

    // An operator edit moves the draft to a new revision: resume must refuse.
    sqlx::query("UPDATE draft_variants SET content_revision=content_revision+1 WHERE id=1")
        .execute(&f.pool)
        .await
        .unwrap();
    let snapshot = durable_snapshot(&f.pool).await;
    let changed = resume_with_pool(&f.pool, run_input(claim.quality_run_id)).await;
    assert_eq!(changed.unwrap_err(), "Draft changed before quality resume");
    assert_eq!(durable_snapshot(&f.pool).await, snapshot);
}

#[tokio::test]
async fn resume_requires_a_current_completed_audit() {
    let f = fixture().await;
    let claim = claim(&f.pool).await;
    fail_with_pool(&f.pool, fail_input(claim.quality_run_id, claim.attempt_id))
        .await
        .unwrap();
    // A failed latest AI audit blocks resume until the operator runs a fresh
    // audit (human gate).
    sqlx::query("INSERT INTO draft_ai_audit_runs (draft_variant_id,content_revision,provider_key,status,error_message,completed_at) VALUES (1,1,'dry_run','failed','Provider failed',datetime('now'))")
        .execute(&f.pool)
        .await
        .unwrap();
    let snapshot = durable_snapshot(&f.pool).await;
    let unaudited = resume_with_pool(&f.pool, run_input(claim.quality_run_id)).await;
    assert_eq!(
        unaudited.unwrap_err(),
        "Current revision requires a completed canonical non-blocking latest AI audit"
    );
    assert_eq!(durable_snapshot(&f.pool).await, snapshot);
}

#[tokio::test]
async fn resume_settles_active_leftovers_from_older_databases() {
    let f = fixture().await;
    let claim = claim(&f.pool).await;
    start(&f.pool, claim.agent_run_id).await.unwrap();
    // Pre-fix fail wrote only the run and attempt, leaving the agent running.
    sqlx::query("UPDATE draft_quality_runs SET status='failed',error_message='Old',completed_at=datetime('now') WHERE id=?1")
        .bind(claim.quality_run_id)
        .execute(&f.pool)
        .await
        .unwrap();
    sqlx::query("UPDATE draft_quality_attempts SET status='failed',completed_at=datetime('now') WHERE id=?1")
        .bind(claim.attempt_id)
        .execute(&f.pool)
        .await
        .unwrap();

    let resumed = resume_with_pool(&f.pool, run_input(claim.quality_run_id))
        .await
        .unwrap();

    assert_eq!(agent_status(&f.pool, claim.agent_run_id).await, "failed");
    assert_eq!(failed_events(&f.pool, claim.agent_run_id).await, 1);
    assert_eq!(agent_status(&f.pool, resumed.agent_run_id).await, "queued");
    start(&f.pool, resumed.agent_run_id).await.unwrap();
}

#[tokio::test]
async fn attempt_cap_still_bounds_resume_after_settlement() {
    let f = fixture().await;
    let mut claim = claim(&f.pool).await;
    for _ in 0..2 {
        fail_with_pool(&f.pool, fail_input(claim.quality_run_id, claim.attempt_id))
            .await
            .unwrap();
        claim = resume_with_pool(&f.pool, run_input(claim.quality_run_id))
            .await
            .unwrap();
    }
    fail_with_pool(&f.pool, fail_input(claim.quality_run_id, claim.attempt_id))
        .await
        .unwrap();
    let snapshot = durable_snapshot(&f.pool).await;

    let fourth = resume_with_pool(&f.pool, run_input(claim.quality_run_id)).await;

    assert_eq!(fourth.unwrap_err(), "Quality rewrite limit is exhausted");
    assert_eq!(durable_snapshot(&f.pool).await, snapshot);
    assert_eq!(
        count(
            &f.pool,
            "SELECT COUNT(*) FROM draft_quality_attempts WHERE run_id=?1",
            claim.quality_run_id
        )
        .await,
        3
    );
}

#[tokio::test]
async fn rewrite_cap_still_ends_the_loop_in_needs_revision() {
    let f = fixture().await;
    let first = claim(&f.pool).await;
    fail_with_pool(&f.pool, fail_input(first.quality_run_id, first.attempt_id))
        .await
        .unwrap();
    // Both rewrites were spent before the interruption; resume must carry the
    // exhausted budget into the replacement scorer's request.
    sqlx::query(
        "UPDATE draft_quality_runs SET applied_rewrite_count=maximum_rewrite_count WHERE id=?1",
    )
    .bind(first.quality_run_id)
    .execute(&f.pool)
    .await
    .unwrap();
    let claim = resume_with_pool(&f.pool, run_input(first.quality_run_id))
        .await
        .unwrap();
    start(&f.pool, claim.agent_run_id).await.unwrap();
    let context: String =
        sqlx::query_scalar("SELECT input_context_json FROM agent_runs WHERE id=?1")
            .bind(claim.agent_run_id)
            .fetch_one(&f.pool)
            .await
            .unwrap();
    assert!(context.contains("\"rewriteAllowed\":false"), "{context}");
    let input = completed_scorer(&f.pool, &claim, 50, false).await;

    let settled = apply_with_pool(&f.pool, input).await.unwrap();

    assert_eq!(settled.status, "needs_revision");
    assert_eq!(
        run_status(&f.pool, claim.quality_run_id).await,
        "needs_revision"
    );
}
