# Dependency scan — 2026-10-25 (post-remediation)

Scan after the 2026-10-25 dependency remediation. It supersedes the 2026-09-26 counts, which
are historical only.

## Environment

- HEAD `d785e9ecfff7aecb9fd92f0c70079147fc551754`.
- Shell Bun 1.3.14 (`bun audit`), cargo 1.97.1, cargo-audit 0.22.2.
- `src-tauri/Cargo.lock`: 607 packages.

## Commands

```sh
bun audit --json                 # exit 0
bun run check:deps               # 12 finding(s), 12 covered by active exceptions
```

## Remediation

| Ecosystem | Package                | Change                    | Advisories cleared                                                                                      |
| --------- | ---------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| JS        | vite                   | 8.0.16 → 8.1.6 (pin)      | GHSA-587h-7wmj-h5pm, GHSA-698v-4r3x-3vcv, GHSA-9jrq-w75r-8gcw, GHSA-r825-w8mm-5pxw, GHSA-rq7h-c2jc-7f22 |
| JS        | zod                    | 4.6.7 (pin + `overrides`) | GHSA-mrhx-c7xc-m3w5 (eslint-plugin-react-hooks no longer locks zod 4.4.3)                               |
| JS        | @tauri-apps/plugin-sql | removed                   | —                                                                                                       |
| Rust      | rustls-webpki          | → 0.103.16 (lockfile)     | RUSTSEC-2026-0381, RUSTSEC-2026-0382, RUSTSEC-2026-0386 (with webpki-roots and tokio bumps)             |
| Rust      | webpki-roots           | → 1.0.11 (lockfile)       |                                                                                                         |
| Rust      | tokio                  | → 1.54.1 (lockfile)       |                                                                                                         |

## Remaining findings (12, all excepted)

All are Rust; JS is clean. Each matches an entry in
[`../security/dependency-exceptions.json`](../security/dependency-exceptions.json) and is
listed in [`../security/dependency-risk.md`](../security/dependency-risk.md): rkyv, rsa, glib,
proc-macro-error, five unic-\* crates, and zvariant / zbus_names / zvariant_derive
(RUSTSEC-2026-0370/0371/0372, Linux-only via tauri-plugin-single-instance → zbus). 0 unreviewed.
