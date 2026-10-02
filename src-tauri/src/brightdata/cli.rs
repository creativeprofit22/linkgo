//! `brightdata` CLI transport for the `post_url` mode.
//!
//! - Only the pinned CLI version runs (`--version` must equal
//!   [`PINNED_CLI_VERSION`]).
//! - Argument arrays only, never a shell. Only allowlisted subcommands:
//!   `--version` and `pipelines linkedin_posts`; every data command
//!   carries `--json` and `--timeout`.
//! - The child gets a cleared environment plus the minimum Node needs; the
//!   API key travels only in `BRIGHTDATA_API_KEY`, never in argv. `login`
//!   and `--api-key` are never used, so the CLI never writes its plaintext
//!   `credentials.json`.
//! - stdout/stderr are size-capped, the run has a hard wall-clock timeout and
//!   can be cancelled; the child is killed on either. stdout is parsed as
//!   JSON only; stderr is redacted and truncated before it reaches the UI.

use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::Value;

use super::mapping::is_linkedin_post_url;

pub(crate) const PINNED_CLI_VERSION: &str = "0.3.7";
/// Optional absolute path to the CLI; otherwise `brightdata` on PATH.
pub(crate) const CLI_PATH_ENV: &str = "LINKGO_BRIGHTDATA_CLI";
pub(crate) const STDOUT_CAP_BYTES: usize = 2 * 1024 * 1024;
pub(crate) const STDERR_CAP_BYTES: usize = 64 * 1024;
const MAX_STDERR_MESSAGE_CHARS: usize = 300;
const VERSION_TIMEOUT: Duration = Duration::from_secs(30);
/// Seconds passed to the CLI's own `--timeout`; the hard kill fires later.
const PIPELINE_CLI_TIMEOUT_SECS: u64 = 300;
const HARD_TIMEOUT_GRACE: Duration = Duration::from_secs(30);
/// After the child exits or is killed, pipe readers get this long to finish;
/// a grandchild still holding a pipe cannot hang the run.
const READER_JOIN_TIMEOUT: Duration = Duration::from_secs(5);
/// Environment variables passed through to the child besides the key.
const PASSTHROUGH_ENV: &[&str] = &[
    "PATH",
    "SystemRoot",
    "SYSTEMROOT",
    "windir",
    "APPDATA",
    "LOCALAPPDATA",
    "USERPROFILE",
    "HOME",
    "TEMP",
    "TMP",
    "TMPDIR",
    "XDG_CONFIG_HOME",
];

/// One child-process invocation. Built only by this module.
#[derive(Debug, Clone)]
pub(crate) struct ProcessRequest {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub timeout: Duration,
    pub stdout_cap: usize,
    pub stderr_cap: usize,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct ProcessOutput {
    pub success: bool,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub timed_out: bool,
    pub cancelled: bool,
    pub stdout_overflow: bool,
}

/// Spawns processes. Tests inject a fake so no paid call is ever made.
pub(crate) trait ProcessRunner: Send + Sync {
    fn run(&self, request: &ProcessRequest, cancel: &AtomicBool) -> Result<ProcessOutput, String>;
}

/// Reads up to `cap` bytes, then drains the rest so the child never blocks
/// on a full pipe. Returns (bytes, overflowed).
fn read_capped(mut source: impl Read, cap: usize) -> (Vec<u8>, bool) {
    let mut kept = Vec::new();
    let mut overflow = false;
    let mut buffer = [0_u8; 8192];
    loop {
        match source.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(read) => {
                let room = cap.saturating_sub(kept.len());
                kept.extend_from_slice(&buffer[..read.min(room)]);
                if read > room {
                    overflow = true;
                }
            }
        }
    }
    (kept, overflow)
}

/// Kills the child and its descendants (`brightdata.cmd` → `node`).
fn kill_tree(child: &mut std::process::Child) {
    #[cfg(windows)]
    {
        if let Ok(system_root) = std::env::var("SystemRoot") {
            let taskkill = PathBuf::from(system_root)
                .join("System32")
                .join("taskkill.exe");
            let _ = Command::new(taskkill)
                .args(["/T", "/F", "/PID", &child.id().to_string()])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
    }
    #[cfg(unix)]
    {
        // The child leads its own process group (see `process_group(0)`).
        let _ = Command::new("/bin/kill")
            .args(["-KILL", &format!("-{}", child.id())])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn spawn_reader(
    pipe: Option<impl Read + Send + 'static>,
    cap: usize,
) -> mpsc::Receiver<(Vec<u8>, bool)> {
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let result = pipe.map_or((Vec::new(), false), |pipe| read_capped(pipe, cap));
        let _ = sender.send(result);
    });
    receiver
}

pub(crate) struct SystemProcessRunner;

impl ProcessRunner for SystemProcessRunner {
    fn run(&self, request: &ProcessRequest, cancel: &AtomicBool) -> Result<ProcessOutput, String> {
        let mut command = Command::new(&request.program);
        command
            .args(&request.args)
            .env_clear()
            .envs(request.env.iter().map(|(k, v)| (k.as_str(), v.as_str())))
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        let mut child = command
            .spawn()
            .map_err(|_| "The Bright Data CLI could not be started".to_string())?;
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let stdout_reader = spawn_reader(stdout, request.stdout_cap);
        let stderr_reader = spawn_reader(stderr, request.stderr_cap);
        let started = Instant::now();
        let mut output = ProcessOutput::default();
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    output.success = status.success();
                    break;
                }
                Ok(None) => {}
                Err(_) => {
                    kill_tree(&mut child);
                    break;
                }
            }
            if cancel.load(Ordering::SeqCst) {
                output.cancelled = true;
            } else if started.elapsed() >= request.timeout {
                output.timed_out = true;
            }
            if output.cancelled || output.timed_out {
                kill_tree(&mut child);
                break;
            }
            thread::sleep(Duration::from_millis(100));
        }
        let (stdout, stdout_overflow) = stdout_reader
            .recv_timeout(READER_JOIN_TIMEOUT)
            .unwrap_or_default();
        let (stderr, _) = stderr_reader
            .recv_timeout(READER_JOIN_TIMEOUT)
            .unwrap_or_default();
        output.stdout = stdout;
        output.stdout_overflow = stdout_overflow;
        output.stderr = stderr;
        Ok(output)
    }
}

/// CLI file names searched on PATH.
fn cli_file_names() -> &'static [&'static str] {
    if cfg!(windows) {
        &["brightdata.exe", "brightdata.cmd"]
    } else {
        &["brightdata"]
    }
}

/// Resolves the CLI: an explicitly configured absolute path, else the first
/// match in absolute PATH entries (relative entries such as `.` are skipped
/// so the working directory cannot plant a binary).
pub(crate) fn resolve_cli_binary(
    configured: Option<&str>,
    path_var: Option<&str>,
) -> Result<PathBuf, String> {
    if let Some(raw) = configured {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return Err("The configured Bright Data CLI path is empty".to_string());
        }
        let path = PathBuf::from(trimmed);
        if !path.is_absolute() {
            return Err("The configured Bright Data CLI path must be absolute".to_string());
        }
        if !path.is_file() {
            return Err("The configured Bright Data CLI path does not exist".to_string());
        }
        return Ok(path);
    }
    let path_var = path_var.unwrap_or_default();
    for directory in std::env::split_paths(path_var) {
        if !directory.is_absolute() {
            continue;
        }
        for name in cli_file_names() {
            let candidate = directory.join(name);
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    Err(
        "The Bright Data CLI was not found. Install it with `npm i -g @brightdata/cli@0.3.7`."
            .to_string(),
    )
}

/// Minimal child environment: selected pass-through variables plus the key.
pub(crate) fn child_env(
    api_key: &str,
    lookup: impl Fn(&str) -> Option<String>,
) -> Vec<(String, String)> {
    let mut env: Vec<(String, String)> = PASSTHROUGH_ENV
        .iter()
        .filter_map(|name| lookup(name).map(|value| ((*name).to_string(), value)))
        .collect();
    env.push(("BRIGHTDATA_API_KEY".to_string(), api_key.to_string()));
    env.sort();
    env.dedup_by(|a, b| a.0 == b.0);
    env
}

/// Allowlist check applied to every argument vector before spawning.
pub(crate) fn validate_args(args: &[String]) -> Result<(), String> {
    let refused = || Err("Refusing an unexpected Bright Data CLI command".to_string());
    let data_command_ok = |args: &[String]| {
        args.iter().any(|arg| arg == "--json")
            && args.iter().any(|arg| arg == "--timeout")
            && !args
                .iter()
                .any(|arg| arg == "--api-key" || arg.starts_with("--api-key=") || arg == "-k")
    };
    match args {
        [only] if only == "--version" => Ok(()),
        [first, second, rest @ ..]
            if first == "pipelines" && second == "linkedin_posts" && data_command_ok(rest) =>
        {
            Ok(())
        }
        _ => refused(),
    }
}

pub(crate) fn pipelines_args(post_url: &str) -> Result<Vec<String>, String> {
    if !is_linkedin_post_url(post_url) || post_url.starts_with('-') {
        return Err("Only LinkedIn post URLs can be fetched".to_string());
    }
    Ok(vec![
        "pipelines".into(),
        "linkedin_posts".into(),
        post_url.trim().into(),
        "--json".into(),
        "--timeout".into(),
        PIPELINE_CLI_TIMEOUT_SECS.to_string(),
    ])
}

/// Redacts the key and truncates CLI stderr for display.
pub(crate) fn sanitize_stderr(stderr: &[u8], api_key: &str) -> String {
    let mut text = String::from_utf8_lossy(stderr).into_owned();
    if !api_key.is_empty() {
        text = text.replace(api_key, "[redacted]");
    }
    let lines: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    // The CLI prints "Error: <message>" then "Status: <code>" (and maybe a
    // hint); keep the message and status together.
    let summary = match lines.iter().rposition(|line| line.starts_with("Error:")) {
        Some(index) => lines[index..].join(" "),
        None => lines.last().copied().unwrap_or("").to_string(),
    };
    let truncated: String = summary.chars().take(MAX_STDERR_MESSAGE_CHARS).collect();
    crate::auth::redact_error(truncated)
}

/// CLI client bound to a resolved binary, key and runner.
pub(crate) struct CliClient<'a> {
    pub runner: &'a dyn ProcessRunner,
    pub program: PathBuf,
    pub env: Vec<(String, String)>,
    pub api_key: String,
    pub cancel: Arc<AtomicBool>,
}

impl CliClient<'_> {
    fn run(&self, args: Vec<String>, timeout: Duration) -> Result<Vec<u8>, String> {
        validate_args(&args)?;
        let request = ProcessRequest {
            program: self.program.clone(),
            args,
            env: self.env.clone(),
            timeout,
            stdout_cap: STDOUT_CAP_BYTES,
            stderr_cap: STDERR_CAP_BYTES,
        };
        let output = self.runner.run(&request, &self.cancel)?;
        if output.cancelled {
            return Err("Cancelled".to_string());
        }
        if output.timed_out {
            return Err("The Bright Data CLI timed out and was stopped".to_string());
        }
        if output.stdout_overflow {
            return Err("The Bright Data CLI returned more data than allowed".to_string());
        }
        if !output.success {
            let detail = sanitize_stderr(&output.stderr, &self.api_key);
            return Err(if detail.is_empty() {
                "The Bright Data CLI failed".to_string()
            } else {
                format!("The Bright Data CLI failed: {detail}")
            });
        }
        Ok(output.stdout)
    }

    fn run_json(&self, args: Vec<String>, timeout: Duration) -> Result<Value, String> {
        let stdout = self.run(args, timeout)?;
        serde_json::from_slice(&stdout)
            .map_err(|_| "The Bright Data CLI did not return JSON".to_string())
    }

    /// Refuses any CLI version other than the pinned one.
    pub fn check_version(&self) -> Result<(), String> {
        let stdout = self.run(vec!["--version".to_string()], VERSION_TIMEOUT)?;
        let version = String::from_utf8_lossy(&stdout).trim().to_string();
        if version == PINNED_CLI_VERSION {
            Ok(())
        } else {
            Err(format!(
                "Bright Data CLI {PINNED_CLI_VERSION} is required (found {})",
                version.chars().take(40).collect::<String>()
            ))
        }
    }

    /// `pipelines linkedin_posts <url> --json` → raw records.
    pub fn collect_post(&self, post_url: &str) -> Result<Vec<Value>, String> {
        let args = pipelines_args(post_url)?;
        let value = self.run_json(
            args,
            Duration::from_secs(PIPELINE_CLI_TIMEOUT_SECS) + HARD_TIMEOUT_GRACE,
        )?;
        match value {
            Value::Array(records) => Ok(records),
            Value::Object(_) => Ok(vec![value]),
            _ => Err("The Bright Data CLI returned an unexpected shape".to_string()),
        }
    }
}

/// Resolves the binary using the process environment.
pub(crate) fn resolve_from_env() -> Result<PathBuf, String> {
    resolve_cli_binary(
        std::env::var(CLI_PATH_ENV).ok().as_deref(),
        std::env::var("PATH").ok().as_deref(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    const KEY: &str = "bd-test-key-0000000000";

    struct FakeRunner {
        responses: Mutex<Vec<ProcessOutput>>,
        seen: Mutex<Vec<ProcessRequest>>,
    }

    impl FakeRunner {
        fn new(responses: Vec<ProcessOutput>) -> Self {
            Self {
                responses: Mutex::new(responses.into_iter().rev().collect()),
                seen: Mutex::new(Vec::new()),
            }
        }
    }

    impl ProcessRunner for FakeRunner {
        fn run(
            &self,
            request: &ProcessRequest,
            _cancel: &AtomicBool,
        ) -> Result<ProcessOutput, String> {
            self.seen.lock().unwrap().push(request.clone());
            Ok(self
                .responses
                .lock()
                .unwrap()
                .pop()
                .expect("unexpected run"))
        }
    }

    fn ok(stdout: &str) -> ProcessOutput {
        ProcessOutput {
            success: true,
            stdout: stdout.as_bytes().to_vec(),
            ..ProcessOutput::default()
        }
    }

    fn body(raw: &str) -> String {
        let value: Value = serde_json::from_str(raw).unwrap();
        assert_eq!(value["_provisional"], Value::Bool(true));
        match &value["body"] {
            Value::String(text) => text.clone(),
            other => other.to_string(),
        }
    }

    fn client(runner: &FakeRunner) -> CliClient<'_> {
        CliClient {
            runner,
            program: PathBuf::from("/opt/bd/brightdata"),
            env: child_env(KEY, |_| None),
            api_key: KEY.to_string(),
            cancel: Arc::new(AtomicBool::new(false)),
        }
    }

    const POST: &str =
        "https://www.linkedin.com/posts/synthetic-author-one_ai-agents-activity-7300000000000000001-AbCd";

    #[test]
    fn builds_argument_arrays_without_key_or_shell() {
        let args = pipelines_args(POST).unwrap();
        assert_eq!(&args[..3], &["pipelines", "linkedin_posts", POST]);
        assert!(args.contains(&"--json".to_string()));
        assert!(validate_args(&args).is_ok());
        assert!(!args.iter().any(|arg| arg.contains(KEY)));
    }

    #[test]
    fn rejects_non_post_urls() {
        for bad in [
            "https://www.linkedin.com/in/someone",
            "https://evil.test/posts/x",
            "--api-key=x",
            "http://www.linkedin.com/posts/x",
        ] {
            assert!(pipelines_args(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn allowlist_refuses_other_subcommands_and_key_flags() {
        let s = |items: &[&str]| items.iter().map(|i| i.to_string()).collect::<Vec<_>>();
        for bad in [
            s(&["login"]),
            s(&["browser", "open", "https://x", "--json", "--timeout", "1"]),
            s(&["scrape", "https://x", "--json", "--timeout", "1"]),
            s(&[
                "pipelines",
                "instagram_posts",
                "u",
                "--json",
                "--timeout",
                "1",
            ]),
            s(&["pipelines", "linkedin_posts", "u", "--timeout", "1"]),
            // Retired upstream (HTTP 410) and removed from the allowlist.
            s(&["discover", "q", "--json", "--timeout", "1"]),
            s(&[
                "pipelines",
                "linkedin_posts",
                "u",
                "--json",
                "--timeout",
                "1",
                "--api-key",
                "x",
            ]),
            s(&[
                "pipelines",
                "linkedin_posts",
                "u",
                "--json",
                "--timeout",
                "1",
                "--api-key=x",
            ]),
            s(&[]),
        ] {
            assert!(validate_args(&bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn child_env_is_scrubbed_and_carries_key_only_in_env() {
        let env = child_env(KEY, |name| match name {
            "PATH" => Some("/usr/bin".to_string()),
            "HOME" => Some("/home/u".to_string()),
            _ => None,
        });
        let names: Vec<&str> = env.iter().map(|(k, _)| k.as_str()).collect();
        assert_eq!(names, vec!["BRIGHTDATA_API_KEY", "HOME", "PATH"]);
        assert!(child_env(KEY, |name| (name == "AWS_SECRET_ACCESS_KEY")
            .then(|| "x".to_string()))
        .iter()
        .all(|(k, _)| k != "AWS_SECRET_ACCESS_KEY"));
    }

    #[test]
    fn version_gate_accepts_only_the_pinned_version() {
        let runner = FakeRunner::new(vec![ok(&body(include_str!("fixtures/cli_version.json")))]);
        assert!(client(&runner).check_version().is_ok());
        assert_eq!(runner.seen.lock().unwrap()[0].args, vec!["--version"]);

        let runner = FakeRunner::new(vec![ok("0.4.0\n")]);
        let error = client(&runner).check_version().unwrap_err();
        assert!(error.contains("0.3.7 is required"), "{error}");
    }

    #[test]
    fn collects_posts_with_the_key_only_in_env() {
        let runner = FakeRunner::new(vec![ok(&body(include_str!(
            "fixtures/cli_pipelines_linkedin_posts.json"
        )))]);
        let cli = client(&runner);
        assert_eq!(cli.collect_post(POST).unwrap().len(), 3);
        let seen = runner.seen.lock().unwrap();
        for request in seen.iter() {
            assert!(request
                .env
                .contains(&("BRIGHTDATA_API_KEY".to_string(), KEY.to_string())));
            assert_eq!(request.stdout_cap, STDOUT_CAP_BYTES);
            assert_eq!(request.stderr_cap, STDERR_CAP_BYTES);
        }
    }

    #[test]
    fn stderr_summary_keeps_error_message_with_status() {
        let stderr = b"- Discovering...
Error: Gone: endpoint retired
  Status: 410
";
        assert_eq!(
            sanitize_stderr(stderr, "k"),
            "Error: Gone: endpoint retired Status: 410"
        );
        assert_eq!(
            sanitize_stderr(
                b"plain failure
",
                "k"
            ),
            "plain failure"
        );
    }

    #[test]
    fn failures_are_redacted_and_fail_closed() {
        let runner = FakeRunner::new(vec![
            ProcessOutput {
                success: false,
                stderr: format!("Polling...\nError: invalid key {KEY}\n").into_bytes(),
                ..ProcessOutput::default()
            },
            ProcessOutput {
                timed_out: true,
                ..ProcessOutput::default()
            },
            ProcessOutput {
                success: true,
                stdout_overflow: true,
                ..ProcessOutput::default()
            },
            ok("Polling... not json"),
            ProcessOutput {
                cancelled: true,
                ..ProcessOutput::default()
            },
        ]);
        let cli = client(&runner);
        let error = cli.collect_post(POST).unwrap_err();
        assert!(!error.contains(KEY), "{error}");
        assert!(
            error.contains("[redacted]") || error.contains("redacted"),
            "{error}"
        );
        assert!(cli.collect_post(POST).unwrap_err().contains("timed out"));
        assert!(cli.collect_post(POST).unwrap_err().contains("more data"));
        assert!(cli
            .collect_post(POST)
            .unwrap_err()
            .contains("did not return JSON"));
        assert_eq!(cli.collect_post(POST).unwrap_err(), "Cancelled");
    }

    #[test]
    fn resolves_configured_absolute_path_or_absolute_path_entries_only() {
        let dir = tempfile::tempdir().unwrap();
        let name = cli_file_names()[0];
        let binary = dir.path().join(name);
        std::fs::write(&binary, b"").unwrap();
        assert_eq!(
            resolve_cli_binary(Some(binary.to_str().unwrap()), None).unwrap(),
            binary
        );
        assert!(resolve_cli_binary(Some(""), None).is_err());
        assert!(resolve_cli_binary(Some("brightdata"), None).is_err());
        let path_var = std::env::join_paths([PathBuf::from("."), dir.path().to_path_buf()])
            .unwrap()
            .into_string()
            .unwrap();
        assert_eq!(resolve_cli_binary(None, Some(&path_var)).unwrap(), binary);
        assert!(resolve_cli_binary(None, Some(".")).is_err());
    }

    #[test]
    fn system_runner_caps_output_and_kills_on_timeout() {
        let (program, fast, slow): (PathBuf, Vec<String>, Vec<String>) = if cfg!(windows) {
            let system_root = std::env::var("SystemRoot").unwrap();
            (
                PathBuf::from(system_root).join("System32").join("cmd.exe"),
                vec!["/C".into(), "echo 0123456789abcdef".into()],
                vec!["/C".into(), "ping -n 30 127.0.0.1 >NUL".into()],
            )
        } else {
            (
                PathBuf::from("/bin/sh"),
                vec!["-c".into(), "echo 0123456789abcdef".into()],
                vec!["-c".into(), "sleep 30".into()],
            )
        };
        let env = child_env("k", |name| std::env::var(name).ok());
        let cancel = AtomicBool::new(false);
        let output = SystemProcessRunner
            .run(
                &ProcessRequest {
                    program: program.clone(),
                    args: fast,
                    env: env.clone(),
                    timeout: Duration::from_secs(20),
                    stdout_cap: 4,
                    stderr_cap: 4,
                },
                &cancel,
            )
            .unwrap();
        assert!(output.success);
        assert_eq!(output.stdout, b"0123");
        assert!(output.stdout_overflow);

        let started = Instant::now();
        let output = SystemProcessRunner
            .run(
                &ProcessRequest {
                    program,
                    args: slow,
                    env,
                    timeout: Duration::from_millis(500),
                    stdout_cap: 1024,
                    stderr_cap: 1024,
                },
                &cancel,
            )
            .unwrap();
        assert!(output.timed_out);
        assert!(started.elapsed() < Duration::from_secs(15));
    }
}
