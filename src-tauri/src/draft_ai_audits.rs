//! Native draft AI-audit lifecycle (port of the audit-run functions in
//! `src/features/drafts/data.ts`).
//!
//! The provider call stays in the renderer as an auditor agent run. Every
//! audit-run write is native, one pinned `BEGIN IMMEDIATE` transaction each:
//! start (revision-current check + reservation) → link agent run →
//! complete | fail, plus startup reconciliation.
//!
//! Completion never trusts caller-supplied findings: native reads the
//! auditor's completed `audit_post` tool call from storage and checks it
//! against the durable request (campaign, variant, revision, audit run and
//! the canonical text rebuilt from the stored variant).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Row, SqliteConnection, SqlitePool};
use tauri::State;

use crate::agent_providers::AGENT_PROVIDER_KEYS;
use crate::agent_run_store::{fail_active_agent as fail_shared_agent, FailedAgent};
use crate::db_transaction::{settle, Settlement};
use crate::js_text::{js_trim, utf16_len, utf16_prefix};

const STORAGE_ERROR: &str = "Could not save draft AI audit change";
pub(crate) const ACTIVE_AUDIT_MESSAGE: &str =
    "An active AI audit already exists for this draft revision";
pub(crate) const STALE_START_MESSAGE: &str =
    "Draft AI audit must start against the current content revision";
pub(crate) const STALE_COMPLETE_MESSAGE: &str =
    "Draft content changed before the AI audit completed";
pub(crate) const MISMATCHED_OUTPUT_MESSAGE: &str =
    "Auditor tool input did not match the durable audit request";
pub(crate) const PRESERVED_FINDINGS_MESSAGE: &str =
    "Auditor output did not preserve provider-authored findings";
pub(crate) const EMPTY_TEXT_MESSAGE: &str =
    "Draft AI audit text must contain at least one non-whitespace character";
const MAX_TEXT_UTF16: usize = 4306;
const MAX_MESSAGE_UTF16: usize = 1000;
/// Mirrors `AUDIT_POST_FINDING_KEYS`; also the stored display order.
pub(crate) const RULE_KEYS: [&str; 6] = [
    "hook",
    "specificity",
    "generic_language",
    "authenticity",
    "clarity",
    "safety",
];
const SEVERITIES: [&str; 3] = ["pass", "warning", "block"];
/// Mirrors `DRAFT_AI_AUDIT_RESERVATION_STALE_MINUTES` /
/// `DRAFT_AI_AUDIT_EXECUTION_STALE_MINUTES`.
pub(crate) const RESERVATION_STALE_MINUTES: i64 = 5;
pub(crate) const EXECUTION_STALE_MINUTES: i64 = 30;

fn storage_error(_: sqlx::Error) -> String {
    STORAGE_ERROR.to_string()
}

fn positive(value: i64, label: &str) -> Result<(), String> {
    if value <= 0 {
        return Err(format!("{label} must be a positive integer"));
    }
    Ok(())
}

/// Port of `boundDraftAiAuditError`: trimmed, non-empty, at most 1000 UTF-16.
pub(crate) fn bound_error(message: &str) -> String {
    let trimmed = js_trim(message);
    let message = if trimmed.is_empty() {
        "Draft AI audit failed"
    } else {
        trimmed
    };
    utf16_prefix(message, MAX_MESSAGE_UTF16).to_string()
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct DraftAiAuditRun {
    pub id: i64,
    pub draft_variant_id: i64,
    pub content_revision: i64,
    pub agent_run_id: Option<i64>,
    pub workflow_step_execution_id: Option<i64>,
    pub provider_key: String,
    pub model_name: String,
    pub status: String,
    pub summary: String,
    pub error_message: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

async fn load_run(connection: &mut SqliteConnection, id: i64) -> Result<DraftAiAuditRun, String> {
    let row = sqlx::query(
        "SELECT id, draft_variant_id, content_revision, agent_run_id, workflow_step_execution_id,
                provider_key, model_name, status, summary, error_message, started_at,
                completed_at, created_at, updated_at
         FROM draft_ai_audit_runs WHERE id = ?1 LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage_error)?
    .ok_or_else(|| "Draft AI audit run was not found".to_string())?;
    Ok(DraftAiAuditRun {
        id: row.get("id"),
        draft_variant_id: row.get("draft_variant_id"),
        content_revision: row.get("content_revision"),
        agent_run_id: row.get("agent_run_id"),
        workflow_step_execution_id: row.get("workflow_step_execution_id"),
        provider_key: row.get("provider_key"),
        model_name: row.get("model_name"),
        status: row.get("status"),
        summary: row.get("summary"),
        error_message: row.get("error_message"),
        started_at: row.get("started_at"),
        completed_at: row.get("completed_at"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

/// The stored variant as the auditor sees it.
pub(crate) struct AuditSnapshot {
    pub campaign_id: i64,
    pub content_revision: i64,
    pub text: String,
}

/// Port of `loadDraftAiAuditSnapshot` + `parseCanonicalDraftAuditText`:
/// the canonical text is the four stored segments joined by blank lines.
pub(crate) async fn load_snapshot(
    connection: &mut SqliteConnection,
    draft_variant_id: i64,
) -> Result<AuditSnapshot, String> {
    let row = sqlx::query(
        "SELECT d.campaign_id, dv.content_revision, dv.hook, dv.body, dv.cta, dv.hashtags,
                c.status AS campaign_status
         FROM draft_variants dv
         INNER JOIN drafts d ON d.id = dv.draft_id
         INNER JOIN campaigns c ON c.id = d.campaign_id
         WHERE dv.id = ?1 LIMIT 1",
    )
    .bind(draft_variant_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(storage_error)?
    .ok_or_else(|| "Draft variant was not found".to_string())?;
    if row.get::<String, _>("campaign_status") == "archived" {
        return Err("Campaign is archived".to_string());
    }
    let segments: [String; 4] = [
        row.get("hook"),
        row.get("body"),
        row.get("cta"),
        row.get("hashtags"),
    ];
    let text = segments.join("\n\n");
    if js_trim(&text).is_empty() {
        return Err(EMPTY_TEXT_MESSAGE.to_string());
    }
    if utf16_len(&text) > MAX_TEXT_UTF16 {
        return Err(format!(
            "Draft AI audit text must not exceed {MAX_TEXT_UTF16} characters"
        ));
    }
    Ok(AuditSnapshot {
        campaign_id: row.get("campaign_id"),
        content_revision: row.get("content_revision"),
        text,
    })
}

/// Recomputes the variant's deterministic audit from its stored text.
async fn refresh_deterministic_audit(
    connection: &mut SqliteConnection,
    draft_variant_id: i64,
) -> Result<(), String> {
    let row = sqlx::query("SELECT hook, body, cta, hashtags FROM draft_variants WHERE id = ?1")
        .bind(draft_variant_id)
        .fetch_optional(&mut *connection)
        .await
        .map_err(storage_error)?
        .ok_or_else(|| "Draft variant was not found".to_string())?;
    let variant = crate::drafts_core::DraftVariantInput {
        hook: row.get("hook"),
        body: row.get("body"),
        cta: row.get("cta"),
        hashtags: row.get("hashtags"),
    };
    crate::drafts_core::write_deterministic_audit(connection, draft_variant_id, &variant).await
}

// ------------------------------------------------------------------ start ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartDraftAiAuditInput {
    pub draft_variant_id: i64,
    /// Expected revision; omitted means "the current revision" (the audit
    /// panel only knows the variant). When given, a stale revision rejects.
    #[serde(default)]
    pub content_revision: Option<i64>,
    #[serde(default)]
    pub agent_run_id: Option<i64>,
    #[serde(default = "default_provider")]
    pub provider_key: String,
    #[serde(default)]
    pub model_name: String,
}

fn default_provider() -> String {
    "dry_run".to_string()
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartDraftAiAuditOutput {
    pub run: DraftAiAuditRun,
    pub campaign_id: i64,
    pub text: String,
}

pub(crate) async fn start(
    pool: &SqlitePool,
    input: StartDraftAiAuditInput,
) -> Result<StartDraftAiAuditOutput, String> {
    positive(input.draft_variant_id, "Draft variant id")?;
    if let Some(revision) = input.content_revision {
        positive(revision, "Content revision")?;
    }
    if let Some(id) = input.agent_run_id {
        positive(id, "Agent run id")?;
    }
    if !AGENT_PROVIDER_KEYS.contains(&input.provider_key.as_str()) {
        return Err("Unsupported provider".to_string());
    }
    let model_name = js_trim(&input.model_name).to_string();
    if utf16_len(&model_name) > 120 {
        return Err("Model name must be at most 120 characters".to_string());
    }
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let snapshot = load_snapshot(connection, input.draft_variant_id).await?;
            if input
                .content_revision
                .is_some_and(|expected| expected != snapshot.content_revision)
            {
                return Err(STALE_START_MESSAGE.to_string());
            }
            let revision = snapshot.content_revision;
            let active: Option<i64> = sqlx::query_scalar(
                "SELECT id FROM draft_ai_audit_runs
                 WHERE draft_variant_id = ?1 AND content_revision = ?2
                   AND status IN ('pending', 'running')
                 LIMIT 1",
            )
            .bind(input.draft_variant_id)
            .bind(revision)
            .fetch_optional(&mut *connection)
            .await
            .map_err(storage_error)?;
            if active.is_some() {
                return Err(ACTIVE_AUDIT_MESSAGE.to_string());
            }
            if let Some(agent_run_id) = input.agent_run_id {
                assert_auditor_agent(connection, agent_run_id, snapshot.campaign_id).await?;
            }
            let id = sqlx::query(
                "INSERT INTO draft_ai_audit_runs
                   (draft_variant_id, content_revision, agent_run_id, provider_key, model_name,
                    status, started_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'running', datetime('now'), datetime('now'))",
            )
            .bind(input.draft_variant_id)
            .bind(revision)
            .bind(input.agent_run_id)
            .bind(&input.provider_key)
            .bind(&model_name)
            .execute(&mut *connection)
            .await
            .map_err(|error| {
                // The active-revision unique index is the race guard.
                if error
                    .as_database_error()
                    .is_some_and(|db| db.is_unique_violation())
                {
                    ACTIVE_AUDIT_MESSAGE.to_string()
                } else {
                    STORAGE_ERROR.to_string()
                }
            })?
            .last_insert_rowid();
            let run = load_run(connection, id).await?;
            Ok(Settlement::Accepted(StartDraftAiAuditOutput {
                run,
                campaign_id: snapshot.campaign_id,
                text: snapshot.text,
            }))
        })
    })
    .await
}

async fn assert_auditor_agent(
    connection: &mut SqliteConnection,
    agent_run_id: i64,
    campaign_id: i64,
) -> Result<(), String> {
    let row = sqlx::query("SELECT campaign_id, agent_role FROM agent_runs WHERE id = ?1")
        .bind(agent_run_id)
        .fetch_optional(&mut *connection)
        .await
        .map_err(storage_error)?
        .ok_or_else(|| "Agent run was not found".to_string())?;
    if row.get::<i64, _>("campaign_id") != campaign_id
        || row.get::<String, _>("agent_role") != "auditor"
    {
        return Err("Agent run is not an auditor for this campaign".to_string());
    }
    Ok(())
}

// ------------------------------------------------------------------- link ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LinkDraftAiAuditAgentInput {
    pub audit_run_id: i64,
    pub agent_run_id: i64,
}

pub(crate) async fn link_agent_run(
    pool: &SqlitePool,
    input: LinkDraftAiAuditAgentInput,
) -> Result<DraftAiAuditRun, String> {
    positive(input.audit_run_id, "Audit run id")?;
    positive(input.agent_run_id, "Agent run id")?;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let run = load_run(connection, input.audit_run_id).await?;
            let snapshot = load_snapshot(connection, run.draft_variant_id).await?;
            assert_auditor_agent(connection, input.agent_run_id, snapshot.campaign_id).await?;
            let linked = sqlx::query(
                "UPDATE draft_ai_audit_runs SET agent_run_id = ?1, updated_at = datetime('now')
                 WHERE id = ?2 AND agent_run_id IS NULL AND status IN ('pending', 'running')",
            )
            .bind(input.agent_run_id)
            .bind(input.audit_run_id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            if linked.rows_affected() != 1 {
                return Err("Draft AI audit run could not be linked to its agent run".to_string());
            }
            Ok(Settlement::Accepted(
                load_run(connection, input.audit_run_id).await?,
            ))
        })
    })
    .await
}

// --------------------------------------------------------------- complete ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompleteDraftAiAuditInput {
    pub audit_run_id: i64,
    pub draft_variant_id: i64,
    pub content_revision: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Finding {
    pub rule_key: String,
    pub severity: String,
    pub message: String,
}

/// Validates auditor findings like `auditPostFindingsSchema`: exactly one
/// finding per required category, known severities, 1–500 char messages.
pub(crate) fn validate_findings(value: &Value) -> Result<Vec<Finding>, String> {
    let items = value
        .as_array()
        .ok_or_else(|| "Auditor findings must be a list".to_string())?;
    let mut findings = Vec::with_capacity(items.len());
    for item in items {
        let object = item
            .as_object()
            .filter(|object| object.len() == 3)
            .ok_or_else(|| "Auditor finding has an unexpected shape".to_string())?;
        let field = |name: &str| object.get(name).and_then(Value::as_str);
        let (Some(rule_key), Some(severity), Some(message)) =
            (field("ruleKey"), field("severity"), field("message"))
        else {
            return Err("Auditor finding has an unexpected shape".to_string());
        };
        if !RULE_KEYS.contains(&rule_key) || !SEVERITIES.contains(&severity) {
            return Err("Auditor finding has an unsupported category or severity".to_string());
        }
        let message = js_trim(message);
        if message.is_empty() || utf16_len(message) > 500 {
            return Err("Auditor finding messages must be 1-500 characters".to_string());
        }
        findings.push(Finding {
            rule_key: rule_key.to_string(),
            severity: severity.to_string(),
            message: message.to_string(),
        });
    }
    let distinct: std::collections::BTreeSet<&str> =
        findings.iter().map(|f| f.rule_key.as_str()).collect();
    if findings.len() != RULE_KEYS.len() || distinct.len() != RULE_KEYS.len() {
        return Err(
            "findings must contain exactly one entry for each required audit category".to_string(),
        );
    }
    findings.sort_by_key(|f| RULE_KEYS.iter().position(|k| *k == f.rule_key));
    Ok(findings)
}

/// The durable request an auditor's output must answer.
pub(crate) struct AuditRequest<'a> {
    pub audit_run_id: i64,
    pub agent_run_id: i64,
    pub draft_variant_id: i64,
    pub content_revision: i64,
    pub snapshot: &'a AuditSnapshot,
}

async fn consume_auditor_output(
    connection: &mut SqliteConnection,
    run: &DraftAiAuditRun,
    snapshot: &AuditSnapshot,
) -> Result<(String, Vec<Finding>), String> {
    let agent_run_id = run
        .agent_run_id
        .ok_or_else(|| "Draft AI audit run has no auditor agent run".to_string())?;
    read_auditor_output(
        connection,
        &AuditRequest {
            audit_run_id: run.id,
            agent_run_id,
            draft_variant_id: run.draft_variant_id,
            content_revision: run.content_revision,
            snapshot,
        },
    )
    .await
}

/// Port of `consumeCompletedDraftAiAuditOutput`: the auditor agent must be
/// completed with exactly one completed `audit_post` call whose input
/// matches the durable request and whose output preserves the
/// provider-authored findings. Returns (summary, findings).
pub(crate) async fn read_auditor_output(
    connection: &mut SqliteConnection,
    request: &AuditRequest<'_>,
) -> Result<(String, Vec<Finding>), String> {
    let agent_run_id = request.agent_run_id;
    let snapshot = request.snapshot;
    let agent = sqlx::query("SELECT status, error_message FROM agent_runs WHERE id = ?1")
        .bind(agent_run_id)
        .fetch_optional(&mut *connection)
        .await
        .map_err(storage_error)?
        .ok_or_else(|| "Auditor agent run was not found".to_string())?;
    if agent.get::<String, _>("status") != "completed" {
        let reason: String = agent.get("error_message");
        return Err(if js_trim(&reason).is_empty() {
            "Auditor agent did not complete".to_string()
        } else {
            bound_error(&reason)
        });
    }
    let calls = sqlx::query(
        "SELECT tool_name, status, input_json, output_json FROM agent_tool_calls
         WHERE agent_run_id = ?1 ORDER BY id ASC",
    )
    .bind(agent_run_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(storage_error)?;
    let completed: Vec<_> = calls
        .iter()
        .filter(|call| {
            call.get::<String, _>("tool_name") == "audit_post"
                && call.get::<String, _>("status") == "completed"
        })
        .collect();
    let [call] = completed.as_slice() else {
        let reason: String = agent.get("error_message");
        return Err(if completed.is_empty() && !reason.trim().is_empty() {
            bound_error(&reason)
        } else {
            "Auditor must return exactly one completed audit_post call".to_string()
        });
    };
    let input: Value = serde_json::from_str(&call.get::<String, _>("input_json"))
        .map_err(|_| MISMATCHED_OUTPUT_MESSAGE.to_string())?;
    let integer = |name: &str| input.get(name).and_then(Value::as_i64);
    if integer("campaignId") != Some(snapshot.campaign_id)
        || integer("draftVariantId") != Some(request.draft_variant_id)
        || integer("contentRevision") != Some(request.content_revision)
        || integer("auditRunId") != Some(request.audit_run_id)
        || input.get("text").and_then(Value::as_str) != Some(snapshot.text.as_str())
    {
        return Err(MISMATCHED_OUTPUT_MESSAGE.to_string());
    }
    // The provider authors findings in the tool input; the tool output must
    // preserve them verbatim (as `consumeCompletedDraftAiAuditOutput` required).
    let authored = input.get("findings").unwrap_or(&Value::Null);
    let findings = validate_findings(authored)?;
    let output: Value =
        serde_json::from_str(&call.get::<String, _>("output_json")).unwrap_or(Value::Null);
    if output.get("findings") != Some(authored) {
        return Err(PRESERVED_FINDINGS_MESSAGE.to_string());
    }
    let summary = output
        .get("summary")
        .and_then(Value::as_str)
        .map(|s| utf16_prefix(js_trim(s), MAX_MESSAGE_UTF16).to_string())
        .unwrap_or_default();
    Ok((summary, findings))
}

pub(crate) async fn complete(
    pool: &SqlitePool,
    input: CompleteDraftAiAuditInput,
) -> Result<DraftAiAuditRun, String> {
    positive(input.audit_run_id, "Audit run id")?;
    positive(input.draft_variant_id, "Draft variant id")?;
    positive(input.content_revision, "Content revision")?;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let run = load_run(connection, input.audit_run_id).await?;
            if run.draft_variant_id != input.draft_variant_id
                || run.content_revision != input.content_revision
            {
                return Err("Draft AI audit run does not match this draft revision".to_string());
            }
            if !matches!(run.status.as_str(), "pending" | "running") {
                return Err("Draft AI audit run is not active".to_string());
            }
            let snapshot = load_snapshot(connection, run.draft_variant_id).await?;
            if snapshot.content_revision != run.content_revision {
                return Err(STALE_COMPLETE_MESSAGE.to_string());
            }
            let (summary, findings) = consume_auditor_output(connection, &run, &snapshot).await?;
            // Refresh deterministic evidence in the same revision-checked
            // transaction, so historical drafts and native rewrites also get a
            // verifiable rule audit (as the renderer completion did).
            refresh_deterministic_audit(connection, run.draft_variant_id).await?;
            for finding in &findings {
                sqlx::query(
                    "INSERT INTO draft_ai_audit_findings (audit_run_id, rule_key, severity, message)
                     VALUES (?1, ?2, ?3, ?4)",
                )
                .bind(run.id)
                .bind(&finding.rule_key)
                .bind(&finding.severity)
                .bind(&finding.message)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
            }
            let completed = sqlx::query(
                "UPDATE draft_ai_audit_runs
                 SET status = 'completed', summary = ?1, error_message = '',
                     completed_at = datetime('now'), updated_at = datetime('now')
                 WHERE id = ?2 AND status IN ('pending', 'running')",
            )
            .bind(&summary)
            .bind(run.id)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            if completed.rows_affected() != 1 {
                return Err("Draft AI audit run is not active".to_string());
            }
            Ok(Settlement::Accepted(load_run(connection, run.id).await?))
        })
    })
    .await
}

// ------------------------------------------------------------------- fail ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FailDraftAiAuditInput {
    pub audit_run_id: i64,
    pub draft_variant_id: i64,
    pub content_revision: i64,
    pub error_message: String,
    #[serde(default)]
    pub agent_run_id: Option<i64>,
}

/// Fails a linked auditor agent through the shared agent primitive, keeping
/// this command's storage error contract.
async fn fail_active_agent(
    connection: &mut SqliteConnection,
    agent_run_id: i64,
    error_message: &str,
) -> Result<FailedAgent, String> {
    fail_shared_agent(connection, agent_run_id, error_message)
        .await
        .map_err(|_| STORAGE_ERROR.to_string())
}

/// Shared audit-run failure primitive: fails a `pending`/`running` audit run
/// inside the caller's transaction. Returns whether a row was settled; terminal
/// runs are untouched so repeated settlement is idempotent.
pub(crate) async fn fail_active_audit_run(
    connection: &mut SqliteConnection,
    audit_run_id: i64,
    error_message: &str,
) -> Result<bool, String> {
    let failed = sqlx::query(
        "UPDATE draft_ai_audit_runs
         SET status = 'failed', error_message = ?1, completed_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?2 AND status IN ('pending', 'running')",
    )
    .bind(error_message)
    .bind(audit_run_id)
    .execute(&mut *connection)
    .await
    .map_err(storage_error)?;
    Ok(failed.rows_affected() == 1)
}

pub(crate) async fn fail(
    pool: &SqlitePool,
    input: FailDraftAiAuditInput,
) -> Result<DraftAiAuditRun, String> {
    positive(input.audit_run_id, "Audit run id")?;
    positive(input.draft_variant_id, "Draft variant id")?;
    positive(input.content_revision, "Content revision")?;
    let error_message = js_trim(&input.error_message).to_string();
    if error_message.is_empty() || utf16_len(&error_message) > MAX_MESSAGE_UTF16 {
        return Err("Error message must be 1-1000 characters".to_string());
    }
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let run = load_run(connection, input.audit_run_id).await?;
            if run.draft_variant_id != input.draft_variant_id
                || run.content_revision != input.content_revision
            {
                return Err("Draft AI audit run does not match this draft revision".to_string());
            }
            if !fail_active_audit_run(connection, run.id, &error_message).await? {
                return Err("Draft AI audit run is not active".to_string());
            }
            if let Some(agent_run_id) = run.agent_run_id.or(input.agent_run_id) {
                fail_active_agent(connection, agent_run_id, &error_message).await?;
            }
            Ok(Settlement::Accepted(load_run(connection, run.id).await?))
        })
    })
    .await
}

// -------------------------------------------------------------- reconcile ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReconcileDraftAiAuditInput {
    #[serde(default = "default_limit")]
    pub max_audit_runs: i64,
    #[serde(default = "default_limit")]
    pub max_orphan_agent_runs: i64,
}

fn default_limit() -> i64 {
    25
}

#[derive(Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileDraftAiAuditOutput {
    pub failed_audit_run_ids: Vec<i64>,
    pub failed_agent_run_ids: Vec<i64>,
    pub cleared_approval_checkpoint_count: i64,
}

/// Port of the standalone part of `reconcileDraftAiAuditLifecycle`
/// (planner-linked audits are reconciled by `planner_draft_audits`):
/// fails reservations never linked to an agent within
/// `RESERVATION_STALE_MINUTES`, executions with no lifecycle activity within
/// `EXECUTION_STALE_MINUTES` (and their auditor agents), then standalone
/// auditor agents never linked to any audit run.
pub(crate) async fn reconcile(
    pool: &SqlitePool,
    input: ReconcileDraftAiAuditInput,
) -> Result<ReconcileDraftAiAuditOutput, String> {
    for (value, label) in [
        (input.max_audit_runs, "maxAuditRuns"),
        (input.max_orphan_agent_runs, "maxOrphanAgentRuns"),
    ] {
        if !(1..=100).contains(&value) {
            return Err(format!("{label} must be between 1 and 100"));
        }
    }
    let reservation_cutoff = format!("-{RESERVATION_STALE_MINUTES} minutes");
    let execution_cutoff = format!("-{EXECUTION_STALE_MINUTES} minutes");
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let mut output = ReconcileDraftAiAuditOutput::default();
            let stale = sqlx::query(
                "SELECT dar.id, dar.draft_variant_id, dar.content_revision, dar.agent_run_id
                 FROM draft_ai_audit_runs dar
                 LEFT JOIN agent_runs ar ON ar.id = dar.agent_run_id
                 WHERE dar.status IN ('pending', 'running')
                   AND dar.workflow_step_execution_id IS NULL
                   -- Rewrite audits owned by an active quality run are settled
                   -- atomically by the quality reconciler, never here.
                   AND NOT EXISTS (
                     SELECT 1 FROM draft_quality_runs qr
                     WHERE qr.status IN ('pending', 'running')
                       AND (qr.active_ai_audit_run_id = dar.id
                         OR EXISTS (SELECT 1 FROM draft_quality_attempts a
                                    WHERE a.run_id = qr.id AND a.ai_audit_run_id = dar.id)))
                   AND (
                     (dar.agent_run_id IS NULL
                       AND datetime(dar.updated_at) <= datetime('now', ?1))
                     OR (dar.agent_run_id IS NOT NULL
                       AND datetime(CASE
                             WHEN ar.updated_at IS NOT NULL
                               AND datetime(ar.updated_at) > datetime(dar.updated_at)
                               THEN ar.updated_at
                             ELSE dar.updated_at END) <= datetime('now', ?2))
                   )
                 ORDER BY datetime(dar.updated_at) ASC, dar.id ASC
                 LIMIT ?3",
            )
            .bind(&reservation_cutoff)
            .bind(&execution_cutoff)
            .bind(input.max_audit_runs)
            .fetch_all(&mut *connection)
            .await
            .map_err(storage_error)?;
            for row in stale {
                let id: i64 = row.get("id");
                let agent_run_id: Option<i64> = row.get("agent_run_id");
                let message = match agent_run_id {
                    None => format!(
                        "Draft AI audit was interrupted before agent linking and remained reserved for more than {RESERVATION_STALE_MINUTES} minutes."
                    ),
                    Some(_) => format!(
                        "Draft AI audit did not reach terminal settlement within {EXECUTION_STALE_MINUTES} minutes of its last lifecycle activity."
                    ),
                };
                // Rows were selected under this transaction's write lock, so
                // the shared primitive settles exactly the selected revision.
                if !fail_active_audit_run(connection, id, &message).await? {
                    continue;
                }
                output.failed_audit_run_ids.push(id);
                if let Some(agent_run_id) = agent_run_id {
                    let settled = fail_active_agent(connection, agent_run_id, &message).await?;
                    if settled.failed {
                        output.failed_agent_run_ids.push(agent_run_id);
                    }
                    output.cleared_approval_checkpoint_count += settled.cleared_checkpoints;
                }
            }
            let orphans: Vec<i64> = sqlx::query_scalar(
                "SELECT ar.id FROM agent_runs ar
                 WHERE ar.agent_role = 'auditor'
                   AND ar.workflow_run_id IS NULL
                   AND ar.workflow_step_id IS NULL
                   AND ar.status IN ('queued', 'running', 'waiting_approval')
                   AND datetime(ar.updated_at) <= datetime('now', ?1)
                   AND json_valid(ar.input_context_json) = 1
                   AND json_type(ar.input_context_json, '$.auditRequest.auditRunId') = 'integer'
                   AND NOT EXISTS (
                     SELECT 1 FROM draft_ai_audit_runs dar WHERE dar.agent_run_id = ar.id)
                 ORDER BY datetime(ar.updated_at) ASC, ar.id ASC
                 LIMIT ?2",
            )
            .bind(&reservation_cutoff)
            .bind(input.max_orphan_agent_runs)
            .fetch_all(&mut *connection)
            .await
            .map_err(storage_error)?;
            let orphan_message = format!(
                "Draft AI audit agent was interrupted before linking and remained orphaned for more than {RESERVATION_STALE_MINUTES} minutes."
            );
            for agent_run_id in orphans {
                let settled = fail_active_agent(connection, agent_run_id, &orphan_message).await?;
                if settled.failed {
                    output.failed_agent_run_ids.push(agent_run_id);
                }
                output.cleared_approval_checkpoint_count += settled.cleared_checkpoints;
            }
            Ok(Settlement::Accepted(output))
        })
    })
    .await
}

// --------------------------------------------------------------- commands ---

#[tauri::command]
pub async fn linkgo_draft_ai_audit_start(
    pool: State<'_, SqlitePool>,
    input: StartDraftAiAuditInput,
) -> Result<StartDraftAiAuditOutput, String> {
    start(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_draft_ai_audit_link_agent_run(
    pool: State<'_, SqlitePool>,
    input: LinkDraftAiAuditAgentInput,
) -> Result<DraftAiAuditRun, String> {
    link_agent_run(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_draft_ai_audit_complete(
    pool: State<'_, SqlitePool>,
    input: CompleteDraftAiAuditInput,
) -> Result<DraftAiAuditRun, String> {
    complete(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_draft_ai_audit_fail(
    pool: State<'_, SqlitePool>,
    input: FailDraftAiAuditInput,
) -> Result<DraftAiAuditRun, String> {
    fail(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_draft_ai_audit_reconcile(
    pool: State<'_, SqlitePool>,
    input: ReconcileDraftAiAuditInput,
) -> Result<ReconcileDraftAiAuditOutput, String> {
    reconcile(pool.inner(), input).await
}

#[cfg(test)]
#[path = "draft_ai_audits_tests.rs"]
mod tests;
