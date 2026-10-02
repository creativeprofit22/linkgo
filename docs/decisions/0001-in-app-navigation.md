# 0001 — In-app navigation: typed hash links, no router dependency

- Status: accepted
- Date: 2026-10-02
- Scope: main window (`/`) screen switching; the Settings window (`/settings`) is untouched.

## Context

The main window switched 15 feature screens with local React state in
`src/pages/home.tsx`. A screen could not open another screen with an item
already selected (for example "open Drafts for idea X"), back/forward did
nothing, and the app always started on Campaigns.

Constraints:

- Vite + React 19 inside a Tauri v2 webview. The window is loaded from the app
  protocol, so there is no server to rewrite deep path URLs; the hash is the
  only URL part we can change freely. `src/main.tsx` already chooses the
  window by `location.pathname`, so hash routing leaves Settings alone.
- 15 flat screens. No nested layouts, data loaders or route-level code
  splitting beyond the existing `lazy()` views.
- Zod (already a dependency) validates every boundary; links are untrusted
  input and must never crash a screen.
- `src/lib` must not import features; each feature owns its own route entry.

## Options compared

Versions checked with `npm view` on 2026-10-02 (read-only, nothing installed).

| Option                                                   | Version / size                                    | Typed params                                  | Fit                                                                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TanStack Router (`createHashHistory` + `validateSearch`) | `@tanstack/react-router` 1.170.41, ~1 MB unpacked | Excellent, end-to-end inferred                | Forces a route-tree rewrite of the shell and central route registration, which pulls feature knowledge into one tree. Loaders, nested layouts and devtools unused. |
| wouter (`useHashLocation`)                               | `wouter` 3.13.0, ~80 KB unpacked                  | None — string patterns only                   | Small, but only matches locations. We would still hand-write typed params and validation, so it adds a dependency for ~30 lines of value.                          |
| Hand-rolled typed hash links (`src/lib/navigation/`)     | ~150 lines, no new dependency                     | Zod schemas per route, inferred via `z.infer` | `hashchange` + `useSyncExternalStore`. Features declare routes in their own `schemas.ts`; the shell composes them. Fully covered by our own tests.                 |

## Decision

Use **hand-rolled typed hash links** in `src/lib/navigation/`:

- `route-contract.ts` — `defineRoute`, `formatRouteHash`, `parseRouteHash`
  (Zod only, no React, safe to import from feature contracts).
- `use-hash-navigation.ts` — `navigateTo`, `useHashLocation`,
  `useRouteParams`, and last-screen storage helpers.

Link format: `#/<screen-id>?<key>=<value>` with sorted keys, e.g.
`#/drafts?campaignId=3&candidateId=12`.

## Consequences

- No install or dependency approval needed for this phase.
- We own a small amount of routing code and its tests (`tests/navigation.spec.ts`).
- If needs grow (nested layouts, loaders, many parameterised screens), revisit
  TanStack Router first.

## Rule for any future router dependency

Before installing a router package: get explicit user approval, then pin the
exact current stable version from `npm view <pkg> version` on the install day
(no `^`/`~` range), and update this record.
