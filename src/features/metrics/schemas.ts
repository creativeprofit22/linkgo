import type { MetricsRouteParams } from "@/features/metrics/types";
import {
  defineRoute,
  optionalRouteId,
  routeId,
} from "@/lib/navigation/route-contract";
import { z } from "zod";

const metricCountSchema = z.number().int().min(0).max(1_000_000_000);
const positiveIdSchema = z.number().int().positive();
const optionalPositiveIdSchema = positiveIdSchema.optional();

export const memorySignalSchema = z.enum([
  "winner",
  "underperformer",
  "insight",
  "avoid",
]);

export const campaignMemoryStatusSchema = z.enum(["active", "archived"]);

export const nativeMetricRefreshSettingsSchema = z.object({
  enabled: z.boolean(),
  pollIntervalMinutes: z.number().int().min(15).max(1440),
  maxJobsPerTick: z.number().int().min(1).max(20),
  refreshIntervalHours: z.number().int().min(1).max(168),
  retryBackoffMinutes: z.number().int().min(5).max(1440),
  updatedAt: z.string(),
});

export const nativeMetricRefreshStatusSchema = z.object({
  enabled: z.boolean(),
  running: z.boolean(),
  runnerId: z.string().nullable().optional(),
  settings: nativeMetricRefreshSettingsSchema,
});

export const nativeMetricRefreshTickResultSchema = z.object({
  claimed: z.number().int().min(0),
  refreshed: z.number().int().min(0),
  retryScheduled: z.number().int().min(0),
  unavailable: z.number().int().min(0),
  failed: z.number().int().min(0),
  blocked: z.number().int().min(0),
  seeded: z.number().int().min(0),
});

export const recordPostMetricSchema = z.object({
  campaignId: positiveIdSchema,
  approvalId: positiveIdSchema,
  publishAttemptId: optionalPositiveIdSchema,
  measuredAt: z
    .string()
    .trim()
    .max(80)
    .refine((value) => Number.isFinite(Date.parse(value)), {
      message: "Pick the date and time you checked these numbers.",
    }),
  impressions: metricCountSchema,
  reactions: metricCountSchema,
  comments: metricCountSchema,
  reposts: metricCountSchema,
  profileVisits: metricCountSchema,
  linkClicks: metricCountSchema,
  ctr: z.number().min(0).max(100).nullable().optional().default(null),
  notes: z.string().trim().max(1000).default(""),
});

export const createCampaignMemorySchema = z.object({
  campaignId: positiveIdSchema,
  postMetricId: optionalPositiveIdSchema,
  signal: memorySignalSchema,
  summary: z
    .string()
    .trim()
    .min(1, "Write a short summary of the lesson.")
    .max(500),
  evidence: z.string().trim().max(1000).default(""),
  confidence: z.number().int().min(0).max(100).default(50),
});

export const setCampaignMemoryStatusSchema = z.object({
  id: positiveIdSchema,
  status: campaignMemoryStatusSchema,
});

/** Native result of the metrics mutation commands: the affected row id. */
export const metricsMutationResultSchema = z
  .object({ id: positiveIdSchema })
  .strict();

/** Address of the Analytics screen (`#/metrics`). See docs/features/navigation.md. */
/**
 * Link params for Analytics. `approvalId` opens Add results with that post
 * picked and needs its campaign. Mirrors `MetricsRouteParams`.
 */
export const metricsRouteSearchSchema = z.union([
  z.object({
    campaignId: optionalRouteId(),
    approvalId: z.undefined().optional(),
  }),
  z.object({
    campaignId: routeId(),
    approvalId: routeId(),
  }),
]);

/** Address of the Analytics screen (`#/metrics`). See docs/features/navigation.md. */
export const metricsRoute = defineRoute<"metrics", MetricsRouteParams>(
  "metrics",
  metricsRouteSearchSchema,
);
