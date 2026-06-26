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

Rust code should only handle work that needs OS integration, app lifecycle, plugins, or durable migrations.

Frontend feature code talks to SQLite through `src/lib/db.ts`, which wraps `@tauri-apps/plugin-sql` and provides browser/test fallbacks.

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
