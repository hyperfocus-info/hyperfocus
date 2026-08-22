import { AsyncLocalStorage } from "node:async_hooks";
import type { AuthoritativePlayer, JoinDecision, MetricsSink, PersistenceAdapter, RoomContext, RoomReplicationPayload, RoomReplicationReceipt, RoomReplicationRequest, RoomReplicationTelemetry, RoomTelemetry, RoomType } from "./types.ts";

export type AuthoritativeRoom<TState = unknown, TInput = unknown, TEvent = unknown> = {
  id: string;
  type: RoomType<TState, TInput, TEvent>;
  ctx: RoomContext<TState, TInput, TEvent>;
  ready(): Promise<void>;
  runExclusive<TResult>(operation: () => TResult | Promise<TResult>): Promise<TResult>;
  join(player: AuthoritativePlayer, request?: unknown, maxPlayers?: number): Promise<JoinDecision>;
  leave(playerId: string, reason?: string): Promise<boolean>;
  input(playerId: string, input: TInput): Promise<boolean>;
  event(playerId: string, event: TEvent): Promise<boolean>;
  update(dt: number): Promise<void>;
  drainBroadcasts(): TEvent[];
  persist(): Promise<boolean>;
  dispose(reason?: string): Promise<void>;
  disposeIfIdle(now: number, reason?: string): Promise<boolean>;
  shouldDispose(now: number): boolean;
  snapshotFor(playerId: string): TState;
  replicationFor(playerId: string, request: RoomReplicationRequest<TState>): RoomReplicationPayload<TState>;
  replicationSent(playerId: string, receipt: RoomReplicationReceipt): void;
  replicationAck(playerId: string, sequence: number): void;
  replicationTelemetry(telemetry: RoomReplicationTelemetry): void;
  getTelemetry(): RoomTelemetry | undefined;
  getStats(): { id: string; type: string; players: number; updates: number; lastUpdateMs: number };
};

function normalizeJoinDecision(decision: JoinDecision | undefined): JoinDecision {
  return decision ?? true;
}

function joinAllowed(decision: JoinDecision) {
  return typeof decision === "boolean" ? decision : decision.ok;
}

export function createAuthoritativeRoom<TState, TInput = unknown, TEvent = unknown>(options: {
  id: string;
  type: RoomType<TState, TInput, TEvent>;
  now: () => number;
  metrics: MetricsSink;
  persistence?: PersistenceAdapter;
}): AuthoritativeRoom<TState, TInput, TEvent> {
  if (typeof options.id !== "string" || options.id.trim().length === 0) throw new Error("room id must be a non-empty string");
  if (typeof options.type.name !== "string" || options.type.name.trim().length === 0) throw new Error("room type name must be a non-empty string");
  if (options.type.maxPlayers !== undefined && (!Number.isSafeInteger(options.type.maxPlayers) || options.type.maxPlayers < 0)) {
    throw new RangeError("room maxPlayers must be a non-negative safe integer");
  }
  if (options.type.idleDisposeMs !== undefined && (!Number.isFinite(options.type.idleDisposeMs) || options.type.idleDisposeMs < 0)) {
    throw new RangeError("room idleDisposeMs must be a non-negative finite number");
  }
  if (options.type.persistRoomIntervalMs !== undefined && (!Number.isFinite(options.type.persistRoomIntervalMs) || options.type.persistRoomIntervalMs < 0)) {
    throw new RangeError("room persistRoomIntervalMs must be a non-negative finite number");
  }
  const events: TEvent[] = [];
  const ctx: RoomContext<TState, TInput, TEvent> = {
    roomId: options.id,
    roomType: options.type.name,
    state: options.type.createState({ roomId: options.id, roomType: options.type.name, now: options.now }),
    players: new Map(),
    now: options.now,
    broadcast(event) {
      events.push(event);
    },
    metrics: options.metrics,
    persistence: options.persistence
  };
  let lastEmptyAt = options.now();
  let updates = 0;
  let lastUpdateMs = 0;
  let lastPersistAt = options.now();
  let disposed = false;
  let disposePromise: Promise<void> | undefined;
  let idleDisposePromise: Promise<boolean> | undefined;
  let operationQueue = Promise.resolve();
  let cachedTelemetry: RoomTelemetry | undefined;
  const operationContext = new AsyncLocalStorage<object>();
  const activeOperationTokens = new Set<object>();

  const initializationToken = {};
  activeOperationTokens.add(initializationToken);
  const initialization = operationContext.run(initializationToken, async () => {
    try {
      if (!options.persistence) return;
      const snapshot = await options.persistence.loadRoom(options.id);
      if (snapshot === null) return;
      ctx.state = options.type.restoreState ? await options.type.restoreState(ctx, snapshot) : (snapshot as TState);
      options.metrics.record("persistence.load_room", 1, { roomType: options.type.name });
    } catch (error) {
      options.metrics.record("persistence.load_room_error", 1, { roomType: options.type.name });
      throw error;
    } finally {
      activeOperationTokens.delete(initializationToken);
    }
  });
  void initialization.catch(() => undefined);

  function isReentrantOperation() {
    const token = operationContext.getStore();
    return token !== undefined && activeOperationTokens.has(token);
  }

  function reentrantOperationError() {
    return new Error(`reentrant operation on room ${options.id} is not allowed`);
  }

  function enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
    if (isReentrantOperation()) return Promise.reject(reentrantOperationError());
    const execute = () => {
      const operationToken = {};
      activeOperationTokens.add(operationToken);
      return operationContext.run(operationToken, async () => {
        try {
          return await operation();
        } finally {
          activeOperationTokens.delete(operationToken);
        }
      });
    };
    const result = operationQueue.then(execute, execute);
    operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  function assertSynchronousAccess(operation: string) {
    if (activeOperationTokens.size > 0 && !isReentrantOperation()) {
      throw new Error(`${operation} cannot run while room ${options.id} has an active operation`);
    }
  }

  function assertCapacity(capacity: number | undefined) {
    if (capacity !== undefined && (!Number.isSafeInteger(capacity) || capacity < 0)) {
      throw new RangeError("room capacity must be a non-negative safe integer");
    }
  }

  async function persistNow() {
    if (!options.persistence) return true;
    try {
      await options.persistence.saveRoom(options.id, ctx.state);
      lastPersistAt = options.now();
      return true;
    } catch {
      options.metrics.record("persistence.save_room_error", 1, { roomType: options.type.name });
      return false;
    }
  }

  async function persistIfNeeded(now: number) {
    const interval = options.type.persistRoomIntervalMs;
    if (!interval || !options.persistence) return;
    if (now - lastPersistAt < interval) return;
    await persistNow();
  }

  function snapshotForPlayer(playerId: string) {
    const player = ctx.players.get(playerId);
    if (player && options.type.getSnapshot) return options.type.getSnapshot(ctx, player);
    return ctx.state;
  }

  async function finalizeDisposal(reason: string) {
    let initializationError: unknown;
    try {
      await initialization;
    } catch (error) {
      initializationError = error;
    }

    let disposalError: unknown;
    try {
      if (initializationError === undefined && !(await persistNow())) {
        disposalError = new Error(`final persistence failed for room ${options.id}`);
      }
      await options.type.onDispose?.(ctx, reason);
    } catch (error) {
      disposalError = disposalError === undefined ? error : new AggregateError([disposalError, error], `room ${options.id} persistence and disposal failed`);
    } finally {
      events.length = 0;
    }

    if (initializationError !== undefined && disposalError !== undefined) {
      throw new AggregateError([initializationError, disposalError], `room ${options.id} initialization and disposal failed`);
    }
    if (initializationError !== undefined) throw initializationError;
    if (disposalError !== undefined) throw disposalError;
  }

  return {
    id: options.id,
    type: options.type,
    ctx,
    ready() {
      return initialization;
    },
    runExclusive(operation) {
      if (disposed) return Promise.reject(new Error(`room ${options.id} is disposed`));
      return enqueueOperation(async () => {
        await initialization;
        if (disposed) throw new Error(`room ${options.id} is disposed`);
        return operation();
      });
    },
    join(player, request, maxPlayers) {
      if (disposed) return Promise.resolve({ ok: false, reason: "room disposed" });
      return enqueueOperation(async (): Promise<JoinDecision> => {
        await initialization;
        if (disposed) return { ok: false, reason: "room disposed" };
        if (ctx.players.has(player.id)) return { ok: false, reason: "player already joined" };
        const capacity = maxPlayers ?? options.type.maxPlayers;
        assertCapacity(capacity);
        if (capacity !== undefined && ctx.players.size >= capacity) return { ok: false, reason: "room full" };
        const decision = normalizeJoinDecision(await options.type.canJoin?.(ctx, request));
        if (!joinAllowed(decision)) return decision;
        ctx.players.set(player.id, player);
        try {
          await options.type.onJoin?.(ctx, player, request);
        } catch (error) {
          ctx.players.delete(player.id);
          if (ctx.players.size === 0) lastEmptyAt = options.now();
          try {
            await options.type.onLeave?.(ctx, player, "join-failed");
          } catch {
            options.metrics.record("room.join_rollback_error", 1, { roomType: options.type.name });
          }
          options.metrics.record("room.join_error", 1, { roomType: options.type.name });
          throw error;
        }
        options.metrics.record("room.join", 1, { roomType: options.type.name });
        return true;
      });
    },
    leave(playerId, reason = "leave") {
      if (disposed) return Promise.resolve(false);
      return enqueueOperation(async () => {
        await initialization;
        const player = ctx.players.get(playerId);
        if (!player) return false;
        ctx.players.delete(playerId);
        let leaveError: unknown;
        try {
          await options.type.onLeave?.(ctx, player, reason);
        } catch (error) {
          leaveError = error;
        }
        if (options.persistence) {
          try {
            const { connection: _connection, ...playerRecord } = player;
            await options.persistence.savePlayer(player.userId, player.data ?? playerRecord);
          } catch {
            options.metrics.record("persistence.save_player_error", 1, { roomType: options.type.name });
          }
        }
        if (ctx.players.size === 0) lastEmptyAt = options.now();
        options.metrics.record("room.leave", 1, { roomType: options.type.name });
        if (leaveError !== undefined) throw leaveError;
        return true;
      });
    },
    input(playerId, input) {
      if (disposed) return Promise.resolve(false);
      return enqueueOperation(async () => {
        await initialization;
        const player = ctx.players.get(playerId);
        if (!player) return false;
        player.lastInputAt = options.now();
        await options.type.onInput?.(ctx, player, input);
        options.metrics.record("room.input", 1, { roomType: options.type.name });
        return true;
      });
    },
    event(playerId, event) {
      if (disposed) return Promise.resolve(false);
      return enqueueOperation(async () => {
        await initialization;
        const player = ctx.players.get(playerId);
        if (!player) return false;
        await options.type.onEvent?.(ctx, player, event);
        options.metrics.record("room.event", 1, { roomType: options.type.name });
        return true;
      });
    },
    update(dt) {
      if (disposed) return Promise.resolve();
      return enqueueOperation(async () => {
        await initialization;
        if (!Number.isFinite(dt) || dt < 0) throw new RangeError("room update dt must be a non-negative finite number");
        const start = options.now();
        await options.type.update?.(ctx, dt);
        updates += 1;
        lastUpdateMs = Math.max(0, options.now() - start);
        options.metrics.record("room.update_ms", lastUpdateMs, { roomType: options.type.name });
        await persistIfNeeded(options.now());
      });
    },
    drainBroadcasts() {
      assertSynchronousAccess("drainBroadcasts");
      return events.splice(0, events.length);
    },
    persist() {
      if (isReentrantOperation()) return Promise.reject(reentrantOperationError());
      if (disposePromise) return disposePromise.then(() => false, () => false);
      if (disposed) return Promise.resolve(false);
      return enqueueOperation(async () => {
        await initialization;
        return persistNow();
      });
    },
    dispose(reason = "dispose") {
      if (isReentrantOperation()) return Promise.reject(reentrantOperationError());
      if (disposePromise) return disposePromise;
      disposed = true;
      disposePromise = enqueueOperation(() => finalizeDisposal(reason));
      return disposePromise;
    },
    disposeIfIdle(now, reason = "idle") {
      if (isReentrantOperation()) return Promise.reject(reentrantOperationError());
      if (!Number.isFinite(now)) return Promise.reject(new RangeError("room idle check time must be finite"));
      if (disposePromise) return disposePromise.then(() => true);
      if (disposed) return Promise.resolve(true);
      if (idleDisposePromise) return idleDisposePromise;

      let attempt!: Promise<boolean>;
      attempt = enqueueOperation(async () => {
        if (disposed) return true;
        if (ctx.players.size !== 0 || now - lastEmptyAt < (options.type.idleDisposeMs ?? 30000)) return false;
        disposed = true;
        disposePromise = attempt.then(() => undefined);
        await finalizeDisposal(reason);
        return true;
      });
      idleDisposePromise = attempt;
      const clearAttempt = () => {
        if (idleDisposePromise === attempt) idleDisposePromise = undefined;
      };
      void attempt.then(clearAttempt, clearAttempt);
      return attempt;
    },
    shouldDispose(now) {
      return !disposed && ctx.players.size === 0 && now - lastEmptyAt >= (options.type.idleDisposeMs ?? 30000);
    },
    snapshotFor(playerId) {
      assertSynchronousAccess("snapshotFor");
      return snapshotForPlayer(playerId);
    },
    replicationFor(playerId, request) {
      assertSynchronousAccess("replicationFor");
      const player = ctx.players.get(playerId);
      if (player && options.type.getReplication) return options.type.getReplication(ctx, player, request);
      return snapshotForPlayer(playerId);
    },
    replicationSent(playerId, receipt) {
      assertSynchronousAccess("replicationSent");
      const player = ctx.players.get(playerId);
      if (player) options.type.onReplicationSent?.(ctx, player, receipt);
    },
    replicationAck(playerId, sequence) {
      assertSynchronousAccess("replicationAck");
      const player = ctx.players.get(playerId);
      if (player) options.type.onReplicationAck?.(ctx, player, sequence);
    },
    replicationTelemetry(telemetry) {
      assertSynchronousAccess("replicationTelemetry");
      options.type.onReplicationTelemetry?.(ctx, telemetry);
    },
    getTelemetry() {
      if (activeOperationTokens.size > 0 && !isReentrantOperation()) return cachedTelemetry;
      cachedTelemetry = options.type.getRoomTelemetry?.(ctx);
      return cachedTelemetry;
    },
    getStats() {
      return { id: options.id, type: options.type.name, players: ctx.players.size, updates, lastUpdateMs };
    }
  };
}
