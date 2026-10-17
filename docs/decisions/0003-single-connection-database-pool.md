# 0003 — One SQLite connection for the whole app

- Status: accepted
- Date: 2026-10-16 (backfilled; the decision predates this record)
- Scope: the app database pool (`managed_pool` in `src-tauri/src/autopilot_planner.rs`).

## Context

Native commands, the background scheduler, the planner and the SQL plugin
pool all write to one local SQLite file. Several features settle multiple
tables in one `BEGIN IMMEDIATE` transaction. Concurrent writers on separate
connections raced each other and surfaced as busy errors or interleaved state.

## Options compared

| Option                                       | Fit                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| Pool of N connections + busy timeout         | More read parallelism, but writes still race and need retry logic everywhere.         |
| WAL mode with many readers, one writer       | Better throughput, but needs a separate write path and careful routing of every call. |
| One shared connection (`max_connections(1)`) | Every statement is serialised; transactions can't interleave. Local data is small.    |

## Decision

The managed pool uses `max_connections(1)`, guarded by a `debug_assert`, and
the same pool is handed to the SQL plugin so there is exactly one writer.

## Consequences

- No write races; transaction code stays simple.
- Long queries block everything else, so native commands keep queries bounded
  (for example list reads cap at 500 rows) and never hold a transaction across
  network I/O.
- Raising the limit reintroduces write races; revisit only with measured
  contention and a single-writer design.
