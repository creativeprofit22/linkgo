import { Search } from "lucide-react";
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
import {
  AGENT_PROVIDER_KEYS,
  DEFAULT_AGENT_MODELS,
  PROVIDER_LABELS,
  type AgentProviderKey,
} from "@/agent/provider-catalog";
import type { CampaignWithKeywords } from "@/features/campaigns/types";
import type { RunCandidateDiscoveryInput } from "@/features/candidate-queue/types";

interface RunCandidateDiscoveryDialogProps {
  campaign: CampaignWithKeywords | null;
  onRun: (input: RunCandidateDiscoveryInput) => Promise<void>;
  disabled?: boolean;
}

interface DiscoveryFormState {
  seedKeywords: string;
  notes: string;
  providerKey: AgentProviderKey;
  modelName: string;
  playbookKey: "";
}

function getInitialFormState(
  campaign: CampaignWithKeywords | null,
): DiscoveryFormState {
  const seedKeywords =
    campaign?.keywords.map((keyword) => keyword.keyword).join(", ") ?? "";
  return {
    seedKeywords,
    notes: "",
    providerKey: "dry_run",
    modelName: DEFAULT_AGENT_MODELS.dry_run,
    playbookKey: "",
  };
}

const MAX_SEED_KEYWORDS = 25;
const MAX_SEED_KEYWORD_LENGTH = 80;

interface ParsedSeedKeywords {
  keywords: string[];
  error: string | null;
}

function parseSeedKeywords(value: string): ParsedSeedKeywords {
  const keywords = value
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  const longKeyword = keywords.find(
    (keyword) => keyword.length > MAX_SEED_KEYWORD_LENGTH,
  );

  if (longKeyword !== undefined) {
    return {
      keywords: [],
      error: `Seed keywords must be ${MAX_SEED_KEYWORD_LENGTH} characters or fewer. Shorten “${longKeyword.slice(0, 40)}${longKeyword.length > 40 ? "…" : ""}”.`,
    };
  }

  return { keywords: keywords.slice(0, MAX_SEED_KEYWORDS), error: null };
}

export function RunCandidateDiscoveryDialog({
  campaign,
  onRun,
  disabled = false,
}: RunCandidateDiscoveryDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [seedKeywordError, setSeedKeywordError] = useState<string | null>(null);
  const [form, setForm] = useState<DiscoveryFormState>(() =>
    getInitialFormState(campaign),
  );

  useEffect(() => {
    if (!open) {
      setForm(getInitialFormState(campaign));
      setSeedKeywordError(null);
    }
  }, [campaign, open]);

  const providerOptions = useMemo(() => [...AGENT_PROVIDER_KEYS], []);

  const updateProvider = (providerKey: AgentProviderKey): void => {
    setForm((current) => ({
      ...current,
      providerKey,
      modelName: DEFAULT_AGENT_MODELS[providerKey],
    }));
  };

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (campaign === null) return;
    const parsedSeedKeywords = parseSeedKeywords(form.seedKeywords);
    if (parsedSeedKeywords.error !== null) {
      setSeedKeywordError(parsedSeedKeywords.error);
      return;
    }

    setSeedKeywordError(null);
    setSubmitting(true);
    try {
      await onRun({
        campaignId: campaign.id,
        seedKeywords: parsedSeedKeywords.keywords,
        notes: form.notes,
        providerKey: form.providerKey,
        modelName: form.modelName,
        playbookKey: form.playbookKey,
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
          disabled={disabled || campaign === null}
        >
          <Search className="size-4" /> Run discovery
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Run discovery</DialogTitle>
            <DialogDescription>
              Save local keyword, trend, and source-prompt suggestions. This
              does not scrape LinkedIn.
            </DialogDescription>
          </DialogHeader>

          <Field label="Seed keywords" htmlFor="discovery-seeds">
            <Textarea
              id="discovery-seeds"
              value={form.seedKeywords}
              onChange={(event) => {
                setSeedKeywordError(null);
                setForm((current) => ({
                  ...current,
                  seedKeywords: event.target.value,
                }));
              }}
              aria-invalid={seedKeywordError !== null}
              aria-describedby={
                seedKeywordError === null ? undefined : "discovery-seeds-error"
              }
              maxLength={1000}
              rows={3}
              placeholder="founder content, LinkedIn growth"
            />
            {seedKeywordError === null ? null : (
              <p
                id="discovery-seeds-error"
                role="alert"
                className="text-destructive text-sm"
              >
                {seedKeywordError}
              </p>
            )}
          </Field>

          <Field label="Notes" htmlFor="discovery-notes">
            <Textarea
              id="discovery-notes"
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              maxLength={1000}
              rows={4}
              placeholder="What should the researcher prioritize?"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Provider" htmlFor="discovery-provider">
              <select
                id="discovery-provider"
                value={form.providerKey}
                onChange={(event) =>
                  updateProvider(event.target.value as AgentProviderKey)
                }
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {providerOptions.map((providerKey) => (
                  <option key={providerKey} value={providerKey}>
                    {PROVIDER_LABELS[providerKey]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Model" htmlFor="discovery-model">
              <Input
                id="discovery-model"
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
          </div>

          <input type="hidden" value={form.playbookKey} readOnly />

          <DialogFooter>
            <Button type="submit" disabled={submitting || campaign === null}>
              {submitting ? "Running…" : "Run discovery"}
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
