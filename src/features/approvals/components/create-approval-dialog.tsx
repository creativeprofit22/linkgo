import { CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { ListTruncationNotice } from "@/components/list-truncation-notice";
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
import { composeLinkedInCommentary } from "@/features/approvals/linkedin-format";
import type {
  ApprovalEligibleDraft,
  CreateApprovalInput,
} from "@/features/approvals/types";

interface CreateApprovalDialogProps {
  eligibleDrafts: ApprovalEligibleDraft[];
  /** Uncapped eligible-draft count; above the list length when capped. */
  eligibleDraftTotal: number;
  selectedCampaignId: number | null;
  selectedCampaignArchived: boolean;
  disabled?: boolean;
  onCreate: (input: CreateApprovalInput) => Promise<void>;
}

interface CreateApprovalFormState {
  draftId: string;
  reviewerNotes: string;
}

function getDraftLabel(draft: ApprovalEligibleDraft): string {
  const author = draft.target_author_name || "Author not known";
  const excerpt = draft.target_content.trim().slice(0, 70);
  return excerpt ? `${author} — ${excerpt}` : author;
}

function getInitialFormState(
  eligibleDrafts: ApprovalEligibleDraft[],
): CreateApprovalFormState {
  return {
    draftId:
      eligibleDrafts[0] === undefined ? "" : String(eligibleDrafts[0].id),
    reviewerNotes: "",
  };
}

export function CreateApprovalDialog({
  eligibleDrafts,
  eligibleDraftTotal,
  selectedCampaignId,
  selectedCampaignArchived,
  disabled = false,
  onCreate,
}: CreateApprovalDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const draftOptions = useMemo(
    () =>
      selectedCampaignArchived
        ? []
        : eligibleDrafts.filter(
            (draft) =>
              selectedCampaignId === null ||
              draft.campaign_id === selectedCampaignId,
          ),
    [eligibleDrafts, selectedCampaignArchived, selectedCampaignId],
  );

  const [form, setForm] = useState<CreateApprovalFormState>(() =>
    getInitialFormState(draftOptions),
  );
  const selectedDraft =
    draftOptions.find((draft) => String(draft.id) === form.draftId) ?? null;
  const createDisabled = disabled || draftOptions.length === 0;
  const archivedDisabledReason = selectedCampaignArchived
    ? "This campaign is archived, so you can't send posts for approval. Restore the campaign first."
    : null;

  useEffect(() => {
    if (!open) setForm(getInitialFormState(draftOptions));
  }, [draftOptions, open]);

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onCreate({
        draftId: Number(form.draftId),
        reviewerNotes: form.reviewerNotes,
      });
      setForm(getInitialFormState(draftOptions));
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            disabled={createDisabled}
            aria-describedby={
              archivedDisabledReason
                ? "approval-archived-disabled-reason"
                : undefined
            }
            title={archivedDisabledReason ?? undefined}
          >
            <CheckCircle2 className="size-4" /> Send for approval
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Send for approval</DialogTitle>
              <DialogDescription>
                Send one checked draft version to be approved. Nothing is posted
                to LinkedIn yet.
              </DialogDescription>
            </DialogHeader>

            {!selectedCampaignArchived && (
              <ListTruncationNotice
                shownCount={eligibleDrafts.length}
                totalCount={eligibleDraftTotal}
                noun="ready drafts"
              />
            )}

            <Field label="Ready draft" htmlFor="approval-draft">
              <select
                id="approval-draft"
                value={form.draftId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    draftId: event.target.value,
                  }))
                }
                required
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <option value="" disabled>
                  Choose a ready draft
                </option>
                {draftOptions.map((draft) => (
                  <option key={draft.id} value={draft.id}>
                    {getDraftLabel(draft)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Reviewer notes" htmlFor="approval-notes">
              <Textarea
                id="approval-notes"
                value={form.reviewerNotes}
                maxLength={1000}
                rows={4}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    reviewerNotes: event.target.value,
                  }))
                }
                placeholder="What should you check before approving?"
              />
              <p className="text-muted-foreground text-xs">
                {form.reviewerNotes.length}/1000
              </p>
            </Field>

            {selectedDraft && (
              <div className="bg-muted/30 space-y-2 rounded-xl border p-4">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Chosen version preview
                </p>
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {composeLinkedInCommentary(selectedDraft.variant)}
                </p>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !form.draftId}>
                {submitting ? "Sending…" : "Send for approval"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {archivedDisabledReason && (
        <p
          id="approval-archived-disabled-reason"
          className="text-muted-foreground max-w-72 text-right text-xs"
        >
          {archivedDisabledReason}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
