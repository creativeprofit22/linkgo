use serde::{Deserialize, Serialize};

use super::AuthMethod;

#[cfg(test)]
pub const GG_AI_PROVIDER_KEYS: [&str; 10] = [
    "anthropic",
    "xiaomi",
    "openai",
    "gemini",
    "glm",
    "moonshot",
    "deepseek",
    "openrouter",
    "sakana",
    "minimax",
];

#[cfg(test)]
pub const AUTH_PROVIDER_KEYS: [&str; 12] = [
    "anthropic",
    "xiaomi",
    "openai",
    "gemini",
    "glm",
    "moonshot",
    "deepseek",
    "openrouter",
    "sakana",
    "minimax",
    "custom",
    "linkedin",
];

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
            key: "anthropic",
            label: "Anthropic",
            description: "Claude provider credentials for GG AI-backed agent execution.",
            methods: vec![AuthMethod::ApiKey],
            default_method: AuthMethod::ApiKey,
            scopes: vec![],
            models: vec!["claude-sonnet-4-6"],
            secret_label: "Anthropic API key or OAuth token",
            docs_url: "https://docs.anthropic.com/",
        },
        AuthProvider {
            key: "xiaomi",
            label: "Xiaomi (MiMo)",
            description: "Xiaomi MiMo credentials for GG AI-backed agent execution.",
            methods: vec![AuthMethod::ApiKey],
            default_method: AuthMethod::ApiKey,
            scopes: vec![],
            models: vec!["MiMo-VL-7B-RL"],
            secret_label: "Xiaomi MiMo API key",
            docs_url: "https://mimo.xiaomi.com/",
        },
        AuthProvider {
            key: "openai",
            label: "OpenAI",
            description: "OpenAI credentials for GG AI-backed agent execution.",
            methods: vec![AuthMethod::ApiKey],
            default_method: AuthMethod::ApiKey,
            scopes: vec![],
            models: vec!["gpt-4.1-mini", "gpt-4.1"],
            secret_label: "OpenAI API key",
            docs_url: "https://platform.openai.com/docs",
        },
        AuthProvider {
            key: "gemini",
            label: "Gemini",
            description: "Gemini Code Assist token for GG AI-backed agent execution.",
            methods: vec![AuthMethod::ApiKey],
            default_method: AuthMethod::ApiKey,
            scopes: vec![],
            models: vec!["gemini-2.5-flash"],
            secret_label: "Gemini Code Assist access token",
            docs_url: "https://ai.google.dev/gemini-api/docs",
        },
        AuthProvider {
            key: "glm",
            label: "Z.AI (GLM)",
            description: "Z.AI / GLM credentials for GG AI-backed agent execution.",
            methods: vec![AuthMethod::ApiKey],
            default_method: AuthMethod::ApiKey,
            scopes: vec![],
            models: vec!["glm-4.7"],
            secret_label: "Z.AI / GLM API key",
            docs_url: "https://docs.z.ai/",
        },
        AuthProvider {
            key: "moonshot",
            label: "Moonshot",
            description: "Moonshot credentials for GG AI-backed agent execution.",
            methods: vec![AuthMethod::ApiKey],
            default_method: AuthMethod::ApiKey,
            scopes: vec![],
            models: vec!["kimi-k2-0711-preview"],
            secret_label: "Moonshot API key",
            docs_url: "https://platform.moonshot.ai/docs",
        },
        AuthProvider {
            key: "deepseek",
            label: "DeepSeek",
            description: "DeepSeek credentials for GG AI-backed agent execution.",
            methods: vec![AuthMethod::ApiKey],
            default_method: AuthMethod::ApiKey,
            scopes: vec![],
            models: vec!["deepseek-chat"],
            secret_label: "DeepSeek API key",
            docs_url: "https://api-docs.deepseek.com/",
        },
        AuthProvider {
            key: "openrouter",
            label: "OpenRouter",
            description: "OpenRouter credentials for GG AI-backed agent execution.",
            methods: vec![AuthMethod::ApiKey],
            default_method: AuthMethod::ApiKey,
            scopes: vec![],
            models: vec!["openrouter/auto"],
            secret_label: "OpenRouter API key",
            docs_url: "https://openrouter.ai/docs",
        },
        AuthProvider {
            key: "sakana",
            label: "Sakana",
            description: "Sakana credentials for GG AI-backed agent execution.",
            methods: vec![AuthMethod::ApiKey],
            default_method: AuthMethod::ApiKey,
            scopes: vec![],
            models: vec!["fugu-mt-001"],
            secret_label: "Sakana API key",
            docs_url: "https://sakana.ai/",
        },
        AuthProvider {
            key: "minimax",
            label: "MiniMax",
            description: "MiniMax credentials for GG AI-backed agent execution.",
            methods: vec![AuthMethod::ApiKey],
            default_method: AuthMethod::ApiKey,
            scopes: vec![],
            models: vec!["MiniMax-M2"],
            secret_label: "MiniMax API key",
            docs_url: "https://www.minimax.io/platform/document",
        },
        AuthProvider {
            key: "custom",
            label: "Custom API",
            description: "Linkgo-only OpenAI-compatible endpoint for custom GG AI execution.",
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
            description: "3-legged OAuth foundation for approval-gated posting and comments.",
            methods: vec![AuthMethod::OAuth],
            default_method: AuthMethod::OAuth,
            scopes: vec![
                "openid",
                "profile",
                "email",
                "w_member_social",
                "w_member_social_feed",
                "r_member_social_feed",
            ],
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

#[cfg(test)]
mod tests {
    use super::{auth_providers, AUTH_PROVIDER_KEYS, GG_AI_PROVIDER_KEYS};
    use crate::auth::AuthMethod;

    #[test]
    fn provider_keys_match_gg_ai_catalog_plus_linkgo_extras() {
        let keys = auth_providers()
            .into_iter()
            .map(|provider| provider.key)
            .collect::<Vec<_>>();
        assert_eq!(keys, AUTH_PROVIDER_KEYS);
        assert_eq!(
            GG_AI_PROVIDER_KEYS,
            [
                "anthropic",
                "xiaomi",
                "openai",
                "gemini",
                "glm",
                "moonshot",
                "deepseek",
                "openrouter",
                "sakana",
                "minimax",
            ]
        );
    }

    #[test]
    fn gg_ai_and_custom_providers_use_api_key_auth() {
        for provider in auth_providers() {
            if provider.key == "linkedin" {
                assert_eq!(provider.methods, vec![AuthMethod::OAuth]);
            } else {
                assert_eq!(provider.methods, vec![AuthMethod::ApiKey]);
            }
        }
    }

    #[test]
    fn xiaomi_docs_url_uses_provider_specific_mimo_site() {
        let provider = auth_providers()
            .into_iter()
            .find(|provider| provider.key == "xiaomi")
            .expect("xiaomi provider should be present");

        assert_eq!(provider.docs_url, "https://mimo.xiaomi.com/");
    }

    #[test]
    fn auth_methods_serialize_to_renderer_contract() {
        let linkedin = auth_providers()
            .into_iter()
            .find(|provider| provider.key == "linkedin")
            .expect("linkedin provider should be present");
        let value = serde_json::to_value(&linkedin).unwrap();

        assert_eq!(value["methods"], serde_json::json!(["oauth"]));
        assert_eq!(value["defaultMethod"], "oauth");
        assert_eq!(serde_json::to_value(AuthMethod::ApiKey).unwrap(), "api_key");
        assert_eq!(
            serde_json::from_str::<AuthMethod>("\"o_auth\"").unwrap(),
            AuthMethod::OAuth
        );
    }
}
