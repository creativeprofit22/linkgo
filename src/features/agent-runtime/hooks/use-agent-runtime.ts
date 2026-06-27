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
  startAgentRun,
} from "@/features/agent-runtime/data";
import { getAuthStatus } from "@/features/integrations/data";
import type { ConnectedAccount } from "@/features/integrations/types";
import type {
  AgentRunWithDetails,
  CancelAgentRunInput,
  CreateAgentRunInput,
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
  loading: boolean;
  error: string | null;
  killSwitchEnabled: boolean;
  killSwitchReason: string;
  connectedAccounts: ConnectedAccount[];
  loadAgentRuntime: () => Promise<void>;
  selectCampaign: (id: number | null) => void;
  createRun: (input: CreateAgentRunInput) => Promise<number>;
  startRun: (input: StartAgentRunInput) => Promise<void>;
  cancelRun: (input: CancelAgentRunInput) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unexpected agent runtime error";
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
  const [loading, setLoading] = useState(true);
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
      const [loadedCampaigns, loadedSafetySettings, authStatus] =
        await Promise.all([
          listCampaigns(),
          getSafetySettings(),
          getAuthStatus(),
        ]);
      setCampaigns(loadedCampaigns);
      setSafetySettings(loadedSafetySettings);
      setConnectedAccounts(authStatus.accounts);
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
        toast.error("Agent run was not created", {
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
        toast.error("Agent run was not started", {
          description: getErrorMessage(caught),
        });
        throw caught;
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
        toast.error("Agent run was not cancelled", {
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
      loading,
      error,
      killSwitchEnabled: safetySettings?.global_kill_switch === 1,
      killSwitchReason: safetySettings?.kill_switch_reason ?? "",
      connectedAccounts,
      loadAgentRuntime,
      selectCampaign,
      createRun,
      startRun,
      cancelRun,
    }),
    [
      campaigns,
      selectedCampaignId,
      workflowRuns,
      agentRuns,
      toolContracts,
      loading,
      error,
      safetySettings,
      connectedAccounts,
      loadAgentRuntime,
      selectCampaign,
      createRun,
      startRun,
      cancelRun,
    ],
  );
}
