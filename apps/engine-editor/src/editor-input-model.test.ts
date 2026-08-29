import { describe, expect, test } from "bun:test";
import { addEditorInputAction, addEditorInputBinding, editorInputConflicts, findEditorInputActionUsages, gamepadBinding, keyboardEventBinding, removeEditorInputAction, removeEditorInputBinding, renameEditorInputAction } from "./editor-input-model.ts";
import { createDefaultProject } from "@hyperfocus/engine/project";

describe("editor input authoring model", () => {
  test("captures bindings and reports conflicts", () => {
    const project = createDefaultProject();
    addEditorInputAction(project, "dash");
    addEditorInputBinding(project, "dash", keyboardEventBinding({ code: "Space" }));
    addEditorInputBinding(project, "move-up", "Space");
    expect(editorInputConflicts(project)).toEqual([{ binding: "Space", actions: ["dash", "move-up"] }]);
    removeEditorInputBinding(project, "move-up", "Space");
    expect(editorInputConflicts(project)).toEqual([]);
    expect(gamepadBinding(0, 2)).toBe("Gamepad0.Button2");
  });

  test("renames component action references and blocks deletion while they are used", () => {
    const project = createDefaultProject();
    addEditorInputAction(project, "fire");
    project.scenes[0].entities[0].components.push({ id: "fire-sound", type: "audio", enabled: true, values: { trigger: "action:fire", assetId: "sound" } });
    project.scenes[0].entities[0].components.push({ id: "fire-behavior", type: "behavior", enabled: true, values: { module: "./src/game.ts", export: "update", fireAction: "fire" } });
    expect(findEditorInputActionUsages(project, "fire")).toHaveLength(2);
    expect(() => removeEditorInputAction(project, "fire")).toThrow("used in 2 places");
    renameEditorInputAction(project, "fire", "shoot");
    expect(project.scenes[0].entities[0].components.at(-2)?.values.trigger).toBe("action:shoot");
    expect(project.scenes[0].entities[0].components.at(-1)?.values.fireAction).toBe("shoot");
  });
});
