# Autopilot Planner

## Status and purpose

Roadmap 3D is implemented. The Autopilot Planner is an opt-in, local-only bridge from completed policy-enforced source batches to explicit Linkgo work.

One eligible source batch creates exactly one durable plan, one due-now Linkgo scoring backlog item, and one queued content workflow. Research is already represented by the accepted source batch, so the workflow's `research` step is complete and `score` is the first pending step.

Roadmap 3 remains partial and blocked on one compliant production source connector. The only available connector is operator-supplied `local_json`.

## Eligibility

A source batch is processable by a planner tick when:

- its campaign exists, is `active`, and has `auto_pilot = 1`;
- the batch is `completed` or `completed_with_errors`;
- the batch originally accepted at least one row; and
- no `autopilot_plans` row already owns the batch.

The bounded eligibility query and the dashboard's **Eligible now** count use this same predicate. They run oldest-first with `autopilot_planner_settings.max_batches_per_tick`, default `3`.

Terminal batches with zero originally accepted rows are ignored. Processing and failed batches are ignored. Draft, paused, archived, and non-autopilot campaigns are ignored.

Current candidate links determine the outcome after selection, not whether a batch is processable. A processable batch with at least one surviving accepted candidate creates linked backlog and workflow work. If every originally accepted candidate was later deleted, the tick instead creates one durable `skipped` plan with no backlog/workflow links. The plan removes the batch from **Eligible now**, and the unique source-batch key prevents repeated retries.

## Atomic lifecycle

For every selected batch, the native planner opens one immediate SQLite transaction, re-reads `safety_settings`, and only then revalidates campaign state, autopilot eligibility, batch state, current candidate count, and absence of an existing plan. If the global kill switch was enabled after selection or an earlier batch, the transaction records one batch-linked `planner_blocked` event, creates no plan/backlog/workflow records, and stops the tick.

A planned transaction creates:

1. one queued `content_pipeline` workflow run with `current_step_key = 'score'`;
2. all seven canonical workflow steps;
3. a completed research step with bounded source-batch output;
4. `run_created` and research `step_completed` workflow events;
5. one due-now, one-off, Linkgo-owned `scoring` backlog item;
6. one `planned` source/backlog/workflow linkage; and
7. one `candidate_post` workflow artifact per surviving accepted candidate, attached to the score step; and
8. one `batch_planned` planner event.

Any insertion failure rolls back all workflow, step, workflow-event, backlog, and plan records. A safe `batch_failed` event is then recorded with the source batch's campaign and batch IDs, but without imported source content. This attribution keeps campaign-filtered failure counts and event history complete. Other bounded batches continue.

`autopilot_plans.source_import_batch_id` is unique. Immediate transactions, in-transaction revalidation, and that unique key make repeated ticks, concurrent ticks, and worker/manual overlap idempotent.

## Native worker and commands

`src-tauri/src/autopilot_planner.rs` exposes:

- `linkgo_autopilot_planner_status`
- `linkgo_autopilot_planner_start`
- `linkgo_autopilot_planner_stop`
- `linkgo_autopilot_planner_tick`

The worker is disabled by default. Starting it persists `enabled = 1`, runs an immediate bounded tick, and then sleeps for the current persisted poll interval. It runs only while Linkgo is open or hidden to tray and stops with the process. A manual tick works while the background worker is stopped.

A worker-level tick failure records a global `tick_failed` event with no campaign, source batch, or plan linkage. Batch materialization failures remain `batch_failed` events attributed to their campaign and source batch. Migration 28 expands the persisted event constraint for `tick_failed` without changing already-applied migration 27.

The global kill switch blocks start and tick materialization. Every selected batch rechecks the switch inside its `BEGIN IMMEDIATE` transaction, so enabling it during a bounded tick stops later batches before local work is created. Existing plans, backlog items, and workflows remain unchanged.

## Connector contract

`src/features/source-imports/connectors.ts` declares the closed source registry, connector keys, local/remote mode, availability, and external-fetch permission.

`local_json` is the only key. It is available, local, operator-supplied, and cannot fetch externally. Local JSON parsing passes a normalized connector batch into the existing policy-enforced candidate writer. The planner reads terminal batches by connector key and does not call connector-specific code.

A production connector is not enabled by changing the TypeScript registry alone. It requires API-access, terms, permission, and permitted-use approval plus a migration that expands the SQLite `source_type` constraint.

## Dashboard

The Autopilot tab sits between Campaigns and Backlog. It provides:

- exact local-only scope copy;
- refresh, bounded manual tick, and start/stop controls;
- disabled start behavior and a visible banner under the global kill switch;
- all-campaign or campaign-specific filtering;
- processable (labeled **Eligible now**), planned, skipped, and campaign-attributed seven-day batch-failure counts;
- first-use guidance for campaign eligibility and approved source import;
- source-to-plan cards with imported/current/planned candidate counts;
- linked backlog and workflow IDs/states, score-step state, and latest scorer provider/status;
- paused, draft, archived, empty, filtered-empty, loading, error/retry, pending, blocked, skipped, failure, and success states; and
- bounded recent planner events with explicit severity text.

Backlog cards distinguish manually created Linkgo responsibility labels from planner-linked rows. Live planner-linked scoring items are read-only projections of the score step and direct recovery to Workflows. Workflow cards show `Autopilot plan #… · source batch #…` origins and aggregate current/unscored/scored/removed candidate artifacts. Autopilot and Backlog never start the model.

The hook guards duplicate actions and uses monotonically increasing request IDs so an older campaign-filter response cannot overwrite the latest selection. Native responses are parsed with Zod. Controls fail clearly outside the Tauri desktop runtime.

## Safety and exclusions

The planner only creates local records. It does not:

- call LinkedIn or any remote source API;
- scrape, search a feed, or automate a browser;
- invoke a model or run the workflow executor;
- score candidates, draft content, approve, schedule, publish, or comment;
- change credentials or create account abstractions;
- run after Linkgo quits;
- send notifications or external telemetry.

Publishing and commenting remain human approval-gated. Roadmap 5A adds a separate attended `Score batch` action in Workflows for the exact artifacts. The native planner remains model-free; see `docs/features/relevance-scoring.md`.

## Verification

Rust tests cover real SQLite constraints, `tick_failed` validity, oldest-first bounds, eligibility exclusions, research/score workflow state, repeat and concurrent idempotency, deleted-candidate skips, campaign-attributed rollback failures, initial kill-switch blocking, and a deterministic mid-tick kill-switch trigger that blocks the second eligible batch.

Playwright covers native response parsing, planner controls, exact linkage, Backlog and Workflow origin markers, repeated ticks, processable-count parity before and after durable deleted-candidate skips, campaign-filtered rollback failure visibility and recovery, initial and mid-tick kill-switch behavior, stale campaign responses, loading/error/empty states, keyboard focus, duplicate action guards, reduced motion, forced colors, and 320-pixel reflow.

Run:

```bash
bunx playwright test tests/autopilot-planner.spec.ts
bun run test:rust
bun run format:check
bun run lint
bun run build
```
