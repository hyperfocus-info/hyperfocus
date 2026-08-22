import type { ReplicationSchema } from "../protocol/schema.ts";
import type { ReplicationEnvelopeSegment } from "../protocol/frames.ts";
import type { ReplicationMetrics } from "./replicator.ts";

export type JoinDecision = boolean | { ok: boolean; reason?: string };

export type AuthResult = {
  ok: boolean;
  userId?: string;
  sessionId?: string;
  claims?: Record<string, unknown>;
  reason?: string;
};

export type AuthAdapter = {
  verify(token: string): Promise<AuthResult>;
  refresh?(sessionId: string): Promise<AuthResult>;
};

export type PersistenceAdapter = {
  loadPlayer(playerId: string): Promise<unknown | null>;
  savePlayer(playerId: string, record: unknown): Promise<void>;
  loadRoom(roomId: string): Promise<unknown | null>;
  saveRoom(roomId: string, snapshot: unknown): Promise<void>;
  appendEvent?(event: unknown): Promise<void>;
};

export type MetricsSink = {
  record(metric: string, value?: number, tags?: Record<string, string>): void;
};

export type ServerLogger = {
  info?(message: string, data?: unknown): void;
  warn?(message: string, data?: unknown): void;
  error?(message: string, data?: unknown): void;
};

export type AuthoritativePlayer = {
  id: string;
  userId: string;
  sessionId: string;
  roomId: string;
  joinedAt: number;
  lastInputAt: number;
  connection?: unknown;
  data?: unknown;
};

export type RoomContext<TState = unknown, TInput = unknown, TEvent = unknown> = {
  roomId: string;
  roomType: string;
  state: TState;
  players: Map<string, AuthoritativePlayer>;
  now: () => number;
  broadcast: (event: TEvent) => void;
  metrics: MetricsSink;
  persistence?: PersistenceAdapter;
};

export type RoomReplicationOptions = {
  snapshotRate?: number;
  deltaRate?: number;
  maxBytesPerClientPerSecond?: number;
};

export type RoomReplicationKind = "snapshot" | "delta";

export type RoomReplicationRequest<TState = unknown> = {
  kind: RoomReplicationKind;
  previousState?: TState;
  now: number;
};

export type RoomReplicationReceipt = {
  sequence: number;
  baseline: number;
  kind: RoomReplicationKind | "multipart_snapshot" | "multipart_delta";
  segments?: readonly ReplicationEnvelopeSegment[];
  now: number;
};

export type RoomReplicationPayload<TState = unknown> =
  | TState
  | {
      state: TState;
      segments: readonly ReplicationEnvelopeSegment[];
    };

export type RoomTelemetry = {
  warnings?: string[];
  [key: string]: unknown;
};

export type RoomReplicationAdaptiveTelemetry = {
  staticDeferredCountThreshold: number;
  staticDeferredSustainMs: number;
  staticDeferralHigh: boolean;
  staticDeferralHighForMs: number;
  staticDeferralSustained: boolean;
  reduceStaticRecordsRecommended: boolean;
  reduceTickRateRecommended: boolean;
  reason: string;
};

export type RoomReplicationTelemetry = {
  now: number;
  replication: ReplicationMetrics;
  adaptive: RoomReplicationAdaptiveTelemetry;
};

export type RoomType<TState = unknown, TInput = unknown, TEvent = unknown> = {
  name: string;
  schema: ReplicationSchema<TState>;
  maxPlayers?: number;
  replication?: RoomReplicationOptions;
  idleDisposeMs?: number;
  persistRoomIntervalMs?: number;
  createState(ctx: Pick<RoomContext<TState, TInput, TEvent>, "roomId" | "roomType" | "now">): TState;
  restoreState?(ctx: RoomContext<TState, TInput, TEvent>, snapshot: unknown): TState | Promise<TState>;
  canJoin?(ctx: RoomContext<TState, TInput, TEvent>, request: unknown): JoinDecision | Promise<JoinDecision>;
  onJoin?(ctx: RoomContext<TState, TInput, TEvent>, player: AuthoritativePlayer, request?: unknown): void | Promise<void>;
  onLeave?(ctx: RoomContext<TState, TInput, TEvent>, player: AuthoritativePlayer, reason: string): void | Promise<void>;
  onInput?(ctx: RoomContext<TState, TInput, TEvent>, player: AuthoritativePlayer, input: TInput): void | Promise<void>;
  update?(ctx: RoomContext<TState, TInput, TEvent>, dt: number): void | Promise<void>;
  getInterestTarget?(ctx: RoomContext<TState, TInput, TEvent>, player: AuthoritativePlayer): { x: number; y: number; radius: number };
  getSnapshot?(ctx: RoomContext<TState, TInput, TEvent>, player: AuthoritativePlayer): TState;
  getReplication?(
    ctx: RoomContext<TState, TInput, TEvent>,
    player: AuthoritativePlayer,
    request: RoomReplicationRequest<TState>
  ): RoomReplicationPayload<TState>;
  onReplicationSent?(ctx: RoomContext<TState, TInput, TEvent>, player: AuthoritativePlayer, receipt: RoomReplicationReceipt): void;
  onReplicationAck?(ctx: RoomContext<TState, TInput, TEvent>, player: AuthoritativePlayer, sequence: number): void;
  onReplicationTelemetry?(ctx: RoomContext<TState, TInput, TEvent>, telemetry: RoomReplicationTelemetry): void;
  getRoomTelemetry?(ctx: RoomContext<TState, TInput, TEvent>): RoomTelemetry | undefined;
  onEvent?(ctx: RoomContext<TState, TInput, TEvent>, player: AuthoritativePlayer, event: TEvent): void | Promise<void>;
  onDispose?(ctx: RoomContext<TState, TInput, TEvent>, reason: string): void | Promise<void>;
};
