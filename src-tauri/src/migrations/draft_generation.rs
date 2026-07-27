use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 18,
        description: "create_draft_generation_requests",
        sql: "CREATE TABLE IF NOT EXISTS draft_generation_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            candidate_post_id INTEGER NOT NULL,
            agent_run_id INTEGER,
            provider_key TEXT NOT NULL,
            model_name TEXT NOT NULL DEFAULT '',
            playbook_key TEXT NOT NULL DEFAULT '',
            variant_count INTEGER NOT NULL CHECK(variant_count >= 1 AND variant_count <= 5),
            angle TEXT NOT NULL DEFAULT '' CHECK(length(angle) <= 240),
            voice_notes TEXT NOT NULL DEFAULT '' CHECK(length(voice_notes) <= 1000),
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'generated', 'saved', 'failed', 'dismissed')),
            summary TEXT NOT NULL DEFAULT '' CHECK(length(summary) <= 1000),
            generated_variants_json TEXT NOT NULL DEFAULT '[]',
            error_message TEXT NOT NULL DEFAULT '',
            created_draft_id INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
            FOREIGN KEY (candidate_post_id) REFERENCES candidate_posts(id) ON DELETE CASCADE,
            FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL,
            FOREIGN KEY (created_draft_id) REFERENCES drafts(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_draft_generation_requests_campaign_id ON draft_generation_requests(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_draft_generation_requests_candidate_post_id ON draft_generation_requests(candidate_post_id);
        CREATE INDEX IF NOT EXISTS idx_draft_generation_requests_agent_run_id ON draft_generation_requests(agent_run_id);
        CREATE INDEX IF NOT EXISTS idx_draft_generation_requests_status ON draft_generation_requests(status);
        CREATE INDEX IF NOT EXISTS idx_draft_generation_requests_created_draft_id ON draft_generation_requests(created_draft_id);",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn draft_generation_migration_declares_requests_table_constraints_and_indexes() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 18);
        assert_eq!(migration.description, "create_draft_generation_requests");
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS draft_generation_requests"));
        assert!(migration.sql.contains("campaign_id INTEGER NOT NULL"));
        assert!(migration.sql.contains("candidate_post_id INTEGER NOT NULL"));
        assert!(migration.sql.contains("agent_run_id INTEGER"));
        assert!(migration.sql.contains("provider_key TEXT NOT NULL"));
        assert!(migration.sql.contains(
            "variant_count INTEGER NOT NULL CHECK(variant_count >= 1 AND variant_count <= 5)"
        ));
        assert!(migration
            .sql
            .contains("angle TEXT NOT NULL DEFAULT '' CHECK(length(angle) <= 240)"));
        assert!(migration
            .sql
            .contains("voice_notes TEXT NOT NULL DEFAULT '' CHECK(length(voice_notes) <= 1000)"));
        assert!(migration
            .sql
            .contains("CHECK(status IN ('pending', 'generated', 'saved', 'failed', 'dismissed'))"));
        assert!(migration
            .sql
            .contains("generated_variants_json TEXT NOT NULL DEFAULT '[]'"));
        assert!(migration
            .sql
            .contains("FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE"));
        assert!(migration.sql.contains(
            "FOREIGN KEY (candidate_post_id) REFERENCES candidate_posts(id) ON DELETE CASCADE"
        ));
        assert!(migration
            .sql
            .contains("FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL"));
        assert!(migration
            .sql
            .contains("FOREIGN KEY (created_draft_id) REFERENCES drafts(id) ON DELETE SET NULL"));
        assert!(migration
            .sql
            .contains("idx_draft_generation_requests_campaign_id"));
        assert!(migration
            .sql
            .contains("idx_draft_generation_requests_candidate_post_id"));
        assert!(migration
            .sql
            .contains("idx_draft_generation_requests_agent_run_id"));
        assert!(migration
            .sql
            .contains("idx_draft_generation_requests_status"));
        assert!(migration
            .sql
            .contains("idx_draft_generation_requests_created_draft_id"));
    }
}
