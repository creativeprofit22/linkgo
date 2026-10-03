import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRunLog } from "./run-log.mjs";

const KEY = "test-key-123456";
const fixedNow = () => new Date("2026-10-02T12:00:05.000Z");

function tempLog() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bd-runlog-"));
  return path.join(dir, "raw", "01-protocol", "run-log.jsonl");
}

const base = {
  id: "m-reddit-mod-install-recommendation",
  phase: "01-protocol",
  kind: "search",
  input: 'site:reddit.com "install mods" recommend',
  args: ["search", "--zone", "serp", "--json", "--", "q"],
  startedAt: "2026-10-02T12:00:00.000Z",
  status: "ok",
  exitCode: 0,
  recordCount: 10,
  requestCount: 1,
  outputPath: "search/x.json",
};

describe("run log", () => {
  test("appends one JSON line with all fields and creates parent dirs", () => {
    const logPath = tempLog();
    const log = createRunLog({ path: logPath, key: KEY, now: fixedNow });
    log.append(base);
    log.append({ ...base, id: "second", status: "empty", recordCount: 0 });
    const lines = fs.readFileSync(logPath, "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    const first = JSON.parse(lines[0]);
    assert.equal(first.endedAt, "2026-10-02T12:00:05.000Z");
    assert.equal(first.durationMs, 5000);
    assert.equal(first.balanceBefore, null);
    assert.equal(first.balanceAfter, null);
    assert.equal(first.spendBefore, null);
    assert.equal(first.errorClass, null);
    assert.deepEqual(Object.keys(first), [
      "id",
      "phase",
      "kind",
      "input",
      "args",
      "startedAt",
      "endedAt",
      "durationMs",
      "status",
      "exitCode",
      "recordCount",
      "requestCount",
      "outputPath",
      "errorClass",
      "balanceBefore",
      "balanceAfter",
      "spendBefore",
    ]);
  });

  test("rejects a line containing the key and writes nothing", () => {
    const logPath = tempLog();
    const log = createRunLog({ path: logPath, key: KEY, now: fixedNow });
    assert.throws(
      () => log.append({ ...base, input: `leak ${KEY}` }),
      /API key/,
    );
    assert.throws(
      () => log.append({ ...base, args: ["search", `--x=${KEY}`] }),
      /API key/,
    );
    assert.equal(fs.existsSync(logPath), false);
  });

  test("validates required fields and enums", () => {
    const log = createRunLog({ path: tempLog(), key: KEY, now: fixedNow });
    assert.throws(() => log.append({ ...base, id: "" }), /id/);
    assert.throws(() => log.append({ ...base, phase: undefined }), /phase/);
    assert.throws(() => log.append({ ...base, kind: "login" }), /kind/);
    assert.throws(() => log.append({ ...base, status: "great" }), /status/);
    assert.throws(
      () => log.append({ ...base, startedAt: "yesterday" }),
      /startedAt/,
    );
    assert.throws(
      () => log.append({ ...base, recordCount: "10" }),
      /recordCount/,
    );
    assert.throws(() => log.append({ ...base, args: [1] }), /args/);
  });
});
