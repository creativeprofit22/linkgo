//! Hardened HTTP transport for native calls that carry credentials.
//!
//! - Redirects are never followed: reqwest only strips a fixed set of auth
//!   headers on cross-host redirects, so provider-specific headers such as
//!   `x-api-key` (and replayed 307/308 bodies) would otherwise follow.
//! - Explicit connect and total timeouts.
//! - HTTPS-only unless the destination is a consented local endpoint.
//! - Without local consent, DNS answers that point at loopback/private/
//!   link-local networks are dropped (DNS-rebinding guard).
//! - Response bodies are read through a hard byte cap, and provider error
//!   text is truncated before it reaches the UI.

use std::io::Read;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use reqwest::blocking::{Client, Response};
use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use reqwest::redirect::Policy;
use serde::de::DeserializeOwned;

use super::destination::{is_non_public_ip, LocalConsent, ProviderDestination};

pub const PROVIDER_MAX_RESPONSE_BYTES: u64 = 8 * 1024 * 1024;
pub const LINKEDIN_MAX_RESPONSE_BYTES: u64 = 1024 * 1024;
/// OAuth token endpoint responses (access/refresh/id tokens) are small; cap
/// them far below the general provider limit.
pub const OAUTH_TOKEN_MAX_RESPONSE_BYTES: u64 = 256 * 1024;
pub const MAX_ERROR_MESSAGE_CHARS: usize = 500;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const PROVIDER_TOTAL_TIMEOUT: Duration = Duration::from_secs(120);

/// Network permissions derived from a validated destination and the stored
/// consent flag.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TransportPolicy {
    allow_private_addresses: bool,
    https_only: bool,
}

impl TransportPolicy {
    /// Public destinations: HTTPS only, private DNS answers dropped.
    pub const PUBLIC_HTTPS: TransportPolicy = TransportPolicy {
        allow_private_addresses: false,
        https_only: true,
    };

    /// Test-only: plain HTTP to a loopback fake server.
    #[cfg(test)]
    pub const LOCAL_TEST: TransportPolicy = TransportPolicy {
        allow_private_addresses: true,
        https_only: false,
    };

    /// Consent only relaxes the DNS guard for destinations that are themselves
    /// local; a public host keeps the rebinding guard even if consent is set.
    pub fn for_destination(destination: &ProviderDestination, consent: LocalConsent) -> Self {
        TransportPolicy {
            allow_private_addresses: consent == LocalConsent::Granted && destination.is_local(),
            https_only: !destination.is_local(),
        }
    }
}

/// Resolver that drops loopback/private/link-local answers so a public host
/// name cannot be pointed at the local machine or network.
#[derive(Debug, Default)]
struct PublicOnlyResolver;

impl Resolve for PublicOnlyResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let host = name.as_str().to_string();
        Box::pin(async move {
            let public: Vec<SocketAddr> = tokio::net::lookup_host((host.as_str(), 0))
                .await?
                .filter(|address| !is_non_public_ip(address.ip()))
                .collect();
            if public.is_empty() {
                return Err(
                    "Destination host resolves only to local or private network addresses".into(),
                );
            }
            Ok(Box::new(public.into_iter()) as Addrs)
        })
    }
}

fn hardened_builder(
    policy: TransportPolicy,
    total_timeout: Duration,
) -> reqwest::blocking::ClientBuilder {
    // `no_proxy`: an environment proxy would resolve the destination itself,
    // bypassing `PublicOnlyResolver`, and would see plaintext keys sent to
    // consented http:// local endpoints.
    let builder = Client::builder()
        .no_proxy()
        .redirect(Policy::none())
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(total_timeout)
        .https_only(policy.https_only);
    if policy.allow_private_addresses {
        builder
    } else {
        builder.dns_resolver(Arc::new(PublicOnlyResolver))
    }
}

/// Client for AI provider calls that carry an API key.
pub fn provider_http_client(policy: TransportPolicy) -> Result<Client, String> {
    hardened_builder(policy, PROVIDER_TOTAL_TIMEOUT)
        .build()
        .map_err(|error| format!("Provider HTTP client could not be created: {error}"))
}

/// Client for one source-connector request (shorter total timeout).
pub fn source_http_client(
    policy: TransportPolicy,
    total_timeout: Duration,
) -> Result<Client, String> {
    hardened_builder(policy, total_timeout)
        .build()
        .map_err(|error| format!("Source HTTP client could not be created: {error}"))
}

fn too_large(max_bytes: u64) -> String {
    format!("Response exceeded the {max_bytes}-byte limit")
}

/// Reads at most `max_bytes` of the body; larger bodies are an error.
pub fn read_bounded_bytes(response: Response, max_bytes: u64) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes)
    {
        return Err(too_large(max_bytes));
    }
    let mut body = Vec::new();
    response
        .take(max_bytes.saturating_add(1))
        .read_to_end(&mut body)
        .map_err(|error| format!("Response body could not be read: {error}"))?;
    if body.len() as u64 > max_bytes {
        return Err(too_large(max_bytes));
    }
    Ok(body)
}

pub fn read_bounded_json<T: DeserializeOwned>(
    response: Response,
    max_bytes: u64,
) -> Result<T, String> {
    let body = read_bounded_bytes(response, max_bytes)?;
    serde_json::from_slice(&body).map_err(|error| format!("Response was not valid JSON: {error}"))
}

pub fn read_bounded_text(response: Response, max_bytes: u64) -> Result<String, String> {
    let body = read_bounded_bytes(response, max_bytes)?;
    Ok(String::from_utf8_lossy(&body).into_owned())
}

/// Truncates untrusted remote error text before it is shown or stored.
pub fn truncate_error_message(message: &str) -> String {
    let mut characters = message.chars();
    let truncated: String = characters.by_ref().take(MAX_ERROR_MESSAGE_CHARS).collect();
    if characters.next().is_some() {
        format!("{truncated}…")
    } else {
        truncated
    }
}

#[cfg(test)]
mod tests {
    use super::{
        provider_http_client, read_bounded_json, read_bounded_text, truncate_error_message,
        PublicOnlyResolver, TransportPolicy, MAX_ERROR_MESSAGE_CHARS,
    };
    use crate::net::destination::{validate_provider_destination, LocalConsent};
    use reqwest::dns::Resolve;
    use std::io::{ErrorKind, Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::thread;
    use std::time::Duration;

    const FAKE_KEY: &str = "test-key-00000000";

    fn local_policy(url: &str) -> TransportPolicy {
        let destination = validate_provider_destination(url, LocalConsent::Granted).unwrap();
        TransportPolicy::for_destination(&destination, LocalConsent::Granted)
    }

    /// Reads one HTTP request (headers + Content-Length body) and returns it.
    fn read_request(stream: &mut TcpStream) -> String {
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut data = Vec::new();
        let mut buffer = [0_u8; 4096];
        loop {
            let read = stream.read(&mut buffer).unwrap();
            if read == 0 {
                break;
            }
            data.extend_from_slice(&buffer[..read]);
            let text = String::from_utf8_lossy(&data).to_string();
            if let Some(header_end) = text.find("\r\n\r\n") {
                let content_length = text[..header_end]
                    .lines()
                    .find_map(|line| {
                        let (name, value) = line.split_once(':')?;
                        name.eq_ignore_ascii_case("content-length")
                            .then(|| value.trim().parse::<usize>().ok())
                            .flatten()
                    })
                    .unwrap_or(0);
                if data.len() >= header_end + 4 + content_length {
                    return text;
                }
            }
        }
        String::from_utf8_lossy(&data).to_string()
    }

    /// Serves exactly one response on an ephemeral local port.
    fn serve_once(response: Vec<u8>) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let request = read_request(&mut stream);
            stream.write_all(&response).unwrap();
            stream.flush().unwrap();
            request
        });
        (url, handle)
    }

    #[test]
    fn redirects_are_not_followed_and_credentials_do_not_reach_the_target() {
        let target = TcpListener::bind("127.0.0.1:0").unwrap();
        target.set_nonblocking(true).unwrap();
        let target_url = format!("http://{}/steal", target.local_addr().unwrap());
        for status in [
            "302 Found",
            "307 Temporary Redirect",
            "308 Permanent Redirect",
        ] {
            let (origin_url, origin) = serve_once(
                format!(
                    "HTTP/1.1 {status}\r\nLocation: {target_url}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                )
                .into_bytes(),
            );
            let client = provider_http_client(local_policy(&origin_url)).unwrap();
            let response = client
                .post(format!("{origin_url}/v1/messages"))
                .header("x-api-key", FAKE_KEY)
                .bearer_auth(FAKE_KEY)
                .body("{}")
                .send()
                .unwrap();

            assert!(response.status().is_redirection(), "{status}");
            let origin_request = origin.join().unwrap();
            assert!(origin_request.contains("/v1/messages"));
            thread::sleep(Duration::from_millis(200));
            match target.accept() {
                Err(error) if error.kind() == ErrorKind::WouldBlock => {}
                Ok(_) => panic!("{status}: redirect target received a connection"),
                Err(error) => panic!("unexpected accept error: {error}"),
            }
        }
    }

    #[test]
    fn rejects_bodies_larger_than_the_cap() {
        let body = "x".repeat(4096);
        // No Content-Length: the cap must hold while streaming.
        let (url, server) =
            serve_once(format!("HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n{body}").into_bytes());
        let client = provider_http_client(local_policy(&url)).unwrap();
        let response = client.get(&url).send().unwrap();
        let error = read_bounded_text(response, 1024).unwrap_err();
        assert!(error.contains("1024-byte limit"), "{error}");
        server.join().unwrap();

        // Declared Content-Length above the cap is rejected before reading.
        let (url, server) = serve_once(
            format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            )
            .into_bytes(),
        );
        let response = client.get(&url).send().unwrap();
        let error = read_bounded_json::<serde_json::Value>(response, 1024).unwrap_err();
        assert!(error.contains("1024-byte limit"), "{error}");
        server.join().unwrap();
    }

    #[test]
    fn reads_bodies_within_the_cap() {
        let body = r#"{"ok":true}"#;
        let (url, server) = serve_once(
            format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            )
            .into_bytes(),
        );
        let client = provider_http_client(local_policy(&url)).unwrap();
        let response = client.get(&url).send().unwrap();
        let value: serde_json::Value = read_bounded_json(response, 1024).unwrap();
        assert_eq!(value, serde_json::json!({ "ok": true }));
        server.join().unwrap();
    }

    #[test]
    fn public_policy_refuses_plain_http() {
        let client = provider_http_client(TransportPolicy::PUBLIC_HTTPS).unwrap();
        assert!(client.get("http://127.0.0.1:9/").send().is_err());
    }

    #[test]
    fn consent_never_relaxes_public_destinations() {
        let public =
            validate_provider_destination("https://api.example.com/v1", LocalConsent::Granted)
                .unwrap();
        assert_eq!(
            TransportPolicy::for_destination(&public, LocalConsent::Granted),
            TransportPolicy::PUBLIC_HTTPS
        );
        assert_ne!(
            local_policy("http://localhost:1234"),
            TransportPolicy::PUBLIC_HTTPS
        );
    }

    #[test]
    fn public_only_resolver_drops_local_answers() {
        let name = "localhost".parse().unwrap();
        let result = tauri::async_runtime::block_on(PublicOnlyResolver.resolve(name));
        let error = result
            .err()
            .expect("localhost must not resolve for public destinations");
        assert!(error.to_string().contains("private network"), "{error}");
    }

    #[test]
    fn truncates_long_error_messages() {
        let long = "e".repeat(MAX_ERROR_MESSAGE_CHARS + 50);
        let truncated = truncate_error_message(&long);
        assert_eq!(truncated.chars().count(), MAX_ERROR_MESSAGE_CHARS + 1);
        assert!(truncated.ends_with('…'));
        assert_eq!(truncate_error_message("short"), "short");
    }
}
