import { invoke } from "@tauri-apps/api/core";
import {
  AGENT_TOOL_METADATA,
  agentConversationSchema,
  agentToolRegistry,
  getAgentToolRegistryForRole,
  buildAgentMessages,
  createConfiguredAgentProvider,
  getAgentPlaybook,
  getDefaultPlaybookForRole,
  runAgentLoop,
  schedulePostInputSchema,
  type AgentLoopResult,
  type AgentModelRequest,
  type AgentPlaybookKey,
  type AgentProgressEvent,
  type AgentToolMetadata,
} from "@/agent";
import { getDb, type LinkgoDatabase } from "@/lib/db";
import { IS_TEST } from "@/lib/env";
import type { CampaignStatus } from "@/features/campaigns/types";
import { relevanceScoringContextSchema } from "@/features/candidate-queue/schemas";
import {
  assertSafetyKillSwitchOff,
  recordSafetyAuditEvent,
  upsertErrorQueueItem,
} from "@/features/safety/data";
import { getPlaybookPromptForRuntime } from "@/features/playbooks/data";
import { getAuthStatus } from "@/features/integrations/data";
import { isAgentProviderReady } from "@/features/agent-runtime/provider-readiness";
import {
  agentInputContextSchema,
  agentRunApprovalCheckpointSchema,
  approvedContinuationSettlementSchema,
  cancelAgentRunSchema,
  createAgentRunSchema,
  recordAgentRunEventSchema,
  recordAgentToolCallSchema,
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
  RecordAgentRunEventInput,
  RecordAgentToolCallInput,
  ResumeAgentRunInput,
  ResumeAgentRunResult,
  StartAgentRunInput,
} from "@/features/agent-runtime/types";
import {
  listWorkflowRuns,
  reconcileWorkflowAgentRunInTransaction,
} from "@/workflows/data";
import type { WorkflowRunWithDetails } from "@/workflows/types";
import {
  failNativeRelevanceScorerAgent,
  reconcileNativeRelevanceScorer,
  startNativeRelevanceScorer,
} from "@/workflows/relevance-scoring-commands";

interface CampaignStatusRow {
  id: number;
  status: CampaignStatus;
}

interface AgentRunRow extends AgentRun {
  campaign_name: string;
  campaign_status: CampaignStatus;
}

interface AgentRunValidationRow extends AgentRun {
  campaign_status: CampaignStatus;
}

type AgentRunApprovalCheckpointRow = Omit<
  AgentRunApprovalCheckpoint,
  "messages"
>;

interface ApprovalLinkRow {
  id: number;
  campaign_id: number;
  status: AgentRunApprovalCheckpoint["approval_status"];
}

const activeResumeRunIds = new Set<number>();

interface WorkflowRunValidationRow {
  id: number;
  campaign_id: number;
}

interface WorkflowStepValidationRow {
  id: number;
  workflow_run_id: number;
  campaign_id: number;
}

function getPlaceholders(ids: number[]): string {
  return ids.map((_, index) => `$${index + 1}`).join(", ");
}

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
    inputContext: parseAgentInputContext(row.input_context_json),
    toolCalls: toolCalls.map(parseToolCallJson),
    events,
  };
}

async function assertCampaignCanMutate(
  db: LinkgoDatabase,
  campaignId: number,
): Promise<void> {
  const rows = await db.select<CampaignStatusRow[]>(
    `SELECT id, status FROM campaigns WHERE id = $1 LIMIT 1`,
    [campaignId],
  );
  const campaign = rows[0];
  if (campaign === undefined) throw new Error("Campaign was not found");
  if (campaign.status === "archived") throw new Error("Campaign is archived");
}

async function validateWorkflowOwnership(
  db: LinkgoDatabase,
  campaignId: number,
  workflowRunId?: number,
  workflowStepId?: number,
): Promise<{ workflowRunId: number | null; workflowStepId: number | null }> {
  let nextWorkflowRunId = workflowRunId ?? null;
  if (workflowRunId !== undefined) {
    const rows = await db.select<WorkflowRunValidationRow[]>(
      `SELECT id, campaign_id FROM workflow_runs WHERE id = $1 LIMIT 1`,
      [workflowRunId],
    );
    const workflowRun = rows[0];
    if (workflowRun === undefined)
      throw new Error("Workflow run was not found");
    if (workflowRun.campaign_id !== campaignId) {
      throw new Error("Workflow run belongs to a different campaign");
    }
  }

  if (workflowStepId !== undefined) {
    const rows = await db.select<WorkflowStepValidationRow[]>(
      `SELECT
        ws.id,
        ws.workflow_run_id,
        wr.campaign_id
      FROM workflow_steps ws
      INNER JOIN workflow_runs wr ON wr.id = ws.workflow_run_id
      WHERE ws.id = $1
      LIMIT 1`,
      [workflowStepId],
    );
    const workflowStep = rows[0];
    if (workflowStep === undefined)
      throw new Error("Workflow step was not found");
    if (workflowStep.campaign_id !== campaignId) {
      throw new Error("Workflow step belongs to a different campaign");
    }
    if (
      nextWorkflowRunId !== null &&
      workflowStep.workflow_run_id !== nextWorkflowRunId
    ) {
      throw new Error("Workflow step belongs to a different workflow run");
    }
    nextWorkflowRunId = workflowStep.workflow_run_id;
  }

  return {
    workflowRunId: nextWorkflowRunId,
    workflowStepId: workflowStepId ?? null,
  };
}

async function getAgentRunValidation(
  db: LinkgoDatabase,
  id: number,
): Promise<AgentRunValidationRow> {
  const rows = await db.select<AgentRunValidationRow[]>(
    `SELECT
      ar.*,
      c.status AS campaign_status
    FROM agent_runs ar
    INNER JOIN campaigns c ON c.id = ar.campaign_id
    WHERE ar.id = $1
    LIMIT 1`,
    [id],
  );
  const run = rows[0];
  if (run === undefined) throw new Error("Agent run was not found");
  return run;
}

async function insertAgentRunEvent(
  db: LinkgoDatabase,
  input: RecordAgentRunEventInput,
): Promise<void> {
  const parsed = recordAgentRunEventSchema.parse(input);
  await db.execute(
    `INSERT INTO agent_run_events (
      agent_run_id,
      event_type,
      summary
    ) VALUES ($1, $2, $3)`,
    [parsed.agentRunId, parsed.eventType, parsed.summary],
  );
}

async function resolvePlaybookKeyForCreate(
  role: CreateAgentRunInput["agentRole"],
  requestedKey?: AgentPlaybookKey | "",
): Promise<AgentPlaybookKey | ""> {
  const candidateKey = requestedKey ?? getDefaultPlaybookForRole(role) ?? "";
  if (candidateKey === "") return "";

  const definition = getAgentPlaybook(candidateKey);
  if (!definition) throw new Error("Playbook was not found");
  const runtimePrompt = await getPlaybookPromptForRuntime(candidateKey);
  if (runtimePrompt === null) {
    if (requestedKey !== undefined) throw new Error("Playbook is disabled");
    return "";
  }
  if (!definition.compatibleRoles.includes(role)) {
    throw new Error("Playbook is not compatible with the selected agent role");
  }
  return definition.key;
}

async function insertAgentToolCall(
  db: LinkgoDatabase,
  input: RecordAgentToolCallInput,
): Promise<number> {
  const parsed = recordAgentToolCallSchema.parse(input);
  const tool = agentToolRegistry[parsed.toolName];
  const validatedInput = tool.inputSchema.parse(parsed.input);
  const validatedOutput =
    parsed.status === "completed"
      ? tool.outputSchema.parse(parsed.output ?? {})
      : (parsed.output ?? {});
  const result = await db.execute(
    `INSERT INTO agent_tool_calls (
      agent_run_id,
      provider_tool_call_id,
      tool_name,
      status,
      requires_approval,
      input_json,
      output_json,
      error_message,
      started_at,
      completed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, datetime('now'), CASE WHEN $4 IN ('completed', 'failed', 'rejected') THEN datetime('now') ELSE NULL END)`,
    [
      parsed.agentRunId,
      parsed.providerToolCallId,
      parsed.toolName,
      parsed.status,
      parsed.requiresApproval ? 1 : 0,
      JSON.stringify(validatedInput),
      JSON.stringify(validatedOutput),
      parsed.errorMessage,
    ],
  );
  return result.lastInsertId;
}

async function recordProgressEvent(
  db: LinkgoDatabase,
  agentRunId: number,
  event: AgentProgressEvent,
): Promise<void> {
  await insertAgentRunEvent(db, {
    agentRunId,
    eventType: event.type,
    summary: event.summary,
  });
}

export function listAgentToolContracts(): AgentToolMetadata[] {
  return [...AGENT_TOOL_METADATA];
}

export async function listAgentRuns(
  campaignId?: number,
): Promise<AgentRunWithDetails[]> {
  const db = await getDb();
  const values: unknown[] = [];
  const whereClause =
    campaignId === undefined ? "" : "WHERE ar.campaign_id = $1";
  if (campaignId !== undefined) values.push(campaignId);

  const runRows = await db.select<AgentRunRow[]>(
    `SELECT
      ar.*,
      c.name AS campaign_name,
      c.status AS campaign_status
    FROM agent_runs ar
    INNER JOIN campaigns c ON c.id = ar.campaign_id
    ${whereClause}
    ORDER BY CASE ar.status
      WHEN 'running' THEN 1
      WHEN 'waiting_approval' THEN 2
      WHEN 'queued' THEN 3
      WHEN 'failed' THEN 4
      WHEN 'completed' THEN 5
      WHEN 'cancelled' THEN 6
      ELSE 7
    END, datetime(ar.updated_at) DESC, ar.id DESC`,
    values,
  );

  if (runRows.length === 0) return [];

  const runIds = runRows.map((run) => run.id);
  const placeholders = getPlaceholders(runIds);
  const [toolCallRows, eventRows, checkpointRows, workflowRuns] =
    await Promise.all([
      db.select<AgentToolCall[]>(
        `SELECT * FROM agent_tool_calls
        WHERE agent_run_id IN (${placeholders})
        ORDER BY agent_run_id ASC, id ASC`,
        runIds,
      ),
      db.select<AgentRunEvent[]>(
        `SELECT * FROM agent_run_events
        WHERE agent_run_id IN (${placeholders})
        ORDER BY agent_run_id ASC, datetime(created_at) DESC, id DESC`,
        runIds,
      ),
      db.select<AgentRunApprovalCheckpointRow[]>(
        `SELECT cp.*, a.status AS approval_status
        FROM agent_run_approval_checkpoints cp
        INNER JOIN approvals a ON a.id = cp.approval_id
        WHERE cp.agent_run_id IN (${placeholders})`,
        runIds,
      ),
      listWorkflowRuns(campaignId),
    ]);

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

export async function createAgentRun(
  input: CreateAgentRunInput,
): Promise<number> {
  const parsed = createAgentRunSchema.parse(input);
  const db = await getDb();
  const playbookKey = await resolvePlaybookKeyForCreate(
    parsed.agentRole,
    parsed.playbookKey,
  );

  await db.execute("BEGIN TRANSACTION");
  try {
    await assertCampaignCanMutate(db, parsed.campaignId);
    const workflow = await validateWorkflowOwnership(
      db,
      parsed.campaignId,
      parsed.workflowRunId,
      parsed.workflowStepId,
    );

    const result = await db.execute(
      `INSERT INTO agent_runs (
        campaign_id,
        workflow_run_id,
        workflow_step_id,
        agent_role,
        provider_key,
        model_name,
        playbook_key,
        status,
        input_summary,
        input_context_json,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued', $8, $9, datetime('now'))`,
      [
        parsed.campaignId,
        workflow.workflowRunId,
        workflow.workflowStepId,
        parsed.agentRole,
        parsed.providerKey,
        parsed.modelName,
        playbookKey,
        parsed.inputSummary,
        JSON.stringify(parsed.inputContext),
      ],
    );

    await insertAgentRunEvent(db, {
      agentRunId: result.lastInsertId,
      eventType: "run_created",
      summary: `Agent run created for ${parsed.agentRole}.`,
    });

    await db.execute("COMMIT");
    return result.lastInsertId;
  } catch (error) {
    await rollbackAgentRuntimeTransaction(db);
    throw error;
  }
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

async function getApprovalLink(
  db: LinkgoDatabase,
  approvalId: number,
): Promise<ApprovalLinkRow> {
  const rows = await db.select<ApprovalLinkRow[]>(
    `SELECT id, campaign_id, status
    FROM approvals
    WHERE id = $1
    LIMIT 1`,
    [approvalId],
  );
  const approval = rows[0];
  if (approval === undefined) throw new Error("Linked approval was not found");
  return approval;
}

async function validateApprovalInterrupt(
  db: LinkgoDatabase,
  run: AgentRunValidationRow,
  result: AgentLoopResult,
): Promise<number | null> {
  if (result.status !== "waiting_approval") return null;
  const waitingCalls = result.toolCalls.filter(
    (toolCall) => toolCall.status === "waiting_approval",
  );
  if (waitingCalls.length !== 1) {
    throw new Error("Approval interrupt must contain one pending tool call");
  }
  const pendingCall = waitingCalls[0];
  if (pendingCall?.toolName !== "schedule_post") {
    throw new Error("Only schedule_post can create an approval checkpoint");
  }
  const scheduleInput = schedulePostInputSchema.parse(pendingCall.input);
  if (scheduleInput.campaignId !== run.campaign_id) {
    throw new Error("Schedule request belongs to a different campaign");
  }
  const approval = await getApprovalLink(db, scheduleInput.approvalId);
  if (approval.campaign_id !== run.campaign_id) {
    throw new Error("Linked approval belongs to a different campaign");
  }
  return approval.id;
}

function shouldRetainContinuationCheckpoint(result: AgentLoopResult): boolean {
  return (
    result.status === "failed" &&
    result.toolCalls.length === 0 &&
    !result.errorMessage.includes("maximum turn limit")
  );
}

function getPersistedCheckpointPhase(
  result: AgentLoopResult,
  options: { allowContinuationRecovery: boolean },
): ResumeAgentRunResult["checkpointPhase"] {
  if (result.status === "waiting_approval") return "waiting_approval";
  if (
    options.allowContinuationRecovery &&
    shouldRetainContinuationCheckpoint(result)
  ) {
    return "continuation_ready";
  }
  return null;
}

async function persistAgentLoopResult(
  db: LinkgoDatabase,
  run: AgentRunValidationRow,
  result: AgentLoopResult,
  options: { allowContinuationRecovery: boolean },
): Promise<void> {
  const conversation = agentConversationSchema.parse(result.conversation);
  const approvalId = await validateApprovalInterrupt(db, run, result);
  const checkpointPhase = getPersistedCheckpointPhase(result, options);
  let pendingToolCallId: number | null = null;

  for (const toolCall of result.toolCalls) {
    const toolCallId = await insertAgentToolCall(db, {
      agentRunId: run.id,
      providerToolCallId: toolCall.providerToolCallId,
      toolName: toolCall.toolName,
      status: toolCall.status,
      requiresApproval: toolCall.requiresApproval,
      input: toolCall.input,
      output: toolCall.output,
      errorMessage: toolCall.errorMessage,
    });
    if (toolCall.status === "waiting_approval") {
      pendingToolCallId = toolCallId;
    }
  }

  if (checkpointPhase === "waiting_approval") {
    if (approvalId === null || pendingToolCallId === null) {
      throw new Error("Approval checkpoint is missing its pending tool call");
    }
    await db.execute(
      `DELETE FROM agent_run_approval_checkpoints WHERE agent_run_id = $1`,
      [run.id],
    );
    await db.execute(
      `INSERT INTO agent_run_approval_checkpoints (
        agent_run_id,
        pending_tool_call_id,
        approval_id,
        phase,
        messages_json,
        iteration_count,
        updated_at
      ) VALUES ($1, $2, $3, 'waiting_approval', $4, $5, datetime('now'))`,
      [
        run.id,
        pendingToolCallId,
        approvalId,
        JSON.stringify(conversation),
        result.iterationCount,
      ],
    );
  } else if (checkpointPhase === "continuation_ready") {
    const checkpointResult = await db.execute(
      `UPDATE agent_run_approval_checkpoints
      SET phase = 'continuation_ready',
        messages_json = $1,
        iteration_count = $2,
        updated_at = datetime('now')
      WHERE agent_run_id = $3`,
      [JSON.stringify(conversation), result.iterationCount, run.id],
    );
    if (checkpointResult.rowsAffected !== 1) {
      throw new Error("Agent continuation checkpoint was lost");
    }
  } else {
    await db.execute(
      `DELETE FROM agent_run_approval_checkpoints WHERE agent_run_id = $1`,
      [run.id],
    );
  }

  await db.execute(
    `UPDATE agent_runs
    SET status = $1,
      output_summary = $2,
      error_message = $3,
      iteration_count = $4,
      completed_at = CASE WHEN $1 IN ('completed', 'failed', 'cancelled') THEN datetime('now') ELSE NULL END,
      updated_at = datetime('now')
    WHERE id = $5`,
    [
      result.status,
      result.outputSummary,
      result.errorMessage,
      result.iterationCount,
      run.id,
    ],
  );
  await reconcileWorkflowAgentRunInTransaction(db, {
    agentRunId: run.id,
    status: result.status,
    outputSummary: result.outputSummary,
    errorMessage: result.errorMessage,
  });

  if (result.status === "failed") {
    await recordSafetyAuditEvent(db, {
      campaignId: run.campaign_id,
      subjectType: "agent_run",
      subjectId: run.id,
      eventType: "agent_run_failed",
      severity: "warning",
      summary: result.errorMessage || "Agent run failed",
      metadata: { iterationCount: result.iterationCount },
    });
    await upsertErrorQueueItem(db, {
      campaignId: run.campaign_id,
      sourceType: "agent_run",
      sourceId: run.id,
      title: "Agent run failed",
      detail: result.errorMessage || "Agent run failed",
      severity: "error",
    });
  }
}

async function failAgentRunAfterPersistenceError(
  db: LinkgoDatabase,
  runId: number,
  error: unknown,
): Promise<void> {
  const errorMessage =
    error instanceof Error ? error.message : "Agent result persistence failed";
  try {
    await db.execute("BEGIN IMMEDIATE");
    await db.execute(
      `UPDATE agent_runs
      SET status = 'failed',
        error_message = $1,
        completed_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = $2 AND status = 'running'`,
      [errorMessage, runId],
    );
    await insertAgentRunEvent(db, {
      agentRunId: runId,
      eventType: "run_failed",
      summary: errorMessage,
    });
    await db.execute("COMMIT");
  } catch {
    await rollbackAgentRuntimeTransaction(db);
  }
}

export async function startAgentRun(input: StartAgentRunInput): Promise<void> {
  const parsed = startAgentRunSchema.parse(input);
  const db = await getDb();

  const run = await getAgentRunValidation(db, parsed.id);
  if (run.campaign_status === "archived")
    throw new Error("Campaign is archived");
  if (["completed", "cancelled"].includes(run.status)) {
    throw new Error("Terminal agent runs cannot be restarted");
  }
  if (run.status === "running") throw new Error("Agent run is already running");
  if (run.status === "waiting_approval") {
    throw new Error("Agent run is waiting for approval");
  }
  const checkpointRows = await db.select<{ agent_run_id: number }[]>(
    `SELECT agent_run_id FROM agent_run_approval_checkpoints
    WHERE agent_run_id = $1
    LIMIT 1`,
    [run.id],
  );
  if (checkpointRows.length > 0) {
    throw new Error("Use approval continuation recovery for this agent run");
  }
  await assertProviderConnected(run.provider_key);
  await assertSafetyKillSwitchOff(db, {
    campaignId: run.campaign_id,
    subjectType: "agent_run",
    subjectId: run.id,
    summary: "Agent run start",
  });

  const provider = createConfiguredAgentProvider(
    run.provider_key,
    run.model_name || undefined,
  );
  const runtimePlaybook = await getPlaybookPromptForRuntime(run.playbook_key);
  const inputContext = parseAgentInputContext(run.input_context_json);
  const isPlannerScorer =
    run.agent_role === "scorer" &&
    relevanceScoringContextSchema.safeParse(inputContext).success;

  if (isPlannerScorer) {
    await startNativeRelevanceScorer(run.id);
  } else {
    await db.execute("BEGIN IMMEDIATE");
    try {
      const claimResult = await db.execute(
        `UPDATE agent_runs
        SET status = 'running',
          started_at = COALESCE(started_at, datetime('now')),
          completed_at = NULL,
          error_message = '',
          updated_at = datetime('now')
        WHERE id = $1
          AND status IN ('queued', 'failed')`,
        [parsed.id],
      );
      if (claimResult.rowsAffected !== 1) {
        throw new Error("Agent run could not be claimed for start");
      }
      await recordSafetyAuditEvent(db, {
        campaignId: run.campaign_id,
        subjectType: "agent_run",
        subjectId: run.id,
        eventType: "agent_run_started",
        severity: "info",
        summary: "Agent run started",
        metadata: { agentRole: run.agent_role, providerKey: run.provider_key },
      });
      await db.execute("COMMIT");
    } catch (error) {
      await rollbackAgentRuntimeTransaction(db);
      throw error;
    }
  }
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
    onProgress: (event) => recordProgressEvent(db, run.id, event),
  });

  if (isPlannerScorer) {
    try {
      await reconcileNativeRelevanceScorer(run.id, result);
    } catch (error) {
      await failNativeRelevanceScorerAgent(run.id, error);
      throw error;
    }
  } else {
    await db.execute("BEGIN IMMEDIATE");
    try {
      await persistAgentLoopResult(db, run, result, {
        allowContinuationRecovery: false,
      });
      await db.execute("COMMIT");
    } catch (error) {
      await rollbackAgentRuntimeTransaction(db);
      await failAgentRunAfterPersistenceError(db, run.id, error);
      throw error;
    }
  }
}

export async function startDryRunAgentRun(
  input: StartAgentRunInput,
): Promise<void> {
  return startAgentRun(input);
}

export async function rejectAgentRunsForApprovalInTransaction(
  db: LinkgoDatabase,
  approvalId: number,
  reviewerContext: string,
): Promise<void> {
  const checkpointRows = await db.select<
    Array<{ agent_run_id: number; pending_tool_call_id: number }>
  >(
    `SELECT agent_run_id, pending_tool_call_id
    FROM agent_run_approval_checkpoints
    WHERE approval_id = $1`,
    [approvalId],
  );
  const detail =
    reviewerContext.trim() || "Approval rejected by operator review";

  for (const checkpoint of checkpointRows) {
    await db.execute(
      `UPDATE agent_tool_calls
      SET status = 'rejected',
        error_message = $1,
        completed_at = datetime('now')
      WHERE id = $2
        AND status IN ('waiting_approval', 'running')`,
      [`Approval rejected: ${detail}`, checkpoint.pending_tool_call_id],
    );
    const errorMessage = `Approval rejected: ${detail}`;
    await db.execute(
      `UPDATE agent_runs
      SET status = 'cancelled',
        error_message = $1,
        completed_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = $2`,
      [errorMessage, checkpoint.agent_run_id],
    );
    await reconcileWorkflowAgentRunInTransaction(db, {
      agentRunId: checkpoint.agent_run_id,
      status: "cancelled",
      outputSummary: "",
      errorMessage,
    });
    await insertAgentRunEvent(db, {
      agentRunId: checkpoint.agent_run_id,
      eventType: "run_cancelled",
      summary: `Agent run cancelled after approval rejection: ${detail}`,
    });
  }

  await db.execute(
    `DELETE FROM agent_run_approval_checkpoints WHERE approval_id = $1`,
    [approvalId],
  );
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
    const db = await getDb();
    const preflightRun = await getAgentRunValidation(db, parsed.id);
    await assertProviderConnected(preflightRun.provider_key);

    const settlement = approvedContinuationSettlementSchema.parse(
      await invoke<ApprovedContinuationSettlement>(
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
      onProgress: (event) => recordProgressEvent(db, run.id, event),
    });

    const persistOptions = { allowContinuationRecovery: true };
    await db.execute("BEGIN IMMEDIATE");
    try {
      const activeCheckpointRows = await db.select<
        Array<{ agent_run_id: number }>
      >(
        `SELECT agent_run_id FROM agent_run_approval_checkpoints
        WHERE agent_run_id = $1 AND phase = 'continuation_ready'`,
        [run.id],
      );
      if (activeCheckpointRows.length !== 1) {
        throw new Error("Agent continuation checkpoint is no longer active");
      }
      await persistAgentLoopResult(db, run, result, persistOptions);
      await db.execute("COMMIT");
    } catch (error) {
      await rollbackAgentRuntimeTransaction(db);
      throw error;
    }

    return resumeAgentRunResultSchema.parse({
      status: result.status,
      outputSummary: result.outputSummary,
      errorMessage: result.errorMessage,
      checkpointPhase: getPersistedCheckpointPhase(result, persistOptions),
    });
  } finally {
    activeResumeRunIds.delete(parsed.id);
  }
}

export async function cancelAgentRun(
  input: CancelAgentRunInput,
): Promise<void> {
  const parsed = cancelAgentRunSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const run = await getAgentRunValidation(db, parsed.id);
    if (run.campaign_status === "archived")
      throw new Error("Campaign is archived");
    if (run.status === "completed") {
      throw new Error("Completed agent runs cannot be cancelled");
    }

    const errorMessage = run.error_message || "Agent run cancelled";
    await db.execute(
      `UPDATE agent_runs
      SET status = 'cancelled',
        error_message = $1,
        completed_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = $2`,
      [errorMessage, parsed.id],
    );
    await reconcileWorkflowAgentRunInTransaction(db, {
      agentRunId: run.id,
      status: "cancelled",
      outputSummary: run.output_summary,
      errorMessage,
    });
    await db.execute(
      `DELETE FROM agent_run_approval_checkpoints WHERE agent_run_id = $1`,
      [parsed.id],
    );
    await insertAgentRunEvent(db, {
      agentRunId: parsed.id,
      eventType: "run_cancelled",
      summary: "Agent run cancelled",
    });
    await db.execute("COMMIT");
  } catch (error) {
    await rollbackAgentRuntimeTransaction(db);
    throw error;
  }
}

export async function recordAgentRunEvent(
  input: RecordAgentRunEventInput,
): Promise<void> {
  const db = await getDb();
  await insertAgentRunEvent(db, input);
}

export async function recordAgentToolCall(
  input: RecordAgentToolCallInput,
): Promise<number> {
  const db = await getDb();
  return insertAgentToolCall(db, input);
}

export async function rollbackAgentRuntimeTransaction(
  db: LinkgoDatabase,
): Promise<void> {
  try {
    await db.execute("ROLLBACK");
  } catch {
    // Preserve the original transaction failure.
  }
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
