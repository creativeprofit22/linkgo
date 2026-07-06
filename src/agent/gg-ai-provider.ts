import { createTauriAgentProvider } from "@/agent/tauri-provider";
import type { AgentProviderKey } from "@/agent/types";

export interface GgAiProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  signal?: AbortSignal;
}

/**
 * Compatibility shim only.
 *
 * Provider execution is intentionally behind the Tauri command boundary in
 * `createTauriAgentProvider`; renderer code must not import Node-only model SDKs.
 */
export function createGgAiProvider(
  key: Exclude<AgentProviderKey, "dry_run">,
  modelName: string,
  _options: GgAiProviderOptions = {},
) {
  return createTauriAgentProvider(key, modelName);
}
