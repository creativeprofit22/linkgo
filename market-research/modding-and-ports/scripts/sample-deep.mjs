#!/usr/bin/env node
// Builds the Phase 2 deep-sample plans (hypothesis-blind, stratified).
// Candidates: on-site search results (protocol section 5.3 applied), one per
// record id. Within each stratum they are ordered by recordId (a URL hash:
// reproducible and unrelated to content) and the first N eligible are taken
// under fixed quotas. Titles and snippets are never read.
//
// Methods: reddit_posts, youtube_videos (+ youtube_comments, numComments 10,
// for the first few sampled videos), tiktok_posts (run with --timeout 600),
// x_posts, instagram_posts, facebook_posts; every other host uses `scrape`.
// Eligibility is by URL shape only (a post/video URL, not a profile or list).
// Instagram and Facebook are not matrix hosts, so their candidates can only
// come from disconfirmation (open-web) results.
//
// Output (git-ignored, contains URLs): data/raw/<phase>/plans/deep-*.json and
// deep-sample-manifest.json (quotas, candidate and selected counts, no URLs).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { expandMatrix } from "./build-queries.mjs";
import {
  normaliseHost,
  platformForHost,
  readSearchEnvelopes,
  recordIdFor,
  resultsFromEnvelope,
} from "./dedupe.mjs";
import { onsiteRule, queryResolver, splitOnSite } from "./lib/onsite.mjs";
import { CONFIG_DIR, rawDir } from "./lib/paths.mjs";

/** Pipeline strata: platform (from the platform map or host) -> method. */
export const PIPELINE_STRATA = Object.freeze([
  {
    stratum: "reddit",
    method: "reddit_posts",
    quota: 10,
    eligible: (u) => /\/comments\/[a-z0-9]+/i.test(u.pathname),
  },
  {
    stratum: "youtube",
    method: "youtube_videos",
    quota: 8,
    eligible: (u) =>
      (u.pathname === "/watch" && u.searchParams.has("v")) ||
      /^\/shorts\/[\w-]+/.test(u.pathname) ||
      (normaliseHost(u.hostname) === "youtu.be" && u.pathname.length > 1),
  },
  {
    stratum: "tiktok",
    method: "tiktok_posts",
    quota: 5,
    eligible: (u) => /\/video\/\d+/.test(u.pathname),
  },
  {
    stratum: "x",
    method: "x_posts",
    quota: 8,
    eligible: (u) => /\/status\/\d+/.test(u.pathname),
  },
  {
    stratum: "instagram",
    method: "instagram_posts",
    quota: 5,
    eligible: (u) =>
      /^\/(?:[\w.]+\/)?(?:p|reel|reels)\/[\w-]+/.test(u.pathname),
  },
  {
    stratum: "facebook",
    method: "facebook_posts",
    quota: 5,
    eligible: (u) =>
      /\/(?:posts|videos|reel|permalink\.php|share\/[pv])/.test(u.pathname) ||
      u.searchParams.has("story_fbid"),
  },
]);

export const YOUTUBE_COMMENTS = { quota: 4, numComments: 10 };
/** Scrape quota per remaining matrix platform, and for open-web results. */
export const SCRAPE_PER_PLATFORM = 2;
export const SCRAPE_OTHER = 8;

const EXTRA_HOSTS = {
  "instagram.com": "instagram",
  "facebook.com": "facebook",
  "fb.com": "facebook",
  "m.facebook.com": "facebook",
};

export function stratumOf(host, platforms) {
  const h = normaliseHost(host);
  for (const [alias, id] of Object.entries(EXTRA_HOSTS)) {
    if (h === alias || h.endsWith(`.${alias}`)) return id;
  }
  return platformForHost(h, platforms);
}

/** On-site candidates: Map recordId -> { recordId, url, stratum }. */
export function collectCandidates(envelopes, queries, platforms) {
  const resolve = queryResolver(queries);
  const out = new Map();
  for (const { queryId, envelope } of envelopes) {
    const rule = onsiteRule(resolve(queryId, envelope?.input), envelope?.input);
    const { kept } = splitOnSite(
      resultsFromEnvelope(envelope),
      rule,
      platforms,
    );
    for (const r of kept) {
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
        stratum: stratumOf(url.hostname, platforms),
      });
    }
  }
  return out;
}

const byRecordId = (a, b) => (a.recordId < b.recordId ? -1 : 1);

/** Applies quotas. Returns { plans: {name: items[]}, manifest }. */
export function buildDeepSample(candidates, platforms) {
  const all = [...candidates.values()].sort(byRecordId);
  const manifest = [];
  const plans = {};
  const add = (plan, item) => (plans[plan] ??= []).push(item);
  const pipelineStrata = new Set(PIPELINE_STRATA.map((s) => s.stratum));

  for (const s of PIPELINE_STRATA) {
    const inStratum = all.filter((c) => c.stratum === s.stratum);
    const eligible = inStratum.filter((c) => s.eligible(new URL(c.url)));
    const chosen = eligible.slice(0, s.quota);
    const plan =
      s.method === "tiktok_posts"
        ? "deep-tiktok.json"
        : s.method === "reddit_posts" || s.method === "x_posts"
          ? "deep-reddit-x.json"
          : s.method === "youtube_videos"
            ? "deep-youtube.json"
            : "deep-ig-fb.json";
    for (const c of chosen) {
      add(plan, {
        id: `ds-${s.method}-${c.recordId}`,
        kind: "pipeline",
        type: s.method,
        url: c.url,
      });
    }
    manifest.push({
      stratum: s.stratum,
      method: s.method,
      quota: s.quota,
      candidates: inStratum.length,
      eligible: eligible.length,
      selected: chosen.length,
    });
    if (s.method === "youtube_videos") {
      const withComments = chosen.slice(0, YOUTUBE_COMMENTS.quota);
      for (const c of withComments) {
        add("deep-youtube.json", {
          id: `ds-youtube_comments-${c.recordId}`,
          kind: "pipeline",
          type: "youtube_comments",
          url: c.url,
          numComments: YOUTUBE_COMMENTS.numComments,
        });
      }
      manifest.push({
        stratum: "youtube",
        method: "youtube_comments",
        quota: YOUTUBE_COMMENTS.quota,
        candidates: chosen.length,
        eligible: chosen.length,
        selected: withComments.length,
      });
    }
  }

  const scrapeStrata = [
    ...platforms.map((p) => p.id).filter((id) => !pipelineStrata.has(id)),
    "other",
  ];
  for (const stratum of scrapeStrata) {
    const quota = stratum === "other" ? SCRAPE_OTHER : SCRAPE_PER_PLATFORM;
    const inStratum = all.filter((c) => c.stratum === stratum);
    const chosen = inStratum.slice(0, quota);
    for (const c of chosen) {
      add("deep-scrape.json", {
        id: `ds-scrape-${c.recordId}`,
        kind: "scrape",
        url: c.url,
      });
    }
    manifest.push({
      stratum,
      method: "scrape",
      quota,
      candidates: inStratum.length,
      eligible: inStratum.length,
      selected: chosen.length,
    });
  }
  return { plans, manifest };
}

export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: { phase: { type: "string", default: "02-public-web" } },
  });
  const matrix = JSON.parse(
    fs.readFileSync(path.join(CONFIG_DIR, "query-matrix.json"), "utf8"),
  );
  const raw = rawDir(values.phase);
  const envelopes = readSearchEnvelopes(path.join(raw, "search"));
  const candidates = collectCandidates(
    envelopes,
    expandMatrix(matrix),
    matrix.platforms,
  );
  const { plans, manifest } = buildDeepSample(candidates, matrix.platforms);
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
    path.join(outDir, "deep-sample-manifest.json"),
    JSON.stringify({ candidates: candidates.size, strata: manifest }, null, 2) +
      "\n",
    "utf8",
  );
  for (const m of manifest) {
    process.stdout.write(
      `${m.stratum}/${m.method}: quota ${m.quota}, candidates ${m.candidates}, eligible ${m.eligible}, selected ${m.selected}\n`,
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
