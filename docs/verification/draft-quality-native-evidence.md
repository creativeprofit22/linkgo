# Native draft quality evidence gate

Scope: attended draft quality settlement used by approval readiness. No IPC permissions, approval rules, or frontend settlement DTO fields are changed.

## Gate

`apply_with_pool` validates evidence inside its existing `BEGIN IMMEDIATE` transaction, before settlement writes:

- The attempt and run must be active and refer to the current draft revision.
- The exact active linked auditor must be completed, with a completion timestamp and no error.
- Its campaign, provider, and model must match durable scope.
- Exactly one `score_draft_quality` call must exist for that agent; it must be completed with a timestamp and no error. Multiple calls fail closed rather than letting the caller select a favorable grade.
- The stored request and tool input must match the durable attempt IDs, revision, original text, fixed threshold of 70, and remaining rewrite allowance. The native request currently supplies empty prior feedback; evidence must match that too.
- Tool input and output must carry valid canonical scores and the same permitted rewrite. The settlement must match their scores, feedback, and rewrite (accounting for frontend trimming).
- Settlement does not manufacture or replace the agent's completion timestamp. The caller's bounded display summary remains part of the existing DTO; it is not used to decide whether quality passed.

Queued, running, failed, absent, malformed, mismatched, stale, and replayed evidence is rejected without changing durable settlement state.

## Persistence prerequisite

Migration 34 adds only `score_draft_quality` to the tool-name allowlist. The prior schema could not persist this tool at all. It copies existing tool rows, keeps their IDs and AUTOINCREMENT high-water mark, rebuilds the same indexes and constraints, and preserves approval-checkpoint references using the existing startup migration runner. Applied migrations are not edited.

Only temporary fixture databases were used for verification; no user database was upgraded during this task.

## Regression verification

Run:

```sh
cargo test --manifest-path src-tauri/Cargo.toml draft_quality
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

The native fixture calls `apply_with_pool` directly and snapshots all affected quality, draft, audit, and agent tables around negative cases. It checks missing/incomplete evidence, request identities and text, threshold and rewrite allowance, output identities and scores, caller scores/feedback/rewrite substitution, exhausted rewrites, stale revisions, and replay. Completed matching evidence can pass or apply a rewrite and reserve its follow-up audit.

The migration fixture upgrades a version-33 database, verifies exact preservation of tool payloads and approval checkpoints, checks foreign keys and indexes, rejects unknown tool names and invalid states, preserves deleted-ID high-water marks, and reruns startup migration to check restart behavior.

The queued-agent rejection assertion was observed failing against the old settlement implementation before adding the gate. This is local fixture-backed runtime evidence, not a remote exploit or live-provider end-to-end test. Browser mocks are not evidence for this native gate. Global renderer database-write authority and other native capabilities are outside this task's scope.
