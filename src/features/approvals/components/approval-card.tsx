import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ApprovalStatusBadge,
  PublishAttemptStatusBadge,
  ScheduleJobStatusBadge,
} from "@/features/approvals/components/approval-status-badge";
import { toPlainMessage } from "@/lib/plain-message";
import { PublishLinkedInDialog } from "@/features/approvals/components/publish-linkedin-dialog";
import { RecordPublishAttemptDialog } from "@/features/approvals/components/record-publish-attempt-dialog";
import { RejectApprovalDialog } from "@/features/approvals/components/reject-approval-dialog";
import { ScheduleApprovalDialog } from "@/features/approvals/components/schedule-approval-dialog";
import {
  composeLinkedInCommentary,
  escapeLinkedInLittleText,
} from "@/features/approvals/linkedin-format";
import type {
  ApprovalWithDetails,
  CancelScheduleInput,
  RecordPublishAttemptInput,
  ScheduleApprovalInput,
  SetApprovalStatusInput,
} from "@/features/approvals/types";
import {
  PublishLockNotice,
  type PublishLock,
} from "@/features/publish-reconciliation";

interface ApprovalCardProps {
  approval: ApprovalWithDetails;
  killSwitchEnabled: boolean;
  killSwitchReason: string;
  /** Open native publish execution for this approval; the native gate decides. */
  publishLock: PublishLock | null;
  onSetStatus: (input: SetApprovalStatusInput) => Promise<void>;
  onSchedule: (input: ScheduleApprovalInput) => Promise<void>;
  onCancelSchedule: (input: CancelScheduleInput) => Promise<void>;
  onRecordPublishAttempt: (input: RecordPublishAttemptInput) => Promise<void>;
  onPublished: () => Promise<void> | void;
}

export function ApprovalCard({
  approval,
  killSwitchEnabled,
  killSwitchReason,
  publishLock,
  onSetStatus,
  onSchedule,
  onCancelSchedule,
  onRecordPublishAttempt,
  onPublished,
}: ApprovalCardProps): React.ReactNode {
  const authorName = approval.draft.target_author_name || "Author not known";
  const rawCommentary = composeLinkedInCommentary(approval.variant);
  const escapedCommentary = escapeLinkedInLittleText(rawCommentary);
  const isArchivedCampaign = approval.draft.campaign_status === "archived";
  const canApprove =
    !isArchivedCampaign &&
    ["needs_review", "changes_requested"].includes(approval.status);
  const canRequestChanges =
    !isArchivedCampaign &&
    ["needs_review", "approved"].includes(approval.status);
  const canReject =
    !isArchivedCampaign &&
    ["needs_review", "changes_requested"].includes(approval.status);
  // Readiness can be revoked without a stored status change (for example a
  // newer AI audit run on the same revision). mapApproval already displays such
  // approvals as changes_requested; outbound actions also check readiness
  // directly, and natively before any write or LinkedIn call.
  const isReady = approval.readyForApproval;
  const canSchedule =
    !isArchivedCampaign &&
    !killSwitchEnabled &&
    isReady &&
    approval.status === "approved" &&
    (!approval.scheduleJob ||
      ["cancelled", "failed"].includes(approval.scheduleJob.status));
  const canCancelSchedule =
    !isArchivedCampaign &&
    approval.scheduleJob?.status === "scheduled" &&
    approval.status === "scheduled";
  const hasSuccessfulPublishAttempt = approval.publishAttempts.some(
    (attempt) => attempt.status === "succeeded",
  );
  const canRecordPublish =
    !isArchivedCampaign && ["approved", "scheduled"].includes(approval.status);
  // A failed outcome is recorded even when readiness was lost after approval;
  // natively it then moves the approval to changes_requested (see approvals.rs).
  const canRecordFailure =
    !isArchivedCampaign &&
    ["approved", "scheduled"].includes(approval.storedStatus);
  const canPublishViaLinkedIn =
    canRecordPublish &&
    isReady &&
    !killSwitchEnabled &&
    !hasSuccessfulPublishAttempt;
  const scheduleBlockedByKillSwitch =
    !isArchivedCampaign &&
    killSwitchEnabled &&
    approval.status === "approved" &&
    (!approval.scheduleJob ||
      ["cancelled", "failed"].includes(approval.scheduleJob.status));
  const linkedAgentRunConsequence =
    approval.linkedAgentRunCount === 1
      ? "1 waiting AI assistant task will be cancelled and can't be continued."
      : `${approval.linkedAgentRunCount} waiting AI assistant tasks will be cancelled and can't be continued.`;

  function cancelScheduleJob(): void {
    const scheduleJob = approval.scheduleJob;
    if (!scheduleJob) return;
    if (
      window.confirm(
        "Cancel this scheduled post? It will go back to Approved and won't post.",
      )
    ) {
      void onCancelSchedule({ id: scheduleJob.id });
    }
  }

  return (
    <Card className="linkgo-card bg-card/82 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="truncate">{authorName}</CardTitle>
              <ApprovalStatusBadge status={approval.status} />
              {approval.scheduleJob && (
                <ScheduleJobStatusBadge status={approval.scheduleJob.status} />
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              {approval.draft.campaign_name} · Version{" "}
              {approval.variant.variant_number}
            </p>
            <a
              href={approval.draft.target_url}
              target="_blank"
              rel="noreferrer"
              className="text-linkgo-blue inline-flex max-w-full items-center gap-1 truncate text-sm hover:underline"
            >
              <span className="truncate">{approval.draft.target_url}</span>
              <ExternalLink className="size-3" />
            </a>
            {approval.linkedAgentRunCount > 0 && (
              <p className="text-destructive text-sm font-medium">
                If you reject this: {linkedAgentRunConsequence}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {isArchivedCampaign && (
              <p className="bg-muted/60 text-muted-foreground max-w-72 rounded-md border px-3 py-2 text-right text-sm">
                This campaign is archived, so its approvals can't change.
                Restore the campaign first.
              </p>
            )}
            {canApprove && (
              <Button
                type="button"
                size="sm"
                disabled={!approval.readyForApproval}
                onClick={() =>
                  void onSetStatus({
                    id: approval.id,
                    status: "approved",
                    contentRevision: approval.currentContentRevision,
                  })
                }
              >
                Approve
              </Button>
            )}
            {canRequestChanges && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  void onSetStatus({
                    id: approval.id,
                    status: "changes_requested",
                  })
                }
              >
                Request changes
              </Button>
            )}
            {canReject && (
              <RejectApprovalDialog
                approvalId={approval.id}
                linkedAgentRunConsequence={linkedAgentRunConsequence}
                onSetStatus={onSetStatus}
              />
            )}
            {canSchedule && (
              <ScheduleApprovalDialog
                approvalId={approval.id}
                onSchedule={onSchedule}
              />
            )}
            {scheduleBlockedByKillSwitch && (
              <p className="bg-muted/60 text-muted-foreground max-w-72 rounded-md border px-3 py-2 text-right text-sm">
                Pause everything is on, so posts can't be scheduled.
                {killSwitchReason ? ` ${killSwitchReason}` : ""}
              </p>
            )}
            {canCancelSchedule && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={cancelScheduleJob}
              >
                Cancel schedule
              </Button>
            )}
            {canRecordPublish && isReady && (
              <RecordPublishAttemptDialog
                approvalId={approval.id}
                scheduleJobId={approval.scheduleJob?.id}
                initialStatus="succeeded"
                triggerLabel="Mark as posted"
                onRecord={onRecordPublishAttempt}
              />
            )}
            {canPublishViaLinkedIn && (
              <PublishLinkedInDialog
                approval={approval}
                commentary={escapedCommentary}
                onPublished={onPublished}
                disabled={publishLock !== null}
              />
            )}
            {canPublishViaLinkedIn && publishLock !== null && (
              <PublishLockNotice lock={publishLock} />
            )}
            {canRecordFailure && (
              <RecordPublishAttemptDialog
                approvalId={approval.id}
                scheduleJobId={approval.scheduleJob?.id}
                initialStatus="failed"
                triggerLabel="Mark as not posted"
                onRecord={onRecordPublishAttempt}
              />
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {(!approval.readyForApproval || approval.contentChanged) && (
          <p role="status" className="text-muted-foreground text-sm">
            {approval.contentChanged
              ? "This post changed after it was reviewed, or we can't tell which version was reviewed. It is not approved. "
              : "This version isn't ready for approval yet. "}
            {approval.readyForApproval
              ? "Its checks pass. Read it again and approve it if you're happy."
              : "In Drafts, run an AI review and a quality check on this version before approving."}
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <TextBlock
            label="Chosen version"
            value={
              approval.status === "published" && approval.contentChanged
                ? "The reviewed text isn't available anymore. This post was already posted."
                : rawCommentary
            }
          />
          <TextBlock
            label="How it will look on LinkedIn"
            value={
              approval.status === "published" && approval.contentChanged
                ? "The reviewed text isn't available anymore."
                : escapedCommentary
            }
          />
        </div>

        <TextBlock
          label="Original post"
          value={approval.draft.target_content}
        />

        {approval.reviewer_notes && (
          <TextBlock label="Reviewer notes" value={approval.reviewer_notes} />
        )}

        {approval.scheduleJob && (
          <div className="bg-muted/30 rounded-xl border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">Schedule</p>
              <ScheduleJobStatusBadge status={approval.scheduleJob.status} />
            </div>
            <p className="text-muted-foreground mt-2 text-sm">
              {approval.scheduleJob.scheduled_for} ·{" "}
              {approval.scheduleJob.timezone}
            </p>
            <p className="text-muted-foreground mt-1 text-xs break-all">
              Reference: {approval.scheduleJob.idempotency_key}
            </p>
          </div>
        )}

        <Separator />

        <div className="space-y-3">
          <div>
            <h3 className="font-medium">Posting history</h3>
            <p className="text-muted-foreground text-sm">
              Results of each posting attempt. Linkgo never posts without your
              OK.
            </p>
          </div>
          {approval.publishAttempts.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No posting attempts yet.
            </p>
          ) : (
            <div className="space-y-3">
              {approval.publishAttempts.map((attempt) => (
                <div
                  key={attempt.id}
                  className="bg-muted/30 space-y-2 rounded-xl border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <PublishAttemptStatusBadge status={attempt.status} />
                    <span className="text-muted-foreground">
                      {attempt.created_at}
                    </span>
                  </div>
                  {attempt.external_post_url && (
                    <a
                      href={attempt.external_post_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-linkgo-blue inline-flex max-w-full items-center gap-1 truncate hover:underline"
                    >
                      <span className="truncate">
                        {attempt.external_post_url}
                      </span>
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                  {attempt.platform_post_id && (
                    <p className="text-muted-foreground break-all">
                      LinkedIn reference: {attempt.platform_post_id}
                    </p>
                  )}
                  {attempt.error_message && (
                    <p className="text-destructive whitespace-pre-line">
                      {toPlainMessage(attempt.error_message)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TextBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className="line-clamp-6 text-sm leading-relaxed whitespace-pre-line">
        {value || "—"}
      </p>
    </div>
  );
}
