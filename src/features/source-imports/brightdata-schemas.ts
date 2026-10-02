import { z } from "zod";

/** Mirrors `src-tauri/src/brightdata` caps and records. Unknown keys fail. */

/**
 * Modes stored on runs. "keyword" stays readable for run history only:
 * Bright Data retired its Discover API (HTTP 410), so new requests and the
 * native connector reject it.
 */
export const BRIGHTDATA_RUN_MODES = [
  "post_url",
  "keyword",
  "watchlist",
] as const;
export const BRIGHTDATA_RUN_STATUSES = [
  "starting",
  "running",
  "ready",
  "imported",
  "failed",
  "cancelled",
] as const;
export const BRIGHTDATA_WATCH_KINDS = ["profile", "company"] as const;

export const brightDataRunModeSchema = z.enum(BRIGHTDATA_RUN_MODES);
export const brightDataRunStatusSchema = z.enum(BRIGHTDATA_RUN_STATUSES);
export const brightDataWatchKindSchema = z.enum(BRIGHTDATA_WATCH_KINDS);

const id = z.number().int().positive();
const count = z.number().int().nonnegative();

export const brightDataCapsSchema = z.strictObject({
  maxPostsPerRun: z.number().int().positive(),
  maxWatchlistEntriesPerRun: z.number().int().positive(),
  maxRunsPerCampaignPerDay: z.number().int().positive(),
  defaultWindowDays: z.number().int().positive(),
  maxWindowDays: z.number().int().positive(),
});

export const brightDataStatusSchema = z.strictObject({
  enabled: z.boolean(),
  killSwitchActive: z.boolean(),
  apiKeyConfigured: z.boolean(),
  cliFound: z.boolean(),
  pinnedCliVersion: z.string().min(1).max(40),
  reviewStatus: z.enum(["pending_sign_off", "signed_off"]),
  runsToday: count,
  caps: brightDataCapsSchema,
});

export const brightDataRunSchema = z.strictObject({
  id,
  campaignId: id,
  mode: brightDataRunModeSchema,
  status: brightDataRunStatusSchema,
  snapshotId: z.string().min(1).max(200).nullable(),
  requestedCount: count,
  rowCount: count,
  sourceImportBatchId: id.nullable(),
  errorMessage: z.string().max(1000),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  resumable: z.boolean(),
});

export const brightDataRunListSchema = z.array(brightDataRunSchema).max(50);

export const watchlistEntrySchema = z.strictObject({
  id,
  campaignId: id,
  kind: brightDataWatchKindSchema,
  url: z.url().max(1000),
  label: z.string().max(160),
  enabled: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const watchlistEntryListSchema = z.array(watchlistEntrySchema).max(50);

export const recoverRunsResultSchema = z.strictObject({ recovered: count });

const windowDays = z.number().int().min(1).max(30).optional();

/** Run request sent to native; native re-validates every field. */
export const brightDataRunRequestSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("post_url"),
    postUrls: z
      .array(z.string().trim().pipe(z.url().max(1000)))
      .min(1, "Add at least one LinkedIn post link")
      .max(20, "Fetch up to 20 posts at a time"),
  }),
  z.strictObject({
    mode: z.literal("watchlist"),
    kind: brightDataWatchKindSchema,
    entryIds: z.array(id).min(1).max(10).optional(),
    days: windowDays,
  }),
]);

export const startBrightDataRunInputSchema = z.strictObject({
  campaignId: id,
  request: brightDataRunRequestSchema,
});

export const addWatchlistEntryInputSchema = z.strictObject({
  campaignId: id,
  kind: brightDataWatchKindSchema,
  url: z
    .string()
    .trim()
    .pipe(z.url({ error: "Enter a LinkedIn link" }).max(1000)),
  label: z.string().trim().max(160),
});

export const updateWatchlistEntryInputSchema = z.strictObject({
  id,
  enabled: z.boolean(),
  label: z.string().trim().max(160),
});

/** Splits pasted text (one URL per line or separated by spaces/commas). */
export function parsePostUrlList(text: string): string[] {
  const urls = text
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return [...new Set(urls)];
}

/** True only when every native gate would let a run start. */
export function isBrightDataAvailable(
  status: z.infer<typeof brightDataStatusSchema>,
): boolean {
  return (
    status.enabled &&
    !status.killSwitchActive &&
    status.apiKeyConfigured &&
    status.runsToday < status.caps.maxRunsPerCampaignPerDay
  );
}
