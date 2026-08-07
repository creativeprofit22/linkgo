import { z } from "zod";
import {
  createAssistantTextMessage,
  createAssistantToolCallMessage,
  createToolResultMessage,
} from "@/agent/messages";
import type {
  AgentLoopOptions,
  AgentLoopResult,
  AgentLoopToolCallResult,
  AgentModelChunk,
  AgentProgressEvent,
  AgentProviderToolDefinition,
  AgentToolContract,
  AgentToolRegistry,
} from "@/agent/types";

async function emitProgress(
  event: AgentProgressEvent,
  onProgress: AgentLoopOptions["onProgress"],
): Promise<void> {
  await onProgress?.(event);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unexpected agent runtime error";
}

function isRetryableError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("rate limit") ||
    message.includes("network") ||
    message.includes("temporar") ||
    message.includes("overloaded")
  );
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error("Agent run was cancelled");
}

function emptyUsage(): AgentLoopResult["usage"] {
  return { inputTokens: 0, outputTokens: 0, providerRequestId: "" };
}

function toProviderInputSchema(
  tool: AgentToolContract,
): AgentProviderToolDefinition["inputSchema"] {
  const inputSchema = z.toJSONSchema(tool.inputSchema, {
    target: "draft-7",
    io: "input",
  }) as Record<string, unknown>;
  delete inputSchema.$schema;
  return inputSchema;
}

function toProviderToolDefinitions(
  tools: AgentToolRegistry,
): AgentProviderToolDefinition[] {
  return Object.values(tools)
    .filter((tool): tool is AgentToolContract => tool !== undefined)
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: toProviderInputSchema(tool),
    }));
}

function getProviderToolCallId(
  chunkProviderToolCallId: string | undefined,
  providerKey: string,
  requestRunId: number,
  toolCallSequence: string,
): string {
  const providerToolCallId = chunkProviderToolCallId?.trim();
  return providerToolCallId && providerToolCallId.length > 0
    ? providerToolCallId
    : `${providerKey}-${requestRunId}-tool-call-${toolCallSequence}`;
}

function assertApprovalToolCallIsIsolated(
  toolCalls: Array<Extract<AgentModelChunk, { type: "tool_call" }>>,
  tools: AgentToolRegistry,
): void {
  const approvalToolNames = [
    ...new Set(
      toolCalls
        .filter((toolCall) => tools[toolCall.toolName]?.requiresApproval)
        .map((toolCall) => toolCall.toolName),
    ),
  ];
  if (approvalToolNames.length === 0 || toolCalls.length === 1) return;

  throw new Error(
    `Provider turn rejected before tool execution: approval-required tool call ${approvalToolNames.join(", ")} must be isolated; received ${toolCalls.length} tool calls.`,
  );
}

function assertProviderToolCallsWereOffered(
  toolCalls: Array<Extract<AgentModelChunk, { type: "tool_call" }>>,
  tools: AgentToolRegistry,
): void {
  const unofferedToolNames = [
    ...new Set(
      toolCalls
        .filter((toolCall) => tools[toolCall.toolName] === undefined)
        .map((toolCall) => toolCall.toolName),
    ),
  ];
  if (unofferedToolNames.length === 0) return;

  throw new Error(
    `Provider turn rejected before tool execution: tool call ${unofferedToolNames.join(", ")} was not offered for this run.`,
  );
}

function getOfferedTool(
  tools: AgentToolRegistry,
  toolName: AgentToolContract["name"],
): AgentToolContract {
  const tool = tools[toolName];
  if (tool === undefined) {
    throw new Error(
      `Provider tool call ${toolName} was not offered for this run.`,
    );
  }
  return tool;
}

export async function runAgentLoop(
  options: AgentLoopOptions,
): Promise<AgentLoopResult> {
  const { provider, tools, request, signal, onProgress } = options;
  const maxTurns = options.maxTurns ?? options.maxIterations ?? 8;
  const maxRetries = options.maxRetries ?? 1;
  const toolCalls: AgentLoopToolCallResult[] = [];
  const handledProviderToolCallIds = new Set(
    options.handledProviderToolCallIds ?? [],
  );
  const messages = [...request.messages];
  const providerTools = toProviderToolDefinitions(tools);
  let turnCount = options.initialTurnCount ?? 0;
  let retryCount = 0;

  await emitProgress(
    {
      type: "model_started",
      summary: `${provider.key} model loop started with ${provider.modelName}.`,
    },
    onProgress,
  );

  try {
    while (turnCount < maxTurns) {
      assertNotAborted(signal);
      turnCount += 1;
      const turnRequest = { ...request, messages: [...messages] };
      let turnChunks: Awaited<ReturnType<typeof collectProviderTurn>>;

      while (true) {
        try {
          turnChunks = await collectProviderTurn({
            provider,
            providerTools,
            request: turnRequest,
            signal,
            onProgress,
          });
          break;
        } catch (error) {
          const retryable = isRetryableError(error) && retryCount < maxRetries;
          if (!retryable) throw error;
          retryCount += 1;
          await emitProgress(
            {
              type: "model_streamed",
              summary: `Retrying provider call after transient failure (${retryCount}/${maxRetries}).`,
            },
            onProgress,
          );
        }
      }

      assertApprovalToolCallIsIsolated(turnChunks.toolCalls, tools);
      assertProviderToolCallsWereOffered(turnChunks.toolCalls, tools);

      if (turnChunks.assistantText.length > 0) {
        messages.push(createAssistantTextMessage(turnChunks.assistantText));
      }

      let completedToolCount = 0;
      for (const [toolCallIndex, chunk] of turnChunks.toolCalls.entries()) {
        assertNotAborted(signal);
        const tool = getOfferedTool(tools, chunk.toolName);
        const parsedInput = tool.inputSchema.parse(chunk.input);
        const providerToolCallId = getProviderToolCallId(
          chunk.providerToolCallId,
          provider.key,
          request.runId,
          `${turnCount}-${toolCallIndex + 1}`,
        );

        await emitProgress(
          {
            type: "tool_requested",
            summary: `${tool.label} requested`,
            providerToolCallId,
            toolName: tool.name,
            input: parsedInput,
            requiresApproval: tool.requiresApproval,
          },
          onProgress,
        );

        if (handledProviderToolCallIds.has(providerToolCallId)) {
          const errorMessage = "Duplicate provider tool call ignored.";
          toolCalls.push({
            providerToolCallId,
            toolName: tool.name,
            status: "rejected",
            requiresApproval: tool.requiresApproval,
            input: parsedInput,
            output: {},
            errorMessage,
          });
          await emitProgress(
            {
              type: "tool_failed",
              summary: `${tool.label} rejected: ${errorMessage}`,
              providerToolCallId,
              toolName: tool.name,
              input: parsedInput,
              errorMessage,
              requiresApproval: tool.requiresApproval,
            },
            onProgress,
          );
          continue;
        }
        handledProviderToolCallIds.add(providerToolCallId);
        messages.push(
          createAssistantToolCallMessage(
            tool.name,
            providerToolCallId,
            parsedInput,
          ),
        );

        if (tool.requiresApproval) {
          toolCalls.push({
            providerToolCallId,
            toolName: tool.name,
            status: "waiting_approval",
            requiresApproval: true,
            input: parsedInput,
            output: {},
            errorMessage: "",
          });
          await emitProgress(
            {
              type: "approval_required",
              summary: `${tool.label} requires human approval`,
              providerToolCallId,
              toolName: tool.name,
              input: parsedInput,
              requiresApproval: true,
            },
            onProgress,
          );
          return {
            status: "waiting_approval",
            outputSummary: `${tool.label} is waiting for human approval.`,
            iterationCount: turnCount,
            toolCalls,
            conversation: messages,
            errorMessage: "",
            retryCount,
            usage: emptyUsage(),
          };
        }

        try {
          const rawOutput = await tool.execute(parsedInput, {
            request: turnRequest,
            providerToolCallId,
          });
          assertNotAborted(signal);
          const parsedOutput = tool.outputSchema.parse(rawOutput);
          toolCalls.push({
            providerToolCallId,
            toolName: tool.name,
            status: "completed",
            requiresApproval: false,
            input: parsedInput,
            output: parsedOutput,
            errorMessage: "",
          });
          await emitProgress(
            {
              type: "tool_completed",
              summary: `${tool.label} completed`,
              providerToolCallId,
              toolName: tool.name,
              input: parsedInput,
              output: parsedOutput,
              requiresApproval: false,
            },
            onProgress,
          );
          messages.push(
            createToolResultMessage(
              tool.name,
              providerToolCallId,
              parsedOutput,
            ),
          );
          completedToolCount += 1;
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          toolCalls.push({
            providerToolCallId,
            toolName: tool.name,
            status: "failed",
            requiresApproval: false,
            input: parsedInput,
            output: {},
            errorMessage,
          });
          await emitProgress(
            {
              type: "tool_failed",
              summary: `${tool.label} failed: ${errorMessage}`,
              providerToolCallId,
              toolName: tool.name,
              input: parsedInput,
              errorMessage,
              requiresApproval: false,
            },
            onProgress,
          );
          throw error;
        }
      }

      if (completedToolCount > 0) continue;

      const finalSummary =
        turnChunks.outputSummary || "Agent loop completed locally.";
      await emitProgress(
        { type: "run_completed", summary: finalSummary },
        onProgress,
      );
      return {
        status: "completed",
        outputSummary: finalSummary,
        iterationCount: turnCount,
        toolCalls,
        conversation: messages,
        errorMessage: "",
        retryCount,
        usage: emptyUsage(),
      };
    }

    throw new Error(`Agent loop exceeded the maximum turn limit (${maxTurns})`);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    await emitProgress(
      { type: "run_failed", summary: errorMessage, errorMessage },
      onProgress,
    );
    return {
      status: "failed",
      outputSummary: "",
      iterationCount: turnCount,
      toolCalls,
      conversation: messages,
      errorMessage,
      retryCount,
      usage: emptyUsage(),
    };
  }
}

async function collectProviderTurn({
  provider,
  providerTools,
  request,
  signal,
  onProgress,
}: {
  provider: AgentLoopOptions["provider"];
  providerTools: AgentProviderToolDefinition[];
  request: AgentLoopOptions["request"];
  signal: AbortSignal | undefined;
  onProgress: AgentLoopOptions["onProgress"] | undefined;
}): Promise<{
  toolCalls: Array<Extract<AgentModelChunk, { type: "tool_call" }>>;
  assistantText: string;
  outputSummary: string;
}> {
  const toolCalls: Array<Extract<AgentModelChunk, { type: "tool_call" }>> = [];
  const assistantTextChunks: string[] = [];
  let outputSummary: string | null = null;

  for await (const chunk of provider.stream(request, {
    tools: providerTools,
    toolChoice: "auto",
  })) {
    assertNotAborted(signal);
    if (chunk.type === "text") {
      assistantTextChunks.push(chunk.text);
      await emitProgress(
        { type: "model_streamed", summary: chunk.text },
        onProgress,
      );
    } else if (chunk.type === "tool_call") {
      toolCalls.push(chunk);
    } else {
      outputSummary = chunk.outputSummary;
    }
  }

  if (outputSummary === null) {
    throw new Error("Provider turn ended without a completion marker");
  }
  return {
    toolCalls,
    assistantText: assistantTextChunks.join(""),
    outputSummary,
  };
}
