import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHyperfocusProjectFiles } from "../src/project/index.ts";
import { createStarterProject } from "./create-project.ts";
import { auditNeutralExport, exportNeutralProject, neutralExportCliHelp, type NeutralExportManifest } from "./export-project.ts";

describe("generic neutral project export", () => {
  test("is independently usable as JSON, named bytes, and standard SHA-256", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "hyperfocus-neutral-export-"));
    const source = join(temporary, "source");
    const output = join(temporary, "ordinary-files");
    try {
      const bytes = new TextEncoder().encode("engine-independent asset bytes");
      const project = createStarterProject("top-down", "Portable Escape", "2026-01-01T00:00:00.000Z");
      project.assets.push({
        id: "map:data", name: "map?.json", kind: "data", mimeType: "application/json", size: bytes.byteLength,
        lastModified: 1, source: "imported",
      });
      const files = await createHyperfocusProjectFiles(project, [{ id: "map:data", name: "map?.json", mimeType: "application/json", bytes }]);
      await writePair(source, files.projectJson, files.assetsArchive);

      const result = await exportNeutralProject({ projectDirectory: source, outputDirectory: output });
      expect(result.fileCount).toBe(3);
      expect(await filesBelow(output)).toEqual(["assets/map-data--map-.json", "manifest.json", "project.json"]);

      // This reader intentionally uses only platform JSON, file, and Web Crypto APIs.
      const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8")) as NeutralExportManifest;
      const neutralProject = JSON.parse(await readFile(join(output, "project.json"), "utf8"));
      const recovered = new Uint8Array(await readFile(join(output, ...manifest.assets[0].path.split("/"))));
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", recovered.buffer))]
        .map((value) => value.toString(16).padStart(2, "0")).join("");
      expect(neutralProject.name).toBe("Portable Escape");
      expect(recovered).toEqual(bytes);
      expect(digest).toBe(manifest.assets[0].sha256);
      expect(manifest.assets[0]).toMatchObject({ id: "map:data", name: "map?.json", mimeType: "application/json", size: bytes.byteLength });
      expect(await readdir(output)).not.toContain("package.json");
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  test("reports exact preserved constructs that require target-specific work", () => {
    const project = createStarterProject("top-down", "Diagnostics", "2026-01-01T00:00:00.000Z");
    project.assets.push({ id: "generated", name: "generated.png", kind: "image", mimeType: "image/generated", size: 0, lastModified: 0, source: "generated" });
    project.scenes[0].entities[1].components.push({ id: "vendor-field", type: "vendor-logic", enabled: true, values: { mode: "special" } } as never);
    project.postProcessing.effects.push({ id: "crt", enabled: true, value: 0.2 });
    const diagnostics = auditNeutralExport(project as typeof project & Record<string, unknown>);
    expect(diagnostics.map(({ code, pointer }) => ({ code, pointer }))).toEqual([
      { code: "generated-asset", pointer: "/assets/0" },
      { code: "behavior-requires-port", pointer: "/scenes/0/entities/0/components/3" },
      { code: "behavior-requires-port", pointer: "/scenes/0/entities/1/components/2" },
      { code: "unknown-component", pointer: "/scenes/0/entities/1/components/4" },
      { code: "engine-post-effect", pointer: "/postProcessing/effects/0" },
      { code: "extension-namespace", pointer: "/extensions/hyperfocusSave" },
      { code: "extension-namespace", pointer: "/extensions/hyperfocusStarter" },
    ]);
    expect(diagnostics.every((item) => item.message.includes("preserved"))).toBe(true);
  });

  test("is deterministic and refuses overwrite or extra canonical files", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "hyperfocus-neutral-determinism-"));
    const source = join(temporary, "source");
    const outputA = join(temporary, "a");
    const outputB = join(temporary, "b");
    try {
      const project = createStarterProject("grid", "Stable", "2026-01-01T00:00:00.000Z");
      project.scenes[0].entities[0].components.push({ id: "future", type: "future-system", enabled: true, values: { retained: true } } as never);
      const files = await createHyperfocusProjectFiles(project, []);
      await writePair(source, files.projectJson, files.assetsArchive);
      await exportNeutralProject({ projectDirectory: source, outputDirectory: outputA });
      await exportNeutralProject({ projectDirectory: source, outputDirectory: outputB });
      expect(await readFile(join(outputA, "project.json"))).toEqual(await readFile(join(outputB, "project.json")));
      expect(await readFile(join(outputA, "manifest.json"))).toEqual(await readFile(join(outputB, "manifest.json")));
      const manifest = JSON.parse(await readFile(join(outputA, "manifest.json"), "utf8")) as NeutralExportManifest;
      expect(manifest.diagnostics.some((item) => item.code === "unknown-component" && item.pointer === "/scenes/0/entities/0/components/6")).toBe(true);
      await expect(exportNeutralProject({ projectDirectory: source, outputDirectory: outputA })).rejects.toThrow("already exists");
      await writeFile(join(source, ".hyperfocus", "cache.bin"), "extra");
      await expect(exportNeutralProject({ projectDirectory: source, outputDirectory: join(temporary, "c") })).rejects.toThrow("must contain exactly");
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  test("blocks imported catalog records whose bytes cannot be independently recovered", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "hyperfocus-neutral-missing-"));
    const source = join(temporary, "source");
    try {
      const project = createStarterProject("top-down", "Missing bytes", "2026-01-01T00:00:00.000Z");
      project.assets.push({ id: "missing", name: "missing.bin", kind: "data", mimeType: "application/octet-stream", size: 1, lastModified: 1, source: "imported" });
      const files = await createHyperfocusProjectFiles(project, []);
      await writePair(source, files.projectJson, files.assetsArchive);
      await expect(exportNeutralProject({ projectDirectory: source, outputDirectory: join(temporary, "out") })).rejects.toThrow("has no SHA-256 content address");
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  test("help states the portable output and non-overwrite contract", () => {
    const help = neutralExportCliHelp();
    expect(help).toContain("project.json");
    expect(help).toContain("manifest.json");
    expect(help).toContain("assets/*");
    expect(help).toContain("must not already exist");
    expect(help).toContain("No runtime");
  });
});

async function writePair(root: string, projectJson: Uint8Array, assetsArchive: Uint8Array) {
  await mkdir(join(root, ".hyperfocus"), { recursive: true });
  await Promise.all([
    writeFile(join(root, ".hyperfocus", "project.json"), projectJson),
    writeFile(join(root, ".hyperfocus", "assets.hfp"), assetsArchive),
  ]);
}

async function filesBelow(root: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await filesBelow(join(root, entry.name), relative));
    else files.push(relative.replace(/\\/g, "/"));
  }
  return files.sort();
}
