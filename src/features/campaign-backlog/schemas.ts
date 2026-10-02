import { defineRoute, emptyRouteSearch } from "@/lib/navigation/route-contract";
import { z } from "zod";

import { isIanaTimeZone } from "@/features/campaign-backlog/time-zone";
import {
  CAMPAIGN_BACKLOG_OWNER_TYPES,
  CAMPAIGN_BACKLOG_RECURRENCES,
  CAMPAIGN_BACKLOG_STATUSES,
  CAMPAIGN_BACKLOG_WORK_TYPES,
} from "@/features/campaign-backlog/types";

export const CAMPAIGN_BACKLOG_TITLE_MAX_LENGTH = 160;
export const CAMPAIGN_BACKLOG_DETAILS_MAX_LENGTH = 4000;

export const campaignBacklogIdSchema = z.number().int().positive();
export const campaignBacklogWorkTypeSchema = z.enum(
  CAMPAIGN_BACKLOG_WORK_TYPES,
);
export const campaignBacklogOwnerTypeSchema = z.enum(
  CAMPAIGN_BACKLOG_OWNER_TYPES,
);
export const campaignBacklogStatusSchema = z.enum(CAMPAIGN_BACKLOG_STATUSES);
export const campaignBacklogRecurrenceSchema = z.enum(
  CAMPAIGN_BACKLOG_RECURRENCES,
);
export const campaignBacklogViewSchema = z.enum(["open", "history"]);

export const campaignBacklogIsoTimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u,
    "Enter a valid date and time",
  )
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Enter a valid date and time",
  });

const titleSchema = z
  .string()
  .trim()
  .min(1, "Add a title")
  .max(
    CAMPAIGN_BACKLOG_TITLE_MAX_LENGTH,
    `Title must be ${CAMPAIGN_BACKLOG_TITLE_MAX_LENGTH} characters or fewer`,
  );

const detailsSchema = z
  .string()
  .trim()
  .max(
    CAMPAIGN_BACKLOG_DETAILS_MAX_LENGTH,
    `Details must be ${CAMPAIGN_BACKLOG_DETAILS_MAX_LENGTH} characters or fewer`,
  )
  .default("");

export const campaignBacklogFiltersSchema = z.object({
  campaignId: campaignBacklogIdSchema.nullable().default(null),
  owner: z
    .union([z.literal("all"), campaignBacklogOwnerTypeSchema])
    .default("all"),
  view: campaignBacklogViewSchema.default("open"),
});

const recurrenceTimeZoneSchema = z
  .string()
  .max(100, "That time zone name is too long");

function validateRecurrenceTimeZone(
  value: { recurrence: string; recurrenceTimeZone: string },
  context: z.RefinementCtx,
): void {
  if (value.recurrence === "none") {
    if (value.recurrenceTimeZone !== "") {
      context.addIssue({
        code: "custom",
        path: ["recurrenceTimeZone"],
        message: "One-time tasks don't need a time zone",
      });
    }
    return;
  }
  if (!isIanaTimeZone(value.recurrenceTimeZone)) {
    context.addIssue({
      code: "custom",
      path: ["recurrenceTimeZone"],
      message: "Choose a time zone from the list",
    });
  }
}

export const createCampaignBacklogItemSchema = z
  .object({
    campaignId: campaignBacklogIdSchema,
    workType: campaignBacklogWorkTypeSchema,
    title: titleSchema,
    details: detailsSchema,
    ownerType: campaignBacklogOwnerTypeSchema,
    dueAt: campaignBacklogIsoTimestampSchema,
    recurrence: campaignBacklogRecurrenceSchema,
    recurrenceTimeZone: recurrenceTimeZoneSchema,
  })
  .superRefine(validateRecurrenceTimeZone);

export const updateCampaignBacklogItemSchema = z
  .object({
    id: campaignBacklogIdSchema,
    workType: campaignBacklogWorkTypeSchema,
    title: titleSchema,
    details: detailsSchema,
    ownerType: campaignBacklogOwnerTypeSchema,
    dueAt: campaignBacklogIsoTimestampSchema,
    recurrence: campaignBacklogRecurrenceSchema,
    recurrenceTimeZone: recurrenceTimeZoneSchema,
  })
  .superRefine(validateRecurrenceTimeZone);

export const setCampaignBacklogItemStatusSchema = z.object({
  id: campaignBacklogIdSchema,
  status: campaignBacklogStatusSchema,
});

/** Address of the Tasks screen (`#/backlog`). See docs/features/navigation.md. */
export const campaignBacklogRoute = defineRoute("backlog", emptyRouteSearch());
