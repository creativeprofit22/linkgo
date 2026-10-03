import { Lightbulb, Rocket } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { findFirstIdeaHref } from "@/features/setup/data";
import { useSetupChecklist } from "@/features/setup/hooks/use-setup-checklist";
import { setupRoute } from "@/features/setup/schemas";
import { formatRouteHash } from "@/lib/navigation/route-contract";
import { navigateTo } from "@/lib/navigation/use-hash-navigation";
import { cn } from "@/lib/utils";

const launcherClassName =
  "flex w-auto shrink-0 items-center gap-2 rounded-xl border p-2 text-left text-sm font-medium transition-colors sm:w-full sm:gap-3 sm:p-3";

/**
 * Sidebar entry for first-run setup: shows progress while setup is open,
 * offers "Resume setup" after it was hidden, and disappears once complete.
 */
export function SetupLauncher({
  active,
}: {
  /** True while the Get started screen is showing. */
  active: boolean;
}): React.ReactNode {
  const { checklist, dismissed, resume } = useSetupChecklist();
  // Finishing the last step while the app is open earns one "all set"
  // prompt; a fresh start with everything done shows nothing.
  const sawIncomplete = useRef(false);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (checklist === null) return;
    if (!checklist.complete) {
      sawIncomplete.current = true;
      setCelebrate(false);
    } else if (sawIncomplete.current) {
      sawIncomplete.current = false;
      setCelebrate(true);
    }
  }, [checklist]);

  if (checklist === null) return null;

  if (checklist.complete) {
    if (!celebrate) return null;
    return (
      <a
        href={findFirstIdeaHref()}
        onClick={() => setCelebrate(false)}
        className={cn(
          launcherClassName,
          "border-linkgo-green/50 bg-linkgo-green/10 hover:bg-linkgo-green/15",
        )}
      >
        <Lightbulb aria-hidden="true" className="text-linkgo-green size-4" />
        <span className="min-w-0 flex-1">
          You&rsquo;re all set
          <span className="text-muted-foreground block text-xs font-normal">
            Find your first idea
          </span>
        </span>
      </a>
    );
  }

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={() => {
          resume();
          navigateTo(setupRoute);
        }}
        className={cn(launcherClassName, "hover:bg-accent/60 border-dashed")}
      >
        <Rocket aria-hidden="true" className="text-muted-foreground size-4" />
        <span className="min-w-0 flex-1">Resume setup</span>
      </button>
    );
  }

  const { doneCount, total } = checklist;
  return (
    <a
      href={formatRouteHash(setupRoute)}
      aria-current={active ? "page" : undefined}
      className={cn(
        launcherClassName,
        active
          ? "border-linkgo-blue/50 bg-linkgo-blue/10"
          : "border-linkgo-blue/30 hover:bg-accent/60",
      )}
    >
      <Rocket aria-hidden="true" className="text-linkgo-blue size-4" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          Get started
          <span className="text-muted-foreground text-xs font-normal tabular-nums">
            {doneCount} of {total}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="bg-muted mt-2 hidden h-1.5 overflow-hidden rounded-full sm:block"
        >
          <span
            className="bg-linkgo-blue block h-full rounded-full"
            style={{ width: `${(doneCount / total) * 100}%` }}
          />
        </span>
      </span>
    </a>
  );
}
