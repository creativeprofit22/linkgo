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
import { useAgentModelDefaults } from "@/hooks/use-agent-model-defaults";
import type { AgentPlaybookKey } from "@/agent/playbooks";
import type { AgentProviderKey } from "@/agent/types";
import type { CandidateWithTarget } from "@/features/candidate-queue/types";
import { DRAFT_PROMPT_ROUTES } from "@/features/drafts/prompt-routing";
import {
  DRAFT_CONTENT_INTENTS,
  type DraftContentIntent,
  type EligibleDraftWorkflowOption,
  type GenerateDraftVariantsInput,
} from "@/features/drafts/types";

interface GenerateDraftDialogProps {
  candidates: CandidateWithTarget[];
  selectedCampaignId: number | null;
  selectedCampaignArchived: boolean;
  eligibleWorkflowOptions: EligibleDraftWorkflowOption[];
  onGenerate: (input: GenerateDraftVariantsInput) => Promise<void>;
  disabled?: boolean;
}

interface GenerateDraftFormState {
  candidateId: string;
  providerKey: AgentProviderKey;
  modelName: string;
  playbookKey: AgentPlaybookKey | "";
  variantCount: string;
  contentIntent: DraftContentIntent;
  workflowRunId: string;
  angle: string;
  voiceNotes: string;
}

const WORKFLOW_STATUS_LABELS: Record<
  EligibleDraftWorkflowOption["status"],
  string
> = {
  running: "In progress",
  blocked: "Waiting on you",
  failed: "Didn't finish",
};

function getCandidateLabel(candidate: CandidateWithTarget): string {
  const author = candidate.target.author_name || "Author not known";
  const excerpt = candidate.target.content.trim().slice(0, 70);
  return excerpt ? `${author} — ${excerpt}` : author;
}

function getDefaultWorkflowSelection(
  candidateId: number,
  workflowOptions: EligibleDraftWorkflowOption[],
): string {
  const matches = workflowOptions.filter(
    (option) => option.candidateId === candidateId,
  );
  if (matches.length === 1) return String(matches[0]?.workflowRunId);
  return matches.length === 0 ? "adhoc" : "";
}

function getInitialFormState(
  candidates: CandidateWithTarget[],
  workflowOptions: EligibleDraftWorkflowOption[],
): GenerateDraftFormState {
  const candidateId = candidates[0]?.id ?? 0;
  return {
    candidateId: candidateId === 0 ? "" : String(candidateId),
    providerKey: "dry_run",
    modelName: DEFAULT_AGENT_MODELS.dry_run,
    playbookKey: "linkedin_writer",
    variantCount: "3",
    contentIntent: "idea",
    workflowRunId:
      candidateId === 0
        ? "adhoc"
        : getDefaultWorkflowSelection(candidateId, workflowOptions),
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
    contentIntent: form.contentIntent,
    workflowRunId:
      form.workflowRunId === "adhoc" ? null : Number(form.workflowRunId),
    angle: form.angle,
    voiceNotes: form.voiceNotes,
  };
}

export function GenerateDraftDialog({
  candidates,
  selectedCampaignId,
  selectedCampaignArchived,
  eligibleWorkflowOptions,
  onGenerate,
  disabled = false,
}: GenerateDraftDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const defaultModelFor = useAgentModelDefaults();
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
    getInitialFormState(candidateOptions, eligibleWorkflowOptions),
  );
  const candidateWorkflowOptions = useMemo(
    () =>
      eligibleWorkflowOptions.filter(
        (option) => option.candidateId === Number(form.candidateId),
      ),
    [eligibleWorkflowOptions, form.candidateId],
  );
  const generateDisabled =
    disabled || selectedCampaignId === null || candidateOptions.length === 0;

  useEffect(() => {
    if (!open) {
      setForm(getInitialFormState(candidateOptions, eligibleWorkflowOptions));
    }
  }, [candidateOptions, eligibleWorkflowOptions, open]);

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
          <Sparkles className="size-4" /> Write with AI
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Write versions with AI</DialogTitle>
            <DialogDescription>
              Nothing is saved until you choose to keep it as a draft. Linkgo
              never posts without your OK.
            </DialogDescription>
          </DialogHeader>

          <Field label="Idea" htmlFor="generate-draft-candidate">
            <select
              id="generate-draft-candidate"
              value={form.candidateId}
              onChange={(event) => {
                const candidateId = Number(event.target.value);
                setForm((current) => ({
                  ...current,
                  candidateId: event.target.value,
                  workflowRunId: getDefaultWorkflowSelection(
                    candidateId,
                    eligibleWorkflowOptions,
                  ),
                }));
              }}
              required
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <option value="" disabled>
                Choose an idea
              </option>
              {candidateOptions.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {getCandidateLabel(candidate)}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="AI service" htmlFor="generate-draft-provider">
              <select
                id="generate-draft-provider"
                value={form.providerKey}
                onChange={(event) => {
                  const providerKey = event.target.value as AgentProviderKey;
                  setForm((current) => ({
                    ...current,
                    providerKey,
                    modelName: defaultModelFor(providerKey),
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
            <Field label="AI model" htmlFor="generate-draft-model">
              <Input
                id="generate-draft-model"
                value={form.modelName}
                onChange={(event) =>
                  updateField("modelName", event.target.value)
                }
                maxLength={120}
              />
            </Field>
            <Field label="Brand voice" htmlFor="generate-draft-playbook">
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
                <option value="">No brand voice</option>
              </select>
            </Field>
            <Field label="Number of versions" htmlFor="generate-draft-count">
              <select
                id="generate-draft-count"
                value={form.variantCount}
                onChange={(event) =>
                  updateField("variantCount", event.target.value)
                }
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {[3, 4, 5].map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Post type</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {DRAFT_CONTENT_INTENTS.map((intent) => {
                const route = DRAFT_PROMPT_ROUTES[intent];
                return (
                  <label
                    key={intent}
                    className="has-checked:border-linkgo-blue has-checked:bg-linkgo-blue/5 flex cursor-pointer gap-3 rounded-lg border p-3"
                  >
                    <input
                      type="radio"
                      name="draft-content-intent"
                      value={intent}
                      checked={form.contentIntent === intent}
                      onChange={() => updateField("contentIntent", intent)}
                      className="mt-1 size-4 shrink-0"
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        {route.label}
                      </span>
                      <span className="text-muted-foreground block text-xs leading-relaxed">
                        {route.guidance}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {candidateWorkflowOptions.length > 0 ? (
            <Field label="Automation" htmlFor="generate-draft-workflow">
              <select
                id="generate-draft-workflow"
                value={form.workflowRunId}
                onChange={(event) =>
                  updateField("workflowRunId", event.target.value)
                }
                required
                aria-describedby="generate-draft-workflow-help"
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {candidateWorkflowOptions.length > 1 ? (
                  <option value="" disabled>
                    Choose an automation or a one-off draft
                  </option>
                ) : null}
                <option value="adhoc">One-off draft — no automation</option>
                {candidateWorkflowOptions.map((option) => (
                  <option
                    key={option.workflowRunId}
                    value={option.workflowRunId}
                  >
                    {option.title} · {WORKFLOW_STATUS_LABELS[option.status]}
                  </option>
                ))}
              </select>
              <p
                id="generate-draft-workflow-help"
                className="text-muted-foreground text-xs"
              >
                The automation waits at the Draft step until you save the AI
                versions.
              </p>
            </Field>
          ) : null}

          <Field label="Angle" htmlFor="generate-draft-angle">
            <Input
              id="generate-draft-angle"
              value={form.angle}
              onChange={(event) => updateField("angle", event.target.value)}
              maxLength={240}
              placeholder="A lesson learned, a how-to, a bold opinion…"
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
            <Button
              type="submit"
              disabled={
                submitting || generateDisabled || form.workflowRunId === ""
              }
            >
              {submitting ? "Writing…" : "Write versions"}
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
