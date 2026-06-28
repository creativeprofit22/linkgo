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
