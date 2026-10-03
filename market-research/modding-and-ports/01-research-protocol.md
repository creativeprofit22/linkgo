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

| Date       | Change                                                                                                                                      | Reason                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 2026-10-02 | Criteria, matrix and signal groups registered (sections 1–3)                                                                                | Pre-registration before any collection                                            |
| 2026-10-02 | Spend meter changed from account balance to `budget zones` cost + pipeline estimates                                                        | The balance field shows $0 with free credit; the first key also got 403           |
| 2026-10-02 | Added `scripts/bd-zones.mjs` (free zone creation)                                                                                           | The CLI can only create zones through `login`, which writes a plaintext key file  |
| 2026-10-02 | Added study-wide spend ledger and phase caps                                                                                                | Owner approved a $5 cap, a 40/50/10 split and 2 parallel Collectors               |
| 2026-10-02 | Phase 2 rules: filter off-site `site:` results; YouTube/Reddit through pipelines only; TikTok timeout 600 s; stratified subset to fit $1.94 | Pilot findings, section 5.3 and section 6                                         |
| 2026-10-02 | Phase 2 subset rule registered before collection (see below)                                                                                | Owner chose "Run the planned subset"; the full matrix (≈ $3.40) exceeds $1.94     |
| 2026-10-03 | Phase 3 addendum: $0.70 allocation, age buckets, H1 source eligibility, minors rule, frozen query list, sampling rule (see below)           | Pre-registration before any Phase 3 request; Phase 2 found no H1 survey           |
| 2026-10-03 | Phase 3 allocation raised from $0.70 to $1.00 (addendum item 1)                                                                             | Owner decision: $0.25 pipeline reserve plus uncapped TikTok comments exceed $0.70 |
| 2026-10-03 | Phase 4 addendum: $1.00 allocation, competitor rule, snapshot slots, frozen queries, sampling, coding, matrix cell rule (see below)         | Pre-registration before any Phase 4 request; owner budget decisions 2026-10-03    |

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
