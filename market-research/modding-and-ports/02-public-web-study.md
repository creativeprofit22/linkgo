# 02 — Public-Web Study

Status: **draft written from stored evidence (2026-10-03); Verifier report in
section 10.** This study reports visibility and deep-sample leans. It does not
set verdicts; those come in phases 3–11 under protocol section 1.2.

| Field       | Value                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------- |
| Phase       | 2 of 11                                                                                     |
| Hypotheses  | H1–H12 (visibility signals and deep-sample leans only)                                      |
| Bright Data | `search` for the pre-registered matrix subset; `scrape` and `pipelines` for the deep sample |
| Team        | 4 Collectors (`bee`), 2 Analysts (`owl`), 1 Disconfirmer (`owl`), 1 Verifier (`owl`)        |
| Depends on  | Phase 1 (frozen matrix, keyword groups, runner, spend cap)                                  |
| Raw data    | `data/raw/02-public-web/` (git-ignored)                                                     |
| Derived     | `data/derived/02-public-web/` (no URLs in tables except anonymised paths, no handles)       |
| Run dates   | 2026-10-02 22:47 UTC to 2026-10-03 01:48 UTC (run-log `startedAt`)                          |

**How to read citations.** `[c:coverage.csv platform=x]` points to a row of a
derived table. `[r:<recordId>/<method>]` points to one deep-sample record:
its raw file is `data/raw/02-public-web/<pipeline|scrape>/ds-<method>-<recordId>.json`
and its coding is in `deep-sample-coding.csv`. `[q:<query id> <recordId>]`
points to one search result stored in `data/raw/02-public-web/search/<query id>.json`.

---

## 1. Purpose And Limits

This study measures what is **publicly visible in Google results** for the
modding, fan-game and port topics, and reads a stratified sample of those pages
in full.

It **can** show which topics, platforms and words appear in indexed public
pages, and what a sample of real posts, videos and pages says.

It **cannot** show audience size, market share, age, buying intent, or what
happens in private spaces (most of Discord). A signal count is a count of
search-result titles and snippets, not of people. Some counts are partly
produced by the query wording itself (section 5).

## 2. Study Design

The executed matrix uses the frozen Phase 1 template
(`site:<host> "<theme phrase>" <intent words>`), the 20 platforms, 11 themes and
5 intents, and the 36 disconfirmation queries in `scripts/config/query-list.json`
(SHA-256 `d2b459f4…`, unchanged; checked by `build-subset.test.mjs`).

**Deviation from Phase 1, registered before collection (2026-10-02).** The
full frozen matrix is 1,136 queries (20 platforms × 11 themes × 5 intents +
36 disconfirmation queries) and costs about $3.40 at pilot prices, more than
the $1.94 Phase 2 allocation. The owner chose to run a pre-registered subset
(protocol section 10):

- **Wave A (220 queries):** every platform × theme pair once, with intent
  `intents[i mod 5]` for pair `i` in frozen-list order.
- **Disconfirmation (36 queries):** all of them.
- **Wave B (up to 220 queries):** each pair's second intent,
  `intents[(i+2) mod 5]`, run after the deep sample in a fixed order (SHA-256
  of the query id, so a cut-off is spread across platforms) and only
  while more than $0.05 of the allocation is left. Unrun queries are listed.

The rule ignores hypotheses and results; each query is copied verbatim from
`scripts/config/query-list.json` (SHA-256 checked by a test). Results from a
`site:` query whose host is not that site are dropped (protocol section 5.3).

**What actually ran.** Budget allowed all of Wave B, so **476 of the 1,136
frozen queries ran (440 matrix + 36 disconfirmation), 0 planned queries were
left unrun**, and every platform × theme pair was queried with two of its five
intents `[c:coverage.csv wave=A,B,D]`. Four extra neutral queries requested by
the Disconfirmer ran as logged additions `x-add-1..4` (section 8). The 660
matrix queries with the remaining three intents per pair were not part of the
plan and did not run.

## 3. Collection Funnel

| Stage                                          | Count | Source                             |
| ---------------------------------------------- | ----- | ---------------------------------- |
| Planned queries (Wave A + B + disconfirmation) | 476   | `coverage.csv` all                 |
| Run (incl. 4 additions)                        | 480   | `coverage.csv` all                 |
| Search attempts (incl. one retry round)        | 536   | `query-log.csv`                    |
| Queries ok (final attempt)                     | 386   | `coverage.csv` all                 |
| Queries with ≥ 1 on-site result                | 344   | `coverage.csv` all                 |
| On-site result rows                            | 2,932 | `coverage.csv` all                 |
| Off-site result rows dropped (section 5.3)     | 441   | `coverage.csv` all                 |
| Unique records (deduplicated URLs)             | 2,701 | `coverage.csv`, `source-index.csv` |
| Unique hosts                                   | 285   | `source-index.csv` (host column)   |

Final status of the 476 planned queries: Wave A 200 ok / 12 blocked / 8 empty;
Wave B 150 ok / 57 blocked / 11 empty / 2 timeout; disconfirmation 32 ok /
4 blocked `[query-log.csv final attempts]`. Across all 536 attempts, failures
were 119 `brd_error` blocks and 2 timeouts `[query-log.csv errorClass]`.
Wave B was blocked far more often than Wave A (57 vs 12), so Wave B adds less
coverage than its query count suggests.

## 4. Coverage

**By platform** (22 planned queries each) `[c:coverage.csv dimension=platform]`:

| Platform     | ok  | with on-site | unique records | off-site dropped |
| ------------ | --- | ------------ | -------------- | ---------------- |
| gamebanana   | 22  | 22           | 177            | 0                |
| reddit       | 21  | 21           | 171            | 25               |
| fandom       | 21  | 16           | 139            | 44               |
| curseforge   | 19  | 18           | 121            | 9                |
| gbatemp      | 19  | 16           | 138            | 26               |
| tiktok       | 19  | 15           | 135            | 42               |
| discord      | 18  | 17           | 118            | 10               |
| github       | 18  | 18           | 128            | 1                |
| hackernews   | 18  | 17           | 122            | 9                |
| resetera     | 18  | 17           | 127            | 8                |
| youtube      | 18  | 16           | 143            | 25               |
| itchio       | 17  | 12           | 91             | 53               |
| moddb        | 17  | 16           | 134            | 10               |
| nexusmods    | 17  | 13           | 109            | 41               |
| steam        | 17  | 16           | 151            | 10               |
| modio        | 15  | 12           | 71             | 29               |
| x            | 15  | 11           | 91             | 39               |
| rustforum    | 14  | 9            | 65             | 47               |
| twitch       | 14  | 14           | 86             | 4                |
| thunderstore | 13  | 12           | 84             | 9                |

Thin areas: **rustforum** (9 of 22 queries with on-site results, 47 off-site
rows dropped), **thunderstore** (13 ok), **twitch** (14 ok), **x** and
**modio** (11–12 with on-site results). These are coverage gaps, not evidence
of low activity.

**By theme** (40 queries each) `[c:coverage.csv dimension=theme]`: ok ranges
from 36 (mod-creation) to 28 (decomp, ip-revival). The thinnest themes are
**decomp** (21 with on-site results, 70 off-site rows dropped), **legal** (22
with on-site, 66 dropped), and **rust-rebuild** (26 with on-site).

**By intent** (88 queries each) `[c:coverage.csv dimension=intent]`: ok ranges
from 66 (request) to 72 (howto, problem); no intent is thin.

**Disconfirmation** (3 queries per hypothesis) `[c:coverage.csv
dimension=hypothesis]`: 3/3 ok for H1–H6, H9 and H11; 2/3 ok for H7, H8, H10
and H12.

## 5. Signal Counts (visibility, not demand)

Share of the 2,932 on-site result rows whose title or snippet matches each
frozen keyword group `[signal-counts.csv dimension=all]`:

| Group              | Hits | Share | Where most hits come from (theme, hits/results)        |
| ------------------ | ---- | ----- | ------------------------------------------------------ |
| play-only          | 519  | 17.7% | mod-install 259/261                                    |
| discord            | 368  | 12.6% | community 218/255; platform discord (disboard) 129/133 |
| port               | 273  | 9.3%  | pc-port 225/267                                        |
| competitor-mention | 250  | 8.5%  | —                                                      |
| legal              | 210  | 7.2%  | legal 151/183                                          |
| rust               | 191  | 6.5%  | rust-rebuild 150/188                                   |
| revival            | 189  | 6.4%  | ip-revival 160/204                                     |
| decomp             | 180  | 6.1%  | decomp 154/176                                         |
| ease-satisfaction  | 159  | 5.4%  | —                                                      |
| ideas-requests     | 91   | 3.1%  | —                                                      |
| beginner           | 56   | 1.9%  | learning 23/256                                        |
| own-game           | 19   | 0.6%  | —                                                      |
| learning-curve     | 17   | 0.6%  | —                                                      |
| age                | 10   | 0.3%  | —                                                      |

**Most large counts are produced by the query wording.** Each of play-only,
discord, port, legal, rust, revival and decomp gets most of its hits from the
theme whose phrase contains that word (table, right column). They show that
the query found pages using that word, not that the topic is common. The
discord count on the discord platform is a listing site for Discord servers,
so 129 of its 133 rows match by construction `[signal-counts.csv
platform=discord]`.

Groups not driven by a theme phrase are small: ideas-requests 3.1%, beginner
1.9%, own-game 0.6%, learning-curve 0.6%, age 0.3%. Public titles and snippets
rarely state age or "learning curve"; this says nothing about how often people
feel it.

Per platform (slices with ≥ 30 results), the rust group is most visible on
rustforum (32/69) and hackernews (23/145), and the play-only group on
curseforge (67/146) `[signal-counts.csv dimension=platform]`.

## 6. Competitor And Project Mentions

Unique records whose title or snippet names each dictionary term
(pre-registered in `scripts/config/mention-terms.json`)
`[mention-counts.csv]`:

| Term              | Category     | Records |
| ----------------- | ------------ | ------- |
| thunderstore      | hub          | 65      |
| nexus mods        | hub          | 43      |
| curseforge        | hub          | 41      |
| emulator          | emulator     | 32      |
| itch.io           | hub          | 29      |
| unity             | engine       | 19      |
| vortex            | hub          | 15      |
| r2modman          | tool         | 12      |
| bepinex           | tool         | 11      |
| gamebanana        | hub          | 11      |
| blender           | tool         | 10      |
| ship of harkinian | port-project | 9       |
| steam workshop    | hub          | 9       |
| unreal engine     | engine       | 9       |

Hub mentions are partly self-mentions: the matrix queries those hubs' own
sites. 24 dictionary terms had 0 records, including smapi, skse, sm64ex,
n64recomp, openrct2, openttd, retroarch and ryujinx `[mention-counts.csv
records=0]`. Zero here means absent from the stored titles and snippets, not
absent from the web. Only 5 of the 19 named port projects appear at all:
Ship of Harkinian 9 records, OpenGOAL 4, Harbour Masters 3, RSDKv5 3,
OpenMW 1 `[mention-counts.csv category=port-project]`.

## 7. Deep Sample

**Sampling rule (hypothesis-blind).** Candidates were the 1,667 unique on-site
records after Wave A and the disconfirmation queries. Within each platform they
were ordered by `recordId` (a URL hash) and the first N with an item-shaped URL
(a post or video, not a profile) were taken under fixed quotas; titles and
snippets were never read. Quotas, candidate counts and selections are in
`data/raw/02-public-web/plans/deep-sample-manifest.json` and the rule is in
`scripts/sample-deep.mjs`.

| Method             | Quota  | Candidates (eligible) | Selected |
| ------------------ | ------ | --------------------- | -------- |
| reddit_posts       | 10     | 126 (121)             | 10       |
| youtube_videos     | 8      | 93 (91)               | 8        |
| youtube_comments   | 4      | first 4 videos        | 4        |
| tiktok_posts       | 5      | 72 (37)               | 5        |
| x_posts            | 8      | 73 (51)               | 8        |
| instagram_posts    | 5      | 5 (2)                 | 2        |
| facebook_posts     | 5      | 28 (26)               | 5        |
| scrape (16 hosts)  | 2 each | 24–115 per host       | 32       |
| scrape (other web) | 8      | 131                   | 8        |

Instagram and Facebook are not matrix hosts, so their candidates came only
from the open-web disconfirmation results; only 2 Instagram post URLs existed.

**Fetch success and usable pages by method** `[fetch-rates.csv]`:

| Method           | Items | Fetched ok | Usable | Usable rate |
| ---------------- | ----- | ---------- | ------ | ----------- |
| reddit_posts     | 10    | 10         | 10     | 100%        |
| youtube_videos   | 8     | 8          | 8      | 100%        |
| youtube_comments | 4     | 4          | 3      | 75%         |
| tiktok_posts     | 5     | 5          | 5      | 100%        |
| x_posts          | 8     | 8          | 8      | 100%        |
| instagram_posts  | 2     | 2          | 2      | 100%        |
| facebook_posts   | 5     | 5          | 5      | 100%        |
| scrape           | 40    | 36         | 31     | 78%         |
| **all**          | 82    | 78         | 72     | 88%         |

All 4 failed fetches were scrapes blocked with `brd_error`. Unusable scrapes
include both rustforum pages, both twitch pages, and one page each from modio
and curseforge `[deep-sample-coding.csv usable=no]`.

**Comparison with the reference study.** The reference study fetched 96 pages
and found 56 substantive; its TikTok and YouTube fetches returned 0 of 5
usable pages (`00` section 4). Here the platform pipelines returned usable
records for **41 of 42** video and social items, including 5 of 5 TikTok and
8 of 8 YouTube videos. This is the main method gain of Phase 2.

**Stance coding.** Analyst A2 read each usable record in full and coded it per
hypothesis under protocol sections 1.1–1.3. A strict second pass re-applied
each test literally and changed 33 of the 105 first-pass on-topic codes,
mostly from supports to neutral or off-topic
(`data/raw/02-public-web/work/review.csv`). The lead then adjudicated 5 more
codes against the raw text: 3 became neutral (`codingPass=lead`) and 2
became off-topic. 50 usable records are on-topic for at least one
hypothesis; 22 are on-topic for none. Final counts of on-topic records
`[deep-sample-coding.csv]`:

| H   | On-topic | Supports | Contradicts | Neutral | Platforms | Source types | Meets §1.2 minimum? |
| --- | -------- | -------- | ----------- | ------- | --------- | ------------ | ------------------- |
| H1  | 0        | 0        | 0           | 0       | 0         | —            | no                  |
| H2  | 7        | 3        | 1           | 3       | 4         | b            | no                  |
| H3  | 7        | 4        | 1           | 2       | 5         | b            | no                  |
| H4  | 7        | 7        | 0           | 0       | 6         | b c d        | no                  |
| H5  | 15       | 7        | 2           | 6       | 12        | b c d        | no                  |
| H6  | 7        | 0        | 7           | 0       | 7         | b c d e      | no                  |
| H7  | 4        | 2        | 1           | 1       | 4         | b e          | no                  |
| H8  | 8        | 4        | 0           | 4       | 6         | b c          | no                  |
| H9  | 0        | 0        | 0           | 0       | 0         | —            | no                  |
| H10 | 20       | 16       | 1           | 3       | 11        | b c d        | yes (volume only)   |
| H11 | 7        | 3        | 3           | 1       | 6         | b c d        | no                  |
| H12 | 9        | 8        | 0           | 1       | 7         | b c d        | no                  |

Leans, stated as leans only:

- **H10 leans support.** 16 of 20 on-topic records name install, setup, tool
  or learning barriers, e.g. hours of troubleshooting mod setup
  `[r:1f957f45b4b28372/facebook_posts]`, players asking how to install mods
  manually `[r:10620d8444ddae8f/scrape]`, and a non-programmer asking whether
  mods can be made without code `[r:0cb0a8346d063939/x_posts]`. One wiki
  page describes an accessible manager and tutorials
  `[r:0200c94fc9fd7f6d/scrape]`. The sample was not drawn from friction
  records only, and several supports are developer-side issue pages
  (`05c4bb7a38e4810d`, `05e262879ec1ff59`), so phases 5 and 10 must test
  whether barriers are the _main_ problem.
- **H6 leans contradict.** All 7 on-topic records concern modding an existing
  game, e.g. a total-conversion article `[r:07079e239d77ba06/scrape]` and a
  Half-Life mod page `[r:050d5a837ceea43d/scrape]`; none shows wanting an
  original game. The matrix and sample are mod-centred, which biases this lean.
- **H12 leans support, weakly.** 8 records cite Discord as where a modding
  community gathers or gets help, e.g. `[r:09abaa44c4709574/scrape]` and
  `[r:06c8f718c765f272/scrape]`. None compares Discord with other places, and
  the test also needs directory evidence of room to grow.
- **H4:** 7 of 7 on-topic records contain a concrete idea or request, e.g.
  `[r:2230ed210c75044e/facebook_posts]`; no "no ideas" posts were found.
- **H2, H3, H5, H7, H8, H11:** mixed or thin (table).
- **H1 and H9:** no on-topic deep-sample records.

## 8. Disconfirming Evidence

The Disconfirmer searched the 36 disconfirmation result sets and the deep
sample for evidence against each hypothesis; the lead re-checked every cited
search result. Report: `data/raw/02-public-web/work/disconfirmer-report.md`.

| H   | Counter-evidence (rated by the Disconfirmer)                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | None, but also no support: the only age figures are one mod author's poll on one mod page (18–24 40%, up to 17 22%) `[q:d-H1-3 6dbe2936e3708a48]`, which is not a survey or official statistic.                                                                                                                                                                                                                                                                                                   |
| H2  | Weak: one creator shows advanced modelling and engine skills `[r:078d40e6d378ac49/youtube_videos]`.                                                                                                                                                                                                                                                                                                                                                                                               |
| H3  | Moderate: install help is described as available `[r:019730235c0334ac/youtube_videos]`; no record measures the play-only share the test needs.                                                                                                                                                                                                                                                                                                                                                    |
| H4  | None found.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| H5  | Weak to moderate: two records present tutorials and tools as sufficient `[r:0200c94fc9fd7f6d/scrape]` `[r:1f58870d1c97f87b/tiktok_posts]`.                                                                                                                                                                                                                                                                                                                                                        |
| H6  | Strong lean: 7 of 7 on-topic records are about modding existing games (section 7).                                                                                                                                                                                                                                                                                                                                                                                                                |
| H7  | Weak: one revival concerns an active franchise `[r:09a254c6713b2aec/scrape]`; the d-H7 searches returned mostly unrelated pages.                                                                                                                                                                                                                                                                                                                                                                  |
| H8  | Weak, snippets only: some posts argue that emulation or remasters are enough `[q:d-H8-1 c07711754ef26c0a]` `[q:d-H8-1 41a2a057814e13da]`.                                                                                                                                                                                                                                                                                                                                                         |
| H9  | None, but also no support: the d-H9 results are mostly non-game Rust rewrites.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| H10 | Weak to moderate, snippets only: 7 of the 8 results for the exact-phrase query "modding has never been easier" contain that phrase, so the count is produced by the query wording, e.g. `[q:d-H10-1 447261e2d20165c4]` `[q:d-H10-1 a9a703f6cfa1d23e]`; at least 2 of the 7 are official or platform promotion (mod.io, the ARK site), and the 8th result complains about install friction `[q:d-H10-1 4db1663d80f6b811]`. One wiki page describes accessible tools `[r:0200c94fc9fd7f6d/scrape]`. |
| H11 | Moderate: an incumbent hub described as thriving `[r:00c0dbe360341f72/scrape]`, and an incumbent hub's own creation tutorial `[r:1f58870d1c97f87b/tiktok_posts]`.                                                                                                                                                                                                                                                                                                                                 |
| H12 | Weak: snippets argue that forums keep modding knowledge better than Discord `[q:d-H12-1 8bfbbadba888e111]`; no record shows Discord is the _most_ cited place.                                                                                                                                                                                                                                                                                                                                    |

**Extra neutral queries (logged additions, $0.01).** `x-add-1` (modding
survey demographics) returned no modding-wide demographic source; the one
modding item is a single mod community's survey `[q:x-add-1
b13026ec2dbff50a]`. `x-add-3` returned curated lists of active fan PC ports
and decompilations `[q:x-add-3 62b68a140baad4fc]` `[q:x-add-3
bb0bf9c144d64dcc]`. `x-add-4` returned many game forums with dedicated
mod-idea sections `[q:x-add-4 6e5bc4c0118888ee]`. These are snippets, so they
point later phases at sources rather than settle anything.

## 9. Signals Handed To Later Phases

- **Phase 3 (audience, H1–H6):** no survey or official age statistic was found
  in 480 queries (sections 5 and 8). Phase 3 must go to platform-published
  statistics or third-party surveys directly. The H6 lean (modding existing
  games) comes from a mod-centred sample; test with sources about original
  game creation by beginners.
- **Phase 4 (mod hubs, H3, H10, H11):** Thunderstore, Nexus Mods and
  CurseForge are the most-mentioned hubs (section 6). Read incumbent official
  pages for coverage of beginners and ports; the H11 sample is split 3–3.
- **Phase 5 (creator tools and learning, H2, H5, H6, H10):** H10 is the only
  hypothesis with ≥ 20 on-topic records; check whether barriers are the main
  problem. H5 records mix beginners with experienced creators.
- **Phase 6 (ports and Rust, H8, H9):** only 5 of 19 named port projects
  appear in titles and snippets (section 6); `x-add-3` points to curated port
  lists to measure breadth. Rust signal sits on developer sites
  (rustforum, hackernews), and both rustforum deep-sample pages were unusable.
- **Phase 7 (legal and IP, H7):** the legal and ip-revival themes are visible
  mainly through their own query words; only 4 on-topic deep-sample records.
  Collect takedown and survival cases directly.
- **Phase 8 (community, H12):** 8 records cite Discord as a gathering place,
  but none is comparative; Discord directory pages were reached (2 usable
  scrapes). Measure directories and compare with forums and Reddit.
- **Phase 9 (sizing):** use the source index (2,701 records, 285 hosts) only as
  a map of where to look; counts here are not audience numbers.
- **Phase 10 (personas, H10, H11):** carry the H10 lean and the H11 split.

## 10. Verifier Report

A fresh Verifier (`owl`, no part in collection or coding) checked the draft
against the raw and derived records on 2026-10-03.

- **Checked:** 54 claims, covering the funnel, the full coverage-by-platform,
  signal, mention, fetch-rate, per-hypothesis coding and spend tables, every
  `[r:…]` paraphrase it opened, and the section 8 search citations.
- **Result:** 53 CONFIRMED, 0 DROP, 1 DOWNGRADE.
- **Coding re-check:** 8 coding rows read in full against protocol section 1.3
  (6 H10/H12 supports, 2 contradicts, 2 neutral). The Verifier agreed with all 8.
- **Framing:** signal counts are stated as visibility, leans are not stated as
  verdicts, and no usernames or handles appear. The lead also ran
  `check-derived.mjs --also 02-public-web-study.md` (0 findings).

**Downgrade applied.** The H10 row of section 8 was imprecise about the
d-H10-1 results. The Verifier quoted it as "2 of 7", wording the draft did not
contain, but the underlying point held. The lead re-read the stored results:
7 of 8 contain the exact query phrase, at least 2 of those 7 are official or platform promotional
pages, and 1 result complains about install friction. The row now gives these
exact counts and notes that the phrase count comes from the query wording.

**Lead pre-check (before the Verifier).** The lead re-checked every number
against the files and corrected four items in the draft: the count of changed
codes (33, not 37), the port-project mention breakdown, the run-date start
time, and the statement on concurrent batches (batches ran one at a time).

## 11. Run Log And Spend

**Requests** (`data/raw/02-public-web/run-log.jsonl`): 536 `search` attempts,
40 `scrape`, 42 `pipeline`, and 655 budget reads by the runner.

**Spend.** Phase 2 allocation $1.94; settled spend **$1.515**; 0 open
reservations (`data/spend-ledger.json`, group `phase-02`, 18 entries):

| Batches                                       | Settled |
| --------------------------------------------- | ------- |
| Wave A (4 collector groups) + disconfirmation | $0.53   |
| Retry round (one per collector group)         | $0.14   |
| Deep sample (scrape + 5 pipeline batches)     | $0.385  |
| Wave B (3 parts)                              | $0.45   |
| Disconfirmer additions                        | $0.01   |

Two runs outlived their collector agent; both were settled by the lead from the
logged cost readings with a note on the ledger entry (protocol section 10).

**Team as executed.** Collectors: C1 forums and C3 mod hubs (Wave A, retries,
deep-sample scrape and Reddit/X pipelines), C2 video (Wave A, YouTube,
Instagram/Facebook and TikTok pipelines), C4 developer sites plus the 36
disconfirmation queries; Wave B ran through collectors and, for its last 83
queries, as a lead background task. Analyst A1 (coverage and signals), Analyst
A2 (stance coding, run as 6 parallel reading parts plus 3 strict review
parts), the Disconfirmer, and a fresh Verifier all ran as `owl`. Bright Data
batches ran one at a time (parallel search batches would share one SERP zone
and mis-book each other's cost; protocol section 10), so the planned "two
collectors at once" was not used.

**Files.** Raw: `data/raw/02-public-web/{search,scrape,pipeline}/`, plans in
`plans/`, readable handle-free copies in `reading/`, analyst working files in
`work/`. Derived: `query-log.csv`, `source-index.csv`, `coverage.csv`,
`signal-counts.csv`, `mention-counts.csv`, `deep-sample-coding.csv`,
`fetch-rates.csv`. Scripts: `build-subset.mjs`, `lib/onsite.mjs`,
`dedupe.mjs`, `signal-count.mjs`, `query-log.mjs`, `coverage.mjs`,
`sample-deep.mjs`, `fetch-rates.mjs`, `check-derived.mjs`.
