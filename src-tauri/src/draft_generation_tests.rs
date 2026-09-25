use super::*;
use crate::test_support::{count, fail_on, migrated, number, seed, snapshot, text, Fixture};
use serde_json::json;

const TABLES: &[&str] = &[
    "draft_generation_requests",
    "drafts",
    "draft_variants",
    "draft_audits",
    "candidate_posts",
    "agent_runs",
    "agent_run_events",
    "workflow_runs",
    "workflow_steps",
    "workflow_events",
    "workflow_artifacts",
];

/// Campaign 1 active, 2 archived. Candidate 1 shortlisted (score 70) linked
/// to workflow run 5 (draft step 6 pending, audit step 7 pending);
/// candidate 2 new, unlinked; candidate 3 rejected; candidate 4 in the
/// archived campaign.
async fn fixture() -> Fixture {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit,product) VALUES (1,'Live','active',5,'  Linkgo   app '),(2,'Old','archived',5,'');
         INSERT INTO target_posts (id,url,normalized_url,content,content_hash,author_name) VALUES
           (1,'u1','n1','Post one','h1','Ada'),(2,'u2','n2','Post two','h2',''),(3,'u3','n3','c','h3',''),(4,'u4','n4','d','h4','');
         INSERT INTO candidate_posts (id,campaign_id,target_post_id,status,relevance_score) VALUES
           (1,1,1,'shortlisted',70),(2,1,2,'new',NULL),(3,1,3,'rejected',NULL),(4,2,4,'shortlisted',50);
         INSERT INTO workflow_runs (id,campaign_id,title,status,current_step_key) VALUES (5,1,'Run','running','draft');
         INSERT INTO workflow_steps (id,workflow_run_id,step_key,title,sort_order,status) VALUES
           (6,5,'draft','Draft',3,'pending'),(7,5,'audit','Audit',4,'pending');
         INSERT INTO workflow_artifacts (workflow_run_id,workflow_step_id,artifact_type,artifact_id,summary) VALUES (5,6,'candidate_post',1,'c');
         INSERT INTO agent_runs (id,campaign_id,agent_role,status) VALUES (20,1,'drafter','completed'),(21,2,'drafter','completed');",
    )
    .await;
    f
}

fn claim(candidate_id: i64, workflow_run_id: Option<i64>) -> ClaimDraftGenerationInput {
    ClaimDraftGenerationInput {
        campaign_id: 1,
        candidate_id,
        provider_key: "dry_run".to_string(),
        model_name: String::new(),
        playbook_key: "linkedin_writer".to_string(),
        variant_count: 3,
        content_intent: "idea".to_string(),
        workflow_run_id,
        angle: " Angle ".to_string(),
        voice_notes: String::new(),
    }
}

fn variants() -> Value {
    json!([
        { "hook": "We cut onboarding by 30%", "body": "Body one", "cta": "", "hashtags": ["growth", "#saas"] },
        { "hook": "Hook two", "body": "Body two", "cta": "Try it", "hashtags": [] },
        { "hook": "Hook three", "body": "see www.x.com", "cta": "", "hashtags": [] }
    ])
}

/// Records a completed draft_post call on agent run 20 for `request_id`.
async fn record_drafter_output(f: &Fixture, request_id: i64, output_variants: Value) {
    let input = json!({
        "draftGenerationRequestId": request_id, "campaignId": 1, "candidatePostId": 1,
        "variantCount": 3, "contentIntent": "idea", "angle": "", "voiceNotes": "",
        "variants": variants(),
    });
    let output = json!({ "variants": output_variants, "summary": " Three drafts " });
    sqlx::query(
        "INSERT INTO agent_tool_calls (agent_run_id, provider_tool_call_id, tool_name, status, requires_approval, input_json, output_json)
         VALUES (20, 'c1', 'draft_post', 'completed', 0, ?1, ?2)",
    )
    .bind(input.to_string())
    .bind(output.to_string())
    .execute(&f.pool)
    .await
    .unwrap();
}

/// Claims (linked to run 5), links agent run 20, records output, settles.
async fn generated_request(f: &Fixture) -> i64 {
    let request = claim_generation(&f.pool, claim(1, Some(5)))
        .await
        .unwrap()
        .request_id;
    link_agent_run(
        &f.pool,
        LinkGenerationAgentRunInput {
            request_id: request,
            agent_run_id: 20,
        },
    )
    .await
    .unwrap();
    record_drafter_output(f, request, variants()).await;
    let settled = settle_generation(
        &f.pool,
        SettleGenerationInput {
            request_id: request,
            failure_message: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(settled.status, "generated");
    request
}

async fn step_statuses(f: &Fixture) -> String {
    text(
        &f.pool,
        "SELECT (SELECT status||'@'||current_step_key FROM workflow_runs WHERE id=5)||' '||
                (SELECT group_concat(step_key||':'||status, ',') FROM (SELECT step_key, status FROM workflow_steps WHERE workflow_run_id=5 ORDER BY sort_order))",
    )
    .await
}

#[test]
fn inputs_reject_unknown_fields() {
    assert!(serde_json::from_value::<SettleGenerationInput>(json!({
        "requestId": 1, "variants": []
    }))
    .is_err());
    assert!(serde_json::from_value::<GeneratedVariant>(json!({
        "hook": "h", "body": "b", "cta": "", "hashtags": [], "severity": "pass"
    }))
    .is_err());
}

#[test]
fn reference_truncation_and_hashtags_match_renderer() {
    assert_eq!(truncate_reference("  a   b  ", 10), "a b");
    assert_eq!(truncate_reference("abcdef", 4), "abc…");
    assert_eq!(
        hashtags_to_draft_string(&["growth".into(), " #saas ".into(), "  ".into()]),
        "#growth #saas"
    );
}

#[tokio::test]
async fn claim_inserts_request_starts_linked_step_and_returns_bounded_context() {
    let f = fixture().await;
    let claimed = claim_generation(&f.pool, claim(1, Some(5))).await.unwrap();
    assert_eq!(claimed.workflow_run_id, Some(5));
    assert_eq!(
        claimed.candidate_context["campaign"]["product"],
        "Linkgo app"
    );
    assert_eq!(claimed.candidate_context["candidate"]["relevanceScore"], 70);
    assert_eq!(
        text(&f.pool, &format!("SELECT status||'|'||angle||'|'||workflow_run_id||'|'||workflow_step_id FROM draft_generation_requests WHERE id={}", claimed.request_id)).await,
        "pending|Angle|5|6"
    );
    assert_eq!(
        step_statuses(&f).await,
        "running@draft draft:running,audit:pending"
    );
    assert_eq!(
        text(
            &f.pool,
            "SELECT event_type FROM workflow_events ORDER BY id DESC LIMIT 1"
        )
        .await,
        "step_started"
    );
}

#[tokio::test]
async fn claim_rejections_write_nothing() {
    let f = fixture().await;
    let before = snapshot(&f.pool, TABLES).await;
    let mut foreign = claim(4, None);
    foreign.campaign_id = 2;
    let mut bad_count = claim(1, None);
    bad_count.variant_count = 6;
    let mut bad_provider = claim(1, None);
    bad_provider.provider_key = "shell".to_string();
    for (input, expected) in [
        (claim(99, None), "Candidate was not found"),
        (claim(3, None), "Rejected candidates cannot be drafted"),
        (foreign, "Campaign is archived"),
        (
            claim(2, Some(5)),
            "Workflow has no surviving artifact for this candidate",
        ),
        (bad_count, "Generate three to five variants"),
        (bad_provider, "Unsupported provider"),
    ] {
        assert_eq!(
            claim_generation(&f.pool, input).await.unwrap_err(),
            expected
        );
    }
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn claim_rolls_back_linked_step_when_request_insert_fails() {
    let f = fixture().await;
    fail_on(&f.pool, "BEFORE INSERT ON draft_generation_requests").await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        claim_generation(&f.pool, claim(1, Some(5)))
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    // The draft step stays pending and no workflow event survives.
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}

#[tokio::test]
async fn link_rejects_cross_campaign_agent_run_and_double_link() {
    let f = fixture().await;
    let request = claim_generation(&f.pool, claim(2, None))
        .await
        .unwrap()
        .request_id;
    let error = link_agent_run(
        &f.pool,
        LinkGenerationAgentRunInput {
            request_id: request,
            agent_run_id: 21,
        },
    )
    .await
    .unwrap_err();
    assert_eq!(
        error,
        "Draft generation request could not be linked to its agent run"
    );
    link_agent_run(
        &f.pool,
        LinkGenerationAgentRunInput {
            request_id: request,
            agent_run_id: 20,
        },
    )
    .await
    .unwrap();
    assert!(link_agent_run(
        &f.pool,
        LinkGenerationAgentRunInput {
            request_id: request,
            agent_run_id: 20
        }
    )
    .await
    .is_err());
}

#[tokio::test]
async fn settle_reads_drafter_output_natively_and_rejects_tampered_variants() {
    let f = fixture().await;
    let request = generated_request(&f).await;
    assert_eq!(
        text(&f.pool, &format!("SELECT summary||'|'||json_array_length(generated_variants_json) FROM draft_generation_requests WHERE id={request}")).await,
        "Three drafts|3"
    );
    // Second request whose recorded output diverges from the tool input.
    let tampered = claim_generation(&f.pool, claim(2, None))
        .await
        .unwrap()
        .request_id;
    seed(&f.pool, "INSERT INTO agent_runs (id,campaign_id,agent_role,status) VALUES (22,1,'drafter','completed');").await;
    link_agent_run(
        &f.pool,
        LinkGenerationAgentRunInput {
            request_id: tampered,
            agent_run_id: 22,
        },
    )
    .await
    .unwrap();
    let input = json!({
        "draftGenerationRequestId": tampered, "campaignId": 1, "candidatePostId": 2,
        "variantCount": 3, "contentIntent": "idea", "variants": variants(),
    });
    let mut changed = variants();
    changed[0]["hook"] = json!("Injected hook");
    sqlx::query(
        "INSERT INTO agent_tool_calls (agent_run_id, provider_tool_call_id, tool_name, status, requires_approval, input_json, output_json)
         VALUES (22, 'c2', 'draft_post', 'completed', 0, ?1, ?2)",
    )
    .bind(input.to_string())
    .bind(json!({ "variants": changed, "summary": "" }).to_string())
    .execute(&f.pool)
    .await
    .unwrap();
    let settled = settle_generation(
        &f.pool,
        SettleGenerationInput {
            request_id: tampered,
            failure_message: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(
        (settled.status.as_str(), settled.error_message.as_str()),
        (
            "failed",
            "Drafter output did not preserve provider-authored variants"
        )
    );
}

#[tokio::test]
async fn provider_failure_fails_request_and_blocks_linked_step() {
    let f = fixture().await;
    let request = claim_generation(&f.pool, claim(1, Some(5)))
        .await
        .unwrap()
        .request_id;
    let settled = settle_generation(
        &f.pool,
        SettleGenerationInput {
            request_id: request,
            failure_message: Some("  Provider   timed out ".to_string()),
        },
    )
    .await
    .unwrap();
    assert_eq!(settled.error_message, "Provider timed out");
    assert_eq!(
        text(&f.pool, &format!("SELECT status||'|'||error_message FROM draft_generation_requests WHERE id={request}")).await,
        "failed|Provider timed out"
    );
    assert_eq!(
        step_statuses(&f).await,
        "blocked@draft draft:blocked,audit:pending"
    );
    assert_eq!(
        text(
            &f.pool,
            "SELECT summary FROM workflow_events WHERE event_type='step_blocked'"
        )
        .await,
        "Draft generation failed: Provider timed out"
    );
    // A settled request cannot be settled again.
    assert_eq!(
        settle_generation(
            &f.pool,
            SettleGenerationInput {
                request_id: request,
                failure_message: None
            }
        )
        .await
        .unwrap_err(),
        "Draft generation request is no longer pending"
    );
}

#[tokio::test]
async fn save_creates_draft_with_native_audits_and_advances_workflow() {
    let f = fixture().await;
    let request = generated_request(&f).await;
    let draft = save_generated(&f.pool, DraftGenerationIdInput { id: request })
        .await
        .unwrap()
        .id;
    assert_eq!(
        text(
            &f.pool,
            &format!("SELECT notes||'|'||angle||'|'||content_intent FROM drafts WHERE id={draft}")
        )
        .await,
        format!("Generated by dry_run/default from request #{request}.|Angle|idea")
    );
    assert_eq!(
        text(
            &f.pool,
            &format!(
                "SELECT hashtags FROM draft_variants WHERE draft_id={draft} AND variant_number=1"
            )
        )
        .await,
        "#growth #saas"
    );
    // Variant 3 contains a link, so its native audit blocks.
    assert_eq!(
        number(&f.pool, &format!("SELECT COUNT(*) FROM draft_audits da JOIN draft_variants dv ON dv.id=da.draft_variant_id WHERE dv.draft_id={draft} AND dv.variant_number=3 AND da.severity='block' AND da.rule_key='external_link'")).await,
        1
    );
    assert_eq!(
        text(&f.pool, &format!("SELECT status||'|'||created_draft_id FROM draft_generation_requests WHERE id={request}")).await,
        format!("saved|{draft}")
    );
    assert_eq!(
        text(&f.pool, "SELECT status FROM candidate_posts WHERE id=1").await,
        "drafted"
    );
    assert_eq!(
        step_statuses(&f).await,
        "running@audit draft:completed,audit:running"
    );
    assert_eq!(
        number(&f.pool, &format!("SELECT COUNT(*) FROM workflow_artifacts WHERE artifact_type='draft' AND artifact_id={draft}")).await,
        1
    );
}

#[tokio::test]
async fn save_rolls_back_draft_and_workflow_when_audit_insert_fails() {
    let f = fixture().await;
    let request = generated_request(&f).await;
    fail_on(&f.pool, "BEFORE INSERT ON draft_audits WHEN NEW.rule_key = 'external_link' AND NEW.severity = 'block'").await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        save_generated(&f.pool, DraftGenerationIdInput { id: request })
            .await
            .unwrap_err(),
        // Raised by the shared draft insert, which owns its own message.
        "Could not save draft change"
    );
    // No draft, variant, audit, candidate or workflow change survives; the
    // request stays saveable.
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
    assert_eq!(count(&f.pool, "drafts").await, 0);
}

#[tokio::test]
async fn save_rejections_write_nothing() {
    let f = fixture().await;
    let pending = claim_generation(&f.pool, claim(2, None))
        .await
        .unwrap()
        .request_id;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        save_generated(&f.pool, DraftGenerationIdInput { id: pending })
            .await
            .unwrap_err(),
        "Only generated draft requests can be saved"
    );
    assert_eq!(
        save_generated(&f.pool, DraftGenerationIdInput { id: 999 })
            .await
            .unwrap_err(),
        "Draft generation request was not found"
    );
    // A generated request with a short variant list cannot be saved.
    seed(
        &f.pool,
        &format!("UPDATE draft_generation_requests SET status='generated', generated_variants_json='[]' WHERE id={pending}"),
    )
    .await;
    let before_short = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        save_generated(&f.pool, DraftGenerationIdInput { id: pending })
            .await
            .unwrap_err(),
        "Generated request does not have its exact requested variants"
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before_short);
    assert_ne!(before, before_short);
}

#[tokio::test]
async fn concurrent_saves_create_exactly_one_draft() {
    let f = fixture().await;
    let request = generated_request(&f).await;
    let (a, b) = tokio::join!(
        save_generated(&f.pool, DraftGenerationIdInput { id: request }),
        save_generated(&f.pool, DraftGenerationIdInput { id: request })
    );
    assert_eq!([a.is_ok(), b.is_ok()].iter().filter(|ok| **ok).count(), 1);
    assert_eq!(count(&f.pool, "drafts").await, 1);
    assert_eq!(
        number(
            &f.pool,
            "SELECT COUNT(*) FROM workflow_events WHERE summary='Audit drafts started'"
        )
        .await,
        1
    );
}

#[tokio::test]
async fn concurrent_claims_for_one_linked_step_have_one_winner() {
    let f = fixture().await;
    let (a, b) = tokio::join!(
        claim_generation(&f.pool, claim(1, Some(5))),
        claim_generation(&f.pool, claim(1, Some(5)))
    );
    // One active request per linked draft step (unique index); the loser's
    // step update and event roll back with its rejected insert.
    let outcomes = [a, b];
    assert_eq!(outcomes.iter().filter(|r| r.is_ok()).count(), 1);
    assert!(outcomes
        .iter()
        .any(|r| r.as_ref().err().map(String::as_str) == Some(ACTIVE_STEP_REQUEST_MESSAGE)));
    assert_eq!(count(&f.pool, "draft_generation_requests").await, 1);
    assert_eq!(
        text(&f.pool, "SELECT group_concat(event_type, ',') FROM (SELECT event_type FROM workflow_events ORDER BY id)").await,
        "step_started"
    );
}

#[tokio::test]
async fn dismiss_pending_cancels_agent_run_and_blocks_step() {
    let f = fixture().await;
    let request = claim_generation(&f.pool, claim(1, Some(5)))
        .await
        .unwrap()
        .request_id;
    seed(
        &f.pool,
        "UPDATE agent_runs SET status='running' WHERE id=20;",
    )
    .await;
    link_agent_run(
        &f.pool,
        LinkGenerationAgentRunInput {
            request_id: request,
            agent_run_id: 20,
        },
    )
    .await
    .unwrap();
    dismiss(&f.pool, DraftGenerationIdInput { id: request })
        .await
        .unwrap();
    assert_eq!(
        text(&f.pool, "SELECT status FROM agent_runs WHERE id=20").await,
        "cancelled"
    );
    assert_eq!(
        number(&f.pool, "SELECT COUNT(*) FROM agent_run_events WHERE agent_run_id=20 AND event_type='run_cancelled'").await,
        1
    );
    assert!(text(
        &f.pool,
        &format!(
            "SELECT status||'|'||error_message FROM draft_generation_requests WHERE id={request}"
        )
    )
    .await
    .starts_with("dismissed|Draft generation request #"));
    assert_eq!(
        step_statuses(&f).await,
        "blocked@draft draft:blocked,audit:pending"
    );
}

#[tokio::test]
async fn dismiss_rolls_back_when_workflow_block_fails() {
    let f = fixture().await;
    let request = generated_request(&f).await;
    fail_on(&f.pool, "BEFORE INSERT ON workflow_events").await;
    let before = snapshot(&f.pool, TABLES).await;
    assert_eq!(
        dismiss(&f.pool, DraftGenerationIdInput { id: request })
            .await
            .unwrap_err(),
        STORAGE_ERROR
    );
    assert_eq!(snapshot(&f.pool, TABLES).await, before);
}
