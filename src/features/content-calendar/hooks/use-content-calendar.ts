import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { listCampaigns } from "@/features/campaigns/data";
import type { CampaignWithKeywords } from "@/features/campaigns/types";
import {
  archiveContentCalendarSlot,
  cancelContentCalendarSlotSchedule,
  createContentCalendarSlot,
  listContentCalendarEligibleApprovals,
  listContentCalendarSlots,
  rescheduleContentCalendarSlot,
  scheduleContentCalendarSlot,
  updateContentCalendarSlot,
} from "@/features/content-calendar/data";
import { toPlainErrorMessage } from "@/lib/plain-message";
import type {
  ArchiveContentCalendarSlotInput,
  CancelContentCalendarSlotScheduleInput,
  RescheduleContentCalendarSlotInput,
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
  /** Reloads slots for the current campaign without the loading screen or toasts. */
  reloadSlots: () => Promise<void>;
  selectCampaign: (id: number | null) => void;
  createSlot: (input: CreateContentCalendarSlotInput) => Promise<void>;
  updateSlot: (input: UpdateContentCalendarSlotInput) => Promise<void>;
  archiveSlot: (input: ArchiveContentCalendarSlotInput) => Promise<void>;
  scheduleSlot: (input: ScheduleContentCalendarSlotInput) => Promise<void>;
  rescheduleSlot: (input: RescheduleContentCalendarSlotInput) => Promise<void>;
  cancelSlotSchedule: (
    input: CancelContentCalendarSlotScheduleInput,
  ) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return toPlainErrorMessage(
    error,
    "Something went wrong with your calendar. Try again.",
  );
}

export interface UseContentCalendarOptions {
  /**
   * Campaign requested by a link. Selected on first load (when it exists)
   * and whenever a new link arrives while Calendar stays open.
   */
  initialCampaignId?: number | undefined;
}

export function useContentCalendar(
  options: UseContentCalendarOptions = {},
): UseContentCalendarState {
  const { initialCampaignId } = options;
  const [campaigns, setCampaigns] = useState<CampaignWithKeywords[]>([]);
  // A missing linked campaign falls back to "All campaigns" in loadCalendar.
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    initialCampaignId ?? null,
  );
  const requestedCampaignIdRef = useRef(initialCampaignId);
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

  // Quiet: a failed background reload keeps the current slots; Refresh
  // still surfaces load errors.
  const reloadSlots = useCallback(
    () => loadCalendarForCampaign(selectedCampaignId).catch(() => {}),
    [loadCalendarForCampaign, selectedCampaignId],
  );

  const selectCampaign = useCallback(
    (id: number | null) => {
      setSelectedCampaignId(id);
      void loadCalendarForCampaign(id);
    },
    [loadCalendarForCampaign],
  );

  // A new link while Calendar stays open selects its campaign; loadCalendar
  // re-runs for the new selection and drops it if the campaign is gone.
  useEffect(() => {
    if (requestedCampaignIdRef.current === initialCampaignId) return;
    requestedCampaignIdRef.current = initialCampaignId;
    if (initialCampaignId !== undefined)
      setSelectedCampaignId(initialCampaignId);
  }, [initialCampaignId]);

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

  const rescheduleSlot = useCallback(
    async (input: RescheduleContentCalendarSlotInput) => {
      setSaving(true);
      try {
        const result = await rescheduleContentCalendarSlot(input);
        // Reload either way: earlier steps may have taken effect.
        await loadCalendarForCampaign(selectedCampaignId).catch(() => {});
        if (result.ok) {
          toast.success("New time saved");
          return;
        }
        const reason = getErrorMessage(result.error);
        if (result.previousScheduleCancelled) {
          toast.error("Old time cancelled; new time wasn't saved", {
            description: `Pick a time again. ${reason}`,
          });
        } else {
          toast.error("We couldn't change the time", { description: reason });
        }
        throw result.error instanceof Error
          ? result.error
          : new Error("We couldn't change the time.");
      } finally {
        setSaving(false);
      }
    },
    [loadCalendarForCampaign, selectedCampaignId],
  );

  const cancelSlotSchedule = useCallback(
    async (input: CancelContentCalendarSlotScheduleInput) => {
      setSaving(true);
      try {
        await cancelContentCalendarSlotSchedule(input);
        await loadCalendarForCampaign(selectedCampaignId);
        toast.success("Schedule cancelled", {
          description: "The post is still approved and won't go out.",
        });
      } catch (caught) {
        toast.error("We couldn't cancel this schedule", {
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
      reloadSlots,
      selectCampaign,
      createSlot,
      updateSlot,
      archiveSlot,
      scheduleSlot,
      rescheduleSlot,
      cancelSlotSchedule,
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
      reloadSlots,
      selectCampaign,
      createSlot,
      updateSlot,
      archiveSlot,
      scheduleSlot,
      rescheduleSlot,
      cancelSlotSchedule,
    ],
  );
}
