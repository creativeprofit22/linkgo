# Workflows

## Purpose

The Workflows slice adds a durable local cockpit for resumable content pipeline runs.

It gives operators a visible state machine for the canonical Linkgo pipeline:

`research -> score -> draft -> audit -> approve -> schedule -> measure`

## Implemented

- Workflow runs attached to campaigns.
- Seven canonical content pipeline steps for every run.
- Manual start/resume controls.
- Manual step transitions for complete, wait approval, block, fail, resume, reopen, and skip.
- Automatic next-step start after a step completes.
- Append-only workflow events for run and step progress.
- Operator notes in workflow history.
- Campaign filtering and archived-campaign mutation blocking.
- Local SQLite persistence through Tauri migrations.

## Intentionally not implemented

- AI/model execution.
- Provider abstraction.
- Tool execution.
- Scraping or LinkedIn API calls.
- Background workers, cron, or automatic scheduler execution.
- Automatic links to candidates, drafts, approvals, schedules, or metrics.
- Generic arbitrary workflow builder.
- Safety/error queue tables.

## Data model

### `workflow_runs`

Stores one resumable workflow instance for one campaign, including run status, current step key, context summary, and timestamps.

### `workflow_steps`

Stores ordered step state for each run. Each run has one row per canonical step and unique constraints for step key and sort order.

### `workflow_events`

Stores append-only lifecycle events for run creation, start/resume, step changes, completion, cancellation, and notes.

## Manual lifecycle

1. Create a run for a non-archived campaign.
2. Start the run to begin the first pending step.
3. Complete, block, fail, skip, or wait on each step manually.
4. Completing a step starts the next pending step automatically.
5. The run status follows the current incomplete step.
6. The run completes when all steps are completed or skipped.
7. Cancelled runs keep step history unchanged.

## Safety and approval notes

Workflow state is local-first and operator-driven.

The `approve` step is a visible human-review checkpoint, but this slice does not publish anything.

Archived campaigns keep workflow history visible while data mutations are blocked in both the UI and data API.

## Test coverage

Playwright covers:

- Creating and starting a workflow run.
- Rendering all seven canonical steps.
- Advancing steps and recording progress events.
- Waiting-for-approval state.
- Archived-campaign mutation blocking.
- Workflows tab rendering in the app shell.

Rust migration tests assert workflow tables, constraints, event types, step keys, unique constraints, and indexes.
