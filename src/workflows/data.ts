import { getDb, type LinkgoDatabase } from "@/lib/db";
import { IS_TEST } from "@/lib/env";
import type { AgentRole, AgentRunStatus } from "@/agent/types";
import type { CampaignStatus } from "@/features/campaigns/types";
import {
  addWorkflowNoteSchema,
  cancelWorkflowRunSchema,
  createWorkflowArtifactSchema,
  createWorkflowRunSchema,
  setWorkflowStepStatusSchema,
  startWorkflowRunSchema,
} from "@/workflows/schemas";
import {
  CONTENT_PIPELINE_STEPS,
  type AddWorkflowNoteInput,
  type CancelWorkflowRunInput,
  type CreateWorkflowArtifactInput,
  type CreateWorkflowRunInput,
  type StartWorkflowRunInput,
  type SetWorkflowStepStatusInput,
  type WorkflowArtifact,
  type WorkflowArtifactType,
  type WorkflowArtifactWithDetails,
  type WorkflowEvent,
  type WorkflowEventType,
  type WorkflowRun,
  type WorkflowRunStatus,
  type WorkflowRunWithDetails,
  type WorkflowStep,
  type WorkflowStepKey,
  type WorkflowStepStatus,
} from "@/workflows/types";

interface CampaignStatusRow {
  id: number;
  status: CampaignStatus;
}

interface WorkflowRunRow extends WorkflowRun {
  campaign_name: string;
  campaign_status: CampaignStatus;
  autopilot_plan_id: number | null;
  source_import_batch_id: number | null;
}

interface WorkflowRunValidationRow extends WorkflowRun {
  campaign_status: CampaignStatus;
}

interface WorkflowStepValidationRow extends WorkflowStep {
  run_status: WorkflowRunStatus;
  campaign_id: number;
  campaign_status: CampaignStatus;
}

interface WorkflowArtifactRow extends WorkflowArtifact {
  agent_role: string | null;
  agent_status: string | null;
}

interface WorkflowArtifactOwnershipRow {
  campaign_id: number;
  workflow_run_id: number | null;
  workflow_step_id: number | null;
}

interface WorkflowAgentRunLinkRow {
  workflow_run_id: number | null;
  workflow_step_id: number | null;
}

interface WorkflowLinkedAgentRow {
  id: number;
  status: AgentRunStatus;
  output_summary: string;
  error_message: string;
}

export interface ReconcileWorkflowAgentRunInput {
  agentRunId: number;
  status: AgentRunStatus;
  outputSummary: string;
  errorMessage: string;
}
const TERMINAL_RUN_STATUSES: WorkflowRunStatus[] = ["completed", "cancelled"];
const FINISHED_STEP_STATUSES: WorkflowStepStatus[] = ["completed", "skipped"];

const STEP_TRANSITIONS: Record<WorkflowStepStatus, WorkflowStepStatus[]> = {
  pending: ["running", "skipped"],
  running: ["completed", "waiting_approval", "blocked", "failed", "skipped"],
  waiting_approval: ["completed", "blocked", "failed", "running"],
  blocked: ["running", "failed", "skipped"],
  failed: ["running", "blocked", "skipped"],
  completed: ["running"],
  skipped: ["running"],
};

function getPlaceholders(ids: number[]): string {
  return ids.map((_, index) => `$${index + 1}`).join(", ");
}

function mapRunWithDetails(
  row: WorkflowRunRow,
  steps: WorkflowStep[],
  events: WorkflowEvent[],
  artifacts: WorkflowArtifactWithDetails[],
): WorkflowRunWithDetails {
  const completedStepCount = steps.filter((step) =>
    FINISHED_STEP_STATUSES.includes(step.status),
  ).length;
  const totalStepCount = steps.length;
  const currentStep =
    steps.find((step) => step.step_key === row.current_step_key) ?? null;
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    workflow_type: row.workflow_type,
    title: row.title,
    status: row.status,
    current_step_key: row.current_step_key,
    context_summary: row.context_summary,
    started_at: row.started_at,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    autopilot_plan_id: row.autopilot_plan_id,
    source_import_batch_id: row.source_import_batch_id,
    campaign: {
      id: row.campaign_id,
      name: row.campaign_name,
      status: row.campaign_status,
    },
    steps,
    events,
    artifacts,
    completedStepCount,
    totalStepCount,
    progressPercent:
      totalStepCount === 0
        ? 0
        : Math.round((completedStepCount / totalStepCount) * 100),
    currentStep,
    latestEvent: events[0] ?? null,
  };
}

function assertStepTransition(
  currentStatus: WorkflowStepStatus,
  nextStatus: WorkflowStepStatus,
): void {
  if (!STEP_TRANSITIONS[currentStatus].includes(nextStatus)) {
    throw new Error("Unsupported workflow step transition");
  }
}

function getStepEventType(
  currentStatus: WorkflowStepStatus,
  nextStatus: WorkflowStepStatus,
): WorkflowEventType {
  if (nextStatus === "running") {
    return currentStatus === "pending" ? "step_started" : "step_resumed";
  }
  if (nextStatus === "waiting_approval") return "step_waiting_approval";
  if (nextStatus === "blocked") return "step_blocked";
  if (nextStatus === "completed") return "step_completed";
  if (nextStatus === "failed") return "step_failed";
  if (nextStatus === "skipped") return "step_skipped";
  return "note_added";
}

function getStepEventSummary(
  step: WorkflowStep,
  nextStatus: WorkflowStepStatus,
): string {
  if (nextStatus === "running") {
    return step.status === "pending"
      ? `${step.title} started`
      : `${step.title} resumed`;
  }
  if (nextStatus === "waiting_approval") {
    return `${step.title} waiting for approval`;
  }
  if (nextStatus === "blocked") return `${step.title} blocked`;
  if (nextStatus === "completed") return `${step.title} completed`;
  if (nextStatus === "failed") return `${step.title} failed`;
  if (nextStatus === "skipped") return `${step.title} skipped`;
  return `${step.title} updated`;
}

function getCurrentStepKey(steps: WorkflowStep[]): WorkflowStepKey {
  return (
    steps.find((step) => !FINISHED_STEP_STATUSES.includes(step.status))
      ?.step_key ?? "measure"
  );
}

function getRunStatusFromSteps(steps: WorkflowStep[]): WorkflowRunStatus {
  const currentStep = steps.find(
    (step) => !FINISHED_STEP_STATUSES.includes(step.status),
  );
  if (currentStep?.status === "waiting_approval") return "waiting_approval";
  if (currentStep?.status === "blocked") return "blocked";
  if (currentStep?.status === "failed") return "failed";
  if (currentStep === undefined) return "completed";
  return "running";
}

async function loadWorkflowSteps(
  db: LinkgoDatabase,
  workflowRunId: number,
): Promise<WorkflowStep[]> {
  return db.select<WorkflowStep[]>(
    `SELECT * FROM workflow_steps
    WHERE workflow_run_id = $1
    ORDER BY sort_order ASC`,
    [workflowRunId],
  );
}

async function insertWorkflowEvent(
  db: LinkgoDatabase,
  workflowRunId: number,
  workflowStepId: number | null,
  eventType: WorkflowEventType,
  summary: string,
): Promise<void> {
  await db.execute(
    `INSERT INTO workflow_events (
      workflow_run_id,
      workflow_step_id,
      event_type,
      summary
    ) VALUES ($1, $2, $3, $4)`,
    [workflowRunId, workflowStepId, eventType, summary],
  );
}

async function getWorkflowRunValidation(
  db: LinkgoDatabase,
  id: number,
): Promise<WorkflowRunValidationRow> {
  const rows = await db.select<WorkflowRunValidationRow[]>(
    `SELECT
      wr.*,
      c.status AS campaign_status
    FROM workflow_runs wr
    INNER JOIN campaigns c ON c.id = wr.campaign_id
    WHERE wr.id = $1
    LIMIT 1`,
    [id],
  );
  const run = rows[0];
  if (run === undefined) throw new Error("Workflow run was not found");
  return run;
}

async function updateRunFromSteps(
  db: LinkgoDatabase,
  workflowRunId: number,
  previousRunStatus: WorkflowRunStatus,
): Promise<void> {
  const steps = await loadWorkflowSteps(db, workflowRunId);
  const nextStatus = getRunStatusFromSteps(steps);
  const currentStepKey = getCurrentStepKey(steps);
  await db.execute(
    `UPDATE workflow_runs
    SET status = $1,
      current_step_key = $2,
      started_at = CASE WHEN $1 = 'running' THEN COALESCE(started_at, datetime('now')) ELSE started_at END,
      completed_at = CASE WHEN $1 = 'completed' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END,
      updated_at = datetime('now')
    WHERE id = $3`,
    [nextStatus, currentStepKey, workflowRunId],
  );
  if (nextStatus === "completed" && previousRunStatus !== "completed") {
    await insertWorkflowEvent(
      db,
      workflowRunId,
      null,
      "run_completed",
      "Workflow run completed",
    );
  }
}

async function startNextPendingWorkflowStep(
  db: LinkgoDatabase,
  step: WorkflowStep,
): Promise<void> {
  const steps = await loadWorkflowSteps(db, step.workflow_run_id);
  const nextStep = steps.find(
    (candidate) =>
      candidate.sort_order === step.sort_order + 1 &&
      candidate.status === "pending",
  );
  if (nextStep === undefined) return;

  assertStepTransition(nextStep.status, "running");
  await db.execute(
    `UPDATE workflow_steps
    SET status = 'running',
      started_at = COALESCE(started_at, datetime('now')),
      completed_at = NULL,
      updated_at = datetime('now')
    WHERE id = $1`,
    [nextStep.id],
  );
  await insertWorkflowEvent(
    db,
    step.workflow_run_id,
    nextStep.id,
    "step_started",
    `${nextStep.title} started`,
  );
}

function getWorkflowProjectionFromAgentStatus(status: AgentRunStatus): {
  stepStatus: WorkflowStepStatus;
  executionStatus:
    | "running"
    | "completed"
    | "waiting_approval"
    | "failed"
    | "blocked"
    | "cancelled";
} {
  if (status === "completed") {
    return { stepStatus: "completed", executionStatus: "completed" };
  }
  if (status === "waiting_approval") {
    return {
      stepStatus: "waiting_approval",
      executionStatus: "waiting_approval",
    };
  }
  if (status === "failed") {
    return { stepStatus: "failed", executionStatus: "failed" };
  }
  if (status === "cancelled") {
    return { stepStatus: "blocked", executionStatus: "cancelled" };
  }
  return { stepStatus: "running", executionStatus: "running" };
}

export async function reconcileWorkflowAgentRunInTransaction(
  db: LinkgoDatabase,
  input: ReconcileWorkflowAgentRunInput,
): Promise<boolean> {
  const linkRows = await db.select<WorkflowAgentRunLinkRow[]>(
    `SELECT workflow_run_id, workflow_step_id
    FROM agent_runs
    WHERE id = $1
    LIMIT 1`,
    [input.agentRunId],
  );
  const link = linkRows[0];
  if (
    link?.workflow_run_id === null ||
    link?.workflow_run_id === undefined ||
    link.workflow_step_id === null
  ) {
    return false;
  }

  const stepRows = await db.select<WorkflowStepValidationRow[]>(
    `SELECT
      ws.*,
      wr.status AS run_status,
      wr.campaign_id,
      c.status AS campaign_status
    FROM workflow_steps ws
    INNER JOIN workflow_runs wr ON wr.id = ws.workflow_run_id
    INNER JOIN campaigns c ON c.id = wr.campaign_id
    WHERE ws.id = $1
    LIMIT 1`,
    [link.workflow_step_id],
  );
  const step = stepRows[0];
  if (
    step === undefined ||
    step.workflow_run_id !== link.workflow_run_id ||
    step.run_status === "cancelled"
  ) {
    return false;
  }

  const projection = getWorkflowProjectionFromAgentStatus(input.status);
  await db.execute(
    `UPDATE workflow_step_executions
    SET status = $1,
      error_summary = $2,
      completed_at = CASE
        WHEN $1 IN ('completed', 'failed', 'blocked', 'cancelled') THEN COALESCE(completed_at, datetime('now'))
        ELSE NULL
      END,
      updated_at = datetime('now')
    WHERE agent_run_id = $3
      AND workflow_step_id = $4`,
    [projection.executionStatus, input.errorMessage, input.agentRunId, step.id],
  );

  if (step.status !== projection.stepStatus) {
    assertStepTransition(step.status, projection.stepStatus);
  }
  await db.execute(
    `UPDATE workflow_steps
    SET status = $1,
      output_summary = $2,
      error_message = $3,
      started_at = CASE WHEN $1 = 'running' THEN COALESCE(started_at, datetime('now')) ELSE started_at END,
      completed_at = CASE
        WHEN $1 IN ('completed', 'skipped') THEN COALESCE(completed_at, datetime('now'))
        WHEN $1 IN ('running', 'blocked', 'failed', 'waiting_approval') THEN NULL
        ELSE completed_at
      END,
      updated_at = datetime('now')
    WHERE id = $4`,
    [projection.stepStatus, input.outputSummary, input.errorMessage, step.id],
  );

  if (step.status !== projection.stepStatus) {
    await insertWorkflowEvent(
      db,
      step.workflow_run_id,
      step.id,
      getStepEventType(step.status, projection.stepStatus),
      getStepEventSummary(step, projection.stepStatus),
    );
    if (projection.stepStatus === "completed") {
      await startNextPendingWorkflowStep(db, step);
    }
  }

  await updateRunFromSteps(db, step.workflow_run_id, step.run_status);
  return true;
}

export async function listWorkflowRuns(
  campaignId?: number,
): Promise<WorkflowRunWithDetails[]> {
  const db = await getDb();
  const values: unknown[] = [];
  const whereClause =
    campaignId === undefined ? "" : "WHERE wr.campaign_id = $1";
  if (campaignId !== undefined) values.push(campaignId);

  const runRows = await db.select<WorkflowRunRow[]>(
    `SELECT
      wr.*,
      c.name AS campaign_name,
      c.status AS campaign_status,
      ap.id AS autopilot_plan_id,
      ap.source_import_batch_id
    FROM workflow_runs wr
    INNER JOIN campaigns c ON c.id = wr.campaign_id
    LEFT JOIN autopilot_plans ap ON ap.workflow_run_id = wr.id
    ${whereClause}
    ORDER BY CASE wr.status
      WHEN 'running' THEN 1
      WHEN 'waiting_approval' THEN 2
      WHEN 'blocked' THEN 3
      WHEN 'queued' THEN 4
      WHEN 'failed' THEN 5
      WHEN 'completed' THEN 6
      WHEN 'cancelled' THEN 7
      ELSE 8
    END, datetime(wr.updated_at) DESC, wr.id DESC`,
    values,
  );

  if (runRows.length === 0) return [];

  const runIds = runRows.map((run) => run.id);
  const placeholders = getPlaceholders(runIds);
  const [stepRows, eventRows, artifactRows] = await Promise.all([
    db.select<WorkflowStep[]>(
      `SELECT * FROM workflow_steps
      WHERE workflow_run_id IN (${placeholders})
      ORDER BY workflow_run_id ASC, sort_order ASC`,
      runIds,
    ),
    db.select<WorkflowEvent[]>(
      `SELECT * FROM workflow_events
      WHERE workflow_run_id IN (${placeholders})
      ORDER BY workflow_run_id ASC, datetime(created_at) DESC, id DESC`,
      runIds,
    ),
    db.select<WorkflowArtifactRow[]>(
      `SELECT
        wa.*,
        ar.agent_role,
        ar.status AS agent_status
      FROM workflow_artifacts wa
      LEFT JOIN agent_runs ar
        ON wa.artifact_type = 'agent_run'
        AND ar.id = wa.artifact_id
      WHERE wa.workflow_run_id IN (${placeholders})
      ORDER BY wa.workflow_run_id ASC, wa.id ASC`,
      runIds,
    ),
  ]);

  const stepsByRunId = new Map<number, WorkflowStep[]>();
  for (const step of stepRows) {
    const steps = stepsByRunId.get(step.workflow_run_id) ?? [];
    steps.push(step);
    stepsByRunId.set(step.workflow_run_id, steps);
  }

  const eventsByRunId = new Map<number, WorkflowEvent[]>();
  for (const event of eventRows) {
    const events = eventsByRunId.get(event.workflow_run_id) ?? [];
    events.push(event);
    eventsByRunId.set(event.workflow_run_id, events);
  }

  const artifactsByRunId = new Map<number, WorkflowArtifactWithDetails[]>();
  for (const artifact of artifactRows) {
    const artifacts = artifactsByRunId.get(artifact.workflow_run_id) ?? [];
    artifacts.push(artifact);
    artifactsByRunId.set(artifact.workflow_run_id, artifacts);
  }

  return runRows.map((row) =>
    mapRunWithDetails(
      row,
      stepsByRunId.get(row.id) ?? [],
      eventsByRunId.get(row.id) ?? [],
      artifactsByRunId.get(row.id) ?? [],
    ),
  );
}

export async function createWorkflowRun(
  input: CreateWorkflowRunInput,
): Promise<number> {
  const parsed = createWorkflowRunSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const campaignRows = await db.select<CampaignStatusRow[]>(
      `SELECT id, status FROM campaigns WHERE id = $1 LIMIT 1`,
      [parsed.campaignId],
    );
    const campaign = campaignRows[0];
    if (campaign === undefined) throw new Error("Campaign was not found");
    if (campaign.status === "archived") throw new Error("Campaign is archived");

    const result = await db.execute(
      `INSERT INTO workflow_runs (
        campaign_id,
        workflow_type,
        title,
        status,
        current_step_key,
        context_summary,
        updated_at
      ) VALUES ($1, 'content_pipeline', $2, 'queued', 'research', $3, datetime('now'))`,
      [parsed.campaignId, parsed.title, parsed.contextSummary],
    );

    for (const step of CONTENT_PIPELINE_STEPS) {
      await db.execute(
        `INSERT INTO workflow_steps (
          workflow_run_id,
          step_key,
          title,
          description,
          sort_order,
          status,
          output_summary,
          error_message,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'pending', '', '', datetime('now'))`,
        [
          result.lastInsertId,
          step.step_key,
          step.title,
          step.description,
          step.sort_order,
        ],
      );
    }

    await insertWorkflowEvent(
      db,
      result.lastInsertId,
      null,
      "run_created",
      `Run created: ${parsed.title}`,
    );

    await db.execute("COMMIT");
    return result.lastInsertId;
  } catch (error) {
    await rollbackWorkflowTransaction(db);
    throw error;
  }
}

export async function startWorkflowRun(
  input: StartWorkflowRunInput,
): Promise<void> {
  const parsed = startWorkflowRunSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const run = await getWorkflowRunValidation(db, parsed.id);
    if (run.campaign_status === "archived")
      throw new Error("Campaign is archived");
    if (TERMINAL_RUN_STATUSES.includes(run.status)) {
      throw new Error("Terminal workflow runs cannot be started");
    }

    await db.execute(
      `UPDATE workflow_runs
      SET status = 'running',
        started_at = COALESCE(started_at, datetime('now')),
        updated_at = datetime('now')
      WHERE id = $1`,
      [parsed.id],
    );

    await insertWorkflowEvent(
      db,
      parsed.id,
      null,
      "run_started",
      run.started_at === null ? "Workflow run started" : "Workflow run resumed",
    );

    const steps = await loadWorkflowSteps(db, parsed.id);
    const resumableStep =
      steps.find(
        (step) =>
          step.step_key === run.current_step_key &&
          ["blocked", "failed"].includes(step.status),
      ) ?? steps.find((step) => ["blocked", "failed"].includes(step.status));

    if (resumableStep !== undefined) {
      await db.execute(
        `UPDATE workflow_steps
        SET status = 'running',
          started_at = COALESCE(started_at, datetime('now')),
          completed_at = NULL,
          updated_at = datetime('now')
        WHERE id = $1`,
        [resumableStep.id],
      );
      await insertWorkflowEvent(
        db,
        parsed.id,
        resumableStep.id,
        "step_resumed",
        `${resumableStep.title} resumed`,
      );
    } else {
      const hasActiveStep = steps.some((step) =>
        ["running", "waiting_approval"].includes(step.status),
      );
      if (!hasActiveStep) {
        const firstRunnableStep =
          steps.find(
            (step) =>
              step.step_key === run.current_step_key &&
              step.status === "pending",
          ) ?? steps.find((step) => step.status === "pending");
        if (firstRunnableStep !== undefined) {
          await db.execute(
            `UPDATE workflow_steps
            SET status = 'running',
              started_at = COALESCE(started_at, datetime('now')),
              completed_at = NULL,
              updated_at = datetime('now')
            WHERE id = $1`,
            [firstRunnableStep.id],
          );
          await insertWorkflowEvent(
            db,
            parsed.id,
            firstRunnableStep.id,
            "step_started",
            `${firstRunnableStep.title} started`,
          );
        }
      }
    }

    await db.execute("COMMIT");
  } catch (error) {
    await rollbackWorkflowTransaction(db);
    throw error;
  }
}

async function getWorkflowArtifactOwnership(
  db: LinkgoDatabase,
  artifactType: WorkflowArtifactType,
  artifactId: number,
  workflowStepId: number | undefined,
  workflowRunId: number,
  campaignId: number,
  campaignStatus: CampaignStatus,
): Promise<WorkflowArtifactOwnershipRow> {
  if (campaignStatus === "archived") throw new Error("Campaign is archived");

  if (workflowStepId !== undefined) {
    const stepRows = await db.select<WorkflowArtifactOwnershipRow[]>(
      `SELECT
        wr.campaign_id,
        ws.workflow_run_id,
        NULL AS workflow_step_id
      FROM workflow_steps ws
      INNER JOIN workflow_runs wr ON wr.id = ws.workflow_run_id
      WHERE ws.id = $1
      LIMIT 1`,
      [workflowStepId],
    );
    const step = stepRows[0];
    if (step === undefined) throw new Error("Workflow step was not found");
    if (step.workflow_run_id !== workflowRunId) {
      throw new Error("Workflow step belongs to a different workflow run");
    }
    if (step.campaign_id !== campaignId) {
      throw new Error("Workflow step belongs to a different campaign");
    }
  }

  const artifactRows = await db.select<WorkflowArtifactOwnershipRow[]>(
    `SELECT
      campaign_id,
      workflow_run_id,
      workflow_step_id
    FROM agent_runs
    WHERE id = $1
      AND $2 = 'agent_run'
    LIMIT 1`,
    [artifactId, artifactType],
  );
  const artifact = artifactRows[0];
  if (artifact === undefined)
    throw new Error("Agent run artifact was not found");
  if (artifact.campaign_id !== campaignId) {
    throw new Error("Artifact belongs to a different campaign");
  }
  if (
    artifact.workflow_run_id !== null &&
    artifact.workflow_run_id !== workflowRunId
  ) {
    throw new Error("Artifact belongs to a different workflow run");
  }
  if (
    workflowStepId !== undefined &&
    artifact.workflow_step_id !== null &&
    artifact.workflow_step_id !== workflowStepId
  ) {
    throw new Error("Artifact belongs to a different workflow step");
  }

  return artifact;
}

export async function createWorkflowArtifact(
  input: CreateWorkflowArtifactInput,
): Promise<number> {
  const parsed = createWorkflowArtifactSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const run = await getWorkflowRunValidation(db, parsed.workflowRunId);
    await getWorkflowArtifactOwnership(
      db,
      parsed.artifactType,
      parsed.artifactId,
      parsed.workflowStepId,
      parsed.workflowRunId,
      run.campaign_id,
      run.campaign_status,
    );

    await db.execute(
      `INSERT INTO workflow_artifacts (
        workflow_run_id,
        workflow_step_id,
        artifact_type,
        artifact_id,
        summary,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, datetime('now'))
      ON CONFLICT(workflow_run_id, artifact_type, artifact_id) DO UPDATE SET
        workflow_step_id = excluded.workflow_step_id,
        summary = excluded.summary,
        updated_at = datetime('now')`,
      [
        parsed.workflowRunId,
        parsed.workflowStepId ?? null,
        parsed.artifactType,
        parsed.artifactId,
        parsed.summary,
      ],
    );
    const artifactRows = await db.select<Array<{ id: number }>>(
      `SELECT id
      FROM workflow_artifacts
      WHERE workflow_run_id = $1
        AND artifact_type = $2
        AND artifact_id = $3
      LIMIT 1`,
      [parsed.workflowRunId, parsed.artifactType, parsed.artifactId],
    );
    const artifact = artifactRows[0];
    if (artifact === undefined) {
      throw new Error("Workflow artifact was not found after upsert");
    }
    await db.execute(
      `UPDATE workflow_runs
      SET updated_at = datetime('now')
      WHERE id = $1`,
      [parsed.workflowRunId],
    );
    await db.execute("COMMIT");
    return artifact.id;
  } catch (error) {
    await rollbackWorkflowTransaction(db);
    throw error;
  }
}

export async function createWorkflowStepExecution(input: {
  workflowStepId: number;
  agentRunId?: number;
  executorRole: AgentRole;
}): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO workflow_step_executions (
      workflow_step_id,
      agent_run_id,
      executor_role,
      attempt_count,
      status,
      updated_at
    ) VALUES (
      $1,
      $2,
      $3,
      COALESCE((
        SELECT MAX(attempt_count) + 1
        FROM workflow_step_executions
        WHERE workflow_step_id = $1
      ), 1),
      'claimed',
      datetime('now')
    )`,
    [input.workflowStepId, input.agentRunId ?? null, input.executorRole],
  );
  return result.lastInsertId;
}

export async function updateWorkflowStepExecution(input: {
  id: number;
  agentRunId?: number;
  status:
    | "claimed"
    | "running"
    | "completed"
    | "waiting_approval"
    | "failed"
    | "blocked"
    | "cancelled";
  errorSummary?: string;
}): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE workflow_step_executions
    SET agent_run_id = COALESCE($1, agent_run_id),
      status = $2,
      error_summary = $3,
      completed_at = CASE WHEN $2 IN ('completed', 'waiting_approval', 'failed', 'blocked', 'cancelled') THEN datetime('now') ELSE completed_at END,
      updated_at = datetime('now')
    WHERE id = $4`,
    [
      input.agentRunId ?? null,
      input.status,
      input.errorSummary ?? "",
      input.id,
    ],
  );
}

export async function executeWorkflowRun(
  input: StartWorkflowRunInput,
): Promise<void> {
  const parsed = startWorkflowRunSchema.parse(input);
  const { runContentPipelineExecutor } = await import("@/workflows/executor");
  await runContentPipelineExecutor(parsed.id);
}

export async function resumeWorkflowRun(
  input: StartWorkflowRunInput,
): Promise<void> {
  const parsed = startWorkflowRunSchema.parse(input);
  const db = await getDb();
  let linkedAgentIsActive = false;

  await db.execute("BEGIN TRANSACTION");
  try {
    const run = await getWorkflowRunValidation(db, parsed.id);
    const steps = await loadWorkflowSteps(db, parsed.id);
    const waitingStep =
      steps.find(
        (step) =>
          step.step_key === run.current_step_key &&
          step.status === "waiting_approval",
      ) ?? steps.find((step) => step.status === "waiting_approval");

    if (waitingStep !== undefined) {
      const agentRows = await db.select<WorkflowLinkedAgentRow[]>(
        `SELECT id, status, output_summary, error_message
        FROM agent_runs
        WHERE workflow_run_id = $1
          AND workflow_step_id = $2
        ORDER BY id DESC
        LIMIT 1`,
        [parsed.id, waitingStep.id],
      );
      const agentRun = agentRows[0];
      if (agentRun !== undefined) {
        await reconcileWorkflowAgentRunInTransaction(db, {
          agentRunId: agentRun.id,
          status: agentRun.status,
          outputSummary: agentRun.output_summary,
          errorMessage: agentRun.error_message,
        });
        linkedAgentIsActive = [
          "queued",
          "running",
          "waiting_approval",
        ].includes(agentRun.status);
      }
    }

    await db.execute("COMMIT");
  } catch (error) {
    await rollbackWorkflowTransaction(db);
    throw error;
  }

  if (!linkedAgentIsActive) await executeWorkflowRun(parsed);
}

export async function setWorkflowStepStatus(
  input: SetWorkflowStepStatusInput,
): Promise<void> {
  const parsed = setWorkflowStepStatusSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const rows = await db.select<WorkflowStepValidationRow[]>(
      `SELECT
        ws.*,
        wr.status AS run_status,
        wr.campaign_id,
        c.status AS campaign_status
      FROM workflow_steps ws
      INNER JOIN workflow_runs wr ON wr.id = ws.workflow_run_id
      INNER JOIN campaigns c ON c.id = wr.campaign_id
      WHERE ws.id = $1
      LIMIT 1`,
      [parsed.stepId],
    );
    const step = rows[0];
    if (step === undefined) throw new Error("Workflow step was not found");
    if (step.campaign_status === "archived")
      throw new Error("Campaign is archived");
    if (step.run_status === "cancelled") {
      throw new Error("Cancelled workflow runs cannot change steps");
    }
    if (step.run_status === "completed" && parsed.status !== "running") {
      throw new Error("Completed workflow runs can only reopen steps");
    }

    assertStepTransition(step.status, parsed.status);

    await db.execute(
      `UPDATE workflow_steps
      SET status = $1,
        output_summary = $2,
        error_message = $3,
        started_at = CASE WHEN $1 = 'running' THEN COALESCE(started_at, datetime('now')) ELSE started_at END,
        completed_at = CASE
          WHEN $1 IN ('completed', 'skipped') THEN datetime('now')
          WHEN $1 IN ('running', 'blocked', 'failed', 'waiting_approval') THEN NULL
          ELSE completed_at
        END,
        updated_at = datetime('now')
      WHERE id = $4`,
      [parsed.status, parsed.outputSummary, parsed.errorMessage, parsed.stepId],
    );

    await insertWorkflowEvent(
      db,
      step.workflow_run_id,
      step.id,
      getStepEventType(step.status, parsed.status),
      getStepEventSummary(step, parsed.status),
    );

    if (parsed.status === "completed") {
      await startNextPendingWorkflowStep(db, step);
    }

    await updateRunFromSteps(db, step.workflow_run_id, step.run_status);
    await db.execute("COMMIT");
  } catch (error) {
    await rollbackWorkflowTransaction(db);
    throw error;
  }
}

export async function cancelWorkflowRun(
  input: CancelWorkflowRunInput,
): Promise<void> {
  const parsed = cancelWorkflowRunSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const run = await getWorkflowRunValidation(db, parsed.id);
    if (run.campaign_status === "archived")
      throw new Error("Campaign is archived");

    await db.execute(
      `UPDATE workflow_runs
      SET status = 'cancelled',
        completed_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = $1`,
      [parsed.id],
    );
    await insertWorkflowEvent(
      db,
      parsed.id,
      null,
      "run_cancelled",
      "Workflow run cancelled",
    );
    await db.execute("COMMIT");
  } catch (error) {
    await rollbackWorkflowTransaction(db);
    throw error;
  }
}

export async function addWorkflowNote(
  input: AddWorkflowNoteInput,
): Promise<void> {
  const parsed = addWorkflowNoteSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const run = await getWorkflowRunValidation(db, parsed.workflowRunId);
    if (run.campaign_status === "archived")
      throw new Error("Campaign is archived");

    await insertWorkflowEvent(
      db,
      parsed.workflowRunId,
      null,
      "note_added",
      parsed.note,
    );
    await db.execute(
      `UPDATE workflow_runs
      SET updated_at = datetime('now')
      WHERE id = $1`,
      [parsed.workflowRunId],
    );
    await db.execute("COMMIT");
  } catch (error) {
    await rollbackWorkflowTransaction(db);
    throw error;
  }
}

export async function rollbackWorkflowTransaction(
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
      __LINKGO_WORKFLOWS_TEST_API__?: {
        createWorkflowRun: typeof createWorkflowRun;
        startWorkflowRun: typeof startWorkflowRun;
        executeWorkflowRun: typeof executeWorkflowRun;
        resumeWorkflowRun: typeof resumeWorkflowRun;
        setWorkflowStepStatus: typeof setWorkflowStepStatus;
        cancelWorkflowRun: typeof cancelWorkflowRun;
        addWorkflowNote: typeof addWorkflowNote;
      };
    }
  ).__LINKGO_WORKFLOWS_TEST_API__ = {
    createWorkflowRun,
    startWorkflowRun,
    executeWorkflowRun,
    resumeWorkflowRun,
    setWorkflowStepStatus,
    cancelWorkflowRun,
    addWorkflowNote,
  };
}
