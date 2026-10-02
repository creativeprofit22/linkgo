use tauri_plugin_sql::{Migration, MigrationKind};

/// Bright Data source connector storage. Rebuilds `source_import_batches`
/// (SQLite cannot alter a CHECK) to admit `brightdata` batches, adds the
/// default-off enable flag, the per-campaign watchlist and run history.
/// `migrate_database` runs with `foreign_keys=OFF` and
/// `legacy_alter_table=ON`, so child foreign keys keep pointing at the
/// renamed table.
pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 38,
        description: "create_brightdata_connector",
        sql: "CREATE TABLE source_import_batches_v38 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            source_type TEXT NOT NULL DEFAULT 'local_json' CHECK(source_type IN ('local_json', 'brightdata')),
            status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing', 'completed', 'completed_with_errors', 'failed')),
            total_count INTEGER NOT NULL DEFAULT 0 CHECK(total_count >= 0),
            accepted_count INTEGER NOT NULL DEFAULT 0 CHECK(accepted_count >= 0),
            duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK(duplicate_count >= 0),
            rejected_count INTEGER NOT NULL DEFAULT 0 CHECK(rejected_count >= 0),
            error_message TEXT NOT NULL DEFAULT '' CHECK(length(error_message) <= 1000),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
        );
        INSERT INTO source_import_batches_v38 (
            id, campaign_id, source_type, status, total_count, accepted_count,
            duplicate_count, rejected_count, error_message, created_at, updated_at
        )
        SELECT
            id, campaign_id, source_type, status, total_count, accepted_count,
            duplicate_count, rejected_count, error_message, created_at, updated_at
        FROM source_import_batches;
        DROP TABLE source_import_batches;
        ALTER TABLE source_import_batches_v38 RENAME TO source_import_batches;
        CREATE INDEX idx_source_import_batches_campaign_id ON source_import_batches(campaign_id);
        CREATE INDEX idx_source_import_batches_status ON source_import_batches(status);
        CREATE INDEX idx_source_import_batches_created_at ON source_import_batches(created_at);
        CREATE INDEX idx_source_import_batches_planner_eligibility
            ON source_import_batches(status, campaign_id, created_at, id);

        ALTER TABLE app_settings ADD COLUMN brightdata_connector_enabled INTEGER NOT NULL DEFAULT 0
            CHECK(brightdata_connector_enabled IN (0, 1));

        CREATE TABLE source_watchlist_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('profile', 'company')),
            url TEXT NOT NULL CHECK(length(trim(url)) BETWEEN 1 AND 1000),
            label TEXT NOT NULL DEFAULT '' CHECK(length(label) <= 160),
            enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
            UNIQUE(campaign_id, url)
        );
        CREATE INDEX idx_source_watchlist_entries_campaign_id ON source_watchlist_entries(campaign_id);

        CREATE TABLE brightdata_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            mode TEXT NOT NULL CHECK(mode IN ('post_url', 'keyword', 'watchlist')),
            input_json TEXT NOT NULL CHECK(length(input_json) <= 20000 AND json_valid(input_json)),
            snapshot_id TEXT CHECK(snapshot_id IS NULL OR length(snapshot_id) BETWEEN 1 AND 200),
            status TEXT NOT NULL DEFAULT 'starting'
                CHECK(status IN ('starting', 'running', 'ready', 'imported', 'failed', 'cancelled')),
            requested_count INTEGER NOT NULL DEFAULT 0 CHECK(requested_count >= 0),
            row_count INTEGER NOT NULL DEFAULT 0 CHECK(row_count >= 0),
            source_import_batch_id INTEGER,
            error_message TEXT NOT NULL DEFAULT '' CHECK(length(error_message) <= 1000),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
            FOREIGN KEY (source_import_batch_id) REFERENCES source_import_batches(id) ON DELETE SET NULL
        );
        CREATE UNIQUE INDEX idx_brightdata_runs_one_active
            ON brightdata_runs(campaign_id) WHERE status IN ('starting', 'running', 'ready');
        CREATE INDEX idx_brightdata_runs_campaign_created
            ON brightdata_runs(campaign_id, created_at DESC, id DESC);",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use sqlx::{sqlite::SqlitePoolOptions, Executor, SqlitePool};

    async fn fixture_at(version: i64) -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        pool.execute("PRAGMA foreign_keys=OFF; PRAGMA legacy_alter_table=ON;")
            .await
            .unwrap();
        for migration in crate::migrations::get_migrations()
            .into_iter()
            .filter(|m| m.version <= version)
        {
            pool.execute(migration.sql).await.unwrap();
        }
        pool
    }

    async fn finish(pool: &SqlitePool) {
        pool.execute(super::migrations()[0].sql).await.unwrap();
        pool.execute("PRAGMA foreign_keys=ON; PRAGMA legacy_alter_table=OFF;")
            .await
            .unwrap();
    }

    async fn scalar(pool: &SqlitePool, sql: &str) -> i64 {
        sqlx::query_scalar(sql).fetch_one(pool).await.unwrap()
    }

    const SEED_V37: &str = "
        INSERT INTO campaigns (id,name,status) VALUES (1,'Bright','active'),(2,'Other','active');
        INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES (1,'https://e.com/1','https://e.com/1','Post','h1');
        INSERT INTO candidate_posts (id,campaign_id,target_post_id) VALUES (1,1,1);
        INSERT INTO source_import_batches (id,campaign_id,source_type,status,total_count,accepted_count,created_at,updated_at)
          VALUES (7,1,'local_json','completed',1,1,'2026-09-01 10:00:00','2026-09-01 10:00:01');
        INSERT INTO source_import_items (source_import_batch_id,row_number,status,input_json,candidate_post_id)
          VALUES (7,1,'accepted','{}',1);
        INSERT INTO campaign_backlog_items (id,campaign_id,work_type,title,owner_type,due_at)
          VALUES (1,1,'research','Review imports','linkgo','2026-10-01T00:00:00.000Z');
        INSERT INTO workflow_runs (id,campaign_id,title,status) VALUES (1,1,'Plan','running');
        INSERT INTO autopilot_plans (campaign_id,source_import_batch_id,source_type,status,campaign_backlog_item_id,workflow_run_id,candidate_count)
          VALUES (1,7,'local_json','planned',1,1,1);
        INSERT INTO autopilot_planner_events (campaign_id,source_import_batch_id,event_type,summary)
          VALUES (1,7,'batch_planned','planned');
    ";

    #[tokio::test]
    async fn rebuild_preserves_batches_children_and_indexes() {
        let pool = fixture_at(37).await;
        pool.execute("PRAGMA foreign_keys=ON;").await.unwrap();
        pool.execute(SEED_V37).await.unwrap();
        pool.execute("PRAGMA foreign_keys=OFF;").await.unwrap();
        let before: String = sqlx::query_scalar(
            "SELECT json_group_array(json_array(id,campaign_id,source_type,status,total_count,accepted_count,created_at,updated_at)) FROM source_import_batches",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        finish(&pool).await;

        let after: String = sqlx::query_scalar(
            "SELECT json_group_array(json_array(id,campaign_id,source_type,status,total_count,accepted_count,created_at,updated_at)) FROM source_import_batches",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(before, after);
        assert!(sqlx::query("PRAGMA foreign_key_check")
            .fetch_all(&pool)
            .await
            .unwrap()
            .is_empty());
        for index in [
            "idx_source_import_batches_campaign_id",
            "idx_source_import_batches_status",
            "idx_source_import_batches_created_at",
            "idx_source_import_batches_planner_eligibility",
        ] {
            let found = scalar(
                &pool,
                &format!("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='{index}' AND tbl_name='source_import_batches'"),
            )
            .await;
            assert_eq!(found, 1, "{index}");
        }
        assert_eq!(
            scalar(
                &pool,
                "SELECT COUNT(*) FROM sqlite_master WHERE sql LIKE '%source_import_batches_v38%'"
            )
            .await,
            0
        );
        // Child cascades still follow the rebuilt parent.
        pool.execute("DELETE FROM source_import_batches WHERE id=7")
            .await
            .unwrap();
        assert_eq!(
            scalar(&pool, "SELECT COUNT(*) FROM source_import_items").await,
            0
        );
        assert_eq!(
            scalar(&pool, "SELECT COUNT(*) FROM autopilot_plans").await,
            0
        );
        assert_eq!(
            scalar(
                &pool,
                "SELECT COUNT(*) FROM autopilot_planner_events WHERE source_import_batch_id IS NULL"
            )
            .await,
            1
        );
    }

    #[tokio::test]
    async fn source_type_check_admits_brightdata_only() {
        let pool = fixture_at(37).await;
        finish(&pool).await;
        pool.execute("INSERT INTO campaigns (id,name) VALUES (1,'C')")
            .await
            .unwrap();
        pool.execute("INSERT INTO source_import_batches (campaign_id,source_type) VALUES (1,'brightdata'),(1,'local_json')")
            .await
            .unwrap();
        assert!(pool
            .execute("INSERT INTO source_import_batches (campaign_id,source_type) VALUES (1,'remote_api')")
            .await
            .is_err());
    }

    #[tokio::test]
    async fn enabled_flag_defaults_off_on_existing_row_and_rejects_other_values() {
        let pool = fixture_at(37).await;
        pool.execute("UPDATE app_settings SET launch_on_login_enabled=1 WHERE id=1")
            .await
            .unwrap();
        finish(&pool).await;
        assert_eq!(
            scalar(
                &pool,
                "SELECT brightdata_connector_enabled FROM app_settings WHERE id=1"
            )
            .await,
            0
        );
        assert_eq!(
            scalar(
                &pool,
                "SELECT launch_on_login_enabled FROM app_settings WHERE id=1"
            )
            .await,
            1
        );
        assert!(pool
            .execute("UPDATE app_settings SET brightdata_connector_enabled=2 WHERE id=1")
            .await
            .is_err());
        pool.execute("UPDATE app_settings SET brightdata_connector_enabled=1 WHERE id=1")
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn watchlist_is_unique_per_campaign_and_cascades() {
        let pool = fixture_at(37).await;
        finish(&pool).await;
        pool.execute("INSERT INTO campaigns (id,name) VALUES (1,'A'),(2,'B')")
            .await
            .unwrap();
        let url = "https://www.linkedin.com/in/someone";
        sqlx::query("INSERT INTO source_watchlist_entries (campaign_id,kind,url) VALUES (1,'profile',?1),(2,'profile',?1)")
            .bind(url)
            .execute(&pool)
            .await
            .unwrap();
        assert!(sqlx::query(
            "INSERT INTO source_watchlist_entries (campaign_id,kind,url) VALUES (1,'company',?1)"
        )
        .bind(url)
        .execute(&pool)
        .await
        .is_err());
        assert!(pool
            .execute("INSERT INTO source_watchlist_entries (campaign_id,kind,url) VALUES (1,'group','https://x')")
            .await
            .is_err());
        let long_url = format!("https://{}", "x".repeat(1000));
        assert!(sqlx::query(
            "INSERT INTO source_watchlist_entries (campaign_id,kind,url) VALUES (1,'profile',?1)"
        )
        .bind(long_url)
        .execute(&pool)
        .await
        .is_err());
        pool.execute("DELETE FROM campaigns WHERE id=1")
            .await
            .unwrap();
        assert_eq!(
            scalar(&pool, "SELECT COUNT(*) FROM source_watchlist_entries").await,
            1
        );
    }

    #[tokio::test]
    async fn one_active_run_per_campaign_and_terminal_runs_unblock() {
        let pool = fixture_at(37).await;
        finish(&pool).await;
        pool.execute("INSERT INTO campaigns (id,name) VALUES (1,'A'),(2,'B')")
            .await
            .unwrap();
        pool.execute(
            "INSERT INTO brightdata_runs (campaign_id,mode,input_json) VALUES (1,'keyword','{}')",
        )
        .await
        .unwrap();
        assert!(pool
            .execute("INSERT INTO brightdata_runs (campaign_id,mode,input_json,status) VALUES (1,'post_url','{}','running')")
            .await
            .is_err());
        pool.execute(
            "INSERT INTO brightdata_runs (campaign_id,mode,input_json) VALUES (2,'keyword','{}')",
        )
        .await
        .unwrap();
        // A run left in `starting` (simulated crash) is unblocked once recovery fails it.
        pool.execute("UPDATE brightdata_runs SET status='failed' WHERE campaign_id=1")
            .await
            .unwrap();
        pool.execute(
            "INSERT INTO brightdata_runs (campaign_id,mode,input_json) VALUES (1,'watchlist','{}')",
        )
        .await
        .unwrap();
        for bad in [
            "INSERT INTO brightdata_runs (campaign_id,mode,input_json) VALUES (2,'browser','{}')",
            "INSERT INTO brightdata_runs (campaign_id,mode,input_json,status) VALUES (2,'keyword','{}','done')",
            "INSERT INTO brightdata_runs (campaign_id,mode,input_json,status) VALUES (2,'keyword','not json','failed')",
            "INSERT INTO brightdata_runs (campaign_id,mode,input_json,status) VALUES (9,'keyword','{}','failed')",
        ] {
            assert!(pool.execute(bad).await.is_err(), "{bad}");
        }
        pool.execute("INSERT INTO source_import_batches (id,campaign_id,source_type) VALUES (5,2,'brightdata')")
            .await
            .unwrap();
        pool.execute("UPDATE brightdata_runs SET status='imported', source_import_batch_id=5 WHERE campaign_id=2")
            .await
            .unwrap();
        pool.execute("DELETE FROM source_import_batches WHERE id=5")
            .await
            .unwrap();
        assert_eq!(
            scalar(&pool, "SELECT COUNT(*) FROM brightdata_runs WHERE campaign_id=2 AND source_import_batch_id IS NULL").await,
            1
        );
    }
}
