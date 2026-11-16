import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aiRunRequestSchema } from "@hyperfocus/ai-core/runtime";
import { runAiCliProcess } from "./cli-process";

const request = aiRunRequestSchema.parse({ requestId: "transport", profile: {
  agentId: "test", providerId: "test", modelId: "test",
}, messages: [{ role: "user", content: "Test" }] });

test("streams large Unicode prompts through stdin without placing them in argv", async () => {
  const input = 'line with "quotes", backticks ` and $() \u00e9\ud83d\ude00\n'.repeat(10_000);
  const code = 'const text = await Bun.stdin.text(); console.log(JSON.stringify({ hash: new Bun.CryptoHasher("sha256").update(text).digest("hex"), argv: process.argv }));';
  const result = await runAiCliProcess({ request, command: [process.execPath, "--eval", code], input });
  const output = JSON.parse(result.text);
  expect(output.hash).toBe(createHash("sha256").update(input).digest("hex"));
  expect(JSON.stringify(output.argv).length).toBeLessThan(1000);
});

test("rejects excessive input before attempting a launch", async () => {
  await expect(runAiCliProcess({ request, command: ["missing-executable"], input: "x".repeat(8388609) }))
    .rejects.toThrow("input exceeds 8 MiB");
});

test("bounds output and terminates an overflowing child", async () => {
  await expect(runAiCliProcess({ request, input: "hello",
    command: [process.execPath, "--eval", 'console.log("x".repeat(3 * 1024 * 1024)); setInterval(() => {}, 1000);'] }))
    .rejects.toThrow("output exceeded");
});

test("reports child launch, exit, and timeout failures", async () => {
  await expect(runAiCliProcess({ request, input: "hello", command: ["hyperfocus-no-such-cli-executable"] })).rejects.toThrow();
  await expect(runAiCliProcess({ request, input: "hello", command: [process.execPath, "--eval", 'console.error("fixture failure"); process.exit(2);'] }))
    .rejects.toThrow("exited with 2: fixture failure");
  await expect(runAiCliProcess({ request, input: "hello", timeoutMs: 100,
    command: [process.execPath, "--eval", 'setInterval(() => {}, 1000);'] })).rejects.toThrow("timed out");
});

test("timeout reaps a CLI's owned descendant before returning", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hyperfocus-cli-tree-"));
  const recordPath = join(directory, "child.pid");
  const code = `import { spawn } from "node:child_process";
    const child = spawn(process.execPath, ["--eval", "setInterval(() => {}, 1000)"], { windowsHide: true, stdio: "ignore" });
    await Bun.write(${JSON.stringify(recordPath)}, String(child.pid));
    setInterval(() => {}, 1000);`;
  let descendant: number | undefined;
  try {
    await expect(runAiCliProcess({ request, input: "hello", timeoutMs: 1500,
      command: [process.execPath, "--eval", code] })).rejects.toThrow("timed out");
    descendant = Number(await readFile(recordPath, "utf8"));
    expect(descendant).toBeGreaterThan(0);
    expect(() => process.kill(descendant!, 0)).toThrow();
  } finally {
    if (descendant) { try { process.kill(descendant, "SIGKILL"); } catch {} }
    await rm(directory, { force: true, recursive: true });
  }
}, 15_000);
