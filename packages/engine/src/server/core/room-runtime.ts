import { AsyncLocalStorage } from "node:async_hooks";
import { createCoalescedSaveLane, type CoalescedSaveLane } from "./coalesced-save.ts";
import type { AuthoritativeRoom } from "./room.ts";
import type {
  AuthoritativePlayer,
  JoinDecision,
  MetricsSink,
  PersistenceAdapter,
  RoomBroadcast,
  RoomContext,
  RoomReplicationRequest,
  RoomTelemetry,
  RoomType
} from "./types.ts";

type RoomOptions<TState, TInput, TEvent, TSnapshot = TState> = {
  id: string;
  type: RoomType<TState, TInput, TEvent, TSnapshot>;
  now: () => number;
  metrics: MetricsSink;
  persistence?: PersistenceAdapter;
};

type RoomRuntimeCore<TState, TInput, TEvent, TSnapshot = TState> = {
  options: RoomOptions<TState, TInput, TEvent, TSnapshot>;
  ctx: RoomContext<TState, TInput, TEvent>;
  events: RoomBroadcast<TEvent>[];
  lastEmptyAt: number;
  updates: number;
  lastUpdateMs: number;
  lastPersistAt: number;
  disposed: boolean;
  disposePromise?: Promise<void>;
  idleDisposePromise?: Promise<boolean>;
  operationQueue: Promise<void>;
  cachedTelemetry?: RoomTelemetry;
  operationContext: AsyncLocalStorage<object>;
  activeOperationTokens: Set<object>;
  saveLane?: CoalescedSaveLane<TState>;
};

type RoomRuntime<TState, TInput, TEvent, TSnapshot = TState> = RoomRuntimeCore<TState, TInput, TEvent, TSnapshot> & {
  initialization: Promise<void>;
};

export function createAuthoritativeRoomRuntime<TState, TInput = unknown, TEvent = unknown, TSnapshot = TState>(
  options: RoomOptions<TState, TInput, TEvent, TSnapshot>
): AuthoritativeRoom<TState, TInput, TEvent, TSnapshot> {
  validateRoomOptions(options);
  const runtime = createRoomRuntime(options);
  return {
    id: options.id,
    type: options.type,
    ctx: runtime.ctx,
    ...createPlayerOperations(runtime),
    ...createLifecycleOperations(runtime),
    ...createReplicationOperations(runtime)
  };
}

function validateRoomOptions<TState, TInput, TEvent, TSnapshot>(options: RoomOptions<TState, TInput, TEvent, TSnapshot>) {
  if (typeof options.id !== "string" || options.id.trim().length === 0) {
    throw new Error("room id must be a non-empty string");
  }
  if (typeof options.type.name !== "string" || options.type.name.trim().length === 0) {
    throw new Error("room type name must be a non-empty string");
  }
  if (
    options.type.maxPlayers !== undefined &&
    (!Number.isSafeInteger(options.type.maxPlayers) || options.type.maxPlayers < 0)
  ) {
    throw new RangeError("room maxPlayers must be a non-negative safe integer");
  }
  if (
    options.type.idleDisposeMs !== undefined &&
    (!Number.isFinite(options.type.idleDisposeMs) || options.type.idleDisposeMs < 0)
  ) {
    throw new RangeError("room idleDisposeMs must be a non-negative finite number");
  }
  if (
    options.type.persistRoomIntervalMs !== undefined &&
    (!Number.isFinite(options.type.persistRoomIntervalMs) || options.type.persistRoomIntervalMs < 0)
  ) {
    throw new RangeError("room persistRoomIntervalMs must be a non-negative finite number");
  }
}

function createRoomRuntime<TState, TInput, TEvent, TSnapshot>(
  options: RoomOptions<TState, TInput, TEvent, TSnapshot>
): RoomRuntime<TState, TInput, TEvent, TSnapshot> {
  const now = options.now();
  const events: RoomBroadcast<TEvent>[] = [];
  const ctx = createRoomContext(options, events);
  const core: RoomRuntimeCore<TState, TInput, TEvent, TSnapshot> = {
    options,
    ctx,
    events,
    lastEmptyAt: now,
    updates: 0,
    lastUpdateMs: 0,
    lastPersistAt: now,
    disposed: false,
    operationQueue: Promise.resolve(),
    operationContext: new AsyncLocalStorage<object>(),
    activeOperationTokens: new Set(),
    saveLane: createSaveLane(options)
  };
  const initialization = initializeRoom(core);
  void initialization.catch(() => undefined);
  return Object.assign(core, { initialization });
}

function createRoomContext<TState, TInput, TEvent, TSnapshot>(
  options: RoomOptions<TState, TInput, TEvent, TSnapshot>,
  events: RoomBroadcast<TEvent>[]
): RoomContext<TState, TInput, TEvent> {
  const players = new Map<string, AuthoritativePlayer>();
  return {
    roomId: options.id,
    roomType: options.type.name,
    state: options.type.createState({ roomId: options.id, roomType: options.type.name, now: options.now }),
    players,
    now: options.now,
    broadcast(event, broadcastOptions) {
      const durability = broadcastOptions?.durability ?? "transient";
      const requested = broadcastOptions?.recipients;
      if (requested !== undefined && (!Array.isArray(requested) || requested.length > 256)) throw new Error('Invalid room event recipients.');
      const captured = requested === undefined ? undefined : Array.from(requested);
      if (captured && (new Set(captured).size !== captured.length || captured.some(id => typeof id !== 'string' || !id.trim() || new TextEncoder().encode(id).length > 128))) throw new Error('Invalid room event recipients.');
      const recipients = captured?.filter(id => players.has(id));
      if (durability === "durable" && !options.persistence?.appendEvent && !options.persistence?.appendEvents) {
        throw new Error(`room ${options.id} cannot broadcast a durable event without event persistence`);
      }
      events.push({ event, durability, ...(recipients === undefined ? {} : { recipients, recipientConnections: new Map(recipients.map(id => [id, players.get(id)?.connection])) }) });
    },
    metrics: options.metrics,
    persistence: options.persistence
  };
}

function createSaveLane<TState, TInput, TEvent, TSnapshot>(options: RoomOptions<TState, TInput, TEvent, TSnapshot>) {
  const persistence = options.persistence;
  if (!persistence) {
    return undefined;
  }
  return createCoalescedSaveLane<TState>({
    save: (snapshot) => persistence.saveRoom(options.id, snapshot),
    onError: () => options.metrics.record("persistence.save_room_error", 1, { roomType: options.type.name })
  });
}

async function initializeRoom<TState, TInput, TEvent, TSnapshot>(runtime: RoomRuntimeCore<TState, TInput, TEvent, TSnapshot>) {
  const token = {};
  runtime.activeOperationTokens.add(token);
  return runtime.operationContext.run(token, async () => {
    try {
      const persistence = runtime.options.persistence;
      if (!persistence) return;
      const snapshot = await persistence.loadRoom(runtime.options.id);
      if (snapshot === null) return;
      runtime.ctx.state = await restorePersistedState(runtime, snapshot);
      runtime.options.metrics.record("persistence.load_room", 1, { roomType: runtime.options.type.name });
    } catch (error) {
      runtime.options.metrics.record("persistence.load_room_error", 1, { roomType: runtime.options.type.name });
      throw error;
    } finally {
      runtime.activeOperationTokens.delete(token);
    }
  });
}

async function restorePersistedState<TState, TInput, TEvent, TSnapshot>(
  runtime: RoomRuntimeCore<TState, TInput, TEvent, TSnapshot>,
  snapshot: unknown
): Promise<TState> {
  if (runtime.options.type.restoreState) {
    return runtime.options.type.restoreState(runtime.ctx, snapshot);
  }
  if (!hasCompatibleStateKind(snapshot, runtime.ctx.state)) {
    throw new Error(`room ${runtime.options.id} loaded an incompatible persisted state`);
  }
  return snapshot;
}

function hasCompatibleStateKind<TState>(value: unknown, template: TState): value is TState {
  if (template === null) return value === null;
  if (Array.isArray(template)) return Array.isArray(value);
  if (typeof template === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
  return typeof value === typeof template;
}

function createPlayerOperations<TState, TInput, TEvent, TSnapshot>(runtime: RoomRuntime<TState, TInput, TEvent, TSnapshot>) {
  return {
    ready() {
      return runtime.initialization;
    },
    runExclusive<TResult>(operation: () => TResult | Promise<TResult>) {
      if (runtime.disposed) return Promise.reject(new Error(`room ${runtime.options.id} is disposed`));
      return enqueueOperation(runtime, async () => {
        await runtime.initialization;
        if (runtime.disposed) throw new Error(`room ${runtime.options.id} is disposed`);
        return operation();
      });
    },
    join(player: AuthoritativePlayer, request?: unknown, maxPlayers?: number) {
      return joinRoom(runtime, player, request, maxPlayers);
    },
    leave(playerId: string, reason = "leave") {
      return leaveRoom(runtime, playerId, reason);
    },
    input(playerId: string, input: TInput) {
      return handlePlayerInput(runtime, playerId, input);
    },
    event(playerId: string, event: TEvent) {
      return handlePlayerEvent(runtime, playerId, event);
    },
    update(dt: number) {
      return updateRoom(runtime, dt);
    }
  };
}

function joinRoom<TState, TInput, TEvent, TSnapshot>(
  runtime: RoomRuntime<TState, TInput, TEvent, TSnapshot>,
  player: AuthoritativePlayer,
  request?: unknown,
  maxPlayers?: number
) {
  if (runtime.disposed) return Promise.resolve<JoinDecision>({ ok: false, reason: "room disposed" });
  return enqueueOperation(runtime, async (): Promise<JoinDecision> => {
    await runtime.initialization;
    if (runtime.disposed) return { ok: false, reason: "room disposed" };
    if (runtime.ctx.players.has(player.id)) return { ok: false, reason: "player already joined" };
    const capacity = maxPlayers ?? runtime.options.type.maxPlayers;
    assertCapacity(capacity);
    if (capacity !== undefined && runtime.ctx.players.size >= capacity) return { ok: false, reason: "room full" };
    const decision = (await runtime.options.type.canJoin?.(runtime.ctx, request)) ?? { ok: true };
    if (!decision.ok) return decision;
    runtime.ctx.players.set(player.id, player);
    try {
      await runtime.options.type.onJoin?.(runtime.ctx, player, request);
    } catch (error) {
      await rollbackFailedJoin(runtime, player);
      throw error;
    }
    runtime.options.metrics.record("room.join", 1, { roomType: runtime.options.type.name });
    return { ok: true };
  });
}

async function rollbackFailedJoin<TState, TInput, TEvent, TSnapshot>(
  runtime: RoomRuntime<TState, TInput, TEvent, TSnapshot>,
  player: AuthoritativePlayer
) {
  runtime.ctx.players.delete(player.id);
  if (runtime.ctx.players.size === 0) runtime.lastEmptyAt = runtime.options.now();
  try {
    await runtime.options.type.onLeave?.(runtime.ctx, player, "join-failed");
  } catch {
    runtime.options.metrics.record("room.join_rollback_error", 1, { roomType: runtime.options.type.name });
  }
  runtime.options.metrics.record("room.join_error", 1, { roomType: runtime.options.type.name });
}

function leaveRoom<TState, TInput, TEvent, TSnapshot>(
  runtime: RoomRuntime<TState, TInput, TEvent, TSnapshot>,
  playerId: string,
  reason: string
) {
  if (runtime.disposed) return Promise.resolve(false);
  return enqueueOperation(runtime, async () => {
    await runtime.initialization;
    const player = runtime.ctx.players.get(playerId);
    if (!player) return false;
    runtime.ctx.players.delete(playerId);
    let leaveError: unknown;
    try {
      await runtime.options.type.onLeave?.(runtime.ctx, player, reason);
    } catch (error) {
      leaveError = error;
    }
    await persistLeavingPlayer(runtime, player);
    if (runtime.ctx.players.size === 0) runtime.lastEmptyAt = runtime.options.now();
    runtime.options.metrics.record("room.leave", 1, { roomType: runtime.options.type.name });
    if (leaveError !== undefined) throw leaveError;
    return true;
  });
}

async function persistLeavingPlayer<TState, TInput, TEvent, TSnapshot>(
  runtime: RoomRuntime<TState, TInput, TEvent, TSnapshot>,
  player: AuthoritativePlayer
) {
  const persistence = runtime.options.persistence;
  if (!persistence) return;
  try {
    const { connection: _connection, ...playerRecord } = player;
    await persistence.savePlayer(player.userId, player.data ?? playerRecord);
  } catch {
    runtime.options.metrics.record("persistence.save_player_error", 1, { roomType: runtime.options.type.name });
  }
}

function handlePlayerInput<TState, TInput, TEvent, TSnapshot>(
  runtime: RoomRuntime<TState, TInput, TEvent, TSnapshot>,
  playerId: string,
  input: TInput
) {
  if (runtime.disposed) return Promise.resolve(false);
  return enqueueOperation(runtime, async () => {
    await runtime.initialization;
    const player = runtime.ctx.players.get(playerId);
    if (!player) return false;
    player.lastInputAt = runtime.options.now();
    await runtime.options.type.onInput?.(runtime.ctx, player, input);
    runtime.options.metrics.record("room.input", 1, { roomType: runtime.options.type.name });
    return true;
  });
}

function handlePlayerEvent<TState, TInput, TEvent, TSnapshot>(
  runtime: RoomRuntime<TState, TInput, TEvent, TSnapshot>,
  playerId: string,
  event: TEvent
) {
  if (runtime.disposed) return Promise.resolve(false);
  return enqueueOperation(runtime, async () => {
    await runtime.initialization;
    const player = runtime.ctx.players.get(playerId);
    if (!player) return false;
    await runtime.options.type.onEvent?.(runtime.ctx, player, event);
    runtime.options.metrics.record("room.event", 1, { roomType: runtime.options.type.name });
    return true;
  });
}

function updateRoom<TState, TInput, TEvent, TSnapshot>(runtime: RoomRuntime<TState, TInput, TEvent, TSnapshot>, dt: number) {
  if (runtime.disposed) return Promise.resolve();
  return enqueueOperation(runtime, async () => {
    await runtime.initialization;
    if (!Number.isFinite(dt) || dt < 0) {
      throw new RangeError("room update dt must be a non-negative finite number");
    }
    const start = runtime.options.now();
    await runtime.options.type.update?.(runtime.ctx, dt);
    runtime.updates += 1;
    runtime.lastUpdateMs = Math.max(0, runtime.options.now() - start);
    runtime.options.metrics.record("room.update_ms", runtime.lastUpdateMs, { roomType: runtime.options.type.name });
    persistIfNeeded(runtime, runtime.options.now());
  });
}

function createLifecycleOperations<TState, TInput, TEvent, TSnapshot>(runtime: RoomRuntime<TState, TInput, TEvent, TSnapshot>) {
  return {
    drainBroadcasts() {
      assertSynchronousAccess(runtime, "drainBroadcasts");
      return runtime.events.splice(0, runtime.events.length);
    },
    persist() {
      if (isReentrantOperation(runtime)) return Promise.reject(reentrantOperationError(runtime));
      if (runtime.disposePromise) return runtime.disposePromise.then(() => false, () => false);
      if (runtime.disposed) return Promise.resolve(false);
      return enqueueOperation(runtime, async () => {
        await runtime.initialization;
        return persistNow(runtime);
      });
    },
    dispose(reason = "dispose") {
      if (isReentrantOperation(runtime)) return Promise.reject(reentrantOperationError(runtime));
      if (runtime.disposePromise) return runtime.disposePromise;
      runtime.disposed = true;
      runtime.disposePromise = enqueueOperation(runtime, () => finalizeDisposal(runtime, reason));
      return runtime.disposePromise;
    },
    disposeIfIdle(now: number, reason = "idle") {
      return disposeRoomIfIdle(runtime, now, reason);
    },
    shouldDispose(now: number) {
      return (
        !runtime.disposed &&
        runtime.ctx.players.size === 0 &&
        now - runtime.lastEmptyAt >= (runtime.options.type.idleDisposeMs ?? 30000)
      );
    }
  };
}

function disposeRoomIfIdle<TState, TInput, TEvent, TSnapshot>(
  runtime: RoomRuntime<TState, TInput, TEvent, TSnapshot>,
  now: number,
  reason: string
) {
  if (isReentrantOperation(runtime)) return Promise.reject(reentrantOperationError(runtime));
  if (!Number.isFinite(now)) return Promise.reject(new RangeError("room idle check time must be finite"));
  if (runtime.disposePromise) return runtime.disposePromise.then(() => true);
  if (runtime.disposed) return Promise.resolve(true);
  if (runtime.idleDisposePromise) return runtime.idleDisposePromise;

  const attempt = enqueueOperation(runtime, async () => {
    if (runtime.disposed) return true;
    if (
      runtime.ctx.players.size !== 0 ||
      now - runtime.lastEmptyAt < (runtime.options.type.idleDisposeMs ?? 30000)
    ) {
      return false;
    }
    runtime.disposed = true;
    const activeAttempt = runtime.idleDisposePromise;
    if (!activeAttempt) throw new Error(`room ${runtime.options.id} lost its idle disposal operation`);
    runtime.disposePromise = activeAttempt.then(() => undefined);
    await finalizeDisposal(runtime, reason);
    return true;
  });
  runtime.idleDisposePromise = attempt;
  const clearAttempt = () => {
    if (runtime.idleDisposePromise === attempt) runtime.idleDisposePromise = undefined;
  };
  void attempt.then(clearAttempt, clearAttempt);
  return attempt;
}

function createReplicationOperations<TState, TInput, TEvent, TSnapshot>(runtime: RoomRuntime<TState, TInput, TEvent, TSnapshot>) {
  return {
    snapshotFor(playerId: string) {
      assertSynchronousAccess(runtime, "snapshotFor");
      return snapshotForPlayer(runtime, playerId);
    },
    replicationFor(playerId: string, request: RoomReplicationRequest<TSnapshot>) {
      assertSynchronousAccess(runtime, "replicationFor");
      const player = runtime.ctx.players.get(playerId);
      return player && runtime.options.type.getReplication
        ? runtime.options.type.getReplication(runtime.ctx, player, request)
        : snapshotForPlayer(runtime, playerId);
    },
    replicationSent(playerId: string, receipt: Parameters<AuthoritativeRoom<TState, TInput, TEvent, TSnapshot>["replicationSent"]>[1]) {
      assertSynchronousAccess(runtime, "replicationSent");
      const player = runtime.ctx.players.get(playerId);
      if (player) runtime.options.type.onReplicationSent?.(runtime.ctx, player, receipt);
    },
    replicationAck(playerId: string, sequence: number) {
      assertSynchronousAccess(runtime, "replicationAck");
      const player = runtime.ctx.players.get(playerId);
      if (player) runtime.options.type.onReplicationAck?.(runtime.ctx, player, sequence);
    },
    replicationTelemetry(telemetry: Parameters<AuthoritativeRoom<TState, TInput, TEvent, TSnapshot>["replicationTelemetry"]>[0]) {
      assertSynchronousAccess(runtime, "replicationTelemetry");
      runtime.options.type.onReplicationTelemetry?.(runtime.ctx, telemetry);
    },
    getTelemetry() {
      if (runtime.activeOperationTokens.size > 0 && !isReentrantOperation(runtime)) return runtime.cachedTelemetry;
      runtime.cachedTelemetry = runtime.options.type.getRoomTelemetry?.(runtime.ctx);
      return runtime.cachedTelemetry;
    },
    getStats() {
      return {
        id: runtime.options.id,
        type: runtime.options.type.name,
        players: runtime.ctx.players.size,
        updates: runtime.updates,
        lastUpdateMs: runtime.lastUpdateMs
      };
    }
  };
}

function enqueueOperation<TState, TInput, TEvent, TSnapshot, TResult>(
  runtime: RoomRuntime<TState, TInput, TEvent, TSnapshot>,
  operation: () => Promise<TResult>
): Promise<TResult> {
  if (isReentrantOperation(runtime)) return Promise.reject(reentrantOperationError(runtime));
  const execute = () => {
    const token = {};
    runtime.activeOperationTokens.add(token);
    return runtime.operationContext.run(token, async () => {
      try {
        return await operation();
      } finally {
        runtime.activeOperationTokens.delete(token);
      }
    });
  };
  const result = runtime.operationQueue.then(execute, execute);
  runtime.operationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function isReentrantOperation<TState, TInput, TEvent, TSnapshot>(runtime: RoomRuntimeCore<TState, TInput, TEvent, TSnapshot>) {
  const token = runtime.operationContext.getStore();
  return token !== undefined && runtime.activeOperationTokens.has(token);
}

function reentrantOperationError<TState, TInput, TEvent, TSnapshot>(runtime: RoomRuntimeCore<TState, TInput, TEvent, TSnapshot>) {
  return new Error(`reentrant operation on room ${runtime.options.id} is not allowed`);
}

function assertSynchronousAccess<TState, TInput, TEvent, TSnapshot>(
  runtime: RoomRuntimeCore<TState, TInput, TEvent, TSnapshot>,
  operation: string
) {
  if (runtime.activeOperationTokens.size > 0 && !isReentrantOperation(runtime)) {
    throw new Error(`${operation} cannot run while room ${runtime.options.id} has an active operation`);
  }
}

function assertCapacity(capacity: number | undefined) {
  if (capacity !== undefined && (!Number.isSafeInteger(capacity) || capacity < 0)) {
    throw new RangeError("room capacity must be a non-negative safe integer");
  }
}

async function persistNow<TState, TInput, TEvent, TSnapshot>(runtime: RoomRuntimeCore<TState, TInput, TEvent, TSnapshot>) {
  if (!runtime.saveLane) return true;
  try {
    runtime.saveLane.enqueue(structuredClone(runtime.ctx.state));
    const succeeded = await runtime.saveLane.flush();
    if (succeeded) runtime.lastPersistAt = runtime.options.now();
    return succeeded;
  } catch {
    runtime.options.metrics.record("persistence.save_room_error", 1, { roomType: runtime.options.type.name });
    return false;
  }
}

function persistIfNeeded<TState, TInput, TEvent, TSnapshot>(runtime: RoomRuntimeCore<TState, TInput, TEvent, TSnapshot>, now: number) {
  const interval = runtime.options.type.persistRoomIntervalMs;
  if (!interval || !runtime.saveLane || now - runtime.lastPersistAt < interval) return;
  try {
    runtime.saveLane.enqueue(structuredClone(runtime.ctx.state));
    runtime.lastPersistAt = now;
  } catch {
    runtime.options.metrics.record("persistence.save_room_error", 1, { roomType: runtime.options.type.name });
  }
}

function snapshotForPlayer<TState, TInput, TEvent, TSnapshot>(
  runtime: RoomRuntimeCore<TState, TInput, TEvent, TSnapshot>,
  playerId: string
) {
  const player = runtime.ctx.players.get(playerId);
  if (!player) throw new Error(`player ${playerId} is not in room ${runtime.options.id}`);
  return runtime.options.type.getSnapshot(runtime.ctx, player);
}

async function finalizeDisposal<TState, TInput, TEvent, TSnapshot>(
  runtime: RoomRuntime<TState, TInput, TEvent, TSnapshot>,
  reason: string
) {
  let initializationError: unknown;
  try {
    await runtime.initialization;
  } catch (error) {
    initializationError = error;
  }

  let disposalError: unknown;
  try {
    if (initializationError === undefined && !(await persistNow(runtime))) {
      disposalError = new Error(`final persistence failed for room ${runtime.options.id}`);
    }
    await runtime.options.type.onDispose?.(runtime.ctx, reason);
  } catch (error) {
    disposalError =
      disposalError === undefined
        ? error
        : new AggregateError([disposalError, error], `room ${runtime.options.id} persistence and disposal failed`);
  } finally {
    runtime.events.length = 0;
  }

  if (initializationError !== undefined && disposalError !== undefined) {
    throw new AggregateError(
      [initializationError, disposalError],
      `room ${runtime.options.id} initialization and disposal failed`
    );
  }
  if (initializationError !== undefined) throw initializationError;
  if (disposalError !== undefined) throw disposalError;
}
