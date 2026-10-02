# Connected post flow: idea → draft → approval → schedule

One post moves Ideas → Drafts → Approvals → Calendar. Each finished step offers one primary **next** button. That button opens the next screen with the same post already picked, through the typed links in [navigation](navigation.md). A shared stage tracker shows where each post stands.

## Before and after

Both runs were measured on 2026-10-02 with Playwright and the stateful Tauri mocks (`tests/helpers/tauri-mocks.ts`), synthetic data, Practice mode and no AI account. Each count starts with the idea already on the Ideas screen and ends with the post scheduled and on the calendar plan. Typing into fields isn't counted.

| Measure                       | Before | After | Change                                                                                   |
| ----------------------------- | -----: | ----: | ---------------------------------------------------------------------------------------- |
| Clicks                        |     17 |    15 | Tab clicks replaced by next-step buttons                                                 |
| Dialogs                       |      4 |     4 | Write with AI, Send for approval, Schedule post, Plan a post (all still human-submitted) |
| Tab switches                  |      3 |     0 | Write post, Send for approval and See on calendar change screens for you                 |
| Item re-picks from a dropdown |      3 |     0 | Idea and draft are locked in; Add to plan preselects the approval                        |
| Fields retyped on Plan a post |      2 |     0 | Date/time and time zone prefilled from the schedule                                      |

**Before:** Drafts tab → Write with AI → Write versions → Save as draft → Choose this version → Review with AI → Improve with AI → Yes, improve it → Approvals tab → Send for approval → Send for approval (submit) → Approve → Schedule → Schedule post (submit) → Calendar tab → Plan a post → Plan post (submit).

**After:** Write post (idea card) → Write versions → Save as draft → Choose this version → Review with AI → Improve with AI → Yes, improve it → Send for approval (draft card) → Send for approval (submit) → Approve → Pick a time → Schedule post (submit) → See on calendar → Add to plan → Plan post (submit).

`tests/post-flow.spec.ts` asserts the "after" counts (15 clicks, 4 dialogs), so a regression fails the suite. The Choose / Review / Improve clicks are the draft quality gate and stay deliberate.

## Next step per stage

| Where         | When                                              | Primary button                           | Opens                                     |
| ------------- | ------------------------------------------------- | ---------------------------------------- | ----------------------------------------- |
| Idea card     | Idea, not rejected, campaign active               | Write post                               | `#/drafts?campaignId&candidateId&write=1` |
| Idea card     | Draft                                             | Open draft                               | `#/drafts?campaignId&candidateId`         |
| Idea card     | Waiting, approved, posted, results or failed post | Open approval                            | `#/approvals?campaignId&approvalId`       |
| Idea card     | Scheduled                                         | See on calendar                          | `#/calendar?campaignId&approvalId`        |
| Draft card    | No live approval                                  | Send for approval (or disabled + reason) | `#/approvals?campaignId&draftId&send=1`   |
| Draft card    | Live approval                                     | Open approval                            | `#/approvals?campaignId&approvalId`       |
| Approval card | `approved`                                        | Pick a time                              | Schedule post dialog                      |
| Approval card | Schedule job `scheduled`                          | See on calendar                          | `#/calendar?campaignId&approvalId`        |

Other buttons on those cards are secondary (outline), so there is one obvious next step.

## Post stages

`src/features/post-stages` derives the stage read-only. There is no table, migration or native command. `getPostStageIndex(campaignId)` reads `listDrafts`, `listApprovals` and `listPostMetrics` in parallel through their public `data.ts`, and `derivePostStageIndex` (a pure function) maps them to `byCandidateId`, `byDraftId` and `byApprovalId`.

| Stage               | When                                                          | State                                 |
| ------------------- | ------------------------------------------------------------- | ------------------------------------- |
| Idea                | No draft for the idea                                         | now                                   |
| Draft               | Draft without a live approval (none, rejected or cancelled)   | needs you when ready or needing edits |
| Waiting for your OK | Approval `needs_review` / `changes_requested`                 | needs you                             |
| Scheduled           | `approved` with no active schedule → "Approved — pick a time" | needs you                             |
| Scheduled           | Schedule job `scheduled`                                      | now                                   |
| Scheduled           | Schedule job `failed`, or the latest publish attempt failed   | problem                               |
| Posted              | `published`, a succeeded attempt, or a completed schedule job | now                                   |
| Results             | Posted and at least one post metric recorded                  | now                                   |

When an idea or draft has several live approvals, the most advanced one wins and ties go to the newest. Rejected and cancelled approvals show as a problem on their own card but don't move the draft forward. Metrics never skip approval: an unapproved post never shows Results.

`PostStageTracker` renders `<ol aria-label="Post progress">` with `aria-current="step"`. Each step carries text (done / now / needs you / problem) as well as icons and colour. `usePostStageIndex` reloads the index whenever its screen's own list reloads, i.e. after every mutation. It returns `null` until the first stages for the campaign load, for no campaign, or when the latest read failed; then the tracker and the stage-based button hide and the screen keeps working. During a reload after a mutation it keeps the previous stages until the new ones arrive, so the tracker doesn't flicker after every click.

The prior art here is the status models in Mixpost (`PostStatus`: draft, scheduled, published, failed) and Postiz (posts move to published or error on attempts).

## Human approval gate

- No link or param can approve, schedule or post. `send=1` only opens Send for approval, and the human still submits it.
- **Pick a time** exists only while the approval status is `approved`, which a human sets with Approve. The chain test asserts it is absent while the card shows "Waiting for your OK".
- **Add to plan** only opens Plan a post; nothing is saved until the operator submits.
- Native checks are unchanged and stay authoritative: approval reads, the scheduler, and the calendar only listing `approved | scheduled | published` approvals.

## Typed work survives Cancel and Back

`useSessionFormState` (`src/hooks/use-session-form-state.ts`) keeps dialog input in `sessionStorage`:

| Dialog            | Key                                  | Cleared                     |
| ----------------- | ------------------------------------ | --------------------------- |
| Write with AI     | `linkgo.form.write.<candidateId>`    | After versions are written  |
| Send for approval | `linkgo.form.send.<draftId>` (notes) | After the approval is sent  |
| Schedule post     | `linkgo.form.schedule.<approvalId>`  | After the post is scheduled |

Stored values are Zod-validated on read, and bad data is dropped. Only edited forms are written. The text lives only in this window's session (it's gone when the app window closes) and is never logged. Closing a dialog that a link opened replaces the link without its action flag, so a refresh doesn't reopen it, while Back/Forward still work.

## Practice mode

Write with AI defaults to the first connected AI account and uses Practice mode (dry run) only when none is connected. Whenever Practice is selected the dialog says "Practice mode — no AI used. Versions are sample text.", and adds a Connect an AI account link when no account is connected. See [drafts](drafts.md).

## Limits

- The stage index reads the campaign's drafts, approvals and post metrics lists, each capped at 500 natively. Posts beyond those caps show no stage (the tracker hides), but their screens still work.
- Each of Ideas, Drafts and Approvals makes three extra local list reads for the tracker. They run in parallel against local SQLite. If they ever lag, the fallback is to reuse the screen's own list instead of re-reading it.
- One draft per idea per campaign is the norm. If several exist, the idea shows the most advanced one.

## Verification

- `tests/post-stages.spec.ts` — table-driven stage derivation for every approval, schedule, attempt and metric combination, plus tie-breaking.
- `tests/navigation.spec.ts` — Drafts, Approvals and Calendar link param rules.
- `tests/post-flow.spec.ts` — the full chain with synthetic data. It covers Cancel and Back keeping typed work, the approval gate, trackers on idea, draft and approval cards, Practice-mode default and notice, disabled reasons with fix links, untrusted-link fallbacks, and the click/dialog count.
- `bun run check:architecture`.
