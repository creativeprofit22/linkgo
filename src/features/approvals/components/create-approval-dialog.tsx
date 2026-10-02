import { CheckCircle2 } from "lucide-react";
import { useMemo, useState, type SyntheticEvent } from "react";
import { z } from "zod";
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
import { DisabledReason } from "@/components/disabled-reason";
import { draftsRoute } from "@/features/drafts/schemas";
import { useSessionFormState } from "@/hooks/use-session-form-state";
import { formatRouteHash } from "@/lib/navigation/route-contract";

interface CreateApprovalDialogProps {
  eligibleDrafts: ApprovalEligibleDraft[];
  /** Uncapped eligible-draft count; above the list length when capped. */
  eligibleDraftTotal: number;
  selectedCampaignId: number | null;
  selectedCampaignArchived: boolean;
  disabled?: boolean;
  /** Resolves with the new approval's id. */
  onCreate: (input: CreateApprovalInput) => Promise<number>;
  /** Runs after a successful send, with the new approval's id. */
  onCreated?: (approvalId: number) => void;
  /** Controlled open state, used when a link opens the dialog. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Draft chosen by a link. Shown read-only (no draft dropdown) while it is
   * eligible; ignored otherwise.
   */
  lockedDraftId?: number | null;
}

const createApprovalNotesSchema = z.object({
  reviewerNotes: z.string().max(1000),
});

type CreateApprovalNotesState = z.infer<typeof createApprovalNotesSchema>;

function getInitialNotesState(): CreateApprovalNotesState {
  return { reviewerNotes: "" };
}

function getDraftLabel(draft: ApprovalEligibleDraft): string {
  const author = draft.target_author_name || "Author not known";
  const excerpt = draft.target_content.trim().slice(0, 70);
  return excerpt ? `${author} — ${excerpt}` : author;
}

export function CreateApprovalDialog({
  eligibleDrafts,
  eligibleDraftTotal,
  selectedCampaignId,
  selectedCampaignArchived,
  disabled = false,
  onCreate,
  onCreated,
  open: controlledOpen,
  onOpenChange,
  lockedDraftId = null,
}: CreateApprovalDialogProps): React.ReactNode {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean): void => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };
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

  // An explicit pick wins while it is still eligible; otherwise the first
  // ready draft is used, so a stale pick never submits a missing draft.
  const [pickedDraftId, setPickedDraftId] = useState("");
  const lockedDraft =
    lockedDraftId === null
      ? null
      : (draftOptions.find((draft) => draft.id === lockedDraftId) ?? null);
  const selectedDraft =
    lockedDraft ??
    draftOptions.find((draft) => String(draft.id) === pickedDraftId) ??
    draftOptions[0] ??
    null;
  const draftId = selectedDraft === null ? "" : String(selectedDraft.id);
  // Notes are remembered per draft until they are sent, so Cancel or Back
  // keeps them.
  const {
    value: notes,
    setValue: setNotes,
    clear: clearNotes,
  } = useSessionFormState(
    selectedDraft === null ? null : `send.${selectedDraft.id}`,
    createApprovalNotesSchema,
    getInitialNotesState,
  );
  const createDisabled = disabled || draftOptions.length === 0;
  const archivedDisabledReason = selectedCampaignArchived
    ? "This campaign is archived, so you can't send posts for approval. Restore the campaign first."
    : null;
  // Shown under the disabled button with a way to fix it.
  const noReadyDraftsReason =
    !archivedDisabledReason &&
    !disabled &&
    selectedCampaignId !== null &&
    draftOptions.length === 0
      ? "No checked drafts to send yet."
      : null;
  const disabledReasonId = archivedDisabledReason
    ? "approval-archived-disabled-reason"
    : noReadyDraftsReason
      ? "approval-no-drafts-disabled-reason"
      : undefined;

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const approvalId = await onCreate({
        draftId: Number(draftId),
        reviewerNotes: notes.reviewerNotes,
      });
      clearNotes();
      setPickedDraftId("");
      setOpen(false);
      onCreated?.(approvalId);
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
            aria-describedby={disabledReasonId}
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

            {lockedDraft !== null ? (
              <dl className="space-y-2">
                <dt className="text-sm font-medium">Ready draft</dt>
                <dd
                  data-testid="approval-locked-draft"
                  className="bg-muted/30 rounded-md border px-3 py-2 text-sm"
                >
                  {getDraftLabel(lockedDraft)}
                </dd>
              </dl>
            ) : (
              <Field label="Ready draft" htmlFor="approval-draft">
                <select
                  id="approval-draft"
                  value={draftId}
                  onChange={(event) => setPickedDraftId(event.target.value)}
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
            )}

            <Field label="Reviewer notes" htmlFor="approval-notes">
              <Textarea
                id="approval-notes"
                value={notes.reviewerNotes}
                maxLength={1000}
                rows={4}
                onChange={(event) =>
                  setNotes({ reviewerNotes: event.target.value })
                }
                placeholder="What should you check before approving?"
              />
              <p className="text-muted-foreground text-xs">
                {notes.reviewerNotes.length}/1000
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
              <Button type="submit" disabled={submitting || !draftId}>
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
      {noReadyDraftsReason && (
        <DisabledReason
          id="approval-no-drafts-disabled-reason"
          reason={noReadyDraftsReason}
          fix={{
            href: formatRouteHash(
              draftsRoute,
              selectedCampaignId === null
                ? {}
                : { campaignId: selectedCampaignId },
            ),
            label: "Go to Drafts",
          }}
          className="text-right"
        />
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
