import { expect, test } from "bun:test";
import path from "node:path";

const fixture = path.join(import.meta.dir, "fixtures", "module-consumer", "verify.ts");

test("a consumer can validate and bundle a Module using only public exports", async () => {
  const executed = Bun.spawnSync({
    cmd: [process.execPath, fixture],
    cwd: import.meta.dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(executed.exitCode, executed.stderr.toString()).toBe(0);
  expect(JSON.parse(executed.stdout.toString())).toMatchObject({
    id: "controller-notes",
    capabilities: ["controller-input", "keyboard-output", "midi-output", "module-state"],
    scriptReady: true,
    uiContractReady: true,
  });

  const built = await Bun.build({
    entrypoints: [fixture],
    target: "browser",
    format: "esm",
    minify: true,
  });
  expect(built.success, built.logs.map((log) => log.message).join("\n")).toBe(true);
  expect(built.outputs).toHaveLength(1);
});
