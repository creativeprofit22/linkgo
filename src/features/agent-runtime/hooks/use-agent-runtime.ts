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
  startDryRunAgentRun,
} from "@/features/agent-runtime/data";
import type {
  AgentRunWithDetails,
  CancelAgentRunInput,
  CreateAgentRunInput,
  StartAgentRunInput,
} from "@/features/agent-runtime/types";
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
  loadAgentRuntime: () => Promise<void>;
  selectCampaign: (id: number | null) => void;
  createRun: (input: CreateAgentRunInput) => Promise<number>;
  startDryRun: (input: StartAgentRunInput) => Promise<void>;
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
      const loadedCampaigns = await listCampaigns();
      setCampaigns(loadedCampaigns);
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

  const startDryRun = useCallback(
    async (input: StartAgentRunInput) => {
      try {
        await startDryRunAgentRun(input);
        await loadForCampaign(selectedCampaignId);
      } catch (caught) {
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
      loadAgentRuntime,
      selectCampaign,
      createRun,
      startDryRun,
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
      loadAgentRuntime,
      selectCampaign,
      createRun,
      startDryRun,
      cancelRun,
    ],
  );
}
