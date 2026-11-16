import { describe, expect, test } from "bun:test";
import {
  buildBunTestPlan,
  DEFAULT_TEST_PARALLEL_DELAY_MS,
  createHarnessTestRunRoot,
  removeHarnessTestRunRoot,
  resolveDefaultWorkerCount,
  stripFlag
} from "./test-runner";
import { existsSync } from "node:fs";
import path from "node:path";

describe("test runner defaults", () => {
  test("caps default worker count at tuned parallel ceiling", () => {
    expect(resolveDefaultWorkerCount(32, "linux")).toBe(12);
    expect(resolveDefaultWorkerCount(8, "linux")).toBe(8);
    expect(resolveDefaultWorkerCount(32, "win32")).toBe(4);
    expect(resolveDefaultWorkerCount(1, "win32")).toBe(1);
  });

  test("injects tuned parallel defaults when caller does not provide them", () => {
    const plan = buildBunTestPlan([], {}, 32, "linux");
    expect(plan.bunArgs).toEqual(["test", "--parallel=12", `--parallel-delay=${DEFAULT_TEST_PARALLEL_DELAY_MS}`]);
    expect(plan.workerCount).toBe(12);
    expect(plan.parallelDelayMs).toBe(DEFAULT_TEST_PARALLEL_DELAY_MS);
  });

  test("respects explicit bun parallel flags", () => {
    const plan = buildBunTestPlan(["--parallel=4", "--parallel-delay=9", "harness/cli/src/server-tests/runtime-budget.test.ts"], {}, 32, "linux");
    expect(plan.bunArgs).toEqual(["test", "--parallel=4", "--parallel-delay=9", "harness/cli/src/server-tests/runtime-budget.test.ts"]);
    expect(plan.workerCount).toBe(4);
    expect(plan.parallelDelayMs).toBe(9);
  });

  test("supports harness worker alias and strips it before bun invocation", () => {
    const plan = buildBunTestPlan(["--workers", "6", "--timeout=1000"], {}, 32, "linux");
    expect(plan.bunArgs).toEqual(["test", "--parallel=6", `--parallel-delay=${DEFAULT_TEST_PARALLEL_DELAY_MS}`, "--timeout=1000"]);
    expect(plan.workerCount).toBe(6);
  });

  test("falls back to env override when alias absent", () => {
    const plan = buildBunTestPlan(["--timeout=1000"], { HARNESS_TEST_WORKERS: "5", HARNESS_TEST_PARALLEL_DELAY: "3" }, 32, "linux");
    expect(plan.bunArgs).toEqual(["test", "--parallel=5", "--parallel-delay=3", "--timeout=1000"]);
    expect(plan.workerCount).toBe(5);
    expect(plan.parallelDelayMs).toBe(3);
  });

  test("drops forwarded delimiter before building bun args", () => {
    const plan = buildBunTestPlan(["--", "packages/ai-core/src/harness/mode-intent.test.ts"], {}, 32, "linux");
    expect(plan.bunArgs).toEqual(["test", "--parallel=12", `--parallel-delay=${DEFAULT_TEST_PARALLEL_DELAY_MS}`, "packages/ai-core/src/harness/mode-intent.test.ts"]);
  });

  test("stripFlag removes both inline and split flag forms", () => {
    expect(stripFlag(["--workers=5", "--workers", "4", "--timeout=1000"], "--workers")).toEqual(["--timeout=1000"]);
  });

  test("creates and removes a run-owned OS temp root", async () => {
    const rootPath = await createHarnessTestRunRoot();
    const relativeToRepository = path.relative(path.resolve(import.meta.dir, "../../../.."), rootPath);
    expect(relativeToRepository.startsWith("..") || path.isAbsolute(relativeToRepository)).toBe(true);
    expect(existsSync(rootPath)).toBe(true);
    await removeHarnessTestRunRoot(rootPath);
    expect(existsSync(rootPath)).toBe(false);
  });
});
