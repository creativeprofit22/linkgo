use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 12,
        description: "create_background_scheduler_jobs",
        sql: "PRAGMA foreign_keys = off;

        DROP TABLE IF EXISTS schedule_jobs_v12;

        CREATE TABLE schedule_jobs_v12 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            approval_id INTEGER NOT NULL,
            platform TEXT NOT NULL DEFAULT 'linkedin' CHECK(platform IN ('linkedin')),
            scheduled_for TEXT NOT NULL,
            timezone TEXT NOT NULL DEFAULT 'local',
            status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'cancelled', 'completed', 'failed')),
            idempotency_key TEXT NOT NULL,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 3,
            next_attempt_at TEXT,
            last_attempted_at TEXT,
            last_error TEXT NOT NULL DEFAULT '',
            locked_at TEXT,
            locked_by TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE CASCADE,
            UNIQUE(approval_id),
            UNIQUE(idempotency_key)
        );

        INSERT OR IGNORE INTO schedule_jobs_v12 (
            id,
            approval_id,
            platform,
            scheduled_for,
            timezone,
            status,
            idempotency_key,
            created_at,
            updated_at
        )
        SELECT
            id,
            approval_id,
            platform,
            scheduled_for,
            timezone,
            status,
            idempotency_key,
            created_at,
            updated_at
        FROM schedule_jobs;

        DROP TABLE schedule_jobs;
        ALTER TABLE schedule_jobs_v12 RENAME TO schedule_jobs;

        PRAGMA foreign_keys = on;

        CREATE TABLE IF NOT EXISTS scheduler_settings (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0, 1)),
            poll_interval_seconds INTEGER NOT NULL DEFAULT 60 CHECK(poll_interval_seconds BETWEEN 15 AND 3600),
            max_jobs_per_tick INTEGER NOT NULL DEFAULT 1 CHECK(max_jobs_per_tick BETWEEN 1 AND 10),
            retry_backoff_minutes INTEGER NOT NULL DEFAULT 15 CHECK(retry_backoff_minutes BETWEEN 1 AND 1440),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT OR IGNORE INTO scheduler_settings (
            id,
            enabled,
            poll_interval_seconds,
            max_jobs_per_tick,
            retry_backoff_minutes
        ) VALUES (1, 0, 60, 1, 15);

        CREATE TABLE IF NOT EXISTS scheduler_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER,
            approval_id INTEGER,
            schedule_job_id INTEGER,
            event_type TEXT NOT NULL CHECK(event_type IN ('scheduler_started', 'scheduler_stopped', 'tick_started', 'tick_completed', 'job_claimed', 'job_blocked', 'job_published', 'job_retry_scheduled', 'job_failed')),
            severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info', 'warning', 'error')),
            summary TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
            FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE SET NULL,
            FOREIGN KEY (schedule_job_id) REFERENCES schedule_jobs(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_schedule_jobs_approval_id ON schedule_jobs(approval_id);
        CREATE INDEX IF NOT EXISTS idx_schedule_jobs_status ON schedule_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_schedule_jobs_scheduled_for ON schedule_jobs(scheduled_for);
        CREATE INDEX IF NOT EXISTS idx_schedule_jobs_due_scheduler ON schedule_jobs(status, scheduled_for, next_attempt_at);
        CREATE INDEX IF NOT EXISTS idx_schedule_jobs_lock ON schedule_jobs(locked_at);
        CREATE INDEX IF NOT EXISTS idx_scheduler_events_created_at ON scheduler_events(created_at);
        CREATE INDEX IF NOT EXISTS idx_scheduler_events_schedule_job_id ON scheduler_events(schedule_job_id);
        CREATE INDEX IF NOT EXISTS idx_scheduler_events_campaign_id ON scheduler_events(campaign_id);",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn scheduler_migration_declares_tables_columns_constraints_and_indexes() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 12);
        assert_eq!(migration.description, "create_background_scheduler_jobs");
        assert!(migration
            .sql
            .contains("DROP TABLE IF EXISTS schedule_jobs_v12"));
        assert!(migration.sql.contains("CREATE TABLE schedule_jobs_v12"));
        assert!(migration
            .sql
            .contains("attempt_count INTEGER NOT NULL DEFAULT 0"));
        assert!(migration
            .sql
            .contains("max_attempts INTEGER NOT NULL DEFAULT 3"));
        assert!(migration.sql.contains("next_attempt_at TEXT"));
        assert!(migration.sql.contains("last_attempted_at TEXT"));
        assert!(migration
            .sql
            .contains("last_error TEXT NOT NULL DEFAULT ''"));
        assert!(migration.sql.contains("locked_at TEXT"));
        assert!(migration.sql.contains("locked_by TEXT"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS scheduler_settings"));
        assert!(migration
            .sql
            .contains("enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0, 1))"));
        assert!(migration.sql.contains(
            "poll_interval_seconds INTEGER NOT NULL DEFAULT 60 CHECK(poll_interval_seconds BETWEEN 15 AND 3600)"
        ));
        assert!(migration.sql.contains(
            "max_jobs_per_tick INTEGER NOT NULL DEFAULT 1 CHECK(max_jobs_per_tick BETWEEN 1 AND 10)"
        ));
        assert!(migration.sql.contains(
            "retry_backoff_minutes INTEGER NOT NULL DEFAULT 15 CHECK(retry_backoff_minutes BETWEEN 1 AND 1440)"
        ));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS scheduler_events"));
        assert!(migration.sql.contains("'scheduler_started'"));
        assert!(migration.sql.contains("'scheduler_stopped'"));
        assert!(migration.sql.contains("'tick_started'"));
        assert!(migration.sql.contains("'tick_completed'"));
        assert!(migration.sql.contains("'job_claimed'"));
        assert!(migration.sql.contains("'job_blocked'"));
        assert!(migration.sql.contains("'job_published'"));
        assert!(migration.sql.contains("'job_retry_scheduled'"));
        assert!(migration.sql.contains("'job_failed'"));
        assert!(migration.sql.contains("idx_schedule_jobs_due_scheduler"));
        assert!(migration.sql.contains("idx_schedule_jobs_lock"));
        assert!(migration.sql.contains("idx_scheduler_events_created_at"));
        assert!(migration
            .sql
            .contains("idx_scheduler_events_schedule_job_id"));
        assert!(migration.sql.contains("idx_scheduler_events_campaign_id"));
    }
}
