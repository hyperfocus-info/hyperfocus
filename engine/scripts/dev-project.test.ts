import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHyperfocusProjectFiles } from "../src/project/index.ts";
import { createStarterProject } from "./create-project.ts";
import { clampProjectDevDebounce, discoverProjectWatchFiles, projectDevCliHelp, startProjectDevServer } from "./dev-project.ts";

describe("source-aware project dev command", () => {
  test("discovers the exact pair and transitive authored source, not unrelated files", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "hyperfocus-dev-discovery-"));
    const root = join(temporary, "game");
    try {
      await writeCustomProject(root);
      await writeFile(join(root, "src", "unrelated.ts"), "export const unrelated = true;\n");
      const watched = (await discoverProjectWatchFiles(root)).map((path) => path.slice(root.length + 1).replace(/\\/g, "/"));
      expect(watched).toEqual([".hyperfocus/assets.hfp", ".hyperfocus/project.json", "src/behavior.ts", "src/shared.ts"]);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  test("serves the last good snapshot, watches rebuilds, and shuts down cleanly", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "hyperfocus-dev-server-"));
    const root = join(temporary, "game");
    let dev: Awaited<ReturnType<typeof startProjectDevServer>> | undefined;
    try {
      await writeCustomProject(root);
      const messages: string[] = [];
      dev = await startProjectDevServer({
        projectDirectory: root,
        port: 0,
        debounceMs: 25,
        logger: { log: (message) => messages.push(String(message)), error: (message) => messages.push(String(message)) },
      });
      expect(dev.url).toStartWith("http://127.0.0.1:");
      expect(dev.status()).toMatchObject({ state: "ready", buildNumber: 1 });
      const firstHtml = await (await fetch(dev.url)).text();
      expect(firstHtml).toContain("data-hyperfocus-live-reload");
      expect(firstHtml).not.toMatch(/<script\s+src=/i);
      expect(await filesBelow(root)).toEqual([".hyperfocus/assets.hfp", ".hyperfocus/project.json", "src/behavior.ts", "src/shared.ts"]);

      await writeFile(join(root, "src", "behavior.ts"), "export function updateCustom( {\n");
      await waitFor(() => dev?.status().state === "error");
      expect(dev.status().buildNumber).toBe(1);
      expect(dev.status().lastError).toMatch(/behavior\.ts|Unexpected end/i);
      expect(await (await fetch(dev.url)).text()).toBe(firstHtml);

      await writeFile(join(root, "src", "behavior.ts"), 'import { speed } from "./shared.ts"; export function updateCustom() { return { velocityX: speed + 1 }; }\n');
      await waitFor(() => (dev?.status().buildNumber ?? 0) >= 2 && dev?.status().state === "ready");
      expect(messages.some((message) => message.includes("Project rebuild failed"))).toBe(true);
      const disposable = dev.disposableDirectory;
      await dev.stop();
      expect(dev.status().state).toBe("stopped");
      expect(existsSync(disposable)).toBe(false);
      dev = undefined;
    } finally {
      await dev?.stop();
      await rm(temporary, { recursive: true, force: true });
    }
  });

  test("bounds debounce configuration and documents localhost/watch behavior", () => {
    expect(clampProjectDevDebounce(1)).toBe(25);
    expect(clampProjectDevDebounce(99)).toBe(99);
    expect(clampProjectDevDebounce(99_999)).toBe(2_000);
    const help = projectDevCliHelp();
    expect(help).toContain("127.0.0.1");
    expect(help).toContain("watches only");
    expect(help).toContain("last good snapshot");
  });
});

async function writeCustomProject(root: string) {
  const project = createStarterProject("top-down", "Dev Loop", "2026-01-01T00:00:00.000Z");
  project.scenes[0].entities[0].components.push({ id: "custom", type: "behavior", enabled: true, values: { module: "./src/behavior.ts", export: "updateCustom" } });
  const files = await createHyperfocusProjectFiles(project, []);
  await mkdir(join(root, ".hyperfocus"), { recursive: true });
  await mkdir(join(root, "src"), { recursive: true });
  await Promise.all([
    writeFile(join(root, ".hyperfocus", "project.json"), files.projectJson),
    writeFile(join(root, ".hyperfocus", "assets.hfp"), files.assetsArchive),
    writeFile(join(root, "src", "shared.ts"), "export const speed = 30;\n"),
    writeFile(join(root, "src", "behavior.ts"), 'import { speed } from "./shared.ts"; export function updateCustom() { return { velocityX: speed }; }\n'),
  ]);
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await Bun.sleep(25);
  }
  throw new Error("Timed out waiting for project dev server state.");
}

async function filesBelow(root: string, prefix = ""): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await filesBelow(join(root, entry.name), path));
    else result.push(path.replace(/\\/g, "/"));
  }
  return result.sort();
}
