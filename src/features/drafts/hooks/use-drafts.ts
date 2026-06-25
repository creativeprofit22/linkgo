import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { listCampaigns } from "@/features/campaigns/data";
import type { CampaignWithKeywords } from "@/features/campaigns/types";
import { listCandidates } from "@/features/candidate-queue/data";
import type { CandidateWithTarget } from "@/features/candidate-queue/types";
import {
  archiveDraft as archiveDraftRecord,
  createDraft,
  listDrafts,
  setDraftVariantStatus,
  updateDraft as updateDraftRecord,
  updateDraftVariant,
} from "@/features/drafts/data";
import type {
  CreateDraftInput,
  DraftWithDetails,
  SetDraftVariantStatusInput,
  UpdateDraftInput,
  UpdateDraftVariantInput,
} from "@/features/drafts/types";

interface UseDraftsState {
  drafts: DraftWithDetails[];
  campaigns: CampaignWithKeywords[];
  candidates: CandidateWithTarget[];
  selectedCampaignId: number | null;
  loading: boolean;
  error: string | null;
  loadDrafts: () => Promise<void>;
  selectCampaign: (id: number | null) => void;
  addDraft: (input: CreateDraftInput) => Promise<void>;
  updateDraft: (input: UpdateDraftInput) => Promise<void>;
  updateVariant: (input: UpdateDraftVariantInput) => Promise<void>;
  setVariantStatus: (input: SetDraftVariantStatusInput) => Promise<void>;
  archiveDraft: (id: number) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected drafts error";
}

function getDefaultCampaignId(
  campaigns: CampaignWithKeywords[],
): number | null {
  return (
    campaigns.find((campaign) => campaign.status !== "archived")?.id ?? null
  );
}

export function useDrafts(): UseDraftsState {
  const [drafts, setDrafts] = useState<DraftWithDetails[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignWithKeywords[]>([]);
  const [candidates, setCandidates] = useState<CandidateWithTarget[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDraftsForCampaign = useCallback(
    async (campaignId: number | null) => {
      if (campaignId === null) {
        setCandidates([]);
        setDrafts([]);
        return;
      }

      const [loadedCandidates, loadedDrafts] = await Promise.all([
        listCandidates(campaignId),
        listDrafts(campaignId),
      ]);
      setCandidates(loadedCandidates);
      setDrafts(loadedDrafts);
    },
    [],
  );

  const loadDrafts = useCallback(async () => {
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
      await loadDraftsForCampaign(nextCampaignId);
    } catch (caught) {
      const message = getErrorMessage(caught);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [loadDraftsForCampaign, selectedCampaignId]);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  const selectCampaign = useCallback(
    (id: number | null) => {
      setSelectedCampaignId(id);
      void loadDraftsForCampaign(id);
    },
    [loadDraftsForCampaign],
  );

  const addDraft = useCallback(
    async (input: CreateDraftInput) => {
      try {
        await createDraft(input);
        await loadDraftsForCampaign(selectedCampaignId);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("Draft was not created", { description: message });
        throw caught;
      }
    },
    [loadDraftsForCampaign, selectedCampaignId],
  );

  const updateDraft = useCallback(
    async (input: UpdateDraftInput) => {
      try {
        await updateDraftRecord(input);
        await loadDraftsForCampaign(selectedCampaignId);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("Draft was not updated", { description: message });
        throw caught;
      }
    },
    [loadDraftsForCampaign, selectedCampaignId],
  );

  const updateVariant = useCallback(
    async (input: UpdateDraftVariantInput) => {
      try {
        await updateDraftVariant(input);
        await loadDraftsForCampaign(selectedCampaignId);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("Draft variant was not updated", { description: message });
        throw caught;
      }
    },
    [loadDraftsForCampaign, selectedCampaignId],
  );

  const setVariantStatus = useCallback(
    async (input: SetDraftVariantStatusInput) => {
      try {
        await setDraftVariantStatus(input);
        await loadDraftsForCampaign(selectedCampaignId);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("Draft variant status was not changed", {
          description: message,
        });
        throw caught;
      }
    },
    [loadDraftsForCampaign, selectedCampaignId],
  );

  const archiveDraft = useCallback(
    async (id: number) => {
      try {
        await archiveDraftRecord(id);
        await loadDraftsForCampaign(selectedCampaignId);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("Draft was not archived", { description: message });
        throw caught;
      }
    },
    [loadDraftsForCampaign, selectedCampaignId],
  );

  return useMemo(
    () => ({
      drafts,
      campaigns,
      candidates,
      selectedCampaignId,
      loading,
      error,
      loadDrafts,
      selectCampaign,
      addDraft,
      updateDraft,
      updateVariant,
      setVariantStatus,
      archiveDraft,
    }),
    [
      drafts,
      campaigns,
      candidates,
      selectedCampaignId,
      loading,
      error,
      loadDrafts,
      selectCampaign,
      addDraft,
      updateDraft,
      updateVariant,
      setVariantStatus,
      archiveDraft,
    ],
  );
}
