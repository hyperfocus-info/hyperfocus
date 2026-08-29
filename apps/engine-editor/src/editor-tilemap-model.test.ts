import { describe, expect, test } from "bun:test";
import { assignEditorTileset, commitExtractedTileCollision, resizeEditorTilemap, setEditorTile } from "./editor-tilemap-model.ts";
import { createDefaultProject } from "@hyperfocus/engine/project";

describe("editor tilemap authoring model", () => {
  test("resizes without discarding overlapping cells and persists collision metadata", () => {
    const project = createDefaultProject();
    setEditorTile(project, 1, 1, 9);
    resizeEditorTilemap(project, 20, 12);
    expect(project.tilemap.values[21]).toBe(9);
    commitExtractedTileCollision(project, [9, 3, 9]);
    expect(project.tilemap.solidValues).toEqual([3, 9]);
  });

  test("uses a selected image as the single-layer tileset without replacing the animation atlas", () => {
    const project = createDefaultProject();
    const atlasSource = project.atlas.sourceAssetId;
    project.assets.push({ id: "tiles", name: "tiles.png", kind: "image", mimeType: "image/png", size: 1, lastModified: 1, source: "imported" });
    assignEditorTileset(project, "tiles");
    expect(project.tilemap.sourceAssetId).toBe("tiles");
    expect(project.atlas.sourceAssetId).toBe(atlasSource);
  });
});
