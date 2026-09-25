use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 32,
        description: "link_planner_draft_audits_to_step_executions",
        sql: "ALTER TABLE draft_ai_audit_runs
            ADD COLUMN workflow_step_execution_id INTEGER
            REFERENCES workflow_step_executions(id) ON DELETE SET NULL;

        CREATE UNIQUE INDEX idx_draft_ai_audit_runs_workflow_step_execution_id
            ON draft_ai_audit_runs(workflow_step_execution_id)
            WHERE workflow_step_execution_id IS NOT NULL;",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;
    use crate::migrations::{draft_ai_audits, get_migrations};
    use sqlx::{sqlite::SqliteConnectOptions, Connection, Executor, SqliteConnection};
    use std::str::FromStr;

    async fn legacy_connection() -> SqliteConnection {
        let options = SqliteConnectOptions::from_str("sqlite::memory:")
            .expect("in-memory SQLite URL should be valid")
            .foreign_keys(true);
        let mut connection = SqliteConnection::connect_with(&options)
            .await
            .expect("in-memory SQLite should open");
        connection
            .execute(
                "CREATE TABLE draft_variants (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    draft_id INTEGER NOT NULL,
                    variant_number INTEGER NOT NULL,
                    hook TEXT NOT NULL DEFAULT '',
                    body TEXT NOT NULL DEFAULT '',
                    cta TEXT NOT NULL DEFAULT '',
                    hashtags TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'draft',
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                 );
                 CREATE TABLE agent_runs (id INTEGER PRIMARY KEY AUTOINCREMENT);
                 CREATE TABLE workflow_step_executions (id INTEGER PRIMARY KEY AUTOINCREMENT);
                 INSERT INTO draft_variants (id, draft_id, variant_number) VALUES (10, 1, 1);
                 INSERT INTO workflow_step_executions (id) VALUES (20), (21);",
            )
            .await
            .expect("legacy planner audit prerequisites should be created");
        connection
    }

    async fn version_31_connection() -> SqliteConnection {
        let mut connection = legacy_connection().await;
        connection
            .execute(draft_ai_audits::migrations()[0].sql)
            .await
            .expect("migration 31 should execute first");
        connection
    }

    async fn assert_rejected(connection: &mut SqliteConnection, sql: &str) {
        assert!(
            sqlx::query(sql).execute(&mut *connection).await.is_err(),
            "SQLite accepted invalid planner audit SQL: {sql}"
        );
    }

    #[test]
    fn migration_is_registered_after_draft_ai_audits_in_production_order() {
        let migration = &migrations()[0];
        assert_eq!(migration.version, 32);
        assert_eq!(
            migration.description,
            "link_planner_draft_audits_to_step_executions"
        );
        assert!(migration.sql.contains("workflow_step_execution_id INTEGER"));
        assert!(migration
            .sql
            .contains("REFERENCES workflow_step_executions(id) ON DELETE SET NULL"));
        assert!(migration
            .sql
            .contains("CREATE UNIQUE INDEX idx_draft_ai_audit_runs_workflow_step_execution_id"));

        let registered = get_migrations();
        let versions: Vec<i64> = registered.iter().map(|item| item.version).collect();
        assert!(
            versions.windows(2).all(|pair| pair[0] < pair[1]),
            "migration versions must be strictly increasing: {versions:?}"
        );
        let position = versions
            .iter()
            .position(|version| *version == 32)
            .expect("migration 32 should be registered");
        assert!(position > 0, "migration 32 must follow migration 31");
        assert_eq!(versions[position - 1], 31);
    }

    #[test]
    fn migration_preserves_legacy_audits_with_null_execution_links() {
        tauri::async_runtime::block_on(async {
            let mut connection = version_31_connection().await;
            connection
                .execute(
                    "INSERT INTO draft_ai_audit_runs
                        (id, draft_variant_id, content_revision, provider_key)
                     VALUES (30, 10, 1, 'openai');",
                )
                .await
                .expect("legacy audit should insert before migration 32");

            connection
                .execute(migrations()[0].sql)
                .await
                .expect("migration 32 should preserve legacy audits");

            let execution_id: Option<i64> = sqlx::query_scalar(
                "SELECT workflow_step_execution_id FROM draft_ai_audit_runs WHERE id = 30",
            )
            .fetch_one(&mut connection)
            .await
            .expect("legacy audit execution link should be queryable");
            assert_eq!(execution_id, None);
        });
    }

    #[test]
    fn execution_link_enforces_foreign_key_uniqueness_and_set_null() {
        tauri::async_runtime::block_on(async {
            let mut connection = version_31_connection().await;
            connection
                .execute(migrations()[0].sql)
                .await
                .expect("migration 32 should execute after migration 31");

            connection
                .execute(
                    "INSERT INTO draft_ai_audit_runs
                        (id, draft_variant_id, content_revision, provider_key,
                         workflow_step_execution_id)
                     VALUES (30, 10, 1, 'openai', 20);",
                )
                .await
                .expect("valid execution-linked audit should insert");

            assert_rejected(
                &mut connection,
                "INSERT INTO draft_ai_audit_runs
                    (id, draft_variant_id, content_revision, provider_key, status,
                     completed_at, workflow_step_execution_id)
                 VALUES (31, 10, 1, 'openai', 'failed', datetime('now'), 999)",
            )
            .await;
            assert_rejected(
                &mut connection,
                "INSERT INTO draft_ai_audit_runs
                    (id, draft_variant_id, content_revision, provider_key, status,
                     completed_at, workflow_step_execution_id)
                 VALUES (31, 10, 1, 'openai', 'failed', datetime('now'), 20)",
            )
            .await;

            connection
                .execute(
                    "INSERT INTO draft_ai_audit_runs
                        (id, draft_variant_id, content_revision, provider_key, status, completed_at)
                     VALUES (31, 10, 1, 'openai', 'failed', datetime('now'));
                     INSERT INTO draft_ai_audit_runs
                        (id, draft_variant_id, content_revision, provider_key, status, completed_at)
                     VALUES (32, 10, 1, 'openai', 'failed', datetime('now'));",
                )
                .await
                .expect("multiple unlinked audit rows should remain valid");

            sqlx::query("DELETE FROM workflow_step_executions WHERE id = 20")
                .execute(&mut connection)
                .await
                .expect("linked execution should delete");
            let execution_id: Option<i64> = sqlx::query_scalar(
                "SELECT workflow_step_execution_id FROM draft_ai_audit_runs WHERE id = 30",
            )
            .fetch_one(&mut connection)
            .await
            .expect("audit should remain after execution deletion");
            assert_eq!(execution_id, None);
        });
    }
}
