// Fails when visible UI text uses words the glossary (docs/glossary.md) bans,
// shows `#id` patterns, or mentions JSON. Support-only text inside
// <SupportDetails> or <details data-support> is skipped.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * Mirrors the "Don't say" column of docs/glossary.md, except the
 * context-dependent cells the glossary marks as not machine-checked.
 */
export const BANNED_TERMS = [
  { pattern: /\bcandidates?\b/i, say: "idea" },
  { pattern: /\bvariants?\b/i, say: "version" },
  { pattern: /\bplaybooks?\b/i, say: "Brand voice" },
  { pattern: /\bguides?\b/i, say: "Brand voice / voice" },
  { pattern: /\bworkflows?\b/i, say: "Automation" },
  { pattern: /\bagent runs?\b/i, say: "AI task" },
  { pattern: /\bbatch(es)?\b/i, say: "import" },
  { pattern: /\bmemory\b/i, say: "lesson" },
  { pattern: /\bpause everything\b/i, say: "emergency pause" },
  { pattern: /\bkill switch\b/i, say: "emergency pause" },
  { pattern: /\bidempotency\b/i, say: "Details for support" },
  { pattern: /\breconciliation\b/i, say: "Couldn't confirm" },
  { pattern: /\boutcome unknown\b/i, say: "Couldn't confirm" },
  { pattern: /\brequest id\b/i, say: "Details for support" },
  { pattern: /\battempt #/i, say: "a posting try (no number)" },
  { pattern: /\bexecution #/i, say: "a posting try (no number)" },
  { pattern: /\bJSON\b/, say: "a guided form" },
  { pattern: /#\$\{|#\{|#\d/, say: "a name instead of an id" },
];

/** Attributes whose values never render as text. */
const NON_VISIBLE_ATTRIBUTES = new Set([
  "className",
  "variant",
  "htmlFor",
  "id",
  "key",
  "type",
  "href",
  "name",
  "value",
  "size",
  "side",
  "align",
  "role",
  "autoComplete",
  "inputMode",
  "form",
  "data-testid",
]);

/**
 * Exact `file:text` allowances for strings that must keep a banned word.
 * Each entry needs a reason; stale entries fail the check.
 */
export const ALLOWANCES = [];

const isVisibleLooking = (text) =>
  /#\$?\{|#\d/.test(text) ||
  (/[A-Za-z]/.test(text) &&
    (/\s/.test(text.trim()) || /^[A-Z][a-z]/.test(text.trim())));

function isSupportElement(node) {
  const opening = ts.isJsxElement(node)
    ? node.openingElement
    : ts.isJsxSelfClosingElement(node)
      ? node
      : null;
  if (!opening) return false;
  const tag = opening.tagName.getText();
  if (tag === "SupportDetails") return true;
  if (tag !== "details") return false;
  return opening.attributes.properties.some(
    (a) => ts.isJsxAttribute(a) && a.name.getText() === "data-support",
  );
}

function templateText(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  let text = node.head.text;
  for (const span of node.templateSpans) text += "${}" + span.literal.text;
  return text;
}

/** True for `.ts`/`.tsx` sources the scan reads; declaration files are skipped. */
const isScannedSource = (name) =>
  (name.endsWith(".tsx") || name.endsWith(".ts")) && !name.endsWith(".d.ts");

/**
 * Collects candidate visible strings from one source text. `.tsx` parses as
 * TSX; plain `.ts` helpers (e.g. returned reason strings) parse as TS.
 */
export function extractVisibleStrings(fileName, sourceText) {
  const source = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out = [];
  const push = (node, text) => {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!trimmed || !isVisibleLooking(trimmed)) return;
    const { line } = source.getLineAndCharacterOfPosition(node.getStart());
    out.push({ line: line + 1, text: trimmed });
  };
  const visit = (node) => {
    if (
      ts.isImportDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      isSupportElement(node)
    )
      return;
    if (
      ts.isJsxAttribute(node) &&
      NON_VISIBLE_ATTRIBUTES.has(node.name.getText())
    )
      return;
    // `x === "failed"` style comparisons and object keys are identifiers.
    if (ts.isPropertyAssignment(node)) {
      visit(node.initializer);
      return;
    }
    if (ts.isElementAccessExpression(node)) return;
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText();
      if (/^(cn|cva|clsx|Symbol|new Date|localStorage\.\w+)$/.test(callee))
        return;
    }
    // "Post #{id}" in JSX is text ending in "#" followed by an expression.
    if (ts.isJsxText(node))
      push(
        node,
        /#\s*$/.test(node.text) ? `${node.text.trimEnd()}{}` : node.text,
      );
    else if (ts.isStringLiteral(node)) push(node, node.text);
    else if (
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node)
    ) {
      push(node, templateText(node));
      if (ts.isTemplateExpression(node))
        for (const span of node.templateSpans) visit(span.expression);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

export function findViolations(fileName, sourceText) {
  const violations = [];
  for (const { line, text } of extractVisibleStrings(fileName, sourceText)) {
    for (const term of BANNED_TERMS) {
      if (term.pattern.test(text)) {
        violations.push({ file: fileName, line, text, say: term.say });
        break;
      }
    }
  }
  return violations;
}

function listFiles(root) {
  const dirs = [path.join(root, "src", "components")];
  const featuresDir = path.join(root, "src", "features");
  for (const feature of fs.readdirSync(featuresDir).sort()) {
    const dir = path.join(featuresDir, feature, "components");
    if (fs.existsSync(dir)) dirs.push(dir);
  }
  const files = [];
  const walk = (dir) => {
    for (const entry of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (isScannedSource(entry.name)) files.push(full);
    }
  };
  for (const dir of dirs) walk(dir);
  return files;
}

const hasReason = (a) => typeof a.reason === "string" && a.reason.trim() !== "";

export function checkGlossary(root, allowances = ALLOWANCES) {
  const missingReason = allowances.filter((a) => !hasReason(a));
  const used = new Set();
  const violations = [];
  for (const file of listFiles(root)) {
    const rel = path.relative(root, file).replaceAll("\\", "/");
    for (const v of findViolations(rel, fs.readFileSync(file, "utf8"))) {
      const allowance = allowances.find(
        (a) => a.file === rel && a.text === v.text,
      );
      if (allowance) used.add(allowance);
      else violations.push(v);
    }
  }
  const stale = allowances.filter((a) => !used.has(a));
  return { violations, stale, missingReason };
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { violations, stale, missingReason } = checkGlossary(root);
  for (const v of violations)
    console.error(`${v.file}:${v.line}: "${v.text}" → say ${v.say}`);
  for (const a of stale)
    console.error(`stale glossary allowance: ${a.file}: "${a.text}"`);
  for (const a of missingReason)
    console.error(`glossary allowance missing reason: ${a.file}: "${a.text}"`);
  if (violations.length || stale.length || missingReason.length) {
    console.error(
      `\n${violations.length} glossary violation(s), ${stale.length} stale allowance(s), ${missingReason.length} allowance(s) missing a reason. See docs/glossary.md.`,
    );
    return 1;
  }
  console.log("Glossary check passed.");
  return 0;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main();
}
