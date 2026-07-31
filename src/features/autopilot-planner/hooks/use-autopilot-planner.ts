import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  getAutopilotPlannerStatus,
  listAutopilotPlannerDashboard,
  runAutopilotPlannerTick,
  startAutopilotPlanner,
  stopAutopilotPlanner,
} from "@/features/autopilot-planner/data";
import type {
  AutopilotPlannerDashboard,
  AutopilotPlannerStatusPayload,
  AutopilotPlannerTickResult,
} from "@/features/autopilot-planner/types";
import { listCampaigns } from "@/features/campaigns/data";
import type { CampaignWithKeywords } from "@/features/campaigns/types";

interface UseAutopilotPlannerState {
  campaigns: CampaignWithKeywords[];
  selectedCampaignId: number | null;
  dashboard: AutopilotPlannerDashboard | null;
  status: AutopilotPlannerStatusPayload | null;
  loading: boolean;
  saving: boolean;
  ticking: boolean;
  error: string | null;
  resultSummary: string;
  refresh: () => Promise<void>;
  selectCampaign: (campaignId: number | null) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  tick: () => Promise<AutopilotPlannerTickResult | null>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unexpected autopilot planner error";
}

function tickSummary(result: AutopilotPlannerTickResult): string {
  if (result.blocked > 0) {
    if (result.planned === 0 && result.skipped === 0 && result.failed === 0) {
      return "Planner blocked. No local work was created.";
    }
    return `Tick stopped: ${result.planned} planned, ${result.skipped} skipped, ${result.failed} failed, ${result.blocked} blocked.`;
  }
  return `Tick complete: ${result.planned} planned, ${result.skipped} skipped, ${result.failed} failed.`;
}

export function useAutopilotPlanner(): UseAutopilotPlannerState {
  const [campaigns, setCampaigns] = useState<CampaignWithKeywords[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null,
  );
  const [dashboard, setDashboard] = useState<AutopilotPlannerDashboard | null>(
    null,
  );
  const [status, setStatus] = useState<AutopilotPlannerStatusPayload | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ticking, setTicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultSummary, setResultSummary] = useState("");
  const selectedCampaignRef = useRef<number | null>(null);
  const latestRequestRef = useRef(0);
  const actionInProgressRef = useRef(false);

  const loadDashboard = useCallback(
    async (
      campaignId: number | null,
      showLoading: boolean,
    ): Promise<string | null> => {
      const requestId = latestRequestRef.current + 1;
      latestRequestRef.current = requestId;
      if (showLoading) setLoading(true);
      setError(null);
      try {
        const [loadedDashboard, loadedStatus] = await Promise.all([
          listAutopilotPlannerDashboard(campaignId ?? undefined),
          getAutopilotPlannerStatus(),
        ]);
        if (requestId !== latestRequestRef.current) return null;
        setDashboard(loadedDashboard);
        setStatus(loadedStatus);
        return null;
      } catch (caught) {
        if (requestId !== latestRequestRef.current) return null;
        const message = getErrorMessage(caught);
        setError(message);
        return message;
      } finally {
        if (requestId === latestRequestRef.current && showLoading) {
          setLoading(false);
        }
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const loadedCampaigns = await listCampaigns();
      if (requestId !== latestRequestRef.current) return;
      setCampaigns(loadedCampaigns);
      const currentCampaignId = selectedCampaignRef.current;
      const nextCampaignId =
        currentCampaignId === null ||
        loadedCampaigns.some((campaign) => campaign.id === currentCampaignId)
          ? currentCampaignId
          : null;
      selectedCampaignRef.current = nextCampaignId;
      setSelectedCampaignId(nextCampaignId);

      const [loadedDashboard, loadedStatus] = await Promise.all([
        listAutopilotPlannerDashboard(nextCampaignId ?? undefined),
        getAutopilotPlannerStatus(),
      ]);
      if (requestId !== latestRequestRef.current) return;
      setDashboard(loadedDashboard);
      setStatus(loadedStatus);
    } catch (caught) {
      if (requestId !== latestRequestRef.current) return;
      setError(getErrorMessage(caught));
    } finally {
      if (requestId === latestRequestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectCampaign = useCallback(
    (campaignId: number | null) => {
      selectedCampaignRef.current = campaignId;
      setSelectedCampaignId(campaignId);
      void loadDashboard(campaignId, true);
    },
    [loadDashboard],
  );

  const refreshAfterAction = useCallback(async () => {
    const refreshError = await loadDashboard(
      selectedCampaignRef.current,
      false,
    );
    if (refreshError === null) return;

    const message = `The planner action succeeded, but the dashboard could not be refreshed: ${refreshError}`;
    setError(message);
    toast.error("Dashboard refresh failed", { description: message });
  }, [loadDashboard]);

  const start = useCallback(async () => {
    if (actionInProgressRef.current) return;
    actionInProgressRef.current = true;
    setSaving(true);
    setError(null);
    try {
      let nextStatus: AutopilotPlannerStatusPayload;
      try {
        nextStatus = await startAutopilotPlanner();
      } catch (caught) {
        const message = getErrorMessage(caught);
        setError(message);
        setResultSummary(`Planner was not started: ${message}`);
        toast.error("Autopilot planner was not started", {
          description: message,
        });
        return;
      }

      setStatus(nextStatus);
      setResultSummary(
        "Autopilot planner started. It only creates local work.",
      );
      toast.success("Autopilot planner started");
      await refreshAfterAction();
    } finally {
      actionInProgressRef.current = false;
      setSaving(false);
    }
  }, [refreshAfterAction]);

  const stop = useCallback(async () => {
    if (actionInProgressRef.current) return;
    actionInProgressRef.current = true;
    setSaving(true);
    setError(null);
    try {
      let nextStatus: AutopilotPlannerStatusPayload;
      try {
        nextStatus = await stopAutopilotPlanner();
      } catch (caught) {
        const message = getErrorMessage(caught);
        setError(message);
        setResultSummary(`Planner was not stopped: ${message}`);
        toast.error("Autopilot planner was not stopped", {
          description: message,
        });
        return;
      }

      setStatus(nextStatus);
      setResultSummary("Autopilot planner stopped.");
      toast.success("Autopilot planner stopped");
      await refreshAfterAction();
    } finally {
      actionInProgressRef.current = false;
      setSaving(false);
    }
  }, [refreshAfterAction]);

  const tick = useCallback(async () => {
    if (actionInProgressRef.current) return null;
    actionInProgressRef.current = true;
    setTicking(true);
    setError(null);
    try {
      let result: AutopilotPlannerTickResult;
      try {
        result = await runAutopilotPlannerTick();
      } catch (caught) {
        const message = getErrorMessage(caught);
        setError(message);
        setResultSummary(`Planner tick failed: ${message}`);
        toast.error("Autopilot planner tick failed", {
          description: message,
        });
        return null;
      }

      const summary = tickSummary(result);
      setResultSummary(summary);
      toast.success("Autopilot planner tick completed", {
        description: summary,
      });
      await refreshAfterAction();
      return result;
    } finally {
      actionInProgressRef.current = false;
      setTicking(false);
    }
  }, [refreshAfterAction]);

  return useMemo(
    () => ({
      campaigns,
      selectedCampaignId,
      dashboard,
      status,
      loading,
      saving,
      ticking,
      error,
      resultSummary,
      refresh,
      selectCampaign,
      start,
      stop,
      tick,
    }),
    [
      campaigns,
      selectedCampaignId,
      dashboard,
      status,
      loading,
      saving,
      ticking,
      error,
      resultSummary,
      refresh,
      selectCampaign,
      start,
      stop,
      tick,
    ],
  );
}
