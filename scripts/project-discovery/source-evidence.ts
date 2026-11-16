import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const excluded = new Set(["node_modules", "dist", "build", "build-release", "out", "coverage", "generated", "vendor", "third_party", "third-party"]);
const maximumBytes = 1048576;

/** Read authored source only; never evaluate a project expression or follow directory links. */
export async function inspectSourceEvidence({ root, directories }: { root: string; directories: readonly string[] }) {
  const references: { source: string; kind: string; target: string; packageName?: string }[] = [];
  const skipped: string[] = [];
  let scanned = 0;
  let computedImports = 0;
  for (const directory of directories) await visit(directory);
  return { references, scanned, computedImports, skipped };

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      const relative = `${directory}/${entry.name}`;
      if (entry.name.startsWith(".") || excluded.has(entry.name)) continue;
      if (entry.isSymbolicLink()) { skipped.push(relative); continue; }
      if (entry.isDirectory()) { await visit(relative); continue; }
      if (!entry.isFile() || !/\.(?:[cm]?[jt]sx?|cmake)$/.test(entry.name) && entry.name !== "CMakeLists.txt") continue;
      if ((await stat(path.join(root, relative))).size > maximumBytes) { skipped.push(relative); continue; }
      const content = await readFile(path.join(root, relative), "utf8");
      scanned += 1;
      if (entry.name.endsWith(".cmake") || entry.name === "CMakeLists.txt") {
        for (const reference of cmakeReferences(content, relative)) references.push(reference);
      } else {
        const result = scriptReferences(content, relative, root);
        references.push(...result.references);
        computedImports += result.computedImports;
      }
    }
  }
}

function scriptReferences(content: string, file: string, root: string) {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const references: { source: string; kind: string; target: string; packageName?: string }[] = [];
  const pathFunctions = new Map<string, string>();
  const pathNamespaces = new Set<string>();
  let computedImports = 0;
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!["node:path", "path"].includes(statement.moduleSpecifier.text)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (statement.importClause?.name) pathNamespaces.add(statement.importClause.name.text);
    if (bindings && ts.isNamespaceImport(bindings)) pathNamespaces.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) {
      const operation = element.propertyName?.text ?? element.name.text;
      if (["join", "resolve"].includes(operation)) pathFunctions.set(element.name.text, operation);
    }
  }
  walk(source);
  return { references, computedImports };

  function add(node: ts.Node, kind: string, target: string, packageName?: string) {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    references.push({ source: `${file}:${line}`, kind, target, ...(packageName ? { packageName } : {}) });
  }
  function moduleReference(node: ts.Node, specifier: string) {
    if (specifier.startsWith(".")) add(node, "source-import", path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)));
    else if (!specifier.includes(":") && !specifier.startsWith("/")) add(node, "source-import", specifier, specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]);
  }
  function walk(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) moduleReference(node, node.moduleSpecifier.text);
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (expression.kind === ts.SyntaxKind.ImportKeyword) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteralLike(argument)) moduleReference(node, argument.text); else computedImports += 1;
      }
      const operation = ts.isIdentifier(expression) ? pathFunctions.get(expression.text)
        : ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) && pathNamespaces.has(expression.expression.text) ? expression.name.text : undefined;
      if ((operation === "join" || operation === "resolve") && node.arguments[0]?.getText(source) === "import.meta.dir" && node.arguments.slice(1).every(ts.isStringLiteralLike)) {
        const segments = node.arguments.slice(1).filter(ts.isStringLiteralLike).map(argument => argument.text);
        const base = path.resolve(root, path.dirname(file));
        const absolute = operation === "join" ? path.join(base, ...segments) : path.resolve(base, ...segments);
        const target = path.relative(root, absolute).replaceAll("\\", "/");
        if (target && !target.startsWith("../") && !path.isAbsolute(target)) add(node, "literal-build-path", target);
      }
    }
    ts.forEachChild(node, walk);
  }
}

function cmakeReferences(content: string, file: string) {
  const references: { source: string; kind: string; target: string }[] = [];
  // Only self-relative literals are evidence. CMake variables, conditions and commands are never evaluated.
  const withoutBlockComments = content.replace(/#\[(=*)\[[\s\S]*?\]\1\]/g, comment => comment.replace(/[^\r\n]/g, " "));
  for (const [index, line] of withoutBlockComments.split(/\r?\n/).entries()) {
    const code = line.replace(/#.*$/, "");
    for (const match of code.matchAll(/\$\{(CMAKE_CURRENT_SOURCE_DIR|CMAKE_CURRENT_LIST_DIR)\}([^\s"')]+)/g)) {
      if (match[1] === "CMAKE_CURRENT_SOURCE_DIR" && !file.endsWith("/CMakeLists.txt")) continue;
      const suffix = match[2];
      if (!suffix?.startsWith("/") || suffix.includes("${")) continue;
      const target = path.posix.normalize(path.posix.dirname(file) + suffix);
      if (!target.startsWith("../")) references.push({ source: `${file}:${index + 1}`, kind: "cmake-path", target });
    }
  }
  return references;
}
