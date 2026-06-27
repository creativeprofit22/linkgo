import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type SyntheticEvent } from "react";
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
import type {
  CommentEligibleCandidate,
  CreateCommentThreadInput,
} from "@/features/comments/types";

interface CreateCommentThreadDialogProps {
  candidates: CommentEligibleCandidate[];
  selectedCampaignId: number | null;
  selectedCampaignArchived: boolean;
  onCreate: (input: CreateCommentThreadInput) => Promise<void>;
  disabled?: boolean;
}

interface CommentFormState {
  candidateId: string;
  operatorNotes: string;
  variants: string[];
}

function getInitialFormState(
  candidates: CommentEligibleCandidate[],
): CommentFormState {
  return {
    candidateId:
      candidates[0] === undefined ? "" : String(candidates[0].candidate_id),
    operatorNotes: "",
    variants: [""],
  };
}

function toInput(form: CommentFormState): CreateCommentThreadInput {
  return {
    candidateId: Number(form.candidateId),
    operatorNotes: form.operatorNotes,
    variants: form.variants.map((body) => ({ body })),
  };
}

function getCandidateLabel(candidate: CommentEligibleCandidate): string {
  const author = candidate.target_author_name || "Unknown author";
  const excerpt = candidate.target_content.trim().slice(0, 70);
  return excerpt ? `${author} — ${excerpt}` : author;
}

export function CreateCommentThreadDialog({
  candidates,
  selectedCampaignId,
  selectedCampaignArchived,
  onCreate,
  disabled = false,
}: CreateCommentThreadDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const candidateOptions = useMemo(
    () =>
      selectedCampaignArchived
        ? []
        : candidates.filter(
            (candidate) =>
              selectedCampaignId === null ||
              candidate.campaign_id === selectedCampaignId,
          ),
    [candidates, selectedCampaignArchived, selectedCampaignId],
  );
  const [form, setForm] = useState<CommentFormState>(() =>
    getInitialFormState(candidateOptions),
  );
  const createDisabled = disabled || candidateOptions.length === 0;
  const archivedReason = selectedCampaignArchived
    ? "Archived campaigns cannot create comments. Restore the campaign before commenting."
    : null;

  useEffect(() => {
    if (!open) setForm(getInitialFormState(candidateOptions));
  }, [candidateOptions, open]);

  async function handleSubmit(
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onCreate(toInput(form));
      setForm(getInitialFormState(candidateOptions));
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  function updateVariant(index: number, value: string): void {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant, variantIndex) =>
        variantIndex === index ? value : variant,
      ),
    }));
  }

  function addVariant(): void {
    setForm((current) => ({
      ...current,
      variants: [...current.variants, ""].slice(0, 3),
    }));
  }

  function removeVariant(index: number): void {
    setForm((current) => ({
      ...current,
      variants: current.variants.filter(
        (_, variantIndex) => variantIndex !== index,
      ),
    }));
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            disabled={createDisabled}
            title={archivedReason ?? undefined}
          >
            <Plus className="size-4" /> Create comment
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="space-y-5"
          >
            <DialogHeader>
              <DialogTitle>Create comment</DialogTitle>
              <DialogDescription>
                Draft one to three local LinkedIn replies. Linkgo audits them,
                but humans approve and manually post them.
              </DialogDescription>
            </DialogHeader>

            <Field label="Candidate target" htmlFor="comment-candidate">
              <select
                id="comment-candidate"
                value={form.candidateId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    candidateId: event.target.value,
                  }))
                }
                required
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <option value="" disabled>
                  Select candidate
                </option>
                {candidateOptions.map((candidate) => (
                  <option
                    key={candidate.candidate_id}
                    value={candidate.candidate_id}
                  >
                    {getCandidateLabel(candidate)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Operator notes" htmlFor="comment-notes">
              <Input
                id="comment-notes"
                value={form.operatorNotes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    operatorNotes: event.target.value,
                  }))
                }
                maxLength={2000}
                placeholder="Manual context for reviewer"
              />
            </Field>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>Reply variants</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={form.variants.length >= 3}
                  onClick={addVariant}
                >
                  <Plus className="size-4" /> Add variant
                </Button>
              </div>
              {form.variants.map((variant, index) => (
                <div key={index} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={`comment-variant-${index}`}>
                      Variant {index + 1}
                    </Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={form.variants.length === 1}
                      onClick={() => removeVariant(index)}
                    >
                      <Trash2 className="size-4" /> Remove
                    </Button>
                  </div>
                  <Textarea
                    id={`comment-variant-${index}`}
                    className="min-h-28"
                    value={variant}
                    maxLength={1250}
                    required
                    onChange={(event) =>
                      updateVariant(index, event.target.value)
                    }
                    placeholder="Add a specific, useful reply."
                  />
                  <p className="text-muted-foreground text-xs">
                    {variant.length}/1,250 characters.
                  </p>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={submitting || createDisabled}>
                {submitting ? "Creating…" : "Create comment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {archivedReason && (
        <p className="text-muted-foreground max-w-xs text-xs">
          {archivedReason}
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
