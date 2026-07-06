import { z } from "zod";
import { IS_TEST, IS_TAURI } from "@/lib/env";
import { agentProviderKeySchema } from "@/agent/schemas";
import {
  AGENT_TOOL_NAMES,
  type AgentModelChunk,
  type AgentModelRequest,
  type AgentProvider,
  type AgentProviderKey,
} from "@/agent/types";

const agentToolNameSchema = z.enum(AGENT_TOOL_NAMES);

const agentProviderChunkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }).strict(),
  z
    .object({
      type: z.literal("tool_call"),
      providerToolCallId: z.string().optional(),
      toolName: agentToolNameSchema,
      input: z.unknown(),
    })
    .strict(),
  z.object({ type: z.literal("done"), outputSummary: z.string() }).strict(),
]);

const agentProviderStreamResultSchema = z.object({
  chunks: z.array(agentProviderChunkSchema),
});

type InvokeFn = (cmd: string, args?: unknown) => Promise<unknown>;

interface TauriWindowLike {
  __TAURI__?: { core?: { invoke?: unknown } };
  __TAURI_INTERNALS__?: { invoke?: unknown };
}

function isInvoke(candidate: unknown): candidate is InvokeFn {
  return typeof candidate === "function";
}

function getInjectedInvoke(): InvokeFn | null {
  if (!IS_TEST || typeof window === "undefined") return null;
  const tauriWindow = window as unknown as TauriWindowLike;
  const candidate =
    tauriWindow.__TAURI_INTERNALS__?.invoke ??
    tauriWindow.__TAURI__?.core?.invoke;
  return isInvoke(candidate) ? candidate : null;
}

async function invokeCommand(cmd: string, args?: unknown): Promise<unknown> {
  const injected = getInjectedInvoke();
  if (injected) return injected(cmd, args);
  if (!IS_TAURI) {
    throw new Error("Provider-backed agent runs require the Tauri runtime");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(cmd, args as Record<string, unknown> | undefined);
}

export interface TauriAgentProviderCommandInput {
  providerKey: Exclude<AgentProviderKey, "dry_run">;
  modelName: string;
  request: AgentModelRequest;
}

export function createTauriAgentProvider(
  key: Exclude<AgentProviderKey, "dry_run">,
  modelName: string,
): AgentProvider {
  const parsedKey = agentProviderKeySchema.exclude(["dry_run"]).parse(key);

  return {
    key: parsedKey,
    modelName,
    stream: async function* tauriAgentProviderStream(
      request: AgentModelRequest,
    ): AsyncIterable<AgentModelChunk> {
      const result = await invokeCommand("linkgo_agent_provider_stream", {
        input: {
          providerKey: parsedKey,
          modelName,
          request,
        } satisfies TauriAgentProviderCommandInput,
      });
      const parsed = agentProviderStreamResultSchema.parse(result);
      for (const chunk of parsed.chunks) {
        yield chunk as AgentModelChunk;
      }
    },
  };
}
