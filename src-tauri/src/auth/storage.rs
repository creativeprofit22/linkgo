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

fn provider_entry(provider_key: &str) -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE_NAME, provider_key).map_err(redact_error)
}

fn read_keyring(provider_key: &str) -> Result<Option<StoredCredential>, String> {
    match provider_entry(provider_key)?.get_password() {
        Ok(secret) => serde_json::from_str(&secret)
            .map(Some)
            .map_err(redact_error),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(redact_error(error)),
    }
}

fn write_keyring(credential: &StoredCredential) -> Result<(), String> {
    let secret = serde_json::to_string(credential).map_err(redact_error)?;
    provider_entry(credential.provider_key())?
        .set_password(&secret)
        .map_err(redact_error)
}

fn delete_keyring(provider_key: &str) -> Result<bool, String> {
    match provider_entry(provider_key)?.delete_credential() {
        Ok(()) => Ok(true),
        Err(KeyringError::NoEntry) => Ok(false),
        Err(error) => Err(redact_error(error)),
    }
}

#[derive(Debug, Clone)]
pub struct AuthStorage {
    fallback_path: PathBuf,
}

impl AuthStorage {
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        Ok(Self {
            fallback_path: credentials_path(app)?,
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
        match read_keyring(provider_key) {
            Ok(Some(credential)) => Ok(Some(credential)),
            Ok(None) if file_fallback_enabled() => {
                let file = load_file(&self.fallback_path)?;
                Ok(file.credentials.get(provider_key).cloned())
            }
            Ok(None) => Ok(None),
            Err(_error) if file_fallback_enabled() => {
                let file = load_file(&self.fallback_path)?;
                Ok(file.credentials.get(provider_key).cloned())
            }
            Err(error) => Err(error),
        }
    }

    pub fn save(&self, credential: StoredCredential) -> Result<(), String> {
        match write_keyring(&credential) {
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
        let keyring_removed = match delete_keyring(provider_key) {
            Ok(removed) => removed,
            Err(_error) if file_fallback_enabled() => false,
            Err(error) => return Err(error),
        };
        if file_fallback_enabled() {
            let mut file = load_file(&self.fallback_path)?;
            let file_removed = file.credentials.remove(provider_key).is_some();
            save_file(&self.fallback_path, &file)?;
            return Ok(keyring_removed || file_removed);
        }
        Ok(keyring_removed)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        file_fallback_enabled, CREDENTIAL_FILE_NAME, FILE_FALLBACK_ENV, KEYRING_SERVICE_NAME,
    };

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
}
