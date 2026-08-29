import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHarnessTestTempPath, isRunnerOwnedHarnessTestPath, resolveHarnessTestTempRoot } from "./test-temp-root";

const originalRoot = process.env.HARNESS_TEST_TMP_ROOT;

afterEach(() => {
  if (originalRoot === undefined) {
    delete process.env.HARNESS_TEST_TMP_ROOT;
  } else {
    process.env.HARNESS_TEST_TMP_ROOT = originalRoot;
  }
});

describe("harness test temp root", () => {
  test("uses the runner-owned OS temp root instead of the repository", async () => {
    const runRoot = await mkdtemp(path.join(os.tmpdir(), "hyperfocus-test-root-test-"));
    process.env.HARNESS_TEST_TMP_ROOT = runRoot;
    try {
      expect(resolveHarnessTestTempRoot()).toBe(path.resolve(runRoot));
      expect(createHarnessTestTempPath("git fixture", ".sqlite")).toMatch(
        new RegExp(`^${escapeRegex(path.resolve(runRoot))}.*git-fixture-.*\\.sqlite$`)
      );
      expect(existsSync(runRoot)).toBe(true);
      expect(isRunnerOwnedHarnessTestPath(path.join(runRoot, "fixture"))).toBe(true);
      expect(isRunnerOwnedHarnessTestPath(path.dirname(runRoot))).toBe(false);
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });
});

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
