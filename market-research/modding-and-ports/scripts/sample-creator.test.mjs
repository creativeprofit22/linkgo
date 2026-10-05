import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  EXTRA,
  buildExtraSample,
  FORUM,
  QUOTAS,
  REDDIT_CHUNK,
  YOUTUBE_CHUNK,
  buildCreatorSample,
  buildToolPlan,
  loadPhase5Queries,
  loadTools,
} from "./sample-creator.mjs";
import { collectCommunityCandidates } from "./sample-audience.mjs";
import { collectForumCandidates } from "./sample-competitors.mjs";
import { buildCallArgs, validatePlan } from "./bd-run.mjs";
import { recordIdFor } from "./dedupe.mjs";
import { ITEM_ID } from "./fetch-rates.mjs";
import { CONFIG_DIR } from "./lib/paths.mjs";

const queries = [
  {
    id: "a5-c01",
    group: "community",
    platform: "reddit",
    query: "site:reddit.com a",
  },
  {
    id: "a5-c02",
    group: "community",
    platform: "reddit",
    query: "site:reddit.com b",
  },
  {
    id: "a5-y01",
    group: "community",
    platform: "youtube",
    query: "site:youtube.com c",
  },
  {
    id: "a5-y02",
    group: "community",
    platform: "youtube",
    query: "site:youtube.com d",
  },
  {
    id: "a5-y03",
    group: "community",
    platform: "youtube",
    query: "site:youtube.com e",
  },
  { id: "a5-d01", group: "disconfirm", query: "f" },
  { id: "a5-d02", group: "disconfirm", query: "g" },
  { id: "a5-l01", group: "lookup", query: "site:godotengine.org license" },
];
const env = (queryId, links) => ({
  queryId,
  envelope: { data: { organic: links.map((link) => ({ link, title: "t" })) } },
});
const post = (n) => `https://www.reddit.com/r/x/comments/p${n}/title/`;
const video = (n) => `https://www.youtube.com/watch?v=v${n}`;
const thread = (n) => `https://forum.example.com/threads/topic-${n}.${n}/`;

describe("buildCreatorSample", () => {
  const envelopes = [
    env("a5-c01", [1, 2, 3, 4].map(post)),
    env("a5-c02", [5, 6, 7].map(post).concat("https://www.reddit.com/r/x/")),
    env("a5-y01", [1, 2].map(video).concat("https://www.youtube.com/@chan")),
    env("a5-y02", [3].map(video)),
    env("a5-y03", [4, 5].map(video)),
    env("a5-d01", [1, 2, 3].map(thread)),
    env("a5-d02", [4, 5, 6].map(thread).concat(post(8))),
    env("a5-l01", [thread(9)]),
  ];
  const { plans, manifest } = buildCreatorSample(
    collectCommunityCandidates(envelopes, queries),
    collectForumCandidates(envelopes, queries),
  );
  const items = (prefix) =>
    Object.entries(plans)
      .filter(([name]) => name.startsWith(prefix))
      .flatMap(([, list]) => list);

  test("reddit: at most 2 per query, chunks of 4", () => {
    // Arrange / Act: sample built above. Assert
    assert.equal(items("a5-reddit-").length, 4);
    for (const [name, list] of Object.entries(plans)) {
      if (name.startsWith("a5-reddit-")) assert.ok(list.length <= REDDIT_CHUNK);
    }
  });

  test("youtube: youtube_videos, 1 per query, chunks of 2, no comments", () => {
    const yt = items("a5-youtube-");
    assert.equal(yt.length, 3);
    assert.equal(plans["a5-youtube-1.json"].length, YOUTUBE_CHUNK);
    for (const i of yt) {
      assert.equal(i.type, "youtube_videos");
      assert.equal(i.numComments, undefined);
    }
  });

  test("forum: disconfirm results only, thread-shaped, at most 2 per query", () => {
    const forum = plans["a5-forum-scrape.json"];
    assert.equal(forum.length, 4);
    assert.ok(forum.length <= FORUM.quota);
    assert.ok(forum.every((i) => i.kind === "scrape"));
    assert.ok(!forum.some((i) => i.url === thread(9)));
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

describe("buildExtraSample", () => {
  test("only Disconfirmer queries, 1 per query, thread-shaped, frozen sample untouched", () => {
    // Arrange
    const qs = [
      ...queries,
      { id: "a5-x01", group: "disconfirmer", query: "h" },
      { id: "a5-x02", group: "disconfirmer", query: "i" },
    ];
    const envelopes = [
      env("a5-d01", [thread(1)]),
      env("a5-x01", [thread(2), thread(3), post(9)]),
      env("a5-x02", [thread(4), "https://forum.example.com/"]),
    ];
    // Act
    const { items, manifest } = buildExtraSample(envelopes, qs);
    const frozenForum = collectForumCandidates(envelopes, qs);
    // Assert
    assert.equal(items.length, 2);
    assert.ok(items.every((i) => i.kind === "scrape" && i.url !== thread(1)));
    assert.ok(items.length <= EXTRA.quota);
    assert.deepEqual([...frozenForum.keys()], [recordIdFor(thread(1))]);
    assert.doesNotMatch(JSON.stringify(manifest), /https?:/);
    validatePlan(items);
  });
});

describe("buildToolPlan", () => {
  const config = {
    slots: ["docs", "pricing"],
    tools: [
      {
        id: "a",
        pages: { docs: "https://a.example/learn", pricing: null },
      },
      {
        id: "b",
        pages: { docs: "https://b.example/", pricing: "https://b.example/" },
      },
      { id: "c", pages: { docs: null, pricing: null } },
    ],
  };

  test("resolved lookups fill nulls and replace failed config URLs; shared URLs scraped once", () => {
    // Arrange
    const resolved = {
      a: { pricing: "https://a.example/license" },
      b: { docs: "https://b.example/start" },
    };
    // Act
    const { items, manifest, missing } = buildToolPlan(config, resolved);
    // Assert
    assert.deepEqual(
      items.map((i) => i.url),
      [
        "https://a.example/learn",
        "https://a.example/license",
        "https://b.example/start",
        "https://b.example/",
      ],
    );
    assert.deepEqual(manifest[3], {
      recordId: recordIdFor("https://b.example/"),
      tool: "b",
      slots: ["b:pricing"],
    });
    assert.deepEqual(missing, [
      { tool: "c", slot: "docs" },
      { tool: "c", slot: "pricing" },
    ]);
    validatePlan(items);
  });
});

describe("frozen Phase 5 config", () => {
  const frozen = loadPhase5Queries();
  const tools = loadTools();
  const readPlan = (name) =>
    JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, name), "utf8"));

  test("query ids are unique, well-formed and sized as registered", () => {
    const ids = frozen.map((q) => q.id);
    assert.equal(new Set(ids).size, ids.length);
    const count = (re) => ids.filter((id) => re.test(id)).length;
    assert.ok(count(/^a5-l\d{2}$/) >= 15 && count(/^a5-l\d{2}$/) <= 17);
    assert.equal(count(/^a5-c\d{2}$/), 16);
    assert.equal(count(/^a5-y\d{2}$/), 8);
    assert.equal(count(/^a5-d\d{2}$/), 8);
    assert.ok(count(/^a5-x\d{2}$/) <= 6);
    for (const q of frozen.filter((x) => x.group === "community")) {
      assert.match(q.query, new RegExp(`^site:${q.platform}\\.com `));
      assert.ok(["help-seeking", "showcase", "neutral"].includes(q.direction));
    }
  });

  test("community queries are balanced: help-seeking does not outnumber showcase + neutral", () => {
    const reddit = frozen.filter((q) => q.id.startsWith("a5-c"));
    const help = reddit.filter((q) => q.direction === "help-seeking").length;
    assert.ok(help <= reddit.length - help, `${help} of ${reddit.length}`);
  });

  test("every tool has exactly one site: lookup on its host", () => {
    const lookups = frozen.filter((q) => q.group === "lookup");
    for (const t of tools.tools) {
      const mine = lookups.filter((q) => q.tool === t.id);
      assert.equal(mine.length, 1, t.id);
      assert.ok(
        mine[0].query.startsWith(`site:${t.host} `),
        `${t.id}: ${mine[0].query}`,
      );
    }
  });

  test("the starting fourteen tools are listed with every slot", () => {
    const starting = tools.tools.filter((t) => t.category !== "ai-assisted");
    assert.deepEqual(starting.map((t) => t.id).sort(), [
      "bepinex",
      "blockbench",
      "construct",
      "creationkit",
      "fabric-forge",
      "gamemaker",
      "gdevelop",
      "godot",
      "melonloader",
      "roblox",
      "rpgmaker",
      "tmodloader",
      "unity",
      "unreal",
    ]);
    assert.ok(tools.tools.length <= 16);
    for (const t of tools.tools) {
      assert.deepEqual(Object.keys(t.pages).sort(), [...tools.slots].sort());
    }
  });

  test("search plans copy the frozen list verbatim", () => {
    for (const [name, groups] of [
      ["phase5-lookups.json", ["lookup"]],
      ["phase5-community.json", ["community"]],
      ["phase5-disconfirm.json", ["disconfirm"]],
      ["phase5-disconfirmer.json", ["disconfirmer"]],
    ]) {
      const plan = validatePlan(readPlan(name));
      const want = frozen.filter(
        (q) => groups.includes(q.group) && plan.some((i) => i.id === q.id),
      );
      assert.deepEqual(
        plan.map((i) => [i.id, i.kind, i.query]),
        want.map((q) => [q.id, "search", q.query]),
      );
      for (const i of plan)
        assert.ok(
          frozen.some((q) => q.id === i.id && groups.includes(q.group)),
        );
    }
  });
});
