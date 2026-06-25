import { IS_TAURI } from "@/lib/env";

export interface LinkgoWindowOptions {
  title: string;
  url: string;
  width: number;
  height: number;
  resizable?: boolean;
  maximizable?: boolean;
  minimizable?: boolean;
  decorations?: boolean;
  transparent?: boolean;
  shadow?: boolean;
  parent?: string;
}

export async function createWindow(
  label: string,
  options: LinkgoWindowOptions,
): Promise<void> {
  if (!IS_TAURI) return;
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }

  new WebviewWindow(label, {
    ...options,
    center: true,
  });
}
