use super::*;
use crate::test_support::{count, fail_on, migrated, number, seed, snapshot, text, Fixture};

const TABLES: &[&str] = &[
    "workflow_runs",
    "workflow_steps",
    "workflow_events",
    "workflow_artifacts",
    "workflow_step_executions",
    "campaign_backlog_items",
];

async fn fixture() -> Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Old','archived',5),(3,'Other','active',5);",
    )
    .await;
    f
}

async fn new_run(f: &Fixture) -> i64 {
    create_run(
        &f.pool,
        CreateWorkflowRunInput {
            campaign_id: 1,
            title: " Weekly ".to_string(),
            context_summary: String::new(),
        },
    )
    .await
    .unwrap()
    .id
}

async fn step_id(f: &Fixture, run: i64, key: &str) -> i64 {
    number(
        &f.pool,
        &format!("SELECT id FROM workflow_steps WHERE workflow_run_id={run} AND step_key='{key}'"),
    )
    .await
}

async fn statuses(f: &Fixture, run: i64) -> String {
    text(
        &f.pool,
        &format!(
            "SELECT (SELECT status||'@'||current_step_key FROM workflow_runs WHERE id={run})||' '||
             (SELECT group_concat(step_key||':'||status, ',') FROM (SELECT step_key, status FROM workflow_steps WHERE workflow_run_id={run} ORDER BY sort_order))"
        ),
    )
    .await
}

fn step_status(step_id: i64, status: &str) -> SetWorkflowStepStatusInput {
    SetWorkflowStepStatusInput {
        step_id,
        status: status.to_string(),
        output_summary: String::new(),
        error_message: String::new(),
    }
}

/// Links run `run` to a planned autopilot plan with a pending scoring
/// backlog item. Plan triggers are dropped: they enforce import linkage that
/// is covered by the planner tests.
async fn link_planner(f: &Fixture, run: i64) {
    seed(
        &f.pool,
        &format!(
            "DROP TRIGGER IF EXISTS autopilot_plans_require_links_on_insert;
             DROP TRIGGER IF EXISTS autopilot_plans_require_links_when_planned;
             INSERT INTO source_import_batches (id,campaign_id,source_type,status,total_count) VALUES (1,1,'local_json','completed',1);
             INSERT INTO campaign_backlog_items (id,campaign_id,work_type,title,owner_type,status,due_at,recurrence)
               VALUES (9,1,'scoring','Score',  'linkgo','pending','2026-01-01T00:00:00.000Z','none');
             INSERT INTO autopilot_plans (campaign_id,source_import_batch_id,source_type,status,campaign_backlog_item_id,workflow_run_id,candidate_count)
               VALUES (1,1,'local_json','planned',9,{run},1);"
        ),
    )
    .await;
}

#[test]
fn step_transitions_match_renderer_matrix() {
    let statuses = [
        "pending",
        "running",
        "waiting_approval",
        "blocked",
        "completed",
        "failed",
        "skipped",
    ];
    let allowed = [
        ("pending", "running"),
        ("pending", "skipped"),
        ("running", "completed"),
        ("running", "waiting_approval"),
        ("running", "blocked"),
        ("running", "failed"),
        ("running", "skipped"),
        ("waiting_approval", "completed"),
        ("waiting_approval", "blocked"),
        ("waiting_approval", "failed"),
        ("waiting_approval", "running"),
        ("blocked", "running"),
        ("blocked", "failed"),
        ("blocked", "skipped"),
        ("failed", "running"),
        ("failed", "blocked"),
        ("failed", "skipped"),
        ("completed", "running"),
        ("skipped", "running"),
    ];
    for from in statuses {
        for to in statuses {
            assert_eq!(
                can_transition(from, to),
                allowed.contains(&(from, to)),
                "{from}->{to}"
            );
        }
    }
}

#[test]
fn inputs_reject_unknown_fields() {
    assert!(
        serde_json::from_value::<WorkflowRunIdInput>(serde_json::json!({"id":1,"force":true}))
            .is_err()
    );
}

#[tokio::test]
async fn create_writes_run_seven_steps_and_event() {
    let f = fixture().await;
    let run = new_run(&f).await;
    assert_eq!(
        statuses(&f, run).await,
        "queued@research research:pending,score:pending,draft:pending,audit:pending,approve:pending,schedule:pending,measure:pending"
    );
    assert_eq!(
        text(
            &f.pool,
            "SELECT event_type||'|'||summary FROM workflow_events"
        )
        .await,
        "run_created|Run created: Weekly"
    );
}

#[tokio::test]
async fn create_rejections_write_nothing() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    for (input, expected) in [
        ((99, "t"), "Campaign was not found"),
        ((2, "t"), "Campaign is archived"),
        ((1, "  "), "Title is required"),
    ] {
        assert_eq!(
            create_run(
                &f.pool,
                CreateWorkflowRunInput {
                    campaign_id: input.0,
                    title: input.1.to_string(),
                    context_summary: String::new()
                }
            )
            .await
            .unwrap_err(),
            expected
        );
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn create_rolls_back_run_and_steps_when_event_insert_fails() {
    let f = fixture().await;
    fail_on(&f.pool, "BEFORE INSERT ON workflow_events").await;
    let before = snapshot(&f.pool, TABLES).await;
    let result = create_run(
        &f.pool,
        CreateWorkflowRunInput {
            campaign_id: 1,
            title: "x".to_string(),
            context_summary: String::new(),
        },
    )
    .await;
    assert_eq!(result.unwrap_err(), STORAGE_ERROR);
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn start_runs_first_pending_step_and_completing_advances() {
    let f = fixture().await;
    let run = new_run(&f).await;
    start_run(&f.pool, WorkflowRunIdInput { id: run })
        .await
        .unwrap();
    assert!(statuses(&f, run)
        .await
        .starts_with("running@research research:running,score:pending"));
    set_step_status(
        &f.pool,
        step_status(step_id(&f, run, "research").await, "completed"),
    )
    .await
    .unwrap();
    assert!(statuses(&f, run)
        .await
        .starts_with("running@score research:completed,score:running,draft:pending"));
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT group_concat(event_type, ',') FROM (SELECT event_type FROM workflow_events WHERE workflow_run_id={run} ORDER BY id)")
        )
        .await,
        "run_created,run_started,step_started,step_completed,step_started"
    );
}

#[tokio::test]
async fn completing_every_step_completes_the_run_once() {
    let f = fixture().await;
    let run = new_run(&f).await;
    start_run(&f.pool, WorkflowRunIdInput { id: run })
        .await
        .unwrap();
    for key in [
        "research", "score", "draft", "audit", "approve", "schedule", "measure",
    ] {
        set_step_status(
            &f.pool,
            step_status(step_id(&f, run, key).await, "completed"),
        )
        .await
        .unwrap();
    }
    assert!(statuses(&f, run).await.starts_with("completed@measure"));
    assert_eq!(
        number(&f.pool, &format!("SELECT COUNT(*) FROM workflow_events WHERE workflow_run_id={run} AND event_type='run_completed'")).await,
        1
    );
    assert_eq!(
        set_step_status(
            &f.pool,
            step_status(step_id(&f, run, "measure").await, "skipped")
        )
        .await
        .unwrap_err(),
        "Completed workflow runs can only reopen steps"
    );
}

#[tokio::test]
async fn step_rejections_write_nothing() {
    let f = fixture().await;
    let run = new_run(&f).await;
    let research = step_id(&f, run, "research").await;
    let before = snapshot(&f.pool, TABLES).await;
    for (input, expected) in [
        (
            step_status(research, "completed"),
            "Unsupported workflow step transition",
        ),
        (
            step_status(99_999, "running"),
            "Workflow step was not found",
        ),
        (
            step_status(research, "done"),
            "Unsupported workflow step status",
        ),
    ] {
        assert_eq!(set_step_status(&f.pool, input).await.unwrap_err(), expected);
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
    cancel_run(&f.pool, WorkflowRunIdInput { id: run })
        .await
        .unwrap();
    assert_eq!(
        set_step_status(&f.pool, step_status(research, "running"))
            .await
            .unwrap_err(),
        "Cancelled workflow runs cannot change steps"
    );
}

#[tokio::test]
async fn planner_draft_step_is_save_only() {
    let f = fixture().await;
    let run = new_run(&f).await;
    link_planner(&f, run).await;
    seed(
        &f.pool,
        &format!("UPDATE workflow_steps SET status='running' WHERE workflow_run_id={run} AND step_key='draft'; UPDATE workflow_runs SET current_step_key='draft', status='running' WHERE id={run};"),
    )
    .await;
    assert_eq!(
        set_step_status(
            &f.pool,
            step_status(step_id(&f, run, "draft").await, "completed")
        )
        .await
        .unwrap_err(),
        PLANNER_DRAFT_SAVE_ONLY_MESSAGE
    );
    assert_eq!(
        resume_run(&f.pool, WorkflowRunIdInput { id: run })
            .await
            .unwrap_err(),
        PLANNER_DRAFT_SAVE_ONLY_MESSAGE
    );
}

#[tokio::test]
async fn score_step_syncs_planner_backlog_and_cancel_skips_it() {
    let f = fixture().await;
    let run = new_run(&f).await;
    link_planner(&f, run).await;
    start_run(&f.pool, WorkflowRunIdInput { id: run })
        .await
        .unwrap();
    set_step_status(
        &f.pool,
        step_status(step_id(&f, run, "research").await, "completed"),
    )
    .await
    .unwrap();
    // Completing research starts score; setting score explicitly syncs it.
    set_step_status(
        &f.pool,
        step_status(step_id(&f, run, "score").await, "blocked"),
    )
    .await
    .unwrap();
    assert_eq!(
        text(
            &f.pool,
            "SELECT status FROM campaign_backlog_items WHERE id=9"
        )
        .await,
        "blocked"
    );
    cancel_run(&f.pool, WorkflowRunIdInput { id: run })
        .await
        .unwrap();
    assert_eq!(
        text(
            &f.pool,
            "SELECT status||'|'||(cancelled_at IS NOT NULL) FROM campaign_backlog_items WHERE id=9"
        )
        .await,
        "cancelled|1"
    );
    assert_eq!(
        text(
            &f.pool,
            &format!(
                "SELECT status FROM workflow_steps WHERE id={}",
                step_id(&f, run, "score").await
            )
        )
        .await,
        "skipped"
    );
}

#[tokio::test]
async fn set_step_rolls_back_step_event_and_backlog_on_failure() {
    let f = fixture().await;
    let run = new_run(&f).await;
    link_planner(&f, run).await;
    start_run(&f.pool, WorkflowRunIdInput { id: run })
        .await
        .unwrap();
    set_step_status(
        &f.pool,
        step_status(step_id(&f, run, "research").await, "completed"),
    )
    .await
    .unwrap();
    fail_on(&f.pool, "BEFORE UPDATE ON campaign_backlog_items").await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        set_step_status(
            &f.pool,
            step_status(step_id(&f, run, "score").await, "completed")
        )
        .await
        .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn resume_reconciles_waiting_step_from_linked_agent_run() {
    let f = fixture().await;
    let run = new_run(&f).await;
    start_run(&f.pool, WorkflowRunIdInput { id: run })
        .await
        .unwrap();
    let research = step_id(&f, run, "research").await;
    seed(
        &f.pool,
        &format!(
            "UPDATE workflow_steps SET status='waiting_approval' WHERE id={research};
             INSERT INTO agent_runs (id,campaign_id,agent_role,status,output_summary,workflow_run_id,workflow_step_id)
               VALUES (7,1,'researcher','completed','Found 3 posts',{run},{research});
             INSERT INTO workflow_step_executions (workflow_step_id,agent_run_id,executor_role,status) VALUES ({research},7,'researcher','running');"
        ),
    )
    .await;
    let result = resume_run(&f.pool, WorkflowRunIdInput { id: run })
        .await
        .unwrap();
    assert!(!result.linked_agent_is_active);
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT status||'|'||output_summary FROM workflow_steps WHERE id={research}")
        )
        .await,
        "completed|Found 3 posts"
    );
    assert_eq!(
        text(
            &f.pool,
            "SELECT status||'|'||(completed_at IS NOT NULL) FROM workflow_step_executions"
        )
        .await,
        "completed|1"
    );
    assert!(statuses(&f, run).await.contains("score:running"));
}

#[tokio::test]
async fn artifact_upserts_and_enforces_ownership() {
    let f = fixture().await;
    let run = new_run(&f).await;
    seed(
        &f.pool,
        &format!(
            "INSERT INTO agent_runs (id,campaign_id,agent_role,status,workflow_run_id) VALUES (7,1,'researcher','completed',{run}),(8,3,'researcher','completed',NULL);"
        ),
    )
    .await;
    let artifact = |artifact_id: i64, summary: &str| CreateWorkflowArtifactInput {
        workflow_run_id: run,
        workflow_step_id: None,
        artifact_type: "agent_run".to_string(),
        artifact_id,
        summary: summary.to_string(),
    };
    let first = create_artifact(&f.pool, artifact(7, "a")).await.unwrap().id;
    let second = create_artifact(&f.pool, artifact(7, "b")).await.unwrap().id;
    assert_eq!(first, second, "upsert keeps one row");
    assert_eq!(
        text(&f.pool, "SELECT summary FROM workflow_artifacts").await,
        "b"
    );
    assert_eq!(
        create_artifact(&f.pool, artifact(8, "x"))
            .await
            .unwrap_err(),
        "Artifact belongs to a different campaign"
    );
    assert_eq!(
        create_artifact(&f.pool, artifact(99, "x"))
            .await
            .unwrap_err(),
        "Workflow artifact was not found"
    );
    assert_eq!(count(&f.pool, "workflow_artifacts").await, 1);
}

#[tokio::test]
async fn concurrent_step_completions_have_one_winner() {
    let f = fixture().await;
    let run = new_run(&f).await;
    start_run(&f.pool, WorkflowRunIdInput { id: run })
        .await
        .unwrap();
    let research = step_id(&f, run, "research").await;
    let (a, b) = tokio::join!(
        set_step_status(&f.pool, step_status(research, "completed")),
        set_step_status(&f.pool, step_status(research, "completed"))
    );
    assert_eq!([a.is_ok(), b.is_ok()].iter().filter(|ok| **ok).count(), 1);
    assert_eq!(
        number(&f.pool, &format!("SELECT COUNT(*) FROM workflow_events WHERE workflow_run_id={run} AND event_type='step_completed'")).await,
        1
    );
}

#[tokio::test]
async fn note_requires_mutable_campaign() {
    let f = fixture().await;
    let run = new_run(&f).await;
    add_note(
        &f.pool,
        AddWorkflowNoteInput {
            workflow_run_id: run,
            note: " hi ".to_string(),
        },
    )
    .await
    .unwrap();
    assert_eq!(
        text(
            &f.pool,
            "SELECT summary FROM workflow_events WHERE event_type='note_added'"
        )
        .await,
        "hi"
    );
    seed(
        &f.pool,
        "UPDATE campaigns SET status='archived' WHERE id=1;",
    )
    .await;
    assert_eq!(
        add_note(
            &f.pool,
            AddWorkflowNoteInput {
                workflow_run_id: run,
                note: "x".to_string()
            }
        )
        .await
        .unwrap_err(),
        "Campaign is archived"
    );
}
