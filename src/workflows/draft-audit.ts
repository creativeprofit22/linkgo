import {
  DEFAULT_AGENT_MODELS,
  type AgentProviderKey,
} from "@/agent/provider-catalog";
import { agentProviderKeySchema } from "@/agent/schemas";
import { startAgentRun } from "@/features/agent-runtime/data";
import { boundDraftAiAuditError } from "@/features/drafts/data";
import { invokeCommand } from "@/lib/tauri";
import { plannerDraftAuditScopeRowsSchema } from "@/workflows/record-schemas";
import {
  claimNativePlannerDraftAudit,
  completeNativePlannerDraftAudit,
  failNativePlannerDraftAudit,
} from "@/workflows/draft-audit-commands";
import type { WorkflowRunWithDetails } from "@/workflows/types";

export interface PlannerDraftAuditProvenance {
  workflowRunId: number;
  workflowStepId: number;
  campaignId: number;
  draftId: number;
  draftGenerationRequestId: number;
  providerKey: AgentProviderKey;
  modelName: string;
}

export interface PlannerDraftAuditExecutorResult {
  workflowRunId: number;
  status: "waiting_approval";
  summary: string;
  agentRunId: number | null;
}

export async function loadPlannerDraftAuditProvenance(
  run: WorkflowRunWithDetails,
): Promise<PlannerDraftAuditProvenance> {
  if (run.autopilot_plan_id === null || run.current_step_key !== "audit") {
    throw new Error("Workflow is not at a planner-linked audit step");
  }
  const auditStep = run.steps.find((step) => step.step_key === "audit");
  const draftStep = run.steps.find((step) => step.step_key === "draft");
  if (auditStep === undefined || draftStep === undefined) {
    throw new Error("Planner draft audit steps were not found");
  }

  // Native reads the saved-draft provenance rows (at most two, so an
  // ambiguous scope is still rejected below); validation stays here.
  const rows = plannerDraftAuditScopeRowsSchema.parse(
    await invokeCommand("linkgo_workflow_planner_draft_audit_scope", {
      input: { id: run.id },
    }),
  );
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new Error(
      "Planner audit requires one saved draft artifact with request provenance",
    );
  }
  const scope = rows[0];
  if (
    scope.workflow_step_id !== auditStep.id ||
    scope.request_run_id !== run.id ||
    scope.request_step_id !== draftStep.id ||
    scope.campaign_id !== run.campaign_id ||
    scope.request_campaign_id !== run.campaign_id ||
    scope.draft_campaign_id !== run.campaign_id ||
    scope.created_draft_id !== scope.draft_id
  ) {
    throw new Error(
      "Saved draft request provenance does not match the planner audit scope",
    );
  }

  const providerKey = agentProviderKeySchema.parse(scope.provider_key);
  const savedModel = scope.model_name.trim();
  const modelName = savedModel || DEFAULT_AGENT_MODELS[providerKey];
  if (modelName.length === 0 || modelName.length > 120) {
    throw new Error("Planner draft audit model is invalid");
  }
  return {
    workflowRunId: run.id,
    workflowStepId: auditStep.id,
    campaignId: run.campaign_id,
    draftId: scope.draft_id,
    draftGenerationRequestId: scope.request_id,
    providerKey,
    modelName,
  };
}

async function failClaim(agentRunId: number, caught: unknown): Promise<never> {
  const errorSummary = boundDraftAiAuditError(caught);
  try {
    await failNativePlannerDraftAudit({ agentRunId, errorSummary });
  } catch (settlementError) {
    throw Object.assign(
      new Error("Planner draft audit failure could not be settled"),
      { cause: settlementError },
    );
  }
  throw Object.assign(new Error(errorSummary), { cause: caught });
}

export async function runPlannerDraftAuditExecutor(
  run: WorkflowRunWithDetails,
): Promise<PlannerDraftAuditExecutorResult> {
  const provenance = await loadPlannerDraftAuditProvenance(run);
  let completed = 0;

  for (;;) {
    const claim = await claimNativePlannerDraftAudit(provenance);
    try {
      if (
        claim.workflowRunId !== provenance.workflowRunId ||
        claim.workflowStepId !== provenance.workflowStepId ||
        claim.draftId !== provenance.draftId
      ) {
        throw new Error("Planner draft audit claim provenance did not match");
      }
      await startAgentRun({ id: claim.agentRunId });
      // Native completion re-checks the revision and reads the auditor's own
      // persisted output against the stored audit request.
      const settlement = await completeNativePlannerDraftAudit({
        agentRunId: claim.agentRunId,
      });
      completed += 1;
      if (settlement.terminal) {
        return {
          workflowRunId: run.id,
          status: "waiting_approval",
          summary: `Audited ${completed} current draft revision(s); drafts are waiting for approval.`,
          agentRunId: claim.agentRunId,
        };
      }
    } catch (caught) {
      return failClaim(claim.agentRunId, caught);
    }
  }
}
