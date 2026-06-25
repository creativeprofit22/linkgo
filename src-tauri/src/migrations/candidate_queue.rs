use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 2,
        description: "create_candidate_queue",
        sql: "CREATE TABLE IF NOT EXISTS target_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL DEFAULT 'linkedin' CHECK(platform IN ('linkedin')),
            url TEXT NOT NULL,
            normalized_url TEXT NOT NULL,
            author_name TEXT NOT NULL DEFAULT '',
            author_profile_url TEXT NOT NULL DEFAULT '',
            posted_at TEXT,
            content TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS candidate_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            target_post_id INTEGER NOT NULL,
            source_keyword TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'shortlisted', 'rejected', 'drafted')),
            relevance_score INTEGER CHECK(relevance_score IS NULL OR (relevance_score >= 0 AND relevance_score <= 100)),
            score_reason TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
            FOREIGN KEY (target_post_id) REFERENCES target_posts(id) ON DELETE CASCADE,
            UNIQUE(campaign_id, target_post_id)
        );
        CREATE TABLE IF NOT EXISTS dedupe_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            key_type TEXT NOT NULL CHECK(key_type IN ('normalized_url', 'content_hash')),
            key_value TEXT NOT NULL,
            candidate_post_id INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
            FOREIGN KEY (candidate_post_id) REFERENCES candidate_posts(id) ON DELETE CASCADE,
            UNIQUE(campaign_id, key_type, key_value)
        );
        CREATE INDEX IF NOT EXISTS idx_target_posts_platform ON target_posts(platform);
        CREATE INDEX IF NOT EXISTS idx_target_posts_normalized_url ON target_posts(normalized_url);
        CREATE INDEX IF NOT EXISTS idx_target_posts_content_hash ON target_posts(content_hash);
        CREATE INDEX IF NOT EXISTS idx_candidate_posts_campaign_id ON candidate_posts(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_candidate_posts_status ON candidate_posts(status);
        CREATE INDEX IF NOT EXISTS idx_candidate_posts_relevance_score ON candidate_posts(relevance_score);
        CREATE INDEX IF NOT EXISTS idx_dedupe_keys_campaign_id ON dedupe_keys(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_dedupe_keys_key ON dedupe_keys(key_type, key_value);",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn candidate_queue_migration_declares_expected_tables() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 2);
        assert_eq!(migration.description, "create_candidate_queue");
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS target_posts"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS candidate_posts"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS dedupe_keys"));
        assert!(migration
            .sql
            .contains("CHECK(status IN ('new', 'shortlisted', 'rejected', 'drafted'))"));
        assert!(migration
            .sql
            .contains("UNIQUE(campaign_id, key_type, key_value)"));
        assert!(migration
            .sql
            .contains("idx_candidate_posts_relevance_score"));
    }
}
