//! Interrupted-run recovery, mirroring `source_imports::recover_interrupted`.
//!
//! A run whose campaign is not being driven by this process was interrupted
//! (app closed or crashed). CLI runs cannot be resumed and fail. Watchlist
//! runs with a snapshot id stay resumable for 24 hours; Bright Data keeps the
//! snapshot server-side and the run continues by snapshot id. Recovery holds
//! the campaign's in-process activity slot so a run cannot start mid-recovery.

use sqlx::{Row, SqlitePool};

use super::store::{parse_sql_time_ms, sql_time, ACTIVE_STATUSES, STORAGE_ERROR};
use super::{ActiveRun, BrightDataActivity, RunMode};

pub(crate) const INTERRUPTED_ERROR: &str = "Interrupted when the app closed";
pub(crate) const NO_SNAPSHOT_ERROR: &str = "Interrupted before Bright Data accepted the request";
pub(crate) const EXPIRED_ERROR: &str = "Bright Data results were not collected within 24 hours";
pub(crate) const RESUME_WINDOW_MS: i64 = 24 * 60 * 60 * 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RecoveryAction {
    Keep,
    Fail(&'static str),
}

/// Pure decision for one active-status run not driven by this process.
pub(crate) fn recovery_action(
    mode: &str,
    has_snapshot: bool,
    updated_at_ms: Option<i64>,
    now_ms: i64,
) -> RecoveryAction {
    if mode != RunMode::Watchlist.as_str() {
        return RecoveryAction::Fail(INTERRUPTED_ERROR);
    }
    if !has_snapshot {
        return RecoveryAction::Fail(NO_SNAPSHOT_ERROR);
    }
    match updated_at_ms {
        Some(updated) if now_ms - updated <= RESUME_WINDOW_MS => RecoveryAction::Keep,
        _ => RecoveryAction::Fail(EXPIRED_ERROR),
    }
}

/// Recovers while the caller already holds the campaign's activity slot.
pub(crate) async fn recover_locked(
    pool: &SqlitePool,
    _slot: &ActiveRun,
    campaign_id: i64,
    now_ms: i64,
) -> Result<i64, String> {
    let rows = sqlx::query(&format!(
        "SELECT id, mode, snapshot_id, updated_at FROM brightdata_runs
         WHERE campaign_id = ?1 AND status IN {ACTIVE_STATUSES} ORDER BY id ASC"
    ))
    .bind(campaign_id)
    .fetch_all(pool)
    .await
    .map_err(|_| STORAGE_ERROR.to_string())?;
    let mut recovered = 0;
    for row in rows {
        let mode: String = row.get("mode");
        let snapshot_id: Option<String> = row.get("snapshot_id");
        let updated_at: String = row.get("updated_at");
        let action = recovery_action(
            &mode,
            snapshot_id.is_some(),
            parse_sql_time_ms(&updated_at),
            now_ms,
        );
        if let RecoveryAction::Fail(message) = action {
            sqlx::query(&format!(
                "UPDATE brightdata_runs SET status = 'failed', error_message = ?2, updated_at = ?3
                 WHERE id = ?1 AND status IN {ACTIVE_STATUSES}"
            ))
            .bind(row.get::<i64, _>("id"))
            .bind(message)
            .bind(sql_time(now_ms))
            .execute(pool)
            .await
            .map_err(|_| STORAGE_ERROR.to_string())?;
            recovered += 1;
        }
    }
    Ok(recovered)
}

/// Recovers a campaign's interrupted runs unless this process is driving
/// one right now. Returns how many runs were failed.
pub(crate) async fn recover_interrupted_runs(
    pool: &SqlitePool,
    activity: &BrightDataActivity,
    campaign_id: i64,
    now_ms: i64,
) -> Result<i64, String> {
    let Some(slot) = activity.try_start(campaign_id) else {
        return Ok(0);
    };
    recover_locked(pool, &slot, campaign_id, now_ms).await
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_790_000_000_000;
    const HOUR: i64 = 60 * 60 * 1000;

    #[test]
    fn decision_matrix() {
        let cases = [
            (
                "post_url",
                true,
                Some(NOW),
                RecoveryAction::Fail(INTERRUPTED_ERROR),
            ),
            (
                "post_url",
                false,
                Some(NOW),
                RecoveryAction::Fail(INTERRUPTED_ERROR),
            ),
            (
                "keyword",
                false,
                Some(NOW),
                RecoveryAction::Fail(INTERRUPTED_ERROR),
            ),
            (
                "watchlist",
                false,
                Some(NOW),
                RecoveryAction::Fail(NO_SNAPSHOT_ERROR),
            ),
            ("watchlist", true, Some(NOW - HOUR), RecoveryAction::Keep),
            (
                "watchlist",
                true,
                Some(NOW - 24 * HOUR),
                RecoveryAction::Keep,
            ),
            (
                "watchlist",
                true,
                Some(NOW - 25 * HOUR),
                RecoveryAction::Fail(EXPIRED_ERROR),
            ),
            ("watchlist", true, None, RecoveryAction::Fail(EXPIRED_ERROR)),
        ];
        for (mode, has_snapshot, updated, expected) in cases {
            assert_eq!(
                recovery_action(mode, has_snapshot, updated, NOW),
                expected,
                "{mode} snapshot={has_snapshot} updated={updated:?}"
            );
        }
    }
}
