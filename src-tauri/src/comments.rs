use serde::Deserialize;
use serde_json::json;
use sqlx::{Row, SqliteConnection, SqlitePool};
use tauri::State;

const COMMENT_STORAGE_ERROR: &str = "Comment attempt could not be recorded";
const DUPLICATE_COMMENT_ATTEMPT_ERROR: &str = "Comment attempt was already recorded";

fn comment_storage_error(error: sqlx::Error) -> String {
    match &error {
        sqlx::Error::Database(database_error) if database_error.is_unique_violation() => {
            DUPLICATE_COMMENT_ATTEMPT_ERROR.to_string()
        }
        _ => COMMENT_STORAGE_ERROR.to_string(),
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordCommentAttemptInput {
    pub comment_thread_id: i64,
    pub status: String,
    #[serde(default)]
    pub external_comment_url: String,
    #[serde(default)]
    pub platform_comment_id: String,
    #[serde(default)]
    pub idempotency_key: String,
    #[serde(default)]
    pub error_message: String,
}

pub(crate) struct ThreadState {
    pub(crate) campaign_id: i64,
    pub(crate) status: String,
    pub(crate) daily_comment_limit: i64,
}

pub(crate) struct LimitDecision {
    pub(crate) window_key: String,
    pub(crate) current_count: i64,
    pub(crate) summary: String,
    pub(crate) allowed: bool,
}

enum Settlement {
    Accepted(i64),
    Rejected(String),
}

pub(crate) async fn comment_limit_decision(
    connection: &mut SqliteConnection,
    thread: &ThreadState,
) -> Result<LimitDecision, String> {
    let window_key = sqlx::query_scalar::<_, String>("SELECT date('now')")
        .fetch_one(&mut *connection)
        .await
        .map_err(comment_storage_error)?;
    let current_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*)
         FROM comment_attempts ca
         INNER JOIN comment_threads ct ON ct.id = ca.comment_thread_id
         WHERE ct.campaign_id = ?1
           AND date(ca.created_at) = date('now')
           AND ca.status = 'succeeded'",
    )
    .bind(thread.campaign_id)
    .fetch_one(&mut *connection)
    .await
    .map_err(comment_storage_error)?;
    let allowed = current_count < thread.daily_comment_limit;
    let summary = if allowed {
        format!(
            "Comment allowed for {window_key}: {current_count}/{} used",
            thread.daily_comment_limit
        )
    } else {
        format!(
            "Daily comment limit reached for {window_key}: {current_count}/{} used",
            thread.daily_comment_limit
        )
    };
    Ok(LimitDecision {
        window_key,
        current_count,
        summary,
        allowed,
    })
}

pub(crate) async fn insert_rate_limit_event(
    connection: &mut SqliteConnection,
    thread: &ThreadState,
    decision: &LimitDecision,
    outcome: &str,
    summary: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO rate_limit_events (
            campaign_id, action, window_key, limit_value, current_count, decision, summary
         ) VALUES (?1, 'comment', ?2, ?3, ?4, ?5, ?6)",
    )
    .bind(thread.campaign_id)
    .bind(&decision.window_key)
    .bind(thread.daily_comment_limit)
    .bind(decision.current_count)
    .bind(outcome)
    .bind(summary)
    .execute(&mut *connection)
    .await
    .map_err(comment_storage_error)?;
    Ok(())
}

async fn upsert_failure_error(
    connection: &mut SqliteConnection,
    campaign_id: i64,
    thread_id: i64,
    detail: &str,
) -> Result<(), String> {
    let existing_id = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM error_queue_items
         WHERE source_type = 'manual' AND source_id = ?1
           AND status IN ('open', 'in_progress', 'awaiting_review')
         LIMIT 1",
    )
    .bind(thread_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(comment_storage_error)?;

    let (error_item_id, event_type, summary) = if let Some(id) = existing_id {
        sqlx::query(
            "UPDATE error_queue_items
             SET campaign_id = ?1, title = 'Comment attempt failed', detail = ?2,
                 severity = 'error', updated_at = datetime('now')
             WHERE id = ?3",
        )
        .bind(campaign_id)
        .bind(detail)
        .bind(id)
        .execute(&mut *connection)
        .await
        .map_err(comment_storage_error)?;
        (
            id,
            "error_item_updated",
            "Error item updated: Comment attempt failed",
        )
    } else {
        let id = sqlx::query(
            "INSERT INTO error_queue_items (
                campaign_id, source_type, source_id, title, detail, severity, status, updated_at
             ) VALUES (?1, 'manual', ?2, 'Comment attempt failed', ?3, 'error', 'open', datetime('now'))",
        )
        .bind(campaign_id)
        .bind(thread_id)
        .bind(detail)
        .execute(&mut *connection)
        .await
        .map_err(comment_storage_error)?
        .last_insert_rowid();
        (
            id,
            "error_item_created",
            "Error item created: Comment attempt failed",
        )
    };

    sqlx::query(
        "INSERT INTO safety_audit_events (
            campaign_id, subject_type, subject_id, event_type, severity, summary, metadata_json
         ) VALUES (?1, 'error_queue_item', ?2, ?3, 'warning', ?4, ?5)",
    )
    .bind(campaign_id)
    .bind(error_item_id)
    .bind(event_type)
    .bind(summary)
    .bind(json!({ "sourceType": "manual", "sourceId": thread_id }).to_string())
    .execute(&mut *connection)
    .await
    .map_err(comment_storage_error)?;
    Ok(())
}

async fn execute_record_comment_attempt(
    connection: &mut SqliteConnection,
    input: &RecordCommentAttemptInput,
) -> Result<Settlement, String> {
    if input.status != "succeeded" && input.status != "failed" {
        return Err("Comment attempt status must be succeeded or failed".to_string());
    }
    if !input.idempotency_key.is_empty() {
        let duplicate_exists = sqlx::query_scalar::<_, i64>(
            "SELECT EXISTS(SELECT 1 FROM comment_attempts WHERE idempotency_key = ?1)",
        )
        .bind(&input.idempotency_key)
        .fetch_one(&mut *connection)
        .await
        .map_err(comment_storage_error)?;
        if duplicate_exists == 1 {
            return Err(DUPLICATE_COMMENT_ATTEMPT_ERROR.to_string());
        }
    }

    let row = sqlx::query(
        "SELECT ct.campaign_id, ct.status, c.status AS campaign_status, c.daily_comment_limit
         FROM comment_threads ct
         INNER JOIN campaigns c ON c.id = ct.campaign_id
         WHERE ct.id = ?1 LIMIT 1",
    )
    .bind(input.comment_thread_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(comment_storage_error)?
    .ok_or_else(|| "Comment thread was not found".to_string())?;
    let campaign_status: String = row
        .try_get("campaign_status")
        .map_err(comment_storage_error)?;
    if campaign_status == "archived" {
        return Err("Campaign is archived".to_string());
    }
    let thread = ThreadState {
        campaign_id: row.try_get("campaign_id").map_err(comment_storage_error)?,
        status: row.try_get("status").map_err(comment_storage_error)?,
        daily_comment_limit: row
            .try_get("daily_comment_limit")
            .map_err(comment_storage_error)?,
    };
    if thread.status != "approved" {
        return Err("Only approved comments can record posting attempts".to_string());
    }

    if input.status == "succeeded" {
        let selected_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM comment_variants cv
             WHERE cv.comment_thread_id = ?1 AND cv.status = 'selected'
               AND NOT EXISTS (
                 SELECT 1 FROM comment_audits ca
                 WHERE ca.comment_variant_id = cv.id AND ca.severity = 'block'
               )",
        )
        .bind(input.comment_thread_id)
        .fetch_one(&mut *connection)
        .await
        .map_err(comment_storage_error)?;
        if selected_count == 0 {
            let any_selected = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM comment_variants WHERE comment_thread_id = ?1 AND status = 'selected'",
            )
            .bind(input.comment_thread_id)
            .fetch_one(&mut *connection)
            .await
            .map_err(comment_storage_error)?;
            return Err(if any_selected == 0 {
                "Choose one comment variant before review".to_string()
            } else {
                "Blocked comment variants cannot be reviewed".to_string()
            });
        }
        if selected_count > 1 {
            return Err("Choose exactly one selected comment variant".to_string());
        }

        sqlx::query("INSERT OR IGNORE INTO safety_settings (id) VALUES (1)")
            .execute(&mut *connection)
            .await
            .map_err(comment_storage_error)?;
        let settings = sqlx::query(
            "SELECT global_kill_switch, kill_switch_reason FROM safety_settings WHERE id = 1 LIMIT 1",
        )
        .fetch_one(&mut *connection)
        .await
        .map_err(comment_storage_error)?;
        let kill_switch: i64 = settings
            .try_get("global_kill_switch")
            .map_err(comment_storage_error)?;
        let kill_switch_reason: String = settings
            .try_get("kill_switch_reason")
            .map_err(comment_storage_error)?;
        let decision = comment_limit_decision(connection, &thread).await?;
        if kill_switch == 1 {
            let summary = if kill_switch_reason.is_empty() {
                "Comment posting blocked by global kill switch".to_string()
            } else {
                format!("Comment posting blocked by global kill switch: {kill_switch_reason}")
            };
            insert_rate_limit_event(connection, &thread, &decision, "blocked", &summary).await?;
            let error = if kill_switch_reason.is_empty() {
                "Global kill switch is enabled".to_string()
            } else {
                format!("Global kill switch is enabled: {kill_switch_reason}")
            };
            return Ok(Settlement::Rejected(error));
        }
        if !decision.allowed {
            insert_rate_limit_event(connection, &thread, &decision, "blocked", &decision.summary)
                .await?;
            return Ok(Settlement::Rejected(decision.summary));
        }
        insert_rate_limit_event(connection, &thread, &decision, "allowed", &decision.summary)
            .await?;
    }

    let attempt_id = sqlx::query(
        "INSERT INTO comment_attempts (
            comment_thread_id, platform, status, external_comment_url,
            platform_comment_id, idempotency_key, error_message
         ) VALUES (?1, 'linkedin', ?2, ?3, ?4, ?5, ?6)",
    )
    .bind(input.comment_thread_id)
    .bind(&input.status)
    .bind(&input.external_comment_url)
    .bind(&input.platform_comment_id)
    .bind(&input.idempotency_key)
    .bind(&input.error_message)
    .execute(&mut *connection)
    .await
    .map_err(comment_storage_error)?
    .last_insert_rowid();

    if input.status == "succeeded" {
        sqlx::query(
            "UPDATE comment_threads
             SET status = 'posted', posted_at = datetime('now'), updated_at = datetime('now')
             WHERE id = ?1",
        )
        .bind(input.comment_thread_id)
        .execute(&mut *connection)
        .await
        .map_err(comment_storage_error)?;
    } else {
        sqlx::query("UPDATE comment_threads SET updated_at = datetime('now') WHERE id = ?1")
            .bind(input.comment_thread_id)
            .execute(&mut *connection)
            .await
            .map_err(comment_storage_error)?;
        upsert_failure_error(
            connection,
            thread.campaign_id,
            input.comment_thread_id,
            &input.error_message,
        )
        .await?;
    }
    Ok(Settlement::Accepted(attempt_id))
}

async fn record_comment_attempt(
    pool: &SqlitePool,
    input: RecordCommentAttemptInput,
) -> Result<i64, String> {
    let mut connection = pool.acquire().await.map_err(comment_storage_error)?;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *connection)
        .await
        .map_err(comment_storage_error)?;

    match execute_record_comment_attempt(&mut connection, &input).await {
        Ok(settlement) => {
            if let Err(error) = sqlx::query("COMMIT").execute(&mut *connection).await {
                let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                return Err(comment_storage_error(error));
            }
            match settlement {
                Settlement::Accepted(attempt_id) => Ok(attempt_id),
                Settlement::Rejected(error) => Err(error),
            }
        }
        Err(error) => {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn linkgo_comment_record_attempt(
    pool: State<'_, SqlitePool>,
    input: RecordCommentAttemptInput,
) -> Result<i64, String> {
    record_comment_attempt(pool.inner(), input).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use sqlx::Executor;
    use std::str::FromStr;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::Duration;

    static DATABASE_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    async fn test_pool() -> SqlitePool {
        let sequence = DATABASE_SEQUENCE.fetch_add(1, Ordering::SeqCst);
        let url = format!("sqlite:file:comments-{sequence}?mode=memory&cache=shared");
        let options = SqliteConnectOptions::from_str(&url)
            .unwrap()
            .busy_timeout(Duration::from_secs(5));
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect_with(options)
            .await
            .unwrap();
        pool.execute(
            "CREATE TABLE campaigns (id INTEGER PRIMARY KEY, status TEXT NOT NULL, daily_comment_limit INTEGER NOT NULL);
             CREATE TABLE comment_threads (id INTEGER PRIMARY KEY, campaign_id INTEGER NOT NULL, status TEXT NOT NULL, posted_at TEXT, updated_at TEXT NOT NULL DEFAULT 'original');
             CREATE TABLE comment_variants (id INTEGER PRIMARY KEY, comment_thread_id INTEGER NOT NULL, status TEXT NOT NULL);
             CREATE TABLE comment_audits (id INTEGER PRIMARY KEY, comment_variant_id INTEGER NOT NULL, severity TEXT NOT NULL);
             CREATE TABLE comment_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, comment_thread_id INTEGER NOT NULL, platform TEXT NOT NULL, status TEXT NOT NULL, external_comment_url TEXT NOT NULL, platform_comment_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, error_message TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
             CREATE UNIQUE INDEX unique_attempt_key ON comment_attempts(idempotency_key) WHERE idempotency_key <> '';
             CREATE TABLE safety_settings (id INTEGER PRIMARY KEY, global_kill_switch INTEGER NOT NULL DEFAULT 0, kill_switch_reason TEXT NOT NULL DEFAULT '');
             CREATE TABLE rate_limit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER NOT NULL, action TEXT NOT NULL, window_key TEXT NOT NULL, limit_value INTEGER NOT NULL, current_count INTEGER NOT NULL, decision TEXT NOT NULL, summary TEXT NOT NULL);
             CREATE TABLE error_queue_items (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER, source_type TEXT NOT NULL, source_id INTEGER, title TEXT NOT NULL, detail TEXT NOT NULL, severity TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT);
             CREATE TABLE safety_audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER, subject_type TEXT NOT NULL, subject_id INTEGER, event_type TEXT NOT NULL, severity TEXT NOT NULL, summary TEXT NOT NULL, metadata_json TEXT NOT NULL);",
        )
        .await
        .unwrap();
        pool
    }

    async fn seed_approved(pool: &SqlitePool) {
        pool.execute("INSERT INTO campaigns VALUES (1, 'active', 5)")
            .await
            .unwrap();
        pool.execute(
            "INSERT INTO comment_threads (id, campaign_id, status) VALUES (1, 1, 'approved')",
        )
        .await
        .unwrap();
        pool.execute("INSERT INTO comment_variants VALUES (1, 1, 'selected')")
            .await
            .unwrap();
    }

    fn input(status: &str) -> RecordCommentAttemptInput {
        RecordCommentAttemptInput {
            comment_thread_id: 1,
            status: status.to_string(),
            external_comment_url: "https://www.linkedin.com/feed/update/test".to_string(),
            platform_comment_id: "comment-1".to_string(),
            idempotency_key: "comment-thread:1:linkedin:manual".to_string(),
            error_message: if status == "failed" {
                "network error"
            } else {
                ""
            }
            .to_string(),
        }
    }

    async fn count(pool: &SqlitePool, table: &str) -> i64 {
        sqlx::query_scalar::<_, i64>(&format!("SELECT COUNT(*) FROM {table}"))
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn successful_attempt_commits_complete_snapshot() {
        let pool = test_pool().await;
        seed_approved(&pool).await;
        record_comment_attempt(&pool, input("succeeded"))
            .await
            .unwrap();

        assert_eq!(count(&pool, "comment_attempts").await, 1);
        assert_eq!(count(&pool, "rate_limit_events").await, 1);
        assert_eq!(count(&pool, "error_queue_items").await, 0);
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT status FROM comment_threads WHERE id = 1")
                .fetch_one(&pool)
                .await
                .unwrap(),
            "posted"
        );
    }

    #[tokio::test]
    async fn final_success_write_failure_rolls_back_snapshot() {
        let pool = test_pool().await;
        seed_approved(&pool).await;
        pool.execute("CREATE TRIGGER abort_post BEFORE UPDATE ON comment_threads WHEN NEW.status = 'posted' BEGIN SELECT RAISE(ABORT, 'injected final success failure'); END;")
            .await
            .unwrap();

        assert_eq!(
            record_comment_attempt(&pool, input("succeeded"))
                .await
                .unwrap_err(),
            COMMENT_STORAGE_ERROR
        );
        assert_eq!(count(&pool, "comment_attempts").await, 0);
        assert_eq!(count(&pool, "rate_limit_events").await, 0);
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT status FROM comment_threads WHERE id = 1")
                .fetch_one(&pool)
                .await
                .unwrap(),
            "approved"
        );
    }

    #[tokio::test]
    async fn late_failure_audit_write_rolls_back_snapshot() {
        let pool = test_pool().await;
        seed_approved(&pool).await;
        pool.execute("CREATE TRIGGER abort_error_audit BEFORE INSERT ON safety_audit_events BEGIN SELECT RAISE(ABORT, 'injected late audit failure'); END;")
            .await
            .unwrap();

        assert_eq!(
            record_comment_attempt(&pool, input("failed"))
                .await
                .unwrap_err(),
            COMMENT_STORAGE_ERROR
        );
        assert_eq!(count(&pool, "comment_attempts").await, 0);
        assert_eq!(count(&pool, "error_queue_items").await, 0);
        assert_eq!(count(&pool, "safety_audit_events").await, 0);
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT updated_at FROM comment_threads WHERE id = 1")
                .fetch_one(&pool)
                .await
                .unwrap(),
            "original"
        );
    }

    #[tokio::test]
    async fn duplicate_idempotency_key_returns_stable_error_and_rolls_back() {
        let pool = test_pool().await;
        seed_approved(&pool).await;
        pool.execute("INSERT INTO comment_attempts (comment_thread_id, platform, status, external_comment_url, platform_comment_id, idempotency_key, error_message) VALUES (1, 'linkedin', 'failed', '', '', 'comment-thread:1:linkedin:manual', 'prior failure')")
            .await
            .unwrap();

        assert_eq!(
            record_comment_attempt(&pool, input("succeeded"))
                .await
                .unwrap_err(),
            DUPLICATE_COMMENT_ATTEMPT_ERROR
        );
        assert_eq!(count(&pool, "comment_attempts").await, 1);
        assert_eq!(count(&pool, "rate_limit_events").await, 0);
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT status FROM comment_threads WHERE id = 1")
                .fetch_one(&pool)
                .await
                .unwrap(),
            "approved"
        );
    }

    #[tokio::test]
    async fn concurrent_success_has_one_winner() {
        let pool = test_pool().await;
        seed_approved(&pool).await;
        let first_pool = pool.clone();
        let second_pool = pool.clone();
        let first =
            tokio::spawn(
                async move { record_comment_attempt(&first_pool, input("succeeded")).await },
            );
        let second =
            tokio::spawn(
                async move { record_comment_attempt(&second_pool, input("succeeded")).await },
            );
        let results = [first.await.unwrap(), second.await.unwrap()];

        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert!(results
            .iter()
            .filter_map(|result| result.as_ref().err())
            .any(|error| error == DUPLICATE_COMMENT_ATTEMPT_ERROR));
        assert_eq!(count(&pool, "comment_attempts").await, 1);
        assert_eq!(count(&pool, "rate_limit_events").await, 1);
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT status FROM comment_threads WHERE id = 1")
                .fetch_one(&pool)
                .await
                .unwrap(),
            "posted"
        );
    }
}
