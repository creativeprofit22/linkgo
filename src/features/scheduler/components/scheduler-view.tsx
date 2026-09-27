import { AlertCircle, Clock3, Play, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DueScheduleCard } from "@/features/scheduler/components/due-schedule-card";
import { SchedulerEventList } from "@/features/scheduler/components/scheduler-event-list";
import { useScheduler } from "@/features/scheduler/hooks/use-scheduler";

export function SchedulerView(): React.ReactNode {
  const {
    campaigns,
    selectedCampaignId,
    dashboard,
    status,
    loading,
    saving,
    ticking,
    error,
    loadScheduler,
    selectCampaign,
    start,
    stop,
    tick,
  } = useScheduler();

  const killSwitchEnabled = dashboard?.globalKillSwitchEnabled === true;
  // The saved flag says the operator wanted the scheduler on, but the worker
  // is not running: Linkgo restarted (quit, crash, forced kill) and never
  // auto-starts it.
  const interrupted = status?.enabled === true && !status.running && !ticking;
  const statusLabel = ticking
    ? "Ticking"
    : status?.running
      ? "Running"
      : interrupted
        ? "Stopped after restart"
        : "Stopped";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-11 items-center justify-center rounded-xl">
              <Clock3 className="size-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Scheduler
              </h2>
              <p className="text-muted-foreground text-sm">
                Runs only approved scheduled posts while Linkgo is open or
                hidden to tray.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={loading || saving || ticking}
            onClick={() => void loadScheduler()}
          >
            <RefreshCw className="mr-2 size-4" />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={loading || saving || ticking}
            onClick={() => void tick()}
          >
            <RefreshCw className="mr-2 size-4" />
            Run due jobs now
          </Button>
          {status?.running ? (
            <Button
              type="button"
              variant="outline"
              disabled={loading || saving}
              onClick={() => void stop()}
            >
              <Square className="mr-2 size-4" />
              Stop scheduler
            </Button>
          ) : (
            <Button
              type="button"
              disabled={loading || saving || killSwitchEnabled}
              onClick={() => void start()}
            >
              <Play className="mr-2 size-4" />
              Start scheduler
            </Button>
          )}
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
              onClick={() => void loadScheduler()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {interrupted && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent role="status" className="flex items-start gap-3 p-4">
            <AlertCircle className="mt-0.5 size-5 text-amber-600" />
            <div>
              <p className="font-medium">Scheduler stopped after restart</p>
              <p className="text-muted-foreground text-sm">
                The scheduler was on before Linkgo last closed. Check Safety for
                any publish marked outcome unknown, then press Start scheduler.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading || dashboard === null ? (
        <Card className="bg-card/70">
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            Loading scheduler…
          </CardContent>
        </Card>
      ) : (
        <>
          {killSwitchEnabled && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="flex items-start gap-3 p-4">
                <AlertCircle className="text-destructive mt-0.5 size-5" />
                <div>
                  <p className="font-medium">Global kill switch is enabled</p>
                  <p className="text-muted-foreground text-sm">
                    Scheduler starts are blocked. Due jobs stay scheduled until
                    the switch is disabled.
                    {dashboard.killSwitchReason
                      ? ` Reason: ${dashboard.killSwitchReason}`
                      : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="bg-card/60 flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium">Scheduler scope</p>
              <p className="text-muted-foreground text-xs">
                Filter pending jobs, events, and scheduler-linked publish
                attempts.
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

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Status" value={statusLabel} />
            <SummaryCard
              label="Pending"
              value={String(dashboard.summary.pendingJobs)}
            />
            <SummaryCard
              label="Due now"
              value={String(dashboard.summary.dueJobs)}
            />
            <SummaryCard
              label="Failed"
              value={String(dashboard.summary.failedJobs)}
            />
            <SummaryCard
              label="Attempts"
              value={String(dashboard.summary.recentAttempts)}
            />
          </div>

          <section className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">Due and pending jobs</h3>
              <p className="text-muted-foreground text-sm">
                Shows scheduled LinkedIn posts due in the next 24 hours plus any
                retry errors.
              </p>
            </div>
            {dashboard.dueJobs.length === 0 ? (
              <Card className="bg-card/70 border-dashed">
                <CardContent className="text-muted-foreground p-8 text-center text-sm">
                  No due scheduler jobs.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {dashboard.dueJobs.map((job) => (
                  <DueScheduleCard key={job.id} job={job} />
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <SchedulerEventList events={dashboard.recentEvents} />
            <Card className="bg-card/70">
              <CardContent className="space-y-3 p-4">
                <div>
                  <h3 className="font-semibold">
                    Recent scheduler publish attempts
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Successes and failures tied to schedule jobs.
                  </p>
                </div>
                {dashboard.recentAttempts.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center text-sm">
                    No scheduler publish attempts yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {dashboard.recentAttempts.map((attempt) => (
                      <div
                        key={attempt.id}
                        className="rounded-lg border p-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">
                            {attempt.campaign_name ?? "Campaign removed"} ·
                            Approval #{attempt.approval_id}
                          </p>
                          <span>{attempt.status}</span>
                        </div>
                        <p className="text-muted-foreground mt-1">
                          {attempt.status === "succeeded"
                            ? attempt.external_post_url ||
                              attempt.platform_post_id
                            : attempt.error_message}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
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
