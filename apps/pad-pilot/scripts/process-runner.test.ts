import { describe, expect, it } from "bun:test";
import path from "node:path";
import {
  cmakeEnvironment,
  spawnSyncWithDeadline,
  waitForProcessWithDeadline,
} from "./process-runner";

const projectRoot = path.resolve(import.meta.dir, "..");

describe("process runner", () => {
  it("enforces a subprocess deadline", () => {
    const result = spawnSyncWithDeadline(
      [process.execPath, "-e", "await Bun.sleep(10_000)"],
      {
        cwd: projectRoot,
        label: "deadline fixture",
        stderr: "pipe",
        stdout: "pipe",
        timeoutMs: 50,
      },
    );

    expect(result.exitCode).not.toBe(0);
  });

  it("removes ambient CMake generator overrides", () => {
    const previous = process.env.CMAKE_GENERATOR;
    process.env.CMAKE_GENERATOR = "unsafe fixture";
    try {
      expect(cmakeEnvironment().CMAKE_GENERATOR).toBeUndefined();
    } finally {
      if (previous === undefined) {
        delete process.env.CMAKE_GENERATOR;
      } else {
        process.env.CMAKE_GENERATOR = previous;
      }
    }
  });

  it("reaps an asynchronous subprocess after its deadline before rejecting", async () => {
    let resolveExit = (_exitCode: number) => {};
    const exited = new Promise<number>((resolve) => {
      resolveExit = resolve;
    });
    let reaped = false;
    const subprocess = {
      exited,
      kill() {
        setTimeout(() => {
          reaped = true;
          resolveExit(137);
        }, 25);
      },
    };

    await expect(waitForProcessWithDeadline(subprocess, 10, "async fixture")).rejects.toThrow(
      "async fixture timed out after 10 ms",
    );
    expect(reaped).toBe(true);
  });
});
