import type {
  AgentLoopOptions,
  AgentLoopResult,
  AgentLoopToolCallResult,
  AgentProgressEvent,
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

function getProviderToolCallId(
  chunkProviderToolCallId: string | undefined,
  providerKey: string,
  requestRunId: number,
  iterationCount: number,
): string {
  const providerToolCallId = chunkProviderToolCallId?.trim();
  return providerToolCallId && providerToolCallId.length > 0
    ? providerToolCallId
    : `${providerKey}-${requestRunId}-tool-call-${iterationCount}`;
}

async function runSingleAgentLoopAttempt({
  provider,
  tools,
  request,
  maxIterations,
  signal,
  onProgress,
}: Required<Pick<AgentLoopOptions, "provider" | "tools" | "request">> & {
  maxIterations: number;
  signal: AbortSignal | undefined;
  onProgress: AgentLoopOptions["onProgress"] | undefined;
}): Promise<Omit<AgentLoopResult, "retryCount">> {
  const toolCalls: AgentLoopToolCallResult[] = [];
  let iterationCount = 0;
  let outputSummary = "";

  await emitProgress(
    {
      type: "model_started",
      summary: `${provider.key} model loop started with ${provider.modelName}.`,
    },
    onProgress,
  );

  for await (const chunk of provider.stream(request)) {
    assertNotAborted(signal);
    iterationCount += 1;
    if (iterationCount > maxIterations) {
      throw new Error("Agent loop exceeded the maximum iteration limit");
    }

    if (chunk.type === "text") {
      await emitProgress(
        { type: "model_streamed", summary: chunk.text },
        onProgress,
      );
      continue;
    }

    if (chunk.type === "done") {
      outputSummary = chunk.outputSummary;
      break;
    }

    const tool = tools[chunk.toolName];
    const parsedInput = tool.inputSchema.parse(chunk.input);
    const providerToolCallId = getProviderToolCallId(
      chunk.providerToolCallId,
      provider.key,
      request.runId,
      iterationCount,
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
        iterationCount,
        toolCalls,
        errorMessage: "",
        usage: emptyUsage(),
      };
    }

    try {
      const rawOutput = await tool.execute(parsedInput);
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

  const finalSummary = outputSummary || "Agent loop completed locally.";
  await emitProgress(
    { type: "run_completed", summary: finalSummary },
    onProgress,
  );
  return {
    status: "completed",
    outputSummary: finalSummary,
    iterationCount,
    toolCalls,
    errorMessage: "",
    usage: emptyUsage(),
  };
}

export async function runAgentLoop({
  provider,
  tools,
  request,
  maxIterations = 8,
  maxRetries = 1,
  signal,
  onProgress,
}: AgentLoopOptions): Promise<AgentLoopResult> {
  let retryCount = 0;
  let lastIterationCount = 0;
  let lastToolCalls: AgentLoopToolCallResult[] = [];

  while (retryCount <= maxRetries) {
    assertNotAborted(signal);
    try {
      const result = await runSingleAgentLoopAttempt({
        provider,
        tools,
        request,
        maxIterations,
        signal,
        onProgress,
      });
      return { ...result, retryCount };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const retryable = isRetryableError(error) && retryCount < maxRetries;
      if (!retryable) {
        await emitProgress(
          { type: "run_failed", summary: errorMessage, errorMessage },
          onProgress,
        );
        return {
          status: "failed",
          outputSummary: "",
          iterationCount: lastIterationCount,
          toolCalls: lastToolCalls,
          errorMessage,
          retryCount,
          usage: emptyUsage(),
        };
      }
      retryCount += 1;
      lastIterationCount = 0;
      lastToolCalls = [];
      await emitProgress(
        {
          type: "model_streamed",
          summary: `Retrying provider call after transient failure (${retryCount}/${maxRetries}).`,
        },
        onProgress,
      );
    }
  }

  return {
    status: "failed",
    outputSummary: "",
    iterationCount: lastIterationCount,
    toolCalls: lastToolCalls,
    errorMessage: "Agent retry budget was exhausted",
    retryCount,
    usage: emptyUsage(),
  };
}
