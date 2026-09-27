# Desktop release-candidate verification — 2026-09-27

Labels: **RUNTIME** = observed in this session on real hardware; **CODE** =
source inspection; **UNVERIFIED** = not exercised.

This is a **local release candidate**. It says nothing about live AI or
LinkedIn service availability.

## Candidate and environment

- Revision: `21ec734` plus this phase's uncommitted changes (keyring scoping,
  RC test identity, fixtures, desktop harness, docs). Nothing was committed,
  tagged, pushed, uploaded or published.
- Target OS: **Windows 10 Pro 22H2, build 19045, x64**, WebView2 runtime.
  The plan assumed Windows 11; the machine is Windows 10, so Windows 11 is
  listed as unverified below.
- Toolchain: rustc/cargo 1.97.1 (stable MSVC), Bun 1.4.2, Node 22.20.0,
  Playwright 1.59.1. The Windows SDK `rc.exe` path had to be exported as `RC`
  for native builds in this shell.

## Artifacts (built locally, not distributed)

| Artifact                                                       | SHA-256                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| `Linkgo_0.1.0_x64_en-US.msi` (production identity, build only) | `1779ed21029c761aae1faaa586b6b3ec7246bff71017df8df0792a94fcdafd95` |
| `Linkgo_0.1.0_x64-setup.exe` (production identity, build only) | `d4f05561db30ff5f05f839f6e1b4d81bbaf108b7eee58e49dace81537f33cd41` |
| `linkgo.exe` (production identity)                             | `129b4d5e9d7524a7785f6881603aca1b5f7958c75a4165b6f856ac0daf5d2855` |
| `Linkgo RC Test_0.1.0_x64_en-US.msi`                           | `9338a0d4b303ffb6d9ef0228cdf7f299d304d817da554435265224d2ed6c1fbf` |
| `Linkgo RC Test_0.1.0_x64-setup.exe` (installed and tested)    | `792a0f7f22e41b167bd8fa5180d9fdd77dc21b400f6e7c06e22f36ad6bc7b086` |
| `linkgo-rctest.exe`                                            | `bed93e4975e6d29988988181275c7d2b5e8b05aae6f5441c225133da060a317a` |

## Isolation of real user data — RUNTIME

All tests used the `com.linkgo.app.rctest` identity
(`src-tauri/tauri.rc-test.conf.json`). SHA-256, size and mtime of every file
in `%APPDATA%\com.linkgo.app` were recorded before any test and compared after
the install tests and again after cleanup: **unchanged both times**. No
`linkgo` keyring entry or production Run-key entry was created or modified.
`linkgo.exe` was confirmed not running before each harness run (the harness
fails closed otherwise).

## Results by criterion

### D1 — Packaging, startup, IPC/SQLite, keyring, tray, backup — RUNTIME

| Check                                                       | Result                                                                                                                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---- |
| Production-identity MSI + NSIS build                        | Pass (build only; not installed)                                                                                                                                      |
| RC NSIS silent install (per-user)                           | Pass                                                                                                                                                                  |
| Fresh profile startup                                       | Pass: 37/37 migrations, `integrity_check = ok`, 0 FK violations                                                                                                       |
| Pre-upgrade fixture (migration 33, populated)               | Pass: upgraded to 37; every table row count unchanged; integrity ok; 0 FK violations                                                                                  |
| All 15 main screens load over real IPC (fresh and upgraded) | Pass (`startup.desktop.ts`)                                                                                                                                           |
| ACL rejects `plugin:sql                                     | load/execute/select`, unknown commands, and `plugin:autostart                                                                                                         | enable`from`main` | Pass |
| OS keyring: save → status → delete dummy AI key             | Pass; stored as `openai.linkgo:com.linkgo.app.rctest` in Credential Manager; secret never returned to the renderer; 0 `linkgo` entries remained                       |
| Close window → hidden to tray, process alive                | Pass (Win32 `WM_CLOSE`, window invisible, process count 1)                                                                                                            |
| Second launch → exits and focuses the first window          | Pass                                                                                                                                                                  |
| Tray menu Show / Quit                                       | Pass — clicked by the operator (tray icon was not reachable through UI Automation); Quit exited the process with code 0                                               |
| Launch-on-login on/off from the settings window             | Pass; only the RC Run entry was added then removed                                                                                                                    |
| Uninstall                                                   | Pass; program folder and uninstall entry removed. **Data folders are kept on uninstall** (documented)                                                                 |
| Backup/restore drill                                        | Pass: marker campaign backed up, a later change was rolled back by restore, marker present, integrity ok; **RTO 2.4 s** (move aside + copy + relaunch + data visible) |

Journal mode observed on the packaged app: rollback journal (`delete`), not
WAL. The backup procedure still copies any `-wal`/`-shm`/`-journal` side
files for safety.

### D2 — Workflow, scheduler, crash recovery — RUNTIME

Run on the upgraded profile (`workflow.desktop.ts`) and the recovery fixture
(`recovery.desktop.ts`):

- Campaign → activate → manual candidate → manual draft (deterministic checks
  written natively) → select variant → dry-run AI audit and dry-run quality
  loop through the real UI → approval → approve with content revision →
  schedule: **pass**.
- Kill switch on: scheduler Start rejected; tick claims 0 and blocks the due
  job. **Pass.** The upgraded fixture had the kill switch on; the spec clears
  it explicitly through the audited safety command.
- Tick with no LinkedIn credential: claimed 1, published 0; job stays
  `scheduled` with `attempt_count 1`, `last_error "LinkedIn is not
connected"` and a later `next_attempt_at`; no open ambiguous execution. No
  network request is made (the credential lookup fails first — CODE,
  `publishing/transport.rs`). **Pass.**
- Start/stop persist `enabled`/`running`. **Pass.**
- Hard kill: the recovery fixture was loaded, the scheduler started, and the
  process was killed with `taskkill /F`. After relaunch: `enabled: true,
running: false` (worker not auto-resumed); the stale `reserved` execution
  was `abandoned`, the stale `in_flight` one became `outcome_unknown`; a tick
  published nothing and left the ambiguous execution's status and fence
  unchanged; a wrong confirmation was rejected; the operator reconciled it as
  Not posted through the Safety dialog. Final DB: integrity ok, 0 FK
  violations. **Pass.**

The exact settlement rules remain covered by the scripted-transport Rust tests
in `src-tauri/src/publishing/publishing_tests.rs`.

### D3 — Live AI and LinkedIn — release exclusion

The operator chose to test **AI only**, and asked for it to use account
sign-in (OAuth) for OpenAI and Anthropic the way the gg framework does.
Linkgo currently supports **API keys only** for those providers; OAuth exists
only for LinkedIn (CODE: `src-tauri/src/auth/providers.rs`, `oauth.rs`). No
live AI call was made in this phase. Adding OAuth sign-in is new feature work
and is recorded as a follow-up, not a pass.

- Live AI providers: **UNVERIFIED — release exclusion.**
- LinkedIn OAuth and publishing: **UNVERIFIED — release exclusion** (not
  authorized).

### D4 — Quality gate and test reconciliation

See "Gate results" below.

### D5 — Documentation

Updated README (desktop RC limits, lifecycle, backup link), ARCHITECTURE
(lifecycle, identity isolation), scheduler feature doc (restart and crash
behavior, operator recovery), integrations and threat-model notes (keyring
scoping), ROADMAP_MAPPING, roadmap, and the new backup/restore procedure. No
document claims work continues after a full quit or that Linkgo publishes
without human approval.

## Privacy, consent and accessibility review (bounded to shipped features)

- **Local data:** campaigns, sources, drafts, approvals, schedules, safety and
  publish history in one local SQLite file; credentials in the OS keyring
  (optional plaintext fallback only when explicitly enabled). — CODE/RUNTIME
- **Telemetry:** none found. No analytics SDK; CSP `connect-src` is limited to
  `'self'` and IPC; outbound traffic is native and only to configured AI
  providers and LinkedIn. — CODE
- **Accessibility:** new real-app axe scan (`accessibility.desktop.ts`,
  WCAG 2.0/2.1 A and AA) of all 15 screens in WebView2: **0 violations of any
  severity**. — RUNTIME. Existing browser-suite axe coverage is limited to
  Drafts panels. Keyboard-only and screen-reader walkthroughs: UNVERIFIED.
- **Obligations before any public release:** a privacy notice describing the
  local data, the data sent to AI providers and LinkedIn when the user
  triggers it, and how to delete it; compliance with LinkedIn API terms and
  the AI providers' terms for the chosen auth method; code signing (installers
  are unsigned). These are open items, not blockers for a local RC.

## Unsupported or unverified

- Windows 11, Windows on ARM, macOS, Linux.
- MSI installation (built, not installed).
- Live AI providers; LinkedIn OAuth and publishing.
- Power loss (a hard process kill was tested, not an OS crash).
- Code-signed installers and auto-update (neither exists).

## Gate results — RUNTIME

On the final tree (candidate revision plus this phase's changes):

- `bun run check`: **exit 0** — renderer-transaction guard, architecture
  (256 sources, 2798 edges, 75 exceptions, 0 errors), Prettier, rustfmt,
  ESLint, strict Clippy, build, Playwright **338/338 passed**, Rust **604
  passed, 0 failed, 2 ignored**.
- `bun run check:deps`: **exit 0** (9 Rust findings, all covered by active
  dated exceptions; see `docs/security/dependency-risk.md`).
- `bun run check:architecture`: exit 0 (also run separately).
- Desktop harness (`bun run test:desktop`, real app): startup 3/3 on the
  fresh and the upgraded profile, keyring 1/1, lifecycle 1/1, workflow 4/4,
  recovery 3/4 then the corrected reconciliation test 1/1 on the same
  profile (the full spec was not rerun because reconciliation consumes the
  fixture's only ambiguous execution), accessibility 1/1. Earlier failing attempts in this session
  were harness defects (wrong nav selector, wrong response field names, a
  kill switch left on in the upgrade fixture), fixed before the passing runs.

Reconciliation with the previous 314 Playwright / 521 Rust baseline
(`native-persistence-ownership.md`, commit `c209131`):

- Playwright 314 → 338 (+24): `playwright test --list` at `c209131` reports
  314 tests in 25 files; now 338 in 26. All 24 come from the 14 commits
  between `c209131` and `21ec734` (new `browser-preview.spec.ts`, plus added
  cases in the agent-runtime, approvals, comments, draft-quality-loop,
  integrations and safety-observability specs). This phase changed no default
  Playwright spec; the desktop specs live in `tests-desktop/` and are not
  collected by the default config.
- Rust 521 → 606 declared (+85): 521 at `c209131`, 602 at `21ec734` (+81
  from those commits), plus 4 in this phase — 2 keyring-service tests (run)
  and 2 fixture writers (`#[ignore]`, run only explicitly). Hence 604 passed
  and 2 ignored.

## Rerunning the desktop harness

`bun run test:desktop` attaches over CDP to an already running, installed
`Linkgo RC Test` build. Every spec is gated on `LINKGO_DESKTOP_SCENARIO`, so
the harness refuses to start unless it is `fresh`, `upgraded` or `recovery`.
Windows only.

**Safety:** every step below targets the RC test identity
`com.linkgo.app.rctest`. Never point any step at `%APPDATA%\com.linkgo.app` —
that is the real user profile.

1. **Build and install.** Run `bun run tauri:build:rctest`. If the build
   cannot find the resource compiler, export `RC` as the path to the Windows
   SDK `rc.exe` first. Then install silently:
   `"src-tauri/target/release/bundle/nsis/Linkgo RC Test_0.1.0_x64-setup.exe" /S`.
2. **Prepare the profile** (only while the RC app is quit). Leave
   `%APPDATA%\com.linkgo.app.rctest` absent or empty for `fresh`. For the
   other scenarios, generate fixtures from `src-tauri`:
   `LINKGO_FIXTURE_OUT=<empty dir> cargo test --lib release_fixtures -- --ignored`.
   This writes `pre-upgrade.db` (for `upgraded`) and `recovery.db` (for
   `recovery`). Copy the one you need to
   `%APPDATA%\com.linkgo.app.rctest\linkgo.db`.
3. **Launch.** Make sure the real `linkgo.exe` is not running (the harness
   fails closed if it is). Start `linkgo-rctest.exe` with
   `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`. To
   use another port, pass the same port to the harness via `LINKGO_CDP_PORT`.
4. **Run the scenario.** `LINKGO_DESKTOP_SCENARIO=<scenario> bun run test:desktop`.

| Scenario   | Profile          | Specs that run                                       |
| ---------- | ---------------- | ---------------------------------------------------- |
| `fresh`    | empty            | startup, keyring, lifecycle, workflow, accessibility |
| `upgraded` | `pre-upgrade.db` | startup, workflow, accessibility                     |
| `recovery` | `recovery.db`    | startup, recovery, accessibility                     |

The `recovery` scenario needs a crash first: launch the RC app on the
recovery fixture, start the scheduler (`linkgo_scheduler_start`), hard-kill
it with `taskkill /IM linkgo-rctest.exe /F`, relaunch it as in step 3, then
run with `LINKGO_DESKTOP_SCENARIO=recovery LINKGO_EXPECT_SCHEDULER_ENABLED=1`.
The recovery spec reconciles the fixture's single ambiguous execution, so
quit the app and copy a fresh `recovery.db` before rerunning it.

5. **Clean up.** Uninstall with `"%LOCALAPPDATA%\Linkgo RC Test\uninstall.exe" /S`.
   The uninstaller keeps data, so then delete only
   `%APPDATA%\com.linkgo.app.rctest` and `%LOCALAPPDATA%\com.linkgo.app.rctest`.
