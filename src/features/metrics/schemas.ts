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

export const learningEventTypeSchema = z.enum([
  "metric_recorded",
  "memory_created",
  "memory_archived",
  "memory_restored",
]);

export const recordPostMetricSchema = z.object({
  campaignId: positiveIdSchema,
  approvalId: positiveIdSchema,
  publishAttemptId: optionalPositiveIdSchema,
  measuredAt: z
    .string()
    .trim()
    .max(80)
    .refine((value) => Number.isFinite(Date.parse(value)), {
      message: "Measured time must be a valid date",
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
  summary: z.string().trim().min(1, "Summary is required").max(500),
  evidence: z.string().trim().max(1000).default(""),
  confidence: z.number().int().min(0).max(100).default(50),
});

export const setCampaignMemoryStatusSchema = z.object({
  id: positiveIdSchema,
  status: campaignMemoryStatusSchema,
});
