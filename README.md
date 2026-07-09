# Linkgo

Linkgo is a local-first Tauri desktop app for LinkedIn growth operations.

Current status: the app shell, Campaigns slice, Candidate Queue slice with AI-assisted keyword/trend discovery and operator-triggered relevance scoring, Drafting + Audit slice with operator-triggered save-gated AI draft generation, Approvals slice, Content Calendar slice for approved post planning, opt-in native background Scheduler slice, OAuth-backed explicit and scheduled LinkedIn post publishing, approval-gated LinkedIn API comment posting, Comment/reply Agent slice, Metrics + Learning slice with opt-in LinkedIn reactions/comments refresh, Durable Workflow Engine slice, Agent Runtime + Tool Schemas slice, Skills + Playbooks slice, GG AI provider-backed execution behind explicit connected credentials, Safety + Observability slice, and OS launch-on-login toggle are implemented. LinkedIn scraping, member-post impression/click analytics, external telemetry, autonomous/background content generation, autonomous commenting, autonomous calendar generation, and running scheduler or metric refresh jobs after Linkgo quits remain intentionally not implemented.

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
src/features/drafts    Manual/generated variants and deterministic audit checks
src/features/approvals Human review, schedule records, and publish attempts
src/features/content-calendar Approved post planning before scheduling
src/features/scheduler Opt-in native due-job controls and scheduler dashboard
src/features/linkedin-actions Approval-gated LinkedIn API action wrappers
src/features/comments  Approval-gated reply drafts, API posting, and attempts
src/features/metrics   Manual metrics, opt-in social metadata refresh, memory, events
src/workflows/          Durable workflow contracts and SQLite state machine
src/features/workflows Workflow cockpit hook and UI components
src/agent/              Tool contracts, provider interfaces, dry-run loop
src/features/agent-runtime Agent runtime history, hooks, and UI components
src/features/playbooks Built-in LinkedIn prompt modules and local overrides
src/features/safety   Kill switch, rate limits, audit events, and error queue
src/features/settings OS launch-on-login setting and local app preferences
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

LinkedIn publishing and commenting are OAuth-backed and approval-gated; the scheduler only publishes already-approved scheduled posts while Linkgo is running or hidden to tray. API commenting requires LinkedIn Community Management access and `w_member_social_feed`. Metric refresh is opt-in, runs only while Linkgo is open or hidden to tray, requires approved `r_member_social_feed` read access, and collects LinkedIn reactions/comments only.
