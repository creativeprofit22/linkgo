use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 14,
        description: "create_metric_refresh_jobs",
        sql: "ALTER TABLE post_metrics ADD COLUMN collection_source TEXT NOT NULL DEFAULT 'manual' CHECK(collection_source IN ('manual', 'linkedin_social_metadata'));
        ALTER TABLE post_metrics ADD COLUMN raw_payload_json TEXT NOT NULL DEFAULT '';

        CREATE TABLE IF NOT EXISTS metric_refresh_settings (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0, 1)),
            poll_interval_minutes INTEGER NOT NULL DEFAULT 360 CHECK(poll_interval_minutes BETWEEN 15 AND 1440),
            max_jobs_per_tick INTEGER NOT NULL DEFAULT 3 CHECK(max_jobs_per_tick BETWEEN 1 AND 20),
            refresh_interval_hours INTEGER NOT NULL DEFAULT 6 CHECK(refresh_interval_hours BETWEEN 1 AND 168),
            retry_backoff_minutes INTEGER NOT NULL DEFAULT 60 CHECK(retry_backoff_minutes BETWEEN 5 AND 1440),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT OR IGNORE INTO metric_refresh_settings (
            id,
            enabled,
            poll_interval_minutes,
            max_jobs_per_tick,
            refresh_interval_hours,
            retry_backoff_minutes
        ) VALUES (1, 0, 360, 3, 6, 60);

        CREATE TABLE IF NOT EXISTS metric_refresh_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
            approval_id INTEGER NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
            publish_attempt_id INTEGER REFERENCES publish_attempts(id) ON DELETE SET NULL,
            platform TEXT NOT NULL DEFAULT 'linkedin' CHECK(platform IN ('linkedin')),
            target_urn TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'unavailable', 'failed')),
            next_refresh_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_refreshed_at TEXT,
            last_attempted_at TEXT,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 3,
            failure_count INTEGER NOT NULL DEFAULT 0,
            last_error TEXT NOT NULL DEFAULT '',
            locked_at TEXT,
            locked_by TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(approval_id)
        );

        CREATE TABLE IF NOT EXISTS metric_refresh_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
            approval_id INTEGER REFERENCES approvals(id) ON DELETE SET NULL,
            metric_refresh_job_id INTEGER REFERENCES metric_refresh_jobs(id) ON DELETE SET NULL,
            post_metric_id INTEGER REFERENCES post_metrics(id) ON DELETE SET NULL,
            event_type TEXT NOT NULL CHECK(event_type IN ('refresh_started', 'refresh_completed', 'refresh_retry_scheduled', 'refresh_unavailable', 'refresh_failed', 'refresh_blocked', 'worker_started', 'worker_stopped', 'tick_started', 'tick_completed')),
            severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info', 'warning', 'error')),
            summary TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_post_metrics_collection_source ON post_metrics(collection_source);
        CREATE INDEX IF NOT EXISTS idx_metric_refresh_jobs_campaign_id ON metric_refresh_jobs(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_metric_refresh_jobs_status_next_refresh ON metric_refresh_jobs(status, next_refresh_at);
        CREATE INDEX IF NOT EXISTS idx_metric_refresh_jobs_lock ON metric_refresh_jobs(locked_at);
        CREATE INDEX IF NOT EXISTS idx_metric_refresh_jobs_approval_id ON metric_refresh_jobs(approval_id);
        CREATE INDEX IF NOT EXISTS idx_metric_refresh_events_campaign_id ON metric_refresh_events(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_metric_refresh_events_job_id ON metric_refresh_events(metric_refresh_job_id);
        CREATE INDEX IF NOT EXISTS idx_metric_refresh_events_created_at ON metric_refresh_events(created_at);",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn metric_refresh_migration_declares_tables_columns_constraints_and_indexes() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 14);
        assert_eq!(migration.description, "create_metric_refresh_jobs");
        assert!(migration
            .sql
            .contains("ALTER TABLE post_metrics ADD COLUMN collection_source"));
        assert!(migration
            .sql
            .contains("CHECK(collection_source IN ('manual', 'linkedin_social_metadata'))"));
        assert!(migration
            .sql
            .contains("ALTER TABLE post_metrics ADD COLUMN raw_payload_json"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS metric_refresh_settings"));
        assert!(migration.sql.contains(
            "poll_interval_minutes INTEGER NOT NULL DEFAULT 360 CHECK(poll_interval_minutes BETWEEN 15 AND 1440)"
        ));
        assert!(migration.sql.contains(
            "max_jobs_per_tick INTEGER NOT NULL DEFAULT 3 CHECK(max_jobs_per_tick BETWEEN 1 AND 20)"
        ));
        assert!(migration.sql.contains(
            "refresh_interval_hours INTEGER NOT NULL DEFAULT 6 CHECK(refresh_interval_hours BETWEEN 1 AND 168)"
        ));
        assert!(migration.sql.contains(
            "retry_backoff_minutes INTEGER NOT NULL DEFAULT 60 CHECK(retry_backoff_minutes BETWEEN 5 AND 1440)"
        ));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS metric_refresh_jobs"));
        assert!(migration.sql.contains("UNIQUE(approval_id)"));
        assert!(migration
            .sql
            .contains("CHECK(status IN ('active', 'paused', 'unavailable', 'failed'))"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS metric_refresh_events"));
        assert!(migration.sql.contains("'refresh_started'"));
        assert!(migration.sql.contains("'refresh_completed'"));
        assert!(migration.sql.contains("'refresh_retry_scheduled'"));
        assert!(migration.sql.contains("'refresh_unavailable'"));
        assert!(migration.sql.contains("'refresh_failed'"));
        assert!(migration.sql.contains("'refresh_blocked'"));
        assert!(migration.sql.contains("'worker_started'"));
        assert!(migration.sql.contains("'worker_stopped'"));
        assert!(migration.sql.contains("'tick_started'"));
        assert!(migration.sql.contains("'tick_completed'"));
        assert!(migration.sql.contains("idx_post_metrics_collection_source"));
        assert!(migration
            .sql
            .contains("idx_metric_refresh_jobs_campaign_id"));
        assert!(migration
            .sql
            .contains("idx_metric_refresh_jobs_status_next_refresh"));
        assert!(migration.sql.contains("idx_metric_refresh_jobs_lock"));
        assert!(migration
            .sql
            .contains("idx_metric_refresh_jobs_approval_id"));
        assert!(migration
            .sql
            .contains("idx_metric_refresh_events_campaign_id"));
        assert!(migration.sql.contains("idx_metric_refresh_events_job_id"));
        assert!(migration
            .sql
            .contains("idx_metric_refresh_events_created_at"));
    }
}
