use super::*;
use crate::test_support::{migrated, seed};

#[test]
fn rejects_unknown_fields() {
    assert!(serde_json::from_value::<SourceImportDashboardInput>(
        serde_json::json!({ "campaignId": 1, "extra": 1 })
    )
    .is_err());
}

#[tokio::test]
async fn rejects_invalid_campaign_before_storage() {
    let f = migrated().await;
    assert_eq!(
        source_import_dashboard(&f.pool, SourceImportDashboardInput { campaign_id: 0 })
            .await
            .unwrap_err(),
        "Campaign is required"
    );
}

#[tokio::test]
async fn returns_recent_batches_newest_first_with_ordered_items() {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Other','active',5);
         INSERT INTO source_import_batches (id,campaign_id,source_type,status,total_count,created_at) VALUES
           (1,1,'local_json','completed',2,'2026-09-01 00:00:00'),
           (2,1,'local_json','completed',1,'2026-09-02 00:00:00'),
           (3,2,'local_json','completed',1,'2026-09-03 00:00:00');
         INSERT INTO source_import_items (source_import_batch_id,row_number,status,input_json,policy_rule_key) VALUES
           (1,2,'rejected','{}','banned_topic'),(1,1,'accepted','{}',''),(2,1,'duplicate','{}',''),(3,1,'accepted','{}','');",
    )
    .await;
    let batches = source_import_dashboard(&f.pool, SourceImportDashboardInput { campaign_id: 1 })
        .await
        .unwrap();
    assert_eq!(
        batches.iter().map(|batch| batch.id).collect::<Vec<_>>(),
        vec![2, 1]
    );
    let rows: Vec<_> = batches[1]
        .items
        .iter()
        .map(|item| item.row_number)
        .collect();
    assert_eq!(rows, vec![1, 2]);
    assert_eq!(batches[1].items[1].policy_rule_key, "banned_topic");
}

#[tokio::test]
async fn caps_batches_and_items() {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5);
         WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 12)
         INSERT INTO source_import_batches (id,campaign_id,source_type,status,total_count)
         SELECT i,1,'local_json','completed',0 FROM n;
         WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 60)
         INSERT INTO source_import_items (source_import_batch_id,row_number,status,input_json)
         SELECT 12,i,'accepted','{}' FROM n;",
    )
    .await;
    let batches = source_import_dashboard(&f.pool, SourceImportDashboardInput { campaign_id: 1 })
        .await
        .unwrap();
    assert_eq!(batches.len() as i64, RECENT_BATCH_LIMIT);
    assert_eq!(batches[0].id, 12);
    assert_eq!(batches[0].items.len() as i64, BATCH_ITEM_LIMIT);
}

#[tokio::test]
async fn dashboard_read_during_a_batch_write_sees_whole_batches() {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5);",
    )
    .await;
    let write = async {
        seed(
            &f.pool,
            "BEGIN;
             INSERT INTO source_import_batches (id,campaign_id,source_type,status,total_count) VALUES (1,1,'local_json','completed',3);
             INSERT INTO source_import_items (source_import_batch_id,row_number,status,input_json) VALUES (1,1,'accepted','{}'),(1,2,'accepted','{}'),(1,3,'duplicate','{}');
             COMMIT;",
        )
        .await;
    };
    let (_, read) = tokio::join!(
        write,
        source_import_dashboard(&f.pool, SourceImportDashboardInput { campaign_id: 1 }),
    );
    let batches = read.unwrap();
    // Either no batch yet, or the batch with all of its items.
    assert!(
        batches.is_empty() || (batches.len() == 1 && batches[0].items.len() == 3),
        "torn read: {batches:?}"
    );
}
