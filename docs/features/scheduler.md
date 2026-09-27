# Background Scheduler

## Purpose

The Scheduler tab controls an opt-in native background worker for approved scheduled LinkedIn posts.

It runs only while Linkgo is running or hidden to the system tray. It does not run after the Linkgo process quits.

## Native boundary

Feature folder: `src/features/scheduler`.

Native worker: `src-tauri/src/scheduler`.

The scheduler lives in Rust because scheduled publishing must reuse native OAuth credentials and should continue when the webview is hidden. React controls status, start, stop, manual ticks, and dashboard reads.

Native commands:

- `linkgo_scheduler_status`
- `linkgo_scheduler_start`
- `linkgo_scheduler_stop`
- `linkgo_scheduler_tick`
- `linkgo_scheduler_dashboard_get` (`src-tauri/src/scheduler_store.rs`): the renderer's only scheduler read. It takes an optional positive `campaignId` and rejects unknown fields. It recreates a missing settings row and returns the settings, the kill switch, summary counts, up to 20 due jobs, 50 recent events and 25 recent attempts, all from one transaction. The renderer has no direct SQL access to scheduler tables. Tests: `src-tauri/src/scheduler_store_tests.rs`.

## Schema

Migration version `12` adds scheduler metadata to `schedule_jobs`:

- `attempt_count`
- `max_attempts`
- `next_attempt_at`
- `last_attempted_at`
- `last_error`
- `locked_at`
- `locked_by`

It also creates:

- `scheduler_settings`: opt-in enabled flag, poll interval, max jobs per tick, retry backoff.
- `scheduler_events`: local event history for starts, stops, ticks, claims, blocks, publishes, retries, and terminal failures.

## Due-job rules

A job is eligible when:

- `schedule_jobs.status = 'scheduled'`
- the approval status is `scheduled`
- the campaign is not archived
- `scheduled_for` is due
- `next_attempt_at` is empty or due
- no fresh lock is present
- the approval has no open publishing execution (`reserved`, `in_flight` or `outcome_unknown`)

The worker claims a job, then hands it to the shared publishing execution service (`src-tauri/src/publishing`, see [publishing-execution.md](publishing-execution.md)). That service reserves a durable execution, calls LinkedIn outside any transaction, and settles every linked record in one fenced transaction. Each tick, and each worker start, first runs the recovery sweep for stale executions. The sweep does not depend on the worker: app startup, manual publishes and the reconciliation list also run it.

## Publish outcomes

Success:

- Records a succeeded `publish_attempts` row linked to the schedule job.
- Marks the approval `published`.
- Marks the schedule job `completed`.
- Records safety and scheduler events.

Retryable failure:

- Records a failed `publish_attempts` row.
- Leaves the approval `scheduled`.
- Leaves the schedule job `scheduled`.
- Sets `next_attempt_at` using conservative backoff.
- Records safety and scheduler events.

Terminal failure:

- Records a failed `publish_attempts` row.
- Returns the approval to `approved` for operator follow-up.
- Marks the schedule job `failed`.
- Creates or updates an error queue item with `source_type = 'schedule_job'`.
- Records safety and scheduler events.

Ambiguous outcome (timeout after send, 5xx, unreadable success):

- Records no attempt row; the execution becomes `outcome_unknown`.
- Leaves the approval `scheduled` and the job unfinished, with its lock cleared.
- Is **never retried automatically**. The job stays excluded until an operator reconciles it in Safety.
- Creates a warning error queue item and a `job_blocked` scheduler event.

Retries happen only after a definite failure (4xx including 429, connect failure, or a credential/scope failure before send).

Kill switch block:

- Does not call LinkedIn.
- Leaves the schedule job `scheduled`.
- Records a `job_blocked` scheduler event.

## UI behavior

The Scheduler tab shows:

- Status: `Stopped`, `Stopped after restart`, `Running`, or `Ticking`.
- Start scheduler, stop scheduler, run due jobs now, and refresh controls.
- A kill-switch banner when global safety is enabled.
- Due and pending schedule cards.
- Recent scheduler events.
- Scheduler-linked publish attempts.

## Restart and crash behavior

The saved `enabled` flag records the operator's last choice (it changes only when the operator presses Start or Stop), but Linkgo does **not** start the worker on launch. If the scheduler was on before a restart — tray Quit, crash or forced kill — status reads `enabled: true, running: false` until the operator presses Start again. A scheduler that was stopped before the restart reads `enabled: false, running: false`. Power loss is expected to behave the same as a forced kill but is untested.

On startup Linkgo only runs the recovery sweep, which never contacts LinkedIn. The same sweep runs again whenever **Safety** lists open publishes. An execution is **stale** when it has had no update for 10 minutes (`STALE_EXECUTION_SECONDS`); the sweep only touches stale executions:

- a stale `reserved` execution (never sent) is released as `abandoned`, and its job stays retryable;
- a stale `in_flight` execution (may have reached LinkedIn) becomes `outcome_unknown` and is never retried automatically.

An execution interrupted less than 10 minutes before Linkgo restarted is not stale yet, so it still shows as in progress rather than outcome unknown. Its lease still blocks a duplicate publish with the same idempotency key.

The Scheduler tab makes this visible: when status is `enabled: true, running: false`, the status card reads **Stopped after restart** and a notice says the scheduler was on before Linkgo last closed and asks the operator to check Safety before pressing Start scheduler. Nothing starts automatically; the notice clears once the operator starts or stops the scheduler.

Operator recovery after a restart:

1. Open **Safety** and reconcile every publish marked outcome unknown: check LinkedIn, then choose Posted (with the URL) or Not posted and type the confirmation. If Linkgo restarted less than 10 minutes after the interruption, a publish may still show as in progress; wait and reopen Safety before pressing Start.
2. Review due jobs on the Scheduler screen.
3. Press Start.

Verified on the packaged Windows build with a hard kill (`docs/verification/2026-09-27-desktop-release-candidate.md`).

## Explicit exclusions

- Launch-on-login can open Linkgo, but the scheduler still only runs while Linkgo is running or hidden to tray and only after the operator starts it.
- No scheduler execution after Linkgo quits.
- No LinkedIn API commenting.
- No scraping or browser automation.
- No autonomous content generation.
- No external telemetry.

## Verification commands

```bash
bun run test -- tests/scheduler.spec.ts
bun run test:rust
bun run check
```
