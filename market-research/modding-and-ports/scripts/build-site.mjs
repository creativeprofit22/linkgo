// Builds a static, multi-page reading site from the research Markdown files.
// Run with Bun (it uses Bun's built-in Markdown renderer):
//   bun scripts/build-site.mjs [--date YYYY-MM-DD]
// Output: site/ (git-ignored). Open site/index.html in a browser.

import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, RESEARCH_ROOT as ROOT } from "./lib/paths.mjs";
import {
  bars,
  breadcrumbs,
  dataTable,
  docStats,
  esc,
  escapeRawHtml,
  formatNumber,
  markVerdicts,
  pageHero,
  pageShell,
  rewriteDocLinks,
  sectionHead,
  tocEntries,
  verdictTone,
  wrapTables,
} from "./site/render.mjs";

export const SITE_DIR = path.join(ROOT, "site");
const ASSET_SRC = path.join(ROOT, "scripts", "site", "assets");

export const HUBS = [
  { id: "overview", label: "Overview", href: "index.html" },
  { id: "foundation", label: "Foundation", href: "foundation.html" },
  { id: "evidence", label: "Evidence", href: "evidence.html" },
  { id: "audience", label: "Audience", href: "audience.html" },
  { id: "competition", label: "Competition", href: "competition.html" },
  { id: "ports-legal", label: "Ports & Legal", href: "ports-legal.html" },
  { id: "market-size", label: "Market Size", href: "market-size.html" },
  { id: "personas", label: "Personas", href: "personas.html" },
  { id: "roadmap", label: "Roadmap", href: "roadmap.html" },
];

export const DOCS = [
  {
    file: "00-context-and-approach.md",
    hub: "foundation",
    title: "Context And Approach",
    description:
      "The project, the 12 working hypotheses and the rules that keep the study honest.",
  },
  {
    file: "01-research-protocol.md",
    hub: "foundation",
    title: "Research Protocol",
    description:
      "Pre-registered verdict rules, sampling, and the Bright Data collection setup.",
  },
  {
    file: "02-public-web-study.md",
    hub: "evidence",
    title: "Public-Web Study",
    description:
      "476 planned searches, 2,701 unique records, and what they can and cannot show.",
  },
  {
    file: "03-audience-and-demographics.md",
    hub: "audience",
    title: "Audience And Demographics",
    description:
      "Who the audience is: age, coding skill, players, ideas, learning curve.",
  },
  {
    file: "08-community-and-channels.md",
    hub: "audience",
    title: "Community And Channels",
    description:
      "Where the audience gathers, and how strong Discord really is.",
  },
  {
    file: "04-mod-hub-competitors.md",
    hub: "competition",
    title: "Mod-Hub Competitors",
    description:
      "Nexus Mods and similar hubs: what they cover and what users complain about.",
  },
  {
    file: "05-creator-tools-and-learning.md",
    hub: "competition",
    title: "Creator Tools And Learning",
    description: "Beginner tools, mod kits, and where learners stall.",
  },
  {
    file: "06-ports-and-rust-rebuilds.md",
    hub: "ports-legal",
    title: "Ports And Rust Rebuilds",
    description: "The native PC port scene, player demand, and Rust rebuilds.",
  },
  {
    file: "07-legal-ip-and-safety.md",
    hub: "ports-legal",
    title: "Legal, IP And Safety",
    description:
      "Takedowns, publisher policies, dormant IP revivals, and overall legal risk.",
  },
  {
    file: "09-market-sizing.md",
    hub: "market-size",
    title: "Market Sizing",
    description: "Bottom-up TAM, SAM and SOM, with low, base and high cases.",
  },
  {
    file: "10-personas-and-positioning.md",
    hub: "personas",
    title: "Personas And Positioning",
    description:
      'Three evidence-built personas and the "democratizing modding" test.',
  },
  {
    file: "ROADMAP.md",
    hub: "roadmap",
    title: "Research Roadmap",
    description: "How every phase works, each phase, and total effort.",
  },
];

/**
 * Research files deliberately left off the site. The Phase 11 audit file is an
 * empty outline with no findings, so it is not published.
 */
const EXCLUDED_DOCS = new Set(["11-evidence-audit-and-synthesis.md"]);

/**
 * Markdown file names that exist on disk but are missing from `docs`, sorted.
 * Used to fail the build instead of silently dropping new research files.
 */
export function unregisteredDocs(fileNames, docs) {
  const registered = new Set(docs.map((doc) => doc.file));
  return fileNames
    .filter((name) => name.endsWith(".md") && !registered.has(name))
    .sort();
}

function assertAllDocsRegistered() {
  const onDisk = fs
    .readdirSync(ROOT)
    .filter((name) => name.endsWith(".md") && !EXCLUDED_DOCS.has(name));
  const missing = unregisteredDocs(onDisk, DOCS);
  if (missing.length > 0) {
    throw new Error(
      `Unregistered research file(s): ${missing.join(", ")}. Add each one to DOCS in scripts/build-site.mjs with a hub, title and description.`,
    );
  }
}

export function slugFor(file) {
  return file.replace(/\.md$/, "").toLowerCase();
}

/**
 * Number of completed phases, read from the ROADMAP.md `Status:` line
 * ("phases 1–N complete"). Throws when the line cannot be parsed so the build
 * fails loudly instead of showing guessed progress.
 */
export function completedPhases(roadmapMarkdown) {
  // The Status line may wrap; it ends at a blank line or the next "Key:" line.
  const status = /^Status:(.*(?:\r?\n(?![ \t]*\r?$)(?![A-Z][\w ]*:).*)*)/m.exec(
    roadmapMarkdown,
  );
  const match =
    status && /phases\s+1\s*[–-]\s*(\d+)\s+complete/i.exec(status[1]);
  if (!match) {
    throw new Error(
      'ROADMAP.md: cannot parse completed phases from the "Status:" line (expected "phases 1–N complete").',
    );
  }
  return Number(match[1]);
}

/**
 * Verdict per hypothesis, quoted from the phase files; the reason column names
 * the phases it draws on. Hard-coded: update it when a phase file changes.
 */
export const VERDICTS = [
  [
    "H1",
    "The core audience is mainly aged 15–21",
    "Unproven",
    "03 Audience: 2 eligible sources; about 1 in 5 is 17 or under, the biggest group is 18–24",
  ],
  [
    "H2",
    "Most arrive with little coding experience",
    "Unproven",
    "03 Audience: Unproven, balanced 8 vs 8. 05 Creator tools: Supported for learners, low confidence",
  ],
  [
    "H3",
    "Many only want to download and play",
    "Partially supported",
    "03 Audience: 13 of 23 support; most report a real problem. 04 Hubs player side: Unproven, leans support",
  ],
  [
    "H4",
    "Many have concrete ideas",
    "Unproven",
    "03 Audience: leans yes, 13 of 35, none against",
  ],
  [
    "H5",
    "Steep learning curve, no clear start",
    "Unproven",
    "03 and 05: leans yes, 17 of 21, but one source type",
  ],
  [
    "H6",
    "Many want to make their own game",
    "Unproven",
    "03 and 05: leans no, most want to mod an existing game (20 of 34)",
  ],
  [
    "H7",
    "Many want to revive dormant childhood IPs",
    "Unproven",
    "07 Legal: revival demand is real, but no record meets the 10-year dormancy rule",
  ],
  [
    "H8",
    "Porting games to PC is a big part of demand",
    "Supported",
    "06 Ports: 20 of 21 demand records support, low confidence",
  ],
  [
    "H9",
    "Rust rebuilds are a relevant part of this market",
    "Contradicted",
    "06 Ports: 4 hobby projects; all 10 records are developer-side",
  ],
  [
    "H10",
    "Unmet demand for democratized modding",
    "Partially supported",
    "10 Personas: players 26 of 63, creators 25 of 59 support",
  ],
  [
    "H11",
    "Nexus Mods and similar hubs leave a gap",
    "Partially supported",
    "10 Personas: pooled 24 of 59 support; Unproven per side",
  ],
  [
    "H12",
    "Discord is where this audience gathers",
    "Partially supported",
    "08 Community: Discord most cited (44%); room to grow unclear",
  ],
];

function readDocs() {
  return DOCS.map((doc) => {
    const markdown = fs.readFileSync(path.join(ROOT, doc.file), "utf8");
    return { ...doc, slug: slugFor(doc.file), markdown, ...docStats(markdown) };
  });
}

function renderMarkdown(markdown, slugByFile) {
  const html = Bun.markdown.html(escapeRawHtml(markdown), {
    headings: { ids: true },
    tagFilter: true,
  });
  return wrapTables(markVerdicts(rewriteDocLinks(html, slugByFile)));
}

function readSignalCounts() {
  const file = path.join(
    DATA_DIR,
    "derived",
    "02-public-web",
    "signal-counts.csv",
  );
  const [header, ...lines] = fs
    .readFileSync(file, "utf8")
    .trim()
    .split(/\r?\n/);
  const cols = header.split(",");
  return lines
    .map((line) =>
      Object.fromEntries(line.split(",").map((v, i) => [cols[i], v])),
    )
    .filter((row) => row.dimension === "all")
    .map((row) => ({
      label: row.group,
      value: Number(row.hits),
      results: Number(row.results),
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function docCard(doc, base) {
  const hub = HUBS.find((h) => h.id === doc.hub);
  return `<a class="panel doc-card" href="${base}documents/${doc.slug}.html"><div class="eyebrow">${esc(hub.label)}</div><h3>${esc(doc.title)}</h3><p>${esc(doc.description)}</p><small>${formatNumber(doc.words)} words · ${doc.sections} sections</small><span>Read document →</span></a>`;
}

function library(docs, hubId, eyebrow, title) {
  const cards = docs
    .filter((doc) => doc.hub === hubId)
    .map((doc) => docCard(doc, ""))
    .join("");
  return `${sectionHead(eyebrow, title)}<div class="doc-card-grid">${cards}</div>`;
}

/** `tone` is a tag class from the colour key, e.g. "out-a" or "out-x". */
function panel(title, text, eyebrow, tone = "out-x") {
  const top = eyebrow ? `<span class="tag ${tone}">${esc(eyebrow)}</span>` : "";
  return `<div class="panel">${top}<h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
}

/** Tag tone for a stat badge: an H-number takes its hypothesis verdict colour. */
function badgeTone(badge) {
  const row = VERDICTS.find((v) => v[0] === badge);
  return (row && verdictTone(row[2])) ?? "out-x";
}

function stat(label, value, note, badge) {
  return `<div class="panel stat"><div class="stat-top"><label>${esc(label)}</label>${badge ? `<span class="tag ${badgeTone(badge)}">${esc(badge)}</span>` : ""}</div><b>${esc(value)}</b><p>${esc(note)}</p></div>`;
}

/** Callout box. `tone`: "a" needs checking, "r" risk, "x" context only. */
function warning(title, text, tone) {
  return `<div class="panel warning t-${tone}"><div class="eyebrow">${esc(title)}</div><p>${esc(text)}</p></div>`;
}

const VERDICT_COLOR = {
  Supported: "--green",
  "Partially supported": "--green",
  Unproven: "--amber",
  Contradicted: "--red",
};

function verdictCounts() {
  return Object.entries(VERDICT_COLOR).map(([label, color]) => ({
    label,
    color,
    value: VERDICTS.filter((v) => v[2] === label).length,
  }));
}

const NUMBER_WORDS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
];

function progressPills(completed) {
  const done =
    completed > 0
      ? `<span class="tag out-g">Phases 1–${completed} complete</span>`
      : "";
  const next =
    completed < PHASES.length
      ? `<span class="tag out-a">Phase ${completed + 1} not started</span>`
      : "";
  return done + next;
}

function roadmapHeadline(completed) {
  const count = NUMBER_WORDS[completed] ?? String(completed);
  return completed < PHASES.length
    ? `${count} of ${PHASES.length} research phases done.`
    : `${count} research phases, all done.`;
}

function hubPages(docs, completed) {
  const signals = readSignalCounts();
  const groupCards = HUBS.filter((hub) => hub.id !== "overview")
    .map((hub) => {
      const count = docs.filter((doc) => doc.hub === hub.id).length;
      return `<a class="panel group-card" href="${hub.href}"><div class="eyebrow">${count} document${count === 1 ? "" : "s"}</div><h2>${esc(hub.label)}</h2><p>${esc(HUB_SUMMARY[hub.id])}</p><span>Open category →</span></a>`;
    })
    .join("");

  return {
    overview: {
      title: "Overview",
      description:
        "Interactive overview of the modding, fan games and ports market research.",
      main: `<section class="hero"><div class="hero-content"><div class="pills">${progressPills(completed)}</div><div class="eyebrow hero-eye">Modding, fan games and ports</div><h1 class="display">Test every hunch. Count the evidence. Say what it cannot prove.</h1><p>A complete research library on who mods, what they struggle with, who already serves them, and how big the paying market really is.</p><div class="actions"><a class="btn primary" href="foundation.html">Start with the foundation →</a><a class="btn" href="evidence.html">Explore the evidence</a></div></div></section>
<section class="grid3"><div class="panel span2"><div class="eyebrow">Where the evidence stands</div><h2>The pain is real. The paying market is small.</h2><div class="grid3 mini"><div class="callout t-g"><h3>Supported</h3><p>PC port demand is wide (240 source games). Discord is the most-cited place to gather. Installs that break are the top complaint.</p></div><div class="callout t-r"><h3>Contradicted or leaning no</h3><p>Rust rebuilds are developer-only. Most creators want to mod an existing game, not make their own.</p></div><div class="callout t-a"><h3>Still unproven</h3><p>Audience age and whether people will pay.</p></div></div></div><div class="panel"><div class="eyebrow">Numbers that frame the bet</div><h2>Base case</h2><ul class="check-list"><li>$9.1M a year total market</li><li>$3.2M reachable</li><li>About $32k a year winnable in 3 years</li><li>About 1 in 100 users pay</li><li>About 1 in 5 may be 17 or younger</li><li>2,701 unique public records</li></ul></div></section>
<section class="grid2"><div class="panel"><div class="eyebrow">Hypotheses H1–H12</div><h2>Verdicts</h2>${bars(verdictCounts(), "--ink")}</div><div class="panel"><div class="eyebrow">Public-web visibility</div><h2>Top signal groups</h2>${bars(signals.slice(0, 6), "--blue")}</div></section>
${sectionHead("Category map", "Explore the complete research by question")}<section class="grid3">${groupCards}</section>`,
    },
    foundation: {
      title: "Foundation",
      description: "Project context, hypotheses and research protocol.",
      main: `${breadcrumbs("", "Foundation")}${pageHero("Foundation", "Twelve hunches, written down before any data was collected.", "The study started from the owner's working ideas about modders, players and ports. Each one was turned into a hypothesis with a rule for what would prove it wrong, then tested only against public evidence.")}
<section class="grid3">${panel("Players", "People who mostly download and play mods, and what still goes wrong for them.")}${panel("Creators", "Beginners who want to make mods or games, and where they get stuck.")}${panel("Ports and revivals", "Bringing older and other-platform games to PC, and reviving dormant series.")}</section>
${sectionHead("Core loop", "How every claim earns a verdict")}<div class="flow"><div><b>1</b><span>Hypothesis</span></div><i>→</i><div><b>2</b><span>Pre-registered rule</span></div><i>→</i><div><b>3</b><span>Public collection</span></div><i>→</i><div><b>4</b><span>Coded sample</span></div><i>→</i><div><b>5</b><span>Disconfirmer check</span></div><i>→</i><div><b>6</b><span>Verdict</span></div></div>
${sectionHead("The hypotheses", "What the study set out to test")}${dataTable(
        ["ID", "Hypothesis", "Verdict"],
        VERDICTS.map((v) => [v[0], v[1], v[2]]),
        2,
      )}
${library(docs, "foundation", "Foundation library", "Read the complete source documents")}`,
    },
    evidence: {
      title: "Evidence",
      description: "The public-web study and its limits.",
      main: `${breadcrumbs("", "Evidence")}${pageHero("Evidence", "Public conversation is measurable. Demand and willingness to pay are not.", "The public-web study shows what people talk about and where. Most large counts are shaped by the query wording, so they measure visibility, not demand.")}
<section class="grid2"><div class="panel"><div class="eyebrow">Public-web signals</div><div class="metric-switch"><button data-evidence="hits" class="active">Signal hits</button><button data-evidence="funnel">Collection funnel</button></div><div data-evidence-chart="hits">${bars(signals, "--blue")}</div><div data-evidence-chart="funnel" hidden>${bars(FUNNEL, "--blue")}</div></div><div class="panel"><div class="eyebrow">Verdict mix</div>${bars(verdictCounts(), "--ink")}${warning("Read with care", "Signal counts share one denominator: 2,932 on-site result rows. Most large counts come from the themes that searched for them.", "a")}</div></section>
${sectionHead("Claim boundaries", "What the evidence can and cannot say")}${dataTable(["ID", "Claim", "Verdict", "Reason"], VERDICTS, 2)}
${library(docs, "evidence", "Evidence library", "Full quantitative and qualitative source documents")}`,
    },
    audience: {
      title: "Audience",
      description: "Who the audience is and where it gathers.",
      main: `${breadcrumbs("", "Audience")}${pageHero("Audience", "Young adults more than teens. Mostly modders, not game makers.", "Public data cannot settle age, coding skill is evenly split, and most creators want to mod an existing game. Play-only people are a large group, and most of them report a real problem.")}
<section class="grid3">${stat("Play-only share", "~3 in 10", "Records from people who only download and play", "H3")}${stat("Want to mod, not make", "20 of 34", "Creators who want to mod an existing game", "H6")}${stat("Discord share", "44%", "Of venue citations in the sampled records", "H12")}</section>
${sectionHead("Hypotheses H1–H6", "What the audience evidence says")}${dataTable(["ID", "Hypothesis", "Verdict", "Supports", "Contradicts", "On-topic n"], AUDIENCE_TABLE, 2)}
<section class="grid2"><div class="panel"><div class="eyebrow">Where the audience gathers</div><h3>Stored records, counted mechanically</h3>${bars(VENUES, "--blue")}</div><div class="panel"><div class="eyebrow">Discord caveats</div><ul class="check-list caveats"><li>5 of the 11 Discord citations are YouTubers sending viewers there</li><li>58 public modding servers; median shows 35</li><li>All 3 critics are on forums</li><li>X and TikTok show no Discord pull</li></ul></div></section>
${library(docs, "audience", "Audience library", "Read the complete audience research")}`,
    },
    competition: {
      title: "Competition",
      description: "Mod hubs, creator tools and learning paths.",
      main: `${breadcrumbs("", "Competition")}${pageHero("Competition", "Incumbents already cover a lot. Broken installs are the open wound.", "Four large hubs offer one-click installs. Users praise discovery and complain about installs that break. For creators, beginner game tools exist, but mod kits still assume code.")}
<section class="grid3">${stat("Install complaints", "16 of 24", "Install-themed rows that are complaints", "H11")}${stat("Discovery praised", "7 of 11", "Discovery rows that are praise", "Hubs")}${stat("Switching", "2 of 62", "Records that state a move between hubs", "Hubs")}</section>
<section class="grid2"><div class="panel"><div class="eyebrow">Where learners stall</div><h3>Most-named frictions</h3>${bars(FRICTIONS, "--blue")}<p>17 of 29 on-topic records are at "pick a tool" or "learn the basics".</p></div><div class="panel"><div class="eyebrow">Scale of incumbents</div><ul class="check-list"><li>Steam Workshop: 3,000+ games</li><li>Thunderstore: 110,000+ mods</li><li>Vortex: 500+ games supported</li><li>itch.io: over 1 million projects</li><li>Nexus Mods and CurseForge: about $18m+ paid to creators each</li></ul></div></section>
${library(docs, "competition", "Competition library", "Read the complete competitor and tools research")}`,
    },
    "ports-legal": {
      title: "Ports & Legal",
      description: "PC ports, Rust rebuilds, and legal risk.",
      main: `${breadcrumbs("", "Ports & Legal")}${pageHero("Ports & Legal", "Port demand is wide. Legal risk for a hosting hub is high.", "Players want older games on PC, spread across many titles. Rust rebuilds barely exist. Enforcement is frequent, Nintendo dominates it, and requiring the player's own game files did not prevent takedowns.")}
<section class="grid3">${stat("Distinct source games", "240", "In 286 native-PC port rows", "H8")}${stat("Need your own copy", "12 of 16", "Checked native ports", "Ports")}${stat("Rust rebuilds found", "4", "All small hobby projects", "H9")}</section>
<section class="grid2"><div class="panel"><div class="eyebrow">Port rows by source platform</div>${bars(PLATFORMS, "--blue")}</div><div class="panel"><div class="eyebrow">Enforcement targets (30 actions)</div>${bars(ENFORCEMENT, "--red")}${warning("Overall legal risk: High", "For a hub hosting fan games, ports and mods. No publisher policy found allows fan games built from its assets.", "r")}</div></section>
${library(docs, "ports-legal", "Ports and legal library", "Read the complete ports and legal research")}`,
    },
    "market-size": {
      title: "Market Size",
      description: "Bottom-up market sizing.",
      main: `${breadcrumbs("", "Market Size")}${pageHero("Market Size", "The paying market a newcomer could reach is small.", "Few people pay, prices are low, and mod players are almost all of the money. The range is wide because two inputs are weak: the obtainable share and the paying share.")}
<section class="grid3">${stat("TAM (base)", "$9.1M", "A year. Low $4.7M, high $97M", "Total")}${stat("SAM (base)", "$3.2M", "The part this product could reach", "Reachable")}${stat("SOM (base)", "~$32k", "A year within 3 years. Low $1.9k, high $2.4M", "Winnable")}</section>
${dataTable(["Input", "Value", "Note"], SIZING_TABLE)}
${warning("Context only", "Third-party headlines are 160–400 times bigger than the base TAM ($1.45B and $3.62B) and use different definitions.", "x")}
${library(docs, "market-size", "Market size library", "Read the complete sizing model")}`,
    },
    personas: {
      title: "Personas",
      description: "Evidence-built personas and positioning.",
      main: `${breadcrumbs("", "Personas")}${pageHero("Personas", "Three evidence-built voices, not one generic modder.", "Each persona field cites its records. The fan-game segment was not built: 13 records, under the 15-record bar. Many fields rest on one platform.")}
<section class="persona-grid">${PERSONAS.map(
        (p) =>
          `<details class="panel persona"><summary><div class="avatar">${esc(p.letter)}</div><div><div class="eyebrow">${esc(p.segment)}</div><h2>${esc(p.name)}</h2></div></summary><p><strong>Core worry:</strong> ${esc(p.worry)}</p><p><strong>Jobs to be done:</strong> ${esc(p.jobs)}</p><p><strong>Triggers:</strong> ${esc(p.triggers)}</p></details>`,
      ).join("")}</section>
${sectionHead("Positioning test", "Democratizing modding: the idea fits, the word does not")}${dataTable(["Wording", "Evidence", "Read"], WORDING_TABLE)}
<section class="grid2">${panel("Play hub vs creator tools", "The evidence does not choose. The hub is ahead on size only; tools are ahead on competition and legal risk; three rows are even.", "Open decision", "out-a")}${panel("H10 and H11", "Both Partially supported. Barriers are a real, common complaint, but many people also say setup is easy once learned.", "Partially supported", "out-g")}</section>
${library(docs, "personas", "Persona library", "Read the complete persona and positioning research")}`,
    },
    roadmap: {
      title: "Roadmap",
      description: "Research phases and what remains.",
      main: `${breadcrumbs("", "Roadmap")}${pageHero("Roadmap", roadmapHeadline(completed), "Every phase collected through Bright Data under a pre-registered protocol and a $5 spend cap.")}
<div class="timeline">${PHASES.map(
        (p, i) =>
          `<section class="card phase"><span class="phase-num">${i + 1}</span><div class="phase-grid"><div>${i < completed ? '<span class="tag out-g">Complete</span>' : '<span class="tag out-a">Not started</span>'}</div><div><h2>${esc(p[0])}</h2><ul><li>${esc(p[1])}</li><li>Hypotheses: ${esc(p[2])}</li><li>Team of ${esc(p[3])}</li></ul></div></div></section>`,
      ).join("")}</div>
${library(docs, "roadmap", "Roadmap library", "Read the complete plan")}`,
    },
  };
}

const HUB_SUMMARY = {
  foundation:
    "The project context, the 12 hypotheses, and the protocol that sets every verdict rule.",
  evidence:
    "The public-web study: 2,701 unique records, signal counts, and their limits.",
  audience:
    "Who the audience is, what they want to make, and where they gather.",
  competition:
    "Mod hubs, beginner tools, and where players and learners get stuck.",
  "ports-legal":
    "PC ports, Rust rebuilds, takedowns, and the legal risk of hosting.",
  "market-size": "Bottom-up TAM, SAM and SOM, and why the range is so wide.",
  personas:
    'Three evidence-built personas and the "democratizing modding" wording test.',
  roadmap:
    "The research phases, what each one covered, and the team behind it.",
};

const FUNNEL = [
  { label: "Planned queries", value: 476 },
  { label: "Queries ok", value: 386 },
  { label: "With on-site results", value: 344 },
  { label: "On-site result rows", value: 2932 },
  { label: "Unique records", value: 2701 },
  { label: "Unique hosts", value: 285 },
];

const AUDIENCE_TABLE = [
  ["H1", "Modders are mostly aged 15–21", "Unproven", "0", "1", "2 eligible"],
  [
    "H2",
    "Creators mostly have little coding skill",
    "Unproven (balanced)",
    "8",
    "8",
    "18",
  ],
  [
    "H3",
    "Many only play, and their needs are unmet",
    "Partially supported",
    "13",
    "1",
    "23",
  ],
  [
    "H4",
    "Idea and request posts are common",
    "Unproven (leans yes)",
    "13",
    "0",
    "35",
  ],
  [
    "H5",
    "Beginners don't know where to start",
    "Unproven (leans yes)",
    "17",
    "0",
    "21",
  ],
  [
    "H6",
    "People want their own game more than a mod",
    "Unproven (leans no)",
    "5",
    "20",
    "34",
  ],
];

const VENUES = [
  { label: "Discord", value: 29, display: "29%" },
  { label: "Reddit", value: 19, display: "19%" },
  { label: "Forums", value: 17, display: "17%" },
];

const FRICTIONS = [
  { label: "Tool complexity", value: 45, display: "45%" },
  { label: "Coding", value: 28, display: "28%" },
  { label: "Missing or poor docs", value: 24, display: "24%" },
];

const PLATFORMS = [
  { label: "PS1", value: 37 },
  { label: "N64", value: 36 },
  { label: "Xbox 360", value: 27 },
  { label: "GBA", value: 19 },
  { label: "NES", value: 17 },
  { label: "GameCube", value: 12 },
  { label: "SNES", value: 12 },
];

const ENFORCEMENT = [
  { label: "Fan games", value: 8 },
  { label: "Fan remakes", value: 6 },
  { label: "Hosting sites", value: 6 },
  { label: "Mods", value: 4 },
  { label: "Emulators", value: 4 },
  { label: "Ports or decomps", value: 2 },
];

const SIZING_TABLE = [
  [
    "Nexus Mods creator payouts",
    "$4.2M a year",
    "About 1 in 100 monthly users paying at its Premium price",
  ],
  ["Price range", "$2.50–$6.90 a month", "Observed subscription prices"],
  [
    "Mod players (S1)",
    "99.7% of base TAM",
    "Creators, port players and fan-game makers add little money",
  ],
  [
    "Aged 17 or younger",
    "About 1 in 5",
    "Assumed to pay nothing in the low and high cases",
  ],
];

const PERSONAS = [
  {
    letter: "M",
    segment: "S1",
    name: "Mod player",
    worry:
      "Keeping a mod list stable; the main hub's health as creators leave; dependency downloads.",
    jobs: "Get mods downloaded, installed and working; some find this easy once learned, others hit download failures.",
    triggers:
      "Starting a game and asking whether to mod; creators leaving the main hub; a manager pulling unwanted mods.",
  },
  {
    letter: "B",
    segment: "S2",
    name: "Beginner mod creator",
    worry: "A steep learning curve and finding resources to learn from.",
    jobs: "Pick a tool or engine, find a place to start learning, and finish things.",
    triggers: "Having a specific mod idea.",
  },
  {
    letter: "P",
    segment: "S3",
    name: "PC-port player",
    worry: "Favourite games are not playable on PC.",
    jobs: "Play older games natively on PC; follow decompilation progress; get a port running.",
    triggers: "A wanted game with no PC port.",
  },
];

const WORDING_TABLE = [
  ['"Democratize"', "0 records use the word", "Do not lead with it"],
  [
    "The phrase in the right sense",
    "3 of 223 records (1.3%)",
    "The audience does not talk this way",
  ],
  ["Ease words", "53.8% of records", "The idea fits"],
  [
    "Nexus Mods About page",
    '"Modding should be for everyone"',
    "The market leader already claims it",
  ],
];

const PHASES = [
  [
    "Research protocol and Bright Data readiness",
    "Protocol, pre-registration, Bright Data setup",
    "All (criteria)",
    "2",
  ],
  [
    "Public-web study",
    "Large structured public-web study",
    "All (signals)",
    "8",
  ],
  ["Audience and demographics", "Who the audience really is", "H1–H6", "6"],
  ["Mod-hub competitors", "Nexus Mods and similar hubs", "H3, H10, H11", "6"],
  [
    "Creator tools and learning paths",
    "Beginner creation tools and learning paths",
    "H2, H5, H6, H10",
    "5",
  ],
  [
    "Ports and Rust rebuilds",
    "PC ports, decomp projects, Rust rebuilds",
    "H8, H9",
    "6",
  ],
  [
    "Legal, IP and safety",
    "IP, takedowns, dormant IP, minors' safety",
    "H7 (+ all risk)",
    "4",
  ],
  ["Community and channels", "Discord, community, channels", "H12", "5"],
  ["Market sizing", "Bottom-up market sizing", "Scale of all", "3"],
  [
    "Personas and positioning",
    'Personas and the "democratizing" position',
    "H10, H11",
    "4",
  ],
];

function documentPage(doc, slugByFile) {
  const html = renderMarkdown(doc.markdown, slugByFile);
  const hub = HUBS.find((h) => h.id === doc.hub);
  return {
    toc: tocEntries(html),
    main: `<div class="breadcrumbs"><a href="../index.html">Research</a><span>/</span><a href="../${hub.href}">${esc(hub.label)}</a><span>/</span><span>${esc(doc.title)}</span></div><article class="document">${html}</article>`,
  };
}

export function searchIndex(docs) {
  const entries = docs.map((doc) => ({
    id: doc.slug,
    title: esc(doc.title),
    group: esc(HUBS.find((h) => h.id === doc.hub).label),
    description: esc(doc.description),
    url: `documents/${doc.slug}.html`,
    text: doc.markdown.toLowerCase(),
  }));
  return `window.RESEARCH_SEARCH=${JSON.stringify(entries)};\n`;
}

export function build({ date }) {
  assertAllDocsRegistered();
  const docs = readDocs();
  const slugByFile = new Map(docs.map((doc) => [doc.file, doc.slug]));
  const totals = docs.reduce(
    (acc, doc) => ({
      words: acc.words + doc.words,
      sections: acc.sections + doc.sections,
    }),
    { words: 0, sections: 0 },
  );
  const footer = {
    left: `Private research artifact · generated ${date}`,
    right: `${docs.length} documents · ${formatNumber(totals.words)} words · ${formatNumber(totals.sections)} sections`,
  };

  fs.rmSync(SITE_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(SITE_DIR, "documents"), { recursive: true });
  fs.mkdirSync(path.join(SITE_DIR, "assets"), { recursive: true });
  for (const asset of ["styles.css", "app.js"]) {
    fs.copyFileSync(
      path.join(ASSET_SRC, asset),
      path.join(SITE_DIR, "assets", asset),
    );
  }
  fs.writeFileSync(
    path.join(SITE_DIR, "assets", "search-index.js"),
    searchIndex(docs),
  );

  const completed = completedPhases(
    docs.find((doc) => doc.file === "ROADMAP.md").markdown,
  );
  if (completed > PHASES.length) {
    throw new Error(
      `ROADMAP.md: ${completed} phases complete, but the site only knows ${PHASES.length}.`,
    );
  }
  const pages = hubPages(docs, completed);
  for (const hub of HUBS) {
    const page = pages[hub.id];
    fs.writeFileSync(
      path.join(SITE_DIR, hub.href),
      pageShell({
        base: "",
        title: page.title,
        description: page.description,
        activeHub: hub.id,
        nav: HUBS,
        main: page.main,
        footer,
      }),
    );
  }
  for (const doc of docs) {
    const page = documentPage(doc, slugByFile);
    fs.writeFileSync(
      path.join(SITE_DIR, "documents", `${doc.slug}.html`),
      pageShell({
        base: "../",
        title: doc.title,
        description: doc.description,
        activeHub: doc.hub,
        nav: HUBS,
        main: page.main,
        toc: page.toc,
        footer,
      }),
    );
  }
  return { pages: HUBS.length, documents: docs.length, ...totals };
}

// True only for a real calendar date in YYYY-MM-DD form; the UTC round-trip
// rejects impossible values like 2026-13-45 or 2026-02-31.
export function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

if (import.meta.main) {
  const dateArg = process.argv.indexOf("--date");
  const date =
    dateArg > -1
      ? process.argv[dateArg + 1]
      : new Date().toISOString().slice(0, 10);
  if (!isCalendarDate(date ?? "")) {
    console.error("Usage: bun scripts/build-site.mjs [--date YYYY-MM-DD]");
    process.exit(1);
  }
  const started = Date.now();
  const result = build({ date });
  console.log(
    JSON.stringify({
      event: "site-built",
      out: SITE_DIR,
      ...result,
      ms: Date.now() - started,
    }),
  );
}
