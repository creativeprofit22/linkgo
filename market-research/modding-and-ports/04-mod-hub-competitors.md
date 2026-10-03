# 04 — Mod-Hub Competitors

Status: **complete, 2026-10-03; Verifier pass applied (section 11).** Market
research only, not Linkgo app code.

| Field       | Value                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Phase       | 4 of 11                                                                                                              |
| Hypotheses  | H3 (player side), H10 demand for easier modding, H11 a gap exists beside incumbents                                  |
| Bright Data | `scrape` official pages (dated 2026-10-03); `search`, `reddit_posts`, `youtube_comments` and forum scrapes for users |
| Team        | 2 Collectors (`bee`), 2 Analysts (`owl`), 1 Disconfirmer (`owl`), 1 fresh Verifier (`owl`)                           |
| Rules       | `01-research-protocol.md` §1.2–1.3 and §10 "Phase 4 pre-registration addendum" (written before any request)          |
| Raw data    | `data/raw/04-competitors/` (git-ignored; holds URLs)                                                                 |
| Derived     | `data/derived/04-competitors/` (no URLs, no handles)                                                                 |

**Citations.** `[r:<id>/<method>]` is a stored record: an official page or
forum thread (`scrape`), a Reddit post with comments (`reddit_posts`) or a
YouTube comment set (`youtube_comments`). In the matrices, a six-character
id such as `bdf20d` is the start of the page id; the full id and a verbatim
quote for every cell are in `feature-matrix.csv` and `policy-matrix.csv`.
`[q:<id>]` is a search query in `scripts/config/phase4-queries.json`; search
results are **visibility only** and never decide a count.

---

## Bottom Line

- **Incumbents already cover a lot.** Four hubs (Nexus Mods, CurseForge,
  Thunderstore, Steam Workshop) say on their own pages that they offer
  one-click or subscribe-to-install. Each one is large: Steam Workshop has
  3,000+ games, Thunderstore 110,000+ mods and Vortex supports 500+ games;
  itch.io, whose app installs games rather than mods, has over 1 million
  projects. Nexus Mods and CurseForge each report
  about $18m+ paid to creators.
- **What users complain about most is installs that break**, not finding
  mods. 16 of 24 install-themed rows are complaints: a manager pulls in
  unwanted mods, a game will not launch, an app will not open, a mod cannot
  be removed, or a game is missing from the manager. Discovery is mostly
  praised (7 of 11 rows), and beginner help draws no complaints (4 praise,
  5 neutral of 9 rows).
- **Switching is rare and stays among incumbents.** 2 of 62 records state a
  move: from mod.io to Steam Workshop (no extra sign-up) and from Steam
  Workshop to ModDB (mods the Workshop's content rules do not allow).
- **Ports and fan games are not discussed** in this sample (0 rows). itch.io
  and ModDB host standalone games.
- **Verdicts:** H11 **Partially supported**, only for the "installs break
  across hubs" sub-claim, low confidence. H3 (player side) **Unproven, leans
  support**. H10 **Unproven, balanced**. H3 and H10 are Unproven because all
  of their coded records are one source type (community posts). Section 10
  gives the counts.

---

## 1. Competitor Selection

Rule (addendum item 2): a hub is in if it hosts or distributes mods or fan
games for download **and** has ≥ 5 Phase 2 mention records
(`data/derived/02-public-web/mention-counts.csv`) or is on the starting list.
A hub named as a switching destination in ≥ 3 coded records would be added.

| Hub              | Phase 2 mentions                | Category fit                            | Decision                 |
| ---------------- | ------------------------------- | --------------------------------------- | ------------------------ |
| Thunderstore     | 65 (+ r2modman 12)              | Mod hub with its own manager            | In                       |
| Nexus Mods       | 43 (+ "nexusmods" 8, Vortex 15) | Mod hub with its own manager (Vortex)   | In                       |
| CurseForge       | 41                              | Mod hub with its own app                | In                       |
| itch.io          | 29                              | Indie and fan-game store                | In (games, not mods)     |
| GameBanana       | 11                              | Mod hub                                 | In                       |
| Steam Workshop   | 9                               | Mod hub built into Steam                | In                       |
| mod.io           | 8                               | Mod hub and in-game SDK for studios     | In                       |
| ModDB            | 7                               | Mod and game hub                        | In                       |
| Vortex, r2modman | 15, 12                          | Install tools of Nexus and Thunderstore | Covered under their hubs |

**No additions.** Switching destinations in the coded records: Steam Workshop
1, ModDB 1. Two other places are named once each (a store that hosts some
mods, and one game's in-game mod hub). None reaches 3. Caveat carried from
Phase 2: some mention counts are inflated because the query matrix searched
these hubs' own sites.

---

## 2. Dated Snapshot Table

All snapshots are dated **2026-10-03**. URLs are listed in
`scripts/config/phase4-official-pages.json` and the resolved lookups
(`data/raw/04-competitors/plans/`). Full rows are in `snapshots.csv`.

| Hub            | Pages usable / planned | Free offer                             | Paid tiers                                                           | Creator money                                        | Manager / install                          | Games                              |
| -------------- | ---------------------- | -------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------ | ---------------------------------- |
| Nexus Mods     | 6 / 6                  | Free mods                              | Premium membership (price not captured)                              | Rewards programme, "$18.7m+", PayPal payouts         | Vortex, Windows; 1-click collections       | Vortex: 500+                       |
| CurseForge     | 6 / 6                  | Free mods (stated on one game's rules) | Premium "From $2.50/Month"; premium mods, authors get 50% (one game) | "$18M+" paid since 2020; points via a payout service | Own app, one click                         | 128 listed                         |
| ModDB          | 2 / 2                  | Downloadable mods and games            | Ad-free subscription                                                 | Unknown                                              | Unknown                                    | Windows, Linux, Mac games and mods |
| GameBanana     | 1 / 1                  | Unknown (short page)                   | None: no paywalls, never sells mods; ad-funded                       | Unknown                                              | Unknown                                    | Unknown                            |
| mod.io         | 1 / 4                  | Unknown                                | Unknown (studio analytics tiers only)                                | Unknown (page not captured)                          | In-game, through the studio SDK            | Per game, via studio               |
| Thunderstore   | 3 / 3                  | Free mods                              | Manager lists an optional subscription                               | Unknown                                              | Own manager, Windows; install from manager | 110,000+ mods, 300+ games          |
| Steam Workshop | 2 / 3                  | Free by default                        | Unknown                                                              | Possible, set per game                               | Inside the Steam Client; subscribe         | 3,000+ games, 50M+ items           |
| itch.io        | 5 / 5                  | Free indie games                       | No user subscription stated                                          | Sales; creator picks the store's share, 0–100%       | itch app (Windows, macOS, Linux)           | Over 1 million projects            |

**Capture.** 30 official pages were planned and fetched. **26 were usable.**
The mod.io home, terms and creator-rewards pages returned only a title after
two retries, and the Steam Workshop legal-agreement page returned only site
navigation. Of 38 slots with no known URL, the `site:` lookups filled 12; the
other 26 are "no page found", and their matrix cells are Unknown unless
another page settles them (`official-lookups-log.json`).

---

## 3. Feature Matrix

Cell rule (addendum item 7): **Yes** = an official page states it;
**Partial** = limited scope; **Planned** = official roadmap; **No** = the
relevant official page exists and does not offer it; otherwise **Unknown**.
Every non-Unknown cell has a verbatim quote, checked by a script against the
stored page. Totals across 96 cells: **Yes 44, Partial 11, Planned 0,
No 6, Unknown 35.**

| Feature                   | Nexus Mods   | CurseForge       | ModDB            | GameBanana  | mod.io           | Thunderstore     | Steam Workshop   | itch.io          |
| ------------------------- | ------------ | ---------------- | ---------------- | ----------- | ---------------- | ---------------- | ---------------- | ---------------- |
| Free download             | Yes `bdf20d` | Partial `708ae5` | Yes `d59e87`     | Unknown     | Unknown          | Yes `4a7e35`     | Yes `4b95ba`     | Yes `5288b5`     |
| Paid membership           | Yes `328942` | Yes `c522c1`     | Partial `d59e87` | No `329623` | Unknown          | Partial `e3f1fa` | Unknown          | Unknown          |
| Creator payouts           | Yes `2c3a4d` | Yes `c522c1`     | Unknown          | Unknown     | Unknown          | Unknown          | Partial `f49b95` | Yes `ad770d`     |
| Own manager or client     | Yes `386228` | Yes `c522c1`     | Unknown          | Unknown     | Partial `9393e9` | Yes `4a7e35`     | Yes `4b95ba`     | Yes `20dfb1`     |
| One-click install         | Yes `386228` | Yes `e3b8df`     | Unknown          | Unknown     | Partial `9393e9` | Yes `e3f1fa`     | Yes `4b95ba`     | Yes `20dfb1`     |
| Many games                | Yes `386228` | Yes `e3b8df`     | Yes `e3613c`     | Unknown     | Partial `9393e9` | Yes `4a7e35`     | Yes `4b95ba`     | Yes `bf6393`     |
| Standalone or fan games   | No `bdf20d`  | No `c522c1`      | Yes `e3613c`     | Unknown     | Unknown          | Unknown          | No `4b95ba`      | Yes `5288b5`     |
| Beginner install guide    | Yes `386228` | Unknown          | Unknown          | Unknown     | Unknown          | Unknown          | Unknown          | Unknown          |
| Creation docs or tools    | Yes `2c3a4d` | Yes `e3b8df`     | Unknown          | Unknown     | Yes `9393e9`     | Yes `4a7e35`     | Unknown          | Yes `bf6393`     |
| Console or cross-platform | No `386228`  | Partial `708ae5` | Partial `e3613c` | Unknown     | Unknown          | No `4a7e35`      | Unknown          | Partial `20dfb1` |
| API or SDK for studios    | Yes `25ec7e` | Yes `e3b8df`     | Partial `e3613c` | Unknown     | Yes `9393e9`     | Yes `4a7e35`     | Unknown          | Yes `ad770d`     |
| Curation or moderation    | Yes `25ec7e` | Yes `e3b8df`     | Yes `d59e87`     | Unknown     | Unknown          | Yes `95cec4`     | Unknown          | Yes `bf6393`     |

Notes: CurseForge "Partial" cells come from one game's guidelines page.
ModDB's API cell points studios to its sister service, mod.io. Steam
Workshop's "own client" is the Steam Client itself. itch.io's app downloads
and runs games, not mods. The lead corrected or dropped 11 analyst cells
whose quotes did not match the page or that the analyst misread (each
logged with its reason in `work/a1-corrections.csv`).

---

## 4. Policy Matrix

| Hub            | Takedown / DMCA                           | IP and licence                                      | Minimum age                                | Adult content                                    | Creator terms                                       | Paid mods                                   |
| -------------- | ----------------------------------------- | --------------------------------------------------- | ------------------------------------------ | ------------------------------------------------ | --------------------------------------------------- | ------------------------------------------- |
| Nexus Mods     | IP claims process `25ec7e`                | Uploader keeps ownership `25ec7e`                   | 18+, or 13+ with parental consent `25ec7e` | Allowed, 18+ only `25ec7e`                       | Rewards are discretionary, not contractual `25ec7e` | Unknown                                     |
| CurseForge     | Unknown                                   | Authors grant the operator a broad licence `a51eb6` | Unknown                                    | Banned on one game's rules `708ae5`              | Published mod-author terms `a51eb6`                 | Yes, premium mods `a51eb6`                  |
| ModDB          | DMCA process `d59e87`                     | Non-exclusive licence `d59e87`                      | 13+ `d59e87`                               | Pornographic content banned `d59e87`             | Uploader responsible `d59e87`                       | Unknown                                     |
| GameBanana     | Unknown                                   | Unknown                                             | Unknown                                    | Unknown                                          | Unknown                                             | No; "never" sells mods `329623`             |
| mod.io         | Unknown (terms not captured)              | Unknown                                             | Unknown                                    | Unknown                                          | Unknown                                             | Unknown                                     |
| Thunderstore   | Unknown                                   | Unknown                                             | Unknown                                    | Allowed if flagged NSFW `95cec4`                 | Unknown                                             | Unknown                                     |
| Steam Workshop | Unknown (page navigation only)            | Unknown                                             | 13+ `f49b95`                               | Unknown                                          | Pay set by each game's terms `f49b95`               | Free by default; paid by exception `f49b95` |
| itch.io        | DMCA notices and counter-notices `54c2f2` | Creators keep ownership `54c2f2`                    | 13+ `54c2f2`                               | Allowed; shown only to users who opt in `bf6393` | Creator sets the store's share, 0–100% `ad770d`     | Creators set prices `54c2f2`                |

The Steam subscriber agreement was stored in a non-English language version.
Its quotes are verbatim in that language (meaning given in the CSV).

---

## 5. What Users Say

**Sample** (addendum item 5, picked blind to titles and snippets): 48 Reddit
posts with comments, 6 YouTube comment sets (12 comments each) and 8 forum
threads, for **62 records**. 56 are usable, 49 discuss at least one hub, and
there are 56 hub rows (one row per record × hub). Coders read **433 people**
in total, 403 of them in hub records. 6 records are unusable (crawler errors
or empty pages), and 7 usable records discuss no hub.

| Platform | Records | Usable | Discuss a hub |
| -------- | ------- | ------ | ------------- |
| Reddit   | 48      | 45     | 44            |
| YouTube  | 6       | 6      | 3             |
| Forums   | 8       | 5      | 2             |

**Tone per hub (rows):**

| Hub            | Rows | Praise | Complaint | Neutral | Mixed |
| -------------- | ---- | ------ | --------- | ------- | ----- |
| Nexus Mods     | 13   | 6      | 3         | 2       | 2     |
| mod.io         | 9    | 0      | 6         | 2       | 1     |
| ModDB          | 9    | 3      | 3         | 3       | 0     |
| Steam Workshop | 6    | 2      | 3         | 1       | 0     |
| CurseForge     | 5    | 0      | 3         | 2       | 0     |
| Thunderstore   | 4    | 1      | 2         | 1       | 0     |
| GameBanana     | 4    | 1      | 2         | 1       | 0     |
| itch.io        | 4    | 2      | 2         | 0       | 0     |
| Other (2)      | 2    | 0      | 1         | 0       | 1     |
| **Total**      | 56   | 15     | 25        | 12      | 4     |

**Themes (rows):**

| Theme             | Rows | Praise | Complaint | Neutral | Mixed |
| ----------------- | ---- | ------ | --------- | ------- | ----- |
| Install           | 24   | 3      | 16        | 3       | 2     |
| Discovery         | 11   | 7      | 2         | 2       | 0     |
| Beginner help     | 9    | 4      | 0         | 5       | 0     |
| Other             | 6    | 0      | 4         | 2       | 0     |
| Policy/moderation | 6    | 1      | 3         | 0       | 2     |
| Creator pay       | 0    | –      | –         | –       | –     |
| Ports/fan games   | 0    | –      | –         | –       | –     |

What the rows say, in short:

- **Install complaints are mostly about things breaking.** Examples: a
  manager pulls in about 70 unwanted mods `[r:01f8f2dc5e421baf/reddit_posts]`,
  a game will not launch through a manager `[r:06d99edeb2d59ac6/reddit_posts]`,
  an app will not open `[r:559d2217956205db/reddit_posts]`, a removed mod
  keeps coming back `[r:0c609d192900da52/reddit_posts]`, and a game shows on
  the site but is missing in the manager
  `[r:3456b733692bdd6b/youtube_comments]`.
- **Ease is praised too.** A manager is called far easier than installing by
  hand `[r:1e2818431e37f9ef/reddit_posts]`, a manager is called easy to use
  `[r:d5aa0a2db8275a74/scrape]`, and players say they love Steam Workshop
  `[r:0544e6de3d3c7bc5/reddit_posts]`.
- **Outages are a separate complaint.** Site outages and slow or failed
  downloads appear for GameBanana, Nexus Mods and ModDB
  `[r:1558e14c3c50f01f/reddit_posts]` `[r:95527676e6ff6e62/reddit_posts]`
  `[r:1bc20fda5a29bc74/reddit_posts]`.
- **Creators** (3 records) report reach and support problems: one creator's
  same mod has about 10× more downloads on Nexus than on mod.io
  `[r:040a5b2db03aa3db/reddit_posts]`, and a store auto-flagged a creator's
  page and sent no reply `[r:08155633df35c423/reddit_posts]`.

**Switching reasons** (the only 2 records that state one):

| From           | To             | Reason                                                        | Record                              |
| -------------- | -------------- | ------------------------------------------------------------- | ----------------------------------- |
| mod.io         | Steam Workshop | mod.io needs a separate account; the Workshop is inside Steam | `[r:08acba205de0b775/reddit_posts]` |
| Steam Workshop | ModDB          | Workshop rules exclude mods of licensed properties            | `[r:4db65de3c33d66d5/reddit_posts]` |

**Who is speaking.** Of 49 hub records, 36 are play-only (73%), 10 are from
people who both play and create, and 3 are creator-only. The frozen queries
asked about installing, beginners, praise and problems, so this share comes
from the query design. It is not a population estimate.

---

## 6. Head-To-Head

These facts come only from sections 3–5. An Unknown cell is never counted
as a weakness.

| Hub            | Clearly stronger                                                                                                                                      | Clearly weaker                                                                                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nexus Mods     | Own manager with 1-click collections for 500+ games; the only official beginner guide found; $18.7m+ creator rewards; most praised hub (6 of 13 rows) | Manager is Windows-only; no standalone games; criticism of policy and direction `[r:122b5af3e3cc260a/reddit_posts]`; outage `[r:95527676e6ff6e62/reddit_posts]`; manager setup failures `[r:880118c33085e3f7/reddit_posts]` |
| CurseForge     | One-click app; 128 games; $18M+ paid to creators; every mod scanned and moderated; API key for studios                                                | 0 praise and 3 complaints in 5 rows (app will not open, a mod cannot be found in the app, modpack switching); free downloads and console stated only on one game's page                                                     |
| ModDB          | Hosts games as well as mods (Windows, Linux, Mac); clear DMCA and 13+ rules; a destination when the Workshop refuses a mod                            | Slow downloads `[r:1bc20fda5a29bc74/reddit_posts]`; install errors `[r:189e341804d45406/reddit_posts]`; download button hard to find `[r:08c2ce78af889e7f/youtube_comments]`                                                |
| GameBanana     | Pledges no paywalls and never selling mods; staff responded publicly to a moderation incident `[r:209e20c67d45c843/reddit_posts]`                     | Outages and download timeouts `[r:1558e14c3c50f01f/reddit_posts]` `[r:023df34970c58d5d/reddit_posts]`; 11 of 12 feature cells Unknown                                                                                       |
| mod.io         | In-game SDK for studios; documented upload steps                                                                                                      | Least liked: 0 praise, 6 complaints in 9 rows. Extra sign-up avoided `[r:08acba205de0b775/reddit_posts]`, far lower reach than Nexus, no bundling, mods hard to remove, console limits                                      |
| Thunderstore   | 110,000+ mods across 300+ games; own manager installs directly; praised as far easier than manual installs                                            | Manager is Windows-only; manager pulls unwanted mods; a game will not launch through it                                                                                                                                     |
| Steam Workshop | Largest catalogue (3,000+ games, 50M+ items); built into Steam, subscribe to install; praised for ease                                                | No standalone games; content rules push some mods elsewhere; a browsing change hides trending mods `[r:4a83ee16c8dc2476/reddit_posts]`; paid items only by exception                                                        |
| itch.io        | Over 1 million projects, including free standalone games; creators set the store's share (0–100%); desktop app for 3 systems                          | Not a mod hub; a creator's page was auto-flagged with no reply `[r:08155633df35c423/reddit_posts]`                                                                                                                          |

---

## 7. Gaps And Non-Gaps

Rule (addendum item 8): an incumbent **covers** a need only when an official
page offers it **and** users are not mostly complaining about it. A **gap**
needs both no coverage and user records that state the need.

| #   | Need                               | Official coverage                                               | Users                                                                                              | Result                                       |
| --- | ---------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| G1  | Installs that work reliably        | One-click install of mods: Yes for 4 hubs, Partial for mod.io   | 16 of 24 install rows are complaints, spread across 8 hubs plus one other                          | **Gap** (moderate, all from community posts) |
| G2  | One place across hubs and accounts | None found                                                      | 3 records: separate sign-up avoided, two managers side by side, switching modpacks without the app | **Weak gap**: only 3 records                 |
| N1  | Discovering mods                   | Large catalogues for 6 hubs                                     | 7 of 11 discovery rows praise                                                                      | **Non-gap**                                  |
| N2  | Beginner help                      | Nexus guide (Yes); others Unknown                               | 4 praise, 0 complaints, 5 neutral of 9; community guides praised                                   | **Non-gap** (for Nexus users)                |
| N3  | Free access to mods                | Free downloads: Yes for 5 hubs                                  | No complaints about price                                                                          | **Non-gap**                                  |
| N4  | Creator pay exists                 | Yes for Nexus, CurseForge and itch.io; Partial for the Workshop | 0 creator-pay rows                                                                                 | **Non-gap** on offer; satisfaction unknown   |
| U1  | Ports and fan games                | itch.io and ModDB host games; 3 hubs do not                     | 0 rows                                                                                             | **Unknown**: no stated need (Phase 6)        |
| U2  | Creation help                      | Docs or tools for 5 hubs                                        | 3 creator-only records                                                                             | **Unknown**: too few records (Phase 5)       |
| U3  | Console and other systems          | No for Nexus and Thunderstore; Partial for 3 hubs               | 1 record on console limits `[r:49d1403da6f87c11/reddit_posts]`                                     | **Unknown**                                  |

---

## 8. Disconfirming Evidence

The Disconfirmer (`owl`) looked for evidence that incumbents already serve
beginners, players and ports well. Its report is in
`data/raw/04-competitors/work/disconfirmer-report.md`; the lead corrected 2
of its counts there.

- **Beginners are served (strong).** Vortex offers 1-click installs of mods
  and collections, plus official guides `[r:38622826cde16ea8/scrape]`;
  CurseForge offers single-click installs `[r:e3b8dfe14d158e9b/scrape]`;
  Steam Workshop is subscribe-to-install inside Steam
  `[r:4b95ba787bcc0f6f/scrape]`. Users praise a manager as far easier than
  manual installs `[r:1e2818431e37f9ef/reddit_posts]` and a community guide
  for its clear steps `[r:4a88116f6d6e7b2b/reddit_posts]`.
- **Players are served (strong).** The catalogues are very large (section 2).
  Players praise the Workshop's ease and discovery
  `[r:0544e6de3d3c7bc5/reddit_posts]`, and discovery rows are mostly praise.
- **Ports and fan games have homes (moderate).** itch.io hosts free
  standalone games `[r:5288b5c20ec0be33/scrape]`, and ModDB covers games
  as well as mods `[r:e3613c86d4b1a17d/scrape]`. A neutral search shows fan
  ports listed on community wikis, archives and blogs `[q:a4-x03]`
  (visibility only).
- **Friction may not be the main problem (moderate).** Outages and slow
  downloads make up part of the complaints (section 10, H10). In the switching
  record, players leave mod.io because of the extra account, which is about
  hubs being split up rather than the tools being hard
  `[r:08acba205de0b775/reddit_posts]`.
- **Incumbents already curate (visibility only).** A neutral search on
  collections led with Nexus's curator rewards and an install wiki for
  collections `[q:a4-x04]`.

Six neutral queries proposed by the Disconfirmer were added to the frozen
list before they ran (`a4-x01`–`a4-x06`). 4 returned results and 2 were
blocked. One (`a4-x01`) matched unrelated pages and adds nothing.

---

## 9. Competitive Risks

1. **Scale and network effects.** Steam Workshop (3,000+ games, 50M+ items),
   Thunderstore (110,000+ mods), Vortex (500+ games) and itch.io (1M+
   projects) already have the content and the audience.
2. **"Easy install" is already claimed.** Four hubs say on their own pages
   that they offer one-click or subscribe-to-install. A new entrant must win
   on whether installs actually work, not on the claim.
3. **Creator money and reach lock creators in.** Nexus Mods ($18.7m+) and
   CurseForge ($18M+) pay creators. One creator saw about 10× more downloads
   for the same mod on Nexus than on mod.io
   `[r:040a5b2db03aa3db/reddit_posts]`. A new hub starts with no audience.
4. **Distribution built into platforms.** The Workshop lives inside Steam,
   and mod.io sits inside games through studio SDKs. Users avoid an extra
   account `[r:08acba205de0b775/reddit_posts]`, which also counts against a
   new standalone hub.
5. **Free is expected.** GameBanana pledges never to sell mods
   `[r:32962383fdeaf3a4/scrape]`, and most hubs offer free downloads, so
   charging players is hard.
6. **Incumbents respond.** Staff answered a moderation incident publicly
   `[r:209e20c67d45c843/reddit_posts]`, and Nexus pays collection curators
   `[q:a4-x04]` (visibility).
7. **IP and policy load.** The captured terms of Nexus Mods, ModDB and
   itch.io all set IP, takedown and age rules, and the Workshop excludes
   licensed-property mods
   `[r:4db65de3c33d66d5/reddit_posts]`. Ports and fan games add IP risk
   (Phase 7).

---

## 10. Verdicts

Minimum (`01` §1.2): at least 20 on-topic coded records from at least 3
platforms and at least 2 source types. Phase 4's coded user records come
from 3 platforms (Reddit, YouTube, forums), but all are one source type,
(b) community posts. Official pages are type (c). They are coded into the
matrices, not with H3 or H10 stances, and addendum item 8 brings them into
H11 only.

| Hypothesis     | On-topic | Supports | Contradicts | Neutral | Platforms (on-topic) | Source types | Minimum met? | Verdict                             |
| -------------- | -------- | -------- | ----------- | ------- | -------------------- | ------------ | ------------ | ----------------------------------- |
| H3 player side | 46       | 25 (54%) | 7 (15%)     | 14      | 3                    | b            | No           | **Unproven, leans support**         |
| H10            | 50       | 20 (40%) | 21 (42%)    | 9       | 3                    | b            | No           | **Unproven, balanced**              |
| H11            | 48       | 20 (42%) | 8 (17%)     | 20      | 3                    | b + c        | Yes          | **Partially supported** (sub-claim) |

### H3 (player side) — Unproven, leans support. Confidence: low.

- 36 of 49 hub records are play-only. Of those 36, 22 report an unmet need
  (installs that break, downloads, finding a mod in an app), 7 say they are
  well served, and 7 are neutral.
- The share test cannot be used here: the share comes from the query design
  (section 5).
- **Phase 4 does not change the overall H3 verdict.** Phase 3's Partially
  supported stands, and the player-side evidence here points the same way.

### H10 — Unproven, balanced. Confidence: low.

- 20 records name install, setup, tool or learning friction as the main
  problem; 21 describe tools as easy enough or complain about something
  else, such as outages, performance, policy or reach.
- **Check:** coders split download failures inconsistently. Counting all
  service failures as not-friction gives 17 vs 24 (34% vs 48%); counting
  them all as friction gives 23 vs 18 (46% vs 36%). The verdict is Unproven
  either way, because the source-type minimum is not met.
- This weakens Phase 2's "leans support" (16 of 20): once users of existing
  managers are sampled, ease is about as common as friction.

### H11 — Partially supported, only for "installs break across hubs". Confidence: low.

- **Support leads:** 42% support vs 17% contradict (the rule needs ≥ 40% and
  above the contradict share). Official pages (type c) are combined with the
  user records as addendum item 8 requires.
- **Supported sub-claim (G1):** official one-click install exists, but users
  of 8 hubs mostly complain that installs break, so under item 8 that need is
  not "covered".
- **Not supported:** beginners (N2, served), ports and fan games (U1, no user
  evidence), creation (U2, too few records).
- **Switching:** both stated reasons point from one incumbent to another,
  not to a missing kind of service. This keeps H11 below Supported.
- Compared with Phase 2's 3–3 split, there is now a lean, but it covers one
  sub-claim only.

---

## 11. Verifier Report

Fresh `owl` Verifiers, run in three passes on 2026-10-03, with no part in
collection or coding. They worked from raw reading copies, derived tables, the
ledger and the run log.

| Pass                | Scope                                                                                                                                  | Result                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Claims and counts   | Recounted sections 5 and 10 from `sentiment-coding.csv`; reapplied the verdict rules; checked sections 1, 3 and 12 and the Bottom Line | 10 claims checked: 10 confirmed, 0 dropped, 0 downgraded |
| Records and cells 1 | Opened 11 cited records and 1 extra page; 18 matrix cells (incl. every No cell); snapshot figures                                      | All confirmed; 1 loose paraphrase                        |
| Records 2           | Opened the remaining 19 cited records and checked their coding against the codebook and their matrix cells                             | 19 confirmed, 0 dropped, 0 recoded                       |

- **All 30 cited records were opened** across passes 2 and 3. The Verifiers
  found no handles, no names and no quotes from anyone under 18.
- **Applied:** "dozens of unwanted mods" was changed to "about 70 unwanted
  mods" (`01f8f2…`; the post says 70).
- **Verdicts:** the Verifier reached the same verdicts on its own: H3
  Unproven (leans support), H10 Unproven (balanced), H11 Partially supported
  for the install-reliability sub-claim only.
- **Already fixed before the Verifier ran:** the lead corrected or dropped
  11 matrix cells (`work/a1-corrections.csv`). It also logged 19
  sentiment-coding corrections, including 4 records sent back for full
  re-coding (`work/a2-lead-corrections.csv`). A
  mechanical quote check now finds every non-Unknown matrix cell and every
  coded hub row word for word in its cited file.
- **Limits of the check:** the Verifiers are the same model family as the
  analysts. Disagreements about H10 coding (whether outages count as
  friction) are judgement calls; section 10 shows that H10 stays Unproven
  under either reading.

---

## 12. Run Log And Spend

| Batch                                                                         | Items                  | OK (final)            | Ledger spend        |
| ----------------------------------------------------------------------------- | ---------------------- | --------------------- | ------------------- |
| Lookup searches (`a4-l*`) + 2 retries                                         | 8 queries              | 8                     | $0.020              |
| Official page scrapes + 2 retries                                             | 30 pages, 34 attempts  | 30 fetched, 26 usable | $0.070              |
| Community (`a4-c*`, `a4-y*`) and disconfirmation (`a4-d*`) searches + retries | 56 queries             | 54 (2 blocked)        | $0.170              |
| Forum thread scrapes                                                          | 8                      | 8 fetched, 5 usable   | $0.010              |
| `reddit_posts` (12 chunks + 1 re-run)                                         | 48 posts               | 48 (45 usable)        | $0.260              |
| `youtube_comments`                                                            | 6 videos × 12 comments | 6                     | $0.210              |
| Disconfirmer additions (`a4-x*`)                                              | 6 queries              | 4 (2 blocked)         | $0.000¹             |
| **Total**                                                                     | **33 ledger entries**  |                       | **$0.740 of $1.00** |

¹ Booked $0, probably because the account's cost counter had not caught up
(as in Phase 3). The 6 searches would cost about $0.01.

- **Search attempts:** 90 attempts for 70 queries. 66 ended ok and 4 ended
  blocked (`a4-d05`, `a4-d07`, `a4-x02`, `a4-x05`).
- **Reddit chunk 1** stopped after 2 of 4 posts because its ceiling ($0.27)
  left less than the runner's $0.25 hold. The 2 missing posts were re-run
  with the same item ids.
- **Ledger:** 33 Phase 4 entries, all settled, 0 open. Zone share $0.29 plus
  pipeline estimates $0.45 = **$0.74**, within the $1.00 allocation.
  `phases-03-08` group: $0.96 + $0.74 = **$1.70 of $2.43**, leaving **$0.73
  for phases 5–8**. Study ledger: $3.35 of the $5 cap.
- **Reconciliation (three figures side by side):**

  | Measure                                | Before Phase 4                    | After Phase 4           |
  | -------------------------------------- | --------------------------------- | ----------------------- |
  | Live zone meter (`budget zones` TOTAL) | $1.58                             | $1.90                   |
  | Ledger, estimated study spend          | $2.79 (zone + pipeline estimates) | $3.35                   |
  | Owner's dashboard                      | under $1 spent, about $4.20 left  | not re-read by the lead |

  The zone meter rose $0.32 against the ledger's $0.29 zone share. The ledger
  books pipelines at $0.005 per record, an estimate that errs high. Phases
  5–8 have $0.73 left by ledger. Any cap change is a separate, logged owner
  decision; the ledger was not hand-edited.

- **Team:** Collector C1 (`bee`) ran the lookups and the first official
  batch, then stopped at its 10-minute limit; the lead let its runner finish
  and resolved the lookup retries. Collector C2 (`bee`) ran the community and
  disconfirmation retries and the official retry round 2. The long pipeline
  batches (Reddit, YouTube, forum) and the main community search batch ran as
  lead background tasks (plan rule: batches longer than about 8 minutes).
  A1 (`owl`, 5 slices by hub; it replaced a first single-agent attempt that
  was not used) and A2 (`owl`, 8 slices in 2 waves) returned
  text; the lead saved it, checked every quote with a script, and logged
  every correction (`work/a1-corrections.csv`, `work/a2-lead-corrections.csv`).
- **Derived files** (`data/derived/04-competitors/`): `snapshots.csv`,
  `feature-matrix.csv`, `policy-matrix.csv`, `sentiment-coding.csv`,
  `query-log.csv`, `source-index.csv`, `fetch-rates.csv`.
- **Fetch rates:** 92 items, 96 attempts, 92 ok; 62 coded, of which 56 are
  usable. The official pages' usability (26 of 30) is in `snapshots.csv`.
- **New script:** `scripts/sample-competitors.mjs` (hypothesis-blind
  sampler, with tests). `scripts/fetch-rates.mjs` gained a `--coding` option;
  its default and Phase 3 output are unchanged.
