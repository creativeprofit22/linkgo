#!/usr/bin/env node
// Builds the Phase 5 plans. Rules: 01-research-protocol.md section 10,
// Phase 5 addendum items 3 and 5.
//
//   node sample-creator.mjs official   official tool-page scrape plan
//   node sample-creator.mjs learners   Reddit / YouTube / forum plans
//   node sample-creator.mjs extra      forum plan from Disconfirmer a5-x* results
//
// official: one scrape per non-null slot URL in scripts/config/phase5-tools.json,
// plus slots resolved by the lookup searches
// (data/raw/<phase>/plans/official-lookups-resolved.json, {toolId: {slot: url}},
// written by Collector C1 with a logged reason). A resolved URL wins over the
// config URL: C1 only writes one for a null slot or for a config URL that was
// not found or still blocked after two retry rounds. A URL used by several
// slots is scraped once.
//
// learners (hypothesis-blind): candidates are on-site results of the frozen
// community queries (a5-c* Reddit, a5-y* YouTube), one per record id, a URL
// found by several queries belonging to the lowest query id. Per platform,
// candidates are ordered by recordId (URL hash) and picked round-robin across
// queries up to the quota. Forum threads come from the open-web a5-d* results
// that are not on Reddit or YouTube and have a thread-shaped URL, picked the
// same way. Titles and snippets are never read.
//
// Output (git-ignored, contains URLs): data/raw/<phase>/plans/
//   a5-official-scrape.json   scrape items
//   official-manifest.json    recordId -> tool and slots, no URLs
//   a5-reddit-{1..n}.json     reddit_posts, <= REDDIT_CHUNK items each
//   a5-youtube-{1..n}.json    youtube_videos, <= YOUTUBE_CHUNK items each
//   a5-forum-scrape.json      scrape items
//   sample-manifest.json      quotas and counts only, no URLs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { readSearchEnvelopes } from "./dedupe.mjs";
import { CONFIG_DIR, rawDir } from "./lib/paths.mjs";
import { collectCommunityCandidates, roundRobin } from "./sample-audience.mjs";
import {
  buildOfficialPlan,
  collectForumCandidates,
} from "./sample-competitors.mjs";
import { PIPELINE_STRATA } from "./sample-deep.mjs";

export const PREFIX = "a5";
export const REDDIT_CHUNK = 4;
export const YOUTUBE_CHUNK = 2;

const shape = (method) => {
  const s = PIPELINE_STRATA.find((x) => x.method === method);
  if (!s) throw new Error(`no URL-shape rule for ${method}`);
  return s.eligible;
};

export const QUOTAS = Object.freeze([
  {
    platform: "reddit",
    method: "reddit_posts",
    quota: 30,
    perQuery: 2,
    chunk: REDDIT_CHUNK,
    eligible: shape("reddit_posts"),
  },
  {
    platform: "youtube",
    method: "youtube_videos",
    quota: 10,
    perQuery: 1,
    chunk: YOUTUBE_CHUNK,
    eligible: shape("youtube_videos"),
  },
]);

export const FORUM = Object.freeze({ quota: 6, perQuery: 2 });
// Disconfirmer additions (a5-x*, group "disconfirmer"): sampled on their own
// so the frozen a5-d* forum sample is unchanged.
export const EXTRA = Object.freeze({ quota: 4, perQuery: 1 });

/** Thread-shaped open-web candidates from the Disconfirmer's a5-x* queries. */
export function buildExtraSample(envelopes, queries) {
  const asDisconfirm = queries
    .filter((q) => q.group === "disconfirmer")
    .map((q) => ({ ...q, group: "disconfirm" }));
  const candidates = [
    ...collectForumCandidates(envelopes, asDisconfirm).values(),
  ];
  const chosen = roundRobin(candidates, EXTRA.quota, EXTRA.perQuery);
  return {
    items: chosen.map((c) => ({
      id: `ds-scrape-${c.recordId}`,
      kind: "scrape",
      url: c.url,
    })),
    manifest: {
      platform: "forum-extra",
      quota: EXTRA.quota,
      perQuery: EXTRA.perQuery,
      candidates: candidates.length,
      selected: chosen.length,
    },
  };
}

const readConfig = (name, configDir) =>
  JSON.parse(fs.readFileSync(path.join(configDir, name), "utf8"));

export function loadPhase5Queries(configDir = CONFIG_DIR) {
  const file = readConfig("phase5-queries.json", configDir);
  if (!Array.isArray(file.queries)) throw new Error("phase5 queries missing");
  return file.queries;
}

export function loadTools(configDir = CONFIG_DIR) {
  const file = readConfig("phase5-tools.json", configDir);
  if (!Array.isArray(file.tools) || !Array.isArray(file.slots))
    throw new Error("phase5 tools malformed");
  return file;
}

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
};

/** Applies quotas. Returns { plans: {name: items[]}, manifest }. */
export function buildCreatorSample(community, forum) {
  const all = [...community.values()];
  const plans = {};
  const manifest = [];
  for (const q of QUOTAS) {
    const onPlatform = all.filter((c) => c.platform === q.platform);
    const eligible = onPlatform.filter((c) => q.eligible(new URL(c.url)));
    const chosen = roundRobin(eligible, q.quota, q.perQuery);
    const items = chosen.map((c) => ({
      id: `ds-${q.method}-${c.recordId}`,
      kind: "pipeline",
      type: q.method,
      url: c.url,
    }));
    chunk(items, q.chunk).forEach((part, i) => {
      plans[`${PREFIX}-${q.platform}-${i + 1}.json`] = part;
    });
    manifest.push({
      platform: q.platform,
      method: q.method,
      quota: q.quota,
      perQuery: q.perQuery,
      candidates: onPlatform.length,
      eligible: eligible.length,
      queriesWithEligible: new Set(eligible.map((c) => c.queryId)).size,
      selected: chosen.length,
    });
  }
  const forumAll = [...forum.values()];
  const forumChosen = roundRobin(forumAll, FORUM.quota, FORUM.perQuery);
  if (forumChosen.length) {
    plans[`${PREFIX}-forum-scrape.json`] = forumChosen.map((c) => ({
      id: `ds-scrape-${c.recordId}`,
      kind: "scrape",
      url: c.url,
    }));
  }
  manifest.push({
    platform: "forum",
    method: "scrape",
    quota: FORUM.quota,
    perQuery: FORUM.perQuery,
    candidates: forumAll.length,
    eligible: forumAll.length,
    queriesWithEligible: new Set(forumAll.map((c) => c.queryId)).size,
    selected: forumChosen.length,
  });
  return { plans, manifest };
}

/**
 * Official tool-page plan. Resolved lookups override config URLs (see header).
 * Returns { items, manifest: [{recordId, tool, slots}], missing: [{tool, slot}] }.
 */
export function buildToolPlan(config, resolved = {}) {
  const competitors = config.tools.map((t) => ({
    id: t.id,
    pages: Object.fromEntries(
      config.slots.map((s) => [s, resolved[t.id]?.[s] ?? t.pages[s] ?? null]),
    ),
  }));
  const { items, manifest, missing } = buildOfficialPlan({
    slots: config.slots,
    competitors,
  });
  return {
    items,
    manifest: manifest.map(({ recordId, competitor, slots }) => ({
      recordId,
      tool: competitor,
      slots,
    })),
    missing: missing.map(({ competitor, slot }) => ({
      tool: competitor,
      slot,
    })),
  };
}

const writeJson = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");

export function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { phase: { type: "string", default: "05-creator-tools" } },
  });
  const mode = positionals[0];
  const raw = rawDir(values.phase);
  const outDir = path.join(raw, "plans");
  fs.mkdirSync(outDir, { recursive: true });
  if (mode === "official") {
    const resolvedFile = path.join(outDir, "official-lookups-resolved.json");
    const resolved = fs.existsSync(resolvedFile)
      ? JSON.parse(fs.readFileSync(resolvedFile, "utf8"))
      : {};
    const { items, manifest, missing } = buildToolPlan(loadTools(), resolved);
    writeJson(path.join(outDir, `${PREFIX}-official-scrape.json`), items);
    writeJson(path.join(outDir, "official-manifest.json"), {
      pages: manifest,
      missing,
    });
    process.stdout.write(
      `${PREFIX}-official-scrape.json: ${items.length} pages, ${missing.length} slots without a URL\n`,
    );
    return;
  }
  if (mode === "extra") {
    const envelopes = readSearchEnvelopes(path.join(raw, "search"));
    const { items, manifest } = buildExtraSample(
      envelopes,
      loadPhase5Queries(),
    );
    writeJson(path.join(outDir, `${PREFIX}-x-forum-scrape.json`), items);
    writeJson(path.join(outDir, "extra-manifest.json"), manifest);
    process.stdout.write(
      `${PREFIX}-x-forum-scrape.json: ${items.length} (candidates ${manifest.candidates})\n`,
    );
    return;
  }
  if (mode !== "learners")
    throw new Error("usage: sample-creator.mjs official|learners|extra");
  const queries = loadPhase5Queries();
  const envelopes = readSearchEnvelopes(path.join(raw, "search"));
  const community = collectCommunityCandidates(envelopes, queries);
  const forum = collectForumCandidates(envelopes, queries);
  const { plans, manifest } = buildCreatorSample(community, forum);
  for (const [name, items] of Object.entries(plans).sort()) {
    writeJson(path.join(outDir, name), items);
    process.stdout.write(`${name}: ${items.length}\n`);
  }
  writeJson(path.join(outDir, "sample-manifest.json"), {
    candidates: community.size + forum.size,
    platforms: manifest,
  });
  for (const m of manifest) {
    process.stdout.write(
      `${m.platform}/${m.method}: quota ${m.quota}, candidates ${m.candidates}, eligible ${m.eligible}, selected ${m.selected}\n`,
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
