//! Destination policy for user-configurable AI provider Base URLs.
//!
//! Pure validation: no I/O, no DNS. Enforced natively both when a credential is
//! saved and again right before a provider request is sent, so a value stored
//! by an older build (or edited in the keyring) cannot bypass it.
//!
//! Policy:
//! - only `https`/`http` URLs without userinfo, query, fragment or control chars;
//! - `https` to a public host is always allowed;
//! - loopback, private, link-local, ULA, CGNAT, unspecified and other
//!   non-public IP literals (including IPv4-mapped IPv6) and `localhost`
//!   names need explicit per-credential consent;
//! - plain `http` is allowed only for such consented local destinations.

use std::fmt;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

use url::{Host, Url};

pub const MAX_DESTINATION_LEN: usize = 2048;

/// Whether the user explicitly allowed a local/private destination for this
/// credential.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalConsent {
    Denied,
    Granted,
}

impl LocalConsent {
    pub fn from_flag(allowed: bool) -> Self {
        if allowed {
            LocalConsent::Granted
        } else {
            LocalConsent::Denied
        }
    }
}

/// A validated provider destination. Construct only via
/// [`validate_provider_destination`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderDestination {
    url: Url,
    local: bool,
}

impl ProviderDestination {
    /// Normalized URL string that was validated; use this, not the raw input,
    /// to build requests so parsing cannot diverge.
    pub fn as_str(&self) -> &str {
        self.url.as_str()
    }

    /// True when the destination is loopback/private and was allowed by consent.
    pub fn is_local(&self) -> bool {
        self.local
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DestinationError {
    TooLong,
    ControlCharacters,
    Unparseable,
    UnsupportedScheme,
    UserInfo,
    QueryOrFragment,
    MissingHost,
    LocalWithoutConsent,
    InsecureScheme,
}

impl fmt::Display for DestinationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            DestinationError::TooLong => "Base URL is too long",
            DestinationError::ControlCharacters => {
                "Base URL must not contain spaces or control characters"
            }
            DestinationError::Unparseable => "Base URL is not a valid URL",
            DestinationError::UnsupportedScheme => "Base URL must start with https://",
            DestinationError::UserInfo => "Base URL must not include a username or password",
            DestinationError::QueryOrFragment => {
                "Base URL must not include a query string or fragment"
            }
            DestinationError::MissingHost => "Base URL must include a host name",
            DestinationError::LocalWithoutConsent => {
                "Base URL points to this computer or a private network. Reconnect the provider and allow the local endpoint to use it"
            }
            DestinationError::InsecureScheme => {
                "Base URL must use https:// unless it is an allowed local endpoint"
            }
        };
        f.write_str(message)
    }
}

impl std::error::Error for DestinationError {}

/// True for any address that is not a globally routable unicast address:
/// loopback, private, link-local (incl. cloud metadata), CGNAT, unspecified,
/// broadcast, multicast, documentation, benchmarking and reserved ranges.
pub fn is_non_public_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, _, _] = ip.octets();
    ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_unspecified()
        || ip.is_broadcast()
        || ip.is_multicast()
        || ip.is_documentation()
        || a == 0
        || (a == 100 && (64..=127).contains(&b)) // CGNAT 100.64.0.0/10
        || (a == 192 && b == 0 && ip.octets()[2] == 0) // IETF protocol assignments
        || (a == 198 && (b == 18 || b == 19)) // benchmarking 198.18.0.0/15
        || a >= 240 // reserved 240.0.0.0/4
}

pub fn is_non_public_ipv6(ip: Ipv6Addr) -> bool {
    if let Some(v4) = ip.to_ipv4_mapped() {
        return is_non_public_ipv4(v4);
    }
    let segments = ip.segments();
    let embedded_low = |high: u16, low: u16| {
        let [a, b] = high.to_be_bytes();
        let [c, d] = low.to_be_bytes();
        Ipv4Addr::new(a, b, c, d)
    };
    // NAT64 well-known prefix 64:ff9b::/96 embeds an IPv4 address.
    if segments[..6] == [0x64, 0xff9b, 0, 0, 0, 0] {
        return is_non_public_ipv4(embedded_low(segments[6], segments[7]));
    }
    // IPv4-translated ::ffff:0:a.b.c.d (SIIT) embeds an IPv4 address.
    if segments[..6] == [0, 0, 0, 0, 0xffff, 0] {
        return is_non_public_ipv4(embedded_low(segments[6], segments[7]));
    }
    // 6to4 2002:AABB:CCDD::/48 embeds an IPv4 address.
    if segments[0] == 0x2002 {
        return is_non_public_ipv4(embedded_low(segments[1], segments[2]));
    }
    ip.is_loopback()
        || (segments[0] == 0x64 && segments[1] == 0xff9b && segments[2] == 1) // local-use NAT64 64:ff9b:1::/48
        || (segments[0] == 0x2001 && segments[1] == 0) // Teredo 2001::/32 (tunnels to arbitrary IPv4)
        || ip.is_unspecified()
        || ip.is_multicast()
        || (segments[0] & 0xfe00) == 0xfc00 // unique local fc00::/7
        || (segments[0] & 0xffc0) == 0xfe80 // link-local fe80::/10
        || (segments[0] & 0xffc0) == 0xfec0 // deprecated site-local fec0::/10
        || (segments[0] == 0x2001 && segments[1] == 0x0db8) // documentation
        || segments[..6] == [0, 0, 0, 0, 0, 0] // IPv4-compatible (deprecated)
}

pub fn is_non_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_non_public_ipv4(v4),
        IpAddr::V6(v6) => is_non_public_ipv6(v6),
    }
}

fn is_localhost_name(domain: &str) -> bool {
    let name = domain.trim_end_matches('.').to_ascii_lowercase();
    name == "localhost" || name.ends_with(".localhost")
}

fn host_is_local(host: &Host<&str>) -> bool {
    match host {
        Host::Domain(domain) => is_localhost_name(domain),
        Host::Ipv4(ip) => is_non_public_ipv4(*ip),
        Host::Ipv6(ip) => is_non_public_ipv6(*ip),
    }
}

/// Validates a user-supplied provider Base URL against the destination policy.
pub fn validate_provider_destination(
    raw: &str,
    consent: LocalConsent,
) -> Result<ProviderDestination, DestinationError> {
    let trimmed = raw.trim();
    if trimmed.len() > MAX_DESTINATION_LEN {
        return Err(DestinationError::TooLong);
    }
    if trimmed
        .chars()
        .any(|character| character.is_control() || character.is_whitespace())
    {
        return Err(DestinationError::ControlCharacters);
    }
    let url = Url::parse(trimmed).map_err(|_| DestinationError::Unparseable)?;
    let secure = match url.scheme() {
        "https" => true,
        "http" => false,
        _ => return Err(DestinationError::UnsupportedScheme),
    };
    if !url.username().is_empty() || url.password().is_some() {
        return Err(DestinationError::UserInfo);
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err(DestinationError::QueryOrFragment);
    }
    let host = url.host().ok_or(DestinationError::MissingHost)?;
    if matches!(host, Host::Domain(domain) if domain.trim_end_matches('.').is_empty()) {
        return Err(DestinationError::MissingHost);
    }
    let local = host_is_local(&host);
    if local && consent != LocalConsent::Granted {
        return Err(DestinationError::LocalWithoutConsent);
    }
    if !secure && !local {
        return Err(DestinationError::InsecureScheme);
    }
    Ok(ProviderDestination { url, local })
}

#[cfg(test)]
mod tests {
    use super::{
        is_non_public_ip, validate_provider_destination, DestinationError, LocalConsent,
        MAX_DESTINATION_LEN,
    };
    use std::net::IpAddr;

    const DENIED: LocalConsent = LocalConsent::Denied;
    const GRANTED: LocalConsent = LocalConsent::Granted;

    #[test]
    fn allows_https_public_hosts_without_consent() {
        for raw in [
            "https://api.openai.com/v1",
            "https://api.anthropic.com",
            "  https://openrouter.ai/api/v1/  ",
            "https://8.8.8.8/v1",
            "https://[2606:4700:4700::1111]/v1",
        ] {
            let destination = validate_provider_destination(raw, DENIED)
                .unwrap_or_else(|error| panic!("{raw} should be allowed: {error}"));
            assert!(!destination.is_local(), "{raw}");
        }
    }

    #[test]
    fn rejects_plain_http_to_public_hosts_even_with_consent() {
        for consent in [DENIED, GRANTED] {
            assert_eq!(
                validate_provider_destination("http://api.openai.com/v1", consent),
                Err(DestinationError::InsecureScheme)
            );
        }
    }

    #[test]
    fn local_and_private_destinations_require_consent() {
        let cases = [
            "http://localhost:11434/v1",
            "https://LOCALHOST./v1",
            "http://llm.localhost:8080",
            "http://127.0.0.1:1234/v1",
            "http://127.1.2.3",
            "http://0x7f.1/v1",
            "http://0.0.0.0:8000",
            "http://10.0.0.5/v1",
            "http://172.16.4.2/v1",
            "http://192.168.1.10:8080/v1",
            "http://169.254.169.254/latest",
            "http://100.64.0.1/v1",
            "http://[::1]:8080/v1",
            "http://[::]/v1",
            "http://[fd00::1]/v1",
            "http://[fe80::1]/v1",
            "http://[::ffff:127.0.0.1]/v1",
            "http://[::ffff:169.254.169.254]/v1",
            "http://[64:ff9b::a00:1]/v1",
        ];
        for raw in cases {
            assert_eq!(
                validate_provider_destination(raw, DENIED),
                Err(DestinationError::LocalWithoutConsent),
                "{raw} must need consent"
            );
            let destination = validate_provider_destination(raw, GRANTED)
                .unwrap_or_else(|error| panic!("{raw} should be allowed with consent: {error}"));
            assert!(destination.is_local(), "{raw}");
        }
    }

    #[test]
    fn rejects_unsupported_schemes_userinfo_query_and_fragment() {
        let cases = [
            ("ftp://example.com/v1", DestinationError::UnsupportedScheme),
            ("file:///etc/passwd", DestinationError::UnsupportedScheme),
            ("javascript:alert(1)", DestinationError::UnsupportedScheme),
            ("ws://example.com", DestinationError::UnsupportedScheme),
            ("https://user:pw@example.com/v1", DestinationError::UserInfo),
            ("https://user@example.com/v1", DestinationError::UserInfo),
            (
                "https://example.com/v1?x=1",
                DestinationError::QueryOrFragment,
            ),
            (
                "https://example.com/v1#frag",
                DestinationError::QueryOrFragment,
            ),
            ("not a url", DestinationError::ControlCharacters),
            ("example.com/v1", DestinationError::Unparseable),
            ("https://exa\tmple.com", DestinationError::ControlCharacters),
            ("", DestinationError::Unparseable),
        ];
        for (raw, expected) in cases {
            for consent in [DENIED, GRANTED] {
                assert_eq!(
                    validate_provider_destination(raw, consent),
                    Err(expected.clone()),
                    "{raw:?}"
                );
            }
        }
    }

    #[test]
    fn enforces_length_limit() {
        let path = "a".repeat(MAX_DESTINATION_LEN);
        assert_eq!(
            validate_provider_destination(&format!("https://example.com/{path}"), DENIED),
            Err(DestinationError::TooLong)
        );
    }

    #[test]
    fn returns_normalized_url() {
        let destination =
            validate_provider_destination("https://API.Example.COM/v1", DENIED).unwrap();
        assert_eq!(destination.as_str(), "https://api.example.com/v1");
    }

    #[test]
    fn classifies_resolved_addresses() {
        for (ip, non_public) in [
            ("8.8.8.8", false),
            ("1.1.1.1", false),
            ("2606:4700:4700::1111", false),
            ("127.0.0.1", true),
            ("10.1.2.3", true),
            ("169.254.169.254", true),
            ("100.100.100.200", true),
            ("::1", true),
            ("fc00::1", true),
            ("::ffff:192.168.0.1", true),
            ("::ffff:0:10.0.0.1", true),
            ("::ffff:0:8.8.8.8", false),
            ("64:ff9b::a9fe:a9fe", true),
            ("64:ff9b::808:808", false),
            ("64:ff9b:1::1", true),
            ("2002:a00:1::1", true),
            ("2002:808:808::1", false),
            ("2001:0:4136:e378::1", true),
        ] {
            let parsed: IpAddr = ip.parse().unwrap();
            assert_eq!(is_non_public_ip(parsed), non_public, "{ip}");
        }
    }

    #[test]
    fn errors_do_not_trigger_secret_redaction() {
        for error in [
            DestinationError::LocalWithoutConsent,
            DestinationError::InsecureScheme,
            DestinationError::UserInfo,
        ] {
            let message = error.to_string();
            assert_eq!(crate::auth::redact_error(&message), message);
        }
    }
}
