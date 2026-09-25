import { invokeCommand } from "@/lib/tauri";
import {
  campaignListSchema,
  createCampaignSchema,
  updateCampaignSchema,
} from "@/features/campaigns/schemas";
import type {
  CampaignStatus,
  CampaignWithKeywords,
  CreateCampaignInput,
  UpdateCampaignInput,
} from "@/features/campaigns/types";

/**
 * Campaign persistence is owned natively (`src-tauri/src/campaigns.rs`).
 * Renderer-side Zod parsing is kept so the native payload is identical to
 * what the previous renderer SQL wrote; native re-validates everything.
 */

export async function createCampaign(
  input: CreateCampaignInput,
): Promise<number> {
  const parsed = createCampaignSchema.parse(input);
  return invokeCommand<number>("linkgo_campaign_create", { input: parsed });
}

export async function listCampaigns(): Promise<CampaignWithKeywords[]> {
  const rows = await invokeCommand("linkgo_campaign_list", {
    input: {},
  });
  return campaignListSchema.parse(rows);
}

export async function updateCampaign(
  input: UpdateCampaignInput,
): Promise<void> {
  const parsed = updateCampaignSchema.parse(input);
  await invokeCommand("linkgo_campaign_update", { input: parsed });
}

export async function setCampaignStatus(
  id: number,
  status: CampaignStatus,
): Promise<void> {
  await invokeCommand("linkgo_campaign_status_set", {
    input: { id, status },
  });
}
