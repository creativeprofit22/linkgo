use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{Row, SqliteConnection, SqlitePool};
use std::collections::HashSet;
use tauri::State;

const CATEGORIES: [&str; 5] = [
    "hook_strength",
    "authenticity",
    "linkedin_fit",
    "specificity",
    "narrative_structure",
];
const AUDIT_RULES: [&str; 6] = [
    "hook",
    "specificity",
    "generic_language",
    "authenticity",
    "clarity",
    "safety",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClaimInput {
    pub draft_variant_id: i64,
    pub provider_key: String,
    pub model_name: String,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunInput {
    pub quality_run_id: i64,
    pub draft_variant_id: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FailInput {
    pub quality_run_id: i64,
    pub draft_variant_id: i64,
    pub error_message: String,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReconcileInput {
    #[serde(default = "default_limit")]
    pub limit: i64,
}
fn default_limit() -> i64 {
    25
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CategoryScore {
    pub category_key: String,
    pub score: i64,
    pub feedback: String,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Rewrite {
    pub hook: String,
    pub body: String,
    pub cta: String,
    pub hashtags: String,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApplyScoreInput {
    pub quality_run_id: i64,
    pub draft_variant_id: i64,
    pub attempt_id: i64,
    pub content_revision: i64,
    pub agent_run_id: i64,
    pub category_scores: Vec<CategoryScore>,
    pub rewrite: Option<Rewrite>,
    pub summary: String,
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClaimPayload {
    pub quality_run_id: i64,
    pub attempt_id: i64,
    pub agent_run_id: i64,
    pub campaign_id: i64,
    pub draft_variant_id: i64,
    pub content_revision: i64,
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SettlementPayload {
    pub status: String,
    pub overall_score: i64,
    pub content_revision: i64,
    pub ai_audit_run_id: Option<i64>,
    pub agent_run_id: Option<i64>,
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReconcilePayload {
    pub reconciled_run_ids: Vec<i64>,
}

fn db_error(label: &'static str) -> impl FnOnce(sqlx::Error) -> String {
    move |error| format!("{label}: {error}")
}
fn bounded(value: &str, maximum: usize, label: &str, allow_empty: bool) -> Result<(), String> {
    let count = value.chars().count();
    if count > maximum || (!allow_empty && value.trim().is_empty()) {
        return Err(format!("{label} is invalid"));
    }
    Ok(())
}
fn validate_scores(scores: &[CategoryScore]) -> Result<i64, String> {
    if scores.len() != 5 {
        return Err("Exactly five quality category scores are required".into());
    }
    let mut keys = HashSet::new();
    let mut total = 0;
    for score in scores {
        if !CATEGORIES.contains(&score.category_key.as_str()) || !keys.insert(&score.category_key) {
            return Err("Exactly one score for every quality category is required".into());
        }
        if !(0..=100).contains(&score.score) {
            return Err("Quality scores must be integers from 0 to 100".into());
        }
        bounded(&score.feedback, 1000, "Quality feedback", false)?;
        total += score.score;
    }
    Ok((total + 2) / 5)
}
async fn begin(pool: &SqlitePool) -> Result<sqlx::pool::PoolConnection<sqlx::Sqlite>, String> {
    let mut connection = pool
        .acquire()
        .await
        .map_err(db_error("Could not open quality transaction"))?;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *connection)
        .await
        .map_err(db_error("Could not start quality transaction"))?;
    Ok(connection)
}
async fn finish<T>(
    connection: &mut SqliteConnection,
    result: Result<T, String>,
) -> Result<T, String> {
    match result {
        Ok(value) => {
            sqlx::query("COMMIT")
                .execute(&mut *connection)
                .await
                .map_err(db_error("Could not commit quality transaction"))?;
            Ok(value)
        }
        Err(error) => {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            Err(error)
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn create_quality_agent(
    connection: &mut SqliteConnection,
    campaign_id: i64,
    provider: &str,
    model: &str,
    run_id: i64,
    attempt_id: i64,
    variant_id: i64,
    revision: i64,
    hook: &str,
    body: &str,
    cta: &str,
    hashtags: &str,
    rewrite_allowed: bool,
) -> Result<i64, String> {
    let context = json!({"qualityRequest":{"campaignId":campaign_id,"draftVariantId":variant_id,"qualityRunId":run_id,"attemptId":attempt_id,"contentRevision":revision,"hook":hook,"body":body,"cta":cta,"hashtags":hashtags,"threshold":70,"rewriteAllowed":rewrite_allowed,"priorCategoryFeedback":[]}}).to_string();
    let id = sqlx::query("INSERT INTO agent_runs (campaign_id,agent_role,provider_key,model_name,playbook_key,status,input_summary,input_context_json,updated_at) VALUES (?1,'auditor',?2,?3,'linkedin_humanizer','queued',?4,?5,datetime('now'))")
        .bind(campaign_id).bind(provider).bind(model).bind(format!("Score draft variant #{variant_id} revision {revision} against the attended quality threshold. Use only supplied evidence; never invent first-person facts.")).bind(context)
        .execute(&mut *connection).await.map_err(db_error("Could not create quality auditor run"))?.last_insert_rowid();
    sqlx::query("INSERT INTO agent_run_events (agent_run_id,event_type,summary) VALUES (?1,'run_created','Agent run created for attended draft quality scoring.')").bind(id).execute(&mut *connection).await.map_err(db_error("Could not record quality agent evidence"))?;
    Ok(id)
}

async fn claim_on_connection(
    connection: &mut SqliteConnection,
    input: &ClaimInput,
) -> Result<ClaimPayload, String> {
    bounded(&input.model_name, 120, "Model name", true)?;
    let row = sqlx::query("SELECT dv.content_revision,dv.hook,dv.body,dv.cta,dv.hashtags,d.campaign_id FROM draft_variants dv JOIN drafts d ON d.id=dv.draft_id WHERE dv.id=?1")
        .bind(input.draft_variant_id).fetch_optional(&mut *connection).await.map_err(db_error("Could not load draft quality scope"))?.ok_or_else(|| "Draft variant was not found".to_string())?;
    let revision: i64 = row.try_get("content_revision").unwrap_or_default();
    let ready: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM draft_ai_audit_runs dar WHERE dar.draft_variant_id=?1 AND dar.content_revision=?2 AND dar.status='completed' AND (SELECT COUNT(*) FROM draft_ai_audit_findings f WHERE f.audit_run_id=dar.id AND f.rule_key IN ('hook','specificity','generic_language','authenticity','clarity','safety'))=6 AND NOT EXISTS (SELECT 1 FROM draft_ai_audit_findings f WHERE f.audit_run_id=dar.id AND f.severity='block')")
        .bind(input.draft_variant_id).bind(revision).fetch_one(&mut *connection).await.map_err(db_error("Could not validate quality audit prerequisite"))?;
    if ready == 0 {
        return Err("Current revision requires a completed canonical non-blocking AI audit".into());
    }
    let campaign_id: i64 = row.try_get("campaign_id").unwrap_or_default();
    let run_id = sqlx::query("INSERT INTO draft_quality_runs (draft_variant_id,starting_content_revision,current_content_revision,provider_key,model_name,status,started_at,updated_at) VALUES (?1,?2,?2,?3,?4,'running',datetime('now'),datetime('now'))")
        .bind(input.draft_variant_id).bind(revision).bind(&input.provider_key).bind(input.model_name.trim()).execute(&mut *connection).await.map_err(db_error("Could not claim draft quality run"))?.last_insert_rowid();
    let hook: String = row.try_get("hook").unwrap_or_default();
    let body: String = row.try_get("body").unwrap_or_default();
    let cta: String = row.try_get("cta").unwrap_or_default();
    let hashtags: String = row.try_get("hashtags").unwrap_or_default();
    let attempt_id = sqlx::query("INSERT INTO draft_quality_attempts (run_id,attempt_number,content_revision,input_hook,input_body,input_cta,input_hashtags) VALUES (?1,1,?2,?3,?4,?5,?6)")
        .bind(run_id).bind(revision).bind(&hook).bind(&body).bind(&cta).bind(&hashtags).execute(&mut *connection).await.map_err(db_error("Could not create quality attempt"))?.last_insert_rowid();
    let agent_id = create_quality_agent(
        connection,
        campaign_id,
        &input.provider_key,
        input.model_name.trim(),
        run_id,
        attempt_id,
        input.draft_variant_id,
        revision,
        &hook,
        &body,
        &cta,
        &hashtags,
        true,
    )
    .await?;
    sqlx::query("UPDATE draft_quality_attempts SET agent_run_id=?1 WHERE id=?2")
        .bind(agent_id)
        .bind(attempt_id)
        .execute(&mut *connection)
        .await
        .map_err(db_error("Could not link quality attempt"))?;
    sqlx::query("UPDATE draft_quality_runs SET active_agent_run_id=?1 WHERE id=?2")
        .bind(agent_id)
        .bind(run_id)
        .execute(&mut *connection)
        .await
        .map_err(db_error("Could not link quality run"))?;
    Ok(ClaimPayload {
        quality_run_id: run_id,
        attempt_id,
        agent_run_id: agent_id,
        campaign_id,
        draft_variant_id: input.draft_variant_id,
        content_revision: revision,
    })
}

pub(crate) async fn claim_with_pool(
    pool: &SqlitePool,
    input: ClaimInput,
) -> Result<ClaimPayload, String> {
    let mut c = begin(pool).await?;
    let r = claim_on_connection(&mut c, &input).await;
    finish(&mut c, r).await
}

async fn apply_on_connection(
    connection: &mut SqliteConnection,
    input: &ApplyScoreInput,
) -> Result<SettlementPayload, String> {
    let overall = validate_scores(&input.category_scores)?;
    let row = sqlx::query("SELECT qr.status,qr.current_content_revision,qr.applied_rewrite_count,qr.maximum_rewrite_count,qr.provider_key,qr.model_name,qa.status attempt_status,dv.content_revision FROM draft_quality_runs qr JOIN draft_quality_attempts qa ON qa.run_id=qr.id JOIN draft_variants dv ON dv.id=qr.draft_variant_id WHERE qr.id=?1 AND qr.draft_variant_id=?2 AND qa.id=?3 AND qa.agent_run_id=?4")
        .bind(input.quality_run_id).bind(input.draft_variant_id).bind(input.attempt_id).bind(input.agent_run_id).fetch_optional(&mut *connection).await.map_err(db_error("Could not validate quality settlement"))?.ok_or_else(|| "Quality settlement identity is stale or invalid".to_string())?;
    let current: i64 = row.try_get("current_content_revision").unwrap_or_default();
    let variant_revision: i64 = row.try_get("content_revision").unwrap_or_default();
    if row.try_get::<String, _>("status").unwrap_or_default() != "running"
        || row
            .try_get::<String, _>("attempt_status")
            .unwrap_or_default()
            != "scoring"
        || input.content_revision != current
        || variant_revision != current
    {
        return Err("Draft quality settlement is stale".into());
    }
    for score in &input.category_scores {
        sqlx::query("INSERT INTO draft_quality_category_scores (attempt_id,category_key,score,feedback) VALUES (?1,?2,?3,?4)").bind(input.attempt_id).bind(&score.category_key).bind(score.score).bind(score.feedback.trim()).execute(&mut *connection).await.map_err(db_error("Could not persist quality score"))?;
    }
    if overall >= 70 {
        if input.rewrite.is_some() {
            return Err("Passing quality output must not include a rewrite".into());
        }
        sqlx::query("UPDATE draft_quality_attempts SET overall_score=?1,status='passed',completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?2").bind(overall).bind(input.attempt_id).execute(&mut *connection).await.map_err(db_error("Could not pass quality attempt"))?;
        sqlx::query("UPDATE draft_quality_runs SET status='passed',final_score=?1,summary=?2,active_agent_run_id=NULL,completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?3").bind(overall).bind(input.summary.trim()).bind(input.quality_run_id).execute(&mut *connection).await.map_err(db_error("Could not pass quality run"))?;
        sqlx::query("UPDATE agent_runs SET status='completed',completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?1").bind(input.agent_run_id).execute(&mut *connection).await.map_err(db_error("Could not complete quality agent"))?;
        return Ok(SettlementPayload {
            status: "passed".into(),
            overall_score: overall,
            content_revision: current,
            ai_audit_run_id: None,
            agent_run_id: None,
        });
    }
    let applied: i64 = row.try_get("applied_rewrite_count").unwrap_or_default();
    let maximum: i64 = row.try_get("maximum_rewrite_count").unwrap_or(2);
    if applied >= maximum || input.rewrite.is_none() {
        sqlx::query("UPDATE draft_quality_attempts SET overall_score=?1,status='scored',completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?2").bind(overall).bind(input.attempt_id).execute(&mut *connection).await.map_err(db_error("Could not settle exhausted attempt"))?;
        sqlx::query("UPDATE draft_quality_runs SET status='needs_revision',final_score=?1,summary=?2,active_agent_run_id=NULL,completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?3").bind(overall).bind(input.summary.trim()).bind(input.quality_run_id).execute(&mut *connection).await.map_err(db_error("Could not settle exhausted quality run"))?;
        return Ok(SettlementPayload {
            status: "needs_revision".into(),
            overall_score: overall,
            content_revision: current,
            ai_audit_run_id: None,
            agent_run_id: None,
        });
    }
    let rewrite = input.rewrite.as_ref().unwrap();
    bounded(&rewrite.hook, 500, "Rewrite hook", false)?;
    bounded(&rewrite.body, 3000, "Rewrite body", false)?;
    bounded(&rewrite.cta, 500, "Rewrite CTA", true)?;
    bounded(&rewrite.hashtags, 300, "Rewrite hashtags", true)?;
    sqlx::query("UPDATE draft_quality_attempts SET overall_score=?1,status='rewritten',rewritten_hook=?2,rewritten_body=?3,rewritten_cta=?4,rewritten_hashtags=?5,completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?6")
        .bind(overall).bind(&rewrite.hook).bind(&rewrite.body).bind(&rewrite.cta).bind(&rewrite.hashtags).bind(input.attempt_id).execute(&mut *connection).await.map_err(db_error("Could not snapshot quality rewrite"))?;
    sqlx::query("UPDATE draft_variants SET hook=?1,body=?2,cta=?3,hashtags=?4,updated_at=datetime('now') WHERE id=?5 AND content_revision=?6").bind(&rewrite.hook).bind(&rewrite.body).bind(&rewrite.cta).bind(&rewrite.hashtags).bind(input.draft_variant_id).bind(current).execute(&mut *connection).await.map_err(db_error("Could not apply quality rewrite"))?;
    let new_revision: i64 =
        sqlx::query_scalar("SELECT content_revision FROM draft_variants WHERE id=?1")
            .bind(input.draft_variant_id)
            .fetch_one(&mut *connection)
            .await
            .map_err(db_error("Could not read rewritten revision"))?;
    sqlx::query("DELETE FROM draft_audits WHERE draft_variant_id=?1")
        .bind(input.draft_variant_id)
        .execute(&mut *connection)
        .await
        .map_err(db_error("Could not regenerate deterministic audit"))?;
    sqlx::query("INSERT INTO draft_audits (draft_variant_id,rule_key,severity,message) VALUES (?1,'quality_rewrite','pass','Machine rewrite applied; deterministic checks regenerated.')").bind(input.draft_variant_id).execute(&mut *connection).await.map_err(db_error("Could not regenerate deterministic audit"))?;
    let provider: String = row.try_get("provider_key").unwrap_or_default();
    let model: String = row.try_get("model_name").unwrap_or_default();
    let audit_id=sqlx::query("INSERT INTO draft_ai_audit_runs (draft_variant_id,content_revision,provider_key,model_name,status,started_at,updated_at) VALUES (?1,?2,?3,?4,'running',datetime('now'),datetime('now'))").bind(input.draft_variant_id).bind(new_revision).bind(&provider).bind(&model).execute(&mut *connection).await.map_err(db_error("Could not reserve rewrite AI audit"))?.last_insert_rowid();
    let campaign_id:i64=sqlx::query_scalar("SELECT d.campaign_id FROM drafts d JOIN draft_variants dv ON dv.draft_id=d.id WHERE dv.id=?1").bind(input.draft_variant_id).fetch_one(&mut *connection).await.map_err(db_error("Could not load campaign"))?;
    let context=json!({"auditRequest":{"campaignId":campaign_id,"draftVariantId":input.draft_variant_id,"contentRevision":new_revision,"auditRunId":audit_id,"text":format!("{}\n\n{}\n\n{}\n\n{}",rewrite.hook,rewrite.body,rewrite.cta,rewrite.hashtags)}}).to_string();
    let audit_agent=sqlx::query("INSERT INTO agent_runs (campaign_id,agent_role,provider_key,model_name,playbook_key,status,input_summary,input_context_json,updated_at) VALUES (?1,'auditor',?2,?3,'linkedin_humanizer','queued',?4,?5,datetime('now'))").bind(campaign_id).bind(&provider).bind(&model).bind(format!("Re-audit quality rewrite revision {new_revision}.")).bind(context).execute(&mut *connection).await.map_err(db_error("Could not create rewrite auditor"))?.last_insert_rowid();
    sqlx::query("UPDATE draft_ai_audit_runs SET agent_run_id=?1 WHERE id=?2")
        .bind(audit_agent)
        .bind(audit_id)
        .execute(&mut *connection)
        .await
        .map_err(db_error("Could not link rewrite audit"))?;
    sqlx::query("UPDATE draft_quality_attempts SET ai_audit_run_id=?1 WHERE id=?2")
        .bind(audit_id)
        .bind(input.attempt_id)
        .execute(&mut *connection)
        .await
        .map_err(db_error("Could not link rewrite attempt audit"))?;
    sqlx::query("UPDATE draft_quality_runs SET current_content_revision=?1,applied_rewrite_count=applied_rewrite_count+1,active_agent_run_id=?2,active_ai_audit_run_id=?3,updated_at=datetime('now') WHERE id=?4").bind(new_revision).bind(audit_agent).bind(audit_id).bind(input.quality_run_id).execute(&mut *connection).await.map_err(db_error("Could not advance quality run"))?;
    Ok(SettlementPayload {
        status: "awaiting_audit".into(),
        overall_score: overall,
        content_revision: new_revision,
        ai_audit_run_id: Some(audit_id),
        agent_run_id: Some(audit_agent),
    })
}

pub(crate) async fn apply_with_pool(
    pool: &SqlitePool,
    input: ApplyScoreInput,
) -> Result<SettlementPayload, String> {
    let mut c = begin(pool).await?;
    let r = apply_on_connection(&mut c, &input).await;
    finish(&mut c, r).await
}

async fn continue_on_connection(
    c: &mut SqliteConnection,
    input: &RunInput,
) -> Result<ClaimPayload, String> {
    let row=sqlx::query("SELECT qr.current_content_revision,qr.applied_rewrite_count,qr.provider_key,qr.model_name,qr.active_ai_audit_run_id,dv.content_revision,dv.hook,dv.body,dv.cta,dv.hashtags,d.campaign_id,dar.status audit_status FROM draft_quality_runs qr JOIN draft_variants dv ON dv.id=qr.draft_variant_id JOIN drafts d ON d.id=dv.draft_id LEFT JOIN draft_ai_audit_runs dar ON dar.id=qr.active_ai_audit_run_id WHERE qr.id=?1 AND qr.draft_variant_id=?2 AND qr.status='running'").bind(input.quality_run_id).bind(input.draft_variant_id).fetch_optional(&mut *c).await.map_err(db_error("Could not continue quality run"))?.ok_or_else(||"Active quality run was not found".to_string())?;
    let revision: i64 = row.try_get("current_content_revision").unwrap_or_default();
    if row
        .try_get::<i64, _>("content_revision")
        .unwrap_or_default()
        != revision
    {
        return Err("Draft changed before quality continuation".into());
    }
    if row.try_get::<String, _>("audit_status").unwrap_or_default() != "completed" {
        return Err("Rewrite AI audit has not completed".into());
    }
    let audit_id: i64 = row
        .try_get::<Option<i64>, _>("active_ai_audit_run_id")
        .unwrap_or(None)
        .unwrap_or_default();
    let findings:i64=sqlx::query_scalar("SELECT COUNT(*) FROM draft_ai_audit_findings WHERE audit_run_id=?1 AND rule_key IN ('hook','specificity','generic_language','authenticity','clarity','safety')").bind(audit_id).fetch_one(&mut *c).await.map_err(db_error("Could not validate rewrite audit"))?;
    let blocks: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM draft_ai_audit_findings WHERE audit_run_id=?1 AND severity='block'",
    )
    .bind(audit_id)
    .fetch_one(&mut *c)
    .await
    .map_err(db_error("Could not validate rewrite audit"))?;
    if findings != AUDIT_RULES.len() as i64 || blocks > 0 {
        sqlx::query("UPDATE draft_quality_runs SET status='needs_revision',error_message='Rewrite AI audit was blocking or incomplete.',completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?1").bind(input.quality_run_id).execute(&mut *c).await.map_err(db_error("Could not stop blocked quality run"))?;
        return Err("Rewrite AI audit requires human revision".into());
    }
    let attempt_number: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(attempt_number),0)+1 FROM draft_quality_attempts WHERE run_id=?1",
    )
    .bind(input.quality_run_id)
    .fetch_one(&mut *c)
    .await
    .map_err(db_error("Could not allocate quality attempt"))?;
    let hook: String = row.try_get("hook").unwrap_or_default();
    let body: String = row.try_get("body").unwrap_or_default();
    let cta: String = row.try_get("cta").unwrap_or_default();
    let hashtags: String = row.try_get("hashtags").unwrap_or_default();
    let attempt_id=sqlx::query("INSERT INTO draft_quality_attempts (run_id,attempt_number,content_revision,input_hook,input_body,input_cta,input_hashtags) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind(input.quality_run_id).bind(attempt_number).bind(revision).bind(&hook).bind(&body).bind(&cta).bind(&hashtags).execute(&mut *c).await.map_err(db_error("Could not append quality attempt"))?.last_insert_rowid();
    let campaign: i64 = row.try_get("campaign_id").unwrap_or_default();
    let provider: String = row.try_get("provider_key").unwrap_or_default();
    let model: String = row.try_get("model_name").unwrap_or_default();
    let applied: i64 = row.try_get("applied_rewrite_count").unwrap_or_default();
    let agent = create_quality_agent(
        c,
        campaign,
        &provider,
        &model,
        input.quality_run_id,
        attempt_id,
        input.draft_variant_id,
        revision,
        &hook,
        &body,
        &cta,
        &hashtags,
        applied < 2,
    )
    .await?;
    sqlx::query("UPDATE draft_quality_attempts SET agent_run_id=?1 WHERE id=?2")
        .bind(agent)
        .bind(attempt_id)
        .execute(&mut *c)
        .await
        .map_err(db_error("Could not link continued quality attempt"))?;
    sqlx::query("UPDATE draft_quality_runs SET active_agent_run_id=?1,active_ai_audit_run_id=NULL,updated_at=datetime('now') WHERE id=?2").bind(agent).bind(input.quality_run_id).execute(&mut *c).await.map_err(db_error("Could not continue quality run"))?;
    Ok(ClaimPayload {
        quality_run_id: input.quality_run_id,
        attempt_id,
        agent_run_id: agent,
        campaign_id: campaign,
        draft_variant_id: input.draft_variant_id,
        content_revision: revision,
    })
}
pub(crate) async fn continue_with_pool(
    pool: &SqlitePool,
    input: RunInput,
) -> Result<ClaimPayload, String> {
    let mut c = begin(pool).await?;
    let r = continue_on_connection(&mut c, &input).await;
    finish(&mut c, r).await
}

async fn fail_on_connection(c: &mut SqliteConnection, input: &FailInput) -> Result<(), String> {
    bounded(&input.error_message, 1000, "Quality error", false)?;
    let result=sqlx::query("UPDATE draft_quality_runs SET status='failed',error_message=?1,completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?2 AND draft_variant_id=?3 AND status IN ('pending','running')").bind(input.error_message.trim()).bind(input.quality_run_id).bind(input.draft_variant_id).execute(&mut *c).await.map_err(db_error("Could not fail quality run"))?;
    if result.rows_affected() != 1 {
        return Err("Active quality run was not found".into());
    }
    sqlx::query("UPDATE draft_quality_attempts SET status='failed',completed_at=datetime('now'),updated_at=datetime('now') WHERE run_id=?1 AND status='scoring'").bind(input.quality_run_id).execute(&mut *c).await.map_err(db_error("Could not fail quality attempt"))?;
    Ok(())
}
pub(crate) async fn fail_with_pool(pool: &SqlitePool, input: FailInput) -> Result<(), String> {
    let mut c = begin(pool).await?;
    let r = fail_on_connection(&mut c, &input).await;
    finish(&mut c, r).await
}

async fn reconcile_on_connection(
    c: &mut SqliteConnection,
    input: &ReconcileInput,
) -> Result<ReconcilePayload, String> {
    if !(1..=100).contains(&input.limit) {
        return Err("Reconcile limit is invalid".into());
    }
    let ids:Vec<i64>=sqlx::query_scalar("SELECT id FROM draft_quality_runs WHERE status IN ('pending','running') AND datetime(updated_at)<=datetime('now','-15 minutes') ORDER BY updated_at,id LIMIT ?1").bind(input.limit).fetch_all(&mut *c).await.map_err(db_error("Could not find stale quality runs"))?;
    for id in &ids {
        sqlx::query("UPDATE draft_quality_runs SET status='failed',error_message='Quality loop was interrupted and can be resumed.',completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?1").bind(id).execute(&mut *c).await.map_err(db_error("Could not reconcile stale quality run"))?;
        sqlx::query("UPDATE draft_quality_attempts SET status='failed',completed_at=datetime('now'),updated_at=datetime('now') WHERE run_id=?1 AND status='scoring'").bind(id).execute(&mut *c).await.map_err(db_error("Could not reconcile stale quality attempt"))?;
    }
    Ok(ReconcilePayload {
        reconciled_run_ids: ids,
    })
}
pub(crate) async fn reconcile_with_pool(
    pool: &SqlitePool,
    input: ReconcileInput,
) -> Result<ReconcilePayload, String> {
    let mut c = begin(pool).await?;
    let r = reconcile_on_connection(&mut c, &input).await;
    finish(&mut c, r).await
}

async fn resume_on_connection(
    c: &mut SqliteConnection,
    input: &RunInput,
) -> Result<ClaimPayload, String> {
    let row=sqlx::query("SELECT qr.current_content_revision,qr.applied_rewrite_count,qr.provider_key,qr.model_name,dv.content_revision,dv.hook,dv.body,dv.cta,dv.hashtags,d.campaign_id FROM draft_quality_runs qr JOIN draft_variants dv ON dv.id=qr.draft_variant_id JOIN drafts d ON d.id=dv.draft_id WHERE qr.id=?1 AND qr.draft_variant_id=?2 AND qr.status='failed'").bind(input.quality_run_id).bind(input.draft_variant_id).fetch_optional(&mut *c).await.map_err(db_error("Could not resume quality run"))?.ok_or_else(||"Recoverable failed quality run was not found".to_string())?;
    let revision: i64 = row.try_get("current_content_revision").unwrap_or_default();
    if row
        .try_get::<i64, _>("content_revision")
        .unwrap_or_default()
        != revision
    {
        return Err("Draft changed before quality resume".into());
    }
    let attempt_number: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(attempt_number),0)+1 FROM draft_quality_attempts WHERE run_id=?1",
    )
    .bind(input.quality_run_id)
    .fetch_one(&mut *c)
    .await
    .map_err(db_error("Could not allocate resumed attempt"))?;
    if attempt_number > 3 {
        return Err("Quality rewrite limit is exhausted".into());
    }
    let hook: String = row.try_get("hook").unwrap_or_default();
    let body: String = row.try_get("body").unwrap_or_default();
    let cta: String = row.try_get("cta").unwrap_or_default();
    let hashtags: String = row.try_get("hashtags").unwrap_or_default();
    let attempt=sqlx::query("INSERT INTO draft_quality_attempts (run_id,attempt_number,content_revision,input_hook,input_body,input_cta,input_hashtags) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind(input.quality_run_id).bind(attempt_number).bind(revision).bind(&hook).bind(&body).bind(&cta).bind(&hashtags).execute(&mut *c).await.map_err(db_error("Could not append resumed attempt"))?.last_insert_rowid();
    let campaign: i64 = row.try_get("campaign_id").unwrap_or_default();
    let provider: String = row.try_get("provider_key").unwrap_or_default();
    let model: String = row.try_get("model_name").unwrap_or_default();
    let applied: i64 = row.try_get("applied_rewrite_count").unwrap_or_default();
    let agent = create_quality_agent(
        c,
        campaign,
        &provider,
        &model,
        input.quality_run_id,
        attempt,
        input.draft_variant_id,
        revision,
        &hook,
        &body,
        &cta,
        &hashtags,
        applied < 2,
    )
    .await?;
    sqlx::query("UPDATE draft_quality_attempts SET agent_run_id=?1 WHERE id=?2")
        .bind(agent)
        .bind(attempt)
        .execute(&mut *c)
        .await
        .map_err(db_error("Could not link resumed attempt"))?;
    sqlx::query("UPDATE draft_quality_runs SET status='running',error_message='',completed_at=NULL,active_agent_run_id=?1,active_ai_audit_run_id=NULL,updated_at=datetime('now') WHERE id=?2").bind(agent).bind(input.quality_run_id).execute(&mut *c).await.map_err(db_error("Could not resume quality run"))?;
    Ok(ClaimPayload {
        quality_run_id: input.quality_run_id,
        attempt_id: attempt,
        agent_run_id: agent,
        campaign_id: campaign,
        draft_variant_id: input.draft_variant_id,
        content_revision: revision,
    })
}
pub(crate) async fn resume_with_pool(
    pool: &SqlitePool,
    input: RunInput,
) -> Result<ClaimPayload, String> {
    let mut c = begin(pool).await?;
    let r = resume_on_connection(&mut c, &input).await;
    finish(&mut c, r).await
}

#[tauri::command]
pub async fn linkgo_draft_quality_claim(
    pool: State<'_, SqlitePool>,
    input: ClaimInput,
) -> Result<ClaimPayload, String> {
    claim_with_pool(&pool, input).await
}
#[tauri::command]
pub async fn linkgo_draft_quality_apply_score(
    pool: State<'_, SqlitePool>,
    input: ApplyScoreInput,
) -> Result<SettlementPayload, String> {
    apply_with_pool(&pool, input).await
}
#[tauri::command]
pub async fn linkgo_draft_quality_continue(
    pool: State<'_, SqlitePool>,
    input: RunInput,
) -> Result<ClaimPayload, String> {
    continue_with_pool(&pool, input).await
}
#[tauri::command]
pub async fn linkgo_draft_quality_fail(
    pool: State<'_, SqlitePool>,
    input: FailInput,
) -> Result<(), String> {
    fail_with_pool(&pool, input).await
}
#[tauri::command]
pub async fn linkgo_draft_quality_reconcile_stale(
    pool: State<'_, SqlitePool>,
    input: ReconcileInput,
) -> Result<ReconcilePayload, String> {
    reconcile_with_pool(&pool, input).await
}
#[tauri::command]
pub async fn linkgo_draft_quality_resume(
    pool: State<'_, SqlitePool>,
    input: RunInput,
) -> Result<ClaimPayload, String> {
    resume_with_pool(&pool, input).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mean_rounds_and_categories_are_exact() {
        let scores = CATEGORIES
            .iter()
            .enumerate()
            .map(|(i, key)| CategoryScore {
                category_key: (*key).into(),
                score: 68 + i as i64,
                feedback: "bounded".into(),
            })
            .collect::<Vec<_>>();
        assert_eq!(validate_scores(&scores).unwrap(), 70);
        let mut duplicate = scores;
        duplicate[4].category_key = "specificity".into();
        assert!(validate_scores(&duplicate).is_err());
    }
}
