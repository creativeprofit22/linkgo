import { roleForWorkflowStep } from "@/agent/messages";
import {
  createAgentRun,
  listAgentRuns,
  startAgentRun,
} from "@/features/agent-runtime/data";
import {
  createWorkflowArtifact,
  createWorkflowStepExecution,
  listWorkflowRuns,
  setWorkflowStepStatus,
  startWorkflowRun,
  updateWorkflowStepExecution,
} from "@/workflows/data";
import {
  buildRelevanceScoringContext,
  claimPlannerScoringExecution,
  failPlannerScoringClaim,
  loadPlannerScoringScope,
  settlePlannerScoringWithoutModel,
} from "@/workflows/relevance-scoring";
import type {
  ExecuteWorkflowRunInput,
  WorkflowRunWithDetails,
  WorkflowScoringInput,
  WorkflowStep,
  WorkflowStepStatus,
} from "@/workflows/types";

interface WorkflowExecutorResult {
  workflowRunId: number;
  status: "completed" | "waiting_approval" | "blocked" | "failed" | "running";
  summary: string;
  agentRunId: number | null;
}

function getRunnableStep(run: WorkflowRunWithDetails): WorkflowStep | null {
  return (
    run.steps.find((step) => step.status === "running") ??
    run.steps.find(
      (step) =>
        step.step_key === run.current_step_key && step.status === "pending",
    ) ??
    run.steps.find((step) => ["blocked", "failed"].includes(step.status)) ??
    null
  );
}

function statusFromAgentRun(status: string): WorkflowStepStatus {
  if (status === "completed") return "completed";
  if (status === "waiting_approval") return "waiting_approval";
  if (status === "failed") return "failed";
  return "blocked";
}

async function runPlannerScoringExecutor(
  run: WorkflowRunWithDetails,
  scoring: WorkflowScoringInput | undefined,
): Promise<WorkflowExecutorResult> {
  let scope;
  try {
    scope = await loadPlannerScoringScope(run.id);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "No candidate scope is attached to this score step"
    ) {
      throw error;
    }
    throw error;
  }

  if (scope.currentCandidates.length === 0) {
    const summary = `Scoring blocked: all ${scope.artifactCount} attached candidates were removed.`;
    await settlePlannerScoringWithoutModel(run.id, "blocked", summary);
    return {
      workflowRunId: run.id,
      status: "blocked",
      summary,
      agentRunId: null,
    };
  }
  if (scope.unscoredCandidates.length === 0) {
    const summary = `Scoring completed without a model call: ${scope.alreadyScoredCandidates.length} candidates were already scored and ${scope.ineligibleCandidates.length} were no longer new.`;
    await settlePlannerScoringWithoutModel(run.id, "completed", summary);
    return {
      workflowRunId: run.id,
      status: "running",
      summary,
      agentRunId: null,
    };
  }
  if (scoring === undefined) {
    throw new Error(
      "Scoring provider confirmation is required for this workflow",
    );
  }

  let context;
  try {
    context = buildRelevanceScoringContext(scope, {
      minimumScore: scoring.minimumScore ?? 60,
      autoRejectBelowMinimum: scoring.autoRejectBelowMinimum ?? false,
    });
  } catch (error) {
    const summary =
      error instanceof Error ? error.message : "Scoring context is invalid";
    await settlePlannerScoringWithoutModel(run.id, "blocked", summary);
    throw error;
  }

  const candidateIds = scope.unscoredCandidates.map(
    (candidate) => candidate.id,
  );
  const claim = await claimPlannerScoringExecution(run.id, {
    providerKey: scoring.providerKey,
    modelName: scoring.modelName,
    playbookKey: "",
    inputSummary: `Planner scoring for source batch #${scope.sourceImportBatchId}. Candidate IDs: ${candidateIds.join(", ")}. Minimum score: ${scoring.minimumScore ?? 60}. Auto-reject: ${scoring.autoRejectBelowMinimum === true}.`,
    inputContext: context,
  });
  const agentRunId = claim.agentRunId;
  try {
    await startAgentRun({ id: agentRunId });
  } catch (error) {
    await failPlannerScoringClaim(claim, error);
    throw error;
  }

  const agentRun = (await listAgentRuns(scope.campaignId)).find(
    (candidate) => candidate.id === agentRunId,
  );
  if (agentRun === undefined) {
    const error = new Error("Executor scorer run was not found");
    await failPlannerScoringClaim(claim, error);
    throw error;
  }
  if (agentRun.status === "failed" || agentRun.status === "cancelled") {
    throw new Error(agentRun.error_message || "Workflow scoring failed");
  }
  return {
    workflowRunId: run.id,
    status:
      agentRun.status === "waiting_approval" ? "waiting_approval" : "running",
    summary:
      agentRun.output_summary ||
      `Scored ${scope.unscoredCandidates.length} candidates.`,
    agentRunId,
  };
}

export async function runContentPipelineExecutor(
  input: ExecuteWorkflowRunInput,
): Promise<WorkflowExecutorResult> {
  const workflowRunId = input.id;
  let run = (await listWorkflowRuns()).find(
    (candidate) => candidate.id === workflowRunId,
  );
  if (run === undefined) throw new Error("Workflow run was not found");
  const initialStep = getRunnableStep(run);
  if (initialStep?.step_key === "score" && run.autopilot_plan_id !== null) {
    return runPlannerScoringExecutor(run, input.scoring);
  }
  if (
    initialStep?.step_key === "score" &&
    run.artifacts.every(
      (artifact) => artifact.artifact_type !== "candidate_post",
    )
  ) {
    throw new Error("No candidate scope is attached to this score step");
  }
  if (
    run.status === "queued" ||
    run.status === "failed" ||
    run.status === "blocked"
  ) {
    await startWorkflowRun({ id: workflowRunId });
    run = (await listWorkflowRuns()).find(
      (candidate) => candidate.id === workflowRunId,
    );
  }
  if (run === undefined) throw new Error("Workflow run was not found");
  if (["completed", "cancelled"].includes(run.status)) {
    return {
      workflowRunId,
      status: run.status === "completed" ? "completed" : "blocked",
      summary: `Workflow is ${run.status}.`,
      agentRunId: null,
    };
  }

  const step = getRunnableStep(run);
  if (step === null) {
    return {
      workflowRunId,
      status: "completed",
      summary: "No runnable workflow step remains.",
      agentRunId: null,
    };
  }

  if (step.step_key === "approve") {
    await setWorkflowStepStatus({
      stepId: step.id,
      status: "waiting_approval",
      outputSummary: "Executor stopped for human approval.",
    });
    return {
      workflowRunId,
      status: "waiting_approval",
      summary: "Workflow stopped at human approval.",
      agentRunId: null,
    };
  }

  const agentRole = roleForWorkflowStep(step.step_key);
  const executionId = await createWorkflowStepExecution({
    workflowStepId: step.id,
    executorRole: agentRole,
  });
  let agentRunId: number | null = null;
  try {
    agentRunId = await createAgentRun({
      campaignId: run.campaign_id,
      workflowRunId,
      workflowStepId: step.id,
      agentRole,
      providerKey: "dry_run",
      modelName: "dry-run-local",
      inputSummary:
        `${run.title}: execute ${step.title}. ${run.context_summary}`.trim(),
    });
    await createWorkflowArtifact({
      workflowRunId,
      workflowStepId: step.id,
      artifactType: "agent_run",
      artifactId: agentRunId,
      summary: `${step.title} executor agent run`,
    });
    await updateWorkflowStepExecution({
      id: executionId,
      agentRunId,
      status: "running",
    });
    await startAgentRun({ id: agentRunId });
  } catch (error) {
    const errorSummary =
      error instanceof Error ? error.message : "Workflow executor failed";
    const failureUpdate: Parameters<typeof updateWorkflowStepExecution>[0] = {
      id: executionId,
      status: "failed",
      errorSummary,
    };
    if (agentRunId !== null) failureUpdate.agentRunId = agentRunId;
    await updateWorkflowStepExecution(failureUpdate);
    await setWorkflowStepStatus({
      stepId: step.id,
      status: "failed",
      errorMessage: errorSummary,
    });
    throw error;
  }

  const agentRun = (await listAgentRuns(run.campaign_id)).find(
    (candidate) => candidate.id === agentRunId,
  );
  if (agentRun === undefined)
    throw new Error("Executor agent run was not found");

  const nextStatus = statusFromAgentRun(agentRun.status);
  const executorStatus: WorkflowExecutorResult["status"] =
    nextStatus === "completed"
      ? "running"
      : nextStatus === "waiting_approval"
        ? "waiting_approval"
        : nextStatus === "failed"
          ? "failed"
          : "blocked";

  return {
    workflowRunId,
    status: executorStatus,
    summary:
      agentRun.output_summary ||
      agentRun.error_message ||
      `${step.title} executed.`,
    agentRunId,
  };
}
