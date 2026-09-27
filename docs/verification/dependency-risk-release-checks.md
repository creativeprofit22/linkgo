# Verification — dependency risk and release checks (2026-09-26)

Phase: "Resolve dependency risk and strengthen release checks". Base revision `382acdd`, with
uncommitted changes (nothing committed or pushed). Environment: Windows, shell Bun 1.3.14 (the
manifest pin `bun@1.4.2` and CI `BUN_VERSION` are unchanged), cargo 1.97.1, cargo-audit 0.22.2,
gitleaks 8.30.1 (checksum-verified, in the git-ignored `.gg/tmp/`).

## Criteria and evidence

1. **Fresh scans traced per feature, target and API.** See
   [`2026-09-26-dependency-scan.md`](2026-09-26-dependency-scan.md). The pre-change scan found
   12 JS advisories, 5 Rust vulnerabilities and 10 warnings. That set includes `rustls`
   RUSTSEC-2026-0285 in the shipped TLS client, which the September 14 run did not have. The
   September 14 counts were not reused. Each finding was traced with `cargo tree -i` for the
   three desktop triples plus `--all-features`, and with `bun.lock` paths and source/`dist`
   greps for JS.
2. **Authorized pinned upgrades or dated exceptions.** The user approved every listed upgrade
   (gate G2).
   - JS: `vite` 8.0.16 (exact pin; rolldown 1.0.0-rc.17 → rc.18 and `@oxc-project/types`
     moved with it). Transitive entries were set to exact registry versions with integrity
     hashes: postcss 8.5.28, nanoid 3.3.19, brace-expansion 5.0.12, browserslist 4.28.7,
     baseline-browser-mapping 2.11.26, caniuse-lite, electron-to-chromium, node-releases. A
     plain `bun install` re-resolved about 20 unrelated packages, so that attempt was reverted.
     `bun install --frozen-lockfile` accepts the lockfile, and a non-frozen install makes no
     changes.
   - Rust: `cargo update -p plist -p rustls -p anyhow -p event-listener -p spin` (lockfile
     only).
   - The 9 remaining findings have exact exceptions in
     [`../security/dependency-exceptions.json`](../security/dependency-exceptions.json). Each
     has an owner (`creativeprofit22`), was reviewed 2026-09-26 and expires 2026-12-24.
   - No tools were installed globally. gitleaks was downloaded only after user approval
     (gate G1).
3. **Pinned CI actions and scanning.** All 9 `uses:` lines are pinned to full SHAs. Each SHA
   was resolved with `gh api`. The `rust-cache` v2.9.2 annotated tag was peeled to
   `6323deb…`. Moving tags (`v7`, `v2`) were cross-checked against exact release tags and
   match. `dtolnay/rust-toolchain` is pinned to the `stable` branch commit `6bed076…` with
   `toolchain: stable`. The new `supply-chain` job runs:
   - `cargo install cargo-audit --locked --version 0.22.2`;
   - `bun run check:deps`;
   - a SHA-256-verified gitleaks 8.30.1 `git . --redact` over `fetch-depth: 0`, with
     `persist-credentials: false` and no report upload.

   `package-windows` now needs `[check, supply-chain]`. The local full-history gitleaks run
   covered 65 commits. It found 5 hits (rules `linkedin-client-id` ×3 and
   `linkedin-client-secret` ×2). All 5 are JavaScript identifiers (approval-state booleans and
   test-mock counters) and were checked without printing the matched values. They are recorded
   as exact fingerprints in `.gitleaksignore`. The rerun exits 0 ("no leaks found"). Gate G3
   was not triggered.

4. **Ownership, toolchains, permissions, no blanket suppressions.**
   - Scanner code lives only in `scripts/` and adds no new dependencies. It is not in the
     offline `bun run check`, because it needs the network.
   - Workflow permissions stay `contents: read`, and the new job repeats that explicitly.
   - Toolchain pins are unchanged.
   - Exceptions match exact ID + package + version. Wildcards are rejected, expiry is capped at
     90 days, and stale entries fail the check. No `--ignore` flags or path-wide gitleaks
     allowlists were added.
5. **Docs and checks.**
   - Docs: [`../security/dependency-risk.md`](../security/dependency-risk.md), `CONTRIBUTING.md`,
     `threat-model.md` (Lockfile advisories row, Not covered bullet) and the `roadmap.md`
     supply-chain entry.
   - Checks run on the final dependency set:

| Command                                                    | Result                                                                                                                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run test:deps`                                        | 13/13 pass                                                                                                                                                           |
| `bunx eslint scripts/check-dependency-audit*.mjs`          | exit 0                                                                                                                                                               |
| `bun run check:deps`                                       | exit 0 — "9 finding(s), 9 covered by active exceptions"; `bun audit` alone: no vulnerabilities                                                                       |
| `bun run check` (full gate, incl. `check:architecture`)    | exit 0 — renderer transactions 0; architecture 0 errors; Prettier, rustfmt, ESLint, Clippy clean; build ok; Playwright 338 passed; Rust 602 passed, 0 failed/ignored |
| `bun run tauri:build`                                      | first run exit 1: `rc.exe` not on this shell's PATH (environment, not code). Rerun with `RC=<Windows SDK 10.0.26100.0 x64 rc.exe>` exit 0: MSI + NSIS produced       |
| `bunx prettier --check .`                                  | clean                                                                                                                                                                |
| `gitleaks git . --redact` (full history, with ignore file) | exit 0, 65 commits                                                                                                                                                   |

## Limits

- **CI not executed (gate G4).** Nothing was committed or pushed. The `supply-chain` job and
  the SHA pins are proven by YAML review, `gh api` resolution and a local run of the same
  commands, not by a GitHub Actions run. The PowerShell download/verify step has not run on a
  hosted runner.
- The local scans used shell Bun 1.3.14; CI pins 1.4.2. The lockfile format (v1) and frozen
  install are unaffected. The `bun audit --json` shape was verified separately with the
  official Bun 1.4.2 Windows x64 release zip (SHA-256 matched the release's `SHASUMS256.txt`,
  run from a git-ignored temp folder): against the pre-remediation lockfile from `382acdd` it
  printed a report byte-identical to 1.3.14's (6 packages, 12 advisories, exit 1), and `{}`
  (exit 0) for the current lockfile. With 1.4.2 first on PATH,
  `node scripts/check-dependency-audit.mjs` exited 0 with "9 finding(s), 9 covered". A trimmed
  1.4.2 fixture is a regression test, and `parseBunAudit` now rejects empty advisory lists, non-object
  advisories and package keys absent from `bun.lock`, so a wrapper such as
  `{ "vulnerabilities": [] }` fails closed. Other OS builds of 1.4.2 were not run.
- Reachability for Linux/macOS is from `cargo tree` only; nothing was built for those targets.
- The installers were built but not installed or launched.
- The advisory databases change daily. A new advisory will fail `check:deps` until it is
  remediated or excepted, which is intended.
