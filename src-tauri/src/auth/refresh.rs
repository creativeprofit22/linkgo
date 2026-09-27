//! Serialized refresh of OpenAI / Anthropic sign-in tokens.
//!
//! Both providers rotate refresh tokens, so two concurrent refreshes with the
//! same refresh token would make one of them fail and could lock the operator
//! out. Every refresh takes a per-provider lock, re-loads the stored
//! credential, and only refreshes if the reloaded token still needs it.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use reqwest::blocking::Client;

use super::ai_oauth::{needs_refresh, token_response_to_credentials, AiOAuthProvider, TokenError};
use super::storage::AuthStorage;
use super::{anthropic_oauth, openai_oauth, OAuthCredentials, StoredCredential};
use crate::net::transport::{provider_http_client, TransportPolicy};

/// Tauri managed state: one lock per provider key.
#[derive(Debug, Default)]
pub struct OAuthRefreshLocks {
    locks: Mutex<HashMap<String, Arc<Mutex<()>>>>,
}

impl OAuthRefreshLocks {
    fn lock_for(&self, provider_key: &str) -> Arc<Mutex<()>> {
        let mut locks = self
            .locks
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        locks
            .entry(provider_key.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }
}

/// Storage surface needed by refresh; implemented by the keyring store and by
/// an in-memory store in tests.
pub trait CredentialStore: Sync {
    fn load(&self, provider_key: &str) -> Result<Option<StoredCredential>, String>;
    fn save(&self, credential: StoredCredential) -> Result<(), String>;
}

impl CredentialStore for AuthStorage {
    fn load(&self, provider_key: &str) -> Result<Option<StoredCredential>, String> {
        AuthStorage::load(self, provider_key)
    }
    fn save(&self, credential: StoredCredential) -> Result<(), String> {
        AuthStorage::save(self, credential)
    }
}

/// Where refresh requests go. Production uses the fixed provider constants
/// over the hardened public-HTTPS client; tests point at a local fake server.
pub struct RefreshEndpoints {
    pub client: Client,
    pub token_urls: Vec<String>,
}

impl RefreshEndpoints {
    pub fn production(provider: AiOAuthProvider) -> Result<Self, String> {
        let urls: &[&str] = match provider {
            AiOAuthProvider::OpenAi => openai_oauth::TOKEN_URLS,
            AiOAuthProvider::Anthropic => anthropic_oauth::TOKEN_URLS,
        };
        Ok(Self {
            client: provider_http_client(TransportPolicy::PUBLIC_HTTPS)?,
            token_urls: urls.iter().map(|url| url.to_string()).collect(),
        })
    }
}

pub fn reconnect_message(provider: AiOAuthProvider) -> String {
    format!(
        "{} sign-in expired — reconnect in Integrations",
        provider.label()
    )
}

/// When to refresh.
#[derive(Debug, Clone, Copy)]
pub enum RefreshMode<'a> {
    /// Refresh only inside the expiry skew window.
    IfExpiring,
    /// The provider answered 401 for this access token: refresh unless another
    /// caller already replaced it.
    AfterRejected(&'a str),
}

fn load_oauth(
    store: &dyn CredentialStore,
    provider: AiOAuthProvider,
) -> Result<OAuthCredentials, String> {
    match store.load(provider.key())? {
        Some(StoredCredential::OAuth(credentials)) => Ok(credentials),
        _ => Err(format!("{} is not signed in", provider.label())),
    }
}

/// Returns a usable signed-in credential, refreshing it first when needed.
///
/// - 4xx from the token endpoint: tokens are cleared, `needs_reauth` is saved
///   (keeping the account label), and a reconnect error is returned.
/// - Network error / 5xx: the stored tokens are kept and the error returned.
pub fn ensure_fresh_ai_credential(
    store: &dyn CredentialStore,
    locks: &OAuthRefreshLocks,
    provider: AiOAuthProvider,
    endpoints: &RefreshEndpoints,
    now: i64,
    mode: RefreshMode<'_>,
) -> Result<OAuthCredentials, String> {
    let lock = locks.lock_for(provider.key());
    let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    let current = load_oauth(store, provider)?;
    if current.needs_reauth {
        return Err(reconnect_message(provider));
    }
    let must_refresh = match mode {
        RefreshMode::IfExpiring => needs_refresh(&current, now),
        RefreshMode::AfterRejected(rejected) => current.access_token == rejected,
    };
    if !must_refresh {
        return Ok(current);
    }
    let Some(refresh_token) = current
        .refresh_token
        .clone()
        .filter(|token| !token.is_empty())
    else {
        mark_needs_reauth(store, current)?;
        return Err(reconnect_message(provider));
    };

    let urls: Vec<&str> = endpoints.token_urls.iter().map(String::as_str).collect();
    let result = match provider {
        AiOAuthProvider::OpenAi => openai_oauth::refresh(&endpoints.client, &urls, &refresh_token),
        AiOAuthProvider::Anthropic => {
            anthropic_oauth::refresh(&endpoints.client, &urls, &refresh_token)
        }
    };
    match result {
        Ok(response) => {
            let next = token_response_to_credentials(provider, response, Some(&current), now)?;
            store.save(StoredCredential::OAuth(next.clone()))?;
            Ok(next)
        }
        Err(TokenError::Rejected(_)) => {
            mark_needs_reauth(store, current)?;
            Err(reconnect_message(provider))
        }
        Err(TokenError::Transient(message)) => Err(message),
    }
}

fn mark_needs_reauth(
    store: &dyn CredentialStore,
    mut credentials: OAuthCredentials,
) -> Result<(), String> {
    credentials.access_token.clear();
    credentials.refresh_token = None;
    credentials.needs_reauth = true;
    store.save(StoredCredential::OAuth(credentials))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::ai_oauth::test_support::{fake_jwt, local_client, spawn_fake_server};
    use serde_json::json;
    use std::time::Duration;

    #[derive(Default)]
    struct MemoryStore {
        entries: Mutex<HashMap<String, StoredCredential>>,
    }

    impl CredentialStore for MemoryStore {
        fn load(&self, provider_key: &str) -> Result<Option<StoredCredential>, String> {
            Ok(self
                .entries
                .lock()
                .expect("store")
                .get(provider_key)
                .cloned())
        }
        fn save(&self, credential: StoredCredential) -> Result<(), String> {
            self.entries
                .lock()
                .expect("store")
                .insert(credential.provider_key().to_string(), credential);
            Ok(())
        }
    }

    impl MemoryStore {
        fn oauth(&self, key: &str) -> OAuthCredentials {
            match self.load(key).expect("load") {
                Some(StoredCredential::OAuth(credentials)) => credentials,
                _ => panic!("expected oauth"),
            }
        }
    }

    const NOW: i64 = 1_000_000;

    fn seeded(provider: &str, expires_at: i64) -> MemoryStore {
        let store = MemoryStore::default();
        store
            .save(StoredCredential::OAuth(OAuthCredentials {
                access_token: "old-access".to_string(),
                refresh_token: Some("old-refresh".to_string()),
                expires_at: Some(expires_at),
                refresh_expires_at: None,
                account_id: Some("acct-1".to_string()),
                account_label: Some("me@example.com".to_string()),
                scopes: Vec::new(),
                provider_key: provider.to_string(),
                needs_reauth: false,
            }))
            .expect("seed");
        store
    }

    fn endpoints(url: &str) -> RefreshEndpoints {
        RefreshEndpoints {
            client: local_client(),
            token_urls: vec![url.to_string()],
        }
    }

    fn openai_ok_body() -> String {
        let access =
            fake_jwt(&json!({"https://api.openai.com/auth": {"chatgpt_account_id": "acct-1"}}));
        json!({"access_token": access, "refresh_token": "new-refresh", "expires_in": 3600})
            .to_string()
    }

    #[test]
    fn fresh_token_is_returned_without_calling_provider() {
        let server = spawn_fake_server(vec![(500, String::new())], Duration::ZERO);
        let store = seeded("openai", NOW + 3_600);
        let credentials = ensure_fresh_ai_credential(
            &store,
            &OAuthRefreshLocks::default(),
            AiOAuthProvider::OpenAi,
            &endpoints(&server.url),
            NOW,
            RefreshMode::IfExpiring,
        )
        .expect("fresh");
        assert_eq!(credentials.access_token, "old-access");
        assert_eq!(server.hit_count(), 0);
    }

    #[test]
    fn successful_refresh_rotates_and_saves_tokens() {
        let server = spawn_fake_server(vec![(200, openai_ok_body())], Duration::ZERO);
        let store = seeded("openai", NOW + 10);
        let credentials = ensure_fresh_ai_credential(
            &store,
            &OAuthRefreshLocks::default(),
            AiOAuthProvider::OpenAi,
            &endpoints(&server.url),
            NOW,
            RefreshMode::IfExpiring,
        )
        .expect("refreshed");
        assert_ne!(credentials.access_token, "old-access");
        assert_eq!(credentials.refresh_token.as_deref(), Some("new-refresh"));
        assert_eq!(credentials.expires_at, Some(NOW + 3_600));
        assert_eq!(
            store.oauth("openai").refresh_token.as_deref(),
            Some("new-refresh")
        );
        assert!(server.request(0).contains("refresh_token=old-refresh"));
    }

    #[test]
    fn rejected_refresh_clears_tokens_and_marks_reauth() {
        let server = spawn_fake_server(
            vec![(400, r#"{"error":"invalid_grant"}"#.to_string())],
            Duration::ZERO,
        );
        let store = seeded("anthropic", NOW - 1);
        let error = ensure_fresh_ai_credential(
            &store,
            &OAuthRefreshLocks::default(),
            AiOAuthProvider::Anthropic,
            &endpoints(&server.url),
            NOW,
            RefreshMode::IfExpiring,
        )
        .unwrap_err();
        assert!(error.contains("reconnect"));
        let stored = store.oauth("anthropic");
        assert!(stored.needs_reauth);
        assert!(stored.access_token.is_empty());
        assert_eq!(stored.refresh_token, None);
        assert_eq!(stored.account_label.as_deref(), Some("me@example.com"));
        assert_eq!(
            StoredCredential::OAuth(stored).safe_status().status,
            crate::auth::ConnectionStatus::ReauthRequired
        );
    }

    #[test]
    fn server_error_keeps_tokens() {
        let server = spawn_fake_server(vec![(503, String::new())], Duration::ZERO);
        let store = seeded("openai", NOW - 1);
        let error = ensure_fresh_ai_credential(
            &store,
            &OAuthRefreshLocks::default(),
            AiOAuthProvider::OpenAi,
            &endpoints(&server.url),
            NOW,
            RefreshMode::IfExpiring,
        )
        .unwrap_err();
        assert!(error.contains("503"));
        let stored = store.oauth("openai");
        assert!(!stored.needs_reauth);
        assert_eq!(stored.refresh_token.as_deref(), Some("old-refresh"));
        assert_eq!(stored.access_token, "old-access");
    }

    #[test]
    fn after_rejected_refreshes_only_if_token_unchanged() {
        let server = spawn_fake_server(vec![(200, openai_ok_body())], Duration::ZERO);
        let store = seeded("openai", NOW + 3_600);
        let locks = OAuthRefreshLocks::default();
        let fresh = ensure_fresh_ai_credential(
            &store,
            &locks,
            AiOAuthProvider::OpenAi,
            &endpoints(&server.url),
            NOW,
            RefreshMode::AfterRejected("some-other-token"),
        )
        .expect("unchanged");
        assert_eq!(fresh.access_token, "old-access");
        assert_eq!(server.hit_count(), 0);
        ensure_fresh_ai_credential(
            &store,
            &locks,
            AiOAuthProvider::OpenAi,
            &endpoints(&server.url),
            NOW,
            RefreshMode::AfterRejected("old-access"),
        )
        .expect("forced");
        assert_eq!(server.hit_count(), 1);
    }

    #[test]
    fn concurrent_callers_make_exactly_one_refresh_call() {
        let server = spawn_fake_server(vec![(200, openai_ok_body())], Duration::from_millis(150));
        let store = Arc::new(seeded("openai", NOW - 1));
        let locks = Arc::new(OAuthRefreshLocks::default());
        let url = server.url.clone();
        let handles: Vec<_> = (0..8)
            .map(|_| {
                let (store, locks, url) = (store.clone(), locks.clone(), url.clone());
                std::thread::spawn(move || {
                    ensure_fresh_ai_credential(
                        store.as_ref(),
                        &locks,
                        AiOAuthProvider::OpenAi,
                        &endpoints(&url),
                        NOW,
                        RefreshMode::IfExpiring,
                    )
                })
            })
            .collect();
        let tokens: Vec<String> = handles
            .into_iter()
            .map(|handle| handle.join().expect("join").expect("fresh").access_token)
            .collect();
        assert_eq!(server.hit_count(), 1);
        assert!(tokens.iter().all(|token| token == &tokens[0]));
    }

    #[test]
    fn errors_never_contain_token_values() {
        let server = spawn_fake_server(
            vec![(
                401,
                r#"{"error":"invalid_grant","error_description":"old-refresh is revoked"}"#
                    .to_string(),
            )],
            Duration::ZERO,
        );
        let store = seeded("openai", NOW - 1);
        let error = ensure_fresh_ai_credential(
            &store,
            &OAuthRefreshLocks::default(),
            AiOAuthProvider::OpenAi,
            &endpoints(&server.url),
            NOW,
            RefreshMode::IfExpiring,
        )
        .unwrap_err();
        assert!(!error.contains("old-refresh"));
        assert!(!error.contains("old-access"));
    }
}
