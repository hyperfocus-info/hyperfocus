import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";
import { expect, test } from "bun:test";
import net from "node:net";

async function findOpenPort(except?: number) {
  for (;;) {
    const port = await new Promise<number>((resolve, reject) => {
      const listener = net.createServer();
      listener.once("error", reject);
      listener.listen(0, "127.0.0.1", () => {
        const address = listener.address();
        listener.close(() => {
          if (address && typeof address === "object") resolve(address.port);
          else reject(new Error("Could not allocate a test port"));
        });
      });
    });
    if (port !== except) return port;
  }
}

async function waitUntil(check: () => Promise<boolean>, label: string, timeoutMs = 10_000) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    if (await check()) return;
    await Bun.sleep(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function tcpReady(port: number) {
  const socket = new net.Socket();
  return await new Promise<boolean>((resolve) => {
    const finish = (ready: boolean) => {
      socket.destroy();
      resolve(ready);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(250, () => finish(false));
    socket.connect(port, "127.0.0.1");
  });
}

test("MMO Skill Demo server exposes only its intended browser surface", async () => {
  const websocketPort = await findOpenPort();
  const staticPort = await findOpenPort(websocketPort);
  const processHandle = spawnBackgroundProcess({ cmd: [process.execPath, "run", "./examples/mmo-skill-demo/server.ts"], ...{
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(websocketPort), STATIC_PORT: String(staticPort) },
    stdout: "ignore",
    stderr: "pipe"
  } });

  try {
    await waitUntil(() => tcpReady(websocketPort), `authoritative server on ${websocketPort}`);
    await waitUntil(() => tcpReady(staticPort), `static server on ${staticPort}`);
    const origin = `http://127.0.0.1:${staticPort}`;

    const root = await fetch(`${origin}/`);
    expect(root.status).toBe(200);
    expect(root.headers.get("cache-control")).toBe("no-store");
    expect(root.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await root.text()).toContain("MMO Skill Demo");

    const bundle = await fetch(`${origin}/examples/mmo-skill-demo/dist/client.js`, { method: "HEAD" });
    expect(bundle.status).toBe(200);
    expect(bundle.headers.get("content-type")).toBe("text/javascript");
    expect(await bundle.text()).toBe("");

    expect((await fetch(`${origin}/package.json`)).status).toBe(404);
    expect((await fetch(`${origin}/examples/mmo-skill-demo/server.ts`)).status).toBe(404);
    expect((await fetch(`${origin}/examples/mmo-skill-demo/src/shared.ts`)).status).toBe(404);
    expect((await fetch(`${origin}/examples/mmo-skill-demo/assets/source/craftpix/archive.zip`)).status).toBe(404);
    expect((await fetch(`${origin}/%ZZ`)).status).toBe(400);

    const post = await fetch(`${origin}/`, { method: "POST" });
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET, HEAD");

    const health = await fetch(`${origin}/healthz`);
    expect(health.status).toBe(200);
    expect(health.headers.get("cache-control")).toBe("no-store");
  } finally {
    processHandle.kill();
    await processHandle.exited;
  }
});
