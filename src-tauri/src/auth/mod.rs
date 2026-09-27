pub mod ai_oauth;
pub mod ai_signin;
pub mod anthropic_oauth;
pub mod commands;
pub mod linkedin;
pub mod linkedin_api;
pub mod loopback;
pub mod oauth;
pub mod openai_oauth;
pub mod providers;
pub mod publish;
pub mod refresh;
pub mod storage;

use crate::net::destination::{validate_provider_destination, LocalConsent};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

pub const REFRESH_SKEW_SECONDS: i64 = 60;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethod {
    // snake_case would emit "o_auth"; the renderer contract is "oauth".
    #[serde(rename = "oauth", alias = "o_auth")]
    OAuth,
    ApiKey,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionStatus {
    Disconnected,
    Connected,
    Expired,
    ReauthRequired,
    Error,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthCredentials {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<i64>,
    pub refresh_expires_at: Option<i64>,
    pub account_id: Option<String>,
    pub account_label: Option<String>,
    pub scopes: Vec<String>,
    pub provider_key: String,
    /// Set when the provider rejected a refresh: tokens were cleared and the
    /// operator must sign in again. Absent in entries saved by older builds.
    #[serde(default)]
    pub needs_reauth: bool,
}

/// Debug output never includes token values, so a stray `{:?}` or panic
/// message cannot leak them.
impl std::fmt::Debug for OAuthCredentials {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("OAuthCredentials")
            .field("access_token", &"[redacted]")
            .field(
                "refresh_token",
                &self.refresh_token.as_ref().map(|_| "[redacted]"),
            )
            .field("expires_at", &self.expires_at)
            .field("account_label", &self.account_label)
            .field("provider_key", &self.provider_key)
            .field("needs_reauth", &self.needs_reauth)
            .finish_non_exhaustive()
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyCredentials {
    pub api_key: String,
    pub base_url: Option<String>,
    pub account_label: Option<String>,
    pub provider_key: String,
    /// Explicit user consent to send this credential to a loopback/private
    /// Base URL (see `net::destination`). Absent in entries saved by older
    /// builds, which therefore default to no consent.
    #[serde(default)]
    pub allow_local_destination: bool,
}

impl std::fmt::Debug for ApiKeyCredentials {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ApiKeyCredentials")
            .field("api_key", &"[redacted]")
            .field("base_url", &self.base_url)
            .field("provider_key", &self.provider_key)
            .finish_non_exhaustive()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StoredCredential {
    OAuth(OAuthCredentials),
    ApiKey(ApiKeyCredentials),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SafeCredentialStatus {
    pub provider_key: String,
    pub auth_method: AuthMethod,
    pub status: ConnectionStatus,
    pub scopes: Vec<String>,
    pub account_label: String,
    pub account_id: String,
    pub expires_at: Option<i64>,
    pub refresh_expires_at: Option<i64>,
    pub has_base_url_override: bool,
    pub last_error: String,
}

impl StoredCredential {
    pub fn provider_key(&self) -> &str {
        match self {
            StoredCredential::OAuth(credentials) => &credentials.provider_key,
            StoredCredential::ApiKey(credentials) => &credentials.provider_key,
        }
    }

    pub fn safe_status(&self) -> SafeCredentialStatus {
        let now = unix_timestamp();
        match self {
            StoredCredential::OAuth(credentials) => {
                let (status, last_error) = if credentials.needs_reauth {
                    (
                        ConnectionStatus::ReauthRequired,
                        "Sign-in expired or was revoked; reconnect this provider".to_string(),
                    )
                } else {
                    match credentials.expires_at {
                        Some(expires_at) if expires_at <= now + REFRESH_SKEW_SECONDS => {
                            (ConnectionStatus::Expired, String::new())
                        }
                        _ => (ConnectionStatus::Connected, String::new()),
                    }
                };
                SafeCredentialStatus {
                    provider_key: credentials.provider_key.clone(),
                    auth_method: AuthMethod::OAuth,
                    status,
                    scopes: credentials.scopes.clone(),
                    account_label: credentials.account_label.clone().unwrap_or_default(),
                    account_id: credentials.account_id.clone().unwrap_or_default(),
                    expires_at: credentials.expires_at,
                    refresh_expires_at: credentials.refresh_expires_at,
                    has_base_url_override: false,
                    last_error,
                }
            }
            StoredCredential::ApiKey(credentials) => {
                let base_url = credentials
                    .base_url
                    .as_deref()
                    .map(str::trim)
                    .filter(|base_url| !base_url.is_empty());
                // Mirror the execution-time re-validation so a Base URL saved
                // by an older build without consent is not reported as ready.
                // The error text is user-safe and never includes the URL.
                let (status, last_error) = match base_url.map(|raw| {
                    validate_provider_destination(
                        raw,
                        LocalConsent::from_flag(credentials.allow_local_destination),
                    )
                }) {
                    Some(Err(error)) => (ConnectionStatus::ReauthRequired, error.to_string()),
                    _ => (ConnectionStatus::Connected, String::new()),
                };
                SafeCredentialStatus {
                    provider_key: credentials.provider_key.clone(),
                    auth_method: AuthMethod::ApiKey,
                    status,
                    scopes: Vec::new(),
                    account_label: credentials.account_label.clone().unwrap_or_default(),
                    account_id: String::new(),
                    expires_at: None,
                    refresh_expires_at: None,
                    has_base_url_override: base_url.is_some(),
                    last_error,
                }
            }
        }
    }
}

pub fn unix_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}

#[allow(dead_code)]
pub fn redact_secret(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let visible_suffix: String = trimmed
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("••••{}", visible_suffix)
}

pub fn redact_error(error: impl ToString) -> String {
    let message = error.to_string();
    let lowered = message.to_ascii_lowercase();
    if lowered.contains("token") || lowered.contains("api key") || lowered.contains("secret") {
        "Credential operation failed; secret details were redacted".to_string()
    } else {
        message
    }
}

#[cfg(test)]
mod tests {
    use super::{
        redact_error, redact_secret, ApiKeyCredentials, ConnectionStatus, OAuthCredentials,
        StoredCredential,
    };

    #[test]
    fn oauth_needing_reauth_reports_reconnect_state_without_secrets() {
        let credential = StoredCredential::OAuth(OAuthCredentials {
            access_token: String::new(),
            refresh_token: None,
            expires_at: Some(super::unix_timestamp() + 3600),
            refresh_expires_at: None,
            account_id: Some("acct".to_string()),
            account_label: Some("me@example.com".to_string()),
            scopes: Vec::new(),
            provider_key: "openai".to_string(),
            needs_reauth: true,
        });
        let status = credential.safe_status();
        assert_eq!(status.status, ConnectionStatus::ReauthRequired);
        assert!(status.last_error.contains("reconnect"));
        assert_eq!(status.account_label, "me@example.com");
    }

    #[test]
    fn ai_oauth_tokens_never_appear_in_debug_or_safe_status() {
        let credential = StoredCredential::OAuth(OAuthCredentials {
            access_token: "access-SECRET-1".to_string(),
            refresh_token: Some("refresh-SECRET-2".to_string()),
            expires_at: Some(super::unix_timestamp() + 3600),
            refresh_expires_at: None,
            account_id: Some("acct".to_string()),
            account_label: Some("me@example.com".to_string()),
            scopes: vec!["user:inference".to_string()],
            provider_key: "anthropic".to_string(),
            needs_reauth: false,
        });
        let debug = format!("{credential:?}");
        let status = serde_json::to_string(&credential.safe_status()).expect("status json");
        for output in [debug, status] {
            assert!(!output.contains("SECRET"), "{output}");
        }
        let api_key = StoredCredential::ApiKey(ApiKeyCredentials {
            api_key: "sk-SECRET-3".to_string(),
            base_url: None,
            account_label: None,
            provider_key: "openai".to_string(),
            allow_local_destination: false,
        });
        assert!(!format!("{api_key:?}").contains("SECRET"));
    }

    #[test]
    fn legacy_oauth_entry_without_needs_reauth_deserializes() {
        let json = r#"{"kind":"o_auth","accessToken":"a","refreshToken":null,"expiresAt":null,"refreshExpiresAt":null,"accountId":null,"accountLabel":null,"scopes":[],"providerKey":"linkedin"}"#;
        let StoredCredential::OAuth(credentials) =
            serde_json::from_str::<StoredCredential>(json).expect("legacy oauth")
        else {
            panic!("expected oauth");
        };
        assert!(!credentials.needs_reauth);
    }

    fn api_key_status(
        base_url: Option<&str>,
        allow_local_destination: bool,
    ) -> (ConnectionStatus, String) {
        let credential = StoredCredential::ApiKey(ApiKeyCredentials {
            api_key: "sk-test-secret".to_string(),
            base_url: base_url.map(str::to_string),
            account_label: None,
            provider_key: "custom".to_string(),
            allow_local_destination,
        });
        let status = credential.safe_status();
        (status.status, status.last_error)
    }

    #[test]
    fn api_key_status_flags_disallowed_base_url_for_reauth() {
        let (status, last_error) = api_key_status(Some("http://localhost:11434/v1"), false);
        assert_eq!(status, ConnectionStatus::ReauthRequired);
        assert!(!last_error.is_empty());
        assert!(!last_error.contains("localhost"));
        assert!(!last_error.contains("sk-test"));
    }

    #[test]
    fn api_key_status_connected_for_allowed_base_urls() {
        for (base_url, consent) in [
            (Some("http://localhost:11434/v1"), true),
            (Some("https://api.example.com/v1"), false),
            (Some("   "), false),
            (None, false),
        ] {
            let (status, last_error) = api_key_status(base_url, consent);
            assert_eq!(status, ConnectionStatus::Connected, "{base_url:?}");
            assert_eq!(last_error, "", "{base_url:?}");
        }
    }

    #[test]
    fn api_key_status_flags_insecure_public_base_url() {
        let (status, _) = api_key_status(Some("http://api.example.com/v1"), true);
        assert_eq!(status, ConnectionStatus::ReauthRequired);
    }

    #[test]
    fn redacts_secret_values_and_secret_errors() {
        assert_eq!(redact_secret("sk-test-secret"), "••••cret");
        assert_eq!(
            redact_error("api key abc failed"),
            "Credential operation failed; secret details were redacted"
        );
    }
}
