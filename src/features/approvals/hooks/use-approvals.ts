import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  cancelSchedule,
  createApproval,
  listApprovalEligibleDrafts,
  listApprovals,
  recordPublishAttempt,
  scheduleApproval,
  setApprovalStatus,
} from "@/features/approvals/data";
import type {
  ApprovalEligibleDraft,
  ApprovalWithDetails,
  CancelScheduleInput,
  CreateApprovalInput,
  RecordPublishAttemptInput,
  ScheduleApprovalInput,
  SetApprovalStatusInput,
} from "@/features/approvals/types";
import { listCampaigns } from "@/features/campaigns/data";
import type { CampaignWithKeywords } from "@/features/campaigns/types";
import { getSafetySettings } from "@/features/safety/data";
import type { SafetySettings } from "@/features/safety/types";

interface UseApprovalsState {
  approvals: ApprovalWithDetails[];
  eligibleDrafts: ApprovalEligibleDraft[];
  campaigns: CampaignWithKeywords[];
  selectedCampaignId: number | null;
  loading: boolean;
  error: string | null;
  killSwitchEnabled: boolean;
  killSwitchReason: string;
  loadApprovals: () => Promise<void>;
  selectCampaign: (id: number | null) => void;
  createReview: (input: CreateApprovalInput) => Promise<void>;
  setReviewStatus: (input: SetApprovalStatusInput) => Promise<void>;
  scheduleReview: (input: ScheduleApprovalInput) => Promise<void>;
  cancelScheduleJob: (input: CancelScheduleInput) => Promise<void>;
  recordPublishResult: (input: RecordPublishAttemptInput) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected approvals error";
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

export function useApprovals(): UseApprovalsState {
  const [approvals, setApprovals] = useState<ApprovalWithDetails[]>([]);
  const [eligibleDrafts, setEligibleDrafts] = useState<ApprovalEligibleDraft[]>(
    [],
  );
  const [campaigns, setCampaigns] = useState<CampaignWithKeywords[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [safetySettings, setSafetySettings] = useState<SafetySettings | null>(
    null,
  );

  const loadApprovalsForCampaign = useCallback(
    async (campaignId: number | null) => {
      if (campaignId === null) {
        setApprovals([]);
        setEligibleDrafts([]);
        return;
      }

      const [loadedApprovals, loadedEligibleDrafts] = await Promise.all([
        listApprovals(campaignId),
        listApprovalEligibleDrafts(campaignId),
      ]);
      setApprovals(loadedApprovals);
      setEligibleDrafts(loadedEligibleDrafts);
    },
    [],
  );

  const loadApprovals = useCallback(async () => {
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
      await loadApprovalsForCampaign(nextCampaignId);
    } catch (caught) {
      const message = getErrorMessage(caught);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [loadApprovalsForCampaign, selectedCampaignId]);

  useEffect(() => {
    void loadApprovals();
  }, [loadApprovals]);

  const selectCampaign = useCallback(
    (id: number | null) => {
      setSelectedCampaignId(id);
      void loadApprovalsForCampaign(id);
    },
    [loadApprovalsForCampaign],
  );

  const createReview = useCallback(
    async (input: CreateApprovalInput) => {
      try {
        await createApproval(input);
        await loadApprovalsForCampaign(selectedCampaignId);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("Approval record was not created", {
          description: message,
        });
        throw caught;
      }
    },
    [loadApprovalsForCampaign, selectedCampaignId],
  );

  const setReviewStatus = useCallback(
    async (input: SetApprovalStatusInput) => {
      try {
        await setApprovalStatus(input);
        await loadApprovalsForCampaign(selectedCampaignId);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("Approval status was not changed", {
          description: message,
        });
        throw caught;
      }
    },
    [loadApprovalsForCampaign, selectedCampaignId],
  );

  const scheduleReview = useCallback(
    async (input: ScheduleApprovalInput) => {
      try {
        await scheduleApproval(input);
        await loadApprovalsForCampaign(selectedCampaignId);
      } catch (caught) {
        const message = getErrorMessage(caught);
        void getSafetySettings()
          .then(setSafetySettings)
          .catch(() => undefined);
        toast.error("Approval was not scheduled", { description: message });
        throw caught;
      }
    },
    [loadApprovalsForCampaign, selectedCampaignId],
  );

  const cancelScheduleJob = useCallback(
    async (input: CancelScheduleInput) => {
      try {
        await cancelSchedule(input);
        await loadApprovalsForCampaign(selectedCampaignId);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("Schedule was not cancelled", { description: message });
        throw caught;
      }
    },
    [loadApprovalsForCampaign, selectedCampaignId],
  );

  const recordPublishResult = useCallback(
    async (input: RecordPublishAttemptInput) => {
      try {
        await recordPublishAttempt(input);
        await loadApprovalsForCampaign(selectedCampaignId);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("Publish attempt was not recorded", {
          description: message,
        });
        throw caught;
      }
    },
    [loadApprovalsForCampaign, selectedCampaignId],
  );

  return useMemo(
    () => ({
      approvals,
      eligibleDrafts,
      campaigns,
      selectedCampaignId,
      loading,
      error,
      killSwitchEnabled: safetySettings?.global_kill_switch === 1,
      killSwitchReason: safetySettings?.kill_switch_reason ?? "",
      loadApprovals,
      selectCampaign,
      createReview,
      setReviewStatus,
      scheduleReview,
      cancelScheduleJob,
      recordPublishResult,
    }),
    [
      approvals,
      eligibleDrafts,
      campaigns,
      selectedCampaignId,
      loading,
      error,
      safetySettings,
      loadApprovals,
      selectCampaign,
      createReview,
      setReviewStatus,
      scheduleReview,
      cancelScheduleJob,
      recordPublishResult,
    ],
  );
}
