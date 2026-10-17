# 0002 — Keyring service name derives from the bundle identifier

- Status: accepted
- Date: 2026-10-16 (backfilled; the decision predates this record)
- Scope: where OAuth tokens and API keys are stored (`src-tauri/src/auth/storage.rs`).

## Context

Secrets (LinkedIn, Anthropic, OpenAI, Claude Code, Bright Data) live in the OS
keychain, never in SQLite. Test builds (`com.linkgo.app.rctest`) run on the
same machine as production and must never read or overwrite real credentials.

## Options compared

| Option                                          | Fit                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| One fixed service name for every build          | Simple, but a test build shares and can clobber production credentials.              |
| Service name from an env var or setting         | Flexible, but easy to misconfigure and silently cross builds.                        |
| Service name derived from the bundle identifier | Isolation follows the build automatically; production keeps the short name `linkgo`. |

## Decision

`com.linkgo.app` maps to service `linkgo`; any other identifier maps to
`linkgo:<identifier>`. Data folder and single-instance lock follow the same
identifier (see [ARCHITECTURE.md](../ARCHITECTURE.md), "Identity isolation").

## Consequences

- Test builds are isolated from production data and credentials for free.
- **Hard to reverse:** renaming the production identifier silently orphans
  every user's stored credentials. A rename needs a migration that copies
  entries from the old service name first.
