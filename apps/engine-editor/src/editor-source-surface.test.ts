import { describe, expect, test } from "bun:test";
import { createEditorSourceSession } from "./editor-source-surface";

describe("editor source session boundary", () => {
  test("tracks dirty source and persists through the injected adapter", async () => {
    const saved: string[] = [];
    const document = createEditorSourceSession({ path: "src/player.ts", source: "export const speed = 1;", save: (source) => { saved.push(source); } });

    document.setText("export const speed = 2;");
    expect(document.getSnapshot()).toMatchObject({ uri: "src/player.ts", dirty: true, version: 1 });
    await document.save();

    expect(saved).toEqual(["export const speed = 2;"]);
    expect(document.getSnapshot()).toMatchObject({ dirty: false, savedText: "export const speed = 2;" });
  });

  test("does not call the backend for a clean document", async () => {
    let writes = 0;
    const document = createEditorSourceSession({ path: "src/game.ts", source: "// ready", save: () => { writes += 1; } });
    await document.save();
    expect(writes).toBe(0);
  });
});
