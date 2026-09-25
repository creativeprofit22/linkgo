use super::*;
use crate::comment_threads::{create_thread, CreateCommentThreadInput, VariantBodyInput};
use crate::test_support::{migrated, seed, Fixture};

const GOOD: &str = "We cut onboarding time by 30% after trying exactly this approach.";

/// Campaign 1 active, 2 archived. Candidates: 1 shortlisted, 2 new,
/// 3 shortlisted in archived campaign, 4 shortlisted with thread 10,
/// 5 drafted. Thread 10 has two variants, one audit and two attempts.
async fn fixture() -> Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit,daily_comment_limit) VALUES (1,'Live','active',5,5),(2,'Old','archived',5,5);
         INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES
           (1,'https://e.com/1','u1','a','h1'),(2,'https://e.com/2','u2','b','h2'),(3,'https://e.com/3','u3','c','h3'),
           (4,'https://e.com/4','u4','d','h4'),(5,'https://e.com/5','u5','e','h5');
         INSERT INTO candidate_posts (id,campaign_id,target_post_id,status,updated_at) VALUES
           (1,1,1,'shortlisted','2026-09-01 00:00:00'),(2,1,2,'new','2026-09-01 00:00:00'),(3,2,3,'shortlisted','2026-09-01 00:00:00'),
           (4,1,4,'shortlisted','2026-09-01 00:00:00'),(5,1,5,'drafted','2026-09-02 00:00:00');
         INSERT INTO comment_threads (id,campaign_id,candidate_post_id,status) VALUES (10,1,4,'approved');
         INSERT INTO comment_variants (id,comment_thread_id,variant_number,body,status) VALUES
           (101,10,2,'Other','draft'),(100,10,1,'Good','selected');
         INSERT INTO comment_audits (comment_variant_id,rule_key,severity,message) VALUES (100,'length','warning','short');
         INSERT INTO comment_attempts (comment_thread_id,status,error_message,created_at) VALUES
           (10,'failed','boom','2026-09-01 00:00:00'),(10,'failed','again','2026-09-02 00:00:00');",
    )
    .await;
    f
}

fn all() -> CommentListInput {
    CommentListInput::default()
}

fn campaign(id: i64) -> CommentListInput {
    CommentListInput {
        campaign_id: Some(id),
    }
}

#[test]
fn input_rejects_unknown_fields() {
    assert!(serde_json::from_value::<CommentListInput>(
        serde_json::json!({ "campaignId": 1, "extra": 1 })
    )
    .is_err());
}

#[tokio::test]
async fn invalid_campaign_is_rejected() {
    let f = migrated().await;
    assert!(list_threads(&f.pool, campaign(0)).await.is_err());
    assert!(list_eligible_candidates(&f.pool, campaign(-2))
        .await
        .is_err());
}

#[tokio::test]
async fn threads_include_ordered_related_rows() {
    let f = fixture().await;
    let snapshot = list_threads(&f.pool, all()).await.unwrap();
    assert_eq!(snapshot.threads.len(), 1);
    assert_eq!(snapshot.total_count, 1);
    assert_eq!(snapshot.threads[0]["campaign_name"], "Live");
    assert_eq!(snapshot.threads[0]["target_url"], "https://e.com/4");
    // Variants by number, attempts newest first.
    let numbers: Vec<i64> = snapshot
        .variants
        .iter()
        .map(|row| row["variant_number"].as_i64().unwrap())
        .collect();
    assert_eq!(numbers, vec![1, 2]);
    assert_eq!(snapshot.audits.len(), 1);
    assert_eq!(snapshot.attempts[0]["error_message"], "again");
    assert_eq!(snapshot.attempts[0]["idempotency_key"], "");

    let other = list_threads(&f.pool, campaign(2)).await.unwrap();
    assert!(other.threads.is_empty() && other.variants.is_empty() && other.attempts.is_empty());
    assert_eq!(other.total_count, 0);
}

#[tokio::test]
async fn thread_list_is_capped_and_reports_the_uncapped_total() {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit,daily_comment_limit) VALUES (1,'Live','active',5,5),(2,'Other','active',5,5);
         WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 510)
         INSERT INTO target_posts (id,url,normalized_url,content,content_hash) SELECT i,'u'||i,'n'||i,'c','h'||i FROM n;
         INSERT INTO candidate_posts (id,campaign_id,target_post_id,status)
           SELECT id,CASE WHEN id <= 505 THEN 1 ELSE 2 END,id,'shortlisted' FROM target_posts;
         INSERT INTO comment_threads (campaign_id,candidate_post_id,status)
           SELECT campaign_id,id,'drafting' FROM candidate_posts;",
    )
    .await;
    let snapshot = list_threads(&f.pool, all()).await.unwrap();
    assert_eq!(snapshot.threads.len() as i64, THREAD_LIST_LIMIT);
    assert_eq!(snapshot.total_count, 510);
    let scoped = list_threads(&f.pool, campaign(1)).await.unwrap();
    assert_eq!(scoped.threads.len() as i64, THREAD_LIST_LIMIT);
    assert_eq!(scoped.total_count, 505);
    let small = list_threads(&f.pool, campaign(2)).await.unwrap();
    assert_eq!((small.threads.len(), small.total_count), (5, 5));
    let json = serde_json::to_value(&small).unwrap();
    assert_eq!(json["totalCount"], 5);
}

#[tokio::test]
async fn eligible_candidates_skip_threaded_archived_and_new() {
    let f = fixture().await;
    let rows = list_eligible_candidates(&f.pool, all()).await.unwrap();
    let ids: Vec<i64> = rows
        .iter()
        .map(|row| row["candidate_id"].as_i64().unwrap())
        .collect();
    assert_eq!(ids, vec![5, 1]);
    assert!(list_eligible_candidates(&f.pool, campaign(2))
        .await
        .unwrap()
        .is_empty());
}

#[tokio::test]
async fn lists_are_capped() {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5);
         WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 210)
         INSERT INTO target_posts (id,url,normalized_url,content,content_hash) SELECT i,'u'||i,'n'||i,'c','h'||i FROM n;
         INSERT INTO candidate_posts (campaign_id,target_post_id,status) SELECT 1,id,'shortlisted' FROM target_posts;",
    )
    .await;
    let rows = list_eligible_candidates(&f.pool, all()).await.unwrap();
    assert_eq!(rows.len() as i64, ELIGIBLE_LIMIT);
}

#[tokio::test]
async fn thread_read_during_create_sees_whole_threads() {
    let f = fixture().await;
    let input = CreateCommentThreadInput {
        candidate_id: 1,
        operator_notes: String::new(),
        variants: vec![
            VariantBodyInput {
                body: GOOD.to_string(),
            },
            VariantBodyInput {
                body: format!("{GOOD} Second."),
            },
        ],
    };
    let (created, snapshot) =
        tokio::join!(create_thread(&f.pool, input), list_threads(&f.pool, all()));
    created.unwrap();
    let snapshot = snapshot.unwrap();
    // Either the old snapshot (1 thread, 2 variants) or the new one with
    // every variant of the new thread (2 threads, 4 variants).
    let shape = (snapshot.threads.len(), snapshot.variants.len());
    assert!(shape == (1, 2) || shape == (2, 4), "torn read: {shape:?}");
}
