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
import { assertApprovalCanPublishViaLinkedIn } from "@/features/approvals/data";
import type {
  ApprovalWithDetails,
  RecordPublishAttemptInput,
} from "@/features/approvals/types";
import { publishLinkedInPost } from "@/features/linkedin-actions";

interface PublishLinkedInDialogProps {
  approval: ApprovalWithDetails;
  commentary: string;
  onPublishResult: (input: RecordPublishAttemptInput) => Promise<void>;
}

const CONFIRMATION_TEXT = "Publish now";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "LinkedIn publish failed";
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
  onPublishResult,
}: PublishLinkedInDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const confirmationMatches = confirmationText.trim() === CONFIRMATION_TEXT;
  const scheduleJobId = getPublishScheduleJobId(approval);

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!confirmationMatches) return;

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
      const result = await publishLinkedInPost(publishInput).catch(
        async (caught: unknown) => {
          const message = getErrorMessage(caught);
          try {
            await onPublishResult({
              approvalId: approval.id,
              ...(scheduleJobId === undefined ? {} : { scheduleJobId }),
              status: "failed",
              externalPostUrl: "",
              platformPostId: "",
              errorMessage: message,
            });
            toast.error("LinkedIn publish failed", { description: message });
          } catch (recordError) {
            toast.error("LinkedIn publish failed, and local recording failed", {
              description: `${message} Record error: ${getErrorMessage(recordError)}`,
            });
          }
          return null;
        },
      );

      if (result !== null) {
        try {
          await onPublishResult({
            approvalId: approval.id,
            ...(scheduleJobId === undefined ? {} : { scheduleJobId }),
            status: "succeeded",
            externalPostUrl: result.externalPostUrl,
            platformPostId: result.platformPostId,
            errorMessage: "",
          });
          toast.success("Published to LinkedIn", {
            description: result.platformPostId || result.externalPostUrl,
          });
          setConfirmationText("");
        } catch (caught) {
          toast.error("Published to LinkedIn, but local recording failed", {
            description: `${getErrorMessage(caught)} Platform ID: ${result.platformPostId}`,
          });
        }
      }
      setOpen(false);
    } catch (caught) {
      toast.error("LinkedIn publish blocked", {
        description: getErrorMessage(caught),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Send className="size-4" /> Publish via LinkedIn
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Publish to LinkedIn</DialogTitle>
            <DialogDescription>
              This will publish to LinkedIn using the connected account.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-muted/40 max-h-72 overflow-auto rounded-xl border p-4">
            <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
              Exact escaped LinkedIn preview
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-line">
              {commentary}
            </p>
          </div>

          <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border p-3 text-sm">
            Publishing is irreversible. Confirm the account and text before
            sending.
          </div>

          <div className="space-y-2">
            <Label htmlFor={`publish-linkedin-confirm-${approval.id}`}>
              Type “{CONFIRMATION_TEXT}” to confirm
            </Label>
            <Input
              id={`publish-linkedin-confirm-${approval.id}`}
              value={confirmationText}
              autoComplete="off"
              placeholder={CONFIRMATION_TEXT}
              aria-describedby={`publish-linkedin-help-${approval.id}`}
              onChange={(event) => setConfirmationText(event.target.value)}
            />
            <p
              id={`publish-linkedin-help-${approval.id}`}
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
              {submitting ? "Publishing…" : "Publish via LinkedIn"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
