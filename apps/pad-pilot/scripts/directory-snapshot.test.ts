import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { snapshotDirectory } from "./directory-snapshot";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

function createRoot(label: string) {
  const root = mkdtempSync(path.join(tmpdir(), label));
  tempRoots.push(root);
  return root;
}

describe("snapshotDirectory", () => {
  it("bounds iterative traversal depth without recursive stack growth", async () => {
    const root = createRoot("padpilot-snapshot-depth-");
    const deep = path.join(root, "one", "two", "three");
    mkdirSync(deep, { recursive: true });
    writeFileSync(path.join(deep, "value.txt"), "deep");

    await expect(snapshotDirectory(root, { maxDepth: 2 })).rejects.toThrow("directory levels");
  });

  it("bounds filesystem entry and file inventories before hashing", async () => {
    const root = createRoot("padpilot-snapshot-count-");
    for (let index = 0; index < 4; index += 1) {
      writeFileSync(path.join(root, `value-${index}.txt`), String(index));
    }

    await expect(snapshotDirectory(root, { maxEntries: 3 })).rejects.toThrow("filesystem entries");
    await expect(snapshotDirectory(root, { maxFiles: 3 })).rejects.toThrow("files");
  });

  it("stops per-file and aggregate reads at configured byte budgets", async () => {
    const root = createRoot("padpilot-snapshot-bytes-");
    writeFileSync(path.join(root, "first.bin"), "1234");
    writeFileSync(path.join(root, "second.bin"), "5678");

    await expect(snapshotDirectory(root, { maxFileBytes: 3 })).rejects.toThrow("byte budget");
    await expect(snapshotDirectory(root, { maxTotalBytes: 7 })).rejects.toThrow("byte budget");
  });
});
