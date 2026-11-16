import { describe, expect, test } from "bun:test";
import { createPiRuntime } from "../../agent-runtimes/pi-runtime";
import { createAgentRuntimeRegistry } from "../../agent-runtimes/runtime-registry";
import { createFakeCodexRuntime } from "../../test-support/fake-codex-runtime";
import { createFakePiAgentAdapter } from "../../test-support/fake-pi-agent-adapter";
import { useServerSuiteFixture } from "../support/server-suite-fixture";
import { createSocket, executeReadyRun, openProject, sendChatUntilReady, waitForEvent } from "../support/server-test-client";

describe("persisted run recovery", () => {
  const fixture = useServerSuiteFixture({ fixtureName: "launch-profile", persistentDatabase: true });
  test("ready plan retains its Codex runtime and controls after a backend restart", async () => {
    const codex = createFakePiAgentAdapter();
    const runtimeRegistry = createAgentRuntimeRegistry([createPiRuntime(fixture.adapter), createFakeCodexRuntime(codex)]);
    await fixture.restart({ runtimeRegistry });
    let socket = createSocket(fixture.port);
    await waitForEvent(socket, "connection.ready");
    const { payload: { project } } = await openProject(socket, fixture.projectRoot);
    const ready = await sendChatUntilReady(socket, { requestId: "codex-plan", projectId: project.id,
      threadId: project.activeThreadId, content: "simple task", modeId: "plan", modeLocked: true,
      agentId: "codex-cli", reasoningStrength: "low", fastMode: true });
    expect(ready.payload.run.launchProfile).toEqual({ agentId: "codex-cli", providerBrand: "gpt", reasoningStrength: "low", fastMode: true });
    socket.close();
    await fixture.restart({ runtimeRegistry });
    socket = createSocket(fixture.port);
    await waitForEvent(socket, "connection.ready");
    await executeReadyRun(socket, { requestId: "after-restart", projectId: project.id,
      threadId: project.activeThreadId, runId: ready.payload.run.id });
    expect(codex.calls.map(call => call.kind)).toEqual(["planner", "executor"]);
    expect(codex.calls[1]).toMatchObject({ reasoningStrength: "low", fastMode: true });
    expect(fixture.adapter.calls).toHaveLength(0);
    socket.close();
  });

  test("activating an inactive summary shell hydrates the pending run", async () => {
    const socket = createSocket(fixture.port);
    await waitForEvent(socket, "connection.ready");
    const { payload: { project } } = await openProject(socket, fixture.projectRoot);
    const ready = await sendChatUntilReady(socket, { requestId: "plan", projectId: project.id,
      threadId: project.activeThreadId, content: "simple task", modeId: "plan", modeLocked: true });
    await openProject(socket, fixture.extraProjectRoot);
    socket.close();
    const reconnected = createSocket(fixture.port);
    const snapshot = await waitForEvent(reconnected, "connection.ready");
    expect(snapshot.payload.workspace.projects.find((entry: { id: string }) => entry.id === project.id)?.activeRun).toBeUndefined();
    const hydrated = waitForEvent(reconnected, "project.updated", event => event.payload.projectId === project.id);
    reconnected.send(JSON.stringify({ type: "project.activate", requestId: "activate", payload: { projectId: project.id } }));
    expect((await hydrated).payload.project.activeRun).toMatchObject({ id: ready.payload.run.id, status: "ready", detailState: "summary" });
    reconnected.close();
  });
});
