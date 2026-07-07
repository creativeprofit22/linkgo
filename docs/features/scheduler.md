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

The worker claims a job before calling LinkedIn, then releases the SQLite transaction before the network call.

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

Kill switch block:

- Does not call LinkedIn.
- Leaves the schedule job `scheduled`.
- Records a `job_blocked` scheduler event.

## UI behavior

The Scheduler tab shows:

- Status: `Stopped`, `Running`, or `Ticking`.
- Start scheduler, stop scheduler, run due jobs now, and refresh controls.
- A kill-switch banner when global safety is enabled.
- Due and pending schedule cards.
- Recent scheduler events.
- Scheduler-linked publish attempts.

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
