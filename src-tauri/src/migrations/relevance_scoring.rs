use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg(test)]
pub const MAX_AGENT_INPUT_CONTEXT_BYTES: usize = 50_000;

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 29,
        description: "add_planner_linked_relevance_scoring",
        sql: "ALTER TABLE agent_runs
            ADD COLUMN input_context_json TEXT NOT NULL DEFAULT '{}'
            CHECK(length(input_context_json) <= 50000 AND json_valid(input_context_json));

        CREATE TABLE workflow_artifacts_v29 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workflow_run_id INTEGER NOT NULL,
            workflow_step_id INTEGER,
            artifact_type TEXT NOT NULL CHECK(artifact_type IN ('agent_run', 'candidate_post')),
            artifact_id INTEGER NOT NULL CHECK(artifact_id > 0),
            summary TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE,
            FOREIGN KEY (workflow_step_id) REFERENCES workflow_steps(id) ON DELETE SET NULL,
            UNIQUE(workflow_run_id, artifact_type, artifact_id)
        );
        INSERT INTO workflow_artifacts_v29 (
            id, workflow_run_id, workflow_step_id, artifact_type, artifact_id,
            summary, created_at, updated_at
        )
        SELECT
            id, workflow_run_id, workflow_step_id, artifact_type, artifact_id,
            summary, created_at, updated_at
        FROM workflow_artifacts;
        DROP TABLE workflow_artifacts;
        ALTER TABLE workflow_artifacts_v29 RENAME TO workflow_artifacts;

        CREATE INDEX idx_workflow_artifacts_run_id ON workflow_artifacts(workflow_run_id);
        CREATE INDEX idx_workflow_artifacts_step_id ON workflow_artifacts(workflow_step_id);
        CREATE INDEX idx_workflow_artifacts_type_id ON workflow_artifacts(artifact_type, artifact_id);
        CREATE INDEX idx_workflow_artifacts_updated_at ON workflow_artifacts(updated_at);

        INSERT OR IGNORE INTO workflow_artifacts (
            workflow_run_id, workflow_step_id, artifact_type, artifact_id, summary
        )
        SELECT
            ap.workflow_run_id,
            ws.id,
            'candidate_post',
            sii.candidate_post_id,
            'Planner scoring candidate from source batch #' || ap.source_import_batch_id
        FROM autopilot_plans ap
        INNER JOIN workflow_steps ws
            ON ws.workflow_run_id = ap.workflow_run_id
           AND ws.step_key = 'score'
        INNER JOIN source_import_items sii
            ON sii.source_import_batch_id = ap.source_import_batch_id
           AND sii.status = 'accepted'
           AND sii.candidate_post_id IS NOT NULL
        INNER JOIN candidate_posts cp
            ON cp.id = sii.candidate_post_id
           AND cp.campaign_id = ap.campaign_id
        WHERE ap.status = 'planned'
          AND ap.workflow_run_id IS NOT NULL;",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::{migrations, MAX_AGENT_INPUT_CONTEXT_BYTES};
    use sqlx::{sqlite::SqliteConnectOptions, Connection, Executor, Row, SqliteConnection};
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
                "CREATE TABLE campaigns (id INTEGER PRIMARY KEY);
                 CREATE TABLE workflow_runs (
                    id INTEGER PRIMARY KEY,
                    campaign_id INTEGER NOT NULL,
                    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
                 );
                 CREATE TABLE workflow_steps (
                    id INTEGER PRIMARY KEY,
                    workflow_run_id INTEGER NOT NULL,
                    step_key TEXT NOT NULL,
                    FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
                 );
                 CREATE TABLE agent_runs (
                    id INTEGER PRIMARY KEY,
                    campaign_id INTEGER NOT NULL,
                    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
                 );
                 CREATE TABLE workflow_artifacts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workflow_run_id INTEGER NOT NULL,
                    workflow_step_id INTEGER,
                    artifact_type TEXT NOT NULL CHECK(artifact_type IN ('agent_run')),
                    artifact_id INTEGER NOT NULL CHECK(artifact_id > 0),
                    summary TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE,
                    FOREIGN KEY (workflow_step_id) REFERENCES workflow_steps(id) ON DELETE SET NULL,
                    UNIQUE(workflow_run_id, artifact_type, artifact_id)
                 );
                 CREATE TABLE source_import_batches (
                    id INTEGER PRIMARY KEY,
                    campaign_id INTEGER NOT NULL
                 );
                 CREATE TABLE candidate_posts (
                    id INTEGER PRIMARY KEY,
                    campaign_id INTEGER NOT NULL
                 );
                 CREATE TABLE source_import_items (
                    id INTEGER PRIMARY KEY,
                    source_import_batch_id INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    candidate_post_id INTEGER
                 );
                 CREATE TABLE autopilot_plans (
                    id INTEGER PRIMARY KEY,
                    campaign_id INTEGER NOT NULL,
                    source_import_batch_id INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    workflow_run_id INTEGER
                 );
                 CREATE INDEX idx_workflow_artifacts_run_id ON workflow_artifacts(workflow_run_id);
                 CREATE INDEX idx_workflow_artifacts_step_id ON workflow_artifacts(workflow_step_id);
                 CREATE INDEX idx_workflow_artifacts_type_id ON workflow_artifacts(artifact_type, artifact_id);
                 CREATE INDEX idx_workflow_artifacts_updated_at ON workflow_artifacts(updated_at);",
            )
            .await
            .expect("legacy schema should be created");
        connection
    }

    async fn apply_migration(connection: &mut SqliteConnection) {
        connection
            .execute(migrations()[0].sql)
            .await
            .expect("migration 29 should execute over legacy data");
    }

    #[test]
    fn migration_declares_bounded_context_and_candidate_artifacts() {
        let migration = &migrations()[0];
        assert_eq!(migration.version, 29);
        assert_eq!(
            migration.description,
            "add_planner_linked_relevance_scoring"
        );
        assert!(migration
            .sql
            .contains("input_context_json TEXT NOT NULL DEFAULT '{}'"));
        assert!(migration.sql.contains("json_valid(input_context_json)"));
        assert!(migration
            .sql
            .contains("length(input_context_json) <= 50000"));
        assert!(migration
            .sql
            .contains("artifact_type IN ('agent_run', 'candidate_post')"));
        assert!(migration.sql.contains("sii.status = 'accepted'"));
        assert!(migration.sql.contains("cp.campaign_id = ap.campaign_id"));
        assert_eq!(MAX_AGENT_INPUT_CONTEXT_BYTES, 50_000);
    }

    #[test]
    fn migration_preserves_agent_artifacts_and_backfills_exact_surviving_candidates() {
        tauri::async_runtime::block_on(async {
            let mut connection = legacy_connection().await;
            connection
                .execute(
                    "INSERT INTO campaigns (id) VALUES (1), (2);
                     INSERT INTO workflow_runs (id, campaign_id) VALUES (10, 1), (20, 2);
                     INSERT INTO workflow_steps (id, workflow_run_id, step_key)
                        VALUES (11, 10, 'score'), (12, 10, 'draft'), (21, 20, 'score');
                     INSERT INTO agent_runs (id, campaign_id) VALUES (100, 1);
                     INSERT INTO workflow_artifacts
                        (id, workflow_run_id, workflow_step_id, artifact_type, artifact_id, summary)
                        VALUES (1, 10, 11, 'agent_run', 100, 'Existing agent run');
                     INSERT INTO source_import_batches (id, campaign_id) VALUES (30, 1), (40, 2);
                     INSERT INTO candidate_posts (id, campaign_id) VALUES (200, 1), (201, 1), (202, 2);
                     INSERT INTO source_import_items
                        (id, source_import_batch_id, status, candidate_post_id)
                        VALUES
                        (1, 30, 'accepted', 200),
                        (2, 30, 'rejected', 201),
                        (3, 30, 'accepted', NULL),
                        (4, 30, 'accepted', 202),
                        (5, 40, 'accepted', 202);
                     INSERT INTO autopilot_plans
                        (id, campaign_id, source_import_batch_id, status, workflow_run_id)
                        VALUES (50, 1, 30, 'planned', 10), (60, 2, 40, 'planned', 20);",
                )
                .await
                .expect("populated legacy fixtures should insert");

            apply_migration(&mut connection).await;

            let artifacts = sqlx::query(
                "SELECT id, workflow_run_id, workflow_step_id, artifact_type, artifact_id, summary
                   FROM workflow_artifacts ORDER BY id",
            )
            .fetch_all(&mut connection)
            .await
            .expect("migrated artifacts should be queryable");
            assert_eq!(artifacts.len(), 3);
            assert_eq!(artifacts[0].get::<i64, _>("id"), 1);
            assert_eq!(artifacts[0].get::<String, _>("artifact_type"), "agent_run");
            assert_eq!(artifacts[1].get::<i64, _>("workflow_run_id"), 10);
            assert_eq!(artifacts[1].get::<i64, _>("workflow_step_id"), 11);
            assert_eq!(artifacts[1].get::<i64, _>("artifact_id"), 200);
            assert_eq!(artifacts[2].get::<i64, _>("workflow_run_id"), 20);
            assert_eq!(artifacts[2].get::<i64, _>("artifact_id"), 202);
        });
    }

    #[test]
    fn migration_rejects_invalid_or_oversized_context_and_preserves_removed_scope() {
        tauri::async_runtime::block_on(async {
            let mut connection = legacy_connection().await;
            connection
                .execute(
                    "INSERT INTO campaigns (id) VALUES (1);
                     INSERT INTO workflow_runs (id, campaign_id) VALUES (10, 1);
                     INSERT INTO workflow_steps (id, workflow_run_id, step_key) VALUES (11, 10, 'score');
                     INSERT INTO agent_runs (id, campaign_id) VALUES (100, 1);",
                )
                .await
                .expect("fixtures should insert");
            apply_migration(&mut connection).await;

            assert!(sqlx::query(
                "UPDATE agent_runs SET input_context_json = 'not-json' WHERE id = 100"
            )
            .execute(&mut connection)
            .await
            .is_err());
            let oversized = format!(
                "{{\"value\":\"{}\"}}",
                "x".repeat(MAX_AGENT_INPUT_CONTEXT_BYTES)
            );
            assert!(
                sqlx::query("UPDATE agent_runs SET input_context_json = ?1 WHERE id = 100")
                    .bind(oversized)
                    .execute(&mut connection)
                    .await
                    .is_err()
            );

            connection
                .execute(
                    "INSERT INTO workflow_artifacts
                        (workflow_run_id, workflow_step_id, artifact_type, artifact_id, summary)
                     VALUES (10, 11, 'candidate_post', 999, 'Removed candidate');",
                )
                .await
                .expect("candidate artifact should not require a live candidate row");
            let count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM workflow_artifacts WHERE artifact_type = 'candidate_post'",
            )
            .fetch_one(&mut connection)
            .await
            .expect("candidate artifact count should be queryable");
            assert_eq!(count, 1);
        });
    }
}
