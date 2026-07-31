# Linkgo Interface Design Record

## Campaign Backlog design read

- **Surface:** Desktop application dashboard inside the existing Tauri shell.
- **Audience:** One local operator managing several LinkedIn campaigns with keyboard, pointer, narrow-window, zoom, reduced-motion, and forced-colors needs.
- **Single job:** Identify due work and its owner, then move it to the correct planning state without implying external execution.
- **Task and risk:** Repeated operational triage with medium decision cost. Completion can advance recurrence, and cancellation permanently stops a recurrence chain.
- **Content:** Variable campaign/title lengths, overdue and future dates, one-off and recurring work, active and archived campaigns, and up to 100 recent history rows.
- **Platform:** Resizable desktop webview using React, Tailwind, native selects, Radix dialogs, pointer, and keyboard input.
- **Constraints:** Preserve the existing `max-w-6xl` rail, spacing rhythm, typography, cards, buttons, badges, focus treatment, and Lucide icon system. Add no dependency.

## Evidence and thesis

The leading archetype is application UI with dashboard density. The local Candidate Queue and Content Calendar are the strongest implementation evidence because they establish the shell rail, page header, summary, filters, card rhythm, empty states, and archived guidance.

The external observational references are `linear.app` and `superhuman` for stable navigation and predictable action placement, plus `airtable` and `sentry` for aligned operational scanning and visible filters. `miro` is the useful contrast because freeform spatial interaction would weaken this due-date triage job.

**Thesis:** Use one calm operational rail where summary counts establish urgency, filters preserve scope, and bordered task cards expose due time, owner, recurrence, type, and status before actions. The memorable device is the recurrence consequence sentence beside each active recurring item, which ties the interface directly to its planning risk.

First glance: due now, in progress, blocked, Linkgo-owned, and the New backlog item action.

Second glance: campaign, due timestamp, owner, recurrence, work type, status, details, and legal lifecycle actions.

## Reuse map

- Shell, navigation order, content rail, and responsive gutters: `src/pages/home.tsx`.
- Cards and summaries: `src/components/ui/card.tsx`.
- Actions and focus treatment: `src/components/ui/button.tsx`.
- Modal behavior and focus return: `src/components/ui/dialog.tsx`.
- Persistent form labels, text inputs, and textareas: shared UI primitives.
- Status enclosure: existing outline Badge geometry with a Lucide icon and text label.
- Icons: Lucide only.
- Typography, colors, radius, and forced-color foundations: `src/index.css`.

The existing page-header icon tile is retained for sibling-page consistency. This belongs because the shell uses that repeated icon-and-heading anatomy to make section changes recognizable, not as decorative content inside each module.

The four summary cards are retained because they are four auditable current-state decisions specified by the product contract, not invented credibility metrics.

## Craft and state contract

- One aligned `max-w-6xl` rail owns the header, summaries, filters, guidance, and lists.
- Repeated cards share one header, facts grid, consequence copy, and footer anatomy.
- Status is never color-only: every status includes icon plus text.
- Linkgo ownership explicitly says that automatic execution is not yet available.
- Hover and focus reuse named color/border transitions. No hover lift or `transition: all` is introduced.
- The resting interface has no decorative motion; reduced motion removes shared transitions.
- Native select controls reserve `pe-10` for their indicators and collapse to full-width columns.
- Loading keeps the page header and action location stable.
- Empty states distinguish no campaigns, first use, and no filter matches.
- Storage errors retain the dashboard shell and provide Retry.
- Forms preserve values after inline validation or recoverable storage failure.
- Pending state disables duplicate mutation controls.
- Recurring completion states that one future successor will be created.
- Cancellation requires confirmation and states whether the recurrence chain stops.
- Archived campaigns remain readable and reject create, edit, and status mutations in UI and data code.
- Toasts provide live success and failure announcements without moving focus.

## Responsive behavior

At desktop width, summary and fact grids use four columns and filter controls use three aligned columns. At intermediate widths, summaries and facts use two columns. At 320 CSS pixels, summary cards remain a compact two-column scan while the header, filters, facts, action rows, and dialog fields reflow to one column without horizontal document overflow. Content-bearing regions use no fixed height. Long titles and descriptions wrap instead of hiding decision-critical content.

At 200% root text size, controls and cards grow with content and remain operable. Forced colors retain visible borders on cards, buttons, selects, inputs, and dialogs. Keyboard order follows DOM order; Enter opens and submits, Escape closes, and Radix restores focus to the trigger.

## Release evidence

- Targeted Playwright: `tests/campaign-backlog.spec.ts` passed 9/9 on Chromium, including deterministic America/New_York DST recurrence.
- Full Playwright gate: 175/175 passed before the final responsive-only summary revision; affected backlog and shell tests were rerun afterward.
- Full Rust gate: 92/92 passed, including migration constraints and index checks.
- Desktop and 320-pixel captures exist at `.gg/screenshots/campaign-backlog-desktop.png` and `.gg/screenshots/campaign-backlog-narrow.png`.
- Keyboard open/close and focus return, 320-pixel reflow, 200% text, reduced motion, forced colors, loading, empty, error, destructive cancellation, pending, success, archived, and stale-response states are covered by code and Playwright.
- Browser/device matrix: the project release gate uses Playwright Chromium desktop; Tauri desktop window behavior is covered through the same responsive webview surface. Other browser engines and RTL are unverified because they are not configured by the project.
- Project accessibility tooling is limited to Playwright assertions and manual rendered review; no axe dependency is installed. Semantics, names, focus return, forced colors, motion, and reflow passed the available checks.
- Field Core Web Vitals are not applicable as field evidence for this local Tauri view. The final production build completed in 767 ms; the lazy backlog chunk measured 30.81 kB raw and 8.86 kB gzip.

## Anti-default review

No emoji, mixed icon families, glass cards, hover lift, ambient motion, fake proof, decorative chart, bento layout, generated em dash, or new tint-on-tint status family was introduced. The initial render uses real persisted state or explicit empty guidance. Decorative duplication is limited to the established section icon tile and was kept for shell consistency.

## Rendered critique and revision

The first desktop capture established a clear scan path and aligned rail. The first 320-pixel capture exposed the weakest criterion: responsive hierarchy. Four full-width summary cards consumed the first narrow viewport and pushed scope controls too far below the primary action. The revision removed that unnecessary vertical repetition by keeping summaries in a compact two-column grid at 320 pixels. The second capture brings Backlog scope into the first two viewports while preserving readable labels and 24-pixel-plus controls.

Final rubric score: **22/24**.

- Brief specificity 2, hierarchy 2, composition 2, consistency/flow 2.
- Typography 1 because the feature correctly reuses the existing product type stack but does not add a distinct data role.
- Material logic 2, state completeness 2, responsive behavior 2, accessibility 2, motion 2, authenticity 2.
- Visual distinctiveness 1 because the recurrence-consequence copy is product-specific, while the broader card language intentionally remains shared with adjacent Linkgo operations pages.

No criterion required by the quality floor scored zero. The production contract passes for implemented semantics, forms, keyboard/focus, state recovery, narrow reflow, text resize, reduced motion, forced colors, trust copy, and performance bounds. Automated axe output, RTL, non-Chromium engines, and field performance remain explicitly unverified.

## Autopilot Planner design read

- **Surface:** Desktop-native application dashboard with data-dense operational history.
- **Audience:** A knowledgeable local operator managing LinkedIn growth workflows with high sensitivity to accidental automation.
- **Single job:** Confirm exactly which approved source batches became local backlog/workflow work, then start or inspect bounded planning safely.
- **Task and risk:** Repeated, low-volume operational review. Planning is reversible local work, but unclear scope could falsely imply autonomous publishing or commenting.
- **Content:** Long campaign names, source and plan IDs, original/current candidate counts, planned/skipped outcomes, missing linked records, archived/paused campaigns, and bounded event history.
- **Platform:** Resizable Tauri desktop window with pointer and keyboard, horizontal navigation at narrow widths, light/dark themes, 200% text, 320 CSS-pixel reflow, reduced motion, and forced colors.
- **Constraints:** Preserve the shared `max-w-6xl` rail, existing page heading anatomy, Cards, Buttons, native selects, focus treatment, type scale, and Lucide icons. Add no design dependency.

## Autopilot evidence and thesis

Application UI leads because controls and state recognition dominate; dashboard guidance supports bounded history and filtering. Local Scheduler, Campaign Backlog, Workflows, and Candidate Queue surfaces are the primary evidence and override generic external patterns. `linear.app` and `sentry` are conditional structural observations for predictable actions and operational scanning. `miro` is the contrast because freeform spatial composition would weaken auditability.

**Thesis:** Keep planner state and its primary start/stop action first, four decision-changing counts second, then explicit source-to-backlog-to-workflow records and append-only events. Stable bordered geometry and repeated local-only scope language make the automation boundary visible. The product-specific signature is the three-ID source/plan/work linkage paired with imported/current/planned candidate counts.

First glance: local-only scope, worker state, Start/Stop, Plan now, and kill-switch state.

Second glance: eligible/planned/skipped/failure counts, campaign scope, source batch outcome, current candidates, local-work links, and safe event history.

## Autopilot reuse map and craft decisions

- Navigation order, responsive shell, content rail, and lazy feature loading: `src/pages/home.tsx`.
- Status/control precedent: Scheduler status/start/stop/tick controls.
- Summary/filter/card rhythm: Campaign Backlog.
- Workflow state wording: Workflows.
- Source counts and safe outcomes: Source Imports.
- UI primitives: shared Card and Button; native labeled select with `pe-10`; Lucide only.
- Feedback: Sonner plus a polite live result summary; duplicate actions are guarded before async invocation.

The existing heading icon tile is retained because it is the shell's repeated navigation/category grammar. Four summary cards belong because each count changes an operator decision and is derived from SQLite. No gradient, glass, hover lift, ambient motion, fake log, decorative chart, or new badge/pill family is added.

## Autopilot state and responsive contract

- Loading preserves the page header/action location and announces status.
- First use distinguishes no campaigns, no active opted-in campaign, and no approved source batch.
- Filtered empty is distinct from global first use.
- Error state retains scope, explains failure, and provides Retry.
- Pending state disables duplicate start/stop/tick/refresh actions while the campaign filter remains usable for stale-response recovery.
- Kill-switch state uses explicit text, disables Start, and lets a manual tick return an auditable blocked result.
- Planned, skipped, deleted-link, archived, paused/draft, recent-failure, and success states use text rather than color alone.
- Plan cards wrap long values and collapse linkage columns at narrow widths.
- At 320 pixels, header actions use a two-column grid with Start/Stop spanning both columns; summaries stay two columns; every other module uses one column.
- At 200% text, content-bearing regions have no fixed height and actions wrap.
- Shared button motion names properties and respects reduced motion. Forced-colors utility borders preserve card/control boundaries.
- Keyboard order follows DOM order. Native buttons and select provide names, focus, and operation without custom composite widgets.

## Autopilot production checks

The implemented Playwright contract covers local-only/first-use, linked success, durable skip, kill-switch block, rollback/retry, start/stop, duplicate action guard, invalid-native-response recovery, stale campaign response, keyboard focus, 320-pixel reflow, reduced motion, and forced colors. Rust tests cover real SQLite constraints, eligibility exclusions, bounds, repeat/concurrent idempotency, rollback, deleted candidates, and kill-switch behavior.

### Release evidence

- Full Playwright gate: **191/191 passed** on configured Chromium with two workers. After the final action-grid revision, the affected desktop linkage and narrow reflow tests passed again.
- Full Rust gate: **110/110 passed**, including 11 planner/migration tests against real SQLite.
- `bun run format:check`, `bun run lint`, production TypeScript/Vite build, and `git diff --check` passed.
- Desktop and 320-pixel captures: `.gg/screenshots/autopilot-planner-desktop.png` and `.gg/screenshots/autopilot-planner-narrow.png`.
- Keyboard focus, named controls, native select semantics, polite result status, duplicate-action guard, 320-pixel layout, 200% root text descendant bounds, reduced motion, forced colors, long campaign content, loading, empty, filtered-empty, error/retry, blocked, skipped, rollback/recovery, success, and stale-response behavior passed available Playwright checks.
- Build evidence after the final UI revision: Vite completed in **788 ms**; the lazy Autopilot chunk was **20.79 kB raw / 5.64 kB gzip**. Field performance is unverified because this local Tauri view has no field telemetry.
- Browser/device matrix: configured Playwright Chromium desktop plus 320-pixel adaptive webview. RTL, non-Chromium engines, native screen readers, and field devices remain unverified.
- Accessibility tooling is limited to Playwright assertions and rendered/manual semantics review; no axe dependency is installed.

### Rendered critique and revision

The first desktop capture showed stable rail alignment, direct source-to-work evidence, and clear local-only scope, but its header action group wrapped the primary Start action onto a separate desktop row. The first narrow capture kept the primary actions visible, but the empty-state database icon repeated the section's existing icon language without adding meaning.

The revision removed that unnecessary empty-state icon and changed the action grid to auto-fit: two columns at normal 320-pixel text, one column when 200% root text requires it, and three aligned columns from the small breakpoint. The second desktop capture keeps Refresh, Plan now, and Start planner on one line; the second narrow capture preserves two compact actions plus a full-width primary Start action.

Final rubric score: **22/24**.

- Brief specificity 2, information hierarchy 2, composition 2, consistency/flow 2.
- Typography 1 because the feature intentionally reuses the product type stack without adding a distinct data face.
- Material/surface logic 2, state completeness 2, responsive behavior 2, accessibility 2, motion 2, content authenticity 2.
- Visual distinctiveness 1 because source/plan/backlog/workflow linkage is product-specific while the broader card language intentionally stays consistent with Linkgo.

No quality-floor criterion scores zero. The production contract passes for implemented semantics, keyboard/focus, state recovery, trust copy, target sizes, native select anatomy, adaptive layout, 200% text descendant bounds, reduced motion, forced colors, bounded data, and measured build output. Axe, RTL, non-Chromium engines, native assistive technology, field performance, and offline network simulation remain explicitly unverified; network-offline behavior is not applicable to planner materialization because it performs no network request.
