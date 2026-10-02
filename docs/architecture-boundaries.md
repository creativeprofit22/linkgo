# Modular architecture boundaries

## Policy and ownership

The executable import policy is [architecture-policy.json](../scripts/architecture-policy.json).
This is an additive gate, not a claim that today's layout already meets the target.
The [exact legacy inventory](../scripts/architecture-baseline.json) is reviewed debt,
not permission for another import with the same rationale. Existing exports and
runtime behavior remain unchanged.

| Owner                                   | Public boundary and target responsibility                                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App composition (`src` entries/windows) | Compose feature public UI indexes and shared shell; do not reach executable runtime or SQL directly.                                                                 |
| Shared UI (`src/components`)            | Presentation primitives and shell; feature composition through public indexes.                                                                                       |
| Feature components/hooks                | Presentation and state; call typed feature operations, not agent loops, workflow implementation, SQL or OS plugins.                                                  |
| Feature APIs                            | `data.ts` exposes typed operations; `schemas.ts` and `types/index.ts` are public contracts; `index.ts` is UI composition. Private helpers are not public by default. |
| Workflows (`src/workflows`)             | Orchestration/state machines through typed capabilities and declared agent adapters; never React UI. `src/features/workflows` is a UI adapter.                       |
| Agents (`src/agent`)                    | Model/tool contracts, providers and loop; no persistence policy or UI. Only policy-declared runtime adapters consume executable interfaces.                          |
| Infrastructure (`src/lib`)              | Frontend infrastructure without upward dependencies on feature, workflow, agent or UI ownership.                                                                     |
| Native (`src-tauri`)                    | Authoritative durable mutations, credential storage, OS integration and worker lifecycle.                                                                            |

Declared agent contracts are `src/agent/types.ts`, `schemas.ts` and
`provider-catalog.ts` (the latter contains only provider keys, labels and defaults).
`src/workflows/types.ts` is the declared workflow contract. Contract value exports
are allowed but their own executable dependencies are checked. Type imports from
mixed implementation barrels are still ownership violations. Declared executable
agent adapters are `src/features/agent-runtime/data.ts` and
`src/workflows/relevance-scoring.ts`; this
designation permits consuming agent interfaces, not owning persistence policy.
`src/features/drafts/quality-loop.ts` is explicitly classified as orchestration.
Policy-declared feature orchestration has the same React, source UI (including
same-feature components/hooks), and raw persistence restrictions as workflows.
It retains feature identity and private-feature rules; ordinary feature APIs are
not automatically orchestration, and typed capability and pure contract imports
remain permitted. Workflow, agent, and declared feature orchestration value
imports/re-exports also reject React (including subpaths) and local UI exposed
through value re-export chains. This follows named, star, namespace, and
import-then-export forms across multiple hops, not ordinary implementation imports
inside typed capability wrappers. Non-UI external packages remain allowed; direct
React/local UI type imports remain forbidden, while pure type-only contracts do
not grant runtime access.

Same-feature imports are permitted except for role restrictions. Cross-feature
imports must resolve to one of the four public file forms above, including when
only types are imported. A public index is not a safe runtime interface merely
because it is called `index.ts`: UI imports/re-exports that expose agent or workflow
implementations are violations. Public type contracts may be used without granting
runtime access. Contract files cannot take executable dependencies on persistence,
views, loops or workers. Infrastructure wrappers and current UI native imports are
legacy exceptions, not a new direct-OS API convention.

`src/agent/index.ts` currently mixes contracts with executable loop/providers/tools.
Do not split it or migrate callers as part of introducing this gate. Likewise,
`src/features/drafts/quality-loop.ts` coordinates providers and database state today;
this is legacy ownership, not the template for new orchestration. Existing workflow
SQL remains exact `workflow-persistence` debt even where ownership of
orchestration is correct; this also covers the known feature-local quality loop.
Type-only database parameters do not bypass that ownership rule.

Screen route entries follow the same rules. `src/lib/navigation/route-contract.ts`
is Zod-only infrastructure, so a feature's `schemas.ts` may value-import it to
declare `<feature>Route` while staying a contract file; param types live in
`types/index.ts`. Routes are not exported from `index.ts`: that file re-exports
the lazily loaded view, and the shell must read routes without loading views.
Another feature links to a screen by importing the owner's route from its public
`schemas.ts`; `src/lib/navigation` never imports features. See
[navigation](features/navigation.md).

## Native responsibility map (current files, not required file counts)

Command adapters deserialize/dispatch. Domain validation enforces identity, current
state and human approval. Transaction operations hold one pinned connection.
External transport runs outside transactions. Workers own scheduling, cancellation
and process lifecycle. These are responsibilities; a capability need not be five files.

All paths below are relative to `src-tauri/src`. Inline tests mean that file's
`#[cfg(test)]` module, not proof of desktop or live-service coverage.

| Family / current entry points                                                                                | Durable/domain owner                                                                                                                                                                                                                                                    | Transport / lifecycle                                                                               | Associated tests                                                                                                                |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Approval review: `approval_review.rs`, `linkgo_approval_create`, `linkgo_approval_set_status`                | Domain transition/eligibility rules, `execute_create`/`execute_set_status`, pinned `settle` (`approval_transaction.rs`); read-only `assert_publish_ready` gate (no command of its own) called by `linkgo_approval_publish_preflight` and `linkgo_linkedin_publish_post` | No external transport; rejection reuses `agent_continuations::reject_linked_continuations`          | `approval_review_tests.rs` (migrated SQLite: eligibility, per-write rollback, concurrency)                                      |
| Approval scheduling: `approval_scheduling.rs`, `linkgo_approval_schedule`, `linkgo_approval_cancel_schedule` | `schedule_approval`/`cancel_schedule`, `execute_schedule`/`execute_cancel` (current-revision readiness before any write), pinned `settle`                                                                                                                               | No external transport in schedule transaction                                                       | `approval_scheduling_tests.rs` (rollback, concurrency, cancellation, safety decisions); readiness in `approval_review_tests.rs` |
| Approval attempts: `approvals.rs`, `linkgo_approval_record_publish_attempt`                                  | Attempt settlement in `execute_record_publish_attempt` (reviewed-revision readiness before any write; unready successes rejected)                                                                                                                                       | Publishing via `publishing/`; renderer creation remains legacy                                      | Inline SQLite tests; browser approvals/publishing tests                                                                         |
| Comment attempts: `comments.rs`                                                                              | Comment attempt settlement and linked records                                                                                                                                                                                                                           | `auth/publish.rs` and `auth/linkedin_api.rs`                                                        | Inline tests; browser comment publishing tests                                                                                  |
| Agent continuations: `agent_continuations.rs`                                                                | `execute_settlement`, `settle_approved_continuation`                                                                                                                                                                                                                    | Provider execution in `agent_runtime.rs` (`linkgo_agent_provider_stream`)                           | `agent_continuations_tests.rs`; runtime provider parsing tests                                                                  |
| Quality/audits/relevance: `draft_quality.rs`, `planner_draft_audits.rs`, `relevance_scoring.rs`              | Capability-specific claim/settlement/revision checks; `draft_quality.rs` is the single recovery owner that settles linked agents and rewrite audits atomically on fail/reconcile/resume                                                                                 | Foreground TS orchestration/provider handoff outside mutations                                      | Inline and file-backed SQLite tests (`draft_quality_lifecycle_tests.rs`); browser draft quality, audit and scoring suites       |
| Backlog/planner: `campaign_backlog.rs`, `autopilot_planner.rs`                                               | Backlog mutation validation; planner batch materialization                                                                                                                                                                                                              | Planner owns tick/start/stop and currently shared `managed_pool`                                    | Inline SQLite and worker tests; browser backlog/planner suites                                                                  |
| Publishing: `publishing/` (`service.rs`, `store.rs`, `recovery.rs`, `transport.rs`)                          | Reservation, fenced settlement of attempts/approvals/threads/jobs/audit/error queue, recovery sweep and operator reconciliation                                                                                                                                         | `LinkedInTransport` adapter is the only LinkedIn create I/O; called outside transactions            | `publishing/publishing_tests.rs` with a scripted fake transport; browser publishing and reconciliation suites                   |
| Scheduler/metrics: `scheduler/mod.rs`, `metric_refresh/mod.rs`                                               | Eligibility and claims; publish settlement delegated to `publishing/`                                                                                                                                                                                                   | Tick loops, worker start/stop, external publish/metrics transport                                   | Inline tests; browser scheduler/metric refresh suites                                                                           |
| Auth: `auth/commands.rs`                                                                                     | Publishing preflight in `auth/publish.rs`; credentials in `auth/storage.rs`                                                                                                                                                                                             | OAuth/providers/LinkedIn transport in separate auth files                                           | Inline command, transport parsing, OAuth and storage tests                                                                      |
| Lifecycle/plugins: `lib.rs`, `plugins/mod.rs`, `plugins/system_tray.rs`, `window_commands.rs`                | Registers commands and state; gets pool through planner; builds main/settings windows with a deny-all new-window handler                                                                                                                                                | Tray, quit, plugin and process lifecycle; allowlisted LinkedIn links via `auth/external_browser.rs` | Build coverage; real packaged lifecycle remains unverified                                                                      |
| Migrations: `migrations/mod.rs` and feature migration files                                                  | Ordered schema ownership with using capability                                                                                                                                                                                                                          | No transport; startup applies migrations                                                            | Migration and capability SQLite tests; no blanket upgrade certification                                                         |

Approval scheduling demonstrates a useful separation without a shared generic
transaction framework. Publish settlement now lives in `publishing/`, shared by
manual commands and the scheduler; the scheduler still mixes due-job policy,
claims, tick orchestration and worker lifecycle. `lib.rs` obtaining a planner-owned shared pool
is current coupling, not authorization to extract a database framework now.

## Legacy review and removal

Every machine exception must name an owner, rationale and concrete removal
condition. Boundary identities pin importer, resolved target, type/value kind,
imported binding/export form, rule and occurrence count. Cycles pin membership and
all internal edges/kinds/counts. No directory wildcards or numerical budgets.
The reviewed source inventory has 235 files, 2,646 binding edges, 81 boundary
identities and four cycle records: one runtime component (8 files/34 exact binding
edges), its larger type-inclusive component (10/46), a contracts component (5/10),
and the source-import/candidate UI-contract component (9/38; native persistence
step 16d pruned three source-import data→types edges). Cycle edge counts
here count distinct identities; the two repeated lazy imports also retain their
occurrence counts of two. Baseline `bindings` maps compactly group exact names and
counts under the same owner/rationale/removal condition; they are expanded before
validation/comparison. `*` means the recorded namespace/dynamic/export-star form,
never a path wildcard.

New bindings, duplicate occurrences, component merges and internal edge growth
fail even when other debt disappears. Removed debt requires deliberate pruning;
stale and duplicate allowances fail. The normal check never writes a baseline.

Ownership groups and existing Roadmap destinations (these do not authorize work now):

- **Feature persistence / workflows / agent tools:** finish native persistence
  ownership (`c8b29ee9-aae4-483f-a052-91ca45d2c72e`); remove renderer SQL and
  persistence policy from agents through typed capability adapters.
- **Approvals:** native approval authorization (`51059234-f969-4ce9-9183-d1524d84e5f1`);
  publishing transport/reservation coupling goes to publishing recovery
  (`be3b48b1-95a3-4ff1-947e-f777618972b0`).
- **Draft quality:** lifecycle recovery (`f8393c97-e558-446a-a416-0fd175ca1b5a`) is
  native. `draft_quality.rs` is the single owner that settles runs, attempts,
  linked agents and rewrite audits atomically, through the shared
  `fail_active_agent` / `fail_active_audit_run` primitives. `agent_run_store`
  makes one read-only call, `draft_quality::assert_agent_startable`, to
  block re-claims. `workflow_store`'s agent-run list reuses the same predicate
  (`draft_quality::quality_start_blocked_sql`) to report `quality_start_blocked`.
  `quality-loop.ts` placement and renderer SQL removal still
  need persistence work.
- **Native UI wrappers / credentials:** capabilities and credentials
  (`47899093-c810-4a1f-abd0-0cde07120589`). Do not remove permissions early.
- **Private helper imports / mixed barrels / cycles:** module owners must introduce
  a concrete public contract or move one responsibility in a separately approved
  change. Candidate queue's LinkedIn URN helper and planner's source connector
  helper remain exact exceptions, not blanket public helper categories.

Future sequence: characterize behavior and failure cases; strengthen one typed
capability; move one responsibility preserving exports; run contract and real-SQLite
tests as applicable; prune only that change's exact exceptions. Keep behavior fixes
separate. Share a helper only after demonstrated repeated need, preserving each
capability's policy. No runtime extraction is necessary for this gate.

## Enforcement and limits

Run `bun run check:architecture` (tests plus read-only repository check).
`node scripts/check-architecture.mjs --inventory` prints candidates for human
review only; it does not accept them. Any allowance growth requires explicit
architecture review, ownership and a removal condition.

The checker parses application TS/TSX under `src` with the installed TypeScript
resolver and actual tsconfig. Runtime and complete (type-inclusive) graphs are
checked separately. External packages and assets are classified outside the source
graph. Computed module loads and unresolved local imports fail rather than vanish.
No application code is executed. Native layout is documented, not AST-enforced.

This checks import structure, not semantic absence of orchestration inside arbitrary
functions, authorization, SQL atomicity, network safety or runtime dynamic behavior.
It is additional protection: preserve approval gating, security controls and the
zero-tolerance renderer transaction checker (no renderer-managed transactions are
allowed). Passing does not certify desktop operation
or live integrations. See [contributor guidance](CONTRIBUTING.md) and the
[current verification report](verification/modular-architecture-boundaries.md).
