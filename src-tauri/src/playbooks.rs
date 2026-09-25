//! Native playbook override persistence: the bounded override list read and
//! the single-row upsert. Playbook definitions stay in the renderer
//! (`src/agent/playbooks.ts`); only operator overrides are stored.
//!
//! Validation mirrors `updatePlaybookOverrideSchema` (JS `trim`, UTF-16
//! lengths) so native never trusts renderer normalisation.

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use tauri::State;

use crate::db_transaction::{settle, Settlement};
use crate::js_text::{js_trim, utf16_len};

const STORAGE_ERROR: &str = "Could not save playbook";
const READ_ERROR: &str = "Could not load playbooks";
const MAX_CUSTOM_INSTRUCTIONS: usize = 2000;
/// Mirrors `AGENT_PLAYBOOK_KEYS`; the table CHECK enforces the same set.
pub(crate) const PLAYBOOK_KEYS: [&str; 5] = [
    "linkedin_writer",
    "linkedin_humanizer",
    "content_calendar",
    "linkedin_commenter",
    "campaign_analyst",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpsertPlaybookOverrideInput {
    pub playbook_key: String,
    pub enabled: bool,
    #[serde(default)]
    pub custom_instructions: String,
}

/// Mirrors the renderer `AgentPlaybookOverride` row shape.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct PlaybookOverride {
    pub playbook_key: String,
    pub enabled: i64,
    pub custom_instructions: String,
    pub updated_at: String,
}

struct ValidUpsert {
    key: String,
    enabled: i64,
    custom_instructions: String,
}

fn validate_upsert(input: &UpsertPlaybookOverrideInput) -> Result<ValidUpsert, String> {
    if !PLAYBOOK_KEYS.contains(&input.playbook_key.as_str()) {
        return Err("Unknown playbook".to_string());
    }
    let custom_instructions = js_trim(&input.custom_instructions);
    if utf16_len(custom_instructions) > MAX_CUSTOM_INSTRUCTIONS {
        return Err(format!(
            "Custom instructions must be at most {MAX_CUSTOM_INSTRUCTIONS} characters"
        ));
    }
    Ok(ValidUpsert {
        key: input.playbook_key.clone(),
        enabled: i64::from(input.enabled),
        custom_instructions: custom_instructions.to_string(),
    })
}

pub(crate) async fn upsert_playbook_override(
    pool: &SqlitePool,
    input: UpsertPlaybookOverrideInput,
) -> Result<(), String> {
    let valid = validate_upsert(&input)?;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            sqlx::query(
                "INSERT INTO agent_playbook_overrides (
                   playbook_key, enabled, custom_instructions, updated_at
                 ) VALUES (?1, ?2, ?3, datetime('now'))
                 ON CONFLICT(playbook_key) DO UPDATE SET
                   enabled = excluded.enabled,
                   custom_instructions = excluded.custom_instructions,
                   updated_at = datetime('now')",
            )
            .bind(&valid.key)
            .bind(valid.enabled)
            .bind(&valid.custom_instructions)
            .execute(&mut *connection)
            .await
            .map_err(|_| STORAGE_ERROR.to_string())?;
            Ok(Settlement::Accepted(()))
        })
    })
    .await
}

/// Bounded by the table's CHECK constraint to one row per known playbook.
pub(crate) async fn list_playbook_overrides(
    pool: &SqlitePool,
) -> Result<Vec<PlaybookOverride>, String> {
    let rows = sqlx::query(
        "SELECT playbook_key, enabled, custom_instructions, updated_at
         FROM agent_playbook_overrides ORDER BY playbook_key ASC LIMIT ?1",
    )
    .bind(PLAYBOOK_KEYS.len() as i64)
    .fetch_all(pool)
    .await
    .map_err(|_| READ_ERROR.to_string())?;
    Ok(rows
        .iter()
        .map(|row| PlaybookOverride {
            playbook_key: row.get("playbook_key"),
            enabled: row.get("enabled"),
            custom_instructions: row.get("custom_instructions"),
            updated_at: row.get("updated_at"),
        })
        .collect())
}

#[tauri::command]
pub async fn linkgo_playbook_override_upsert(
    pool: State<'_, SqlitePool>,
    input: UpsertPlaybookOverrideInput,
) -> Result<(), String> {
    upsert_playbook_override(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_playbook_override_list(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<PlaybookOverride>, String> {
    list_playbook_overrides(pool.inner()).await
}

#[cfg(test)]
#[path = "playbooks_tests.rs"]
mod tests;
