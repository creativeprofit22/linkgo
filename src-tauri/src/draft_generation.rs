//! Native draft-generation lifecycle (port of `generateDraftVariants`,
//! `saveGeneratedDraft` and `dismissDraftGenerationRequest` in
//! `src/features/drafts/data.ts`, plus the linked-workflow helpers in
//! `src/workflows/draft-generation.ts`).
//!
//! The provider call stays in the renderer (as a drafter agent run). Every
//! write around it is native, one pinned `BEGIN IMMEDIATE` transaction each:
//! claim (request + linked draft step) → link agent run → record the
//! drafter's output | fail and block the step → save (draft + variants +
//! natively computed audits + workflow advance) or dismiss.
//!
//! The generated output is not trusted from the renderer: the settle command
//! reads the completed `draft_post` tool call itself and cross-checks it
//! against the durable request.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Row, SqliteConnection, SqlitePool};
use tauri::State;

use crate::db_transaction::{settle, Settlement};
use crate::draft_generation_links::{block_linked_draft_generation, LinkedDraftScope};
use crate::drafts_core::{eligible_draft_candidate, insert_draft, DraftInsert, DraftVariantInput};
use crate::js_text::{is_js_space, js_collapse_whitespace, js_trim, utf16_len, utf16_prefix};

const STORAGE_ERROR: &str = "Could not save draft generation change";
pub(crate) const ACTIVE_STEP_REQUEST_MESSAGE: &str =
    "This workflow draft step already has an active generation request";
use crate::agent_providers::AGENT_PROVIDER_KEYS as PROVIDERS;
const CONTENT_INTENTS: [&str; 4] = ["event", "launch", "idea", "community"];
const PLAYBOOKS: [&str; 5] = [
    "linkedin_writer",
    "linkedin_humanizer",
    "content_calendar",
    "linkedin_commenter",
    "campaign_analyst",
];
const RESUMABLE_RUN_STATUSES: [&str; 3] = ["running", "blocked", "failed"];
const CLAIMABLE_STEP_STATUSES: [&str; 4] = ["pending", "running", "blocked", "failed"];
const ELIGIBLE_CANDIDATE_STATUSES: [&str; 2] = ["new", "shortlisted"];

fn storage_error(_: sqlx::Error) -> String {
    STORAGE_ERROR.to_string()
}

fn positive(value: i64, label: &str) -> Result<(), String> {
    if value <= 0 {
        return Err(format!("{label} must be a positive integer"));
    }
    Ok(())
}

fn bounded(value: &str, max: usize, label: &str) -> Result<String, String> {
    let trimmed = js_trim(value);
    if utf16_len(trimmed) > max {
        return Err(format!("{label} must be at most {max} characters"));
    }
    Ok(trimmed.to_string())
}

/// Port of `truncateDraftReference`: collapse whitespace, cap with an
/// ellipsis at `max` UTF-16 units.
pub(crate) fn truncate_reference(value: &str, max: usize) -> String {
    let normalized = js_collapse_whitespace(value);
    if utf16_len(&normalized) <= max {
        return normalized;
    }
    let head = utf16_prefix(&normalized, max.saturating_sub(1)).trim_end_matches(is_js_space);
    format!("{head}…")
}

/// Port of `generatedHashtagsToDraftString`.
fn hashtags_to_draft_string(hashtags: &[String]) -> String {
    hashtags
        .iter()
        .map(|tag| js_trim(tag))
        .filter(|tag| !tag.is_empty())
        .map(|tag| {
            if tag.starts_with('#') {
                tag.to_string()
            } else {
                format!("#{tag}")
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

// ---------------------------------------------------- generated variants ---

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct GeneratedVariant {
    pub hook: String,
    pub body: String,
    pub cta: String,
    pub hashtags: Vec<String>,
}

/// Validates a variant like `draftPostVariantSchema` (trimmed, bounded,
/// non-empty hook/body, at most five 1–40 char hashtags) and returns the
/// trimmed form.
fn clean_generated_variant(variant: &GeneratedVariant) -> Result<GeneratedVariant, String> {
    let hook = js_trim(&variant.hook);
    let body = js_trim(&variant.body);
    let cta = js_trim(&variant.cta);
    if hook.is_empty() || utf16_len(hook) > 280 {
        return Err("Generated hook must be 1-280 characters".to_string());
    }
    if body.is_empty() || utf16_len(body) > 2500 {
        return Err("Generated body must be 1-2500 characters".to_string());
    }
    if utf16_len(cta) > 240 {
        return Err("Generated CTA must be at most 240 characters".to_string());
    }
    if variant.hashtags.len() > 5 {
        return Err("Generated variants may have at most 5 hashtags".to_string());
    }
    let mut hashtags = Vec::with_capacity(variant.hashtags.len());
    for tag in &variant.hashtags {
        let tag = js_trim(tag);
        if tag.is_empty() || utf16_len(tag) > 40 {
            return Err("Generated hashtags must be 1-40 characters".to_string());
        }
        hashtags.push(tag.to_string());
    }
    Ok(GeneratedVariant {
        hook: hook.to_string(),
        body: body.to_string(),
        cta: cta.to_string(),
        hashtags,
    })
}

// ------------------------------------------------ linked workflow steps ---

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct ClaimedDraftStep {
    pub workflow_run_id: i64,
    pub workflow_step_id: i64,
}

struct LinkedScopeRow {
    workflow_run_id: i64,
    run_status: String,
    workflow_step_id: i64,
    step_status: String,
}

async fn insert_workflow_event(
    connection: &mut SqliteConnection,
    workflow_run_id: i64,
    workflow_step_id: i64,
    event_type: &str,
    summary: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO workflow_events (workflow_run_id, workflow_step_id, event_type, summary)
         VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(workflow_run_id)
    .bind(workflow_step_id)
    .bind(event_type)
    .bind(summary)
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?;
    Ok(())
}

/// Port of `loadLinkedDraftScope`: the run's draft step, reached through a
/// surviving candidate artifact, with every eligibility rule re-checked.
async fn load_linked_scope(
    connection: &mut SqliteConnection,
    workflow_run_id: i64,
    campaign_id: i64,
    candidate_id: i64,
) -> Result<LinkedScopeRow, String> {
    let row = sqlx::query(
        "SELECT wr.id AS workflow_run_id, wr.campaign_id, wr.status AS run_status,
                wr.current_step_key, ws.id AS workflow_step_id, ws.status AS step_status,
                cp.status AS candidate_status, cp.relevance_score,
                cp.campaign_id AS candidate_campaign_id
         FROM workflow_runs wr
         INNER JOIN workflow_steps ws ON ws.workflow_run_id = wr.id AND ws.step_key = 'draft'
         INNER JOIN workflow_artifacts wa ON wa.workflow_run_id = wr.id
           AND wa.artifact_type = 'candidate_post' AND wa.artifact_id = ?1
         INNER JOIN candidate_posts cp ON cp.id = wa.artifact_id
         WHERE wr.id = ?2
         LIMIT 1",
    )
    .bind(candidate_id)
    .bind(workflow_run_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage_error)?
    .ok_or_else(|| "Workflow has no surviving artifact for this candidate".to_string())?;
    if row.get::<i64, _>("campaign_id") != campaign_id
        || row.get::<i64, _>("candidate_campaign_id") != campaign_id
    {
        return Err("Workflow and candidate must belong to the selected campaign".to_string());
    }
    if row.get::<String, _>("current_step_key") != "draft" {
        return Err("Workflow is not at its draft step".to_string());
    }
    let run_status: String = row.get("run_status");
    if !RESUMABLE_RUN_STATUSES.contains(&run_status.as_str()) {
        return Err("Workflow is not running or resumable".to_string());
    }
    let step_status: String = row.get("step_status");
    if !CLAIMABLE_STEP_STATUSES.contains(&step_status.as_str()) {
        return Err("Workflow draft step is not eligible for generation".to_string());
    }
    if row.get::<Option<i64>, _>("relevance_score").is_none() {
        return Err("Workflow candidate must have a relevance score".to_string());
    }
    if !ELIGIBLE_CANDIDATE_STATUSES.contains(&row.get::<String, _>("candidate_status").as_str()) {
        return Err("Workflow candidate is not eligible for drafting".to_string());
    }
    Ok(LinkedScopeRow {
        workflow_run_id: row.get("workflow_run_id"),
        run_status,
        workflow_step_id: row.get("workflow_step_id"),
        step_status,
    })
}

/// Port of `claimLinkedDraftGenerationInTransaction`.
async fn claim_linked_step(
    connection: &mut SqliteConnection,
    workflow_run_id: Option<i64>,
    campaign_id: i64,
    candidate_id: i64,
) -> Result<Option<ClaimedDraftStep>, String> {
    let Some(run_id) = workflow_run_id else {
        return Ok(None);
    };
    let scope = load_linked_scope(connection, run_id, campaign_id, candidate_id).await?;
    let (event_type, summary) = if scope.step_status == "pending" {
        (
            "step_started",
            "Draft variants started with a save-gated generation request",
        )
    } else {
        (
            "step_resumed",
            "Draft variants resumed with a new save-gated generation request",
        )
    };
    sqlx::query(
        "UPDATE workflow_steps
         SET status = 'running', output_summary = 'Waiting for operator to save generated variants',
             error_message = '', started_at = COALESCE(started_at, datetime('now')),
             completed_at = NULL, updated_at = datetime('now')
         WHERE id = ?1",
    )
    .bind(scope.workflow_step_id)
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?;
    sqlx::query(
        "UPDATE workflow_runs
         SET status = 'running', current_step_key = 'draft',
             started_at = COALESCE(started_at, datetime('now')), completed_at = NULL,
             updated_at = datetime('now')
         WHERE id = ?1",
    )
    .bind(scope.workflow_run_id)
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?;
    insert_workflow_event(
        connection,
        scope.workflow_run_id,
        scope.workflow_step_id,
        event_type,
        summary,
    )
    .await?;
    Ok(Some(ClaimedDraftStep {
        workflow_run_id: scope.workflow_run_id,
        workflow_step_id: scope.workflow_step_id,
    }))
}

/// Port of `validateLinkedDraftSaveInTransaction`.
async fn validate_linked_save(
    connection: &mut SqliteConnection,
    workflow_run_id: Option<i64>,
    workflow_step_id: Option<i64>,
    campaign_id: i64,
    candidate_id: i64,
) -> Result<Option<ClaimedDraftStep>, String> {
    let (run_id, step_id) = match (workflow_run_id, workflow_step_id) {
        (None, None) => return Ok(None),
        (Some(run_id), Some(step_id)) => (run_id, step_id),
        _ => return Err("Draft generation request has incomplete workflow provenance".to_string()),
    };
    let scope = load_linked_scope(connection, run_id, campaign_id, candidate_id).await?;
    if scope.workflow_step_id != step_id {
        return Err("Draft generation request points to a stale workflow step".to_string());
    }
    if scope.step_status != "running" || scope.run_status != "running" {
        return Err("Linked workflow draft step must still be running".to_string());
    }
    Ok(Some(ClaimedDraftStep {
        workflow_run_id: scope.workflow_run_id,
        workflow_step_id: scope.workflow_step_id,
    }))
}

/// Port of `completeLinkedDraftSaveInTransaction`.
async fn complete_linked_save(
    connection: &mut SqliteConnection,
    step: ClaimedDraftStep,
    draft_id: i64,
    content_intent: &str,
) -> Result<(), String> {
    let audit = sqlx::query(
        "SELECT id, status FROM workflow_steps
         WHERE workflow_run_id = ?1 AND step_key = 'audit' LIMIT 1",
    )
    .bind(step.workflow_run_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage_error)?;
    let audit_step_id = match audit {
        Some(row) if row.get::<String, _>("status") == "pending" => row.get::<i64, _>("id"),
        _ => return Err("Linked workflow audit step is not ready to advance".to_string()),
    };
    sqlx::query(
        "INSERT INTO workflow_artifacts
           (workflow_run_id, workflow_step_id, artifact_type, artifact_id, summary, updated_at)
         VALUES (?1, ?2, 'draft', ?3, ?4, datetime('now'))",
    )
    .bind(step.workflow_run_id)
    .bind(step.workflow_step_id)
    .bind(draft_id)
    .bind(format!("{content_intent} intent · saved draft"))
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?;
    let completed = sqlx::query(
        "UPDATE workflow_steps
         SET status = 'completed', output_summary = 'Generated variants saved by operator',
             error_message = '', completed_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?1 AND status = 'running'",
    )
    .bind(step.workflow_step_id)
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?;
    if completed.rows_affected() != 1 {
        return Err("Linked workflow draft step changed before save completed".to_string());
    }
    let started = sqlx::query(
        "UPDATE workflow_steps
         SET status = 'running', output_summary = '', error_message = '',
             started_at = COALESCE(started_at, datetime('now')), completed_at = NULL,
             updated_at = datetime('now')
         WHERE id = ?1 AND status = 'pending'",
    )
    .bind(audit_step_id)
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?;
    if started.rows_affected() != 1 {
        return Err("Linked workflow audit step changed before save completed".to_string());
    }
    sqlx::query(
        "UPDATE workflow_runs
         SET status = 'running', current_step_key = 'audit', completed_at = NULL,
             updated_at = datetime('now')
         WHERE id = ?1",
    )
    .bind(step.workflow_run_id)
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?;
    insert_workflow_event(
        connection,
        step.workflow_run_id,
        step.workflow_step_id,
        "step_completed",
        "Draft variants saved by operator",
    )
    .await?;
    insert_workflow_event(
        connection,
        step.workflow_run_id,
        audit_step_id,
        "step_started",
        "Audit drafts started",
    )
    .await
}

// ------------------------------------------------------------- commands ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClaimDraftGenerationInput {
    pub campaign_id: i64,
    pub candidate_id: i64,
    pub provider_key: String,
    #[serde(default)]
    pub model_name: String,
    pub playbook_key: String,
    pub variant_count: i64,
    pub content_intent: String,
    #[serde(default)]
    pub workflow_run_id: Option<i64>,
    #[serde(default)]
    pub angle: String,
    #[serde(default)]
    pub voice_notes: String,
}

/// What the renderer needs to build the drafter run's prompt context.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaimDraftGenerationResult {
    pub request_id: i64,
    pub campaign_id: i64,
    pub workflow_run_id: Option<i64>,
    pub candidate_context: Value,
}

/// Claims a generation: validates the candidate (and linked draft step),
/// inserts the pending request and returns bounded prompt context.
pub(crate) async fn claim_generation(
    pool: &SqlitePool,
    input: ClaimDraftGenerationInput,
) -> Result<ClaimDraftGenerationResult, String> {
    positive(input.campaign_id, "Campaign id")?;
    positive(input.candidate_id, "Candidate id")?;
    if let Some(run_id) = input.workflow_run_id {
        positive(run_id, "Workflow run id")?;
    }
    if !PROVIDERS.contains(&input.provider_key.as_str()) {
        return Err("Unsupported provider".to_string());
    }
    if !PLAYBOOKS.contains(&input.playbook_key.as_str()) {
        return Err("Unsupported playbook".to_string());
    }
    if !CONTENT_INTENTS.contains(&input.content_intent.as_str()) {
        return Err("Unsupported content intent".to_string());
    }
    if !(3..=5).contains(&input.variant_count) {
        return Err("Generate three to five variants".to_string());
    }
    let model_name = bounded(&input.model_name, 120, "Model name")?;
    let angle = bounded(&input.angle, 240, "Angle")?;
    let voice_notes = bounded(&input.voice_notes, 1000, "Voice notes")?;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let campaign_id =
                eligible_draft_candidate(connection, input.candidate_id, Some(input.campaign_id)).await?;
            let claimed =
                claim_linked_step(connection, input.workflow_run_id, campaign_id, input.candidate_id)
                    .await?;
            let request_id = sqlx::query(
                "INSERT INTO draft_generation_requests (
                    campaign_id, candidate_post_id, provider_key, model_name, playbook_key,
                    variant_count, content_intent, workflow_run_id, workflow_step_id, angle,
                    voice_notes, status, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'pending', datetime('now'))",
            )
            .bind(campaign_id)
            .bind(input.candidate_id)
            .bind(&input.provider_key)
            .bind(&model_name)
            .bind(&input.playbook_key)
            .bind(input.variant_count)
            .bind(&input.content_intent)
            .bind(claimed.map(|step| step.workflow_run_id))
            .bind(claimed.map(|step| step.workflow_step_id))
            .bind(&angle)
            .bind(&voice_notes)
            .execute(&mut *connection)
            .await
            .map_err(|error| {
                // One active (pending/generated) request per linked draft step.
                let unique = error
                    .as_database_error()
                    .is_some_and(|db| db.is_unique_violation());
                if unique {
                    ACTIVE_STEP_REQUEST_MESSAGE.to_string()
                } else {
                    STORAGE_ERROR.to_string()
                }
            })?
            .last_insert_rowid();
            let context = sqlx::query(
                "SELECT c.name AS campaign_name, c.product AS campaign_product,
                        c.audience AS campaign_audience, c.voice AS campaign_voice,
                        c.tone AS campaign_tone, cp.source_keyword, cp.score_reason,
                        cp.notes AS candidate_notes, cp.relevance_score,
                        tp.author_name, tp.content AS target_content
                 FROM candidate_posts cp
                 INNER JOIN campaigns c ON c.id = cp.campaign_id
                 INNER JOIN target_posts tp ON tp.id = cp.target_post_id
                 WHERE cp.id = ?1",
            )
            .bind(input.candidate_id)
            .fetch_one(&mut *connection)
            .await
            .map_err(storage_error)?;
            let text = |column: &str, max: usize| truncate_reference(&context.get::<String, _>(column), max);
            let candidate_context = serde_json::json!({
                "campaign": {
                    "name": text("campaign_name", 160),
                    "product": text("campaign_product", 500),
                    "audience": text("campaign_audience", 500),
                    "voice": text("campaign_voice", 500),
                    "tone": text("campaign_tone", 500),
                },
                "candidate": {
                    "id": input.candidate_id,
                    "sourceKeyword": text("source_keyword", 160),
                    "relevanceScore": context.get::<Option<i64>, _>("relevance_score"),
                    "scoreReason": text("score_reason", 500),
                    "notes": text("candidate_notes", 500),
                    "targetAuthorName": text("author_name", 160),
                    "targetContent": text("target_content", 2000),
                },
            });
            Ok(Settlement::Accepted(ClaimDraftGenerationResult {
                request_id,
                campaign_id,
                workflow_run_id: claimed.map(|step| step.workflow_run_id),
                candidate_context,
            }))
        })
    })
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LinkGenerationAgentRunInput {
    pub request_id: i64,
    pub agent_run_id: i64,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DraftGenerationMutationResult {
    pub id: i64,
}

/// Links the drafter agent run to its pending request (same campaign).
pub(crate) async fn link_agent_run(
    pool: &SqlitePool,
    input: LinkGenerationAgentRunInput,
) -> Result<DraftGenerationMutationResult, String> {
    positive(input.request_id, "Draft generation request id")?;
    positive(input.agent_run_id, "Agent run id")?;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let linked = sqlx::query(
                "UPDATE draft_generation_requests
                 SET agent_run_id = ?1, updated_at = datetime('now')
                 WHERE id = ?2 AND status = 'pending' AND agent_run_id IS NULL
                   AND campaign_id = (SELECT campaign_id FROM agent_runs WHERE id = ?1)",
            )
            .bind(input.agent_run_id)
            .bind(input.request_id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            if linked.rows_affected() != 1 {
                return Err(
                    "Draft generation request could not be linked to its agent run".to_string(),
                );
            }
            Ok(Settlement::Accepted(DraftGenerationMutationResult {
                id: input.request_id,
            }))
        })
    })
    .await
}

struct RequestRow {
    id: i64,
    campaign_id: i64,
    candidate_post_id: i64,
    agent_run_id: Option<i64>,
    provider_key: String,
    model_name: String,
    variant_count: i64,
    content_intent: String,
    angle: String,
    status: String,
    generated_variants_json: String,
    workflow_run_id: Option<i64>,
    workflow_step_id: Option<i64>,
}

async fn load_request(connection: &mut SqliteConnection, id: i64) -> Result<RequestRow, String> {
    let row = sqlx::query(
        "SELECT id, campaign_id, candidate_post_id, agent_run_id, provider_key, model_name,
                variant_count, content_intent, angle, status, generated_variants_json,
                workflow_run_id, workflow_step_id
         FROM draft_generation_requests WHERE id = ?1 LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage_error)?
    .ok_or_else(|| "Draft generation request was not found".to_string())?;
    Ok(RequestRow {
        id: row.get("id"),
        campaign_id: row.get("campaign_id"),
        candidate_post_id: row.get("candidate_post_id"),
        agent_run_id: row.get("agent_run_id"),
        provider_key: row.get("provider_key"),
        model_name: row.get("model_name"),
        variant_count: row.get("variant_count"),
        content_intent: row.get("content_intent"),
        angle: row.get("angle"),
        status: row.get("status"),
        generated_variants_json: row.get("generated_variants_json"),
        workflow_run_id: row.get("workflow_run_id"),
        workflow_step_id: row.get("workflow_step_id"),
    })
}

/// Port of `assertDraftToolMatchesRequest`: the tool input must match the
/// durable request and the output must preserve the input's variants.
fn check_drafter_tool(
    request: &RequestRow,
    input_json: &str,
    output_json: &str,
) -> Result<(String, Vec<GeneratedVariant>), String> {
    let mismatch = || "Drafter tool input did not match the durable request".to_string();
    let input: Value = serde_json::from_str(input_json).map_err(|_| mismatch())?;
    let output: Value = serde_json::from_str(output_json)
        .map_err(|_| "Drafter output is not valid JSON".to_string())?;
    let integer = |name: &str| input.get(name).and_then(Value::as_i64);
    if integer("draftGenerationRequestId") != Some(request.id)
        || integer("campaignId") != Some(request.campaign_id)
        || integer("candidatePostId") != Some(request.candidate_post_id)
        || integer("variantCount") != Some(request.variant_count)
        || input.get("contentIntent").and_then(Value::as_str)
            != Some(request.content_intent.as_str())
    {
        return Err(mismatch());
    }
    let input_variants: Vec<GeneratedVariant> =
        serde_json::from_value(input.get("variants").cloned().unwrap_or(Value::Null))
            .map_err(|_| mismatch())?;
    let output_variants: Vec<GeneratedVariant> =
        serde_json::from_value(output.get("variants").cloned().unwrap_or(Value::Null))
            .map_err(|_| "Drafter output did not contain valid variants".to_string())?;
    if i64::try_from(output_variants.len()).ok() != Some(request.variant_count) {
        return Err("Drafter output did not contain the requested variant count".to_string());
    }
    let cleaned_input = input_variants
        .iter()
        .map(clean_generated_variant)
        .collect::<Result<Vec<_>, _>>()?;
    let cleaned_output = output_variants
        .iter()
        .map(clean_generated_variant)
        .collect::<Result<Vec<_>, _>>()?;
    if cleaned_input != cleaned_output {
        return Err("Drafter output did not preserve provider-authored variants".to_string());
    }
    let summary = output
        .get("summary")
        .and_then(Value::as_str)
        .map(js_trim)
        .unwrap_or_default();
    if utf16_len(summary) > 1000 {
        return Err("Drafter summary must be at most 1000 characters".to_string());
    }
    Ok((summary.to_string(), cleaned_output))
}

async fn fail_request(
    connection: &mut SqliteConnection,
    request: &RequestRow,
    message: &str,
) -> Result<(), String> {
    let failed = sqlx::query(
        "UPDATE draft_generation_requests
         SET status = 'failed', error_message = ?1, updated_at = datetime('now')
         WHERE id = ?2 AND status = 'pending'",
    )
    .bind(message)
    .bind(request.id)
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?;
    if failed.rows_affected() == 1 {
        block_linked_draft_generation(
            connection,
            &LinkedDraftScope {
                workflow_run_id: request.workflow_run_id,
                workflow_step_id: request.workflow_step_id,
                campaign_id: request.campaign_id,
            },
            &format!("Draft generation failed: {message}"),
        )
        .await
        .map_err(storage_error)?;
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SettleGenerationInput {
    pub request_id: i64,
    /// `None` when the agent run finished; `Some` when the renderer-side
    /// provider/agent step failed before a result could be recorded.
    #[serde(default)]
    pub failure_message: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SettleGenerationResult {
    pub status: String,
    pub error_message: String,
}

/// Records the drafter's output on its pending request, or fails the
/// request and blocks the linked step. The output is read from the agent
/// run's own completed `draft_post` tool call, never from the renderer.
pub(crate) async fn settle_generation(
    pool: &SqlitePool,
    input: SettleGenerationInput,
) -> Result<SettleGenerationResult, String> {
    positive(input.request_id, "Draft generation request id")?;
    let failure = input
        .failure_message
        .as_deref()
        .map(|message| truncate_reference(message, 1000));
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let request = load_request(connection, input.request_id).await?;
            if request.status != "pending" {
                return Err("Draft generation request is no longer pending".to_string());
            }
            let outcome = match failure {
                Some(message) => Err(message),
                None => match request.agent_run_id {
                    None => Err("Draft generation request has no agent run".to_string()),
                    Some(agent_run_id) => {
                        let rows = sqlx::query(
                            "SELECT input_json, output_json FROM agent_tool_calls
                             WHERE agent_run_id = ?1 AND tool_name = 'draft_post' AND status = 'completed'
                             ORDER BY id DESC LIMIT 2",
                        )
                        .bind(agent_run_id)
                        .fetch_all(&mut *connection)
                        .await
                        .map_err(storage_error)?;
                        match rows.as_slice() {
                            [row] => check_drafter_tool(
                                &request,
                                &row.get::<String, _>("input_json"),
                                &row.get::<String, _>("output_json"),
                            ),
                            _ => Err("Drafter must return exactly one completed draft_post call".to_string()),
                        }
                    }
                },
            };
            match outcome {
                Ok((summary, variants)) => {
                    let variants_json =
                        serde_json::to_string(&variants).map_err(|_| STORAGE_ERROR.to_string())?;
                    let generated = sqlx::query(
                        "UPDATE draft_generation_requests
                         SET status = 'generated', summary = ?1, generated_variants_json = ?2,
                             error_message = '', updated_at = datetime('now')
                         WHERE id = ?3 AND status = 'pending'",
                    )
                    .bind(&summary)
                    .bind(&variants_json)
                    .bind(request.id)
                    .execute(&mut *connection)
                    .await
                    .map_err(storage_error)?;
                    if generated.rows_affected() != 1 {
                        return Err("Draft generation request is no longer pending".to_string());
                    }
                    Ok(Settlement::Accepted(SettleGenerationResult {
                        status: "generated".to_string(),
                        error_message: String::new(),
                    }))
                }
                Err(message) => {
                    let message = truncate_reference(&message, 1000);
                    fail_request(connection, &request, &message).await?;
                    Ok(Settlement::Accepted(SettleGenerationResult {
                        status: "failed".to_string(),
                        error_message: message,
                    }))
                }
            }
        })
    })
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DraftGenerationIdInput {
    pub id: i64,
}

/// Port of `saveGeneratedDraft`: creates the draft from the stored generated
/// variants (audits computed natively) and advances a linked workflow.
pub(crate) async fn save_generated(
    pool: &SqlitePool,
    input: DraftGenerationIdInput,
) -> Result<DraftGenerationMutationResult, String> {
    positive(input.id, "Draft generation request id")?;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let request = load_request(connection, input.id).await?;
            if request.status != "generated" {
                return Err("Only generated draft requests can be saved".to_string());
            }
            eligible_draft_candidate(
                connection,
                request.candidate_post_id,
                Some(request.campaign_id),
            )
            .await?;
            let variants: Vec<GeneratedVariant> =
                serde_json::from_str(&request.generated_variants_json).unwrap_or_default();
            let variants = variants
                .iter()
                .map(clean_generated_variant)
                .collect::<Result<Vec<_>, _>>()
                .unwrap_or_default();
            if i64::try_from(variants.len()).ok() != Some(request.variant_count) {
                return Err(
                    "Generated request does not have its exact requested variants".to_string(),
                );
            }
            let linked = validate_linked_save(
                connection,
                request.workflow_run_id,
                request.workflow_step_id,
                request.campaign_id,
                request.candidate_post_id,
            )
            .await?;
            let draft_variants: Vec<DraftVariantInput> = variants
                .iter()
                .map(|variant| DraftVariantInput {
                    hook: variant.hook.clone(),
                    body: variant.body.clone(),
                    cta: variant.cta.clone(),
                    hashtags: hashtags_to_draft_string(&variant.hashtags),
                })
                .collect();
            let model = if request.model_name.is_empty() {
                "default"
            } else {
                request.model_name.as_str()
            };
            let notes = format!(
                "Generated by {}/{} from request #{}.",
                request.provider_key, model, request.id
            );
            let draft_id = insert_draft(
                connection,
                &DraftInsert {
                    campaign_id: request.campaign_id,
                    candidate_id: request.candidate_post_id,
                    angle: &request.angle,
                    notes: &notes,
                    content_intent: &request.content_intent,
                    variants: &draft_variants,
                },
            )
            .await?;
            let saved = sqlx::query(
                "UPDATE draft_generation_requests
                 SET status = 'saved', created_draft_id = ?1, updated_at = datetime('now')
                 WHERE id = ?2 AND status = 'generated'",
            )
            .bind(draft_id)
            .bind(request.id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            if saved.rows_affected() != 1 {
                return Err("Draft generation request is no longer saveable".to_string());
            }
            if let Some(step) = linked {
                complete_linked_save(connection, step, draft_id, &request.content_intent).await?;
            }
            Ok(Settlement::Accepted(DraftGenerationMutationResult {
                id: draft_id,
            }))
        })
    })
    .await
}

/// Port of `dismissDraftGenerationRequest`.
pub(crate) async fn dismiss(
    pool: &SqlitePool,
    input: DraftGenerationIdInput,
) -> Result<DraftGenerationMutationResult, String> {
    positive(input.id, "Draft generation request id")?;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let request = load_request(connection, input.id).await?;
            let reason = if request.status == "pending" {
                format!(
                    "Draft generation request #{} was dismissed after an interrupted provider call. Generate variants again to retry.",
                    request.id
                )
            } else {
                "Draft generation dismissed by operator".to_string()
            };
            if let (true, Some(agent_run_id)) = (request.status == "pending", request.agent_run_id) {
                let cancelled = sqlx::query(
                    "UPDATE agent_runs
                     SET status = 'cancelled', error_message = ?1,
                         completed_at = COALESCE(completed_at, datetime('now')), updated_at = datetime('now')
                     WHERE id = ?2 AND status IN ('queued', 'running')",
                )
                .bind(&reason)
                .bind(agent_run_id)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
                if cancelled.rows_affected() == 1 {
                    sqlx::query("DELETE FROM agent_run_approval_checkpoints WHERE agent_run_id = ?1")
                        .bind(agent_run_id)
                        .execute(&mut *connection)
                        .await
                        .map_err(storage_error)?;
                    sqlx::query(
                        "INSERT INTO agent_run_events (agent_run_id, event_type, summary)
                         VALUES (?1, 'run_cancelled', ?2)",
                    )
                    .bind(agent_run_id)
                    .bind(&reason)
                    .execute(&mut *connection)
                    .await
                    .map_err(storage_error)?;
                }
            }
            let dismissed = sqlx::query(
                "UPDATE draft_generation_requests
                 SET status = 'dismissed',
                     error_message = CASE WHEN status = 'pending' THEN ?1 ELSE error_message END,
                     updated_at = datetime('now')
                 WHERE id = ?2 AND status IN ('generated', 'failed', 'pending')",
            )
            .bind(&reason)
            .bind(request.id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            if dismissed.rows_affected() == 1 && request.status != "failed" {
                block_linked_draft_generation(
                    connection,
                    &LinkedDraftScope {
                        workflow_run_id: request.workflow_run_id,
                        workflow_step_id: request.workflow_step_id,
                        campaign_id: request.campaign_id,
                    },
                    &reason,
                )
                .await
                .map_err(storage_error)?;
            }
            Ok(Settlement::Accepted(DraftGenerationMutationResult { id: request.id }))
        })
    })
    .await
}

#[tauri::command]
pub async fn linkgo_draft_generation_claim(
    pool: State<'_, SqlitePool>,
    input: ClaimDraftGenerationInput,
) -> Result<ClaimDraftGenerationResult, String> {
    claim_generation(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_draft_generation_link_agent_run(
    pool: State<'_, SqlitePool>,
    input: LinkGenerationAgentRunInput,
) -> Result<DraftGenerationMutationResult, String> {
    link_agent_run(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_draft_generation_settle(
    pool: State<'_, SqlitePool>,
    input: SettleGenerationInput,
) -> Result<SettleGenerationResult, String> {
    settle_generation(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_draft_generation_save(
    pool: State<'_, SqlitePool>,
    input: DraftGenerationIdInput,
) -> Result<DraftGenerationMutationResult, String> {
    save_generated(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_draft_generation_dismiss(
    pool: State<'_, SqlitePool>,
    input: DraftGenerationIdInput,
) -> Result<DraftGenerationMutationResult, String> {
    dismiss(pool.inner(), input).await
}

#[cfg(test)]
#[path = "draft_generation_tests.rs"]
mod tests;
