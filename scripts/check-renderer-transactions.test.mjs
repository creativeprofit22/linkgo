import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  createSignatures,
  evaluateSignatures,
  scanRendererTransactions,
  scanSourceText,
  scanSqlAccess,
} from "./check-renderer-transactions.mjs";

const fixturePath = "src/features/example/data.ts";

function scan(sourceText) {
  const result = scanSourceText(fixturePath, sourceText);
  return { ...result, signatures: createSignatures(result.sites) };
}

test("covers transaction commands in dot/bracket calls and static literals/templates", () => {
  const result = scan(`
    async function transact(db, database) {
      await db.execute(" begin   immediate; ");
      await database['execute']('COMMIT');
      await db[\`execute\`](\`rollback\`);
    }
  `);

  assert.deepEqual(result.errors, []);
  assert.equal(result.signatures.length, 3);
  assert.match(result.signatures[0], / :: BEGIN :: 930a777039908789$/);
  assert.match(result.signatures[1], / :: COMMIT :: 79663c1d3b43ceaf$/);
  assert.match(result.signatures[2], / :: ROLLBACK :: 587fa628a9fe4642$/);
});

test("rejects interpolated and concatenated transaction SQL", () => {
  const result = scan(`async function save(db, mode) {
    await db.execute(\`BEGIN \${mode}\`);
    await db.execute("ROLLBACK " + mode);
  }`);

  assert.equal(result.sites.length, 0);
  assert.deepEqual(result.errors, [
    `${fixturePath}:2 uses dynamic BEGIN SQL in database.execute()`,
    `${fixturePath}:3 uses dynamic ROLLBACK SQL in database.execute()`,
  ]);
});

test("normalized hashes survive formatting and source-order changes", () => {
  const left = scan(`async function save(db) {
    await db.execute("begin immediate");
    await db.execute("COMMIT");
  }`).signatures;
  const right = scan(`async function save(db) {
    await db.execute(\` commit; \`);
    await db.execute(' BEGIN   IMMEDIATE; ');
  }`).signatures;

  assert.deepEqual(left, right);
});

test("any transaction site fails the zero-tolerance evaluation", () => {
  const one = scan(
    'async function save(db) { await db.execute("COMMIT"); }',
  ).signatures;

  assert.deepEqual(evaluateSignatures([]), {
    ok: true,
    unexpected: [],
    errors: [],
  });
  assert.deepEqual(evaluateSignatures(one), {
    ok: false,
    unexpected: one,
    errors: [],
  });
});

test("flags every transaction-control statement, including savepoints", () => {
  const result = scan(`async function save(db) {
    await db.execute("BEGIN");
    await db.execute("COMMIT");
    await db.execute("ROLLBACK");
    await db.execute("SAVEPOINT sp1");
    await db.execute("RELEASE sp1");
  }`);

  assert.deepEqual(
    result.sites.map((site) => site.command),
    ["BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT", "RELEASE"],
  );
  assert.equal(evaluateSignatures(result.signatures).ok, false);
});

test("ignores non-database execute methods and non-transaction SQL", () => {
  const result = scan(`
    tool.execute("BEGIN");
    db.execute("SELECT 'BEGIN'");
    db.execute("BEGINNER");
    db.executemany("COMMIT");
  `);

  assert.deepEqual(result, { sites: [], errors: [], signatures: [] });
});

test("flags every form of renderer SQL access", () => {
  const findings = scanSqlAccess(
    fixturePath,
    [
      'import Database from "@tauri-apps/plugin-sql";',
      "const helper = await import('@/lib/db');",
      'await invoke("plugin:sql|select", {});',
      'await invoke("linkgo_candidate_list", {});',
      "// sqlite docs mention plugin-sql without quotes",
    ].join("\n"),
  );
  assert.deepEqual(findings, [
    `${fixturePath}:1 renderer SQL access (@tauri-apps/plugin-sql import)`,
    `${fixturePath}:2 renderer SQL access (@/lib/db import)`,
    `${fixturePath}:3 renderer SQL access (plugin:sql command)`,
  ]);
});

test("SQL access findings fail the evaluation", () => {
  const errors = scanSqlAccess(fixturePath, 'invoke("plugin:sql|execute")');
  assert.equal(evaluateSignatures([], errors).ok, false);
});

async function checkReleaseGate(root, expectedStatus = 0) {
  const env = { ...process.env, SKIP_RELEASE_GATE_TEST: "1" };
  // Launch an independent test runner; our explicit guard prevents recursion.
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync("bun", ["run", "check:renderer-transactions"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    env,
  });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.ifError(result.error);
  assert.equal(result.status, expectedStatus, output);
  assert.match(output, /covers transaction commands in dot\/bracket calls/);
  const { signatures } = await scanRendererTransactions(root);
  assert.ok(
    output
      .split(/\r?\n/)
      .includes(`Renderer transaction sites: ${signatures.length} current.`),
    output,
  );
  return output;
}

test(
  "the release check executes focused tests and the repository scan",
  { skip: process.env.SKIP_RELEASE_GATE_TEST === "1" },
  () => checkReleaseGate(path.resolve(import.meta.dirname, "..")),
);

test(
  "fixture release gates reject every renderer transaction",
  { skip: process.env.SKIP_RELEASE_GATE_TEST === "1" },
  async (t) => {
    const root = path.resolve(import.meta.dirname, "..");
    // Copied scripts resolve the repository's installed dependencies.
    const fixtureRoot = await fs.mkdtemp(path.join(root, ".renderer-gate-"));
    t.after(() => fs.rm(fixtureRoot, { recursive: true, force: true }));
    await fs.mkdir(path.join(fixtureRoot, "scripts"));
    await fs.mkdir(path.dirname(path.join(fixtureRoot, fixturePath)), {
      recursive: true,
    });
    await fs.copyFile(
      path.join(root, "package.json"),
      path.join(fixtureRoot, "package.json"),
    );
    for (const name of [
      "check-renderer-transactions.mjs",
      "check-renderer-transactions.test.mjs",
    ]) {
      await fs.copyFile(
        path.join(import.meta.dirname, name),
        path.join(fixtureRoot, "scripts", name),
      );
    }
    const scenarios = [
      { name: "no transaction sites", source: "" },
      {
        name: "plain SQL is not a transaction",
        source: 'async function load(db) { await db.execute("SELECT 1"); }',
      },
      ...["BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT sp1"].map((sql) => ({
        name: `static ${sql}`,
        source: `async function save(db) { await db.execute("${sql}"); }`,
        rejected: /Forbidden renderer-managed transaction entries:/,
      })),
      {
        name: "interpolated transaction",
        source:
          "async function save(db, mode) { await db.execute(`BEGIN ${mode}`); }",
        rejected: /Dynamic transaction SQL is forbidden:/,
      },
      {
        name: "concatenated transaction",
        source:
          'async function save(db, mode) { await db.execute("ROLLBACK " + mode); }',
        rejected: /Dynamic transaction SQL is forbidden:/,
      },
    ];
    for (const scenario of scenarios) {
      await t.test(scenario.name, async () => {
        await fs.writeFile(
          path.join(fixtureRoot, fixturePath),
          scenario.source,
        );
        const output = await checkReleaseGate(
          fixtureRoot,
          scenario.rejected ? 1 : 0,
        );
        if (scenario.rejected) assert.match(output, scenario.rejected);
      });
    }
  },
);
