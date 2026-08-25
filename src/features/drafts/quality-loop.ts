import { listAgentRuns, startAgentRun } from "@/features/agent-runtime/data";
import {
  applyDraftQualityScore,
  claimDraftQuality,
  completeDraftAiAuditRun,
  consumeCompletedDraftAiAuditOutput,
  continueDraftQuality,
  failDraftQuality,
  resumeDraftQuality,
} from "@/features/drafts/data";
import { getDb } from "@/lib/db";
import { draftQualityScoreInputSchema } from "@/features/drafts/schemas";
import type {
  ClaimDraftQualityInput,
  ContinueDraftQualityInput,
} from "@/features/drafts/types";

async function scoreClaim(
  claim: Awaited<ReturnType<typeof claimDraftQuality>>,
): Promise<unknown> {
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
    const settlement = await applyDraftQualityScore({
      campaignId: parsed.campaignId,
      draftVariantId: parsed.draftVariantId,
      qualityRunId: parsed.qualityRunId,
      attemptId: parsed.attemptId,
      contentRevision: parsed.contentRevision,
      hook: parsed.hook,
      body: parsed.body,
      cta: parsed.cta,
      hashtags: parsed.hashtags,
      threshold: parsed.threshold,
      rewriteAllowed: parsed.rewriteAllowed,
      priorCategoryFeedback: parsed.priorCategoryFeedback,
      categoryScores: parsed.categoryScores,
      ...(parsed.rewrite === undefined ? {} : { rewrite: parsed.rewrite }),
      agentRunId: claim.agentRunId,
    });
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
      const db = await getDb();
      const text = [
        parsed.rewrite.hook,
        parsed.rewrite.body,
        parsed.rewrite.cta,
        parsed.rewrite.hashtags,
      ].join("\n\n");
      const auditOutput = await consumeCompletedDraftAiAuditOutput(
        db,
        {
          campaignId: claim.campaignId,
          draftVariantId: claim.draftVariantId,
          contentRevision: result.contentRevision,
          auditRunId: result.aiAuditRunId,
          text,
        },
        result.agentRunId,
      );
      await completeDraftAiAuditRun({
        auditRunId: result.aiAuditRunId,
        draftVariantId: claim.draftVariantId,
        contentRevision: result.contentRevision,
        summary: auditOutput.summary,
        findings: auditOutput.findings,
      });
      const next = (await continueDraftQuality({
        qualityRunId: claim.qualityRunId,
        draftVariantId: claim.draftVariantId,
      })) as typeof claim;
      return await scoreClaim(next);
    }
    return settlement;
  } catch (error) {
    await failDraftQuality({
      qualityRunId: claim.qualityRunId,
      draftVariantId: claim.draftVariantId,
      errorMessage:
        error instanceof Error ? error.message : "Quality loop failed",
    });
    throw error;
  }
}

export async function runDraftQualityLoop(
  input: ClaimDraftQualityInput,
): Promise<unknown> {
  return scoreClaim(await claimDraftQuality(input));
}

export async function resumeDraftQualityLoop(
  input: ContinueDraftQualityInput,
): Promise<unknown> {
  return scoreClaim(
    (await resumeDraftQuality(input)) as Awaited<
      ReturnType<typeof claimDraftQuality>
    >,
  );
}
