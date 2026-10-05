#!/usr/bin/env node
// Builds the Phase 10 plans. Rules: 01-research-protocol.md section 10,
// Phase 10 addendum items 11-12.
//
//   node sample-personas.mjs searches   search plans from phase10-queries.json
//   node sample-personas.mjs sample     Reddit and YouTube-comments plans
//
// Sample (hypothesis-blind): candidates are on-site results of the frozen
// p10-g* and p10-d* queries (their `site:` host), one per record id (a URL
// found by several queries belongs to the lowest query id). Record ids already
// stored in phases 2-9 (raw pipeline/scrape files) are excluded. Per platform,
// candidates are ordered by recordId and picked round-robin across queries,
// at most 2 per query, up to the quota. Titles and snippets are never read.
//
// Output (git-ignored, contains URLs): data/raw/<phase>/plans/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  readSearchEnvelopes,
  recordIdFor,
  resultsFromEnvelope,
} from "./dedupe.mjs";
import { CONFIG_DIR, DATA_DIR, rawDir } from "./lib/paths.mjs";
import { isOnSite, onsiteRule } from "./lib/onsite.mjs";
import { roundRobin } from "./sample-audience.mjs";
import { PIPELINE_STRATA } from "./sample-deep.mjs";

export const PREFIX = "p10";
export const DEFAULT_PHASE = "10-personas";
export const EARLIER_PHASES = Object.freeze([
  "02-public-web",
  "03-audience",
  "04-competitors",
  "05-creator-tools",
  "06-ports-rust",
  "07-legal",
  "08-community",
  "09-sizing",
]);
const SAMPLED_GROUPS = new Set(["persona", "disconfirm"]);

const shape = (method) => {
  const s = PIPELINE_STRATA.find((x) => x.method === method);
  if (!s) throw new Error(`no URL-shape rule for ${method}`);
  return s.eligible;
};

export const QUOTAS = Object.freeze([
  Object.freeze({
    platform: "reddit",
    method: "reddit_posts",
    quota: 12,
    perQuery: 2,
    eligible: shape("reddit_posts"),
  }),
  Object.freeze({
    platform: "youtube",
    method: "youtube_comments",
    quota: 2,
    perQuery: 2,
    numComments: 10,
    eligible: shape("youtube_videos"),
  }),
]);

const countBy = (items, key) => {
  const out = {};
  for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
  return out;
};

/** Search plans in query-id order: main (frozen) and disconfirmer (p10-x*). */
export function buildSearchPlans(queries) {
  const sorted = [...queries].sort((a, b) => (a.id < b.id ? -1 : 1));
  const pick = (groups) =>
    sorted
      .filter((q) => groups.includes(q.group))
      .map((q) => ({ id: q.id, kind: "search", query: q.query }));
  return {
    [`${PREFIX}-search-main.json`]: pick([
      "persona",
      "disconfirm",
      "competitor",
    ]),
    [`${PREFIX}-search-disconfirmer.json`]: pick(["disconfirmer"]),
  };
}

/** Record ids stored in earlier phases' raw pipeline and scrape folders. */
export function storedRecordIds(
  rawRoot = path.join(DATA_DIR, "raw"),
  phases = EARLIER_PHASES,
) {
  const ids = new Set();
  for (const phase of phases) {
    for (const dir of ["pipeline", "scrape"]) {
      const d = path.join(rawRoot, phase, dir);
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d)) {
        const m = /([0-9a-f]{16})\.json$/.exec(f);
        if (m) ids.add(m[1]);
      }
    }
  }
  return ids;
}

/**
 * On-site candidates of p10-g* / p10-d* queries: Map recordId -> {recordId,
 * url, platform, queryId}. Lowest query id wins; `exclude` ids are skipped.
 */
export function collectCandidates(envelopes, queries, exclude = new Set()) {
  const meta = new Map(
    queries.filter((q) => SAMPLED_GROUPS.has(q.group)).map((q) => [q.id, q]),
  );
  const ordered = [...envelopes].sort((a, b) =>
    a.queryId < b.queryId ? -1 : a.queryId > b.queryId ? 1 : 0,
  );
  const out = new Map();
  for (const { queryId, envelope } of ordered) {
    const q = meta.get(queryId);
    if (!q) continue;
    const rule = onsiteRule(undefined, q.query);
    if (rule.mode !== "host") continue;
    for (const r of resultsFromEnvelope(envelope)) {
      if (!isOnSite(r.link, rule, [])) continue;
      let url;
      let recordId;
      try {
        url = new URL(r.link);
        recordId = recordIdFor(r.link);
      } catch {
        continue;
      }
      if (!/^https?:$/.test(url.protocol)) continue;
      if (out.has(recordId) || exclude.has(recordId)) continue;
      out.set(recordId, {
        recordId,
        url: url.href,
        platform: q.platform,
        queryId,
      });
    }
  }
  return out;
}

/** Reddit and YouTube-comments plans under the quotas (see header). */
export function buildSample(candidates) {
  const all = [...candidates.values()];
  const plans = {};
  const manifest = [];
  for (const q of QUOTAS) {
    const onPlatform = all.filter((c) => c.platform === q.platform);
    const eligible = onPlatform.filter((c) => q.eligible(new URL(c.url)));
    const chosen = roundRobin(eligible, q.quota, q.perQuery);
    plans[`${PREFIX}-${q.platform}.json`] = chosen.map((c) => ({
      id: `ds-${q.method}-${c.recordId}`,
      kind: "pipeline",
      type: q.method,
      url: c.url,
      ...(q.numComments ? { numComments: q.numComments } : {}),
    }));
    manifest.push({
      platform: q.platform,
      method: q.method,
      quota: q.quota,
      perQuery: q.perQuery,
      candidates: onPlatform.length,
      eligible: eligible.length,
      selected: chosen.length,
      selectedByQuery: countBy(chosen, (c) => c.queryId),
      recordIds: chosen.map((c) => c.recordId),
    });
  }
  return { plans, manifest };
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

export function loadPhase10(configDir = CONFIG_DIR) {
  const file = readJson(path.join(configDir, "phase10-queries.json"));
  if (!Array.isArray(file.queries)) throw new Error("phase10 queries missing");
  return file.queries;
}

export function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { phase: { type: "string", default: DEFAULT_PHASE } },
  });
  const [cmd] = positionals;
  const raw = rawDir(values.phase);
  const plans = path.join(raw, "plans");
  fs.mkdirSync(plans, { recursive: true });
  const write = (name, data) =>
    fs.writeFileSync(
      path.join(plans, name),
      `${JSON.stringify(data, null, 2)}\n`,
    );
  const queries = loadPhase10();
  if (cmd === "searches") {
    for (const [name, items] of Object.entries(buildSearchPlans(queries))) {
      write(name, items);
      console.log(`${name}: ${items.length}`);
    }
  } else if (cmd === "sample") {
    const stored = storedRecordIds();
    const candidates = collectCandidates(
      readSearchEnvelopes(path.join(raw, "search")),
      queries,
      stored,
    );
    const { plans: out, manifest } = buildSample(candidates);
    for (const [name, items] of Object.entries(out)) write(name, items);
    write("sample-manifest.json", {
      excludedStoredIds: stored.size,
      platforms: manifest,
    });
    for (const m of manifest)
      console.log(
        `${m.platform}: ${m.selected}/${m.quota} (eligible ${m.eligible})`,
      );
  } else {
    console.error("usage: sample-personas.mjs searches|sample");
    process.exitCode = 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
