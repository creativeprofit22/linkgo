# Workflows

## Purpose

The Workflows slice adds a durable local cockpit for resumable content pipeline runs.

It gives operators a visible state machine for the canonical Linkgo pipeline:

`research -> score -> draft -> audit -> approve -> schedule -> measure`

## Implemented

- Workflow runs attached to campaigns.
- Seven canonical content pipeline steps for every run.
- Manual start/resume controls.
- Foreground executor controls for run/resume.
- Manual step transitions for complete, wait approval, block, fail, resume, reopen, and skip.
- Automatic next-step start after a step completes.
- Append-only workflow events for run and step progress.
- Operator notes in workflow history.
- Executor-created `agent_run` artifacts auto-linked to workflow runs and steps.
- Artifact chips in workflow run cards for executor-created agent runs.
- Campaign filtering and archived-campaign mutation blocking.
- Roadmap 3D origin projections for planner-created runs: `Autopilot plan #… · source batch #…`.
- Planner-created runs start queued with research complete and score pending; no executor starts automatically.
- Local SQLite persistence through Tauri migrations.

## Intentionally not implemented

- Background autonomous execution.
- Autonomous LinkedIn posting/commenting.
- Scraping or LinkedIn API calls.
- Background workflow execution, cron, or automatic scheduler execution.
- Manual artifact pickers.
- Automatic links to drafts, approvals, schedules, or metrics. Planner origin links cover only the source batch and plan.
- Non-`agent_run` artifact UI or attachment flows.
- Generic arbitrary workflow builder.
- Safety/error queue tables.

## Data model

### `workflow_runs`

Stores one resumable workflow instance for one campaign, including run status, current step key, context summary, and timestamps. Migration 27 does not add origin columns here; `autopilot_plans.workflow_run_id` is the unique optional reverse link, projected with a left join.

### `workflow_steps`

Stores ordered step state for each run. Each run has one row per canonical step and unique constraints for step key and sort order.

### `workflow_events`

Stores append-only lifecycle events for run creation, start/resume, step changes, completion, cancellation, and notes.

### `workflow_artifacts`

Links workflow runs and optional workflow steps to artifacts. This slice only creates `agent_run` rows from the foreground executor; the table shape leaves room for future artifact types without exposing manual pickers.

### `workflow_step_executions`

Links workflow steps to agent runs so executor work can be resumed and audited without duplicating active step claims.

## Executor lifecycle

1. Run executor starts or resumes the workflow run.
2. The executor creates a role-specific agent run for the active step.
3. The executor auto-links that agent run into `workflow_artifacts`.
4. Agent output completes, fails, blocks, or pauses the step.
5. Research and score steps can populate discovery suggestions or candidate scores through the same dry-run tools when valid local inputs exist.
6. The executor stops at `approve` and approval-gated `schedule_post` calls.
7. Resume executor continues from failed or blocked steps.

## Planner-created lifecycle

1. The local planner creates the run, all seven steps, and two workflow events in the same transaction as its backlog item and plan linkage.
2. `research` is completed from the policy-enforced source batch.
3. The run stays `queued` with `current_step_key = 'score'`.
4. The operator can inspect the plan/source origin before starting or executing the workflow.
5. Existing executor and approval behavior is unchanged.

## Manual lifecycle

1. Create a run for a non-archived campaign.
2. Start the run to begin the first pending step.
3. Complete, block, fail, skip, or wait on each step manually.
4. Completing a step starts the next pending step automatically.
5. The run status follows the current incomplete step.
6. The run completes when all steps are completed or skipped.
7. Cancelled runs keep step history unchanged.

## Safety and approval notes

Workflow state is local-first and operator-driven. The Autopilot Planner creates resumable state only; it never invokes the executor or a model.

The `approve` step is a visible human-review checkpoint, but this slice does not publish anything.

Archived campaigns keep workflow history visible while data mutations are blocked in both the UI and data API.

## Test coverage

Playwright covers:

- Creating and starting a workflow run.
- Rendering all seven canonical steps.
- Advancing steps and recording progress events.
- Waiting-for-approval state.
- Archived-campaign mutation blocking.
- Executor-created agent run artifact chips.
- Workflows tab rendering in the app shell.
- Planner-created run origin markers and score-first state through `tests/autopilot-planner.spec.ts`.

Rust migration tests assert workflow tables, artifact table shape, constraints, event types, step keys, unique constraints, and indexes.
