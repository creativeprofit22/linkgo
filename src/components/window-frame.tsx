import { BrowserPreviewBanner } from "@/components/browser-preview-banner";
import { ThemeProvider } from "@/components/theme-provider";
import { IS_TAURI } from "@/lib/env";
import { cn } from "@/lib/utils";
import { useEffect, useState, type ReactNode } from "react";

type WindowFrameProps = {
  titleBar: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function WindowFrame({
  titleBar,
  children,
  className,
  contentClassName,
}: WindowFrameProps): ReactNode {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!IS_TAURI) return;

    let cleanup: (() => void) | undefined;

    void (async () => {
      const { getCurrentWebviewWindow } =
        await import("@tauri-apps/api/webviewWindow");
      const appWindow = getCurrentWebviewWindow();
      setIsMaximized(await appWindow.isMaximized());
      const unlistenResize = appWindow.onResized(async () => {
        setIsMaximized(await appWindow.isMaximized());
      });
      cleanup = () => {
        void unlistenResize.then((fn) => fn());
      };
    })();

    return () => cleanup?.();
  }, []);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="linkgo-ui-theme">
      <div
        className={cn(
          "linkgo-shell bg-background flex h-screen w-screen flex-col overflow-hidden",
          isMaximized ? "" : "border-border/70 rounded-lg border shadow-2xl",
          className,
        )}
      >
        {titleBar}
        <BrowserPreviewBanner />
        <main className={cn("min-h-0 flex-1", contentClassName)}>
          {children}
        </main>
      </div>
    </ThemeProvider>
  );
}
