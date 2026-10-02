use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use super::claude_code_version;
use super::external_browser;
use super::publish::{self, sqlite_pool, LinkedInPublishCommentInput, LinkedInPublishPostInput};
use super::storage::AuthStorage;
use super::{
    ai_oauth::AiOAuthProvider,
    ai_signin,
    linkedin::{exchange_linkedin_code, refresh_linkedin_credential, start_linkedin_oauth},
    oauth::{persist_pending_oauth_session, verify_and_take_oauth_session},
    providers::{
        auth_providers, is_known_provider, provider_label, provider_supports_api_key,
        provider_supports_oauth, AuthProvider,
    },
    redact_error,
    refresh::{ensure_fresh_ai_credential, OAuthRefreshLocks, RefreshEndpoints, RefreshMode},
    ApiKeyCredentials, AuthMethod, ConnectionStatus, SafeCredentialStatus, StoredCredential,
};
use crate::net::destination::{validate_provider_destination, LocalConsent, ProviderDestination};
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
    /// Explicit consent for a loopback/private Base URL. Native policy stays
    /// authoritative; the renderer only relays the user's choice.
    #[serde(default)]
    pub allow_local_destination: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthStartInput {
    pub provider_key: String,
    /// LinkedIn only; OpenAI/Anthropic scopes are fixed and non-empty values are rejected.
    pub scopes: Option<Vec<String>>,
    /// Required (`true`) for OpenAI/Anthropic account sign-in: the operator
    /// acknowledged the provider-terms and account risk.
    #[serde(default)]
    pub acknowledge_terms_risk: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthStartResult {
    pub provider_key: String,
    pub auth_url: String,
    pub state: String,
    pub needs_code: bool,
    /// Whether native code launched the default browser at `auth_url`. The
    /// WebView cannot open external links, so the UI falls back to copying.
    pub browser_opened: bool,
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

/// Validates API-key input and returns the policy-checked Base URL to store.
/// The Base URL must pass the native destination policy before any secret is
/// persisted next to it.
fn validated_destination(input: &SaveApiKeyInput) -> Result<Option<ProviderDestination>, String> {
    if input.api_key.trim().len() < 8 {
        return Err("API key is too short".to_string());
    }
    let base_url = input
        .base_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if input.provider_key == "brightdata" && base_url.is_some() {
        // The Bright Data client talks to one fixed host only.
        return Err("Bright Data does not accept a Base URL override".to_string());
    }
    let Some(base_url) = base_url else {
        if input.provider_key == "custom" {
            return Err("Custom provider requires a Base URL override".to_string());
        }
        return Ok(None);
    };
    let destination = validate_provider_destination(
        base_url,
        LocalConsent::from_flag(input.allow_local_destination),
    )
    .map_err(|error| error.to_string())?;
    Ok(Some(destination))
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
    let destination = validated_destination(&input)?;
    // Consent is only stored for destinations that actually are local, so it
    // can never relax transport protections for a public host.
    let allow_local_destination = input.allow_local_destination
        && destination
            .as_ref()
            .is_some_and(ProviderDestination::is_local);
    let base_url = destination.map(|destination| destination.as_str().to_string());
    let storage = AuthStorage::new(&app)?;
    storage.save(StoredCredential::ApiKey(ApiKeyCredentials {
        api_key: input.api_key.trim().to_string(),
        base_url,
        account_label: input.account_label.filter(|value| !value.trim().is_empty()),
        provider_key: input.provider_key.clone(),
        allow_local_destination,
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

/// OpenAI/Anthropic sign-in reuses Codex/Claude Code public client IDs, so
/// scopes are fixed constants and must not be caller-controlled.
fn ensure_ai_scopes_unset(scopes: &Option<Vec<String>>) -> Result<(), String> {
    match scopes {
        Some(values) if !values.is_empty() => {
            Err("Scopes are fixed for OpenAI and Anthropic account sign-in".to_string())
        }
        _ => Ok(()),
    }
}

#[tauri::command]
pub fn linkgo_auth_oauth_start(
    app: AppHandle,
    input: OAuthStartInput,
) -> Result<OAuthStartResult, String> {
    ensure_known_provider(&input.provider_key)?;
    if let Some(provider) = AiOAuthProvider::from_key(&input.provider_key) {
        if !provider_supports_oauth(provider.key()) {
            return Err("Provider does not support account sign-in".to_string());
        }
        ensure_ai_scopes_unset(&input.scopes)?;
        let start = ai_signin::start(&app, provider, input.acknowledge_terms_risk)?;
        emit_auth_progress(
            &app,
            AuthProgressEvent {
                provider_key: input.provider_key.clone(),
                status: "auth_url".to_string(),
                summary: format!("{} sign-in URL created", provider.label()),
                auth_url: Some(start.auth_url.clone()),
            },
        );
        let browser_opened = external_browser::open_authorize_url(&start.auth_url).is_ok();
        return Ok(OAuthStartResult {
            provider_key: input.provider_key,
            auth_url: start.auth_url,
            state: start.state,
            needs_code: start.needs_code,
            browser_opened,
        });
    }
    if input.provider_key != "linkedin" {
        return Err("OAuth is currently available for LinkedIn, OpenAI and Anthropic".to_string());
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
    let browser_opened = external_browser::open_authorize_url(&start.auth_url).is_ok();
    Ok(OAuthStartResult {
        provider_key: input.provider_key,
        auth_url: start.auth_url,
        state: start.state,
        needs_code: start.needs_code,
        browser_opened,
    })
}

#[tauri::command]
pub fn linkgo_auth_oauth_code(
    app: AppHandle,
    input: OAuthCodeInput,
) -> Result<AuthStatusPayload, String> {
    ensure_known_provider(&input.provider_key)?;
    if let Some(provider) = AiOAuthProvider::from_key(&input.provider_key) {
        ai_signin::submit_pasted(&app, provider, &input.code, &input.state)?;
        return linkgo_auth_status(app).map_err(redact_error);
    }
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

/// Stops a waiting OpenAI/Anthropic sign-in (loopback listener and pending
/// PKCE session). No credential is changed.
#[tauri::command]
pub fn linkgo_auth_oauth_cancel(
    app: AppHandle,
    input: ProviderInput,
) -> Result<AuthStatusPayload, String> {
    ensure_known_provider(&input.provider_key)?;
    let provider = AiOAuthProvider::from_key(&input.provider_key)
        .ok_or_else(|| "Sign-in cancel is available for OpenAI and Anthropic".to_string())?;
    ai_signin::cancel(&app, provider)?;
    linkgo_auth_status(app).map_err(redact_error)
}

#[tauri::command]
pub fn linkgo_auth_logout(
    app: AppHandle,
    input: ProviderInput,
) -> Result<AuthStatusPayload, String> {
    ensure_known_provider(&input.provider_key)?;
    if let Some(provider) = AiOAuthProvider::from_key(&input.provider_key) {
        // Silent: logout emits its own "disconnected" event below.
        let _ = ai_signin::stop_pending(&app, provider);
    }
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
    locks: tauri::State<'_, OAuthRefreshLocks>,
    input: ProviderInput,
) -> Result<AuthStatusPayload, String> {
    ensure_known_provider(&input.provider_key)?;
    let storage = AuthStorage::new(&app)?;
    if let Some(provider) = AiOAuthProvider::from_key(&input.provider_key) {
        if let Some(StoredCredential::OAuth(credentials)) = storage.load(provider.key())? {
            if !credentials.needs_reauth {
                let user_agent = match provider {
                    AiOAuthProvider::Anthropic => claude_code_version::claude_cli_user_agent(&app),
                    AiOAuthProvider::OpenAi => String::new(),
                };
                let result =
                    RefreshEndpoints::production(provider, user_agent).and_then(|endpoints| {
                        ensure_fresh_ai_credential(
                            &storage,
                            &locks,
                            provider,
                            &endpoints,
                            super::unix_timestamp(),
                            RefreshMode::IfExpiring,
                        )
                    });
                if let Err(error) = result {
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
        return linkgo_auth_status(app).map_err(redact_error);
    }
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
    use super::{ensure_ai_scopes_unset, validated_destination, SaveApiKeyInput};
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
            needs_reauth: false,
        }
    }

    fn api_key_input(provider_key: &str, base_url: Option<&str>) -> SaveApiKeyInput {
        SaveApiKeyInput {
            provider_key: provider_key.to_string(),
            api_key: "test-key-00000000".to_string(),
            base_url: base_url.map(str::to_string),
            account_label: None,
            allow_local_destination: false,
        }
    }

    fn consented(mut input: SaveApiKeyInput) -> SaveApiKeyInput {
        input.allow_local_destination = true;
        input
    }

    fn ensure_api_key_input(input: &SaveApiKeyInput) -> Result<Option<String>, String> {
        Ok(validated_destination(input)?.map(|destination| destination.as_str().to_string()))
    }

    #[test]
    fn base_url_is_normalized_after_policy_validation() {
        let stored = ensure_api_key_input(&api_key_input(
            "custom",
            Some(" https://API.Example.com/v1 "),
        ))
        .unwrap();
        assert_eq!(stored.as_deref(), Some("https://api.example.com/v1"));
    }

    #[test]
    fn rejects_insecure_or_unsafe_base_urls_before_saving() {
        for base_url in [
            "http://api.example.com/v1",
            "ftp://example.com",
            "https://user:pw@example.com",
            "file:///C:/secrets",
        ] {
            assert!(
                ensure_api_key_input(&api_key_input("custom", Some(base_url))).is_err(),
                "{base_url} must be rejected"
            );
            assert!(
                ensure_api_key_input(&consented(api_key_input("custom", Some(base_url)))).is_err(),
                "{base_url} must be rejected even with local consent"
            );
        }
    }

    #[test]
    fn local_base_urls_require_explicit_consent() {
        for base_url in [
            "http://localhost:11434/v1",
            "http://169.254.169.254/latest",
            "http://192.168.1.20:8080/v1",
            "http://[::1]:1234/v1",
        ] {
            let error = ensure_api_key_input(&api_key_input("openai", Some(base_url))).unwrap_err();
            assert!(
                error.contains("allow the local endpoint"),
                "{base_url}: {error}"
            );
            assert!(
                ensure_api_key_input(&consented(api_key_input("openai", Some(base_url)))).is_ok(),
                "{base_url} must be allowed with consent"
            );
        }
    }

    #[test]
    fn brightdata_api_key_rejects_base_url_override() {
        assert!(ensure_api_key_input(&api_key_input("brightdata", None)).is_ok());
        assert_eq!(
            ensure_api_key_input(&api_key_input("brightdata", Some("https://evil.example")))
                .unwrap_err(),
            "Bright Data does not accept a Base URL override"
        );
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
    fn ai_sign_in_rejects_caller_supplied_scopes() {
        assert!(ensure_ai_scopes_unset(&None).is_ok());
        assert!(ensure_ai_scopes_unset(&Some(Vec::new())).is_ok());
        assert_eq!(
            ensure_ai_scopes_unset(&Some(vec!["openid".to_string()])),
            Err("Scopes are fixed for OpenAI and Anthropic account sign-in".to_string())
        );
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
            needs_reauth: false,
        });

        let merged = merge_refreshed_linkedin_credential(previous, refreshed).unwrap();

        assert_eq!(merged.access_token, "next-access");
        assert_eq!(merged.refresh_token.as_deref(), Some("refresh"));
        assert_eq!(merged.account_id.as_deref(), Some("person-1"));
        assert_eq!(merged.scopes, vec!["w_member_social".to_string()]);
    }
}
