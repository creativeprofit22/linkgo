# 0004 — Append-only migrations run with foreign keys off

- Status: accepted
- Date: 2026-10-16 (backfilled; the decision predates this record)
- Scope: `src-tauri/src/migrations/`.

## Context

Users keep their SQLite database across upgrades. sqlx records a checksum of
every applied migration in `_sqlx_migrations`. SQLite can't alter most column
constraints in place, so some migrations rebuild tables; with modern
`ALTER TABLE` behaviour a rebuild silently rewrites child foreign keys.

## Options compared

| Option                                         | Fit                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| Edit shipped migrations when schema changes    | Tidy history, but changed checksums stop existing user databases from booting.  |
| Recreate the database on schema change         | Loses user data. Not acceptable for a local-first app.                          |
| Append-only migrations, FKs off during the run | Existing databases always upgrade; table rebuilds keep child references intact. |

## Decision

- New migrations are appended to the end of the list in `migrations/mod.rs`;
  a shipped migration is never edited.
- The runner sets `foreign_keys = OFF` and `legacy_alter_table = ON`, runs
  `repair_provider_parity_references`, applies migrations, restores both
  pragmas, then fails if `PRAGMA foreign_key_check` finds any violation.
- Each table is added by the feature migration that first uses it.

## Consequences

- Mistakes are fixed by a new migration, never by rewriting an old one.
- `repair_provider_parity_references` stays for pre-migration-21 databases.
