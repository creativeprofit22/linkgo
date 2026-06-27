pub mod commands;
pub mod linkedin;
pub mod oauth;
pub mod providers;
pub mod storage;

use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

pub const REFRESH_SKEW_SECONDS: i64 = 60;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethod {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyCredentials {
    pub api_key: String,
    pub base_url: Option<String>,
    pub account_label: Option<String>,
    pub provider_key: String,
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
                let status = match credentials.expires_at {
                    Some(expires_at) if expires_at <= now + REFRESH_SKEW_SECONDS => {
                        ConnectionStatus::Expired
                    }
                    _ => ConnectionStatus::Connected,
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
                    last_error: String::new(),
                }
            }
            StoredCredential::ApiKey(credentials) => SafeCredentialStatus {
                provider_key: credentials.provider_key.clone(),
                auth_method: AuthMethod::ApiKey,
                status: ConnectionStatus::Connected,
                scopes: Vec::new(),
                account_label: credentials.account_label.clone().unwrap_or_default(),
                account_id: String::new(),
                expires_at: None,
                refresh_expires_at: None,
                last_error: String::new(),
            },
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
    use super::{redact_error, redact_secret};

    #[test]
    fn redacts_secret_values_and_secret_errors() {
        assert_eq!(redact_secret("sk-test-secret"), "••••cret");
        assert_eq!(
            redact_error("api key abc failed"),
            "Credential operation failed; secret details were redacted"
        );
    }
}
