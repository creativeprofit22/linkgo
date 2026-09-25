# Contributing to Linkgo

Build one runnable feature slice at a time. Preserve current behavior and public
exports when moving responsibilities; keep behavioral fixes separate.

## Feature checklist

- Identify the owner and public entry point using the
  [architecture boundary map](architecture-boundaries.md) and
  [machine policy](../scripts/architecture-policy.json).
- Add a migration **when storage changes**, owned by the feature that uses it.
  Never create unused tables or speculative shared frameworks.
- Define types and Zod schemas at the public contract boundary.
- Expose typed feature capability/data APIs. Native code owns authoritative durable
  mutations; orchestration belongs to workflows, not React hooks or agent tools.
- Add a hook for presentation state/actions and components **when UI is needed**.
  Components use typed APIs/hooks; cross-feature UI composition uses public indexes.
- Add feature docs and applicable characterization, contract, browser and real
  SQLite tests. Include failure, rollback, concurrency and approval cases when
  the capability changes those behaviors.
- Preserve human approval for LinkedIn publishing/commenting, conservative safety
  defaults and the existing renderer transaction check.

## Check before handing off

Use the installed versions and prerequisites in [README](../README.md#setup).
Do not silently install packages, change toolchain pins, bypass gates or repair
unrelated working-tree edits.

```bash
bun run check:architecture
bun run check
```

`check:architecture` runs the checker regression tests and the real application
source check. The full gate retains renderer transaction tests/checks, formatting,
Rust formatting, frontend lint, strict Clippy, build, Playwright and Rust tests.
CI already calls the same aggregate command. A failed early stage means later
stages did not run; report separately executed stages accurately.

Browser mocks do not certify native IPC, keyring, desktop lifecycle or live
OAuth/AI/LinkedIn behavior. Record revision, dirty-tree qualification, command,
versions, exit status and skips in a new verification report, not by rewriting
historical evidence.

## Import rules and legacy exceptions

Public feature paths are `index.ts`, `data.ts`, `schemas.ts` and `types/index.ts`.
A type-only import still cannot cross a private feature boundary. A mixed runtime
barrel is not a UI-safe contract. Do not expose every helper through the policy to
make a failure disappear.

For a violation, fix its ownership in the authorized slice or obtain explicit
architecture review. Inspect candidates without changing the baseline:

```bash
node scripts/check-architecture.mjs --inventory
```

The inventory prints candidates; it never approves or writes them. Every exception
must carry exact importer, resolved target, kind, binding/export form, occurrence
count, module owner, rationale and concrete removal condition. Grouped binding
maps are only compact spelling of exact identities, not a budget or wildcard.
Cycles pin exact membership and internal edges, including type edges and repeated
occurrences. A new binding, duplicate violation or cycle merge cannot be paid for
by deleting unrelated debt. Stale and duplicate allowances fail too.

When removing debt, prune only the exact identities removed and rerun the tests
and source check. Explain policy/baseline changes in the review; do not add an
automatic baseline-refresh command or suppress an existing transaction/security
check. See the boundary map for future migration sequencing and associated
Roadmap owners. Those references do not authorize additional runtime changes.
