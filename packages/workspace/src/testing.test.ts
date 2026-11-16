import { expect, test } from "bun:test";
import { verifyWorkspaceFileSystem } from "@hyperfocus/workspace/testing";
import { createMemoryWorkspaceFileSystem } from "./memory-workspace";

test("public conformance scenarios pass against the memory adapter and close every fixture", async () => {
  let closed = 0;
  const result = await verifyWorkspaceFileSystem({ create: () => ({
    filesystem: createMemoryWorkspaceFileSystem(), close: () => { closed++; },
  }) });
  expect(result).toEqual({ passed: true, checks: ["staleAtomicBatch", "deleteRecreate", "watcherIsolationAndOrder"] });
  expect(closed).toBe(3);
});

test("conformance rejects partial stale batches and still closes the failed fixture", async () => {
  let closed = 0;
  await expect(verifyWorkspaceFileSystem({ create: () => {
    const filesystem = createMemoryWorkspaceFileSystem();
    return { filesystem: { ...filesystem, async writeFilesAtomic({ writes }) {
      for (const write of writes) {
        const result = await filesystem.writeFile(write);
        if (result.status === "conflict") return { status: "conflict", conflicts: [result.conflict] };
      }
      return { status: "written", snapshots: [] };
    } }, close: () => { closed++; } };
  } })).rejects.toThrow("staleAtomicBatch: stale batch partially created a file");
  expect(closed).toBe(1);
});

test("conformance accepts read-only event proxies without requiring Object.freeze", async () => {
  const result = await verifyWorkspaceFileSystem({ create: () => {
    const filesystem = createMemoryWorkspaceFileSystem();
    return { filesystem: { ...filesystem, watch(listener) {
      return filesystem.watch(event => listener(new Proxy({ ...event }, {
        set: () => false, deleteProperty: () => false, defineProperty: () => false,
      })));
    } }, close: () => {} };
  } });
  expect(result.passed).toBe(true);
});
