import { createDryRunProvider } from "@/agent/dry-run";
import {
  createGgAiProvider,
  type GgAiProviderOptions,
} from "@/agent/gg-ai-provider";
import type { AgentProvider, AgentProviderKey } from "@/agent/types";

export const AGENT_PROVIDER_LABELS: Record<AgentProviderKey, string> = {
  dry_run: "Dry run",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  custom: "Custom",
};

export const DEFAULT_AGENT_MODELS: Record<AgentProviderKey, string> = {
  dry_run: "dry-run-local",
  openai: "gpt-4.1-mini",
  anthropic: "claude-3-5-sonnet-latest",
  google: "gemini-1.5-flash",
  custom: "custom-model",
};

export function createConfiguredAgentProvider(
  key: AgentProviderKey,
  modelName = DEFAULT_AGENT_MODELS[key],
  options: GgAiProviderOptions = {},
): AgentProvider {
  if (key === "dry_run")
    return createDryRunProvider(modelName || "dry-run-local");
  return createGgAiProvider(
    key,
    modelName || DEFAULT_AGENT_MODELS[key],
    options,
  );
}

export function createUnavailableProvider(
  key: Exclude<AgentProviderKey, "dry_run">,
  modelName = "",
): AgentProvider {
  return createConfiguredAgentProvider(
    key,
    modelName || DEFAULT_AGENT_MODELS[key],
  );
}
