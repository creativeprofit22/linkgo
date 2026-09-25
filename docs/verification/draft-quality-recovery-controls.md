# Draft quality recovery controls

Resume is offered only for a failed run on the current content revision with a highest attempt number below three. It is disabled while pending or while the current AI audit is not ready. The scorecard read model already selects the latest run for the current revision; native validation remains authoritative if state changes after render.

`needs_revision`, exhausted failures, and stale failures do not offer Resume. The panel explains how to edit, re-audit, and re-score and retains the ordinary, audit-gated Run quality loop action. The two-rewrite and three-attempt limits are unchanged. No schema, migration, or native accepted-state change is needed.

The Tauri mock resumes directly, rather than incorrectly using rewrite continuation (which requires a linked rewrite audit). It checks variant ownership, current revision, latest run/audit evidence, and `MAX(attempt_number) + 1 <= 3` before writes.

Regression coverage:

- Browser-mounted real scorecard: failed recoverable, final retry, exhausted, needs revision, and stale revision; verifies callback selection and the ordinary run confirmation path.
- Mock command: the same cases, including sparse attempt numbering; rejected actions preserve the full mock state.
- Native SQLite fixture: the same cases; rejected actions preserve snapshots of quality, draft, audit, and agent tables. Existing native fixtures also cover latest-audit and superseded-run rejection.

Commands:

```sh
cargo test --manifest-path src-tauri/Cargo.toml draft_quality
node node_modules/@playwright/test/cli.js test tests/draft-quality-loop.spec.ts
```
