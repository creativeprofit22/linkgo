import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  isOnSite,
  onsiteRule,
  queryResolver,
  siteHostOf,
  splitOnSite,
} from "./onsite.mjs";

const platforms = [
  { id: "reddit", host: "reddit.com" },
  { id: "youtube", host: "youtube.com" },
  { id: "discord", host: "disboard.org" },
  { id: "rustforum", host: "users.rust-lang.org" },
];

describe("siteHostOf", () => {
  const cases = [
    ['site:reddit.com "PC port" recommend', "reddit.com"],
    ['site:WWW.Reddit.com "x"', "reddit.com"],
    ['"mod manager" "easy to use"', null],
    ["", null],
  ];
  for (const [q, expected] of cases) {
    test(JSON.stringify(q), () => assert.equal(siteHostOf(q), expected));
  }
});

describe("onsiteRule", () => {
  test("matrix -> platform, disconfirmation -> none, addition -> host", () => {
    assert.deepEqual(onsiteRule({ kind: "matrix", platform: "reddit" }), {
      mode: "platform",
      platform: "reddit",
    });
    assert.deepEqual(onsiteRule({ kind: "disconfirmation" }, "site:x.com a"), {
      mode: "none",
    });
    assert.deepEqual(onsiteRule(undefined, "site:gbatemp.net a"), {
      mode: "host",
      host: "gbatemp.net",
    });
    assert.deepEqual(onsiteRule(undefined, "plain words"), { mode: "none" });
  });
});

describe("isOnSite", () => {
  const reddit = { mode: "platform", platform: "reddit" };
  const youtube = { mode: "platform", platform: "youtube" };
  const rust = { mode: "platform", platform: "rustforum" };
  const cases = [
    [reddit, "https://www.reddit.com/r/x/comments/1", true],
    [reddit, "https://old.reddit.com/r/x", true],
    [reddit, "https://redditinc.com/blog", false],
    [reddit, "https://example.com/reddit.com", false],
    [youtube, "https://youtu.be/abc", true],
    [youtube, "https://m.youtube.com/watch?v=1", true],
    [rust, "https://users.rust-lang.org/t/x/1", true],
    [rust, "https://www.rust-lang.org/", false],
    [reddit, "not a url", false],
    [{ mode: "none" }, "https://anything.example/", true],
    [{ mode: "host", host: "gbatemp.net" }, "https://gbatemp.net/t/1", true],
    [{ mode: "host", host: "gbatemp.net" }, "https://a.gbatemp.net/", true],
    [{ mode: "host", host: "gbatemp.net" }, "https://notgbatemp.net/", false],
  ];
  for (const [rule, link, expected] of cases) {
    test(`${JSON.stringify(rule)} ${link}`, () =>
      assert.equal(isOnSite(link, rule, platforms), expected));
  }
});

describe("splitOnSite", () => {
  test("splits kept and dropped", () => {
    const { kept, dropped } = splitOnSite(
      [{ link: "https://reddit.com/r/a" }, { link: "https://b.com" }],
      { mode: "platform", platform: "reddit" },
      platforms,
    );
    assert.equal(kept.length, 1);
    assert.equal(dropped.length, 1);
  });
});

describe("queryResolver", () => {
  const queries = [
    {
      id: "m-reddit-pc-port-recommendation",
      query: 'site:reddit.com "PC port" recommend',
    },
  ];
  const resolve = queryResolver(queries);
  test("by id, by text, by pilot prefix", () => {
    assert.equal(resolve("m-reddit-pc-port-recommendation"), queries[0]);
    assert.equal(
      resolve("other", 'site:reddit.com "PC port" recommend'),
      queries[0],
    );
    assert.equal(resolve("s01-m-reddit-pc-port-recommendation"), queries[0]);
    assert.equal(resolve("x-addition-1", "something else"), undefined);
  });
});
