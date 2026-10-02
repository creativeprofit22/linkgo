import { invokeCommand } from "@/lib/tauri";

import {
  campaignBacklogFiltersSchema,
  createCampaignBacklogItemSchema,
  setCampaignBacklogItemStatusSchema,
  updateCampaignBacklogItemSchema,
} from "@/features/campaign-backlog/schemas";
import {
  formatUtcAsDateTimeLocal,
  localDateTimeToUtc,
} from "@/features/campaign-backlog/time-zone";
import {
  CAMPAIGN_BACKLOG_CREATE_COMMAND,
  CAMPAIGN_BACKLOG_SET_STATUS_COMMAND,
  CAMPAIGN_BACKLOG_UPDATE_COMMAND,
} from "@/features/campaign-backlog/types";
import type {
  CampaignBacklogDashboard,
  CampaignBacklogFilters,
  CampaignBacklogItemDetail,
  CampaignBacklogMutationCommandResult,
  CampaignBacklogRecurrence,
  CampaignBacklogStatusMutationCommandResult,
  CampaignBacklogStatusResult,
  CreateCampaignBacklogItemInput,
  SetCampaignBacklogItemStatusInput,
  UpdateCampaignBacklogItemInput,
} from "@/features/campaign-backlog/types";
import { campaignBacklogDashboardSnapshotSchema } from "@/features/campaign-backlog/record-schemas";

async function invokeBacklogCommand<TResult>(
  command: string,
  input: unknown,
): Promise<TResult> {
  try {
    return await invokeCommand<TResult>(command, { input });
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Backlog dashboard read natively (`planning_reads.rs`): items, open-work
 * summary and total count from one snapshot. Open items are capped at 500;
 * history keeps its 100-row cap.
 */
export async function getCampaignBacklogDashboard(
  filters: CampaignBacklogFilters,
): Promise<CampaignBacklogDashboard> {
  const parsed = campaignBacklogFiltersSchema.parse(filters);
  const snapshot = campaignBacklogDashboardSnapshotSchema.parse(
    await invokeCommand("linkgo_campaign_backlog_dashboard", {
      input: {
        ...(parsed.campaignId === null
          ? {}
          : { campaignId: parsed.campaignId }),
        owner: parsed.owner,
        view: parsed.view,
      },
    }),
  );
  return { ...snapshot, asOf: new Date().toISOString() };
}

export async function createCampaignBacklogItem(
  input: CreateCampaignBacklogItemInput,
): Promise<CampaignBacklogItemDetail> {
  const parsed = createCampaignBacklogItemSchema.parse(input);
  const result =
    await invokeBacklogCommand<CampaignBacklogMutationCommandResult>(
      CAMPAIGN_BACKLOG_CREATE_COMMAND,
      parsed,
    );
  return result.item;
}

export async function updateCampaignBacklogItem(
  input: UpdateCampaignBacklogItemInput,
): Promise<CampaignBacklogItemDetail> {
  const parsed = updateCampaignBacklogItemSchema.parse(input);
  const result =
    await invokeBacklogCommand<CampaignBacklogMutationCommandResult>(
      CAMPAIGN_BACKLOG_UPDATE_COMMAND,
      parsed,
    );
  return result.item;
}

export function getNextCampaignBacklogDueAt(
  dueAt: string,
  recurrence: Exclude<CampaignBacklogRecurrence, "none">,
  recurrenceTimeZone: string,
  now: Date = new Date(),
): string {
  const dueLocal = formatUtcAsDateTimeLocal(dueAt, recurrenceTimeZone);
  if (dueLocal === "") throw new Error("The due time or time zone isn't valid");
  const localCursor = new Date(`${dueLocal}:00.000Z`);
  const days = recurrence === "daily" ? 1 : 7;

  for (let interval = 0; interval < 10_000; interval += 1) {
    localCursor.setUTCDate(localCursor.getUTCDate() + days);
    const nextLocal = localCursor.toISOString().slice(0, 16);
    const nextDueAt = localDateTimeToUtc(nextLocal, recurrenceTimeZone);
    if (Date.parse(nextDueAt) > now.getTime()) return nextDueAt;
  }

  throw new Error("We couldn't work out when the next repeating task is due");
}

export async function setCampaignBacklogItemStatus(
  input: SetCampaignBacklogItemStatusInput,
): Promise<CampaignBacklogStatusResult> {
  const parsed = setCampaignBacklogItemStatusSchema.parse(input);
  const result =
    await invokeBacklogCommand<CampaignBacklogStatusMutationCommandResult>(
      CAMPAIGN_BACKLOG_SET_STATUS_COMMAND,
      parsed,
    );
  return result;
}
