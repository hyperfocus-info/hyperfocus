import { normalizeSignedZero, requirePort, required } from "./bench/network-fields.ts";
import { roundDecimal } from "@hyperfocus/utilities/math";
import { isRecord } from "@hyperfocus/utilities/records";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
import net from "node:net";
import { connectAuthoritative, type AuthoritativeClient } from "@hyperfocus/engine/net";
import { threeArenaStateSchema } from "./binary-state.ts";

type BenchOptions = {
  clients: number;
  durationMs: number;
  inputHz: number;
  roomId: string;
  url?: string;
  out?: string;
  binary: boolean;
};

type ClientStats = {
  id: number;
  playerId: string | null;
  sentMessages: number;
  sentBytes: number;
  receivedMessages: number;
  receivedBytes: number;
  stateMessages: number;
  stateBytes: number;
  latenciesMs: number[];
  maxPlayersSeen: number;
  maxShotsSeen: number;
};

type BenchClient = {
  id: number;
  client: AuthoritativeClient;
  joined: boolean;
  running: boolean;
  stats: ClientStats;
};

const opts = parseArgs(process.argv.slice(2));
const result = await runBench(opts);
if (opts.out) {
  await mkdir(dirname(opts.out), { recursive: true });
  await writeFile(opts.out, `${JSON.stringify(result, null, 2)}\n`);
}
console.log(JSON.stringify(result, null, 2));

async function runBench(options: BenchOptions) {
  const staticPort = options.url ? undefined : await findOpenPort();
  const wsPort = options.url ? Number(new URL(options.url).port || 80) : await findOpenPort();
  const url = options.url ?? `ws://127.0.0.1:${wsPort}`;
  const server = options.url ? undefined : startServer(requirePort(staticPort), wsPort);
  const startedAt = new Date().toISOString();
  let clients: BenchClient[] = [];
  try {
    if (server) {
      await waitForServer(requirePort(staticPort), server);
      await waitForServer(wsPort, server);
    }
    clients = await connectClients(url, options.clients, options.roomId);
    clients[0]?.client.sendEvent({ type: "startRoom" });
    await waitUntil(() => clients.every((client) => client.running), 5000, "clients received running state");
    for (const client of clients) resetMeasurementWindow(client.stats);

    const start = performance.now();
    await driveInputs(clients, options.durationMs, options.inputHz);
    await delay(250);
    const elapsedMs = performance.now() - start;
    const stats = clients.map((client) => client.stats);
    const totalSentBytes = stats.reduce((sum, item) => sum + item.sentBytes, 0);
    const totalReceivedBytes = stats.reduce((sum, item) => sum + item.receivedBytes, 0);
    const totalStateBytes = stats.reduce((sum, item) => sum + item.stateBytes, 0);
    const allLatencies = stats.flatMap((item) => item.latenciesMs);
    return {
      startedAt,
      url,
      mode: options.url
        ? options.binary ? "authoritative-binary-requested" : "authoritative-server-selected"
        : "authoritative-binary",
      clientCount: options.clients,
      durationMs: options.durationMs,
      inputHz: options.inputHz,
      elapsedMs: round(elapsedMs),
      aggregate: {
        sentKbPerSecond: round(totalSentBytes / Math.max(1, elapsedMs) * 1000 / 1024),
        receivedKbPerSecond: round(totalReceivedBytes / Math.max(1, elapsedMs) * 1000 / 1024),
        stateKbPerSecond: round(totalStateBytes / Math.max(1, elapsedMs) * 1000 / 1024),
        stateBytesPerMessageAvg: round(totalStateBytes / Math.max(1, stats.reduce((sum, item) => sum + item.stateMessages, 0))),
        stateLatencyMsP50: round(percentile(allLatencies, 0.5)),
        stateLatencyMsP95: round(percentile(allLatencies, 0.95)),
        maxPlayersSeen: Math.max(...stats.map((item) => item.maxPlayersSeen)),
        maxShotsSeen: Math.max(...stats.map((item) => item.maxShotsSeen))
      },
      clients: stats.map((item) => {
        const { latenciesMs, ...publicStats } = item;
        return {
          ...publicStats,
          latencyMsP50: round(percentile(latenciesMs, 0.5)),
          latencyMsP95: round(percentile(latenciesMs, 0.95))
        };
      })
    };
  } finally {
    for (const client of clients) client.client.close();
    await stopServer(server);
  }
}

function resetMeasurementWindow(stats: ClientStats) {
  stats.sentMessages = 0;
  stats.sentBytes = 0;
  stats.receivedMessages = 0;
  stats.receivedBytes = 0;
  stats.stateMessages = 0;
  stats.stateBytes = 0;
  stats.latenciesMs.length = 0;
  stats.maxPlayersSeen = 0;
  stats.maxShotsSeen = 0;
}

function startServer(staticPort: number, wsPort: number) {
  const bunExe = process.execPath;
  const child = spawn(bunExe, ["run", "./examples/three-arena/server.ts"], { windowsHide: true,
    cwd: process.cwd(),
    env: {
      ...process.env,
      THREE_ARENA_PORT: String(staticPort),
      PORT: String(staticPort),
      THREE_ARENA_WS_PORT: String(wsPort),
      WS_PORT: String(wsPort)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let startupError: Error | undefined;
  child.once("error", (error) => {
    startupError = error;
  });
  child.stdout?.on("data", () => undefined);
  child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  return { child, startupError: () => startupError };
}

async function connectClients(url: string, count: number, roomId: string) {
  const clients: BenchClient[] = [];
  try {
    for (let i = 0; i < count; i += 1) clients.push(await connectClient(url, i, roomId));
    await waitUntil(() => clients.every((client) => client.joined), 5000, "clients joined room");
    await waitUntil(() => clients.every((client) => client.stats.maxPlayersSeen >= count), 5000, "clients see full room");
    return clients;
  } catch (error) {
    for (const client of clients) client.client.close();
    throw error;
  }
}

async function connectClient(url: string, id: number, roomId: string): Promise<BenchClient> {
  const stats: ClientStats = {
    id,
    playerId: null,
    sentMessages: 0,
    sentBytes: 0,
    receivedMessages: 0,
    receivedBytes: 0,
    stateMessages: 0,
    stateBytes: 0,
    latenciesMs: [],
    maxPlayersSeen: 0,
    maxShotsSeen: 0
  };
  let currentReceivedBytes = 0;
  const CountingWebSocket = new Proxy(WebSocket, {
    construct(Target, args) {
      const socket: WebSocket = Reflect.construct(Target, args);
      socket.addEventListener("message", (event) => {
        const data: unknown = event.data;
        currentReceivedBytes = wireByteLength(data);
        stats.receivedMessages += 1;
        stats.receivedBytes += currentReceivedBytes;
      });
      const send = socket.send.bind(socket);
      socket.send = (data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
        stats.sentMessages += 1;
        stats.sentBytes += wireByteLength(data);
        if (typeof data === "string" || data instanceof Blob || data instanceof ArrayBuffer) {
          send(data);
        } else if (ArrayBuffer.isView(data)) {
          const bytes = new Uint8Array(data.byteLength);
          bytes.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
          send(bytes);
        } else {
          const bytes = new Uint8Array(data.byteLength);
          bytes.set(new Uint8Array(data));
          send(bytes);
        }
      };
      return socket;
    }
  });
  const client = connectAuthoritative({
    url,
    token: `dev:bench-${id}-${crypto.randomUUID()}`,
    roomId,
    roomType: "three-arena",
    request: { name: `bench-${id}` },
    schema: threeArenaStateSchema,
    WebSocketImpl: CountingWebSocket
  });
  const benchClient: BenchClient = {
    id,
    client,
    joined: false,
    running: false,
    stats
  };
  let removeMessage: () => void = () => undefined;
  let joinTimeout: ReturnType<typeof setTimeout> | undefined;
  const joined = new Promise<void>((resolve, reject) => {
    joinTimeout = setTimeout(() => {
      removeMessage();
      reject(new Error(`client ${id} join timeout`));
    }, 8000);
    removeMessage = client.onMessage((message) => {
      if (message.type === "join_accepted") {
        const payload = recordFrom(message.payload);
        benchClient.stats.playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        benchClient.joined = true;
        clearTimeout(joinTimeout);
        removeMessage();
        resolve();
      }
      if (message.type === "join_rejected" || message.type === "error") {
        clearTimeout(joinTimeout);
        removeMessage();
        reject(new Error(`client ${id} join rejected`));
      }
    });
  });
  const recordReplicationState = (state: unknown) => recordState(benchClient, state, currentReceivedBytes);
  client.onSnapshot(recordReplicationState);
  client.onDelta(recordReplicationState);
  try {
    await client.connect();
    await joined;
    return benchClient;
  } catch (error) {
    clearTimeout(joinTimeout);
    removeMessage();
    client.close();
    throw error;
  }
}

async function driveInputs(clients: BenchClient[], durationMs: number, inputHz: number) {
  const intervalMs = 1000 / inputHz;
  const start = performance.now();
  let tick = 0;
  while (performance.now() - start < durationMs) {
    for (const client of clients) {
      const angle = (tick * 0.11 + client.id) % (Math.PI * 2);
      const input = {
        name: `bench-${client.id}`,
        x: normalizeSignedZero(Math.cos(angle) * (160 + client.id * 2)),
        y: normalizeSignedZero(Math.sin(angle) * (160 + client.id * 2)),
        vx: normalizeSignedZero(-Math.sin(angle) * 180),
        vy: normalizeSignedZero(Math.cos(angle) * 180),
        angle: normalizeSignedZero(angle),
        shooting: tick % 3 === 0,
        weapons: [{ id: "pistol", level: 3, evolved: false }],
        passives: [{ id: "boots", level: 2 }]
      };
      client.client.sendInput(input);
    }
    tick += 1;
    await delay(Math.max(0, start + tick * intervalMs - performance.now()));
  }
}



function recordState(client: BenchClient, state: unknown, wireBytes: number) {
  const data = isRecord(state) ? state : {};
  const players = Array.isArray(data.players) ? data.players : [];
  const shots = Array.isArray(data.shots) ? data.shots : [];
  client.stats.stateMessages += 1;
  client.stats.stateBytes += wireBytes;
  client.stats.maxPlayersSeen = Math.max(client.stats.maxPlayersSeen, players.length);
  client.stats.maxShotsSeen = Math.max(client.stats.maxShotsSeen, shots.length);
  client.running ||= data.status === "running";
  if (typeof data.time === "number") client.stats.latenciesMs.push(Math.max(0, Date.now() - data.time));
}



function wireByteLength(data: unknown) {
  if (typeof data === "string") return Buffer.byteLength(data);
  if (data instanceof Blob) return data.size;
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  throw new Error(`Unsupported WebSocket payload: ${Object.prototype.toString.call(data)}`);
}

async function waitForServer(port: number, server: ReturnType<typeof startServer>) {
  await waitUntil(async () => {
    const startupError = server.startupError();
    if (startupError) throw startupError;
    if (server.child.exitCode !== null || server.child.signalCode !== null) {
      throw new Error(`three-arena server exited before listening on ${port}`);
    }
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
      socket.setTimeout(500, () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, "127.0.0.1");
    });
  }, 10000, `server start on ${port}`);
}

async function stopServer(server: ReturnType<typeof startServer> | undefined) {
  if (!server) return;
  const child = server.child;
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.once("error", () => resolve());
  });
  if (!child.kill()) return;
  await exited;
}



function recordFrom(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

async function waitUntil(check: () => boolean | Promise<boolean>, timeoutMs: number, label: string) {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    if (await check()) return;
    await delay(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function findOpenPort() {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("No port"));
      });
    });
  });
}

function parseArgs(argv: string[]): BenchOptions {
  const options: BenchOptions = {
    clients: 12,
    durationMs: 8000,
    inputHz: 20,
    roomId: `bench-${Date.now().toString(36)}`,
    binary: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--clients") options.clients = Number(required(argv, ++i, arg));
    else if (arg === "--duration-ms") options.durationMs = Number(required(argv, ++i, arg));
    else if (arg === "--input-hz") options.inputHz = Number(required(argv, ++i, arg));
    else if (arg === "--room-id") options.roomId = required(argv, ++i, arg);
    else if (arg === "--url") options.url = required(argv, ++i, arg);
    else if (arg === "--out") options.out = required(argv, ++i, arg);
    else if (arg === "--binary") options.binary = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.clients) || options.clients < 1) throw new Error("--clients must be positive integer");
  if (!Number.isFinite(options.durationMs) || options.durationMs <= 0) throw new Error("--duration-ms must be positive");
  if (!Number.isFinite(options.inputHz) || options.inputHz <= 0) throw new Error("--input-hz must be positive");
  if (options.url) {
    const url = new URL(options.url);
    if (url.protocol !== "ws:" && url.protocol !== "wss:") throw new Error("--url must use ws: or wss:");
  }
  return options;
}



function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(values: readonly number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

function round(value: number) { return roundDecimal(value, 3); }
