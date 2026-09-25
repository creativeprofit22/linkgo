use super::*;
use crate::test_support::{count, fail_on, migrated, number, seed, snapshot, text, Fixture};

const TABLES: &[&str] = &["candidate_posts", "candidate_discovery_items"];

async fn fixture() -> Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Old','archived',5),(3,'Other','active',5);
         INSERT INTO target_posts (id,platform,url,normalized_url,content,content_hash) VALUES
           (1,'linkedin','u1','n1','c1','h1'),(2,'linkedin','u2','n2','c2','h2'),(3,'linkedin','u3','n3','c3','h3');
         INSERT INTO candidate_posts (id,campaign_id,target_post_id,status,relevance_score,notes,created_at,updated_at) VALUES
           (1,1,1,'new',NULL,'keep','2026-09-01 00:00:00','2026-09-01 00:00:00'),
           (2,1,2,'rejected',10,'','2026-09-02 00:00:00','2026-09-03 00:00:00'),
           (3,3,3,'new',NULL,'','2026-09-01 00:00:00','2026-09-02 00:00:00');
         INSERT INTO campaign_keywords (campaign_id,keyword) VALUES (1,'zeta'),(1,'alpha');
         INSERT INTO candidate_discovery_items (id,campaign_id,kind,title,keyword,confidence_score,status) VALUES
           (1,1,'keyword','','ai ops',40,'suggested'),(2,1,'trend','Hot','',90,'suggested'),
           (3,1,'keyword','','gone',99,'dismissed'),(4,3,'keyword','','other',50,'suggested');
         INSERT INTO agent_runs (id,campaign_id,agent_role,provider_key,status) VALUES
           (1,1,'researcher','dry_run','running'),(2,3,'researcher','dry_run','running');",
    )
    .await;
    f
}

fn update(id: i64) -> UpdateCandidateInput {
    UpdateCandidateInput {
        id,
        status: None,
        relevance_score: None,
        score_reason: None,
        notes: None,
    }
}

fn suggestion(kind: &str, title: &str, keyword: &str) -> DiscoverySuggestionInput {
    DiscoverySuggestionInput {
        kind: kind.to_string(),
        title: title.to_string(),
        keyword: keyword.to_string(),
        rationale: String::new(),
        source_keyword: String::new(),
        confidence_score: Some(60),
    }
}

fn insert_input(
    agent_run_id: i64,
    suggestions: Vec<DiscoverySuggestionInput>,
) -> InsertDiscoveryItemsInput {
    InsertDiscoveryItemsInput {
        campaign_id: 1,
        agent_run_id,
        workflow_run_id: None,
        suggestions,
    }
}

#[test]
fn inputs_reject_unknown_fields_and_keep_explicit_null_score() {
    assert!(serde_json::from_value::<UpdateCandidateInput>(
        serde_json::json!({ "id": 1, "extra": true })
    )
    .is_err());
    let cleared: UpdateCandidateInput =
        serde_json::from_value(serde_json::json!({ "id": 1, "relevanceScore": null })).unwrap();
    assert_eq!(cleared.relevance_score, Some(None));
    let absent: UpdateCandidateInput =
        serde_json::from_value(serde_json::json!({ "id": 1 })).unwrap();
    assert_eq!(absent.relevance_score, None);
    assert!(
        serde_json::from_value::<InsertDiscoveryItemsInput>(serde_json::json!({
            "campaignId": 1, "agentRunId": 1, "suggestions": [], "extra": 1
        }))
        .is_err()
    );
}

#[tokio::test]
async fn lists_are_ordered_filtered_and_skip_dismissed() {
    let f = fixture().await;
    let all = list_candidates(&f.pool, ListCandidatesInput::default())
        .await
        .unwrap();
    assert_eq!(
        all.rows.iter().map(|row| row.id).collect::<Vec<_>>(),
        vec![3, 1, 2]
    );
    assert_eq!(all.total_count, 3);
    let live = list_candidates(
        &f.pool,
        ListCandidatesInput {
            campaign_id: Some(1),
        },
    )
    .await
    .unwrap();
    assert_eq!(
        live.rows.iter().map(|row| row.id).collect::<Vec<_>>(),
        vec![1, 2]
    );
    assert_eq!(live.total_count, 2);
    assert_eq!(live.rows[0].campaign_name, "Live");
    assert_eq!(live.rows[0].target_url, "u1");

    let items = list_discovery_items(&f.pool, CampaignScopedInput { campaign_id: 1 })
        .await
        .unwrap();
    assert_eq!(
        items.iter().map(|row| row.id).collect::<Vec<_>>(),
        vec![2, 1]
    );
    assert!(
        list_discovery_items(&f.pool, CampaignScopedInput { campaign_id: 0 })
            .await
            .is_err()
    );
}

#[tokio::test]
async fn candidate_list_is_capped_and_reports_the_uncapped_total() {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Other','active',5);
         WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 510)
         INSERT INTO target_posts (id,platform,url,normalized_url,content,content_hash)
           SELECT i,'linkedin','u'||i,'n'||i,'c','h'||i FROM n;
         INSERT INTO candidate_posts (campaign_id,target_post_id,status)
           SELECT CASE WHEN id <= 505 THEN 1 ELSE 2 END,id,'new' FROM target_posts;",
    )
    .await;
    let all = list_candidates(&f.pool, ListCandidatesInput::default())
        .await
        .unwrap();
    assert_eq!(all.rows.len() as i64, CANDIDATE_LIST_LIMIT);
    assert_eq!(all.total_count, 510);
    let scoped = list_candidates(
        &f.pool,
        ListCandidatesInput {
            campaign_id: Some(1),
        },
    )
    .await
    .unwrap();
    assert_eq!(scoped.rows.len() as i64, CANDIDATE_LIST_LIMIT);
    assert_eq!(scoped.total_count, 505);
    let small = list_candidates(
        &f.pool,
        ListCandidatesInput {
            campaign_id: Some(2),
        },
    )
    .await
    .unwrap();
    assert_eq!((small.rows.len(), small.total_count), (5, 5));
}

#[tokio::test]
async fn agent_run_context_checks_campaign_and_bounds_lists() {
    let f = fixture().await;
    let context = agent_run_context(&f.pool, CampaignScopedInput { campaign_id: 1 })
        .await
        .unwrap();
    assert_eq!(context.seed_keywords, vec!["alpha", "zeta"]);
    assert_eq!(context.scoring_candidate_ids, vec![1]);
    assert_eq!(
        agent_run_context(&f.pool, CampaignScopedInput { campaign_id: 2 })
            .await
            .unwrap_err(),
        "Campaign is archived"
    );
    assert_eq!(
        agent_run_context(&f.pool, CampaignScopedInput { campaign_id: 99 })
            .await
            .unwrap_err(),
        "Campaign was not found"
    );
}

#[tokio::test]
async fn update_sets_only_provided_fields_and_can_clear_score() {
    let f = fixture().await;
    update_candidate(
        &f.pool,
        UpdateCandidateInput {
            status: Some("shortlisted".to_string()),
            score_reason: Some("  good  ".to_string()),
            ..update(2)
        },
    )
    .await
    .unwrap();
    assert_eq!(
        text(&f.pool, "SELECT status||'|'||relevance_score||'|'||score_reason FROM candidate_posts WHERE id=2").await,
        "shortlisted|10|good"
    );
    update_candidate(
        &f.pool,
        UpdateCandidateInput {
            relevance_score: Some(None),
            ..update(2)
        },
    )
    .await
    .unwrap();
    assert_eq!(
        text(
            &f.pool,
            "SELECT COALESCE(relevance_score,'null')||'|'||notes FROM candidate_posts WHERE id=2"
        )
        .await,
        "null|"
    );
    // Nothing to update and a missing id are both silent no-ops.
    update_candidate(&f.pool, update(1)).await.unwrap();
    update_candidate(
        &f.pool,
        UpdateCandidateInput {
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
        UpdateCandidateInput {
            status: Some("done".to_string()),
            ..update(1)
        },
        UpdateCandidateInput {
            relevance_score: Some(Some(101)),
            ..update(1)
        },
        UpdateCandidateInput {
            notes: Some("x".repeat(1001)),
            ..update(1)
        },
        update(0),
    ] {
        assert!(update_candidate(&f.pool, bad).await.is_err());
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn dismiss_is_campaign_scoped_and_checks_mutability() {
    let f = fixture().await;
    dismiss_discovery_item(
        &f.pool,
        DismissDiscoveryItemInput {
            id: 1,
            campaign_id: 1,
        },
    )
    .await
    .unwrap();
    assert_eq!(
        text(
            &f.pool,
            "SELECT status FROM candidate_discovery_items WHERE id=1"
        )
        .await,
        "dismissed"
    );
    assert_eq!(
        dismiss_discovery_item(
            &f.pool,
            DismissDiscoveryItemInput {
                id: 4,
                campaign_id: 1
            }
        )
        .await
        .unwrap_err(),
        "Discovery suggestion was not found"
    );
    assert_eq!(
        dismiss_discovery_item(
            &f.pool,
            DismissDiscoveryItemInput {
                id: 1,
                campaign_id: 2
            }
        )
        .await
        .unwrap_err(),
        "Campaign is archived"
    );
}

#[tokio::test]
async fn discovery_insert_compacts_dedupes_and_reuses_live_items() {
    let f = fixture().await;
    let saved = insert_discovery_items(
        &f.pool,
        insert_input(
            1,
            vec![
                suggestion("keyword", "", "  ai   ops "),
                suggestion("keyword", "New  idea", "Growth"),
                suggestion("keyword", "new idea", "growth"),
                suggestion("trend", "", ""),
                suggestion("keyword", "", "gone"),
            ],
        ),
    )
    .await
    .unwrap();
    // "ai ops" reuses item 1; the case-duplicate and empty rows are dropped;
    // "gone" is only dismissed, so a new live row is inserted.
    assert_eq!(saved.len(), 3);
    assert_eq!(saved[0].id, 1);
    assert_eq!(
        (saved[1].title.as_str(), saved[1].keyword.as_str()),
        ("New idea", "Growth")
    );
    assert_eq!(saved[1].agent_run_id, Some(1));
    assert_eq!(saved[2].keyword, "gone");
    assert_eq!(count(&f.pool, "candidate_discovery_items").await, 6);
}

#[tokio::test]
async fn discovery_insert_enforces_ownership_and_bounds() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        insert_discovery_items(
            &f.pool,
            insert_input(2, vec![suggestion("keyword", "", "x")])
        )
        .await
        .unwrap_err(),
        "Research request belongs to a different campaign"
    );
    assert_eq!(
        insert_discovery_items(
            &f.pool,
            insert_input(99, vec![suggestion("keyword", "", "x")])
        )
        .await
        .unwrap_err(),
        "Agent run was not found"
    );
    assert!(insert_discovery_items(
        &f.pool,
        insert_input(1, vec![suggestion("keyword", "", "x"); 26])
    )
    .await
    .is_err());
    assert!(
        insert_discovery_items(&f.pool, insert_input(1, vec![suggestion("bogus", "", "x")]))
            .await
            .is_err()
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn storage_failure_rolls_back_every_discovery_row() {
    let f = fixture().await;
    // Fail on the second insert so the first must roll back.
    fail_on(
        &f.pool,
        "BEFORE INSERT ON candidate_discovery_items WHEN NEW.keyword = 'second'",
    )
    .await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        insert_discovery_items(
            &f.pool,
            insert_input(
                1,
                vec![
                    suggestion("keyword", "", "first"),
                    suggestion("keyword", "", "second")
                ]
            )
        )
        .await
        .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn concurrent_discovery_inserts_do_not_duplicate_live_items() {
    let f = fixture().await;
    let (a, b) = tokio::join!(
        insert_discovery_items(
            &f.pool,
            insert_input(1, vec![suggestion("keyword", "", "race")])
        ),
        insert_discovery_items(
            &f.pool,
            insert_input(1, vec![suggestion("keyword", "", "race")])
        ),
    );
    assert_eq!(a.unwrap()[0].id, b.unwrap()[0].id);
    assert_eq!(
        number(
            &f.pool,
            "SELECT COUNT(*) FROM candidate_discovery_items WHERE keyword='race'"
        )
        .await,
        1
    );
}

#[tokio::test]
async fn concurrent_updates_leave_a_consistent_row() {
    let f = fixture().await;
    let (a, b) = tokio::join!(
        update_candidate(
            &f.pool,
            UpdateCandidateInput {
                status: Some("shortlisted".to_string()),
                notes: Some("a".to_string()),
                ..update(1)
            }
        ),
        update_candidate(
            &f.pool,
            UpdateCandidateInput {
                status: Some("rejected".to_string()),
                notes: Some("b".to_string()),
                ..update(1)
            }
        ),
    );
    a.unwrap();
    b.unwrap();
    let state = text(
        &f.pool,
        "SELECT status||':'||notes FROM candidate_posts WHERE id=1",
    )
    .await;
    assert!(
        state == "shortlisted:a" || state == "rejected:b",
        "torn row: {state}"
    );
}
