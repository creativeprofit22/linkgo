# 01 — Research Protocol And Bright Data Readiness

Status: **outline — not started.** Sections below say what each part must
contain. Nothing here is a finding yet.

| Field       | Value                                                                           |
| ----------- | ------------------------------------------------------------------------------- |
| Phase       | 1 of 11                                                                         |
| Hypotheses  | H1–H12 (criteria only; no verdicts in this phase)                               |
| Bright Data | CLI 0.3.7: key bridge, `zones`, `budget`, pilot `search`, `scrape`, `pipelines` |
| Team        | 1 Script builder (`bee`), 1 Verifier (`owl`)                                    |
| Depends on  | `00-context-and-approach.md`                                                    |
| Raw data    | `data/raw/01-protocol/`                                                         |

---

## 1. Pre-Registered Criteria

Registered 2026-10-02, before any Bright Data collection. These replace the
draft "would contradict" column in `00-context-and-approach.md` section 2. Any
later change is logged in section 10 with a date and reason.

### 1.1 Evidence units

- **Coded record:** one deep-sample page, post, video or comment set, stored
  under `data/raw/`, read in full by an Analyst and coded **supports /
  contradicts / neutral / off-topic** for one hypothesis. The Verifier re-checks
  the coding.
- **Source type:** one of (a) published survey or official platform statistic,
  (b) community posts and comments, (c) official product, policy or project
  pages, (d) project repositories and release data, (e) news coverage. Two
  records are independent only if they come from different source types or
  different platforms.
- **Signal count:** keyword hits in SERP titles and snippets. A signal count
  measures public visibility only (`00` section 3.6). It **never decides a
  verdict alone**; it can only point the deep sample at where to read.

### 1.2 Verdict rules (apply to every hypothesis)

Minimum evidence for any verdict other than Unproven: **at least 20 on-topic
coded records from at least 3 platforms and at least 2 source types**, unless
the hypothesis row below sets a stricter or different minimum.

| Verdict             | Rule                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Supported           | Minimum met; the row's support test is met; **≥ 60%** of on-topic coded records support; **< 25%** contradict.                           |
| Contradicted        | Minimum met; the row's contradiction test is met; **≥ 60%** of on-topic coded records contradict; **< 25%** support.                     |
| Partially supported | Minimum met; support holds for a defined segment, platform or sub-claim only, or support leads (≥ 40% and above the contradict share).   |
| Unproven            | Minimum not met, or the evidence is balanced, or contradiction leads without reaching 60%. The report records the lean, e.g. "leans no". |

Contradicting and supporting evidence carry equal weight. A single strong
source (e.g. a large published survey) can satisfy a row's quantitative test,
but the minimum volume still applies before Supported or Contradicted.

### 1.3 Criteria per hypothesis

| ID  | Support test                                                                                                                  | Contradiction test                                                                                             | Stays Unproven when                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| H1  | ≥ 2 independent surveys or official platform statistics place the median or modal age of modders/port players in 15–21.       | ≥ 2 independent surveys or official statistics place the median at 22+ or the majority outside 15–21.          | Fewer than 2 such sources. Self-stated ages in posts (≥ 30 needed) are colour only, never decisive. |
| H2  | Most on-topic creator-side records describe little or no prior coding experience.                                             | Most on-topic creator-side records show prior programming skill or professional development work.              | Skill cannot be inferred from most records.                                                         |
| H3  | A clear share of records (≥ 30% of on-topic records) come from people who only want to play, **and** they report unmet needs. | Play-only users report being well served (install and discovery praised), or play-only records are under 10%.  | The play/create split cannot be read from the records.                                              |
| H4  | Idea and request posts are common in the deep sample (≥ 25% of on-topic creator-side records).                                | Idea and request posts are under 10%, or "no ideas" posts outnumber them.                                      | Fewer than 20 creator-side records.                                                                 |
| H5  | Most beginner records describe not knowing where to start or the tools as too hard.                                           | Most beginner records describe tutorials and tools as sufficient or easy.                                      | Fewer than 20 beginner records.                                                                     |
| H6  | Records wanting to make an original game outnumber those wanting to mod an existing game, or reach ≥ 40%.                     | Records wanting to mod existing games make up ≥ 75% of on-topic creator-side records.                          | The goal cannot be read from most records.                                                          |
| H7  | Repeated public demand for named dormant IPs **and** at least some revivals that survived (licensed or tolerated).            | Little revival demand, **or** demand exists but most visible revival attempts end in takedowns.                | Demand found but survival rate unknown.                                                             |
| H8  | Port projects show broad demand (many titles, active releases, player discussion across ≥ 3 platforms).                       | Port interest concentrates in a handful of titles, or existing projects fully serve it.                        | Demand measurable on fewer than 3 platforms.                                                        |
| H9  | Rust rebuilds appear in player-side (not only developer-side) conversations on ≥ 2 platforms.                                 | Rust rebuilds appear only on developer sites (GitHub, Hacker News, Rust forum) or are rare.                    | Fewer than 10 on-topic Rust rebuild records.                                                        |
| H10 | Most friction records name barriers (install, setup, tools, learning) as the main problem for playing or creating.            | Most records describe current tools as easy enough; complaints focus elsewhere (content, performance, drama).  | Friction cannot be separated from other complaints.                                                 |
| H11 | Records show unmet needs the incumbents do not cover (beginners, ports, creation) and stated reasons to switch.               | Official pages show incumbents cover those needs **and** user records are mostly satisfied.                    | Coverage is mixed or switching reasons are unclear.                                                 |
| H12 | Discord is the most cited gathering place in records and public directories list active modding servers with room to grow.    | Gathering concentrates elsewhere, or public directories show the niche saturated by large established servers. | Discord activity cannot be measured from public data (servers are not joined).                      |

## 2. Query Matrix Definition

Frozen 2026-10-02 in `scripts/config/query-matrix.json`. The expanded list is
generated by `scripts/build-queries.mjs`; its count and SHA-256 are recorded
in section 2.5.

### 2.1 Template

`site:<host> "<theme phrase>" <intent word>`

Example: `site:reddit.com "PC port" recommend`. Disconfirmation queries are
free-form and have no `site:` filter, so they can reach any source.

### 2.2 Platforms (20)

From `00` section 6.1. Each platform has one host; the reason per host is in
the JSON file.

| Platform       | Host             | Platform     | Host                   |
| -------------- | ---------------- | ------------ | ---------------------- |
| Reddit         | `reddit.com`     | Thunderstore | `thunderstore.io`      |
| YouTube        | `youtube.com`    | Steam        | `steamcommunity.com`   |
| TikTok         | `tiktok.com`     | itch.io      | `itch.io`              |
| X              | `x.com`          | GitHub       | `github.com`           |
| Discord (dir.) | `disboard.org`   | Fandom       | `fandom.com`           |
| Nexus Mods     | `nexusmods.com`  | Twitch       | `twitch.tv`            |
| ModDB          | `moddb.com`      | ResetEra     | `resetera.com`         |
| GameBanana     | `gamebanana.com` | Hacker News  | `news.ycombinator.com` |
| CurseForge     | `curseforge.com` | GBAtemp      | `gbatemp.net`          |
| mod.io         | `mod.io`         | Rust forum   | `users.rust-lang.org`  |

- Discord is covered only through a public directory; servers are never joined.
- "Game-specific forums" became GBAtemp, the main homebrew and port forum.
- "Rust community forums" became the official Rust users forum.

### 2.3 Themes (11) and intents (5)

| Theme        | Phrase              | Theme      | Phrase             |
| ------------ | ------------------- | ---------- | ------------------ |
| mod-install  | `install mods`      | ip-revival | `dead franchise`   |
| mod-creation | `making mods`       | mod-tools  | `modding tools`    |
| pc-port      | `PC port`           | learning   | `modding tutorial` |
| decomp       | `decompilation`     | community  | `modding discord`  |
| rust-rebuild | `rewritten in Rust` | legal      | `cease and desist` |
| fan-game     | `fan game`          |            |                    |

Phrases name a topic, never an expected answer (`00` section 3.1). "Making
mods" avoids "beginner" so it does not presume skill; "rewritten in Rust"
avoids the survival game _Rust_.

Intents: `recommend`, `problem`, `how to`, `alternative`, `request`.

### 2.4 Disconfirmation set (36)

Three queries per hypothesis, each written to find evidence **against** it
(e.g. `"average age" modders`, `"mod manager" "easy to use"`,
`"modding has never been easier"`). The full list is in the JSON file under
`disconfirmation`.

### 2.5 Totals

- Matrix: 20 × 11 × 5 = **1,100** queries.
- Disconfirmation: **36** queries.
- Total: **1,136** queries. Query IDs: `m-<platform>-<theme>-<intent>` and
  `d-<hypothesis>-<n>`.
- Frozen list: `scripts/config/query-list.json`, generated 2026-10-02 by
  `node scripts/build-queries.mjs`: **1,136** queries, SHA-256
  `d2b459f4f0061518a22ed0dab2bff0a2fc2238e3d6059b337d40fd3545932bea`.
  Regenerating gives the same hash; any change to the matrix changes it and
  must be logged in section 10.

## 3. Signal Keyword Groups

Frozen 2026-10-02 in `scripts/config/signal-groups.json`. Matching is whole
word or whole phrase, case-insensitive, on SERP titles and snippets.
**Negation is not handled** ("not easy" counts as `easy`), so stance comes only
from deep-sample reading.

| Group              | Terms                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| beginner           | beginner, beginners, newbie, noob, new to modding, first mod, never coded, no coding, no programming, no experience, complete beginner |
| learning-curve     | learning curve, where do i start, where to start, how do i start, overwhelming, confusing, too complicated, steep, struggling, stuck   |
| play-only          | download, install, installing, play, modpack, mod manager, load order                                                                  |
| ideas-requests     | idea, ideas, mod request, requesting, wish someone, someone should make, would love a mod                                              |
| own-game           | my own game, make a game, making a game, first game, indie game, game jam                                                              |
| revival            | revive, revival, dead franchise, abandoned, abandonware, remake, remaster, childhood                                                   |
| port               | port, ported, porting, pc port, native port, unofficial port                                                                           |
| decomp             | decomp, decompilation, decompiled, recomp, recompilation, reverse engineering, reverse engineered                                      |
| rust               | rust, rewritten in rust, written in rust, bevy, rustlang                                                                               |
| ease-satisfaction  | easy, easier, simple, one click, works great, no problems, straightforward, user friendly                                              |
| legal              | cease and desist, takedown, dmca, lawsuit, shut down, copyright, nintendo                                                              |
| discord            | discord, discord server, server invite                                                                                                 |
| age                | years old, teen, teenager, high school, middle school, kid, kids, adult, in my 30s, in my 20s                                          |
| competitor-mention | nexus mods, nexusmods, moddb, gamebanana, curseforge, mod.io, thunderstore, steam workshop, itch.io, vortex, mod organizer             |

Known limits: `rust` also matches the survival game; `play` and `install` are
broad. These groups locate where to read, they do not measure stance.
`ease-satisfaction` exists so disconfirming language is counted as visibly as
friction language.

## 4. Bright Data Readiness

Readiness is proven, last checked **2026-10-02 21:52 UTC**. Raw evidence is in
`data/raw/01-protocol/readiness/`, `zones/` and `run-log.jsonl`.

| Item            | Result (2026-10-02)                                                                                                                                                                                                                                                 | Evidence                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| CLI version     | `0.3.7`. The runner refuses any other version.                                                                                                                                                                                                                      | `readiness/version-*.json`                                |
| Key bridge      | Reads Credential Manager target `brightdata.linkgo` (keyring service `linkgo`, user `brightdata`, UTF-16LE, not chunked) and passes it only as `BRIGHTDATA_API_KEY` in the child env. `brightdata login` is never run; no `%APPDATA%/brightdata-cli` folder exists. | `scripts/bd-key.ps1`, `scripts/lib/secret.mjs`, section 9 |
| Key permissions | The first saved key (ending `…cba2`) could create a Web Unlocker zone but got HTTP 403 on SERP zone creation and on the balance call. The owner saved an admin key (ending `…871e`) through the Linkgo app; both calls then worked.                                 | `zones/zone-create-*.json`, run log 20:52–21:27 UTC       |
| Zones           | `cli_unlocker` (Web Unlocker, created 20:52 UTC) and `cli_serp` (SERP, created 21:27 UTC), both via `scripts/bd-zones.mjs`, which uses the same request bodies as CLI `login` / the official SDK. Creating zones is free.                                           | `readiness/zones-*.json`                                  |
| Balance         | `budget` returns `balance 0, credit 0, prepayment 0, pending_costs 0`. The free trial credit is not shown in this field, so the spend meter uses `budget zones` per-zone cost instead (section 6).                                                                  | `readiness/budget-*.json`                                 |
| Pipelines       | All 10 needed types accepted one URL and returned records: `reddit_posts`, `youtube_videos`, `youtube_comments`, `tiktok_posts`, `tiktok_comments`, `x_posts`, `instagram_posts`, `facebook_posts`, `crunchbase_company`, `github_repository_file`.                 | `pipeline/p01…p10-*.json`, section 5                      |

## 5. Pilot Run

Run on 2026-10-02 from 21:34 to 21:52 UTC with max-parallel 1 and a $5
ceiling. Plans: `scripts/config/pilot-plan-1-searches.json`,
`pilot-plan-2-fetches.json`, `pilot-plan-3-pipelines.json` (p05–p10 were re-run
from `pilot-plan-3b-pipelines-resume.json` after the first pipeline batch was
cut short when the Script builder's session hit its time limit; p01–p04 ran
once and are not duplicated). All searches were taken word for word from the
frozen query list.

### 5.1 Results by request type

| Type                      | Runs | OK  | Success | Records    | Median time | Range      | Failures                                                     |
| ------------------------- | ---- | --- | ------- | ---------- | ----------- | ---------- | ------------------------------------------------------------ |
| Search (SERP)             | 10   | 10  | 100%    | 99 results | 5.2 s       | 2.4–9.9 s  | none                                                         |
| Page fetch (Web Unlocker) | 5    | 3   | 60%     | 3 pages    | 7.7 s       | 2.1–17.6 s | 2 × `blocked` (Bright Data refused YouTube and Reddit pages) |
| Pipelines                 | 10   | 10  | 100%    | 19 records | 58 s        | 10–296 s   | none                                                         |

Pipeline detail: reddit_posts 78 s; youtube_videos 59 s; youtube_comments
10 s (9 comments); tiktok_posts 296 s; tiktok_comments 295 s (2 comments);
x_posts 11 s; instagram_posts 13 s; facebook_posts 58 s; crunchbase_company
22 s; github_repository_file 11 s. The TikTok runs came close to the 300 s
timeout, so Phase 2 uses `--timeout 600` for TikTok.

### 5.2 Measured cost

| Type       | Measured                                              | Per request                                          | Method                                |
| ---------- | ----------------------------------------------------- | ---------------------------------------------------- | ------------------------------------- |
| Search     | $0.03 for 10 (`cli_serp` zone cost)                   | ≈ $0.003                                             | `budget zones` before/after           |
| Page fetch | $0.01 for 5 (`cli_unlocker` zone cost)                | ≈ $0.002                                             | `budget zones` before/after           |
| Pipelines  | not readable (not billed to a zone; balance shows $0) | estimate $0.005/record, $0.25 reserve per failed run | conservative estimate, logged as such |

Pilot total: **$0.04 measured + $0.095 estimated = $0.135**, booked in
`data/spend-ledger.json`. Zone costs are shown in whole cents, so per-request
figures are rounded estimates.

### 5.3 Findings that change Phase 2

1. **Web Unlocker cannot fetch YouTube or Reddit pages.** Use the
   `youtube_*` and `reddit_posts` pipelines for those platforms. This fixes the
   reference study's failure on video and social pages.
2. **Some `site:` queries return nothing from the target site.** The gbatemp
   query (s08) returned 6 unrelated pages (government election sites, a
   dictionary). Phase 2 drops any result whose host does not match the query's
   `site:` host before counting signals, and records empty-site queries as
   coverage gaps. Disconfirmation queries (no `site:`) correctly returned
   open-web sources (academic papers, gaming news).
3. **Signal counts in the pilot are thin** (99 results; e.g. `decomp` 12,
   `revival` 9, `port` 8, `rust` 0, `discord` 0). They prove the scripts run,
   not anything about the hypotheses. No verdicts use pilot data.
4. Request counts for pipelines are mostly status polls (up to 272 per run),
   not billed units. The run log documents this (section 7).

## 6. Spend And Concurrency Caps

Approved by the owner on 2026-10-02, after the pilot, with measured costs shown.

| Item                 | Approved value               |
| -------------------- | ---------------------------- |
| Total study cap      | **$5.00** (free credit only) |
| Phase 1 (spent)      | $0.15 allocated, $0.135 used |
| Phase 2              | 40% of the cap → **$1.94**   |
| Phases 3–8 (shared)  | 50% → **$2.43**              |
| Phases 9–11 (shared) | 10% → **$0.48**              |
| Parallel Collectors  | **2** at once                |

Enforcement: `data/spend-ledger.json` (managed by
`scripts/lib/spend-ledger.mjs`) holds the caps. Before a batch spends anything,
it reserves its ceiling under a file lock against both the study total (live
zone cost since the baseline + pipeline estimates + open reservations) and its
phase group. It settles the measured spend afterwards. Two parallel Collectors
cannot both claim the same budget (tested). If a batch crashes, its reservation
stays held (fails closed). Each batch is also clamped to $5 and stops before
an item whose reserved cost would pass its ceiling.

**Phase 2 estimate at pilot prices:** the full 1,136-query matrix ≈ $3.40 in
searches alone, which is more than the $1.94 allocation. Phase 2 must therefore
run a **stratified subset** of about 400 matrix queries (every platform × theme
pair with at least one intent, ≈ $1.20), plus all 36 disconfirmation queries
(≈ $0.11). That leaves about $0.60 for page fetches and pipeline deep samples
(≈ 100 pipeline records + ≈ 50 page fetches). The subset rule is chosen and
logged in section 10 before Phase 2 collection starts.

## 7. Scripts

All scripts live in `scripts/`, are plain Node ESM with no dependencies, and are
run from `market-research/modding-and-ports/`. Tests:
`node --test "scripts/**/*.test.mjs"` → **96 pass, 0 fail** (2026-10-02). Note: on
Node 22.20 the bare folder form (`node --test scripts`) does not run the tests;
use the glob. Formatting: `bunx prettier --check market-research/modding-and-ports`
and the repo-wide `bun run format:check` both pass.

| Script                 | What it does                                                                                                                                                                                                                                        | Rerun                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `bd-key.ps1`           | Reads the key from Credential Manager; writes only the key to stdout; generic errors, exit 2 missing / 3 malformed                                                                                                                                  | called by `lib/secret.mjs`                                                                                                                   |
| `lib/secret.mjs`       | `loadApiKey()` (spawns PowerShell, no shell), `redact()`, `containsSecret()`                                                                                                                                                                        | —                                                                                                                                            |
| `lib/run-log.mjs`      | Append-only JSONL run log; validates fields; refuses any line that contains the key                                                                                                                                                                 | —                                                                                                                                            |
| `lib/spend-ledger.mjs` | Study-wide spend ledger with locked reservations per phase group                                                                                                                                                                                    | —                                                                                                                                            |
| `lib/paths.mjs`        | Safe phase/id names and raw/derived paths                                                                                                                                                                                                           | —                                                                                                                                            |
| `bd-run.mjs`           | Runner: `readiness`, `search`, `scrape`, `pipeline`, `budget`, `batch <plan.json>`; version gate 0.3.7; verb allow-list (refuses `login`, `logout`, `discover`, `config`, `init`, `--api-key`); key only in child env; output redacted; spend guard | `node scripts/bd-run.mjs batch <plan> --phase <id> --spend-ceiling <usd> --serp-zone cli_serp --unlocker-zone cli_unlocker --max-parallel 1` |
| `bd-zones.mjs`         | Creates `cli_unlocker` / `cli_serp` if missing (free); strips zone proxy passwords from responses                                                                                                                                                   | `node scripts/bd-zones.mjs ensure`                                                                                                           |
| `build-queries.mjs`    | Expands the frozen matrix into `config/query-list.json` (1,136 queries, hash in section 2.5)                                                                                                                                                        | `node scripts/build-queries.mjs`                                                                                                             |
| `dedupe.mjs`           | SERP raw → `data/derived/<phase>/source-index.csv` (URL-hash ids, platform, query ids, anonymised path)                                                                                                                                             | `node scripts/dedupe.mjs --phase <id>`                                                                                                       |
| `signal-count.mjs`     | Frozen keyword groups → `data/derived/<phase>/signal-counts.csv` by platform, theme, intent                                                                                                                                                         | `node scripts/signal-count.mjs --phase <id>`                                                                                                 |

Run-log fields per CLI call: `id`, `phase`, `kind`, `input`, `args`, `startedAt`,
`endedAt`, `durationMs`, `status` (`ok`, `empty`, `http_error`, `timeout`,
`blocked`, `cli_error`), `exitCode`, `recordCount`, `requestCount`, `outputPath`,
`errorClass`, `balanceBefore`, `balanceAfter`, `spendBefore`. `requestCount` is
the HTTP calls seen, including pipeline status polls; it is not a billing unit.

## 8. Data Handling

The rules in `ROADMAP.md` section 1.2 are implemented and checked:

- **Raw output is git-ignored:** `data/raw/` is ignored (`data/.gitignore` and the
  repo `.gitignore`); confirmed with `git check-ignore`.
- **Derived tables are anonymised:** `source-index.csv` replaces handle-bearing
  path parts with `[handle]` (32 rows in the pilot: x.com and TikTok
  creators). Full URLs stay only in raw. `signal-counts.csv` holds counts only.
- **No secrets in data:** a scan that loads the key in memory found it in **0**
  files under `data/` and `scripts/`. Zone proxy passwords are stored as
  `[redacted]`.
- **Public pages only:** pilot inputs were public posts, project pages and
  company pages. No logins, no private groups, and no Discord servers were
  joined.
- **Minors:** pipeline output can contain usernames. It stays in raw; analysed
  outputs never quote handles.

## 9. Verifier Report

A fresh `owl` Verifier audited key safety, log completeness and protocol
conformance on 2026-10-02, after the pilot. It ran read-only and called no
paid commands.

| Area                 | Verdict | Notes                                                                                                                                                                                                   |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key safety           | Pass    | Key only in child env; `BRIGHTDATA_*` vars dropped; forbidden verbs refused; output redacted; log writer refuses the key; zone passwords redacted; no `Bearer` tokens in data; no CLI credential folder |
| Log completeness     | Pass    | 25 pilot items (s01–s10, f01–f05, p01–p10) each logged once, all fields present, every `outputPath` exists                                                                                              |
| Protocol conformance | Pass    | Pilot queries are verbatim members of the frozen list; 1,136 queries with matching SHA-256; matrix and signal groups match sections 2–3; H1–H12 criteria are symmetric; derived tables anonymised       |
| Spend guard          | Pass    | Hard $5 clamp, reserve before each item, fail-closed on unreadable cost                                                                                                                                 |

Issues raised and how they were fixed:

1. _`requestCount` meaning is ambiguous for pipelines_ → documented in
   `lib/run-log.mjs` and section 7 as HTTP calls including polls, not a
   billing unit.
2. _Lead review, same pass:_ each batch's spend meter started from zero, so
   two batches (or two parallel Collectors) could each spend up to the cap →
   added the study-wide ledger with locked reservations (section 6) and 11
   tests, including parallel reservations that never exceed the cap.
3. _Lead review, earlier:_ zone-creation responses contain proxy passwords →
   `bd-zones.mjs` strips them before printing or writing, and the one saved
   file was cleaned. One password was shown once in the Lead's console before
   the fix; it belongs to the `cli_unlocker` zone only, not the API key.
4. _Lead review, final checks:_ Prettier does not read the nested
   `data/.gitignore`, so the repo-wide format check failed on 75 raw files →
   added `market-research/modding-and-ports/data/raw` to the root
   `.prettierignore`. The machine-written ledger now uses Prettier's layout,
   checked by a test.

## 10. Change Log

| Date       | Change                                                                                                                                        | Reason                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 2026-10-02 | Criteria, matrix and signal groups registered (sections 1–3)                                                                                  | Pre-registration before any collection                                            |
| 2026-10-02 | Spend meter changed from account balance to `budget zones` cost + pipeline estimates                                                          | The balance field shows $0 with free credit; the first key also got 403           |
| 2026-10-02 | Added `scripts/bd-zones.mjs` (free zone creation)                                                                                             | The CLI can only create zones through `login`, which writes a plaintext key file  |
| 2026-10-02 | Added study-wide spend ledger and phase caps                                                                                                  | Owner approved a $5 cap, a 40/50/10 split and 2 parallel Collectors               |
| 2026-10-02 | Phase 2 rules: filter off-site `site:` results; YouTube/Reddit through pipelines only; TikTok timeout 600 s; stratified subset to fit $1.94   | Pilot findings, section 5.3 and section 6                                         |
| 2026-10-02 | Phase 2 subset rule registered before collection (see below)                                                                                  | Owner chose "Run the planned subset"; the full matrix (≈ $3.40) exceeds $1.94     |
| 2026-10-03 | Phase 3 addendum: $0.70 allocation, age buckets, H1 source eligibility, minors rule, frozen query list, sampling rule (see below)             | Pre-registration before any Phase 3 request; Phase 2 found no H1 survey           |
| 2026-10-03 | Phase 3 allocation raised from $0.70 to $1.00 (addendum item 1)                                                                               | Owner decision: $0.25 pipeline reserve plus uncapped TikTok comments exceed $0.70 |
| 2026-10-03 | Phase 4 addendum: $1.00 allocation, competitor rule, snapshot slots, frozen queries, sampling, coding, matrix cell rule (see below)           | Pre-registration before any Phase 4 request; owner budget decisions 2026-10-03    |
| 2026-10-03 | Phase 5 addendum: $0.40 allocation, tool list rule, snapshot slots, frozen queries, sampling, coding, friction map and cell rules (see below) | Pre-registration before any Phase 5 request; owner approved $0.40 on 2026-10-03   |
| 2026-10-03 | Study cap $5.00 → $5.38; `phases-03-08` cap $2.43 → $2.81 (ledger `note` and caps only; settled entries unchanged)                            | Owner decision: let Phase 6 finish comfortably ($0.75); phases 7–8 set later      |
| 2026-10-03 | Phase 6 addendum: $0.75 allocation, definitions, inventory fields, project list rule, frozen queries, sampling, coding (see below)            | Pre-registration before any Phase 6 request                                       |
| 2026-10-03 | Phase 7 addendum: $0.22 allocation (no cap change), definitions, policy list rule, frozen queries, scrape quotas, coding, H7 and risk rules   | Pre-registration before any Phase 7 request                                       |
| 2026-10-03 | Study cap $5.38 → $5.50; `phases-03-08` $2.81 → $2.93; Phase 7 allowance $0.22 → $0.34 (mid-phase, before any coding)                         | Owner pre-approved small bumps; zone billing ran ahead and 48 scrapes were unrun  |
| 2026-10-03 | Study cap $5.50 → $5.54; `phases-03-08` $2.93 → $2.97; Phase 7 allowance $0.34 → $0.38 (after coding)                                         | Owner pre-approved small bumps; pays for the Disconfirmer’s 4 extra queries       |
| 2026-10-03 | Study cap $5.54 → $6.04; `phases-03-08` $2.97 → $3.47; Phase 8 allowance $0.60                                                                | Owner decision before Phase 8                                                     |
| 2026-10-03 | Phase 8 addendum: $0.60 allocation, definitions, corpus test, frozen queries, directory list rule, sampling, coding, H12 rules (see below)    | Pre-registration before any Phase 8 request                                       |
| 2026-10-04 | Phase 9 addendum: $0.20 allowance (no cap change), segments S1–S4 and exclusions, model formulas, quality grades, frozen inputs (see below)   | Pre-registration before any Phase 9 request                                       |
| 2026-10-04 | Study cap $6.04 → $6.19; `phases-09-11` $0.48 → $0.63; Phase 10 allowance $0.24 (ledger `note` and caps only; settled entries unchanged)      | Owner decision: with $0.27 left, the $0.25 pipeline hold allowed only one batch   |
| 2026-10-04 | Phase 10 addendum: $0.24 allowance, persona rules, voice rules, pooled H10/H11 rule, play-vs-create rule, positioning tests (see below)       | Pre-registration before any Phase 10 request                                      |

**Phase 2 subset rule (pre-registered 2026-10-02, before any Phase 2
request).** The 220 platform × theme pairs are taken in the order they appear
in `config/query-list.json`. Pair `i` (0-based) gets primary intent
`intents[i mod 5]` (Wave A, 220 queries) and secondary intent
`intents[(i+2) mod 5]` (Wave B, 220 queries), so each intent appears 44 times
per wave. The rule never looks at hypotheses or results, and every query string
is copied verbatim from the frozen list. Run order: Wave A plus all 36
disconfirmation queries; then the deep sample; then Wave B only while the
Phase 2 allocation has more than $0.05 left. Wave B's fixed run order is the
SHA-256 of the query id (`config/phase2-wave-b-all.json`), so a budget cut-off
is spread across platforms and themes. Wave B queries that are not run are
listed as unrun. Plans are generated by `scripts/build-subset.mjs`. Collectors
run one batch at a time: parallel search batches share one SERP zone, so each
would book the other's cost to the Phase 2 allocation (section 6).

**Phase 2 run notes (logged during collection, 2026-10-02/03).**

- Each collector group got one retry of its non-ok Wave A and
  disconfirmation items (`plans/c1..c4-retry.json`); retries are separate
  attempts in the run log, and the final attempt counts.
- Two runs outlived their collector agent's 10-minute limit. `deep-tiktok`
  finished all 5 items, but its runner exited before settling; the lead
  settled it with the runner's own method ($0 zone change + 5 records ×
  $0.005). `wave-b-part2` was terminated with its agent after 27 of 110
  items; the lead settled it from the logged zone-cost reads ($1.13 → $1.18,
  plus $0.01 fail-closed for a possible in-flight request). Both ledger
  entries carry a note.
- The remaining 83 Wave B queries (`plans/wave-b-part3.json`, same fixed
  order) were run by the lead as a background task, not through an agent,
  so the runner could not be killed mid-batch again.
- `check-derived.mjs` exempts an author value only when it exactly equals a
  pre-registered dictionary term (one case: a hub's official account name);
  the exemption is printed on every run. The Phase 2 done-criterion "runs the full frozen
  matrix" is met as an **owner-approved exception** under this rule.

**Phase 3 pre-registration addendum (2026-10-03, before any Phase 3
request).** The H1–H6 rows in section 1.3 are unchanged. These rules only
clarify how they are applied in Phase 3:

1. **Allocation:** Phase 3 may use at most **$0.70** of the `phases-03-08`
   group ($2.43), leaving $1.73 for phases 4–8. Expected spend is about $0.55.
   Each batch's `--spend-ceiling` is capped by what is left of the $0.70, and
   the lead keeps a running total in `03` section 11. **Changed 2026-10-03
   (owner decision, after $0.13 spent and before any pipeline run):** raised to
   **$1.00**, leaving $1.43 for phases 4–8. Reason: the runner reserves $0.25
   before each pipeline item and TikTok comment counts cannot be capped, so
   the planned quotas could not fit $0.70. Quotas are unchanged; TikTok stops
   early if the $1.00 runs out.
2. **Record unit:** one page, post, video or comment set is one coded record
   (section 1.1). Self-stated ages are counted per distinct commenter inside a
   record, and only bucket counts are stored: ≤14, 15–17, 18–21, 22–29, 30+,
   and "unclear".
3. **H1 source eligibility:** a source counts toward the H1 test only if its
   population is modders, mod users, fan-game makers or port players. Surveys
   of general gamers or general creators (e.g. ESA, Roblox, Scratch) are rated
   "adjacent population": they are reported as context and **cannot** meet the
   H1 test. Two sources are independent only if they have different publishers
   and different samples. Self-stated ages stay colour only (≥ 30 needed), as
   section 1.3 already says.
4. **Phase 2 reuse:** Phase 2 deep-sample records may be re-coded fresh by the
   Phase 3 Analysts and counted once, cited by their Phase 2 record ids.
5. **Minors rule:** if a record's author states an age under 18, the record is
   paraphrased only, never quoted. No handles, profile links or usernames
   appear in derived files or the `.md`.
6. **Frozen query list:** `scripts/config/phase3-queries.json` (ids `a3-s*`
   for surveys and statistics, `a3-c*` for community posts). Queries are
   balanced in both directions (beginner vs programmer, own game vs mod,
   play-only vs create).
7. **Sampling rule (hypothesis-blind, as in Phase 2):** keep only on-site
   results of `site:` queries. Per platform, order candidates by `recordId`
   (URL hash) and pick round-robin across queries, at most 3 per query; titles
   and snippets are never read. Quotas: `reddit_posts` 30;
   `youtube_comments` 5 videos × 12 comments; `tiktok_comments` 3 videos
   (`--timeout 600`). Survey pages to `scrape` (≤ 15) are the one
   content-based pick: Analyst A1 picks them from titles and snippets under a
   written rule (the result names a survey, census, poll, report or official
   statistic containing age or skill data), and every pick and reject is
   logged. Generated by `scripts/sample-audience.mjs`.

**Phase 4 pre-registration addendum (2026-10-03, before any Phase 4
request).** The H3, H10 and H11 rows in section 1.3 and the verdict rules in
section 1.2 are unchanged. These rules only say how they apply in Phase 4:

1. **Allocation:** Phase 4 may use at most **$1.00** of the `phases-03-08`
   group by ledger estimate ($1.47 left before Phase 4), leaving at least
   $0.47 for phases 5–8. Expected spend is about $0.86: official scrapes
   ≈ $0.10 (with up to two retry rounds), searches ≈ $0.16 (8 lookups + 56
   sentiment), forum scrapes ≈ $0.01, 48 `reddit_posts` ≈ $0.24 (estimate)
   and `youtube_comments` 6 videos × 12 comments ≈ $0.36 (upper bound, the
   ledger's per-record estimate). Each batch's `--spend-ceiling` (which must
   include the runner's $0.25 hold before a pipeline item) is capped by what
   is left of the $1.00; the lead keeps a running total in `04` section 12.
   Reason: owner feedback 2026-10-03 — the Bright Data dashboard shows under
   $1 spent and about $4.20 credit left, and the budget may be raised if
   needed. **Changed 2026-10-03, before any Phase 4 request (owner
   decision):** the plan's first figure ($0.70, "expected ≈ $0.55") was
   mis-added — its own line items sum to ≈ $0.86, and the $0.25 hold left
   room for only about 30 Reddit posts and 2 videos — so the allocation was
   raised to $1.00 to run the full planned sample.
   - **Reconciliation (free, before collection, 2026-10-03 05:21 UTC):** live
     `budget zones` TOTAL **$1.58** (SERP $1.43, Unlocker $0.16); ledger
     estimated study spend **$2.79** (zone $1.58 + settled pipeline
     estimates $1.21, 0 open reservations); owner's dashboard **under $1
     spent, ≈ $4.20 left**. The ledger counts pipelines at $0.005 per record
     and failed pipeline runs at their full reserve, so it errs high.
   - **No change** to the $5 study cap, the group caps or the runner's
     pipeline estimate in Phase 4. The ledger is never hand-edited. If phases
     5–8 later run short, the lead proposes a logged rebalance or cap raise,
     backed by the dashboard figure, as a separate owner decision.
2. **Competitor list rule:** a hub is in if (a) it hosts or distributes mods
   or fan games for download **and** (b) it has ≥ 5 Phase 2 mention records
   (`data/derived/02-public-web/mention-counts.csv`) or it is in the starting
   list. The starting eight all pass (Thunderstore 65, Nexus Mods 43,
   CurseForge 41, itch.io 29, GameBanana 11, Steam Workshop 9, mod.io 8,
   ModDB 7). Vortex and r2modman are covered as the install tools of Nexus
   Mods and Thunderstore, not as separate competitors. A hub named as a
   switching destination in ≥ 3 coded records is added (snapshot-only if
   budget allows); every addition and exclusion is logged with its reason.
3. **Official snapshot list (frozen):** `scripts/config/phase4-official-pages.json`
   — per competitor, one URL per slot: `home`, `premium` (pricing),
   `creator-rewards`, `terms`, `content-policy` (incl. takedown/DMCA),
   `beginner` (getting started, install help or creation docs) and
   `mod-manager`. Slots with no known URL (`null`) are covered by **one**
   logged `site:` lookup search per competitor (`a4-l*`, its missing slots'
   keywords joined by OR, 8 searches instead of 38). Collector C1 picks, per
   slot, the first on-site result whose URL or title names that slot's page
   type, and logs every pick and every slot left empty. A slot still empty is
   recorded as "no page found" (matrix cell Unknown unless an official page
   says it is not offered). At most 8 × 7 = 56 scrapes, up to two retry
   rounds per blocked page. Age rules are read from the terms page.
4. **Frozen queries:** `scripts/config/phase4-queries.json` — `a4-l*`
   lookups (8, item 3), `a4-c*` Reddit (per competitor: praise, complaint, switching, beginner;
   8 × 4 = 32), `a4-y*` YouTube (per competitor: review, how to install mods;
   8 × 2 = 16) and `a4-d*` disconfirmation (open web, neutral: incumbents
   serving beginners, players and ports well; 8). Up to 6 Disconfirmer
   additions (`a4-x*`) are appended to the file before they run.
5. **Sampling rule (hypothesis-blind, as in Phases 2–3):** on-site results
   only, ordered by `recordId` (URL hash), round-robin across queries;
   titles and snippets are never read. Reddit (`a4-c*`): at most 2 per query,
   quota **48**, chunks of 4. YouTube (`a4-y*`): at most 1 per query, quota
   **6 videos × 12 comments**. Open-web forum threads (`a4-d*` results not on
   Reddit or YouTube, thread-shaped URLs only): at most **8** scrapes, picked
   by URL hash only. Generated by `scripts/sample-competitors.mjs`.
6. **Record unit and coding:** one official page is a source type (c)
   record; one Reddit post set, YouTube comment set or forum thread is a
   source type (b) record; search snippets are visibility only and are never
   coded alone. Phase 2/3 records about hubs may be re-coded fresh and counted
   once, cited by their ids. Sentiment fields: competitor; theme (install,
   discovery, creator pay, policy/moderation, beginner help, ports/fan games,
   other); valence (praise / complaint / neutral); switching (from → to,
   reason); segment (play / create / both / unclear); H3, H10 and H11 stance.
   Commenter-level counts as in Phase 3. Minors rule and no-handles rule as
   in the Phase 3 addendum item 5.
7. **Feature-matrix cell rule:** Yes = an official page states it; Partial =
   limited scope (some games only, paid only, beta); Planned = official
   roadmap or announcement; No = the relevant official page exists and does
   not offer it, or states it is not offered; otherwise **Unknown** (allowed,
   counted, not hidden). Every cell cites a stored page id.
8. **H11 application:** an incumbent "covers" a need only when an official
   page offers it **and** user records about it are not mostly complaints. A
   "gap" needs both no coverage and user records stating the need.

**Phase 5 pre-registration addendum (2026-10-03, before any Phase 5
request).** The H2, H5, H6 and H10 rows in section 1.3 and the verdict rules
in section 1.2 are unchanged. Phase 5 tests them from the creator side. These
rules only say how they apply in Phase 5:

1. **Allocation:** Phase 5 may use at most **$0.40** of the `phases-03-08`
   group by ledger estimate (≈ $0.73 left for phases 5–8; owner approval
   2026-10-03). Expected ≈ $0.36: tool scrapes ≈ $0.05 (with retries),
   ≈ 50 searches ≈ $0.13, 30 `reddit_posts` ≈ $0.15 (ledger estimate), 10
   `youtube_videos` ≈ $0.05, ≤ 6 forum scrapes ≈ $0.01. Each batch's
   `--spend-ceiling` includes the runner's $0.25 hold before a pipeline item
   and is capped by what is left of the $0.40. The lead keeps a running total
   in `05` section 9. The ledger is never hand-edited. Waves not run because
   of the cap are listed as unrun.
2. **Tool list rule (frozen in `scripts/config/phase5-tools.json`):** a tool
   is in if it is used to make mods or games **and** it is in the starting
   list or named in ≥ 3 coded Phase 2–4 records. Starting list (14 + up to
   2 AI tools): engines Unity, Unreal Engine, Godot, GameMaker; no/low-code
   makers RPG Maker, GDevelop, Construct, Roblox Studio; modding kits and
   loaders Bethesda Creation Kit, BepInEx, MelonLoader, Minecraft
   Fabric/Forge (one entry), tModLoader, Blockbench. The mention count found
   no other tool in ≥ 3 coded records (Minecraft modding 4, covered by
   Fabric/Forge; Roblox 2; others ≤ 1). Mod managers are Phase 4's and are
   cited, not re-scraped. Up to two **AI-assisted** tools come from one
   open-web discovery search (`a5-l15`): the first two results, by rank,
   that are a product's own site (not an article, list, store, video, forum
   or social page), each pick logged; each gets one `site:` lookup
   (`a5-l16`, `a5-l17`) appended before it runs. Every addition and
   exclusion is logged in the config with its reason.
3. **Snapshot slots:** per tool, `docs` (official getting-started or first
   mod / first game tutorial) and `pricing` (pricing, licence or EULA covering
   cost and output rights). Each tool has **one** logged `site:` lookup
   (`a5-l01`–`a5-l14`); Collector C1 picks, per slot, the first on-site
   result whose URL or title names that slot's page type (for GitHub-hosted
   tools, only URLs under the tool's own repository path). The pick fills a
   `null` slot, or replaces a config URL whose page is not found or still
   blocked after two retry rounds. Every pick and empty slot is logged; an
   empty slot is recorded as "no page found". At most 32 scrapes plus up to
   two retry rounds.
4. **Frozen queries (`scripts/config/phase5-queries.json`):** `a5-l*`
   lookups (item 3, 15 + 2); `a5-c*` Reddit learner queries (16), balanced by
   direction — help-seeking ("where do I start", "gave up", "too hard",
   "tutorial outdated") against showcase ("easier than I thought",
   "finished my first mod/game", "easy to learn", "really helped") plus
   neutral; `a5-y*` YouTube (8: beginner tutorials, first mod / first game,
   beginner mistakes, why I quit, no-experience showcases); `a5-d*` open-web
   disconfirmation (8: tools already easy for beginners). Up to 6 Disconfirmer
   additions (`a5-x*`) are appended to the file before they run. Search
   batches never run in parallel (section 6: a shared SERP zone books cost to
   the wrong batch).
5. **Sampling rule (hypothesis-blind, as in Phases 2–4):** on-site results
   only, ordered by `recordId` (URL hash), round-robin across queries; titles
   and snippets are never read. Reddit (`a5-c*`): at most 2 per query, quota
   **30**, chunks of 4. YouTube (`a5-y*`): at most 1 per query, quota **10**
   `youtube_videos` (description and transcript, no comments). Open-web forum
   threads (`a5-d*` results not on Reddit or YouTube, thread-shaped URLs
   only): at most **6** scrapes. Generated by `scripts/sample-creator.mjs`.
6. **Record unit and coding:** an official tool page is a source type (c)
   record (a GitHub repository page is type (d)); a Reddit post set, a
   YouTube video (description and transcript) or a forum thread is type (b).
   Snippets are never coded alone. Phase 3/4 creator-side records may be
   re-coded fresh, counted once, cited by their ids. Fields: tool(s) named;
   journey stage (idea, pick tool, setup/install, learn basics, first build,
   debug, share/ship, quit); friction type (setup, tool complexity, coding,
   docs gaps, assets/art, scope, motivation, community access, licensing,
   cost, platform); severity (blocker / slows / minor); removed by an
   existing tool (yes + tool / partial / no / unknown); skill (none / some /
   programmer / unclear); goal (original game / mod existing / both /
   unclear); H2, H5, H6 and H10 stance. Minors rule and no-handles rule as in
   the Phase 3 addendum item 5. Results are also split by query direction
   (help-seeking vs showcase), as in Phase 3.
7. **Friction map rule:** frequency = share of on-topic learner records
   naming the friction; severity = modal severity; "a tool removes it" = Yes
   only when an official page offers the fix **and** learner records about
   that tool are not mostly complaints about the same friction; Partial when
   the fix is limited (some tools, paid only, some games); No when records
   show it unsolved; otherwise Unknown.
8. **Tool snapshot cells:** Yes / Partial / No / Unknown as in the Phase 4
   addendum item 7; every cell cites a stored page id. Skill level is quoted
   from the official page when stated, else rated by the Analyst and marked
   as such.

**Phase 6 pre-registration addendum (2026-10-03, before any Phase 6
request).** The H8 and H9 rows in section 1.3 and the verdict rules in
section 1.2 are unchanged. "Rust" means the programming language, never the
survival game. These rules only say how they apply in Phase 6:

1. **Budget:** owner decision 2026-10-03 — study cap $5.00 → **$5.38**,
   `phases-03-08` cap $2.43 → **$2.81**, so Phase 6 may use at most
   **$0.75** by ledger estimate (spent before Phase 6: $2.06). Phases 7–8
   get no pre-allocation; the owner sets them when they start. Only the caps
   and `note` in `data/spend-ledger.json` changed; settled entries were not
   touched. The $0.75 is $0.50 of spend lines plus the runner's $0.25 hold
   before each pipeline item (a hold is reserved, not spent). Spend lines
   (ledger estimate): C1 searches $0.03, C2 searches $0.02, lead community
   searches $0.03, Disconfirmer searches and scrapes $0.02, C1 scrapes
   $0.04, C2 scrapes $0.03, C1 `github_repository_file` $0.08, C2
   `github_repository_file` $0.05, `reddit_posts` $0.15, `youtube_videos`
   $0.04, forum scrapes $0.01 — total **$0.50**. Retries are paid from
   unspent lines only. Each batch's `--spend-ceiling` = its line + its hold
   ($0.25 for a pipeline batch, $0.02 otherwise), never more than $0.75
   minus Phase 6 ledger spend so far. No batch starts once Phase 6 spend
   plus the next item's reserve would pass $0.75; work not run is listed as
   unrun.
2. **One spender at a time:** search, scrape and pipeline batches share the
   SERP and Web Unlocker zones, and overlapping batches book each other's
   cost (section 6). Collectors work in parallel but every `bd-run.mjs`
   call that can spend holds the lock directory
   `data/raw/06-ports-rust/.spend-lock` (created with `mkdir`, removed after
   the call). Max 2 parallel Collectors.
3. **Definitions (fixed before counting):**
   - **Port:** a game made to run natively on PC from another platform, by
     any method below.
   - **Decomp:** source code reconstructed from a binary that recompiles to
     a matching binary (e.g. zeldaret/oot). A decomp that only rebuilds the
     original platform's binary is a decomp, not a port, until a native PC
     build exists.
   - **Static recompilation:** binary machine code translated ahead of time
     into native code (e.g. N64Recomp).
   - **Source port:** a native port built on released or reconstructed
     source, often with engine changes (e.g. Ship of Harkinian,
     DevilutionX).
   - **Remake:** new code reproducing a game's behaviour without its original
     code (e.g. OpenMW, OpenRCT2).
   - **Rust rebuild:** any of the above whose main implementation language
     is Rust, checked on the repository (language bar or `Cargo.toml` at the
     root), never from a title alone. Emulators, engines, original games and
     game servers are not rebuilds; they are logged as boundary cases.
   - Official commercial re-releases are excluded from the fan inventory and
     logged as boundary cases.
4. **Inventory fields:** project, source game, original platform, method
   (item 3), status (released / in progress / stalled / taken down /
   unclear), last activity (latest release or commit date seen on a public
   page, with the page id), **requires user-supplied original game files**
   (yes / no / unclear, quoted from the project's own page when stated),
   tier (`checked` = the project's own page or README was read; `listed` =
   known only from a curated list, other fields as the list states them,
   else "unclear"), and source record ids. Metadata only: no game files,
   ROMs, binaries or release assets are downloaded. The GitHub pipeline
   reads README / `Cargo.toml` text files only.
5. **Project list rule (`scripts/config/phase6-sources.json`):** port
   projects to check are the 19 `port-project` terms of the frozen mention
   dictionary, mapped to their public repositories (an official commercial
   release and a taken-down repository are logged, not fetched). Curated
   lists to scrape are the six list pages `x-add-3` returned in Phase 2 (the
   Reddit list thread goes through `reddit_posts`). Every project on a
   scraped list enters the inventory as `listed`. Rust candidates come from
   C2's `p6-r*` / `p6-n05`–`p6-n06` results in query-id order, then rank;
   the first **10** distinct game rebuilds (item 3) are appended to the
   config with a logged reason before they are fetched. Inventory breadth
   tests use all rows; activity tests use `checked` rows only.
6. **Frozen queries (`scripts/config/phase6-queries.json`):** `p6-i*` port
   inventory, open web (12); `p6-r*` Rust inventory, open web (8); `p6-n*`
   news (`--search-type news`; n01–n04 ports for C1, n05–n06 Rust for C2);
   `p6-c*` Reddit (14) and `p6-y*` YouTube (8), balanced by direction —
   help-seeking (install help, "not working", "is there a PC port") against
   showcase ("runs great", "finally playable") plus neutral, with 4 Reddit
   and 2 YouTube queries about Rust rebuilds; `p6-d*` open-web
   disconfirmation (6: emulation is enough, ports only for a few titles,
   takedowns, Rust rewrite hype). Up to 6 Disconfirmer additions (`p6-x*`)
   are appended before they run. Search batches never run in parallel.
7. **Scrape and fetch quotas:** curated lists 6; port project pages ≤ 8
   (projects whose status, activity or own-files answer is not in their
   README); Rust repository pages ≤ 10 (language check); news articles ≤ 6
   (first result per `p6-n*` query on a news site, C1 ≤ 4, C2 ≤ 2);
   `github_repository_file` **25** (port READMEs ≤ 15, Rust READMEs ≤ 10;
   `Cargo.toml` replaces a Rust README only when the language bar was not
   captured). One retry round for blocked items.
8. **Sampling rule (hypothesis-blind, as in Phases 2–5):** on-site results
   only, ordered by `recordId`, round-robin across queries; titles and
   snippets are never read. Reddit (`p6-c*`): ≤ 2 per query, quota **28**,
   chunks of 7. YouTube (`p6-y*`): ≤ 1 per query, quota **8**
   `youtube_videos` (description and transcript, no comments), chunks of 4.
   Forum threads (`p6-d*` results not on Reddit or YouTube, thread-shaped
   URLs): ≤ 2 per query, quota **6**. Disconfirmer extra sample: ≤ 1 per
   `p6-x*` query, quota **4**, sampled separately so the frozen sample is
   unchanged. Generated by `scripts/sample-ports.mjs`.
9. **Coding.** Record unit and source types as in section 1.1 (README and
   repository = (d); project page and curated list = (c); Reddit, YouTube,
   forum = (b); news article = (e)). Snippets are never coded alone.
   - **A1 (H8)** codes every sampled and inventory record: projects and
     source games named, original platform, side (player / developer /
     both / unclear), demand type (request for a port, use or praise,
     install help, news, critique, prefers emulation, other), served
     (fully / partly / unmet / unclear), H8 stance, quote. Supports = shows
     players wanting, using or discussing PC ports of a range of games, or
     active releases; contradicts = says ports are unneeded (emulation is
     enough), interest is limited to a few titles, or the need is already
     fully met; neutral otherwise.
   - **A2 (H9)** codes records whose stored text contains "rust"
     (case-insensitive); the lead codes all others off-topic for H9 by this
     rule. A2 marks a record off-topic when "Rust" is the survival game or
     no Rust rebuild (item 3) is named. Fields: rebuild(s) named, venue
     (player / developer), content (playing or installing vs code or
     language), side, platform, H9 stance, quote. **Developer-side venues:**
     GitHub, Hacker News, lobste.rs, Rust users/internals forums, r/rust,
     r/rust_gamedev, r/programming, dev.to, developer blogs, This Week in
     Rust. **Player-side venues:** game, platform and emulation
     communities (game subreddits, r/SteamDeck, r/emulation), gaming
     YouTube, game forums, gaming news. A record is **player-side** only
     when the venue is player-side and its content is mainly about playing
     or installing; otherwise developer-side. Supports = player-side;
     contradicts = developer-side.
   - Minors rule and no-handles rule as in the Phase 3 addendum item 5;
     results are also split by query direction.
10. **H8 application:** support needs (a) ≥ 30 distinct source games with
    a native PC port in the inventory, from ≥ 3 original platforms; (b)
    ≥ 50% of `checked` projects active in the 12 months before 2026-10-03;
    (c) on-topic player records on ≥ 3 platforms; plus the section 1.2
    shares. Contradiction: the top 3 source games make up ≥ 60% of on-topic
    demand records that name a game, **or** ≥ 60% of on-topic demand
    records say existing ports fully meet the need and < 10% request an
    unported game; plus the section 1.2 shares.
11. **H9 application:** on-topic = names a Rust rebuild. Unproven below 10
    on-topic records. Support needs player-side records on ≥ 2 platforms
    and the section 1.2 shares. Contradiction: all or nearly all (≥ 60%)
    on-topic records are developer-side, **or** Rust rebuilds are rare:
    named in < 5% of on-topic port demand records (A1's).

**Phase 7 pre-registration addendum (2026-10-03, before any Phase 7
request).** The H7 row in section 1.3 and section 1.2 are unchanged. This
phase gathers evidence for a qualified lawyer; it is **not legal advice**.

1. **Budget:** Phase 7 may use at most **$0.22** by ledger estimate, from
   the $0.26 left in `phases-03-08` ($2.55 of $2.81 spent). Lead
   decision under the owner's 2026-10-03 instruction to resume and to
   make small budget calls as needed; it leaves about $0.04 in the group,
   so Phase 8 needs an owner budget before it starts. No cap
   changes. No social-platform pipelines run (a pipeline batch needs a
   $0.25 hold that does not fit). Spend lines: searches $0.12, policy
   scrapes $0.03, case and revival scrapes $0.05, retries $0.02. Each
   batch's `--spend-ceiling` = its line + $0.02, never more than $0.22
   minus Phase 7 spend so far. Work that does not fit is listed as unrun.
   **Mid-phase bump (2026-10-03, after searches and 11 scrapes, before any
   coding):** the zone meter charged $0.06 for 11 scrapes (searches billed
   late), leaving 48 planned scrapes unrun at $0.19 spent. Under the
   owner's standing approval of small bumps, the study cap became $5.50,
   `phases-03-08` $2.93, and the Phase 7 allowance **$0.34**. Samples,
   quotas and rules are unchanged. **Second bump (after coding, for the
   Disconfirmer’s 4 extra queries and their scrapes):** study cap $5.54,
   `phases-03-08` $2.97, Phase 7 allowance **$0.38**.
2. **One spender at a time:** every spending `bd-run.mjs` call holds the
   lock directory `data/raw/07-legal/.spend-lock`.
3. **Definitions (fixed before counting):**
   - **Enforcement action:** a cease-and-desist letter, DMCA (or similar)
     takedown notice, lawsuit, or removal by a platform at a rights
     holder's request, aimed at a fan game, fan remake, port or decomp,
     mod, emulator, or a site hosting them.
   - **Dormant IP:** a game franchise whose rights holder released no new
     game, remaster or re-release for at least 10 years before the fan
     project's public release, as stated in a stored record (otherwise
     "unclear"). Dormant IP is usually still owned.
   - **Revival:** a fan-made new game, remake or port of a dormant IP.
     Outcome: **licensed** (rights holder gave permission, published it,
     or hired the team for it), **tolerated** (publicly released at least
     12 months before 2026-10-03 and no enforcement action found in stored
     records), **shut down** (enforcement action ended or removed it), or
     **unclear**.
4. **Policy list rule (`scripts/config/phase7-policies.json`):** named
   fan-content, modding, hosting and child-safety policies, each with its
   owner's official domains. For each policy one frozen lookup query runs;
   the first result on a listed official domain is scraped (snapshot date
   = scrape date). No URL is guessed: if no official result is in the
   results, the policy is logged "not found". Hub terms already captured
   in Phase 4 (`04-mod-hub-competitors.md` policy matrix) are cited, not
   re-collected.
5. **Frozen queries (`scripts/config/phase7-queries.json`):** `p7-e*`
   enforcement history (news and web), `p7-v*` dormant-IP revival demand
   and outcomes (web), `p7-d*` disconfirmation (tolerated or licensed fan
   projects, web), `p7-l*` policy lookups (item 4). Up to 4 Disconfirmer
   additions (`p7-x*`) are appended before they run.
6. **Scrape quotas and selection.** Social sites (Reddit, YouTube, TikTok,
   X, Instagram, Facebook) are never scraped (the unlocker zone was
   blocked there in the Phase 1 pilot). **Logged deviation (2026-10-03,
   after the first sample was generated from URLs only, before any
   scrape):** LinkedIn is added to this list. It is a social platform, and
   this repository keeps LinkedIn scraping off-limits; the sample is
   regenerated with the same rule. Policies: ≤ 1 per policy (item 4).
   **Cases:** the first non-social result of each `p7-e*` query (rank
   order), quota **20**. **Revival and demand:** non-social results of
   `p7-v*`, ordered by `recordId`, round-robin, ≤ 2 per query, quota
   **16** (titles and snippets never read). **Disconfirmation:** first
   non-social result per `p7-d*` query, quota **6**; Disconfirmer extra
   ≤ 1 per `p7-x*`, quota 4. One retry round for blocked items. Generated
   by `scripts/sample-legal.mjs`.
7. **Coding (one Analyst, `owl`; stored text only, verbatim quotes ≤ 25
   words, no personal names: individuals become `[person]`):**
   - `enforcement-cases.csv`: one row per enforcement action found in any
     stored record: rights holder, project, project type (fan game / fan
     remake / port-decomp / mod / emulator / hosting site / other),
     action, year (as stated), outcome (removed / continued / settled /
     court ruling / unclear), required user's own files (yes / no /
     unclear), dormant IP (yes / no / unclear by item 3), record ids,
     quote.
   - `revival-cases.csv`: one row per revival (item 3): project, IP,
     rights holder, years dormant (as stated), outcome, record ids, quote.
   - `policy-snapshots.csv`: one row per policy: owner, snapshot date,
     fan works allowed (yes / partial / no / silent), monetisation
     allowed (yes / partial / no / silent), original assets or code
     allowed (yes / partial / no / silent), takedown process stated (yes /
     no), minimum age (as stated), record id, quote per non-silent cell.
   - `demand-coding.csv`: every sampled `p7-v*` record: method, usable, on-topic
     (names a dormant IP and asks for, supports or praises its revival),
     dormant IPs named, demand type (request / petition / praise / news /
     critique / other), H7 stance, quote.
8. **H7 application:**
   - **Demand** = at least 3 named dormant IPs, each with revival demand
     in at least 2 stored records from at least 2 hosts.
   - **Survival** = at least 2 revivals coded licensed or tolerated.
   - **Supported** = demand and survival, and revivals with a known
     outcome are not mostly shut down (≤ 50%).
   - **Contradicted** = fewer than 3 dormant IPs with demand, **or** more
     than 50% of revivals with a known outcome were shut down (at least 4
     known outcomes).
   - **Unproven** = demand found but fewer than 4 revivals with a known
     outcome, or fewer than 10 on-topic records in total (demand records
     plus revival cases) from at least 2 source types.
9. **Risk register and overall level.** Each risk gets likelihood and
   impact. Likelihood: **high** = at least 3 dated enforcement actions of
   that kind in stored records from 2016 onward; **medium** = 1–2;
   **low** = none found. Impact: **high** = lawsuit, statutory fine or
   whole-service shutdown; **medium** = removal of individual items or
   projects; **low** = notice only. The overall legal risk level is the
   highest likelihood × impact among risks that apply to a hub hosting
   mods, fan games and ports for a likely under-18 audience. Each risk ends
   with a question for the lawyer.

**Phase 8 pre-registration addendum (2026-10-03, before any Phase 8
request).** The H12 row in section 1.3 and section 1.2 are unchanged.
Discord servers are never joined; only public directory pages are read.

1. **Budget:** owner decision 2026-10-03: Phase 8 may use at most **$0.60**
   by ledger estimate; study cap $5.54 → $6.04 and `phases-03-08` $2.97 →
   $3.47 (caps and `note` only; settled entries unchanged). Spend lines:
   searches $0.05; directory and forum scrapes $0.05; `reddit_posts` $0.06;
   `youtube_videos` $0.03; `tiktok_posts` $0.03; `x_posts` $0.03 (each
   pipeline batch also needs the runner's $0.25 hold, so pipeline batches
   run one at a time). Each batch's `--spend-ceiling` = its line + its hold
   ($0.25 pipeline, $0.02 otherwise), never more than $0.60 minus Phase 8
   spend so far. No batch starts once Phase 8 spend plus the next item's
   reserve would pass $0.60; work that does not fit is listed as unrun.
2. **One spender at a time:** every spending `bd-run.mjs` call holds the
   lock directory `data/raw/08-community/.spend-lock`.
3. **Definitions (fixed before counting):**
   - **Gathering place:** a named venue where modders or players meet to
     talk, ask for help or share work: Discord, Reddit, a web forum, a mod
     hub's own comments or forum, YouTube comments, TikTok, X, Twitch chat,
     Steam community, Telegram, Guilded, other.
   - **Cited:** a record names the venue as where people go, ask, share or
     should join (e.g. "join our Discord", "ask on the subreddit"). A bare
     share button or site footer link is not a citation.
   - **Active server** (directory listing): its listed last bump or last
     activity is within 30 days of the scrape date.
   - **Large server:** a listed member count of at least 10,000.
4. **Corpus test (no new spend):** the stored Phase 2 records
   (`data/raw/02-public-web/`) are counted mechanically with one regex per
   venue (`scripts/count-venues.mjs`, written before any Phase 8 request);
   a record cites a venue when its text matches that venue's citation
   pattern. Counts are reported per venue and per source type. Snippets are
   never counted.
5. **Frozen queries (`scripts/config/phase8-queries.json`):** `p8-g*`
   where-to-gather questions (Reddit 8, YouTube 4, TikTok 4, X 4, open web
   4), written neutrally ("where do modders talk", "best community for
   making mods"); `p8-s*` directory lookups (Disboard, discord.com server
   discovery, top.gg, discadia; one query per directory and topic); `p8-d*`
   disconfirmation (6: Discord decline, forums preferred, "Discord is bad
   for search", Reddit or Steam as the main venue). Up to 4 Disconfirmer
   additions (`p8-x*`) are appended before they run.
6. **Directory list rule (`scripts/config/phase8-directories.json`):**
   topic tag pages on Disboard for the frozen tags (modding, minecraft-mods,
   skyrim, gamedev, roblox, fan-games, romhacking, emulation, decompilation,
   game-modding), each scraped once (page 1 only, the directory's default
   order). Other directories are scraped only when a `p8-s*` result is a
   topic listing page on that directory's own domain (≤ 4). No server page
   is opened and no invite is followed.
7. **Sampling (hypothesis-blind, as in Phases 2–6):** on-site results
   only, one per record id, ordered by `recordId`, round-robin across
   queries; titles and snippets are never read. Reddit ≤ 2 per query, quota
   **16**; YouTube ≤ 2, quota **8**; TikTok ≤ 2, quota **8**; X ≤ 2, quota
   **8**; forum threads from `p8-g*` open-web and `p8-d*` results ≤ 2 per
   query, quota **8**. Disconfirmer extra ≤ 1 per `p8-x*`, quota 4.
   Generated by `scripts/sample-community.mjs`.
8. **Coding (two Analysts, `owl`; stored text only; verbatim quotes ≤ 25
   words; no personal names or handles):**
   - **A1 venues** (`venue-coding.csv`): every sampled record: usable,
     on-topic (talks about where modders or players gather), venues cited
     (item 3, `;`-separated), the venue recommended or described as the
     main place (one, or none), side (player / creator / both / unclear),
     H12 stance, quote.
   - **A2 directories** (`directory-servers.csv`): one row per listed
     server on each scraped directory page, extracted mechanically where
     the page structure allows and checked by A2: directory, tag, rank on
     page, members (as listed), last bump or activity (as listed, converted
     to days), active (item 3), large (item 3), modding-related (the
     server's own tags or description mention mods, modding, mod making,
     map making, romhacks or game development). Server names are kept only
     when they are not a person's handle.
9. **H12 application:**
   - **Most cited:** Discord has the largest share of venue citations among
     on-topic sampled records, and leads in at least 2 of the 4 sampled
     platforms (Reddit, YouTube, TikTok, X).
   - **Room to grow:** at least 10 active modding-related servers listed,
     and fewer than half of them are large.
   - **Supported** = most cited and room to grow, each from at least 2
     source types.
   - **Contradicted** = another venue has the largest citation share
     (ahead of Discord by at least 5 percentage points), **or** at least
     half of the active modding-related servers are large.
   - **Unproven** = fewer than 10 on-topic sampled records, fewer than 10
     active modding-related servers found, or Discord ties within 5 points.
10. **Logged measurement limit (2026-10-03, after the directory scrapes,
    before any coding; rules unchanged):** the stored Disboard cards show
    one unlabeled number per server. One card's own description says "a
    2000+ member community" while its listed number is 334, so the number
    is most likely members online, not total members. The "large server"
    test (item 3) therefore cannot be measured from stored text: a listed
    number of 10,000+ still counts as large, but a smaller number does not
    prove a server is small. The report states this limit next to every
    "room to grow" result.

**Phase 9 pre-registration addendum (2026-10-04, before any Phase 9
request).** No hypothesis row changes. Phase 9 sizes the segments that
Phases 3–8 found; it does not re-test hypotheses.

1. **Budget:** Phase 9 may use at most **$0.20** of the `phases-09-11`
   group ($0.48, untouched before Phase 9), leaving $0.28 for phases 10–11.
   No cap change. Baseline (free `readiness`, 2026-10-04 00:33 UTC): zone
   meter $2.90; ledger study spend $5.23 of $6.04 ($0.81 left); 0 open
   reservations. Spend lines (ledger estimate): searches $0.05, scrapes
   $0.06, `crunchbase_company` $0.05, retries $0.04. Each batch's
   `--spend-ceiling` = its unspent line + its hold ($0.02 for searches and
   scrapes; $0.25 for the pipeline batch, because the runner reserves
   $0.25 per pipeline item before it runs — a hold, not spend), and
   `readiness` is re-run between batches (the zone meter books searches
   late). No batch starts once Phase 9 booked spend plus the batch's line
   would pass $0.20; work that does not fit is listed as unrun. A failed
   pipeline item is booked at the $0.25 worst case; if that happens the
   batch stops, no further Phase 9 spending runs, and the overrun is
   reported (the group cap $0.48 still binds). No bump without the owner.
2. **One spender at a time:** every spending `bd-run.mjs` call holds the
   lock directory `data/raw/09-sizing/.spend-lock`. The crunchbase batch
   runs alone.
3. **Segments (fixed before collection, from Phases 3–8):**
   - **S1 Mod players** (download and play, no creating): 03 H3 Partially
     supported; 04 install complaints, H11 partial.
   - **S2 Beginner mod creators** (modding existing games): 05 H2
     Supported for learners, H10 creator side partial; 03/05 H6 leans to
     modding, not original games.
   - **S3 PC-port players:** 06 H8 Supported.
   - **S4 Fan-game makers and players:** 07 legal risk High, H7 Unproven;
     sized but flagged legally constrained; its SOM low case may be 0.
   - **Excluded (logged):** Rust rebuilds (06 H9 Contradicted); Discord
     (a channel per 08, not a revenue segment); "make your own original
     game" (03/05 H6 leans no; engines already serve it).
   - **Age constraint (from 03):** young-adult core, about 1 in 5 aged ≤ 17
     (Nexus 2015 survey, old and self-selected). People ≤ 17 are assumed to
     pay $0 directly in the low and base cases (no card, parental consent).
4. **Model (`scripts/size-model.mjs`, per segment, low / base / high):**
   - **TAM** = addressable people × paying share × annual spend per paying
     person.
   - **SAM** = TAM × reachable share (PC, English-speaking public web,
     games the product could support, legal-risk exclusions for S3/S4).
   - **SOM** = SAM × obtainable share in 3 years, anchored to an observed
     newcomer's scale, never to a guess.
   - Spend per person comes only from observed prices and payouts (premium
     tiers, creator payout totals, tip-jar tiers found in stored records).
   - **Overlap:** segments are reported separately, plus a de-duplicated
     total that subtracts a stated overlap share per segment (S1 contains
     much of S3).
   - **Sensitivity:** each input swung low → high one at a time with the
     others at base; the top 5 by swing on total SOM and on total TAM form
     the tornado table; each input lists the data that would firm it up.
5. **Quality grades per input:** **A** official/first-party statement with
   a date; **B** first-party, undated or rounded ("50M+"); **C**
   third-party measured (SteamDB, GitHub API counts, Crunchbase); **D**
   modelled estimate (traffic estimators, press estimates). D inputs may
   set low/high bounds only, never the base. Model parameter rows
   (`param:<name>` in the register, with the observation ids they rest
   on) take the grade of the input that sets their base; **X** marks a
   stated assumption with no direct source, allowed only for reach,
   obtainable and overlap shares, always flagged in the report and always
   in the sensitivity table.
6. **Third-party market-size headlines** go in `third-party-reports.csv`
   with their spread (min, max, max/min) and **never** enter the model.
7. **Frozen inputs:** `scripts/config/phase9-queries.json` (≤ 30 searches,
   `p9-*` ids, neutral wording, `p9-d*` disconfirmation such as shrinking
   audiences); `scripts/config/phase9-sources.json` (≤ 30 scrapes: official
   stats and about pages, dated press releases, GitHub releases API JSON
   for port download counts, SteamDB/Steam pages);
   `scripts/config/phase9-crunchbase.json` (≤ 8 companies; each company's
   Crunchbase URL is the `crunchbase.com/organization/<slug>` result for
   that company in the `p9-k*` searches, else the frozen fallback slug,
   logged). **Pick rule:**
   a search result may be added to the sources file, with its query id,
   before it is scraped, only if it is on the hub's or project's own
   domain, or is a dated press release or news page that the result
   snippet shows contains a number about users, downloads, members,
   creators, payouts or revenue. Social sites (Reddit, YouTube, TikTok, X,
   Instagram, Facebook, LinkedIn) are never scraped. Every pick is logged.
8. **Register rules:** every input row cites a stored record id, source
   URL, snapshot date (collection date), figure date (as stated, or
   "undated"), grade and a verbatim quote ≤ 25 words. Derived files hold
   organisation URLs only (no personal pages or handles); creator earnings
   are stored as aggregated figures without names. Missing figures are
   recorded as "unknown", never guessed.

**Phase 10 pre-registration addendum (2026-10-04, before any Phase 10
request).** No hypothesis row changes. Phase 10 builds personas for the
Phase 9 segments, gives pooled verdicts for H10 and H11, compares a play hub
with creator tools, and tests the "democratizing modding" positioning.

1. **Budget:** owner decision 2026-10-04 raised the study cap $6.04 →
   $6.19 and `phases-09-11` $0.48 → $0.63. Baseline (free `readiness`,
   2026-10-04 01:40 UTC): zone meter $3.09; study spent $5.44 of $6.19
   ($0.75 left); group spent $0.21 ($0.42 left); 0 open reservations.
   Phase 10 may use at most **$0.24**, leaving about $0.18 for Phase 11.
   Lines: searches $0.05; `reddit_posts` $0.06 (≤ 12 posts × $0.005);
   `youtube_comments` $0.10 (2 videos × 10 comments); Disconfirmer extra
   searches and retries $0.03. **Batch order:** searches (ceiling $0.07)
   → reddit (ceiling $0.31: line + the $0.25 per-item pipeline hold) →
   youtube (ceiling $0.35, in practice clamped to the group remaining;
   video 2 runs only if ≤ $0.06 is booked in the batch so far) →
   Disconfirmer `p10-x*` searches (≤ 4; searches only, because after the
   YouTube batch the group cannot hold another $0.25 reserve). Free
   `readiness` runs between batches. A failed pipeline item is booked at
   $0.25; then spending stops and the shortfall is reported. No further
   bump without the owner.
2. **One spender at a time:** every spending `bd-run.mjs` call holds the
   lock directory `data/raw/10-personas/.spend-lock`; `--max-parallel 1`.
3. **Persona inclusion:** a persona is built for S1–S4 only if phases 2–10
   hold **≥ 15 on-topic coded records** for that segment from **≥ 2
   platforms**. Otherwise it is listed as "not built — evidence too thin".
   S4 is flagged legally constrained (07). No persona for the excluded
   segments (Rust rebuilds, original-game makers, Discord as a channel).
   Segment mapping (fixed 2026-10-04 before gap-fill coding; one count per
   record id): 02/03 rows on H7 → S4, on H8 with a player/both segment →
   S3, other rows player/both → S1 and creator/both → S2; 04 usable
   on-topic rows player/both → S1, creator/both → S2; 05 on-topic → S2;
   06 port-demand on-topic player/both → S3; 07 demand on-topic → S4; 08
   venue on-topic player/both → S1, creator/both → S2; 10 gap-fill by its
   coded segment. Platform = the coded `platform` (07: `web` for scrapes).
4. **Persona fields** (reference set): snapshot, personality, emotional
   state, core worry, jobs to be done, triggers, objections, decision
   criteria, voice, best offer. Each field cites **≥ 2 record ids** (from
   ≥ 2 platforms where possible); 1 record = marked "thin"; 0 = "Not in
   evidence". Personality and emotional state come only from the person's
   own words. Age comes only from 03's aggregate figures, never from a
   person. "Best offer" is labelled **Planned (hypothesis)** and must cite
   the needs it answers.
5. **Voice rules:** quotes ≤ 15 words, verbatim; no names, handles,
   usernames, links, places or personal ages. Anything identifying is cut
   (with "…"), never reworded.
6. **Pooled H10/H11 verdict** (`scripts/pool-verdicts.mjs`): pool on-topic
   coded records from 02 (deep-sample rows for H10/H11), 04 (usable rows,
   one stance per record), 05 (H10 on learner records) and the Phase 10
   gap-fill, deduplicated by `recordId` (on a clash the later phase's
   Verifier-adjusted stance wins and the clash is listed). Apply the §1.2
   rules and the §1.3 rows. Report all records and per side (player /
   creator; `both` counts on each side), plus a sensitivity line **with and
   without** the Phase 10 records, so targeted gap-fill cannot alone move
   a verdict: if the two differ, the verdict without Phase 10 stands and
   the difference is reported.
7. **Play hub vs creator tools:** side-by-side rows — (1) who it serves,
   (2) friction evidence (H10 by side), (3) gap and switching (H11), (4)
   competition (04/05), (5) legal risk (07), (6) size (09 base TAM/SOM:
   S1 + S3 for the hub vs S2 for creator tools, using 09's segment rows
   as stored). A lean may be
   stated only if one direction is ahead on **≥ 4 of 6 rows** and no row
   is against it with Medium+ confidence; otherwise "the evidence does not
   choose".
8. **Positioning test, audience side** (`scripts/count-terms.mjs`,
   mechanical, frozen `scripts/config/phase10-terms.json`): over
   handle-scrubbed reading copies of on-topic coded records (phases 2–10),
   count records using the phrase family (`democratiz*`), synonyms ("for
   everyone", "anyone can", "accessible") and need terms (easy/easier,
   simple, one-click, no coding, beginner, where to start, too hard,
   confusing). Outcomes: **phrase fits** (phrase + synonyms ≥ 5% of
   on-topic records); **concept fits, wording doesn't** (phrase ≤ 1% and
   need terms ≥ 25%); **doesn't fit** (need terms < 10%); else **mixed**.
   Rules are checked in that order. Records with no stored reading copy
   are listed and left out of the denominator.
9. **Positioning test, competitor side:** `p10-c*` searches for the phrase
   family and synonyms, plus the same frozen regex over stored official
   pages from 04/05/09. A competitor "claims it" when its own domain uses
   the wording. **Already claimed** = ≥ 2 organisations' own pages; a
   stored page counts fully; a search snippet alone is listed but flagged.
   Signal counts never decide alone.
10. **Messages to avoid:** any message resting on an Unproven or
    Contradicted claim, on legal-risk High (07), on age targeting of
    minors, or on a competitor comparison without stored evidence.
11. **Frozen queries** (`scripts/config/phase10-queries.json`, ≤ 30):
    `p10-g*` neutral persona-language questions per segment (Reddit 8,
    YouTube 4, open web 2); `p10-d*` disconfirmation (4); `p10-c*`
    competitor wording (≤ 6). Up to 4 Disconfirmer `p10-x*` queries are
    appended (and logged) before they run.
12. **Sampling** (`scripts/sample-personas.mjs`, hypothesis-blind like
    Phases 3–8): on-site results of `p10-g*`/`p10-d*` only, one per record
    id (lowest query id wins), each query's candidates ordered by
    `recordId`, ≤ 2 per query, round-robin across queries in id order;
    record ids already stored in phases 2–9 are excluded. Reddit quota 12
    (`reddit_posts`), YouTube quota 2 (`youtube_comments`, `numComments`
    10). Titles and snippets are never read.
13. **Coding** (`data/derived/10-personas/gapfill-coding.csv`): recordId,
    platform, usable, onTopic, segment (S1–S4, none), side (player,
    creator, both, unclear), persona fields evidenced (`;`-list), H10, H11
    (supports, contradicts, neutral, off-topic), quote ≤ 15 words, note.
