import { AlertCircle, ListChecks, Target } from "lucide-react";
import { CreateFirstCampaignButton } from "@/features/campaigns";
import { AddCandidateDialog } from "@/features/candidate-queue/components/add-candidate-dialog";
import { CandidateCard } from "@/features/candidate-queue/components/candidate-card";
import { DiscoveryItemCard } from "@/features/candidate-queue/components/discovery-item-card";
import { RunCandidateDiscoveryDialog } from "@/features/candidate-queue/components/run-candidate-discovery-dialog";
import { ScoreCandidatesDialog } from "@/features/candidate-queue/components/score-candidates-dialog";
import { useCandidateQueue } from "@/features/candidate-queue/hooks/use-candidate-queue";
import { candidateQueueRoute } from "@/features/candidate-queue/schemas";
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
import {
  ideaStage,
  type PostStage,
  type PostStageIndex,
} from "@/features/post-stages";
import { ListTruncationNotice } from "@/components/list-truncation-notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  navigateTo,
  useRouteParams,
} from "@/lib/navigation/use-hash-navigation";

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
    candidateTotalCount,
    discoveryItems,
    campaigns,
    selectedCampaignId,
    stageIndex,
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
  const { params: linkParams } = useRouteParams(candidateQueueRoute);

  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const selectedCampaignArchived = selectedCampaign?.status === "archived";
  // `find=1` opens Find topics once a usable campaign is selected. Closing it
  // drops the flag from the address (replace) so refresh doesn't reopen it.
  const findFromLink =
    linkParams?.find === "1" &&
    !loading &&
    selectedCampaign !== null &&
    !selectedCampaignArchived;
  const closeFindLink = (open: boolean): void => {
    if (!open && linkParams?.find !== undefined) {
      navigateTo(candidateQueueRoute, undefined, { replace: true });
    }
  };
  const sourceImports = useSourceImports(selectedCampaignId);
  const candidatePolicy = useCandidatePolicy(selectedCampaignId);
  const summary = getCandidateSummary(
    candidates,
    candidateTotalCount,
    discoveryItems.length,
  );
  // Scored/shortlisted/average and per-status counts are computed from the
  // capped rows; label them when the list is truncated.
  const shownSuffix = summary.truncated ? " (shown)" : "";
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
              <h2 className="text-2xl font-semibold tracking-tight">Ideas</h2>
              <p className="text-muted-foreground text-sm">
                Posts and topics worth writing about or replying to. Import
                posts, find new topics, and score ideas. Linkgo never copies
                LinkedIn pages or acts on LinkedIn by itself.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <RunCandidateDiscoveryDialog
            campaign={selectedCampaign}
            onRun={runDiscovery}
            disabled={campaigns.length === 0 || selectedCampaignArchived}
            open={findFromLink ? true : undefined}
            onOpenChange={findFromLink ? closeFindLink : undefined}
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
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card className="bg-card/70">
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            Loading ideas…
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
                Linkgo skips repeats: the same post is only added once per
                campaign.
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
                  {campaign.status === "archived" ? " (Archived)" : ""}
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
              label="Topic ideas"
              value={String(summary.suggestions)}
            />
            <SummaryCard
              label={`Scored${shownSuffix}`}
              value={String(summary.scored)}
            />
            <SummaryCard
              label={`Shortlisted${shownSuffix}`}
              value={String(summary.shortlisted)}
            />
            <SummaryCard
              label={`Average score${shownSuffix}`}
              value={summary.averageScore}
            />
          </div>

          <ListTruncationNotice
            shownCount={candidates.length}
            totalCount={candidateTotalCount}
            noun="ideas"
          />

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-wide uppercase">
                Topic ideas
              </h3>
              <span className="text-muted-foreground text-xs">
                {discoveryItems.length} topic idea
                {discoveryItems.length === 1 ? "" : "s"}
              </span>
            </div>
            {discoveryItems.length === 0 ? (
              <Card className="bg-card/70 border-dashed">
                <CardContent className="text-muted-foreground p-6 text-sm">
                  Select Find topics to get keyword, trend, and topic ideas.
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
            brightData={{
              campaignId: selectedCampaignId,
              archived: selectedCampaignArchived,
              onImported: async () => {
                await Promise.all([loadQueue(), sourceImports.loadImports()]);
              },
            }}
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
                        {statusCandidates.length} idea
                        {statusCandidates.length === 1 ? "" : "s"}
                        {summary.truncated ? " shown" : ""}
                      </span>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                      {statusCandidates.map((candidate) => (
                        <CandidateCard
                          key={candidate.id}
                          candidate={candidate}
                          stage={getCandidateStage(stageIndex, candidate.id)}
                          canWrite={!selectedCampaignArchived}
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

/** Ideas missing from a loaded index have no draft yet. */
function getCandidateStage(
  stageIndex: PostStageIndex | null,
  candidateId: number,
): PostStage | null {
  if (stageIndex === null) return null;
  return stageIndex.byCandidateId.get(candidateId) ?? ideaStage();
}

function getCandidateSummary(
  candidates: CandidateWithTarget[],
  totalCount: number,
  suggestionCount: number,
): {
  total: number;
  truncated: boolean;
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
    total: Math.max(totalCount, candidates.length),
    truncated: totalCount > candidates.length,
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
            Create a campaign to get started. Ideas uses it to skip repeats and
            sort ideas by how well they match.
          </p>
        </div>
        <CreateFirstCampaignButton />
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
          <h3 className="text-lg font-semibold">No ideas yet</h3>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm">
            Select Add idea to save a LinkedIn post for this campaign.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
