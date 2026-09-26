# Approval loading ownership + honest browser preview (audit F3/F4)

Date: 2026-09-26

## Scope

- **F3** — `useApprovals` let a slow campaign A response overwrite campaign B, left selection failures as unhandled rejections with stale actionable cards, ran a second full load on every selection, and refreshed the campaign captured by a mutation instead of the current one.
- **F4** — outside Tauri, native calls failed with a cryptic `TypeError`, integrations reported fake "Provider connected/disconnected" success, launch-on-login reported "synced differently", and nothing identified the browser preview.

## Changes

- `src/lib/env.ts`: `AppRuntime`, `getAppRuntime()`, `isBrowserPreview()` — runtime check of `window.__TAURI_INTERNALS__` (preview when absent; `test-adapter` only in Playwright builds with an injected mock; otherwise `desktop`).
- `src/lib/tauri.ts`: `DesktopRequiredError`, `isDesktopRequiredError`, `DESKTOP_REQUIRED_MESSAGE`; `invokeCommand` fails closed in preview before calling Tauri. Desktop errors keep native messages.
- `src/features/approvals/hooks/use-approvals.ts`: request id + selected-campaign refs; results/errors applied only by the current request for the current selection; mount load runs once; selection clears old data, sets `campaignLoading`, catches failures into the error card; mutations/refresh reload the campaign selected at completion time. Mutation toasts use `isDesktopRequiredError` to title preview restrictions "Desktop app required" instead of "... was not created/changed"; load and selection error cards keep the desktop-required message.
- `src/features/approvals/components/approvals-view.tsx`: `aria-busy` loading region while a selection loads, Create review disabled, no stale cards when the load failed, error card has `role="alert"`, selector has `aria-label="Selected campaign"`.
- Integrations: mutations throw `DesktopRequiredError` without Tauri or a test adapter; Connect/Manage buttons disabled with described reason in preview.
- Settings: `setLaunchOnLogin` throws `DesktopRequiredError` in preview; switch disabled and described by the guidance text.
- `src/components/browser-preview-banner.tsx` rendered by `WindowFrame` only in preview (`role="status"`).
- Test harness: approval list / eligible-drafts mocks honour per-campaign gates; one-shot `__LINKGO_FAIL_APPROVAL_LIST__`; `__LINKGO_APPROVAL_LIST_CALLS__` request log.
- Injected test adapters remain gated by `IS_TEST`.

## Red → green evidence

Before the fix (same specs, current code at the time):

- `tests/approvals.spec.ts` › "approval campaign selection ownership": 4/4 failed (A's approvals shown under B; no alert on failure; mutation refresh resurrected A; two list requests per selection).
- `tests/browser-preview.spec.ts`: 4/4 failed (no banner, no desktop guidance, enabled switch/buttons).

After the fix:

| Check                                                                       | Result                                |
| --------------------------------------------------------------------------- | ------------------------------------- |
| Playwright `approvals`, `browser-preview`, `integrations`, `settings` specs | 55 passed                             |
| `bun run check:architecture`                                                | 126 tests pass; 0 architecture errors |
| `bun run lint`                                                              | clean                                 |
| `bun run format:check`                                                      | clean                                 |
| `bun run build`                                                             | success                               |
| `cargo test --lib approval_review`                                          | 26 passed                             |
| `cargo test --lib approval_scheduling`                                      | 13 passed                             |
| `cargo test --lib approval_readiness::tests`                                | 5 passed                              |

Full `bun run check` (renderer transactions, architecture, format, Rust format, lint, clippy, build, all Playwright specs, all Rust tests): exit 0 — 331 Playwright tests and 571 Rust lib tests passed.

Native approval code is unchanged; the cargo runs are regression checks. Browser mocks do not certify native IPC.

## Known limits

- Other features are not individually disabled in preview; their loads and mutations surface the shared desktop-required message through existing error cards and toasts.
- A mutation whose follow-up reload fails still toasts the mutation's own failure title (existing behavior).
