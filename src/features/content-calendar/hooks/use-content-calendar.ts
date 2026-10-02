import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { listCampaigns } from "@/features/campaigns/data";
import type { CampaignWithKeywords } from "@/features/campaigns/types";
import {
  archiveContentCalendarSlot,
  createContentCalendarSlot,
  listContentCalendarEligibleApprovals,
  listContentCalendarSlots,
  scheduleContentCalendarSlot,
  updateContentCalendarSlot,
} from "@/features/content-calendar/data";
import { toPlainMessage } from "@/lib/plain-message";
import type {
  ArchiveContentCalendarSlotInput,
  ContentCalendarEligibleApproval,
  ContentCalendarSlotWithDetails,
  CreateContentCalendarSlotInput,
  ScheduleContentCalendarSlotInput,
  UpdateContentCalendarSlotInput,
} from "@/features/content-calendar/types";

interface UseContentCalendarState {
  campaigns: CampaignWithKeywords[];
  selectedCampaignId: number | null;
  slots: ContentCalendarSlotWithDetails[];
  eligibleApprovals: ContentCalendarEligibleApproval[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  loadCalendar: () => Promise<void>;
  selectCampaign: (id: number | null) => void;
  createSlot: (input: CreateContentCalendarSlotInput) => Promise<void>;
  updateSlot: (input: UpdateContentCalendarSlotInput) => Promise<void>;
  archiveSlot: (input: ArchiveContentCalendarSlotInput) => Promise<void>;
  scheduleSlot: (input: ScheduleContentCalendarSlotInput) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? toPlainMessage(error.message)
    : "Something went wrong with your calendar. Try again.";
}

export function useContentCalendar(): UseContentCalendarState {
  const [campaigns, setCampaigns] = useState<CampaignWithKeywords[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null,
  );
  const [slots, setSlots] = useState<ContentCalendarSlotWithDetails[]>([]);
  const [eligibleApprovals, setEligibleApprovals] = useState<
    ContentCalendarEligibleApproval[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCalendarForCampaign = useCallback(
    async (campaignId: number | null) => {
      const [loadedSlots, loadedEligibleApprovals] = await Promise.all([
        listContentCalendarSlots(campaignId ?? undefined),
        listContentCalendarEligibleApprovals(campaignId ?? undefined),
      ]);
      setSlots(loadedSlots);
      setEligibleApprovals(loadedEligibleApprovals);
    },
    [],
  );

  const loadCalendar = useCallback(async () => {
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
      await loadCalendarForCampaign(nextCampaignId);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [loadCalendarForCampaign, selectedCampaignId]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  const selectCampaign = useCallback(
    (id: number | null) => {
      setSelectedCampaignId(id);
      void loadCalendarForCampaign(id);
    },
    [loadCalendarForCampaign],
  );

  const createSlot = useCallback(
    async (input: CreateContentCalendarSlotInput) => {
      setSaving(true);
      try {
        await createContentCalendarSlot(input);
        await loadCalendarForCampaign(selectedCampaignId);
        toast.success("Post planned");
      } catch (caught) {
        toast.error("We couldn't plan this post", {
          description: getErrorMessage(caught),
        });
        throw caught;
      } finally {
        setSaving(false);
      }
    },
    [loadCalendarForCampaign, selectedCampaignId],
  );

  const updateSlot = useCallback(
    async (input: UpdateContentCalendarSlotInput) => {
      setSaving(true);
      try {
        await updateContentCalendarSlot(input);
        await loadCalendarForCampaign(selectedCampaignId);
        toast.success("Plan updated");
      } catch (caught) {
        toast.error("We couldn't save your changes", {
          description: getErrorMessage(caught),
        });
        throw caught;
      } finally {
        setSaving(false);
      }
    },
    [loadCalendarForCampaign, selectedCampaignId],
  );

  const archiveSlot = useCallback(
    async (input: ArchiveContentCalendarSlotInput) => {
      setSaving(true);
      try {
        await archiveContentCalendarSlot(input);
        await loadCalendarForCampaign(selectedCampaignId);
        toast.success("Planned post archived");
      } catch (caught) {
        toast.error("We couldn't archive this post", {
          description: getErrorMessage(caught),
        });
        throw caught;
      } finally {
        setSaving(false);
      }
    },
    [loadCalendarForCampaign, selectedCampaignId],
  );

  const scheduleSlot = useCallback(
    async (input: ScheduleContentCalendarSlotInput) => {
      setSaving(true);
      try {
        await scheduleContentCalendarSlot(input);
        await loadCalendarForCampaign(selectedCampaignId);
        toast.success("Post scheduled");
      } catch (caught) {
        toast.error("We couldn't schedule this post", {
          description: getErrorMessage(caught),
        });
        throw caught;
      } finally {
        setSaving(false);
      }
    },
    [loadCalendarForCampaign, selectedCampaignId],
  );

  return useMemo(
    () => ({
      campaigns,
      selectedCampaignId,
      slots,
      eligibleApprovals,
      loading,
      saving,
      error,
      loadCalendar,
      selectCampaign,
      createSlot,
      updateSlot,
      archiveSlot,
      scheduleSlot,
    }),
    [
      campaigns,
      selectedCampaignId,
      slots,
      eligibleApprovals,
      loading,
      saving,
      error,
      loadCalendar,
      selectCampaign,
      createSlot,
      updateSlot,
      archiveSlot,
      scheduleSlot,
    ],
  );
}
