# Publishing Execution

## Purpose

One native execution path publishes approved LinkedIn posts and approved comments. Manual publish dialogs and the background scheduler (shown as **Auto-posting**) both call it. It reserves a durable execution row before any network I/O and settles every linked local record in one transaction afterward. It also keeps uncertain remote outcomes visible until an operator reconciles them (on screen: **Check what happened**).

Linkgo does **not** promise exactly-once LinkedIn delivery. The contract below explains why.

## LinkedIn API contract (researched 2026-09-26)

Authoritative sources (Microsoft Learn):

- Share on LinkedIn (member `ugcPosts`, `w_member_social`): https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin
- UGC Post API (legacy): https://learn.microsoft.com/en-us/linkedin/compliance/integrations/shares/ugc-post-api
- Posts API: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
- Comments API (`socialActions/{urn}/comments`): https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api
- API error handling: https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/error-handling

What the contract gives us:

- A successful post create returns `201 Created`. The new post id is in the `x-restli-id` response header (`urn:li:ugcPost:…` / `urn:li:share:…`).
- A successful comment create returns `201 Created` with the comment entity/id in the response.

What it does **not** give us:

- **No retry identity.** Neither the post create nor the comment create endpoint documents an idempotency key, client request id or dedupe header. A retried create after an unseen success can create a second post or comment. **Duplicate prevention on the LinkedIn side cannot be guaranteed.**
- **No usable outcome lookup.** Listing a member's own posts or comments needs member read scopes (`r_member_social`, `r_member_social_feed`), which LinkedIn restricts to approved partners. Linkgo holds only `w_member_social` / `w_member_social_feed`, and this phase adds no scopes. If the create response is lost, there is no id to fetch and no permitted search. **Automatic reconciliation of an ambiguous outcome cannot be guaranteed.** An operator must check LinkedIn and record the result.

### Outcome classification

Linkgo classifies every create call conservatively:

| Transport result                                       | Classification                      | Local effect                                      |
| ------------------------------------------------------ | ----------------------------------- | ------------------------------------------------- |
| 2xx with a parseable id                                | `created`                           | Settle as success                                 |
| Connect failure (request never left the machine)       | `rejected` (definitely not created) | Settle as failure; scheduler may retry            |
| Token refresh / credential / scope failure before send | `rejected`                          | Settle as failure                                 |
| 400, 401, 403, 404, 409, 422                           | `rejected`                          | Settle as failure                                 |
| 429                                                    | `rejected`                          | Settle as failure; scheduler retries with backoff |
| Timeout after the request was sent                     | `ambiguous`                         | `outcome_unknown`, never retried                  |
| Connection reset / body read error after send          | `ambiguous`                         | `outcome_unknown`, never retried                  |
| Any 5xx                                                | `ambiguous`                         | `outcome_unknown`, never retried                  |
| 2xx without a parseable id                             | `ambiguous`                         | `outcome_unknown`, never retried                  |

5xx is ambiguous because LinkedIn may have committed the create before the error was produced.

### Assumptions

- Posts still use the legacy `POST /v2/ugcPosts` endpoint that the member `w_member_social` product documents. Migrating to `/rest/posts` is out of scope, because this phase adds no destinations.
- Comments use `POST /rest/socialActions/{urn}/comments` with the pinned `Linkedin-Version` header.
- Linkgo treats LinkedIn as having no server-side idempotency. If LinkedIn later documents one, the transport adapter is the only place that has to change.

## Architecture

Native module `src-tauri/src/publishing/`:

| File           | Responsibility                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.rs`     | `ExecutionKind`, `ExecutionCaller`, `TransportOutcome`, `ExecutionOutcome`, reconciliation payloads                                                   |
| `transport.rs` | `LinkedInTransport` trait plus the live adapter (credential load/refresh, scope check, LinkedIn HTTP). This is the only place that talks to LinkedIn. |
| `store.rs`     | Reservation (runs the existing publish gates), `mark_in_flight`, remote-evidence write, fenced one-transaction settlement                             |
| `service.rs`   | `execute`: reserve → in-flight → transport → evidence → settle → typed outcome                                                                        |
| `recovery.rs`  | Stale-execution sweep, operator reconciliation, and the two reconciliation commands                                                                   |

Callers:

- Manual: `linkgo_linkedin_publish_post` and `linkgo_linkedin_publish_comment` call `service::execute` with `caller = manual`, then return an `ExecutionOutcome`. The renderer no longer records attempts after publishing.
- Scheduler: `run_tick` claims a due job and calls the same `service::execute` with `caller = scheduler`. Due-job selection and claims skip approvals that have an open execution.

Network calls never happen inside a database transaction. Reservation and settlement each run in their own `BEGIN IMMEDIATE`.

## Storage (migration 37)

- `publish_executions` holds one row per LinkedIn create attempt. The fields are kind, subject (approval or comment thread), campaign, optional schedule job, caller, status, `owner_token`, `fence`, idempotency key, content hash, remote evidence (`remote_outcome`, `remote_status_code`, `remote_platform_id`, `remote_urn`, `remote_url`), error message, linked attempt id, lifecycle timestamps and reconciliation note.
- A partial unique index allows only one open execution (`reserved`, `in_flight` or `outcome_unknown`) per `(kind, subject_id)`.
- `publish_execution_events` is an append-only lifecycle log: `reserved`, `sent`, `settled`, `outcome_unknown`, `abandoned`, `recovered`, `stale_owner` and `reconciled`. The LinkedIn answer is recorded on the execution row itself (`remote_outcome`, `remote_status_code`, `remote_recorded_at`), not as an event. The migration's CHECK list still allows `remote_recorded`, but nothing emits it.

Nothing is deleted. Attempt, approval, schedule-job, audit and error-queue tables are unchanged.

## State machine

```
reserved ──mark_in_flight──▶ in_flight ──settle(created)──▶ succeeded
   │                           │        ──settle(rejected)─▶ failed
   │                           │        ──settle(ambiguous)▶ outcome_unknown
   │                           │
   │ (stale, never sent)       │ (stale) evidence? settle from it : outcome_unknown
   ▼                           ▼
abandoned                   (recovery takeover, fence + 1)

outcome_unknown ──operator "posted"─────▶ reconciled_posted
                ──operator "not posted"─▶ reconciled_not_posted
```

Every owner write filters on `id`, `owner_token`, `fence` and the expected status. Recovery and reconciliation take over by rotating the token and bumping the fence. A late owner whose write matches zero rows becomes a **stale owner**. It stores its LinkedIn evidence on the row only when that row has no evidence yet, logs a `stale_owner` event, and never settles local state.

## Settlement effects

All of these commit in one transaction:

| Outcome                              | Execution         | Attempt row                 | Approval / thread                                  | Schedule job                                                 | Audit / error queue                                                                 |
| ------------------------------------ | ----------------- | --------------------------- | -------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `created`                            | `succeeded`       | succeeded attempt (URL/URN) | approval `published` / thread `posted`             | `completed`                                                  | `publish_succeeded` audit; scheduler `job_published`                                |
| `rejected`, manual                   | `failed`          | failed attempt              | back to `approved` (existing failed-attempt rules) | n/a                                                          | existing failure audit and error queue                                              |
| `rejected`, scheduler, attempts left | `failed`          | failed attempt              | stays `scheduled`                                  | stays `scheduled`, lock cleared, `next_attempt_at` = backoff | `publish_failed` audit; `job_retry_scheduled`                                       |
| `rejected`, scheduler, final attempt | `failed`          | failed attempt              | back to `approved`                                 | `failed`                                                     | error queue item (`schedule_job`); `job_failed`                                     |
| `ambiguous`                          | `outcome_unknown` | none                        | unchanged                                          | lock cleared, stays unfinished, never retried                | warning error queue item "Publish/Comment outcome unknown"; scheduler `job_blocked` |

The reviewed-revision gate still refuses `published` for a stale approval. If a confirmed remote post settles after its approval was revised, the succeeded attempt row is still written, because it records what LinkedIn did, and the approval keeps its current status for the operator.

Settlement is retried in-process up to 3 times on storage errors. If it still fails, the command returns `outcomeUnknown` telling the user not to publish again, and the remote evidence stays on the execution row for recovery.

## Failure states and recovery

| Crash / failure point             | What is durable                      | Recovery                                                                                          |
| --------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Before reservation commits        | nothing                              | Nothing to do; LinkedIn was not called                                                            |
| After reserve, before send        | `reserved` row                       | Sweep marks it `abandoned` and releases the schedule-job lock; the subject can be published again |
| After send, before evidence       | `in_flight` row, `sent_at`           | Sweep marks it `outcome_unknown` (warning error-queue item); operator reconciles                  |
| After evidence, before settlement | `in_flight` row plus remote evidence | Sweep settles from the evidence exactly as the owner would have                                   |
| Worker reclaimed while slow       | old owner holds the old fence        | Sweep bumps the fence; the late owner is fenced out and only adds evidence                        |

The sweep runs independently of the scheduler worker, in all of these places:

- once in the background at app startup, after migrations;
- when the scheduler worker starts and at the start of every tick;
- at the start of every manual post or comment publish, before reserving;
- before `linkgo_publish_execution_list_open` lists open executions.

It reads the backoff from `scheduler_settings.retry_backoff_minutes`, or uses the column default of 15 when the row is missing. It only touches rows whose `updated_at` is more than 10 minutes old, which is far longer than one LinkedIn call (30 s HTTP timeout plus token refresh), so in-flight work is never taken over. It never calls LinkedIn, never retries and never deletes rows. A manual execution that crashed while the scheduler was stopped is therefore released (`reserved`) or becomes reconcilable (`in_flight` → `outcome_unknown`) as soon as the Safety card loads or the item is published again.

## Operator reconciliation

Native commands:

- `linkgo_publish_execution_list_open` returns every open execution (`reserved`, `in_flight`, `outcome_unknown`) with its campaign, caller, remote outcome and timestamps.
- `linkgo_publish_execution_reconcile` takes `{ executionId, fence, resolution: "posted" | "not_posted", externalUrl?, note?, confirmation: "RECONCILE" }`.

Rules:

- Only `outcome_unknown` executions can be reconciled. The fence must match what the operator saw, otherwise the command answers "This execution changed since it was loaded; refresh and try again".
- `posted` requires a LinkedIn URL or URN, validated by the existing LinkedIn URN parser. It settles as success: a succeeded attempt and a published approval or posted comment.
- `not_posted` records a failed attempt and releases the subject. It can then be published again.
- Both resolve the "outcome unknown" error-queue item. Nothing is deleted, and the note is stored on the execution.

UI: the Safety view shows a **Check what happened to these posts** card (`src/features/publish-reconciliation`). Rows that are still in progress show "In progress". `outcome_unknown` rows (badge: **Couldn't confirm**) get a **Check what happened** button that opens a "Confirm what happened to this post" (or "…this comment") dialog with the resolution choice, a URL field required for "posted", an optional note, and a typed `RECONCILE` confirmation. The dialog warns that marking something "not posted" when it really posted can lead to a duplicate on the next publish.

### Operator runbook

1. Open Safety → Check what happened to these posts.
2. For each `outcome_unknown` row, open the LinkedIn profile or activity feed of the connected account and look for the post or comment text.
3. If you find it, choose **Posted on LinkedIn** and paste its URL.
4. If you are sure it is absent, choose **Not posted**. Wait a few minutes first, because LinkedIn can be slow to show new activity.
5. Rows stuck in `reserved` or `in_flight` clear automatically within about 10 minutes once the scheduler worker is running (**Turn on auto-posting**) or ticked (**Post what's due now**).

Live LinkedIn actions and any data-destructive recovery (deleting rows, editing the database by hand) need explicit user authorization and are not part of this runbook.

## Preserved safety controls

- Global kill switch (on screen: **Emergency pause**): checked inside the reservation transaction; no row is reserved and LinkedIn is not called while it is on. The scheduler also skips due jobs.
- Scope checks (`w_member_social`, `w_member_social_feed`) in the live transport before any request.
- Reviewed-revision readiness gate, content-bound idempotency-key check and typed-confirmation dialogs are unchanged.
- Daily comment limit counts succeeded attempts plus open comment executions, so concurrent comments cannot exceed it.
- No new LinkedIn destinations or scopes.

## Tests

`src-tauri/src/publishing/publishing_tests.rs` uses a scripted fake transport and never touches the network. It covers post and comment success, definite failure and ambiguous outcomes; competing manual executes; manual-versus-scheduler overlap; remote success followed by settlement failure and recovery from evidence; crash after reserve and after send; stale owners fenced after recovery; reconciliation (posted, not posted, bad confirmation, stale fence); kill switch blocking before reservation; comment limit counting open executions; and the scheduler never retrying an ambiguous outcome. `auth/linkedin_api.rs` unit tests cover status and send-error classification.
