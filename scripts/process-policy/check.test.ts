import { expect, test } from "bun:test";
import { inspectProcessPolicy } from "./check";

const inspect = (source: string) => inspectProcessPolicy({ file: "scripts/example.ts", source });

test("Bun's unverified windowsHide property cannot bypass hidden process policy", () => {
  expect(inspect('Bun.spawn(["bun", "--hot", "server.ts"], { windowsHide: true });')).toHaveLength(1);
  expect(inspect('Bun.spawnSync({ cmd: ["cmd", "/c", "dir"] });')).toHaveLength(1);
});

test("checks aliased and namespace child_process calls including sync and fork", () => {
  expect(inspect('import { spawn as launch } from "node:child_process"; launch("bun", []);')).toHaveLength(1);
  expect(inspect('import * as cp from "child_process"; cp.spawnSync("bun", [], { windowsHide: true });')).toEqual([]);
  expect(inspect('import { fork } from "node:child_process"; fork("worker.js", [], { silent: true });')).toHaveLength(1);
});

test("checks actual calls and resolves explicit options without matching game spawn methods", () => {
  expect(inspect('stage.spawn(entity); const note = "Bun.spawn(...)";')).toEqual([]);
  expect(inspect('import { spawn } from "node:child_process"; const options = { windowsHide: true }; spawn("bun", [], options);')).toEqual([]);
  expect(inspect('import { spawn } from "node:child_process"; spawn("bun", [], { windowsHide: true, ...unknownOptions });')).toHaveLength(1);
  expect(inspect('import { spawn } from "node:child_process"; spawn("bun", [], { ...unknownOptions, windowsHide: true });')).toEqual([]);
});

test("shared background process entrypoint is accepted", () => {
  expect(inspect('import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process"; spawnBackgroundProcess({ cmd: ["bun", "test"] });')).toEqual([]);
});

test("CommonJS and Bun import aliases cannot bypass process policy", () => {
  expect(inspect('const { spawn: launch } = require("node:child_process"); launch("bun", []);')).toHaveLength(1);
  expect(inspect('const cp = require("child_process"); cp.execFile("git", [], { windowsHide: true });')).toEqual([]);
  expect(inspect('import { spawn as launch } from "bun"; launch(["bun"]);')).toHaveLength(1);
  expect(inspect('const { spawnSync: launch } = Bun; launch(["bun"]);')).toHaveLength(1);
  expect(inspect('import launch from "cross-spawn"; launch("bun", []); launch.sync("git", [], { windowsHide: true });')).toHaveLength(1);
});

test("local and Windows release gates retain process-policy and real-window regressions", async () => {
  const manifest = await Bun.file(new URL("../../package.json", import.meta.url)).json();
  expect(manifest.scripts.check).toContain("check:process-policy");
  expect(manifest.scripts["test:repository"]).toContain("scripts/process-policy");
  const workflow = await Bun.file(new URL("../../.github/workflows/release.yml", import.meta.url)).text();
  const windowsJobs = workflow.split(/^  [\w-]+:\r?$/m).slice(1)
    .filter(body => body.includes("runs-on: windows-latest"));
  expect(windowsJobs.length).toBeGreaterThan(0);
  for (const body of windowsJobs) {
    expect(body).toContain("bun run check:process-policy");
    expect(body).toContain("bun run test:repository");
  }
});

test("bundled dependency import wrappers and comma-call aliases are checked", () => {
  expect(inspect('var cp; cp = __toESM(require("child_process")); (0, cp.spawn)("bun", []);')).toHaveLength(1);
  expect(inspect('var cp = __toESM(require("node:child_process")); cp.default.spawn("bun", [], { windowsHide: true });')).toEqual([]);
  expect(inspect('var cp = require("child_process"); const execFile = util.promisify(cp.execFile); execFile("powershell", []);')).toHaveLength(1);
});

test("browser automation must explicitly preserve headless execution", () => {
  expect(inspect('import { chromium } from "playwright"; chromium.launch({ headless: false });')).toHaveLength(1);
  expect(inspect('const { chromium } = await import("playwright"); chromium.launch();')).toHaveLength(1);
  expect(inspect('import { chromium } from "playwright"; chromium.launch({ headless: true });')).toEqual([]);
});
