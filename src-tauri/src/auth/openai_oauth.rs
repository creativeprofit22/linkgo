//! OpenAI (ChatGPT plan) sign-in. Reuses the Codex CLI public client; see
//! docs/features/ai-account-sign-in.md for the recorded decision.

use reqwest::blocking::Client;

use super::ai_oauth::{post_token_request, TokenBody, TokenError, TokenResponse};
use super::oauth::percent_encode;

pub const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
pub const AUTHORIZE_URL: &str = "https://auth.openai.com/oauth/authorize";
pub const TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
pub const REDIRECT_URI: &str = "http://localhost:1455/auth/callback";
pub const SCOPES: &str =
    "openid profile email offline_access api.connectors.read api.connectors.invoke";
pub const ORIGINATOR: &str = "linkgo";
pub const TOKEN_URLS: &[&str] = &[TOKEN_URL];

pub fn build_authorize_url(state: &str, pkce_challenge: &str) -> String {
    let params = [
        ("response_type", "code"),
        ("client_id", CLIENT_ID),
        ("redirect_uri", REDIRECT_URI),
        ("scope", SCOPES),
        ("code_challenge", pkce_challenge),
        ("code_challenge_method", "S256"),
        ("state", state),
        ("prompt", "login"),
        ("id_token_add_organizations", "true"),
        ("codex_cli_simplified_flow", "true"),
        ("originator", ORIGINATOR),
    ];
    let query: Vec<String> = params
        .iter()
        .map(|(key, value)| format!("{key}={}", percent_encode(value)))
        .collect();
    format!("{AUTHORIZE_URL}?{}", query.join("&"))
}

fn first_url(token_urls: &[&str]) -> Result<String, TokenError> {
    token_urls
        .first()
        .map(|url| url.to_string())
        .ok_or_else(|| TokenError::Transient("No OpenAI token endpoint configured".to_string()))
}

pub fn exchange_code(
    client: &Client,
    token_urls: &[&str],
    code: &str,
    pkce_verifier: &str,
) -> Result<TokenResponse, TokenError> {
    let fields = [
        ("grant_type", "authorization_code"),
        ("client_id", CLIENT_ID),
        ("code", code),
        ("redirect_uri", REDIRECT_URI),
        ("code_verifier", pkce_verifier),
    ];
    post_token_request(
        client,
        &first_url(token_urls)?,
        TokenBody::Form(&fields),
        &[],
        "OpenAI sign-in",
    )
}

pub fn refresh(
    client: &Client,
    token_urls: &[&str],
    refresh_token: &str,
) -> Result<TokenResponse, TokenError> {
    let fields = [
        ("grant_type", "refresh_token"),
        ("client_id", CLIENT_ID),
        ("refresh_token", refresh_token),
    ];
    post_token_request(
        client,
        &first_url(token_urls)?,
        TokenBody::Form(&fields),
        &[],
        "OpenAI sign-in refresh",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::ai_oauth::test_support::{local_client, spawn_fake_server};
    use std::time::Duration;

    #[test]
    fn authorize_url_carries_client_redirect_scope_and_challenge() {
        let url = build_authorize_url("state-1", "challenge-1");
        assert!(url.starts_with("https://auth.openai.com/oauth/authorize?"));
        assert!(url.contains("client_id=app_EMoamEEZ73f0CkXaXp7hrann"));
        assert!(url.contains("redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback"));
        assert!(url.contains("scope=openid%20profile%20email%20offline_access"));
        assert!(url.contains("code_challenge=challenge-1"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("state=state-1"));
        assert!(url.contains("originator=linkgo"));
    }

    #[test]
    fn exchange_posts_form_with_verifier_and_parses_tokens() {
        let server = spawn_fake_server(
            vec![(
                200,
                r#"{"access_token":"at","refresh_token":"rt","expires_in":3600}"#.to_string(),
            )],
            Duration::ZERO,
        );
        let tokens =
            exchange_code(&local_client(), &[&server.url], "the-code", "the-verifier").expect("ok");
        assert_eq!(tokens.access_token, "at");
        assert_eq!(tokens.refresh_token.as_deref(), Some("rt"));
        let request = server.request(0);
        assert!(request.contains("grant_type=authorization_code"));
        assert!(request.contains("code_verifier=the-verifier"));
        assert!(request.contains("application/x-www-form-urlencoded"));
    }

    #[test]
    fn refresh_classifies_4xx_as_rejected_and_5xx_as_transient() {
        let rejected = spawn_fake_server(
            vec![(
                400,
                r#"{"error":"invalid_grant","error_description":"refresh_token rt-secret"}"#
                    .to_string(),
            )],
            Duration::ZERO,
        );
        let error = refresh(&local_client(), &[&rejected.url], "rt-secret").unwrap_err();
        assert!(matches!(error, TokenError::Rejected(_)));
        assert!(error.message().contains("invalid_grant"));
        assert!(!error.message().contains("rt-secret"));

        let transient = spawn_fake_server(vec![(503, "oops".to_string())], Duration::ZERO);
        let error = refresh(&local_client(), &[&transient.url], "rt").unwrap_err();
        assert!(matches!(error, TokenError::Transient(_)));
    }

    #[test]
    fn oversized_token_response_is_rejected() {
        let huge = format!(r#"{{"access_token":"{}"}}"#, "a".repeat(300 * 1024));
        let server = spawn_fake_server(vec![(200, huge)], Duration::ZERO);
        let error = refresh(&local_client(), &[&server.url], "rt").unwrap_err();
        assert!(matches!(error, TokenError::Transient(_)));
    }
}
