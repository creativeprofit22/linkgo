# Safety + Observability

## Status

Partially implements Roadmaps 16 and 20 through the local-first Safety tab and cross-feature safety data layer. External telemetry, complete per-account policy, cooldowns, and automatic rejected-draft/low-performance error items remain future work.

## What it does

- Provides a global kill switch (on screen: "Emergency pause", turned on with "Pause everything") for automation-like and external actions.
- Blocks local schedule starts, agent run starts (shown as "AI assistant task"), native scheduled publishing, and approved LinkedIn comment posting while the kill switch is enabled.
- Enforces each campaign's `daily_post_limit` for same-day scheduling and publishing safety paths.
- Enforces each campaign's `daily_comment_limit` before successful LinkedIn or manual comment posting records.
- Records append-only safety audit events.
- Records append-only rate-limit decisions for allowed and blocked schedule, publish, and comment attempts.
- Creates operator-fixable error queue items (shown as "Problems to fix") for failed publish attempts, failed comment attempts, rejected approvals, failed agent runs, and terminal failures from the scheduler (shown as "Auto-posting").
- Lets operators move error queue items through `open -> in_progress -> awaiting_review -> resolved`, plus failed and reopen paths.

## UI

The Safety tab includes:

- Campaign filter with an all-campaigns view.
- Emergency pause card (global kill switch) with reason text.
- Summary cards: "Problems to fix", "Stopped by limits today", "Allowed by limits today", and "Safety history".
- Problems to fix (error queue) cards with status transition buttons.
- Rate-limit decision history ("Posting limits").
- Safety audit event history ("Safety history").

Archived campaign history stays visible. Archived campaign error queue rows cannot be changed until the campaign is restored. The global kill switch remains editable because it is app-level.

## Data

Migration version `8` creates:

- `safety_settings`
- `safety_audit_events`
- `rate_limit_events`
- `error_queue_items`

Blocked preflight events are written before caller transactions begin, so safety history survives rejected actions. Allowed/success events are written inside the transaction that performed the action.

### Native mutations

The two operator mutations are owned natively in `src-tauri/src/safety.rs` and run on one pinned `BEGIN IMMEDIATE` connection:

- `linkgo_safety_set_global_kill_switch` (`setGlobalKillSwitch`) — updates `safety_settings` and writes the `kill_switch_enabled`/`kill_switch_disabled` audit row together. Returns `{ enabled, reason }`.
- `linkgo_safety_set_error_queue_item_status` (`setErrorQueueItemStatus`) — re-reads the item, rejects archived-campaign items and illegal transitions (`open → in_progress|failed`, `in_progress → awaiting_review|failed`, `awaiting_review → resolved|failed`, `resolved|failed → in_progress`), then updates and audits. Returns `{ id, previousStatus, status }`.

Inputs reject unknown fields and oversize text (reason ≤ 1000, notes ≤ 2000 chars) before any storage access. Any failure rolls back both writes. Real-SQLite tests live in `src-tauri/src/safety_tests.rs`.

### Native reads

The renderer has no direct SQL access to the safety tables. `src-tauri/src/safety_dashboard.rs` owns the reads:

- `linkgo_safety_settings_get` (`getSafetySettings`): recreates a missing singleton row and returns it, both in one transaction.
- `linkgo_safety_dashboard_get` (`listSafetyDashboard`): takes an optional positive `campaignId` and rejects unknown fields. Returns the settings, the four summary counts, and the error queue, rate-limit and audit lists, each capped at 50 rows. Everything is read in one transaction, so the counts and lists match each other.

Tests in `src-tauri/src/safety_dashboard_tests.rs` cover campaign filtering, list order and caps, rollback when row recreation fails, and reads running alongside a kill-switch change.

## Integrations

### Approvals and LinkedIn publishing

- `scheduleApproval` checks the kill switch and campaign daily post limit before creating or updating a schedule.
- Allowed and blocked schedule decisions create rate-limit and safety audit rows.
- `cancelSchedule` records `schedule_cancelled`.
- Explicit OAuth-backed LinkedIn publishing is available only for approved or scheduled posts and records success or failure locally.
- `recordPublishAttempt` records publish success/failure and creates an error item on failure.
- `setApprovalStatus` records rejected approvals and creates an error item.

### Native scheduler

- The opt-in native scheduler runs only while Linkgo is open or hidden to the system tray.
- Due jobs re-check approval state, the global kill switch, idempotency, lock state, retry state, and post limits before the shared OAuth publishing helper runs.
- Retryable failures use bounded backoff. Terminal failures return the approval to a recoverable state and create scheduler events and error queue items.
- Launch-on-login may open Linkgo, but no scheduler process continues after Linkgo quits.

### Agent runtime

- `startAgentRun` checks the kill switch before claiming a dry-run or provider-backed run.
- Claimed runs record `agent_run_started`.
- Failed agent runs record `agent_run_failed` and create or update an error item.

### Comments

- Approved comment variants can be posted through the LinkedIn API only after explicit operator confirmation and permission preflight.
- LinkedIn API posting checks current publish safety before invoking the native command.
- `recordCommentAttempt` applies kill-switch and campaign-limit rules to successful local attempt records.
- Successful posted records enforce `daily_comment_limit` with `rate_limit_events.action = 'comment'`.
- Failed API or manual comment attempts create an open error queue item with a safe local error message.

## Explicit exclusions

This safety foundation does not add:

- Scraping or arbitrary browser automation.
- Autonomous post, comment, approval, or calendar actions.
- Background agent workers.
- Scheduler or metric-refresh execution after the Linkgo process quits.
- External telemetry or hosted observability services.
- Complete cooldown and per-account policy controls.

OAuth-backed publishing, API comments, and the native scheduler are implemented integrations, not exclusions. Every LinkedIn write remains human approval-gated, and scheduled publishing only acts on already-approved content.
