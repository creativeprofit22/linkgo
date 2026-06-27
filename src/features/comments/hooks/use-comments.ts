import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { listCampaigns } from "@/features/campaigns/data";
import type { CampaignWithKeywords } from "@/features/campaigns/types";
import {
  createCommentThread,
  listCommentEligibleCandidates,
  listCommentThreads,
  recordCommentAttempt,
  setCommentThreadStatus,
  setCommentVariantStatus,
  updateCommentThread,
  updateCommentVariant,
} from "@/features/comments/data";
import type {
  CommentEligibleCandidate,
  CommentThreadWithDetails,
  CreateCommentThreadInput,
  RecordCommentAttemptInput,
  SetCommentThreadStatusInput,
  SetCommentVariantStatusInput,
  UpdateCommentThreadInput,
  UpdateCommentVariantInput,
} from "@/features/comments/types";
import { getSafetySettings } from "@/features/safety/data";
import type { SafetySettings } from "@/features/safety/types";

interface UseCommentsState {
  campaigns: CampaignWithKeywords[];
  selectedCampaignId: number | null;
  commentThreads: CommentThreadWithDetails[];
  eligibleCandidates: CommentEligibleCandidate[];
  loading: boolean;
  error: string | null;
  killSwitchEnabled: boolean;
  killSwitchReason: string;
  loadComments: () => Promise<void>;
  selectCampaign: (id: number | null) => void;
  createThread: (input: CreateCommentThreadInput) => Promise<void>;
  updateThread: (input: UpdateCommentThreadInput) => Promise<void>;
  updateVariant: (input: UpdateCommentVariantInput) => Promise<void>;
  selectVariant: (input: SetCommentVariantStatusInput) => Promise<void>;
  setReviewStatus: (input: SetCommentThreadStatusInput) => Promise<void>;
  recordAttempt: (input: RecordCommentAttemptInput) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected comments error";
}

function getDefaultCampaignId(
  campaigns: CampaignWithKeywords[],
): number | null {
  return (
    campaigns.find((campaign) => campaign.status !== "archived")?.id ??
    campaigns[0]?.id ??
    null
  );
}

export function useComments(): UseCommentsState {
  const [campaigns, setCampaigns] = useState<CampaignWithKeywords[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null,
  );
  const [commentThreads, setCommentThreads] = useState<
    CommentThreadWithDetails[]
  >([]);
  const [eligibleCandidates, setEligibleCandidates] = useState<
    CommentEligibleCandidate[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [safetySettings, setSafetySettings] = useState<SafetySettings | null>(
    null,
  );

  const loadCommentsForCampaign = useCallback(
    async (campaignId: number | null) => {
      if (campaignId === null) {
        setCommentThreads([]);
        setEligibleCandidates([]);
        return;
      }

      const [loadedThreads, loadedCandidates] = await Promise.all([
        listCommentThreads(campaignId),
        listCommentEligibleCandidates(campaignId),
      ]);
      setCommentThreads(loadedThreads);
      setEligibleCandidates(loadedCandidates);
    },
    [],
  );

  const loadComments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedCampaigns, loadedSafetySettings] = await Promise.all([
        listCampaigns(),
        getSafetySettings(),
      ]);
      setCampaigns(loadedCampaigns);
      setSafetySettings(loadedSafetySettings);
      const campaignStillExists = loadedCampaigns.some(
        (campaign) => campaign.id === selectedCampaignId,
      );
      const nextCampaignId = campaignStillExists
        ? selectedCampaignId
        : getDefaultCampaignId(loadedCampaigns);
      setSelectedCampaignId(nextCampaignId);
      await loadCommentsForCampaign(nextCampaignId);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [loadCommentsForCampaign, selectedCampaignId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  const selectCampaign = useCallback(
    (id: number | null) => {
      setSelectedCampaignId(id);
      void loadCommentsForCampaign(id);
    },
    [loadCommentsForCampaign],
  );

  const createThread = useCallback(
    async (input: CreateCommentThreadInput) => {
      try {
        await createCommentThread(input);
        await loadCommentsForCampaign(selectedCampaignId);
      } catch (caught) {
        toast.error("Comment thread was not created", {
          description: getErrorMessage(caught),
        });
        throw caught;
      }
    },
    [loadCommentsForCampaign, selectedCampaignId],
  );

  const updateThread = useCallback(
    async (input: UpdateCommentThreadInput) => {
      try {
        await updateCommentThread(input);
        await loadCommentsForCampaign(selectedCampaignId);
      } catch (caught) {
        toast.error("Comment notes were not saved", {
          description: getErrorMessage(caught),
        });
        throw caught;
      }
    },
    [loadCommentsForCampaign, selectedCampaignId],
  );

  const updateVariant = useCallback(
    async (input: UpdateCommentVariantInput) => {
      try {
        await updateCommentVariant(input);
        await loadCommentsForCampaign(selectedCampaignId);
      } catch (caught) {
        toast.error("Comment variant was not saved", {
          description: getErrorMessage(caught),
        });
        throw caught;
      }
    },
    [loadCommentsForCampaign, selectedCampaignId],
  );

  const selectVariant = useCallback(
    async (input: SetCommentVariantStatusInput) => {
      try {
        await setCommentVariantStatus(input);
        await loadCommentsForCampaign(selectedCampaignId);
      } catch (caught) {
        toast.error("Comment variant status was not changed", {
          description: getErrorMessage(caught),
        });
        throw caught;
      }
    },
    [loadCommentsForCampaign, selectedCampaignId],
  );

  const setReviewStatus = useCallback(
    async (input: SetCommentThreadStatusInput) => {
      try {
        await setCommentThreadStatus(input);
        await loadCommentsForCampaign(selectedCampaignId);
      } catch (caught) {
        toast.error("Comment review status was not changed", {
          description: getErrorMessage(caught),
        });
        throw caught;
      }
    },
    [loadCommentsForCampaign, selectedCampaignId],
  );

  const recordAttempt = useCallback(
    async (input: RecordCommentAttemptInput) => {
      try {
        await recordCommentAttempt(input);
        const [loadedSafetySettings] = await Promise.all([
          getSafetySettings(),
          loadCommentsForCampaign(selectedCampaignId),
        ]);
        setSafetySettings(loadedSafetySettings);
      } catch (caught) {
        void getSafetySettings()
          .then(setSafetySettings)
          .catch(() => undefined);
        toast.error("Comment attempt was not recorded", {
          description: getErrorMessage(caught),
        });
        throw caught;
      }
    },
    [loadCommentsForCampaign, selectedCampaignId],
  );

  return useMemo(
    () => ({
      campaigns,
      selectedCampaignId,
      commentThreads,
      eligibleCandidates,
      loading,
      error,
      killSwitchEnabled: safetySettings?.global_kill_switch === 1,
      killSwitchReason: safetySettings?.kill_switch_reason ?? "",
      loadComments,
      selectCampaign,
      createThread,
      updateThread,
      updateVariant,
      selectVariant,
      setReviewStatus,
      recordAttempt,
    }),
    [
      campaigns,
      selectedCampaignId,
      commentThreads,
      eligibleCandidates,
      loading,
      error,
      safetySettings,
      loadComments,
      selectCampaign,
      createThread,
      updateThread,
      updateVariant,
      selectVariant,
      setReviewStatus,
      recordAttempt,
    ],
  );
}
