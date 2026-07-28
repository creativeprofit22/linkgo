use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 24,
            description: "create_campaign_backlog_items",
            sql: "CREATE TABLE IF NOT EXISTS campaign_backlog_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                campaign_id INTEGER NOT NULL,
                recurrence_parent_id INTEGER,
                work_type TEXT NOT NULL CHECK(work_type IN ('research', 'scoring', 'drafting', 'approval', 'scheduling', 'metrics', 'retry', 'other')),
                title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
                details TEXT NOT NULL DEFAULT '' CHECK(length(details) <= 4000),
                owner_type TEXT NOT NULL CHECK(owner_type IN ('operator', 'linkgo')),
                status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'blocked', 'completed', 'cancelled')),
                due_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', due_at) IS NOT NULL AND strftime('%Y-%m-%dT%H:%M:%fZ', due_at) = due_at),
                recurrence TEXT NOT NULL DEFAULT 'none' CHECK(recurrence IN ('none', 'daily', 'weekly')),
                completed_at TEXT CHECK(completed_at IS NULL OR (strftime('%Y-%m-%dT%H:%M:%fZ', completed_at) IS NOT NULL AND strftime('%Y-%m-%dT%H:%M:%fZ', completed_at) = completed_at)),
                cancelled_at TEXT CHECK(cancelled_at IS NULL OR (strftime('%Y-%m-%dT%H:%M:%fZ', cancelled_at) IS NOT NULL AND strftime('%Y-%m-%dT%H:%M:%fZ', cancelled_at) = cancelled_at)),
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
                FOREIGN KEY (recurrence_parent_id) REFERENCES campaign_backlog_items(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_campaign_backlog_campaign_status_due
                ON campaign_backlog_items(campaign_id, status, due_at);
            CREATE INDEX IF NOT EXISTS idx_campaign_backlog_status_due
                ON campaign_backlog_items(status, due_at);
            CREATE INDEX IF NOT EXISTS idx_campaign_backlog_owner_status_due
                ON campaign_backlog_items(owner_type, status, due_at);
            CREATE INDEX IF NOT EXISTS idx_campaign_backlog_recurrence_parent
                ON campaign_backlog_items(recurrence_parent_id);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 25,
            description: "add_campaign_backlog_recurrence_timezone",
            sql: "ALTER TABLE campaign_backlog_items
                ADD COLUMN recurrence_timezone TEXT NOT NULL DEFAULT ''
                CHECK(recurrence_timezone = '' OR length(trim(recurrence_timezone)) BETWEEN 1 AND 100);
            UPDATE campaign_backlog_items
               SET recurrence_timezone = 'UTC'
             WHERE recurrence IN ('daily', 'weekly');
            CREATE TRIGGER campaign_backlog_recurrence_timezone_insert
            BEFORE INSERT ON campaign_backlog_items
            WHEN (NEW.recurrence = 'none' AND NEW.recurrence_timezone <> '')
              OR (NEW.recurrence IN ('daily', 'weekly') AND NEW.recurrence_timezone = '')
            BEGIN
                SELECT RAISE(ABORT, 'invalid campaign backlog recurrence timezone');
            END;
            CREATE TRIGGER campaign_backlog_recurrence_timezone_update
            BEFORE UPDATE OF recurrence, recurrence_timezone ON campaign_backlog_items
            WHEN (NEW.recurrence = 'none' AND NEW.recurrence_timezone <> '')
              OR (NEW.recurrence IN ('daily', 'weekly') AND NEW.recurrence_timezone = '')
            BEGIN
                SELECT RAISE(ABORT, 'invalid campaign backlog recurrence timezone');
            END;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 26,
            description: "add_campaign_backlog_history_indexes",
            sql: "CREATE INDEX IF NOT EXISTS idx_campaign_backlog_history_terminal_at
                ON campaign_backlog_items(
                    COALESCE(completed_at, cancelled_at) DESC,
                    id DESC
                )
                WHERE status IN ('completed', 'cancelled');
            CREATE INDEX IF NOT EXISTS idx_campaign_backlog_campaign_history_terminal_at
                ON campaign_backlog_items(
                    campaign_id,
                    COALESCE(completed_at, cancelled_at) DESC,
                    id DESC
                )
                WHERE status IN ('completed', 'cancelled');",
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::migrations;
    use sqlx::{sqlite::SqliteConnectOptions, Connection, Executor, Row, SqliteConnection};
    use std::str::FromStr;

    async fn migrated_connection() -> SqliteConnection {
        let options = SqliteConnectOptions::from_str("sqlite::memory:")
            .expect("in-memory SQLite URL should be valid")
            .foreign_keys(true);
        let mut connection = SqliteConnection::connect_with(&options)
            .await
            .expect("in-memory SQLite should open");
        connection
            .execute(
                "CREATE TABLE campaigns (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'draft'
                        CHECK(status IN ('draft', 'active', 'paused', 'archived'))
                )",
            )
            .await
            .expect("campaign prerequisite should be created");
        for migration in migrations() {
            connection
                .execute(migration.sql)
                .await
                .expect("campaign backlog migration should execute");
        }
        connection
    }

    async fn assert_rejected(connection: &mut SqliteConnection, sql: &str) {
        assert!(
            sqlx::query(sql).execute(&mut *connection).await.is_err(),
            "SQLite accepted invalid backlog SQL: {sql}"
        );
    }

    #[test]
    fn campaign_backlog_migration_declares_expected_schema() {
        let migrations = migrations();
        let migration = &migrations[0];
        let timezone_migration = &migrations[1];
        let history_index_migration = &migrations[2];

        assert_eq!(migration.version, 24);
        assert_eq!(migration.description, "create_campaign_backlog_items");
        assert_eq!(timezone_migration.version, 25);
        assert_eq!(
            timezone_migration.description,
            "add_campaign_backlog_recurrence_timezone"
        );
        for declaration in [
            "ADD COLUMN recurrence_timezone",
            "SET recurrence_timezone = 'UTC'",
            "campaign_backlog_recurrence_timezone_insert",
            "campaign_backlog_recurrence_timezone_update",
        ] {
            assert!(
                timezone_migration.sql.contains(declaration),
                "missing {declaration}"
            );
        }
        assert_eq!(history_index_migration.version, 26);
        assert_eq!(
            history_index_migration.description,
            "add_campaign_backlog_history_indexes"
        );
        for declaration in [
            "CREATE INDEX IF NOT EXISTS idx_campaign_backlog_history_terminal_at",
            "CREATE INDEX IF NOT EXISTS idx_campaign_backlog_campaign_history_terminal_at",
            "COALESCE(completed_at, cancelled_at) DESC",
            "id DESC",
            "WHERE status IN ('completed', 'cancelled')",
        ] {
            assert!(
                history_index_migration.sql.contains(declaration),
                "missing {declaration}"
            );
        }
        for declaration in [
            "CREATE TABLE IF NOT EXISTS campaign_backlog_items",
            "ON DELETE CASCADE",
            "ON DELETE SET NULL",
            "idx_campaign_backlog_campaign_status_due",
            "idx_campaign_backlog_status_due",
            "idx_campaign_backlog_owner_status_due",
            "idx_campaign_backlog_recurrence_parent",
        ] {
            assert!(migration.sql.contains(declaration), "missing {declaration}");
        }
    }

    #[test]
    fn campaign_backlog_timezone_migration_backfills_existing_recurrence_to_utc() {
        tauri::async_runtime::block_on(async {
            let options = SqliteConnectOptions::from_str("sqlite::memory:")
                .expect("in-memory SQLite URL should be valid")
                .foreign_keys(true);
            let mut connection = SqliteConnection::connect_with(&options)
                .await
                .expect("in-memory SQLite should open");
            connection
                .execute(
                    "CREATE TABLE campaigns (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        status TEXT NOT NULL DEFAULT 'draft'
                    )",
                )
                .await
                .expect("campaign prerequisite should be created");
            connection
                .execute(migrations()[0].sql)
                .await
                .expect("migration 24 should execute");
            connection
                .execute("INSERT INTO campaigns (id, name) VALUES (1, 'Legacy')")
                .await
                .expect("campaign should insert");
            connection
                .execute(
                    "INSERT INTO campaign_backlog_items
                     (campaign_id, work_type, title, owner_type, due_at, recurrence)
                     VALUES (1, 'research', 'Legacy recurrence', 'operator',
                             '2026-07-28T09:30:00.000Z', 'daily')",
                )
                .await
                .expect("legacy recurrence should insert");
            connection
                .execute(migrations()[1].sql)
                .await
                .expect("migration 25 should execute");

            let time_zone: String = sqlx::query_scalar(
                "SELECT recurrence_timezone FROM campaign_backlog_items LIMIT 1",
            )
            .fetch_one(&mut connection)
            .await
            .expect("backfilled time zone should be readable");
            assert_eq!(time_zone, "UTC");
        });
    }

    #[test]
    fn campaign_backlog_migration_enforces_constraints_and_indexes() {
        tauri::async_runtime::block_on(async {
            let mut connection = migrated_connection().await;
            sqlx::query("INSERT INTO campaigns (id, name, status) VALUES (1, 'Launch', 'active')")
                .execute(&mut connection)
                .await
                .expect("campaign should insert");
            sqlx::query(
                "INSERT INTO campaign_backlog_items
                 (id, campaign_id, work_type, title, owner_type, due_at, recurrence, recurrence_timezone)
                 VALUES (10, 1, 'research', 'Review market', 'operator',
                         '2026-07-28T09:30:00.000Z', 'daily', 'America/New_York')",
            )
            .execute(&mut connection)
            .await
            .expect("valid backlog item should insert");
            sqlx::query(
                "INSERT INTO campaign_backlog_items
                 (id, campaign_id, recurrence_parent_id, work_type, title, owner_type, due_at)
                 VALUES (11, 1, 10, 'other', 'Follow up', 'linkgo',
                         '2026-07-29T09:30:00.000Z')",
            )
            .execute(&mut connection)
            .await
            .expect("valid recurring successor should insert");

            for sql in [
                "INSERT INTO campaign_backlog_items (campaign_id, work_type, title, owner_type, due_at) VALUES (999, 'research', 'Bad campaign', 'operator', '2026-07-28T09:30:00.000Z')",
                "INSERT INTO campaign_backlog_items (campaign_id, work_type, title, owner_type, status, due_at) VALUES (1, 'research', 'Bad status', 'operator', 'unknown', '2026-07-28T09:30:00.000Z')",
                "INSERT INTO campaign_backlog_items (campaign_id, work_type, title, owner_type, due_at) VALUES (1, 'research', 'Bad owner', 'robot', '2026-07-28T09:30:00.000Z')",
                "INSERT INTO campaign_backlog_items (campaign_id, work_type, title, owner_type, due_at, recurrence) VALUES (1, 'research', 'Bad recurrence', 'operator', '2026-07-28T09:30:00.000Z', 'monthly')",
                "INSERT INTO campaign_backlog_items (campaign_id, work_type, title, owner_type, due_at, recurrence) VALUES (1, 'research', 'Missing zone', 'operator', '2026-07-28T09:30:00.000Z', 'daily')",
                "INSERT INTO campaign_backlog_items (campaign_id, work_type, title, owner_type, due_at, recurrence_timezone) VALUES (1, 'research', 'Unexpected zone', 'operator', '2026-07-28T09:30:00.000Z', 'UTC')",
                "INSERT INTO campaign_backlog_items (campaign_id, work_type, title, owner_type, due_at) VALUES (1, 'publishing', 'Bad work', 'operator', '2026-07-28T09:30:00.000Z')",
                "INSERT INTO campaign_backlog_items (campaign_id, recurrence_parent_id, work_type, title, owner_type, due_at) VALUES (1, 999, 'research', 'Bad parent', 'operator', '2026-07-28T09:30:00.000Z')",
                "INSERT INTO campaign_backlog_items (campaign_id, work_type, title, owner_type, due_at) VALUES (1, 'research', 'Bad time', 'operator', 'tomorrow')",
                "INSERT INTO campaign_backlog_items (campaign_id, work_type, title, owner_type, due_at) VALUES (1, 'research', '   ', 'operator', '2026-07-28T09:30:00.000Z')",
            ] {
                assert_rejected(&mut connection, sql).await;
            }

            let timestamp_row = sqlx::query(
                "SELECT created_at, updated_at FROM campaign_backlog_items WHERE id = 10",
            )
            .fetch_one(&mut connection)
            .await
            .expect("timestamps should be queryable");
            for column in ["created_at", "updated_at"] {
                let value: String = timestamp_row.get(column);
                assert!(value.ends_with('Z'));
                assert_eq!(value.len(), 24);
            }

            for (index_name, expected_columns) in [
                (
                    "idx_campaign_backlog_campaign_status_due",
                    vec!["campaign_id", "status", "due_at"],
                ),
                ("idx_campaign_backlog_status_due", vec!["status", "due_at"]),
                (
                    "idx_campaign_backlog_owner_status_due",
                    vec!["owner_type", "status", "due_at"],
                ),
                (
                    "idx_campaign_backlog_recurrence_parent",
                    vec!["recurrence_parent_id"],
                ),
            ] {
                let columns: Vec<String> =
                    sqlx::query_scalar("SELECT name FROM pragma_index_info(?1) ORDER BY seqno")
                        .bind(index_name)
                        .fetch_all(&mut connection)
                        .await
                        .expect("index metadata should be queryable");
                assert_eq!(columns, expected_columns);
            }

            sqlx::query("DELETE FROM campaign_backlog_items WHERE id = 10")
                .execute(&mut connection)
                .await
                .expect("parent should delete");
            let parent_id: Option<i64> = sqlx::query_scalar(
                "SELECT recurrence_parent_id FROM campaign_backlog_items WHERE id = 11",
            )
            .fetch_one(&mut connection)
            .await
            .expect("successor should remain");
            assert_eq!(parent_id, None);

            sqlx::query("DELETE FROM campaigns WHERE id = 1")
                .execute(&mut connection)
                .await
                .expect("campaign should delete");
            let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM campaign_backlog_items")
                .fetch_one(&mut connection)
                .await
                .expect("backlog count should be queryable");
            assert_eq!(remaining, 0);
        });
    }

    #[test]
    fn campaign_backlog_history_queries_use_terminal_order_indexes() {
        tauri::async_runtime::block_on(async {
            let mut connection = migrated_connection().await;
            connection
                .execute(
                    "INSERT INTO campaigns (id, name, status)
                     VALUES (1, 'Launch', 'active'), (2, 'Retention', 'active');
                     INSERT INTO campaign_backlog_items
                         (id, campaign_id, work_type, title, owner_type, status, due_at, completed_at)
                     VALUES
                         (20, 1, 'research', 'Completed one', 'operator', 'completed',
                          '2026-07-27T09:30:00.000Z', '2026-07-27T10:30:00.000Z'),
                         (21, 2, 'metrics', 'Completed two', 'linkgo', 'completed',
                          '2026-07-28T09:30:00.000Z', '2026-07-28T10:30:00.000Z');
                     INSERT INTO campaign_backlog_items
                         (id, campaign_id, work_type, title, owner_type, status, due_at, cancelled_at)
                     VALUES
                         (22, 1, 'drafting', 'Cancelled one', 'operator', 'cancelled',
                          '2026-07-29T09:30:00.000Z', '2026-07-28T11:30:00.000Z'),
                         (23, 2, 'other', 'Cancelled two', 'linkgo', 'cancelled',
                          '2026-07-30T09:30:00.000Z', '2026-07-28T12:30:00.000Z');",
                )
                .await
                .expect("representative terminal backlog rows should insert");

            for (index_name, expected_definition) in [
                (
                    "idx_campaign_backlog_history_terminal_at",
                    "ON campaign_backlog_items(\n                    COALESCE(completed_at, cancelled_at) DESC,\n                    id DESC\n                )",
                ),
                (
                    "idx_campaign_backlog_campaign_history_terminal_at",
                    "ON campaign_backlog_items(\n                    campaign_id,\n                    COALESCE(completed_at, cancelled_at) DESC,\n                    id DESC\n                )",
                ),
            ] {
                let definition: String = sqlx::query_scalar(
                    "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?1",
                )
                .bind(index_name)
                .fetch_one(&mut connection)
                .await
                .expect("history index definition should be queryable");
                assert!(
                    definition.contains(expected_definition),
                    "unexpected {index_name} definition: {definition}"
                );
                assert!(
                    definition.contains("WHERE status IN ('completed', 'cancelled')"),
                    "{index_name} should contain only terminal rows"
                );
            }

            for (label, index_name, campaign_clause) in [
                (
                    "all-campaign",
                    "idx_campaign_backlog_history_terminal_at",
                    "",
                ),
                (
                    "campaign-filtered",
                    "idx_campaign_backlog_campaign_history_terminal_at",
                    "AND cbi.campaign_id = 1",
                ),
            ] {
                let sql = format!(
                    "EXPLAIN QUERY PLAN
                     SELECT cbi.*, c.name AS campaign_name, c.status AS campaign_status
                     FROM campaign_backlog_items AS cbi INDEXED BY {index_name}
                     INNER JOIN campaigns c ON c.id = cbi.campaign_id
                     WHERE cbi.status IN ('completed', 'cancelled') {campaign_clause}
                     ORDER BY COALESCE(cbi.completed_at, cbi.cancelled_at) DESC, cbi.id DESC
                     LIMIT 100"
                );
                let details = sqlx::query(&sql)
                    .fetch_all(&mut connection)
                    .await
                    .expect("history query plan should be available")
                    .into_iter()
                    .map(|row| row.get::<String, _>("detail"))
                    .collect::<Vec<_>>()
                    .join("\n");

                assert!(
                    details.contains(&format!("USING INDEX {index_name}")),
                    "{label} history did not use {index_name}: {details}"
                );
                assert!(
                    !details.contains("USE TEMP B-TREE FOR ORDER BY"),
                    "{label} history used a temporary sort: {details}"
                );
            }
        });
    }
}
