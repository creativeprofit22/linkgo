use tauri_plugin_sql::{Migration, MigrationKind};

/// Lets the scheduler and metric refresh workers record a failed tick as a
/// `tick_failed` event instead of dropping it. SQLite cannot alter a CHECK,
/// so both event tables are rebuilt with every existing row copied across.
/// `migrate_database` runs with `foreign_keys=OFF` and
/// `legacy_alter_table=ON`; no table references either event table.
pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 40,
        description: "record_worker_tick_failures",
        sql: "CREATE TABLE scheduler_events_v40 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER,
            approval_id INTEGER,
            schedule_job_id INTEGER,
            event_type TEXT NOT NULL CHECK(event_type IN ('scheduler_started', 'scheduler_stopped', 'tick_started', 'tick_completed', 'tick_failed', 'job_claimed', 'job_blocked', 'job_published', 'job_retry_scheduled', 'job_failed')),
            severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info', 'warning', 'error')),
            summary TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
            FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE SET NULL,
            FOREIGN KEY (schedule_job_id) REFERENCES schedule_jobs(id) ON DELETE SET NULL
        );
        INSERT INTO scheduler_events_v40 (
            id, campaign_id, approval_id, schedule_job_id, event_type, severity,
            summary, metadata_json, created_at
        )
        SELECT
            id, campaign_id, approval_id, schedule_job_id, event_type, severity,
            summary, metadata_json, created_at
        FROM scheduler_events;
        DROP TABLE scheduler_events;
        ALTER TABLE scheduler_events_v40 RENAME TO scheduler_events;
        CREATE INDEX idx_scheduler_events_created_at ON scheduler_events(created_at);
        CREATE INDEX idx_scheduler_events_schedule_job_id ON scheduler_events(schedule_job_id);
        CREATE INDEX idx_scheduler_events_campaign_id ON scheduler_events(campaign_id);

        CREATE TABLE metric_refresh_events_v40 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
            approval_id INTEGER REFERENCES approvals(id) ON DELETE SET NULL,
            metric_refresh_job_id INTEGER REFERENCES metric_refresh_jobs(id) ON DELETE SET NULL,
            post_metric_id INTEGER REFERENCES post_metrics(id) ON DELETE SET NULL,
            event_type TEXT NOT NULL CHECK(event_type IN ('refresh_started', 'refresh_completed', 'refresh_retry_scheduled', 'refresh_unavailable', 'refresh_failed', 'refresh_blocked', 'worker_started', 'worker_stopped', 'tick_started', 'tick_completed', 'tick_failed')),
            severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info', 'warning', 'error')),
            summary TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO metric_refresh_events_v40 (
            id, campaign_id, approval_id, metric_refresh_job_id, post_metric_id,
            event_type, severity, summary, metadata_json, created_at
        )
        SELECT
            id, campaign_id, approval_id, metric_refresh_job_id, post_metric_id,
            event_type, severity, summary, metadata_json, created_at
        FROM metric_refresh_events;
        DROP TABLE metric_refresh_events;
        ALTER TABLE metric_refresh_events_v40 RENAME TO metric_refresh_events;
        CREATE INDEX idx_metric_refresh_events_campaign_id ON metric_refresh_events(campaign_id);
        CREATE INDEX idx_metric_refresh_events_job_id ON metric_refresh_events(metric_refresh_job_id);
        CREATE INDEX idx_metric_refresh_events_created_at ON metric_refresh_events(created_at);",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use crate::migrations::{get_migrations, migrate_database};
    use crate::test_support::{count, migrated, text};
    use sqlx::{
        migrate::{Migration as SqlxMigration, MigrationType, Migrator},
        sqlite::SqliteConnectOptions,
        Connection, Executor, SqliteConnection,
    };
    use std::borrow::Cow;

    const EVENT_ROWS: &str = "SELECT
        (SELECT json_group_array(json_array(id, campaign_id, approval_id, schedule_job_id, event_type, severity, summary, metadata_json, created_at)) FROM (SELECT * FROM scheduler_events ORDER BY id))
        || (SELECT json_group_array(json_array(id, campaign_id, approval_id, metric_refresh_job_id, post_metric_id, event_type, severity, summary, metadata_json, created_at)) FROM (SELECT * FROM metric_refresh_events ORDER BY id))";

    #[tokio::test]
    async fn existing_event_rows_survive_the_rebuild() {
        let directory = tempfile::tempdir().unwrap();
        let options = SqliteConnectOptions::new()
            .filename(directory.path().join("v39.db"))
            .create_if_missing(true);
        let mut c = SqliteConnection::connect_with(&options).await.unwrap();
        c.execute("PRAGMA foreign_keys=OFF; PRAGMA legacy_alter_table=ON;")
            .await
            .unwrap();
        let before_v40 = Migrator {
            migrations: Cow::Owned(
                get_migrations()
                    .into_iter()
                    .filter(|m| m.version < 40)
                    .map(|m| {
                        SqlxMigration::new(
                            m.version,
                            m.description.into(),
                            MigrationType::ReversibleUp,
                            m.sql.into(),
                            false,
                        )
                    })
                    .collect(),
            ),
            ..Migrator::DEFAULT
        };
        before_v40.run(&mut c).await.unwrap();
        c.execute(
            "PRAGMA legacy_alter_table=OFF; PRAGMA foreign_keys=ON;
            INSERT INTO campaigns (id,name,status) VALUES (1,'Live','active');
            INSERT INTO scheduler_events (campaign_id,event_type,severity,summary,metadata_json,created_at)
              VALUES (1,'tick_completed','info','done','{\"claimed\":1}','2026-10-01 09:00:00'),
                     (NULL,'job_failed','error','failed','{}','2026-10-01 09:05:00');
            INSERT INTO metric_refresh_events (campaign_id,event_type,severity,summary,created_at)
              VALUES (1,'tick_started','info','tick','2026-10-01 10:00:00');",
        )
        .await
        .unwrap();
        let before: String = sqlx::query_scalar(EVENT_ROWS)
            .fetch_one(&mut c)
            .await
            .unwrap();
        c.close().await.unwrap();

        migrate_database(&options).await.unwrap();

        let mut c = SqliteConnection::connect_with(&options).await.unwrap();
        let after: String = sqlx::query_scalar(EVENT_ROWS)
            .fetch_one(&mut c)
            .await
            .unwrap();
        assert_eq!(after, before);
        assert!(before.contains("job_failed") && before.contains("tick_started"));
        let indexes: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name IN (
                'idx_scheduler_events_created_at','idx_scheduler_events_schedule_job_id',
                'idx_scheduler_events_campaign_id','idx_metric_refresh_events_campaign_id',
                'idx_metric_refresh_events_job_id','idx_metric_refresh_events_created_at')",
        )
        .fetch_one(&mut c)
        .await
        .unwrap();
        assert_eq!(indexes, 6);
    }

    #[tokio::test]
    async fn worker_event_tables_accept_tick_failed() {
        let f = migrated().await;
        crate::scheduler::record_tick_failure(
            &f.pool,
            "runner-1",
            "Could not read due schedule jobs",
        )
        .await
        .expect("scheduler tick_failed should satisfy the event constraint");
        assert_eq!(
            text(
                &f.pool,
                "SELECT summary FROM scheduler_events WHERE event_type = 'tick_failed'"
            )
            .await,
            "Scheduler tick failed: Could not read due schedule jobs"
        );

        crate::metric_refresh::record_tick_failure(&f.pool, "runner-2", "Could not load settings")
            .await
            .expect("metric refresh tick_failed should satisfy the event constraint");
        assert_eq!(count(&f.pool, "metric_refresh_events").await, 1);
        assert_eq!(
            text(&f.pool, "SELECT summary FROM metric_refresh_events WHERE event_type = 'tick_failed' AND severity = 'error'")
                .await,
            "Metric refresh tick failed: Could not load settings"
        );

        for (table, bad) in [
            ("scheduler_events", "tick_exploded"),
            ("metric_refresh_events", "tick_exploded"),
        ] {
            let sql = format!("INSERT INTO {table} (event_type, severity, summary) VALUES ('{bad}', 'error', 'x')");
            assert!(sqlx::query(&sql).execute(&f.pool).await.is_err(), "{table}");
        }
    }
}
