use serde::Deserialize;
use sqlx::{Row, SqliteConnection, SqlitePool};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use super::{
    linkedin_api::{get_linkedin_userinfo, linked_in_account_label, resolve_linkedin_target_urn},
    OAuthCredentials, StoredCredential,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedInPublishPostInput {
    pub approval_id: i64,
    pub schedule_job_id: Option<i64>,
    pub commentary: String,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedInPublishCommentInput {
    pub comment_thread_id: i64,
    pub commentary: String,
    pub target_urn: String,
    pub idempotency_key: String,
}

pub(crate) struct PublishApprovalPreflight {
    pub commentary: String,
    pub campaign_id: i64,
}

pub(crate) struct PublishCommentPreflight {
    pub commentary: String,
    pub target_urn: String,
    pub campaign_id: i64,
}

pub(crate) fn has_linkedin_publish_scope(credentials: &OAuthCredentials) -> bool {
    credentials.scopes.is_empty()
        || credentials
            .scopes
            .iter()
            .any(|scope| scope == "w_member_social")
}

pub(crate) fn has_linkedin_comment_scope(credentials: &OAuthCredentials) -> bool {
    credentials
        .scopes
        .iter()
        .any(|scope| scope == "w_member_social_feed" || scope == "w_member_social")
}

pub(crate) fn linkedin_oauth_credentials(
    stored: Option<StoredCredential>,
) -> Result<OAuthCredentials, String> {
    match stored {
        Some(StoredCredential::OAuth(credentials)) if credentials.provider_key == "linkedin" => {
            Ok(credentials)
        }
        Some(_) => Err("LinkedIn is not connected with OAuth".to_string()),
        None => Err("LinkedIn is not connected".to_string()),
    }
}

pub(crate) fn credentials_need_refresh(credentials: &OAuthCredentials) -> bool {
    credentials.expires_at.is_some_and(|expires_at| {
        expires_at <= super::unix_timestamp() + super::REFRESH_SKEW_SECONDS
    })
}

pub(crate) fn merge_refreshed_linkedin_credential(
    previous: OAuthCredentials,
    refreshed: StoredCredential,
) -> Result<OAuthCredentials, String> {
    let StoredCredential::OAuth(mut next) = refreshed else {
        return Err("LinkedIn refresh returned an unsupported credential".to_string());
    };
    if next.refresh_token.is_none() {
        next.refresh_token = previous.refresh_token;
    }
    if next.account_id.is_none() {
        next.account_id = previous.account_id;
    }
    if next.account_label.is_none() {
        next.account_label = previous.account_label;
    }
    if next.scopes.is_empty() {
        next.scopes = previous.scopes;
    }
    Ok(next)
}

pub(crate) fn ensure_publish_input(input: &LinkedInPublishPostInput) -> Result<(), String> {
    if input.approval_id <= 0 {
        return Err("Approval id is required".to_string());
    }
    if matches!(input.schedule_job_id, Some(schedule_job_id) if schedule_job_id <= 0) {
        return Err("Schedule job id is invalid".to_string());
    }
    if input.idempotency_key.trim().is_empty() {
        return Err("Publish idempotency key is required".to_string());
    }
    Ok(())
}

pub(crate) fn ensure_comment_input(input: &LinkedInPublishCommentInput) -> Result<(), String> {
    if input.comment_thread_id <= 0 {
        return Err("Comment thread id is required".to_string());
    }
    if input.commentary.trim().is_empty() {
        return Err("Comment text is required".to_string());
    }
    if input.target_urn.trim().is_empty() {
        return Err("LinkedIn target URN is required".to_string());
    }
    if input.idempotency_key.trim().is_empty() {
        return Err("Comment idempotency key is required".to_string());
    }
    Ok(())
}

pub(crate) fn compose_linkedin_commentary(
    hook: &str,
    body: &str,
    cta: &str,
    hashtags: &str,
) -> String {
    [hook, body, cta, hashtags]
        .into_iter()
        .map(str::trim)
        .filter(|block| !block.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

pub(crate) fn escape_linkedin_little_text(text: &str) -> String {
    text.chars()
        .flat_map(|character| match character {
            '|' | '{' | '}' | '@' | '[' | ']' | '(' | ')' | '<' | '>' | '#' | '\\' | '*' | '_'
            | '~' => vec!['\\', character],
            _ => vec![character],
        })
        .collect()
}

pub(crate) fn app_sqlite_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut app_path = app
        .path()
        .app_config_dir()
        .map_err(|_| "Could not resolve app config directory".to_string())?;
    app_path.push("linkgo.db");
    Ok(app_path)
}

pub(crate) async fn sqlite_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    app.try_state::<SqlitePool>()
        .map(|pool| pool.inner().clone())
        .ok_or_else(|| "Linkgo database is not initialized".to_string())
}

/// Native publish gate run by the command that actually posts, before any
/// LinkedIn call. Every read shares one transaction so the readiness check and
/// the commentary it approves come from the same snapshot.
#[cfg(test)]
pub(crate) async fn load_publish_preflight_from_pool(
    pool: &SqlitePool,
    input: &LinkedInPublishPostInput,
) -> Result<PublishApprovalPreflight, String> {
    let mut connection = pool
        .acquire()
        .await
        .map_err(|_| "Could not read approval".to_string())?;
    check_post_preflight(&mut connection, input).await
}

/// Post publish gate on a caller-owned connection so the publishing
/// reservation can run it inside its own `BEGIN IMMEDIATE` transaction.
pub(crate) async fn check_post_preflight(
    transaction: &mut SqliteConnection,
    input: &LinkedInPublishPostInput,
) -> Result<PublishApprovalPreflight, String> {
    ensure_publish_input(input)?;
    check_kill_switch(transaction).await?;

    let approval = sqlx::query(
        "SELECT
            approvals.campaign_id AS campaign_id,
            approvals.status AS approval_status,
            campaigns.status AS campaign_status,
            draft_variants.hook AS hook,
            draft_variants.body AS body,
            draft_variants.cta AS cta,
            draft_variants.hashtags AS hashtags,
            (
                SELECT COUNT(*) FROM publish_attempts
                WHERE publish_attempts.approval_id = approvals.id
                    AND publish_attempts.status = 'succeeded'
            ) AS successful_publish_attempt_count
        FROM approvals
        INNER JOIN campaigns ON campaigns.id = approvals.campaign_id
        INNER JOIN draft_variants ON draft_variants.id = approvals.draft_variant_id
        WHERE approvals.id = ?",
    )
    .bind(input.approval_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|_| "Could not read approval".to_string())?
    .ok_or_else(|| "Approval was not found".to_string())?;

    let approval_status: String = approval
        .try_get("approval_status")
        .map_err(|_| "Approval status was not found".to_string())?;
    let campaign_status: String = approval
        .try_get("campaign_status")
        .map_err(|_| "Campaign status was not found".to_string())?;
    let successful_publish_attempt_count: i64 = approval
        .try_get("successful_publish_attempt_count")
        .unwrap_or(0);

    if campaign_status == "archived" {
        return Err("Campaign is archived".to_string());
    }
    if !matches!(approval_status.as_str(), "approved" | "scheduled") {
        return Err("Only approved or scheduled approvals can publish via LinkedIn".to_string());
    }
    if successful_publish_attempt_count > 0 {
        return Err("Approval already has a successful publish attempt".to_string());
    }

    // The variant must still be ready at the revision the reviewer approved;
    // an edit after approval bumps content_revision and fails here.
    crate::approval_review::assert_publish_ready(
        transaction,
        input.approval_id,
        "Could not read approval",
    )
    .await?;

    // Same rule as `linkgo_approval_publish_preflight`: a requested schedule
    // job must be the approval's latest job and still `scheduled`.
    let latest_schedule = sqlx::query(
        "SELECT id, status FROM schedule_jobs WHERE approval_id = ?
         ORDER BY datetime(updated_at) DESC, id DESC LIMIT 1",
    )
    .bind(input.approval_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|_| "Could not read schedule job".to_string())?;
    let current_scheduled_id = latest_schedule.and_then(|row| {
        let status: String = row.try_get("status").unwrap_or_default();
        (status == "scheduled")
            .then(|| row.try_get::<i64, _>("id").ok())
            .flatten()
    });

    match (
        approval_status.as_str(),
        input.schedule_job_id,
        current_scheduled_id,
    ) {
        ("scheduled", None, _) => {
            return Err("Scheduled approvals require the current schedule job".to_string());
        }
        (_, Some(requested), current) if current != Some(requested) => {
            return Err("Schedule job is not the current scheduled job".to_string());
        }
        // Stricter than the renderer preflight: a manual publish may not
        // bypass a pending scheduled job.
        ("approved", None, Some(_)) => {
            return Err("Schedule job is not the current scheduled job".to_string());
        }
        _ => {}
    }

    let expected_idempotency_key = format!(
        "approval:{}:linkedin:{}",
        input.approval_id,
        input
            .schedule_job_id
            .map(|id| id.to_string())
            .unwrap_or_else(|| "manual".to_string())
    );
    if input.idempotency_key != expected_idempotency_key {
        return Err("Publish idempotency key does not match approval state".to_string());
    }

    let raw_commentary = compose_linkedin_commentary(
        &approval.try_get::<String, _>("hook").unwrap_or_default(),
        &approval.try_get::<String, _>("body").unwrap_or_default(),
        &approval.try_get::<String, _>("cta").unwrap_or_default(),
        &approval
            .try_get::<String, _>("hashtags")
            .unwrap_or_default(),
    );
    let commentary = escape_linkedin_little_text(&raw_commentary);
    if commentary != input.commentary {
        return Err("Publish commentary does not match the approved draft variant".to_string());
    }

    Ok(PublishApprovalPreflight {
        commentary,
        campaign_id: approval.try_get("campaign_id").unwrap_or_default(),
    })
}

pub(crate) async fn check_kill_switch(connection: &mut SqliteConnection) -> Result<(), String> {
    let safety = sqlx::query(
        "SELECT global_kill_switch, kill_switch_reason FROM safety_settings WHERE id = 1",
    )
    .fetch_optional(&mut *connection)
    .await
    .map_err(|_| "Could not read safety settings".to_string())?;
    if let Some(row) = safety {
        let global_kill_switch: i64 = row.try_get("global_kill_switch").unwrap_or(0);
        if global_kill_switch == 1 {
            let reason: String = row.try_get("kill_switch_reason").unwrap_or_default();
            return Err(if reason.trim().is_empty() {
                "Global kill switch is enabled".to_string()
            } else {
                format!("Global kill switch is enabled: {reason}")
            });
        }
    }
    Ok(())
}

/// Comment publish gate on a caller-owned connection. The daily limit counts
/// succeeded attempts plus open (reserved, in-flight or outcome-unknown)
/// comment executions, so in-flight comments cannot exceed the limit.
pub(crate) async fn check_comment_preflight(
    connection: &mut SqliteConnection,
    input: &LinkedInPublishCommentInput,
) -> Result<PublishCommentPreflight, String> {
    ensure_comment_input(input)?;
    check_kill_switch(connection).await?;

    let thread = sqlx::query(
        "SELECT
            comment_threads.status AS thread_status,
            campaigns.status AS campaign_status,
            campaigns.daily_comment_limit AS daily_comment_limit,
            comment_threads.campaign_id AS campaign_id,
            target_posts.url AS target_url,
            target_posts.platform_resource_urn AS target_platform_resource_urn,
            (
                SELECT COUNT(*) FROM comment_attempts
                WHERE comment_attempts.comment_thread_id = comment_threads.id
                    AND comment_attempts.status = 'succeeded'
            ) AS successful_attempt_count,
            (
                SELECT COUNT(*) FROM comment_attempts
                INNER JOIN comment_threads counted_threads
                    ON counted_threads.id = comment_attempts.comment_thread_id
                WHERE counted_threads.campaign_id = comment_threads.campaign_id
                    AND date(comment_attempts.created_at) = date('now')
                    AND comment_attempts.status = 'succeeded'
            ) + (
                SELECT COUNT(*) FROM publish_executions
                WHERE publish_executions.kind = 'comment'
                    AND publish_executions.campaign_id = comment_threads.campaign_id
                    AND publish_executions.status IN ('reserved', 'in_flight', 'outcome_unknown')
            ) AS daily_success_count
        FROM comment_threads
        INNER JOIN campaigns ON campaigns.id = comment_threads.campaign_id
        INNER JOIN candidate_posts ON candidate_posts.id = comment_threads.candidate_post_id
        INNER JOIN target_posts ON target_posts.id = candidate_posts.target_post_id
        WHERE comment_threads.id = ?",
    )
    .bind(input.comment_thread_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(|_| "Could not read comment thread".to_string())?
    .ok_or_else(|| "Comment thread was not found".to_string())?;

    let campaign_status: String = thread.try_get("campaign_status").unwrap_or_default();
    let thread_status: String = thread.try_get("thread_status").unwrap_or_default();
    if campaign_status == "archived" {
        return Err("Campaign is archived".to_string());
    }
    if thread_status != "approved" {
        return Err("Only approved comments can publish via LinkedIn".to_string());
    }
    let successful_attempt_count: i64 = thread.try_get("successful_attempt_count").unwrap_or(0);
    if successful_attempt_count > 0 {
        return Err("Comment thread already has a successful posting attempt".to_string());
    }

    let variants = sqlx::query(
        "SELECT
            comment_variants.body AS body,
            (
                SELECT COUNT(*) FROM comment_audits
                WHERE comment_audits.comment_variant_id = comment_variants.id
                    AND comment_audits.severity = 'block'
            ) AS blocked_count
        FROM comment_variants
        WHERE comment_variants.comment_thread_id = ?
            AND comment_variants.status = 'selected'",
    )
    .bind(input.comment_thread_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|_| "Could not read selected comment variant".to_string())?;
    if variants.len() != 1 {
        return Err("Choose exactly one selected comment variant".to_string());
    }
    let variant = &variants[0];
    let blocked_count: i64 = variant.try_get("blocked_count").unwrap_or(0);
    if blocked_count > 0 {
        return Err("Blocked comment variants cannot be reviewed".to_string());
    }
    let raw_body: String = variant.try_get("body").unwrap_or_default();
    let commentary = escape_linkedin_little_text(&raw_body);
    if commentary != input.commentary {
        return Err("Commentary does not match the approved comment variant".to_string());
    }

    let target_resource: String = thread
        .try_get("target_platform_resource_urn")
        .unwrap_or_default();
    let target_url: String = thread.try_get("target_url").unwrap_or_default();
    let target_urn = resolve_linkedin_target_urn(if target_resource.trim().is_empty() {
        &target_url
    } else {
        &target_resource
    })
    .ok_or_else(|| {
        "LinkedIn target URN could not be resolved from the candidate URL".to_string()
    })?;
    if target_urn != input.target_urn {
        return Err("LinkedIn target URN does not match the comment target".to_string());
    }

    let expected_idempotency_key =
        format!("comment-thread:{}:linkedin:manual", input.comment_thread_id);
    if input.idempotency_key != expected_idempotency_key {
        return Err("Comment idempotency key does not match thread state".to_string());
    }

    let daily_comment_limit: i64 = thread.try_get("daily_comment_limit").unwrap_or(0);
    let daily_success_count: i64 = thread.try_get("daily_success_count").unwrap_or(0);
    if daily_success_count >= daily_comment_limit {
        return Err(format!(
            "Daily comment limit reached for today: {daily_success_count}/{daily_comment_limit} used"
        ));
    }

    Ok(PublishCommentPreflight {
        commentary,
        target_urn,
        campaign_id: thread.try_get("campaign_id").unwrap_or_default(),
    })
}

pub(crate) fn ensure_linkedin_account_identity(
    credentials: &mut OAuthCredentials,
) -> Result<bool, String> {
    if credentials
        .account_id
        .as_ref()
        .is_some_and(|account_id| !account_id.trim().is_empty())
    {
        return Ok(false);
    }

    let userinfo = get_linkedin_userinfo(&credentials.access_token)?;
    credentials.account_id = Some(userinfo.sub.clone());
    credentials.account_label = Some(linked_in_account_label(&userinfo));
    Ok(true)
}

#[cfg(test)]
#[path = "publish_preflight_tests.rs"]
mod preflight_tests;

#[cfg(test)]
mod tests {
    use super::{
        credentials_need_refresh, has_linkedin_comment_scope, has_linkedin_publish_scope,
        linkedin_oauth_credentials, merge_refreshed_linkedin_credential,
    };
    use crate::auth::{ApiKeyCredentials, OAuthCredentials, StoredCredential};

    fn linkedin_credentials(expires_at: Option<i64>) -> OAuthCredentials {
        OAuthCredentials {
            access_token: "access".to_string(),
            refresh_token: Some("refresh".to_string()),
            expires_at,
            refresh_expires_at: None,
            account_id: Some("person-1".to_string()),
            account_label: Some("LinkedIn member".to_string()),
            scopes: vec!["w_member_social".to_string()],
            provider_key: "linkedin".to_string(),
            needs_reauth: false,
        }
    }

    #[test]
    fn missing_linkedin_credential_returns_safe_error() {
        let error = linkedin_oauth_credentials(None).unwrap_err();
        assert_eq!(error, "LinkedIn is not connected");
    }

    #[test]
    fn non_oauth_linkedin_credential_returns_safe_error() {
        let error = linkedin_oauth_credentials(Some(StoredCredential::ApiKey(ApiKeyCredentials {
            api_key: "not-used-in-test".to_string(),
            base_url: None,
            account_label: None,
            provider_key: "linkedin".to_string(),
            allow_local_destination: false,
        })))
        .unwrap_err();
        assert_eq!(error, "LinkedIn is not connected with OAuth");
    }

    #[test]
    fn expired_credential_refresh_path_is_selected() {
        let expired = linkedin_credentials(Some(crate::auth::unix_timestamp() - 1));
        let fresh = linkedin_credentials(Some(crate::auth::unix_timestamp() + 3600));

        assert!(credentials_need_refresh(&expired));
        assert!(!credentials_need_refresh(&fresh));
    }

    #[test]
    fn publish_scope_allows_empty_or_member_social_scope() {
        let mut credentials = linkedin_credentials(None);
        credentials.scopes = Vec::new();
        assert!(has_linkedin_publish_scope(&credentials));

        credentials.scopes = vec!["r_liteprofile".to_string()];
        assert!(!has_linkedin_publish_scope(&credentials));

        credentials.scopes = vec!["r_liteprofile".to_string(), "w_member_social".to_string()];
        assert!(has_linkedin_publish_scope(&credentials));
    }

    #[test]
    fn comment_scope_requires_feed_or_legacy_member_social_scope() {
        let mut credentials = linkedin_credentials(None);
        credentials.scopes = vec!["r_liteprofile".to_string()];
        assert!(!has_linkedin_comment_scope(&credentials));

        credentials.scopes = vec!["w_member_social_feed".to_string()];
        assert!(has_linkedin_comment_scope(&credentials));

        credentials.scopes = vec!["w_member_social".to_string()];
        assert!(has_linkedin_comment_scope(&credentials));
    }

    #[test]
    fn refreshed_credential_keeps_previous_fallback_fields() {
        let previous = linkedin_credentials(Some(10));
        let refreshed = StoredCredential::OAuth(OAuthCredentials {
            access_token: "next".to_string(),
            refresh_token: None,
            expires_at: Some(20),
            refresh_expires_at: None,
            account_id: None,
            account_label: None,
            scopes: Vec::new(),
            provider_key: "linkedin".to_string(),
            needs_reauth: false,
        });

        let merged = merge_refreshed_linkedin_credential(previous, refreshed).unwrap();

        assert_eq!(merged.access_token, "next");
        assert_eq!(merged.refresh_token, Some("refresh".to_string()));
        assert_eq!(merged.account_id, Some("person-1".to_string()));
        assert_eq!(merged.account_label, Some("LinkedIn member".to_string()));
        assert_eq!(merged.scopes, vec!["w_member_social".to_string()]);
    }
}
