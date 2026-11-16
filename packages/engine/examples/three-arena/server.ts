import { cleanName, cleanRoomId, cleanProgressionId, cleanEffectIds, clampNumber, boolFrom, objectFrom } from "./src/server-fields.ts";
import { isRecord } from "@hyperfocus/utilities/records";
import { dirname, extname, resolve, sep } from "node:path";
import { threeArenaStateSchema, type ThreeArenaEncodedState } from "./binary-state.ts";
import { createAuthoritativeServer, createProjectedRoomType, type AuthoritativePlayer } from "@hyperfocus/engine/server";
import { assertDistinctPorts, parseTcpPort, relativePathWithin } from "@hyperfocus/engine/tooling/server";


type WeaponProgressionState = {
  id: string;
  level: number;
  evolved: boolean;
};

type PassiveProgressionState = {
  id: string;
  level: number;
  effects?: string[];
};

type PlayerState = {
  id: string;
  name: string;
  classId: string | null;
  weapons: WeaponProgressionState[];
  passives: PassiveProgressionState[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  shooting: boolean;
  alive: boolean;
  lastSeen: number;
  lastShotAt: number;
  lastClientShotAt: number;
};

type ShotState = {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  createdAt: number;
  lastSeen: number;
  ttl: number;
};

type ThreeArenaRoom = {
  id: string;
  createdAt: number;
  hostId: string;
  status: "waiting" | "running";
  seed: number;
  startedAt: number;
  players: Map<string, PlayerState>;
  shots: Map<string, ShotState>;
  tick: number;
};

type ThreeArenaInput = Record<string, unknown>;
type ThreeArenaEvent = { type?: string };

const DEFAULT_PORT = 8793;
const PORT = parseTcpPort(Bun.env.THREE_ARENA_PORT ?? Bun.env.PORT, DEFAULT_PORT, "THREE_ARENA_PORT");
const WS_PORT = parseTcpPort(Bun.env.THREE_ARENA_WS_PORT ?? Bun.env.WS_PORT, PORT + 1, "THREE_ARENA_WS_PORT");
assertDistinctPorts(PORT, WS_PORT, "THREE_ARENA_PORT", "THREE_ARENA_WS_PORT");
// Bun compile places module sources in `$bunfs`; external game assets live next
// to the shipped executable. Normal `bun server.ts` development keeps using the
// source directory.
const STATIC_ROOT = resolve(process.env.THREE_ARENA_STATIC_ROOT ?? (import.meta.dir.includes("$bunfs") ? dirname(process.execPath) : import.meta.dir));
const STATE_HZ = 20;
const SHOT_TTL_MS = 1_400;
const SHOT_SPEED = 880;
const SHOT_COOLDOWN_MS = 140;
const CLIENT_SHOT_COOLDOWN_MS = 35;
const MAX_CLIENT_SHOTS_PER_PLAYER = 32;
const MAX_ROOM_SHOTS = 256;
const ARENA_LIMIT = 5_000;

const mimeTypes: Record<string, string> = {
  ".webmanifest": "application/manifest+json",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".t3rig": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".fbx": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
};

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

















function joinRequestName(request: unknown, player: AuthoritativePlayer): string {
  const data = objectFrom(request);
  return cleanName(data.name ?? player.userId);
}

function defaultPlayer(player: AuthoritativePlayer, request: unknown): PlayerState {
  const now = Date.now();
  const spawn = Math.random() * Math.PI * 2;
  const radius = 160;
  return {
    id: player.id,
    name: joinRequestName(request, player),
    classId: null,
    weapons: [],
    passives: [],
    x: Math.cos(spawn) * radius,
    y: Math.sin(spawn) * radius,
    vx: 0,
    vy: 0,
    angle: spawn,
    shooting: false,
    alive: true,
    lastSeen: now,
    lastShotAt: 0,
    lastClientShotAt: 0,
  };
}

function cleanProgressionLevel(value: unknown, fallback = 1): number {
  return Math.floor(clampNumber(value, fallback, 1, 99));
}

function cleanWeaponProgression(value: unknown, fallback: WeaponProgressionState[]): WeaponProgressionState[] {
  if (!Array.isArray(value)) return fallback;

  const byId = new Map<string, WeaponProgressionState>();
  for (const rawItem of value.slice(0, 16)) {
    const item = objectFrom(rawItem);
    const id = cleanProgressionId(typeof rawItem === "string" ? rawItem : item.id ?? item.weaponId);
    if (!id) continue;

    byId.set(id, {
      id,
      level: cleanProgressionLevel(item.level ?? item.lvl, 1),
      evolved: boolFrom(item.evolved ?? item.evo),
    });
  }

  return Array.from(byId.values());
}

function cleanPassiveProgression(value: unknown, fallback: PassiveProgressionState[]): PassiveProgressionState[] {
  if (!Array.isArray(value)) return fallback;

  const byId = new Map<string, PassiveProgressionState>();
  for (const rawItem of value.slice(0, 16)) {
    const item = objectFrom(rawItem);
    const id = cleanProgressionId(typeof rawItem === "string" ? rawItem : item.id ?? item.passiveId);
    if (!id) continue;

    byId.set(id, {
      id,
      level: cleanProgressionLevel(item.level ?? item.lvl, 1),
      effects: cleanEffectIds(item.effects),
    });
  }

  return Array.from(byId.values());
}

function handleInput(room: ThreeArenaRoom, playerId: string, input: ThreeArenaInput): void {
  const player = room.players.get(playerId);
  if (!player) return;

  const progression = objectFrom(input.progression);
  const position = objectFrom(input.position);
  const velocity = objectFrom(input.velocity);
  const now = Date.now();
  const classId = cleanProgressionId(input.classId ?? input.selectedClassId ?? progression.classId ?? progression.selectedClassId);

  player.name = cleanName(input.name ?? player.name);
  if (classId) player.classId = classId;
  player.weapons = cleanWeaponProgression(input.weapons ?? progression.weapons, player.weapons);
  player.passives = cleanPassiveProgression(input.passives ?? input.passiveItems ?? progression.passives ?? progression.passiveItems, player.passives);
  player.x = clampNumber(input.x ?? position.x, player.x, -ARENA_LIMIT, ARENA_LIMIT);
  player.y = clampNumber(input.y ?? position.y, player.y, -ARENA_LIMIT, ARENA_LIMIT);
  player.vx = clampNumber(input.vx ?? velocity.x, player.vx, -2_000, 2_000);
  player.vy = clampNumber(input.vy ?? velocity.y, player.vy, -2_000, 2_000);
  player.angle = clampNumber(input.angle ?? input.rotation, player.angle, -Math.PI * 8, Math.PI * 8);
  player.shooting = boolFrom(input.shooting) || boolFrom(input.shoot) || boolFrom(input.fire);
  player.alive = input.alive === undefined ? player.alive : boolFrom(input.alive);
  player.lastSeen = now;

  if (Array.isArray(input.shots)) replaceClientShots(room, player, input.shots, now);
  if (input.shot && typeof input.shot === "object") addClientShot(room, player, objectFrom(input.shot), now, true);
  if (player.shooting) addServerShot(room, player, now);
}

function replaceClientShots(room: ThreeArenaRoom, player: PlayerState, shots: unknown[], now: number): void {
  for (const [shotId, shot] of room.shots) {
    if (shot.ownerId === player.id && shotId.startsWith(`${player.id}:`)) room.shots.delete(shotId);
  }

  for (const rawShot of shots.slice(0, 32)) {
    if (rawShot && typeof rawShot === "object") addClientShot(room, player, objectFrom(rawShot), now);
  }
}

function addClientShot(room: ThreeArenaRoom, player: PlayerState, shotInput: Record<string, unknown>, now: number, rateLimited = false): void {
  if (rateLimited) {
    if (now - player.lastClientShotAt < CLIENT_SHOT_COOLDOWN_MS) return;
    player.lastClientShotAt = now;
  }
  trimShotCapacity(room, player.id);
  const position = objectFrom(shotInput.position);
  const velocity = objectFrom(shotInput.velocity);
  const rawId = typeof shotInput.id === "string" ? shotInput.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) : "";
  const id = `${player.id}:${rawId || makeId("shot")}`;

  room.shots.set(id, {
    id,
    ownerId: player.id,
    x: clampNumber(shotInput.x ?? position.x, player.x, -ARENA_LIMIT, ARENA_LIMIT),
    y: clampNumber(shotInput.y ?? position.y, player.y, -ARENA_LIMIT, ARENA_LIMIT),
    vx: clampNumber(shotInput.vx ?? velocity.x, Math.cos(player.angle) * SHOT_SPEED, -3_000, 3_000),
    vy: clampNumber(shotInput.vy ?? velocity.y, Math.sin(player.angle) * SHOT_SPEED, -3_000, 3_000),
    angle: clampNumber(shotInput.angle, player.angle, -Math.PI * 8, Math.PI * 8),
    createdAt: now,
    lastSeen: now,
    ttl: clampNumber(shotInput.ttl, SHOT_TTL_MS, 120, 5_000),
  });
}

function trimShotCapacity(room: ThreeArenaRoom, ownerId: string): void {
  while (countShots(room, ownerId) >= MAX_CLIENT_SHOTS_PER_PLAYER) {
    const oldest = oldestShotId(room, ownerId);
    if (!oldest) break;
    room.shots.delete(oldest);
  }
  while (room.shots.size >= MAX_ROOM_SHOTS) {
    const oldest = oldestShotId(room);
    if (!oldest) break;
    room.shots.delete(oldest);
  }
}

function countShots(room: ThreeArenaRoom, ownerId: string): number {
  let count = 0;
  for (const shot of room.shots.values()) {
    if (shot.ownerId === ownerId) count += 1;
  }
  return count;
}

function oldestShotId(room: ThreeArenaRoom, ownerId?: string): string | null {
  let oldestId: string | null = null;
  let oldestTime = Number.POSITIVE_INFINITY;
  for (const [shotId, shot] of room.shots) {
    if (ownerId && shot.ownerId !== ownerId) continue;
    if (shot.createdAt >= oldestTime) continue;
    oldestTime = shot.createdAt;
    oldestId = shotId;
  }
  return oldestId;
}

function addServerShot(room: ThreeArenaRoom, player: PlayerState, now: number): void {
  if (room.status !== "running") return;
  if (now - player.lastShotAt < SHOT_COOLDOWN_MS) return;
  player.lastShotAt = now;
  trimShotCapacity(room, player.id);

  const vx = Math.cos(player.angle) * SHOT_SPEED + player.vx * 0.25;
  const vy = Math.sin(player.angle) * SHOT_SPEED + player.vy * 0.25;
  const id = makeId(`shot-${player.id}`);

  room.shots.set(id, {
    id,
    ownerId: player.id,
    x: player.x + Math.cos(player.angle) * 18,
    y: player.y + Math.sin(player.angle) * 18,
    vx,
    vy,
    angle: player.angle,
    createdAt: now,
    lastSeen: now,
    ttl: SHOT_TTL_MS,
  });
}

function advanceRoom(room: ThreeArenaRoom, now: number): void {
  room.tick = (room.tick + 1) >>> 0;

  for (const [shotId, shot] of room.shots) {
    const dt = Math.min(0.1, Math.max(0, now - shot.lastSeen) / 1_000);
    shot.x = clampNumber(shot.x + shot.vx * dt, shot.x, -ARENA_LIMIT, ARENA_LIMIT);
    shot.y = clampNumber(shot.y + shot.vy * dt, shot.y, -ARENA_LIMIT, ARENA_LIMIT);
    shot.lastSeen = now;

    if (now - shot.createdAt > shot.ttl) room.shots.delete(shotId);
  }
}

function stateSnapshot(room: ThreeArenaRoom): ThreeArenaEncodedState {
  return {
    roomId: room.id,
    status: room.status,
    hostId: room.hostId,
    seed: room.seed,
    startedAt: room.startedAt,
    createdAt: room.createdAt,
    tick: room.tick,
    time: Date.now(),
    players: Array.from(room.players.values()).map((player) => ({
      id: player.id,
      name: player.name,
      classId: player.classId ?? "",
      weapons: player.weapons.map((weapon) => ({ id: weapon.id, level: weapon.level, evolved: weapon.evolved })),
      passives: player.passives.map((passive) => ({ id: passive.id, level: passive.level, effects: passive.effects ?? [] })),
      x: player.x,
      y: player.y,
      vx: player.vx,
      vy: player.vy,
      angle: player.angle,
      shooting: player.shooting,
      alive: player.alive,
      lastSeen: player.lastSeen,
    })),
    shots: Array.from(room.shots.values()).map((shot) => ({
      id: shot.id,
      ownerId: shot.ownerId,
      x: shot.x,
      y: shot.y,
      vx: shot.vx,
      vy: shot.vy,
      angle: shot.angle,
      createdAt: shot.createdAt,
      ttl: shot.ttl,
    })),
  };
}

const threeArenaRoomType = createProjectedRoomType<ThreeArenaRoom, ThreeArenaEncodedState, ThreeArenaInput, ThreeArenaEvent>({
  name: "three-arena",
  schema: threeArenaStateSchema,
  idleDisposeMs: 5_000,
  replication: {
    snapshotRate: STATE_HZ,
    deltaRate: STATE_HZ,
  },
  createState(ctx) {
    return {
      id: cleanRoomId(ctx.roomId) ?? ctx.roomId,
      createdAt: ctx.now(),
      hostId: "",
      status: "waiting",
      seed: Math.floor(Math.random() * 0xffffffff),
      startedAt: 0,
      players: new Map(),
      shots: new Map(),
      tick: 0,
    };
  },
  onJoin(ctx, player, request) {
    ctx.state.hostId ||= player.id;
    ctx.state.players.set(player.id, defaultPlayer(player, request));
  },
  onLeave(ctx, player) {
    ctx.state.players.delete(player.id);
    for (const [shotId, shot] of ctx.state.shots) {
      if (shot.ownerId === player.id) ctx.state.shots.delete(shotId);
    }
    if (ctx.state.hostId === player.id) ctx.state.hostId = ctx.state.players.keys().next().value ?? "";
  },
  onInput(ctx, player, input) {
    handleInput(ctx.state, player.id, input);
  },
  onEvent(ctx, player, event) {
    if (event?.type !== "startRoom") return;
    if (ctx.state.hostId !== player.id) return;
    if (ctx.state.status === "running") return;
    ctx.state.status = "running";
    ctx.state.startedAt = ctx.now();
    ctx.state.seed = Number.isFinite(ctx.state.seed) ? ctx.state.seed : Math.floor(Math.random() * 0xffffffff);
  },
  update(ctx) {
    advanceRoom(ctx.state, ctx.now());
  },
  getSnapshot(ctx) {
    return stateSnapshot(ctx.state);
  },
});

const authoritative = createAuthoritativeServer({
  transport: "websocket",
  hostname: process.env.HOST?.trim() || "127.0.0.1",
  port: WS_PORT,
  tickRate: STATE_HZ,
  rooms: [threeArenaRoomType],
  devMode: true,
  replication: {
    snapshotRate: STATE_HZ,
    deltaRate: STATE_HZ,
    binary: true,
  },
});

function listRooms(): Array<{ id: string; players: number; createdAt: number; hostId: string | null; status: ThreeArenaRoom["status"]; startedAt: number | null; seed: number }> {
  return authoritative
    .rooms()
    .map((room) => room.ctx.state)
    .filter(isThreeArenaRoom)
    .map(stateSnapshot)
    .filter((room) => room.players.length > 0)
    .map((room) => ({
      id: room.roomId,
      players: room.players.length,
      createdAt: room.createdAt,
      hostId: room.hostId || null,
      status: room.status,
      startedAt: room.startedAt || null,
      seed: room.seed,
    }))
    .sort((left, right) => left.createdAt - right.createdAt);
}

function isThreeArenaRoom(value: unknown): value is ThreeArenaRoom {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.createdAt === "number"
    && typeof value.hostId === "string"
    && (value.status === "waiting" || value.status === "running")
    && typeof value.seed === "number"
    && typeof value.startedAt === "number"
    && value.players instanceof Map
    && value.shots instanceof Map
    && typeof value.tick === "number";
}

async function serveStatic(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const url = new URL(request.url);
  if (url.pathname === "/healthz") {
    return new Response(request.method === "HEAD" ? null : "ok", { headers: { "Cache-Control": "no-store" } });
  }
  if (url.pathname === "/rooms.json" || url.pathname === "/stats.json") {
    const body = url.pathname === "/rooms.json" ? { rooms: listRooms() } : authoritative.getStats();
    return request.method === "HEAD"
      ? new Response(null, { headers: { "Cache-Control": "no-store", "Content-Type": "application/json" } })
      : Response.json(body, { headers: { "Cache-Control": "no-store" } });
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return new Response("Bad path", { status: 400 });
  }

  const routePath = pathname === "/" ? "client.html" : pathname.replace(/^\/+/, "");
  if (!routePath || routePath.includes("\0")) return new Response("Bad path", { status: 400 });

  const extension = extname(routePath).toLowerCase();
  const publicFile = routePath === "client.html" || routePath === "dist/client.js";
  const publicBrand = /^brand\/[a-z0-9-]+\.(svg|png|ico|json|webmanifest)$/.test(routePath);
  const publicAsset = routePath.startsWith("assets/") && RUNTIME_ASSET_EXTENSIONS.has(extension);
  if (!publicFile && !publicAsset && !publicBrand) return new Response("Not found", { status: 404 });

  return serveFile(resolve(STATIC_ROOT, routePath), STATIC_ROOT, request.method === "HEAD");
}

const RUNTIME_ASSET_EXTENSIONS = new Set([
  ".bin", ".fbx", ".gif", ".glb", ".gltf", ".ico", ".jpeg", ".jpg", ".json", ".mp3", ".ogg", ".png", ".svg", ".t3rig", ".wav", ".webp"
]);

async function serveFile(filePath: string, root: string, head = false): Promise<Response> {
  if (relativePathWithin(root, filePath) === null) return new Response("Forbidden", { status: 403 });

  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    const fallbackPath = resolveMissingAssetFallback(filePath, root);
    if (fallbackPath) return serveFile(fallbackPath, root, head);
    return new Response("Not found", { status: 404 });
  }

  const contentType = mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream";
  return new Response(head ? null : file, {
    headers: {
      "Cache-Control": filePath.includes(`${sep}assets${sep}`) ? "public, max-age=3600" : "no-store",
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function resolveMissingAssetFallback(filePath: string, root: string): string | null {
  const normalized = filePath.replace(/\\/g, "/");
  const marker = "/assets/usable/collectibles/treasure-low-poly/fbx/Texture_MAp_treasure.png";
  if (!normalized.endsWith(marker)) return null;
  return resolve(root, "assets/usable/collectibles/treasure-low-poly/texture/Texture_MAp_treasure.png");
}

authoritative.start();

Bun.serve({
  port: PORT,
  fetch(request) {
    return serveStatic(request);
  },
});

console.log(`three-arena static listening on http://localhost:${PORT}`);
console.log(`three-arena authoritative websocket listening on ws://localhost:${WS_PORT}`);
console.log(`three-arena client: http://localhost:${PORT}/client.html`);
