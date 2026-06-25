import { Settings } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { TitleBar } from "@/components/title-bar";
import { Button } from "@/components/ui/button";
import { IS_TAURI } from "@/lib/env";

export function MainTitleBar(): React.ReactNode {
  const handleOpenSettings = async (): Promise<void> => {
    if (!IS_TAURI) return;
    const { createWindow } = await import("@/lib/window");
    await createWindow("settings", {
      title: "Settings",
      url: "/settings",
      width: 640,
      height: 520,
      resizable: true,
      maximizable: true,
      minimizable: false,
      decorations: false,
      transparent: true,
      shadow: false,
      parent: "main",
    });
  };

  return (
    <TitleBar
      title="Linkgo"
      rightActions={
        <div className="mr-1 flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleOpenSettings}
            aria-label="Open settings"
          >
            <Settings className="size-4" />
          </Button>
          <ModeToggle />
        </div>
      }
    />
  );
}
