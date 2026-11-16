import { readdir, readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import ts from "typescript";

const roots = ["apps", "packages", "scripts", ".agents"];
const ignoredDirectories = new Set(["node_modules", ".git", ".local", "dist", "build", "browser", "coverage", "assets"]);
const processFunctions = new Set(["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]);

/** Reject process launches that can create an unsolicited Windows console. */
export function inspectProcessPolicy({ file, source, enforceHeadless = true }: { file: string; source: string; enforceHeadless?: boolean }) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imported = new Set<string>();
  const namespaces = new Set<string>();
  const bunNamespaces = new Set(["Bun"]);
  const bunFunctions = new Set<string>();
  let hasBrowserDriver = false;
  const bindings = new Map<string, ts.Expression>();
  const violations: Array<{ file: string; line: number; start: number; end: number; reason: string }> = [];
  const normalizedFile = file.replaceAll("\\", "/");

  function moduleName(expression: ts.Expression): string | undefined {
    if (ts.isParenthesizedExpression(expression)) return moduleName(expression.expression);
    if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && /^(?:__toESM|__importDefault|__importStar)$/.test(expression.expression.text) && expression.arguments[0]) return moduleName(expression.arguments[0]);
    if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "require" && expression.arguments[0] && ts.isStringLiteral(expression.arguments[0])) return expression.arguments[0].text;
    return undefined;
  }

  function collect(node: ts.Node) {
    if (ts.isStringLiteral(node) && /^(?:playwright(?:-core)?|puppeteer(?:-core)?)$/.test(node.text)
      && (ts.isImportDeclaration(node.parent) || ts.isCallExpression(node.parent))) hasBrowserDriver = true;
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && /^(?:(?:node:)?child_process|cross-spawn)$/.test(node.moduleSpecifier.text)) {
      const clause = node.importClause;
      if (clause?.name) {
        namespaces.add(clause.name.text);
        if (node.moduleSpecifier.text === "cross-spawn") imported.add(clause.name.text);
      }
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) namespaces.add(clause.namedBindings.name.text);
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const item of clause.namedBindings.elements) if (processFunctions.has((item.propertyName ?? item.name).text)) imported.add(item.name.text);
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) bindings.set(node.name.text, node.initializer);
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "bun") {
      const clause = node.importClause;
      if (clause?.name) bunNamespaces.add(clause.name.text);
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) bunNamespaces.add(clause.namedBindings.name.text);
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const item of clause.namedBindings.elements) if (/^(spawn|spawnSync)$/.test((item.propertyName ?? item.name).text)) bunFunctions.add(item.name.text);
      }
    }
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const module = moduleName(node.initializer);
      const fromBun = module === "bun" || ts.isIdentifier(node.initializer) && bunNamespaces.has(node.initializer.text);
      if (fromBun || module && /^(?:(?:node:)?child_process|cross-spawn)$/.test(module)) {
        if (ts.isIdentifier(node.name)) (fromBun ? bunNamespaces : namespaces).add(node.name.text);
        if (module === "cross-spawn" && ts.isIdentifier(node.name)) imported.add(node.name.text);
        if (ts.isObjectBindingPattern(node.name)) {
          for (const item of node.name.elements) {
            const name = item.propertyName ?? item.name;
            if (ts.isIdentifier(name) && ts.isIdentifier(item.name) && (fromBun ? /^(spawn|spawnSync)$/.test(name.text) : processFunctions.has(name.text))) (fromBun ? bunFunctions : imported).add(item.name.text);
          }
        }
      }
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
      const module = moduleName(node.right);
      bindings.set(node.left.text, node.right);
      if (module && /^(?:(?:node:)?child_process|cross-spawn)$/.test(module)) namespaces.add(node.left.text);
    }
    ts.forEachChild(node, collect);
  }
  collect(ast);
  for (const [name, initializer] of bindings) {
    const wrapped = callable(initializer);
    const target = ts.isCallExpression(wrapped) && /promisify$/.test(callable(wrapped.expression).getText(ast)) ? wrapped.arguments[0] : wrapped;
    if (target && ts.isPropertyAccessExpression(target) && isNamespace(target.expression) && processFunctions.has(target.name.text)) imported.add(name);
  }

  function hasTrueOption(expression: ts.Expression | undefined, option: string, seen = new Set<string>()): boolean {
    if (!expression) return false;
    if (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isParenthesizedExpression(expression)) return hasTrueOption(expression.expression, option, seen);
    if (ts.isIdentifier(expression)) {
      if (seen.has(expression.text)) return false;
      seen.add(expression.text);
      return hasTrueOption(bindings.get(expression.text), option, seen);
    }
    if (!ts.isObjectLiteralExpression(expression)) return false;
    let hidden = false;
    for (const property of expression.properties) {
      if (ts.isSpreadAssignment(property)) hidden = hasTrueOption(property.expression, option, new Set(seen));
      else if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === option) {
        hidden = property.initializer.kind === ts.SyntaxKind.TrueKeyword;
      }
    }
    return hidden;
  }

  function report(node: ts.Node, reason: string) {
    violations.push({ file, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, start: node.getStart(ast), end: node.end, reason });
  }
  function callable(expression: ts.Expression): ts.Expression {
    if (ts.isParenthesizedExpression(expression)) return callable(expression.expression);
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken) return callable(expression.right);
    return expression;
  }
  function isNamespace(expression: ts.Expression): boolean {
    return ts.isIdentifier(expression) ? namespaces.has(expression.text)
      : ts.isPropertyAccessExpression(expression) && expression.name.text === "default" && isNamespace(expression.expression);
  }
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const call = callable(node.expression);
      if (ts.isIdentifier(call) && bunFunctions.has(call.text) || ts.isPropertyAccessExpression(call) && ts.isIdentifier(call.expression) && bunNamespaces.has(call.expression.text) && /^(spawn|spawnSync)$/.test(call.name.text)) {
        // The PTY is an intentional in-app terminal, not a desktop console window.
        const pty = normalizedFile === "apps/harness/cli/src/terminal/terminal-session-manager.ts" && node.arguments.some((argument) => ts.isObjectLiteralExpression(argument) && argument.properties.some((property) => ts.isPropertyAssignment(property) && property.name.getText(ast) === "terminal"));
        if (!pty) report(node, "Use @hyperfocus/desktop-runtime/process: Bun.spawn does not provide verified Windows console hiding.");
      }
      const nodeProcess = ts.isIdentifier(call) ? imported.has(call.text)
        : ts.isPropertyAccessExpression(call) && isNamespace(call.expression) && (processFunctions.has(call.name.text) || call.name.text === "sync");
      if (nodeProcess && !node.arguments.some((argument) => hasTrueOption(argument, "windowsHide"))) report(node, "node:child_process launches require explicit windowsHide: true or the shared background process API.");
      if (enforceHeadless && hasBrowserDriver && ts.isPropertyAccessExpression(call) && /^(launch|launchPersistentContext)$/.test(call.name.text)
        && !node.arguments.some((argument) => hasTrueOption(argument, "headless"))) report(node, "Browser automation requires explicit headless: true or the shared owned headless-browser API.");
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return violations;
}

async function sourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) files.push(...await sourceFiles(resolve(directory, entry.name)));
    else if (entry.isFile() && /\.(?:[cm]?ts|tsx|[cm]?js|jsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) files.push(resolve(directory, entry.name));
  }
  return files;
}

export async function checkProcessPolicy({ root = process.cwd() } = {}) {
  const files = (await Promise.all(roots.map((directory) => sourceFiles(resolve(root, directory))))).flat();
  const checks = await Promise.all(files.map(async (file) => inspectProcessPolicy({ file: relative(root, file), source: await readFile(file, "utf8") })));
  return { filesChecked: files.length, violations: checks.flat() };
}

if (import.meta.main) {
  const result = await checkProcessPolicy();
  if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else {
    for (const failure of result.violations) console.error(`${failure.file}:${failure.line}: ${failure.reason}`);
    console.log(`Process policy: ${result.filesChecked} files, ${result.violations.length} violations.`);
  }
  process.exitCode = result.violations.length ? 1 : 0;
}
