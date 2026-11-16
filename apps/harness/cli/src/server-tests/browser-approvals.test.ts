import { parseServerEventFrame } from "@hyperfocus/ai-core/protocol";
import { encodeValue,readValueFrame } from "@hyperfocus/serialization";
import { Database } from "bun:sqlite";
import { afterEach,expect,setDefaultTimeout,test } from "bun:test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createStableBoundedId } from "../notification-ids";
import { syncBrowserApprovalNotifications } from "../server/automation/notifications";
import { createFakePiAgentAdapter } from "../test-support/fake-pi-agent-adapter";
import { createPendingBrowserSession } from "../test-support/fixtures/browser-session";
import { useGitProjectFixture } from "../test-support/git-project-fixture";
import { resolveHarnessTestTempRoot } from "../test-support/test-temp-root";
import { createWorkspaceRepository } from "../workspace-repository";
import { startServerForTest,stopServerForTest } from "./support/server-test-client";

setDefaultTimeout(15000);

const fixture = useGitProjectFixture({
  fixtureName: "server-browser-approvals",
  packageName: "server-browser-approvals",
  readmeTitle: "# Server Browser Approvals\n"
});

let activeServer: Awaited<ReturnType<typeof startServerForTest>>["server"] | undefined;

afterEach(async () => {
  await stopServerForTest(activeServer);
  activeServer = undefined;
});

test("browser approval resolve rejects stale thread ownership before mutating approval state", async () => {
  const repository = createRepository();
  const rootPath = await fixture.createRepoClone("browser-approval-thread-owner");
  const project = repository.addProject(rootPath);
  const owningThreadId = project.activeThreadId;
  const runProject = repository.createAgentRun(project.id, "verify browser approval ownership", "openai/gpt-5.4", owningThreadId);
  const run = runProject.activeRun;
  if (!run) {
    throw new Error("Expected active run");
  }

  repository.setAgentRunBrowserSessions(project.id, run.id, [createPendingBrowserSession(run.id)]);
  const otherThread = repository.createThread(project.id);
  repository.activateThread(project.id, owningThreadId);

  const started = await startServerForTest({ port: 0, adapter: createFakePiAgentAdapter(), repository });
  activeServer = started.server;
  const socket = createSocket(started.port, "protobuf");
  try {
    await waitForEvent(socket, "connection.ready");

    const rejectedPromise = waitForEvent(
      socket,
      "command.rejected",
      (event) => event.requestId === "req-browser-wrong-thread"
    );
    socket.send(
      encodeValue({
        type: "browser.approval.resolve",
        requestId: "req-browser-wrong-thread",
        payload: {
          projectId: project.id,
          threadId: otherThread.activeThreadId,
          runId: run.id,
          sessionId: "browser-session-1",
          toolCallId: "tool-call-1",
          approved: true
        }
      })
    );

    const rejected = await rejectedPromise;
    expect(rejected.payload.detail).toContain("not available");
    expect(repository.getRun(project.id, run.id)?.browserSessions?.[0]?.pendingApproval).toBeUndefined();
    expect(repository.getRun(project.id, run.id)?.browserSessions?.[0]?.activities[0]?.approval?.status).toBe("rejected");

    const stalePromise = waitForEvent(
      socket,
      "command.rejected",
      (event) => event.requestId === "req-browser-owning-thread"
    );
    socket.send(
      encodeValue({
        type: "browser.approval.resolve",
        requestId: "req-browser-owning-thread",
        payload: {
          projectId: project.id,
          threadId: owningThreadId,
          runId: run.id,
          sessionId: "browser-session-1",
          toolCallId: "tool-call-1",
          approved: true
        }
      })
    );

    const stale = await stalePromise;
    expect(stale.payload.detail).toContain("no longer active");
    expect(repository.getRun(project.id, run.id)?.browserSessions?.[0]?.activities[0]?.approval?.status)
      .toBe("rejected");
  } finally {
    socket.close();
  }
});

test("startup repairs terminal browser approvals before publishing ready", async () => {
  const dbPath = path.join(resolveHarnessTestTempRoot(), `server-browser-repair-${crypto.randomUUID()}.sqlite`);
  const seed = createWorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
  const rootPath = await fixture.createRepoClone("browser-approval-startup-repair");
  const project = seed.addProject(rootPath), runProject = seed.createAgentRun(project.id, "repair", "openai/gpt-5.4");
  const run = runProject.activeRun;
  if (!run) throw new Error("Expected active run");
  const sessions = [createPendingBrowserSession(run.id)];
  seed.setAgentRunBrowserSessions(project.id, run.id, sessions); syncBrowserApprovalNotifications(seed);
  seed.setAgentRunStatus(project.id, run.id, "stopped", "stopped"); seed.close();
  const notificationId = createStableBoundedId(["browser-approval", project.id, run.id,
    sessions[0]!.id, sessions[0]!.activities[0]!.toolCallId]);
  const raw = new Database(dbPath, { strict: true });
  raw.run("UPDATE agent_runs SET browser_sessions_json = ?2 WHERE id = ?1", [run.id, JSON.stringify(sessions)]);
  raw.run("UPDATE agent_runs SET has_actionable_browser_approval = 0 WHERE id = ?1", [run.id]);
  expect(raw.query<{ actionable: number }, [string]>(`SELECT has_actionable_browser_approval AS actionable
    FROM agent_runs WHERE id = ?1`).get(run.id)?.actionable).toBe(1);
  raw.close(false);

  const repository = createWorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
  const started = await startServerForTest({ port: 0, adapter: createFakePiAgentAdapter(), repository });
  activeServer = started.server;
  const socket = createSocket(started.port);
  try {
    const ready = await waitForEvent(socket, "connection.ready");
    expect(ready.payload.notifications.items.some((item: { id: string }) => item.id === notificationId)).toBe(false);
    expect(repository.getRun(project.id, run.id)?.browserSessions?.[0]?.activities[0]?.approval?.status).toBe("rejected");
  } finally { socket.close(); }
});

function createRepository() {
  const tempRoot = resolveHarnessTestTempRoot();
  mkdirSync(tempRoot, { recursive: true });
  return createWorkspaceRepository(path.join(tempRoot, `server-browser-${crypto.randomUUID()}.sqlite`), process.cwd(), {
    durability: "test-fast"
  });
}


function createSocket(port: number, encoding: "json" | "protobuf" = "json") {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?harnessSession=test-harness-session-token-000000000000000000000000&encoding=${encoding}`); socket.binaryType = "arraybuffer"; return socket;
}

function waitForEvent(socket: EventTarget, type: string, predicate?: (payload: any) => boolean, timeoutMs = 1500) {
  return new Promise<any>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;

    const listener: EventListener = (event) => {
      if (!(event instanceof MessageEvent)) {
        return;
      }
      for (const payload of parseMessageEventPayloads(event.data)) {
        if (payload && typeof payload === "object" && "type" in payload && payload.type === type && (predicate ? predicate(payload) : true)) {
          cleanup();
          resolve(payload);
          return;
        }
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error("socket error"));
    };

    const cleanup = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      socket.removeEventListener("message", listener);
      socket.removeEventListener("error", onError);
    };

    timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${type}`));
    }, timeoutMs);

    socket.addEventListener("message", listener);
    socket.addEventListener("error", onError, { once: true });
  });
}

function parseMessageEventPayloads(data: unknown) {
  const raw = readValueFrame(data);
  try {
    return parseServerEventFrame(raw);
  } catch {
    return [raw];
  }
}
