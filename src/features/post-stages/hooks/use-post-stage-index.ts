import { useEffect, useState } from "react";

import { getPostStageIndex } from "@/features/post-stages/data";
import type {
  PostStageApprovalInput,
  PostStageIndex,
} from "@/features/post-stages/types";

/**
 * Loads the post stages of one campaign. `refreshKey` should be the screen's
 * own loaded list, so the stages reload whenever that list does (after every
 * mutation). Returns `null` until the first stages for this campaign load,
 * for no campaign, or when the latest read failed — the tracker then hides and
 * the screen keeps working. During a reload for the same campaign (after a
 * mutation) it keeps returning the previous stages until the new ones arrive,
 * so the tracker doesn't flicker after every click.
 * `loadedApprovals` (the Approvals screen's own list, which is also its
 * refresh key) avoids reading the approvals a second time.
 */
export function usePostStageIndex(
  campaignId: number | null,
  refreshKey: unknown,
  loadedApprovals?: readonly PostStageApprovalInput[],
): PostStageIndex | null {
  const [state, setState] = useState<{
    campaignId: number | null;
    index: PostStageIndex | null;
  }>({ campaignId: null, index: null });

  useEffect(() => {
    if (campaignId === null) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const index = await getPostStageIndex(campaignId, {
          signal: controller.signal,
          approvals: loadedApprovals,
        });
        if (!controller.signal.aborted) setState({ campaignId, index });
      } catch {
        if (!controller.signal.aborted) setState({ campaignId, index: null });
      }
    })();
    return () => controller.abort();
  }, [campaignId, refreshKey, loadedApprovals]);

  // Never show another campaign's stages while the new ones load.
  return state.campaignId === campaignId ? state.index : null;
}
