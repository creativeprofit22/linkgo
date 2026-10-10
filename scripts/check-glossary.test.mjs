import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  checkGlossary,
  extractVisibleStrings,
  findViolations,
} from "./check-glossary.mjs";

function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "linkgo-glossary-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "src", "components"), { recursive: true });
  fs.mkdirSync(path.join(root, "src", "features"), { recursive: true });
  for (const [file, text] of Object.entries(files)) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
  return root;
}

test("flags banned words in JSX text and string literals", () => {
  const source = `
    export function A() {
      const label = "Save guide";
      return <p>Pick a candidate to write about</p>;
    }`;
  const violations = findViolations("a.tsx", source);
  assert.deepEqual(
    violations.map((v) => v.text),
    ["Save guide", "Pick a candidate to write about"],
  );
});

test("flags id patterns in template literals", () => {
  const source =
    "export const A = ({ id }) => <p>{`Task #${id} was deleted`}</p>;";
  const [violation] = findViolations("a.tsx", source);
  assert.equal(violation?.text, "Task #${} was deleted");
  assert.equal(violation?.say, "a name instead of an id");
});

test("flags JSX text ending in # before an id expression", () => {
  const source = `export const A = ({ id }) => (
    <p>
      AI draft #
      {id}
    </p>
  );`;
  const [violation] = findViolations("a.tsx", source);
  assert.equal(violation?.text, "AI draft #{}");
});

test("flags JSON wording", () => {
  const [violation] = findViolations(
    "a.tsx",
    "export const A = () => <label>Posts (JSON)</label>;",
  );
  assert.equal(violation?.say, "a guided form");
});

test("skips imports, non-visible attributes and support details", () => {
  const source = `
    import { workflowRoute } from "@/features/workflows";
    export function A() {
      return (
        <div className="candidate-list" id="variant-1" data-testid="workflow run">
          <SupportDetails>Reference: idempotency key #12</SupportDetails>
          <details data-support>Attempt #3</details>
          <p>Write a version</p>
        </div>
      );
    }`;
  assert.deepEqual(findViolations("a.tsx", source), []);
  assert.ok(
    extractVisibleStrings("a.tsx", source).some(
      (s) => s.text === "Write a version",
    ),
  );
});

test("does not treat single lowercase identifiers as visible text", () => {
  const source = `export const A = ({ s }) => s === "candidate" ? <p>Idea</p> : null;`;
  assert.deepEqual(findViolations("a.tsx", source), []);
});

test("checkGlossary scans components and feature components only", (t) => {
  const root = fixture(t, {
    "src/components/x.tsx": "export const X = () => <p>Open the playbook</p>;",
    "src/features/f/components/y.tsx":
      "export const Y = () => <p>Run the workflow</p>;",
    "src/features/f/data.ts": 'export const z = "Run the workflow";',
    "src/pages/p.tsx": "export const P = () => <p>Run the workflow</p>;",
  });
  const { violations, stale } = checkGlossary(root, []);
  assert.deepEqual(violations.map((v) => v.file).sort(), [
    "src/components/x.tsx",
    "src/features/f/components/y.tsx",
  ]);
  assert.deepEqual(stale, []);
});

test("checkGlossary scans plain .ts component helpers but not .d.ts", (t) => {
  const current = fs.readFileSync(
    new URL(
      "../src/features/drafts/components/generate-draft-blocked-reason.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const root = fixture(t, {
    "src/features/f/components/blocked-reason.ts":
      'export function reason(): string { return "Pick a candidate first."; }',
    "src/features/drafts/components/generate-draft-blocked-reason.ts": current,
    "src/components/types.d.ts": 'declare const x: "Run the workflow";',
  });
  const { violations } = checkGlossary(root, []);
  assert.deepEqual(
    violations.map((v) => [v.file, v.text]),
    [
      [
        "src/features/f/components/blocked-reason.ts",
        "Pick a candidate first.",
      ],
    ],
  );
});

test("allowances suppress exact matches and stale ones are reported", (t) => {
  const root = fixture(t, {
    "src/components/x.tsx": "export const X = () => <p>Open the playbook</p>;",
  });
  const used = { file: "src/components/x.tsx", text: "Open the playbook" };
  const unused = { file: "src/components/x.tsx", text: "Gone" };
  const { violations, stale } = checkGlossary(root, [used, unused]);
  assert.deepEqual(violations, []);
  assert.deepEqual(stale, [unused]);
});
