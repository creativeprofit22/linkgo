import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import {
  compareSignatures,
  createSignatures,
  scanSourceText,
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

test("duplicate identities cannot hide additions, while removals remain allowed", () => {
  const one = scan(
    'async function save(db) { await db.execute("COMMIT"); }',
  ).signatures;
  const two = scan(`async function save(db) {
    await db.execute("COMMIT");
    await db.execute("COMMIT");
  }`).signatures;

  assert.deepEqual(compareSignatures(one, two), {
    ok: true,
    unexpected: [],
    errors: [],
  });
  assert.deepEqual(compareSignatures(two, one), {
    ok: false,
    unexpected: [one[0]],
    errors: [],
  });
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

test(
  "the release check executes focused tests and the repository scan",
  { skip: process.env.SKIP_RELEASE_GATE_TEST === "1" },
  () => {
    const root = path.resolve(import.meta.dirname, "..");
    const result = spawnSync("bun", ["run", "check:renderer-transactions"], {
      cwd: root,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: { ...process.env, SKIP_RELEASE_GATE_TEST: "1" },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(
      result.stdout,
      /Renderer transaction sites: 105 current, 105 allowlisted\./,
    );
  },
);
