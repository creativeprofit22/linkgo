use serde::Deserialize;
use serde_json::json;
use sqlx::{Row, SqliteConnection, SqlitePool};
use tauri::State;

use crate::approval_review::{is_ready_at_revision, STALE_APPROVAL_ERROR};

const STORAGE_ERROR: &str = "Could not record publish attempt";
const MAX_EXTERNAL_POST_URL_CHARS: usize = 1000;
const MAX_PLATFORM_POST_ID_CHARS: usize = 200;
const MAX_ERROR_MESSAGE_CHARS: usize = 1000;

/// Mirrors `recordPublishAttemptSchema` in `src/features/approvals/schemas.ts`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecordPublishAttemptInput {
    pub approval_id: i64,
    pub schedule_job_id: Option<i64>,
    pub status: String,
    #[serde(default)]
    pub external_post_url: String,
    #[serde(default)]
    pub platform_post_id: String,
    #[serde(default)]
    pub error_message: String,
}

/// Normalized, validated publish attempt: ids positive, strings trimmed and
/// bounded, and success/failure evidence present.
#[derive(Debug)]
pub(crate) struct ValidPublishAttempt {
    approval_id: i64,
    schedule_job_id: Option<i64>,
    status: &'static str,
    external_post_url: String,
    platform_post_id: String,
    error_message: String,
}

fn bounded_text(value: &str, max: usize, label: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.chars().count() > max {
        return Err(format!("{label} must be {max} characters or fewer"));
    }
    Ok(trimmed.to_string())
}

pub(crate) fn validate_record_publish_attempt(
    input: RecordPublishAttemptInput,
) -> Result<ValidPublishAttempt, String> {
    if input.approval_id <= 0 {
        return Err("Approval id must be a positive integer".to_string());
    }
    if matches!(input.schedule_job_id, Some(id) if id <= 0) {
        return Err("Schedule job id must be a positive integer".to_string());
    }
    let status = match input.status.as_str() {
        "succeeded" => "succeeded",
        "failed" => "failed",
        _ => return Err("Publish attempt status must be succeeded or failed".to_string()),
    };
    let external_post_url = bounded_text(
        &input.external_post_url,
        MAX_EXTERNAL_POST_URL_CHARS,
        "LinkedIn post URL",
    )?;
    if !(external_post_url.is_empty()
        || external_post_url.starts_with("https://www.linkedin.com/")
        || external_post_url.starts_with("https://linkedin.com/"))
    {
        return Err("LinkedIn post URL must start with https://www.linkedin.com/".to_string());
    }
    let platform_post_id = bounded_text(
        &input.platform_post_id,
        MAX_PLATFORM_POST_ID_CHARS,
        "Platform post ID",
    )?;
    let error_message = bounded_text(
        &input.error_message,
        MAX_ERROR_MESSAGE_CHARS,
        "Failure reason",
    )?;
    if status == "failed" && error_message.is_empty() {
        return Err("Failure reason is required for failed attempts".to_string());
    }
    if status == "succeeded" && external_post_url.is_empty() && platform_post_id.is_empty() {
        return Err("LinkedIn URL or platform post ID is required for success".to_string());
    }
    Ok(ValidPublishAttempt {
        approval_id: input.approval_id,
        schedule_job_id: input.schedule_job_id,
        status,
        external_post_url,
        platform_post_id,
        error_message,
    })
}

/// How strictly a publish attempt is gated. `Operator` records what a person
/// reports and enforces every gate. `RemoteConfirmed` settles a LinkedIn call
/// the publishing service already made: the attempt row is always written,
/// because refusing it would hide a post that really exists.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum PublishRecordMode {
    Operator,
    RemoteConfirmed,
}

struct ApprovalState {
    id: i64,
    campaign_id: i64,
    status: String,
    reviewed_content_revision: Option<i64>,
}

pub(crate) async fn execute_record_publish_attempt(
    connection: &mut SqliteConnection,
    input: &ValidPublishAttempt,
    mode: PublishRecordMode,
) -> Result<i64, String> {
    let row = sqlx::query(
        "SELECT a.id, a.campaign_id, c.status AS campaign_status, a.status,
                a.reviewed_content_revision
         FROM approvals a
         INNER JOIN campaigns c ON c.id = a.campaign_id
         WHERE a.id = ?1
         LIMIT 1",
    )
    .bind(input.approval_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "Approval was not found".to_string())?;

    let campaign_status: String = row
        .try_get("campaign_status")
        .map_err(|error| error.to_string())?;
    let approval = ApprovalState {
        id: row.try_get("id").map_err(|error| error.to_string())?,
        campaign_id: row
            .try_get("campaign_id")
            .map_err(|error| error.to_string())?,
        status: row.try_get("status").map_err(|error| error.to_string())?,
        reviewed_content_revision: row
            .try_get("reviewed_content_revision")
            .map_err(|error| error.to_string())?,
    };

    let operator = mode == PublishRecordMode::Operator;
    if operator {
        crate::publishing::store::ensure_no_open_execution(
            connection,
            crate::publishing::types::ExecutionKind::Post,
            input.approval_id,
        )
        .await?;
    }
    if campaign_status == "archived" && operator {
        return Err("Campaign is archived".to_string());
    }
    if operator
        && !matches!(
            approval.status.as_str(),
            "approved" | "scheduled" | "published"
        )
    {
        return Err(
            "Only approved, scheduled, or published posts can record publish attempts".to_string(),
        );
    }
    if approval.status == "published" && input.status != "failed" {
        return Err("Published approvals can only record failed follow-up attempts".to_string());
    }

    if let Some(schedule_job_id) = input.schedule_job_id {
        let schedule_approval_id = sqlx::query_scalar::<_, i64>(
            "SELECT approval_id FROM schedule_jobs WHERE id = ?1 LIMIT 1",
        )
        .bind(schedule_job_id)
        .fetch_optional(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;
        if schedule_approval_id != Some(input.approval_id) {
            return Err("Schedule job was not found".to_string());
        }
    }

    // Readiness gate, checked before any write. A success requires the variant
    // to still be ready at the reviewed revision (the `published` transition
    // trigger requires it too), so the operator gets a domain error rather
    // than a storage failure. A failure is always recorded so it stays visible
    // in the error queue; if the approval is no longer ready it is revoked to
    // `changes_requested` instead of returned to `approved`, which the
    // transition trigger would refuse.
    let ready = approval.status == "published"
        || is_ready_at_revision(
            connection,
            approval.id,
            approval.reviewed_content_revision,
            STORAGE_ERROR,
        )
        .await?;
    if input.status == "succeeded" && !ready && operator {
        return Err(STALE_APPROVAL_ERROR.to_string());
    }
    // A confirmed remote post whose approval went stale mid-flight cannot be
    // marked `published` (the transition trigger refuses), so the attempt row
    // records the truth and the approval is left for the operator.
    let can_transition = matches!(
        approval.status.as_str(),
        "approved" | "scheduled" | "published"
    );

    let attempt_id = sqlx::query(
        "INSERT INTO publish_attempts (
            approval_id, schedule_job_id, platform, status, external_post_url,
            platform_post_id, error_message
         ) VALUES (?1, ?2, 'linkedin', ?3, ?4, ?5, ?6)",
    )
    .bind(input.approval_id)
    .bind(input.schedule_job_id)
    .bind(input.status)
    .bind(&input.external_post_url)
    .bind(&input.platform_post_id)
    .bind(&input.error_message)
    .execute(&mut *connection)
    .await
    .map_err(|error| error.to_string())?
    .last_insert_rowid();

    if input.status == "succeeded" {
        if ready && can_transition {
            sqlx::query(
                "UPDATE approvals SET status = 'published', updated_at = datetime('now') WHERE id = ?1",
            )
            .bind(input.approval_id)
            .execute(&mut *connection)
            .await
            .map_err(|error| error.to_string())?;
        }
        if let Some(schedule_job_id) = input.schedule_job_id {
            sqlx::query(
                "UPDATE schedule_jobs SET status = 'completed', updated_at = datetime('now') WHERE id = ?1",
            )
            .bind(schedule_job_id)
            .execute(&mut *connection)
            .await
            .map_err(|error| error.to_string())?;
        }
    } else if can_transition && approval.status != "published" {
        sqlx::query("UPDATE approvals SET status = ?2, updated_at = datetime('now') WHERE id = ?1")
            .bind(input.approval_id)
            .bind(if ready {
                "approved"
            } else {
                "changes_requested"
            })
            .execute(&mut *connection)
            .await
            .map_err(|error| error.to_string())?;
        if let Some(schedule_job_id) = input.schedule_job_id {
            sqlx::query(
                "UPDATE schedule_jobs SET status = 'failed', updated_at = datetime('now') WHERE id = ?1",
            )
            .bind(schedule_job_id)
            .execute(&mut *connection)
            .await
            .map_err(|error| error.to_string())?;
        }
    }

    let publish_event_type = if input.status == "succeeded" {
        "publish_succeeded"
    } else {
        "publish_failed"
    };
    let publish_summary = if input.status == "succeeded" {
        "Publish attempt succeeded"
    } else {
        "Publish attempt failed"
    };
    let metadata = json!({
        "approvalId": approval.id,
        "scheduleJobId": input.schedule_job_id,
        "errorMessage": input.error_message,
    })
    .to_string();
    sqlx::query(
        "INSERT INTO safety_audit_events (
            campaign_id, subject_type, subject_id, event_type, severity, summary, metadata_json
         ) VALUES (?1, 'publish_attempt', ?2, ?3, ?4, ?5, ?6)",
    )
    .bind(approval.campaign_id)
    .bind(attempt_id)
    .bind(publish_event_type)
    .bind(if input.status == "succeeded" {
        "info"
    } else {
        "warning"
    })
    .bind(publish_summary)
    .bind(metadata)
    .execute(&mut *connection)
    .await
    .map_err(|error| error.to_string())?;

    if input.status == "failed" {
        let error_item_id = sqlx::query(
            "INSERT INTO error_queue_items (
                campaign_id, source_type, source_id, title, detail, severity, status, updated_at
             ) VALUES (?1, 'publish_attempt', ?2, 'Publish attempt failed', ?3, 'error', 'open', datetime('now'))",
        )
        .bind(approval.campaign_id)
        .bind(attempt_id)
        .bind(&input.error_message)
        .execute(&mut *connection)
        .await
        .map_err(|error| error.to_string())?
        .last_insert_rowid();

        let error_metadata = json!({
            "sourceType": "publish_attempt",
            "sourceId": attempt_id,
        })
        .to_string();
        sqlx::query(
            "INSERT INTO safety_audit_events (
                campaign_id, subject_type, subject_id, event_type, severity, summary, metadata_json
             ) VALUES (?1, 'error_queue_item', ?2, 'error_item_created', 'warning',
                'Error item created: Publish attempt failed', ?3)",
        )
        .bind(approval.campaign_id)
        .bind(error_item_id)
        .bind(error_metadata)
        .execute(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;
    }

    Ok(attempt_id)
}

pub(crate) async fn record_publish_attempt(
    pool: &SqlitePool,
    input: RecordPublishAttemptInput,
) -> Result<i64, String> {
    let input = validate_record_publish_attempt(input)?;
    let mut connection = pool.acquire().await.map_err(|error| error.to_string())?;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;

    match execute_record_publish_attempt(&mut connection, &input, PublishRecordMode::Operator).await
    {
        Ok(attempt_id) => {
            if let Err(error) = sqlx::query("COMMIT").execute(&mut *connection).await {
                let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                Err(error.to_string())
            } else {
                Ok(attempt_id)
            }
        }
        Err(error) => {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn linkgo_approval_record_publish_attempt(
    pool: State<'_, SqlitePool>,
    input: RecordPublishAttemptInput,
) -> Result<i64, String> {
    record_publish_attempt(pool.inner(), input).await
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
        let url = format!("sqlite:file:approvals-{sequence}?mode=memory&cache=shared");
        let options = SqliteConnectOptions::from_str(&url)
            .expect("test database URL should be valid")
            .busy_timeout(Duration::from_secs(5));
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect_with(options)
            .await
            .expect("test pool should connect");
        pool.execute(
            "CREATE TABLE campaigns (id INTEGER PRIMARY KEY, status TEXT NOT NULL);
             CREATE TABLE approvals (id INTEGER PRIMARY KEY, campaign_id INTEGER NOT NULL, draft_id INTEGER NOT NULL DEFAULT 1, draft_variant_id INTEGER NOT NULL DEFAULT 1, reviewed_content_revision INTEGER DEFAULT 1, status TEXT NOT NULL, updated_at TEXT);
             CREATE TABLE draft_variants (id INTEGER PRIMARY KEY, content_revision INTEGER NOT NULL);
             CREATE TABLE approval_ready_variants (draft_variant_id INTEGER, draft_id INTEGER, campaign_id INTEGER, content_revision INTEGER);
             INSERT INTO draft_variants VALUES (1, 1);
             INSERT INTO approval_ready_variants VALUES (1, 1, 1, 1);
             CREATE TABLE schedule_jobs (id INTEGER PRIMARY KEY, approval_id INTEGER NOT NULL, status TEXT NOT NULL, updated_at TEXT);
             CREATE TABLE publish_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, approval_id INTEGER NOT NULL, schedule_job_id INTEGER, platform TEXT NOT NULL, status TEXT NOT NULL, external_post_url TEXT NOT NULL, platform_post_id TEXT NOT NULL, error_message TEXT NOT NULL);
             CREATE TABLE publish_executions (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, subject_id INTEGER NOT NULL, status TEXT NOT NULL);
             CREATE TABLE safety_audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER, subject_type TEXT NOT NULL, subject_id INTEGER, event_type TEXT NOT NULL, severity TEXT NOT NULL, summary TEXT NOT NULL, metadata_json TEXT NOT NULL);
             CREATE TABLE error_queue_items (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER, source_type TEXT NOT NULL, source_id INTEGER, title TEXT NOT NULL, detail TEXT NOT NULL, severity TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT);",
        )
        .await
        .expect("test schema should migrate");
        pool
    }

    async fn seed_scheduled(pool: &SqlitePool) {
        pool.execute("INSERT INTO campaigns (id, status) VALUES (1, 'active')")
            .await
            .expect("campaign should seed");
        pool.execute("INSERT INTO approvals (id, campaign_id, status) VALUES (1, 1, 'scheduled')")
            .await
            .expect("approval should seed");
        pool.execute(
            "INSERT INTO schedule_jobs (id, approval_id, status) VALUES (1, 1, 'scheduled')",
        )
        .await
        .expect("schedule should seed");
    }

    fn input(status: &str) -> RecordPublishAttemptInput {
        RecordPublishAttemptInput {
            approval_id: 1,
            schedule_job_id: Some(1),
            status: status.to_string(),
            external_post_url: "https://www.linkedin.com/posts/test".to_string(),
            platform_post_id: "post-1".to_string(),
            error_message: if status == "failed" {
                "network error"
            } else {
                ""
            }
            .to_string(),
        }
    }

    fn validation_error(input: RecordPublishAttemptInput) -> String {
        validate_record_publish_attempt(input).unwrap_err()
    }

    #[test]
    fn validation_trims_and_accepts_linkedin_evidence() {
        let mut raw = input("succeeded");
        raw.external_post_url = "  https://linkedin.com/feed/update/urn:li:share:1/  ".to_string();
        raw.platform_post_id = "  post-1 ".to_string();
        let valid = validate_record_publish_attempt(raw).unwrap();
        assert_eq!(
            valid.external_post_url,
            "https://linkedin.com/feed/update/urn:li:share:1/"
        );
        assert_eq!(valid.platform_post_id, "post-1");
    }

    #[test]
    fn validation_rejects_non_linkedin_url() {
        for url in [
            "https://example.com/x",
            "http://www.linkedin.com/posts/test",
            "https://www.linkedin.com.evil.test/x",
            "javascript:alert(1)",
        ] {
            let mut raw = input("succeeded");
            raw.external_post_url = url.to_string();
            assert_eq!(
                validation_error(raw),
                "LinkedIn post URL must start with https://www.linkedin.com/",
                "{url}"
            );
        }
    }

    #[test]
    fn validation_rejects_over_length_fields() {
        let mut raw = input("succeeded");
        raw.external_post_url = format!("https://www.linkedin.com/{}", "a".repeat(1000));
        assert_eq!(
            validation_error(raw),
            "LinkedIn post URL must be 1000 characters or fewer"
        );

        let mut raw = input("succeeded");
        raw.platform_post_id = "p".repeat(201);
        assert_eq!(
            validation_error(raw),
            "Platform post ID must be 200 characters or fewer"
        );

        let mut raw = input("failed");
        raw.error_message = "e".repeat(1001);
        assert_eq!(
            validation_error(raw),
            "Failure reason must be 1000 characters or fewer"
        );

        // Limits count characters, not bytes, and apply after trimming.
        let mut raw = input("failed");
        raw.error_message = format!("  {}  ", "é".repeat(1000));
        assert!(validate_record_publish_attempt(raw).is_ok());
    }

    #[test]
    fn validation_rejects_whitespace_only_success() {
        let mut raw = input("succeeded");
        raw.external_post_url = "   ".to_string();
        raw.platform_post_id = "\t\n".to_string();
        assert_eq!(
            validation_error(raw),
            "LinkedIn URL or platform post ID is required for success"
        );
    }

    #[test]
    fn validation_rejects_empty_reason_failure() {
        let mut raw = input("failed");
        raw.error_message = "   ".to_string();
        assert_eq!(
            validation_error(raw),
            "Failure reason is required for failed attempts"
        );
    }

    #[test]
    fn validation_rejects_bad_ids_and_status() {
        let mut raw = input("succeeded");
        raw.approval_id = 0;
        assert_eq!(
            validation_error(raw),
            "Approval id must be a positive integer"
        );
        let mut raw = input("succeeded");
        raw.schedule_job_id = Some(-1);
        assert_eq!(
            validation_error(raw),
            "Schedule job id must be a positive integer"
        );
        assert_eq!(
            validation_error(input("pending")),
            "Publish attempt status must be succeeded or failed"
        );
    }

    #[test]
    fn input_rejects_unknown_fields() {
        let error = serde_json::from_value::<RecordPublishAttemptInput>(json!({
            "approvalId": 1,
            "status": "succeeded",
            "platformPostId": "post-1",
            "extra": true,
        }))
        .unwrap_err();
        assert!(error.to_string().contains("unknown field"), "{error}");
    }

    #[tokio::test]
    async fn invalid_input_writes_nothing() {
        let pool = test_pool().await;
        seed_scheduled(&pool).await;
        let mut raw = input("succeeded");
        raw.external_post_url = "https://example.com/x".to_string();
        assert!(record_publish_attempt(&pool, raw).await.is_err());
        assert_eq!(count(&pool, "publish_attempts").await, 0);
        assert_eq!(count(&pool, "safety_audit_events").await, 0);
        assert_eq!(approval_status(&pool).await, "scheduled");
    }

    #[tokio::test]
    async fn successful_scheduled_attempt_commits_all_state() {
        let pool = test_pool().await;
        seed_scheduled(&pool).await;

        let attempt_id = record_publish_attempt(&pool, input("succeeded"))
            .await
            .expect("publish attempt should succeed");

        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT status FROM approvals WHERE id = 1")
                .fetch_one(&pool)
                .await
                .unwrap(),
            "published"
        );
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT status FROM schedule_jobs WHERE id = 1")
                .fetch_one(&pool)
                .await
                .unwrap(),
            "completed"
        );
        assert_eq!(sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM safety_audit_events WHERE subject_id = ?1 AND event_type = 'publish_succeeded'").bind(attempt_id).fetch_one(&pool).await.unwrap(), 1);
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM error_queue_items")
                .fetch_one(&pool)
                .await
                .unwrap(),
            0
        );
    }

    #[tokio::test]
    async fn late_write_failure_rolls_back_complete_snapshot() {
        let pool = test_pool().await;
        seed_scheduled(&pool).await;
        pool.execute("CREATE TRIGGER abort_error_audit BEFORE INSERT ON safety_audit_events WHEN NEW.event_type = 'error_item_created' BEGIN SELECT RAISE(ABORT, 'injected late failure'); END;")
            .await
            .expect("trigger should install");

        let result = record_publish_attempt(&pool, input("failed")).await;

        assert!(result.unwrap_err().contains("injected late failure"));
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM publish_attempts")
                .fetch_one(&pool)
                .await
                .unwrap(),
            0
        );
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM safety_audit_events")
                .fetch_one(&pool)
                .await
                .unwrap(),
            0
        );
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM error_queue_items")
                .fetch_one(&pool)
                .await
                .unwrap(),
            0
        );
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT status FROM approvals WHERE id = 1")
                .fetch_one(&pool)
                .await
                .unwrap(),
            "scheduled"
        );
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT status FROM schedule_jobs WHERE id = 1")
                .fetch_one(&pool)
                .await
                .unwrap(),
            "scheduled"
        );
    }

    async fn count(pool: &SqlitePool, table: &str) -> i64 {
        sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
            .fetch_one(pool)
            .await
            .unwrap()
    }

    async fn approval_status(pool: &SqlitePool) -> String {
        sqlx::query_scalar("SELECT status FROM approvals WHERE id = 1")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    // Readiness is modelled as a table here; the real view is exercised by the
    // migrated-database tests in approval_review_tests.rs.
    #[tokio::test]
    async fn unready_success_is_rejected_before_any_write() {
        let pool = test_pool().await;
        seed_scheduled(&pool).await;
        pool.execute("DELETE FROM approval_ready_variants")
            .await
            .unwrap();

        assert_eq!(
            record_publish_attempt(&pool, input("succeeded"))
                .await
                .unwrap_err(),
            STALE_APPROVAL_ERROR
        );
        assert_eq!(count(&pool, "publish_attempts").await, 0);
        assert_eq!(count(&pool, "safety_audit_events").await, 0);
        assert_eq!(approval_status(&pool).await, "scheduled");
    }

    #[tokio::test]
    async fn manual_record_is_refused_while_an_execution_is_open() {
        let pool = test_pool().await;
        seed_scheduled(&pool).await;
        pool.execute(
            "INSERT INTO publish_executions (kind, subject_id, status) VALUES ('post', 1, 'outcome_unknown')",
        )
        .await
        .unwrap();

        assert_eq!(
            record_publish_attempt(&pool, input("succeeded"))
                .await
                .unwrap_err(),
            crate::publishing::store::OPEN_EXECUTION_ERROR
        );
        assert_eq!(count(&pool, "publish_attempts").await, 0);
    }

    #[tokio::test]
    async fn unready_failure_is_recorded_and_revokes_approval() {
        let pool = test_pool().await;
        seed_scheduled(&pool).await;
        pool.execute("DELETE FROM approval_ready_variants")
            .await
            .unwrap();

        record_publish_attempt(&pool, input("failed"))
            .await
            .expect("failed attempts stay recordable");
        assert_eq!(count(&pool, "publish_attempts").await, 1);
        assert_eq!(count(&pool, "error_queue_items").await, 1);
        assert_eq!(approval_status(&pool).await, "changes_requested");
    }

    #[tokio::test]
    async fn ready_failure_returns_approval_to_approved() {
        let pool = test_pool().await;
        seed_scheduled(&pool).await;
        record_publish_attempt(&pool, input("failed"))
            .await
            .unwrap();
        assert_eq!(approval_status(&pool).await, "approved");
    }

    #[tokio::test]
    async fn concurrent_success_has_one_winner() {
        let pool = test_pool().await;
        seed_scheduled(&pool).await;
        let first_pool = pool.clone();
        let second_pool = pool.clone();
        let first =
            tokio::spawn(
                async move { record_publish_attempt(&first_pool, input("succeeded")).await },
            );
        let second =
            tokio::spawn(
                async move { record_publish_attempt(&second_pool, input("succeeded")).await },
            );
        let results = [first.await.unwrap(), second.await.unwrap()];

        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert!(results
            .iter()
            .filter_map(|result| result.as_ref().err())
            .any(|error| error == "Published approvals can only record failed follow-up attempts"));
        assert_eq!(
            sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM publish_attempts WHERE status = 'succeeded'"
            )
            .fetch_one(&pool)
            .await
            .unwrap(),
            1
        );
        assert_eq!(
            sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM safety_audit_events WHERE event_type = 'publish_succeeded'"
            )
            .fetch_one(&pool)
            .await
            .unwrap(),
            1
        );
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT status FROM approvals WHERE id = 1")
                .fetch_one(&pool)
                .await
                .unwrap(),
            "published"
        );
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT status FROM schedule_jobs WHERE id = 1")
                .fetch_one(&pool)
                .await
                .unwrap(),
            "completed"
        );
    }
}
