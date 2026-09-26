use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use super::publish::{self, sqlite_pool, LinkedInPublishCommentInput, LinkedInPublishPostInput};
use super::storage::AuthStorage;
use super::{
    linkedin::{exchange_linkedin_code, refresh_linkedin_credential, start_linkedin_oauth},
    oauth::{persist_pending_oauth_session, verify_and_take_oauth_session},
    providers::{
        auth_providers, is_ai_api_key_provider, is_known_provider, provider_label,
        provider_supports_api_key, AuthProvider,
    },
    redact_error, ApiKeyCredentials, AuthMethod, ConnectionStatus, SafeCredentialStatus,
    StoredCredential,
};
use crate::publishing::{
    service::{execute, ExecuteContext},
    store::ReserveRequest,
    transport::LiveLinkedInTransport,
    types::{ExecutionCaller, ExecutionOutcome},
};
use std::sync::Arc;

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
            .is_none_or(|base_url| base_url.trim().is_empty())
    {
        return Err("Custom provider requires a Base URL override".to_string());
    }
    Ok(())
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
            if publish::credentials_need_refresh(&credentials) {
                match refresh_linkedin_credential(credentials.clone()) {
                    Ok(next) => {
                        credentials =
                            publish::merge_refreshed_linkedin_credential(credentials, next)?;
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

            if publish::ensure_linkedin_account_identity(&mut credentials).unwrap_or(false) {
                should_save = true;
            }
            if should_save {
                storage.save(StoredCredential::OAuth(credentials))?;
            }
        }
    }
    linkgo_auth_status(app).map_err(redact_error)
}

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}

async fn execute_manual(
    app: AppHandle,
    request: ReserveRequest,
) -> Result<ExecutionOutcome, String> {
    let pool = sqlite_pool(&app).await?;
    let now_epoch = unix_now();
    // Release or surface a crashed earlier execution of this item before
    // reserving, even while the scheduler worker is stopped.
    crate::publishing::recovery::sweep_with_saved_settings(&pool, now_epoch).await?;
    execute(
        ExecuteContext {
            pool: &pool,
            transport: Arc::new(LiveLinkedInTransport::new(app.clone())),
            caller: ExecutionCaller::Manual,
            retry_backoff_minutes: 0,
            now_epoch,
        },
        request,
    )
    .await
}

/// Manual post publish through the shared execution service: reservation,
/// LinkedIn call and settlement all happen natively in one command.
#[tauri::command]
pub async fn linkgo_linkedin_publish_post(
    app: AppHandle,
    input: LinkedInPublishPostInput,
) -> Result<ExecutionOutcome, String> {
    execute_manual(app, ReserveRequest::Post(input)).await
}

/// Manual comment publish through the shared execution service.
#[tauri::command]
pub async fn linkgo_linkedin_publish_comment(
    app: AppHandle,
    input: LinkedInPublishCommentInput,
) -> Result<ExecutionOutcome, String> {
    execute_manual(app, ReserveRequest::Comment(input)).await
}

#[cfg(test)]
mod tests {
    use super::{ensure_api_key_input, SaveApiKeyInput};
    use crate::auth::publish::{
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
