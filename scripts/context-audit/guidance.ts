import { existsSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { auditContext, proseLines } from "./audit";

export function skillMetadata({ source, file }: { source: string; file: string }) {
  const normalized = source.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
  const header = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(normalized);
  if (!header) throw new Error("Missing YAML frontmatter");
  const data: unknown = Bun.YAML.parse(header[1]!);
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("Expected frontmatter object");
  const name: unknown = Reflect.get(data, "name");
  const description: unknown = Reflect.get(data, "description");
  if (typeof name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    throw new Error("Skill name must be lowercase kebab-case, at most 64 characters");
  }
  if (name !== path.basename(path.dirname(file))) throw new Error("Skill name must match its directory");
  if (typeof description !== "string" || !description.trim() || description.length > 1024) {
    throw new Error("Skill description must be nonempty text, at most 1024 characters");
  }
  return { name, description };
}

/** Local Markdown destinations outside fenced examples; external URLs are not fetched. */
export function localLinks(source: string) {
  const links: { target: string; line: number }[] = [];
  for (const { text, line } of proseLines(source)) {
    const withoutCode = text.replace(/(`+)[\s\S]*?\1/g, "");
    const targets = [
      ...withoutCode.matchAll(/\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^\n]*?["'])?\s*\)/g),
      ...withoutCode.matchAll(/^\s*\[[^\]]+\]:\s*(<[^>]+>|\S+)/g),
    ];
    for (const match of targets) {
      const raw = match[1]!.replace(/^<|>$/g, "");
      if (raw.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) continue;
      const target = decodeURIComponent(raw.split(/[?#]/, 1)[0]!);
      if (target) links.push({ target, line });
    }
  }
  return links;
}

function inside(directory: string, file: string) {
  const relative = path.relative(directory, file);
  return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

export async function validateGuidance({ root = process.cwd() }: { root?: string } = {}) {
  const report = await auditContext({ roots: [root] });
  const repository = await realpath(root);
  const portable = path.join(repository, "apps/harness/.agents");
  const failures: { file: string; reason: string }[] = [];
  const catalog: { file: string; name: string; description: string }[] = [];
  const names = new Map<string, string>();
  const selected = report.files.filter(({ file }) => {
    const relative = path.relative(repository, file).replaceAll("\\", "/");
    return relative.split("/").includes(".agents") || /(?:^|\/)(?:\.?agents|runtime-agents)\.md$/i.test(relative)
      || ["README.md", "DESIGN.md", "docs/README.md", "docs/documentation-governance.md", "docs/agent-outcomes.md"].includes(relative);
  });
  for (const entry of selected) {
    const file = path.relative(repository, entry.file).replaceAll("\\", "/");
    const source = await readFile(entry.file, "utf8");
    if (entry.skill) {
      try {
        const metadata = skillMetadata({ source, file: entry.file });
        const scope = path.dirname(path.dirname(entry.file));
        const key = `${scope}:${metadata.name}`;
        if (names.has(key)) throw new Error(`Duplicate skill in catalog: ${names.get(key)}`);
        names.set(key, file);
        catalog.push({ file, ...metadata });
      } catch (error) {
        failures.push({ file, reason: error instanceof Error ? error.message : String(error) });
      }
    }
    try {
      for (const { target, line } of localLinks(source)) {
        const resolved = target.startsWith("/")
          ? path.join(repository, target.slice(1))
          : path.resolve(path.dirname(entry.file), target);
        if (!existsSync(resolved)) failures.push({ file, reason: `Line ${line}: missing link ${target}` });
        else if (inside(portable, entry.file) && !inside(portable, await realpath(resolved))) {
          failures.push({ file, reason: `Line ${line}: packaged guidance escapes its bundle: ${target}` });
        }
      }
    } catch (error) {
      failures.push({ file, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { checkedFiles: selected.length, catalog: catalog.sort((a, b) => a.file.localeCompare(b.file)), failures };
}
