import { useId, useState } from "react";
import {
  AlertCircle,
  CloudDownload,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  brightDataRunRequestSchema,
  isBrightDataAvailable,
  parsePostUrlList,
} from "@/features/source-imports/brightdata-schemas";
import {
  useBrightDataRuns,
  type UseBrightDataRunsState,
} from "@/features/source-imports/hooks/use-brightdata-runs";
import type {
  BrightDataRun,
  BrightDataRunMode,
  BrightDataRunRequest,
  BrightDataRunStatus,
  BrightDataStatus,
  BrightDataWatchKind,
} from "@/features/source-imports/types/brightdata";

interface BrightDataPanelProps {
  state: UseBrightDataRunsState;
  archived: boolean;
}

/** Run history labels; "keyword" only appears on runs made before it was retired. */
const MODE_LABELS: Record<BrightDataRunMode, string> = {
  post_url: "Post links",
  keyword: "Keyword search",
  watchlist: "Watchlist",
};

/** Modes a new run can use (Bright Data retired keyword discovery). */
const FETCH_MODES = [
  ["post_url", "Post links"],
  ["watchlist", "Watchlist"],
] as const satisfies ReadonlyArray<
  readonly [BrightDataRunRequest["mode"], string]
>;

const RUN_STATUS_LABELS: Record<BrightDataRunStatus, string> = {
  starting: "Starting",
  running: "Collecting",
  ready: "Importing",
  imported: "Imported",
  failed: "Failed",
  cancelled: "Cancelled",
};

const ACTIVE_STATUSES: readonly BrightDataRunStatus[] = [
  "starting",
  "running",
  "ready",
];

const selectClassName =
  "border-input bg-background ring-offset-background focus-visible:ring-ring h-9 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

function formatRunTime(value: string): string {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function runBadgeVariant(
  status: BrightDataRunStatus,
): "default" | "destructive" | "outline" | "secondary" {
  if (status === "failed") return "destructive";
  if (status === "imported") return "default";
  if (ACTIVE_STATUSES.includes(status)) return "secondary";
  return "outline";
}

/** Why runs cannot start right now, or null when every gate is open. */
function blockedReason(status: BrightDataStatus): string | null {
  if (!status.enabled) return "Turn on Bright Data to fetch posts.";
  if (status.killSwitchActive)
    return "Pause everything is on, so fetching is paused.";
  if (!status.apiKeyConfigured) {
    return "Add your Bright Data key in Connected accounts.";
  }
  if (status.runsToday >= status.caps.maxRunsPerCampaignPerDay) {
    return "You've reached today's fetch limit for this campaign.";
  }
  return null;
}

function EnableRow({
  status,
  onChange,
}: {
  status: BrightDataStatus;
  onChange: (enabled: boolean) => Promise<void>;
}): React.ReactNode {
  const switchId = useId();
  const [saving, setSaving] = useState(false);
  const reviewPending = status.reviewStatus === "pending_sign_off";
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <Label htmlFor={switchId} className="text-sm font-medium">
          Fetch posts with Bright Data
        </Label>
        <p className="text-muted-foreground text-xs">
          Only reads posts. Never posts, comments, or signs in to LinkedIn.
          {reviewPending
            ? " This connection is waiting for owner sign-off. Keep it off until it's signed off."
            : null}
        </p>
      </div>
      <Switch
        id={switchId}
        checked={status.enabled}
        disabled={saving}
        onCheckedChange={(checked) => {
          setSaving(true);
          void onChange(checked).finally(() => setSaving(false));
        }}
      />
    </div>
  );
}

function WatchlistEditor({
  state,
  disabled,
}: {
  state: UseBrightDataRunsState;
  disabled: boolean;
}): React.ReactNode {
  const urlId = useId();
  const labelId = useId();
  const kindId = useId();
  const [kind, setKind] = useState<BrightDataWatchKind>("profile");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);

  const submit = async (
    event: React.SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setAdding(true);
    const added = await state.addEntry({
      kind,
      url: url.trim(),
      label: label.trim(),
    });
    setAdding(false);
    if (added) {
      setUrl("");
      setLabel("");
    }
  };

  return (
    <section className="space-y-3" aria-labelledby={`${kindId}-heading`}>
      <h4 id={`${kindId}-heading`} className="text-sm font-medium">
        Watchlist
      </h4>
      {state.watchlist.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          No profiles or companies yet.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {state.watchlist.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-2 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                {entry.label ? (
                  <span className="font-medium">{entry.label}</span>
                ) : null}
                <span
                  className={
                    entry.label
                      ? "text-muted-foreground block truncate text-xs"
                      : "block truncate"
                  }
                >
                  {entry.url}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {entry.kind === "profile" ? "Profile" : "Company"}
                </Badge>
                <Switch
                  aria-label={`Include ${entry.label || entry.url} when fetching from the watchlist`}
                  checked={entry.enabled}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    void state.updateEntry({
                      id: entry.id,
                      enabled: checked,
                      label: entry.label,
                    })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  aria-label={`Remove ${entry.label || entry.url}`}
                  onClick={() => void state.removeEntry(entry.id)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-2 sm:grid-cols-[auto_1fr_12rem_auto] sm:items-end"
        onSubmit={(event) => void submit(event)}
      >
        <div className="grid gap-1">
          <Label htmlFor={kindId} className="text-xs">
            Type
          </Label>
          <select
            id={kindId}
            className={selectClassName}
            value={kind}
            disabled={disabled}
            onChange={(event) =>
              setKind(event.target.value === "company" ? "company" : "profile")
            }
          >
            <option value="profile">Profile</option>
            <option value="company">Company</option>
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor={urlId} className="text-xs">
            LinkedIn link
          </Label>
          <Input
            id={urlId}
            value={url}
            disabled={disabled}
            placeholder={
              kind === "profile"
                ? "https://www.linkedin.com/in/name"
                : "https://www.linkedin.com/company/name"
            }
            onChange={(event) => setUrl(event.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={labelId} className="text-xs">
            Label (optional)
          </Label>
          <Input
            id={labelId}
            value={label}
            maxLength={160}
            disabled={disabled}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          disabled={disabled || adding || url.trim() === ""}
        >
          <Plus className="size-4" aria-hidden="true" /> Add
        </Button>
      </form>
    </section>
  );
}

function FetchForm({
  state,
  status,
  blocked,
}: {
  state: UseBrightDataRunsState;
  status: BrightDataStatus;
  blocked: boolean;
}): React.ReactNode {
  const modeId = useId();
  const inputId = useId();
  const daysId = useId();
  const [mode, setMode] = useState<BrightDataRunRequest["mode"]>("post_url");
  const [postUrls, setPostUrls] = useState("");
  const [kind, setKind] = useState<BrightDataWatchKind>("profile");
  const [days, setDays] = useState(String(status.caps.defaultWindowDays));
  const [formError, setFormError] = useState<string | null>(null);
  const { caps } = status;

  const buildRequest = (): BrightDataRunRequest | string => {
    const windowDays = Number(days);
    const candidate =
      mode === "post_url"
        ? { mode, postUrls: parsePostUrlList(postUrls) }
        : { mode, kind, days: windowDays };
    const parsed = brightDataRunRequestSchema.safeParse(candidate);
    if (!parsed.success) {
      return (
        parsed.error.issues[0]?.message ??
        "Check the fetch settings and try again"
      );
    }
    return parsed.data;
  };

  const submit = async (
    event: React.SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const request = buildRequest();
    if (typeof request === "string") {
      setFormError(request);
      return;
    }
    setFormError(null);
    const run = await state.startRun(request);
    if (run?.status === "imported" && mode === "post_url") setPostUrls("");
  };

  const disabled = blocked || state.runPending;
  const enabledWatchCount = state.watchlist.filter(
    (entry) => entry.enabled && entry.kind === kind,
  ).length;

  return (
    <form
      className="space-y-3"
      aria-labelledby={`${modeId}-heading`}
      onSubmit={(event) => void submit(event)}
    >
      <h4 id={`${modeId}-heading`} className="text-sm font-medium">
        Fetch posts
      </h4>
      <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
        <div className="grid gap-1">
          <Label htmlFor={modeId} className="text-xs">
            Source
          </Label>
          <select
            id={modeId}
            className={selectClassName}
            value={mode}
            disabled={disabled}
            onChange={(event) => {
              const next = event.target.value;
              setMode(next === "watchlist" ? "watchlist" : "post_url");
              setFormError(null);
            }}
          >
            {FETCH_MODES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {mode === "post_url" ? (
          <div className="grid gap-1">
            <Label htmlFor={inputId} className="text-xs">
              LinkedIn post links (one per line, up to {caps.maxPostsPerRun})
            </Label>
            <Textarea
              id={inputId}
              rows={3}
              value={postUrls}
              disabled={disabled}
              onChange={(event) => setPostUrls(event.target.value)}
            />
          </div>
        ) : (
          <div className="grid gap-1">
            <Label htmlFor={inputId} className="text-xs">
              Watch type ({enabledWatchCount} turned on, up to{" "}
              {caps.maxWatchlistEntriesPerRun} per fetch)
            </Label>
            <select
              id={inputId}
              className={selectClassName}
              value={kind}
              disabled={disabled}
              onChange={(event) =>
                setKind(
                  event.target.value === "company" ? "company" : "profile",
                )
              }
            >
              <option value="profile">Profiles</option>
              <option value="company">Companies</option>
            </select>
          </div>
        )}
      </div>
      {mode !== "post_url" ? (
        <div className="grid max-w-48 gap-1">
          <Label htmlFor={daysId} className="text-xs">
            Look back (days, max {caps.maxWindowDays})
          </Label>
          <Input
            id={daysId}
            type="number"
            min={1}
            max={caps.maxWindowDays}
            value={days}
            disabled={disabled}
            onChange={(event) => setDays(event.target.value)}
          />
        </div>
      ) : null}
      {formError ? (
        <p className="text-destructive text-sm" role="alert">
          {formError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={disabled}>
          {state.runPending ? (
            <RefreshCw
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <Play className="size-4" aria-hidden="true" />
          )}
          {state.runPending ? "Fetching…" : "Fetch posts"}
        </Button>
        <span className="text-muted-foreground text-xs">
          {status.runsToday} of {caps.maxRunsPerCampaignPerDay} fetches used
          today
        </span>
      </div>
    </form>
  );
}

function RunRow({
  run,
  state,
  canResume,
}: {
  run: BrightDataRun;
  state: UseBrightDataRunsState;
  canResume: boolean;
}): React.ReactNode {
  const active = ACTIVE_STATUSES.includes(run.status);
  return (
    <li
      className="flex flex-col gap-2 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
      data-testid="brightdata-run"
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{MODE_LABELS[run.mode]}</span>
          <Badge variant={runBadgeVariant(run.status)}>
            {RUN_STATUS_LABELS[run.status]}
          </Badge>
          {run.status === "imported" ? (
            <span className="text-muted-foreground text-xs">
              {run.rowCount} post{run.rowCount === 1 ? "" : "s"}
              {run.sourceImportBatchId !== null
                ? ` · import ${run.sourceImportBatchId}`
                : ""}
            </span>
          ) : null}
        </div>
        <time
          className="text-muted-foreground block text-xs"
          dateTime={run.createdAt}
        >
          {formatRunTime(run.createdAt)}
        </time>
        {run.errorMessage &&
        run.errorMessage !== RUN_STATUS_LABELS[run.status] ? (
          <p className="text-muted-foreground text-xs break-words">
            {run.errorMessage}
          </p>
        ) : null}
      </div>
      <div className="flex gap-2">
        {run.resumable ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canResume || state.runPending}
            onClick={() => void state.resumeRun(run.id)}
          >
            <RefreshCw className="size-4" aria-hidden="true" /> Continue
          </Button>
        ) : null}
        {active ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void state.cancelRun(run.id)}
          >
            <Square className="size-4" aria-hidden="true" /> Cancel
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function BrightDataPanel({
  state,
  archived,
}: BrightDataPanelProps): React.ReactNode {
  const { status } = state;
  const reason = status === null ? null : blockedReason(status);
  const canRun = status !== null && !archived && isBrightDataAvailable(status);
  // Resuming continues an existing run, so the daily cap does not apply.
  const canResume =
    status !== null &&
    !archived &&
    status.enabled &&
    !status.killSwitchActive &&
    status.apiKeyConfigured;

  return (
    <section
      className="space-y-3"
      aria-busy={state.loading}
      data-testid="brightdata-panel"
    >
      <div className="flex items-center gap-2">
        <CloudDownload
          className="text-muted-foreground size-4"
          aria-hidden="true"
        />
        <h3 className="text-sm font-semibold tracking-wide uppercase">
          Bright Data source
        </h3>
      </div>
      {state.error ? (
        <Card className="border-destructive/50">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <AlertCircle
                className="text-destructive mt-0.5 size-5 shrink-0"
                aria-hidden="true"
              />
              <p className="text-sm break-words">{state.error}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void state.reload()}
            >
              <RefreshCw className="size-4" aria-hidden="true" /> Try again
            </Button>
          </CardContent>
        </Card>
      ) : status === null ? (
        <Card className="bg-card/70">
          <CardContent className="text-muted-foreground p-5 text-sm">
            Loading Bright Data…
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-5 p-4">
            <EnableRow status={status} onChange={state.setEnabled} />
            {status.enabled ? (
              <>
                {reason !== null || archived ? (
                  <p className="text-muted-foreground text-sm" role="status">
                    {archived
                      ? "Archived campaigns can't fetch posts."
                      : reason}
                  </p>
                ) : null}
                {!status.cliFound ? (
                  <p className="text-muted-foreground text-xs">
                    To fetch by post link, this computer needs Node.js 20 or
                    newer and the Bright Data command-line tool (version{" "}
                    {status.pinnedCliVersion}).
                  </p>
                ) : null}
                <FetchForm state={state} status={status} blocked={!canRun} />
                <WatchlistEditor state={state} disabled={archived} />
              </>
            ) : null}
            <section
              className="space-y-2"
              aria-label="Bright Data fetch history"
            >
              <h4 className="text-sm font-medium">Recent fetches</h4>
              {state.runs.length === 0 ? (
                <p className="text-muted-foreground text-xs">No fetches yet.</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {state.runs.map((run) => (
                    <RunRow
                      key={run.id}
                      run={run}
                      state={state}
                      canResume={canResume}
                    />
                  ))}
                </ul>
              )}
            </section>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

export interface BrightDataSourceProps {
  campaignId: number | null;
  archived: boolean;
  /** Called after a run writes a source-import batch. */
  onImported: () => Promise<void>;
}

/** Bright Data panel bound to one campaign's connector state. */
export function BrightDataSource({
  campaignId,
  archived,
  onImported,
}: BrightDataSourceProps): React.ReactNode {
  const state = useBrightDataRuns(campaignId, onImported);
  return <BrightDataPanel state={state} archived={archived} />;
}
