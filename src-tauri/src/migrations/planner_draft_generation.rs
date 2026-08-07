use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 30,
        description: "add_planner_linked_draft_generation",
        sql: "ALTER TABLE drafts
            ADD COLUMN content_intent TEXT NOT NULL DEFAULT 'idea'
            CHECK(content_intent IN ('event', 'launch', 'idea', 'community'));

        ALTER TABLE draft_generation_requests
            ADD COLUMN content_intent TEXT NOT NULL DEFAULT 'idea'
            CHECK(content_intent IN ('event', 'launch', 'idea', 'community'));
        ALTER TABLE draft_generation_requests
            ADD COLUMN workflow_run_id INTEGER
            REFERENCES workflow_runs(id) ON DELETE SET NULL;
        ALTER TABLE draft_generation_requests
            ADD COLUMN workflow_step_id INTEGER
            REFERENCES workflow_steps(id) ON DELETE SET NULL;

        CREATE INDEX idx_draft_generation_requests_workflow_run_id
            ON draft_generation_requests(workflow_run_id);
        CREATE INDEX idx_draft_generation_requests_workflow_step_id
            ON draft_generation_requests(workflow_step_id);
        CREATE UNIQUE INDEX idx_draft_generation_requests_active_step
            ON draft_generation_requests(workflow_step_id)
            WHERE workflow_step_id IS NOT NULL AND status IN ('pending', 'generated');

        CREATE TRIGGER draft_generation_requests_variant_count_insert
        BEFORE INSERT ON draft_generation_requests
        WHEN NEW.variant_count < 3 OR NEW.variant_count > 5
        BEGIN
            SELECT RAISE(ABORT, 'new draft generation requests require 3 to 5 variants');
        END;

        CREATE TRIGGER draft_generation_requests_variant_count_update
        BEFORE UPDATE OF variant_count ON draft_generation_requests
        WHEN NEW.variant_count <> OLD.variant_count
         AND (NEW.variant_count < 3 OR NEW.variant_count > 5)
        BEGIN
            SELECT RAISE(ABORT, 'updated draft generation requests require 3 to 5 variants');
        END;

        CREATE TABLE workflow_artifacts_v30 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workflow_run_id INTEGER NOT NULL,
            workflow_step_id INTEGER,
            artifact_type TEXT NOT NULL CHECK(artifact_type IN ('agent_run', 'candidate_post', 'draft')),
            artifact_id INTEGER NOT NULL CHECK(artifact_id > 0),
            summary TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE,
            FOREIGN KEY (workflow_step_id) REFERENCES workflow_steps(id) ON DELETE SET NULL,
            UNIQUE(workflow_run_id, artifact_type, artifact_id)
        );
        INSERT INTO workflow_artifacts_v30 (
            id, workflow_run_id, workflow_step_id, artifact_type, artifact_id,
            summary, created_at, updated_at
        )
        SELECT
            id, workflow_run_id, workflow_step_id, artifact_type, artifact_id,
            summary, created_at, updated_at
        FROM workflow_artifacts;
        DROP TABLE workflow_artifacts;
        ALTER TABLE workflow_artifacts_v30 RENAME TO workflow_artifacts;

        CREATE INDEX idx_workflow_artifacts_run_id ON workflow_artifacts(workflow_run_id);
        CREATE INDEX idx_workflow_artifacts_step_id ON workflow_artifacts(workflow_step_id);
        CREATE INDEX idx_workflow_artifacts_type_id ON workflow_artifacts(artifact_type, artifact_id);
        CREATE INDEX idx_workflow_artifacts_updated_at ON workflow_artifacts(updated_at);",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;
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
                 CREATE TABLE candidate_posts (
                    id INTEGER PRIMARY KEY,
                    campaign_id INTEGER NOT NULL,
                    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
                 );
                 CREATE TABLE drafts (
                    id INTEGER PRIMARY KEY,
                    campaign_id INTEGER NOT NULL,
                    candidate_post_id INTEGER NOT NULL,
                    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
                    FOREIGN KEY (candidate_post_id) REFERENCES candidate_posts(id) ON DELETE CASCADE
                 );
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
                 CREATE TABLE agent_runs (id INTEGER PRIMARY KEY);
                 CREATE TABLE draft_generation_requests (
                    id INTEGER PRIMARY KEY,
                    campaign_id INTEGER NOT NULL,
                    candidate_post_id INTEGER NOT NULL,
                    agent_run_id INTEGER,
                    provider_key TEXT NOT NULL,
                    variant_count INTEGER NOT NULL CHECK(variant_count >= 1 AND variant_count <= 5),
                    status TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending', 'generated', 'saved', 'failed', 'dismissed')),
                    created_draft_id INTEGER,
                    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
                    FOREIGN KEY (candidate_post_id) REFERENCES candidate_posts(id) ON DELETE CASCADE,
                    FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL,
                    FOREIGN KEY (created_draft_id) REFERENCES drafts(id) ON DELETE SET NULL
                 );
                 CREATE TABLE workflow_artifacts (
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
            .expect("migration 30 should execute over legacy data");
    }

    async fn insert_scope(connection: &mut SqliteConnection) {
        connection
            .execute(
                "INSERT INTO campaigns (id) VALUES (1);
                 INSERT INTO candidate_posts (id, campaign_id) VALUES (10, 1);
                 INSERT INTO workflow_runs (id, campaign_id) VALUES (20, 1);
                 INSERT INTO workflow_steps (id, workflow_run_id, step_key) VALUES (21, 20, 'draft');",
            )
            .await
            .expect("scope fixtures should insert");
    }

    #[test]
    fn migration_declares_intent_links_guards_and_draft_artifacts() {
        let migration = &migrations()[0];
        assert_eq!(migration.version, 30);
        assert_eq!(migration.description, "add_planner_linked_draft_generation");
        assert!(migration
            .sql
            .contains("content_intent IN ('event', 'launch', 'idea', 'community')"));
        assert!(migration.sql.contains("workflow_run_id INTEGER"));
        assert!(migration.sql.contains("workflow_step_id INTEGER"));
        assert!(migration.sql.contains("status IN ('pending', 'generated')"));
        assert!(migration.sql.contains("NEW.variant_count < 3"));
        assert!(migration
            .sql
            .contains("artifact_type IN ('agent_run', 'candidate_post', 'draft')"));
    }

    #[test]
    fn migration_preserves_legacy_rows_ids_and_defaults_intent() {
        tauri::async_runtime::block_on(async {
            let mut connection = legacy_connection().await;
            insert_scope(&mut connection).await;
            connection
                .execute(
                    "INSERT INTO drafts (id, campaign_id, candidate_post_id) VALUES (30, 1, 10);
                     INSERT INTO draft_generation_requests
                        (id, campaign_id, candidate_post_id, provider_key, variant_count, status)
                        VALUES (40, 1, 10, 'openai', 1, 'saved');
                     INSERT INTO workflow_artifacts
                        (id, workflow_run_id, workflow_step_id, artifact_type, artifact_id, summary)
                        VALUES (50, 20, 21, 'candidate_post', 10, 'Existing candidate');",
                )
                .await
                .expect("legacy rows should insert");

            apply_migration(&mut connection).await;

            let draft_intent: String =
                sqlx::query_scalar("SELECT content_intent FROM drafts WHERE id = 30")
                    .fetch_one(&mut connection)
                    .await
                    .expect("draft intent should be queryable");
            let request = sqlx::query(
                "SELECT id, variant_count, content_intent FROM draft_generation_requests WHERE id = 40",
            )
            .fetch_one(&mut connection)
            .await
            .expect("request should be preserved");
            let artifact = sqlx::query(
                "SELECT id, artifact_type, artifact_id FROM workflow_artifacts WHERE id = 50",
            )
            .fetch_one(&mut connection)
            .await
            .expect("artifact should be preserved");

            assert_eq!(draft_intent, "idea");
            assert_eq!(request.get::<i64, _>("id"), 40);
            assert_eq!(request.get::<i64, _>("variant_count"), 1);
            assert_eq!(request.get::<String, _>("content_intent"), "idea");
            assert_eq!(artifact.get::<i64, _>("id"), 50);
            assert_eq!(artifact.get::<String, _>("artifact_type"), "candidate_post");
            assert_eq!(artifact.get::<i64, _>("artifact_id"), 10);
        });
    }

    #[test]
    fn migration_rejects_invalid_intents_and_new_or_changed_low_counts() {
        tauri::async_runtime::block_on(async {
            let mut connection = legacy_connection().await;
            insert_scope(&mut connection).await;
            connection
                .execute(
                    "INSERT INTO draft_generation_requests
                        (id, campaign_id, candidate_post_id, provider_key, variant_count, status)
                        VALUES (40, 1, 10, 'openai', 2, 'saved');",
                )
                .await
                .expect("legacy low-count request should insert");
            apply_migration(&mut connection).await;

            assert!(sqlx::query(
                "INSERT INTO draft_generation_requests
                    (id, campaign_id, candidate_post_id, provider_key, variant_count)
                    VALUES (41, 1, 10, 'openai', 2)"
            )
            .execute(&mut connection)
            .await
            .is_err());
            assert!(sqlx::query(
                "UPDATE draft_generation_requests SET variant_count = 1 WHERE id = 40"
            )
            .execute(&mut connection)
            .await
            .is_err());
            sqlx::query("UPDATE draft_generation_requests SET status = 'dismissed' WHERE id = 40")
                .execute(&mut connection)
                .await
                .expect("unrelated updates to historical low counts should remain valid");
            assert!(sqlx::query(
                "INSERT INTO draft_generation_requests
                    (id, campaign_id, candidate_post_id, provider_key, variant_count, content_intent)
                    VALUES (42, 1, 10, 'openai', 3, 'promotion')"
            )
            .execute(&mut connection)
            .await
            .is_err());
            assert!(sqlx::query(
                "INSERT INTO drafts (id, campaign_id, candidate_post_id, content_intent)
                    VALUES (31, 1, 10, 'promotion')"
            )
            .execute(&mut connection)
            .await
            .is_err());
        });
    }

    #[test]
    fn migration_enforces_one_active_request_per_step_and_releases_terminal_attempts() {
        tauri::async_runtime::block_on(async {
            let mut connection = legacy_connection().await;
            insert_scope(&mut connection).await;
            apply_migration(&mut connection).await;

            sqlx::query(
                "INSERT INTO draft_generation_requests
                    (id, campaign_id, candidate_post_id, provider_key, variant_count,
                     workflow_run_id, workflow_step_id)
                    VALUES (40, 1, 10, 'openai', 3, 20, 21)",
            )
            .execute(&mut connection)
            .await
            .expect("first active linked request should insert");
            assert!(sqlx::query(
                "INSERT INTO draft_generation_requests
                    (id, campaign_id, candidate_post_id, provider_key, variant_count,
                     workflow_run_id, workflow_step_id, status)
                    VALUES (41, 1, 10, 'openai', 4, 20, 21, 'generated')"
            )
            .execute(&mut connection)
            .await
            .is_err());

            sqlx::query("UPDATE draft_generation_requests SET status = 'failed' WHERE id = 40")
                .execute(&mut connection)
                .await
                .expect("terminal status should release the active-step guard");
            sqlx::query(
                "INSERT INTO draft_generation_requests
                    (id, campaign_id, candidate_post_id, provider_key, variant_count,
                     workflow_run_id, workflow_step_id)
                    VALUES (41, 1, 10, 'openai', 5, 20, 21)",
            )
            .execute(&mut connection)
            .await
            .expect("retry should insert after terminal settlement");
        });
    }

    #[test]
    fn migration_enforces_workflow_foreign_keys_and_accepts_only_known_artifact_types() {
        tauri::async_runtime::block_on(async {
            let mut connection = legacy_connection().await;
            insert_scope(&mut connection).await;
            apply_migration(&mut connection).await;

            assert!(sqlx::query(
                "INSERT INTO draft_generation_requests
                    (id, campaign_id, candidate_post_id, provider_key, variant_count,
                     workflow_run_id, workflow_step_id)
                    VALUES (40, 1, 10, 'openai', 3, 999, 21)"
            )
            .execute(&mut connection)
            .await
            .is_err());
            assert!(sqlx::query(
                "INSERT INTO draft_generation_requests
                    (id, campaign_id, candidate_post_id, provider_key, variant_count,
                     workflow_run_id, workflow_step_id)
                    VALUES (41, 1, 10, 'openai', 3, 20, 999)"
            )
            .execute(&mut connection)
            .await
            .is_err());
            sqlx::query(
                "INSERT INTO draft_generation_requests
                    (id, campaign_id, candidate_post_id, provider_key, variant_count,
                     workflow_run_id, workflow_step_id, status)
                    VALUES (42, 1, 10, 'openai', 3, 20, 21, 'saved')",
            )
            .execute(&mut connection)
            .await
            .expect("valid linked request should insert");

            for (id, artifact_type) in [(50, "agent_run"), (51, "candidate_post"), (52, "draft")] {
                sqlx::query(
                    "INSERT INTO workflow_artifacts
                        (id, workflow_run_id, workflow_step_id, artifact_type, artifact_id)
                     VALUES (?1, 20, 21, ?2, ?3)",
                )
                .bind(id)
                .bind(artifact_type)
                .bind(id + 100)
                .execute(&mut connection)
                .await
                .expect("supported artifact type should insert");
            }
            assert!(sqlx::query(
                "INSERT INTO workflow_artifacts
                    (workflow_run_id, workflow_step_id, artifact_type, artifact_id)
                 VALUES (20, 21, 'approval', 999)"
            )
            .execute(&mut connection)
            .await
            .is_err());

            sqlx::query("DELETE FROM workflow_steps WHERE id = 21")
                .execute(&mut connection)
                .await
                .expect("workflow step should delete");
            let request_step: Option<i64> = sqlx::query_scalar(
                "SELECT workflow_step_id FROM draft_generation_requests WHERE id = 42",
            )
            .fetch_optional(&mut connection)
            .await
            .expect("request step should be queryable")
            .flatten();
            let artifact_steps: Vec<Option<i64>> =
                sqlx::query_scalar("SELECT workflow_step_id FROM workflow_artifacts ORDER BY id")
                    .fetch_all(&mut connection)
                    .await
                    .expect("artifact steps should be queryable");
            assert_eq!(request_step, None);
            assert_eq!(artifact_steps, vec![None, None, None]);
        });
    }
}
