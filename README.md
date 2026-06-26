# Linkgo

Linkgo is a local-first Tauri desktop app for LinkedIn growth operations.

Current status: the app shell, Campaigns slice, Candidate Queue slice, Drafting + Audit slice, Approvals + Scheduler slice, Metrics + Learning slice, Durable Workflow Engine slice, and Agent Runtime + Tool Schemas slice are implemented. Real AI provider calls, LinkedIn scraping, actual LinkedIn API publishing, background scheduler jobs, automated metrics collection, and comment automation remain intentionally not implemented.

## Stack

- Bun, Vite, React, TypeScript
- Tailwind CSS v4
- Tauri v2 with SQLite via `@tauri-apps/plugin-sql`
- Zod feature schemas
- Playwright end-to-end tests
- Rust plugin and migration wiring

## Setup

```bash
bun install
```

## Development

```bash
bun run dev
bun run tauri:dev
```

## Verification

```bash
bun run format:check
bun run lint
bun run build
bun run test
bun run test:rust
```

Use `bun run check` for the full quality gate.

## Project structure

```text
src-tauri/              Tauri lifecycle, plugins, commands, SQL migrations
src/lib/                Frontend infrastructure and external boundaries
src/components/         Desktop shell and shared UI primitives
src/features/campaigns First product slice: data, schemas, hooks, UI
src/features/candidate-queue Manual candidate intake, dedupe, and triage
src/features/drafts    Manual variants and deterministic audit checks
src/features/approvals Human review, schedule records, and publish attempts
src/features/metrics   Manual metrics, campaign memory, and learning events
src/workflows/          Durable workflow contracts and SQLite state machine
src/features/workflows Workflow cockpit hook and UI components
src/agent/              Tool contracts, provider interfaces, dry-run loop
src/features/agent-runtime Agent runtime history, hooks, and UI components
docs/                   Architecture, data model, roadmap mapping, feature docs
tests/                  Playwright specs and Tauri IPC mocks
```

## Feature slice rules

Every new roadmap feature lands one slice at a time:

1. SQL migration in `src-tauri/src/migrations`.
2. Types and Zod schemas in `src/features/<feature>` or shared orchestration folders such as `src/workflows`.
3. Data API with typed SQL boundaries.
4. React hook for state/actions.
5. UI components.
6. Docs and Playwright coverage.

Publishing and commenting must remain approval-gated and rate-limited.
