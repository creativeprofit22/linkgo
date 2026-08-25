use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 33,
        description: "add_attended_draft_quality_runs",
        sql: "CREATE TABLE IF NOT EXISTS draft_quality_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            draft_variant_id INTEGER NOT NULL,
            starting_content_revision INTEGER NOT NULL CHECK(starting_content_revision >= 1),
            current_content_revision INTEGER NOT NULL CHECK(current_content_revision >= starting_content_revision),
            provider_key TEXT NOT NULL CHECK(provider_key IN (
                'dry_run', 'anthropic', 'xiaomi', 'openai', 'gemini', 'glm',
                'moonshot', 'deepseek', 'openrouter', 'sakana', 'minimax', 'custom'
            )),
            model_name TEXT NOT NULL DEFAULT '' CHECK(length(model_name) <= 120),
            threshold INTEGER NOT NULL DEFAULT 70 CHECK(threshold = 70),
            maximum_rewrite_count INTEGER NOT NULL DEFAULT 2 CHECK(maximum_rewrite_count = 2),
            applied_rewrite_count INTEGER NOT NULL DEFAULT 0
                CHECK(applied_rewrite_count BETWEEN 0 AND maximum_rewrite_count),
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending', 'running', 'passed', 'needs_revision', 'failed', 'cancelled')),
            final_score INTEGER CHECK(final_score BETWEEN 0 AND 100),
            summary TEXT NOT NULL DEFAULT '' CHECK(length(summary) <= 1000),
            error_message TEXT NOT NULL DEFAULT '' CHECK(length(error_message) <= 1000),
            active_agent_run_id INTEGER,
            active_ai_audit_run_id INTEGER,
            started_at TEXT,
            completed_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (draft_variant_id) REFERENCES draft_variants(id) ON DELETE CASCADE,
            FOREIGN KEY (active_agent_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL,
            FOREIGN KEY (active_ai_audit_run_id) REFERENCES draft_ai_audit_runs(id) ON DELETE SET NULL,
            CHECK(
                (status IN ('pending', 'running') AND completed_at IS NULL)
                OR (status IN ('passed', 'needs_revision', 'failed', 'cancelled') AND completed_at IS NOT NULL)
            ),
            CHECK(status <> 'passed' OR (final_score IS NOT NULL AND final_score >= threshold))
        );

        CREATE TABLE IF NOT EXISTS draft_quality_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL,
            attempt_number INTEGER NOT NULL CHECK(attempt_number >= 1 AND attempt_number <= 3),
            content_revision INTEGER NOT NULL CHECK(content_revision >= 1),
            input_hook TEXT NOT NULL CHECK(length(input_hook) <= 3000),
            input_body TEXT NOT NULL CHECK(length(input_body) <= 20000),
            input_cta TEXT NOT NULL CHECK(length(input_cta) <= 3000),
            input_hashtags TEXT NOT NULL CHECK(length(input_hashtags) <= 3000),
            rewritten_hook TEXT CHECK(length(rewritten_hook) <= 3000),
            rewritten_body TEXT CHECK(length(rewritten_body) <= 20000),
            rewritten_cta TEXT CHECK(length(rewritten_cta) <= 3000),
            rewritten_hashtags TEXT CHECK(length(rewritten_hashtags) <= 3000),
            overall_score INTEGER CHECK(overall_score BETWEEN 0 AND 100),
            status TEXT NOT NULL DEFAULT 'scoring'
                CHECK(status IN ('scoring', 'scored', 'rewritten', 'passed', 'failed')),
            agent_run_id INTEGER UNIQUE,
            ai_audit_run_id INTEGER UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT,
            FOREIGN KEY (run_id) REFERENCES draft_quality_runs(id) ON DELETE CASCADE,
            FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL,
            FOREIGN KEY (ai_audit_run_id) REFERENCES draft_ai_audit_runs(id) ON DELETE SET NULL,
            UNIQUE(run_id, attempt_number),
            CHECK(
                (rewritten_hook IS NULL AND rewritten_body IS NULL AND rewritten_cta IS NULL AND rewritten_hashtags IS NULL)
                OR
                (rewritten_hook IS NOT NULL AND rewritten_body IS NOT NULL AND rewritten_cta IS NOT NULL AND rewritten_hashtags IS NOT NULL)
            )
        );

        CREATE TABLE IF NOT EXISTS draft_quality_category_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            attempt_id INTEGER NOT NULL,
            category_key TEXT NOT NULL CHECK(category_key IN (
                'hook_strength', 'authenticity', 'linkedin_fit', 'specificity', 'narrative_structure'
            )),
            score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
            feedback TEXT NOT NULL CHECK(length(trim(feedback)) BETWEEN 1 AND 1000),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (attempt_id) REFERENCES draft_quality_attempts(id) ON DELETE CASCADE,
            UNIQUE(attempt_id, category_key)
        );

        CREATE UNIQUE INDEX idx_draft_quality_runs_active_variant
            ON draft_quality_runs(draft_variant_id)
            WHERE status IN ('pending', 'running');
        CREATE INDEX idx_draft_quality_runs_variant_revision
            ON draft_quality_runs(draft_variant_id, current_content_revision, id DESC);
        CREATE INDEX idx_draft_quality_runs_stale_active
            ON draft_quality_runs(status, updated_at, id)
            WHERE status IN ('pending', 'running');
        CREATE INDEX idx_draft_quality_attempts_run
            ON draft_quality_attempts(run_id, attempt_number);
        CREATE INDEX idx_draft_quality_category_scores_attempt
            ON draft_quality_category_scores(attempt_id, category_key);

        CREATE TRIGGER draft_quality_runs_reject_future_revision
        BEFORE INSERT ON draft_quality_runs
        FOR EACH ROW
        WHEN NEW.current_content_revision > COALESCE(
            (SELECT content_revision FROM draft_variants WHERE id = NEW.draft_variant_id), 0
        )
        BEGIN
            SELECT RAISE(ABORT, 'quality run revision cannot exceed draft variant revision');
        END;

        CREATE TRIGGER draft_quality_runs_immutable_scope
        BEFORE UPDATE OF draft_variant_id, starting_content_revision, provider_key, model_name,
            threshold, maximum_rewrite_count ON draft_quality_runs
        FOR EACH ROW
        WHEN NEW.draft_variant_id <> OLD.draft_variant_id
          OR NEW.starting_content_revision <> OLD.starting_content_revision
          OR NEW.provider_key <> OLD.provider_key
          OR NEW.model_name <> OLD.model_name
          OR NEW.threshold <> OLD.threshold
          OR NEW.maximum_rewrite_count <> OLD.maximum_rewrite_count
        BEGIN
            SELECT RAISE(ABORT, 'quality run scope is immutable');
        END;

        CREATE TRIGGER draft_quality_attempts_immutable_scope
        BEFORE UPDATE OF run_id, attempt_number, content_revision,
            input_hook, input_body, input_cta, input_hashtags ON draft_quality_attempts
        FOR EACH ROW
        WHEN NEW.run_id <> OLD.run_id
          OR NEW.attempt_number <> OLD.attempt_number
          OR NEW.content_revision <> OLD.content_revision
          OR NEW.input_hook <> OLD.input_hook
          OR NEW.input_body <> OLD.input_body
          OR NEW.input_cta <> OLD.input_cta
          OR NEW.input_hashtags <> OLD.input_hashtags
        BEGIN
            SELECT RAISE(ABORT, 'quality attempt scope is immutable');
        END;

        CREATE TRIGGER draft_quality_attempts_reject_future_revision
        BEFORE INSERT ON draft_quality_attempts
        FOR EACH ROW
        WHEN NEW.content_revision > COALESCE(
            (SELECT current_content_revision FROM draft_quality_runs WHERE id = NEW.run_id), 0
        )
        BEGIN
            SELECT RAISE(ABORT, 'quality attempt revision cannot exceed quality run revision');
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

    async fn migrated_connection() -> SqliteConnection {
        let options = SqliteConnectOptions::from_str("sqlite::memory:")
            .expect("in-memory SQLite URL should be valid")
            .foreign_keys(true);
        let mut connection = SqliteConnection::connect_with(&options)
            .await
            .expect("in-memory SQLite should open");
        connection
            .execute(
                "CREATE TABLE draft_variants (
                    id INTEGER PRIMARY KEY, content_revision INTEGER NOT NULL DEFAULT 1
                 );
                 CREATE TABLE agent_runs (id INTEGER PRIMARY KEY);
                 CREATE TABLE draft_ai_audit_runs (id INTEGER PRIMARY KEY);
                 INSERT INTO draft_variants (id, content_revision) VALUES (10, 2);
                 INSERT INTO agent_runs (id) VALUES (20), (21);
                 INSERT INTO draft_ai_audit_runs (id) VALUES (30), (31);",
            )
            .await
            .expect("quality migration prerequisites should be created");
        connection
            .execute(migrations()[0].sql)
            .await
            .expect("migration 33 should execute");
        connection
    }

    async fn assert_rejected(connection: &mut SqliteConnection, sql: &str) {
        assert!(
            sqlx::query(sql).execute(&mut *connection).await.is_err(),
            "SQLite accepted invalid quality SQL: {sql}"
        );
    }

    async fn insert_run(connection: &mut SqliteConnection, id: i64, status: &str) {
        let completed_at = if matches!(status, "pending" | "running") {
            "NULL"
        } else {
            "datetime('now')"
        };
        let sql = format!(
            "INSERT INTO draft_quality_runs
             (id, draft_variant_id, starting_content_revision, current_content_revision,
              provider_key, status, completed_at)
             VALUES ({id}, 10, 2, 2, 'dry_run', '{status}', {completed_at})"
        );
        sqlx::query(&sql)
            .execute(&mut *connection)
            .await
            .expect("quality run fixture should insert");
    }

    #[test]
    fn migration_is_registered_after_version_32() {
        let migration = &migrations()[0];
        assert_eq!(migration.version, 33);
        assert_eq!(migration.description, "add_attended_draft_quality_runs");
        for declaration in [
            "CREATE TABLE IF NOT EXISTS draft_quality_runs",
            "CREATE TABLE IF NOT EXISTS draft_quality_attempts",
            "CREATE TABLE IF NOT EXISTS draft_quality_category_scores",
            "idx_draft_quality_runs_active_variant",
            "draft_quality_runs_reject_future_revision",
            "draft_quality_attempts_immutable_scope",
        ] {
            assert!(migration.sql.contains(declaration), "missing {declaration}");
        }
        let versions: Vec<i64> = get_migrations().iter().map(|item| item.version).collect();
        assert!(versions.windows(2).all(|pair| pair[0] < pair[1]));
        assert!(versions.windows(2).any(|pair| pair == [32, 33]));
    }

    #[test]
    fn schema_rejects_invalid_ranges_duplicates_and_future_revisions() {
        tauri::async_runtime::block_on(async {
            let mut connection = migrated_connection().await;
            insert_run(&mut connection, 40, "running").await;
            assert_rejected(&mut connection, "INSERT INTO draft_quality_runs (id, draft_variant_id, starting_content_revision, current_content_revision, provider_key) VALUES (41, 10, 2, 2, 'dry_run')").await;
            assert_rejected(&mut connection, "INSERT INTO draft_quality_runs (id, draft_variant_id, starting_content_revision, current_content_revision, provider_key, status, completed_at) VALUES (42, 10, 2, 3, 'dry_run', 'failed', datetime('now'))").await;
            assert_rejected(
                &mut connection,
                "UPDATE draft_quality_runs SET threshold = 71 WHERE id = 40",
            )
            .await;

            sqlx::query("INSERT INTO draft_quality_attempts (id, run_id, attempt_number, content_revision, input_hook, input_body, input_cta, input_hashtags) VALUES (50, 40, 1, 2, 'h', 'b', 'c', '#x')")
                .execute(&mut connection).await.expect("attempt should insert");
            assert_rejected(&mut connection, "INSERT INTO draft_quality_attempts (run_id, attempt_number, content_revision, input_hook, input_body, input_cta, input_hashtags) VALUES (40, 1, 2, 'h', 'b', 'c', '#x')").await;
            assert_rejected(&mut connection, "INSERT INTO draft_quality_attempts (run_id, attempt_number, content_revision, input_hook, input_body, input_cta, input_hashtags) VALUES (40, 2, 3, 'h', 'b', 'c', '#x')").await;
            assert_rejected(
                &mut connection,
                "UPDATE draft_quality_attempts SET content_revision = 1 WHERE id = 50",
            )
            .await;

            sqlx::query("INSERT INTO draft_quality_category_scores (attempt_id, category_key, score, feedback) VALUES (50, 'hook_strength', 80, 'Good hook')")
                .execute(&mut connection).await.expect("category should insert");
            assert_rejected(&mut connection, "INSERT INTO draft_quality_category_scores (attempt_id, category_key, score, feedback) VALUES (50, 'hook_strength', 70, 'Duplicate')").await;
            assert_rejected(&mut connection, "INSERT INTO draft_quality_category_scores (attempt_id, category_key, score, feedback) VALUES (50, 'unknown', 70, 'Bad key')").await;
            assert_rejected(&mut connection, "INSERT INTO draft_quality_category_scores (attempt_id, category_key, score, feedback) VALUES (50, 'authenticity', 101, 'Too high')").await;
            assert_rejected(&mut connection, "INSERT INTO draft_quality_category_scores (attempt_id, category_key, score, feedback) VALUES (50, 'authenticity', 70, '')").await;
        });
    }

    #[test]
    fn deleting_variant_cascades_runs_attempts_and_scores() {
        tauri::async_runtime::block_on(async {
            let mut connection = migrated_connection().await;
            insert_run(&mut connection, 40, "failed").await;
            sqlx::query("INSERT INTO draft_quality_attempts (id, run_id, attempt_number, content_revision, input_hook, input_body, input_cta, input_hashtags) VALUES (50, 40, 1, 2, 'h', 'b', 'c', '#x')")
                .execute(&mut connection).await.expect("attempt should insert");
            sqlx::query("INSERT INTO draft_quality_category_scores (attempt_id, category_key, score, feedback) VALUES (50, 'specificity', 60, 'Needs evidence')")
                .execute(&mut connection).await.expect("score should insert");
            sqlx::query("DELETE FROM draft_variants WHERE id = 10")
                .execute(&mut connection)
                .await
                .expect("variant should delete");
            for table in [
                "draft_quality_runs",
                "draft_quality_attempts",
                "draft_quality_category_scores",
            ] {
                let count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
                    .fetch_one(&mut connection)
                    .await
                    .expect("count should query");
                assert_eq!(count, 0, "{table} should cascade");
            }
        });
    }
}
