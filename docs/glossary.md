# Glossary: one word per thing

Linkgo is used by B2B creators, not engineers. Every visible string under
`src/components` and `src/features/*/components` uses the **Say** word below.
Code, database tables, routes and tests keep their internal names.

`bun run check:glossary` (`scripts/check-glossary.mjs`) fails when a visible
string uses a **Don't say** word, an id pattern such as `#${id}`, or "JSON".
Support-only details belong inside `<SupportDetails>` ("Details for support"),
which the check skips.

| Say                                        | Don't say                                         | Internal name                                    |
| ------------------------------------------ | ------------------------------------------------- | ------------------------------------------------ |
| post idea / idea                           | candidate                                         | `candidate`, `candidate_queue`                   |
| version                                    | variant                                           | `draft_variant`, `variant`                       |
| Brand voice; one entry is a "voice"        | playbook, guide                                   | `playbook`                                       |
| Automation                                 | workflow, workflow run                            | `workflow`, `workflow_run`                       |
| AI task                                    | agent run                                         | `agent_run`                                      |
| import (a set of posts you added)          | batch                                             | `source_import_batch`                            |
| emergency pause                            | Pause everything, kill switch                     | `kill_switch`                                    |
| Posted / Didn't post                       | succeeded / failed (for LinkedIn outcomes)        | `reconciled_succeeded`, `reconciled_failed`      |
| Couldn't confirm (it may already be live)  | outcome unknown, awaiting reconciliation          | `outcome_unknown`, `awaiting_reconciliation`     |
| a posting try (never numbered in the UI)   | attempt #N, execution #N                          | `linkedin_publish_execution`, `attempt_number`   |
| Details for support (collapsed disclosure) | Reference, idempotency key, request id (in prose) | `idempotency_key`, ids, provider and model names |
| Added by you                               | local JSON, operator-supplied JSON                | `local_json` connector                           |

## Rules

- Name things by what the user sees: a campaign name, a task title, a post's
  first line. Never show `#12` ids in primary text; put them in support details.
- Errors say what happened, then what to do, ideally with a button that does it.
- Disabled buttons explain why next to them (`DisabledReason`) and link to the fix.
- Destructive actions confirm first or offer undo.
