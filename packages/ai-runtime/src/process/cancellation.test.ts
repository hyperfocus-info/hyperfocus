import { readStoredBytes } from "@hyperfocus/serialization";
import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aiRunRequestSchema } from "@hyperfocus/ai-core/runtime";
import { createLocalAiRuntime } from "../runtime";
import { runAiRuntimeFiles } from "../cli";
import { runAiCliProcess } from "./cli-process";

test("native cancellation file stops and reaps the owned CLI tree before acknowledging failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hyperfocus-ai-cancel-"));
  const requestPath = join(directory, "request.json"), responsePath = join(directory, "response.json"), cancelPath = join(directory, "cancel");
  const pidPath = join(directory, "child.pid");
  const request = aiRunRequestSchema.parse({ requestId: "cancel", profile: { agentId: "fixture", providerId: "fixture", modelId: "fixture" }, messages: [{ role: "user", content: "test" }] });
  const started = Promise.withResolvers<void>();
  const runtime = createLocalAiRuntime({ adapters: [{
    descriptor: { id: "fixture", label: "fixture", available: true, providerIds: ["fixture"], supportsReasoning: false, supportsStructuredOutput: false },
    listCatalog: () => ({ providers: [{ id: "fixture", label: "fixture", modelIds: ["fixture"], authenticated: true, credentialSource: "ambient" }], models: [{ id: "fixture", providerId: "fixture", label: "fixture", input: ["text"], reasoning: false }] }),
    run: async (input, _store, { signal }) => {
      const work = runAiCliProcess({ request: input, input: "test", signal, command: [process.execPath, "--eval", `
        import { spawn } from "node:child_process";
        const child = spawn(process.execPath, ["--eval", "setInterval(() => {}, 1000)"], { windowsHide: true, stdio: "ignore" });
        await Bun.write(${JSON.stringify(pidPath)}, String(child.pid));
        setInterval(() => {}, 1000);
      `] });
      started.resolve();
      return work;
    },
  }] });
  let descendant: number | undefined;
  let pending: Promise<boolean> | undefined;
  try {
    await writeFile(requestPath, JSON.stringify({ operation: "run", payload: request }));
    pending = runAiRuntimeFiles({ requestPath, responsePath, cancelPath, runtime });
    await started.promise;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { descendant = Number(await readFile(pidPath, "utf8")); if (descendant) break; } catch {}
      await Bun.sleep(20);
    }
    expect(descendant).toBeGreaterThan(0);
    await writeFile(cancelPath, "cancel");
    expect(await pending).toBe(false);
    expect(readStoredBytes(await readFile(responsePath))).toMatchObject({ ok: false, error: "AI request was cancelled." });
    expect(() => process.kill(descendant!, 0)).toThrow();
  } finally {
    await writeFile(cancelPath, "cancel");
    await pending;
    if (descendant) { try { process.kill(descendant, "SIGKILL"); } catch {} }
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);
