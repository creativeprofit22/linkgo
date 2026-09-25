//! The agent provider keys, shared by every native command that validates a
//! `provider_key`. Mirrors `AGENT_PROVIDER_KEYS` in
//! `src/agent/provider-catalog.ts` and the `provider_parity` migration CHECK.

pub(crate) const AGENT_PROVIDER_KEYS: [&str; 12] = [
    "dry_run",
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
];

#[cfg(test)]
mod tests {
    use super::*;

    /// Guards against drift from the storage CHECK constraint.
    #[test]
    fn matches_the_provider_parity_check_constraint() {
        let migration = include_str!("migrations/provider_parity.rs");
        let expected = format!(
            "CHECK(provider_key IN ({}))",
            AGENT_PROVIDER_KEYS
                .iter()
                .map(|key| format!("'{key}'"))
                .collect::<Vec<_>>()
                .join(", ")
        );
        assert!(migration.contains(&expected), "{expected}");
    }

    /// Guards against drift from the renderer catalog.
    #[test]
    fn matches_the_renderer_provider_catalog() {
        let catalog = include_str!("../../src/agent/provider-catalog.ts");
        for key in AGENT_PROVIDER_KEYS {
            assert!(catalog.contains(&format!("\"{key}\"")), "{key}");
        }
    }
}
