import { z } from "zod";

import { invokeCommand } from "@/lib/tauri";
import {
  addWatchlistEntryInputSchema,
  brightDataRunListSchema,
  brightDataRunSchema,
  brightDataStatusSchema,
  recoverRunsResultSchema,
  startBrightDataRunInputSchema,
  updateWatchlistEntryInputSchema,
  watchlistEntryListSchema,
  watchlistEntrySchema,
} from "@/features/source-imports/brightdata-schemas";
import type {
  AddWatchlistEntryInput,
  BrightDataRun,
  BrightDataStatus,
  StartBrightDataRunInput,
  UpdateWatchlistEntryInput,
  WatchlistEntry,
} from "@/features/source-imports/types/brightdata";

/**
 * Typed API for the native Bright Data connector. Every run-starting command
 * is re-gated natively (enable flag, kill switch, key, caps, one active run).
 */

function requireCampaign(campaignId: number): void {
  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    throw new Error("Campaign is required");
  }
}

function requireId(id: number, label: string): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${label} is required`);
  }
}

export async function getBrightDataStatus(
  campaignId: number,
): Promise<BrightDataStatus> {
  requireCampaign(campaignId);
  return brightDataStatusSchema.parse(
    await invokeCommand("linkgo_brightdata_status", { input: { campaignId } }),
  );
}

/** Explicit user action only; the stored default is off. */
export async function setBrightDataEnabled(enabled: boolean): Promise<boolean> {
  return z.boolean().parse(
    await invokeCommand("linkgo_brightdata_set_enabled", {
      input: { enabled },
    }),
  );
}

export async function listWatchlistEntries(
  campaignId: number,
): Promise<WatchlistEntry[]> {
  requireCampaign(campaignId);
  return watchlistEntryListSchema.parse(
    await invokeCommand("linkgo_brightdata_watchlist_list", {
      input: { campaignId },
    }),
  );
}

export async function addWatchlistEntry(
  input: AddWatchlistEntryInput,
): Promise<WatchlistEntry> {
  const parsed = addWatchlistEntryInputSchema.parse(input);
  return watchlistEntrySchema.parse(
    await invokeCommand("linkgo_brightdata_watchlist_add", { input: parsed }),
  );
}

export async function updateWatchlistEntry(
  input: UpdateWatchlistEntryInput,
): Promise<WatchlistEntry> {
  const parsed = updateWatchlistEntryInputSchema.parse(input);
  return watchlistEntrySchema.parse(
    await invokeCommand("linkgo_brightdata_watchlist_update", {
      input: parsed,
    }),
  );
}

export async function removeWatchlistEntry(id: number): Promise<void> {
  requireId(id, "Watchlist entry");
  await invokeCommand("linkgo_brightdata_watchlist_remove", { input: { id } });
}

/** Recovers interrupted runs, then lists recent ones (newest first). */
export async function listBrightDataRuns(
  campaignId: number,
): Promise<BrightDataRun[]> {
  requireCampaign(campaignId);
  recoverRunsResultSchema.parse(
    await invokeCommand("linkgo_brightdata_recover_interrupted", {
      input: { campaignId },
    }),
  );
  return brightDataRunListSchema.parse(
    await invokeCommand("linkgo_brightdata_list_runs", {
      input: { campaignId },
    }),
  );
}

export async function startBrightDataRun(
  input: StartBrightDataRunInput,
): Promise<BrightDataRun> {
  const parsed = startBrightDataRunInputSchema.parse(input);
  return brightDataRunSchema.parse(
    await invokeCommand("linkgo_brightdata_start_run", { input: parsed }),
  );
}

export async function resumeBrightDataRun(
  runId: number,
): Promise<BrightDataRun> {
  requireId(runId, "Run");
  return brightDataRunSchema.parse(
    await invokeCommand("linkgo_brightdata_resume_run", { input: { runId } }),
  );
}

export async function cancelBrightDataRun(
  runId: number,
): Promise<BrightDataRun> {
  requireId(runId, "Run");
  return brightDataRunSchema.parse(
    await invokeCommand("linkgo_brightdata_cancel_run", { input: { runId } }),
  );
}
