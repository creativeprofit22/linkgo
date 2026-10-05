# 07 — Legal, IP And Safety

Status: **complete, 2026-10-03; Verifier pass applied (section 10).**
Market research only, not Linkgo app code.

**This is evidence gathering, not legal advice.** The output is a brief for a
qualified lawyer, not a decision.

| Field       | Value                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| Phase       | 7 of 11                                                                                                  |
| Hypotheses  | H7 dormant IP revival; legal and safety risk for every other hypothesis                                  |
| Bright Data | `search` (news and web), `scrape` of policy pages, case articles and revival pages (no social pipelines) |
| Team        | Lead as Collector, 4 Analysts (`owl`), 1 Disconfirmer (`owl`), 1 fresh Verifier (`owl`)                  |
| Depends on  | Phases 1–2, 4, 6                                                                                         |
| Rules       | `01-research-protocol.md` §1.2–1.3 and §10 "Phase 7 pre-registration addendum" (before any request)      |
| Raw data    | `data/raw/07-legal/` (git-ignored; holds URLs)                                                           |
| Derived     | `data/derived/07-legal/` (no URLs, no personal names)                                                    |

**Citations.** `[r:<id>]` is a stored scraped page (16-hex record id). Every
quote in the four coding tables was checked mechanically against the stored
text: 71 of 71 found. `[q:<id>]` is a query in
`scripts/config/phase7-queries.json`. Search results are visibility only.

---

## Bottom Line

- **Enforcement is frequent, and Nintendo dominates it.** 30 dated or named
  actions were found, 24 of them since 2016. Nintendo accounts for 24 of
  the 30. Targets: fan games (8), fan remakes (6), hosting sites (6), mods
  (4), emulators (4), ports or decomps (2).
- **Hosting sites face the biggest penalties.** ROM sites lost court cases
  (Dstorage was ordered to pay €442,750), and a Pokémon fan-game forum was
  taken offline. Game Jolt had to take down more than 550 fan games in 2016
  and 379 more in 2020, but kept running.
- **Requiring the player's own game files did not prevent takedowns.**
  Portal 64 needed files from a PC copy of Portal and was still removed
  after a Valve DMCA notice. Take-Two sued the makers of the
  reverse-engineered GTA III and Vice City projects.
- **No publisher policy found allows fan games built from its assets.** Four
  allow videos or free fan content with limited monetisation (Microsoft,
  Sega, Bandai Namco, Riot). Riot prohibits its IP in games and apps;
  Microsoft forbids reverse engineering to access assets. Nintendo's page
  is an anti-piracy enforcement page.
- **Demand for reviving dormant series is real.** 9 of 10 usable sampled
  pages call for a revival. Legacy of Kain, Onimusha, Dino Crisis and
  Toontown Online are each named on 2 different sites.
- **H7 verdict: Unproven** (confidence low). No stored record states that a
  revived series was dormant for 10 or more years, so no revival meets the
  pre-registered definition. Without that rule, 5 of 9 fan revivals were
  shut down, which would read as Contradicted.
- **Overall legal risk: High** for a hub hosting fan games, ports and mods.
  The child-safety side was not measured through enforcement records, and
  three regulator pages stayed blocked.

---

## 1. Enforcement History

`enforcement-cases.csv` — 30 actions from 14 stored records. 24 rows cite one
Wikipedia list `[r:c8fcd2a6d761c522]`, and 17 rest on it alone (see section
8).

| Target        | All | Since 2016 | Examples (year, action, outcome)                                                                                       |
| ------------- | --- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| Fan game      | 8   | 7          | Pokémon Uranium (2016, DMCA, removed); Pokémon Prism (2016, C&D, removed); Heaven Studio (2024, DMCA, removed)         |
| Fan remake    | 6   | 1          | Chrono Resurrection (2004, C&D); Super Mario 64 HD (2015); AM2R (2016, DMCA, removed)                                  |
| Hosting site  | 6   | 6          | Game Jolt (2016, 2020, DMCA); LoveROMs (2018, lawsuit, settled); RomUniverse (2021, ruling); Relic Castle (2024, DMCA) |
| Mod           | 4   | 4          | Second Wind (2022, videos removed); Palworld Pokémon mod (2024, DMCA); Garry's Mod Workshop content (2024, DMCA)       |
| Emulator      | 4   | 4          | Dolphin on Steam (2023, DMCA, continued); Yuzu (2024, lawsuit, $2.4M settlement); Ryujinx (2024); Suyu forks (2026)    |
| Port / decomp | 2   | 2          | Re3/ReVC (2021, Take-Two lawsuit) `[r:f2a64f7161d73685]`; Portal 64 (2024, Valve DMCA) `[r:196cf9f8389d96e0]`          |

By rights holder: Nintendo 24; Square Enix, Sega, Take-Two, WarnerMedia,
Valve and Capcom 1 each. Outcomes: removed 23, settled 2, court ruling 2,
continued 1, unclear 2. The Capcom case was a request to remove more than
1,000 YouTube videos showcasing adult-oriented mods `[r:18a57f6d119a0f82]`.
Eight Wikipedia entries say only "Takedown of …" without the mechanism; they
are coded `other` rather than guessed as DMCA or cease-and-desist.

## 2. Rights-Holder Content Policies

`policy-snapshots.csv` — 22 policies, all snapshotted 2026-10-03. 8 have
usable text, 10 were blocked or captured only a title, challenge page, site
frame or navigation, and 4 had no official result.

| Owner            | Fan works                             | Monetisation                                    | Game assets or code                          | Takedown stated                    |
| ---------------- | ------------------------------------- | ----------------------------------------------- | -------------------------------------------- | ---------------------------------- |
| Microsoft (Xbox) | Yes (machinima, videos)               | Partial (YouTube/Twitch programs)               | No: no reverse engineering to access assets  | Yes                                |
| Riot Games       | Yes (free fan projects)               | Partial (passive ads, subscriptions, donations) | No: IP prohibited in games and apps          | Yes                                |
| Sega             | Yes (videos and streams only)         | Partial (platform partner programs)             | No: footage copyright stays with Sega        | Yes                                |
| Bandai Namco     | Yes (gameplay videos, non-commercial) | Partial (platform revenue features)             | No: no rights assigned                       | Yes                                |
| Nintendo         | No (enforcement page)                 | Silent                                          | No: names ROM sites and emulators as targets | Yes                                |
| Discord (ToS)    | Silent                                | Silent                                          | No (Discord's own IP)                        | Yes                                |
| GitHub (DMCA)    | Silent                                | Silent                                          | Silent                                       | Yes                                |
| Ofcom (UK OSA)   | Silent                                | Silent                                          | Silent                                       | No (child-safety codes, section 6) |

Not usable: Nintendo video guidelines and Capcom (title only), Square Enix (a
forum thread), Rockstar (a page that only links to its mod guidelines),
Paradox (browser challenge), Steam Workshop (site frame only), Discord
guidelines (navigation), US COPPA FAQ, UK Children's Code and EU DSA minors
guidelines (blocked after a retry). Not found: Blizzard, CD PROJEKT RED,
Mojang, GDPR Article 8. Phase 4 already stored the hubs' own terms
(`04-mod-hub-competitors.md` §4): Nexus Mods 18+ or 13+ with parental
consent; ModDB, Steam and itch.io 13+.

## 3. Dormant IP

"Dormant" here means no new official release for at least 10 years. A
dormant series is usually still owned, so a revival needs permission or
tolerance.

`revival-cases.csv` — 9 fan revivals:

| Project                   | IP               | Outcome   | Evidence                                                          |
| ------------------------- | ---------------- | --------- | ----------------------------------------------------------------- |
| Chrono Resurrection       | Chrono Trigger   | shut down | Square Enix cease-and-desist `[r:fa3cddcb9075d5e7]`               |
| Streets of Rage Remake    | Streets of Rage  | shut down | "scuttled by Sega" `[r:4863180cf5c7e5c6]`                         |
| AM2R                      | Metroid II       | shut down | discontinued 2016 `[r:c8fcd2a6d761c522]`                          |
| Heaven Studio             | Rhythm Heaven    | shut down | DMCA 2024 `[r:c8fcd2a6d761c522]`                                  |
| FusionFall Legacy         | FusionFall       | shut down | WarnerMedia cease-and-desist `[r:1f641ade31e0d82e]`               |
| Toontown Rewritten        | Toontown Online  | tolerated | running fan server, no action found `[r:1f641ade31e0d82e]`        |
| Return of Reckoning       | Warhammer Online | tolerated | reopened 2014, no action found `[r:1f641ade31e0d82e]`             |
| Black Mesa                | Half-Life        | licensed  | "Valve gave its rogue devs their blessing" `[r:218e3485cabf566e]` |
| City of Heroes Homecoming | City of Heroes   | licensed  | NCSoft licence, reported in a forum thread `[r:7262598acbd464df]` |

Strictly, none of the 9 is a dormant-IP revival. No stored record states a
10-year gap before the fan project, so dormancy is `unclear` for all of
them. Four are revivals of closed online games (Toontown, Warhammer Online,
City of Heroes, FusionFall) rather than of dormant series.

**Demand** (`demand-coding.csv`: 16 hypothesis-blind sampled pages, 10
usable, 9 on-topic, all supporting):

| Dormant series  | On-topic records | Hosts                         |
| --------------- | ---------------- | ----------------------------- |
| Legacy of Kain  | 2                | wired.com, godisageek.com     |
| Onimusha        | 2                | engadget.com, vice.com        |
| Dino Crisis     | 2                | engadget.com, vice.com        |
| Toontown Online | 2                | uppercutcrit.com, cracked.com |

One page says "Some game franchises are simply too good to leave for dead"
`[r:00d5b1f3aea41943]`. A Change.org page says game revival has become a
popular petition topic `[r:78c1e57bd3675016]`. Capcom says it is reviving
more dormant series after Onimusha `[r:525bd1faa020035e]`. That is an
official revival: it shows demand, but it is not a fan revival.

## 4. How Port Projects Manage Risk

The usual pattern (Phase 6) is to ship code only and require the player's own
original files: 12 of 16 checked Phase 6 port rows say so. The enforcement
record shows this does not guarantee safety:

- **Portal 64** "requires files from a PC copy of Portal in order to work",
  yet a Valve DMCA notice removed it `[r:196cf9f8389d96e0]`.
- **Re3/ReVC:** Take-Two "is suing the creators of reverse-engineered Grand
  Theft Auto 3 and Grand Theft Auto Vice City fan projects"
  `[r:f2a64f7161d73685]`.
- **Emulators**, which also need user-supplied games, faced a $2.4M
  settlement (Yuzu) and the removal of 401 Switch-emulator repositories
  through GitHub's fork-network rule `[r:54806c6b0d429b72]`.

Many decomp and recomp projects named in Phase 6 (Ship of Harkinian, Zelda
64: Recompiled, OpenGOAL) do **not** appear in any stored enforcement
record. Their survival is tolerance by absence, not confirmed permission.

## 5. Platform And Hosting Terms

- **GitHub** runs a DMCA takedown and counter-notice process
  `[r:8e33619af679a647]`, and Nintendo has used it at scale against emulator
  forks `[r:54806c6b0d429b72]`.
- **Game Jolt** had to take down more than 550 fan games in 2016
  `[r:2c3cd5ca86f98f3d]` and 379 more in 2020 `[r:c8fcd2a6d761c522]`. A 2026
  page still describes it as "fertile ground for fan creativity"
  `[r:2528704fc4750c7b]`.
- **Steam Workshop:** Nintendo-related Garry's Mod content was removed by
  DMCA in 2024 `[r:c8fcd2a6d761c522]`.
- **Steam:** Nintendo sent Valve a DMCA notice to block the Dolphin
  emulator's Steam release in 2023 `[r:c8fcd2a6d761c522]`.

## 6. Minors And Community Safety

- **Discord** requires users to be "at least 13 years old and meet the
  minimum age required by the laws in your country" `[r:65ae8f2e67c302c0]`.
  The Phase 4 hubs use 13+ (ModDB, Steam, itch.io) or 18+ / 13+ with
  parental consent (Nexus Mods).
- **UK Online Safety Act:** Ofcom says services had to complete and record
  children's risk assessments by 24 July 2025, and its codes include an
  age-assurance section `[r:69fdbe6f44d76116]`.
- **Not captured:** the US COPPA FAQ, the UK Age Appropriate Design Code and
  the EU DSA guidelines on minors were blocked after one retry. GDPR Article
  8 had no official result. These rules are listed for the lawyer without
  stored text.
- **Moderation signal:** the Capcom case targeted videos of adult-oriented
  mods `[r:18a57f6d119a0f82]`. Phase 4 found that hubs either gate adult
  content to 18+ users or ban pornographic content.

## 7. Risk Register

Likelihood and impact follow addendum item 9. Likelihood counts dated
actions since 2016 in stored records: 3 or more = high, 1–2 = medium, none =
low.

| #   | Risk                                                 | Likelihood (actions 2016+)      | Impact                                      | Question for the lawyer                                                                                                                  |
| --- | ---------------------------------------------------- | ------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Hosting fan games and remakes that use someone's IP  | High (8)                        | Medium (individual removals)                | Does a notice-and-takedown process (DMCA safe harbour, EU DSA) protect a hub that hosts fan games, and what counter-notice duties apply? |
| R2  | Site-level action against the hub itself             | High (6)                        | High (lawsuits, damages, site offline)      | Where is the line between a fan-game hub and the ROM sites that lost suits (LoveROMs, RomUniverse, Dstorage)?                            |
| R3  | Hosting ports and decomps that need the user's files | Medium (2)                      | High (lawsuit: Re3/ReVC)                    | Does "bring your own game files" reduce liability for distributing decompiled or recompiled code?                                        |
| R4  | Hosting mods, including showcase media               | High (4)                        | Medium (removals)                           | Which publishers' mod terms allow third-party hosting, and how should adult-oriented mods be gated?                                      |
| R5  | Linking to or hosting emulators                      | High (4)                        | High ($2.4M settlement, mass repo removals) | Is linking to an emulator, without hosting keys or games, a risk for a hub?                                                              |
| R6  | Under-18 users (age rules, data, risk assessments)   | Not measured                    | High (statutory duties and fines)           | Which of COPPA, the UK Children's Code, the Online Safety Act and the EU DSA apply at launch, and what age assurance is required?        |
| R7  | Reviving a dormant series                            | Medium (2: AM2R, Heaven Studio) | Medium (project shut down)                  | Is there any route other than a licence for a franchise with no release in 10+ years?                                                    |

**Overall legal risk level: High.** R2 and R5 combine high likelihood with
high impact, and both apply to a hub hosting fan games and ports. R6 is
unmeasured but carries statutory duties.

## 8. Disconfirming Evidence

The Disconfirmer argued against both readings. Points accepted:

- **Source concentration.** One Wikipedia list supports 24 of 30
  enforcement rows; 17 rest on it alone. Without it, 13 cases remain.
- **Query bias.** There were 20 enforcement queries against 6
  disconfirmation queries.
- **Nintendo-heavy.** 24 of 30 cases are Nintendo; other publishers appear
  once each.
- **Tolerated projects exist.** Toontown Rewritten and Return of Reckoning
  run without recorded action; Black Mesa and City of Heroes Homecoming got
  permission. A developer forum advises that "you are unlikely to receive a
  takedown notice since they'll probably not even know your game exists"
  `[r:beb135b091d98b6e]`.
- **Hosting is not the same as ROM sites.** Game Jolt survived its
  takedowns; the large court losses were ROM sites. The risk register
  therefore splits R1 (fan games) from R2 (site-level action).

Recodes accepted: dormancy `no` → `unclear` for Toontown Rewritten and
Return of Reckoning (applied to all revival rows). Four extra queries
(`p7-x01`–`p7-x04`) added one revival, City of Heroes Homecoming
(licensed). The extra page about remaking a game whose publisher no longer
exists was a 132-character stub.

## 9. Verdict

**H7: Unproven (confidence low).** Addendum item 8:

| Test                                                        | Result                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------- |
| Demand: ≥ 3 dormant IPs, each in ≥ 2 records from ≥ 2 hosts | **Met** (Legacy of Kain, Onimusha, Dino Crisis, Toontown)      |
| Survival: ≥ 2 revivals licensed or tolerated                | Not met under the definition (0 revivals with dormancy proven) |
| Contradicted: > 50% shut down among ≥ 4 known outcomes      | Not met under the definition (0 known outcomes)                |
| ≥ 10 on-topic records from ≥ 2 source types                 | Met (9 demand records + 9 revival cases; news and forums)      |

Demand is shown, but survival cannot be tested: no stored record proves 10
years of dormancy, so the rule gives **Unproven**. **Sensitivity:** treating
all 9 fan revivals as dormant gives 5 shut down and 4 licensed or tolerated
(56% shut down) — that would read **Contradicted**. It is not used for the
verdict.

**Overall legal risk: High** (section 7).

## 10. Verifier Report

A fresh `owl` Verifier, given only this file, the protocol, the derived data
and the stored text, checked it on 2026-10-03.

| Check                                         | Result                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| Quoted phrases checked against stored text    | 6 of 6 confirmed                                                             |
| Counts recomputed with a CSV parser           | 10 of 10 confirmed (cases, Nintendo share, demand, policies 8/10/4, scrapes) |
| Independent re-code: all 9 revival rows       | 9 of 9 agree (outcome; dormancy `unclear`)                                   |
| Independent re-code: 4 demand rows            | 4 of 4 agree (on-topic, `supports`)                                          |
| H7 verdict (item 8) and overall risk (item 9) | Unproven and High both confirmed                                             |
| Spend                                         | $0.32 of $0.38, 11 settled entries, 0 open                                   |
| Personal names or URLs in derived CSVs        | None found                                                                   |

No claims were dropped or downgraded, and no edits were needed. Corrections
made before the Verifier pass (quote replacements, merged duplicates,
dropped non-enforcement rows, recodes) are listed in
`data/raw/07-legal/work/lead-corrections.json`.

## 11. Run Log And Spend

| Item             | Count / value                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Searches         | 56 frozen + 4 Disconfirmer = 60 queries; 58 ok after one retry round (p7-e10 and p7-l09 still blocked)                                   |
| Scrapes          | 63 items, 67 attempts, 56 ok, 7 blocked (3 regulator pages among them)                                                                   |
| Pipelines        | 0 (no social pipelines fit the budget)                                                                                                   |
| Usable sample    | 10 of 16 revival pages (`fetch-rates.csv`)                                                                                               |
| Quote check      | 71 of 71 found verbatim; 25 of 79 raw analyst quotes had to be replaced first                                                            |
| Spend            | **$0.32** of the $0.38 Phase 7 allowance (11 settled ledger entries, 0 open)                                                             |
| Budget changes   | Two lead bumps under the owner's small-bump approval: allowance $0.22 → $0.34 → $0.38                                                    |
| Lead corrections | `data/raw/07-legal/work/lead-corrections.json`                                                                                           |
| Raw files        | `data/raw/07-legal/{search,scrape,reading,brief,plans,work}/`                                                                            |
| Derived files    | `enforcement-cases.csv`, `revival-cases.csv`, `policy-snapshots.csv`, `demand-coding.csv`, `query-log.csv`, `fetch-rates.csv`, manifests |

The last two batches (Disconfirmer searches and scrapes) settled at $0.00.
The zone meter reports in $0.01 steps after a delay, so their cost will
appear on the next metered batch.
