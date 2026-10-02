import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  cancelSchedule,
  createApproval,
  listApprovalEligibleDraftPage,
  listApprovalPage,
  recordPublishAttempt,
  scheduleApproval,
  setApprovalStatus,
} from "@/features/approvals/data";
import { toPlainMessage } from "@/lib/plain-message";
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
import {
  listOpenPublishExecutions,
  type OpenPublishExecution,
} from "@/features/publish-reconciliation";
import type { SafetySettings } from "@/features/safety/types";
import { isDesktopRequiredError } from "@/lib/tauri";
import { usePostStageIndex, type PostStageIndex } from "@/features/post-stages";

export interface UseApprovalsOptions {
  /**
   * Campaign requested by a link. Selected when it exists, on first load and
   * whenever a new link arrives while Approvals stays open.
   */
  initialCampaignId?: number | undefined;
}

interface UseApprovalsState {
  approvals: ApprovalWithDetails[];
  /** Uncapped approval count; above `approvals.length` when the list is capped. */
  approvalTotal: number;
  eligibleDrafts: ApprovalEligibleDraft[];
  /** Uncapped eligible-draft count; above `eligibleDrafts.length` when capped. */
  eligibleDraftTotal: number;
  campaigns: CampaignWithKeywords[];
  selectedCampaignId: number | null;
  loading: boolean;
  /** True while the approvals of a newly selected campaign are loading. */
  campaignLoading: boolean;
  error: string | null;
  killSwitchEnabled: boolean;
  killSwitchReason: string;
  /** Native publish executions still blocking a new publish. */
  openPublishExecutions: OpenPublishExecution[];
  /** Post stage per approval; `null` while loading or if the read failed. */
  stageIndex: PostStageIndex | null;
  loadApprovals: () => Promise<void>;
  selectCampaign: (id: number | null) => void;
  /** Resolves with the new approval's id. */
  createReview: (input: CreateApprovalInput) => Promise<number>;
  setReviewStatus: (input: SetApprovalStatusInput) => Promise<void>;
  scheduleReview: (input: ScheduleApprovalInput) => Promise<void>;
  cancelScheduleJob: (input: CancelScheduleInput) => Promise<void>;
  recordPublishResult: (input: RecordPublishAttemptInput) => Promise<void>;
  /** Reloads the selected campaign and safety state without a loading state. */
  refreshApprovals: () => Promise<void>;
}

type ReloadResult = { ok: true } | { ok: false; error: string };

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? toPlainMessage(error.message)
    : "Something went wrong with approvals. Try again.";
}

/**
 * Toast title for a failed mutation: preview restrictions are not desktop
 * failures, so they get their own title instead of "... was not created".
 */
function getMutationFailureTitle(error: unknown, fallback: string): string {
  return isDesktopRequiredError(error) ? "Desktop app required" : fallback;
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

export function useApprovals(
  options: UseApprovalsOptions = {},
): UseApprovalsState {
  const { initialCampaignId } = options;
  const [approvals, setApprovals] = useState<ApprovalWithDetails[]>([]);
  const [approvalTotal, setApprovalTotal] = useState(0);
  const [eligibleDrafts, setEligibleDrafts] = useState<ApprovalEligibleDraft[]>(
    [],
  );
  const [eligibleDraftTotal, setEligibleDraftTotal] = useState(0);
  const [campaigns, setCampaigns] = useState<CampaignWithKeywords[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [safetySettings, setSafetySettings] = useState<SafetySettings | null>(
    null,
  );
  const [openPublishExecutions, setOpenPublishExecutions] = useState<
    OpenPublishExecution[]
  >([]);

  // Request ownership: only the latest request for the current selection may
  // write campaign-scoped approval data. Everything else is discarded.
  const selectedCampaignIdRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  // Read inside loadApprovals without making a link change reload everything.
  const requestedCampaignIdRef = useRef(initialCampaignId);
  const campaignsRef = useRef<CampaignWithKeywords[]>([]);
  // Reloads whenever the approval list reloads (after every mutation) and
  // reuses that list, so approvals are read once per load.
  const stageIndex = usePostStageIndex(
    selectedCampaignId,
    approvals,
    approvals,
  );

  const isCurrentRequest = useCallback(
    (requestId: number, campaignId: number | null) =>
      requestId === requestIdRef.current &&
      campaignId === selectedCampaignIdRef.current,
    [],
  );

  /**
   * Loads campaign-scoped approval data and applies it only while the request
   * still owns the selection. Stale results and stale failures are dropped;
   * a failure of the current request is rethrown for the caller to surface.
   */
  const loadApprovalsForCampaign = useCallback(
    async (campaignId: number | null, requestId: number): Promise<void> => {
      if (campaignId === null) {
        if (!isCurrentRequest(requestId, campaignId)) return;
        setApprovals([]);
        setApprovalTotal(0);
        setEligibleDrafts([]);
        setEligibleDraftTotal(0);
        setOpenPublishExecutions([]);
        return;
      }

      try {
        const [approvalPage, eligibleDraftPage, loadedExecutions] =
          await Promise.all([
            listApprovalPage(campaignId),
            listApprovalEligibleDraftPage(campaignId),
            listOpenPublishExecutions(),
          ]);
        if (!isCurrentRequest(requestId, campaignId)) return;
        setApprovals(approvalPage.items);
        setApprovalTotal(approvalPage.totalCount);
        setEligibleDrafts(eligibleDraftPage.items);
        setEligibleDraftTotal(eligibleDraftPage.totalCount);
        setOpenPublishExecutions(loadedExecutions);
      } catch (caught) {
        if (!isCurrentRequest(requestId, campaignId)) return;
        throw caught;
      }
    },
    [isCurrentRequest],
  );

  /**
   * Reloads whatever campaign is selected now, not when the caller started.
   * Never throws: a failure of the still-current request clears the cards and
   * surfaces the error state so stale approvals cannot be acted on. Failures of
   * superseded requests are dropped and reported as success.
   */
  const reloadSelectedCampaign =
    useCallback(async (): Promise<ReloadResult> => {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      const campaignId = selectedCampaignIdRef.current;
      try {
        await loadApprovalsForCampaign(campaignId, requestId);
        if (isCurrentRequest(requestId, campaignId)) setError(null);
        return { ok: true };
      } catch (caught) {
        // loadApprovalsForCampaign only rethrows for the current request.
        const message = getErrorMessage(caught);
        if (!isCurrentRequest(requestId, campaignId)) return { ok: true };
        setApprovals([]);
        setApprovalTotal(0);
        setEligibleDrafts([]);
        setEligibleDraftTotal(0);
        setOpenPublishExecutions([]);
        setError(message);
        return { ok: false, error: message };
      } finally {
        // This request superseded any pending selection load, so it owns the
        // loading flag for the current selection too.
        if (isCurrentRequest(requestId, campaignId)) setCampaignLoading(false);
      }
    }, [isCurrentRequest, loadApprovalsForCampaign]);

  /** Reloads after a committed mutation; a reload failure is not a mutation failure. */
  const reloadAfterMutation = useCallback(async (): Promise<void> => {
    const result = await reloadSelectedCampaign();
    if (!result.ok) {
      toast.error("Saved, but we couldn't refresh your approvals", {
        description: result.error,
      });
    }
  }, [reloadSelectedCampaign]);

  const loadApprovals = useCallback(async () => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    setLoading(true);
    setCampaignLoading(false);
    setError(null);
    try {
      const [loadedCampaigns, loadedSafetySettings] = await Promise.all([
        listCampaigns(),
        getSafetySettings(),
      ]);
      setCampaigns(loadedCampaigns);
      campaignsRef.current = loadedCampaigns;
      setSafetySettings(loadedSafetySettings);
      // A selection made while campaigns loaded owns the approval data now.
      if (requestId !== requestIdRef.current) return;
      const currentCampaignId = selectedCampaignIdRef.current;
      const campaignStillExists = loadedCampaigns.some(
        (campaign) => campaign.id === currentCampaignId,
      );
      const requestedCampaignId = requestedCampaignIdRef.current;
      const requestedCampaignExists = loadedCampaigns.some(
        (campaign) => campaign.id === requestedCampaignId,
      );
      const nextCampaignId = campaignStillExists
        ? currentCampaignId
        : requestedCampaignExists && requestedCampaignId !== undefined
          ? requestedCampaignId
          : getDefaultCampaignId(loadedCampaigns);
      selectedCampaignIdRef.current = nextCampaignId;
      setSelectedCampaignId(nextCampaignId);
      await loadApprovalsForCampaign(nextCampaignId, requestId);
    } catch (caught) {
      if (requestId !== requestIdRef.current) return;
      setApprovals([]);
      setApprovalTotal(0);
      setEligibleDrafts([]);
      setEligibleDraftTotal(0);
      setOpenPublishExecutions([]);
      setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [loadApprovalsForCampaign]);

  useEffect(() => {
    void loadApprovals();
  }, [loadApprovals]);

  const selectCampaign = useCallback(
    (id: number | null) => {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      selectedCampaignIdRef.current = id;
      setSelectedCampaignId(id);
      // Never leave the previous campaign's cards actionable under this one.
      setApprovals([]);
      setApprovalTotal(0);
      setEligibleDrafts([]);
      setEligibleDraftTotal(0);
      setOpenPublishExecutions([]);
      setError(null);
      setCampaignLoading(id !== null);

      void (async () => {
        try {
          await loadApprovalsForCampaign(id, requestId);
        } catch (caught) {
          if (isCurrentRequest(requestId, id)) {
            setError(getErrorMessage(caught));
          }
        } finally {
          if (isCurrentRequest(requestId, id)) setCampaignLoading(false);
        }
      })();
    },
    [isCurrentRequest, loadApprovalsForCampaign],
  );

  // A new link while Approvals stays open selects its campaign when it exists.
  useEffect(() => {
    if (requestedCampaignIdRef.current === initialCampaignId) return;
    requestedCampaignIdRef.current = initialCampaignId;
    if (
      initialCampaignId === undefined ||
      initialCampaignId === selectedCampaignIdRef.current
    )
      return;
    if (!campaignsRef.current.some((c) => c.id === initialCampaignId)) return;
    selectCampaign(initialCampaignId);
  }, [initialCampaignId, selectCampaign]);

  const createReview = useCallback(
    async (input: CreateApprovalInput): Promise<number> => {
      let approvalId: number;
      try {
        approvalId = await createApproval(input);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error(
          getMutationFailureTitle(caught, "We couldn't send it for approval"),
          {
            description: message,
          },
        );
        throw caught;
      }
      await reloadAfterMutation();
      return approvalId;
    },
    [reloadAfterMutation],
  );

  const setReviewStatus = useCallback(
    async (input: SetApprovalStatusInput) => {
      try {
        await setApprovalStatus(input);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error(
          getMutationFailureTitle(caught, "We couldn't update this approval"),
          {
            description: message,
          },
        );
        throw caught;
      }
      await reloadAfterMutation();
    },
    [reloadAfterMutation],
  );

  const scheduleReview = useCallback(
    async (input: ScheduleApprovalInput) => {
      try {
        await scheduleApproval(input);
      } catch (caught) {
        const message = getErrorMessage(caught);
        void getSafetySettings()
          .then(setSafetySettings)
          .catch(() => undefined);
        toast.error(
          getMutationFailureTitle(caught, "We couldn't schedule this post"),
          { description: message },
        );
        throw caught;
      }
      await reloadAfterMutation();
    },
    [reloadAfterMutation],
  );

  const cancelScheduleJob = useCallback(
    async (input: CancelScheduleInput) => {
      try {
        await cancelSchedule(input);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error(
          getMutationFailureTitle(caught, "We couldn't cancel the schedule"),
          { description: message },
        );
        throw caught;
      }
      await reloadAfterMutation();
    },
    [reloadAfterMutation],
  );

  const recordPublishResult = useCallback(
    async (input: RecordPublishAttemptInput) => {
      try {
        await recordPublishAttempt(input);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error(
          getMutationFailureTitle(
            caught,
            "We couldn't save the posting result",
          ),
          {
            description: message,
          },
        );
        throw caught;
      }
      await reloadAfterMutation();
    },
    [reloadAfterMutation],
  );

  const refreshApprovals = useCallback(async () => {
    const safetyLoad = (async (): Promise<ReloadResult> => {
      try {
        setSafetySettings(await getSafetySettings());
        return { ok: true };
      } catch (caught) {
        return { ok: false, error: getErrorMessage(caught) };
      }
    })();
    // A failed reload of the current selection sets the error state itself.
    const [safetyResult, reloadResult] = await Promise.all([
      safetyLoad,
      reloadSelectedCampaign(),
    ]);
    const failure = !reloadResult.ok
      ? reloadResult
      : !safetyResult.ok
        ? safetyResult
        : null;
    if (failure) {
      toast.error("We couldn't refresh your approvals", {
        description: failure.error,
      });
    }
  }, [reloadSelectedCampaign]);

  return useMemo(
    () => ({
      approvals,
      approvalTotal,
      eligibleDrafts,
      eligibleDraftTotal,
      campaigns,
      selectedCampaignId,
      loading,
      campaignLoading,
      error,
      killSwitchEnabled: safetySettings?.global_kill_switch === 1,
      killSwitchReason: safetySettings?.kill_switch_reason ?? "",
      openPublishExecutions,
      stageIndex,
      loadApprovals,
      selectCampaign,
      createReview,
      setReviewStatus,
      scheduleReview,
      cancelScheduleJob,
      recordPublishResult,
      refreshApprovals,
    }),
    [
      stageIndex,
      approvals,
      approvalTotal,
      eligibleDrafts,
      eligibleDraftTotal,
      campaigns,
      selectedCampaignId,
      loading,
      campaignLoading,
      error,
      safetySettings,
      openPublishExecutions,
      loadApprovals,
      selectCampaign,
      createReview,
      setReviewStatus,
      scheduleReview,
      cancelScheduleJob,
      recordPublishResult,
      refreshApprovals,
    ],
  );
}
