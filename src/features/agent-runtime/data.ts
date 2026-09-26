import { invokeCommand } from "@/lib/tauri";
import {
  AGENT_TOOL_METADATA,
  agentConversationSchema,
  agentToolRegistry,
  getAgentToolRegistryForRole,
  buildAgentMessages,
  createConfiguredAgentProvider,
  getAgentPlaybook,
  runAgentLoop,
  type AgentLoopResult,
  type AgentModelRequest,
  type AgentProgressEvent,
  type AgentToolMetadata,
} from "@/agent";
import { z } from "zod";
import {
  agentRunListSnapshotSchema,
  agentRunValidationRowSchema,
} from "@/features/agent-runtime/record-schemas";
import { IS_TEST } from "@/lib/env";
import type { CampaignStatus } from "@/features/campaigns/types";
import { relevanceScoringContextSchema } from "@/features/candidate-queue/schemas";
import { getPlaybookPromptForRuntime } from "@/features/playbooks/data";
import { getAuthStatus } from "@/features/integrations/data";
import { isAgentProviderReady } from "@/features/agent-runtime/provider-readiness";
import {
  agentInputContextSchema,
  agentRunApprovalCheckpointSchema,
  approvedContinuationSettlementSchema,
  cancelAgentRunSchema,
  createAgentRunSchema,
  agentRunMutationResultSchema,
  persistAgentResultOutputSchema,
  resumeAgentRunResultSchema,
  resumeAgentRunSchema,
  startAgentRunSchema,
} from "@/features/agent-runtime/schemas";
import type {
  AgentRun,
  AgentRunApprovalCheckpoint,
  ApprovedContinuationSettlement,
  AgentRunEvent,
  AgentRunWithDetails,
  AgentToolCall,
  AgentToolCallWithJson,
  CancelAgentRunInput,
  CreateAgentRunInput,
  ResumeAgentRunInput,
  ResumeAgentRunResult,
  StartAgentRunInput,
} from "@/features/agent-runtime/types";
import { listWorkflowRuns } from "@/workflows/data";
import type { WorkflowRunWithDetails } from "@/workflows/types";
import {
  failNativeRelevanceScorerAgent,
  reconcileNativeRelevanceScorer,
  startNativeRelevanceScorer,
} from "@/workflows/relevance-scoring-commands";

interface AgentRunRow extends AgentRun {
  campaign_name: string;
  campaign_status: CampaignStatus;
  quality_start_blocked: number;
}

interface AgentRunValidationRow extends AgentRun {
  campaign_status: CampaignStatus;
}

type AgentRunApprovalCheckpointRow = Omit<
  AgentRunApprovalCheckpoint,
  "messages"
>;

const activeResumeRunIds = new Set<number>();

function parseToolCallJson(call: AgentToolCall): AgentToolCallWithJson {
  const tool = agentToolRegistry[call.tool_name];
  const input = tool.inputSchema.parse(JSON.parse(call.input_json));
  const rawOutput = JSON.parse(call.output_json);
  const output =
    call.status === "completed"
      ? tool.outputSchema.parse(rawOutput)
      : rawOutput;
  return { ...call, input, output };
}

function parseAgentInputContext(inputContextJson: string | undefined) {
  const rawContext = JSON.parse(inputContextJson ?? "{}");
  return agentInputContextSchema.parse(rawContext);
}

function parseApprovalCheckpoint(
  row: AgentRunApprovalCheckpointRow,
): AgentRunApprovalCheckpoint {
  return agentRunApprovalCheckpointSchema.parse({
    ...row,
    messages: JSON.parse(row.messages_json),
  });
}

function mapRunWithDetails(
  row: AgentRunRow,
  toolCalls: AgentToolCall[],
  events: AgentRunEvent[],
  workflowRun: WorkflowRunWithDetails | null,
  checkpoint: AgentRunApprovalCheckpoint | null,
): AgentRunWithDetails {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    workflow_run_id: row.workflow_run_id,
    workflow_step_id: row.workflow_step_id,
    agent_role: row.agent_role,
    provider_key: row.provider_key,
    model_name: row.model_name,
    playbook_key: row.playbook_key,
    status: row.status,
    input_summary: row.input_summary,
    input_context_json: row.input_context_json ?? "{}",
    output_summary: row.output_summary,
    error_message: row.error_message,
    iteration_count: row.iteration_count,
    started_at: row.started_at,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    campaign: {
      id: row.campaign_id,
      name: row.campaign_name,
      status: row.campaign_status,
    },
    workflowRun,
    checkpoint,
    qualityStartBlocked: row.quality_start_blocked === 1,
    inputContext: parseAgentInputContext(row.input_context_json),
    toolCalls: toolCalls.map(parseToolCallJson),
    events,
  };
}

async function getAgentRunValidation(
  id: number,
): Promise<AgentRunValidationRow> {
  // Read-only native lookup; any provider call happens after it returns.
  return agentRunValidationRowSchema.parse(
    await invokeCommand("linkgo_agent_run_validation", {
      input: { id },
    }),
  );
}

async function recordProgressEvent(
  agentRunId: number,
  event: AgentProgressEvent,
): Promise<void> {
  await invokeCommand("linkgo_agent_run_record_event", {
    input: { agentRunId, eventType: event.type, summary: event.summary },
  });
}

/** Runs a native agent-run mutation and returns the affected run id. */
async function invokeAgentRunMutation(
  command: string,
  input: unknown,
): Promise<number> {
  return agentRunMutationResultSchema.parse(
    await invokeCommand(command, { input }),
  ).id;
}

export function listAgentToolContracts(): AgentToolMetadata[] {
  return [...AGENT_TOOL_METADATA];
}

export async function listAgentRuns(
  campaignId?: number,
): Promise<AgentRunWithDetails[]> {
  const parsedCampaignId = z
    .number()
    .int()
    .positive()
    .optional()
    .parse(campaignId);
  // One native snapshot (runs capped at 200, newest 100 events per run).
  const [snapshot, workflowRuns] = await Promise.all([
    invokeCommand("linkgo_agent_run_list", {
      input:
        parsedCampaignId === undefined ? {} : { campaignId: parsedCampaignId },
    }).then((value) => agentRunListSnapshotSchema.parse(value)),
    listWorkflowRuns(parsedCampaignId),
  ]);
  const runRows: AgentRunRow[] = snapshot.runs;
  if (runRows.length === 0) return [];
  const toolCallRows: AgentToolCall[] = snapshot.toolCalls;
  const eventRows: AgentRunEvent[] = snapshot.events;
  const checkpointRows =
    snapshot.checkpoints as AgentRunApprovalCheckpointRow[];

  const toolCallsByRunId = new Map<number, AgentToolCall[]>();
  for (const toolCall of toolCallRows) {
    const calls = toolCallsByRunId.get(toolCall.agent_run_id) ?? [];
    calls.push(toolCall);
    toolCallsByRunId.set(toolCall.agent_run_id, calls);
  }

  const eventsByRunId = new Map<number, AgentRunEvent[]>();
  for (const event of eventRows) {
    const events = eventsByRunId.get(event.agent_run_id) ?? [];
    events.push(event);
    eventsByRunId.set(event.agent_run_id, events);
  }

  const checkpointsByRunId = new Map(
    checkpointRows.map((checkpoint) => [
      checkpoint.agent_run_id,
      parseApprovalCheckpoint(checkpoint),
    ]),
  );
  const workflowRunsById = new Map(
    workflowRuns.map((workflowRun) => [workflowRun.id, workflowRun]),
  );

  return runRows.map((row) =>
    mapRunWithDetails(
      row,
      toolCallsByRunId.get(row.id) ?? [],
      eventsByRunId.get(row.id) ?? [],
      row.workflow_run_id === null
        ? null
        : (workflowRunsById.get(row.workflow_run_id) ?? null),
      checkpointsByRunId.get(row.id) ?? null,
    ),
  );
}

/**
 * Creates a queued agent run natively: campaign, workflow ownership and the
 * playbook (default, override, compatibility) are resolved in one transaction.
 */
export async function createAgentRun(
  input: CreateAgentRunInput,
): Promise<number> {
  const parsed = createAgentRunSchema.parse(input);
  return invokeAgentRunMutation("linkgo_agent_run_create", parsed);
}

async function assertProviderConnected(
  providerKey: AgentRun["provider_key"],
): Promise<void> {
  if (providerKey === "dry_run") return;
  const authStatus = await getAuthStatus();
  if (isAgentProviderReady(providerKey, authStatus.accounts)) return;
  if (providerKey === "custom") {
    throw new Error("Custom provider requires a Base URL override");
  }
  throw new Error("Agent provider is not connected");
}

/**
 * Settles a finished loop natively (tool calls, checkpoint, run status,
 * workflow projection, failure audit + error item) in one transaction.
 * Per-tool contracts are checked here first, exactly as before.
 */
async function persistAgentLoopResult(
  runId: number,
  result: AgentLoopResult,
  options: { allowContinuationRecovery: boolean },
): Promise<ResumeAgentRunResult["checkpointPhase"]> {
  const conversation = agentConversationSchema.parse(result.conversation);
  const toolCalls = result.toolCalls.map((toolCall) => {
    const tool = agentToolRegistry[toolCall.toolName];
    return {
      providerToolCallId: toolCall.providerToolCallId,
      toolName: toolCall.toolName,
      status: toolCall.status,
      requiresApproval: toolCall.requiresApproval,
      input: tool.inputSchema.parse(toolCall.input),
      output:
        toolCall.status === "completed"
          ? tool.outputSchema.parse(toolCall.output ?? {})
          : (toolCall.output ?? {}),
      errorMessage: toolCall.errorMessage,
    };
  });
  const persisted = persistAgentResultOutputSchema.parse(
    await invokeCommand("linkgo_agent_run_persist_result", {
      input: {
        agentRunId: runId,
        continuation: options.allowContinuationRecovery,
        result: {
          status: result.status,
          outputSummary: result.outputSummary,
          errorMessage: result.errorMessage,
          iterationCount: result.iterationCount,
          conversation,
          toolCalls,
        },
      },
    }),
  );
  return persisted.checkpointPhase;
}

/** Best effort: marks a still-running run failed after its result was lost. */
async function failAgentRunAfterPersistenceError(
  runId: number,
  error: unknown,
): Promise<void> {
  const errorMessage =
    error instanceof Error ? error.message : "Agent result persistence failed";
  try {
    await invokeCommand("linkgo_agent_run_fail_after_persistence_error", {
      input: { agentRunId: runId, errorMessage },
    });
  } catch {
    // Preserve the original persistence failure.
  }
}

export async function startAgentRun(input: StartAgentRunInput): Promise<void> {
  const parsed = startAgentRunSchema.parse(input);
  const run = await getAgentRunValidation(parsed.id);
  await assertProviderConnected(run.provider_key);

  const provider = createConfiguredAgentProvider(
    run.provider_key,
    run.model_name || undefined,
  );
  const runtimePlaybook = await getPlaybookPromptForRuntime(run.playbook_key);
  const inputContext = parseAgentInputContext(run.input_context_json);
  const isPlannerScorer =
    run.agent_role === "scorer" &&
    relevanceScoringContextSchema.safeParse(inputContext).success;

  // Native re-checks status, checkpoint and the kill switch; planner scorers
  // are claimed by the native relevance scorer instead.
  await invokeAgentRunMutation("linkgo_agent_run_start", {
    id: run.id,
    claim: !isPlannerScorer,
  });
  if (isPlannerScorer) await startNativeRelevanceScorer(run.id);
  const request: AgentModelRequest = {
    runId: run.id,
    campaignId: run.campaign_id,
    workflowRunId: run.workflow_run_id,
    workflowStepId: run.workflow_step_id,
    agentRole: run.agent_role,
    inputSummary: run.input_summary,
    inputContext,
    messages: buildAgentMessages(run.agent_role, {
      inputSummary: run.input_summary || "Validate runtime contracts locally.",
      inputContext,
      playbook: runtimePlaybook?.definition ?? null,
      customPlaybookInstructions: runtimePlaybook?.customInstructions ?? "",
    }),
    ...(runtimePlaybook
      ? {
          playbookKey: runtimePlaybook.definition.key,
          playbookLabel: runtimePlaybook.definition.label,
        }
      : {}),
  };

  const result = await runAgentLoop({
    provider,
    tools: getAgentToolRegistryForRole(run.agent_role),
    request,
    maxTurns: 8,
    maxRetries: run.provider_key === "dry_run" ? 0 : 1,
    onProgress: (event) => recordProgressEvent(run.id, event),
  });

  if (isPlannerScorer) {
    try {
      await reconcileNativeRelevanceScorer(run.id, result);
    } catch (error) {
      await failNativeRelevanceScorerAgent(run.id, error);
      throw error;
    }
  } else {
    try {
      await persistAgentLoopResult(run.id, result, {
        allowContinuationRecovery: false,
      });
    } catch (error) {
      await failAgentRunAfterPersistenceError(run.id, error);
      throw error;
    }
  }
}

export async function startDryRunAgentRun(
  input: StartAgentRunInput,
): Promise<void> {
  return startAgentRun(input);
}

export async function resumeAgentRun(
  input: ResumeAgentRunInput,
): Promise<ResumeAgentRunResult> {
  const parsed = resumeAgentRunSchema.parse(input);
  if (activeResumeRunIds.has(parsed.id)) {
    throw new Error("Agent continuation is already running");
  }
  activeResumeRunIds.add(parsed.id);

  try {
    const preflightRun = await getAgentRunValidation(parsed.id);
    await assertProviderConnected(preflightRun.provider_key);

    const settlement = approvedContinuationSettlementSchema.parse(
      await invokeCommand<ApprovedContinuationSettlement>(
        "linkgo_agent_settle_approved_continuation",
        { input: { agentRunId: parsed.id } },
      ),
    );
    const run: AgentRunValidationRow = {
      ...preflightRun,
      id: settlement.agentRunId,
      campaign_id: settlement.campaignId,
      workflow_run_id: settlement.workflowRunId,
      workflow_step_id: settlement.workflowStepId,
      agent_role: settlement.agentRole,
      provider_key: settlement.providerKey,
      model_name: settlement.modelName,
      playbook_key: settlement.playbookKey,
      input_summary: settlement.inputSummary,
      input_context_json: JSON.stringify(settlement.inputContext),
      status: "running",
    };
    const provider = createConfiguredAgentProvider(
      settlement.providerKey,
      settlement.modelName || undefined,
    );
    const request: AgentModelRequest = {
      runId: settlement.agentRunId,
      campaignId: settlement.campaignId,
      workflowRunId: settlement.workflowRunId,
      workflowStepId: settlement.workflowStepId,
      agentRole: settlement.agentRole,
      inputSummary: settlement.inputSummary,
      messages: settlement.messages,
      ...(settlement.playbookKey
        ? {
            playbookKey: settlement.playbookKey,
            playbookLabel:
              getAgentPlaybook(settlement.playbookKey)?.label ??
              settlement.playbookKey,
          }
        : {}),
    };
    const result = await runAgentLoop({
      provider,
      tools: getAgentToolRegistryForRole(run.agent_role),
      request,
      maxTurns: 8,
      initialTurnCount: settlement.iterationCount,
      handledProviderToolCallIds: settlement.handledProviderToolCallIds,
      maxRetries: run.provider_key === "dry_run" ? 0 : 1,
      onProgress: (event) => recordProgressEvent(run.id, event),
    });

    // Native requires the continuation_ready checkpoint to still be active.
    const checkpointPhase = await persistAgentLoopResult(run.id, result, {
      allowContinuationRecovery: true,
    });

    return resumeAgentRunResultSchema.parse({
      status: result.status,
      outputSummary: result.outputSummary,
      errorMessage: result.errorMessage,
      checkpointPhase,
    });
  } finally {
    activeResumeRunIds.delete(parsed.id);
  }
}

/** Cancels natively: run, workflow projection, checkpoint and event together. */
export async function cancelAgentRun(
  input: CancelAgentRunInput,
): Promise<void> {
  const parsed = cancelAgentRunSchema.parse(input);
  await invokeAgentRunMutation("linkgo_agent_run_cancel", parsed);
}

if (IS_TEST && typeof window !== "undefined") {
  (
    window as unknown as {
      __LINKGO_AGENT_RUNTIME_TEST_API__?: {
        createAgentRun: typeof createAgentRun;
        startAgentRun: typeof startAgentRun;
        startDryRunAgentRun: typeof startDryRunAgentRun;
        resumeAgentRun: typeof resumeAgentRun;
        cancelAgentRun: typeof cancelAgentRun;
      };
    }
  ).__LINKGO_AGENT_RUNTIME_TEST_API__ = {
    createAgentRun,
    startAgentRun,
    startDryRunAgentRun,
    resumeAgentRun,
    cancelAgentRun,
  };
}
