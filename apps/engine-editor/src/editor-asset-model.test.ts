import { describe, expect, test } from "bun:test";
import { findEditorAssetUsages, removeEditorAssetMetadata, renameEditorAsset } from "./editor-asset-model.ts";
import { createDefaultProject } from "@hyperfocus/engine/project";

describe("editor asset authoring model", () => {
  test("finds usages and prevents accidental removal", () => {
    const project = createDefaultProject();
    project.assets.push({ id: "hero", name: "hero.png", kind: "image", mimeType: "image/png", size: 12, lastModified: 1, source: "imported" });
    project.scenes[0].entities[0].components.find((component) => component.type === "sprite")!.values.asset = "hero";
    project.tilemap.sourceAssetId = "hero";
    project.atlas.sourceAssetId = "hero";
    expect(findEditorAssetUsages(project, "hero").map((usage) => usage.kind)).toEqual(["component", "tilemap", "atlas"]);
    expect(() => removeEditorAssetMetadata(project, "hero")).toThrow("used in 3 places");
    removeEditorAssetMetadata(project, "hero", { force: true });
    expect(project.assets.some((asset) => asset.id === "hero")).toBe(false);
    expect(project.tilemap.sourceAssetId).toBeUndefined();
    expect(project.atlas.sourceAssetId).toBeUndefined();
  });

  test("renames without changing the stable asset id", () => {
    const project = createDefaultProject();
    const asset = project.assets[0];
    renameEditorAsset(project, asset.id, "Renamed asset");
    expect(asset).toMatchObject({ id: asset.id, name: "Renamed asset" });
  });
});
