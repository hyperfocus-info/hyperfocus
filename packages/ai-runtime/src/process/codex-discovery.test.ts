import { expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCodexCliAdapter } from "../cli-adapters";
import { createLocalAiRuntime } from "../runtime";

test("cancelled Codex discovery reaps its child and does not poison the next catalog", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hyperfocus-model-discovery-"));
  const script = join(directory, "fixture.ts"), pidPath = join(directory, "child.pid"), successPath = join(directory, "success");
  const executable = join(directory, process.platform === "win32" ? "fixture.cmd" : "fixture");
  const controller = new AbortController();
  let pending: Promise<unknown> | undefined;
  let child: number | undefined;
  try {
    await writeFile(script, `
      if (await Bun.file(${JSON.stringify(successPath)}).exists()) { console.log(JSON.stringify({ models: [{ visibility: "list", slug: "fixture-model" }] })); process.exit(0); }
      await Bun.write(${JSON.stringify(pidPath)}, String(process.pid));
      setInterval(() => {}, 1000);
    `);
    await writeFile(executable, process.platform === "win32"
      ? `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`
      : `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' '${script.replaceAll("'", "'\\''")}' "$@"\n`);
    if (process.platform !== "win32") await chmod(executable, 0o700);
    const runtime = createLocalAiRuntime({ adapters: [createCodexCliAdapter({ executable })] });
    pending = runtime.catalog(undefined, { signal: controller.signal });
    void pending.catch(() => undefined);
    for (let attempt = 0; attempt < 100; attempt++) {
      try { child = Number(await readFile(pidPath, "utf8")); if (child) break; } catch {}
      await Bun.sleep(20);
    }
    expect(child).toBeGreaterThan(0);
    controller.abort(new Error("discovery cancelled"));
    await expect(pending).rejects.toThrow("discovery cancelled");
    expect(() => process.kill(child!, 0)).toThrow();
    await writeFile(successPath, "ready");
    expect((await runtime.catalog()).models.some(model => model.id === "fixture-model")).toBe(true);
  } finally {
    controller.abort();
    await pending?.catch(() => undefined);
    if (child) { try { process.kill(child, "SIGKILL"); } catch {} }
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);
