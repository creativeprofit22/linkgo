import { z } from "zod";
import { autopilotPlannerDashboardSchema } from "@/features/autopilot-planner/record-schemas";
import { IS_TEST, isBrowserPreview } from "@/lib/env";
import {
  DesktopRequiredError,
  invokeCommand,
  toNativeCommandError,
} from "@/lib/tauri";
import {
  autopilotPlannerStatusPayloadSchema,
  autopilotPlannerTickResultSchema,
} from "@/features/autopilot-planner/schemas";
import type {
  AutopilotPlannerDashboard,
  AutopilotPlannerStatusPayload,
  AutopilotPlannerTickResult,
} from "@/features/autopilot-planner/types";

type InvokeFn = (command: string, args?: unknown) => Promise<unknown>;

interface TauriWindowLike {
  __TAURI__?: { core?: { invoke?: unknown } };
  __TAURI_INTERNALS__?: { invoke?: unknown };
}

function isInvoke(candidate: unknown): candidate is InvokeFn {
  return typeof candidate === "function";
}

function getInjectedInvoke(): InvokeFn | null {
  if (!IS_TEST || typeof window === "undefined") return null;
  const tauriWindow = window as unknown as TauriWindowLike;
  const candidate =
    tauriWindow.__TAURI_INTERNALS__?.invoke ??
    tauriWindow.__TAURI__?.core?.invoke;
  return isInvoke(candidate) ? candidate : null;
}

async function invokePlannerCommand(command: string): Promise<unknown> {
  const injected = getInjectedInvoke();
  if (injected) {
    try {
      return await injected(command);
    } catch (error: unknown) {
      throw toNativeCommandError(error);
    }
  }
  if (isBrowserPreview()) throw new DesktopRequiredError(command);
  if (IS_TEST) return null;
  return invokeCommand(command);
}

const stoppedStatus: AutopilotPlannerStatusPayload = {
  enabled: false,
  running: false,
  runnerId: null,
  settings: {
    enabled: false,
    pollIntervalMinutes: 60,
    maxBatchesPerTick: 3,
    updatedAt: "",
  },
};

export async function getAutopilotPlannerStatus(): Promise<AutopilotPlannerStatusPayload> {
  const result = await invokePlannerCommand("linkgo_autopilot_planner_status");
  if (result === null && IS_TEST) return stoppedStatus;
  return autopilotPlannerStatusPayloadSchema.parse(result);
}

export async function startAutopilotPlanner(): Promise<AutopilotPlannerStatusPayload> {
  const result = await invokePlannerCommand("linkgo_autopilot_planner_start");
  if (result === null && IS_TEST) {
    return {
      ...stoppedStatus,
      enabled: true,
      running: true,
      runnerId: "test-autopilot",
      settings: { ...stoppedStatus.settings, enabled: true },
    };
  }
  return autopilotPlannerStatusPayloadSchema.parse(result);
}

export async function stopAutopilotPlanner(): Promise<AutopilotPlannerStatusPayload> {
  const result = await invokePlannerCommand("linkgo_autopilot_planner_stop");
  if (result === null && IS_TEST) return stoppedStatus;
  return autopilotPlannerStatusPayloadSchema.parse(result);
}

export async function runAutopilotPlannerTick(): Promise<AutopilotPlannerTickResult> {
  const result = await invokePlannerCommand("linkgo_autopilot_planner_tick");
  if (result === null && IS_TEST) {
    return { claimed: 0, planned: 0, skipped: 0, failed: 0, blocked: 0 };
  }
  return autopilotPlannerTickResultSchema.parse(result);
}

/**
 * Planner dashboard read natively (`planning_reads.rs`) from one snapshot:
 * summary counts, 30 recent plans, 50 recent events and the kill switch.
 */
export async function listAutopilotPlannerDashboard(
  campaignId?: number,
): Promise<AutopilotPlannerDashboard> {
  const parsedCampaignId = z
    .number()
    .int()
    .positive()
    .optional()
    .parse(campaignId);
  return autopilotPlannerDashboardSchema.parse(
    await invokeCommand("linkgo_autopilot_planner_dashboard", {
      input:
        parsedCampaignId === undefined ? {} : { campaignId: parsedCampaignId },
    }),
  );
}
