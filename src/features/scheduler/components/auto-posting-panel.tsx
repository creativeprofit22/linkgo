import { AlertCircle, Clock3, Play, RefreshCw, Square } from "lucide-react";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DueScheduleCard } from "@/features/scheduler/components/due-schedule-card";
import { SchedulerEventList } from "@/features/scheduler/components/scheduler-event-list";
import { useScheduler } from "@/features/scheduler/hooks/use-scheduler";
import {
  canScheduleAgain,
  type RescheduleTarget,
} from "@/features/scheduler/schedule-again";
import { toPlainMessage } from "@/lib/plain-message";

export interface AutoPostingPanelProps {
  /** Follows the Calendar's campaign filter; null shows every campaign. */
  campaignId: number | null;
  /** Bumped by the Calendar after it changes a schedule so the panel reloads. */
  refreshToken?: number;
  /**
   * Opens the Calendar's time picker for a post that didn't go out. Supplied
   * by the Calendar so this feature never depends on calendar internals.
   */
  onReschedule: (target: RescheduleTarget) => void;
  /**
   * Called after the panel may have changed posts ("Post what's due now",
   * or its Refresh) so the Calendar can reload its own view of them.
   */
  onScheduleChanged?: () => void;
}

/**
 * Auto-posting status and recovery, shown beside the Calendar. There is no
 * native "retry now" command, so a post that didn't go out is recovered by
 * picking a new time in the Calendar.
 */
export function AutoPostingPanel({
  campaignId,
  refreshToken = 0,
  onReschedule,
  onScheduleChanged,
}: AutoPostingPanelProps): React.ReactNode {
  const {
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

  useEffect(() => {
    if (campaignId !== selectedCampaignId) selectCampaign(campaignId);
  }, [campaignId, selectedCampaignId, selectCampaign]);

  const lastRefreshToken = useRef(refreshToken);
  useEffect(() => {
    if (lastRefreshToken.current === refreshToken) return;
    lastRefreshToken.current = refreshToken;
    void loadScheduler();
  }, [refreshToken, loadScheduler]);

  const killSwitchEnabled = dashboard?.globalKillSwitchEnabled === true;
  // The saved flag says the operator wanted auto-posting on, but the worker
  // is not running: Linkgo restarted and never auto-starts it.
  const interrupted = status?.enabled === true && !status.running && !ticking;
  const statusLabel = ticking
    ? "Checking…"
    : status?.running
      ? "On"
      : interrupted
        ? "Off after restart"
        : "Off";
  const failedAttempts =
    dashboard?.recentAttempts.filter(
      (attempt) => attempt.status === "failed",
    ) ?? [];
  const busy = loading || saving || ticking;

  const handleTick = async (): Promise<void> => {
    const result = await tick();
    if (result !== null) onScheduleChanged?.();
  };
  const handleRefresh = async (): Promise<void> => {
    await loadScheduler();
    onScheduleChanged?.();
  };

  return (
    <aside
      aria-labelledby="auto-posting-heading"
      className="bg-card/60 flex flex-col gap-4 rounded-xl border p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock3 aria-hidden="true" className="text-linkgo-blue size-4" />
          <h3 id="auto-posting-heading" className="font-semibold">
            Auto-posting
          </h3>
        </div>
        <Badge
          data-testid="auto-posting-status"
          variant={status?.running ? "default" : "secondary"}
        >
          {statusLabel}
        </Badge>
      </div>
      <p className="text-muted-foreground -mt-2 text-sm">
        Scheduled posts go out on time while Linkgo is open or minimized to the
        tray. Linkgo never posts without your OK.
      </p>

      <div className="flex flex-col gap-2">
        {status?.running ? (
          <Button
            type="button"
            variant="outline"
            disabled={loading || saving}
            onClick={() => void stop()}
          >
            <Square aria-hidden="true" className="size-4" />
            Turn off auto-posting
          </Button>
        ) : (
          <Button
            type="button"
            disabled={loading || saving || killSwitchEnabled}
            onClick={() => void start()}
          >
            <Play aria-hidden="true" className="size-4" />
            Turn on auto-posting
          </Button>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => void handleTick()}
          >
            Post what's due now
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Refresh auto-posting"
            className="size-11"
            disabled={busy}
            onClick={() => void handleRefresh()}
          >
            <RefreshCw aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="border-destructive/50 bg-destructive/5 flex flex-col gap-2 rounded-lg border p-3 text-sm"
        >
          <p className="flex items-start gap-2">
            <AlertCircle
              aria-hidden="true"
              className="text-destructive mt-0.5 size-4 shrink-0"
            />
            {error}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => void loadScheduler()}
          >
            Try again
          </Button>
        </div>
      )}

      {interrupted && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-sm"
        >
          <AlertCircle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-amber-600"
          />
          <div>
            <p className="font-medium">
              Auto-posting turned off when Linkgo restarted
            </p>
            <p className="text-muted-foreground">
              Go to Safety and look for any post marked &ldquo;Couldn&rsquo;t
              confirm&rdquo;, then press Turn on auto-posting.
            </p>
          </div>
        </div>
      )}

      {loading || dashboard === null ? (
        error ? null : (
          <p className="text-muted-foreground py-4 text-center text-sm">
            Loading auto-posting…
          </p>
        )
      ) : (
        <>
          {killSwitchEnabled && (
            <div className="border-destructive/40 bg-destructive/5 flex items-start gap-2 rounded-lg border p-3 text-sm">
              <AlertCircle
                aria-hidden="true"
                className="text-destructive mt-0.5 size-4 shrink-0"
              />
              <div>
                <p className="font-medium">Emergency pause is on</p>
                <p className="text-muted-foreground">
                  Auto-posting can&rsquo;t be turned on. Posts that are due stay
                  scheduled until you turn off the pause in Safety.
                  {dashboard.killSwitchReason
                    ? ` Reason: ${dashboard.killSwitchReason}`
                    : ""}
                </p>
              </div>
            </div>
          )}

          <dl className="grid grid-cols-3 gap-2 text-center">
            <Count label="Waiting" value={dashboard.summary.pendingJobs} />
            <Count label="Due now" value={dashboard.summary.dueJobs} />
            <Count label="Didn't post" value={dashboard.summary.failedJobs} />
          </dl>

          <section aria-labelledby="auto-posting-due" className="space-y-2">
            <h4 id="auto-posting-due" className="text-sm font-semibold">
              Coming up
            </h4>
            {dashboard.dueJobs.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nothing is due in the next 24 hours.
              </p>
            ) : (
              <div className="space-y-3">
                {dashboard.dueJobs.map((job) => (
                  <DueScheduleCard
                    key={job.id}
                    job={job}
                    onReschedule={onReschedule}
                  />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="auto-posting-failed" className="space-y-2">
            <h4 id="auto-posting-failed" className="text-sm font-semibold">
              Didn&rsquo;t post
            </h4>
            {failedAttempts.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Every recent post went out.
              </p>
            ) : (
              <ul aria-label="Posts that didn't go out" className="space-y-2">
                {failedAttempts.map((attempt) => {
                  const attemptCampaignId = attempt.campaign_id;
                  const canReschedule =
                    attemptCampaignId !== null &&
                    canScheduleAgain({
                      scheduleJobStatus: attempt.schedule_job_status,
                      approvalStatus: attempt.approval_status,
                      campaignStatus: attempt.campaign_status,
                    });
                  return (
                    <li
                      key={attempt.id}
                      className="rounded-lg border p-3 text-sm"
                    >
                      <p
                        className="truncate font-medium"
                        title={attempt.variant_hook || undefined}
                      >
                        {attempt.variant_hook || "Approved post"}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {attempt.campaign_name ?? "Campaign removed"}
                      </p>
                      <p className="text-muted-foreground mt-1 break-words">
                        {toPlainMessage(attempt.error_message)}
                      </p>
                      {canReschedule ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() =>
                            onReschedule({
                              campaignId: attemptCampaignId,
                              approvalId: attempt.approval_id,
                            })
                          }
                        >
                          Reschedule
                        </Button>
                      ) : attempt.schedule_job_status === "scheduled" ? (
                        <p className="text-muted-foreground mt-2 text-xs">
                          Scheduled again.
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <SchedulerEventList events={dashboard.recentEvents} />
        </>
      )}
    </aside>
  );
}

function Count({
  label,
  value,
}: {
  label: string;
  value: number;
}): React.ReactNode {
  return (
    <div className="bg-background/60 rounded-lg border px-2 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
