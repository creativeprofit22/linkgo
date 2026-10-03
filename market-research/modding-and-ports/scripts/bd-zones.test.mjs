import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  REQUIRED_ZONES,
  classifyCreate,
  missingZones,
  stripZoneSecrets,
} from "./bd-zones.mjs";

describe("bd-zones", () => {
  test("required zones mirror the CLI and SDK payloads", () => {
    const byName = Object.fromEntries(REQUIRED_ZONES.map((z) => [z.name, z]));
    assert.deepEqual(byName.cli_unlocker.body, {
      zone: { name: "cli_unlocker", type: "unblocker" },
      plan: { type: "unblocker" },
    });
    assert.equal(byName.cli_serp.body.plan.serp, true);
  });

  test("missingZones compares by name", () => {
    assert.deepEqual(
      missingZones([{ name: "cli_unlocker" }]).map((z) => z.name),
      ["cli_serp"],
    );
    assert.equal(missingZones(null).length, REQUIRED_ZONES.length);
  });

  test("classifyCreate treats 409 as already existing and 403 as blocked", () => {
    assert.equal(classifyCreate(200), "ok");
    assert.equal(classifyCreate(409), "ok");
    assert.equal(classifyCreate(403), "blocked");
    assert.equal(classifyCreate(500), "http_error");
  });

  test("stripZoneSecrets removes proxy passwords from objects and text", () => {
    const res = {
      zone: { password: ["abc123secret"], ips: "any" },
      nested: [{ passwords: "x" }],
    };
    const out = JSON.stringify(stripZoneSecrets(res));
    assert.ok(!out.includes("abc123secret"));
    assert.ok(!out.includes('"x"'));
    assert.ok(out.includes('"ips":"any"'));
    const text = stripZoneSecrets('{"password":["abc123secret"],"a":1}');
    assert.ok(!text.includes("abc123secret"));
  });
});
