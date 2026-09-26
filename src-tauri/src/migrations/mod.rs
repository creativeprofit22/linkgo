pub mod agent_approval_resume;
pub mod agent_runtime;
pub mod app_settings;
pub mod approval_readiness;
pub mod approvals;
pub mod autopilot_planner;
pub mod campaign_backlog;
pub mod campaigns;
pub mod candidate_discovery;
pub mod candidate_policy;
pub mod candidate_queue;
pub mod comment_publishing;
pub mod comments;
pub mod content_calendar;
pub mod draft_ai_audits;
pub mod draft_generation;
pub mod draft_quality;
pub mod draft_quality_tool;
pub mod drafts;
pub mod integrations;
pub mod latest_draft_quality;
pub mod metric_refresh;
pub mod metrics;
mod native_persistence_upgrade;
pub mod planner_draft_audits;
pub mod planner_draft_generation;
pub mod playbooks;
pub mod provider_parity;
pub mod publish_executions;
pub mod relevance_scoring;
pub mod safety;
pub mod scheduler;
pub mod source_imports;
pub mod workflow_artifacts;
pub mod workflows;
use sqlx::{
    migrate::{Migration as SqlxMigration, MigrationType, Migrator},
    sqlite::SqliteConnectOptions,
    Connection, SqliteConnection,
};
use std::borrow::Cow;
use tauri_plugin_sql::{Migration, MigrationKind};

pub fn get_migrations() -> Vec<Migration> {
    let mut migrations = campaigns::migrations();
    migrations.extend(candidate_queue::migrations());
    migrations.extend(drafts::migrations());
    migrations.extend(approvals::migrations());
    migrations.extend(metrics::migrations());
    migrations.extend(workflows::migrations());
    migrations.extend(agent_runtime::migrations());
    migrations.extend(safety::migrations());
    migrations.extend(comments::migrations());
    migrations.extend(integrations::migrations());
    migrations.extend(provider_parity::migrations());
    migrations.extend(scheduler::migrations());
    migrations.extend(comment_publishing::migrations());
    migrations.extend(metric_refresh::migrations());
    migrations.extend(playbooks::migrations());
    migrations.extend(candidate_discovery::migrations());
    migrations.extend(app_settings::migrations());
    migrations.extend(draft_generation::migrations());
    migrations.extend(content_calendar::migrations());
    migrations.extend(workflow_artifacts::migrations());
    migrations.extend(agent_approval_resume::migrations());
    migrations.extend(source_imports::migrations());
    migrations.extend(candidate_policy::migrations());
    migrations.extend(campaign_backlog::migrations());
    migrations.extend(autopilot_planner::migrations());
    migrations.extend(relevance_scoring::migrations());
    migrations.extend(planner_draft_generation::migrations());
    migrations.extend(draft_ai_audits::migrations());
    migrations.extend(planner_draft_audits::migrations());
    migrations.extend(draft_quality::migrations());
    migrations.extend(draft_quality_tool::migrations());
    migrations.extend(approval_readiness::migrations());
    migrations.extend(latest_draft_quality::migrations());
    migrations.extend(publish_executions::migrations());
    migrations
}

fn sqlx_migrator() -> Migrator {
    let migrations = get_migrations()
        .into_iter()
        .filter_map(|migration| match migration.kind {
            MigrationKind::Up => Some(SqlxMigration::new(
                migration.version,
                migration.description.into(),
                MigrationType::ReversibleUp,
                migration.sql.into(),
                false,
            )),
            MigrationKind::Down => None,
        })
        .collect();

    Migrator {
        migrations: Cow::Owned(migrations),
        ..Migrator::DEFAULT
    }
}

pub async fn migrate_database(options: &SqliteConnectOptions) -> Result<(), String> {
    let mut connection = SqliteConnection::connect_with(options)
        .await
        .map_err(|error| format!("Failed to open Linkgo database for migration: {error}"))?;

    sqlx::query("PRAGMA foreign_keys = OFF")
        .execute(&mut connection)
        .await
        .map_err(|error| format!("Failed to suspend foreign keys before migration: {error}"))?;
    sqlx::query("PRAGMA legacy_alter_table = ON")
        .execute(&mut connection)
        .await
        .map_err(|error| {
            format!("Failed to protect child foreign keys during migration: {error}")
        })?;

    repair_provider_parity_references(&mut connection).await?;
    sqlx_migrator()
        .run(&mut connection)
        .await
        .map_err(|error| format!("Failed to migrate Linkgo database: {error}"))?;

    sqlx::query("PRAGMA legacy_alter_table = OFF")
        .execute(&mut connection)
        .await
        .map_err(|error| format!("Failed to restore ALTER TABLE behavior: {error}"))?;
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&mut connection)
        .await
        .map_err(|error| format!("Failed to restore foreign keys after migration: {error}"))?;

    let violations: i64 = sqlx::query("PRAGMA foreign_key_check")
        .fetch_all(&mut connection)
        .await
        .map_err(|error| format!("Failed to validate migrated foreign keys: {error}"))?
        .len() as i64;
    if violations != 0 {
        return Err(format!(
            "Linkgo database has {violations} foreign key violation(s) after migration"
        ));
    }

    Ok(())
}

async fn repair_provider_parity_references(
    connection: &mut SqliteConnection,
) -> Result<(), String> {
    let contaminated: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_schema
         WHERE sql LIKE '%agent_runs_legacy_provider_parity%'",
    )
    .fetch_one(&mut *connection)
    .await
    .map_err(|error| format!("Failed to inspect provider-parity foreign keys: {error}"))?;
    if contaminated == 0 {
        return Ok(());
    }

    sqlx::query("PRAGMA writable_schema = ON")
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Failed to enable provider-parity schema repair: {error}"))?;
    let repair_result = sqlx::query(
        "UPDATE sqlite_schema
         SET sql = replace(
             replace(sql, '\"agent_runs_legacy_provider_parity\"', 'agent_runs'),
             'agent_runs_legacy_provider_parity', 'agent_runs'
         )
         WHERE sql LIKE '%agent_runs_legacy_provider_parity%'",
    )
    .execute(&mut *connection)
    .await;
    sqlx::query("PRAGMA writable_schema = OFF")
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Failed to disable provider-parity schema repair: {error}"))?;
    repair_result
        .map_err(|error| format!("Failed to repair provider-parity foreign keys: {error}"))?;
    let schema_version: i64 = sqlx::query_scalar("PRAGMA schema_version")
        .fetch_one(&mut *connection)
        .await
        .map_err(|error| format!("Failed to read SQLite schema version: {error}"))?;
    sqlx::query(&format!("PRAGMA schema_version = {}", schema_version + 1))
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Failed to reload repaired SQLite schema: {error}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{get_migrations, migrate_database};
    use sqlx::{
        migrate::{Migration as SqlxMigration, MigrationType, Migrator},
        sqlite::SqliteConnectOptions,
        Connection, SqliteConnection,
    };
    use std::{borrow::Cow, str::FromStr};
    use tauri_plugin_sql::MigrationKind;

    fn source_import_migrator_with_prerequisites() -> Migrator {
        let migrations = get_migrations()
            .into_iter()
            .filter(|migration| matches!(migration.version, 1 | 2 | 9 | 13 | 22 | 23))
            .filter_map(|migration| match migration.kind {
                MigrationKind::Up => Some(SqlxMigration::new(
                    migration.version,
                    migration.description.into(),
                    MigrationType::ReversibleUp,
                    migration.sql.into(),
                    false,
                )),
                MigrationKind::Down => None,
            })
            .collect();

        Migrator {
            migrations: Cow::Owned(migrations),
            ..Migrator::DEFAULT
        }
    }

    async fn open_fixture() -> (tempfile::TempDir, SqliteConnectOptions) {
        let directory = tempfile::tempdir().expect("fixture directory should be created");
        let options = SqliteConnectOptions::new()
            .filename(directory.path().join("linkgo.db"))
            .create_if_missing(true)
            .foreign_keys(true);
        (directory, options)
    }

    async fn assert_fixture_integrity(options: &SqliteConnectOptions) {
        let mut connection = SqliteConnection::connect_with(options)
            .await
            .expect("migrated fixture should open");
        let violations = sqlx::query("PRAGMA foreign_key_check")
            .fetch_all(&mut connection)
            .await
            .expect("foreign keys should be checkable");
        assert!(violations.is_empty(), "foreign key violations detected");
        for (table, expected) in [
            ("agent_runs", 1_i64),
            ("agent_tool_calls", 1),
            ("agent_run_events", 1),
            ("workflow_step_executions", 1),
        ] {
            let count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
                .fetch_one(&mut connection)
                .await
                .expect("fixture row count should be queryable");
            assert_eq!(count, expected, "{table} data changed during migration");
        }
        let contaminated: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_schema WHERE sql LIKE '%agent_runs_legacy_provider_parity%'",
        )
        .fetch_one(&mut connection)
        .await
        .expect("schema should be inspectable");
        assert_eq!(contaminated, 0);
        let provider: String =
            sqlx::query_scalar("SELECT provider_key FROM agent_runs WHERE id = 1")
                .fetch_one(&mut connection)
                .await
                .expect("provider should survive");
        assert_eq!(provider, "gemini");
    }

    const PRE_21_FIXTURE: &str = r#"
        INSERT INTO campaigns (id, name) VALUES (1, 'Fixture');
        INSERT INTO workflow_runs (id, campaign_id, title, status) VALUES (1, 1, 'Fixture', 'running');
        INSERT INTO workflow_steps (id, workflow_run_id, step_key, title, sort_order, status)
        VALUES (1, 1, 'research', 'Research', 1, 'running');
        INSERT INTO agent_runs
          (id, campaign_id, workflow_run_id, workflow_step_id, agent_role, provider_key, status)
        VALUES (1, 1, 1, 1, 'researcher', 'google', 'running');
        INSERT INTO agent_tool_calls (id, agent_run_id, tool_name) VALUES (1, 1, 'research_posts');
        INSERT INTO agent_run_events (id, agent_run_id, event_type, summary)
        VALUES (1, 1, 'run_created', 'fixture');
        INSERT INTO workflow_step_executions
          (id, workflow_step_id, agent_run_id, executor_role)
        VALUES (1, 1, 1, 'researcher');
    "#;

    fn fixture_migrator(max_version: i64) -> Migrator {
        let migrations = get_migrations()
            .into_iter()
            .filter(|migration| migration.version <= max_version)
            .filter_map(|migration| match migration.kind {
                MigrationKind::Up => Some(SqlxMigration::new(
                    migration.version,
                    migration.description.into(),
                    MigrationType::ReversibleUp,
                    migration.sql.into(),
                    false,
                )),
                MigrationKind::Down => None,
            })
            .collect();
        Migrator {
            migrations: Cow::Owned(migrations),
            ..Migrator::DEFAULT
        }
    }

    async fn prepare_pre_21_fixture(options: &SqliteConnectOptions) {
        let mut connection = SqliteConnection::connect_with(options)
            .await
            .expect("fixture SQLite should open");
        sqlx::query("PRAGMA foreign_keys = OFF")
            .execute(&mut connection)
            .await
            .expect("foreign keys should disable");
        sqlx::query("PRAGMA legacy_alter_table = ON")
            .execute(&mut connection)
            .await
            .expect("legacy rename should enable");
        fixture_migrator(10)
            .run(&mut connection)
            .await
            .expect("prerequisites should migrate");
        sqlx::query(PRE_21_FIXTURE)
            .execute(&mut connection)
            .await
            .expect("fixture rows should insert");
    }

    #[test]
    fn migration_21_fixtures_preserve_fresh_normal_and_contaminated_databases() {
        tauri::async_runtime::block_on(async {
            let (_fresh_dir, fresh) = open_fixture().await;
            migrate_database(&fresh)
                .await
                .expect("fresh database should migrate");
            let mut fresh_connection = SqliteConnection::connect_with(&fresh).await.unwrap();
            assert!(sqlx::query("PRAGMA foreign_key_check")
                .fetch_all(&mut fresh_connection)
                .await
                .unwrap()
                .is_empty());

            let (_normal_dir, normal) = open_fixture().await;
            prepare_pre_21_fixture(&normal).await;
            migrate_database(&normal)
                .await
                .expect("normal pre-21 database should migrate");
            assert_fixture_integrity(&normal).await;

            let (_contaminated_dir, contaminated) = open_fixture().await;
            prepare_pre_21_fixture(&contaminated).await;
            let mut connection = SqliteConnection::connect_with(&contaminated).await.unwrap();
            sqlx::query("PRAGMA foreign_keys = OFF")
                .execute(&mut connection)
                .await
                .unwrap();
            sqlx::query("PRAGMA legacy_alter_table = OFF")
                .execute(&mut connection)
                .await
                .unwrap();
            fixture_migrator(11)
                .run(&mut connection)
                .await
                .expect("historical migration should apply");
            drop(connection);
            migrate_database(&contaminated)
                .await
                .expect("contaminated database should repair and migrate");
            assert_fixture_integrity(&contaminated).await;
        });
    }

    async fn assert_sql_rejected(connection: &mut SqliteConnection, sql: &str) {
        let result = sqlx::query(sql).execute(&mut *connection).await;
        assert!(
            result.is_err(),
            "SQLite accepted invalid SQL operation: {sql}"
        );
    }

    #[test]
    fn source_import_migration_executes_in_production_order_and_enforces_schema() {
        tauri::async_runtime::block_on(async {
            let options = SqliteConnectOptions::from_str("sqlite::memory:")
                .expect("in-memory SQLite URL should be valid")
                .foreign_keys(true);
            let mut connection = SqliteConnection::connect_with(&options)
                .await
                .expect("in-memory SQLite should open");

            source_import_migrator_with_prerequisites()
                .run(&mut connection)
                .await
                .expect("source import migration and prerequisites should execute in order");

            let migration_applied: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM _sqlx_migrations WHERE version = 23 AND success = TRUE",
            )
            .fetch_one(&mut connection)
            .await
            .expect("migration history should be queryable");
            assert_eq!(migration_applied, 1);

            let policy_tables: Vec<String> = sqlx::query_scalar(
                "SELECT name FROM sqlite_master
                 WHERE type = 'table'
                   AND name IN ('candidate_intake_policies', 'candidate_policy_banned_topics')
                 ORDER BY name",
            )
            .fetch_all(&mut connection)
            .await
            .expect("candidate policy tables should be queryable");
            assert_eq!(
                policy_tables,
                vec![
                    "candidate_intake_policies".to_owned(),
                    "candidate_policy_banned_topics".to_owned(),
                ]
            );

            let tables: Vec<String> = sqlx::query_scalar(
                "SELECT name FROM sqlite_master
                 WHERE type = 'table'
                   AND name IN ('source_import_batches', 'source_import_items')
                 ORDER BY name",
            )
            .fetch_all(&mut connection)
            .await
            .expect("source import tables should be queryable");
            assert_eq!(
                tables,
                vec![
                    "source_import_batches".to_owned(),
                    "source_import_items".to_owned(),
                ]
            );

            sqlx::query("INSERT INTO campaigns (id, name) VALUES (100, 'Import test')")
                .execute(&mut connection)
                .await
                .expect("campaign prerequisite should insert");

            sqlx::query(
                "INSERT INTO candidate_intake_policies (campaign_id, max_post_age_days)
                 VALUES (100, 30)",
            )
            .execute(&mut connection)
            .await
            .expect("valid candidate policy should insert");
            assert_sql_rejected(
                &mut connection,
                "INSERT INTO candidate_intake_policies (campaign_id, max_post_age_days)
                 VALUES (999, 30)",
            )
            .await;
            assert_sql_rejected(
                &mut connection,
                "UPDATE candidate_intake_policies SET max_post_age_days = 0 WHERE campaign_id = 100",
            )
            .await;
            assert_sql_rejected(
                &mut connection,
                "UPDATE candidate_intake_policies SET max_post_age_days = 366 WHERE campaign_id = 100",
            )
            .await;

            sqlx::query(
                "INSERT INTO candidate_policy_banned_topics
                 (campaign_id, topic, normalized_topic) VALUES (100, 'Artificial Intelligence', 'artificial intelligence')",
            )
            .execute(&mut connection)
            .await
            .expect("valid banned topic should insert");
            assert_sql_rejected(
                &mut connection,
                "INSERT INTO candidate_policy_banned_topics
                 (campaign_id, topic, normalized_topic) VALUES (100, 'AI', 'artificial intelligence')",
            )
            .await;
            assert_sql_rejected(
                &mut connection,
                "INSERT INTO candidate_policy_banned_topics
                 (campaign_id, topic, normalized_topic) VALUES (100, '   ', 'blank')",
            )
            .await;
            assert_sql_rejected(
                &mut connection,
                "INSERT INTO candidate_policy_banned_topics
                 (campaign_id, topic, normalized_topic) VALUES (100, 'valid', '')",
            )
            .await;

            assert_sql_rejected(
                &mut connection,
                "INSERT INTO source_import_batches (id, campaign_id) VALUES (200, 999)",
            )
            .await;
            assert_sql_rejected(
                &mut connection,
                "INSERT INTO source_import_batches (id, campaign_id, source_type)
                 VALUES (201, 100, 'remote_api')",
            )
            .await;
            assert_sql_rejected(
                &mut connection,
                "INSERT INTO source_import_batches (id, campaign_id, status)
                 VALUES (202, 100, 'unknown')",
            )
            .await;

            for (id, count_column) in [
                (203, "total_count"),
                (204, "accepted_count"),
                (205, "duplicate_count"),
                (206, "rejected_count"),
            ] {
                let sql = format!(
                    "INSERT INTO source_import_batches (id, campaign_id, {count_column}) \
                     VALUES ({id}, 100, -1)"
                );
                assert_sql_rejected(&mut connection, &sql).await;
            }

            let long_batch_error = "x".repeat(1_001);
            let long_batch_error_result = sqlx::query(
                "INSERT INTO source_import_batches (id, campaign_id, error_message)
                 VALUES (207, 100, ?1)",
            )
            .bind(long_batch_error)
            .execute(&mut connection)
            .await;
            assert!(long_batch_error_result.is_err());

            sqlx::query(
                "INSERT INTO target_posts
                 (id, url, normalized_url, content, content_hash)
                 VALUES (300, 'https://example.com/post', 'https://example.com/post', 'Post', 'hash')",
            )
            .execute(&mut connection)
            .await
            .expect("target post prerequisite should insert");
            sqlx::query(
                "INSERT INTO candidate_posts (id, campaign_id, target_post_id)
                 VALUES (400, 100, 300)",
            )
            .execute(&mut connection)
            .await
            .expect("candidate post prerequisite should insert");
            sqlx::query(
                "INSERT INTO source_import_batches (id, campaign_id, total_count)
                 VALUES (200, 100, 1)",
            )
            .execute(&mut connection)
            .await
            .expect("valid import batch should insert");

            assert_sql_rejected(
                &mut connection,
                "INSERT INTO source_import_items
                 (id, source_import_batch_id, row_number, input_json)
                 VALUES (500, 999, 1, '{}')",
            )
            .await;
            assert_sql_rejected(
                &mut connection,
                "INSERT INTO source_import_items
                 (id, source_import_batch_id, row_number, input_json, candidate_post_id)
                 VALUES (501, 200, 1, '{}', 999)",
            )
            .await;
            assert_sql_rejected(
                &mut connection,
                "INSERT INTO source_import_items
                 (id, source_import_batch_id, row_number, input_json)
                 VALUES (502, 200, 0, '{}')",
            )
            .await;
            assert_sql_rejected(
                &mut connection,
                "INSERT INTO source_import_items
                 (id, source_import_batch_id, row_number, status, input_json)
                 VALUES (503, 200, 1, 'unknown', '{}')",
            )
            .await;
            assert_sql_rejected(
                &mut connection,
                "INSERT INTO source_import_items
                 (id, source_import_batch_id, row_number, input_json, policy_rule_key)
                 VALUES (507, 200, 2, '{}', 'unknown')",
            )
            .await;

            let long_input = "x".repeat(20_001);
            let long_input_result = sqlx::query(
                "INSERT INTO source_import_items
                 (id, source_import_batch_id, row_number, input_json)
                 VALUES (504, 200, 1, ?1)",
            )
            .bind(long_input)
            .execute(&mut connection)
            .await;
            assert!(long_input_result.is_err());

            let long_reason = "x".repeat(2_001);
            let long_reason_result = sqlx::query(
                "INSERT INTO source_import_items
                 (id, source_import_batch_id, row_number, input_json, reason)
                 VALUES (505, 200, 1, '{}', ?1)",
            )
            .bind(long_reason)
            .execute(&mut connection)
            .await;
            assert!(long_reason_result.is_err());

            sqlx::query(
                "INSERT INTO source_import_items
                 (id, source_import_batch_id, row_number, input_json, candidate_post_id)
                 VALUES (500, 200, 1, '{}', 400)",
            )
            .execute(&mut connection)
            .await
            .expect("valid import item should insert");
            assert_sql_rejected(
                &mut connection,
                "INSERT INTO source_import_items
                 (id, source_import_batch_id, row_number, input_json)
                 VALUES (506, 200, 1, '{}')",
            )
            .await;

            sqlx::query("DELETE FROM candidate_posts WHERE id = 400")
                .execute(&mut connection)
                .await
                .expect("candidate post should delete");
            let candidate_post_id: Option<i64> = sqlx::query_scalar(
                "SELECT candidate_post_id FROM source_import_items WHERE id = 500",
            )
            .fetch_one(&mut connection)
            .await
            .expect("import item should remain after candidate deletion");
            assert_eq!(candidate_post_id, None);

            for (index_name, expected_columns) in [
                ("idx_source_import_batches_campaign_id", vec!["campaign_id"]),
                ("idx_source_import_batches_status", vec!["status"]),
                ("idx_source_import_batches_created_at", vec!["created_at"]),
                (
                    "idx_source_import_items_batch_id",
                    vec!["source_import_batch_id"],
                ),
                ("idx_source_import_items_status", vec!["status"]),
                (
                    "idx_source_import_items_candidate_id",
                    vec!["candidate_post_id"],
                ),
                (
                    "idx_candidate_policy_banned_topics_campaign_id",
                    vec!["campaign_id"],
                ),
                (
                    "idx_source_import_items_policy_rule_key",
                    vec!["policy_rule_key"],
                ),
            ] {
                let indexed_columns: Vec<String> =
                    sqlx::query_scalar("SELECT name FROM pragma_index_info(?1) ORDER BY seqno")
                        .bind(index_name)
                        .fetch_all(&mut connection)
                        .await
                        .expect("source import index metadata should be queryable");
                assert_eq!(indexed_columns, expected_columns);
            }

            sqlx::query("DELETE FROM campaigns WHERE id = 100")
                .execute(&mut connection)
                .await
                .expect("campaign should delete");
            let remaining_batches: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM source_import_batches")
                    .fetch_one(&mut connection)
                    .await
                    .expect("batch count should be queryable");
            let remaining_items: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM source_import_items")
                    .fetch_one(&mut connection)
                    .await
                    .expect("item count should be queryable");
            let remaining_policies: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM candidate_intake_policies")
                    .fetch_one(&mut connection)
                    .await
                    .expect("policy count should be queryable");
            let remaining_topics: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM candidate_policy_banned_topics")
                    .fetch_one(&mut connection)
                    .await
                    .expect("topic count should be queryable");
            assert_eq!(remaining_batches, 0);
            assert_eq!(remaining_items, 0);
            assert_eq!(remaining_policies, 0);
            assert_eq!(remaining_topics, 0);
        });
    }
}
