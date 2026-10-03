import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  FORUM,
  QUOTAS,
  REDDIT_CHUNK,
  buildCompetitorSample,
  buildOfficialPlan,
  collectForumCandidates,
  isForumThread,
  loadOfficialPages,
  loadPhase4Queries,
} from "./sample-competitors.mjs";
import { collectCommunityCandidates } from "./sample-audience.mjs";
import { buildCallArgs, validatePlan } from "./bd-run.mjs";
import { recordIdFor } from "./dedupe.mjs";
import { ITEM_ID } from "./fetch-rates.mjs";
import { CONFIG_DIR } from "./lib/paths.mjs";

const queries = [
  {
    id: "a4-c01",
    group: "community",
    platform: "reddit",
    query: "site:reddit.com a",
  },
  {
    id: "a4-c02",
    group: "community",
    platform: "reddit",
    query: "site:reddit.com b",
  },
  {
    id: "a4-y01",
    group: "community",
    platform: "youtube",
    query: "site:youtube.com c",
  },
  {
    id: "a4-y02",
    group: "community",
    platform: "youtube",
    query: "site:youtube.com d",
  },
  { id: "a4-d01", group: "disconfirm", query: "e" },
  { id: "a4-d02", group: "disconfirm", query: "f" },
  { id: "a4-l01", group: "lookup", query: "site:moddb.com terms" },
];
const env = (queryId, links) => ({
  queryId,
  envelope: { data: { organic: links.map((link) => ({ link, title: "t" })) } },
});
const post = (n) => `https://www.reddit.com/r/x/comments/p${n}/title/`;
const video = (n) => `https://www.youtube.com/watch?v=v${n}`;
const thread = (n) => `https://forum.example.com/threads/topic-${n}.${n}/`;

describe("isForumThread", () => {
  const cases = [
    ["https://forum.example.com/threads/a.1/", true],
    ["https://example.com/viewtopic.php?t=5", true],
    ["https://steamcommunity.com/app/1/discussions/0/123/", true],
    ["https://example.com/blog/post", false],
    ["https://www.reddit.com/r/x/comments/a/t/", false],
    ["https://www.youtube.com/watch?v=x", false],
  ];
  for (const [url, want] of cases) {
    test(`${url} -> ${want}`, () => {
      assert.equal(isForumThread(new URL(url)), want);
    });
  }
});

describe("collectForumCandidates", () => {
  test("keeps thread-shaped open-web results of disconfirm queries only", () => {
    // Arrange
    const envelopes = [
      env("a4-d01", [thread(1), "https://example.com/news", post(9)]),
      env("a4-l01", [thread(2)]),
    ];
    // Act
    const out = collectForumCandidates(envelopes, queries);
    // Assert
    assert.deepEqual(
      [...out.values()].map((c) => c.url),
      [thread(1)],
    );
  });
});

describe("buildCompetitorSample", () => {
  const envelopes = [
    env("a4-c01", [1, 2, 3, 4].map(post)),
    env("a4-c02", [5, 6, 7].map(post).concat("https://www.reddit.com/r/x/")),
    env("a4-y01", [1, 2].map(video).concat("https://www.youtube.com/@chan")),
    env("a4-y02", [3].map(video)),
    env("a4-d01", [1, 2, 3].map(thread)),
    env("a4-d02", [4, 5, 6].map(thread)),
  ];
  const { plans, manifest } = buildCompetitorSample(
    collectCommunityCandidates(envelopes, queries),
    collectForumCandidates(envelopes, queries),
  );
  const items = (prefix) =>
    Object.entries(plans)
      .filter(([name]) => name.startsWith(prefix))
      .flatMap(([, list]) => list);

  test("reddit: at most 2 per query, chunks of 4", () => {
    assert.equal(items("a4-reddit-").length, 4);
    for (const [name, list] of Object.entries(plans)) {
      if (name.startsWith("a4-reddit-")) assert.ok(list.length <= REDDIT_CHUNK);
    }
  });

  test("youtube: 1 per query, one video per plan, 12 comments", () => {
    const yt = items("a4-youtube-");
    assert.equal(yt.length, 2);
    assert.ok(plans["a4-youtube-1.json"].length === 1);
    for (const i of yt)
      assert.deepEqual([i.type, i.numComments], ["youtube_comments", 12]);
  });

  test("forum: scrapes at most 2 per query up to the quota", () => {
    const forum = plans["a4-forum-scrape.json"];
    assert.equal(forum.length, 4);
    assert.ok(forum.length <= FORUM.quota);
    assert.ok(forum.every((i) => i.kind === "scrape"));
  });

  test("plans are valid runner plans with fetch-rates item ids", () => {
    for (const list of Object.values(plans)) {
      validatePlan(list);
      for (const item of list) {
        assert.match(item.id, ITEM_ID);
        assert.ok(
          buildCallArgs(item, { timeoutS: 600, unlockerZone: "z" }).includes(
            item.url,
          ),
        );
      }
    }
  });

  test("manifest carries counts only, no URLs", () => {
    assert.doesNotMatch(JSON.stringify(manifest), /https?:/);
    const reddit = manifest.find((m) => m.platform === "reddit");
    assert.deepEqual(
      [reddit.candidates, reddit.eligible, reddit.selected],
      [8, 7, 4],
    );
    assert.deepEqual(
      manifest.map((m) => m.quota),
      [...QUOTAS.map((q) => q.quota), FORUM.quota],
    );
  });
});

describe("buildOfficialPlan", () => {
  const config = {
    slots: ["home", "terms", "premium"],
    competitors: [
      {
        id: "a",
        pages: {
          home: "https://a.example/",
          terms: null,
          premium: "https://a.example/",
        },
      },
      {
        id: "b",
        pages: { home: "https://b.example/", terms: null, premium: null },
      },
    ],
  };

  test("uses config URLs, then resolved lookups; dedupes shared URLs", () => {
    const { items, manifest, missing } = buildOfficialPlan(config, {
      a: { terms: "https://a.example/terms" },
    });
    assert.deepEqual(
      items.map((i) => i.url),
      ["https://a.example/", "https://a.example/terms", "https://b.example/"],
    );
    assert.deepEqual(manifest[0].slots, ["a:home", "a:premium"]);
    assert.equal(manifest[0].recordId, recordIdFor("https://a.example/"));
    assert.deepEqual(missing, [
      { competitor: "b", slot: "terms" },
      { competitor: "b", slot: "premium" },
    ]);
    validatePlan(items);
  });
});

describe("frozen Phase 4 config", () => {
  const frozen = loadPhase4Queries();
  const official = loadOfficialPages();
  const readPlan = (name) =>
    JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, name), "utf8"));

  test("query ids are unique, well-formed and sized as registered", () => {
    const ids = frozen.map((q) => q.id);
    assert.equal(new Set(ids).size, ids.length);
    const count = (re) => ids.filter((id) => re.test(id)).length;
    assert.equal(count(/^a4-c\d{2}$/), 32);
    assert.equal(count(/^a4-y\d{2}$/), 16);
    assert.equal(count(/^a4-d\d{2}$/), 8);
    assert.ok(count(/^a4-x\d{2}$/) <= 6);
    for (const q of frozen.filter((x) => x.group === "community")) {
      assert.match(q.query, new RegExp(`^site:${q.platform}\\.com `));
    }
  });

  test("each competitor with a null slot has exactly one lookup naming those slots", () => {
    const lookups = frozen.filter((q) => q.group === "lookup");
    for (const c of official.competitors) {
      const miss = official.slots.filter((s) => c.pages[s] === null);
      const mine = lookups.filter((q) => q.competitor === c.id);
      assert.equal(mine.length, miss.length ? 1 : 0, c.id);
      if (miss.length) {
        assert.deepEqual(mine[0].slots, miss);
        assert.match(
          mine[0].query,
          new RegExp(`^site:${c.host.replace(".", "\\.")} `),
        );
      }
    }
  });

  test("the starting eight competitors are listed with every slot", () => {
    assert.deepEqual(official.competitors.map((c) => c.id).sort(), [
      "curseforge",
      "gamebanana",
      "itchio",
      "moddb",
      "modio",
      "nexusmods",
      "steamworkshop",
      "thunderstore",
    ]);
    for (const c of official.competitors) {
      assert.deepEqual(Object.keys(c.pages).sort(), [...official.slots].sort());
      assert.ok(c.pages.home, `${c.id} home`);
    }
  });

  test("search plans copy the frozen list verbatim", () => {
    for (const [name, group] of [
      ["phase4-lookups.json", "lookup"],
      ["phase4-community.json", "community"],
      ["phase4-disconfirm.json", "disconfirm"],
      ["phase4-disconfirm-added.json", "disconfirm-added"],
    ]) {
      const plan = validatePlan(readPlan(name));
      const want = frozen.filter((q) => q.group === group);
      assert.deepEqual(
        plan.map((i) => [i.id, i.kind, i.query]),
        want.map((q) => [q.id, "search", q.query]),
      );
    }
  });
});
