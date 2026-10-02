import { AlertCircle, Clock3, Play, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DueScheduleCard } from "@/features/scheduler/components/due-schedule-card";
import { SchedulerEventList } from "@/features/scheduler/components/scheduler-event-list";
import { useScheduler } from "@/features/scheduler/hooks/use-scheduler";
import type { PublishAttemptStatus } from "@/features/approvals/types";
import { toPlainMessage } from "@/lib/plain-message";

const attemptStatusLabels: Record<PublishAttemptStatus, string> = {
  succeeded: "Posted",
  failed: "Didn't post",
};

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
    ? "Checking…"
    : status?.running
      ? "On"
      : interrupted
        ? "Off after restart"
        : "Off";

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
                Auto-posting
              </h2>
              <p className="text-muted-foreground text-sm">
                Approved posts go out on time while Linkgo is open or minimized
                to the tray. Linkgo never posts without your OK.
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
            Post what's due now
          </Button>
          {status?.running ? (
            <Button
              type="button"
              variant="outline"
              disabled={loading || saving}
              onClick={() => void stop()}
            >
              <Square className="mr-2 size-4" />
              Turn off auto-posting
            </Button>
          ) : (
            <Button
              type="button"
              disabled={loading || saving || killSwitchEnabled}
              onClick={() => void start()}
            >
              <Play className="mr-2 size-4" />
              Turn on auto-posting
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
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {interrupted && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent role="status" className="flex items-start gap-3 p-4">
            <AlertCircle className="mt-0.5 size-5 text-amber-600" />
            <div>
              <p className="font-medium">
                Auto-posting turned off when Linkgo restarted
              </p>
              <p className="text-muted-foreground text-sm">
                Auto-posting was on when Linkgo last closed. Go to Safety and
                look for any post marked &ldquo;Couldn&rsquo;t confirm&rdquo;,
                then press Turn on auto-posting.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading || dashboard === null ? (
        <Card className="bg-card/70">
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            Loading auto-posting…
          </CardContent>
        </Card>
      ) : (
        <>
          {killSwitchEnabled && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="flex items-start gap-3 p-4">
                <AlertCircle className="text-destructive mt-0.5 size-5" />
                <div>
                  <p className="font-medium">Emergency pause is on</p>
                  <p className="text-muted-foreground text-sm">
                    Auto-posting can&rsquo;t be turned on. Posts that are due
                    stay scheduled until you turn off the pause in Safety.
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
              <p className="text-sm font-medium">Show posts from</p>
              <p className="text-muted-foreground text-xs">
                Show upcoming posts, activity, and posting attempts for every
                campaign, or just one.
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
              label="Waiting"
              value={String(dashboard.summary.pendingJobs)}
            />
            <SummaryCard
              label="Due now"
              value={String(dashboard.summary.dueJobs)}
            />
            <SummaryCard
              label="Didn't post"
              value={String(dashboard.summary.failedJobs)}
            />
            <SummaryCard
              label="Posting attempts"
              value={String(dashboard.summary.recentAttempts)}
            />
          </div>

          <section className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">Coming up</h3>
              <p className="text-muted-foreground text-sm">
                Scheduled LinkedIn posts due in the next 24 hours, plus any that
                need another try.
              </p>
            </div>
            {dashboard.dueJobs.length === 0 ? (
              <Card className="bg-card/70 border-dashed">
                <CardContent className="text-muted-foreground p-8 text-center text-sm">
                  No posts are due in the next 24 hours. Schedule an approved
                  post in Calendar to see it here.
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

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SchedulerEventList events={dashboard.recentEvents} />
            <Card className="bg-card/70">
              <CardContent className="space-y-3 p-4">
                <div>
                  <h3 className="font-semibold">Recent posting attempts</h3>
                  <p className="text-muted-foreground text-sm">
                    Scheduled posts that went out, and any that didn&rsquo;t.
                  </p>
                </div>
                {dashboard.recentAttempts.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center text-sm">
                    No posting attempts yet.
                  </p>
                ) : (
                  <ul
                    aria-label="Recent posting attempts"
                    className="space-y-3"
                  >
                    {dashboard.recentAttempts.map((attempt) => (
                      <li
                        key={attempt.id}
                        className="rounded-lg border p-3 text-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p
                              className="truncate font-medium"
                              title={attempt.variant_hook || undefined}
                            >
                              {attempt.variant_hook || "Approved post"}
                            </p>
                            <p className="text-muted-foreground truncate text-xs">
                              {attempt.campaign_name ?? "Campaign removed"}
                            </p>
                          </div>
                          <span className="shrink-0">
                            {attemptStatusLabels[attempt.status]}
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-1 break-words">
                          {attempt.status === "succeeded"
                            ? attempt.external_post_url ||
                              attempt.platform_post_id
                            : toPlainMessage(attempt.error_message)}
                        </p>
                      </li>
                    ))}
                  </ul>
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
