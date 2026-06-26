import { getDb, type LinkgoDatabase } from "@/lib/db";
import { IS_TEST } from "@/lib/env";
import type { CampaignStatus } from "@/features/campaigns/types";
import {
  addWorkflowNoteSchema,
  cancelWorkflowRunSchema,
  createWorkflowRunSchema,
  setWorkflowStepStatusSchema,
  startWorkflowRunSchema,
} from "@/workflows/schemas";
import {
  CONTENT_PIPELINE_STEPS,
  type AddWorkflowNoteInput,
  type CancelWorkflowRunInput,
  type CreateWorkflowRunInput,
  type StartWorkflowRunInput,
  type SetWorkflowStepStatusInput,
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
}

interface WorkflowRunValidationRow extends WorkflowRun {
  campaign_status: CampaignStatus;
}

interface WorkflowStepValidationRow extends WorkflowStep {
  run_status: WorkflowRunStatus;
  campaign_id: number;
  campaign_status: CampaignStatus;
}

const TERMINAL_RUN_STATUSES: WorkflowRunStatus[] = ["completed", "cancelled"];
const FINISHED_STEP_STATUSES: WorkflowStepStatus[] = ["completed", "skipped"];

const STEP_TRANSITIONS: Record<WorkflowStepStatus, WorkflowStepStatus[]> = {
  pending: ["running", "skipped"],
  running: ["completed", "waiting_approval", "blocked", "failed", "skipped"],
  waiting_approval: ["completed", "blocked", "failed", "running"],
  blocked: ["running", "failed", "skipped"],
  failed: ["running", "skipped"],
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
    campaign: {
      id: row.campaign_id,
      name: row.campaign_name,
      status: row.campaign_status,
    },
    steps,
    events,
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
      c.status AS campaign_status
    FROM workflow_runs wr
    INNER JOIN campaigns c ON c.id = wr.campaign_id
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
  const [stepRows, eventRows] = await Promise.all([
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

  return runRows.map((row) =>
    mapRunWithDetails(
      row,
      stepsByRunId.get(row.id) ?? [],
      eventsByRunId.get(row.id) ?? [],
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
      const stepsBeforeRecalc = await loadWorkflowSteps(
        db,
        step.workflow_run_id,
      );
      const nextStep = stepsBeforeRecalc.find(
        (candidate) =>
          candidate.sort_order === step.sort_order + 1 &&
          candidate.status === "pending",
      );
      if (nextStep !== undefined) {
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
        setWorkflowStepStatus: typeof setWorkflowStepStatus;
        cancelWorkflowRun: typeof cancelWorkflowRun;
        addWorkflowNote: typeof addWorkflowNote;
      };
    }
  ).__LINKGO_WORKFLOWS_TEST_API__ = {
    createWorkflowRun,
    startWorkflowRun,
    setWorkflowStepStatus,
    cancelWorkflowRun,
    addWorkflowNote,
  };
}
