import { describe, expect, test } from "bun:test";
import path from "node:path";
import { spawnBackgroundProcess, terminateProcessTree } from "@hyperfocus/desktop-runtime/process";
import { inspectWindowsProcessTrees } from "./windows-inspection";

const fixture = path.join(import.meta.dir, "fixtures", "background-lifecycle.ts");

async function waitForFixture(output: ReadableStream<Uint8Array> | null | undefined) {
  if (!output) throw new Error("Fixture did not expose captured output.");
  const reader = output.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    deadline = setTimeout(() => reject(new Error(`Fixture startup timed out: ${text}`)), 8_000);
  });
  try {
    while (!text.includes('"role":"build"') || !text.includes('"role":"hot-server"')) {
      const next = await Promise.race([reader.read(), timeout]);
      if (next.done) throw new Error(`Fixture exited before all nested children started: ${text}`);
      text += decoder.decode(next.value, { stream: true });
    }
  } finally {
    clearTimeout(deadline);
    reader.releaseLock();
  }
  return text.trim().split(/\r?\n/).map((line) => {
    const value: unknown = JSON.parse(line);
    if (!value || typeof value !== "object" || !("pid" in value) || typeof value.pid !== "number"
      || !Number.isSafeInteger(value.pid) || value.pid <= 0) throw new Error(`Invalid fixture PID: ${line}`);
    return value.pid;
  });
}

describe.skipIf(process.platform !== "win32")("Windows background process lifecycle", () => {
  test("detached supervisor and inherited-stdio Bun descendants never show windows and are reaped", async () => {
    const child = spawnBackgroundProcess({ cmd: [process.execPath, fixture], detached: true });
    let pids: number[] = [child.pid];
    try {
      pids = await waitForFixture(child.stdout);
      const running = inspectWindowsProcessTrees({ rootPids: [child.pid] });
      expect(running.processes.filter((entry) => entry.name.toLowerCase() === "bun.exe").length).toBeGreaterThanOrEqual(4);
      expect(running.visibleWindows).toEqual([]);
    } finally {
      await terminateProcessTree({ process: child });
    }
    expect(inspectWindowsProcessTrees({ rootPids: pids }).processes).toEqual([]);
  }, 30_000);

  test("parent failure reaps its dev server, hot server, and in-flight build", async () => {
    const child = spawnBackgroundProcess({ cmd: [process.execPath, fixture, "supervisor", "--fail-parent"], detached: true });
    let pids: number[] = [child.pid];
    try {
      pids = await waitForFixture(child.stdout);
      expect(await child.exited).toBe(23);
      expect(inspectWindowsProcessTrees({ rootPids: pids }).processes).toEqual([]);
    } finally {
      for (const pid of pids) await terminateProcessTree({ pid });
    }
  }, 30_000);
});
