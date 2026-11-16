import { afterEach, expect, mock, spyOn, test } from "bun:test";
import * as spawning from "../process/spawn";
import { inspectBrowserWindows } from "./windows-inspection";

const platform = Object.getOwnPropertyDescriptor(process, "platform");
afterEach(() => {
  mock.restore();
  if (platform) Object.defineProperty(process, "platform", platform);
});

test("browser inspection preserves the non-Windows applicability report", () => {
  Object.defineProperty(process, "platform", { configurable: true, value: "linux" });
  const spawn = spyOn(spawning, "spawnBackgroundProcessSync");
  expect(inspectBrowserWindows({ pid: 10, expectedProcesses: [] })).toEqual({ platform: "linux", applicable: false, processes: [], visibleWindows: [] });
  expect(spawn).not.toHaveBeenCalled();
});

test("an expected browser list must retain the root creation identity", () => {
  Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
  const spawn = spyOn(spawning, "spawnBackgroundProcessSync");
  for (const expectedProcesses of [[], [{ pid: 11, createdAt: "01" }], [{ pid: 10, createdAt: "" }]]) {
    expect(() => inspectBrowserWindows({ pid: 10, expectedProcesses })).toThrow("Owned browser creation identity is missing.");
  }
  expect(spawn).not.toHaveBeenCalled();
});

test("cleanup keeps old orphan descendants and excludes recycled PIDs and their new children", () => {
  Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
  const expectedProcesses = [{ pid: 10, createdAt: "01" }];
  const reused = { pid: 10, parentPid: 0, name: "browser", commandLine: "owned", createdAt: "05" };
  const orphan = { ...reused, pid: 20, parentPid: 10, createdAt: "02" };
  const unrelated = { ...reused, pid: 30, parentPid: 10, createdAt: "06" };
  const window = { pid: 20, handle: "42", title: "old child", className: "browser" };
  spyOn(spawning, "spawnBackgroundProcessSync").mockReturnValue({
    exitCode: 0, stdout: Buffer.from(JSON.stringify({ processes: [reused, orphan, unrelated], windows: [window, { ...window, pid: 30 }] })),
    stderr: Buffer.alloc(0), pid: 40, error: undefined, signalCode: null,
  });
  expect(inspectBrowserWindows({ pid: 10, expectedProcesses })).toMatchObject({ applicable: true, platform: "win32", identityVerified: true, expectedProcesses, processes: [orphan], visibleWindows: [window] });
});
