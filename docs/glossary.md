# Glossary: one word per thing

Linkgo is used by B2B creators, not engineers. Every visible string under
`src/components` and `src/features/*/components` uses the **Say** word below.
Code, database tables, routes and tests keep their internal names.

`bun run check:glossary` (`scripts/check-glossary.mjs`) fails when a visible
string uses a **Don't say** word, an id pattern such as `#${id}`, or "JSON".
Support-only details belong inside `<SupportDetails>` ("Details for support"),
which the check skips.

Not machine-checked (context-dependent, so review by hand): "succeeded /
failed" for LinkedIn outcomes, "Reference" in prose (field labels such as
"LinkedIn reference" are fine), and "Lesson" as the name of a lesson type.

| Say                                          | Don't say                                         | Internal name                                    |
| -------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| post idea / idea                             | candidate                                         | `candidate`, `candidate_queue`                   |
| version                                      | variant                                           | `draft_variant`, `variant`                       |
| Brand voice; one entry is a "voice"          | playbook, guide                                   | `playbook`                                       |
| Automation                                   | workflow, workflow run                            | `workflow`, `workflow_run`                       |
| AI task                                      | agent run                                         | `agent_run`                                      |
| import (a set of posts you added)            | batch                                             | `source_import_batch`                            |
| emergency pause                              | Pause everything, kill switch                     | `kill_switch`                                    |
| Posted / Didn't post                         | succeeded / failed (for LinkedIn outcomes)        | `reconciled_succeeded`, `reconciled_failed`      |
| Couldn't confirm (it may already be live)    | outcome unknown, awaiting reconciliation          | `outcome_unknown`, `awaiting_reconciliation`     |
| a posting try (never numbered in the UI)     | attempt #N, execution #N                          | `linkedin_publish_execution`, `attempt_number`   |
| Details for support (collapsed disclosure)   | Reference, idempotency key, request id (in prose) | `idempotency_key`, ids, provider and model names |
| Added by you                                 | local JSON, operator-supplied JSON                | `local_json` connector                           |
| lesson                                       | memory, campaign memory                           | `campaign_memory`, `MemorySignal`                |
| Winner / Didn't land / Insight / Avoid       | Lesson (as a type), underperformer                | `winner`, `underperformer`, `insight`, `avoid`   |
| Do more / Avoid (how a lesson steers drafts) | Use more, positive / negative                     | winner + insight → Do more; the rest → Avoid     |
| What's working (result patterns)             | insights, analytics                               | `patterns.ts` result patterns                    |

## Terms

- **Campaign**: one product or offer with its audience, voice, keywords and
  daily post/comment limits. Every idea, draft and post belongs to one.
- **Post idea**: a LinkedIn post or topic waiting to be triaged
  (new, shortlisted, rejected, drafted). Comes from manual entry or an import.
- **Import**: a set of post ideas added at once through the campaign's source
  rules. It never scrapes, drafts, schedules or posts on its own.
- **Draft**: the workspace for one post idea. Holds one to five versions.
- **Version**: one full text of a draft. Each text change bumps its revision.
- **AI audit**: a model review of one version's current revision. A blocking
  audit stops approval.
- **Quality check**: fixed rules (length, links, hashtags, hook, specificity)
  plus the AI score of 70 per category used by **Improve with AI**.
- **Approval**: a person's sign-off on one version's exact revision. A later
  edit makes the approval stale. Nothing posts to LinkedIn without one.
- **Scheduled post**: an approved post with a time; **Auto-posting** sends it.
  **Post to LinkedIn** is the manual path. The two can't run for the same post at once.
- **Posting try**: one attempt to create the post or comment on LinkedIn.
  If the answer is lost it becomes **Couldn't confirm** until a person checks.
- **Brand voice**: reusable writing guides plus the lessons that shape drafts.
- **Lesson**: a note a person saved about what worked or didn't, with a type
  and evidence. Lessons that are on shape new drafts for their campaign.
- **Result pattern**: a fixed, deterministic rule over recorded post numbers
  that shows under **What's working**. Never AI. Can be saved as a lesson.
- **Emergency pause**: one switch that stops scheduling, Auto-posting,
  approved comment posting and new AI tasks until turned off.

## Rules

- Name things by what the user sees: a campaign name, a task title, a post's
  first line. Never show `#12` ids in primary text; put them in support details.
- Errors say what happened, then what to do, ideally with a button that does it.
- Disabled buttons explain why next to them (`DisabledReason`) and link to the fix.
- Destructive actions confirm first or offer undo.
