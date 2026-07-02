import { z } from "zod";

export const schedulerSettingsPayloadSchema = z.object({
  enabled: z.boolean(),
  pollIntervalSeconds: z.number().int().min(15).max(3600),
  maxJobsPerTick: z.number().int().min(1).max(10),
  retryBackoffMinutes: z.number().int().min(1).max(1440),
  updatedAt: z.string(),
});

export const schedulerStatusPayloadSchema = z.object({
  enabled: z.boolean(),
  running: z.boolean(),
  runnerId: z.string().nullable().optional().default(null),
  settings: schedulerSettingsPayloadSchema,
});

export const schedulerTickResultSchema = z.object({
  claimed: z.number().int().min(0).default(0),
  published: z.number().int().min(0).default(0),
  retryScheduled: z.number().int().min(0).default(0),
  failed: z.number().int().min(0).default(0),
  blocked: z.number().int().min(0).default(0),
});
