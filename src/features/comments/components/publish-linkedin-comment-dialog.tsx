import { Send } from "lucide-react";
import { useState, type SyntheticEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toPlainMessage } from "@/lib/plain-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { escapeLinkedInLittleText } from "@/features/approvals/linkedin-format";
import { assertCommentCanPublishViaLinkedIn } from "@/features/comments/data";
import type { CommentThreadWithDetails } from "@/features/comments/types";
import {
  OUTCOME_UNKNOWN_TITLE,
  OutcomeUnknownAlert,
  publishLinkedInComment,
  type ExecutionOutcome,
} from "@/features/linkedin-actions";

interface PublishLinkedInCommentDialogProps {
  thread: CommentThreadWithDetails;
  targetUrn: string;
  /** Refreshes comment threads after native code settled the outcome. */
  onPublished: () => Promise<void> | void;
  disabled?: boolean;
}

interface UnknownOutcomeState {
  executionId: number;
  message: string;
}

const CONFIRMATION_TEXT = "Post comment";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? toPlainMessage(error.message)
    : "We couldn't post this comment to LinkedIn. Try again later.";
}

function getIdempotencyKey(threadId: number): string {
  return `comment-thread:${threadId}:linkedin:manual`;
}

export function PublishLinkedInCommentDialog({
  thread,
  targetUrn,
  onPublished,
  disabled = false,
}: PublishLinkedInCommentDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [unknownOutcome, setUnknownOutcome] =
    useState<UnknownOutcomeState | null>(null);
  const confirmationMatches = confirmationText.trim() === CONFIRMATION_TEXT;
  const commentary = escapeLinkedInLittleText(
    thread.selectedVariant?.body ?? "",
  );
  const idempotencyKey = getIdempotencyKey(thread.id);

  const handleOpenChange = (nextOpen: boolean): void => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setUnknownOutcome(null);
      setConfirmationText("");
    }
  };

  const refresh = async (): Promise<void> => {
    try {
      await onPublished();
    } catch {
      // The parent hook reports its own load errors.
    }
  };

  const showOutcome = (outcome: ExecutionOutcome): void => {
    switch (outcome.status) {
      case "succeeded":
        toast.success("Comment posted to LinkedIn", {
          description: outcome.platformId || outcome.externalUrl,
        });
        handleOpenChange(false);
        return;
      case "failed":
        toast.error("Your comment didn't post", {
          description: toPlainMessage(outcome.message),
        });
        handleOpenChange(false);
        return;
      case "blocked":
        toast.error("Linkgo held back this comment", {
          description: toPlainMessage(outcome.message),
        });
        handleOpenChange(false);
        return;
      case "outcomeUnknown":
      case "staleOwner":
        setConfirmationText("");
        setUnknownOutcome({
          executionId: outcome.executionId,
          message: outcome.message,
        });
        toast.warning(OUTCOME_UNKNOWN_TITLE, {
          description:
            "Don't post it again. Check LinkedIn, then confirm what happened in Safety.",
        });
        return;
    }
  };

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!confirmationMatches || disabled || unknownOutcome !== null) return;

    setSubmitting(true);
    const publishInput = {
      commentThreadId: thread.id,
      commentary,
      targetUrn,
      idempotencyKey,
    };
    try {
      await assertCommentCanPublishViaLinkedIn(publishInput);
    } catch (caught) {
      toast.error("Linkgo held back this comment", {
        description: getErrorMessage(caught),
      });
      setSubmitting(false);
      return;
    }

    try {
      // Native code records the attempt, thread status, audit, and error
      // queue in one transaction; the renderer only reports the outcome.
      const outcome = await publishLinkedInComment(publishInput, {
        skipPreflight: true,
      });
      showOutcome(outcome);
    } catch (caught) {
      toast.error("Your comment didn't post", {
        description: getErrorMessage(caught),
      });
    } finally {
      await refresh();
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" disabled={disabled}>
          <Send className="size-4" /> Post to LinkedIn
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Post comment</DialogTitle>
            <DialogDescription>
              This posts your approved comment from your connected LinkedIn
              account. Linkgo never posts without your OK.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-muted/40 rounded-xl border p-4 text-sm">
            <p>
              <span className="font-medium">Replying to:</span>{" "}
              {thread.target.target_author_name || "Unknown author"}
            </p>
            <p className="break-all">
              <span className="font-medium">LinkedIn reference:</span>{" "}
              {targetUrn}
            </p>
          </div>

          <div className="bg-muted/40 max-h-72 overflow-auto rounded-xl border p-4">
            <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
              Exactly what will post
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-line">
              {commentary}
            </p>
          </div>

          <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border p-3 text-sm">
            You can&rsquo;t undo a post. Check the account and the text before
            you post.
          </div>

          {unknownOutcome !== null && (
            <OutcomeUnknownAlert
              itemLabel="comment"
              executionId={unknownOutcome.executionId}
              message={toPlainMessage(unknownOutcome.message)}
            />
          )}

          <div className="space-y-2">
            <Label htmlFor={`publish-linkedin-comment-confirm-${thread.id}`}>
              Type “{CONFIRMATION_TEXT}” to confirm
            </Label>
            <Input
              id={`publish-linkedin-comment-confirm-${thread.id}`}
              value={confirmationText}
              autoComplete="off"
              disabled={unknownOutcome !== null}
              placeholder={CONFIRMATION_TEXT}
              aria-describedby={`publish-linkedin-comment-help-${thread.id}`}
              onChange={(event) => setConfirmationText(event.target.value)}
            />
            <p
              id={`publish-linkedin-comment-help-${thread.id}`}
              className="text-muted-foreground text-xs"
            >
              The post button only turns on when you type these exact words.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              {unknownOutcome === null ? "Cancel" : "Close"}
            </Button>
            <Button
              type="submit"
              disabled={
                submitting || !confirmationMatches || unknownOutcome !== null
              }
            >
              {submitting ? "Posting…" : "Post to LinkedIn"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
