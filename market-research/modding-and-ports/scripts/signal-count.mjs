#!/usr/bin/env node
// Counts frozen signal groups (config/signal-groups.json) in SERP titles and
// snippets. Output data/derived/<phase>/signal-counts.csv:
//   dimension,value,group,hits,results
// `results` = SERP results in that slice; `hits` = results whose title+snippet
// match at least one term of the group (document frequency, not occurrences).
// Slices come from the query id (platform/theme/intent for matrix queries,
// hypothesis for disconfirmation queries) plus dimension "all".
// With `platforms`, off-site results of `site:` queries are dropped first
// (protocol section 5.3) and counted in `offsiteDropped`.
// Also writes mention-counts.csv from config/mention-terms.json:
//   category,term,records,results,queries
// `records` = unique URLs (record ids) whose title+snippet mention the term.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { expandMatrix } from "./build-queries.mjs";
import {
  readSearchEnvelopes,
  recordIdFor,
  resultsFromEnvelope,
} from "./dedupe.mjs";
import { onsiteRule, queryResolver, splitOnSite } from "./lib/onsite.mjs";
import {
  CONFIG_DIR,
  DEFAULT_PHASE,
  derivedDir,
  rawDir,
  toCsv,
} from "./lib/paths.mjs";

const WORD = "[\\p{L}\\p{N}_]";

export function termPattern(term) {
  const escaped = term
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  return new RegExp(`(?<!${WORD})${escaped}(?!${WORD})`, "giu");
}

const compiled = new WeakMap();
function compile(groups) {
  let out = compiled.get(groups);
  if (!out) {
    out = Object.entries(groups).map(([group, terms]) => [
      group,
      terms.map(termPattern),
    ]);
    compiled.set(groups, out);
  }
  return out;
}

/** Occurrences per group in text (whole word/phrase, case-insensitive). */
export function countSignals(text, groups) {
  const counts = {};
  for (const [group, patterns] of compile(groups)) {
    let n = 0;
    for (const re of patterns) n += (String(text ?? "").match(re) ?? []).length;
    counts[group] = n;
  }
  return counts;
}

export function slicesForQuery(query) {
  const slices = [["all", "all"]];
  if (!query) return [...slices, ["query", "unknown"]];
  if (query.kind === "matrix") {
    slices.push(
      ["platform", query.platform],
      ["theme", query.theme],
      ["intent", query.intent],
    );
  } else if (query.kind === "disconfirmation") {
    slices.push(["hypothesis", query.hypothesis]);
  }
  return slices;
}

/** Results per envelope after the optional on-site filter. */
export function filteredResults(envelopes, queries, platforms) {
  const resolve = queryResolver(queries);
  return envelopes.map(({ queryId, envelope }) => {
    const query = resolve(queryId, envelope?.input);
    const all = resultsFromEnvelope(envelope);
    if (!platforms) return { queryId, query, kept: all, dropped: [] };
    const rule = onsiteRule(query, envelope?.input);
    return { queryId, query, ...splitOnSite(all, rule, platforms) };
  });
}

export function aggregateSignals(envelopes, queries, groups, platforms) {
  const groupNames = Object.keys(groups);
  const table = new Map();
  const entryFor = (dimension, value) => {
    const key = `${dimension}\u0000${value}`;
    let entry = table.get(key);
    if (!entry) {
      entry = {
        dimension,
        value,
        results: 0,
        offsiteDropped: 0,
        hits: Object.fromEntries(groupNames.map((g) => [g, 0])),
      };
      table.set(key, entry);
    }
    return entry;
  };
  for (const { query, kept, dropped } of filteredResults(
    envelopes,
    queries,
    platforms,
  )) {
    const slices = slicesForQuery(query);
    for (const [dimension, value] of slices) {
      entryFor(dimension, value).offsiteDropped += dropped.length;
    }
    for (const result of kept) {
      const counts = countSignals(
        `${result.title}\n${result.description}`,
        groups,
      );
      for (const [dimension, value] of slices) {
        const entry = entryFor(dimension, value);
        entry.results++;
        for (const g of groupNames) if (counts[g] > 0) entry.hits[g]++;
      }
    }
  }
  const order = ["all", "platform", "theme", "intent", "hypothesis", "query"];
  const rows = [];
  const entries = [...table.values()].sort(
    (a, b) =>
      order.indexOf(a.dimension) - order.indexOf(b.dimension) ||
      (a.value < b.value ? -1 : a.value > b.value ? 1 : 0),
  );
  for (const entry of entries) {
    for (const g of groupNames) {
      rows.push({
        dimension: entry.dimension,
        value: entry.value,
        group: g,
        hits: entry.hits[g],
        results: entry.results,
        offsiteDropped: entry.offsiteDropped,
      });
    }
  }
  return rows;
}

/**
 * Mention counts per term (on-site results only when `platforms` is given).
 * records = unique record ids mentioning the term; results = result rows;
 * queries = distinct queries with at least one mention.
 */
export function aggregateMentions(envelopes, queries, categories, platforms) {
  const terms = [];
  for (const [category, list] of Object.entries(categories)) {
    for (const term of list)
      terms.push({ category, term, re: termPattern(term) });
  }
  const stats = terms.map(() => ({
    records: new Set(),
    results: 0,
    queries: new Set(),
  }));
  for (const { queryId, kept } of filteredResults(
    envelopes,
    queries,
    platforms,
  )) {
    for (const result of kept) {
      const text = `${result.title}\n${result.description}`;
      terms.forEach((t, i) => {
        t.re.lastIndex = 0;
        if (!t.re.test(text)) return;
        stats[i].results++;
        stats[i].queries.add(queryId);
        try {
          stats[i].records.add(recordIdFor(result.link));
        } catch {
          // unparseable link: counted as a result row only
        }
      });
    }
  }
  return terms.map((t, i) => ({
    category: t.category,
    term: t.term,
    records: stats[i].records.size,
    results: stats[i].results,
    queries: stats[i].queries.size,
  }));
}

export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: { phase: { type: "string", default: DEFAULT_PHASE } },
  });
  const read = (f) =>
    JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, f), "utf8"));
  const matrix = read("query-matrix.json");
  const { groups } = read("signal-groups.json");
  const { categories } = read("mention-terms.json");
  const envelopes = readSearchEnvelopes(
    path.join(rawDir(values.phase), "search"),
  );
  const queries = expandMatrix(matrix);
  const rows = aggregateSignals(envelopes, queries, groups, matrix.platforms);
  const mentions = aggregateMentions(
    envelopes,
    queries,
    categories,
    matrix.platforms,
  );
  const outDir = derivedDir(values.phase);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "signal-counts.csv");
  fs.writeFileSync(
    outPath,
    toCsv(
      ["dimension", "value", "group", "hits", "results", "offsiteDropped"],
      rows,
    ),
    "utf8",
  );
  const mentionPath = path.join(outDir, "mention-counts.csv");
  fs.writeFileSync(
    mentionPath,
    toCsv(["category", "term", "records", "results", "queries"], mentions),
    "utf8",
  );
  process.stdout.write(
    `files: ${envelopes.length}\nrows: ${rows.length}\nfile: ${outPath}\nfile: ${mentionPath}\n`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
