//! Shared pieces of the OpenAI / Anthropic account sign-in flows.
//!
//! Tokens stay native: nothing here returns a token to the renderer, and
//! every error string is built from fixed text plus a sanitized OAuth error
//! code, never from the raw response body.

use reqwest::blocking::Client;
use serde::Deserialize;
use serde_json::Value;

use super::OAuthCredentials;
use crate::net::transport::{read_bounded_json, OAUTH_TOKEN_MAX_RESPONSE_BYTES};

/// AI OAuth access tokens are refreshed when they expire within this window,
/// so a streamed agent call does not start with a token about to lapse.
pub const AI_REFRESH_SKEW_SECONDS: i64 = 300;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AiOAuthProvider {
    OpenAi,
    Anthropic,
}

impl AiOAuthProvider {
    pub fn from_key(provider_key: &str) -> Option<Self> {
        match provider_key {
            "openai" => Some(Self::OpenAi),
            "anthropic" => Some(Self::Anthropic),
            _ => None,
        }
    }

    pub fn key(self) -> &'static str {
        match self {
            Self::OpenAi => "openai",
            Self::Anthropic => "anthropic",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::OpenAi => "OpenAI",
            Self::Anthropic => "Anthropic",
        }
    }

    pub fn default_scopes(self) -> &'static str {
        match self {
            Self::OpenAi => super::openai_oauth::SCOPES,
            Self::Anthropic => super::anthropic_oauth::SCOPES,
        }
    }
}

/// Failure of a token-endpoint call.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TokenError {
    /// The provider answered 4xx (for example `invalid_grant`): authoritative,
    /// the refresh token is no longer usable.
    Rejected(String),
    /// Network error, 5xx or unreadable response: tokens may still be valid.
    Transient(String),
}

impl TokenError {
    pub fn message(&self) -> &str {
        match self {
            Self::Rejected(message) | Self::Transient(message) => message,
        }
    }
}

impl std::fmt::Display for TokenError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.message())
    }
}

#[derive(Clone, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub expires_in: Option<i64>,
    #[serde(default)]
    pub scope: Option<String>,
    #[serde(default)]
    pub id_token: Option<String>,
    #[serde(default)]
    pub account: Option<AnthropicAccount>,
}

impl std::fmt::Debug for TokenResponse {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("TokenResponse")
            .field("expires_in", &self.expires_in)
            .field("scope", &self.scope)
            .finish_non_exhaustive()
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct AnthropicAccount {
    #[serde(default)]
    pub uuid: Option<String>,
    #[serde(default)]
    pub email_address: Option<String>,
}

pub enum TokenBody<'a> {
    Form(&'a [(&'a str, &'a str)]),
    Json(Value),
}

/// Keeps only a short OAuth error code (for example `invalid_grant`) from an
/// error body; everything else in the body is discarded.
fn oauth_error_code(body: &[u8]) -> Option<String> {
    let value: Value = serde_json::from_slice(body).ok()?;
    let raw = value.get("error").and_then(|error| match error {
        Value::String(code) => Some(code.as_str()),
        Value::Object(object) => object.get("type").and_then(Value::as_str),
        _ => None,
    })?;
    let code: String = raw
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || *character == '_')
        .take(64)
        .collect();
    (!code.is_empty()).then_some(code)
}

/// POSTs to a token endpoint through the caller's hardened client and reads
/// the response under the OAuth size cap.
pub fn post_token_request(
    client: &Client,
    url: &str,
    body: TokenBody<'_>,
    headers: &[(&str, &str)],
    label: &str,
) -> Result<TokenResponse, TokenError> {
    let mut request = client.post(url).header("Accept", "application/json");
    for (name, value) in headers {
        request = request.header(*name, *value);
    }
    request = match body {
        TokenBody::Form(fields) => request.form(fields),
        TokenBody::Json(value) => request.json(&value),
    };
    let response = request.send().map_err(|error| {
        let kind = if error.is_timeout() {
            "timed out"
        } else {
            "could not reach the provider"
        };
        TokenError::Transient(format!("{label} {kind}"))
    })?;
    let status = response.status();
    if status.is_success() {
        return read_bounded_json::<TokenResponse>(response, OAUTH_TOKEN_MAX_RESPONSE_BYTES)
            .map_err(|_| TokenError::Transient(format!("{label} returned an unreadable response")))
            .and_then(|parsed| {
                if parsed.access_token.trim().is_empty() {
                    Err(TokenError::Transient(format!(
                        "{label} returned no access credential"
                    )))
                } else {
                    Ok(parsed)
                }
            });
    }
    let body = crate::net::transport::read_bounded_bytes(response, OAUTH_TOKEN_MAX_RESPONSE_BYTES)
        .unwrap_or_default();
    let code = oauth_error_code(&body)
        .map(|code| format!(": {code}"))
        .unwrap_or_default();
    let message = format!("{label} failed (HTTP {}{code})", status.as_u16());
    if status.is_client_error() {
        Err(TokenError::Rejected(message))
    } else {
        Err(TokenError::Transient(message))
    }
}

/// Code and state pulled from what the operator pasted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorizationInput {
    pub code: String,
    pub state: String,
}

const MAX_AUTHORIZATION_INPUT_CHARS: usize = 4096;

fn non_empty(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

/// Accepts a full callback URL, `code#state`, or a `code=…&state=…` query
/// string. State is required so it can be checked before any exchange.
pub fn parse_authorization_input(input: &str) -> Result<AuthorizationInput, String> {
    let value = input.trim();
    if value.is_empty() {
        return Err("Paste the sign-in code or callback URL".to_string());
    }
    if value.chars().count() > MAX_AUTHORIZATION_INPUT_CHARS {
        return Err("Pasted sign-in value is too long".to_string());
    }
    let (code, state) = if let Ok(url) = url::Url::parse(value) {
        let mut code = None;
        let mut state = None;
        for (key, item) in url.query_pairs() {
            match key.as_ref() {
                "code" => code = Some(item.into_owned()),
                "state" => state = Some(item.into_owned()),
                _ => {}
            }
        }
        (code, state)
    } else if value.contains("code=") {
        let query = value.trim_start_matches('?');
        let mut code = None;
        let mut state = None;
        for (key, item) in url::form_urlencoded::parse(query.as_bytes()) {
            match key.as_ref() {
                "code" => code = Some(item.into_owned()),
                "state" => state = Some(item.into_owned()),
                _ => {}
            }
        }
        (code, state)
    } else if let Some((code, state)) = value.split_once('#') {
        (Some(code.to_string()), Some(state.to_string()))
    } else {
        (Some(value.to_string()), None)
    };
    let code = non_empty(code).ok_or_else(|| "No sign-in code was found".to_string())?;
    let state = non_empty(state).ok_or_else(|| {
        "Paste the full callback URL or the code#state value shown after sign-in".to_string()
    })?;
    if code.chars().any(char::is_whitespace) || state.chars().any(char::is_whitespace) {
        return Err("Pasted sign-in value is malformed".to_string());
    }
    Ok(AuthorizationInput { code, state })
}

/// Rejects a pasted value whose state is not the one this flow started with.
/// Runs before the pending session is consumed or any HTTP call is made.
pub fn ensure_state_matches(
    expected_state: &str,
    input: &AuthorizationInput,
) -> Result<(), String> {
    if expected_state.is_empty() || input.state != expected_state {
        return Err("Sign-in state did not match; restart sign-in".to_string());
    }
    Ok(())
}

fn base64url_decode(input: &str) -> Option<Vec<u8>> {
    let mut buffer: u32 = 0;
    let mut bits = 0u32;
    let mut output = Vec::with_capacity(input.len() * 3 / 4);
    for byte in input.bytes() {
        let value = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'-' | b'+' => 62,
            b'_' | b'/' => 63,
            b'=' => break,
            _ => return None,
        };
        buffer = (buffer << 6) | u32::from(value);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }
    Some(output)
}

/// Decodes a JWT payload for display/routing hints only. The signature is not
/// verified, so nothing here may be used for a trust decision.
pub fn jwt_claims(token: &str) -> Option<Value> {
    let payload = token.split('.').nth(1)?;
    if payload.len() > 64 * 1024 {
        return None;
    }
    serde_json::from_slice(&base64url_decode(payload)?).ok()
}

const OPENAI_AUTH_CLAIM: &str = "https://api.openai.com/auth";
const OPENAI_PROFILE_CLAIM: &str = "https://api.openai.com/profile";

pub fn openai_account_id(access_token: &str) -> Option<String> {
    let claims = jwt_claims(access_token)?;
    claims
        .get(OPENAI_AUTH_CLAIM)
        .and_then(|auth| auth.get("chatgpt_account_id"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|id| !id.is_empty())
}

fn openai_email(response: &TokenResponse) -> Option<String> {
    response
        .id_token
        .as_deref()
        .and_then(jwt_claims)
        .and_then(|claims| {
            claims
                .get("email")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            jwt_claims(&response.access_token).and_then(|claims| {
                claims
                    .get(OPENAI_PROFILE_CLAIM)
                    .and_then(|profile| profile.get("email"))
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
        })
        .filter(|email| !email.is_empty())
}

/// Maps a token response to stored credentials, keeping the previous refresh
/// token and account fields when a refresh response omits them.
pub fn token_response_to_credentials(
    provider: AiOAuthProvider,
    response: TokenResponse,
    previous: Option<&OAuthCredentials>,
    now: i64,
) -> Result<OAuthCredentials, String> {
    if response.access_token.trim().is_empty() {
        return Err(format!(
            "{} sign-in returned no access credential",
            provider.label()
        ));
    }
    let (account_id, email) = match provider {
        AiOAuthProvider::OpenAi => (
            openai_account_id(&response.access_token),
            openai_email(&response),
        ),
        AiOAuthProvider::Anthropic => {
            let account = response.account.as_ref();
            (
                account.and_then(|account| account.uuid.clone()),
                account.and_then(|account| account.email_address.clone()),
            )
        }
    };
    if provider == AiOAuthProvider::OpenAi
        && account_id.is_none()
        && previous
            .and_then(|previous| previous.account_id.as_ref())
            .is_none()
    {
        return Err("OpenAI sign-in did not include a ChatGPT account".to_string());
    }
    let refresh_token = non_empty(response.refresh_token.clone())
        .or_else(|| previous.and_then(|previous| previous.refresh_token.clone()));
    let scopes: Vec<String> = response
        .scope
        .as_deref()
        .unwrap_or(provider.default_scopes())
        .split_whitespace()
        .map(str::to_string)
        .collect();
    Ok(OAuthCredentials {
        access_token: response.access_token,
        refresh_token,
        expires_at: response.expires_in.map(|seconds| now + seconds.max(0)),
        refresh_expires_at: None,
        account_id: account_id
            .or_else(|| previous.and_then(|previous| previous.account_id.clone())),
        account_label: email
            .or_else(|| previous.and_then(|previous| previous.account_label.clone()))
            .or_else(|| Some(format!("{} account", provider.label()))),
        scopes,
        provider_key: provider.key().to_string(),
        needs_reauth: false,
    })
}

/// True when an AI OAuth access token should be refreshed now.
pub fn needs_refresh(credentials: &OAuthCredentials, now: i64) -> bool {
    credentials.access_token.is_empty()
        || credentials
            .expires_at
            .is_some_and(|expires_at| expires_at <= now + AI_REFRESH_SKEW_SECONDS)
}

#[cfg(test)]
pub(crate) mod test_support {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use crate::net::transport::{provider_http_client, TransportPolicy};

    pub fn local_client() -> reqwest::blocking::Client {
        provider_http_client(TransportPolicy::LOCAL_TEST).expect("client")
    }

    /// Scripted local HTTP server standing in for a token endpoint. Each
    /// request gets the next scripted response; the last one repeats.
    pub struct FakeServer {
        pub url: String,
        pub hits: Arc<AtomicUsize>,
        pub requests: Arc<Mutex<Vec<String>>>,
    }

    impl FakeServer {
        pub fn hit_count(&self) -> usize {
            self.hits.load(Ordering::SeqCst)
        }
        pub fn request(&self, index: usize) -> String {
            self.requests.lock().expect("requests")[index].clone()
        }
    }

    pub fn spawn_fake_server(responses: Vec<(u16, String)>, delay: Duration) -> FakeServer {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let url = format!("http://{}/token", listener.local_addr().expect("addr"));
        let hits = Arc::new(AtomicUsize::new(0));
        let requests = Arc::new(Mutex::new(Vec::new()));
        let (thread_hits, thread_requests) = (hits.clone(), requests.clone());
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { continue };
                let mut raw = Vec::new();
                let mut buffer = [0u8; 4096];
                let mut expected_total = None;
                while let Ok(read) = stream.read(&mut buffer) {
                    if read == 0 {
                        break;
                    }
                    raw.extend_from_slice(&buffer[..read]);
                    let text = String::from_utf8_lossy(&raw).to_string();
                    if expected_total.is_none() {
                        if let Some(header_end) = text.find("\r\n\r\n") {
                            let length = text[..header_end]
                                .lines()
                                .find_map(|line| {
                                    let (name, value) = line.split_once(':')?;
                                    name.eq_ignore_ascii_case("content-length")
                                        .then(|| value.trim().parse::<usize>().ok())
                                        .flatten()
                                })
                                .unwrap_or(0);
                            expected_total = Some(header_end + 4 + length);
                        }
                    }
                    if expected_total.is_some_and(|total| raw.len() >= total) {
                        break;
                    }
                }
                let index = thread_hits.fetch_add(1, Ordering::SeqCst);
                thread_requests
                    .lock()
                    .expect("requests")
                    .push(String::from_utf8_lossy(&raw).to_string());
                std::thread::sleep(delay);
                let (status, body) = responses[index.min(responses.len() - 1)].clone();
                let reply = format!(
                    "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(reply.as_bytes());
            }
        });
        FakeServer {
            url,
            hits,
            requests,
        }
    }

    /// Builds an unsigned JWT with the given JSON payload.
    pub fn fake_jwt(payload: &serde_json::Value) -> String {
        fn encode(bytes: &[u8]) -> String {
            const ALPHABET: &[u8] =
                b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
            let mut output = String::new();
            for chunk in bytes.chunks(3) {
                let block = match chunk.len() {
                    3 => {
                        (u32::from(chunk[0]) << 16)
                            | (u32::from(chunk[1]) << 8)
                            | u32::from(chunk[2])
                    }
                    2 => (u32::from(chunk[0]) << 16) | (u32::from(chunk[1]) << 8),
                    _ => u32::from(chunk[0]) << 16,
                };
                let count = chunk.len() + 1;
                for index in 0..count {
                    output.push(ALPHABET[((block >> (18 - 6 * index)) & 63) as usize] as char);
                }
            }
            output
        }
        format!(
            "{}.{}.sig",
            encode(br#"{"alg":"none"}"#),
            encode(payload.to_string().as_bytes())
        )
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::fake_jwt;
    use super::*;
    use oauth2::{PkceCodeChallenge, PkceCodeVerifier};
    use serde_json::json;

    #[test]
    fn pkce_s256_matches_rfc7636_vector() {
        let verifier =
            PkceCodeVerifier::new("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk".to_string());
        let challenge = PkceCodeChallenge::from_code_verifier_sha256(&verifier);
        assert_eq!(
            challenge.as_str(),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
        assert_eq!(challenge.method().as_str(), "S256");
    }

    #[test]
    fn parses_all_supported_authorization_input_forms() {
        let expected = AuthorizationInput {
            code: "abc123".to_string(),
            state: "st4te".to_string(),
        };
        for input in [
            "http://localhost:1455/auth/callback?code=abc123&state=st4te",
            "  https://platform.claude.com/oauth/code/callback?state=st4te&code=abc123 ",
            "abc123#st4te",
            "code=abc123&state=st4te",
            "?code=abc123&state=st4te",
        ] {
            assert_eq!(
                parse_authorization_input(input).as_ref(),
                Ok(&expected),
                "{input}"
            );
        }
    }

    #[test]
    fn rejects_garbage_and_stateless_authorization_input() {
        for input in [
            "",
            "   ",
            "abc123",
            "#st4te",
            "abc#",
            "code=&state=x",
            "a b#c",
        ] {
            assert!(parse_authorization_input(input).is_err(), "{input:?}");
        }
        assert!(parse_authorization_input(&"x".repeat(5000)).is_err());
    }

    #[test]
    fn state_mismatch_is_rejected() {
        let input = parse_authorization_input("abc#other").expect("parsed");
        assert!(ensure_state_matches("expected", &input).is_err());
        assert!(ensure_state_matches("", &input).is_err());
        assert!(ensure_state_matches("other", &input).is_ok());
    }

    #[test]
    fn extracts_openai_account_id_and_email_from_jwts() {
        let access = fake_jwt(&json!({
            "https://api.openai.com/auth": { "chatgpt_account_id": "acct-1" },
            "https://api.openai.com/profile": { "email": "p@example.com" }
        }));
        assert_eq!(openai_account_id(&access).as_deref(), Some("acct-1"));
        assert_eq!(openai_account_id("not-a-jwt"), None);

        let response = TokenResponse {
            access_token: access,
            refresh_token: Some("r1".to_string()),
            expires_in: Some(3600),
            scope: None,
            id_token: Some(fake_jwt(&json!({ "email": "id@example.com" }))),
            account: None,
        };
        let credentials =
            token_response_to_credentials(AiOAuthProvider::OpenAi, response, None, 1_000)
                .expect("credentials");
        assert_eq!(credentials.account_id.as_deref(), Some("acct-1"));
        assert_eq!(credentials.account_label.as_deref(), Some("id@example.com"));
        assert_eq!(credentials.expires_at, Some(4_600));
        assert!(credentials.scopes.contains(&"offline_access".to_string()));
        assert!(!credentials.needs_reauth);
    }

    #[test]
    fn openai_without_account_is_rejected() {
        let response = TokenResponse {
            access_token: "opaque".to_string(),
            refresh_token: None,
            expires_in: None,
            scope: None,
            id_token: None,
            account: None,
        };
        assert!(token_response_to_credentials(AiOAuthProvider::OpenAi, response, None, 0).is_err());
    }

    #[test]
    fn refresh_response_keeps_previous_refresh_token_and_label() {
        let previous = OAuthCredentials {
            access_token: "old".to_string(),
            refresh_token: Some("keep-me".to_string()),
            expires_at: Some(10),
            refresh_expires_at: None,
            account_id: Some("uuid-1".to_string()),
            account_label: Some("me@example.com".to_string()),
            scopes: Vec::new(),
            provider_key: "anthropic".to_string(),
            needs_reauth: false,
        };
        let response = TokenResponse {
            access_token: "new".to_string(),
            refresh_token: None,
            expires_in: Some(28_800),
            scope: Some("user:inference".to_string()),
            id_token: None,
            account: None,
        };
        let next = token_response_to_credentials(
            AiOAuthProvider::Anthropic,
            response,
            Some(&previous),
            100,
        )
        .expect("credentials");
        assert_eq!(next.refresh_token.as_deref(), Some("keep-me"));
        assert_eq!(next.account_label.as_deref(), Some("me@example.com"));
        assert_eq!(next.account_id.as_deref(), Some("uuid-1"));
        assert_eq!(next.expires_at, Some(28_900));
        assert_eq!(next.scopes, vec!["user:inference".to_string()]);
    }

    #[test]
    fn refresh_window_uses_ai_skew() {
        let mut credentials = OAuthCredentials {
            access_token: "a".to_string(),
            refresh_token: None,
            expires_at: Some(1_000 + AI_REFRESH_SKEW_SECONDS + 1),
            refresh_expires_at: None,
            account_id: None,
            account_label: None,
            scopes: Vec::new(),
            provider_key: "openai".to_string(),
            needs_reauth: false,
        };
        assert!(!needs_refresh(&credentials, 1_000));
        credentials.expires_at = Some(1_000 + AI_REFRESH_SKEW_SECONDS);
        assert!(needs_refresh(&credentials, 1_000));
        credentials.expires_at = None;
        credentials.access_token.clear();
        assert!(needs_refresh(&credentials, 1_000));
    }

    #[test]
    fn oauth_error_code_keeps_only_sanitized_code() {
        assert_eq!(
            oauth_error_code(br#"{"error":"invalid_grant","error_description":"token sk-secret"}"#)
                .as_deref(),
            Some("invalid_grant")
        );
        assert_eq!(
            oauth_error_code(br#"{"error":{"type":"invalid<script>","message":"x"}}"#).as_deref(),
            Some("invalidscript")
        );
        assert_eq!(oauth_error_code(b"<html>"), None);
    }
}
