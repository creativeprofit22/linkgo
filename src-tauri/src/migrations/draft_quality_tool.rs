use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 34,
        description: "allow_completed_draft_quality_tool_evidence",
        // The startup migrator runs this transaction with foreign keys suspended,
        // then checks all foreign keys before returning. Copy before replacing;
        // keep IDs, all payloads, and the AUTOINCREMENT high-water mark.
        sql: "CREATE TABLE agent_tool_calls_quality (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_run_id INTEGER NOT NULL,
            provider_tool_call_id TEXT NOT NULL DEFAULT '',
            tool_name TEXT NOT NULL CHECK(tool_name IN ('research_posts', 'score_relevance', 'draft_post', 'audit_post', 'schedule_post', 'collect_metrics', 'score_draft_quality')),
            status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested', 'running', 'waiting_approval', 'completed', 'failed', 'rejected')),
            requires_approval INTEGER NOT NULL DEFAULT 0 CHECK(requires_approval IN (0, 1)),
            input_json TEXT NOT NULL DEFAULT '{}',
            output_json TEXT NOT NULL DEFAULT '{}',
            error_message TEXT NOT NULL DEFAULT '',
            started_at TEXT,
            completed_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
        );
        INSERT INTO agent_tool_calls_quality
            (id,agent_run_id,provider_tool_call_id,tool_name,status,requires_approval,input_json,output_json,error_message,started_at,completed_at,created_at)
        SELECT id,agent_run_id,provider_tool_call_id,tool_name,status,requires_approval,input_json,output_json,error_message,started_at,completed_at,created_at FROM agent_tool_calls;
        UPDATE sqlite_sequence SET seq = MAX(seq, COALESCE((SELECT seq FROM sqlite_sequence WHERE name='agent_tool_calls'), 0)) WHERE name='agent_tool_calls_quality';
        DROP TABLE agent_tool_calls;
        ALTER TABLE agent_tool_calls_quality RENAME TO agent_tool_calls;
        CREATE INDEX idx_agent_tool_calls_run_id ON agent_tool_calls(agent_run_id);
        CREATE INDEX idx_agent_tool_calls_tool_name ON agent_tool_calls(tool_name);
        CREATE INDEX idx_agent_tool_calls_status ON agent_tool_calls(status);",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use crate::migrations::{get_migrations, migrate_database};
    use sqlx::{
        migrate::{Migration as SqlxMigration, MigrationType, Migrator},
        sqlite::SqliteConnectOptions,
        Connection, Executor, SqliteConnection,
    };
    use std::borrow::Cow;

    #[tokio::test]
    async fn draft_quality_tool_upgrade_preserves_evidence_and_checkpoint() {
        let directory = tempfile::tempdir().unwrap();
        let options = SqliteConnectOptions::new()
            .filename(directory.path().join("upgrade.db"))
            .create_if_missing(true)
            .foreign_keys(true);
        let mut c = SqliteConnection::connect_with(&options).await.unwrap();
        c.execute("PRAGMA foreign_keys=OFF; PRAGMA legacy_alter_table=ON;")
            .await
            .unwrap();
        let old = Migrator {
            migrations: Cow::Owned(
                get_migrations()
                    .into_iter()
                    .filter(|m| m.version <= 33)
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
        old.run(&mut c).await.unwrap();
        c.execute("PRAGMA legacy_alter_table=OFF; PRAGMA foreign_keys=ON;
            INSERT INTO campaigns (id,name) VALUES (1,'Upgrade');
            INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES (1,'https://example.com','https://example.com','Source','hash');
            INSERT INTO candidate_posts (id,campaign_id,target_post_id) VALUES (1,1,1);
            INSERT INTO drafts (id,campaign_id,candidate_post_id) VALUES (1,1,1);
            INSERT INTO draft_variants (id,draft_id,variant_number) VALUES (1,1,1);
            INSERT INTO approvals (id,campaign_id,draft_id,draft_variant_id) VALUES (1,1,1,1);
            INSERT INTO agent_runs (id,campaign_id,agent_role) VALUES (1,1,'auditor');
            INSERT INTO agent_tool_calls (id,agent_run_id,provider_tool_call_id,tool_name,status,requires_approval,input_json,output_json,error_message,started_at,completed_at,created_at)
                VALUES (1,1,'provider-1','audit_post','completed',1,'{\"input\":1}','{\"output\":2}','retained','start','complete','created');
            INSERT INTO agent_tool_calls (id,agent_run_id,tool_name) VALUES (99,1,'audit_post');
            DELETE FROM agent_tool_calls WHERE id=99;
            INSERT INTO agent_run_approval_checkpoints (agent_run_id,pending_tool_call_id,approval_id,phase,messages_json,iteration_count)
                VALUES (1,1,1,'waiting_approval','[]',1);").await.unwrap();
        let evidence_sql = "SELECT json_array(id,agent_run_id,provider_tool_call_id,tool_name,status,requires_approval,input_json,output_json,error_message,started_at,completed_at,created_at) FROM agent_tool_calls WHERE id=1";
        let checkpoint_sql = "SELECT json_array(agent_run_id,pending_tool_call_id,approval_id,phase,messages_json,iteration_count,created_at,updated_at) FROM agent_run_approval_checkpoints";
        let before: String = sqlx::query_scalar(evidence_sql)
            .fetch_one(&mut c)
            .await
            .unwrap();
        let checkpoint: String = sqlx::query_scalar(checkpoint_sql)
            .fetch_one(&mut c)
            .await
            .unwrap();
        c.close().await.unwrap();
        migrate_database(&options).await.unwrap();
        migrate_database(&options).await.unwrap(); // Upgrade is not repeated on restart.
        let mut c = SqliteConnection::connect_with(&options).await.unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, String>(evidence_sql)
                .fetch_one(&mut c)
                .await
                .unwrap(),
            before
        );
        assert_eq!(
            sqlx::query_scalar::<_, String>(checkpoint_sql)
                .fetch_one(&mut c)
                .await
                .unwrap(),
            checkpoint
        );
        assert!(sqlx::query("PRAGMA foreign_key_check")
            .fetch_all(&mut c)
            .await
            .unwrap()
            .is_empty());
        let next = sqlx::query("INSERT INTO agent_tool_calls (agent_run_id,tool_name) VALUES (1,'score_draft_quality')").execute(&mut c).await.unwrap();
        assert!(next.last_insert_rowid() > 99);
        for sql in [
            "INSERT INTO agent_tool_calls (agent_run_id,tool_name) VALUES (1,'unknown_tool')",
            "INSERT INTO agent_tool_calls (agent_run_id,tool_name,status) VALUES (1,'score_draft_quality','invalid')",
            "INSERT INTO agent_tool_calls (agent_run_id,tool_name,requires_approval) VALUES (1,'score_draft_quality',2)",
            "INSERT INTO agent_tool_calls (agent_run_id,tool_name) VALUES (999,'score_draft_quality')",
        ] { assert!(c.execute(sql).await.is_err(), "accepted {sql}"); }
        assert_eq!(sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name IN ('idx_agent_tool_calls_run_id','idx_agent_tool_calls_tool_name','idx_agent_tool_calls_status')").fetch_one(&mut c).await.unwrap(), 3);
        c.close().await.unwrap();
    }
}
