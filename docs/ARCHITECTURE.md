# Linkgo Architecture

Linkgo is a Tauri v2 desktop app with a React frontend and local SQLite database.

## Layers

- `src-tauri/` owns OS integration, app lifecycle, plugin registration, commands, system tray behavior, and SQL migrations.
- `src/lib/` owns frontend infrastructure such as environment detection, database access, window helpers, and utility functions.
- `src/components/` owns reusable desktop shell and UI primitives.
- `src/features/<feature>/` owns product slices: types, schemas, data, hooks, components, and exports.
- `src/workflows/` owns durable orchestration contracts, workflow state-machine data access, and resumable run history.
- `src/agent/` owns tool schemas, provider interfaces, dry-run provider logic, and model-loop adapters. Its current index mixes runtime and contracts; it is not a safe UI contract. UI composes `src/features/agent-runtime`, not agent loop internals.

The [enforced boundary map](architecture-boundaries.md) defines current versus target ownership, public feature entry points, exact legacy exceptions and native responsibilities. The machine policy is [architecture-policy.json](../scripts/architecture-policy.json). Feature UI calls typed APIs/hooks; workflows coordinate capabilities; agents own model/tool contracts; native modules own authoritative durable mutations, credentials and OS integration.

## Attended draft quality loop

The Draft variant UI starts a bounded quality loop only after a completed canonical non-blocking current-revision AI audit. Native Tauri commands own all multi-statement writes in one immediate SQLx transaction: claim, score settlement, rewrite/revision increment, deterministic audit regeneration, re-audit reservation, continuation, failure, resume, and stale reconciliation.

Provider calls are serial and outside transactions. Strict schemas and echoed campaign/variant/run/attempt/revision identity are validated before settlement. A score below 70 permits at most two evidence-grounded rewrites; each is AI-audited before re-scoring. Failure, stale content, blocking audit, exhaustion, or missing rewrite ends durably without approval or external action. Runs with no activity on the run, its active agent or its active audit for 15 minutes become explicitly resumable.

Recovery has a single owner, `draft_quality.rs`. Fail, reconcile and resume settle the run, its attempts, linked scorer/auditor agents (via `agent_run_store::fail_active_agent`) and linked rewrite audits (via `draft_ai_audits::fail_active_audit_run`) in the same transaction. The draft AI-audit reconciler defers quality-owned audits. Late failures, starts and settlements from a prior attempt are rejected natively. New approvals require a passed current-revision quality run with score at least 70.

## Tauri boundary

Rust owns authoritative durable mutations as well as OS integration, app lifecycle, plugins, native credentials, background workers and migrations. Existing renderer persistence is finite migration debt, not the target ownership model.

The scheduler lives in `src-tauri/src/scheduler` because due-job execution must continue while the webview is hidden to tray and must reuse native LinkedIn OAuth credentials without exposing tokens to React.

The renderer has no SQL access. Every feature reads and writes through bounded, feature-specific native commands (`invokeCommand` in `src/lib/tauri.ts`) backed by the managed SQLx pool. Writes run in pinned transactions with native validation and ownership checks, and reads are capped. The renderer holds no `sql:*` permission (`src-tauri/capabilities/default.json`), and `src/lib/db.ts` has been removed. The ESLint `no-restricted-imports`/`no-restricted-syntax` rules and `bun run check:renderer-transactions` fail on any renderer import of `@tauri-apps/plugin-sql` or `@/lib/db`, any `plugin:sql|*` command, or any transaction statement. The Rust side still uses `tauri_plugin_sql` migration definitions, which the native startup migrator applies. Frontend scheduler controls call native `linkgo_scheduler_*` commands for start, stop, status, and bounded manual ticks.

The local Autopilot Planner lives in `src-tauri/src/autopilot_planner.rs`. Native `linkgo_autopilot_planner_*` commands own status, start, stop, and bounded tick behavior because the worker must continue while the webview is hidden to tray, coordinate concurrent ticks with SQLite, and obey the process lifecycle. The worker stops when Linkgo quits. Every source-batch materialization runs in one `BEGIN IMMEDIATE` SQLite transaction with no network or model call inside it.

## Source connector boundary

`src/features/source-imports/connectors.ts` is the closed connector registry and normalized batch contract. The only registered connector is `local_json`: local, operator-supplied, available, and forbidden from fetching externally.

Local JSON parsing feeds one internal policy-enforced source-batch writer carrying the connector key. The planner consumes terminal `source_import_batches` by `source_type`; it never calls connector-specific parsing or fetch code. A future production connector must pass API-access, terms, permissions, and permitted-use review, then ingest through this boundary after a migration expands the database `source_type` constraint.

## Autopilot planner boundary

An eligible planner batch belongs to an active campaign with `auto_pilot = 1`, has terminal import status and at least one originally accepted row, and has no existing `autopilot_plans` owner. The native transaction revalidates campaign state, batch state, current candidate links, and source ownership. It then creates either:

- one durable `skipped` plan when accepted candidates were deleted; or
- one queued score-first workflow, seven canonical steps with research complete, two workflow events, one `candidate_post` artifact per surviving accepted candidate, one due-now Linkgo scoring backlog item, one `planned` linkage, and one planner event.

The unique source-batch plan key and immediate transaction make worker/manual overlap idempotent. The global kill switch blocks worker start and tick materialization. Planner events contain bounded summaries and IDs, not imported source content. React reads bounded plan/event projections and parses every native status/tick response with Zod.

## Planner-linked scoring boundary

`src/workflows/relevance-scoring.ts` owns the foreground scope/context handoff, while `src-tauri/src/relevance_scoring.rs` owns every atomic scoring mutation. Workflows resolves and classifies the plan, source batch, campaign, score step, and candidate artifacts; native capability-specific commands then claim/create the scorer, apply exact scores, settle no-work/failure, and reconcile scorer results on one pinned SQLx connection per mutation.

The claim transaction commits before any provider request. Credentials stay inside the existing Tauri provider command. The model receives only the labeled message context, never credentials, planner event metadata, unrelated candidates, or raw source-import audit JSON.

`score_relevance` validates exact candidate/score set equality. The native score command rechecks ownership and stale state, then writes every score and optional rejection in one immediate transaction. Native workflow reconciliation projects the score step into the linked one-off backlog item without reopening terminal legacy rows or creating recurrence successors.

All-scored scope advances without a provider call. All-removed scope blocks without a provider call. Provider failures leave a durable failed attempt and a visible attended retry. The native planner never imports or calls this model orchestration.

## Planner-linked draft boundary

`src-tauri/src/draft_generation.rs` owns optional workflow scope validation, the draft-step lifecycle, request persistence and generated-draft saves (native, one pinned transaction per mutation); `src/features/drafts/data.ts` only orchestrates the provider run between native commands. A generation request commits before the provider starts. The agent run carries `workflow_run_id` but deliberately omits `workflow_step_id`, preventing generic agent reconciliation from completing the human-gated draft step.

The trusted prompt summary contains only code-owned intent instructions plus explicit operator angle/voice notes. Campaign and candidate fields live in bounded `input_context_json` reference data and are serialized between untrusted-data delimiters. The `draft_post` arguments carry the provider-authored variants; completed input and output must preserve those normalized variants and match the durable request ID, campaign, candidate, intent, and exact 3–5 count.

Provider success leaves linked `draft` work running. Only explicit save uses one transaction to create the draft, variants, deterministic audits, request settlement, draft artifact, workflow events, and transition to `audit`. Provider failure or dismissal blocks the linked step and releases the partial unique active-request claim for retry. No background generation, AI rewrite loop, approval creation, scheduling, publishing, scraping, or production connector is part of this boundary.

## Feature slice contract

Each new feature must add:

1. A modular migration under `src-tauri/src/migrations` when storage changes; never pre-create unused tables.
2. Feature types under `src/features/<feature>/types`.
3. Zod schemas under `src/features/<feature>/schemas.ts`.
4. Typed capability/data functions under `src/features/<feature>/data.ts`, with native durable ownership.
5. A React hook for UI state/actions when applicable.
6. Components under `src/features/<feature>/components` when UI is needed.
7. Documentation under `docs/features` and declared public boundaries.
8. Applicable contract, browser and native SQLite tests; run the architecture gate. See [CONTRIBUTING](CONTRIBUTING.md).

## Database conventions

- Use SQLite bind placeholders (`$1`, `$2`, ...).
- Keep timestamps as text with `datetime('now')` until a cross-feature time abstraction lands.
- Prefer one migration per feature slice.
- Avoid dead schema for roadmap items that do not have data access and UI yet.
- Native background workers must not hold SQLite transactions during external network calls.
