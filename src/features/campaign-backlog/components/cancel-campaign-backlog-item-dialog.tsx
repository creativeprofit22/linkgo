import { Ban } from "lucide-react";
import { useState } from "react";

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
import type { CampaignBacklogItemDetail } from "@/features/campaign-backlog/types";

interface CancelCampaignBacklogItemDialogProps {
  item: CampaignBacklogItemDetail;
  pending: boolean;
  disabled?: boolean;
  onCancel: (id: number) => Promise<unknown>;
}

export function CancelCampaignBacklogItemDialog({
  item,
  pending,
  disabled = false,
  onCancel,
}: CancelCampaignBacklogItemDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (nextOpen: boolean): void => {
    if (pending && !nextOpen) return;
    setOpen(nextOpen);
    if (!nextOpen) setError(null);
  };

  const handleCancel = async (): Promise<void> => {
    if (pending) return;
    setError(null);
    try {
      await onCancel(item.id);
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Item could not be cancelled",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || pending}
        >
          <Ban aria-hidden="true" className="size-4" /> Cancel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancel “{item.title}”?</DialogTitle>
          <DialogDescription>
            Cancellation is final. This item stays in history and cannot be
            edited or reopened.
          </DialogDescription>
        </DialogHeader>
        {item.recurrence === "none" ? (
          <p className="text-sm">No new backlog item will be created.</p>
        ) : (
          <p className="rounded-lg border p-3 text-sm">
            This also stops the {item.recurrence} recurrence chain. No successor
            will be scheduled.
          </p>
        )}
        {error === null ? null : (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Keep item
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => void handleCancel()}
          >
            {pending ? "Cancelling…" : "Cancel item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
