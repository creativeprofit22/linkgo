use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 10,
        description: "create_integrations_and_workflow_executions",
        sql: "CREATE TABLE IF NOT EXISTS connected_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider_key TEXT NOT NULL UNIQUE CHECK(provider_key IN ('openai', 'anthropic', 'google', 'custom', 'linkedin')),
            provider_label TEXT NOT NULL,
            auth_method TEXT NOT NULL CHECK(auth_method IN ('oauth', 'api_key')),
            status TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN ('disconnected', 'connected', 'expired', 'reauth_required', 'error')),
            scopes TEXT NOT NULL DEFAULT '',
            account_label TEXT NOT NULL DEFAULT '',
            account_id TEXT NOT NULL DEFAULT '',
            expires_at TEXT,
            refresh_expires_at TEXT,
            last_checked_at TEXT,
            last_error TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS credential_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider_key TEXT NOT NULL CHECK(provider_key IN ('openai', 'anthropic', 'google', 'custom', 'linkedin')),
            event_type TEXT NOT NULL CHECK(event_type IN ('connected', 'disconnected', 'refresh_succeeded', 'refresh_failed', 'reauth_required', 'auth_error')),
            summary TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS workflow_step_executions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workflow_step_id INTEGER NOT NULL,
            agent_run_id INTEGER,
            executor_role TEXT NOT NULL CHECK(executor_role IN ('researcher', 'scorer', 'drafter', 'auditor', 'scheduler', 'analyst')),
            attempt_count INTEGER NOT NULL DEFAULT 1 CHECK(attempt_count >= 1 AND attempt_count <= 20),
            status TEXT NOT NULL DEFAULT 'claimed' CHECK(status IN ('claimed', 'running', 'completed', 'waiting_approval', 'failed', 'blocked', 'cancelled')),
            error_summary TEXT NOT NULL DEFAULT '',
            started_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (workflow_step_id) REFERENCES workflow_steps(id) ON DELETE CASCADE,
            FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_connected_accounts_provider_key ON connected_accounts(provider_key);
        CREATE INDEX IF NOT EXISTS idx_connected_accounts_status ON connected_accounts(status);
        CREATE INDEX IF NOT EXISTS idx_credential_events_provider_key ON credential_events(provider_key);
        CREATE INDEX IF NOT EXISTS idx_credential_events_event_type ON credential_events(event_type);
        CREATE INDEX IF NOT EXISTS idx_credential_events_created_at ON credential_events(created_at);
        CREATE INDEX IF NOT EXISTS idx_workflow_step_executions_step_id ON workflow_step_executions(workflow_step_id);
        CREATE INDEX IF NOT EXISTS idx_workflow_step_executions_agent_run_id ON workflow_step_executions(agent_run_id);
        CREATE INDEX IF NOT EXISTS idx_workflow_step_executions_status ON workflow_step_executions(status);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_step_executions_active_step ON workflow_step_executions(workflow_step_id) WHERE status IN ('claimed', 'running', 'waiting_approval');",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn integrations_migration_declares_expected_tables_constraints_indexes_and_no_secret_columns() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 10);
        assert_eq!(
            migration.description,
            "create_integrations_and_workflow_executions"
        );
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS connected_accounts"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS credential_events"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS workflow_step_executions"));
        assert!(migration.sql.contains(
            "CHECK(provider_key IN ('openai', 'anthropic', 'google', 'custom', 'linkedin'))"
        ));
        assert!(migration
            .sql
            .contains("CHECK(auth_method IN ('oauth', 'api_key'))"));
        assert!(migration.sql.contains(
            "CHECK(status IN ('disconnected', 'connected', 'expired', 'reauth_required', 'error'))"
        ));
        assert!(migration.sql.contains("CHECK(event_type IN ('connected', 'disconnected', 'refresh_succeeded', 'refresh_failed', 'reauth_required', 'auth_error'))"));
        assert!(migration
            .sql
            .contains("REFERENCES workflow_steps(id) ON DELETE CASCADE"));
        assert!(migration
            .sql
            .contains("REFERENCES agent_runs(id) ON DELETE SET NULL"));
        assert!(migration
            .sql
            .contains("idx_connected_accounts_provider_key"));
        assert!(migration.sql.contains("idx_credential_events_created_at"));
        assert!(migration
            .sql
            .contains("idx_workflow_step_executions_active_step"));

        let lower_sql = migration.sql.to_ascii_lowercase();
        assert!(!lower_sql.contains("access_token"));
        assert!(!lower_sql.contains("refresh_token"));
        assert!(!lower_sql.contains("api_key text"));
        assert!(!lower_sql.contains("client_secret"));
    }
}
