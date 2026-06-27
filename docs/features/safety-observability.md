# Safety + Observability

## Status

Implemented as the local-first Safety tab and cross-feature safety data layer.

## What it does

- Provides a global kill switch for local automation-like actions.
- Blocks local schedule starts and agent dry-run starts while the kill switch is enabled.
- Enforces each campaign's `daily_post_limit` for same-day post scheduling.
- Records append-only safety audit events.
- Records append-only rate-limit decisions for allowed and blocked schedule attempts.
- Creates operator-fixable error queue items for failed publish attempts, rejected approvals, and failed agent runs.
- Lets operators move error queue items through `open -> in_progress -> awaiting_review -> resolved`, plus failed/reopen paths.

## UI

The Safety tab includes:

- Campaign filter with an all-campaigns view.
- Global kill switch card with reason text.
- Summary cards for open errors, blocked decisions today, allowed decisions today, and audit event count.
- Error queue cards with status transition buttons.
- Rate-limit decision history.
- Safety audit event history.

Archived campaign history stays visible.

Archived campaign error queue rows cannot be changed until the campaign is restored.

The global kill switch remains editable because it is app-level.

## Data

Migration version `8` creates:

- `safety_settings`
- `safety_audit_events`
- `rate_limit_events`
- `error_queue_items`

Blocked preflight events are written before caller transactions begin, so safety history survives rejected actions.

Allowed/success events are written inside the transaction that performed the action.

## Integrations

### Approvals

- `scheduleApproval` checks the kill switch and campaign daily post limit before creating/updating a schedule.
- Allowed and blocked schedule decisions create rate-limit and safety audit rows.
- `cancelSchedule` records `schedule_cancelled`.
- `recordPublishAttempt` records publish success/failure and creates an error item on failure.
- `setApprovalStatus` records rejected approvals and creates an error item.

### Agent runtime

- `startDryRunAgentRun` checks the kill switch before claiming a run.
- Claimed runs record `agent_run_started`.
- Failed dry-runs record `agent_run_failed` and create/update an error item.

## Explicit exclusions

This slice does not implement:

- Real LinkedIn publishing.
- LinkedIn OAuth or LinkedIn API integration.
- Comment automation or reply posting.
- Background scheduler execution.
- Background agent workers.
- External telemetry or hosted observability services.

All behavior remains local, manual, and approval-gated.
