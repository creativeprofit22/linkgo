import { z } from "zod";

const positiveIdSchema = z.number().int().positive();
const notesSchema = z.string().trim().max(2000).default("");
const optionalUrlOrEmptySchema = z
  .string()
  .trim()
  .max(2000)
  .default("")
  .refine((value) => value === "" || z.url().safeParse(value).success, {
    message: "Use a valid URL or leave it blank",
  });

export const commentThreadStatusSchema = z.enum([
  "drafting",
  "needs_review",
  "changes_requested",
  "approved",
  "rejected",
  "posted",
  "cancelled",
]);

export const commentVariantStatusSchema = z.enum([
  "draft",
  "selected",
  "rejected",
]);

export const commentAuditSeveritySchema = z.enum(["pass", "warning", "block"]);

export const commentAttemptStatusSchema = z.enum(["succeeded", "failed"]);

export const commentVariantInputSchema = z.object({
  body: z.string().trim().min(1).max(1250),
});

export const createCommentThreadSchema = z.object({
  candidateId: positiveIdSchema,
  operatorNotes: notesSchema,
  variants: z.array(commentVariantInputSchema).min(1).max(3),
});

export const updateCommentThreadSchema = z.object({
  id: positiveIdSchema,
  operatorNotes: z.string().trim().max(2000).optional(),
  reviewerNotes: z.string().trim().max(2000).optional(),
});

export const updateCommentVariantSchema = z.object({
  id: positiveIdSchema,
  body: z.string().trim().min(1).max(1250).optional(),
});

export const setCommentVariantStatusSchema = z.object({
  id: positiveIdSchema,
  status: commentVariantStatusSchema,
});

export const setCommentThreadStatusSchema = z.object({
  id: positiveIdSchema,
  status: commentThreadStatusSchema,
  reviewerNotes: z.string().trim().max(2000).optional(),
});

export const recordCommentAttemptSchema = z
  .object({
    commentThreadId: positiveIdSchema,
    status: commentAttemptStatusSchema,
    externalCommentUrl: optionalUrlOrEmptySchema,
    platformCommentId: z.string().trim().max(500).default(""),
    idempotencyKey: z.string().trim().max(200).default(""),
    errorMessage: z.string().trim().max(2000).default(""),
  })
  .superRefine((value, context) => {
    if (
      value.status === "succeeded" &&
      value.externalCommentUrl === "" &&
      value.platformCommentId === ""
    ) {
      context.addIssue({
        code: "custom",
        path: ["externalCommentUrl"],
        message: "Add a comment URL or platform comment ID for posted comments",
      });
    }

    if (value.status === "failed" && value.errorMessage === "") {
      context.addIssue({
        code: "custom",
        path: ["errorMessage"],
        message: "Add an error message for failed comment attempts",
      });
    }
  });
