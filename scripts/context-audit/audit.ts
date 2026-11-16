import { createHash } from "node:crypto";
import { readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

const excludedDirectories = new Set([
  ".git", "node_modules", ".local", ".codex-tmp", ".tmp-test-data", "dist", "build", "release",
  "coverage", "__pycache__", ".venv", "venv",
]);

export function proseLines(source: string) {
  let fence: { character: string; length: number } | undefined;
  return source.split(/\r?\n/).map((text, index) => {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    if (marker) {
      const run = marker[1]!;
      if (!fence) fence = { character: run[0]!, length: run.length };
      else if (run[0] === fence.character && run.length >= fence.length && !marker[2]!.trim()) fence = undefined;
      return undefined;
    }
    return fence ? undefined : { text, line: index + 1 };
  }).filter((line) => line !== undefined);
}

export function inspectContext({ source, file }: { source: string; file: string }) {
  const normalized = source.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
  const frontmatter = /^---\n[\s\S]*?\n---(?:\n|$)/.exec(normalized)?.[0] ?? "";
  const flags: { line: number; reason: string }[] = [];
  for (const line of proseLines(normalized)) {
    if (/\b(?:README|todo)(?:\.md)?\s+L\d+/i.test(line.text)) {
      flags.push({ line: line.line, reason: "Volatile documentation line citation; prefer an owner link and heading." });
    }
    if (/(?:token.{0,35}\d+(?:\.\d+)?%|\d+(?:\.\d+)?%.{0,35}token)/i.test(line.text)) {
      flags.push({ line: line.line, reason: "Token-saving claim: verify tokenizer, workload, and evidence." });
    }
  }
  const temporary = file.endsWith(".tmp.md") ? {
    owner: /^Owner:\s*(.+)$/m.exec(normalized)?.[1],
    pruneAfter: /^Prune after:\s*(.+)$/m.exec(normalized)?.[1],
  } : undefined;
  if (temporary) {
    if (!file.replaceAll("\\", "/").split("/").includes(".local")) flags.push({ line: 1, reason: "Temporary documentation belongs under .local/." });
    if (!temporary.owner || !temporary.pruneAfter) flags.push({ line: 1, reason: "Temporary documentation needs Owner: and Prune after: metadata." });
  }
  return {
    file,
    ...(temporary ? { temporary } : {}),
    bytes: Buffer.byteLength(source),
    words: normalized.match(/\S+/g)?.length ?? 0,
    lines: normalized.split("\n").length,
    skill: path.basename(file).toLowerCase() === "skill.md",
    frontmatterBytes: Buffer.byteLength(frontmatter),
    digest: createHash("sha256").update(normalized).digest("hex"),
    flags,
  };
}

/** Read-only inventory. Sizes and flags prioritize review; they do not prove waste or correctness. */
export async function auditContext({ roots = [process.cwd()], includeGenerated = false }: {
  roots?: readonly string[];
  includeGenerated?: boolean;
} = {}) {
  if (roots.length === 0) throw new Error("At least one root is required.");
  const visited = new Set<string>();
  const files: ReturnType<typeof inspectContext>[] = [];
  let skippedSymlinks = 0;
  async function visit(directory: string) {
    const resolved = await realpath(directory);
    if (visited.has(resolved)) return;
    visited.add(resolved);
    const entries = await readdir(resolved, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const file = path.join(resolved, entry.name);
      if (entry.isSymbolicLink()) {
        skippedSymlinks++;
      } else if (entry.isDirectory()) {
        if (entry.name !== ".git" && (includeGenerated || !excludedDirectories.has(entry.name))) await visit(file);
      } else if (entry.isFile() && /\.(?:md|markdown)$/i.test(entry.name)) {
        files.push(inspectContext({ source: await readFile(file, "utf8"), file }));
      }
    }
  }
  for (const root of roots) await visit(root);
  files.sort((a, b) => b.bytes - a.bytes || a.file.localeCompare(b.file));
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const group = groups.get(file.digest) ?? [];
    group.push(file.file);
    groups.set(file.digest, group);
  }
  return {
    roots: await Promise.all(roots.map((root) => realpath(root))),
    measurement: "UTF-8 bytes and whitespace-delimited words; not model tokens.",
    excludedDirectories: includeGenerated ? [".git"] : [...excludedDirectories],
    skippedSymlinks,
    fileCount: files.length,
    skillCount: files.filter((file) => file.skill).length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    duplicates: [...groups.values()].filter((group) => group.length > 1),
    files,
  };
}
