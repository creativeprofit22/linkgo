# Plain words and guided recovery — microcopy review and verification

Phase `27732629-c5d7-4d7c-8ad0-1ae5bf780cf3`. Plan: `.gg/plans/approved/d2408a2c-f4b7-47a6-8d14-830220a4ebf9.md`. Platform: Windows (win32). Date: 2026-10-10.

The glossary is in [`docs/glossary.md`](../glossary.md) and is enforced by `bun run check:glossary`.

## Microcopy review per screen

| Screen                       | Before                                                                                  | After                                                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ideas → Import posts         | A `Posts (JSON)` box with a JSON example                                                | A row form with **Link** and **Post text**; **Post date** and **Author name** under "More details (optional)"; "Add another post" (up to 50), "Remove post N"   |
| Autopilot cards              | Connector shown as "Local operator-supplied JSON"                                       | "Added by you"                                                                                                                                                  |
| Approvals card               | `Reference: <idempotency key>` inline                                                   | Moved under "Details for support" (collapsed `<details>`)                                                                                                       |
| Approvals / Comments publish | "confirm attempt #N" and "Check it in Safety"                                           | "We couldn't confirm it posted. Check LinkedIn, then tell us below." plus inline "I checked LinkedIn: it posted" / "…it didn't post" buttons on the post itself |
| Publish dialogs              | Attempt numbers in the outcome-unknown alert                                            | "This post may already be on LinkedIn. Don't post it again. …" with no number                                                                                   |
| Autopilot plan card / events | `Plan #N`, `import #N`, `Automation #N`, `Task #N`, AI service name                     | "Plan for <campaign>"; ids and AI service under "Details for support"                                                                                           |
| Campaign backlog item        | "Created by … #id"                                                                      | "Created by Autopilot"; ids under "Details for support"                                                                                                         |
| Draft request card           | "From automation #N"                                                                    | Id under "Details for support"                                                                                                                                  |
| Automation / AI task cards   | Model names, tool-call ids, artifact ids inline                                         | Under "Details for support"                                                                                                                                     |
| Safety reconciliation card   | `Attempt #N`, subject `#N`                                                              | Under "Details for support"                                                                                                                                     |
| Write with AI / dialogs      | Unexplained Goal, Format, Post type, Automation; AI model always visible                | One hint line per field (`aria-describedby`); AI model under "AI settings (optional)" with the default preselected                                              |
| Write with AI submit         | Silently disabled                                                                       | `DisabledReason` says what to do in the dialog ("Pick a post idea above first.", "Choose an automation or a one-off draft above.", "Loading AI settings…")      |
| Approve / Write / Add draft  | Disabled with no route to the fix                                                       | Reason plus "Go to Drafts", "Go to Campaigns" or "Go to Ideas"                                                                                                  |
| Campaign archive             | One click                                                                               | Confirm: "Archive this campaign? Its posts, drafts and schedules freeze until you restore it."                                                                  |
| Failed auto-posts            | Error text only                                                                         | Plain error plus "Schedule again" (approval card, Auto-posting due card, Recent posting attempts, calendar slot), using the existing schedule rules             |
| Terms                        | "Brand voice guide", "No guide", "Pause everything", "variant", "candidate", "workflow" | "Brand voice", "No brand voice", "Emergency pause", "version", "idea", "Automation"                                                                             |

Approval gates, reconciliation rules (typed `RECONCILE`, link required for "posted", native fence check), `canSchedule` and the kill-switch blocks are unchanged. The resolver only pre-selects the answer in the existing dialog.

## Checks run (standalone, after the final edit)

| Check                                                | Result                   |
| ---------------------------------------------------- | ------------------------ |
| `bun run check:glossary`                             | passed                   |
| `node --test scripts/check-glossary.test.mjs`        | passed                   |
| `bun run check:architecture`                         | passed, 0 errors         |
| `node node_modules/typescript/bin/tsc --noEmit -p .` | passed                   |
| `npm run lint`                                       | passed                   |
| `npx prettier --check .`                             | passed                   |
| Full Playwright suite (`npx playwright test`)        | **467 passed** (7.7 min) |

## Probes

### Route-level eyes probes (`affordance.mjs`, `a11y.mjs`, `UIMAXXXING_EYES_NO_INSTALL=1`)

Run against `http://localhost:17420/#/{campaigns,approvals,drafts,queue,safety,playbooks,calendar,today}` on plain Vite. Without the Tauri backend only the app shell renders, so these results cover the shell, not the changed feature controls.

- `a11y.mjs`: 0 ARIA gaps, 0 low-contrast, 0 colour-only, no positive tabindex, tab order in DOM order on every route. Status is `incomplete` because 38 contrast samples could not be computed (layered backgrounds); not verified for those.
- `affordance.mjs`: 0 small targets and 0 missing focus rings; flags `cursor_misuse` on icons and links in the shell (sidebar "Get started", "New campaign" link). These shell elements were not changed by this phase.

### Changed controls (same rules, Playwright with Tauri mocks)

A temporary Playwright spec drove the real flows with the project's Tauri mocks. It applied the `affordance.mjs` rules (32 px floor, focus indicator change on keyboard focus, `cursor:pointer` only on interactive elements) plus accessible names and valid `aria-describedby`/`aria-controls` references. The spec was then deleted.

| Scope                                            | Controls | Small | No focus ring | Cursor misuse | Unnamed | Broken refs |
| ------------------------------------------------ | -------- | ----- | ------------- | ------------- | ------- | ----------- |
| Approval: outcome-unknown resolver               | 2        | 0     | 0             | 0             | 0       | 0           |
| Reconcile dialog (pre-selected "posted")         | 8        | 2\*   | 0             | 0             | 0       | 0           |
| Approval: Details for support (closed / open)    | 1 / 1    | 0     | 0             | 0             | 0       | 0           |
| Campaigns view (Archive, actions)                | 21       | 0     | 1†            | 0             | 0       | 0           |
| Import posts dialog (2 rows, details open)       | 20       | 0     | 0             | 0             | 0       | 0           |
| Drafts view (disabled reasons + fix links)       | 22       | 0     | 0             | 0             | 0       | 0           |
| Write with AI (blocked submit, AI settings open) | 16       | 4\*   | 0             | 0             | 0       | 0           |

\* Native 16 px radios that sit inside full-width clickable `<label>` cards (`p-3`), so the real hit target is above the 32 px floor.
† The sidebar "Get started" link (`setup-launcher.tsx`) is not part of this phase. It is a pre-existing gap, left as a follow-up.

## Known gaps

- Route-level eyes probes can't render feature screens without the native backend. The changed controls were probed through mocked flows instead, as described above.
- `bun run check` also runs the Rust format, lint and test steps; see the final run in the phase evidence.
