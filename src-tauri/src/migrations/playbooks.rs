use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 15,
        description: "create_agent_playbooks",
        sql: "ALTER TABLE agent_runs ADD COLUMN playbook_key TEXT NOT NULL DEFAULT '' CHECK(playbook_key IN ('', 'linkedin_writer', 'linkedin_humanizer', 'content_calendar', 'linkedin_commenter', 'campaign_analyst'));

        CREATE INDEX IF NOT EXISTS idx_agent_runs_playbook_key ON agent_runs(playbook_key);

        CREATE TABLE IF NOT EXISTS agent_playbook_overrides (
            playbook_key TEXT PRIMARY KEY CHECK(playbook_key IN ('linkedin_writer', 'linkedin_humanizer', 'content_calendar', 'linkedin_commenter', 'campaign_analyst')),
            enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
            custom_instructions TEXT NOT NULL DEFAULT '' CHECK(length(custom_instructions) <= 2000),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn playbooks_migration_declares_column_table_constraints_and_indexes() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 15);
        assert_eq!(migration.description, "create_agent_playbooks");
        let playbook_key_values = "'linkedin_writer', 'linkedin_humanizer', 'content_calendar', 'linkedin_commenter', 'campaign_analyst'";
        assert!(migration.sql.contains(&format!(
            "ALTER TABLE agent_runs ADD COLUMN playbook_key TEXT NOT NULL DEFAULT '' CHECK(playbook_key IN ('', {}))",
            playbook_key_values
        )));
        assert!(migration.sql.contains("idx_agent_runs_playbook_key"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS agent_playbook_overrides"));
        assert!(migration.sql.contains(&format!(
            "playbook_key TEXT PRIMARY KEY CHECK(playbook_key IN ({}))",
            playbook_key_values
        )));
        assert!(migration
            .sql
            .contains("enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1))"));
        assert!(migration
            .sql
            .contains("custom_instructions TEXT NOT NULL DEFAULT '' CHECK(length(custom_instructions) <= 2000)"));
        assert!(migration
            .sql
            .contains("updated_at TEXT NOT NULL DEFAULT (datetime('now'))"));
    }
}
