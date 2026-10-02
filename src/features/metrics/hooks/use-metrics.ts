import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { listCampaigns } from "@/features/campaigns/data";
import type { CampaignWithKeywords } from "@/features/campaigns/types";
import {
  createCampaignMemory,
  getMetricRefreshStatus,
  listCampaignMemory,
  listLearningEvents,
  listMetricEligibleApprovals,
  listMetricRefreshDashboard,
  listPostMetrics,
  recordPostMetric,
  runMetricRefreshTick,
  setCampaignMemoryStatus,
  startMetricRefresh,
  stopMetricRefresh,
} from "@/features/metrics/data";
import { toPlainMessage } from "@/lib/plain-message";
import type {
  CampaignMemory,
  CreateCampaignMemoryInput,
  LearningEvent,
  MetricEligibleApproval,
  MetricRefreshDashboard,
  NativeMetricRefreshStatus,
  PostMetricWithDetails,
  RecordPostMetricInput,
  SetCampaignMemoryStatusInput,
} from "@/features/metrics/types";

interface UseMetricsState {
  campaigns: CampaignWithKeywords[];
  selectedCampaignId: number | null;
  eligibleApprovals: MetricEligibleApproval[];
  metrics: PostMetricWithDetails[];
  memory: CampaignMemory[];
  events: LearningEvent[];
  refreshDashboard: MetricRefreshDashboard | null;
  refreshStatus: NativeMetricRefreshStatus | null;
  loading: boolean;
  error: string | null;
  loadMetrics: () => Promise<void>;
  selectCampaign: (id: number | null) => void;
  recordMetric: (input: RecordPostMetricInput) => Promise<void>;
  saveMemory: (input: CreateCampaignMemoryInput) => Promise<void>;
  setMemoryStatus: (input: SetCampaignMemoryStatusInput) => Promise<void>;
  startRefresh: () => Promise<void>;
  stopRefresh: () => Promise<void>;
  refreshNow: () => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim() !== "")
    return toPlainMessage(error);

  return error instanceof Error
    ? toPlainMessage(error.message)
    : "Something went wrong with your analytics. Try again.";
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

export function useMetrics(): UseMetricsState {
  const [campaigns, setCampaigns] = useState<CampaignWithKeywords[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null,
  );
  const [eligibleApprovals, setEligibleApprovals] = useState<
    MetricEligibleApproval[]
  >([]);
  const [metrics, setMetrics] = useState<PostMetricWithDetails[]>([]);
  const [memory, setMemory] = useState<CampaignMemory[]>([]);
  const [events, setEvents] = useState<LearningEvent[]>([]);
  const [refreshDashboard, setRefreshDashboard] =
    useState<MetricRefreshDashboard | null>(null);
  const [refreshStatus, setRefreshStatus] =
    useState<NativeMetricRefreshStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetricsForCampaign = useCallback(
    async (campaignId: number | null) => {
      if (campaignId === null) {
        setEligibleApprovals([]);
        setMetrics([]);
        setMemory([]);
        setEvents([]);
        setRefreshDashboard(null);
        return;
      }

      const [
        loadedEligible,
        loadedMetrics,
        loadedMemory,
        loadedEvents,
        loadedRefreshDashboard,
        loadedRefreshStatus,
      ] = await Promise.all([
        listMetricEligibleApprovals(campaignId),
        listPostMetrics(campaignId),
        listCampaignMemory(campaignId),
        listLearningEvents(campaignId),
        listMetricRefreshDashboard(campaignId),
        getMetricRefreshStatus(),
      ]);
      setEligibleApprovals(loadedEligible);
      setMetrics(loadedMetrics);
      setMemory(loadedMemory);
      setEvents(loadedEvents);
      setRefreshDashboard(loadedRefreshDashboard);
      setRefreshStatus(loadedRefreshStatus);
    },
    [],
  );

  const loadMetrics = useCallback(async () => {
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
      await loadMetricsForCampaign(nextCampaignId);
    } catch (caught) {
      const message = getErrorMessage(caught);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [loadMetricsForCampaign, selectedCampaignId]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  const selectCampaign = useCallback(
    (id: number | null) => {
      setSelectedCampaignId(id);
      void loadMetricsForCampaign(id);
    },
    [loadMetricsForCampaign],
  );

  const recordMetric = useCallback(
    async (input: RecordPostMetricInput) => {
      try {
        await recordPostMetric(input);
        await loadMetricsForCampaign(selectedCampaignId);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("We couldn't save these results", {
          description: message,
        });
        throw caught;
      }
    },
    [loadMetricsForCampaign, selectedCampaignId],
  );

  const saveMemory = useCallback(
    async (input: CreateCampaignMemoryInput) => {
      try {
        await createCampaignMemory(input);
        await loadMetricsForCampaign(selectedCampaignId);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("We couldn't save this lesson", { description: message });
        throw caught;
      }
    },
    [loadMetricsForCampaign, selectedCampaignId],
  );

  const startRefresh = useCallback(async () => {
    try {
      const status = await startMetricRefresh();
      setRefreshStatus(status);
      await loadMetricsForCampaign(selectedCampaignId);
      toast.success("Auto-update is on");
    } catch (caught) {
      const message = getErrorMessage(caught);
      toast.error("We couldn't turn on auto-update", {
        description: message,
      });
      throw caught;
    }
  }, [loadMetricsForCampaign, selectedCampaignId]);

  const stopRefresh = useCallback(async () => {
    try {
      const status = await stopMetricRefresh();
      setRefreshStatus(status);
      await loadMetricsForCampaign(selectedCampaignId);
      toast.success("Auto-update is off");
    } catch (caught) {
      const message = getErrorMessage(caught);
      toast.error("We couldn't turn off auto-update", {
        description: message,
      });
      throw caught;
    }
  }, [loadMetricsForCampaign, selectedCampaignId]);

  const refreshNow = useCallback(async () => {
    try {
      const result = await runMetricRefreshTick();
      await loadMetricsForCampaign(selectedCampaignId);
      toast.success(
        `${result.refreshed} updated, ${result.unavailable} not available, ${result.failed} didn't update`,
        {
          description: `${result.retryScheduled} will try again, ${result.blocked} held back`,
        },
      );
    } catch (caught) {
      const message = getErrorMessage(caught);
      toast.error("We couldn't update from LinkedIn", {
        description: message,
      });
      throw caught;
    }
  }, [loadMetricsForCampaign, selectedCampaignId]);

  const setMemoryStatus = useCallback(
    async (input: SetCampaignMemoryStatusInput) => {
      try {
        await setCampaignMemoryStatus(input);
        await loadMetricsForCampaign(selectedCampaignId);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("We couldn't update this lesson", {
          description: message,
        });
        throw caught;
      }
    },
    [loadMetricsForCampaign, selectedCampaignId],
  );

  return useMemo(
    () => ({
      campaigns,
      selectedCampaignId,
      eligibleApprovals,
      metrics,
      memory,
      events,
      refreshDashboard,
      refreshStatus,
      loading,
      error,
      loadMetrics,
      selectCampaign,
      recordMetric,
      saveMemory,
      setMemoryStatus,
      startRefresh,
      stopRefresh,
      refreshNow,
    }),
    [
      campaigns,
      selectedCampaignId,
      eligibleApprovals,
      metrics,
      memory,
      events,
      refreshDashboard,
      refreshStatus,
      loading,
      error,
      loadMetrics,
      selectCampaign,
      recordMetric,
      saveMemory,
      setMemoryStatus,
      startRefresh,
      stopRefresh,
      refreshNow,
    ],
  );
}
