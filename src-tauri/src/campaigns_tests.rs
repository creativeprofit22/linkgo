use super::*;
use crate::test_support::{count, fail_on, migrated, number, seed, snapshot, text, Fixture};

const TABLES: &[&str] = &["campaigns", "campaign_keywords"];

async fn fixture() -> Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit,updated_at) VALUES
           (1,'Live','active',5,'2026-01-02 00:00:00'),
           (2,'Old','archived',5,'2026-01-09 00:00:00'),
           (3,'Newer','draft',5,'2026-01-05 00:00:00');
         INSERT INTO campaign_keywords (campaign_id,keyword,source) VALUES
           (1,'zeta','manual'),(1,'alpha','generated'),(3,'solo','learned');",
    )
    .await;
    f
}

fn create_input(name: &str, keywords: &[&str]) -> CreateCampaignInput {
    CreateCampaignInput {
        name: name.to_string(),
        product: String::new(),
        audience: String::new(),
        voice: String::new(),
        tone: String::new(),
        auto_pilot: false,
        daily_post_limit: 1,
        daily_comment_limit: 5,
        keywords: keywords.iter().map(|k| k.to_string()).collect(),
    }
}

async fn campaign_by_id(pool: &SqlitePool, id: i64) -> CampaignWithKeywords {
    list_campaigns(pool, ListCampaignsInput::default())
        .await
        .unwrap()
        .into_iter()
        .find(|campaign| campaign.id == id)
        .unwrap()
}

fn keywords_of(campaign: &CampaignWithKeywords) -> Vec<(String, String)> {
    campaign
        .keywords
        .iter()
        .map(|k| (k.keyword.clone(), k.source.clone()))
        .collect()
}

#[test]
fn rejects_unknown_fields() {
    for value in [
        serde_json::json!({ "name": "A", "extra": 1 }),
        serde_json::json!({ "name": "A", "status": "active" }),
    ] {
        assert!(serde_json::from_value::<CreateCampaignInput>(value).is_err());
    }
    assert!(serde_json::from_value::<UpdateCampaignInput>(
        serde_json::json!({ "id": 1, "extra": 1 })
    )
    .is_err());
    assert!(serde_json::from_value::<SetCampaignStatusInput>(
        serde_json::json!({ "id": 1, "status": "active", "x": 1 })
    )
    .is_err());
    assert!(serde_json::from_value::<ListCampaignsInput>(
        serde_json::json!({ "limit": 1, "x": 1 })
    )
    .is_err());
}

#[test]
fn create_defaults_match_renderer_schema() {
    let input: CreateCampaignInput =
        serde_json::from_value(serde_json::json!({ "name": "Only name" })).unwrap();
    let valid = validate_create(&input).unwrap();
    assert_eq!(valid.daily_post_limit, 1);
    assert_eq!(valid.daily_comment_limit, 5);
    assert_eq!(valid.auto_pilot, 0);
    assert!(valid.keywords.is_empty());
}

#[tokio::test]
async fn create_trims_dedupes_keywords_and_returns_id() {
    let f = fixture().await;
    let mut input = create_input("  Launch  ", &[" AI ", "ai", "Growth", "growth "]);
    input.tone = " Warm ".to_string();
    input.auto_pilot = true;
    let id = create_campaign(&f.pool, input).await.unwrap();
    assert_eq!(id, 4);
    assert_eq!(
        text(
            &f.pool,
            "SELECT name||'|'||tone||'|'||auto_pilot||'|'||status FROM campaigns WHERE id=4"
        )
        .await,
        "Launch|Warm|1|draft"
    );
    let campaign = campaign_by_id(&f.pool, id).await;
    assert_eq!(
        keywords_of(&campaign),
        vec![
            ("AI".to_string(), "manual".to_string()),
            ("Growth".to_string(), "manual".to_string())
        ]
    );
}

#[tokio::test]
async fn create_validates_like_schema_without_writing() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    let long_name = "n".repeat(121);
    let too_many: Vec<String> = (0..31).map(|i| format!("k{i}")).collect();
    let too_many_refs: Vec<&str> = too_many.iter().map(String::as_str).collect();
    let cases = vec![
        create_input("   ", &[]),
        create_input(&long_name, &[]),
        create_input("A", &["  "]),
        create_input("A", &[&"k".repeat(81)]),
        create_input("A", &too_many_refs),
        CreateCampaignInput {
            daily_post_limit: 11,
            ..create_input("A", &[])
        },
        CreateCampaignInput {
            daily_comment_limit: -1,
            ..create_input("A", &[])
        },
        CreateCampaignInput {
            tone: "t".repeat(241),
            ..create_input("A", &[])
        },
    ];
    for input in cases {
        assert!(create_campaign(&f.pool, input).await.is_err());
    }
    // 120 UTF-16 units (emoji = 2 units each) is accepted; 121 is not.
    assert!(validate_create(&create_input(&"😀".repeat(60), &[])).is_ok());
    assert!(validate_create(&create_input(&format!("{}a", "😀".repeat(60)), &[])).is_err());
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn create_duplicate_name_is_a_domain_error() {
    let f = fixture().await;
    assert_eq!(
        create_campaign(&f.pool, create_input("Live", &[]))
            .await
            .unwrap_err(),
        DUPLICATE_NAME_ERROR
    );
}

#[tokio::test]
async fn update_duplicate_name_is_a_domain_error_and_rolls_back() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        update_campaign(
            &f.pool,
            UpdateCampaignInput {
                id: 3,
                name: Some(" Live ".to_string()),
                status: Some("paused".to_string()),
                daily_post_limit: Some(2),
                keywords: Some(vec!["replaced".to_string()]),
                ..Default::default()
            },
        )
        .await
        .unwrap_err(),
        DUPLICATE_NAME_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
    let campaign = campaign_by_id(&f.pool, 3).await;
    assert_eq!(campaign.name, "Newer");
    assert_eq!(campaign.status, "draft");
    assert_eq!(campaign.daily_post_limit, 5);
    assert_eq!(
        keywords_of(&campaign),
        vec![("solo".to_string(), "learned".to_string())]
    );
}

#[tokio::test]
async fn create_keyword_failure_rolls_back_campaign() {
    let f = fixture().await;
    fail_on(
        &f.pool,
        "BEFORE INSERT ON campaign_keywords WHEN NEW.keyword = 'boom'",
    )
    .await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        create_campaign(&f.pool, create_input("Fresh", &["fine", "boom"]))
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn update_changes_given_columns_and_replaces_keywords() {
    let f = fixture().await;
    seed(
        &f.pool,
        "UPDATE campaigns SET updated_at='2000-01-01 00:00:00' WHERE id=1;",
    )
    .await;
    update_campaign(
        &f.pool,
        UpdateCampaignInput {
            id: 1,
            name: Some(" Renamed ".to_string()),
            status: Some("paused".to_string()),
            daily_comment_limit: Some(50),
            keywords: Some(vec![
                "New".to_string(),
                "new".to_string(),
                " b ".to_string(),
            ]),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    let campaign = campaign_by_id(&f.pool, 1).await;
    assert_eq!(campaign.name, "Renamed");
    assert_eq!(campaign.status, "paused");
    assert_eq!(campaign.daily_comment_limit, 50);
    assert_eq!(campaign.daily_post_limit, 5);
    assert_ne!(campaign.updated_at, "2000-01-01 00:00:00");
    // Replaces the whole set, including non-manual keywords, like before.
    assert_eq!(
        keywords_of(&campaign),
        vec![
            ("New".to_string(), "manual".to_string()),
            ("b".to_string(), "manual".to_string())
        ]
    );
    assert_eq!(count(&f.pool, "campaign_keywords").await, 3);
}

#[tokio::test]
async fn update_keywords_only_leaves_updated_at() {
    let f = fixture().await;
    seed(
        &f.pool,
        "UPDATE campaigns SET updated_at='2000-01-01 00:00:00' WHERE id=1;",
    )
    .await;
    update_campaign(
        &f.pool,
        UpdateCampaignInput {
            id: 1,
            keywords: Some(vec![]),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(
        text(&f.pool, "SELECT updated_at FROM campaigns WHERE id=1").await,
        "2000-01-01 00:00:00"
    );
    assert_eq!(
        number(
            &f.pool,
            "SELECT COUNT(*) FROM campaign_keywords WHERE campaign_id=1"
        )
        .await,
        0
    );
}

#[tokio::test]
async fn update_missing_campaign_is_a_silent_noop_and_invalid_input_errors() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    update_campaign(
        &f.pool,
        UpdateCampaignInput {
            id: 99,
            name: Some("Ghost".to_string()),
            keywords: Some(vec!["k".to_string()]),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    for input in [
        UpdateCampaignInput {
            id: 0,
            ..Default::default()
        },
        UpdateCampaignInput {
            id: 1,
            status: Some("deleted".to_string()),
            ..Default::default()
        },
        UpdateCampaignInput {
            id: 1,
            name: Some(" ".to_string()),
            ..Default::default()
        },
        UpdateCampaignInput {
            id: 1,
            daily_post_limit: Some(11),
            ..Default::default()
        },
    ] {
        assert!(update_campaign(&f.pool, input).await.is_err());
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn update_keyword_failure_rolls_back_column_changes() {
    let f = fixture().await;
    fail_on(
        &f.pool,
        "BEFORE INSERT ON campaign_keywords WHEN NEW.keyword = 'boom'",
    )
    .await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        update_campaign(
            &f.pool,
            UpdateCampaignInput {
                id: 1,
                name: Some("Half".to_string()),
                keywords: Some(vec!["ok".to_string(), "boom".to_string()]),
                ..Default::default()
            },
        )
        .await
        .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn status_set_updates_and_missing_is_noop() {
    let f = fixture().await;
    set_campaign_status(
        &f.pool,
        SetCampaignStatusInput {
            id: 1,
            status: "archived".to_string(),
        },
    )
    .await
    .unwrap();
    assert_eq!(
        text(&f.pool, "SELECT status FROM campaigns WHERE id=1").await,
        "archived"
    );
    let before = snapshot(&f.pool, TABLES).await;
    set_campaign_status(
        &f.pool,
        SetCampaignStatusInput {
            id: 99,
            status: "active".to_string(),
        },
    )
    .await
    .unwrap();
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
    assert!(set_campaign_status(
        &f.pool,
        SetCampaignStatusInput {
            id: 1,
            status: "gone".to_string(),
        },
    )
    .await
    .is_err());
}

#[tokio::test]
async fn status_set_failure_rolls_back() {
    let f = fixture().await;
    fail_on(&f.pool, "BEFORE UPDATE ON campaigns").await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        set_campaign_status(
            &f.pool,
            SetCampaignStatusInput {
                id: 1,
                status: "paused".to_string(),
            },
        )
        .await
        .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn list_orders_archived_last_and_attaches_sorted_keywords() {
    let f = fixture().await;
    let list = list_campaigns(&f.pool, ListCampaignsInput::default())
        .await
        .unwrap();
    assert_eq!(list.iter().map(|c| c.id).collect::<Vec<_>>(), vec![3, 1, 2]);
    assert_eq!(
        keywords_of(&list[1]),
        vec![
            ("alpha".to_string(), "generated".to_string()),
            ("zeta".to_string(), "manual".to_string())
        ]
    );
    assert!(list[2].keywords.is_empty());
    assert!(list
        .iter()
        .all(|c| c.keywords.iter().all(|k| k.campaign_id == c.id)));
}

#[tokio::test]
async fn list_limit_is_bounded() {
    let f = fixture().await;
    let limited = list_campaigns(&f.pool, ListCampaignsInput { limit: Some(1) })
        .await
        .unwrap();
    assert_eq!(limited.len(), 1);
    assert_eq!(limited[0].id, 3);
    assert!(
        list_campaigns(&f.pool, ListCampaignsInput { limit: Some(0) })
            .await
            .is_err()
    );
    seed(
        &f.pool,
        "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 510)
         INSERT INTO campaigns (name) SELECT 'bulk'||i FROM n;",
    )
    .await;
    assert_eq!(
        list_campaigns(
            &f.pool,
            ListCampaignsInput {
                limit: Some(10_000)
            }
        )
        .await
        .unwrap()
        .len(),
        MAX_LIST_LIMIT as usize
    );
    assert_eq!(
        list_campaigns(&f.pool, ListCampaignsInput::default())
            .await
            .unwrap()
            .len(),
        DEFAULT_LIST_LIMIT as usize
    );
}

#[tokio::test]
async fn list_empty() {
    let f = migrated().await;
    assert!(list_campaigns(&f.pool, ListCampaignsInput::default())
        .await
        .unwrap()
        .is_empty());
}

fn keyword_update(id: i64, keywords: &[&str]) -> UpdateCampaignInput {
    UpdateCampaignInput {
        id,
        name: None,
        product: None,
        audience: None,
        voice: None,
        tone: None,
        auto_pilot: None,
        status: None,
        daily_post_limit: None,
        daily_comment_limit: None,
        keywords: Some(keywords.iter().map(|k| (*k).to_string()).collect()),
    }
}

#[tokio::test]
async fn concurrent_keyword_replacements_leave_one_whole_set() {
    let f = fixture().await;
    let (a, b) = tokio::join!(
        update_campaign(&f.pool, keyword_update(1, &["alpha", "beta"])),
        update_campaign(&f.pool, keyword_update(1, &["gamma", "delta", "omega"])),
    );
    a.unwrap();
    b.unwrap();
    let keywords = text(
        &f.pool,
        "SELECT group_concat(keyword, ',') FROM (SELECT keyword FROM campaign_keywords WHERE campaign_id=1 ORDER BY keyword)",
    )
    .await;
    // Serialized replacements: exactly one complete set survives, never a mix.
    assert!(
        keywords == "alpha,beta" || keywords == "delta,gamma,omega",
        "mixed keyword set: {keywords}"
    );
}

#[tokio::test]
async fn concurrent_creates_with_the_same_name_create_one_campaign() {
    let f = fixture().await;
    let before = count(&f.pool, "campaigns").await;
    let (a, b) = tokio::join!(
        create_campaign(&f.pool, create_input("Race", &["one"])),
        create_campaign(&f.pool, create_input("Race", &["two"])),
    );
    assert_eq!(u8::from(a.is_ok()) + u8::from(b.is_ok()), 1, "{a:?} {b:?}");
    assert_eq!(count(&f.pool, "campaigns").await, before + 1);
    assert_eq!(
        number(
            &f.pool,
            "SELECT COUNT(*) FROM campaign_keywords WHERE campaign_id=(SELECT id FROM campaigns WHERE name='Race')"
        )
        .await,
        1
    );
}
