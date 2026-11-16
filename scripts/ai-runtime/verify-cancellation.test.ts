import { expect, test } from "bun:test";
import { parseCancellationProbeArgs, verifyPackagedAiCancellation } from "./verify-cancellation";

test("live process acceptance requires explicit artifact and account-use opt-in", async () => {
  expect(() => parseCancellationProbeArgs([])).toThrow("--live-codex");
  expect(() => parseCancellationProbeArgs(["--executable", "runtime.exe"])).toThrow("--live-codex");
  expect(() => parseCancellationProbeArgs(["--live-codex"])).toThrow("--executable");
  expect(() => parseCancellationProbeArgs(["--executable", "--live-codex"])).toThrow("requires a value");
  expect(() => parseCancellationProbeArgs(["--live-codex", "--executable", "runtime.exe", "--prompt", "other work"])).toThrow("Unknown option");
  await expect(verifyPackagedAiCancellation({ executable: "nonexistent", liveCodex: false })).rejects.toThrow("opt-in");
  expect(parseCancellationProbeArgs(["--live-codex", "--executable", "runtime.exe", "--model", "example"])).toMatchObject({ liveCodex: true, modelId: "example" });
});
