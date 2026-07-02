use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteConnectOptions, Row, SqlitePool};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use super::storage::AuthStorage;
use super::{
    linkedin::refresh_linkedin_credential,
    linkedin_api::{get_linkedin_userinfo, linked_in_account_label, publish_linkedin_member_post},
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedInPublishPostResult {
    pub platform_post_id: String,
    pub external_post_url: String,
}

pub(crate) struct PublishApprovalPreflight {
    pub commentary: String,
}

pub(crate) fn has_linkedin_publish_scope(credentials: &OAuthCredentials) -> bool {
    credentials.scopes.is_empty()
        || credentials
            .scopes
            .iter()
            .any(|scope| scope == "w_member_social")
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
    SqlitePool::connect_with(SqliteConnectOptions::new().filename(app_sqlite_path(app)?))
        .await
        .map_err(|_| "Could not open Linkgo database".to_string())
}

pub(crate) async fn load_publish_preflight(
    app: &AppHandle,
    input: &LinkedInPublishPostInput,
) -> Result<PublishApprovalPreflight, String> {
    let pool = sqlite_pool(app).await?;

    let safety = sqlx::query(
        "SELECT global_kill_switch, kill_switch_reason FROM safety_settings WHERE id = 1",
    )
    .fetch_optional(&pool)
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

    let approval = sqlx::query(
        "SELECT
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
    .fetch_optional(&pool)
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

    let current_schedule = sqlx::query(
        "SELECT id, status FROM schedule_jobs WHERE approval_id = ? AND status = 'scheduled'",
    )
    .bind(input.approval_id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| "Could not read schedule job".to_string())?;

    match (
        approval_status.as_str(),
        input.schedule_job_id,
        current_schedule,
    ) {
        ("scheduled", None, _) => {
            return Err("Scheduled approvals require the current schedule job".to_string());
        }
        ("scheduled", Some(schedule_job_id), Some(row)) => {
            let current_schedule_id: i64 = row.try_get("id").unwrap_or_default();
            if current_schedule_id != schedule_job_id {
                return Err("Schedule job is not the current scheduled job".to_string());
            }
        }
        ("scheduled", Some(_), None) => {
            return Err("Schedule job is not the current scheduled job".to_string());
        }
        ("approved", Some(schedule_job_id), Some(row)) => {
            let current_schedule_id: i64 = row.try_get("id").unwrap_or_default();
            if current_schedule_id != schedule_job_id {
                return Err("Schedule job is not the current scheduled job".to_string());
            }
        }
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

    Ok(PublishApprovalPreflight { commentary })
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

pub fn publish_approved_linkedin_post(
    app: &AppHandle,
    input: LinkedInPublishPostInput,
) -> Result<LinkedInPublishPostResult, String> {
    ensure_publish_input(&input)?;
    let preflight = tauri::async_runtime::block_on(load_publish_preflight(app, &input))?;
    let storage = AuthStorage::new(app)?;
    let mut credentials = linkedin_oauth_credentials(storage.load("linkedin")?)?;

    if credentials_need_refresh(&credentials) {
        let refreshed = refresh_linkedin_credential(credentials.clone())?;
        credentials = merge_refreshed_linkedin_credential(credentials, refreshed)?;
        storage.save(StoredCredential::OAuth(credentials.clone()))?;
    }

    if !has_linkedin_publish_scope(&credentials) {
        return Err("LinkedIn connection is missing w_member_social scope".to_string());
    }

    if ensure_linkedin_account_identity(&mut credentials)? {
        storage.save(StoredCredential::OAuth(credentials.clone()))?;
    }
    let account_id = credentials.account_id.clone().unwrap_or_default();

    let result = publish_linkedin_member_post(
        &credentials.access_token,
        &account_id,
        preflight.commentary.as_str(),
    )?;
    Ok(LinkedInPublishPostResult {
        platform_post_id: result.platform_post_id,
        external_post_url: result.external_post_url,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        credentials_need_refresh, has_linkedin_publish_scope, linkedin_oauth_credentials,
        merge_refreshed_linkedin_credential,
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
        });

        let merged = merge_refreshed_linkedin_credential(previous, refreshed).unwrap();

        assert_eq!(merged.access_token, "next");
        assert_eq!(merged.refresh_token, Some("refresh".to_string()));
        assert_eq!(merged.account_id, Some("person-1".to_string()));
        assert_eq!(merged.account_label, Some("LinkedIn member".to_string()));
        assert_eq!(merged.scopes, vec!["w_member_social".to_string()]);
    }
}
