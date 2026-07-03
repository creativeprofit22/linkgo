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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { escapeLinkedInLittleText } from "@/features/approvals/linkedin-format";
import { assertCommentCanPublishViaLinkedIn } from "@/features/comments/data";
import type {
  CommentThreadWithDetails,
  RecordCommentAttemptInput,
} from "@/features/comments/types";
import { publishLinkedInComment } from "@/features/linkedin-actions";

interface PublishLinkedInCommentDialogProps {
  thread: CommentThreadWithDetails;
  targetUrn: string;
  onPublishResult: (input: RecordCommentAttemptInput) => Promise<void>;
  disabled?: boolean;
}

const CONFIRMATION_TEXT = "Post comment";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "LinkedIn comment publish failed";
}

function getIdempotencyKey(threadId: number): string {
  return `comment-thread:${threadId}:linkedin:manual`;
}

export function PublishLinkedInCommentDialog({
  thread,
  targetUrn,
  onPublishResult,
  disabled = false,
}: PublishLinkedInCommentDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const confirmationMatches = confirmationText.trim() === CONFIRMATION_TEXT;
  const commentary = escapeLinkedInLittleText(
    thread.selectedVariant?.body ?? "",
  );
  const idempotencyKey = getIdempotencyKey(thread.id);

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!confirmationMatches || disabled) return;

    setSubmitting(true);
    const publishInput = {
      commentThreadId: thread.id,
      commentary,
      targetUrn,
      idempotencyKey,
    };
    try {
      await assertCommentCanPublishViaLinkedIn(publishInput);
      const result = await publishLinkedInComment(publishInput, {
        skipPreflight: true,
      }).catch(async (caught: unknown) => {
        const message = getErrorMessage(caught);
        try {
          await onPublishResult({
            commentThreadId: thread.id,
            status: "failed",
            externalCommentUrl: "",
            platformCommentId: "",
            idempotencyKey: "",
            errorMessage: message,
          });
          toast.error("LinkedIn comment failed", { description: message });
        } catch (recordError) {
          toast.error("LinkedIn comment failed, and local recording failed", {
            description: `${message} Record error: ${getErrorMessage(recordError)}`,
          });
        }
        return null;
      });

      if (result !== null) {
        try {
          await onPublishResult({
            commentThreadId: thread.id,
            status: "succeeded",
            externalCommentUrl: result.externalCommentUrl,
            platformCommentId:
              result.platformCommentUrn || result.platformCommentId,
            idempotencyKey,
            errorMessage: "",
          });
          toast.success("Comment posted to LinkedIn", {
            description: result.platformCommentUrn || result.platformCommentId,
          });
          setConfirmationText("");
        } catch (caught) {
          toast.error("Posted to LinkedIn, but local recording failed", {
            description: `${getErrorMessage(caught)} Platform ID: ${result.platformCommentId}`,
          });
        }
      }
      setOpen(false);
    } catch (caught) {
      toast.error("LinkedIn comment blocked", {
        description: getErrorMessage(caught),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" disabled={disabled}>
          <Send className="size-4" /> Post via LinkedIn
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Post comment</DialogTitle>
            <DialogDescription>
              This posts the approved comment using the connected LinkedIn
              account.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-muted/40 rounded-xl border p-4 text-sm">
            <p>
              <span className="font-medium">Target author:</span>{" "}
              {thread.target.target_author_name || "Unknown author"}
            </p>
            <p className="break-all">
              <span className="font-medium">Target URN:</span> {targetUrn}
            </p>
          </div>

          <div className="bg-muted/40 max-h-72 overflow-auto rounded-xl border p-4">
            <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
              Exact escaped comment preview
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-line">
              {commentary}
            </p>
          </div>

          <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border p-3 text-sm">
            Posting is irreversible. Confirm the connected account and text
            before sending.
          </div>

          <div className="space-y-2">
            <Label htmlFor={`publish-linkedin-comment-confirm-${thread.id}`}>
              Type “{CONFIRMATION_TEXT}” to confirm
            </Label>
            <Input
              id={`publish-linkedin-comment-confirm-${thread.id}`}
              value={confirmationText}
              autoComplete="off"
              placeholder={CONFIRMATION_TEXT}
              aria-describedby={`publish-linkedin-comment-help-${thread.id}`}
              onChange={(event) => setConfirmationText(event.target.value)}
            />
            <p
              id={`publish-linkedin-comment-help-${thread.id}`}
              className="text-muted-foreground text-xs"
            >
              The button unlocks only for this exact confirmation text.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !confirmationMatches}>
              {submitting ? "Posting…" : "Post via LinkedIn"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
