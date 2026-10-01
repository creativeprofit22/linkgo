//! Opens allowlisted https URLs in the user's default browser.
//!
//! The embedded WebView swallows `target="_blank"` links unless a new-window
//! handler is registered, and the renderer holds no opener capability.
//! Sign-in pages are opened here from URLs built by native code. External
//! links clicked in the UI reach `open_external_url` only through the native
//! new-window handler (`window_commands::deny_and_open_external`), which
//! treats the URL as untrusted and opens it only on an allowlisted host.

use std::process::{Command, Stdio};

/// Exact authorize endpoints Linkgo may open. Anything else is refused.
const ALLOWED_AUTHORIZE_ENDPOINTS: &[(&str, &str)] = &[
    ("auth.openai.com", "/oauth/authorize"),
    ("claude.ai", "/oauth/authorize"),
    ("www.linkedin.com", "/oauth/v2/authorization"),
];

/// Returns the URL string if it is an https authorize endpoint on the
/// allowlist with no credentials, custom port or fragment.
pub fn validate_authorize_url(raw: &str) -> Result<String, String> {
    let parsed = url::Url::parse(raw).map_err(|_| "Sign-in address is not a valid URL")?;
    let host = parsed.host_str().unwrap_or_default();
    let allowed = parsed.scheme() == "https"
        && parsed.username().is_empty()
        && parsed.password().is_none()
        && parsed.port().is_none()
        && parsed.fragment().is_none()
        && ALLOWED_AUTHORIZE_ENDPOINTS
            .iter()
            .any(|(allowed_host, path)| host == *allowed_host && parsed.path() == *path);
    if allowed {
        Ok(parsed.into())
    } else {
        Err("Refusing to open an unexpected sign-in address".to_string())
    }
}

/// Hosts whose pages UI links may open in the default browser.
const ALLOWED_EXTERNAL_HOSTS: &[&str] = &["www.linkedin.com", "linkedin.com"];

/// Returns the URL string if it is https on an allowlisted host with no
/// credentials or custom port. Path, query and fragment are free.
pub fn validate_external_url(raw: &str) -> Result<String, String> {
    let parsed = url::Url::parse(raw).map_err(|_| "Link is not a valid URL")?;
    let host = parsed.host_str().unwrap_or_default();
    let allowed = parsed.scheme() == "https"
        && parsed.username().is_empty()
        && parsed.password().is_none()
        && parsed.port().is_none()
        && ALLOWED_EXTERNAL_HOSTS.contains(&host);
    if allowed {
        Ok(parsed.into())
    } else {
        Err("Refusing to open a link outside LinkedIn".to_string())
    }
}

fn browser_command(url: &str) -> Command {
    #[cfg(windows)]
    {
        // Argument array, no shell: `&` in the query cannot be interpreted.
        let mut command = Command::new("rundll32.exe");
        command.args(["url.dll,FileProtocolHandler", url]);
        command
    }
    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("open");
        command.arg(url);
        command
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let mut command = Command::new("xdg-open");
        command.arg(url);
        command
    }
}

/// Opens the authorize URL in the default browser. Returns whether the
/// launcher started; the caller keeps a copy-link fallback either way.
pub fn open_authorize_url(raw: &str) -> Result<(), String> {
    launch(&validate_authorize_url(raw)?)
}

/// Opens an allowlisted external link in the default browser.
pub fn open_external_url(raw: &str) -> Result<(), String> {
    launch(&validate_external_url(raw)?)
}

fn launch(url: &str) -> Result<(), String> {
    browser_command(url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|_| "Could not open your browser".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_allowlisted_https_authorize_endpoints() {
        for ok in [
            "https://claude.ai/oauth/authorize?code=true&state=abc",
            "https://auth.openai.com/oauth/authorize?state=abc",
            "https://www.linkedin.com/oauth/v2/authorization?state=abc",
        ] {
            assert!(validate_authorize_url(ok).is_ok(), "{ok}");
        }
        for bad in [
            "http://claude.ai/oauth/authorize",
            "https://claude.ai.evil.test/oauth/authorize",
            "https://evil.test/oauth/authorize",
            "https://claude.ai/logout",
            "https://user:pw@claude.ai/oauth/authorize",
            "https://claude.ai:8443/oauth/authorize",
            "https://claude.ai/oauth/authorize#frag",
            "file:///C:/Windows/System32/calc.exe",
            "javascript:alert(1)",
            "not a url",
        ] {
            assert!(validate_authorize_url(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn accepts_only_allowlisted_https_external_links() {
        for ok in [
            "https://www.linkedin.com/feed/update/urn:li:activity:123/",
            "https://linkedin.com/in/someone",
            "https://www.linkedin.com/posts/x?utm=1#comments",
            "https://WWW.LinkedIn.com/in/someone",
        ] {
            assert!(validate_external_url(ok).is_ok(), "{ok}");
        }
        for bad in [
            "http://www.linkedin.com/feed/",
            "https://evil.test/feed/",
            "https://www.linkedin.com.evil.test/feed/",
            "https://evillinkedin.com/feed/",
            "https://uk.linkedin.com/in/someone",
            "https://user@www.linkedin.com/feed/",
            "https://user:pw@www.linkedin.com/feed/",
            "https://www.linkedin.com:8443/feed/",
            "ftp://www.linkedin.com/feed/",
            "file:///C:/Windows/System32/calc.exe",
            "javascript:alert(1)",
            "data:text/html,hi",
            "about:blank",
            "not a url",
            "",
        ] {
            assert!(validate_external_url(bad).is_err(), "{bad}");
        }
    }
}
