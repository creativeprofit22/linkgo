//! Direct HTTPS client for the watchlist mode: the one agreed exception to
//! the CLI transport. Bright Data's LinkedIn post discovery by profile or
//! company URL is asynchronous, so this feature needs four calls on one fixed
//! host: trigger, progress, snapshot download and cancel.
//!
//! - Fixed base URL [`BRIGHTDATA_API_BASE`]; tests inject a local base through
//!   [`DirectClient::for_test`] only.
//! - Hardened transport (no redirects, no proxy, HTTPS-only, public DNS only),
//!   30 s per request, bounded bodies.
//! - 409 on download = not ready yet; 400/401/403/404 are terminal; 429/5xx
//!   and network errors are transient.

use std::time::Duration;

use reqwest::blocking::{Client, Response};
use reqwest::StatusCode;
use serde_json::{json, Value};

use crate::js_url::is_allowed_linkedin_url;
use crate::net::transport::{
    read_bounded_bytes, read_bounded_text, source_http_client, truncate_error_message,
    TransportPolicy,
};

pub(crate) const BRIGHTDATA_API_BASE: &str = "https://api.brightdata.com";
pub(crate) const LINKEDIN_POSTS_DATASET_ID: &str = "gd_lyy3tktm25m4avu764";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const SMALL_RESPONSE_BYTES: u64 = 64 * 1024;
const SNAPSHOT_RESPONSE_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum WatchKind {
    Profile,
    Company,
}

impl WatchKind {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            WatchKind::Profile => "profile",
            WatchKind::Company => "company",
        }
    }

    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "profile" => Some(WatchKind::Profile),
            "company" => Some(WatchKind::Company),
            _ => None,
        }
    }

    fn discover_by(self) -> &'static str {
        match self {
            WatchKind::Profile => "profile_url",
            WatchKind::Company => "company_url",
        }
    }
}

/// Validates a watchlist URL for its kind: HTTPS LinkedIn `/in/<slug>` or
/// `/company/<slug>`, no credentials or port.
pub(crate) fn validate_watch_url(kind: WatchKind, raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    let invalid = || {
        Err(match kind {
            WatchKind::Profile => {
                "Use a LinkedIn profile URL like https://www.linkedin.com/in/name"
            }
            WatchKind::Company => {
                "Use a LinkedIn company URL like https://www.linkedin.com/company/name"
            }
        }
        .to_string())
    };
    if trimmed.is_empty() || trimmed.len() > 1000 || !is_allowed_linkedin_url(trimmed) {
        return invalid();
    }
    let Ok(url) = url::Url::parse(trimmed) else {
        return invalid();
    };
    if !url.username().is_empty() || url.password().is_some() || url.port().is_some() {
        return invalid();
    }
    let prefix = match kind {
        WatchKind::Profile => "/in/",
        WatchKind::Company => "/company/",
    };
    let slug = url.path().strip_prefix(prefix).unwrap_or_default();
    if slug.trim_matches('/').is_empty() {
        return invalid();
    }
    let mut clean = url;
    clean.set_query(None);
    clean.set_fragment(None);
    Ok(clean.to_string())
}

/// Snapshot ids go into URL paths; only plain id characters are allowed.
pub(crate) fn validate_snapshot_id(id: &str) -> Result<&str, DirectError> {
    let ok = !id.is_empty()
        && id.len() <= 200
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-');
    if ok {
        Ok(id)
    } else {
        Err(DirectError::Terminal(
            "Bright Data returned an invalid snapshot id".to_string(),
        ))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum DirectError {
    /// Retrying will not help (bad request, unknown snapshot, auth).
    Terminal(String),
    /// Network or server trouble; the run may be resumed later.
    Transient(String),
}

impl DirectError {
    pub(crate) fn message(&self) -> &str {
        match self {
            DirectError::Terminal(message) | DirectError::Transient(message) => message,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SnapshotStatus {
    Running,
    Ready,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum Download {
    NotReady,
    Records(Vec<Value>),
}

pub(crate) struct DirectClient {
    client: Client,
    base_url: String,
    api_key: String,
}

impl DirectClient {
    pub(crate) fn new(api_key: String) -> Result<Self, String> {
        Ok(Self {
            client: source_http_client(TransportPolicy::PUBLIC_HTTPS, REQUEST_TIMEOUT)?,
            base_url: BRIGHTDATA_API_BASE.to_string(),
            api_key,
        })
    }

    #[cfg(test)]
    pub(crate) fn for_test(base_url: &str, api_key: &str) -> Self {
        Self {
            client: source_http_client(TransportPolicy::LOCAL_TEST, Duration::from_secs(5))
                .unwrap(),
            base_url: base_url.to_string(),
            api_key: api_key.to_string(),
        }
    }

    fn error_for(&self, status: StatusCode, response: Response) -> DirectError {
        let body = read_bounded_text(response, SMALL_RESPONSE_BYTES).unwrap_or_default();
        let detail = match serde_json::from_str::<Value>(&body) {
            Ok(value) => ["error", "message"]
                .iter()
                .find_map(|key| value.get(*key).and_then(Value::as_str).map(str::to_string))
                .unwrap_or_else(|| value.to_string()),
            // Bright Data sometimes answers errors in plain text.
            Err(_) => body.trim().to_string(),
        };
        let detail = truncate_error_message(&detail.replace(&self.api_key, "[redacted]"));
        let message = if detail.is_empty() {
            format!("Bright Data request failed with HTTP {}", status.as_u16())
        } else {
            format!(
                "Bright Data request failed with HTTP {}: {}",
                status.as_u16(),
                crate::auth::redact_error(detail)
            )
        };
        match status.as_u16() {
            400 | 401 | 403 | 404 | 422 => DirectError::Terminal(message),
            _ => DirectError::Transient(message),
        }
    }

    fn send(&self, request: reqwest::blocking::RequestBuilder) -> Result<Response, DirectError> {
        request
            .bearer_auth(&self.api_key)
            .send()
            .map_err(|_| DirectError::Transient("Bright Data could not be reached".to_string()))
    }

    fn json_body(&self, response: Response, max: u64) -> Result<Value, DirectError> {
        let bytes = read_bounded_bytes(response, max).map_err(DirectError::Transient)?;
        serde_json::from_slice(&bytes).map_err(|_| {
            DirectError::Terminal("Bright Data returned a response that was not JSON".to_string())
        })
    }

    /// Starts discovery of recent posts for profile or company URLs (all
    /// inputs must share a kind). Returns the snapshot id.
    pub(crate) fn trigger(
        &self,
        kind: WatchKind,
        urls: &[String],
        start_date: &str,
        end_date: &str,
        limit_per_input: usize,
    ) -> Result<String, DirectError> {
        if urls.is_empty() {
            return Err(DirectError::Terminal(
                "No watchlist entries to fetch".to_string(),
            ));
        }
        let inputs: Vec<Value> = urls
            .iter()
            .map(|url| json!({ "url": url, "start_date": start_date, "end_date": end_date }))
            .collect();
        let limit = limit_per_input.to_string();
        let response = self.send(
            self.client
                .post(format!("{}/datasets/v3/trigger", self.base_url))
                .query(&[
                    ("dataset_id", LINKEDIN_POSTS_DATASET_ID),
                    ("type", "discover_new"),
                    ("discover_by", kind.discover_by()),
                    ("include_errors", "true"),
                    ("limit_per_input", limit.as_str()),
                ])
                .json(&inputs),
        )?;
        let status = response.status();
        if !status.is_success() {
            return Err(self.error_for(status, response));
        }
        let body = self.json_body(response, SMALL_RESPONSE_BYTES)?;
        let id = body
            .get("snapshot_id")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                DirectError::Terminal("Bright Data did not return a snapshot id".to_string())
            })?;
        Ok(validate_snapshot_id(id)?.to_string())
    }

    pub(crate) fn progress(&self, snapshot_id: &str) -> Result<SnapshotStatus, DirectError> {
        let id = validate_snapshot_id(snapshot_id)?;
        let response = self.send(
            self.client
                .get(format!("{}/datasets/v3/progress/{id}", self.base_url)),
        )?;
        let status = response.status();
        if !status.is_success() {
            return Err(self.error_for(status, response));
        }
        let body = self.json_body(response, SMALL_RESPONSE_BYTES)?;
        match body.get("status").and_then(Value::as_str) {
            Some("starting" | "running" | "building" | "collecting" | "digesting") => {
                Ok(SnapshotStatus::Running)
            }
            Some("ready") => Ok(SnapshotStatus::Ready),
            Some("failed") => Ok(SnapshotStatus::Failed),
            Some("canceled" | "cancelled") => Ok(SnapshotStatus::Cancelled),
            _ => Err(DirectError::Terminal(
                "Bright Data returned an unknown snapshot status".to_string(),
            )),
        }
    }

    pub(crate) fn download(&self, snapshot_id: &str) -> Result<Download, DirectError> {
        let id = validate_snapshot_id(snapshot_id)?;
        let response = self.send(
            self.client
                .get(format!("{}/datasets/v3/snapshot/{id}", self.base_url))
                .query(&[("format", "json")]),
        )?;
        let status = response.status();
        if status == StatusCode::ACCEPTED || status == StatusCode::CONFLICT {
            return Ok(Download::NotReady);
        }
        if !status.is_success() {
            return Err(self.error_for(status, response));
        }
        match self.json_body(response, SNAPSHOT_RESPONSE_BYTES)? {
            Value::Array(records) => Ok(Download::Records(records)),
            _ => Err(DirectError::Terminal(
                "Bright Data returned an unexpected snapshot shape".to_string(),
            )),
        }
    }

    pub(crate) fn cancel(&self, snapshot_id: &str) -> Result<(), DirectError> {
        let id = validate_snapshot_id(snapshot_id)?;
        let response = self.send(self.client.post(format!(
            "{}/datasets/v3/snapshot/{id}/cancel",
            self.base_url
        )))?;
        let status = response.status();
        if status.is_success() {
            Ok(())
        } else {
            Err(self.error_for(status, response))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::thread;

    const KEY: &str = "bd-direct-test-key-0000";

    fn read_request(stream: &mut TcpStream) -> String {
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut data = Vec::new();
        let mut buffer = [0_u8; 4096];
        loop {
            let read = stream.read(&mut buffer).unwrap_or(0);
            if read == 0 {
                break;
            }
            data.extend_from_slice(&buffer[..read]);
            let text = String::from_utf8_lossy(&data).to_string();
            if let Some(end) = text.find("\r\n\r\n") {
                let length = text[..end]
                    .lines()
                    .find_map(|line| {
                        let (name, value) = line.split_once(':')?;
                        name.eq_ignore_ascii_case("content-length")
                            .then(|| value.trim().parse::<usize>().ok())
                            .flatten()
                    })
                    .unwrap_or(0);
                if data.len() >= end + 4 + length {
                    return text;
                }
            }
        }
        String::from_utf8_lossy(&data).to_string()
    }

    /// Serves `responses` in order (one per connection); returns the base URL
    /// and a handle yielding the raw requests.
    fn serve(responses: Vec<(u16, String)>) -> (String, thread::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let handle = thread::spawn(move || {
            let mut requests = Vec::new();
            for (status, body) in responses {
                let (mut stream, _) = listener.accept().unwrap();
                requests.push(read_request(&mut stream));
                let reply = format!(
                    "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                stream.write_all(reply.as_bytes()).unwrap();
                stream.flush().unwrap();
            }
            requests
        });
        (url, handle)
    }

    fn fixture(raw: &str) -> (u16, String) {
        let value: Value = serde_json::from_str(raw).unwrap();
        assert!(
            value["_source"].is_string(),
            "fixtures document their source"
        );
        let status = value.get("status").and_then(Value::as_u64).unwrap_or(200) as u16;
        (status, value["body"].to_string())
    }

    #[test]
    fn production_client_uses_the_fixed_host() {
        let client = DirectClient::new("k".to_string()).unwrap();
        assert_eq!(client.base_url, "https://api.brightdata.com");
    }

    #[test]
    fn full_trigger_progress_download_flow() {
        let (base, server) = serve(vec![
            fixture(include_str!("fixtures/direct_trigger.json")),
            fixture(include_str!("fixtures/direct_progress_running.json")),
            fixture(include_str!("fixtures/direct_snapshot_not_ready_409.json")),
            fixture(include_str!("fixtures/direct_progress_ready.json")),
            fixture(include_str!("fixtures/direct_snapshot_discover.json")),
        ]);
        let client = DirectClient::for_test(&base, KEY);
        let urls = vec!["https://www.linkedin.com/in/synthetic-watch-person".to_string()];
        let id = client
            .trigger(
                WatchKind::Profile,
                &urls,
                "2026-09-23T00:00:00.000Z",
                "2026-09-30T00:00:00.000Z",
                20,
            )
            .unwrap();
        assert_eq!(id, "sd_synthetic0000000001");
        assert_eq!(client.progress(&id).unwrap(), SnapshotStatus::Running);
        assert_eq!(client.download(&id).unwrap(), Download::NotReady);
        assert_eq!(client.progress(&id).unwrap(), SnapshotStatus::Ready);
        let Download::Records(records) = client.download(&id).unwrap() else {
            panic!("expected records");
        };
        assert_eq!(records.len(), 3);

        let requests = server.join().unwrap();
        let trigger = &requests[0];
        assert!(trigger.starts_with("POST /datasets/v3/trigger?dataset_id=gd_lyy3tktm25m4avu764&type=discover_new&discover_by=profile_url&include_errors=true&limit_per_input=20 "), "{trigger}");
        assert!(trigger
            .to_ascii_lowercase()
            .contains(&format!("authorization: bearer {KEY}").to_ascii_lowercase()));
        assert!(trigger.contains(r#""start_date":"2026-09-23T00:00:00.000Z""#));
        assert!(requests[1].starts_with("GET /datasets/v3/progress/sd_synthetic0000000001 "));
        assert!(requests[2]
            .starts_with("GET /datasets/v3/snapshot/sd_synthetic0000000001?format=json "));
    }

    #[test]
    fn replays_live_company_capture() {
        let (base, server) = serve(vec![
            fixture(include_str!("fixtures/live_direct_trigger.json")),
            fixture(include_str!("fixtures/direct_progress_ready.json")),
            fixture(include_str!("fixtures/live_direct_snapshot_company.json")),
        ]);
        let client = DirectClient::for_test(&base, KEY);
        let urls = vec!["https://www.linkedin.com/company/bright-data".to_string()];
        let id = client
            .trigger(
                WatchKind::Company,
                &urls,
                "2026-09-24T00:00:00.000Z",
                "2026-10-01T09:00:00.000Z",
                3,
            )
            .unwrap();
        assert_eq!(id, "sd_mup1s6a41cdj81nogn");
        assert_eq!(client.progress(&id).unwrap(), SnapshotStatus::Ready);
        let Download::Records(records) = client.download(&id).unwrap() else {
            panic!("expected records");
        };
        assert_eq!(records.len(), 3);
        server.join().unwrap();
    }

    #[test]
    fn company_trigger_and_cancel() {
        let (base, server) = serve(vec![
            fixture(include_str!("fixtures/direct_trigger.json")),
            (200, "{}".to_string()),
        ]);
        let client = DirectClient::for_test(&base, KEY);
        let urls = vec!["https://www.linkedin.com/company/synthetic-watch-company".to_string()];
        let id = client
            .trigger(
                WatchKind::Company,
                &urls,
                "2026-09-23T00:00:00.000Z",
                "2026-09-30T12:00:00.000Z",
                5,
            )
            .unwrap();
        client.cancel(&id).unwrap();
        let requests = server.join().unwrap();
        assert!(requests[0].contains("discover_by=company_url"));
        assert!(requests[0].contains(r#""start_date":"2026-09-23T00:00:00.000Z""#));
        assert!(requests[0].contains(r#""end_date":"2026-09-30T12:00:00.000Z""#));
        assert!(
            requests[1].starts_with("POST /datasets/v3/snapshot/sd_synthetic0000000001/cancel ")
        );
    }

    #[test]
    fn status_400_is_terminal_and_5xx_is_transient_and_key_is_redacted() {
        let (base, server) = serve(vec![
            fixture(include_str!("fixtures/direct_error_400.json")),
            (500, format!(r#"{{"error":"boom {KEY}"}}"#)),
            fixture(include_str!("fixtures/direct_progress_failed.json")),
            (200, r#"{"status":"mystery"}"#.to_string()),
        ]);
        let client = DirectClient::for_test(&base, KEY);
        let error = client.download("sd_x").unwrap_err();
        assert!(matches!(error, DirectError::Terminal(_)), "{error:?}");
        assert!(error.message().contains("HTTP 400"));
        let error = client.progress("sd_x").unwrap_err();
        assert!(matches!(error, DirectError::Transient(_)), "{error:?}");
        assert!(!error.message().contains(KEY));
        assert_eq!(client.progress("sd_x").unwrap(), SnapshotStatus::Failed);
        assert!(matches!(
            client.progress("sd_x").unwrap_err(),
            DirectError::Terminal(_)
        ));
        server.join().unwrap();
    }

    #[test]
    fn rejects_unsafe_snapshot_ids_without_a_request() {
        let client = DirectClient::for_test("http://127.0.0.1:9", KEY);
        for bad in ["", "../x", "a/b", "a?b", "a b", &"a".repeat(201)] {
            assert!(matches!(
                client.progress(bad).unwrap_err(),
                DirectError::Terminal(_)
            ));
        }
    }

    #[test]
    fn validates_watch_urls_by_kind() {
        assert_eq!(
            validate_watch_url(
                WatchKind::Profile,
                " https://www.linkedin.com/in/someone?trk=x#y "
            )
            .unwrap(),
            "https://www.linkedin.com/in/someone"
        );
        assert!(
            validate_watch_url(WatchKind::Company, "https://de.linkedin.com/company/acme/").is_ok()
        );
        for (kind, bad) in [
            (WatchKind::Profile, "https://www.linkedin.com/company/acme"),
            (WatchKind::Company, "https://www.linkedin.com/in/someone"),
            (WatchKind::Profile, "https://www.linkedin.com/in/"),
            (WatchKind::Profile, "http://www.linkedin.com/in/someone"),
            (WatchKind::Profile, "https://evil.test/in/someone"),
            (
                WatchKind::Profile,
                "https://www.linkedin.com:444/in/someone",
            ),
            (WatchKind::Profile, ""),
        ] {
            assert!(validate_watch_url(kind, bad).is_err(), "{bad}");
        }
    }
}
