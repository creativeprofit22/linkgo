import type { z } from "zod";

import type {
  addWatchlistEntryInputSchema,
  brightDataCapsSchema,
  brightDataRunModeSchema,
  brightDataRunRequestSchema,
  brightDataRunSchema,
  brightDataRunStatusSchema,
  brightDataStatusSchema,
  brightDataWatchKindSchema,
  startBrightDataRunInputSchema,
  updateWatchlistEntryInputSchema,
  watchlistEntrySchema,
} from "@/features/source-imports/brightdata-schemas";

export type BrightDataRunMode = z.infer<typeof brightDataRunModeSchema>;
export type BrightDataRunStatus = z.infer<typeof brightDataRunStatusSchema>;
export type BrightDataWatchKind = z.infer<typeof brightDataWatchKindSchema>;
export type BrightDataCaps = z.infer<typeof brightDataCapsSchema>;
export type BrightDataStatus = z.infer<typeof brightDataStatusSchema>;
export type BrightDataRun = z.infer<typeof brightDataRunSchema>;
export type BrightDataRunRequest = z.infer<typeof brightDataRunRequestSchema>;
export type StartBrightDataRunInput = z.infer<
  typeof startBrightDataRunInputSchema
>;
export type WatchlistEntry = z.infer<typeof watchlistEntrySchema>;
export type AddWatchlistEntryInput = z.infer<
  typeof addWatchlistEntryInputSchema
>;
export type UpdateWatchlistEntryInput = z.infer<
  typeof updateWatchlistEntryInputSchema
>;
