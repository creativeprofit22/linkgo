#!/usr/bin/env node
// Builds the Phase 8 plans. Rules: 01-research-protocol.md section 10,
// Phase 8 addendum items 5-7.
//
//   node sample-community.mjs searches     search plans from phase8-queries.json
//   node sample-community.mjs directories  directory tag-page scrapes
//   node sample-community.mjs sample       Reddit / YouTube / TikTok / X / forum plans
//   node sample-community.mjs extra        forum plan from Disconfirmer p8-x* results
//
// Directories: the frozen Disboard tag pages plus any `added` entries in
// phase8-directories.json (each must be on a listed directory domain and carry
// the query id that found it). Server pages and invites are never planned.
//
// Sample (hypothesis-blind): candidates are on-site results of the frozen
// p8-g* queries for each platform, one per record id (a URL found by several
// queries belongs to the lowest query id). Per platform, candidates are
// ordered by recordId and picked round-robin across queries up to the quota.
// Forum threads come from the open-web p8-g* and the p8-d* results that are
// not on a social platform and have a thread-shaped URL. Titles and snippets
// are never read.
//
// Output (git-ignored, contains URLs): data/raw/<phase>/plans/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { readSearchEnvelopes, recordIdFor } from "./dedupe.mjs";
import { CONFIG_DIR, rawDir } from "./lib/paths.mjs";
import { collectCommunityCandidates, roundRobin } from "./sample-audience.mjs";
import { collectForumCandidates } from "./sample-competitors.mjs";
import { PIPELINE_STRATA } from "./sample-deep.mjs";

export const PREFIX = "p8";
export const DEFAULT_PHASE = "08-community";

const shape = (method) => {
  const s = PIPELINE_STRATA.find((x) => x.method === method);
  if (!s) throw new Error(`no URL-shape rule for ${method}`);
  return s.eligible;
};

export const QUOTAS = Object.freeze(
  [
    ["reddit", "reddit_posts", 16, 8],
    ["youtube", "youtube_videos", 8, 4],
    ["tiktok", "tiktok_posts", 8, 4],
    ["x", "x_posts", 8, 4],
  ].map(([platform, method, quota, chunk]) => ({
    platform,
    method,
    quota,
    perQuery: 2,
    chunk,
    eligible: shape(method),
  })),
);
export const FORUM = Object.freeze({ quota: 8, perQuery: 2 });
export const EXTRA = Object.freeze({ quota: 4, perQuery: 1 });
export const MAX_ADDED_DIRECTORIES = 4;

const scrapeItem = (url) => {
  const href = new URL(url).href;
  return { id: `ds-scrape-${recordIdFor(href)}`, kind: "scrape", url: href };
};

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
};

const countBy = (items, key) => {
  const out = {};
  for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
  return out;
};

/** Search plans per spender group, in query-id order. */
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
    [`${PREFIX}-search-main.json`]: pick([
      "community",
      "directory",
      "disconfirm",
    ]),
    [`${PREFIX}-search-disconfirmer.json`]: pick(["disconfirmer"]),
  };
}

const onDomain = (host, domain) =>
  host === domain || host.endsWith(`.${domain}`);

/** Directory tag-page scrapes. Rejects server pages, invites and other domains. */
export function buildDirectoryPlan(config) {
  const added = config.added ?? [];
  if (added.length > MAX_ADDED_DIRECTORIES)
    throw new Error(
      `added directories ${added.length} > ${MAX_ADDED_DIRECTORIES}`,
    );
  for (const a of added)
    if (!/^p8-s\d{2}$/.test(a.foundBy ?? ""))
      throw new Error(`added directory needs a p8-s* foundBy: ${a.url}`);
  const entries = [
    ...(config.disboard ?? []).map((d) => ({
      ...d,
      directory: "disboard.org",
    })),
    ...added,
  ];
  const items = [];
  const manifest = [];
  for (const e of entries) {
    const u = new URL(e.url);
    const host = u.hostname.toLowerCase();
    const domains = ["disboard.org", ...(config.otherDirectoryDomains ?? [])];
    if (u.protocol !== "https:" || !domains.some((d) => onDomain(host, d)))
      throw new Error(`not a listed directory domain: ${e.url}`);
    if (
      /\/(server\/\d|invite\/|server\/join)/i.test(u.pathname) ||
      host === "discord.gg"
    )
      throw new Error(`server page or invite not allowed: ${e.url}`);
    const item = scrapeItem(u.href);
    if (items.some((i) => i.id === item.id)) continue;
    items.push(item);
    manifest.push({
      recordId: item.id.slice(-16),
      directory: e.directory ?? host.replace(/^www\./, ""),
      tag: e.tag ?? null,
      foundBy: e.foundBy ?? null,
    });
  }
  return { items, manifest };
}

/** Forum-thread candidates from open-web p8-g* and p8-d* results. */
export function collectThreadCandidates(envelopes, queries) {
  const remapped = queries.map((q) => ({
    ...q,
    group:
      (q.group === "community" && q.platform === "web") ||
      q.group === "disconfirm"
        ? "disconfirm"
        : "other",
  }));
  return collectForumCandidates(envelopes, remapped);
}

/** Hypothesis-blind platform and forum sample (see header). */
export function buildSample(community, forum) {
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
      selected: chosen.length,
      selectedByQuery: countBy(chosen, (c) => c.queryId),
      recordIds: chosen.map((c) => c.recordId),
    });
  }
  const forumAll = [...forum.values()];
  const forumChosen = roundRobin(forumAll, FORUM.quota, FORUM.perQuery);
  plans[`${PREFIX}-forum-scrape.json`] = forumChosen.map((c) =>
    scrapeItem(c.url),
  );
  manifest.push({
    platform: "forum",
    method: "scrape",
    quota: FORUM.quota,
    perQuery: FORUM.perQuery,
    candidates: forumAll.length,
    eligible: forumAll.length,
    selected: forumChosen.length,
    selectedByQuery: countBy(forumChosen, (c) => c.queryId),
    recordIds: forumChosen.map((c) => c.recordId),
  });
  return { plans, manifest };
}

/** Disconfirmer extra: first non-social thread per p8-x* query, quota 4. */
export function buildExtraSample(envelopes, queries) {
  const extraQueries = queries
    .filter((q) => q.group === "disconfirmer")
    .map((q) => ({ ...q, group: "disconfirm" }));
  const candidates = collectForumCandidates(envelopes, extraQueries);
  const chosen = roundRobin(
    [...candidates.values()],
    EXTRA.quota,
    EXTRA.perQuery,
  );
  return {
    items: chosen.map((c) => scrapeItem(c.url)),
    manifest: chosen.map((c) => ({ recordId: c.recordId, queryId: c.queryId })),
  };
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

export function loadPhase8(configDir = CONFIG_DIR) {
  return {
    queries: readJson(path.join(configDir, "phase8-queries.json")).queries,
    directories: readJson(path.join(configDir, "phase8-directories.json")),
  };
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
  const { queries, directories } = loadPhase8();
  const envelopes = () => readSearchEnvelopes(path.join(raw, "search"));
  if (cmd === "searches") {
    for (const [name, items] of Object.entries(buildSearchPlans(queries))) {
      write(name, items);
      console.log(`${name}: ${items.length}`);
    }
  } else if (cmd === "directories") {
    const { items, manifest } = buildDirectoryPlan(directories);
    write(`${PREFIX}-directories-scrape.json`, items);
    write("directory-manifest.json", manifest);
    console.log(`directories: ${items.length}`);
  } else if (cmd === "sample") {
    const env = envelopes();
    const { plans: out, manifest } = buildSample(
      collectCommunityCandidates(env, queries),
      collectThreadCandidates(env, queries),
    );
    for (const [name, items] of Object.entries(out)) write(name, items);
    write("sample-manifest.json", { platforms: manifest });
    for (const m of manifest)
      console.log(
        `${m.platform}: ${m.selected}/${m.quota} (eligible ${m.eligible})`,
      );
  } else if (cmd === "extra") {
    const { items, manifest } = buildExtraSample(envelopes(), queries);
    write(`${PREFIX}-x-forum-scrape.json`, items);
    write("extra-manifest.json", manifest);
    console.log(`extra: ${items.length}/${EXTRA.quota}`);
  } else {
    console.error(
      "usage: sample-community.mjs searches|directories|sample|extra",
    );
    process.exitCode = 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
