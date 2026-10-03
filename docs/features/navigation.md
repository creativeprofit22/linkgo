# In-app navigation (linkable screens)

Every main-window screen has its own address, so one screen can open another
with the right item already selected — for example "open Drafts for idea X".
Why it is hand-rolled rather than a router library:
[decision 0001](../decisions/0001-in-app-navigation.md).

## Link format

```
#/<screen-id>?<key>=<value>
```

- Keys are sorted and empty values are left out, so one target has one link.
- Only the hash changes. `location.pathname` still picks the window in
  `src/main.tsx` (`/` main window, `/settings` Settings window), so the
  Settings window, title bar and browser-preview banner are unaffected.
- Screen ids match the old tab ids: `campaigns`, `autopilot`, `backlog`,
  `queue` (Ideas), `drafts`, `approvals`, `calendar`, `scheduler`, `comments`,
  `metrics`, `workflows`, `agents`, `playbooks`, `integrations`, `safety`.
  `setup` (Get started) is linkable but not in the Main menu; the sidebar
  setup launcher opens it ([setup](setup.md)).

## Ownership

| Piece                                    | Owner                                                       |
| ---------------------------------------- | ----------------------------------------------------------- |
| Route contract, link parsing/formatting  | `src/lib/navigation/route-contract.ts` (Zod only, no React) |
| `navigateTo`, hooks, last-screen storage | `src/lib/navigation/use-hash-navigation.ts`                 |
| Each screen's route entry                | That feature's public `schemas.ts` (`<feature>Route`)       |
| Each screen's param type                 | That feature's public `types/index.ts`                      |
| Menu order and fallback screen           | `src/pages/home.tsx`                                        |

`src/lib/navigation` never imports features, workflows or agent code. Features
declare routes with `defineRoute(id, schema)` in `schemas.ts` rather than
`index.ts`, because `index.ts` re-exports the lazily loaded view and reading a
route from it would pull the view into the main bundle. Other features import
a route from the owner's public `schemas.ts` (for example Ideas imports
`draftsRoute` from `@/features/drafts/schemas`).

## API

```ts
// Feature contract (schemas.ts)
export const draftsRoute = defineRoute<"drafts", DraftsRouteParams>(
  "drafts",
  draftsRouteSearchSchema,
);

// Anywhere in UI code
navigateTo(draftsRoute, { campaignId: 3, candidateId: 12 }); // adds history
navigateTo(draftsRoute, { campaignId: 3 }, { replace: true }); // no new entry

// In the destination view
const { params, linkIssue } = useRouteParams(draftsRoute);
```

- `formatRouteHash(route, params)` / `parseRouteHash(hash, routes, defaultId)`
  are pure. Parsing never throws; it returns `ok`, `unknown-screen` (falls back
  to the default screen) or `invalid-params` (the screen opens without params).
- Outgoing params are validated: `formatRouteHash` (and so `navigateTo`)
  stringifies them and runs the route's own schema, throwing an `Error` that
  names the route when the destination would reject the link (for example
  `{ campaignId: 0 }` for Drafts). This is a programmer bug, so it fails
  loudly in tests instead of producing a broken link.
- Link values arrive as strings. Use `routeId()` / `optionalRouteId()` for
  numeric ids (positive integers only), `optionalRouteFlag()` for one-shot
  action flags (only the literal `1` is accepted) and `emptyRouteSearch()` for
  screens without params.
  Unknown keys are dropped; for repeated keys the first value wins.
- Opening the screen that is already showing is a no-op. "Already showing"
  compares validated params, so a non-canonical link to the same screen
  (`#drafts`, unsorted keys, unknown keys) adds no history entry; with
  `{ replace: true }` it is rewritten to the canonical link instead.

## Behaviour

- Menu buttons stay `<button aria-current="page">` and call `navigateTo`, so
  each click is a history entry and Back/Forward move between screens.
- Opening the app with no hash restores the last screen from
  `localStorage["linkgo.navigation.last-screen"]` (screen id only, checked
  against the known ids) using a replace, else Campaigns.
- Unknown screen: Campaigns opens with the notice "That link didn't match a
  screen, so we opened Campaigns." It clears on the next navigation and the
  unknown id is not saved as the last screen.

### Drafts links

`#/drafts?campaignId=C&candidateId=X`

- `campaignId` selects that campaign when it exists.
- `candidateId` (needs `campaignId`; `DraftsRouteParams` is a union, so
  `candidateId` alone does not type-check) shows only that idea's drafts with
  "Showing drafts for one idea." and a "Show all drafts" button. The idea's
  drafts are loaded natively (`linkgo_draft_list` with `candidatePostId`), so
  the campaign list's 500-draft cap never hides them.
- Missing campaign or idea, or invalid params: all drafts with "We couldn't
  find what that link pointed to, so here are all drafts."
- Changing the campaign picker replaces the link with the new `campaignId`.
- `write=1` (needs both ids) opens **Write with AI** with that idea shown
  read-only instead of a dropdown, if the idea can still get a first draft.
  Otherwise a notice explains why (already drafted, rejected, archived
  campaign). Closing the dialog replaces the link without `write`.

Ideas cards open this link through **Write post** (`write=1`) or **Open
draft** / **Open drafts**.

### Approvals links

`#/approvals?campaignId=C&approvalId=A` or
`#/approvals?campaignId=C&draftId=D&send=1`

- `campaignId` selects that campaign when it exists (also when a new link
  arrives while Approvals stays open).
- `approvalId` (needs `campaignId`) scrolls to and highlights that approval.
- `draftId` + `send=1` (needs `campaignId`) opens **Send for approval** with
  that draft shown read-only. If the draft already has a live approval, that
  approval is highlighted instead; if it isn't ready, a notice says to choose
  a version and pass checks in Drafts. `approvalId` and `draftId` can't be
  combined. After sending, the link is replaced with the new `approvalId`.
- No link can approve, schedule or post: `send` only opens the dialog, and
  the human still submits it and then clicks Approve.

### Calendar links

`#/calendar?campaignId=C&approvalId=A`

- Selects the campaign and highlights that approval's plan slot.
- If the approved post has no slot yet: "isn't on your plan yet" with
  **Add to plan**, which opens **Plan a post** with the post picked and the
  time and time zone prefilled from its schedule. Nothing is saved until the
  operator submits.
- Not approved, or not found: a plain notice; nothing opens.

See `docs/features/post-flow.md` for how these links chain one post from idea
to calendar.

### Setup links (open a dialog)

Used by the first-run checklist ([setup](setup.md)). Each opens a dialog or
field; closing the dialog replaces the link without the param, so refresh
doesn't reopen it. None of them saves anything.

| Link                                    | Opens                                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `#/integrations?connect=<provider key>` | That service's connect dialog, once accounts load (desktop app only).                                                                            |
| `#/campaigns?new=1`                     | **New campaign**, name pre-filled "My posts".                                                                                                    |
| `#/playbooks?focus=<playbook key>`      | Scrolls to that guide and focuses "Your own instructions" when the guide has it; guidance-only guides are scrolled to and their heading focused. |
| `#/queue?find=1`                        | **Find topics** for the selected campaign (needs a non-archived campaign).                                                                       |

Unknown provider or playbook keys and any value other than `1` are
`invalid-params`: the screen opens without the param.

## Adding a linkable screen or param

1. Declare or extend the route in the feature's `schemas.ts`; put the param
   type in `types/index.ts` (a `type` alias, optional keys as `T | undefined`).
   Exception: when `types/index.ts` already imports `schemas.ts` (Ideas), keep
   the param type in `schemas.ts` to avoid an import cycle.
2. New screens: add the route to `homeRoutes` and a menu entry in
   `src/pages/home.tsx`.
3. Read params with `useRouteParams`; treat them as untrusted — check the item
   exists and show a plain fallback message when it doesn't.
4. Add parse cases and a browser test to `tests/navigation.spec.ts`.

## Verification

- `tests/navigation.spec.ts` — pure format/parse round-trips, unknown screens,
  bad params and Drafts/Approvals/Calendar param rules; browser tests for
  every screen's address, Back/Forward, Ideas → Open draft → filtered Drafts
  → Back, broken-link fallbacks and last-screen restore.
- `tests/post-flow.spec.ts` — the full idea → calendar chain through these
  links, plus untrusted-link fallbacks.
- `bun run check:architecture`.
