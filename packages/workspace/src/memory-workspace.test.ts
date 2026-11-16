import { describe, expect, test } from "bun:test";
import { createMemoryWorkspaceFileSystem } from "./memory-workspace";
import type { WorkspaceFileChangeEvent } from "./workspace";

describe("memory workspace filesystem", () => {
  test("nested watcher writes follow the complete committed batch for every subscriber", async () => {
    const fs = createMemoryWorkspaceFileSystem();
    const seen: WorkspaceFileChangeEvent[] = [];
    fs.watch((event) => {
      if (event.type === "created" && event.path === "article") {
        void fs.writeFile({ path: "index", contents: "derived" });
        fs.$invalidate({ reason: "external-change" });
      }
    });
    fs.watch((event) => { seen.push(event); });
    await fs.writeFilesAtomic({ writes: [{ path: "article", contents: "release" }, { path: "metadata", contents: "published" }] });
    expect(seen.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(seen.map((event) => event.type === "invalidated" ? "invalidated" : event.path)).toEqual(["article", "metadata", "index", "invalidated"]);
    expect(seen.every(Object.isFrozen)).toBe(true);
  });

  test("uses revisions to reject lost updates", async () => {
    const filesystem = createMemoryWorkspaceFileSystem({ initialFiles: { "src/app.ts": "old" } });
    const original = await filesystem.readFile({ path: "src/app.ts" });
    expect(original?.revision).toBe(1);

    const first = await filesystem.writeFile({ path: "src/app.ts", contents: "first", expectedRevision: original?.revision });
    expect(first).toEqual({ status: "written", snapshot: { path: "src/app.ts", contents: "first", revision: 2 } });
    const stale = await filesystem.writeFile({ path: "src/app.ts", contents: "stale", expectedRevision: original?.revision });
    expect(stale).toEqual({
      status: "conflict",
      conflict: { path: "src/app.ts", expectedRevision: 1, current: { path: "src/app.ts", contents: "first", revision: 2 } }
    });
    expect((await filesystem.readFile({ path: "src/app.ts" }))?.contents).toBe("first");
  });

  test("checks every precondition before committing an atomic batch", async () => {
    const filesystem = createMemoryWorkspaceFileSystem({ initialFiles: { "a.ts": "a", "b.ts": "b" } });
    const result = await filesystem.writeFilesAtomic({ writes: [
      { path: "a.ts", contents: "changed", expectedRevision: 1 },
      { path: "b.ts", contents: "must-not-commit", expectedRevision: 9 }
    ] });
    expect(result.status).toBe("conflict");
    expect((await filesystem.readFile({ path: "a.ts" }))?.contents).toBe("a");
    expect((await filesystem.readFile({ path: "b.ts" }))?.contents).toBe("b");
  });

  test("emits ordered revisions and explicit resnapshot invalidation", async () => {
    const filesystem = createMemoryWorkspaceFileSystem();
    const events: WorkspaceFileChangeEvent[] = [];
    filesystem.watch((event) => events.push(event));

    await filesystem.writeFilesAtomic({ writes: [
      { path: "src/a.ts", contents: "a", expectedRevision: 0 },
      { path: "src/b.ts", contents: "b", expectedRevision: 0 }
    ] });
    await filesystem.deleteFile({ path: "src/a.ts", expectedRevision: 1 });
    filesystem.$invalidate({ reason: "external-change" });

    expect(events).toEqual([
      { type: "created", path: "src/a.ts", revision: 1, sequence: 1 },
      { type: "created", path: "src/b.ts", revision: 1, sequence: 2 },
      { type: "deleted", path: "src/a.ts", revision: 2, sequence: 3 },
      { type: "invalidated", reason: "external-change", resnapshot: true, sequence: 4 }
    ]);
  });

  test("normalizes paths and lists only direct children", async () => {
    const filesystem = createMemoryWorkspaceFileSystem({ initialFiles: {
      "src\\app.ts": "hello",
      "src/features/chat.ts": "chat",
      "README.md": "readme"
    } });
    expect(await filesystem.listFiles({ path: "src" })).toEqual([
      { path: "src/app.ts", name: "app.ts", kind: "file", size: 5 },
      { path: "src/features", name: "features", kind: "directory" }
    ]);
  });

  test("a watcher cannot corrupt another watcher's sequence or stop delivery", async () => {
    const filesystem = createMemoryWorkspaceFileSystem();
    const events: WorkspaceFileChangeEvent[] = [];
    filesystem.watch(event => { Reflect.set(event, "sequence", 999); throw new Error("view failed"); });
    filesystem.watch(event => events.push(event));
    await filesystem.writeFile({ path: "a", contents: "a" });
    filesystem.$invalidate({ reason: "overflow" });
    await filesystem.deleteFile({ path: "a" });
    expect(events.map(event => event.sequence)).toEqual([1, 2, 3]);
    expect(events.every(Object.isFrozen)).toBe(true);
  });

  test("rejects file-directory collisions in either order and before any batch mutation", async () => {
    for (const initialFiles of [{ folder: "file", "folder/child": "child" }, { "folder/child": "child", folder: "file" }]) {
      expect(() => createMemoryWorkspaceFileSystem({ initialFiles })).toThrow("both a file and a directory");
    }
    const filesystem = createMemoryWorkspaceFileSystem({ initialFiles: { "folder/child": "original" } });
    const events: WorkspaceFileChangeEvent[] = [];
    filesystem.watch(event => events.push(event));
    await expect(filesystem.writeFilesAtomic({ writes: [
      { path: "independent", contents: "must not commit" }, { path: "folder", contents: "file" },
    ] })).rejects.toThrow("both a file and a directory");
    expect(await filesystem.readFile({ path: "independent" })).toBeUndefined();
    expect(events).toEqual([]);
    await expect(filesystem.writeFilesAtomic({ writes: [
      { path: "other/child", contents: "child" }, { path: "other", contents: "file" },
    ] })).rejects.toThrow("both a file and a directory");
    await filesystem.writeFile({ path: "folder/child", contents: "revised" });
    await filesystem.deleteFile({ path: "folder/child" });
    expect((await filesystem.writeFile({ path: "folder", contents: "now a file" })).status).toBe("written");
    await expect(filesystem.writeFile({ path: "folder/child", contents: "invalid" })).rejects.toThrow("both a file and a directory");
    expect((await filesystem.readFile({ path: "folder" }))?.contents).toBe("now a file");
  });
});
