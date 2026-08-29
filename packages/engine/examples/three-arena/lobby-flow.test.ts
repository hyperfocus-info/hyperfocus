import { expect, test } from "bun:test";
import net from "node:net";
import { connectAuthoritative, type AuthoritativeClient } from "@hyperfocus/engine/net";
import { normalizeThreeArenaStateSnapshot, threeArenaStateSchema, type ThreeArenaStateSnapshot } from "./binary-state.ts";

type Client = {
  client: AuthoritativeClient;
  playerId?: string;
  roomId?: string;
  states: ThreeArenaStateSnapshot[];
};

async function findOpenPort() {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("No port"));
      });
    });
  });
}

async function waitUntil<T>(check: () => T | undefined | false | Promise<T | undefined | false>, label: string, timeoutMs = 10_000): Promise<T> {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    const value = await check();
    if (value) return value;
    await Bun.sleep(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function waitForServer(port: number) {
  await waitUntil(async () => {
    const socket = new net.Socket();
    return await new Promise<boolean>((resolve) => {
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => {
        socket.destroy();
        resolve(false);
      });
      socket.setTimeout(250, () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, "127.0.0.1");
    });
  }, `server start on ${port}`);
}

async function connectClient(url: string, roomId: string, name: string): Promise<Client> {
  const client = connectAuthoritative({
    url,
    token: `dev:${name}-${crypto.randomUUID()}`,
    roomId,
    roomType: "three-arena",
    request: { name },
    schema: threeArenaStateSchema,
  });
  const result: Client = { client, states: [] };
  const joined = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${name} join timeout`)), 8_000);
    const remove = client.onMessage((message) => {
      if (message.type === "join_accepted") {
        const payload = recordFrom(message.payload);
        result.playerId = typeof payload.playerId === "string" ? payload.playerId : undefined;
        result.roomId = typeof payload.roomId === "string" ? payload.roomId : undefined;
        clearTimeout(timeout);
        remove();
        resolve();
      }
      if (message.type === "join_rejected" || message.type === "error") {
        clearTimeout(timeout);
        remove();
        reject(new Error(`${name} join rejected`));
      }
    });
  });
  client.onSnapshot((state) => {
    result.states.push(normalizeState(state, roomId));
  });
  await client.connect();
  await joined;
  return result;
}

function normalizeState(value: unknown, fallbackRoomId: string): ThreeArenaStateSnapshot {
  return normalizeThreeArenaStateSnapshot(value, { fallbackRoomId });
}

function latestState(client: Client) {
  return client.states.at(-1);
}

async function rooms(staticPort: number) {
  const response = await fetch(`http://127.0.0.1:${staticPort}/rooms.json`);
  expect(response.ok).toBe(true);
  const body: unknown = await response.json();
  const rooms = recordFrom(body).rooms;
  if (!Array.isArray(rooms) || !rooms.every(isRoomSummary)) throw new Error("Rooms response was invalid");
  return rooms;
}

function recordFrom(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRoomSummary(value: unknown): value is { id: string; players: number; status: string; hostId: string } {
  const room = recordFrom(value);
  return typeof room.id === "string" && typeof room.players === "number"
    && typeof room.status === "string" && typeof room.hostId === "string";
}

test("three arena authoritative lobby waits for host start and shares two-player state", async () => {
  const staticPort = await findOpenPort();
  const wsPort = await findOpenPort();
  const proc = Bun.spawn([process.execPath, "run", "./examples/three-arena/server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(staticPort),
      THREE_ARENA_PORT: String(staticPort),
      THREE_ARENA_WS_PORT: String(wsPort),
      WS_PORT: String(wsPort),
    },
    stdout: "ignore",
    stderr: "pipe",
  });

  try {
    await waitForServer(staticPort);
    await waitForServer(wsPort);
    expect((await fetch(`http://127.0.0.1:${staticPort}/server.ts`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${staticPort}/package.json`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${staticPort}/assets/source/craftpix/craftpix-871156-zombie-tds-2d-game-kit.zip`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${staticPort}/%E0%A4%A`)).status).toBe(400);
    const post = await fetch(`http://127.0.0.1:${staticPort}/client.html`, { method: "POST" });
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET, HEAD");
    const clientHead = await fetch(`http://127.0.0.1:${staticPort}/client.html`, { method: "HEAD" });
    expect(clientHead.status).toBe(200);
    expect(await clientHead.text()).toBe("");
    const roomsHead = await fetch(`http://127.0.0.1:${staticPort}/rooms.json`, { method: "HEAD" });
    expect(roomsHead.status).toBe(200);
    expect(roomsHead.headers.get("cache-control")).toBe("no-store");
    expect(await roomsHead.text()).toBe("");
    const url = `ws://127.0.0.1:${wsPort}`;
    const roomId = `test-room-${crypto.randomUUID().slice(0, 8)}`;
    const host = await connectClient(url, roomId, "host");
    const guest = await connectClient(url, roomId, "guest");

    const waitingHostState = await waitUntil(
      () => latestState(host)?.players.length === 2 && latestState(host)?.status === "waiting" ? latestState(host) : false,
      "host sees two waiting players"
    );
    const waitingGuestState = await waitUntil(
      () => latestState(guest)?.players.length === 2 && latestState(guest)?.status === "waiting" ? latestState(guest) : false,
      "guest sees two waiting players"
    );
    expect(waitingHostState.roomId).toBe(roomId);
    expect(waitingGuestState.roomId).toBe(roomId);
    expect(host.playerId).toBeDefined();
    expect(waitingHostState.hostId).toBe(host.playerId!);

    const listedWaiting = await rooms(staticPort);
    expect(listedWaiting).toContainEqual(expect.objectContaining({ id: roomId, players: 2, status: "waiting", hostId: host.playerId }));

    guest.client.sendEvent({ type: "startRoom" });
    await Bun.sleep(150);
    expect(latestState(host)?.status).toBe("waiting");
    expect(latestState(guest)?.status).toBe("waiting");

    host.client.sendEvent({ type: "startRoom" });
    const hostStarted = await waitUntil(() => latestState(host)?.status === "running" ? latestState(host) : false, "host running state");
    const guestStarted = await waitUntil(() => latestState(guest)?.status === "running" ? latestState(guest) : false, "guest running state");

    expect(hostStarted.seed).toBe(guestStarted.seed);
    expect(hostStarted.startedAt).toBeGreaterThan(0);
    expect(guestStarted.startedAt).toBe(hostStarted.startedAt);

    host.client.sendInput({ name: "host", x: 12, y: 24, vx: 1, vy: 2, angle: 0.25, alive: true });
    guest.client.sendInput({ name: "guest", x: -8, y: 16, vx: 0, vy: 1, angle: 1.25, alive: true });

    const hostSharedState = await waitUntil(
      () => {
        const state = latestState(host);
        if (!state || state.players.length !== 2) return false;
        return state.players.some((player) => player.name === "host" && player.x === 12) &&
          state.players.some((player) => player.name === "guest" && player.x === -8)
          ? state
          : false;
      },
      "host receives both player inputs"
    );
    const guestSharedState = await waitUntil(
      () => {
        const state = latestState(guest);
        if (!state || state.players.length !== 2) return false;
        return state.players.some((player) => player.name === "host" && player.x === 12) &&
          state.players.some((player) => player.name === "guest" && player.x === -8)
          ? state
          : false;
      },
      "guest receives both player inputs"
    );

    expect(hostSharedState.players.map((player) => player.id).sort()).toEqual(guestSharedState.players.map((player) => player.id).sort());

    host.client.close();
    guest.client.close();
  } finally {
    proc.kill();
    await proc.exited;
  }
}, 30_000);
