use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 16,
        description: "create_candidate_discovery_items",
        sql: "CREATE TABLE IF NOT EXISTS candidate_discovery_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            agent_run_id INTEGER,
            workflow_run_id INTEGER,
            kind TEXT NOT NULL CHECK(kind IN ('keyword', 'trend', 'source_prompt')),
            title TEXT NOT NULL DEFAULT '',
            keyword TEXT NOT NULL DEFAULT '',
            rationale TEXT NOT NULL DEFAULT '',
            source_keyword TEXT NOT NULL DEFAULT '',
            confidence_score INTEGER CHECK(confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100)),
            status TEXT NOT NULL DEFAULT 'suggested' CHECK(status IN ('suggested', 'promoted', 'dismissed')),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
            FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL,
            FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_candidate_discovery_items_campaign_id ON candidate_discovery_items(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_candidate_discovery_items_agent_run_id ON candidate_discovery_items(agent_run_id);
        CREATE INDEX IF NOT EXISTS idx_candidate_discovery_items_workflow_run_id ON candidate_discovery_items(workflow_run_id);
        CREATE INDEX IF NOT EXISTS idx_candidate_discovery_items_kind ON candidate_discovery_items(kind);
        CREATE INDEX IF NOT EXISTS idx_candidate_discovery_items_status ON candidate_discovery_items(status);
        CREATE INDEX IF NOT EXISTS idx_candidate_discovery_items_confidence_score ON candidate_discovery_items(confidence_score);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_discovery_items_unique_active
            ON candidate_discovery_items(campaign_id, kind, keyword, title)
            WHERE status != 'dismissed';",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn candidate_discovery_migration_declares_table_constraints_foreign_keys_and_indexes() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 16);
        assert_eq!(migration.description, "create_candidate_discovery_items");
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS candidate_discovery_items"));
        assert!(migration.sql.contains("campaign_id INTEGER NOT NULL"));
        assert!(migration.sql.contains("agent_run_id INTEGER"));
        assert!(migration.sql.contains("workflow_run_id INTEGER"));
        assert!(migration
            .sql
            .contains("CHECK(kind IN ('keyword', 'trend', 'source_prompt'))"));
        assert!(migration.sql.contains("title TEXT NOT NULL DEFAULT ''"));
        assert!(migration.sql.contains("keyword TEXT NOT NULL DEFAULT ''"));
        assert!(migration.sql.contains("rationale TEXT NOT NULL DEFAULT ''"));
        assert!(migration
            .sql
            .contains("source_keyword TEXT NOT NULL DEFAULT ''"));
        assert!(migration.sql.contains(
            "confidence_score INTEGER CHECK(confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100))"
        ));
        assert!(migration
            .sql
            .contains("status TEXT NOT NULL DEFAULT 'suggested' CHECK(status IN ('suggested', 'promoted', 'dismissed'))"));
        assert!(migration
            .sql
            .contains("FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE"));
        assert!(migration
            .sql
            .contains("FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL"));
        assert!(migration.sql.contains(
            "FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE SET NULL"
        ));
        assert!(migration
            .sql
            .contains("idx_candidate_discovery_items_campaign_id"));
        assert!(migration
            .sql
            .contains("idx_candidate_discovery_items_agent_run_id"));
        assert!(migration
            .sql
            .contains("idx_candidate_discovery_items_workflow_run_id"));
        assert!(migration.sql.contains("idx_candidate_discovery_items_kind"));
        assert!(migration
            .sql
            .contains("idx_candidate_discovery_items_status"));
        assert!(migration
            .sql
            .contains("idx_candidate_discovery_items_confidence_score"));
        assert!(migration
            .sql
            .contains("idx_candidate_discovery_items_unique_active"));
        assert!(migration
            .sql
            .contains("ON candidate_discovery_items(campaign_id, kind, keyword, title)"));
        assert!(migration.sql.contains("WHERE status != 'dismissed'"));
    }
}
