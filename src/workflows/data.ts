import { invokeCommand } from "@/lib/tauri";
import { z } from "zod";
import {
  workflowRunListSnapshotSchema,
  workflowRunValidationRowSchema,
} from "@/workflows/record-schemas";
import { IS_TEST } from "@/lib/env";
import type { AgentRole, AgentRunStatus } from "@/agent/types";
import type { CampaignStatus } from "@/features/campaigns/types";
import {
  addWorkflowNoteSchema,
  cancelWorkflowRunSchema,
  createWorkflowArtifactSchema,
  createWorkflowRunSchema,
  executeWorkflowRunSchema,
  resumeWorkflowRunResultSchema,
  setWorkflowStepStatusSchema,
  startWorkflowRunSchema,
  workflowMutationResultSchema,
} from "@/workflows/schemas";
import {
  type AddWorkflowNoteInput,
  type CancelWorkflowRunInput,
  type CreateWorkflowArtifactInput,
  type CreateWorkflowRunInput,
  type ExecuteWorkflowRunInput,
  type StartWorkflowRunInput,
  type SetWorkflowStepStatusInput,
  type WorkflowArtifact,
  type WorkflowArtifactWithDetails,
  type WorkflowEvent,
  type WorkflowRun,
  type WorkflowRunWithDetails,
  type WorkflowStep,
  type WorkflowStepStatus,
} from "@/workflows/types";

interface WorkflowRunRow extends WorkflowRun {
  campaign_name: string;
  campaign_status: CampaignStatus;
  autopilot_plan_id: number | null;
  source_import_batch_id: number | null;
}

interface WorkflowRunValidationRow extends WorkflowRun {
  campaign_status: CampaignStatus;
  autopilot_plan_id: number | null;
}

interface WorkflowArtifactRow extends WorkflowArtifact {
  agent_role: string | null;
  agent_status: string | null;
  candidate_id: number | null;
  candidate_status: string | null;
  candidate_relevance_score: number | null;
  draft_id: number | null;
  draft_status: WorkflowArtifactWithDetails["draft_status"];
  draft_content_intent: WorkflowArtifactWithDetails["draft_content_intent"];
}

export interface ReconcileWorkflowAgentRunInput {
  agentRunId: number;
  status: AgentRunStatus;
  outputSummary: string;
  errorMessage: string;
}
const FINISHED_STEP_STATUSES: WorkflowStepStatus[] = ["completed", "skipped"];
export const PLANNER_DRAFT_SAVE_ONLY_MESSAGE =
  "Planner-linked draft steps are save-only. Open Drafts, generate variants, and save a generated draft to continue to audit.";

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
  const candidateArtifacts = artifacts.filter(
    (artifact) => artifact.artifact_type === "candidate_post",
  );
  const currentCandidateArtifacts = candidateArtifacts.filter(
    (artifact) => !artifact.candidate_removed,
  );
  const candidateScope =
    candidateArtifacts.length === 0
      ? null
      : {
          total: candidateArtifacts.length,
          current: currentCandidateArtifacts.length,
          unscored: currentCandidateArtifacts.filter(
            (artifact) =>
              artifact.candidate_status === "new" &&
              artifact.candidate_relevance_score === null,
          ).length,
          alreadyScored: currentCandidateArtifacts.filter(
            (artifact) => artifact.candidate_relevance_score !== null,
          ).length,
          ineligible: currentCandidateArtifacts.filter(
            (artifact) =>
              artifact.candidate_status !== "new" &&
              artifact.candidate_relevance_score === null,
          ).length,
          removed: candidateArtifacts.filter(
            (artifact) => artifact.candidate_removed,
          ).length,
        };
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
    candidateScope,
  };
}

async function getWorkflowRunValidation(
  id: number,
): Promise<WorkflowRunValidationRow> {
  return workflowRunValidationRowSchema.parse(
    await invokeCommand("linkgo_workflow_run_validation", {
      input: { id },
    }),
  );
}

/**
 * Lists workflow runs natively (`workflow_store.rs`): runs (capped at 200)
 * with steps, the newest 100 events per run and artifacts, from one snapshot.
 */
export async function listWorkflowRuns(
  campaignId?: number,
): Promise<WorkflowRunWithDetails[]> {
  const parsedCampaignId = z
    .number()
    .int()
    .positive()
    .optional()
    .parse(campaignId);
  const snapshot = workflowRunListSnapshotSchema.parse(
    await invokeCommand("linkgo_workflow_run_list", {
      input:
        parsedCampaignId === undefined ? {} : { campaignId: parsedCampaignId },
    }),
  );
  const runRows: WorkflowRunRow[] = snapshot.runs;
  if (runRows.length === 0) return [];

  const stepsByRunId = new Map<number, WorkflowStep[]>();
  for (const step of snapshot.steps) {
    const steps = stepsByRunId.get(step.workflow_run_id) ?? [];
    steps.push(step);
    stepsByRunId.set(step.workflow_run_id, steps);
  }

  const eventsByRunId = new Map<number, WorkflowEvent[]>();
  for (const event of snapshot.events) {
    const events = eventsByRunId.get(event.workflow_run_id) ?? [];
    events.push(event);
    eventsByRunId.set(event.workflow_run_id, events);
  }

  const artifactsByRunId = new Map<number, WorkflowArtifactWithDetails[]>();
  for (const artifact of snapshot.artifacts as WorkflowArtifactRow[]) {
    const artifacts = artifactsByRunId.get(artifact.workflow_run_id) ?? [];
    artifacts.push({
      ...artifact,
      candidate_removed:
        artifact.artifact_type === "candidate_post" &&
        artifact.candidate_id === null,
      draft_removed:
        artifact.artifact_type === "draft" && artifact.draft_id === null,
    });
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
  return workflowMutationResultSchema.parse(
    await invokeCommand("linkgo_workflow_create_run", {
      input: parsed,
    }),
  ).id;
}

/** Starts or resumes a run natively (resumes blocked/failed steps first). */
export async function startWorkflowRun(
  input: StartWorkflowRunInput,
): Promise<void> {
  const parsed = startWorkflowRunSchema.parse(input);
  workflowMutationResultSchema.parse(
    await invokeCommand("linkgo_workflow_start_run", {
      input: parsed,
    }),
  );
}

/** Upserts a run artifact natively after checking campaign/run/step ownership. */
export async function createWorkflowArtifact(
  input: CreateWorkflowArtifactInput,
): Promise<number> {
  const parsed = createWorkflowArtifactSchema.parse(input);
  return workflowMutationResultSchema.parse(
    await invokeCommand("linkgo_workflow_create_artifact", {
      input: parsed,
    }),
  ).id;
}

/**
 * Claims a step execution natively. Native checks the step exists, that the
 * agent run belongs to this workflow, and that only one execution is active
 * per step, all in one transaction.
 */
export async function createWorkflowStepExecution(input: {
  workflowStepId: number;
  agentRunId?: number;
  executorRole: AgentRole;
}): Promise<number> {
  return z
    .number()
    .int()
    .positive()
    .parse(
      await invokeCommand("linkgo_workflow_step_execution_create", {
        input,
      }),
    );
}

/**
 * Updates a step execution natively (a missing id is a silent no-op, as
 * before). Error text is bounded to 2,000 characters.
 */
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
  await invokeCommand<null>("linkgo_workflow_step_execution_update", {
    input: { ...input, errorSummary: input.errorSummary ?? "" },
  });
}

export async function executeWorkflowRun(
  input: ExecuteWorkflowRunInput,
): Promise<void> {
  const parsed = executeWorkflowRunSchema.parse(input);
  const run = await getWorkflowRunValidation(parsed.id);
  if (run.autopilot_plan_id !== null && run.current_step_key === "draft") {
    throw new Error(PLANNER_DRAFT_SAVE_ONLY_MESSAGE);
  }
  const { runContentPipelineExecutor } = await import("@/workflows/executor");
  const executeInput: ExecuteWorkflowRunInput =
    parsed.scoring === undefined
      ? { id: parsed.id }
      : {
          id: parsed.id,
          scoring: {
            ...parsed.scoring,
            providerKey: parsed.scoring.providerKey as Exclude<
              typeof parsed.scoring.providerKey,
              "dry_run"
            >,
          },
        };
  await runContentPipelineExecutor(executeInput);
}

/**
 * Reconciles a waiting step from its linked agent run natively, then
 * continues execution here unless that agent run is still active.
 */
export async function resumeWorkflowRun(
  input: StartWorkflowRunInput,
): Promise<void> {
  const parsed = startWorkflowRunSchema.parse(input);
  const result = resumeWorkflowRunResultSchema.parse(
    await invokeCommand("linkgo_workflow_resume_run", {
      input: parsed,
    }),
  );
  if (!result.linkedAgentIsActive) await executeWorkflowRun(parsed);
}

/** Moves a step natively, advancing the run and planner scoring backlog. */
export async function setWorkflowStepStatus(
  input: SetWorkflowStepStatusInput,
): Promise<void> {
  const parsed = setWorkflowStepStatusSchema.parse(input);
  workflowMutationResultSchema.parse(
    await invokeCommand("linkgo_workflow_set_step_status", {
      input: parsed,
    }),
  );
}

/** Cancels a run natively, skipping an unfinished score step. */
export async function cancelWorkflowRun(
  input: CancelWorkflowRunInput,
): Promise<void> {
  const parsed = cancelWorkflowRunSchema.parse(input);
  workflowMutationResultSchema.parse(
    await invokeCommand("linkgo_workflow_cancel_run", {
      input: parsed,
    }),
  );
}

export async function addWorkflowNote(
  input: AddWorkflowNoteInput,
): Promise<void> {
  const parsed = addWorkflowNoteSchema.parse(input);
  workflowMutationResultSchema.parse(
    await invokeCommand("linkgo_workflow_add_note", { input: parsed }),
  );
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
