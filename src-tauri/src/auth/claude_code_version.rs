//! Port of gg-core `claude-code-version.ts` (`getClaudeCodeVersion` /
//! `getClaudeCliUserAgent`).
//!
//! Anthropic's OAuth edge rejects requests whose `claude-cli` User-Agent
//! version lags too far behind the current Claude Code release, so the
//! version is resolved from the npm registry instead of being hardcoded:
//! memory cache → fresh (24h) disk cache → npm → stale disk cache → fallback.
//! A failed lookup is cached in memory for only 5 minutes so npm is retried
//! soon without being hammered.
//!
//! Also ports `noteRequiredClaudeCodeVersion`: Anthropic gates brand-new
//! models on a minimum client version and says so in the 400 body, e.g.
//! "Claude Code 2.1.278 does not support this model; version 2.1.280 or newer
//! is required." Without this the 24h cache could pin a too-old version for a
//! whole day, so the caller adopts the demanded floor and retries once.

use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use regex::Regex;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::net::transport::{provider_http_client, read_bounded_json, TransportPolicy};

pub const NPM_LATEST_URL: &str = "https://registry.npmjs.org/@anthropic-ai/claude-code/latest";
const CACHE_TTL_MS: i64 = 24 * 60 * 60 * 1000;
const FAILED_LOOKUP_TTL_MS: i64 = 5 * 60 * 1000;
const FETCH_TIMEOUT: Duration = Duration::from_secs(3);
/// Last known good version, used only when npm is unreachable and no disk
/// cache exists. Keep in step with gg-core's `FALLBACK_VERSION`.
pub const FALLBACK_VERSION: &str = "2.1.280";
const CACHE_FILE_NAME: &str = "claude-code-version.json";
/// The npm "latest" manifest is a few KB; anything larger is not trusted.
const NPM_MAX_RESPONSE_BYTES: u64 = 256 * 1024;

/// Same on-disk shape as gg-core: `{ "version": "...", "fetchedAt": <ms> }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedVersion {
    version: String,
    fetched_at: i64,
}

#[derive(Debug, Clone)]
struct MemoryEntry {
    version: String,
    expires_at: i64,
}

/// Tauri managed state: the process-lifetime memory cache. The lock is held
/// across resolution, which also collapses concurrent lookups into one (gg's
/// `inflight` promise).
#[derive(Debug, Default)]
pub struct ClaudeCodeVersionCache {
    memory: Mutex<Option<MemoryEntry>>,
}

/// gg-core only checks `/^\d/`; the value also becomes an HTTP header, so
/// anything beyond a plain semver-ish token is rejected.
fn is_plausible_version(value: &str) -> bool {
    value.len() <= 64
        && value.starts_with(|c: char| c.is_ascii_digit())
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+'))
}

/// gg-core `REQUIRED_VERSION_RE`, with ASCII digits only since the value
/// becomes an HTTP header.
fn required_version_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)version\s+([0-9]+(?:\.[0-9]+)+)\s+or\s+newer\s+is\s+required")
            .expect("valid required-version regex")
    })
}

/// Extracts the minimum client version Anthropic demands, if the error says so
/// (gg-core `parseRequiredClaudeCodeVersion`).
pub fn parse_required_version(message: &str) -> Option<String> {
    required_version_re()
        .captures(message)
        .and_then(|captures| captures.get(1))
        .map(|version| version.as_str().to_string())
        .filter(|version| is_plausible_version(version))
}

/// gg-core `Number.parseInt(segment, 10) || 0`: leading digits, else 0.
fn version_segment(segment: &str) -> u64 {
    let digits: String = segment.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse().unwrap_or(0)
}

/// Numeric-segment comparison (gg-core `compareVersions`); missing segments
/// count as 0. `Greater` means `a` is newer than `b`.
fn compare_versions(a: &str, b: &str) -> Ordering {
    let pa: Vec<u64> = a.split('.').map(version_segment).collect();
    let pb: Vec<u64> = b.split('.').map(version_segment).collect();
    for index in 0..pa.len().max(pb.len()) {
        let left = pa.get(index).copied().unwrap_or(0);
        let right = pb.get(index).copied().unwrap_or(0);
        match left.cmp(&right) {
            Ordering::Equal => continue,
            other => return other,
        }
    }
    Ordering::Equal
}

fn read_disk_cache(path: &Path) -> Option<CachedVersion> {
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str::<CachedVersion>(&raw)
        .ok()
        .filter(|cached| is_plausible_version(&cached.version))
}

/// Best effort, like gg-core: a failed write only costs a refetch later.
fn write_disk_cache(path: &Path, cached: &CachedVersion) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string(cached) {
        let _ = fs::write(path, json);
    }
}

impl ClaudeCodeVersionCache {
    /// Resolves the Claude Code version. `cache_path` is `None` when the app
    /// data directory is unavailable; `fetch_latest` is only called on a
    /// memory and fresh-disk miss.
    pub fn resolve(
        &self,
        cache_path: Option<&Path>,
        now_ms: i64,
        fetch_latest: impl FnOnce() -> Option<String>,
    ) -> String {
        let mut memory = self
            .memory
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(entry) = memory.as_ref().filter(|entry| now_ms < entry.expires_at) {
            return entry.version.clone();
        }

        let disk = cache_path.and_then(read_disk_cache);
        if let Some(cached) = disk
            .as_ref()
            .filter(|cached| now_ms - cached.fetched_at < CACHE_TTL_MS)
        {
            *memory = Some(MemoryEntry {
                version: cached.version.clone(),
                expires_at: now_ms + CACHE_TTL_MS,
            });
            return cached.version.clone();
        }

        if let Some(fetched) = fetch_latest().filter(|version| is_plausible_version(version)) {
            if let Some(path) = cache_path {
                write_disk_cache(
                    path,
                    &CachedVersion {
                        version: fetched.clone(),
                        fetched_at: now_ms,
                    },
                );
            }
            *memory = Some(MemoryEntry {
                version: fetched.clone(),
                expires_at: now_ms + CACHE_TTL_MS,
            });
            return fetched;
        }

        // npm unreachable: prefer the stale disk cache over the fallback, and
        // retry npm after a short TTL.
        let resolved = disk
            .map(|cached| cached.version)
            .unwrap_or_else(|| FALLBACK_VERSION.to_string());
        *memory = Some(MemoryEntry {
            version: resolved.clone(),
            expires_at: now_ms + FAILED_LOOKUP_TTL_MS,
        });
        resolved
    }

    /// Port of gg-core `noteRequiredClaudeCodeVersion`: adopts the minimum
    /// version demanded by an Anthropic error, bypassing the 24h cache.
    /// Returns true when the version was raised, meaning the caller should
    /// rebuild the User-Agent and retry once.
    pub fn note_required(
        &self,
        cache_path: Option<&Path>,
        now_ms: i64,
        message: &str,
        fetch_latest: impl FnOnce() -> Option<String>,
    ) -> bool {
        let Some(required) = parse_required_version(message) else {
            return false;
        };
        let mut memory = self
            .memory
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        // Prefer whatever npm says now (it may already be past `required`);
        // fall back to the demanded version when the registry is unreachable.
        let target = fetch_latest()
            .filter(|latest| is_plausible_version(latest))
            .filter(|latest| compare_versions(latest, &required) == Ordering::Greater)
            .unwrap_or(required);

        let current = memory
            .as_ref()
            .map(|entry| entry.version.clone())
            .or_else(|| {
                cache_path
                    .and_then(read_disk_cache)
                    .map(|cached| cached.version)
            });
        if current
            .as_deref()
            .is_some_and(|current| compare_versions(&target, current) != Ordering::Greater)
        {
            return false;
        }

        if let Some(path) = cache_path {
            write_disk_cache(
                path,
                &CachedVersion {
                    version: target.clone(),
                    fetched_at: now_ms,
                },
            );
        }
        *memory = Some(MemoryEntry {
            version: target,
            expires_at: now_ms + CACHE_TTL_MS,
        });
        true
    }
}

/// `GET` the npm "latest" manifest with gg-core's 3 s timeout; any failure is
/// `None`.
pub fn fetch_latest_from_npm(client: &Client, url: &str) -> Option<String> {
    let response = client.get(url).timeout(FETCH_TIMEOUT).send().ok()?;
    if !response.status().is_success() {
        return None;
    }
    #[derive(Deserialize)]
    struct Manifest {
        version: Option<String>,
    }
    read_bounded_json::<Manifest>(response, NPM_MAX_RESPONSE_BYTES)
        .ok()?
        .version
        .filter(|version| is_plausible_version(version))
}

/// Same format as gg-core `getClaudeCliUserAgent`.
pub fn user_agent_for(version: &str) -> String {
    format!("claude-cli/{version} (external, cli)")
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

fn cache_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join(CACHE_FILE_NAME))
}

/// The User-Agent Anthropic's OAuth and inference edges expect, resolved with
/// the app's managed cache, app-data disk cache and the public npm registry.
pub fn claude_cli_user_agent(app: &AppHandle) -> String {
    let cache = app.state::<ClaudeCodeVersionCache>();
    let version = cache.resolve(cache_path(app).as_deref(), now_ms(), || {
        let client = provider_http_client(TransportPolicy::PUBLIC_HTTPS).ok()?;
        fetch_latest_from_npm(&client, NPM_LATEST_URL)
    });
    user_agent_for(&version)
}

/// Adopts a minimum Claude Code version demanded by an Anthropic error using
/// the app's managed cache; true means rebuild the User-Agent and retry once.
pub fn note_required_claude_code_version(app: &AppHandle, message: &str) -> bool {
    let cache = app.state::<ClaudeCodeVersionCache>();
    cache.note_required(cache_path(app).as_deref(), now_ms(), message, || {
        let client = provider_http_client(TransportPolicy::PUBLIC_HTTPS).ok()?;
        fetch_latest_from_npm(&client, NPM_LATEST_URL)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::ai_oauth::test_support::{local_client, spawn_fake_server};
    use std::cell::Cell;

    const NOW: i64 = 1_800_000_000_000;

    fn temp_cache_path(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "linkgo-claude-version-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        dir.join(CACHE_FILE_NAME)
    }

    fn seed(path: &Path, version: &str, fetched_at: i64) {
        write_disk_cache(
            path,
            &CachedVersion {
                version: version.to_string(),
                fetched_at,
            },
        );
    }

    #[test]
    fn falls_back_to_hardcoded_version_when_npm_and_disk_are_unavailable() {
        let path = temp_cache_path("fallback");
        let cache = ClaudeCodeVersionCache::default();
        let fetches = Cell::new(0);

        let version = cache.resolve(Some(&path), NOW, || {
            fetches.set(fetches.get() + 1);
            None
        });
        assert_eq!(version, FALLBACK_VERSION);
        assert_eq!(
            user_agent_for(&version),
            "claude-cli/2.1.280 (external, cli)"
        );
        // The fallback is not persisted, so a later run still asks npm.
        assert!(!path.exists());

        // Short TTL: served from memory for 5 minutes, then npm is retried.
        cache.resolve(Some(&path), NOW + FAILED_LOOKUP_TTL_MS - 1, || {
            fetches.set(fetches.get() + 1);
            None
        });
        assert_eq!(fetches.get(), 1);
        let retried = cache.resolve(Some(&path), NOW + FAILED_LOOKUP_TTL_MS, || {
            fetches.set(fetches.get() + 1);
            Some("2.1.283".to_string())
        });
        assert_eq!((retried.as_str(), fetches.get()), ("2.1.283", 2));
    }

    #[test]
    fn prefers_stale_disk_cache_over_fallback_when_npm_fails() {
        let path = temp_cache_path("stale");
        seed(&path, "2.1.270", NOW - CACHE_TTL_MS - 1);
        let version = ClaudeCodeVersionCache::default().resolve(Some(&path), NOW, || None);
        assert_eq!(version, "2.1.270");
    }

    #[test]
    fn fresh_disk_cache_skips_npm_and_npm_result_is_persisted() {
        let fresh = temp_cache_path("fresh");
        seed(&fresh, "2.1.281", NOW - CACHE_TTL_MS + 1);
        let version = ClaudeCodeVersionCache::default().resolve(Some(&fresh), NOW, || {
            panic!("npm must not be queried while the disk cache is fresh")
        });
        assert_eq!(version, "2.1.281");

        let empty = temp_cache_path("persist");
        let cache = ClaudeCodeVersionCache::default();
        let version = cache.resolve(Some(&empty), NOW, || Some("2.1.283".to_string()));
        assert_eq!(version, "2.1.283");
        let saved = read_disk_cache(&empty).expect("persisted");
        assert_eq!((saved.version.as_str(), saved.fetched_at), ("2.1.283", NOW));
        // 24h memory cache.
        let cached = cache.resolve(Some(&empty), NOW + CACHE_TTL_MS - 1, || {
            panic!("npm must not be queried while the memory cache is fresh")
        });
        assert_eq!(cached, "2.1.283");
    }

    #[test]
    fn rejects_values_that_are_not_version_tokens() {
        for bad in ["", "latest", "v2.1.0", "2.1.0\r\nX-Evil: 1", "2.1.0 (x)"] {
            assert!(!is_plausible_version(bad), "{bad:?}");
        }
        let version = ClaudeCodeVersionCache::default()
            .resolve(None, NOW, || Some("2.1.0\r\nX-Evil: 1".to_string()));
        assert_eq!(version, FALLBACK_VERSION);
    }

    const REQUIRED_MESSAGE: &str = "Claude Code 2.1.278 does not support this model; version 2.1.280 or newer is required. (HTTP 400)";

    #[test]
    fn parses_required_version_from_anthropic_errors() {
        assert_eq!(
            parse_required_version(REQUIRED_MESSAGE).as_deref(),
            Some("2.1.280")
        );
        assert_eq!(
            parse_required_version("VERSION  3.0 OR NEWER IS REQUIRED").as_deref(),
            Some("3.0")
        );
        for unrelated in [
            "Overloaded (HTTP 529)",
            "invalid x-api-key (HTTP 401)",
            "version 2 or newer is required",
            "",
        ] {
            assert_eq!(parse_required_version(unrelated), None, "{unrelated:?}");
        }
    }

    #[test]
    fn compares_versions_by_numeric_segments() {
        assert_eq!(compare_versions("2.1.280", "2.1.28"), Ordering::Greater);
        assert_eq!(compare_versions("2.1.9", "2.1.10"), Ordering::Less);
        assert_eq!(compare_versions("2.1", "2.1.0"), Ordering::Equal);
        assert_eq!(compare_versions("2.1.280-beta", "2.1.280"), Ordering::Equal);
    }

    #[test]
    fn note_required_raises_version_when_required_is_newer() {
        let path = temp_cache_path("note-raise");
        seed(&path, "2.1.278", NOW - 1);
        let cache = ClaudeCodeVersionCache::default();
        assert_eq!(cache.resolve(Some(&path), NOW, || None), "2.1.278");

        assert!(cache.note_required(Some(&path), NOW, REQUIRED_MESSAGE, || None));
        let saved = read_disk_cache(&path).expect("persisted");
        assert_eq!((saved.version.as_str(), saved.fetched_at), ("2.1.280", NOW));
        let resolved = cache.resolve(Some(&path), NOW + CACHE_TTL_MS - 1, || {
            panic!("npm must not be queried while the raised version is fresh")
        });
        assert_eq!(resolved, "2.1.280");
    }

    #[test]
    fn note_required_is_a_no_op_when_current_is_equal_or_newer() {
        for current in ["2.1.280", "2.1.281"] {
            let path = temp_cache_path(&format!("note-noop-{current}"));
            seed(&path, current, NOW - 1);
            let cache = ClaudeCodeVersionCache::default();
            assert!(!cache.note_required(Some(&path), NOW, REQUIRED_MESSAGE, || None));
            assert_eq!(read_disk_cache(&path).expect("kept").version, current);
        }
        // Unrelated errors never touch npm.
        assert!(!ClaudeCodeVersionCache::default().note_required(
            None,
            NOW,
            "Overloaded (HTTP 529)",
            || panic!("npm must not be queried for unrelated errors"),
        ));
    }

    #[test]
    fn note_required_prefers_npm_latest_when_newer_than_required() {
        let path = temp_cache_path("note-latest");
        seed(&path, "2.1.278", NOW - 1);
        let cache = ClaudeCodeVersionCache::default();
        assert!(cache.note_required(Some(&path), NOW, REQUIRED_MESSAGE, || {
            Some("2.1.283".to_string())
        }));
        assert_eq!(cache.resolve(Some(&path), NOW, || None), "2.1.283");

        // An older npm answer never lowers the demanded floor.
        let older = temp_cache_path("note-older-latest");
        seed(&older, "2.1.278", NOW - 1);
        let cache = ClaudeCodeVersionCache::default();
        assert!(
            cache.note_required(Some(&older), NOW, REQUIRED_MESSAGE, || {
                Some("2.1.279".to_string())
            })
        );
        assert_eq!(cache.resolve(Some(&older), NOW, || None), "2.1.280");
    }

    #[test]
    fn fetches_version_from_npm_manifest_and_tolerates_failures() {
        let ok = spawn_fake_server(
            vec![(
                200,
                r#"{"name":"@anthropic-ai/claude-code","version":"2.1.283"}"#.to_string(),
            )],
            Duration::ZERO,
        );
        assert_eq!(
            fetch_latest_from_npm(&local_client(), &ok.url).as_deref(),
            Some("2.1.283")
        );
        assert!(ok.request(0).starts_with("GET "));

        let failing = spawn_fake_server(vec![(503, "unavailable".to_string())], Duration::ZERO);
        assert_eq!(fetch_latest_from_npm(&local_client(), &failing.url), None);
        let garbage = spawn_fake_server(vec![(200, "not json".to_string())], Duration::ZERO);
        assert_eq!(fetch_latest_from_npm(&local_client(), &garbage.url), None);
    }
}
