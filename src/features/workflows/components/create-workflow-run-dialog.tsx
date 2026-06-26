import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
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
import type { CreateWorkflowRunInput } from "@/workflows/types";

interface CreateWorkflowRunDialogProps {
  campaigns: CampaignWithKeywords[];
  selectedCampaignId: number | null;
  selectedCampaignArchived: boolean;
  onCreate: (input: CreateWorkflowRunInput) => Promise<number>;
}

export function CreateWorkflowRunDialog({
  campaigns,
  selectedCampaignId,
  selectedCampaignArchived,
  onCreate,
}: CreateWorkflowRunDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState<number | null>(
    selectedCampaignId,
  );
  const [title, setTitle] = useState("Weekly founder content pipeline");
  const [contextSummary, setContextSummary] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCampaignId(selectedCampaignId);
  }, [selectedCampaignId]);

  const selectedDialogCampaign =
    campaigns.find((campaign) => campaign.id === campaignId) ?? null;
  const trimmedTitle = title.trim();
  const disabled =
    campaigns.length === 0 ||
    selectedCampaignArchived ||
    selectedDialogCampaign?.status === "archived";
  const submitDisabled = disabled || saving || trimmedTitle === "";

  async function handleSubmit(
    event: React.SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (campaignId === null || trimmedTitle === "") return;
    setSaving(true);
    try {
      await onCreate({ campaignId, title: trimmedTitle, contextSummary });
      setOpen(false);
      setTitle("Weekly founder content pipeline");
      setContextSummary("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled}>
          <Plus className="size-4" /> Create workflow run
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create workflow run</DialogTitle>
          <DialogDescription>
            Start a resumable local content pipeline for one campaign.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className="space-y-2">
            <Label htmlFor="workflow-campaign">Campaign</Label>
            <select
              id="workflow-campaign"
              value={campaignId ?? ""}
              onChange={(event) => setCampaignId(Number(event.target.value))}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                  {campaign.status === "archived" ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="workflow-title">Title</Label>
            <Input
              id="workflow-title"
              value={title}
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workflow-context-summary">Context summary</Label>
            <Textarea
              id="workflow-context-summary"
              value={contextSummary}
              maxLength={1000}
              onChange={(event) => setContextSummary(event.target.value)}
              placeholder="Optional notes for the operator or later agent runtime."
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitDisabled}>
              {saving ? "Creating…" : "Create workflow run"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
