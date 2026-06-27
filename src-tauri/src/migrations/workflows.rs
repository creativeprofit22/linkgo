use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 6,
        description: "create_workflows",
        sql: "CREATE TABLE IF NOT EXISTS workflow_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            workflow_type TEXT NOT NULL DEFAULT 'content_pipeline' CHECK(workflow_type IN ('content_pipeline')),
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'running', 'waiting_approval', 'blocked', 'completed', 'failed', 'cancelled')),
            current_step_key TEXT NOT NULL DEFAULT 'research' CHECK(current_step_key IN ('research', 'score', 'draft', 'audit', 'approve', 'schedule', 'measure')),
            context_summary TEXT NOT NULL DEFAULT '',
            started_at TEXT,
            completed_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS workflow_steps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workflow_run_id INTEGER NOT NULL,
            step_key TEXT NOT NULL CHECK(step_key IN ('research', 'score', 'draft', 'audit', 'approve', 'schedule', 'measure')),
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL CHECK(sort_order >= 1 AND sort_order <= 7),
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'waiting_approval', 'blocked', 'completed', 'failed', 'skipped')),
            output_summary TEXT NOT NULL DEFAULT '',
            error_message TEXT NOT NULL DEFAULT '',
            started_at TEXT,
            completed_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE,
            UNIQUE(workflow_run_id, step_key),
            UNIQUE(workflow_run_id, sort_order)
        );
        CREATE TABLE IF NOT EXISTS workflow_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workflow_run_id INTEGER NOT NULL,
            workflow_step_id INTEGER,
            event_type TEXT NOT NULL CHECK(event_type IN ('run_created', 'run_started', 'step_started', 'step_waiting_approval', 'step_blocked', 'step_completed', 'step_failed', 'step_skipped', 'step_resumed', 'run_completed', 'run_cancelled', 'note_added')),
            summary TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE,
            FOREIGN KEY (workflow_step_id) REFERENCES workflow_steps(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_workflow_runs_campaign_id ON workflow_runs(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
        CREATE INDEX IF NOT EXISTS idx_workflow_runs_current_step_key ON workflow_runs(current_step_key);
        CREATE INDEX IF NOT EXISTS idx_workflow_runs_updated_at ON workflow_runs(updated_at);
        CREATE INDEX IF NOT EXISTS idx_workflow_steps_run_id ON workflow_steps(workflow_run_id);
        CREATE INDEX IF NOT EXISTS idx_workflow_steps_status ON workflow_steps(status);
        CREATE INDEX IF NOT EXISTS idx_workflow_steps_step_key ON workflow_steps(step_key);
        CREATE INDEX IF NOT EXISTS idx_workflow_events_run_id ON workflow_events(workflow_run_id);
        CREATE INDEX IF NOT EXISTS idx_workflow_events_step_id ON workflow_events(workflow_step_id);
        CREATE INDEX IF NOT EXISTS idx_workflow_events_event_type ON workflow_events(event_type);
        CREATE INDEX IF NOT EXISTS idx_workflow_events_created_at ON workflow_events(created_at);",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn workflows_migration_declares_expected_tables_constraints_and_indexes() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 6);
        assert_eq!(migration.description, "create_workflows");
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS workflow_runs"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS workflow_steps"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS workflow_events"));
        assert!(migration
            .sql
            .contains("CHECK(workflow_type IN ('content_pipeline'))"));
        assert!(migration.sql.contains("CHECK(status IN ('queued', 'running', 'waiting_approval', 'blocked', 'completed', 'failed', 'cancelled'))"));
        assert!(migration.sql.contains("CHECK(status IN ('pending', 'running', 'waiting_approval', 'blocked', 'completed', 'failed', 'skipped'))"));
        assert!(migration.sql.contains("CHECK(current_step_key IN ('research', 'score', 'draft', 'audit', 'approve', 'schedule', 'measure'))"));
        assert!(migration.sql.contains("CHECK(step_key IN ('research', 'score', 'draft', 'audit', 'approve', 'schedule', 'measure'))"));
        assert!(migration.sql.contains("CHECK(event_type IN ('run_created', 'run_started', 'step_started', 'step_waiting_approval', 'step_blocked', 'step_completed', 'step_failed', 'step_skipped', 'step_resumed', 'run_completed', 'run_cancelled', 'note_added'))"));
        assert!(migration.sql.contains("UNIQUE(workflow_run_id, step_key)"));
        assert!(migration
            .sql
            .contains("UNIQUE(workflow_run_id, sort_order)"));
        assert!(migration.sql.contains("idx_workflow_runs_campaign_id"));
        assert!(migration.sql.contains("idx_workflow_runs_status"));
        assert!(migration.sql.contains("idx_workflow_runs_current_step_key"));
        assert!(migration.sql.contains("idx_workflow_runs_updated_at"));
        assert!(migration.sql.contains("idx_workflow_steps_run_id"));
        assert!(migration.sql.contains("idx_workflow_steps_status"));
        assert!(migration.sql.contains("idx_workflow_steps_step_key"));
        assert!(migration.sql.contains("idx_workflow_events_run_id"));
        assert!(migration.sql.contains("idx_workflow_events_step_id"));
        assert!(migration.sql.contains("idx_workflow_events_event_type"));
        assert!(migration.sql.contains("idx_workflow_events_created_at"));
    }
}
