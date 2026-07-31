# Linkgo Architecture

Linkgo is a Tauri v2 desktop app with a React frontend and local SQLite database.

## Layers

- `src-tauri/` owns OS integration, app lifecycle, plugin registration, commands, system tray behavior, and SQL migrations.
- `src/lib/` owns frontend infrastructure such as environment detection, database access, window helpers, and utility functions.
- `src/components/` owns reusable desktop shell and UI primitives.
- `src/features/<feature>/` owns product slices: types, schemas, data, hooks, components, and exports.
- `src/workflows/` owns durable orchestration contracts, workflow state-machine data access, and resumable run history.
- `src/agent/` owns tool schemas, provider interfaces, dry-run provider logic, and model-loop adapters. `src/agent/index.ts` is the public runtime contract boundary; UI imports `src/features/agent-runtime`, not runtime loop internals.

## Tauri boundary

Rust code should only handle work that needs OS integration, app lifecycle, plugins, native credential access, local background workers, or durable migrations.

The scheduler lives in `src-tauri/src/scheduler` because due-job execution must continue while the webview is hidden to tray and must reuse native LinkedIn OAuth credentials without exposing tokens to React.

Frontend feature code talks to SQLite through `src/lib/db.ts`, which wraps `@tauri-apps/plugin-sql` and provides browser/test fallbacks. Frontend scheduler controls call native `linkgo_scheduler_*` commands for start, stop, status, and bounded manual ticks.

The local Autopilot Planner lives in `src-tauri/src/autopilot_planner.rs`. Native `linkgo_autopilot_planner_*` commands own status, start, stop, and bounded tick behavior because the worker must continue while the webview is hidden to tray, coordinate concurrent ticks with SQLite, and obey the process lifecycle. The worker stops when Linkgo quits. Every source-batch materialization runs in one `BEGIN IMMEDIATE` SQLite transaction with no network or model call inside it.

## Source connector boundary

`src/features/source-imports/connectors.ts` is the closed connector registry and normalized batch contract. The only registered connector is `local_json`: local, operator-supplied, available, and forbidden from fetching externally.

Local JSON parsing feeds one internal policy-enforced source-batch writer carrying the connector key. The planner consumes terminal `source_import_batches` by `source_type`; it never calls connector-specific parsing or fetch code. A future production connector must pass API-access, terms, permissions, and permitted-use review, then ingest through this boundary after a migration expands the database `source_type` constraint.

## Autopilot planner boundary

An eligible planner batch belongs to an active campaign with `auto_pilot = 1`, has terminal import status and at least one originally accepted row, and has no existing `autopilot_plans` owner. The native transaction revalidates campaign state, batch state, current candidate links, and source ownership. It then creates either:

- one durable `skipped` plan when accepted candidates were deleted; or
- one queued score-first workflow, seven canonical steps with research complete, two workflow events, one due-now Linkgo scoring backlog item, one `planned` linkage, and one planner event.

The unique source-batch plan key and immediate transaction make worker/manual overlap idempotent. The global kill switch blocks worker start and tick materialization. Planner events contain bounded summaries and IDs, not imported source content. React reads bounded plan/event projections and parses every native status/tick response with Zod.

## Feature slice contract

Each new feature must add:

1. A modular migration under `src-tauri/src/migrations`.
2. Feature types under `src/features/<feature>/types`.
3. Zod schemas under `src/features/<feature>/schemas.ts`.
4. SQL data functions under `src/features/<feature>/data.ts`.
5. A React hook for UI state/actions.
6. Components under `src/features/<feature>/components`.
7. Documentation under `docs/features`.
8. Playwright tests.

## Database conventions

- Use SQLite bind placeholders (`$1`, `$2`, ...).
- Keep timestamps as text with `datetime('now')` until a cross-feature time abstraction lands.
- Prefer one migration per feature slice.
- Avoid dead schema for roadmap items that do not have data access and UI yet.
- Native background workers must not hold SQLite transactions during external network calls.
