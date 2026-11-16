import { describe, expect, test } from "bun:test";
import { createCliProcessManager, CLI_PROCESS_OUTPUT_CAP_BYTES } from "./cli-process-manager";

describe("CliProcessManager", () => {
  test("caps noninteractive stdout and reports limit", async () => {
    const manager = createCliProcessManager();
    const result = await manager.runNonInteractive({
      cmd: [process.execPath, "-e", `process.stdout.write("x".repeat(${CLI_PROCESS_OUTPUT_CAP_BYTES + 1024}))`],
      cwd: process.cwd(),
      cols: 80,
      rows: 24,
      idleTimeoutMs: 0,
      totalTimeoutMs: 30_000
    });

    expect(result.outputLimitExceeded).toBe(true);
    expect(result.outputLimitMessage).toContain("stdout output exceeded cap");
    expect(new TextEncoder().encode(result.stdout).byteLength).toBeLessThanOrEqual(CLI_PROCESS_OUTPUT_CAP_BYTES);
  });

  test("noninteractive commands receive EOF instead of waiting on an unused input pipe", async () => {
    const result = await createCliProcessManager().runNonInteractive({
      cmd: [process.execPath, "-e", "process.stdin.on('end', () => console.log('stdin closed')); process.stdin.resume();"],
      cwd: process.cwd(), cols: 80, rows: 24, idleTimeoutMs: 0, totalTimeoutMs: 2_000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("stdin closed");
    expect(result.timedOut).toBe(false);
  });

  test("a failing output consumer terminates its command before rejecting", async () => {
    let pid = 0;
    const result = createCliProcessManager().runNonInteractive({
      cmd: [process.execPath, "-e", "process.stdout.write(String(process.pid)); setInterval(() => {}, 1000);"],
      cwd: process.cwd(), cols: 80, rows: 24, idleTimeoutMs: 0, totalTimeoutMs: 5_000,
      onStdout(data) { pid = Number(new TextDecoder().decode(data).trim()); throw new Error("consumer failed"); },
    });
    await expect(result).rejects.toThrow("consumer failed");
    expect(pid).toBeGreaterThan(0);
    expect(() => process.kill(pid, 0)).toThrow();
  });
});
