import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** IDs declared at the start of a story/coverage paragraph or table row, not incidental mentions. */
export function extractAuditStoryIds(source: string) {
  return [...source.matchAll(/^(?:\|\s*)?([A-Z][A-Z0-9-]+-\d{2,3})(?=:|\s)/gm)].map(match => match[1]!);
}

/** Resolve story owners through the repository index, including newly added surfaces. */
export async function loadAuditStoryIds() {
  const indexPath = fileURLToPath(new URL("../../../../../docs/user-stories.md", import.meta.url));
  const index = await readFile(indexPath, "utf8"), ids = new Set<string>();
  const owners = [...index.matchAll(/^\|[^|]+\|\s*\[[^\]]+\]\(([^)]+)\)/gm)];
  if (!owners.length) throw new Error("No story owners found in docs/user-stories.md.");
  for (const owner of owners) {
    const source = await readFile(resolve(dirname(indexPath), owner[1]!.split('#')[0]!), "utf8");
    for (const id of extractAuditStoryIds(source)) ids.add(id);
  }
  return ids;
}

export function validateAuditStoryIds(options: { storyIds: readonly string[]; knownIds: ReadonlySet<string> }) {
  const unknown = options.storyIds.filter(id => !options.knownIds.has(id));
  if (unknown.length) throw new Error(`Unknown story IDs: ${unknown.join(", ")}. Use the canonical owners linked by docs/user-stories.md.`);
}
