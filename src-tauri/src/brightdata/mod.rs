//! Bright Data read-only source connector. See
//! `docs/security/brightdata-connector-review.md`.
//!
//! Manual runs only: every run-starting or resuming command checks the
//! default-off enable flag, the global kill switch, the campaign, the API
//! key, the caps and the one-active-run rule, and fails closed. Results go
//! through the existing Source Imports writer (`connector_key = brightdata`).

pub(crate) mod cli;
pub(crate) mod commands;
pub(crate) mod direct;
pub(crate) mod mapping;
pub(crate) mod recovery;
pub(crate) mod runs;
pub(crate) mod store;
pub(crate) mod watchlist;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// Conservative caps until live metrics prove quality.
pub(crate) const MAX_POSTS_PER_RUN: usize = 20;
pub(crate) const MAX_WATCHLIST_ENTRIES_PER_RUN: usize = 10;
pub(crate) const MAX_RUNS_PER_CAMPAIGN_PER_DAY: i64 = 5;
pub(crate) const DEFAULT_WINDOW_DAYS: i64 = 7;
pub(crate) const MAX_WINDOW_DAYS: i64 = 30;
pub(crate) const PROVIDER_KEY: &str = "brightdata";
/// Review state shipped with this build; see the review document.
pub(crate) const REVIEW_STATUS: &str = "signed_off";

/// How a run finds LinkedIn posts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RunMode {
    PostUrl,
    Watchlist,
}

impl RunMode {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            RunMode::PostUrl => "post_url",
            RunMode::Watchlist => "watchlist",
        }
    }
}

/// Campaigns with a Bright Data run (or recovery) executing in this process,
/// each with its cancel flag.
#[derive(Clone, Default)]
pub struct BrightDataActivity {
    active: Arc<Mutex<HashMap<i64, Arc<AtomicBool>>>>,
}

impl BrightDataActivity {
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<i64, Arc<AtomicBool>>> {
        self.active
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    /// Claims the campaign's slot; `None` when something already holds it.
    pub(crate) fn try_start(&self, campaign_id: i64) -> Option<ActiveRun> {
        let mut active = self.lock();
        if active.contains_key(&campaign_id) {
            return None;
        }
        let cancel = Arc::new(AtomicBool::new(false));
        active.insert(campaign_id, Arc::clone(&cancel));
        Some(ActiveRun {
            activity: self.clone(),
            campaign_id,
            cancel,
        })
    }

    pub(crate) fn is_active(&self, campaign_id: i64) -> bool {
        self.lock().contains_key(&campaign_id)
    }

    /// Signals the in-process run to stop. Returns false when none is active.
    pub(crate) fn signal_cancel(&self, campaign_id: i64) -> bool {
        match self.lock().get(&campaign_id) {
            Some(flag) => {
                flag.store(true, Ordering::SeqCst);
                true
            }
            None => false,
        }
    }
}

/// Releases the campaign's slot on every exit path.
pub(crate) struct ActiveRun {
    activity: BrightDataActivity,
    campaign_id: i64,
    cancel: Arc<AtomicBool>,
}

impl ActiveRun {
    pub(crate) fn cancel_flag(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.cancel)
    }
}

impl Drop for ActiveRun {
    fn drop(&mut self) {
        self.activity.lock().remove(&self.campaign_id);
    }
}
