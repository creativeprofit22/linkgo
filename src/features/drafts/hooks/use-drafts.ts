import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { listCampaigns } from "@/features/campaigns/data";
import type { CampaignWithKeywords } from "@/features/campaigns/types";
import { listCandidates } from "@/features/candidate-queue/data";
import type { CandidateWithTarget } from "@/features/candidate-queue/types";
import {
  archiveDraft as archiveDraftRecord,
  createDraft,
  dismissDraftGenerationRequest,
  generateDraftVariants,
  listDraftGenerationRequests,
  listEligibleDraftWorkflowOptions,
  listDrafts,
  runDraftAiAudit as runDraftAiAuditRecord,
  saveGeneratedDraft,
  setDraftVariantStatus,
  updateDraft as updateDraftRecord,
  updateDraftVariant,
} from "@/features/drafts/data";
import type {
  CreateDraftInput,
  DraftGenerationRequest,
  EligibleDraftWorkflowOption,
  DraftWithDetails,
  GenerateDraftVariantsInput,
  RunDraftAiAuditInput,
  SaveGeneratedDraftInput,
  SetDraftVariantStatusInput,
  UpdateDraftInput,
  UpdateDraftVariantInput,
} from "@/features/drafts/types";

interface UseDraftsState {
  drafts: DraftWithDetails[];
  generationRequests: DraftGenerationRequest[];
  campaigns: CampaignWithKeywords[];
  candidates: CandidateWithTarget[];
  eligibleWorkflowOptions: EligibleDraftWorkflowOption[];
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
  runDraftAiAudit: (input: RunDraftAiAuditInput) => Promise<void>;
  generateDraft: (input: GenerateDraftVariantsInput) => Promise<void>;
  saveGenerationRequest: (input: SaveGeneratedDraftInput) => Promise<void>;
  dismissGenerationRequest: (id: number) => Promise<void>;
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
  const [generationRequests, setGenerationRequests] = useState<
    DraftGenerationRequest[]
  >([]);
  const [campaigns, setCampaigns] = useState<CampaignWithKeywords[]>([]);
  const [candidates, setCandidates] = useState<CandidateWithTarget[]>([]);
  const [eligibleWorkflowOptions, setEligibleWorkflowOptions] = useState<
    EligibleDraftWorkflowOption[]
  >([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latestDraftsLoadRequest = useRef(0);
  const latestCampaignLoadRequest = useRef(0);

  const loadDraftsForCampaign = useCallback(
    async (campaignId: number | null) => {
      const requestId = ++latestCampaignLoadRequest.current;
      if (campaignId === null) {
        setCandidates([]);
        setDrafts([]);
        setGenerationRequests([]);
        setEligibleWorkflowOptions([]);
        return;
      }

      try {
        const [
          loadedCandidates,
          loadedDrafts,
          loadedGenerationRequests,
          loadedEligibleWorkflowOptions,
        ] = await Promise.all([
          listCandidates(campaignId),
          listDrafts(campaignId),
          listDraftGenerationRequests(campaignId),
          listEligibleDraftWorkflowOptions(campaignId),
        ]);
        if (requestId !== latestCampaignLoadRequest.current) return;

        setCandidates(loadedCandidates);
        setDrafts(loadedDrafts);
        setGenerationRequests(loadedGenerationRequests);
        setEligibleWorkflowOptions(loadedEligibleWorkflowOptions);
      } catch (caught) {
        if (requestId === latestCampaignLoadRequest.current) throw caught;
      }
    },
    [],
  );

  const loadDrafts = useCallback(async () => {
    const requestId = ++latestDraftsLoadRequest.current;
    setLoading(true);
    setError(null);
    try {
      const loadedCampaigns = await listCampaigns();
      if (requestId !== latestDraftsLoadRequest.current) return;

      setCampaigns(loadedCampaigns);
      const campaignStillExists = loadedCampaigns.some(
        (campaign) => campaign.id === selectedCampaignId,
      );
      const nextCampaignId = campaignStillExists
        ? selectedCampaignId
        : getDefaultCampaignId(loadedCampaigns);
      setSelectedCampaignId(nextCampaignId);

      // A changed selection is loaded once by the selected-id effect below.
      if (nextCampaignId === selectedCampaignId) {
        await loadDraftsForCampaign(nextCampaignId);
      }
    } catch (caught) {
      if (requestId !== latestDraftsLoadRequest.current) return;
      const message = getErrorMessage(caught);
      setError(message);
    } finally {
      if (requestId === latestDraftsLoadRequest.current) setLoading(false);
    }
  }, [loadDraftsForCampaign, selectedCampaignId]);

  useEffect(() => {
    void loadDrafts();
    return () => {
      latestDraftsLoadRequest.current += 1;
      latestCampaignLoadRequest.current += 1;
    };
  }, [loadDrafts]);

  const selectCampaign = useCallback((id: number | null) => {
    // Invalidate in-flight work immediately, before the selection effect runs.
    latestDraftsLoadRequest.current += 1;
    latestCampaignLoadRequest.current += 1;
    setSelectedCampaignId(id);
  }, []);

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

  const runDraftAiAudit = useCallback(
    async (input: RunDraftAiAuditInput) => {
      try {
        await runDraftAiAuditRecord(input);
        toast.success("AI audit completed");
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("AI audit failed", { description: message });
        throw caught;
      } finally {
        await loadDraftsForCampaign(selectedCampaignId);
      }
    },
    [loadDraftsForCampaign, selectedCampaignId],
  );

  const generateDraft = useCallback(
    async (input: GenerateDraftVariantsInput) => {
      try {
        await generateDraftVariants(input);
        await loadDraftsForCampaign(selectedCampaignId);
        toast.success("Draft variants generated", {
          description: "Review them in Generated drafts pending.",
        });
      } catch (caught) {
        await loadDraftsForCampaign(selectedCampaignId);
        const message = getErrorMessage(caught);
        toast.error("Draft variants were not generated", {
          description: message,
        });
        throw caught;
      }
    },
    [loadDraftsForCampaign, selectedCampaignId],
  );

  const saveGenerationRequest = useCallback(
    async (input: SaveGeneratedDraftInput) => {
      try {
        await saveGeneratedDraft(input);
        await loadDraftsForCampaign(selectedCampaignId);
        toast.success("Generated variants saved as a draft", {
          description: "Deterministic audits ran on the saved draft.",
        });
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("Generated draft was not saved", { description: message });
        throw caught;
      }
    },
    [loadDraftsForCampaign, selectedCampaignId],
  );

  const dismissGenerationRequest = useCallback(
    async (id: number) => {
      try {
        await dismissDraftGenerationRequest(id);
        await loadDraftsForCampaign(selectedCampaignId);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("Generated draft request was not dismissed", {
          description: message,
        });
        throw caught;
      }
    },
    [loadDraftsForCampaign, selectedCampaignId],
  );

  return useMemo(
    () => ({
      drafts,
      generationRequests,
      campaigns,
      candidates,
      eligibleWorkflowOptions,
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
      runDraftAiAudit,
      generateDraft,
      saveGenerationRequest,
      dismissGenerationRequest,
    }),
    [
      drafts,
      generationRequests,
      campaigns,
      candidates,
      eligibleWorkflowOptions,
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
      runDraftAiAudit,
      generateDraft,
      saveGenerationRequest,
      dismissGenerationRequest,
    ],
  );
}
