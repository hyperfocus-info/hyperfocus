import type { AuthoritativePlayer, JoinDecision, MetricsSink, PersistenceAdapter, RoomBroadcast, RoomContext, RoomReplicationPayload, RoomReplicationReceipt, RoomReplicationRequest, RoomReplicationTelemetry, RoomTelemetry, RoomType } from "./types.ts";
import { createAuthoritativeRoomRuntime } from "./room-runtime.ts";

export type AuthoritativeRoom<TState = unknown, TInput = unknown, TEvent = unknown, TSnapshot = TState> = {
  id: string;
  type: RoomType<TState, TInput, TEvent, TSnapshot>;
  ctx: RoomContext<TState, TInput, TEvent>;
  ready(): Promise<void>;
  runExclusive<TResult>(operation: () => TResult | Promise<TResult>): Promise<TResult>;
  join(player: AuthoritativePlayer, request?: unknown, maxPlayers?: number): Promise<JoinDecision>;
  leave(playerId: string, reason?: string): Promise<boolean>;
  input(playerId: string, input: TInput): Promise<boolean>;
  event(playerId: string, event: TEvent): Promise<boolean>;
  update(dt: number): Promise<void>;
  drainBroadcasts(): RoomBroadcast<TEvent>[];
  persist(): Promise<boolean>;
  dispose(reason?: string): Promise<void>;
  disposeIfIdle(now: number, reason?: string): Promise<boolean>;
  shouldDispose(now: number): boolean;
  snapshotFor(playerId: string): TSnapshot;
  replicationFor(playerId: string, request: RoomReplicationRequest<TSnapshot>): RoomReplicationPayload<TSnapshot>;
  replicationSent(playerId: string, receipt: RoomReplicationReceipt): void;
  replicationAck(playerId: string, sequence: number): void;
  replicationTelemetry(telemetry: RoomReplicationTelemetry): void;
  getTelemetry(): RoomTelemetry | undefined;
  getStats(): { id: string; type: string; players: number; updates: number; lastUpdateMs: number };
};

export function createAuthoritativeRoom<TState, TInput = unknown, TEvent = unknown, TSnapshot = TState>(options: {
  id: string;
  type: RoomType<TState, TInput, TEvent, TSnapshot>;
  now: () => number;
  metrics: MetricsSink;
  persistence?: PersistenceAdapter;
}): AuthoritativeRoom<TState, TInput, TEvent, TSnapshot> {
  return createAuthoritativeRoomRuntime(options);
}
