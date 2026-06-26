import { useEffect, useState } from "react";
import { Bot, Plus } from "lucide-react";
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
import { AGENT_ROLES, type AgentRole } from "@/agent";
import type { CampaignWithKeywords } from "@/features/campaigns/types";
import type { CreateAgentRunInput } from "@/features/agent-runtime/types";
import type { WorkflowRunWithDetails } from "@/workflows/types";

interface CreateAgentRunDialogProps {
  campaigns: CampaignWithKeywords[];
  workflowRuns: WorkflowRunWithDetails[];
  selectedCampaignId: number | null;
  selectedCampaignArchived: boolean;
  onCreate: (input: CreateAgentRunInput) => Promise<number>;
}

const roleLabels: Record<AgentRole, string> = {
  researcher: "Researcher",
  scorer: "Scorer",
  drafter: "Drafter",
  auditor: "Auditor",
  scheduler: "Scheduler",
  analyst: "Analyst",
};

export function CreateAgentRunDialog({
  campaigns,
  workflowRuns,
  selectedCampaignId,
  selectedCampaignArchived,
  onCreate,
}: CreateAgentRunDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState<number | null>(
    selectedCampaignId,
  );
  const [workflowRunId, setWorkflowRunId] = useState<number | null>(null);
  const [agentRole, setAgentRole] = useState<AgentRole>("researcher");
  const [modelName, setModelName] = useState("dry-run-local");
  const [inputSummary, setInputSummary] = useState(
    "Validate runtime contracts for this campaign.",
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCampaignId(selectedCampaignId);
    setWorkflowRunId(null);
  }, [selectedCampaignId]);

  const selectedDialogCampaign =
    campaigns.find((campaign) => campaign.id === campaignId) ?? null;
  const dialogWorkflowRuns = workflowRuns.filter(
    (run) => run.campaign_id === campaignId,
  );
  const disabled =
    campaigns.length === 0 ||
    selectedCampaignArchived ||
    selectedDialogCampaign?.status === "archived";
  const submitDisabled = disabled || saving || inputSummary.trim() === "";

  async function handleSubmit(
    event: React.SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (campaignId === null || inputSummary.trim() === "") return;
    setSaving(true);
    try {
      const createInput: CreateAgentRunInput = {
        campaignId,
        agentRole,
        providerKey: "dry_run",
        modelName,
        inputSummary: inputSummary.trim(),
      };
      if (workflowRunId !== null) createInput.workflowRunId = workflowRunId;
      await onCreate(createInput);
      setOpen(false);
      setAgentRole("researcher");
      setModelName("dry-run-local");
      setInputSummary("Validate runtime contracts for this campaign.");
      setWorkflowRunId(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled}>
          <Plus className="size-4" /> Create dry-run
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-5" /> Create dry-run agent run
          </DialogTitle>
          <DialogDescription>
            Queue a local agent runtime pass. It validates contracts without AI
            API calls or LinkedIn actions.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className="space-y-2">
            <Label htmlFor="agent-campaign">Campaign</Label>
            <select
              id="agent-campaign"
              value={campaignId ?? ""}
              onChange={(event) => {
                setCampaignId(Number(event.target.value));
                setWorkflowRunId(null);
              }}
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
            <Label htmlFor="agent-role">Agent role</Label>
            <select
              id="agent-role"
              value={agentRole}
              onChange={(event) =>
                setAgentRole(event.target.value as AgentRole)
              }
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              {AGENT_ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </div>

          {dialogWorkflowRuns.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="agent-workflow-run">Workflow run</Label>
              <select
                id="agent-workflow-run"
                value={workflowRunId ?? ""}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setWorkflowRunId(nextValue === "" ? null : Number(nextValue));
                }}
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <option value="">No workflow link</option>
                {dialogWorkflowRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="agent-model-name">Model name</Label>
            <Input
              id="agent-model-name"
              value={modelName}
              maxLength={120}
              onChange={(event) => setModelName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-input-summary">Input summary</Label>
            <Textarea
              id="agent-input-summary"
              value={inputSummary}
              maxLength={1000}
              onChange={(event) => setInputSummary(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitDisabled}>
              {saving ? "Creating…" : "Create dry-run"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
