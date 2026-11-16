import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createFileSwarmArtifactStore } from "./artifacts";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
test("content-addressed evidence survives store restart, deduplicates and rejects corruption", async () => {
  const root = resolve(import.meta.dir, "../../../../.local"); await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "swarm-artifacts-test-")); directories.push(directory);
  const store = createFileSwarmArtifactStore({ directory }), bytes = new TextEncoder().encode("reviewable patch");
  const artifact = await store.put({ name: "candidate.patch", mediaType: "text/x-diff", bytes });
  const copy = await store.put({ name: "same.patch", mediaType: "text/x-diff", bytes }); expect(copy.sha256).toBe(artifact.sha256);
  expect(await createFileSwarmArtifactStore({ directory }).read({ sha256: artifact.sha256 })).toEqual(bytes);
  await expect(store.read({ sha256: "../../escape" })).rejects.toThrow("hash");
  await writeFile(join(directory, artifact.key), "corrupt");
  await expect(store.read({ sha256: artifact.sha256 })).rejects.toThrow("integrity");
  await expect(store.put({ name: "duplicate", mediaType: "text/plain", bytes })).rejects.toThrow("integrity");
});
