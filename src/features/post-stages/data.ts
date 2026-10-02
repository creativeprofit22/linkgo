import { listApprovals } from "@/features/approvals/data";
import { listDrafts } from "@/features/drafts/data";
import { listPostMetrics } from "@/features/metrics/data";
import { derivePostStageIndex } from "@/features/post-stages/derive-post-stage";
import type {
  PostStageApprovalInput,
  PostStageIndex,
} from "@/features/post-stages/types";
import { z } from "zod";

const campaignIdSchema = z.number().int().positive();

function abortError(): DOMException {
  return new DOMException("Post stage read was cancelled", "AbortError");
}

/**
 * Stage of every idea, draft and approval in one campaign. Read-only: it
 * composes the drafts, approvals and post-metrics lists (each capped at 500
 * natively), so posts beyond those caps show no stage. Pass `approvals` when
 * the caller already loaded this campaign's approvals, so they aren't read
 * twice.
 */
export async function getPostStageIndex(
  campaignId: number,
  options: {
    signal?: AbortSignal | undefined;
    approvals?: readonly PostStageApprovalInput[] | undefined;
  } = {},
): Promise<PostStageIndex> {
  const { signal } = options;
  const id = campaignIdSchema.parse(campaignId);
  if (signal?.aborted) throw abortError();
  const [drafts, approvals, metrics] = await Promise.all([
    listDrafts(id),
    options.approvals ?? listApprovals(id),
    listPostMetrics(id),
  ]);
  if (signal?.aborted) throw abortError();
  return derivePostStageIndex({
    drafts,
    approvals,
    approvalIdsWithMetrics: new Set(
      metrics.map((metric) => metric.approval_id),
    ),
  });
}
