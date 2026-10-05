import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  completedPhases,
  DOCS,
  isCalendarDate,
  unregisteredDocs,
} from "./build-site.mjs";

const roadmap = (status) =>
  `# Research Roadmap — Modding, Fan Games And Ports\n\n${status}\nCreated: 2026-10-02.\n`;

describe("completedPhases", () => {
  test("reads the current wrapped status line", () => {
    assert.equal(
      completedPhases(
        roadmap(
          "Status: phases 1–10 complete (Phase 10 finished 2026-10-04); Phase 11 not\nstarted.",
        ),
      ),
      10,
    );
  });

  test("reads a later status line", () => {
    assert.equal(completedPhases(roadmap("Status: phases 1–11 complete.")), 11);
  });

  test("accepts a hyphen instead of an en dash", () => {
    assert.equal(completedPhases(roadmap("Status: phases 1-11 complete.")), 11);
  });

  test("throws when the status line cannot be parsed", () => {
    assert.throws(
      () => completedPhases(roadmap("Status: in progress.")),
      /cannot parse completed phases/,
    );
  });

  test("throws when there is no status line", () => {
    assert.throws(
      () => completedPhases("# Roadmap\n\nphases 1–10 complete\n"),
      /cannot parse completed phases/,
    );
  });
});

describe("unregisteredDocs", () => {
  const registered = DOCS.map((doc) => doc.file);

  test("returns nothing when every file is registered", () => {
    assert.deepEqual(unregisteredDocs(registered, DOCS), []);
  });

  test("returns a new research file that is not in DOCS", () => {
    assert.deepEqual(unregisteredDocs([...registered, "12-x.md"], DOCS), [
      "12-x.md",
    ]);
  });

  test("returns extras sorted", () => {
    assert.deepEqual(unregisteredDocs(["zz.md", "13-y.md", "12-x.md"], DOCS), [
      "12-x.md",
      "13-y.md",
      "zz.md",
    ]);
  });

  test("ignores files that are not Markdown", () => {
    assert.deepEqual(
      unregisteredDocs([...registered, "notes.txt", "data", "x.md.bak"], DOCS),
      [],
    );
  });
});

describe("isCalendarDate", () => {
  const cases = [
    ["2026-10-04", true],
    ["2024-02-29", true],
    ["2026-13-45", false],
    ["2026-02-31", false],
    ["2025-02-29", false],
    ["26-10-04", false],
    ["", false],
  ];
  for (const [value, expected] of cases) {
    test(`${JSON.stringify(value)} -> ${expected}`, () => {
      assert.equal(isCalendarDate(value), expected);
    });
  }
});
