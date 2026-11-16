import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHyperfocusProjectFiles } from "../src/project/index.ts";
import { createDefaultProject } from "../src/project/editor.ts";
import { buildPortableProject, collectProjectBehaviorImports, createBehaviorBundleEntry, resolveStandaloneRuntimeEntry } from "./build-project.ts";
import { verifyGameBuildReceiptFile } from "./project-build/receipt.ts";

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

  test("does not treat registered ambient motion as project source", () => {
    const project = createDefaultProject();
    project.scenes[0]!.entities[0]!.components.push({
      id: "ambient",
      type: "behavior",
      enabled: true,
      values: { module: "builtin:ambient-motion", export: "update", motion: "sway" },
    });

    expect(collectProjectBehaviorImports(project, "C:/games/example")).toEqual([]);
  });

  test("resolves the repository standalone runtime host", () => {
    const runtimeEntry = resolveStandaloneRuntimeEntry();
    expect(runtimeEntry).toEndWith("/apps/engine-editor/src/standalone-entry.ts");
    expect(Bun.file(runtimeEntry).size).toBeGreaterThan(0);
    expect(resolveStandaloneRuntimeEntry('2d')).toEndWith('/standalone/entry-2d.ts');
    expect(resolveStandaloneRuntimeEntry('3d')).toEndWith('/standalone/entry-3d.ts');
  });

  test("rejects behavior modules that escape the project root", () => {
    const project = createDefaultProject();
    project.scenes[0].entities[0].components.push({ id: "escape", type: "behavior", enabled: true, values: { module: "../shared.ts", export: "update" } });
    expect(() => collectProjectBehaviorImports(project, "C:/games/example")).toThrow("outside the project root");
  });

  test("bundles custom TypeScript with an artifact receipt and preserves the canonical pair", async () => {
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
      const receipt = JSON.parse(await readFile(`${result.outputPath}.receipt.json`, "utf8"));
      expect(receipt.artifact.sha256).toBe(new Bun.CryptoHasher("sha256").update(html).digest("hex"));
      expect(receipt.inputs.some((input: { path: string }) => input.path.endsWith("/src/custom.ts"))).toBe(true);
      expect(receipt.inputs.some((input: { path: string }) => input.path.endsWith("/standalone/entry-2d.ts"))).toBe(true);
      expect(receipt.inputs.some((input: { path: string }) => input.path.endsWith("/standalone-3d.ts"))).toBe(false);
      expect(receipt.inputs.some((input: { path: string }) => input.path.endsWith("/.hyperfocus/assets.hfp"))).toBe(true);
      expect(receipt.acceptance.status).toBe("unassessed");
      expect(await verifyGameBuildReceiptFile({ artifactPath: result.outputPath })).toEqual({ receiptMatches: true, artifactMatches: true });
      await writeFile(result.outputPath, "stale artifact");
      expect((await verifyGameBuildReceiptFile({ artifactPath: result.outputPath })).artifactMatches).toBe(false);
      expect((await readdir(join(root, ".hyperfocus"))).sort()).toEqual(["assets.hfp", "project.json"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
