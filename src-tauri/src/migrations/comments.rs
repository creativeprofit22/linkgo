use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 9,
        description: "create_comments",
        sql: "CREATE TABLE IF NOT EXISTS comment_threads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
            candidate_post_id INTEGER NOT NULL REFERENCES candidate_posts(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'drafting' CHECK(status IN ('drafting', 'needs_review', 'changes_requested', 'approved', 'rejected', 'posted', 'cancelled')),
            operator_notes TEXT NOT NULL DEFAULT '',
            reviewer_notes TEXT NOT NULL DEFAULT '',
            approved_at TEXT,
            rejected_at TEXT,
            posted_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(candidate_post_id)
        );
        CREATE INDEX IF NOT EXISTS idx_comment_threads_campaign_id ON comment_threads(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_comment_threads_candidate_post_id ON comment_threads(candidate_post_id);
        CREATE INDEX IF NOT EXISTS idx_comment_threads_status ON comment_threads(status);
        CREATE INDEX IF NOT EXISTS idx_comment_threads_updated_at ON comment_threads(updated_at);
        CREATE TABLE IF NOT EXISTS comment_variants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            comment_thread_id INTEGER NOT NULL REFERENCES comment_threads(id) ON DELETE CASCADE,
            variant_number INTEGER NOT NULL CHECK(variant_number >= 1 AND variant_number <= 3),
            body TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'selected', 'rejected')),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(comment_thread_id, variant_number)
        );
        CREATE INDEX IF NOT EXISTS idx_comment_variants_thread_id ON comment_variants(comment_thread_id);
        CREATE INDEX IF NOT EXISTS idx_comment_variants_status ON comment_variants(status);
        CREATE TABLE IF NOT EXISTS comment_audits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            comment_variant_id INTEGER NOT NULL REFERENCES comment_variants(id) ON DELETE CASCADE,
            rule_key TEXT NOT NULL,
            severity TEXT NOT NULL CHECK(severity IN ('pass', 'warning', 'block')),
            message TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_comment_audits_variant_id ON comment_audits(comment_variant_id);
        CREATE INDEX IF NOT EXISTS idx_comment_audits_severity ON comment_audits(severity);
        CREATE TABLE IF NOT EXISTS comment_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            comment_thread_id INTEGER NOT NULL REFERENCES comment_threads(id) ON DELETE CASCADE,
            platform TEXT NOT NULL DEFAULT 'linkedin' CHECK(platform IN ('linkedin')),
            status TEXT NOT NULL CHECK(status IN ('succeeded', 'failed')),
            external_comment_url TEXT NOT NULL DEFAULT '',
            platform_comment_id TEXT NOT NULL DEFAULT '',
            error_message TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_comment_attempts_thread_id ON comment_attempts(comment_thread_id);
        CREATE INDEX IF NOT EXISTS idx_comment_attempts_status ON comment_attempts(status);
        CREATE INDEX IF NOT EXISTS idx_comment_attempts_created_at ON comment_attempts(created_at);",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn comments_migration_declares_expected_tables_constraints_and_indexes() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 9);
        assert_eq!(migration.description, "create_comments");
        assert!(migration.sql.contains("CREATE TABLE IF NOT EXISTS comment_threads"));
        assert!(migration.sql.contains("CREATE TABLE IF NOT EXISTS comment_variants"));
        assert!(migration.sql.contains("CREATE TABLE IF NOT EXISTS comment_audits"));
        assert!(migration.sql.contains("CREATE TABLE IF NOT EXISTS comment_attempts"));
        assert!(migration.sql.contains("REFERENCES campaigns(id) ON DELETE CASCADE"));
        assert!(migration.sql.contains("REFERENCES candidate_posts(id) ON DELETE CASCADE"));
        assert!(migration.sql.contains("CHECK(status IN ('drafting', 'needs_review', 'changes_requested', 'approved', 'rejected', 'posted', 'cancelled'))"));
        assert!(migration.sql.contains("CHECK(variant_number >= 1 AND variant_number <= 3)"));
        assert!(migration.sql.contains("CHECK(severity IN ('pass', 'warning', 'block'))"));
        assert!(migration.sql.contains("CHECK(platform IN ('linkedin'))"));
        assert!(migration.sql.contains("CHECK(status IN ('succeeded', 'failed'))"));
        assert!(migration.sql.contains("UNIQUE(candidate_post_id)"));
        assert!(migration.sql.contains("UNIQUE(comment_thread_id, variant_number)"));
        assert!(migration.sql.contains("idx_comment_threads_campaign_id"));
        assert!(migration.sql.contains("idx_comment_threads_candidate_post_id"));
        assert!(migration.sql.contains("idx_comment_threads_status"));
        assert!(migration.sql.contains("idx_comment_threads_updated_at"));
        assert!(migration.sql.contains("idx_comment_variants_thread_id"));
        assert!(migration.sql.contains("idx_comment_variants_status"));
        assert!(migration.sql.contains("idx_comment_audits_variant_id"));
        assert!(migration.sql.contains("idx_comment_audits_severity"));
        assert!(migration.sql.contains("idx_comment_attempts_thread_id"));
        assert!(migration.sql.contains("idx_comment_attempts_status"));
        assert!(migration.sql.contains("idx_comment_attempts_created_at"));
    }
}
