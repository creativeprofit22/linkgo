import { listAgentRuns, startAgentRun } from "@/features/agent-runtime/data";
import {
  applyDraftQualityScore,
  boundDraftQualityError,
  claimDraftQuality,
  completeDraftAiAuditRun,
  continueDraftQuality,
  failDraftQuality,
  resumeDraftQuality,
} from "@/features/drafts/data";
import { draftQualityScoreInputSchema } from "@/features/drafts/schemas";
import { toDraftQualitySettlement } from "@/features/drafts/quality-settlement";
import type {
  ClaimDraftQualityInput,
  ContinueDraftQualityInput,
  DraftQualityClaimResult,
} from "@/features/drafts/types";

async function scoreClaim(claim: DraftQualityClaimResult): Promise<unknown> {
  try {
    await startAgentRun({ id: claim.agentRunId });
    const agent = (await listAgentRuns(claim.campaignId)).find(
      (run) => run.id === claim.agentRunId,
    );
    const toolCall = agent?.toolCalls.find(
      (call) =>
        call.tool_name === "score_draft_quality" && call.status === "completed",
    );
    if (toolCall === undefined)
      throw new Error(
        agent?.error_message ||
          "Quality provider did not return a completed score_draft_quality call",
      );
    const parsed = draftQualityScoreInputSchema.parse(toolCall.input);
    const identities = [
      [parsed.campaignId, claim.campaignId],
      [parsed.draftVariantId, claim.draftVariantId],
      [parsed.qualityRunId, claim.qualityRunId],
      [parsed.attemptId, claim.attemptId],
      [parsed.contentRevision, claim.contentRevision],
    ];
    if (identities.some(([actual, expected]) => actual !== expected))
      throw new Error(
        "Quality provider identity did not match the durable claim",
      );
    const settlement = await applyDraftQualityScore(
      toDraftQualitySettlement(parsed, claim.agentRunId),
    );
    const result = settlement as {
      status?: string;
      aiAuditRunId?: number | null;
      agentRunId?: number | null;
      contentRevision?: number;
    };
    if (
      result.status === "awaiting_audit" &&
      result.aiAuditRunId != null &&
      result.agentRunId != null &&
      result.contentRevision !== undefined &&
      parsed.rewrite !== undefined
    ) {
      await startAgentRun({ id: result.agentRunId });
      // Native completion reads the rewrite auditor's own findings and checks
      // them against the stored rewrite text.
      await completeDraftAiAuditRun({
        auditRunId: result.aiAuditRunId,
        draftVariantId: claim.draftVariantId,
        contentRevision: result.contentRevision,
      });
      const next = await continueDraftQuality({
        qualityRunId: claim.qualityRunId,
        draftVariantId: claim.draftVariantId,
      });
      return await scoreClaim(next);
    }
    return settlement;
  } catch (error) {
    const errorMessage = boundDraftQualityError(error);
    try {
      await failDraftQuality({
        qualityRunId: claim.qualityRunId,
        draftVariantId: claim.draftVariantId,
        attemptId: claim.attemptId,
        errorMessage,
      });
    } catch (settlementError) {
      // Reconcile or a newer attempt already settled the run natively; the
      // provider failure is still the operator-facing reason.
      if (isAlreadySettledError(settlementError))
        throw Object.assign(new Error(errorMessage), {
          cause: settlementError,
        });
      throw Object.assign(
        new Error("Draft quality failure could not be settled"),
        { cause: settlementError },
      );
    }
    throw error;
  }
}

const ALREADY_SETTLED_MESSAGES: readonly string[] = [
  "Quality attempt is no longer active",
  "Active quality run was not found",
];

function isAlreadySettledError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ALREADY_SETTLED_MESSAGES.some((known) => error.message.includes(known))
  );
}

export async function runDraftQualityLoop(
  input: ClaimDraftQualityInput,
): Promise<unknown> {
  return scoreClaim(await claimDraftQuality(input));
}

export async function resumeDraftQualityLoop(
  input: ContinueDraftQualityInput,
): Promise<unknown> {
  return scoreClaim(await resumeDraftQuality(input));
}
