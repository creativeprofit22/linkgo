import { Maximize2, Minimize2, Minus, X } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { IS_TAURI } from "@/lib/env";
import { cn } from "@/lib/utils";

interface TitleBarProps {
  title?: string;
  showMinimize?: boolean;
  showMaximize?: boolean;
  showClose?: boolean;
  leftActions?: ReactNode;
  rightActions?: ReactNode;
}

async function getAppWindow() {
  if (!IS_TAURI) return null;
  const { getCurrentWebviewWindow } =
    await import("@tauri-apps/api/webviewWindow");
  return getCurrentWebviewWindow();
}

export function TitleBar({
  title,
  showMinimize = true,
  showMaximize = true,
  showClose = true,
  leftActions,
  rightActions,
}: TitleBarProps): ReactNode {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!showMaximize || !IS_TAURI) return;

    let cleanup: (() => void) | undefined;

    void (async () => {
      const appWindow = await getAppWindow();
      if (!appWindow) return;
      setIsMaximized(await appWindow.isMaximized());
      const unlisten = appWindow.onResized(async () => {
        setIsMaximized(await appWindow.isMaximized());
      });
      cleanup = () => {
        void unlisten.then((fn) => fn());
      };
    })();

    return () => cleanup?.();
  }, [showMaximize]);

  const handleMinimize = useCallback(async () => {
    const appWindow = await getAppWindow();
    await appWindow?.minimize();
  }, []);

  const handleToggleMaximize = useCallback(async () => {
    const appWindow = await getAppWindow();
    await appWindow?.toggleMaximize();
  }, []);

  const handleClose = useCallback(async () => {
    const appWindow = await getAppWindow();
    await appWindow?.close();
  }, []);

  return (
    <div
      className={cn(
        "border-border/60 bg-background/85 flex h-9 items-center justify-between border-b backdrop-blur select-none",
        showMaximize && isMaximized ? "" : "rounded-t-lg",
      )}
    >
      <div data-tauri-drag-region className="flex grow items-center gap-2 pl-3">
        <div className="bg-linkgo-blue h-2.5 w-2.5 rounded-full shadow-[0_0_14px_color-mix(in_oklch,var(--linkgo-blue)_75%,transparent)]" />
        {title && (
          <span className="text-sm font-semibold tracking-tight">{title}</span>
        )}
        {leftActions}
      </div>
      <div className="flex items-center">
        {rightActions}
        {showMinimize && (
          <button
            onClick={handleMinimize}
            className="title-bar-control"
            aria-label="Minimize"
            tabIndex={-1}
          >
            <Minus className="size-4" />
          </button>
        )}
        {showMaximize && (
          <button
            onClick={handleToggleMaximize}
            className="title-bar-control"
            aria-label={isMaximized ? "Restore" : "Maximize"}
            tabIndex={-1}
          >
            {isMaximized ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </button>
        )}
        {showClose && (
          <button
            onClick={handleClose}
            className="title-bar-control hover:bg-destructive hover:text-destructive-foreground"
            aria-label="Close"
            tabIndex={-1}
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
