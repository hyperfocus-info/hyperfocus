import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnBackgroundProcess, spawnBackgroundProcessSync } from "./spawn";
import { terminateProcessTree } from "./terminate";

describe("background process boundary", () => {
  test("omitted stdio options expose readable output and no writable input", async () => {
    const child = spawnBackgroundProcess({ cmd: [process.execPath, "-e", "process.stdout.write('out');process.stderr.write('err')"] });
    const stdout: ReadableStream<Uint8Array> = child.stdout;
    const stderr: ReadableStream<Uint8Array> = child.stderr;
    try {
      expect(await Promise.all([new Response(stdout).text(), new Response(stderr).text(), child.exited])).toEqual(["out", "err", 0]);
      expect(child.stdin).toBeNull();
    } finally { await terminateProcessTree({ process: child }); }
  });

  test.each(["stdout", "stderr"] as const)("bounds %s bytes and terminates the owned overflowing process", async (output) => {
    const child = spawnBackgroundProcess({ cmd: [process.execPath, "-e", `process.${output}.write('é'.repeat(1024));setInterval(()=>{},1000)`], maxBuffer: 1024 });
    try {
      await expect(new Response(child[output]).text()).rejects.toThrow("maxBuffer (1024 bytes)");
      expect(await child.exited).not.toBe(0);
    } finally { await terminateProcessTree({ process: child }); }
    expect(() => process.kill(child.pid, 0)).toThrow();
  });

  test("accepts the exact byte limit and rejects malformed limits before spawning", async () => {
    const child = spawnBackgroundProcess({ cmd: [process.execPath, "-e", "process.stdout.write('x'.repeat(1024))"], maxBuffer: 1024 });
    expect((await new Response(child.stdout).text()).length).toBe(1024);
    expect(await child.exited).toBe(0);
    for (const maxBuffer of [-1, NaN, Infinity, 0.5]) {
      expect(() => spawnBackgroundProcess({ cmd: [process.execPath, "-e", ""], maxBuffer })).toThrow("maxBuffer");
    }
  });

  test("preserves literal argv, stdin, both byte streams, and nonzero exit", async () => {
    const value = `quotes \" & | < > $() %PATH%`;
    const child = spawnBackgroundProcess({
      cmd: [process.execPath, "-e", "process.stdin.on('data', data => process.stdout.write(data)); process.stdin.on('end', () => { process.stderr.write(process.argv[1]); process.exitCode = 7; });", value],
      stdin: new TextEncoder().encode("input ✓"), stdout: "pipe", stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect({ stdout, stderr, exitCode }).toEqual({ stdout: "input ✓", stderr: value, exitCode: 7 });
    expect(child.stdin).toBeNull();
  });

  test("interactive pipes close cleanly after an explicit stdin end", async () => {
    const child = spawnBackgroundProcess({
      cmd: [process.execPath, "-e", "process.stdin.pipe(process.stdout)"],
      stdin: "pipe", stdout: "pipe", stderr: "ignore",
    });
    const output = new Response(child.stdout).text();
    await child.stdin.write("hello");
    child.stdin.end();
    expect(await output).toBe("hello");
    expect(await child.exited).toBe(0);
  });

  test("an already aborted command never starts", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => spawnBackgroundProcess({ cmd: [process.execPath, "-e", "process.exit(0)"], signal: controller.signal })).toThrow();
  });

  test("timeouts terminate and reap a long-running command", async () => {
    const child = spawnBackgroundProcess({ cmd: [process.execPath, "-e", "setInterval(() => {}, 1000)"], timeout: 100, stdout: "ignore", stderr: "ignore" });
    try { expect(await child.exited).not.toBe(0); }
    finally { await terminateProcessTree({ process: child }); }
  }, 10_000);

  test("process exit does not wait for an abandoned full output pipe", async () => {
    const child = spawnBackgroundProcess({
      cmd: [process.execPath, "-e", "process.stdout.write('x'.repeat(4 * 1024 * 1024)); setInterval(() => {}, 1000);"],
      stdout: "pipe", stderr: "ignore",
    });
    const reader = child.stdout.getReader();
    try {
      expect((await reader.read()).done).toBe(false);
      await terminateProcessTree({ process: child, graceMs: 1_000 });
      expect(await child.exited).not.toBe(0);
    } finally {
      await reader.cancel();
      reader.releaseLock();
      await terminateProcessTree({ process: child });
    }
  }, 5_000);

  test("sync commands return diagnostic failure for missing executables", () => {
    const result = spawnBackgroundProcessSync({ cmd: ["hyperfocus-deliberately-missing-process-97295"] });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("hyperfocus-deliberately-missing-process-97295");
  });

  test("async missing executables reject without hanging output readers", async () => {
    const child = spawnBackgroundProcess({ cmd: ["hyperfocus-deliberately-missing-process-97295"], stdout: "ignore", stderr: "ignore" });
    await expect(child.exited).rejects.toThrow();
  });

  test.skipIf(process.platform !== "win32")("Windows command shims preserve metacharacters and spaces as literal argv", async () => {
    const root = await mkdtemp(join(tmpdir(), "hyperfocus process shim "));
    try {
      const command = join(root, "echo args.cmd");
      await writeFile(join(root, "echo.ts"), "console.log(JSON.stringify(process.argv.slice(2)));\n");
      await writeFile(command, `@echo off\r\n"${process.execPath}" "%~dp0echo.ts" %*\r\n`);
      const args = ["with spaces", "a&b|c<d>e", "literal %PATH%", 'embedded "quotes"', "trailing\\"];
      const child = spawnBackgroundProcess({ cmd: [command, ...args], stdout: "pipe", stderr: "pipe" });
      const [output, error, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      expect({ error, exitCode }).toEqual({ error: "", exitCode: 0 });
      expect(JSON.parse(output)).toEqual(args);
      const sync = spawnBackgroundProcessSync({ cmd: [command, ...args] });
      expect(sync.exitCode).toBe(0);
      expect(JSON.parse(sync.stdout.toString())).toEqual(args);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
