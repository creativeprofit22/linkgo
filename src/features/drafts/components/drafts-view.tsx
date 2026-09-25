import { AlertCircle, FileText, Target } from "lucide-react";
import { ListTruncationNotice } from "@/components/list-truncation-notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AddDraftDialog } from "@/features/drafts/components/add-draft-dialog";
import { DraftGenerationRequestCard } from "@/features/drafts/components/draft-generation-request-card";
import { DraftCard } from "@/features/drafts/components/draft-card";
import { GenerateDraftDialog } from "@/features/drafts/components/generate-draft-dialog";
import { useDrafts } from "@/features/drafts/hooks/use-drafts";
import type {
  DraftGenerationRequest,
  DraftWithDetails,
} from "@/features/drafts/types";

export function DraftsView(): React.ReactNode {
  const {
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
  } = useDrafts();

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
                Manual or operator-triggered generated variants. Saving
                generated text still runs deterministic audits before approval.
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
              Retry
            </Button>
          </CardContent>
        </Card>
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
                Draft workspaces are stored locally per candidate post.
              </p>
            </div>
            <select
              value={selectedCampaignId ?? ""}
              onChange={(event) => {
                const nextId = Number(event.target.value);
                selectCampaign(Number.isFinite(nextId) ? nextId : null);
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
              label={`Ready for review${shownSuffix}`}
              value={String(summary.readyForReview)}
            />
            <SummaryCard
              label={`Blocked variants${shownSuffix}`}
              value={String(summary.blockedVariants)}
            />
            <SummaryCard
              label={`Selected variants${shownSuffix}`}
              value={String(summary.selectedVariants)}
            />
            <SummaryCard
              label="Generated drafts pending"
              value={String(activeGenerationRequests.length)}
            />
          </div>

          <ListTruncationNotice
            shownCount={drafts.length}
            totalCount={draftTotalCount}
            noun="drafts"
          />

          {activeGenerationRequests.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">
                Generated drafts pending
              </h3>
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

          {drafts.length === 0 ? (
            <EmptyDrafts />
          ) : (
            <div className="space-y-4">
              {drafts.map((draft) => (
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
            Open Campaigns first and create a campaign. Drafts attach to
            candidate posts inside a campaign.
          </p>
        </div>
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
            Create a manual draft or generate local variants from a non-rejected
            candidate. Linkgo audits saved variants before review.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
