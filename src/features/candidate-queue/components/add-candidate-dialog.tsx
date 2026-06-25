import { Plus } from "lucide-react";
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
import type { CampaignWithKeywords } from "@/features/campaigns/types";
import type { CreateCandidateInput } from "@/features/candidate-queue/types";

interface AddCandidateDialogProps {
  campaigns: CampaignWithKeywords[];
  selectedCampaignId: number | null;
  onCreate: (input: CreateCandidateInput) => Promise<void>;
  disabled?: boolean;
}

interface CandidateFormState {
  campaignId: string;
  url: string;
  content: string;
  authorName: string;
  authorProfileUrl: string;
  postedAt: string;
  sourceKeyword: string;
  relevanceScore: string;
  scoreReason: string;
  notes: string;
}

function getInitialFormState(campaignId: number | null): CandidateFormState {
  return {
    campaignId: campaignId === null ? "" : String(campaignId),
    url: "",
    content: "",
    authorName: "",
    authorProfileUrl: "",
    postedAt: "",
    sourceKeyword: "",
    relevanceScore: "",
    scoreReason: "",
    notes: "",
  };
}

function toCandidateInput(form: CandidateFormState): CreateCandidateInput {
  return {
    campaignId: Number(form.campaignId),
    url: form.url,
    content: form.content,
    authorName: form.authorName,
    authorProfileUrl: form.authorProfileUrl,
    postedAt: form.postedAt.trim() || null,
    sourceKeyword: form.sourceKeyword,
    relevanceScore: form.relevanceScore.trim()
      ? Number(form.relevanceScore)
      : null,
    scoreReason: form.scoreReason,
    notes: form.notes,
  };
}

export function AddCandidateDialog({
  campaigns,
  selectedCampaignId,
  onCreate,
  disabled = false,
}: AddCandidateDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<CandidateFormState>(() =>
    getInitialFormState(selectedCampaignId),
  );

  useEffect(() => {
    if (!open) setForm(getInitialFormState(selectedCampaignId));
  }, [open, selectedCampaignId]);

  const campaignOptions = useMemo(
    () => campaigns.filter((campaign) => campaign.status !== "archived"),
    [campaigns],
  );

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onCreate(toCandidateInput(form));
      setForm(getInitialFormState(selectedCampaignId));
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = <K extends keyof CandidateFormState>(
    key: K,
    value: CandidateFormState[K],
  ): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          disabled={disabled || campaignOptions.length === 0}
        >
          <Plus className="size-4" /> Add candidate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Add candidate</DialogTitle>
            <DialogDescription>
              Manually capture a LinkedIn post for local triage. Scoring and
              publishing stay gated for later slices.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Campaign" htmlFor="candidate-campaign">
              <select
                id="candidate-campaign"
                value={form.campaignId}
                onChange={(event) =>
                  updateField("campaignId", event.target.value)
                }
                required
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <option value="" disabled>
                  Select campaign
                </option>
                {campaignOptions.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Source keyword" htmlFor="candidate-source-keyword">
              <Input
                id="candidate-source-keyword"
                value={form.sourceKeyword}
                onChange={(event) =>
                  updateField("sourceKeyword", event.target.value)
                }
                maxLength={80}
                placeholder="founder content"
              />
            </Field>
            <Field
              label="LinkedIn post URL"
              htmlFor="candidate-url"
              className="sm:col-span-2"
            >
              <Input
                id="candidate-url"
                value={form.url}
                onChange={(event) => updateField("url", event.target.value)}
                required
                maxLength={1000}
                placeholder="https://www.linkedin.com/posts/..."
              />
            </Field>
            <Field
              label="Post text"
              htmlFor="candidate-content"
              className="sm:col-span-2"
            >
              <Textarea
                id="candidate-content"
                value={form.content}
                onChange={(event) => updateField("content", event.target.value)}
                required
                maxLength={3000}
                rows={5}
                placeholder="Paste the post text or a useful excerpt."
              />
            </Field>
            <Field label="Author name" htmlFor="candidate-author-name">
              <Input
                id="candidate-author-name"
                value={form.authorName}
                onChange={(event) =>
                  updateField("authorName", event.target.value)
                }
                maxLength={160}
                placeholder="Jane Doe"
              />
            </Field>
            <Field
              label="Author profile URL"
              htmlFor="candidate-author-profile"
            >
              <Input
                id="candidate-author-profile"
                value={form.authorProfileUrl}
                onChange={(event) =>
                  updateField("authorProfileUrl", event.target.value)
                }
                maxLength={1000}
                placeholder="https://www.linkedin.com/in/..."
              />
            </Field>
            <Field label="Posted at" htmlFor="candidate-posted-at">
              <Input
                id="candidate-posted-at"
                value={form.postedAt}
                onChange={(event) =>
                  updateField("postedAt", event.target.value)
                }
                maxLength={80}
                placeholder="2026-06-25 or 2h ago"
              />
            </Field>
            <Field label="Relevance score" htmlFor="candidate-score">
              <Input
                id="candidate-score"
                type="number"
                min={0}
                max={100}
                value={form.relevanceScore}
                onChange={(event) =>
                  updateField("relevanceScore", event.target.value)
                }
                placeholder="0-100"
              />
            </Field>
            <Field
              label="Score reason"
              htmlFor="candidate-score-reason"
              className="sm:col-span-2"
            >
              <Textarea
                id="candidate-score-reason"
                value={form.scoreReason}
                onChange={(event) =>
                  updateField("scoreReason", event.target.value)
                }
                maxLength={500}
                placeholder="Why this looks relevant"
              />
            </Field>
            <Field
              label="Notes"
              htmlFor="candidate-notes"
              className="sm:col-span-2"
            >
              <Textarea
                id="candidate-notes"
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                maxLength={1000}
                placeholder="Operator notes"
              />
            </Field>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !form.campaignId}>
              {submitting ? "Adding…" : "Add candidate"}
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
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
