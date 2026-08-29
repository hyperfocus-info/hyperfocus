import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HARNESS_APP_VERSION } from "@hyperfocus/ai-core/app-version";
import { createFakePiAgentAdapter } from "./test-support/fake-pi-agent-adapter";
import { startServerForTest, stopServerForTest } from "./server-tests/support/server-test-client";
import { createHarnessTestTempPath } from "./test-support/test-temp-root";
import { createWorkspaceRepository } from "./workspace-repository";

describe("desktop server lifecycle", () => {
  const servers: Array<Awaited<ReturnType<typeof startServerForTest>>["server"]> = [];
  const roots: string[] = [];

  afterEach(async () => {
    while (servers.length) await stopServerForTest(servers.pop());
    while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
  });

  test("resolves folder and file targets through the loopback API", async () => {
    const root = createHarnessTestTempPath("desktop-project");
    roots.push(root);
    mkdirSync(path.join(root, "src"), { recursive: true });
    writeFileSync(path.join(root, "src", "main.ts"), "export const ready = true;\n");
    const dbPath = createHarnessTestTempPath("desktop", ".sqlite");
    const { server, port } = await startServerForTest({
      port: 0,
      serverOnly: true,
      adapter: createFakePiAgentAdapter(),
      repository: createWorkspaceRepository(dbPath, root)
    });
    servers.push(server);
    const serverUrl = `http://127.0.0.1:${port}`;

    const status = await fetch(`${serverUrl}/api/desktop/v1/status`).then((response) => response.json());
    expect(status).toEqual({
      app: "hyperfocus-harness",
      version: HARNESS_APP_VERSION,
      sessionToken: expect.any(String)
    });

    const folder = await openTarget(serverUrl, root);
    expect(folder).toMatchObject({ kind: "folder", projectId: expect.any(String) });
    expect(new URL(folder.url).searchParams.get("ideFile")).toBeNull();

    const file = await openTarget(serverUrl, path.join(root, "src", "main.ts"));
    expect(file).toMatchObject({ kind: "file", projectId: folder.projectId });
    expect(new URL(file.url).searchParams.get("ideFile")).toBe("src/main.ts");
  });

  test("rejects browser-originated target mutation", async () => {
    const dbPath = createHarnessTestTempPath("desktop-origin", ".sqlite");
    const { server, port } = await startServerForTest({
      port: 0,
      serverOnly: true,
      adapter: createFakePiAgentAdapter(),
      repository: createWorkspaceRepository(dbPath, process.cwd())
    });
    servers.push(server);
    const response = await fetch(`http://127.0.0.1:${port}/api/desktop/v1/open`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://example.com" },
      body: JSON.stringify({ target: process.cwd() })
    });
    expect(response.status).toBe(403);
  });

  test("stops desktop mode after its last control client closes", async () => {
    const dbPath = createHarnessTestTempPath("desktop-idle", ".sqlite");
    const { server, port } = await startServerForTest({
      port: 0,
      serverOnly: true,
      desktopMode: true,
      desktopIdleGraceMs: 10,
      adapter: createFakePiAgentAdapter(),
      repository: createWorkspaceRepository(dbPath, process.cwd())
    });
    servers.push(server);
    const status = await fetch(`http://127.0.0.1:${port}/api/desktop/v1/status`).then((response) => response.json());
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?harnessSession=${status.sessionToken}`);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("desktop websocket failed to open")), { once: true });
    });
    socket.close();
    await Bun.sleep(80);
    await expect(fetch(`http://127.0.0.1:${port}/api/desktop/v1/status`)).rejects.toThrow();
    servers.pop();
  });
});

async function openTarget(serverUrl: string, target: string) {
  const status = await fetch(`${serverUrl}/api/desktop/v1/status`).then((response) => response.json());
  const response = await fetch(`${serverUrl}/api/desktop/v1/open`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-harness-session-token": status.sessionToken
    },
    body: JSON.stringify({ target })
  });
  expect(response.status).toBe(200);
  const value: unknown = await response.json();
  if (!isRecord(value) || typeof value.url !== "string" || typeof value.projectId !== "string" ||
    (value.kind !== "file" && value.kind !== "folder")) throw new TypeError("Desktop open response was malformed");
  return { url: value.url, projectId: value.projectId, kind: value.kind };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
