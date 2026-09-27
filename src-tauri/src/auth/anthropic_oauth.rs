//! Anthropic (Claude plan) sign-in. Reuses the Claude Code public client;
//! Anthropic's terms prohibit this for third-party apps, so it is gated
//! behind an explicit operator acknowledgement (see
//! docs/features/ai-account-sign-in.md).

use reqwest::blocking::Client;
use serde_json::json;

use super::ai_oauth::{post_token_request, TokenBody, TokenError, TokenResponse};
use super::oauth::percent_encode;

pub const CLIENT_ID: &str = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
pub const AUTHORIZE_URL: &str = "https://claude.ai/oauth/authorize";
/// Tried in order; the fallback is used only after a network error or 5xx.
pub const TOKEN_URLS: &[&str] = &[
    "https://platform.claude.com/v1/oauth/token",
    "https://console.anthropic.com/v1/oauth/token",
];
pub const REDIRECT_URI: &str = "https://platform.claude.com/oauth/code/callback";
pub const SCOPES: &str = "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload";
pub const CLAUDE_CLI_USER_AGENT: &str = "claude-cli/2.1.280 (external, cli)";
pub const OAUTH_BETA: &str = "oauth-2025-04-20";

pub fn build_authorize_url(state: &str, pkce_challenge: &str) -> String {
    let params = [
        ("code", "true"),
        ("client_id", CLIENT_ID),
        ("response_type", "code"),
        ("redirect_uri", REDIRECT_URI),
        ("scope", SCOPES),
        ("code_challenge", pkce_challenge),
        ("code_challenge_method", "S256"),
        ("state", state),
    ];
    let query: Vec<String> = params
        .iter()
        .map(|(key, value)| format!("{key}={}", percent_encode(value)))
        .collect();
    format!("{AUTHORIZE_URL}?{}", query.join("&"))
}

fn post_with_fallback(
    client: &Client,
    token_urls: &[&str],
    body: serde_json::Value,
    label: &str,
) -> Result<TokenResponse, TokenError> {
    let headers = [
        ("User-Agent", CLAUDE_CLI_USER_AGENT),
        ("anthropic-beta", OAUTH_BETA),
    ];
    let mut last_error =
        TokenError::Transient("No Anthropic token endpoint configured".to_string());
    for url in token_urls {
        match post_token_request(client, url, TokenBody::Json(body.clone()), &headers, label) {
            Ok(response) => return Ok(response),
            // 4xx is authoritative: another endpoint would say the same, and
            // the caller relies on it to mark the credential for reconnect.
            Err(error @ TokenError::Rejected(_)) => return Err(error),
            Err(error) => last_error = error,
        }
    }
    Err(last_error)
}

pub fn exchange_code(
    client: &Client,
    token_urls: &[&str],
    code: &str,
    state: &str,
    pkce_verifier: &str,
) -> Result<TokenResponse, TokenError> {
    post_with_fallback(
        client,
        token_urls,
        json!({
            "grant_type": "authorization_code",
            "client_id": CLIENT_ID,
            "code": code,
            "state": state,
            "redirect_uri": REDIRECT_URI,
            "code_verifier": pkce_verifier,
        }),
        "Anthropic sign-in",
    )
}

pub fn refresh(
    client: &Client,
    token_urls: &[&str],
    refresh_token: &str,
) -> Result<TokenResponse, TokenError> {
    post_with_fallback(
        client,
        token_urls,
        json!({
            "grant_type": "refresh_token",
            "client_id": CLIENT_ID,
            "refresh_token": refresh_token,
        }),
        "Anthropic sign-in refresh",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::ai_oauth::test_support::{local_client, spawn_fake_server};
    use std::time::Duration;

    const OK_BODY: &str = r#"{"access_token":"at","refresh_token":"rt","expires_in":28800,"account":{"uuid":"u1","email_address":"me@example.com"}}"#;

    #[test]
    fn authorize_url_carries_client_redirect_scope_and_challenge() {
        let url = build_authorize_url("state-1", "challenge-1");
        assert!(url.starts_with("https://claude.ai/oauth/authorize?code=true&"));
        assert!(url.contains("client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e"));
        assert!(url
            .contains("redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback"));
        assert!(url.contains("scope=org%3Acreate_api_key%20user%3Aprofile%20user%3Ainference"));
        assert!(url.contains("code_challenge=challenge-1"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("state=state-1"));
    }

    #[test]
    fn exchange_sends_json_with_claude_cli_identity() {
        let server = spawn_fake_server(vec![(200, OK_BODY.to_string())], Duration::ZERO);
        let tokens = exchange_code(&local_client(), &[&server.url], "c", "s", "v").expect("ok");
        assert_eq!(tokens.account.and_then(|a| a.uuid).as_deref(), Some("u1"));
        let request = server.request(0).to_ascii_lowercase();
        assert!(request.contains("content-type: application/json"));
        assert!(request.contains("user-agent: claude-cli/"));
        assert!(request.contains("anthropic-beta: oauth-2025-04-20"));
        assert!(request.contains("\"code_verifier\":\"v\""));
        assert!(request.contains("\"state\":\"s\""));
    }

    #[test]
    fn fallback_is_used_only_after_5xx() {
        let failing = spawn_fake_server(vec![(502, "bad gateway".to_string())], Duration::ZERO);
        let fallback = spawn_fake_server(vec![(200, OK_BODY.to_string())], Duration::ZERO);
        let tokens = refresh(&local_client(), &[&failing.url, &fallback.url], "rt").expect("ok");
        assert_eq!(tokens.access_token, "at");
        assert_eq!((failing.hit_count(), fallback.hit_count()), (1, 1));

        let rejecting = spawn_fake_server(
            vec![(401, r#"{"error":"invalid_grant"}"#.to_string())],
            Duration::ZERO,
        );
        let untouched = spawn_fake_server(vec![(200, OK_BODY.to_string())], Duration::ZERO);
        let error = refresh(&local_client(), &[&rejecting.url, &untouched.url], "rt").unwrap_err();
        assert!(matches!(error, TokenError::Rejected(_)));
        assert_eq!(untouched.hit_count(), 0);
    }

    #[test]
    fn network_error_falls_through_to_next_endpoint() {
        let fallback = spawn_fake_server(vec![(200, OK_BODY.to_string())], Duration::ZERO);
        // Port 9 on loopback is closed in the test environment.
        let tokens = refresh(
            &local_client(),
            &["http://127.0.0.1:9/token", &fallback.url],
            "rt",
        )
        .expect("ok");
        assert_eq!(tokens.access_token, "at");
    }
}
