use super::*;
use crate::test_support::{fail_on, migrated, seed, snapshot, text, Fixture};

const TABLES: &[&str] = &["drafts"];

/// Draft 1 (campaign 1) has variants 1 (revision 2) and 2; draft 2 is
/// archived; draft 3 is in campaign 2. Variant 1 has a stale and a current
/// AI audit run, a completed current run with findings, and a quality run.
async fn fixture() -> Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Other','active',5);
         INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES
           (1,'u1','n1','c','h1'),(2,'u2','n2','c','h2'),(3,'u3','n3','c','h3');
         INSERT INTO candidate_posts (id,campaign_id,target_post_id,status,relevance_score) VALUES
           (1,1,1,'shortlisted',80),(2,1,2,'new',NULL),(3,2,3,'new',NULL);
         INSERT INTO drafts (id,campaign_id,candidate_post_id,angle,status,updated_at) VALUES
           (1,1,1,'A','ready_for_review','2026-09-01 00:00:00'),
           (2,1,2,'B','archived','2026-09-05 00:00:00'),
           (3,2,3,'C','drafting','2026-09-02 00:00:00');
         INSERT INTO draft_variants (id,draft_id,variant_number,hook,body,status) VALUES
           (2,1,2,'h2','b2','draft'),(1,1,1,'h1','b1','selected'),(3,3,1,'h3','b3','draft');
         UPDATE draft_variants SET content_revision = 2 WHERE id = 1;
         INSERT INTO draft_audits (draft_variant_id,rule_key,severity,message) VALUES (1,'hook','warning','weak');
         INSERT INTO draft_ai_audit_runs (id,draft_variant_id,content_revision,provider_key,status,completed_at) VALUES
           (1,1,1,'dry_run','completed',datetime('now')),(2,1,2,'dry_run','completed',datetime('now'));
         INSERT INTO draft_ai_audit_findings (audit_run_id,rule_key,severity,message) VALUES
           (1,'hook','pass','old'),(2,'hook','pass','current');
         INSERT INTO draft_quality_runs (id,draft_variant_id,starting_content_revision,current_content_revision,provider_key,status) VALUES
           (1,1,2,2,'dry_run','running');
         INSERT INTO draft_quality_attempts (id,run_id,attempt_number,content_revision,input_hook,input_body,input_cta,input_hashtags,status) VALUES
           (1,1,1,2,'h','b','','','scored');
         INSERT INTO draft_quality_category_scores (attempt_id,category_key,score,feedback) VALUES (1,'hook_strength',80,'ok');",
    )
    .await;
    f
}

fn update(id: i64) -> UpdateDraftInput {
    UpdateDraftInput {
        id,
        angle: None,
        notes: None,
        status: None,
    }
}

fn ids(rows: &[Value], key: &str) -> Vec<i64> {
    rows.iter().map(|row| row[key].as_i64().unwrap()).collect()
}

#[test]
fn inputs_reject_unknown_fields_and_null_values() {
    assert!(
        serde_json::from_value::<UpdateDraftInput>(serde_json::json!({ "id": 1, "x": 1 })).is_err()
    );
    assert!(serde_json::from_value::<UpdateDraftInput>(
        serde_json::json!({ "id": 1, "angle": null })
    )
    .is_err());
    assert!(serde_json::from_value::<DraftListInput>(
        serde_json::json!({ "campaignId": 1, "x": 1 })
    )
    .is_err());
    let parsed = serde_json::from_value::<DraftListInput>(
        serde_json::json!({ "campaignId": 1, "candidatePostId": 2 }),
    )
    .unwrap();
    assert_eq!(parsed.candidate_post_id, Some(2));
    // The idea filter belongs to the draft list only.
    assert!(serde_json::from_value::<DraftGenerationRequestListInput>(
        serde_json::json!({ "campaignId": 1, "candidatePostId": 2 })
    )
    .is_err());
    assert!(serde_json::from_value::<DraftWorkflowOptionsInput>(serde_json::json!({})).is_err());
}

#[tokio::test]
async fn invalid_ids_are_rejected() {
    let f = migrated().await;
    let bad = DraftListInput {
        campaign_id: Some(0),
        candidate_post_id: None,
    };
    assert!(list_drafts(&f.pool, bad).await.is_err());
    let bad_idea = DraftListInput {
        campaign_id: Some(1),
        candidate_post_id: Some(-1),
    };
    assert_eq!(
        list_drafts(&f.pool, bad_idea).await.unwrap_err(),
        "Idea id must be a positive integer"
    );
    assert!(
        list_workflow_options(&f.pool, DraftWorkflowOptionsInput { campaign_id: 0 })
            .await
            .is_err()
    );
}

#[tokio::test]
async fn draft_list_returns_current_related_rows() {
    let f = fixture().await;
    let snapshot = list_drafts(
        &f.pool,
        DraftListInput {
            campaign_id: Some(1),
            candidate_post_id: None,
        },
    )
    .await
    .unwrap();
    // Archived last.
    assert_eq!(ids(&snapshot.drafts, "id"), vec![1, 2]);
    assert_eq!(snapshot.total_count, 2);
    assert_eq!(snapshot.drafts[0]["target_url"], "u1");
    assert_eq!(snapshot.drafts[0]["content_intent"], "idea");
    assert_eq!(ids(&snapshot.variants, "variant_number"), vec![1, 2]);
    assert_eq!(snapshot.audits.len(), 1);
    // Only the current-revision run and its findings.
    assert_eq!(ids(&snapshot.ai_audit_runs, "id"), vec![2]);
    assert_eq!(snapshot.ai_audit_findings.len(), 1);
    assert_eq!(snapshot.ai_audit_findings[0]["message"], "current");
    assert_eq!(ids(&snapshot.quality_runs, "id"), vec![1]);
    assert_eq!(snapshot.quality_attempts.len(), 1);
    assert_eq!(snapshot.quality_scores[0]["score"], 80);
}

#[tokio::test]
async fn draft_list_is_capped_and_reports_the_uncapped_total() {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Other','active',5);
         WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 510)
         INSERT INTO target_posts (id,url,normalized_url,content,content_hash) SELECT i,'u'||i,'n'||i,'c','h'||i FROM n;
         INSERT INTO candidate_posts (id,campaign_id,target_post_id,status)
           SELECT id,CASE WHEN id <= 505 THEN 1 ELSE 2 END,id,'drafted' FROM target_posts;
         INSERT INTO drafts (campaign_id,candidate_post_id,angle,status)
           SELECT campaign_id,id,'A','drafting' FROM candidate_posts;",
    )
    .await;
    let all = list_drafts(&f.pool, DraftListInput::default())
        .await
        .unwrap();
    assert_eq!(all.drafts.len() as i64, DRAFT_LIST_LIMIT);
    assert_eq!(all.total_count, 510);
    let scoped = list_drafts(
        &f.pool,
        DraftListInput {
            campaign_id: Some(1),
            candidate_post_id: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(scoped.drafts.len() as i64, DRAFT_LIST_LIMIT);
    assert_eq!(scoped.total_count, 505);
    let json = serde_json::to_value(&scoped).unwrap();
    assert_eq!(json["totalCount"], 505);
}

#[tokio::test]
async fn draft_list_filters_to_one_idea_past_the_cap() {
    let f = migrated().await;
    // 510 ideas in campaign 1, each with its one draft (drafts are unique
    // per idea). Idea 1's draft is the oldest, so the 500-row campaign page
    // leaves it out.
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Other','active',5);
         WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 510)
         INSERT INTO target_posts (id,url,normalized_url,content,content_hash) SELECT i,'u'||i,'n'||i,'c','h'||i FROM n;
         INSERT INTO candidate_posts (id,campaign_id,target_post_id,status)
           SELECT id,1,id,'drafted' FROM target_posts;
         INSERT INTO drafts (campaign_id,candidate_post_id,angle,status,updated_at)
           SELECT 1,id,'A'||id,'drafting',datetime('2026-01-01', '+' || id || ' minutes') FROM candidate_posts;
         INSERT INTO draft_variants (draft_id,variant_number,hook,body,status)
           SELECT id,1,'H','B','draft' FROM drafts WHERE candidate_post_id = 1;",
    )
    .await;
    let campaign = list_drafts(
        &f.pool,
        DraftListInput {
            campaign_id: Some(1),
            candidate_post_id: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(campaign.total_count, 510);
    assert!(!campaign
        .drafts
        .iter()
        .any(|draft| draft["candidate_post_id"] == 1));

    let idea = list_drafts(
        &f.pool,
        DraftListInput {
            campaign_id: Some(1),
            candidate_post_id: Some(1),
        },
    )
    .await
    .unwrap();
    // `totalCount` counts the idea filter, not the whole campaign.
    assert_eq!(idea.total_count, 1);
    assert_eq!(idea.drafts.len(), 1);
    assert_eq!(idea.drafts[0]["candidate_post_id"], 1);
    assert_eq!(idea.drafts[0]["angle"], "A1");
    // Its related rows come along with it.
    assert_eq!(idea.variants.len(), 1);
    assert_eq!(idea.variants[0]["draft_id"], idea.drafts[0]["id"]);

    let missing = list_drafts(
        &f.pool,
        DraftListInput {
            campaign_id: Some(1),
            candidate_post_id: Some(9999),
        },
    )
    .await
    .unwrap();
    assert!(missing.drafts.is_empty());
    assert_eq!(missing.total_count, 0);

    // The idea filter combines with the campaign filter.
    let wrong_campaign = list_drafts(
        &f.pool,
        DraftListInput {
            campaign_id: Some(2),
            candidate_post_id: Some(1),
        },
    )
    .await
    .unwrap();
    assert!(wrong_campaign.drafts.is_empty());
    assert_eq!(wrong_campaign.total_count, 0);
}

#[tokio::test]
async fn generation_requests_and_workflow_options_are_filtered() {
    let f = fixture().await;
    seed(
        &f.pool,
        "INSERT INTO draft_generation_requests (campaign_id,candidate_post_id,provider_key,variant_count,status,updated_at) VALUES
           (1,1,'dry_run',3,'saved','2026-09-03 00:00:00'),(1,2,'dry_run',3,'generated','2026-09-01 00:00:00'),(2,3,'dry_run',3,'pending','2026-09-01 00:00:00');",
    )
    .await;
    let rows = list_generation_requests(
        &f.pool,
        DraftGenerationRequestListInput {
            campaign_id: Some(1),
        },
    )
    .await
    .unwrap();
    let statuses: Vec<&str> = rows
        .iter()
        .map(|row| row["status"].as_str().unwrap())
        .collect();
    assert_eq!(statuses, vec!["generated", "saved"]);
    assert_eq!(rows[0]["campaign_name"], "Live");
    assert!(
        list_workflow_options(&f.pool, DraftWorkflowOptionsInput { campaign_id: 1 })
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn update_sets_only_provided_fields() {
    let f = fixture().await;
    update_draft(
        &f.pool,
        UpdateDraftInput {
            angle: Some("  New  ".to_string()),
            ..update(1)
        },
    )
    .await
    .unwrap();
    update_draft(
        &f.pool,
        UpdateDraftInput {
            status: Some("needs_revision".to_string()),
            ..update(1)
        },
    )
    .await
    .unwrap();
    assert_eq!(
        text(
            &f.pool,
            "SELECT angle||'|'||notes||'|'||status FROM drafts WHERE id=1"
        )
        .await,
        "New||needs_revision"
    );
    // No fields and a missing id are silent no-ops.
    update_draft(&f.pool, update(1)).await.unwrap();
    update_draft(
        &f.pool,
        UpdateDraftInput {
            notes: Some("x".to_string()),
            ..update(99)
        },
    )
    .await
    .unwrap();
}

#[tokio::test]
async fn invalid_update_writes_nothing() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    for bad in [
        UpdateDraftInput {
            status: Some("published".to_string()),
            ..update(1)
        },
        UpdateDraftInput {
            angle: Some("x".repeat(241)),
            ..update(1)
        },
        UpdateDraftInput {
            notes: Some("x".repeat(1001)),
            ..update(1)
        },
        UpdateDraftInput {
            angle: Some("x".to_string()),
            ..update(0)
        },
    ] {
        assert!(update_draft(&f.pool, bad).await.is_err());
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn storage_failure_rolls_back_and_hides_errors() {
    let f = fixture().await;
    fail_on(&f.pool, "BEFORE UPDATE ON drafts").await;
    let before = snapshot(&f.pool, TABLES).await;
    let error = update_draft(
        &f.pool,
        UpdateDraftInput {
            angle: Some("x".to_string()),
            ..update(1)
        },
    )
    .await
    .unwrap_err();
    assert_eq!(error, STORAGE_ERROR);
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn concurrent_updates_both_apply_and_reads_stay_whole() {
    let f = fixture().await;
    let (a, b, read) = tokio::join!(
        update_draft(
            &f.pool,
            UpdateDraftInput {
                angle: Some("Angle".to_string()),
                ..update(1)
            }
        ),
        update_draft(
            &f.pool,
            UpdateDraftInput {
                notes: Some("Notes".to_string()),
                ..update(1)
            }
        ),
        list_drafts(&f.pool, DraftListInput::default()),
    );
    a.unwrap();
    b.unwrap();
    assert_eq!(
        text(&f.pool, "SELECT angle||'|'||notes FROM drafts WHERE id=1").await,
        "Angle|Notes"
    );
    assert_eq!(read.unwrap().drafts.len(), 3);
}
