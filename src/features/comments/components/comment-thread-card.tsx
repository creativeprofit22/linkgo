import { useEffect, useState } from "react";
import { ExternalLink, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { CommentVariantCard } from "@/features/comments/components/comment-variant-card";
import {
  CommentAuditSeverityBadge,
  CommentThreadStatusBadge,
} from "@/features/comments/components/comment-status-badge";
import { PublishLinkedInCommentDialog } from "@/features/comments/components/publish-linkedin-comment-dialog";
import { RecordCommentAttemptDialog } from "@/features/comments/components/record-comment-attempt-dialog";
import { resolveLinkedInTargetUrn } from "@/features/linkedin-actions/urn";
import type {
  CommentThreadWithDetails,
  RecordCommentAttemptInput,
  SetCommentThreadStatusInput,
  SetCommentVariantStatusInput,
  UpdateCommentThreadInput,
  UpdateCommentVariantInput,
} from "@/features/comments/types";

interface CommentThreadCardProps {
  thread: CommentThreadWithDetails;
  killSwitchEnabled: boolean;
  killSwitchReason: string;
  onUpdateThread: (input: UpdateCommentThreadInput) => Promise<void>;
  onUpdateVariant: (input: UpdateCommentVariantInput) => Promise<void>;
  onSetVariantStatus: (input: SetCommentVariantStatusInput) => Promise<void>;
  onSetReviewStatus: (input: SetCommentThreadStatusInput) => Promise<void>;
  onRecordAttempt: (input: RecordCommentAttemptInput) => Promise<void>;
}

const editableStatuses = [
  "drafting",
  "changes_requested",
  "needs_review",
  "approved",
];

const terminalStatuses = ["posted", "rejected", "cancelled"];

export function CommentThreadCard({
  thread,
  killSwitchEnabled,
  killSwitchReason,
  onUpdateThread,
  onUpdateVariant,
  onSetVariantStatus,
  onSetReviewStatus,
  onRecordAttempt,
}: CommentThreadCardProps): React.ReactNode {
  const archived = thread.campaign_status === "archived";
  const isTerminal = terminalStatuses.includes(thread.status);
  const editable = !archived && editableStatuses.includes(thread.status);
  const selectedVariantReady =
    thread.selectedVariant !== null &&
    thread.selectedVariant.auditSeverity !== "block";
  const canSubmit =
    editable &&
    ["drafting", "changes_requested"].includes(thread.status) &&
    selectedVariantReady;
  const canReview = editable && thread.status === "needs_review";
  const canRecordAttempt = editable && thread.status === "approved";
  const targetUrn = resolveLinkedInTargetUrn(
    thread.target.target_platform_resource_urn || thread.target.target_url,
  );
  const canPostViaLinkedIn =
    canRecordAttempt &&
    !killSwitchEnabled &&
    selectedVariantReady &&
    targetUrn !== "";
  const [operatorNotes, setOperatorNotes] = useState(thread.operator_notes);
  const [reviewerNotes, setReviewerNotes] = useState(thread.reviewer_notes);
  const [savingNotes, setSavingNotes] = useState(false);
  const notesChanged =
    operatorNotes !== thread.operator_notes ||
    reviewerNotes !== thread.reviewer_notes;

  useEffect(() => {
    setOperatorNotes(thread.operator_notes);
    setReviewerNotes(thread.reviewer_notes);
  }, [thread.id, thread.operator_notes, thread.reviewer_notes]);

  function setStatus(
    status: SetCommentThreadStatusInput["status"],
    reviewerNotes?: string,
  ): void {
    void onSetReviewStatus({
      id: thread.id,
      status,
      ...(reviewerNotes === undefined ? {} : { reviewerNotes }),
    });
  }

  async function saveNotes(): Promise<void> {
    if (archived || !notesChanged) return;
    setSavingNotes(true);
    try {
      await onUpdateThread({
        id: thread.id,
        operatorNotes,
        reviewerNotes,
      });
    } finally {
      setSavingNotes(false);
    }
  }

  return (
    <Card className="bg-card/80 overflow-hidden">
      <CardHeader className="space-y-4">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-9 items-center justify-center rounded-lg">
                <MessageCircle className="size-4" />
              </div>
              <CardTitle className="text-lg">
                Reply to {thread.target.target_author_name || "Unknown author"}
              </CardTitle>
              <CommentThreadStatusBadge status={thread.status} />
              <CommentAuditSeverityBadge severity={thread.auditSeverity} />
            </div>
            <p className="text-muted-foreground text-sm">
              Campaign: {thread.campaign_name}
              {archived ? " (archived)" : ""} · Source keyword:{" "}
              {thread.target.source_keyword || "—"}
            </p>
          </div>
          <a
            href={thread.target.target_url}
            target="_blank"
            rel="noreferrer"
            className="text-linkgo-blue inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            Open target <ExternalLink className="size-3.5" />
          </a>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="bg-background/70 rounded-lg border p-4">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Target post
          </p>
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
            {thread.target.target_content}
          </p>
        </div>

        <div className="bg-background/70 space-y-3 rounded-lg border p-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-semibold">Thread notes</p>
              <p className="text-muted-foreground text-xs">
                Operator and reviewer context stays local and editable before
                archive.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={archived || !notesChanged || savingNotes}
                onClick={() => {
                  setOperatorNotes(thread.operator_notes);
                  setReviewerNotes(thread.reviewer_notes);
                }}
              >
                Reset notes
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={archived || !notesChanged || savingNotes}
                onClick={() => void saveNotes()}
              >
                {savingNotes ? "Saving…" : "Save notes"}
              </Button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <NoteField
              id={`operator-notes-${thread.id}`}
              label="Operator notes"
              value={operatorNotes}
              disabled={archived || savingNotes}
              onChange={setOperatorNotes}
            />
            <NoteField
              id={`reviewer-notes-${thread.id}`}
              label="Reviewer notes"
              value={reviewerNotes}
              disabled={archived || savingNotes}
              onChange={setReviewerNotes}
            />
          </div>
        </div>

        {thread.variants.map((variant) => (
          <CommentVariantCard
            key={variant.id}
            variant={variant}
            editable={editable}
            onUpdateVariant={onUpdateVariant}
            onSetVariantStatus={onSetVariantStatus}
          />
        ))}

        {thread.attempts.length > 0 && (
          <div className="space-y-3">
            <Separator />
            <p className="text-sm font-semibold">Comment attempt history</p>
            {thread.attempts.map((attempt) => (
              <div key={attempt.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {attempt.status === "succeeded" ? "Posted" : "Failed"} ·{" "}
                  {attempt.created_at}
                </p>
                {attempt.external_comment_url && (
                  <p className="text-muted-foreground break-all">
                    URL: {attempt.external_comment_url}
                  </p>
                )}
                {attempt.platform_comment_id && (
                  <p className="text-muted-foreground break-all">
                    ID: {attempt.platform_comment_id}
                  </p>
                )}
                {attempt.error_message && (
                  <p className="text-destructive mt-1">
                    {attempt.error_message}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {archived ? (
          <p className="text-muted-foreground text-sm">
            Archived campaign history is visible, but comment mutations are
            blocked.
          </p>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              disabled={!canSubmit}
              onClick={() => setStatus("needs_review")}
            >
              Submit for review
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canReview}
              onClick={() => setStatus("approved")}
            >
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canReview}
              onClick={() =>
                setStatus("changes_requested", "Changes requested")
              }
            >
              Request changes
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={!canReview}
              onClick={() => setStatus("rejected", "Rejected by reviewer")}
            >
              Reject
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isTerminal}
              onClick={() => setStatus("cancelled")}
            >
              Cancel
            </Button>
            {canRecordAttempt && killSwitchEnabled ? (
              <p className="text-muted-foreground text-sm">
                Post via LinkedIn is hidden by the global kill switch
                {killSwitchReason ? `: ${killSwitchReason}` : "."}
              </p>
            ) : canRecordAttempt && targetUrn ? (
              <PublishLinkedInCommentDialog
                thread={thread}
                targetUrn={targetUrn}
                onPublishResult={onRecordAttempt}
                disabled={!canPostViaLinkedIn}
              />
            ) : canRecordAttempt ? (
              <p className="text-muted-foreground text-sm">
                LinkedIn target URN could not be resolved from the candidate
                URL; use manual recording.
              </p>
            ) : null}
            <RecordCommentAttemptDialog
              thread={thread}
              status="succeeded"
              onRecord={onRecordAttempt}
              disabled={!canRecordAttempt}
              triggerLabel="Record posted manually"
            />
            <RecordCommentAttemptDialog
              thread={thread}
              status="failed"
              onRecord={onRecordAttempt}
              disabled={!canRecordAttempt}
            />
          </>
        )}
      </CardFooter>
    </Card>
  );
}

function NoteField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}): React.ReactNode {
  return (
    <label className="space-y-1" htmlFor={id}>
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </span>
      <Textarea
        id={id}
        value={value}
        maxLength={2000}
        disabled={disabled}
        placeholder="Add local workflow context."
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="text-muted-foreground block text-right text-xs">
        {value.length}/2000
      </span>
    </label>
  );
}
