# 0007 — Fenced publish reservations, not exactly-once delivery

- Status: accepted
- Date: 2026-10-16 (backfilled; the decision predates this record)
- Scope: `src-tauri/src/publishing/`; see [publishing execution](../features/publishing-execution.md).

## Context

Manual **Post to LinkedIn** and **Auto-posting** both create LinkedIn posts and
comments. The app can crash, or a request can time out, after LinkedIn
accepted the post but before Linkgo saved the result. A duplicate public post
is worse than a post that needs a person to confirm it.

## Options compared

| Option                                                                        | Fit                                                                       |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Fire the request, record the result after                                     | Simple, but a crash loses the outcome and a retry can double-post.        |
| Automatic retry until success                                                 | Higher delivery rate, but risks duplicate public posts on lost responses. |
| Durable reservation + owner token + fence; unknown outcomes wait for a person | No silent duplicates; crashes are recoverable without calling LinkedIn.   |

## Decision

One execution path reserves a `publish_executions` row before any network I/O
(one open execution per subject). It moves `reserved → in_flight` only when
`owner_token` and `fence` match, and settles all linked records in one
transaction. Recovery rotates the token and bumps the fence, so a late owner
can only add evidence. Lost answers become **Couldn't confirm** until a person
reconciles them. The startup sweep never calls LinkedIn or retries.

## Consequences

- Linkgo does not promise exactly-once delivery; it promises no silent duplicates.
- Manual and scheduled publishing of the same subject block each other.
- Changing this model needs a migration of open executions and a new decision.
