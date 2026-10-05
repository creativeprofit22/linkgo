#!/usr/bin/env node
// Phase 10 pooled H10/H11 verdicts (01-research-protocol.md section 10,
// Phase 10 addendum item 6; verdict shares from section 1.2).
//
//   node pool-verdicts.mjs   -> data/derived/10-personas/h10-h11-pool.csv
//
// Pools on-topic coded records (stance supports / contradicts / neutral) from
//   02 deep-sample-coding.csv (rows whose hypothesis is H10 or H11),
//   04 sentiment-coding.csv   (usable rows; H10 and H11 columns; one stance
//                              per record, rows of one record must agree),
//   05 learner-coding.csv     (H10 column; side creator),
//   10 gapfill-coding.csv     (H10 and H11 columns),
// deduplicated by recordId: on a clash the later phase's stance wins and the
// clash is listed. Sides: player, creator; `both` counts on each side.
// Scopes: all/player/creator, each with and without Phase 10 records.
//
// The script computes only the quantitative part of section 1.2 (minimum and
// shares). Whether a row's support/contradiction test is met is judged in
// the report. Output rows: kind=summary, kind=record, kind=clash. No quotes,
// no URLs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./lib/csv.mjs";
import { DATA_DIR, derivedDir, toCsv } from "./lib/paths.mjs";

export const HYPOTHESES = ["H10", "H11"];
export const STANCES = new Set(["supports", "contradicts", "neutral"]);
export const MINIMUM = Object.freeze({
  records: 20,
  platforms: 3,
  sourceTypes: 2,
});
const PHASE_ORDER = [
  "02-public-web",
  "04-competitors",
  "05-creator-tools",
  "10-personas",
];

const sideOf = (segment) => {
  const s = String(segment ?? "").toLowerCase();
  if (s === "player" || s === "creator" || s === "both") return s;
  return "unclear";
};

/**
 * Normalises one phase's rows to [{hypothesis, recordId, phase, platform,
 * sourceType, side, stance}] (on-topic only).
 */
export function normalise(phase, rows) {
  const out = [];
  const push = (h, r, stance, extra) => {
    if (!STANCES.has(stance)) return;
    out.push({
      hypothesis: h,
      recordId: r.recordId,
      phase,
      platform: r.platform || "unknown",
      ...extra,
      stance,
    });
  };
  for (const r of rows) {
    if (phase === "02-public-web") {
      if (r.usable !== "yes" || !HYPOTHESES.includes(r.hypothesis)) continue;
      push(r.hypothesis, r, r.stance, {
        sourceType: r.sourceType || "b",
        side: sideOf(r.segment),
      });
    } else if (phase === "04-competitors") {
      if (r.usable !== "yes") continue;
      for (const h of HYPOTHESES)
        push(h, r, r[h], { sourceType: "b", side: sideOf(r.segment) });
    } else if (phase === "05-creator-tools") {
      if (r.usable !== "yes" || r.onTopic !== "yes") continue;
      push("H10", r, r.H10, { sourceType: "b", side: "creator" });
    } else if (phase === "10-personas") {
      if (r.usable !== "yes" || r.onTopic !== "yes") continue;
      for (const h of HYPOTHESES)
        push(h, r, r[h], { sourceType: "b", side: sideOf(r.side) });
    } else throw new Error(`unknown phase ${phase}`);
  }
  return out;
}

/** One stance per (hypothesis, record) within a phase; rows must agree. */
function collapseWithinPhase(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = `${r.hypothesis}|${r.recordId}`;
    const prev = map.get(key);
    if (prev && prev.stance !== r.stance)
      throw new Error(
        `${r.phase} ${key}: rows disagree (${prev.stance} vs ${r.stance})`,
      );
    if (!prev) map.set(key, r);
  }
  return [...map.values()];
}

/** Dedupe across phases: later phase wins; returns {records, clashes}. */
export function pool(byPhase) {
  const map = new Map();
  const clashes = [];
  for (const phase of PHASE_ORDER) {
    for (const r of collapseWithinPhase(byPhase[phase] ?? [])) {
      const key = `${r.hypothesis}|${r.recordId}`;
      const prev = map.get(key);
      if (prev)
        clashes.push({
          hypothesis: r.hypothesis,
          recordId: r.recordId,
          phase: `${prev.phase}>${r.phase}`,
          stance: `${prev.stance}>${r.stance}`,
        });
      map.set(key, r);
    }
  }
  const records = [...map.values()].sort((a, b) =>
    `${a.hypothesis}${a.recordId}` < `${b.hypothesis}${b.recordId}` ? -1 : 1,
  );
  return { records, clashes };
}

/** Section 1.2 quantitative verdict for a set of records. */
export function verdictFor(records) {
  const n = records.length;
  const count = (s) => records.filter((r) => r.stance === s).length;
  const sup = count("supports");
  const con = count("contradicts");
  const platforms = new Set(records.map((r) => r.platform)).size;
  const sourceTypes = new Set(records.map((r) => r.sourceType)).size;
  const minimumMet =
    n >= MINIMUM.records &&
    platforms >= MINIMUM.platforms &&
    sourceTypes >= MINIMUM.sourceTypes;
  const s = n ? sup / n : 0;
  const c = n ? con / n : 0;
  let verdict = "Unproven";
  if (minimumMet) {
    if (s >= 0.6 && c < 0.25) verdict = "Supported (if row test met)";
    else if (c >= 0.6 && s < 0.25) verdict = "Contradicted (if row test met)";
    else if (s >= 0.4 && s > c) verdict = "Partially supported";
  }
  const lean = s > c ? "leans yes" : c > s ? "leans no" : "balanced";
  return {
    n,
    platforms,
    sourceTypes,
    supports: sup,
    contradicts: con,
    neutral: count("neutral"),
    supShare: s.toFixed(3),
    conShare: c.toFixed(3),
    minimumMet: minimumMet ? "yes" : "no",
    verdict,
    lean,
  };
}

export function summaryRows(records) {
  const rows = [];
  for (const h of HYPOTHESES) {
    const forH = records.filter((r) => r.hypothesis === h);
    for (const [withLabel, keep] of [
      ["with-10", () => true],
      ["without-10", (r) => r.phase !== "10-personas"],
    ]) {
      for (const [side, inSide] of [
        ["all", () => true],
        ["player", (r) => r.side === "player" || r.side === "both"],
        ["creator", (r) => r.side === "creator" || r.side === "both"],
      ]) {
        const set = forH.filter((r) => keep(r) && inSide(r));
        rows.push({
          kind: "summary",
          hypothesis: h,
          scope: `${side}/${withLabel}`,
          ...verdictFor(set),
        });
      }
    }
  }
  return rows;
}

export const COLUMNS = [
  "kind",
  "hypothesis",
  "scope",
  "recordId",
  "phase",
  "platform",
  "sourceType",
  "side",
  "stance",
  "n",
  "platforms",
  "sourceTypes",
  "supports",
  "contradicts",
  "neutral",
  "supShare",
  "conShare",
  "minimumMet",
  "verdict",
  "lean",
];

const FILES = {
  "02-public-web": "deep-sample-coding.csv",
  "04-competitors": "sentiment-coding.csv",
  "05-creator-tools": "learner-coding.csv",
  "10-personas": "gapfill-coding.csv",
};

export function main({ dataDir = DATA_DIR } = {}) {
  const byPhase = {};
  for (const [phase, file] of Object.entries(FILES)) {
    const f = path.join(derivedDir(phase, dataDir), file);
    if (!fs.existsSync(f)) {
      console.warn(`missing ${phase}/${file}`);
      continue;
    }
    byPhase[phase] = normalise(phase, parseCsv(fs.readFileSync(f, "utf8")));
  }
  const { records, clashes } = pool(byPhase);
  const summary = summaryRows(records);
  const rows = [
    ...summary,
    ...records.map((r) => ({ kind: "record", ...r })),
    ...clashes.map((c) => ({ kind: "clash", ...c })),
  ];
  const out = derivedDir("10-personas", dataDir);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "h10-h11-pool.csv"), toCsv(COLUMNS, rows));
  for (const s of summary)
    console.log(
      `${s.hypothesis} ${s.scope}: n=${s.n} sup ${s.supports} con ${s.contradicts} neu ${s.neutral} min ${s.minimumMet} -> ${s.verdict} (${s.lean})`,
    );
  console.log(`clashes: ${clashes.length}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
