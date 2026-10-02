import { FlaskConical, Sparkles } from "lucide-react";
import { useMemo, useState, type SyntheticEvent } from "react";
import { z } from "zod";
import { AGENT_PROVIDER_KEYS, PROVIDER_LABELS } from "@/agent";
import { DisabledReason } from "@/components/disabled-reason";
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
import { useAgentAccounts } from "@/hooks/use-agent-model-defaults";
import { useSessionFormState } from "@/hooks/use-session-form-state";
import type { AgentProviderKey } from "@/agent/types";
import { campaignsRoute } from "@/features/campaigns/schemas";
import { candidateQueueRoute } from "@/features/candidate-queue/schemas";
import type { CandidateWithTarget } from "@/features/candidate-queue/types";
import { integrationsRoute } from "@/features/integrations/schemas";
import { DRAFT_PROMPT_ROUTES } from "@/features/drafts/prompt-routing";
import {
  DRAFT_CONTENT_INTENTS,
  type EligibleDraftWorkflowOption,
  type GenerateDraftVariantsInput,
} from "@/features/drafts/types";
import { formatRouteHash } from "@/lib/navigation/route-contract";

interface GenerateDraftDialogProps {
  candidates: CandidateWithTarget[];
  selectedCampaignId: number | null;
  selectedCampaignArchived: boolean;
  /** False when no campaign exists yet. */
  hasCampaigns: boolean;
  eligibleWorkflowOptions: EligibleDraftWorkflowOption[];
  onGenerate: (input: GenerateDraftVariantsInput) => Promise<void>;
  /** Controlled open state, used when a link opens the dialog. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Idea chosen by a link. Shown read-only (no idea dropdown) while it is
   * eligible; ignored otherwise.
   */
  lockedCandidateId?: number | null;
}

/**
 * Remembered per idea in sessionStorage until the versions are written.
 * `null` provider/model/workflow mean "use the current default", so a newly
 * connected AI account still becomes the default.
 */
const generateDraftFormSchema = z.object({
  providerKey: z.enum(AGENT_PROVIDER_KEYS).nullable(),
  modelName: z.string().max(120).nullable(),
  playbookKey: z.enum(["linkedin_writer", ""]),
  variantCount: z.enum(["3", "4", "5"]),
  contentIntent: z.enum(DRAFT_CONTENT_INTENTS),
  workflowRunId: z.string().max(40).nullable(),
  angle: z.string().max(240),
  voiceNotes: z.string().max(1000),
});

type GenerateDraftFormState = z.infer<typeof generateDraftFormSchema>;

function getInitialFormState(): GenerateDraftFormState {
  return {
    providerKey: null,
    modelName: null,
    playbookKey: "linkedin_writer",
    variantCount: "3",
    contentIntent: "idea",
    workflowRunId: null,
    angle: "",
    voiceNotes: "",
  };
}

const WORKFLOW_STATUS_LABELS: Record<
  EligibleDraftWorkflowOption["status"],
  string
> = {
  running: "In progress",
  blocked: "Waiting on you",
  failed: "Didn't finish",
};

const SELECT_CLASS =
  "border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

const DISABLED_REASON_ID = "generate-draft-disabled-reason";

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

function isWorkflowSelectionEligible(
  selection: string | null,
  candidateWorkflowOptions: EligibleDraftWorkflowOption[],
): selection is string {
  if (selection === null) return false;
  if (selection === "adhoc") return true;
  if (selection === "") return candidateWorkflowOptions.length > 1;
  return candidateWorkflowOptions.some(
    (option) => String(option.workflowRunId) === selection,
  );
}

/** Ideas that can still get a first draft in the selected campaign. */
export function getWritableCandidates(
  candidates: CandidateWithTarget[],
  selectedCampaignId: number | null,
  selectedCampaignArchived: boolean,
): CandidateWithTarget[] {
  if (selectedCampaignArchived) return [];
  return candidates.filter(
    (candidate) =>
      candidate.status !== "rejected" &&
      candidate.status !== "drafted" &&
      (selectedCampaignId === null ||
        candidate.campaign_id === selectedCampaignId),
  );
}

function getDisabledReason(input: {
  hasCampaigns: boolean;
  selectedCampaignId: number | null;
  selectedCampaignArchived: boolean;
  writableCount: number;
}): { reason: string; fix: { href: string; label: string } } | null {
  if (!input.hasCampaigns || input.selectedCampaignId === null)
    return {
      reason: "Create a campaign first.",
      fix: { href: formatRouteHash(campaignsRoute), label: "Go to Campaigns" },
    };
  if (input.selectedCampaignArchived)
    return {
      reason: "This campaign is archived. Restore it to write posts.",
      fix: { href: formatRouteHash(campaignsRoute), label: "Go to Campaigns" },
    };
  if (input.writableCount === 0)
    return {
      reason: "No ideas left to write. Add or keep an idea first.",
      fix: { href: formatRouteHash(candidateQueueRoute), label: "Go to Ideas" },
    };
  return null;
}

export function GenerateDraftDialog({
  candidates,
  selectedCampaignId,
  selectedCampaignArchived,
  hasCampaigns,
  eligibleWorkflowOptions,
  onGenerate,
  open: controlledOpen,
  onOpenChange,
  lockedCandidateId = null,
}: GenerateDraftDialogProps): React.ReactNode {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean): void => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [submitting, setSubmitting] = useState(false);
  const ai = useAgentAccounts();
  const candidateOptions = useMemo(
    () =>
      getWritableCandidates(
        candidates,
        selectedCampaignId,
        selectedCampaignArchived,
      ),
    [candidates, selectedCampaignArchived, selectedCampaignId],
  );
  const lockedCandidate =
    lockedCandidateId === null
      ? null
      : (candidateOptions.find(
          (candidate) => candidate.id === lockedCandidateId,
        ) ?? null);
  // A stale pick (idea drafted or gone) falls back to the first writable idea.
  const [pickedCandidateId, setPickedCandidateId] = useState("");
  const selectedCandidate =
    lockedCandidate ??
    candidateOptions.find(
      (candidate) => String(candidate.id) === pickedCandidateId,
    ) ??
    candidateOptions[0] ??
    null;
  const candidateId = selectedCandidate?.id ?? null;

  const {
    value: form,
    setValue: setForm,
    clear: clearForm,
  } = useSessionFormState(
    candidateId === null ? null : `write.${candidateId}`,
    generateDraftFormSchema,
    getInitialFormState,
  );

  const providerKey: AgentProviderKey = form.providerKey ?? ai.defaultProvider;
  const modelName = form.modelName ?? ai.defaultModelFor(providerKey);
  const candidateWorkflowOptions = eligibleWorkflowOptions.filter(
    (option) => option.candidateId === candidateId,
  );
  // A remembered automation that finished or was cancelled since is dropped,
  // so the form never sends a run the native side will reject.
  const rememberedWorkflowRunId = isWorkflowSelectionEligible(
    form.workflowRunId,
    candidateWorkflowOptions,
  )
    ? form.workflowRunId
    : null;
  const workflowRunId =
    rememberedWorkflowRunId ??
    (candidateId === null
      ? "adhoc"
      : getDefaultWorkflowSelection(candidateId, eligibleWorkflowOptions));
  const disabledReason = getDisabledReason({
    hasCampaigns,
    selectedCampaignId,
    selectedCampaignArchived,
    writableCount: candidateOptions.length,
  });
  const isPractice = providerKey === "dry_run";

  async function handleSubmit(
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (candidateId === null) return;
    setSubmitting(true);
    try {
      await onGenerate({
        campaignId: Number(selectedCampaignId),
        candidateId,
        providerKey,
        modelName,
        playbookKey: form.playbookKey,
        variantCount: Number(form.variantCount),
        contentIntent: form.contentIntent,
        workflowRunId: workflowRunId === "adhoc" ? null : Number(workflowRunId),
        angle: form.angle,
        voiceNotes: form.voiceNotes,
      });
      clearForm();
      setPickedCandidateId("");
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
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            disabled={disabledReason !== null}
            aria-describedby={disabledReason ? DISABLED_REASON_ID : undefined}
          >
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

            {lockedCandidate ? (
              <dl className="space-y-2">
                <dt className="text-sm font-medium">Idea</dt>
                <dd
                  data-testid="generate-draft-locked-idea"
                  className="bg-muted/30 rounded-md border px-3 py-2 text-sm"
                >
                  {getCandidateLabel(lockedCandidate)}
                </dd>
              </dl>
            ) : (
              <Field label="Idea" htmlFor="generate-draft-candidate">
                <select
                  id="generate-draft-candidate"
                  value={candidateId === null ? "" : String(candidateId)}
                  onChange={(event) => setPickedCandidateId(event.target.value)}
                  required
                  className={SELECT_CLASS}
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
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="AI service" htmlFor="generate-draft-provider">
                <select
                  id="generate-draft-provider"
                  value={providerKey}
                  onChange={(event) => {
                    const next = generateDraftFormSchema.shape.providerKey
                      .unwrap()
                      .parse(event.target.value);
                    setForm((current) => ({
                      ...current,
                      providerKey: next,
                      modelName: null,
                    }));
                  }}
                  className={SELECT_CLASS}
                >
                  {AGENT_PROVIDER_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {PROVIDER_LABELS[key]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="AI model" htmlFor="generate-draft-model">
                <Input
                  id="generate-draft-model"
                  value={modelName}
                  onChange={(event) =>
                    updateField("modelName", event.target.value)
                  }
                  maxLength={120}
                />
              </Field>
            </div>

            {isPractice && (
              <div
                role="note"
                data-testid="generate-draft-practice-notice"
                className="bg-muted/40 flex gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <FlaskConical
                  aria-hidden="true"
                  className="text-muted-foreground mt-0.5 size-4 shrink-0"
                />
                <p>
                  <span className="font-medium">Practice mode</span> — no AI
                  used. Versions are sample text.
                  {ai.loaded && !ai.hasConnectedAi && (
                    <>
                      {" "}
                      <a
                        href={formatRouteHash(integrationsRoute)}
                        className="text-primary focus-visible:ring-ring -my-2 inline-flex min-h-8 items-center rounded-sm px-1 font-medium underline underline-offset-4 outline-none hover:no-underline focus-visible:ring-2"
                      >
                        Connect an AI account
                      </a>
                    </>
                  )}
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Brand voice" htmlFor="generate-draft-playbook">
                <select
                  id="generate-draft-playbook"
                  value={form.playbookKey}
                  onChange={(event) =>
                    updateField(
                      "playbookKey",
                      event.target.value === "" ? "" : "linkedin_writer",
                    )
                  }
                  className={SELECT_CLASS}
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
                    updateField(
                      "variantCount",
                      generateDraftFormSchema.shape.variantCount.parse(
                        event.target.value,
                      ),
                    )
                  }
                  className={SELECT_CLASS}
                >
                  {(["3", "4", "5"] as const).map((count) => (
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
                  value={workflowRunId}
                  onChange={(event) =>
                    updateField("workflowRunId", event.target.value)
                  }
                  required
                  aria-describedby="generate-draft-workflow-help"
                  className={SELECT_CLASS}
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
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  submitting ||
                  disabledReason !== null ||
                  candidateId === null ||
                  workflowRunId === "" ||
                  !ai.loaded
                }
              >
                {submitting ? "Writing…" : "Write versions"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {disabledReason && (
        <DisabledReason
          id={DISABLED_REASON_ID}
          reason={disabledReason.reason}
          fix={disabledReason.fix}
          className="sm:text-right"
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
