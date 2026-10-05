import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { normalise, pool, summaryRows, verdictFor } from "./pool-verdicts.mjs";

const rec = (i, stance, extra = {}) => ({
  hypothesis: "H10",
  recordId: `r${i}`,
  phase: "04-competitors",
  platform: ["reddit", "youtube", "forum"][i % 3],
  sourceType: i % 2 ? "b" : "c",
  side: "player",
  stance,
  ...extra,
});

describe("normalise", () => {
  test("keeps on-topic stances per phase rule", () => {
    const p2 = normalise("02-public-web", [
      {
        recordId: "a",
        usable: "yes",
        hypothesis: "H10",
        stance: "supports",
        platform: "reddit",
        sourceType: "b",
        segment: "creator",
      },
      { recordId: "b", usable: "yes", hypothesis: "H3", stance: "supports" },
      { recordId: "c", usable: "yes", hypothesis: "H11", stance: "off-topic" },
    ]);
    assert.deepEqual(
      p2.map((r) => `${r.hypothesis}:${r.recordId}:${r.side}`),
      ["H10:a:creator"],
    );
    const p4 = normalise("04-competitors", [
      {
        recordId: "d",
        usable: "yes",
        H10: "contradicts",
        H11: "neutral",
        platform: "reddit",
        segment: "both",
      },
      { recordId: "e", usable: "no", H10: "supports", H11: "supports" },
    ]);
    assert.equal(p4.length, 2);
    const p5 = normalise("05-creator-tools", [
      {
        recordId: "f",
        usable: "yes",
        onTopic: "yes",
        H10: "supports",
        platform: "youtube",
      },
      { recordId: "g", usable: "yes", onTopic: "yes", H10: "n/a" },
    ]);
    assert.deepEqual(
      p5.map((r) => r.side),
      ["creator"],
    );
  });
});

describe("pool", () => {
  test("later phase wins and the clash is listed; disagreeing rows in one phase throw", () => {
    const { records, clashes } = pool({
      "02-public-web": [rec(1, "supports", { phase: "02-public-web" })],
      "10-personas": [rec(1, "contradicts", { phase: "10-personas" })],
    });
    assert.equal(records.length, 1);
    assert.equal(records[0].stance, "contradicts");
    assert.equal(clashes[0].stance, "supports>contradicts");
    assert.throws(() =>
      pool({ "04-competitors": [rec(1, "supports"), rec(1, "contradicts")] }),
    );
  });
});

describe("verdictFor (section 1.2 shares)", () => {
  test("minimum not met -> Unproven with lean", () => {
    const v = verdictFor([rec(1, "supports"), rec(2, "supports")]);
    assert.equal(v.minimumMet, "no");
    assert.equal(v.verdict, "Unproven");
    assert.equal(v.lean, "leans yes");
  });
  test("support >= 60% and contradict < 25% -> Supported (if row test met)", () => {
    const set = Array.from({ length: 20 }, (_, i) =>
      rec(i, i < 13 ? "supports" : i < 17 ? "neutral" : "contradicts"),
    );
    assert.equal(verdictFor(set).verdict, "Supported (if row test met)");
  });
  test("support >= 40% and above contradict -> Partially supported; balanced -> Unproven", () => {
    const part = Array.from({ length: 20 }, (_, i) =>
      rec(i, i < 9 ? "supports" : i < 15 ? "contradicts" : "neutral"),
    );
    assert.equal(verdictFor(part).verdict, "Partially supported");
    const bal = Array.from({ length: 20 }, (_, i) =>
      rec(i, i < 7 ? "supports" : i < 14 ? "contradicts" : "neutral"),
    );
    assert.equal(verdictFor(bal).verdict, "Unproven");
    assert.equal(verdictFor(bal).lean, "balanced");
  });
});

describe("summaryRows", () => {
  test("both counts on each side; without-10 drops Phase 10 records", () => {
    const records = [
      rec(1, "supports", { side: "both" }),
      rec(2, "contradicts", { side: "creator", phase: "10-personas" }),
    ];
    const rows = summaryRows(records);
    const get = (scope) =>
      rows.find((r) => r.hypothesis === "H10" && r.scope === scope);
    assert.equal(get("player/with-10").n, 1);
    assert.equal(get("creator/with-10").n, 2);
    assert.equal(get("creator/without-10").n, 1);
    assert.equal(get("all/with-10").n, 2);
  });
});
