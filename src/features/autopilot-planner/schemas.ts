import { defineRoute, emptyRouteSearch } from "@/lib/navigation/route-contract";
import { z } from "zod";

export const autopilotPlannerSettingsPayloadSchema = z.object({
  enabled: z.boolean(),
  pollIntervalMinutes: z.number().int().min(5).max(1440),
  maxBatchesPerTick: z.number().int().min(1).max(20),
  updatedAt: z.string(),
});

export const autopilotPlannerStatusPayloadSchema = z.object({
  enabled: z.boolean(),
  running: z.boolean(),
  runnerId: z.string().nullable().optional().default(null),
  settings: autopilotPlannerSettingsPayloadSchema,
});

export const autopilotPlannerTickResultSchema = z.object({
  claimed: z.number().int().min(0),
  planned: z.number().int().min(0),
  skipped: z.number().int().min(0),
  failed: z.number().int().min(0),
  blocked: z.number().int().min(0),
});

/** Address of the Autopilot screen (`#/autopilot`). See docs/features/navigation.md. */
export const autopilotPlannerRoute = defineRoute(
  "autopilot",
  emptyRouteSearch(),
);
