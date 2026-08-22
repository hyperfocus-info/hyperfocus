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
