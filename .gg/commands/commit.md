---
name: commit
description: Linkgo commit gate — group uncommitted work, run the project checks, review against Linkgo invariants, commit in order, push once
---

Clicking `/commit` authorizes this entire workflow. Execute directly: never enter plan mode, create a plan, pause for confirmation, or ask how to group changes.

Scope comes from git, not this conversation: handle every uncommitted change in the repository (staged, unstaged, and untracked), whatever session or person made it. Use conversation context only as a hint for grouping and messages.

1. Inspect `git status`, staged/unstaged diffs, untracked files, and recent commit subjects. If nothing is uncommitted, say so and stop.
2. Leave out and report anything that must not be committed: secrets or credentials (`.env*` other than `.env.example`, tokens, keychain dumps), build output (`dist/`, `src-tauri/target/`), Playwright output (`playwright-report/`, `test-results/`), logs, scratch files, or clearly unfinished edits. Never delete, revert, or discard them.
3. Group changes by purpose, splitting exact hunks only when a file spans independent purposes. Keep coupled changes together (a Rust command, its `src-tauri/permissions/main-commands.toml` entry, and its frontend `invokeCommand` caller belong in one commit; so do a migration and the code that uses it). Order foundations before dependents.
4. Run the Linkgo checks, once, in this order, chained with `&&` and never masked:
   1. `bun run check` — the full CI gate (renderer-transactions, architecture + CSP, glossary, Prettier, cargo fmt, ESLint, test typecheck, clippy `-D warnings`, build, Playwright, cargo test).
   2. `bun run check:deps` — only when `package.json`, `bun.lock`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, or `scripts/dependency-audit*` changed. It needs `cargo-audit`; if that is missing, report the check as not run instead of skipping silently.

   If Prettier or ESLint fails, run `bunx prettier --write <changed files>` / `bunx eslint --fix <changed files>` (not the repo-wide `format` / `lint:fix` scripts), fold those fixes into the matching group, and rerun only that check. If the Playwright step goes quiet for more than ~5 minutes, stop it and rerun the remaining steps individually (`bunx playwright test`, then `bun run test:rust`); report exactly which steps passed. If a required check still fails, stop and report it; do not fix unrelated failures. Never run paid checks (`LINKGO_BRIGHTDATA_LIVE`) or the desktop RC suite (`test:desktop`) from this command.

5. Spawn ONE subagent with the full diff for a fast review. It reports only findings with confidence ≥ 80 (pre-existing issues and style nitpicks score low) covering real bugs, regressions, debug leftovers, unintended changes, and these Linkgo invariants:
   - No edits to an already-shipped migration in `src-tauri/src/migrations/`; new migrations are appended to the end of `mod.rs`; no pre-created future tables.
   - Every new frontend `invoke` / native command is registered in Rust and allowed in `src-tauri/permissions/main-commands.toml`; no secret-returning command is exposed.
   - LinkedIn publishing and commenting stay human approval-gated; publish fencing (`owner_token` + `fence`), stale-revision/audit/quality checks, and conservative caps (1 post/day, 5 comments/day defaults) are not weakened.
   - No SQL, `@tauri-apps/plugin-sql`, or transactions in `src/`; no frontend `fetch` to external hosts; CSP `connect-src` unchanged.
   - Secrets stay in the OS keychain, never SQLite, logs, or committed files; bundle identifier `com.linkgo.app` unchanged.
   - DB pool stays `max_connections(1)`; ports 17420/17421/17422 change only together.
   - Cross-feature imports use only a feature's `index.ts`, `data.ts`, `schemas.ts`, `types/index.ts`.
6. If the review is CLEAR, continue. Otherwise show the findings and use one `ask_user` choice whose `detail` names the blocking findings in one plain sentence: fix first (recommended) or commit anyway. On fix-first, fix and rerun only the affected checks without another review.
7. For each group, stage exact paths or hunks — never `git add -A` or interactive `git add -p` (stage a hunk with `git apply --cached`). The index must hold only that group, including anything staged before the run; inspect its staged diff before committing.
8. Create ordered commits with concise Add/Update/Fix/Remove/Refactor messages. Never use `--no-verify`; if a hook fails, fix the cause, restage, and commit again. Push exactly once after all commits if the branch tracks a remote; otherwise say so. Never force-push.

Finish with the created commits, anything left uncommitted and why, which checks passed (and any not run), the review result, and the push result.
