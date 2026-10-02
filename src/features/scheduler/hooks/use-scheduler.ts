import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { listCampaigns } from "@/features/campaigns/data";
import type { CampaignWithKeywords } from "@/features/campaigns/types";
import {
  getSchedulerStatus,
  listSchedulerDashboard,
  runSchedulerTick,
  startScheduler,
  stopScheduler,
} from "@/features/scheduler/data";
import { toPlainMessage } from "@/lib/plain-message";
import type {
  SchedulerDashboard,
  SchedulerStatusPayload,
  SchedulerTickResult,
} from "@/features/scheduler/types";

interface UseSchedulerState {
  campaigns: CampaignWithKeywords[];
  selectedCampaignId: number | null;
  dashboard: SchedulerDashboard | null;
  status: SchedulerStatusPayload | null;
  loading: boolean;
  saving: boolean;
  ticking: boolean;
  error: string | null;
  loadScheduler: () => Promise<void>;
  selectCampaign: (id: number | null) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  tick: () => Promise<SchedulerTickResult | null>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? toPlainMessage(error.message)
    : "Something went wrong with auto-posting. Try again.";
}

export function useScheduler(): UseSchedulerState {
  const [campaigns, setCampaigns] = useState<CampaignWithKeywords[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null,
  );
  const [dashboard, setDashboard] = useState<SchedulerDashboard | null>(null);
  const [status, setStatus] = useState<SchedulerStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ticking, setTicking] = useState(false);
  const runningActionRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (campaignId: number | null) => {
    const [loadedDashboard, loadedStatus] = await Promise.all([
      listSchedulerDashboard(campaignId ?? undefined),
      getSchedulerStatus(),
    ]);
    setDashboard(loadedDashboard);
    setStatus(loadedStatus);
  }, []);

  const loadScheduler = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loadedCampaigns = await listCampaigns();
      setCampaigns(loadedCampaigns);
      const campaignStillExists =
        selectedCampaignId === null ||
        loadedCampaigns.some((campaign) => campaign.id === selectedCampaignId);
      const nextCampaignId = campaignStillExists ? selectedCampaignId : null;
      setSelectedCampaignId(nextCampaignId);
      await loadDashboard(nextCampaignId);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [loadDashboard, selectedCampaignId]);

  useEffect(() => {
    void loadScheduler();
  }, [loadScheduler]);

  const selectCampaign = useCallback(
    (id: number | null) => {
      setSelectedCampaignId(id);
      void loadDashboard(id);
    },
    [loadDashboard],
  );

  const start = useCallback(async () => {
    if (runningActionRef.current) return;
    runningActionRef.current = true;
    setSaving(true);
    try {
      const nextStatus = await startScheduler();
      setStatus(nextStatus);
      await loadDashboard(selectedCampaignId);
      toast.success("Auto-posting is on");
    } catch (caught) {
      toast.error("We couldn't turn on auto-posting", {
        description: getErrorMessage(caught),
      });
      throw caught;
    } finally {
      runningActionRef.current = false;
      setSaving(false);
    }
  }, [loadDashboard, selectedCampaignId]);

  const stop = useCallback(async () => {
    if (runningActionRef.current) return;
    runningActionRef.current = true;
    setSaving(true);
    try {
      const nextStatus = await stopScheduler();
      setStatus(nextStatus);
      await loadDashboard(selectedCampaignId);
      toast.success("Auto-posting is off");
    } catch (caught) {
      toast.error("We couldn't turn off auto-posting", {
        description: getErrorMessage(caught),
      });
      throw caught;
    } finally {
      runningActionRef.current = false;
      setSaving(false);
    }
  }, [loadDashboard, selectedCampaignId]);

  const tick = useCallback(async () => {
    if (ticking) return null;
    setTicking(true);
    try {
      const result = await runSchedulerTick();
      await loadDashboard(selectedCampaignId);
      toast.success("Checked for due posts", {
        description: `${result.published} posted, ${result.retryScheduled} will try again, ${result.failed} didn't post, ${result.blocked} held back`,
      });
      return result;
    } catch (caught) {
      toast.error("We couldn't check for due posts", {
        description: getErrorMessage(caught),
      });
      throw caught;
    } finally {
      setTicking(false);
    }
  }, [loadDashboard, selectedCampaignId, ticking]);

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
      loadScheduler,
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
      loadScheduler,
      selectCampaign,
      start,
      stop,
      tick,
    ],
  );
}
