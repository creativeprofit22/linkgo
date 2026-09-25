import { z } from "zod";

export const setLaunchOnLoginSchema = z.object({
  enabled: z.boolean(),
});

/** Native `linkgo_settings_launch_on_login_sync` result row. */
export const appSettingsRowSchema = z.object({
  id: z.literal(1),
  launch_on_login_enabled: z.number().int().min(0).max(1),
  launch_on_login_last_synced_at: z.string().nullable(),
  launch_on_login_last_error: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const launchOnLoginSettingsSchema = z.object({
  enabled: z.boolean(),
  osEnabled: z.boolean(),
  lastSyncedAt: z.string().nullable(),
  lastError: z.string(),
});
