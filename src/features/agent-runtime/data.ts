import {
  AGENT_TOOL_METADATA,
  agentToolRegistry,
  createDryRunProvider,
  runAgentLoop,
  type AgentProgressEvent,
  type AgentToolMetadata,
} from "@/agent";
import { getDb, type LinkgoDatabase } from "@/lib/db";
import { IS_TEST } from "@/lib/env";
import type { CampaignStatus } from "@/features/campaigns/types";
import {
  cancelAgentRunSchema,
  createAgentRunSchema,
  recordAgentRunEventSchema,
  recordAgentToolCallSchema,
  startAgentRunSchema,
} from "@/features/agent-runtime/schemas";
import type {
  AgentRun,
  AgentRunEvent,
  AgentRunWithDetails,
  AgentToolCall,
  AgentToolCallWithJson,
  CancelAgentRunInput,
  CreateAgentRunInput,
  RecordAgentRunEventInput,
  RecordAgentToolCallInput,
  StartAgentRunInput,
} from "@/features/agent-runtime/types";
import { listWorkflowRuns } from "@/workflows/data";
import type { WorkflowRunWithDetails } from "@/workflows/types";

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

function mapRunWithDetails(
  row: AgentRunRow,
  toolCalls: AgentToolCall[],
  events: AgentRunEvent[],
  workflowRun: WorkflowRunWithDetails | null,
): AgentRunWithDetails {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    workflow_run_id: row.workflow_run_id,
    workflow_step_id: row.workflow_step_id,
    agent_role: row.agent_role,
    provider_key: row.provider_key,
    model_name: row.model_name,
    status: row.status,
    input_summary: row.input_summary,
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
  const [toolCallRows, eventRows, workflowRuns] = await Promise.all([
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
    ),
  );
}

export async function createAgentRun(
  input: CreateAgentRunInput,
): Promise<number> {
  const parsed = createAgentRunSchema.parse(input);
  const db = await getDb();

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
        status,
        input_summary,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7, datetime('now'))`,
      [
        parsed.campaignId,
        workflow.workflowRunId,
        workflow.workflowStepId,
        parsed.agentRole,
        parsed.providerKey,
        parsed.modelName,
        parsed.inputSummary,
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

export async function startDryRunAgentRun(
  input: StartAgentRunInput,
): Promise<void> {
  const parsed = startAgentRunSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const run = await getAgentRunValidation(db, parsed.id);
    if (run.campaign_status === "archived")
      throw new Error("Campaign is archived");
    if (run.provider_key !== "dry_run") {
      throw new Error("Only dry-run agent runs can be started");
    }
    if (["completed", "cancelled"].includes(run.status)) {
      throw new Error("Terminal agent runs cannot be restarted");
    }
    if (run.status === "running")
      throw new Error("Agent run is already running");
    if (run.status === "waiting_approval") {
      throw new Error("Agent run is waiting for approval");
    }

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

    const provider = createDryRunProvider(run.model_name || "dry-run-local");
    const result = await runAgentLoop({
      provider,
      tools: agentToolRegistry,
      request: {
        runId: run.id,
        campaignId: run.campaign_id,
        workflowRunId: run.workflow_run_id,
        workflowStepId: run.workflow_step_id,
        agentRole: run.agent_role,
        inputSummary: run.input_summary,
        messages: [
          {
            role: "user",
            content: run.input_summary || "Validate runtime contracts locally.",
          },
        ],
      },
      maxIterations: 8,
      onProgress: (event) => recordProgressEvent(db, run.id, event),
    });

    for (const toolCall of result.toolCalls) {
      await insertAgentToolCall(db, {
        agentRunId: run.id,
        providerToolCallId: toolCall.providerToolCallId,
        toolName: toolCall.toolName,
        status: toolCall.status,
        requiresApproval: toolCall.requiresApproval,
        input: toolCall.input,
        output: toolCall.output,
        errorMessage: toolCall.errorMessage,
      });
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

    await db.execute("COMMIT");
  } catch (error) {
    await rollbackAgentRuntimeTransaction(db);
    throw error;
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

    await db.execute(
      `UPDATE agent_runs
      SET status = 'cancelled',
        completed_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = $1`,
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
        startDryRunAgentRun: typeof startDryRunAgentRun;
        cancelAgentRun: typeof cancelAgentRun;
      };
    }
  ).__LINKGO_AGENT_RUNTIME_TEST_API__ = {
    createAgentRun,
    startDryRunAgentRun,
    cancelAgentRun,
  };
}
