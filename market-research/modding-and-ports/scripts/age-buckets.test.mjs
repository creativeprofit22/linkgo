import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  COLUMNS,
  buildAgeSignals,
  bucketOf,
  rowFor,
  totals,
} from "./age-buckets.mjs";
import { toCsv } from "./lib/paths.mjs";

const id = "0123456789abcdef";

describe("bucketOf", () => {
  const cases = [
    [5, "age14orUnder"],
    [14, "age14orUnder"],
    [15, "age15to17"],
    [17, "age15to17"],
    [18, "age18to21"],
    [21, "age18to21"],
    [22, "age22to29"],
    [29, "age22to29"],
    [30, "age30plus"],
    [99, "age30plus"],
  ];
  for (const [age, want] of cases) {
    test(`${age} -> ${want}`, () => assert.equal(bucketOf(age), want));
  }
  for (const bad of [4, 100, 16.5, "16", null, Number.NaN]) {
    test(`rejects ${String(bad)}`, () => assert.throws(() => bucketOf(bad)));
  }
});

describe("rowFor", () => {
  test("counts ages per bucket plus unclear", () => {
    const row = rowFor({
      recordId: id,
      platform: "reddit",
      method: "reddit_posts",
      ages: [13, 16, 16, 25, 40],
      unclear: 2,
    });
    assert.deepEqual(
      [row.age14orUnder, row.age15to17, row.age18to21, row.age22to29],
      [1, 2, 0, 1],
    );
    assert.equal(row.age30plus, 1);
    assert.equal(row.unclear, 2);
    assert.equal(row.total, 7);
  });

  test("rejects bad ids, tokens and counts", () => {
    const ok = { recordId: id, platform: "reddit", method: "reddit_posts" };
    assert.throws(() => rowFor({ ...ok, recordId: "u/someone" }));
    assert.throws(() => rowFor({ ...ok, platform: "Reddit User" }));
    assert.throws(() => rowFor({ ...ok, ages: "16" }));
    assert.throws(() => rowFor({ ...ok, unclear: -1 }));
  });
});

describe("buildAgeSignals", () => {
  test("sorts rows and rejects duplicates", () => {
    const rows = buildAgeSignals([
      {
        recordId: "ffffffffffffffff",
        platform: "tiktok",
        method: "tiktok_comments",
      },
      {
        recordId: id,
        platform: "youtube",
        method: "youtube_comments",
        ages: [20],
      },
    ]);
    assert.deepEqual(
      rows.map((r) => r.recordId),
      [id, "ffffffffffffffff"],
    );
    assert.throws(() =>
      buildAgeSignals([
        { recordId: id, platform: "reddit", method: "reddit_posts" },
        { recordId: id, platform: "reddit", method: "reddit_posts" },
      ]),
    );
  });

  test("CSV holds only ids, tokens and counts", () => {
    const rows = buildAgeSignals([
      {
        recordId: id,
        platform: "reddit",
        method: "reddit_posts",
        ages: [16],
        handle: "should-not-appear",
      },
    ]);
    const csv = toCsv(COLUMNS, rows);
    assert.doesNotMatch(csv, /should-not-appear/);
    assert.equal(csv.split("\n")[1], `${id},reddit,reddit_posts,0,1,0,0,0,0,1`);
    assert.equal(totals(rows).age15to17, 1);
  });
});
