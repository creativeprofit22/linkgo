//! Live smoke test against the real Bright Data API (paid). Ignored by
//! default; run only after the connector review is signed off:
//!
//! ```text
//! LINKGO_BRIGHTDATA_LIVE=1 cargo test --lib brightdata::commands::live_smoke -- --ignored --nocapture
//! ```
//!
//! Uses the key saved in the OS keyring (production service `linkgo`), the
//! real CLI and HTTPS transport, the real mapping and Source Imports writer,
//! against a throwaway migrated database. Spend is capped at 3 records per
//! mode by the recording wrapper. Raw responses are written to
//! `target/brightdata-live/` (git-ignored) for fixture sanitization; only
//! counts and field names are printed.

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

use super::LiveTransport;
use crate::auth::storage::AuthStorage;
use crate::auth::StoredCredential;
use crate::brightdata::direct::{DirectError, Download, SnapshotStatus, WatchKind};
use crate::brightdata::runs::{
    start_run, RunContext, RunRequest, StartRunInput, Timing, Transport,
};
use crate::brightdata::{BrightDataActivity, PROVIDER_KEY};
use crate::source_imports::SourceImportActivity;
use crate::test_support::{migrated, seed};

const SMOKE_RECORD_CAP: usize = 3;
const WATCH_COMPANY: &str = "https://www.linkedin.com/company/bright-data";

struct Recording {
    inner: LiveTransport,
    dir: PathBuf,
    counter: Mutex<usize>,
}

impl Recording {
    fn save(&self, name: &str, value: &Value) {
        let mut counter = self.counter.lock().unwrap();
        *counter += 1;
        let path = self.dir.join(format!("{:02}_{name}.json", *counter));
        std::fs::write(path, serde_json::to_string_pretty(value).unwrap()).unwrap();
    }
}

impl Transport for Recording {
    fn check_cli(&self, cancel: &Arc<AtomicBool>) -> Result<(), String> {
        self.inner.check_cli(cancel)
    }

    fn collect_post(&self, post_url: &str, cancel: &Arc<AtomicBool>) -> Result<Vec<Value>, String> {
        let result = self.inner.collect_post(post_url, cancel);
        match &result {
            Ok(records) => self.save("cli_pipelines_linkedin_posts", &json!(records)),
            Err(error) => self.save("cli_pipelines_error", &json!({ "error": error })),
        }
        result
    }

    fn trigger(
        &self,
        kind: WatchKind,
        urls: &[String],
        start_date: &str,
        end_date: &str,
        _limit_per_input: usize,
    ) -> Result<String, DirectError> {
        let result = self
            .inner
            .trigger(kind, urls, start_date, end_date, SMOKE_RECORD_CAP);
        self.save(
            "direct_trigger",
            &json!({ "ok": result.as_ref().ok(), "error": result.as_ref().err().map(DirectError::message) }),
        );
        result
    }

    fn progress(&self, snapshot_id: &str) -> Result<SnapshotStatus, DirectError> {
        let result = self.inner.progress(snapshot_id);
        self.save(
            "direct_progress",
            &json!({ "status": format!("{:?}", result.as_ref().ok()), "error": result.as_ref().err().map(DirectError::message) }),
        );
        result
    }

    fn download(&self, snapshot_id: &str) -> Result<Download, DirectError> {
        let result = self.inner.download(snapshot_id);
        match &result {
            Ok(Download::Records(records)) => self.save("direct_snapshot", &json!(records)),
            Ok(Download::NotReady) => self.save("direct_snapshot_not_ready", &json!({})),
            Err(error) => self.save(
                "direct_snapshot_error",
                &json!({ "error": error.message() }),
            ),
        }
        result
    }

    fn cancel_snapshot(&self, snapshot_id: &str) -> Result<(), DirectError> {
        self.inner.cancel_snapshot(snapshot_id)
    }
}

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

async fn report(
    pool: &sqlx::SqlitePool,
    label: &str,
    run: &crate::brightdata::store::BrightDataRunRecord,
) {
    println!(
        "[{label}] status={} requested={} rows={} batch={:?} error={:?}",
        run.status,
        run.requested_count,
        run.row_count,
        run.source_import_batch_id,
        run.error_message
    );
    if let Some(batch_id) = run.source_import_batch_id {
        let counts: (String, i64, i64, i64, i64) = sqlx::query_as(
            "SELECT status, total_count, accepted_count, duplicate_count, rejected_count FROM source_import_batches WHERE id = ?1",
        )
        .bind(batch_id)
        .fetch_one(pool)
        .await
        .unwrap();
        println!("[{label}] batch status/total/accepted/duplicate/rejected = {counts:?}");
        let reasons: Vec<(String,)> = sqlx::query_as(
            "SELECT DISTINCT reason FROM source_import_items WHERE source_import_batch_id = ?1 AND reason <> ''",
        )
        .bind(batch_id)
        .fetch_all(pool)
        .await
        .unwrap_or_default();
        for (reason,) in reasons {
            println!("[{label}] item reason: {reason}");
        }
    }
}

#[tokio::test]
#[ignore = "paid live Bright Data call; set LINKGO_BRIGHTDATA_LIVE=1"]
async fn live_smoke() {
    if std::env::var("LINKGO_BRIGHTDATA_LIVE").as_deref() != Ok("1") {
        println!("LINKGO_BRIGHTDATA_LIVE is not 1; skipping");
        return;
    }
    let api_key = match AuthStorage::for_keyring_service("linkgo")
        .load(PROVIDER_KEY)
        .unwrap()
    {
        Some(StoredCredential::ApiKey(credentials)) => credentials.api_key,
        _ => panic!("No Bright Data API key in the keyring"),
    };
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/brightdata-live");
    std::fs::create_dir_all(&dir).unwrap();
    let recording = Arc::new(Recording {
        inner: LiveTransport { api_key },
        dir,
        counter: Mutex::new(0),
    });

    let f = migrated().await;
    seed(
        &f.pool,
        "INSERT INTO campaigns (id,name,status,daily_post_limit) VALUES (1,'Smoke','active',5);
         UPDATE app_settings SET brightdata_connector_enabled = 1 WHERE id = 1;
         UPDATE safety_settings SET global_kill_switch = 0 WHERE id = 1;",
    )
    .await;
    let activity = BrightDataActivity::default();
    let source_activity = SourceImportActivity::default();
    let ctx = RunContext {
        pool: &f.pool,
        activity: &activity,
        source_activity: &source_activity,
        transport: recording.clone(),
        timing: Timing::LIVE,
        now_ms: now,
    };

    // 1. Post URL: one public post passed in the environment.
    if let Ok(first) = std::env::var("LINKGO_BRIGHTDATA_POST_URL") {
        let post = start_run(
            &ctx,
            StartRunInput {
                campaign_id: 1,
                request: RunRequest::PostUrl {
                    post_urls: vec![first.clone()],
                },
            },
            true,
        )
        .await;
        match &post {
            Ok(run) => report(&f.pool, "post_url", run).await,
            Err(error) => println!("[post_url] refused: {error}"),
        }
    } else {
        println!("[post_url] skipped: set LINKGO_BRIGHTDATA_POST_URL");
    }

    // 2. Watchlist: one public company page, direct HTTPS.
    if std::env::var("LINKGO_BRIGHTDATA_SKIP_WATCHLIST").as_deref() == Ok("1") {
        println!("[watchlist] skipped by LINKGO_BRIGHTDATA_SKIP_WATCHLIST");
        return;
    }
    seed(
        &f.pool,
        &format!(
            "INSERT INTO source_watchlist_entries (campaign_id,kind,url,label) VALUES (1,'company','{WATCH_COMPANY}','Bright Data');"
        ),
    )
    .await;
    let watch = start_run(
        &ctx,
        StartRunInput {
            campaign_id: 1,
            request: RunRequest::Watchlist {
                kind: "company".to_string(),
                entry_ids: None,
                days: Some(30),
            },
        },
        true,
    )
    .await;
    match &watch {
        Ok(run) => report(&f.pool, "watchlist", run).await,
        Err(error) => println!("[watchlist] refused: {error}"),
    }
}
