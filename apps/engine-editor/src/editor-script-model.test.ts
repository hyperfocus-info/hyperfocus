import { describe, expect, test } from "bun:test";
import { attachEditorScriptBehavior, createEditorScript, findEditorScriptReferences, readEditorBehaviorDefinitions, readEditorScripts, removeEditorScript, renameEditorScript, upsertEditorBehaviorDefinition } from "./editor-script-model.ts";
import { createDefaultProject } from "@hyperfocus/engine/project";

describe("editor script authoring model", () => {
  test("creates, attaches, renames, finds references, and safely removes project source", () => {
    const project = createDefaultProject();
    const path = createEditorScript(project, "src/hero.ts");
    const componentId = attachEditorScriptBehavior(project, "player-01", path, "update");
    expect(readEditorBehaviorDefinitions(project)).toMatchObject([{ module: "./src/hero.ts", exportName: "update", fields: [{ key: "speed", default: 180 }] }]);
    expect(project.scenes.flatMap((scene) => scene.entities).find((entity) => entity.id === "player-01")?.components.find((component) => component.id === componentId)?.values.speed).toBe(180);
    expect(findEditorScriptReferences(project, path)).toHaveLength(1);
    expect(renameEditorScript(project, path, "src/player/hero.ts")).toBe("src/player/hero.ts");
    expect(findEditorScriptReferences(project, "src/player/hero.ts")).toHaveLength(1);
    expect(readEditorBehaviorDefinitions(project)[0]?.module).toBe("./src/player/hero.ts");
    expect(readEditorScripts(project).files[0]?.source).toContain('"module": "./src/player/hero.ts"');
    expect(() => removeEditorScript(project, "src/player/hero.ts")).toThrow("attached");
    removeEditorScript(project, "src/player/hero.ts", { detachBehaviors: true });
    expect(readEditorScripts(project).files).toEqual([]);
    expect(readEditorBehaviorDefinitions(project)).toEqual([]);
  });

  test("accepts validated compiled metadata as the portable inspector definition", () => {
    const project = createDefaultProject();
    upsertEditorBehaviorDefinition(project, { version: 1, id: "dash", module: "./src/dash.ts", exportName: "update", label: "Dash", description: "Dashes.", fields: [{ key: "speed", label: "Speed", type: "number", default: 500 }] });
    expect(readEditorBehaviorDefinitions(project)[0]?.label).toBe("Dash");
  });

  test("rejects duplicate and escaping paths", () => {
    const project = createDefaultProject();
    createEditorScript(project, "src/game.ts");
    expect(() => createEditorScript(project, "./src/game.ts")).toThrow("already exists");
    expect(() => createEditorScript(project, "../outside.ts")).toThrow("inside the project");
  });
});
