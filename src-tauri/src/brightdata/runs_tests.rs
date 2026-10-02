use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::Value;

use super::*;
use crate::brightdata::recovery::{recover_interrupted_runs, EXPIRED_ERROR, INTERRUPTED_ERROR};
use crate::brightdata::store::{DISABLED_ERROR, KILL_SWITCH_ERROR, NO_KEY_ERROR};
use crate::test_support::{count, migrated, number, seed, text, Fixture};

// 2026-09-30T12:00:00Z
const NOW: i64 = 1_790_769_600_000;
fn now() -> i64 {
    NOW
}

const FAST: Timing = Timing {
    poll_interval: Duration::from_millis(10),
    poll_budget: Duration::from_secs(5),
};

fn fixture_records(raw: &str) -> Vec<Value> {
    let value: Value = serde_json::from_str(raw).unwrap();
    value["body"].as_array().unwrap().clone()
}

fn pipeline_records() -> Vec<Value> {
    fixture_records(include_str!("fixtures/cli_pipelines_linkedin_posts.json"))
}

#[derive(Default)]
struct Fake {
    cli_error: Option<String>,
    collect_error: Option<String>,
    progress: Mutex<Vec<SnapshotStatus>>,
    downloads: Mutex<Vec<Download>>,
    trigger_error: Option<DirectError>,
    calls: Mutex<Vec<String>>,
    trigger_windows: Mutex<Vec<(String, String)>>,
    collect_calls: AtomicUsize,
}

impl Fake {
    fn log(&self, call: &str) {
        self.calls.lock().unwrap().push(call.to_string());
    }
    fn calls(&self) -> Vec<String> {
        self.calls.lock().unwrap().clone()
    }
}

impl Transport for Fake {
    fn check_cli(&self, _cancel: &Arc<AtomicBool>) -> Result<(), String> {
        self.log("check_cli");
        self.cli_error.clone().map_or(Ok(()), Err)
    }
    fn collect_post(
        &self,
        post_url: &str,
        _cancel: &Arc<AtomicBool>,
    ) -> Result<Vec<Value>, String> {
        self.log(&format!("collect {post_url}"));
        self.collect_calls.fetch_add(1, Ordering::SeqCst);
        if let Some(error) = &self.collect_error {
            return Err(error.clone());
        }
        Ok(pipeline_records()
            .into_iter()
            .filter(|record| record["url"] == post_url)
            .collect())
    }
    fn trigger(
        &self,
        kind: WatchKind,
        urls: &[String],
        start_date: &str,
        end_date: &str,
        _limit_per_input: usize,
    ) -> Result<String, DirectError> {
        self.log(&format!("trigger {} {}", kind.as_str(), urls.len()));
        self.trigger_windows
            .lock()
            .unwrap()
            .push((start_date.to_string(), end_date.to_string()));
        match &self.trigger_error {
            Some(error) => Err(error.clone()),
            None => Ok("sd_test01".to_string()),
        }
    }
    fn progress(&self, _snapshot_id: &str) -> Result<SnapshotStatus, DirectError> {
        self.log("progress");
        let mut queue = self.progress.lock().unwrap();
        Ok(if queue.len() > 1 {
            queue.remove(0)
        } else {
            queue.first().copied().unwrap_or(SnapshotStatus::Running)
        })
    }
    fn download(&self, _snapshot_id: &str) -> Result<Download, DirectError> {
        self.log("download");
        let mut queue = self.downloads.lock().unwrap();
        Ok(if queue.is_empty() {
            Download::NotReady
        } else {
            queue.remove(0)
        })
    }
    fn cancel_snapshot(&self, _snapshot_id: &str) -> Result<(), DirectError> {
        self.log("cancel_snapshot");
        Ok(())
    }
}

struct Harness {
    f: Fixture,
    activity: BrightDataActivity,
    source_activity: SourceImportActivity,
}

impl Harness {
    fn ctx(&self, fake: Arc<Fake>, timing: Timing) -> RunContext<'_> {
        RunContext {
            pool: &self.f.pool,
            activity: &self.activity,
            source_activity: &self.source_activity,
            transport: fake,
            timing,
            now_ms: now,
        }
    }
}

async fn harness(enabled: bool) -> Harness {
    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Live','active',5),(2,'Other','active',5);
         INSERT INTO candidate_intake_policies (campaign_id,max_post_age_days) VALUES (1,30);",
    )
    .await;
    if enabled {
        seed(
            &f.pool,
            "UPDATE app_settings SET brightdata_connector_enabled = 1 WHERE id = 1;",
        )
        .await;
    }
    Harness {
        f,
        activity: BrightDataActivity::default(),
        source_activity: SourceImportActivity::default(),
    }
}

const POST_1: &str =
    "https://www.linkedin.com/posts/synthetic-author-one_ai-agents-activity-7300000000000000001-AbCd";
const POST_2: &str =
    "https://de.linkedin.com/posts/synthetic-company_platform-update-activity-7300000000000000002-EfGh";

fn post_url_input(urls: &[&str]) -> StartRunInput {
    StartRunInput {
        campaign_id: 1,
        request: RunRequest::PostUrl {
            post_urls: urls.iter().map(|url| (*url).to_string()).collect(),
        },
    }
}

fn watchlist_input() -> StartRunInput {
    StartRunInput {
        campaign_id: 1,
        request: RunRequest::Watchlist {
            kind: "profile".into(),
            entry_ids: None,
            days: None,
        },
    }
}

async fn seed_watchlist(pool: &SqlitePool) {
    seed(
        pool,
        "INSERT INTO source_watchlist_entries (campaign_id,kind,url,label) VALUES
           (1,'profile','https://www.linkedin.com/in/synthetic-watch-person','Watch person'),
           (1,'company','https://www.linkedin.com/company/synthetic-watch-company','');",
    )
    .await;
}

#[tokio::test]
async fn disabled_flag_refuses_every_run_command_and_writes_nothing() {
    let h = harness(false).await;
    let fake = Arc::new(Fake::default());
    let ctx = h.ctx(fake.clone(), FAST);
    assert_eq!(
        start_run(&ctx, post_url_input(&[POST_1]), true)
            .await
            .unwrap_err(),
        DISABLED_ERROR
    );
    seed(
        &h.f.pool,
        "INSERT INTO brightdata_runs (id,campaign_id,mode,input_json,snapshot_id,status,created_at,updated_at)
         VALUES (9,1,'watchlist','{}','sd_x','running','2026-09-30 11:00:00','2026-09-30 11:00:00');",
    )
    .await;
    assert_eq!(resume_run(&ctx, 9, true).await.unwrap_err(), DISABLED_ERROR);
    assert_eq!(count(&h.f.pool, "brightdata_runs").await, 1);
    assert_eq!(count(&h.f.pool, "source_import_batches").await, 0);
    assert!(fake.calls().is_empty());
}

#[tokio::test]
async fn gates_fail_closed_in_order() {
    let h = harness(true).await;
    let fake = Arc::new(Fake::default());
    let ctx = h.ctx(fake.clone(), FAST);

    seed(
        &h.f.pool,
        "UPDATE safety_settings SET global_kill_switch = 1 WHERE id = 1;",
    )
    .await;
    assert_eq!(
        start_run(&ctx, post_url_input(&[POST_1]), true)
            .await
            .unwrap_err(),
        KILL_SWITCH_ERROR
    );
    seed(
        &h.f.pool,
        "UPDATE safety_settings SET global_kill_switch = 0 WHERE id = 1;",
    )
    .await;

    let missing = StartRunInput {
        campaign_id: 99,
        ..post_url_input(&[POST_1])
    };
    assert_eq!(
        start_run(&ctx, missing, true).await.unwrap_err(),
        "Campaign not found"
    );
    assert_eq!(
        start_run(&ctx, post_url_input(&[POST_1]), false)
            .await
            .unwrap_err(),
        NO_KEY_ERROR
    );

    seed(
        &h.f.pool,
        "INSERT INTO brightdata_runs (campaign_id,mode,input_json,status,created_at,updated_at) VALUES
          (1,'post_url','{}','imported','2026-09-30 01:00:00','2026-09-30 01:00:00'),
          (1,'post_url','{}','imported','2026-09-30 02:00:00','2026-09-30 02:00:00'),
          (1,'post_url','{}','failed','2026-09-30 03:00:00','2026-09-30 03:00:00'),
          (1,'post_url','{}','cancelled','2026-09-30 04:00:00','2026-09-30 04:00:00'),
          (1,'post_url','{}','imported','2026-09-29 23:00:00','2026-09-29 23:00:00');",
    )
    .await;
    // Four today: one more is allowed.
    let fifth = start_run(&ctx, post_url_input(&[POST_1]), true)
        .await
        .unwrap();
    assert_eq!(fifth.status, "imported");
    let sixth = start_run(&ctx, post_url_input(&[POST_1]), true)
        .await
        .unwrap_err();
    assert!(sixth.contains("5 Bright Data runs today"), "{sixth}");
    assert_eq!(count(&h.f.pool, "brightdata_runs").await, 6);
}

#[tokio::test]
async fn archived_campaign_blocks_start_and_resume_before_any_paid_call() {
    let h = harness(true).await;
    let fake = Arc::new(Fake::default());
    let ctx = h.ctx(fake.clone(), FAST);
    seed_watchlist(&h.f.pool).await;
    seed(
        &h.f.pool,
        "INSERT INTO brightdata_runs (id,campaign_id,mode,input_json,snapshot_id,status,created_at,updated_at)
         VALUES (9,1,'watchlist','{}','sd_x','running','2026-09-30 11:00:00','2026-09-30 11:00:00');
         UPDATE campaigns SET status = 'archived' WHERE id = 1;",
    )
    .await;

    assert_eq!(
        start_run(&ctx, post_url_input(&[POST_1]), true)
            .await
            .unwrap_err(),
        "Campaign is archived"
    );
    assert_eq!(
        start_run(&ctx, watchlist_input(), true).await.unwrap_err(),
        "Campaign is archived"
    );
    // Archived outranks the missing API key: campaign gate runs first.
    assert_eq!(
        start_run(&ctx, post_url_input(&[POST_1]), false)
            .await
            .unwrap_err(),
        "Campaign is archived"
    );
    assert_eq!(
        resume_run(&ctx, 9, true).await.unwrap_err(),
        "Campaign is archived"
    );
    assert!(fake.calls().is_empty());
    assert_eq!(count(&h.f.pool, "brightdata_runs").await, 1);
    assert_eq!(count(&h.f.pool, "source_import_batches").await, 0);
}

#[tokio::test]
async fn input_limits_are_enforced() {
    let h = harness(true).await;
    let ctx = h.ctx(Arc::new(Fake::default()), FAST);
    let too_many: Vec<String> = (0..21)
        .map(|n| format!("https://www.linkedin.com/posts/a_activity-{n}"))
        .collect();
    let refs: Vec<&str> = too_many.iter().map(String::as_str).collect();
    assert!(start_run(&ctx, post_url_input(&refs), true)
        .await
        .unwrap_err()
        .contains("up to 20"));
    assert!(
        start_run(&ctx, post_url_input(&["https://example.com/x"]), true)
            .await
            .is_err()
    );
    seed_watchlist(&h.f.pool).await;
    let window = StartRunInput {
        campaign_id: 1,
        request: RunRequest::Watchlist {
            kind: "profile".into(),
            entry_ids: None,
            days: Some(31),
        },
    };
    assert!(start_run(&ctx, window, true)
        .await
        .unwrap_err()
        .contains("30 days"));
    assert_eq!(count(&h.f.pool, "brightdata_runs").await, 0);
}

#[test]
fn keyword_requests_are_rejected_at_the_boundary() {
    // Bright Data retired Discover (HTTP 410); the mode no longer exists.
    let parsed = serde_json::from_value::<StartRunInput>(serde_json::json!({
        "campaignId": 1,
        "request": { "mode": "keyword", "query": "ai agents" },
    }));
    assert!(parsed.is_err());
}

#[tokio::test]
async fn post_url_run_imports_through_source_imports_writer() {
    let h = harness(true).await;
    let fake = Arc::new(Fake::default());
    let ctx = h.ctx(fake.clone(), FAST);
    let run = start_run(&ctx, post_url_input(&[POST_1, POST_2]), true)
        .await
        .unwrap();
    assert_eq!(run.status, "imported");
    assert_eq!(run.mode, "post_url");
    assert_eq!(run.requested_count, 2);
    assert_eq!(run.row_count, 2);
    let batch_id = run.source_import_batch_id.unwrap();
    assert_eq!(
        text(
            &h.f.pool,
            &format!("SELECT source_type FROM source_import_batches WHERE id = {batch_id}")
        )
        .await,
        "brightdata"
    );
    assert_eq!(
        text(
            &h.f.pool,
            "SELECT notes FROM candidate_posts ORDER BY id LIMIT 1"
        )
        .await,
        "brightdata:post_url"
    );
    assert_eq!(
        fake.calls(),
        vec![
            "check_cli".to_string(),
            format!("collect {POST_1}"),
            format!("collect {POST_2}")
        ]
    );
    assert!(!h.activity.is_active(1));
}

#[tokio::test]
async fn cli_version_failure_fails_the_run_without_collecting() {
    let h = harness(true).await;
    let fake = Arc::new(Fake {
        cli_error: Some("Bright Data CLI 0.3.7 is required (found 0.4.0)".into()),
        ..Fake::default()
    });
    let run = start_run(&h.ctx(fake.clone(), FAST), post_url_input(&[POST_1]), true)
        .await
        .unwrap();
    assert_eq!(run.status, "failed");
    assert!(run.error_message.contains("0.3.7"));
    assert_eq!(fake.collect_calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn every_collect_failing_fails_the_run() {
    let h = harness(true).await;
    let fake = Arc::new(Fake {
        collect_error: Some("The Bright Data CLI failed: unauthorized".into()),
        ..Fake::default()
    });
    let run = start_run(&h.ctx(fake, FAST), post_url_input(&[POST_1, POST_2]), true)
        .await
        .unwrap();
    assert_eq!(run.status, "failed");
    assert_eq!(
        run.error_message,
        "The Bright Data CLI failed: unauthorized"
    );
    assert_eq!(count(&h.f.pool, "source_import_batches").await, 0);
}

#[tokio::test]
async fn watchlist_run_triggers_polls_downloads_and_imports() {
    let h = harness(true).await;
    seed_watchlist(&h.f.pool).await;
    let records = fixture_records(include_str!("fixtures/direct_snapshot_discover.json"));
    let fake = Arc::new(Fake {
        progress: Mutex::new(vec![SnapshotStatus::Running, SnapshotStatus::Ready]),
        downloads: Mutex::new(vec![Download::NotReady, Download::Records(records)]),
        ..Fake::default()
    });
    let run = start_run(&h.ctx(fake.clone(), FAST), watchlist_input(), true)
        .await
        .unwrap();
    assert_eq!(run.status, "imported", "{}", run.error_message);
    assert_eq!(run.snapshot_id.as_deref(), Some("sd_test01"));
    assert_eq!(run.requested_count, 1);
    assert_eq!(run.row_count, 2);
    assert_eq!(fake.calls()[0], "trigger profile 1");
    assert_eq!(
        text(
            &h.f.pool,
            "SELECT source_keyword FROM candidate_posts LIMIT 1"
        )
        .await,
        "Watch person"
    );
}

#[tokio::test]
async fn company_watchlist_run_sends_iso_window_and_stores_it() {
    let h = harness(true).await;
    seed_watchlist(&h.f.pool).await;
    let fake = Arc::new(Fake {
        progress: Mutex::new(vec![SnapshotStatus::Ready]),
        downloads: Mutex::new(vec![Download::Records(Vec::new())]),
        ..Fake::default()
    });
    let input = StartRunInput {
        campaign_id: 1,
        request: RunRequest::Watchlist {
            kind: "company".into(),
            entry_ids: None,
            days: Some(7),
        },
    };
    start_run(&h.ctx(fake.clone(), FAST), input, true)
        .await
        .unwrap();
    assert_eq!(fake.calls()[0], "trigger company 1");
    let start = "2026-09-23T00:00:00.000Z";
    let end = "2026-09-30T12:00:00.000Z";
    assert_eq!(
        fake.trigger_windows.lock().unwrap().clone(),
        vec![(start.to_string(), end.to_string())]
    );
    let stored: Value = serde_json::from_str(
        &text(&h.f.pool, "SELECT input_json FROM brightdata_runs LIMIT 1").await,
    )
    .unwrap();
    assert_eq!(stored["startDate"], start);
    assert_eq!(stored["endDate"], end);
}

#[tokio::test]
async fn watchlist_poll_budget_leaves_run_resumable_then_resume_imports() {
    let h = harness(true).await;
    seed_watchlist(&h.f.pool).await;
    let short = Timing {
        poll_interval: Duration::from_millis(5),
        poll_budget: Duration::from_millis(30),
    };
    let fake = Arc::new(Fake::default());
    let run = start_run(&h.ctx(fake, short), watchlist_input(), true)
        .await
        .unwrap();
    assert_eq!(run.status, "running");
    assert!(run.resumable);
    assert_eq!(run.error_message, STILL_RUNNING_MESSAGE);

    let records = fixture_records(include_str!("fixtures/direct_snapshot_discover.json"));
    let ready = Arc::new(Fake {
        progress: Mutex::new(vec![SnapshotStatus::Ready]),
        downloads: Mutex::new(vec![Download::Records(records)]),
        ..Fake::default()
    });
    let resumed = resume_run(&h.ctx(ready.clone(), FAST), run.id, true)
        .await
        .unwrap();
    assert_eq!(resumed.status, "imported");
    assert!(!ready.calls().iter().any(|call| call.starts_with("trigger")));
}

#[tokio::test]
async fn watchlist_trigger_rejection_fails_without_snapshot() {
    let h = harness(true).await;
    seed_watchlist(&h.f.pool).await;
    let fake = Arc::new(Fake {
        trigger_error: Some(DirectError::Terminal("HTTP 400: bad input".into())),
        ..Fake::default()
    });
    let run = start_run(&h.ctx(fake, FAST), watchlist_input(), true)
        .await
        .unwrap();
    assert_eq!(run.status, "failed");
    assert_eq!(run.snapshot_id, None);
}

#[tokio::test]
async fn user_cancel_stops_watchlist_and_cancels_snapshot() {
    let h = harness(true).await;
    seed_watchlist(&h.f.pool).await;
    let fake = Arc::new(Fake::default());
    let ctx = h.ctx(fake.clone(), FAST);
    let (run, _) = tokio::join!(start_run(&ctx, watchlist_input(), true), async {
        while !fake.calls().iter().any(|call| call == "progress") {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        assert!(h.activity.signal_cancel(1));
    });
    let run = run.unwrap();
    assert_eq!(run.status, "cancelled");
    assert!(fake.calls().contains(&"cancel_snapshot".to_string()));
}

#[tokio::test]
async fn kill_switch_mid_run_cancels() {
    let h = harness(true).await;
    seed_watchlist(&h.f.pool).await;
    let fake = Arc::new(Fake::default());
    let ctx = h.ctx(fake.clone(), FAST);
    let (run, _) = tokio::join!(start_run(&ctx, watchlist_input(), true), async {
        // Flip the switch only once the snapshot exists, so the run must
        // cancel it server-side.
        while !fake.calls().iter().any(|call| call == "progress") {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        seed(
            &h.f.pool,
            "UPDATE safety_settings SET global_kill_switch = 1 WHERE id = 1;",
        )
        .await;
    });
    let run = run.unwrap();
    assert_eq!(run.status, "cancelled");
    assert_eq!(run.error_message, KILL_SWITCH_ERROR);
    assert!(fake.calls().contains(&"cancel_snapshot".to_string()));
}

#[tokio::test]
async fn cancel_marks_a_resumable_run_cancelled() {
    let h = harness(true).await;
    seed(
        &h.f.pool,
        "INSERT INTO brightdata_runs (id,campaign_id,mode,input_json,snapshot_id,status,created_at,updated_at)
         VALUES (5,1,'watchlist','{}','sd_x','running','2026-09-30 11:00:00','2026-09-30 11:00:00');",
    )
    .await;
    let fake = Arc::new(Fake::default());
    let run = cancel_run(&h.ctx(fake.clone(), FAST), 5).await.unwrap();
    assert_eq!(run.status, "cancelled");
    assert_eq!(fake.calls(), vec!["cancel_snapshot".to_string()]);
}

#[tokio::test]
async fn recovery_matrix_and_starting_run_no_longer_blocks_campaign() {
    let h = harness(true).await;
    seed(
        &h.f.pool,
        "INSERT INTO brightdata_runs (id,campaign_id,mode,input_json,snapshot_id,status,created_at,updated_at) VALUES
          (1,1,'post_url','{}',NULL,'starting','2026-09-30 11:00:00','2026-09-30 11:00:00');
         INSERT INTO brightdata_runs (id,campaign_id,mode,input_json,snapshot_id,status,created_at,updated_at) VALUES
          (2,2,'watchlist','{}','sd_recent','running','2026-09-30 10:00:00','2026-09-30 10:00:00');",
    )
    .await;

    // Campaign 1 was left `starting` by a crash: the next start recovers it.
    let ctx = h.ctx(Arc::new(Fake::default()), FAST);
    let run = start_run(&ctx, post_url_input(&[POST_1]), true)
        .await
        .unwrap();
    assert_eq!(run.status, "imported");
    assert_eq!(
        text(
            &h.f.pool,
            "SELECT status || ':' || error_message FROM brightdata_runs WHERE id = 1"
        )
        .await,
        format!("failed:{INTERRUPTED_ERROR}")
    );

    // A recent watchlist snapshot stays resumable.
    assert_eq!(
        recover_interrupted_runs(&h.f.pool, &h.activity, 2, NOW)
            .await
            .unwrap(),
        0
    );
    assert_eq!(
        text(&h.f.pool, "SELECT status FROM brightdata_runs WHERE id = 2").await,
        "running"
    );
    // While this process drives campaign 2, recovery leaves it alone even
    // after the resume window.
    let later = NOW + 25 * 60 * 60 * 1000;
    let slot = h.activity.try_start(2).unwrap();
    assert_eq!(
        recover_interrupted_runs(&h.f.pool, &h.activity, 2, later)
            .await
            .unwrap(),
        0
    );
    drop(slot);
    assert_eq!(
        recover_interrupted_runs(&h.f.pool, &h.activity, 2, later)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        text(
            &h.f.pool,
            "SELECT error_message FROM brightdata_runs WHERE id = 2"
        )
        .await,
        EXPIRED_ERROR
    );
    assert_eq!(
        number(
            &h.f.pool,
            "SELECT COUNT(*) FROM brightdata_runs WHERE status IN ('starting','running','ready')"
        )
        .await,
        0
    );
}
