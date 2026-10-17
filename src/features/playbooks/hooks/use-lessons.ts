import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { listCampaigns } from "@/features/campaigns/data";
import type { CampaignWithKeywords } from "@/features/campaigns/types";
import {
  listCampaignMemory,
  setCampaignMemoryStatus,
} from "@/features/metrics/data";
import type { CampaignMemory } from "@/features/metrics/types";
import { toPlainMessage } from "@/lib/plain-message";

/** Saved lessons for one campaign, as shown in Brand voice. */
export interface CampaignLessons {
  campaignId: number;
  campaignName: string;
  campaignArchived: boolean;
  lessons: CampaignMemory[];
}

interface UseLessonsState {
  groups: CampaignLessons[];
  loading: boolean;
  error: string | null;
  /** Lesson id currently being switched, if any. */
  updatingId: number | null;
  loadLessons: () => Promise<void>;
  /** On = used in new drafts (`active`); off = kept but unused (`archived`). */
  setLessonEnabled: (id: number, enabled: boolean) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? toPlainMessage(error.message)
    : "Something went wrong with your lessons. Try again.";
}

/** Groups lessons by campaign in campaign-list order; empty campaigns drop. */
export function groupLessons(
  campaigns: readonly CampaignWithKeywords[],
  memory: readonly CampaignMemory[],
): CampaignLessons[] {
  return campaigns
    .map((campaign) => ({
      campaignId: campaign.id,
      campaignName: campaign.name,
      campaignArchived: campaign.status === "archived",
      lessons: memory.filter((item) => item.campaign_id === campaign.id),
    }))
    .filter((group) => group.lessons.length > 0);
}

export function useLessons(): UseLessonsState {
  const [groups, setGroups] = useState<CampaignLessons[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const read = useCallback(async () => {
    const [campaigns, memory] = await Promise.all([
      listCampaigns(),
      listCampaignMemory(),
    ]);
    setGroups(groupLessons(campaigns, memory));
  }, []);

  const loadLessons = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await read();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [read]);

  useEffect(() => {
    void loadLessons();
  }, [loadLessons]);

  const setLessonEnabled = useCallback(
    async (id: number, enabled: boolean) => {
      setUpdatingId(id);
      try {
        await setCampaignMemoryStatus({
          id,
          status: enabled ? "active" : "archived",
        });
        await read();
        toast.success(
          enabled ? "Lesson on for new drafts" : "Lesson off for new drafts",
        );
      } catch (caught) {
        toast.error("We couldn't change this lesson", {
          description: getErrorMessage(caught),
        });
      } finally {
        setUpdatingId(null);
      }
    },
    [read],
  );

  return {
    groups,
    loading,
    error,
    updatingId,
    loadLessons,
    setLessonEnabled,
  };
}
