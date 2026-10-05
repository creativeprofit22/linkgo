#!/usr/bin/env node
// Phase 10 positioning test (01-research-protocol.md section 10, Phase 10
// addendum items 8-9). Mechanical: frozen regexes from
// config/phase10-terms.json, no judgement.
//
//   node count-terms.mjs audience     -> data/derived/10-personas/positioning-terms.csv
//   node count-terms.mjs competitor   -> data/derived/10-personas/competitor-claims.csv
//
// Audience: the on-topic coded records of phases 2-10 (rules in the terms
// file), deduplicated by recordId. Text = body of every handle-scrubbed
// reading copy (data/raw/<phase>/reading/*-<recordId>.txt, text after the
// first '---' line, field paths stripped). A record counts once per family
// and once per term. Records without a reading copy are counted as missing
// and left out of the denominator.
//
// Competitor: stored official pages (04/05 reading copies with an `official`
// role, 09 scrape envelopes) and p10-c* search results (title + snippet; flagged
// snippet-only). One row per page/result where the phrase or synonym family
// matches. Organisation = a known competitor/tool name when the host is its
// domain, else the host. No URLs are written.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  normaliseHost,
  readSearchEnvelopes,
  resultsFromEnvelope,
} from "./dedupe.mjs";
import { parseCsv } from "./lib/csv.mjs";
import { CONFIG_DIR, DATA_DIR, derivedDir, toCsv } from "./lib/paths.mjs";

export const PHASE = "10-personas";
export const FAMILIES = ["phrase", "synonym", "need"];

/** Compiles the frozen term file into {family: [{term, re}]}. */
export function compileTerms(config) {
  const out = {};
  for (const family of FAMILIES) {
    const list = config.families?.[family];
    if (!Array.isArray(list) || list.length === 0)
      throw new Error(`terms: family ${family} missing`);
    out[family] = list.map((term) => ({ term, re: new RegExp(term, "i") }));
  }
  return out;
}

/** Body text of a reading copy: after the first `---` line, paths stripped. */
export function readingBody(text) {
  const lines = String(text).split(/\r?\n/);
  const sep = lines.indexOf("---");
  return lines
    .slice(sep + 1)
    .map((l) => l.replace(/^[^\s:]*: /, ""))
    .join("\n");
}

/** {family: Set(term)} of matches in one text. */
export function matchTerms(text, compiled) {
  const out = {};
  for (const family of FAMILIES)
    out[family] = new Set(
      compiled[family].filter((t) => t.re.test(text)).map((t) => t.term),
    );
  return out;
}

const OFF = "off-topic";
/** On-topic test per frozen rule text. */
export function isOnTopic(row, rule) {
  if (rule.startsWith("usable=yes and any row stance"))
    return row.usable === "yes" && row.stance !== OFF;
  if (rule.startsWith("usable=yes and any of H3/H10/H11"))
    return (
      row.usable === "yes" &&
      ["H3", "H10", "H11"].some((h) => row[h] && row[h] !== OFF)
    );
  if (rule === "onTopic=yes") return row.onTopic === "yes";
  throw new Error(`unknown on-topic rule: ${rule}`);
}

/** Map recordId -> Set(phase) of on-topic records. */
export function onTopicRecords(sources, readCsv) {
  const out = new Map();
  for (const s of sources) {
    const rows = readCsv(s.phase, s.file);
    if (!rows) continue;
    for (const r of rows) {
      if (!r.recordId || !isOnTopic(r, s.rule)) continue;
      const set = out.get(r.recordId) ?? new Set();
      set.add(s.phase);
      out.set(r.recordId, set);
    }
  }
  return out;
}

/** Index of reading copies: recordId -> [file paths], across all phases. */
export function readingIndex(rawRoot) {
  const index = new Map();
  if (!fs.existsSync(rawRoot)) return index;
  for (const phase of fs.readdirSync(rawRoot).sort()) {
    const dir = path.join(rawRoot, phase, "reading");
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      const m = /([0-9a-f]{16})\.txt$/.exec(f);
      if (!m) continue;
      const list = index.get(m[1]) ?? [];
      list.push(path.join(dir, f));
      index.set(m[1], list);
    }
  }
  return index;
}

/** Applies the pre-registered outcome rule (checked in order). */
export function outcomeFor(shares, t) {
  if (shares.phrase + shares.synonymOnly >= t.phraseFitsShare)
    return "phrase fits";
  if (
    shares.phrase <= t.phraseMaxShareForConceptFit &&
    shares.need >= t.conceptFitsNeedShare
  )
    return "concept fits, wording doesn't";
  if (shares.need < t.doesNotFitNeedShare) return "doesn't fit";
  return "mixed";
}

/**
 * Audience rows. `texts`: Map recordId -> text (records with a reading copy).
 * `records`: Map recordId -> Set(phase). Scopes: each phase, all, all-without-10.
 */
export function audienceRows(records, texts, compiled, thresholds) {
  const matches = new Map();
  for (const [id, text] of texts) matches.set(id, matchTerms(text, compiled));
  const phases = [
    ...new Set([...records.values()].flatMap((s) => [...s])),
  ].sort();
  const scopes = [
    ...phases.map((p) => [p, (s) => s.has(p)]),
    ["all", () => true],
    ["all-without-10", (s) => [...s].some((p) => p !== PHASE)],
  ];
  const rows = [];
  let outcomeRows = [];
  for (const [scope, keep] of scopes) {
    const ids = [...records].filter(([, s]) => keep(s)).map(([id]) => id);
    const withText = ids.filter((id) => matches.has(id));
    const n = withText.length;
    const share = (k) => (n ? k / n : 0);
    const base = {
      scope,
      onTopicRecords: ids.length,
      withReading: n,
      missingReading: ids.length - n,
    };
    const familyCount = {};
    for (const family of FAMILIES) {
      const hit = withText.filter((id) => matches.get(id)[family].size > 0);
      familyCount[family] = hit.length;
      rows.push({
        ...base,
        family,
        term: "*",
        records: hit.length,
        share: share(hit.length).toFixed(4),
      });
      for (const { term } of compiled[family]) {
        const k = withText.filter((id) =>
          matches.get(id)[family].has(term),
        ).length;
        rows.push({
          ...base,
          family,
          term,
          records: k,
          share: share(k).toFixed(4),
        });
      }
    }
    const phraseOrSyn = withText.filter(
      (id) => matches.get(id).phrase.size + matches.get(id).synonym.size > 0,
    ).length;
    rows.push({
      ...base,
      family: "phrase+synonym",
      term: "*",
      records: phraseOrSyn,
      share: share(phraseOrSyn).toFixed(4),
    });
    const outcome = outcomeFor(
      {
        phrase: share(familyCount.phrase),
        synonymOnly: share(phraseOrSyn - familyCount.phrase),
        need: share(familyCount.need),
      },
      thresholds,
    );
    outcomeRows.push({
      ...base,
      family: "outcome",
      term: outcome,
      records: "",
      share: "",
    });
  }
  return [...rows, ...outcomeRows];
}

export const AUDIENCE_COLUMNS = [
  "scope",
  "onTopicRecords",
  "withReading",
  "missingReading",
  "family",
  "term",
  "records",
  "share",
];

/** Flattens any JSON value into text (string leaves joined by newlines). */
export function flattenText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return String(value);
  const vals = Array.isArray(value) ? value : Object.values(value);
  return vals.map(flattenText).filter(Boolean).join("\n");
}

const onDomain = (host, domain) =>
  host === domain || host.endsWith(`.${domain}`);

/** Organisation for a host: known competitor/tool name, else the host. */
export function organisationFor(host, known) {
  const h = normaliseHost(host);
  const hit = known
    .filter((k) => onDomain(h, k.host))
    .sort((a, b) => b.host.length - a.host.length)[0];
  return hit
    ? { organisation: hit.name, known: "yes" }
    : { organisation: h, known: "no" };
}

/**
 * Competitor rows from pages [{source, phase, recordId, queryId, host, text}].
 * Only pages where the phrase or synonym family matches are returned.
 */
export function competitorRows(pages, compiled, known) {
  const rows = [];
  for (const p of pages) {
    const m = matchTerms(p.text, compiled);
    if (m.phrase.size + m.synonym.size === 0) continue;
    const org = organisationFor(p.host, known);
    rows.push({
      source: p.source,
      phase: p.phase,
      recordId: p.recordId ?? "",
      queryId: p.queryId ?? "",
      host: normaliseHost(p.host),
      organisation: org.organisation,
      knownCompetitor: org.known,
      phraseTerms: [...m.phrase].sort().join(";"),
      synonymTerms: [...m.synonym].sort().join(";"),
      snippetOnly: p.source === "search-snippet" ? "yes" : "no",
    });
  }
  return rows.sort((a, b) =>
    `${a.organisation}|${a.source}|${a.recordId}${a.queryId}` <
    `${b.organisation}|${b.source}|${b.recordId}${b.queryId}`
      ? -1
      : 1,
  );
}

export const COMPETITOR_COLUMNS = [
  "source",
  "phase",
  "recordId",
  "queryId",
  "host",
  "organisation",
  "knownCompetitor",
  "phraseTerms",
  "synonymTerms",
  "snippetOnly",
];

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function loadKnown(configDir) {
  const comps = readJson(
    path.join(configDir, "phase4-official-pages.json"),
  ).competitors;
  const tools = readJson(path.join(configDir, "phase5-tools.json")).tools;
  return [...comps, ...tools]
    .filter((x) => x.host && x.host !== "github.com")
    .map((x) => ({ name: x.name, host: x.host }));
}

function officialPages(rawRoot) {
  const pages = [];
  for (const phase of ["04-competitors", "05-creator-tools"]) {
    const dir = path.join(rawRoot, phase, "reading");
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      const text = fs.readFileSync(path.join(dir, f), "utf8");
      if (!/^role: official/m.test(text)) continue;
      const host = /^host: (\S+)/m.exec(text)?.[1] ?? "?";
      const recordId = /([0-9a-f]{16})\.txt$/.exec(f)?.[1] ?? "";
      pages.push({
        source: "stored-page",
        phase,
        recordId,
        host,
        text: readingBody(text),
      });
    }
  }
  const scrape = path.join(rawRoot, "09-sizing", "scrape");
  if (fs.existsSync(scrape))
    for (const f of fs
      .readdirSync(scrape)
      .filter((x) => x.endsWith(".json"))
      .sort()) {
      const e = readJson(path.join(scrape, f));
      let host = "?";
      try {
        host = new URL(e.input).hostname;
      } catch {
        /* keep ? */
      }
      pages.push({
        source: "stored-page",
        phase: "09-sizing",
        recordId: e.id ?? f,
        host,
        text: flattenText(e.data),
      });
    }
  return pages;
}

function snippetPages(searchDir) {
  const pages = [];
  for (const { queryId, envelope } of readSearchEnvelopes(searchDir)) {
    if (!/^p10-c\d+$/.test(queryId)) continue;
    for (const r of resultsFromEnvelope(envelope)) {
      let host;
      try {
        host = new URL(r.link).hostname;
      } catch {
        continue;
      }
      pages.push({
        source: "search-snippet",
        phase: PHASE,
        queryId,
        host,
        text: `${r.title}\n${r.description}`,
      });
    }
  }
  return pages;
}

export function main(
  argv = process.argv.slice(2),
  { dataDir = DATA_DIR, configDir = CONFIG_DIR } = {},
) {
  const { positionals } = parseArgs({ args: argv, allowPositionals: true });
  const [cmd] = positionals;
  const config = readJson(path.join(configDir, "phase10-terms.json"));
  const compiled = compileTerms(config);
  const rawRoot = path.join(dataDir, "raw");
  const out = derivedDir(PHASE, dataDir);
  fs.mkdirSync(out, { recursive: true });
  if (cmd === "audience") {
    const readCsv = (phase, file) => {
      const f = path.join(derivedDir(phase, dataDir), file);
      return fs.existsSync(f) ? parseCsv(fs.readFileSync(f, "utf8")) : null;
    };
    const records = onTopicRecords(config.onTopic, readCsv);
    const index = readingIndex(rawRoot);
    const texts = new Map();
    for (const id of records.keys()) {
      const files = index.get(id);
      if (files)
        texts.set(
          id,
          files.map((f) => readingBody(fs.readFileSync(f, "utf8"))).join("\n"),
        );
    }
    const rows = audienceRows(records, texts, compiled, config.thresholds);
    fs.writeFileSync(
      path.join(out, "positioning-terms.csv"),
      toCsv(AUDIENCE_COLUMNS, rows),
    );
    for (const r of rows.filter((x) => x.family === "outcome"))
      console.log(
        `${r.scope}: ${r.term} (n=${r.withReading}, missing ${r.missingReading})`,
      );
  } else if (cmd === "competitor") {
    const pages = [
      ...officialPages(rawRoot),
      ...snippetPages(path.join(rawRoot, PHASE, "search")),
    ];
    const rows = competitorRows(pages, compiled, loadKnown(configDir));
    fs.writeFileSync(
      path.join(out, "competitor-claims.csv"),
      toCsv(COMPETITOR_COLUMNS, rows),
    );
    const stored = pages.filter((p) => p.source === "stored-page").length;
    console.log(
      `pages scanned: ${stored} stored, ${pages.length - stored} snippets; matches ${rows.length}`,
    );
  } else {
    console.error("usage: count-terms.mjs audience|competitor");
    process.exitCode = 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
