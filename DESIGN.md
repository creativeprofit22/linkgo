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
