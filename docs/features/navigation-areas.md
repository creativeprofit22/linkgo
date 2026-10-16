# Navigation areas

## Purpose

The Main menu groups every screen into five areas so the menu stays short on
desktop and fits one row on a phone. Links keep their current form
(`#/<screen-id>?…`); see [navigation](navigation.md) for the link contract.

## Area map

| Area     | Sub-views (in order)                                                                                        | Screen ids                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Today    | Today                                                                                                       | `today`                                                                                          |
| Create   | Campaigns, Ideas, Drafts, Approvals, Replies                                                                | `campaigns`, `queue`, `drafts`, `approvals`, `comments`                                          |
| Calendar | Calendar (the auto-posting panel is part of it)                                                             | `calendar` (legacy `scheduler` redirects here)                                                   |
| Results  | Analytics                                                                                                   | `metrics`                                                                                        |
| Settings | General, Connected accounts, Brand voice, Safety, Autopilot; **Advanced:** Automations, AI assistant, Tasks | `settings`, `integrations`, `playbooks`, `safety`, `autopilot`, `workflows`, `agents`, `backlog` |

- Get started (`setup`) sits outside the five areas. The sidebar setup
  launcher opens it.
- In the Create sub-menu, `comments` is labelled **Replies**. The heading
  inside the view is unchanged.
- **General** (`#/settings`) holds the startup switch ("Open Linkgo when I
  sign in"). The separate Settings window is gone; the title-bar gear opens
  `#/settings`, and an old `/settings` address redirects there.

## Area links

| Link          | Opens                     | History |
| ------------- | ------------------------- | ------- |
| `#/create`    | `#/campaigns`             | replace |
| `#/results`   | `#/metrics`               | replace |
| `#/scheduler` | `#/calendar` (retired id) | replace |

Replace navigation means Back skips the alias. Every existing screen link,
with its params, still works and opens inside its area.

## Behaviour

- Main menu (`nav` "Main menu"): five buttons; the active area has
  `aria-current="page"`.
- Clicking an area opens its first sub-view. Create and Settings reopen the
  sub-view last used in that area during this session (memory only).
- Section menu (`nav` "<Area> sections"): shown only when the area has more
  than one sub-view; the active sub-view has `aria-current="page"`. Settings
  shows an "Advanced" heading above Automations, AI assistant and Tasks.

## Layout

- Desktop (`sm` and up): the left sidebar lists the five areas, with the
  active area's sub-views indented beneath it.
- Phone (under 640px): the five areas sit in one five-column row (icon plus
  short label). Sub-views wrap onto as many rows as needed.
- Every area and sub-view button is at least 44px tall on phones.
- No horizontal scrolling anywhere in the shell.

## Adding a screen

1. Declare the route in the feature's `schemas.ts` (see
   [navigation](navigation.md)).
2. In `src/pages/home-areas.ts`: add it to `homeRoutes`, add an
   `areaByScreen` entry (`null` if it sits outside the areas) and a section
   in `homeAreas`. `areaByScreen` is exhaustive, so a screen without an
   entry fails type-check.
3. In `src/pages/home.tsx`: add a lazy view import and a branch in the view
   switch. Nothing type-checks this step — the switch falls back to the
   Safety view, so a missing branch silently shows Safety.

## Verification

- `tests/navigation.spec.ts`: every screen id opens with its area and
  section marked current; alias redirects; `/settings` redirect; gear opens
  `#/settings`; every route has an area; 390×844 phone check (no horizontal
  overflow, 44×44 targets).
- `tests/settings.spec.ts`: the startup switch at `#/settings`.
