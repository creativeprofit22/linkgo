use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{Row, SqliteConnection, SqlitePool};
use std::collections::HashSet;
use tauri::State;

const REQUIRED_RULES: [&str; 6] = [
    "hook",
    "specificity",
    "generic_language",
    "authenticity",
    "clarity",
    "safety",
];
const STALE_MINUTES: i64 = 15;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClaimPlannerDraftAuditInput {
    pub workflow_run_id: i64,
    pub workflow_step_id: i64,
    pub campaign_id: i64,
    pub draft_id: i64,
    pub draft_generation_request_id: i64,
    pub provider_key: String,
    pub model_name: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlannerDraftAuditClaimPayload {
    pub execution_id: i64,
    pub audit_run_id: i64,
    pub agent_run_id: i64,
    pub workflow_run_id: i64,
    pub workflow_step_id: i64,
    pub draft_id: i64,
    pub draft_variant_id: i64,
    pub content_revision: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CompletePlannerDraftAuditPayload {
    pub terminal: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlannerDraftAuditFindingInput {
    pub rule_key: String,
    pub severity: String,
    pub message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompletePlannerDraftAuditInput {
    pub agent_run_id: i64,
    pub summary: String,
    pub findings: Vec<PlannerDraftAuditFindingInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FailPlannerDraftAuditInput {
    pub agent_run_id: i64,
    pub error_summary: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReconcileStalePlannerDraftAuditsInput {
    #[serde(default = "default_reconcile_limit")]
    pub limit: i64,
}

fn default_reconcile_limit() -> i64 {
    25
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileStalePlannerDraftAuditsPayload {
    pub failed_audit_run_ids: Vec<i64>,
    pub failed_agent_run_ids: Vec<i64>,
    pub failed_execution_ids: Vec<i64>,
    pub failed_workflow_run_ids: Vec<i64>,
}

struct AuditLink {
    agent_run_id: i64,
    audit_run_id: i64,
    execution_id: i64,
    workflow_run_id: i64,
    workflow_step_id: i64,
    draft_variant_id: i64,
    content_revision: i64,
}

fn db_error(message: &'static str) -> impl FnOnce(sqlx::Error) -> String {
    move |error| format!("{message}: {error}")
}

fn bounded(value: &str, maximum: usize, label: &str) -> Result<String, String> {
    let compact = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.is_empty() || compact.chars().count() > maximum {
        return Err(format!("{label} is invalid"));
    }
    Ok(compact)
}

fn default_agent_model(provider: &str) -> Option<&'static str> {
    match provider {
        "dry_run" => Some("dry-run-local"),
        "anthropic" => Some("claude-sonnet-4-6"),
        "xiaomi" => Some("MiMo-VL-7B-RL"),
        "openai" => Some("gpt-4.1-mini"),
        "gemini" => Some("gemini-2.5-flash"),
        "glm" => Some("glm-4.7"),
        "moonshot" => Some("kimi-k2-0711-preview"),
        "deepseek" => Some("deepseek-chat"),
        "openrouter" => Some("openrouter/auto"),
        "sakana" => Some("fugu-mt-001"),
        "minimax" => Some("MiniMax-M2"),
        "custom" => Some("custom-model"),
        _ => None,
    }
}

fn validate_findings(findings: &[PlannerDraftAuditFindingInput]) -> Result<(), String> {
    if findings.len() != REQUIRED_RULES.len() {
        return Err("Audit findings must contain exactly all six required categories".to_string());
    }
    let mut rules = HashSet::new();
    for finding in findings {
        if !REQUIRED_RULES.contains(&finding.rule_key.as_str()) || !rules.insert(&finding.rule_key)
        {
            return Err(
                "Audit findings must contain exactly all six required categories".to_string(),
            );
        }
        if !matches!(finding.severity.as_str(), "pass" | "warning" | "block") {
            return Err("Audit finding severity is invalid".to_string());
        }
        bounded(&finding.message, 500, "Audit finding message")?;
    }
    Ok(())
}

async fn begin_immediate(
    pool: &SqlitePool,
    label: &str,
) -> Result<sqlx::pool::PoolConnection<sqlx::Sqlite>, String> {
    let mut connection = pool
        .acquire()
        .await
        .map_err(|_| format!("Could not open {label} transaction"))?;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *connection)
        .await
        .map_err(|_| format!("Could not start {label} transaction"))?;
    Ok(connection)
}

async fn finish<T>(
    connection: &mut SqliteConnection,
    result: Result<T, String>,
    label: &str,
) -> Result<T, String> {
    match result {
        Ok(value) => {
            if sqlx::query("COMMIT")
                .execute(&mut *connection)
                .await
                .is_err()
            {
                let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                Err(format!("Could not commit {label} transaction"))
            } else {
                Ok(value)
            }
        }
        Err(error) => {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            Err(error)
        }
    }
}

async fn workflow_event(
    connection: &mut SqliteConnection,
    run_id: i64,
    step_id: i64,
    event_type: &str,
    summary: &str,
) -> Result<(), String> {
    sqlx::query("INSERT INTO workflow_events (workflow_run_id, workflow_step_id, event_type, summary) VALUES (?1, ?2, ?3, ?4)")
        .bind(run_id).bind(step_id).bind(event_type).bind(summary)
        .execute(&mut *connection).await.map_err(db_error("Could not record draft audit workflow event"))?;
    Ok(())
}

async fn claim_on_connection(
    connection: &mut SqliteConnection,
    input: &ClaimPlannerDraftAuditInput,
) -> Result<PlannerDraftAuditClaimPayload, String> {
    let workflow_run_id = input.workflow_run_id;
    let row = sqlx::query(
        "SELECT wr.campaign_id, wr.status AS run_status, wr.current_step_key,
                ws.id AS audit_step_id, ws.status AS audit_step_status,
                wa.workflow_step_id AS artifact_step_id, wa.artifact_id AS draft_id,
                d.campaign_id AS draft_campaign_id, d.candidate_post_id AS draft_candidate_id,
                dgr.id AS request_id, dgr.provider_key, dgr.model_name,
                dgr.workflow_run_id AS request_run_id, dgr.workflow_step_id AS request_step_id,
                dgr.campaign_id AS request_campaign_id,
                dgr.candidate_post_id AS request_candidate_id, dgr.created_draft_id
           FROM workflow_runs wr
           INNER JOIN workflow_steps ws ON ws.workflow_run_id = wr.id AND ws.step_key = 'audit'
           INNER JOIN workflow_artifacts wa ON wa.workflow_run_id = wr.id AND wa.artifact_type = 'draft'
           INNER JOIN drafts d ON d.id = wa.artifact_id
           INNER JOIN draft_generation_requests dgr ON dgr.created_draft_id = d.id AND dgr.status = 'saved'
          WHERE wr.id = ?1 AND EXISTS (SELECT 1 FROM autopilot_plans ap WHERE ap.workflow_run_id = wr.id AND ap.campaign_id = wr.campaign_id AND ap.status = 'planned')")
        .bind(workflow_run_id).fetch_all(&mut *connection).await.map_err(db_error("Could not load planner draft audit scope"))?;
    if row.len() != 1 {
        return Err(
            "Planner audit requires one saved draft artifact with request provenance".to_string(),
        );
    }
    let row = &row[0];
    let campaign_id: i64 = row.try_get("campaign_id").unwrap_or_default();
    let draft_id: i64 = row.try_get("draft_id").unwrap_or_default();
    let step_id: i64 = row.try_get("audit_step_id").unwrap_or_default();
    let artifact_step_id: i64 = row.try_get("artifact_step_id").unwrap_or_default();
    let request_run_id: Option<i64> = row.try_get("request_run_id").unwrap_or(None);
    let request_step_id: Option<i64> = row.try_get("request_step_id").unwrap_or(None);
    let request_campaign_id: i64 = row.try_get("request_campaign_id").unwrap_or_default();
    let request_candidate_id: i64 = row.try_get("request_candidate_id").unwrap_or_default();
    let draft_campaign_id: i64 = row.try_get("draft_campaign_id").unwrap_or_default();
    let draft_candidate_id: i64 = row.try_get("draft_candidate_id").unwrap_or_default();
    let created_draft_id: Option<i64> = row.try_get("created_draft_id").unwrap_or(None);
    let current_step: String = row.try_get("current_step_key").unwrap_or_default();
    let run_status: String = row.try_get("run_status").unwrap_or_default();
    let step_status: String = row.try_get("audit_step_status").unwrap_or_default();
    // The request belongs to the draft step immediately preceding this audit step.
    let draft_step_id: i64 = sqlx::query_scalar(
        "SELECT id FROM workflow_steps WHERE workflow_run_id = ?1 AND step_key = 'draft'",
    )
    .bind(workflow_run_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(db_error("Could not validate draft request provenance"))?
    .ok_or_else(|| "Planner draft step was not found".to_string())?;
    if artifact_step_id != draft_step_id
        || request_run_id != Some(workflow_run_id)
        || request_step_id != Some(draft_step_id)
        || request_campaign_id != campaign_id
        || draft_campaign_id != campaign_id
        || request_candidate_id != draft_candidate_id
        || created_draft_id != Some(draft_id)
        || current_step != "audit"
        || !matches!(run_status.as_str(), "running" | "blocked" | "failed")
        || !matches!(
            step_status.as_str(),
            "pending" | "running" | "blocked" | "failed"
        )
    {
        return Err(
            "Saved draft request provenance does not match the planner audit scope".to_string(),
        );
    }
    let active: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM workflow_step_executions WHERE workflow_step_id = ?1 AND status IN ('claimed','running','waiting_approval')")
        .bind(step_id).fetch_one(&mut *connection).await.map_err(db_error("Could not check active draft audit execution"))?;
    if active != 0 {
        return Err("A planner draft audit execution is already active".to_string());
    }

    let variant = sqlx::query(
        "SELECT dv.id, dv.variant_number, dv.content_revision, dv.hook, dv.body, dv.cta, dv.hashtags
           FROM draft_variants dv
          WHERE dv.draft_id = ?1
            AND NOT EXISTS (SELECT 1 FROM draft_ai_audit_runs dar WHERE dar.draft_variant_id = dv.id AND dar.content_revision = dv.content_revision AND dar.status = 'completed')
          ORDER BY dv.variant_number ASC LIMIT 1")
        .bind(draft_id).fetch_optional(&mut *connection).await.map_err(db_error("Could not select draft variant for audit"))?
        .ok_or_else(|| "All current draft revisions are already audited".to_string())?;
    let variant_id: i64 = variant.try_get("id").unwrap_or_default();
    let revision: i64 = variant.try_get("content_revision").unwrap_or_default();
    let duplicate: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM draft_ai_audit_runs WHERE draft_variant_id=?1 AND content_revision=?2 AND status IN ('pending','running')")
        .bind(variant_id).bind(revision).fetch_one(&mut *connection).await.map_err(db_error("Could not check active revision audit"))?;
    if duplicate != 0 {
        return Err("An active AI audit already exists for this draft revision".to_string());
    }

    let attempt: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(attempt_count),0)+1 FROM workflow_step_executions WHERE workflow_step_id=?1")
        .bind(step_id).fetch_one(&mut *connection).await.map_err(db_error("Could not allocate audit attempt"))?;
    let execution_id = sqlx::query("INSERT INTO workflow_step_executions (workflow_step_id,executor_role,attempt_count,status,updated_at) VALUES (?1,'auditor',?2,'running',datetime('now'))")
        .bind(step_id).bind(attempt).execute(&mut *connection).await.map_err(db_error("Could not create audit execution"))?.last_insert_rowid();
    let provider: String = row.try_get("provider_key").unwrap_or_default();
    let default_model = default_agent_model(&provider)
        .ok_or_else(|| "Saved planner audit provider is invalid".to_string())?;
    let saved_model: String = row.try_get("model_name").unwrap_or_default();
    let model = if saved_model.trim().is_empty() {
        default_model.to_string()
    } else {
        saved_model.trim().to_string()
    };
    if input.workflow_step_id != step_id
        || input.campaign_id != campaign_id
        || input.draft_id != draft_id
        || input.draft_generation_request_id
            != row.try_get::<i64, _>("request_id").unwrap_or_default()
        || input.provider_key != provider
        || input.model_name != model
    {
        return Err("Caller planner audit provenance does not match saved provenance".to_string());
    }
    if model.chars().count() > 120 {
        return Err("Saved planner audit model is invalid".to_string());
    }
    let audit_id = sqlx::query("INSERT INTO draft_ai_audit_runs (draft_variant_id,content_revision,provider_key,model_name,status,started_at,updated_at,workflow_step_execution_id) VALUES (?1,?2,?3,?4,'running',datetime('now'),datetime('now'),?5)")
        .bind(variant_id).bind(revision).bind(&provider).bind(&model).bind(execution_id).execute(&mut *connection).await.map_err(db_error("Could not reserve draft AI audit"))?.last_insert_rowid();
    let mut segments = Vec::new();
    for name in ["hook", "body", "cta", "hashtags"] {
        let segment: String = variant
            .try_get(name)
            .map_err(|_| "Could not read canonical draft audit text".to_string())?;
        if !segment.is_empty() {
            segments.push(segment);
        }
    }
    let text = segments.join("\n\n");
    if text.trim().is_empty() || text.chars().count() > 4000 {
        return Err("Draft AI audit text does not satisfy the audit contract".to_string());
    }
    let context = json!({"auditRequest":{"campaignId":campaign_id,"draftVariantId":variant_id,"contentRevision":revision,"auditRunId":audit_id,"text":text},"planner":{"workflowRunId":workflow_run_id,"workflowStepId":step_id,"draftId":draft_id,"draftGenerationRequestId":row.try_get::<i64,_>("request_id").unwrap_or_default()}}).to_string();
    let agent_id = sqlx::query("INSERT INTO agent_runs (campaign_id,workflow_run_id,workflow_step_id,agent_role,provider_key,model_name,playbook_key,status,input_summary,input_context_json,updated_at) VALUES (?1,?2,?3,'auditor',?4,?5,'linkedin_humanizer','queued',?6,?7,datetime('now'))")
        .bind(campaign_id).bind(workflow_run_id).bind(step_id).bind(&provider).bind(&model)
        .bind(format!("Audit draft variant #{variant_id} revision {revision}.")).bind(context)
        .execute(&mut *connection).await.map_err(db_error("Could not create planner auditor run"))?.last_insert_rowid();
    sqlx::query(
        "UPDATE draft_ai_audit_runs SET agent_run_id=?1,updated_at=datetime('now') WHERE id=?2",
    )
    .bind(agent_id)
    .bind(audit_id)
    .execute(&mut *connection)
    .await
    .map_err(db_error("Could not link audit run"))?;
    sqlx::query("UPDATE workflow_step_executions SET agent_run_id=?1 WHERE id=?2")
        .bind(agent_id)
        .bind(execution_id)
        .execute(&mut *connection)
        .await
        .map_err(db_error("Could not link audit execution"))?;
    sqlx::query("INSERT INTO agent_run_events (agent_run_id,event_type,summary) VALUES (?1,'run_created','Agent run created for planner draft audit.')").bind(agent_id).execute(&mut *connection).await.map_err(db_error("Could not record auditor creation"))?;
    sqlx::query("INSERT INTO workflow_artifacts (workflow_run_id,workflow_step_id,artifact_type,artifact_id,summary,updated_at) VALUES (?1,?2,'agent_run',?3,?4,datetime('now'))")
        .bind(workflow_run_id).bind(step_id).bind(agent_id).bind(format!("Auditor run for draft variant #{variant_id} revision {revision}"))
        .execute(&mut *connection).await.map_err(db_error("Could not attach auditor artifact"))?;
    sqlx::query("UPDATE workflow_steps SET status='running',error_message='',completed_at=NULL,started_at=COALESCE(started_at,datetime('now')),updated_at=datetime('now') WHERE id=?1").bind(step_id).execute(&mut *connection).await.map_err(db_error("Could not project audit step"))?;
    sqlx::query("UPDATE workflow_runs SET status='running',current_step_key='audit',completed_at=NULL,updated_at=datetime('now') WHERE id=?1 AND status<>'cancelled'").bind(workflow_run_id).execute(&mut *connection).await.map_err(db_error("Could not project audit run"))?;
    workflow_event(
        connection,
        workflow_run_id,
        step_id,
        if step_status == "pending" {
            "step_started"
        } else {
            "step_resumed"
        },
        "Draft AI audit started",
    )
    .await?;
    Ok(PlannerDraftAuditClaimPayload {
        execution_id,
        audit_run_id: audit_id,
        agent_run_id: agent_id,
        workflow_run_id,
        workflow_step_id: step_id,
        draft_id,
        draft_variant_id: variant_id,
        content_revision: revision,
    })
}

pub(crate) async fn claim_with_pool(
    pool: &SqlitePool,
    input: ClaimPlannerDraftAuditInput,
) -> Result<PlannerDraftAuditClaimPayload, String> {
    let mut connection = begin_immediate(pool, "planner draft audit claim").await?;
    let result = claim_on_connection(&mut connection, &input).await;
    finish(&mut connection, result, "planner draft audit claim").await
}

async fn load_link(
    connection: &mut SqliteConnection,
    agent_run_id: i64,
) -> Result<AuditLink, String> {
    let row = sqlx::query("SELECT ar.id agent_run_id,dar.id audit_run_id,wse.id execution_id,ar.workflow_run_id,ar.workflow_step_id,dar.draft_variant_id,dar.content_revision FROM agent_runs ar INNER JOIN draft_ai_audit_runs dar ON dar.agent_run_id=ar.id INNER JOIN workflow_step_executions wse ON wse.id=dar.workflow_step_execution_id AND wse.agent_run_id=ar.id AND wse.workflow_step_id=ar.workflow_step_id INNER JOIN workflow_steps ws ON ws.id=ar.workflow_step_id AND ws.step_key='audit' WHERE ar.id=?1 AND ar.agent_role='auditor' LIMIT 1")
        .bind(agent_run_id).fetch_optional(&mut *connection).await.map_err(db_error("Could not load planner audit links"))?.ok_or_else(|| "Planner draft auditor run was not found".to_string())?;
    Ok(AuditLink {
        agent_run_id,
        audit_run_id: row.try_get("audit_run_id").unwrap_or_default(),
        execution_id: row.try_get("execution_id").unwrap_or_default(),
        workflow_run_id: row
            .try_get::<Option<i64>, _>("workflow_run_id")
            .unwrap_or(None)
            .unwrap_or_default(),
        workflow_step_id: row
            .try_get::<Option<i64>, _>("workflow_step_id")
            .unwrap_or(None)
            .unwrap_or_default(),
        draft_variant_id: row.try_get("draft_variant_id").unwrap_or_default(),
        content_revision: row.try_get("content_revision").unwrap_or_default(),
    })
}

async fn complete_on_connection(
    connection: &mut SqliteConnection,
    input: CompletePlannerDraftAuditInput,
    inject_fault: bool,
) -> Result<CompletePlannerDraftAuditPayload, String> {
    validate_findings(&input.findings)?;
    let summary = bounded(&input.summary, 1000, "Audit summary")?;
    let link = load_link(connection, input.agent_run_id).await?;
    let current: i64 =
        sqlx::query_scalar("SELECT content_revision FROM draft_variants WHERE id=?1")
            .bind(link.draft_variant_id)
            .fetch_optional(&mut *connection)
            .await
            .map_err(db_error("Could not validate audited revision"))?
            .ok_or_else(|| "Draft variant was not found".to_string())?;
    if current != link.content_revision {
        return Err("Draft content changed before the planner audit completed".to_string());
    }
    let active: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM draft_ai_audit_runs dar INNER JOIN agent_runs ar ON ar.id=dar.agent_run_id INNER JOIN workflow_step_executions wse ON wse.agent_run_id=ar.id WHERE dar.id=?1 AND dar.status='running' AND ar.status='completed' AND wse.status='running'")
        .bind(link.audit_run_id).fetch_one(&mut *connection).await.map_err(db_error("Could not validate active planner audit"))?;
    if active != 1 {
        return Err("Planner draft audit is no longer active".to_string());
    }
    for finding in &input.findings {
        sqlx::query("INSERT INTO draft_ai_audit_findings (audit_run_id,rule_key,severity,message) VALUES (?1,?2,?3,?4)").bind(link.audit_run_id).bind(&finding.rule_key).bind(&finding.severity).bind(bounded(&finding.message,500,"Audit finding message")?).execute(&mut *connection).await.map_err(db_error("Could not persist planner audit finding"))?;
    }
    if inject_fault {
        return Err("Injected planner draft audit settlement fault".to_string());
    }
    let audit_update = sqlx::query("UPDATE draft_ai_audit_runs SET status='completed',summary=?1,error_message='',completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?2 AND status='running'").bind(&summary).bind(link.audit_run_id).execute(&mut *connection).await.map_err(db_error("Could not complete audit run"))?;
    let agent_update = sqlx::query("UPDATE agent_runs SET output_summary=?1,error_message='',completed_at=COALESCE(completed_at,datetime('now')),updated_at=datetime('now') WHERE id=?2 AND status='completed'").bind(&summary).bind(link.agent_run_id).execute(&mut *connection).await.map_err(db_error("Could not complete auditor run"))?;
    let execution_update = sqlx::query("UPDATE workflow_step_executions SET status='completed',error_summary='',completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?1 AND status='running'").bind(link.execution_id).execute(&mut *connection).await.map_err(db_error("Could not complete audit execution"))?;
    if audit_update.rows_affected() != 1
        || agent_update.rows_affected() != 1
        || execution_update.rows_affected() != 1
    {
        return Err("Planner draft audit projections are no longer active".to_string());
    }
    let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM draft_variants dv INNER JOIN drafts d ON d.id=dv.draft_id INNER JOIN workflow_artifacts wa ON wa.artifact_type='draft' AND wa.artifact_id=d.id AND wa.workflow_run_id=?1 WHERE NOT EXISTS (SELECT 1 FROM draft_ai_audit_runs dar WHERE dar.draft_variant_id=dv.id AND dar.content_revision=dv.content_revision AND dar.status='completed')")
        .bind(link.workflow_run_id).fetch_one(&mut *connection).await.map_err(db_error("Could not count remaining draft audits"))?;
    if remaining == 0 {
        let audit_step_update = sqlx::query("UPDATE workflow_steps SET status='completed',output_summary=?1,error_message='',completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?2 AND status='running'").bind("All current draft revisions passed through AI audit.").bind(link.workflow_step_id).execute(&mut *connection).await.map_err(db_error("Could not complete audit step"))?;
        if audit_step_update.rows_affected() != 1 {
            return Err("Planner draft audit step is no longer active".to_string());
        }
        let approve_id: i64 = sqlx::query_scalar(
            "SELECT id FROM workflow_steps WHERE workflow_run_id=?1 AND step_key='approve'",
        )
        .bind(link.workflow_run_id)
        .fetch_one(&mut *connection)
        .await
        .map_err(db_error("Could not load approval step"))?;
        let approve_update = sqlx::query("UPDATE workflow_steps SET status='waiting_approval',started_at=COALESCE(started_at,datetime('now')),completed_at=NULL,error_message='',updated_at=datetime('now') WHERE id=?1 AND status IN ('pending','blocked','failed')").bind(approve_id).execute(&mut *connection).await.map_err(db_error("Could not advance approval step"))?;
        let workflow_update = sqlx::query("UPDATE workflow_runs SET status='waiting_approval',current_step_key='approve',updated_at=datetime('now') WHERE id=?1 AND current_step_key='audit' AND status='running'").bind(link.workflow_run_id).execute(&mut *connection).await.map_err(db_error("Could not advance workflow to approval"))?;
        if approve_update.rows_affected() != 1 || workflow_update.rows_affected() != 1 {
            return Err("Planner workflow could not advance to approval".to_string());
        }
        workflow_event(
            connection,
            link.workflow_run_id,
            link.workflow_step_id,
            "step_completed",
            "Draft AI audits completed",
        )
        .await?;
        workflow_event(
            connection,
            link.workflow_run_id,
            approve_id,
            "step_waiting_approval",
            "Drafts are waiting for approval",
        )
        .await?;
    } else {
        let step_update = sqlx::query("UPDATE workflow_steps SET status='pending',output_summary=?1,error_message='',completed_at=NULL,updated_at=datetime('now') WHERE id=?2 AND status='running'").bind(format!("{remaining} current draft revision(s) remain to audit.")).bind(link.workflow_step_id).execute(&mut *connection).await.map_err(db_error("Could not release audit step for next variant"))?;
        if step_update.rows_affected() != 1 {
            return Err("Planner draft audit step is no longer active".to_string());
        }
    }
    Ok(CompletePlannerDraftAuditPayload {
        terminal: remaining == 0,
    })
}

pub(crate) async fn complete_with_pool_and_fault(
    pool: &SqlitePool,
    input: CompletePlannerDraftAuditInput,
    inject_fault: bool,
) -> Result<CompletePlannerDraftAuditPayload, String> {
    let mut connection = begin_immediate(pool, "planner draft audit completion").await?;
    let result = complete_on_connection(&mut connection, input, inject_fault).await;
    finish(&mut connection, result, "planner draft audit completion").await
}

async fn fail_on_connection(
    connection: &mut SqliteConnection,
    agent_run_id: i64,
    reason: &str,
) -> Result<(), String> {
    let reason = bounded(reason, 1000, "Audit failure summary")?;
    let link = load_link(connection, agent_run_id).await?;
    let updated = sqlx::query("UPDATE draft_ai_audit_runs SET status='failed',error_message=?1,completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?2 AND status IN ('pending','running')").bind(&reason).bind(link.audit_run_id).execute(&mut *connection).await.map_err(db_error("Could not fail audit run"))?;
    if updated.rows_affected() != 1 {
        return Err("Planner draft audit is no longer active".to_string());
    }
    let agent_update = sqlx::query("UPDATE agent_runs SET status='failed',error_message=?1,completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?2 AND status IN ('queued','running','waiting_approval','completed','failed','cancelled')").bind(&reason).bind(agent_run_id).execute(&mut *connection).await.map_err(db_error("Could not fail auditor run"))?;
    let execution_update = sqlx::query("UPDATE workflow_step_executions SET status='failed',error_summary=?1,completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?2 AND status IN ('claimed','running','waiting_approval')").bind(&reason).bind(link.execution_id).execute(&mut *connection).await.map_err(db_error("Could not fail audit execution"))?;
    if agent_update.rows_affected() != 1 || execution_update.rows_affected() != 1 {
        return Err("Planner draft audit projections are no longer active".to_string());
    }
    sqlx::query("UPDATE workflow_steps SET status='failed',error_message=?1,completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?2").bind(&reason).bind(link.workflow_step_id).execute(&mut *connection).await.map_err(db_error("Could not fail audit step"))?;
    sqlx::query("UPDATE workflow_runs SET status='failed',current_step_key='audit',completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?1 AND status<>'cancelled'").bind(link.workflow_run_id).execute(&mut *connection).await.map_err(db_error("Could not fail audit workflow"))?;
    sqlx::query("DELETE FROM agent_run_approval_checkpoints WHERE agent_run_id=?1")
        .bind(agent_run_id)
        .execute(&mut *connection)
        .await
        .map_err(db_error("Could not clear auditor checkpoints"))?;
    sqlx::query("INSERT INTO agent_run_events (agent_run_id,event_type,summary) VALUES (?1,'run_failed',?2)").bind(agent_run_id).bind(&reason).execute(&mut *connection).await.map_err(db_error("Could not record auditor failure"))?;
    workflow_event(
        connection,
        link.workflow_run_id,
        link.workflow_step_id,
        "step_failed",
        &reason,
    )
    .await?;
    Ok(())
}

pub(crate) async fn fail_with_pool(
    pool: &SqlitePool,
    input: FailPlannerDraftAuditInput,
) -> Result<(), String> {
    let mut connection = begin_immediate(pool, "planner draft audit failure").await?;
    let result =
        fail_on_connection(&mut connection, input.agent_run_id, &input.error_summary).await;
    finish(&mut connection, result, "planner draft audit failure").await
}

pub(crate) async fn reconcile_with_pool(
    pool: &SqlitePool,
    input: ReconcileStalePlannerDraftAuditsInput,
) -> Result<ReconcileStalePlannerDraftAuditsPayload, String> {
    if !(1..=100).contains(&input.limit) {
        return Err("Reconcile limit is invalid".to_string());
    }
    let mut connection = begin_immediate(pool, "stale planner draft audit reconciliation").await?;
    let result = async {
        let links: Vec<(i64, i64, i64, i64)> = sqlx::query_as(
            "SELECT dar.id, ar.id, wse.id, ar.workflow_run_id
             FROM agent_runs ar
             INNER JOIN draft_ai_audit_runs dar ON dar.agent_run_id = ar.id
             INNER JOIN workflow_step_executions wse
               ON wse.id = dar.workflow_step_execution_id
              AND wse.agent_run_id = ar.id
             WHERE ar.agent_role = 'auditor'
               AND ar.workflow_run_id IS NOT NULL
               AND ar.status IN ('queued', 'running', 'waiting_approval', 'completed')
               AND dar.status IN ('pending', 'running')
               AND wse.status IN ('claimed', 'running', 'waiting_approval')
               AND datetime(MAX(ar.updated_at, dar.updated_at, wse.updated_at))
                   <= datetime('now', ?1)
             ORDER BY datetime(MAX(ar.updated_at, dar.updated_at, wse.updated_at)), dar.id
             LIMIT ?2",
        )
        .bind(format!("-{STALE_MINUTES} minutes"))
        .bind(input.limit)
        .fetch_all(&mut *connection)
        .await
        .map_err(db_error("Could not load stale planner draft audits"))?;

        for (_, agent_run_id, _, _) in &links {
            fail_on_connection(
                &mut connection,
                *agent_run_id,
                "Planner draft audit exceeded the 15-minute settlement window.",
            )
            .await?;
        }

        Ok(ReconcileStalePlannerDraftAuditsPayload {
            failed_audit_run_ids: links.iter().map(|link| link.0).collect(),
            failed_agent_run_ids: links.iter().map(|link| link.1).collect(),
            failed_execution_ids: links.iter().map(|link| link.2).collect(),
            failed_workflow_run_ids: links.iter().map(|link| link.3).collect(),
        })
    }
    .await;
    finish(
        &mut connection,
        result,
        "stale planner draft audit reconciliation",
    )
    .await
}

#[tauri::command]
pub async fn linkgo_planner_draft_audit_claim(
    pool: State<'_, SqlitePool>,
    input: ClaimPlannerDraftAuditInput,
) -> Result<PlannerDraftAuditClaimPayload, String> {
    claim_with_pool(pool.inner(), input).await
}
#[tauri::command]
pub async fn linkgo_planner_draft_audit_complete(
    pool: State<'_, SqlitePool>,
    input: CompletePlannerDraftAuditInput,
) -> Result<CompletePlannerDraftAuditPayload, String> {
    complete_with_pool_and_fault(pool.inner(), input, false).await
}
#[tauri::command]
pub async fn linkgo_planner_draft_audit_fail(
    pool: State<'_, SqlitePool>,
    input: FailPlannerDraftAuditInput,
) -> Result<(), String> {
    fail_with_pool(pool.inner(), input).await
}
#[tauri::command]
pub async fn linkgo_planner_draft_audit_reconcile_stale(
    pool: State<'_, SqlitePool>,
    input: ReconcileStalePlannerDraftAuditsInput,
) -> Result<ReconcileStalePlannerDraftAuditsPayload, String> {
    reconcile_with_pool(pool.inner(), input).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{autopilot_planner, migrations};
    use sqlx::{sqlite::SqliteConnectOptions, sqlite::SqlitePoolOptions, Executor};
    use std::str::FromStr;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::Duration;
    use tauri_plugin_sql::MigrationKind;

    static DATABASE_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    async fn fixture() -> (SqlitePool, i64) {
        let sequence = DATABASE_SEQUENCE.fetch_add(1, Ordering::SeqCst);
        let url = format!("sqlite:file:planner-draft-audits-{sequence}?mode=memory&cache=shared");
        let options = SqliteConnectOptions::from_str(&url)
            .unwrap()
            .foreign_keys(true)
            .busy_timeout(Duration::from_secs(5));
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_lazy_with(options);
        pool.execute("PRAGMA legacy_alter_table = ON")
            .await
            .unwrap();
        for migration in migrations::get_migrations()
            .into_iter()
            .filter(|m| matches!(m.kind, MigrationKind::Up) && m.version != 21)
        {
            pool.execute(migration.sql)
                .await
                .unwrap_or_else(|error| panic!("{} migration failed: {error}", migration.version));
        }
        pool.execute("PRAGMA legacy_alter_table = OFF")
            .await
            .unwrap();
        pool.execute("CREATE TABLE agent_run_approval_checkpoints (agent_run_id INTEGER PRIMARY KEY, FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE CASCADE)")
            .await
            .unwrap();
        pool.execute("INSERT INTO campaigns (id,name,status,auto_pilot) VALUES (1,'Audit','active',1);
            INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES (100,'https://example.com/a','https://example.com/a','Source','hash');
            INSERT INTO candidate_posts (id,campaign_id,target_post_id,relevance_score) VALUES (10,1,100,90);
            INSERT INTO source_import_batches (id,campaign_id,source_type,status,total_count,accepted_count,duplicate_count,rejected_count,error_message) VALUES (20,1,'local_json','completed',1,1,0,0,'');
            INSERT INTO source_import_items (source_import_batch_id,row_number,status,input_json,candidate_post_id,reason,policy_rule_key) VALUES (20,1,'accepted','{}',10,'Accepted','');").await.unwrap();
        autopilot_planner::run_tick_with_pool(&pool, "audit-test")
            .await
            .unwrap();
        let run_id: i64 =
            sqlx::query_scalar("SELECT workflow_run_id FROM autopilot_plans WHERE campaign_id=1")
                .fetch_one(&pool)
                .await
                .unwrap();
        let draft_step: i64 = sqlx::query_scalar(
            "SELECT id FROM workflow_steps WHERE workflow_run_id=?1 AND step_key='draft'",
        )
        .bind(run_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        pool.execute("INSERT INTO drafts (id,campaign_id,candidate_post_id,angle,notes,status) VALUES (30,1,10,'','','drafting');
            INSERT INTO draft_variants (id,draft_id,variant_number,hook,body,cta,hashtags,content_revision) VALUES
              (31,30,1,'Hook one','Body one','CTA one','#one',1),(32,30,2,'Hook two','Body two','CTA two','#two',2);").await.unwrap();
        sqlx::query("INSERT INTO draft_generation_requests (id,campaign_id,candidate_post_id,provider_key,model_name,variant_count,status,created_draft_id,workflow_run_id,workflow_step_id) VALUES (40,1,10,'openai','',3,'saved',30,?1,?2)")
            .bind(run_id).bind(draft_step).execute(&pool).await.unwrap();
        let audit_step: i64 = sqlx::query_scalar(
            "SELECT id FROM workflow_steps WHERE workflow_run_id=?1 AND step_key='audit'",
        )
        .bind(run_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO workflow_artifacts (workflow_run_id,workflow_step_id,artifact_type,artifact_id,summary) VALUES (?1,?2,'draft',30,'Saved planner draft')").bind(run_id).bind(draft_step).execute(&pool).await.unwrap();
        sqlx::query(
            "UPDATE workflow_runs SET status='running',current_step_key='audit' WHERE id=?1",
        )
        .bind(run_id)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("UPDATE workflow_steps SET status=CASE WHEN id=?2 THEN 'pending' WHEN step_key IN ('research','score','draft') THEN 'completed' ELSE status END WHERE workflow_run_id=?1").bind(run_id).bind(audit_step).execute(&pool).await.unwrap();
        (pool, run_id)
    }

    async fn claim_input(pool: &SqlitePool, run_id: i64) -> ClaimPlannerDraftAuditInput {
        let workflow_step_id: i64 = sqlx::query_scalar(
            "SELECT id FROM workflow_steps WHERE workflow_run_id=?1 AND step_key='audit'",
        )
        .bind(run_id)
        .fetch_one(pool)
        .await
        .unwrap();
        ClaimPlannerDraftAuditInput {
            workflow_run_id: run_id,
            workflow_step_id,
            campaign_id: 1,
            draft_id: 30,
            draft_generation_request_id: 40,
            provider_key: "openai".to_string(),
            model_name: "gpt-4.1-mini".to_string(),
        }
    }

    fn findings() -> Vec<PlannerDraftAuditFindingInput> {
        REQUIRED_RULES
            .iter()
            .map(|rule| PlannerDraftAuditFindingInput {
                rule_key: (*rule).to_string(),
                severity: "pass".to_string(),
                message: format!("{rule} passed"),
            })
            .collect()
    }

    #[test]
    fn claim_is_serial_and_resolves_saved_provenance() {
        tauri::async_runtime::block_on(async {
            let (pool, run_id) = fixture().await;
            let mut substituted = claim_input(&pool, run_id).await;
            substituted.model_name = "caller-model".to_string();
            assert!(claim_with_pool(&pool, substituted)
                .await
                .unwrap_err()
                .contains("does not match saved provenance"));
            let first = claim_with_pool(&pool, claim_input(&pool, run_id).await)
                .await
                .unwrap();
            assert_eq!(first.draft_variant_id, 31);
            let provider: (String, String, String, String) = sqlx::query_as(
                "SELECT provider_key,model_name,status,agent_role FROM agent_runs WHERE id=?1",
            )
            .bind(first.agent_run_id)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(
                provider,
                (
                    "openai".into(),
                    "gpt-4.1-mini".into(),
                    "queued".into(),
                    "auditor".into()
                )
            );
            assert!(claim_with_pool(&pool, claim_input(&pool, run_id).await)
                .await
                .unwrap_err()
                .contains("already active"));
            fail_with_pool(
                &pool,
                FailPlannerDraftAuditInput {
                    agent_run_id: first.agent_run_id,
                    error_summary: "retry".into(),
                },
            )
            .await
            .unwrap();
            let retry = claim_with_pool(&pool, claim_input(&pool, run_id).await)
                .await
                .unwrap();
            assert_eq!(retry.draft_variant_id, 31);
            let attempts: Vec<i64> = sqlx::query_scalar(
                "SELECT attempt_count FROM workflow_step_executions ORDER BY id",
            )
            .fetch_all(&pool)
            .await
            .unwrap();
            assert_eq!(attempts, vec![1, 2]);
        });
    }

    #[test]
    fn completion_advances_only_after_every_current_revision() {
        tauri::async_runtime::block_on(async {
            let (pool, run_id) = fixture().await;
            let one = claim_with_pool(&pool, claim_input(&pool, run_id).await)
                .await
                .unwrap();
            sqlx::query("UPDATE agent_runs SET status='completed' WHERE id=?1")
                .bind(one.agent_run_id)
                .execute(&pool)
                .await
                .unwrap();
            complete_with_pool_and_fault(
                &pool,
                CompletePlannerDraftAuditInput {
                    agent_run_id: one.agent_run_id,
                    summary: "First complete".into(),
                    findings: findings(),
                },
                false,
            )
            .await
            .unwrap();
            let current: String =
                sqlx::query_scalar("SELECT current_step_key FROM workflow_runs WHERE id=?1")
                    .bind(run_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(current, "audit");
            let two = claim_with_pool(&pool, claim_input(&pool, run_id).await)
                .await
                .unwrap();
            assert_eq!(two.draft_variant_id, 32);
            sqlx::query("UPDATE agent_runs SET status='completed' WHERE id=?1")
                .bind(two.agent_run_id)
                .execute(&pool)
                .await
                .unwrap();
            complete_with_pool_and_fault(
                &pool,
                CompletePlannerDraftAuditInput {
                    agent_run_id: two.agent_run_id,
                    summary: "All complete".into(),
                    findings: findings(),
                },
                false,
            )
            .await
            .unwrap();
            let states:(String,String,String)=sqlx::query_as("SELECT wr.current_step_key,ws.status,ar.status FROM workflow_runs wr JOIN workflow_steps ws ON ws.workflow_run_id=wr.id AND ws.step_key='approve' JOIN agent_runs ar ON ar.id=?2 WHERE wr.id=?1").bind(run_id).bind(two.agent_run_id).fetch_one(&pool).await.unwrap();
            assert_eq!(
                states,
                (
                    "approve".into(),
                    "waiting_approval".into(),
                    "completed".into()
                )
            );
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM draft_ai_audit_findings")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(count, 12);
        });
    }

    #[test]
    fn injectable_settlement_fault_rolls_back_findings_and_all_projections() {
        tauri::async_runtime::block_on(async {
            let (pool, run_id) = fixture().await;
            let claim = claim_with_pool(&pool, claim_input(&pool, run_id).await)
                .await
                .unwrap();
            sqlx::query("UPDATE agent_runs SET status='completed' WHERE id=?1")
                .bind(claim.agent_run_id)
                .execute(&pool)
                .await
                .unwrap();
            let error = complete_with_pool_and_fault(
                &pool,
                CompletePlannerDraftAuditInput {
                    agent_run_id: claim.agent_run_id,
                    summary: "Complete".into(),
                    findings: findings(),
                },
                true,
            )
            .await
            .unwrap_err();
            assert!(error.contains("Injected"));
            let state:(String,String,i64)=sqlx::query_as("SELECT ar.status,dar.status,(SELECT COUNT(*) FROM draft_ai_audit_findings) FROM agent_runs ar JOIN draft_ai_audit_runs dar ON dar.agent_run_id=ar.id WHERE ar.id=?1").bind(claim.agent_run_id).fetch_one(&pool).await.unwrap();
            assert_eq!(state, ("completed".into(), "running".into(), 0));
        });
    }

    #[test]
    fn explicit_failure_and_stale_reconcile_settle_every_linked_projection() {
        tauri::async_runtime::block_on(async {
            for agent_status in ["queued", "running", "waiting_approval", "completed"] {
                let (pool, run_id) = fixture().await;
                let claim = claim_with_pool(&pool, claim_input(&pool, run_id).await)
                    .await
                    .unwrap();
                let fresh =
                    reconcile_with_pool(&pool, ReconcileStalePlannerDraftAuditsInput { limit: 25 })
                        .await
                        .unwrap();
                assert!(fresh.failed_audit_run_ids.is_empty());

                sqlx::query(
                    "UPDATE agent_runs SET status=?1,updated_at=datetime('now','-16 minutes') WHERE id=?2",
                )
                .bind(agent_status)
                .bind(claim.agent_run_id)
                .execute(&pool)
                .await
                .unwrap();
                sqlx::query("UPDATE draft_ai_audit_runs SET updated_at=datetime('now','-16 minutes') WHERE agent_run_id=?1").bind(claim.agent_run_id).execute(&pool).await.unwrap();
                sqlx::query("UPDATE workflow_step_executions SET updated_at=datetime('now','-16 minutes') WHERE agent_run_id=?1").bind(claim.agent_run_id).execute(&pool).await.unwrap();

                let settled =
                    reconcile_with_pool(&pool, ReconcileStalePlannerDraftAuditsInput { limit: 25 })
                        .await
                        .unwrap();
                assert_eq!(settled.failed_audit_run_ids, vec![claim.audit_run_id]);
                assert_eq!(settled.failed_agent_run_ids, vec![claim.agent_run_id]);
                assert_eq!(settled.failed_execution_ids, vec![claim.execution_id]);
                assert_eq!(settled.failed_workflow_run_ids, vec![claim.workflow_run_id]);
                let repeated =
                    reconcile_with_pool(&pool, ReconcileStalePlannerDraftAuditsInput { limit: 25 })
                        .await
                        .unwrap();
                assert_eq!(
                    repeated,
                    ReconcileStalePlannerDraftAuditsPayload {
                        failed_audit_run_ids: vec![],
                        failed_agent_run_ids: vec![],
                        failed_execution_ids: vec![],
                        failed_workflow_run_ids: vec![],
                    }
                );
                let states:(String,String,String,String)=sqlx::query_as("SELECT ar.status,dar.status,wse.status,ws.status FROM agent_runs ar JOIN draft_ai_audit_runs dar ON dar.agent_run_id=ar.id JOIN workflow_step_executions wse ON wse.agent_run_id=ar.id JOIN workflow_steps ws ON ws.id=ar.workflow_step_id WHERE ar.id=?1").bind(claim.agent_run_id).fetch_one(&pool).await.unwrap();
                assert_eq!(
                    states,
                    (
                        "failed".into(),
                        "failed".into(),
                        "failed".into(),
                        "failed".into()
                    )
                );
            }
        });
    }
}
