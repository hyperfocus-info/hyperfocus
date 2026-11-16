import type { BinaryInputPayloadOwnership, BinaryPayloadCodec } from "../../protocol/messages.ts";
import type { ServerClock } from "../core/clock.ts";
import type { PresenceIndex } from "../core/presence-index.ts";
import type { AuthoritativeRoom } from "../core/room.ts";
import type { AuthAdapter, AuthoritativePlayer, MetricsSink, PersistenceAdapter, RoomReplicationAdaptiveTelemetry, RoomType, ServerLogger } from "../core/types.ts";
import type { ServerMetrics, ServerMetricsOptions } from "../operations/metrics.ts";
import type { EntityReplicator } from "../replication/replicator.ts";
import type { MmoAdmissionOptions, MmoScalePreset } from "../replication/scaling.ts";
import type { WorkerRoomHost } from "../routing/worker-room.ts";

export type EngineServerWebSocket<T = { playerId?: string }> = {
  data?: T;
  send(data: string | Uint8Array): number | void;
  close(code?: number, reason?: string): void;
};

export type ReplicationSpreadMode = "none" | "round-robin";

export type EffectiveReplicationOptions = {
  snapshotRate: number;
  deltaRate: number;
  maxBytesPerClientPerSecond: number;
  binary: boolean;
  maxClientsPerTick?: number;
  spread: ReplicationSpreadMode;
  phase: boolean;
  telemetry: boolean;
};

export type JoinRoomOptions = {
  roomId?: string;
  roomType?: string;
  zoneId?: string;
  token: string;
  request?: unknown;
  connection?: unknown;
};

export type CreateRoomOptions = {
  typeName?: string;
  roomType?: string;
  roomId?: string;
  worker?: boolean;
  workerScript?: string | URL;
  sharedBuffer?: SharedArrayBuffer;
  sharedBufferBytes?: number;
  tickRate?: number;
};

export type JoinRoomResult =
  | { ok: true; player: AuthoritativePlayer; room: AuthoritativeRoom; reason?: never }
  | { ok: false; reason: string; player?: never; room?: never };

export type AuthoritativeServerOptions = {
  /** Retain a disconnected authenticated seat for 0..30000ms. Default 0 disables recovery. */
  reconnectGraceMs?: number;
  transport: "websocket";
  port: number;
  /** Optional bind address; local development hosts should use 127.0.0.1. */
  hostname?: string;
  tickRate?: number;
  maxPlayersPerRoom?: number;
  rooms: readonly RoomType[];
  persistence?: PersistenceAdapter;
  auth?: AuthAdapter;
  metrics?: MetricsSink;
  metricsOptions?: Omit<ServerMetricsOptions, "sink">;
  log?: ServerLogger;
  now?: () => number;
  inputCodec?: BinaryPayloadCodec;
  /** Copy is safe for arbitrary codecs; borrow requires synchronous decode without retaining the input view. */
  binaryInputPayloadOwnership?: BinaryInputPayloadOwnership;
  maxCatchUpTicks?: number;
  durableEvents?: {
    maxPending?: number;
    batchSize?: number;
  };
  devMode?: boolean;
  /** Synchronous request boundary before built-in HTTP routes or WebSocket upgrade. */
  requestGuard?: (request: Request) => Response | undefined;
  /** Optional same-origin HTTP fallback after health, stats, and WebSocket upgrade handling. */
  httpHandler?: (request: Request) => Response | undefined | Promise<Response | undefined>;
  scale?: MmoScalePreset;
  admission?: MmoAdmissionOptions;
  replication?: {
    snapshotRate?: number;
    deltaRate?: number;
    maxBytesPerClientPerSecond?: number;
    binary?: boolean;
    maxClientsPerTick?: number;
    spread?: ReplicationSpreadMode;
    phase?: boolean;
    telemetry?: boolean;
  };
};

export type AuthoritativeServer = {
  start(): void;
  stop(): Promise<void>;
  tick(dt?: number): Promise<void>;
  createRoom(typeName: string, roomId?: string): AuthoritativeRoom;
  createRoom(options: CreateRoomOptions): AuthoritativeRoom;
  joinRoom(options: JoinRoomOptions): Promise<JoinRoomResult>;
  leavePlayer(playerId: string, reason?: string): Promise<boolean>;
  receiveInput(playerId: string, input: unknown): Promise<boolean>;
  receiveEvent(playerId: string, event: unknown): Promise<boolean>;
  getStats(): {
    port: number;
    rooms: number;
    players: number;
    clock: ReturnType<ServerClock["getStats"]>;
    metrics: ReturnType<ServerMetrics["snapshot"]>;
    metricsDiagnostics: ReturnType<ServerMetrics["diagnostics"]>;
    workerRooms: Array<ReturnType<WorkerRoomHost["getStats"]>>;
    roomTelemetry: Array<{
      id: string;
      type: string;
      players: number;
      replication: ReturnType<EntityReplicator<unknown>["metrics"]>;
      adaptive: RoomReplicationAdaptiveTelemetry;
      room?: unknown;
      warnings: string[];
    }>;
  };
  rooms(): readonly AuthoritativeRoom[];
  workerRooms(): readonly WorkerRoomHost[];
  presence: PresenceIndex;
};
