import { z } from "zod";

export const setLaunchOnLoginSchema = z.object({
  enabled: z.boolean(),
});

export const launchOnLoginSettingsSchema = z.object({
  enabled: z.boolean(),
  osEnabled: z.boolean(),
  lastSyncedAt: z.string().nullable(),
  lastError: z.string(),
});
