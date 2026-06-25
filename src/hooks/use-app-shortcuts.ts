import { useEffect } from "react";
import { IS_TAURI } from "@/lib/env";

export function useAppShortcuts(): void {
  useEffect(() => {
    if (!IS_TAURI) return;

    let unregister: (() => Promise<void>) | undefined;

    void (async () => {
      const { register, unregister: unregisterShortcut } =
        await import("@tauri-apps/plugin-global-shortcut");
      await register("CommandOrControl+Shift+L", async () => {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().show();
        await getCurrentWindow().setFocus();
      });
      unregister = () => unregisterShortcut("CommandOrControl+Shift+L");
    })();

    return () => {
      if (unregister) void unregister();
    };
  }, []);
}
