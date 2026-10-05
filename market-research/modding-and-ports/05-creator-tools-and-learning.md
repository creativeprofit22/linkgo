# 05 — Creator Tools And Learning Paths

Status: **complete, 2026-10-03; Verifier pass applied (section 8).** Market
research only, not Linkgo app code.

| Field       | Value                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Phase       | 5 of 11                                                                                                                       |
| Hypotheses  | H2 low coding skill, H5 learning curve, H6 own game, H10 demand for easier creation (creator side)                            |
| Bright Data | `scrape` official tool pages (dated 2026-10-03); `search`, `reddit_posts`, `youtube_videos` and forum scrapes for learners    |
| Team        | 2 Collectors (`bee`), 1 Analyst (`owl`, run as 4 sessions), 1 Disconfirmer (`owl`), 1 fresh Verifier (`owl`)                  |
| Rules       | `01-research-protocol.md` §1.2–1.3 and §10 "Phase 5 pre-registration addendum" (written before any request)                   |
| Raw data    | `data/raw/05-creator-tools/` (git-ignored; holds URLs)                                                                        |
| Derived     | `data/derived/05-creator-tools/` (no URLs, no handles): tool snapshots, learner coding, friction map, source index, query log |

**Citations.** `[r:<id>/<method>]` is a stored record: an official page or
forum thread (`scrape`), a Reddit post with comments (`reddit_posts`) or a
YouTube video with description and transcript (`youtube_videos`). Every
learner record has a verbatim quote in `learner-coding.csv`; every known
snapshot cell has one in `tool-snapshots.csv`. All quotes were checked
mechanically against the stored text (29 of 29 learner quotes, 34 of 34
snapshot quotes found). `[q:<id>]` is a search query in
`scripts/config/phase5-queries.json`; search results are **visibility only**
and never decide a count.

---

## Bottom Line

- **For making an original game, beginner tools already exist and say so.**
  GDevelop calls itself a no-code engine, Rosebud (AI-assisted) says no
  coding experience is needed, and Unity, GameMaker, GDevelop, Construct and
  RPG Maker all publish a beginner path. Godot is free; Unity, GameMaker,
  GDevelop and Construct have free tiers with limits.
- **For modding an existing game, the captured kits assume code.** The
  tModLoader guide is C# and the Fabric wiki is Java; BepInEx installs by
  hand. Both setup records in the sample are mod-kit installs rated as
  blockers.
- **Learners stall early.** 17 of 29 on-topic records are at "pick a tool" or
  "learn the basics". The most named frictions are tool complexity (45%),
  coding (28%) and missing or poor docs (24%). Most are "slows", not
  "blocker". Only 1 record is about quitting, so why people quit is not
  shown.
- **Verdicts:** H2 **Supported** for learners (low confidence: the margin
  is 1 record and depends on query wording). H10 creator side **Partially
  supported** (low). H5 **Unproven, leans support** (only one source type).
  H6 **Unproven, leans no**. Section 7 gives the counts.

---

## 1. Tool Landscape

16 tools in 4 categories, frozen before any request
(`scripts/config/phase5-tools.json`; addendum item 2). No tool outside the
starting list was named in 3 or more coded Phase 2–4 records.

| Category                  | Tools                                                                                             | Captured pages |
| ------------------------- | ------------------------------------------------------------------------------------------------- | -------------- |
| General engines           | Unity, Unreal Engine, Godot, GameMaker                                                            | 7 of 8         |
| No-code / low-code makers | RPG Maker, GDevelop, Construct, Roblox Studio                                                     | 6 of 8         |
| Modding kits and loaders  | Bethesda Creation Kit, BepInEx, MelonLoader, Minecraft Fabric/Forge, tModLoader, Blockbench       | 4 of 8 planned |
| AI-assisted creation      | Rosebud, Astrocade (the first two own-site results of the discovery search `[q:a5-l15]`, by rank) | 2 of 2 planned |

- Mod managers belong to Phase 4 and are cited there, not re-scraped.
- **Gaps:** Roblox pages stayed blocked after 3 attempts (the run did one extra round beyond the 2 rounds in addendum item 3; logged). The
  MelonLoader and Blockbench pages came back title-only. Creation Kit and
  Astrocade had no on-site lookup result that matched a slot
  (`official-lookups-log.json`). The Fabric config docs URL returned a 404
  and was replaced by the logged lookup pick, as the rule allows.
- Learners also name tools that are not on the list: MCreator (2 records),
  Scratch, GB Studio, SMAPI, Content Patcher and Geode SDK (1 each).

## 2. Dated Tool Snapshot Table

Snapshot date **2026-10-03** for every page. Cells are quoted from the
official page, or say **Unknown** (addendum item 8). Skill is marked
_(official)_ when the page states it and _(analyst)_ when it is rated from
what the page shows. 34 of 80 cells are known and 46 are Unknown, mostly
for modding kits.

| Tool         | Price (as stated)                                                    | Skill                  | Platforms                                  | Output licensing                                          | Beginner onboarding                                       | Pages          |
| ------------ | -------------------------------------------------------------------- | ---------------------- | ------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------- | -------------- |
| Unity        | Personal free below $200K funding or revenue; Pro required above     | none _(official)_      | web, desktop, AR/VR, mobile                | Unknown                                                   | guided Get Started tutorial and learning paths            | 72dedc, 47e59c |
| Unreal       | free to start; 5% royalty above $1M gross per product                | Unknown                | Unknown                                    | 5% royalty above $1M; Epic Games Store sales royalty-free | Unknown                                                   | 1f4dc7         |
| Godot        | free, open source (MIT)                                              | Unknown                | Unknown                                    | creators license their games as they choose               | Unknown                                                   | aa9659, bc1e01 |
| GameMaker    | free for non-commercial; paid Professional for commercial or console | none _(official)_      | Unknown                                    | no forced watermark or splash screen                      | beginner tutorial game; 8+ hours of video tutorials       | 2c00c4, 9261df |
| RPG Maker    | Unknown                                                              | Unknown                | Unknown                                    | user keeps rights to their games and own assets           | official beginner tutorial series                         | 179ad4, 454af0 |
| GDevelop     | free plan; paid tiers; Pro required for companies above $50K revenue | none _(official)_      | free: Android/desktop once a day; iOS paid | Unknown                                                   | getting-started first steps for beginners                 | 8803cb, 6a2ba7 |
| Construct    | Free Edition cannot sell or monetise; paid price not captured        | Unknown                | Android APK build; iOS publishing          | paid versions royalty-free                                | tutorials filterable by Beginner                          | ce1594, 70aeb5 |
| Roblox       | Unknown                                                              | Unknown                | Unknown                                    | Unknown                                                   | Unknown                                                   | blocked        |
| Creation Kit | Unknown                                                              | Unknown                | Unknown                                    | Unknown                                                   | Unknown                                                   | none found     |
| BepInEx      | free, open source (LGPL 2.1)                                         | Unknown                | Windows 7–10, Linux, macOS                 | loader is LGPL 2.1; terms for mods built on it not stated | manual: extract into game folder, first run makes config  | 8047db, 05ad5b |
| MelonLoader  | Unknown                                                              | Unknown                | Unknown                                    | Unknown                                                   | Unknown                                                   | title-only     |
| Fabric/Forge | Unknown                                                              | programmer _(analyst)_ | Unknown                                    | Unknown                                                   | wiki tutorials; "trial, error, and asking for help"       | 47476f         |
| tModLoader   | Unknown                                                              | programmer _(analyst)_ | Unknown                                    | Unknown                                                   | step-by-step guide: install .NET SDK, edit a C# item file | 2d994b         |
| Blockbench   | Unknown                                                              | Unknown                | Unknown                                    | Unknown                                                   | Unknown                                                   | title-only     |
| Rosebud (AI) | free tier with credits; paid plans                                   | none _(official)_      | desktop or laptop browser                  | Unknown                                                   | create, test and publish a first game in the browser      | e96b2e, 8c367f |
| Astrocade    | Unknown                                                              | Unknown                | Unknown                                    | Unknown                                                   | Unknown                                                   | none found     |

Page ids are the first six characters; the full ids are in
`tool-snapshots.csv`. Prices are only what the captured pages say.
Amounts that were not on the page are left out.

## 3. The Beginner Journey

Built from 29 on-topic learner records (26 community posts and videos and 3
re-coded Phase 2 project or news pages). Stage is the furthest step the
record is about.

| Stage           | Records | Main friction in those records                            | Blockers |
| --------------- | ------- | --------------------------------------------------------- | -------- |
| Idea            | 0       | —                                                         | —        |
| Pick a tool     | 10      | tool complexity 4, coding 3, docs 3                       | 1        |
| Setup / install | 2       | setup 1, tool complexity 1                                | 1        |
| Learn basics    | 7       | docs 2, coding 2, tool complexity 1, motivation 1, none 1 | 3        |
| First build     | 5       | tool complexity 2, coding 1, setup 1, none 1              | 2        |
| Debug           | 0       | —                                                         | —        |
| Share / ship    | 4       | none 3, tool complexity 1                                 | 0        |
| Quit            | 1       | cost (time not paid back by sales)                        | 1        |

1. **Pick a tool.** The most common entry is a "which engine is easiest"
   post. Commenters answer with many different engines and do not agree
   `[r:04850798c8ffaf9e/reddit_posts]` `[r:0bb38c701ed504a3/reddit_posts]`
   `[r:0fbba0361f397424/reddit_posts]` `[r:127d016b05faa392/reddit_posts]`.
   Modders ask the same question about a game ("where to start with
   Skyrim / Minecraft / Stellaris")
   `[r:236cb8a4fd411ef7/reddit_posts]` `[r:16b21c20cf5a0b56/reddit_posts]`
   `[r:690354e1c68a0cbf/reddit_posts]`.
2. **Setup.** Setup friction appears only for mod kits, and both records rate it a blocker: a
   Fabric/Forge setup tutorial `[r:3e69f78fffedef0f/youtube_videos]` and a
   Geometry Dash SDK first mod that needs several build tools
   `[r:61a43d77482a5024/youtube_videos]`.
3. **Learn basics.** Learners say they cannot find good resources, or must
   learn a language first (Java for Minecraft)
   `[r:19d612737835c36f/reddit_posts]` `[r:6565f0a9e4a7630d/scrape]`
   `[r:0ce7d46030d34991/reddit_posts]`.
4. **First build.** Mixed results. One first Skyrim mod went well
   `[r:336c240482841745/reddit_posts]`; one Minecraft mod was made with a
   no-code tool `[r:0e0e17c832cfab67/youtube_videos]`.
5. **Share or ship.** Mostly records with no friction: a game-jam weekend
   `[r:1f6a69bbb2ac5aaf/reddit_posts]` and finished mods on project pages
   `[r:01277e12f08703f3/scrape]` `[r:050d5a837ceea43d/scrape]`.
6. **Quit.** One video: two years of work earned too little to continue
   `[r:1e9c49db1c2fc5b9/youtube_videos]`. The "gave up" queries
   `[q:a5-c07]` `[q:a5-c09]` returned only off-topic posts, so the sample
   **cannot say why or where learners quit**.

## 4. Friction Map

Frequency = share of the 29 on-topic records that name the friction.
Severity = most common rating. "Tool removes it" follows addendum item 7:
**Yes** only when an official page offers the fix **and** learner records
about that tool are not mostly complaints. Full ids are in
`friction-map.csv`.

| Friction                              | Freq.    | Main in | Severity                    | Tool removes it? | Why                                                                                                                                                                                                                                    |
| ------------------------------------- | -------- | ------- | --------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool complexity                       | 13 (45%) | 9       | slows (10 slows, 3 blocker) | **Partial**      | No-code makers offer a fix for original games (GDevelop 8803cb; Rosebud e96b2e). Engine-choice threads recommend easy engines. Minecraft and Geometry Dash modding records stay blocked or partly solved.                              |
| Coding                                | 8 (28%)  | 6       | slows (5 slows, 3 blocker)  | **Partial**      | No-code or AI makers for original games. tModLoader and Fabric docs assume C# or Java. Creation Kit is said to need no programming `[r:0dd1a8fb1bde87d7/reddit_posts]`; Minecraft forum says learn Java `[r:6565f0a9e4a7630d/scrape]`. |
| Docs gaps                             | 7 (24%)  | 5       | slows (5 slows, 2 blocker)  | **Partial**      | Engines publish beginner paths (Unity, GameMaker, GDevelop, Construct, RPG Maker). Game-specific modding guides are reported as poor `[r:690354e1c68a0cbf/reddit_posts]`; Fabric points to trial and error.                            |
| Motivation                            | 3 (10%)  | 1       | slows                       | No               | No captured page addresses it; named in advice and quit videos.                                                                                                                                                                        |
| Scope                                 | 3 (10%)  | 0       | slows                       | Unknown          | Only a secondary friction; no page addresses it.                                                                                                                                                                                       |
| Cost                                  | 2 (7%)   | 1       | tie (1 blocker, 1 minor)    | Partial          | Free tiers cover tool cost (Godot, Unity Personal, GameMaker non-commercial, GDevelop free plan). The blocker case is unpaid time, which no tool fixes.                                                                                |
| Assets / art                          | 2 (7%)   | 0       | slows                       | Unknown          | Secondary friction in two beginner videos.                                                                                                                                                                                             |
| Setup                                 | 2 (7%)   | 2       | blocker                     | No               | Both are mod-kit installs still rated blockers; the BepInEx install is manual.                                                                                                                                                         |
| Licensing, community access, platform | 0        | 0       | —                           | Unknown          | Not named by any on-topic learner record. Licence terms for 7 tools are in section 2.                                                                                                                                                  |

**Split by goal.** Of the 11 original-game records, 6 name tool complexity
as the main friction (often "which engine"); none names setup. Of the 16
mod-existing records, the main frictions are coding 4, docs 4, tool
complexity 3, setup 2 and none 3. The barrier is lower where no-code makers
exist (original games) and higher in game-specific modding.

## 5. Learning Resources

- **Official paths** exist for 6 of 16 tools, with quotes in
  `tool-snapshots.csv`: Unity's guided tour, GameMaker's 8+ hours of video,
  GDevelop's first steps, Construct's Beginner filter, RPG Maker's tutorial
  series and Rosebud's first-game tutorial. The two modding guides captured
  (tModLoader, Fabric) start with code.
- **Community tutorials** are the main route for modders. Learners
  recommend a Skyrim tutorial maker `[r:236cb8a4fd411ef7/reddit_posts]`
  and a Minecraft tutorial channel that helped only partly
  `[r:0ce7d46030d34991/reddit_posts]`.
- **How learners rate them:** mixed. Complaints are that resources are hard
  to find `[r:19d612737835c36f/reddit_posts]`, guides are poor
  `[r:690354e1c68a0cbf/reddit_posts]`, and following tutorials blindly
  holds people back `[r:166ee42bc3ea4a43/youtube_videos]`. Praise: the
  learning curve is manageable `[r:2bd6abe113260b46/reddit_posts]`
  `[r:336c240482841745/reddit_posts]`, and starting with dialogue mods was
  easiest `[r:2f77f655574f3b9f/scrape]`.
- **Game jams** appear once, as a good first-ship experience
  `[r:1f6a69bbb2ac5aaf/reddit_posts]`.

## 6. Disconfirming Evidence

The Disconfirmer re-read every supporting record and searched for "tools
are already easy enough". Its findings that the lead confirmed against the
text were applied to the coding before any verdict (17 field changes, logged
in `work/corrections.json`):

- **Easy-enough evidence that holds:** Creation Kit needs no programming
  knowledge, per commenters `[r:0dd1a8fb1bde87d7/reddit_posts]`; Stardew
  Valley dialogue mods are an easy start with no art and no complex code
  `[r:2f77f655574f3b9f/scrape]`; a Stardew learning curve described as
  manageable `[r:2bd6abe113260b46/reddit_posts]`; a no-code Minecraft mod
  tool `[r:0e0e17c832cfab67/youtube_videos]` (a promotional video, so weak);
  a beginner video saying game dev is easier than it looks
  `[r:3d28aa4b0e92e4cb/youtube_videos]`.
- **Official claims:** no-code GDevelop, no-coding Rosebud, free Godot, and
  free tiers for Unity, GameMaker and GDevelop (section 2).
- **Six extra queries** `[q:a5-x01]`–`[q:a5-x06]` targeted gaps the frozen
  list could miss (no-code Minecraft makers, AI generators, free assets,
  "easier than you think"). They yielded 1 usable thread, about installing
  mods with a manager (player side, off-topic), and 1 blocked page.
- **Coding errors fixed (lead rule check):** 3 rows had H2 or H6 stances that did not follow
  their own skill or goal field; 2 had H10 "supports" while the main
  friction was motivation or cost; 1 had H2 "supports" with skill unclear.
- **What it means:** easy paths exist (no-code makers for games; some
  game-specific mod tools such as Creation Kit and Content Patcher). Learners
  still mostly name barriers, so tools reduce the barrier but do not remove
  it, and least of all in code-first modding kits.

## 7. Verdicts

Minimum (`01` §1.2): at least 20 on-topic coded records from at least 3
platforms and at least 2 source types. Phase 5's on-topic records come from
Reddit, YouTube, forums and 3 re-coded Phase 2 pages: 2 mod project pages
(type d: Thunderstore, ModDB) and 1 news page (type e: Nexus Mods), counted
once. **All supporting records for every hypothesis are type (b).** The
type (d)/(e) records are contradicts or neutral.

| Hypothesis  | On-topic | Supports | Contradicts | Neutral | Platforms | Source types | Minimum met? | Verdict                     |
| ----------- | -------- | -------- | ----------- | ------- | --------- | ------------ | ------------ | --------------------------- |
| H2          | 29       | 19 (66%) | 7 (24%)     | 3       | 6         | b, d, e      | Yes          | **Supported** (low)         |
| H5          | 22       | 14 (64%) | 3 (14%)     | 5       | 3         | b            | No           | **Unproven, leans support** |
| H6          | 29       | 11 (38%) | 16 (55%)    | 2       | 6         | b, d, e      | Yes          | **Unproven, leans no**      |
| H10 creator | 29       | 12 (41%) | 8 (28%)     | 9       | 6         | b, d, e      | Yes          | **Partially supported**     |

### H2 — Supported (for learners). Confidence: low.

- **Rule result: Supported** (66% support, 24% contradict; §1.2 needs
  ≥ 60% and < 25%, and the row's "most records" test is met). The draft
  reported it one level lower; the Verifier found no §1.2 rule allowing
  that, so the rule result stands (section 8).
- **Why confidence is low:** contradict sits 1 record under the 25% line.
  6 queries name skill in the query text (`a5-c03`, `a5-c04`, `a5-c15`,
  `a5-c16`, `a5-y06`, `a5-y07`); without their records, 12 of 21 support
  (57%) and 7 contradict (33%), which would be Partially supported. The
  sample is of learners, so low skill is expected, and every supporting
  record is type (b). The verdict covers learners, not all creators.
- **Segment:** low skill holds for people asking how to start (help-seeking
  8 support vs 2 contradict). Video makers and finished-project pages lean
  programmer (YouTube 3 contradict of 7; project pages 2 of 3).
- Phase 3 had H2 Unproven and balanced (18 records). Phase 5 moves it up
  for learners only.

### H5 — Unproven, leans support. Confidence: low.

- 22 beginner records: 14 say they do not know where to start or that tools
  are too hard, and 3 say tools or tutorials were enough.
- The lean is not just from help-seeking queries: showcase-direction
  records split 4 support, 0 contradict, 2 neutral.
- The verdict is Unproven because all beginner records are one source type
  (b). This is the same as Phase 3.

### H6 — Unproven, leans no. Confidence: low.

- 16 of 29 want to mod an existing game (55%) and 11 want to make an
  original game (38%). The support test needs ≥ 40% or more originals than
  mods; the contradiction test needs ≥ 75% mods. Neither is met.
- **Query artefact:** goal follows the query wording almost exactly.
  Modding queries return mod-existing records, and game-engine queries
  return original-game ones. The share mostly reflects query design.
- This matches Phase 3 (59% mod-existing, leans no).

### H10 (creator side) — Partially supported. Confidence: low.

- Support leads: 41% vs 28% (the rule needs ≥ 40% and above the contradict
  share). The row's support test is met: of 24 records with a main
  friction, 22 name a barrier type (tool complexity 9, coding 6, docs 5,
  setup 2).
- Not Supported, because many barrier records also say a tool or tutorial
  partly solved it (coded neutral), and 8 records say tools were easy
  enough or put the problem elsewhere.
- Help-seeking (4/3/3) and showcase (3/2/2) records split about the same,
  so the lead is not only a help-seeking artefact.
- Phase 4 (player side) was Unproven and balanced. Creation looks more
  barrier-bound than playing, but only in type (b) records.

## 8. Verifier Report

A fresh Verifier (`owl`, no prior context) re-checked the draft against the
records, the derived CSVs, the ledger and protocol §1.2–1.3 on 2026-10-03.

| Check                                                                | Outcome                                                                                                   |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Friction shares (45%, 28%, 24%), 17 of 29 early-stage, 1 quit record | Confirm                                                                                                   |
| H2, H5, H6, H10 counts and percentages (section 7)                   | Confirm                                                                                                   |
| Snapshot quotes and record citations (spot checks)                   | Confirm                                                                                                   |
| Spend $0.36 of $0.40, 29 ledger entries, 0 open reservations         | Confirm                                                                                                   |
| No handles, usernames or URLs in derived CSVs or this file           | Confirm                                                                                                   |
| H5 Unproven (one source type), H6 Unproven, H10 Partially supported  | Confirm                                                                                                   |
| H2 reported as Partially supported                                   | **Downgrade rejected → changed to Supported (low)**: §1.2 gives Supported and has no rule for going lower |
| H10 coding of 3d28aa4b0e92e4cb (contradicts with a barrier friction) | Judgement call, kept: the video says game dev only looks hard ("tools easy enough")                       |

Applied: H2 verdict changed in the Bottom Line and section 7. No claims
were dropped. The lead's own checks before the Verifier ran: every learner
and snapshot quote found in the stored text, and `check-derived.mjs` 0
findings. One source-index host whose name matches a channel name was
masked as `[handle]`, and the same tool is labelled generically in the
coding.

## 9. Run Log And Spend

**Spend: $0.36 of the $0.40 Phase 5 allocation** (ledger estimate, 29
batches, 0 open reservations). The ledger was not hand-edited.

| Work                                             | Items                                                                                                                     | Ledger    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | --------- |
| Lookup searches `a5-l01`–`a5-l17`                | 17 ok (3 after one retry)                                                                                                 | $0.00     |
| Official scrapes (incl. 2nd-round forum retries) | 26 pages (25 planned + 1 replacement); 22 ok, 19 usable; 4 still blocked (Unreal docs, Roblox 2, Fabric usage guidelines) | $0.11     |
| Learner searches `a5-c*`, `a5-y*`, `a5-d*`       | 32 run; 31 ok, `a5-c11` blocked after 2 retries (listed as unrun)                                                         | $0.04     |
| Disconfirmer searches `a5-x01`–`a5-x06`          | 6 ok (1 after retry)                                                                                                      | $0.00     |
| `reddit_posts`                                   | 28 of quota 30 (only 28 eligible across the query cap), all ok                                                            | $0.15     |
| `youtube_videos`                                 | 8 of quota 10 (8 queries, 1 per query), all ok                                                                            | $0.04     |
| Forum scrapes                                    | 6 frozen + 2 extra; 4 usable                                                                                              | $0.02     |
| **Total**                                        |                                                                                                                           | **$0.36** |

- Fetch rates (`fetch-rates.csv`): `reddit_posts` 28/28 ok, `youtube_videos`
  8/8 ok, `scrape` 28 ok of 34 items (82%), all failures `brd_error`.
- Sample (`plans/sample-manifest.json`): Reddit 123 eligible, 28 chosen;
  YouTube 57 eligible, 8 chosen; forum 13 eligible, 6 chosen. Chosen by
  record-id order, round-robin across queries; titles and snippets were
  never read.
- The sample was regenerated once after 7 blocked searches were retried.
  The superseded plans are kept in `plans/superseded/`.
- **Deviations from the addendum (logged):** Roblox, Unreal docs and
  Fabric usage pages got a third scrape round (addendum: 2), with no other
  effect. The sampling rule for the Disconfirmer's `a5-x*` results (thread
  pages only, 1 per query, quota 4, kept apart from the frozen forum
  sample) was set when those queries were added, before they ran. It is
  recorded in `phase5-queries.json` and tested in `sample-creator.test.mjs`.
- Coding: 47 learner rows (42 usable, 29 on-topic); 16 tool rows. Analyst
  quotes that were not found verbatim were sent back and re-coded before
  use.
