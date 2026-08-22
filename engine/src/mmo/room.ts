import { defineSchema, type ReplicationSchema } from "../protocol/index.ts";
import { createRoomType } from "../server/room-type.ts";
import type { AuthoritativePlayer, JoinDecision, RoomContext, RoomType } from "../server/types.ts";
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
        publicData: { type: "json", maxLength: 8192 },
        ownerData: { type: "json", maxLength: 8192 }
      }
    }
  }
});

function roomSchema<TState>(): ReplicationSchema<TState> {
  return defaultRoomSchema as unknown as ReplicationSchema<TState>;
}

function createWorld<TWorld, TInput, TEvent>(
  world: TWorld | ((ctx: Pick<RoomContext<MmoRoomState<TWorld>, TInput, TEvent>, "roomId" | "roomType" | "now">) => TWorld) | undefined,
  ctx: Pick<RoomContext<MmoRoomState<TWorld>, TInput, TEvent>, "roomId" | "roomType" | "now">
): TWorld {
  if (typeof world === "function") return (world as (context: typeof ctx) => TWorld)(ctx);
  if (world !== undefined) return world;
  return {} as TWorld;
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

function copyRestoredEntities<TEntity>(value: unknown): Record<string, TEntity> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("MMO room snapshot entities must be an object");
  const entities = Object.create(null) as Record<string, TEntity>;
  for (const [id, entity] of Object.entries(value)) {
    Object.defineProperty(entities, id, { value: entity as TEntity, configurable: true, enumerable: true, writable: true });
  }
  return entities;
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

  function ensureRuntime(ctx: RoomContext<MmoRoomState<TWorld, TPublic, TOwner>, TInput, TEvent>) {
    let runtime = runtimes.get(ctx.roomId);
    if (runtime) return runtime;
    const registry = typeof config.registry === "function" ? config.registry(ctx) : createMmoEntityRegistry(config.registry);
    runtime = {
      world: ctx.state.world,
      registry,
      inputs: new Map(),
      profiles: new Map(),
      playerEntityIds: new Map(),
      snapshotter: undefined as unknown as MmoInterestSnapshotter<TPublic, TOwner, TPrivate>
    };
    runtime.snapshotter =
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

  const room = createRoomType<MmoRoomState<TWorld, TPublic, TOwner>, TInput, TEvent>({
    name: config.name,
    schema: config.schema ?? roomSchema<MmoRoomState<TWorld, TPublic, TOwner>>(),
    maxPlayers: config.maxPlayers,
    idleDisposeMs: config.idleDisposeMs,
    persistRoomIntervalMs: config.persistRoomIntervalMs,
    createState: (ctx) => ({
      tick: 0,
      roomId: ctx.roomId,
      roomType: ctx.roomType,
      world: createWorld(config.world as never, ctx as never),
      visibleIds: [],
      entities: {}
    }),
    restoreState(ctx, snapshot) {
      if (typeof snapshot !== "object" || snapshot === null) throw new Error(`invalid MMO room snapshot for ${ctx.roomId}`);
      const restored = snapshot as Partial<MmoRoomState<TWorld, TPublic, TOwner>>;
      if (restored.tick !== undefined && (!Number.isInteger(restored.tick) || restored.tick < 0 || restored.tick > 0xffffffff)) {
        throw new Error(`invalid MMO room tick for ${ctx.roomId}`);
      }
      if (restored.visibleIds !== undefined && (!Array.isArray(restored.visibleIds) || restored.visibleIds.some((id) => typeof id !== "string"))) {
        throw new Error(`invalid MMO room visibleIds for ${ctx.roomId}`);
      }
      return {
        ...ctx.state,
        ...restored,
        tick: restored.tick ?? ctx.state.tick,
        roomId: ctx.roomId,
        roomType: ctx.roomType,
        visibleIds: Array.isArray(restored.visibleIds) ? [...restored.visibleIds] : [],
        entities: restored.entities === undefined ? Object.create(null) : copyRestoredEntities<MmoReplicatedEntity<TPublic, TOwner>>(restored.entities)
      };
    },
    async canJoin(ctx, request) {
      const runtime = ensureRuntime(ctx);
      if (config.maxPlayers !== undefined && ctx.players.size >= config.maxPlayers) return { ok: false, reason: "room full" };
      return (await config.canJoin?.({ ctx, runtime }, request)) ?? true;
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
      try {
        const profile = runtime.profiles.get(player.id) ?? null;
        await config.persistence?.detachPlayer(runtime.registry, player, profile, ctx);
      } finally {
        for (const entityId of runtime.playerEntityIds.get(player.id) ?? []) runtime.registry.remove(entityId);
        runtime.inputs.delete(player.id);
        runtime.profiles.delete(player.id);
        runtime.playerEntityIds.delete(player.id);
        runtime.snapshotter.clearViewer(player.id);
        syncState(ctx);
      }
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
    },
    getInterestTarget(ctx, player) {
      const runtime = ensureRuntime(ctx);
      const entityId = runtime.playerEntityIds.get(player.id)?.values().next().value as string | undefined;
      const playerEntity = entityId ? runtime.registry.get(entityId) : runtime.registry.get(player.id);
      return normalizeInterestTarget(config.getInterestTarget?.({ ctx, runtime, player }) ?? defaultEntityTarget(playerEntity, defaultInterestRadius), defaultInterestRadius);
    },
    getSnapshot(ctx, player) {
      const runtime = ensureRuntime(ctx);
      const entityId = runtime.playerEntityIds.get(player.id)?.values().next().value as string | undefined;
      const playerEntity = entityId ? runtime.registry.get(entityId) : runtime.registry.get(player.id);
      const target = normalizeInterestTarget(config.getInterestTarget?.({ ctx, runtime, player }) ?? defaultEntityTarget(playerEntity, defaultInterestRadius), defaultInterestRadius);
      const snapshot = runtime.snapshotter.snapshotFor(player.id, target, { roomId: ctx.roomId, tick: ctx.state.tick });
      return { ...ctx.state, entities: snapshot.snapshot.entities, visibleIds: snapshot.visibleIds };
    },
    async onDispose(ctx, reason) {
      const runtime = runtimes.get(ctx.roomId);
      if (!runtime) return;
      try {
        await config.onDispose?.({ ctx, runtime, reason });
      } finally {
        runtimes.delete(ctx.roomId);
      }
    }
  }) as GeneratedMmoRoomType<TWorld, TInput, TProfile, TPublic, TOwner, TPrivate, TEvent>;

  room.getRuntime = (roomId) => runtimes.get(roomId);
  room.clearRuntime = (roomId) => runtimes.delete(roomId);
  return room;
}
