use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 4,
        description: "create_approvals_scheduler",
        sql: "CREATE TABLE IF NOT EXISTS approvals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            draft_id INTEGER NOT NULL,
            draft_variant_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'needs_review' CHECK(status IN ('needs_review', 'changes_requested', 'approved', 'rejected', 'scheduled', 'published', 'cancelled')),
            reviewer_notes TEXT NOT NULL DEFAULT '',
            approved_at TEXT,
            rejected_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
            FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
            FOREIGN KEY (draft_variant_id) REFERENCES draft_variants(id) ON DELETE CASCADE,
            UNIQUE(draft_id),
            UNIQUE(draft_variant_id)
        );
        CREATE TABLE IF NOT EXISTS schedule_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            approval_id INTEGER NOT NULL,
            platform TEXT NOT NULL DEFAULT 'linkedin' CHECK(platform IN ('linkedin')),
            scheduled_for TEXT NOT NULL,
            timezone TEXT NOT NULL DEFAULT 'local',
            status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'cancelled', 'completed', 'failed')),
            idempotency_key TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE CASCADE,
            UNIQUE(approval_id),
            UNIQUE(idempotency_key)
        );
        CREATE TABLE IF NOT EXISTS publish_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            approval_id INTEGER NOT NULL,
            schedule_job_id INTEGER,
            platform TEXT NOT NULL DEFAULT 'linkedin' CHECK(platform IN ('linkedin')),
            status TEXT NOT NULL CHECK(status IN ('succeeded', 'failed')),
            external_post_url TEXT NOT NULL DEFAULT '',
            platform_post_id TEXT NOT NULL DEFAULT '',
            error_message TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE CASCADE,
            FOREIGN KEY (schedule_job_id) REFERENCES schedule_jobs(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_approvals_campaign_id ON approvals(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
        CREATE INDEX IF NOT EXISTS idx_approvals_draft_id ON approvals(draft_id);
        CREATE INDEX IF NOT EXISTS idx_approvals_variant_id ON approvals(draft_variant_id);
        CREATE INDEX IF NOT EXISTS idx_schedule_jobs_approval_id ON schedule_jobs(approval_id);
        CREATE INDEX IF NOT EXISTS idx_schedule_jobs_status ON schedule_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_schedule_jobs_scheduled_for ON schedule_jobs(scheduled_for);
        CREATE INDEX IF NOT EXISTS idx_publish_attempts_approval_id ON publish_attempts(approval_id);
        CREATE INDEX IF NOT EXISTS idx_publish_attempts_schedule_job_id ON publish_attempts(schedule_job_id);
        CREATE INDEX IF NOT EXISTS idx_publish_attempts_status ON publish_attempts(status);",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn approvals_migration_declares_expected_tables_constraints_and_indexes() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 4);
        assert_eq!(migration.description, "create_approvals_scheduler");
        assert!(migration.sql.contains("CREATE TABLE IF NOT EXISTS approvals"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS schedule_jobs"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS publish_attempts"));
        assert!(migration.sql.contains("CHECK(status IN ('needs_review', 'changes_requested', 'approved', 'rejected', 'scheduled', 'published', 'cancelled'))"));
        assert!(migration
            .sql
            .contains("CHECK(status IN ('scheduled', 'cancelled', 'completed', 'failed'))"));
        assert!(migration
            .sql
            .contains("CHECK(status IN ('succeeded', 'failed'))"));
        assert!(migration.sql.contains("CHECK(platform IN ('linkedin'))"));
        assert!(migration.sql.contains("UNIQUE(draft_id)"));
        assert!(migration.sql.contains("UNIQUE(draft_variant_id)"));
        assert!(migration.sql.contains("UNIQUE(approval_id)"));
        assert!(migration.sql.contains("UNIQUE(idempotency_key)"));
        assert!(migration.sql.contains("idx_approvals_campaign_id"));
        assert!(migration.sql.contains("idx_approvals_status"));
        assert!(migration.sql.contains("idx_approvals_draft_id"));
        assert!(migration.sql.contains("idx_approvals_variant_id"));
        assert!(migration.sql.contains("idx_schedule_jobs_approval_id"));
        assert!(migration.sql.contains("idx_schedule_jobs_status"));
        assert!(migration.sql.contains("idx_schedule_jobs_scheduled_for"));
        assert!(migration.sql.contains("idx_publish_attempts_approval_id"));
        assert!(migration
            .sql
            .contains("idx_publish_attempts_schedule_job_id"));
        assert!(migration.sql.contains("idx_publish_attempts_status"));
    }
}
