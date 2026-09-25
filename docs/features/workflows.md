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
- Human-triggered planner audit of every saved variant's current revision, executed serially in variant order with the generation provider/model and provider default model fallback.
- Completed-current revision skipping, durable explicit Resume after failure, and transactional 15-minute stale linked-claim recovery.
- Atomic final findings/audit settlement, `audit` completion, and transition to `approve` waiting; finding severity does not auto-approve or auto-block human review.
- Local SQLite persistence through Tauri migrations, including Migration 32's optional unique audit-to-step-execution link.
- Native ownership of run mutations (`src-tauri/src/workflows.rs`): `linkgo_workflow_create_run`, `_start_run`, `_resume_run`, `_set_step_status`, `_cancel_run`, `_add_note` and `_create_artifact` each re-read the run, step and campaign and write on one pinned `BEGIN IMMEDIATE` connection, including the step-transition matrix, run-status projection, planner scoring-backlog sync and the planner draft save-only rule. `_resume_run` reconciles a waiting step from its linked agent run and returns `{ linkedAgentIsActive }`; the renderer then decides whether to continue execution. Real-SQLite tests: `src-tauri/src/workflows_tests.rs`.

## Intentionally not implemented

- Background autonomous execution.
- Autonomous LinkedIn posting/commenting.
- Scraping or LinkedIn API calls.
- Background workflow/model execution, cron, or unattended scoring/auditing.
- Manual artifact pickers.
- Automatic links to approvals, schedules, or metrics. Draft artifacts are created only by explicit generated-draft save, and planner audit completion only puts the existing `approve` step into human `waiting_approval`.
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

Links workflow steps to agent runs so executor work can be resumed and audited without duplicating active step claims. Migration 32 optionally links each planner-owned `draft_ai_audit_run` to one unique step execution; manual audits remain unlinked and unchanged.

## Executor lifecycle

1. Run executor starts or resumes the workflow run.
2. The executor creates a role-specific agent run for the active step.
3. The executor auto-links that agent run into `workflow_artifacts`.
4. Agent output completes, fails, blocks, or pauses the step.
5. Research and score steps can populate discovery suggestions or candidate scores through the same dry-run tools when valid local inputs exist.
6. For a planner-linked saved draft at `audit`, a human starts or explicitly resumes the dedicated serial variant auditor described below.
7. The executor stops at `approve` and approval-gated `schedule_post` calls.
8. Resume executor continues from other failed or blocked steps.

The renderer has no SQL access to workflow tables. `src-tauri/src/workflow_store.rs` owns the reads and step-execution writes:

- `linkgo_workflow_run_list` returns up to 200 runs with their steps, the newest 100 events per run and artifacts, all read in one transaction. Events were previously unbounded.
- `linkgo_workflow_run_validation` returns the single run row the executor checks.
- `linkgo_workflow_step_execution_create` checks the step exists and that any agent run belongs to the same workflow. The database's one-active-execution rule means two claims on the same step at once leave exactly one execution.
- `linkgo_workflow_step_execution_update` checks agent-run ownership. Error text is bounded to 2,000 characters rather than rejected, so a failure is never lost.
- `linkgo_workflow_planner_scoring_scope` and `linkgo_workflow_planner_draft_audit_scope` are read-only, capped scope reads. The planner executors keep their validation rules and messages.

No provider call runs inside these transactions. Tests: `src-tauri/src/workflow_store_tests.rs`.

## Planner-created lifecycle

1. The local planner creates the run, seven steps, candidate artifacts, workflow events, backlog item, and plan linkage in one transaction.
2. `research` is completed from the policy-enforced source batch; `score` stays pending.
3. The operator opens **Score batch**, reviews exact scope/provider/context destination, and confirms policy.
4. A restricted native command claims the attempt, creates the scorer run/artifact, and projects workflow/backlog state in one pinned `BEGIN IMMEDIATE` transaction; the provider call starts only after commit.
5. The model must return exactly one score/rationale per attached unscored candidate. A native immediate transaction commits the complete set or nothing.
6. Native result reconciliation completes the execution/score step, starts `draft`, and completes the linked backlog atomically. Failure blocks linked work and exposes retry. All-scored advances and all-removed blocks through native no-work settlement without a provider call.
7. At `draft`, the operator may launch a save-gated request for an eligible scored candidate. Generation leaves the step running; only explicit save atomically attaches the draft and starts `audit`.
8. At `audit`, **Audit all saved variants** processes every variant's current revision serially in `variant_number` order. It inherits provider/model provenance from the saved generation request, using the provider's default model when the saved model is blank.
9. Each transactional claim chooses the next current revision without a completed audit and links the workflow execution, audit run, and auditor agent before provider execution. Existing completed audits for current revisions are skipped; older revision evidence is retained.
10. A failed provider, validation, stale-revision, or settlement attempt atomically fails the linked audit/agent/execution and workflow step. Processing stops without an automatic retry; **Resume variant audits** is an explicit durable operator action that continues at the failed or next unaudited current revision.
11. Linked claims with no audit, agent, or execution activity for 15 minutes are transactionally recovered as failed. Reconciliation is bounded and idempotent, after which the operator uses the same explicit Resume action.
12. Every successful attempt atomically stores all six findings and completes its linked audit/execution. On the final current revision, that same settlement completes `audit` and moves `approve` plus the workflow to `waiting_approval`. `warning` and `block` findings remain review evidence and do not themselves auto-block approval.
13. This audit slice creates no approval record and performs no approval, scheduling, publishing, or other external automation.

## Manual lifecycle

1. Create a run for a non-archived campaign.
2. Start the run to begin the first pending step.
3. Complete, block, fail, skip, or wait on each step manually.
4. Completing a step starts the next pending step automatically.
5. The run status follows the current incomplete step.
6. The run completes when all steps are completed or skipped.
7. Cancelled runs keep step history unchanged.

## Safety and approval notes

Workflow state is local-first and operator-driven. The Autopilot Planner creates resumable state only; it never invokes the executor or a model. Workflows owns attended planner-linked scoring and saved-draft auditing, excludes `dry_run` for connected planner execution, and requires a human trigger or explicit Resume.

The `approve` step is a visible human-review checkpoint. Planner audit findings, including `block`, do not grant approval or bypass that checkpoint, and this slice does not schedule or publish anything.

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
- Planner-linked saved-draft audit ordering, inherited provider/model defaults, completed-current skipping, explicit Resume, revision updates, 15-minute linked stale recovery, non-blocking finding severity, provenance rejection, and transactional claim/fail/final settlement.

Rust tests assert migrations, including Migration 32, plus two-connection claim exclusion, complete score rollback, stale/cross-campaign zero-write behavior, workflow/execution/backlog reconciliation, and planner-audit transaction boundaries and recovery.
