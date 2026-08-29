import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

export const CODE_STYLE_BASELINE_PATH = "scripts/code-style-baseline.json";
export const CODE_STYLE_RULES = [
  "classes",
  "assertions",
  "satisfies",
  "internalBarrels",
  "internalBarrelImports",
  "crossOwnerRelativeImports",
  "styleOrder",
  "packageSideEffects"
] as const;

const RULE_LABELS = {
  classes: "class declarations",
  assertions: "non-literal type assertions",
  satisfies: "satisfies expressions",
  internalBarrels: "non-public barrel modules",
  internalBarrelImports: "relative imports from barrel modules",
  crossOwnerRelativeImports: "cross-owner relative imports",
  styleOrder: "StyleX declarations below exported components",
  packageSideEffects: "published barrels without a sideEffects policy"
};
const SOURCE_PATTERN = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
const DECLARATION_PATTERN = /\.d\.(?:[cm]?ts|tsx)$/i;
const GENERATED_PATH_PATTERN = /(?:^|\/)(?:browser|coverage|dist|node_modules|\.git|\.local)(?:\/|$)|\.generated\.[^/]+$/i;
const SOURCE_ROOT_PATTERNS = [
  /^packages\/(?!engine\/)/,
  /^packages\/engine\/(?:src|scripts|examples)\//,
  /^apps\/harness\/cli\/src\//,
  /^apps\/harness\/scripts\//,
  /^apps\/harness\/ui\/src\//,
  /^apps\/engine-editor\//,
  /^scripts\//
];

function createCounts() {
  return {
    classes: 0,
    assertions: 0,
    satisfies: 0,
    internalBarrels: 0,
    internalBarrelImports: 0,
    crossOwnerRelativeImports: 0,
    styleOrder: 0,
    packageSideEffects: 0
  };
}

export type CodeStyleCounts = ReturnType<typeof createCounts>;
export type CodeStyleRule = (typeof CODE_STYLE_RULES)[number];

function createBaselineShape(entries: Record<string, Partial<CodeStyleCounts>> = {}) {
  return { version: 1 as const, entries };
}

export type CodeStyleBaseline = ReturnType<typeof createBaselineShape>;

export function normalizeCodeStylePath(filePath: string) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function collectLocalCodeStyleCounts(filePath: string, source: string) {
  const normalized = normalizeCodeStylePath(filePath);
  const sourceFile = parseSource(normalized, source);
  const counts = createCounts();

  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) counts.classes += 1;
    if ((ts.isAsExpression(node) && !isConstAssertion(node)) || ts.isTypeAssertionExpression(node)) counts.assertions += 1;
    if (ts.isSatisfiesExpression(node)) counts.satisfies += 1;
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  counts.styleOrder = countLateStyleDeclarations(sourceFile);
  return counts;
}

export function collectCodeStyleEntries(files: ReadonlyMap<string, string>) {
  const normalizedFiles = new Map(
    [...files].map(([filePath, source]) => [normalizeCodeStylePath(filePath), source])
  );
  const sourceFiles = new Map(
    [...normalizedFiles]
      .filter(([filePath]) => isSourcePath(filePath))
      .map(([filePath, source]) => [filePath, parseSource(filePath, source)])
  );
  const packages = collectPackages(normalizedFiles, new Set(sourceFiles.keys()));
  const publicSources = new Set(packages.flatMap((pkg) => pkg.publicSources));
  const packageRoots = packages.map((pkg) => pkg.root).sort((left, right) => right.length - left.length);
  const pureBarrels = new Set(
    [...sourceFiles]
      .filter(([, sourceFile]) => isPureBarrel(sourceFile))
      .map(([filePath]) => filePath)
  );
  const entries = new Map<string, CodeStyleCounts>();

  for (const [filePath, source] of normalizedFiles) {
    if (!isSourcePath(filePath)) continue;
    entries.set(filePath, collectLocalCodeStyleCounts(filePath, source));
  }

  for (const barrelPath of pureBarrels) {
    if (publicSources.has(barrelPath)) continue;
    requireCounts(entries, barrelPath).internalBarrels += 1;
  }

  for (const [filePath, sourceFile] of sourceFiles) {
    const counts = requireCounts(entries, filePath);
    for (const specifier of collectRelativeModuleSpecifiers(sourceFile)) {
      const target = resolveSourceModule(filePath, specifier, sourceFiles);
      if (!target) continue;
      if (pureBarrels.has(target)) counts.internalBarrelImports += 1;
      if (findOwner(filePath, packageRoots) !== findOwner(target, packageRoots)) {
        counts.crossOwnerRelativeImports += 1;
      }
    }
  }

  for (const pkg of packages) {
    if (pkg.sideEffectFree || !pkg.publicSources.some((filePath) => pureBarrels.has(filePath))) continue;
    const counts = entries.get(pkg.manifestPath) ?? createCounts();
    counts.packageSideEffects += 1;
    entries.set(pkg.manifestPath, counts);
  }

  return [...entries]
    .map(([filePath, counts]) => ({ path: filePath, counts }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function createCodeStyleBaseline(entries: ReturnType<typeof collectCodeStyleEntries>) {
  const baseline = createBaselineShape();
  for (const entry of entries) {
    const counts = compactCounts(entry.counts);
    if (Object.keys(counts).length) baseline.entries[entry.path] = counts;
  }
  return baseline;
}

export function findCodeStyleViolations(
  entries: ReturnType<typeof collectCodeStyleEntries>,
  baseline: CodeStyleBaseline
) {
  const violations: string[] = [];
  const current = new Map(entries.map((entry) => [entry.path, entry.counts]));
  const paths = new Set([...current.keys(), ...Object.keys(baseline.entries)]);

  for (const filePath of [...paths].sort()) {
    const counts = current.get(filePath) ?? createCounts();
    const limits = baseline.entries[filePath] ?? {};
    for (const rule of CODE_STYLE_RULES) {
      const count = counts[rule];
      const limit = limits[rule] ?? 0;
      if (count > limit) {
        const state = limit ? `grew from ${limit} to ${count}` : `has ${count} new`;
        violations.push(`${filePath} ${state} ${RULE_LABELS[rule]}`);
      } else if (count < limit) {
        violations.push(`${filePath} reduced ${RULE_LABELS[rule]} from ${limit} to ${count}; ratchet the baseline`);
      }
    }
  }
  return violations;
}

export function ratchetCodeStyleBaseline(
  entries: ReturnType<typeof collectCodeStyleEntries>,
  baseline: CodeStyleBaseline
) {
  const current = new Map(entries.map((entry) => [entry.path, entry.counts]));
  const ratcheted = createBaselineShape();
  for (const [filePath, limits] of Object.entries(baseline.entries).sort(([left], [right]) => left.localeCompare(right))) {
    const counts = current.get(filePath) ?? createCounts();
    const next: Partial<CodeStyleCounts> = {};
    for (const rule of CODE_STYLE_RULES) {
      const limit = limits[rule];
      if (!limit) continue;
      const count = Math.min(limit, counts[rule]);
      if (count) next[rule] = count;
    }
    if (Object.keys(next).length) ratcheted.entries[filePath] = next;
  }
  return ratcheted;
}

export function parseCodeStyleBaseline(value: unknown) {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.entries)) {
    throw new Error("Code style baseline must have version 1 and entries");
  }
  const entries: Record<string, Partial<CodeStyleCounts>> = {};
  for (const [rawPath, rawCounts] of Object.entries(value.entries)) {
    const filePath = normalizeCodeStylePath(rawPath);
    if (filePath !== rawPath || !isRecord(rawCounts)) {
      throw new Error(`Code style baseline has an invalid entry: ${rawPath}`);
    }
    const counts: Partial<CodeStyleCounts> = {};
    for (const [rawRule, rawCount] of Object.entries(rawCounts)) {
      if (!isCodeStyleRule(rawRule) || !Number.isInteger(rawCount) || Number(rawCount) <= 0) {
        throw new Error(`Code style baseline has an invalid ${rawRule} count for ${filePath}`);
      }
      counts[rawRule] = Number(rawCount);
    }
    if (!Object.keys(counts).length) throw new Error(`Code style baseline entry is empty: ${filePath}`);
    entries[filePath] = counts;
  }
  return createBaselineShape(entries);
}

export async function collectRepositoryCodeStyle(
  paths: readonly string[],
  readSource: (filePath: string) => Promise<string> = (filePath) => readFile(path.resolve(filePath), "utf8")
) {
  const candidates = paths
    .map(normalizeCodeStylePath)
    .filter((filePath) => isSourcePath(filePath) || isScopedManifest(filePath));
  const loaded = await Promise.all(candidates.map(async (filePath) => {
    try {
      return [filePath, await readSource(filePath)] as const;
    } catch (error) {
      if (isMissingFileError(error)) return undefined;
      throw error;
    }
  }));
  return collectCodeStyleEntries(new Map(loaded.filter((entry) => entry !== undefined)));
}

async function main() {
  const result = Bun.spawnSync({
    cmd: ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    stdout: "pipe",
    stderr: "inherit"
  });
  if (result.exitCode !== 0) throw new Error("Could not enumerate Git candidates");
  const paths = result.stdout.toString().split("\0").filter(Boolean);
  const entries = await collectRepositoryCodeStyle(paths);

  if (process.argv.includes("--initialize")) {
    if (await Bun.file(CODE_STYLE_BASELINE_PATH).exists()) {
      throw new Error(`${CODE_STYLE_BASELINE_PATH} already exists; initialization is one-time only`);
    }
    const baseline = createCodeStyleBaseline(entries);
    await writeBaseline(baseline);
    console.log(`Initialized code style baseline with ${Object.keys(baseline.entries).length} debt-bearing files.`);
    return;
  }

  const baseline = parseCodeStyleBaseline(JSON.parse(await readFile(CODE_STYLE_BASELINE_PATH, "utf8")));
  const currentBaseline = process.argv.includes("--ratchet")
    ? ratchetCodeStyleBaseline(entries, baseline)
    : baseline;
  if (process.argv.includes("--ratchet")) await writeBaseline(currentBaseline);
  const violations = findCodeStyleViolations(entries, currentBaseline);
  if (violations.length) throw new Error(`Code style policy failed:\n${violations.join("\n")}`);
  const debt = Object.values(currentBaseline.entries).reduce(
    (total, counts) => total + Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 0),
    0
  );
  console.log(`Code style policy passed for ${entries.length} files (${debt} ratcheted violations remain).`);
}

function parseSource(filePath: string, source: string) {
  const scriptKind = filePath.endsWith("x")
    ? filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JSX
    : /\.[cm]?js$/i.test(filePath) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
}

function isSourcePath(filePath: string) {
  return SOURCE_PATTERN.test(filePath)
    && !DECLARATION_PATTERN.test(filePath)
    && !GENERATED_PATH_PATTERN.test(filePath)
    && SOURCE_ROOT_PATTERNS.some((pattern) => pattern.test(filePath));
}

function isScopedManifest(filePath: string) {
  if (!filePath.endsWith("/package.json")) return false;
  const root = path.posix.dirname(filePath);
  return root.startsWith("packages/") || root.startsWith("apps/");
}

function isConstAssertion(node: ts.AsExpression) {
  return ts.isTypeReferenceNode(node.type)
    && ts.isIdentifier(node.type.typeName)
    && node.type.typeName.text === "const";
}

function countLateStyleDeclarations(sourceFile: ts.SourceFile) {
  const componentStarts = sourceFile.statements
    .filter(isExportedComponent)
    .map((statement) => statement.getStart(sourceFile));
  if (!componentStarts.length) return 0;
  const firstComponent = Math.min(...componentStarts);
  return sourceFile.statements.filter((statement) =>
    statement.getStart(sourceFile) > firstComponent && containsStylexCreate(statement)
  ).length;
}

function isExportedComponent(statement: ts.Statement) {
  if (!hasExportModifier(statement)) return false;
  if (ts.isFunctionDeclaration(statement)) {
    return Boolean(statement.name && /^[A-Z]/.test(statement.name.text) && containsJsx(statement));
  }
  if (!ts.isVariableStatement(statement)) return false;
  return statement.declarationList.declarations.some((declaration) => {
    const initializer = declaration.initializer;
    return ts.isIdentifier(declaration.name)
      && /^[A-Z]/.test(declaration.name.text)
      && initializer !== undefined
      && containsJsx(initializer);
  });
}

function hasExportModifier(node: ts.Node) {
  return ts.canHaveModifiers(node)
    && Boolean(ts.getModifiers(node)?.some((modifier) =>
      modifier.kind === ts.SyntaxKind.ExportKeyword || modifier.kind === ts.SyntaxKind.DefaultKeyword
    ));
}

function containsJsx(node: ts.Node) {
  let found = false;
  function visit(child: ts.Node) {
    if (found) return;
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  }
  visit(node);
  return found;
}

function containsStylexCreate(node: ts.Node) {
  let found = false;
  function visit(child: ts.Node) {
    if (found) return;
    if (ts.isCallExpression(child)
      && ts.isPropertyAccessExpression(child.expression)
      && ts.isIdentifier(child.expression.expression)
      && child.expression.expression.text === "stylex"
      && child.expression.name.text === "create") {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  }
  visit(node);
  return found;
}

function isPureBarrel(sourceFile: ts.SourceFile) {
  let exportsModule = false;
  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) return false;
    exportsModule = true;
  }
  return exportsModule;
}

function collectRelativeModuleSpecifiers(sourceFile: ts.SourceFile) {
  const specifiers: string[] = [];
  for (const statement of sourceFile.statements) {
    if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
      && statement.moduleSpecifier
      && ts.isStringLiteral(statement.moduleSpecifier)
      && statement.moduleSpecifier.text.startsWith(".")) {
      specifiers.push(statement.moduleSpecifier.text);
    }
  }
  return specifiers;
}

function resolveSourceModule(filePath: string, specifier: string, sourceFiles: ReadonlyMap<string, ts.SourceFile>) {
  const raw = normalizeCodeStylePath(path.posix.join(path.posix.dirname(filePath), specifier));
  const extensionless = raw.replace(/\.(?:[cm]?js|jsx)$/i, "");
  const candidates = [
    raw,
    extensionless,
    ...[".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"].map((extension) => `${extensionless}${extension}`),
    ...["index.ts", "index.tsx", "index.mts", "index.cts", "index.js", "index.jsx"].map((name) => `${extensionless}/${name}`)
  ];
  return candidates.find((candidate) => sourceFiles.has(candidate));
}

function collectPackages(files: ReadonlyMap<string, string>, sourcePaths: ReadonlySet<string>) {
  return [...files]
    .filter(([filePath]) => isScopedManifest(filePath))
    .map(([manifestPath, source]) => collectPackage(manifestPath, source, sourcePaths))
    .filter((pkg) => pkg !== undefined);
}

function collectPackage(manifestPath: string, source: string, sourcePaths: ReadonlySet<string>) {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  const root = path.posix.dirname(manifestPath);
  const targets: string[] = [];
  collectExportTargets(value.exports, targets);
  const publicSources = [...new Set(targets.flatMap((target) => mapPublishedSource(root, target, sourcePaths)))];
  return {
    manifestPath,
    root,
    publicSources,
    sideEffectFree: value.sideEffects === false || Array.isArray(value.sideEffects)
  };
}

function collectExportTargets(value: unknown, targets: string[]) {
  if (typeof value === "string") {
    targets.push(value);
    return;
  }
  if (!isRecord(value)) return;
  for (const target of Object.values(value)) collectExportTargets(target, targets);
}

function mapPublishedSource(root: string, rawTarget: string, sourcePaths: ReadonlySet<string>) {
  const target = rawTarget.replace(/^\.\//, "");
  const candidates = [normalizeCodeStylePath(path.posix.join(root, target))];
  if (/^dist\/src\/.*\.d\.(?:[cm]?ts|tsx)$/i.test(target)) {
    candidates.push(normalizeCodeStylePath(path.posix.join(
      root,
      target.replace(/^dist\/src\//, "src/").replace(/\.d\.(?:[cm]?ts|tsx)$/i, ".ts")
    )));
  }
  return candidates.filter((candidate) => sourcePaths.has(candidate));
}

function findOwner(filePath: string, packageRoots: readonly string[]) {
  return packageRoots.find((root) => filePath === root || filePath.startsWith(`${root}/`)) ?? filePath.split("/", 1)[0] ?? ".";
}

function requireCounts(entries: Map<string, CodeStyleCounts>, filePath: string) {
  const counts = entries.get(filePath);
  if (!counts) throw new Error(`Missing code style counts for ${filePath}`);
  return counts;
}

function compactCounts(counts: CodeStyleCounts) {
  const compact: Partial<CodeStyleCounts> = {};
  for (const rule of CODE_STYLE_RULES) {
    if (counts[rule]) compact[rule] = counts[rule];
  }
  return compact;
}

function isCodeStyleRule(value: string): value is CodeStyleRule {
  return CODE_STYLE_RULES.some((rule) => rule === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function writeBaseline(baseline: CodeStyleBaseline) {
  await writeFile(CODE_STYLE_BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
}

if (import.meta.main) await main();
