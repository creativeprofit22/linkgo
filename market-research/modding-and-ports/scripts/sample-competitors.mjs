#!/usr/bin/env node
// Builds the Phase 4 plans. Rules: 01-research-protocol.md section 10,
// Phase 4 addendum items 3 and 5.
//
//   node sample-competitors.mjs official   official-page scrape plan
//   node sample-competitors.mjs sentiment  Reddit / YouTube / forum plans
//
// official: one scrape per non-null slot URL in
// scripts/config/phase4-official-pages.json, plus slots resolved by the
// lookup searches (data/raw/<phase>/plans/official-lookups-resolved.json,
// {competitorId: {slot: url}}, written by Collector C1 with a logged reason).
// A URL used by several slots is scraped once.
//
// sentiment (hypothesis-blind): candidates are on-site results of the frozen
// community queries (a4-c* Reddit, a4-y* YouTube), one per record id, a URL
// found by several queries belonging to the lowest query id. Per platform,
// candidates are ordered by recordId (URL hash) and picked round-robin across
// queries up to the quota. Forum threads come from the open-web a4-d*
// results that are not on Reddit or YouTube and have a thread-shaped URL,
// picked the same way. Titles and snippets are never read.
//
// Output (git-ignored, contains URLs): data/raw/<phase>/plans/
//   a4-official-scrape.json   scrape items
//   official-manifest.json    recordId -> competitor and slots, no URLs
//   a4-reddit-{1..n}.json     reddit_posts, <= REDDIT_CHUNK items each
//   a4-youtube-{1..n}.json    youtube_comments, one video each, 12 comments
//   a4-forum-scrape.json      scrape items
//   sample-manifest.json      quotas and counts only, no URLs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  normaliseHost,
  readSearchEnvelopes,
  recordIdFor,
  resultsFromEnvelope,
} from "./dedupe.mjs";
import { CONFIG_DIR, rawDir } from "./lib/paths.mjs";
import { collectCommunityCandidates, roundRobin } from "./sample-audience.mjs";
import { PIPELINE_STRATA } from "./sample-deep.mjs";

export const REDDIT_CHUNK = 4;

const shape = (method) => {
  const s = PIPELINE_STRATA.find((x) => x.method === method);
  if (!s) throw new Error(`no URL-shape rule for ${method}`);
  return s.eligible;
};

export const QUOTAS = Object.freeze([
  {
    platform: "reddit",
    method: "reddit_posts",
    quota: 48,
    perQuery: 2,
    eligible: shape("reddit_posts"),
  },
  {
    platform: "youtube",
    method: "youtube_comments",
    quota: 6,
    perQuery: 1,
    numComments: 12,
    eligible: shape("youtube_videos"),
  },
]);

export const FORUM = Object.freeze({ quota: 8, perQuery: 2 });

const COMMUNITY_HOSTS = ["reddit.com", "youtube.com", "youtu.be"];
const THREAD_PATH =
  /\/(?:threads?|topics?|t|forums?|discussions?|questions)\/[^/]+|\/(?:viewtopic|showthread)\.php/i;

/** A forum-thread URL: not Reddit/YouTube, thread-shaped path. */
export function isForumThread(url) {
  const host = normaliseHost(url.hostname);
  if (COMMUNITY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)))
    return false;
  return THREAD_PATH.test(url.pathname + url.search);
}

export function loadPhase4Queries(configDir = CONFIG_DIR) {
  const file = JSON.parse(
    fs.readFileSync(path.join(configDir, "phase4-queries.json"), "utf8"),
  );
  if (!Array.isArray(file.queries)) throw new Error("phase4 queries missing");
  return file.queries;
}

export function loadOfficialPages(configDir = CONFIG_DIR) {
  const file = JSON.parse(
    fs.readFileSync(path.join(configDir, "phase4-official-pages.json"), "utf8"),
  );
  if (!Array.isArray(file.competitors) || !Array.isArray(file.slots))
    throw new Error("phase4 official pages malformed");
  return file;
}

/** Forum candidates from disconfirmation results: Map recordId -> candidate. */
export function collectForumCandidates(envelopes, queries) {
  const disconfirm = new Set(
    queries.filter((q) => q.group === "disconfirm").map((q) => q.id),
  );
  const ordered = [...envelopes].sort((a, b) =>
    a.queryId < b.queryId ? -1 : a.queryId > b.queryId ? 1 : 0,
  );
  const out = new Map();
  for (const { queryId, envelope } of ordered) {
    if (!disconfirm.has(queryId)) continue;
    for (const r of resultsFromEnvelope(envelope)) {
      let url;
      try {
        url = new URL(r.link);
      } catch {
        continue;
      }
      if (!/^https?:$/.test(url.protocol) || !isForumThread(url)) continue;
      const recordId = recordIdFor(url.href);
      if (out.has(recordId)) continue;
      out.set(recordId, {
        recordId,
        url: url.href,
        platform: "forum",
        queryId,
      });
    }
  }
  return out;
}

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
};

/** Applies quotas. Returns { plans: {name: items[]}, manifest }. */
export function buildCompetitorSample(community, forum) {
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
      ...(q.numComments ? { numComments: q.numComments } : {}),
    }));
    const size = q.platform === "reddit" ? REDDIT_CHUNK : 1;
    chunk(items, size).forEach((part, i) => {
      plans[`a4-${q.platform}-${i + 1}.json`] = part;
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
    plans["a4-forum-scrape.json"] = forumChosen.map((c) => ({
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
 * Official scrape plan from the frozen config plus resolved lookups.
 * Returns { items, manifest: [{recordId, competitor, slots}], missing }.
 */
export function buildOfficialPlan(config, resolved = {}) {
  const byId = new Map();
  const missing = [];
  for (const c of config.competitors) {
    for (const slot of config.slots) {
      const url = c.pages[slot] ?? resolved[c.id]?.[slot] ?? null;
      if (!url) {
        missing.push({ competitor: c.id, slot });
        continue;
      }
      const href = new URL(url).href;
      const recordId = recordIdFor(href);
      const prev = byId.get(recordId);
      if (prev) {
        prev.slots.push(`${c.id}:${slot}`);
        continue;
      }
      byId.set(recordId, {
        recordId,
        url: href,
        competitor: c.id,
        slots: [`${c.id}:${slot}`],
      });
    }
  }
  const entries = [...byId.values()];
  return {
    items: entries.map((e) => ({
      id: `ds-scrape-${e.recordId}`,
      kind: "scrape",
      url: e.url,
    })),
    manifest: entries.map(({ recordId, competitor, slots }) => ({
      recordId,
      competitor,
      slots,
    })),
    missing,
  };
}

const writeJson = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");

export function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { phase: { type: "string", default: "04-competitors" } },
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
    const { items, manifest, missing } = buildOfficialPlan(
      loadOfficialPages(),
      resolved,
    );
    writeJson(path.join(outDir, "a4-official-scrape.json"), items);
    writeJson(path.join(outDir, "official-manifest.json"), {
      pages: manifest,
      missing,
    });
    process.stdout.write(
      `a4-official-scrape.json: ${items.length} pages, ${missing.length} slots without a URL\n`,
    );
    return;
  }
  if (mode !== "sentiment")
    throw new Error("usage: sample-competitors.mjs official|sentiment");
  const queries = loadPhase4Queries();
  const envelopes = readSearchEnvelopes(path.join(raw, "search"));
  const community = collectCommunityCandidates(envelopes, queries);
  const forum = collectForumCandidates(envelopes, queries);
  const { plans, manifest } = buildCompetitorSample(community, forum);
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
