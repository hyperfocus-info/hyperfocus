import { isRecord } from "@hyperfocus/utilities/records";
import { defineSchema, type ReplicationSchema } from "../protocol/schema.ts";
import { createRoomType } from "../server/core/room-type.ts";
import type { AuthoritativePlayer, JoinDecision, RoomContext, RoomType } from "../server/core/types.ts";
import { createMmoEntityRegistry, type MmoEntityRegistry, type MmoEntityRegistryConfig } from "./entity-registry.ts";
import { createMmoInterestSnapshotter, type MmoInterestSnapshotter, type MmoInterestSnapshotterConfig } from "./interest.ts";
import type { MmoPersistenceBridge } from "./persistence.ts";
import type { MmoEntityData, MmoEntityRecord, MmoReplicatedEntity, MmoInterestTarget } from "./types.ts";

export type MmoRoomState<
  TWorld = Record<string, never>,
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData
> = {
  tick: number;
  roomId: string;
  roomType: string;
  world: TWorld;
  visibleIds: string[];
  entities: Record<string, MmoReplicatedEntity<TPublic, TOwner>>;
};

export type MmoRoomRuntime<
  TWorld = Record<string, never>,
  TInput = unknown,
  TProfile = unknown,
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TPrivate extends MmoEntityData = MmoEntityData
> = {
  world: TWorld;
  registry: MmoEntityRegistry<TPublic, TOwner, TPrivate>;
  snapshotter: MmoInterestSnapshotter<TPublic, TOwner, TPrivate>;
  inputs: Map<string, TInput>;
  profiles: Map<string, TProfile | null>;
  playerEntityIds: Map<string, Set<string>>;
  pendingLeaves: Map<string, { player: AuthoritativePlayer; profile: TProfile | null }>;
  pendingLeaveFlush?: Promise<void>;
};

export type MmoRoomHookContext<
  TWorld,
  TInput,
  TProfile,
  TPublic extends MmoEntityData,
  TOwner extends MmoEntityData,
  TPrivate extends MmoEntityData,
  TEvent
> = {
  ctx: RoomContext<MmoRoomState<TWorld, TPublic, TOwner>, TInput, TEvent>;
  runtime: MmoRoomRuntime<TWorld, TInput, TProfile, TPublic, TOwner, TPrivate>;
};

export type MmoRoomTypeConfig<
  TWorld = Record<string, never>,
  TInput = unknown,
  TProfile = unknown,
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TPrivate extends MmoEntityData = MmoEntityData,
  TEvent = unknown
> = {
  name: string;
  schema?: ReplicationSchema<MmoRoomState<TWorld, TPublic, TOwner>>;
  maxPlayers?: number;
  idleDisposeMs?: number;
  persistRoomIntervalMs?: number;
  defaultInterestRadius?: number;
  world?: TWorld | ((ctx: Pick<RoomContext<MmoRoomState<TWorld, TPublic, TOwner>, TInput, TEvent>, "roomId" | "roomType" | "now">) => TWorld);
  registry?: MmoEntityRegistryConfig<TPublic, TOwner, TPrivate> | ((ctx: RoomContext<MmoRoomState<TWorld, TPublic, TOwner>, TInput, TEvent>) => MmoEntityRegistry<TPublic, TOwner, TPrivate>);
  snapshotter?:
    | Omit<MmoInterestSnapshotterConfig<TPublic, TOwner, TPrivate>, "registry">
    | ((runtime: MmoRoomRuntime<TWorld, TInput, TProfile, TPublic, TOwner, TPrivate>) => MmoInterestSnapshotter<TPublic, TOwner, TPrivate>);
  persistence?: MmoPersistenceBridge<TProfile, TPublic, TOwner, TPrivate, RoomContext<MmoRoomState<TWorld, TPublic, TOwner>, TInput, TEvent>>;
  createPlayerEntity?: (args: {
    player: AuthoritativePlayer;
    profile: TProfile | null;
    ctx: RoomContext<MmoRoomState<TWorld, TPublic, TOwner>, TInput, TEvent>;
    runtime: MmoRoomRuntime<TWorld, TInput, TProfile, TPublic, TOwner, TPrivate>;
  }) => MmoEntityRecord<TPublic, TOwner, TPrivate> | undefined;
  canJoin?: (args: MmoRoomHookContext<TWorld, TInput, TProfile, TPublic, TOwner, TPrivate, TEvent>, request: unknown) => JoinDecision | Promise<JoinDecision>;
  onJoin?: (args: MmoRoomHookContext<TWorld, TInput, TProfile, TPublic, TOwner, TPrivate, TEvent> & { player: AuthoritativePlayer }) => void | Promise<void>;
  onLeave?: (
    args: MmoRoomHookContext<TWorld, TInput, TProfile, TPublic, TOwner, TPrivate, TEvent> & { player: AuthoritativePlayer; reason: string }
  ) => void | Promise<void>;
  onInput?: (
    args: MmoRoomHookContext<TWorld, TInput, TProfile, TPublic, TOwner, TPrivate, TEvent> & { player: AuthoritativePlayer; input: TInput }
  ) => void | Promise<void>;
  update?: (args: MmoRoomHookContext<TWorld, TInput, TProfile, TPublic, TOwner, TPrivate, TEvent> & { dt: number }) => void | Promise<void>;
  onDispose?: (
    args: MmoRoomHookContext<TWorld, TInput, TProfile, TPublic, TOwner, TPrivate, TEvent> & { reason: string }
  ) => void | Promise<void>;
  getInterestTarget?: (
    args: MmoRoomHookContext<TWorld, TInput, TProfile, TPublic, TOwner, TPrivate, TEvent> & { player: AuthoritativePlayer }
  ) => Partial<MmoInterestTarget>;
};

export type GeneratedMmoRoomType<
  TWorld = Record<string, never>,
  TInput = unknown,
  TProfile = unknown,
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TPrivate extends MmoEntityData = MmoEntityData,
  TEvent = unknown
> = RoomType<MmoRoomState<TWorld, TPublic, TOwner>, TInput, TEvent> & {
  getRuntime(roomId: string): MmoRoomRuntime<TWorld, TInput, TProfile, TPublic, TOwner, TPrivate> | undefined;
  clearRuntime(roomId: string): boolean;
};

const defaultRoomSchema = defineSchema<MmoRoomState<unknown, MmoEntityData, MmoEntityData>>({
  tick: "u32",
  roomId: "string:64",
  roomType: "string:64",
  world: { type: "json", maxLength: 65535 },
  visibleIds: { type: "array", item: "string:64", maxLength: 2048 },
  entities: {
    type: "map",
    key: "string",
    maxEntries: 2048,
    value: {
      type: "entity",
      fields: {
        id: "string:64",
        type: "string:64",
        x: "f32",
        y: "f32",
        zoneId: "string:64",
        ownerId: "string:64",
        visibility: "string:16",
        radius: "f32",
        priority: "f32",
        global: "bool",
        tags: { type: "array", item: "string:64", maxLength: 64 },
        revision: "f64",
        publicData: { type: "json", maxLength: 8192, optional: true },
        ownerData: { type: "json", maxLength: 8192, optional: true }
      }
    }
  }
});

function isDefaultRoomSchema<TState>(schema: ReplicationSchema): schema is ReplicationSchema<TState> {
  return schema === defaultRoomSchema;
}

function createDefaultRoomSchema<TState>(): ReplicationSchema<TState> {
  if (!isDefaultRoomSchema<TState>(defaultRoomSchema)) throw new Error("MMO room schema identity mismatch");
  return defaultRoomSchema;
}

function isWorldFactory<TWorld, TContext>(value: TWorld | ((ctx: TContext) => TWorld)): value is (ctx: TContext) => TWorld {
  return typeof value === "function";
}

function createWorld<TWorld, TInput, TEvent>(
  world: TWorld | ((ctx: Pick<RoomContext<MmoRoomState<TWorld>, TInput, TEvent>, "roomId" | "roomType" | "now">) => TWorld) | undefined,
  ctx: Pick<RoomContext<MmoRoomState<TWorld>, TInput, TEvent>, "roomId" | "roomType" | "now">
): TWorld {
  if (world !== undefined && isWorldFactory(world)) return world(ctx);
  if (world !== undefined) return world;
  return Object.create(null);
}

function defaultEntityTarget(entity: MmoEntityRecord | undefined, radius: number): Partial<MmoInterestTarget> {
  return entity ? { x: entity.x, y: entity.y, radius, zoneId: entity.zoneId } : { x: 0, y: 0, radius };
}

function normalizeInterestTarget(target: Partial<MmoInterestTarget>, fallbackRadius: number): MmoInterestTarget {
  return {
    x: Number.isFinite(target.x) ? Number(target.x) : 0,
    y: Number.isFinite(target.y) ? Number(target.y) : 0,
    radius: Number.isFinite(target.radius) && Number(target.radius) >= 0 ? Number(target.radius) : fallbackRadius,
    zoneId: target.zoneId
  };
}



function hasOptionalString(value: Record<string, unknown>, key: string) {
  return value[key] === undefined || typeof value[key] === "string";
}

function hasOptionalFiniteNumber(value: Record<string, unknown>, key: string) {
  return value[key] === undefined || (typeof value[key] === "number" && Number.isFinite(value[key]));
}

function isMmoReplicatedEntity<
  TPublic extends MmoEntityData,
  TOwner extends MmoEntityData
>(value: unknown): value is MmoReplicatedEntity<TPublic, TOwner> {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || typeof value.type !== "string") return false;
  if (typeof value.x !== "number" || !Number.isFinite(value.x) || typeof value.y !== "number" || !Number.isFinite(value.y)) return false;
  if (typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0) return false;
  if (value.visibility !== "public" && value.visibility !== "owner") return false;
  if (value.visibility === "owner" && typeof value.ownerId !== "string") return false;
  if (!hasOptionalString(value, "zoneId") || !hasOptionalString(value, "ownerId")) return false;
  if (!hasOptionalFiniteNumber(value, "radius") || !hasOptionalFiniteNumber(value, "priority")) return false;
  if (value.global !== undefined && typeof value.global !== "boolean") return false;
  if (value.tags !== undefined && (!Array.isArray(value.tags) || value.tags.some((tag) => typeof tag !== "string"))) return false;
  if (value.publicData !== undefined && !isRecord(value.publicData)) return false;
  return value.ownerData === undefined || isRecord(value.ownerData);
}

function copyRestoredEntities<
  TPublic extends MmoEntityData,
  TOwner extends MmoEntityData
>(value: unknown): Record<string, MmoReplicatedEntity<TPublic, TOwner>> {
  if (!isRecord(value)) throw new Error("MMO room snapshot entities must be an object");
  const entities: Record<string, MmoReplicatedEntity<TPublic, TOwner>> = Object.create(null);
  for (const [id, entity] of Object.entries(value)) {
    if (!isMmoReplicatedEntity<TPublic, TOwner>(entity) || entity.id !== id) {
      throw new Error(`MMO room snapshot entity ${id} is invalid`);
    }
    Object.defineProperty(entities, id, { value: entity, configurable: true, enumerable: true, writable: true });
  }
  return entities;
}

function isMmoRoomSnapshot<
  TWorld,
  TPublic extends MmoEntityData,
  TOwner extends MmoEntityData
>(value: unknown): value is Partial<MmoRoomState<TWorld, TPublic, TOwner>> {
  if (!isRecord(value)) return false;
  if (value.tick !== undefined && (typeof value.tick !== "number" || !Number.isInteger(value.tick) || value.tick < 0 || value.tick > 0xffffffff)) return false;
  if (value.roomId !== undefined && typeof value.roomId !== "string") return false;
  if (value.roomType !== undefined && typeof value.roomType !== "string") return false;
  if (value.visibleIds !== undefined && (!Array.isArray(value.visibleIds) || value.visibleIds.some((id) => typeof id !== "string"))) return false;
  if (value.entities !== undefined && !isRecord(value.entities)) return false;
  return true;
}

function firstValue<TValue>(values: Iterable<TValue>): TValue | undefined {
  for (const value of values) return value;
  return undefined;
}

function validateMmoRoomConfig(config: Pick<MmoRoomTypeConfig, "name" | "maxPlayers" | "idleDisposeMs" | "persistRoomIntervalMs">, defaultInterestRadius: number) {
  if (typeof config.name !== "string" || config.name.trim().length === 0) throw new Error("MMO room name must be a non-empty string");
  if (!Number.isFinite(defaultInterestRadius) || defaultInterestRadius < 0) throw new RangeError("MMO room defaultInterestRadius must be a non-negative finite number");
  if (config.maxPlayers !== undefined && (!Number.isSafeInteger(config.maxPlayers) || config.maxPlayers < 0)) {
    throw new RangeError("MMO room maxPlayers must be a non-negative safe integer");
  }
  if (config.idleDisposeMs !== undefined && (!Number.isFinite(config.idleDisposeMs) || config.idleDisposeMs < 0)) {
    throw new RangeError("MMO room idleDisposeMs must be a non-negative finite number");
  }
  if (config.persistRoomIntervalMs !== undefined && (!Number.isFinite(config.persistRoomIntervalMs) || config.persistRoomIntervalMs < 0)) {
    throw new RangeError("MMO room persistRoomIntervalMs must be a non-negative finite number");
  }
}

function cleanupPlayerRuntime<
  TWorld,
  TInput,
  TProfile,
  TPublic extends MmoEntityData,
  TOwner extends MmoEntityData,
  TPrivate extends MmoEntityData
>(runtime: MmoRoomRuntime<TWorld, TInput, TProfile, TPublic, TOwner, TPrivate>, playerId: string) {
  for (const entityId of runtime.playerEntityIds.get(playerId) ?? []) runtime.registry.remove(entityId);
  runtime.inputs.delete(playerId);
  runtime.profiles.delete(playerId);
  runtime.playerEntityIds.delete(playerId);
  runtime.snapshotter.clearViewer(playerId);
}

export function createMmoRoomType<
  TWorld = Record<string, never>,
  TInput = unknown,
  TProfile = unknown,
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData,
  TPrivate extends MmoEntityData = MmoEntityData,
  TEvent = unknown
>(
  config: MmoRoomTypeConfig<TWorld, TInput, TProfile, TPublic, TOwner, TPrivate, TEvent>
): GeneratedMmoRoomType<TWorld, TInput, TProfile, TPublic, TOwner, TPrivate, TEvent> {
  const runtimes = new Map<string, MmoRoomRuntime<TWorld, TInput, TProfile, TPublic, TOwner, TPrivate>>();
  const defaultInterestRadius = config.defaultInterestRadius ?? 512;
  validateMmoRoomConfig(config, defaultInterestRadius);

  function ensureRuntime(ctx: RoomContext<MmoRoomState<TWorld, TPublic, TOwner>, TInput, TEvent>) {
    let runtime = runtimes.get(ctx.roomId);
    if (runtime) return runtime;
    const registry = typeof config.registry === "function" ? config.registry(ctx) : createMmoEntityRegistry(config.registry);
    let snapshotter: MmoInterestSnapshotter<TPublic, TOwner, TPrivate> | undefined;
    runtime = {
      world: ctx.state.world,
      registry,
      inputs: new Map(),
      profiles: new Map(),
      playerEntityIds: new Map(),
      pendingLeaves: new Map(),
      get snapshotter() {
        if (!snapshotter) throw new Error(`MMO room ${ctx.roomId} snapshotter was accessed during initialization`);
        return snapshotter;
      }
    };
    snapshotter =
      typeof config.snapshotter === "function"
        ? config.snapshotter(runtime)
        : createMmoInterestSnapshotter({ registry, defaultRadius: defaultInterestRadius, ...(config.snapshotter ?? {}) });
    const restoredEntities = ctx.state.entities;
    if (restoredEntities && Object.keys(restoredEntities).length > 0) {
      const revision = Object.values(restoredEntities).reduce((highest, entity) => Math.max(highest, entity.revision ?? 0), 0);
      registry.applySnapshot({ revision, visibleIds: [...ctx.state.visibleIds], omittedIds: [], entities: restoredEntities });
    }
    runtimes.set(ctx.roomId, runtime);
    return runtime;
  }

  function syncState(ctx: RoomContext<MmoRoomState<TWorld, TPublic, TOwner>, TInput, TEvent>) {
    const runtime = ensureRuntime(ctx);
    const snapshot = runtime.registry.snapshot(undefined);
    ctx.state.entities = snapshot.entities;
    ctx.state.visibleIds = snapshot.visibleIds;
  }

  async function retryPendingLeaves(
    ctx: RoomContext<MmoRoomState<TWorld, TPublic, TOwner>, TInput, TEvent>,
    runtime: MmoRoomRuntime<TWorld, TInput, TProfile, TPublic, TOwner, TPrivate>
  ) {
    for (const [playerId, pending] of [...runtime.pendingLeaves]) {
      try {
        await config.persistence?.detachPlayer(runtime.registry, pending.player, pending.profile, ctx);
        runtime.pendingLeaves.delete(playerId);
        cleanupPlayerRuntime(runtime, playerId);
      } catch {
        ctx.metrics.record("mmo.persistence.detach_retry_error", 1, { roomType: ctx.roomType });
      }
    }
    syncState(ctx);
  }

  function schedulePendingLeaveRetry(
    ctx: RoomContext<MmoRoomState<TWorld, TPublic, TOwner>, TInput, TEvent>,
    runtime: MmoRoomRuntime<TWorld, TInput, TProfile, TPublic, TOwner, TPrivate>
  ) {
    if (runtime.pendingLeaves.size === 0 || runtime.pendingLeaveFlush) return;
    const operation = retryPendingLeaves(ctx, runtime);
    runtime.pendingLeaveFlush = operation;
    void operation.finally(() => {
      if (runtime.pendingLeaveFlush === operation) runtime.pendingLeaveFlush = undefined;
    });
  }

  const room = createRoomType<MmoRoomState<TWorld, TPublic, TOwner>, TInput, TEvent>({
    name: config.name,
    schema: config.schema ?? createDefaultRoomSchema<MmoRoomState<TWorld, TPublic, TOwner>>(),
    maxPlayers: config.maxPlayers,
    idleDisposeMs: config.idleDisposeMs,
    persistRoomIntervalMs: config.persistRoomIntervalMs,
    createState: (ctx) => ({
      tick: 0,
      roomId: ctx.roomId,
      roomType: ctx.roomType,
      world: createWorld(config.world, ctx),
      visibleIds: [],
      entities: {}
    }),
    restoreState(ctx, snapshot) {
      if (!isMmoRoomSnapshot<TWorld, TPublic, TOwner>(snapshot)) throw new Error(`invalid MMO room snapshot for ${ctx.roomId}`);
      const restored = snapshot;
      return {
        ...ctx.state,
        ...restored,
        tick: restored.tick ?? ctx.state.tick,
        roomId: ctx.roomId,
        roomType: ctx.roomType,
        visibleIds: Array.isArray(restored.visibleIds) ? [...restored.visibleIds] : [],
        entities: restored.entities === undefined ? Object.create(null) : copyRestoredEntities<TPublic, TOwner>(restored.entities)
      };
    },
    async canJoin(ctx, request) {
      const runtime = ensureRuntime(ctx);
      if (config.maxPlayers !== undefined && ctx.players.size >= config.maxPlayers) return { ok: false, reason: "room full" };
      return (await config.canJoin?.({ ctx, runtime }, request)) ?? { ok: true };
    },
    async onJoin(ctx, player) {
      const runtime = ensureRuntime(ctx);
      const attached = await config.persistence?.attachPlayer(runtime.registry, player, ctx);
      runtime.profiles.set(player.id, attached?.profile ?? null);
      const entityIds = new Set<string>();
      if (attached?.entity) entityIds.add(attached.entity.id);
      const entity = config.createPlayerEntity?.({ player, profile: attached?.profile ?? null, ctx, runtime });
      if (entity) {
        runtime.registry.upsert(entity);
        entityIds.add(entity.id);
      }
      runtime.playerEntityIds.set(player.id, entityIds);
      await config.onJoin?.({ ctx, runtime, player });
      syncState(ctx);
    },
    async onLeave(ctx, player, reason) {
      const runtime = ensureRuntime(ctx);
      let leaveError: unknown;
      try {
        await config.onLeave?.({ ctx, runtime, player, reason });
      } catch (error) {
        leaveError = error;
      }
      const profile = runtime.profiles.get(player.id) ?? null;
      runtime.pendingLeaves.set(player.id, { player, profile });
      let detachError: unknown;
      try {
        await config.persistence?.detachPlayer(runtime.registry, player, profile, ctx);
        runtime.pendingLeaves.delete(player.id);
        cleanupPlayerRuntime(runtime, player.id);
      } catch (error) {
        detachError = error;
      }
      syncState(ctx);
      if (leaveError !== undefined && detachError !== undefined) throw new AggregateError([leaveError, detachError], `MMO player ${player.id} leave failed`);
      if (detachError !== undefined) throw detachError;
      if (leaveError !== undefined) throw leaveError;
    },
    async onInput(ctx, player, input) {
      const runtime = ensureRuntime(ctx);
      runtime.inputs.set(player.id, input);
      await config.onInput?.({ ctx, runtime, player, input });
    },
    async update(ctx, dt) {
      const runtime = ensureRuntime(ctx);
      ctx.state.tick = (ctx.state.tick + 1) >>> 0;
      await config.update?.({ ctx, runtime, dt });
      syncState(ctx);
      schedulePendingLeaveRetry(ctx, runtime);
    },
    getInterestTarget(ctx, player) {
      const runtime = ensureRuntime(ctx);
      const entityId = firstValue(runtime.playerEntityIds.get(player.id) ?? []);
      const playerEntity = entityId ? runtime.registry.get(entityId) : runtime.registry.get(player.id);
      return normalizeInterestTarget(config.getInterestTarget?.({ ctx, runtime, player }) ?? defaultEntityTarget(playerEntity, defaultInterestRadius), defaultInterestRadius);
    },
    getSnapshot(ctx, player) {
      const runtime = ensureRuntime(ctx);
      const entityId = firstValue(runtime.playerEntityIds.get(player.id) ?? []);
      const playerEntity = entityId ? runtime.registry.get(entityId) : runtime.registry.get(player.id);
      const target = normalizeInterestTarget(config.getInterestTarget?.({ ctx, runtime, player }) ?? defaultEntityTarget(playerEntity, defaultInterestRadius), defaultInterestRadius);
      const snapshot = runtime.snapshotter.snapshotFor(player.id, target, { roomId: ctx.roomId, tick: ctx.state.tick });
      return { ...ctx.state, entities: snapshot.snapshot.entities, visibleIds: snapshot.visibleIds };
    },
    async onDispose(ctx, reason) {
      const runtime = runtimes.get(ctx.roomId);
      if (!runtime) return;
      await runtime.pendingLeaveFlush;
      await retryPendingLeaves(ctx, runtime);
      if (runtime.pendingLeaves.size > 0) throw new Error(`MMO room ${ctx.roomId} has ${runtime.pendingLeaves.size} unsaved player detachments`);
      await config.onDispose?.({ ctx, runtime, reason });
      runtimes.delete(ctx.roomId);
    }
  });

  return {
    ...room,
    getRuntime: (roomId) => runtimes.get(roomId),
    clearRuntime: (roomId) => runtimes.delete(roomId)
  };
}
