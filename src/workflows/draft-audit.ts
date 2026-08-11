import {
  DEFAULT_AGENT_MODELS,
  type AgentProviderKey,
} from "@/agent/provider-catalog";
import { agentProviderKeySchema } from "@/agent/schemas";
import { startAgentRun } from "@/features/agent-runtime/data";
import {
  boundDraftAiAuditError,
  consumeCompletedDraftAiAuditOutput,
  loadDraftAiAuditSnapshot,
  parseCanonicalDraftAuditText,
} from "@/features/drafts/data";
import { getDb, type LinkgoDatabase } from "@/lib/db";
import {
  claimNativePlannerDraftAudit,
  completeNativePlannerDraftAudit,
  failNativePlannerDraftAudit,
} from "@/workflows/draft-audit-commands";
import type { WorkflowRunWithDetails } from "@/workflows/types";

interface PlannerDraftAuditScopeRow {
  campaign_id: number;
  workflow_step_id: number;
  draft_id: number;
  request_id: number;
  provider_key: string;
  model_name: string;
  request_run_id: number | null;
  request_step_id: number | null;
  request_campaign_id: number;
  created_draft_id: number | null;
  draft_campaign_id: number;
}

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
  db: LinkgoDatabase,
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

  const rows = await db.select<PlannerDraftAuditScopeRow[]>(
    `SELECT
      wr.campaign_id,
      ws.id AS workflow_step_id,
      wa.artifact_id AS draft_id,
      dgr.id AS request_id,
      dgr.provider_key,
      dgr.model_name,
      dgr.workflow_run_id AS request_run_id,
      dgr.workflow_step_id AS request_step_id,
      dgr.campaign_id AS request_campaign_id,
      dgr.created_draft_id,
      d.campaign_id AS draft_campaign_id
    FROM workflow_runs wr
    INNER JOIN workflow_steps ws
      ON ws.workflow_run_id = wr.id AND ws.step_key = 'audit'
    INNER JOIN workflow_artifacts wa
      ON wa.workflow_run_id = wr.id AND wa.artifact_type = 'draft'
    INNER JOIN drafts d ON d.id = wa.artifact_id
    INNER JOIN draft_generation_requests dgr
      ON dgr.created_draft_id = d.id AND dgr.status = 'saved'
    INNER JOIN autopilot_plans ap
      ON ap.workflow_run_id = wr.id
      AND ap.campaign_id = wr.campaign_id
      AND ap.status = 'planned'
    WHERE wr.id = $1`,
    [run.id],
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
  const db = await getDb();
  const provenance = await loadPlannerDraftAuditProvenance(db, run);
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
      const snapshot = await loadDraftAiAuditSnapshot(db, claim.draftVariantId);
      if (
        snapshot.campaign_id !== provenance.campaignId ||
        snapshot.content_revision !== claim.contentRevision
      ) {
        throw new Error("Planner draft audit claim points to a stale revision");
      }
      const text = parseCanonicalDraftAuditText(snapshot);
      await startAgentRun({ id: claim.agentRunId });
      const output = await consumeCompletedDraftAiAuditOutput(
        db,
        {
          campaignId: provenance.campaignId,
          draftVariantId: claim.draftVariantId,
          contentRevision: claim.contentRevision,
          auditRunId: claim.auditRunId,
          text,
        },
        claim.agentRunId,
      );
      const settlement = await completeNativePlannerDraftAudit({
        agentRunId: claim.agentRunId,
        summary: output.summary,
        findings: output.findings,
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
