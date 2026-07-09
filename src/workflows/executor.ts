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
import type {
  WorkflowRunWithDetails,
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

export async function runContentPipelineExecutor(
  workflowRunId: number,
): Promise<WorkflowExecutorResult> {
  let run = (await listWorkflowRuns()).find(
    (candidate) => candidate.id === workflowRunId,
  );
  if (run === undefined) throw new Error("Workflow run was not found");
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
  await setWorkflowStepStatus({
    stepId: step.id,
    status: nextStatus,
    outputSummary: agentRun.output_summary,
    errorMessage: agentRun.error_message,
  });
  await updateWorkflowStepExecution({
    id: executionId,
    agentRunId,
    status:
      nextStatus === "completed"
        ? "completed"
        : nextStatus === "waiting_approval"
          ? "waiting_approval"
          : nextStatus === "failed"
            ? "failed"
            : "blocked",
    errorSummary: agentRun.error_message,
  });

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
