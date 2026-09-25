import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  collectGraph,
  evaluateRules,
  formatDiagnostic,
  normalizePath,
  validatePolicy,
  detectCycles,
  inventory,
  compareBaseline,
  validateBaseline,
  parseJson,
} from "./check-architecture.mjs";

const policy = JSON.parse(
  fs.readFileSync(
    new URL("./architecture-policy.json", import.meta.url),
    "utf8",
  ),
);
function fixture(t, files, config = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "linkgo-architecture-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, text) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  };
  write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        moduleResolution: "bundler",
        module: "esnext",
        paths: { "@/*": ["./src/*"] },
      },
      include: ["src"],
      ...config,
    }),
  );
  for (const [file, text] of Object.entries(files)) write(file, text);
  return { root, write, graph: () => collectGraph(root) };
}
const rules = (graph) => evaluateRules(graph, policy).map((v) => v.rule);
const explanation = {
  owner: "fixture owner",
  rationale: "Reviewed fixture debt",
  removeWhen: "Remove the fixture edge",
};
const allowance = (current) => ({
  version: 1,
  boundaries: current.boundaries.map((entry) => ({ ...entry, ...explanation })),
  cycles: current.cycles.map((identity) => ({ identity, ...explanation })),
});
function graphEdges(pairs) {
  return {
    nodes: [...new Set(pairs.flatMap(([a, b]) => [a, b]))].sort(),
    diagnostics: [],
    edges: pairs.map(
      ([from, to, kind = "value", form = "import", binding = "x"]) => ({
        from,
        to,
        kind,
        form,
        binding,
        category: "source",
        line: 1,
        column: 1,
      }),
    ),
  };
}

test("cycles: acyclic, self, two/three nodes, type-only, dynamic and re-export", () => {
  const a = "src/lib/a.ts",
    b = "src/lib/b.ts",
    c = "src/lib/c.ts";
  assert.deepEqual(detectCycles(graphEdges([[a, b]])), []);
  assert.equal(detectCycles(graphEdges([[a, a]])).length, 1);
  assert.equal(
    detectCycles(
      graphEdges([
        [a, b],
        [b, a],
      ]),
    ).length,
    1,
  );
  const three = detectCycles(
    graphEdges([
      [a, b, "value", "dynamic"],
      [b, c, "value", "export-star"],
      [c, a],
    ]),
  );
  assert.deepEqual(three[0].nodes, [a, b, c]);
  assert.equal(
    detectCycles(
      graphEdges([
        [a, b, "type"],
        [b, a, "type"],
      ]),
    )[0].kind,
    "type-involving",
  );
  assert.equal(
    detectCycles(
      graphEdges([
        [a, b],
        [b, a, "type"],
      ]),
    )[0].kind,
    "type-involving",
  );
});
test("unchanged exact baseline passes; growth, duplicates, removals and stale allowances fail", () => {
  const a = "src/features/a/data.ts",
    b = "src/features/b/helper.ts";
  const initial = inventory(graphEdges([[a, b]]), policy),
    baseline = allowance(initial);
  assert.deepEqual(compareBaseline(initial, baseline), []);
  for (const pairs of [
    [
      [a, b],
      [a, b],
    ],
    [[a, b, "value", "import", "newBinding"]],
    [],
    [[a, b, "value", "namespace", "*"]],
  ])
    assert.ok(
      compareBaseline(inventory(graphEdges(pairs), policy), baseline).length,
    );
  assert.deepEqual(
    compareBaseline(
      inventory(graphEdges([]), policy),
      allowance(inventory(graphEdges([]), policy)),
    ),
    [],
  );
  assert.throws(
    () =>
      validateBaseline({
        ...baseline,
        boundaries: [...baseline.boundaries, ...baseline.boundaries],
      }),
    /Duplicate/,
  );
  assert.throws(
    () =>
      validateBaseline({
        ...baseline,
        boundaries: [{ ...baseline.boundaries[0], count: 0 }],
      }),
    /count/,
  );
  assert.throws(
    () =>
      validateBaseline({
        ...baseline,
        boundaries: [{ ...baseline.boundaries[0], owner: "" }],
      }),
    /owner/,
  );
});
test("cyclic internal edge growth and merging fail even when component count decreases", () => {
  const a = "src/lib/a.ts",
    b = "src/lib/b.ts",
    c = "src/lib/c.ts",
    d = "src/lib/d.ts";
  const pairs = [
    [a, b],
    [b, a],
    [c, d],
    [d, c],
  ];
  const initial = inventory(graphEdges(pairs), policy),
    baseline = allowance(initial);
  assert.deepEqual(compareBaseline(initial, baseline), []);
  for (const changed of [
    [...pairs, [a, b]],
    [...pairs, [a, b, "type"]],
    [...pairs, [b, c], [d, a]],
    [
      [a, b],
      [b, a, "value", "dynamic"],
    ],
  ])
    assert.ok(
      compareBaseline(inventory(graphEdges(changed), policy), baseline).length,
    );
  assert.throws(
    () =>
      validateBaseline({
        ...baseline,
        cycles: [...baseline.cycles, baseline.cycles[0]],
      }),
    /Duplicate/,
  );
  const malformed = structuredClone(baseline);
  malformed.cycles[0].identity.edges.pop();
  assert.throws(() => validateBaseline(malformed), /cyclic/);
  assert.deepEqual(
    detectCycles(graphEdges([...pairs].reverse())),
    detectCycles(graphEdges(pairs)),
  );
});
test("a new forbidden edge cannot replace removed debt; malformed records cannot grant access", () => {
  const a = "src/features/a/data.ts",
    b = "src/features/b/helper.ts",
    c = "src/features/c/helper.ts";
  const baseline = allowance(inventory(graphEdges([[a, b]]), policy));
  const result = compareBaseline(
    inventory(graphEdges([[a, c]]), policy),
    baseline,
  );
  assert.ok(result.some((e) => e.startsWith("New")));
  assert.ok(result.some((e) => e.startsWith("Stale")));
  for (const mutate of [
    (v) => {
      v.extra = true;
    },
    (v) => {
      v.boundaries[0].identity.from = "src/../outside.ts";
    },
    (v) => {
      v.boundaries[0].identity.form = "anything";
    },
    (v) => {
      v.boundaries[0].identity.rule = "unknown";
    },
  ]) {
    const value = structuredClone(baseline);
    mutate(value);
    assert.throws(() => validateBaseline(value));
  }
});

test("grouped exact bindings retain counts and reject overlap or malformed JSON", () => {
  const current = inventory(
    graphEdges([["src/features/a/data.ts", "src/features/b/helper.ts"]]),
    policy,
  );
  const original = allowance(current),
    e = original.boundaries[0];
  const { binding, ...common } = e.identity;
  const grouped = {
    identity: { ...common, bindings: { [binding]: e.count } },
    ...explanation,
  };
  const compact = { ...original, boundaries: [grouped] };
  assert.deepEqual(compareBaseline(current, compact), []);
  assert.throws(
    () => validateBaseline({ ...compact, boundaries: [grouped, e] }),
    /Duplicate/,
  );
  assert.throws(() => parseJson('{"version":1,"version":2}'), /Duplicate/);
  assert.throws(() => parseJson('{"bindings":{"x":1,"x":2}}'), /Duplicate/);
  assert.throws(() => parseJson("{broken}"));
  assert.throws(
    () =>
      validateBaseline({
        ...compact,
        boundaries: [
          {
            ...grouped,
            identity: { ...grouped.identity, bindings: { x: -1 } },
          },
        ],
      }),
    /count/,
  );
});
test("import then local named/default export cannot hide runtime access", (t) => {
  const f = fixture(t, {
    "src/features/a/hooks/use-a.ts":
      'import { renamed } from "../bridge"; import other from "../default";',
    "src/features/a/bridge.ts":
      'import { loop as local } from "@/agent/loop"; export { local as renamed };',
    "src/features/a/default.ts":
      'import { loop } from "@/agent/loop"; export default loop;',
    "src/agent/loop.ts": "export const loop = 1;",
  });
  const g = f.graph();
  assert.equal(g.edges.filter((e) => e.form === "export-local").length, 2);
  assert.equal(
    evaluateRules(g, policy).filter(
      (e) => e.from.endsWith("use-a.ts") && e.rule === "ui-runtime",
    ).length,
    2,
  );
});
test("declared metadata contracts are allowed but workflows cannot own raw persistence", (t) => {
  const f = fixture(t, {
    "src/features/a/hooks/use-a.ts":
      'import { label } from "@/agent/provider-catalog"; import type { Run } from "@/workflows/types";',
    "src/agent/provider-catalog.ts": 'export const label = "Provider";',
    "src/workflows/types.ts": "export type Run = string;",
    "src/workflows/run.ts":
      'import type { Db } from "@/lib/db"; import { getDb } from "@/lib/db";',
    "src/lib/db.ts": "export type Db = string; export const getDb = 1;",
  });
  assert.deepEqual(rules(f.graph()), [
    "workflow-persistence",
    "workflow-persistence",
  ]);
});
test("real package resolution enforces native and React external boundaries", (t) => {
  const f = fixture(t, {
    "node_modules/@tauri-apps/plugin-sql/package.json":
      '{"name":"@tauri-apps/plugin-sql","types":"index.d.ts"}',
    "node_modules/@tauri-apps/plugin-sql/index.d.ts":
      "export const sql: unknown;",
    "node_modules/react/package.json": '{"name":"react","types":"index.d.ts"}',
    "node_modules/react/index.d.ts": "export const createElement: unknown;",
    "src/agent/tools.ts": 'import { sql } from "@tauri-apps/plugin-sql";',
    "src/workflows/run.ts": 'import { createElement } from "react";',
    "src/features/a/schemas.ts":
      'import { sql } from "@tauri-apps/plugin-sql";',
    "src/features/a/components/view.tsx":
      'import { sql } from "@tauri-apps/plugin-sql";',
  });
  const actual = rules(f.graph());
  for (const rule of [
    "ui-native",
    "contract-executable",
    "agent-persistence",
    "workflow-ui",
  ])
    assert.ok(actual.includes(rule));
});
for (const consumer of ["src/agent/schemas.ts", "src/features/a/schemas.ts"]) {
  for (const form of ["named", "local"]) {
    test(`${consumer} allows direct Zod and ${form} schema bridges`, (t) => {
      const bridge = (target) =>
        form === "named"
          ? `export { z } from "${target}";`
          : `import { z } from "${target}"; export { z };`;
      const f = fixture(t, {
        "node_modules/zod/package.json": '{"name":"zod","types":"index.d.ts"}',
        "node_modules/zod/index.d.ts": "export const z: { string(): unknown };",
        "src/lib/one.ts": bridge("zod"),
        "src/lib/two.ts": bridge("./one"),
        [consumer]:
          'import { z } from "zod"; export const schema = z.string();',
      });
      for (const target of ["zod", "@/lib/one", "@/lib/two"]) {
        f.write(
          consumer,
          `import { z } from "${target}"; export const schema = z.string();`,
        );
        const g = f.graph();
        assert.deepEqual(g.diagnostics, []);
        assert.ok(
          g.edges.some((e) => e.to === "zod" && e.category === "external"),
        );
        assert.deepEqual(evaluateRules(g, policy), [], target);
        assert.deepEqual(
          compareBaseline(inventory(g, policy), {
            version: 1,
            boundaries: [],
            cycles: [],
          }),
          [],
        );
      }
    });
  }
}

for (const consumer of ["src/agent/schemas.ts", "src/features/a/schemas.ts"]) {
  for (const form of ["named", "local"]) {
    for (const target of [
      "react",
      "react/jsx-runtime",
      "@tauri-apps/plugin-sql",
      "@tauri-apps/api/core",
      "@/components/view",
      "@/lib/db",
      "@/agent/loop",
      "@/workflows/run",
      "@/features/a/data",
      "@/features/drafts/quality-loop",
    ]) {
      test(`${consumer} rejects ${form} contract bridges to ${target}`, (t) => {
        const bridge = (specifier) =>
          form === "named"
            ? `export { x } from "${specifier}";`
            : `import { x } from "${specifier}"; export { x };`;
        const f = fixture(t, {
          "node_modules/react/package.json":
            '{"name":"react","types":"index.d.ts"}',
          "node_modules/react/index.d.ts": "export const x: unknown;",
          "node_modules/react/jsx-runtime.d.ts": "export const x: unknown;",
          "node_modules/@tauri-apps/plugin-sql/package.json":
            '{"name":"@tauri-apps/plugin-sql","types":"index.d.ts"}',
          "node_modules/@tauri-apps/plugin-sql/index.d.ts":
            "export const x: unknown;",
          "node_modules/@tauri-apps/api/package.json":
            '{"name":"@tauri-apps/api","types":"index.d.ts"}',
          "node_modules/@tauri-apps/api/core.d.ts": "export const x: unknown;",
          "src/components/view.tsx": "export const x = 1;",
          "src/lib/db.ts": "export const x = 1;",
          "src/agent/loop.ts": "export const x = 1;",
          "src/workflows/run.ts": "export const x = 1;",
          "src/features/a/data.ts": "export const x = 1;",
          "src/features/drafts/quality-loop.ts": "export const x = 1;",
          "src/lib/one.ts": bridge(target),
          "src/lib/two.ts": bridge("./one"),
          [consumer]: 'import { x } from "@/lib/one";',
        });
        for (const entry of [target, "@/lib/one", "@/lib/two"]) {
          f.write(consumer, `import { x } from "${entry}";`);
          const g = f.graph();
          assert.deepEqual(g.diagnostics, []);
          assert.equal(
            evaluateRules(g, policy).filter(
              (e) => e.from === consumer && e.rule === "contract-executable",
            ).length,
            1,
            entry,
          );
          assert.ok(
            compareBaseline(inventory(g, policy), {
              version: 1,
              boundaries: [],
              cycles: [],
            }).some(
              (e) =>
                e.includes(`"from":"${consumer}"`) &&
                e.includes('"rule":"contract-executable"'),
            ),
          );
        }
      });
    }
  }
}

const uiConsumers = [
  ["src/workflows/run.ts", "workflow-ui"],
  ["src/agent/loop.ts", "agent-ui"],
  ["src/features/drafts/quality-loop.ts", "workflow-ui"],
];
for (const [consumer, rule] of uiConsumers) {
  test(`${consumer} preserves packages, implementation wrappers and pure type contracts`, (t) => {
    const f = fixture(t, {
      "node_modules/react/package.json":
        '{"name":"react","types":"index.d.ts"}',
      "node_modules/react/index.d.ts":
        "export const createElement: unknown; export type Node = string;",
      "node_modules/zod/package.json": '{"name":"zod","types":"index.d.ts"}',
      "node_modules/zod/index.d.ts": "export const z: unknown;",
      "src/lib/package.ts": 'export { z } from "zod";',
      "src/lib/implementation.ts": 'export { createElement } from "react";',
      "src/lib/wrapper.ts":
        'import { createElement } from "./implementation"; export function render(): string { return String(createElement); }',
      "src/lib/types.ts": 'export type { Node } from "react";',
      "src/lib/mixed.ts":
        'export { createElement } from "react"; export type Label = string;',
      "src/agent/provider-catalog.ts": 'export const label = "Provider";',
      "src/workflows/types.ts": "export type Run = string;",
      [consumer]:
        'import { z } from "@/lib/package"; import { render } from "@/lib/wrapper"; import type { Node } from "@/lib/types"; import type { Label } from "@/lib/mixed"; import { label } from "@/agent/provider-catalog"; import type { Run } from "@/workflows/types";',
    });
    const g = f.graph();
    assert.deepEqual(g.diagnostics, []);
    assert.deepEqual(rules(g), []);
    assert.deepEqual(
      compareBaseline(inventory(g, policy), {
        version: 1,
        boundaries: [],
        cycles: [],
      }),
      [],
    );
  });
  test(`${consumer} still rejects direct React and local UI type imports`, (t) => {
    const f = fixture(t, {
      "node_modules/react/package.json":
        '{"name":"react","types":"index.d.ts"}',
      "node_modules/react/index.d.ts": "export type Node = string;",
      "src/components/view.ts": "export type View = string;",
      [consumer]:
        'import type { Node } from "react"; import type { View } from "@/components/view";',
    });
    const g = f.graph();
    assert.deepEqual(g.diagnostics, []);
    assert.deepEqual(rules(g), [rule, rule]);
  });
  for (const target of ["react", "react/jsx-runtime", "@/components/view"]) {
    for (const [form, bridge] of [
      ["named", `export { createElement } from "${target}";`],
      ["star", `export * from "${target}";`],
      ["namespace", `export * as ui from "${target}";`],
      [
        "local",
        `import { createElement as local } from "${target}"; export { local };`,
      ],
      [
        "default-local",
        `import { createElement } from "${target}"; export default createElement;`,
      ],
      ["multi-hop", 'export * from "./next";'],
    ]) {
      test(`${consumer} rejects ${form} value re-exports of ${target}`, (t) => {
        const f = fixture(t, {
          "node_modules/react/package.json":
            '{"name":"react","types":"index.d.ts"}',
          "node_modules/react/index.d.ts":
            "export const createElement: unknown;",
          "node_modules/react/jsx-runtime.d.ts":
            "export const createElement: unknown;",
          "src/components/view.ts": "export const createElement = 1;",
          "src/lib/bridge.ts": bridge,
          "src/lib/next.ts": `export { createElement } from "${target}";`,
          [consumer]:
            'import * as ui from "@/lib/bridge"; export * from "@/lib/bridge";',
        });
        const g = f.graph();
        assert.deepEqual(g.diagnostics, []);
        assert.deepEqual(
          evaluateRules(g, policy)
            .filter((e) => e.from === consumer)
            .map((e) => e.rule),
          [rule, rule],
        );
        const errors = compareBaseline(inventory(g, policy), {
          version: 1,
          boundaries: [],
          cycles: [],
        });
        assert.equal(
          errors.filter(
            (e) =>
              e.includes(`"from":"${consumer}"`) &&
              e.includes(`"rule":"${rule}"`),
          ).length,
          2,
        );
      });
    }
  }
}

test("declared feature orchestration rejects resolved React imports and local re-exports", (t) => {
  const f = fixture(t, {
    "node_modules/react/package.json": '{"name":"react","types":"index.d.ts"}',
    "node_modules/react/index.d.ts": "export const createElement: unknown;",
    "src/features/drafts/quality-loop.ts":
      'import { createElement } from "react"; export { createElement };',
  });
  const g = f.graph();
  assert.deepEqual(g.diagnostics, []);
  assert.deepEqual(rules(g), ["workflow-ui", "workflow-ui"]);
  const current = inventory(g, policy);
  assert.deepEqual(
    current.boundaries.map((e) => e.count),
    [1, 1],
  );
  const errors = compareBaseline(current, {
    version: 1,
    boundaries: [],
    cycles: [],
  });
  assert.equal(errors.length, 2);
  assert.ok(
    errors.every(
      (e) =>
        e.startsWith("New boundary:") && e.includes('"rule":"workflow-ui"'),
    ),
  );
});

test("declared feature orchestration rejects same-feature components and hooks without losing feature identity", (t) => {
  const f = fixture(t, {
    "src/features/drafts/quality-loop.ts":
      'import { View } from "./components/view"; import type { State } from "./hooks/use-drafts"; import { helper } from "./helper"; import { other } from "@/features/other/helper";',
    "src/features/drafts/components/view.tsx": "export const View = 1;",
    "src/features/drafts/hooks/use-drafts.ts": "export type State = string;",
    "src/features/drafts/helper.ts": "export const helper = 1;",
    "src/features/other/helper.ts": "export const other = 1;",
  });
  const g = f.graph();
  assert.deepEqual(g.diagnostics, []);
  assert.deepEqual(
    evaluateRules(g, policy)
      .map(({ to, rule }) => ({ to, rule }))
      .sort((a, b) => a.to.localeCompare(b.to)),
    [
      { to: "src/features/drafts/components/view.tsx", rule: "workflow-ui" },
      { to: "src/features/drafts/hooks/use-drafts.ts", rule: "workflow-ui" },
      { to: "src/features/other/helper.ts", rule: "private-feature" },
    ],
  );
});

test("ordinary feature APIs remain non-orchestration and orchestration can call typed capabilities and pure contracts", (t) => {
  const f = fixture(t, {
    "node_modules/react/package.json": '{"name":"react","types":"index.d.ts"}',
    "node_modules/react/index.d.ts": "export const createElement: unknown;",
    "src/features/drafts/data.ts":
      'import { createElement } from "react"; import { View } from "./components/view"; import type { State } from "./hooks/use-drafts"; export function save(value: string): string { return value; }',
    "src/features/drafts/components/view.tsx": "export const View = 1;",
    "src/features/drafts/hooks/use-drafts.ts": "export type State = string;",
    "src/features/drafts/quality-loop.ts":
      'import { save } from "./data"; import type { Draft } from "./types"; import { label } from "@/agent/provider-catalog"; import type { Run } from "@/workflows/types"; import { load } from "@/features/other/data"; export const run = (draft: Draft) => save(draft);',
    "src/features/drafts/types/index.ts": "export type Draft = string;",
    "src/agent/provider-catalog.ts": 'export const label = "Provider";',
    "src/workflows/types.ts": "export type Run = string;",
    "src/features/other/data.ts":
      'export function load(): string { return "draft"; }',
  });
  const g = f.graph();
  assert.deepEqual(g.diagnostics, []);
  assert.deepEqual(rules(g), []);
  assert.deepEqual(
    compareBaseline(inventory(g, policy), {
      version: 1,
      boundaries: [],
      cycles: [],
    }),
    [],
  );
});

test("source inventory cannot be narrowed by tsconfig include and unknown assets fail", (t) => {
  const f = fixture(
    t,
    {
      "src/main.ts": "export {};",
      "src/other.ts": 'import "./payload.js";',
      "src/payload.js": "export {};",
    },
    { include: ["src/main.ts"] },
  );
  assert.ok(f.graph().nodes.includes("src/other.ts"));
  assert.deepEqual(rules(f.graph()), ["unsupported-asset"]);
});

test("same-feature helpers and cross-feature public contracts are allowed", (t) => {
  const f = fixture(t, {
    "src/features/a/hooks/use-a.ts":
      'import { x } from "../helper"; import type { B } from "@/features/b/types";',
    "src/features/a/helper.ts": "export const x = 1;",
    "src/features/b/types/index.ts": "export type B = string;",
  });
  assert.deepEqual(rules(f.graph()), []);
});
test("resolved aliases, relative indexes and type-only private imports keep ownership", (t) => {
  const f = fixture(t, {
    "src/features/a/data.ts":
      'import type { X } from "@/features/b/private"; export { x } from "../b/private";',
    "src/features/b/private/index.ts":
      "export type X = string; export const x = 1;",
  });
  const g = f.graph();
  assert.equal(g.edges.length, 2);
  assert.ok(g.edges.every((e) => e.to === "src/features/b/private/index.ts"));
  assert.deepEqual(rules(g), ["private-feature", "private-feature"]);
});
test("mixed imports/re-exports, namespace, side effects, import types and literal dynamic loads", (t) => {
  const f = fixture(t, {
    "src/features/a/data.ts":
      'import def, { type T, x as y } from "./helper"; export { type T, x as renamed } from "./helper"; import * as ns from "./helper"; export * from "./helper"; export * as names from "./helper"; import "./helper"; type I = import("./helper").T; const load = import(`./helper`);',
    "src/features/a/helper.ts":
      "export type T = string; export const x = 1; export default x;",
  });
  const g = f.graph();
  assert.deepEqual(g.diagnostics, []);
  assert.equal(g.edges.filter((e) => e.kind === "type").length, 3);
  assert.ok(
    g.edges.some((e) => e.binding === "x as renamed" && e.form === "export"),
  );
  for (const form of [
    "namespace",
    "side-effect",
    "export-star",
    "export-namespace",
    "dynamic",
    "import-type",
  ])
    assert.ok(
      g.edges.some((e) => e.form === form),
      form,
    );
});
test("UI cannot use direct runtime, database or a re-exported broad agent barrel", (t) => {
  const f = fixture(t, {
    "src/features/a/hooks/use-a.ts":
      'import { loop } from "../index"; import type { Loop } from "@/agent/loop"; import type { Contract } from "@/agent/types"; import { db } from "@/lib/db";',
    "src/features/a/index.ts": 'export * from "@/agent";',
    "src/agent/index.ts": 'export * from "./loop"; export * from "./types";',
    "src/agent/loop.ts": "export const loop = 1; export type Loop = string;",
    "src/agent/types.ts": "export type Contract = string;",
    "src/lib/db.ts": "export const db = 1;",
  });
  const violations = evaluateRules(f.graph(), policy);
  assert.ok(
    violations.some(
      (v) =>
        v.from.endsWith("use-a.ts") &&
        v.to.endsWith("a/index.ts") &&
        v.rule === "ui-runtime",
    ),
  );
  assert.ok(violations.some((v) => v.rule === "ui-database"));
  assert.ok(!violations.some((v) => v.to.endsWith("agent/types.ts")));
});
test("contract value imports, infrastructure upward edges, workflow UI and agent persistence fail", (t) => {
  const f = fixture(t, {
    "src/features/a/schemas.ts": 'import { db } from "@/lib/db";',
    "src/lib/db.ts":
      'import { x } from "@/features/a/data"; export const db = 1;',
    "src/features/a/data.ts": "export const x = 1;",
    "src/workflows/run.ts": 'import { View } from "@/features/a";',
    "src/features/a/index.ts": "export const View = 1;",
    "src/agent/tools.ts": 'import { x } from "@/features/a/data";',
  });
  const actual = rules(f.graph());
  for (const rule of [
    "contract-executable",
    "infrastructure-upward",
    "workflow-ui",
    "agent-persistence",
  ])
    assert.ok(actual.includes(rule));
});
test("documented helper examples remain violations rather than broad public exceptions", (t) => {
  const f = fixture(t, {
    "src/features/candidate-queue/data.ts":
      'import { urn } from "@/features/linkedin-actions/urn";',
    "src/features/linkedin-actions/urn.ts": "export const urn = 1;",
    "src/features/autopilot-planner/hooks/use-planner.ts":
      'import { connector } from "@/features/source-imports/connectors";',
    "src/features/source-imports/connectors.ts": "export const connector = 1;",
  });
  assert.equal(
    rules(f.graph()).filter((r) => r === "private-feature").length,
    2,
  );
});
test("computed loads, unsupported meta loads and unresolved imports fail closed", (t) => {
  const f = fixture(t, {
    "src/main.ts":
      'const x = import(name); const y = require(name); import.meta.glob("./*.ts"); import "@/missing"; import "missing-package";',
  });
  const actual = rules(f.graph());
  assert.equal(actual.filter((r) => r === "computed-module-load").length, 2);
  assert.ok(actual.includes("unsupported-module-load"));
  assert.ok(actual.includes("unresolved-local-import"));
  assert.ok(actual.includes("unresolved-package-import"));
});
test("malformed source/config/policy and escaping imports fail", (t) => {
  const f = fixture(t, {
    "src/main.ts": "export const = ;",
    "outside.ts": "export const x = 1;",
  });
  assert.deepEqual(rules(f.graph()), ["malformed-source"]);
  f.write("src/main.ts", 'import { x } from "../outside";');
  assert.deepEqual(rules(f.graph()), ["escaping-import"]);
  f.write("tsconfig.json", "{");
  assert.throws(f.graph, /tsconfig/);
  assert.throws(() => validatePolicy({ ...policy, rules: [] }), /rule/);
  assert.throws(
    () => validatePolicy({ ...policy, agentAdapters: ["src/../outside.ts"] }),
    /path/,
  );
});
test("source symlinks/junctions are rejected without following them", (t) => {
  const f = fixture(t, {
    "src/main.ts": "export {};",
    "outside/x.ts": "export {};",
  });
  fs.symlinkSync(
    path.join(f.root, "outside"),
    path.join(f.root, "src/link"),
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.throws(f.graph, /Symlinked/);
});
test("assets are separate and Windows normalization and diagnostics are deterministic", (t) => {
  const f = fixture(t, {
    "src/main.ts": 'import "./style.css";',
    "src/style.css": "body {}",
  });
  assert.equal(f.graph().edges[0].category, "asset");
  assert.deepEqual(rules(f.graph()), []);
  assert.equal(
    normalizePath("src\\features\\a\\data.ts"),
    "src/features/a/data.ts",
  );
  assert.equal(
    formatDiagnostic({
      from: "src/a.ts",
      to: "src/b.ts",
      line: 2,
      column: 3,
      rule: "private-feature",
    }),
    "src/a.ts:2:3 -> src/b.ts [private-feature]",
  );
  assert.deepEqual(f.graph(), f.graph());
});
