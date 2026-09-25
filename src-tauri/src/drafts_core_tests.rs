use super::*;
use crate::test_support::{count, fail_on, migrated, number, seed, snapshot, text, Fixture};

const TABLES: &[&str] = &[
    "drafts",
    "draft_variants",
    "draft_audits",
    "candidate_posts",
];
const STRONG_HOOK: &str = "We cut onboarding time by 30% in one quarter";

/// Campaign 1 active, 2 archived. Candidates: 1 shortlisted, 2 new,
/// 3 rejected, 4 drafted, 5 in the archived campaign.
async fn fixture() -> Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Old','archived',5);
         INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES
           (1,'u1','n1','a','h1'),(2,'u2','n2','b','h2'),(3,'u3','n3','c','h3'),(4,'u4','n4','d','h4'),(5,'u5','n5','e','h5');
         INSERT INTO candidate_posts (id,campaign_id,target_post_id,status) VALUES
           (1,1,1,'shortlisted'),(2,1,2,'new'),(3,1,3,'rejected'),(4,1,4,'drafted'),(5,2,5,'shortlisted');",
    )
    .await;
    f
}

fn variant(hook: &str, body: &str) -> DraftVariantInput {
    DraftVariantInput {
        hook: hook.to_string(),
        body: body.to_string(),
        cta: String::new(),
        hashtags: String::new(),
    }
}

fn create(candidate_id: i64, variants: Vec<DraftVariantInput>) -> CreateDraftInput {
    CreateDraftInput {
        candidate_id,
        angle: " Angle ".to_string(),
        notes: String::new(),
        content_intent: "idea".to_string(),
        variants,
    }
}

async fn audits(f: &Fixture, variant_id: i64) -> String {
    text(
        &f.pool,
        &format!(
            "SELECT COALESCE(group_concat(severity||':'||rule_key||'@'||content_revision, ','), '')
             FROM (SELECT severity, rule_key, content_revision FROM draft_audits WHERE draft_variant_id={variant_id} ORDER BY id)"
        ),
    )
    .await
}

async fn first_variant(f: &Fixture, draft_id: i64) -> i64 {
    number(
        &f.pool,
        &format!("SELECT id FROM draft_variants WHERE draft_id={draft_id} AND variant_number=1"),
    )
    .await
}

#[test]
fn inputs_reject_unknown_fields() {
    assert!(serde_json::from_value::<SetDraftVariantStatusInput>(
        serde_json::json!({"id":1,"status":"selected","force":true})
    )
    .is_err());
    assert!(serde_json::from_value::<DraftVariantInput>(
        serde_json::json!({"hook":"h","severity":"pass"})
    )
    .is_err());
}

#[tokio::test]
async fn create_writes_draft_variants_native_audits_and_moves_candidate() {
    let f = fixture().await;
    let id = create_draft(
        &f.pool,
        create(
            1,
            vec![variant(STRONG_HOOK, "Body"), variant("", "see www.x.com")],
        ),
    )
    .await
    .unwrap()
    .id;
    assert_eq!(
        text(&f.pool, &format!("SELECT campaign_id||'|'||angle||'|'||content_intent||'|'||status FROM drafts WHERE id={id}")).await,
        "1|Angle|idea|drafting"
    );
    assert_eq!(
        text(&f.pool, "SELECT status FROM candidate_posts WHERE id=1").await,
        "drafted"
    );
    let first = first_variant(&f, id).await;
    assert_eq!(
        audits(&f, first).await,
        "pass:external_link@1,pass:hashtag_limit@1,pass:required_text@1,pass:total_length@1"
    );
    let second = first + 1;
    assert_eq!(
        audits(&f, second).await,
        "block:external_link@1,warning:specificity@1,warning:weak_hook@1,pass:hashtag_limit@1,pass:required_text@1,pass:total_length@1"
    );
}

#[tokio::test]
async fn create_rejections_write_nothing() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    let mut bad_intent = create(1, vec![variant(STRONG_HOOK, "b")]);
    bad_intent.content_intent = "rant".to_string();
    for (input, expected) in [
        (
            create(99, vec![variant("h", "b")]),
            "Candidate was not found",
        ),
        (create(5, vec![variant("h", "b")]), "Campaign is archived"),
        (
            create(3, vec![variant("h", "b")]),
            "Rejected candidates cannot be drafted",
        ),
        (
            create(4, vec![variant("h", "b")]),
            "Candidate already has a draft",
        ),
        (create(1, vec![]), "Add one to five draft variants"),
        (
            create(1, vec![variant("h", "b"); 6]),
            "Add one to five draft variants",
        ),
        (
            create(1, vec![variant(&"x".repeat(501), "b")]),
            "Hook must be at most 500 characters",
        ),
        (bad_intent, "Unsupported content intent"),
    ] {
        assert_eq!(create_draft(&f.pool, input).await.unwrap_err(), expected);
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn create_rolls_back_draft_and_variants_when_audit_insert_fails() {
    let f = fixture().await;
    fail_on(
        &f.pool,
        "BEFORE INSERT ON draft_audits WHEN NEW.rule_key = 'total_length'",
    )
    .await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        create_draft(&f.pool, create(1, vec![variant(STRONG_HOOK, "b")]))
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    // No draft, variant, audit or candidate status change survives.
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
    assert_eq!(count(&f.pool, "drafts").await, 0);
}

#[tokio::test]
async fn concurrent_creates_for_one_candidate_have_one_winner() {
    let f = fixture().await;
    let (a, b) = tokio::join!(
        create_draft(&f.pool, create(2, vec![variant(STRONG_HOOK, "b")])),
        create_draft(&f.pool, create(2, vec![variant(STRONG_HOOK, "b")]))
    );
    assert_eq!([a.is_ok(), b.is_ok()].iter().filter(|ok| **ok).count(), 1);
    assert_eq!(count(&f.pool, "drafts").await, 1);
}

#[tokio::test]
async fn editing_a_variant_bumps_revision_and_reaudits_it() {
    let f = fixture().await;
    let draft = create_draft(&f.pool, create(1, vec![variant(STRONG_HOOK, "b")]))
        .await
        .unwrap()
        .id;
    let id = first_variant(&f, draft).await;
    update_variant(
        &f.pool,
        UpdateDraftVariantInput {
            id,
            hook: None,
            body: Some(" see https://x.com ".to_string()),
            cta: None,
            hashtags: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT body||'|'||content_revision FROM draft_variants WHERE id={id}")
        )
        .await,
        "see https://x.com|2"
    );
    assert!(audits(&f, id).await.starts_with("block:external_link@2"));
    // A no-op edit changes nothing (no revision bump, audits untouched).
    let before = snapshot(&f.pool, TABLES).await;
    update_variant(
        &f.pool,
        UpdateDraftVariantInput {
            id,
            hook: Some(format!("  {STRONG_HOOK} ")),
            body: None,
            cta: None,
            hashtags: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn variant_edit_rolls_back_when_reaudit_fails() {
    let f = fixture().await;
    let draft = create_draft(&f.pool, create(1, vec![variant(STRONG_HOOK, "b")]))
        .await
        .unwrap()
        .id;
    let id = first_variant(&f, draft).await;
    fail_on(&f.pool, "BEFORE INSERT ON draft_audits").await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        update_variant(
            &f.pool,
            UpdateDraftVariantInput {
                id,
                hook: None,
                body: Some("changed".to_string()),
                cta: None,
                hashtags: None
            }
        )
        .await
        .unwrap_err(),
        STORAGE_ERROR
    );
    // Body, revision and the old audit rows are all restored.
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
    assert_eq!(
        update_variant(
            &f.pool,
            UpdateDraftVariantInput {
                id: 999,
                hook: Some("x".to_string()),
                body: None,
                cta: None,
                hashtags: None
            }
        )
        .await
        .unwrap_err(),
        "Draft variant was not found"
    );
}

#[tokio::test]
async fn selecting_variant_clears_siblings_and_readies_draft() {
    let f = fixture().await;
    let draft = create_draft(
        &f.pool,
        create(
            1,
            vec![variant(STRONG_HOOK, "b"), variant(STRONG_HOOK, "c")],
        ),
    )
    .await
    .unwrap()
    .id;
    let first = first_variant(&f, draft).await;
    let second = first + 1;
    set_variant_status(
        &f.pool,
        SetDraftVariantStatusInput {
            id: first,
            status: "selected".into(),
        },
    )
    .await
    .unwrap();
    set_variant_status(
        &f.pool,
        SetDraftVariantStatusInput {
            id: second,
            status: "selected".into(),
        },
    )
    .await
    .unwrap();
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT (SELECT group_concat(status, ',') FROM (SELECT status FROM draft_variants WHERE draft_id={draft} ORDER BY id))||'|'||(SELECT status FROM drafts WHERE id={draft})")
        )
        .await,
        "draft,selected|ready_for_review"
    );
    // Deselecting the only selected variant sends the draft back to revision.
    set_variant_status(
        &f.pool,
        SetDraftVariantStatusInput {
            id: second,
            status: "draft".into(),
        },
    )
    .await
    .unwrap();
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT status FROM drafts WHERE id={draft}")
        )
        .await,
        "needs_revision"
    );
}

#[tokio::test]
async fn status_rejections_write_nothing() {
    let f = fixture().await;
    let draft = create_draft(&f.pool, create(1, vec![variant("", "see www.x.com")]))
        .await
        .unwrap()
        .id;
    let blocked = first_variant(&f, draft).await;
    let before = snapshot(&f.pool, TABLES).await;
    for (input, expected) in [
        (
            SetDraftVariantStatusInput {
                id: blocked,
                status: "selected".into(),
            },
            "Blocked variants cannot be selected",
        ),
        (
            SetDraftVariantStatusInput {
                id: 999,
                status: "draft".into(),
            },
            "Draft variant was not found",
        ),
        (
            SetDraftVariantStatusInput {
                id: blocked,
                status: "published".into(),
            },
            "Unsupported draft variant status",
        ),
    ] {
        assert_eq!(
            set_variant_status(&f.pool, input).await.unwrap_err(),
            expected
        );
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn select_rolls_back_sibling_reset_when_draft_update_fails() {
    let f = fixture().await;
    let draft = create_draft(
        &f.pool,
        create(
            1,
            vec![variant(STRONG_HOOK, "b"), variant(STRONG_HOOK, "c")],
        ),
    )
    .await
    .unwrap()
    .id;
    let first = first_variant(&f, draft).await;
    set_variant_status(
        &f.pool,
        SetDraftVariantStatusInput {
            id: first,
            status: "selected".into(),
        },
    )
    .await
    .unwrap();
    fail_on(&f.pool, "BEFORE UPDATE OF status ON drafts").await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        set_variant_status(
            &f.pool,
            SetDraftVariantStatusInput {
                id: first + 1,
                status: "selected".into()
            }
        )
        .await
        .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}
