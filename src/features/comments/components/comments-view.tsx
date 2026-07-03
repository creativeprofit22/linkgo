import { AlertCircle, MessageCircle, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CommentThreadCard } from "@/features/comments/components/comment-thread-card";
import { CreateCommentThreadDialog } from "@/features/comments/components/create-comment-thread-dialog";
import { useComments } from "@/features/comments/hooks/use-comments";
import type { CommentThreadWithDetails } from "@/features/comments/types";

export function CommentsView(): React.ReactNode {
  const {
    campaigns,
    selectedCampaignId,
    commentThreads,
    eligibleCandidates,
    loading,
    error,
    killSwitchEnabled,
    killSwitchReason,
    loadComments,
    selectCampaign,
    createThread,
    updateThread,
    updateVariant,
    selectVariant,
    setReviewStatus,
    recordAttempt,
  } = useComments();

  const summary = getCommentSummary(commentThreads);
  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const selectedCampaignArchived = selectedCampaign?.status === "archived";
  const groupedThreads = groupThreads(commentThreads);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-11 items-center justify-center rounded-xl">
              <MessageCircle className="size-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Comments
              </h2>
              <p className="text-muted-foreground text-sm">
                Local, approval-gated LinkedIn replies. Linkgo drafts, audits,
                and posts only after explicit confirmation when Community
                Management access is available.
              </p>
            </div>
          </div>
        </div>
        <CreateCommentThreadDialog
          candidates={eligibleCandidates}
          selectedCampaignId={selectedCampaignId}
          selectedCampaignArchived={selectedCampaignArchived}
          onCreate={createThread}
          disabled={campaigns.length === 0}
        />
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
              onClick={() => void loadComments()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card className="bg-card/70">
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            Loading comments…
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
                Comment workflows use shortlisted or drafted candidate targets.
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

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Total" value={String(summary.total)} />
            <SummaryCard
              label="Needs review"
              value={String(summary.needsReview)}
            />
            <SummaryCard label="Approved" value={String(summary.approved)} />
            <SummaryCard label="Posted" value={String(summary.posted)} />
          </div>

          {commentThreads.length === 0 ? (
            <EmptyComments />
          ) : (
            <div className="space-y-6">
              <ThreadGroup
                label="Drafting and changes"
                threads={groupedThreads.drafting}
                killSwitchEnabled={killSwitchEnabled}
                killSwitchReason={killSwitchReason}
                onUpdateThread={updateThread}
                onUpdateVariant={updateVariant}
                onSetVariantStatus={selectVariant}
                onSetReviewStatus={setReviewStatus}
                onRecordAttempt={recordAttempt}
              />
              <ThreadGroup
                label="Needs review"
                threads={groupedThreads.needsReview}
                killSwitchEnabled={killSwitchEnabled}
                killSwitchReason={killSwitchReason}
                onUpdateThread={updateThread}
                onUpdateVariant={updateVariant}
                onSetVariantStatus={selectVariant}
                onSetReviewStatus={setReviewStatus}
                onRecordAttempt={recordAttempt}
              />
              <ThreadGroup
                label="Approved"
                threads={groupedThreads.approved}
                killSwitchEnabled={killSwitchEnabled}
                killSwitchReason={killSwitchReason}
                onUpdateThread={updateThread}
                onUpdateVariant={updateVariant}
                onSetVariantStatus={selectVariant}
                onSetReviewStatus={setReviewStatus}
                onRecordAttempt={recordAttempt}
              />
              <ThreadGroup
                label="History"
                threads={groupedThreads.history}
                killSwitchEnabled={killSwitchEnabled}
                killSwitchReason={killSwitchReason}
                onUpdateThread={updateThread}
                onUpdateVariant={updateVariant}
                onSetVariantStatus={selectVariant}
                onSetReviewStatus={setReviewStatus}
                onRecordAttempt={recordAttempt}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function getCommentSummary(threads: CommentThreadWithDetails[]): {
  total: number;
  needsReview: number;
  approved: number;
  posted: number;
} {
  return {
    total: threads.length,
    needsReview: threads.filter((thread) => thread.status === "needs_review")
      .length,
    approved: threads.filter((thread) => thread.status === "approved").length,
    posted: threads.filter((thread) => thread.status === "posted").length,
  };
}

function groupThreads(threads: CommentThreadWithDetails[]): {
  drafting: CommentThreadWithDetails[];
  needsReview: CommentThreadWithDetails[];
  approved: CommentThreadWithDetails[];
  history: CommentThreadWithDetails[];
} {
  return {
    drafting: threads.filter((thread) =>
      ["drafting", "changes_requested"].includes(thread.status),
    ),
    needsReview: threads.filter((thread) => thread.status === "needs_review"),
    approved: threads.filter((thread) => thread.status === "approved"),
    history: threads.filter((thread) =>
      ["posted", "rejected", "cancelled"].includes(thread.status),
    ),
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

function ThreadGroup({
  label,
  threads,
  killSwitchEnabled,
  killSwitchReason,
  onUpdateThread,
  onUpdateVariant,
  onSetVariantStatus,
  onSetReviewStatus,
  onRecordAttempt,
}: {
  label: string;
  threads: CommentThreadWithDetails[];
} & Omit<
  React.ComponentProps<typeof CommentThreadCard>,
  "thread"
>): React.ReactNode {
  if (threads.length === 0) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold tracking-wide uppercase">{label}</h3>
      {threads.map((thread) => (
        <CommentThreadCard
          key={thread.id}
          thread={thread}
          killSwitchEnabled={killSwitchEnabled}
          killSwitchReason={killSwitchReason}
          onUpdateThread={onUpdateThread}
          onUpdateVariant={onUpdateVariant}
          onSetVariantStatus={onSetVariantStatus}
          onSetReviewStatus={onSetReviewStatus}
          onRecordAttempt={onRecordAttempt}
        />
      ))}
    </section>
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
            Open Campaigns first and create a campaign. Comments attach to
            candidate posts inside a campaign.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyComments(): React.ReactNode {
  return (
    <Card className="bg-card/70 border-dashed">
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-14 items-center justify-center rounded-2xl">
          <MessageCircle className="size-7" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">No comment threads yet</h3>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm">
            Create a local comment from an eligible shortlisted or drafted
            candidate. Linkgo audits each variant before human approval.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
