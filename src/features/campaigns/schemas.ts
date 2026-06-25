import { z } from "zod";

export const campaignStatusSchema = z.enum([
  "draft",
  "active",
  "paused",
  "archived",
]);

export const campaignKeywordSourceSchema = z.enum([
  "manual",
  "generated",
  "learned",
]);

const keywordListSchema = z
  .array(z.string().trim().min(1).max(80))
  .max(30)
  .default([]);

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  product: z.string().trim().max(500).default(""),
  audience: z.string().trim().max(500).default(""),
  voice: z.string().trim().max(500).default(""),
  tone: z.string().trim().max(240).default(""),
  autoPilot: z.boolean().default(false),
  dailyPostLimit: z.number().int().min(0).max(10).default(1),
  dailyCommentLimit: z.number().int().min(0).max(50).default(5),
  keywords: keywordListSchema,
});

export const updateCampaignSchema = createCampaignSchema.partial().extend({
  id: z.number().int().positive(),
  status: campaignStatusSchema.optional(),
});

export const campaignKeywordSchema = z.object({
  keyword: z.string().trim().min(1).max(80),
  source: campaignKeywordSourceSchema.default("manual"),
});
