import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  EXTRA,
  FORUM,
  QUOTAS,
  buildDirectoryPlan,
  buildExtraSample,
  buildSample,
  buildSearchPlans,
  collectThreadCandidates,
  loadPhase8,
} from "./sample-community.mjs";
import { collectCommunityCandidates } from "./sample-audience.mjs";
import { buildCallArgs, validatePlan } from "./bd-run.mjs";
import { recordIdFor } from "./dedupe.mjs";
import { ITEM_ID } from "./fetch-rates.mjs";

const env = (queryId, links) => ({
  queryId,
  envelope: { data: { organic: links.map((link) => ({ link, title: "t" })) } },
});
const post = (n) => `https://www.reddit.com/r/x/comments/p${n}/title/`;
const video = (n) => `https://www.youtube.com/watch?v=v${n}`;
const tok = (n) => `https://www.tiktok.com/@[h]/video/${7000 + n}`;
const xpost = (n) => `https://x.com/h/status/${9000 + n}`;
const thread = (n) => `https://forum.example.com/threads/topic-${n}.${n}/`;

const queries = [
  {
    id: "p8-g01",
    group: "community",
    platform: "reddit",
    query: "site:reddit.com a",
  },
  {
    id: "p8-g02",
    group: "community",
    platform: "reddit",
    query: "site:reddit.com b",
  },
  {
    id: "p8-g09",
    group: "community",
    platform: "youtube",
    query: "site:youtube.com c",
  },
  {
    id: "p8-g13",
    group: "community",
    platform: "tiktok",
    query: "site:tiktok.com d",
  },
  { id: "p8-g17", group: "community", platform: "x", query: "site:x.com e" },
  { id: "p8-g21", group: "community", platform: "web", query: "f forum" },
  { id: "p8-s01", group: "directory", query: "site:disboard.org g" },
  { id: "p8-d01", group: "disconfirm", query: "h" },
  { id: "p8-x01", group: "disconfirmer", query: "i" },
];

describe("buildSearchPlans", () => {
  test("main batch holds community, directory and disconfirm queries", () => {
    const plans = buildSearchPlans(queries);
    assert.equal(plans["p8-search-main.json"].length, 8);
    assert.deepEqual(
      plans["p8-search-disconfirmer.json"].map((i) => i.id),
      ["p8-x01"],
    );
    for (const p of Object.values(plans)) validatePlan(p);
    assert.ok(
      buildCallArgs(plans["p8-search-main.json"][0], { serpZone: "z" }).length >
        0,
    );
  });
});

describe("buildDirectoryPlan", () => {
  const base = {
    disboard: [
      { tag: "modding", url: "https://disboard.org/servers/tag/modding" },
    ],
    otherDirectoryDomains: ["top.gg"],
  };
  test("plans tag pages with valid ids and URL-free manifest", () => {
    const { items, manifest } = buildDirectoryPlan(base);
    assert.equal(items.length, 1);
    assert.match(items[0].id, ITEM_ID);
    assert.equal(items[0].id, `ds-scrape-${recordIdFor(items[0].url)}`);
    assert.ok(!JSON.stringify(manifest).includes("https://"));
    validatePlan(items);
  });
  test("rejects server pages, invites, other domains and unlogged additions", () => {
    for (const added of [
      [{ url: "https://disboard.org/server/123456", foundBy: "p8-s01" }],
      [{ url: "https://disboard.org/server/join/123456", foundBy: "p8-s01" }],
      [
        {
          url: "https://evil.example.com/servers/tag/modding",
          foundBy: "p8-s01",
        },
      ],
      [{ url: "https://top.gg/servers/tag/modding" }],
    ])
      assert.throws(() => buildDirectoryPlan({ ...base, added }));
    const ok = buildDirectoryPlan({
      ...base,
      added: [{ url: "https://top.gg/servers/tag/modding", foundBy: "p8-s03" }],
    });
    assert.equal(ok.items.length, 2);
  });
  test("caps additions at 4", () => {
    const added = [1, 2, 3, 4, 5].map((n) => ({
      url: `https://top.gg/servers/tag/t${n}`,
      foundBy: "p8-s03",
    }));
    assert.throws(() => buildDirectoryPlan({ ...base, added }));
  });
});

describe("buildSample", () => {
  const envelopes = [
    env("p8-g01", [1, 2, 3].map(post).concat("https://www.reddit.com/r/x/")),
    env("p8-g02", [4, 5].map(post)),
    env("p8-g09", [1, 2, 3].map(video)),
    env("p8-g13", [1, 2].map(tok).concat("https://www.tiktok.com/tag/modding")),
    env("p8-g17", [1].map(xpost)),
    env("p8-g21", [thread(1), thread(2), thread(3), post(9)]),
    env("p8-d01", [thread(4)]),
  ];
  const community = collectCommunityCandidates(envelopes, queries);
  const forum = collectThreadCandidates(envelopes, queries);
  const { plans, manifest } = buildSample(community, forum);
  const m = (p) => manifest.find((x) => x.platform === p);

  test("per-query cap, URL shapes and forum sources", () => {
    assert.equal(m("reddit").eligible, 5);
    assert.equal(m("reddit").selected, 4);
    assert.equal(m("youtube").selected, 2);
    assert.equal(m("tiktok").eligible, 2);
    assert.equal(m("x").selected, 1);
    assert.equal(m("forum").selected, 3); // 2 from p8-g21, 1 from p8-d01
    assert.equal(m("forum").quota, FORUM.quota);
  });
  test("plans are valid with fetch-rates ids", () => {
    for (const [name, items] of Object.entries(plans)) {
      validatePlan(items);
      for (const i of items) assert.match(i.id, ITEM_ID, name);
    }
    assert.equal(QUOTAS.length, 4);
  });
  test("selection ignores titles", () => {
    const retitled = envelopes.map((e) => ({
      ...e,
      envelope: {
        data: {
          organic: e.envelope.data.organic.map((r) => ({ ...r, title: "zz" })),
        },
      },
    }));
    const again = buildSample(
      collectCommunityCandidates(retitled, queries),
      collectThreadCandidates(retitled, queries),
    );
    assert.deepEqual(
      again.manifest.map((x) => x.recordIds),
      manifest.map((x) => x.recordIds),
    );
  });
});

describe("buildExtraSample", () => {
  test("at most 1 thread per Disconfirmer query", () => {
    const { items } = buildExtraSample(
      [env("p8-x01", [thread(7), thread(8)]), env("p8-d01", [thread(9)])],
      queries,
    );
    assert.equal(items.length, 1);
    assert.ok(items.length <= EXTRA.quota);
  });
});

describe("frozen Phase 8 config", () => {
  test("ids are unique and well-formed; platform counts match the addendum", () => {
    const { queries: q, directories } = loadPhase8();
    assert.equal(new Set(q.map((x) => x.id)).size, q.length);
    for (const x of q) assert.match(x.id, /^p8-[gsdx]\d{2}$/);
    const n = (p) =>
      q.filter((x) => x.group === "community" && x.platform === p).length;
    assert.deepEqual(
      [n("reddit"), n("youtube"), n("tiktok"), n("x"), n("web")],
      [8, 4, 4, 4, 4],
    );
    assert.equal(q.filter((x) => x.group === "disconfirm").length, 6);
    assert.equal(directories.disboard.length, 10);
    assert.ok(directories.disboard.every((d) => !new URL(d.url).search));
    validatePlan(buildDirectoryPlan(directories).items);
  });
});
