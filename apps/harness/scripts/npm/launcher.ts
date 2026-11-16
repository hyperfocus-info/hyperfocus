#!/usr/bin/env bun
// The npm artifact owns a compiled runtime; it never resolves workspace modules.
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
if (process.platform !== "win32" || process.arch !== "x64") {
  console.error("This Harness package currently supports Windows x64 only.");
  process.exit(1);
}
const result = spawnSync(join(__dirname, "runtime", "pi-harness.exe"), process.argv.slice(2), {
  stdio: "inherit", windowsHide: true
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
