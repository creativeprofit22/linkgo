import { AlertCircle, CheckCircle2, Info, Target } from "lucide-react";
import { CreateFirstCampaignButton } from "@/features/campaigns";
import { useEffect } from "react";
import { ListTruncationNotice } from "@/components/list-truncation-notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApprovalCard } from "@/features/approvals/components/approval-card";
import { CreateApprovalDialog } from "@/features/approvals/components/create-approval-dialog";
import { useApprovals } from "@/features/approvals/hooks/use-approvals";
import { approvalsRoute } from "@/features/approvals/schemas";
import type {
  ApprovalEligibleDraft,
  ApprovalsRouteParams,
  ApprovalWithDetails,
} from "@/features/approvals/types";
import type { CampaignWithKeywords } from "@/features/campaigns/types";
import { findPublishLock } from "@/features/publish-reconciliation";
import {
  navigateTo,
  useRouteParams,
} from "@/lib/navigation/use-hash-navigation";

export function ApprovalsView(): React.ReactNode {
  const { params: linkParams, linkIssue } = useRouteParams(approvalsRoute);
  const {
    approvals,
    approvalTotal,
    eligibleDrafts,
    eligibleDraftTotal,
    campaigns,
    selectedCampaignId,
    loading,
    campaignLoading,
    error,
    killSwitchEnabled,
    killSwitchReason,
    openPublishExecutions,
    loadApprovals,
    selectCampaign,
    createReview,
    setReviewStatus,
    scheduleReview,
    cancelScheduleJob,
    recordPublishResult,
    refreshApprovals,
    stageIndex,
  } = useApprovals({ initialCampaignId: linkParams?.campaignId });

  const summary = getApprovalSummary(approvals);
  // Summary counts cover only the returned rows when the native list is capped.
  const summarySuffix = approvalTotal > approvals.length ? " (shown)" : "";
  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const selectedCampaignArchived = selectedCampaign?.status === "archived";
  const link = resolveApprovalsLink({
    linkParams,
    linkIssue,
    ready: !loading && !campaignLoading && error === null,
    campaigns,
    selectedCampaignId,
    selectedCampaignArchived,
    approvals,
    eligibleDrafts,
  });
  const highlightedApprovalId =
    link.kind === "approval" ? link.approvalId : null;
  // Closing a dialog a link opened drops `send` from the address (replace),
  // so refresh doesn't reopen it while Back/Forward still work.
  const clearLinkAction = (): void => {
    if (linkParams?.campaignId === undefined) return;
    navigateTo(
      approvalsRoute,
      { campaignId: linkParams.campaignId },
      { replace: true },
    );
  };

  useEffect(() => {
    if (highlightedApprovalId === null) return;
    document
      .getElementById(`approval-${highlightedApprovalId}`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [highlightedApprovalId]);

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
                Review posts before anything goes live. Linkgo never posts
                without your OK.
              </p>
            </div>
          </div>
        </div>
        <CreateApprovalDialog
          eligibleDrafts={eligibleDrafts}
          eligibleDraftTotal={eligibleDraftTotal}
          selectedCampaignId={selectedCampaignId}
          selectedCampaignArchived={selectedCampaignArchived}
          disabled={campaigns.length === 0 || campaignLoading}
          onCreate={createReview}
          onCreated={(approvalId) => {
            // Point the address at the new approval so it is highlighted and
            // its "Waiting for your OK" step is in view.
            if (selectedCampaignId === null) return;
            navigateTo(
              approvalsRoute,
              { campaignId: selectedCampaignId, approvalId },
              { replace: link.kind === "send" },
            );
          }}
          {...(link.kind === "send"
            ? {
                open: true,
                lockedDraftId: link.draftId,
                onOpenChange: (next: boolean) => {
                  if (!next) clearLinkAction();
                },
              }
            : {})}
        />
      </div>

      {link.kind === "notice" && (
        <div
          role="status"
          data-testid="approvals-link-notice"
          className="bg-muted/50 text-muted-foreground flex flex-col justify-between gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center"
        >
          <span className="flex items-center gap-2">
            <Info aria-hidden="true" className="size-4 shrink-0" />
            {link.message}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              navigateTo(
                approvalsRoute,
                selectedCampaignId === null
                  ? {}
                  : { campaignId: selectedCampaignId },
                { replace: true },
              )
            }
          >
            OK
          </Button>
        </div>
      )}

      {error && (
        <Card role="alert" className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <AlertCircle
                aria-hidden="true"
                className="text-destructive size-5"
              />
              <p className="text-sm">{error}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadApprovals()}
            >
              Try again
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
                Reviews, schedules, and posting history stay on this computer.
              </p>
            </div>
            <select
              aria-label="Selected campaign"
              value={selectedCampaignId ?? ""}
              onChange={(event) => {
                const nextId = Number(event.target.value);
                selectCampaign(Number.isFinite(nextId) ? nextId : null);
                // Keep the address in step so Back returns to this campaign.
                if (linkParams?.campaignId !== undefined)
                  navigateTo(
                    approvalsRoute,
                    Number.isFinite(nextId) ? { campaignId: nextId } : {},
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

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label={`Waiting for approval${summarySuffix}`}
              value={String(summary.needsReview)}
            />
            <SummaryCard
              label={`Approved${summarySuffix}`}
              value={String(summary.approved)}
            />
            <SummaryCard
              label={`Scheduled${summarySuffix}`}
              value={String(summary.scheduled)}
            />
            <SummaryCard
              label={`Posted${summarySuffix}`}
              value={String(summary.published)}
            />
          </div>

          {campaignLoading ? (
            <Card className="bg-card/70" aria-busy="true">
              <CardContent className="text-muted-foreground p-8 text-center text-sm">
                Loading approvals…
              </CardContent>
            </Card>
          ) : error ? null : (
            <>
              {eligibleDrafts.length === 0 && (
                <Card className="bg-card/70 border-dashed">
                  <CardContent className="text-muted-foreground p-4 text-sm">
                    No drafts are ready to send for approval. In Drafts, pick a
                    version that passed its checks first.
                  </CardContent>
                </Card>
              )}

              <ListTruncationNotice
                shownCount={approvals.length}
                totalCount={approvalTotal}
                noun="approvals"
              />

              {approvals.length === 0 ? (
                <EmptyApprovals />
              ) : (
                <div className="space-y-4">
                  {approvals.map((approval) => (
                    <ApprovalCard
                      key={approval.id}
                      approval={approval}
                      stage={stageIndex?.byApprovalId.get(approval.id) ?? null}
                      highlighted={approval.id === highlightedApprovalId}
                      killSwitchEnabled={killSwitchEnabled}
                      killSwitchReason={killSwitchReason}
                      publishLock={findPublishLock(
                        openPublishExecutions,
                        "post",
                        approval.id,
                      )}
                      onSetStatus={setReviewStatus}
                      onSchedule={scheduleReview}
                      onCancelSchedule={cancelScheduleJob}
                      onRecordPublishAttempt={recordPublishResult}
                      onPublished={refreshApprovals}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

type ApprovalsLinkState =
  | { kind: "none" }
  | { kind: "approval"; approvalId: number }
  | { kind: "send"; draftId: number }
  | { kind: "notice"; message: string };

/**
 * Link params are untrusted: each target must exist in the linked campaign
 * (and a draft must be ready) before it is highlighted or preselected.
 * Nothing here approves, schedules or posts — `send` only opens the dialog.
 */
function resolveApprovalsLink(input: {
  linkParams: ApprovalsRouteParams | null;
  linkIssue: boolean;
  ready: boolean;
  campaigns: CampaignWithKeywords[];
  selectedCampaignId: number | null;
  selectedCampaignArchived: boolean;
  approvals: ApprovalWithDetails[];
  eligibleDrafts: ApprovalEligibleDraft[];
}): ApprovalsLinkState {
  if (input.linkIssue)
    return {
      kind: "notice",
      message: "That link doesn't point to a valid approval. Showing all.",
    };
  const { linkParams } = input;
  if (!linkParams || linkParams.campaignId === undefined || !input.ready)
    return { kind: "none" };
  if (!input.campaigns.some((c) => c.id === linkParams.campaignId))
    return {
      kind: "notice",
      message: "We couldn't find that campaign. Showing your approvals.",
    };
  // Wait for the linked campaign to become the selected one.
  if (input.selectedCampaignId !== linkParams.campaignId)
    return { kind: "none" };
  if (linkParams.approvalId !== undefined) {
    const approvalId = linkParams.approvalId;
    return input.approvals.some((approval) => approval.id === approvalId)
      ? { kind: "approval", approvalId }
      : {
          kind: "notice",
          message: "We couldn't find that approval in this campaign.",
        };
  }
  if (linkParams.draftId !== undefined && linkParams.send === "1") {
    const draftId = linkParams.draftId;
    if (input.selectedCampaignArchived)
      return {
        kind: "notice",
        message:
          "This campaign is archived, so that draft can't be sent for approval.",
      };
    const existing = input.approvals.find(
      (approval) =>
        approval.draft_id === draftId &&
        approval.status !== "rejected" &&
        approval.status !== "cancelled",
    );
    if (existing) return { kind: "approval", approvalId: existing.id };
    return input.eligibleDrafts.some((draft) => draft.id === draftId)
      ? { kind: "send", draftId }
      : {
          kind: "notice",
          message:
            "That draft isn't ready to send yet. In Drafts, choose a version and pass its checks first.",
        };
  }
  return { kind: "none" };
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
            Create a campaign to get started. Approvals are for draft posts
            inside a campaign.
          </p>
        </div>
        <CreateFirstCampaignButton />
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
            Pick a version that passed its checks in Drafts, then send it for
            approval here.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
