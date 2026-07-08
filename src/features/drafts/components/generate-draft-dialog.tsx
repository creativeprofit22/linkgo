import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState, type SyntheticEvent } from "react";
import {
  AGENT_PROVIDER_KEYS,
  DEFAULT_AGENT_MODELS,
  PROVIDER_LABELS,
} from "@/agent";
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
import type { AgentPlaybookKey } from "@/agent/playbooks";
import type { AgentProviderKey } from "@/agent/types";
import type { CandidateWithTarget } from "@/features/candidate-queue/types";
import type { GenerateDraftVariantsInput } from "@/features/drafts/types";

interface GenerateDraftDialogProps {
  candidates: CandidateWithTarget[];
  selectedCampaignId: number | null;
  selectedCampaignArchived: boolean;
  onGenerate: (input: GenerateDraftVariantsInput) => Promise<void>;
  disabled?: boolean;
}

interface GenerateDraftFormState {
  candidateId: string;
  providerKey: AgentProviderKey;
  modelName: string;
  playbookKey: AgentPlaybookKey | "";
  variantCount: string;
  angle: string;
  voiceNotes: string;
}

function getCandidateLabel(candidate: CandidateWithTarget): string {
  const author = candidate.target.author_name || "Unknown author";
  const excerpt = candidate.target.content.trim().slice(0, 70);
  return excerpt ? `${author} — ${excerpt}` : author;
}

function getInitialFormState(
  candidates: CandidateWithTarget[],
): GenerateDraftFormState {
  return {
    candidateId: candidates[0] === undefined ? "" : String(candidates[0].id),
    providerKey: "dry_run",
    modelName: DEFAULT_AGENT_MODELS.dry_run,
    playbookKey: "linkedin_writer",
    variantCount: "3",
    angle: "",
    voiceNotes: "",
  };
}

function toGenerateInput(
  form: GenerateDraftFormState,
  campaignId: number | null,
): GenerateDraftVariantsInput {
  return {
    campaignId: Number(campaignId),
    candidateId: Number(form.candidateId),
    providerKey: form.providerKey,
    modelName: form.modelName,
    playbookKey: form.playbookKey,
    variantCount: Number(form.variantCount),
    angle: form.angle,
    voiceNotes: form.voiceNotes,
  };
}

export function GenerateDraftDialog({
  candidates,
  selectedCampaignId,
  selectedCampaignArchived,
  onGenerate,
  disabled = false,
}: GenerateDraftDialogProps): React.ReactNode {
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
  const [form, setForm] = useState<GenerateDraftFormState>(() =>
    getInitialFormState(candidateOptions),
  );
  const generateDisabled =
    disabled || selectedCampaignId === null || candidateOptions.length === 0;

  useEffect(() => {
    if (!open) setForm(getInitialFormState(candidateOptions));
  }, [candidateOptions, open]);

  async function handleSubmit(
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onGenerate(toGenerateInput(form, selectedCampaignId));
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  function updateField<K extends keyof GenerateDraftFormState>(
    field: K,
    value: GenerateDraftFormState[K],
  ): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" disabled={generateDisabled}>
          <Sparkles className="size-4" /> Generate variants
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Generate draft variants</DialogTitle>
            <DialogDescription>
              Generated text is local until you save it as a draft. Publishing
              still requires approval.
            </DialogDescription>
          </DialogHeader>

          <Field label="Candidate" htmlFor="generate-draft-candidate">
            <select
              id="generate-draft-candidate"
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
            <Field label="Provider" htmlFor="generate-draft-provider">
              <select
                id="generate-draft-provider"
                value={form.providerKey}
                onChange={(event) => {
                  const providerKey = event.target.value as AgentProviderKey;
                  setForm((current) => ({
                    ...current,
                    providerKey,
                    modelName: DEFAULT_AGENT_MODELS[providerKey],
                  }));
                }}
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {AGENT_PROVIDER_KEYS.map((providerKey) => (
                  <option key={providerKey} value={providerKey}>
                    {PROVIDER_LABELS[providerKey]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Model" htmlFor="generate-draft-model">
              <Input
                id="generate-draft-model"
                value={form.modelName}
                onChange={(event) =>
                  updateField("modelName", event.target.value)
                }
                maxLength={120}
              />
            </Field>
            <Field label="Playbook" htmlFor="generate-draft-playbook">
              <select
                id="generate-draft-playbook"
                value={form.playbookKey}
                onChange={(event) =>
                  updateField(
                    "playbookKey",
                    event.target.value as AgentPlaybookKey | "",
                  )
                }
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <option value="linkedin_writer">LinkedIn Writer</option>
                <option value="">No playbook</option>
              </select>
            </Field>
            <Field label="Variants" htmlFor="generate-draft-count">
              <select
                id="generate-draft-count"
                value={form.variantCount}
                onChange={(event) =>
                  updateField("variantCount", event.target.value)
                }
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {[1, 2, 3, 4, 5].map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Angle" htmlFor="generate-draft-angle">
            <Input
              id="generate-draft-angle"
              value={form.angle}
              onChange={(event) => updateField("angle", event.target.value)}
              maxLength={240}
              placeholder="Operator lesson, teardown, contrarian take…"
            />
          </Field>
          <Field label="Voice notes" htmlFor="generate-draft-voice-notes">
            <Textarea
              id="generate-draft-voice-notes"
              value={form.voiceNotes}
              onChange={(event) =>
                updateField("voiceNotes", event.target.value)
              }
              maxLength={1000}
              placeholder="Tone, proof points, words to avoid…"
            />
          </Field>

          <DialogFooter>
            <Button type="submit" disabled={submitting || generateDisabled}>
              {submitting ? "Generating…" : "Generate variants"}
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
