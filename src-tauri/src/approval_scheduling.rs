use serde::Deserialize;
use serde_json::json;
use sqlx::{Row, SqliteConnection, SqlitePool};
use tauri::State;

const STORAGE_ERROR: &str = "Could not settle approval schedule";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleApprovalInput {
    pub approval_id: i64,
    pub scheduled_for: String,
    pub timezone: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelScheduleInput {
    pub id: i64,
}

enum Settlement<T> {
    Accepted(T),
    Rejected(String),
}

struct ApprovalState {
    id: i64,
    campaign_id: i64,
    status: String,
    daily_post_limit: i64,
}

async fn insert_rate_limit_event(
    connection: &mut SqliteConnection,
    approval: &ApprovalState,
    window_key: &str,
    current_count: i64,
    decision: &str,
    summary: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO rate_limit_events (
            campaign_id, action, window_key, limit_value, current_count, decision, summary
         ) VALUES (?1, 'schedule_post', ?2, ?3, ?4, ?5, ?6)",
    )
    .bind(approval.campaign_id)
    .bind(window_key)
    .bind(approval.daily_post_limit)
    .bind(current_count)
    .bind(decision)
    .bind(summary)
    .execute(&mut *connection)
    .await
    .map_err(|_| STORAGE_ERROR.to_string())?;
    Ok(())
}

struct SafetyAuditEvent<'a> {
    campaign_id: i64,
    subject_type: &'a str,
    subject_id: Option<i64>,
    event_type: &'a str,
    severity: &'a str,
    summary: &'a str,
    metadata: serde_json::Value,
}

async fn insert_safety_audit(
    connection: &mut SqliteConnection,
    event: SafetyAuditEvent<'_>,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO safety_audit_events (
            campaign_id, subject_type, subject_id, event_type, severity, summary, metadata_json
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(event.campaign_id)
    .bind(event.subject_type)
    .bind(event.subject_id)
    .bind(event.event_type)
    .bind(event.severity)
    .bind(event.summary)
    .bind(event.metadata.to_string())
    .execute(&mut *connection)
    .await
    .map_err(|_| STORAGE_ERROR.to_string())?;
    Ok(())
}

async fn execute_schedule(
    connection: &mut SqliteConnection,
    input: ScheduleApprovalInput,
) -> Result<Settlement<i64>, String> {
    let row = sqlx::query(
        "SELECT a.id, a.campaign_id, a.status, c.status AS campaign_status, c.daily_post_limit
         FROM approvals a
         INNER JOIN campaigns c ON c.id = a.campaign_id
         WHERE a.id = ?1 LIMIT 1",
    )
    .bind(input.approval_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(|_| STORAGE_ERROR.to_string())?
    .ok_or_else(|| "Approval was not found".to_string())?;

    let campaign_status: String = row
        .try_get("campaign_status")
        .map_err(|_| STORAGE_ERROR.to_string())?;
    let approval = ApprovalState {
        id: row.try_get("id").map_err(|_| STORAGE_ERROR.to_string())?,
        campaign_id: row
            .try_get("campaign_id")
            .map_err(|_| STORAGE_ERROR.to_string())?,
        status: row
            .try_get("status")
            .map_err(|_| STORAGE_ERROR.to_string())?,
        daily_post_limit: row
            .try_get("daily_post_limit")
            .map_err(|_| STORAGE_ERROR.to_string())?,
    };
    if campaign_status == "archived" {
        return Ok(Settlement::Rejected("Campaign is archived".to_string()));
    }
    if approval.status != "approved" {
        return Ok(Settlement::Rejected(
            "Only approved posts can be scheduled".to_string(),
        ));
    }

    let existing =
        sqlx::query("SELECT id, status FROM schedule_jobs WHERE approval_id = ?1 LIMIT 1")
            .bind(input.approval_id)
            .fetch_optional(&mut *connection)
            .await
            .map_err(|_| STORAGE_ERROR.to_string())?;
    let existing_id = existing.as_ref().map(|row| row.get::<i64, _>("id"));
    if let Some(row) = existing.as_ref() {
        let status: String = row
            .try_get("status")
            .map_err(|_| STORAGE_ERROR.to_string())?;
        if status != "cancelled" && status != "failed" {
            return Ok(Settlement::Rejected(
                "Approval already has an active schedule job".to_string(),
            ));
        }
    }

    sqlx::query("INSERT OR IGNORE INTO safety_settings (id) VALUES (1)")
        .execute(&mut *connection)
        .await
        .map_err(|_| STORAGE_ERROR.to_string())?;
    let settings = sqlx::query(
        "SELECT global_kill_switch, kill_switch_reason FROM safety_settings WHERE id = 1",
    )
    .fetch_one(&mut *connection)
    .await
    .map_err(|_| STORAGE_ERROR.to_string())?;
    let window_key = input
        .scheduled_for
        .trim()
        .chars()
        .take(10)
        .collect::<String>();
    let current_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM schedule_jobs sj
         INNER JOIN approvals a ON a.id = sj.approval_id
         WHERE a.campaign_id = ?1 AND date(sj.scheduled_for) = date(?2)
           AND sj.status IN ('scheduled', 'completed')",
    )
    .bind(approval.campaign_id)
    .bind(&input.scheduled_for)
    .fetch_one(&mut *connection)
    .await
    .map_err(|_| STORAGE_ERROR.to_string())?;

    if settings.get::<i64, _>("global_kill_switch") == 1 {
        let reason: String = settings
            .try_get("kill_switch_reason")
            .map_err(|_| STORAGE_ERROR.to_string())?;
        let audit_summary = "Post scheduling blocked by global kill switch";
        insert_safety_audit(
            connection,
            SafetyAuditEvent {
                campaign_id: approval.campaign_id,
                subject_type: "schedule_job",
                subject_id: existing_id,
                event_type: "schedule_blocked",
                severity: "block",
                summary: audit_summary,
                metadata: json!({ "reason": reason }),
            },
        )
        .await?;
        let rate_summary = format!(
            "Post scheduling blocked by global kill switch for {window_key}: {current_count}/{} used",
            approval.daily_post_limit
        );
        insert_rate_limit_event(
            connection,
            &approval,
            &window_key,
            current_count,
            "blocked",
            &rate_summary,
        )
        .await?;
        let error = if reason.is_empty() {
            "Global kill switch is enabled".to_string()
        } else {
            format!("Global kill switch is enabled: {reason}")
        };
        return Ok(Settlement::Rejected(error));
    }

    let allowed = current_count < approval.daily_post_limit;
    let summary = if allowed {
        format!(
            "Schedule allowed for {window_key}: {current_count}/{} used",
            approval.daily_post_limit
        )
    } else {
        format!(
            "Daily post scheduling limit reached for {window_key}: {current_count}/{} used",
            approval.daily_post_limit
        )
    };
    if !allowed {
        insert_rate_limit_event(
            connection,
            &approval,
            &window_key,
            current_count,
            "blocked",
            &summary,
        )
        .await?;
        insert_safety_audit(
            connection,
            SafetyAuditEvent {
                campaign_id: approval.campaign_id,
                subject_type: "approval",
                subject_id: Some(approval.id),
                event_type: "schedule_blocked",
                severity: "block",
                summary: &summary,
                metadata: json!({
                    "windowKey": window_key,
                    "limitValue": approval.daily_post_limit,
                    "currentCount": current_count,
                }),
            },
        )
        .await?;
        return Ok(Settlement::Rejected(summary));
    }

    let idempotency_key = format!(
        "approval:{}:linkedin:{}",
        input.approval_id, input.scheduled_for
    );
    let schedule_job_id = if let Some(id) = existing_id {
        sqlx::query(
            "UPDATE schedule_jobs SET status = 'scheduled', scheduled_for = ?1, timezone = ?2,
             idempotency_key = ?3, updated_at = datetime('now') WHERE id = ?4",
        )
        .bind(&input.scheduled_for)
        .bind(&input.timezone)
        .bind(&idempotency_key)
        .bind(id)
        .execute(&mut *connection)
        .await
        .map_err(|_| STORAGE_ERROR.to_string())?;
        id
    } else {
        sqlx::query(
            "INSERT INTO schedule_jobs (
                approval_id, platform, scheduled_for, timezone, status, idempotency_key, updated_at
             ) VALUES (?1, 'linkedin', ?2, ?3, 'scheduled', ?4, datetime('now'))",
        )
        .bind(input.approval_id)
        .bind(&input.scheduled_for)
        .bind(&input.timezone)
        .bind(&idempotency_key)
        .execute(&mut *connection)
        .await
        .map_err(|_| STORAGE_ERROR.to_string())?
        .last_insert_rowid()
    };
    sqlx::query(
        "UPDATE approvals SET status = 'scheduled', updated_at = datetime('now') WHERE id = ?1",
    )
    .bind(input.approval_id)
    .execute(&mut *connection)
    .await
    .map_err(|_| STORAGE_ERROR.to_string())?;
    insert_rate_limit_event(
        connection,
        &approval,
        &window_key,
        current_count,
        "allowed",
        &summary,
    )
    .await?;
    insert_safety_audit(
        connection,
        SafetyAuditEvent {
            campaign_id: approval.campaign_id,
            subject_type: "schedule_job",
            subject_id: Some(schedule_job_id),
            event_type: "schedule_allowed",
            severity: "info",
            summary: &summary,
            metadata: json!({ "approvalId": approval.id, "scheduledFor": input.scheduled_for }),
        },
    )
    .await?;
    Ok(Settlement::Accepted(schedule_job_id))
}

async fn execute_cancel(
    connection: &mut SqliteConnection,
    input: CancelScheduleInput,
) -> Result<Settlement<()>, String> {
    let row = sqlx::query(
        "SELECT sj.id, sj.approval_id, sj.status, a.status AS approval_status,
                a.campaign_id, c.status AS campaign_status
         FROM schedule_jobs sj
         INNER JOIN approvals a ON a.id = sj.approval_id
         INNER JOIN campaigns c ON c.id = a.campaign_id
         WHERE sj.id = ?1 LIMIT 1",
    )
    .bind(input.id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(|_| STORAGE_ERROR.to_string())?;
    let Some(row) = row else {
        return Ok(Settlement::Rejected(
            "Schedule job was not found".to_string(),
        ));
    };
    let campaign_status: String = row
        .try_get("campaign_status")
        .map_err(|_| STORAGE_ERROR.to_string())?;
    let status: String = row
        .try_get("status")
        .map_err(|_| STORAGE_ERROR.to_string())?;
    if campaign_status == "archived" {
        return Ok(Settlement::Rejected("Campaign is archived".to_string()));
    }
    if status == "completed" {
        return Ok(Settlement::Rejected(
            "Completed schedules cannot be cancelled".to_string(),
        ));
    }
    let approval_id: i64 = row
        .try_get("approval_id")
        .map_err(|_| STORAGE_ERROR.to_string())?;
    let campaign_id: i64 = row
        .try_get("campaign_id")
        .map_err(|_| STORAGE_ERROR.to_string())?;
    let approval_status: String = row
        .try_get("approval_status")
        .map_err(|_| STORAGE_ERROR.to_string())?;
    sqlx::query(
        "UPDATE schedule_jobs SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?1",
    )
    .bind(input.id)
    .execute(&mut *connection)
    .await
    .map_err(|_| STORAGE_ERROR.to_string())?;
    if approval_status != "published" {
        sqlx::query(
            "UPDATE approvals SET status = 'approved', updated_at = datetime('now') WHERE id = ?1",
        )
        .bind(approval_id)
        .execute(&mut *connection)
        .await
        .map_err(|_| STORAGE_ERROR.to_string())?;
    }
    insert_safety_audit(
        connection,
        SafetyAuditEvent {
            campaign_id,
            subject_type: "schedule_job",
            subject_id: Some(input.id),
            event_type: "schedule_cancelled",
            severity: "info",
            summary: "Schedule cancelled",
            metadata: json!({ "approvalId": approval_id }),
        },
    )
    .await?;
    Ok(Settlement::Accepted(()))
}

async fn settle<T>(
    pool: &SqlitePool,
    operation: impl for<'a> FnOnce(
        &'a mut SqliteConnection,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<Settlement<T>, String>> + Send + 'a>,
    >,
) -> Result<T, String> {
    let mut connection = pool
        .acquire()
        .await
        .map_err(|_| STORAGE_ERROR.to_string())?;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *connection)
        .await
        .map_err(|_| STORAGE_ERROR.to_string())?;
    match operation(&mut connection).await {
        Ok(outcome) => {
            if sqlx::query("COMMIT")
                .execute(&mut *connection)
                .await
                .is_err()
            {
                let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                return Err(STORAGE_ERROR.to_string());
            }
            match outcome {
                Settlement::Accepted(value) => Ok(value),
                Settlement::Rejected(error) => Err(error),
            }
        }
        Err(error) => {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            Err(error)
        }
    }
}

pub(crate) async fn schedule_approval(
    pool: &SqlitePool,
    input: ScheduleApprovalInput,
) -> Result<i64, String> {
    settle(pool, move |connection| {
        Box::pin(execute_schedule(connection, input))
    })
    .await
}

pub(crate) async fn cancel_schedule(
    pool: &SqlitePool,
    input: CancelScheduleInput,
) -> Result<(), String> {
    settle(pool, move |connection| {
        Box::pin(execute_cancel(connection, input))
    })
    .await
}

#[tauri::command]
pub async fn linkgo_approval_schedule(
    pool: State<'_, SqlitePool>,
    input: ScheduleApprovalInput,
) -> Result<i64, String> {
    schedule_approval(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_approval_cancel_schedule(
    pool: State<'_, SqlitePool>,
    input: CancelScheduleInput,
) -> Result<(), String> {
    cancel_schedule(pool.inner(), input).await
}

#[cfg(test)]
#[path = "approval_scheduling_tests.rs"]
mod tests;
