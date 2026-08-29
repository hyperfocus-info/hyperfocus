import { describe, expect, it, setDefaultTimeout } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  devProcessRegistryByteLimit,
  matchesRegisteredDevProcess,
  parseDevProcessRegistry,
  queryWindowsProcess,
  readDevProcessRegistry,
  terminateRegisteredDevProcess,
} from "./kill-padpilot-processes";

setDefaultTimeout(15_000);

describe("kill PadPilot processes", () => {
  it("rejects malformed or unsafe registry PIDs", () => {
    expect(() => parseDevProcessRegistry('{"version":1,"pid":"all","startedAt":1}')).toThrow("Invalid");
    expect(() => parseDevProcessRegistry("x".repeat(devProcessRegistryByteLimit + 1))).toThrow("oversized");
  });

  it("stats and rejects an oversized registry before reading it", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-kill-registry-"));
    const registryPath = path.join(root, ".padpilot-dev-process-00000000-0000-0000-0000-000000000000.json");
    try {
      writeFileSync(registryPath, "x".repeat(devProcessRegistryByteLimit + 1));
      await expect(readDevProcessRegistry(registryPath)).rejects.toThrow("exceeds");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("matches only the registered Bun dev runner within its creation window", () => {
    const registry = { pid: 123, startedAt: 1_000_000, version: 1 } as const;
    expect(matchesRegisteredDevProcess(registry, {
      commandLine: 'bun.exe --hot run scripts/dev.ts',
      createdAt: 999_500,
      name: "bun.exe",
      pid: 123,
    })).toBe(true);
    expect(matchesRegisteredDevProcess(registry, {
      commandLine: "bun.exe run unrelated.ts",
      createdAt: 999_500,
      name: "bun.exe",
      pid: 123,
    })).toBe(false);
    expect(matchesRegisteredDevProcess(registry, {
      commandLine: 'bun.exe --hot run scripts/dev.ts',
      createdAt: 2_000_000,
      name: "bun.exe",
      pid: 123,
    })).toBe(false);
  });

  it("queries Windows process identity without interpolating shell input", () => {
    if (process.platform !== "win32") {
      return;
    }
    const current = queryWindowsProcess(process.pid);
    expect(current?.pid).toBe(process.pid);
    expect(current?.name.toLowerCase()).toContain("bun");
  });

  it("fails closed without terminating a PID whose command identity mismatches", async () => {
    if (process.platform !== "win32") {
      return;
    }
    const unrelated = Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 1000)"], {
      stderr: "ignore",
      stdout: "ignore",
    });
    try {
      await Bun.sleep(50);
      const info = queryWindowsProcess(unrelated.pid);
      expect(info).not.toBeNull();
      const result = terminateRegisteredDevProcess({
        pid: unrelated.pid,
        startedAt: info?.createdAt ?? Date.now(),
        version: 1,
      });
      expect(result).toBe("mismatch");
      expect(queryWindowsProcess(unrelated.pid)).not.toBeNull();
    } finally {
      unrelated.kill();
      await unrelated.exited;
    }
  });

  it("terminates only a matching registered dev process tree", async () => {
    if (process.platform !== "win32") {
      return;
    }
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-kill-process-"));
    const script = path.join(root, "scripts", "dev.ts");
    mkdirSync(path.dirname(script), { recursive: true });
    writeFileSync(script, "setInterval(() => {}, 1000);\n");
    const devProcess = Bun.spawn([process.execPath, script], { stderr: "ignore", stdout: "ignore" });
    try {
      await Bun.sleep(50);
      const info = queryWindowsProcess(devProcess.pid);
      expect(info).not.toBeNull();
      expect(terminateRegisteredDevProcess({
        pid: devProcess.pid,
        startedAt: info?.createdAt ?? Date.now(),
        version: 1,
      })).toBe("terminated");
      await devProcess.exited;
      expect(queryWindowsProcess(devProcess.pid)).toBeNull();
    } finally {
      devProcess.kill();
      rmSync(root, { force: true, recursive: true });
    }
  });
});
