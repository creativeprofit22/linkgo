import { AlertCircle, ListChecks, Target } from "lucide-react";
import { AddCandidateDialog } from "@/features/candidate-queue/components/add-candidate-dialog";
import { CandidateCard } from "@/features/candidate-queue/components/candidate-card";
import { DiscoveryItemCard } from "@/features/candidate-queue/components/discovery-item-card";
import { RunCandidateDiscoveryDialog } from "@/features/candidate-queue/components/run-candidate-discovery-dialog";
import { ScoreCandidatesDialog } from "@/features/candidate-queue/components/score-candidates-dialog";
import { useCandidateQueue } from "@/features/candidate-queue/hooks/use-candidate-queue";
import {
  CandidatePolicyCard,
  useCandidatePolicy,
} from "@/features/candidate-policy";
import type {
  CandidateStatus,
  CandidateWithTarget,
} from "@/features/candidate-queue/types";
import {
  ImportSourcePostsDialog,
  SourceImportBatchList,
  useSourceImports,
  type CreateSourceImportBatchInput,
  type SourceImportBatchResult,
} from "@/features/source-imports";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const statusOrder: CandidateStatus[] = [
  "new",
  "shortlisted",
  "drafted",
  "rejected",
];

const statusHeadings: Record<CandidateStatus, string> = {
  new: "New",
  shortlisted: "Shortlisted",
  drafted: "Drafted",
  rejected: "Rejected",
};

export function CandidateQueueView(): React.ReactNode {
  const {
    candidates,
    discoveryItems,
    campaigns,
    selectedCampaignId,
    loading,
    error,
    loadQueue,
    selectCampaign,
    addCandidate,
    setStatus,
    removeCandidate,
    runDiscovery,
    scoreSelectedCandidates,
    promoteDiscoveryItem,
    dismissDiscoveryItem,
  } = useCandidateQueue();

  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const selectedCampaignArchived = selectedCampaign?.status === "archived";
  const sourceImports = useSourceImports(selectedCampaignId);
  const candidatePolicy = useCandidatePolicy(selectedCampaignId);
  const summary = getCandidateSummary(candidates, discoveryItems.length);
  const groupedCandidates = groupCandidatesByStatus(candidates);

  const handleSourceImport = async (
    input: CreateSourceImportBatchInput,
  ): Promise<SourceImportBatchResult> => {
    const result = await sourceImports.submitImport(input);
    await Promise.all([loadQueue(), sourceImports.loadImports()]);
    return result;
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-11 items-center justify-center rounded-xl">
              <ListChecks className="size-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Candidate Queue
              </h2>
              <p className="text-muted-foreground text-sm">
                Import approved source posts or run local-first discovery and
                scoring. LinkedIn scraping and autonomous external actions stay
                excluded.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <RunCandidateDiscoveryDialog
            campaign={selectedCampaign}
            onRun={runDiscovery}
            disabled={campaigns.length === 0 || selectedCampaignArchived}
          />
          <ScoreCandidatesDialog
            campaignId={selectedCampaignId}
            candidates={candidates}
            onScore={scoreSelectedCandidates}
            disabled={campaigns.length === 0 || selectedCampaignArchived}
          />
          <ImportSourcePostsDialog
            campaignId={selectedCampaignId}
            onImport={handleSourceImport}
            pending={sourceImports.pending}
            disabled={campaigns.length === 0 || selectedCampaignArchived}
          />
          <AddCandidateDialog
            campaigns={campaigns}
            selectedCampaignId={selectedCampaignId}
            onCreate={addCandidate}
            disabled={campaigns.length === 0 || selectedCampaignArchived}
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
              onClick={() => void loadQueue()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card className="bg-card/70">
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            Loading candidate queue…
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
                Queue entries are deduped per campaign by URL and content hash.
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

          <CandidatePolicyCard
            policy={candidatePolicy.policy}
            loading={candidatePolicy.loading}
            pending={candidatePolicy.pending}
            error={candidatePolicy.error}
            archived={selectedCampaignArchived}
            onRetry={candidatePolicy.loadPolicy}
            onSave={candidatePolicy.savePolicy}
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Total" value={String(summary.total)} />
            <SummaryCard
              label="Suggestions"
              value={String(summary.suggestions)}
            />
            <SummaryCard label="Scored" value={String(summary.scored)} />
            <SummaryCard
              label="Shortlisted"
              value={String(summary.shortlisted)}
            />
            <SummaryCard label="Average score" value={summary.averageScore} />
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-wide uppercase">
                Discovery suggestions
              </h3>
              <span className="text-muted-foreground text-xs">
                {discoveryItems.length} local suggestion
                {discoveryItems.length === 1 ? "" : "s"}
              </span>
            </div>
            {discoveryItems.length === 0 ? (
              <Card className="bg-card/70 border-dashed">
                <CardContent className="text-muted-foreground p-6 text-sm">
                  Run discovery to save keyword, trend, and source-prompt ideas.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 xl:grid-cols-3">
                {discoveryItems.map((item) => (
                  <DiscoveryItemCard
                    key={item.id}
                    item={item}
                    disabled={selectedCampaignArchived}
                    onPromote={(id) =>
                      promoteDiscoveryItem({
                        id,
                        campaignId: item.campaign_id,
                      })
                    }
                    onDismiss={(id) =>
                      dismissDiscoveryItem({
                        id,
                        campaignId: item.campaign_id,
                      })
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <SourceImportBatchList
            batches={sourceImports.batches}
            loading={sourceImports.loading}
            error={sourceImports.error}
            onRetry={sourceImports.loadImports}
          />

          {candidates.length === 0 ? (
            <EmptyQueue />
          ) : (
            <div className="space-y-6">
              {statusOrder.map((status) => {
                const statusCandidates = groupedCandidates[status];
                if (statusCandidates.length === 0) return null;
                return (
                  <section key={status} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold tracking-wide uppercase">
                        {statusHeadings[status]}
                      </h3>
                      <span className="text-muted-foreground text-xs">
                        {statusCandidates.length} candidate
                        {statusCandidates.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                      {statusCandidates.map((candidate) => (
                        <CandidateCard
                          key={candidate.id}
                          candidate={candidate}
                          onSetStatus={setStatus}
                          onDelete={removeCandidate}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function getCandidateSummary(
  candidates: CandidateWithTarget[],
  suggestionCount: number,
): {
  total: number;
  suggestions: number;
  scored: number;
  shortlisted: number;
  rejected: number;
  averageScore: string;
} {
  const scoredCandidates = candidates.filter(
    (candidate) => candidate.relevance_score !== null,
  );
  const scoreTotal = scoredCandidates.reduce(
    (total, candidate) => total + (candidate.relevance_score ?? 0),
    0,
  );

  return {
    total: candidates.length,
    suggestions: suggestionCount,
    scored: scoredCandidates.length,
    shortlisted: candidates.filter(
      (candidate) => candidate.status === "shortlisted",
    ).length,
    rejected: candidates.filter((candidate) => candidate.status === "rejected")
      .length,
    averageScore:
      scoredCandidates.length === 0
        ? "Not scored"
        : String(Math.round(scoreTotal / scoredCandidates.length)),
  };
}

function groupCandidatesByStatus(
  candidates: CandidateWithTarget[],
): Record<CandidateStatus, CandidateWithTarget[]> {
  return {
    new: candidates.filter((candidate) => candidate.status === "new"),
    shortlisted: candidates.filter(
      (candidate) => candidate.status === "shortlisted",
    ),
    drafted: candidates.filter((candidate) => candidate.status === "drafted"),
    rejected: candidates.filter((candidate) => candidate.status === "rejected"),
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
            Open Campaigns first and create a campaign. The Queue uses that
            context to dedupe candidates and track relevance triage.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyQueue(): React.ReactNode {
  return (
    <Card className="bg-card/70 border-dashed">
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-14 items-center justify-center rounded-2xl">
          <ListChecks className="size-7" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">No candidates yet</h3>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm">
            Add a LinkedIn post manually to begin queue triage for this
            campaign.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
