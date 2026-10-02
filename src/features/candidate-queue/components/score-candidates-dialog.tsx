import { Gauge } from "lucide-react";
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
import { useAgentModelDefaults } from "@/hooks/use-agent-model-defaults";
import {
  AGENT_PROVIDER_KEYS,
  DEFAULT_AGENT_MODELS,
  PROVIDER_LABELS,
  type AgentProviderKey,
} from "@/agent/provider-catalog";
import type {
  CandidateWithTarget,
  ScoreCandidatesInput,
} from "@/features/candidate-queue/types";

interface ScoreCandidatesDialogProps {
  campaignId: number | null;
  candidates: CandidateWithTarget[];
  onScore: (input: ScoreCandidatesInput) => Promise<void>;
  disabled?: boolean;
}

interface ScoreFormState {
  minimumScore: string;
  providerKey: AgentProviderKey;
  modelName: string;
  autoRejectBelowMinimum: boolean;
}

function getInitialFormState(): ScoreFormState {
  return {
    minimumScore: "60",
    providerKey: "dry_run",
    modelName: DEFAULT_AGENT_MODELS.dry_run,
    autoRejectBelowMinimum: false,
  };
}

export function ScoreCandidatesDialog({
  campaignId,
  candidates,
  onScore,
  disabled = false,
}: ScoreCandidatesDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ScoreFormState>(() => getInitialFormState());
  const defaultModelFor = useAgentModelDefaults();
  const scorableCandidates = candidates.filter(
    (candidate) =>
      candidate.status === "new" && candidate.relevance_score === null,
  );

  const updateProvider = (providerKey: AgentProviderKey): void => {
    setForm((current) => ({
      ...current,
      providerKey,
      modelName: defaultModelFor(providerKey),
    }));
  };

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (campaignId === null) return;
    setSubmitting(true);
    try {
      await onScore({
        campaignId,
        candidatePostIds: scorableCandidates.map((candidate) => candidate.id),
        minimumScore: Number(form.minimumScore),
        providerKey: form.providerKey,
        modelName: form.modelName,
        autoRejectBelowMinimum: form.autoRejectBelowMinimum,
      });
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || campaignId === null}
        >
          <Gauge className="size-4" /> Score ideas
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Score ideas</DialogTitle>
            <DialogDescription>
              Score {scorableCandidates.length} new idea
              {scorableCandidates.length === 1 ? "" : "s"} that{" "}
              {scorableCandidates.length === 1 ? "hasn't" : "haven't"} been
              scored. Linkgo only changes their status if you tick the box
              below.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Minimum match" htmlFor="score-minimum">
              <Input
                id="score-minimum"
                type="number"
                min={0}
                max={100}
                value={form.minimumScore}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    minimumScore: event.target.value,
                  }))
                }
                required
              />
            </Field>
            <Field label="AI service" htmlFor="score-provider">
              <select
                id="score-provider"
                value={form.providerKey}
                onChange={(event) =>
                  updateProvider(event.target.value as AgentProviderKey)
                }
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {AGENT_PROVIDER_KEYS.map((providerKey) => (
                  <option key={providerKey} value={providerKey}>
                    {PROVIDER_LABELS[providerKey]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="AI model" htmlFor="score-model">
            <Input
              id="score-model"
              value={form.modelName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  modelName: event.target.value,
                }))
              }
              maxLength={120}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.autoRejectBelowMinimum}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  autoRejectBelowMinimum: event.target.checked,
                }))
              }
            />
            Reject new ideas below the minimum match
          </label>

          <DialogFooter>
            <Button
              type="submit"
              disabled={
                submitting ||
                campaignId === null ||
                scorableCandidates.length === 0
              }
            >
              {submitting ? "Scoring…" : "Score ideas"}
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
