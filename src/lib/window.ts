import { IS_TAURI } from "@/lib/env";
import { invokeCommand } from "@/lib/tauri";

/**
 * Opens (or focuses) the Settings window. Window creation is native: the
 * renderer has no permission to create webviews or choose their URLs.
 */
export async function openSettingsWindow(): Promise<void> {
  if (!IS_TAURI) return;
  await invokeCommand("linkgo_window_open_settings");
}
