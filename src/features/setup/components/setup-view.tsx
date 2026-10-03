import { Rocket } from "lucide-react";
import { campaignsRoute } from "@/features/campaigns/schemas";
import { SetupChecklist } from "@/features/setup/components/setup-checklist";
import { useSetupChecklist } from "@/features/setup/hooks/use-setup-checklist";
import { navigateTo } from "@/lib/navigation/use-hash-navigation";

/** The Get started screen (`#/setup`). */
export function SetupView(): React.ReactNode {
  const { checklist, dismiss } = useSetupChecklist();

  const hideSetup = (): void => {
    dismiss();
    navigateTo(campaignsRoute);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-11 items-center justify-center rounded-xl">
          <Rocket aria-hidden="true" className="size-5" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Get started</h2>
          <p className="text-muted-foreground text-sm">
            Set up Linkgo once, then find ideas and write posts. Linkgo never
            posts without your OK.
          </p>
        </div>
      </div>
      <SetupChecklist checklist={checklist} onDismiss={hideSetup} />
    </div>
  );
}

/**
 * Shown on Campaigns when there are none yet: the checklist, or the
 * screen's own empty card once the user hid setup.
 */
export function SetupEmptyCampaigns({
  fallback,
}: {
  fallback: React.ReactNode;
}): React.ReactNode {
  const { checklist, dismissed, dismiss } = useSetupChecklist();
  if (dismissed) return fallback;
  return <SetupChecklist checklist={checklist} onDismiss={dismiss} />;
}
