import { MainTitleBar } from "@/components/main-title-bar";
import { WindowFrame } from "@/components/window-frame";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/features/settings/hooks/use-settings";

function formatLastSynced(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function SettingsPage(): React.ReactNode {
  const { launchOnLogin, loading, saving, error, setLaunchOnLoginEnabled } =
    useSettings();
  const enabled = launchOnLogin?.enabled ?? false;
  const lastSynced = formatLastSynced(launchOnLogin?.lastSyncedAt ?? null);
  const lastError = launchOnLogin?.lastError || error;

  return (
    <WindowFrame titleBar={<MainTitleBar />} contentClassName="p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm">
            Control local Linkgo app behavior.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Startup</CardTitle>
            <CardDescription>
              Choose whether Linkgo opens when you sign in to this computer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-2">
                <div className="space-y-1">
                  <label
                    className="text-sm leading-none font-medium"
                    htmlFor="launch-on-login"
                  >
                    Launch Linkgo at login
                  </label>
                  <p className="text-muted-foreground max-w-xl text-sm">
                    Uses the operating system startup setting. Linkgo still only
                    runs jobs while the app is open or hidden to tray.
                  </p>
                </div>
                <div className="text-muted-foreground space-y-1 text-xs">
                  <p>
                    Status: <span>{enabled ? "Enabled" : "Disabled"}</span>
                  </p>
                  {lastSynced ? <p>Last synced: {lastSynced}</p> : null}
                  {lastError ? (
                    <p className="text-destructive">Last error: {lastError}</p>
                  ) : null}
                </div>
              </div>
              <Switch
                id="launch-on-login"
                checked={enabled}
                disabled={loading || saving}
                onCheckedChange={(checked) => {
                  void setLaunchOnLoginEnabled(checked);
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
      <Toaster />
    </WindowFrame>
  );
}
