import { z } from "zod";

export const draftStatusSchema = z.enum([
  "drafting",
  "needs_revision",
  "ready_for_review",
  "archived",
]);

export const draftVariantStatusSchema = z.enum([
  "draft",
  "selected",
  "rejected",
]);

export const draftAuditSeveritySchema = z.enum(["pass", "warning", "block"]);

export const draftVariantInputSchema = z.object({
  hook: z.string().trim().max(500).default(""),
  body: z.string().trim().max(3000).default(""),
  cta: z.string().trim().max(500).default(""),
  hashtags: z.string().trim().max(300).default(""),
});

export const createDraftSchema = z.object({
  candidateId: z.number().int().positive(),
  angle: z.string().trim().max(240).default(""),
  notes: z.string().trim().max(1000).default(""),
  variants: z.array(draftVariantInputSchema).min(1).max(5),
});

export const updateDraftSchema = z.object({
  id: z.number().int().positive(),
  angle: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(1000).optional(),
  status: draftStatusSchema.optional(),
});

export const updateDraftVariantSchema = z.object({
  id: z.number().int().positive(),
  hook: z.string().trim().max(500).optional(),
  body: z.string().trim().max(3000).optional(),
  cta: z.string().trim().max(500).optional(),
  hashtags: z.string().trim().max(300).optional(),
});

export const setDraftVariantStatusSchema = z.object({
  id: z.number().int().positive(),
  status: draftVariantStatusSchema,
});
