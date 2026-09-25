# Latest current-revision draft evidence

Verified locally on 14 September 2026. Scope: authoritative-run selection only;
DTO and completed-provider-evidence validation remain separate repairs.

## Rule

Choose the highest run ID for the variant's current content revision **before**
checking whether it passed. Never fall back to an older passing check.

- Native quality claim, resume, rewrite continuation and settlement require the
  latest AI audit to be completed with exactly six canonical, nonblocking findings.
- Resume, continuation and settlement also reject a superseded quality run.
- Rewrite continuation still requires its linked audit to finish, but a later
  valid current-revision audit supplies readiness instead of historical findings.
- Approval eligibility and storage guards use the latest current-revision quality
  run, requiring `passed` and a score of at least 70, matching the existing display.
- Missing, pending, running, failed, cancelled, incomplete and blocking AI evidence
  fail closed. Real content edits exclude all prior-revision evidence. A valid
  latest same-revision pass restores readiness.

## Storage and frontend

Forward migration 36 replaces only `approval_ready_variants`. It does not delete
checks, invalidate history, or rewrite approvals. Migration 35 remains unchanged.
The existing frontend approval queries already consume this shared view; no new
frontend types, schemas, hooks or panels are needed for this correction.

The browser helper now reads quality runs and attempts in the same order/revision
scope as the real queries, applies latest-run eligibility, and represents native
quality failure as `failed` rather than synthesizing a passing score.

## Runtime evidence

- Before the native fix, the new isolated fixture failed because claim accepted an
  older passing audit despite a newer pending audit.
- `cargo test --manifest-path src-tauri/Cargo.toml draft_quality`: **9 passed**.
  The authority matrix tests claim/resume/continuation/settlement against newer
  pending, running, failed, cancelled, blocking, incomplete and extra-finding
  audits. Rejections preserve durable snapshots; newer valid audits restore the
  operations, including settlement with completed native provider evidence.
  Superseded resume and real content edits are also covered.
- The forward-migration fixture first reproduces old eligibility, then upgrades a
  populated database transactionally and verifies latest quality status, approval
  storage rejection, preserved history and fresh-revision recovery.
- `cargo test --manifest-path src-tauri/Cargo.toml approval_readiness`: **5 passed**.
- `npx playwright test tests/approvals.spec.ts tests/draft-ai-audits.spec.ts tests/draft-quality-loop.spec.ts tests/dry-run-quality-loop.spec.ts tests/draft-quality-tool.spec.ts`:
  **52 passed**. New browser cases show latest running/failed quality instead of an
  older pass, reject approval creation/eligibility, and restore both display and
  readiness after a new valid pass. The test server's TypeScript/Vite build passed.
- Prettier checks for the changed browser test files and `git diff --check` passed.
  ESLint does not cover these test files (reported ignored); no lint claim is made.

## Limits

Browser tests use the Tauri helper; native tests separately exercise actual SQLite
and Rust operations. No live provider calls, production database migration or full
application/security audit was performed. No external corpus research was needed.
