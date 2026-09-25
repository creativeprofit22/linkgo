use super::*;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::Executor;
use std::{
    str::FromStr,
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};

static DATABASE_SEQUENCE: AtomicU64 = AtomicU64::new(1);

async fn test_pool() -> SqlitePool {
    let sequence = DATABASE_SEQUENCE.fetch_add(1, Ordering::SeqCst);
    let url = format!("sqlite:file:agent-continuations-{sequence}?mode=memory&cache=shared");
    let options = SqliteConnectOptions::from_str(&url)
        .unwrap()
        .busy_timeout(Duration::from_secs(5));
    let pool = SqlitePoolOptions::new()
        .max_connections(3)
        .connect_with(options)
        .await
        .unwrap();
    pool.execute("CREATE TABLE campaigns (id INTEGER PRIMARY KEY, status TEXT NOT NULL);
        CREATE TABLE approvals (id INTEGER PRIMARY KEY, campaign_id INTEGER NOT NULL, status TEXT NOT NULL);
        CREATE TABLE safety_settings (id INTEGER PRIMARY KEY, global_kill_switch INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE agent_runs (id INTEGER PRIMARY KEY, campaign_id INTEGER NOT NULL, workflow_run_id INTEGER, workflow_step_id INTEGER, agent_role TEXT NOT NULL, provider_key TEXT NOT NULL, model_name TEXT NOT NULL, playbook_key TEXT NOT NULL, input_summary TEXT NOT NULL, input_context_json TEXT NOT NULL, status TEXT NOT NULL, output_summary TEXT NOT NULL, error_message TEXT NOT NULL, completed_at TEXT, updated_at TEXT);
        CREATE TABLE agent_tool_calls (id INTEGER PRIMARY KEY, agent_run_id INTEGER NOT NULL, provider_tool_call_id TEXT NOT NULL, tool_name TEXT NOT NULL, status TEXT NOT NULL, requires_approval INTEGER NOT NULL, input_json TEXT NOT NULL, output_json TEXT NOT NULL, error_message TEXT NOT NULL, completed_at TEXT);
        CREATE TABLE agent_run_approval_checkpoints (agent_run_id INTEGER PRIMARY KEY, pending_tool_call_id INTEGER NOT NULL, approval_id INTEGER NOT NULL, phase TEXT NOT NULL, messages_json TEXT NOT NULL, iteration_count INTEGER NOT NULL, updated_at TEXT);
        CREATE TABLE agent_run_events (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_run_id INTEGER NOT NULL, event_type TEXT NOT NULL, summary TEXT NOT NULL);
        CREATE TABLE workflow_step_executions (agent_run_id INTEGER, workflow_step_id INTEGER, status TEXT, error_summary TEXT, completed_at TEXT, updated_at TEXT);
        CREATE TABLE workflow_steps (id INTEGER PRIMARY KEY, workflow_run_id INTEGER, step_key TEXT NOT NULL DEFAULT 'draft', title TEXT NOT NULL DEFAULT 'Step', sort_order INTEGER NOT NULL DEFAULT 1, status TEXT, output_summary TEXT, error_message TEXT, started_at TEXT, completed_at TEXT, updated_at TEXT);
        CREATE TABLE workflow_runs (id INTEGER PRIMARY KEY, status TEXT, current_step_key TEXT, started_at TEXT, completed_at TEXT, updated_at TEXT);
        CREATE TABLE workflow_events (id INTEGER PRIMARY KEY AUTOINCREMENT, workflow_run_id INTEGER NOT NULL, workflow_step_id INTEGER, event_type TEXT NOT NULL, summary TEXT NOT NULL);
        CREATE TABLE autopilot_plans (id INTEGER PRIMARY KEY, workflow_run_id INTEGER, campaign_backlog_item_id INTEGER, status TEXT);
        CREATE TABLE campaign_backlog_items (id INTEGER PRIMARY KEY, owner_type TEXT, work_type TEXT, recurrence TEXT, status TEXT, completed_at TEXT, cancelled_at TEXT, updated_at TEXT);").await.unwrap();
    pool
}

async fn seed(pool: &SqlitePool, run_status: &str, phase: &str, approval_status: &str) {
    pool.execute(
        "INSERT INTO campaigns VALUES (1, 'active'); INSERT INTO safety_settings VALUES (1, 0)",
    )
    .await
    .unwrap();
    sqlx::query("INSERT INTO approvals VALUES (1, 1, ?1)")
        .bind(approval_status)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO agent_runs VALUES (1,1,NULL,NULL,'scheduler','dry_run','dry-run-local','','Schedule metadata','{}',?1,'','',NULL,datetime('now'))").bind(run_status).execute(pool).await.unwrap();
    let tool_status = if phase == "continuation_ready" {
        "completed"
    } else {
        "waiting_approval"
    };
    sqlx::query("INSERT INTO agent_tool_calls VALUES (1,1,'provider-call-1','schedule_post',?1,1,'{\"campaignId\":1,\"approvalId\":1,\"scheduledFor\":\"2030-01-01T10:00:00Z\",\"timezone\":\"UTC\"}','{}','',NULL)").bind(tool_status).execute(pool).await.unwrap();
    let messages = if phase == "continuation_ready" {
        r#"[{"role":"assistant","content":"{}","toolName":"schedule_post","providerToolCallId":"provider-call-1"},{"role":"tool","content":"{}","toolName":"schedule_post","providerToolCallId":"provider-call-1"}]"#
    } else {
        r#"[{"role":"assistant","content":"{}","toolName":"schedule_post","providerToolCallId":"provider-call-1"}]"#
    };
    sqlx::query(
        "INSERT INTO agent_run_approval_checkpoints VALUES (1,1,1,?1,?2,1,datetime('now'))",
    )
    .bind(phase)
    .bind(messages)
    .execute(pool)
    .await
    .unwrap();
}

fn input() -> SettleApprovedContinuationInput {
    SettleApprovedContinuationInput { agent_run_id: 1 }
}
async fn scalar_string(pool: &SqlitePool, query: &str) -> String {
    sqlx::query_scalar(query).fetch_one(pool).await.unwrap()
}
async fn scalar_count(pool: &SqlitePool, query: &str) -> i64 {
    sqlx::query_scalar(query).fetch_one(pool).await.unwrap()
}

#[tokio::test]
async fn success_commits_run_tool_and_checkpoint_together() {
    let pool = test_pool().await;
    seed(&pool, "waiting_approval", "waiting_approval", "approved").await;
    let result = settle_approved_continuation(&pool, input()).await.unwrap();
    assert!(!result.recovered);
    assert_eq!(result.handled_provider_tool_call_ids, ["provider-call-1"]);
    assert_eq!(
        scalar_string(&pool, "SELECT status FROM agent_runs").await,
        "running"
    );
    assert_eq!(
        scalar_string(&pool, "SELECT status FROM agent_tool_calls").await,
        "completed"
    );
    assert_eq!(
        scalar_string(&pool, "SELECT phase FROM agent_run_approval_checkpoints").await,
        "continuation_ready"
    );
}

#[tokio::test]
async fn final_checkpoint_failure_rolls_back_earlier_writes() {
    let pool = test_pool().await;
    seed(&pool, "waiting_approval", "waiting_approval", "approved").await;
    pool.execute("CREATE TRIGGER fail_checkpoint BEFORE UPDATE ON agent_run_approval_checkpoints BEGIN SELECT RAISE(ABORT, 'private late failure'); END;").await.unwrap();
    assert_eq!(
        settle_approved_continuation(&pool, input())
            .await
            .unwrap_err(),
        SETTLEMENT_ERROR
    );
    assert_eq!(
        scalar_string(&pool, "SELECT status FROM agent_runs").await,
        "waiting_approval"
    );
    assert_eq!(
        scalar_string(&pool, "SELECT status FROM agent_tool_calls").await,
        "waiting_approval"
    );
}

#[tokio::test]
async fn failed_provider_retry_recovers_without_duplicate_tool_result() {
    let pool = test_pool().await;
    seed(&pool, "failed", "continuation_ready", "approved").await;
    let before = scalar_string(
        &pool,
        "SELECT messages_json FROM agent_run_approval_checkpoints",
    )
    .await;
    assert!(
        settle_approved_continuation(&pool, input())
            .await
            .unwrap()
            .recovered
    );
    assert_eq!(
        before,
        scalar_string(
            &pool,
            "SELECT messages_json FROM agent_run_approval_checkpoints"
        )
        .await
    );
    assert_eq!(
        scalar_count(&pool, "SELECT COUNT(*) FROM agent_tool_calls").await,
        1
    );
}

#[tokio::test]
async fn concurrent_settlements_have_one_winner_and_one_stable_error() {
    let pool = test_pool().await;
    seed(&pool, "waiting_approval", "waiting_approval", "approved").await;
    let (first, second) = tokio::join!(
        settle_approved_continuation(&pool, input()),
        settle_approved_continuation(&pool, input())
    );
    let results = [first, second];
    assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
    assert!(results
        .iter()
        .any(|result| result.as_ref().err().map(String::as_str)
            == Some("Agent continuation is already running")));
    assert_eq!(
        scalar_count(
            &pool,
            "SELECT COUNT(*) FROM agent_tool_calls WHERE status='completed'"
        )
        .await,
        1
    );
    assert_eq!(
        scalar_count(&pool, "SELECT COUNT(*) FROM agent_run_approval_checkpoints").await,
        1
    );
}

#[tokio::test]
async fn raw_sqlite_errors_are_bounded() {
    let pool = test_pool().await;
    pool.execute("DROP TABLE agent_run_approval_checkpoints")
        .await
        .unwrap();
    assert_eq!(
        settle_approved_continuation(&pool, input())
            .await
            .unwrap_err(),
        SETTLEMENT_ERROR
    );
}

#[tokio::test]
async fn rejected_approval_cancellation_commits_atomically() {
    let pool = test_pool().await;
    seed(&pool, "waiting_approval", "waiting_approval", "rejected").await;
    pool.execute("INSERT INTO agent_runs SELECT 2,campaign_id,workflow_run_id,workflow_step_id,agent_role,provider_key,model_name,playbook_key,input_summary,input_context_json,status,output_summary,error_message,completed_at,updated_at FROM agent_runs WHERE id=1;
        INSERT INTO agent_tool_calls SELECT 2,2,'provider-call-2',tool_name,status,requires_approval,input_json,output_json,error_message,completed_at FROM agent_tool_calls WHERE id=1;
        INSERT INTO agent_run_approval_checkpoints SELECT 2,2,approval_id,phase,messages_json,iteration_count,updated_at FROM agent_run_approval_checkpoints WHERE agent_run_id=1;").await.unwrap();
    assert_eq!(
        settle_approved_continuation(&pool, input())
            .await
            .unwrap_err(),
        "Linked approval was rejected"
    );
    assert_eq!(
        scalar_count(
            &pool,
            "SELECT COUNT(*) FROM agent_runs WHERE status='cancelled'"
        )
        .await,
        2
    );
    assert_eq!(
        scalar_count(
            &pool,
            "SELECT COUNT(*) FROM agent_tool_calls WHERE status='rejected'"
        )
        .await,
        2
    );
    assert_eq!(
        scalar_count(&pool, "SELECT COUNT(*) FROM agent_run_approval_checkpoints").await,
        0
    );
    assert_eq!(
        scalar_count(
            &pool,
            "SELECT COUNT(*) FROM agent_run_events WHERE event_type='run_cancelled'"
        )
        .await,
        2
    );
    assert_eq!(
        scalar_string(&pool, "SELECT error_message FROM agent_runs WHERE id=1").await,
        "Approval rejected: Approval rejected before continuation"
    );
    assert_eq!(
        scalar_string(
            &pool,
            "SELECT summary FROM agent_run_events WHERE agent_run_id=1"
        )
        .await,
        "Agent run cancelled after approval rejection: Approval rejected before continuation"
    );
}

async fn seed_workflow_link(pool: &SqlitePool, step_status: &str) {
    pool.execute(
        "INSERT INTO workflow_runs VALUES (1, 'waiting_approval', 'schedule', datetime('now'), NULL, datetime('now'));
         INSERT INTO workflow_steps VALUES (1, 1, 'draft', 'Draft', 1, 'completed', '', '', NULL, NULL, NULL);
         UPDATE agent_runs SET workflow_run_id = 1, workflow_step_id = 2 WHERE id = 1;
         INSERT INTO workflow_step_executions VALUES (1, 2, 'waiting_approval', '', NULL, NULL);",
    )
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO workflow_steps VALUES (2, 1, 'schedule', 'Schedule', 2, ?1, '', '', NULL, NULL, NULL)",
    )
    .bind(step_status)
    .execute(pool)
    .await
    .unwrap();
}

async fn reject_in_transaction(pool: &SqlitePool, detail: &str) -> Result<(), String> {
    let mut connection = pool.acquire().await.unwrap();
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *connection)
        .await
        .unwrap();
    let result = reject_linked_continuations(&mut connection, 1, detail).await;
    let end = if result.is_ok() { "COMMIT" } else { "ROLLBACK" };
    sqlx::query(end).execute(&mut *connection).await.unwrap();
    result
}

#[tokio::test]
async fn operator_rejection_projects_detail_and_step_blocked_event() {
    let pool = test_pool().await;
    seed(&pool, "waiting_approval", "waiting_approval", "rejected").await;
    seed_workflow_link(&pool, "waiting_approval").await;
    reject_in_transaction(&pool, "Tone is off").await.unwrap();

    assert_eq!(
        scalar_string(&pool, "SELECT error_message FROM agent_tool_calls").await,
        "Approval rejected: Tone is off"
    );
    assert_eq!(
        scalar_string(&pool, "SELECT summary FROM agent_run_events").await,
        "Agent run cancelled after approval rejection: Tone is off"
    );
    assert_eq!(
        scalar_string(&pool, "SELECT status FROM workflow_step_executions").await,
        "cancelled"
    );
    assert_eq!(
        scalar_string(&pool, "SELECT status FROM workflow_steps WHERE id=2").await,
        "blocked"
    );
    assert_eq!(
        scalar_string(
            &pool,
            "SELECT event_type || ':' || summary FROM workflow_events WHERE workflow_step_id=2"
        )
        .await,
        "step_blocked:Schedule blocked"
    );
    assert_eq!(
        scalar_string(
            &pool,
            "SELECT status || ':' || current_step_key FROM workflow_runs"
        )
        .await,
        "blocked:schedule"
    );
    assert_eq!(
        scalar_count(&pool, "SELECT COUNT(*) FROM agent_run_approval_checkpoints").await,
        0
    );
}

#[tokio::test]
async fn already_blocked_step_does_not_duplicate_event() {
    let pool = test_pool().await;
    seed(&pool, "waiting_approval", "waiting_approval", "rejected").await;
    seed_workflow_link(&pool, "blocked").await;
    reject_in_transaction(&pool, "Tone is off").await.unwrap();
    assert_eq!(
        scalar_count(&pool, "SELECT COUNT(*) FROM workflow_events").await,
        0
    );
}

#[tokio::test]
async fn cancelled_workflow_run_is_not_reprojected() {
    let pool = test_pool().await;
    seed(&pool, "waiting_approval", "waiting_approval", "rejected").await;
    seed_workflow_link(&pool, "waiting_approval").await;
    pool.execute("UPDATE workflow_runs SET status = 'cancelled'")
        .await
        .unwrap();
    reject_in_transaction(&pool, "Tone is off").await.unwrap();
    assert_eq!(
        scalar_string(&pool, "SELECT status FROM workflow_steps WHERE id=2").await,
        "waiting_approval"
    );
    assert_eq!(
        scalar_string(&pool, "SELECT status FROM agent_runs").await,
        "cancelled"
    );
}

#[tokio::test]
async fn late_workflow_event_failure_rolls_back_rejection() {
    let pool = test_pool().await;
    seed(&pool, "waiting_approval", "waiting_approval", "rejected").await;
    seed_workflow_link(&pool, "waiting_approval").await;
    pool.execute("CREATE TRIGGER fail_event BEFORE INSERT ON workflow_events BEGIN SELECT RAISE(ABORT, 'private'); END;").await.unwrap();
    assert_eq!(
        reject_in_transaction(&pool, "Tone is off")
            .await
            .unwrap_err(),
        SETTLEMENT_ERROR
    );
    assert_eq!(
        scalar_string(&pool, "SELECT status FROM agent_runs").await,
        "waiting_approval"
    );
    assert_eq!(
        scalar_count(&pool, "SELECT COUNT(*) FROM agent_run_approval_checkpoints").await,
        1
    );
}
