import {
  createSnapshotFrameCodec,
  defineSchema,
  type ReplicationSchema,
} from "@hyperfocus/engine/protocol";

export type ThreeArenaStatePlayerSnapshot = {
  id: string;
  name: string;
  classId: string | null;
  weapons: Array<{ id: string; level: number; evolved: boolean }>;
  passives: Array<{ id: string; level: number; effects?: string[] }>;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  shooting: boolean;
  alive: boolean;
  lastSeen: number;
};

export type ThreeArenaStateShotSnapshot = {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  createdAt: number;
  ttl: number;
};

export type ThreeArenaRoomStatus = "waiting" | "running";

export type ThreeArenaStateSnapshot = {
  type: "state";
  roomId: string;
  status: ThreeArenaRoomStatus;
  hostId: string;
  seed: number;
  startedAt: number;
  createdAt: number;
  tick: number;
  time: number;
  players: ThreeArenaStatePlayerSnapshot[];
  shots: ThreeArenaStateShotSnapshot[];
};

export type ThreeArenaBinaryStateHeader = {
  tick: number;
  time: number;
  roomId: string;
  players: number;
  shots: number;
};

export type ThreeArenaEncodedPlayer = Omit<ThreeArenaStatePlayerSnapshot, "classId"> & {
  classId: string;
};

export type ThreeArenaEncodedState = Omit<ThreeArenaStateSnapshot, "type" | "players"> & {
  players: ThreeArenaEncodedPlayer[];
};

export const threeArenaStateSchema: ReplicationSchema<ThreeArenaEncodedState> = defineSchema<ThreeArenaEncodedState>({
  roomId: "string:32",
  status: "string:16",
  hostId: "string:32",
  seed: "u32",
  startedAt: "f64",
  createdAt: "f64",
  tick: "u32",
  time: "f64",
  players: {
    type: "array",
    maxLength: 256,
    item: {
      type: "entity",
      fields: {
        id: "string:32",
        name: "string:32",
        classId: "string:48",
        weapons: {
          type: "array",
          maxLength: 16,
          item: {
            type: "entity",
            fields: {
              id: "string:48",
              level: "u8",
              evolved: "bool",
            },
          },
        },
        passives: {
          type: "array",
          maxLength: 16,
          item: {
            type: "entity",
            fields: {
              id: "string:48",
              level: "u8",
              effects: {
                type: "array",
                maxLength: 8,
                item: "string:48",
              },
            },
          },
        },
        x: "f32",
        y: "f32",
        vx: "f32",
        vy: "f32",
        angle: "f32",
        shooting: "bool",
        alive: "bool",
        lastSeen: "f64",
      },
    },
  },
  shots: {
    type: "array",
    maxLength: 256,
    item: {
      type: "entity",
      fields: {
        id: "string:80",
        ownerId: "string:32",
        x: "f32",
        y: "f32",
        vx: "f32",
        vy: "f32",
        angle: "f32",
        createdAt: "f64",
        ttl: "f32",
      },
    },
  },
});

const threeArenaStateCodec = createSnapshotFrameCodec<ThreeArenaStateSnapshot, ThreeArenaEncodedState>({
  schema: threeArenaStateSchema,
  normalize: normalizeForEncoding,
  denormalize: (decoded) => ({
    type: "state",
    roomId: decoded.roomId,
    status: decoded.status === "running" ? "running" : "waiting",
    hostId: decoded.hostId,
    seed: decoded.seed,
    startedAt: decoded.startedAt,
    createdAt: decoded.createdAt,
    tick: decoded.tick,
    time: decoded.time,
    players: decoded.players.map((player) => ({
      ...player,
      classId: player.classId || null,
    })),
    shots: decoded.shots,
  }),
  sequence: (encoded) => encoded.tick,
});

export function encodeThreeArenaBinaryState(snapshot: ThreeArenaStateSnapshot): Uint8Array {
  return threeArenaStateCodec.encode(snapshot);
}

export function decodeThreeArenaBinaryState(message: ArrayBuffer | Uint8Array): ThreeArenaStateSnapshot {
  return threeArenaStateCodec.decode(message);
}

export function decodeThreeArenaBinaryStateHeader(message: ArrayBuffer | Uint8Array): ThreeArenaBinaryStateHeader {
  const state = decodeThreeArenaBinaryState(message);
  return {
    tick: state.tick,
    time: state.time,
    roomId: state.roomId,
    players: state.players.length,
    shots: state.shots.length,
  };
}

export function normalizeThreeArenaStateSnapshot(
  value: unknown,
  options: { fallbackRoomId?: string; fallbackTime?: number } = {},
): ThreeArenaStateSnapshot {
  const state = recordFrom(value);
  return {
    type: "state",
    roomId: stringFrom(state.roomId, options.fallbackRoomId ?? ""),
    status: state.status === "running" ? "running" : "waiting",
    hostId: stringFrom(state.hostId, ""),
    seed: unsignedIntFrom(state.seed, 0),
    startedAt: numberFrom(state.startedAt, 0),
    createdAt: numberFrom(state.createdAt, 0),
    tick: unsignedIntFrom(state.tick, 0),
    time: numberFrom(state.time, options.fallbackTime ?? 0),
    players: Array.isArray(state.players) ? state.players.flatMap(normalizePlayer) : [],
    shots: Array.isArray(state.shots) ? state.shots.flatMap(normalizeShot) : [],
  };
}

function normalizePlayer(value: unknown): ThreeArenaStatePlayerSnapshot[] {
  const player = recordFrom(value);
  if (typeof player.id !== "string") return [];
  return [{
    id: player.id,
    name: stringFrom(player.name, player.id),
    classId: typeof player.classId === "string" ? player.classId || null : null,
    weapons: Array.isArray(player.weapons) ? player.weapons.flatMap(normalizeWeapon) : [],
    passives: Array.isArray(player.passives) ? player.passives.flatMap(normalizePassive) : [],
    x: numberFrom(player.x, 0),
    y: numberFrom(player.y, 0),
    vx: numberFrom(player.vx, 0),
    vy: numberFrom(player.vy, 0),
    angle: numberFrom(player.angle, 0),
    shooting: player.shooting === true,
    alive: player.alive !== false,
    lastSeen: numberFrom(player.lastSeen, 0),
  }];
}

function normalizeWeapon(value: unknown): ThreeArenaStatePlayerSnapshot["weapons"] {
  const weapon = recordFrom(value);
  if (typeof weapon.id !== "string") return [];
  return [{ id: weapon.id, level: unsignedIntFrom(weapon.level, 1), evolved: weapon.evolved === true }];
}

function normalizePassive(value: unknown): ThreeArenaStatePlayerSnapshot["passives"] {
  const passive = recordFrom(value);
  if (typeof passive.id !== "string") return [];
  const effects = Array.isArray(passive.effects)
    ? passive.effects.filter((effect): effect is string => typeof effect === "string")
    : [];
  return [{ id: passive.id, level: unsignedIntFrom(passive.level, 1), effects }];
}

function normalizeShot(value: unknown): ThreeArenaStateShotSnapshot[] {
  const shot = recordFrom(value);
  if (typeof shot.id !== "string" || typeof shot.ownerId !== "string") return [];
  return [{
    id: shot.id,
    ownerId: shot.ownerId,
    x: numberFrom(shot.x, 0),
    y: numberFrom(shot.y, 0),
    vx: numberFrom(shot.vx, 0),
    vy: numberFrom(shot.vy, 0),
    angle: numberFrom(shot.angle, 0),
    createdAt: numberFrom(shot.createdAt, 0),
    ttl: numberFrom(shot.ttl, 0),
  }];
}

function recordFrom(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringFrom(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function numberFrom(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function unsignedIntFrom(value: unknown, fallback: number): number {
  const numberValue = Math.floor(numberFrom(value, fallback));
  return numberValue >= 0 && numberValue <= 0xffff_ffff ? numberValue : fallback;
}

function normalizeForEncoding(snapshot: ThreeArenaStateSnapshot): ThreeArenaEncodedState {
  return {
    roomId: snapshot.roomId,
    status: snapshot.status === "running" ? "running" : "waiting",
    hostId: snapshot.hostId || "",
    seed: Math.max(0, Math.floor(snapshot.seed)) >>> 0,
    startedAt: Number.isFinite(snapshot.startedAt) ? snapshot.startedAt : 0,
    createdAt: Number.isFinite(snapshot.createdAt) ? snapshot.createdAt : 0,
    tick: snapshot.tick,
    time: snapshot.time,
    players: snapshot.players.map((player) => ({
      ...player,
      classId: player.classId ?? "",
      passives: player.passives.map((passive) => ({ ...passive, effects: passive.effects ?? [] })),
    })),
    shots: snapshot.shots,
  };
}
