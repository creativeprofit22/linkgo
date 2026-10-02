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
import { assertApprovalCanPublishViaLinkedIn } from "@/features/approvals/data";
import type { ApprovalWithDetails } from "@/features/approvals/types";
import {
  OUTCOME_UNKNOWN_TITLE,
  OutcomeUnknownAlert,
  publishLinkedInPost,
  type ExecutionOutcome,
} from "@/features/linkedin-actions";

interface PublishLinkedInDialogProps {
  approval: ApprovalWithDetails;
  commentary: string;
  /** Refreshes approvals after native code settled the publish outcome. */
  onPublished: () => Promise<void> | void;
  /** Locks the trigger, e.g. while a publish execution is still open. */
  disabled?: boolean;
  /** Outline trigger when another action is the card's primary next step. */
  secondary?: boolean;
}

interface UnknownOutcomeState {
  executionId: number;
  message: string;
}

const CONFIRMATION_TEXT = "Post now";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? toPlainMessage(error.message)
    : "Something went wrong. Check LinkedIn before you try again.";
}

function getPublishScheduleJobId(
  approval: ApprovalWithDetails,
): number | undefined {
  if (approval.status !== "scheduled") return undefined;
  if (approval.scheduleJob?.status !== "scheduled") return undefined;
  return approval.scheduleJob.id;
}

function getIdempotencyKey(approval: ApprovalWithDetails): string {
  return `approval:${approval.id}:linkedin:${getPublishScheduleJobId(approval) ?? "manual"}`;
}

export function PublishLinkedInDialog({
  approval,
  commentary,
  onPublished,
  disabled = false,
  secondary = false,
}: PublishLinkedInDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [unknownOutcome, setUnknownOutcome] =
    useState<UnknownOutcomeState | null>(null);
  const confirmationMatches = confirmationText.trim() === CONFIRMATION_TEXT;
  const scheduleJobId = getPublishScheduleJobId(approval);

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
        toast.success("Posted to LinkedIn", {
          description: outcome.platformId || outcome.externalUrl,
        });
        handleOpenChange(false);
        return;
      case "failed":
        toast.error("Your post didn't go out", {
          description: toPlainMessage(outcome.message),
        });
        handleOpenChange(false);
        return;
      case "blocked":
        toast.error("Linkgo stopped this post", {
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
            "Don't post again. Check LinkedIn, then confirm what happened in Safety.",
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
      approvalId: approval.id,
      commentary,
      idempotencyKey: getIdempotencyKey(approval),
      ...(scheduleJobId === undefined ? {} : { scheduleJobId }),
    };
    try {
      await assertApprovalCanPublishViaLinkedIn({
        approvalId: approval.id,
        ...(scheduleJobId === undefined ? {} : { scheduleJobId }),
      });
    } catch (caught) {
      toast.error("Linkgo stopped this post", {
        description: getErrorMessage(caught),
      });
      setSubmitting(false);
      return;
    }

    try {
      // Native code records the attempt, approval, schedule job, audit, and
      // error queue in one transaction; the renderer only reports the outcome.
      const outcome = await publishLinkedInPost(publishInput);
      showOutcome(outcome);
    } catch (caught) {
      toast.error("Your post didn't go out", {
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
        <Button
          type="button"
          size="sm"
          variant={secondary ? "outline" : "default"}
          disabled={disabled}
        >
          <Send className="size-4" /> Post to LinkedIn
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Post to LinkedIn now</DialogTitle>
            <DialogDescription>
              This posts to LinkedIn from your connected account. Linkgo never
              posts without your OK.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-muted/40 max-h-72 overflow-auto rounded-xl border p-4">
            <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
              Exactly how it will look on LinkedIn
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-line">
              {commentary}
            </p>
          </div>

          <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border p-3 text-sm">
            You can't undo a post from here. Check the account and the text
            before you post.
          </div>

          {unknownOutcome !== null && (
            <OutcomeUnknownAlert
              itemLabel="post"
              executionId={unknownOutcome.executionId}
              message={toPlainMessage(unknownOutcome.message)}
            />
          )}

          <div className="space-y-2">
            <Label htmlFor={`publish-linkedin-confirm-${approval.id}`}>
              Type “{CONFIRMATION_TEXT}” to confirm
            </Label>
            <Input
              id={`publish-linkedin-confirm-${approval.id}`}
              value={confirmationText}
              autoComplete="off"
              disabled={unknownOutcome !== null}
              placeholder={CONFIRMATION_TEXT}
              aria-describedby={`publish-linkedin-help-${approval.id}`}
              onChange={(event) => setConfirmationText(event.target.value)}
            />
            <p
              id={`publish-linkedin-help-${approval.id}`}
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
