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
  listDraftPage,
  runDraftAiAudit as runDraftAiAuditRecord,
  saveGeneratedDraft,
  setDraftVariantStatus,
  updateDraft as updateDraftRecord,
  updateDraftVariant,
  reconcileStaleDraftQuality,
} from "@/features/drafts/data";
import { toPlainMessage } from "@/lib/plain-message";
import {
  runDraftQualityLoop,
  resumeDraftQualityLoop,
} from "@/features/drafts/quality-loop";
import type {
  CreateDraftInput,
  DraftGenerationRequest,
  EligibleDraftWorkflowOption,
  DraftWithDetails,
  GenerateDraftVariantsInput,
  RunDraftAiAuditInput,
  ClaimDraftQualityInput,
  ContinueDraftQualityInput,
  SaveGeneratedDraftInput,
  SetDraftVariantStatusInput,
  UpdateDraftInput,
  UpdateDraftVariantInput,
} from "@/features/drafts/types";

interface UseDraftsState {
  drafts: DraftWithDetails[];
  /** Drafts matching the campaign before the native list cap. */
  draftTotalCount: number;
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
  qualityPendingVariantIds: ReadonlySet<number>;
  runQualityLoop: (input: ClaimDraftQualityInput) => Promise<void>;
  resumeQualityLoop: (input: ContinueDraftQualityInput) => Promise<void>;
  generateDraft: (input: GenerateDraftVariantsInput) => Promise<void>;
  saveGenerationRequest: (input: SaveGeneratedDraftInput) => Promise<void>;
  dismissGenerationRequest: (id: number) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? toPlainMessage(error.message)
    : "Something went wrong with your drafts. Try again.";
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
  const [draftTotalCount, setDraftTotalCount] = useState(0);
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
  const [qualityPendingVariantIds, setQualityPendingVariantIds] = useState<
    ReadonlySet<number>
  >(new Set());
  const latestDraftsLoadRequest = useRef(0);
  const latestCampaignLoadRequest = useRef(0);

  const loadDraftsForCampaign = useCallback(
    async (campaignId: number | null) => {
      const requestId = ++latestCampaignLoadRequest.current;
      if (campaignId === null) {
        setCandidates([]);
        setDrafts([]);
        setDraftTotalCount(0);
        setGenerationRequests([]);
        setEligibleWorkflowOptions([]);
        return;
      }

      try {
        const [
          loadedCandidates,
          loadedDraftPage,
          loadedGenerationRequests,
          loadedEligibleWorkflowOptions,
        ] = await Promise.all([
          listCandidates(campaignId),
          listDraftPage(campaignId),
          listDraftGenerationRequests(campaignId),
          listEligibleDraftWorkflowOptions(campaignId),
        ]);
        if (requestId !== latestCampaignLoadRequest.current) return;

        setCandidates(loadedCandidates);
        setDrafts(loadedDraftPage.items);
        setDraftTotalCount(loadedDraftPage.totalCount);
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
      await reconcileStaleDraftQuality();
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
        toast.error("We couldn't create the draft", { description: message });
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
        toast.error("We couldn't save the draft", { description: message });
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
        toast.error("We couldn't save this version", { description: message });
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
        toast.error("We couldn't update this version", {
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
        toast.error("We couldn't archive the draft", { description: message });
        throw caught;
      }
    },
    [loadDraftsForCampaign, selectedCampaignId],
  );

  const runDraftAiAudit = useCallback(
    async (input: RunDraftAiAuditInput) => {
      try {
        await runDraftAiAuditRecord(input);
        toast.success("AI review finished");
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("The AI review didn't finish", { description: message });
        throw caught;
      } finally {
        await loadDraftsForCampaign(selectedCampaignId);
      }
    },
    [loadDraftsForCampaign, selectedCampaignId],
  );

  const runQuality = useCallback(
    async (
      input: ClaimDraftQualityInput | ContinueDraftQualityInput,
      resume: boolean,
    ) => {
      const variantId = input.draftVariantId;
      setQualityPendingVariantIds((current) => new Set(current).add(variantId));
      try {
        if (resume)
          await resumeDraftQualityLoop(input as ContinueDraftQualityInput);
        else await runDraftQualityLoop(input);
        toast.success("Done improving your draft");
      } catch (caught) {
        toast.error("Improving your draft stopped", {
          description: getErrorMessage(caught),
        });
        throw caught;
      } finally {
        setQualityPendingVariantIds((current) => {
          const next = new Set(current);
          next.delete(variantId);
          return next;
        });
        await loadDraftsForCampaign(selectedCampaignId);
      }
    },
    [loadDraftsForCampaign, selectedCampaignId],
  );
  const runQualityLoop = useCallback(
    (input: ClaimDraftQualityInput) => runQuality(input, false),
    [runQuality],
  );
  const resumeQualityLoop = useCallback(
    (input: ContinueDraftQualityInput) => runQuality(input, true),
    [runQuality],
  );

  const generateDraft = useCallback(
    async (input: GenerateDraftVariantsInput) => {
      try {
        await generateDraftVariants(input);
        await loadDraftsForCampaign(selectedCampaignId);
        toast.success("AI versions are ready", {
          description: "Review them in AI drafts to review.",
        });
      } catch (caught) {
        await loadDraftsForCampaign(selectedCampaignId);
        const message = getErrorMessage(caught);
        toast.error("The AI couldn't write versions", {
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
        toast.success("AI versions saved as a draft", {
          description: "Linkgo ran its automatic checks on the draft.",
        });
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("We couldn't save the AI draft", { description: message });
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
        toast.error("We couldn't dismiss the AI draft", {
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
      draftTotalCount,
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
      qualityPendingVariantIds,
      runQualityLoop,
      resumeQualityLoop,
      generateDraft,
      saveGenerationRequest,
      dismissGenerationRequest,
    }),
    [
      drafts,
      draftTotalCount,
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
      qualityPendingVariantIds,
      runQualityLoop,
      resumeQualityLoop,
      generateDraft,
      saveGenerationRequest,
      dismissGenerationRequest,
    ],
  );
}
