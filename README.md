# Linkgo

Linkgo is a local-first Tauri desktop app for LinkedIn growth operations.

Current status: the app shell, Campaigns slice, persistent Campaign Backlog slice, Roadmap 3D local Autopilot Planner, Candidate Queue slice with campaign-scoped policy-enforced local JSON source import, AI-assisted keyword/trend discovery, operator-triggered relevance scoring, Drafting + Audit, Approvals, Content Calendar, opt-in native Scheduler, approval-gated LinkedIn publishing and commenting, Metrics + Learning, Durable Workflows, Agent Runtime, Skills + Playbooks, Safety + Observability, and OS launch-on-login toggle are delivered. Roadmap 3 remains partial and blocked only on one compliant production source connector. The delivered planner is opt-in and local-only: it converts eligible completed source batches into linked Linkgo scoring backlog items, exact candidate artifacts, and queued workflows, with research complete and score pending. The planner never fetches posts or calls a model. An operator can separately confirm connected-provider scoring for that exact scope in Workflows; validated scores commit atomically and synchronize the workflow, Autopilot projection, and linked backlog item. At the draft step, the operator can request exactly 3–5 intent-routed variants and explicitly save one local draft set before the workflow advances to audit. The native planner itself never drafts, publishes, or comments. LinkedIn scraping, arbitrary browser automation, external telemetry, autonomous external actions, after-quit planner work, and unapproved production connectors remain intentionally excluded.

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

Use `bun run check` for the full quality gate. GitHub Actions runs this gate on
Windows for pull requests, `main`, version tags, and published releases. Version
tags and published releases also build and retain the MSI and NSIS installers as
workflow artifacts.

## Project structure

```text
src-tauri/              Tauri lifecycle, plugins, commands, SQL migrations
src/lib/                Frontend infrastructure and external boundaries
src/components/         Desktop shell and shared UI primitives
src/features/campaigns Campaign setup and local planner eligibility
src/features/autopilot-planner Local planner controls, linkage dashboard, and history
src/features/campaign-backlog Due work, ownership, recurrence, and history
src/features/candidate-queue Manual candidate intake, dedupe, and triage
src/features/candidate-policy Campaign intake rules, editor, and deterministic evaluation
src/features/source-imports Policy-enforced local JSON intake and batch outcomes
src/features/drafts    Manual/generated variants and deterministic audit checks
src/features/approvals Human review, schedule records, and publish attempts
src/features/content-calendar Approved post planning before scheduling
src/features/scheduler Opt-in native due-job controls and scheduler dashboard
src/features/linkedin-actions Approval-gated LinkedIn API action wrappers
src/features/comments  Approval-gated reply drafts, API posting, and attempts
src/features/metrics   Manual metrics, opt-in social metadata refresh, memory, events
src/workflows/          Durable workflow contracts, relevance scoring, draft save-gate orchestration, and SQLite state machine
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

LinkedIn publishing and commenting are OAuth-backed and approval-gated; the scheduler only publishes already-approved scheduled posts while Linkgo is running or hidden to tray. API commenting requires LinkedIn Community Management access and `w_member_social_feed`. Metric refresh is opt-in, runs only while Linkgo is open or hidden to tray, requires approved `r_member_social_feed` read access, and collects LinkedIn reactions/comments only. Source import accepts bounded local post metadata through the closed `local_json` connector contract, enforces campaign source, age, banned-topic, and prior-contact rules before candidate writes, and never makes an external request. The opt-in native Autopilot Planner consumes only terminal policy-enforced source batches and creates local backlog/workflow/candidate-artifact records. The planner never invokes a model. Planner-linked scoring is separately operator-confirmed in Workflows, excludes `dry_run`, sends bounded approved context through the native credential boundary, and commits an exact score set atomically. Planner-linked drafting is separately operator-triggered, uses fixed intent routes and bounded untrusted reference data, and advances only after explicit transactional save. No planner, scoring, or drafting path invokes a scheduler publish command, comment command, scraper, browser automation, or remote connector.
