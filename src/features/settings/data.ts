import { getDb } from "@/lib/db";
import { IS_TAURI, IS_TEST } from "@/lib/env";
import {
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

async function ensureAppSettingsRow(): Promise<AppSettingsRow> {
  const db = await getDb();
  await db.execute(`INSERT OR IGNORE INTO app_settings (id) VALUES (1)`);
  const rows = await db.select<AppSettingsRow[]>(
    `SELECT * FROM app_settings WHERE id = 1 LIMIT 1`,
  );
  const settings = rows[0];
  if (settings === undefined) throw new Error("App settings were not found");
  return settings;
}

async function updateLaunchOnLoginMirror(
  enabled: boolean,
  lastError: string,
): Promise<AppSettingsRow> {
  const db = await getDb();
  await db.execute(
    `UPDATE app_settings
      SET launch_on_login_enabled = $1,
        launch_on_login_last_synced_at = $2,
        launch_on_login_last_error = $3,
        updated_at = $2
      WHERE id = 1`,
    [enabled ? 1 : 0, new Date().toISOString(), lastError],
  );
  return ensureAppSettingsRow();
}

async function storeLaunchOnLoginError(error: unknown): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE app_settings
      SET launch_on_login_last_error = $1,
        updated_at = $2
      WHERE id = 1`,
    [getSafeErrorMessage(error), new Date().toISOString()],
  );
}

export async function getLaunchOnLoginSettings(): Promise<LaunchOnLoginSettings> {
  if (!IS_TAURI && !IS_TEST) return toDisabledSettings();

  const row = await ensureAppSettingsRow();
  const autostart = await getAutostartApi();
  const osEnabled = await autostart.isEnabled();
  const syncedRow = await updateLaunchOnLoginMirror(
    osEnabled,
    row.launch_on_login_last_error,
  );
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
    const syncedRow = await updateLaunchOnLoginMirror(osEnabled, "");
    return toSettings(syncedRow, osEnabled);
  } catch (error) {
    await storeLaunchOnLoginError(error);
    throw error;
  }
}
