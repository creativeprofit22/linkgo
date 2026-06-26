import { Brain } from "lucide-react";
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
import type {
  CreateCampaignMemoryInput,
  MemorySignal,
} from "@/features/metrics/types";

interface MemoryFormState {
  signal: MemorySignal;
  summary: string;
  evidence: string;
  confidence: string;
}

interface CreateMemoryDialogProps {
  campaignId: number;
  postMetricId?: number;
  triggerLabel?: string;
  initialSummary?: string;
  initialEvidence?: string;
  onCreate: (input: CreateCampaignMemoryInput) => Promise<void>;
}

function getInitialFormState(
  initialSummary: string,
  initialEvidence: string,
): MemoryFormState {
  return {
    signal: "insight",
    summary: initialSummary,
    evidence: initialEvidence,
    confidence: "50",
  };
}

function getValidationMessage(form: MemoryFormState): string {
  const confidence = Number(form.confidence);
  if (form.summary.trim() === "") return "Summary is required";
  if (!Number.isInteger(confidence) || confidence < 0 || confidence > 100) {
    return "Confidence must be 0 through 100";
  }
  return "";
}

export function CreateMemoryDialog({
  campaignId,
  postMetricId,
  triggerLabel = "Save memory",
  initialSummary = "",
  initialEvidence = "",
  onCreate,
}: CreateMemoryDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<MemoryFormState>(() =>
    getInitialFormState(initialSummary, initialEvidence),
  );
  const validationMessage = getValidationMessage(form);

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (validationMessage !== "") return;
    setSubmitting(true);
    try {
      const input: CreateCampaignMemoryInput = {
        campaignId,
        signal: form.signal,
        summary: form.summary,
        evidence: form.evidence,
        confidence: Number(form.confidence),
      };
      if (postMetricId !== undefined) input.postMetricId = postMetricId;
      await onCreate(input);
      setForm(getInitialFormState(initialSummary, initialEvidence));
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Brain className="size-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Save campaign memory</DialogTitle>
            <DialogDescription>
              Store a human-approved learning note locally. This does not run AI
              analysis.
            </DialogDescription>
          </DialogHeader>

          <Field label="Signal" htmlFor="memory-signal">
            <select
              id="memory-signal"
              value={form.signal}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  signal: event.target.value as MemorySignal,
                }))
              }
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <option value="winner">winner</option>
              <option value="underperformer">underperformer</option>
              <option value="insight">insight</option>
              <option value="avoid">avoid</option>
            </select>
          </Field>

          <Field label="Summary" htmlFor="memory-summary" required>
            <Textarea
              id="memory-summary"
              value={form.summary}
              rows={3}
              maxLength={500}
              required
              aria-describedby="memory-validation"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  summary: event.target.value,
                }))
              }
            />
          </Field>

          <Field label="Evidence" htmlFor="memory-evidence">
            <Textarea
              id="memory-evidence"
              value={form.evidence}
              rows={4}
              maxLength={1000}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  evidence: event.target.value,
                }))
              }
            />
          </Field>

          <Field label="Confidence" htmlFor="memory-confidence" required>
            <Input
              id="memory-confidence"
              type="number"
              min={0}
              max={100}
              value={form.confidence}
              required
              aria-describedby="memory-validation"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  confidence: event.target.value,
                }))
              }
            />
          </Field>

          {validationMessage !== "" ? (
            <p id="memory-validation" className="text-destructive text-sm">
              {validationMessage}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || validationMessage !== ""}
            >
              {submitting ? "Saving…" : "Save memory"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  required = false,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}
