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
  const {
    launchOnLogin,
    loading,
    saving,
    error,
    desktopRequiredMessage,
    setLaunchOnLoginEnabled,
  } = useSettings();
  const enabled = launchOnLogin?.enabled ?? false;
  const lastSynced = formatLastSynced(launchOnLogin?.lastSyncedAt ?? null);
  const lastError = launchOnLogin?.lastError || error;

  return (
    <WindowFrame titleBar={<MainTitleBar />} contentClassName="p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm">
            Choose how Linkgo behaves on this computer.
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
                    Open Linkgo when I sign in
                  </label>
                  <p className="text-muted-foreground max-w-xl text-sm">
                    Linkgo can only post on schedule while it&rsquo;s open or
                    minimized to the tray.
                  </p>
                </div>
                <div className="text-muted-foreground space-y-1 text-xs">
                  <p>
                    Status: <span>{enabled ? "On" : "Off"}</span>
                  </p>
                  {lastSynced ? <p>Last updated: {lastSynced}</p> : null}
                  {lastError ? (
                    <p className="text-destructive">
                      Last problem: {lastError}
                    </p>
                  ) : null}
                  {desktopRequiredMessage ? (
                    <p id="launch-on-login-desktop-required">
                      {desktopRequiredMessage}
                    </p>
                  ) : null}
                </div>
              </div>
              <Switch
                id="launch-on-login"
                checked={enabled}
                disabled={loading || saving || desktopRequiredMessage !== null}
                aria-describedby={
                  desktopRequiredMessage
                    ? "launch-on-login-desktop-required"
                    : undefined
                }
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
