import { createDryRunProvider } from "@/agent/dry-run";
import { createTauriAgentProvider } from "@/agent/tauri-provider";
import {
  DEFAULT_AGENT_MODELS,
  PROVIDER_LABELS,
} from "@/agent/provider-catalog";
import type { AgentProvider, AgentProviderKey } from "@/agent/types";

export { DEFAULT_AGENT_MODELS } from "@/agent/provider-catalog";

export const AGENT_PROVIDER_LABELS: Record<AgentProviderKey, string> =
  PROVIDER_LABELS;

export function createConfiguredAgentProvider(
  key: AgentProviderKey,
  modelName = DEFAULT_AGENT_MODELS[key],
): AgentProvider {
  if (key === "dry_run")
    return createDryRunProvider(modelName || "dry-run-local");
  return createTauriAgentProvider(key, modelName || DEFAULT_AGENT_MODELS[key]);
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
