use tauri::AppHandle;

use super::types::TransportOutcome;
use crate::auth::{
    linkedin::refresh_linkedin_credential,
    linkedin_api::{
        publish_linkedin_member_comment, publish_linkedin_member_post, LinkedInCreateError,
    },
    publish::{
        credentials_need_refresh, ensure_linkedin_account_identity, has_linkedin_comment_scope,
        has_linkedin_publish_scope, linkedin_oauth_credentials,
        merge_refreshed_linkedin_credential,
    },
    redact_error,
    storage::AuthStorage,
    OAuthCredentials, StoredCredential,
};

/// External LinkedIn I/O, separated from reservation and settlement so the
/// execution service can be tested with a scripted fake. Implementations are
/// blocking and are always called outside any database transaction.
pub trait LinkedInTransport: Send + Sync {
    fn create_post(&self, commentary: &str) -> TransportOutcome;
    fn create_comment(&self, target_urn: &str, commentary: &str) -> TransportOutcome;
}

/// Real adapter: loads/refreshes the stored LinkedIn credential, enforces the
/// write scope, then calls the LinkedIn API. Every failure before the create
/// request is sent is a definite rejection.
pub struct LiveLinkedInTransport {
    app: AppHandle,
}

impl LiveLinkedInTransport {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }

    fn credentials(&self, scope: RequiredScope) -> Result<OAuthCredentials, String> {
        let storage = AuthStorage::new(&self.app)?;
        let mut credentials = linkedin_oauth_credentials(storage.load("linkedin")?)?;
        if credentials_need_refresh(&credentials) {
            let refreshed = refresh_linkedin_credential(credentials.clone())?;
            credentials = merge_refreshed_linkedin_credential(credentials, refreshed)?;
            storage.save(StoredCredential::OAuth(credentials.clone()))?;
        }
        match scope {
            RequiredScope::Post if !has_linkedin_publish_scope(&credentials) => {
                return Err("LinkedIn connection is missing w_member_social scope".to_string());
            }
            RequiredScope::Comment if !has_linkedin_comment_scope(&credentials) => {
                return Err(
                    "LinkedIn Community Management access with w_member_social_feed scope is required; reconnect LinkedIn after access is approved"
                        .to_string(),
                );
            }
            _ => {}
        }
        if ensure_linkedin_account_identity(&mut credentials)? {
            storage.save(StoredCredential::OAuth(credentials.clone()))?;
        }
        Ok(credentials)
    }
}

#[derive(Clone, Copy)]
enum RequiredScope {
    Post,
    Comment,
}

fn not_sent(message: String) -> TransportOutcome {
    TransportOutcome::Rejected {
        status_code: None,
        message: redact_error(message),
    }
}

pub(crate) fn outcome_from_create_error(error: LinkedInCreateError) -> TransportOutcome {
    match error {
        LinkedInCreateError::Rejected {
            status_code,
            message,
        } => TransportOutcome::Rejected {
            status_code,
            message: redact_error(message),
        },
        LinkedInCreateError::Ambiguous {
            status_code,
            message,
        } => TransportOutcome::Ambiguous {
            status_code,
            message: redact_error(message),
        },
    }
}

impl LinkedInTransport for LiveLinkedInTransport {
    fn create_post(&self, commentary: &str) -> TransportOutcome {
        let credentials = match self.credentials(RequiredScope::Post) {
            Ok(credentials) => credentials,
            Err(error) => return not_sent(error),
        };
        let account_id = credentials.account_id.clone().unwrap_or_default();
        match publish_linkedin_member_post(&credentials.access_token, &account_id, commentary) {
            Ok(result) => TransportOutcome::Created {
                urn: result.platform_post_id.clone(),
                platform_id: result.platform_post_id,
                url: result.external_post_url,
            },
            Err(error) => outcome_from_create_error(error),
        }
    }

    fn create_comment(&self, target_urn: &str, commentary: &str) -> TransportOutcome {
        let credentials = match self.credentials(RequiredScope::Comment) {
            Ok(credentials) => credentials,
            Err(error) => return not_sent(error),
        };
        let account_id = credentials.account_id.clone().unwrap_or_default();
        match publish_linkedin_member_comment(
            &credentials.access_token,
            &account_id,
            target_urn,
            commentary,
        ) {
            Ok(result) => TransportOutcome::Created {
                platform_id: result.platform_comment_id,
                urn: result.platform_comment_urn,
                url: result.external_comment_url,
            },
            Err(error) => outcome_from_create_error(error),
        }
    }
}
