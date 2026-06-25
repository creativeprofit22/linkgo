import { z } from "zod";

export const candidateStatusSchema = z.enum([
  "new",
  "shortlisted",
  "rejected",
  "drafted",
]);

export const candidatePlatformSchema = z.enum(["linkedin"]);

export const dedupeKeyTypeSchema = z.enum(["normalized_url", "content_hash"]);

export const createCandidateSchema = z.object({
  campaignId: z.number().int().positive(),
  url: z.string().trim().min(1, "LinkedIn post URL is required").max(1000),
  content: z.string().trim().min(1, "Post text is required").max(3000),
  authorName: z.string().trim().max(160).default(""),
  authorProfileUrl: z.string().trim().max(1000).default(""),
  postedAt: z.string().trim().max(80).nullable().optional().default(null),
  sourceKeyword: z.string().trim().max(80).default(""),
  relevanceScore: z
    .number()
    .int()
    .min(0)
    .max(100)
    .nullable()
    .optional()
    .default(null),
  scoreReason: z.string().trim().max(500).default(""),
  notes: z.string().trim().max(1000).default(""),
});

export const updateCandidateSchema = z.object({
  id: z.number().int().positive(),
  status: candidateStatusSchema.optional(),
  relevanceScore: z.number().int().min(0).max(100).nullable().optional(),
  scoreReason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
});
