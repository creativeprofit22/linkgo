import { IS_TAURI, IS_TEST } from "@/lib/env";
import { invokeCommand } from "@/lib/tauri";
import {
  appSettingsRowSchema,
  launchOnLoginSettingsSchema,
  setLaunchOnLoginSchema,
} from "@/features/settings/schemas";
import type {
  AppSettingsRow,
  LaunchOnLoginSettings,
  SetLaunchOnLoginInput,
} from "@/features/settings/types";

interface AutostartApi {
  isEnabled: () => Promise<boolean>;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

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

function getSafeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

async function getAutostartApi(): Promise<AutostartApi> {
  const injected = getInjectedInvoke();
  if (injected) {
    return {
      isEnabled: async () =>
        Boolean(await injected("plugin:autostart|is_enabled")),
      enable: async () => {
        await injected("plugin:autostart|enable");
      },
      disable: async () => {
        await injected("plugin:autostart|disable");
      },
    };
  }

  if (IS_TAURI) {
    const autostart = await import("@tauri-apps/plugin-autostart");
    return autostart;
  }

  return {
    isEnabled: async () => false,
    enable: async () => {},
    disable: async () => {},
  };
}

function toDisabledSettings(): LaunchOnLoginSettings {
  return launchOnLoginSettingsSchema.parse({
    enabled: false,
    osEnabled: false,
    lastSyncedAt: null,
    lastError: "",
  });
}

function toSettings(
  row: AppSettingsRow,
  osEnabled: boolean,
): LaunchOnLoginSettings {
  return launchOnLoginSettingsSchema.parse({
    enabled: osEnabled,
    osEnabled,
    lastSyncedAt: row.launch_on_login_last_synced_at,
    lastError: row.launch_on_login_last_error,
  });
}

/**
 * Persists the OS autostart state in the singleton settings row natively
 * (`src-tauri/src/settings.rs`). The OS plugin call happens before this, never
 * inside the database transaction. `lastError: undefined` keeps the stored
 * error.
 */
async function syncLaunchOnLoginMirror(
  osEnabled: boolean,
  lastError: string | undefined,
): Promise<AppSettingsRow> {
  const row = await invokeCommand("linkgo_settings_launch_on_login_sync", {
    input: { osEnabled, ...(lastError === undefined ? {} : { lastError }) },
  });
  return appSettingsRowSchema.parse(row);
}

async function storeLaunchOnLoginError(error: unknown): Promise<void> {
  await invokeCommand<null>("linkgo_settings_launch_on_login_error_record", {
    input: { message: getSafeErrorMessage(error) },
  });
}

export async function getLaunchOnLoginSettings(): Promise<LaunchOnLoginSettings> {
  if (!IS_TAURI && !IS_TEST) return toDisabledSettings();

  const autostart = await getAutostartApi();
  const osEnabled = await autostart.isEnabled();
  const syncedRow = await syncLaunchOnLoginMirror(osEnabled, undefined);
  return toSettings(syncedRow, osEnabled);
}

export async function setLaunchOnLogin(
  input: SetLaunchOnLoginInput,
): Promise<LaunchOnLoginSettings> {
  const parsed = setLaunchOnLoginSchema.parse(input);
  if (!IS_TAURI && !IS_TEST) return toDisabledSettings();

  const autostart = await getAutostartApi();
  try {
    if (parsed.enabled) {
      await autostart.enable();
    } else {
      await autostart.disable();
    }
  } catch (error) {
    await storeLaunchOnLoginError(error);
    throw error;
  }

  try {
    const osEnabled = await autostart.isEnabled();
    const syncedRow = await syncLaunchOnLoginMirror(osEnabled, "");
    return toSettings(syncedRow, osEnabled);
  } catch (error) {
    await storeLaunchOnLoginError(error);
    throw error;
  }
}
