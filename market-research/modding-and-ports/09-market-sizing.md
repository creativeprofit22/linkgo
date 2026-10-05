# 09 — Market Sizing

Status: **complete, 2026-10-04; Verifier corrections applied (section 7).** Market
research only, not Linkgo app code.

| Field       | Value                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| Phase       | 9 of 11                                                                                                                 |
| Hypotheses  | Scale behind all hypotheses (no hypothesis is re-tested here)                                                           |
| Bright Data | `search` (30 queries + 11 retries), `scrape` (18 pages run), `crunchbase_company` (3 of 8 companies)                    |
| Team        | 1 Collector (`bee`, then the lead after its time limit), 1 Analyst (`owl`, draft rebuilt by the lead), 1 Verifier (`owl`) |
| Depends on  | Phases 1–8                                                                                                              |
| Rules       | `01-research-protocol.md` §10 "Phase 9 pre-registration addendum" (before any request)                                  |
| Raw data    | `data/raw/09-sizing/` (git-ignored; holds URLs)                                                                         |
| Derived     | `data/derived/09-sizing/` (organisation URLs only; no people, no handles)                                               |
| Model       | `scripts/size-model.mjs` (tested in `size-model.test.mjs`)                                                              |

Method: bottom-up per segment (section 5.3 of `00`). Every number is
**money people pay per year** (premium tiers and creator support), not ad
revenue. Published market-size headlines are context only and never enter
the model.

**Citations.** `[obs-NN]` is a row in `input-register.csv`. Each row names
its stored record (`search/<query>#r<rank>`, `scrape/<id>`,
`pipeline/<id>`), the source URL, the date it was collected, the date the
figure itself carries, a grade and a quote of 25 words or fewer. All 33
quoted rows were matched word for word against their stored text; the 2
port rows are sums from the Phase 6 inventory.

**Grades.** A = official and dated; B = official but undated or rounded;
C = measured by a third party; D = modelled estimate (may set low/high
only, never the base); X = stated assumption (allowed only for reach,
obtainable and overlap shares).

---

## Bottom Line

- **The paying market a newcomer could reach is small.** De-duplicated
  across the four segments: total market (TAM) **$9.1M a year** in the base
  case (low $4.7M, high $97M); the part this product could reach (SAM)
  **$3.2M**; what it could realistically win in 3 years (SOM) **about $32k a
  year** (low $1.9k, high $2.4M).
- **Mod players (S1) are almost all of it** (99.7% of the de-duplicated base TAM). Creators,
  port players and fan-game makers add little money: they are smaller
  groups and mostly the same people.
- **Very few people pay.** Nexus Mods pays creators $4.2M a year
  [obs-04]. At its Premium price [obs-05] that matches about **1 in 100**
  of its monthly users paying [obs-01]. Prices sit between **$2.50 and
  $6.90 a month** [obs-14, obs-05].
- **About 1 in 5 of the audience may be 17 or younger** [obs-29]. They are
  assumed to pay nothing in the low and high cases. The base rate already
  averages everyone.
- **The range is wide because two inputs are weak.** The obtainable share
  is an assumption, and the paying share rests on one Nexus figure. Those
  two inputs move the SOM most (section 6).
- **Third-party headlines are 160–400 times bigger** than the base TAM:
  $1.45B and $3.62B, with different definitions. They are shown for
  context only (section 5).

---

## 1. Segments

Fixed before collection (protocol §10, Phase 9 addendum item 3), from
Phases 3–8.

| ID | Segment | Evidence basis | Sizing note |
| -- | ------- | -------------- | ----------- |
| S1 | Mod players (download and play, no creating) | 03 H3 partly supported (about 3 in 10 records play only); 04 install problems; H11 partial | Main segment; every other segment is de-duplicated against it |
| S2 | Beginner mod creators (modding existing games) | 05 H2 supported for learners; H10 creator side partial; 03/05 H6 leans to modding | Counts all creators, then narrows to beginners through reach |
| S3 | PC-port players | 06 H8 supported (240 source games, 286 port rows) | Only released ports that need the player's own game files (the legal-risk exclusion) |
| S4 | Fan-game makers and players | 07 legal risk High; H7 unproven | Legally constrained; low case is 0 |

**Excluded:** Rust rebuilds (06 H9 contradicted, 4 hobby projects);
Discord (a channel per 08, not a revenue segment); "make your own original
game" (03/05 H6 leans no; engines already serve it, e.g. about 2 million
Godot downloads per release [obs-28]).

## 2. Input Register

Full table: `data/derived/09-sizing/input-register.csv` (35 sourced
figures, 24 model parameters). Collected 2026-10-04 unless noted. The
figures that set the model:

| Input | Value | Figure date | Grade | Source (organisation) |
| ----- | ----- | ----------- | ----- | --------------------- |
| [obs-09] CurseForge monthly users | 20M+ | undated | B | CurseForge author page |
| [obs-01] Nexus Mods monthly unique users | 4,996,242 | 2018 average | B | Nexus Mods news |
| [obs-24] ModDB monthly visitors | 5M+ | undated | B | ModDB anniversary page |
| [obs-19] mod.io unique creators | 300k+ | 2025 | B | mod.io 2025 review |
| [obs-10] CurseForge authors | 56,208 | undated | B | CurseForge author page |
| [obs-21] Modrinth authors | 69,594 | 2026-10-04 | A | Modrinth statistics API |
| [obs-07] Nexus creators who earned over $200 | 4,728+ | undated | B | Nexus Mods author benefits |
| [obs-04] Nexus creator payouts | $4.2M+ a year | undated | B | Nexus Mods about page |
| [obs-05] Nexus Premium | $6.90 a month (£4.99) | undated | B | Nexus Mods news |
| [obs-13] CurseForge Premium monthly | $2.99 a month | undated | B | CurseForge Premium page |
| [obs-14] CurseForge Premium lowest | $2.50 a month | undated | B | CurseForge Premium page |
| [obs-29] Survey respondents aged 17 or under | 22% | 2015-08 | A | Nexus Mods survey (Phase 3 record) |
| [obs-31] Audience-to-patron conversion | 1–5% | undated | D | Third-party calculator (bounds only) |
| [obs-32] GitHub stars, 8 released own-files ports | 53,715 | 2026-10-03 | C | Phase 6 inventory |
| [obs-33] GitHub stars, all 15 starred ports | 81,489 | 2026-10-03 | C | Phase 6 inventory |
| [obs-26] itch.io games tagged Fangame | 9,394 | 2026-10-04 | A | itch.io tag page |
| [obs-06, 11, 22, 23] Catalogue sizes (Nexus, CurseForge, Modrinth, Thunderstore) | 450k, 592k, 161,252, 110k | mixed | A/B | Own pages |

**Gaps, stated rather than filled:** no current Nexus monthly users (the
newest is 2018); no Nexus Premium member count (search failed twice); no
port download counts (all GitHub API calls failed); no Steam Workshop
totals in any result; no Game Jolt or itch.io totals (searches failed);
no Thunderstore or GameBanana user counts.

## 3. Model Per Segment

TAM = people × paying share × yearly spend. SAM = TAM × reachable share.
SOM = SAM × share obtainable in 3 years. Output:
`model-output.csv`.

| Segment | Case | People | Paying | $/year | Reach | Obtain | TAM | SAM | SOM |
| ------- | ---- | ------ | ------ | ------ | ----- | ------ | --- | --- | --- |
| S1 | low | 20.0M | 0.78% | 30.00 | 20% | 0.2% | $4.68M | $0.94M | $1.9k |
| S1 | base | 25.0M | 1.02% | 35.88 | 35% | 1% | $9.10M | $3.19M | $31.9k |
| S1 | high | 30.0M | 3.9% | 82.80 | 50% | 5% | $96.9M | $48.4M | $2.42M |
| S2 | low | 300k | 0.78% | 30.00 | 10% | 0.2% | $70.2k | $7.0k | $14 |
| S2 | base | 365k | 1.02% | 35.88 | 20% | 1% | $133k | $26.6k | $266 |
| S2 | high | 431k | 3.9% | 82.80 | 35% | 5% | $1.39M | $487k | $24.3k |
| S3 | low | 53.7k | 0% | 30.00 | 20% | 0.2% | $0 | $0 | $0 |
| S3 | base | 53.7k | 1.02% | 35.88 | 35% | 1% | $19.6k | $6.8k | $68 |
| S3 | high | 81.5k | 3.9% | 82.80 | 50% | 5% | $263k | $132k | $6.6k |
| S4 | low | 9.4k | 0% | 30.00 | 0% | 0% | $0 | $0 | $0 |
| S4 | base | 9.4k | 1.02% | 35.88 | 10% | 1% | $3.4k | $342 | $3 |
| S4 | high | 9.4k | 3.9% | 82.80 | 30% | 5% | $30.3k | $9.1k | $455 |

| Total | Case | TAM | SAM | SOM |
| ----- | ---- | --- | --- | --- |
| Sum of segments | low / base / high | $4.75M / $9.26M / $98.5M | $0.94M / $3.22M / $49.1M | $1.9k / $32.2k / $2.45M |
| **De-duplicated** | low / base / high | **$4.71M / $9.14M / $97.0M** | **$0.94M / $3.19M / $48.5M** | **$1.9k / $31.9k / $2.42M** |

How each input was set (formulas in the register `note` column):

- **People.** S1: low = the largest single hub (CurseForge 20M monthly
  users), since the combined audience cannot be smaller; high = CurseForge
  + Nexus + ModDB with no overlap (30.0M); base = midpoint. S2: same rule
  over mod.io, CurseForge, Modrinth and Nexus creator counts (300k to
  431k). S3: a **floor** — GitHub stars of released ports that need the
  player's own game files. Real player numbers are unknown and higher. S4:
  itch.io fan-game projects as a stand-in for makers. Players were not
  measured.
- **Paying share.** Base = Nexus creator payouts ÷ a year of Premium ÷
  monthly users = $4.2M ÷ $82.80 ÷ 4,996,242 = **1.02%**. This assumes
  payouts roughly equal Premium income, mixes an undated payout with a 2018
  user count, and applies Nexus behaviour to every hub. Low/high = the
  1–5% patron rule of thumb (D, bounds only) × 0.78 adults. S3 and S4 low
  = 0 (legal risk; only a free helper).
- **Yearly spend.** Low = CurseForge annual rate ($2.50 × 12); base =
  CurseForge monthly ($2.99 × 12); high = Nexus Premium ($6.90 × 12). A
  newcomer is assumed not to charge above the hub leader.
- **Reach (X).** Share on PC, reachable through the English-speaking
  public web, and playing supported games: 20–50%, base 35%. No measured
  split was found. S2 narrows to beginners (10–35%); S4 to fan games under
  a rights holder's fan-content policy (0–30%).
- **Obtainable in 3 years (X, anchored).** Newcomer hubs' share of the four
  catalogues (1.31M mods in total): Thunderstore 8.4%, Modrinth 12.3%,
  after years of growth. A helper tool is not a hub, so the base takes
  about a tenth of the lower anchor (1%); high takes about half (5%); low
  is 0.2%. S4 low = 0, as pre-registered.
- **Overlap (X).** S2 creators 60–95% already counted as players; S3 port
  players 50–95%; S4 fan-game makers 20–60%.

## 4. Monetisation Reality

What this audience pays for today, from stored records:

- **Premium memberships are cheap.** CurseForge Premium costs $2.50–$2.99
  a month, and 70% goes to the chosen author [obs-13, obs-14, obs-15].
  Nexus Premium costs £4.99 ($6.90) a month [obs-05].
- **Creator money is modest and concentrated.** Nexus pays creators over
  $4.2M a year [obs-04]. Only 4,728+ creators have earned over $200
  [obs-07]. CurseForge has paid $36.2M to authors in total [obs-12], mostly
  from ads. Premium has added $18M+ since 2020 [obs-15], roughly $3M a year
  on average (lead's arithmetic over about 6 years).
- **Ads, not subscriptions, carry the big numbers.** Overwolf (owner of
  CurseForge) reports 113M monthly users and $240M paid to in-game creators
  in 2024 [obs-16, obs-18]. That is mostly in-game app ad revenue, so it is
  context, not a model input.
- **Paid mods were rejected before.** Valve's 2015 Skyrim paid-mods trial
  gave creators 25% of sales and was withdrawn [obs-30].
- **Few people pay.** The implied Nexus paying share is about 1% of monthly
  users. A third-party rule of thumb puts patron conversion at 1–5%
  [obs-31, D].
- **Young audience.** In Nexus's 2015 survey (25,000+ self-selected users),
  22% were 17 or younger and 40% were 18–24 [obs-29]. Minors usually cannot
  pay without a card and a parent's consent. The model gives them $0 in the
  low and high cases (paying share × 0.78). The base rate is measured over
  all monthly users, so it already averages minors in. If minors pay
  nothing, the adult rate is about 1.3%. The survey is 11 years old and
  self-selected; a current age split would firm this up.
- **Counter-signal:** tModLoader averaged 21,063 concurrent players over
  the last 30 days [obs-27]. On the same page, its September 2026 average
  (21,158) was down 21.62% on August. That is one game and may be
  seasonal. The "audience shrinking" searches returned only
  anecdotes and unrelated web-traffic articles: no measured decline.

## 5. Third-Party Market Reports (Context Only)

`third-party-reports.csv`. Never used in the model.

| Publisher | Market as they define it | 2024 value | Forecast |
| --------- | ------------------------ | ---------- | -------- |
| Dataintelo | Game modding tools | $1.45B | not shown |
| Growth Market Reports | "Moddingplaces" (mod marketplaces) | $3.62B | $12.13B by 2033, 14.7% a year |

**Spread:** 2 headlines, min $1.45B, max $3.62B, max/min **2.5×**. The two
reports measure different things (tools vs marketplaces), and neither
method is visible in the stored snippets. Both are 160–400× the base TAM
here, which counts only what players and creators pay directly. That gap
is why they stay out of the model.

## 6. Sensitivity

One input at a time, swung from low to high, everything else at base;
effect on the de-duplicated totals. Full table: `sensitivity.csv`.

**Top 5 on SOM (base $31.9k):**

| Rank | Input | Grade | SOM at low → high | Swing |
| ---- | ----- | ----- | ----------------- | ----- |
| 1 | S1 obtainable share | X | $6.4k → $159k | $153k |
| 2 | S1 paying share | B | $24.6k → $122k | $98k |
| 3 | S1 yearly spend | B | $26.7k → $73.6k | $47k |
| 4 | S1 reachable share | X | $18.3k → $45.6k | $27k |
| 5 | S1 people | B | $25.6k → $38.3k | $13k |

**Top 5 on TAM (base $9.14M):** S1 paying share ($7.0M → $35.0M), S1
yearly spend ($7.6M → $21.0M), S1 people ($7.3M → $11.0M), S2 paying
share ($9.13M → $9.21M), S2 overlap ($9.16M → $9.12M).

**Data that would firm it up:**

- **Obtainable share:** a newcomer hub's *user* growth over its first 3
  years (e.g. Modrinth monthly users), not catalogue size.
- **Paying share:** Nexus Premium or CurseForge Premium subscriber counts
  (the search for Nexus member numbers failed twice).
- **Yearly spend:** the split between monthly and annual plans.
- **Reachable share:** hub traffic by country and platform.
- **People:** a current, dated Nexus monthly-user figure (the 2018 one is
  old) and any measured overlap between hubs. For S3, port download counts
  (the GitHub calls failed).

## 7. Verifier Report

Two fresh `owl` Verifiers checked the files without being told the
expected answer. Both admitted to sampling rather than reading every
record in full, so the lead also ran a mechanical check on every row.

| Check | Who | Result |
| ----- | --- | ------ |
| Quote found in its stored record, ≤ 25 words | Lead script, all 33 quoted rows | 33 of 33 found |
| Source URL equals the record's link | Lead script, all 33 rows | 33 of 33 |
| Snapshot date equals the record's fetch date | Lead script, all 33 rows | 33 of 33 |
| Port star sums (obs-32, obs-33) recomputed from the Phase 6 inventory | Verifier 1, then lead | **1 error found and fixed** (below) |
| Value, figure date, grade per row | Verifier 2, all 35 rows | 34 Confirmed, 1 Downgrade, 0 Drop |
| Parameter arithmetic, D/X grade rules | Verifiers 1 and 2 | No problems |
| Crunchbase and third-party tables | Verifier 2 | No problems |
| Every number in this file vs derived files and ledger | Verifiers 1 and 2 | Ratios (160–400×, 2.5×, 8.4%, 12.3%, 1.02%), model rows and spend ($0.21) confirmed; 1 wording issue |

**Corrections applied:**

1. **obs-32 (Verifier 1, Drop → corrected).** The first build kept only
   each project's last inventory row, so it missed two released ports
   (Zelda 64: Recompiled, 7,339 stars; OpenGOAL, 3,542). Corrected from
   42,834 to **53,715** stars across 8 projects. S3 people (low and base)
   rose to 53.7k; S3 base TAM rose from $15.6k to $19.6k. The model was
   re-run: de-duplicated base TAM $9.14M (was $9.14M), SOM $31.9k
   (unchanged at this rounding).
2. **obs-27 (Verifier 2, Downgrade → wording fixed).** The register holds
   the last-30-days average (21,063), but section 4 quoted the September
   figure (21,158) as if it were the register value. Section 4 now gives
   both and says which is which.

**Not verified:** the grade and figure-date calls rest on Verifier 2's
reading, not on a script. The first Verifier's full reply is in
`data/raw/09-sizing/verifier-reply.md`.

## 8. Run Log And Spend

Details: `data/raw/09-sizing/collector-log.md`; per-attempt query status in
`data/derived/09-sizing/query-log.csv`.

| Batch | Run | Ok | Failed / unrun | Ledger |
| ----- | --- | -- | -------------- | ------ |
| Searches (30 frozen) | 30 | 19 | 11 failed (network-side errors) | $0.03 |
| Search retry | 11 | 8 | 3 failed again (p9-p02, p9-f01, p9-f02) | $0.00 (billing lag) |
| Scrapes (20 frozen + 10 picks) | 18 | 12 | 6 GitHub API calls failed; 12 unrun at the ceiling (incl. all 10 picks) | $0.09 |
| `crunchbase_company` (8) | 3 + 1 cut off | 3 | mod.io cut off; Thunderstore, itch.io, DBolical, GameBanana unrun | $0.09 |

- **Crunchbase results** (`crunchbase.csv`): Nexus Mods (listed as "Nexus
  sites") 11–50 staff, UK; Overwolf 251–500 staff, 5 rounds, latest
  Series D; Game Jolt 11–50 staff, 2 rounds, latest seed. Total funding and
  founding year were not in the records ("unknown").
- **Interruption:** the shell's inactivity limit killed the runner during
  the Crunchbase batch. The owner chose to book the measured cost instead
  of the full $0.30 hold: $0.02 for the Crunchbase records plus $0.07 of
  late search and scrape billing from earlier Phase 9 batches.
- **Spend:** Phase 9 total **$0.21 against the $0.20 allowance ($0.01
  over)**, caused by billing lag. Group `phases-09-11` has $0.27 left for
  phases 10–11; the study has $0.60 left of $6.04. No cap change.
- **Analyst draft:** the `owl` draft had wrong citations and rule breaks
  (e.g. a D-grade base, invented overlaps, a payout total booked as a yearly
  figure). The lead rebuilt the derived files from re-checked records; every
  change is listed in `data/raw/09-sizing/analyst-review.md`.
