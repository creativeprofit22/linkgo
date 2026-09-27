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

For the Windows desktop app and full verification gate, install the
[Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows):
Microsoft C++ Build Tools with **Desktop development with C++** (including the
Windows SDK), Microsoft Edge WebView2 Runtime, and Rust via rustup using the MSVC
toolchain. MSI packaging additionally requires the Windows VBSCRIPT optional
feature; packaging is not part of the verification baseline.

Use **Bun 1.4.2**, pinned in `package.json` and CI (latest stable verified on
2026-09-14), plus Node.js for the installed Playwright CLI. This baseline used
Node 22.20.0. `rust-toolchain.toml` selects `stable` with rustfmt and Clippy,
not a numeric Rust pin; record `rustc --version` and `cargo --version` when
reporting results. The current baseline used Rust/Cargo 1.97.1.

From the repository root:

```bash
bun --version
bun install --frozen-lockfile
node node_modules/@playwright/test/cli.js install chromium
bun run check
```

Chromium is a separate download selected by the installed Playwright 1.59.1
package. A system Chrome installation or WebView2 does not replace it. Missing
browser executables are setup failures, not demonstrated application defects.
The full gate needs the native build prerequisites even though Playwright runs
against a local browser preview with injected Tauri mocks.

## Development

```bash
bun run dev        # browser preview only (nothing is saved)
bun run tauri:dev  # the real desktop app with local persistence
```

Linkgo stores data only through native Tauri commands, so use
`bun run tauri:dev` for real work. `bun run dev` opens a **browser preview**:
a banner reads "Browser preview — nothing is saved", credential and
launch-on-login controls are disabled, and any feature that needs native data
shows "Not available in the browser preview. Linkgo saves data only in the
desktop app — run `bun run tauri:dev`." That message means the preview
restriction, not a bug; errors in the desktop app keep their own native
messages. Playwright specs inject Tauri mocks, which are only honoured in
Playwright builds.

### Release-candidate test build (test-only)

`bun run tauri:build:rctest` builds installers under a separate identity
(`Linkgo RC Test`, identifier `com.linkgo.app.rctest`, binary
`linkgo-rctest.exe`). It installs side by side with the real app and uses its
own data folder (`%APPDATA%\com.linkgo.app.rctest`), single-instance lock,
launch-on-login entry and keyring namespace (`linkgo:com.linkgo.app.rctest`),
so desktop verification never touches your real Linkgo data or credentials.
It is for verification only — never distribute it. Any isolated build must
override `identifier`, `productName` and `mainBinaryName` together: the
launch-on-login entry is named after `productName`, not the identifier, and the
desktop harness tells builds apart by binary name.

## Verification

```bash
bun run check:renderer-transactions
bun run check:architecture
bun run format:check
bun run format:rust:check
bun run lint
bun run lint:rust
bun run build
bun run test
bun run test:rust
```

Use `bun run check` for the full quality gate, in the order shown above. Formatting
checks all supported nonignored repository files with `prettier --check .` and all
Rust workspace members with `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`.
Strict Clippy checks all targets and features with
`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`.
The Rust toolchain includes the required rustfmt and Clippy components.

Run `bun run format` to repair Prettier formatting across the same repository-wide
scope, including tests and root configuration files. Both Prettier commands respect
`.prettierignore`; review the resulting diff before committing.

The gate stops on the first failure; later checks are not counted as passes.
Existing formatting failures must remain visible until separately remediated, and
an interrupted run remains incomplete rather than a release pass.
GitHub Actions runs this same gate on Windows for pull requests, `main`, version
tags, and published releases. Only after the quality job succeeds do version tags
and published releases build and retain the MSI and NSIS installers as workflow
artifacts.

The [2026-09-14 audit and current re-verification](docs/verification/2026-09-14-app-audit.md)
record individual exits, browser inventory reconciliation, and environment details.
Passing this gate does not verify packaged installation/startup, real desktop IPC
or keyring, live OAuth/AI/LinkedIn, native scheduler crash recovery, or other
platforms. Browser-only development is a preview, not native persistence.

### Desktop release-candidate verification

The [2026-09-27 desktop release-candidate report](docs/verification/2026-09-27-desktop-release-candidate.md)
verified the packaged NSIS build on **Windows 10 Pro 22H2 x64 (WebView2)**
only, using the isolated RC test identity and disposable databases: install,
fresh and upgraded startup, real IPC/ACL/SQLite, OS keyring, tray/quit,
single instance, launch-on-login, the campaign-to-schedule workflow, scheduler
behavior without a LinkedIn credential, hard-kill recovery, operator
reconciliation and a backup/restore drill. `bun run test:desktop` reruns the
real-app checks against a running RC build (it is not part of `bun run check`);
it requires `LINKGO_DESKTOP_SCENARIO` and a prepared RC profile — see
[Rerunning the desktop harness](docs/verification/2026-09-27-desktop-release-candidate.md#rerunning-the-desktop-harness).

This is a **local release candidate, not verified live-service availability**.
Not verified: live AI providers, LinkedIn OAuth and publishing, the MSI
installer, Windows 11, Windows on ARM, macOS and Linux.

### Lifecycle and data you should know about

- Closing the window hides Linkgo to the tray; work continues only while the
  process runs. **Quit** from the tray stops everything — nothing runs after a
  full quit, and nothing publishes without a human approval.
- The scheduler does **not** restart itself when Linkgo starts, even if it was
  on before quitting or a crash. Check **Safety** for publishes marked outcome
  unknown (an interrupted publish can take up to 10 minutes to be marked, so
  reopen Safety if it still shows in progress), then start the scheduler again.
- Uninstalling keeps your data folder. Back up and restore with the
  [backup and restore procedure](docs/operations/backup-restore.md).

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

1. SQL migration in `src-tauri/src/migrations` when storage changes; no unused tables.
2. Types and Zod schemas in `src/features/<feature>` or shared orchestration folders such as `src/workflows`.
3. Typed feature capability/data API, with authoritative durable mutations in native code.
4. React hook for state/actions when applicable.
5. UI components when the slice needs UI.
6. Docs and applicable contract, Playwright and native SQLite tests.

Follow the [contributor checklist](docs/CONTRIBUTING.md) and
[architecture boundaries](docs/architecture-boundaries.md). The architecture gate
checks resolved imports and runtime/type dependency cycles against a finite,
reviewed legacy inventory. New allowances require architecture review; deleting
an import also requires pruning its exact stale allowance. Current implementation
results and limits are in [boundary verification](docs/verification/modular-architecture-boundaries.md).

LinkedIn publishing and commenting are OAuth-backed and approval-gated; the scheduler only publishes already-approved scheduled posts while Linkgo is running or hidden to tray. API commenting requires LinkedIn Community Management access and `w_member_social_feed`. Metric refresh is opt-in, runs only while Linkgo is open or hidden to tray, requires approved `r_member_social_feed` read access, and collects LinkedIn reactions/comments only. Source import accepts bounded local post metadata through the closed `local_json` connector contract, enforces campaign source, age, banned-topic, and prior-contact rules before candidate writes, and never makes an external request. The opt-in native Autopilot Planner consumes only terminal policy-enforced source batches and creates local backlog/workflow/candidate-artifact records. The planner never invokes a model. Planner-linked scoring is separately operator-confirmed in Workflows, excludes `dry_run`, sends bounded approved context through the native credential boundary, and commits an exact score set atomically. Planner-linked drafting is separately operator-triggered, uses fixed intent routes and bounded untrusted reference data, and advances only after explicit transactional save. No planner, scoring, or drafting path invokes a scheduler publish command, comment command, scraper, browser automation, or remote connector.
