use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg(test)]
const AGENT_PROVIDER_CHECK: &str = "CHECK(provider_key IN ('dry_run', 'anthropic', 'xiaomi', 'openai', 'gemini', 'glm', 'moonshot', 'deepseek', 'openrouter', 'sakana', 'minimax', 'custom'))";
#[cfg(test)]
const AUTH_PROVIDER_CHECK: &str = "CHECK(provider_key IN ('anthropic', 'xiaomi', 'openai', 'gemini', 'glm', 'moonshot', 'deepseek', 'openrouter', 'sakana', 'minimax', 'custom', 'linkedin'))";

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 11,
        description: "expand_ai_provider_catalog",
        sql: "PRAGMA foreign_keys=OFF;
        DROP INDEX IF EXISTS idx_agent_runs_campaign_id;
        DROP INDEX IF EXISTS idx_agent_runs_workflow_run_id;
        DROP INDEX IF EXISTS idx_agent_runs_workflow_step_id;
        DROP INDEX IF EXISTS idx_agent_runs_status;
        DROP INDEX IF EXISTS idx_agent_runs_agent_role;
        DROP INDEX IF EXISTS idx_agent_runs_updated_at;
        DROP INDEX IF EXISTS idx_connected_accounts_provider_key;
        DROP INDEX IF EXISTS idx_connected_accounts_status;
        DROP INDEX IF EXISTS idx_credential_events_provider_key;
        DROP INDEX IF EXISTS idx_credential_events_event_type;
        DROP INDEX IF EXISTS idx_credential_events_created_at;

        ALTER TABLE agent_runs RENAME TO agent_runs_legacy_provider_parity;
        CREATE TABLE agent_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            workflow_run_id INTEGER,
            workflow_step_id INTEGER,
            agent_role TEXT NOT NULL CHECK(agent_role IN ('researcher', 'scorer', 'drafter', 'auditor', 'scheduler', 'analyst')),
            provider_key TEXT NOT NULL DEFAULT 'dry_run' CHECK(provider_key IN ('dry_run', 'anthropic', 'xiaomi', 'openai', 'gemini', 'glm', 'moonshot', 'deepseek', 'openrouter', 'sakana', 'minimax', 'custom')),
            model_name TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled')),
            input_summary TEXT NOT NULL DEFAULT '',
            output_summary TEXT NOT NULL DEFAULT '',
            error_message TEXT NOT NULL DEFAULT '',
            iteration_count INTEGER NOT NULL DEFAULT 0 CHECK(iteration_count >= 0 AND iteration_count <= 20),
            started_at TEXT,
            completed_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
            FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE SET NULL,
            FOREIGN KEY (workflow_step_id) REFERENCES workflow_steps(id) ON DELETE SET NULL
        );
        INSERT INTO agent_runs (
            id, campaign_id, workflow_run_id, workflow_step_id, agent_role, provider_key,
            model_name, status, input_summary, output_summary, error_message, iteration_count,
            started_at, completed_at, created_at, updated_at
        ) SELECT
            id, campaign_id, workflow_run_id, workflow_step_id, agent_role,
            CASE provider_key WHEN 'google' THEN 'gemini' ELSE provider_key END,
            model_name, status, input_summary, output_summary, error_message, iteration_count,
            started_at, completed_at, created_at, updated_at
        FROM agent_runs_legacy_provider_parity;
        DROP TABLE agent_runs_legacy_provider_parity;

        ALTER TABLE connected_accounts RENAME TO connected_accounts_legacy_provider_parity;
        CREATE TABLE connected_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider_key TEXT NOT NULL UNIQUE CHECK(provider_key IN ('anthropic', 'xiaomi', 'openai', 'gemini', 'glm', 'moonshot', 'deepseek', 'openrouter', 'sakana', 'minimax', 'custom', 'linkedin')),
            provider_label TEXT NOT NULL,
            auth_method TEXT NOT NULL CHECK(auth_method IN ('oauth', 'api_key')),
            status TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN ('disconnected', 'connected', 'expired', 'reauth_required', 'error')),
            scopes TEXT NOT NULL DEFAULT '',
            account_label TEXT NOT NULL DEFAULT '',
            account_id TEXT NOT NULL DEFAULT '',
            expires_at TEXT,
            refresh_expires_at TEXT,
            has_base_url_override INTEGER NOT NULL DEFAULT 0 CHECK(has_base_url_override IN (0, 1)),
            last_checked_at TEXT,
            last_error TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO connected_accounts (
            id, provider_key, provider_label, auth_method, status, scopes, account_label,
            account_id, expires_at, refresh_expires_at, has_base_url_override,
            last_checked_at, last_error, created_at, updated_at
        ) SELECT
            id,
            CASE provider_key WHEN 'google' THEN 'gemini' ELSE provider_key END,
            CASE provider_key WHEN 'google' THEN 'Gemini' ELSE provider_label END,
            auth_method, status, scopes, account_label, account_id, expires_at,
            refresh_expires_at,
            CASE
                WHEN provider_key = 'custom' AND status = 'connected' THEN 1
                ELSE 0
            END,
            last_checked_at, last_error, created_at, updated_at
        FROM connected_accounts_legacy_provider_parity;
        DROP TABLE connected_accounts_legacy_provider_parity;

        ALTER TABLE credential_events RENAME TO credential_events_legacy_provider_parity;
        CREATE TABLE credential_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider_key TEXT NOT NULL CHECK(provider_key IN ('anthropic', 'xiaomi', 'openai', 'gemini', 'glm', 'moonshot', 'deepseek', 'openrouter', 'sakana', 'minimax', 'custom', 'linkedin')),
            event_type TEXT NOT NULL CHECK(event_type IN ('connected', 'disconnected', 'refresh_succeeded', 'refresh_failed', 'reauth_required', 'auth_error')),
            summary TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO credential_events (
            id, provider_key, event_type, summary, metadata_json, created_at
        ) SELECT
            id,
            CASE provider_key WHEN 'google' THEN 'gemini' ELSE provider_key END,
            event_type, summary, metadata_json, created_at
        FROM credential_events_legacy_provider_parity;
        DROP TABLE credential_events_legacy_provider_parity;

        CREATE INDEX IF NOT EXISTS idx_agent_runs_campaign_id ON agent_runs(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_agent_runs_workflow_run_id ON agent_runs(workflow_run_id);
        CREATE INDEX IF NOT EXISTS idx_agent_runs_workflow_step_id ON agent_runs(workflow_step_id);
        CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
        CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_role ON agent_runs(agent_role);
        CREATE INDEX IF NOT EXISTS idx_agent_runs_updated_at ON agent_runs(updated_at);
        CREATE INDEX IF NOT EXISTS idx_connected_accounts_provider_key ON connected_accounts(provider_key);
        CREATE INDEX IF NOT EXISTS idx_connected_accounts_status ON connected_accounts(status);
        CREATE INDEX IF NOT EXISTS idx_credential_events_provider_key ON credential_events(provider_key);
        CREATE INDEX IF NOT EXISTS idx_credential_events_event_type ON credential_events(event_type);
        CREATE INDEX IF NOT EXISTS idx_credential_events_created_at ON credential_events(created_at);
        PRAGMA foreign_keys=ON;",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::{migrations, AGENT_PROVIDER_CHECK, AUTH_PROVIDER_CHECK};

    #[test]
    fn provider_parity_migration_expands_constraints_and_migrates_google_alias() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 11);
        assert_eq!(migration.description, "expand_ai_provider_catalog");
        assert!(migration.sql.contains(AGENT_PROVIDER_CHECK));
        assert!(migration.sql.contains(AUTH_PROVIDER_CHECK));
        assert!(migration
            .sql
            .contains("CASE provider_key WHEN 'google' THEN 'gemini' ELSE provider_key END"));
        assert!(migration
            .sql
            .contains("ALTER TABLE agent_runs RENAME TO agent_runs_legacy_provider_parity"));
        assert!(migration.sql.contains(
            "ALTER TABLE connected_accounts RENAME TO connected_accounts_legacy_provider_parity"
        ));
        assert!(migration.sql.contains(
            "ALTER TABLE credential_events RENAME TO credential_events_legacy_provider_parity"
        ));
        assert!(migration.sql.contains("idx_agent_runs_campaign_id"));
        assert!(migration
            .sql
            .contains("idx_connected_accounts_provider_key"));
        assert!(migration
            .sql
            .contains("has_base_url_override INTEGER NOT NULL DEFAULT 0"));
        assert!(migration.sql.contains("idx_credential_events_provider_key"));
    }
}
