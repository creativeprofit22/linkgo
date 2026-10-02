import { defineRoute, emptyRouteSearch } from "@/lib/navigation/route-contract";
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

/**
 * Statuses a reviewer may set via `linkgo_approval_set_status`. `scheduled`
 * and `published` are owned by `linkgo_approval_schedule` and
 * `linkgo_approval_record_publish_attempt`; the native command rejects them.
 */
export const reviewApprovalStatusSchema = z.enum([
  "needs_review",
  "changes_requested",
  "approved",
  "rejected",
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

export const setApprovalStatusSchema = z
  .object({
    id: z.number().int().positive(),
    status: reviewApprovalStatusSchema,
    contentRevision: z.number().int().positive().optional(),
    reviewerNotes: z.string().trim().max(1000).optional(),
  })
  .superRefine((input, context) => {
    if (input.status === "approved" && input.contentRevision === undefined) {
      context.addIssue({
        code: "custom",
        path: ["contentRevision"],
        message:
          "Reload the approval and review its current content before approving",
      });
    }
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

/** Max provider/operator failure reason length; the native command enforces it too. */
export const PUBLISH_ERROR_MESSAGE_MAX_CHARS = 1000;

/**
 * Mirrors `validate_record_publish_attempt` in `src-tauri/src/approvals.rs`;
 * keep limits and messages identical.
 */
export const recordPublishAttemptSchema = z
  .object({
    approvalId: z.number().int().positive(),
    scheduleJobId: optionalPositiveIdSchema,
    status: publishAttemptStatusSchema,
    externalPostUrl: z
      .string()
      .trim()
      .max(1000, {
        message: "LinkedIn post URL must be 1000 characters or fewer",
      })
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
    platformPostId: z
      .string()
      .trim()
      .max(200, { message: "Platform post ID must be 200 characters or fewer" })
      .default(""),
    errorMessage: z
      .string()
      .trim()
      .max(PUBLISH_ERROR_MESSAGE_MAX_CHARS, {
        message: "Failure reason must be 1000 characters or fewer",
      })
      .default(""),
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

/** Address of the Approvals screen (`#/approvals`). See docs/features/navigation.md. */
export const approvalsRoute = defineRoute("approvals", emptyRouteSearch());
