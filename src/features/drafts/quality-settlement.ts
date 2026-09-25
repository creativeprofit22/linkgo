import {
  applyDraftQualityScoreInputSchema,
  draftQualityScoreInputSchema,
} from "./schemas";
import type { ApplyDraftQualityScoreInput } from "./types";

/** Keep provider context validated, but send only the strict native settlement fields. */
export function toDraftQualitySettlement(
  providerOutput: unknown,
  agentRunId: number,
): ApplyDraftQualityScoreInput {
  const score = draftQualityScoreInputSchema.parse(providerOutput);
  const overall = Math.round(
    score.categoryScores.reduce(
      (total, category) => total + category.score,
      0,
    ) / score.categoryScores.length,
  );
  const settlement: ApplyDraftQualityScoreInput = {
    qualityRunId: score.qualityRunId,
    draftVariantId: score.draftVariantId,
    attemptId: score.attemptId,
    contentRevision: score.contentRevision,
    agentRunId,
    categoryScores: score.categoryScores,
    ...(score.rewrite === undefined ? {} : { rewrite: score.rewrite }),
    summary: `Revision ${score.contentRevision}: overall quality ${overall}/100 (threshold ${score.threshold}). ${score.categoryScores.map((category) => `${category.categoryKey}: ${category.score}/100`).join("; ")}.`,
  };
  applyDraftQualityScoreInputSchema.parse(settlement);
  return settlement;
}
