import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { countLines } from "./lines-of-code";

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("countLines", () => {
  it("does not invent a blank line after a trailing newline", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-loc-"));
    roots.push(root);
    const file = path.join(root, "source.ts");
    writeFileSync(file, "one\ntwo\n");
    expect(await countLines(file)).toBe(2);
  });
});
