use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create_campaigns",
        sql: "CREATE TABLE IF NOT EXISTS campaigns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            product TEXT NOT NULL DEFAULT '',
            audience TEXT NOT NULL DEFAULT '',
            voice TEXT NOT NULL DEFAULT '',
            tone TEXT NOT NULL DEFAULT '',
            auto_pilot INTEGER NOT NULL DEFAULT 0 CHECK(auto_pilot IN (0, 1)),
            status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'paused', 'archived')),
            daily_post_limit INTEGER NOT NULL DEFAULT 1 CHECK(daily_post_limit >= 0 AND daily_post_limit <= 10),
            daily_comment_limit INTEGER NOT NULL DEFAULT 5 CHECK(daily_comment_limit >= 0 AND daily_comment_limit <= 50),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS campaign_keywords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            keyword TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'generated', 'learned')),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
            UNIQUE(campaign_id, keyword)
        );
        CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
        CREATE INDEX IF NOT EXISTS idx_campaigns_auto_pilot ON campaigns(auto_pilot);
        CREATE INDEX IF NOT EXISTS idx_campaign_keywords_campaign_id ON campaign_keywords(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_campaign_keywords_keyword ON campaign_keywords(keyword);",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn campaign_migration_declares_expected_tables() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 1);
        assert_eq!(migration.description, "create_campaigns");
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS campaigns"));
        assert!(migration
            .sql
            .contains("auto_pilot INTEGER NOT NULL DEFAULT 0 CHECK(auto_pilot IN (0, 1))"));
        assert!(migration.sql.contains(
            "daily_post_limit INTEGER NOT NULL DEFAULT 1 CHECK(daily_post_limit >= 0 AND daily_post_limit <= 10)"
        ));
        assert!(migration.sql.contains(
            "daily_comment_limit INTEGER NOT NULL DEFAULT 5 CHECK(daily_comment_limit >= 0 AND daily_comment_limit <= 50)"
        ));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS campaign_keywords"));
    }
}
