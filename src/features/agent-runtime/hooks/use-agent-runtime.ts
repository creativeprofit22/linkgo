import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AgentToolMetadata } from "@/agent";
import { listCampaigns } from "@/features/campaigns/data";
import type { CampaignWithKeywords } from "@/features/campaigns/types";
import {
  cancelAgentRun,
  createAgentRun,
  listAgentRuns,
  listAgentToolContracts,
  resumeAgentRun,
  startAgentRun,
} from "@/features/agent-runtime/data";
import { toPlainMessage } from "@/lib/plain-message";
import { getAuthStatus } from "@/features/integrations/data";
import type { ConnectedAccount } from "@/features/integrations/types";
import { listPlaybooks } from "@/features/playbooks/data";
import type { AgentPlaybookView } from "@/features/playbooks/types";
import type {
  AgentRunWithDetails,
  CancelAgentRunInput,
  CreateAgentRunInput,
  ResumeAgentRunInput,
  ResumeAgentRunResult,
  StartAgentRunInput,
} from "@/features/agent-runtime/types";
import { getSafetySettings } from "@/features/safety/data";
import type { SafetySettings } from "@/features/safety/types";
import { listWorkflowRuns } from "@/workflows/data";
import type { WorkflowRunWithDetails } from "@/workflows/types";

interface UseAgentRuntimeState {
  campaigns: CampaignWithKeywords[];
  selectedCampaignId: number | null;
  workflowRuns: WorkflowRunWithDetails[];
  agentRuns: AgentRunWithDetails[];
  toolContracts: AgentToolMetadata[];
  playbooks: AgentPlaybookView[];
  loading: boolean;
  resumingRunId: number | null;
  error: string | null;
  killSwitchEnabled: boolean;
  killSwitchReason: string;
  connectedAccounts: ConnectedAccount[];
  loadAgentRuntime: () => Promise<void>;
  selectCampaign: (id: number | null) => void;
  createRun: (input: CreateAgentRunInput) => Promise<number>;
  startRun: (input: StartAgentRunInput) => Promise<void>;
  resumeRun: (input: ResumeAgentRunInput) => Promise<void>;
  cancelRun: (input: CancelAgentRunInput) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? toPlainMessage(error.message)
    : "Something went wrong with the AI assistant. Try again.";
}

function showResumeFeedback(result: ResumeAgentRunResult): void {
  if (result.status === "completed") {
    toast.success("Assistant task finished", {
      description: result.outputSummary || undefined,
    });
    return;
  }

  if (result.status === "waiting_approval") {
    toast.info("The assistant needs your approval again", {
      description:
        result.outputSummary ||
        "Review the new request in Approvals, then continue.",
    });
    return;
  }

  if (result.checkpointPhase === "continuation_ready") {
    toast.error("The assistant stopped. You can pick up where it left off.", {
      description:
        result.errorMessage ||
        "Choose “Pick up where it stopped” to try again.",
    });
    return;
  }

  toast.error("The assistant couldn't finish", {
    description: result.errorMessage || "Try again in a moment.",
  });
}

function getDefaultCampaignId(
  campaigns: CampaignWithKeywords[],
): number | null {
  return (
    campaigns.find((campaign) => campaign.status !== "archived")?.id ??
    campaigns[0]?.id ??
    null
  );
}

export function useAgentRuntime(): UseAgentRuntimeState {
  const [campaigns, setCampaigns] = useState<CampaignWithKeywords[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null,
  );
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRunWithDetails[]>(
    [],
  );
  const [agentRuns, setAgentRuns] = useState<AgentRunWithDetails[]>([]);
  const [toolContracts] = useState<AgentToolMetadata[]>(() =>
    listAgentToolContracts(),
  );
  const [playbooks, setPlaybooks] = useState<AgentPlaybookView[]>([]);
  const [loading, setLoading] = useState(true);
  const [resumingRunId, setResumingRunId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [safetySettings, setSafetySettings] = useState<SafetySettings | null>(
    null,
  );
  const [connectedAccounts, setConnectedAccounts] = useState<
    ConnectedAccount[]
  >([]);

  const loadForCampaign = useCallback(async (campaignId: number | null) => {
    if (campaignId === null) {
      setWorkflowRuns([]);
      setAgentRuns([]);
      return;
    }
    const [loadedWorkflowRuns, loadedAgentRuns] = await Promise.all([
      listWorkflowRuns(campaignId),
      listAgentRuns(campaignId),
    ]);
    setWorkflowRuns(loadedWorkflowRuns);
    setAgentRuns(loadedAgentRuns);
  }, []);

  const loadAgentRuntime = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        loadedCampaigns,
        loadedSafetySettings,
        authStatus,
        loadedPlaybooks,
      ] = await Promise.all([
        listCampaigns(),
        getSafetySettings(),
        getAuthStatus(),
        listPlaybooks(),
      ]);
      setCampaigns(loadedCampaigns);
      setSafetySettings(loadedSafetySettings);
      setConnectedAccounts(authStatus.accounts);
      setPlaybooks(loadedPlaybooks);
      const campaignStillExists = loadedCampaigns.some(
        (campaign) => campaign.id === selectedCampaignId,
      );
      const nextCampaignId = campaignStillExists
        ? selectedCampaignId
        : getDefaultCampaignId(loadedCampaigns);
      setSelectedCampaignId(nextCampaignId);
      await loadForCampaign(nextCampaignId);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [loadForCampaign, selectedCampaignId]);

  useEffect(() => {
    void loadAgentRuntime();
  }, [loadAgentRuntime]);

  const selectCampaign = useCallback(
    (id: number | null) => {
      setSelectedCampaignId(id);
      void loadForCampaign(id);
    },
    [loadForCampaign],
  );

  const createRun = useCallback(
    async (input: CreateAgentRunInput) => {
      try {
        const id = await createAgentRun(input);
        await loadForCampaign(input.campaignId);
        setSelectedCampaignId(input.campaignId);
        return id;
      } catch (caught) {
        toast.error("We couldn't create this assistant task", {
          description: getErrorMessage(caught),
        });
        throw caught;
      }
    },
    [loadForCampaign],
  );

  const startRun = useCallback(
    async (input: StartAgentRunInput) => {
      try {
        await startAgentRun(input);
        await loadForCampaign(selectedCampaignId);
      } catch (caught) {
        void getSafetySettings()
          .then(setSafetySettings)
          .catch(() => undefined);
        toast.error("We couldn't start this assistant task", {
          description: getErrorMessage(caught),
        });
        throw caught;
      }
    },
    [loadForCampaign, selectedCampaignId],
  );

  const resumeRun = useCallback(
    async (input: ResumeAgentRunInput) => {
      setResumingRunId(input.id);
      try {
        const result = await resumeAgentRun(input);
        await loadForCampaign(selectedCampaignId);
        showResumeFeedback(result);
      } catch (caught) {
        void getSafetySettings()
          .then(setSafetySettings)
          .catch(() => undefined);
        await loadForCampaign(selectedCampaignId).catch(() => undefined);
        toast.error("We couldn't continue this assistant task", {
          description: getErrorMessage(caught),
        });
        throw caught;
      } finally {
        setResumingRunId(null);
      }
    },
    [loadForCampaign, selectedCampaignId],
  );

  const cancelRun = useCallback(
    async (input: CancelAgentRunInput) => {
      try {
        await cancelAgentRun(input);
        await loadForCampaign(selectedCampaignId);
      } catch (caught) {
        toast.error("We couldn't cancel this assistant task", {
          description: getErrorMessage(caught),
        });
        throw caught;
      }
    },
    [loadForCampaign, selectedCampaignId],
  );

  return useMemo(
    () => ({
      campaigns,
      selectedCampaignId,
      workflowRuns,
      agentRuns,
      toolContracts,
      playbooks,
      loading,
      resumingRunId,
      error,
      killSwitchEnabled: safetySettings?.global_kill_switch === 1,
      killSwitchReason: safetySettings?.kill_switch_reason ?? "",
      connectedAccounts,
      loadAgentRuntime,
      selectCampaign,
      createRun,
      startRun,
      resumeRun,
      cancelRun,
    }),
    [
      campaigns,
      selectedCampaignId,
      workflowRuns,
      agentRuns,
      toolContracts,
      playbooks,
      loading,
      resumingRunId,
      error,
      safetySettings,
      connectedAccounts,
      loadAgentRuntime,
      selectCampaign,
      createRun,
      startRun,
      resumeRun,
      cancelRun,
    ],
  );
}
