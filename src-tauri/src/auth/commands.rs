use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteConnectOptions, Row, SqlitePool};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

use super::storage::AuthStorage;
use super::{
    linkedin::{exchange_linkedin_code, refresh_linkedin_credential, start_linkedin_oauth},
    linkedin_api::{get_linkedin_userinfo, linked_in_account_label, publish_linkedin_member_post},
    oauth::{persist_pending_oauth_session, verify_and_take_oauth_session},
    providers::{
        auth_providers, is_ai_api_key_provider, is_known_provider, provider_label,
        provider_supports_api_key, AuthProvider,
    },
    redact_error, ApiKeyCredentials, AuthMethod, ConnectionStatus, OAuthCredentials,
    SafeCredentialStatus, StoredCredential,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthProgressEvent {
    pub provider_key: String,
    pub status: String,
    pub summary: String,
    pub auth_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConnectedAccountPayload {
    pub id: i64,
    pub provider_key: String,
    pub provider_label: String,
    pub auth_method: AuthMethod,
    pub status: ConnectionStatus,
    pub scopes: String,
    pub account_label: String,
    pub account_id: String,
    pub expires_at: Option<String>,
    pub refresh_expires_at: Option<String>,
    pub has_base_url_override: bool,
    pub last_checked_at: Option<String>,
    pub last_error: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CredentialEventPayload {
    pub id: i64,
    pub provider_key: String,
    pub event_type: String,
    pub summary: String,
    pub metadata_json: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatusPayload {
    pub providers: Vec<AuthProvider>,
    pub accounts: Vec<ConnectedAccountPayload>,
    pub events: Vec<CredentialEventPayload>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveApiKeyInput {
    pub provider_key: String,
    pub api_key: String,
    pub base_url: Option<String>,
    pub account_label: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthStartInput {
    pub provider_key: String,
    pub scopes: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthStartResult {
    pub provider_key: String,
    pub auth_url: String,
    pub state: String,
    pub needs_code: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthCodeInput {
    pub provider_key: String,
    pub code: String,
    pub state: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInput {
    pub provider_key: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSecretPayload {
    pub provider_key: String,
    pub api_key: String,
    pub base_url: Option<String>,
}

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

fn timestamp_string(value: Option<i64>) -> Option<String> {
    value.map(|timestamp| timestamp.to_string())
}

fn now_string() -> String {
    super::unix_timestamp().to_string()
}

fn status_to_account(index: usize, status: SafeCredentialStatus) -> ConnectedAccountPayload {
    ConnectedAccountPayload {
        id: (index + 1) as i64,
        provider_label: provider_label(&status.provider_key).to_string(),
        scopes: status.scopes.join(" "),
        account_label: status.account_label,
        account_id: status.account_id,
        expires_at: timestamp_string(status.expires_at),
        refresh_expires_at: timestamp_string(status.refresh_expires_at),
        has_base_url_override: status.has_base_url_override,
        last_checked_at: Some(now_string()),
        last_error: status.last_error,
        created_at: now_string(),
        updated_at: now_string(),
        provider_key: status.provider_key,
        auth_method: status.auth_method,
        status: status.status,
    }
}

fn emit_auth_progress(app: &AppHandle, event: AuthProgressEvent) {
    let _ = app.emit("linkgo://auth-progress", event);
}

fn ensure_known_provider(provider_key: &str) -> Result<(), String> {
    if is_known_provider(provider_key) {
        Ok(())
    } else {
        Err("Unknown auth provider".to_string())
    }
}

fn ensure_api_key_input(input: &SaveApiKeyInput) -> Result<(), String> {
    if input.api_key.trim().len() < 8 {
        return Err("API key is too short".to_string());
    }
    if input.provider_key == "custom"
        && input
            .base_url
            .as_ref()
            .map_or(true, |base_url| base_url.trim().is_empty())
    {
        return Err("Custom provider requires a Base URL override".to_string());
    }
    Ok(())
}

fn has_linkedin_publish_scope(credentials: &OAuthCredentials) -> bool {
    credentials.scopes.is_empty()
        || credentials
            .scopes
            .iter()
            .any(|scope| scope == "w_member_social")
}

fn linkedin_oauth_credentials(
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

fn credentials_need_refresh(credentials: &OAuthCredentials) -> bool {
    credentials.expires_at.is_some_and(|expires_at| {
        expires_at <= super::unix_timestamp() + super::REFRESH_SKEW_SECONDS
    })
}

fn merge_refreshed_linkedin_credential(
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

fn ensure_publish_input(input: &LinkedInPublishPostInput) -> Result<(), String> {
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

struct PublishApprovalPreflight {
    commentary: String,
}

fn compose_linkedin_commentary(hook: &str, body: &str, cta: &str, hashtags: &str) -> String {
    [hook, body, cta, hashtags]
        .into_iter()
        .map(str::trim)
        .filter(|block| !block.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn escape_linkedin_little_text(text: &str) -> String {
    text.chars()
        .flat_map(|character| match character {
            '|' | '{' | '}' | '@' | '[' | ']' | '(' | ')' | '<' | '>' | '#' | '\\' | '*' | '_'
            | '~' => vec!['\\', character],
            _ => vec![character],
        })
        .collect()
}

fn app_sqlite_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut app_path = app
        .path()
        .app_config_dir()
        .map_err(|_| "Could not resolve app config directory".to_string())?;
    app_path.push("linkgo.db");
    Ok(app_path)
}

async fn load_publish_preflight(
    app: &AppHandle,
    input: &LinkedInPublishPostInput,
) -> Result<PublishApprovalPreflight, String> {
    let pool = SqlitePool::connect_with(SqliteConnectOptions::new().filename(app_sqlite_path(app)?))
        .await
        .map_err(|_| "Could not open Linkgo database".to_string())?;

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

fn ensure_publish_preflight(
    app: &AppHandle,
    input: &LinkedInPublishPostInput,
) -> Result<PublishApprovalPreflight, String> {
    tauri::async_runtime::block_on(load_publish_preflight(app, input))
}

fn ensure_linkedin_account_identity(credentials: &mut OAuthCredentials) -> Result<bool, String> {
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

#[tauri::command]
pub fn linkgo_auth_status(app: AppHandle) -> Result<AuthStatusPayload, String> {
    let storage = AuthStorage::new(&app)?;
    let accounts = storage
        .list_statuses()?
        .into_iter()
        .enumerate()
        .map(|(index, status)| status_to_account(index, status))
        .collect();
    Ok(AuthStatusPayload {
        providers: auth_providers(),
        accounts,
        events: Vec::new(),
    })
}

#[tauri::command]
pub fn linkgo_auth_api_key(
    app: AppHandle,
    input: SaveApiKeyInput,
) -> Result<AuthStatusPayload, String> {
    ensure_known_provider(&input.provider_key)?;
    if !provider_supports_api_key(&input.provider_key) {
        return Err("Provider does not support API-key auth".to_string());
    }
    ensure_api_key_input(&input)?;
    let storage = AuthStorage::new(&app)?;
    storage.save(StoredCredential::ApiKey(ApiKeyCredentials {
        api_key: input.api_key.trim().to_string(),
        base_url: input.base_url.filter(|value| !value.trim().is_empty()),
        account_label: input.account_label.filter(|value| !value.trim().is_empty()),
        provider_key: input.provider_key.clone(),
    }))?;
    emit_auth_progress(
        &app,
        AuthProgressEvent {
            provider_key: input.provider_key.clone(),
            status: "auth_done".to_string(),
            summary: format!("{} API key connected", provider_label(&input.provider_key)),
            auth_url: None,
        },
    );
    linkgo_auth_status(app).map_err(redact_error)
}

#[tauri::command]
pub fn linkgo_auth_provider_secret(
    app: AppHandle,
    input: ProviderInput,
) -> Result<ProviderSecretPayload, String> {
    ensure_known_provider(&input.provider_key)?;
    if !is_ai_api_key_provider(&input.provider_key) {
        return Err("Provider secret is only available for AI API-key providers".to_string());
    }

    let storage = AuthStorage::new(&app)?;
    match storage.load(&input.provider_key).map_err(redact_error)? {
        Some(StoredCredential::ApiKey(credentials)) => Ok(ProviderSecretPayload {
            provider_key: input.provider_key,
            api_key: credentials.api_key,
            base_url: credentials.base_url,
        }),
        Some(_) => Err("Provider is not connected with API-key auth".to_string()),
        None => Err("Provider is not connected".to_string()),
    }
    .map_err(redact_error)
}

#[tauri::command]
pub fn linkgo_auth_oauth_start(
    app: AppHandle,
    input: OAuthStartInput,
) -> Result<OAuthStartResult, String> {
    ensure_known_provider(&input.provider_key)?;
    if input.provider_key != "linkedin" {
        return Err("OAuth is currently available for LinkedIn".to_string());
    }
    let start = start_linkedin_oauth(input.scopes.unwrap_or_default())?;
    persist_pending_oauth_session(
        &app,
        &input.provider_key,
        &start.state,
        &start.pkce_verifier,
    )?;
    emit_auth_progress(
        &app,
        AuthProgressEvent {
            provider_key: input.provider_key.clone(),
            status: "auth_url".to_string(),
            summary: "LinkedIn authorization URL created".to_string(),
            auth_url: Some(start.auth_url.clone()),
        },
    );
    Ok(OAuthStartResult {
        provider_key: input.provider_key,
        auth_url: start.auth_url,
        state: start.state,
        needs_code: start.needs_code,
    })
}

#[tauri::command]
pub fn linkgo_auth_oauth_code(
    app: AppHandle,
    input: OAuthCodeInput,
) -> Result<AuthStatusPayload, String> {
    ensure_known_provider(&input.provider_key)?;
    if input.provider_key != "linkedin" {
        return Err("OAuth code exchange is currently available for LinkedIn".to_string());
    }
    if input.code.trim().is_empty() {
        return Err("LinkedIn OAuth code is required".to_string());
    }
    let pkce_verifier = verify_and_take_oauth_session(&app, &input.provider_key, &input.state)?;
    let credential = exchange_linkedin_code(&input.code, &input.state, &pkce_verifier)?;
    let storage = AuthStorage::new(&app)?;
    storage.save(credential)?;
    emit_auth_progress(
        &app,
        AuthProgressEvent {
            provider_key: input.provider_key.clone(),
            status: "auth_done".to_string(),
            summary: "LinkedIn OAuth connected".to_string(),
            auth_url: None,
        },
    );
    linkgo_auth_status(app).map_err(redact_error)
}

#[tauri::command]
pub fn linkgo_auth_logout(
    app: AppHandle,
    input: ProviderInput,
) -> Result<AuthStatusPayload, String> {
    ensure_known_provider(&input.provider_key)?;
    let storage = AuthStorage::new(&app)?;
    let _ = storage.clear(&input.provider_key)?;
    emit_auth_progress(
        &app,
        AuthProgressEvent {
            provider_key: input.provider_key.clone(),
            status: "auth_status".to_string(),
            summary: format!("{} disconnected", provider_label(&input.provider_key)),
            auth_url: None,
        },
    );
    linkgo_auth_status(app).map_err(redact_error)
}

#[tauri::command]
pub fn linkgo_auth_check(
    app: AppHandle,
    input: ProviderInput,
) -> Result<AuthStatusPayload, String> {
    ensure_known_provider(&input.provider_key)?;
    let storage = AuthStorage::new(&app)?;
    if let Some(StoredCredential::OAuth(mut credentials)) = storage.load(&input.provider_key)? {
        if credentials.provider_key == "linkedin" {
            let mut should_save = false;
            if credentials_need_refresh(&credentials) {
                match refresh_linkedin_credential(credentials.clone()) {
                    Ok(next) => {
                        credentials = merge_refreshed_linkedin_credential(credentials, next)?;
                        should_save = true;
                    }
                    Err(error) => {
                        emit_auth_progress(
                            &app,
                            AuthProgressEvent {
                                provider_key: input.provider_key.clone(),
                                status: "auth_error".to_string(),
                                summary: redact_error(error),
                                auth_url: None,
                            },
                        );
                    }
                }
            }

            if ensure_linkedin_account_identity(&mut credentials).unwrap_or(false) {
                should_save = true;
            }
            if should_save {
                storage.save(StoredCredential::OAuth(credentials))?;
            }
        }
    }
    linkgo_auth_status(app).map_err(redact_error)
}

#[tauri::command]
pub fn linkgo_linkedin_publish_post(
    app: AppHandle,
    input: LinkedInPublishPostInput,
) -> Result<LinkedInPublishPostResult, String> {
    ensure_publish_input(&input)?;
    let preflight = ensure_publish_preflight(&app, &input)?;
    let storage = AuthStorage::new(&app)?;
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
        credentials_need_refresh, ensure_api_key_input, has_linkedin_publish_scope,
        linkedin_oauth_credentials, merge_refreshed_linkedin_credential, SaveApiKeyInput,
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

    fn api_key_input(provider_key: &str, base_url: Option<&str>) -> SaveApiKeyInput {
        SaveApiKeyInput {
            provider_key: provider_key.to_string(),
            api_key: "sk-test-secret".to_string(),
            base_url: base_url.map(str::to_string),
            account_label: None,
        }
    }

    #[test]
    fn custom_api_key_requires_base_url() {
        let error = ensure_api_key_input(&api_key_input("custom", None)).unwrap_err();
        assert_eq!(error, "Custom provider requires a Base URL override");

        let blank_error = ensure_api_key_input(&api_key_input("custom", Some("  "))).unwrap_err();
        assert_eq!(blank_error, "Custom provider requires a Base URL override");
    }

    #[test]
    fn built_in_api_key_provider_keeps_base_url_optional() {
        assert!(ensure_api_key_input(&api_key_input("openai", None)).is_ok());
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
    fn empty_scopes_are_treated_as_unknown_not_blocking() {
        let mut credentials = linkedin_credentials(None);
        credentials.scopes = Vec::new();

        assert!(has_linkedin_publish_scope(&credentials));
    }

    #[test]
    fn refreshed_credentials_preserve_missing_identity_and_scopes() {
        let previous = linkedin_credentials(None);
        let refreshed = StoredCredential::OAuth(OAuthCredentials {
            access_token: "next-access".to_string(),
            refresh_token: None,
            expires_at: Some(crate::auth::unix_timestamp() + 3600),
            refresh_expires_at: None,
            account_id: None,
            account_label: None,
            scopes: Vec::new(),
            provider_key: "linkedin".to_string(),
        });

        let merged = merge_refreshed_linkedin_credential(previous, refreshed).unwrap();

        assert_eq!(merged.access_token, "next-access");
        assert_eq!(merged.refresh_token.as_deref(), Some("refresh"));
        assert_eq!(merged.account_id.as_deref(), Some("person-1"));
        assert_eq!(merged.scopes, vec!["w_member_social".to_string()]);
    }
}
