# Modular architecture boundaries: implementation verification

## Scope and environment

Approved phase: `6ed06519-86eb-49cc-9baa-08b47bbf0353`.
Executed September 14 local / September 15, 2026 UTC. HEAD remained
`6443368629499f5d43c100d251423dd354575e76`; **all results are dirty-tree results**.
No commits, installs, runtime extraction, migrations or application edits were
performed by this implementation.

Observed environment: Windows, Bash shell, Node 22.20.0, Bun 1.3.14 and Rust
1.97.1. The manifest still pins Bun 1.4.2; the available shell binary is older.
The checked user Bun location did not provide the pinned version. Nothing was
installed and no pin was changed. These results are not a pinned-Bun certification.

The initial status included substantial pre-existing source, tests, migrations,
Cargo, CI, ESLint, README, package-script and renderer-checker-test edits. They
were preserved. In particular, the renderer checker test file was already dirty;
its diff against HEAD is not work from this phase.

## Current outcome

**The architecture tooling/documentation scope is implemented and its checks pass.
The full application gate does not pass on the existing dirty tree.**

The new checker uses installed TypeScript resolution, reads all application
TS/TSX under `src`, and never executes application modules or writes its own
baseline. It enforces exact ownership/import rules, runtime and type-inclusive
cycles, occurrence counts, stale allowances and malformed input rejection.

Current reviewed inventory:

- 233 source files and 2,679 binding-level dependency edges.
- 86 exact boundary identities, grouped only for compact spelling in JSON.
- Four cycle records: runtime 8 nodes/34 distinct internal binding edges;
  type-inclusive 10/46, 5/10 and 9/41. Repeated lazy imports retain count two.
- Every exception has an owner, rationale and concrete removal condition.
- No source/resolution errors and no baseline mismatches.

Inventory review distinguished pure provider metadata/workflow contracts from
mixed implementation barrels. The final review additionally classified eight
existing workflow/quality database edges as exact persistence debt. The public
policy does not blanket-approve private helper modules.

## Commands and observed results

Execution IDs refer to local foreground tool logs, not portable CI artifacts.

| Command / stage                                                             | Observed result                                                                                                                                                         | Execution evidence                         |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Unchanged `bun run check`, before edits                                     | Exit 1. Renderer checker: 15 tests passed; 105 current/105 allowlisted sites. Prettier failed on existing `tests/helpers/tauri-mocks.ts`; all later stages not reached. | `c9829062-0158-4934-8c25-4662f9b04167`     |
| `bun run check:architecture`                                                | Passed: 19 tests, no failures/skips; real-source graph matches reviewed baseline, zero errors.                                                                          | `e4ab840e-5f51-4be7-bf52-5e0c28be4dd2`     |
| Updated `bun run check`                                                     | Exit 1. Renderer stage and new architecture stage passed; same existing mock-helper Prettier failure. Later aggregate stages not reached.                               | `e4ab840e-5f51-4be7-bf52-5e0c28be4dd2`     |
| Separately: `bun run format:rust:check`                                     | Exit 1: formatting in pre-existing untracked `src-tauri/src/migrations/approval_readiness.rs`, around lines 50–71. Not changed.                                         | `0b66d7ae-17bf-4493-91ff-937c4800bc43`     |
| Separately: `bun run lint`                                                  | Passed.                                                                                                                                                                 | Same execution as above; individual exit 0 |
| Separately: `bun run lint:rust`                                             | Strict all-target/all-feature Clippy passed with `-D warnings`.                                                                                                         | Same execution; individual exit 0          |
| Separately: `bun run build`                                                 | Both TypeScript builds and Vite production build passed. Vite reported plugin timing warnings.                                                                          | Same execution; individual exit 0          |
| `node node_modules/@playwright/test/cli.js test --list`                     | 301 tests in 25 files; exit 0.                                                                                                                                          | `d19807be-65f8-4017-bc90-25168afd34c9`     |
| Separately: `bun run test`                                                  | Exit 1: 293 passed, 8 failed, no skipped tests reported; 301 accounted for.                                                                                             | Same execution; 11.8-minute browser run    |
| Separately: `bun run test:rust`                                             | Exit 101: 187 passed, 1 failed, 0 ignored; 188 library tests accounted for. Later Cargo test targets were not certified after failure.                                  | Same execution                             |
| `git diff --check -- AGENTS.md README.md docs/ARCHITECTURE.md package.json` | Passed for touched existing files.                                                                                                                                      | `e060ab64-b05d-42fb-8fb6-60552095ba94`     |

### Existing application-test failures observed (not repaired)

All eight browser failures time out at an attempted click on a **disabled Approve
button**. That is the observed symptom, not a completed root-cause diagnosis:

- `tests/agent-runtime.spec.ts:931`: approve/resume schedule metadata continuation.
- `tests/agent-runtime.spec.ts:971`: custom continuation missing Base URL.
- `tests/agent-runtime.spec.ts:1019`: second approval interrupt.
- `tests/agent-runtime.spec.ts:1060`: recoverable provider failure.
- `tests/agent-runtime.spec.ts:1160`: reload recovery after provider failure.
- `tests/agent-runtime.spec.ts:1294`: concurrent double resume.
- `tests/workflows.spec.ts:1629`: workflow-linked schedule continuation/stale resume.
- `tests/workflows.spec.ts:1692`: workflow-linked continuation recovery.

Rust failure:
`migrations::planner_draft_audits::tests::migration_is_registered_after_draft_ai_audits_in_production_order`,
at `src-tauri/src/migrations/planner_draft_audits.rs:94`, observed
`[32, 33, 34, 35, 36]` versus expected `[31, 32, 33, 34, 35]`.
This test and the newer migrations were pre-existing working-tree changes.
No assertion, migration, approval check or mock was weakened to obtain a pass.

The older audit's 273 browser/176 Rust counts are historical, not the current
inventory. The separately run stages do **not** turn the failed aggregate command
into a passing one. Repairs to these existing failures require separately scoped
work; this phase authorizes no runtime or existing-test edits.

## Criterion assessment

| Phase criterion                                                  | Current supporting evidence                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Module map, public contracts and ownership                       | `docs/ARCHITECTURE.md`, `docs/architecture-boundaries.md` and machine policy distinguish current debt from target feature API, workflow, agent, infrastructure and native ownership.                                                                                                                                    |
| Automated boundaries and cycles with finite reviewed exceptions  | Checker plus 19 passing regression tests; real-source check passes 86 exact boundary identities and four exact cycle records. Private/type-only imports, mixed barrels, local and direct re-exports, dynamic loads, additional bindings, duplicates, cycle merges/growth, stale and malformed allowances are exercised. |
| Native command/domain/transaction/transport/lifecycle boundaries | Native family table covers all requested families and associated tests; approval scheduling illustrates pinned settlement; scheduler/planner coupling is documented without speculative extraction.                                                                                                                     |
| Necessary preparatory extraction with preserved behavior         | None necessary or performed. No runtime exports were edited; build, frontend lint and Clippy passed. Existing full-suite failures above prevent a broader application-green claim.                                                                                                                                      |
| Conditional feature/contributor checklist                        | README, architecture docs, new contributor guidance and AGENTS require migrations only for storage changes, hook/UI when applicable, typed contracts, docs and relevant tests; no unused tables or speculative abstractions.                                                                                            |

## Preservation review and verification limits

The phase's edits are limited to the seven authorized new files and four existing
files: package scripts, README, architecture overview and AGENTS. Existing edits
in README/package scripts were retained. Final status was compared with the
initial status; unrelated dirty paths were already present. No edit operation or
formatter in this phase targeted `src`, `src-tauri`, existing tests, locks, CI,
ESLint, renderer transaction tooling/allowlist (allowlist since removed; checker is
zero-tolerance), `roadmap.md` or historical audit
reports. No whole-tree reset or formatter was used. Generated build/test outputs
remain outside Git. The initial capture did not hash every dirty file, so this is
an edit-scope/status review, not a byte-for-byte provenance claim for unrelated
concurrent work.

Regression fixtures exercise real TypeScript resolution and filesystem containment,
including a Windows directory junction, plus graph-level negative cases. JSON
schema and duplicate-property validation reject malformed allowances. Unsupported
loads and unresolved modules fail closed; imported application code is not run.

This is an import-structure gate, not a semantic proof of orchestration placement,
authorization, native SQL atomicity, network safety, arbitrary indirect loading or
runtime recovery. Native module boundaries are documented, not parsed by this
checker. No packaged desktop, real credential/keyring, live OAuth/AI/LinkedIn,
clean-install migration or cross-platform certification is claimed. Existing
approval, security and renderer transaction protections remain required.
