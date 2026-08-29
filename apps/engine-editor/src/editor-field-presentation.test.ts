import { describe, expect, test } from "bun:test";
import { createDefaultProject } from "@hyperfocus/engine/project";
import { describeEditorField, editorComponentSelectFields, editorFieldLabel, groupBehaviorFields } from "./editor-field-presentation.ts";

describe("describeEditorField", () => {
  test("uses a switch for boolean data", () => {
    expect(describeEditorField("enabled", true)).toEqual({ kind: "boolean", inputType: "checkbox" });
  });

  test("adds alignment metadata and units to numeric data", () => {
    expect(describeEditorField("duration", 1.5)).toMatchObject({ kind: "number", inputMode: "decimal", minimum: 0, step: 0.01, unit: "s" });
    expect(describeEditorField("opacity", 0.5)).toMatchObject({ minimum: 0, maximum: 1, unit: "%" });
  });

  test("uses a native color control only for compatible values", () => {
    expect(describeEditorField("fillColor", "#43d8d1").kind).toBe("color");
    expect(describeEditorField("fillColor", "var(--accent)").kind).toBe("text");
  });

  test("surfaces velocity axes and keeps behavior binding internals advanced", () => {
    expect(describeEditorField("velocityX", 240)).toMatchObject({ kind: "number", unit: "units/s", step: 0.1 });
    expect(editorFieldLabel("leftScoreKey")).toBe("Left score key");
    expect(groupBehaviorFields({ module: "builtin:pong-ball", export: "pongBall", velocityX: 240, leftScoreKey: "score.left" })).toEqual({
      publicFields: [["velocityX", 240], ["leftScoreKey", "score.left"]],
      bindingFields: [["module", "builtin:pong-ball"], ["export", "pongBall"]],
    });
  });
});

describe("editorComponentSelectFields", () => {
  const project = createDefaultProject("Control options");

  test("limits sprite references to project images", () => {
    project.assets.push({ id: "audio-theme", name: "theme.ogg", kind: "audio", mimeType: "audio/ogg", size: 4, lastModified: 1, source: "imported" });
    const [field] = editorComponentSelectFields({ id: "sprite", type: "sprite", enabled: true, values: { asset: "asset-hero" } }, project);
    expect(field?.key).toBe("asset");
    expect(field?.options.map((option) => option.value)).toContain("asset-hero");
    expect(field?.options.map((option) => option.value)).not.toContain("audio-theme");
  });

  test("uses portable input actions and runtime-backed collider/UI enums", () => {
    const input = editorComponentSelectFields({ id: "input", type: "input", enabled: true, values: {} }, project)[0];
    expect(input?.options.map((option) => option.value)).toContain("move-left");
    expect(editorComponentSelectFields({ id: "collider", type: "collider", enabled: true, values: {} }, project)[0]?.options).toEqual([
      { value: "box", label: "Box" },
      { value: "aabb", label: "AABB" },
    ]);
    expect(editorComponentSelectFields({ id: "ui", type: "ui", enabled: true, values: {} }, project)[0]?.options.map((option) => option.value)).toEqual(["left", "center", "right"]);
  });
});
