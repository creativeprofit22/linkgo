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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RECONCILE_CONFIRMATION } from "@/features/publish-reconciliation/schemas";
import type {
  OpenPublishExecution,
  ReconcilePublishExecutionInput,
  ReconcileResolution,
} from "@/features/publish-reconciliation/types";

interface ReconcileExecutionDialogProps {
  execution: OpenPublishExecution;
  disabled: boolean;
  onReconcile: (input: ReconcilePublishExecutionInput) => Promise<void>;
}

const RESOLUTION_OPTIONS: {
  value: ReconcileResolution;
  label: string;
  help: string;
}[] = [
  {
    value: "posted",
    label: "Posted on LinkedIn",
    help: "I found it on LinkedIn. Mark it as posted and add its link.",
  },
  {
    value: "not_posted",
    label: "Not posted",
    help: "I checked LinkedIn and it isn't there. Let me post it again.",
  },
];

export function ReconcileExecutionDialog({
  execution,
  disabled,
  onReconcile,
}: ReconcileExecutionDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState<ReconcileResolution | null>(
    null,
  );
  const [externalUrl, setExternalUrl] = useState("");
  const [note, setNote] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const idPrefix = `reconcile-execution-${execution.id}`;
  const itemLabel = execution.kind === "post" ? "post" : "comment";
  const urlMissing = resolution === "posted" && externalUrl.trim() === "";
  const confirmationMatches = confirmation === RECONCILE_CONFIRMATION;
  const canSubmit =
    resolution !== null && !urlMissing && confirmationMatches && !submitting;

  const reset = (): void => {
    setResolution(null);
    setExternalUrl("");
    setNote("");
    setConfirmation("");
  };

  const handleOpenChange = (nextOpen: boolean): void => {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  };

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!canSubmit || resolution === null) return;

    setSubmitting(true);
    const trimmedNote = note.trim();
    try {
      await onReconcile({
        executionId: execution.id,
        fence: execution.fence,
        resolution,
        ...(resolution === "posted" ? { externalUrl: externalUrl.trim() } : {}),
        ...(trimmedNote === "" ? {} : { note: trimmedNote }),
        confirmation,
      });
      handleOpenChange(false);
    } catch {
      // The hook reports the error; keep the dialog open for correction.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={disabled}>
          Check what happened
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Confirm what happened to this {itemLabel}</DialogTitle>
            <DialogDescription>
              Look on LinkedIn for this {itemLabel} from{" "}
              {execution.campaignName || "a campaign we don't know"}, then tell
              us what really happened.
            </DialogDescription>
          </DialogHeader>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">What did you find?</legend>
            {RESOLUTION_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="has-checked:border-linkgo-blue has-checked:bg-linkgo-blue/5 flex cursor-pointer gap-3 rounded-lg border p-3"
              >
                <input
                  type="radio"
                  name={`${idPrefix}-resolution`}
                  value={option.value}
                  checked={resolution === option.value}
                  onChange={() => setResolution(option.value)}
                  className="mt-1 size-4 shrink-0"
                />
                <span>
                  <span className="block text-sm font-medium">
                    {option.label}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {option.help}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border p-3 text-sm">
            If you choose “Not posted” but the {itemLabel} is really on
            LinkedIn, it could be posted twice. Only choose it after you check
            LinkedIn.
          </div>

          {resolution === "posted" && (
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-url`}>LinkedIn link</Label>
              <Input
                id={`${idPrefix}-url`}
                value={externalUrl}
                autoComplete="off"
                placeholder="https://www.linkedin.com/feed/update/urn:li:..."
                required
                aria-invalid={urlMissing}
                onChange={(event) => setExternalUrl(event.target.value)}
              />
              {urlMissing && (
                <p className="text-muted-foreground text-xs">
                  Add the link to mark it as posted.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-note`}>Note (optional)</Label>
            <Textarea
              id={`${idPrefix}-note`}
              value={note}
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-confirm`}>
              Type “{RECONCILE_CONFIRMATION}” to confirm
            </Label>
            <Input
              id={`${idPrefix}-confirm`}
              value={confirmation}
              autoComplete="off"
              placeholder={RECONCILE_CONFIRMATION}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? "Saving…" : "Confirm result"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
