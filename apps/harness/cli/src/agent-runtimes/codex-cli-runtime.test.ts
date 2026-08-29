import { describe, expect, test } from "bun:test";
import type { CliProcessExecutionResult, CliProcessManager } from "./cli-process-manager";
import { createCodexCliRuntime, testExports } from "./codex-cli-runtime";

function createFakeCliProcessManager(result: CliProcessExecutionResult | CliProcessExecutionResult[]): CliProcessManager & { calls: string[][] } {
  const calls: string[][] = [];
  const results = Array.isArray(result) ? result : [result];
  const fallback = results.at(-1);
  if (!fallback) throw new Error("Fake CLI process manager requires at least one result");
  const fallbackResult: CliProcessExecutionResult = fallback;
  async function runNonInteractive(options: {
    cmd: string[];
    cwd: string;
    cols: number;
    rows: number;
    env?: Record<string, string | undefined>;
    idleTimeoutMs: number;
    totalTimeoutMs: number;
    abortSignal?: AbortSignal;
    onStdout?: (chunk: Uint8Array) => void;
    onStderr?: (chunk: Uint8Array) => void;
  }): Promise<CliProcessExecutionResult> {
    calls.push(options.cmd);
    return results.shift() ?? fallbackResult;
  }
  return {
    calls,
    runNonInteractive,
    startInteractive() { throw new Error("Interactive process is not used in Codex runtime tests"); },
  };
}

describe("codex cli runtime", () => {
  test("reports missing bundled install with bun install guidance", async () => {
    const runtime = createCodexCliRuntime({
      getInstallation: () => ({
        installed: false,
        installCommand: "bun install",
        authCommand: "bunx codex login",
        docsUrl: "https://developers.openai.com/codex",
        healthMessage: "Run `bun install` to install bundled Codex runtime dependencies."
      })
    });

    const capability = await runtime.refreshCapability();
    expect(capability.installed).toBe(false);
    expect(capability.installCommand).toBe("bun install");
    expect(capability.healthMessage).toContain("bun install");
  });

  test("probes bundled executable path instead of global codex", async () => {
    const processManager = createFakeCliProcessManager({
      stdout: "codex-cli 0.122.0\n",
      stderr: "",
      exitCode: 0,
      hangDetected: false,
      timedOut: false
    });
    const runtime = createCodexCliRuntime({
      processManager,
      getInstallation: () => ({
        installed: true,
        executablePath: "C:\\repo\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\codex\\codex.exe",
        installCommand: "bun install",
        authCommand: "bunx codex login",
        docsUrl: "https://developers.openai.com/codex",
        healthMessage: ""
      })
    });

    const capability = await runtime.refreshCapability();
    expect(capability.installed).toBe(true);
    expect(processManager.calls[0]?.[0]).toContain("codex.exe");
    expect(processManager.calls[1]?.[0]).toContain("codex.exe");
    expect(capability.installCommand).toBe("bun install");
    expect(capability.authCommand).toBe("bunx codex login");
  });

  test("uses bundled executable path for interactive launch", () => {
    const runtime = createCodexCliRuntime({
      platform: "win32",
      getInstallation: () => ({
        installed: true,
        executablePath: "C:\\codex\\codex.exe",
        installCommand: "bun install",
        authCommand: "bunx codex login",
        docsUrl: "https://developers.openai.com/codex",
        healthMessage: ""
      })
    });

    const launch = runtime.buildInteractiveLaunch({
      cwd: "C:\\repo",
      cols: 120,
      rows: 40,
      prompt: "Inspect repo"
    });

    expect(launch.cmd.slice(0, 7)).toEqual([
      "C:\\codex\\codex.exe",
      "--no-alt-screen",
      "-C",
      "C:\\repo",
      "-s",
      "danger-full-access",
      "-a"
    ]);
    expect(launch.cmd).toContain("Inspect repo");
  });

  test("publishes codex-supported model list", () => {
    expect(testExports.getCodexSupportedModelIds()).toContain("openai/gpt-5.6-luna");
    expect(testExports.isCodexSupportedModelId("openai/gpt-5.6-luna")).toBe(true);
    expect(testExports.isCodexSupportedModelId("openai/gpt-5.5")).toBe(true);
    expect(testExports.isCodexSupportedModelId("openai/gpt-5.4-nano")).toBe(false);
    expect(testExports.resolveCodexModelId("openai/gpt-5.4-nano")).toBe("openai/gpt-5.6-sol");
  });

  test("discovers visible codex models from cli debug catalog", async () => {
    const processManager = createFakeCliProcessManager({
      stdout: JSON.stringify({
        models: [
          { slug: "gpt-5.3-codex", visibility: "list" },
          { slug: "gpt-5.1", visibility: "hide" },
          { slug: "gpt-5.4-mini", visibility: "list" },
          { slug: "gpt-5.4-mini", visibility: "list" }
        ]
      }),
      stderr: "",
      exitCode: 0,
      hangDetected: false,
      timedOut: false
    });

    await expect(testExports.discoverCodexModels(processManager, "codex")).resolves.toEqual({
      discoveredModels: ["openai/gpt-5.3-codex", "openai/gpt-5.4-mini"],
      modelDiscoveryConfidence: "exact"
    });
    expect(processManager.calls[0]).toEqual(["codex", "debug", "models"]);
  });

  test("falls back to baked codex models when debug catalog is unavailable", async () => {
    const processManager = createFakeCliProcessManager({
      stdout: "not json",
      stderr: "",
      exitCode: 0,
      hangDetected: false,
      timedOut: false
    });

    await expect(testExports.discoverCodexModels(processManager, "codex")).resolves.toEqual({
      discoveredModels: [
        "openai/gpt-5.6-sol",
        "openai/gpt-5.6-terra",
        "openai/gpt-5.6-luna",
        "openai/gpt-5.5",
        "openai/gpt-5.4",
        "openai/gpt-5.4-mini",
        "openai/gpt-5.3-codex",
        "openai/gpt-5.3-codex-spark",
        "openai/gpt-5.2"
      ],
      modelDiscoveryConfidence: "partial"
    });
  });

  test("reports exact discovered codex models in runtime capability", async () => {
    const processManager = createFakeCliProcessManager([
      {
        stdout: "codex-cli 0.122.0\n",
        stderr: "",
        exitCode: 0,
        hangDetected: false,
        timedOut: false
      },
      {
        stdout: "Codex CLI help\n",
        stderr: "",
        exitCode: 0,
        hangDetected: false,
        timedOut: false
      },
      {
        stdout: JSON.stringify({
          models: [
            { slug: "gpt-5.6-sol", visibility: "list" },
            { slug: "gpt-5.6-luna", visibility: "list" },
            { slug: "gpt-5.3-codex-spark", visibility: "list" }
          ]
        }),
        stderr: "",
        exitCode: 0,
        hangDetected: false,
        timedOut: false
      }
    ]);
    const runtime = createCodexCliRuntime({
      processManager,
      getInstallation: () => ({
        installed: true,
        executablePath: "C:\\codex\\codex.exe",
        installCommand: "bun install",
        authCommand: "bunx codex login",
        docsUrl: "https://developers.openai.com/codex",
        healthMessage: ""
      })
    });

    const capability = await runtime.refreshCapability();
    expect(capability.discoveredModels).toEqual([
      "openai/gpt-5.6-sol",
      "openai/gpt-5.6-luna",
      "openai/gpt-5.3-codex-spark"
    ]);
    expect(capability.activeModel).toBe("openai/gpt-5.6-sol");
    expect(capability.modelDiscoveryConfidence).toBe("exact");
  });

  test("defaults subagents to gpt mini for gpt-5.4 family", () => {
    const runtime = createCodexCliRuntime();
    expect(runtime.getDefaultSubagentModelId("gpt", "openai/gpt-5.4")).toBe("openai/gpt-5.4-mini");
  });

  test("defaults gpt-5.6 codex subagents to Luna", () => {
    const runtime = createCodexCliRuntime();
    expect(runtime.getDefaultSubagentModelId("gpt", "openai/gpt-5.6-sol")).toBe("openai/gpt-5.6-luna");
  });
});
