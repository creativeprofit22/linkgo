use super::*;
use crate::test_support::{fail_on, migrated, number, seed, snapshot, text, Fixture};
use crate::workflows::{create_run, CreateWorkflowRunInput};

const TABLES: &[&str] = &["workflow_step_executions"];

async fn fixture() -> (Fixture, i64, i64) {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Other','active',5);",
    )
    .await;
    let run = create_run(
        &f.pool,
        CreateWorkflowRunInput {
            campaign_id: 1,
            title: "Weekly".to_string(),
            context_summary: String::new(),
        },
    )
    .await
    .unwrap()
    .id;
    let other = create_run(
        &f.pool,
        CreateWorkflowRunInput {
            campaign_id: 2,
            title: "Other".to_string(),
            context_summary: String::new(),
        },
    )
    .await
    .unwrap()
    .id;
    seed(
        &f.pool,
        &format!(
            "INSERT INTO agent_runs (id,campaign_id,workflow_run_id,agent_role,provider_key,status) VALUES
               (1,1,{run},'researcher','dry_run','running'),(2,2,{other},'researcher','dry_run','running');
             INSERT INTO workflow_events (workflow_run_id,event_type,summary) VALUES ({run},'note_added','hello');"
        ),
    )
    .await;
    let step = number(
        &f.pool,
        &format!(
            "SELECT id FROM workflow_steps WHERE workflow_run_id={run} AND step_key='research'"
        ),
    )
    .await;
    (f, run, step)
}

fn create(step: i64, agent_run_id: Option<i64>) -> CreateStepExecutionInput {
    CreateStepExecutionInput {
        workflow_step_id: step,
        agent_run_id,
        executor_role: "researcher".to_string(),
    }
}

fn update(id: i64, status: &str) -> UpdateStepExecutionInput {
    UpdateStepExecutionInput {
        id,
        agent_run_id: None,
        status: status.to_string(),
        error_summary: String::new(),
    }
}

#[test]
fn inputs_reject_unknown_fields() {
    assert!(
        serde_json::from_value::<CreateStepExecutionInput>(serde_json::json!({
            "workflowStepId": 1, "executorRole": "scorer", "x": 1
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<UpdateStepExecutionInput>(serde_json::json!({
            "id": 1, "status": "running", "x": 1
        }))
        .is_err()
    );
    assert!(serde_json::from_value::<WorkflowRunListInput>(serde_json::json!({ "x": 1 })).is_err());
}

#[tokio::test]
async fn invalid_inputs_write_nothing() {
    let (f, _, step) = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    assert!(create_step_execution(&f.pool, create(0, None))
        .await
        .is_err());
    let bad_role = CreateStepExecutionInput {
        executor_role: "boss".to_string(),
        ..create(step, None)
    };
    assert!(create_step_execution(&f.pool, bad_role).await.is_err());
    assert_eq!(
        create_step_execution(&f.pool, create(9999, None))
            .await
            .unwrap_err(),
        "Workflow step was not found"
    );
    // Agent run 2 belongs to another workflow.
    assert_eq!(
        create_step_execution(&f.pool, create(step, Some(2)))
            .await
            .unwrap_err(),
        "Agent run does not belong to this workflow"
    );
    assert!(update_step_execution(&f.pool, update(1, "done"))
        .await
        .is_err());
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn create_increments_attempts_and_update_completes() {
    let (f, _, step) = fixture().await;
    let first = create_step_execution(&f.pool, create(step, None))
        .await
        .unwrap();
    // Only one active execution per step: a second claim fails until the
    // first settles.
    assert_eq!(
        create_step_execution(&f.pool, create(step, None))
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    update_step_execution(&f.pool, update(first, "blocked"))
        .await
        .unwrap();
    let second = create_step_execution(&f.pool, create(step, Some(1)))
        .await
        .unwrap();
    assert_eq!(
        text(&f.pool, &format!("SELECT group_concat(attempt_count) FROM workflow_step_executions WHERE workflow_step_id={step}")).await,
        "1,2"
    );
    update_step_execution(
        &f.pool,
        UpdateStepExecutionInput {
            agent_run_id: Some(1),
            error_summary: "x".repeat(2500),
            ..update(first, "failed")
        },
    )
    .await
    .unwrap();
    assert_eq!(
        text(&f.pool, &format!("SELECT agent_run_id||'|'||status||'|'||length(error_summary)||'|'||(completed_at IS NOT NULL) FROM workflow_step_executions WHERE id={first}")).await,
        "1|failed|2000|1"
    );
    assert_eq!(
        update_step_execution(
            &f.pool,
            UpdateStepExecutionInput {
                agent_run_id: Some(2),
                ..update(second, "running")
            }
        )
        .await
        .unwrap_err(),
        "Agent run does not belong to this workflow"
    );
    // A missing execution is a silent no-op.
    update_step_execution(&f.pool, update(9999, "running"))
        .await
        .unwrap();
}

#[tokio::test]
async fn storage_failure_rolls_back_and_hides_errors() {
    let (f, _, step) = fixture().await;
    let id = create_step_execution(&f.pool, create(step, None))
        .await
        .unwrap();
    let before = snapshot(&f.pool, TABLES).await;
    fail_on(&f.pool, "BEFORE UPDATE ON workflow_step_executions").await;
    assert_eq!(
        update_step_execution(&f.pool, update(id, "running"))
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn concurrent_claims_leave_exactly_one_active_execution() {
    let (f, _, step) = fixture().await;
    let (a, b) = tokio::join!(
        create_step_execution(&f.pool, create(step, None)),
        create_step_execution(&f.pool, create(step, None)),
    );
    assert_eq!(u8::from(a.is_ok()) + u8::from(b.is_ok()), 1, "{a:?} {b:?}");
    assert_eq!(
        number(
            &f.pool,
            &format!("SELECT COUNT(*) FROM workflow_step_executions WHERE workflow_step_id={step}")
        )
        .await,
        1
    );
}

#[tokio::test]
async fn run_list_and_validation_read_one_snapshot() {
    let (f, run, _) = fixture().await;
    let all = list_runs(&f.pool, WorkflowRunListInput::default())
        .await
        .unwrap();
    assert_eq!(all.runs.len(), 2);
    assert_eq!(all.steps.len(), 14);
    assert!(all.events.iter().any(|event| event["summary"] == "hello"));
    let one = list_runs(
        &f.pool,
        WorkflowRunListInput {
            campaign_id: Some(1),
        },
    )
    .await
    .unwrap();
    assert_eq!(one.runs.len(), 1);
    assert_eq!(one.runs[0]["campaign_name"], "Live");
    assert!(one.steps.iter().all(|step| step["workflow_run_id"] == run));

    let validation = run_validation(&f.pool, WorkflowRunIdInput { id: run })
        .await
        .unwrap();
    assert_eq!(validation["campaign_status"], "active");
    assert_eq!(validation["autopilot_plan_id"], Value::Null);
    assert_eq!(
        run_validation(&f.pool, WorkflowRunIdInput { id: 9999 })
            .await
            .unwrap_err(),
        "Workflow run was not found"
    );
    assert!(list_runs(
        &f.pool,
        WorkflowRunListInput {
            campaign_id: Some(0)
        }
    )
    .await
    .is_err());
}

#[tokio::test]
async fn events_are_capped_per_run() {
    let (f, run, _) = fixture().await;
    seed(
        &f.pool,
        &format!(
            "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 150)
             INSERT INTO workflow_events (workflow_run_id,event_type,summary) SELECT {run},'note_added','n' FROM n;"
        ),
    )
    .await;
    let snapshot = list_runs(
        &f.pool,
        WorkflowRunListInput {
            campaign_id: Some(1),
        },
    )
    .await
    .unwrap();
    assert_eq!(snapshot.events.len() as i64, EVENTS_PER_RUN_LIMIT);
}

#[tokio::test]
async fn planner_scope_reads_return_rows_for_renderer_validation() {
    let (f, run, _) = fixture().await;
    // Not planner-linked: no header, no draft scope rows.
    let scope = planner_scoring_scope(&f.pool, WorkflowRunIdInput { id: run })
        .await
        .unwrap();
    assert!(scope.header.is_none());
    assert!(scope.keywords.is_empty());
    assert!(
        planner_draft_audit_scope(&f.pool, WorkflowRunIdInput { id: run })
            .await
            .unwrap()
            .is_empty()
    );
    assert!(planner_scoring_scope(&f.pool, WorkflowRunIdInput { id: 0 })
        .await
        .is_err());

    let score_step = number(
        &f.pool,
        &format!("SELECT id FROM workflow_steps WHERE workflow_run_id={run} AND step_key='score'"),
    )
    .await;
    seed(
        &f.pool,
        &format!(
            "INSERT INTO campaign_keywords (campaign_id,keyword) VALUES (1,'ai'),(1,'ops');
             INSERT INTO source_import_batches (id,campaign_id,source_type,status,total_count,accepted_count) VALUES (1,1,'local_json','completed',1,1);
             INSERT INTO campaign_backlog_items (id,campaign_id,work_type,title,owner_type,due_at) VALUES (1,1,'research','Plan','linkgo','2026-10-01T00:00:00.000Z');
             INSERT INTO autopilot_plans (campaign_id,source_import_batch_id,source_type,status,workflow_run_id,candidate_count,campaign_backlog_item_id) VALUES (1,1,'local_json','planned',{run},1,1);
             INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES (1,'u','n','Body','h');
             INSERT INTO candidate_posts (id,campaign_id,target_post_id) VALUES (1,1,1);
             INSERT INTO workflow_artifacts (workflow_run_id,workflow_step_id,artifact_type,artifact_id) VALUES ({run},{score_step},'candidate_post',1),({run},{score_step},'candidate_post',99);"
        ),
    )
    .await;
    let scope = planner_scoring_scope(&f.pool, WorkflowRunIdInput { id: run })
        .await
        .unwrap();
    let header = scope.header.unwrap();
    assert_eq!(header["workflow_step_id"], score_step);
    assert_eq!(header["plan_status"], "planned");
    assert_eq!(scope.keywords, vec!["ai", "ops"]);
    assert_eq!(scope.artifacts.len(), 2);
    assert_eq!(scope.artifacts[0]["content"], "Body");
    // The removed candidate still appears with null candidate columns.
    assert_eq!(scope.artifacts[1]["candidate_id"], Value::Null);
}

#[tokio::test]
async fn agent_run_reads_return_runs_and_related_rows() {
    let (f, _, _) = fixture().await;
    seed(
        &f.pool,
        "INSERT INTO agent_run_events (agent_run_id,event_type,summary) VALUES (1,'model_started','go');
         INSERT INTO agent_tool_calls (agent_run_id,provider_tool_call_id,tool_name,status,input_json,output_json) VALUES (1,'c1','research_posts','completed','{}','{}');",
    )
    .await;
    let all = list_agent_runs(&f.pool, WorkflowRunListInput::default())
        .await
        .unwrap();
    assert_eq!(all.runs.len(), 2);
    assert_eq!(all.tool_calls.len(), 1);
    assert_eq!(all.events.len(), 1);
    assert!(all.checkpoints.is_empty());
    let one = list_agent_runs(
        &f.pool,
        WorkflowRunListInput {
            campaign_id: Some(2),
        },
    )
    .await
    .unwrap();
    assert_eq!(one.runs.len(), 1);
    assert!(one.tool_calls.is_empty() && one.events.is_empty());

    let run = agent_run_validation(&f.pool, WorkflowRunIdInput { id: 1 })
        .await
        .unwrap();
    assert_eq!(run["campaign_status"], "active");
    assert_eq!(run["input_context_json"], "{}");
    assert_eq!(
        agent_run_validation(&f.pool, WorkflowRunIdInput { id: 99 })
            .await
            .unwrap_err(),
        "Agent run was not found"
    );
    assert!(agent_run_validation(&f.pool, WorkflowRunIdInput { id: 0 })
        .await
        .is_err());
}
