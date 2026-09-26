import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const config = JSON.parse(
  fs.readFileSync(
    new URL("../src-tauri/tauri.conf.json", import.meta.url),
    "utf8",
  ),
);
const security = config.app.security;

/** Parses a CSP string into a Map of directive -> source list. */
function parseCsp(csp) {
  const directives = new Map();
  for (const part of csp.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) directives.set(name, sources);
  }
  return directives;
}

const DEV_ONLY_CONNECT = new Set([
  "ws://localhost:1420",
  "ws://localhost:1421",
  "http://localhost:1420",
]);

for (const key of ["csp", "devCsp"]) {
  test(`${key}: connect-src is limited to the app and IPC origins`, () => {
    assert.equal(typeof security[key], "string", `${key} must be set`);
    const connect = parseCsp(security[key]).get("connect-src");
    assert.ok(connect, "connect-src must be explicit");
    for (const source of connect) {
      assert.ok(
        !/^(https?|wss?):?$/.test(source) && !source.includes("*"),
        `${key} connect-src must not allow scheme-wide or wildcard source ${source}`,
      );
    }
    const allowed = new Set(["'self'", "ipc:", "http://ipc.localhost"]);
    for (const source of connect) {
      assert.ok(
        allowed.has(source) ||
          (key === "devCsp" && DEV_ONLY_CONNECT.has(source)),
        `${key} connect-src has unexpected source ${source}`,
      );
    }
  });

  test(`${key}: blocks plugins, framing, base rewriting and form posts`, () => {
    const csp = parseCsp(security[key]);
    assert.deepEqual(csp.get("object-src"), ["'none'"]);
    assert.deepEqual(csp.get("frame-ancestors"), ["'none'"]);
    assert.deepEqual(csp.get("form-action"), ["'none'"]);
    assert.deepEqual(csp.get("base-uri"), ["'self'"]);
    assert.deepEqual(csp.get("script-src"), ["'self'"]);
    assert.ok(
      !csp
        .get("default-src")
        ?.some((source) => /^(https?|wss?):$/.test(source)),
      "default-src must not allow whole schemes",
    );
  });
}

test("production CSP carries no dev-server origins", () => {
  for (const source of DEV_ONLY_CONNECT) {
    assert.ok(!security.csp.includes(source), `csp must not include ${source}`);
  }
});

test("renderer webview creation and remote URLs are not configured", () => {
  assert.equal(security.dangerousDisableAssetCspModification, undefined);
  for (const window of config.app.windows) {
    assert.equal(window.url ?? "index.html", "index.html");
  }
});
