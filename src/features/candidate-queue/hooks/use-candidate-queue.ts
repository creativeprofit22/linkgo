import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { listCampaigns } from "@/features/campaigns/data";
import type { CampaignWithKeywords } from "@/features/campaigns/types";
import {
  createCandidate,
  deleteCandidate,
  dismissDiscoveryItem as dismissDiscoveryItemRecord,
  listCandidatePage,
  listDiscoveryItems,
  promoteDiscoveryItem as promoteDiscoveryItemRecord,
  runCandidateDiscovery,
  scoreCandidates,
  setCandidateStatus,
  updateCandidate as updateCandidateRecord,
} from "@/features/candidate-queue/data";
import { toPlainMessage } from "@/lib/plain-message";
import type {
  CandidateDiscoveryItem,
  CandidateStatus,
  CandidateWithTarget,
  CreateCandidateInput,
  DismissDiscoveryItemInput,
  PromoteDiscoveryItemInput,
  RunCandidateDiscoveryInput,
  ScoreCandidatesInput,
  UpdateCandidateInput,
} from "@/features/candidate-queue/types";

interface UseCandidateQueueState {
  candidates: CandidateWithTarget[];
  /** Candidates matching the campaign before the native list cap. */
  candidateTotalCount: number;
  discoveryItems: CandidateDiscoveryItem[];
  campaigns: CampaignWithKeywords[];
  selectedCampaignId: number | null;
  loading: boolean;
  error: string | null;
  loadQueue: () => Promise<void>;
  selectCampaign: (id: number | null) => void;
  addCandidate: (input: CreateCandidateInput) => Promise<void>;
  updateCandidate: (input: UpdateCandidateInput) => Promise<void>;
  setStatus: (id: number, status: CandidateStatus) => Promise<void>;
  removeCandidate: (id: number) => Promise<void>;
  runDiscovery: (input: RunCandidateDiscoveryInput) => Promise<void>;
  scoreSelectedCandidates: (input: ScoreCandidatesInput) => Promise<void>;
  promoteDiscoveryItem: (input: PromoteDiscoveryItemInput) => Promise<void>;
  dismissDiscoveryItem: (input: DismissDiscoveryItemInput) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? toPlainMessage(error.message)
    : "Something went wrong with your ideas. Please try again.";
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

export function useCandidateQueue(): UseCandidateQueueState {
  const [candidates, setCandidates] = useState<CandidateWithTarget[]>([]);
  const [candidateTotalCount, setCandidateTotalCount] = useState(0);
  const [discoveryItems, setDiscoveryItems] = useState<
    CandidateDiscoveryItem[]
  >([]);
  const [campaigns, setCampaigns] = useState<CampaignWithKeywords[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedCampaignIdRef = useRef<number | null>(null);
  const campaignRequestIdRef = useRef(0);

  const loadCandidatesForCampaign = useCallback(
    async (campaignId: number | null, requestId: number): Promise<void> => {
      if (campaignId === null) return;

      try {
        const [loadedPage, loadedDiscoveryItems] = await Promise.all([
          listCandidatePage(campaignId),
          listDiscoveryItems(campaignId),
        ]);
        if (
          campaignRequestIdRef.current !== requestId ||
          selectedCampaignIdRef.current !== campaignId
        ) {
          return;
        }
        setCandidates(loadedPage.items);
        setCandidateTotalCount(loadedPage.totalCount);
        setDiscoveryItems(loadedDiscoveryItems);
      } catch (caught) {
        if (
          campaignRequestIdRef.current === requestId &&
          selectedCampaignIdRef.current === campaignId
        ) {
          setError(getErrorMessage(caught));
        }
      }
    },
    [],
  );

  const loadSelectedCampaign = useCallback(
    async (
      campaignId: number | null,
      clearExisting: boolean,
    ): Promise<void> => {
      const requestId = campaignRequestIdRef.current + 1;
      campaignRequestIdRef.current = requestId;
      selectedCampaignIdRef.current = campaignId;
      setSelectedCampaignId(campaignId);
      setLoading(false);
      setError(null);
      if (clearExisting || campaignId === null) {
        setCandidates([]);
        setCandidateTotalCount(0);
        setDiscoveryItems([]);
      }
      await loadCandidatesForCampaign(campaignId, requestId);
    },
    [loadCandidatesForCampaign],
  );

  const reloadSelectedCampaign = useCallback(async (): Promise<void> => {
    await loadSelectedCampaign(selectedCampaignIdRef.current, false);
  }, [loadSelectedCampaign]);

  const loadQueue = useCallback(async () => {
    const requestId = campaignRequestIdRef.current + 1;
    campaignRequestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const loadedCampaigns = await listCampaigns();
      if (campaignRequestIdRef.current !== requestId) return;

      setCampaigns(loadedCampaigns);
      const currentCampaignId = selectedCampaignIdRef.current;
      const campaignStillExists = loadedCampaigns.some(
        (campaign) => campaign.id === currentCampaignId,
      );
      const nextCampaignId = campaignStillExists
        ? currentCampaignId
        : getDefaultCampaignId(loadedCampaigns);
      selectedCampaignIdRef.current = nextCampaignId;
      setSelectedCampaignId(nextCampaignId);
      setCandidates([]);
      setCandidateTotalCount(0);
      setDiscoveryItems([]);
      await loadCandidatesForCampaign(nextCampaignId, requestId);
    } catch (caught) {
      if (campaignRequestIdRef.current === requestId) {
        setError(getErrorMessage(caught));
      }
    } finally {
      if (campaignRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [loadCandidatesForCampaign]);

  useEffect(() => {
    void loadQueue();
    return () => {
      campaignRequestIdRef.current += 1;
    };
  }, [loadQueue]);

  const selectCampaign = useCallback(
    (id: number | null) => {
      void loadSelectedCampaign(id, true);
    },
    [loadSelectedCampaign],
  );

  const addCandidate = useCallback(
    async (input: CreateCandidateInput) => {
      try {
        await createCandidate(input);
        await loadSelectedCampaign(input.campaignId, true);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("We couldn't add this idea", { description: message });
        throw caught;
      }
    },
    [loadSelectedCampaign],
  );

  const updateCandidate = useCallback(
    async (input: UpdateCandidateInput) => {
      try {
        await updateCandidateRecord(input);
        await reloadSelectedCampaign();
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("We couldn't update this idea", { description: message });
        throw caught;
      }
    },
    [reloadSelectedCampaign],
  );

  const setStatus = useCallback(
    async (id: number, status: CandidateStatus) => {
      try {
        await setCandidateStatus(id, status);
        await reloadSelectedCampaign();
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("We couldn't change this idea's status", {
          description: message,
        });
        throw caught;
      }
    },
    [reloadSelectedCampaign],
  );

  const removeCandidate = useCallback(
    async (id: number) => {
      try {
        await deleteCandidate(id);
        await reloadSelectedCampaign();
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("We couldn't delete this idea", { description: message });
        throw caught;
      }
    },
    [reloadSelectedCampaign],
  );

  const runDiscovery = useCallback(
    async (input: RunCandidateDiscoveryInput) => {
      try {
        await runCandidateDiscovery(input);
        await loadSelectedCampaign(input.campaignId, true);
        toast.success("New topic ideas found");
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("We couldn't find topics", { description: message });
        throw caught;
      }
    },
    [loadSelectedCampaign],
  );

  const scoreSelectedCandidates = useCallback(
    async (input: ScoreCandidatesInput) => {
      try {
        await scoreCandidates(input);
        await loadSelectedCampaign(input.campaignId, true);
        toast.success("Ideas scored");
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("We couldn't score your ideas", { description: message });
        throw caught;
      }
    },
    [loadSelectedCampaign],
  );

  const promoteDiscoveryItem = useCallback(
    async (input: PromoteDiscoveryItemInput) => {
      try {
        await promoteDiscoveryItemRecord(input);
        if (selectedCampaignIdRef.current === input.campaignId) {
          await reloadSelectedCampaign();
        }
        setCampaigns(await listCampaigns());
        toast.success("Keyword added");
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("We couldn't add this keyword", { description: message });
        throw caught;
      }
    },
    [reloadSelectedCampaign],
  );

  const dismissDiscoveryItem = useCallback(
    async (input: DismissDiscoveryItemInput) => {
      try {
        await dismissDiscoveryItemRecord(input);
        if (selectedCampaignIdRef.current === input.campaignId) {
          await reloadSelectedCampaign();
        }
        toast.success("Topic idea dismissed");
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("We couldn't dismiss this topic idea", {
          description: message,
        });
        throw caught;
      }
    },
    [reloadSelectedCampaign],
  );

  return useMemo(
    () => ({
      candidates,
      candidateTotalCount,
      discoveryItems,
      campaigns,
      selectedCampaignId,
      loading,
      error,
      loadQueue,
      selectCampaign,
      addCandidate,
      updateCandidate,
      setStatus,
      removeCandidate,
      runDiscovery,
      scoreSelectedCandidates,
      promoteDiscoveryItem,
      dismissDiscoveryItem,
    }),
    [
      candidates,
      candidateTotalCount,
      discoveryItems,
      campaigns,
      selectedCampaignId,
      loading,
      error,
      loadQueue,
      selectCampaign,
      addCandidate,
      updateCandidate,
      setStatus,
      removeCandidate,
      runDiscovery,
      scoreSelectedCandidates,
      promoteDiscoveryItem,
      dismissDiscoveryItem,
    ],
  );
}
