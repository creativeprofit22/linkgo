import {
  stream,
  type Message,
  type Provider,
  type StreamOptions,
  type Tool,
} from "@kenkaiiii/gg-ai";
import { agentToolRegistry } from "@/agent/tools";
import { IS_TEST } from "@/lib/env";
import type {
  AgentMessage,
  AgentModelChunk,
  AgentModelRequest,
  AgentProvider,
  AgentProviderKey,
  AgentToolName,
} from "@/agent/types";

const GG_AI_PROVIDER_MAP: Partial<Record<AgentProviderKey, Provider>> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "gemini",
  custom: "openai",
};

function toGgAiMessages(messages: AgentMessage[]): Message[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        content: [
          {
            type: "tool_result",
            toolCallId:
              message.providerToolCallId ?? message.toolName ?? "tool-call",
            content: message.content,
          },
        ],
      };
    }
    return {
      role: message.role,
      content: message.content,
    };
  });
}

function toGgAiTools(): Tool[] {
  return Object.values(agentToolRegistry).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema as unknown as Tool["parameters"],
  }));
}

function isAgentToolName(name: string): name is AgentToolName {
  return Object.prototype.hasOwnProperty.call(agentToolRegistry, name);
}

function redactProviderError(error: unknown): Error {
  const message =
    error instanceof Error ? error.message : "Provider request failed";
  if (/api[_ -]?key|token|secret|authorization/i.test(message)) {
    return new Error("Provider credential error; secret details were redacted");
  }
  return new Error(message);
}

export interface GgAiProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  signal?: AbortSignal;
}

interface GgAiProviderTestApi {
  stream?: (options: StreamOptions) => AsyncIterable<AgentModelChunk>;
}

function getGgAiProviderTestApi(): GgAiProviderTestApi | undefined {
  if (!IS_TEST || typeof window === "undefined") return undefined;
  return (
    window as unknown as {
      __LINKGO_GG_AI_PROVIDER_TEST_API__?: GgAiProviderTestApi;
    }
  ).__LINKGO_GG_AI_PROVIDER_TEST_API__;
}

export function createGgAiProvider(
  key: Exclude<AgentProviderKey, "dry_run">,
  modelName: string,
  options: GgAiProviderOptions = {},
): AgentProvider {
  const provider = GG_AI_PROVIDER_MAP[key];
  if (provider === undefined) {
    throw new Error("Unsupported AI provider");
  }

  return {
    key,
    modelName,
    async *stream(request: AgentModelRequest): AsyncIterable<AgentModelChunk> {
      try {
        const streamOptions: StreamOptions = {
          provider,
          model: modelName,
          messages: toGgAiMessages(request.messages),
          tools: toGgAiTools(),
          toolChoice: "auto",
          maxTokens: 1200,
        };
        if (options.apiKey !== undefined) streamOptions.apiKey = options.apiKey;
        if (options.baseUrl !== undefined)
          streamOptions.baseUrl = options.baseUrl;
        if (options.signal !== undefined) streamOptions.signal = options.signal;
        const testStream = getGgAiProviderTestApi()?.stream;
        if (testStream !== undefined) {
          yield* testStream(streamOptions);
          return;
        }
        const result = stream(streamOptions);

        let streamedText = "";
        for await (const event of result) {
          if (event.type === "text_delta") {
            streamedText += event.text;
            yield { type: "text", text: event.text };
            continue;
          }
          if (event.type === "toolcall_done" && isAgentToolName(event.name)) {
            yield {
              type: "tool_call",
              providerToolCallId: event.id,
              toolName: event.name,
              input: event.args,
            };
            continue;
          }
          if (event.type === "error") {
            throw event.error;
          }
          if (event.type === "done") {
            yield {
              type: "done",
              outputSummary:
                streamedText.trim() ||
                `Provider stopped with ${event.stopReason}.`,
            };
          }
        }
      } catch (error) {
        throw redactProviderError(error);
      }
    },
  };
}
