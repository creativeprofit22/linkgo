import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { listCampaigns } from "@/features/campaigns/data";
import type { CampaignWithKeywords } from "@/features/campaigns/types";
import {
  createCandidate,
  deleteCandidate,
  dismissDiscoveryItem as dismissDiscoveryItemRecord,
  listCandidates,
  listDiscoveryItems,
  promoteDiscoveryItem as promoteDiscoveryItemRecord,
  runCandidateDiscovery,
  scoreCandidates,
  setCandidateStatus,
  updateCandidate as updateCandidateRecord,
} from "@/features/candidate-queue/data";
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
    ? error.message
    : "Unexpected candidate queue error";
}

function getDefaultCampaignId(
  campaigns: CampaignWithKeywords[],
): number | null {
  return (
    campaigns.find((campaign) => campaign.status !== "archived")?.id ?? null
  );
}

export function useCandidateQueue(): UseCandidateQueueState {
  const [candidates, setCandidates] = useState<CandidateWithTarget[]>([]);
  const [discoveryItems, setDiscoveryItems] = useState<
    CandidateDiscoveryItem[]
  >([]);
  const [campaigns, setCampaigns] = useState<CampaignWithKeywords[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCandidatesForCampaign = useCallback(
    async (campaignId: number | null) => {
      if (campaignId === null) {
        setCandidates([]);
        setDiscoveryItems([]);
        return;
      }
      const [loadedCandidates, loadedDiscoveryItems] = await Promise.all([
        listCandidates(campaignId),
        listDiscoveryItems(campaignId),
      ]);
      setCandidates(loadedCandidates);
      setDiscoveryItems(loadedDiscoveryItems);
    },
    [],
  );

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loadedCampaigns = await listCampaigns();
      setCampaigns(loadedCampaigns);
      const campaignStillExists = loadedCampaigns.some(
        (campaign) => campaign.id === selectedCampaignId,
      );
      const nextCampaignId = campaignStillExists
        ? selectedCampaignId
        : getDefaultCampaignId(loadedCampaigns);
      setSelectedCampaignId(nextCampaignId);
      await loadCandidatesForCampaign(nextCampaignId);
    } catch (caught) {
      const message = getErrorMessage(caught);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [loadCandidatesForCampaign, selectedCampaignId]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const selectCampaign = useCallback(
    (id: number | null) => {
      setSelectedCampaignId(id);
      void loadCandidatesForCampaign(id);
    },
    [loadCandidatesForCampaign],
  );

  const addCandidate = useCallback(
    async (input: CreateCandidateInput) => {
      try {
        await createCandidate(input);
        setSelectedCampaignId(input.campaignId);
        await loadCandidatesForCampaign(input.campaignId);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("Candidate was not added", { description: message });
        throw caught;
      }
    },
    [loadCandidatesForCampaign],
  );

  const updateCandidate = useCallback(
    async (input: UpdateCandidateInput) => {
      try {
        await updateCandidateRecord(input);
        await loadCandidatesForCampaign(selectedCampaignId);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("Candidate was not updated", { description: message });
        throw caught;
      }
    },
    [loadCandidatesForCampaign, selectedCampaignId],
  );

  const setStatus = useCallback(
    async (id: number, status: CandidateStatus) => {
      try {
        await setCandidateStatus(id, status);
        await loadCandidatesForCampaign(selectedCampaignId);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("Candidate status was not changed", {
          description: message,
        });
        throw caught;
      }
    },
    [loadCandidatesForCampaign, selectedCampaignId],
  );

  const removeCandidate = useCallback(
    async (id: number) => {
      try {
        await deleteCandidate(id);
        await loadCandidatesForCampaign(selectedCampaignId);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("Candidate was not deleted", { description: message });
        throw caught;
      }
    },
    [loadCandidatesForCampaign, selectedCampaignId],
  );

  const runDiscovery = useCallback(
    async (input: RunCandidateDiscoveryInput) => {
      try {
        await runCandidateDiscovery(input);
        setSelectedCampaignId(input.campaignId);
        await loadCandidatesForCampaign(input.campaignId);
        toast.success("Discovery run completed");
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("Discovery was not run", { description: message });
        throw caught;
      }
    },
    [loadCandidatesForCampaign],
  );

  const scoreSelectedCandidates = useCallback(
    async (input: ScoreCandidatesInput) => {
      try {
        await scoreCandidates(input);
        setSelectedCampaignId(input.campaignId);
        await loadCandidatesForCampaign(input.campaignId);
        toast.success("Candidate scoring completed");
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("Candidates were not scored", { description: message });
        throw caught;
      }
    },
    [loadCandidatesForCampaign],
  );

  const promoteDiscoveryItem = useCallback(
    async (input: PromoteDiscoveryItemInput) => {
      try {
        await promoteDiscoveryItemRecord(input);
        await loadCandidatesForCampaign(input.campaignId);
        setCampaigns(await listCampaigns());
        toast.success("Keyword promoted");
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("Suggestion was not promoted", { description: message });
        throw caught;
      }
    },
    [loadCandidatesForCampaign],
  );

  const dismissDiscoveryItem = useCallback(
    async (input: DismissDiscoveryItemInput) => {
      try {
        await dismissDiscoveryItemRecord(input);
        await loadCandidatesForCampaign(input.campaignId);
        toast.success("Suggestion dismissed");
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("Suggestion was not dismissed", { description: message });
        throw caught;
      }
    },
    [loadCandidatesForCampaign],
  );

  return useMemo(
    () => ({
      candidates,
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
