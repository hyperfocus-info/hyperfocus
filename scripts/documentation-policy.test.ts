import { extractAuditStoryIds } from "../.agents/skills/user-audit/scripts/stories/inventory";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const read = (filePath: string) => readFile(path.join(repoRoot, filePath), "utf8");

function findTemporaryMarkdownNameViolations(paths: readonly string[]) {
  return paths
    .map((filePath) => filePath.replaceAll("\\", "/"))
    .filter((filePath) => filePath.endsWith(".md"))
    .filter((filePath) => {
      const name = path.posix.basename(filePath).toLowerCase();
      return /(?:^|[-_.])(?:tmp|temp|temporary)(?:[-_.]|$)/.test(name) && !name.endsWith(".tmp.md");
    });
}

async function trackedMarkdownFiles() {
  const result = spawnBackgroundProcessSync({
    cmd: ["git", "ls-files", "*.md"],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe"
  });
  if (result.exitCode !== 0) throw new Error(`Could not enumerate tracked Markdown files: ${result.stderr.toString()}`);
  return result.stdout.toString().split(/\r?\n/).filter(Boolean);
}

async function trackedJavaScriptRuntimeFiles() {
  const result = spawnBackgroundProcessSync({
    cmd: ["git", "ls-files", "*.js", "*.jsx", "*.mjs", "*.cjs"],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe"
  });
  if (result.exitCode !== 0) throw new Error(`Could not enumerate tracked JavaScript files: ${result.stderr.toString()}`);
  return result.stdout.toString()
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((filePath) => existsSync(path.join(repoRoot, filePath)))
    .map((filePath) => filePath.replaceAll("\\", "/"));
}

async function repositorySkillScriptFiles() {
  const skillRoots = [
    path.join(repoRoot, ".agents", "skills"),
    path.join(repoRoot, "apps", "pad-pilot", ".agents", "skills")
  ];
  const files: string[] = [];

  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (absolutePath.split(path.sep).includes("scripts")) {
        files.push(path.relative(repoRoot, absolutePath).replaceAll("\\", "/"));
      }
    }
  }

  for (const skillRoot of skillRoots) {
    await visit(skillRoot);
  }
  return files;
}

async function markdownFilesUnder(relativeRoots: readonly string[]) {
  const files: string[] = [];
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.name.endsWith(".md")) {
        files.push(path.relative(repoRoot, absolutePath).replaceAll("\\", "/"));
      }
    }
  }
  for (const relativeRoot of relativeRoots) {
    await visit(path.join(repoRoot, relativeRoot));
  }
  return files;
}

async function brokenLocalMarkdownLinks(filePaths: readonly string[]) {
  const failures: string[] = [];
  for (const filePath of filePaths) {
    const source = await read(filePath);
    for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const rawTarget = match[1]?.trim().replace(/^<|>$/g, "") ?? "";
      if (!rawTarget || rawTarget.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(rawTarget)) continue;
      const target = decodeURIComponent(rawTarget.split("#", 1)[0]!.split("?", 1)[0]!);
      const absoluteTarget = target.startsWith("/")
        ? path.join(repoRoot, target.slice(1))
        : path.resolve(repoRoot, path.dirname(filePath), target);
      // Local evidence is deliberately absent from a clean checkout.
      if (path.relative(repoRoot, absoluteTarget).split(path.sep).includes(".local")) continue;
      if (!existsSync(absoluteTarget)) failures.push(`${filePath} -> ${rawTarget}`);
    }
  }
  return failures;
}

async function rootScriptFiles() {
  return (await readdir(path.join(repoRoot, "scripts"), { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => `scripts/${entry.name}`)
    .filter((filePath) => !filePath.endsWith(".json"));
}

describe("documentation policy", () => {
  test("keeps documentation governance discoverable from root routes", async () => {
    const [agents, map, rootReadme] = await Promise.all([
      read("AGENTS.md"),
      read("docs/README.md"),
      read("README.md")
    ]);

    expect(agents).toContain("docs/documentation-governance.md");
    expect(map).toContain("documentation-governance.md");
    expect(map).toContain("package-testing.md");
    expect(map).toContain("user-stories.md");
    expect(rootReadme).toContain("docs/documentation-governance.md");
  });

  test("keeps UI story inventories routed", async () => {
    const storyMap = await read("docs/user-stories.md");
    expect(storyMap).toContain("docs/harness/user-stories.md");
    expect(storyMap).toContain("apps/engine-editor/user-stories.md");
    expect(storyMap).toContain("docs/pad-pilot/user-stories.md");
    expect(storyMap).toContain("docs/pad-pilot/marketplace-user-stories.md");
    expect(storyMap).toContain("packages/ui/user-stories.md");
  });

  test("maps every shipped PadPilot story to coverage", async () => {
    const [appStories, marketplaceStories, coverage] = await Promise.all([
      read("docs/pad-pilot/user-stories.md"),
      read("docs/pad-pilot/marketplace-user-stories.md"),
      read("docs/pad-pilot/coverage-matrix.md")
    ]);
    const storyIds = extractAuditStoryIds(`${appStories}\n${marketplaceStories}`).filter(id => /^(?:PP|PPM)-/.test(id));
    const coveredIds = new Set(extractAuditStoryIds(coverage));
    expect(storyIds.length).toBeGreaterThan(0);
    expect(new Set(storyIds).size).toBe(storyIds.length);
    expect(storyIds.filter((storyId) => !coveredIds.has(storyId))).toEqual([]);
  });

  test("uses .tmp.md for tracked temporary Markdown files", async () => {
    expect(findTemporaryMarkdownNameViolations(await trackedMarkdownFiles())).toEqual([]);
  });

  test("keeps repository skill scripts on Bun TypeScript", async () => {
    expect((await repositorySkillScriptFiles()).filter((filePath) => !filePath.endsWith(".ts"))).toEqual([]);
  });

  test("keeps PadPilot docs, package routes, and skill references resolvable", async () => {
    const markdownFiles = await markdownFilesUnder([
      "docs/pad-pilot",
      "packages/pad-pilot",
      "packages/ui",
      "apps/pad-pilot/.agents/skills"
    ]);
    expect(await brokenLocalMarkdownLinks(markdownFiles)).toEqual([]);
  });

  test("keeps shipping entrypoints and changed skill routes resolvable", async () => {
    expect(await brokenLocalMarkdownLinks([
      "AGENTS.md",
      "README.md",
      "docs/README.md",
      "docs/shipping.md",
      "docs/distribution.md",
      "docs/versioning.md",
      "docs/audits/shipping-system.md",
      ".agents/skills/ship-readiness/SKILL.md",
      ".agents/skills/improve-codebase-architecture/SKILL.md"
    ])).toEqual([]);
  });

  test("keeps root repository scripts on Bun TypeScript", async () => {
    expect((await rootScriptFiles()).filter((filePath) => !filePath.endsWith(".ts"))).toEqual([]);
  });

  test("keeps tracked runtime scripts on TypeScript while allowing tool config modules", async () => {
    expect((await trackedJavaScriptRuntimeFiles()).filter((filePath) => !filePath.endsWith(".config.mjs"))).toEqual([]);
  });
});
