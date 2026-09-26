import { z } from "zod";

export const linkedInPublishPostInputSchema = z.object({
  approvalId: z.number().int().positive(),
  scheduleJobId: z.number().int().positive().optional(),
  commentary: z.string().trim().min(1).max(3000),
  idempotencyKey: z.string().trim().min(1).max(200),
});

export const linkedInPublishCommentInputSchema = z.object({
  commentThreadId: z.number().int().positive(),
  commentary: z.string().trim().min(1).max(1250),
  targetUrn: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().trim().min(1).max(200),
});

const executionIdSchema = z.number().int().positive();

export const executionOutcomeSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("succeeded"),
    executionId: executionIdSchema,
    platformId: z.string(),
    externalUrl: z.string(),
  }),
  z.object({
    status: z.literal("failed"),
    executionId: executionIdSchema,
    message: z.string(),
  }),
  z.object({
    status: z.literal("outcomeUnknown"),
    executionId: executionIdSchema,
    message: z.string(),
  }),
  z.object({
    status: z.literal("blocked"),
    message: z.string(),
  }),
  z.object({
    status: z.literal("staleOwner"),
    executionId: executionIdSchema,
    message: z.string(),
  }),
]);
