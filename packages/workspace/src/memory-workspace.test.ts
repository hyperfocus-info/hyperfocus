import { describe, expect, test } from "bun:test";
import { createMemoryWorkspaceFileSystem } from "./memory-workspace";
import type { WorkspaceFileChangeEvent } from "./workspace";

describe("memory workspace filesystem", () => {
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
});
