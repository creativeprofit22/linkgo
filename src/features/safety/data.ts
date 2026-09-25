import { invokeCommand } from "@/lib/tauri";
import {
  errorQueueItemStatusResultSchema,
  globalKillSwitchResultSchema,
  safetyDashboardCampaignIdSchema,
  safetyDashboardSchema,
  safetySettingsSchema,
  setErrorQueueItemStatusSchema,
  setGlobalKillSwitchSchema,
} from "@/features/safety/schemas";
import type {
  ErrorQueueItemStatusResult,
  GlobalKillSwitchResult,
  SafetyDashboard,
  SafetySettings,
  SetErrorQueueItemStatusInput,
  SetGlobalKillSwitchInput,
} from "@/features/safety/types";

/**
 * Reads the singleton safety settings natively (`safety_dashboard.rs`),
 * recreating a missing row in the same transaction.
 */
export async function getSafetySettings(): Promise<SafetySettings> {
  return safetySettingsSchema.parse(
    await invokeCommand("linkgo_safety_settings_get"),
  );
}

/**
 * Turns the global kill switch on or off. The setting and its safety audit
 * row settle natively in one transaction.
 */
export async function setGlobalKillSwitch(
  input: SetGlobalKillSwitchInput,
): Promise<GlobalKillSwitchResult> {
  const parsed = setGlobalKillSwitchSchema.parse(input);
  return globalKillSwitchResultSchema.parse(
    await invokeCommand("linkgo_safety_set_global_kill_switch", {
      input: parsed,
    }),
  );
}

/**
 * Loads the safety dashboard natively: settings, counts and three lists
 * capped at 50 rows, all read from one transaction snapshot.
 */
export async function listSafetyDashboard(
  campaignId?: number,
): Promise<SafetyDashboard> {
  const parsedCampaignId = safetyDashboardCampaignIdSchema.parse(campaignId);
  return safetyDashboardSchema.parse(
    await invokeCommand("linkgo_safety_dashboard_get", {
      input:
        parsedCampaignId === undefined ? {} : { campaignId: parsedCampaignId },
    }),
  );
}

/**
 * Moves an error-queue item through triage. Ownership (campaign not
 * archived), the transition check, the update and its audit row settle
 * natively in one transaction.
 */
export async function setErrorQueueItemStatus(
  input: SetErrorQueueItemStatusInput,
): Promise<ErrorQueueItemStatusResult> {
  const parsed = setErrorQueueItemStatusSchema.parse(input);
  return errorQueueItemStatusResultSchema.parse(
    await invokeCommand("linkgo_safety_set_error_queue_item_status", {
      input: parsed,
    }),
  );
}
