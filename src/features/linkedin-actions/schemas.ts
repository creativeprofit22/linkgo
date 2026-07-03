import { z } from "zod";

export const linkedInPublishPostInputSchema = z.object({
  approvalId: z.number().int().positive(),
  scheduleJobId: z.number().int().positive().optional(),
  commentary: z.string().trim().min(1).max(3000),
  idempotencyKey: z.string().trim().min(1).max(200),
});

export const linkedInPublishPostResultSchema = z.object({
  platformPostId: z.string().trim().min(1),
  externalPostUrl: z.string().trim().default(""),
});

export const linkedInPublishCommentInputSchema = z.object({
  commentThreadId: z.number().int().positive(),
  commentary: z.string().trim().min(1).max(1250),
  targetUrn: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().trim().min(1).max(200),
});

export const linkedInPublishCommentResultSchema = z.object({
  platformCommentId: z.string().trim().min(1),
  platformCommentUrn: z.string().trim().default(""),
  externalCommentUrl: z.string().trim().default(""),
});
