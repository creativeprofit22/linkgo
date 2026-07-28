use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 23,
        description: "create_candidate_intake_policies",
        sql: "CREATE TABLE IF NOT EXISTS candidate_intake_policies (
            campaign_id INTEGER PRIMARY KEY,
            max_post_age_days INTEGER NOT NULL DEFAULT 30 CHECK(max_post_age_days BETWEEN 1 AND 365),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS candidate_policy_banned_topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            topic TEXT NOT NULL CHECK(length(trim(topic)) BETWEEN 1 AND 80),
            normalized_topic TEXT NOT NULL CHECK(length(normalized_topic) BETWEEN 1 AND 80),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
            UNIQUE(campaign_id, normalized_topic)
        );
        CREATE INDEX IF NOT EXISTS idx_candidate_policy_banned_topics_campaign_id
            ON candidate_policy_banned_topics(campaign_id);
        ALTER TABLE source_import_items ADD COLUMN policy_rule_key TEXT NOT NULL DEFAULT ''
            CHECK(policy_rule_key IN ('', 'source', 'age', 'banned_topic', 'already_contacted'));
        CREATE INDEX IF NOT EXISTS idx_source_import_items_policy_rule_key
            ON source_import_items(policy_rule_key)
            WHERE policy_rule_key <> '';",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn candidate_policy_migration_declares_expected_schema() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 23);
        assert_eq!(migration.description, "create_candidate_intake_policies");
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS candidate_intake_policies"));
        assert!(migration
            .sql
            .contains("max_post_age_days BETWEEN 1 AND 365"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS candidate_policy_banned_topics"));
        assert!(migration
            .sql
            .contains("UNIQUE(campaign_id, normalized_topic)"));
        assert!(migration.sql.contains("ADD COLUMN policy_rule_key"));
        assert!(migration
            .sql
            .contains("idx_source_import_items_policy_rule_key"));
    }
}
