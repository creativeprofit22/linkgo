import { z } from "zod";

export const RECONCILE_CONFIRMATION = "RECONCILE";

const positiveIdSchema = z.number().int().positive();

export const openPublishExecutionSchema = z
  .object({
    id: positiveIdSchema,
    kind: z.enum(["post", "comment"]),
    subjectId: positiveIdSchema,
    campaignId: positiveIdSchema,
    campaignName: z.string(),
    scheduleJobId: positiveIdSchema.nullable(),
    caller: z.enum(["manual", "scheduler"]),
    status: z.enum(["reserved", "in_flight", "outcome_unknown"]),
    fence: positiveIdSchema,
    remoteOutcome: z.enum(["", "created", "rejected", "ambiguous"]),
    remoteStatusCode: z.number().int().nullable(),
    errorMessage: z.string(),
    reservedAt: z.string(),
    sentAt: z.string().nullable(),
    updatedAt: z.string(),
  })
  .strict();

export const openPublishExecutionListSchema = z.array(
  openPublishExecutionSchema,
);

export const reconcilePublishExecutionInputSchema = z
  .object({
    executionId: positiveIdSchema,
    fence: positiveIdSchema,
    resolution: z.enum(["posted", "not_posted"]),
    externalUrl: z.string().trim().max(2048).optional(),
    note: z.string().trim().max(1000).optional(),
    confirmation: z.literal(RECONCILE_CONFIRMATION, {
      error: `Type ${RECONCILE_CONFIRMATION} to confirm`,
    }),
  })
  .superRefine((input, context) => {
    if (input.resolution === "posted" && !input.externalUrl) {
      context.addIssue({
        code: "custom",
        path: ["externalUrl"],
        message: "Paste the LinkedIn URL or URN of the published item",
      });
    }
  });

export const reconcilePublishExecutionResultSchema = z
  .object({
    executionId: positiveIdSchema,
    status: z.enum(["reconciled_posted", "reconciled_not_posted"]),
  })
  .strict();
