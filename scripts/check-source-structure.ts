import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { isWebsiteArchiveCode } from './source-artifacts';

export const PRODUCTION_SOURCE_LINE_LIMIT = 1_000;
export const TEST_SOURCE_LINE_LIMIT = 1_500;
export const DATA_CATALOG_SOURCE_LINE_LIMIT = 2_000;
export const DECLARATION_WARNING_LINE_LIMIT = 200;
export const DECLARATION_LINE_LIMIT = 400;
export const SOURCE_DIRECTORY_FILE_LIMIT = 25;
export const SOURCE_STRUCTURE_BASELINE_PATH = "scripts/source-structure-baseline.json";

const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
const TEST_FILE_PATTERN = /(?:^|\/)(?:__tests__|test|tests|test-support)(?:\/|$)|\.(?:spec|test)\.(?:[cm]?[jt]s|[jt]sx)$/i;

export interface SourceStructureEntry {
  path: string;
  lineCount: number;
}

export interface SourceStructureException {
  maxLines: number;
  owner: string;
  reason: string;
  boundary: string;
  removalTarget: string;
}

export interface SourceDirectoryException {
  maxFiles: number;
  owner: string;
  reason: string;
  boundary: string;
  removalTarget: string;
}

export interface SourceDeclarationEntry {
  id: string;
  path: string;
  name: string;
  kind: "class" | "component" | "function";
  startLine: number;
  lineCount: number;
}

export interface SourceDeclarationDeferral {
  pathPrefix: string;
  owner: string;
  reason: string;
  boundary: string;
  removalTarget: string;
}

export interface SourceStructureBaseline {
  version: 1;
  exceptions: Record<string, SourceStructureException>;
  directoryExceptions: Record<string, SourceDirectoryException>;
  declarationExceptions: Record<string, SourceStructureException>;
  declarationWarningBaselines: Record<string, SourceStructureException>;
  declarationDeferrals: readonly SourceDeclarationDeferral[];
}

export function normalizeSourcePath(filePath: string) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function countPhysicalLines(source: string) {
  if (!source) return 0;
  const lineCount = source.split(/\r\n|\n|\r/).length;
  return /(?:\r\n|\n|\r)$/.test(source) ? lineCount - 1 : lineCount;
}

export function getSourceLineLimit(filePath: string) {
  const normalized = normalizeSourcePath(filePath);
  if (!SOURCE_FILE_PATTERN.test(normalized) || isWebsiteArchiveCode(normalized)) return undefined;
  if (/\/proto\/generated\/[^/]+-pb\.ts$/i.test(normalized)) return undefined;
  if (/\.data\.ts$/i.test(normalized)) return DATA_CATALOG_SOURCE_LINE_LIMIT;
  if (TEST_FILE_PATTERN.test(normalized)) return TEST_SOURCE_LINE_LIMIT;
  return PRODUCTION_SOURCE_LINE_LIMIT;
}

export function findSourceStructureViolations(
  entries: readonly SourceStructureEntry[],
  baseline: SourceStructureBaseline,
  declarations: readonly SourceDeclarationEntry[] = []
) {
  const violations: string[] = [];
  const currentEntries = new Map(entries.map((entry) => [normalizeSourcePath(entry.path), entry]));

  for (const [filePath, rawEntry] of [...currentEntries].sort(([left], [right]) => left.localeCompare(right))) {
    const limit = getSourceLineLimit(filePath);
    if (limit === undefined) continue;
    const entry = { ...rawEntry, path: filePath };
    const exception = baseline.exceptions[filePath];

    if (entry.lineCount <= limit) {
      if (exception) {
        violations.push(`${filePath} is now ${entry.lineCount} lines (limit ${limit}); remove its stale baseline exception`);
      }
      continue;
    }
    if (!exception) {
      violations.push(`${filePath} is ${entry.lineCount} lines (limit ${limit}) and has no approved baseline exception`);
      continue;
    }
    if (entry.lineCount > exception.maxLines) {
      violations.push(`${filePath} grew to ${entry.lineCount} lines (baseline ${exception.maxLines}, limit ${limit})`);
      continue;
    }
    if (entry.lineCount < exception.maxLines) {
      violations.push(`${filePath} shrank to ${entry.lineCount} lines; ratchet its baseline down from ${exception.maxLines}`);
    }
  }

  for (const filePath of Object.keys(baseline.exceptions).sort()) {
    if (!currentEntries.has(filePath)) violations.push(`${filePath} no longer exists; remove its stale baseline exception`);
  }
  const directoryCounts = countSourceFilesByDirectory(entries);
  for (const [directoryPath, fileCount] of [...directoryCounts].sort(([left], [right]) => left.localeCompare(right))) {
    const exception = baseline.directoryExceptions[directoryPath];
    if (fileCount <= SOURCE_DIRECTORY_FILE_LIMIT) {
      if (exception) {
        violations.push(`${directoryPath} now contains ${fileCount} source files (limit ${SOURCE_DIRECTORY_FILE_LIMIT}); remove its stale directory exception`);
      }
      continue;
    }
    if (!exception) {
      violations.push(`${directoryPath} contains ${fileCount} source files (limit ${SOURCE_DIRECTORY_FILE_LIMIT}) and has no approved directory exception`);
      continue;
    }
    if (fileCount > exception.maxFiles) {
      violations.push(`${directoryPath} grew to ${fileCount} source files (baseline ${exception.maxFiles}, limit ${SOURCE_DIRECTORY_FILE_LIMIT})`);
      continue;
    }
    if (fileCount < exception.maxFiles) {
      violations.push(`${directoryPath} shrank to ${fileCount} source files; ratchet its directory baseline down from ${exception.maxFiles}`);
    }
  }
  for (const directoryPath of Object.keys(baseline.directoryExceptions).sort()) {
    if (!directoryCounts.has(directoryPath)) {
      violations.push(`${directoryPath} no longer contains source files; remove its stale directory exception`);
    }
  }
  const currentDeclarations = new Map(declarations.map((entry) => [entry.id, entry]));
  for (const declaration of [...declarations].sort((left, right) => left.id.localeCompare(right.id))) {
    if (isDeclarationDeferred(declaration, baseline)) continue;
    const exception = baseline.declarationExceptions[declaration.id];
    if (declaration.lineCount <= DECLARATION_LINE_LIMIT) {
      if (exception) {
        violations.push(`${declaration.id} is now ${declaration.lineCount} lines (limit ${DECLARATION_LINE_LIMIT}); remove its stale declaration exception`);
      }
      continue;
    }
    if (!exception) {
      violations.push(`${declaration.id} is ${declaration.lineCount} lines (limit ${DECLARATION_LINE_LIMIT}) and has no approved declaration exception`);
      continue;
    }
    if (declaration.lineCount > exception.maxLines) {
      violations.push(`${declaration.id} grew to ${declaration.lineCount} lines (baseline ${exception.maxLines}, limit ${DECLARATION_LINE_LIMIT})`);
      continue;
    }
    if (declaration.lineCount < exception.maxLines) {
      violations.push(`${declaration.id} shrank to ${declaration.lineCount} lines; ratchet its declaration baseline down from ${exception.maxLines}`);
    }
  }
  for (const declarationId of Object.keys(baseline.declarationExceptions).sort()) {
    if (!currentDeclarations.has(declarationId)) {
      violations.push(`${declarationId} no longer exists; remove its stale declaration exception`);
    }
  }
  for (const [declarationId, exception] of Object.entries(baseline.declarationWarningBaselines).sort(([left], [right]) => left.localeCompare(right))) {
    const declaration = currentDeclarations.get(declarationId);
    if (!declaration) {
      violations.push(`${declarationId} no longer exists; remove its stale declaration warning baseline`);
      continue;
    }
    if (isDeclarationDeferred(declaration, baseline)) continue;
    if (declaration.lineCount <= DECLARATION_WARNING_LINE_LIMIT) {
      violations.push(`${declarationId} is now ${declaration.lineCount} lines (warning threshold ${DECLARATION_WARNING_LINE_LIMIT}); remove its stale declaration warning baseline`);
      continue;
    }
    if (declaration.lineCount > DECLARATION_LINE_LIMIT) {
      violations.push(`${declarationId} is now ${declaration.lineCount} lines (limit ${DECLARATION_LINE_LIMIT}); replace its declaration warning baseline with a declaration exception`);
      continue;
    }
    if (declaration.lineCount > exception.maxLines) {
      violations.push(`${declarationId} grew to ${declaration.lineCount} lines (warning baseline ${exception.maxLines}, limit ${DECLARATION_LINE_LIMIT})`);
      continue;
    }
    if (declaration.lineCount < exception.maxLines) {
      violations.push(`${declarationId} shrank to ${declaration.lineCount} lines; ratchet its declaration warning baseline down from ${exception.maxLines}`);
    }
  }
  return violations;
}

export function findSourceStructureWarnings(
  declarations: readonly SourceDeclarationEntry[],
  baseline: SourceStructureBaseline
) {
  return declarations
    .filter((entry) => !isDeclarationDeferred(entry, baseline))
    .filter((entry) => baseline.declarationWarningBaselines[entry.id] === undefined)
    .filter((entry) => entry.lineCount > DECLARATION_WARNING_LINE_LIMIT && entry.lineCount <= DECLARATION_LINE_LIMIT)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((entry) => `${entry.id} is ${entry.lineCount} lines (warning threshold ${DECLARATION_WARNING_LINE_LIMIT}, limit ${DECLARATION_LINE_LIMIT})`);
}

export function ratchetSourceStructureBaseline(
  entries: readonly SourceStructureEntry[],
  baseline: SourceStructureBaseline,
  declarations: readonly SourceDeclarationEntry[] = []
): SourceStructureBaseline {
  const lineCounts = new Map(entries.map((entry) => [normalizeSourcePath(entry.path), entry.lineCount]));
  const exceptions: Record<string, SourceStructureException> = {};
  for (const [filePath, exception] of Object.entries(baseline.exceptions).sort(([left], [right]) => left.localeCompare(right))) {
    const lineCount = lineCounts.get(filePath);
    const limit = getSourceLineLimit(filePath);
    if (lineCount === undefined || limit === undefined || lineCount <= limit) continue;
    exceptions[filePath] = {
      ...exception,
      maxLines: Math.min(exception.maxLines, lineCount)
    };
  }
  const directoryCounts = countSourceFilesByDirectory(entries);
  const directoryExceptions: Record<string, SourceDirectoryException> = {};
  for (const [directoryPath, exception] of Object.entries(baseline.directoryExceptions).sort(([left], [right]) => left.localeCompare(right))) {
    const fileCount = directoryCounts.get(directoryPath);
    if (fileCount === undefined || fileCount <= SOURCE_DIRECTORY_FILE_LIMIT) continue;
    directoryExceptions[directoryPath] = {
      ...exception,
      maxFiles: Math.min(exception.maxFiles, fileCount)
    };
  }
  const declarationLineCounts = new Map(declarations.map((entry) => [entry.id, entry.lineCount]));
  const declarationExceptions: Record<string, SourceStructureException> = {};
  for (const [declarationId, exception] of Object.entries(baseline.declarationExceptions).sort(([left], [right]) => left.localeCompare(right))) {
    const lineCount = declarationLineCounts.get(declarationId);
    if (lineCount === undefined || lineCount <= DECLARATION_LINE_LIMIT) continue;
    declarationExceptions[declarationId] = {
      ...exception,
      maxLines: Math.min(exception.maxLines, lineCount)
    };
  }
  const declarationWarningBaselines: Record<string, SourceStructureException> = {};
  for (const [declarationId, exception] of Object.entries(baseline.declarationWarningBaselines).sort(([left], [right]) => left.localeCompare(right))) {
    const lineCount = declarationLineCounts.get(declarationId);
    if (lineCount === undefined || lineCount <= DECLARATION_WARNING_LINE_LIMIT || lineCount > DECLARATION_LINE_LIMIT) continue;
    declarationWarningBaselines[declarationId] = {
      ...exception,
      maxLines: Math.min(exception.maxLines, lineCount)
    };
  }
  return { version: 1, exceptions, directoryExceptions, declarationExceptions, declarationWarningBaselines, declarationDeferrals: baseline.declarationDeferrals };
}

export function parseSourceStructureBaseline(value: unknown): SourceStructureBaseline {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.exceptions) || !isRecord(value.directoryExceptions) || !isRecord(value.declarationExceptions) || !Array.isArray(value.declarationDeferrals)) {
    throw new Error("Source structure baseline must have version 1, exceptions, directoryExceptions, declarationExceptions, and declarationDeferrals");
  }
  const exceptions: Record<string, SourceStructureException> = {};
  for (const [rawPath, rawException] of Object.entries(value.exceptions)) {
    const filePath = normalizeSourcePath(rawPath);
    if (filePath !== rawPath || getSourceLineLimit(filePath) === undefined) {
      throw new Error(`Source structure exception has an invalid path: ${rawPath}`);
    }
    exceptions[filePath] = parseException(rawException, filePath);
  }
  const directoryExceptions: Record<string, SourceDirectoryException> = {};
  for (const [rawPath, rawException] of Object.entries(value.directoryExceptions)) {
    const directoryPath = normalizeSourcePath(rawPath);
    if (directoryPath !== rawPath || directoryPath === "." || directoryPath.endsWith("/")) {
      throw new Error(`Source directory exception has an invalid path: ${rawPath}`);
    }
    directoryExceptions[directoryPath] = parseDirectoryException(rawException, directoryPath);
  }
  const declarationExceptions: Record<string, SourceStructureException> = {};
  for (const [declarationId, rawException] of Object.entries(value.declarationExceptions)) {
    if (!declarationId.includes("#") || !SOURCE_FILE_PATTERN.test(declarationId.split("#", 1)[0] ?? "")) {
      throw new Error(`Source declaration exception has an invalid id: ${declarationId}`);
    }
    declarationExceptions[declarationId] = parseException(rawException, declarationId);
  }
  const rawDeclarationWarningBaselines = isRecord(value.declarationWarningBaselines) ? value.declarationWarningBaselines : {};
  const declarationWarningBaselines: Record<string, SourceStructureException> = {};
  for (const [declarationId, rawException] of Object.entries(rawDeclarationWarningBaselines)) {
    if (!declarationId.includes("#") || !SOURCE_FILE_PATTERN.test(declarationId.split("#", 1)[0] ?? "")) {
      throw new Error(`Source declaration warning baseline has an invalid id: ${declarationId}`);
    }
    declarationWarningBaselines[declarationId] = parseException(rawException, declarationId);
  }
  const declarationDeferrals = value.declarationDeferrals.map((rawDeferral, index) => parseDeclarationDeferral(rawDeferral, index));
  return { version: 1, exceptions, directoryExceptions, declarationExceptions, declarationWarningBaselines, declarationDeferrals };
}

export function countSourceFilesByDirectory(entries: readonly SourceStructureEntry[]) {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const filePath = normalizeSourcePath(entry.path);
    if (getSourceLineLimit(filePath) === undefined) continue;
    const directoryPath = path.posix.dirname(filePath);
    counts.set(directoryPath, (counts.get(directoryPath) ?? 0) + 1);
  }
  return counts;
}

export function collectSourceDeclarations(filePath: string, source: string) {
  const normalized = normalizeSourcePath(filePath);
  const scriptKind = normalized.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : normalized.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : /\.[cm]?js$/i.test(normalized)
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(normalized, source, ts.ScriptTarget.Latest, true, scriptKind);
  const declarations: SourceDeclarationEntry[] = [];
  const ids = new Map<string, number>();

  function addDeclaration(node: ts.Node, rawName: string, rawKind: SourceDeclarationEntry["kind"], scope: readonly string[]) {
    const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const endLine = sourceFile.getLineAndCharacterOfPosition(Math.max(node.getStart(sourceFile), node.end - 1)).line + 1;
    const name = [...scope, rawName || `<anonymous@${startLine}>`].join(".");
    const kind = rawKind === "function"
      && !ts.isMethodDeclaration(node)
      && !ts.isGetAccessorDeclaration(node)
      && !ts.isSetAccessorDeclaration(node)
      && normalized.endsWith("x")
      && /^[A-Z]/.test(rawName)
      ? "component"
      : rawKind;
    const baseId = `${normalized}#${kind}:${name}`;
    const occurrence = (ids.get(baseId) ?? 0) + 1;
    ids.set(baseId, occurrence);
    declarations.push({
      id: occurrence === 1 ? baseId : `${baseId}[${occurrence}]`,
      path: normalized,
      name,
      kind,
      startLine,
      lineCount: endLine - startLine + 1
    });
    return rawName || `<anonymous@${startLine}>`;
  }

  function visit(node: ts.Node, scope: readonly string[]) {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const className = declarationName(node) || `<anonymous-class@${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}>`;
      addDeclaration(node, className, "class", scope);
      ts.forEachChild(node, (child) => visit(child, [...scope, className]));
      return;
    }
    if (isFunctionDeclarationWithBody(node)) {
      const functionName = declarationName(node);
      if (!functionName) {
        ts.forEachChild(node, (child) => visit(child, scope));
        return;
      }
      const scopeName = addDeclaration(node, functionName, "function", scope);
      ts.forEachChild(node, (child) => visit(child, [...scope, scopeName]));
      return;
    }
    ts.forEachChild(node, (child) => visit(child, scope));
  }

  visit(sourceFile, []);
  return declarations;
}

export async function collectExistingSourceEntries(
  paths: readonly string[],
  readSource: (filePath: string) => Promise<string> = (filePath) => readFile(path.resolve(filePath), "utf8")
) {
  const candidates = await Promise.all(paths.map(async (filePath) => {
    const normalized = normalizeSourcePath(filePath);
    if (getSourceLineLimit(normalized) === undefined) return undefined;
    try {
      return { path: normalized, lineCount: countPhysicalLines(await readSource(normalized)) };
    } catch (error) {
      if (isMissingFileError(error)) return undefined;
      throw error;
    }
  }));
  return candidates.filter((entry): entry is SourceStructureEntry => entry !== undefined);
}

export async function collectExistingSourceStructure(
  paths: readonly string[],
  readSource: (filePath: string) => Promise<string> = (filePath) => readFile(path.resolve(filePath), "utf8")
) {
  const candidates = await Promise.all(paths.map(async (filePath) => {
    const normalized = normalizeSourcePath(filePath);
    if (getSourceLineLimit(normalized) === undefined) return undefined;
    try {
      const source = await readSource(normalized);
      return {
        file: { path: normalized, lineCount: countPhysicalLines(source) },
        declarations: collectSourceDeclarations(normalized, source)
      };
    } catch (error) {
      if (isMissingFileError(error)) return undefined;
      throw error;
    }
  }));
  const existing = candidates.filter((entry) => entry !== undefined);
  return {
    files: existing.map((entry) => entry.file),
    declarations: existing.flatMap((entry) => entry.declarations)
  };
}

async function main() {
  const result = spawnBackgroundProcessSync({
    cmd: ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    stdout: "pipe",
    stderr: "inherit"
  });
  if (result.exitCode !== 0) throw new Error("Could not enumerate Git candidates");
  const paths = result.stdout.toString().split("\0").filter(Boolean);
  const structure = await collectExistingSourceStructure(paths);
  const baseline = parseSourceStructureBaseline(JSON.parse(await readFile(SOURCE_STRUCTURE_BASELINE_PATH, "utf8")));

  if (process.argv.includes("--ratchet")) {
    const ratcheted = ratchetSourceStructureBaseline(structure.files, baseline, structure.declarations);
    await writeFile(SOURCE_STRUCTURE_BASELINE_PATH, `${JSON.stringify(ratcheted, null, 2)}\n`);
    console.log(`Ratcheted source structure baseline to ${Object.keys(ratcheted.exceptions).length} file, ${Object.keys(ratcheted.directoryExceptions).length} directory, and ${Object.keys(ratcheted.declarationWarningBaselines).length} declaration warning exceptions.`);
  }

  const currentBaseline = process.argv.includes("--ratchet")
    ? ratchetSourceStructureBaseline(structure.files, baseline, structure.declarations)
    : baseline;
  const warnings = findSourceStructureWarnings(structure.declarations, currentBaseline);
  for (const warning of warnings) console.warn(`Source structure warning: ${warning}`);
  const violations = findSourceStructureViolations(structure.files, currentBaseline, structure.declarations);
  if (violations.length) throw new Error(`Source structure policy failed:\n${violations.join("\n")}`);
  console.log(`Source structure policy passed for ${structure.files.length} files and ${structure.declarations.length} declarations (${warnings.length} warnings).`);
}

function parseException(value: unknown, id: string): SourceStructureException {
  if (!isRecord(value) || !Number.isInteger(value.maxLines) || Number(value.maxLines) <= 0) {
    throw new Error(`Source structure exception for ${id} needs a positive integer maxLines`);
  }
  return {
    maxLines: Number(value.maxLines),
    owner: requireMetadata(value, "owner", id),
    reason: requireMetadata(value, "reason", id),
    boundary: requireMetadata(value, "boundary", id),
    removalTarget: requireMetadata(value, "removalTarget", id)
  };
}

function parseDirectoryException(value: unknown, id: string): SourceDirectoryException {
  if (!isRecord(value) || !Number.isInteger(value.maxFiles) || Number(value.maxFiles) <= 0) {
    throw new Error(`Source directory exception for ${id} needs a positive integer maxFiles`);
  }
  return {
    maxFiles: Number(value.maxFiles),
    owner: requireMetadata(value, "owner", id),
    reason: requireMetadata(value, "reason", id),
    boundary: requireMetadata(value, "boundary", id),
    removalTarget: requireMetadata(value, "removalTarget", id)
  };
}

function parseDeclarationDeferral(value: unknown, index: number): SourceDeclarationDeferral {
  const id = `declarationDeferrals[${index}]`;
  if (!isRecord(value) || typeof value.pathPrefix !== "string") {
    throw new Error(`${id} needs a pathPrefix`);
  }
  const pathPrefix = normalizeSourcePath(value.pathPrefix);
  if (pathPrefix !== value.pathPrefix || !pathPrefix.endsWith("/")) {
    throw new Error(`${id} pathPrefix must be a normalized repository directory ending in /`);
  }
  return {
    pathPrefix,
    owner: requireMetadata(value, "owner", id),
    reason: requireMetadata(value, "reason", id),
    boundary: requireMetadata(value, "boundary", id),
    removalTarget: requireMetadata(value, "removalTarget", id)
  };
}

function isDeclarationDeferred(entry: SourceDeclarationEntry, baseline: SourceStructureBaseline) {
  return baseline.declarationDeferrals.some((deferral) => entry.path.startsWith(deferral.pathPrefix));
}

function isFunctionDeclarationWithBody(node: ts.Node): node is ts.FunctionLikeDeclaration {
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) return Boolean(node.body);
  if (ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    return Boolean(node.body);
  }
  return false;
}

function declarationName(node: ts.ClassLikeDeclaration | ts.FunctionLikeDeclaration) {
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) || ts.isNumericLiteral(node.name))) {
    return node.name.text;
  }
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (ts.isPropertyDeclaration(parent) && (ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name) || ts.isNumericLiteral(parent.name))) {
    return parent.name.text;
  }
  if (ts.isPropertyAssignment(parent) && (ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name) || ts.isNumericLiteral(parent.name))) {
    return parent.name.text;
  }
  return "";
}

function requireMetadata(value: Record<string, unknown>, field: string, filePath: string) {
  const metadata = value[field];
  if (typeof metadata !== "string" || !metadata.trim()) {
    throw new Error(`Source structure exception for ${filePath} needs non-empty ${field}`);
  }
  return metadata;
}

import { isRecord } from '@hyperfocus/utilities/records';

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

if (import.meta.main) await main();
