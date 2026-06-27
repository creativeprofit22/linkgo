use serde::{Deserialize, Serialize};

use super::AuthMethod;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthProvider {
    pub key: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    pub methods: Vec<AuthMethod>,
    pub default_method: AuthMethod,
    pub scopes: Vec<&'static str>,
    pub models: Vec<&'static str>,
    pub secret_label: &'static str,
    pub docs_url: &'static str,
}

pub fn auth_providers() -> Vec<AuthProvider> {
    vec![
        AuthProvider {
            key: "openai",
            label: "OpenAI",
            description: "API-key storage for future native OpenAI-backed agent execution.",
            methods: vec![AuthMethod::ApiKey],
            default_method: AuthMethod::ApiKey,
            scopes: vec![],
            models: vec!["gpt-4.1-mini", "gpt-4.1"],
            secret_label: "OpenAI API key",
            docs_url: "https://platform.openai.com/docs",
        },
        AuthProvider {
            key: "anthropic",
            label: "Anthropic",
            description: "API-key storage for future native Claude-backed agent execution.",
            methods: vec![AuthMethod::ApiKey],
            default_method: AuthMethod::ApiKey,
            scopes: vec![],
            models: vec!["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
            secret_label: "Anthropic API key",
            docs_url: "https://docs.anthropic.com/",
        },
        AuthProvider {
            key: "google",
            label: "Gemini",
            description: "API-key storage for future native Gemini agent execution.",
            methods: vec![AuthMethod::ApiKey],
            default_method: AuthMethod::ApiKey,
            scopes: vec![],
            models: vec!["gemini-1.5-pro", "gemini-1.5-flash"],
            secret_label: "Gemini API key",
            docs_url: "https://ai.google.dev/gemini-api/docs",
        },
        AuthProvider {
            key: "custom",
            label: "Custom API",
            description: "OpenAI-compatible endpoint storage for future native model calls.",
            methods: vec![AuthMethod::ApiKey],
            default_method: AuthMethod::ApiKey,
            scopes: vec![],
            models: vec!["custom-model"],
            secret_label: "Provider API key",
            docs_url: "https://platform.openai.com/docs/api-reference",
        },
        AuthProvider {
            key: "linkedin",
            label: "LinkedIn",
            description:
                "3-legged OAuth foundation for future approval-gated posting and comments.",
            methods: vec![AuthMethod::OAuth],
            default_method: AuthMethod::OAuth,
            scopes: vec!["openid", "profile", "email", "w_member_social"],
            models: vec![],
            secret_label: "LinkedIn OAuth",
            docs_url:
                "https://learn.microsoft.com/linkedin/shared/authentication/authorization-code-flow",
        },
    ]
}

pub fn provider_label(provider_key: &str) -> &'static str {
    auth_providers()
        .into_iter()
        .find(|provider| provider.key == provider_key)
        .map(|provider| provider.label)
        .unwrap_or("Unknown provider")
}

pub fn is_known_provider(provider_key: &str) -> bool {
    auth_providers()
        .into_iter()
        .any(|provider| provider.key == provider_key)
}

pub fn provider_supports_api_key(provider_key: &str) -> bool {
    auth_providers().into_iter().any(|provider| {
        provider.key == provider_key && provider.methods.contains(&AuthMethod::ApiKey)
    })
}
