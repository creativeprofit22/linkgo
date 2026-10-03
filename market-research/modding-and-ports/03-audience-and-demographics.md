# 03 — Audience And Demographics

Status: **complete, verified (2026-10-03).** Market research
only; no Linkgo app code. Verdicts follow `01` sections 1.2–1.3 literally.

| Field       | Value                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| Phase       | 3 of 11                                                                                                       |
| Hypotheses  | H1 age 15–21, H2 low coding skill, H3 players vs creators, H4 ideas, H5 learning curve, H6 own game           |
| Bright Data | `search` for surveys and platform statements; `reddit_posts`, `youtube_comments`, `tiktok_comments` pipelines |
| Team        | 2 Collectors (`bee`), 2 Analysts (`owl`), 1 Disconfirmer (`owl`), 1 Verifier (`owl`)                          |
| Depends on  | Phases 1–2                                                                                                    |
| Raw data    | `data/raw/03-audience/`                                                                                       |

Privacy: self-described ages are counted in aggregate only. No handles, no
profiles, no individual targeting.

---

## 1. Pre-Registered Criteria (Copied From Phase 1)

Copied from `01-research-protocol.md` sections 1.2–1.3 (registered
2026-10-02). **Unchanged.** The only additions are the Phase 3 clarifications
below, registered on 2026-10-03 before any Phase 3 request (`01` section 10).

**Minimum for any verdict other than Unproven:** at least 20 on-topic coded
records from at least 3 platforms and at least 2 source types. Supported needs
≥ 60% of on-topic records to support and < 25% to contradict. Contradicted is
the mirror image. Partially supported means support holds for one segment or
sub-claim only, or support leads (≥ 40% and above the contradict share).
Otherwise the verdict is Unproven, with the lean recorded.

| ID  | Support test                                                                                                                  | Contradiction test                                                                                            | Stays Unproven when                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| H1  | ≥ 2 independent surveys or official platform statistics place the median or modal age of modders/port players in 15–21.       | ≥ 2 independent surveys or official statistics place the median at 22+ or the majority outside 15–21.         | Fewer than 2 such sources. Self-stated ages in posts (≥ 30 needed) are colour only, never decisive. |
| H2  | Most on-topic creator-side records describe little or no prior coding experience.                                             | Most on-topic creator-side records show prior programming skill or professional development work.             | Skill cannot be inferred from most records.                                                         |
| H3  | A clear share of records (≥ 30% of on-topic records) come from people who only want to play, **and** they report unmet needs. | Play-only users report being well served (install and discovery praised), or play-only records are under 10%. | The play/create split cannot be read from the records.                                              |
| H4  | Idea and request posts are common in the deep sample (≥ 25% of on-topic creator-side records).                                | Idea and request posts are under 10%, or "no ideas" posts outnumber them.                                     | Fewer than 20 creator-side records.                                                                 |
| H5  | Most beginner records describe not knowing where to start or the tools as too hard.                                           | Most beginner records describe tutorials and tools as sufficient or easy.                                     | Fewer than 20 beginner records.                                                                     |
| H6  | Records wanting to make an original game outnumber those wanting to mod an existing game, or reach ≥ 40%.                     | Records wanting to mod existing games make up ≥ 75% of on-topic creator-side records.                         | The goal cannot be read from most records.                                                          |

**Phase 3 clarifications (pre-registered 2026-10-03):**

1. **Allocation:** at most $0.70 of the `phases-03-08` group ($2.43);
   raised to **$1.00** on 2026-10-03 by owner decision, after $0.13 was spent
   and before any pipeline run (logged in `01` section 10).
2. **Record unit:** one page, post, video or comment set = one coded record.
   Self-stated ages are counted per distinct commenter and stored only as
   bucket counts (≤14, 15–17, 18–21, 22–29, 30+, unclear).
3. **H1 eligibility:** only sources whose population is modders, mod users,
   fan-game makers or port players count toward H1. General gamer or creator
   surveys (ESA, Roblox, Scratch) are "adjacent population" context and cannot
   meet the H1 test. Independent means different publisher **and** different
   sample.
4. **Phase 2 reuse:** Phase 2 deep-sample records may be re-coded fresh and
   counted once, cited by their Phase 2 record ids.
5. **Minors rule:** an author who states an age under 18 is paraphrased only,
   never quoted. No handles, profile links or usernames in derived files or
   here.
6. **Frozen query list:** `scripts/config/phase3-queries.json` (`a3-s*`
   surveys, `a3-c*` community), balanced in both directions.
7. **Sampling:** on-site results only, ordered by URL hash, round-robin across
   queries (≤ 3 per query); quotas 30 Reddit posts, 5 YouTube videos × 12
   comments, 3 TikTok videos. Survey pages (≤ 15) are picked by Analyst A1
   under a written rule, with every pick and reject logged.

---

## 2. Bottom Line

| ID  | Hypothesis (short)                         | Verdict                  | On-topic n | Supports | Contradicts | Neutral | Platforms | Types |
| --- | ------------------------------------------ | ------------------------ | ---------- | -------- | ----------- | ------- | --------- | ----- |
| H1  | Modders are mostly aged 15–21              | **Unproven**             | 2 eligible | 0        | 1           | 1       | 2         | a     |
| H2  | Creators mostly have little coding skill   | **Unproven** (balanced)  | 18         | 8        | 8           | 2       | 7         | b d   |
| H3  | Many only play, and their needs are unmet  | **Partially supported**  | 23         | 13       | 1           | 9       | 11        | b d e |
| H4  | Idea and request posts are common          | **Unproven** (leans yes) | 35         | 13       | 0           | 22      | 13        | b d e |
| H5  | Beginners don't know where to start        | **Unproven** (leans yes) | 21         | 17       | 0           | 4       | 6         | b     |
| H6  | People want their own game more than a mod | **Unproven** (leans no)  | 34         | 5        | 20          | 9       | 11        | b d e |

In plain words:

- **Age (H1):** public data cannot settle it. The two usable surveys point to
  **young adults rather than teens** being the core: in the one large survey of
  a mod site's users, about 1 in 5 was 17 or under and the biggest group was
  18–24. Section 3 explains the limits.
- **Coding skill (H2):** evenly split. Beginners asking for help say they can't
  code; people showing finished mods clearly can. Each side is partly an
  artefact of where it was found.
- **Players (H3):** play-only people are a large group (about 3 in 10 records,
  nearly half of the commenters who showed a side), and most of them report a
  real problem: installs that break, downloads they can't reach, or mods they
  want that don't exist.
- **Ideas (H4):** about 1 in 3 creator-side records is an idea or request
  post, and nobody said they lacked ideas. That meets the hypothesis's own 25%
  bar but not the protocol's general 40% bar, so it stays Unproven.
- **Learning curve (H5):** the strongest signal (17 of 21 support, none
  against), but it all comes from one source type (community posts) and partly
  from beginner-help queries, so the protocol does not allow a verdict.
- **Own game (H6):** the opposite of the hypothesis. Most creators want to mod
  an existing game (20 of 34); only 5 want to make an original game.

---

## 3. How Far Public Data Can Answer The Age Question (H1)

**Short answer: not far enough for a verdict.** Phase 2 (480 queries) and
Phase 3 (30 survey queries, 3 retries, 4 disconfirmation queries and 15 fetched
pages) found only **two** sources that both (a) survey modders, mod users,
fan-game makers or port players and (b) report age. They are independent
(different publishers, samples and years), but they do not answer the same
question:

| Source                                                | Population and method                                         | Age finding                                    | Why it can't settle H1                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Nexus Mods site survey (`6bbceb411a84ed90`, Aug 2015) | 25,000+ self-selected site users (96% say they use mods)      | 17 or under 22%; 18–24 40%; 25–34 19%; 35+ 16% | 11 years old. The 18–24 bracket straddles the 21 cut-off, so the 15–21 share and the median cannot be read.                    |
| OzCHI 2023 paper (`c121bb5cb8cb5b50`)                 | 483 adult mod creators recruited online; peer-reviewed survey | Mean age 28.5 (SD 9.4)                         | Under-18s were excluded by design (26 under-18 respondents were removed), so it cannot speak to teens; a mean is not a median. |

What this does and does not show:

- **No eligible source places the median or modal age in 15–21.** The closest
  (Nexus 2015) has its largest bracket at 18–24, and 62% of respondents were 24
  or under. That is compatible with a median anywhere from about 19 to 24.
- **Only one source leans against H1** (OzCHI: adult creators average 28.5),
  and it excludes minors. The contradiction test needs two, so H1 is not
  Contradicted either.
- **Lean:** the evidence points to a **young-adult core with a sizeable teen
  minority** (about 1 in 5 in 2015), not a teen majority.
- **Adjacent populations (context only, cannot count):** the ESA's US player
  survey puts the average player at 37; a GameMaker report said the share of
  new users aged 13–17 rose by about two-thirds after the engine became free;
  a Similarweb traffic model puts Nexus Mods' largest visitor group at 18–24
  (a modelled traffic estimate, not a survey or official statistic, so it
  cannot count either).
- **What is missing:** platform statistics from Nexus Mods, mod.io,
  CurseForge, Steam Workshop or Thunderstore (none found publicly), and any
  recent modder survey that includes under-18s. Three academic PDFs and one
  community survey (MiSTer FPGA users) were fetched but could not be read
  (unreadable binary or a report that did not render), and two Roblox pages
  were blocked. Self-stated ages in posts are colour only, and too few to use
  (section 7).

Answering H1 properly would need a new survey with an age question (Phase 9
interviews can ask it, but a small sample will not settle the median) or
first-party data from a mod platform.

---

## 4. Sources And Their Weight

All 15 survey and statistics pages are rated in
`data/derived/03-audience/source-ratings.csv` (source type, publisher kind,
population, method, sample size, fieldwork date, bias risk, H1 eligibility).

| Weight                  | Sources                                                                                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1-eligible (2)         | Nexus Mods 2015 survey (high bias risk: self-selected, old); OzCHI 2023 modder survey (medium: adults only, recruited online)                                                                                                      |
| Context only (5)        | ESA 2026 player survey (low risk, wrong population); GameMaker new-user report via press (high); Scratch statistics page (chart not rendered); Godot poll page (results off-page); Similarweb Nexus traffic model (high; modelled) |
| On-topic but no age (2) | CHI 2020 survey of 68 women modders (fetched abstract has no age); a ResearchGate mod-popularity case study (about mods, not people)                                                                                               |
| Not readable (6)        | 3 academic PDFs (binary), the MiSTer community survey report (did not render), 2 Roblox pages (blocked)                                                                                                                            |

Survey-page selection: A1 picked from 248 search results under the written
rule. A1's pick list and its decision log disagreed (one mistyped id, picks
missing from the list, several pages sharing one survey sample), so the lead
re-applied the rule. The final picks and every reject, with reason codes, are
in `data/derived/03-audience/survey-selection.csv` (15 picks, 233 rejects; 14
decisions changed by the lead).

Community records: **81 records** were coded (49 fetched in Phase 3 + 33
Phase 2 records re-coded fresh − 1 duplicate URL), of which **73 were
usable**. Source types: a = surveys; b = community posts and comments; d = mod
and repository pages; e = news and forums.

---

## 5. Evidence Per Hypothesis

Counts are on-topic, usable records from
`data/derived/03-audience/deep-sample-coding.csv`. Two analysts coded the
records independently (A1: H1, H2, H5; A2: H3, H4, H6), in four batches each.
The lead then re-read on-topic rows against their raw text and changed 43
rows; each change gives its reason in the `note` column (`codingPass`
contains `lead`).

### H1 — Age 15–21: **Unproven** (lean: young adult, not teen)

See section 3. Three community records with age polls or stated ages were
about other groups (a watch-modding forum, a single game's fan subreddit and
a chatbot app community), so they were coded off-topic. Two in-population
records each hold one self-stated age (section 7).

### H2 — Little or no coding skill: **Unproven** (balanced)

- 18 on-topic records, below the 20 minimum. 8 support, 8 contradict, 2
  neutral (44% / 44%).
- **Supports:** beginners who say they can't code or are only starting.
  Examples: a modding-subreddit post from an absolute beginner planning to
  learn to code (`509f58eea695e578`); an X reply from someone calling
  themselves a non-programmer (`0cb0a8346d063939`); a Facebook post from
  someone with many mod ideas but not the skills (`2230ed210c75044e`).
- **Contradicts:** people who show or state programming skill. Examples: a
  poster who finished two years of a computer-science degree
  (`620cf858ae5f7bfe`); a programming student (`50318cc6beac282e`); finished
  mod pages showing advanced technical work (`01277e12f08703f3`,
  `050d5a837ceea43d`).
- **Artefact warning:** help-seeking posts show inexperience by construction,
  and finished-mod pages show skill by construction. The split reflects which
  kinds of page were sampled more than how skilled the population is.

### H3 — Play-only users with unmet needs: **Partially supported**

- 23 on-topic records: 13 support (57%), 1 contradicts (4%), 9 neutral.
  11 platforms, source types b, d and e.
- **Share test:** 16 of 55 usable records with a readable side are play-only
  (29%, just under the 30% bar); counting "both" records, 24 of 55 (44%).
  Counting commenters, 152 showed play-only intent and 176 creator intent
  (46% / 54%). Support leads (57% against 4%), but the share test is
  borderline, so this is Partially supported, not Supported.
- **Unmet needs reported:** installs that fail on handhelds and with mod
  managers, downloads behind accounts or paywalls, and wanted mods that don't
  exist. Examples: a YouTube install-guide comment set where several viewers
  report getting stuck (`3e69f78fffedef0f`); a Facebook thread about complex
  mod installs (`4db1663d80f6b811`); a request thread for one game with 20+
  mod requests (`87465a2a0d0e3051`).
- **Against:** one Reddit record where a play-only user says light
  enhancement mods already meet their needs (`46d3ff623db2fc15`). A Reddit
  author who dislikes mods altogether was re-coded neutral
  (`b0d4b719b059d1ad`).

### H4 — Idea and request posts are common: **Unproven** (leans yes)

- 35 on-topic creator-side records: 13 are idea or request posts (37%), none
  say "I have no ideas", and 22 are creator records with no ideas (neutral).
- The H4 row's own test (≥ 25% idea posts) is met. But section 1.2's general
  rule needs support ≥ 40% for Partially supported, and the row test cannot
  override it, so the verdict is Unproven, leaning yes. The lead re-coded 5
  records as not idea posts (a tool launch, a mod-loader roadmap, a tool
  feature request, a tutorial request and a price complaint).
- Idea posts range from difficulty tweaks for one game (`4f9d55a86746921f`)
  and a specific spell mod (`0a78e743e5cb91cd`) to fan-game concept threads
  (`0606d9f66b0aa4d7`).
- Commenter counts: 79 commenters across the 60 community records posted
  ideas or requests.

### H5 — Beginners don't know where to start: **Unproven** (leans yes)

- 21 on-topic records: 17 support (81%), 0 contradict, 4 neutral; 6 platforms.
- **Fails the minimum:** all 21 records are source type b (community posts),
  and the protocol needs at least two source types.
- Typical support: a first-time creator asking what tools they need
  (`0a78e743e5cb91cd`); YouTube tutorial comments where beginners get stuck
  (`3e69f78fffedef0f`); a forum thread saying modding knowledge is locked
  inside Discord servers (`09abaa44c4709574`).
- **Selection bias:** 7 community queries were beginner or how-to queries
  (`a3-c03`, `c05`, `c09`, `c10`, `c11`, `c13`, `c15`). Without records found
  by those queries, 8 of 11 still support and 0 contradict, but that is too
  few records to judge.

### H6 — Own game over modding: **Unproven** (leans no)

- 34 on-topic creator-side records: 5 want an original game (15%), 20 want to
  mod an existing game (59%), 9 are mixed or both (26%).
- Neither row test is met: support needs ≥ 40% original, or more original
  than mod; contradiction needs ≥ 75% mod-existing. 59% is also just under
  the 60% general bar for Contradicted.
- Commenter counts point the same way: 199 commenters talked about modding
  existing games and 49 about making their own.
- Without records from the "own game" queries (`a3-c06`, `c14`, `c16`): 4
  support and 20 contradict out of 30 (67% contradict). That clears the 60%
  bar but not the row's 75% test, so the verdict stays Unproven.

---

## 6. Segments

From A2's per-record counts (60 usable community records). These are counts
of distinct commenters showing each signal, so one busy thread can dominate.

| Signal                    | Commenters |
| ------------------------- | ---------- |
| Play-only intent          | 152        |
| Creator intent            | 176        |
| Idea or request           | 79         |
| Wants an original game    | 49         |
| Wants to mod a known game | 199        |

By record (all usable records): 31 creator, 16 player, 8 both, 2 unclear, 3
with no audience voice.

---

## 7. Self-Stated Ages (colour only)

`data/derived/03-audience/age-signals.csv` stores bucket counts only.

| Bucket | ≤14 | 15–17 | 18–21 | 22–29 | 30+ | Unclear | Total |
| ------ | --- | ----- | ----- | ----- | --- | ------- | ----- |
| Count  | 0   | 1     | 1     | 0     | 0   | 0       | 2     |

Only **2** in-population people gave their own age (one on Reddit, one on
X), far below the 30 needed even for colour. Another 16 stated ages came from
off-population threads (watch modding, a chatbot app, a game fan subreddit)
and were excluded. One more record gave the age at which someone started
modding, not their current age, so it was excluded too. Public comment
sections rarely state ages, so this route cannot answer H1.

---

## 8. Disconfirming Evidence

Two Disconfirmer passes (`owl`) looked for evidence against every verdict:
the first on the analysts' merged coding, the second on the lead's corrected
coding.

- **First pass:** proposed 6 neutral queries. 4 ran (`a3-d01`, `d03`, `d04`,
  `d05`; added to the frozen list before running). 2 were dropped as repeats
  of pages already fetched or queries already run. The 4 searches surfaced
  academic work on modding as a learning route, articles about professional
  developers who started as modders, and general game-developer surveys
  (adjacent population). None was a new eligible age survey, so none was
  fetched.
- It flagged one coding error, which the lead verified and fixed: in
  `16b21c20cf5a0b56` the only commenter who states a background has very
  little, so H2 changed from contradicts to supports.
- **Second pass:** agreed with the lead's corrections it checked. It named the
  strongest H2 counter-evidence as professional or trained creators
  (`04b675335ae09df6`, `3b3174868016307e`, `620cf858ae5f7bfe`; all already
  coded contradicts), and warned that H2 supports may mix up tool confusion
  with lack of skill. The lead checked the H2 supports and re-coded 3 as
  off-topic (`014de28eedea41f8`, `0d83dc917a139679`, `0208de2c7be77ae2`),
  which moved H2 from Partially supported to Unproven.
- **Biases that inflate verdicts:** help-seeking queries inflate H5 and the H2
  supports; mod pages and finished projects inflate the H2 contradicts; the
  "own game" queries (`a3-c06`, `c14`, `c16`) inflate H6 supports, yet H6
  still leans no.
- **Strongest evidence against H1:** the OzCHI 2023 mean age of 28.5 among
  adult creators, and the Nexus 2015 survey's 40% aged 18–24 against 22% aged
  17 or under.

---

## 9. Caveats

- **Self-selection.** Everyone sampled chose to post, comment or answer a
  survey. Lurkers and people in private Discord servers are missing.
- **Query wording.** The frozen queries were balanced in both directions, but
  help-seeking wording still draws beginners (section 8).
- **Thin TikTok.** Only one usable TikTok comment set (78 comments). The
  first video was unavailable, and the third was not run because the $1.00
  cap could not cover the runner's $0.25 reserve.
- **Reddit quota.** 27 posts, not 30: the 3-per-query cap and the blocked
  Reddit query (`a3-c10`) limited the sample. That is the pre-registered rule,
  so it was not topped up.
- **Phase 2 reuse.** 33 of the 81 records come from Phase 2's sample. They
  were re-coded fresh and counted once, but they inherit Phase 2's sampling
  frame.
- **Coding.** All coding was done by language-model analysts with lead review.
  The lead changed 43 of 411 rows (10%), nearly all towards a stricter reading
  of what counts as on-topic.

---

## 10. Verifier Report

Two fresh Verifier passes (`owl`). Neither was told the hoped-for answer, and
neither had seen the coding before.

| Pass       | Scope                                                                                                                                                            | Result                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1. Claims  | Recounted every verdict from the coding file against section 1's rules; checked survey figures, paraphrases, ages and privacy, and the spend and run-log figures | 47 claims confirmed; **0 DROP, 0 DOWNGRADE**           |
| 2. Records | Opened the raw text of all 24 records cited in sections 3, 5 and 8 and checked each description and stance                                                       | 24 of 24 opened; **24 CONFIRMED, 0 DROP, 0 DOWNGRADE** |

Notes:

- Pass 1 opened only 5 cited records itself, so pass 2 was run to cover all
  of them.
- Pass 2 found the survey figures exact: Nexus Mods (3 August 2015; 25,000+
  answers; 96% mod users; 22% / 40% / 19% / 16% by age band) and OzCHI 2023
  (483 participants; mean 28.46, SD 9.39, rounded here to 28.5 and 9.4; 26
  under-18 respondents removed). The removal detail was added to section 3.
- Pass 2 judged the lead's three H2 re-codes (section 8) defensible.
- Neither pass found usernames, handles or quotes from anyone under 18.
- There were no drops or downgrades to apply.

---

## 11. Run Log And Spend

| Batch                            | Items                  | OK                      | Spend (settled)     |
| -------------------------------- | ---------------------- | ----------------------- | ------------------- |
| Survey search (`a3-s*`)          | 30                     | 27 (3 blocked)          | $0.070              |
| Survey search retry              | 3                      | 3                       | $0.000¹             |
| Community search (`a3-c*`)       | 18                     | 16 (2 blocked)          | $0.040              |
| Survey page scrape               | 15                     | 13 (2 blocked)          | $0.020              |
| `reddit_posts` (7 chunks)        | 27                     | 27                      | $0.135              |
| `youtube_comments`               | 5 videos × 12 comments | 5 (60 comments)         | $0.300              |
| `tiktok_comments`                | 2 of 3 planned         | 2 (1 was a crawl error) | $0.395              |
| Disconfirmation search (`a3-d*`) | 4                      | 4                       | $0.000¹             |
| **Total**                        | **104 items**          | **97 ok, 7 blocked**    | **$0.960 of $1.00** |

¹ The ledger booked $0 for these two small search batches, probably because
the account's cost counter had not caught up. At the usual rate (about
$0.0015 per search) the 7 searches would cost about $0.01, still within the
$1.00 cap.

- **Allocation:** $0.70 pre-registered, raised to $1.00 by owner decision
  before any pipeline ran (`01` section 10). Group `phases-03-08`: $0.96 used
  of $2.43, leaving $1.47 for phases 4–8.
- **Ledger:** 15 Phase 3 entries, all settled, 0 open reservations.
- **Run log:** `data/raw/03-audience/run-log.jsonl` holds 238 entries (104
  item results plus budget entries). The 3 blocked survey queries were
  retried once each, so they appear twice (attempts 1 and 2 in
  `query-log.csv`); every other item appears once.
- **Fetch rates:** `data/derived/03-audience/fetch-rates.csv` (49 fetched
  items: 47 ok; 38 usable after coding).
- **Derived files** (`data/derived/03-audience/`): `query-log.csv`,
  `source-index.csv`, `survey-selection.csv`, `source-ratings.csv`,
  `deep-sample-coding.csv`, `age-signals.csv`, `fetch-rates.csv`.
- **New scripts:** `scripts/sample-audience.mjs` (hypothesis-blind sampler)
  and `scripts/age-buckets.mjs` (age bucket counter), both with tests;
  `scripts/query-log.mjs` gained a `--queries` option for later phases'
  frozen lists.
