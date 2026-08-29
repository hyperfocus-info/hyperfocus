import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deployVst3Bundle } from "./copy-vst3";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const tempRoot = tempRoots.pop();
    if (tempRoot) {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  }
});

function writeBundle(root: string, contents: string) {
  const binary = path.join(root, "Contents", "x86_64-win", "PadPilot.vst3");
  mkdirSync(path.dirname(binary), { recursive: true });
  writeFileSync(binary, contents);
}

describe("deployVst3Bundle", () => {
  it("stages a complete bundle before replacing the existing install", async () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-copy-vst3-"));
    tempRoots.push(tempRoot);
    const source = path.join(tempRoot, "source", "PadPilot.vst3");
    const destination = path.join(tempRoot, "installed", "PadPilot.vst3");
    writeBundle(source, "new binary");
    writeBundle(destination, "old binary");

    const result = await deployVst3Bundle(source, destination);
    expect(readFileSync(path.join(destination, "Contents", "x86_64-win", "PadPilot.vst3"), "utf8")).toBe("new binary");
    expect(result.retainedBackup).toBeNull();
  });

  it("leaves the installed bundle untouched when the source is incomplete", async () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-copy-vst3-invalid-"));
    tempRoots.push(tempRoot);
    const source = path.join(tempRoot, "source", "PadPilot.vst3");
    const destination = path.join(tempRoot, "installed", "PadPilot.vst3");
    mkdirSync(source, { recursive: true });
    writeBundle(destination, "old binary");

    await expect(deployVst3Bundle(source, destination)).rejects.toThrow("Built bundle not found");
    expect(readFileSync(path.join(destination, "Contents", "x86_64-win", "PadPilot.vst3"), "utf8")).toBe("old binary");
  });

  it("rejects path-like destination bundle names", async () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "padpilot-copy-vst3-path-"));
    tempRoots.push(tempRoot);
    const source = path.join(tempRoot, "source", "PadPilot.vst3");
    const destination = path.join(tempRoot, "installed", "not-padpilot");
    writeBundle(source, "new binary");

    await expect(deployVst3Bundle(source, destination)).rejects.toThrow("must be PadPilot.vst3");
  });
});
