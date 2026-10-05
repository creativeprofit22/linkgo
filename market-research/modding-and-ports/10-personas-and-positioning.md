# 10 — Personas And Positioning

Status: **complete — Verifier drops applied (§7).** Built from evidence only; every
number below comes from a stored file in `data/derived/10-personas/`.

| Field       | Value                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Phase       | 10 of 11                                                                                       |
| Hypotheses  | H10 barriers are the main problem, H11 gap beside incumbents; play hub vs creator tools        |
| Bright Data | Gap-fill: 31 searches (+4 Disconfirmer), 9 `reddit_posts`, 2 `youtube_comments`; $0.215 booked |
| Team        | 1 Collector (`bee`), 1 Analyst (`owl`), 1 Disconfirmer (`owl`), 1 Verifier (`owl`)             |
| Rules       | `01-research-protocol.md` §10, Phase 10 pre-registration addendum (fixed before any request)   |
| Raw data    | `data/raw/10-personas/` (git-ignored)                                                          |

## Bottom Line

- **Three personas built** (mod player, beginner mod creator, PC-port
  player). The fan-game segment is **not built**: 13 records, under the
  15-record bar. Many fields rest on one platform (Reddit), and the mod
  player persona leans on this phase's 11 gap-fill records (20 of its 27
  evidence rows).
- **H10 — Partially supported** on both sides (players 26 of 63 support, 22
  contradict; creators 25 of 59 support, 18 contradict). Barriers are a real,
  common complaint, but many people also say setup is easy once learned.
- **H11 — Partially supported overall, Unproven per side.** Pooled 24 of 59
  support, 11 contradict, but the player side drops to Unproven without this
  phase's records, and the creator side is below the minimum without them.
- **Play hub vs creator tools: the evidence does not choose.** The hub is
  ahead on size only; tools are ahead on competition and legal risk (one row
  Low confidence); three rows are even.
- **"Democratizing modding": the idea fits, the word does not.** The
  pre-registered mechanical count says "phrase fits" (10.3% of records use
  the phrase or a synonym), but a context check finds only 3 of 223 records
  (1.3%) where the audience uses that wording in the right sense, and none
  saying "democratize". Ease words appear in 53.8% of records. Nexus Mods,
  the market leader, already says "Modding should be for everyone" on its own
  About page.

---

## 1. Persona Set

**Inclusion** (addendum item 3; mapping fixed before gap-fill coding):

| Segment                      | On-topic records | Platforms (largest)                 | Phases                     | Result                                                      |
| ---------------------------- | ---------------- | ----------------------------------- | -------------------------- | ----------------------------------------------------------- |
| S1 mod players               | 109              | 20 (reddit 60, youtube 14, forum 7) | 02, 03, 04, 08, 10 (7)     | Built                                                       |
| S2 beginner mod creators     | 117              | 19 (reddit 55, youtube 19, forum 8) | 02, 03, 04, 05, 08, 10 (2) | Built                                                       |
| S3 PC-port players           | 23               | 6 (reddit 8, youtube 8, forum 3)    | 02, 06                     | Built                                                       |
| S4 fan-game makers / players | 13               | 5 (web 9)                           | 02, 07                     | **Not built — evidence too thin**; legally constrained (07) |

Counts: `data/raw/10-personas/work/segment-counts.mjs` (one count per record
id per segment; platform labels as coded in each phase).

Rules applied: each field cites ≥ 2 records; **thin** = 1 record; **one
platform** = ≥ 2 records but all from one platform. Personality and emotion
come only from people's own words. Ages: no person's age is used; the only
age figure is 03's aggregate (Nexus 2015 site survey: 22% aged 17 or under,
40% aged 18–24; one self-selected source, 11 years old). Record ids are
shortened to 6 characters; full ids, quotes and platforms are in
`persona-evidence.csv`. Each "best offer" is **Planned (hypothesis)**, not a
finding.

### S1 — Mod player

| Field             | Claim                                                                                                           | Evidence                                            | Strength     |
| ----------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------ |
| Snapshot          | Plays modded games; experienced players trim mod lists to avoid conflicts; newcomers ask whether to mod at all. | `043b7c` reddit; `11619f` reddit; `4fce9d` reddit   | one platform |
| Personality       | Persistent; self-deprecating about slow learning; once setup clicks, judges it manageable.                      | `068d48` reddit; `13b54a` reddit                    | one platform |
| Emotional state   | From exhausted by an unstable mod list to relieved and grateful once setup works.                               | `068d48` reddit; `2cbf2f` reddit; `161430` youtube  | ok           |
| Core worry        | Keeping a mod list stable; the main hub's health as creators leave; dependency downloads.                       | `124f46` reddit; `2cbf2f` reddit; `4db166` facebook | ok           |
| Jobs to be done   | Get mods downloaded, installed and working; some find this easy once learned, others hit download failures.     | `068d48` reddit; `06f620` forum                     | ok           |
| Triggers          | Starting a game and asking whether to mod; creators leaving the main hub; a manager pulling unwanted mods.      | `124f46` reddit; `11619f` reddit; `01f8f2` reddit   | one platform |
| Objections        | Too many install steps; downloads failing; trouble reaching the hub.                                            | `124f46` reddit; `00d75e` reddit; `226b4e` reddit   | one platform |
| Decision criteria | Stability and knowing what they are doing; some trade mod count for fewer conflicts.                            | `043b7c` reddit; `068d48` reddit; `08238e` youtube  | ok           |

**Voice** (verbatim, ≤ 15 words):

- "I use a lot less mods and hardly use additions" `043b7c` reddit
- "It was hard at first, to be honest, but I was able to learn." `068d48` reddit
- "I'm exhausted. I can't figure out how to solve my problem." `2cbf2f` reddit
- "I'm seeing more and more mod creators leaving NexusMods" `124f46` reddit
- "Thank you Sir , now I can enjoy mod ." `161430` youtube

**Best offer — Planned (hypothesis):** help keeping a mod list stable
(conflict and dependency help) with fewer install steps. Answers: core worry,
objections, jobs to be done.

### S2 — Beginner mod creator

| Field             | Claim                                                                                                    | Evidence                                          | Strength     |
| ----------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------ |
| Snapshot          | Beginners with no coding or 3D skills asking where to start (Minecraft mods, first games).               | `0b237a` reddit; `16b21c` reddit; `2a2feb` reddit | one platform |
| Personality       | Idea-driven; some enjoy learning and overcoming barriers, others want someone else to build their ideas. | `27fa0f` reddit; `2230ed` facebook                | ok           |
| Emotional state   | Daunted at the start.                                                                                    | `13a99c` reddit                                   | thin         |
| Core worry        | A steep learning curve and finding resources to learn from.                                              | `13a99c` reddit; `19d612` reddit                  | one platform |
| Jobs to be done   | Pick a tool or engine, find a place to start learning, and finish things.                                | `048507` reddit; `236cb8` reddit; `27fa0f` reddit | one platform |
| Triggers          | Having a specific mod idea.                                                                              | `28f044` tiktok; `4f9d55` reddit                  | ok           |
| Objections        | Steep curve; slow official tools; scarce learning resources; code required (Java for Minecraft).         | `13a99c` reddit; `19d612` reddit; `6565f0` forum  | ok           |
| Decision criteria | Keeps going when learning itself is rewarding (enjoyment, a good first game jam).                        | `27fa0f` reddit; `1f6a69` reddit                  | one platform |

**Voice** (verbatim, ≤ 15 words):

- "initial learning curve is going to be pretty sharp" `13a99c` reddit
- "I have zero coding experience, no 3D modeling skills" `0b237a` reddit
- "I do it because I enjoy spending my time learning, making content, overcoming barriers" `27fa0f` reddit

**Best offer — Planned (hypothesis):** a guided first-mod path needing
little or no code, with curated tutorials. Answers: objections, core worry,
jobs to be done. Phase 05 found no-code paths only for original games, not
for mods.

### S3 — PC-port player

| Field             | Claim                                                                                                      | Evidence                                            | Strength     |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------ |
| Snapshot          | Players asking for or praising PC ports of older console and mobile games; some prefer ports to emulators. | `072460` reddit; `136842` reddit; `15b0ba` reddit   | one platform |
| Personality       | Enthusiastic about native ports and long-awaited fan milestones.                                           | `15b0ba` reddit; `095d38` forum                     | ok           |
| Emotional state   | Excited when ports arrive; wishful when none exists.                                                       | `231d7a` reddit; `00e622` youtube; `04cca4` youtube | ok           |
| Core worry        | Favourite games are not playable on PC.                                                                    | `231d7a` reddit; `28f044` tiktok                    | ok           |
| Jobs to be done   | Play older games natively on PC; follow decompilation progress; get a port running.                        | `072460` reddit; `03163c` youtube; `5ccff4` forum   | ok           |
| Triggers          | A wanted game with no PC port.                                                                             | `019dfe` gamebanana; `231d7a` reddit                | ok           |
| Objections        | Getting a port working on a modern PC; confusing port terms (decompilation vs recompilation).              | `072460` reddit; `32f5eb` reddit                    | one platform |
| Decision criteria | Native PC ports over emulation; extras such as HD textures.                                                | `36f4be` youtube; `05e05c` youtube                  | one platform |

**Voice** (verbatim, ≤ 15 words):

- "native PC ports are amazing, better than emulators for a few reasons" `15b0ba` reddit
- "I wish there was a PC port so we, fans, could play it on PC." `231d7a` reddit
- "every single game you're watching in this video, you can play on your PC today" `04cca4` youtube

**Best offer — Planned (hypothesis):** port discovery with setup guides.
Answers: jobs to be done, objections. Hosting ports carries High legal risk
(07); this offer would have to link out, not host.

**How the personas were checked.** The Analyst's draft was checked
mechanically (`work/check-personas.mjs`): every quote must appear verbatim in
the stored record and be ≤ 15 words with no handle or link. Of 80 draft rows,
73 remain. 16 quotes failed the verbatim or length test and were cleared. 5
malformed record ids were repaired from their verbatim quote. 2 rows were
dropped because the cited id is not a stored record of that segment. The
lead dropped 5 more because the record did not show the claim. Claims were
cut back to what the records say: for example, "legality uncertainty" was
removed from the S3 core worry because no cited record said it. Earlier, in
the gap-fill coding, 10 of the Analyst's quotes were not verbatim and were
replaced with the exact text. The full log is in `work/persona-check.csv`.

## 2. Play Hub vs Creator Tools

Rule (addendum item 7): a lean may be stated only if one direction is ahead
on ≥ 4 of 6 rows and no row is against it with Medium or higher confidence.

| Row            | Play hub                                                                                                                           | Creator tools                                                                                                     | Ahead   | Confidence |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------- | ---------- |
| Who it serves  | S1 mod players (base ≈ 25.0M) plus S3 PC-port players (≈ 54k)                                                                      | S2 beginner mod creators (≈ 365k); S2 and S3 mostly overlap S1                                                    | neither | Medium     |
| Friction (H10) | Players: Partially supported, 26 of 63 support, 22 contradict                                                                      | Creators: Partially supported, 25 of 59 support, 18 contradict                                                    | neither | Medium     |
| Gap (H11)      | Players: Unproven, leans yes (19 of 48 without Phase 10); 04 found 2 of 62 switches among incumbents                               | Creators: Unproven, leans yes (without Phase 10: 18 records, below minimum)                                       | neither | Low        |
| Competition    | 8 incumbent hubs, most with one-click or subscribe installs (5 confirmed); Nexus and CurseForge each report $18m+ paid to creators | Mod kits assume code (tModLoader C#, Fabric Java, BepInEx by hand); no-code engines exist only for original games | tools   | Medium     |
| Legal risk     | 07: High overall for a hub hosting fan games, ports and mods                                                                       | Not assessed directly; a tool that hosts nothing avoids hosting risks, but minors and users' IP use still apply   | tools   | Low        |
| Size (09 base) | S1 TAM $9.10M / SAM $3.19M / SOM $31.9k; S3 TAM $19.6k / SOM $68                                                                   | S2 TAM $133k / SAM $26.6k / SOM $266                                                                              | hub     | Medium     |

**Result: the evidence does not choose.** Hub ahead on 1 row, tools on 2,
neither on 3. Neither direction reaches 4 rows, and each has a Medium row
against it (size against tools; competition against the hub). Lead changes
to the Analyst's draft: "who it serves" set to neither so reach is not
counted twice with size; "competition" reversed from hub to tools, because a
crowded incumbent field counts against entering it. All SOMs are small
(09).

## 3. Positioning Test: "Democratizing Modding"

**Audience side** (`count-terms.mjs`, frozen terms; 223 on-topic records
with a stored reading copy, phases 2–10, none missing):

| Family                                                      | Records | Share |
| ----------------------------------------------------------- | ------- | ----- |
| Phrase `democratiz*`                                        | 2       | 0.9%  |
| Synonyms ("for everyone", "anyone can", "accessible")       | 22      | 9.9%  |
| Phrase + synonyms                                           | 23      | 10.3% |
| Need terms (easy, simple, beginner, too hard, confusing, …) | 120     | 53.8% |

- **Pre-registered mechanical outcome: "phrase fits"** (phrase + synonyms ≥
  5%). Unchanged without Phase 10 records (23 of 214, 10.7%).
- **Context check (lead, `positioning-context.csv`):** of the 23 records, 16
  use the words in an unrelated sense ("not for everyone", "anyone can help",
  "accessible only through"), 2 are borderline, 2 are other voices (a game
  company's statement, a research paper), and **3 are the audience using the
  wording about modding** (1.3%). Neither `democratiz*` record is the
  audience talking about modding: one is a video presenter, one a cited
  paper title.
- **Post-hoc, disclosed:** need terms within 60 characters of a modding word
  appear in 82 of 223 records (36.8%), still above the 25% concept bar.
- **Reading:** the mechanical rule says the wording fits, but that result is
  driven by everyday uses of common words. The **concept** (ease, a way in
  for beginners) clearly fits; the **wording** "democratizing" is almost
  absent from the audience's own language. Both are reported; the mechanical
  outcome is not overridden.

**Competitor side** (`competitor-claims.csv`; 20 user-content hits dropped;
24 organisation-domain hits judged):

| Organisation (own domain)  | Wording                                                                | Source                     | Counts?    |
| -------------------------- | ---------------------------------------------------------------------- | -------------------------- | ---------- |
| Nexus Mods                 | "Modding should be for everyone"; "make modding simple and accessible" | Stored page (09) + snippet | Yes, fully |
| mod.io                     | "Easily accessible UGC & mods for all your players" (aimed at studios) | Snippet only               | Flagged    |
| A small mod-tool developer | "anyone can make mods" (one game)                                      | Snippet only               | Flagged    |
| CurseForge (Sims 4 hub)    | "for everyone" (snippet cut before the subject)                        | Snippet only               | Unclear    |

Also seen, but not on the organisation's own domain: a node-based modding
tool's Steam store page uses "democratizing modding"; a press release for a
multiplayer-modding sandbox says "designed to democratize"; a small GitHub
tool says "makes modding for everyone". Six stored-page hits are legal or UI
boilerplate ("accessible via our site").

- **"Already claimed" (≥ 2 organisations' own pages): not met on stored
  pages** (1: Nexus Mods). With snippets it would be met (Nexus, mod.io, one
  small tool), so it is flagged rather than counted.
- **Reading:** the exact phrase is used only by small tools and one press
  release. The broader idea, "modding for everyone", is already the market
  leader's own stated mission, so it would not set a newcomer apart.

## 4. Messages To Avoid

Per addendum item 10:

| Avoid                                                            | Why                                                                                                             |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| "Modding for everyone" / "democratizing modding" as the headline | The audience barely uses the wording; Nexus Mods already says "Modding should be for everyone" (§3)             |
| "Players are switching / unhappy with Nexus, CurseForge…"        | H11 Unproven per side; 2 of 62 switches in 04                                                                   |
| "Modding is too hard" as a blanket claim                         | H10 only Partially supported; many records say setup is easy once learned                                       |
| Teen or "15–21" targeting                                        | H1 Unproven; 22% of one survey's users were 17 or under; minors' data risk (07 R6)                              |
| "Host your fan game / port here"                                 | Legal risk High (07); fan-game segment not built                                                                |
| Rust rebuilds as a draw for players                              | H9 Contradicted (06)                                                                                            |
| "Better than <named hub>" comparisons                            | No stored head-to-head evidence                                                                                 |
| "No coding needed" for making mods                               | 05: no-code paths found for original games only, not mods; H2 Unproven in 03 (05 moves it up for learners only) |

## 5. Disconfirming Evidence

The Disconfirmer (`owl`) red-teamed each conclusion. What it found, and what
changed:

| Challenge                                                                        | Outcome                                                                                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| The context check must not override the pre-registered mechanical outcome        | Accepted: §3 reports both, mechanical outcome stated first and unchanged                                    |
| mod.io counts only as a snippet, so "already claimed" is not met on stored pages | Accepted: §3 says not met on stored pages (1), flagged with snippets                                        |
| Many persona fields rest on Reddit only                                          | Accepted: each field now carries a "one platform" or "thin" label; 13 of 24 fields are one platform or thin |
| S3 "legality uncertainty" had no cited record                                    | Accepted: removed from the S3 core worry                                                                    |
| Play hub vs creator tools: "the evidence does not choose"                        | Confirmed by the Disconfirmer                                                                               |
| Best offers have no record rows                                                  | Not changed: the protocol labels them Planned (hypothesis) with the needs they answer                       |

**Disconfirmer searches** (`p10-x01`…`x04`, search snippets only, 3 of 4
returned; `p10-x02`, a second incumbent claiming "for everyone", failed with
a proxy error and was not retried under the spend rule):

- `x01` (does the audience say "modding for everyone"?): 2 results; one
  user calls a tool's "ease of modding for everyone" cool, one uses the words
  in an unrelated sense. Does not change §3.
- `x03` (do beginners find modding easy?): mixed. One reply says modding is
  easier than making a game; a forum post says modding was harder than
  expected; an interview says it is simpler than it seems. Consistent with
  H10 Partially supported.
- `x04` (do port players worry about legality?): results are commenters and
  lawyers debating whether ports and decompilations are legal. This shows
  the topic is discussed, but not that S3 players hold it as a core worry,
  so it stays out of the persona.

## 6. Verdicts

Pooled under addendum item 6 (`pool-verdicts.mjs`, `h10-h11-pool.csv`):
records from 02, 04, 05 and the Phase 10 gap-fill, one stance per record, no
clashes across phases. The §1.2 minimum is met for every scope except H11
creator without Phase 10.

| Hypothesis | Scope   | With Phase 10 (sup / con / neu of n) | Without Phase 10                | Verdict                                     |
| ---------- | ------- | ------------------------------------ | ------------------------------- | ------------------------------------------- |
| H10        | All     | 49 / 32 / 25 of 106                  | 47 / 30 / 20 of 97              | **Partially supported**                     |
| H10        | Player  | 26 / 22 / 15 of 63                   | 25 / 20 / 11 of 56              | **Partially supported**                     |
| H10        | Creator | 25 / 18 / 16 of 59                   | 24 / 18 / 14 of 56              | **Partially supported**                     |
| H11        | All     | 24 / 11 / 24 of 59                   | 23 / 11 / 21 of 55              | **Partially supported**                     |
| H11        | Player  | 20 / 10 / 20 of 50                   | 19 / 10 / 19 of 48              | **Unproven, leans yes** (without-10 stands) |
| H11        | Creator | 10 / 4 / 7 of 21                     | 9 / 4 / 5 of 18 (below minimum) | **Unproven, leans yes**                     |

- **H10, Partially supported, confidence Medium.** Barriers (setup, conflicts,
  learning curve) are named by about 4 in 10 on-topic records on each side,
  but about 3 in 10 say current tools are fine or the problem lies elsewhere.
  This updates 04's player-side "Unproven, balanced" (one phase) by pooling
  02, 04, 05 and 10. Phase 05 rated the creator side low confidence.
- **H11, Partially supported overall, confidence Low.** Unmet needs are
  stated more often than satisfaction, but neither side holds up on its own
  without this phase's targeted records, and 04 found the one concrete gap
  ("installs break across hubs") rather than reasons to switch.
- The §1.3 row tests were not met beyond Partial for either hypothesis (for
  H11, support needs stated reasons to switch, not just complaints).

## 7. Verifier Report

A fresh `owl` Verifier, not told the hoped-for answer, checked the draft in
two turns against the derived files, raw records, ledger and earlier phase
files.

| #   | Claim                                                               | Verdict   | Applied                                                               |
| --- | ------------------------------------------------------------------- | --------- | --------------------------------------------------------------------- |
| 1   | Inclusion: S1 116 records                                           | **Drop**  | Corrected to 109 (segment-records.csv); table rebuilt from the script |
| 2   | Inclusion: S2 119 records                                           | **Drop**  | Corrected to 117; platform and phase columns also rebuilt             |
| 3   | S3 23, S4 13 (not built)                                            | Confirmed | —                                                                     |
| 4   | S1 voice quotes verbatim, ≤ 15 words, nothing identifying           | Confirmed | —                                                                     |
| 5   | H10 Partially supported; with/without Phase 10 the same             | Confirmed | —                                                                     |
| 6   | H11 per-side sensitivity rule (without-10 verdict stands)           | Confirmed | —                                                                     |
| 7   | Mechanical outcome "phrase fits" (rules checked in order)           | Confirmed | —                                                                     |
| 8   | "Already claimed" not met on stored pages (only Nexus Mods)         | Confirmed | Steam Workshop and itch.io hits checked: boilerplate                  |
| 9   | Play vs create: hub 1, tools 2, neither 3 → does not choose         | Confirmed | —                                                                     |
| 10  | 09 TAM/SAM/SOM for S1, S2, S3                                       | Confirmed | —                                                                     |
| 11  | 04 "2 of 62" switches; "$18m+" payouts                              | Confirmed | —                                                                     |
| 12  | §4 cited verdicts (H1, H2 in 03; H9 in 06; 05 no-code; 07 High, R6) | Confirmed | —                                                                     |
| 13  | §8 spend $0.215 and batch counts                                    | Confirmed | —                                                                     |
| 14  | positioning-context.csv spot checks (`034960`, `0cb0a8`)            | Confirmed | —                                                                     |

**Limits of this check.** The Verifier spot-checked only 2 context rows (8
were asked for). It said every persona citation was verified but returned no
row-by-row results. So the persona field rows rest on the lead's own record
review: 5 rows dropped, all claims cut back to what the cited records say (see
"How the personas were checked" in §1). The mechanical check also covers
them: every quote is verbatim, ≤ 15 words and free of handles or links.
Both Drops are applied above. No other claim changed, so no script was
re-run for the Verifier's findings.

After verification, the free `readiness` meter moved from $3.16 to $3.17.
That is the Disconfirmer searches, which the ledger booked at $0.00 because
of meter lag. Phase 10's true spend is therefore about $0.225, still within
the $0.24 allowance. The ledger was not edited by hand.

## 8. Run Log And Spend

| Batch                 | Run | Ok  | Failed                                            | Booked            |
| --------------------- | --- | --- | ------------------------------------------------- | ----------------- |
| Searches (24 frozen)  | 24  | 17  | 7 (redirect rejected; retried once, all ok)       | $0.04             |
| Search retry          | 7   | 7   | 0                                                 | $0.01             |
| `reddit_posts`        | 9   | 9   | 0 (3 of 12 not run: spend ceiling, not topped up) | $0.065            |
| `youtube_comments`    | 2   | 2   | 0 (10 comments each)                              | $0.10             |
| Disconfirmer searches | 4   | 3   | 1 (proxy error, not retried)                      | $0.00 (meter lag) |

- **Phase 10 booked $0.215 of the $0.24 allowance.** Group `phases-09-11`:
  $0.425 of $0.63 ($0.205 left for Phase 11). Study: $5.655 of $6.19. No
  open reservations. The Disconfirmer searches (≤ $0.01) were not yet on the
  zone meter when settled.
- Budget: owner decision 2026-10-04 raised the study cap $6.04 → $6.19 and
  the group $0.48 → $0.63 so a $0.25 pipeline hold could fit.
- Sampling: 475 already-stored ids excluded; Reddit 81 eligible, 12
  selected, 9 stored; YouTube 47 eligible, 2 selected and stored. Two
  gap-fill records were off-topic, so 9 were coded on-topic.
- Gap-fill coding: Analyst codes, with 3 lead segment corrections (two
  posts by players building mod lists, recoded from creator to player;
  one record given a single segment), each noted in `gapfill-coding.csv`.
- Derived files (`data/derived/10-personas/`): `query-log.csv`,
  `gapfill-coding.csv`, `persona-evidence.csv`, `h10-h11-pool.csv`,
  `positioning-terms.csv`, `positioning-context.csv`,
  `competitor-claims.csv`, `play-vs-create.csv`.
- Scripts: `scripts/sample-personas.mjs`, `count-terms.mjs`,
  `pool-verdicts.mjs` (with tests); lead helpers in
  `data/raw/10-personas/work/`. Collector log:
  `data/raw/10-personas/collector-log.md`.
- Deviations: the first Collector turn hit its time limit while the Reddit
  runner kept going; the runner settled the batch itself, with nothing
  settled by hand.
