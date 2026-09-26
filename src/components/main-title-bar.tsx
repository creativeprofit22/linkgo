import { Settings } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { TitleBar } from "@/components/title-bar";
import { Button } from "@/components/ui/button";
import { IS_TAURI } from "@/lib/env";

export function MainTitleBar(): React.ReactNode {
  const handleOpenSettings = async (): Promise<void> => {
    if (!IS_TAURI) return;
    const { openSettingsWindow } = await import("@/lib/window");
    await openSettingsWindow();
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
