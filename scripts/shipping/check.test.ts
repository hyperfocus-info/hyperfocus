import { describe, expect, test } from "bun:test";
import { spawnBackgroundProcess, terminateProcessTree } from "@hyperfocus/desktop-runtime/process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseShippingArguments } from "./check";
import { profiles } from "./profiles";
import { runShippingCheck, runShippingProcess, validateProfile } from "./runner";

const root = resolve(import.meta.dir, "../..");

describe("shipping checks", () => {
  test("rejects ambiguous and unsupported CLI before execution", () => {
    for (const args of [[], ["missing"], ["editor", "engine"], ["editor", "--skip-tests"], ["editor", "--plan", "--plan"], ["--help", "engine"], ["--list", "--plan"], ["--list", "--help"]]) {
      expect(() => parseShippingArguments(args)).toThrow();
    }
    expect(parseShippingArguments(["editor", "--plan", "--json"])).toEqual({ mode: "check", target: "editor", plan: true, json: true });
  });

  test("every profile resolves scripts and documents; plans never run commands", async () => {
    let calls = 0;
    for (const target of Object.keys(profiles)) {
      const options = parseShippingArguments([target, "--plan"]);
      if (options.mode !== "check") throw new Error("Expected a check");
      const report = await runShippingCheck({ root, target: options.target, plan: true, run: async () => { calls++; return 0; } });
      expect(report.status).toBe("planned");
      expect(report.steps.every((step) => step.status === "planned" && step.exitCode === null)).toBe(true);
      expect(report.remainingAcceptance.length).toBeGreaterThan(0);
    }
    expect(calls).toBe(0);
  });

  test("a failed command stops later commands and preserves its exit code", async () => {
    const calls: string[] = [];
    const report = await runShippingCheck({ root, target: "packages", run: async (step) => {
      calls.push(step.script);
      return calls.length === 2 ? 23 : 0;
    } });
    expect(calls).toEqual(["check:release-readiness", "check:process-policy"]);
    expect(report.status).toBe("failed");
    expect(report.steps[1]?.exitCode).toBe(23);
    expect(report.steps.slice(2).every((step) => step.status === "skipped")).toBe(true);
  });

  test("process creation errors fail closed; success does not claim release readiness", async () => {
    const failed = await runShippingCheck({ root, target: "packages", run: async () => { throw new Error("spawn failed"); } });
    expect(failed.error).toBe("spawn failed");
    expect(failed.steps[0]?.status).toBe("failed");
    expect(failed.steps.slice(1).every((step) => step.status === "skipped")).toBe(true);
    const passed = await runShippingCheck({ root, target: "packages", run: async () => 0 });
    expect(passed.status).toBe("automated-checks-passed");
    expect(passed.remainingAcceptance.length).toBeGreaterThan(0);
  });

  test("native profile refuses an unsupported platform before starting commands", async () => {
    let calls = 0;
    const report = await runShippingCheck({ root, target: "pad-pilot", platform: "linux", run: async () => { calls++; return 0; } });
    expect(report.status).toBe("failed");
    expect(report.error).toContain("requires win32");
    expect(calls).toBe(0);
  });

  test("an exception with an empty message still fails and stops execution", async () => {
    let calls = 0;
    const report = await runShippingCheck({ root, target: "packages", run: async () => { calls++; throw new Error(""); } });
    expect(report.status).toBe("failed");
    expect(report.steps[0]?.status).toBe("failed");
    expect(report.steps.slice(1).every((step) => step.status === "skipped")).toBe(true);
    expect(calls).toBe(1);
  });

  test("missing or empty manifest scripts and missing documents fail preflight", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hyperfocus-ship-preflight-"));
    try {
      const profile = { ...profiles.packages, documents: ["README.md"], steps: [{ directory: ".", script: "check" }] };
      await expect(validateProfile({ root: directory, profile })).rejects.toThrow();
      await writeFile(join(directory, "README.md"), "Fixture");
      for (const manifest of [{}, { scripts: { check: "" } }, { scripts: { check: 4 } }]) {
        await writeFile(join(directory, "package.json"), JSON.stringify(manifest));
        await expect(validateProfile({ root: directory, profile })).rejects.toThrow("Missing script");
      }
      await writeFile(join(directory, "package.json"), JSON.stringify({ scripts: { check: "bun fixture.ts" } }));
      await validateProfile({ root: directory, profile });
      await writeFile(join(directory, "fixture.ts"), "console.log('shipping fixture stdout'); console.error('shipping fixture stderr'); process.exitCode = 7;");
      expect(await runShippingProcess({ root: directory, step: { directory: ".", script: "check" } })).toBe(7);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("real CLI emits parseable JSON for plans and malformed arguments", async () => {
    for (const args of [["editor", "--plan", "--json"], ["editor", "--skip-tests", "--json"]]) {
      const child = spawnBackgroundProcess({ cmd: [process.execPath, join(import.meta.dir, "check.ts"), ...args], cwd: root, stdout: "pipe", stderr: "pipe" });
      try {
        const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
        const report = JSON.parse(stdout);
        expect(report.status).toBe(args.includes("--plan") ? "planned" : "failed");
        expect(code).toBe(args.includes("--plan") ? 0 : 1);
        expect(stderr).toBe("");
      } finally {
        await terminateProcessTree({ process: child });
      }
    }
  });
});
