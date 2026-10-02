import { defineRoute, emptyRouteSearch } from "@/lib/navigation/route-contract";
import { z } from "zod";

export const contentCalendarPurposeSchema = z.enum([
  "reach",
  "trust",
  "proof",
  "conversion",
  "community",
]);

export const contentCalendarFormatSchema = z.enum([
  "text",
  "image",
  "carousel",
  "document",
  "video",
  "poll",
  "event",
]);

export const contentCalendarSlotStatusSchema = z.enum(["planned", "archived"]);

const idSchema = z.number().int().positive();

const slotForSchema = z
  .string()
  .trim()
  .max(80)
  .refine((value) => Number.isFinite(Date.parse(value)), {
    message: "Pick a date and time for this post.",
  });

const requiredPlanningTextSchema = z.string().trim().min(1).max(500);
const optionalNotesSchema = z.string().trim().max(1000).default("");
const timezoneSchema = z.string().trim().max(80).default("local");

export const createContentCalendarSlotSchema = z.object({
  approvalId: idSchema,
  purpose: contentCalendarPurposeSchema,
  slotFor: slotForSchema,
  timezone: timezoneSchema,
  format: contentCalendarFormatSchema,
  angle: requiredPlanningTextSchema,
  visualDirection: requiredPlanningTextSchema,
  cta: requiredPlanningTextSchema,
  notes: optionalNotesSchema,
});

export const updateContentCalendarSlotSchema = z.object({
  id: idSchema,
  purpose: contentCalendarPurposeSchema,
  slotFor: slotForSchema,
  timezone: timezoneSchema,
  format: contentCalendarFormatSchema,
  angle: requiredPlanningTextSchema,
  visualDirection: requiredPlanningTextSchema,
  cta: requiredPlanningTextSchema,
  notes: optionalNotesSchema,
});

export const archiveContentCalendarSlotSchema = z.object({
  id: idSchema,
});

export const scheduleContentCalendarSlotSchema = z.object({
  id: idSchema,
});

/** Address of the Calendar screen (`#/calendar`). See docs/features/navigation.md. */
export const contentCalendarRoute = defineRoute("calendar", emptyRouteSearch());
