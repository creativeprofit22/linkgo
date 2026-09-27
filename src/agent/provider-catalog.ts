export const GG_AI_PROVIDER_KEYS = [
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
] as const;

export const AGENT_PROVIDER_KEYS = [
  "dry_run",
  ...GG_AI_PROVIDER_KEYS,
  "custom",
] as const;

export const AUTH_PROVIDER_KEYS = [
  ...GG_AI_PROVIDER_KEYS,
  "custom",
  "linkedin",
] as const;

export type GgAiProviderKey = (typeof GG_AI_PROVIDER_KEYS)[number];
export type AgentProviderKey = (typeof AGENT_PROVIDER_KEYS)[number];
export type AuthProviderKey = (typeof AUTH_PROVIDER_KEYS)[number];

export const PROVIDER_LABELS: Record<AgentProviderKey | "linkedin", string> = {
  dry_run: "Dry run",
  anthropic: "Anthropic",
  xiaomi: "Xiaomi (MiMo)",
  openai: "OpenAI",
  gemini: "Gemini",
  glm: "Z.AI (GLM)",
  moonshot: "Moonshot",
  deepseek: "DeepSeek",
  openrouter: "OpenRouter",
  sakana: "Sakana",
  minimax: "MiniMax",
  custom: "Custom API",
  linkedin: "LinkedIn",
};

/**
 * Models served on the ChatGPT-plan (Codex) backend used when OpenAI is
 * connected with account sign-in; API-only models such as gpt-4.1 are
 * rejected there. Mirrors gg-framework's OpenAI (Codex) catalog, 2026-09-27.
 */
export const CHATGPT_PLAN_MODELS = [
  "gpt-6-sol",
  "gpt-6-luna",
  "gpt-6-astra",
] as const;

export const DEFAULT_AGENT_MODELS: Record<AgentProviderKey, string> = {
  dry_run: "dry-run-local",
  anthropic: "claude-sonnet-4-6",
  xiaomi: "MiMo-VL-7B-RL",
  openai: "gpt-4.1-mini",
  gemini: "gemini-2.5-flash",
  glm: "glm-4.7",
  moonshot: "kimi-k2-0711-preview",
  deepseek: "deepseek-chat",
  openrouter: "openrouter/auto",
  sakana: "fugu-mt-001",
  minimax: "MiniMax-M2",
  custom: "custom-model",
};

/** The connected-account fields that decide which backend serves a provider. */
export interface ModelDefaultAccount {
  readonly provider_key: string;
  readonly auth_method: string;
}

/**
 * Default model for a provider given the operator's connected accounts. OpenAI
 * connected with account sign-in runs on the ChatGPT-plan (Codex) backend,
 * which rejects API-only models, so it defaults to the first ChatGPT-plan
 * model. Every other case keeps DEFAULT_AGENT_MODELS.
 */
export function defaultAgentModelFor(
  providerKey: AgentProviderKey,
  accounts: readonly ModelDefaultAccount[],
): string {
  if (
    providerKey === "openai" &&
    accounts.some(
      (account) =>
        account.provider_key === "openai" && account.auth_method === "oauth",
    )
  ) {
    return CHATGPT_PLAN_MODELS[0];
  }
  return DEFAULT_AGENT_MODELS[providerKey];
}
