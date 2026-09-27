//! Upgrade evidence for the native persistence ownership phase. This proves
//! the current migration chain upgrades a populated version-33 database (the
//! last committed migration, `draft_quality`) through the uncommitted
//! migrations 34 (`draft_quality_tool`), 35 (`approval_readiness`) and 36
//! (`latest_draft_quality`) without losing rows in any table the phase's
//! native commands now own. The only permitted change is migration 35's
//! documented reset of pending approvals for re-review.

#[cfg(test)]
pub(crate) mod tests {
    use crate::migrations::{get_migrations, migrate_database};
    use sqlx::{
        migrate::{Migration as SqlxMigration, MigrationType, Migrator},
        sqlite::SqliteConnectOptions,
        Connection, Executor, SqliteConnection,
    };
    use std::borrow::Cow;

    const PRE_PHASE_VERSION: i64 = 33;

    /// Every table read or written by the phase's native commands.
    const OWNED_TABLES: &[&str] = &[
        "app_settings",
        "agent_playbook_overrides",
        "safety_settings",
        "safety_audit_events",
        "error_queue_items",
        "rate_limit_events",
        "campaigns",
        "campaign_keywords",
        "candidate_intake_policies",
        "candidate_policy_banned_topics",
        "target_posts",
        "candidate_posts",
        "candidate_discovery_items",
        "source_import_batches",
        "source_import_items",
        "drafts",
        "draft_variants",
        "draft_audits",
        "draft_generation_requests",
        "approvals",
        "schedule_jobs",
        "publish_attempts",
        "content_calendar_slots",
        "comment_threads",
        "comment_variants",
        "comment_audits",
        "comment_attempts",
        "post_metrics",
        "campaign_memory",
        "learning_events",
        "metric_refresh_jobs",
        "metric_refresh_events",
        "workflow_runs",
        "workflow_steps",
        "workflow_events",
        "workflow_artifacts",
        "workflow_step_executions",
        "agent_runs",
        "agent_run_events",
        "campaign_backlog_items",
        "autopilot_plans",
        "autopilot_planner_events",
    ];

    const SEED: &str = "
        INSERT OR REPLACE INTO app_settings (id,launch_on_login_enabled,launch_on_login_last_error) VALUES (1,1,'denied');
        INSERT INTO agent_playbook_overrides (playbook_key,enabled,custom_instructions) VALUES ('linkedin_writer',0,'Be brief');
        UPDATE safety_settings SET global_kill_switch=1, kill_switch_reason='paused for review' WHERE id=1;
        INSERT INTO campaigns (id,name,status,daily_post_limit,auto_pilot) VALUES (1,'Live','active',5,1),(2,'Old','archived',3,0);
        INSERT INTO campaign_keywords (campaign_id,keyword) VALUES (1,'ai ops');
        INSERT INTO candidate_intake_policies (campaign_id,max_post_age_days) VALUES (1,14);
        INSERT INTO candidate_policy_banned_topics (campaign_id,topic,normalized_topic) VALUES (1,'Crypto','crypto');
        INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES
          (1,'https://e.com/1','https://e.com/1','Post one','h1'),(2,'https://e.com/2','https://e.com/2','Post two','h2');
        INSERT INTO candidate_posts (id,campaign_id,target_post_id,status,relevance_score,notes) VALUES
          (1,1,1,'shortlisted',80,'keep'),(2,1,2,'new',NULL,'');
        INSERT INTO candidate_discovery_items (campaign_id,kind,keyword,confidence_score) VALUES (1,'keyword','growth',70);
        INSERT INTO source_import_batches (id,campaign_id,source_type,status,total_count,accepted_count) VALUES (1,1,'local_json','completed',1,1);
        INSERT INTO source_import_items (source_import_batch_id,row_number,status,input_json,candidate_post_id) VALUES (1,1,'accepted','{}',1);
        INSERT INTO drafts (id,campaign_id,candidate_post_id,angle,status) VALUES (1,1,1,'Angle','ready_for_review');
        INSERT INTO draft_variants (id,draft_id,variant_number,hook,body,status) VALUES (1,1,1,'Hook','Body','selected');
        INSERT INTO draft_audits (draft_variant_id,rule_key,severity,message) VALUES (1,'hook','warning','weak');
        INSERT INTO draft_generation_requests (campaign_id,candidate_post_id,provider_key,variant_count,status) VALUES (1,2,'dry_run',3,'failed');
        INSERT INTO approvals (id,campaign_id,draft_id,draft_variant_id,status,reviewer_notes) VALUES (1,1,1,1,'needs_review','check');
        INSERT INTO publish_attempts (approval_id,status,error_message) VALUES (1,'failed','rate limited');
        INSERT INTO schedule_jobs (approval_id,scheduled_for,timezone,status,idempotency_key) VALUES
          (1,'2026-10-01T09:00:00Z','UTC','cancelled','upgrade-key');
        INSERT INTO post_metrics (campaign_id,approval_id,measured_at,impressions,reactions,ctr,notes) VALUES
          (1,1,'2026-09-20T10:00',1200,34,2.5,'manual');
        INSERT INTO metric_refresh_jobs (campaign_id,approval_id,target_urn,status,next_refresh_at) VALUES
          (1,1,'urn:li:share:1','paused','2026-10-01 00:00:00');
        INSERT INTO content_calendar_slots (campaign_id,approval_id,purpose,slot_for,format,angle,visual_direction,cta) VALUES
          (1,1,'trust','2026-10-01T09:00:00Z','text','a','v','c');
        INSERT INTO comment_threads (id,campaign_id,candidate_post_id,status) VALUES (1,1,1,'needs_review');
        INSERT INTO comment_variants (id,comment_thread_id,variant_number,body,status) VALUES (1,1,1,'Nice point','selected');
        INSERT INTO comment_audits (comment_variant_id,rule_key,severity,message) VALUES (1,'length','pass','ok');
        INSERT INTO comment_attempts (comment_thread_id,status,error_message) VALUES (1,'failed','blocked');
        INSERT INTO campaign_memory (campaign_id,signal,summary,confidence) VALUES (1,'insight','Short hooks win',60);
        INSERT INTO learning_events (campaign_id,event_type,summary) VALUES (1,'memory_created','Recorded');
        INSERT INTO metric_refresh_events (campaign_id,event_type,severity,summary) VALUES (1,'tick_started','info','tick');
        INSERT INTO rate_limit_events (campaign_id,action,window_key,limit_value,current_count,decision,summary) VALUES
          (1,'schedule_post','2026-09-24',5,5,'blocked','limit');
        INSERT INTO safety_audit_events (campaign_id,subject_type,subject_id,event_type,summary) VALUES (1,'campaign',1,'schedule_blocked','limit');
        INSERT INTO error_queue_items (campaign_id,source_type,title,status) VALUES (1,'manual','Check token','open');
        INSERT INTO workflow_runs (id,campaign_id,title,status,current_step_key) VALUES (1,1,'Weekly','running','score');
        INSERT INTO workflow_steps (workflow_run_id,step_key,title,sort_order,status) VALUES (1,'score','Score',2,'running');
        INSERT INTO workflow_events (workflow_run_id,event_type,summary) VALUES (1,'note_added','hello');
        INSERT INTO workflow_artifacts (workflow_run_id,artifact_type,artifact_id) VALUES (1,'candidate_post',1);
        INSERT INTO agent_runs (id,campaign_id,workflow_run_id,agent_role,provider_key,status) VALUES (1,1,1,'scorer','dry_run','completed');
        INSERT INTO agent_run_events (agent_run_id,event_type,summary) VALUES (1,'model_started','go');
        INSERT INTO workflow_step_executions (workflow_step_id,agent_run_id,executor_role,status)
          SELECT id,1,'scorer','completed' FROM workflow_steps WHERE workflow_run_id=1 AND step_key='score';
        INSERT INTO campaign_backlog_items (id,campaign_id,work_type,title,owner_type,due_at) VALUES
          (1,1,'research','Review imports','linkgo','2026-10-01T00:00:00.000Z');
        INSERT INTO autopilot_plans (campaign_id,source_import_batch_id,source_type,status,campaign_backlog_item_id,workflow_run_id,candidate_count) VALUES
          (1,1,'local_json','planned',1,1,1);
        INSERT INTO autopilot_planner_events (campaign_id,event_type,severity,summary) VALUES (1,'batch_planned','info','planned');
    ";

    /// Every pre-upgrade column of every owned table, row by row.
    async fn fingerprint(
        connection: &mut SqliteConnection,
        columns: &[(String, Vec<String>)],
    ) -> Vec<String> {
        let mut rows = Vec::new();
        for (table, names) in columns {
            let sql = format!(
                "SELECT COUNT(*) || ':' || COALESCE(json_group_array(json_array({})), '[]')
                 FROM (SELECT * FROM {table} ORDER BY rowid)",
                names.join(",")
            );
            let value: String = sqlx::query_scalar(&sql)
                .fetch_one(&mut *connection)
                .await
                .unwrap();
            rows.push(format!("{table}={value}"));
        }
        rows
    }

    /// Creates a populated database at the pre-phase migration version and
    /// returns its options plus an open connection. Also used by the
    /// release-candidate fixture writer.
    pub(crate) async fn populated_pre_phase_database(
        path: &std::path::Path,
    ) -> (SqliteConnectOptions, SqliteConnection) {
        let options = SqliteConnectOptions::new()
            .filename(path)
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
                    .filter(|m| m.version <= PRE_PHASE_VERSION)
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
        c.execute("PRAGMA legacy_alter_table=OFF; PRAGMA foreign_keys=ON;")
            .await
            .unwrap();
        c.execute(SEED).await.unwrap();
        (options, c)
    }

    #[tokio::test]
    async fn populated_pre_phase_database_upgrades_without_data_loss() {
        let directory = tempfile::tempdir().unwrap();
        let (options, mut c) =
            populated_pre_phase_database(&directory.path().join("pre-phase.db")).await;

        let mut columns = Vec::new();
        for table in OWNED_TABLES {
            let names: Vec<String> =
                sqlx::query_scalar(&format!("SELECT name FROM pragma_table_info('{table}')"))
                    .fetch_all(&mut c)
                    .await
                    .unwrap();
            assert!(!names.is_empty(), "pre-phase table {table} is missing");
            columns.push(((*table).to_string(), names));
        }
        let before = fingerprint(&mut c, &columns).await;
        for row in &before {
            assert!(!row.contains("=0:"), "fixture left {row} empty");
        }
        c.close().await.unwrap();

        migrate_database(&options).await.unwrap();
        migrate_database(&options).await.unwrap(); // Restart does not re-run upgrades.

        let mut c = SqliteConnection::connect_with(&options).await.unwrap();
        // Migration 35 (approval readiness, uncommitted at time of writing) deliberately
        // sends pending approvals back for re-review because their reviewed
        // revision is unknown. That documented status reset is the only change
        // allowed; every other column of every owned table must be identical.
        let expected: Vec<String> = before
            .iter()
            .map(|row| {
                if row.starts_with("approvals=") {
                    row.replace("\"needs_review\"", "\"changes_requested\"")
                } else {
                    row.clone()
                }
            })
            .collect();
        assert!(before.iter().any(|row| row.contains("\"needs_review\"")));
        assert_eq!(fingerprint(&mut c, &columns).await, expected);
        assert!(sqlx::query("PRAGMA foreign_key_check")
            .fetch_all(&mut c)
            .await
            .unwrap()
            .is_empty());
        let latest: i64 = sqlx::query_scalar("SELECT MAX(version) FROM _sqlx_migrations")
            .fetch_one(&mut c)
            .await
            .unwrap();
        let expected = get_migrations().iter().map(|m| m.version).max().unwrap();
        assert_eq!(latest, expected);
    }
}
