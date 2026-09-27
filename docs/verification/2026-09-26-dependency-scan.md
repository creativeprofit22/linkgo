# Dependency scan — 2026-09-26 (pre-remediation)

Fresh scan for the "Resolve dependency risk and strengthen release checks" phase. It replaces
the September 14 counts, which are historical only.

## Environment

- HEAD `382acddc9f0803cd34bd548e997a60808328dafa`, clean working tree.
- Shell Bun 1.3.14 (`bun audit`; manifest pin `bun@1.4.2` unchanged), cargo 1.97.1,
  cargo-audit 0.22.2.
- RustSec advisory DB: 1271 advisories, commit `e2111519ba6d14a5da59a7b2e5c8083ae8a37c01`
  (updated 2026-09-25). `src-tauri/Cargo.lock`: 602 packages.

## Commands

```sh
bun audit --json                 # exit 1
bun audit --production --json    # exit 1 (nanoid, postcss, vite only)
cargo audit --json --file src-tauri/Cargo.lock   # exit 1
```

`bun audit --json` reports package name, advisory and vulnerable range only; the installed
versions below come from `bun.lock`.

## JavaScript findings (12 advisories, 6 packages)

| Package                  | Installed | Advisory            | Severity | Vulnerable       | Path                                                          |
| ------------------------ | --------- | ------------------- | -------- | ---------------- | ------------------------------------------------------------- |
| vite                     | 8.0.10    | GHSA-v6wh-96g9-6wx3 | moderate | >=8.0.0 <=8.0.15 | direct devDependency (and peer of `@tailwindcss/vite`)        |
| vite                     | 8.0.10    | GHSA-fx2h-pf6j-xcff | high     | >=8.0.0 <=8.0.15 | same                                                          |
| postcss                  | 8.5.15    | GHSA-fxqj-rqcc-2cmp | moderate | <=8.5.22         | vite → postcss `^8.5.10`                                      |
| postcss                  | 8.5.15    | GHSA-r28c-9q8g-f849 | high     | <=8.5.17         | same                                                          |
| nanoid                   | 3.3.12    | GHSA-28wg-ghj8-5hjv | high     | <3.3.16          | postcss → nanoid `^3.3.12`                                    |
| nanoid                   | 3.3.12    | GHSA-2v37-7h3g-55p8 | high     | <3.3.18          | same                                                          |
| brace-expansion          | 5.0.6     | GHSA-3jxr-9vmj-r5cp | high     | >=3.0.0 <5.0.7   | eslint / typescript-eslint → minimatch → `^5.0.5`             |
| brace-expansion          | 5.0.6     | GHSA-mh99-v99m-4gvg | high     | >=4.0.0 <5.0.8   | same                                                          |
| brace-expansion          | 5.0.6     | GHSA-rgw5-rvv9-x895 | high     | >=4.0.0 <5.0.9   | same                                                          |
| browserslist             | 4.28.2    | GHSA-c83g-rgw3-j3cx | high     | <=4.28.6         | eslint-plugin-react-hooks → @babel/core → compilation-targets |
| browserslist             | 4.28.2    | GHSA-73wf-gq98-2v4g | high     | <=4.28.6         | same                                                          |
| baseline-browser-mapping | 2.10.38   | GHSA-w5vr-8v7q-w6rv | moderate | >=2.0.0 <2.11.0  | browserslist → `^2.10.12`                                     |

## Rust findings (5 vulnerabilities, 10 warnings)

| Crate              | Version | Advisory          | Kind          | Patched   |
| ------------------ | ------- | ----------------- | ------------- | --------- |
| quick-xml          | 0.39.4  | RUSTSEC-2026-0194 | vulnerability | >=0.41.0  |
| quick-xml          | 0.39.4  | RUSTSEC-2026-0195 | vulnerability | >=0.41.0  |
| rkyv               | 0.7.46  | RUSTSEC-2026-0235 | vulnerability | >=0.8.17  |
| rsa                | 0.9.10  | RUSTSEC-2023-0071 | vulnerability | none      |
| rustls             | 0.23.41 | RUSTSEC-2026-0285 | vulnerability | >=0.23.45 |
| anyhow             | 1.0.102 | RUSTSEC-2026-0190 | unsound       | >=1.0.103 |
| event-listener     | 5.4.1   | RUSTSEC-2026-0221 | unsound       | >=5.4.2   |
| glib               | 0.18.5  | RUSTSEC-2024-0429 | unsound       | >=0.20.0  |
| proc-macro-error   | 1.0.4   | RUSTSEC-2024-0370 | unmaintained  | none      |
| unic-char-property | 0.9.0   | RUSTSEC-2025-0081 | unmaintained  | none      |
| unic-char-range    | 0.9.0   | RUSTSEC-2025-0075 | unmaintained  | none      |
| unic-common        | 0.9.0   | RUSTSEC-2025-0080 | unmaintained  | none      |
| unic-ucd-ident     | 0.9.0   | RUSTSEC-2025-0100 | unmaintained  | none      |
| unic-ucd-version   | 0.9.0   | RUSTSEC-2025-0098 | unmaintained  | none      |
| spin               | 0.9.8   | (yanked)          | yanked        | 0.9.9     |

## Reachability trace

Traced with `cargo tree -i <crate> -e normal,build --target <triple>` for
`x86_64-pc-windows-msvc`, `x86_64-unknown-linux-gnu` and `aarch64-apple-darwin`, plus
`--target all -e all --all-features`; JS paths come from `bun.lock`.

- **rustls 0.23.41 — shipped and reachable (all three targets).** reqwest (`rustls-tls`) →
  hyper-rustls / tokio-rustls. Every provider and LinkedIn HTTPS request is a TLS 1.3 client
  handshake. Fix is a lockfile-only bump to 0.23.45.
- **quick-xml 0.39.4 — linked, not reachable.** plist 1.9.0 → tauri-utils 2.9.3 (all three
  targets; also build-time via tauri-build). The only tauri-utils use is
  `config::file_associations_plist`, which _builds_ a `plist::Value`; no untrusted XML is parsed
  and linkgo declares no file associations. Fixed anyway by a lockfile-only bump: plist 1.10.1
  → quick-xml 0.42.0 (`tauri-utils` requires `plist = "1"`).
- **rkyv 0.7.46 and rsa 0.9.10 — not compiled for any target.** Present only in `Cargo.lock`
  via `rust_decimal` / `sqlx-mysql` (optional sqlx backends). `cargo tree -i` prints nothing for
  every target, edge kind and `--all-features`; linkgo enables only sqlx `sqlite` +
  `runtime-tokio`. No upgrade path without an upstream sqlx change → exception candidates.
- **anyhow, event-listener, spin** — shipped; lockfile-only patch bumps available.
- **glib 0.18.5** — Linux only (gtk → tray-icon/wry via tauri). Fix needs glib 0.20, which is a
  Tauri/gtk-rs major change → exception candidate.
- **proc-macro-error, unic-\*** — unmaintained, no fix. Build-time proc-macro / tauri-utils URL
  pattern tables → exception candidates.
- **All JS findings are build or lint tooling.** vite/postcss/nanoid run in `vite build` and the
  dev server; brace-expansion, browserslist and baseline-browser-mapping run under ESLint. The
  renderer source imports none of them. The only `nanoid` string in `dist/` is Zod's
  `z.nanoid()` format validator, not the nanoid package. The high-severity vite advisories do
  affect the local dev server, so they are still fixed rather than excepted.

## Available fixes (dry run)

- `cargo update --dry-run -p plist -p rustls -p anyhow -p event-listener -p spin`: anyhow
  1.0.104, event-listener 5.4.2, plist 1.10.1 (+ base64 0.23.1), quick-xml 0.42.0, rustls
  0.23.45, rustls-webpki 0.103.15, spin 0.9.9. No manifest change.
- JS: vite 8.0.16 (manifest pin bump; latest patch in 8.0.x), then lockfile resolution of
  postcss ≥8.5.23, nanoid ≥3.3.18, brace-expansion ≥5.0.9, browserslist ≥4.28.7,
  baseline-browser-mapping ≥2.11.0 within existing ranges.
