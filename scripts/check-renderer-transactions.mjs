import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const TRANSACTION_PREFIX = /^\s*(BEGIN|COMMIT|ROLLBACK)\b/i;

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

export function compareSignatures(discovered, allowlisted, errors = []) {
  const remaining = new Map();
  for (const signature of allowlisted) {
    remaining.set(signature, (remaining.get(signature) ?? 0) + 1);
  }
  const unexpected = [];
  for (const signature of discovered) {
    const count = remaining.get(signature) ?? 0;
    if (count === 0) unexpected.push(signature);
    else remaining.set(signature, count - 1);
  }
  return {
    ok: unexpected.length === 0 && errors.length === 0,
    unexpected,
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

export async function scanRendererTransactions(rootDirectory) {
  const files = await sourceFilesUnder(path.join(rootDirectory, "src"));
  const sites = [];
  const errors = [];
  for (const filePath of files) {
    const result = scanSourceText(
      path.relative(rootDirectory, filePath),
      await fs.readFile(filePath, "utf8"),
    );
    sites.push(...result.sites);
    errors.push(...result.errors);
  }
  return { signatures: createSignatures(sites), errors };
}

export function formatComparison(discovered, allowlisted, comparison) {
  const lines = [
    `Renderer transaction sites: ${discovered.length} current, ${allowlisted.length} allowlisted.`,
  ];
  if (comparison.errors.length) {
    lines.push("Dynamic transaction SQL is forbidden:");
    lines.push(...comparison.errors.map((error) => `  - ${error}`));
  }
  if (comparison.unexpected.length) {
    lines.push("Unexpected renderer-managed transaction entries:");
    lines.push(...comparison.unexpected.map((signature) => `  - ${signature}`));
  }
  if (!comparison.ok) {
    lines.push(
      "Migrate each mutation to a native, connection-affine command; do not expand the allowlist for new transaction sites.",
    );
  }
  return lines.join("\n");
}

async function main() {
  const rootDirectory = path.resolve(
    fileURLToPath(new URL("..", import.meta.url)),
  );
  const allowlistPath = path.join(
    rootDirectory,
    "scripts",
    "renderer-transaction-allowlist.json",
  );
  const allowlisted = JSON.parse(await fs.readFile(allowlistPath, "utf8"));
  if (
    !Array.isArray(allowlisted) ||
    !allowlisted.every((item) => typeof item === "string")
  ) {
    throw new TypeError(
      "Renderer transaction allowlist must be an array of strings.",
    );
  }

  const { signatures, errors } = await scanRendererTransactions(rootDirectory);
  const comparison = compareSignatures(signatures, allowlisted, errors);
  console[comparison.ok ? "log" : "error"](
    formatComparison(signatures, allowlisted, comparison),
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
