import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";
import { resolve } from "node:path";
import { packageTestPlan } from "./package-test-plan.ts";

const root = resolve(import.meta.dir, "../..");
const uiOnly = process.argv.includes("--ui");
const lanes = await packageTestPlan(root, uiOnly);
if (process.argv.includes("--plan")) {
  console.log(JSON.stringify({ lanes, separate: { engine: "bun run test:engine" } }, null, 2));
} else {
  let exitCode = 0;
  for (const lane of lanes) {
    console.log(`[package-tests] ${lane.id}`);
    const child = spawnBackgroundProcess({
      cmd: [process.execPath, ...lane.args],
      cwd: root,
      env: { ...process.env, HARNESS_TEST_SKIP_UI_PRELOAD: lane.browser ? "0" : "1" },
      stdin: "inherit", stdout: "inherit", stderr: "inherit",
    });
    const result = await child.exited;
    if (result) exitCode = result;
  }
  process.exitCode = exitCode;
}
