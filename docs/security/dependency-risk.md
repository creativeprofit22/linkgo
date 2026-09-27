# Dependency and supply-chain risk

Owner: creativeprofit22. Last full review: 2026-09-26. Next review due: before the earliest
exception expiry (2026-12-24), or whenever a dependency changes.

## How to scan

```bash
bun run check:deps
```

This runs the checker's regression tests, then `bun audit --json` and
`cargo audit --json --file src-tauri/Cargo.lock`. It compares every finding with the reviewed
exceptions in [`dependency-exceptions.json`](dependency-exceptions.json). Cargo `unmaintained`,
`unsound` and `yanked` warnings are treated as findings too. The check fails when:

- a finding has no exception;
- a matching exception has expired;
- an exception no longer matches any current finding (stale — prune it).

Exceptions match on exact ecosystem, advisory ID, package and locked version. There are no
wildcards and no blanket `--ignore` flags. Tool output is parsed but never echoed.

For `bun` entries, `version` is every locked version of that package name in `bun.lock`,
ascending and `|`-joined (e.g. `bun:GHSA-…:vite@7.0.0|8.0.10`), because `bun audit` does not
say which installed copy is affected. Copy it exactly from the check's failure output; a single
version will not match. The exception goes stale whenever any copy of the package changes
version, which forces a re-review. Cargo entries use the single locked version.

`check:deps` needs network access to the advisory databases, so it is not part of the offline
`bun run check`. CI runs it in the `supply-chain` job, and packaging depends on that job.
It needs `cargo-audit` (CI installs `cargo install cargo-audit --locked --version 0.22.2`).

## Secret scanning

CI downloads the official gitleaks 8.30.1 Windows release, verifies its SHA-256 against the
release checksums file, and runs `gitleaks git . --redact` over the full history
(`fetch-depth: 0`). No report artifact is uploaded. Reviewed false positives live in
[`.gitleaksignore`](../../.gitleaksignore) as exact fingerprints (commit, file, rule, line),
with a rationale. Never add path- or rule-wide allowlists.

If gitleaks reports a real secret: do not print it. Rotate it with the provider first, then
decide with the owner whether history needs rewriting. Never rewrite history as part of a scan.

## CI action pinning

Every third-party action is pinned to a full commit SHA with a version comment. To update one:

1. Resolve the tag with `gh api repos/<owner>/<repo>/git/ref/tags/<tag>`.
2. If the object type is `tag`, peel it with `gh api repos/<owner>/<repo>/git/tags/<sha>` to
   get the commit.
3. Cross-check that the moving major tag and the exact release tag resolve to the same commit.

`dtolnay/rust-toolchain` has no releases; it is pinned to a `stable` branch commit and sets
`toolchain: stable` explicitly.

## Current state (2026-09-26)

Remediated by lockfile/pin updates (see
[`../verification/2026-09-26-dependency-scan.md`](../verification/2026-09-26-dependency-scan.md)):

- JS: vite 8.0.10 → 8.0.16 (pin), postcss 8.5.28, nanoid 3.3.19, brace-expansion 5.0.12,
  browserslist 4.28.7, baseline-browser-mapping 2.11.26. `bun audit` is clean.
- Rust: rustls 0.23.45 (shipped TLS client), quick-xml 0.42.0 via plist 1.10.1,
  anyhow 1.0.104, event-listener 5.4.2, spin 0.9.9 (was yanked).

Remaining findings, each covered by a dated exception:

| Advisory          | Crate                    | Kind          | Reachability                                               | Blocked on                  |
| ----------------- | ------------------------ | ------------- | ---------------------------------------------------------- | --------------------------- |
| RUSTSEC-2026-0235 | rkyv 0.7.46              | vulnerability | Not compiled for any target (sqlx-mysql/rust_decimal only) | upstream sqlx               |
| RUSTSEC-2023-0071 | rsa 0.9.10               | vulnerability | Not compiled for any target (sqlx-mysql only)              | no patched release          |
| RUSTSEC-2024-0429 | glib 0.18.5              | unsound       | Linux only; affected `VariantStrIter` never called         | Tauri gtk-rs major upgrade  |
| RUSTSEC-2024-0370 | proc-macro-error 1.0.4   | unmaintained  | Build-time proc-macro (Linux gtk chain)                    | upstream gtk-rs             |
| RUSTSEC-2025-00xx | unic-\* 0.9.0 (5 crates) | unmaintained  | urlpattern via tauri-utils; no known vulnerability         | upstream urlpattern / Tauri |

Reachability was traced with `cargo tree -i <crate> -e normal,build --target <triple>` for
`x86_64-pc-windows-msvc`, `x86_64-unknown-linux-gnu` and `aarch64-apple-darwin`, plus
`--target all -e all --all-features`.

## Exception policy

- Exceptions are for findings with no compatible fix, or where the fix needs an upstream major
  change. Prefer a lockfile bump, then a manifest pin bump.
- Each entry needs: exact ID/package/version, kind, severity, a reachability verdict, a
  rationale, an owner, a review date and an expiry no more than 90 days after review.
- `kind` must equal the finding's kind (`vulnerability`, or the cargo warning category such as
  `unmaintained`, `unsound` or `yanked`); a mismatch fails `check:deps`. `severity` is a
  human-recorded, informational field and is not machine-checked against the finding.
- At expiry, re-run the scan and the reachability trace. Then remediate, or renew with a new
  review date and a fresh rationale. An expired entry fails `check:deps`.
- When an upgrade removes a finding, delete its exception in the same change (the stale rule
  enforces this).
