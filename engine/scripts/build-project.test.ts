import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHyperfocusProjectFiles } from "../src/project/index.ts";
import { createDefaultProject } from "../../apps/engine-editor/src/project.ts";
import { buildPortableProject, collectProjectBehaviorImports, createBehaviorBundleEntry } from "./build-project.ts";

describe("portable project CLI build", () => {
  test("collects stable behavior keys without generated wrappers", () => {
    const project = createDefaultProject();
    project.scenes[0].entities[0].components.push({ id: "custom", type: "behavior", enabled: true, values: { module: "./src/custom.ts", export: "updateCustom" } });
    const imports = collectProjectBehaviorImports(project, "C:/games/example");
    expect(imports).toMatchObject([{ key: "./src/custom.ts#updateCustom", exportName: "updateCustom" }]);
    const entry = createBehaviorBundleEntry(imports);
    expect(entry).toContain('"./src/custom.ts#updateCustom"');
    expect(entry).not.toContain("writeFile");
  });

  test("rejects behavior modules that escape the project root", () => {
    const project = createDefaultProject();
    project.scenes[0].entities[0].components.push({ id: "escape", type: "behavior", enabled: true, values: { module: "../shared.ts", export: "update" } });
    expect(() => collectProjectBehaviorImports(project, "C:/games/example")).toThrow("outside the project root");
  });

  test("bundles custom TypeScript in memory and writes only one HTML artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "hyperfocus-project-build-"));
    try {
      const project = createDefaultProject("CLI Behavior");
      project.scenes[0].entities[0].components.push({ id: "custom", type: "behavior", enabled: true, values: { module: "./src/custom.ts", export: "updateCustom" } });
      const files = await createHyperfocusProjectFiles(project, []);
      await mkdir(join(root, ".hyperfocus"), { recursive: true });
      await mkdir(join(root, "src"), { recursive: true });
      await writeFile(join(root, ".hyperfocus", "project.json"), files.projectJson);
      await writeFile(join(root, ".hyperfocus", "assets.hfp"), files.assetsArchive);
      await writeFile(join(root, "src", "custom.ts"), "export function updateCustom({ tick }) { return tick % 2 ? { velocityX: 30 } : undefined; }\n");
      const result = await buildPortableProject(root);
      const html = await readFile(result.outputPath, "utf8");
      expect(result.behaviorCount).toBe(1);
      expect(html).toContain("hyperfocus-project-pair");
      expect(html).not.toMatch(/<script\s+src=|<link\s+[^>]*href=/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
