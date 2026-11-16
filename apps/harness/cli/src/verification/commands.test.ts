import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHarnessTestTempPath } from "../test-support/test-temp-root";
import { parseVerificationCommand, runVerificationCommands } from "@hyperfocus/ai-runtime/quality/commands";

function fixture(source: string) {
  const cwd = createHarnessTestTempPath("verification");
  mkdirSync(cwd, { recursive: true });
  writeFileSync(path.join(cwd, "check.ts"), source);
  return cwd;
}

test("verification executes explicit checks and rejects nonzero acceptance", async () => {
  const cwd = fixture('await Bun.write("ran.txt", "checked"); process.exit(7);');
  await expect(runVerificationCommands({ cwd, commands: ["bun check.ts"] })).rejects.toThrow("exit 7");
  expect(await Bun.file(path.join(cwd, "ran.txt")).text()).toBe("checked");
});

test("verification preserves quoted arguments without invoking a shell", () => {
  expect(parseVerificationCommand('python -m pytest "tests/a b.py"')).toEqual(["python", "-m", "pytest", "tests/a b.py"]);
  for (const command of ["echo yes && echo no", "echo $SECRET", "echo yes\necho no", "echo 'unterminated"]) {
    expect(() => parseVerificationCommand(command)).toThrow();
  }
});

test("missing checks remain explicitly unverified", async () => {
  expect(await runVerificationCommands({ cwd: fixture(""), commands: [] })).toContain("unverified");
  await expect(runVerificationCommands({ cwd: fixture(""), commands: [], signal: AbortSignal.abort() })).rejects.toThrow();
});

test("verification bounds output and terminates the owned process", async () => {
  await expect(runVerificationCommands({ cwd: fixture('console.log("x".repeat(10000)); setInterval(() => {}, 1000);'),
    commands: ["bun check.ts"], maxOutputBytes: 128 })).rejects.toThrow("maxBuffer");
});

test("verification deadline and cancellation cannot report passing", async () => {
  const cwd = fixture('setInterval(() => {}, 1000);');
  await expect(runVerificationCommands({ cwd, commands: ["bun check.ts"], timeoutMs: 100 })).rejects.toThrow();
  await expect(runVerificationCommands({ cwd, commands: ["bun check.ts"], signal: AbortSignal.timeout(100) })).rejects.toThrow();
});

test("verification deduplicates checks and reports measured success", async () => {
  const result: string[] = [];
  const summary = await runVerificationCommands({ cwd: fixture("process.exit(0);"), commands: ["bun check.ts", "bun check.ts"],
    onResult: line => result.push(line) });
  expect(result).toEqual(["Verification passed: bun check.ts"]);
  expect(summary).toBe("Verification: 1 declared check passed.");
});
