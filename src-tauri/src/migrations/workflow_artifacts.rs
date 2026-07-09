use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 20,
        description: "create_workflow_artifacts",
        sql: "CREATE TABLE IF NOT EXISTS workflow_artifacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workflow_run_id INTEGER NOT NULL,
            workflow_step_id INTEGER,
            artifact_type TEXT NOT NULL CHECK(artifact_type IN ('agent_run')),
            artifact_id INTEGER NOT NULL CHECK(artifact_id > 0),
            summary TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE,
            FOREIGN KEY (workflow_step_id) REFERENCES workflow_steps(id) ON DELETE SET NULL,
            UNIQUE(workflow_run_id, artifact_type, artifact_id)
        );
        CREATE INDEX IF NOT EXISTS idx_workflow_artifacts_run_id ON workflow_artifacts(workflow_run_id);
        CREATE INDEX IF NOT EXISTS idx_workflow_artifacts_step_id ON workflow_artifacts(workflow_step_id);
        CREATE INDEX IF NOT EXISTS idx_workflow_artifacts_type_id ON workflow_artifacts(artifact_type, artifact_id);
        CREATE INDEX IF NOT EXISTS idx_workflow_artifacts_updated_at ON workflow_artifacts(updated_at);",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn workflow_artifacts_migration_declares_expected_table_constraints_and_indexes() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 20);
        assert_eq!(migration.description, "create_workflow_artifacts");
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS workflow_artifacts"));
        assert!(migration
            .sql
            .contains("CHECK(artifact_type IN ('agent_run'))"));
        assert!(migration.sql.contains("CHECK(artifact_id > 0)"));
        assert!(migration
            .sql
            .contains("REFERENCES workflow_runs(id) ON DELETE CASCADE"));
        assert!(migration
            .sql
            .contains("REFERENCES workflow_steps(id) ON DELETE SET NULL"));
        assert!(migration
            .sql
            .contains("UNIQUE(workflow_run_id, artifact_type, artifact_id)"));
        assert!(migration.sql.contains("idx_workflow_artifacts_run_id"));
        assert!(migration.sql.contains("idx_workflow_artifacts_step_id"));
        assert!(migration.sql.contains("idx_workflow_artifacts_type_id"));
        assert!(migration.sql.contains("idx_workflow_artifacts_updated_at"));
    }
}
