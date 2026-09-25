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
#[cfg(test)]
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
// Mirror auditDraftVariant's ECMAScript trim, UTF-16 length and Unicode regex
// semantics. Shared fixtures exercise this checker and the real TS checker.
fn js_trim(value: &str) -> &str {
    value.trim_matches(|c| matches!(c, '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'))
}

fn deterministic_rewrite_findings(
    rewrite: &Rewrite,
) -> Vec<(&'static str, &'static str, &'static str)> {
    deterministic_draft_findings(
        &rewrite.hook,
        &rewrite.body,
        &rewrite.cta,
        &rewrite.hashtags,
    )
}

/// Native port of the renderer `auditDraftVariant` (deterministic rules),
/// shared by quality rewrites and draft create/edit.
pub(crate) fn deterministic_draft_findings(
    hook: &str,
    body: &str,
    cta: &str,
    hashtags: &str,
) -> Vec<(&'static str, &'static str, &'static str)> {
    use regex::Regex;
    use std::sync::LazyLock;
    static HASHTAGS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"#[\p{L}\p{N}_-]+").unwrap());
    static LINK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)https?://|www\.").unwrap());
    static WEAK_HOOK: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?i)^(excited to|in today's|i'm thrilled|quick update)").unwrap()
    });
    // JS /iu word characters are ASCII plus the two Unicode simple-fold peers.
    static FIRST_PERSON: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?i)(?:^|[^a-z0-9_ſK])(?:i|we|my|our)(?:$|[^a-z0-9_ſK])").unwrap()
    });
    let hook = js_trim(hook);
    let body = js_trim(body);
    let cta = js_trim(cta);
    let hashtags = js_trim(hashtags);
    let length: usize = [hook, body, cta, hashtags]
        .iter()
        .map(|s| s.encode_utf16().count())
        .sum();
    let text = format!("{hook} {body} {cta}");
    let combined = format!("{text} {hashtags}");
    let mut findings = vec![
        if hook.is_empty() && body.is_empty() {
            (
                "required_text",
                "block",
                "Add a hook or body before this variant can be reviewed.",
            )
        } else {
            (
                "required_text",
                "pass",
                "This variant has draft text to review.",
            )
        },
        if length > 3000 {
            (
                "total_length",
                "block",
                "Keep the combined hook, body, CTA, and hashtags under 3,000 characters.",
            )
        } else {
            (
                "total_length",
                "pass",
                "This variant stays under the 3,000 character limit.",
            )
        },
        if LINK.is_match(&text) {
            (
                "external_link",
                "block",
                "Remove external links from the hook, body, and CTA before review.",
            )
        } else {
            (
                "external_link",
                "pass",
                "No external link was found in the hook, body, or CTA.",
            )
        },
        if HASHTAGS.find_iter(hashtags).count() > 5 {
            ("hashtag_limit", "block", "Use five or fewer hashtags.")
        } else {
            (
                "hashtag_limit",
                "pass",
                "This variant uses five or fewer hashtags.",
            )
        },
    ];
    if hook.encode_utf16().count() < 35 || WEAK_HOOK.is_match(hook) {
        findings.push((
            "weak_hook",
            "warning",
            "Strengthen the hook with a specific, curiosity-driving opening.",
        ));
    }
    if !combined.chars().any(|c| c.is_ascii_digit()) && !FIRST_PERSON.is_match(&combined) {
        findings.push((
            "specificity",
            "warning",
            "Add a number or first-person signal so the draft feels specific.",
        ));
    }
    findings.sort_by_key(|(key, severity, _)| {
        (
            match *severity {
                "block" => 0,
                "warning" => 1,
                _ => 2,
            },
            *key,
        )
    });
    findings
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

// Select authority before checking status: an older pass must never mask a newer failure.
// All callers hold BEGIN IMMEDIATE through their writes.
async fn require_latest_ai_audit(
    connection: &mut SqliteConnection,
    variant_id: i64,
    revision: i64,
) -> Result<(), String> {
    let ready: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM draft_ai_audit_runs dar WHERE dar.id=(SELECT id FROM draft_ai_audit_runs WHERE draft_variant_id=?1 AND content_revision=?2 ORDER BY id DESC LIMIT 1) AND dar.status='completed' AND (SELECT COUNT(*) FROM draft_ai_audit_findings f WHERE f.audit_run_id=dar.id)=6 AND (SELECT COUNT(*) FROM draft_ai_audit_findings f WHERE f.audit_run_id=dar.id AND f.rule_key IN ('hook','specificity','generic_language','authenticity','clarity','safety'))=6 AND NOT EXISTS (SELECT 1 FROM draft_ai_audit_findings f WHERE f.audit_run_id=dar.id AND f.severity='block')")
        .bind(variant_id).bind(revision).fetch_one(&mut *connection).await.map_err(db_error("Could not validate quality audit prerequisite"))?;
    if ready != 1 {
        return Err(
            "Current revision requires a completed canonical non-blocking latest AI audit".into(),
        );
    }
    Ok(())
}

async fn require_latest_quality_run(
    connection: &mut SqliteConnection,
    input: &RunInput,
    revision: i64,
) -> Result<(), String> {
    let latest: Option<i64> = sqlx::query_scalar("SELECT id FROM draft_quality_runs WHERE draft_variant_id=?1 AND current_content_revision=?2 ORDER BY id DESC LIMIT 1")
        .bind(input.draft_variant_id).bind(revision).fetch_optional(&mut *connection).await.map_err(db_error("Could not validate latest quality run"))?;
    if latest != Some(input.quality_run_id) {
        return Err("Draft quality run has been superseded".into());
    }
    require_latest_ai_audit(connection, input.draft_variant_id, revision).await
}

async fn claim_on_connection(
    connection: &mut SqliteConnection,
    input: &ClaimInput,
) -> Result<ClaimPayload, String> {
    bounded(&input.model_name, 120, "Model name", true)?;
    let row = sqlx::query("SELECT dv.content_revision,dv.hook,dv.body,dv.cta,dv.hashtags,d.campaign_id FROM draft_variants dv JOIN drafts d ON d.id=dv.draft_id WHERE dv.id=?1")
        .bind(input.draft_variant_id).fetch_optional(&mut *connection).await.map_err(db_error("Could not load draft quality scope"))?.ok_or_else(|| "Draft variant was not found".to_string())?;
    let revision: i64 = row.try_get("content_revision").unwrap_or_default();
    require_latest_ai_audit(connection, input.draft_variant_id, revision).await?;
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CompletedQualityOutput {
    campaign_id: i64,
    draft_variant_id: i64,
    quality_run_id: i64,
    attempt_id: i64,
    content_revision: i64,
    category_scores: Vec<CategoryScore>,
    rewrite: Option<Rewrite>,
    summary: String,
}

// Called under the settlement's BEGIN IMMEDIATE, before any durable write.
async fn validate_completed_quality_evidence(
    connection: &mut SqliteConnection,
    input: &ApplyScoreInput,
) -> Result<(), String> {
    const INVALID: &str = "Completed quality evidence is missing or mismatched";
    let row = sqlx::query("SELECT ar.input_context_json, d.campaign_id, qa.input_hook,qa.input_body,qa.input_cta,qa.input_hashtags,qr.applied_rewrite_count,qr.maximum_rewrite_count FROM draft_quality_attempts qa JOIN draft_quality_runs qr ON qr.id=qa.run_id JOIN draft_variants dv ON dv.id=qr.draft_variant_id JOIN drafts d ON d.id=dv.draft_id JOIN agent_runs ar ON ar.id=qa.agent_run_id WHERE qa.id=?1 AND qr.id=?2 AND dv.id=?3 AND ar.id=?4 AND qr.active_agent_run_id=ar.id AND qa.content_revision=?5 AND ar.status='completed' AND ar.completed_at IS NOT NULL AND ar.error_message='' AND ar.campaign_id=d.campaign_id AND ar.agent_role='auditor' AND ar.provider_key=qr.provider_key AND ar.model_name=qr.model_name")
        .bind(input.attempt_id).bind(input.quality_run_id).bind(input.draft_variant_id)
        .bind(input.agent_run_id).bind(input.content_revision)
        .fetch_optional(&mut *connection).await.map_err(db_error("Could not load quality evidence"))?
        .ok_or(INVALID)?;
    let campaign: i64 = row.get("campaign_id");
    let allowed =
        row.get::<i64, _>("applied_rewrite_count") < row.get::<i64, _>("maximum_rewrite_count");
    let expected = json!({
        "campaignId": campaign, "draftVariantId": input.draft_variant_id,
        "qualityRunId": input.quality_run_id, "attemptId": input.attempt_id,
        "contentRevision": input.content_revision,
        "hook": row.get::<String, _>("input_hook"), "body": row.get::<String, _>("input_body"),
        "cta": row.get::<String, _>("input_cta"), "hashtags": row.get::<String, _>("input_hashtags"),
        "threshold": 70, "rewriteAllowed": allowed, "priorCategoryFeedback": []
    });
    for (field, maximum) in [
        ("hook", 500),
        ("body", 3000),
        ("cta", 500),
        ("hashtags", 300),
    ] {
        bounded(
            expected[field].as_str().ok_or(INVALID)?,
            maximum,
            "Quality original text",
            true,
        )?;
    }
    let context: serde_json::Value =
        serde_json::from_str(row.get("input_context_json")).map_err(|_| INVALID)?;
    if context.get("qualityRequest") != Some(&expected) {
        return Err(INVALID.into());
    }
    // Ambiguous multiple completions must not let the caller choose a preferred grade.
    let calls = sqlx::query("SELECT input_json,output_json,status,completed_at,error_message FROM agent_tool_calls WHERE agent_run_id=?1 AND tool_name='score_draft_quality' ORDER BY id LIMIT 2")
        .bind(input.agent_run_id).fetch_all(&mut *connection).await.map_err(db_error("Could not load quality tool evidence"))?;
    if calls.len() != 1 {
        return Err(INVALID.into());
    }
    let call = &calls[0];
    if call.get::<String, _>("status") != "completed"
        || call.get::<Option<String>, _>("completed_at").is_none()
        || !call.get::<String, _>("error_message").is_empty()
    {
        return Err(INVALID.into());
    }
    let mut request: serde_json::Value =
        serde_json::from_str(call.get("input_json")).map_err(|_| INVALID)?;
    let object = request.as_object_mut().ok_or(INVALID)?;
    let scores: Vec<CategoryScore> =
        serde_json::from_value(object.remove("categoryScores").ok_or(INVALID)?)
            .map_err(|_| INVALID)?;
    let rewrite: Option<Rewrite> = object
        .remove("rewrite")
        .map(serde_json::from_value)
        .transpose()
        .map_err(|_| INVALID)?;
    if request != expected {
        return Err(INVALID.into());
    }
    let overall = validate_scores(&scores)?;
    if rewrite.is_some() != (overall < 70 && allowed) {
        return Err(INVALID.into());
    }
    if let Some(rewrite) = &rewrite {
        bounded(&rewrite.hook, 500, "Rewrite hook", false)?;
        bounded(&rewrite.body, 3000, "Rewrite body", false)?;
        bounded(&rewrite.cta, 500, "Rewrite CTA", true)?;
        bounded(&rewrite.hashtags, 300, "Rewrite hashtags", true)?;
    }
    let output_json: serde_json::Value =
        serde_json::from_str(call.get("output_json")).map_err(|_| INVALID)?;
    if output_json
        .get("rewrite")
        .is_some_and(serde_json::Value::is_null)
    {
        return Err(INVALID.into());
    }
    let output: CompletedQualityOutput =
        serde_json::from_value(output_json).map_err(|_| INVALID)?;
    bounded(&output.summary, 1000, "Quality tool summary", false)?;
    for rewrite in [&output.rewrite, &input.rewrite].into_iter().flatten() {
        bounded(&rewrite.hook, 500, "Rewrite hook", false)?;
        bounded(&rewrite.body, 3000, "Rewrite body", false)?;
        bounded(&rewrite.cta, 500, "Rewrite CTA", true)?;
        bounded(&rewrite.hashtags, 300, "Rewrite hashtags", true)?;
    }
    // The frontend trims feedback/rewrite fields during schema parsing. Compare
    // those normalized values, without allowing scores or original text to drift.
    let normalized_scores = |scores: &[CategoryScore]| {
        let mut scores = scores.to_vec();
        for score in &mut scores {
            score.feedback = score.feedback.trim().to_string();
        }
        scores.sort_by(|a, b| a.category_key.cmp(&b.category_key));
        serde_json::to_value(scores).expect("quality scores serialize")
    };
    let normalized_rewrite = |rewrite: &Option<Rewrite>| {
        rewrite.as_ref().map(|r|
        json!({"hook":r.hook.trim(),"body":r.body.trim(),"cta":r.cta.trim(),"hashtags":r.hashtags.trim()}))
    };
    validate_scores(&output.category_scores)?;
    if output.campaign_id != campaign
        || output.draft_variant_id != input.draft_variant_id
        || output.quality_run_id != input.quality_run_id
        || output.attempt_id != input.attempt_id
        || output.content_revision != input.content_revision
        || normalized_scores(&scores) != normalized_scores(&output.category_scores)
        || normalized_scores(&scores) != normalized_scores(&input.category_scores)
        || normalized_rewrite(&rewrite) != normalized_rewrite(&output.rewrite)
        || normalized_rewrite(&rewrite) != normalized_rewrite(&input.rewrite)
    {
        return Err(INVALID.into());
    }
    Ok(())
}

async fn apply_on_connection(
    connection: &mut SqliteConnection,
    input: &ApplyScoreInput,
) -> Result<SettlementPayload, String> {
    bounded(&input.summary, 1000, "Quality summary", false)?;
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
    require_latest_quality_run(
        connection,
        &RunInput {
            quality_run_id: input.quality_run_id,
            draft_variant_id: input.draft_variant_id,
        },
        current,
    )
    .await?;
    validate_completed_quality_evidence(connection, input).await?;
    for score in &input.category_scores {
        sqlx::query("INSERT INTO draft_quality_category_scores (attempt_id,category_key,score,feedback) VALUES (?1,?2,?3,?4)").bind(input.attempt_id).bind(&score.category_key).bind(score.score).bind(score.feedback.trim()).execute(&mut *connection).await.map_err(db_error("Could not persist quality score"))?;
    }
    if overall >= 70 {
        if input.rewrite.is_some() {
            return Err("Passing quality output must not include a rewrite".into());
        }
        sqlx::query("UPDATE draft_quality_attempts SET overall_score=?1,status='passed',completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?2").bind(overall).bind(input.attempt_id).execute(&mut *connection).await.map_err(db_error("Could not pass quality attempt"))?;
        sqlx::query("UPDATE draft_quality_runs SET status='passed',final_score=?1,summary=?2,active_agent_run_id=NULL,completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?3").bind(overall).bind(input.summary.trim()).bind(input.quality_run_id).execute(&mut *connection).await.map_err(db_error("Could not pass quality run"))?;
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
    for (rule_key, severity, message) in deterministic_rewrite_findings(rewrite) {
        sqlx::query("INSERT INTO draft_audits (draft_variant_id,rule_key,severity,message,content_revision) VALUES (?1,?2,?3,?4,?5)")
            .bind(input.draft_variant_id).bind(rule_key).bind(severity).bind(message).bind(new_revision)
            .execute(&mut *connection).await.map_err(db_error("Could not regenerate deterministic audit"))?;
    }
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
    require_latest_quality_run(c, input, revision).await?;
    if row.try_get::<String, _>("audit_status").unwrap_or_default() != "completed" {
        return Err("Rewrite AI audit has not completed".into());
    }
    // The linked rewrite audit must finish, but readiness comes from the latest
    // audit for this revision, not from a historical linked result.
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
    require_latest_quality_run(c, input, revision).await?;
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
    fn deterministic_fixtures() -> serde_json::Value {
        serde_json::from_str(include_str!(
            "../../tests/fixtures/draft-deterministic-audits.json"
        ))
        .unwrap()
    }

    fn fixture_rewrite(case: &serde_json::Value) -> Rewrite {
        let mut rewrite: Rewrite = serde_json::from_value(case["rewrite"].clone()).unwrap();
        if let Some(repeat) = case["bodyRepeat"].as_u64() {
            rewrite.body = rewrite.body.repeat(repeat as usize);
        }
        rewrite
    }

    fn expected_findings(
        fixtures: &serde_json::Value,
        case: &serde_json::Value,
    ) -> Vec<(String, String, String)> {
        case["expected"]
            .as_array()
            .unwrap()
            .iter()
            .map(|pair| {
                let key = pair[0].as_str().unwrap();
                let severity = pair[1].as_str().unwrap();
                (
                    key.into(),
                    severity.into(),
                    fixtures["messages"][key][severity].as_str().unwrap().into(),
                )
            })
            .collect()
    }

    #[test]
    fn deterministic_checker_matches_shared_fixtures() {
        let fixtures = deterministic_fixtures();
        for case in fixtures["cases"].as_array().unwrap() {
            let actual: Vec<(String, String, String)> =
                deterministic_rewrite_findings(&fixture_rewrite(case))
                    .into_iter()
                    .map(|(key, severity, message)| (key.into(), severity.into(), message.into()))
                    .collect();
            assert_eq!(
                actual,
                expected_findings(&fixtures, case),
                "{}",
                case["name"]
            );
        }
    }

    #[tokio::test]
    async fn deterministic_rewrite_fixtures_apply_atomically_and_gate_approval() {
        use sqlx::{
            sqlite::{SqliteConnectOptions, SqlitePoolOptions},
            Executor,
        };
        let fixtures = deterministic_fixtures();
        for case in fixtures["cases"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|case| case["checkerOnly"] != true)
        {
            let directory = tempfile::tempdir().unwrap();
            let options = SqliteConnectOptions::new()
                .filename(directory.path().join("quality.db"))
                .create_if_missing(true)
                .foreign_keys(true);
            crate::migrations::migrate_database(&options).await.unwrap();
            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(options)
                .await
                .unwrap();
            pool.execute("INSERT INTO campaigns (id,name,status) VALUES (1,'Quality','active');
                INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES (1,'https://example.com/a','https://example.com/a','Source','hash');
                INSERT INTO candidate_posts (id,campaign_id,target_post_id,relevance_score) VALUES (1,1,1,90);
                INSERT INTO drafts (id,campaign_id,candidate_post_id,status) VALUES (1,1,1,'ready_for_review');
                INSERT INTO draft_variants (id,draft_id,variant_number,hook,body,status) VALUES (1,1,1,'Original hook','Original body','selected');
                INSERT INTO draft_variants (id,draft_id,variant_number,hook,body) VALUES (2,1,2,'Untouched','Other body');
                INSERT INTO draft_audits (draft_variant_id,rule_key,severity,message) VALUES (1,'old','block','Old finding'),(2,'other','warning','Keep me');
                INSERT INTO draft_ai_audit_runs (id,draft_variant_id,content_revision,provider_key,status,completed_at) VALUES (1,1,1,'dry_run','completed',datetime('now'));").await.unwrap();
            for key in AUDIT_RULES {
                sqlx::query("INSERT INTO draft_ai_audit_findings (audit_run_id,rule_key,severity,message) VALUES (1,?1,'pass','Evidence')").bind(key).execute(&pool).await.unwrap();
            }
            let claim = claim_with_pool(
                &pool,
                ClaimInput {
                    draft_variant_id: 1,
                    provider_key: "dry_run".into(),
                    model_name: "dry-run-local".into(),
                },
            )
            .await
            .unwrap();
            let rewrite = fixture_rewrite(case);
            let scores: Vec<CategoryScore> = CATEGORIES
                .iter()
                .map(|key| CategoryScore {
                    category_key: (*key).into(),
                    score: 50,
                    feedback: "Needs improvement".into(),
                })
                .collect();
            let context: String =
                sqlx::query_scalar("SELECT input_context_json FROM agent_runs WHERE id=?1")
                    .bind(claim.agent_run_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            let mut request = serde_json::from_str::<serde_json::Value>(&context).unwrap()
                ["qualityRequest"]
                .clone();
            request["categoryScores"] = json!(scores);
            request["rewrite"] = json!(rewrite);
            let summary = "Accepted five evidence-grounded quality scores for revision 1.";
            let output = json!({"campaignId":1,"draftVariantId":1,"qualityRunId":claim.quality_run_id,"attemptId":claim.attempt_id,"contentRevision":1,"categoryScores":scores,"rewrite":rewrite,"summary":summary});
            pool.execute(
                "UPDATE agent_runs SET status='completed',completed_at=datetime('now') WHERE id=1",
            )
            .await
            .unwrap();
            sqlx::query("INSERT INTO agent_tool_calls (agent_run_id,tool_name,status,input_json,output_json,completed_at) VALUES (1,'score_draft_quality','completed',?1,?2,datetime('now'))").bind(request.to_string()).bind(output.to_string()).execute(&pool).await.unwrap();
            let input = json!({"qualityRunId":claim.quality_run_id,"draftVariantId":1,"attemptId":claim.attempt_id,"agentRunId":claim.agent_run_id,"contentRevision":1,"categoryScores":scores,"rewrite":rewrite,"summary":summary});
            // Fail after deletion and at least one replacement insert: the entire settlement must roll back.
            pool.execute("CREATE TRIGGER reject_regeneration BEFORE INSERT ON draft_audits WHEN NEW.rule_key='required_text' BEGIN SELECT RAISE(ABORT,'Injected audit failure'); END").await.unwrap();
            rejected_without_changes(&pool, &input, "audit regeneration failure").await;
            pool.execute("DROP TRIGGER reject_regeneration")
                .await
                .unwrap();
            let result = apply_with_pool(&pool, serde_json::from_value(input).unwrap())
                .await
                .unwrap();
            assert_eq!(result.content_revision, 2, "{}", case["name"]);
            let persisted = sqlx::query(
                "SELECT hook,body,cta,hashtags,content_revision FROM draft_variants WHERE id=1",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(persisted.get::<String, _>("hook"), rewrite.hook);
            assert_eq!(persisted.get::<String, _>("body"), rewrite.body);
            assert_eq!(persisted.get::<String, _>("cta"), rewrite.cta);
            assert_eq!(persisted.get::<String, _>("hashtags"), rewrite.hashtags);
            assert_eq!(persisted.get::<i64, _>("content_revision"), 2);
            let rows = sqlx::query("SELECT rule_key,severity,message,content_revision FROM draft_audits WHERE draft_variant_id=1 ORDER BY CASE severity WHEN 'block' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,rule_key").fetch_all(&pool).await.unwrap();
            let actual: Vec<(String, String, String)> = rows
                .iter()
                .map(|r| {
                    assert_eq!(r.get::<i64, _>("content_revision"), 2);
                    (r.get("rule_key"), r.get("severity"), r.get("message"))
                })
                .collect();
            let expected = expected_findings(&fixtures, case);
            assert_eq!(actual, expected, "{}", case["name"]);
            assert_eq!(
                sqlx::query_scalar::<_, String>(
                    "SELECT message FROM draft_audits WHERE draft_variant_id=2"
                )
                .fetch_one(&pool)
                .await
                .unwrap(),
                "Keep me"
            );
            let audit_id = result.ai_audit_run_id.unwrap();
            sqlx::query("UPDATE draft_ai_audit_runs SET status='completed',completed_at=datetime('now') WHERE id=?1").bind(audit_id).execute(&pool).await.unwrap();
            for key in AUDIT_RULES {
                sqlx::query("INSERT INTO draft_ai_audit_findings (audit_run_id,rule_key,severity,message) VALUES (?1,?2,'pass','Evidence')").bind(audit_id).bind(key).execute(&pool).await.unwrap();
            }
            // Complete the actual next scoring attempt with passing provider evidence.
            let next = continue_with_pool(
                &pool,
                RunInput {
                    quality_run_id: claim.quality_run_id,
                    draft_variant_id: 1,
                },
            )
            .await
            .unwrap();
            let context: String =
                sqlx::query_scalar("SELECT input_context_json FROM agent_runs WHERE id=?1")
                    .bind(next.agent_run_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            let passing: Vec<CategoryScore> = scores
                .into_iter()
                .map(|mut score| {
                    score.score = 90;
                    score
                })
                .collect();
            let mut request = serde_json::from_str::<serde_json::Value>(&context).unwrap()
                ["qualityRequest"]
                .clone();
            request["categoryScores"] = json!(passing);
            let summary = "Accepted five evidence-grounded quality scores for revision 2.";
            let output = json!({"campaignId":1,"draftVariantId":1,"qualityRunId":next.quality_run_id,"attemptId":next.attempt_id,"contentRevision":2,"categoryScores":passing,"summary":summary});
            sqlx::query(
                "UPDATE agent_runs SET status='completed',completed_at=datetime('now') WHERE id=?1",
            )
            .bind(next.agent_run_id)
            .execute(&pool)
            .await
            .unwrap();
            sqlx::query("INSERT INTO agent_tool_calls (agent_run_id,tool_name,status,input_json,output_json,completed_at) VALUES (?1,'score_draft_quality','completed',?2,?3,datetime('now'))").bind(next.agent_run_id).bind(request.to_string()).bind(output.to_string()).execute(&pool).await.unwrap();
            let passed = apply_with_pool(
                &pool,
                ApplyScoreInput {
                    quality_run_id: next.quality_run_id,
                    draft_variant_id: 1,
                    attempt_id: next.attempt_id,
                    content_revision: 2,
                    agent_run_id: next.agent_run_id,
                    category_scores: passing,
                    rewrite: None,
                    summary: summary.into(),
                },
            )
            .await
            .unwrap();
            assert_eq!(passed.status, "passed");
            let blocked = expected.iter().any(|(_, severity, _)| severity == "block");
            let ready: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM approval_ready_variants WHERE draft_variant_id=1",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(ready, i64::from(!blocked), "{}", case["name"]);
            let approval = pool.execute("INSERT INTO approvals (campaign_id,draft_id,draft_variant_id,status) VALUES (1,1,1,'needs_review')").await;
            assert_eq!(approval.is_err(), blocked, "{}", case["name"]);
            pool.close().await;
        }
    }

    fn frontend_settlement() -> serde_json::Value {
        serde_json::from_str(include_str!(
            "../../tests/fixtures/draft-quality-settlement.json"
        ))
        .unwrap()
    }

    async fn durable_snapshot(pool: &SqlitePool) -> Vec<Vec<String>> {
        let mut snapshot = Vec::new();
        for table in [
            "draft_quality_runs",
            "draft_quality_attempts",
            "draft_quality_category_scores",
            "draft_variants",
            "draft_audits",
            "draft_ai_audit_runs",
            "draft_ai_audit_findings",
            "agent_runs",
            "agent_tool_calls",
            "agent_run_events",
        ] {
            let columns = sqlx::query(&format!("PRAGMA table_info({table})"))
                .fetch_all(pool)
                .await
                .unwrap()
                .iter()
                .map(|row| format!("\"{}\"", row.get::<String, _>("name")))
                .collect::<Vec<_>>()
                .join(",");
            snapshot.push(
                sqlx::query_scalar::<_, String>(&format!(
                    "SELECT json_array({columns}) FROM {table} ORDER BY id"
                ))
                .fetch_all(pool)
                .await
                .unwrap(),
            );
        }
        snapshot
    }

    async fn rejected_without_changes(pool: &SqlitePool, value: &serde_json::Value, label: &str) {
        let before = durable_snapshot(pool).await;
        assert!(
            apply_with_pool(pool, serde_json::from_value(value.clone()).unwrap())
                .await
                .is_err(),
            "accepted {label}"
        );
        assert_eq!(
            durable_snapshot(pool).await,
            before,
            "changed durable state for {label}"
        );
    }

    async fn tool_evidence(
        pool: &SqlitePool,
        request: &serde_json::Value,
        output: &serde_json::Value,
    ) {
        sqlx::query("UPDATE agent_tool_calls SET input_json=?1,output_json=?2 WHERE id=1")
            .bind(request.to_string())
            .bind(output.to_string())
            .execute(pool)
            .await
            .unwrap();
    }

    #[test]
    fn frontend_settlement_serde_contract() {
        let value = frontend_settlement();
        let input: ApplyScoreInput = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(input.summary, value["summary"].as_str().unwrap());
        for key in [
            "campaignId",
            "hook",
            "body",
            "cta",
            "hashtags",
            "threshold",
            "rewriteAllowed",
            "priorCategoryFeedback",
        ] {
            let mut malformed = value.clone();
            malformed[key] = json!(null);
            assert!(
                serde_json::from_value::<ApplyScoreInput>(malformed).is_err(),
                "accepted {key}"
            );
        }
        for key in [
            "qualityRunId",
            "draftVariantId",
            "attemptId",
            "contentRevision",
            "agentRunId",
            "categoryScores",
            "summary",
        ] {
            let mut malformed = value.clone();
            malformed.as_object_mut().unwrap().remove(key);
            assert!(
                serde_json::from_value::<ApplyScoreInput>(malformed).is_err(),
                "missing {key}"
            );
        }
        let mut legacy = value;
        legacy.as_object_mut().unwrap().remove("summary");
        legacy["campaignId"] = json!(1);
        legacy["hook"] = json!("A concrete hook");
        legacy["body"] = json!("A specific example.");
        legacy["cta"] = json!("Review it.");
        legacy["hashtags"] = json!("#Quality");
        legacy["threshold"] = json!(70);
        legacy["rewriteAllowed"] = json!(true);
        legacy["priorCategoryFeedback"] = json!([]);
        assert!(serde_json::from_value::<ApplyScoreInput>(legacy).is_err());
    }

    #[tokio::test]
    async fn recovery_controls_match_native_eligibility_without_rejected_writes() {
        use sqlx::{sqlite::SqlitePoolOptions, Executor};
        for (status, last_attempt, stale, allowed) in [
            ("failed", 1, false, true),
            ("failed", 2, false, true),
            ("failed", 3, false, false),
            ("needs_revision", 1, false, false),
            ("failed", 1, true, false),
        ] {
            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect("sqlite::memory:")
                .await
                .unwrap();
            pool.execute("PRAGMA foreign_keys=OFF; PRAGMA legacy_alter_table=ON;")
                .await
                .unwrap();
            for migration in crate::migrations::get_migrations() {
                pool.execute(migration.sql).await.unwrap();
            }
            pool.execute("PRAGMA foreign_keys=ON; PRAGMA legacy_alter_table=OFF;
                INSERT INTO campaigns (id,name,status) VALUES (1,'Quality','active');
                INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES (1,'https://example.com/a','https://example.com/a','Source','hash');
                INSERT INTO candidate_posts (id,campaign_id,target_post_id) VALUES (1,1,1);
                INSERT INTO drafts (id,campaign_id,candidate_post_id,status) VALUES (1,1,1,'drafting');
                INSERT INTO draft_variants (id,draft_id,variant_number,hook,body) VALUES (1,1,1,'Hook','Body');
                INSERT INTO draft_ai_audit_runs (id,draft_variant_id,content_revision,provider_key,status,completed_at) VALUES (1,1,1,'dry_run','completed',datetime('now'));
                INSERT INTO draft_ai_audit_findings (audit_run_id,rule_key,severity,message) SELECT 1,value,'pass','Checked' FROM json_each('[\"hook\",\"specificity\",\"generic_language\",\"authenticity\",\"clarity\",\"safety\"]');").await.unwrap();
            claim_with_pool(
                &pool,
                ClaimInput {
                    draft_variant_id: 1,
                    provider_key: "dry_run".into(),
                    model_name: "dry-run-local".into(),
                },
            )
            .await
            .unwrap();
            fail_with_pool(
                &pool,
                FailInput {
                    quality_run_id: 1,
                    draft_variant_id: 1,
                    error_message: "Interrupted".into(),
                },
            )
            .await
            .unwrap();
            sqlx::query("UPDATE draft_quality_runs SET status=?1 WHERE id=1")
                .bind(status)
                .execute(&pool)
                .await
                .unwrap();
            // Sparse numbering deliberately proves MAX, not row count, controls eligibility.
            if last_attempt > 1 {
                sqlx::query("INSERT INTO draft_quality_attempts (run_id,attempt_number,content_revision,input_hook,input_body,input_cta,input_hashtags,status,completed_at) VALUES (1,?1,1,'Hook','Body','','','failed',datetime('now'))")
                    .bind(last_attempt).execute(&pool).await.unwrap();
            }
            if stale {
                pool.execute("UPDATE draft_variants SET hook='Edited hook' WHERE id=1")
                    .await
                    .unwrap();
            }
            let before = durable_snapshot(&pool).await;
            let result = resume_with_pool(
                &pool,
                RunInput {
                    quality_run_id: 1,
                    draft_variant_id: 1,
                },
            )
            .await;
            if allowed {
                let claim = result.unwrap();
                let attempt: i64 = sqlx::query_scalar(
                    "SELECT attempt_number FROM draft_quality_attempts WHERE id=?1",
                )
                .bind(claim.attempt_id)
                .fetch_one(&pool)
                .await
                .unwrap();
                assert_eq!(attempt, last_attempt + 1);
                let state: (String, i64, i64) = sqlx::query_as("SELECT status,maximum_rewrite_count,applied_rewrite_count FROM draft_quality_runs WHERE id=1")
                    .fetch_one(&pool).await.unwrap();
                assert_eq!(state, ("running".into(), 2, 0));
            } else {
                let error = result.unwrap_err();
                let expected = if stale {
                    "Draft changed"
                } else if last_attempt == 3 {
                    "exhausted"
                } else {
                    "Recoverable failed"
                };
                assert!(error.contains(expected), "{error}");
                assert_eq!(
                    durable_snapshot(&pool).await,
                    before,
                    "{status}/{last_attempt}/{stale}"
                );
            }
            pool.close().await;
        }
    }

    #[tokio::test]
    async fn latest_audit_gates_claim_resume_and_settlement() {
        use sqlx::{sqlite::SqlitePoolOptions, Executor};
        for operation in ["claim", "resume", "settle", "continue"] {
            for state in [
                "pending",
                "running",
                "failed",
                "cancelled",
                "blocked",
                "incomplete",
                "extra",
            ] {
                let pool = SqlitePoolOptions::new()
                    .max_connections(1)
                    .connect("sqlite::memory:")
                    .await
                    .unwrap();
                pool.execute("PRAGMA foreign_keys=OFF; PRAGMA legacy_alter_table=ON;")
                    .await
                    .unwrap();
                for migration in crate::migrations::get_migrations() {
                    pool.execute(migration.sql).await.unwrap();
                }
                pool.execute("PRAGMA foreign_keys=ON; PRAGMA legacy_alter_table=OFF;
                    INSERT INTO campaigns (id,name,status) VALUES (1,'Quality','active');
                    INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES (1,'https://example.com/a','https://example.com/a','Source','hash');
                    INSERT INTO candidate_posts (id,campaign_id,target_post_id) VALUES (1,1,1);
                    INSERT INTO drafts (id,campaign_id,candidate_post_id,status) VALUES (1,1,1,'drafting');
                    INSERT INTO draft_variants (id,draft_id,variant_number,hook,body) VALUES (1,1,1,'Hook','Body');
                    INSERT INTO draft_ai_audit_runs (id,draft_variant_id,content_revision,provider_key,status,completed_at) VALUES (1,1,1,'dry_run','completed',datetime('now'));
                    INSERT INTO draft_ai_audit_findings (audit_run_id,rule_key,severity,message) SELECT 1,value,'pass','Checked' FROM json_each('[\"hook\",\"specificity\",\"generic_language\",\"authenticity\",\"clarity\",\"safety\"]');").await.unwrap();
                let claim_input = || ClaimInput {
                    draft_variant_id: 1,
                    provider_key: "dry_run".into(),
                    model_name: "dry-run-local".into(),
                };
                let run_input = || RunInput {
                    quality_run_id: 1,
                    draft_variant_id: 1,
                };
                if operation != "claim" {
                    claim_with_pool(&pool, claim_input()).await.unwrap();
                }
                if operation == "settle" {
                    let value = frontend_settlement();
                    let context: String =
                        sqlx::query_scalar("SELECT input_context_json FROM agent_runs WHERE id=1")
                            .fetch_one(&pool)
                            .await
                            .unwrap();
                    let mut request = serde_json::from_str::<serde_json::Value>(&context).unwrap()
                        ["qualityRequest"]
                        .clone();
                    request["categoryScores"] = value["categoryScores"].clone();
                    let output = json!({"campaignId":1,"draftVariantId":1,"qualityRunId":1,"attemptId":1,"contentRevision":1,"categoryScores":value["categoryScores"],"summary":"Checked"});
                    pool.execute("UPDATE agent_runs SET status='completed',completed_at=datetime('now') WHERE id=1").await.unwrap();
                    sqlx::query("INSERT INTO agent_tool_calls (agent_run_id,tool_name,status,input_json,output_json,completed_at) VALUES (1,'score_draft_quality','completed',?1,?2,datetime('now'))").bind(request.to_string()).bind(output.to_string()).execute(&pool).await.unwrap();
                }
                if operation == "resume" {
                    fail_with_pool(
                        &pool,
                        FailInput {
                            quality_run_id: 1,
                            draft_variant_id: 1,
                            error_message: "Interrupted".into(),
                        },
                    )
                    .await
                    .unwrap();
                }
                if operation == "continue" {
                    pool.execute(
                        "UPDATE draft_quality_runs SET active_ai_audit_run_id=1 WHERE id=1;",
                    )
                    .await
                    .unwrap();
                }
                let status = if ["blocked", "incomplete", "extra"].contains(&state) {
                    "completed"
                } else {
                    state
                };
                sqlx::query("INSERT INTO draft_ai_audit_runs (id,draft_variant_id,content_revision,provider_key,status,completed_at) VALUES (2,1,1,'dry_run',?1,CASE WHEN ?1 IN ('pending','running') THEN NULL ELSE datetime('now') END)").bind(status).execute(&pool).await.unwrap();
                pool.execute("INSERT INTO draft_ai_audit_findings (audit_run_id,rule_key,severity,message) SELECT 2,rule_key,'pass',message FROM draft_ai_audit_findings WHERE audit_run_id=1;").await.unwrap();
                match state {
                    "blocked" => {
                        pool.execute("UPDATE draft_ai_audit_findings SET severity='block' WHERE audit_run_id=2 AND rule_key='safety'").await.unwrap();
                    }
                    "incomplete" => {
                        pool.execute("DELETE FROM draft_ai_audit_findings WHERE audit_run_id=2 AND rule_key='hook'").await.unwrap();
                    }
                    "extra" => {
                        pool.execute("INSERT INTO draft_ai_audit_findings (audit_run_id,rule_key,severity,message) VALUES (2,'extra','pass','Extra')").await.unwrap();
                    }
                    _ => {}
                }
                let before = durable_snapshot(&pool).await;
                let error = match operation {
                    "claim" => claim_with_pool(&pool, claim_input()).await.unwrap_err(),
                    "resume" => resume_with_pool(&pool, run_input()).await.unwrap_err(),
                    "continue" => continue_with_pool(&pool, run_input()).await.unwrap_err(),
                    _ => apply_with_pool(
                        &pool,
                        serde_json::from_value(frontend_settlement()).unwrap(),
                    )
                    .await
                    .unwrap_err(),
                };
                assert!(error.contains("AI audit"), "{operation}/{state}: {error}");
                assert_eq!(durable_snapshot(&pool).await, before, "{operation}/{state}");
                pool.execute("UPDATE draft_ai_audit_runs SET status='completed',completed_at=datetime('now') WHERE id=2;
                    INSERT INTO draft_ai_audit_runs (id,draft_variant_id,content_revision,provider_key,status,completed_at) VALUES (3,1,1,'dry_run','completed',datetime('now'));
                    INSERT INTO draft_ai_audit_findings (audit_run_id,rule_key,severity,message) SELECT 3,rule_key,'pass',message FROM draft_ai_audit_findings WHERE audit_run_id=1;").await.unwrap();
                match operation {
                    "claim" => {
                        claim_with_pool(&pool, claim_input()).await.unwrap();
                    }
                    "resume" => {
                        resume_with_pool(&pool, run_input()).await.unwrap();
                    }
                    "continue" => {
                        // A later valid audit supersedes even a blocking linked audit.
                        pool.execute("UPDATE draft_ai_audit_findings SET severity='block' WHERE audit_run_id=1 AND rule_key='safety'").await.unwrap();
                        continue_with_pool(&pool, run_input()).await.unwrap();
                    }
                    _ => {
                        assert_eq!(
                            apply_with_pool(
                                &pool,
                                serde_json::from_value(frontend_settlement()).unwrap()
                            )
                            .await
                            .unwrap()
                            .status,
                            "passed"
                        );
                    }
                }
                if operation == "resume" {
                    fail_with_pool(
                        &pool,
                        FailInput {
                            quality_run_id: 1,
                            draft_variant_id: 1,
                            error_message: "Interrupted again".into(),
                        },
                    )
                    .await
                    .unwrap();
                    pool.execute("INSERT INTO draft_quality_runs (draft_variant_id,starting_content_revision,current_content_revision,provider_key,status,completed_at) VALUES (1,1,1,'dry_run','failed',datetime('now'))").await.unwrap();
                    let before = durable_snapshot(&pool).await;
                    assert!(resume_with_pool(&pool, run_input())
                        .await
                        .unwrap_err()
                        .contains("superseded"));
                    assert_eq!(durable_snapshot(&pool).await, before);
                }
                pool.execute("UPDATE draft_variants SET body='An edited body has no current audit' WHERE id=1").await.unwrap();
                let before = durable_snapshot(&pool).await;
                assert!(claim_with_pool(&pool, claim_input())
                    .await
                    .unwrap_err()
                    .contains("AI audit"));
                assert_eq!(durable_snapshot(&pool).await, before);
                pool.close().await;
            }
        }
    }

    #[tokio::test]
    async fn frontend_settlement_reaches_native_apply_with_pool() {
        use sqlx::{
            sqlite::{SqliteConnectOptions, SqlitePoolOptions},
            Executor,
        };
        let directory = tempfile::tempdir().unwrap();
        let options = SqliteConnectOptions::new()
            .filename(directory.path().join("quality.db"))
            .create_if_missing(true)
            .foreign_keys(true);
        crate::migrations::migrate_database(&options).await.unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap();
        pool.execute("INSERT INTO campaigns (id,name,status) VALUES (1,'Quality','active');
            INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES (1,'https://example.com/a','https://example.com/a','Source','hash');
            INSERT INTO candidate_posts (id,campaign_id,target_post_id,relevance_score) VALUES (1,1,1,90);
            INSERT INTO drafts (id,campaign_id,candidate_post_id,angle,notes,status) VALUES (1,1,1,'','','drafting');
            INSERT INTO draft_variants (id,draft_id,variant_number,hook,body,cta,hashtags) VALUES (1,1,1,'A concrete hook','A specific example.','Review it.','#Quality');
            INSERT INTO draft_ai_audit_runs (id,draft_variant_id,content_revision,provider_key,status,completed_at) VALUES (1,1,1,'dry_run','completed',datetime('now'));").await.unwrap();
        for key in AUDIT_RULES {
            sqlx::query("INSERT INTO draft_ai_audit_findings (audit_run_id,rule_key,severity,message) VALUES (1,?1,'pass','Matches supplied content')").bind(key).execute(&pool).await.unwrap();
        }
        let claim = claim_with_pool(
            &pool,
            ClaimInput {
                draft_variant_id: 1,
                provider_key: "dry_run".into(),
                model_name: "dry-run-local".into(),
            },
        )
        .await
        .unwrap();
        let value = frontend_settlement();
        assert_eq!(
            claim.quality_run_id,
            value["qualityRunId"].as_i64().unwrap()
        );
        assert_eq!(claim.attempt_id, value["attemptId"].as_i64().unwrap());
        assert_eq!(claim.agent_run_id, value["agentRunId"].as_i64().unwrap());
        for summary in ["".to_string(), " ".to_string(), "x".repeat(1001)] {
            let mut invalid = value.clone();
            invalid["summary"] = json!(summary);
            assert!(
                apply_with_pool(&pool, serde_json::from_value(invalid).unwrap())
                    .await
                    .unwrap_err()
                    .contains("summary")
            );
        }
        let mut stale = value.clone();
        stale["contentRevision"] = json!(2);
        assert!(
            apply_with_pool(&pool, serde_json::from_value(stale).unwrap())
                .await
                .unwrap_err()
                .contains("stale")
        );
        rejected_without_changes(&pool, &value, "queued agent without evidence").await;
        sqlx::query(
            "UPDATE agent_runs SET status='completed',completed_at=datetime('now') WHERE id=1",
        )
        .execute(&pool)
        .await
        .unwrap();
        rejected_without_changes(&pool, &value, "missing tool call").await;
        let context: String =
            sqlx::query_scalar("SELECT input_context_json FROM agent_runs WHERE id=1")
                .fetch_one(&pool)
                .await
                .unwrap();
        let mut request =
            serde_json::from_str::<serde_json::Value>(&context).unwrap()["qualityRequest"].clone();
        request["categoryScores"] = value["categoryScores"].clone();
        let output = json!({"campaignId":1,"draftVariantId":1,"qualityRunId":1,"attemptId":1,
            "contentRevision":1,"categoryScores":value["categoryScores"],
            "summary":"Accepted five evidence-grounded quality scores for revision 1."});
        sqlx::query("INSERT INTO agent_tool_calls (id,agent_run_id,tool_name,status,input_json,output_json,completed_at) VALUES (1,1,'score_draft_quality','completed',?1,?2,datetime('now'))")
            .bind(request.to_string()).bind(output.to_string()).execute(&pool).await.unwrap();
        for status in [
            "queued",
            "running",
            "failed",
            "cancelled",
            "waiting_approval",
        ] {
            sqlx::query("UPDATE agent_runs SET status=?1 WHERE id=1")
                .bind(status)
                .execute(&pool)
                .await
                .unwrap();
            rejected_without_changes(&pool, &value, status).await;
        }
        sqlx::query("UPDATE agent_runs SET status='completed' WHERE id=1")
            .execute(&pool)
            .await
            .unwrap();
        for status in [
            "requested",
            "running",
            "failed",
            "rejected",
            "waiting_approval",
        ] {
            sqlx::query("UPDATE agent_tool_calls SET status=?1 WHERE id=1")
                .bind(status)
                .execute(&pool)
                .await
                .unwrap();
            rejected_without_changes(&pool, &value, status).await;
        }
        sqlx::query("UPDATE agent_tool_calls SET status='completed' WHERE id=1")
            .execute(&pool)
            .await
            .unwrap();
        for malformed in [json!({}), json!(null), json!({"categoryScores":[]})] {
            tool_evidence(&pool, &request, &malformed).await;
            rejected_without_changes(&pool, &value, "missing or malformed tool output").await;
        }
        for field in [
            "campaignId",
            "draftVariantId",
            "qualityRunId",
            "attemptId",
            "contentRevision",
            "hook",
            "body",
            "cta",
            "hashtags",
            "threshold",
            "rewriteAllowed",
            "priorCategoryFeedback",
            "unexpected",
        ] {
            let mut bad = request.clone();
            bad[field] = match field {
                "rewriteAllowed" => json!(false),
                "priorCategoryFeedback" => {
                    json!([{"categoryKey":"specificity","feedback":"Not requested"}])
                }
                "hook" | "body" | "cta" | "hashtags" | "unexpected" => json!("mismatched text"),
                _ => json!(2),
            };
            tool_evidence(&pool, &bad, &output).await;
            rejected_without_changes(&pool, &value, field).await;
        }
        for field in [
            "campaignId",
            "draftVariantId",
            "qualityRunId",
            "attemptId",
            "contentRevision",
        ] {
            let mut bad = output.clone();
            bad[field] = json!(2);
            tool_evidence(&pool, &request, &bad).await;
            rejected_without_changes(&pool, &value, "tool output identity").await;
        }
        let mut bad_output = output.clone();
        bad_output["categoryScores"][0]["score"] = json!(99);
        tool_evidence(&pool, &request, &bad_output).await;
        rejected_without_changes(&pool, &value, "tool output scores").await;
        tool_evidence(&pool, &request, &output).await;
        let mut bad = value.clone();
        bad["categoryScores"][0]["score"] = json!(99);
        rejected_without_changes(&pool, &bad, "caller scores").await;
        bad = value.clone();
        bad["categoryScores"][0]["feedback"] = json!("Caller-authored feedback");
        rejected_without_changes(&pool, &bad, "caller feedback").await;

        // Below-threshold evidence must include an allowed rewrite, and neither
        // the caller nor tool output may substitute different draft text.
        let rewrite = json!({"hook":"Revised hook","body":"Revised body","cta":"","hashtags":""});
        let mut low_request = request.clone();
        for score in low_request["categoryScores"].as_array_mut().unwrap() {
            score["score"] = json!(60);
        }
        let mut low_output = output.clone();
        low_output["categoryScores"] = low_request["categoryScores"].clone();
        let mut low_value = value.clone();
        low_value["categoryScores"] = low_request["categoryScores"].clone();
        tool_evidence(&pool, &low_request, &low_output).await;
        rejected_without_changes(&pool, &low_value, "required rewrite missing").await;
        low_request["rewrite"] = rewrite.clone();
        low_output["rewrite"] = rewrite.clone();
        low_value["rewrite"] = rewrite.clone();
        low_value["rewrite"]["body"] = json!("Caller substituted text");
        tool_evidence(&pool, &low_request, &low_output).await;
        rejected_without_changes(&pool, &low_value, "caller rewrite text").await;
        low_value["rewrite"] = rewrite.clone();
        low_output["rewrite"]["hook"] = json!("Tool substituted text");
        tool_evidence(&pool, &low_request, &low_output).await;
        rejected_without_changes(&pool, &low_value, "tool rewrite text").await;
        let mut passing_rewrite = request.clone();
        passing_rewrite["rewrite"] = rewrite;
        tool_evidence(&pool, &passing_rewrite, &output).await;
        rejected_without_changes(&pool, &value, "rewrite on passing score").await;
        tool_evidence(&pool, &request, &output).await;

        // Even matching tool/context mutations cannot override the durable attempt.
        let mut changed_context = serde_json::from_str::<serde_json::Value>(&context).unwrap();
        changed_context["qualityRequest"]["body"] = json!("Not the attempted text");
        let mut changed_request = request.clone();
        changed_request["body"] = changed_context["qualityRequest"]["body"].clone();
        sqlx::query("UPDATE agent_runs SET input_context_json=?1 WHERE id=1")
            .bind(changed_context.to_string())
            .execute(&pool)
            .await
            .unwrap();
        tool_evidence(&pool, &changed_request, &output).await;
        rejected_without_changes(&pool, &value, "durable attempt text mismatch").await;
        sqlx::query("UPDATE agent_runs SET input_context_json=?1 WHERE id=1")
            .bind(&context)
            .execute(&pool)
            .await
            .unwrap();
        tool_evidence(&pool, &request, &output).await;
        let mut stale = value.clone();
        stale["contentRevision"] = json!(2);
        rejected_without_changes(&pool, &stale, "stale revision with valid evidence").await;
        sqlx::query(
            "UPDATE draft_quality_runs SET applied_rewrite_count=maximum_rewrite_count WHERE id=1",
        )
        .execute(&pool)
        .await
        .unwrap();
        low_output["rewrite"] = low_request["rewrite"].clone();
        tool_evidence(&pool, &low_request, &low_output).await;
        rejected_without_changes(&pool, &low_value, "rewrite budget exhausted").await;
        sqlx::query("UPDATE draft_quality_runs SET applied_rewrite_count=0 WHERE id=1")
            .execute(&pool)
            .await
            .unwrap();
        tool_evidence(&pool, &request, &output).await;
        let result = apply_with_pool(&pool, serde_json::from_value(value.clone()).unwrap())
            .await
            .unwrap();
        assert_eq!(result.status, "passed");
        assert_eq!(result.overall_score, 78);
        let row =
            sqlx::query("SELECT status,summary,final_score FROM draft_quality_runs WHERE id=1")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(row.get::<String, _>("status"), "passed");
        assert_eq!(
            row.get::<String, _>("summary"),
            value["summary"].as_str().unwrap()
        );
        assert_eq!(row.get::<i64, _>("final_score"), 78);
        assert_eq!(
            sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM draft_quality_category_scores WHERE attempt_id=1"
            )
            .fetch_one(&pool)
            .await
            .unwrap(),
            5
        );
        rejected_without_changes(&pool, &value, "replayed completed attempt").await;

        let next = claim_with_pool(
            &pool,
            ClaimInput {
                draft_variant_id: 1,
                provider_key: "dry_run".into(),
                model_name: "dry-run-local".into(),
            },
        )
        .await
        .unwrap();
        let next_context: String =
            sqlx::query_scalar("SELECT input_context_json FROM agent_runs WHERE id=?1")
                .bind(next.agent_run_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        let mut next_request = serde_json::from_str::<serde_json::Value>(&next_context).unwrap()
            ["qualityRequest"]
            .clone();
        next_request["categoryScores"] = low_request["categoryScores"].clone();
        next_request["rewrite"] = low_request["rewrite"].clone();
        low_output["qualityRunId"] = json!(next.quality_run_id);
        low_output["attemptId"] = json!(next.attempt_id);
        low_value["qualityRunId"] = json!(next.quality_run_id);
        low_value["attemptId"] = json!(next.attempt_id);
        low_value["agentRunId"] = json!(next.agent_run_id);
        sqlx::query(
            "UPDATE agent_runs SET status='completed',completed_at=datetime('now') WHERE id=?1",
        )
        .bind(next.agent_run_id)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO agent_tool_calls (agent_run_id,tool_name,status,input_json,output_json,completed_at) VALUES (?1,'score_draft_quality','completed',?2,?3,datetime('now'))")
            .bind(next.agent_run_id).bind(next_request.to_string()).bind(low_output.to_string()).execute(&pool).await.unwrap();
        let rewritten = apply_with_pool(&pool, serde_json::from_value(low_value.clone()).unwrap())
            .await
            .unwrap();
        assert_eq!(rewritten.status, "awaiting_audit");
        assert_eq!(rewritten.overall_score, 60);
        assert_eq!(rewritten.content_revision, 2);
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT body FROM draft_variants WHERE id=1")
                .fetch_one(&pool)
                .await
                .unwrap(),
            "Revised body"
        );
        rejected_without_changes(
            &pool,
            &low_value,
            "replayed rewrite with stale draft revision",
        )
        .await;
        pool.close().await;
    }

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
