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
  const result = Bun.spawnSync({
    cmd: ["git", "ls-files", "*.md"],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe"
  });
  if (result.exitCode !== 0) throw new Error(`Could not enumerate tracked Markdown files: ${result.stderr.toString()}`);
  return result.stdout.toString().split(/\r?\n/).filter(Boolean);
}

async function trackedJavaScriptRuntimeFiles() {
  const result = Bun.spawnSync({
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
  const scriptRoot = path.join(repoRoot, ".agents", "skills");
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

  await visit(scriptRoot);
  return files;
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
    expect(storyMap).toContain("packages/ui/user-stories.md");
  });

  test("uses .tmp.md for tracked temporary Markdown files", async () => {
    expect(findTemporaryMarkdownNameViolations(await trackedMarkdownFiles())).toEqual([]);
  });

  test("keeps repository skill scripts on Bun TypeScript", async () => {
    expect((await repositorySkillScriptFiles()).filter((filePath) => !filePath.endsWith(".ts"))).toEqual([]);
  });

  test("keeps root repository scripts on Bun TypeScript", async () => {
    expect((await rootScriptFiles()).filter((filePath) => !filePath.endsWith(".ts"))).toEqual([]);
  });

  test("keeps tracked runtime scripts on TypeScript while allowing tool config modules", async () => {
    expect((await trackedJavaScriptRuntimeFiles()).filter((filePath) => !filePath.endsWith(".config.mjs"))).toEqual([]);
  });
});
