import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { canonicalJson, expandMatrix, sha256 } from "./build-queries.mjs";
import { CONFIG_DIR } from "./lib/paths.mjs";

const matrix = JSON.parse(
  fs.readFileSync(path.join(CONFIG_DIR, "query-matrix.json"), "utf8"),
);

describe("expandMatrix", () => {
  test("expands to 1136 unique queries", () => {
    const list = expandMatrix(matrix);
    assert.equal(list.length, 1136);
    assert.equal(list.filter((q) => q.kind === "matrix").length, 20 * 11 * 5);
    assert.equal(list.filter((q) => q.kind === "disconfirmation").length, 36);
    assert.equal(new Set(list.map((q) => q.id)).size, 1136);
  });

  test("ids and templated text", () => {
    const list = expandMatrix(matrix);
    const first = list[0];
    const p = matrix.platforms[0];
    const t = matrix.themes[0];
    const i = matrix.intents[0];
    assert.equal(first.id, `m-${p.id}-${t.id}-${i.id}`);
    assert.equal(first.query, `site:${p.host} "${t.phrase}" ${i.word}`);
    const d = list.find((q) => q.id === "d-H1-1");
    assert.equal(d.kind, "disconfirmation");
    assert.equal(d.hypothesis, "H1");
    assert.ok(list.every((q) => !q.query.includes("{")));
  });

  test("is deterministic", () => {
    const a = canonicalJson(expandMatrix(matrix));
    const b = canonicalJson(expandMatrix(structuredClone(matrix)));
    assert.equal(sha256(a), sha256(b));
    assert.ok(a.endsWith("}\n]\n"));
  });

  test("rejects duplicate ids", () => {
    const dup = {
      ...matrix,
      disconfirmation: [matrix.disconfirmation[0], matrix.disconfirmation[0]],
    };
    assert.throws(() => expandMatrix(dup), /duplicate/);
  });
});
