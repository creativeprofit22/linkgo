import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const RULES = [
  "private-feature",
  "ui-runtime",
  "ui-database",
  "ui-native",
  "infrastructure-upward",
  "workflow-ui",
  "workflow-persistence",
  "agent-persistence",
  "agent-ui",
  "agent-consumer",
  "contract-executable",
];
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const normalizePath = (value) => value.replaceAll("\\", "/");
const sorted = (values) => [...values].sort(compare);
const sourcePath = (value) =>
  typeof value === "string" &&
  /^src\/[\w./-]+\.(ts|tsx)$/.test(value) &&
  !value.split("/").some((part) => part === ".." || part === "." || !part);
function fail(message) {
  throw new Error(message);
}
function keys(value, expected, label) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    sorted(Object.keys(value)).join() !== sorted(expected).join()
  )
    fail(`Malformed ${label}`);
}
export function validatePolicy(policy) {
  keys(
    policy,
    [
      "version",
      "featurePublic",
      "agentContracts",
      "workflowContracts",
      "featureOrchestration",
      "agentAdapters",
      "database",
      "assets",
      "rules",
    ],
    "policy",
  );
  if (policy.version !== 1) fail("Unsupported policy version");
  for (const field of [
    "featurePublic",
    "agentContracts",
    "workflowContracts",
    "featureOrchestration",
    "agentAdapters",
    "database",
    "assets",
    "rules",
  ]) {
    if (
      !Array.isArray(policy[field]) ||
      policy[field].some((v) => typeof v !== "string") ||
      new Set(policy[field]).size !== policy[field].length
    )
      fail(`Malformed policy ${field}`);
  }
  if (sorted(policy.rules).join() !== sorted(RULES).join())
    fail("Policy must retain every ownership rule");
  if (
    sorted(policy.featurePublic).join() !==
    sorted(["index.ts", "data.ts", "schemas.ts", "types/index.ts"]).join()
  )
    fail("Unexpected feature public surface");
  for (const field of [
    "agentContracts",
    "workflowContracts",
    "featureOrchestration",
    "agentAdapters",
    "database",
  ])
    if (policy[field].some((v) => !sourcePath(v)))
      fail(`Malformed policy ${field} path`);
  if (
    policy.assets.some(
      (v) =>
        !/^\.[a-z0-9]+$/.test(v) || [".ts", ".tsx", ".js", ".jsx"].includes(v),
    )
  )
    fail("Malformed asset extension");
  return policy;
}
function contained(root, file) {
  const relative = path.relative(root, file);
  return (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}
function checkedPath(root, file) {
  if (!contained(root, file)) fail("Source escapes source tree");
  let current = root;
  for (const part of [
    "",
    ...path.relative(root, file).split(path.sep).filter(Boolean),
  ]) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) fail("Symlinked source input");
  }
  if (!contained(fs.realpathSync(root), fs.realpathSync(file)))
    fail("Resolved source escapes source tree");
}
export function parseJson(text) {
  const value = JSON.parse(text);
  const source = ts.parseJsonText("architecture.json", text);
  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const names = node.properties.map((p) => p.name?.text);
      if (new Set(names).size !== names.length) fail("Duplicate JSON property");
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return value;
}
function readJson(file, label) {
  try {
    return parseJson(fs.readFileSync(file, "utf8"));
  } catch {
    fail(`Cannot read ${label} JSON`);
  }
}
export function collectGraph(root) {
  root = path.resolve(root);
  const src = path.join(root, "src");
  checkedPath(src, src);
  const configPath = path.join(root, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) fail("Malformed tsconfig");
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    root,
    undefined,
    configPath,
  );
  if (parsed.errors.length) fail("Invalid tsconfig resolution options");
  const files = [];
  function walk(dir) {
    for (const item of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => compare(a.name, b.name))) {
      const file = path.join(dir, item.name);
      checkedPath(src, file);
      if (item.isDirectory()) walk(file);
      else if (/\.(ts|tsx)$/.test(item.name)) files.push(file);
    }
  }
  walk(src);
  const nodes = files.map((file) => normalizePath(path.relative(root, file)));
  const known = new Set(nodes);
  const edges = [];
  const diagnostics = [];
  const cache = ts.createModuleResolutionCache(
    root,
    (v) => (ts.sys.useCaseSensitiveFileNames ? v : v.toLowerCase()),
    parsed.options,
  );
  for (const file of files) {
    const from = normalizePath(path.relative(root, file));
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const location = (node) => {
      const p = source.getLineAndCharacterOfPosition(node.getStart(source));
      return { line: p.line + 1, column: p.character + 1 };
    };
    const error = (node, rule) =>
      diagnostics.push({ from, to: "<unresolved>", rule, ...location(node) });
    if (source.parseDiagnostics.length) {
      diagnostics.push({
        from,
        to: "<source>",
        rule: "malformed-source",
        line: 1,
        column: 1,
      });
      continue;
    }
    function add(specifier, node, kind, form, binding) {
      if (
        !specifier ||
        !(
          ts.isStringLiteral(specifier) ||
          ts.isNoSubstitutionTemplateLiteral(specifier)
        )
      ) {
        error(node, "computed-module-load");
        return;
      }
      const name = specifier.text;
      const alias = Object.keys(parsed.options.paths ?? {}).some((pattern) =>
        pattern.includes("*")
          ? name.startsWith(pattern.split("*")[0]) &&
            name.endsWith(pattern.split("*")[1])
          : name === pattern,
      );
      const local =
        name.startsWith(".") ||
        name.startsWith("/") ||
        name.includes("\\") ||
        alias ||
        /^[A-Za-z]:/.test(name);
      const result = ts.resolveModuleName(
        name,
        file,
        parsed.options,
        ts.sys,
        cache,
      ).resolvedModule;
      let to, category;
      if (result && contained(src, path.resolve(result.resolvedFileName))) {
        const target = path.resolve(result.resolvedFileName);
        checkedPath(src, target);
        to = normalizePath(path.relative(root, target));
        category = known.has(to) ? "source" : "asset";
      } else if (local) {
        // Assets still need an existing, contained file; aliases use the actual config substitutions.
        const replacements = alias
          ? Object.entries(parsed.options.paths).flatMap(
              ([pattern, targets]) => {
                const [prefix, suffix = ""] = pattern.split("*");
                if (
                  pattern.includes("*")
                    ? !(name.startsWith(prefix) && name.endsWith(suffix))
                    : name !== pattern
                )
                  return [];
                const middle = pattern.includes("*")
                  ? name.slice(
                      prefix.length,
                      suffix ? -suffix.length : undefined,
                    )
                  : "";
                return targets.map((target) =>
                  path.resolve(
                    parsed.options.baseUrl ?? root,
                    target.replace("*", middle),
                  ),
                );
              },
            )
          : [path.resolve(path.dirname(file), name)];
        const asset = replacements.find(
          (candidate) =>
            contained(src, candidate) &&
            fs.existsSync(candidate) &&
            fs.statSync(candidate).isFile(),
        );
        if (!result && asset) {
          checkedPath(src, asset);
          to = normalizePath(path.relative(root, asset));
          category = "asset";
        } else {
          error(node, result ? "escaping-import" : "unresolved-local-import");
          return;
        }
      } else {
        if (!result) {
          error(node, "unresolved-package-import");
          return;
        }
        to = name;
        category = "external";
      }
      edges.push({
        from,
        to,
        kind,
        form,
        binding,
        category,
        ...location(node),
      });
    }
    // Track imported locals so `import { x }; export { x }` cannot hide a runtime re-export.
    const importedLocals = new Map();
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !statement.importClause)
        continue;
      const clause = statement.importClause;
      const remember = (local, binding, typeOnly) =>
        importedLocals.set(local, {
          specifier: statement.moduleSpecifier,
          binding,
          kind: typeOnly ? "type" : "value",
        });
      if (clause.name) remember(clause.name.text, "default", clause.isTypeOnly);
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings))
        remember(clause.namedBindings.name.text, "*", clause.isTypeOnly);
      else if (clause.namedBindings)
        for (const b of clause.namedBindings.elements)
          remember(
            b.name.text,
            (b.propertyName ?? b.name).text,
            clause.isTypeOnly || b.isTypeOnly,
          );
    }
    function visit(node) {
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        if (!clause)
          add(node.moduleSpecifier, node, "value", "side-effect", "*");
        else {
          if (clause.name)
            add(
              node.moduleSpecifier,
              node,
              clause.isTypeOnly ? "type" : "value",
              "import",
              "default",
            );
          const bindings = clause.namedBindings;
          if (bindings && ts.isNamespaceImport(bindings))
            add(
              node.moduleSpecifier,
              node,
              clause.isTypeOnly ? "type" : "value",
              "namespace",
              "*",
            );
          else if (bindings) {
            if (!bindings.elements.length)
              add(
                node.moduleSpecifier,
                node,
                clause.isTypeOnly ? "type" : "value",
                "import-empty",
                "*",
              );
            for (const b of bindings.elements)
              add(
                node.moduleSpecifier,
                b,
                clause.isTypeOnly || b.isTypeOnly ? "type" : "value",
                "import",
                (b.propertyName ?? b.name).text,
              );
          }
        }
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        if (!node.exportClause)
          add(
            node.moduleSpecifier,
            node,
            node.isTypeOnly ? "type" : "value",
            "export-star",
            "*",
          );
        else if (ts.isNamespaceExport(node.exportClause))
          add(
            node.moduleSpecifier,
            node,
            node.isTypeOnly ? "type" : "value",
            "export-namespace",
            `* as ${node.exportClause.name.text}`,
          );
        else {
          if (!node.exportClause.elements.length)
            add(
              node.moduleSpecifier,
              node,
              node.isTypeOnly ? "type" : "value",
              "export-empty",
              "*",
            );
          for (const b of node.exportClause.elements)
            add(
              node.moduleSpecifier,
              b,
              node.isTypeOnly || b.isTypeOnly ? "type" : "value",
              "export",
              `${(b.propertyName ?? b.name).text} as ${b.name.text}`,
            );
        }
      } else if (
        ts.isExportDeclaration(node) &&
        !node.moduleSpecifier &&
        node.exportClause &&
        ts.isNamedExports(node.exportClause)
      ) {
        for (const b of node.exportClause.elements) {
          const imported = importedLocals.get((b.propertyName ?? b.name).text);
          if (imported)
            add(
              imported.specifier,
              b,
              node.isTypeOnly || b.isTypeOnly ? "type" : imported.kind,
              "export-local",
              `${imported.binding} as ${b.name.text}`,
            );
        }
      } else if (
        ts.isExportAssignment(node) &&
        ts.isIdentifier(node.expression)
      ) {
        const imported = importedLocals.get(node.expression.text);
        if (imported)
          add(
            imported.specifier,
            node,
            imported.kind,
            "export-local",
            `${imported.binding} as default`,
          );
      } else if (ts.isImportTypeNode(node)) {
        add(
          ts.isLiteralTypeNode(node.argument)
            ? node.argument.literal
            : undefined,
          node,
          "type",
          "import-type",
          node.qualifier?.getText(source) ?? "*",
        );
      } else if (ts.isImportEqualsDeclaration(node)) {
        if (ts.isExternalModuleReference(node.moduleReference))
          add(
            node.moduleReference.expression,
            node,
            node.isTypeOnly ? "type" : "value",
            "require",
            "*",
          );
      } else if (ts.isCallExpression(node)) {
        if (
          node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require")
        )
          add(
            node.arguments[0],
            node,
            "value",
            node.expression.kind === ts.SyntaxKind.ImportKeyword
              ? "dynamic"
              : "require",
            "*",
          );
        else if (
          ts.isPropertyAccessExpression(node.expression) &&
          ((ts.isIdentifier(node.expression.expression) &&
            node.expression.expression.text === "require") ||
            node.expression.expression.kind === ts.SyntaxKind.MetaProperty)
        )
          error(node, "unsupported-module-load");
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return {
    nodes: sorted(nodes),
    edges: edges.sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b))),
    diagnostics,
  };
}
function role(file) {
  const match = /^src\/features\/([^/]+)\/(.+)$/.exec(file);
  if (match)
    return {
      owner: "feature",
      feature: match[1],
      relative: match[2],
      ui:
        /(^|\/)(components|hooks)\//.test(match[2]) ||
        file.endsWith(".tsx") ||
        match[2] === "index.ts",
      contract: match[2] === "schemas.ts" || match[2].startsWith("types/"),
    };
  if (file.startsWith("src/agent/")) return { owner: "agent" };
  if (file.startsWith("src/workflows/")) return { owner: "workflow" };
  if (file.startsWith("src/lib/")) return { owner: "infrastructure" };
  return { owner: "ui", ui: true };
}
export function evaluateRules(graph, policy) {
  validatePolicy(policy);
  const violations = [...graph.diagnostics];
  const outgoing = new Map();
  const sources = new Set(graph.nodes);
  const contractExternal = (file) => /^(react($|\/)|@tauri-apps\/)/.test(file);
  // External packages have no local ownership; only React is a UI target.
  const ui = (file) =>
    sources.has(file) ? Boolean(role(file).ui) : /^react($|\/)/.test(file);
  for (const edge of graph.edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(edge);
  }
  // Follow only value re-exports: normal typed APIs may call capabilities internally.
  function exposes(file, predicate, visited = new Set()) {
    if (predicate(file)) return true;
    if (visited.has(file)) return false;
    visited.add(file);
    return (outgoing.get(file) ?? []).some(
      (edge) =>
        edge.kind === "value" &&
        edge.form.startsWith("export") &&
        exposes(edge.to, predicate, visited),
    );
  }
  for (const edge of graph.edges) {
    const a = role(edge.from),
      b = role(edge.to);
    const orchestration =
      a.owner === "workflow" || policy.featureOrchestration.includes(edge.from);
    const value = edge.kind === "value";
    const emit = (rule) => violations.push({ ...edge, rule });
    if (edge.category === "asset") {
      if (!policy.assets.includes(path.posix.extname(edge.to)))
        emit("unsupported-asset");
      continue;
    }
    const native = (file) => file.startsWith("@tauri-apps/");
    if (a.ui && value && exposes(edge.to, native)) emit("ui-native");
    const contract =
      a.contract ||
      policy.agentContracts.includes(edge.from) ||
      policy.workflowContracts.includes(edge.from);
    if (
      (orchestration || a.owner === "agent") &&
      (value ? exposes(edge.to, ui) : ui(edge.to))
    )
      emit(orchestration ? "workflow-ui" : "agent-ui");
    if (edge.category === "external") {
      if (contract && value && contractExternal(edge.to))
        emit("contract-executable");

      if (edge.to === "@tauri-apps/plugin-sql") {
        if (a.owner === "agent") emit("agent-persistence");
        if (orchestration) emit("workflow-persistence");
      }
      continue;
    }
    if (
      b.owner === "feature" &&
      a.feature !== b.feature &&
      !policy.featurePublic.includes(b.relative)
    )
      emit("private-feature");
    const runtime = (file) =>
      (file.startsWith("src/workflows/") &&
        !policy.workflowContracts.includes(file)) ||
      (file.startsWith("src/agent/") &&
        !policy.agentContracts.includes(file)) ||
      policy.featureOrchestration.includes(file);
    if (a.ui && (value ? exposes(edge.to, runtime) : runtime(edge.to)))
      emit("ui-runtime");
    if (a.ui && exposes(edge.to, (file) => policy.database.includes(file)))
      emit("ui-database");
    if (a.owner === "infrastructure" && b.owner !== "infrastructure")
      emit("infrastructure-upward");

    if (
      orchestration &&
      exposes(edge.to, (file) => policy.database.includes(file))
    )
      emit("workflow-persistence");
    if (
      a.owner === "agent" &&
      (b.owner === "feature" ||
        (b.owner === "workflow" &&
          !policy.workflowContracts.includes(edge.to)) ||
        policy.database.includes(edge.to)) &&
      (value || !b.contract)
    )
      emit("agent-persistence");

    if (
      b.owner === "agent" &&
      a.owner !== "agent" &&
      !a.ui &&
      !policy.agentAdapters.includes(edge.from) &&
      !policy.agentContracts.includes(edge.to)
    )
      emit("agent-consumer");
    if (
      contract &&
      value &&
      exposes(edge.to, (file) => {
        // Packages do not have application ownership, even through a bridge.
        if (!sources.has(file)) return contractExternal(file);
        const target = role(file);
        return (
          policy.database.includes(file) ||
          target.ui ||
          (target.owner === "workflow" &&
            !policy.workflowContracts.includes(file)) ||
          policy.featureOrchestration.includes(file) ||
          (target.owner === "feature" && target.relative === "data.ts") ||
          (target.owner === "agent" && !policy.agentContracts.includes(file))
        );
      })
    )
      emit("contract-executable");
  }
  return violations.sort((a, b) =>
    compare(formatDiagnostic(a), formatDiagnostic(b)),
  );
}
export function formatDiagnostic(item) {
  return `${item.from}:${item.line}:${item.column} -> ${item.to} [${item.rule}]${item.kind ? ` ${item.kind} ${item.form} ${item.binding}` : ""}`;
}

// Cycle/baseline support is kept independent from collection and ownership evaluation.
export function boundaryIdentity(edge) {
  return {
    from: edge.from,
    to: edge.to,
    kind: edge.kind,
    form: edge.form,
    binding: edge.binding,
    rule: edge.rule,
  };
}
const identityKey = (identity) => JSON.stringify(identity);
function edgeIdentity(edge) {
  return {
    from: edge.from,
    to: edge.to,
    kind: edge.kind,
    form: edge.form,
    binding: edge.binding,
  };
}
function counted(items, identity) {
  const counts = new Map();
  for (const item of items) {
    const id = identity(item),
      key = identityKey(id);
    const old = counts.get(key);
    counts.set(key, { identity: id, count: (old?.count ?? 0) + 1 });
  }
  return [...counts.values()].sort((a, b) =>
    compare(identityKey(a.identity), identityKey(b.identity)),
  );
}
export function detectCycles(graph) {
  const edges = graph.edges.filter((e) => e.category === "source");
  function components(selected) {
    const outgoing = new Map(graph.nodes.map((node) => [node, []]));
    for (const edge of selected) outgoing.get(edge.from)?.push(edge.to);
    let next = 0;
    const index = new Map(),
      low = new Map(),
      stack = [],
      active = new Set(),
      result = [];
    function visit(node) {
      index.set(node, next);
      low.set(node, next++);
      stack.push(node);
      active.add(node);
      for (const target of outgoing.get(node) ?? []) {
        if (!index.has(target)) {
          visit(target);
          low.set(node, Math.min(low.get(node), low.get(target)));
        } else if (active.has(target))
          low.set(node, Math.min(low.get(node), index.get(target)));
      }
      if (low.get(node) === index.get(node)) {
        const members = [];
        let member;
        do {
          member = stack.pop();
          active.delete(member);
          members.push(member);
        } while (member !== node);
        if (members.length > 1 || (outgoing.get(node) ?? []).includes(node))
          result.push(sorted(members));
      }
    }
    for (const node of sorted(graph.nodes)) if (!index.has(node)) visit(node);
    return result;
  }
  const runtimeEdges = edges.filter((e) => e.kind === "value");
  const runtime = components(runtimeEdges);
  const record = (kind, nodes, selected) => ({
    kind,
    nodes,
    edges: counted(
      selected.filter((e) => nodes.includes(e.from) && nodes.includes(e.to)),
      edgeIdentity,
    ),
  });
  const cycles = runtime.map((nodes) => record("runtime", nodes, runtimeEdges));
  for (const nodes of components(edges)) {
    const internal = edges.filter(
      (e) => nodes.includes(e.from) && nodes.includes(e.to),
    );
    // A complete component with no type edges is already reported as runtime.
    if (internal.some((e) => e.kind === "type"))
      cycles.push(record("type-involving", nodes, edges));
  }
  return cycles.sort((a, b) => compare(identityKey(a), identityKey(b)));
}
export function inventory(graph, policy) {
  const violations = evaluateRules(graph, policy);
  const errors = violations.filter((v) => !RULES.includes(v.rule));
  return {
    errors,
    boundaries: counted(
      violations.filter((v) => RULES.includes(v.rule)),
      boundaryIdentity,
    ),
    cycles: detectCycles(graph),
  };
}
const FORMS = [
  "import",
  "namespace",
  "side-effect",
  "import-empty",
  "export",
  "export-star",
  "export-namespace",
  "export-empty",
  "export-local",
  "dynamic",
  "require",
  "import-type",
];
function validateEdge(id, boundary = false) {
  keys(
    id,
    boundary
      ? ["from", "to", "kind", "form", "binding", "rule"]
      : ["from", "to", "kind", "form", "binding"],
    "edge identity",
  );
  if (
    !sourcePath(id.from) ||
    !(
      sourcePath(id.to) ||
      (boundary && /^@tauri-apps\/[\w/-]+$/.test(id.to)) ||
      (boundary && /^react(?:\/[\w/-]+)?$/.test(id.to))
    ) ||
    !["type", "value"].includes(id.kind) ||
    !FORMS.includes(id.form) ||
    typeof id.binding !== "string" ||
    !id.binding.trim() ||
    id.binding.length > 512 ||
    /[\r\n\x00-\x1f]/.test(id.binding) ||
    (boundary && !RULES.includes(id.rule))
  )
    fail("Malformed edge identity");
  return boundary ? boundaryIdentity(id) : edgeIdentity(id);
}
function positive(value) {
  if (!Number.isSafeInteger(value) || value < 1)
    fail("Malformed occurrence count");
}
function explanation(record) {
  for (const field of ["owner", "rationale", "removeWhen"])
    if (
      typeof record[field] !== "string" ||
      !record[field].trim() ||
      record[field].length > 2048
    )
      fail(`Missing exception ${field}`);
}
function expandBindings(entry, boundary) {
  if (!entry.identity || !Object.hasOwn(entry.identity, "bindings"))
    return [entry];
  const id = entry.identity;
  keys(
    id,
    boundary
      ? ["from", "to", "kind", "form", "bindings", "rule"]
      : ["from", "to", "kind", "form", "bindings"],
    "grouped identity",
  );
  keys(
    entry,
    boundary ? ["identity", "owner", "rationale", "removeWhen"] : ["identity"],
    "grouped exception",
  );
  if (
    !id.bindings ||
    typeof id.bindings !== "object" ||
    Array.isArray(id.bindings) ||
    !Object.keys(id.bindings).length
  )
    fail("Malformed binding counts");
  return Object.entries(id.bindings).map(([binding, count]) => ({
    identity: {
      from: id.from,
      to: id.to,
      kind: id.kind,
      form: id.form,
      binding,
      ...(boundary ? { rule: id.rule } : {}),
    },
    count,
    ...(boundary
      ? {
          owner: entry.owner,
          rationale: entry.rationale,
          removeWhen: entry.removeWhen,
        }
      : {}),
  }));
}
export function validateBaseline(baseline) {
  keys(baseline, ["version", "boundaries", "cycles"], "baseline");
  if (
    baseline.version !== 1 ||
    !Array.isArray(baseline.boundaries) ||
    !Array.isArray(baseline.cycles)
  )
    fail("Malformed baseline");
  baseline = {
    ...baseline,
    boundaries: baseline.boundaries.flatMap((entry) =>
      expandBindings(entry, true),
    ),
    cycles: baseline.cycles.map((entry) => {
      if (!entry?.identity || !Array.isArray(entry.identity.edges))
        fail("Malformed cycle identity");
      return {
        ...entry,
        identity: {
          ...entry.identity,
          edges: entry.identity.edges.flatMap((edge) =>
            expandBindings(edge, false),
          ),
        },
      };
    }),
  };
  const seen = new Set();
  for (const entry of baseline.boundaries) {
    keys(
      entry,
      ["identity", "count", "owner", "rationale", "removeWhen"],
      "boundary exception",
    );
    const canonical = validateEdge(entry.identity, true);
    positive(entry.count);
    explanation(entry);
    const key = identityKey(canonical);
    if (seen.has(key)) fail("Duplicate boundary exception");
    seen.add(key);
  }
  const cycleSeen = new Set();
  for (const entry of baseline.cycles) {
    keys(
      entry,
      ["identity", "owner", "rationale", "removeWhen"],
      "cycle exception",
    );
    explanation(entry);
    const id = entry.identity;
    keys(id, ["kind", "nodes", "edges"], "cycle identity");
    if (
      !["runtime", "type-involving"].includes(id.kind) ||
      !Array.isArray(id.nodes) ||
      !id.nodes.length ||
      id.nodes.some((n) => !sourcePath(n)) ||
      sorted(new Set(id.nodes)).join() !== id.nodes.join() ||
      !Array.isArray(id.edges) ||
      !id.edges.length
    )
      fail("Malformed cycle membership");
    const internalSeen = new Set();
    const expanded = [];
    for (const edge of id.edges) {
      keys(edge, ["identity", "count"], "cycle edge");
      const canonical = validateEdge(edge.identity);
      positive(edge.count);
      if (
        !id.nodes.includes(canonical.from) ||
        !id.nodes.includes(canonical.to) ||
        (id.kind === "runtime" && canonical.kind !== "value")
      )
        fail("Malformed cycle edge");
      const key = identityKey(canonical);
      if (internalSeen.has(key)) fail("Duplicate cycle edge");
      internalSeen.add(key);
      // Counts need not be expanded to validate strongly connected membership.
      expanded.push({ ...canonical, category: "source" });
    }
    const detected = detectCycles({ nodes: id.nodes, edges: expanded });
    if (
      !detected.some(
        (c) => c.kind === id.kind && c.nodes.join() === id.nodes.join(),
      )
    )
      fail("Baseline component is not cyclic");
    const key = `${id.kind}:${id.nodes.join()}`;
    if (cycleSeen.has(key)) fail("Duplicate cycle exception");
    cycleSeen.add(key);
  }
  return baseline;
}
function canonicalCycle(id) {
  return {
    kind: id.kind,
    nodes: sorted(id.nodes),
    edges: id.edges
      .map((e) => ({ identity: edgeIdentity(e.identity), count: e.count }))
      .sort((a, b) =>
        compare(identityKey(a.identity), identityKey(b.identity)),
      ),
  };
}
export function compareBaseline(current, baseline) {
  baseline = validateBaseline(baseline);
  const errors = current.errors.map(formatDiagnostic);
  function compareRecords(actual, allowed, canonical, label) {
    const now = new Map(
      actual.map((e) => [identityKey(canonical(e.identity)), e.count ?? 1]),
    );
    const prior = new Map(
      allowed.map((e) => [identityKey(canonical(e.identity)), e.count ?? 1]),
    );
    for (const [key, count] of now)
      if (!prior.has(key)) errors.push(`New ${label}: ${key}`);
      else if (prior.get(key) !== count)
        errors.push(
          `Changed ${label} occurrence count: ${key} (${prior.get(key)} -> ${count})`,
        );
    for (const key of prior.keys())
      if (!now.has(key)) errors.push(`Stale ${label}: ${key}`);
  }
  compareRecords(
    current.boundaries,
    baseline.boundaries,
    boundaryIdentity,
    "boundary",
  );
  compareRecords(
    current.cycles.map((identity) => ({ identity })),
    baseline.cycles,
    canonicalCycle,
    "cycle",
  );
  return sorted(errors);
}
function directRun() {
  return (
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  );
}
export function main(args = process.argv.slice(2)) {
  if (args.some((arg) => arg !== "--inventory") || args.length > 1)
    fail("Usage: check-architecture.mjs [--inventory]");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const policy = validatePolicy(
    readJson(path.join(root, "scripts/architecture-policy.json"), "policy"),
  );
  const graph = collectGraph(root);
  const current = inventory(graph, policy);
  if (current.errors.length) {
    for (const v of current.errors) console.error(formatDiagnostic(v));
    return 1;
  }
  if (args.includes("--inventory")) {
    console.log(
      JSON.stringify(
        { nodes: graph.nodes.length, edges: graph.edges.length, ...current },
        null,
        2,
      ),
    );
    return 0;
  }
  const baseline = readJson(
    path.join(root, "scripts/architecture-baseline.json"),
    "baseline",
  );
  const errors = compareBaseline(current, baseline);
  for (const error of errors) console.error(error);
  if (errors.length)
    for (const violation of evaluateRules(graph, policy))
      console.error(formatDiagnostic(violation));
  console.log(
    `Architecture: ${graph.nodes.length} sources, ${graph.edges.length} binding edges, ${current.boundaries.length} boundary exceptions, ${current.cycles.length} cyclic components; ${errors.length} errors.`,
  );
  return errors.length ? 1 : 0;
}
if (directRun()) {
  try {
    process.exitCode = main();
  } catch {
    console.error(
      "Architecture check failed: invalid input or filesystem/resolution error.",
    );
    process.exitCode = 1;
  }
}
