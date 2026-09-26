import { IS_TEST, isBrowserPreview } from "@/lib/env";
import {
  DesktopRequiredError,
  invokeCommand as invokeNativeCommand,
  toNativeCommandError,
} from "@/lib/tauri";
import {
  schedulerDashboardCampaignIdSchema,
  schedulerDashboardSchema,
  schedulerStatusPayloadSchema,
  schedulerTickResultSchema,
} from "@/features/scheduler/schemas";
import type {
  SchedulerDashboard,
  SchedulerStatusPayload,
  SchedulerTickResult,
} from "@/features/scheduler/types";

type InvokeFn = (cmd: string, args?: unknown) => Promise<unknown>;

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

async function invokeCommand(cmd: string): Promise<unknown> {
  const injected = getInjectedInvoke();
  if (injected) {
    try {
      return await injected(cmd);
    } catch (error: unknown) {
      throw toNativeCommandError(error);
    }
  }
  if (isBrowserPreview()) throw new DesktopRequiredError(cmd);
  if (IS_TEST) return null;
  return invokeNativeCommand(cmd);
}

const stoppedStatus: SchedulerStatusPayload = {
  enabled: false,
  running: false,
  runnerId: null,
  settings: {
    enabled: false,
    pollIntervalSeconds: 60,
    maxJobsPerTick: 1,
    retryBackoffMinutes: 15,
    updatedAt: "",
  },
};

export async function getSchedulerStatus(): Promise<SchedulerStatusPayload> {
  const result = await invokeCommand("linkgo_scheduler_status");
  if (result === null && IS_TEST) return stoppedStatus;
  return schedulerStatusPayloadSchema.parse(result);
}

export async function startScheduler(): Promise<SchedulerStatusPayload> {
  const result = await invokeCommand("linkgo_scheduler_start");
  if (result === null && IS_TEST)
    return { ...stoppedStatus, enabled: true, running: true };
  return schedulerStatusPayloadSchema.parse(result);
}

export async function stopScheduler(): Promise<SchedulerStatusPayload> {
  const result = await invokeCommand("linkgo_scheduler_stop");
  if (result === null && IS_TEST) return stoppedStatus;
  return schedulerStatusPayloadSchema.parse(result);
}

export async function runSchedulerTick(): Promise<SchedulerTickResult> {
  const result = await invokeCommand("linkgo_scheduler_tick");
  if (result === null && IS_TEST) {
    return {
      claimed: 0,
      published: 0,
      retryScheduled: 0,
      failed: 0,
      blocked: 0,
    };
  }
  return schedulerTickResultSchema.parse(result);
}

/**
 * Reads the scheduler dashboard through one native snapshot. The native
 * command recreates a missing settings row and caps due jobs (20), events
 * (50) and scheduled publish attempts (25).
 */
export async function listSchedulerDashboard(
  campaignId?: number,
): Promise<SchedulerDashboard> {
  const parsedCampaignId = schedulerDashboardCampaignIdSchema.parse(campaignId);
  return schedulerDashboardSchema.parse(
    await invokeNativeCommand("linkgo_scheduler_dashboard_get", {
      input:
        parsedCampaignId === undefined ? {} : { campaignId: parsedCampaignId },
    }),
  );
}

if (IS_TEST && typeof window !== "undefined") {
  (
    window as unknown as {
      __LINKGO_SCHEDULER_TEST_API__?: {
        getSchedulerStatus: typeof getSchedulerStatus;
        startScheduler: typeof startScheduler;
        stopScheduler: typeof stopScheduler;
        runSchedulerTick: typeof runSchedulerTick;
      };
    }
  ).__LINKGO_SCHEDULER_TEST_API__ = {
    getSchedulerStatus,
    startScheduler,
    stopScheduler,
    runSchedulerTick,
  };
}
