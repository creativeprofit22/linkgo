import type { AgentProvider, AgentProviderKey } from "@/agent/types";

export const AGENT_PROVIDER_LABELS: Record<AgentProviderKey, string> = {
  dry_run: "Dry run",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  custom: "Custom",
};

export function createUnavailableProvider(
  key: Exclude<AgentProviderKey, "dry_run">,
  modelName = "",
): AgentProvider {
  return {
    key,
    modelName,
    stream: () => {
      throw new Error(
        `${AGENT_PROVIDER_LABELS[key]} provider is not implemented`,
      );
    },
  };
}
