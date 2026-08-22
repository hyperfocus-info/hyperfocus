import { describe, expect, test } from "bun:test";
import { createSourceDocument } from "./document";

describe("source document", () => {
  test("tracks dirty state through edit, save, and reload", async () => {
    const saved: string[] = [];
    const document = createSourceDocument({ uri: "src/player.ts", language: "typescript", text: "one", save: async (text) => { saved.push(text); } });
    document.setText("two");
    expect(document.getSnapshot().dirty).toBe(true);
    await document.save();
    expect(saved).toEqual(["two"]);
    expect(document.getSnapshot().dirty).toBe(false);
    document.reload("three");
    expect(document.getSnapshot()).toMatchObject({ text: "three", savedText: "three", dirty: false });
  });

  test("does not erase an edit made while save is pending", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const document = createSourceDocument({ uri: "a.ts", language: "typescript", text: "a", save: () => pending });
    document.setText("b");
    const saving = document.save();
    document.setText("c");
    finish();
    await saving;
    expect(document.getSnapshot()).toMatchObject({ text: "c", savedText: "b", dirty: true });
  });
});

