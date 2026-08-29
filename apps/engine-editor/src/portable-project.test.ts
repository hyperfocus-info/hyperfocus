import { describe, expect, test } from "bun:test";
import { createDefaultProject } from "@hyperfocus/engine/project";
import { createEditorPortableFiles, openEditorPortableFiles, validatePortableAssetCatalog } from "./portable-project.ts";

describe("editor portable project files", () => {
  test("round-trips canonical project JSON and imported bytes through exactly two files", async () => {
    const project = createDefaultProject("Portable Game");
    const bytes = new TextEncoder().encode("owned asset bytes");
    project.assets.push({
      id: "asset-owned",
      name: "owned.txt",
      kind: "data",
      mimeType: "text/plain",
      size: bytes.byteLength,
      lastModified: 123,
      source: "imported",
    });

    const files = await createEditorPortableFiles(project, async (id) => id === "asset-owned" ? new Blob([bytes], { type: "text/plain" }) : undefined);
    expect(files.projectJson.byteLength).toBeGreaterThan(0);
    expect(files.assetsArchive.byteLength).toBeGreaterThan(0);
    const savedProject = JSON.parse(new TextDecoder().decode(files.projectJson));
    expect(savedProject.assets.find((asset: { id: string }) => asset.id === "asset-owned").sha256).toMatch(/^[0-9a-f]{64}$/);

    const restored = await openEditorPortableFiles(files.projectJson, files.assetsArchive);
    expect(restored.project.name).toBe("Portable Game");
    expect(restored.assets).toHaveLength(1);
    expect(restored.assets[0].id).toBe("asset-owned");
    expect(restored.assets[0].bytes).toEqual(bytes);
  });

  test("restores multiple catalog assets that share one deduplicated object", async () => {
    const project = createDefaultProject("Deduplicated Game");
    const bytes = new Uint8Array([1, 2, 3, 4]);
    project.assets.push(
      { id: "asset-a", name: "a.bin", kind: "unknown", mimeType: "application/octet-stream", size: bytes.byteLength, lastModified: 1, source: "imported" },
      { id: "asset-b", name: "b.bin", kind: "unknown", mimeType: "application/octet-stream", size: bytes.byteLength, lastModified: 2, source: "imported" },
    );
    const files = await createEditorPortableFiles(project, async () => new Blob([bytes], { type: "application/octet-stream" }));
    const restored = await openEditorPortableFiles(files.projectJson, files.assetsArchive);
    expect(restored.assets.map((asset) => asset.id)).toEqual(["asset-a", "asset-b"]);
    expect(restored.assets[0].sha256).toBe(restored.assets[1].sha256);
  });

  test("fails export when an imported blob is absent or stale", async () => {
    const project = createDefaultProject();
    project.assets.push({ id: "missing", name: "missing.bin", kind: "unknown", mimeType: "application/octet-stream", size: 4, lastModified: 1, source: "imported" });
    await expect(createEditorPortableFiles(project, async () => undefined)).rejects.toThrow("missing from the local cache");
    await expect(createEditorPortableFiles(project, async () => new Blob([new Uint8Array(3)]))).rejects.toThrow("does not match its catalog size");
  });

  test("rejects asset packs that do not agree with project metadata", () => {
    const project = createDefaultProject();
    project.assets.push({ id: "owned", name: "owned.bin", kind: "unknown", mimeType: "application/octet-stream", size: 2, lastModified: 1, source: "imported" });
    expect(() => validatePortableAssetCatalog(project, [])).toThrow("project.json expects 1");
    expect(() => validatePortableAssetCatalog(project, [{ id: "other", name: "owned.bin", mimeType: "application/octet-stream", sha256: "0".repeat(64), bytes: new Uint8Array(2) }])).toThrow("unexpected asset other");
  });
});
