use super::*;
use crate::test_support::{count, fail_on, migrated, number, seed, snapshot, text, Fixture};

const TABLES: &[&str] = &[
    "candidate_intake_policies",
    "candidate_policy_banned_topics",
];

async fn fixture() -> Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Old','archived',5);
         INSERT INTO candidate_intake_policies (campaign_id,max_post_age_days) VALUES (1,14);
         INSERT INTO candidate_policy_banned_topics (campaign_id,topic,normalized_topic) VALUES (1,'Old Topic','old topic');",
    )
    .await;
    f
}

fn input(campaign_id: i64, age: i64, topics: &[&str]) -> UpdateCandidateIntakePolicyInput {
    UpdateCandidateIntakePolicyInput {
        campaign_id,
        max_post_age_days: age,
        banned_topics: topics.iter().map(|t| t.to_string()).collect(),
    }
}

#[test]
fn rejects_unknown_fields() {
    assert!(
        serde_json::from_value::<UpdateCandidateIntakePolicyInput>(serde_json::json!({
            "campaignId": 1, "maxPostAgeDays": 5, "bannedTopics": [], "extra": 1
        }))
        .is_err()
    );
}

#[tokio::test]
async fn replaces_policy_and_topics_and_returns_saved_policy() {
    let f = fixture().await;
    let policy = update_policy(&f.pool, input(1, 60, &["  AI   Hype ", "Crypto"]))
        .await
        .unwrap();
    assert_eq!(policy.campaign_id, 1);
    assert_eq!(policy.max_post_age_days, 60);
    assert_eq!(policy.banned_topics, vec!["AI Hype", "Crypto"]);
    assert!(policy.created_at.is_some() && policy.updated_at.is_some());
    assert_eq!(
        text(
            &f.pool,
            "SELECT group_concat(topic||'='||normalized_topic, ';') FROM candidate_policy_banned_topics WHERE campaign_id=1 ORDER BY id"
        )
        .await,
        "AI Hype=ai hype;Crypto=crypto"
    );
}

#[tokio::test]
async fn creates_policy_for_campaign_without_one() {
    let f = fixture().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (3,'New','draft',5);",
    )
    .await;
    let policy = update_policy(&f.pool, input(3, 1, &[])).await.unwrap();
    assert_eq!(policy.max_post_age_days, 1);
    assert!(policy.banned_topics.is_empty());
    assert_eq!(count(&f.pool, "candidate_intake_policies").await, 2);
}

#[tokio::test]
async fn rejections_write_nothing() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    let many: Vec<String> = (0..26).map(|i| format!("t{i}")).collect();
    let many: Vec<&str> = many.iter().map(String::as_str).collect();
    let long = "x".repeat(81);
    for (candidate, expected) in [
        (input(99, 30, &[]), "Campaign was not found"),
        (input(2, 30, &[]), "Campaign is archived"),
        (input(0, 30, &[]), "Campaign id must be a positive integer"),
        (input(1, 0, &[]), "Maximum post age must be at least 1 day"),
        (
            input(1, 366, &[]),
            "Maximum post age must be 365 days or fewer",
        ),
        (input(1, 30, &many), "Use no more than 25 banned topics"),
        (input(1, 30, &["  "]), "Remove empty banned-topic lines"),
        (
            input(1, 30, &[long.as_str()]),
            "Banned topics must be 80 characters or fewer",
        ),
        (input(1, 30, &["AI", "ai "]), "Duplicate banned topic: ai"),
    ] {
        assert_eq!(
            update_policy(&f.pool, candidate).await.unwrap_err(),
            expected
        );
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn topic_insert_failure_rolls_back_policy_and_old_topics() {
    let f = fixture().await;
    fail_on(
        &f.pool,
        "BEFORE INSERT ON candidate_policy_banned_topics WHEN NEW.topic = 'boom'",
    )
    .await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        update_policy(&f.pool, input(1, 90, &["fine", "boom"]))
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn concurrent_updates_serialise_to_one_complete_topic_set() {
    let f = fixture().await;
    let (a, b) = tokio::join!(
        update_policy(&f.pool, input(1, 10, &["alpha", "beta"])),
        update_policy(&f.pool, input(1, 20, &["gamma"]))
    );
    a.unwrap();
    b.unwrap();
    let age = number(
        &f.pool,
        "SELECT max_post_age_days FROM candidate_intake_policies WHERE campaign_id=1",
    )
    .await;
    let topics = text(
        &f.pool,
        "SELECT group_concat(topic, ',') FROM (SELECT topic FROM candidate_policy_banned_topics WHERE campaign_id=1 ORDER BY id)",
    )
    .await;
    assert!(
        (age == 10 && topics == "alpha,beta") || (age == 20 && topics == "gamma"),
        "interleaved write: {age} {topics}"
    );
}

fn get(campaign_id: i64) -> GetCandidateIntakePolicyInput {
    GetCandidateIntakePolicyInput { campaign_id }
}

#[tokio::test]
async fn get_returns_saved_policy_or_defaults_and_validates_input() {
    let f = fixture().await;
    let saved = get_policy(&f.pool, get(1)).await.unwrap();
    assert_eq!(saved.max_post_age_days, 14);
    assert_eq!(saved.banned_topics, vec!["Old Topic"]);
    assert!(saved.created_at.is_some());

    let defaults = get_policy(&f.pool, get(99)).await.unwrap();
    assert_eq!(defaults.max_post_age_days, DEFAULT_MAX_POST_AGE_DAYS);
    assert!(defaults.banned_topics.is_empty());
    assert_eq!(defaults.created_at, None);

    assert_eq!(
        get_policy(&f.pool, get(0)).await.unwrap_err(),
        "Campaign id must be a positive integer"
    );
    assert!(serde_json::from_value::<GetCandidateIntakePolicyInput>(
        serde_json::json!({ "campaignId": 1, "extra": 1 })
    )
    .is_err());
}

#[tokio::test]
async fn get_during_concurrent_update_sees_one_complete_policy() {
    let f = fixture().await;
    let (write, read) = tokio::join!(
        update_policy(&f.pool, input(1, 20, &["gamma", "delta"])),
        get_policy(&f.pool, get(1)),
    );
    write.unwrap();
    let read = read.unwrap();
    let seen = (read.max_post_age_days, read.banned_topics.join(","));
    assert!(
        seen == (14, "Old Topic".to_string()) || seen == (20, "gamma,delta".to_string()),
        "torn read: {seen:?}"
    );
}

/// (input, epoch ms or None) recorded from the renderer
/// `parseAbsoluteTimestamp` + `new Date()` on Node 22 (V8).
const TIMESTAMP_CASES: &[(&str, Option<i64>)] = &[
    ("2026-01-01T00:00Z", Some(1_767_225_600_000)),
    (
        "2026-01-01T00:00:00.123456789+05:30",
        Some(1_767_205_800_123),
    ),
    ("2026-01-01T00:00:00.9999Z", Some(1_767_225_600_999)),
    ("2026-01-01T00:00:00+25:00", None),
    ("2026-01-01T00:00:00+23:59", Some(1_767_139_260_000)),
    ("2026-01-01T00:00:00-12:60", None),
    ("2026-01-01T00:00:00+24:00", None),
    ("0000-03-01T00:00:00Z", Some(-62_162_035_200_000)),
    ("2024-02-29T23:59:59.5-01:00", Some(1_709_254_799_500)),
    ("2023-02-29T00:00:00Z", None),
    ("2026-01-01T00:00:00.1Z", Some(1_767_225_600_100)),
    (" 2026-01-01T00:00:00Z ", Some(1_767_225_600_000)),
    ("2026-01-01T00:00:00", None),
    ("2026-13-01T00:00:00Z", None),
    ("2026-01-01T24:00:00Z", None),
    ("2026-01-01 00:00:00Z", None),
    ("+002026-01-01T00:00:00Z", None),
    ("9999-12-31T23:59:59.999Z", Some(253_402_300_799_999)),
    ("2026-01-01T00:00:00+00:99", None),
    ("2026-01-01T00:00:00-00:00", Some(1_767_225_600_000)),
];

#[test]
fn timestamp_parsing_matches_recorded_v8_outputs() {
    for (input, expected) in TIMESTAMP_CASES {
        assert_eq!(parse_absolute_timestamp_ms(input), *expected, "{input:?}");
    }
}

/// (text, topic, containsNormalizedTopic, normalizeBannedTopic) recorded
/// from the renderer helpers on Node 22.
const TOPIC_CASES: &[(&str, &str, bool, &str)] = &[
    ("We love AI hype", "ai hype", true, "ai hype"),
    ("AIhype", "ai hype", false, "ai hype"),
    ("ai\u{a0}\u{3000}hype!", "AI Hype", true, "ai hype"),
    ("\u{fb01}nance tips", "finance", true, "finance"),
    (
        "\u{ff23}\u{ff32}\u{ff39}\u{ff30}\u{ff34}\u{ff2f} news",
        "crypto",
        true,
        "crypto",
    ),
    ("cryptocurrency", "crypto", false, "crypto"),
    ("aaa", "aa", false, "aa"),
    ("x aa", "aa", true, "aa"),
    ("c++ rocks", "C++", true, "c++"),
    ("c++rocks", "c++", false, "c++"),
    (
        "\u{39f}\u{394}\u{39f}\u{3a3}",
        "\u{3bf}\u{3b4}\u{3bf}\u{3c2}",
        true,
        "\u{3bf}\u{3b4}\u{3bf}\u{3c2}",
    ),
    ("a.b", "a.b", true, "a.b"),
    ("axb", "a.b", false, "a.b"),
    ("price: $5 (sale)", "$5 (sale)", true, "$5 (sale)"),
    ("2fa", "fa", false, "fa"),
    ("\u{df}", "ss", false, "ss"),
    ("\u{130}stanbul", "i\u{307}stanbul", true, "i\u{307}stanbul"),
    ("x\u{2028}ai hype", "ai hype", true, "ai hype"),
    ("ai\u{feff}hype", "ai hype", true, "ai hype"),
    ("ai\u{85}hype", "ai hype", false, "ai hype"),
    ("\u{2460} item", "1 item", true, "1 item"),
    ("caf\u{e9}", "cafe\u{301}", true, "caf\u{e9}"),
    ("ai  hype", "ai hype", true, "ai hype"),
    ("see ai-hype", "ai hype", false, "ai hype"),
    ("x", "   ", false, ""),
];

#[test]
fn topic_matching_matches_recorded_renderer_outputs() {
    for (text, topic, contains, normalized) in TOPIC_CASES {
        assert_eq!(
            contains_normalized_topic(text, topic),
            *contains,
            "{text:?} / {topic:?}"
        );
        assert_eq!(
            normalize_banned_topic(topic),
            *normalized,
            "normalize {topic:?}"
        );
    }
}

#[tokio::test]
async fn update_normalizes_topics_with_nfkc_natively() {
    let f = fixture().await;
    let policy = update_policy(&f.pool, input(1, 30, &["\u{ff23}rypto", "\u{fb01}nance"]))
        .await
        .unwrap();
    assert_eq!(policy.banned_topics, vec!["Crypto", "finance"]);
    assert_eq!(
        text(
            &f.pool,
            "SELECT group_concat(normalized_topic, ',') FROM (SELECT normalized_topic FROM candidate_policy_banned_topics WHERE campaign_id=1 ORDER BY id)"
        )
        .await,
        "crypto,finance"
    );
    // Full-width and ASCII forms collapse to the same topic.
    assert_eq!(
        update_policy(&f.pool, input(1, 30, &["crypto", "\u{ff43}rypto"]))
            .await
            .unwrap_err(),
        "Duplicate banned topic: crypto"
    );
}

const NOW_MS: i64 = 1_767_225_600_000; // 2026-01-01T00:00:00Z

fn subject<'a>(
    url: &'a str,
    normalized_url: &'a str,
    posted_at: Option<&'a str>,
) -> PolicySubject<'a> {
    PolicySubject {
        campaign_id: 1,
        url,
        normalized_url,
        author_profile_url: "https://www.linkedin.com/in/Ada/?trk=x",
        platform_resource_urn: "",
        posted_at,
        content: "We discuss AI hype and budgets.",
        source_keyword: "",
    }
}

async fn rules(f: &Fixture, subject: &PolicySubject<'_>) -> Vec<String> {
    let mut connection = f.pool.acquire().await.unwrap();
    evaluate_intake_policy(&mut connection, subject, NOW_MS)
        .await
        .unwrap()
        .into_iter()
        .map(|finding| format!("{}:{}", finding.rule.as_str(), finding.message))
        .collect()
}

#[tokio::test]
async fn evaluator_reports_every_rule_in_renderer_order() {
    let f = fixture().await;
    update_policy(&f.pool, input(1, 7, &["AI hype"]))
        .await
        .unwrap();
    // Contact the same author (profile URL differs only by query/case/slash).
    seed(
        &f.pool,
        "INSERT INTO target_posts (id,url,normalized_url,author_profile_url,content,content_hash) VALUES
           (50,'https://www.linkedin.com/feed/update/urn:li:activity:9/','n9','HTTPS://WWW.LINKEDIN.COM/in/Ada','c','h9');
         INSERT INTO candidate_posts (id,campaign_id,target_post_id,status) VALUES (50,1,50,'shortlisted');
         INSERT INTO comment_threads (id,campaign_id,candidate_post_id,status) VALUES (50,1,50,'posted');
         INSERT INTO comment_attempts (comment_thread_id,status) VALUES (50,'succeeded');",
    )
    .await;
    let found = rules(
        &f,
        &subject("http://evil.com/x", "x", Some("2025-12-01T00:00:00Z")),
    )
    .await;
    assert_eq!(
        found,
        vec![
            "source:Source must be an HTTPS linkedin.com URL or LinkedIn subdomain.",
            "age:Post is older than the 7-day campaign limit.",
            "banned_topic:Post matches banned topic: AI hype.",
            "already_contacted:A successful Linkgo comment already contacted this target or author profile.",
        ]
    );
}

#[tokio::test]
async fn evaluator_accepts_fresh_allowed_post_and_flags_future_or_missing_time() {
    let f = fixture().await;
    let url = "https://www.linkedin.com/feed/update/urn:li:activity:1/";
    assert!(rules(&f, &subject(url, "n", Some("2025-12-31T23:00:00Z")))
        .await
        .is_empty());
    // Within the 5-minute future tolerance.
    assert!(rules(&f, &subject(url, "n", Some("2026-01-01T00:04:59Z")))
        .await
        .is_empty());
    assert_eq!(
        rules(&f, &subject(url, "n", Some("2026-01-01T00:05:01Z"))).await,
        vec!["age:Post timestamp is materially in the future."]
    );
    assert_eq!(
        rules(&f, &subject(url, "n", None)).await,
        vec!["age:Post timestamp must be an absolute ISO-8601 value with a timezone."]
    );
}
