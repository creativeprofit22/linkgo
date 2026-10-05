#!/usr/bin/env node
// Builds the Phase 7 plans. Rules: 01-research-protocol.md section 10,
// Phase 7 addendum items 4-6.
//
//   node sample-legal.mjs searches   search plans from phase7-queries.json
//   node sample-legal.mjs policies   policy scrapes from lookup results
//   node sample-legal.mjs sample     case, revival and disconfirmation scrapes
//   node sample-legal.mjs extra      Disconfirmer p7-x* scrapes
//
// Policies: for each policy in phase7-policies.json, the first result of its
// lookup query whose host is one of the policy's official domains (or a
// subdomain of one). No URL is guessed; a policy with no such result is
// recorded "not found".
//
// Cases / disconfirmation / extra: the first non-social result of each query
// (rank order) that is not already selected, up to the quota.
//
// Revival (hypothesis-blind): non-social results of the p7-v* queries, one
// per record id (a URL found by several queries belongs to the lowest query
// id), ordered by recordId and picked round-robin across queries, at most 2
// per query, up to the quota. Titles and snippets are never read.
//
// Social sites are never scraped (the unlocker zone was blocked there in the
// Phase 1 pilot). Output (git-ignored, contains URLs): data/raw/<phase>/plans/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  readSearchEnvelopes,
  recordIdFor,
  resultsFromEnvelope,
} from "./dedupe.mjs";
import { CONFIG_DIR, rawDir } from "./lib/paths.mjs";
import { roundRobin } from "./sample-audience.mjs";

export const PREFIX = "p7";
export const DEFAULT_PHASE = "07-legal";
export const QUOTAS = Object.freeze({
  cases: 20,
  revival: 16,
  revivalPerQuery: 2,
  disconfirm: 6,
  extra: 4,
});

const SOCIAL = [
  "reddit.com",
  "redd.it",
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "instagram.com",
  "facebook.com",
  "fb.com",
  // Logged deviation 2026-10-03 (protocol section 10, Phase 7 item 6):
  // LinkedIn scraping is off-limits in this repository.
  "linkedin.com",
];

const onDomain = (host, domain) =>
  host === domain || host.endsWith(`.${domain}`);

/** True for the social platforms this phase never scrapes. */
export function isSocial(url) {
  const host = new URL(url).hostname.toLowerCase();
  return SOCIAL.some((d) => onDomain(host, d));
}

const parse = (link) => {
  try {
    const u = new URL(link);
    return /^https?:$/.test(u.protocol) ? u : null;
  } catch {
    return null;
  }
};

const scrapeItem = (href) => ({
  id: `ds-scrape-${recordIdFor(href)}`,
  kind: "scrape",
  url: href,
});

const byQuery = (envelopes) => {
  const map = new Map();
  for (const e of envelopes) map.set(e.queryId, e.envelope);
  return map;
};

/** Search plans per group, in query-id order. */
export function buildSearchPlans(queries) {
  const sorted = [...queries].sort((a, b) => (a.id < b.id ? -1 : 1));
  const pick = (groups) =>
    sorted
      .filter((q) => groups.includes(q.group))
      .map((q) => ({
        id: q.id,
        kind: "search",
        query: q.query,
        ...(q.searchType ? { searchType: q.searchType } : {}),
      }));
  return {
    [`${PREFIX}-search-enforcement.json`]: pick(["enforcement"]),
    [`${PREFIX}-search-revival.json`]: pick(["revival", "disconfirm"]),
    [`${PREFIX}-search-lookups.json`]: pick(["lookup"]),
    [`${PREFIX}-search-disconfirmer.json`]: pick(["disconfirmer"]),
  };
}

/** Policy scrapes: first official-domain result of each lookup query. */
export function buildPolicyPlan(policies, envelopes) {
  const env = byQuery(envelopes);
  const items = [];
  const manifest = [];
  for (const p of policies) {
    let hit = null;
    for (const r of resultsFromEnvelope(env.get(p.lookup))) {
      const u = parse(r.link);
      if (!u) continue;
      const host = u.hostname.toLowerCase();
      if (p.domains.some((d) => onDomain(host, d))) {
        hit = u.href;
        break;
      }
    }
    const searched = env.has(p.lookup);
    manifest.push({
      policy: p.id,
      lookup: p.lookup,
      status: hit ? "found" : searched ? "not found" : "lookup not run",
      recordId: hit ? recordIdFor(hit) : null,
    });
    if (hit && !items.some((i) => i.url === hit)) items.push(scrapeItem(hit));
  }
  return { items, manifest };
}

/**
 * First non-social result per query (rank order) not already selected, for
 * the given query ids in id order, up to `quota`.
 */
export function buildFirstResultPlan(envelopes, queryIds, quota) {
  const env = byQuery(envelopes);
  const chosen = new Map();
  const manifest = [];
  for (const id of [...queryIds].sort()) {
    if (chosen.size >= quota) break;
    let hit = null;
    for (const r of resultsFromEnvelope(env.get(id))) {
      const u = parse(r.link);
      if (!u || isSocial(u.href)) continue;
      const rid = recordIdFor(u.href);
      if (chosen.has(rid)) continue;
      hit = { recordId: rid, url: u.href };
      break;
    }
    manifest.push({ queryId: id, recordId: hit?.recordId ?? null });
    if (hit) chosen.set(hit.recordId, hit);
  }
  return {
    items: [...chosen.values()].map((c) => scrapeItem(c.url)),
    manifest,
  };
}

/** Hypothesis-blind revival sample (see header). */
export function buildRevivalSample(envelopes, queryIds) {
  const ids = new Set(queryIds);
  const candidates = new Map();
  const ordered = [...envelopes].sort((a, b) =>
    a.queryId < b.queryId ? -1 : a.queryId > b.queryId ? 1 : 0,
  );
  for (const { queryId, envelope } of ordered) {
    if (!ids.has(queryId)) continue;
    for (const r of resultsFromEnvelope(envelope)) {
      const u = parse(r.link);
      if (!u || isSocial(u.href)) continue;
      const recordId = recordIdFor(u.href);
      if (!candidates.has(recordId))
        candidates.set(recordId, { recordId, url: u.href, queryId });
    }
  }
  const picked = roundRobin(
    [...candidates.values()],
    QUOTAS.revival,
    QUOTAS.revivalPerQuery,
  );
  const perQuery = {};
  for (const c of picked) perQuery[c.queryId] = (perQuery[c.queryId] ?? 0) + 1;
  return {
    items: picked.map((c) => scrapeItem(c.url)),
    manifest: {
      eligible: candidates.size,
      quota: QUOTAS.revival,
      selected: picked.length,
      selectedByQuery: perQuery,
      recordIds: picked.map((c) => c.recordId),
    },
  };
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

export function loadPhase7(configDir = CONFIG_DIR) {
  return {
    queries: readJson(path.join(configDir, "phase7-queries.json")).queries,
    policies: readJson(path.join(configDir, "phase7-policies.json")).policies,
  };
}

const idsOf = (queries, group) =>
  queries.filter((q) => q.group === group).map((q) => q.id);

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
  const { queries, policies } = loadPhase7();
  const envelopes = () => readSearchEnvelopes(path.join(raw, "search"));
  if (cmd === "searches") {
    for (const [name, items] of Object.entries(buildSearchPlans(queries))) {
      write(name, items);
      console.log(`${name}: ${items.length}`);
    }
  } else if (cmd === "policies") {
    const { items, manifest } = buildPolicyPlan(policies, envelopes());
    write(`${PREFIX}-policies-scrape.json`, items);
    write("policy-manifest.json", manifest);
    console.log(
      `policies: ${items.length} found, ${manifest.filter((m) => m.status !== "found").length} not found`,
    );
  } else if (cmd === "sample") {
    const env = envelopes();
    const cases = buildFirstResultPlan(
      env,
      idsOf(queries, "enforcement"),
      QUOTAS.cases,
    );
    const revival = buildRevivalSample(env, idsOf(queries, "revival"));
    const taken = new Set([...cases.items, ...revival.items].map((i) => i.id));
    const disc = buildFirstResultPlan(
      env,
      idsOf(queries, "disconfirm"),
      QUOTAS.disconfirm,
    );
    write(`${PREFIX}-cases-scrape.json`, cases.items);
    write(`${PREFIX}-revival-scrape.json`, revival.items);
    write(
      `${PREFIX}-disconfirm-scrape.json`,
      disc.items.filter((i) => !taken.has(i.id)),
    );
    write("sample-manifest.json", {
      cases: cases.manifest,
      revival: revival.manifest,
      disconfirm: disc.manifest,
    });
    console.log(
      `cases ${cases.items.length}, revival ${revival.items.length} of ${revival.manifest.eligible}, disconfirm ${disc.items.length}`,
    );
  } else if (cmd === "extra") {
    const env = envelopes();
    const extra = buildFirstResultPlan(
      env,
      idsOf(queries, "disconfirmer"),
      QUOTAS.extra,
    );
    write(`${PREFIX}-extra-scrape.json`, extra.items);
    write("extra-manifest.json", extra.manifest);
    console.log(`extra ${extra.items.length}`);
  } else {
    console.error(
      "usage: sample-legal.mjs searches|policies|sample|extra [--phase id]",
    );
    return 2;
  }
  return 0;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
)
  process.exitCode = main();
