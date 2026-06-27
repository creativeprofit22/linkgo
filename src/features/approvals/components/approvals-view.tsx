import { AlertCircle, CheckCircle2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApprovalCard } from "@/features/approvals/components/approval-card";
import { CreateApprovalDialog } from "@/features/approvals/components/create-approval-dialog";
import { useApprovals } from "@/features/approvals/hooks/use-approvals";
import type { ApprovalWithDetails } from "@/features/approvals/types";

export function ApprovalsView(): React.ReactNode {
  const {
    approvals,
    eligibleDrafts,
    campaigns,
    selectedCampaignId,
    loading,
    error,
    killSwitchEnabled,
    killSwitchReason,
    loadApprovals,
    selectCampaign,
    createReview,
    setReviewStatus,
    scheduleReview,
    cancelScheduleJob,
    recordPublishResult,
  } = useApprovals();

  const summary = getApprovalSummary(approvals);
  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const selectedCampaignArchived = selectedCampaign?.status === "archived";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-11 items-center justify-center rounded-xl">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Approvals
              </h2>
              <p className="text-muted-foreground text-sm">
                Human review, conservative scheduling, and manual publish
                tracking. No LinkedIn API publishing happens here.
              </p>
            </div>
          </div>
        </div>
        <CreateApprovalDialog
          eligibleDrafts={eligibleDrafts}
          selectedCampaignId={selectedCampaignId}
          selectedCampaignArchived={selectedCampaignArchived}
          disabled={campaigns.length === 0}
          onCreate={createReview}
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
              onClick={() => void loadApprovals()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card className="bg-card/70">
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            Loading approvals…
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
                Reviews, schedule records, and publish attempts stay local.
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
            <SummaryCard
              label="Needs review"
              value={String(summary.needsReview)}
            />
            <SummaryCard label="Approved" value={String(summary.approved)} />
            <SummaryCard label="Scheduled" value={String(summary.scheduled)} />
            <SummaryCard label="Published" value={String(summary.published)} />
          </div>

          {eligibleDrafts.length === 0 && (
            <Card className="bg-card/70 border-dashed">
              <CardContent className="text-muted-foreground p-4 text-sm">
                No eligible ready-for-review drafts are waiting. Select a clean
                draft variant in Drafts first.
              </CardContent>
            </Card>
          )}

          {approvals.length === 0 ? (
            <EmptyApprovals />
          ) : (
            <div className="space-y-4">
              {approvals.map((approval) => (
                <ApprovalCard
                  key={approval.id}
                  approval={approval}
                  killSwitchEnabled={killSwitchEnabled}
                  killSwitchReason={killSwitchReason}
                  onSetStatus={setReviewStatus}
                  onSchedule={scheduleReview}
                  onCancelSchedule={cancelScheduleJob}
                  onRecordPublishAttempt={recordPublishResult}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function getApprovalSummary(approvals: ApprovalWithDetails[]): {
  needsReview: number;
  approved: number;
  scheduled: number;
  published: number;
} {
  return {
    needsReview: approvals.filter(
      (approval) => approval.status === "needs_review",
    ).length,
    approved: approvals.filter((approval) => approval.status === "approved")
      .length,
    scheduled: approvals.filter((approval) => approval.status === "scheduled")
      .length,
    published: approvals.filter((approval) => approval.status === "published")
      .length,
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
            Open Campaigns first and create a campaign. Approvals attach to
            reviewed draft variants inside a campaign.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyApprovals(): React.ReactNode {
  return (
    <Card className="bg-card/70 border-dashed">
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-14 items-center justify-center rounded-2xl">
          <CheckCircle2 className="size-7" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">No approvals yet</h3>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm">
            Create a review from a ready draft after selecting a clean variant
            in Drafts.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
