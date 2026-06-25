use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 3,
        description: "create_drafts",
        sql: "CREATE TABLE IF NOT EXISTS drafts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            candidate_post_id INTEGER NOT NULL,
            angle TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'drafting' CHECK(status IN ('drafting', 'needs_revision', 'ready_for_review', 'archived')),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
            FOREIGN KEY (candidate_post_id) REFERENCES candidate_posts(id) ON DELETE CASCADE,
            UNIQUE(candidate_post_id)
        );
        CREATE TABLE IF NOT EXISTS draft_variants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            draft_id INTEGER NOT NULL,
            variant_number INTEGER NOT NULL CHECK(variant_number >= 1 AND variant_number <= 5),
            hook TEXT NOT NULL DEFAULT '',
            body TEXT NOT NULL DEFAULT '',
            cta TEXT NOT NULL DEFAULT '',
            hashtags TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'selected', 'rejected')),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
            UNIQUE(draft_id, variant_number)
        );
        CREATE TABLE IF NOT EXISTS draft_audits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            draft_variant_id INTEGER NOT NULL,
            rule_key TEXT NOT NULL,
            severity TEXT NOT NULL CHECK(severity IN ('pass', 'warning', 'block')),
            message TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (draft_variant_id) REFERENCES draft_variants(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_drafts_campaign_id ON drafts(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_drafts_candidate_post_id ON drafts(candidate_post_id);
        CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
        CREATE INDEX IF NOT EXISTS idx_draft_variants_draft_id ON draft_variants(draft_id);
        CREATE INDEX IF NOT EXISTS idx_draft_variants_status ON draft_variants(status);
        CREATE INDEX IF NOT EXISTS idx_draft_audits_variant_id ON draft_audits(draft_variant_id);
        CREATE INDEX IF NOT EXISTS idx_draft_audits_severity ON draft_audits(severity);",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn drafts_migration_declares_expected_tables_and_indexes() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 3);
        assert_eq!(migration.description, "create_drafts");
        assert!(migration.sql.contains("CREATE TABLE IF NOT EXISTS drafts"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS draft_variants"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS draft_audits"));
        assert!(migration.sql.contains(
            "CHECK(status IN ('drafting', 'needs_revision', 'ready_for_review', 'archived'))"
        ));
        assert!(migration
            .sql
            .contains("CHECK(status IN ('draft', 'selected', 'rejected'))"));
        assert!(migration
            .sql
            .contains("CHECK(severity IN ('pass', 'warning', 'block'))"));
        assert!(migration.sql.contains("UNIQUE(candidate_post_id)"));
        assert!(migration
            .sql
            .contains("UNIQUE(draft_id, variant_number)"));
        assert!(migration.sql.contains("idx_draft_variants_draft_id"));
        assert!(migration.sql.contains("idx_draft_variants_status"));
        assert!(migration.sql.contains("idx_draft_audits_variant_id"));
        assert!(migration.sql.contains("idx_draft_audits_severity"));
    }
}
