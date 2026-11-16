import { describe, expect, it } from "bun:test";

import { runEvaluationCli } from "./evaluation-cli";

describe("evaluation CLI", () => {
  it("passes full file paths to the library and prints durable report URLs", async () => {
    const calls: unknown[] = [];
    const output: string[] = [];
    const exitCode = await runEvaluationCli([
      "analyze",
      "--force",
      "--score",
      "0.98",
      "C:\\Music\\Complete Full Filename.mp3",
    ], {
      log: (message) => output.push(message),
      openLibrary: () => ({
        close: () => calls.push("close"),
        evaluateFiles: async (paths: readonly string[], options: { readonly force?: boolean; readonly subjectiveScore?: number }) => {
          calls.push({ options, paths });
          return [{ overallScore: 0.94, reused: false, title: "Complete Full Filename.mp3", url: "http://127.0.0.1:3217/runs/run-1" }];
        },
      }),
      serve: () => {
        throw new Error("serve should not be called");
      },
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([
      { options: { force: true, subjectiveScore: 0.98 }, paths: ["C:\\Music\\Complete Full Filename.mp3"] },
      "close",
    ]);
    expect(output.join("\n")).toContain("http://127.0.0.1:3217/runs/run-1");
  });

  it("rejects listener scores outside zero through one", async () => {
    expect(runEvaluationCli(["analyze", "--score", "1.1", "song.mp3"])).rejects.toThrow(
      "Listener score must be a number from 0 to 1.",
    );
  });

  it("builds dashboard assets before starting the loopback server", async () => {
    const calls: string[] = [];
    await runEvaluationCli(["serve", "--port", "4321"], {
      buildDashboard: async () => {
        calls.push("build");
        return "dashboard";
      },
      log: () => undefined,
      serve: () => {
        calls.push("serve");
        return undefined;
      },
    });

    expect(calls).toEqual(["build", "serve"]);
  });
});
