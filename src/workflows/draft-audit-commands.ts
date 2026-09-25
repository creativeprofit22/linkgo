import {
  completePlannerDraftAuditSchema,
  failPlannerDraftAuditSchema,
  reconcileStalePlannerDraftAuditsSchema,
} from "@/features/drafts/schemas";
import type {
  CompletePlannerDraftAuditInput,
  FailPlannerDraftAuditInput,
  ReconcileStalePlannerDraftAuditsInput,
  ReconcileStalePlannerDraftAuditsResult,
} from "@/features/drafts/types";
import { IS_TAURI, IS_TEST } from "@/lib/env";
import { invokeCommand, toNativeCommandError } from "@/lib/tauri";
import type { PlannerDraftAuditProvenance } from "@/workflows/draft-audit";
import type { PlannerDraftAuditClaim } from "@/workflows/types";
import { z } from "zod";

const positiveIdSchema = z.number().int().positive();

const claimPlannerDraftAuditInputSchema = z
  .object({
    workflowRunId: positiveIdSchema,
    workflowStepId: positiveIdSchema,
    campaignId: positiveIdSchema,
    draftId: positiveIdSchema,
    draftGenerationRequestId: positiveIdSchema,
    providerKey: z.string().trim().min(1),
    modelName: z.string().trim().min(1).max(120),
  })
  .strict();

export const plannerDraftAuditClaimResultSchema = z
  .object({
    executionId: positiveIdSchema,
    auditRunId: positiveIdSchema,
    agentRunId: positiveIdSchema,
    workflowRunId: positiveIdSchema,
    workflowStepId: positiveIdSchema,
    draftId: positiveIdSchema,
    draftVariantId: positiveIdSchema,
    contentRevision: positiveIdSchema,
  })
  .strict();

export const completePlannerDraftAuditResultSchema = z
  .object({ terminal: z.boolean() })
  .strict();
export const failPlannerDraftAuditResultSchema = z.null();

export const reconcileStalePlannerDraftAuditsResultSchema = z
  .object({
    failedAuditRunIds: z.array(positiveIdSchema).max(100),
    failedAgentRunIds: z.array(positiveIdSchema).max(100),
    failedExecutionIds: z.array(positiveIdSchema).max(100),
    failedWorkflowRunIds: z.array(positiveIdSchema).max(100),
  })
  .strict();

type InvokeFn = (command: string, args?: unknown) => Promise<unknown>;

interface TauriWindowLike {
  __TAURI__?: { core?: { invoke?: unknown } };
  __TAURI_INTERNALS__?: { invoke?: unknown };
}

function getInjectedInvoke(): InvokeFn | null {
  if (!IS_TEST || typeof window === "undefined") return null;
  const tauriWindow = window as unknown as TauriWindowLike;
  const candidate =
    tauriWindow.__TAURI_INTERNALS__?.invoke ??
    tauriWindow.__TAURI__?.core?.invoke;
  return typeof candidate === "function" ? (candidate as InvokeFn) : null;
}

async function invokeDraftAuditCommand<T>(
  command: string,
  input: unknown,
  resultSchema: z.ZodType<T>,
): Promise<T> {
  const injected = getInjectedInvoke();
  if (injected) {
    let result: unknown;
    try {
      result = await injected(command, { input });
    } catch (error: unknown) {
      throw toNativeCommandError(error);
    }
    return resultSchema.parse(result);
  }
  if (!IS_TAURI) {
    throw new Error("Planner draft auditing requires the Linkgo desktop app");
  }
  return resultSchema.parse(await invokeCommand(command, { input }));
}

export function claimNativePlannerDraftAudit(
  provenance: PlannerDraftAuditProvenance,
): Promise<PlannerDraftAuditClaim> {
  const input = claimPlannerDraftAuditInputSchema.parse(provenance);
  return invokeDraftAuditCommand(
    "linkgo_planner_draft_audit_claim",
    input,
    plannerDraftAuditClaimResultSchema,
  );
}

export function completeNativePlannerDraftAudit(
  input: CompletePlannerDraftAuditInput,
): Promise<{ terminal: boolean }> {
  return invokeDraftAuditCommand(
    "linkgo_planner_draft_audit_complete",
    completePlannerDraftAuditSchema.parse(input),
    completePlannerDraftAuditResultSchema,
  );
}

export function failNativePlannerDraftAudit(
  input: FailPlannerDraftAuditInput,
): Promise<null> {
  return invokeDraftAuditCommand(
    "linkgo_planner_draft_audit_fail",
    failPlannerDraftAuditSchema.parse(input),
    failPlannerDraftAuditResultSchema,
  );
}

export function reconcileStaleNativePlannerDraftAudits(
  input: ReconcileStalePlannerDraftAuditsInput = {},
): Promise<ReconcileStalePlannerDraftAuditsResult> {
  return invokeDraftAuditCommand(
    "linkgo_planner_draft_audit_reconcile_stale",
    reconcileStalePlannerDraftAuditsSchema.parse(input),
    reconcileStalePlannerDraftAuditsResultSchema,
  );
}
