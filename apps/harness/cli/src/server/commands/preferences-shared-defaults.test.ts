import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseClientCommand, parseServerEventFrame, type ServerEvent } from "@hyperfocus/ai-core/protocol";
import { createSharedAiPreferencesStore } from "@hyperfocus/ai-runtime/preferences";
import { createAgentRuntimeRegistry } from "../../agent-runtimes/runtime-registry";
import { createFakePiAgentAdapter } from "../../test-support/fake-pi-agent-adapter";
import { createWorkspaceRepository } from "../../workspace-repository";
import { createWorkspaceRuntimeStore } from "../../workspace-runtime-store";
import type { HarnessConnection } from "../core/contracts";
import { getPreferencesState } from "../workspace/preferences";
import { handlePreferencesCommand } from "./preferences";

const payload = {
  providerBrand: "gpt", debugEnabled: false, tracePanelDefaultOpen: false,
  subagentWorktreeStrategyDefault: "same-worktree", blockChatOnDirtyGitDefault: false,
  dirtyGitChangeLimitDefault: 9, autoCompactContextThresholdPercentDefault: 55,
  planExecutionModeDefault: "approve", planExecutionDelaySecondsDefault: 15,
  correctnessIterationModeDefault: "auto-once", backgroundJobApprovalPolicyDefault: "ask-risky"
};

test("explicit Harness defaults publish to the shared store through the validated command", async () => {
  const fixture = await createFixture();
  try {
    const defaults = { version: 1, providerId: "google", reasoning: "high" } as const;
    const response = await fixture.send({ ...payload, providerBrand: "gemini", sharedAiPreferences: { ...defaults, designGuidance: "none" } });
    expect(response).toMatchObject({ type: "preferences.saved", payload: { providerBrand: "gemini", sharedAiPreferences: defaults } });
    expect(fixture.store.read()).toEqual(defaults);
    expect(fixture.writes()).toBe(1);
  } finally { fixture.dispose(); }
});

test("ordinary Harness preference saves leave another app's defaults untouched", async () => {
  const fixture = await createFixture();
  try {
    fixture.store.write({ version: 1, providerId: "anthropic", reasoning: "medium" });
    expect(await fixture.send(payload)).toMatchObject({ type: "preferences.saved" });
    expect(fixture.store.read()).toEqual({ version: 1, providerId: "anthropic", reasoning: "medium" });
    expect(fixture.writes()).toBe(0);
  } finally { fixture.dispose(); }
});

test("the Harness protocol rejects secret or invalid shared defaults before writes", async () => {
  const fixture = await createFixture();
  try {
    for (const sharedAiPreferences of [{ version: 1, apiKey: "secret" }, { version: 1, providerId: "unknown" }]) {
      await expect(fixture.send({ ...payload, sharedAiPreferences })).rejects.toThrow();
    }
    expect(fixture.writes()).toBe(0);
    expect(fixture.store.read()).toEqual({ version: 1 });
  } finally { fixture.dispose(); }
});

async function createFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "harness-shared-ai-defaults-"));
  const store = createSharedAiPreferencesStore({ filePath: path.join(directory, "preferences.json") });
  const repository = createWorkspaceRepository(":memory:", directory, { durability: "test-fast" });
  const adapter = createFakePiAgentAdapter();
  const runtimeRegistry = createAgentRuntimeRegistry([]);
  const runtime = createWorkspaceRuntimeStore(repository.loadWorkspace());
  let writes = 0;
  const server = Bun.serve<HarnessConnection>({
    hostname: "127.0.0.1", port: 0,
    fetch(request, host) {
      return host.upgrade(request, { data: { clientId: "test", clientKind: "browser", kind: "control" } })
        ? undefined : new Response("WebSocket required", { status: 400 });
    },
    websocket: {
      async message(ws, message) {
        try {
          await handlePreferencesCommand(parseClientCommand(JSON.parse(String(message))), {
            ws, runtime, repository, adapter, runtimeRegistry,
            sharedAiPreferencesStore: { read: store.read, write(value) { writes++; return store.write(value); } },
            getCurrentPreferencesState: () => getPreferencesState(repository, adapter, runtimeRegistry, { sharedAiPreferencesStore: store }),
            emitSetupRefresh: async () => ({ launchMode: "source", updatedAt: new Date().toISOString(), readyRequiredCount: 0, totalRequiredCount: 0, checks: [] })
          });
        } catch (error) { ws.send(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); }
      }
    }
  });
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}`);
  await new Promise<void>((resolve, reject) => { socket.onopen = () => resolve(); socket.onerror = () => reject(new Error("Fixture connection failed")); });
  return {
    store, writes: () => writes,
    send(nextPayload: unknown) {
      return new Promise<ServerEvent>((resolve, reject) => {
        socket.onmessage = event => {
          const parsed = JSON.parse(String(event.data));
          if (parsed.error) { reject(new Error(String(parsed.error))); return; }
          const saved = parseServerEventFrame(parsed).find(value => value.type === "preferences.saved");
          if (saved) resolve(saved);
        };
        socket.send(JSON.stringify({ type: "preferences.save", requestId: crypto.randomUUID(), payload: nextPayload }));
      });
    },
    dispose() { socket.close(); server.stop(true); repository.close(); rmSync(directory, { recursive: true, force: true }); }
  };
}
