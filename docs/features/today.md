# Today

The landing screen (`#/today`). It lists only what needs the user now, most
urgent first. Each row names the post in plain words and has one button that
opens the screen where the user fixes it, with that item already picked.

## Rows

| Kind              | Title                                     | Button              | Opens                                   |
| ----------------- | ----------------------------------------- | ------------------- | --------------------------------------- |
| `setup`           | "Finish setting up" (n of 4)              | Finish setup        | `#/setup`                               |
| `connection`      | "<Service> needs reconnecting"            | Reconnect           | `#/integrations?connect=<provider>`     |
| `unclear-outcome` | "Did '<post>' go out?"                    | Check what happened | `#/safety?executionId=E`                |
| `waiting`         | "'<post>' is waiting for your OK"         | Review post         | `#/approvals?campaignId=C&approvalId=A` |
| `results-missing` | "How did it do?"                          | Add results         | `#/metrics?campaignId=C&approvalId=A`   |
| `next-scheduled`  | "Next post: '<post>'" (under "Coming up") | See schedule        | `#/approvals?campaignId=C&approvalId=A` |

- Rows follow the order above (`TODAY_ITEM_KINDS`). `setup` shows only while
  setup is incomplete and not hidden, so onboarding stays visible now that
  Today is the landing screen.
- `next-scheduled` is information, not a to-do. It sits under "Coming up" and
  does not stop the empty state from showing.
- Its time is the wall-clock time the user typed, shown as stored (never
  re-converted through the computer's time zone), with the time zone label
  appended unless it is "local" — e.g. "Tue, Oct 6, 9:00 AM
  (America/New_York)", matching the Approvals card. Ordering across posts in
  different zones is not zone-aware.
- Unclear outcomes, waiting posts and missing results each show at most 5
  rows (`TODAY_ROWS_PER_KIND`); extra rows become a "See all" link to that
  kind's full screen (unclear outcomes open `#/safety`). Connections are not
  capped: they are bounded by the provider list.
- `results-missing` rows describe the post ("'<post>' went out <day> in
  <campaign>") and appear only once the post went out at least 48 hours ago
  (`RESULTS_PROMPT_DELAY_HOURS`); `loadToday({ now? })` passes its clock to
  `listPostsMissingResults`. Posts already updated from LinkedIn never ask.
  The overflow reads "N more posts are ready for results."
- Unclear outcomes for comments read "Did your comment go out?". A post
  missing from the loaded approvals still shows, as "Did your post go out?".
- No button approves, schedules, posts or reconciles. Every link only opens a
  screen or dialog; the human still decides there.

## States

- Loading: skeleton rows with a screen-reader status, `aria-busy` on the list.
- Error (every source failed): a plain sentence and **Try again**.
- Partial: what loaded, plus "We couldn't check <x>. Try again." for the
  sources that failed (`approvals`, `connections`, `results`, `outcomes`).
- Empty: "You're all caught up" (`data-testid="today-empty"`) with **Find an
  idea** (first idea link from setup) and **Write a post** (`#/drafts`). When
  some source failed it reads "Nothing else needs you" instead.
- Results "See all" uses the native uncapped total of posts missing results,
  so its count stays right even past the 50 posts the read returns.
- Truncation: when the approvals read hits its 500 cap, Today says it may not
  show every post and points to Approvals, rather than undercounting silently.

## Ownership

Today owns no tables, no native commands and no business rules. Each rule
lives in the owning feature's public `data.ts`, as a read-only summary:

| Summary                                   | Owner                  | Rule                                                                                     |
| ----------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| `listApprovalsWaitingForReview`           | approvals              | Live `needs_review` approvals, newest first                                              |
| `getNextScheduledPost`                    | scheduler              | Earliest `scheduled` job on a still-scheduled approval                                   |
| `listPostsMissingResults`                 | metrics                | Published posts with no metric row (native `NOT EXISTS`), newest first, plus total       |
| `getConnectionHealth`                     | integrations           | Services whose accounts are all expired, need sign-in again or errored, with none usable |
| `listUnclearPublishOutcomes`              | publish-reconciliation | `outcome_unknown` executions only                                                        |
| `loadSetupChecklist`, `findFirstIdeaHref` | setup                  | Setup progress and the first idea link                                                   |

`loadToday({ signal })` (`src/features/today/data.ts`) reads the approvals page
once and passes it to the approvals and scheduler summaries, runs the rest in
parallel with `Promise.allSettled`, and hands the results to the pure
`buildTodayItems(sources)`, which only orders, caps and builds links with
`formatRouteHash`. Never-connected services stay the setup checklist's job,
not a connection row.

| Piece                          | File                                                                     |
| ------------------------------ | ------------------------------------------------------------------------ |
| `TodayItem`, `TodaySnapshot`   | `src/features/today/types/index.ts`                                      |
| `todayRoute` (no params)       | `src/features/today/schemas.ts`                                          |
| `loadToday`, `buildTodayItems` | `src/features/today/data.ts`                                             |
| `useToday`                     | `src/features/today/hooks/use-today.ts`                                  |
| `TodayView` (lazy)             | `src/features/today/components/today-view.tsx`, exported from `index.ts` |

Prior art for connection health: Postiz's per-channel health summary (latest
published and latest errored per channel).

## Verification

- `tests/today.spec.ts` — every row kind with synthetic data and its button's
  destination (with the item preselected), empty, loading, full error, partial
  error, and a fresh start landing on Today with setup first.
- `tests/navigation.spec.ts` — Today in the menu, the no-hash landing and the
  unknown-link notice.
- `bun run check:architecture` — Today imports other features only through
  their public `data.ts`, `schemas.ts` and `types`.
