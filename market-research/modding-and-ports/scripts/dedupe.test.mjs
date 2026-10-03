import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  anonymiseHost,
  anonymisePath,
  buildSourceIndex,
  normaliseUrl,
  platformForHost,
  recordIdFor,
} from "./dedupe.mjs";
import { CONFIG_DIR } from "./lib/paths.mjs";

const { platforms } = JSON.parse(
  fs.readFileSync(path.join(CONFIG_DIR, "query-matrix.json"), "utf8"),
);

describe("normaliseUrl", () => {
  const cases = [
    [
      "https://WWW.Reddit.com/r/skyrimmods/comments/abc/x/",
      "https://reddit.com/r/skyrimmods/comments/abc/x",
    ],
    ["https://example.com/a#section", "https://example.com/a"],
    [
      "https://example.com/a?utm_source=x&b=2&UTM_medium=y&a=1&fbclid=1&gclid=2&si=3&feature=share",
      "https://example.com/a?a=1&b=2",
    ],
    [
      "https://www.youtube.com/watch?v=abc&feature=youtu.be",
      "https://youtube.com/watch?v=abc",
    ],
    ["https://example.com/", "https://example.com"],
    [
      "https://example.com/path?z=1&a=2&a=1",
      "https://example.com/path?a=1&a=2&z=1",
    ],
  ];
  for (const [input, expected] of cases) {
    test(input, () => assert.equal(normaliseUrl(input), expected));
  }

  test("record id is 16 hex and stable across tracking noise", () => {
    const a = recordIdFor("https://www.reddit.com/r/x/?utm_source=a#top");
    const b = recordIdFor("https://reddit.com/r/x");
    assert.match(a, /^[0-9a-f]{16}$/);
    assert.equal(a, b);
  });
});

describe("anonymisePath", () => {
  const cases = [
    ["reddit.com", "/u/someone", "/u/[handle]"],
    ["reddit.com", "/user/someone/comments", "/user/[handle]/comments"],
    [
      "reddit.com",
      "/r/skyrimmods/comments/abc/title",
      "/r/skyrimmods/comments/abc/title",
    ],
    ["youtube.com", "/@creator/videos", "/@[handle]/videos"],
    ["youtube.com", "/c/creator", "/c/[handle]"],
    ["youtube.com", "/channel/UC123", "/channel/[handle]"],
    ["youtube.com", "/user/creator", "/user/[handle]"],
    ["youtube.com", "/watch", "/watch"],
    ["tiktok.com", "/@creator/video/123", "/@[handle]/video/123"],
    ["x.com", "/someone/status/123", "/[handle]/status/123"],
    ["twitter.com", "/someone/status/123", "/[handle]/status/123"],
    ["x.com", "/search", "/search"],
    ["twitch.tv", "/streamer", "/[handle]"],
    ["twitch.tv", "/directory/game", "/directory/game"],
    ["github.com", "/owner/repo/issues/1", "/[handle]/repo/issues/1"],
    ["github.com", "/topics/modding", "/topics/modding"],
    ["github.com", "/orgs/someorg/repos", "/orgs/[handle]/repos"],
    [
      "steamcommunity.com",
      "/id/someone/myworkshopfiles",
      "/id/[handle]/myworkshopfiles",
    ],
    ["steamcommunity.com", "/profiles/7656/", "/profiles/[handle]"],
    ["nexusmods.com", "/skyrim/mods/123", "/skyrim/mods/123"],
    ["nexusmods.com", "/users/42", "/users/[handle]"],
    ["fandom.com", "/wiki/User:Someone", "/wiki/User:[handle]"],
  ];
  for (const [host, input, expected] of cases) {
    test(`${host}${input}`, () =>
      assert.equal(anonymisePath(host, input), expected));
  }

  test("creator subdomains are anonymised", () => {
    assert.equal(anonymiseHost("someone.itch.io"), "[handle].itch.io");
    assert.equal(anonymiseHost("www.itch.io"), "itch.io");
  });
});

describe("platformForHost", () => {
  test("maps matrix hosts, subdomains and aliases", () => {
    assert.equal(platformForHost("www.reddit.com", platforms), "reddit");
    assert.equal(platformForHost("old.reddit.com", platforms), "reddit");
    assert.equal(platformForHost("twitter.com", platforms), "x");
    assert.equal(platformForHost("someone.itch.io", platforms), "itchio");
    assert.equal(platformForHost("mod.io", platforms), "modio");
    assert.equal(
      platformForHost("news.ycombinator.com", platforms),
      "hackernews",
    );
    assert.equal(
      platformForHost("users.rust-lang.org", platforms),
      "rustforum",
    );
    assert.equal(platformForHost("example.org", platforms), "other");
  });
});

describe("buildSourceIndex", () => {
  test("dedupes across queries and keeps no full URL", () => {
    const envelopes = [
      {
        queryId: "q2",
        fetchedAt: "2026-10-02T12:00:00.000Z",
        envelope: {
          data: {
            organic: [{ link: "https://www.reddit.com/u/alice/?utm_source=x" }],
          },
        },
      },
      {
        queryId: "q1",
        fetchedAt: "2026-10-01T12:00:00.000Z",
        envelope: {
          data: {
            organic: [
              { link: "https://reddit.com/u/alice" },
              { link: "not a url" },
            ],
          },
        },
      },
    ];
    const rows = buildSourceIndex(envelopes, platforms);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      recordId: recordIdFor("https://reddit.com/u/alice"),
      host: "reddit.com",
      platform: "reddit",
      firstSeen: "2026-10-01T12:00:00.000Z",
      queryIds: "q1;q2",
      anonymisedPath: "/u/[handle]",
    });
    assert.equal(JSON.stringify(rows).includes("alice"), false);
  });

  test("drops off-site results of matrix queries only (protocol 5.3)", () => {
    const queries = [
      {
        id: "m-reddit-t-i",
        kind: "matrix",
        platform: "reddit",
        query: "site:reddit.com a",
      },
      { id: "d-H1-1", kind: "disconfirmation", query: "b" },
    ];
    const envelopes = [
      {
        queryId: "m-reddit-t-i",
        envelope: {
          input: "site:reddit.com a",
          data: {
            organic: [
              { link: "https://www.reddit.com/r/x/comments/1" },
              { link: "https://example.com/off" },
              { link: "https://redditinc.com/blog" },
            ],
          },
        },
      },
      {
        queryId: "d-H1-1",
        envelope: {
          input: "b",
          data: { organic: [{ link: "https://example.org/kept" }] },
        },
      },
    ];
    const stats = {};
    const rows = buildSourceIndex(envelopes, platforms, queries, stats);
    assert.deepEqual(rows.map((r) => r.platform).sort(), ["other", "reddit"]);
    assert.equal(stats.offsiteDropped, 2);
    const unfiltered = buildSourceIndex(envelopes, platforms);
    assert.equal(unfiltered.length, 4);
  });
});
