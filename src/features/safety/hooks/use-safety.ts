import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { listCampaigns } from "@/features/campaigns/data";
import type { CampaignWithKeywords } from "@/features/campaigns/types";
import {
  listSafetyDashboard,
  setErrorQueueItemStatus,
  setGlobalKillSwitch,
} from "@/features/safety/data";
import { toPlainMessage } from "@/lib/plain-message";
import type {
  SafetyDashboard,
  SetErrorQueueItemStatusInput,
  SetGlobalKillSwitchInput,
} from "@/features/safety/types";

interface UseSafetyState {
  campaigns: CampaignWithKeywords[];
  selectedCampaignId: number | null;
  dashboard: SafetyDashboard | null;
  loading: boolean;
  killSwitchSaving: boolean;
  error: string | null;
  loadSafety: () => Promise<void>;
  selectCampaign: (id: number | null) => void;
  toggleKillSwitch: (input: SetGlobalKillSwitchInput) => Promise<void>;
  changeErrorStatus: (input: SetErrorQueueItemStatusInput) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? toPlainMessage(error.message)
    : "Something went wrong with safety settings. Try again.";
}

export function useSafety(): UseSafetyState {
  const [campaigns, setCampaigns] = useState<CampaignWithKeywords[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null,
  );
  const [dashboard, setDashboard] = useState<SafetyDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [killSwitchSaving, setKillSwitchSaving] = useState(false);
  const killSwitchSavingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (campaignId: number | null) => {
    const loadedDashboard = await listSafetyDashboard(campaignId ?? undefined);
    setDashboard(loadedDashboard);
  }, []);

  const loadSafety = useCallback(async () => {
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
    void loadSafety();
  }, [loadSafety]);

  const selectCampaign = useCallback(
    (id: number | null) => {
      setSelectedCampaignId(id);
      void loadDashboard(id);
    },
    [loadDashboard],
  );

  const toggleKillSwitch = useCallback(
    async (input: SetGlobalKillSwitchInput) => {
      if (killSwitchSavingRef.current) return;

      killSwitchSavingRef.current = true;
      setKillSwitchSaving(true);
      try {
        await setGlobalKillSwitch(input);
        await loadDashboard(selectedCampaignId);
        toast.success(
          input.enabled
            ? "Emergency pause is on. Everything is paused."
            : "Emergency pause is off",
        );
      } catch (caught) {
        toast.error("We couldn't change the emergency pause", {
          description: getErrorMessage(caught),
        });
        throw caught;
      } finally {
        killSwitchSavingRef.current = false;
        setKillSwitchSaving(false);
      }
    },
    [loadDashboard, selectedCampaignId],
  );

  const changeErrorStatus = useCallback(
    async (input: SetErrorQueueItemStatusInput) => {
      try {
        await setErrorQueueItemStatus(input);
        await loadDashboard(selectedCampaignId);
      } catch (caught) {
        toast.error("We couldn't update this problem", {
          description: getErrorMessage(caught),
        });
        throw caught;
      }
    },
    [loadDashboard, selectedCampaignId],
  );

  return useMemo(
    () => ({
      campaigns,
      selectedCampaignId,
      dashboard,
      loading,
      killSwitchSaving,
      error,
      loadSafety,
      selectCampaign,
      toggleKillSwitch,
      changeErrorStatus,
    }),
    [
      campaigns,
      selectedCampaignId,
      dashboard,
      loading,
      killSwitchSaving,
      error,
      loadSafety,
      selectCampaign,
      toggleKillSwitch,
      changeErrorStatus,
    ],
  );
}
