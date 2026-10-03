#!/usr/bin/env node
// Builds the Phase 3 community sample plans (hypothesis-blind). Rule:
// 01-research-protocol.md section 10, Phase 3 addendum item 7.
//
// Candidates: on-site results of the frozen `a3-c*` community queries
// (scripts/config/phase3-queries.json), one per record id. A URL returned by
// several queries belongs to the lowest query id. Per platform, each query's
// eligible candidates are ordered by recordId (a URL hash: reproducible and
// unrelated to content), at most PER_QUERY are kept, and picks go round-robin
// across queries (in id order) until the quota is reached. Titles and
// snippets are never read. Eligibility is by URL shape only, with the same
// rules as sample-deep.mjs (a post/video URL, not a profile or list).
//
// Output (git-ignored, contains URLs): data/raw/<phase>/plans/
//   a3-reddit-{1..n}.json   reddit_posts, <= REDDIT_CHUNK items each
//   a3-youtube-comments.json youtube_comments, numComments 12
//   a3-tiktok-{1..n}.json   tiktok_comments, one item each (--timeout 600)
//   sample-manifest.json    quotas and counts only, no URLs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  readSearchEnvelopes,
  recordIdFor,
  resultsFromEnvelope,
} from "./dedupe.mjs";
import { isOnSite, onsiteRule } from "./lib/onsite.mjs";
import { CONFIG_DIR, rawDir } from "./lib/paths.mjs";
import { PIPELINE_STRATA } from "./sample-deep.mjs";

export const PER_QUERY = 3;
export const REDDIT_CHUNK = 4;

const shape = (method) => {
  const s = PIPELINE_STRATA.find((x) => x.method === method);
  if (!s) throw new Error(`no URL-shape rule for ${method}`);
  return s.eligible;
};

/** Platform quotas; eligibility reuses the sample-deep URL-shape rules. */
export const QUOTAS = Object.freeze([
  {
    platform: "reddit",
    method: "reddit_posts",
    quota: 30,
    eligible: shape("reddit_posts"),
  },
  {
    platform: "youtube",
    method: "youtube_comments",
    quota: 5,
    numComments: 12,
    eligible: shape("youtube_videos"),
  },
  {
    platform: "tiktok",
    method: "tiktok_comments",
    quota: 3,
    eligible: shape("tiktok_posts"),
  },
]);

export function loadFrozenQueries(configDir = CONFIG_DIR) {
  const file = JSON.parse(
    fs.readFileSync(path.join(configDir, "phase3-queries.json"), "utf8"),
  );
  if (!Array.isArray(file.queries)) throw new Error("phase3 queries missing");
  return file.queries;
}

/**
 * On-site community candidates: Map recordId -> { recordId, url, platform,
 * queryId }. Envelopes whose id is not a frozen community query are ignored.
 */
export function collectCommunityCandidates(envelopes, queries) {
  const community = new Map(
    queries.filter((q) => q.group === "community").map((q) => [q.id, q]),
  );
  const ordered = [...envelopes].sort((a, b) =>
    a.queryId < b.queryId ? -1 : a.queryId > b.queryId ? 1 : 0,
  );
  const out = new Map();
  for (const { queryId, envelope } of ordered) {
    const meta = community.get(queryId);
    if (!meta) continue;
    const rule = onsiteRule(undefined, meta.query);
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
      if (!/^https?:$/.test(url.protocol) || out.has(recordId)) continue;
      out.set(recordId, {
        recordId,
        url: url.href,
        platform: meta.platform,
        queryId,
      });
    }
  }
  return out;
}

const byRecordId = (a, b) => (a.recordId < b.recordId ? -1 : 1);

/** Round-robin pick across queries (id order), <= perQuery each, up to quota. */
export function roundRobin(candidates, quota, perQuery = PER_QUERY) {
  const groups = new Map();
  for (const c of [...candidates].sort(byRecordId)) {
    const list = groups.get(c.queryId) ?? [];
    if (list.length < perQuery) list.push(c);
    groups.set(c.queryId, list);
  }
  const ids = [...groups.keys()].sort();
  const chosen = [];
  for (let round = 0; round < perQuery && chosen.length < quota; round++) {
    for (const id of ids) {
      const c = groups.get(id)[round];
      if (c && chosen.length < quota) chosen.push(c);
    }
  }
  return chosen;
}

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
};

/** Applies quotas. Returns { plans: {name: items[]}, manifest }. */
export function buildAudienceSample(candidates) {
  const all = [...candidates.values()];
  const plans = {};
  const manifest = [];
  for (const q of QUOTAS) {
    const onPlatform = all.filter((c) => c.platform === q.platform);
    const eligible = onPlatform.filter((c) => q.eligible(new URL(c.url)));
    const chosen = roundRobin(eligible, q.quota);
    const items = chosen.map((c) => ({
      id: `ds-${q.method}-${c.recordId}`,
      kind: "pipeline",
      type: q.method,
      url: c.url,
      ...(q.numComments ? { numComments: q.numComments } : {}),
    }));
    if (q.platform === "reddit") {
      chunk(items, REDDIT_CHUNK).forEach((part, i) => {
        plans[`a3-reddit-${i + 1}.json`] = part;
      });
    } else if (q.platform === "youtube") {
      if (items.length) plans["a3-youtube-comments.json"] = items;
    } else {
      items.forEach((item, i) => {
        plans[`a3-tiktok-${i + 1}.json`] = [item];
      });
    }
    manifest.push({
      platform: q.platform,
      method: q.method,
      quota: q.quota,
      perQuery: PER_QUERY,
      candidates: onPlatform.length,
      eligible: eligible.length,
      queriesWithEligible: new Set(eligible.map((c) => c.queryId)).size,
      selected: chosen.length,
    });
  }
  return { plans, manifest };
}

export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: { phase: { type: "string", default: "03-audience" } },
  });
  const raw = rawDir(values.phase);
  const envelopes = readSearchEnvelopes(path.join(raw, "search"));
  const candidates = collectCommunityCandidates(envelopes, loadFrozenQueries());
  const { plans, manifest } = buildAudienceSample(candidates);
  const outDir = path.join(raw, "plans");
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, items] of Object.entries(plans).sort()) {
    fs.writeFileSync(
      path.join(outDir, name),
      JSON.stringify(items, null, 2) + "\n",
      "utf8",
    );
    process.stdout.write(`${name}: ${items.length}\n`);
  }
  fs.writeFileSync(
    path.join(outDir, "sample-manifest.json"),
    JSON.stringify(
      { candidates: candidates.size, platforms: manifest },
      null,
      2,
    ) + "\n",
    "utf8",
  );
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
