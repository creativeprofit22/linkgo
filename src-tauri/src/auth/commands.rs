use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use super::storage::AuthStorage;
use super::{
    linkedin::{exchange_linkedin_code, refresh_linkedin_credential, start_linkedin_oauth},
    oauth::{persist_pending_oauth_session, verify_and_take_oauth_session},
    providers::{
        auth_providers, is_known_provider, provider_label, provider_supports_api_key, AuthProvider,
    },
    redact_error, ApiKeyCredentials, AuthMethod, ConnectionStatus, SafeCredentialStatus,
    StoredCredential,
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
    if input.api_key.trim().len() < 8 {
        return Err("API key is too short".to_string());
    }
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
    if let Some(StoredCredential::OAuth(credentials)) = storage.load(&input.provider_key)? {
        if credentials.provider_key == "linkedin"
            && credentials.expires_at.is_some_and(|expires_at| {
                expires_at <= super::unix_timestamp() + super::REFRESH_SKEW_SECONDS
            })
        {
            match refresh_linkedin_credential(credentials) {
                Ok(next) => storage.save(next)?,
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
    }
    linkgo_auth_status(app).map_err(redact_error)
}
