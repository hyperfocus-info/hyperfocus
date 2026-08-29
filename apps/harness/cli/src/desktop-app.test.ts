import { describe, expect, test } from "bun:test";
import { buildWindowsProtocolRegistration, findRunningDesktopServer, requestDesktopOpen, resolveDesktopTargetArgument, waitForRunningDesktopServer } from "./desktop-app";

describe("desktop app broker", () => {
  test("resolves a protocol URL to a local path", () => {
    expect(resolveDesktopTargetArgument("ide://C:/work/My%20Game/main.ts")).toMatch(/My Game[\\/]main\.ts$/);
  });

  test("recognizes only the Hyperfocus desktop status endpoint", async () => {
    const fetcher = async () => Response.json({
      app: "hyperfocus-harness",
      version: "1.2.3",
      sessionToken: "desktop-session-token-000000000000000000000000"
    });
    expect(await findRunningDesktopServer("http://127.0.0.1:8787", fetcher)).toBe("http://127.0.0.1:8787");
    const other = async () => Response.json({ app: "something-else", version: "1.2.3" });
    expect(await findRunningDesktopServer("http://127.0.0.1:8787", other)).toBeUndefined();
  });

  test("asks an existing server to resolve the target", async () => {
    let calls = 0;
    const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) return Response.json({
        app: "hyperfocus-harness",
        version: "1.2.3",
        sessionToken: "desktop-session-token-000000000000000000000000"
      });
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("x-harness-session-token"))
        .toBe("desktop-session-token-000000000000000000000000");
      expect(JSON.parse(String(init?.body))).toEqual({ target: "C:\\work\\game" });
      return Response.json({ url: "http://127.0.0.1:8787/?ideProject=project-1", projectId: "project-1", kind: "folder" });
    };
    await expect(requestDesktopOpen({ serverUrl: "http://127.0.0.1:8787", target: "C:\\work\\game", fetcher })).resolves.toMatchObject({
      projectId: "project-1",
      kind: "folder"
    });
  });

  test("waits for the winning backend when desktop launches race", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return calls < 3
        ? new Response("starting", { status: 503 })
        : Response.json({
          app: "hyperfocus-harness",
          version: "1.2.3",
          sessionToken: "desktop-session-token-000000000000000000000000"
        });
    };
    await expect(waitForRunningDesktopServer({
      serverUrl: "http://127.0.0.1:8787",
      attempts: 3,
      fetcher,
      sleep: async () => {}
    })).resolves.toBe("http://127.0.0.1:8787");
  });

  test("builds per-user protocol registration without a shell command", () => {
    const commands = buildWindowsProtocolRegistration({ executablePath: "C:\\Hyperfocus\\pi-harness.exe" });
    expect(commands).toHaveLength(4);
    expect(commands.at(-1)?.at(-2)).toBe('"C:\\Hyperfocus\\pi-harness.exe" "--ide-url" "%1"');
    expect(commands.every((command) => command[1]?.startsWith("HKCU\\Software\\Classes\\ide"))).toBe(true);
  });
});
