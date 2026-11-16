import { deepStrictEqual } from "node:assert";
import { expect, test } from "bun:test";
import { inputWorkload, replayWorkload, streamWorkload, pluginWorkload, backupWorkload } from "./workloads";
import { createPortableMemoryPersistenceAdapter, restorePortablePersistenceBackup } from "@hyperfocus/engine/server";

test("each candidate preserves the real domain payload, including full replay order and plugin bytes", async () => {
  for (const workload of [inputWorkload(), replayWorkload(), streamWorkload(1), streamWorkload(), pluginWorkload(), await backupWorkload()]) {
    for (const candidate of workload.candidates) {
      const bytes = candidate.encode();
      expect(bytes.length).toBeGreaterThan(0);
      deepStrictEqual(candidate.decode(bytes), workload.value, `${workload.name}/${candidate.name}`);
    }
  }
});

test("backup candidates restore through the existing checksum and domain validation boundary", async () => {
  const workload = await backupWorkload();
  for (const candidate of workload.candidates) {
    const adapter = createPortableMemoryPersistenceAdapter();
    const envelope = candidate.decode(candidate.encode());
    await restorePortablePersistenceBackup(adapter, JSON.stringify(envelope));
    expect((await adapter.exportPortableSnapshot()).players).toHaveLength(512);
  }
});
