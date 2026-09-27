use std::{
    collections::BTreeMap,
    env, fs,
    path::{Path, PathBuf},
};

use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::{providers::auth_providers, redact_error, SafeCredentialStatus, StoredCredential};

const KEYRING_SERVICE_NAME: &str = "linkgo";
/// Production bundle identifier. Only this identity uses the historical,
/// unscoped keyring service so existing credentials keep working.
const PRODUCTION_IDENTIFIER: &str = "com.linkgo.app";
const CREDENTIAL_FILE_NAME: &str = "linkgo-credentials.json";
const FILE_FALLBACK_ENV: &str = "LINKGO_CREDENTIAL_FILE_FALLBACK";

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CredentialFile {
    credentials: BTreeMap<String, StoredCredential>,
}

fn file_fallback_enabled() -> bool {
    matches!(
        env::var(FILE_FALLBACK_ENV)
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase()
            .as_str(),
        "1" | "true" | "yes"
    )
}

fn credentials_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(redact_error)?;
    fs::create_dir_all(&app_data_dir).map_err(redact_error)?;
    Ok(app_data_dir.join(CREDENTIAL_FILE_NAME))
}

fn load_file(path: &Path) -> Result<CredentialFile, String> {
    if !path.exists() {
        return Ok(CredentialFile::default());
    }
    let text = fs::read_to_string(path).map_err(redact_error)?;
    if text.trim().is_empty() {
        return Ok(CredentialFile::default());
    }
    serde_json::from_str(&text).map_err(redact_error)
}

fn set_private_file_permissions(_path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let permissions = fs::Permissions::from_mode(0o600);
        fs::set_permissions(_path, permissions).map_err(redact_error)?;
    }
    Ok(())
}

fn save_file(path: &Path, file: &CredentialFile) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Credential path is missing parent directory".to_string())?;
    fs::create_dir_all(parent).map_err(redact_error)?;
    let temp_path = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(file).map_err(redact_error)?;
    fs::write(&temp_path, text).map_err(redact_error)?;
    set_private_file_permissions(&temp_path)?;
    fs::rename(&temp_path, path).map_err(redact_error)?;
    set_private_file_permissions(path)?;
    Ok(())
}

/// Keyring service for an app identifier. Non-production identities (dev,
/// release-candidate test builds) get their own namespace so they can never
/// read, overwrite or delete production credentials.
fn keyring_service_name(identifier: &str) -> String {
    if identifier == PRODUCTION_IDENTIFIER {
        KEYRING_SERVICE_NAME.to_string()
    } else {
        format!("{KEYRING_SERVICE_NAME}:{identifier}")
    }
}

/// Windows Credential Manager caps each blob at 2560 bytes and the keyring
/// crate may store UTF-16, so values are split into chunks of at most this many
/// characters (2 × 1000 bytes stays under the cap). OAuth JWTs plus refresh
/// tokens routinely exceed a single entry.
const KEYRING_CHUNK_CHARS: usize = 1000;
/// Upper bound on chunk entries read back, so a corrupt marker cannot trigger
/// unbounded keyring lookups.
const KEYRING_MAX_CHUNKS: usize = 64;

/// Primary-entry marker written when a credential is split across entries
/// `<key>#1..n`. Single-entry credentials saved by older builds are plain
/// `StoredCredential` JSON and still read unchanged.
#[derive(Debug, Serialize, Deserialize)]
struct ChunkMarker {
    #[serde(rename = "linkgoChunkedV1")]
    chunks: usize,
}

/// Minimal secret-store surface so chunking is testable without the OS store.
trait SecretBackend {
    fn get(&self, key: &str) -> Result<Option<String>, String>;
    fn set(&self, key: &str, value: &str) -> Result<(), String>;
    fn delete(&self, key: &str) -> Result<bool, String>;
}

struct KeyringBackend<'a> {
    service: &'a str,
}

impl SecretBackend for KeyringBackend<'_> {
    fn get(&self, key: &str) -> Result<Option<String>, String> {
        match provider_entry(self.service, key)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(error) => Err(redact_error(error)),
        }
    }

    fn set(&self, key: &str, value: &str) -> Result<(), String> {
        provider_entry(self.service, key)?
            .set_password(value)
            .map_err(redact_error)
    }

    fn delete(&self, key: &str) -> Result<bool, String> {
        match provider_entry(self.service, key)?.delete_credential() {
            Ok(()) => Ok(true),
            Err(KeyringError::NoEntry) => Ok(false),
            Err(error) => Err(redact_error(error)),
        }
    }
}

fn chunk_key(key: &str, index: usize) -> String {
    format!("{key}#{index}")
}

fn existing_chunk_count(backend: &dyn SecretBackend, key: &str) -> usize {
    backend
        .get(key)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_str::<ChunkMarker>(&value).ok())
        .map(|marker| marker.chunks.min(KEYRING_MAX_CHUNKS))
        .unwrap_or(0)
}

fn read_chunked(backend: &dyn SecretBackend, key: &str) -> Result<Option<String>, String> {
    let Some(primary) = backend.get(key)? else {
        return Ok(None);
    };
    let Ok(marker) = serde_json::from_str::<ChunkMarker>(&primary) else {
        return Ok(Some(primary));
    };
    if marker.chunks == 0 || marker.chunks > KEYRING_MAX_CHUNKS {
        return Err("Stored credential is corrupt; reconnect the provider".to_string());
    }
    let mut value = String::new();
    for index in 1..=marker.chunks {
        let chunk = backend
            .get(&chunk_key(key, index))?
            .ok_or_else(|| "Stored credential is incomplete; reconnect the provider".to_string())?;
        value.push_str(&chunk);
    }
    Ok(Some(value))
}

fn write_chunked(backend: &dyn SecretBackend, key: &str, value: &str) -> Result<(), String> {
    let previous_chunks = existing_chunk_count(backend, key);
    let chars: Vec<char> = value.chars().collect();
    let new_chunks = if chars.len() <= KEYRING_CHUNK_CHARS {
        backend.set(key, value)?;
        0
    } else {
        let pieces: Vec<String> = chars
            .chunks(KEYRING_CHUNK_CHARS)
            .map(|piece| piece.iter().collect())
            .collect();
        if pieces.len() > KEYRING_MAX_CHUNKS {
            return Err("Credential is too large to store".to_string());
        }
        for (index, piece) in pieces.iter().enumerate() {
            backend.set(&chunk_key(key, index + 1), piece)?;
        }
        let marker = serde_json::to_string(&ChunkMarker {
            chunks: pieces.len(),
        })
        .map_err(redact_error)?;
        backend.set(key, &marker)?;
        pieces.len()
    };
    for index in (new_chunks + 1)..=previous_chunks {
        backend.delete(&chunk_key(key, index))?;
    }
    Ok(())
}

fn delete_chunked(backend: &dyn SecretBackend, key: &str) -> Result<bool, String> {
    let chunks = existing_chunk_count(backend, key);
    for index in 1..=chunks {
        backend.delete(&chunk_key(key, index))?;
    }
    backend.delete(key)
}

fn provider_entry(service: &str, provider_key: &str) -> Result<Entry, String> {
    Entry::new(service, provider_key).map_err(redact_error)
}

fn read_keyring(service: &str, provider_key: &str) -> Result<Option<StoredCredential>, String> {
    match read_chunked(&KeyringBackend { service }, provider_key)? {
        Some(secret) => serde_json::from_str(&secret)
            .map(Some)
            .map_err(redact_error),
        None => Ok(None),
    }
}

fn write_keyring(service: &str, credential: &StoredCredential) -> Result<(), String> {
    let secret = serde_json::to_string(credential).map_err(redact_error)?;
    write_chunked(
        &KeyringBackend { service },
        credential.provider_key(),
        &secret,
    )
}

fn delete_keyring(service: &str, provider_key: &str) -> Result<bool, String> {
    delete_chunked(&KeyringBackend { service }, provider_key)
}

fn normalize_legacy_google_credential(mut credential: StoredCredential) -> StoredCredential {
    match &mut credential {
        StoredCredential::OAuth(credentials) if credentials.provider_key == "google" => {
            credentials.provider_key = "gemini".to_string();
        }
        StoredCredential::ApiKey(credentials) if credentials.provider_key == "google" => {
            credentials.provider_key = "gemini".to_string();
        }
        _ => {}
    }
    credential
}

#[derive(Debug, Clone)]
pub struct AuthStorage {
    fallback_path: PathBuf,
    service: String,
}

impl AuthStorage {
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        Ok(Self {
            fallback_path: credentials_path(app)?,
            service: keyring_service_name(&app.config().identifier),
        })
    }

    pub fn list_statuses(&self) -> Result<Vec<SafeCredentialStatus>, String> {
        let mut statuses = Vec::new();
        for provider in auth_providers() {
            if let Some(credential) = self.load(provider.key)? {
                statuses.push(credential.safe_status());
            }
        }

        if file_fallback_enabled() {
            let fallback = load_file(&self.fallback_path)?;
            for credential in fallback.credentials.values() {
                let credential = normalize_legacy_google_credential(credential.clone());
                if !statuses
                    .iter()
                    .any(|status| status.provider_key == credential.provider_key())
                {
                    statuses.push(credential.safe_status());
                }
            }
        }

        Ok(statuses)
    }

    pub fn load(&self, provider_key: &str) -> Result<Option<StoredCredential>, String> {
        match read_keyring(&self.service, provider_key) {
            Ok(Some(credential)) => {
                return Ok(Some(normalize_legacy_google_credential(credential)))
            }
            Ok(None) => {}
            Err(_error) if file_fallback_enabled() => {}
            Err(error) => return Err(error),
        };

        if provider_key == "gemini" {
            match read_keyring(&self.service, "google") {
                Ok(Some(credential)) => {
                    return Ok(Some(normalize_legacy_google_credential(credential)))
                }
                Ok(None) => {}
                Err(_error) if file_fallback_enabled() => {}
                Err(error) => return Err(error),
            }
        }

        if file_fallback_enabled() {
            let file = load_file(&self.fallback_path)?;
            if let Some(credential) = file.credentials.get(provider_key).cloned() {
                return Ok(Some(normalize_legacy_google_credential(credential)));
            }
            if provider_key == "gemini" {
                return Ok(file
                    .credentials
                    .get("google")
                    .cloned()
                    .map(normalize_legacy_google_credential));
            }
        }
        Ok(None)
    }

    pub fn save(&self, credential: StoredCredential) -> Result<(), String> {
        match write_keyring(&self.service, &credential) {
            Ok(()) => Ok(()),
            Err(_error) if file_fallback_enabled() => {
                let mut file = load_file(&self.fallback_path)?;
                file.credentials
                    .insert(credential.provider_key().to_string(), credential);
                save_file(&self.fallback_path, &file)
            }
            Err(error) => Err(error),
        }
    }

    pub fn clear(&self, provider_key: &str) -> Result<bool, String> {
        let keyring_removed = match delete_keyring(&self.service, provider_key) {
            Ok(removed) => removed,
            Err(_error) if file_fallback_enabled() => false,
            Err(error) => return Err(error),
        };
        let legacy_keyring_removed = if provider_key == "gemini" {
            delete_keyring(&self.service, "google").unwrap_or(false)
        } else {
            false
        };
        if file_fallback_enabled() {
            let mut file = load_file(&self.fallback_path)?;
            let mut file_removed = file.credentials.remove(provider_key).is_some();
            if provider_key == "gemini" {
                file_removed = file.credentials.remove("google").is_some() || file_removed;
            }
            save_file(&self.fallback_path, &file)?;
            return Ok(keyring_removed || legacy_keyring_removed || file_removed);
        }
        Ok(keyring_removed || legacy_keyring_removed)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        delete_chunked, file_fallback_enabled, keyring_service_name, read_chunked, write_chunked,
        SecretBackend, CREDENTIAL_FILE_NAME, FILE_FALLBACK_ENV, KEYRING_SERVICE_NAME,
    };
    use std::{cell::RefCell, collections::BTreeMap};

    /// In-memory stand-in for the OS store that enforces the Windows 2560-byte
    /// UTF-16 blob cap, so an unchunked large write fails like it would there.
    #[derive(Default)]
    struct MemoryBackend {
        entries: RefCell<BTreeMap<String, String>>,
    }

    impl SecretBackend for MemoryBackend {
        fn get(&self, key: &str) -> Result<Option<String>, String> {
            Ok(self.entries.borrow().get(key).cloned())
        }
        fn set(&self, key: &str, value: &str) -> Result<(), String> {
            if value.encode_utf16().count() * 2 > 2560 {
                return Err("blob too long".to_string());
            }
            self.entries
                .borrow_mut()
                .insert(key.to_string(), value.to_string());
            Ok(())
        }
        fn delete(&self, key: &str) -> Result<bool, String> {
            Ok(self.entries.borrow_mut().remove(key).is_some())
        }
    }

    #[test]
    fn chunked_round_trip_over_windows_blob_limit() {
        let backend = MemoryBackend::default();
        let large = "x".repeat(5_000);
        assert!(large.len() > 2560);
        write_chunked(&backend, "openai", &large).expect("write");
        assert_eq!(backend.entries.borrow().len(), 6); // marker + 5 chunks
        assert_eq!(
            read_chunked(&backend, "openai").expect("read").as_deref(),
            Some(large.as_str())
        );

        // Shrinking back to one entry removes stale chunks.
        write_chunked(&backend, "openai", "small").expect("rewrite");
        assert_eq!(backend.entries.borrow().len(), 1);
        assert_eq!(
            read_chunked(&backend, "openai").expect("read").as_deref(),
            Some("small")
        );

        write_chunked(&backend, "openai", &large).expect("write again");
        assert!(delete_chunked(&backend, "openai").expect("delete"));
        assert!(backend.entries.borrow().is_empty());
        assert_eq!(read_chunked(&backend, "openai").expect("read"), None);
    }

    #[test]
    fn legacy_single_entry_value_reads_unchanged() {
        let backend = MemoryBackend::default();
        let legacy = r#"{"kind":"api_key","apiKey":"k","providerKey":"openai"}"#;
        backend.set("openai", legacy).expect("seed");
        assert_eq!(
            read_chunked(&backend, "openai").expect("read").as_deref(),
            Some(legacy)
        );
    }

    #[test]
    fn missing_chunk_is_reported_without_secret_content() {
        let backend = MemoryBackend::default();
        write_chunked(&backend, "anthropic", &"s".repeat(2_500)).expect("write");
        backend.delete("anthropic#2").expect("drop chunk");
        let error = read_chunked(&backend, "anthropic").expect_err("incomplete");
        assert!(error.contains("reconnect"));
        assert!(!error.contains("sss"));
    }

    #[test]
    fn credential_file_fallback_requires_explicit_gate() {
        std::env::remove_var(FILE_FALLBACK_ENV);
        assert!(!file_fallback_enabled());
        std::env::set_var(FILE_FALLBACK_ENV, "true");
        assert!(file_fallback_enabled());
        std::env::remove_var(FILE_FALLBACK_ENV);
    }

    #[test]
    fn keyring_service_is_stable_and_file_name_is_legacy_fallback_only() {
        assert_eq!(KEYRING_SERVICE_NAME, "linkgo");
        assert_eq!(CREDENTIAL_FILE_NAME, "linkgo-credentials.json");
    }

    #[test]
    fn production_identifier_keeps_legacy_keyring_service() {
        assert_eq!(keyring_service_name("com.linkgo.app"), "linkgo");
    }

    #[test]
    fn non_production_identifiers_use_scoped_keyring_service() {
        assert_eq!(
            keyring_service_name("com.linkgo.app.rctest"),
            "linkgo:com.linkgo.app.rctest"
        );
        assert_eq!(
            keyring_service_name("com.example.other"),
            "linkgo:com.example.other"
        );
        assert_ne!(
            keyring_service_name("com.linkgo.app.rctest"),
            KEYRING_SERVICE_NAME
        );
    }
}
