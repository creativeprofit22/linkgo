use std::{fs, path::PathBuf};

use oauth2::{CsrfToken, PkceCodeChallenge};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::{redact_error, unix_timestamp};

const OAUTH_SESSION_FILE_NAME: &str = "linkgo-oauth-sessions.json";
const OAUTH_STATE_TTL_SECONDS: i64 = 10 * 60;

#[derive(Debug, Clone)]
pub struct OAuthSecurityMaterial {
    pub state: String,
    pub pkce_challenge: String,
    pub pkce_verifier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PendingOAuthSession {
    provider_key: String,
    state: String,
    pkce_verifier: String,
    expires_at: i64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OAuthSessionFile {
    sessions: Vec<PendingOAuthSession>,
}

fn is_unreserved(byte: u8) -> bool {
    matches!(byte, b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~')
}

pub fn percent_encode(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.as_bytes() {
        if is_unreserved(*byte) {
            encoded.push(*byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

pub fn create_oauth_security_material() -> OAuthSecurityMaterial {
    let state = CsrfToken::new_random();
    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();
    OAuthSecurityMaterial {
        state: state.secret().clone(),
        pkce_challenge: pkce_challenge.as_str().to_string(),
        pkce_verifier: pkce_verifier.secret().clone(),
    }
}

fn oauth_sessions_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(redact_error)?;
    fs::create_dir_all(&app_data_dir).map_err(redact_error)?;
    Ok(app_data_dir.join(OAUTH_SESSION_FILE_NAME))
}

fn load_sessions(path: &PathBuf) -> Result<OAuthSessionFile, String> {
    if !path.exists() {
        return Ok(OAuthSessionFile::default());
    }
    let text = fs::read_to_string(path).map_err(redact_error)?;
    if text.trim().is_empty() {
        return Ok(OAuthSessionFile::default());
    }
    serde_json::from_str(&text).map_err(redact_error)
}

fn set_private_file_permissions(_path: &PathBuf) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(_path, fs::Permissions::from_mode(0o600)).map_err(redact_error)?;
    }
    Ok(())
}

fn save_sessions(path: &PathBuf, file: &OAuthSessionFile) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "OAuth session path is missing parent directory".to_string())?;
    fs::create_dir_all(parent).map_err(redact_error)?;
    let temp_path = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(file).map_err(redact_error)?;
    fs::write(&temp_path, text).map_err(redact_error)?;
    set_private_file_permissions(&temp_path)?;
    fs::rename(&temp_path, path).map_err(redact_error)?;
    set_private_file_permissions(path)
}

pub fn persist_pending_oauth_session(
    app: &AppHandle,
    provider_key: &str,
    state: &str,
    pkce_verifier: &str,
) -> Result<(), String> {
    let path = oauth_sessions_path(app)?;
    let now = unix_timestamp();
    let mut file = load_sessions(&path)?;
    file.sessions.retain(|session| {
        session.expires_at > now
            && !(session.provider_key == provider_key && session.state == state)
    });
    file.sessions.push(PendingOAuthSession {
        provider_key: provider_key.to_string(),
        state: state.to_string(),
        pkce_verifier: pkce_verifier.to_string(),
        expires_at: now + OAUTH_STATE_TTL_SECONDS,
    });
    save_sessions(&path, &file)
}

pub fn verify_and_take_oauth_session(
    app: &AppHandle,
    provider_key: &str,
    state: &str,
) -> Result<String, String> {
    let path = oauth_sessions_path(app)?;
    let now = unix_timestamp();
    let mut file = load_sessions(&path)?;
    let matching_index = file
        .sessions
        .iter()
        .position(|session| session.provider_key == provider_key && session.state == state);
    let Some(index) = matching_index else {
        file.sessions.retain(|session| session.expires_at > now);
        save_sessions(&path, &file)?;
        return Err("OAuth state did not match a pending authorization".to_string());
    };
    let session = file.sessions.remove(index);
    file.sessions.retain(|session| session.expires_at > now);
    save_sessions(&path, &file)?;
    if session.expires_at <= now {
        return Err("OAuth state expired; restart authorization".to_string());
    }
    Ok(session.pkce_verifier)
}

/// Drops every pending sign-in for a provider (used when sign-in is
/// cancelled), so a late callback or paste cannot complete it.
pub fn discard_pending_oauth_sessions(app: &AppHandle, provider_key: &str) -> Result<(), String> {
    let path = oauth_sessions_path(app)?;
    let now = unix_timestamp();
    let mut file = load_sessions(&path)?;
    file.sessions
        .retain(|session| session.expires_at > now && session.provider_key != provider_key);
    save_sessions(&path, &file)
}

pub fn build_authorization_url(
    authorization_endpoint: &str,
    client_id: &str,
    redirect_uri: &str,
    state: &str,
    scopes: &[String],
    pkce_challenge: &str,
) -> String {
    format!(
        "{}?response_type=code&client_id={}&redirect_uri={}&state={}&scope={}&code_challenge={}&code_challenge_method=S256",
        authorization_endpoint,
        percent_encode(client_id),
        percent_encode(redirect_uri),
        percent_encode(state),
        percent_encode(&scopes.join(" ")),
        percent_encode(pkce_challenge)
    )
}

#[cfg(test)]
mod tests {
    use super::{build_authorization_url, create_oauth_security_material, percent_encode};

    #[test]
    fn percent_encoding_handles_spaces_and_urls() {
        assert_eq!(percent_encode("openid profile"), "openid%20profile");
        let url = build_authorization_url(
            "https://example.test/auth",
            "client id",
            "http://localhost/callback",
            "state",
            &["openid".to_string(), "profile".to_string()],
            "pkce challenge",
        );
        assert!(url.contains("response_type=code"));
        assert!(url.contains("client_id=client%20id"));
        assert!(url.contains("scope=openid%20profile"));
        assert!(url.contains("code_challenge=pkce%20challenge"));
        assert!(url.contains("code_challenge_method=S256"));
    }

    #[test]
    fn oauth_security_material_is_random_and_pkce_ready() {
        let first = create_oauth_security_material();
        let second = create_oauth_security_material();
        assert_ne!(first.state, second.state);
        assert!(!first.state.starts_with("linkgo-linkedin-"));
        assert!(!first.pkce_challenge.is_empty());
        assert!(!first.pkce_verifier.is_empty());
    }
}
