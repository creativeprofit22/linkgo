import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  agoToDays,
  extractRows,
  parseCount,
  parseTagPage,
} from "./extract-disboard.mjs";

const card = (id, count, when, tags, desc) =>
  [
    `[](/server/${id})`,
    "",
    count,
    "",
    when,
    "",
    '*   [Get link](javascript:; "Get Link")',
    `*   [Report this server](/server/report/${id})`,
    "",
    `[Some Name](/server/${id} "Some Name")`,
    "",
    ...tags.map((t) => `*   [${t}](/servers/tag/${t} "${t}")`),
    "",
    desc,
    "",
    `[Join ![](/images/icon-arrow.svg)](/server/join/${id})`,
    "",
  ].join("\n");

const page = [
  "header [ Bumped recently](/servers/tag/modding?sort=-bumped_at)",
  card(
    "111",
    "9",
    "31 minutes ago",
    ["gaming", "boosting"],
    "Boosting lobbies daily.",
  ),
  card(
    "222",
    "12,400",
    "2 months ago",
    ["fivem", "modding"],
    "Map art collective.",
  ),
  card(
    "333",
    "1.2K",
    "a year ago",
    ["community"],
    "We make romhacks together.",
  ),
].join("\n");

describe("helpers", () => {
  test("agoToDays converts relative times", () => {
    assert.equal(agoToDays("31 minutes ago"), 0);
    assert.equal(agoToDays("1 day ago"), 1);
    assert.equal(agoToDays("3 weeks ago"), 21);
    assert.equal(agoToDays("a month ago"), 30);
    assert.equal(agoToDays("2 years ago"), 730);
    assert.equal(agoToDays("just now"), 0);
    assert.equal(agoToDays("yesterday"), null);
  });
  test("parseCount handles separators and suffixes", () => {
    assert.equal(parseCount("1,495"), 1495);
    assert.equal(parseCount("1.2K"), 1200);
    assert.equal(parseCount("3M"), 3_000_000);
    assert.equal(parseCount("abc"), null);
  });
});

describe("parseTagPage", () => {
  const cards = parseTagPage(page);
  test("one card per listing, in page order", () => {
    assert.equal(cards.length, 3);
    assert.deepEqual(
      cards.map((c) => c.listedCount),
      [9, 12400, 1200],
    );
    assert.deepEqual(
      cards.map((c) => c.lastBumpDays),
      [0, 60, 365],
    );
  });
  test("modding flag comes from the card's own tags or description", () => {
    assert.deepEqual(
      cards.map((c) => c.moddingRelated),
      [false, true, true],
    );
  });
  test("no names, ids or links leak into the parsed card", () => {
    const s = JSON.stringify(cards);
    assert.ok(!s.includes("Some Name"));
    assert.ok(!cards.some((c) => Object.values(c).includes("111")));
    assert.ok(!s.includes("/server/"));
    assert.match(cards[0].serverHash, /^[0-9a-f]{16}$/);
  });
});

describe("extractRows", () => {
  test("reads only ok Disboard tag pages and derives active/large", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "disboard-"));
    const write = (name, input, status = "ok") =>
      fs.writeFileSync(
        path.join(dir, name),
        JSON.stringify({
          id: `ds-scrape-${name.slice(0, 16)}`,
          input,
          status,
          data: page,
        }),
      );
    write("aaaaaaaaaaaaaaaa.json", "https://disboard.org/servers/tag/modding");
    write("bbbbbbbbbbbbbbbb.json", "https://disboard.org/server/123456");
    write("cccccccccccccccc.json", "https://example.com/servers/tag/modding");
    write(
      "dddddddddddddddd.json",
      "https://disboard.org/servers/tag/skyrim",
      "blocked",
    );
    const rows = extractRows(dir);
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map((r) => [r.rank, r.active, r.large, r.modding_related]),
      [
        [1, "yes", "no", "no"],
        [2, "no", "yes", "yes"],
        [3, "no", "no", "yes"],
      ],
    );
    assert.ok(
      rows.every(
        (r) => r.tag === "modding" && r.record_id === "aaaaaaaaaaaaaaaa",
      ),
    );
  });
});
