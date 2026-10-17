# 0005 — No SQL in the renderer; writes go through native commands

- Status: accepted
- Date: 2026-10-16 (backfilled; the decision predates this record)
- Scope: everything under `src/`.

## Context

Early slices wrote to SQLite from the frontend through the SQL plugin.
Multi-step writes (for example settle a publish and update its approval and
schedule job) need one atomic transaction. Across the IPC bridge a renderer
transaction can be interrupted mid-way and can interleave with native writers.

## Options compared

| Option                                        | Fit                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| Renderer SQL with `BEGIN`/`COMMIT` over IPC   | Fast to build, but not atomic against native writers; easy to leave half-done.        |
| Generic "run these statements" native command | Atomic, but moves all business rules into the frontend and widens the attack surface. |
| Feature-specific native commands              | Each write is one Rust transaction with its own validation and permission entry.      |

## Decision

The renderer never touches SQL. `bun run check:renderer-transactions` fails on
`@tauri-apps/plugin-sql`, `@/lib/db`, `plugin:sql|`, or transaction statements
anywhere in `src/`, with zero allowances. Frontend calls go through
`invokeCommand` in `src/lib/tauri.ts`; each command is registered in Rust and
allowed in `src-tauri/permissions/main-commands.toml`.

## Consequences

- Every new write needs a Rust command, a permission entry and Rust tests.
- Transactions and invariants live in one place and are testable without a UI.
