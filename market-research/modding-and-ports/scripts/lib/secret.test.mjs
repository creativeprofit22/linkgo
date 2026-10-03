import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  containsSecret,
  keyBridgeArgs,
  loadApiKey,
  redact,
} from "./secret.mjs";

const KEY = "test-key-123456";

function fakeSpawn({ stdout = "", stderr = "", code = 0, calls = [] } = {}) {
  return (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    setImmediate(() => {
      child.stdout.end(stdout);
      child.stderr.end(stderr);
      setImmediate(() => child.emit("close", code));
    });
    return child;
  };
}

describe("redact", () => {
  test("replaces the key, Bearer key and repeated occurrences", () => {
    const text = `Authorization: Bearer ${KEY}\nkey=${KEY}&again=${KEY}`;
    const out = redact(text, KEY);
    assert.equal(
      out,
      "Authorization: [redacted]\nkey=[redacted]&again=[redacted]",
    );
    assert.equal(containsSecret(out, KEY), false);
  });

  test("is a no-op for empty key and null-safe", () => {
    assert.equal(redact("nothing here", ""), "nothing here");
    assert.equal(redact("nothing here", undefined), "nothing here");
    assert.equal(redact(null, KEY), null);
  });

  test("partial echoes never reconstruct the full key", () => {
    const masked = `${KEY.slice(0, 4)}****${KEY.slice(-4)}`;
    const text = `masked ${masked} prefix ${KEY.slice(0, 8)} full ${KEY}${KEY}`;
    const out = redact(text, KEY);
    assert.equal(containsSecret(out, KEY), false);
    assert.match(out, /\[redacted\]\[redacted\]$/);
  });

  test("containsSecret detects embedded key", () => {
    assert.equal(containsSecret(`x${KEY}y`, KEY), true);
    assert.equal(containsSecret("clean", KEY), false);
    assert.equal(containsSecret("anything", ""), false);
  });
});

describe("loadApiKey", () => {
  test("returns stdout token and spawns powershell without a shell", async () => {
    const calls = [];
    const key = await loadApiKey({
      spawnImpl: fakeSpawn({ stdout: KEY, calls }),
    });
    assert.equal(key, KEY);
    assert.equal(calls[0].command, "powershell.exe");
    assert.deepEqual(calls[0].args.slice(0, 5), keyBridgeArgs().slice(0, 5));
    assert.equal(calls[0].options.shell, false);
    assert.equal(calls[0].options.windowsHide, true);
  });

  test("rejects empty output", async () => {
    await assert.rejects(
      loadApiKey({ spawnImpl: fakeSpawn({ stdout: "" }) }),
      /malformed/,
    );
  });

  test("rejects whitespace in output without echoing it", async () => {
    await assert.rejects(
      loadApiKey({ spawnImpl: fakeSpawn({ stdout: `${KEY} extra` }) }),
      (error) =>
        !error.message.includes(KEY) && /malformed/.test(error.message),
    );
  });

  test("nonzero exit maps to a generic class and never includes stdout", async () => {
    await assert.rejects(
      loadApiKey({
        spawnImpl: fakeSpawn({
          stdout: KEY,
          code: 2,
          stderr: "credential missing",
        }),
      }),
      (error) => error.message === "credential missing (exit 2)",
    );
    await assert.rejects(
      loadApiKey({ spawnImpl: fakeSpawn({ stdout: KEY, code: 3 }) }),
      (error) => error.message === "credential malformed (exit 3)",
    );
    await assert.rejects(
      loadApiKey({ spawnImpl: fakeSpawn({ stdout: KEY, code: 1 }) }),
      (error) => !error.message.includes(KEY) && /exit 1/.test(error.message),
    );
  });
});
