import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { listCampaigns } from "@/features/campaigns/data";
import type { CampaignWithKeywords } from "@/features/campaigns/types";
import { getAuthStatus } from "@/features/integrations/data";
import type { ConnectedAccount } from "@/features/integrations/types";
import { getSafetySettings } from "@/features/safety/data";
import {
  addWorkflowNote,
  cancelWorkflowRun,
  createWorkflowRun,
  executeWorkflowRun,
  listWorkflowRuns,
  resumeWorkflowRun,
  setWorkflowStepStatus,
  startWorkflowRun,
} from "@/workflows/data";
import type {
  AddWorkflowNoteInput,
  CancelWorkflowRunInput,
  CreateWorkflowRunInput,
  ExecuteWorkflowRunInput,
  SetWorkflowStepStatusInput,
  StartWorkflowRunInput,
  WorkflowRunWithDetails,
} from "@/workflows/types";

interface UseWorkflowsState {
  campaigns: CampaignWithKeywords[];
  selectedCampaignId: number | null;
  runs: WorkflowRunWithDetails[];
  loading: boolean;
  error: string | null;
  connectedAccounts: ConnectedAccount[];
  activeRunId: number | null;
  killSwitchEnabled: boolean;
  loadWorkflows: () => Promise<void>;
  selectCampaign: (id: number | null) => void;
  createRun: (input: CreateWorkflowRunInput) => Promise<number>;
  startRun: (input: StartWorkflowRunInput) => Promise<void>;
  executeRun: (input: ExecuteWorkflowRunInput) => Promise<void>;
  resumeRun: (input: StartWorkflowRunInput) => Promise<void>;
  setStepStatus: (input: SetWorkflowStepStatusInput) => Promise<void>;
  cancelRun: (input: CancelWorkflowRunInput) => Promise<void>;
  addNote: (input: AddWorkflowNoteInput) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected workflow error";
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

export function useWorkflows(): UseWorkflowsState {
  const [campaigns, setCampaigns] = useState<CampaignWithKeywords[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null,
  );
  const [runs, setRuns] = useState<WorkflowRunWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<
    ConnectedAccount[]
  >([]);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [killSwitchEnabled, setKillSwitchEnabled] = useState(false);
  const activeActionRunIds = useRef(new Set<number>());

  const loadRunsForCampaign = useCallback(async (campaignId: number | null) => {
    if (campaignId === null) {
      setRuns([]);
      return;
    }
    setRuns(await listWorkflowRuns(campaignId));
  }, []);

  const loadWorkflows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedCampaigns, authStatus, safetySettings] = await Promise.all([
        listCampaigns(),
        getAuthStatus(),
        getSafetySettings(),
      ]);
      setCampaigns(loadedCampaigns);
      setConnectedAccounts(authStatus.accounts);
      setKillSwitchEnabled(safetySettings.global_kill_switch === 1);
      const campaignStillExists = loadedCampaigns.some(
        (campaign) => campaign.id === selectedCampaignId,
      );
      const nextCampaignId = campaignStillExists
        ? selectedCampaignId
        : getDefaultCampaignId(loadedCampaigns);
      setSelectedCampaignId(nextCampaignId);
      await loadRunsForCampaign(nextCampaignId);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [loadRunsForCampaign, selectedCampaignId]);

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  const selectCampaign = useCallback(
    (id: number | null) => {
      setSelectedCampaignId(id);
      void loadRunsForCampaign(id);
    },
    [loadRunsForCampaign],
  );

  const createRun = useCallback(
    async (input: CreateWorkflowRunInput) => {
      try {
        const id = await createWorkflowRun(input);
        await loadRunsForCampaign(input.campaignId);
        setSelectedCampaignId(input.campaignId);
        return id;
      } catch (caught) {
        toast.error("Workflow run was not created", {
          description: getErrorMessage(caught),
        });
        throw caught;
      }
    },
    [loadRunsForCampaign],
  );

  const startRun = useCallback(
    async (input: StartWorkflowRunInput) => {
      try {
        await startWorkflowRun(input);
        await loadRunsForCampaign(selectedCampaignId);
      } catch (caught) {
        toast.error("Workflow run was not started", {
          description: getErrorMessage(caught),
        });
        throw caught;
      }
    },
    [loadRunsForCampaign, selectedCampaignId],
  );

  const executeRun = useCallback(
    async (input: ExecuteWorkflowRunInput) => {
      if (activeActionRunIds.current.has(input.id)) {
        throw new Error("Workflow action is already running");
      }
      activeActionRunIds.current.add(input.id);
      setActiveRunId(input.id);
      try {
        await executeWorkflowRun(input);
        await loadRunsForCampaign(selectedCampaignId);
        if (input.scoring !== undefined) {
          toast.success("Workflow scoring updated", {
            description:
              "The attached batch and linked workflow state were refreshed.",
          });
        }
      } catch (caught) {
        toast.error("Workflow executor failed", {
          description: getErrorMessage(caught),
        });
        await loadRunsForCampaign(selectedCampaignId).catch(() => undefined);
        throw caught;
      } finally {
        activeActionRunIds.current.delete(input.id);
        setActiveRunId((current) => (current === input.id ? null : current));
      }
    },
    [loadRunsForCampaign, selectedCampaignId],
  );

  const resumeRun = useCallback(
    async (input: StartWorkflowRunInput) => {
      if (activeActionRunIds.current.has(input.id)) {
        throw new Error("Workflow action is already running");
      }
      activeActionRunIds.current.add(input.id);
      setActiveRunId(input.id);
      try {
        await resumeWorkflowRun(input);
        await loadRunsForCampaign(selectedCampaignId);
      } catch (caught) {
        toast.error("Workflow executor was not resumed", {
          description: getErrorMessage(caught),
        });
        throw caught;
      } finally {
        activeActionRunIds.current.delete(input.id);
        setActiveRunId((current) => (current === input.id ? null : current));
      }
    },
    [loadRunsForCampaign, selectedCampaignId],
  );

  const setStepStatus = useCallback(
    async (input: SetWorkflowStepStatusInput) => {
      try {
        await setWorkflowStepStatus(input);
        await loadRunsForCampaign(selectedCampaignId);
      } catch (caught) {
        toast.error("Workflow step was not updated", {
          description: getErrorMessage(caught),
        });
        throw caught;
      }
    },
    [loadRunsForCampaign, selectedCampaignId],
  );

  const cancelRun = useCallback(
    async (input: CancelWorkflowRunInput) => {
      try {
        await cancelWorkflowRun(input);
        await loadRunsForCampaign(selectedCampaignId);
      } catch (caught) {
        toast.error("Workflow run was not cancelled", {
          description: getErrorMessage(caught),
        });
        throw caught;
      }
    },
    [loadRunsForCampaign, selectedCampaignId],
  );

  const addNote = useCallback(
    async (input: AddWorkflowNoteInput) => {
      try {
        await addWorkflowNote(input);
        await loadRunsForCampaign(selectedCampaignId);
      } catch (caught) {
        toast.error("Workflow note was not added", {
          description: getErrorMessage(caught),
        });
        throw caught;
      }
    },
    [loadRunsForCampaign, selectedCampaignId],
  );

  return useMemo(
    () => ({
      campaigns,
      selectedCampaignId,
      runs,
      loading,
      error,
      connectedAccounts,
      activeRunId,
      killSwitchEnabled,
      loadWorkflows,
      selectCampaign,
      createRun,
      startRun,
      executeRun,
      resumeRun,
      setStepStatus,
      cancelRun,
      addNote,
    }),
    [
      campaigns,
      selectedCampaignId,
      runs,
      loading,
      error,
      connectedAccounts,
      activeRunId,
      killSwitchEnabled,
      loadWorkflows,
      selectCampaign,
      createRun,
      startRun,
      executeRun,
      resumeRun,
      setStepStatus,
      cancelRun,
      addNote,
    ],
  );
}
