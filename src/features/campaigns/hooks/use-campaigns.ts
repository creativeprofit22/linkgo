import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  createCampaign,
  listCampaigns,
  setCampaignStatus,
  updateCampaign as updateCampaignRecord,
} from "@/features/campaigns/data";
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
    if (!issue) return "Campaign input is invalid";
    const path = issue.path.map(String).join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  }
  return error instanceof Error ? error.message : "Unexpected campaign error";
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
        toast.error("Campaign was not created", { description: message });
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
        toast.error("Campaign was not updated", { description: message });
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
        toast.error("Campaign status was not changed", {
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
