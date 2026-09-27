//! Orchestrates OpenAI / Anthropic account sign-in for the auth commands:
//! risk-acknowledgement gate, pending PKCE session, OpenAI loopback worker,
//! pasted-code exchange and cancel. Tokens are saved natively and never
//! returned to the renderer.

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};

use super::ai_oauth::{
    ensure_state_matches, parse_authorization_input, token_response_to_credentials,
    AiOAuthProvider, TokenResponse,
};
use super::loopback::{self, CancelHandle, LoopbackError};
use super::oauth::{
    create_oauth_security_material, discard_pending_oauth_sessions, persist_pending_oauth_session,
    verify_and_take_oauth_session,
};
use super::storage::AuthStorage;
use super::{anthropic_oauth, openai_oauth, redact_error, unix_timestamp, StoredCredential};
use crate::net::transport::{provider_http_client, TransportPolicy};

pub const TERMS_ACK_REQUIRED: &str =
    "Tick the acknowledgement before signing in with an AI provider account";

/// Tauri managed state: cancel handles of running loopback listeners.
#[derive(Debug, Default)]
pub struct AiSignInSessions {
    loopbacks: Mutex<HashMap<String, CancelHandle>>,
}

impl AiSignInSessions {
    fn replace(&self, provider_key: &str, handle: CancelHandle) {
        let mut loopbacks = self
            .loopbacks
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(previous) = loopbacks.insert(provider_key.to_string(), handle) {
            previous.cancel();
        }
    }

    /// Cancels and forgets the running listener, if any.
    pub fn cancel(&self, provider_key: &str) -> bool {
        let mut loopbacks = self
            .loopbacks
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        loopbacks
            .remove(provider_key)
            .map(|handle| handle.cancel())
            .is_some()
    }

    fn forget_if_current(&self, provider_key: &str, handle: &CancelHandle) {
        let mut loopbacks = self
            .loopbacks
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if loopbacks
            .get(provider_key)
            .is_some_and(|current| current.same_as(handle))
        {
            loopbacks.remove(provider_key);
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressEvent {
    provider_key: String,
    status: String,
    summary: String,
    auth_url: Option<String>,
}

fn emit(app: &AppHandle, provider: AiOAuthProvider, status: &str, summary: String) {
    let _ = app.emit(
        "linkgo://auth-progress",
        ProgressEvent {
            provider_key: provider.key().to_string(),
            status: status.to_string(),
            summary,
            auth_url: None,
        },
    );
}

pub struct AiSignInStart {
    pub auth_url: String,
    pub state: String,
    pub needs_code: bool,
}

/// The renderer must relay an explicit acknowledgement; native code refuses
/// otherwise so the gate cannot be skipped by a modified UI.
pub fn require_terms_acknowledgement(acknowledged: Option<bool>) -> Result<(), String> {
    if acknowledged == Some(true) {
        Ok(())
    } else {
        Err(TERMS_ACK_REQUIRED.to_string())
    }
}

pub fn start(
    app: &AppHandle,
    provider: AiOAuthProvider,
    acknowledged: Option<bool>,
) -> Result<AiSignInStart, String> {
    require_terms_acknowledgement(acknowledged)?;
    let security = create_oauth_security_material();
    persist_pending_oauth_session(
        app,
        provider.key(),
        &security.state,
        &security.pkce_verifier,
    )?;
    let sessions = app.state::<AiSignInSessions>();
    sessions.cancel(provider.key());
    match provider {
        AiOAuthProvider::Anthropic => Ok(AiSignInStart {
            auth_url: anthropic_oauth::build_authorize_url(
                &security.state,
                &security.pkce_challenge,
            ),
            state: security.state,
            needs_code: true,
        }),
        AiOAuthProvider::OpenAi => {
            let auth_url =
                openai_oauth::build_authorize_url(&security.state, &security.pkce_challenge);
            // Retry briefly: a listener cancelled just above may still hold
            // the port until its worker's next poll.
            let needs_code = match loopback::bind_with_retry(
                loopback::OPENAI_CALLBACK_ADDR,
                loopback::BIND_RETRY_ATTEMPTS,
                loopback::BIND_RETRY_DELAY,
            ) {
                Ok(listener) => {
                    let handle = CancelHandle::default();
                    sessions.replace(provider.key(), handle.clone());
                    spawn_loopback_worker(app.clone(), listener, security.state.clone(), handle);
                    false
                }
                // Port busy (for example Codex CLI signing in): paste fallback.
                Err(_) => true,
            };
            Ok(AiSignInStart {
                auth_url,
                state: security.state,
                needs_code,
            })
        }
    }
}

fn spawn_loopback_worker(
    app: AppHandle,
    listener: std::net::TcpListener,
    state: String,
    handle: CancelHandle,
) {
    std::thread::spawn(move || {
        let provider = AiOAuthProvider::OpenAi;
        let result = loopback::wait_for_code(listener, &state, loopback::CALLBACK_TIMEOUT, &handle);
        app.state::<AiSignInSessions>()
            .forget_if_current(provider.key(), &handle);
        match result {
            Ok(code) => match complete(&app, provider, &code, &state) {
                Ok(()) => {}
                Err(error) => emit(&app, provider, "auth_error", error),
            },
            Err(LoopbackError::Cancelled) => {}
            Err(error) => emit(&app, provider, "auth_error", error.message()),
        }
    });
}

fn exchange(
    provider: AiOAuthProvider,
    code: &str,
    state: &str,
    pkce_verifier: &str,
) -> Result<TokenResponse, String> {
    let client = provider_http_client(TransportPolicy::PUBLIC_HTTPS)?;
    let result = match provider {
        AiOAuthProvider::OpenAi => {
            openai_oauth::exchange_code(&client, openai_oauth::TOKEN_URLS, code, pkce_verifier)
        }
        AiOAuthProvider::Anthropic => anthropic_oauth::exchange_code(
            &client,
            anthropic_oauth::TOKEN_URLS,
            code,
            state,
            pkce_verifier,
        ),
    };
    result.map_err(|error| redact_error(error.message()))
}

/// Consumes the pending session for `state`, exchanges the code and saves the
/// credential (replacing any API key saved for the provider).
fn complete(
    app: &AppHandle,
    provider: AiOAuthProvider,
    code: &str,
    state: &str,
) -> Result<(), String> {
    let pkce_verifier = verify_and_take_oauth_session(app, provider.key(), state)?;
    let response = exchange(provider, code, state, &pkce_verifier)?;
    let credentials = token_response_to_credentials(provider, response, None, unix_timestamp())?;
    AuthStorage::new(app)?.save(StoredCredential::OAuth(credentials))?;
    emit(
        app,
        provider,
        "auth_done",
        format!("{} account connected", provider.label()),
    );
    Ok(())
}

/// Handles a pasted callback URL, `code#state` or query string.
pub fn submit_pasted(
    app: &AppHandle,
    provider: AiOAuthProvider,
    pasted: &str,
    expected_state: &str,
) -> Result<(), String> {
    let input = parse_authorization_input(pasted)?;
    // Checked before the pending session is consumed or anything is sent.
    ensure_state_matches(expected_state, &input)?;
    app.state::<AiSignInSessions>().cancel(provider.key());
    complete(app, provider, &input.code, &input.state)
}

/// Silently stops any in-flight sign-in (loopback listener and pending OAuth
/// sessions) for a provider. Used by sign-out, which reports its own outcome.
pub fn stop_pending(app: &AppHandle, provider: AiOAuthProvider) -> Result<(), String> {
    app.state::<AiSignInSessions>().cancel(provider.key());
    discard_pending_oauth_sessions(app, provider.key())
}

/// User-initiated sign-in cancel: stops the pending sign-in and reports it.
pub fn cancel(app: &AppHandle, provider: AiOAuthProvider) -> Result<(), String> {
    stop_pending(app, provider)?;
    emit(
        app,
        provider,
        "auth_status",
        format!("{} sign-in cancelled", provider.label()),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sign_in_requires_explicit_terms_acknowledgement() {
        assert_eq!(
            require_terms_acknowledgement(None).unwrap_err(),
            TERMS_ACK_REQUIRED
        );
        assert!(require_terms_acknowledgement(Some(false)).is_err());
        assert!(require_terms_acknowledgement(Some(true)).is_ok());
    }

    #[test]
    fn replacing_a_listener_cancels_the_previous_one() {
        let sessions = AiSignInSessions::default();
        let first = CancelHandle::default();
        sessions.replace("openai", first.clone());
        let second = CancelHandle::default();
        sessions.replace("openai", second.clone());
        assert!(first.is_cancelled());
        assert!(!second.is_cancelled());
        sessions.forget_if_current("openai", &first);
        assert!(sessions.cancel("openai"));
        assert!(second.is_cancelled());
        assert!(!sessions.cancel("openai"));
    }
}
