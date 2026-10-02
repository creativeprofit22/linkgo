import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

import {
  brightDataRunRequestSchema,
  brightDataRunSchema,
  brightDataStatusSchema,
  isBrightDataAvailable,
  parsePostUrlList,
  watchlistEntrySchema,
} from "../src/features/source-imports/brightdata-schemas";
import {
  normalizedSourceConnectorBatchInputSchema,
  SOURCE_CONNECTORS,
  sourceConnectorKeySchema,
} from "../src/features/source-imports/connectors";

function rustConst(name: string): number {
  const source = readFileSync(
    resolve(process.cwd(), "src-tauri/src/brightdata/mod.rs"),
    "utf8",
  );
  const match = new RegExp(`const ${name}: \\w+ = (\\d+);`).exec(source);
  if (match?.[1] === undefined) throw new Error(`missing ${name}`);
  return Number(match[1]);
}

const status = {
  enabled: false,
  killSwitchActive: false,
  apiKeyConfigured: true,
  cliFound: true,
  pinnedCliVersion: "0.3.7",
  reviewStatus: "pending_sign_off",
  runsToday: 0,
  caps: {
    maxPostsPerRun: 20,
    maxWatchlistEntriesPerRun: 10,
    maxRunsPerCampaignPerDay: 5,
    defaultWindowDays: 7,
    maxWindowDays: 30,
  },
} as const;

const run = {
  id: 1,
  campaignId: 1,
  mode: "watchlist",
  status: "running",
  snapshotId: "sd_1",
  requestedCount: 1,
  rowCount: 0,
  sourceImportBatchId: null,
  errorMessage: "",
  createdAt: "2026-09-30 10:00:00",
  updatedAt: "2026-09-30 10:00:00",
  resumable: true,
} as const;

test("request schema caps match the native constants", () => {
  expect(rustConst("MAX_POSTS_PER_RUN")).toBe(20);
  expect(rustConst("MAX_WATCHLIST_ENTRIES_PER_RUN")).toBe(10);
  expect(rustConst("MAX_RUNS_PER_CAMPAIGN_PER_DAY")).toBe(5);
  expect(rustConst("MAX_WINDOW_DAYS")).toBe(30);
  const tooMany = Array.from(
    { length: 21 },
    (_, index) => `https://www.linkedin.com/posts/a_${index}`,
  );
  expect(
    brightDataRunRequestSchema.safeParse({
      mode: "post_url",
      postUrls: tooMany,
    }).success,
  ).toBe(false);
  expect(
    brightDataRunRequestSchema.safeParse({
      mode: "watchlist",
      kind: "profile",
      days: 31,
    }).success,
  ).toBe(false);
  expect(
    brightDataRunRequestSchema.safeParse({
      mode: "watchlist",
      kind: "profile",
      entryIds: Array.from({ length: 11 }, (_, index) => index + 1),
    }).success,
  ).toBe(false);
  expect(
    brightDataRunRequestSchema.safeParse({ mode: "watchlist", kind: "company" })
      .success,
  ).toBe(true);
});

test("keyword search is retired for new runs but readable in history", () => {
  // Bright Data retired its Discover API (HTTP 410).
  expect(
    brightDataRunRequestSchema.safeParse({
      mode: "keyword",
      query: "ai agents",
    }).success,
  ).toBe(false);
  expect(brightDataRunSchema.parse({ ...run, mode: "keyword" }).mode).toBe(
    "keyword",
  );
});

test("records parse strictly and reject unknown fields or statuses", () => {
  expect(brightDataStatusSchema.parse(status)).toEqual(status);
  expect(brightDataRunSchema.parse(run)).toEqual(run);
  expect(brightDataRunSchema.safeParse({ ...run, apiKey: "x" }).success).toBe(
    false,
  );
  expect(
    brightDataRunSchema.safeParse({ ...run, status: "paused" }).success,
  ).toBe(false);
  expect(
    watchlistEntrySchema.safeParse({
      id: 1,
      campaignId: 1,
      kind: "group",
      url: "https://www.linkedin.com/in/x",
      label: "",
      enabled: true,
      createdAt: "t",
      updatedAt: "t",
    }).success,
  ).toBe(false);
});

test("availability requires every gate", () => {
  expect(isBrightDataAvailable(status)).toBe(false);
  expect(isBrightDataAvailable({ ...status, enabled: true })).toBe(true);
  expect(
    isBrightDataAvailable({ ...status, enabled: true, killSwitchActive: true }),
  ).toBe(false);
  expect(
    isBrightDataAvailable({
      ...status,
      enabled: true,
      apiKeyConfigured: false,
    }),
  ).toBe(false);
  expect(
    isBrightDataAvailable({ ...status, enabled: true, runsToday: 5 }),
  ).toBe(false);
});

test("brightdata batches are readable but not writable from the renderer", () => {
  expect(sourceConnectorKeySchema.parse("brightdata")).toBe("brightdata");
  expect(SOURCE_CONNECTORS.brightdata.mayFetchExternally).toBe(true);
  expect(SOURCE_CONNECTORS.brightdata.available).toBe(false);
  expect(
    normalizedSourceConnectorBatchInputSchema.safeParse({
      campaignId: 1,
      connectorKey: "brightdata",
      rows: [{}],
    }).success,
  ).toBe(false);
});

test("post URL lists split on whitespace and commas and dedupe", () => {
  expect(
    parsePostUrlList(
      "https://www.linkedin.com/posts/a_1\n https://www.linkedin.com/posts/b_2, https://www.linkedin.com/posts/a_1",
    ),
  ).toEqual([
    "https://www.linkedin.com/posts/a_1",
    "https://www.linkedin.com/posts/b_2",
  ]);
});
