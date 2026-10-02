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
  DraftIdeaPage,
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
  /** Campaign whose drafts and ideas are currently loaded, if any. */
  loadedCampaignId: number | null;
  /** The linked idea's drafts (`candidateId` option), or null without one. */
  ideaDraftPage: DraftIdeaPage | null;
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

export interface UseDraftsOptions {
  /**
   * Campaign to open first (from a Drafts link). Used when it exists;
   * otherwise the first active campaign is selected as before.
   */
  initialCampaignId?: number | undefined;
  /**
   * Idea to show (from a Drafts idea link). Its drafts load natively into
   * `ideaDraftPage`, so the campaign list cap can't hide them.
   */
  candidateId?: number | undefined;
}

async function loadIdeaDraftPage(
  campaignId: number,
  candidateId: number | undefined,
): Promise<DraftIdeaPage | null> {
  if (candidateId === undefined) return null;
  const page = await listDraftPage(campaignId, { candidateId });
  return { ...page, campaignId, candidateId };
}

export function useDrafts(options: UseDraftsOptions = {}): UseDraftsState {
  const { initialCampaignId, candidateId } = options;
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
  const [loadedCampaignId, setLoadedCampaignId] = useState<number | null>(null);
  const [ideaDraftPage, setIdeaDraftPage] = useState<DraftIdeaPage | null>(
    null,
  );
  const latestIdeaLoadRequest = useRef(0);
  // Read inside loadDrafts without making a link change reload everything.
  const requestedCampaignIdRef = useRef(initialCampaignId);
  const requestedCandidateIdRef = useRef(candidateId);
  const campaignsRef = useRef<CampaignWithKeywords[]>([]);

  const loadDraftsForCampaign = useCallback(
    async (campaignId: number | null) => {
      const requestId = ++latestCampaignLoadRequest.current;
      const ideaRequestId = ++latestIdeaLoadRequest.current;
      if (campaignId === null) {
        setCandidates([]);
        setDrafts([]);
        setDraftTotalCount(0);
        setIdeaDraftPage(null);
        setGenerationRequests([]);
        setEligibleWorkflowOptions([]);
        setLoadedCampaignId(null);
        return;
      }

      try {
        const [
          loadedCandidates,
          loadedDraftPage,
          loadedIdeaDraftPage,
          loadedGenerationRequests,
          loadedEligibleWorkflowOptions,
        ] = await Promise.all([
          listCandidates(campaignId),
          listDraftPage(campaignId),
          loadIdeaDraftPage(campaignId, requestedCandidateIdRef.current),
          listDraftGenerationRequests(campaignId),
          listEligibleDraftWorkflowOptions(campaignId),
        ]);
        if (requestId !== latestCampaignLoadRequest.current) return;

        setCandidates(loadedCandidates);
        setDrafts(loadedDraftPage.items);
        setDraftTotalCount(loadedDraftPage.totalCount);
        // A newer idea-only load (link change) wins over this one.
        if (ideaRequestId === latestIdeaLoadRequest.current) {
          setIdeaDraftPage(loadedIdeaDraftPage);
        }
        setGenerationRequests(loadedGenerationRequests);
        setEligibleWorkflowOptions(loadedEligibleWorkflowOptions);
        setLoadedCampaignId(campaignId);
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
      campaignsRef.current = loadedCampaigns;
      const campaignStillExists = loadedCampaigns.some(
        (campaign) => campaign.id === selectedCampaignId,
      );
      const requestedCampaignId = requestedCampaignIdRef.current;
      const requestedCampaignExists = loadedCampaigns.some(
        (campaign) => campaign.id === requestedCampaignId,
      );
      const nextCampaignId = campaignStillExists
        ? selectedCampaignId
        : requestedCampaignExists && requestedCampaignId !== undefined
          ? requestedCampaignId
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

  // A new link while Drafts stays open selects its campaign when it exists.
  useEffect(() => {
    if (requestedCampaignIdRef.current === initialCampaignId) return;
    requestedCampaignIdRef.current = initialCampaignId;
    if (
      initialCampaignId === undefined ||
      initialCampaignId === selectedCampaignId
    ) {
      return;
    }
    if (!campaignsRef.current.some((c) => c.id === initialCampaignId)) return;
    selectCampaign(initialCampaignId);
  }, [initialCampaignId, selectedCampaignId, selectCampaign]);

  // A new idea link for the loaded campaign loads just that idea's drafts.
  // A link that also changes campaign is covered by the campaign reload.
  useEffect(() => {
    requestedCandidateIdRef.current = candidateId;
    if (
      candidateId === undefined ||
      loadedCampaignId === null ||
      loadedCampaignId !== selectedCampaignId ||
      loadedCampaignId !== initialCampaignId
    ) {
      return;
    }
    if (
      ideaDraftPage?.campaignId === loadedCampaignId &&
      ideaDraftPage.candidateId === candidateId
    ) {
      return;
    }
    const requestId = ++latestIdeaLoadRequest.current;
    const loadIdea = async (): Promise<void> => {
      try {
        const page = await loadIdeaDraftPage(loadedCampaignId, candidateId);
        if (requestId === latestIdeaLoadRequest.current) setIdeaDraftPage(page);
      } catch (caught) {
        if (requestId === latestIdeaLoadRequest.current) {
          setError(getErrorMessage(caught));
        }
      }
    };
    void loadIdea();
  }, [
    candidateId,
    initialCampaignId,
    loadedCampaignId,
    selectedCampaignId,
    ideaDraftPage,
  ]);

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
      loadedCampaignId,
      ideaDraftPage,
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
      loadedCampaignId,
      ideaDraftPage,
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
