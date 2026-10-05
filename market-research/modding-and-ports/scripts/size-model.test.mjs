import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "./lib/csv.mjs";
import {
  collectParams,
  computeSegment,
  dedupTotals,
  modelRows,
  runModel,
  sensitivityRows,
} from "./size-model.mjs";

const HEADER =
  "inputId,segment,quantity,value,unit,low,base,high,quality,basis\n";

function register(lines) {
  return HEADER + lines.join("\n") + "\n";
}

function segment(seg, values, quality = "B") {
  return Object.entries(values).map(
    ([name, [low, base, high]], i) =>
      `${seg}-${i},${seg},param:${name},,,${low},${base},${high},${quality},obs-1`,
  );
}

const S1 = {
  people: [100, 200, 400],
  payingShare: [0.01, 0.02, 0.04],
  annualSpend: [10, 20, 40],
  reachShare: [0.5, 0.5, 0.5],
  obtainShare: [0.1, 0.1, 0.1],
  overlapShare: [0, 0, 0],
};
const S2 = {
  people: [1000, 1000, 1000],
  payingShare: [0.1, 0.1, 0.1],
  annualSpend: [1, 1, 1],
  reachShare: [1, 1, 1],
  obtainShare: [0.5, 0.5, 0.5],
  overlapShare: [0.5, 0.5, 0.5],
};

describe("computeSegment", () => {
  test("TAM = people x paying x spend; SAM and SOM chain on it", () => {
    assert.deepEqual(
      computeSegment({
        people: 1000,
        payingShare: 0.1,
        annualSpend: 30,
        reachShare: 0.5,
        obtainShare: 0.2,
        overlapShare: 0,
      }),
      { tam: 3000, sam: 1500, som: 300 },
    );
  });
});

describe("collectParams", () => {
  test("ignores observation rows and keeps parameter rows", () => {
    const rows = parseCsv(
      register(["obs-1,S1,members,5,people,,,,A,", ...segment("S1", S1)]),
    );
    const r = collectParams(rows);
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(r.value), ["S1"]);
    assert.equal(r.value.S1.people.base, 200);
  });
  test("rejects grade D as a base, bad order, shares above 1 and gaps", () => {
    const bad = parseCsv(
      register([
        "a,S1,param:people,,,1,2,3,D,x",
        "b,S1,param:payingShare,,,0.5,0.2,0.9,B,x",
        "c,S1,param:reachShare,,,0.5,0.9,1.5,B,x",
      ]),
    );
    const r = collectParams(bad);
    assert.equal(r.ok, false);
    const text = r.error.join("\n");
    assert.match(text, /grade D cannot set a base/);
    assert.match(text, /low <= base <= high/);
    assert.match(text, /between 0 and 1/);
    assert.match(text, /missing parameter annualSpend/);
  });
  test("allows grade X only for reach, obtain and overlap shares", () => {
    const r = collectParams(
      parseCsv(
        register([
          "a,S1,param:annualSpend,,,1,2,3,X,",
          "b,S1,param:obtainShare,,,0.01,0.02,0.03,X,",
        ]),
      ),
    );
    assert.equal(r.ok, false);
    const text = r.error.join("\n");
    assert.match(text, /a \(S1 annualSpend\): grade X/);
    assert.doesNotMatch(text, /b \(S1 obtainShare\)/);
  });
  test("fails when there are no parameters at all", () => {
    const r = collectParams(parseCsv(register(["obs-1,S1,members,5,people,,,,A,"])));
    assert.equal(r.ok, false);
  });
});

describe("totals and sensitivity", () => {
  const params = collectParams(
    parseCsv(register([...segment("S1", S1), ...segment("S2", S2)])),
  ).value;

  test("de-duplicated total subtracts each segment's overlap share", () => {
    // S1 base: 200*0.02*20 = 80 TAM, 40 SAM, 4 SOM. S2: 100, 100, 50; keep half.
    const t = dedupTotals(params, "base");
    assert.equal(t.tam, 80 + 50);
    assert.equal(t.sam, 40 + 50);
    assert.equal(t.som, 4 + 25);
  });

  test("model rows list every segment and case, then raw and dedup totals", () => {
    const rows = modelRows(params);
    assert.deepEqual(
      rows.map((r) => `${r.segment}/${r.case}`),
      [
        "S1/low",
        "S1/base",
        "S1/high",
        "S2/low",
        "S2/base",
        "S2/high",
        "TOTAL-raw/low",
        "TOTAL-dedup/low",
        "TOTAL-raw/base",
        "TOTAL-dedup/base",
        "TOTAL-raw/high",
        "TOTAL-dedup/high",
      ],
    );
    assert.equal(rows.find((r) => r.segment === "TOTAL-raw" && r.case === "base").tam, 180);
  });

  test("sensitivity ranks the widest SOM swing first and is deterministic", () => {
    const rows = sensitivityRows(params);
    assert.equal(rows.length, 12);
    // S1 people 100->400 swings S1 SOM 2->8 (6); spend and paying do the same.
    assert.deepEqual(
      rows.slice(0, 3).map((r) => `${r.segment}.${r.param}`),
      ["S1.annualSpend", "S1.payingShare", "S1.people"],
    );
    assert.equal(rows[0].somSwing, 6);
    assert.equal(rows[0].rank, 1);
    assert.deepEqual(sensitivityRows(params), rows);
  });
});

describe("runModel", () => {
  test("produces CSV text, or the list of register errors", () => {
    const ok = runModel(register([...segment("S1", S1)]));
    assert.equal(ok.ok, true);
    assert.match(ok.value.model, /^segment,case,people,/);
    assert.match(ok.value.sensitivity, /^rank,segment,param,/);
    const bad = runModel(register(["a,S1,param:people,,,1,2,3,D,x"]));
    assert.equal(bad.ok, false);
  });
});
