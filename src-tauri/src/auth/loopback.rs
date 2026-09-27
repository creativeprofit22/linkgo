//! One-shot loopback listener for the OpenAI sign-in callback
//! (`http://localhost:1455/auth/callback`).
//!
//! Bounds: binds 127.0.0.1 only, reads at most 8 KiB of request line and
//! headers, answers any other path with 404 and keeps waiting, checks `state`
//! before handing a code back, and stops on timeout or cancellation.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

pub const OPENAI_CALLBACK_ADDR: &str = "127.0.0.1:1455";
pub const CALLBACK_PATH: &str = "/auth/callback";
pub const CALLBACK_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const MAX_REQUEST_BYTES: usize = 8 * 1024;
const POLL_INTERVAL: Duration = Duration::from_millis(100);
const READ_TIMEOUT: Duration = Duration::from_secs(5);
/// Rebinding after a cancel must outlast one `POLL_INTERVAL`, the longest a
/// cancelled worker keeps its listener open while idle.
pub const BIND_RETRY_ATTEMPTS: u32 = 5;
pub const BIND_RETRY_DELAY: Duration = Duration::from_millis(50);

const SUCCESS_PAGE: &str = "<!doctype html><html><body><h1>Linkgo sign-in received</h1><p>You can close this tab and return to Linkgo.</p></body></html>";
const ERROR_PAGE: &str = "<!doctype html><html><body><h1>Linkgo sign-in failed</h1><p>Return to Linkgo and start sign-in again.</p></body></html>";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LoopbackError {
    Timeout,
    Cancelled,
    StateMismatch,
    ProviderError(String),
    Io(String),
}

impl LoopbackError {
    pub fn message(&self) -> String {
        match self {
            Self::Timeout => {
                "Timed out waiting for the browser; paste the callback URL instead".to_string()
            }
            Self::Cancelled => "Sign-in was cancelled".to_string(),
            Self::StateMismatch => "Sign-in state did not match; restart sign-in".to_string(),
            Self::ProviderError(code) => format!("Provider returned an error: {code}"),
            Self::Io(message) => message.clone(),
        }
    }
}

/// Handle used to stop a waiting listener.
#[derive(Debug, Clone, Default)]
pub struct CancelHandle(Arc<AtomicBool>);

impl CancelHandle {
    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }
    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
    pub fn same_as(&self, other: &CancelHandle) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

/// Binds the callback port. Failure (port busy) means the caller should fall
/// back to the paste flow.
pub fn bind(address: &str) -> std::io::Result<TcpListener> {
    let listener = TcpListener::bind(address)?;
    listener.set_nonblocking(true)?;
    Ok(listener)
}

/// Like [`bind`], but retries briefly so a just-cancelled listener has time to
/// release the port. A port held by another process still fails after the
/// bounded window, so the caller can fall back to the paste flow.
pub fn bind_with_retry(
    address: &str,
    attempts: u32,
    delay: Duration,
) -> std::io::Result<TcpListener> {
    let mut attempt = 1;
    loop {
        match bind(address) {
            Ok(listener) => return Ok(listener),
            Err(error) if attempt >= attempts => return Err(error),
            Err(_) => {
                attempt += 1;
                std::thread::sleep(delay);
            }
        }
    }
}

#[cfg(test)]
pub fn local_addr(listener: &TcpListener) -> Option<std::net::SocketAddr> {
    listener.local_addr().ok()
}

enum RequestOutcome {
    Code(String),
    Ignored,
    Failed(LoopbackError),
}

fn respond(stream: &mut TcpStream, status: &str, body: &str) {
    let reply = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(reply.as_bytes());
    let _ = stream.flush();
}

fn read_head(stream: &mut TcpStream) -> Result<Vec<u8>, ()> {
    let mut head = Vec::new();
    let mut buffer = [0u8; 1024];
    loop {
        let read = stream.read(&mut buffer).map_err(|_| ())?;
        if read == 0 {
            return Ok(head);
        }
        head.extend_from_slice(&buffer[..read]);
        if head.windows(4).any(|window| window == b"\r\n\r\n") {
            return Ok(head);
        }
        if head.len() > MAX_REQUEST_BYTES {
            return Err(());
        }
    }
}

fn handle_connection(mut stream: TcpStream, expected_state: &str) -> RequestOutcome {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(READ_TIMEOUT));
    let Ok(head) = read_head(&mut stream) else {
        respond(&mut stream, "431 Request Header Fields Too Large", "");
        return RequestOutcome::Ignored;
    };
    let head = String::from_utf8_lossy(&head);
    let mut parts = head.lines().next().unwrap_or_default().split_whitespace();
    let (method, target) = (
        parts.next().unwrap_or_default(),
        parts.next().unwrap_or_default(),
    );
    let Ok(url) = url::Url::parse(&format!("http://localhost{target}")) else {
        respond(&mut stream, "400 Bad Request", "");
        return RequestOutcome::Ignored;
    };
    if method != "GET" || url.path() != CALLBACK_PATH {
        respond(&mut stream, "404 Not Found", "");
        return RequestOutcome::Ignored;
    }
    let mut code = None;
    let mut state = None;
    let mut error = None;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "code" => code = Some(value.into_owned()),
            "state" => state = Some(value.into_owned()),
            "error" => error = Some(value.into_owned()),
            _ => {}
        }
    }
    if state.as_deref() != Some(expected_state) {
        respond(&mut stream, "400 Bad Request", ERROR_PAGE);
        return RequestOutcome::Failed(LoopbackError::StateMismatch);
    }
    if let Some(error) = error {
        respond(&mut stream, "400 Bad Request", ERROR_PAGE);
        let code: String = error
            .chars()
            .filter(|character| character.is_ascii_alphanumeric() || *character == '_')
            .take(64)
            .collect();
        return RequestOutcome::Failed(LoopbackError::ProviderError(code));
    }
    match code.filter(|code| !code.trim().is_empty()) {
        Some(code) => {
            respond(&mut stream, "200 OK", SUCCESS_PAGE);
            RequestOutcome::Code(code)
        }
        None => {
            respond(&mut stream, "400 Bad Request", ERROR_PAGE);
            RequestOutcome::Failed(LoopbackError::ProviderError("missing_code".to_string()))
        }
    }
}

/// Waits for the callback. Blocking; run it on a worker thread.
pub fn wait_for_code(
    listener: TcpListener,
    expected_state: &str,
    timeout: Duration,
    cancel: &CancelHandle,
) -> Result<String, LoopbackError> {
    let deadline = Instant::now() + timeout;
    loop {
        if cancel.is_cancelled() {
            return Err(LoopbackError::Cancelled);
        }
        if Instant::now() >= deadline {
            return Err(LoopbackError::Timeout);
        }
        match listener.accept() {
            Ok((stream, peer)) => {
                if !peer.ip().is_loopback() {
                    continue;
                }
                match handle_connection(stream, expected_state) {
                    RequestOutcome::Code(code) => return Ok(code),
                    RequestOutcome::Ignored => {}
                    RequestOutcome::Failed(error) => return Err(error),
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(POLL_INTERVAL);
            }
            Err(error) => {
                return Err(LoopbackError::Io(format!(
                    "Callback listener failed: {}",
                    error.kind()
                )))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn start(
        timeout: Duration,
    ) -> (
        String,
        CancelHandle,
        std::thread::JoinHandle<Result<String, LoopbackError>>,
    ) {
        let listener = bind("127.0.0.1:0").expect("bind");
        let address = local_addr(&listener).expect("addr").to_string();
        let cancel = CancelHandle::default();
        let thread_cancel = cancel.clone();
        let handle = std::thread::spawn(move || {
            wait_for_code(listener, "good-state", timeout, &thread_cancel)
        });
        (address, cancel, handle)
    }

    fn send(address: &str, request: &str) -> String {
        let mut stream = TcpStream::connect(address).expect("connect");
        stream.write_all(request.as_bytes()).expect("write");
        let mut response = String::new();
        let _ = stream.read_to_string(&mut response);
        response
    }

    #[test]
    fn correct_callback_returns_code() {
        let (address, _, handle) = start(Duration::from_secs(10));
        let response = send(
            &address,
            "GET /auth/callback?code=the-code&state=good-state HTTP/1.1\r\nHost: localhost\r\n\r\n",
        );
        assert!(response.starts_with("HTTP/1.1 200"));
        assert_eq!(handle.join().expect("join"), Ok("the-code".to_string()));
    }

    #[test]
    fn wrong_state_is_rejected_without_code() {
        let (address, _, handle) = start(Duration::from_secs(10));
        let response = send(
            &address,
            "GET /auth/callback?code=c&state=evil HTTP/1.1\r\nHost: localhost\r\n\r\n",
        );
        assert!(response.starts_with("HTTP/1.1 400"));
        assert_eq!(
            handle.join().expect("join"),
            Err(LoopbackError::StateMismatch)
        );
    }

    #[test]
    fn wrong_path_gets_404_and_listener_keeps_waiting() {
        let (address, _, handle) = start(Duration::from_secs(10));
        let response = send(
            &address,
            "GET /favicon.ico HTTP/1.1\r\nHost: localhost\r\n\r\n",
        );
        assert!(response.starts_with("HTTP/1.1 404"));
        let response = send(
            &address,
            "POST /auth/callback?code=c&state=good-state HTTP/1.1\r\n\r\n",
        );
        assert!(response.starts_with("HTTP/1.1 404"));
        send(
            &address,
            "GET /auth/callback?code=later&state=good-state HTTP/1.1\r\n\r\n",
        );
        assert_eq!(handle.join().expect("join"), Ok("later".to_string()));
    }

    #[test]
    fn oversized_request_is_rejected_and_listener_keeps_waiting() {
        let (address, cancel, handle) = start(Duration::from_secs(10));
        let huge = format!(
            "GET /auth/callback?code=c&state=good-state HTTP/1.1\r\nX-Big: {}\r\n\r\n",
            "a".repeat(10 * 1024)
        );
        let response = send(&address, &huge);
        assert!(response.starts_with("HTTP/1.1 431"));
        cancel.cancel();
        assert_eq!(handle.join().expect("join"), Err(LoopbackError::Cancelled));
    }

    #[test]
    fn short_timeout_produces_timeout_error() {
        let (_, _, handle) = start(Duration::from_millis(250));
        assert_eq!(handle.join().expect("join"), Err(LoopbackError::Timeout));
    }

    #[test]
    fn busy_port_fails_to_bind_so_caller_can_fall_back() {
        let first = bind("127.0.0.1:0").expect("bind");
        let address = local_addr(&first).expect("addr").to_string();
        assert!(bind(&address).is_err());
        assert!(bind_with_retry(&address, 2, Duration::from_millis(10)).is_err());
    }

    #[test]
    fn rebinding_after_cancel_succeeds_once_worker_releases_port() {
        let (address, cancel, handle) = start(Duration::from_secs(10));
        cancel.cancel();
        let listener = bind_with_retry(&address, BIND_RETRY_ATTEMPTS, BIND_RETRY_DELAY)
            .expect("rebind after cancel");
        assert_eq!(local_addr(&listener).expect("addr").to_string(), address);
        assert_eq!(handle.join().expect("join"), Err(LoopbackError::Cancelled));
    }
}
