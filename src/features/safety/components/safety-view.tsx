import { AlertCircle, ShieldAlert, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorQueueCard } from "@/features/safety/components/error-queue-card";
import { RateLimitEventList } from "@/features/safety/components/rate-limit-event-list";
import { SafetyEventList } from "@/features/safety/components/safety-event-list";
import { useSafety } from "@/features/safety/hooks/use-safety";

export function SafetyView(): React.ReactNode {
  const {
    campaigns,
    selectedCampaignId,
    dashboard,
    loading,
    killSwitchSaving,
    error,
    loadSafety,
    selectCampaign,
    toggleKillSwitch,
    changeErrorStatus,
  } = useSafety();
  const [reason, setReason] = useState("");

  useEffect(() => {
    setReason(dashboard?.settings.kill_switch_reason ?? "");
  }, [dashboard?.settings.kill_switch_reason]);

  const killSwitchEnabled = dashboard?.settings.global_kill_switch === 1;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="bg-linkgo-amber/10 text-linkgo-amber flex size-11 items-center justify-center rounded-xl">
              <ShieldAlert className="size-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Safety</h2>
              <p className="text-muted-foreground text-sm">
                Local-first emergency stops, conservative rate limits, and
                fixable operator history.
              </p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="text-destructive size-5" />
              <p className="text-sm">{error}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadSafety()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {loading || dashboard === null ? (
        <Card className="bg-card/70">
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            Loading safety controls…
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="bg-card/60 flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium">Safety scope</p>
              <p className="text-muted-foreground text-xs">
                Keep history visible for all campaigns, including archived rows.
              </p>
            </div>
            <select
              value={selectedCampaignId ?? "all"}
              onChange={(event) => {
                const nextValue = event.target.value;
                selectCampaign(nextValue === "all" ? null : Number(nextValue));
              }}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 min-w-60 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <option value="all">All campaigns</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                  {campaign.status === "archived" ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </div>

          <Card
            className={
              killSwitchEnabled
                ? "border-destructive/40 bg-destructive/5"
                : "bg-card/70"
            }
          >
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-semibold">Global kill switch</p>
                  <p className="text-muted-foreground text-xs">
                    Blocks local schedule starts, agent dry-run starts, and
                    approved comment posting records.
                  </p>
                </div>
                <div className="text-sm font-medium">
                  {killSwitchEnabled ? "Enabled" : "Disabled"}
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Reason for enabling the kill switch"
                  aria-label="Kill switch reason"
                  disabled={killSwitchSaving}
                />
                <Button
                  type="button"
                  variant={killSwitchEnabled ? "outline" : "destructive"}
                  disabled={killSwitchSaving}
                  onClick={() =>
                    void toggleKillSwitch({
                      enabled: !killSwitchEnabled,
                      reason,
                    })
                  }
                >
                  {killSwitchSaving
                    ? "Saving…"
                    : `${killSwitchEnabled ? "Disable" : "Enable"} kill switch`}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Open errors"
              value={String(dashboard.summary.openErrors)}
            />
            <SummaryCard
              label="Blocked today"
              value={String(dashboard.summary.blockedToday)}
            />
            <SummaryCard
              label="Allowed today"
              value={String(dashboard.summary.allowedToday)}
            />
            <SummaryCard
              label="Audit events"
              value={String(dashboard.summary.auditEvents)}
            />
          </div>

          {campaigns.length === 0 && <EmptyNoCampaigns />}

          <section className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">Error queue</h3>
              <p className="text-muted-foreground text-sm">
                Failed publishes, rejected approvals, and failed agent runs land
                here for operator follow-up.
              </p>
            </div>
            {dashboard.errorQueueItems.length === 0 ? (
              <Card className="bg-card/70 border-dashed">
                <CardContent className="text-muted-foreground p-8 text-center text-sm">
                  No error queue items yet.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {dashboard.errorQueueItems.map((item) => (
                  <ErrorQueueCard
                    key={item.id}
                    item={item}
                    disabled={item.campaign_status === "archived"}
                    onChangeStatus={changeErrorStatus}
                  />
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <RateLimitEventList events={dashboard.rateLimitEvents} />
            <SafetyEventList events={dashboard.auditEvents} />
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <Card className="bg-card/70">
      <CardContent className="p-4">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function EmptyNoCampaigns(): React.ReactNode {
  return (
    <Card className="bg-card/70 border-dashed">
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <div className="bg-linkgo-green/10 text-linkgo-green flex size-14 items-center justify-center rounded-2xl">
          <Target className="size-7" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">No campaigns yet</h3>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm">
            Create a campaign to see campaign-scoped safety history. The global
            kill switch is available now.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
