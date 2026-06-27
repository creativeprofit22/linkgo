use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 7,
        description: "create_agent_runtime",
        sql: "CREATE TABLE IF NOT EXISTS agent_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            workflow_run_id INTEGER,
            workflow_step_id INTEGER,
            agent_role TEXT NOT NULL CHECK(agent_role IN ('researcher', 'scorer', 'drafter', 'auditor', 'scheduler', 'analyst')),
            provider_key TEXT NOT NULL DEFAULT 'dry_run' CHECK(provider_key IN ('dry_run', 'openai', 'anthropic', 'google', 'custom')),
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
        CREATE TABLE IF NOT EXISTS agent_tool_calls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_run_id INTEGER NOT NULL,
            provider_tool_call_id TEXT NOT NULL DEFAULT '',
            tool_name TEXT NOT NULL CHECK(tool_name IN ('research_posts', 'score_relevance', 'draft_post', 'audit_post', 'schedule_post', 'collect_metrics')),
            status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested', 'running', 'waiting_approval', 'completed', 'failed', 'rejected')),
            requires_approval INTEGER NOT NULL DEFAULT 0 CHECK(requires_approval IN (0, 1)),
            input_json TEXT NOT NULL DEFAULT '{}',
            output_json TEXT NOT NULL DEFAULT '{}',
            error_message TEXT NOT NULL DEFAULT '',
            started_at TEXT,
            completed_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS agent_run_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_run_id INTEGER NOT NULL,
            event_type TEXT NOT NULL CHECK(event_type IN ('run_created', 'model_started', 'model_streamed', 'tool_requested', 'tool_completed', 'tool_failed', 'approval_required', 'run_completed', 'run_failed', 'run_cancelled')),
            summary TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_agent_runs_campaign_id ON agent_runs(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_agent_runs_workflow_run_id ON agent_runs(workflow_run_id);
        CREATE INDEX IF NOT EXISTS idx_agent_runs_workflow_step_id ON agent_runs(workflow_step_id);
        CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
        CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_role ON agent_runs(agent_role);
        CREATE INDEX IF NOT EXISTS idx_agent_runs_updated_at ON agent_runs(updated_at);
        CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_run_id ON agent_tool_calls(agent_run_id);
        CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_tool_name ON agent_tool_calls(tool_name);
        CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_status ON agent_tool_calls(status);
        CREATE INDEX IF NOT EXISTS idx_agent_run_events_run_id ON agent_run_events(agent_run_id);
        CREATE INDEX IF NOT EXISTS idx_agent_run_events_event_type ON agent_run_events(event_type);
        CREATE INDEX IF NOT EXISTS idx_agent_run_events_created_at ON agent_run_events(created_at);",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn agent_runtime_migration_declares_expected_tables_constraints_and_indexes() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 7);
        assert_eq!(migration.description, "create_agent_runtime");
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS agent_runs"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS agent_tool_calls"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS agent_run_events"));
        assert!(migration.sql.contains("CHECK(agent_role IN ('researcher', 'scorer', 'drafter', 'auditor', 'scheduler', 'analyst'))"));
        assert!(migration.sql.contains(
            "CHECK(provider_key IN ('dry_run', 'openai', 'anthropic', 'google', 'custom'))"
        ));
        assert!(migration.sql.contains("CHECK(status IN ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled'))"));
        assert!(migration
            .sql
            .contains("CHECK(iteration_count >= 0 AND iteration_count <= 20)"));
        assert!(migration.sql.contains("CHECK(tool_name IN ('research_posts', 'score_relevance', 'draft_post', 'audit_post', 'schedule_post', 'collect_metrics'))"));
        assert!(migration
            .sql
            .contains("provider_tool_call_id TEXT NOT NULL DEFAULT ''"));
        assert!(migration.sql.contains("CHECK(status IN ('requested', 'running', 'waiting_approval', 'completed', 'failed', 'rejected'))"));
        assert!(migration.sql.contains("CHECK(requires_approval IN (0, 1))"));
        assert!(migration.sql.contains("CHECK(event_type IN ('run_created', 'model_started', 'model_streamed', 'tool_requested', 'tool_completed', 'tool_failed', 'approval_required', 'run_completed', 'run_failed', 'run_cancelled'))"));
        assert!(migration
            .sql
            .contains("REFERENCES campaigns(id) ON DELETE CASCADE"));
        assert!(migration
            .sql
            .contains("REFERENCES workflow_runs(id) ON DELETE SET NULL"));
        assert!(migration
            .sql
            .contains("REFERENCES workflow_steps(id) ON DELETE SET NULL"));
        assert!(migration.sql.contains("idx_agent_runs_campaign_id"));
        assert!(migration.sql.contains("idx_agent_runs_workflow_run_id"));
        assert!(migration.sql.contains("idx_agent_runs_workflow_step_id"));
        assert!(migration.sql.contains("idx_agent_runs_status"));
        assert!(migration.sql.contains("idx_agent_runs_agent_role"));
        assert!(migration.sql.contains("idx_agent_runs_updated_at"));
        assert!(migration.sql.contains("idx_agent_tool_calls_run_id"));
        assert!(migration.sql.contains("idx_agent_tool_calls_tool_name"));
        assert!(migration.sql.contains("idx_agent_tool_calls_status"));
        assert!(migration.sql.contains("idx_agent_run_events_run_id"));
        assert!(migration.sql.contains("idx_agent_run_events_event_type"));
        assert!(migration.sql.contains("idx_agent_run_events_created_at"));
    }
}
