import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  readBoundedUtf8File,
  readBoundedUtf8FileSync,
} from "@hyperfocus/pad-pilot/bounded-file";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { force: true, recursive: true });
  }
});

function createRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "padpilot-bounded-file-"));
  tempRoots.push(root);
  return root;
}

describe("bounded file readers", () => {
  it("reads regular UTF-8 files through async and sync boundaries", async () => {
    const filePath = path.join(createRoot(), "value.txt");
    writeFileSync(filePath, "valid UTF-8");

    expect(await readBoundedUtf8File(filePath, 64, "Fixture")).toBe("valid UTF-8");
    expect(readBoundedUtf8FileSync(filePath, 64, "Fixture")).toBe("valid UTF-8");
  });

  it("rejects oversized and linked inputs before reading them", async () => {
    const root = createRoot();
    const filePath = path.join(root, "value.txt");
    const linkPath = path.join(root, "linked.txt");
    writeFileSync(filePath, "too large");
    symlinkSync(filePath, linkPath, "file");

    await expect(readBoundedUtf8File(filePath, 4, "Fixture")).rejects.toThrow("exceeds");
    expect(() => readBoundedUtf8FileSync(filePath, 4, "Fixture")).toThrow("exceeds");
    await expect(readBoundedUtf8File(linkPath, 64, "Fixture")).rejects.toThrow("regular file");
    expect(() => readBoundedUtf8FileSync(linkPath, 64, "Fixture")).toThrow("regular file");
  });
});
