# 06 — Ports And Rust Rebuilds

Status: **complete, 2026-10-03; Verifier pass applied (section 9).** Market
research only, not Linkgo app code. "Rust" means the Rust programming
language (owner decision, 2026-10-02), never the survival game.

| Field       | Value                                                                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase       | 6 of 11                                                                                                                                               |
| Hypotheses  | H8 porting is a big part of demand, H9 Rust rebuilds are relevant                                                                                     |
| Bright Data | `search` (web and news); `scrape` curated lists, repository pages, news and forum threads; `github_repository_file`; `reddit_posts`, `youtube_videos` |
| Team        | 2 Collectors (`bee`), 2 Analysts (`owl`), 1 Disconfirmer (`owl`), 1 fresh Verifier (`owl`)                                                            |
| Rules       | `01-research-protocol.md` §1.2–1.3 and §10 "Phase 6 pre-registration addendum" (written before any request)                                           |
| Raw data    | `data/raw/06-ports-rust/` (git-ignored; holds URLs)                                                                                                   |
| Derived     | `data/derived/06-ports-rust/` (no URLs, no handles): inventories, coding tables, query log, fetch rates, sample manifest                              |

**Citations.** `[r:<id>/<method>]` is a stored record (`<id>` = 16-hex
record id): a Reddit post with comments (`reddit_posts`), a YouTube video
with description and transcript (`youtube_videos`), a GitHub README
(`github_repository_file`) or a scraped page (`scrape`). Every on-topic
coded record has a verbatim quote in `port-demand-coding.csv` or
`rust-relevance-coding.csv`; all 31 were checked mechanically against the
stored text (31 of 31 found). `[q:<id>]` is a query in
`scripts/config/phase6-queries.json`; search results are **visibility only**
and never decide a count.

---

## Bottom Line

- **The port scene is wide.** The inventory has 286 native-PC port rows
  covering **240 distinct source games**. 184 of those games come from 25
  non-PC platform labels (PS1 37 rows, N64 36, Xbox 360 27, GBA 19, NES 17,
  GameCube 12, SNES 12). Static recompilation (125 rows) and decompilation
  (110) are the main methods, ahead of remakes (28) and source ports (23).
- **The best-known projects are active.** 9 of the 15 projects read in full
  had a commit in the last 12 months.
- **Most ports need the player's own copy of the game.** 12 of 16 checked
  native-port rows say so in the project's own words. Only OpenTTD ships
  free replacement data. Players have to find, dump or copy original files
  themselves.
- **Player talk about ports is positive and spread across many games.** 20
  of 21 on-topic demand records support H8, across Reddit, YouTube, forums
  and news. They name 29 different games; no game appears in more than 2
  records.
- **Rust rebuilds barely exist, and only developers talk about them.** Ten
  Rust-targeted searches found **4** Rust rebuilds, all small hobby
  projects. All 10 on-topic Rust records are developer-side. No player-side
  conversation about a Rust rebuild was found.
- **Verdicts:** H8 **Supported** (confidence low). H9 **Contradicted**
  (confidence low; exactly at the 10-record minimum).

---

## 1. Definitions

Fixed before counting (protocol §10, Phase 6 addendum item 3):

| Term                  | Meaning used here                                                                                             | Example              |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------- |
| Port                  | A game made to run natively on PC from another platform, any method                                           | —                    |
| Decomp                | Source reconstructed from a binary that recompiles to a matching binary                                       | zeldaret/oot         |
| Static recompilation  | Machine code translated ahead of time into native code                                                        | Zelda 64: Recompiled |
| Source port           | Native port built on released or reconstructed source, often with engine changes                              | Ship of Harkinian    |
| Remake                | New code reproducing a game's behaviour without its original code                                             | OpenMW, OpenRCT2     |
| Rust rebuild          | Any of the above whose main language is Rust, checked on the repository (root `Cargo.toml`, README)           | rust-doom            |
| Not counted as a port | Emulators, engines, new original games, game servers, official commercial re-releases (kept as boundary rows) | Sonic Mania Plus     |

A decomp that only rebuilds the original console binary is
`decomp-no-pc-build` (e.g. pokered, pokeemerald) and does not count as a
native port. Remakes and source ports of games that were already on PC
(OpenRCT2, DevilutionX, OpenMW) are kept, but the platform counts separate
PC from non-PC.

## 2. Port Project Inventory

`port-inventory.csv` has 415 rows. 19 are `checked` (the project's README
was read), 392 are `listed` (named on one of six curated lists, with fields
as the list states them), and 4 are dictionary terms not fetched (two taken
down, one official release, one team name).

| Method               | Rows | Status (286 native rows)      | Rows |
| -------------------- | ---- | ----------------------------- | ---- |
| static-recompilation | 125  | released                      | 131  |
| decomp               | 110  | in-progress                   | 50   |
| remake               | 28   | stalled                       | 3    |
| source-port          | 23   | taken-down                    | 2    |
| decomp-no-pc-build   | 86   | unclear (list gave no status) | 100  |
| tooling              | 21   |                               |      |
| boundary / unclear   | 22   |                               |      |

**Original platforms (native rows):** PS1 37, N64 36, Xbox 360 27, PC 26,
GBA 19, NES 17, GameCube 12, SNES 12, mobile 10, the rest 10 or fewer each;
36 rows unclear. Nintendo platforms make up 108 of the 286 rows (38%).

**Checked projects (README via `github_repository_file`; last commit = its
`latest_update` field):**

| Project              | Source game(s)                    | Platform | Method               | Last commit | Own files? | Stars  |
| -------------------- | --------------------------------- | -------- | -------------------- | ----------- | ---------- | ------ |
| OpenRCT2             | RollerCoaster Tycoon 2            | PC       | remake               | 2026-09-20  | yes        | 16,273 |
| DevilutionX          | Diablo; Hellfire                  | PC       | source-port          | 2026-07-16  | yes        | 9,783  |
| OpenTTD              | Transport Tycoon Deluxe           | PC       | remake               | 2025-05-04  | **no**     | 8,326  |
| N64: Recompiled      | (recompilation tool)              | N64      | tooling              | 2024-12-24  | —          | 8,186  |
| Zelda 64: Recompiled | Majora's Mask; Ocarina (in prog.) | N64      | static-recompilation | 2026-09-25  | yes        | 7,339  |
| OpenMW               | Morrowind                         | PC/Xbox  | remake               | 2026-04-13  | yes        | 6,594  |
| Ship of Harkinian    | Ocarina of Time                   | N64      | source-port          | 2026-09-28  | yes        | 5,518  |
| pokered              | Pokémon Red/Blue                  | Game Boy | decomp-no-pc-build   | 2024-10-09  | —          | 4,967  |
| OpenGOAL             | Jak 1 (Jak II, Jak 3 in prog.)    | PS2      | decomp               | 2026-03-22  | yes        | 3,542  |
| pokeemerald          | Pokémon Emerald                   | GBA      | decomp-no-pc-build   | 2023-08-30  | —          | 3,523  |
| SpaghettiKart        | Mario Kart 64                     | N64      | source-port          | 2026-09-16  | yes        | 2,386  |
| 2 Ship 2 Harkinian   | Majora's Mask                     | N64      | source-port          | 2026-09-25  | yes        | 2,280  |
| sm64ex               | Super Mario 64                    | N64      | source-port          | 2021-11-25  | unclear    | 1,841  |
| RSDKv5 Decompilation | Sonic Mania (Retro Engine v5)     | multi    | decomp               | 2025-12-18  | unclear    | 561    |
| Render96ex           | Super Mario 64                    | N64      | source-port          | 2021-08-01  | unclear    | 370    |

Not fetched: re3 and reVC (GTA III / Vice City source ports) were taken down
after a DMCA notice; Sonic Mania Plus is an official release (boundary);
"Harbour Masters" is a team, not a project.

**Activity.** 9 of 15 checked projects (60%) committed between 2025-10-03
and 2026-10-03. The six that did not are two older Super Mario 64 ports,
the N64Recomp tool, OpenTTD (last commit 2025-05-04) and the two Pokémon
decomps. Among `listed` native rows, the lists give a status for 168 of
268; 120 of those 168 say released.

**Own original files.** Checked READMEs state the requirement directly.
Ship of Harkinian: "You are required to provide a supported copy of the
game." `[r:02901ce343ae177a/github_repository_file]`. OpenGOAL: "you must
provide your own legitimately obtained PS2 copy of the game."
`[r:af07bf58f631352c/github_repository_file]`. OpenRCT2: "OpenRCT2 requires
original files of RollerCoaster Tycoon 2 to play."
`[r:e388c02c0721795e/github_repository_file]`. Counts among checked native
rows: 12 yes, 1 no (OpenTTD), 3 unclear. Curated lists rarely say: 238 of
268 listed native rows are "unclear" and 30 are "yes".

## 3. Player Demand For Ports

Sample: 22 Reddit posts, 7 YouTube videos, 6 forum threads and 4 news
articles (39 records), chosen by record id with titles unread. The 4
Disconfirmer threads are added in section 7. 21 records are on-topic and
coded in `port-demand-coding.csv`.

| Platform | On-topic | Supports | Neutral | Contradicts |
| -------- | -------- | -------- | ------- | ----------- |
| Reddit   | 9        | 9        | 0       | 0           |
| YouTube  | 6        | 6        | 0       | 0           |
| Forum    | 3        | 2        | 1       | 0           |
| News     | 3        | 3        | 0       | 0           |
| **All**  | **21**   | **20**   | **1**   | **0**       |

**What players say.**

- **Using and praising ports (9 records).** "native PC ports are amazing,
  better than emulators for a few reasons"
  `[r:15b0ba8b4f86d13e/reddit_posts]`. "Gears of War 2 is finally playable
  natively on PC without the heavy hardware demands of emulation!"
  `[r:03163c278683c242/youtube_videos]`. "the first native PC port of a
  GameCube game" (Animal Crossing) `[r:36f4bea96d7b5ac2/youtube_videos]`.
- **Asking for ports that don't exist (3).** "I wish there was a PC port so
  we, fans, could play it on PC." `[r:231d7a480e3cdd49/reddit_posts]` (a
  mobile game). Also GTA: Liberty City Stories
  `[r:072460df43954447/reddit_posts]`.
- **Confusion over terms.** "Why some unofficial PC ports are called
  decompilition like Mario kart 64 port and some are recompilitions"
  `[r:32f5ebf9fe7918f6/reddit_posts]`.
- **Breadth.** On-topic records name 29 different source games from N64,
  PS1, PS2, GameCube, Wii, Xbox 360, Genesis, DOS, PC and mobile. No game
  appears in more than 2 records.

**Served?** 11 of 21 on-topic records talk about a game that already has a
working port. 7 show the need only partly met or unmet; 3 are unclear. None
say existing ports already meet demand in general.

## 4. How Ports Are Distributed And Installed

Evidence here comes from READMEs and the sample; it was not studied
separately.

- **Self-assembly.** Players get the port from GitHub releases or a project
  site, then supply the game data themselves (section 2). Two YouTube
  records are install walkthroughs. One says "N64 decomp, recomp, and PC
  ports, as well as other systems recomp and PC ports have been blowing up"
  and shows a launcher that gathers them `[r:00e6225e93ef842a/youtube_videos]`.
- **Launchers are appearing.** One of the six curated sources is a Steam
  Deck news article about an N64 recomp launcher. Installation is a known
  friction that the community is starting to package.
- **Legal risk.** re3 and reVC were taken down. Fan ports exist, in one
  thread's words, "when it's too niche for publishers"
  `[r:ff3b72d84eca5493/scrape]`.

## 5. Rust Rebuild Inventory

`rust-inventory.csv`. The candidate rule (addendum item 5) takes the first
10 distinct rebuilds of existing games with a public repository, from
`p6-r01`–`r08` then `p6-n05`–`n06`, in order. The ten searches gave only
**4** that met the rule. 29 other Rust results were boundary cases (engines,
emulators, servers, new games, tutorials) and 2 named no repository.

| Project               | Source game        | Method      | Rust evidence                        | Status      | README updated | Own files? | Stars |
| --------------------- | ------------------ | ----------- | ------------------------------------ | ----------- | -------------- | ---------- | ----- |
| rust-doom             | Doom / Doom II     | remake      | root `Cargo.toml`; "written in Rust" | stalled     | 2021-04-01     | yes (WAD)  | 2,415 |
| Another World engine  | Another World      | remake      | root `Cargo.toml`; README title      | unclear     | 2025-09-27     | yes        | 13    |
| Prince of Persia port | Prince of Persia   | source-port | root `Cargo.toml`; "a Rust port"     | in-progress | 2026-06-01     | unclear    | 0     |
| Kolumz revival        | Kolumz (shareware) | remake      | root `Cargo.toml`; README            | stalled     | 2023-04-15     | unclear    | 0     |

The scrape did not capture repository language bars, so Rust is confirmed
by a root `Cargo.toml` on each repository page plus the README's own words.
rust-doom calls itself "A little Doom 1 & 2 Renderer written in Rust."
`[r:bfccac84a1d7883f/github_repository_file]`, so it is a renderer, not a
full game. The Prince of Persia port says "Pass 2/3/4 not started."
`[r:dc4eb6d62f481f22/github_repository_file]`, so it is not playable yet.
The Another World author started it "mainly to teach myself Rust"
`[r:790284ba7b15c27d/scrape]`.

**Where Rust search results came from (`c2-venues.csv`, 82 results):**
developer venues 46, news 13, other 20, player venues **3**.

## 6. Rust Relevance To This Audience

`rust-relevance-coding.csv` covers every sampled record whose text contains
"rust" (21). 10 are on-topic (they name a Rust rebuild of an existing
game).

| Venue / content                         | On-topic | Player-side | Developer-side |
| --------------------------------------- | -------- | ----------- | -------------- |
| GitHub README / repository page (4 + 4) | 8        | 0           | 8              |
| Reddit (r/rust)                         | 1        | 0           | 1              |
| News (Rust rewrite of a game, mixed)    | 1        | 0           | 1              |
| **All**                                 | **10**   | **0**       | **10**         |

- The one Reddit record is a developer showing a remake: "I've been working
  on a fan-made remake of Chip's Challenge to learn more about gameplay and
  graphics programming in Rust." `[r:391891b9c390989a/reddit_posts]`.
- The news record reports a player-facing mashup, but its Rust point is
  about code: "the mashup runs on IW4L, which is a Rust rewrite of Modern
  Warfare 2" `[r:ae793cc449d35e2b/scrape]`. Under addendum item 9 a record
  is player-side only when its content is mainly about playing or
  installing. This one is mixed, so it counts as developer-side.
- Across the 29 Reddit and YouTube sample records, **none** names a Rust
  rebuild in a player community. The other 11 "rust" records were
  off-topic: general Rust language talk, Rust game servers, or the
  survival game.
- Rust rebuilds appear in 2 of 21 on-topic port-demand records (10%), both
  developer-side.

**Answer:** in this evidence, Rust appears only among developers. Players
talk about ports by game and by method (decomp, recomp), not by language.

## 7. Disconfirming Evidence

The Disconfirmer read the coding and inventories and argued against both
leans. It proposed six extra queries (`p6-x01`–`x06`), which were run. Four
threads were sampled from them (one per query; `p6-x01` and `p6-x03` had no
eligible thread) and coded by the Analysts: three were off-topic (PC
case-fan ports, abandoned code branches, the survival game's Steam page)
and one was a neutral fan-port catalogue `[r:ff3b72d84eca5493/scrape]`.

**Against H8 — what holds up:**

- **Nintendo concentration.** 38% of native rows are on Nintendo platforms,
  and 9 of 15 checked projects are N64 or Nintendo handheld. But PS1 (37
  rows) and Xbox 360 (27) rival N64 (36), so the scene is not
  Nintendo-only.
- **Curated-list dependence.** 268 of 286 native rows are `listed`; their
  status is unclear for 100 and their own-files answer for 238. The breadth
  count (240 games) relies on lists. The activity test uses checked rows
  only.
- **Query wording.** The community queries were balanced in advance (7
  help-seeking, 7 showcase, 8 neutral), but every query names ports. The
  sample cannot show how many players _never_ think about ports. "A big
  part of demand" is measured within port-aware conversation only.
- **No "emulation is enough" voice found.** Neither the frozen
  disconfirmation queries nor `p6-x03`/`x06` produced a sampled thread
  saying so.

**Against H8 — rejected:** the Disconfirmer asked to recode
`[r:ae793cc449d35e2b/scrape]` from supports to contradicts because the
writer is developer-side. Not applied: H8's contradiction rule is about
ports being unneeded, limited to a few titles, or the need being met — not
about who is speaking. It also argued the 11 `served=fully` records should
contradict. Not applied: those records praise an existing port of one
game, while the rule needs ≥ 60% of records to say the need is met _and_
< 10% to request an unported game (here 11 of 21 = 52%, and 3 of 21 = 14%
request one).

**Against the H9 lean:** the Disconfirmer noted that a README and a
repository page of the same project count as 2 records (4 projects give 8
of 10 on-topic records). Accepted as a limit: counted by project, the
player-side share is still 0 of 6. It also noted that queries did not name
player venues such as r/emulation and r/SteamDeck. `p6-x01` and `p6-x02`
targeted them; the one thread they yielded was the survival game.

**Recode applied from this review:** `[r:ae793cc449d35e2b/scrape]` H9
supports → contradicts (content `mixed` is developer-side under item 9).

## 8. Verdicts

Rules: §1.2 (≥ 20 on-topic records, ≥ 3 platforms, ≥ 2 source types;
supported = ≥ 60% support and < 25% contradict) and §10 Phase 6 addendum
items 10–11.

### H8 — Porting is a big part of demand: **Supported.** Confidence: low.

| Test (addendum item 10)                                 | Result                               | Met? |
| ------------------------------------------------------- | ------------------------------------ | ---- |
| ≥ 30 distinct source games with a native port           | 240 (184 from non-PC platforms)      | yes  |
| …from ≥ 3 original platforms                            | 25 non-PC platform labels            | yes  |
| ≥ 50% of checked projects active in the last 12 months  | 9 of 15 (60%)                        | yes  |
| On-topic player records on ≥ 3 platforms                | Reddit, YouTube, forum, news (4)     | yes  |
| §1.2 minimum: ≥ 20 on-topic, ≥ 2 source types           | 21; community (b) + news (e)         | yes  |
| §1.2 shares: ≥ 60% support, < 25% contradict            | 20 of 21 (95%) / 0                   | yes  |
| Contradiction: top 3 games ≥ 60% of game-naming records | no game in more than 2 of 20 records | no   |
| Contradiction: ≥ 60% "fully met" and < 10% request      | 52% fully; 14% request               | no   |

Why low confidence: 21 records is just above the minimum, every query
names ports, and breadth rests on curated lists. "A big part of demand" is
shown within port-aware conversation, not as a share of all players.

### H9 — Rust rebuilds are relevant: **Contradicted.** Confidence: low.

| Test (addendum item 11)                                 | Result                         | Met?          |
| ------------------------------------------------------- | ------------------------------ | ------------- |
| Minimum: ≥ 10 on-topic records                          | 10                             | yes (exactly) |
| Support: player-side records on ≥ 2 platforms           | 0 player-side records          | no            |
| Contradict: ≥ 60% of on-topic records developer-side    | 10 of 10                       | yes           |
| Contradict (alt.): named in < 5% of port-demand records | 2 of 21 (10%), both developer  | no            |
| §1.2 shares: ≥ 60% contradict, < 25% support            | 10 of 10 contradict, 0 support | yes           |

The developer-only condition is met; the rarity condition is not (10% is
above 5%). Why low confidence: exactly 10 records, 8 of them from 4
projects, and only 4 Rust rebuilds exist to talk about. The evidence says
Rust is a developer choice that players do not mention, not that players
reject it.

## 9. Verifier Report

A fresh `owl` Verifier, given only this file, the protocol, the derived data
and the stored record text, checked it on 2026-10-03.

| Check                                                     | Result                                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 12 claims re-checked against stored text and CSVs         | 12 confirmed, 0 dropped, 0 downgraded (5 verbatim quotes and 7 counts)                                                                |
| Independent re-code: 6 demand records (lowest record ids) | 6 of 6 agree (2 on-topic `supports`, 4 off-topic)                                                                                     |
| Independent re-code: all 10 on-topic Rust records         | 10 of 10 agree (`contradicts`, developer-side by addendum item 9)                                                                     |
| H8 and H9 verdicts against §1.2 and addendum items 10–11  | Both confirmed. H9 rests on the developer-side test alone; the "rare" test fails (2 of 21 = 10%, above 5%), as section 8 already says |
| Spend                                                     | 16 Phase 6 ledger entries, all settled, total $0.49 ≤ $0.75                                                                           |
| Number recount                                            | One flag: static recompilation 127 rows, not 125                                                                                      |

**Flag rejected by the lead, with evidence.** The Verifier counted text
lines containing "static-recompilation" (127). Parsing the CSV's `method`
column gives **125**; the 2 extra lines are rows with another method whose
`notes` mention static recompilation. The table stays at 125.

**Corrections applied before the Verifier pass (lead quote check, step 9).**
All are logged in `data/raw/06-ports-rust/work/lead-corrections.json`:

- Three quotes had a dropped comma or filler word; they were restored to the
  exact stored text (`00e6225e93ef842a`, `05e05cef30a23d52`,
  `ae793cc449d35e2b`).
- `0b8ac56493f21b03` (Minecraft servers rewritten in Rust) was recoded
  off-topic for H9, because game servers are excluded by addendum item 3.
- `ae793cc449d35e2b` H9 was recoded from supports to contradicts. Item 9
  counts a record as player-side only when its content is mainly about
  playing or installing; A2 coded the content as mixed.
- The Disconfirmer's suggested H8 recode of `ae793cc449d35e2b` (supports to
  contradicts) was declined. The article reports an active fan release,
  which the H8 rule counts as support.
- `72e3339965498846` H9 was changed from neutral to off-topic (the codebook
  requires off-topic when a record is not on-topic). For the Disconfirmer's
  extra record `ff3b72d84eca5493`, the lead filled in the missing side and
  the verbatim quote; its code was unchanged.

After all edits, `check-derived.mjs --phase 06-ports-rust` reports 0
findings and the quote check finds 31 of 31.

## 10. Run Log And Spend

**Requests (`query-log.csv`, `fetch-rates.csv`).**

| Command                  | Items | OK  | Notes                                                       |
| ------------------------ | ----- | --- | ----------------------------------------------------------- |
| `search` (web + news)    | 60    | 57  | 13 blocked attempts; 10 recovered on one retry              |
| `scrape`                 | 24    | 24  | 6 lists, 4 Rust repo pages, 4 news, 6 forum, 4 Disconfirmer |
| `github_repository_file` | 20    | 20  | 15 port READMEs + OpenRCT2 retry (`readme.md`), 4 Rust      |
| `reddit_posts`           | 23    | 23  | 22 sample + 1 curated-list thread                           |
| `youtube_videos`         | 7     | 7   | quota 8; only 7 eligible results                            |

Still blocked after one retry: `p6-c09` (Reddit), `p6-y07` (YouTube),
`p6-n04` (news). The Reddit sample is 22 of the 28 quota: `p6-c09` was
blocked, and `p6-c08` and `p6-c10` returned no Reddit post URLs. News
scrapes cover `p6-n01`, `n02`, `n05`, `n06` (n03's news scrape was not run;
n04 was blocked).

**Spend (ledger, `phase: 06-ports-rust`).** Allocation $0.75 (owner decision
2026-10-03: study cap $5.00 → $5.38, phases 3–8 group $2.43 → $2.81).

| Line                                                   | Ledger usd |
| ------------------------------------------------------ | ---------- |
| Searches (four batches incl. retries)                  | $0.12      |
| Curated-list scrapes (settled unmeasured, full amount) | $0.06      |
| Other scrapes and 2 late searches (one batch)          | $0.01      |
| Pipelines (GitHub, Reddit, YouTube)                    | $0.30      |
| **Phase 6 total**                                      | **$0.49**  |

16 ledger entries, 0 open reservations. A Collector session was stopped by
its time limit mid-batch; that batch's $0.06 reservation was settled as
unmeasured, with the full amount counted. The owner allowed small ceiling
bumps during the run; every batch still checked Phase 6 spend + its ceiling
≤ $0.75 before starting. Group headroom left after Phase 6: $0.26 (the
owner sets phase 7–8 budgets).

**Deviations from the plan.** Both Collectors hit their time limits after
the searches. The lead ran the remaining fetch batches from the same plans.
Inventory building was finished by follow-up Collector sessions (C1 as a
list session and a README session; C2 as a candidate session). The lead
assembled `rust-inventory.csv` from C2's candidates and the fetched
READMEs. Only 4 Rust candidates, not 10 (rule exhausted). One file name was
added to the GitHub allowlist: `readme.md`, still a text file, for the
OpenRCT2 retry.
