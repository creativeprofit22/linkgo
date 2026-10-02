import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  createCampaign,
  listCampaigns,
  setCampaignStatus,
  updateCampaign as updateCampaignRecord,
} from "@/features/campaigns/data";
import { toPlainMessage } from "@/lib/plain-message";
import type {
  CampaignStatus,
  CampaignWithKeywords,
  CreateCampaignInput,
  UpdateCampaignInput,
} from "@/features/campaigns/types";

interface UseCampaignsState {
  campaigns: CampaignWithKeywords[];
  loading: boolean;
  error: string | null;
  loadCampaigns: () => Promise<void>;
  addCampaign: (input: CreateCampaignInput) => Promise<void>;
  updateCampaign: (input: UpdateCampaignInput) => Promise<void>;
  archiveCampaign: (id: number) => Promise<void>;
  setStatus: (id: number, status: CampaignStatus) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    if (!issue) {
      return "Some campaign details don't look right. Check them and try again.";
    }
    return issue.message;
  }
  return error instanceof Error
    ? toPlainMessage(error.message)
    : "Something went wrong with this campaign. Please try again.";
}

export function useCampaigns(): UseCampaignsState {
  const [campaigns, setCampaigns] = useState<CampaignWithKeywords[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCampaigns(await listCampaigns());
    } catch (caught) {
      const message = getErrorMessage(caught);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const addCampaign = useCallback(
    async (input: CreateCampaignInput) => {
      try {
        await createCampaign(input);
        await loadCampaigns();
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("We couldn't create this campaign", {
          description: message,
        });
        throw caught;
      }
    },
    [loadCampaigns],
  );

  const updateCampaign = useCallback(
    async (input: UpdateCampaignInput) => {
      try {
        await updateCampaignRecord(input);
        await loadCampaigns();
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("We couldn't save your campaign changes", {
          description: message,
        });
        throw caught;
      }
    },
    [loadCampaigns],
  );

  const setStatus = useCallback(
    async (id: number, status: CampaignStatus) => {
      try {
        await setCampaignStatus(id, status);
        await loadCampaigns();
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("We couldn't change this campaign's status", {
          description: message,
        });
        throw caught;
      }
    },
    [loadCampaigns],
  );

  const archiveCampaign = useCallback(
    async (id: number) => {
      await setStatus(id, "archived");
    },
    [setStatus],
  );

  return useMemo(
    () => ({
      campaigns,
      loading,
      error,
      loadCampaigns,
      addCampaign,
      updateCampaign,
      archiveCampaign,
      setStatus,
    }),
    [
      campaigns,
      loading,
      error,
      loadCampaigns,
      addCampaign,
      updateCampaign,
      archiveCampaign,
      setStatus,
    ],
  );
}
