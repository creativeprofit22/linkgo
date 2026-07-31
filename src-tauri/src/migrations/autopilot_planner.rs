use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 27,
        description: "create_autopilot_planner",
        sql: "CREATE TABLE IF NOT EXISTS autopilot_planner_settings (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0, 1)),
            poll_interval_minutes INTEGER NOT NULL DEFAULT 60
                CHECK(poll_interval_minutes BETWEEN 5 AND 1440),
            max_batches_per_tick INTEGER NOT NULL DEFAULT 3
                CHECK(max_batches_per_tick BETWEEN 1 AND 20),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        INSERT OR IGNORE INTO autopilot_planner_settings (id) VALUES (1);

        CREATE TABLE IF NOT EXISTS autopilot_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            source_import_batch_id INTEGER NOT NULL UNIQUE,
            source_type TEXT NOT NULL CHECK(length(trim(source_type)) BETWEEN 1 AND 100),
            status TEXT NOT NULL CHECK(status IN ('planned', 'skipped')),
            campaign_backlog_item_id INTEGER UNIQUE,
            workflow_run_id INTEGER UNIQUE,
            candidate_count INTEGER NOT NULL CHECK(candidate_count >= 0),
            summary TEXT NOT NULL DEFAULT '' CHECK(length(summary) <= 1000),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
            FOREIGN KEY (source_import_batch_id) REFERENCES source_import_batches(id) ON DELETE CASCADE,
            FOREIGN KEY (campaign_backlog_item_id) REFERENCES campaign_backlog_items(id) ON DELETE SET NULL,
            FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE SET NULL,
            CHECK(
                (status = 'planned' AND candidate_count > 0)
                OR
                (status = 'skipped' AND candidate_count = 0
                    AND campaign_backlog_item_id IS NULL AND workflow_run_id IS NULL)
            )
        );
        CREATE TRIGGER autopilot_plans_require_links_on_insert
        BEFORE INSERT ON autopilot_plans
        WHEN NEW.status = 'planned'
          AND (NEW.campaign_backlog_item_id IS NULL OR NEW.workflow_run_id IS NULL)
        BEGIN
            SELECT RAISE(ABORT, 'planned autopilot plan requires backlog and workflow links');
        END;
        CREATE TRIGGER autopilot_plans_require_links_when_planned
        BEFORE UPDATE OF status, candidate_count, campaign_backlog_item_id, workflow_run_id
            ON autopilot_plans
        WHEN NEW.status = 'planned'
          AND OLD.status <> 'planned'
          AND (NEW.campaign_backlog_item_id IS NULL OR NEW.workflow_run_id IS NULL)
        BEGIN
            SELECT RAISE(ABORT, 'planned autopilot plan requires backlog and workflow links');
        END;

        CREATE TABLE IF NOT EXISTS autopilot_planner_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER,
            source_import_batch_id INTEGER,
            autopilot_plan_id INTEGER,
            event_type TEXT NOT NULL CHECK(event_type IN (
                'planner_started', 'planner_stopped', 'tick_started', 'tick_completed',
                'batch_planned', 'batch_skipped', 'batch_failed', 'planner_blocked'
            )),
            severity TEXT NOT NULL DEFAULT 'info'
                CHECK(severity IN ('info', 'warning', 'error')),
            summary TEXT NOT NULL CHECK(length(trim(summary)) BETWEEN 1 AND 1000),
            metadata_json TEXT NOT NULL DEFAULT '{}'
                CHECK(length(metadata_json) <= 4000 AND json_valid(metadata_json)),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
            FOREIGN KEY (source_import_batch_id) REFERENCES source_import_batches(id) ON DELETE SET NULL,
            FOREIGN KEY (autopilot_plan_id) REFERENCES autopilot_plans(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_source_import_batches_planner_eligibility
            ON source_import_batches(status, campaign_id, created_at, id);
        CREATE INDEX IF NOT EXISTS idx_autopilot_plans_campaign_created
            ON autopilot_plans(campaign_id, created_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_autopilot_plans_status_created
            ON autopilot_plans(status, created_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_autopilot_planner_events_campaign_created
            ON autopilot_planner_events(campaign_id, created_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_autopilot_planner_events_batch
            ON autopilot_planner_events(source_import_batch_id);
        CREATE INDEX IF NOT EXISTS idx_autopilot_planner_events_plan
            ON autopilot_planner_events(autopilot_plan_id);
        CREATE INDEX IF NOT EXISTS idx_autopilot_planner_events_type_created
            ON autopilot_planner_events(event_type, created_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_autopilot_planner_events_created
            ON autopilot_planner_events(created_at DESC, id DESC);",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 28,
        description: "add_autopilot_planner_tick_failed_event",
        sql: "CREATE TABLE autopilot_planner_events_v28 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER,
            source_import_batch_id INTEGER,
            autopilot_plan_id INTEGER,
            event_type TEXT NOT NULL CHECK(event_type IN (
                'planner_started', 'planner_stopped', 'tick_started', 'tick_completed',
                'tick_failed', 'batch_planned', 'batch_skipped', 'batch_failed',
                'planner_blocked'
            )),
            severity TEXT NOT NULL DEFAULT 'info'
                CHECK(severity IN ('info', 'warning', 'error')),
            summary TEXT NOT NULL CHECK(length(trim(summary)) BETWEEN 1 AND 1000),
            metadata_json TEXT NOT NULL DEFAULT '{}'
                CHECK(length(metadata_json) <= 4000 AND json_valid(metadata_json)),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
            FOREIGN KEY (source_import_batch_id) REFERENCES source_import_batches(id) ON DELETE SET NULL,
            FOREIGN KEY (autopilot_plan_id) REFERENCES autopilot_plans(id) ON DELETE SET NULL
        );
        INSERT INTO autopilot_planner_events_v28 (
            id, campaign_id, source_import_batch_id, autopilot_plan_id,
            event_type, severity, summary, metadata_json, created_at
        )
        SELECT
            id, campaign_id, source_import_batch_id, autopilot_plan_id,
            event_type, severity, summary, metadata_json, created_at
        FROM autopilot_planner_events;
        DROP TABLE autopilot_planner_events;
        ALTER TABLE autopilot_planner_events_v28 RENAME TO autopilot_planner_events;

        CREATE INDEX idx_autopilot_planner_events_campaign_created
            ON autopilot_planner_events(campaign_id, created_at DESC, id DESC);
        CREATE INDEX idx_autopilot_planner_events_batch
            ON autopilot_planner_events(source_import_batch_id);
        CREATE INDEX idx_autopilot_planner_events_plan
            ON autopilot_planner_events(autopilot_plan_id);
        CREATE INDEX idx_autopilot_planner_events_type_created
            ON autopilot_planner_events(event_type, created_at DESC, id DESC);
        CREATE INDEX idx_autopilot_planner_events_created
            ON autopilot_planner_events(created_at DESC, id DESC);",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;
    use sqlx::{sqlite::SqliteConnectOptions, Connection, Executor, Row, SqliteConnection};
    use std::str::FromStr;

    async fn prerequisite_connection() -> SqliteConnection {
        let options = SqliteConnectOptions::from_str("sqlite::memory:")
            .expect("in-memory SQLite URL should be valid")
            .foreign_keys(true);
        let mut connection = SqliteConnection::connect_with(&options)
            .await
            .expect("in-memory SQLite should open");
        connection
            .execute(
                "CREATE TABLE campaigns (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL
                );
                CREATE TABLE source_import_batches (
                    id INTEGER PRIMARY KEY,
                    campaign_id INTEGER NOT NULL,
                    source_type TEXT NOT NULL DEFAULT 'local_json',
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
                );
                CREATE TABLE campaign_backlog_items (
                    id INTEGER PRIMARY KEY,
                    campaign_id INTEGER NOT NULL,
                    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
                );
                CREATE TABLE workflow_runs (
                    id INTEGER PRIMARY KEY,
                    campaign_id INTEGER NOT NULL,
                    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
                );",
            )
            .await
            .expect("planner prerequisites should be created");
        connection
    }

    async fn migrated_connection() -> SqliteConnection {
        let mut connection = prerequisite_connection().await;
        for migration in migrations() {
            connection
                .execute(migration.sql)
                .await
                .unwrap_or_else(|error| panic!("{} migration failed: {error}", migration.version));
        }
        connection
    }

    async fn seed_links(connection: &mut SqliteConnection) {
        connection
            .execute(
                "INSERT INTO campaigns (id, name) VALUES (1, 'Planner test');
                 INSERT INTO source_import_batches
                    (id, campaign_id, source_type, status, created_at)
                    VALUES (10, 1, 'local_json', 'completed', '2026-07-31T10:00:00.000Z');
                 INSERT INTO campaign_backlog_items (id, campaign_id) VALUES (20, 1);
                 INSERT INTO workflow_runs (id, campaign_id) VALUES (30, 1);",
            )
            .await
            .expect("planner fixtures should insert");
    }

    async fn assert_rejected(connection: &mut SqliteConnection, sql: &str) {
        assert!(
            sqlx::query(sql).execute(&mut *connection).await.is_err(),
            "SQLite accepted invalid planner SQL: {sql}"
        );
    }

    #[test]
    fn autopilot_planner_migration_declares_expected_schema() {
        let migration = &migrations()[0];
        assert_eq!(migration.version, 27);
        assert_eq!(migration.description, "create_autopilot_planner");

        for declaration in [
            "CREATE TABLE IF NOT EXISTS autopilot_planner_settings",
            "CREATE TABLE IF NOT EXISTS autopilot_plans",
            "CREATE TABLE IF NOT EXISTS autopilot_planner_events",
            "source_import_batch_id INTEGER NOT NULL UNIQUE",
            "campaign_backlog_item_id INTEGER UNIQUE",
            "workflow_run_id INTEGER UNIQUE",
            "ON DELETE SET NULL",
            "idx_source_import_batches_planner_eligibility",
            "idx_autopilot_plans_campaign_created",
            "idx_autopilot_planner_events_created",
        ] {
            assert!(migration.sql.contains(declaration), "missing {declaration}");
        }
    }

    #[test]
    fn tick_failed_forward_migration_expands_event_contract() {
        let migrations = migrations();
        let migration = &migrations[1];
        assert_eq!(migration.version, 28);
        assert_eq!(
            migration.description,
            "add_autopilot_planner_tick_failed_event"
        );
        assert!(migration.sql.contains("'tick_failed'"));
        assert!(migration
            .sql
            .contains("INSERT INTO autopilot_planner_events_v28"));
    }

    #[test]
    fn tick_failed_forward_migration_preserves_existing_events() {
        tauri::async_runtime::block_on(async {
            let mut connection = prerequisite_connection().await;
            let migrations = migrations();
            connection
                .execute(migrations[0].sql)
                .await
                .expect("migration 27 should execute");
            seed_links(&mut connection).await;
            sqlx::query(
                "INSERT INTO autopilot_planner_events
                    (campaign_id, source_import_batch_id, event_type, severity, summary)
                 VALUES (1, 10, 'batch_failed', 'error', 'Existing batch failure')",
            )
            .execute(&mut connection)
            .await
            .expect("migration 27 event should insert");

            connection
                .execute(migrations[1].sql)
                .await
                .expect("migration 28 should execute over existing events");

            let preserved = sqlx::query(
                "SELECT campaign_id, source_import_batch_id, event_type
                   FROM autopilot_planner_events",
            )
            .fetch_one(&mut connection)
            .await
            .expect("existing event should survive migration 28");
            assert_eq!(preserved.get::<Option<i64>, _>("campaign_id"), Some(1));
            assert_eq!(
                preserved.get::<Option<i64>, _>("source_import_batch_id"),
                Some(10)
            );
            assert_eq!(preserved.get::<String, _>("event_type"), "batch_failed");

            sqlx::query(
                "INSERT INTO autopilot_planner_events
                    (event_type, severity, summary)
                 VALUES ('tick_failed', 'error', 'Worker tick failed')",
            )
            .execute(&mut connection)
            .await
            .expect("migration 28 should accept tick_failed");
        });
    }

    #[test]
    fn autopilot_planner_migration_enforces_settings_and_plan_invariants() {
        tauri::async_runtime::block_on(async {
            let mut connection = migrated_connection().await;
            seed_links(&mut connection).await;

            let settings = sqlx::query(
                "SELECT enabled, poll_interval_minutes, max_batches_per_tick
                   FROM autopilot_planner_settings WHERE id = 1",
            )
            .fetch_one(&mut connection)
            .await
            .expect("singleton planner settings should exist");
            assert_eq!(settings.get::<i64, _>("enabled"), 0);
            assert_eq!(settings.get::<i64, _>("poll_interval_minutes"), 60);
            assert_eq!(settings.get::<i64, _>("max_batches_per_tick"), 3);

            assert_rejected(
                &mut connection,
                "INSERT INTO autopilot_planner_settings (id) VALUES (2)",
            )
            .await;
            assert_rejected(
                &mut connection,
                "UPDATE autopilot_planner_settings SET poll_interval_minutes = 1 WHERE id = 1",
            )
            .await;
            assert_rejected(
                &mut connection,
                "UPDATE autopilot_planner_settings SET max_batches_per_tick = 21 WHERE id = 1",
            )
            .await;
            assert_rejected(
                &mut connection,
                "INSERT INTO autopilot_plans
                    (campaign_id, source_import_batch_id, source_type, status, candidate_count)
                 VALUES (1, 10, 'local_json', 'planned', 1)",
            )
            .await;
            assert_rejected(
                &mut connection,
                "INSERT INTO autopilot_plans
                    (campaign_id, source_import_batch_id, source_type, status,
                     campaign_backlog_item_id, workflow_run_id, candidate_count)
                 VALUES (1, 10, 'local_json', 'skipped', 20, 30, 0)",
            )
            .await;
            assert_rejected(
                &mut connection,
                "INSERT INTO autopilot_plans
                    (campaign_id, source_import_batch_id, source_type, status,
                     campaign_backlog_item_id, workflow_run_id, candidate_count)
                 VALUES (1, 10, 'local_json', 'planned', 20, 30, 0)",
            )
            .await;

            sqlx::query(
                "INSERT INTO autopilot_plans
                    (campaign_id, source_import_batch_id, source_type, status,
                     campaign_backlog_item_id, workflow_run_id, candidate_count, summary)
                 VALUES (1, 10, 'local_json', 'planned', 20, 30, 2, 'Created local work')",
            )
            .execute(&mut connection)
            .await
            .expect("valid planned linkage should insert");
            assert_rejected(
                &mut connection,
                "INSERT INTO autopilot_plans
                    (campaign_id, source_import_batch_id, source_type, status,
                     campaign_backlog_item_id, workflow_run_id, candidate_count)
                 VALUES (1, 10, 'local_json', 'planned', 20, 30, 1)",
            )
            .await;
        });
    }

    #[test]
    fn autopilot_planner_links_survive_linked_record_deletion_and_events_validate() {
        tauri::async_runtime::block_on(async {
            let mut connection = migrated_connection().await;
            seed_links(&mut connection).await;
            sqlx::query(
                "INSERT INTO autopilot_plans
                    (id, campaign_id, source_import_batch_id, source_type, status,
                     campaign_backlog_item_id, workflow_run_id, candidate_count, summary)
                 VALUES (40, 1, 10, 'local_json', 'planned', 20, 30, 1, 'Planned')",
            )
            .execute(&mut connection)
            .await
            .expect("valid plan should insert");
            sqlx::query(
                "INSERT INTO autopilot_planner_events
                    (campaign_id, source_import_batch_id, autopilot_plan_id,
                     event_type, severity, summary, metadata_json)
                 VALUES (1, 10, 40, 'batch_planned', 'info', 'Batch planned', '{\"candidateCount\":1}')",
            )
            .execute(&mut connection)
            .await
            .expect("valid event should insert");
            sqlx::query(
                "INSERT INTO autopilot_planner_events
                    (event_type, severity, summary, metadata_json)
                 VALUES ('tick_failed', 'error', 'Worker tick failed', '{\"runnerId\":\"test\"}')",
            )
            .execute(&mut connection)
            .await
            .expect("tick_failed should be accepted after migration 28");
            assert_rejected(
                &mut connection,
                "INSERT INTO autopilot_planner_events
                    (event_type, severity, summary, metadata_json)
                 VALUES ('unknown', 'info', 'Bad event', '{}')",
            )
            .await;
            assert_rejected(
                &mut connection,
                "INSERT INTO autopilot_planner_events
                    (event_type, severity, summary, metadata_json)
                 VALUES ('tick_started', 'urgent', 'Bad severity', '{}')",
            )
            .await;
            assert_rejected(
                &mut connection,
                "INSERT INTO autopilot_planner_events
                    (event_type, severity, summary, metadata_json)
                 VALUES ('tick_started', 'info', 'Bad JSON', 'nope')",
            )
            .await;

            connection
                .execute("DELETE FROM campaign_backlog_items WHERE id = 20; DELETE FROM workflow_runs WHERE id = 30;")
                .await
                .expect("linked local work should delete");
            let plan = sqlx::query(
                "SELECT campaign_backlog_item_id, workflow_run_id FROM autopilot_plans WHERE id = 40",
            )
            .fetch_one(&mut connection)
            .await
            .expect("plan should remain after linked work deletion");
            assert_eq!(plan.get::<Option<i64>, _>("campaign_backlog_item_id"), None);
            assert_eq!(plan.get::<Option<i64>, _>("workflow_run_id"), None);

            connection
                .execute("DELETE FROM source_import_batches WHERE id = 10")
                .await
                .expect("source batch should delete");
            let remaining_plans: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM autopilot_plans")
                .fetch_one(&mut connection)
                .await
                .expect("plan count should be queryable");
            let event_links = sqlx::query(
                "SELECT source_import_batch_id, autopilot_plan_id
                   FROM autopilot_planner_events
                  WHERE event_type = 'batch_planned'",
            )
            .fetch_one(&mut connection)
            .await
            .expect("planner event should remain");
            assert_eq!(remaining_plans, 0);
            assert_eq!(
                event_links.get::<Option<i64>, _>("source_import_batch_id"),
                None
            );
            assert_eq!(event_links.get::<Option<i64>, _>("autopilot_plan_id"), None);
        });
    }
}
