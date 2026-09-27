//! Disposable databases for desktop release-candidate verification.
//!
//! These tests are `#[ignore]`d and never run in the normal gate. Run them
//! explicitly with `LINKGO_FIXTURE_OUT=<empty dir>` to write:
//!
//! - `pre-upgrade.db`: a populated database at the pre-phase migration
//!   version, used to prove the packaged app upgrades existing data.
//! - `recovery.db`: a current-schema database with one due scheduled post,
//!   one stale `reserved` and one stale `in_flight` manual execution, used to
//!   prove startup recovery and operator reconciliation.
//!
//! Fixtures contain no credentials and never contact LinkedIn. They are for
//! an isolated test identity only; never place them in a real profile.

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use sqlx::{Connection, Executor};

    use crate::approval_review::{
        create_approval, set_approval_status, CreateApprovalInput, SetApprovalStatusInput,
    };
    use crate::auth::publish::LinkedInPublishPostInput;
    use crate::auth::publish::{compose_linkedin_commentary, escape_linkedin_little_text};
    use crate::migrations::native_persistence_upgrade::tests::populated_pre_phase_database;
    use crate::publishing::store::{mark_in_flight, reserve, ReserveRequest};
    use crate::publishing::types::ExecutionCaller;
    use crate::test_support::{migrated, seed};

    const AUDIT_RULES: &str =
        r#"["hook","specificity","generic_language","authenticity","clarity","safety"]"#;
    const DETERMINISTIC_RULES: &str =
        r#"["required_text","total_length","external_link","hashtag_limit"]"#;
    /// Recognizable marker so the desktop harness can find fixture rows.
    const MARKER: &str = "RC fixture";

    fn output_dir() -> PathBuf {
        let dir = std::env::var("LINKGO_FIXTURE_OUT")
            .expect("set LINKGO_FIXTURE_OUT to an empty disposable directory");
        let dir = PathBuf::from(dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn fresh_target(dir: &std::path::Path, name: &str) -> PathBuf {
        let path = dir.join(name);
        assert!(
            !path.exists(),
            "{} already exists; fixtures never overwrite files",
            path.display()
        );
        path
    }

    fn hook(n: i64) -> String {
        format!("{MARKER} hook {n}: we learned from 12 customer interviews")
    }

    const BODY: &str = "Our team tested a specific change.";

    fn post_request(approval_id: i64, n: i64) -> ReserveRequest {
        ReserveRequest::Post(LinkedInPublishPostInput {
            approval_id,
            schedule_job_id: None,
            commentary: escape_linkedin_little_text(&compose_linkedin_commentary(
                &hook(n),
                BODY,
                "",
                "",
            )),
            idempotency_key: format!("approval:{approval_id}:linkedin:manual"),
        })
    }

    #[tokio::test]
    #[ignore = "writes release-candidate fixture databases; run explicitly"]
    async fn write_pre_upgrade_fixture() {
        let path = fresh_target(&output_dir(), "pre-upgrade.db");
        let (_, c) = populated_pre_phase_database(&path).await;
        c.close().await.unwrap();
        println!("wrote {}", path.display());
    }

    #[tokio::test]
    #[ignore = "writes release-candidate fixture databases; run explicitly"]
    async fn write_recovery_fixture() {
        let path = fresh_target(&output_dir(), "recovery.db");
        let f = migrated().await;
        seed(
            &f.pool,
            &format!(
                "INSERT INTO campaigns (id,name,status,daily_post_limit,daily_comment_limit)
                   VALUES (1,'{MARKER} campaign','active',5,5);"
            ),
        )
        .await;
        let mut approvals = Vec::new();
        for n in 1..=3_i64 {
            let hook = hook(n);
            seed(
                &f.pool,
                &format!(
                    "INSERT INTO target_posts (id,url,normalized_url,content,content_hash)
                       VALUES ({n},'https://example.com/rc/{n}','https://example.com/rc/{n}','{MARKER} source {n}','rc{n}');
                     INSERT INTO candidate_posts (id,campaign_id,target_post_id,source_keyword) VALUES ({n},1,{n},'rc');
                     INSERT INTO drafts (id,campaign_id,candidate_post_id,status) VALUES ({n},1,{n},'ready_for_review');
                     INSERT INTO draft_variants (id,draft_id,variant_number,hook,body,status) VALUES ({n},{n},1,'{hook}','{BODY}','selected');
                     INSERT INTO draft_audits (draft_variant_id,rule_key,severity,message) SELECT {n},value,'pass','ok' FROM json_each('{DETERMINISTIC_RULES}');
                     INSERT INTO draft_ai_audit_runs (draft_variant_id,content_revision,provider_key,status,completed_at)
                       SELECT id,content_revision,'dry_run','completed',datetime('now') FROM draft_variants WHERE id={n};
                     INSERT INTO draft_ai_audit_findings (audit_run_id,rule_key,severity,message)
                       SELECT (SELECT MAX(id) FROM draft_ai_audit_runs),value,'pass','ok' FROM json_each('{AUDIT_RULES}');
                     INSERT INTO draft_quality_runs (draft_variant_id,starting_content_revision,current_content_revision,provider_key,status,final_score,completed_at)
                       SELECT id,content_revision,content_revision,'dry_run','passed',80,datetime('now') FROM draft_variants WHERE id={n};"
                ),
            )
            .await;
            let id = create_approval(
                &f.pool,
                CreateApprovalInput {
                    draft_id: n,
                    reviewer_notes: None,
                },
            )
            .await
            .unwrap();
            set_approval_status(
                &f.pool,
                SetApprovalStatusInput {
                    id,
                    status: "approved".to_string(),
                    content_revision: Some(1),
                    reviewer_notes: None,
                },
            )
            .await
            .unwrap();
            approvals.push(id);
        }
        let [reserved_approval, in_flight_approval, scheduled_approval] = approvals[..] else {
            panic!("expected three approvals");
        };

        // Crash after reserve: never contacted LinkedIn.
        reserve(
            &f.pool,
            post_request(reserved_approval, 1),
            ExecutionCaller::Manual,
        )
        .await
        .unwrap()
        .unwrap();
        // Crash after send: LinkedIn may or may not have published.
        let in_flight = reserve(
            &f.pool,
            post_request(in_flight_approval, 2),
            ExecutionCaller::Manual,
        )
        .await
        .unwrap()
        .unwrap();
        assert!(mark_in_flight(&f.pool, &in_flight.lease).await.unwrap());
        // Backdate both so the next startup sweep treats their owner as dead.
        seed(
            &f.pool,
            &format!(
                "UPDATE publish_executions SET updated_at = datetime('now','-1 hour');
                 INSERT INTO schedule_jobs (approval_id,scheduled_for,timezone,status,idempotency_key)
                   VALUES ({scheduled_approval},'2020-01-01T00:00:00Z','UTC','scheduled','approval:{scheduled_approval}:linkedin:rc');
                 UPDATE approvals SET status='scheduled' WHERE id={scheduled_approval};"
            ),
        )
        .await;

        let target = path.to_string_lossy().replace('\'', "''");
        f.pool
            .execute(format!("VACUUM INTO '{target}'").as_str())
            .await
            .unwrap();
        println!("wrote {}", path.display());
    }
}
