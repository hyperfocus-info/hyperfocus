import { createObjectPool } from "@hyperfocus/engine";
import { createSharedMemoryPool, type SharedMemoryPool } from "@hyperfocus/engine/core";
import { MMO_SKILL_DEMO_SHARED_HOT_DIRTY_FULL, MMO_SKILL_DEMO_SHARED_HOT_DIRTY_POSITION, MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE, mmoSkillDemoSharedHotSchema } from "./shared-hot.ts";
import { mmoSkillDemoActionCode, mmoSkillDemoCombatStateCode, mmoSkillDemoEntityIdCode, mmoSkillDemoEntityTypeCode, mmoSkillDemoStatusMask } from "./segmented-replication.ts";
import { type HazardEntity, type LootEntity, type MmoSkillDemoEntity, type MmoSkillDemoEntityKind, type MmoSkillDemoEntityViews, type MmoSkillDemoState, type NpcEntity, type PlayerEntity, type ResourceEntity } from "./shared-contracts.ts";
import { type SharedHotEntityIndex, type SharedHotEntityMirror } from "./shared-entity-hot-types.ts";
import { u16Ms, validAction } from "./shared-replication-values.ts";

type DirtyReplicationScope = "volatile" | "static" | "both";

type MmoSkillDemoDirtyReplicationRuntime = {
  volatileEntityIds: Set<string>;
  staticEntityIds: Set<string>;
  removedEntityIds: Set<string>;
};

const dirtyReplicationByState = new WeakMap<MmoSkillDemoState, MmoSkillDemoDirtyReplicationRuntime>();

function mmoSkillDemoEnvFlag(name: string, fallback = true) {
  const process = Reflect.get(globalThis, "process");
  const env = process && typeof process === "object" ? Reflect.get(process, "env") : undefined;
  const value = env && typeof env === "object" ? Reflect.get(env, name) : undefined;
  if (typeof value !== "string") return fallback;
  return value !== "0" && value.toLowerCase() !== "false";
}

const MMO_SKILL_DEMO_COUNTED_INDEX_ENABLED = mmoSkillDemoEnvFlag("MMO_SKILL_DEMO_COUNTED_INDEX");

const MMO_SKILL_DEMO_DIRECT_SHARED_SLOTS_ENABLED = mmoSkillDemoEnvFlag("MMO_SKILL_DEMO_DIRECT_SHARED_SLOTS");

const MMO_SKILL_DEMO_ACCESSOR_CACHE_ENABLED = mmoSkillDemoEnvFlag("MMO_SKILL_DEMO_ACCESSOR_CACHE");

const MMO_SKILL_DEMO_STATIC_LAZY_ENABLED = mmoSkillDemoEnvFlag("MMO_SKILL_DEMO_STATIC_LAZY");

const MMO_SKILL_DEMO_DIRTY_REPLICATION_ENABLED = mmoSkillDemoEnvFlag("MMO_SKILL_DEMO_DIRTY_REPLICATION", false);

const MMO_SKILL_DEMO_SHARED_DIRTY_SLAB_ENABLED = mmoSkillDemoEnvFlag("MMO_SKILL_DEMO_SHARED_DIRTY_SLAB", false);

const MMO_SKILL_DEMO_COARSE_SNAPSHOT_AOI_ENABLED = mmoSkillDemoEnvFlag("MMO_SKILL_DEMO_COARSE_SNAPSHOT_AOI");

function dirtyReplicationRuntime(state: MmoSkillDemoState) {
  let runtime = dirtyReplicationByState.get(state);
  if (!runtime) {
    runtime = { volatileEntityIds: new Set(), staticEntityIds: new Set(), removedEntityIds: new Set() };
    dirtyReplicationByState.set(state, runtime);
  }
  return runtime;
}

function dirtyReplicationState(state: MmoSkillDemoState) {
  return MMO_SKILL_DEMO_DIRTY_REPLICATION_ENABLED ? dirtyReplicationByState.get(state) : undefined;
}

function markMmoSkillDemoEntityDirty(state: MmoSkillDemoState, id: string, scope: DirtyReplicationScope = "both") {
  if (!MMO_SKILL_DEMO_DIRTY_REPLICATION_ENABLED || !id) return;
  const runtime = dirtyReplicationRuntime(state);
  if (scope === "volatile" || scope === "both") runtime.volatileEntityIds.add(id);
  if (scope === "static" || scope === "both") runtime.staticEntityIds.add(id);
}

function markMmoSkillDemoEntityRemoved(state: MmoSkillDemoState, id: string) {
  if (!MMO_SKILL_DEMO_DIRTY_REPLICATION_ENABLED || !id) return;
  const runtime = dirtyReplicationRuntime(state);
  runtime.volatileEntityIds.add(id);
  runtime.staticEntityIds.add(id);
  runtime.removedEntityIds.add(id);
}

function clearMmoSkillDemoDirtyReplication(state: MmoSkillDemoState) {
  const runtime = dirtyReplicationByState.get(state);
  if (runtime) {
    runtime.volatileEntityIds.clear();
    runtime.staticEntityIds.clear();
    runtime.removedEntityIds.clear();
  }
  const hotRuntime = sharedHotRuntimeByState.get(state);
  if (!hotRuntime || !MMO_SKILL_DEMO_SHARED_DIRTY_SLAB_ENABLED) return;
  const index = hotRuntime.indices.all;
  for (let position = 0; position < index.count; position += 1) hotRuntime.dirtyMasksBySlot[index.slots[position]] = 0;
}

function snapshotEntitiesOfType<TType extends MmoSkillDemoEntityKind>(state: MmoSkillDemoState, entityType: TType, scratch: EntityViewTypeMap[TType][]) {
  scratch.length = 0;
  const runtime = sharedHotRuntimeByState.get(state);
  if (runtime && MMO_SKILL_DEMO_COUNTED_INDEX_ENABLED) {
    const index = runtime.indices[entityType];
    const slots = index.slots;
    for (let i = 0, count = index.count; i < count; i += 1) {
      const entity = sharedHotEntityOfTypeAtSlot(state, runtime, entityType, slots[i]);
      if (entity) scratch.push(entity);
    }
    return scratch;
  }
  for (const entity of entitiesOfType(state, entityType)) scratch.push(entity);
  return scratch;
}

function entityTypeCount(state: MmoSkillDemoState, entityType: MmoSkillDemoEntityKind) {
  return mmoSkillDemoEntityTypeCount(state, entityType);
}

function pruneEntityTypeToMax(state: MmoSkillDemoState, entityType: MmoSkillDemoEntityKind, max: number) {
  let count = 0;
  let firstId = "";
  const runtime = sharedHotRuntimeByState.get(state);
  if (runtime && MMO_SKILL_DEMO_COUNTED_INDEX_ENABLED) {
    const index = runtime.indices[entityType];
    const slots = index.slots;
    for (let i = 0, indexCount = index.count; i < indexCount; i += 1) {
      const entity = sharedHotEntityOfTypeAtSlot(state, runtime, entityType, slots[i]);
      if (!entity) continue;
      if (count === 0) firstId = entity.id;
      count += 1;
      if (count > max) {
        removeMmoEntityForReuse(state, firstId);
        return;
      }
    }
    return;
  }
  for (const entity of entitiesOfType(state, entityType)) {
    if (count === 0) firstId = entity.id;
    count += 1;
    if (count > max) {
      removeMmoEntityForReuse(state, firstId);
      return;
    }
  }
}

function createPooledHazard(): HazardEntity {
  return {
    id: "",
    entityType: "hazard",
    kind: "aoe",
    zoneId: "ashwood",
    ownerId: "",
    x: 0,
    y: 0,
    toX: 0,
    toY: 0,
    radius: 0,
    windupMs: 0,
    lifetimeMs: 0,
    damage: 0,
    knockbackModifier: 0,
    isHeavyImpact: false,
    armorPierce: false,
    effectKind: "",
    text: "",
    pulse: 0
  };
}

function resetPooledHazard(hazard: HazardEntity) {
  hazard.id = "";
  hazard.entityType = "hazard";
  hazard.kind = "aoe";
  hazard.zoneId = "ashwood";
  hazard.ownerId = "";
  delete hazard.targetId;
  hazard.x = 0;
  hazard.y = 0;
  delete hazard.aimX;
  delete hazard.aimY;
  hazard.toX = 0;
  hazard.toY = 0;
  hazard.radius = 0;
  hazard.windupMs = 0;
  hazard.lifetimeMs = 0;
  hazard.damage = 0;
  hazard.knockbackModifier = 0;
  hazard.isHeavyImpact = false;
  hazard.armorPierce = false;
  hazard.effectKind = "";
  hazard.text = "";
  delete hazard.combatState;
  delete hazard.combatFlags;
  hazard.pulse = 0;
}

function createPooledLoot(): LootEntity {
  return {
    id: "",
    entityType: "loot",
    itemId: "",
    amount: 0,
    zoneId: "ashwood",
    x: 0,
    y: 0,
    ownerId: "",
    expiresMs: 0,
    pickupRadius: 0
  };
}

function resetPooledLoot(loot: LootEntity) {
  loot.id = "";
  loot.entityType = "loot";
  loot.itemId = "";
  loot.amount = 0;
  loot.zoneId = "ashwood";
  loot.x = 0;
  loot.y = 0;
  loot.ownerId = "";
  loot.expiresMs = 0;
  loot.pickupRadius = 0;
}

function createPooledNpc(): NpcEntity {
  return {
    id: "",
    entityType: "npc",
    kind: "",
    role: "",
    zoneId: "ashwood",
    elite: false,
    x: 0,
    y: 0,
    spawnX: 0,
    spawnY: 0,
    hp: 0,
    maxHp: 0,
    respawnMs: 0,
    attackCooldownMs: 0,
    projectileCooldownMs: 0,
    phaseMs: 0,
    summonedBy: "",
    personality: "passive",
    impactType: "dust",
    knockbackModifier: 0,
    knockbackX: 0,
    knockbackY: 0,
    knockbackMs: 0,
    knockbackHeavy: false,
    stunMs: 0,
    slowMs: 0,
    iframeMs: 0,
    castMs: 0,
    damageAmpMs: 0,
    combatState: "",
    combatFlags: "",
    lastAttackStyle: ""
  };
}

function resetPooledNpc(npc: NpcEntity) {
  npc.id = "";
  npc.entityType = "npc";
  npc.kind = "";
  npc.role = "";
  npc.zoneId = "ashwood";
  npc.elite = false;
  npc.x = 0;
  npc.y = 0;
  npc.spawnX = 0;
  npc.spawnY = 0;
  npc.hp = 0;
  npc.maxHp = 0;
  npc.respawnMs = 0;
  npc.attackCooldownMs = 0;
  npc.projectileCooldownMs = 0;
  npc.phaseMs = 0;
  npc.summonedBy = "";
  npc.personality = "passive";
  npc.impactType = "dust";
  npc.knockbackModifier = 0;
  npc.knockbackX = 0;
  npc.knockbackY = 0;
  npc.knockbackMs = 0;
  npc.knockbackHeavy = false;
  npc.stunMs = 0;
  npc.slowMs = 0;
  npc.iframeMs = 0;
  npc.castMs = 0;
  npc.damageAmpMs = 0;
  npc.combatState = "";
  npc.combatFlags = "";
  npc.lastAttackStyle = "";
}

const hazardPool = createObjectPool({ create: createPooledHazard, reset: resetPooledHazard, capacity: 256 });

const lootPool = createObjectPool({ create: createPooledLoot, reset: resetPooledLoot, capacity: 128 });

const npcPool = createObjectPool({ create: createPooledNpc, reset: resetPooledNpc, capacity: 64 });

const checkedOutHazards = new WeakSet<HazardEntity>();

const checkedOutLoot = new WeakSet<LootEntity>();

const checkedOutNpcs = new WeakSet<NpcEntity>();

const pendingHazardRelease: HazardEntity[] = [];

const pendingLootRelease: LootEntity[] = [];

const pendingNpcRelease: NpcEntity[] = [];

function acquireHazardEntity() {
  const entity = hazardPool.acquire();
  checkedOutHazards.add(entity);
  return entity;
}

function acquireLootEntity() {
  const entity = lootPool.acquire();
  checkedOutLoot.add(entity);
  return entity;
}

function acquireNpcEntity() {
  const entity = npcPool.acquire();
  checkedOutNpcs.add(entity);
  return entity;
}

function releaseRemovedEntity(entity: MmoSkillDemoEntity) {
  if (entity.entityType === "hazard") pendingHazardRelease.push(entity);
  else if (entity.entityType === "loot") pendingLootRelease.push(entity);
  else if (entity.entityType === "npc" && entity.summonedBy) pendingNpcRelease.push(entity);
}

function removeMmoEntityForReuse(state: MmoSkillDemoState, id: string) {
  const entity = state.entities[id];
  if (!entity) return false;
  markMmoSkillDemoEntityRemoved(state, id);
  releaseSharedHotEntity(state, id, entity);
  delete state.entities[id];
  releaseRemovedEntity(entity);
  return true;
}

function flushMmoEntityPools() {
  for (const hazard of pendingHazardRelease) {
    if (checkedOutHazards.delete(hazard)) hazardPool.release(hazard);
  }
  for (const loot of pendingLootRelease) {
    if (checkedOutLoot.delete(loot)) lootPool.release(loot);
  }
  for (const npc of pendingNpcRelease) {
    if (checkedOutNpcs.delete(npc)) npcPool.release(npc);
  }
  pendingHazardRelease.length = 0;
  pendingLootRelease.length = 0;
  pendingNpcRelease.length = 0;
}

const entityViewProxies = new WeakSet<object>();

type MmoSkillDemoSharedHotRuntime = {
  pool: SharedMemoryPool<typeof mmoSkillDemoSharedHotSchema.definition>;
  slotsByEntityId: Map<string, number>;
  entityIdsBySlot: string[];
  entityTypesBySlot: Array<MmoSkillDemoEntityKind | undefined>;
  generationsBySlot: Uint32Array;
  entityIdCodesBySlot: Uint32Array;
  entityTypeCodesBySlot: Uint8Array;
  dirtyMasksBySlot: Uint8Array;
  indices: Record<MmoSkillDemoEntityKind | "all", SharedHotEntityIndex>;
};

const sharedHotRuntimeByState = new WeakMap<MmoSkillDemoState, MmoSkillDemoSharedHotRuntime>();

const sharedHotEntityMirrors = new WeakMap<object, SharedHotEntityMirror>();

const SHARED_HOT_ENTITY_CAPACITY = 8192;

type EntityViewTypeMap = {
  player: PlayerEntity;
  npc: NpcEntity;
  resource: ResourceEntity;
  loot: LootEntity;
  hazard: HazardEntity;
};

function ensureEntityType<TEntity extends MmoSkillDemoEntity>(entity: TEntity, entityType: MmoSkillDemoEntityKind): TEntity {
  Reflect.set(entity, "entityType", entityType);
  return entity;
}

function isEntityOfType<TType extends MmoSkillDemoEntityKind>(
  entity: MmoSkillDemoEntity | undefined,
  entityType: TType
): entity is EntityViewTypeMap[TType] {
  return entity?.entityType === entityType;
}

function createSharedHotEntityIndex(capacity: number): SharedHotEntityIndex {
  const positionsBySlot = new Int32Array(capacity);
  positionsBySlot.fill(-1);
  return { slots: new Uint32Array(capacity), positionsBySlot, count: 0 };
}

function createSharedHotEntityIndices(capacity: number): MmoSkillDemoSharedHotRuntime["indices"] {
  return {
    all: createSharedHotEntityIndex(capacity),
    player: createSharedHotEntityIndex(capacity),
    npc: createSharedHotEntityIndex(capacity),
    resource: createSharedHotEntityIndex(capacity),
    loot: createSharedHotEntityIndex(capacity),
    hazard: createSharedHotEntityIndex(capacity)
  };
}

function addSlotToIndex(index: SharedHotEntityIndex, slot: number) {
  if (index.positionsBySlot[slot] >= 0) return;
  if (index.count >= index.slots.length) throw new Error("shared hot entity index is full");
  index.positionsBySlot[slot] = index.count;
  index.slots[index.count] = slot;
  index.count += 1;
}

function removeSlotFromIndex(index: SharedHotEntityIndex, slot: number) {
  const position = index.positionsBySlot[slot];
  if (position < 0) return;
  const lastPosition = index.count - 1;
  const lastSlot = index.slots[lastPosition];
  index.slots[position] = lastSlot;
  index.positionsBySlot[lastSlot] = position;
  index.positionsBySlot[slot] = -1;
  index.slots[lastPosition] = 0;
  index.count = lastPosition;
}

function registerSharedHotSlot(runtime: MmoSkillDemoSharedHotRuntime, id: string, entityType: MmoSkillDemoEntityKind, slot: number) {
  const previousId = runtime.entityIdsBySlot[slot];
  const previousType = runtime.entityTypesBySlot[slot];
  if (previousId && previousId !== id) runtime.slotsByEntityId.delete(previousId);
  if (previousType && previousType !== entityType) removeSlotFromIndex(runtime.indices[previousType], slot);
  runtime.entityIdsBySlot[slot] = id;
  runtime.entityTypesBySlot[slot] = entityType;
  runtime.entityIdCodesBySlot[slot] = mmoSkillDemoEntityIdCode(id);
  runtime.entityTypeCodesBySlot[slot] = mmoSkillDemoEntityTypeCode(entityType);
  addSlotToIndex(runtime.indices.all, slot);
  addSlotToIndex(runtime.indices[entityType], slot);
}

function detachSharedHotAccessors(entity: MmoSkillDemoEntity) {
  if (!sharedHotEntityMirrors.has(entity)) return;
  const descriptors: PropertyDescriptorMap = {};
  for (const key of ["x", "y", "hp", "action", "targetId", "combatState", "combatFlags"] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(entity, key);
    if (!descriptor || !("get" in descriptor || "set" in descriptor)) continue;
    descriptors[key] = {
      enumerable: descriptor.enumerable,
      configurable: true,
      writable: true,
      value: Reflect.get(entity, key)
    };
  }
  if (Object.keys(descriptors).length > 0) Object.defineProperties(entity, descriptors);
  sharedHotEntityMirrors.delete(entity);
}

function sharedHotRuntime(state: MmoSkillDemoState) {
  let runtime = sharedHotRuntimeByState.get(state);
  if (!runtime) {
    runtime = {
      pool: createSharedMemoryPool(mmoSkillDemoSharedHotSchema, { capacity: SHARED_HOT_ENTITY_CAPACITY }),
      slotsByEntityId: new Map(),
      entityIdsBySlot: [],
      entityTypesBySlot: [],
      generationsBySlot: new Uint32Array(SHARED_HOT_ENTITY_CAPACITY),
      entityIdCodesBySlot: new Uint32Array(SHARED_HOT_ENTITY_CAPACITY),
      entityTypeCodesBySlot: new Uint8Array(SHARED_HOT_ENTITY_CAPACITY),
      dirtyMasksBySlot: new Uint8Array(SHARED_HOT_ENTITY_CAPACITY),
      indices: createSharedHotEntityIndices(SHARED_HOT_ENTITY_CAPACITY)
    };
    sharedHotRuntimeByState.set(state, runtime);
  }
  return runtime;
}

function shouldUseSharedHotEntity(entity: MmoSkillDemoEntity) {
  return Number.isFinite(entity.x) && Number.isFinite(entity.y);
}

function sharedHotHp(entity: MmoSkillDemoEntity) {
  return "hp" in entity ? u16Ms(Number(entity.hp) || 0) : 0;
}

function sharedHotAction(entity: MmoSkillDemoEntity) {
  return entity.entityType === "player" ? validAction(entity.action) : "idle";
}

function sharedHotTargetId(entity: MmoSkillDemoEntity) {
  const value = Reflect.get(entity, "targetId");
  return typeof value === "string" ? value.slice(0, 32) : "";
}

function sharedHotCombatState(entity: MmoSkillDemoEntity) {
  const value = Reflect.get(entity, "combatState");
  return typeof value === "string" ? value.slice(0, 32) : "";
}

function sharedHotCombatFlags(entity: MmoSkillDemoEntity) {
  const value = Reflect.get(entity, "combatFlags");
  return typeof value === "string" ? value.slice(0, 96) : "";
}

function writeSharedHotCodes(ref: SharedHotEntityMirror) {
  ref.shared.action = mmoSkillDemoActionCode(ref.action);
  ref.shared.targetId = ref.targetId ? mmoSkillDemoEntityIdCode(ref.targetId) : 0;
  ref.shared.combatState = mmoSkillDemoCombatStateCode(ref.combatState);
  ref.shared.statusMask = mmoSkillDemoStatusMask(ref.combatFlags);
}

function markSharedHotDirty(state: MmoSkillDemoState, entityId: string, ref: SharedHotEntityMirror, mask: number) {
  if (MMO_SKILL_DEMO_SHARED_DIRTY_SLAB_ENABLED) ref.runtime.dirtyMasksBySlot[ref.slot] |= mask;
  markMmoSkillDemoEntityDirty(state, entityId, "volatile");
}

function installSharedHotAccessors(state: MmoSkillDemoState, entity: MmoSkillDemoEntity, ref: SharedHotEntityMirror) {
  const descriptors: PropertyDescriptorMap = {
    x: {
      enumerable: true,
      configurable: true,
      get: () => ref.shared.x,
      set: (value: unknown) => {
        const next = Number(value);
        if (ref.shared.x !== next) {
          ref.shared.x = next;
          markSharedHotDirty(state, entity.id, ref, MMO_SKILL_DEMO_SHARED_HOT_DIRTY_POSITION);
        }
      }
    },
    y: {
      enumerable: true,
      configurable: true,
      get: () => ref.shared.y,
      set: (value: unknown) => {
        const next = Number(value);
        if (ref.shared.y !== next) {
          ref.shared.y = next;
          markSharedHotDirty(state, entity.id, ref, MMO_SKILL_DEMO_SHARED_HOT_DIRTY_POSITION);
        }
      }
    }
  };
  if ("hp" in entity) {
    descriptors.hp = {
      enumerable: true,
      configurable: true,
      get: () => ref.shared.hp,
      set: (value: unknown) => {
        const next = u16Ms(Number(value) || 0);
        if (ref.shared.hp !== next) {
          ref.shared.hp = next;
          markSharedHotDirty(state, entity.id, ref, MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE);
        }
      }
    };
  }
  if (entity.entityType === "player") {
    descriptors.action = {
      enumerable: true,
      configurable: true,
      get: () => ref.action,
      set: (value: unknown) => {
        const next = validAction(value);
        if (ref.action !== next) {
          ref.action = next;
          ref.shared.action = mmoSkillDemoActionCode(ref.action);
          markSharedHotDirty(state, entity.id, ref, MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE);
        }
      }
    };
  }
  if (entity.entityType === "player" || entity.entityType === "hazard" || "targetId" in entity) {
    descriptors.targetId = {
      enumerable: true,
      configurable: true,
      get: () => ref.targetId,
      set: (value: unknown) => {
        const next = typeof value === "string" ? value.slice(0, 32) : "";
        if (ref.targetId !== next) {
          ref.targetId = next;
          ref.shared.targetId = ref.targetId ? mmoSkillDemoEntityIdCode(ref.targetId) : 0;
          markSharedHotDirty(state, entity.id, ref, MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE);
        }
      }
    };
  }
  if (entity.entityType === "npc" || entity.entityType === "hazard" || "combatState" in entity) {
    descriptors.combatState = {
      enumerable: true,
      configurable: true,
      get: () => ref.combatState,
      set: (value: unknown) => {
        const next = typeof value === "string" ? value.slice(0, 32) : "";
        if (ref.combatState !== next) {
          ref.combatState = next;
          ref.shared.combatState = mmoSkillDemoCombatStateCode(ref.combatState);
          markSharedHotDirty(state, entity.id, ref, MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE);
        }
      }
    };
  }
  if (entity.entityType === "player" || entity.entityType === "npc" || entity.entityType === "hazard" || "combatFlags" in entity) {
    descriptors.combatFlags = {
      enumerable: true,
      configurable: true,
      get: () => ref.combatFlags,
      set: (value: unknown) => {
        const next = typeof value === "string" ? value.slice(0, 96) : "";
        if (ref.combatFlags !== next) {
          ref.combatFlags = next;
          ref.shared.statusMask = mmoSkillDemoStatusMask(ref.combatFlags);
          markSharedHotDirty(state, entity.id, ref, MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE);
        }
      }
    };
  }
  Object.defineProperties(entity, descriptors);
}

function ensureSharedHotEntity<TEntity extends MmoSkillDemoEntity>(state: MmoSkillDemoState, entity: TEntity): TEntity {
  if (!shouldUseSharedHotEntity(entity)) return entity;
  const runtime = sharedHotRuntime(state);
  const x = Number(entity.x) || 0;
  const y = Number(entity.y) || 0;
  const hp = sharedHotHp(entity);
  const action = sharedHotAction(entity);
  const targetId = sharedHotTargetId(entity);
  const combatState = sharedHotCombatState(entity);
  const combatFlags = sharedHotCombatFlags(entity);
  let slot = runtime.slotsByEntityId.get(entity.id);
  if (slot === undefined) {
    const handle = runtime.pool.spawn({
      x,
      y,
      hp,
      action: mmoSkillDemoActionCode(action),
      targetId: targetId ? mmoSkillDemoEntityIdCode(targetId) : 0,
      combatState: mmoSkillDemoCombatStateCode(combatState),
      statusMask: mmoSkillDemoStatusMask(combatFlags)
    });
    slot = handle.slot;
    runtime.slotsByEntityId.set(entity.id, slot);
    runtime.generationsBySlot[slot] = handle.generation;
    runtime.dirtyMasksBySlot[slot] = MMO_SKILL_DEMO_SHARED_HOT_DIRTY_FULL;
  }
  const shared = runtime.pool.createEntityView(slot);
  let ref = sharedHotEntityMirrors.get(entity);
  if (!ref) {
    ref = { shared, runtime, slot, action, targetId, combatState, combatFlags };
    sharedHotEntityMirrors.set(entity, ref);
    installSharedHotAccessors(state, entity, ref);
  } else {
    ref.shared = shared;
    ref.runtime = runtime;
    ref.slot = slot;
    ref.action = action;
    ref.targetId = targetId;
    ref.combatState = combatState;
    ref.combatFlags = combatFlags;
  }
  ref.shared.x = x;
  ref.shared.y = y;
  ref.shared.hp = hp;
  writeSharedHotCodes(ref);
  registerSharedHotSlot(runtime, entity.id, entity.entityType, slot);
  return entity;
}

export function mmoSkillDemoSharedHotPoolForState(state: MmoSkillDemoState) {
  return sharedHotRuntime(state).pool;
}

export function mmoSkillDemoSharedHotSlotForEntity(state: MmoSkillDemoState, entityId: string) {
  return sharedHotRuntimeByState.get(state)?.slotsByEntityId.get(entityId);
}

export function mmoSkillDemoSharedHotBytesForEntity(state: MmoSkillDemoState, entityId: string) {
  ensureMmoEntityViews(state);
  const runtime = sharedHotRuntimeByState.get(state);
  const slot = runtime?.slotsByEntityId.get(entityId);
  return slot === undefined ? undefined : runtime?.pool.getEntityByteSlice(slot);
}

export function mmoSkillDemoSharedHotSlotForEntityType(state: MmoSkillDemoState, entityType: MmoSkillDemoEntityKind, index: number) {
  const runtime = sharedHotRuntimeByState.get(state);
  const typedIndex = runtime?.indices[entityType];
  if (!runtime || !typedIndex || index < 0 || index >= typedIndex.count) return undefined;
  const slot = typedIndex.slots[index];
  const id = runtime.entityIdsBySlot[slot];
  return id && state.entities[id]?.entityType === entityType ? slot : undefined;
}

export function mmoSkillDemoEntityTypeCount(state: MmoSkillDemoState, entityType: MmoSkillDemoEntityKind) {
  const runtime = sharedHotRuntimeByState.get(state);
  return runtime?.indices[entityType].count ?? entityTypeCountFallback(state, entityType);
}

function releaseSharedHotEntity(state: MmoSkillDemoState, id: string, entity = state.entities[id]) {
  const runtime = sharedHotRuntimeByState.get(state);
  const slot = runtime?.slotsByEntityId.get(id);
  if (!runtime || slot === undefined) {
    if (entity) detachSharedHotAccessors(entity);
    return;
  }
  const entityType = runtime.entityTypesBySlot[slot];
  if (entity) detachSharedHotAccessors(entity);
  runtime.pool.release(slot, runtime.generationsBySlot[slot]);
  runtime.slotsByEntityId.delete(id);
  delete runtime.entityIdsBySlot[slot];
  runtime.entityTypesBySlot[slot] = undefined;
  runtime.generationsBySlot[slot] = 0;
  runtime.entityIdCodesBySlot[slot] = 0;
  runtime.entityTypeCodesBySlot[slot] = 0;
  runtime.dirtyMasksBySlot[slot] = 0;
  removeSlotFromIndex(runtime.indices.all, slot);
  if (entityType) removeSlotFromIndex(runtime.indices[entityType], slot);
}

function sharedHotEntityAtSlot(state: MmoSkillDemoState, runtime: MmoSkillDemoSharedHotRuntime, slot: number) {
  const id = runtime.entityIdsBySlot[slot];
  return id ? state.entities[id] : undefined;
}

function sharedHotEntityOfTypeAtSlot<TType extends MmoSkillDemoEntityKind>(
  state: MmoSkillDemoState,
  runtime: MmoSkillDemoSharedHotRuntime,
  entityType: TType,
  slot: number
) {
  const entity = sharedHotEntityAtSlot(state, runtime, slot);
  return isEntityOfType(entity, entityType) ? entity : undefined;
}

function* entitiesOfType<TType extends MmoSkillDemoEntityKind>(state: MmoSkillDemoState, entityType: TType): Iterable<EntityViewTypeMap[TType]> {
  const runtime = sharedHotRuntimeByState.get(state);
  if (runtime) {
    const index = runtime.indices[entityType];
    const slots = MMO_SKILL_DEMO_COUNTED_INDEX_ENABLED ? index.slots : index.slots.subarray(0, index.count);
    const count = MMO_SKILL_DEMO_COUNTED_INDEX_ENABLED ? index.count : slots.length;
    for (let i = 0; i < count; i += 1) {
      const entity = sharedHotEntityOfTypeAtSlot(state, runtime, entityType, slots[i]);
      if (entity) yield entity;
    }
    return;
  }
  for (const [, entity] of Object.entries(state.entities ?? {})) {
    if (isEntityOfType(entity, entityType)) yield entity;
  }
}

function* entitiesInState(state: MmoSkillDemoState): Iterable<MmoSkillDemoEntity> {
  const runtime = sharedHotRuntimeByState.get(state);
  if (runtime) {
    const index = runtime.indices.all;
    const slots = MMO_SKILL_DEMO_COUNTED_INDEX_ENABLED ? index.slots : index.slots.subarray(0, index.count);
    const count = MMO_SKILL_DEMO_COUNTED_INDEX_ENABLED ? index.count : slots.length;
    for (let i = 0; i < count; i += 1) {
      const entity = sharedHotEntityAtSlot(state, runtime, slots[i]);
      if (entity) yield entity;
    }
    return;
  }
  for (const [, entity] of Object.entries(state.entities ?? {})) {
    if (entity) yield entity;
  }
}

function entityIdsOfType(state: MmoSkillDemoState, entityType: MmoSkillDemoEntityKind) {
  const runtime = sharedHotRuntimeByState.get(state);
  if (!runtime) return Object.keys(state.entities).filter((id) => state.entities[id]?.entityType === entityType);
  const ids: string[] = [];
  const index = runtime.indices[entityType];
  const slots = MMO_SKILL_DEMO_COUNTED_INDEX_ENABLED ? index.slots : index.slots.subarray(0, index.count);
  const count = MMO_SKILL_DEMO_COUNTED_INDEX_ENABLED ? index.count : slots.length;
  for (let i = 0; i < count; i += 1) {
    const id = runtime.entityIdsBySlot[slots[i]];
    if (id && state.entities[id]?.entityType === entityType) ids.push(id);
  }
  return ids;
}

function entityTypeCountFallback(state: MmoSkillDemoState, entityType: MmoSkillDemoEntityKind) {
  let count = 0;
  for (const [, entity] of Object.entries(state.entities ?? {})) {
    if (entity?.entityType === entityType) count += 1;
  }
  return count;
}

function legacyEntityMap(state: MmoSkillDemoState, key: keyof MmoSkillDemoEntityViews): Record<string, MmoSkillDemoEntity> {
  if (key === "players") return state.players;
  if (key === "npcs") return state.npcs;
  if (key === "resources") return state.resources;
  if (key === "loots") return state.loots;
  return state.hazards;
}

function migrateLegacyEntityMap(state: MmoSkillDemoState, key: keyof MmoSkillDemoEntityViews, entityType: MmoSkillDemoEntityKind) {
  const raw = legacyEntityMap(state, key);
  if (entityViewProxies.has(raw)) return;
  for (const [, entity] of Object.entries(raw)) {
    if (entity?.id) state.entities[entity.id] = ensureEntityType(entity, entityType);
  }
}

function createEntityViewMap<TType extends MmoSkillDemoEntityKind>(state: MmoSkillDemoState, entityType: TType, sharedHot: boolean): Record<string, EntityViewTypeMap[TType]> {
  const target: Record<string, EntityViewTypeMap[TType]> = {};
  const proxy = new Proxy(target, {
    get(_target, property) {
      if (property === Symbol.iterator) return undefined;
      if (property === "toJSON") return () => Object.fromEntries(Object.entries(proxy));
      const entity = state.entities[String(property)];
      return isEntityOfType(entity, entityType) ? entity : undefined;
    },
    set(_target, property, value) {
      const entity = ensureEntityType(value, entityType);
      const id = entity.id || String(property);
      const previous = state.entities[id];
      if (previous && previous !== entity) {
        markMmoSkillDemoEntityRemoved(state, id);
        releaseSharedHotEntity(state, id, previous);
        releaseRemovedEntity(previous);
      }
      state.entities[id] = sharedHot ? ensureSharedHotEntity(state, entity) : entity;
      markMmoSkillDemoEntityDirty(state, id, "both");
      return true;
    },
    deleteProperty(_target, property) {
      const id = String(property);
      if (state.entities[id]?.entityType === entityType) removeMmoEntityForReuse(state, id);
      return true;
    },
    has(_target, property) {
      return state.entities[String(property)]?.entityType === entityType;
    },
    ownKeys() {
      return entityIdsOfType(state, entityType);
    },
    getOwnPropertyDescriptor(_target, property) {
      if (state.entities[String(property)]?.entityType !== entityType) return undefined;
      return { enumerable: true, configurable: true };
    }
  });
  entityViewProxies.add(proxy);
  return proxy;
}

function defineEntityView<TType extends MmoSkillDemoEntityKind>(
  state: MmoSkillDemoState,
  key: keyof MmoSkillDemoEntityViews,
  entityType: TType,
  sharedHot: boolean
) {
  Object.defineProperty(state, key, {
    configurable: true,
    enumerable: false,
    writable: false,
    value: createEntityViewMap(state, entityType, sharedHot)
  });
}

function ensureMmoEntityViewsInternal(state: MmoSkillDemoState, options: { sharedHot: boolean; migrateLegacy: boolean }): MmoSkillDemoState {
  state.entities ??= {};
  if (options.migrateLegacy) {
    migrateLegacyEntityMap(state, "players", "player");
    migrateLegacyEntityMap(state, "npcs", "npc");
    migrateLegacyEntityMap(state, "resources", "resource");
    migrateLegacyEntityMap(state, "loots", "loot");
    migrateLegacyEntityMap(state, "hazards", "hazard");
  }
  if (options.sharedHot) {
    for (const [id, entity] of Object.entries(state.entities)) state.entities[id] = ensureSharedHotEntity(state, entity);
  }
  defineEntityView(state, "players", "player", options.sharedHot);
  defineEntityView(state, "npcs", "npc", options.sharedHot);
  defineEntityView(state, "resources", "resource", options.sharedHot);
  defineEntityView(state, "loots", "loot", options.sharedHot);
  defineEntityView(state, "hazards", "hazard", options.sharedHot);
  return state;
}

export function ensureMmoEntityViews(state: MmoSkillDemoState): MmoSkillDemoState {
  return ensureMmoEntityViewsInternal(state, { sharedHot: true, migrateLegacy: true });
}

export function attachMmoEntityViews(state: MmoSkillDemoState): MmoSkillDemoState {
  return ensureMmoEntityViewsInternal(state, { sharedHot: false, migrateLegacy: false });
}

export function entityViews(state: MmoSkillDemoState): MmoSkillDemoEntityViews {
  return ensureMmoEntityViews(state);
}

export function upsertMmoSkillDemoEntity(state: MmoSkillDemoState, entity: MmoSkillDemoEntity) {
  const previous = state.entities[entity.id];
  if (previous && previous !== entity) {
    markMmoSkillDemoEntityRemoved(state, entity.id);
    releaseSharedHotEntity(state, entity.id, previous);
    releaseRemovedEntity(previous);
  }
  const stored = ensureSharedHotEntity(state, entity);
  state.entities[entity.id] = stored;
  markMmoSkillDemoEntityDirty(state, entity.id, "both");
  return stored;
}

export function removeMmoSkillDemoEntity(state: MmoSkillDemoState, id: string) {
  removeMmoEntityForReuse(state, id);
}

export const syncMmoEntityRegistry = ensureMmoEntityViews;

export {
  MMO_SKILL_DEMO_ACCESSOR_CACHE_ENABLED,
  MMO_SKILL_DEMO_COARSE_SNAPSHOT_AOI_ENABLED,
  MMO_SKILL_DEMO_COUNTED_INDEX_ENABLED,
  MMO_SKILL_DEMO_DIRECT_SHARED_SLOTS_ENABLED,
  MMO_SKILL_DEMO_DIRTY_REPLICATION_ENABLED,
  MMO_SKILL_DEMO_SHARED_DIRTY_SLAB_ENABLED,
  MMO_SKILL_DEMO_STATIC_LAZY_ENABLED,
  SHARED_HOT_ENTITY_CAPACITY,
  acquireHazardEntity,
  acquireLootEntity,
  acquireNpcEntity,
  addSlotToIndex,
  checkedOutHazards,
  checkedOutLoot,
  checkedOutNpcs,
  clearMmoSkillDemoDirtyReplication,
  createEntityViewMap,
  createPooledHazard,
  createPooledLoot,
  createPooledNpc,
  createSharedHotEntityIndex,
  createSharedHotEntityIndices,
  defineEntityView,
  detachSharedHotAccessors,
  dirtyReplicationByState,
  dirtyReplicationRuntime,
  dirtyReplicationState,
  ensureEntityType,
  ensureMmoEntityViewsInternal,
  ensureSharedHotEntity,
  entitiesInState,
  entitiesOfType,
  entityIdsOfType,
  entityTypeCount,
  entityTypeCountFallback,
  entityViewProxies,
  flushMmoEntityPools,
  hazardPool,
  installSharedHotAccessors,
  lootPool,
  markMmoSkillDemoEntityDirty,
  markMmoSkillDemoEntityRemoved,
  markSharedHotDirty,
  migrateLegacyEntityMap,
  mmoSkillDemoEnvFlag,
  npcPool,
  pendingHazardRelease,
  pendingLootRelease,
  pendingNpcRelease,
  pruneEntityTypeToMax,
  registerSharedHotSlot,
  releaseRemovedEntity,
  releaseSharedHotEntity,
  removeMmoEntityForReuse,
  removeSlotFromIndex,
  resetPooledHazard,
  resetPooledLoot,
  resetPooledNpc,
  sharedHotAction,
  sharedHotCombatFlags,
  sharedHotCombatState,
  sharedHotEntityAtSlot,
  sharedHotEntityMirrors,
  sharedHotEntityOfTypeAtSlot,
  sharedHotHp,
  sharedHotRuntime,
  sharedHotRuntimeByState,
  sharedHotTargetId,
  shouldUseSharedHotEntity,
  snapshotEntitiesOfType,
  writeSharedHotCodes
};

export type {
  DirtyReplicationScope,
  EntityViewTypeMap,
  MmoSkillDemoDirtyReplicationRuntime,
  MmoSkillDemoSharedHotRuntime
};
