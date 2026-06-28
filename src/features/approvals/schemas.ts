import { z } from "zod";

export const approvalStatusSchema = z.enum([
  "needs_review",
  "changes_requested",
  "approved",
  "rejected",
  "scheduled",
  "published",
  "cancelled",
]);

export const scheduleJobStatusSchema = z.enum([
  "scheduled",
  "cancelled",
  "completed",
  "failed",
]);

export const publishAttemptStatusSchema = z.enum(["succeeded", "failed"]);

const optionalTextSchema = (max: number): z.ZodDefault<z.ZodString> =>
  z.string().trim().max(max).default("");

const optionalPositiveIdSchema = z.number().int().positive().optional();

export const createApprovalSchema = z.object({
  draftId: z.number().int().positive(),
  reviewerNotes: optionalTextSchema(1000),
});

export const setApprovalStatusSchema = z.object({
  id: z.number().int().positive(),
  status: approvalStatusSchema,
  reviewerNotes: z.string().trim().max(1000).optional(),
});

export const scheduleApprovalSchema = z.object({
  approvalId: z.number().int().positive(),
  scheduledFor: z
    .string()
    .trim()
    .max(80)
    .refine((value) => Number.isFinite(Date.parse(value)), {
      message: "Scheduled time must be a valid date",
    }),
  timezone: z.string().trim().max(80).default("local"),
});

export const cancelScheduleSchema = z.object({
  id: z.number().int().positive(),
});

export const assertApprovalCanPublishViaLinkedInSchema = z.object({
  approvalId: z.number().int().positive(),
  scheduleJobId: optionalPositiveIdSchema,
});

export const recordPublishAttemptSchema = z
  .object({
    approvalId: z.number().int().positive(),
    scheduleJobId: optionalPositiveIdSchema,
    status: publishAttemptStatusSchema,
    externalPostUrl: z
      .string()
      .trim()
      .max(1000)
      .default("")
      .refine(
        (value) =>
          value === "" ||
          value.startsWith("https://www.linkedin.com/") ||
          value.startsWith("https://linkedin.com/"),
        {
          message:
            "LinkedIn post URL must start with https://www.linkedin.com/",
        },
      ),
    platformPostId: optionalTextSchema(200),
    errorMessage: optionalTextSchema(1000),
  })
  .superRefine((value, context) => {
    if (value.status === "failed" && value.errorMessage === "") {
      context.addIssue({
        code: "custom",
        path: ["errorMessage"],
        message: "Failure reason is required for failed attempts",
      });
    }

    if (
      value.status === "succeeded" &&
      value.externalPostUrl === "" &&
      value.platformPostId === ""
    ) {
      context.addIssue({
        code: "custom",
        path: ["externalPostUrl"],
        message: "LinkedIn URL or platform post ID is required for success",
      });
    }
  });
