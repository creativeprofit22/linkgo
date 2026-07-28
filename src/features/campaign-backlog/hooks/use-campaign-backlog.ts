import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  createCampaignBacklogItem,
  getCampaignBacklogDashboard,
  setCampaignBacklogItemStatus,
  updateCampaignBacklogItem,
} from "@/features/campaign-backlog/data";
import type {
  CampaignBacklogDashboard,
  CampaignBacklogFilters,
  CampaignBacklogItemDetail,
  CampaignBacklogOwnerFilter,
  CampaignBacklogStatus,
  CampaignBacklogStatusResult,
  CampaignBacklogView,
  CreateCampaignBacklogItemInput,
  UpdateCampaignBacklogItemInput,
} from "@/features/campaign-backlog/types";
import { listCampaigns } from "@/features/campaigns/data";
import type { CampaignWithKeywords } from "@/features/campaigns/types";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected backlog error";
}

const DEFAULT_FILTERS: CampaignBacklogFilters = {
  campaignId: null,
  owner: "all",
  view: "open",
};

export interface UseCampaignBacklogState {
  campaigns: CampaignWithKeywords[];
  dashboard: CampaignBacklogDashboard | null;
  filters: CampaignBacklogFilters;
  loading: boolean;
  pending: boolean;
  error: string | null;
  selectedCampaign: CampaignWithKeywords | null;
  loadBacklog: () => Promise<void>;
  setCampaignFilter: (campaignId: number | null) => void;
  setOwnerFilter: (owner: CampaignBacklogOwnerFilter) => void;
  setView: (view: CampaignBacklogView) => void;
  createItem: (
    input: CreateCampaignBacklogItemInput,
  ) => Promise<CampaignBacklogItemDetail>;
  updateItem: (
    input: UpdateCampaignBacklogItemInput,
  ) => Promise<CampaignBacklogItemDetail>;
  setItemStatus: (
    id: number,
    status: CampaignBacklogStatus,
  ) => Promise<CampaignBacklogStatusResult>;
}

export function useCampaignBacklog(): UseCampaignBacklogState {
  const [campaigns, setCampaigns] = useState<CampaignWithKeywords[]>([]);
  const [dashboard, setDashboard] = useState<CampaignBacklogDashboard | null>(
    null,
  );
  const [filters, setFilters] =
    useState<CampaignBacklogFilters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filtersRef = useRef<CampaignBacklogFilters>(DEFAULT_FILTERS);
  const requestIdRef = useRef(0);
  const pendingRef = useRef(false);

  const setCampaignFilter = useCallback((campaignId: number | null): void => {
    const nextFilters = { ...filtersRef.current, campaignId };
    filtersRef.current = nextFilters;
    setFilters(nextFilters);
  }, []);

  const setOwnerFilter = useCallback(
    (owner: CampaignBacklogOwnerFilter): void => {
      const nextFilters = { ...filtersRef.current, owner };
      filtersRef.current = nextFilters;
      setFilters(nextFilters);
    },
    [],
  );

  const setView = useCallback((view: CampaignBacklogView): void => {
    const nextFilters = { ...filtersRef.current, view };
    filtersRef.current = nextFilters;
    setFilters(nextFilters);
  }, []);

  const loadBacklog = useCallback(async (): Promise<void> => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const [loadedCampaigns, loadedDashboard] = await Promise.all([
        listCampaigns(),
        getCampaignBacklogDashboard(filtersRef.current),
      ]);
      if (requestIdRef.current !== requestId) return;
      setCampaigns(loadedCampaigns);
      setDashboard(loadedDashboard);
    } catch (caught) {
      if (requestIdRef.current !== requestId) return;
      setError(getErrorMessage(caught));
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBacklog();
    return () => {
      requestIdRef.current += 1;
    };
  }, [filters, loadBacklog]);

  const runMutation = useCallback(
    async <T>(action: () => Promise<T>, successTitle: string): Promise<T> => {
      if (pendingRef.current) {
        throw new Error("Another backlog change is still being saved");
      }
      pendingRef.current = true;
      setPending(true);
      try {
        const result = await action();
        toast.success(successTitle);
        await loadBacklog();
        return result;
      } catch (caught) {
        toast.error("Backlog was not changed", {
          description: getErrorMessage(caught),
        });
        throw caught;
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [loadBacklog],
  );

  const createItem = useCallback(
    (input: CreateCampaignBacklogItemInput) =>
      runMutation(
        () => createCampaignBacklogItem(input),
        "Backlog item created",
      ),
    [runMutation],
  );

  const updateItem = useCallback(
    (input: UpdateCampaignBacklogItemInput) =>
      runMutation(
        () => updateCampaignBacklogItem(input),
        "Backlog item updated",
      ),
    [runMutation],
  );

  const setItemStatus = useCallback(
    (id: number, status: CampaignBacklogStatus) =>
      runMutation(
        async () => {
          const result = await setCampaignBacklogItemStatus({ id, status });
          if (status === "completed" && result.successor !== null) {
            toast.success("Next recurring item scheduled", {
              description: new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(result.successor.due_at)),
            });
          }
          return result;
        },
        status === "completed"
          ? "Backlog item completed"
          : "Backlog status updated",
      ),
    [runMutation],
  );

  const selectedCampaign = useMemo(
    () =>
      campaigns.find((campaign) => campaign.id === filters.campaignId) ?? null,
    [campaigns, filters.campaignId],
  );

  return useMemo(
    () => ({
      campaigns,
      dashboard,
      filters,
      loading,
      pending,
      error,
      selectedCampaign,
      loadBacklog,
      setCampaignFilter,
      setOwnerFilter,
      setView,
      createItem,
      updateItem,
      setItemStatus,
    }),
    [
      campaigns,
      dashboard,
      filters,
      loading,
      pending,
      error,
      selectedCampaign,
      loadBacklog,
      setCampaignFilter,
      setOwnerFilter,
      setView,
      createItem,
      updateItem,
      setItemStatus,
    ],
  );
}
