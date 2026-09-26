//! Native tests for the shared publishing execution path. A scripted fake
//! transport stands in for LinkedIn; no test contacts the network.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use sqlx::SqlitePool;

use super::recovery::{
    reconcile, sweep, sweep_and_list_open, sweep_with_saved_settings, STALE_EXECUTION_SECONDS,
};
use super::service::{execute, ExecuteContext};
use super::store::{
    mark_in_flight, record_remote_result, record_stale_owner_evidence, reserve, settle,
    ReserveRefusal, ReserveRequest, SettleOptions, SettleResult,
};
use super::transport::LinkedInTransport;
use super::types::{
    ExecutionCaller, ExecutionOutcome, ReconcileExecutionInput, ReconcileResolution,
    TransportOutcome, RECONCILE_CONFIRMATION,
};
use crate::approval_review::{
    create_approval, set_approval_status, CreateApprovalInput, SetApprovalStatusInput,
};
use crate::auth::publish::{
    compose_linkedin_commentary, escape_linkedin_little_text, LinkedInPublishCommentInput,
    LinkedInPublishPostInput,
};
use crate::test_support::{migrated, seed, Fixture};

const AUDIT_RULES: &str =
    r#"["hook","specificity","generic_language","authenticity","clarity","safety"]"#;
const DETERMINISTIC_RULES: &str =
    r#"["required_text","total_length","external_link","hashtag_limit"]"#;
const HOOK: &str = "We learned from 12 customer interviews";
const BODY: &str = "Our team tested a specific change.";
const COMMENT_BODY: &str = "Great point about onboarding";
const TARGET_URN: &str = "urn:li:activity:7000000000000000001";

// ---------------------------------------------------------------- fake transport

struct ScriptedTransport {
    outcomes: Mutex<VecDeque<TransportOutcome>>,
    calls: AtomicUsize,
    delay: Duration,
}

impl ScriptedTransport {
    fn new(outcomes: Vec<TransportOutcome>) -> Arc<Self> {
        Self::with_delay(outcomes, Duration::ZERO)
    }

    fn with_delay(outcomes: Vec<TransportOutcome>, delay: Duration) -> Arc<Self> {
        Arc::new(Self {
            outcomes: Mutex::new(outcomes.into()),
            calls: AtomicUsize::new(0),
            delay,
        })
    }

    fn calls(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }

    fn next(&self) -> TransportOutcome {
        self.calls.fetch_add(1, Ordering::SeqCst);
        if !self.delay.is_zero() {
            std::thread::sleep(self.delay);
        }
        self.outcomes
            .lock()
            .unwrap()
            .pop_front()
            .expect("transport called more times than scripted")
    }
}

impl LinkedInTransport for ScriptedTransport {
    fn create_post(&self, _commentary: &str) -> TransportOutcome {
        self.next()
    }

    fn create_comment(&self, _target_urn: &str, _commentary: &str) -> TransportOutcome {
        self.next()
    }
}

fn created_post() -> TransportOutcome {
    TransportOutcome::Created {
        platform_id: "urn:li:share:111".to_string(),
        urn: "urn:li:share:111".to_string(),
        url: "https://www.linkedin.com/feed/update/urn:li:share:111/".to_string(),
    }
}

fn created_comment() -> TransportOutcome {
    TransportOutcome::Created {
        platform_id: "urn:li:comment:(urn:li:activity:7000000000000000001,222)".to_string(),
        urn: "urn:li:comment:(urn:li:activity:7000000000000000001,222)".to_string(),
        url: "https://www.linkedin.com/feed/update/urn:li:activity:7000000000000000001/"
            .to_string(),
    }
}

fn rejected() -> TransportOutcome {
    TransportOutcome::Rejected {
        status_code: Some(422),
        message: "LinkedIn API request failed with HTTP 422".to_string(),
    }
}

fn ambiguous() -> TransportOutcome {
    TransportOutcome::Ambiguous {
        status_code: Some(503),
        message: "LinkedIn API request failed with HTTP 503".to_string(),
    }
}

// ---------------------------------------------------------------- fixtures

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

/// Clock far enough ahead that every open execution counts as stale.
fn after_stale() -> i64 {
    now() + STALE_EXECUTION_SECONDS + 60
}

async fn approved_fixture() -> (Fixture, i64) {
    let f = migrated().await;
    seed(
        &f.pool,
        &format!(
            "INSERT INTO campaigns (id,name,status,daily_post_limit,daily_comment_limit) VALUES (1,'Live','active',5,5);
             INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES (1,'https://www.linkedin.com/feed/update/{TARGET_URN}/','https://www.linkedin.com/feed/update/{TARGET_URN}/','One','h1');
             INSERT INTO candidate_posts (id,campaign_id,target_post_id,source_keyword) VALUES (1,1,1,'ai');
             INSERT INTO drafts (id,campaign_id,candidate_post_id,status) VALUES (1,1,1,'ready_for_review');
             INSERT INTO draft_variants (id,draft_id,variant_number,hook,body,status) VALUES (1,1,1,'{HOOK}','{BODY}','selected');
             INSERT INTO draft_audits (draft_variant_id,rule_key,severity,message) SELECT 1,value,'pass','ok' FROM json_each('{DETERMINISTIC_RULES}');
             INSERT INTO draft_ai_audit_runs (draft_variant_id,content_revision,provider_key,status,completed_at) SELECT id,content_revision,'dry_run','completed',datetime('now') FROM draft_variants WHERE id=1;
             INSERT INTO draft_ai_audit_findings (audit_run_id,rule_key,severity,message) SELECT (SELECT MAX(id) FROM draft_ai_audit_runs),value,'pass','ok' FROM json_each('{AUDIT_RULES}');
             INSERT INTO draft_quality_runs (draft_variant_id,starting_content_revision,current_content_revision,provider_key,status,final_score,completed_at)
               SELECT id,content_revision,content_revision,'dry_run','passed',80,datetime('now') FROM draft_variants WHERE id=1;
             INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES
               (2,'https://www.linkedin.com/feed/update/{TARGET_URN}/?c=2','https://www.linkedin.com/feed/update/{TARGET_URN}/?c=2','Two','h2'),
               (3,'https://www.linkedin.com/feed/update/{TARGET_URN}/?c=3','https://www.linkedin.com/feed/update/{TARGET_URN}/?c=3','Three','h3');
             INSERT INTO candidate_posts (id,campaign_id,target_post_id,source_keyword) VALUES (2,1,2,'ai2'),(3,1,3,'ai3');
             INSERT INTO comment_threads (id,campaign_id,candidate_post_id,status) VALUES (10,1,2,'approved'),(11,1,3,'approved');
             INSERT INTO comment_variants (id,comment_thread_id,variant_number,body,status) VALUES
               (100,10,1,'{COMMENT_BODY}','selected'),(110,11,1,'{COMMENT_BODY}','selected');"
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

/// Schedules the approval with one due job and returns the job id.
async fn schedule(f: &Fixture, approval_id: i64) -> i64 {
    seed(
        &f.pool,
        &format!(
            "INSERT INTO schedule_jobs (id,approval_id,scheduled_for,timezone,status,idempotency_key)
               VALUES (50,{approval_id},'2020-01-01T00:00:00Z','UTC','scheduled','approval:{approval_id}:linkedin:50');
             UPDATE approvals SET status='scheduled' WHERE id={approval_id};
             UPDATE scheduler_settings SET retry_backoff_minutes=15 WHERE id=1;"
        ),
    )
    .await;
    50
}

fn commentary() -> String {
    escape_linkedin_little_text(&compose_linkedin_commentary(HOOK, BODY, "", ""))
}

fn post_request(approval_id: i64) -> ReserveRequest {
    ReserveRequest::Post(LinkedInPublishPostInput {
        approval_id,
        schedule_job_id: None,
        commentary: commentary(),
        idempotency_key: format!("approval:{approval_id}:linkedin:manual"),
    })
}

fn scheduled_post_request(approval_id: i64, job_id: i64) -> ReserveRequest {
    ReserveRequest::Post(LinkedInPublishPostInput {
        approval_id,
        schedule_job_id: Some(job_id),
        commentary: commentary(),
        idempotency_key: format!("approval:{approval_id}:linkedin:{job_id}"),
    })
}

fn comment_request(thread_id: i64) -> ReserveRequest {
    ReserveRequest::Comment(LinkedInPublishCommentInput {
        comment_thread_id: thread_id,
        commentary: escape_linkedin_little_text(COMMENT_BODY),
        target_urn: TARGET_URN.to_string(),
        idempotency_key: format!("comment-thread:{thread_id}:linkedin:manual"),
    })
}

fn context<'a>(pool: &'a SqlitePool, transport: Arc<ScriptedTransport>) -> ExecuteContext<'a> {
    ExecuteContext {
        pool,
        transport,
        caller: ExecutionCaller::Manual,
        retry_backoff_minutes: 15,
        now_epoch: now(),
    }
}

async fn scalar_i64(pool: &SqlitePool, sql: &str) -> i64 {
    sqlx::query_scalar::<_, i64>(sql)
        .fetch_one(pool)
        .await
        .unwrap()
}

async fn scalar_text(pool: &SqlitePool, sql: &str) -> String {
    sqlx::query_scalar::<_, String>(sql)
        .fetch_one(pool)
        .await
        .unwrap()
}

async fn execution_status(pool: &SqlitePool, id: i64) -> String {
    scalar_text(
        pool,
        &format!("SELECT status FROM publish_executions WHERE id = {id}"),
    )
    .await
}

fn reconcile_input(
    execution_id: i64,
    fence: i64,
    resolution: ReconcileResolution,
    url: Option<&str>,
) -> ReconcileExecutionInput {
    ReconcileExecutionInput {
        execution_id,
        fence,
        resolution,
        external_url: url.map(str::to_string),
        note: Some("checked LinkedIn".to_string()),
        confirmation: RECONCILE_CONFIRMATION.to_string(),
    }
}

// ---------------------------------------------------------------- posts

#[tokio::test]
async fn post_success_settles_attempt_approval_and_execution_together() {
    let (f, id) = approved_fixture().await;
    let transport = ScriptedTransport::new(vec![created_post()]);

    let outcome = execute(context(&f.pool, transport.clone()), post_request(id))
        .await
        .unwrap();

    let ExecutionOutcome::Succeeded {
        execution_id,
        external_url,
        ..
    } = outcome
    else {
        panic!("expected success, got {outcome:?}");
    };
    assert!(external_url.contains("urn:li:share:111"));
    assert_eq!(transport.calls(), 1);
    assert_eq!(execution_status(&f.pool, execution_id).await, "succeeded");
    assert_eq!(
        scalar_text(
            &f.pool,
            &format!("SELECT status FROM approvals WHERE id={id}")
        )
        .await,
        "published"
    );
    assert_eq!(
        scalar_i64(
            &f.pool,
            "SELECT COUNT(*) FROM publish_attempts WHERE status='succeeded'"
        )
        .await,
        1
    );
    assert_eq!(
        scalar_i64(
            &f.pool,
            &format!("SELECT attempt_id FROM publish_executions WHERE id={execution_id}")
        )
        .await,
        scalar_i64(&f.pool, "SELECT id FROM publish_attempts").await
    );
}

#[tokio::test]
async fn post_definite_failure_releases_the_approval_for_another_try() {
    let (f, id) = approved_fixture().await;
    let transport = ScriptedTransport::new(vec![rejected(), created_post()]);

    let first = execute(context(&f.pool, transport.clone()), post_request(id))
        .await
        .unwrap();
    assert!(
        matches!(first, ExecutionOutcome::Failed { .. }),
        "{first:?}"
    );
    assert_eq!(
        scalar_text(
            &f.pool,
            &format!("SELECT status FROM approvals WHERE id={id}")
        )
        .await,
        "approved"
    );

    let second = execute(context(&f.pool, transport.clone()), post_request(id))
        .await
        .unwrap();
    assert!(
        matches!(second, ExecutionOutcome::Succeeded { .. }),
        "{second:?}"
    );
    assert_eq!(transport.calls(), 2);
}

#[tokio::test]
async fn post_ambiguous_outcome_is_visible_and_blocks_further_publishing() {
    let (f, id) = approved_fixture().await;
    let transport = ScriptedTransport::new(vec![ambiguous()]);

    let outcome = execute(context(&f.pool, transport.clone()), post_request(id))
        .await
        .unwrap();
    let ExecutionOutcome::OutcomeUnknown { execution_id, .. } = outcome else {
        panic!("expected unknown, got {outcome:?}");
    };
    assert_eq!(
        execution_status(&f.pool, execution_id).await,
        "outcome_unknown"
    );
    assert_eq!(
        scalar_i64(
            &f.pool,
            "SELECT COUNT(*) FROM error_queue_items WHERE title='Publish outcome unknown' AND status='open'"
        )
        .await,
        1
    );
    assert_eq!(
        scalar_i64(&f.pool, "SELECT COUNT(*) FROM publish_attempts").await,
        0,
        "no success or failure is claimed for an unknown outcome"
    );

    let again = execute(context(&f.pool, transport.clone()), post_request(id))
        .await
        .unwrap();
    assert!(
        matches!(again, ExecutionOutcome::Blocked { .. }),
        "{again:?}"
    );
    assert_eq!(transport.calls(), 1, "no blind retry");
}

#[tokio::test]
async fn kill_switch_blocks_before_any_reservation() {
    let (f, id) = approved_fixture().await;
    seed(
        &f.pool,
        "UPDATE safety_settings SET global_kill_switch=1, kill_switch_reason='stop' WHERE id=1;",
    )
    .await;
    let transport = ScriptedTransport::new(vec![]);

    let outcome = execute(context(&f.pool, transport.clone()), post_request(id))
        .await
        .unwrap();

    assert!(
        matches!(&outcome, ExecutionOutcome::Blocked { message } if message.contains("kill switch")),
        "{outcome:?}"
    );
    assert_eq!(transport.calls(), 0);
    assert_eq!(
        scalar_i64(&f.pool, "SELECT COUNT(*) FROM publish_executions").await,
        0
    );
}

#[tokio::test]
async fn competing_manual_publishes_contact_linkedin_once() {
    let (f, id) = approved_fixture().await;
    let transport = ScriptedTransport::with_delay(vec![created_post()], Duration::from_millis(300));

    let (first, second) = tokio::join!(
        execute(context(&f.pool, transport.clone()), post_request(id)),
        execute(context(&f.pool, transport.clone()), post_request(id)),
    );
    let outcomes = [first.unwrap(), second.unwrap()];

    assert_eq!(transport.calls(), 1);
    assert_eq!(
        outcomes
            .iter()
            .filter(|o| matches!(o, ExecutionOutcome::Succeeded { .. }))
            .count(),
        1,
        "{outcomes:?}"
    );
    assert_eq!(
        outcomes
            .iter()
            .filter(|o| matches!(o, ExecutionOutcome::Blocked { .. }))
            .count(),
        1,
        "{outcomes:?}"
    );
    assert_eq!(
        scalar_i64(&f.pool, "SELECT COUNT(*) FROM publish_attempts").await,
        1
    );
}

// ---------------------------------------------------------------- comments

#[tokio::test]
async fn comment_success_marks_thread_posted() {
    let (f, _) = approved_fixture().await;
    let transport = ScriptedTransport::new(vec![created_comment()]);

    let outcome = execute(context(&f.pool, transport.clone()), comment_request(10))
        .await
        .unwrap();

    assert!(
        matches!(outcome, ExecutionOutcome::Succeeded { .. }),
        "{outcome:?}"
    );
    assert_eq!(
        scalar_text(&f.pool, "SELECT status FROM comment_threads WHERE id=10").await,
        "posted"
    );
    assert_eq!(
        scalar_i64(
            &f.pool,
            "SELECT COUNT(*) FROM comment_attempts WHERE comment_thread_id=10 AND status='succeeded'"
        )
        .await,
        1
    );
}

#[tokio::test]
async fn comment_definite_failure_keeps_thread_approved() {
    let (f, _) = approved_fixture().await;
    let transport = ScriptedTransport::new(vec![rejected()]);

    let outcome = execute(context(&f.pool, transport.clone()), comment_request(10))
        .await
        .unwrap();

    assert!(
        matches!(outcome, ExecutionOutcome::Failed { .. }),
        "{outcome:?}"
    );
    assert_eq!(
        scalar_text(&f.pool, "SELECT status FROM comment_threads WHERE id=10").await,
        "approved"
    );
    assert_eq!(
        scalar_i64(
            &f.pool,
            "SELECT COUNT(*) FROM comment_attempts WHERE status='failed'"
        )
        .await,
        1
    );
}

#[tokio::test]
async fn comment_ambiguous_outcome_counts_toward_daily_limit() {
    let (f, _) = approved_fixture().await;
    seed(
        &f.pool,
        "UPDATE campaigns SET daily_comment_limit=1 WHERE id=1;",
    )
    .await;
    let transport = ScriptedTransport::new(vec![ambiguous()]);

    let first = execute(context(&f.pool, transport.clone()), comment_request(10))
        .await
        .unwrap();
    assert!(
        matches!(first, ExecutionOutcome::OutcomeUnknown { .. }),
        "{first:?}"
    );

    let second = execute(context(&f.pool, transport.clone()), comment_request(11))
        .await
        .unwrap();
    assert!(
        matches!(&second, ExecutionOutcome::Blocked { message } if message.contains("Daily comment limit")),
        "{second:?}"
    );
    assert_eq!(transport.calls(), 1);
}

#[tokio::test]
async fn manual_comment_record_is_refused_while_execution_is_open() {
    let (f, _) = approved_fixture().await;
    reserve(&f.pool, comment_request(10), ExecutionCaller::Manual)
        .await
        .unwrap()
        .unwrap();

    let error = crate::comments::record_comment_attempt(
        &f.pool,
        crate::comments::RecordCommentAttemptInput {
            comment_thread_id: 10,
            status: "succeeded".to_string(),
            external_comment_url: "https://www.linkedin.com/feed/update/urn:li:activity:1/"
                .to_string(),
            platform_comment_id: "c1".to_string(),
            idempotency_key: "comment-thread:10:linkedin:manual".to_string(),
            error_message: String::new(),
        },
    )
    .await
    .unwrap_err();
    assert!(error.contains("in progress"), "{error}");
}

// ---------------------------------------------------------------- manual vs worker

#[tokio::test]
async fn scheduler_skips_a_job_whose_approval_has_an_open_manual_execution() {
    let (f, id) = approved_fixture().await;
    let job_id = schedule(&f, id).await;
    reserve(
        &f.pool,
        scheduled_post_request(id, job_id),
        ExecutionCaller::Manual,
    )
    .await
    .unwrap()
    .unwrap();
    let transport = ScriptedTransport::new(vec![]);

    let tick = crate::scheduler::run_tick_with(&f.pool, transport.clone(), "test", now())
        .await
        .unwrap();

    assert_eq!(tick.claimed, 0);
    assert_eq!(transport.calls(), 0);
}

#[tokio::test]
async fn manual_publish_is_blocked_while_the_worker_owns_the_approval() {
    let (f, id) = approved_fixture().await;
    let job_id = schedule(&f, id).await;
    reserve(
        &f.pool,
        scheduled_post_request(id, job_id),
        ExecutionCaller::Scheduler,
    )
    .await
    .unwrap()
    .unwrap();
    let transport = ScriptedTransport::new(vec![]);

    let refused = reserve(
        &f.pool,
        scheduled_post_request(id, job_id),
        ExecutionCaller::Manual,
    )
    .await
    .unwrap();
    assert_eq!(refused.unwrap_err(), ReserveRefusal::OpenExecution);
    let outcome = execute(
        context(&f.pool, transport.clone()),
        scheduled_post_request(id, job_id),
    )
    .await
    .unwrap();
    assert!(
        matches!(outcome, ExecutionOutcome::Blocked { .. }),
        "{outcome:?}"
    );
    assert_eq!(transport.calls(), 0);
}

#[tokio::test]
async fn scheduler_publishes_through_the_shared_service() {
    let (f, id) = approved_fixture().await;
    let job_id = schedule(&f, id).await;
    let transport = ScriptedTransport::new(vec![created_post()]);

    let tick = crate::scheduler::run_tick_with(&f.pool, transport.clone(), "test", now())
        .await
        .unwrap();

    assert_eq!((tick.claimed, tick.published), (1, 1));
    assert_eq!(
        scalar_text(
            &f.pool,
            &format!("SELECT status FROM schedule_jobs WHERE id={job_id}")
        )
        .await,
        "completed"
    );
    assert_eq!(
        scalar_text(
            &f.pool,
            "SELECT caller FROM publish_executions ORDER BY id DESC LIMIT 1"
        )
        .await,
        "scheduler"
    );
}

#[tokio::test]
async fn scheduler_retries_only_definite_failures() {
    let (f, id) = approved_fixture().await;
    let job_id = schedule(&f, id).await;
    let transport = ScriptedTransport::new(vec![rejected()]);

    let tick = crate::scheduler::run_tick_with(&f.pool, transport.clone(), "test", now())
        .await
        .unwrap();

    assert_eq!(tick.retry_scheduled, 1);
    assert_eq!(
        scalar_i64(
            &f.pool,
            &format!(
                "SELECT COUNT(*) FROM schedule_jobs WHERE id={job_id} AND status='scheduled' AND next_attempt_at IS NOT NULL AND locked_by IS NULL"
            )
        )
        .await,
        1
    );
}

#[tokio::test]
async fn scheduler_never_retries_an_ambiguous_outcome() {
    let (f, id) = approved_fixture().await;
    let job_id = schedule(&f, id).await;
    let transport = ScriptedTransport::new(vec![ambiguous()]);

    let first = crate::scheduler::run_tick_with(&f.pool, transport.clone(), "test", now())
        .await
        .unwrap();
    let second = crate::scheduler::run_tick_with(&f.pool, transport.clone(), "test", now())
        .await
        .unwrap();

    assert_eq!(first.claimed, 1);
    assert_eq!(second.claimed, 0);
    assert_eq!(transport.calls(), 1);
    assert_eq!(
        scalar_i64(
            &f.pool,
            &format!("SELECT attempt_count FROM schedule_jobs WHERE id={job_id}")
        )
        .await,
        1
    );
}

// ---------------------------------------------------------------- recovery

#[tokio::test]
async fn remote_success_then_settlement_failure_is_recovered_from_evidence() {
    let (f, id) = approved_fixture().await;
    seed(
        &f.pool,
        "CREATE TRIGGER fail_attempt_insert BEFORE INSERT ON publish_attempts
         BEGIN SELECT RAISE(ABORT, 'injected'); END;",
    )
    .await;
    let transport = ScriptedTransport::new(vec![created_post()]);

    let outcome = execute(context(&f.pool, transport.clone()), post_request(id))
        .await
        .unwrap();
    let ExecutionOutcome::OutcomeUnknown { execution_id, .. } = outcome else {
        panic!("expected unknown while local recording fails, got {outcome:?}");
    };
    assert_eq!(execution_status(&f.pool, execution_id).await, "in_flight");
    assert_eq!(
        scalar_text(
            &f.pool,
            &format!("SELECT remote_outcome FROM publish_executions WHERE id={execution_id}")
        )
        .await,
        "created",
        "remote evidence was persisted before settlement"
    );
    assert_eq!(
        scalar_text(
            &f.pool,
            &format!("SELECT status FROM approvals WHERE id={id}")
        )
        .await,
        "approved",
        "failed settlement rolled back as a unit"
    );

    seed(&f.pool, "DROP TRIGGER fail_attempt_insert;").await;
    let report = sweep(&f.pool, 15, after_stale()).await.unwrap();

    assert_eq!(report.settled_from_evidence, 1);
    assert_eq!(execution_status(&f.pool, execution_id).await, "succeeded");
    assert_eq!(
        scalar_text(
            &f.pool,
            &format!("SELECT status FROM approvals WHERE id={id}")
        )
        .await,
        "published"
    );
    assert_eq!(transport.calls(), 1);
}

#[tokio::test]
async fn crash_after_reserve_is_abandoned_and_released() {
    let (f, id) = approved_fixture().await;
    let reservation = reserve(&f.pool, post_request(id), ExecutionCaller::Manual)
        .await
        .unwrap()
        .unwrap();

    let report = sweep(&f.pool, 15, after_stale()).await.unwrap();

    assert_eq!(report.abandoned, 1);
    assert_eq!(
        execution_status(&f.pool, reservation.lease.execution_id).await,
        "abandoned"
    );
    let transport = ScriptedTransport::new(vec![created_post()]);
    let outcome = execute(context(&f.pool, transport), post_request(id))
        .await
        .unwrap();
    assert!(
        matches!(outcome, ExecutionOutcome::Succeeded { .. }),
        "{outcome:?}"
    );
}

#[tokio::test]
async fn crash_after_send_becomes_outcome_unknown() {
    let (f, id) = approved_fixture().await;
    let reservation = reserve(&f.pool, post_request(id), ExecutionCaller::Manual)
        .await
        .unwrap()
        .unwrap();
    assert!(mark_in_flight(&f.pool, &reservation.lease).await.unwrap());

    let report = sweep(&f.pool, 15, after_stale()).await.unwrap();

    assert_eq!(report.marked_unknown, 1);
    assert_eq!(
        execution_status(&f.pool, reservation.lease.execution_id).await,
        "outcome_unknown"
    );
}

#[tokio::test]
async fn reconciliation_list_recovers_a_crashed_manual_publish_without_the_scheduler() {
    let (f, id) = approved_fixture().await;
    let reservation = reserve(&f.pool, post_request(id), ExecutionCaller::Manual)
        .await
        .unwrap()
        .unwrap();
    let execution_id = reservation.lease.execution_id;
    assert!(mark_in_flight(&f.pool, &reservation.lease).await.unwrap());

    let open = sweep_and_list_open(&f.pool, after_stale()).await.unwrap();

    assert_eq!(
        execution_status(&f.pool, execution_id).await,
        "outcome_unknown"
    );
    assert_eq!(open.len(), 1);
    let row = &open[0];
    assert_eq!(row.id, execution_id);
    assert_eq!(row.status, "outcome_unknown");
    assert_eq!(row.fence, reservation.lease.fence + 1);
    let reconciled = reconcile(
        &f.pool,
        reconcile_input(
            execution_id,
            row.fence,
            ReconcileResolution::NotPosted,
            None,
        ),
        after_stale(),
    )
    .await
    .unwrap();
    assert_eq!(reconciled.status, "reconciled_not_posted");
}

#[tokio::test]
async fn reconciliation_list_leaves_recent_executions_in_progress() {
    let (f, id) = approved_fixture().await;
    let reservation = reserve(&f.pool, post_request(id), ExecutionCaller::Manual)
        .await
        .unwrap()
        .unwrap();
    assert!(mark_in_flight(&f.pool, &reservation.lease).await.unwrap());

    let open = sweep_and_list_open(&f.pool, now()).await.unwrap();

    assert_eq!(open.len(), 1);
    assert_eq!(open[0].status, "in_flight");
    assert_eq!(open[0].fence, reservation.lease.fence);
}

#[tokio::test]
async fn pre_publish_sweep_releases_a_crashed_manual_reservation() {
    let (f, id) = approved_fixture().await;
    let stale = reserve(&f.pool, post_request(id), ExecutionCaller::Manual)
        .await
        .unwrap()
        .unwrap();

    let report = sweep_with_saved_settings(&f.pool, after_stale())
        .await
        .unwrap();

    assert_eq!(report.abandoned, 1);
    assert_eq!(
        execution_status(&f.pool, stale.lease.execution_id).await,
        "abandoned"
    );
    let again = reserve(&f.pool, post_request(id), ExecutionCaller::Manual)
        .await
        .unwrap();
    assert!(again.is_ok(), "approval should be publishable again");
}

#[tokio::test]
async fn recent_executions_are_not_recovered() {
    let (f, id) = approved_fixture().await;
    let reservation = reserve(&f.pool, post_request(id), ExecutionCaller::Manual)
        .await
        .unwrap()
        .unwrap();
    assert!(mark_in_flight(&f.pool, &reservation.lease).await.unwrap());

    let report = sweep(&f.pool, 15, now()).await.unwrap();

    assert_eq!(report, Default::default());
    assert_eq!(
        execution_status(&f.pool, reservation.lease.execution_id).await,
        "in_flight"
    );
}

#[tokio::test]
async fn stale_owner_is_fenced_and_only_leaves_evidence() {
    let (f, id) = approved_fixture().await;
    let reservation = reserve(&f.pool, post_request(id), ExecutionCaller::Manual)
        .await
        .unwrap()
        .unwrap();
    let old_lease = reservation.lease.clone();
    assert!(mark_in_flight(&f.pool, &old_lease).await.unwrap());
    sweep(&f.pool, 15, after_stale()).await.unwrap();

    // The frozen owner finally hears back from LinkedIn.
    assert!(!record_remote_result(&f.pool, &old_lease, &created_post())
        .await
        .unwrap());
    let settled = settle(
        &f.pool,
        &old_lease,
        &created_post(),
        SettleOptions::standard(15),
        now(),
    )
    .await
    .unwrap();
    assert_eq!(settled, SettleResult::StaleOwner);
    record_stale_owner_evidence(&f.pool, &old_lease, &created_post())
        .await
        .unwrap();

    let id_exec = old_lease.execution_id;
    assert_eq!(execution_status(&f.pool, id_exec).await, "outcome_unknown");
    assert_eq!(
        scalar_i64(
            &f.pool,
            &format!("SELECT fence FROM publish_executions WHERE id={id_exec}")
        )
        .await,
        2
    );
    assert_eq!(
        scalar_text(
            &f.pool,
            &format!("SELECT remote_platform_id FROM publish_executions WHERE id={id_exec}")
        )
        .await,
        "urn:li:share:111"
    );
    assert_eq!(
        scalar_text(
            &f.pool,
            &format!("SELECT status FROM approvals WHERE id={id}")
        )
        .await,
        "approved",
        "a fenced owner never settles local state"
    );
    assert_eq!(
        scalar_i64(
            &f.pool,
            &format!(
                "SELECT COUNT(*) FROM publish_execution_events WHERE execution_id={id_exec} AND event_type='stale_owner'"
            )
        )
        .await,
        1
    );
}

// ---------------------------------------------------------------- reconciliation

async fn unknown_post(f: &Fixture, id: i64) -> i64 {
    let transport = ScriptedTransport::new(vec![ambiguous()]);
    match execute(context(&f.pool, transport), post_request(id))
        .await
        .unwrap()
    {
        ExecutionOutcome::OutcomeUnknown { execution_id, .. } => execution_id,
        other => panic!("expected unknown, got {other:?}"),
    }
}

#[tokio::test]
async fn reconcile_posted_settles_success_and_closes_the_error_item() {
    let (f, id) = approved_fixture().await;
    let execution_id = unknown_post(&f, id).await;

    let result = reconcile(
        &f.pool,
        reconcile_input(
            execution_id,
            1,
            ReconcileResolution::Posted,
            Some("https://www.linkedin.com/feed/update/urn:li:share:999/"),
        ),
        now(),
    )
    .await
    .unwrap();

    assert_eq!(result.status, "reconciled_posted");
    assert_eq!(
        scalar_text(
            &f.pool,
            &format!("SELECT status FROM approvals WHERE id={id}")
        )
        .await,
        "published"
    );
    assert_eq!(
        scalar_i64(
            &f.pool,
            "SELECT COUNT(*) FROM error_queue_items WHERE title='Publish outcome unknown' AND status='open'"
        )
        .await,
        0
    );
}

#[tokio::test]
async fn reconcile_not_posted_releases_the_approval() {
    let (f, id) = approved_fixture().await;
    let execution_id = unknown_post(&f, id).await;

    let result = reconcile(
        &f.pool,
        reconcile_input(execution_id, 1, ReconcileResolution::NotPosted, None),
        now(),
    )
    .await
    .unwrap();

    assert_eq!(result.status, "reconciled_not_posted");
    let transport = ScriptedTransport::new(vec![created_post()]);
    let outcome = execute(context(&f.pool, transport), post_request(id))
        .await
        .unwrap();
    assert!(
        matches!(outcome, ExecutionOutcome::Succeeded { .. }),
        "{outcome:?}"
    );
}

#[tokio::test]
async fn reconcile_requires_confirmation_current_fence_and_a_linkedin_reference() {
    let (f, id) = approved_fixture().await;
    let execution_id = unknown_post(&f, id).await;

    let mut unconfirmed = reconcile_input(execution_id, 1, ReconcileResolution::NotPosted, None);
    unconfirmed.confirmation = "yes".to_string();
    assert!(reconcile(&f.pool, unconfirmed, now()).await.is_err());

    let stale = reconcile_input(execution_id, 7, ReconcileResolution::NotPosted, None);
    assert!(reconcile(&f.pool, stale, now()).await.is_err());

    let bad_url = reconcile_input(
        execution_id,
        1,
        ReconcileResolution::Posted,
        Some("https://example.com/post"),
    );
    assert!(reconcile(&f.pool, bad_url, now()).await.is_err());

    assert_eq!(
        execution_status(&f.pool, execution_id).await,
        "outcome_unknown"
    );
}
