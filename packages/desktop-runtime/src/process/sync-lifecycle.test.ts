import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnBackgroundProcessSync } from "./spawn";
import { terminateProcessTree } from "./terminate";

// These checks deliberately use native descendants, bypassing this package's
// JS ownership hooks. They lock the actual Bun Windows spawnSync tree semantics.
for (const mode of ["timeout-ignore", "timeout-inherit", "max-buffer"] as const) {
  test.skipIf(process.platform !== "win32")(`sync ${mode} reaps native descendants without waiting on inherited output`, async () => {
    const root = await mkdtemp(join(tmpdir(), "hyperfocus-sync-tree-"));
    const pidPath = join(root, "descendant.pid");
    const parentPath = join(root, "parent.mjs");
    let pid: number | undefined;
    try {
      await writeFile(parentPath, [
        'import { spawn } from "node:child_process";',
        'import { existsSync } from "node:fs";',
        'const pidPath = process.argv[2];',
        `const childScript = ${JSON.stringify('require("node:fs").writeFileSync(process.argv[1], String(process.pid)); setTimeout(() => {}, 3000);')};`,
        `spawn(process.execPath, ["-e", childScript, pidPath], { windowsHide: true, stdio: ["ignore", "${mode === "timeout-inherit" ? "inherit" : "ignore"}", "ignore"] });`,
        `if (${JSON.stringify(mode)} === "max-buffer") { const poll = setInterval(() => { if (existsSync(pidPath)) { clearInterval(poll); process.stdout.write("x".repeat(1024 * 1024)); } }, 10); }`,
        'setInterval(() => {}, 1000);',
      ].join("\n"));
      const startedAt = performance.now();
      const result = spawnBackgroundProcessSync({
        cmd: [Bun.which("node") ?? process.execPath, parentPath, pidPath],
        stdout: "pipe", stderr: "pipe", timeout: 600, killSignal: "SIGKILL",
        maxBuffer: mode === "max-buffer" ? 1024 : 4096,
      });
      if (!await Bun.file(pidPath).exists()) throw new Error(`Native descendant fixture did not start: ${result.stderr.toString()}`);
      pid = Number(await readFile(pidPath, "utf8"));
      expect(Number.isSafeInteger(pid) && pid > 0).toBe(true);
      expect(result.exitCode).not.toBe(0);
      expect(result.error?.message).toContain(mode === "max-buffer" ? "ENOBUFS" : "ETIMEDOUT");
      expect(performance.now() - startedAt).toBeLessThan(2500);
      expect(isAlive(pid)).toBe(false);
    } finally {
      if (pid && isAlive(pid)) await terminateProcessTree({ pid });
      await rm(root, { recursive: true, force: true });
    }
  }, 10_000);
}

function isAlive(pid: number) {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
    throw error;
  }
}
