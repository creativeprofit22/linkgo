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
import type { CandidateWithTarget } from "@/features/candidate-queue/types";
import type { CreateDraftInput } from "@/features/drafts/types";

interface AddDraftDialogProps {
  candidates: CandidateWithTarget[];
  selectedCampaignId: number | null;
  selectedCampaignArchived: boolean;
  onCreate: (input: CreateDraftInput) => Promise<void>;
  disabled?: boolean;
}

interface DraftVariantFormState {
  hook: string;
  body: string;
  cta: string;
  hashtags: string;
}

interface DraftFormState {
  candidateId: string;
  angle: string;
  notes: string;
  variants: DraftVariantFormState[];
}

const emptyVariant: DraftVariantFormState = {
  hook: "",
  body: "",
  cta: "",
  hashtags: "",
};

function getInitialFormState(
  candidates: CandidateWithTarget[],
): DraftFormState {
  return {
    candidateId: candidates[0] === undefined ? "" : String(candidates[0].id),
    angle: "",
    notes: "",
    variants: [{ ...emptyVariant }],
  };
}

function toDraftInput(form: DraftFormState): CreateDraftInput {
  return {
    candidateId: Number(form.candidateId),
    angle: form.angle,
    notes: form.notes,
    variants: form.variants,
  };
}

function getCandidateLabel(candidate: CandidateWithTarget): string {
  const author = candidate.target.author_name || "Unknown author";
  const excerpt = candidate.target.content.trim().slice(0, 60);
  return excerpt ? `${author} — ${excerpt}` : author;
}

export function AddDraftDialog({
  candidates,
  selectedCampaignId,
  selectedCampaignArchived,
  onCreate,
  disabled = false,
}: AddDraftDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const candidateOptions = useMemo(
    () =>
      selectedCampaignArchived
        ? []
        : candidates.filter(
            (candidate) =>
              candidate.status !== "rejected" &&
              candidate.status !== "drafted" &&
              (selectedCampaignId === null ||
                candidate.campaign_id === selectedCampaignId),
          ),
    [candidates, selectedCampaignArchived, selectedCampaignId],
  );

  const [form, setForm] = useState<DraftFormState>(() =>
    getInitialFormState(candidateOptions),
  );
  const createDisabled = disabled || candidateOptions.length === 0;
  const archivedDisabledReason = selectedCampaignArchived
    ? "Archived campaigns cannot create drafts. Restore the campaign before drafting."
    : null;

  useEffect(() => {
    if (!open) setForm(getInitialFormState(candidateOptions));
  }, [candidateOptions, open]);

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onCreate(toDraftInput(form));
      setForm(getInitialFormState(candidateOptions));
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  function updateField(
    field: keyof Omit<DraftFormState, "variants">,
    value: string,
  ): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateVariant(
    index: number,
    field: keyof DraftVariantFormState,
    value: string,
  ): void {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant, variantIndex) =>
        variantIndex === index ? { ...variant, [field]: value } : variant,
      ),
    }));
  }

  function addVariant(): void {
    setForm((current) => ({
      ...current,
      variants: [...current.variants, { ...emptyVariant }].slice(0, 5),
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
            aria-describedby={
              archivedDisabledReason
                ? "draft-archived-disabled-reason"
                : undefined
            }
            title={archivedDisabledReason ?? undefined}
          >
            <Plus className="size-4" /> Create draft
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Create draft</DialogTitle>
              <DialogDescription>
                Add manual LinkedIn variants. Linkgo runs deterministic checks
                only; there is no AI generation or publishing in this slice.
              </DialogDescription>
            </DialogHeader>

            <Field label="Candidate" htmlFor="draft-candidate">
              <select
                id="draft-candidate"
                value={form.candidateId}
                onChange={(event) =>
                  updateField("candidateId", event.target.value)
                }
                required
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <option value="" disabled>
                  Select candidate
                </option>
                {candidateOptions.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {getCandidateLabel(candidate)}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Angle" htmlFor="draft-angle">
                <Input
                  id="draft-angle"
                  value={form.angle}
                  onChange={(event) => updateField("angle", event.target.value)}
                  maxLength={240}
                  placeholder="Contrarian lesson, tactical teardown…"
                />
              </Field>
              <Field label="Notes" htmlFor="draft-notes">
                <Input
                  id="draft-notes"
                  value={form.notes}
                  onChange={(event) => updateField("notes", event.target.value)}
                  maxLength={1000}
                  placeholder="Operator context for review"
                />
              </Field>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-medium">Variants</h3>
                  <p className="text-muted-foreground text-sm">
                    Add one to five manual options.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={form.variants.length >= 5}
                  onClick={addVariant}
                >
                  Add variant
                </Button>
              </div>

              {form.variants.map((variant, index) => (
                <div
                  key={`draft-variant-${index}`}
                  className="bg-muted/30 space-y-3 rounded-xl border p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-medium">Variant {index + 1}</h4>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={form.variants.length === 1}
                      onClick={() => removeVariant(index)}
                    >
                      <Trash2 className="size-4" /> Remove variant
                    </Button>
                  </div>
                  <VariantField
                    id={`draft-variant-${index}-hook`}
                    label="Hook"
                    maxLength={500}
                    value={variant.hook}
                    onChange={(value) => updateVariant(index, "hook", value)}
                  />
                  <VariantField
                    id={`draft-variant-${index}-body`}
                    label="Body"
                    maxLength={3000}
                    rows={5}
                    value={variant.body}
                    onChange={(value) => updateVariant(index, "body", value)}
                  />
                  <VariantField
                    id={`draft-variant-${index}-cta`}
                    label="CTA"
                    maxLength={500}
                    value={variant.cta}
                    onChange={(value) => updateVariant(index, "cta", value)}
                  />
                  <VariantField
                    id={`draft-variant-${index}-hashtags`}
                    label="Hashtags"
                    maxLength={300}
                    value={variant.hashtags}
                    onChange={(value) =>
                      updateVariant(index, "hashtags", value)
                    }
                  />
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !form.candidateId}>
                {submitting ? "Creating…" : "Create draft"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {archivedDisabledReason && (
        <p
          id="draft-archived-disabled-reason"
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

function VariantField({
  id,
  label,
  maxLength,
  rows,
  value,
  onChange,
}: {
  id: string;
  label: string;
  maxLength: number;
  rows?: number;
  value: string;
  onChange: (value: string) => void;
}): React.ReactNode {
  return (
    <Field label={label} htmlFor={id}>
      <Textarea
        id={id}
        value={value}
        maxLength={maxLength}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="text-muted-foreground text-xs">
        {value.length}/{maxLength}
      </p>
    </Field>
  );
}
