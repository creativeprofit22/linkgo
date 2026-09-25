use super::*;
use crate::test_support::{count, fail_on, migrated, number, seed, snapshot, text, Fixture};

/// Extracts the string members of `export const NAME = [ ... ] as const`.
fn renderer_const(name: &str) -> Vec<String> {
    let source = include_str!("../../src/agent/types.ts");
    let marker = format!("export const {name} = [");
    let start = source
        .find(&marker)
        .unwrap_or_else(|| panic!("{name} not found"))
        + marker.len();
    let body = &source[start..start + source[start..].find("] as const").unwrap()];
    body.split('"')
        .enumerate()
        .filter(|(index, _)| index % 2 == 1)
        .map(|(_, value)| value.to_string())
        .collect()
}

/// Guards the native enums against drift from the renderer contract.
#[test]
fn native_enums_match_the_renderer_agent_types() {
    for (name, native) in [
        ("AGENT_ROLES", ROLES.as_slice()),
        ("AGENT_TOOL_NAMES", TOOLS.as_slice()),
        ("AGENT_RUN_EVENT_TYPES", EVENT_TYPES.as_slice()),
        ("AGENT_TOOL_CALL_STATUSES", TOOL_CALL_STATUSES.as_slice()),
    ] {
        let mut expected = renderer_const(name);
        let mut actual: Vec<String> = native.iter().map(|v| v.to_string()).collect();
        expected.sort();
        actual.sort();
        assert_eq!(actual, expected, "{name}");
    }
}

const TABLES: &[&str] = &[
    "agent_runs",
    "agent_run_events",
    "agent_tool_calls",
    "agent_run_approval_checkpoints",
    "safety_audit_events",
    "error_queue_items",
    "workflow_runs",
    "workflow_steps",
    "workflow_events",
];

/// Campaign 1 active, 2 archived, 3 other. Approval 1 belongs to campaign 1,
/// approval 2 to campaign 3 (approval triggers dropped: only ownership is
/// read here). Workflow run 5 (campaign 1) with step 6 `draft`.
async fn fixture() -> Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        "DROP TRIGGER IF EXISTS approvals_validate_insert;
         DROP TRIGGER IF EXISTS approvals_bind_insert;
         INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Old','archived',5),(3,'Other','active',5);
         INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES (1,'u1','n1','a','h1'),(2,'u2','n2','b','h2');
         INSERT INTO candidate_posts (id,campaign_id,target_post_id) VALUES (1,1,1),(2,3,2);
         INSERT INTO drafts (id,campaign_id,candidate_post_id,status) VALUES (1,1,1,'ready_for_review'),(2,3,2,'ready_for_review');
         INSERT INTO draft_variants (id,draft_id,variant_number,hook,body,status) VALUES (1,1,1,'h','b','selected'),(2,2,1,'h','b','selected');
         INSERT INTO approvals (id,campaign_id,draft_id,draft_variant_id,status) VALUES (1,1,1,1,'approved'),(2,3,2,2,'approved');
         INSERT INTO workflow_runs (id,campaign_id,title,status,current_step_key) VALUES (5,1,'Run','running','draft');
         INSERT INTO workflow_steps (id,workflow_run_id,step_key,title,sort_order,status) VALUES (6,5,'draft','Draft',3,'running');",
    )
    .await;
    f
}

fn create(campaign_id: i64, role: &str) -> CreateAgentRunInput {
    CreateAgentRunInput {
        campaign_id,
        workflow_run_id: None,
        workflow_step_id: None,
        agent_role: role.to_string(),
        provider_key: "dry_run".to_string(),
        model_name: default_model_name(),
        playbook_key: None,
        input_summary: " Draft it ".to_string(),
        input_context: Some(json!({ "topic": "ai" })),
    }
}

async fn running_run(f: &Fixture, role: &str) -> i64 {
    let id = create_run(&f.pool, create(1, role)).await.unwrap().id;
    start_run(&f.pool, StartAgentRunInput { id, claim: true })
        .await
        .unwrap();
    id
}

fn conversation() -> Value {
    json!([
        { "role": "system", "content": "s" },
        { "role": "user", "content": "u" },
        { "role": "assistant", "content": "", "toolName": "schedule_post", "providerToolCallId": "c1" }
    ])
}

fn completed(tool_calls: Vec<AgentLoopToolCall>) -> AgentLoopResult {
    AgentLoopResult {
        status: "completed".to_string(),
        output_summary: "Done".to_string(),
        error_message: String::new(),
        iteration_count: 2,
        conversation: json!([{ "role": "user", "content": "u" }]),
        tool_calls,
    }
}

fn tool_call(name: &str, status: &str, input: Value) -> AgentLoopToolCall {
    AgentLoopToolCall {
        provider_tool_call_id: "c1".to_string(),
        tool_name: name.to_string(),
        status: status.to_string(),
        requires_approval: status == "waiting_approval",
        input,
        output: None,
        error_message: String::new(),
    }
}

fn waiting(approval_id: i64, campaign_id: i64) -> AgentLoopResult {
    AgentLoopResult {
        status: "waiting_approval".to_string(),
        output_summary: String::new(),
        error_message: String::new(),
        iteration_count: 3,
        conversation: conversation(),
        tool_calls: vec![tool_call(
            "schedule_post",
            "waiting_approval",
            json!({ "campaignId": campaign_id, "approvalId": approval_id, "scheduledFor": "2026-10-01T09:00", "timezone": "UTC" }),
        )],
    }
}

fn persist(id: i64, result: AgentLoopResult) -> PersistAgentResultInput {
    PersistAgentResultInput {
        agent_run_id: id,
        continuation: false,
        result,
    }
}

#[test]
fn inputs_reject_unknown_fields() {
    assert!(serde_json::from_value::<StartAgentRunInput>(
        json!({ "id": 1, "claim": true, "skipKillSwitch": true })
    )
    .is_err());
    assert!(serde_json::from_value::<AgentLoopToolCall>(json!({
        "toolName": "draft_post", "status": "completed", "requiresApproval": false, "input": {}, "id": 9
    }))
    .is_err());
}

#[tokio::test]
async fn create_resolves_default_playbook_and_writes_event() {
    let f = fixture().await;
    let id = create_run(&f.pool, create(1, "drafter")).await.unwrap().id;
    assert_eq!(
        text(&f.pool, &format!("SELECT status||'|'||playbook_key||'|'||input_summary||'|'||input_context_json FROM agent_runs WHERE id={id}")).await,
        r#"queued|linkedin_writer|Draft it|{"topic":"ai"}"#
    );
    assert_eq!(
        text(
            &f.pool,
            "SELECT event_type||'|'||summary FROM agent_run_events"
        )
        .await,
        "run_created|Agent run created for drafter."
    );
    // Roles without a default get no playbook.
    let scorer = create_run(&f.pool, create(1, "scorer")).await.unwrap().id;
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT playbook_key FROM agent_runs WHERE id={scorer}")
        )
        .await,
        ""
    );
}

#[tokio::test]
async fn create_honours_disabled_overrides_and_rejects_bad_playbooks() {
    let f = fixture().await;
    seed(
        &f.pool,
        "INSERT INTO agent_playbook_overrides (playbook_key, enabled) VALUES ('linkedin_writer', 0);",
    )
    .await;
    // A disabled default is silently dropped.
    let id = create_run(&f.pool, create(1, "drafter")).await.unwrap().id;
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT playbook_key FROM agent_runs WHERE id={id}")
        )
        .await,
        ""
    );
    let before = snapshot(&f.pool, TABLES).await;
    for (key, role, expected) in [
        ("linkedin_writer", "drafter", "Playbook is disabled"),
        ("linkedin_commenter", "drafter", "Playbook is disabled"),
        (
            "campaign_analyst",
            "drafter",
            "Playbook is not compatible with the selected agent role",
        ),
        ("made_up", "drafter", "Playbook was not found"),
    ] {
        let mut input = create(1, role);
        input.playbook_key = Some(key.to_string());
        assert_eq!(
            create_run(&f.pool, input).await.unwrap_err(),
            expected,
            "{key}"
        );
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn create_checks_campaign_and_workflow_ownership() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    let mut foreign_run = create(3, "drafter");
    foreign_run.workflow_run_id = Some(5);
    let mut foreign_step = create(3, "drafter");
    foreign_step.workflow_step_id = Some(6);
    let mut bad_context = create(1, "drafter");
    bad_context.input_context = Some(json!(["not", "an", "object"]));
    let mut bad_role = create(1, "drafter");
    bad_role.agent_role = "hacker".to_string();
    for (input, expected) in [
        (create(99, "drafter"), "Campaign was not found"),
        (create(2, "drafter"), "Campaign is archived"),
        (foreign_run, "Workflow run belongs to a different campaign"),
        (
            foreign_step,
            "Workflow step belongs to a different campaign",
        ),
        (bad_context, "Agent input context must be an object"),
        (bad_role, "Unsupported agent role"),
    ] {
        assert_eq!(create_run(&f.pool, input).await.unwrap_err(), expected);
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
    // A step alone fills in its workflow run.
    let mut linked = create(1, "drafter");
    linked.workflow_step_id = Some(6);
    let id = create_run(&f.pool, linked).await.unwrap().id;
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT workflow_run_id||'|'||workflow_step_id FROM agent_runs WHERE id={id}")
        )
        .await,
        "5|6"
    );
}

#[tokio::test]
async fn start_claims_once_and_audits() {
    let f = fixture().await;
    let id = create_run(&f.pool, create(1, "drafter")).await.unwrap().id;
    start_run(&f.pool, StartAgentRunInput { id, claim: true })
        .await
        .unwrap();
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT status FROM agent_runs WHERE id={id}")
        )
        .await,
        "running"
    );
    assert_eq!(
        text(
            &f.pool,
            "SELECT event_type||'|'||metadata_json FROM safety_audit_events"
        )
        .await,
        r#"agent_run_started|{"agentRole":"drafter","providerKey":"dry_run"}"#
    );
    assert_eq!(
        start_run(&f.pool, StartAgentRunInput { id, claim: true })
            .await
            .unwrap_err(),
        "Agent run is already running"
    );
}

#[tokio::test]
async fn start_without_claim_only_runs_preflight() {
    let f = fixture().await;
    let id = create_run(&f.pool, create(1, "scorer")).await.unwrap().id;
    start_run(&f.pool, StartAgentRunInput { id, claim: false })
        .await
        .unwrap();
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT status FROM agent_runs WHERE id={id}")
        )
        .await,
        "queued"
    );
    assert_eq!(count(&f.pool, "safety_audit_events").await, 0);
}

#[tokio::test]
async fn kill_switch_blocks_start_but_keeps_its_audit() {
    let f = fixture().await;
    let id = create_run(&f.pool, create(1, "drafter")).await.unwrap().id;
    seed(
        &f.pool,
        "INSERT OR REPLACE INTO safety_settings (id, global_kill_switch, kill_switch_reason) VALUES (1, 1, 'Incident');",
    )
    .await;
    for claim in [true, false] {
        assert_eq!(
            start_run(&f.pool, StartAgentRunInput { id, claim })
                .await
                .unwrap_err(),
            "Global kill switch is enabled: Incident"
        );
    }
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT status FROM agent_runs WHERE id={id}")
        )
        .await,
        "queued"
    );
    assert_eq!(
        text(
            &f.pool,
            "SELECT group_concat(event_type||':'||severity, ',') FROM safety_audit_events"
        )
        .await,
        "agent_run_failed:block,agent_run_failed:block"
    );
}

#[tokio::test]
async fn start_rejects_terminal_archived_and_checkpointed_runs() {
    let f = fixture().await;
    let id = create_run(&f.pool, create(1, "drafter")).await.unwrap().id;
    seed(&f.pool, &format!(
        "INSERT INTO agent_tool_calls (id,agent_run_id,tool_name,status,requires_approval,input_json,output_json) VALUES (40,{id},'schedule_post','waiting_approval',1,'{{}}','{{}}');
         INSERT INTO agent_run_approval_checkpoints (agent_run_id,pending_tool_call_id,approval_id,phase,messages_json,iteration_count) VALUES ({id},40,1,'waiting_approval','[]',1);"
    )).await;
    assert_eq!(
        start_run(&f.pool, StartAgentRunInput { id, claim: true })
            .await
            .unwrap_err(),
        "Use approval continuation recovery for this agent run"
    );
    seed(
        &f.pool,
        &format!("UPDATE agent_runs SET status='completed' WHERE id={id};"),
    )
    .await;
    assert_eq!(
        start_run(&f.pool, StartAgentRunInput { id, claim: true })
            .await
            .unwrap_err(),
        "Terminal agent runs cannot be restarted"
    );
    seed(
        &f.pool,
        "UPDATE campaigns SET status='archived' WHERE id=1;",
    )
    .await;
    assert_eq!(
        start_run(&f.pool, StartAgentRunInput { id, claim: true })
            .await
            .unwrap_err(),
        "Campaign is archived"
    );
}

#[tokio::test]
async fn persist_completed_writes_tool_calls_and_reconciles_workflow() {
    let f = fixture().await;
    let mut input = create(1, "drafter");
    input.workflow_step_id = Some(6);
    let id = create_run(&f.pool, input).await.unwrap().id;
    start_run(&f.pool, StartAgentRunInput { id, claim: true })
        .await
        .unwrap();
    let out = persist_result(
        &f.pool,
        persist(
            id,
            completed(vec![tool_call(
                "draft_post",
                "completed",
                json!({ "x": 1 }),
            )]),
        ),
    )
    .await
    .unwrap();
    assert_eq!(out.checkpoint_phase, None);
    assert_eq!(
        text(&f.pool, &format!("SELECT status||'|'||output_summary||'|'||iteration_count||'|'||(completed_at IS NOT NULL) FROM agent_runs WHERE id={id}")).await,
        "completed|Done|2|1"
    );
    assert_eq!(
        text(&f.pool, "SELECT tool_name||'|'||status||'|'||input_json||'|'||output_json||'|'||(completed_at IS NOT NULL) FROM agent_tool_calls").await,
        r#"draft_post|completed|{"x":1}|{}|1"#
    );
    assert_eq!(
        text(&f.pool, "SELECT status FROM workflow_steps WHERE id=6").await,
        "completed"
    );
}

#[tokio::test]
async fn persist_failed_audits_and_upserts_one_error_item() {
    let f = fixture().await;
    let id = running_run(&f, "drafter").await;
    let mut failed = completed(vec![]);
    failed.status = "failed".to_string();
    failed.error_message = "Provider timed out".to_string();
    persist_result(&f.pool, persist(id, failed.clone()))
        .await
        .unwrap();
    assert_eq!(
        text(&f.pool, "SELECT source_type||'|'||source_id||'|'||title||'|'||detail||'|'||status FROM error_queue_items").await,
        format!("agent_run|{id}|Agent run failed|Provider timed out|open")
    );
    assert_eq!(
        text(&f.pool, "SELECT group_concat(event_type, ',') FROM (SELECT event_type FROM safety_audit_events ORDER BY id)").await,
        "agent_run_started,agent_run_failed,error_item_created"
    );
    // A second failure of the same run updates the open item.
    seed(
        &f.pool,
        &format!("UPDATE agent_runs SET status='running' WHERE id={id};"),
    )
    .await;
    failed.error_message = "Still failing".to_string();
    persist_result(&f.pool, persist(id, failed)).await.unwrap();
    assert_eq!(count(&f.pool, "error_queue_items").await, 1);
    assert_eq!(
        text(&f.pool, "SELECT detail FROM error_queue_items").await,
        "Still failing"
    );
}

#[tokio::test]
async fn persist_waiting_approval_creates_checkpoint_for_owned_approval() {
    let f = fixture().await;
    let id = running_run(&f, "scheduler").await;
    let out = persist_result(&f.pool, persist(id, waiting(1, 1)))
        .await
        .unwrap();
    assert_eq!(out.checkpoint_phase.as_deref(), Some("waiting_approval"));
    assert_eq!(
        text(&f.pool, "SELECT phase||'|'||approval_id||'|'||iteration_count||'|'||(pending_tool_call_id = (SELECT id FROM agent_tool_calls)) FROM agent_run_approval_checkpoints").await,
        "waiting_approval|1|3|1"
    );
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT status||'|'||(completed_at IS NULL) FROM agent_runs WHERE id={id}")
        )
        .await,
        "waiting_approval|1"
    );
}

#[tokio::test]
async fn persist_rejections_roll_back_every_write() {
    let f = fixture().await;
    let id = running_run(&f, "scheduler").await;
    let before = snapshot(&f.pool, TABLES).await;
    let mut two_pending = waiting(1, 1);
    two_pending
        .tool_calls
        .push(tool_call("schedule_post", "waiting_approval", json!({})));
    let mut wrong_tool = waiting(1, 1);
    wrong_tool.tool_calls[0].tool_name = "draft_post".to_string();
    let mut bad_conversation = completed(vec![]);
    bad_conversation.conversation = json!([{ "role": "tool", "content": "x", "toolName": "draft_post", "providerToolCallId": "orphan" }]);
    for (result, expected) in [
        (
            waiting(2, 1),
            "Linked approval belongs to a different campaign",
        ),
        (
            waiting(1, 3),
            "Schedule request belongs to a different campaign",
        ),
        (waiting(99, 1), "Linked approval was not found"),
        (
            two_pending,
            "Approval interrupt must contain one pending tool call",
        ),
        (
            wrong_tool,
            "Only schedule_post can create an approval checkpoint",
        ),
    ] {
        assert_eq!(
            persist_result(&f.pool, persist(id, result))
                .await
                .unwrap_err(),
            expected
        );
    }
    assert!(persist_result(&f.pool, persist(id, bad_conversation))
        .await
        .is_err());
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn persist_rolls_back_when_error_queue_write_fails() {
    let f = fixture().await;
    let id = running_run(&f, "drafter").await;
    fail_on(&f.pool, "BEFORE INSERT ON error_queue_items").await;
    let before = snapshot(&f.pool, TABLES).await;
    let mut failed = completed(vec![tool_call("draft_post", "failed", json!({}))]);
    failed.status = "failed".to_string();
    assert_eq!(
        persist_result(&f.pool, persist(id, failed))
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
    // The renderer then marks the run failed on its own.
    fail_after_persistence_error(
        &f.pool,
        FailAgentRunInput {
            agent_run_id: id,
            error_message: "Could not save".to_string(),
        },
    )
    .await
    .unwrap();
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT status||'|'||error_message FROM agent_runs WHERE id={id}")
        )
        .await,
        "failed|Could not save"
    );
}

#[tokio::test]
async fn persist_never_overwrites_a_run_cancelled_mid_loop() {
    let f = fixture().await;
    let id = running_run(&f, "drafter").await;
    cancel_run(&f.pool, AgentRunIdInput { id }).await.unwrap();
    assert_eq!(
        persist_result(&f.pool, persist(id, completed(vec![])))
            .await
            .unwrap_err(),
        "Agent run is no longer running"
    );
    fail_after_persistence_error(
        &f.pool,
        FailAgentRunInput {
            agent_run_id: id,
            error_message: "x".to_string(),
        },
    )
    .await
    .unwrap();
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT status FROM agent_runs WHERE id={id}")
        )
        .await,
        "cancelled"
    );
    assert_eq!(
        number(&f.pool, &format!("SELECT COUNT(*) FROM agent_run_events WHERE agent_run_id={id} AND event_type='run_failed'")).await,
        0
    );
}

#[tokio::test]
async fn continuation_persist_requires_an_active_continuation_checkpoint() {
    let f = fixture().await;
    let id = running_run(&f, "scheduler").await;
    let mut input = persist(id, completed(vec![]));
    input.continuation = true;
    assert_eq!(
        persist_result(&f.pool, input).await.unwrap_err(),
        "Agent continuation checkpoint is no longer active"
    );
}

#[tokio::test]
async fn cancel_reconciles_workflow_clears_checkpoint_and_rejects_completed() {
    let f = fixture().await;
    let mut input = create(1, "scheduler");
    input.workflow_step_id = Some(6);
    let id = create_run(&f.pool, input).await.unwrap().id;
    start_run(&f.pool, StartAgentRunInput { id, claim: true })
        .await
        .unwrap();
    persist_result(&f.pool, persist(id, waiting(1, 1)))
        .await
        .unwrap();
    cancel_run(&f.pool, AgentRunIdInput { id }).await.unwrap();
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT status||'|'||error_message FROM agent_runs WHERE id={id}")
        )
        .await,
        "cancelled|Agent run cancelled"
    );
    assert_eq!(count(&f.pool, "agent_run_approval_checkpoints").await, 0);
    assert_eq!(
        number(&f.pool, &format!("SELECT COUNT(*) FROM agent_run_events WHERE agent_run_id={id} AND event_type='run_cancelled'")).await,
        1
    );
    let done = running_run(&f, "drafter").await;
    persist_result(&f.pool, persist(done, completed(vec![])))
        .await
        .unwrap();
    assert_eq!(
        cancel_run(&f.pool, AgentRunIdInput { id: done })
            .await
            .unwrap_err(),
        "Completed agent runs cannot be cancelled"
    );
}

#[tokio::test]
async fn cancel_rolls_back_when_event_insert_fails() {
    let f = fixture().await;
    let id = running_run(&f, "drafter").await;
    fail_on(
        &f.pool,
        "BEFORE INSERT ON agent_run_events WHEN NEW.event_type = 'run_cancelled'",
    )
    .await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        cancel_run(&f.pool, AgentRunIdInput { id })
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn record_event_validates_type_and_run() {
    let f = fixture().await;
    let id = create_run(&f.pool, create(1, "drafter")).await.unwrap().id;
    record_event(
        &f.pool,
        RecordAgentRunEventInput {
            agent_run_id: id,
            event_type: "model_started".to_string(),
            summary: " Thinking ".to_string(),
        },
    )
    .await
    .unwrap();
    assert_eq!(
        text(&f.pool, &format!("SELECT summary FROM agent_run_events WHERE agent_run_id={id} AND event_type='model_started'")).await,
        "Thinking"
    );
    for (run, event, expected) in [
        (99, "model_started", "Agent run was not found"),
        (id, "run_hijacked", "Unsupported agent run event type"),
    ] {
        assert_eq!(
            record_event(
                &f.pool,
                RecordAgentRunEventInput {
                    agent_run_id: run,
                    event_type: event.to_string(),
                    summary: "x".to_string()
                }
            )
            .await
            .unwrap_err(),
            expected
        );
    }
}
