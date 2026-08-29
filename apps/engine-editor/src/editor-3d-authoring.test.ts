import { describe, expect, test } from "bun:test";
import { createEditorStarter } from "./starter-projects.ts";
import { createEditor3DEntity, createEditor3DLight, createEditor3DMaterial, duplicateEditor3DEntity, placeImportedGltf, readEditor3DDeclaration, removeEditor3DEntity } from "./editor-3d-authoring.ts";

describe("editor 3D authoring", () => {
  test("adds, duplicates, removes, and places portable glTF objects", () => {
    const project = createEditorStarter("3d-action", "World").project;
    const materialId = createEditor3DMaterial(project, "custom");
    const objectId = createEditor3DEntity(project, { id: "crate", materialId });
    const duplicateId = duplicateEditor3DEntity(project, objectId);
    expect(duplicateId).toBe("crate-copy");
    removeEditor3DEntity(project, duplicateId);
    expect(placeImportedGltf(project, "level-gltf")).toMatch(/starter-level/);
    expect(createEditor3DLight(project, "point")).toContain("point-light");
    expect(readEditor3DDeclaration(project)?.materials.some((material) => material.id === materialId)).toBe(true);
  });
});
