import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  EXTRA,
  FORUM,
  GITHUB_FILES,
  QUOTAS,
  buildDemandSample,
  buildExtraSample,
  buildGithubPlan,
  buildInventoryPlans,
  buildSearchPlans,
  loadPhase6Queries,
  loadSources,
  repoRoot,
} from "./sample-ports.mjs";
import { collectCommunityCandidates } from "./sample-audience.mjs";
import { collectForumCandidates } from "./sample-competitors.mjs";
import { buildCallArgs, validatePlan } from "./bd-run.mjs";
import { recordIdFor } from "./dedupe.mjs";
import { ITEM_ID } from "./fetch-rates.mjs";
import { CONFIG_DIR } from "./lib/paths.mjs";

const env = (queryId, links) => ({
  queryId,
  envelope: { data: { organic: links.map((link) => ({ link, title: "t" })) } },
});
const post = (n) => `https://www.reddit.com/r/x/comments/p${n}/title/`;
const video = (n) => `https://www.youtube.com/watch?v=v${n}`;
const thread = (n) => `https://forum.example.com/threads/topic-${n}.${n}/`;

const queries = [
  {
    id: "p6-c01",
    group: "community",
    platform: "reddit",
    query: "site:reddit.com a",
  },
  {
    id: "p6-c02",
    group: "community",
    platform: "reddit",
    query: "site:reddit.com b",
  },
  {
    id: "p6-y01",
    group: "community",
    platform: "youtube",
    query: "site:youtube.com c",
  },
  {
    id: "p6-y02",
    group: "community",
    platform: "youtube",
    query: "site:youtube.com d",
  },
  { id: "p6-d01", group: "disconfirm", query: "e" },
  { id: "p6-i01", group: "inventory", query: "f" },
  {
    id: "p6-n01",
    group: "news",
    searchType: "news",
    collector: "C1",
    query: "g",
  },
  {
    id: "p6-n05",
    group: "news",
    searchType: "news",
    collector: "C2",
    query: "h",
  },
  { id: "p6-r01", group: "rust", query: "i" },
  { id: "p6-x01", group: "disconfirmer", query: "j" },
];

describe("repoRoot", () => {
  test("normalises a repository root", () => {
    assert.equal(
      repoRoot("https://github.com/OpenRCT2/OpenRCT2/"),
      "https://github.com/OpenRCT2/OpenRCT2",
    );
  });
  test("rejects non-GitHub, non-root and release URLs", () => {
    for (const bad of [
      "http://github.com/a/b",
      "https://gitlab.com/a/b",
      "https://github.com/a",
      "https://github.com/a/b/releases/download/v1/game.zip",
    ])
      assert.throws(() => repoRoot(bad));
  });
});

describe("buildGithubPlan", () => {
  test("README by default on HEAD, Cargo.toml on request, deduplicated", () => {
    const { items, manifest } = buildGithubPlan([
      { term: "a", repo: "https://github.com/o/a" },
      { term: "a-again", repo: "https://github.com/o/a/" },
      { name: "b", repo: "https://github.com/o/b", file: "Cargo.toml" },
    ]);
    assert.deepEqual(
      items.map((i) => i.url),
      [
        "https://github.com/o/a/blob/HEAD/README.md",
        "https://github.com/o/b/blob/HEAD/Cargo.toml",
      ],
    );
    validatePlan(items);
    for (const i of items) {
      assert.match(i.id, ITEM_ID);
      assert.equal(i.type, "github_repository_file");
      assert.equal(i.id, `ds-github_repository_file-${recordIdFor(i.url)}`);
      assert.ok(buildCallArgs(i, {}).includes("github_repository_file"));
    }
    assert.deepEqual(
      manifest.map((m) => [m.project, m.file]),
      [
        ["a", "README.md"],
        ["b", "Cargo.toml"],
      ],
    );
  });
  test("refuses files outside the text-file allowlist and bad branches", () => {
    assert.deepEqual(
      [...GITHUB_FILES],
      ["README.md", "readme.md", "Cargo.toml"],
    );
    assert.throws(() =>
      buildGithubPlan([{ repo: "https://github.com/o/a", file: "game.zip" }]),
    );
    assert.throws(() =>
      buildGithubPlan([{ repo: "https://github.com/o/a", branch: "../x" }]),
    );
  });
  test("enforces the item limit", () => {
    const entries = [1, 2, 3].map((n) => ({
      repo: `https://github.com/o/r${n}`,
    }));
    assert.throws(() => buildGithubPlan(entries, 2), /> 2/);
  });
});

describe("buildSearchPlans", () => {
  test("splits searches by spender and keeps the news search type", () => {
    const plans = buildSearchPlans(queries);
    const ids = (name) => plans[name].map((i) => i.id);
    assert.deepEqual(ids("p6-search-c1.json"), ["p6-i01", "p6-n01"]);
    assert.deepEqual(ids("p6-search-c2.json"), ["p6-n05", "p6-r01"]);
    assert.deepEqual(ids("p6-search-community.json"), [
      "p6-c01",
      "p6-c02",
      "p6-y01",
      "p6-y02",
    ]);
    assert.deepEqual(ids("p6-search-disconfirm.json"), ["p6-d01"]);
    assert.deepEqual(ids("p6-search-disconfirmer.json"), ["p6-x01"]);
    const news = plans["p6-search-c1.json"][1];
    assert.equal(news.searchType, "news");
    assert.ok(buildCallArgs(news, { serpZone: "z" }).includes("news"));
    for (const p of Object.values(plans)) validatePlan(p);
  });
});

describe("buildInventoryPlans", () => {
  const sources = {
    curatedLists: [
      { id: "l1", kind: "scrape", url: "https://list.example.com/ports" },
      {
        id: "l2",
        kind: "pipeline",
        type: "reddit_posts",
        url: post(9),
      },
    ],
    ports: [
      {
        term: "a",
        repo: "https://github.com/o/a",
        page: "https://a.example.com/",
      },
      { term: "b", repo: null, reason: "taken down" },
    ],
    rust: [{ name: "r", repo: "https://github.com/o/r" }],
  };
  test("builds every inventory plan with valid ids", () => {
    const { plans, manifest } = buildInventoryPlans(sources);
    assert.equal(plans["p6-lists-scrape.json"].length, 1);
    assert.equal(plans["p6-lists-reddit.json"][0].type, "reddit_posts");
    assert.equal(plans["p6-ports-github.json"].length, 1);
    assert.equal(plans["p6-ports-pages.json"][0].url, "https://a.example.com/");
    assert.equal(plans["p6-rust-pages.json"][0].url, "https://github.com/o/r");
    assert.equal(
      plans["p6-rust-github.json"][0].url,
      "https://github.com/o/r/blob/HEAD/README.md",
    );
    for (const p of Object.values(plans)) {
      validatePlan(p);
      for (const i of p) assert.match(i.id, ITEM_ID);
    }
    assert.deepEqual(manifest.skipped, [{ term: "b", reason: "taken down" }]);
    assert.ok(!JSON.stringify(manifest).includes("https://"));
  });
  test("rejects more than 10 Rust candidates", () => {
    const rust = Array.from({ length: 11 }, (_, n) => ({
      name: `r${n}`,
      repo: `https://github.com/o/r${n}`,
    }));
    assert.throws(() => buildInventoryPlans({ ...sources, rust }));
  });
});

describe("buildDemandSample", () => {
  const envelopes = [
    env("p6-c01", [1, 2, 3].map(post).concat("https://www.reddit.com/r/x/")),
    env("p6-c02", [4, 5].map(post).concat("https://example.com/off-site")),
    env("p6-y01", [1, 2].map(video)),
    env("p6-y02", [3].map(video).concat("https://www.youtube.com/@someone")),
    env("p6-d01", [1, 2, 3].map(thread).concat(post(7))),
  ];
  const community = collectCommunityCandidates(envelopes, queries);
  const forum = collectForumCandidates(envelopes, queries);
  const { plans, manifest } = buildDemandSample(community, forum);

  test("caps per query and drops non-item and off-site URLs", () => {
    const reddit = manifest.find((m) => m.platform === "reddit");
    assert.equal(reddit.eligible, 5);
    assert.equal(reddit.selected, 4); // 2 per query
    const youtube = manifest.find((m) => m.platform === "youtube");
    assert.equal(youtube.selected, 2); // 1 per query
    const f = manifest.find((m) => m.platform === "forum");
    assert.equal(f.selected, 2); // perQuery 2
    assert.equal(f.quota, FORUM.quota);
  });
  test("plans are pipeline/scrape items with fetch-rates ids", () => {
    for (const [name, items] of Object.entries(plans)) {
      validatePlan(items);
      for (const i of items) assert.match(i.id, ITEM_ID, name);
    }
    assert.ok(plans["p6-reddit-1.json"].length <= QUOTAS[0].chunk);
  });
  test("selection does not depend on titles", () => {
    const retitled = envelopes.map((e) => ({
      ...e,
      envelope: {
        data: {
          organic: e.envelope.data.organic.map((r) => ({ ...r, title: "zz" })),
        },
      },
    }));
    const again = buildDemandSample(
      collectCommunityCandidates(retitled, queries),
      collectForumCandidates(retitled, queries),
    );
    assert.deepEqual(again.plans, plans);
  });
});

describe("buildExtraSample", () => {
  test("samples Disconfirmer threads separately, 1 per query", () => {
    const { items, manifest } = buildExtraSample(
      [env("p6-x01", [8, 9].map(thread)), env("p6-d01", [1].map(thread))],
      queries,
    );
    assert.equal(items.length, 1);
    assert.equal(manifest.quota, EXTRA.quota);
  });
});

describe("frozen Phase 6 config", () => {
  test("queries are unique, grouped and community queries are on-site", () => {
    const qs = loadPhase6Queries(CONFIG_DIR);
    assert.equal(new Set(qs.map((q) => q.id)).size, qs.length);
    const count = (g) => qs.filter((q) => q.group === g).length;
    assert.equal(count("inventory"), 12);
    assert.equal(count("rust"), 8);
    assert.equal(count("news"), 6);
    assert.equal(count("disconfirm"), 6);
    const community = qs.filter((q) => q.group === "community");
    assert.equal(community.filter((q) => q.platform === "reddit").length, 14);
    assert.equal(community.filter((q) => q.platform === "youtube").length, 8);
    for (const q of community)
      assert.match(q.query, new RegExp(`^site:${q.platform}\\.com `));
    for (const q of qs.filter((x) => x.group === "news"))
      assert.equal(q.searchType, "news");
    assert.ok(qs.filter((q) => q.group === "disconfirmer").length <= 6);
  });
  test("sources build within limits and name every port-project term", () => {
    const sources = loadSources(CONFIG_DIR);
    assert.equal(sources.ports.length, 19);
    for (const p of sources.ports)
      assert.ok(p.repo || p.reason, `${p.term} needs repo or reason`);
    const { plans } = buildInventoryPlans(sources);
    assert.ok(plans["p6-ports-github.json"].length <= 15);
    assert.equal(plans["p6-lists-scrape.json"].length, 6);
  });
});
