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
- Agent-run and saved-draft artifact chips plus one aggregate current/unscored/scored/removed candidate-scope summary.
- Campaign filtering and archived-campaign mutation blocking.
- Roadmap 3D origin projections for planner-created runs: `Autopilot plan #… · source batch #…`.
- Planner-created runs start queued with research complete, score pending, and exact durable candidate artifacts; no executor starts automatically.
- Attended connected-provider **Score batch** confirmation with exact scope, provider/model, threshold, and unchecked low-score rejection.
- Race-safe score attempts, all-scored advance, all-removed block, provider retry, and linked Backlog reconciliation.
- Optional planner-linked draft generation from scored candidate artifacts, held at `draft` until explicit save.
- Atomic save creates one draft artifact and advances the workflow to `audit`; failure/dismissal blocks and permits retry.
- Local SQLite persistence through Tauri migrations.

## Intentionally not implemented

- Background autonomous execution.
- Autonomous LinkedIn posting/commenting.
- Scraping or LinkedIn API calls.
- Background workflow/model execution, cron, or unattended scoring.
- Manual artifact pickers.
- Automatic links to approvals, schedules, or metrics. Draft artifacts are created only by explicit generated-draft save.
- Candidate artifact pickers or source-content rendering; planner candidate artifacts are created natively and aggregated.
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

Links workflow runs and optional workflow steps to artifacts. Migration 30 allows `agent_run`, `candidate_post`, and `draft`. The planner creates candidate artifacts, the foreground executor creates agent artifacts, and the generated-draft save gate creates draft artifacts. Candidate or draft deletion leaves visibly removed provenance without rendering deleted source text.

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

1. The local planner creates the run, seven steps, candidate artifacts, workflow events, backlog item, and plan linkage in one transaction.
2. `research` is completed from the policy-enforced source batch; `score` stays pending.
3. The operator opens **Score batch**, reviews exact scope/provider/context destination, and confirms policy.
4. A restricted native command claims the attempt, creates the scorer run/artifact, and projects workflow/backlog state in one pinned `BEGIN IMMEDIATE` transaction; the provider call starts only after commit.
5. The model must return exactly one score/rationale per attached unscored candidate. A native immediate transaction commits the complete set or nothing.
6. Native result reconciliation completes the execution/score step, starts `draft`, and completes the linked backlog atomically. Failure blocks linked work and exposes retry. All-scored advances and all-removed blocks through native no-work settlement without a provider call.
7. At `draft`, the operator may launch a save-gated request for an eligible scored candidate. Generation leaves the step running; only explicit save atomically attaches the draft and starts `audit`.

## Manual lifecycle

1. Create a run for a non-archived campaign.
2. Start the run to begin the first pending step.
3. Complete, block, fail, skip, or wait on each step manually.
4. Completing a step starts the next pending step automatically.
5. The run status follows the current incomplete step.
6. The run completes when all steps are completed or skipped.
7. Cancelled runs keep step history unchanged.

## Safety and approval notes

Workflow state is local-first and operator-driven. The Autopilot Planner creates resumable state only; it never invokes the executor or a model. Workflows is the sole attended scoring authority and excludes `dry_run` for planner-linked execution.

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
- Planner candidate artifact linkage, bounded provider context, exact/atomic scoring, optional rejection, stale/cross-campaign rollback, provider retry, duplicate actions, all-scored/all-removed paths, provider/archive/kill-switch gates, cross-surface reconciliation, and dialog accessibility.
- Planner-linked draft scope, trusted prompt boundaries, exact counts/intents, save-only advancement, atomic rollback, draft artifacts, ad-hoc behavior, and narrow dialog reflow.

Rust tests assert migrations plus two-connection claim exclusion, complete score rollback, stale/cross-campaign zero-write behavior, and workflow/execution/backlog reconciliation.
