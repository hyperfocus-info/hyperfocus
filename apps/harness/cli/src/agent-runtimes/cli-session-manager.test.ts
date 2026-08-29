import { describe, expect, test } from "bun:test";
import type { AgentRuntime } from "./agent-runtime";
import { createCliSessionManager } from "./cli-session-manager";
import { createWorkspaceRepository } from "../workspace-repository";
import { createWorkspaceRuntimeStore } from "../workspace-runtime-store";
import { createPiSdkAgentAdapter } from "../pi-agent-adapter";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { buildCliCapability } from "./cli-health";
import { resolveHarnessTestTempRoot } from "../test-support/test-temp-root";

function createRuntimeStore() {
  const tempRoot = resolveHarnessTestTempRoot();
  mkdirSync(tempRoot, { recursive: true });
  const projectRoot = path.join(tempRoot, `cli-session-${crypto.randomUUID()}`);
  mkdirSync(projectRoot, { recursive: true });
  const repository = createWorkspaceRepository(path.join(tempRoot, `cli-session-${crypto.randomUUID()}.sqlite`), process.cwd());
  const project = repository.addProject(projectRoot);
  return {
    repository,
    runtimeStore: createWorkspaceRuntimeStore(repository.loadWorkspace()),
    project
  };
}

const runtime: AgentRuntime = {
  id: "codex-cli",
  label: "Codex CLI",
  getAdapter() {
    return createPiSdkAgentAdapter();
  },
  getCapability() {
    return buildCliCapability({
      agentId: "codex-cli",
      label: "Codex CLI",
      installed: true,
      authenticated: true,
      supportsInteractive: true,
      interactivePipeCompatible: true,
      supportsPlanning: true,
      supportsReview: true
    });
  },
  async refreshCapability() {
    return buildCliCapability({
      agentId: "codex-cli",
      label: "Codex CLI",
      installed: true,
      authenticated: true,
      supportsInteractive: true,
      interactivePipeCompatible: true,
      supportsPlanning: true,
      supportsReview: true,
      healthMessage: "ok"
    });
  },
  getDefaultPlanningModelId() {
    return "openai/gpt-5.4";
  },
  getDefaultExecutionModelId() {
    return "openai/gpt-5.4";
  },
  getDefaultSubagentModelId() {
    return "openai/gpt-5.4-mini";
  },
  buildInteractiveLaunch() {
    return {
      cmd: [process.execPath, "-e", "setTimeout(() => {}, 30000)"]
    };
  }
};

describe("CLI session manager", () => {
  test("enforces thread ownership and stores captured context", async () => {
    const { runtimeStore, project } = createRuntimeStore();
    const manager = createCliSessionManager({
      runtimeStore,
      onSessionStarted() {},
      onSessionUpdated() {},
      onSessionExited() {},
      onAttachReady() {}
    });

    const session = await manager.startSession({
      requestId: "req-start",
      projectId: project.id,
      threadId: project.activeThreadId,
      agentRuntime: runtime,
      cwd: project.rootPath,
      cols: 80,
      rows: 24,
      clientId: "client-1"
    });

    expect(() =>
      manager.captureVisibleBuffer({
        projectId: project.id,
        threadId: "thread-wrong",
        sessionId: session.id,
        visibleBuffer: "stdout"
      })
    ).toThrow();

    manager.captureVisibleBuffer({
      projectId: project.id,
      threadId: project.activeThreadId,
      sessionId: session.id,
      visibleBuffer: "stdout",
      stderrTail: "stderr"
    });

    expect(runtimeStore.consumeThreadCapturedCliContext(project.id, project.activeThreadId)).toMatchObject({
      sessionId: session.id,
      visibleBuffer: "stdout",
      stderrTail: "stderr"
    });

    expect(() =>
      manager.resizeSession({
        requestId: "req-resize",
        projectId: project.id,
        threadId: project.activeThreadId,
        sessionId: session.id,
        cols: 120,
        rows: 40
      })
    ).toThrow("CLI session resize is not supported by the current transport");

    await manager.stopSession({
      projectId: project.id,
      threadId: project.activeThreadId,
      sessionId: session.id
    });
  });

  test("invalidates unused attach tokens when control client closes", async () => {
    const { runtimeStore, project } = createRuntimeStore();
    let issuedToken = "";
    const manager = createCliSessionManager({
      runtimeStore,
      onSessionStarted() {},
      onSessionUpdated() {},
      onSessionExited() {},
      onAttachReady(input) {
        issuedToken = input.attachToken.token;
      }
    });

    const session = await manager.startSession({
      requestId: "req-start",
      projectId: project.id,
      threadId: project.activeThreadId,
      agentRuntime: runtime,
      cwd: project.rootPath,
      cols: 80,
      rows: 24,
      clientId: "client-1"
    });

    expect(issuedToken).not.toBe("");
    manager.invalidateClientAttachTokens("client-1");
    expect(manager.consumeAttachToken(issuedToken, "client-1")).toBeUndefined();

    await manager.stopSession({
      projectId: project.id,
      threadId: project.activeThreadId,
      sessionId: session.id
    });
  });

  test("coalesces hot-output metadata updates", async () => {
    const { runtimeStore, project } = createRuntimeStore();
    const updated: unknown[] = [];
    const manager = createCliSessionManager({
      runtimeStore,
      onSessionStarted() {},
      onSessionUpdated(input) {
        updated.push(input);
      },
      onSessionExited() {},
      onAttachReady() {}
    });
    const hotRuntime: AgentRuntime = {
      ...runtime,
      buildInteractiveLaunch() {
        return {
          cmd: [
            process.execPath,
            "-e",
            "let i=0;const t=setInterval(()=>{process.stdout.write(String(i++));if(i===5)clearInterval(t);},20);setTimeout(()=>{},30000)"
          ]
        };
      }
    };

    const session = await manager.startSession({
      requestId: "req-hot-start",
      projectId: project.id,
      threadId: project.activeThreadId,
      agentRuntime: hotRuntime,
      cwd: project.rootPath,
      cols: 80,
      rows: 24,
      clientId: "client-1"
    });

    await waitForCondition(() => updated.length > 0);
    expect(updated).toHaveLength(1);

    await manager.stopSession({
      projectId: project.id,
      threadId: project.activeThreadId,
      sessionId: session.id
    });
  });
});

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(predicate: () => boolean, timeoutMs = 3500) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for CLI session metadata update");
    }
    await delay(25);
  }
}
