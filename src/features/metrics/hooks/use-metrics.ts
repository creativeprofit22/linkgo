import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { listCampaigns } from "@/features/campaigns/data";
import type { CampaignWithKeywords } from "@/features/campaigns/types";
import {
  createCampaignMemory,
  listCampaignMemory,
  listLearningEvents,
  listMetricEligibleApprovals,
  listPostMetrics,
  recordPostMetric,
  setCampaignMemoryStatus,
} from "@/features/metrics/data";
import type {
  CampaignMemory,
  CreateCampaignMemoryInput,
  LearningEvent,
  MetricEligibleApproval,
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
  loading: boolean;
  error: string | null;
  loadMetrics: () => Promise<void>;
  selectCampaign: (id: number | null) => void;
  recordMetric: (input: RecordPostMetricInput) => Promise<void>;
  saveMemory: (input: CreateCampaignMemoryInput) => Promise<void>;
  setMemoryStatus: (input: SetCampaignMemoryStatusInput) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected metrics error";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetricsForCampaign = useCallback(
    async (campaignId: number | null) => {
      if (campaignId === null) {
        setEligibleApprovals([]);
        setMetrics([]);
        setMemory([]);
        setEvents([]);
        return;
      }

      const [loadedEligible, loadedMetrics, loadedMemory, loadedEvents] =
        await Promise.all([
          listMetricEligibleApprovals(campaignId),
          listPostMetrics(campaignId),
          listCampaignMemory(campaignId),
          listLearningEvents(campaignId),
        ]);
      setEligibleApprovals(loadedEligible);
      setMetrics(loadedMetrics);
      setMemory(loadedMemory);
      setEvents(loadedEvents);
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
        toast.error("Metric snapshot was not recorded", {
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
        toast.error("Campaign memory was not saved", { description: message });
        throw caught;
      }
    },
    [loadMetricsForCampaign, selectedCampaignId],
  );

  const setMemoryStatus = useCallback(
    async (input: SetCampaignMemoryStatusInput) => {
      try {
        await setCampaignMemoryStatus(input);
        await loadMetricsForCampaign(selectedCampaignId);
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("Campaign memory status was not changed", {
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
      loading,
      error,
      loadMetrics,
      selectCampaign,
      recordMetric,
      saveMemory,
      setMemoryStatus,
    }),
    [
      campaigns,
      selectedCampaignId,
      eligibleApprovals,
      metrics,
      memory,
      events,
      loading,
      error,
      loadMetrics,
      selectCampaign,
      recordMetric,
      saveMemory,
      setMemoryStatus,
    ],
  );
}
