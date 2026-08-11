use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 31,
        description: "add_draft_content_revisions_and_ai_audits",
        sql: "ALTER TABLE draft_variants
            ADD COLUMN content_revision INTEGER NOT NULL DEFAULT 1
            CHECK(content_revision >= 1);

        CREATE TRIGGER draft_variants_increment_content_revision
        AFTER UPDATE OF hook, body, cta, hashtags ON draft_variants
        FOR EACH ROW
        WHEN NEW.hook IS NOT OLD.hook
          OR NEW.body IS NOT OLD.body
          OR NEW.cta IS NOT OLD.cta
          OR NEW.hashtags IS NOT OLD.hashtags
        BEGIN
            UPDATE draft_variants
            SET content_revision = OLD.content_revision + 1
            WHERE id = NEW.id;
        END;

        CREATE TABLE IF NOT EXISTS draft_ai_audit_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            draft_variant_id INTEGER NOT NULL,
            content_revision INTEGER NOT NULL CHECK(content_revision >= 1),
            agent_run_id INTEGER UNIQUE,
            provider_key TEXT NOT NULL CHECK(provider_key IN (
                'dry_run', 'anthropic', 'xiaomi', 'openai', 'gemini', 'glm',
                'moonshot', 'deepseek', 'openrouter', 'sakana', 'minimax', 'custom'
            )),
            model_name TEXT NOT NULL DEFAULT '' CHECK(length(model_name) <= 120),
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
            summary TEXT NOT NULL DEFAULT '' CHECK(length(summary) <= 1000),
            error_message TEXT NOT NULL DEFAULT '' CHECK(length(error_message) <= 1000),
            started_at TEXT,
            completed_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (draft_variant_id) REFERENCES draft_variants(id) ON DELETE CASCADE,
            FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL,
            CHECK(
                (status IN ('pending', 'running') AND completed_at IS NULL)
                OR
                (status IN ('completed', 'failed', 'cancelled') AND completed_at IS NOT NULL)
            )
        );

        CREATE TABLE IF NOT EXISTS draft_ai_audit_findings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            audit_run_id INTEGER NOT NULL,
            rule_key TEXT NOT NULL CHECK(length(trim(rule_key)) BETWEEN 1 AND 100),
            severity TEXT NOT NULL CHECK(severity IN ('pass', 'warning', 'block')),
            message TEXT NOT NULL CHECK(length(trim(message)) BETWEEN 1 AND 1000),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (audit_run_id) REFERENCES draft_ai_audit_runs(id) ON DELETE CASCADE,
            UNIQUE(audit_run_id, rule_key)
        );

        CREATE UNIQUE INDEX idx_draft_ai_audit_runs_active_revision
            ON draft_ai_audit_runs(draft_variant_id, content_revision)
            WHERE status IN ('pending', 'running');
        CREATE INDEX idx_draft_ai_audit_runs_variant_revision
            ON draft_ai_audit_runs(draft_variant_id, content_revision, id DESC);
        CREATE INDEX idx_draft_ai_audit_runs_status
            ON draft_ai_audit_runs(status, updated_at DESC, id DESC);
        CREATE INDEX idx_draft_ai_audit_findings_run_id
            ON draft_ai_audit_findings(audit_run_id, id);
        CREATE INDEX idx_draft_ai_audit_findings_severity
            ON draft_ai_audit_findings(severity, audit_run_id);

        CREATE TRIGGER draft_ai_audit_runs_reject_future_revision
        BEFORE INSERT ON draft_ai_audit_runs
        FOR EACH ROW
        WHEN NEW.content_revision > COALESCE(
            (SELECT content_revision FROM draft_variants WHERE id = NEW.draft_variant_id),
            0
        )
        BEGIN
            SELECT RAISE(ABORT, 'AI audit content revision cannot exceed the draft variant revision');
        END;

        CREATE TRIGGER draft_ai_audit_runs_immutable_scope
        BEFORE UPDATE OF draft_variant_id, content_revision ON draft_ai_audit_runs
        FOR EACH ROW
        WHEN NEW.draft_variant_id <> OLD.draft_variant_id
          OR NEW.content_revision <> OLD.content_revision
        BEGIN
            SELECT RAISE(ABORT, 'AI audit draft variant and content revision are immutable');
        END;",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;
    use crate::migrations::get_migrations;
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
                 INSERT INTO draft_variants
                    (id, draft_id, variant_number, hook, body, cta, hashtags)
                    VALUES (10, 1, 1, 'Original hook', 'Original body', 'Reply', '#test');
                 INSERT INTO agent_runs (id) VALUES (20), (21), (22), (23);",
            )
            .await
            .expect("legacy audit prerequisites should be created");
        connection
    }

    async fn migrated_connection() -> SqliteConnection {
        let mut connection = legacy_connection().await;
        connection
            .execute(migrations()[0].sql)
            .await
            .expect("migration 31 should execute over the legacy draft schema");
        connection
    }

    async fn assert_rejected(connection: &mut SqliteConnection, sql: &str) {
        assert!(
            sqlx::query(sql).execute(&mut *connection).await.is_err(),
            "SQLite accepted invalid AI audit SQL: {sql}"
        );
    }

    #[test]
    fn migration_is_registered_after_version_30_and_declares_only_the_required_schema() {
        let migration = &migrations()[0];
        assert_eq!(migration.version, 31);
        assert_eq!(
            migration.description,
            "add_draft_content_revisions_and_ai_audits"
        );

        for declaration in [
            "ADD COLUMN content_revision INTEGER NOT NULL DEFAULT 1",
            "CREATE TRIGGER draft_variants_increment_content_revision",
            "CREATE TABLE IF NOT EXISTS draft_ai_audit_runs",
            "REFERENCES draft_variants(id) ON DELETE CASCADE",
            "CREATE TABLE IF NOT EXISTS draft_ai_audit_findings",
            "UNIQUE(audit_run_id, rule_key)",
            "idx_draft_ai_audit_runs_active_revision",
            "idx_draft_ai_audit_runs_variant_revision",
            "idx_draft_ai_audit_findings_run_id",
            "draft_ai_audit_runs_reject_future_revision",
            "draft_ai_audit_runs_immutable_scope",
        ] {
            assert!(migration.sql.contains(declaration), "missing {declaration}");
        }
        assert!(!migration.sql.contains("draft_content_revisions"));
        assert!(!migration.sql.contains("write_guard"));

        let registered = get_migrations();
        let versions: Vec<i64> = registered
            .iter()
            .map(|registered_migration| registered_migration.version)
            .collect();
        assert!(
            versions.windows(2).all(|pair| pair[0] < pair[1]),
            "migration versions must be strictly increasing: {versions:?}"
        );
        assert!(
            versions.windows(2).any(|pair| pair == [30, 31]),
            "draft AI audits must remain directly after planner draft generation: {versions:?}"
        );
    }

    #[test]
    fn content_edits_increment_revisions_for_existing_and_new_variants() {
        tauri::async_runtime::block_on(async {
            let mut connection = migrated_connection().await;

            let initial_revision: i64 =
                sqlx::query_scalar("SELECT content_revision FROM draft_variants WHERE id = 10")
                    .fetch_one(&mut connection)
                    .await
                    .expect("existing variant revision should be queryable");
            assert_eq!(initial_revision, 1);

            sqlx::query("UPDATE draft_variants SET status = 'selected' WHERE id = 10")
                .execute(&mut connection)
                .await
                .expect("metadata-only update should succeed");
            sqlx::query(
                "UPDATE draft_variants
                 SET hook = 'Revised hook', body = 'Revised body'
                 WHERE id = 10",
            )
            .execute(&mut connection)
            .await
            .expect("first content edit should increment once");
            sqlx::query("UPDATE draft_variants SET cta = 'Share a detail' WHERE id = 10")
                .execute(&mut connection)
                .await
                .expect("second content edit should increment again");

            let existing_revision: i64 =
                sqlx::query_scalar("SELECT content_revision FROM draft_variants WHERE id = 10")
                    .fetch_one(&mut connection)
                    .await
                    .expect("edited variant revision should be queryable");
            assert_eq!(existing_revision, 3);

            sqlx::query(
                "INSERT INTO draft_variants
                    (id, draft_id, variant_number, hook, body, cta, hashtags)
                 VALUES (11, 1, 2, 'New hook', 'New body', 'Respond', '#new')",
            )
            .execute(&mut connection)
            .await
            .expect("new variant should use the revision-one default");
            sqlx::query("UPDATE draft_variants SET hashtags = '#new #edited' WHERE id = 11")
                .execute(&mut connection)
                .await
                .expect("new variant content edit should increment its revision");

            let new_revision: i64 =
                sqlx::query_scalar("SELECT content_revision FROM draft_variants WHERE id = 11")
                    .fetch_one(&mut connection)
                    .await
                    .expect("new variant revision should be queryable");
            assert_eq!(new_revision, 2);
        });
    }

    #[test]
    fn audit_runs_enforce_variant_revision_state_provider_and_active_run_constraints() {
        tauri::async_runtime::block_on(async {
            let mut connection = migrated_connection().await;
            sqlx::query("UPDATE draft_variants SET hook = 'Revision two' WHERE id = 10")
                .execute(&mut connection)
                .await
                .expect("content edit should create revision two");

            for invalid_sql in [
                "INSERT INTO draft_ai_audit_runs
                    (draft_variant_id, content_revision, provider_key)
                 VALUES (999, 1, 'openai')",
                "INSERT INTO draft_ai_audit_runs
                    (draft_variant_id, content_revision, provider_key)
                 VALUES (10, 0, 'openai')",
                "INSERT INTO draft_ai_audit_runs
                    (draft_variant_id, content_revision, provider_key)
                 VALUES (10, 3, 'openai')",
                "INSERT INTO draft_ai_audit_runs
                    (draft_variant_id, content_revision, provider_key)
                 VALUES (10, 2, 'unknown')",
                "INSERT INTO draft_ai_audit_runs
                    (draft_variant_id, content_revision, provider_key, status)
                 VALUES (10, 2, 'openai', 'complete')",
                "INSERT INTO draft_ai_audit_runs
                    (draft_variant_id, content_revision, provider_key, status)
                 VALUES (10, 2, 'openai', 'completed')",
                "INSERT INTO draft_ai_audit_runs
                    (draft_variant_id, content_revision, provider_key, status, completed_at)
                 VALUES (10, 2, 'openai', 'pending', '2026-08-06T12:00:00Z')",
            ] {
                assert_rejected(&mut connection, invalid_sql).await;
            }

            sqlx::query(
                "INSERT INTO draft_ai_audit_runs
                    (id, draft_variant_id, content_revision, agent_run_id, provider_key, model_name)
                 VALUES (30, 10, 1, 20, 'openai', 'gpt-test')",
            )
            .execute(&mut connection)
            .await
            .expect("recorded historical revision should remain valid");
            sqlx::query(
                "INSERT INTO draft_ai_audit_runs
                    (id, draft_variant_id, content_revision, agent_run_id, provider_key, model_name)
                 VALUES (31, 10, 2, 21, 'anthropic', 'claude-test')",
            )
            .execute(&mut connection)
            .await
            .expect("current revision should be valid");

            assert_rejected(
                &mut connection,
                "INSERT INTO draft_ai_audit_runs
                    (draft_variant_id, content_revision, agent_run_id, provider_key)
                 VALUES (10, 2, 22, 'openai')",
            )
            .await;
            assert_rejected(
                &mut connection,
                "UPDATE draft_ai_audit_runs SET content_revision = 2 WHERE id = 30",
            )
            .await;

            sqlx::query(
                "UPDATE draft_ai_audit_runs
                 SET status = 'failed', completed_at = '2026-08-06T12:00:00Z'
                 WHERE id = 31",
            )
            .execute(&mut connection)
            .await
            .expect("terminal settlement should release the active-run constraint");
            sqlx::query(
                "INSERT INTO draft_ai_audit_runs
                    (id, draft_variant_id, content_revision, agent_run_id, provider_key)
                 VALUES (32, 10, 2, 22, 'openai')",
            )
            .execute(&mut connection)
            .await
            .expect("retry should insert for the same recorded revision");
        });
    }

    #[test]
    fn normalized_findings_enforce_constraints_and_cascade_with_audit_runs() {
        tauri::async_runtime::block_on(async {
            let mut connection = migrated_connection().await;
            sqlx::query(
                "INSERT INTO draft_ai_audit_runs
                    (id, draft_variant_id, content_revision, agent_run_id, provider_key,
                     status, completed_at)
                 VALUES (30, 10, 1, 20, 'openai', 'completed', '2026-08-06T12:00:00Z')",
            )
            .execute(&mut connection)
            .await
            .expect("completed audit run should insert");
            sqlx::query(
                "INSERT INTO draft_ai_audit_findings
                    (audit_run_id, rule_key, severity, message)
                 VALUES (30, 'specificity', 'block', 'Add one grounded concrete detail.')",
            )
            .execute(&mut connection)
            .await
            .expect("valid normalized finding should insert");

            for invalid_sql in [
                "INSERT INTO draft_ai_audit_findings
                    (audit_run_id, rule_key, severity, message)
                 VALUES (30, 'specificity', 'warning', 'Duplicate rule')",
                "INSERT INTO draft_ai_audit_findings
                    (audit_run_id, rule_key, severity, message)
                 VALUES (30, 'tone', 'urgent', 'Invalid severity')",
                "INSERT INTO draft_ai_audit_findings
                    (audit_run_id, rule_key, severity, message)
                 VALUES (30, '   ', 'warning', 'Blank rule')",
                "INSERT INTO draft_ai_audit_findings
                    (audit_run_id, rule_key, severity, message)
                 VALUES (30, 'tone', 'warning', '   ')",
                "INSERT INTO draft_ai_audit_findings
                    (audit_run_id, rule_key, severity, message)
                 VALUES (999, 'tone', 'warning', 'Missing run')",
            ] {
                assert_rejected(&mut connection, invalid_sql).await;
            }

            sqlx::query("DELETE FROM draft_ai_audit_runs WHERE id = 30")
                .execute(&mut connection)
                .await
                .expect("audit run deletion should cascade normalized findings");
            let finding_count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM draft_ai_audit_findings")
                    .fetch_one(&mut connection)
                    .await
                    .expect("finding count should be queryable");
            assert_eq!(finding_count, 0);
        });
    }

    #[test]
    fn variant_and_agent_deletion_apply_expected_audit_cascades() {
        tauri::async_runtime::block_on(async {
            let mut connection = migrated_connection().await;
            sqlx::query(
                "INSERT INTO draft_ai_audit_runs
                    (id, draft_variant_id, content_revision, agent_run_id, provider_key)
                 VALUES (30, 10, 1, 20, 'openai')",
            )
            .execute(&mut connection)
            .await
            .expect("linked audit run should insert");

            sqlx::query("DELETE FROM agent_runs WHERE id = 20")
                .execute(&mut connection)
                .await
                .expect("agent run should delete");
            let linked_agent: Option<i64> =
                sqlx::query_scalar("SELECT agent_run_id FROM draft_ai_audit_runs WHERE id = 30")
                    .fetch_one(&mut connection)
                    .await
                    .expect("audit history should remain after agent deletion");
            assert_eq!(linked_agent, None);

            sqlx::query("DELETE FROM draft_variants WHERE id = 10")
                .execute(&mut connection)
                .await
                .expect("variant deletion should cascade audit history");
            let run_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM draft_ai_audit_runs")
                .fetch_one(&mut connection)
                .await
                .expect("audit run count should be queryable");
            assert_eq!(run_count, 0);
        });
    }
}
