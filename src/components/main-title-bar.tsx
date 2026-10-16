import { Settings } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { TitleBar } from "@/components/title-bar";
import { Button } from "@/components/ui/button";
import { settingsRoute } from "@/features/settings/schemas";
import { navigateTo } from "@/lib/navigation/use-hash-navigation";

export function MainTitleBar(): React.ReactNode {
  return (
    <TitleBar
      title="Linkgo"
      rightActions={
        <div className="mr-1 flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="pointer-coarse:size-11"
            onClick={() => navigateTo(settingsRoute)}
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
