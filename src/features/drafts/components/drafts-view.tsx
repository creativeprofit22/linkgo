import { AlertCircle, FileText, Info, Target } from "lucide-react";
import { ListTruncationNotice } from "@/components/list-truncation-notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AddDraftDialog } from "@/features/drafts/components/add-draft-dialog";
import { DraftGenerationRequestCard } from "@/features/drafts/components/draft-generation-request-card";
import { DraftCard } from "@/features/drafts/components/draft-card";
import { GenerateDraftDialog } from "@/features/drafts/components/generate-draft-dialog";
import { useDrafts } from "@/features/drafts/hooks/use-drafts";
import { draftsRoute } from "@/features/drafts/schemas";
import type {
  DraftGenerationRequest,
  DraftIdeaPage,
  DraftsRouteParams,
  DraftWithDetails,
} from "@/features/drafts/types";
import type { CampaignWithKeywords } from "@/features/campaigns/types";
import type { CandidateWithTarget } from "@/features/candidate-queue/types";
import {
  navigateTo,
  useRouteParams,
} from "@/lib/navigation/use-hash-navigation";

export function DraftsView(): React.ReactNode {
  const { params: linkParams, linkIssue } = useRouteParams(draftsRoute);
  const {
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
    generateDraft,
    saveGenerationRequest,
    dismissGenerationRequest,
    updateVariant,
    setVariantStatus,
    archiveDraft,
    runDraftAiAudit,
    qualityPendingVariantIds,
    runQualityLoop,
    resumeQualityLoop,
  } = useDrafts({
    initialCampaignId: linkParams?.campaignId,
    candidateId: linkParams?.candidateId,
  });

  const link = resolveDraftsLink({
    linkParams,
    linkIssue,
    loading,
    campaigns,
    candidates,
    ideaDraftPage,
    selectedCampaignId,
    loadedCampaignId,
  });
  // An idea link shows that idea's natively filtered drafts, not a slice of
  // the capped campaign list.
  const visiblePage =
    link.kind === "idea" && ideaDraftPage !== null
      ? ideaDraftPage
      : { items: drafts, totalCount: draftTotalCount };
  const visibleDrafts = visiblePage.items;
  const summary = getDraftSummary(drafts, draftTotalCount);
  // Status/variant counts come from the capped rows; label them if truncated.
  const shownSuffix = summary.truncated ? " (shown)" : "";
  const activeGenerationRequests = generationRequests.filter(
    isActiveGenerationRequest,
  );
  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const selectedCampaignArchived = selectedCampaign?.status === "archived";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-11 items-center justify-center rounded-xl">
              <FileText className="size-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Drafts</h2>
              <p className="text-muted-foreground text-sm">
                Write and compare post versions, with quality checks. Every
                version gets automatic checks before it goes for approval.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <GenerateDraftDialog
            candidates={candidates}
            selectedCampaignId={selectedCampaignId}
            selectedCampaignArchived={selectedCampaignArchived}
            eligibleWorkflowOptions={eligibleWorkflowOptions}
            onGenerate={generateDraft}
            disabled={campaigns.length === 0}
          />
          <AddDraftDialog
            candidates={candidates}
            selectedCampaignId={selectedCampaignId}
            selectedCampaignArchived={selectedCampaignArchived}
            onCreate={addDraft}
            disabled={campaigns.length === 0}
          />
        </div>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="text-destructive size-5" />
              <p className="text-sm">{error}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadDrafts()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {link.kind === "not-found" && (
        <p
          role="status"
          data-testid="drafts-link-not-found"
          className="bg-muted/50 text-muted-foreground flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
        >
          <Info aria-hidden="true" className="size-4 shrink-0" />
          <span>
            We couldn&rsquo;t find what that link pointed to, so here are all
            drafts.
          </span>
        </p>
      )}

      {loading ? (
        <Card className="bg-card/70">
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            Loading drafts…
          </CardContent>
        </Card>
      ) : campaigns.length === 0 ? (
        <EmptyNoCampaigns />
      ) : (
        <>
          <div className="bg-card/60 flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium">Selected campaign</p>
              <p className="text-muted-foreground text-xs">
                Drafts are saved on this computer, one per idea.
              </p>
            </div>
            <select
              value={selectedCampaignId ?? ""}
              onChange={(event) => {
                const nextId = Number(event.target.value);
                const campaignId =
                  Number.isInteger(nextId) && nextId > 0 ? nextId : null;
                selectCampaign(campaignId);
                // Keep the address in step with the picker; drops any idea filter.
                navigateTo(
                  draftsRoute,
                  campaignId === null ? {} : { campaignId },
                  { replace: true },
                );
              }}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 min-w-60 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                  {campaign.status === "archived" ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Total drafts" value={String(summary.total)} />
            <SummaryCard
              label={`Ready for approval${shownSuffix}`}
              value={String(summary.readyForReview)}
            />
            <SummaryCard
              label={`Versions to fix${shownSuffix}`}
              value={String(summary.blockedVariants)}
            />
            <SummaryCard
              label={`Chosen versions${shownSuffix}`}
              value={String(summary.selectedVariants)}
            />
            <SummaryCard
              label="AI drafts to review"
              value={String(activeGenerationRequests.length)}
            />
          </div>

          {link.kind === "idea" && (
            <div
              role="status"
              data-testid="drafts-idea-filter"
              className="bg-linkgo-blue/5 border-linkgo-blue/30 flex flex-col justify-between gap-3 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center"
            >
              <span className="flex items-center gap-2">
                <Info aria-hidden="true" className="size-4 shrink-0" />
                Showing drafts for one idea.
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  navigateTo(draftsRoute, { campaignId: link.campaignId })
                }
              >
                Show all drafts
              </Button>
            </div>
          )}

          <ListTruncationNotice
            shownCount={visibleDrafts.length}
            totalCount={visiblePage.totalCount}
            noun="drafts"
          />

          {activeGenerationRequests.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">AI drafts to review</h3>
              {activeGenerationRequests.map((request) => (
                <DraftGenerationRequestCard
                  key={request.id}
                  request={request}
                  saveDisabled={selectedCampaignArchived}
                  onSave={(id) => saveGenerationRequest({ id })}
                  onDismiss={dismissGenerationRequest}
                />
              ))}
            </div>
          )}

          {visibleDrafts.length === 0 ? (
            link.kind === "idea" ? (
              <EmptyIdeaDrafts />
            ) : (
              <EmptyDrafts />
            )
          ) : (
            <div className="space-y-4">
              {visibleDrafts.map((draft) => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  onUpdateVariant={updateVariant}
                  onSetVariantStatus={setVariantStatus}
                  onArchiveDraft={archiveDraft}
                  onRunAiAudit={runDraftAiAudit}
                  qualityPendingVariantIds={qualityPendingVariantIds}
                  onRunQuality={(draftVariantId) =>
                    runQualityLoop({ draftVariantId })
                  }
                  onResumeQuality={(draftVariantId, qualityRunId) =>
                    resumeQualityLoop({ draftVariantId, qualityRunId })
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

type DraftsLinkState =
  | { kind: "none" }
  | { kind: "pending" }
  | { kind: "idea"; campaignId: number; candidateId: number }
  | { kind: "not-found" };

/**
 * Decides what a Drafts link means once data is loaded: filter to one idea,
 * or tell the operator the link pointed at something that isn't there.
 */
function resolveDraftsLink(input: {
  linkParams: DraftsRouteParams | null;
  linkIssue: boolean;
  loading: boolean;
  campaigns: CampaignWithKeywords[];
  candidates: CandidateWithTarget[];
  ideaDraftPage: DraftIdeaPage | null;
  selectedCampaignId: number | null;
  loadedCampaignId: number | null;
}): DraftsLinkState {
  if (input.linkIssue) return { kind: "not-found" };
  const { linkParams } = input;
  if (!linkParams || linkParams.campaignId === undefined) {
    return { kind: "none" };
  }
  if (input.loading) return { kind: "pending" };
  const { campaignId, candidateId } = linkParams;
  if (!input.campaigns.some((campaign) => campaign.id === campaignId)) {
    return { kind: "not-found" };
  }
  if (candidateId === undefined) return { kind: "none" };
  // Wait until this campaign's ideas and this idea's drafts are loaded
  // before judging the link.
  const { ideaDraftPage } = input;
  if (
    input.selectedCampaignId !== campaignId ||
    input.loadedCampaignId !== campaignId ||
    ideaDraftPage?.campaignId !== campaignId ||
    ideaDraftPage.candidateId !== candidateId
  ) {
    return { kind: "pending" };
  }
  // The ideas list is capped, so an idea with drafts in this campaign counts
  // as found even when it is outside that list.
  const ideaExists =
    input.candidates.some(
      (candidate) =>
        candidate.id === candidateId && candidate.campaign_id === campaignId,
    ) || ideaDraftPage.totalCount > 0;
  return ideaExists
    ? { kind: "idea", campaignId, candidateId }
    : { kind: "not-found" };
}

function isActiveGenerationRequest(request: DraftGenerationRequest): boolean {
  return ["pending", "generated", "failed"].includes(request.status);
}

function getDraftSummary(
  drafts: DraftWithDetails[],
  totalCount: number,
): {
  total: number;
  truncated: boolean;
  readyForReview: number;
  blockedVariants: number;
  selectedVariants: number;
} {
  const variants = drafts.flatMap((draft) => draft.variants);
  return {
    total: Math.max(totalCount, drafts.length),
    truncated: totalCount > drafts.length,
    readyForReview: drafts.filter(
      (draft) => draft.status === "ready_for_review",
    ).length,
    blockedVariants: variants.filter(
      (variant) => variant.auditSeverity === "block",
    ).length,
    selectedVariants: variants.filter(
      (variant) => variant.status === "selected",
    ).length,
  };
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <Card className="bg-card/70">
      <CardContent className="p-4">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function EmptyNoCampaigns(): React.ReactNode {
  return (
    <Card className="bg-card/70 border-dashed">
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <div className="bg-linkgo-green/10 text-linkgo-green flex size-14 items-center justify-center rounded-2xl">
          <Target className="size-7" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">No campaigns yet</h3>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm">
            Go to Campaigns and create a campaign first. Drafts are written from
            ideas inside a campaign.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyIdeaDrafts(): React.ReactNode {
  return (
    <Card className="bg-card/70 border-dashed">
      <CardContent className="text-muted-foreground p-8 text-center text-sm">
        No drafts for this idea yet. Write one, or show all drafts.
      </CardContent>
    </Card>
  );
}

function EmptyDrafts(): React.ReactNode {
  return (
    <Card className="bg-card/70 border-dashed">
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-14 items-center justify-center rounded-2xl">
          <FileText className="size-7" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">No drafts yet</h3>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm">
            Write a draft yourself or let the AI write versions from an idea.
            Linkgo checks every version before it goes for approval.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
