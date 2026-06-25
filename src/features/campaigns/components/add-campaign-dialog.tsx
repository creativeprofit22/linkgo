import { Plus } from "lucide-react";
import { useEffect, useState, type SyntheticEvent } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  CampaignWithKeywords,
  CreateCampaignInput,
  UpdateCampaignInput,
} from "@/features/campaigns/types";

interface AddCampaignDialogProps {
  onCreate: (input: CreateCampaignInput) => Promise<void>;
}

interface EditCampaignDialogProps {
  campaign: CampaignWithKeywords;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (input: UpdateCampaignInput) => Promise<void>;
}

interface CampaignFormState {
  name: string;
  product: string;
  audience: string;
  voice: string;
  tone: string;
  keywords: string;
  autoPilot: boolean;
  dailyPostLimit: number;
  dailyCommentLimit: number;
}

const initialFormState: CampaignFormState = {
  name: "",
  product: "",
  audience: "",
  voice: "",
  tone: "",
  keywords: "",
  autoPilot: false,
  dailyPostLimit: 1,
  dailyCommentLimit: 5,
};

function getCampaignFormState(
  campaign: CampaignWithKeywords,
): CampaignFormState {
  return {
    name: campaign.name,
    product: campaign.product,
    audience: campaign.audience,
    voice: campaign.voice,
    tone: campaign.tone,
    keywords: campaign.keywords.map((keyword) => keyword.keyword).join(", "),
    autoPilot: campaign.auto_pilot === 1,
    dailyPostLimit: campaign.daily_post_limit,
    dailyCommentLimit: campaign.daily_comment_limit,
  };
}

function parseKeywords(value: string): string[] {
  return value
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

export function AddCampaignDialog({
  onCreate,
}: AddCampaignDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<CampaignFormState>(initialFormState);

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onCreate(toCampaignInput(form));
      setForm(initialFormState);
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="size-4" /> New campaign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <CampaignForm
          form={form}
          setForm={setForm}
          title="New campaign"
          description="Create the local campaign context Linkgo will use for queueing and drafts later."
          submitLabel="Create campaign"
          submittingLabel="Creating…"
          submitting={submitting}
          onCancel={() => setOpen(false)}
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

export function EditCampaignDialog({
  campaign,
  open,
  onOpenChange,
  onUpdate,
}: EditCampaignDialogProps): React.ReactNode {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<CampaignFormState>(() =>
    getCampaignFormState(campaign),
  );

  useEffect(() => {
    if (open) setForm(getCampaignFormState(campaign));
  }, [campaign, open]);

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onUpdate({
        id: campaign.id,
        ...toCampaignInput(form),
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <CampaignForm
          form={form}
          setForm={setForm}
          title={`Edit ${campaign.name}`}
          description="Update campaign context used for future queueing, drafts, and approvals."
          submitLabel="Save changes"
          submittingLabel="Saving…"
          submitting={submitting}
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

function toCampaignInput(form: CampaignFormState): CreateCampaignInput {
  return {
    name: form.name,
    product: form.product,
    audience: form.audience,
    voice: form.voice,
    tone: form.tone,
    keywords: parseKeywords(form.keywords),
    autoPilot: form.autoPilot,
    dailyPostLimit: form.dailyPostLimit,
    dailyCommentLimit: form.dailyCommentLimit,
  };
}

function CampaignForm({
  form,
  setForm,
  title,
  description,
  submitLabel,
  submittingLabel,
  submitting,
  onCancel,
  onSubmit,
}: {
  form: CampaignFormState;
  setForm: React.Dispatch<React.SetStateAction<CampaignFormState>>;
  title: string;
  description: string;
  submitLabel: string;
  submittingLabel: string;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => Promise<void>;
}): React.ReactNode {
  const updateField = <K extends keyof CampaignFormState>(
    key: K,
    value: CampaignFormState[K],
  ): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="campaign-name" className="sm:col-span-2">
          <Input
            id="campaign-name"
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
            required
            placeholder="Founder-led growth"
          />
        </Field>
        <Field label="Product" htmlFor="campaign-product">
          <Textarea
            id="campaign-product"
            value={form.product}
            onChange={(event) => updateField("product", event.target.value)}
            placeholder="What you sell or promote"
          />
        </Field>
        <Field label="Audience" htmlFor="campaign-audience">
          <Textarea
            id="campaign-audience"
            value={form.audience}
            onChange={(event) => updateField("audience", event.target.value)}
            placeholder="Who this should reach"
          />
        </Field>
        <Field label="Voice" htmlFor="campaign-voice">
          <Textarea
            id="campaign-voice"
            value={form.voice}
            onChange={(event) => updateField("voice", event.target.value)}
            placeholder="Plainspoken, evidence-heavy, concise"
          />
        </Field>
        <Field label="Tone" htmlFor="campaign-tone">
          <Input
            id="campaign-tone"
            value={form.tone}
            onChange={(event) => updateField("tone", event.target.value)}
            placeholder="Helpful operator"
          />
        </Field>
        <Field
          label="Manual keywords"
          htmlFor="campaign-keywords"
          className="sm:col-span-2"
        >
          <Input
            id="campaign-keywords"
            value={form.keywords}
            onChange={(event) => updateField("keywords", event.target.value)}
            placeholder="LinkedIn growth, founder content, outbound"
          />
        </Field>
        <Field label="Daily post limit" htmlFor="campaign-post-limit">
          <Input
            id="campaign-post-limit"
            type="number"
            min={0}
            max={10}
            value={form.dailyPostLimit}
            onChange={(event) =>
              updateField("dailyPostLimit", Number(event.target.value))
            }
          />
        </Field>
        <Field label="Daily comment limit" htmlFor="campaign-comment-limit">
          <Input
            id="campaign-comment-limit"
            type="number"
            min={0}
            max={50}
            value={form.dailyCommentLimit}
            onChange={(event) =>
              updateField("dailyCommentLimit", Number(event.target.value))
            }
          />
        </Field>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <Label htmlFor="campaign-autopilot">Autopilot intent</Label>
          <p className="text-muted-foreground text-xs">
            Queue automation later; publishing stays approval-gated.
          </p>
        </div>
        <Switch
          id="campaign-autopilot"
          checked={form.autoPilot}
          onCheckedChange={(checked) => updateField("autoPilot", checked)}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </Button>
      </DialogFooter>
    </form>
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
