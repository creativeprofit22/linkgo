import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const TRANSACTION_PREFIX = /^\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i;

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function propertyNameText(name, sourceFile) {
  if (!name) return undefined;
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return name.getText(sourceFile);
}

function enclosingOwner(node, sourceFile) {
  for (let current = node.parent; current; current = current.parent) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isGetAccessorDeclaration(current) ||
      ts.isSetAccessorDeclaration(current)
    ) {
      const name = propertyNameText(current.name, sourceFile);
      if (name) return name;
    }
    if (ts.isConstructorDeclaration(current)) return "constructor";
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      if (current.name) return current.name.text;
      const parent = current.parent;
      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
      }
      if (ts.isPropertyAssignment(parent)) {
        return propertyNameText(parent.name, sourceFile) ?? "<anonymous>";
      }
    }
  }
  return "<module>";
}

function databaseReceiver(call) {
  let receiver;
  if (ts.isPropertyAccessExpression(call.expression)) {
    if (call.expression.name.text !== "execute") return undefined;
    receiver = call.expression.expression;
  } else if (ts.isElementAccessExpression(call.expression)) {
    if (staticStringValue(call.expression.argumentExpression) !== "execute") {
      return undefined;
    }
    receiver = call.expression.expression;
  }

  if (!receiver) return undefined;
  const receiverName = ts.isIdentifier(receiver)
    ? receiver.text
    : ts.isPropertyAccessExpression(receiver)
      ? receiver.name.text
      : undefined;
  return /^(db|database)$/i.test(receiverName ?? "") ? receiver : undefined;
}

function staticStringValue(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function transactionPrefix(node) {
  const staticValue = staticStringValue(node);
  if (staticValue !== undefined)
    return TRANSACTION_PREFIX.exec(staticValue)?.[1];
  if (ts.isTemplateExpression(node)) {
    return TRANSACTION_PREFIX.exec(node.head.text)?.[1];
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    return transactionPrefix(node.left);
  }
  return undefined;
}

function normalizeStatement(sql) {
  return sql
    .trim()
    .replace(/;\s*$/, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function statementHash(statement) {
  return createHash("sha256").update(statement).digest("hex").slice(0, 16);
}

export function scanSourceText(relativePath, sourceText) {
  const scriptKind = relativePath.toLowerCase().endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    relativePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const sites = [];
  const errors = [];

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      databaseReceiver(node) &&
      node.arguments[0]
    ) {
      const argument = node.arguments[0];
      const sql = staticStringValue(argument);
      const prefix = transactionPrefix(argument);
      const location = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(),
      );
      if (sql === undefined && prefix) {
        errors.push(
          `${normalizePath(relativePath)}:${location.line + 1} uses dynamic ${prefix.toUpperCase()} SQL in database.execute()`,
        );
      } else if (sql !== undefined && prefix) {
        const statement = normalizeStatement(sql);
        sites.push({
          path: normalizePath(relativePath),
          owner: enclosingOwner(node, sourceFile),
          command: statement.split(" ", 1)[0],
          hash: statementHash(statement),
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { sites, errors };
}

export function createSignatures(sites) {
  return sites
    .map(
      (site) =>
        `${site.path} :: ${site.owner} :: ${site.command} :: ${site.hash}`,
    )
    .sort();
}

// Zero tolerance: renderer code may not manage transactions at all.
export function evaluateSignatures(discovered, errors = []) {
  return {
    ok: discovered.length === 0 && errors.length === 0,
    unexpected: [...discovered],
    errors,
  };
}

async function sourceFilesUnder(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFilesUnder(entryPath)));
    else if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(path.extname(entry.name))
    ) {
      files.push(entryPath);
    }
  }
  return files;
}

/**
 * Renderer SQL access is forbidden outright: no SQL plugin import, no removed
 * database helper import, and no `plugin:sql|*` command text. Persistence
 * goes through feature-specific native commands.
 */
const FORBIDDEN_SQL_ACCESS = [
  {
    pattern: /["'`]@tauri-apps\/plugin-sql["'`]/,
    label: "@tauri-apps/plugin-sql import",
  },
  { pattern: /["'`]@\/lib\/db["'`]/, label: "@/lib/db import" },
  { pattern: /plugin:sql\|/, label: "plugin:sql command" },
];

export function scanSqlAccess(relativePath, sourceText) {
  const findings = [];
  const lines = sourceText.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const { pattern, label } of FORBIDDEN_SQL_ACCESS) {
      if (pattern.test(line)) {
        findings.push(
          `${normalizePath(relativePath)}:${index + 1} renderer SQL access (${label})`,
        );
      }
    }
  });
  return findings;
}

export async function scanRendererTransactions(rootDirectory) {
  const files = await sourceFilesUnder(path.join(rootDirectory, "src"));
  const sites = [];
  const errors = [];
  for (const filePath of files) {
    const relativePath = path.relative(rootDirectory, filePath);
    const sourceText = await fs.readFile(filePath, "utf8");
    const result = scanSourceText(relativePath, sourceText);
    sites.push(...result.sites);
    errors.push(...result.errors);
    errors.push(...scanSqlAccess(relativePath, sourceText));
  }
  return { signatures: createSignatures(sites), errors };
}

export function formatComparison(discovered, comparison) {
  const lines = [`Renderer transaction sites: ${discovered.length} current.`];
  if (comparison.errors.length) {
    lines.push("Dynamic transaction SQL is forbidden:");
    lines.push(...comparison.errors.map((error) => `  - ${error}`));
  }
  if (comparison.unexpected.length) {
    lines.push("Forbidden renderer-managed transaction entries:");
    lines.push(...comparison.unexpected.map((signature) => `  - ${signature}`));
  }
  if (!comparison.ok) {
    lines.push(
      "Renderer transactions are forbidden; move the mutation into a feature-scoped native command.",
    );
  }
  return lines.join("\n");
}

async function main() {
  const rootDirectory = path.resolve(
    fileURLToPath(new URL("..", import.meta.url)),
  );
  const { signatures, errors } = await scanRendererTransactions(rootDirectory);
  const comparison = evaluateSignatures(signatures, errors);
  console[comparison.ok ? "log" : "error"](
    formatComparison(signatures, comparison),
  );
  if (!comparison.ok) process.exitCode = 1;
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  main().catch((error) => {
    console.error(`Renderer transaction check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
