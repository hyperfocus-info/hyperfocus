import { describe, expect, test } from "bun:test";
import { createSourceDocument } from "./document";

describe("source document", () => {
  test("flush serializes concurrent callers and saves edits made during an active write", async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    const writes: string[] = [];
    const document = createSourceDocument({ uri: "article", language: "text", text: "", save: async (text) => { writes.push(text); await gate; } });
    document.setText("draft");
    const first = document.save();
    document.setText("release");
    const flushed = document.flush();
    const second = document.flush();
    await Promise.resolve();
    expect(writes).toEqual(["draft"]);
    finish();
    await Promise.all([first, flushed, second]);
    expect(writes).toEqual(["draft", "release"]);
    expect(document.getSnapshot()).toMatchObject({ savedText: "release", saving: false, dirty: false });
  });

  test("flush reports host failures, leaves edits dirty, and can retry", async () => {
    let fail = true;
    const document = createSourceDocument({ uri: "article", language: "text", text: "", save: async () => { if (fail) throw new Error("disk full"); } });
    document.setText("release");
    await expect(document.flush()).rejects.toThrow("disk full");
    expect(document.getSnapshot()).toMatchObject({ dirty: true, saving: false });
    fail = false;
    await document.flush();
    expect(document.getSnapshot().dirty).toBe(false);
  });

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

  test("isolates failing views through save failure, retry, and later edits", async () => {
    const writes: string[] = [];
    let fail = true;
    const document = createSourceDocument({ uri: "article.md", language: "markdown", text: "draft", save: async (text) => {
      if (fail) throw new Error("offline");
      writes.push(text);
    } });
    document.subscribe(() => { throw new Error("preview failed"); });
    const seen: boolean[] = [];
    document.subscribe((snapshot) => seen.push(snapshot.saving));
    document.setText("reviewed");
    await expect(document.save()).rejects.toThrow("offline");
    expect(document.getSnapshot()).toMatchObject({ saving: false, dirty: true });
    fail = false;
    await document.save();
    document.setText("published");
    await document.save();
    expect(writes).toEqual(["reviewed", "published"]);
    expect(document.getSnapshot()).toMatchObject({ saving: false, dirty: false, savedText: "published" });
    expect(seen).toContain(true);
    expect(seen.at(-1)).toBe(false);
  });

  test("snapshots are stable immutable values before and after notifications", () => {
    const document = createSourceDocument({ uri: "a", language: "text", text: "original" });
    const initial = document.getSnapshot();
    expect(Reflect.set(initial, "text", "corrupt")).toBe(false);
    document.subscribe((snapshot) => { Reflect.set(snapshot, "dirty", false); });
    document.setText("edited");
    expect(initial.text).toBe("original");
    expect(document.getSnapshot()).toMatchObject({ text: "edited", dirty: true, version: 1 });
  });

  test("reload retains its text but remains dirty when an older write commits last", async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    let disk = "old";
    const document = createSourceDocument({ uri: "a", language: "text", text: disk, save: async (text) => { await gate; disk = text; } });
    document.setText("pending");
    const saving = document.save();
    disk = "external";
    document.reload(disk);
    finish();
    await saving;
    expect(disk).toBe("pending");
    expect(document.getSnapshot()).toMatchObject({ text: "external", savedText: "pending", dirty: true, saving: false });
    await document.save();
    expect(disk).toBe("external");
    expect(document.getSnapshot().dirty).toBe(false);
  });
});
