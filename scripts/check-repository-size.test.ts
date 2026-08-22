import { describe, expect, test } from "bun:test";
import { collectExistingRepositoryEntries, findRepositoryPolicyViolations, MAX_GIT_FILE_BYTES } from "./check-repository-size";

describe("repository size policy", () => {
  test("rejects oversized files and source asset packs", () => {
    expect(findRepositoryPolicyViolations([
      { path: "engine/src/index.ts", size: 10 },
      { path: "large.bin", size: MAX_GIT_FILE_BYTES + 1 },
      { path: "engine/examples/demo/assets/source/archive.zip", size: 20 }
    ])).toHaveLength(2);
  });

  test("ignores tracked files deleted in the working tree", async () => {
    const entries = await collectExistingRepositoryEntries(["kept.ts", "deleted.css"], async (filePath) => {
      if (filePath === "deleted.css") throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return 42;
    });

    expect(entries).toEqual([{ path: "kept.ts", size: 42 }]);
  });
});
