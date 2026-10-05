#!/usr/bin/env node
// Builds the Phase 6 plans. Rules: 01-research-protocol.md section 10,
// Phase 6 addendum items 5-8.
//
//   node sample-ports.mjs searches    search plans from phase6-queries.json
//   node sample-ports.mjs inventory   curated-list, project-page and GitHub plans
//   node sample-ports.mjs learners    Reddit / YouTube / forum demand plans
//   node sample-ports.mjs extra       forum plan from Disconfirmer p6-x* results
//
// searches: one plan per spender (C1 = p6-i* + news for C1, C2 = p6-r* + news
// for C2, community = p6-c* + p6-y*, disconfirm = p6-d*, disconfirmer = p6-x*).
//
// inventory: curated lists from scripts/config/phase6-sources.json (scrape and
// the one reddit_posts list thread); GitHub README items for every port with a
// repository; for Rust candidates (appended by C2 with a logged reason) a
// repository-page scrape (language check) and a README or Cargo.toml item;
// optional project pages (`ports[].page`, appended by C1 with a reason).
// GitHub items read text files only (README.md / Cargo.toml) through
// `github_repository_file`; release assets and binaries are never requested.
//
// learners (hypothesis-blind): candidates are on-site results of the frozen
// community queries (p6-c* Reddit, p6-y* YouTube), one per record id, a URL
// found by several queries belonging to the lowest query id. Per platform,
// candidates are ordered by recordId (URL hash) and picked round-robin across
// queries up to the quota. Forum threads come from the open-web p6-d* results
// that are not on Reddit or YouTube and have a thread-shaped URL. Titles and
// snippets are never read.
//
// Output (git-ignored, contains URLs): data/raw/<phase>/plans/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { readSearchEnvelopes, recordIdFor } from "./dedupe.mjs";
import { CONFIG_DIR, rawDir } from "./lib/paths.mjs";
import { collectCommunityCandidates, roundRobin } from "./sample-audience.mjs";
import {
  buildOfficialPlan,
  collectForumCandidates,
} from "./sample-competitors.mjs";
import { PIPELINE_STRATA } from "./sample-deep.mjs";

export const PREFIX = "p6";
export const DEFAULT_PHASE = "06-ports-rust";

const shape = (method) => {
  const s = PIPELINE_STRATA.find((x) => x.method === method);
  if (!s) throw new Error(`no URL-shape rule for ${method}`);
  return s.eligible;
};

export const QUOTAS = Object.freeze([
  {
    platform: "reddit",
    method: "reddit_posts",
    quota: 28,
    perQuery: 2,
    chunk: 7,
    eligible: shape("reddit_posts"),
  },
  {
    platform: "youtube",
    method: "youtube_videos",
    quota: 8,
    perQuery: 1,
    chunk: 4,
    eligible: shape("youtube_videos"),
  },
]);

export const FORUM = Object.freeze({ quota: 6, perQuery: 2 });
export const EXTRA = Object.freeze({ quota: 4, perQuery: 1 });
export const GITHUB_LIMITS = Object.freeze({ ports: 15, rust: 10 });
export const RUST_PAGE_LIMIT = 10;
export const PORT_PAGE_LIMIT = 8;

/** Only these repository text files may be requested. */
// readme.md: lower-case README name used by some repositories (e.g.
// OpenRCT2); still a text file, used only for the logged one-time retry.
export const GITHUB_FILES = Object.freeze([
  "README.md",
  "readme.md",
  "Cargo.toml",
]);
const BRANCH = /^[A-Za-z0-9._-]+$/;

/**
 * Normalises a GitHub repository URL to https://github.com/<owner>/<repo>.
 * Throws for anything that is not exactly a repository root.
 */
export function repoRoot(url) {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.hostname !== "github.com")
    throw new Error(`not a github.com repository: ${url}`);
  const segs = u.pathname.split("/").filter(Boolean);
  if (segs.length !== 2 || segs.some((s) => !/^[A-Za-z0-9._-]+$/.test(s)))
    throw new Error(`not a repository root: ${url}`);
  return `https://github.com/${segs[0]}/${segs[1].replace(/\.git$/, "")}`;
}

/**
 * GitHub text-file items. `entries`: [{ repo, file?, branch? }]. File defaults
 * to README.md and must be in GITHUB_FILES; branch defaults to HEAD (the
 * default branch). Duplicate URLs are kept once. Returns { items, manifest }.
 */
export function buildGithubPlan(entries, limit) {
  const byId = new Map();
  for (const e of entries) {
    const file = e.file ?? "README.md";
    if (!GITHUB_FILES.includes(file))
      throw new Error(`file not allowed: ${file}`);
    const branch = e.branch ?? "HEAD";
    if (!BRANCH.test(branch)) throw new Error(`bad branch: ${branch}`);
    const url = `${repoRoot(e.repo)}/blob/${branch}/${file}`;
    const recordId = recordIdFor(url);
    if (byId.has(recordId)) continue;
    byId.set(recordId, { recordId, url, project: e.name ?? e.term, file });
  }
  const entriesOut = [...byId.values()];
  if (limit != null && entriesOut.length > limit)
    throw new Error(`github plan has ${entriesOut.length} items > ${limit}`);
  return {
    items: entriesOut.map((e) => ({
      id: `ds-github_repository_file-${e.recordId}`,
      kind: "pipeline",
      type: "github_repository_file",
      url: e.url,
    })),
    manifest: entriesOut.map(({ recordId, project, file }) => ({
      recordId,
      project,
      file,
    })),
  };
}

/** Search plans per spender, in query-id order. */
export function buildSearchPlans(queries) {
  const item = (q) => ({
    id: q.id,
    kind: "search",
    query: q.query,
    ...(q.searchType ? { searchType: q.searchType } : {}),
  });
  const sorted = [...queries].sort((a, b) => (a.id < b.id ? -1 : 1));
  const pick = (test) => sorted.filter(test).map(item);
  return {
    [`${PREFIX}-search-c1.json`]: pick(
      (q) =>
        q.group === "inventory" || (q.group === "news" && q.collector === "C1"),
    ),
    [`${PREFIX}-search-c2.json`]: pick(
      (q) => q.group === "rust" || (q.group === "news" && q.collector === "C2"),
    ),
    [`${PREFIX}-search-community.json`]: pick((q) => q.group === "community"),
    [`${PREFIX}-search-disconfirm.json`]: pick((q) => q.group === "disconfirm"),
    [`${PREFIX}-search-disconfirmer.json`]: pick(
      (q) => q.group === "disconfirmer",
    ),
  };
}

const scrapeItem = (url) => {
  const href = new URL(url).href;
  return { id: `ds-scrape-${recordIdFor(href)}`, kind: "scrape", url: href };
};

/** Curated list, project-page and GitHub plans from phase6-sources.json. */
export function buildInventoryPlans(sources) {
  const plans = {};
  const lists = sources.curatedLists ?? [];
  plans[`${PREFIX}-lists-scrape.json`] = lists
    .filter((l) => l.kind === "scrape")
    .map((l) => scrapeItem(l.url));
  plans[`${PREFIX}-lists-reddit.json`] = lists
    .filter((l) => l.kind === "pipeline" && l.type === "reddit_posts")
    .filter((l) => shape("reddit_posts")(new URL(l.url)))
    .map((l) => ({
      id: `ds-reddit_posts-${recordIdFor(new URL(l.url).href)}`,
      kind: "pipeline",
      type: "reddit_posts",
      url: new URL(l.url).href,
    }));
  const ports = (sources.ports ?? []).filter((p) => p.repo);
  const portGh = buildGithubPlan(ports, GITHUB_LIMITS.ports);
  plans[`${PREFIX}-ports-github.json`] = portGh.items;
  const pages = (sources.ports ?? []).filter((p) => p.page);
  if (pages.length > PORT_PAGE_LIMIT)
    throw new Error(`port pages ${pages.length} > ${PORT_PAGE_LIMIT}`);
  const pagePlan = buildOfficialPlan({
    slots: ["page"],
    competitors: pages.map((p) => ({ id: p.term, pages: { page: p.page } })),
  });
  plans[`${PREFIX}-ports-pages.json`] = pagePlan.items;
  const rust = sources.rust ?? [];
  if (rust.length > RUST_PAGE_LIMIT)
    throw new Error(`rust candidates ${rust.length} > ${RUST_PAGE_LIMIT}`);
  plans[`${PREFIX}-rust-pages.json`] = rust.map((r) =>
    scrapeItem(repoRoot(r.repo)),
  );
  const rustGh = buildGithubPlan(rust, GITHUB_LIMITS.rust);
  plans[`${PREFIX}-rust-github.json`] = rustGh.items;
  return {
    plans,
    manifest: {
      lists: lists.map((l) => ({
        id: l.id,
        recordId: recordIdFor(new URL(l.url).href),
      })),
      portsGithub: portGh.manifest,
      portPages: pagePlan.manifest.map(({ recordId, competitor }) => ({
        recordId,
        project: competitor,
      })),
      rustPages: rust.map((r) => ({
        recordId: recordIdFor(new URL(repoRoot(r.repo)).href),
        project: r.name,
      })),
      rustGithub: rustGh.manifest,
      skipped: (sources.ports ?? [])
        .filter((p) => !p.repo)
        .map(({ term, reason }) => ({ term, reason })),
    },
  };
}

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
};

/** Applies demand-sample quotas. Returns { plans: {name: items[]}, manifest }. */
export function buildDemandSample(community, forum) {
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
      selectedByQuery: countBy(chosen, (c) => c.queryId),
    });
  }
  const forumAll = [...forum.values()];
  const forumChosen = roundRobin(forumAll, FORUM.quota, FORUM.perQuery);
  if (forumChosen.length) {
    plans[`${PREFIX}-forum-scrape.json`] = forumChosen.map((c) =>
      scrapeItem(c.url),
    );
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
    selectedByQuery: countBy(forumChosen, (c) => c.queryId),
  });
  return { plans, manifest };
}

function countBy(items, key) {
  const out = {};
  for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort());
}

/** Thread-shaped open-web candidates from the Disconfirmer's p6-x* queries. */
export function buildExtraSample(envelopes, queries) {
  const asDisconfirm = queries
    .filter((q) => q.group === "disconfirmer")
    .map((q) => ({ ...q, group: "disconfirm" }));
  const candidates = [
    ...collectForumCandidates(envelopes, asDisconfirm).values(),
  ];
  const chosen = roundRobin(candidates, EXTRA.quota, EXTRA.perQuery);
  return {
    items: chosen.map((c) => scrapeItem(c.url)),
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

export function loadPhase6Queries(configDir = CONFIG_DIR) {
  const file = readConfig("phase6-queries.json", configDir);
  if (!Array.isArray(file.queries)) throw new Error("phase6 queries missing");
  return file.queries;
}

export function loadSources(configDir = CONFIG_DIR) {
  const file = readConfig("phase6-sources.json", configDir);
  if (!Array.isArray(file.ports) || !Array.isArray(file.curatedLists))
    throw new Error("phase6 sources malformed");
  return file;
}

const writeJson = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");

function writePlans(outDir, plans) {
  for (const [name, items] of Object.entries(plans).sort()) {
    if (!items.length) continue;
    writeJson(path.join(outDir, name), items);
    process.stdout.write(`${name}: ${items.length}\n`);
  }
}

export function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { phase: { type: "string", default: DEFAULT_PHASE } },
  });
  const mode = positionals[0];
  const raw = rawDir(values.phase);
  const outDir = path.join(raw, "plans");
  fs.mkdirSync(outDir, { recursive: true });
  if (mode === "searches") {
    writePlans(outDir, buildSearchPlans(loadPhase6Queries()));
    return;
  }
  if (mode === "inventory") {
    const { plans, manifest } = buildInventoryPlans(loadSources());
    writePlans(outDir, plans);
    writeJson(path.join(outDir, "inventory-manifest.json"), manifest);
    return;
  }
  if (mode === "extra") {
    const envelopes = readSearchEnvelopes(path.join(raw, "search"));
    const { items, manifest } = buildExtraSample(
      envelopes,
      loadPhase6Queries(),
    );
    writeJson(path.join(outDir, `${PREFIX}-x-forum-scrape.json`), items);
    writeJson(path.join(outDir, "extra-manifest.json"), manifest);
    process.stdout.write(
      `${PREFIX}-x-forum-scrape.json: ${items.length} (candidates ${manifest.candidates})\n`,
    );
    return;
  }
  if (mode !== "learners")
    throw new Error(
      "usage: sample-ports.mjs searches|inventory|learners|extra",
    );
  const queries = loadPhase6Queries();
  const envelopes = readSearchEnvelopes(path.join(raw, "search"));
  const community = collectCommunityCandidates(envelopes, queries);
  const forum = collectForumCandidates(envelopes, queries);
  const { plans, manifest } = buildDemandSample(community, forum);
  writePlans(outDir, plans);
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
