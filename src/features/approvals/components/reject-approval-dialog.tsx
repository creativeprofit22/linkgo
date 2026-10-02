import { useState, type SyntheticEvent } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SetApprovalStatusInput } from "@/features/approvals/types";

const REASON_MAX_LENGTH = 1000;

interface RejectApprovalDialogProps {
  approvalId: number;
  /** Human-readable consequence for linked waiting agent runs. */
  linkedAgentRunConsequence: string;
  onSetStatus: (input: SetApprovalStatusInput) => Promise<void>;
}

/**
 * Human confirmation step for rejecting an approval. The optional reason is
 * stored as reviewer notes and becomes the rejection detail natively (linked
 * agent-run cancellation, safety audit and error-queue item).
 */
export function RejectApprovalDialog({
  approvalId,
  linkedAgentRunConsequence,
  onSetStatus,
}: RejectApprovalDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState("");
  const reasonId = `reject-approval-reason-${approvalId}`;
  const counterId = `${reasonId}-count`;

  const handleOpenChange = (next: boolean): void => {
    if (submitting) return;
    setOpen(next);
    if (!next) setReason("");
  };

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const reviewerNotes = reason.trim();
    setSubmitting(true);
    try {
      // Omit empty notes so existing reviewer notes are kept and the native
      // default rejection detail applies.
      await onSetStatus(
        reviewerNotes === ""
          ? { id: approvalId, status: "rejected" }
          : { id: approvalId, status: "rejected", reviewerNotes },
      );
      setReason("");
      setOpen(false);
    } catch {
      // The approvals hook already reports the failure; keep the dialog open
      // so the reviewer can retry without retyping the reason.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="destructive">
          Reject
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Reject this post?</DialogTitle>
            <DialogDescription>
              {linkedAgentRunConsequence} The draft stays in your history.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor={reasonId}>Reason (optional)</Label>
            <Textarea
              id={reasonId}
              value={reason}
              maxLength={REASON_MAX_LENGTH}
              rows={4}
              aria-describedby={counterId}
              placeholder="Why are you rejecting this post?"
              onChange={(event) => setReason(event.target.value)}
            />
            <p id={counterId} className="text-muted-foreground text-xs">
              {reason.length}/{REASON_MAX_LENGTH}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={submitting}>
              {submitting ? "Rejecting…" : "Reject approval"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
