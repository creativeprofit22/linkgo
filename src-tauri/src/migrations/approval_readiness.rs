use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 35,
        description: "bind_approval_readiness_to_content_revision",
        sql: include_str!("approval_readiness.sql"),
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
        pool.execute("PRAGMA foreign_keys=ON; PRAGMA legacy_alter_table=OFF;")
            .await
            .unwrap();
        pool.execute("INSERT INTO campaigns (id,name,status) VALUES (1,'Approval readiness','active');
            INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES (1,'https://example.com/a','https://example.com/a','Source','hash');
            INSERT INTO candidate_posts (id,campaign_id,target_post_id) VALUES (1,1,1);
            INSERT INTO drafts (id,campaign_id,candidate_post_id,status) VALUES (1,1,1,'ready_for_review');
            INSERT INTO draft_variants (id,draft_id,variant_number,hook,body,status) VALUES (1,1,1,'We learned from 12 customer interviews','Our team tested a specific change.','selected');").await.unwrap();
        evidence(&pool).await;
        pool
    }

    async fn evidence(pool: &SqlitePool) {
        pool.execute("DELETE FROM draft_audits WHERE draft_variant_id=1;
            INSERT INTO draft_audits (draft_variant_id,rule_key,severity,message) SELECT 1,value,'pass','Deterministic check passed' FROM json_each('[\"required_text\",\"total_length\",\"external_link\",\"hashtag_limit\"]');
            INSERT INTO draft_ai_audit_runs (draft_variant_id,content_revision,provider_key,status,completed_at) SELECT id,content_revision,'dry_run','completed',datetime('now') FROM draft_variants WHERE id=1;
            INSERT INTO draft_ai_audit_findings (audit_run_id,rule_key,severity,message) SELECT (SELECT MAX(id) FROM draft_ai_audit_runs),value,'pass','Checked current text' FROM json_each('[\"hook\",\"specificity\",\"generic_language\",\"authenticity\",\"clarity\",\"safety\"]');
            INSERT INTO draft_quality_runs (draft_variant_id,starting_content_revision,current_content_revision,provider_key,status,final_score,completed_at) SELECT id,content_revision,content_revision,'dry_run','passed',80,datetime('now') FROM draft_variants WHERE id=1;").await.unwrap();
    }

    #[tokio::test]
    async fn latest_draft_quality_migration_preserves_history_and_rejects_older_passes() {
        for status in [
            "pending",
            "running",
            "failed",
            "cancelled",
            "needs_revision",
            "passed",
        ] {
            let pool = fixture_at(35).await;
            pool.execute("INSERT INTO approvals (campaign_id,draft_id,draft_variant_id,status) VALUES (1,1,1,'needs_review')").await.unwrap();
            sqlx::query("INSERT INTO draft_quality_runs (draft_variant_id,starting_content_revision,current_content_revision,provider_key,status,final_score,completed_at) VALUES (1,1,1,'dry_run',?1,CASE WHEN ?1='passed' THEN 80 ELSE NULL END,CASE WHEN ?1 IN ('pending','running') THEN NULL ELSE datetime('now') END)")
                .bind(status).execute(&pool).await.unwrap();
            // Reproduce the old view before applying the forward migration.
            assert_eq!(
                sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM approval_ready_variants")
                    .fetch_one(&pool)
                    .await
                    .unwrap(),
                1
            );
            let mut transaction = pool.begin().await.unwrap();
            transaction
                .execute(crate::migrations::latest_draft_quality::migrations()[0].sql)
                .await
                .unwrap();
            transaction.commit().await.unwrap();
            let expected = i64::from(status == "passed");
            assert_eq!(
                sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM approval_ready_variants")
                    .fetch_one(&pool)
                    .await
                    .unwrap(),
                expected,
                "{status}"
            );
            assert_eq!(
                pool.execute("UPDATE approvals SET status='approved' WHERE id=1")
                    .await
                    .is_ok(),
                status == "passed",
                "{status}"
            );
            assert_eq!(
                sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM draft_quality_runs")
                    .fetch_one(&pool)
                    .await
                    .unwrap(),
                2
            );
            assert_eq!(
                sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM approvals")
                    .fetch_one(&pool)
                    .await
                    .unwrap(),
                1
            );
            // Terminalize only the fixture's active run, then append a valid latest pass.
            pool.execute("UPDATE draft_quality_runs SET status='failed',completed_at=datetime('now') WHERE status IN ('pending','running')").await.unwrap();
            evidence(&pool).await;
            assert_eq!(
                sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM approval_ready_variants")
                    .fetch_one(&pool)
                    .await
                    .unwrap(),
                1
            );
            pool.execute("UPDATE approvals SET status='approved' WHERE id=1; UPDATE draft_variants SET body='A real edit excludes all previous results' WHERE id=1").await.unwrap();
            assert_eq!(
                sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM approval_ready_variants")
                    .fetch_one(&pool)
                    .await
                    .unwrap(),
                0
            );
            // Even newly inserted old-revision passes cannot qualify the edited text.
            pool.execute("INSERT INTO draft_quality_runs (draft_variant_id,starting_content_revision,current_content_revision,provider_key,status,final_score,completed_at) VALUES (1,1,1,'dry_run','passed',90,datetime('now'))").await.unwrap();
            assert!(pool
                .execute(
                    "UPDATE approvals SET status='approved',reviewed_content_revision=2 WHERE id=1"
                )
                .await
                .is_err());
            evidence(&pool).await;
            pool.execute(
                "UPDATE approvals SET status='approved',reviewed_content_revision=2 WHERE id=1",
            )
            .await
            .unwrap();
            pool.close().await;
        }
    }

    #[tokio::test]
    async fn content_edit_revokes_approved_state_in_storage() {
        let pool = fixture_at(35).await;
        pool.execute("INSERT INTO approvals (campaign_id,draft_id,draft_variant_id,status) VALUES (1,1,1,'needs_review'); UPDATE approvals SET status='approved' WHERE id=1;
            UPDATE draft_variants SET body='A changed and unchecked example' WHERE id=1;").await.unwrap();
        let status: String = sqlx::query_scalar("SELECT status FROM approvals WHERE id=1")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(status, "changes_requested");
        assert!(pool
            .execute("UPDATE approvals SET status='approved' WHERE id=1")
            .await
            .is_err());
        assert!(pool
            .execute(
                "UPDATE approvals SET status='approved',reviewed_content_revision=2 WHERE id=1"
            )
            .await
            .is_err());
        assert!(pool
            .execute("UPDATE draft_variants SET content_revision=1 WHERE id=1")
            .await
            .is_err());
        evidence(&pool).await;
        // A stale reviewer cannot attach approval to a different revision even after rechecking.
        assert!(pool
            .execute("UPDATE approvals SET status='approved' WHERE id=1")
            .await
            .is_err());
        pool.execute(
            "UPDATE approvals SET status='approved',reviewed_content_revision=2 WHERE id=1",
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn no_op_preserves_binding_but_each_real_field_edit_revokes_it() {
        for field in ["hook", "body", "cta", "hashtags"] {
            let pool = fixture_at(35).await;
            pool.execute("INSERT INTO approvals (campaign_id,draft_id,draft_variant_id,status) VALUES (1,1,1,'approved');").await.unwrap();
            pool.execute("UPDATE draft_variants SET hook=hook,body=body,cta=cta,hashtags=hashtags WHERE id=1;").await.unwrap();
            let revision: i64 = sqlx::query_scalar(
                "SELECT reviewed_content_revision FROM approvals WHERE status='approved'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(revision, 1);
            pool.execute(
                format!("UPDATE draft_variants SET {field}='Changed content' WHERE id=1").as_str(),
            )
            .await
            .unwrap();
            assert_eq!(
                sqlx::query_scalar::<_, String>("SELECT status FROM approvals")
                    .fetch_one(&pool)
                    .await
                    .unwrap(),
                "changes_requested"
            );
        }
    }

    #[tokio::test]
    async fn storage_rechecks_each_prerequisite_on_insert_and_transition() {
        for mutation in [
            "DELETE FROM draft_audits WHERE rule_key='required_text'",
            "UPDATE draft_audits SET severity='block' WHERE rule_key='total_length'",
            "UPDATE draft_audits SET content_revision=NULL",
            "DELETE FROM draft_ai_audit_findings WHERE rule_key='hook'",
            "UPDATE draft_ai_audit_findings SET severity='block' WHERE rule_key='safety'",
            "UPDATE draft_ai_audit_runs SET status='failed'",
            "UPDATE draft_ai_audit_findings SET rule_key='unknown' WHERE rule_key='hook'",
            "DELETE FROM draft_quality_runs",
            "UPDATE campaigns SET status='archived'",
            "UPDATE draft_variants SET status='draft'",
        ] {
            let pool = fixture_at(35).await;
            pool.execute(
                "INSERT INTO approvals (campaign_id,draft_id,draft_variant_id) VALUES (1,1,1)",
            )
            .await
            .unwrap();
            pool.execute(mutation).await.unwrap();
            assert!(
                pool.execute("UPDATE approvals SET status='approved' WHERE id=1")
                    .await
                    .is_err(),
                "transition accepted {mutation}"
            );
            pool.execute("DELETE FROM approvals WHERE id=1")
                .await
                .unwrap();
            assert!(pool.execute("INSERT INTO approvals (campaign_id,draft_id,draft_variant_id,status) VALUES (1,1,1,'approved')").await.is_err(), "insert accepted {mutation}");
        }
    }

    #[tokio::test]
    async fn historical_migration_preserves_records_and_fails_closed() {
        let pool = fixture_at(34).await;
        pool.execute("INSERT INTO approvals (campaign_id,draft_id,draft_variant_id,status,reviewer_notes,approved_at) VALUES (1,1,1,'approved','Keep these notes','2026-01-01');
            INSERT INTO schedule_jobs (approval_id,scheduled_for,idempotency_key) VALUES (1,'2026-12-01','keep-job');").await.unwrap();
        pool.execute(super::migrations()[0].sql).await.unwrap();
        let preserved: (String,String,String,Option<i64>) = sqlx::query_as("SELECT status,reviewer_notes,approved_at,reviewed_content_revision FROM approvals WHERE id=1").fetch_one(&pool).await.unwrap();
        assert_eq!(
            preserved,
            (
                "changes_requested".into(),
                "Keep these notes".into(),
                "2026-01-01".into(),
                None
            )
        );
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT status FROM schedule_jobs WHERE id=1")
                .fetch_one(&pool)
                .await
                .unwrap(),
            "cancelled"
        );
        assert!(pool
            .execute(
                "UPDATE approvals SET status='approved',reviewed_content_revision=1 WHERE id=1"
            )
            .await
            .is_err());
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM draft_variants")
                .fetch_one(&pool)
                .await
                .unwrap(),
            1
        );
        evidence(&pool).await;
        pool.execute(
            "UPDATE approvals SET status='approved',reviewed_content_revision=1 WHERE id=1",
        )
        .await
        .unwrap();
        assert!(sqlx::query("PRAGMA foreign_key_check")
            .fetch_all(&pool)
            .await
            .unwrap()
            .is_empty());
    }
}
