use serde::{Deserialize, Serialize};

use super::{
    oauth::{build_authorization_url, create_oauth_security_material},
    redact_error, unix_timestamp, OAuthCredentials, StoredCredential,
};

const LINKEDIN_AUTHORIZATION_ENDPOINT: &str = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_ENDPOINT: &str = "https://www.linkedin.com/oauth/v2/accessToken";
const DEFAULT_REDIRECT_URI: &str = "http://localhost:47628/auth/linkedin/callback";
const DEFAULT_CLIENT_ID_ENV: &str = "LINKGO_LINKEDIN_CLIENT_ID";
const DEFAULT_CLIENT_SECRET_ENV: &str = "LINKGO_LINKEDIN_CLIENT_SECRET";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedInOAuthStart {
    pub auth_url: String,
    pub state: String,
    pub pkce_verifier: String,
    pub needs_code: bool,
}

pub fn start_linkedin_oauth(scopes: Vec<String>) -> Result<LinkedInOAuthStart, String> {
    let client_id =
        std::env::var(DEFAULT_CLIENT_ID_ENV).unwrap_or_else(|_| "linkgo-local-client".to_string());
    let redirect_uri = std::env::var("LINKGO_LINKEDIN_REDIRECT_URI")
        .unwrap_or_else(|_| DEFAULT_REDIRECT_URI.to_string());
    let security = create_oauth_security_material();
    let requested_scopes = if scopes.is_empty() {
        vec![
            "openid".to_string(),
            "profile".to_string(),
            "email".to_string(),
            "w_member_social".to_string(),
        ]
    } else {
        scopes
    };
    Ok(LinkedInOAuthStart {
        auth_url: build_authorization_url(
            LINKEDIN_AUTHORIZATION_ENDPOINT,
            &client_id,
            &redirect_uri,
            &security.state,
            &requested_scopes,
            &security.pkce_challenge,
        ),
        state: security.state,
        pkce_verifier: security.pkce_verifier,
        needs_code: true,
    })
}

#[derive(Debug, Deserialize)]
struct LinkedInTokenResponse {
    access_token: String,
    expires_in: Option<i64>,
    refresh_token: Option<String>,
    refresh_token_expires_in: Option<i64>,
    scope: Option<String>,
}

fn token_response_to_credential(response: LinkedInTokenResponse) -> StoredCredential {
    let now = unix_timestamp();
    StoredCredential::OAuth(OAuthCredentials {
        access_token: response.access_token,
        refresh_token: response.refresh_token,
        expires_at: response.expires_in.map(|seconds| now + seconds),
        refresh_expires_at: response
            .refresh_token_expires_in
            .map(|seconds| now + seconds),
        account_id: None,
        account_label: Some("LinkedIn member".to_string()),
        scopes: response
            .scope
            .unwrap_or_default()
            .split_whitespace()
            .map(ToString::to_string)
            .collect(),
        provider_key: "linkedin".to_string(),
    })
}

pub fn exchange_linkedin_code(
    code: &str,
    state: &str,
    pkce_verifier: &str,
) -> Result<StoredCredential, String> {
    if state.trim().is_empty() {
        return Err("LinkedIn OAuth state is required".to_string());
    }
    if pkce_verifier.trim().is_empty() {
        return Err("LinkedIn OAuth PKCE verifier is required".to_string());
    }
    if code.trim().is_empty() {
        return Err("LinkedIn OAuth code is required".to_string());
    }

    let client_id = std::env::var(DEFAULT_CLIENT_ID_ENV).unwrap_or_default();
    let client_secret = std::env::var(DEFAULT_CLIENT_SECRET_ENV).unwrap_or_default();
    let redirect_uri = std::env::var("LINKGO_LINKEDIN_REDIRECT_URI")
        .unwrap_or_else(|_| DEFAULT_REDIRECT_URI.to_string());

    if client_id.trim().is_empty() || client_secret.trim().is_empty() {
        return Err(format!(
            "LinkedIn OAuth is not configured; set {} and {}",
            DEFAULT_CLIENT_ID_ENV, DEFAULT_CLIENT_SECRET_ENV
        ));
    }

    let response = reqwest::blocking::Client::new()
        .post(LINKEDIN_TOKEN_ENDPOINT)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code.trim()),
            ("redirect_uri", redirect_uri.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("code_verifier", pkce_verifier.trim()),
        ])
        .send()
        .map_err(redact_error)?
        .error_for_status()
        .map_err(redact_error)?
        .json::<LinkedInTokenResponse>()
        .map_err(redact_error)?;

    Ok(token_response_to_credential(response))
}

pub fn refresh_linkedin_credential(
    credential: OAuthCredentials,
) -> Result<StoredCredential, String> {
    let refresh_token = credential
        .refresh_token
        .clone()
        .ok_or_else(|| "LinkedIn refresh token is unavailable; reauth is required".to_string())?;
    let client_id = std::env::var(DEFAULT_CLIENT_ID_ENV).unwrap_or_default();
    let client_secret = std::env::var(DEFAULT_CLIENT_SECRET_ENV).unwrap_or_default();

    if client_id.trim().is_empty() || client_secret.trim().is_empty() {
        return Err(format!(
            "LinkedIn OAuth is not configured; set {} and {}",
            DEFAULT_CLIENT_ID_ENV, DEFAULT_CLIENT_SECRET_ENV
        ));
    }

    let response = reqwest::blocking::Client::new()
        .post(LINKEDIN_TOKEN_ENDPOINT)
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
        ])
        .send()
        .map_err(redact_error)?
        .error_for_status()
        .map_err(redact_error)?
        .json::<LinkedInTokenResponse>()
        .map_err(redact_error)?;

    Ok(token_response_to_credential(response))
}

#[cfg(test)]
mod tests {
    use super::{exchange_linkedin_code, start_linkedin_oauth};

    #[test]
    fn linkedin_oauth_url_uses_code_flow_fields() {
        let start = start_linkedin_oauth(vec!["openid".to_string()]).unwrap();
        assert!(start.auth_url.contains("response_type=code"));
        assert!(start.auth_url.contains("state="));
        assert!(start.auth_url.contains("scope=openid"));
        assert!(start.auth_url.contains("code_challenge="));
        assert!(start.auth_url.contains("code_challenge_method=S256"));
        assert!(!start.state.starts_with("linkgo-linkedin-"));
        assert!(!start.pkce_verifier.is_empty());
        assert!(start.needs_code);
    }

    #[test]
    fn linkedin_exchange_requires_state_and_pkce_verifier() {
        assert!(exchange_linkedin_code("code", "", "verifier").is_err());
        assert!(exchange_linkedin_code("code", "state", "").is_err());
    }

    #[test]
    fn linkedin_exchange_requires_client_configuration() {
        if std::env::var("LINKGO_LINKEDIN_CLIENT_ID").is_ok()
            || std::env::var("LINKGO_LINKEDIN_CLIENT_SECRET").is_ok()
        {
            return;
        }

        let error = exchange_linkedin_code("code", "state", "verifier").unwrap_err();
        assert!(error.contains("LinkedIn OAuth is not configured"));
    }
}
