# 00 — Context And Approach

Status: foundation document. No research has been run yet.
Roadmap: `ROADMAP.md` (11 phases, one area each).
Created: 2026-10-02.
Purpose: record what this research project is for, the working hypotheses, and
everything learned from the reference study about how to run rigorous
public-web market research with Bright Data. Every later phase document builds
on this file.

---

## 1. What We Are Trying To Do

### 1.1 The concept

A project aimed at people who want to experience modded games, with the
positioning **"democratizing modding for games"**. It would serve two kinds of
people:

- **Players (end users):** want to find, download, and play modded games,
  custom games, and ports without needing technical skill.
- **Aspiring creators:** have ideas for what they want to make but little
  coding experience, and face a steep learning curve.

A **Discord community** is planned alongside the product.

### 1.2 Scope of the research

- Mods and modding communities.
- People making custom or fan-made games.
- **Ports:** legacy games and games from other platforms brought to PC
  (a major focus).
- **Rust ports:** games rebuilt or ported using the Rust programming language
  (confirmed meaning — not the survival game _Rust_).
- Reviving dormant intellectual property (IP) from people's childhoods.
- The target demographic and how real it is.
- Competitive analysis: Nexus Mods and similar sites.

### 1.3 The offering (undecided)

The owner's current view is **both**: a hub to find and play mods **and** tools
that help beginners create. This is not settled. The research must test both
directions and show where the real gap (if any) is.

### 1.4 The non-negotiable rule: objectivity

The owner's notes are **working hypotheses, a starting point only**. Evidence
that contradicts them is as valuable as evidence that supports them. Under no
circumstances should the research be skewed toward validation. See section 3.

---

## 2. Working Hypotheses

Each hypothesis will end with one verdict: **Supported, Partially supported,
Unproven, or Contradicted** (see 5.4). The "would contradict" column is a draft;
it must be finalized before any data is collected (see 3.2).

| ID  | Hypothesis (owner's notes, neutral wording)                                                | Draft evidence that would contradict it                                                              |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| H1  | The core audience is mainly aged 15–21.                                                    | Credible survey/platform data showing the modding/porting audience skews older (e.g. mostly 25+).    |
| H2  | Most of the audience arrives with little coding experience.                                | Active communities dominated by experienced developers; beginners a small minority.                  |
| H3  | A meaningful share only want to download and play, not create.                             | Evidence that players are already well served and show no unmet need; or nearly all visitors create. |
| H4  | Many have concrete ideas for what they want to make.                                       | Few public idea/request posts relative to download/consumption posts.                                |
| H5  | Many face a steep learning curve and don't know where to start.                            | Existing tutorials/tools widely described as sufficient; few "where do I start" complaints.          |
| H6  | Many are eager to make their own individual game.                                          | Interest concentrates on modding existing games rather than making new ones.                         |
| H7  | Many want to take over / revive dormant IPs from their childhood.                          | Little revival demand; or demand exists but legal risk makes it non-viable (see 6.5).                |
| H8  | Porting legacy and other-platform games to PC is a big, important part of the demand.      | Port interest is niche, concentrated in a few titles, or fully served by existing projects.          |
| H9  | Rebuilding/porting games in Rust is a relevant part of this market.                        | Rust game ports are rare, developer-only, and absent from the target audience's conversations.       |
| H10 | There is unmet demand for "democratized" modding (lower barriers to playing and creating). | Existing platforms/tools already make modding easy enough; complaints focus elsewhere.               |
| H11 | Nexus Mods and similar sites leave a gap this project could fill.                          | Incumbents already cover beginners, ports, and creation; switching reasons are weak.                 |
| H12 | Discord is where this audience gathers and a community there is a viable channel.          | Audience gathers mainly elsewhere; or Discord modding spaces are saturated by existing servers.      |

---

## 3. Objectivity Rules (Anti-Confirmation-Bias Protocol)

### 3.1 Neutral queries

Queries describe a topic, never the expected answer. Search
`modding community age`, not `young modders struggle`.

### 3.2 Pre-registration

Before collecting data for a phase, write down for each hypothesis what evidence
would support it, what would contradict it, and what would leave it Unproven.
Do not change these criteria after seeing results; if they must change, record
the change and the reason.

### 3.3 Disconfirmation searches

Every hypothesis gets queries specifically designed to find counter-evidence
(e.g. experienced adult modders, players satisfied with existing sites,
failed fan ports).

### 3.4 Honest limits

If public web data cannot settle a question, the verdict stays **Unproven**. It
is never nudged toward Supported.

### 3.5 Independent verification

A separate reviewer re-checks findings against the cited sources before any
verdict is final.

### 3.6 Visibility is not demand

Search-result counts measure what is publicly visible and indexable. They are
not market share, audience size, or buying intent.

---

## 4. The Reference Study

### 4.1 What it is

A private business-plan document set for **Site Bench** (an SEO/QA audit tool),
supplied as a methodology reference only. Its subject matter is unrelated to
this project.

- Location: `C:\Users\SPARTAN PC\Downloads\business-plan (2)\business-plan`
- 14 documents plus overview pages, 57,405 words, 934 sections, generated
  25/07/2026.
- All 23 HTML pages were read in full.
- Research engine: **Bright Data MCP** (Google search plus page fetches).

### 4.2 Raw data not available

The study links to five data files in a `research` folder that was not supplied,
and the owner confirmed they do not have them:

- `PUBLIC_WEB_1000_QUERY_LEDGER.csv`
- `PUBLIC_WEB_1000_QUERY_SUMMARY.json`
- `PUBLIC_WEB_DEEP_SAMPLE_LEDGER.csv`
- `PUBLIC_WEB_DEEP_SAMPLE_SUMMARY.json`
- `PUBLIC_WEB_SOURCE_INDEX.csv`

The method is rebuilt from the documents. The exact query set cannot be copied.

---

## 5. The Methodology Learned

### 5.1 Large structured public-web search (the core method)

**Design.** A full cross of dimensions, run as Google searches through Bright
Data:

- 20 platforms × 10 themes × 5 intents = **1,000 queries**.
- Platforms used: Reddit, LinkedIn, X, Facebook, Instagram, YouTube, TikTok,
  GitHub, Product Hunt, Hacker News, Indie Hackers, Dev.to, Medium, Stack
  Overflow, Quora, Threads, Bluesky, Pinterest, Hashnode, G2.
- Intents: recommendation, pricing, alternative, problem, automation.
- Query shape: `site:<platform> "<theme phrase>" <intent>`, e.g.
  `site:reddit.com "SEO audit tool" recommendation`.

**Funnel reported.** 1,000 queries → 824 with results → 6,811 result rows →
4,561 unique URLs → 132 hosts.

**Signal extraction.** Fixed keyword groups matched against result titles and
snippets (theirs: AI, automation, price, agency, prioritization, monitoring,
pre-launch, trust), plus competitor-mention counts.

**Deep sample.** The top 5 recurring URLs per platform (100 total) were fetched
in full: 96 fetched, 56 contained substantive on-topic content. TikTok,
YouTube, Product Hunt, Quora, and Bluesky returned 0 of 5 usable pages (walls
or too little text).

**Stated limits.** Measures Google visibility only; not market share, not
buying intent; private groups excluded.

### 5.2 Competitor analysis from official pages

Collected through Bright Data from each competitor's own pages:

- Dated pricing snapshot: free tier, paid entry price, what is included.
- Feature matrix: each feature marked **Yes / Partial / Planned / No** across
  ~9 competitors.
- Separate integration matrix: availability, authentication, capability, depth
  of control, data breadth, pricing model.
- Head-to-head "stronger / weaker" lists per competitor.
- Numbered competitive risks and P0–P3 priorities.

### 5.3 Third-party statistics as context only

- Sources included developer surveys, vendor research, official platform
  guidance, and product-led-growth benchmarks.
- Published market-size reports disagreed wildly (≈$1.2B to $30B+), so the
  plan rejected them as decision inputs.
- Required instead: **bottom-up sizing** per segment —
  - TAM = addressable accounts × realistic annual spend
  - SAM = reachable accounts × reach
  - SOM = obtainable customers × revenue per customer
  - Low / base / high cases, every input dated and sourced.

### 5.4 Claim-checking against evidence

- Every claim gets a verdict: **Supported / Partially supported / Unproven /
  Contradicted / Planned**, with the evidence behind it and a required action.
- Failed claims were rewritten. Example: "MCP is our moat" was **Contradicted**
  because 393 URLs already used that language.
- **Assumption register:** assumption, evidence, confidence, test, owner, date.
- **Proof registry:** each public claim's source, version, and review date.
- Strict labelling of **current vs planned vs hypothesis** throughout.

### 5.5 Turning findings into strategy

**Personas** were built with these fields: snapshot, personality, emotional
state, core worry, jobs to be done, buying triggers, objections, decision
criteria, voice, best offer.

**Channel tiers** (from visibility plus fetchability):

- Tier 1 — test first: Reddit, LinkedIn, X, GitHub, Indie Hackers.
- Tier 2 — content: Dev.to, Medium, Stack Overflow, Hacker News, Facebook
  groups, Instagram.
- Tier 3 — visible but hard to verify: YouTube, TikTok, Product Hunt, Bluesky,
  Quora, Pinterest.

Social experiments compare messages on **qualified actions**, not reach.

### 5.6 What public web data cannot prove

Public data shows **attention, not buying**. Willingness to pay, retention,
acquisition cost (CAC), cost to serve, and conversion require direct tests:

- Activation stages A0–A4 tracked by cohort.
- Paid pilots and price A/B tests.
- 30-day (D30) retention.
- Channel scaling gate: ≥30 activated accounts, 2 comparable cohorts, and CAC
  under its ceiling.

### 5.7 Qualitative and validation tools (from the marketing plan)

These are reusable for the later, non-web-data stages:

- **Trigger-based prospecting:** score accounts 0–2 on 9 criteria (active
  trigger, accessible target, can act, volume, pain, decision access, test
  feasibility, expansion potential, authorization confidence). Prioritize
  ≥13/18. Triggers are observable events (launch, redesign, migration, new
  hire, public complaint).
- **Discovery interview bank:** five question groups — business, workflow,
  pain, economic, technical. Start with the current workflow and its cost, not
  a demo.
- **Pilot rules:** 14–30 days, named owners, written success criteria, decision
  date agreed up front; "we will see how it goes" is not a plan. One success
  criterion: buyer rates ≥80% of serious findings credible.
- **Funnel test thresholds** (explicitly not guarantees): positive reply 8–15%,
  URL submission from positive replies 40%+, completion 85%+, meaningful
  engagement 60%+, repeat within 14 days 25–40%, verified resolution 20%+,
  pilot-to-repeat 30%+, hard bounce <3%.
- **Pipeline:** MEDDPICC-lite with stages P0–P6 and exit evidence per stage.
- **Kill rules:** after 10 qualified conversations, drop a customer type if
  fewer than 3 have a live trigger, fewer than 2 act on results, no one asks for
  more, no one pays for a pilot, or no budget owner exists. Separate kill rules
  for channels, product, and pricing.
- **Value-based pricing:** hours saved × frequency × loaded hourly cost × 12,
  then discounted for adoption uncertainty.
- Bright Data was also used to collect sales frameworks and case studies
  (Gong, HubSpot, MEDDICC, Paddle), not only the search study.

### 5.8 Weaknesses to fix in our version

1. **Not reproducible:** raw outputs and scripts lived outside the deliverable.
   We store every query log, result set, and script inside this folder.
2. **Video/social pages failed plain fetching.** Bright Data's platform-specific
   scrapers may help; availability on the owner's account is unverified.
3. **Snippet keyword matching has no sentiment.** "Easy" and "not easy" count
   the same. Sentiment and stance must come from reading the deep sample.

---

## 6. Adapting The Method To This Project (Draft)

Everything in this section is a draft to be finalized in the methodology phase.

### 6.1 Candidate platforms

Reddit, YouTube, TikTok, X, Discord (public directories only — most Discord
content is not indexed), Nexus Mods, ModDB, GameBanana, CurseForge, mod.io,
Thunderstore, Steam Community / Workshop, itch.io, GitHub, Fandom wikis,
Twitch, ResetEra, Hacker News, game-specific forums, Rust community forums.

### 6.2 Candidate themes

Mod installation and playing, mod creation for beginners, game porting to PC,
decompilation / recompilation projects, Rust game rebuilds, fan games, dormant
or abandoned IP revival, modding tools and engines, learning resources,
community and Discord, legal takedowns.

### 6.3 Candidate intents

Recommendation, problem / struggle, how-to / learning, alternative /
comparison, showcase / request — plus deliberate disconfirmation queries.

### 6.4 Candidate competitors (to be confirmed by research)

Nexus Mods, ModDB, GameBanana, CurseForge, mod.io, Thunderstore, Steam
Workshop, itch.io (fan games), plus creator-side tools and engines for the
"tools for beginners" direction.

### 6.5 Risks the research must cover regardless of hypotheses

- **Age is hard to verify** from public data; H1 may stay Unproven without
  survey or platform data.
- **Legal and IP risk is central:** dormant IPs are usually still owned, and
  rights holders (Nintendo especially) have a history of shutting down fan
  games, ports, and emulators.
- **Minors in the audience** brings safety and compliance obligations for both
  the product and the Discord community.

### 6.6 Bright Data in this build

The reference study used Bright Data through MCP. This build has the Bright
Data CLI (`@brightdata/cli` 0.3.7, installed globally) with Google search
(`search`), page fetch (`scrape`), and platform extractors (`pipelines`) for
Reddit, YouTube, TikTok, X, Instagram, Facebook, Crunchbase, and GitHub files.
The app's own Bright Data connector is LinkedIn-only and is not used. The API
key is in Windows Credential Manager, so Phase 1 must build a safe key bridge.
Full details: `ROADMAP.md` section 1.1.

---

## 7. Data Requirements

### 7.1 Inputs to define before collection

| Input                                   | Reference study used     |
| --------------------------------------- | ------------------------ |
| Hypotheses with pre-registered criteria | ~20 business-plan claims |
| Platform list                           | 20 platforms             |
| Theme list                              | 10 themes                |
| Intent modifiers                        | 5 intents                |
| Competitor list with official page URLs | 9–13 competitors         |
| Signal keyword groups                   | 8 groups                 |
| Segments for bottom-up sizing           | 4 segments               |

### 7.2 Outputs every run must store in this folder

- Query log (every query, date, result count).
- Deduplicated source index (URL, host, platform, first-seen date).
- Coverage tables by platform, theme, and intent.
- Deep-sample log (URL, fetch status, usable yes/no, summary, stance).
- Competitor mention counts.
- Dated competitor snapshots (pricing, features, policies).
- Hypothesis verdict table with cited evidence.
- The scripts used to produce all of the above.

---

## 8. Owner Decisions So Far

| Date       | Decision                                                                   |
| ---------- | -------------------------------------------------------------------------- |
| 2026-10-02 | Reference study raw data is not available; rebuild method from documents.  |
| 2026-10-02 | "Rust ports" means games rebuilt in the Rust programming language.         |
| 2026-10-02 | Offering is both a play hub and beginner creation tools; research decides. |
| 2026-10-02 | Research runs in phases, one area per phase, with a sub-agent plan each.   |
| 2026-10-02 | Notes are hypotheses only; contradiction is as valuable as support.        |
| 2026-10-02 | Every phase collects evidence through Bright Data (already in this build). |
