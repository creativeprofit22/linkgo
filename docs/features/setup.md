# First-run setup checklist

A short guided setup for a brand-new user. It replaces the empty Campaigns
screen and gives every "needs a campaign" screen a button that fixes it.

## Steps

In this order (LinkedIn first):

| Step                       | Done when                                                                                        | Button opens                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Connect LinkedIn           | The LinkedIn account is `connected`.                                                             | `#/integrations?connect=linkedin` — the LinkedIn connect dialog.                             |
| Connect an AI service      | Any AI account is connected, or an OpenAI/Anthropic sign-in renews itself (`isUsableAiAccount`). | `#/integrations?connect=anthropic` (Claude, recommended); others under **More AI services**. |
| Describe how you write     | The `linkedin_writer` guide has non-empty "Your own instructions" **and** is on (`enabled`).     | `#/playbooks?focus=linkedin_writer` — scrolls to and focuses that field.                     |
| Create your first campaign | Any campaign that isn't archived exists.                                                         | `#/campaigns?new=1` — New campaign, pre-filled "My posts".                                   |

The voice step matches what drafts use: `getPlaybookPromptForRuntime` drops
the instructions when the guide is off. If the style is saved but the guide is
off, the step stays to do with the note `writer-guide-off` ("Your style is
saved, but the LinkedIn Writer guide is off…", button **Turn on the guide**).

Once every step is done the card says "You're all set" with **Find your first
idea** (`#/queue?find=1`, opens Find topics).

Decisions (style-pack §1a, 2026-10-03): Linkgo never creates a campaign on its
own — the user reviews "My posts" and clicks Create. Claude is the one
recommended AI service.

## Where it shows

- **Campaigns**, when there are no campaigns and setup isn't hidden: the
  checklist replaces the empty card (the **New campaign** button stays).
- **Get started** screen (`#/setup`): not in the Main menu; reached from the
  sidebar launcher.
- **Sidebar launcher** above the Main menu: "Get started · n of 4" while open;
  "Resume setup" after **Hide setup**; one "You're all set" prompt when the
  last step is finished in this session; nothing once complete.
- Every screen that needs a campaign shows **Create your first campaign**
  (`CreateFirstCampaignButton` from `@/features/campaigns`), which opens the
  same pre-filled dialog.

## Contract

| Piece                                                                                  | Where                                                      |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Step keys, checklist and preference types                                              | `src/features/setup/types/index.ts`                        |
| `setupRoute`, `setupPreferencesSchema`                                                 | `src/features/setup/schemas.ts`                            |
| `deriveSetupChecklist` (pure), `loadSetupChecklist`, preference read/write, step links | `src/features/setup/data.ts`                               |
| `useSetupChecklist`                                                                    | `src/features/setup/hooks/use-setup-checklist.ts`          |
| `SetupView`, `SetupLauncher`, `SetupEmptyCampaigns`                                    | `src/features/setup/components/`, exported from `index.ts` |
| `SetupChecklist` (internal, rendered by `SetupView`)                                   | `src/features/setup/components/setup-checklist.tsx`        |

- Completion is always derived, never stored. `loadSetupChecklist` reads
  `getAuthStatus()`, `listPlaybooks()` and `listCampaigns()` through their
  owners' public `data.ts` with `Promise.allSettled`; a source that fails
  marks its steps `unknown` ("We couldn't check this step yet") and they stay
  actionable.
- The only stored value is `{ dismissed: boolean }` in `localStorage` under
  `linkgo.setup.preferences` (same mechanism as theme and last screen, so it
  survives restart). Reads are schema-validated and fall back to
  `{ dismissed: false }`. No migration.
- The hook re-reads on `hashchange`, window focus, a `linkgo:setup-changed`
  event, and `linkgo:data-changed`, so finishing a step anywhere updates every
  checklist view (including the sidebar launcher and "You're all set")
  without navigating.
- `linkgo:data-changed` lives in `src/lib/data-change-events.ts`:
  `announceDataChange(topic)` dispatches a window `CustomEvent` with
  `{ topic: "campaigns" | "playbooks" | "accounts" }`, and
  `subscribeDataChange(handler)` returns its unsubscribe. Owners announce
  only after a mutation succeeds, never on failure:
  - `accounts` — `useIntegrations` save key, submit sign-in code,
    disconnect, check, and a native sign-in that finishes (`auth_done`).
  - `playbooks` — `usePlaybooks` saving a guide override.
  - `campaigns` — `useCampaigns` create, update and status change
    (including archive).

## Safety

The checklist only opens screens and dialogs. Connecting, saving instructions
and creating the campaign all still need the user to submit; nothing posts.

## Verification

- `tests/setup.spec.ts` — fresh start, partial completion, hide/resume across
  reload, completion, each deep link, the locked-screen fix buttons, and
  progress updating in place after saving the Writer guide or connecting
  LinkedIn from its own card (no navigation), and the voice step staying to
  do while the Writer guide is off.
- `bun run check:architecture`.
