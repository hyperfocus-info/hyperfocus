import { describe, expect, test } from "bun:test";
import { filterEditorCommands, type EditorPaletteCommand } from "./editor-command-palette";

const commands: EditorPaletteCommand[] = [
  { id: "workspace-stage", label: "Open Stage", detail: "Edit the active scene", run() {} },
  { id: "project-save", label: "Save Project", detail: "Write portable files", run() {} },
  { id: "entity-player", label: "Select Player", detail: "actor layer 2", run() {} },
];

describe("editor command palette", () => {
  test("ranks direct matches before ordered fuzzy matches", () => {
    const saveMatches = filterEditorCommands(commands, "save").map((command) => command.id);
    expect(saveMatches[0]).toBe("project-save");
    expect(saveMatches).toContain("workspace-stage");
    expect(filterEditorCommands(commands, "op st").map((command) => command.id)).toEqual(["workspace-stage", "project-save"]);
    expect(filterEditorCommands(commands, "slpl").map((command) => command.id)).toEqual(["entity-player"]);
  });

  test("returns the stable application order for an empty query", () => {
    expect(filterEditorCommands(commands, "  ")).toEqual(commands);
  });
});
