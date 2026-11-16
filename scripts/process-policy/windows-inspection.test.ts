import { expect, test } from "bun:test";
import { selectOwnedWindowsProcesses } from "./windows-inspection";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { resolve } from "node:path";
import { processEntry } from './fixtures/process-entry';

test.skipIf(process.platform !== "win32")("inspection preserves Unicode quotes without corrupting JSON", () => {
  const result = spawnBackgroundProcessSync({ cmd: [process.execPath, resolve(import.meta.dir, "fixtures/inspection-unicode.ts"), "“impact”"], stdout: "pipe", stderr: "pipe", timeout: 20000 });
  expect(result.error).toBeFalsy();
  expect(JSON.parse(result.stdout?.toString() ?? "")).toEqual({ retained: true, visibleWindows: 0 });
});

test("a recycled parent's older unrelated child is excluded from the owned tree", () => {
  const root = processEntry(10, 0, "05");
  const unrelated = processEntry(20, 10, "01");
  const child = processEntry(30, 10, "06");
  const grandchild = processEntry(40, 30, "07");
  expect(selectOwnedWindowsProcesses({ rootPids: [10], processes: [unrelated, grandchild, root, child] }).map(entry => entry.pid)).toEqual([40, 10, 30]);
});

test("remembered creation identities exclude reused roots but retain their old orphan children", () => {
  const oldRoot = processEntry(10, 0, "01");
  const orphan = processEntry(20, 10, "02");
  const reusedRoot = processEntry(10, 0, "05");
  const unrelated = processEntry(30, 10, "06");
  expect(selectOwnedWindowsProcesses({ rootPids: [10], expectedProcesses: [oldRoot], processes: [reusedRoot, orphan, unrelated] })).toEqual([orphan]);
  expect(selectOwnedWindowsProcesses({ rootPids: [10], expectedProcesses: [oldRoot], processes: [orphan] })).toEqual([orphan]);
  expect(selectOwnedWindowsProcesses({ rootPids: [10], processes: [orphan] })).toEqual([]);
});
