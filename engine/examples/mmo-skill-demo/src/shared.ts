import { createCollisionKernel, createObjectPool, createStaticRectCollisionIndex, extractCollisionRects, tileToWorld, type CollisionKernel, type TileMap } from "@hyperfocus/engine";
import { truncateUtf8 } from "../../text-utils.ts";
import {
  buildMmoSkillDemoMap as buildConfiguredMmoSkillDemoMap,
  buildMmoSkillDemoAnchorSpecs,
  buildMmoSkillDemoNpcMarkers,
  buildMmoSkillDemoRegionTiles,
  getMmoSkillDemoAnchorTile,
  mmoSkillDemoRegionConfig,
  resolveMmoSkillDemoNpcSpawns,
  WORLD_MAP_SCALE,
  zoneForMmoSkillDemoTile
} from "./data/world.ts";
import { bestiaryDefinitions, bestiaryFor, type MmoImpactType, type MmoPersonality } from "./data/bestiary.ts";
import { worldCreatureDefinitions, type WorldCreatureEcologyTag } from "./data/world-creatures.ts";
import { worldFactions, type WorldFactionId } from "./data/world-factions.ts";
import { worldGatherableNodeSpecs, type WorldGatherableNodeKind } from "./data/world-gatherables.ts";
import { worldCraftingMaterials } from "./data/world-materials.ts";
import { worldCraftingRecipes as authoredWorldCraftingRecipes } from "./data/world-recipes.ts";
import { worldFactionQuestlines } from "./data/world-quests.ts";
import { worldReputationRewards } from "./data/world-reputation.ts";
import { currentUtcDateString, dailyQuestArcForDate, dailyQuestStepChoice, type DailyObjectiveType, type DailyQuestStep } from "./data/daily-quests.ts";
import type { RectLike } from "@hyperfocus/engine";
import {
  addMmoId,
  addMmoStatus,
  beginMmoAbility,
  chargeMmoAbility,
  clearMmoAbility,
  coneMmoTargetHits,
  createMmoCombatModule,
  createMmoInventoryOps,
  firstMmoLineTargetHit,
  findMmoEntityNearAim,
  findNearestMmoEntity,
  hasMmoAbilityEvent,
  hasMmoId,
  hasMmoStatusBit,
  hasMmoStatus,
  lineMmoTargetHits,
  markMmoAbilityEvent,
  markMmoAbilityEventMs,
  mmoAbilityEventMs,
  mmoStatusBitmask,
  mmoTargetInCone,
  mmoStatusStacks,
  moveMmoCircle,
  pointSegmentDistance as mmoPointSegmentDistance,
  radiusMmoTargetHits,
  removeMmoStatus,
  setMmoStatusStacks,
  teleportMmoEntityToTile,
  tickMmoAbility,
  useMmoConsumable,
  type MmoInventoryMap
} from "@hyperfocus/engine/mmo";
import {
  createInterestGrid,
  createSharedCellReplicator,
  createSpatialHash,
  createRoomType,
  selectVisibleEntityBuckets,
  selectTransientEffectsForViewer,
  spawnTransientEffect,
  updateTransientEffects,
  type CompactTransientEffect,
  type AuthoritativePlayer,
  type InterestEntity,
  type InterestIndex,
  type RoomContext,
  type SharedCellReplicationEntity,
  type SharedCellReplicator,
  type SpatialHashEntity,
  type SpatialHashIndex,
  type RoomReplicationRequest,
  type RoomReplicationOptions,
  type RoomReplicationTelemetry
} from "@hyperfocus/engine/server";
import { createSharedMemoryPool, type SharedMemoryPool } from "@hyperfocus/engine/core";
import { PREENCODED_SNAPSHOT_BYTES, encodeMultipartReplicationEnvelope, type ReplicationEnvelopeSegment } from "@hyperfocus/engine/protocol";
import { saveCharacterForUser, savedCharacterForUser, type SavedCharacter } from "./persistence.ts";
import { mmoSkillDemoSchema } from "./schema.ts";
import {
  awardGatheringXp,
  clearActiveGathering,
  ensureGatheringProgress,
  gatheringSkillForLegacyAction,
  materialForGatheringNode,
  setGatheringLevelForDev,
  startGatheringInteraction,
  tickActiveGathering,
  type GatheringAction
} from "./server/gatheringEngine.ts";
import { resolveGatheringHazard, spawnGatheringHazard } from "./server/hazardEngine.ts";
import { craftRecipeById as craftAuthoredProgressionRecipe } from "./server/craftingEngine.ts";
import { gatheringSkillIds, isGatheringSkillId, type GatheringSkillId } from "./shared/skills.ts";
import { getGatherableMaterialById, type GatherableMaterial } from "./shared/materials.ts";
import { HAZARD_SIZE, NPC_DEFAULT_SIZE, NPC_SIZE_BY_KIND, NPC_SIZE_BY_ROLE, PLAYER_SIZE, RESOURCE_SIZE_BY_KIND } from "./data/entity-sizes.ts";
import {
  MMO_SKILL_DEMO_SHARED_HOT_DIRTY_FULL,
  MMO_SKILL_DEMO_SHARED_HOT_DIRTY_POSITION,
  MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE,
  MMO_SKILL_DEMO_SHARED_HOT_OFFSETS,
  mmoSkillDemoSharedHotSchema
} from "./shared-hot.ts";
import {
  createMmoSkillDemoSegmentState,
  encodeMmoSkillDemoSegment,
  mmoSkillDemoCellKey,
  mmoSkillDemoActionCode,
  mmoSkillDemoCombatStateCode,
  mmoSkillDemoEntityIdCode,
  mmoSkillDemoEntityTypeCode,
  mmoSkillDemoMultipartCodec,
  mmoSkillDemoNeighborCellKeys,
  mmoSkillDemoStaticEntitySignature,
  mmoSkillDemoStatusMask,
  toMmoSkillDemoStaticSegmentEntity,
  toMmoSkillDemoVolatileSegmentEntity,
  type MmoSkillDemoSegmentKind
} from "./segmented-replication.ts";
export { mmoSkillDemoSchema } from "./schema.ts";
export { mmoSkillDemoSharedHotSchema } from "./shared-hot.ts";
export { mmoSkillDemoMultipartCodec } from "./segmented-replication.ts";

export type SkillName = "combat" | GatheringSkillId | "woodcutting";
export type ZoneId =
  | "ashwood"
  | "crags"
  | "bazaar"
  | "port-marrow"
  | "holy-reach"
  | "canaan-desert"
  | "void-rift"
  | "ashwood-wilderness"
  | "whisperwind-ascent"
  | "dungeon"
  | "cottage";
export type MmoSkillDemoAction =
  | "idle"
  | "lmb"
  | "rmb"
  | "space"
  | "q"
  | "e"
  | "r"
  | "attack"
  | "mine"
  | "woodcut"
  | "interact"
  | "travel"
  | "bank"
  | "trade"
  | "use-item"
  | "config"
  | "dev";

export type MmoCatalogDef = {
  id: string;
  name: string;
  zoneId: ZoneId;
  role: string;
  summary: string;
};

export type PlayerEntity = {
  id: string;
  entityType: "player";
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  energy: number;
  maxEnergy: number;
  combatXp: number;
  combatLevel: number;
  miningXp: number;
  miningLevel: number;
  woodcuttingXp: number;
  woodcuttingLevel: number;
  gatheringXp?: Record<string, number>;
  gatheringLevels?: Record<string, number>;
  zoneId: ZoneId;
  gold: number;
  renown: number;
  masteryRank: number;
  contractId: string;
  contractKills: number;
  contractStreak: number;
  contractCooldownMs: number;
  inventory: Record<string, number>;
  bank: Record<string, number>;
  equipment: Record<string, string>;
  abilitySlots: Record<string, string>;
  cooldowns: Record<string, number>;
  questFlags: Record<string, boolean>;
  activeQuestId: string;
  dailyQuestDate: string;
  dailyQuestStep: number;
  dailyQuestProgress: number;
  dailyQuestCompleted: boolean;
  dailyQuestResult: string;
  wolfKills: number;
  batKills: number;
  bazaarSurvivalMs: number;
  dungeonBossKills: number;
  homeZoneId: ZoneId;
  escortNpcId: string;
  escortTargetX: number;
  escortTargetY: number;
  escortTargetZoneId: ZoneId;
  escortMs: number;
  instanceId: string;
  prestigeTitle: string;
  action: MmoSkillDemoAction;
  targetId: string;
  activeGatherNodeId?: string;
  activeGatherMaterialId?: number;
  activeGatherSkillId?: string;
  activeGatherMs?: number;
  activeGatherTotalMs?: number;
  activeGatherStartX?: number;
  activeGatherStartY?: number;
  activeGatherStartHp?: number;
  aimX: number;
  aimY: number;
  guardMs: number;
  berserkMs: number;
  cooldownMs: number;
  equippedWeaponId: string;
  activeAbility: string;
  activeSlot: string;
  activeMs: number;
  activeDurationMs: number;
  chargeMs: number;
  rushDistance: number;
  abilityVectorX: number;
  abilityVectorY: number;
  abilityTickMs: number;
  abilityHits: string;
  knockbackX: number;
  knockbackY: number;
  knockbackMs: number;
  knockbackHeavy: boolean;
  momentumX?: number;
  momentumY?: number;
  stunMs: number;
  slowMs?: number;
  iframeMs: number;
  castMs: number;
  damageAmpMs: number;
  combatFlags: string;
  lastAttackStyle: string;
  visibleCount: number;
};

export type NpcEntity = {
  id: string;
  entityType: "npc";
  kind: string;
  role: string;
  zoneId: ZoneId;
  elite: boolean;
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  hp: number;
  maxHp: number;
  respawnMs: number;
  attackCooldownMs: number;
  projectileCooldownMs: number;
  phaseMs: number;
  summonedBy: string;
  personality: MmoPersonality;
  impactType: MmoImpactType;
  knockbackModifier: number;
  knockbackX: number;
  knockbackY: number;
  knockbackMs: number;
  knockbackHeavy: boolean;
  stunMs: number;
  slowMs: number;
  iframeMs: number;
  castMs: number;
  damageAmpMs: number;
  combatState: string;
  combatFlags: string;
  lastAttackStyle: string;
};

export type HazardEntity = {
  id: string;
  entityType: "hazard";
  kind: "line" | "aoe";
  zoneId: ZoneId;
  ownerId: string;
  targetId?: string;
  x: number;
  y: number;
  aimX?: number;
  aimY?: number;
  toX: number;
  toY: number;
  radius: number;
  windupMs: number;
  lifetimeMs: number;
  damage: number;
  knockbackModifier: number;
  isHeavyImpact: boolean;
  armorPierce: boolean;
  effectKind: string;
  text: string;
  combatState?: string;
  combatFlags?: string;
  pulse: number;
};

export type LootEntity = {
  id: string;
  entityType: "loot";
  itemId: string;
  amount: number;
  zoneId: ZoneId;
  x: number;
  y: number;
  ownerId: string;
  expiresMs: number;
  pickupRadius: number;
};

export type ResourceEntity = {
  id: string;
  entityType: "resource";
  kind: WorldGatherableNodeKind;
  skillId?: GatheringSkillId;
  materialId?: number;
  zoneId: ZoneId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  depleted: boolean;
  respawnMs: number;
};

export type MmoSkillDemoEntityKind = "player" | "npc" | "resource" | "loot" | "hazard";
export type MmoSkillDemoEntity = PlayerEntity | NpcEntity | ResourceEntity | LootEntity | HazardEntity;

export type MmoSkillDemoEntityViews = {
  players: Record<string, PlayerEntity>;
  npcs: Record<string, NpcEntity>;
  resources: Record<string, ResourceEntity>;
  loots: Record<string, LootEntity>;
  hazards: Record<string, HazardEntity>;
};

const MMO_SKILL_DEMO_ENTITY_BUCKETS = ["player", "npc", "resource", "loot", "hazard"] as const satisfies readonly MmoSkillDemoEntityKind[];

export type MmoSkillDemoState = {
  tick: number;
  mapRevision: string;
  roomKind: string;
  roomLabel: string;
  activePlayers: number;
  worldEventId: string;
  worldEventName: string;
  worldEventZoneId: ZoneId;
  worldEventPhase: string;
  worldEventObjective: string;
  worldEventProgress: number;
  worldEventGoal: number;
  worldEventTimerMs: number;
  worldEventReward: string;
  effects: CompactTransientEffect[];
  entities: Record<string, MmoSkillDemoEntity>;
} & MmoSkillDemoEntityViews;

export type MmoSkillDemoInput = {
  dx?: number;
  dy?: number;
  action?: MmoSkillDemoAction;
  targetId?: string;
  aimX?: number;
  aimY?: number;
  itemId?: string;
  devField?: string;
  devValue?: number;
  devText?: string;
};

type RuntimeInput = Required<Pick<MmoSkillDemoInput, "dx" | "dy" | "action" | "targetId" | "aimX" | "aimY" | "itemId" | "devField" | "devValue" | "devText">>;

type LogicSpatialEntity = SpatialHashEntity<string> & {
  type: MmoSkillDemoEntityKind;
};

type PublicStaticRecord = {
  entityId: string;
  entityIds?: string[];
  cellKey: string;
  kind: "world-cell-static" | "private-static";
  signature: string;
  segmentId: string;
  staticEntity: ReturnType<typeof toMmoSkillDemoStaticSegmentEntity>;
  staticEntities?: Record<string, ReturnType<typeof toMmoSkillDemoStaticSegmentEntity>>;
  segment?: ReplicationEnvelopeSegment<MmoSkillDemoSegmentKind>;
};

type PublicCellSegmentCache = {
  tick: number;
  top: MmoSegmentTopLevel;
  fullVolatile: boolean;
  publicEntityIdsByCell: Map<string, string[]>;
  volatileBuffersByCell: Map<string, Uint8Array>;
  fullVolatileBuffersByCell: Map<string, Uint8Array>;
  volatileHotRefsByCell: Map<string, SharedCellReplicationEntity[]>;
  sharedCellReplicator?: SharedCellReplicator<MmoSkillDemoSegmentKind>;
  entityCellById: Map<string, string>;
  entityTypeById: Map<string, MmoSkillDemoEntityKind>;
  staticRecordsByEntity: Map<string, PublicStaticRecord>;
  staticRecordsByCell: Map<string, PublicStaticRecord>;
};

type SnapshotCellCache = {
  tick: number;
  publicEntityIdsByCell: Map<string, string[]>;
  publicProjectedById: Map<string, MmoSkillDemoEntity>;
};

type PlayerStaticEntityCursor = {
  status: "sent" | "acked";
  sentAt: number;
  signature: string;
  sequence?: number;
};

type StaticAckRecord = {
  entityId: string;
  signature: string;
};

type StaticDiscoveryQueueItem = {
  entityId: string;
  enqueuedTick: number;
};

type StaticDiscoveryTelemetry = {
  queueDepthByClient: Record<string, number>;
  queueDepth: number;
  maxBacklogAge: number;
  avgTTD: number;
  samples: number;
  maxStaticRecordsPerTick: number;
  adaptiveRecommended: boolean;
};

type MmoSegmentTopLevel = Omit<MmoSkillDemoState, "entities" | "players" | "npcs" | "resources" | "loots" | "hazards" | "effects">;

type ZoneRuntime = {
  grid: InterestIndex;
  interestIds: Set<string>;
  nextInterestIds: Set<string>;
  interestCache: Map<string, InterestEntity>;
  interestScratch: InterestEntity;
  logicHash: SpatialHashIndex<LogicSpatialEntity>;
  logicIds: Set<string>;
  nextLogicIds: Set<string>;
  logicScratch: LogicSpatialEntity[];
  segmentCache?: PublicCellSegmentCache;
  snapshotCellCache?: SnapshotCellCache;
  staticEntitiesByPlayer: Map<string, Map<string, PlayerStaticEntityCursor>>;
  staticDiscoveryQueueByPlayer: Map<string, StaticDiscoveryQueueItem[]>;
  staticAcksByPlayer: Map<string, Map<number, StaticAckRecord[]>>;
  staticSignatureBySegmentId: Map<string, string>;
  staticCellSegmentsBySignature: Map<string, ReplicationEnvelopeSegment<MmoSkillDemoSegmentKind>>;
  volatileCellsByPlayer: Map<string, Set<string>>;
  staticTtdSamples: number[];
  replicationAdaptive?: RoomReplicationTelemetry["adaptive"];
  inputs: Map<string, RuntimeInput>;
  kernel: Promise<CollisionKernel>;
};

const updateNpcScratch: NpcEntity[] = [];
const updateHazardScratch: HazardEntity[] = [];
const updateLootScratch: LootEntity[] = [];

type DirtyReplicationScope = "volatile" | "static" | "both";

type MmoSkillDemoDirtyReplicationRuntime = {
  volatileEntityIds: Set<string>;
  staticEntityIds: Set<string>;
  removedEntityIds: Set<string>;
};

const dirtyReplicationByState = new WeakMap<MmoSkillDemoState, MmoSkillDemoDirtyReplicationRuntime>();

function mmoSkillDemoEnvFlag(name: string, fallback = true) {
  const value = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
  if (value === undefined) return fallback;
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

function snapshotEntitiesOfType<TValue extends MmoSkillDemoEntity>(state: MmoSkillDemoState, entityType: MmoSkillDemoEntityKind, scratch: TValue[]) {
  scratch.length = 0;
  const runtime = sharedHotRuntimeByState.get(state);
  if (runtime && MMO_SKILL_DEMO_COUNTED_INDEX_ENABLED) {
    const index = runtime.indices[entityType];
    const slots = index.slots;
    for (let i = 0, count = index.count; i < count; i += 1) {
      const entity = sharedHotEntityOfTypeAtSlot<TValue>(state, runtime, entityType, slots[i]);
      if (entity) scratch.push(entity);
    }
    return scratch;
  }
  for (const entity of entitiesOfType<TValue>(state, entityType)) scratch.push(entity);
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

type SharedHotEntityIndex = {
  slots: Uint32Array;
  positionsBySlot: Int32Array;
  count: number;
};

type SharedHotEntityFields = {
  x: number;
  y: number;
  hp: number;
  targetId: number;
  action: number;
  combatState: number;
  statusMask: number;
};

type SharedHotEntityMirror = {
  shared: SharedHotEntityFields;
  runtime: MmoSkillDemoSharedHotRuntime;
  slot: number;
  action: MmoSkillDemoAction;
  targetId: string;
  combatState: string;
  combatFlags: string;
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

function ensureEntityType<TType extends MmoSkillDemoEntityKind>(entity: EntityViewTypeMap[TType], entityType: TType): EntityViewTypeMap[TType] {
  (entity as MmoSkillDemoEntity).entityType = entityType;
  return entity;
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
      value: (entity as unknown as Record<string, unknown>)[key]
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
  const value = (entity as { targetId?: unknown }).targetId;
  return typeof value === "string" ? value.slice(0, 32) : "";
}

function sharedHotCombatState(entity: MmoSkillDemoEntity) {
  const value = (entity as { combatState?: unknown }).combatState;
  return typeof value === "string" ? value.slice(0, 32) : "";
}

function sharedHotCombatFlags(entity: MmoSkillDemoEntity) {
  const value = (entity as { combatFlags?: unknown }).combatFlags;
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

function ensureSharedHotEntity(state: MmoSkillDemoState, entity: MmoSkillDemoEntity): MmoSkillDemoEntity {
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

function sharedHotEntityOfTypeAtSlot<TValue extends MmoSkillDemoEntity>(
  state: MmoSkillDemoState,
  runtime: MmoSkillDemoSharedHotRuntime,
  entityType: MmoSkillDemoEntityKind,
  slot: number
) {
  const entity = sharedHotEntityAtSlot(state, runtime, slot);
  return entity?.entityType === entityType ? (entity as TValue) : undefined;
}

function* entitiesOfType<TValue extends MmoSkillDemoEntity>(state: MmoSkillDemoState, entityType: MmoSkillDemoEntityKind): Iterable<TValue> {
  const runtime = sharedHotRuntimeByState.get(state);
  if (runtime) {
    const index = runtime.indices[entityType];
    const slots = MMO_SKILL_DEMO_COUNTED_INDEX_ENABLED ? index.slots : index.slots.subarray(0, index.count);
    const count = MMO_SKILL_DEMO_COUNTED_INDEX_ENABLED ? index.count : slots.length;
    for (let i = 0; i < count; i += 1) {
      const entity = sharedHotEntityOfTypeAtSlot<TValue>(state, runtime, entityType, slots[i]);
      if (entity) yield entity;
    }
    return;
  }
  for (const [, entity] of Object.entries(state.entities ?? {})) {
    if (entity?.entityType === entityType) yield entity as TValue;
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

function migrateLegacyEntityMap<TType extends MmoSkillDemoEntityKind>(
  state: MmoSkillDemoState,
  key: keyof MmoSkillDemoEntityViews,
  entityType: TType
) {
  const raw = (state as unknown as Record<string, unknown>)[key];
  if (!raw || typeof raw !== "object" || entityViewProxies.has(raw)) return;
  for (const [, entity] of Object.entries(raw as Record<string, EntityViewTypeMap[TType]>)) {
    if (entity?.id) state.entities[entity.id] = ensureEntityType(entity, entityType);
  }
}

function createEntityViewMap<TType extends MmoSkillDemoEntityKind>(state: MmoSkillDemoState, entityType: TType, sharedHot: boolean): Record<string, EntityViewTypeMap[TType]> {
  const proxy = new Proxy({} as Record<string, EntityViewTypeMap[TType]>, {
    get(_target, property) {
      if (property === Symbol.iterator) return undefined;
      if (property === "toJSON") return () => Object.fromEntries(Object.entries(proxy));
      const entity = state.entities[String(property)];
      return entity?.entityType === entityType ? entity : undefined;
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
      state.entities[id] = sharedHot ? (ensureSharedHotEntity(state, entity) as EntityViewTypeMap[TType]) : entity;
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

const TILE = mmoSkillDemoRegionConfig.tileSize;
const MAP_WIDTH = mmoSkillDemoRegionConfig.chunkGrid.chunksWide * mmoSkillDemoRegionConfig.chunkGrid.chunkWidth;
const MAP_HEIGHT = mmoSkillDemoRegionConfig.chunkGrid.chunksHigh * mmoSkillDemoRegionConfig.chunkGrid.chunkHeight;
const PLAYER_RADIUS = PLAYER_SIZE.radius;
const PUMMEL_MAX_CHARGE_MS = 2400;
const WHIRLWIND_RADIUS = 101;
const RUSH_DURATION_MS = 5000;
const RUSH_BRAKE_MS = 500;
const BOW_RANGE_SCALE = 0.5;
const BOW_QUICK_RANGE = 700 * BOW_RANGE_SCALE;
const BOW_PRECISION_RANGE = 1300 * BOW_RANGE_SCALE;
const BOW_VOLLEY_RANGE = 700 * BOW_RANGE_SCALE;
const BOW_BOLAS_RANGE = 700 * BOW_RANGE_SCALE;
const BOW_BOLAS_LINK_RANGE = 300 * BOW_RANGE_SCALE;
const BOW_FLURRY_RANGE = 900 * BOW_RANGE_SCALE;
const BOW_FLURRY_VISUAL_STRIDE = 3;
const BOW_ARROW_STORM_RADIUS = 400 * BOW_RANGE_SCALE;
const BOW_DECOY_TAUNT_RANGE = 500 * BOW_RANGE_SCALE;
const BOW_VAULT_RADIUS = 200 * BOW_RANGE_SCALE;
const CALTROPS_MIN_MAX_RANGE = 500 * BOW_RANGE_SCALE;
const CALTROPS_FULL_MAX_RANGE = 1000 * BOW_RANGE_SCALE;
const CALTROPS_HALF_ANGLE = (35 * Math.PI) / 180;
const MAP_REVISION = mmoSkillDemoRegionConfig.revision;

const LEGACY_WORLD_ZONE_IDS = new Set<ZoneId>(["ashwood", "crags", "bazaar", "port-marrow"]);

const FACTION_CATALOG_ZONE_IDS: Record<WorldFactionId, ZoneId> = {
  oakhaven: "ashwood",
  ironcrag: "crags",
  aetheria: "holy-reach",
  "port-marrow": "port-marrow",
  "sunken-bazaar": "canaan-desert",
  "obsidian-sanctum": "void-rift",
  "ashwood-glade": "ashwood-wilderness",
  "high-reach-peaks": "whisperwind-ascent"
};

function catalogZoneForLocation(location: string): ZoneId {
  const key = location.toLowerCase();
  if (key.includes("iron") || key.includes("fissure") || key.includes("vulcan") || key.includes("geode")) return "crags";
  if (key.includes("whisperwind") || key.includes("high-peak") || key.includes("high peak") || key.includes("peak")) return "whisperwind-ascent";
  if (key.includes("aether") || key.includes("holy") || key.includes("reach") || key.includes("cathedral")) return "holy-reach";
  if (key.includes("marrow") || key.includes("reef") || key.includes("sea") || key.includes("dock") || key.includes("graveyard")) return "port-marrow";
  if (key.includes("void") || key.includes("rift") || key.includes("obsidian")) return "void-rift";
  if (key.includes("bazaar") || key.includes("canaan") || key.includes("desert") || key.includes("vault")) return "canaan-desert";
  if (key.includes("dungeon") || key.includes("mirror")) return "dungeon";
  if (key.includes("wilderness") || key.includes("primeval")) return "ashwood-wilderness";
  return "ashwood";
}

function catalogZoneForMaterial(id: string): ZoneId {
  if (id.includes("ironcrag") || id.includes("vulcan") || id.includes("soot") || id.includes("sapper") || id.includes("geologist") || id.includes("fissure")) return "crags";
  if (id.includes("aether") || id.includes("solos") || id.includes("order") || id.includes("inquisition") || id.includes("anointed")) return "holy-reach";
  if (id.includes("marrow") || id.includes("cove") || id.includes("tide") || id.includes("eel") || id.includes("captain")) return "port-marrow";
  if (id.includes("void") || id.includes("nihil") || id.includes("obsidian") || id.includes("abyssal")) return "void-rift";
  if (id.includes("bazaar") || id.includes("dust") || id.includes("syndicate") || id.includes("appraiser") || id.includes("debt")) return "canaan-desert";
  if (id.includes("high-peak") || id.includes("wind") || id.includes("ascetic") || id.includes("monastic") || id.includes("moss")) return "whisperwind-ascent";
  if (id.includes("dungeon") || id.includes("mirror")) return "dungeon";
  if (id.includes("outcast") || id.includes("feral") || id.includes("bramble") || id.includes("timber-goliath")) return "ashwood-wilderness";
  return "ashwood";
}

export const mmoCatalog = {
  zones: [
    { id: "oakhaven", name: "Oakhaven", zoneId: "ashwood", role: "breadbasket", summary: "Southwest starter breadbasket where tool use and first combat open the safe road onward." },
    { id: "ironcrag", name: "Ironcrag", zoneId: "crags", role: "forge", summary: "Northwest mining colony where pickaxes, ore banking, and mountain pressure gate progress." },
    { id: "aetheria", name: "Aetheria", zoneId: "holy-reach", role: "lighthouse", summary: "Eastern holy citadel converting relics, routes, and resources into Void readiness." },
    { id: "overgrown-thicket", name: "The Overgrown Thicket", zoneId: "dungeon", role: "instance", summary: "Oakhaven-side dungeon holding the Nature Core and source of wolf pressure." },
    { id: "deep-fissure", name: "The Deep Fissure", zoneId: "dungeon", role: "instance", summary: "Ironcrag-side dungeon holding Prism Shards for shaft stabilization." },
    { id: "sunken-spire", name: "The Sunken Spire", zoneId: "dungeon", role: "instance", summary: "Aetheria-side flooded library holding Ancient Scripts for Void prep." },
    { id: "void-rift", name: "The Void Rift", zoneId: "void-rift", role: "endgame", summary: "Far northeast world-edge anomaly and elite pressure target." },
    { id: "ashwood", name: "Ashwood Glade", zoneId: "ashwood", role: "starter", summary: "Starter hub edge with tool tutorials, Ash trees, wolves, and basic combat." },
    { id: "ashwood-wilderness", name: "Ashwood Wilderness", zoneId: "ashwood-wilderness", role: "primal", summary: "Primeval Verdant Outcast forest with stronger beasts and strained Oakhaven kinship." },
    { id: "crags", name: "Iron Crags", zoneId: "crags", role: "mining", summary: "Vertical rocky terrain with ore routes, bats, crawlers, and Space-bar movement checks." },
    { id: "holy-reach", name: "Holy Reach", zoneId: "holy-reach", role: "law", summary: "Aetherian white-stone order zone with radiant guards, archives, and Void-prep services." },
    { id: "canaan-desert", name: "Canaan Desert", zoneId: "canaan-desert", role: "trade-ruin", summary: "Dust Syndicate desert approach around the Sunken Bazaar and relic vaults." },
    { id: "whisperwind-ascent", name: "Whisperwind Ascent", zoneId: "whisperwind-ascent", role: "monastery", summary: "High-Reach mountain approach for ascetic training and wind-path traversal." },
    { id: "bazaar", name: "The Sunken Bazaar", zoneId: "bazaar", role: "legacy-elite", summary: "Legacy high-risk zone id preserved for older saves and route compatibility." },
    { id: "port-marrow", name: "Port Marrow", zoneId: "port-marrow", role: "peace", summary: "No-combat hub for trading, banking, quest board, trainers, and travel." },
    { id: "dungeon", name: "Dungeons", zoneId: "dungeon", role: "party-instance", summary: "Temporary room template for boss fights with high-cost, high-reward objectives." },
    { id: "cottage", name: "Player Cottages", zoneId: "cottage", role: "private-instance", summary: "Small private tile-map instance for storage, recovery, and social staging." }
  ],
  worldEvents: [
    { id: "ashwood-pack", name: "Ashwood Pack Rally", zoneId: "ashwood", role: "public-event", summary: "Shared starter event fed by wolf kills and Ash tree cuts." },
    { id: "outcast-hunt", name: "Outcast Hunt", zoneId: "ashwood-wilderness", role: "public-event", summary: "Primeval forest event fed by primal beast kills and Outcast boundary defense." },
    { id: "crag-supply", name: "Crag Supply Rush", zoneId: "crags", role: "public-event", summary: "Mining-route event fed by ore extraction and Crags patrol kills." },
    { id: "holy-purge", name: "Holy Purge", zoneId: "holy-reach", role: "public-event", summary: "Aetherian event fed by automaton, crusader, and radiant-threat control." },
    { id: "bazaar-breach", name: "Bazaar Breach", zoneId: "canaan-desert", role: "public-event", summary: "Elite-zone event fed by survival pressure and high-risk monster kills." },
    { id: "rift-containment", name: "Rift Containment", zoneId: "void-rift", role: "public-event", summary: "Void event fed by rift creature kills and Nihil pressure containment." },
    { id: "wind-trial", name: "Wind Trial", zoneId: "whisperwind-ascent", role: "public-event", summary: "High-Reach event fed by mountain threat clears and movement mastery." },
    { id: "dungeon-surge", name: "Dungeon Surge", zoneId: "dungeon", role: "public-event", summary: "Party-instance event fed by power node and boss progress." },
    { id: "cottage-restock", name: "Cottage Restock", zoneId: "cottage", role: "private-event", summary: "Private-instance event fed by storage and home upkeep interactions." }
  ],
  abilities: [
    { id: "mace-pummel", name: "Pummel", zoneId: "ashwood", role: "LMB", summary: "Starting Mace hold-to-charge cone attack with charge-scaled damage and wall-stun KBM." },
    { id: "mace-crushing-leap", name: "Slam", zoneId: "ashwood", role: "RMB", summary: "Starting Mace i-frame leap into a stunning slam and slowing crater impact." },
    { id: "space-rush", name: "Rush", zoneId: "ashwood", role: "Space", summary: "Universal movement charge with distance-scaled collision damage and KBM." },
    { id: "q-berserk", name: "Berserk", zoneId: "bazaar", role: "Q", summary: "Universal parry stance that negates damage, heals, generates Energy, and triggers Berserk." },
    { id: "mace-rock-smash", name: "Rock Smash", zoneId: "crags", role: "E", summary: "Starting Mace charge projectile that upgrades from one boulder into a recoil-heavy shotgun spread." },
    { id: "mace-whirlwind", name: "Whirlwind", zoneId: "dungeon", role: "R", summary: "Starting Mace Energy ultimate that channels mobile AoE damage through enemy packs." },
    { id: "bow-quick-shot", name: "Quick Shot", zoneId: "ashwood", role: "LMB", summary: "Bow basic arrow for mild first-target damage at mid range." },
    { id: "bow-precision", name: "Precision Shot", zoneId: "ashwood", role: "RMB", summary: "Bow long-range piercing arrow with high damage and strong knockback." },
    { id: "bow-volley", name: "Volley", zoneId: "ashwood", role: "RMB", summary: "Bow fan of seven arrows across a wide arc with repeated-hit falloff." },
    { id: "bow-reposition", name: "Reposition", zoneId: "ashwood", role: "Space", summary: "Bow i-frame dash that empowers the next three Quick Shots." },
    { id: "bow-vault", name: "Vault", zoneId: "ashwood", role: "Space", summary: "Bow backstep i-frame with a 200-range impact burst." },
    { id: "bow-stealth", name: "Stealth", zoneId: "ashwood", role: "Q", summary: "Bow stealth window with decaying movement speed." },
    { id: "bow-decoy", name: "Decoy", zoneId: "ashwood", role: "Q", summary: "Bow dummy that pulls nearby enemies and explodes." },
    { id: "bow-bolas", name: "Bolas", zoneId: "ashwood", role: "E", summary: "Bow bola that slows on single hit or stuns and weakens linked targets." },
    { id: "bow-caltrops", name: "Caltrops", zoneId: "ashwood", role: "E", summary: "Bow charged scatter trap that slows and chips enemies." },
    { id: "bow-flurry", name: "Flurry", zoneId: "ashwood", role: "R", summary: "Bow channel that fires thirty low-knockback long-range arrows." },
    { id: "bow-arrowstorm", name: "Arrow Storm", zoneId: "ashwood", role: "R", summary: "Bow cursor-centered storm that ticks damage and slow." },
    { id: "staff-arcane-bolt", name: "Arcane Bolt", zoneId: "ashwood", role: "LMB", summary: "Staff line bolt with quick cast and first-target impact." },
    { id: "staff-siphon-beam", name: "Siphon Beam", zoneId: "ashwood", role: "LMB", summary: "Staff held tether that ticks damage and self-heal." },
    { id: "staff-meteor", name: "Meteor", zoneId: "ashwood", role: "RMB", summary: "Staff delayed aimed impact with lingering burn ticks." },
    { id: "staff-healing-pulse", name: "Healing Pulse", zoneId: "ashwood", role: "RMB", summary: "Staff aimed burst heal for nearby allies." },
    { id: "staff-frost-chain", name: "Frost Chain", zoneId: "ashwood", role: "RMB", summary: "Staff chained projectile that slows each bounced target." },
    { id: "staff-astral-walk", name: "Astral Walk", zoneId: "ashwood", role: "Space", summary: "Staff teleport that leaves a delayed arcane burst." },
    { id: "staff-zephyr", name: "Zephyr", zoneId: "ashwood", role: "Space", summary: "Staff self wind aura with speed boost and enemy pushback." },
    { id: "staff-ice-wall", name: "Ice Wall", zoneId: "ashwood", role: "Q", summary: "Staff aimed wall visual that blocks hostile projectile hazards and slows crossings." },
    { id: "staff-arcane-bubble", name: "Arcane Bubble", zoneId: "ashwood", role: "Q", summary: "Staff dome that reduces incoming damage during its short active window." },
    { id: "staff-petrify", name: "Petrify", zoneId: "ashwood", role: "Q", summary: "Staff frontal cone shockwave with short stun." },
    { id: "staff-gravity-well", name: "Gravity Well", zoneId: "ashwood", role: "E", summary: "Staff aimed vortex that pulls and ticks damage." },
    { id: "staff-consecration", name: "Consecration", zoneId: "ashwood", role: "E", summary: "Staff aimed sigil that heals allies and damages hostiles." },
    { id: "staff-dispel-nova", name: "Dispel Nova", zoneId: "ashwood", role: "E", summary: "Staff self nova that clears nearby ally debuffs and hostile buffs." },
    { id: "staff-maelstrom", name: "Maelstrom", zoneId: "ashwood", role: "R", summary: "Staff Energy ultimate that channels aimed storm damage." },
    { id: "staff-tranquility", name: "Tranquility", zoneId: "ashwood", role: "R", summary: "Staff Energy ultimate that channels large-area healing." },
    { id: "wand-magic-missile", name: "Magic Missile", zoneId: "ashwood", role: "LMB", summary: "Wand homing dart that favors the aimed target." },
    { id: "wand-hex", name: "Hex", zoneId: "ashwood", role: "LMB", summary: "Wand shadow hit that stacks a short curse for Rupture." },
    { id: "wand-mending-spark", name: "Mending Spark", zoneId: "ashwood", role: "LMB", summary: "Wand hostile spark that bounces into a small ally heal." },
    { id: "wand-focused-ray", name: "Focused Ray", zoneId: "ashwood", role: "RMB", summary: "Wand piercing laser burst." },
    { id: "wand-soul-bind", name: "Soul Bind", zoneId: "ashwood", role: "RMB", summary: "Wand tether that shares damage between two linked hostiles." },
    { id: "wand-flash-heal", name: "Flash Heal", zoneId: "ashwood", role: "RMB", summary: "Wand targeted ally heal with a brief speed bump." },
    { id: "wand-blink", name: "Blink", zoneId: "ashwood", role: "Space", summary: "Wand short teleport." },
    { id: "wand-phase-shift", name: "Phase Shift", zoneId: "ashwood", role: "Space", summary: "Wand short untargetable speed window." },
    { id: "wand-rewind", name: "Rewind", zoneId: "ashwood", role: "Space", summary: "Wand time snap to recent stored position and lost health." },
    { id: "wand-mirror-shield", name: "Mirror Shield", zoneId: "ashwood", role: "Q", summary: "Wand shield that absorbs the next hit and reflects damage." },
    { id: "wand-nightmare", name: "Nightmare", zoneId: "ashwood", role: "Q", summary: "Wand fear cone that pushes and slows targets." },
    { id: "wand-rupture", name: "Rupture", zoneId: "ashwood", role: "E", summary: "Wand curse burst that consumes Hex stacks for bonus damage." },
    { id: "wand-enfeeble", name: "Enfeeble", zoneId: "ashwood", role: "E", summary: "Wand charged pool that weakens hostile outgoing damage." },
    { id: "wand-chaos-volley", name: "Chaos Volley", zoneId: "ashwood", role: "R", summary: "Wand Energy ultimate that fires rapid seeking bolts in a forward arc." },
    { id: "wand-apotheosis", name: "Apotheosis", zoneId: "ashwood", role: "R", summary: "Wand Energy ultimate that buffs an ally with speed and lifesteal." },
    { id: "twin-strike", name: "Twin Strike", zoneId: "ashwood", role: "LMB", summary: "Twin Blades quick double-hit cone basic." },
    { id: "twin-toxic-slash", name: "Toxic Slash", zoneId: "ashwood", role: "LMB", summary: "Twin Blades cone basic that stacks poison." },
    { id: "twin-throwing-dirk", name: "Throwing Dirk", zoneId: "ashwood", role: "LMB", summary: "Twin Blades short line throw that slows the first target." },
    { id: "twin-shadow-lunge", name: "Shadow Lunge", zoneId: "ashwood", role: "RMB", summary: "Twin Blades short dash strike with burst on crossed targets." },
    { id: "twin-exsanguinate", name: "Exsanguinate", zoneId: "ashwood", role: "RMB", summary: "Twin Blades cone finisher that consumes poison stacks for bonus damage." },
    { id: "twin-fan-of-knives", name: "Fan of Knives", zoneId: "ashwood", role: "RMB", summary: "Twin Blades spread throw that marks targets against healing." },
    { id: "twin-swift-step", name: "Swift Step", zoneId: "ashwood", role: "Space", summary: "Twin Blades fast dash that briefly accelerates attacks." },
    { id: "twin-smoke-bomb", name: "Smoke Bomb", zoneId: "ashwood", role: "Space", summary: "Twin Blades smoke burst that grants stealth and blinds nearby enemies." },
    { id: "twin-bloodlust", name: "Bloodlust", zoneId: "ashwood", role: "Space", summary: "Twin Blades self burst for high move and attack speed." },
    { id: "twin-blur", name: "Blur", zoneId: "ashwood", role: "Q", summary: "Twin Blades short invulnerability reset." },
    { id: "twin-vanish", name: "Vanish", zoneId: "ashwood", role: "Q", summary: "Twin Blades true stealth with bonus damage on the next hit." },
    { id: "twin-noxious-flask", name: "Noxious Flask", zoneId: "ashwood", role: "E", summary: "Twin Blades thrown poison pool." },
    { id: "twin-deaths-mark", name: "Death's Mark", zoneId: "ashwood", role: "E", summary: "Twin Blades targeted mark that amplifies incoming damage." },
    { id: "twin-blade-dance", name: "Blade Dance", zoneId: "ashwood", role: "R", summary: "Twin Blades Energy ultimate with mobile AoE slashes and dodge." },
    { id: "twin-assassinate", name: "Assassinate", zoneId: "ashwood", role: "R", summary: "Twin Blades Energy ultimate blink strike with kill refund." },
    { id: "blade-cleave", name: "Cleave", zoneId: "ashwood", role: "LMB", summary: "Blade wide cone basic." },
    { id: "blade-sever", name: "Sever", zoneId: "ashwood", role: "LMB", summary: "Blade cone basic that applies Mortal Wound." },
    { id: "blade-sunder", name: "Sunder", zoneId: "ashwood", role: "LMB", summary: "Blade cone basic that fractures armor." },
    { id: "blade-brutal-strike", name: "Brutal Strike", zoneId: "ashwood", role: "RMB", summary: "Blade heavy cone interrupt." },
    { id: "blade-thrust", name: "Thrust", zoneId: "ashwood", role: "RMB", summary: "Blade fast piercing line stab." },
    { id: "blade-bloodthirst", name: "Bloodthirst", zoneId: "ashwood", role: "RMB", summary: "Blade cone strike that heals from damage dealt." },
    { id: "blade-combat-roll", name: "Combat Roll", zoneId: "ashwood", role: "Space", summary: "Blade invulnerable movement roll." },
    { id: "blade-leap-attack", name: "Leap Attack", zoneId: "ashwood", role: "Space", summary: "Blade leap into landing AoE." },
    { id: "blade-juggernaut", name: "Juggernaut", zoneId: "ashwood", role: "Space", summary: "Blade sprint with slow and root immunity." },
    { id: "blade-riposte", name: "Riposte", zoneId: "ashwood", role: "Q", summary: "Blade parry window with stun counter." },
    { id: "blade-iron-will", name: "Iron Will", zoneId: "ashwood", role: "Q", summary: "Blade control break and short damage reduction." },
    { id: "blade-intimidating-shout", name: "Intimidating Shout", zoneId: "ashwood", role: "E", summary: "Blade shout that weakens nearby enemy outgoing damage." },
    { id: "blade-razor-wind", name: "Razor Wind", zoneId: "ashwood", role: "E", summary: "Blade charged crescent projectile with full-charge slow." },
    { id: "blade-omnislash", name: "Omnislash", zoneId: "ashwood", role: "R", summary: "Blade Energy ultimate that chains invulnerable seeking strikes." },
    { id: "blade-duelists-trance", name: "Duelist's Trance", zoneId: "ashwood", role: "R", summary: "Blade Energy ultimate that accelerates basic cooldown recovery and heals basics." }
  ],
  items: [
    { id: "training-hatchet", name: "Training Hatchet", zoneId: "ashwood", role: "tool", summary: "Starter tool for first Ash tree cuts." },
    { id: "iron-hatchet", name: "Iron Hatchet", zoneId: "ashwood", role: "tool", summary: "Non-stackable tool reward from The First Cut." },
    { id: "pickaxe", name: "Pickaxe", zoneId: "crags", role: "tool", summary: "Foreman purchase required for efficient ore extraction." },
    { id: "glade-berry", name: "Glade Berry", zoneId: "ashwood", role: "consumable", summary: "Stackable heal used automatically when wounded." },
    { id: "cinder-ale", name: "Cinder Ale", zoneId: "port-marrow", role: "consumable", summary: "Stackable mana refill sold by merchants and dungeon drops." },
    { id: "speed-potion", name: "Speed Potion", zoneId: "port-marrow", role: "consumable", summary: "Short burst reward and merchant stock." },
    { id: "leather-boots", name: "Leather Boots", zoneId: "ashwood", role: "gear", summary: "Non-stackable speed gear from starter progression." },
    { id: "mining-boots", name: "Mining Boots", zoneId: "crags", role: "gear", summary: "Non-stackable Heavy Lifting reward for faster movement." },
    { id: "iron-chest", name: "Iron Chest", zoneId: "crags", role: "gear", summary: "Non-stackable damage reduction gear crafted by the blacksmith." },
    { id: "ring-focus", name: "Ring of Focus", zoneId: "bazaar", role: "gear", summary: "Non-stackable cooldown reduction gear from elite farming." },
    { id: "ash-logs", name: "Ash Logs", zoneId: "ashwood", role: "resource", summary: "Stackable crafting and quest resource." },
    { id: "iron-ore", name: "Iron Ore", zoneId: "crags", role: "resource", summary: "Stackable crafting and Foreman quest resource." },
    { id: "silk-thread", name: "Silk Thread", zoneId: "bazaar", role: "resource", summary: "Stackable high-tier crafting drop." },
    { id: "captains-map", name: "The Captain's Map", zoneId: "port-marrow", role: "quest-item", summary: "Non-tradable route unlock from Lost Compass." },
    { id: "cursed-idol", name: "Cursed Idol", zoneId: "bazaar", role: "quest-item", summary: "Non-tradable high-risk quest item from the hidden statue." },
    { id: "broken-hilt", name: "Broken Hilt", zoneId: "dungeon", role: "quest-item", summary: "Non-tradable dungeon component for elite weapon upgrades." },
    { id: "nature-core", name: "Nature Core", zoneId: "dungeon", role: "town-relic", summary: "Oakhaven relic taken from the Overgrown Thicket." },
    { id: "prism-shards", name: "Prism Shards", zoneId: "dungeon", role: "town-relic", summary: "Ironcrag relic extracted from the Deep Fissure." },
    { id: "ancient-scripts", name: "Ancient Scripts", zoneId: "dungeon", role: "town-relic", summary: "Aetheria relic recovered from the Sunken Spire." },
    { id: "void-resistant-cloak", name: "Void-Resistant Cloak", zoneId: "port-marrow", role: "gear", summary: "Alchemist gear for entering the Void Rift." }
  ],
  mobs: [
    { id: "prowling-wolf", name: "Prowling Wolf", zoneId: "ashwood", role: "common", summary: "Fast lunging melee threat." },
    { id: "iron-eye-bat", name: "Iron-Eye Bat", zoneId: "crags", role: "common", summary: "Flying projectile threat that ignores rocky ground checks." },
    { id: "stone-crawler", name: "Stone-Crawler", zoneId: "crags", role: "common", summary: "Slow high-defense melee pressure." },
    { id: "crystal-beetle", name: "Crystal Beetle", zoneId: "crags", role: "common", summary: "Armored charge enemy that asks players to sidestep lanes." },
    { id: "crag-sapper", name: "Crag Sapper", zoneId: "crags", role: "common", summary: "Keeps pressure with delayed blast traps around ore routes." },
    { id: "sand-wraith", name: "Sand-Wraith", zoneId: "bazaar", role: "common", summary: "Disappears while moving and reappears behind players." },
    { id: "cursed-archer", name: "Cursed Archer", zoneId: "bazaar", role: "common", summary: "Persistent ranged kiter." },
    { id: "mire-bomber", name: "Mire Bomber", zoneId: "bazaar", role: "common", summary: "Keeps distance and drops delayed AOE traps." },
    { id: "rune-priest", name: "Rune Priest", zoneId: "bazaar", role: "support", summary: "Heals nearby monsters unless pressured first." },
    { id: "ash-bramble-stalker", name: "Ash Bramble Stalker", zoneId: "ashwood", role: "common", summary: "Ambushes starter paths with root bursts after a short windup." },
    { id: "veil-oracle", name: "Veil Oracle", zoneId: "bazaar", role: "support", summary: "Buffs elite threats and fires thin ruin beams when ignored." },
    { id: "ember-acolyte", name: "Ember Acolyte", zoneId: "dungeon", role: "support", summary: "Dungeon support add that feeds boss pressure." },
    { id: "dungeon-revenant", name: "Dungeon Revenant", zoneId: "dungeon", role: "elite", summary: "Phase-shifting elite add with invulnerability and enraged line attacks." },
    { id: "aggro-tree", name: "Aggro-Tree", zoneId: "ashwood", role: "common", summary: "Immobile AOE slam hazard." },
    { id: "alpha-timberwolf", name: "Alpha Timberwolf", zoneId: "ashwood", role: "elite", summary: "Mini-boss that summons two wolves." },
    { id: "crag-gargoyle", name: "Crag-Gargoyle", zoneId: "crags", role: "elite", summary: "Mini-boss that turns invulnerable on a cycle." },
    { id: "void-sent-sentinel", name: "Void-Sent Sentinel", zoneId: "bazaar", role: "elite", summary: "Mini-boss with a movement-slowing tether." },
    { id: "bazaar-guard", name: "Bazaar Guard", zoneId: "bazaar", role: "elite", summary: "Shielded elite that blocks frontal projectiles." },
    { id: "great-ash-lord", name: "The Great Ash-Lord", zoneId: "dungeon", role: "boss", summary: "Dungeon boss with large AOE burn waves." },
    { id: "iron-core-golem", name: "Iron-Core Golem", zoneId: "dungeon", role: "boss", summary: "Dungeon boss vulnerable only after Power Nodes break." },
    { id: "mirror-king", name: "The Mirror-King", zoneId: "dungeon", role: "boss", summary: "Dungeon boss that clones player abilities." }
  ],
  bestiary: bestiaryDefinitions.map((entry) => ({
    id: entry.id,
    name: entry.name,
    zoneId: entry.zoneId,
    role: entry.role,
    summary: `${entry.personality}: ${entry.mechanics}`
  })),
  npcs: [
    { id: "elder-rowan", name: "Elder Rowan", zoneId: "ashwood", role: "quest", summary: "Starter quest giver and LMB/RMB teacher." },
    { id: "blacksmith-silas", name: "Blacksmith Silas", zoneId: "ashwood", role: "crafting", summary: "Oakhaven smith needing Ironcrag ore for tools." },
    { id: "miller-finn", name: "Miller Finn", zoneId: "ashwood", role: "quest", summary: "Food-supply owner worried about Nature Core corruption." },
    { id: "scout-elara", name: "Scout Elara", zoneId: "ashwood", role: "quest", summary: "Frontier scout tracking the source of wolf pressure." },
    { id: "overseer-bale", name: "Overseer Bale", zoneId: "crags", role: "quest", summary: "Ironcrag leader trading ore output against food shortages." },
    { id: "geologist-mira", name: "Geologist Mira", zoneId: "crags", role: "quest", summary: "Researcher seeking Prism Shards to stabilize shafts." },
    { id: "runner-kael", name: "Runner Kael", zoneId: "crags", role: "travel", summary: "Courier running the dangerous Ironcrag to Aetheria pass." },
    { id: "high-arcanist-vael", name: "High Arcanist Vael", zoneId: "port-marrow", role: "quest", summary: "Aetheria researcher obsessed with historic Void Rift closures." },
    { id: "navigator-kai", name: "Navigator Kai", zoneId: "port-marrow", role: "travel", summary: "Sailor tracking tides caused by the Sunken Spire." },
    { id: "alchemist-zora", name: "Alchemist Zora", zoneId: "port-marrow", role: "merchant", summary: "Essence refiner making Void-resistant gear." },
    { id: "foreman-iron-will", name: "Foreman Iron-Will", zoneId: "crags", role: "trainer", summary: "Sells pickaxes and owns mining quests." },
    { id: "banker-valerius", name: "Banker Valerius", zoneId: "port-marrow", role: "bank", summary: "Global storage access." },
    { id: "merchant-kaya", name: "Merchant Kaya", zoneId: "port-marrow", role: "merchant", summary: "General goods buyer and seller." },
    { id: "master-kael", name: "Master Kael", zoneId: "bazaar", role: "trainer", summary: "Advanced Q-slot trainer." },
    { id: "captain-marrow", name: "Captain Marrow", zoneId: "port-marrow", role: "travel", summary: "Zone-travel and instance-routing NPC." },
    { id: "blacksmith", name: "The Blacksmith", zoneId: "port-marrow", role: "crafting", summary: "Gear upgrades for gold and resources." },
    { id: "apprentice-jinn", name: "Apprentice Jinn", zoneId: "ashwood", role: "merchant", summary: "Basic potion seller." },
    { id: "cursed-statue", name: "Cursed Statue", zoneId: "bazaar", role: "hidden", summary: "Hidden high-risk, high-reward quest source." },
    { id: "innkeeper-martha", name: "Innkeeper Martha", zoneId: "port-marrow", role: "home", summary: "Sets home respawn location." },
    { id: "contract-board", name: "Contract Board", zoneId: "port-marrow", role: "contract", summary: "Repeatable slayer writs for renown, gold, and long-run mastery." }
  ],
  quests: [
    { id: "wolf-pelt-quota", name: "Wolf-Pelt Quota", zoneId: "ashwood", role: "combat", summary: "Collect 10 pelts from the Oakhaven perimeter. Reward: Basic armor." },
    { id: "ironcrag-logistics", name: "Ironcrag Logistics", zoneId: "ashwood", role: "escort", summary: "Escort Oakhaven grain to Ironcrag. Reward: Trusted status." },
    { id: "root-of-the-problem", name: "Root of the Problem", zoneId: "dungeon", role: "boss", summary: "Slay the Thicket Heart in the Overgrown Thicket. Reward: Nature Core." },
    { id: "great-starvation", name: "The Great Starvation", zoneId: "crags", role: "recovery", summary: "Reclaim a hijacked mountain-pass food caravan. Reward: Mining Pick." },
    { id: "luminous-depths", name: "Luminous Depths", zoneId: "dungeon", role: "extraction", summary: "Extract 5 Prism Shards from the Deep Fissure. Reward: Socketed Gem." },
    { id: "coastal-draught", name: "The Coastal Draught", zoneId: "port-marrow", role: "retrieval", summary: "Recover 3 weather charts from the Sunken Spire. Reward: World Map expansion." },
    { id: "forbidden-scripts", name: "Forbidden Scripts", zoneId: "dungeon", role: "retrieval", summary: "Find the Tome of Rifts in the Sunken Spire. Reward: Teleportation access." },
    { id: "void-resistance", name: "Void Resistance", zoneId: "port-marrow", role: "crafting", summary: "Deliver Magic Essence and Salt. Reward: Void-Resistant Cloak." },
    { id: "silent-signal", name: "The Silent Signal", zoneId: "crags", role: "delivery", summary: "Deliver a distress flare to the Oakhaven lighthouse. Reward: Gold." },
    { id: "seal-the-rift", name: "Seal the Rift", zoneId: "dungeon", role: "global", summary: "Collapse the Void Rift after earning all three town relics." },
    { id: "first-cut", name: "The First Cut", zoneId: "ashwood", role: "woodcutting", summary: "Cut 5 Ash trees. Reward: Iron Hatchet." },
    { id: "second-cut", name: "The Second Cut", zoneId: "ashwood", role: "woodcutting", summary: "Stockpile 12 Ash Logs after the first lesson. Reward: Renown and woodcutting XP." },
    { id: "wolf-culling", name: "Wolf Culling", zoneId: "ashwood", role: "combat", summary: "Kill 10 Wolves. Reward: Space Jump." },
    { id: "final-cut", name: "The Final Cut", zoneId: "ashwood", role: "route", summary: "Return after securing Ashwood to earn Captain Marrow's route registration." },
    { id: "hidden-vein", name: "The Hidden Vein", zoneId: "crags", role: "exploration", summary: "Find a secret cave marker for gold." },
    { id: "heavy-lifting", name: "Heavy Lifting", zoneId: "crags", role: "mining", summary: "Deliver 50 Iron Ore. Reward: Mining Boots." },
    { id: "lost-compass", name: "Lost Compass", zoneId: "port-marrow", role: "retrieval", summary: "Retrieve the compass from a wolf den. Reward: World Map." },
    { id: "silent-sands", name: "The Silent Sands", zoneId: "bazaar", role: "survival", summary: "Survive 2 minutes in danger. Reward: Q Stun." },
    { id: "ghostly-trade", name: "Ghostly Trade", zoneId: "bazaar", role: "escort", summary: "Escort an NPC through the ruins. Reward: XP and gold." },
    { id: "breaking-golem", name: "Breaking the Golem", zoneId: "dungeon", role: "boss", summary: "Defeat the Iron-Core Golem. Reward: Elite Weapon." },
    { id: "feathered-pests", name: "Feathered Pests", zoneId: "port-marrow", role: "combat", summary: "Kill 15 Bats near the docks. Reward: Speed Potion x5." },
    { id: "kings-foil", name: "The King's Foil", zoneId: "dungeon", role: "global", summary: "Kill The Mirror-King. Reward: Prestige Title and unique cape." },
    { id: "guild-contracts", name: "Guild Contracts", zoneId: "port-marrow", role: "repeatable", summary: "Repeatable zone contracts that build renown and mastery over long sessions." }
  ],
  factions: worldFactions.map((faction) => ({
    id: faction.id,
    name: `${faction.townName} (${faction.factionName})`,
    zoneId: FACTION_CATALOG_ZONE_IDS[faction.id],
    role: "faction",
    summary: `${faction.ideology} Good means ${faction.definitionOfGood}`
  })),
  expandedCreatures: worldCreatureDefinitions.map((creature) => ({
    id: creature.id,
    name: creature.name,
    zoneId: catalogZoneForLocation(creature.location),
    role: "ecology",
    summary: `${creature.location}: ${creature.ecologyTags.join(", ")}. ${creature.ecologicalNiche} Idle: ${creature.idleBehavior}`
  })),
  reputationRewards: worldReputationRewards.map((reward) => ({
    id: reward.id,
    name: reward.name,
    zoneId: FACTION_CATALOG_ZONE_IDS[reward.factionId],
    role: reward.tier.toLowerCase(),
    summary: `${reward.tier} ${reward.tierLevel} ${reward.factionId}: ${reward.effectSummary}`
  })),
  craftingMaterials: worldCraftingMaterials.map((material) => ({
    id: material.id,
    name: material.name,
    zoneId: catalogZoneForMaterial(material.id),
    role: material.category,
    summary: material.summary
  }))
} satisfies Record<string, MmoCatalogDef[]>;

const RESOURCE_HP = {
  tree: 3,
  ore: 4
} as const;

function resourceHpForKind(kind: WorldGatherableNodeKind, tier = 1) {
  if (kind === "tree" || kind === "ore") return RESOURCE_HP[kind];
  return Math.max(2, Math.min(8, 1 + tier));
}

const ACTION_COOLDOWN_MS = {
  attack: 560,
  mine: 2000,
  woodcut: 2000,
  lmb: 560,
  rmb: 900,
  space: 420,
  q: 850,
  e: 2600,
  r: 0,
  interact: 360,
  travel: 700,
  bank: 500,
  trade: 500,
  "use-item": 280
} as const;

const GATHER_MIN_LEVEL = 1;
const GATHER_MAX_LEVEL = 99;
const GATHER_BASE_COOLDOWN_MS = 2000;
const GATHER_FASTEST_COOLDOWN_MS = 250;

type AbilitySlot = "LMB" | "RMB" | "Space" | "Q" | "E" | "R";
type PlayerAbilityDef = {
  id: string;
  slot: AbilitySlot;
  weaponId: string;
  cooldownMs: number;
  castMs: number;
  energyGain: number;
  name: string;
};

const MAX_ENERGY = 100;
const MACE_WEAPON_ID = "mace";
const BOW_WEAPON_ID = "bow";
const STAFF_WEAPON_ID = "staff";
const WAND_WEAPON_ID = "wand";
const TWIN_BLADES_WEAPON_ID = "twin-blades";
const BLADE_WEAPON_ID = "blade";
const ABILITY_SLOTS = ["LMB", "RMB", "Space", "Q", "E", "R"] as const satisfies readonly AbilitySlot[];
const SLOT_ACTIONS: Record<AbilitySlot, MmoSkillDemoAction> = { LMB: "lmb", RMB: "rmb", Space: "space", Q: "q", E: "e", R: "r" };
const ACTION_TO_SLOT: Partial<Record<MmoSkillDemoAction, AbilitySlot>> = {
  attack: "LMB",
  lmb: "LMB",
  rmb: "RMB",
  space: "Space",
  q: "Q",
  e: "E",
  r: "R"
};

const PLAYER_ABILITY_DEFS = {
  "mace-pummel": { id: "mace-pummel", name: "Pummel", weaponId: MACE_WEAPON_ID, slot: "LMB", cooldownMs: 0, castMs: 350, energyGain: 6 },
  "mace-crushing-leap": { id: "mace-crushing-leap", name: "Slam", weaponId: MACE_WEAPON_ID, slot: "RMB", cooldownMs: 7000, castMs: 100, energyGain: 14 },
  "space-rush": { id: "space-rush", name: "Rush", weaponId: MACE_WEAPON_ID, slot: "Space", cooldownMs: 8000, castMs: 500, energyGain: 10 },
  "q-berserk": { id: "q-berserk", name: "Berserk", weaponId: MACE_WEAPON_ID, slot: "Q", cooldownMs: 10000, castMs: 100, energyGain: 30 },
  "mace-rock-smash": { id: "mace-rock-smash", name: "Boulder", weaponId: MACE_WEAPON_ID, slot: "E", cooldownMs: 6000, castMs: 100, energyGain: 8 },
  "mace-whirlwind": { id: "mace-whirlwind", name: "Whirlwind", weaponId: MACE_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 160, energyGain: 0 },
  "bow-quick-shot": { id: "bow-quick-shot", name: "Quick Shot", weaponId: BOW_WEAPON_ID, slot: "LMB", cooldownMs: 100, castMs: 250, energyGain: 5 },
  "bow-precision": { id: "bow-precision", name: "Precision", weaponId: BOW_WEAPON_ID, slot: "RMB", cooldownMs: 10000, castMs: 1000, energyGain: 14 },
  "bow-volley": { id: "bow-volley", name: "Volley", weaponId: BOW_WEAPON_ID, slot: "RMB", cooldownMs: 5000, castMs: 100, energyGain: 10 },
  "bow-reposition": { id: "bow-reposition", name: "Reposition", weaponId: BOW_WEAPON_ID, slot: "Space", cooldownMs: 7000, castMs: 50, energyGain: 8 },
  "bow-vault": { id: "bow-vault", name: "Vault", weaponId: BOW_WEAPON_ID, slot: "Space", cooldownMs: 15000, castMs: 200, energyGain: 10 },
  "bow-stealth": { id: "bow-stealth", name: "Stealth", weaponId: BOW_WEAPON_ID, slot: "Q", cooldownMs: 20000, castMs: 0, energyGain: 6 },
  "bow-decoy": { id: "bow-decoy", name: "Decoy", weaponId: BOW_WEAPON_ID, slot: "Q", cooldownMs: 15000, castMs: 100, energyGain: 6 },
  "bow-bolas": { id: "bow-bolas", name: "Bolas", weaponId: BOW_WEAPON_ID, slot: "E", cooldownMs: 8000, castMs: 100, energyGain: 9 },
  "bow-caltrops": { id: "bow-caltrops", name: "Caltrops", weaponId: BOW_WEAPON_ID, slot: "E", cooldownMs: 13000, castMs: 100, energyGain: 6 },
  "bow-flurry": { id: "bow-flurry", name: "Flurry", weaponId: BOW_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 250, energyGain: 0 },
  "bow-arrowstorm": { id: "bow-arrowstorm", name: "Arrow Storm", weaponId: BOW_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 250, energyGain: 0 },
  "staff-arcane-bolt": { id: "staff-arcane-bolt", name: "Arcane Bolt", weaponId: STAFF_WEAPON_ID, slot: "LMB", cooldownMs: 0, castMs: 300, energyGain: 5 },
  "staff-siphon-beam": { id: "staff-siphon-beam", name: "Siphon Beam", weaponId: STAFF_WEAPON_ID, slot: "LMB", cooldownMs: 0, castMs: 50, energyGain: 3 },
  "staff-meteor": { id: "staff-meteor", name: "Meteor", weaponId: STAFF_WEAPON_ID, slot: "RMB", cooldownMs: 8000, castMs: 1000, energyGain: 14 },
  "staff-healing-pulse": { id: "staff-healing-pulse", name: "Healing Pulse", weaponId: STAFF_WEAPON_ID, slot: "RMB", cooldownMs: 7000, castMs: 800, energyGain: 8 },
  "staff-frost-chain": { id: "staff-frost-chain", name: "Frost Chain", weaponId: STAFF_WEAPON_ID, slot: "RMB", cooldownMs: 8000, castMs: 400, energyGain: 12 },
  "staff-astral-walk": { id: "staff-astral-walk", name: "Astral Walk", weaponId: STAFF_WEAPON_ID, slot: "Space", cooldownMs: 12000, castMs: 150, energyGain: 9 },
  "staff-zephyr": { id: "staff-zephyr", name: "Zephyr", weaponId: STAFF_WEAPON_ID, slot: "Space", cooldownMs: 10000, castMs: 50, energyGain: 6 },
  "staff-ice-wall": { id: "staff-ice-wall", name: "Ice Wall", weaponId: STAFF_WEAPON_ID, slot: "Q", cooldownMs: 15000, castMs: 300, energyGain: 6 },
  "staff-arcane-bubble": { id: "staff-arcane-bubble", name: "Arcane Bubble", weaponId: STAFF_WEAPON_ID, slot: "Q", cooldownMs: 16000, castMs: 200, energyGain: 6 },
  "staff-petrify": { id: "staff-petrify", name: "Petrify", weaponId: STAFF_WEAPON_ID, slot: "Q", cooldownMs: 14000, castMs: 500, energyGain: 10 },
  "staff-gravity-well": { id: "staff-gravity-well", name: "Gravity Well", weaponId: STAFF_WEAPON_ID, slot: "E", cooldownMs: 12000, castMs: 300, energyGain: 10 },
  "staff-consecration": { id: "staff-consecration", name: "Consecration", weaponId: STAFF_WEAPON_ID, slot: "E", cooldownMs: 14000, castMs: 400, energyGain: 10 },
  "staff-dispel-nova": { id: "staff-dispel-nova", name: "Dispel Nova", weaponId: STAFF_WEAPON_ID, slot: "E", cooldownMs: 12000, castMs: 200, energyGain: 8 },
  "staff-maelstrom": { id: "staff-maelstrom", name: "Maelstrom", weaponId: STAFF_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 500, energyGain: 0 },
  "staff-tranquility": { id: "staff-tranquility", name: "Tranquility", weaponId: STAFF_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 500, energyGain: 0 },
  "wand-magic-missile": { id: "wand-magic-missile", name: "Magic Missile", weaponId: WAND_WEAPON_ID, slot: "LMB", cooldownMs: 200, castMs: 400, energyGain: 4 },
  "wand-hex": { id: "wand-hex", name: "Hex", weaponId: WAND_WEAPON_ID, slot: "LMB", cooldownMs: 0, castMs: 250, energyGain: 4 },
  "wand-mending-spark": { id: "wand-mending-spark", name: "Mending Spark", weaponId: WAND_WEAPON_ID, slot: "LMB", cooldownMs: 200, castMs: 300, energyGain: 4 },
  "wand-focused-ray": { id: "wand-focused-ray", name: "Focused Ray", weaponId: WAND_WEAPON_ID, slot: "RMB", cooldownMs: 7000, castMs: 200, energyGain: 13 },
  "wand-soul-bind": { id: "wand-soul-bind", name: "Soul Bind", weaponId: WAND_WEAPON_ID, slot: "RMB", cooldownMs: 10000, castMs: 300, energyGain: 8 },
  "wand-flash-heal": { id: "wand-flash-heal", name: "Flash Heal", weaponId: WAND_WEAPON_ID, slot: "RMB", cooldownMs: 6000, castMs: 400, energyGain: 6 },
  "wand-blink": { id: "wand-blink", name: "Blink", weaponId: WAND_WEAPON_ID, slot: "Space", cooldownMs: 8000, castMs: 50, energyGain: 5 },
  "wand-phase-shift": { id: "wand-phase-shift", name: "Phase Shift", weaponId: WAND_WEAPON_ID, slot: "Space", cooldownMs: 13000, castMs: 50, energyGain: 6 },
  "wand-rewind": { id: "wand-rewind", name: "Rewind", weaponId: WAND_WEAPON_ID, slot: "Space", cooldownMs: 18000, castMs: 50, energyGain: 8 },
  "wand-mirror-shield": { id: "wand-mirror-shield", name: "Mirror Shield", weaponId: WAND_WEAPON_ID, slot: "Q", cooldownMs: 12000, castMs: 100, energyGain: 8 },
  "wand-nightmare": { id: "wand-nightmare", name: "Nightmare", weaponId: WAND_WEAPON_ID, slot: "Q", cooldownMs: 15000, castMs: 300, energyGain: 9 },
  "wand-rupture": { id: "wand-rupture", name: "Rupture", weaponId: WAND_WEAPON_ID, slot: "E", cooldownMs: 8000, castMs: 200, energyGain: 10 },
  "wand-enfeeble": { id: "wand-enfeeble", name: "Enfeeble", weaponId: WAND_WEAPON_ID, slot: "E", cooldownMs: 12000, castMs: 100, energyGain: 8 },
  "wand-chaos-volley": { id: "wand-chaos-volley", name: "Chaos Volley", weaponId: WAND_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 200, energyGain: 0 },
  "wand-apotheosis": { id: "wand-apotheosis", name: "Apotheosis", weaponId: WAND_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 200, energyGain: 0 },
  "twin-strike": { id: "twin-strike", name: "Twin Strike", weaponId: TWIN_BLADES_WEAPON_ID, slot: "LMB", cooldownMs: 0, castMs: 200, energyGain: 5 },
  "twin-toxic-slash": { id: "twin-toxic-slash", name: "Toxic Slash", weaponId: TWIN_BLADES_WEAPON_ID, slot: "LMB", cooldownMs: 0, castMs: 250, energyGain: 5 },
  "twin-throwing-dirk": { id: "twin-throwing-dirk", name: "Throwing Dirk", weaponId: TWIN_BLADES_WEAPON_ID, slot: "LMB", cooldownMs: 0, castMs: 250, energyGain: 5 },
  "twin-shadow-lunge": { id: "twin-shadow-lunge", name: "Shadow Lunge", weaponId: TWIN_BLADES_WEAPON_ID, slot: "RMB", cooldownMs: 6000, castMs: 150, energyGain: 12 },
  "twin-exsanguinate": { id: "twin-exsanguinate", name: "Exsanguinate", weaponId: TWIN_BLADES_WEAPON_ID, slot: "RMB", cooldownMs: 8000, castMs: 250, energyGain: 12 },
  "twin-fan-of-knives": { id: "twin-fan-of-knives", name: "Fan of Knives", weaponId: TWIN_BLADES_WEAPON_ID, slot: "RMB", cooldownMs: 5250, castMs: 150, energyGain: 10 },
  "twin-swift-step": { id: "twin-swift-step", name: "Swift Step", weaponId: TWIN_BLADES_WEAPON_ID, slot: "Space", cooldownMs: 8000, castMs: 50, energyGain: 8 },
  "twin-smoke-bomb": { id: "twin-smoke-bomb", name: "Smoke Bomb", weaponId: TWIN_BLADES_WEAPON_ID, slot: "Space", cooldownMs: 12000, castMs: 100, energyGain: 8 },
  "twin-bloodlust": { id: "twin-bloodlust", name: "Bloodlust", weaponId: TWIN_BLADES_WEAPON_ID, slot: "Space", cooldownMs: 14000, castMs: 0, energyGain: 8 },
  "twin-blur": { id: "twin-blur", name: "Blur", weaponId: TWIN_BLADES_WEAPON_ID, slot: "Q", cooldownMs: 10000, castMs: 0, energyGain: 8 },
  "twin-vanish": { id: "twin-vanish", name: "Vanish", weaponId: TWIN_BLADES_WEAPON_ID, slot: "Q", cooldownMs: 15000, castMs: 150, energyGain: 8 },
  "twin-noxious-flask": { id: "twin-noxious-flask", name: "Noxious Flask", weaponId: TWIN_BLADES_WEAPON_ID, slot: "E", cooldownMs: 11000, castMs: 250, energyGain: 10 },
  "twin-deaths-mark": { id: "twin-deaths-mark", name: "Death's Mark", weaponId: TWIN_BLADES_WEAPON_ID, slot: "E", cooldownMs: 14000, castMs: 100, energyGain: 10 },
  "twin-blade-dance": { id: "twin-blade-dance", name: "Blade Dance", weaponId: TWIN_BLADES_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 200, energyGain: 0 },
  "twin-assassinate": { id: "twin-assassinate", name: "Assassinate", weaponId: TWIN_BLADES_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 350, energyGain: 0 },
  "blade-cleave": { id: "blade-cleave", name: "Cleave", weaponId: BLADE_WEAPON_ID, slot: "LMB", cooldownMs: 0, castMs: 350, energyGain: 6 },
  "blade-sever": { id: "blade-sever", name: "Sever", weaponId: BLADE_WEAPON_ID, slot: "LMB", cooldownMs: 0, castMs: 350, energyGain: 6 },
  "blade-sunder": { id: "blade-sunder", name: "Sunder", weaponId: BLADE_WEAPON_ID, slot: "LMB", cooldownMs: 0, castMs: 400, energyGain: 6 },
  "blade-brutal-strike": { id: "blade-brutal-strike", name: "Brutal Strike", weaponId: BLADE_WEAPON_ID, slot: "RMB", cooldownMs: 6000, castMs: 450, energyGain: 12 },
  "blade-thrust": { id: "blade-thrust", name: "Thrust", weaponId: BLADE_WEAPON_ID, slot: "RMB", cooldownMs: 7000, castMs: 200, energyGain: 10 },
  "blade-bloodthirst": { id: "blade-bloodthirst", name: "Bloodthirst", weaponId: BLADE_WEAPON_ID, slot: "RMB", cooldownMs: 8000, castMs: 300, energyGain: 10 },
  "blade-combat-roll": { id: "blade-combat-roll", name: "Combat Roll", weaponId: BLADE_WEAPON_ID, slot: "Space", cooldownMs: 7000, castMs: 50, energyGain: 8 },
  "blade-leap-attack": { id: "blade-leap-attack", name: "Leap Attack", weaponId: BLADE_WEAPON_ID, slot: "Space", cooldownMs: 10000, castMs: 200, energyGain: 10 },
  "blade-juggernaut": { id: "blade-juggernaut", name: "Juggernaut", weaponId: BLADE_WEAPON_ID, slot: "Space", cooldownMs: 14000, castMs: 100, energyGain: 8 },
  "blade-riposte": { id: "blade-riposte", name: "Riposte", weaponId: BLADE_WEAPON_ID, slot: "Q", cooldownMs: 8000, castMs: 100, energyGain: 12 },
  "blade-iron-will": { id: "blade-iron-will", name: "Iron Will", weaponId: BLADE_WEAPON_ID, slot: "Q", cooldownMs: 15000, castMs: 0, energyGain: 8 },
  "blade-intimidating-shout": { id: "blade-intimidating-shout", name: "Intimidating Shout", weaponId: BLADE_WEAPON_ID, slot: "E", cooldownMs: 14000, castMs: 250, energyGain: 10 },
  "blade-razor-wind": { id: "blade-razor-wind", name: "Razor Wind", weaponId: BLADE_WEAPON_ID, slot: "E", cooldownMs: 12000, castMs: 200, energyGain: 10 },
  "blade-omnislash": { id: "blade-omnislash", name: "Omnislash", weaponId: BLADE_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 200, energyGain: 0 },
  "blade-duelists-trance": { id: "blade-duelists-trance", name: "Duelist's Trance", weaponId: BLADE_WEAPON_ID, slot: "R", cooldownMs: 0, castMs: 300, energyGain: 0 }
} as const satisfies Record<string, PlayerAbilityDef>;

type PlayerDashSpec = {
  rangePmsps: number;
  durationMs: number;
  effectKind?: string;
};

type MeleeDashAbilityId =
  | "twin-strike"
  | "twin-toxic-slash"
  | "twin-shadow-lunge"
  | "twin-exsanguinate"
  | "twin-assassinate"
  | "blade-cleave"
  | "blade-sever"
  | "blade-sunder"
  | "blade-brutal-strike"
  | "blade-thrust"
  | "blade-bloodthirst";

const MELEE_PREFIRE_DASHES = {
  "twin-strike": { rangePmsps: 0.15, durationMs: 100 },
  "twin-toxic-slash": { rangePmsps: 0.15, durationMs: 100 },
  "twin-shadow-lunge": { rangePmsps: 1.25, durationMs: 150 },
  "twin-exsanguinate": { rangePmsps: 0.22, durationMs: 150 },
  "twin-assassinate": { rangePmsps: 3.2, durationMs: 200 },
  "blade-cleave": { rangePmsps: 0.1, durationMs: 150 },
  "blade-sever": { rangePmsps: 0.1, durationMs: 150 },
  "blade-sunder": { rangePmsps: 0.1, durationMs: 150 },
  "blade-brutal-strike": { rangePmsps: 0.45, durationMs: 200 },
  "blade-thrust": { rangePmsps: 1.45, durationMs: 250 },
  "blade-bloodthirst": { rangePmsps: 0.3, durationMs: 150 }
} as const satisfies Record<MeleeDashAbilityId, PlayerDashSpec>;

type MovementDashAbilityId = "bow-reposition" | "bow-vault" | "blade-combat-roll" | "blade-leap-attack";

const MOVEMENT_DASHES = {
  "bow-reposition": { rangePmsps: 1.4, durationMs: 250, effectKind: "rushdust" },
  "bow-vault": { rangePmsps: 0.85, durationMs: 250, effectKind: "rushdust" },
  "blade-combat-roll": { rangePmsps: 1.6, durationMs: 300, effectKind: "rushdust" },
  "blade-leap-attack": { rangePmsps: 2.15, durationMs: 400, effectKind: "dust" }
} as const satisfies Record<MovementDashAbilityId, PlayerDashSpec>;

const WEAPON_LOADOUTS = {
  mace: {
    id: MACE_WEAPON_ID,
    name: "Mace",
    slots: {
      LMB: "mace-pummel",
      RMB: "mace-crushing-leap",
      Space: "space-rush",
      Q: "q-berserk",
      E: "mace-rock-smash",
      R: "mace-whirlwind"
    },
    options: {
      LMB: ["mace-pummel"],
      RMB: ["mace-crushing-leap"],
      Space: ["space-rush"],
      Q: ["q-berserk"],
      E: ["mace-rock-smash"],
      R: ["mace-whirlwind"]
    }
  },
  bow: {
    id: BOW_WEAPON_ID,
    name: "Bow",
    slots: {
      LMB: "bow-quick-shot",
      RMB: "bow-precision",
      Space: "bow-reposition",
      Q: "bow-stealth",
      E: "bow-bolas",
      R: "bow-flurry"
    },
    options: {
      LMB: ["bow-quick-shot"],
      RMB: ["bow-precision", "bow-volley"],
      Space: ["bow-reposition", "bow-vault"],
      Q: ["bow-stealth", "bow-decoy"],
      E: ["bow-bolas", "bow-caltrops"],
      R: ["bow-flurry", "bow-arrowstorm"]
    }
  },
  staff: {
    id: STAFF_WEAPON_ID,
    name: "Staff",
    slots: {
      LMB: "staff-arcane-bolt",
      RMB: "staff-meteor",
      Space: "staff-astral-walk",
      Q: "staff-ice-wall",
      E: "staff-gravity-well",
      R: "staff-maelstrom"
    },
    options: {
      LMB: ["staff-arcane-bolt", "staff-siphon-beam"],
      RMB: ["staff-meteor", "staff-healing-pulse", "staff-frost-chain"],
      Space: ["staff-astral-walk", "staff-zephyr"],
      Q: ["staff-ice-wall", "staff-arcane-bubble", "staff-petrify"],
      E: ["staff-gravity-well", "staff-consecration", "staff-dispel-nova"],
      R: ["staff-maelstrom", "staff-tranquility"]
    }
  },
  wand: {
    id: WAND_WEAPON_ID,
    name: "Wand",
    slots: {
      LMB: "wand-magic-missile",
      RMB: "wand-focused-ray",
      Space: "wand-blink",
      Q: "wand-mirror-shield",
      E: "wand-rupture",
      R: "wand-chaos-volley"
    },
    options: {
      LMB: ["wand-magic-missile", "wand-hex", "wand-mending-spark"],
      RMB: ["wand-focused-ray", "wand-soul-bind", "wand-flash-heal"],
      Space: ["wand-blink", "wand-phase-shift", "wand-rewind"],
      Q: ["wand-mirror-shield", "wand-nightmare"],
      E: ["wand-rupture", "wand-enfeeble"],
      R: ["wand-chaos-volley", "wand-apotheosis"]
    }
  },
  "twin-blades": {
    id: TWIN_BLADES_WEAPON_ID,
    name: "Twin Blades",
    slots: {
      LMB: "twin-strike",
      RMB: "twin-shadow-lunge",
      Space: "twin-swift-step",
      Q: "twin-blur",
      E: "twin-noxious-flask",
      R: "twin-blade-dance"
    },
    options: {
      LMB: ["twin-strike", "twin-toxic-slash", "twin-throwing-dirk"],
      RMB: ["twin-shadow-lunge", "twin-exsanguinate", "twin-fan-of-knives"],
      Space: ["twin-swift-step", "twin-smoke-bomb", "twin-bloodlust"],
      Q: ["twin-blur", "twin-vanish"],
      E: ["twin-noxious-flask", "twin-deaths-mark"],
      R: ["twin-blade-dance", "twin-assassinate"]
    }
  },
  blade: {
    id: BLADE_WEAPON_ID,
    name: "Blade",
    slots: {
      LMB: "blade-cleave",
      RMB: "blade-brutal-strike",
      Space: "blade-combat-roll",
      Q: "blade-riposte",
      E: "blade-intimidating-shout",
      R: "blade-omnislash"
    },
    options: {
      LMB: ["blade-cleave", "blade-sever", "blade-sunder"],
      RMB: ["blade-brutal-strike", "blade-thrust", "blade-bloodthirst"],
      Space: ["blade-combat-roll", "blade-leap-attack", "blade-juggernaut"],
      Q: ["blade-riposte", "blade-iron-will"],
      E: ["blade-intimidating-shout", "blade-razor-wind"],
      R: ["blade-omnislash", "blade-duelists-trance"]
    }
  }
} as const satisfies Record<string, { id: string; name: string; slots: Partial<Record<AbilitySlot, keyof typeof PLAYER_ABILITY_DEFS>>; options: Partial<Record<AbilitySlot, readonly (keyof typeof PLAYER_ABILITY_DEFS)[]>> }>;

export const playerAbilityMetadata: Record<string, { id: string; name: string; slot: AbilitySlot; weaponId: string; cooldownMs: number; castMs: number }> = Object.fromEntries(
  Object.values(PLAYER_ABILITY_DEFS).map((ability) => [
    ability.id,
    {
      id: ability.id,
      name: ability.name,
      slot: ability.slot,
      weaponId: ability.weaponId,
      cooldownMs: ability.cooldownMs,
      castMs: ability.castMs
    }
  ])
);

export const weaponMetadata = {
  [MACE_WEAPON_ID]: { id: MACE_WEAPON_ID, name: "Mace" },
  [BOW_WEAPON_ID]: { id: BOW_WEAPON_ID, name: "Bow" },
  [STAFF_WEAPON_ID]: { id: STAFF_WEAPON_ID, name: "Staff" },
  [WAND_WEAPON_ID]: { id: WAND_WEAPON_ID, name: "Wand" },
  [TWIN_BLADES_WEAPON_ID]: { id: TWIN_BLADES_WEAPON_ID, name: "Twin Blades" },
  [BLADE_WEAPON_ID]: { id: BLADE_WEAPON_ID, name: "Blade" }
} as const;

const NPC_ROLES: Record<string, string> = {
  "elder-rowan": "quest",
  "blacksmith-silas": "crafting",
  "miller-finn": "quest",
  "scout-elara": "quest",
  "overseer-bale": "quest",
  "geologist-mira": "quest",
  "runner-kael": "travel",
  "high-arcanist-vael": "quest",
  "navigator-kai": "travel",
  "alchemist-zora": "merchant",
  "foreman-iron-will": "trainer",
  "banker-valerius": "bank",
  "merchant-kaya": "merchant",
  "broker-rex": "merchant",
  "merchant-lynd": "merchant",
  "appraiser-chloe": "merchant",
  "master-kael": "trainer",
  "inquisitor-joran": "quest",
  "purifier-sarah": "quest",
  "shaman-corvus": "quest",
  "hunter-keera": "quest",
  "thorne-the-wild": "trainer",
  "monastic-scholar-jin": "quest",
  "guardian-tariq": "trainer",
  "acolyte-lyros": "quest",
  "captain-marrow": "travel",
  "contract-board": "contract",
  blacksmith: "crafting",
  "apprentice-jinn": "merchant",
  "cursed-statue": "hidden",
  "innkeeper-martha": "home",
  "power-node": "boss-node",
  "spore-pod": "boss-node",
  "glass-clone": "boss-node",
  "prowling-wolf": "mob",
  "iron-eye-bat": "mob",
  "stone-crawler": "mob",
  "crystal-beetle": "mob",
  "crag-sapper": "mob",
  "sand-wraith": "mob",
  "cursed-archer": "mob",
  "mire-bomber": "mob",
  "rune-priest": "mob",
  "ash-bramble-stalker": "mob",
  "veil-oracle": "mob",
  "ember-acolyte": "mob",
  "dungeon-revenant": "elite",
  "aggro-tree": "mob",
  "alpha-timberwolf": "elite",
  "crag-gargoyle": "elite",
  "void-sent-sentinel": "elite",
  "bazaar-guard": "elite",
  "great-ash-lord": "boss",
  "iron-core-golem": "boss",
  "mirror-king": "boss"
};

const PEACE_NPC_ROLES = new Set<string>(["quest", "trainer", "bank", "merchant", "travel", "contract", "crafting", "hidden", "home"]);

type ContractDef = {
  id: string;
  name: string;
  minRank: number;
  targetKills: number;
  targetKinds: readonly string[];
  gold: number;
  renown: number;
  combatXp: number;
  supplies?: Record<string, number>;
};

type WorldEventDef = {
  id: string;
  name: string;
  zoneId: ZoneId;
  goal: number;
  durationMs: number;
  restMs: number;
  objective: string;
  rewardText: string;
  gold: number;
  renown: number;
  xpSkill: SkillName;
  xp: number;
  supplies?: Record<string, number>;
};

type LootDropDef = {
  itemId: string;
  amount: number;
  chance?: number;
};

type LootTableDef = {
  base: readonly LootDropDef[];
  bonus?: readonly LootDropDef[];
};

const CONTRACTS = [
  {
    id: "ashwood-hunt",
    name: "Ashwood Hunt",
    minRank: 1,
    targetKills: 12,
    targetKinds: ["prowling-wolf", "alpha-timberwolf", "aggro-tree", "ash-bramble-stalker"],
    gold: 42,
    renown: 55,
    combatXp: 72,
    supplies: { gladeBerries: 2 }
  },
  {
    id: "crag-patrol",
    name: "Crag Patrol",
    minRank: 2,
    targetKills: 10,
    targetKinds: ["iron-eye-bat", "stone-crawler", "crystal-beetle", "crag-sapper", "crag-gargoyle"],
    gold: 58,
    renown: 80,
    combatXp: 96,
    supplies: { ironOre: 4 }
  },
  {
    id: "bazaar-sweep",
    name: "Bazaar Sweep",
    minRank: 3,
    targetKills: 9,
    targetKinds: ["sand-wraith", "cursed-archer", "mire-bomber", "rune-priest", "veil-oracle", "void-sent-sentinel", "bazaar-guard"],
    gold: 86,
    renown: 120,
    combatXp: 140,
    supplies: { silkThread: 2, cinderAle: 1 }
  },
  {
    id: "dungeon-writ",
    name: "Dungeon Writ",
    minRank: 4,
    targetKills: 1,
    targetKinds: ["great-ash-lord", "iron-core-golem", "mirror-king", "dungeon-revenant"],
    gold: 160,
    renown: 210,
    combatXp: 220,
    supplies: { cinderAle: 2, speedPotions: 2 }
  }
] as const satisfies readonly ContractDef[];

const NPC_LOOT_TABLES: Record<string, LootTableDef> = {
  "prowling-wolf": {
    base: [
      { itemId: "gold", amount: 3 },
      { itemId: "glade-berry", amount: 1, chance: 0.35 }
    ]
  },
  "ash-bramble-stalker": {
    base: [
      { itemId: "gold", amount: 5 },
      { itemId: "ash-logs", amount: 2 },
      { itemId: "glade-berry", amount: 1, chance: 0.5 }
    ]
  },
  "aggro-tree": {
    base: [
      { itemId: "gold", amount: 4 },
      { itemId: "ash-logs", amount: 3 }
    ]
  },
  "alpha-timberwolf": {
    base: [
      { itemId: "gold", amount: 18 },
      { itemId: "glade-berry", amount: 3 }
    ],
    bonus: [{ itemId: "leather-boots", amount: 1 }]
  },
  "iron-eye-bat": {
    base: [
      { itemId: "gold", amount: 4 },
      { itemId: "speed-potion", amount: 1, chance: 0.25 }
    ]
  },
  "stone-crawler": {
    base: [
      { itemId: "gold", amount: 5 },
      { itemId: "iron-ore", amount: 2 }
    ]
  },
  "crystal-beetle": {
    base: [
      { itemId: "gold", amount: 6 },
      { itemId: "iron-ore", amount: 3 }
    ]
  },
  "crag-sapper": {
    base: [
      { itemId: "gold", amount: 7 },
      { itemId: "iron-ore", amount: 2 },
      { itemId: "speed-potion", amount: 1, chance: 0.5 }
    ]
  },
  "crag-gargoyle": {
    base: [
      { itemId: "gold", amount: 22 },
      { itemId: "iron-ore", amount: 6 }
    ],
    bonus: [{ itemId: "iron-chest", amount: 1 }]
  },
  "sand-wraith": {
    base: [
      { itemId: "gold", amount: 8 },
      { itemId: "silk-thread", amount: 1 }
    ]
  },
  "cursed-archer": {
    base: [
      { itemId: "gold", amount: 8 },
      { itemId: "silk-thread", amount: 1 }
    ]
  },
  "mire-bomber": {
    base: [
      { itemId: "gold", amount: 9 },
      { itemId: "speed-potion", amount: 1 }
    ]
  },
  "rune-priest": {
    base: [
      { itemId: "gold", amount: 10 },
      { itemId: "cinder-ale", amount: 1 }
    ]
  },
  "veil-oracle": {
    base: [
      { itemId: "gold", amount: 12 },
      { itemId: "silk-thread", amount: 2 },
      { itemId: "cinder-ale", amount: 1, chance: 0.5 }
    ]
  },
  "void-sent-sentinel": {
    base: [
      { itemId: "gold", amount: 26 },
      { itemId: "silk-thread", amount: 3 }
    ],
    bonus: [{ itemId: "ring-focus", amount: 1 }]
  },
  "bazaar-guard": {
    base: [
      { itemId: "gold", amount: 24 },
      { itemId: "silk-thread", amount: 2 }
    ],
    bonus: [{ itemId: "ring-focus", amount: 1 }]
  },
  "ember-acolyte": {
    base: [
      { itemId: "gold", amount: 12 },
      { itemId: "cinder-ale", amount: 1 }
    ]
  },
  "dungeon-revenant": {
    base: [
      { itemId: "gold", amount: 28 },
      { itemId: "cinder-ale", amount: 1 },
      { itemId: "broken-hilt", amount: 1, chance: 0.25 }
    ]
  },
  "great-ash-lord": {
    base: [
      { itemId: "gold", amount: 80 },
      { itemId: "cinder-ale", amount: 2 }
    ]
  },
  "iron-core-golem": {
    base: [
      { itemId: "gold", amount: 92 },
      { itemId: "iron-ore", amount: 10 }
    ],
    bonus: [
      { itemId: "broken-hilt", amount: 1 },
      { itemId: "elite-weapon", amount: 1 }
    ]
  },
  "mirror-king": {
    base: [
      { itemId: "gold", amount: 110 },
      { itemId: "silk-thread", amount: 4 }
    ],
    bonus: [{ itemId: "unique-cape", amount: 1 }]
  }
};

const WORLD_EVENTS = [
  {
    id: "ashwood-pack",
    name: "Ashwood Pack Rally",
    zoneId: "ashwood",
    goal: 12,
    durationMs: 180000,
    restMs: 14000,
    objective: "Cull wolves or finish Ashwood cuts before the pack regroups.",
    rewardText: "+18 gold +28 renown +combat XP",
    gold: 18,
    renown: 28,
    xpSkill: "combat",
    xp: 34,
    supplies: { gladeBerries: 1 }
  },
  {
    id: "outcast-hunt",
    name: "Outcast Hunt",
    zoneId: "ashwood",
    goal: 8,
    durationMs: 170000,
    restMs: 14000,
    objective: "Cull primeval beasts before the Verdant Outcasts lose the hunting line.",
    rewardText: "+22 gold +34 renown +combat XP",
    gold: 22,
    renown: 34,
    xpSkill: "combat",
    xp: 44,
    supplies: { "outcast-hunt-skull": 1 }
  },
  {
    id: "crag-supply",
    name: "Crag Supply Rush",
    zoneId: "crags",
    goal: 10,
    durationMs: 180000,
    restMs: 14000,
    objective: "Mine ore or clear Crag threats to open a safe supply route.",
    rewardText: "+24 gold +36 renown +mining XP",
    gold: 24,
    renown: 36,
    xpSkill: "mining",
    xp: 42,
    supplies: { ironOre: 2 }
  },
  {
    id: "holy-purge",
    name: "Holy Purge",
    zoneId: "port-marrow",
    goal: 8,
    durationMs: 170000,
    restMs: 15000,
    objective: "Break rogue radiant patrols and recover sealed script fragments.",
    rewardText: "+28 gold +42 renown +combat XP",
    gold: 28,
    renown: 42,
    xpSkill: "combat",
    xp: 54,
    supplies: { "ancient-script-scroll": 1 }
  },
  {
    id: "bazaar-breach",
    name: "Bazaar Breach",
    zoneId: "canaan-desert",
    goal: 8,
    durationMs: 160000,
    restMs: 16000,
    objective: "Defeat Bazaar elites or survive the ruins while pressure is high.",
    rewardText: "+38 gold +52 renown +combat XP",
    gold: 38,
    renown: 52,
    xpSkill: "combat",
    xp: 62,
    supplies: { cinderAle: 1, silkThread: 1 }
  },
  {
    id: "rift-containment",
    name: "Rift Containment",
    zoneId: "bazaar",
    goal: 6,
    durationMs: 150000,
    restMs: 18000,
    objective: "Clear Void creatures before the rift pressure spills into the trade roads.",
    rewardText: "+42 gold +58 renown +combat XP",
    gold: 42,
    renown: 58,
    xpSkill: "combat",
    xp: 70,
    supplies: { "nihil-ash-sludge": 1, "void-seed-shell": 1 }
  },
  {
    id: "wind-trial",
    name: "Wind Trial",
    zoneId: "port-marrow",
    goal: 7,
    durationMs: 170000,
    restMs: 15000,
    objective: "Clear the high paths and prove steady motion through mountain pressure.",
    rewardText: "+26 gold +44 renown +combat XP",
    gold: 26,
    renown: 44,
    xpSkill: "combat",
    xp: 52,
    supplies: { "ascetic-jade-stone": 1 }
  },
  {
    id: "dungeon-surge",
    name: "Dungeon Surge",
    zoneId: "dungeon",
    goal: 3,
    durationMs: 240000,
    restMs: 18000,
    objective: "Break power nodes and defeat bosses before the instance stabilizes.",
    rewardText: "+70 gold +90 renown +combat XP",
    gold: 70,
    renown: 90,
    xpSkill: "combat",
    xp: 110,
    supplies: { cinderAle: 2, speedPotions: 1 }
  },
  {
    id: "cottage-restock",
    name: "Cottage Restock",
    zoneId: "cottage",
    goal: 3,
    durationMs: 180000,
    restMs: 12000,
    objective: "Use cottage storage or home services to restock the private instance.",
    rewardText: "+10 gold +14 renown +wood XP",
    gold: 10,
    renown: 14,
    xpSkill: "woodcutting",
    xp: 20,
    supplies: { gladeBerries: 2 }
  }
] as const satisfies readonly WorldEventDef[];

const CONTRACT_FACTION_REWARDS: Record<string, { factionId: WorldFactionId; rep: number; supplies?: Record<string, number> }> = {
  "ashwood-hunt": { factionId: "oakhaven", rep: 12, supplies: { "concord-oak-leaf": 1, "wolf-hide-strip": 1 } },
  "crag-patrol": { factionId: "ironcrag", rep: 14, supplies: { "guild-copper-token": 1, "fine-coal-lump": 1 } },
  "bazaar-sweep": { factionId: "sunken-bazaar", rep: 16, supplies: { "syndicate-debt-note": 1, "bazaar-glass-bottle": 1 } },
  "dungeon-writ": { factionId: "aetheria", rep: 20, supplies: { "ancient-script-scroll": 1, "dungeon-lock-grate": 1 } }
};

const WORLD_EVENT_FACTION_REWARDS: Record<string, { factionId: WorldFactionId; rep: number; supplies?: Record<string, number> }> = {
  "ashwood-pack": { factionId: "oakhaven", rep: 8, supplies: { "concord-oak-leaf": 1, "oakhaven-softwood": 1 } },
  "outcast-hunt": { factionId: "ashwood-glade", rep: 10, supplies: { "outcast-hunt-skull": 1, "feral-blood-vial": 1 } },
  "crag-supply": { factionId: "ironcrag", rep: 10, supplies: { "guild-copper-token": 1, "dull-tin-flake": 1 } },
  "holy-purge": { factionId: "aetheria", rep: 12, supplies: { "inquisition-sealing-wax": 1, "ancient-script-scroll": 1 } },
  "bazaar-breach": { factionId: "sunken-bazaar", rep: 12, supplies: { "syndicate-debt-note": 1, "spun-spider-silk": 1 } },
  "rift-containment": { factionId: "obsidian-sanctum", rep: 13, supplies: { "nihil-ash-sludge": 1, "void-seed-shell": 1 } },
  "wind-trial": { factionId: "high-reach-peaks", rep: 11, supplies: { "ascetic-jade-stone": 1, "monastic-sage-tea": 1 } },
  "dungeon-surge": { factionId: "aetheria", rep: 14, supplies: { "ancient-script-scroll": 1, "mirror-mirror-segment": 1 } },
  "cottage-restock": { factionId: "port-marrow", rep: 6, supplies: { "cove-salvage-box": 1 } }
};

const NPC_MATERIAL_REWARDS: Record<string, { factionId: WorldFactionId; rep: number; drops: readonly LootDropDef[] }> = {
  "prowling-wolf": { factionId: "oakhaven", rep: 1, drops: [{ itemId: "wolf-tooth", amount: 1 }, { itemId: "wolf-hide-strip", amount: 1, chance: 0.35 }] },
  "ash-bramble-stalker": { factionId: "ashwood-glade", rep: 2, drops: [{ itemId: "bramble-thorn-vine", amount: 1 }, { itemId: "scythe-seed-claws", amount: 1, chance: 0.45 }] },
  "aggro-tree": { factionId: "oakhaven", rep: 1, drops: [{ itemId: "ashwood-heartwood", amount: 1 }, { itemId: "dry-bramble-branch", amount: 1 }] },
  "alpha-timberwolf": { factionId: "ashwood-glade", rep: 6, drops: [{ itemId: "wolf-hide-strip", amount: 2 }, { itemId: "outcast-hunt-skull", amount: 1 }] },
  "iron-eye-bat": { factionId: "ironcrag", rep: 1, drops: [{ itemId: "bat-wing-membrane", amount: 1 }, { itemId: "calamity-talon", amount: 1, chance: 0.2 }] },
  "stone-crawler": { factionId: "ironcrag", rep: 2, drops: [{ itemId: "crawler-chitin-block", amount: 1 }, { itemId: "ironcrag-slate", amount: 1, chance: 0.5 }] },
  "crystal-beetle": { factionId: "ironcrag", rep: 2, drops: [{ itemId: "prism-crystal-shards", amount: 1 }, { itemId: "deep-geode-cluster", amount: 1, chance: 0.4 }] },
  "crag-sapper": { factionId: "ironcrag", rep: 2, drops: [{ itemId: "sapper-dynamite-fuse", amount: 1 }, { itemId: "sulphur-flake", amount: 1 }] },
  "crag-gargoyle": { factionId: "ironcrag", rep: 7, drops: [{ itemId: "gargoyle-heart-core", amount: 1 }, { itemId: "gargoyle-dust-pile", amount: 2 }] },
  "sand-wraith": { factionId: "sunken-bazaar", rep: 2, drops: [{ itemId: "wraith-essence-residue", amount: 1 }, { itemId: "spun-spider-silk", amount: 1, chance: 0.3 }] },
  "cursed-archer": { factionId: "sunken-bazaar", rep: 2, drops: [{ itemId: "grave-bone-plate", amount: 1 }, { itemId: "spun-spider-silk", amount: 1, chance: 0.4 }] },
  "mire-bomber": { factionId: "sunken-bazaar", rep: 2, drops: [{ itemId: "desert-cactus-pulp", amount: 1 }, { itemId: "bazaar-glass-bottle", amount: 1, chance: 0.25 }] },
  "rune-priest": { factionId: "aetheria", rep: 2, drops: [{ itemId: "anointed-candle-core", amount: 1 }, { itemId: "ancient-script-scroll", amount: 1, chance: 0.25 }] },
  "veil-oracle": { factionId: "obsidian-sanctum", rep: 3, drops: [{ itemId: "cursed-oracle-tongue", amount: 1 }, { itemId: "nihil-ash-sludge", amount: 1, chance: 0.35 }] },
  "void-sent-sentinel": { factionId: "obsidian-sanctum", rep: 8, drops: [{ itemId: "pure-void-tear", amount: 1 }, { itemId: "void-seed-shell", amount: 1 }] },
  "bazaar-guard": { factionId: "sunken-bazaar", rep: 6, drops: [{ itemId: "syndicate-debt-note", amount: 1 }, { itemId: "sun-seared-leather", amount: 1 }] },
  "ember-acolyte": { factionId: "aetheria", rep: 2, drops: [{ itemId: "solos-emblem", amount: 1, chance: 0.25 }, { itemId: "anointed-candle-core", amount: 1 }] },
  "dungeon-revenant": { factionId: "obsidian-sanctum", rep: 8, drops: [{ itemId: "dungeon-lock-grate", amount: 1 }, { itemId: "nihil-ash-sludge", amount: 1 }] },
  "great-ash-lord": { factionId: "oakhaven", rep: 14, drops: [{ itemId: "druidic-seed-pod", amount: 1 }, { itemId: "timber-goliath-sapwood", amount: 1 }] },
  "iron-core-golem": { factionId: "ironcrag", rep: 16, drops: [{ itemId: "vulcan-core-spark", amount: 1 }, { itemId: "prism-shard-ingot", amount: 1 }] },
  "mirror-king": { factionId: "aetheria", rep: 16, drops: [{ itemId: "mirror-shatter-shard", amount: 1 }, { itemId: "ancient-script-scroll", amount: 1 }] }
};

const TREE_GATHER_MATERIALS = ["oakhaven-softwood", "soft-pine-bark", "oak-sap-extract", "dry-bramble-branch", "bright-clover-flower", "wild-oats-bundle", "bitter-root-herb"] as const;
const ORE_GATHER_MATERIALS = ["dull-tin-flake", "copper-dust", "fine-coal-lump", "porous-sandstone", "ironcrag-slate", "deep-geode-cluster"] as const;

const EXPANDED_CREATURE_SIGNATURE_DROPS: Record<string, LootDropDef> = {
  "gloom-weaver-spider": { itemId: "spun-spider-silk", amount: 1 },
  "soot-crab": { itemId: "soot-crab-carapace", amount: 1 },
  "void-leper": { itemId: "nihil-ash-sludge", amount: 1 },
  "grave-stalker": { itemId: "grave-dust-pile", amount: 1 },
  "rift-leech": { itemId: "void-seed-shell", amount: 1 },
  "spire-sentinel": { itemId: "aether-brass-ingot", amount: 1 },
  "bramble-beast": { itemId: "bramble-thorn-vine", amount: 1 },
  "fissure-skitterer": { itemId: "crawler-chitin-block", amount: 1 },
  "rust-biter": { itemId: "rust-biter-acid", amount: 1 },
  "tallow-wraith": { itemId: "tallow-wraith-wax", amount: 1 },
  "tide-stalker": { itemId: "tide-stalker-scale", amount: 1 },
  "calamity-bat": { itemId: "calamity-talon", amount: 1 },
  "timber-goliath": { itemId: "timber-goliath-sapwood", amount: 1 },
  "crystalline-strider": { itemId: "mirror-mirror-segment", amount: 1 },
  "aether-drifter": { itemId: "solos-emblem", amount: 1 },
  "void-gargoyle": { itemId: "gargoyle-heart-core", amount: 1 },
  "ashwood-alpha": { itemId: "outcast-hunt-skull", amount: 1 },
  "sapper-goblin": { itemId: "sapper-dynamite-fuse", amount: 1 },
  "ruins-archer": { itemId: "grave-bone-plate", amount: 1 },
  "marrow-cove-rat": { itemId: "scavenger-bone-shard", amount: 1 },
  "void-crawler": { itemId: "void-crawler-mandible", amount: 1 },
  "anointed-crusader": { itemId: "anointed-candle-core", amount: 1 },
  "prism-golem": { itemId: "prism-crystal-shards", amount: 2 },
  "abyssal-eel": { itemId: "eel-venom-sac", amount: 1 },
  "spore-pod": { itemId: "spore-dust-cloud", amount: 1 },
  "cursed-oracle": { itemId: "cursed-oracle-tongue", amount: 1 },
  "dungeon-harvester": { itemId: "dungeon-lock-grate", amount: 1 },
  "high-peak-eagle": { itemId: "high-peak-feather", amount: 1 },
  "moss-grizzly": { itemId: "moss-bear-claws", amount: 1 },
  "scavenger-jackal": { itemId: "scavenger-bone-shard", amount: 1 },
  "lava-spit-slime": { itemId: "lava-spit-core", amount: 1 },
  "void-amalgam": { itemId: "pure-void-tear", amount: 1 }
};

const EXPANDED_CREATURE_ZONE_REWARDS: Partial<Record<ZoneId, { factionId: WorldFactionId; drops: readonly LootDropDef[] }>> = {
  ashwood: { factionId: "oakhaven", drops: [{ itemId: "oakhaven-softwood", amount: 1 }, { itemId: "bright-clover-flower", amount: 1, chance: 0.25 }] },
  "ashwood-wilderness": { factionId: "ashwood-glade", drops: [{ itemId: "feral-blood-vial", amount: 1, chance: 0.35 }, { itemId: "outcast-hunt-skull", amount: 1, chance: 0.2 }] },
  crags: { factionId: "ironcrag", drops: [{ itemId: "ironcrag-slate", amount: 1 }, { itemId: "sulphur-flake", amount: 1, chance: 0.3 }] },
  "holy-reach": { factionId: "aetheria", drops: [{ itemId: "anointed-candle-core", amount: 1 }, { itemId: "inquisition-sealing-wax", amount: 1, chance: 0.25 }] },
  "port-marrow": { factionId: "port-marrow", drops: [{ itemId: "washed-sea-shell", amount: 1 }, { itemId: "cove-salvage-box", amount: 1, chance: 0.2 }] },
  "canaan-desert": { factionId: "sunken-bazaar", drops: [{ itemId: "desert-cactus-pulp", amount: 1 }, { itemId: "syndicate-debt-note", amount: 1, chance: 0.25 }] },
  "void-rift": { factionId: "obsidian-sanctum", drops: [{ itemId: "nihil-ash-sludge", amount: 1 }, { itemId: "void-seed-shell", amount: 1, chance: 0.35 }] },
  "whisperwind-ascent": { factionId: "high-reach-peaks", drops: [{ itemId: "ascetic-jade-stone", amount: 1, chance: 0.3 }, { itemId: "monastic-sage-tea", amount: 1, chance: 0.2 }] },
  dungeon: { factionId: "aetheria", drops: [{ itemId: "dungeon-lock-grate", amount: 1 }, { itemId: "mirror-mirror-segment", amount: 1, chance: 0.25 }] }
};

const FOREMAN_CRAFT_RECIPES: readonly WorldCraftRecipe[] = [
  { id: "smelt-refined-iron", costs: { "iron-ore": 4, "fine-coal-lump": 1 }, goldCost: 2, outputItemId: "refined-iron-ingot", factionId: "ironcrag", rep: 2 },
  { id: "press-prism-ingot", costs: { "prism-crystal-shards": 3, "refined-iron-ingot": 1 }, goldCost: 6, outputItemId: "prism-shard-ingot", factionId: "ironcrag", rep: 3 }
];

const BLACKSMITH_CRAFT_RECIPES: readonly WorldCraftRecipe[] = [
  { id: "forge-iron-chest", costs: { "refined-iron-ingot": 2, "crawler-chitin-block": 1 }, goldCost: 12, outputItemId: "iron-chest", equip: true, unique: true, factionId: "ironcrag", rep: 5 },
  { id: "set-ring-focus", costs: { "prism-crystal-shards": 2, "ancient-script-scroll": 1 }, goldCost: 18, outputItemId: "ring-focus", equip: true, unique: true, factionId: "aetheria", rep: 4 },
  { id: "rebuild-elite-weapon", costs: { "broken-hilt": 1, "prism-shard-ingot": 1, "vulcan-core-spark": 1 }, goldCost: 35, outputItemId: "elite-weapon", unique: true, factionId: "ironcrag", rep: 8 }
];

const ALCHEMIST_CRAFT_RECIPES: readonly WorldCraftRecipe[] = [
  { id: "brew-speed-potions", costs: { "bright-clover-flower": 1, "desert-cactus-pulp": 1 }, goldCost: 2, outputItemId: "speed-potion", outputAmount: 2, factionId: "port-marrow", rep: 2 },
  { id: "brew-cinder-ale", costs: { "wild-oats-bundle": 1, "bitter-root-herb": 1 }, goldCost: 2, outputItemId: "cinder-ale", outputAmount: 2, factionId: "port-marrow", rep: 2 },
  { id: "weave-void-cloak", costs: { "spun-spider-silk": 1, "pure-void-tear": 1, "nihil-ash-sludge": 1 }, goldCost: 12, outputItemId: "void-resistant-cloak", unique: true, factionId: "obsidian-sanctum", rep: 6, questFlag: "void-resistance" }
];

const MERCHANT_CRAFT_RECIPES: readonly WorldCraftRecipe[] = [
  { id: "cash-syndicate-note", costs: { "syndicate-debt-note": 1 }, goldReward: 24, factionId: "sunken-bazaar", rep: 3 },
  { id: "appraise-bazaar-glass", costs: { "bazaar-glass-bottle": 1 }, goldReward: 18, outputItemId: "speed-potion", outputAmount: 1, factionId: "sunken-bazaar", rep: 3 },
  { id: "open-cove-salvage", costs: { "cove-salvage-box": 1 }, goldReward: 8, outputItemId: "cinder-ale", outputAmount: 1, factionId: "port-marrow", rep: 2 }
];

const CURSED_STATUE_CRAFT_RECIPES: readonly WorldCraftRecipe[] = [
  { id: "distill-void-tear", costs: { "nihil-ash-sludge": 1, "void-seed-shell": 1 }, goldCost: 5, hpCost: 20, outputItemId: "pure-void-tear", factionId: "obsidian-sanctum", rep: 7 },
  { id: "bind-cursed-idol", costs: { "pure-void-tear": 1 }, goldCost: 15, hpCost: 20, outputItemId: "cursed-idol", unique: true, factionId: "obsidian-sanctum", rep: 8, questFlag: "cursed-statue" }
];

export type MarketTradeItem = {
  itemId: string;
  price: number;
  sellPrice: number;
  unique?: boolean;
};

export const MARKET_TRADE_ITEMS: Record<string, MarketTradeItem> = {
  "glade-berries": { itemId: "glade-berries", price: 6, sellPrice: 2 },
  "cinder-ale": { itemId: "cinder-ale", price: 8, sellPrice: 3 },
  "speed-potion": { itemId: "speed-potion", price: 14, sellPrice: 5 },
  pickaxe: { itemId: "pickaxe", price: 12, sellPrice: 5, unique: true },
  "iron-ore": { itemId: "iron-ore", price: 5, sellPrice: 2 },
  "ash-logs": { itemId: "ash-logs", price: 4, sellPrice: 1 },
  "silk-thread": { itemId: "silk-thread", price: 16, sellPrice: 6 },
  "ring-focus": { itemId: "ring-focus", price: 70, sellPrice: 22, unique: true },
  "iron-chest": { itemId: "iron-chest", price: 55, sellPrice: 18, unique: true },
  "void-resistant-cloak": { itemId: "void-resistant-cloak", price: 85, sellPrice: 28, unique: true }
};

const runtimeByRoom = new Map<string, ZoneRuntime>();

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function u16Ms(value: number) {
  return Math.max(0, Math.min(65535, Math.floor(Number.isFinite(value) ? value : 0)));
}

function u32Ms(value: number) {
  return Math.max(0, Math.min(0xffffffff, Math.floor(Number.isFinite(value) ? value : 0)));
}

function extendU16Ms(value: number, amount: number) {
  return u16Ms((Number.isFinite(value) ? value : 0) + amount);
}

const REPLICATED_U16_ENTITY_FIELDS = [
  "hp", "maxHp", "mana", "maxMana", "energy", "maxEnergy", "combatLevel", "miningLevel", "woodcuttingLevel",
  "masteryRank", "contractKills", "contractStreak", "dailyQuestStep", "dailyQuestProgress", "wolfKills", "batKills", "dungeonBossKills", "escortMs",
  "guardMs", "berserkMs", "cooldownMs", "activeMs", "activeDurationMs", "chargeMs", "rushDistance", "abilityTickMs",
  "knockbackMs", "stunMs", "slowMs", "iframeMs", "castMs", "damageAmpMs", "visibleCount",
  "attackCooldownMs", "projectileCooldownMs", "phaseMs", "amount", "expiresMs", "pickupRadius", "radius", "windupMs",
  "lifetimeMs", "damage", "pulse", "materialId"
] as const;
const REPLICATED_U32_ENTITY_FIELDS = ["combatXp", "miningXp", "woodcuttingXp", "gold", "renown", "contractCooldownMs", "bazaarSurvivalMs", "respawnMs"] as const;
const REPLICATED_U16_MAP_FIELDS = ["inventory", "bank", "cooldowns"] as const;

function u32Value(value: unknown) {
  return u32Ms(typeof value === "number" ? value : 0);
}

function sanitizeU16Map(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  let next: Record<string, number> | undefined;
  for (const [key, raw] of Object.entries(source)) {
    const sanitized = u16Ms(typeof raw === "number" ? raw : 0);
    if (sanitized !== raw) {
      next ??= Object.fromEntries(Object.entries(source).map(([entryKey, entryValue]) => [entryKey, typeof entryValue === "number" ? entryValue : 0]));
      next[key] = sanitized;
    }
  }
  return next ?? source;
}

function sanitizeEffectForReplication(effect: CompactTransientEffect) {
  let next: CompactTransientEffect | undefined;
  const set = <K extends keyof CompactTransientEffect>(key: K, value: CompactTransientEffect[K]) => {
    if (!next) next = { ...effect };
    next[key] = value;
  };
  for (const key of ["radius", "ageMs", "lifetimeMs", "pulse", "priority"] as const) {
    const sanitized = u16Ms(effect[key]);
    if (sanitized !== effect[key]) set(key, sanitized);
  }
  return next ?? effect;
}

function sanitizeEntityForReplication<T extends MmoSkillDemoEntity>(entity: T): T {
  const record = entity as MmoSkillDemoEntity & Record<string, unknown>;
  let next: (MmoSkillDemoEntity & Record<string, unknown>) | undefined;
  const set = (key: string, value: unknown) => {
    if (!next) next = { ...record } as MmoSkillDemoEntity & Record<string, unknown>;
    next[key] = value;
  };
  for (const key of REPLICATED_U16_ENTITY_FIELDS) {
    if (!(key in record)) continue;
    const sanitized = u16Ms(typeof record[key] === "number" ? record[key] : 0);
    if (sanitized !== record[key]) set(key, sanitized);
  }
  for (const key of REPLICATED_U32_ENTITY_FIELDS) {
    if (!(key in record)) continue;
    const sanitized = u32Value(record[key]);
    if (sanitized !== record[key]) set(key, sanitized);
  }
  for (const key of REPLICATED_U16_MAP_FIELDS) {
    if (!(key in record)) continue;
    const sanitized = sanitizeU16Map(record[key]);
    if (sanitized !== record[key]) set(key, sanitized);
  }
  return (next ?? entity) as T;
}

function sanitizeMmoReplicationSnapshot(state: MmoSkillDemoState) {
  let next: MmoSkillDemoState | undefined;
  const patch = <K extends keyof MmoSkillDemoState>(key: K, value: MmoSkillDemoState[K]) => {
    if (!next) next = { ...state };
    next[key] = value;
  };
  const sanitizedTick = u32Value(state.tick);
  if (sanitizedTick !== state.tick) patch("tick", sanitizedTick);
  for (const key of ["activePlayers", "worldEventProgress", "worldEventGoal"] as const) {
    const sanitized = u16Ms(state[key]);
    if (sanitized !== state[key]) patch(key, sanitized);
  }
  const sanitizedTimer = u32Value(Math.ceil(Math.max(0, state.worldEventTimerMs) / 1000) * 1000);
  if (sanitizedTimer !== state.worldEventTimerMs) patch("worldEventTimerMs", sanitizedTimer);

  let entities: Record<string, MmoSkillDemoEntity> | undefined;
  for (const [id, entity] of Object.entries(state.entities ?? {})) {
    const sanitized = sanitizeEntityForReplication(entity);
    if (sanitized !== entity) {
      entities ??= { ...state.entities };
      entities[id] = sanitized;
    }
  }
  if (entities) patch("entities", entities);

  let effects: CompactTransientEffect[] | undefined;
  for (let index = 0; index < state.effects.length; index += 1) {
    const sanitized = sanitizeEffectForReplication(state.effects[index]);
    if (sanitized !== state.effects[index]) {
      effects ??= state.effects.slice();
      effects[index] = sanitized;
    }
  }
  if (effects) patch("effects", effects);
  return attachMmoEntityViews(next ?? state);
}

const EMPTY_NUMBER_MAP = Object.freeze({}) as Record<string, number>;
const EMPTY_STRING_MAP = Object.freeze({}) as Record<string, string>;
const EMPTY_BOOLEAN_MAP = Object.freeze({}) as Record<string, boolean>;

function elapsedReplicationMs(value: number | undefined, stepMs: number) {
  return u16Ms(Math.floor((value ?? 0) / stepMs) * stepMs);
}

function remainingReplicationMs(value: number | undefined, stepMs: number) {
  const numeric = value ?? 0;
  return numeric <= 0 ? 0 : u16Ms(Math.ceil(numeric / stepMs) * stepMs);
}

function remainingReplicationMs32(value: number | undefined, stepMs: number) {
  const numeric = value ?? 0;
  return numeric <= 0 ? 0 : u32Ms(Math.ceil(numeric / stepMs) * stepMs);
}

function projectRemotePlayerForReplication(player: PlayerEntity): PlayerEntity {
  return {
    ...player,
    mana: 0,
    maxMana: 0,
    energy: 0,
    maxEnergy: 100,
    combatXp: 0,
    miningXp: 0,
    miningLevel: 0,
    woodcuttingXp: 0,
    woodcuttingLevel: 0,
    gold: 0,
    renown: 0,
    contractId: "",
    contractKills: 0,
    contractStreak: 0,
    contractCooldownMs: 0,
    inventory: EMPTY_NUMBER_MAP,
    bank: EMPTY_NUMBER_MAP,
    equipment: EMPTY_STRING_MAP,
    abilitySlots: EMPTY_STRING_MAP,
    cooldowns: EMPTY_NUMBER_MAP,
    questFlags: EMPTY_BOOLEAN_MAP,
    activeQuestId: "",
    wolfKills: 0,
    batKills: 0,
    bazaarSurvivalMs: 0,
    dungeonBossKills: 0,
    homeZoneId: player.zoneId,
    escortNpcId: "",
    escortTargetX: 0,
    escortTargetY: 0,
    escortTargetZoneId: player.zoneId,
    escortMs: 0,
    instanceId: "",
    guardMs: remainingReplicationMs(player.guardMs, 100),
    berserkMs: remainingReplicationMs(player.berserkMs, 100),
    cooldownMs: 0,
    activeMs: elapsedReplicationMs(player.activeMs, 100),
    chargeMs: elapsedReplicationMs(player.chargeMs, 100),
    rushDistance: player.activeAbility === "space-rush" ? elapsedReplicationMs(player.rushDistance, 16) : 0,
    abilityTickMs: 0,
    abilityHits: "",
    knockbackMs: 0,
    knockbackHeavy: false,
    stunMs: remainingReplicationMs(player.stunMs, 100),
    slowMs: 0,
    iframeMs: remainingReplicationMs(player.iframeMs, 100),
    castMs: remainingReplicationMs(player.castMs, 100),
    damageAmpMs: 0,
    combatFlags: "",
    lastAttackStyle: ""
  };
}

function projectNpcForReplication(npc: NpcEntity): NpcEntity {
  return {
    ...npc,
    spawnX: 0,
    spawnY: 0,
    personality: "passive",
    knockbackModifier: 0,
    respawnMs: remainingReplicationMs32(npc.respawnMs, 500),
    attackCooldownMs: remainingReplicationMs(npc.attackCooldownMs, 250),
    projectileCooldownMs: remainingReplicationMs(npc.projectileCooldownMs, 250),
    phaseMs: elapsedReplicationMs(npc.phaseMs, 200),
    summonedBy: "",
    knockbackMs: 0,
    knockbackHeavy: false,
    stunMs: remainingReplicationMs(npc.stunMs, 100),
    slowMs: remainingReplicationMs(npc.slowMs, 250),
    iframeMs: remainingReplicationMs(npc.iframeMs, 100),
    castMs: remainingReplicationMs(npc.castMs, 100),
    damageAmpMs: remainingReplicationMs(npc.damageAmpMs, 250),
    lastAttackStyle: ""
  };
}

function projectMmoEntityForViewer(entity: PlayerEntity, viewerId: string): PlayerEntity;
function projectMmoEntityForViewer(entity: MmoSkillDemoEntity, viewerId: string): MmoSkillDemoEntity | undefined;
function projectMmoEntityForViewer(entity: MmoSkillDemoEntity, viewerId: string): MmoSkillDemoEntity | undefined {
  if (entity.entityType === "player") return entity.id === viewerId ? entity : projectRemotePlayerForReplication(entity);
  if (entity.entityType === "npc") return projectNpcForReplication(entity);
  if (entity.entityType === "loot" && entity.ownerId && entity.ownerId !== viewerId) return undefined;
  return entity;
}

function normalizeAxis(value: number | undefined) {
  return clamp(Number.isFinite(value) ? Number(value) : 0, -1, 1);
}

function normalizeWorldCoord(value: number | undefined, fallback: number, max: number) {
  return clamp(Number.isFinite(value) ? Number(value) : fallback, 0, max);
}

function cleanInputText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/[^\w ,.':-]/g, "").slice(0, maxLength) : "";
}

function cleanItemId(value: unknown) {
  return typeof value === "string" ? value.replace(/[^\w-]/g, "").slice(0, 32) : "";
}

function validAction(action: unknown): MmoSkillDemoAction {
  return action === "attack" ||
    action === "mine" ||
    action === "woodcut" ||
    action === "lmb" ||
    action === "rmb" ||
    action === "space" ||
    action === "q" ||
    action === "e" ||
    action === "r" ||
    action === "interact" ||
    action === "travel" ||
    action === "bank" ||
    action === "trade" ||
    action === "use-item" ||
    action === "config" ||
    action === "dev"
    ? action
    : "idle";
}

function expandedZoneForTile(tx: number, ty: number): ZoneId | undefined {
  if (tx >= 576) return "void-rift";
  if (tx >= 448) return "canaan-desert";
  if (tx >= 384 && tx < 448) return "whisperwind-ascent";
  if (tx >= 288 && tx < 384) return "holy-reach";
  if (tx >= 144 && tx < 192) return "ashwood-wilderness";
  const highReach = getMmoSkillDemoAnchorTile("high-reach-peaks");
  if (Math.abs(tx - highReach.x) <= 16 && Math.abs(ty - highReach.y) <= 16) return "whisperwind-ascent";
  const ashwoodWilderness = getMmoSkillDemoAnchorTile("ashwood-glade");
  if (Math.abs(tx - ashwoodWilderness.x) <= 20 && Math.abs(ty - ashwoodWilderness.y) <= 20) return "ashwood-wilderness";
  return undefined;
}

function zoneSchemaAlias(zoneId: ZoneId): ZoneId {
  if (zoneId === "holy-reach" || zoneId === "whisperwind-ascent") return "port-marrow";
  if (zoneId === "canaan-desert" || zoneId === "void-rift") return "bazaar";
  if (zoneId === "ashwood-wilderness") return "ashwood";
  return zoneId;
}

function logicalZoneForPoint(x: number, y: number): ZoneId {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  const expandedZone = expandedZoneForTile(tx, ty);
  if (expandedZone) return expandedZone;
  return zoneForMmoSkillDemoTile(tx, ty) as ZoneId;
}

function zoneForPoint(x: number, y: number): ZoneId {
  return zoneSchemaAlias(logicalZoneForPoint(x, y));
}

const ITEM_ALIASES: Record<string, string> = {
  "glade-berry": "glade-berries",
  "glade-berries": "glade-berries",
  "speed-potions": "speed-potion",
  "speed-potion": "speed-potion",
  ashLogs: "ash-logs",
  ironOre: "iron-ore",
  silkThread: "silk-thread",
  gladeBerries: "glade-berries",
  cinderAle: "cinder-ale",
  speedPotions: "speed-potion"
};

const mmoInventory = createMmoInventoryOps({ aliases: ITEM_ALIASES, maxStack: 999999 });

const ABILITY_SLOT_BY_ID: Record<string, string> = {
  "mace-pummel": "LMB",
  "mace-crushing-leap": "RMB",
  "mace-rock-smash": "E",
  "mace-whirlwind": "R",
  "bow-quick-shot": "LMB",
  "bow-precision": "RMB",
  "bow-volley": "RMB",
  "bow-reposition": "Space",
  "bow-vault": "Space",
  "bow-stealth": "Q",
  "bow-decoy": "Q",
  "bow-bolas": "E",
  "bow-caltrops": "E",
  "bow-flurry": "R",
  "bow-arrowstorm": "R",
  "staff-arcane-bolt": "LMB",
  "staff-siphon-beam": "LMB",
  "staff-meteor": "RMB",
  "staff-healing-pulse": "RMB",
  "staff-frost-chain": "RMB",
  "staff-astral-walk": "Space",
  "staff-zephyr": "Space",
  "staff-ice-wall": "Q",
  "staff-arcane-bubble": "Q",
  "staff-petrify": "Q",
  "staff-gravity-well": "E",
  "staff-consecration": "E",
  "staff-dispel-nova": "E",
  "staff-maelstrom": "R",
  "staff-tranquility": "R",
  "wand-magic-missile": "LMB",
  "wand-hex": "LMB",
  "wand-mending-spark": "LMB",
  "wand-focused-ray": "RMB",
  "wand-soul-bind": "RMB",
  "wand-flash-heal": "RMB",
  "wand-blink": "Space",
  "wand-phase-shift": "Space",
  "wand-rewind": "Space",
  "wand-mirror-shield": "Q",
  "wand-nightmare": "Q",
  "wand-rupture": "E",
  "wand-enfeeble": "E",
  "wand-chaos-volley": "R",
  "wand-apotheosis": "R",
  "twin-strike": "LMB",
  "twin-toxic-slash": "LMB",
  "twin-throwing-dirk": "LMB",
  "twin-shadow-lunge": "RMB",
  "twin-exsanguinate": "RMB",
  "twin-fan-of-knives": "RMB",
  "twin-swift-step": "Space",
  "twin-smoke-bomb": "Space",
  "twin-bloodlust": "Space",
  "twin-blur": "Q",
  "twin-vanish": "Q",
  "twin-noxious-flask": "E",
  "twin-deaths-mark": "E",
  "twin-blade-dance": "R",
  "twin-assassinate": "R",
  "blade-cleave": "LMB",
  "blade-sever": "LMB",
  "blade-sunder": "LMB",
  "blade-brutal-strike": "RMB",
  "blade-thrust": "RMB",
  "blade-bloodthirst": "RMB",
  "blade-combat-roll": "Space",
  "blade-leap-attack": "Space",
  "blade-juggernaut": "Space",
  "blade-riposte": "Q",
  "blade-iron-will": "Q",
  "blade-intimidating-shout": "E",
  "blade-razor-wind": "E",
  "blade-omnislash": "R",
  "blade-duelists-trance": "R",
  "lmb-strike": "LMB",
  "lmb-staff-bolt": "LMB",
  "rmb-reflect": "RMB",
  "rmb-crushing-blow": "RMB",
  "rmb-life-steal": "RMB",
  "space-jump": "Space",
  "space-rush": "Space",
  "space-dash": "Space",
  "space-ghost-walk": "Space",
  "q-stun": "Q",
  "q-berserk": "Q",
  "q-knockback": "Q",
  "e-ultimate": "E"
};

function canonicalItemId(itemId: string) {
  return ITEM_ALIASES[itemId] ?? itemId;
}

function hasFlag(value: string | Record<string, boolean> | Record<string, string> | undefined, flag: string) {
  if (!value) return false;
  if (typeof value === "string") {
    if (value === flag) return true;
    for (const part of value.split(",")) if (part === flag) return true;
    return false;
  }
  if (value[flag] === true || typeof value[flag] === "string") return true;
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key) && value[key] === flag) return true;
  }
  return false;
}

function abilitySet(...ids: string[]) {
  const abilitySlots: Record<string, string> = {};
  for (const id of ids) {
    const slot = ABILITY_SLOT_BY_ID[id] ?? "LMB";
    abilitySlots[id] = slot;
    abilitySlots[slot] ??= "unlocked";
  }
  return abilitySlots;
}

function defaultMaceAbilitySet() {
  return abilitySet(
    "mace-pummel",
    "mace-crushing-leap",
    "space-rush",
    "q-berserk",
    "mace-rock-smash",
    "mace-whirlwind",
    "bow-quick-shot",
    "bow-precision",
    "bow-volley",
    "bow-reposition",
    "bow-vault",
    "bow-stealth",
    "bow-decoy",
    "bow-bolas",
    "bow-caltrops",
    "bow-flurry",
    "bow-arrowstorm",
    "staff-arcane-bolt",
    "staff-siphon-beam",
    "staff-meteor",
    "staff-healing-pulse",
    "staff-frost-chain",
    "staff-astral-walk",
    "staff-zephyr",
    "staff-ice-wall",
    "staff-arcane-bubble",
    "staff-petrify",
    "staff-gravity-well",
    "staff-consecration",
    "staff-dispel-nova",
    "staff-maelstrom",
    "staff-tranquility",
    "wand-magic-missile",
    "wand-hex",
    "wand-mending-spark",
    "wand-focused-ray",
    "wand-soul-bind",
    "wand-flash-heal",
    "wand-blink",
    "wand-phase-shift",
    "wand-rewind",
    "wand-mirror-shield",
    "wand-nightmare",
    "wand-rupture",
    "wand-enfeeble",
    "wand-chaos-volley",
    "wand-apotheosis",
    "twin-strike",
    "twin-toxic-slash",
    "twin-throwing-dirk",
    "twin-shadow-lunge",
    "twin-exsanguinate",
    "twin-fan-of-knives",
    "twin-swift-step",
    "twin-smoke-bomb",
    "twin-bloodlust",
    "twin-blur",
    "twin-vanish",
    "twin-noxious-flask",
    "twin-deaths-mark",
    "twin-blade-dance",
    "twin-assassinate",
    "blade-cleave",
    "blade-sever",
    "blade-sunder",
    "blade-brutal-strike",
    "blade-thrust",
    "blade-bloodthirst",
    "blade-combat-roll",
    "blade-leap-attack",
    "blade-juggernaut",
    "blade-riposte",
    "blade-iron-will",
    "blade-intimidating-shout",
    "blade-razor-wind",
    "blade-omnislash",
    "blade-duelists-trance",
    "lmb-strike"
  );
}

function ensureStartingEquipment(equipment: Record<string, string> | undefined) {
  if (!equipment) return { weapon: MACE_WEAPON_ID, [MACE_WEAPON_ID]: MACE_WEAPON_ID };
  const weapon = (equipment.weapon || equipment[MACE_WEAPON_ID] || MACE_WEAPON_ID).slice(0, 32);
  if (equipment.weapon === weapon && equipment[MACE_WEAPON_ID] === MACE_WEAPON_ID) return equipment;
  return { ...equipment, weapon, [MACE_WEAPON_ID]: MACE_WEAPON_ID };
}

const DEFAULT_MACE_ABILITY_SET = defaultMaceAbilitySet();
const DEFAULT_MACE_ABILITY_ENTRIES = Object.entries(DEFAULT_MACE_ABILITY_SET);
const PROVING_CONTRACT_ID = "first-arms-proving";
const PROVING_WEAPON_IDS = [MACE_WEAPON_ID, BOW_WEAPON_ID, STAFF_WEAPON_ID, WAND_WEAPON_ID, TWIN_BLADES_WEAPON_ID, BLADE_WEAPON_ID] as const;
type ProvingWeaponId = (typeof PROVING_WEAPON_IDS)[number];
const PROVING_WEAPON_ID_SET = new Set<string>(PROVING_WEAPON_IDS);

type ProvingLesson = {
  flag: string;
  title: string;
  gold: number;
  renown: number;
  supplies: Record<string, number>;
  reps?: Partial<Record<WorldFactionId, number>>;
};

const PROVING_LESSONS: Record<string, ProvingLesson> = {
  statuses: {
    flag: "first-arms-lesson-statuses",
    title: "Status Table",
    gold: 18,
    renown: 8,
    supplies: { "speed-potion": 3, "cinder-ale": 2, "glade-berries": 4 }
  },
  crafting: {
    flag: "first-arms-lesson-crafting",
    title: "Craft Order",
    gold: 22,
    renown: 8,
    supplies: { "ash-logs": 12, "iron-ore": 10, "silk-thread": 3 }
  },
  buffs: {
    flag: "first-arms-lesson-buffs",
    title: "Buff Bench",
    gold: 16,
    renown: 6,
    supplies: { "speed-potion": 4, "cinder-ale": 4, "glade-berries": 6 }
  },
  gathering: {
    flag: "first-arms-lesson-gathering",
    title: "Work Yard",
    gold: 24,
    renown: 8,
    supplies: { "training-hatchet": 1, pickaxe: 1, "ash-logs": 16, "iron-ore": 16 }
  },
  cities: {
    flag: "first-arms-lesson-cities",
    title: "City Ledger",
    gold: 20,
    renown: 10,
    supplies: { "captains-map": 1, "silk-thread": 2 },
    reps: { oakhaven: 8, ironcrag: 6, "port-marrow": 6, "sunken-bazaar": 6, aetheria: 6, "high-reach-peaks": 6, "ashwood-glade": 6, "obsidian-sanctum": 4 }
  },
  travel: {
    flag: "first-arms-lesson-travel",
    title: "Route Tickets",
    gold: 28,
    renown: 10,
    supplies: { "captains-map": 1, "speed-potion": 2, "cinder-ale": 2 },
    reps: { "port-marrow": 8, "sunken-bazaar": 6, "high-reach-peaks": 4 }
  }
};

function ensurePlayerCombatLoadout(player: PlayerEntity) {
  player.cooldowns ??= {};
  player.combatFlags ??= "";
  player.energy = clamp(Number.isFinite(player.energy) ? player.energy : 0, 0, MAX_ENERGY);
  player.maxEnergy = Math.max(1, Math.min(MAX_ENERGY, Number.isFinite(player.maxEnergy) ? player.maxEnergy : MAX_ENERGY));
  player.inventory ??= {};
  player.equipment = ensureStartingEquipment(player.equipment);
  player.equippedWeaponId = (player.equipment.weapon || MACE_WEAPON_ID).slice(0, 32);
  player.abilitySlots ??= {};
  for (const [id, slot] of DEFAULT_MACE_ABILITY_ENTRIES) player.abilitySlots[id] ??= slot;
  for (const slot of ABILITY_SLOTS) player.abilitySlots[slot] ??= "unlocked";
  player.activeAbility ??= "";
  player.activeSlot ??= "";
  player.activeMs = u16Ms(player.activeMs);
  player.activeDurationMs = u16Ms(player.activeDurationMs);
  player.chargeMs = Math.max(0, Number.isFinite(player.chargeMs) ? player.chargeMs : 0);
  player.rushDistance = u16Ms(player.rushDistance);
  player.abilityVectorX = Number.isFinite(player.abilityVectorX) ? player.abilityVectorX : 1;
  player.abilityVectorY = Number.isFinite(player.abilityVectorY) ? player.abilityVectorY : 0;
  player.abilityTickMs = Math.max(0, Number.isFinite(player.abilityTickMs) ? player.abilityTickMs : 0);
  player.abilityHits ??= "";
  ensureGatheringProgress(player);
}

export function itemQty(player: PlayerEntity, itemId: string) {
  return mmoInventory.get(player.inventory ?? EMPTY_NUMBER_MAP, canonicalItemId(itemId));
}

export function bankQty(player: PlayerEntity, itemId: string) {
  return mmoInventory.get(player.bank ?? EMPTY_NUMBER_MAP, canonicalItemId(itemId));
}

export function setItemQty(player: PlayerEntity, itemId: string, amount: number) {
  const canonicalId = canonicalItemId(itemId);
  if (amount <= 0) delete player.inventory[canonicalId];
  else player.inventory[canonicalId] = Math.max(0, Math.floor(amount));
  mmoInventory.compact(player.inventory);
}

export function addItem(player: PlayerEntity, itemId: string, amount = 1) {
  return mmoInventory.add(player.inventory, canonicalItemId(itemId), amount);
}

export function spendItem(player: PlayerEntity, itemId: string, amount = 1) {
  return mmoInventory.remove(player.inventory, canonicalItemId(itemId), amount);
}

export function hasInventoryItem(player: PlayerEntity, itemId: string, amount = 1) {
  return mmoInventory.has(player.inventory ?? EMPTY_NUMBER_MAP, canonicalItemId(itemId), amount);
}

function addBankItem(player: PlayerEntity, itemId: string, amount = 1) {
  return mmoInventory.add(player.bank, canonicalItemId(itemId), amount);
}

function depositInventoryItem(player: PlayerEntity, itemId: string) {
  const amount = itemQty(player, itemId);
  if (amount <= 0) return 0;
  setItemQty(player, itemId, 0);
  addBankItem(player, itemId, amount);
  return amount;
}

export function hasQuestFlag(player: PlayerEntity, flag: string) {
  return hasMmoId(player.questFlags ?? EMPTY_BOOLEAN_MAP, flag);
}

function addQuestBit(player: PlayerEntity, bit: string) {
  addMmoId(player.questFlags, bit);
}

function acceptQuest(player: PlayerEntity, questId: string) {
  if (hasQuestFlag(player, questId)) return;
  addQuestBit(player, `${questId}-accepted`);
  if (!player.activeQuestId || hasQuestFlag(player, player.activeQuestId)) player.activeQuestId = questId;
}

function slotForAbility(abilityId: string) {
  return ABILITY_SLOT_BY_ID[abilityId] ?? "";
}

function unlockAbility(player: PlayerEntity, abilityId: string) {
  const slot = slotForAbility(abilityId);
  player.abilitySlots[abilityId] = slot || "known";
  if (slot) player.abilitySlots[slot] ??= "unlocked";
}

function unlockSlot(player: PlayerEntity, slot: string) {
  player.abilitySlots[slot] ??= "unlocked";
}

function isProvingWeaponId(value: string): value is ProvingWeaponId {
  return PROVING_WEAPON_ID_SET.has(value);
}

function provingSampleFlag(weaponId: ProvingWeaponId) {
  return `${PROVING_CONTRACT_ID}-sampled-${weaponId}`;
}

function provingRewardFlag(weaponId: ProvingWeaponId) {
  return `${PROVING_CONTRACT_ID}-reward-${weaponId}`;
}

function provingSampleCount(player: PlayerEntity) {
  return PROVING_WEAPON_IDS.filter((weaponId) => hasQuestFlag(player, provingSampleFlag(weaponId))).length;
}

function setPlayerWeapon(player: PlayerEntity, weaponId: ProvingWeaponId) {
  player.equipment = ensureStartingEquipment(player.equipment);
  player.equipment.weapon = weaponId;
  player.equippedWeaponId = weaponId;
  if (player.activeAbility) clearActiveAbility(player);
}

function grantProvingSupplies(player: PlayerEntity, supplies: Record<string, number>) {
  for (const [itemId, amount] of Object.entries(supplies)) grantLootItem(player, itemId, amount);
}

function grantProvingWeapon(player: PlayerEntity, weaponId: ProvingWeaponId) {
  if (weaponId !== MACE_WEAPON_ID) grantLootItem(player, weaponId, 1);
  player.equipment[weaponId] = weaponId;
  setPlayerWeapon(player, weaponId);
}

function acceptProvingContract(player: PlayerEntity) {
  if (hasQuestFlag(player, PROVING_CONTRACT_ID)) return false;
  const firstAccept = !hasQuestFlag(player, `${PROVING_CONTRACT_ID}-accepted`);
  acceptQuest(player, PROVING_CONTRACT_ID);
  if (firstAccept) {
    player.gold += 8;
    grantProvingSupplies(player, { "glade-berries": 3, "cinder-ale": 1 });
  }
  setDailyQuestResult(player, "Rowan's board opens a paid proving contract: try loaner arms, then keep one.");
  return true;
}

function sampleProvingWeapon(player: PlayerEntity, weaponId: ProvingWeaponId) {
  if (hasQuestFlag(player, PROVING_CONTRACT_ID)) return false;
  acceptProvingContract(player);
  const flag = provingSampleFlag(weaponId);
  const firstSample = !hasQuestFlag(player, flag);
  if (firstSample) {
    addQuestBit(player, flag);
    player.gold += 3;
  }
  setPlayerWeapon(player, weaponId);
  setDailyQuestResult(player, `${WEAPON_LOADOUTS[weaponId].name} loaner ready. Try the feel, then choose one weapon to keep.`);
  return true;
}

function completeProvingContract(player: PlayerEntity, weaponId: ProvingWeaponId) {
  if (hasQuestFlag(player, PROVING_CONTRACT_ID)) return false;
  acceptProvingContract(player);
  if (!hasQuestFlag(player, provingSampleFlag(weaponId))) sampleProvingWeapon(player, weaponId);
  if (provingSampleCount(player) < 3) {
    setDailyQuestResult(player, "The board wants three loaner trials before it pays out a kept weapon.");
    return false;
  }
  addQuestBit(player, PROVING_CONTRACT_ID);
  addQuestBit(player, provingRewardFlag(weaponId));
  grantProvingWeapon(player, weaponId);
  player.gold += 60;
  player.renown += 24;
  grantProvingSupplies(player, {
    "ash-logs": 18,
    "iron-ore": 14,
    "silk-thread": 3,
    "glade-berries": 8,
    "cinder-ale": 4,
    "speed-potion": 3
  });
  syncRenownRewards(player);
  if (player.activeQuestId === PROVING_CONTRACT_ID) player.activeQuestId = nextStarterQuest(player) || "first-cut";
  setDailyQuestResult(player, `${WEAPON_LOADOUTS[weaponId].name} chosen. Starter purse paid. Next field action: ${nextStarterQuest(player) === "first-cut" ? "cut Ash tree" : "follow the main quest trail"}.`);
  refreshQuestProgress(player);
  return true;
}

function completeProvingLesson(player: PlayerEntity, lessonId: string) {
  if (!hasQuestFlag(player, PROVING_CONTRACT_ID)) {
    setDailyQuestResult(player, "Finish the First Arms payout before taking lesson contracts.");
    return false;
  }
  const lesson = PROVING_LESSONS[lessonId];
  if (!lesson || hasQuestFlag(player, lesson.flag)) return false;
  addQuestBit(player, lesson.flag);
  player.gold += lesson.gold;
  player.renown += lesson.renown;
  grantProvingSupplies(player, lesson.supplies);
  for (const [factionId, amount] of Object.entries(lesson.reps ?? {}) as [WorldFactionId, number][]) {
    grantFactionRep(player, factionId, amount);
  }
  syncRenownRewards(player);
  setDailyQuestResult(player, `${lesson.title} paid out. Its field note now stays in the journal.`);
  refreshQuestProgress(player);
  return true;
}

function applyProvingCommand(player: PlayerEntity, command: string) {
  const clean = cleanInputText(command, 64);
  if (clean === "accept") return acceptProvingContract(player);
  if (clean.startsWith("sample:")) {
    const weaponId = clean.slice("sample:".length);
    return isProvingWeaponId(weaponId) ? sampleProvingWeapon(player, weaponId) : false;
  }
  if (clean.startsWith("choose:")) {
    const weaponId = clean.slice("choose:".length);
    return isProvingWeaponId(weaponId) ? completeProvingContract(player, weaponId) : false;
  }
  if (clean.startsWith("lesson:")) return completeProvingLesson(player, clean.slice("lesson:".length));
  return false;
}

export function hasSlot(player: PlayerEntity, slot: string) {
  if (slot === "Space" || slot === "Q" || slot === "R") return true;
  const abilitySlots = player.abilitySlots ?? EMPTY_STRING_MAP;
  if (abilitySlots[slot]) return true;
  for (const key in abilitySlots) {
    if (Object.prototype.hasOwnProperty.call(abilitySlots, key) && abilitySlots[key] === slot) return true;
  }
  return false;
}

function equippedWeapon(player: PlayerEntity) {
  ensurePlayerCombatLoadout(player);
  return WEAPON_LOADOUTS[player.equippedWeaponId as keyof typeof WEAPON_LOADOUTS] ?? WEAPON_LOADOUTS.mace;
}

function abilityIdForSlot(player: PlayerEntity, slot: AbilitySlot) {
  const weapon = equippedWeapon(player);
  const configured = player.equipment[`ability:${slot}`] as keyof typeof PLAYER_ABILITY_DEFS | undefined;
  const options: readonly (keyof typeof PLAYER_ABILITY_DEFS)[] = weapon.options[slot] ?? [];
  if (configured && options.includes(configured) && hasAbility(player, configured)) return configured;
  return weapon.slots[slot] ?? "";
}

function abilityDefForSlot(player: PlayerEntity, slot: AbilitySlot) {
  const id = abilityIdForSlot(player, slot);
  return id ? PLAYER_ABILITY_DEFS[id as keyof typeof PLAYER_ABILITY_DEFS] : undefined;
}

export function equippedWeaponForPlayer(player: PlayerEntity | undefined) {
  if (!player) return MACE_WEAPON_ID;
  const weaponId = (player.equipment?.weapon || MACE_WEAPON_ID).slice(0, 32);
  return WEAPON_LOADOUTS[weaponId as keyof typeof WEAPON_LOADOUTS]?.id ?? MACE_WEAPON_ID;
}

export function selectedAbilityForSlot(player: PlayerEntity | undefined, slot: AbilitySlot) {
  if (!player) return "";
  const weaponId = equippedWeaponForPlayer(player);
  const weapon = WEAPON_LOADOUTS[weaponId as keyof typeof WEAPON_LOADOUTS] ?? WEAPON_LOADOUTS.mace;
  const configured = player.equipment?.[`ability:${slot}`] as keyof typeof PLAYER_ABILITY_DEFS | undefined;
  const options: readonly (keyof typeof PLAYER_ABILITY_DEFS)[] = weapon.options[slot] ?? [];
  if (configured && options.includes(configured) && hasFlag(player.abilitySlots, configured)) return configured;
  return weapon.slots[slot] ?? "";
}

export function abilityOptionsForSlot(weaponId: string, slot: AbilitySlot) {
  const weapon = WEAPON_LOADOUTS[weaponId as keyof typeof WEAPON_LOADOUTS] ?? WEAPON_LOADOUTS.mace;
  return [...(weapon.options[slot] ?? [])];
}

function configureAbilitySlot(player: PlayerEntity, slot: string, abilityId: string) {
  ensurePlayerCombatLoadout(player);
  if (!ABILITY_SLOTS.includes(slot as AbilitySlot)) return false;
  const typedSlot = slot as AbilitySlot;
  const weapon = equippedWeapon(player);
  const id = abilityId as keyof typeof PLAYER_ABILITY_DEFS;
  if (!(id in PLAYER_ABILITY_DEFS)) return false;
  const options: readonly (keyof typeof PLAYER_ABILITY_DEFS)[] = weapon.options[typedSlot] ?? [];
  if (!options.includes(id)) return false;
  if (!hasAbility(player, abilityId)) return false;
  player.equipment[`ability:${typedSlot}`] = abilityId.slice(0, 32);
  return true;
}

function configureWeapon(player: PlayerEntity, weaponId: string) {
  ensurePlayerCombatLoadout(player);
  if (!(weaponId in WEAPON_LOADOUTS)) return false;
  if (weaponId !== MACE_WEAPON_ID && !hasInventoryItem(player, weaponId) && !hasGear(player, weaponId)) return false;
  player.equipment.weapon = weaponId;
  player.equippedWeaponId = weaponId;
  if (player.activeAbility) clearActiveAbility(player);
  return true;
}

function cooldownForSlot(player: PlayerEntity, slot: AbilitySlot) {
  ensurePlayerCombatLoadout(player);
  if (player.cooldownMs <= 0) return 0;
  return Math.max(0, Math.floor(player.cooldowns[slot] ?? 0));
}

function isSlotReady(player: PlayerEntity, slot: AbilitySlot) {
  return cooldownForSlot(player, slot) <= 0;
}

function syncLegacyCooldown(player: PlayerEntity) {
  ensurePlayerCombatLoadout(player);
  player.cooldownMs = u16Ms(Math.max(0, ...Object.values(player.cooldowns).map((value) => Math.floor(value || 0))));
}

function setSlotCooldown(player: PlayerEntity, slot: AbilitySlot, cooldownMs: number) {
  ensurePlayerCombatLoadout(player);
  const focus = hasGear(player, "ring-focus") ? 0.82 : 1;
  const mastery = 1 - Math.min(0.14, Math.max(0, player.masteryRank - 1) * 0.012);
  player.cooldowns[slot] = u16Ms(cooldownMs * focus * mastery);
  syncLegacyCooldown(player);
}

function setUtilityCooldown(player: PlayerEntity, action: keyof typeof ACTION_COOLDOWN_MS) {
  ensurePlayerCombatLoadout(player);
  player.cooldowns[action] = u16Ms(ACTION_COOLDOWN_MS[action]);
  syncLegacyCooldown(player);
}

function utilityCooldownReady(player: PlayerEntity, action: keyof typeof ACTION_COOLDOWN_MS) {
  ensurePlayerCombatLoadout(player);
  if (player.cooldownMs <= 0) return true;
  return (player.cooldowns[action] ?? 0) <= 0;
}

function decayPlayerCooldowns(player: PlayerEntity, dt: number) {
  ensurePlayerCombatLoadout(player);
  if (player.cooldownMs <= 0 && Object.values(player.cooldowns).some((value) => value > 0)) {
    player.cooldowns = {};
    syncLegacyCooldown(player);
    return;
  }
  const ms = Math.max(0, Math.floor(dt * 1000));
  let any = false;
  for (const key of Object.keys(player.cooldowns)) {
    const recoverScale = hasTimedPlayerFlag(player, "trance") && key !== "R" ? 1.5 : 1;
    const next = u16Ms((player.cooldowns[key] || 0) - Math.floor(ms * recoverScale));
    player.cooldowns[key] = next;
    if (next > 0) any = true;
  }
  if (!any) {
    for (const key of Object.keys(player.cooldowns)) if (player.cooldowns[key] <= 0) delete player.cooldowns[key];
  }
  syncLegacyCooldown(player);
}

function grantItem(player: PlayerEntity, itemId: string, amount = 1) {
  addItem(player, itemId, amount);
}

function equipItem(player: PlayerEntity, itemId: string) {
  grantItem(player, itemId);
  player.equipment[itemId] = itemId;
}

const FACTION_REPUTATION_THRESHOLDS = [0, 25, 75, 150, 300] as const;
const WORLD_FACTION_ID_SET = new Set<string>(worldFactions.map((faction) => faction.id));
const WORLD_CREATURE_BY_ID = new Map<string, (typeof worldCreatureDefinitions)[number]>(worldCreatureDefinitions.map((creature) => [creature.id, creature]));

type WorldCraftRecipe = {
  id: string;
  costs?: Record<string, number>;
  goldCost?: number;
  goldReward?: number;
  hpCost?: number;
  outputItemId?: string;
  outputAmount?: number;
  equip?: boolean;
  unique?: boolean;
  questFlag?: string;
  factionId?: WorldFactionId;
  rep?: number;
};

function isWorldFactionId(value: string): value is WorldFactionId {
  return WORLD_FACTION_ID_SET.has(value);
}

function factionRepItemId(factionId: WorldFactionId) {
  return `rep-${factionId}`;
}

function factionIdForRepItem(itemId: string): WorldFactionId | undefined {
  const canonicalId = canonicalItemId(itemId);
  if (!canonicalId.startsWith("rep-")) return undefined;
  const factionId = canonicalId.slice(4);
  return isWorldFactionId(factionId) ? factionId : undefined;
}

function factionRewardFlag(rewardId: string) {
  return `reward-${rewardId}`;
}

function hasFactionReward(player: PlayerEntity, rewardId: string) {
  return hasQuestFlag(player, factionRewardFlag(rewardId));
}

function factionReputation(player: PlayerEntity, factionId: WorldFactionId) {
  return itemQty(player, factionRepItemId(factionId));
}

function factionReputationLevel(player: PlayerEntity, factionId: WorldFactionId) {
  const rep = factionReputation(player, factionId);
  let level = 0;
  for (let index = 1; index < FACTION_REPUTATION_THRESHOLDS.length; index += 1) {
    if (rep >= FACTION_REPUTATION_THRESHOLDS[index]) level = index;
  }
  return level;
}

function applyFactionRewardUnlock(player: PlayerEntity, rewardId: string) {
  switch (rewardId) {
    case "oakhaven-druid-guild-entry":
      grantItem(player, "elderwood-ash");
      break;
    case "oakhaven-barkskin-infusion":
      player.maxHp = Math.min(180, player.maxHp + 5);
      player.hp = Math.min(player.maxHp, player.hp + 12);
      break;
    case "ironcrag-smelter-permit":
      grantItem(player, "soot-forge-coke");
      break;
    case "ironcrag-blast-plated-boots":
      equipItem(player, "mining-boots");
      break;
    case "aetheria-sanctuary-access":
      grantItem(player, "ancient-script-scroll");
      break;
    case "aetheria-smite-rune":
      unlockAbility(player, "staff-consecration");
      break;
    case "port-marrow-private-dock":
      player.homeZoneId = "port-marrow";
      grantItem(player, "cove-salvage-box");
      break;
    case "sunken-bazaar-backroom-access":
      grantItem(player, "bazaar-glass-bottle");
      break;
    case "obsidian-sanctum-abyssal-shift":
      grantItem(player, "void-portal-key");
      break;
    case "obsidian-sanctum-soul-siphon":
      unlockAbility(player, "space-ghost-walk");
      break;
    case "ashwood-glade-hunter-pathing":
      grantItem(player, "outcast-hunt-skull");
      break;
    case "high-reach-peaks-wind-leap":
      grantItem(player, "ascetic-jade-stone");
      unlockAbility(player, "space-dash");
      break;
    case "high-reach-peaks-nirvanic-breath":
      unlockAbility(player, "space-dash");
      unlockAbility(player, "space-ghost-walk");
      break;
  }
}

function syncFactionReputationRewards(player: PlayerEntity) {
  let changed = false;
  for (const reward of worldReputationRewards) {
    if (factionReputationLevel(player, reward.factionId) < reward.tierLevel) continue;
    const flag = factionRewardFlag(reward.id);
    if (hasQuestFlag(player, flag)) continue;
    addQuestBit(player, flag);
    applyFactionRewardUnlock(player, reward.id);
    changed = true;
  }
  return changed;
}

function grantFactionRep(player: PlayerEntity, factionId: WorldFactionId, amount: number) {
  const value = Math.max(0, Math.floor(amount));
  if (value <= 0) return;
  adjustFactionRep(player, factionId, value);
  syncFactionReputationRewards(player);
}

function grantFactionBundle(player: PlayerEntity, factionId: WorldFactionId, rep: number, supplies?: Record<string, number>) {
  grantFactionRep(player, factionId, rep);
  for (const [itemId, amount] of Object.entries(supplies ?? {})) grantLootItem(player, itemId, amount);
}

function recipeGoldCost(player: PlayerEntity, recipe: WorldCraftRecipe) {
  const base = Math.max(0, Math.floor(recipe.goldCost ?? 0));
  if (base <= 0) return 0;
  return hasFactionReward(player, "ironcrag-fuel-efficiency") ? Math.max(0, Math.floor(base * 0.85)) : base;
}

function canCraftRecipe(player: PlayerEntity, recipe: WorldCraftRecipe) {
  if (recipe.questFlag && hasQuestFlag(player, recipe.questFlag)) return false;
  if (recipe.unique && recipe.outputItemId && (hasInventoryItem(player, recipe.outputItemId) || hasGear(player, recipe.outputItemId))) return false;
  if (player.gold < recipeGoldCost(player, recipe)) return false;
  if ((recipe.hpCost ?? 0) > 0 && player.hp - Math.floor(recipe.hpCost ?? 0) <= 1) return false;
  for (const [itemId, amount] of Object.entries(recipe.costs ?? {})) {
    if (itemQty(player, itemId) < Math.max(1, Math.floor(amount))) return false;
  }
  return true;
}

function craftRecipe(player: PlayerEntity, recipe: WorldCraftRecipe) {
  if (!canCraftRecipe(player, recipe)) return false;
  for (const [itemId, amount] of Object.entries(recipe.costs ?? {})) spendItem(player, itemId, Math.max(1, Math.floor(amount)));
  player.gold -= recipeGoldCost(player, recipe);
  if ((recipe.hpCost ?? 0) > 0) player.hp = Math.max(1, player.hp - Math.floor(recipe.hpCost ?? 0));
  if ((recipe.goldReward ?? 0) > 0) player.gold += Math.floor(recipe.goldReward ?? 0);
  if (recipe.outputItemId) {
    if (recipe.equip) equipItem(player, recipe.outputItemId);
    else grantLootItem(player, recipe.outputItemId, recipe.outputAmount ?? 1);
  }
  if (recipe.questFlag) addQuestBit(player, recipe.questFlag);
  if (recipe.factionId && (recipe.rep ?? 0) > 0) grantFactionRep(player, recipe.factionId, recipe.rep ?? 0);
  player.berserkMs = Math.max(player.berserkMs, 700);
  refreshQuestProgress(player);
  return true;
}

function craftFirstAvailable(player: PlayerEntity, recipes: readonly WorldCraftRecipe[]) {
  for (const recipe of recipes) {
    if (craftRecipe(player, recipe)) return true;
  }
  return false;
}

function authoredRecipeRuntimeMatch(recipes: readonly WorldCraftRecipe[], requestedRecipeId: string) {
  const authored = authoredWorldCraftingRecipes.find((recipe) => recipe.id === requestedRecipeId);
  const outputItemId = authored?.outputs[0]?.itemId;
  if (!outputItemId) return undefined;
  return recipes.find((recipe) => recipe.outputItemId === outputItemId && recipe.factionId === authored.factionId) ??
    recipes.find((recipe) => recipe.outputItemId === outputItemId);
}

function craftGatheringProgressionRecipe(player: PlayerEntity, requestedRecipeId: string) {
  const recipeId = cleanItemId(requestedRecipeId);
  if (!recipeId) return false;
  const result = craftAuthoredProgressionRecipe(player.inventory, recipeId, {
    inputKey: (input) => cleanItemId(input.materialName),
    outputKey: (recipe) => cleanItemId(recipe.outputId)
  });
  if (!result.ok) return false;
  refreshQuestProgress(player);
  return true;
}

function craftRequestedOrFirst(player: PlayerEntity, recipes: readonly WorldCraftRecipe[], requestedRecipeId = "") {
  const requestedId = cleanItemId(requestedRecipeId.trim());
  if (requestedId) {
    if (craftGatheringProgressionRecipe(player, requestedId)) return true;
    const requested = recipes.find((recipe) => recipe.id === requestedId) ?? authoredRecipeRuntimeMatch(recipes, requestedId);
    if (requested && craftRecipe(player, requested)) return true;
  }
  return craftFirstAvailable(player, recipes);
}

function isMarketNpc(npc: NpcEntity) {
  return npc.role === "merchant" || npc.role === "crafting" || npc.kind === "foreman-iron-will";
}

function marketStockIdsForNpc(npc: NpcEntity, player: PlayerEntity) {
  if (npc.kind === "foreman-iron-will" || npc.kind === "blacksmith-silas" || npc.kind === "blacksmith") return ["pickaxe", "iron-ore", "iron-chest", "ring-focus"];
  if (npc.kind === "alchemist-zora") return ["speed-potion", "cinder-ale", "silk-thread", "void-resistant-cloak"];
  if (npc.kind === "apprentice-jinn") return ["glade-berries", "cinder-ale", "speed-potion"];
  if (npc.zoneId === "canaan-desert" || player.zoneId === "bazaar") return ["glade-berries", "speed-potion", "silk-thread", "ring-focus"];
  return ["glade-berries", "cinder-ale", "speed-potion", "pickaxe", "iron-ore"];
}

function marketNpcForInput(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const targeted = input.targetId ? state.npcs[input.targetId] : undefined;
  if (targeted && targeted.zoneId === player.zoneId && isMarketNpc(targeted) && canReachNpc(player, targeted, 84)) return targeted;
  return nearestNpc(player, state, "merchant", 84);
}

function applyMarketTransaction(player: PlayerEntity, npc: NpcEntity, mode: string, itemId: string) {
  if (mode === "inspect") return true;
  const item = MARKET_TRADE_ITEMS[canonicalItemId(itemId)];
  if (!item) return false;
  if (mode === "buy") {
    if (!marketStockIdsForNpc(npc, player).includes(item.itemId)) return false;
    if (item.unique && (hasInventoryItem(player, item.itemId) || hasGear(player, item.itemId))) return false;
    if (player.gold < item.price) return false;
    player.gold -= item.price;
    grantItem(player, item.itemId, 1);
    grantFactionRep(player, npc.zoneId === "canaan-desert" ? "sunken-bazaar" : npc.zoneId === "crags" ? "ironcrag" : "port-marrow", 1);
    refreshQuestProgress(player);
    return true;
  }
  if (mode === "sell") {
    if (item.sellPrice <= 0 || itemQty(player, item.itemId) <= 0) return false;
    if (!spendItem(player, item.itemId, 1)) return false;
    player.gold += item.sellPrice;
    grantFactionRep(player, npc.zoneId === "canaan-desert" ? "sunken-bazaar" : npc.zoneId === "crags" ? "ironcrag" : "port-marrow", 1);
    refreshQuestProgress(player);
    return true;
  }
  return false;
}

function grantLootItem(player: PlayerEntity, itemId: string, amount: number) {
  const value = Math.max(1, Math.floor(amount));
  const canonicalId = canonicalItemId(itemId);
  const factionId = factionIdForRepItem(canonicalId);
  if (factionId) {
    grantFactionRep(player, factionId, value);
    refreshQuestProgress(player);
    return;
  }
  switch (canonicalId) {
    case "gold":
      player.gold += hasFactionReward(player, "sunken-bazaar-coin-scent") ? Math.max(1, Math.floor(value * 1.2)) : value;
      break;
    case "renown":
      player.renown += value;
      syncRenownRewards(player);
      break;
    case "ash-logs":
      addItem(player, "ash-logs", value);
      break;
    case "iron-ore":
      addItem(player, "iron-ore", value);
      break;
    case "silk-thread":
      addItem(player, "silk-thread", value);
      break;
    case "glade-berry":
    case "glade-berries":
      addItem(player, "glade-berries", value);
      break;
    case "cinder-ale":
      addItem(player, "cinder-ale", value);
      break;
    case "speed-potion":
    case "speed-potions":
      addItem(player, "speed-potion", value);
      break;
    case "leather-boots":
    case "mining-boots":
    case "iron-chest":
    case "ring-focus":
      equipItem(player, canonicalId);
      break;
    default:
      grantItem(player, canonicalId, value);
      break;
  }
  refreshQuestProgress(player);
}

type DailyQuestProgressEvent = {
  kind: "gather" | "kill" | "space" | "escort" | "interact" | "zone";
  amount?: number;
  creatureId?: string;
  resourceKind?: ResourceEntity["kind"];
  role?: string;
  elite?: boolean;
  npcKind?: string;
};

const DAILY_GATHER_OBJECTIVES = new Set<DailyObjectiveType>(["EXTRACT", "FORAGING", "ARTIFACT_RETRIEVAL"]);
const DAILY_KILL_OBJECTIVES = new Set<DailyObjectiveType>(["COMBAT_ELITE", "ASSASSINATION", "PURGE", "TRAP_BOMBING", "BAITING"]);
const DAILY_INTERACT_OBJECTIVES = new Set<DailyObjectiveType>(["NEGOTIATION", "DELIVERY", "SMUGGLING", "TITHE_COLLECTION", "HEALING_SUPPORT", "CALIBRATION", "VAULT_CRACKING"]);
const DAILY_ESCORT_OBJECTIVES = new Set<DailyObjectiveType>(["ESCORT", "TAXI", "INFILTRATION", "DECOY"]);
const DAILY_ZONE_OBJECTIVES = new Set<DailyObjectiveType>(["RECONNAISSANCE", "SIGNAL_TOWER", "GUARD_DEFENSE", "SABOTAGE", "CORRUPTION_SEAL"]);

function adjustFactionRep(player: PlayerEntity, factionId: WorldFactionId, amount: number) {
  const next = Math.max(0, factionReputation(player, factionId) + Math.floor(amount));
  setItemQty(player, factionRepItemId(factionId), next);
  syncFactionReputationRewards(player);
}

function ensureDailyQuestState(player: PlayerEntity, dateString = currentUtcDateString()) {
  const needsReset = player.dailyQuestDate !== dateString;
  if (needsReset) {
    player.dailyQuestDate = dateString;
    player.dailyQuestStep = 0;
    player.dailyQuestProgress = 0;
    player.dailyQuestCompleted = false;
    player.dailyQuestResult = "";
  }
  const arc = dailyQuestArcForDate(player.dailyQuestDate || dateString);
  player.dailyQuestStep = clamp(Math.floor(player.dailyQuestStep || 0), 0, arc.steps.length);
  player.dailyQuestProgress = u16Ms(player.dailyQuestProgress || 0);
  player.dailyQuestCompleted = Boolean(player.dailyQuestCompleted || player.dailyQuestStep >= arc.steps.length);
  player.dailyQuestResult = cleanInputText(player.dailyQuestResult ?? "", 128);
  return arc;
}

function activeDailyQuestStep(player: PlayerEntity) {
  const arc = ensureDailyQuestState(player);
  if (player.dailyQuestCompleted) return undefined;
  return arc.steps[player.dailyQuestStep];
}

function dailyStepReady(player: PlayerEntity, step: DailyQuestStep) {
  return player.dailyQuestProgress >= step.targetCount;
}

function setDailyQuestResult(player: PlayerEntity, text: string) {
  player.dailyQuestResult = cleanInputText(text, 128);
}

function dailyQuestChoiceFlag(dateString: string, stepIndex: number, choiceId: string) {
  return `daily:${dateString}:${stepIndex}:${choiceId}`;
}

function dailyQuestEventMatches(player: PlayerEntity, step: DailyQuestStep, event: DailyQuestProgressEvent) {
  if (!questZoneMatchesPlayer(step.targetZone, player)) return false;
  switch (event.kind) {
    case "gather":
      return DAILY_GATHER_OBJECTIVES.has(step.objectiveType);
    case "kill":
      return DAILY_KILL_OBJECTIVES.has(step.objectiveType) && (!step.targetCreatureId || step.targetCreatureId === event.creatureId || event.elite === true || event.role === "boss");
    case "space":
      return step.objectiveType === "PLATFORMING";
    case "escort":
      return DAILY_ESCORT_OBJECTIVES.has(step.objectiveType);
    case "interact":
      return DAILY_INTERACT_OBJECTIVES.has(step.objectiveType);
    case "zone":
      return DAILY_ZONE_OBJECTIVES.has(step.objectiveType);
  }
}

function progressDailyQuest(player: PlayerEntity, event: DailyQuestProgressEvent) {
  const arc = ensureDailyQuestState(player);
  const step = arc.steps[player.dailyQuestStep];
  if (player.dailyQuestCompleted || !step || dailyStepReady(player, step)) return false;
  if (!dailyQuestEventMatches(player, step, event)) return false;
  const amount = Math.max(1, Math.floor(event.amount ?? 1));
  player.dailyQuestProgress = Math.min(step.targetCount, player.dailyQuestProgress + amount);
  if (dailyStepReady(player, step)) {
    setDailyQuestResult(player, "Objective secure. Choose who receives the leverage.");
  }
  return true;
}

function chooseDailyQuestBranch(player: PlayerEntity, choiceId: string) {
  const arc = ensureDailyQuestState(player);
  const step = arc.steps[player.dailyQuestStep];
  if (player.dailyQuestCompleted || !step || !dailyStepReady(player, step)) return false;
  const choice = dailyQuestStepChoice(arc, step.stepIndex, cleanInputText(choiceId, 40));
  if (!choice) return false;
  for (const [factionId, amount] of Object.entries(choice.reputationImpacts)) adjustFactionRep(player, factionId as WorldFactionId, amount ?? 0);
  grantLootItem(player, step.rewardMaterialId, 1);
  addQuestBit(player, dailyQuestChoiceFlag(arc.dateString, step.stepIndex, choice.id));
  setDailyQuestResult(player, choice.resultingText);
  player.dailyQuestStep = Math.min(arc.steps.length, player.dailyQuestStep + 1);
  player.dailyQuestProgress = 0;
  if (player.dailyQuestStep >= arc.steps.length) {
    player.dailyQuestCompleted = true;
    grantFactionRep(player, arc.primaryFaction, 180);
    addQuestBit(player, `daily:${arc.dateString}:complete`);
    setDailyQuestResult(player, `${arc.title} settled for today.`);
  }
  refreshQuestProgress(player);
  return true;
}

function hasAbility(player: PlayerEntity, abilityId: string) {
  return hasFlag(player.abilitySlots, abilityId);
}

function hasGear(player: PlayerEntity, gearId: string) {
  return hasFlag(player.equipment, gearId);
}

function isPeaceNpc(npc: NpcEntity) {
  return PEACE_NPC_ROLES.has(npc.role);
}

function levelForXp(xp: number) {
  return clamp(1 + Math.floor(Math.sqrt(Math.max(0, xp)) / 7), 1, 99);
}

function awardXp(player: PlayerEntity, skill: SkillName, amount: number) {
  if (skill === "combat") {
    player.combatXp += amount;
    player.combatLevel = levelForXp(player.combatXp);
  } else {
    const skillId = skill === "woodcutting" ? "lumberjacking" : skill;
    awardGatheringXp(player, skillId, amount);
  }
}

function rankForRenown(renown: number) {
  return clamp(1 + Math.floor(Math.max(0, renown) / 140), 1, 99);
}

function activeContract(player: PlayerEntity) {
  return CONTRACTS.find((contract) => contract.id === player.contractId);
}

function unlockedContracts(player: PlayerEntity) {
  const rank = Math.max(player.masteryRank, rankForRenown(player.renown));
  return CONTRACTS.filter((contract) => contract.minRank <= rank);
}

function assignNextContract(player: PlayerEntity) {
  const pool = unlockedContracts(player);
  const index = pool.length ? player.contractStreak % pool.length : 0;
  const contract = pool[index] ?? CONTRACTS[0];
  player.contractId = contract.id;
  player.contractKills = 0;
  return contract;
}

function syncRenownRewards(player: PlayerEntity) {
  const previousRank = player.masteryRank || 1;
  const nextRank = rankForRenown(player.renown);
  if (nextRank <= previousRank) return false;
  const rankGain = nextRank - previousRank;
  player.masteryRank = nextRank;
  player.maxHp = Math.min(180, player.maxHp + rankGain * 3);
  player.maxMana = Math.min(120, player.maxMana + rankGain * 2);
  player.hp = Math.min(player.maxHp, player.hp + rankGain * 8);
  player.mana = Math.min(player.maxMana, player.mana + rankGain * 6);
  if (nextRank >= 2) unlockAbility(player, "lmb-staff-bolt");
  if (nextRank >= 3) unlockAbility(player, "rmb-life-steal");
  if (nextRank >= 4) {
    unlockSlot(player, "Space");
    unlockAbility(player, "space-dash");
  }
  if (nextRank >= 5) {
    unlockSlot(player, "Q");
    unlockAbility(player, "q-knockback");
  }
  return true;
}

function recordContractKill(player: PlayerEntity, target: NpcEntity) {
  if (player.contractCooldownMs > 0) return;
  const contract = activeContract(player);
  const targetKinds: readonly string[] = contract?.targetKinds ?? [];
  if (!contract || !targetKinds.includes(target.kind)) return;
  const value = target.role === "boss" ? contract.targetKills : target.elite ? 2 : 1;
  player.contractKills = Math.min(contract.targetKills, player.contractKills + value);
}

function turnInContract(player: PlayerEntity) {
  const contract = activeContract(player) ?? assignNextContract(player);
  if (player.contractCooldownMs > 0) return false;
  if (player.contractKills < contract.targetKills) return false;
  player.gold += contract.gold + player.masteryRank * 4;
  player.renown += contract.renown;
  player.contractStreak += 1;
  awardXp(player, "combat", contract.combatXp);
  for (const [itemId, amount] of Object.entries(contract.supplies ?? {})) grantLootItem(player, itemId, amount);
  const factionReward = CONTRACT_FACTION_REWARDS[contract.id];
  if (factionReward) grantFactionBundle(player, factionReward.factionId, factionReward.rep, factionReward.supplies);
  syncRenownRewards(player);
  assignNextContract(player);
  player.contractCooldownMs = CONTRACT_RESTART_COOLDOWN_MS;
  player.berserkMs = Math.max(player.berserkMs, 1200);
  return true;
}

function applyWorldEventSupplies(player: PlayerEntity, supplies: WorldEventDef["supplies"]) {
  if (!supplies) return;
  for (const [itemId, amount] of Object.entries(supplies)) grantLootItem(player, itemId, amount);
}

function completeWorldEvent(state: MmoSkillDemoState, event: WorldEventDef) {
  const goal = Math.max(1, state.worldEventGoal || event.goal);
  state.worldEventPhase = "success";
  state.worldEventProgress = goal;
  state.worldEventGoal = goal;
  state.worldEventTimerMs = event.restMs;
  state.worldEventReward = event.rewardText;
  for (const player of entitiesOfType<PlayerEntity>(state, "player")) {
    if (player.hp <= 0 || player.zoneId !== event.zoneId) continue;
    player.gold += event.gold;
    player.renown += event.renown;
    awardXp(player, event.xpSkill, event.xp);
    applyWorldEventSupplies(player, event.supplies);
    const factionReward = WORLD_EVENT_FACTION_REWARDS[event.id];
    if (factionReward) grantFactionBundle(player, factionReward.factionId, factionReward.rep, factionReward.supplies);
    syncRenownRewards(player);
    player.berserkMs = Math.max(player.berserkMs, 1500);
  }
}

function contributeWorldEvent(state: MmoSkillDemoState, player: PlayerEntity, amount: number) {
  if (amount <= 0 || state.worldEventPhase !== "active") return;
  const event = activeWorldEvent(state);
  if (player.zoneId !== event.zoneId) return;
  const goal = Math.max(1, state.worldEventGoal || event.goal);
  state.worldEventProgress = Math.min(goal, state.worldEventProgress + amount);
  if (state.worldEventProgress >= goal) completeWorldEvent(state, event);
}

function updateWorldEvent(state: MmoSkillDemoState, dt: number) {
  const event = activeWorldEvent(state);
  if (state.worldEventId !== event.id) assignWorldEvent(state, event);
  state.worldEventTimerMs = Math.max(0, state.worldEventTimerMs - Math.floor(dt * 1000));
  if (state.worldEventTimerMs > 0) return;
  if (state.worldEventPhase === "active") {
    state.worldEventPhase = "regrouping";
    state.worldEventProgress = Math.min(state.worldEventProgress, state.worldEventGoal);
    state.worldEventTimerMs = event.restMs;
    state.worldEventReward = "Event faded. Next rally soon.";
    return;
  }
  assignWorldEvent(state, nextWorldEvent(state));
}

export function createMmoSkillDemoCollisionKernel() {
  return createCollisionKernel({
    fetch: Object.assign(
      async () =>
        new Response(Bun.file(new URL("../../../wasm/collision-kernel.wasm", import.meta.url)), {
          headers: { "content-type": "application/wasm" }
        }),
      { preconnect: fetch.preconnect }
    )
  });
}

export function buildMmoSkillDemoMap() {
  return buildConfiguredMmoSkillDemoMap();
}

export const mmoSkillDemoMap = buildMmoSkillDemoMap();
export const mmoSkillDemoSolidRects = extractCollisionRects(mmoSkillDemoMap, { tags: ["solid"] });
const mmoSkillDemoSolidRectIndex = createStaticRectCollisionIndex(mmoSkillDemoSolidRects);

export function extractMmoSkillDemoResources(map: TileMap = mmoSkillDemoMap): ResourceEntity[] {
  const resources: ResourceEntity[] = [];
  const counts = { tree: 0, ore: 0 };
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const cell = map.getTileAt(x, y, "ground");
      if (!cell?.tile?.tags.includes("resource")) continue;
      const kind = cell.tile.tags.includes("ore") ? "ore" : "tree";
      const point = tileToWorld(map, x, y, "center");
      const index = counts[kind]++;
      const skillId = kind === "ore" ? "mining" : "lumberjacking";
      resources.push({
        id: `${kind}-${String(index).padStart(2, "0")}`,
        entityType: "resource",
        kind,
        skillId,
        zoneId: zoneForPoint(point.x, point.y),
        x: point.x,
        y: point.y,
        hp: RESOURCE_HP[kind],
        maxHp: RESOURCE_HP[kind],
        depleted: false,
        respawnMs: 0
      });
    }
  }
  if (map === mmoSkillDemoMap) {
    for (const spec of worldGatherableNodeSpecs) {
      resources.push({
        id: spec.id,
        entityType: "resource",
        kind: spec.kind,
        skillId: spec.skillId,
        materialId: spec.materialId,
        zoneId: zoneForPoint(spec.x, spec.y),
        x: spec.x,
        y: spec.y,
        hp: resourceHpForKind(spec.kind, spec.tier),
        maxHp: resourceHpForKind(spec.kind, spec.tier),
        depleted: false,
        respawnMs: 0
      });
    }
  }
  return resources;
}

type RoomKind = "world-zone" | "dungeon-instance" | "cottage-instance";

function describeRoom(roomId: string): { roomKind: RoomKind; roomLabel: string } {
  if (roomId.includes("dungeon")) return { roomKind: "dungeon-instance", roomLabel: "Party Boss Room" };
  if (roomId.includes("cottage")) return { roomKind: "cottage-instance", roomLabel: "Player Cottage" };
  return { roomKind: "world-zone", roomLabel: "Shared World Zones" };
}

function roleForKind(kind: string) {
  return NPC_ROLES[kind] ?? bestiaryFor(kind).role ?? "mob";
}

const STRONG_PHASE_MS = 8000;
const STRONG_PHASE_INVULN_START_MS = 3200;
const STRONG_PHASE_INVULN_END_MS = 5200;
const LOOT_INTERACTION_RADIUS = 96;
const CONTRACT_RESTART_COOLDOWN_MS = 45000;
const ESCORT_SPEED = 136;
const ESCORT_REACH_RADIUS = 14;
const NPC_BASE_AGGRO_RADIUS = 150;
const NPC_BOSS_AGGRO_RADIUS = 190;
const NPC_AGGRO_RANGE_MULTIPLIER = 2;
const TERRITORIAL_ECOLOGY_AGGRO_RADIUS = 90;
const NEUTRAL_ON_SIGHT_ECOLOGY_TAGS = new Set<WorldCreatureEcologyTag>(["neutral-on-sight"]);
const TERRITORIAL_ECOLOGY_TAGS = new Set<WorldCreatureEcologyTag>(["territorial"]);
const STRONG_ENEMY_KINDS = new Set([
  "stone-crawler",
  "alpha-timberwolf",
  "crag-gargoyle",
  "void-sent-sentinel",
  "dungeon-revenant"
]);
const NATURE_ALLIANCE_BEAST_KINDS = new Set(["prowling-wolf", "alpha-timberwolf", "ash-bramble-stalker", "aggro-tree", "gloom-weaver-spider", "bramble-beast", "timber-goliath", "ashwood-alpha", "moss-grizzly"]);
const EMPTY_ECOLOGY_TAGS: readonly WorldCreatureEcologyTag[] = [];

function worldCreatureEcologyTags(kind: string): readonly WorldCreatureEcologyTag[] {
  return WORLD_CREATURE_BY_ID.get(kind)?.ecologyTags ?? EMPTY_ECOLOGY_TAGS;
}

function hasWorldCreatureEcologyTag(kind: string, tags: ReadonlySet<WorldCreatureEcologyTag>) {
  return worldCreatureEcologyTags(kind).some((tag) => tags.has(tag));
}

function isNpcProvoked(npc: NpcEntity) {
  return npc.hp < npc.maxHp || npc.summonedBy.length > 0 || combatFlagValue(npc, "aggro").length > 0;
}

function npcAggroRadius(npc: NpcEntity) {
  const base = npc.role === "boss" ? NPC_BOSS_AGGRO_RADIUS : NPC_BASE_AGGRO_RADIUS;
  const doubled = base * NPC_AGGRO_RANGE_MULTIPLIER;
  if (npc.role === "boss" || isNpcProvoked(npc)) return doubled;
  if (hasWorldCreatureEcologyTag(npc.kind, NEUTRAL_ON_SIGHT_ECOLOGY_TAGS)) return 0;
  if (hasWorldCreatureEcologyTag(npc.kind, TERRITORIAL_ECOLOGY_TAGS)) return TERRITORIAL_ECOLOGY_AGGRO_RADIUS;
  return doubled;
}

function isStrongEnemyKind(kind: string) {
  const role = roleForKind(kind);
  const combatClass = bestiaryFor(kind).combat.class;
  return role === "elite" || role === "boss" || combatClass === "elite" || combatClass === "boss" || bestiaryFor(kind).combat.iframePhaseMs !== undefined || STRONG_ENEMY_KINDS.has(kind);
}

function isStrongEnemy(npc: NpcEntity) {
  return npc.hp > 0 && npc.role !== "boss-node" && !isPeaceNpc(npc) && isStrongEnemyKind(npc.kind);
}

function npcPhaseLength(npc: NpcEntity) {
  if (npc.kind === "iron-core-golem") return 45000;
  return isStrongEnemy(npc) ? STRONG_PHASE_MS : 6000;
}

function isNpcInvulnerable(npc: NpcEntity) {
  if (npc.iframeMs > 0) return true;
  if (!isStrongEnemy(npc)) return false;
  const profile = bestiaryFor(npc.kind).combat;
  const end = STRONG_PHASE_INVULN_START_MS + (profile.iframePhaseMs ?? STRONG_PHASE_INVULN_END_MS - STRONG_PHASE_INVULN_START_MS);
  return npc.phaseMs >= STRONG_PHASE_INVULN_START_MS && npc.phaseMs < end;
}

function isNpcBuffed(npc: NpcEntity) {
  if (!isStrongEnemy(npc)) return false;
  const profile = bestiaryFor(npc.kind).combat;
  const end = STRONG_PHASE_INVULN_START_MS + (profile.iframePhaseMs ?? STRONG_PHASE_INVULN_END_MS - STRONG_PHASE_INVULN_START_MS);
  return npc.phaseMs >= end;
}

function npcHealthStrengthMultiplier(kind: string, elite: boolean) {
  const role = roleForKind(kind);
  if (PEACE_NPC_ROLES.has(role) || role === "boss-node") return 1;
  const combatClass = bestiaryFor(kind).combat.class;
  if (role === "boss" || combatClass === "boss") return 4;
  if (elite || role === "elite" || combatClass === "elite") return 3;
  if (STRONG_ENEMY_KINDS.has(kind) || combatClass === "bruiser") return 2.5;
  if (combatClass === "nimble") return 1.8;
  return 1.5;
}

function scaledNpcHp(kind: string, baseHp: number, elite: boolean) {
  return Math.max(1, Math.floor(baseHp * npcHealthStrengthMultiplier(kind, elite)));
}

const NPC_RESPAWN_BASE_MS = {
  mob: 5200,
  elite: 12000,
  boss: 18000,
  bossNode: 16000
} as const;

function npcRespawnBaseMs(npc: NpcEntity) {
  if (npc.role === "boss") return NPC_RESPAWN_BASE_MS.boss;
  if (npc.elite || npc.role === "elite") return NPC_RESPAWN_BASE_MS.elite;
  if (npc.role === "boss-node") return NPC_RESPAWN_BASE_MS.bossNode;
  return NPC_RESPAWN_BASE_MS.mob;
}

function npcRespawnStrengthMultiplier(npc: NpcEntity) {
  const combatClass = bestiaryFor(npc.kind).combat.class;
  if (npc.role === "boss" || combatClass === "boss") return 30;
  if (npc.elite || npc.role === "elite" || combatClass === "elite") return 20;
  if (isStrongEnemyKind(npc.kind) || combatClass === "bruiser") return 15;
  if (combatClass === "nimble") return 12;
  return 10;
}

export function mmoSkillDemoNpcRespawnMs(npc: NpcEntity) {
  if (npc.role === "boss-node") return NPC_RESPAWN_BASE_MS.bossNode;
  return u32Ms(npcRespawnBaseMs(npc) * npcRespawnStrengthMultiplier(npc));
}

function worldEventPool(roomKind: string) {
  if (roomKind === "dungeon-instance") return WORLD_EVENTS.filter((event) => event.zoneId === "dungeon");
  if (roomKind === "cottage-instance") return WORLD_EVENTS.filter((event) => event.zoneId === "cottage");
  return WORLD_EVENTS.filter((event) => event.zoneId !== "dungeon" && event.zoneId !== "cottage");
}

function initialWorldEvent(roomKind: string) {
  return worldEventPool(roomKind)[0] ?? WORLD_EVENTS[0];
}

function activeWorldEvent(state: MmoSkillDemoState) {
  return WORLD_EVENTS.find((event) => event.id === state.worldEventId) ?? initialWorldEvent(state.roomKind);
}

function nextWorldEvent(state: MmoSkillDemoState) {
  const pool = worldEventPool(state.roomKind);
  const current = Math.max(0, pool.findIndex((event) => event.id === state.worldEventId));
  return pool[(current + 1) % Math.max(1, pool.length)] ?? initialWorldEvent(state.roomKind);
}

function assignWorldEvent(state: MmoSkillDemoState, event: WorldEventDef) {
  state.worldEventId = event.id;
  state.worldEventName = event.name;
  state.worldEventZoneId = event.zoneId;
  state.worldEventPhase = "active";
  state.worldEventObjective = event.objective;
  state.worldEventProgress = 0;
  state.worldEventGoal = event.goal;
  state.worldEventTimerMs = event.durationMs;
  state.worldEventReward = event.rewardText;
}

export function createMmoSkillDemoState(roomId = "ashwood"): MmoSkillDemoState {
  const descriptor = describeRoom(roomId);
  const worldEvent = initialWorldEvent(descriptor.roomKind);
  const resources = descriptor.roomKind === "world-zone" ? extractMmoSkillDemoResources() : [];
  return syncMmoEntityRegistry({
    tick: 0,
    mapRevision: MAP_REVISION,
    roomKind: descriptor.roomKind,
    roomLabel: descriptor.roomLabel,
    activePlayers: 0,
    worldEventId: worldEvent.id,
    worldEventName: worldEvent.name,
    worldEventZoneId: worldEvent.zoneId,
    worldEventPhase: "active",
    worldEventObjective: worldEvent.objective,
    worldEventProgress: 0,
    worldEventGoal: worldEvent.goal,
    worldEventTimerMs: worldEvent.durationMs,
    worldEventReward: worldEvent.rewardText,
    effects: [],
    entities: {},
    players: {},
    npcs: Object.fromEntries(createNpcSpawns(descriptor.roomKind).map((npc) => [npc.id, npc])),
    resources: Object.fromEntries(resources.map((node) => [node.id, node])),
    loots: {},
    hazards: {}
  });
}

function createNpcSpawns(roomKind: RoomKind = "world-zone"): NpcEntity[] {
  type SpawnSpot = { kind: string; x: number; y: number; hp: number; elite: boolean; zoneId?: ZoneId };
  const hostileTownBufferTiles = Math.ceil((960 / TILE) * 1.5) + 2;
  const protectedTownTiles = mmoSkillDemoRegionConfig.anchors
    .filter((anchor) => anchor.kind === "town" || anchor.id === "obsidian-sanctum")
    .map((anchor) => ({ id: anchor.id, x: anchor.tileX, y: anchor.tileY }));
  const near = (anchorId: string, dx: number, dy: number, spot: Omit<SpawnSpot, "x" | "y">): SpawnSpot => {
    const tile = getMmoSkillDemoAnchorTile(anchorId);
    return {
      ...spot,
      x: tile.x + dx,
      y: tile.y + dy
    };
  };
  const isHostileSpot = (spot: SpawnSpot) => {
    const role = roleForKind(spot.kind);
    return role !== "boss-node" && !PEACE_NPC_ROLES.has(role);
  };
  const outsideTownBuffer = (spot: SpawnSpot): SpawnSpot => {
    if (!isHostileSpot(spot)) return spot;
    const safeDistanceFromTowns = (x: number, y: number) => Math.min(...protectedTownTiles.map((town) => Math.hypot(x - town.x, y - town.y)));
    const isOutsideEveryTownBuffer = (x: number, y: number) => safeDistanceFromTowns(x, y) >= hostileTownBufferTiles;
    const clampedPoint = (x: number, y: number) => ({
      x: Math.max(1, Math.min(MAP_WIDTH - 2, x)),
      y: Math.max(1, Math.min(MAP_HEIGHT - 2, y))
    });
    const fallbackOutsideTownBuffer = (originX: number, originY: number) => {
      const ring = hostileTownBufferTiles + 4;
      const angles = [
        0,
        Math.PI,
        Math.PI / 2,
        -Math.PI / 2,
        Math.PI / 4,
        -Math.PI / 4,
        (3 * Math.PI) / 4,
        (-3 * Math.PI) / 4,
        Math.PI / 8,
        -Math.PI / 8,
        (7 * Math.PI) / 8,
        (-7 * Math.PI) / 8
      ];
      let best: { x: number; y: number; score: number } | undefined;
      const nearestFirst = [...protectedTownTiles].sort((left, right) => Math.hypot(originX - left.x, originY - left.y) - Math.hypot(originX - right.x, originY - right.y));
      for (const town of nearestFirst) {
        for (const angle of angles) {
          const candidate = clampedPoint(town.x + Math.cos(angle) * ring, town.y + Math.sin(angle) * ring);
          if (!isOutsideEveryTownBuffer(candidate.x, candidate.y)) continue;
          const score = Math.hypot(candidate.x - originX, candidate.y - originY);
          if (!best || score < best.score) best = { ...candidate, score };
        }
      }
      return best ? { x: best.x, y: best.y } : clampedPoint(originX, originY);
    };
    let x = spot.x;
    let y = spot.y;
    for (let pass = 0; pass < 8; pass += 1) {
      let nearest = protectedTownTiles[0];
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const town of protectedTownTiles) {
        const distance = Math.hypot(x - town.x, y - town.y);
        if (distance < nearestDistance) {
          nearest = town;
          nearestDistance = distance;
        }
      }
      if (!nearest || nearestDistance >= hostileTownBufferTiles) break;
      let dx = x - nearest.x;
      let dy = y - nearest.y;
      if (nearestDistance < 0.001) {
        dx = spot.kind.length % 2 === 0 ? 1 : -1;
        dy = spot.kind.length % 3 === 0 ? 1 : -1;
        nearestDistance = Math.hypot(dx, dy);
      }
      const push = hostileTownBufferTiles - nearestDistance + 4;
      x += (dx / nearestDistance) * push;
      y += (dy / nearestDistance) * push;
      x = Math.max(1, Math.min(MAP_WIDTH - 2, x));
      y = Math.max(1, Math.min(MAP_HEIGHT - 2, y));
    }
    if (!isOutsideEveryTownBuffer(x, y)) {
      const fallback = fallbackOutsideTownBuffer(spot.x, spot.y);
      x = fallback.x;
      y = fallback.y;
    }
    return { ...spot, x: Math.round(x), y: Math.round(y) };
  };
  const creatureHp = (kind: string) => {
    const profile = bestiaryFor(kind).combat;
    if (profile.class === "boss") return 220;
    if (profile.class === "elite") return 112;
    if (profile.class === "bruiser") return 68;
    if (profile.class === "nimble") return 42;
    if (profile.class === "node") return 34;
    return 32;
  };
  const creatureElite = (kind: string) => {
    const profile = bestiaryFor(kind).combat;
    return profile.class === "elite" || profile.class === "boss";
  };
  const campSpots = (
    anchorId: string,
    dx: number,
    dy: number,
    zoneId: ZoneId,
    members: Array<{ kind: string; ox: number; oy: number; hp?: number; elite?: boolean }>
  ): SpawnSpot[] =>
    members.map((member) =>
      near(anchorId, dx + member.ox, dy + member.oy, {
        kind: member.kind,
        hp: member.hp ?? creatureHp(member.kind),
        elite: member.elite ?? creatureElite(member.kind),
        zoneId
      })
    );
  const creatureAnchor = (zoneId: ZoneId, location: string) => {
    const key = location.toLowerCase();
    if (zoneId === "ashwood-wilderness") return "ashwood-glade";
    if (zoneId === "ashwood") return "overgrown-thicket";
    if (zoneId === "crags") return key.includes("fissure") || key.includes("geode") ? "deep-fissure" : "ironcrag";
    if (zoneId === "holy-reach") return "aetheria";
    if (zoneId === "port-marrow") return "port-marrow";
    if (zoneId === "canaan-desert") return key.includes("spire") ? "sunken-spire" : "sunken-bazaar";
    if (zoneId === "void-rift") return key.includes("obsidian") ? "obsidian-sanctum" : "void-rift";
    if (zoneId === "whisperwind-ascent") return "high-reach-peaks";
    if (zoneId === "dungeon") return key.includes("mirror") ? "sunken-spire" : "deep-fissure";
    return "oakhaven";
  };
  const expandedCreatureSpots = (wantedZone: "world" | "dungeon") =>
    worldCreatureDefinitions.flatMap((creature, index): SpawnSpot[] => {
      const zoneId = catalogZoneForLocation(creature.location);
      const profile = bestiaryFor(creature.id).combat;
      if (profile.class === "node") return [];
      if (wantedZone === "world" && zoneId === "dungeon") return [];
      if (wantedZone === "dungeon" && zoneId !== "dungeon") return [];
      const lane = index % 6;
      const ring = Math.floor(index / 6) % 3;
      const dx = ((lane % 3) - 1) * 4 + (ring === 2 ? 2 : 0);
      const dy = Math.floor(lane / 3) * 4 + 3 + ring * 2;
      return [
        near(creatureAnchor(zoneId, creature.location), dx, dy, {
          kind: creature.id,
          hp: creatureHp(creature.id),
          elite: profile.class === "elite" || profile.class === "boss",
          zoneId: zoneSchemaAlias(zoneId)
        })
      ];
    });
  const regionNpcSpots: SpawnSpot[] = resolveMmoSkillDemoNpcSpawns().map((npc) => ({
    kind: npc.kind,
    x: npc.tileX,
    y: npc.tileY,
    hp: 120,
    elite: false,
    zoneId: zoneForPoint(npc.tileX * TILE, npc.tileY * TILE)
  }));
  const expandedWorldCreatureSpots = expandedCreatureSpots("world");
  const expandedDungeonCreatureSpots = expandedCreatureSpots("dungeon").map((spot) => ({ ...spot, zoneId: "dungeon" as ZoneId }));
  const enemyCampSpots: SpawnSpot[] = [
    ...campSpots("overgrown-thicket", 72, 4, "ashwood", [
      { kind: "prowling-wolf", ox: 0, oy: 0 },
      { kind: "gloom-weaver-spider", ox: 3, oy: 2 },
      { kind: "ashwood-alpha", ox: -3, oy: 3 }
    ]),
    ...campSpots("ashwood-glade", 56, 4, "ashwood-wilderness", [
      { kind: "bramble-beast", ox: 0, oy: 0 },
      { kind: "ashwood-alpha", ox: 3, oy: 2 },
      { kind: "spore-pod", ox: -3, oy: 3 }
    ]),
    ...campSpots("ironcrag", 76, -8, "crags", [
      { kind: "sapper-goblin", ox: 0, oy: 0 },
      { kind: "rust-biter", ox: 3, oy: 2 },
      { kind: "soot-crab", ox: -3, oy: 3 }
    ]),
    ...campSpots("port-marrow", -54, -4, "port-marrow", [
      { kind: "marrow-cove-rat", ox: 0, oy: 0 },
      { kind: "grave-stalker", ox: 3, oy: 2 },
      { kind: "tide-stalker", ox: -3, oy: 3 }
    ]),
    ...campSpots("port-marrow", 30, -50, "port-marrow", [
      { kind: "grave-stalker", ox: 0, oy: 0 },
      { kind: "marrow-cove-rat", ox: 3, oy: 2 },
      { kind: "tide-stalker", ox: -3, oy: 3 }
    ]),
    ...campSpots("aetheria", 64, 20, "holy-reach", [
      { kind: "spire-sentinel", ox: 0, oy: 0 },
      { kind: "anointed-crusader", ox: 3, oy: 2 },
      { kind: "aether-drifter", ox: -3, oy: 3 }
    ]),
    ...campSpots("aetheria", 36, -36, "holy-reach", [
      { kind: "anointed-crusader", ox: 0, oy: 0 },
      { kind: "spire-sentinel", ox: 3, oy: 2 },
      { kind: "aether-drifter", ox: -3, oy: 3 }
    ]),
    ...campSpots("high-reach-peaks", 64, -10, "whisperwind-ascent", [
      { kind: "high-peak-eagle", ox: 0, oy: 0 },
      { kind: "moss-grizzly", ox: 3, oy: 2 },
      { kind: "aether-drifter", ox: -3, oy: 3 }
    ]),
    ...campSpots("sunken-bazaar", 54, -20, "canaan-desert", [
      { kind: "scavenger-jackal", ox: 0, oy: 0 },
      { kind: "tallow-wraith", ox: 3, oy: 2 },
      { kind: "ruins-archer", ox: -3, oy: 3 }
    ]),
    ...campSpots("void-rift", -64, 4, "void-rift", [
      { kind: "rift-leech", ox: 0, oy: 0 },
      { kind: "void-leper", ox: 3, oy: 2 },
      { kind: "cursed-oracle", ox: -3, oy: 3 }
    ]),
    ...campSpots("void-rift", -6, 50, "void-rift", [
      { kind: "void-leper", ox: 0, oy: 0 },
      { kind: "cursed-oracle", ox: 3, oy: -2 },
      { kind: "rift-leech", ox: -3, oy: -3 }
    ]),
    ...campSpots("void-rift", 68, 50, "void-rift", [
      { kind: "rift-leech", ox: 0, oy: 0 },
      { kind: "void-crawler", ox: 3, oy: -2 },
      { kind: "cursed-oracle", ox: -3, oy: -3 }
    ]),
    ...campSpots("obsidian-sanctum", 92, 7, "void-rift", [
      { kind: "void-gargoyle", ox: 0, oy: 0 },
      { kind: "rift-leech", ox: 3, oy: 2 },
      { kind: "void-crawler", ox: -3, oy: 3 }
    ]),
    ...campSpots("obsidian-sanctum", 148, 4, "void-rift", [
      { kind: "rift-leech", ox: 0, oy: 0 },
      { kind: "void-gargoyle", ox: 3, oy: 2 },
      { kind: "void-crawler", ox: -3, oy: 3 }
    ]),
    ...campSpots("obsidian-sanctum", 192, 2, "void-rift", [
      { kind: "rift-leech", ox: 0, oy: 0 },
      { kind: "void-crawler", ox: 3, oy: 2 },
      { kind: "cursed-oracle", ox: -3, oy: 3 }
    ]),
    ...campSpots("obsidian-sanctum", 248, 3, "void-rift", [
      { kind: "cursed-oracle", ox: 0, oy: 0 },
      { kind: "void-amalgam", ox: 3, oy: 2 },
      { kind: "rift-leech", ox: -3, oy: 3 }
    ]),
    ...campSpots("obsidian-sanctum", 292, 3, "void-rift", [
      { kind: "void-amalgam", ox: 0, oy: 0 },
      { kind: "void-gargoyle", ox: 3, oy: 2 },
      { kind: "rift-leech", ox: -3, oy: 3 }
    ]),
    ...campSpots("obsidian-sanctum", 380, 7, "void-rift", [
      { kind: "void-crawler", ox: 0, oy: 0 },
      { kind: "void-gargoyle", ox: 3, oy: 2 },
      { kind: "rift-leech", ox: -3, oy: 3 }
    ]),
    ...campSpots("obsidian-sanctum", 464, 4, "void-rift", [
      { kind: "void-amalgam", ox: 0, oy: 0 },
      { kind: "cursed-oracle", ox: 3, oy: 2 },
      { kind: "void-crawler", ox: -3, oy: 3 }
    ]),
    ...campSpots("obsidian-sanctum", 528, -2, "void-rift", [
      { kind: "cursed-oracle", ox: 0, oy: 0 },
      { kind: "void-amalgam", ox: 3, oy: 2 },
      { kind: "void-crawler", ox: -3, oy: 3 }
    ])
  ];
  const worldSpots: SpawnSpot[] = [
    ...regionNpcSpots,
    ...expandedWorldCreatureSpots,
    near("ironcrag", 3, -2, { kind: "foreman-iron-will", hp: 120, elite: false, zoneId: "crags" }),
    near("aetheria", -2, 1, { kind: "banker-valerius", hp: 120, elite: false, zoneId: "holy-reach" }),
    near("aetheria", 2, 2, { kind: "inquisitor-joran", hp: 120, elite: false, zoneId: "holy-reach" }),
    near("aetheria", 4, 1, { kind: "purifier-sarah", hp: 120, elite: false, zoneId: "holy-reach" }),
    near("aetheria", 1, -3, { kind: "captain-marrow", hp: 120, elite: false, zoneId: "holy-reach" }),
    near("aetheria", 0, -4, { kind: "contract-board", hp: 120, elite: false, zoneId: "holy-reach" }),
    near("port-marrow", -3, 1, { kind: "banker-valerius", hp: 120, elite: false, zoneId: "port-marrow" }),
    near("port-marrow", 3, 1, { kind: "merchant-kaya", hp: 120, elite: false, zoneId: "port-marrow" }),
    near("port-marrow", 0, -3, { kind: "contract-board", hp: 120, elite: false, zoneId: "port-marrow" }),
    near("sunken-bazaar", -3, 2, { kind: "broker-rex", hp: 120, elite: false, zoneId: "canaan-desert" }),
    near("sunken-bazaar", 1, 2, { kind: "appraiser-chloe", hp: 120, elite: false, zoneId: "canaan-desert" }),
    near("sunken-bazaar", 4, -1, { kind: "captain-marrow", hp: 120, elite: false, zoneId: "canaan-desert" }),
    near("ashwood-glade", -2, 3, { kind: "shaman-corvus", hp: 120, elite: false, zoneId: "ashwood-wilderness" }),
    near("ashwood-glade", 2, 2, { kind: "hunter-keera", hp: 120, elite: false, zoneId: "ashwood-wilderness" }),
    near("ashwood-glade", 4, -1, { kind: "runner-kael", hp: 120, elite: false, zoneId: "ashwood-wilderness" }),
    near("high-reach-peaks", -3, 1, { kind: "monastic-scholar-jin", hp: 120, elite: false, zoneId: "whisperwind-ascent" }),
    near("high-reach-peaks", 2, 2, { kind: "guardian-tariq", hp: 120, elite: false, zoneId: "whisperwind-ascent" }),
    near("high-reach-peaks", 4, -1, { kind: "navigator-kai", hp: 120, elite: false, zoneId: "whisperwind-ascent" }),
    near("void-rift", -4, 3, { kind: "master-kael", hp: 120, elite: false, zoneId: "void-rift" }),
    near("void-rift", 3, 4, { kind: "captain-marrow", hp: 120, elite: false, zoneId: "void-rift" }),
    near("obsidian-sanctum", 1, 2, { kind: "acolyte-lyros", hp: 120, elite: false, zoneId: "void-rift" }),
    near("oakhaven", 4, 2, { kind: "apprentice-jinn", hp: 120, elite: false, zoneId: "ashwood" }),
    near("void-rift", -8, 5, { kind: "cursed-statue", hp: 120, elite: false, zoneId: "void-rift" }),
    near("aetheria", 4, -2, { kind: "innkeeper-martha", hp: 120, elite: false, zoneId: "holy-reach" }),
    near("oakhaven", -1, 4, { kind: "contract-board", hp: 120, elite: false, zoneId: "ashwood" }),
    near("oakhaven", 1, 4, { kind: "banker-valerius", hp: 120, elite: false, zoneId: "ashwood" }),
    near("ironcrag", 0, 4, { kind: "banker-valerius", hp: 120, elite: false, zoneId: "crags" }),
    near("ironcrag", 2, 4, { kind: "contract-board", hp: 120, elite: false, zoneId: "crags" }),
    near("port-marrow", -1, 4, { kind: "runner-kael", hp: 120, elite: false, zoneId: "port-marrow" }),
    near("sunken-bazaar", 0, 4, { kind: "contract-board", hp: 120, elite: false, zoneId: "canaan-desert" }),
    near("sunken-bazaar", 2, 4, { kind: "banker-valerius", hp: 120, elite: false, zoneId: "canaan-desert" }),
    near("ashwood-glade", 0, 4, { kind: "thorne-the-wild", hp: 120, elite: false, zoneId: "ashwood-wilderness" }),
    near("ashwood-glade", -4, 1, { kind: "contract-board", hp: 120, elite: false, zoneId: "ashwood-wilderness" }),
    near("high-reach-peaks", 0, 4, { kind: "contract-board", hp: 120, elite: false, zoneId: "whisperwind-ascent" }),
    near("high-reach-peaks", -4, 3, { kind: "banker-valerius", hp: 120, elite: false, zoneId: "whisperwind-ascent" }),
    near("obsidian-sanctum", -1, 4, { kind: "contract-board", hp: 120, elite: false, zoneId: "void-rift" }),
    near("obsidian-sanctum", 4, 3, { kind: "alchemist-zora", hp: 120, elite: false, zoneId: "void-rift" }),
    near("overgrown-thicket", -4, -2, { kind: "prowling-wolf", hp: 26, elite: false, zoneId: "ashwood" }),
    near("oakhaven", 6, -5, { kind: "prowling-wolf", hp: 26, elite: false, zoneId: "ashwood" }),
    near("overgrown-thicket", 3, 2, { kind: "prowling-wolf", hp: 28, elite: false, zoneId: "ashwood" }),
    near("oakhaven", -5, 4, { kind: "prowling-wolf", hp: 28, elite: false, zoneId: "ashwood" }),
    near("overgrown-thicket", 0, 4, { kind: "ash-bramble-stalker", hp: 48, elite: false, zoneId: "ashwood" }),
    near("overgrown-thicket", 5, 1, { kind: "aggro-tree", hp: 38, elite: false, zoneId: "ashwood" }),
    near("oakhaven", -6, 6, { kind: "aggro-tree", hp: 42, elite: false, zoneId: "ashwood" }),
    near("overgrown-thicket", 7, -2, { kind: "alpha-timberwolf", hp: 92, elite: true, zoneId: "ashwood" }),
    near("ironcrag", -4, -4, { kind: "iron-eye-bat", hp: 22, elite: false, zoneId: "crags" }),
    near("deep-fissure", -3, 0, { kind: "iron-eye-bat", hp: 22, elite: false, zoneId: "crags" }),
    near("deep-fissure", 2, 3, { kind: "stone-crawler", hp: 46, elite: false, zoneId: "crags" }),
    near("ironcrag", 5, 4, { kind: "stone-crawler", hp: 48, elite: false, zoneId: "crags" }),
    near("deep-fissure", 4, -2, { kind: "crystal-beetle", hp: 54, elite: false, zoneId: "crags" }),
    near("ironcrag", -5, 4, { kind: "crystal-beetle", hp: 54, elite: false, zoneId: "crags" }),
    near("deep-fissure", 6, 1, { kind: "crag-sapper", hp: 58, elite: false, zoneId: "crags" }),
    near("deep-fissure", -6, 4, { kind: "crag-gargoyle", hp: 96, elite: true, zoneId: "crags" }),
    near("sunken-spire", 4, -3, { kind: "sand-wraith", hp: 34, elite: false, zoneId: "canaan-desert" }),
    near("void-rift", -3, -2, { kind: "cursed-archer", hp: 32, elite: false, zoneId: "void-rift" }),
    near("sunken-spire", -3, 2, { kind: "mire-bomber", hp: 40, elite: false, zoneId: "canaan-desert" }),
    near("void-rift", 1, 4, { kind: "mire-bomber", hp: 40, elite: false, zoneId: "void-rift" }),
    near("sunken-spire", 1, 4, { kind: "rune-priest", hp: 44, elite: false, zoneId: "canaan-desert" }),
    near("sunken-spire", -5, 4, { kind: "veil-oracle", hp: 64, elite: false, zoneId: "canaan-desert" }),
    near("void-rift", 4, 1, { kind: "void-sent-sentinel", hp: 104, elite: true, zoneId: "void-rift" }),
    near("void-rift", -6, -4, { kind: "bazaar-guard", hp: 88, elite: true, zoneId: "void-rift" }),
    ...enemyCampSpots
  ];
  const dungeonSpots = [
    ...expandedDungeonCreatureSpots,
    near("overgrown-thicket", -2, -1, { kind: "great-ash-lord", hp: 210, elite: true, zoneId: "dungeon" as ZoneId }),
    near("overgrown-thicket", 2, 2, { kind: "ember-acolyte", hp: 46, elite: false, zoneId: "dungeon" as ZoneId }),
    near("deep-fissure", -2, 2, { kind: "dungeon-revenant", hp: 130, elite: true, zoneId: "dungeon" as ZoneId }),
    near("deep-fissure", 1, -2, { kind: "power-node", hp: 42, elite: false, zoneId: "dungeon" as ZoneId }),
    near("deep-fissure", -4, -1, { kind: "power-node", hp: 42, elite: false, zoneId: "dungeon" as ZoneId }),
    near("deep-fissure", 4, 0, { kind: "iron-core-golem", hp: 260, elite: true, zoneId: "dungeon" as ZoneId }),
    near("void-rift", -2, -1, { kind: "power-node", hp: 42, elite: false, zoneId: "dungeon" as ZoneId }),
    near("void-rift", 2, 1, { kind: "ember-acolyte", hp: 46, elite: false, zoneId: "dungeon" as ZoneId }),
    near("void-rift", 5, 3, { kind: "mirror-king", hp: 240, elite: true, zoneId: "dungeon" as ZoneId })
  ];
  const cottageSpots = [
    near("aetheria", -1, 0, { kind: "innkeeper-martha", hp: 120, elite: false, zoneId: "cottage" as ZoneId }),
    near("aetheria", 2, 0, { kind: "banker-valerius", hp: 120, elite: false, zoneId: "cottage" as ZoneId })
  ];
  const spots = roomKind === "dungeon-instance" ? dungeonSpots : roomKind === "cottage-instance" ? cottageSpots : worldSpots;
  const safeSpots = roomKind === "world-zone" ? spots.map(outsideTownBuffer) : spots;
  return safeSpots.map((spot, index) => {
    const point = tileToWorld(mmoSkillDemoMap, spot.x, spot.y, "center");
    const zoneId = "zoneId" in spot && spot.zoneId ? zoneSchemaAlias(spot.zoneId) : zoneForPoint(point.x, point.y);
    const hp = scaledNpcHp(spot.kind, spot.hp, spot.elite);
    const bestiary = bestiaryFor(spot.kind);
    return {
      id: `${spot.kind}-${String(index + 1).padStart(2, "0")}`,
      entityType: "npc",
      kind: spot.kind,
      role: roleForKind(spot.kind),
      zoneId,
      elite: spot.elite,
      personality: bestiary.personality,
      impactType: bestiary.combat.impactType,
      knockbackModifier: bestiary.combat.knockbackModifier,
      x: point.x,
      y: point.y,
      spawnX: point.x,
      spawnY: point.y,
      hp,
      maxHp: hp,
      respawnMs: 0,
      attackCooldownMs: 900 + index * 60,
      projectileCooldownMs: 1200 + index * 75,
      phaseMs: 0,
      summonedBy: "",
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
  });
}

function spawnAtAnchor(anchorId: string, playerId: string, columns: number) {
  const lane = Number(playerId.replace(/\D/g, "")) % 8;
  const anchor = getMmoSkillDemoAnchorTile(anchorId);
  return tileToWorld(mmoSkillDemoMap, anchor.x + (lane % columns), anchor.y + Math.floor(lane / columns), "center");
}

function worldSpawnForPlayer(playerId: string) {
  return spawnAtAnchor("oakhaven", playerId, 4);
}

function defaultWorldPosition(playerId: string) {
  const point = worldSpawnForPlayer(playerId);
  return { x: point.x, y: point.y, zoneId: "ashwood" as ZoneId };
}

function isInstanceZone(zoneId: ZoneId | undefined) {
  return zoneId === "dungeon" || zoneId === "cottage";
}

function savedWorldZone(saved: Pick<SavedCharacter, "x" | "y" | "zoneId">) {
  const pointZone = zoneForPoint(saved.x, saved.y);
  return LEGACY_WORLD_ZONE_IDS.has(saved.zoneId) && pointZone !== saved.zoneId ? pointZone : zoneSchemaAlias(saved.zoneId);
}

function createPlayer(playerId: string, userId: string, saved: SavedCharacter | undefined, roomKind: RoomKind, roomId: string): PlayerEntity {
  const renown = saved?.renown ?? 0;
  const masteryRank = Math.max(saved?.masteryRank ?? 1, rankForRenown(renown));
  const spawn =
    roomKind === "dungeon-instance"
      ? spawnAtAnchor("deep-fissure", playerId, 4)
      : roomKind === "cottage-instance"
        ? spawnAtAnchor("aetheria", playerId, 3)
        : worldSpawnForPlayer(playerId);
  const forcedZone = roomKind === "dungeon-instance" ? "dungeon" : roomKind === "cottage-instance" ? "cottage" : undefined;
  const useSavedWorldPosition = !forcedZone && saved && !isInstanceZone(saved.zoneId);
  const startX = forcedZone ? spawn.x : useSavedWorldPosition ? saved.x : spawn.x;
  const startY = forcedZone ? spawn.y : useSavedWorldPosition ? saved.y : spawn.y;
  const startZone = forcedZone ?? (useSavedWorldPosition ? savedWorldZone(saved) : "ashwood");
  const startingGatheringXp = {
    ...(saved?.gatheringXp ?? {}),
    mining: Math.max(saved?.gatheringXp?.mining ?? 0, saved?.miningXp ?? 0),
    lumberjacking: Math.max(saved?.gatheringXp?.lumberjacking ?? 0, saved?.woodcuttingXp ?? 0)
  };
  const player: PlayerEntity = {
    id: playerId,
    entityType: "player",
    name: truncateUtf8(saved?.name ?? userId, 32),
    x: startX,
    y: startY,
    hp: saved?.hp ?? 100,
    maxHp: saved?.maxHp ?? 100,
    mana: saved?.mana ?? 60,
    maxMana: saved?.maxMana ?? 60,
    energy: clamp(saved?.energy ?? 0, 0, MAX_ENERGY),
    maxEnergy: MAX_ENERGY,
    combatXp: saved?.combatXp ?? 0,
    combatLevel: saved?.combatLevel ?? 1,
    miningXp: saved?.miningXp ?? 0,
    miningLevel: saved?.miningLevel ?? 1,
    woodcuttingXp: saved?.woodcuttingXp ?? 0,
    woodcuttingLevel: saved?.woodcuttingLevel ?? 1,
    gatheringXp: startingGatheringXp,
    gatheringLevels: saved?.gatheringLevels ?? {},
    zoneId: startZone,
    gold: saved?.gold ?? 25,
    renown,
    masteryRank,
    contractId: saved?.contractId ?? "ashwood-hunt",
    contractKills: saved?.contractKills ?? 0,
    contractStreak: saved?.contractStreak ?? 0,
    contractCooldownMs: saved?.contractCooldownMs ?? 0,
    inventory: mmoInventory.compact({ ...(saved?.inventory ?? { "glade-berries": 3, "cinder-ale": 1, "training-hatchet": 1 }) }),
    bank: mmoInventory.compact({ ...(saved?.bank ?? {}) }),
    equipment: ensureStartingEquipment(saved?.equipment),
    abilitySlots: { ...DEFAULT_MACE_ABILITY_SET, ...(saved?.abilitySlots ?? {}) },
    cooldowns: {},
    questFlags: { "first-cut-accepted": true, ...(saved?.questFlags ?? {}) },
    activeQuestId: saved?.activeQuestId || "first-cut",
    dailyQuestDate: saved?.dailyQuestDate ?? "",
    dailyQuestStep: saved?.dailyQuestStep ?? 0,
    dailyQuestProgress: saved?.dailyQuestProgress ?? 0,
    dailyQuestCompleted: saved?.dailyQuestCompleted ?? false,
    dailyQuestResult: saved?.dailyQuestResult ?? "",
    wolfKills: saved?.wolfKills ?? 0,
    batKills: saved?.batKills ?? 0,
    bazaarSurvivalMs: saved?.bazaarSurvivalMs ?? 0,
    dungeonBossKills: saved?.dungeonBossKills ?? 0,
    homeZoneId: saved?.homeZoneId ?? "ashwood",
    escortNpcId: "",
    escortTargetX: 0,
    escortTargetY: 0,
    escortTargetZoneId: startZone,
    escortMs: 0,
    instanceId: forcedZone ? roomId.slice(0, 32) : saved?.instanceId ?? "",
    prestigeTitle: saved?.prestigeTitle ?? "",
    action: "idle",
    targetId: "",
    activeGatherNodeId: "",
    activeGatherMaterialId: 0,
    activeGatherSkillId: "",
    activeGatherMs: 0,
    activeGatherTotalMs: 0,
    activeGatherStartX: 0,
    activeGatherStartY: 0,
    activeGatherStartHp: 0,
    aimX: startX,
    aimY: startY,
    guardMs: 0,
    berserkMs: 0,
    cooldownMs: 0,
    equippedWeaponId: (saved?.equipment?.weapon || MACE_WEAPON_ID).slice(0, 32),
    activeAbility: "",
    activeSlot: "",
    activeMs: 0,
    activeDurationMs: 0,
    chargeMs: 0,
    rushDistance: 0,
    abilityVectorX: 1,
    abilityVectorY: 0,
    abilityTickMs: 0,
    abilityHits: "",
    knockbackX: 0,
    knockbackY: 0,
    knockbackMs: 0,
    knockbackHeavy: false,
    stunMs: 0,
    iframeMs: 0,
    castMs: 0,
    damageAmpMs: 0,
    combatFlags: "",
    lastAttackStyle: "",
    visibleCount: 0
  };
  ensureGatheringProgress(player);
  ensureDailyQuestState(player);
  syncFactionReputationRewards(player);
  ensureActiveMainQuest(player);
  return player;
}

function ensureRuntime(roomId: string): ZoneRuntime {
  let runtime = runtimeByRoom.get(roomId);
  if (!runtime) {
    runtime = {
      grid: createInterestGrid({ cellSize: 160, maxEntitiesPerClient: 96, maxEntitiesPerClientByType: { hazard: 16 }, hysteresisCells: 1 }),
      interestIds: new Set(),
      nextInterestIds: new Set(),
      interestCache: new Map(),
      interestScratch: { id: "", type: "", x: 0, y: 0, radius: 0, priority: 0 },
      logicHash: createSpatialHash<LogicSpatialEntity>({ cellSize: 160 }),
      logicIds: new Set(),
      nextLogicIds: new Set(),
      logicScratch: [],
      staticEntitiesByPlayer: new Map(),
      staticDiscoveryQueueByPlayer: new Map(),
      staticAcksByPlayer: new Map(),
      staticSignatureBySegmentId: new Map(),
      staticCellSegmentsBySignature: new Map(),
      volatileCellsByPlayer: new Map(),
      staticTtdSamples: [],
      inputs: new Map(),
      kernel: createMmoSkillDemoCollisionKernel()
    };
    runtimeByRoom.set(roomId, runtime);
  }
  return runtime;
}

function rectAround(entity: { x: number; y: number }, w: number, h: number): RectLike {
  return { x: entity.x - w * 0.5, y: entity.y - h * 0.5, w, h };
}

function canOccupy(kernel: CollisionKernel, x: number, y: number, radius: number = PLAYER_RADIUS) {
  if (x < radius || y < radius || x > mmoSkillDemoMap.pixelWidth - radius || y > mmoSkillDemoMap.pixelHeight - radius) {
    return false;
  }
  return !mmoSkillDemoSolidRectIndex.collidesCircle(x, y, radius, (rect) =>
    kernel.testCircleRectOverlap(x, y, radius, rect.x, rect.y, rect.w, rect.h)
  );
}

function rushEntityRadius(entity: ResourceEntity | NpcEntity) {
  if (entity.entityType === "resource") return (RESOURCE_SIZE_BY_KIND[entity.kind] ?? RESOURCE_SIZE_BY_KIND.ore)!.collisionRadius;
  return bodyRadius(entity);
}

function rushBlockedAt(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, x: number, y: number, radius: number = PLAYER_RADIUS) {
  if (!canOccupy(kernel, x, y, radius)) return true;
  for (const resource of entitiesOfType<ResourceEntity>(state, "resource")) {
    if (resource.zoneId !== player.zoneId || resource.depleted) continue;
    if (Math.hypot(resource.x - x, resource.y - y) < radius + rushEntityRadius(resource)) return true;
  }
  for (const npc of entitiesOfType<NpcEntity>(state, "npc")) {
    if (npc.zoneId !== player.zoneId || npc.hp <= 0) continue;
    if (Math.hypot(npc.x - x, npc.y - y) < radius + rushEntityRadius(npc)) return true;
  }
  return false;
}

function moveRushSwept(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, dx: number, dy: number) {
  const distance = Math.hypot(dx, dy);
  if (distance <= 0) return { movedX: 0, movedY: 0, blocked: false };
  const startX = player.x;
  const startY = player.y;
  const steps = Math.max(1, Math.ceil(distance / Math.max(4, PLAYER_RADIUS * 0.45)));
  const stepX = dx / steps;
  const stepY = dy / steps;
  let blocked = false;
  for (let i = 0; i < steps; i += 1) {
    const nextX = player.x + stepX;
    const nextY = player.y + stepY;
    if (rushBlockedAt(state, kernel, player, nextX, nextY, PLAYER_RADIUS)) {
      blocked = true;
      break;
    }
    player.x = nextX;
    player.y = nextY;
  }
  return { movedX: player.x - startX, movedY: player.y - startY, blocked };
}

type KnockbackBody = Pick<
  PlayerEntity | NpcEntity,
  "x" | "y" | "knockbackX" | "knockbackY" | "knockbackMs" | "knockbackHeavy" | "stunMs" | "iframeMs" | "castMs" | "damageAmpMs"
>;

function bodyRadius(entity: PlayerEntity | NpcEntity) {
  if (entity.entityType === "player") return PLAYER_RADIUS;
  return (NPC_SIZE_BY_KIND[entity.kind] ?? NPC_SIZE_BY_ROLE[entity.role] ?? (entity.elite ? NPC_SIZE_BY_ROLE.elite : NPC_DEFAULT_SIZE)).radius;
}

function decayCombatTimers(entity: KnockbackBody, dt: number) {
  const ms = Math.max(0, Math.floor(dt * 1000));
  entity.stunMs = u16Ms((entity.stunMs || 0) - ms);
  entity.iframeMs = u16Ms((entity.iframeMs || 0) - ms);
  entity.castMs = u16Ms((entity.castMs || 0) - ms);
  entity.damageAmpMs = u16Ms((entity.damageAmpMs || 0) - ms);
}

function applyKnockback(
  target: PlayerEntity | NpcEntity,
  source: { x: number; y: number },
  modifier: number,
  power: number,
  heavyImpact = false
) {
  if (!modifier) return;
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  const minForce = modifier >= 0 ? (modifier >= 0.3 ? 18 : modifier * 60) : 0;
  const force = Math.max(minForce, Math.min(190, Math.abs(modifier) * (18 + power * 2.8)));
  const sign = modifier >= 0 ? 1 : -1;
  target.knockbackX += (dx / length) * force * sign;
  target.knockbackY += (dy / length) * force * sign;
  target.knockbackMs = Math.max(target.knockbackMs || 0, heavyImpact ? 240 : 160);
  target.knockbackHeavy = target.knockbackHeavy || heavyImpact;
}

function updateKnockback(kernel: CollisionKernel, entity: PlayerEntity | NpcEntity, dt: number) {
  if ((entity.knockbackMs || 0) <= 0) return false;
  const duration = Math.max(1, entity.knockbackMs);
  const scale = Math.min(1, (dt * 1000) / duration);
  const moveX = entity.knockbackX * scale;
  const moveY = entity.knockbackY * scale;
  const result = moveMmoCircle(
    entity,
    moveX,
    moveY,
    {
      rectBlocked: () => false,
      circleBlocked: (circle) => !canOccupy(kernel, circle.x, circle.y, circle.radius),
      blockedAt: (x, y, radius) => !canOccupy(kernel, x, y, radius)
    },
    { radius: bodyRadius(entity) }
  );
  if ((result.blockedX || result.blockedY) && entity.knockbackHeavy) {
    entity.stunMs = Math.max(entity.stunMs || 0, 1500);
    entity.castMs = 0;
    if (entity.entityType === "player") clearActiveAbility(entity);
    entity.knockbackX = 0;
    entity.knockbackY = 0;
    entity.knockbackMs = 0;
    entity.knockbackHeavy = false;
    return true;
  }
  entity.knockbackX -= moveX;
  entity.knockbackY -= moveY;
  entity.knockbackMs = u16Ms(entity.knockbackMs - Math.max(0, Math.floor(dt * 1000)));
  if (entity.knockbackMs <= 0) {
    entity.knockbackX = 0;
    entity.knockbackY = 0;
    entity.knockbackHeavy = false;
  }
  return true;
}

function knockbackSourceForHazard(hazard: HazardEntity, owner: NpcEntity | undefined) {
  if (owner) return { ...owner, effectKind: hazard.effectKind };
  return { x: hazard.x, y: hazard.y, effectKind: hazard.effectKind };
}

function attackStyleForAction(action: MmoSkillDemoAction, player?: PlayerEntity) {
  const magicWeapon = player ? equippedWeaponForPlayer(player) === STAFF_WEAPON_ID || equippedWeaponForPlayer(player) === WAND_WEAPON_ID : false;
  if (magicWeapon && (action === "lmb" || action === "attack" || action === "rmb" || action === "space" || action === "q" || action === "e" || action === "r")) return "spell";
  if (action === "q" || action === "e") return "spell";
  if (action === "lmb" || action === "attack" || action === "rmb" || action === "space" || action === "r") return "melee";
  return "";
}

function addCombatFlag(npc: NpcEntity, flag: string) {
  npc.combatFlags = addMmoStatus(npc.combatFlags, flag, { maxLength: 96 });
}

function hasCombatFlag(npc: NpcEntity, flag: string) {
  return hasMmoStatus(npc.combatFlags, flag);
}

function removeCombatFlag(npc: NpcEntity, flag: string) {
  npc.combatFlags = removeMmoStatus(npc.combatFlags, flag, { maxLength: 96 });
}

function combatFlagParts(npc: NpcEntity) {
  return (npc.combatFlags || "").split("|").filter(Boolean);
}

function combatFlagValue(npc: NpcEntity, prefix: string) {
  const needle = `${prefix}:`;
  return combatFlagParts(npc).find((part) => part.startsWith(needle))?.slice(needle.length) ?? "";
}

function npcFlagStacks(npc: NpcEntity, prefix: string) {
  return mmoStatusStacks(npc.combatFlags, prefix);
}

function setNpcFlagStacks(npc: NpcEntity, prefix: string, stacks: number) {
  npc.combatFlags = setMmoStatusStacks(npc.combatFlags, prefix, stacks, { maxLength: 96, maxEntries: 8 });
}

function addTimedNpcFlag(npc: NpcEntity, flag: string, durationMs: number) {
  addCombatFlag(npc, flag);
  npc.damageAmpMs = Math.max(npc.damageAmpMs, durationMs);
}

function applyNpcPoison(npc: NpcEntity, stacks = 1, durationMs = 4000) {
  setNpcFlagStacks(npc, "poison", Math.min(3, npcFlagStacks(npc, "poison") + Math.max(1, Math.floor(stacks))));
  npc.damageAmpMs = Math.max(npc.damageAmpMs, durationMs);
}

function consumeNpcPoison(npc: NpcEntity) {
  const stacks = npcFlagStacks(npc, "poison");
  setNpcFlagStacks(npc, "poison", 0);
  return stacks;
}

function hasPlayerCombatFlag(player: PlayerEntity, flag: string) {
  return hasMmoStatus(player.combatFlags, flag);
}

function addPlayerCombatFlag(player: PlayerEntity, flag: string) {
  player.combatFlags = addMmoStatus(player.combatFlags, flag, { maxLength: 96 });
}

function removePlayerCombatFlag(player: PlayerEntity, flag: string) {
  player.combatFlags = removeMmoStatus(player.combatFlags, flag, { maxLength: 96 });
}

function playerCombatFlagParts(player: PlayerEntity) {
  return (player.combatFlags || "").split("|").filter(Boolean);
}

function playerFlagStacks(player: PlayerEntity, prefix: string) {
  return mmoStatusStacks(player.combatFlags, prefix);
}

function setPlayerFlagStacks(player: PlayerEntity, prefix: string, stacks: number) {
  player.combatFlags = setMmoStatusStacks(player.combatFlags, prefix, stacks, { maxLength: 96, maxEntries: 8 });
}

function hasTimedPlayerFlag(player: PlayerEntity, flag: string) {
  return hasPlayerCombatFlag(player, flag) && player.damageAmpMs > 0;
}

function addTimedPlayerFlag(player: PlayerEntity, flag: string, durationMs: number) {
  addPlayerCombatFlag(player, flag);
  player.damageAmpMs = Math.max(player.damageAmpMs, durationMs);
}

function addPlayerMsFlag(player: PlayerEntity, prefix: string, durationMs: number) {
  setPlayerFlagStacks(player, prefix, Math.max(playerFlagStacks(player, prefix), u16Ms(durationMs)));
}

function tickPlayerMsFlag(player: PlayerEntity, prefix: string, ms: number) {
  const remainingMs = playerFlagStacks(player, prefix);
  if (remainingMs <= 0) return;
  setPlayerFlagStacks(player, prefix, u16Ms(remainingMs - ms));
}

function consumePlayerFlagStack(player: PlayerEntity, prefix: string) {
  const stacks = playerFlagStacks(player, prefix);
  if (stacks <= 0) return false;
  setPlayerFlagStacks(player, prefix, stacks - 1);
  return true;
}

function setCooldown(player: PlayerEntity, action: keyof typeof ACTION_COOLDOWN_MS) {
  const slot = ACTION_TO_SLOT[action as MmoSkillDemoAction];
  const def = slot ? abilityDefForSlot(player, slot) : undefined;
  if (slot && def) setSlotCooldown(player, slot, def.cooldownMs);
  else setUtilityCooldown(player, action);
}

function playerHasTool(player: PlayerEntity, toolId: string) {
  return hasInventoryItem(player, toolId) || hasGear(player, toolId);
}

function spendMana(player: PlayerEntity, cost: number) {
  const effectiveCost = hasFactionReward(player, "high-reach-peaks-clear-mind") ? Math.max(1, Math.floor(cost * 0.9)) : cost;
  if (player.mana >= effectiveCost) {
    player.mana -= effectiveCost;
    return true;
  }
  if (spendItem(player, "cinder-ale")) {
    player.mana = Math.min(player.maxMana, player.mana + 36);
  }
  if (player.mana < effectiveCost) return false;
  player.mana -= effectiveCost;
  return true;
}

function useConsumable(player: PlayerEntity, itemId: string) {
  const id = canonicalItemId(itemId);
  const result = useMmoConsumable(player, player.inventory as MmoInventoryMap, id, {
    "glade-berries": {
      canUse: ({ actor }) => actor.hp < actor.maxHp,
      apply: ({ actor }) => {
        actor.hp = Math.min(actor.maxHp, actor.hp + 24);
      }
    },
    "cinder-ale": {
      canUse: ({ actor }) => actor.mana < actor.maxMana,
      apply: ({ actor }) => {
        actor.mana = Math.min(actor.maxMana, actor.mana + 36);
      }
    },
    "speed-potion": {
      canUse: ({ actor }) => actor.berserkMs < 800,
      apply: ({ actor }) => {
        actor.berserkMs = Math.max(actor.berserkMs, 2200);
      }
    }
  });
  return result.ok;
}

function playerDamageBonus(player: PlayerEntity) {
  const heavyStrike = hasFactionReward(player, "ironcrag-heavy-strike") && (player.action === "attack" || player.action === "lmb") ? 5 : 0;
  return Math.floor(player.masteryRank / 2) + (hasInventoryItem(player, "elite-weapon") ? 5 : 0) + heavyStrike;
}

function berserkFactor(player: PlayerEntity) {
  return clamp((player.berserkMs || 0) / 3000, 0, 1);
}

function factionMovementHaste(player: PlayerEntity, zoneId = player.zoneId) {
  let haste = 0;
  if ((zoneId === "ashwood" || zoneId === "ashwood-wilderness") && hasFactionReward(player, "oakhaven-forest-step")) haste += 0.1;
  if (zoneId === "port-marrow" && hasFactionReward(player, "port-marrow-wind-walker")) haste += 0.15;
  if ((zoneId === "crags" || zoneId === "whisperwind-ascent") && hasFactionReward(player, "high-reach-peaks-wind-leap")) haste += 0.08;
  return haste;
}

function shouldNpcIgnorePlayerForFaction(npc: NpcEntity, player: PlayerEntity) {
  return npc.role !== "boss" && NATURE_ALLIANCE_BEAST_KINDS.has(npc.kind) && hasFactionReward(player, "oakhaven-natures-alliance");
}

function isBazaarPressureZone(zoneId: ZoneId) {
  return zoneId === "bazaar" || zoneId === "canaan-desert" || zoneId === "void-rift";
}

function timedPlayerHasteFactor(player: PlayerEntity) {
  const shout = playerFlagStacks(player, "shout-haste") > 0 ? 0.2 : 0;
  const ironWill = clamp(playerFlagStacks(player, "ironwill-haste") / 5000, 0, 1);
  return shout + ironWill;
}

const PLAYER_MOMENTUM_MAX_FACTOR = 1.25;
const PLAYER_MOMENTUM_DAMP_SECONDS = 0.75;

function decayPlayerMomentum(player: PlayerEntity, dt: number) {
  const decay = clamp(dt / PLAYER_MOMENTUM_DAMP_SECONDS, 0, 1);
  player.momentumX = (player.momentumX ?? 0) * (1 - decay);
  player.momentumY = (player.momentumY ?? 0) * (1 - decay);
  if (Math.hypot(player.momentumX, player.momentumY) < 0.01) {
    player.momentumX = 0;
    player.momentumY = 0;
  }
}

function updatePlayerMomentum(player: PlayerEntity, dirX: number, dirY: number, speed: number, dt: number) {
  decayPlayerMomentum(player, dt);
  const maxMomentum = speed * PLAYER_MOMENTUM_MAX_FACTOR;
  const accel = clamp(dt / PLAYER_MOMENTUM_DAMP_SECONDS, 0, 1);
  player.momentumX = (player.momentumX ?? 0) + dirX * maxMomentum * accel;
  player.momentumY = (player.momentumY ?? 0) + dirY * maxMomentum * accel;
  const current = Math.hypot(player.momentumX, player.momentumY);
  if (current > maxMomentum && current > 0) {
    const scale = maxMomentum / current;
    player.momentumX *= scale;
    player.momentumY *= scale;
  }
}

function playerMovementSpeedPerSecond(player: PlayerEntity) {
  const boots = hasGear(player, "leather-boots") || hasGear(player, "mining-boots") ? 18 : 0;
  const mastery = Math.min(14, Math.max(0, player.masteryRank - 1) * 2);
  const stealthSpeed = hasPlayerCombatFlag(player, "stealth") ? 0.3 * clamp(player.damageAmpMs / 3000, 0, 1) : 0;
  const apotheosisSpeed = hasPlayerCombatFlag(player, "apotheosis") && player.damageAmpMs > 0 ? 0.18 : 0;
  const swiftSpeed = hasTimedPlayerFlag(player, "swift") ? 0.3 : 0;
  const bloodlustSpeed = hasTimedPlayerFlag(player, "bloodlust") ? 0.4 : 0;
  const juggernautSpeed = hasTimedPlayerFlag(player, "juggernaut") ? 0.3 : 0;
  const statusHaste = timedPlayerHasteFactor(player);
  const slowScale = (player.slowMs ?? 0) > 0 && !hasTimedPlayerFlag(player, "juggernaut") ? 0.5 : 1;
  return (118 + Math.min(38, player.combatLevel * 2) + mastery + boots) * (1 + berserkFactor(player) + stealthSpeed + apotheosisSpeed + swiftSpeed + bloodlustSpeed + juggernautSpeed + statusHaste + factionMovementHaste(player)) * slowScale;
}

function dashDistanceForPmsps(player: PlayerEntity, spec: PlayerDashSpec) {
  return playerMovementSpeedPerSecond(player) * spec.rangePmsps;
}

function addEnergy(player: PlayerEntity, amount: number) {
  ensurePlayerCombatLoadout(player);
  if (amount <= 0) return;
  player.energy = clamp(player.energy + amount, 0, player.maxEnergy || MAX_ENERGY);
}

function applyLifeSteal(player: PlayerEntity, amount: number) {
  const berserkHeal = Math.floor(amount * 0.25 * berserkFactor(player));
  const legacyHeal = hasAbility(player, "rmb-life-steal") ? amount : 0;
  const apotheosisHeal = hasPlayerCombatFlag(player, "apotheosis") && player.damageAmpMs > 0 ? Math.floor(amount * 0.2) : 0;
  const crimsonHeal = hasFactionReward(player, "port-marrow-crimson-tide") ? Math.floor(amount * 0.05) : 0;
  const heal = Math.max(0, berserkHeal + legacyHeal + apotheosisHeal + crimsonHeal);
  if (heal > 0) player.hp = Math.min(player.maxHp, player.hp + heal);
}

function nearestNpc(player: PlayerEntity, state: MmoSkillDemoState, role?: string, maxDistance = 72) {
  return findNearest(
    player,
    entitiesOfType<NpcEntity>(state, "npc"),
    (npc) => npc.hp > 0 && npc.zoneId === player.zoneId && (!role || npc.role === role),
    maxDistance
  );
}

function canReachNpc(player: PlayerEntity, npc: NpcEntity, maxDistance = 96) {
  return npc.hp > 0 && Math.hypot(npc.x - player.x, npc.y - player.y) <= maxDistance;
}

function clearEscort(player: PlayerEntity) {
  player.escortNpcId = "";
  player.escortTargetX = 0;
  player.escortTargetY = 0;
  player.escortTargetZoneId = player.zoneId;
  player.escortMs = 0;
}

function startEscort(player: PlayerEntity, npc: NpcEntity, tileX: number, tileY: number, zoneId: ZoneId, durationMs = 9000) {
  const target = tileToWorld(mmoSkillDemoMap, tileX, tileY, "center");
  player.escortNpcId = npc.id;
  player.escortTargetX = target.x;
  player.escortTargetY = target.y;
  player.escortTargetZoneId = zoneId;
  player.escortMs = durationMs;
  player.targetId = npc.id;
}

function updateEscort(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, dt: number) {
  if (!player.escortNpcId) return false;
  const npc = state.npcs[player.escortNpcId];
  if (!npc || npc.hp <= 0 || npc.zoneId !== player.zoneId || player.escortMs <= 0) {
    clearEscort(player);
    return false;
  }
  player.escortMs = u16Ms(player.escortMs - Math.max(0, Math.floor(dt * 1000)));
  const dx = player.escortTargetX - player.x;
  const dy = player.escortTargetY - player.y;
  const distance = Math.hypot(dx, dy);
  player.action = "travel";
  player.targetId = npc.id;
  if (distance <= ESCORT_REACH_RADIUS || player.escortMs <= 0) {
    player.x = player.escortTargetX;
    player.y = player.escortTargetY;
    player.zoneId = player.escortTargetZoneId;
    npc.x = player.x - 24;
    npc.y = player.y;
    if (npc.kind === "runner-kael") addQuestBit(player, "runner-escort");
    if (npc.kind === "navigator-kai") addQuestBit(player, "navigator-escort");
    progressDailyQuest(player, { kind: "escort", amount: 2, npcKind: npc.kind });
    clearEscort(player);
    return true;
  }
  const step = Math.min(distance, ESCORT_SPEED * dt);
  const moveX = (dx / distance) * step;
  const moveY = (dy / distance) * step;
  moveMmoCircle(
    player,
    moveX,
    moveY,
    {
      rectBlocked: () => false,
      circleBlocked: (circle) => !canOccupy(kernel, circle.x, circle.y, circle.radius),
      blockedAt: (x, y, radius) => !canOccupy(kernel, x, y, radius)
    },
    { radius: PLAYER_RADIUS }
  );
  npc.x = player.x - (dx >= 0 ? 22 : -22);
  npc.y = player.y - 2;
  return true;
}

function teleportPlayer(player: PlayerEntity, tileX: number, tileY: number, zoneId = zoneForPoint(tileX * TILE, tileY * TILE)) {
  teleportMmoEntityToTile(player, tileX, tileY, TILE);
  player.zoneId = zoneId;
  clearEscort(player);
}

function findNearest<T extends { id: string; x: number; y: number }>(
  source: { x: number; y: number },
  entities: Iterable<T>,
  predicate: (entity: T) => boolean,
  maxDistance: number
) {
  return findNearestMmoEntity(source, entities, { maxDistance, includeRadius: false, filter: predicate });
}

function pointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  return mmoPointSegmentDistance({ x: px, y: py }, { x: ax, y: ay }, { x: bx, y: by });
}

function finiteSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.0001) return { distance: Math.hypot(px - ax, py - ay), along: 0 };
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
  const x = ax + dx * t;
  const y = ay + dy * t;
  return { distance: Math.hypot(px - x, py - y), along: Math.sqrt(lengthSq) * t };
}

function aimPoint(player: PlayerEntity, input: RuntimeInput) {
  return {
    x: normalizeWorldCoord(input.aimX, player.aimX || player.x, mmoSkillDemoMap.pixelWidth),
    y: normalizeWorldCoord(input.aimY, player.aimY || player.y, mmoSkillDemoMap.pixelHeight)
  };
}

function isHostileNpcForPlayer(npc: NpcEntity, player: PlayerEntity) {
  return npc.hp > 0 && npc.zoneId === player.zoneId && !isPeaceNpc(npc) && npc.kind !== "player-decoy";
}

function hostileNpcs(state: MmoSkillDemoState, player: PlayerEntity) {
  return Array.from(entitiesOfType<NpcEntity>(state, "npc")).filter((npc) => isHostileNpcForPlayer(npc, player));
}

function damagedHostileNear(state: MmoSkillDemoState, source: NpcEntity, maxDistance: number) {
  return findNearest(
    source,
    entitiesOfType<NpcEntity>(state, "npc"),
    (npc) => npc.id !== source.id && npc.hp > 0 && npc.hp < npc.maxHp && npc.zoneId === source.zoneId && !isPeaceNpc(npc),
    maxDistance
  );
}

function findHostileNearAim(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput, aimRadius: number, playerRange: number) {
  const aim = aimPoint(player, input);
  return findMmoEntityNearAim(player, aim, hostileNpcs(state, player), { maxAimDistance: aimRadius, maxRange: playerRange, includeRadius: false });
}

function isNpcDefending(npc: NpcEntity) {
  if (npc.hp <= 0) return false;
  if (isNpcInvulnerable(npc)) return true;
  if (npc.kind === "crystal-beetle") return npc.phaseMs > 1300 && npc.phaseMs < 2900;
  return false;
}

const GOLEM_POWER_NODE_LINK_RADIUS = 300;
const GOLEM_OVERDRIVE_PLAYER_RADIUS = 360;
const GOLEM_OVERDRIVE_RADIAL_COUNT = 6;
const GOLEM_OVERDRIVE_COOLDOWN_MS = 1350;

function isPowerNodeForGolem(node: NpcEntity, golem: NpcEntity) {
  return node.kind === "power-node" && node.zoneId === golem.zoneId && (node.summonedBy === golem.id || Math.hypot(node.x - golem.x, node.y - golem.y) <= GOLEM_POWER_NODE_LINK_RADIUS);
}

function powerNodesForGolem(state: MmoSkillDemoState, golem: NpcEntity) {
  return Array.from(entitiesOfType<NpcEntity>(state, "npc")).filter((node) => isPowerNodeForGolem(node, golem));
}

function activePowerNodesForGolem(state: MmoSkillDemoState, golem: NpcEntity) {
  return powerNodesForGolem(state, golem).filter((node) => node.hp > 0);
}

function canDamageNpc(state: MmoSkillDemoState, player: PlayerEntity, target: NpcEntity) {
  if (target.zoneId !== player.zoneId) return false;
  if (target.kind === "great-ash-lord") {
    for (const npc of entitiesOfType<NpcEntity>(state, "npc")) {
      if (npc.kind === "spore-pod" && npc.hp > 0) {
        player.targetId = target.id;
        return false;
      }
    }
  }
  if (target.kind === "iron-core-golem" && activePowerNodesForGolem(state, target).length > 0) {
    player.targetId = target.id;
    return false;
  }
  if (target.kind === "iron-core-golem") target.iframeMs = 0;
  if (target.kind === "mirror-king") {
    for (const npc of entitiesOfType<NpcEntity>(state, "npc")) {
      if (npc.kind === "glass-clone" && npc.hp > 0) {
        player.targetId = target.id;
        return false;
      }
    }
  }
  if (target.kind === "glass-clone") {
    const style = attackStyleForAction(player.action, player);
    const needsSpell = player.lastAttackStyle === "melee";
    const needsMelee = player.lastAttackStyle === "spell";
    if ((needsSpell && style !== "spell") || (needsMelee && style !== "melee")) return false;
  }
  return true;
}

const NPC_DAMAGE_STATUS_BITS = {
  BOW_VULNERABLE: 1 << 0,
  DEATHMARK: 1 << 1,
  FRACTURED: 1 << 2,
  SOULBOUND: 1 << 3,
  HEX: 1 << 4
} as const;

const PLAYER_DAMAGE_SOURCE_BITS = {
  BLIND: 1 << 0,
  WEAKENED: 1 << 1,
  ENFEEBLED: 1 << 2
} as const;

const NPC_DAMAGE_STATUS_MASK = {
  exact: {
    "bow-vulnerable": NPC_DAMAGE_STATUS_BITS.BOW_VULNERABLE,
    deathmark: NPC_DAMAGE_STATUS_BITS.DEATHMARK,
    fractured: NPC_DAMAGE_STATUS_BITS.FRACTURED,
    soulbound: NPC_DAMAGE_STATUS_BITS.SOULBOUND
  },
  prefixes: {
    hex: NPC_DAMAGE_STATUS_BITS.HEX
  }
};

const PLAYER_DAMAGE_SOURCE_MASK = {
  exact: {
    blind: PLAYER_DAMAGE_SOURCE_BITS.BLIND,
    weakened: PLAYER_DAMAGE_SOURCE_BITS.WEAKENED,
    enfeebled: PLAYER_DAMAGE_SOURCE_BITS.ENFEEBLED
  }
};

const npcCombat = createMmoCombatModule<PlayerEntity, NpcEntity, MmoSkillDemoState>({
  canDamage: ({ attacker, target, context }) => Boolean(context && canDamageNpc(context, attacker, target) && !isNpcInvulnerable(target)),
  mitigate: ({ target, amount }) => {
    const defendScale = target.kind === "crystal-beetle" && isNpcDefending(target) ? 0.1 : isNpcDefending(target) ? 0.42 : 1;
    const statusMask = mmoStatusBitmask(target.combatFlags, NPC_DAMAGE_STATUS_MASK);
    const bowVulnerable = target.damageAmpMs > 0 && hasMmoStatusBit(statusMask, NPC_DAMAGE_STATUS_BITS.BOW_VULNERABLE);
    const deathMarked = target.damageAmpMs > 0 && hasMmoStatusBit(statusMask, NPC_DAMAGE_STATUS_BITS.DEATHMARK);
    const fractured = target.damageAmpMs > 0 && hasMmoStatusBit(statusMask, NPC_DAMAGE_STATUS_BITS.FRACTURED);
    const curseAmp = target.damageAmpMs > 0 && (hasMmoStatusBit(statusMask, NPC_DAMAGE_STATUS_BITS.HEX) || hasMmoStatusBit(statusMask, NPC_DAMAGE_STATUS_BITS.SOULBOUND));
    const ampScale = (deathMarked ? 1.25 : bowVulnerable ? 1.2 : curseAmp || target.stunMs > 0 && target.kind === "iron-core-golem" ? 2 : 1) * (fractured ? 1.15 : 1);
    return Math.max(1, Math.floor(amount * defendScale * ampScale));
  },
  onHit: ({ attacker, target, killed }) => {
    awardXp(attacker, "combat", killed ? (target.role === "boss" ? 90 : target.elite ? 36 : 18) : 4);
  },
  onKilled: ({ attacker, target, context }) => {
    if (context) handleNpcKill(context, attacker, target);
  }
});

function damageNpc(
  state: MmoSkillDemoState,
  kernel: CollisionKernel,
  player: PlayerEntity,
  target: NpcEntity,
  amount: number,
  options: { knockbackModifier?: number; isHeavyImpact?: boolean; energyGain?: number; ultimate?: boolean; shared?: boolean } = {}
) {
  player.targetId = target.id;
  const canDamage = canDamageNpc(state, player, target);
  const invulnerable = isNpcInvulnerable(target);
  if (!canDamage || invulnerable) {
    spawnCombatTextHazard(state, target, invulnerable && target.iframeMs > 0 ? "dodge" : "immune");
    return false;
  }
  const vanishStrike = hasTimedPlayerFlag(player, "vanish");
  const result = npcCombat.damage(player, target, vanishStrike ? amount + 12 : amount, state);
  if (!result.ok) {
    spawnCombatTextHazard(state, target, "dodge");
    return false;
  }
  const style = attackStyleForAction(player.action, player);
  if (style) player.lastAttackStyle = style;
  if (target.kind === "glass-clone") {
    const mirror = Array.from(entitiesOfType<NpcEntity>(state, "npc")).find((npc) => npc.kind === "mirror-king" && npc.zoneId === target.zoneId && npc.hp > 0);
    if (target.combatState === "real" && mirror) {
      for (const clone of entitiesOfType<NpcEntity>(state, "npc")) if (clone.kind === "glass-clone" && clone.zoneId === target.zoneId) clone.hp = 0;
      mirror.iframeMs = 0;
      mirror.stunMs = Math.max(mirror.stunMs, 2200);
      mirror.combatState = "shattered";
    }
  }
  if (!options.shared && hasCombatFlag(target, "soulbound") && target.damageAmpMs > 0) {
    const partner = hostileNpcs(state, player).find((npc) => npc.id !== target.id && hasCombatFlag(npc, "soulbound") && npc.damageAmpMs > 0);
    if (partner) damageNpc(state, kernel, player, partner, Math.max(1, Math.floor(result.amount * 0.5)), { knockbackModifier: 0, ultimate: true, shared: true });
  }
  const modifier = options.knockbackModifier ?? (player.action === "e" ? 2.2 : player.action === "rmb" ? 1.7 : player.action === "space" ? 1.15 : 0.55);
  applyKnockback(target, player, modifier, result.amount, options.isHeavyImpact ?? (player.action === "rmb" || player.action === "e"));
  updateKnockback(kernel, target, 0);
  if (!options.ultimate) addEnergy(player, options.energyGain ?? 4);
  applyLifeSteal(player, Math.max(1, Math.floor(result.amount * 0.25)));
  if (vanishStrike) {
    removePlayerCombatFlag(player, "vanish");
    removePlayerCombatFlag(player, "stealth");
    player.damageAmpMs = 0;
  }
  if (hasTimedPlayerFlag(player, "trance") && player.action === "lmb") healPlayer(player, 4);
  return true;
}

function damageNpcAmount(
  state: MmoSkillDemoState,
  kernel: CollisionKernel,
  player: PlayerEntity,
  target: NpcEntity,
  amount: number,
  options: { knockbackModifier?: number; isHeavyImpact?: boolean; energyGain?: number; ultimate?: boolean; shared?: boolean } = {}
) {
  const before = target.hp;
  return damageNpc(state, kernel, player, target, amount, options) ? Math.max(0, before - target.hp) : 0;
}

function applyDevCheat(player: PlayerEntity, input: RuntimeInput) {
  const numericFields = new Set([
    "hp",
    "maxHp",
    "mana",
    "maxMana",
    "combatXp",
    "combatLevel",
    "miningXp",
    "miningLevel",
    "woodcuttingXp",
    "woodcuttingLevel",
    "gold",
    "renown",
    "masteryRank",
    "contractKills",
    "contractStreak",
    "wolfKills",
    "batKills",
    "bazaarSurvivalMs",
    "dungeonBossKills"
  ]);
  const inventoryFields = new Set(["ash-logs", "iron-ore", "silk-thread", "glade-berries", "cinder-ale", "speed-potion"]);
  const bankFields = new Set(["bank:ash-logs", "bank:iron-ore"]);
  const textFields = new Set(["activeQuestId", "prestigeTitle", "contractId"]);
  if (numericFields.has(input.devField)) {
    const value = clamp(Math.floor(input.devValue), 0, input.devField.endsWith("Level") ? 99 : 999999);
    (player as unknown as Record<string, number>)[input.devField] = value;
    if (input.devField === "miningLevel") setGatheringLevelForDev(player, "mining", Math.max(1, value));
    if (input.devField === "woodcuttingLevel") setGatheringLevelForDev(player, "lumberjacking", Math.max(1, value));
    if (input.devField === "miningXp") awardGatheringXp(player, "mining", 0);
    if (input.devField === "woodcuttingXp") awardGatheringXp(player, "lumberjacking", 0);
    if (input.devField === "hp" || input.devField === "maxHp") player.hp = Math.min(player.hp, player.maxHp);
    if (input.devField === "mana" || input.devField === "maxMana") player.mana = Math.min(player.mana, player.maxMana);
  } else if (textFields.has(input.devField)) {
    (player as unknown as Record<string, string>)[input.devField] = cleanInputText(input.devText, input.devField === "activeQuestId" || input.devField === "prestigeTitle" ? 32 : 192);
  } else if (inventoryFields.has(input.devField)) {
    setItemQty(player, input.devField, input.devValue);
  } else if (bankFields.has(input.devField)) {
    const itemId = input.devField.slice("bank:".length);
    if (input.devValue <= 0) delete player.bank[itemId];
    else player.bank[itemId] = Math.floor(input.devValue);
  } else if (input.devField === "questFlag") {
    addQuestBit(player, cleanInputText(input.devText, 96));
  } else if (input.devField === "ability") {
    unlockAbility(player, cleanInputText(input.devText, 96));
  }
}

function devCheatsEnabled() {
  return process.env.MMO_SKILL_DEMO_DEV_CHEATS === "1";
}

function abilityCastMs(player: PlayerEntity, baseMs: number) {
  return Math.max(50, Math.floor(baseMs * animationDurationScale(player)));
}

function animationDurationScale(player: PlayerEntity) {
  const apotheosis = hasPlayerCombatFlag(player, "apotheosis") && player.damageAmpMs > 0 ? 0.33 : 0;
  const swift = hasTimedPlayerFlag(player, "swift") ? 0.23 : 0;
  const bloodlust = hasTimedPlayerFlag(player, "bloodlust") ? 0.29 : 0;
  const trance = hasTimedPlayerFlag(player, "trance") ? 0.2 : 0;
  return Math.max(0.35, 1 - 0.5 * berserkFactor(player) - apotheosis - swift - bloodlust - trance - timedPlayerHasteFactor(player));
}

function combatSlotForAction(action: MmoSkillDemoAction) {
  return ACTION_TO_SLOT[action];
}

function directionFromAim(player: PlayerEntity, input: RuntimeInput) {
  const aim = aimPoint(player, input);
  const dx = aim.x - player.x;
  const dy = aim.y - player.y;
  const aimLength = Math.hypot(dx, dy);
  if (aimLength < 1) {
    const fallbackLength = Math.hypot(player.abilityVectorX, player.abilityVectorY) || 1;
    return { x: (player.abilityVectorX || 1) / fallbackLength, y: (player.abilityVectorY || 0) / fallbackLength, aim };
  }
  const length = aimLength;
  return { x: dx / length, y: dy / length, aim };
}

function rotateVectorToward(x: number, y: number, targetX: number, targetY: number, maxRadians: number) {
  const fromAngle = Math.atan2(y, x);
  const toAngle = Math.atan2(targetY, targetX);
  let delta = ((toAngle - fromAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  delta = clamp(delta, -maxRadians, maxRadians);
  const angle = fromAngle + delta;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function rushProgress(activeMs: number, windupMs: number, durationMs: number) {
  return clamp((activeMs - windupMs) / Math.max(1, durationMs - windupMs), 0, 1);
}

function rushSpeedMultiplier(activeMs: number, windupMs: number, durationMs: number) {
  const progress = rushProgress(activeMs, windupMs, durationMs);
  const ramp = 1.2 + progress * 3.8;
  const remainingMs = Math.max(0, durationMs - activeMs);
  if (remainingMs >= RUSH_BRAKE_MS) return ramp;
  const brake = clamp(1 - remainingMs / RUSH_BRAKE_MS, 0, 1);
  return ramp + (1 - ramp) * brake;
}

function clearActiveAbility(player: PlayerEntity) {
  clearMmoAbility(player);
  player.rushDistance = 0;
  setPlayerFlagStacks(player, "flurry", 0);
  setPlayerFlagStacks(player, "chaos", 0);
  setPlayerFlagStacks(player, "blade", 0);
  setPlayerFlagStacks(player, "omni", 0);
}

function endRushAbility(player: PlayerEntity) {
  setSlotCooldown(player, "Space", PLAYER_ABILITY_DEFS["space-rush"].cooldownMs);
  clearActiveAbility(player);
}

function canInterruptActiveAbility(player: PlayerEntity, nextSlot: AbilitySlot) {
  if (!player.activeAbility || player.activeSlot === nextSlot) return false;
  const activeDef = PLAYER_ABILITY_DEFS[player.activeAbility as keyof typeof PLAYER_ABILITY_DEFS];
  if (!activeDef) return false;
  return player.castMs > 0 && player.activeMs < abilityCastMs(player, activeDef.castMs);
}

function interruptActiveAbility(player: PlayerEntity) {
  const slot = player.activeSlot as AbilitySlot;
  clearActiveAbility(player);
  if (ABILITY_SLOTS.includes(slot as AbilitySlot)) {
    player.cooldowns[slot] = 0;
    syncLegacyCooldown(player);
  }
}

function beginActiveAbility(player: PlayerEntity, slot: AbilitySlot, abilityId: string, input: RuntimeInput, durationMs: number) {
  const direction = directionFromAim(player, input);
  player.rushDistance = 0;
  beginMmoAbility(player, slot, abilityId, durationMs, direction);
}

function activeHas(player: PlayerEntity, value: string) {
  return hasMmoAbilityEvent(player, value);
}

function activeMark(player: PlayerEntity, value: string) {
  markMmoAbilityEvent(player, value);
}

function activeHitMs(player: PlayerEntity, prefix: string, id: string) {
  return mmoAbilityEventMs(player, prefix, id);
}

function activeMarkHitMs(player: PlayerEntity, prefix: string, id: string, ms: number) {
  markMmoAbilityEventMs(player, prefix, id, ms);
}

function targetInFrontCone(player: PlayerEntity, target: NpcEntity, range: number, halfAngleRad: number) {
  return mmoTargetInCone(
    { x: player.x, y: player.y },
    { x: player.abilityVectorX, y: player.abilityVectorY },
    { id: target.id, x: target.x, y: target.y, radius: bodyRadius(target) },
    { range, halfAngleRad, includeRadius: true }
  );
}

function spawnPlayerEffectHazard(state: MmoSkillDemoState, player: PlayerEntity, kind: HazardEntity["kind"], x: number, y: number, toX: number, toY: number, radius: number, effectKind: string, lifetimeMs = 620, pulse = 1) {
  const id = `${effectKind}-${state.tick}-${state.effects.length}`.slice(0, 32);
  spawnTransientEffect(
    state.effects,
    {
      id,
      kind,
      zoneId: player.zoneId,
      x,
      y,
      toX,
      toY,
      radius: u16Ms(radius),
      lifetimeMs: u16Ms(lifetimeMs),
      effectKind: effectKind.slice(0, 16),
      text: "",
      pulse: u16Ms(pulse),
      priority: effectKind === "cone" ? 36 : ["arrow", "root", "piercearrow"].includes(effectKind) ? 18 : 28
    },
    256
  );
}

function spawnCombatTextHazard(state: MmoSkillDemoState, target: NpcEntity, effectKind: "immune" | "dodge" | "damage", text?: string) {
  const id = `${effectKind}-${state.tick}-${state.effects.length}`.slice(0, 32);
  spawnTransientEffect(
    state.effects,
    {
      id,
      kind: "aoe",
      zoneId: target.zoneId,
      x: target.x,
      y: target.y - 22,
      toX: target.x,
      toY: target.y - 22,
      radius: target.role === "boss" ? HAZARD_SIZE.bossCombatTextRadius : HAZARD_SIZE.combatTextRadius,
      lifetimeMs: 720,
      effectKind,
      text: text ?? (effectKind === "immune" ? "Immune" : effectKind === "dodge" ? "Dodge" : "Hit"),
      pulse: 1,
      priority: effectKind === "damage" ? 72 : 80
    },
    256
  );
}

function spawnPummelShockwave(state: MmoSkillDemoState, player: PlayerEntity, range: number, halfAngle: number, lifetimeMs = 360, effectKind = "conewave") {
  spawnPlayerEffectHazard(
    state,
    player,
    "line",
    player.x,
    player.y,
    player.x + player.abilityVectorX * range,
    player.y + player.abilityVectorY * range,
    Math.floor(range),
    effectKind,
    lifetimeMs,
    Math.round((halfAngle * 180) / Math.PI)
  );
}

type LineHit = { target: NpcEntity; distance: number };
type NpcTargetable = { id: string; x: number; y: number; radius: number; target: NpcEntity };

function hostileTargetables(state: MmoSkillDemoState, player: PlayerEntity) {
  return hostileNpcs(state, player).map((target): NpcTargetable => ({ id: target.id, x: target.x, y: target.y, radius: bodyRadius(target), target }));
}

function bowMildDamage(player: PlayerEntity) {
  return Math.max(1, Math.floor(6 + player.combatLevel * 1.25 + playerDamageBonus(player)));
}

function bowDecentDamage(player: PlayerEntity) {
  return Math.max(1, Math.floor(14 + player.combatLevel * 1.8 + playerDamageBonus(player)));
}

function bowHighDamage(player: PlayerEntity) {
  return Math.max(1, Math.floor(24 + player.combatLevel * 3 + playerDamageBonus(player) * 2));
}

function spellDamage(player: PlayerEntity, base: number) {
  const chaosCatalyst = hasFactionReward(player, "obsidian-sanctum-chaos-catalyst") ? 2 : 0;
  return Math.max(1, Math.floor(base + Math.max(0, player.combatLevel - 1) * 0.65 + playerDamageBonus(player) + chaosCatalyst));
}

function martialDamage(player: PlayerEntity, base: number) {
  return Math.max(1, Math.floor(base + Math.max(0, player.combatLevel - 1) * 0.75 + playerDamageBonus(player)));
}

function healPlayer(player: PlayerEntity, amount: number) {
  player.hp = Math.min(player.maxHp, player.hp + Math.max(0, Math.floor(amount)));
}

function tickPlayerStatusEffects(player: PlayerEntity, ms: number) {
  tickPlayerMsFlag(player, "shout-haste", ms);
  tickPlayerMsFlag(player, "ironwill-haste", ms);

  if ((player.zoneId === "ashwood" || player.zoneId === "ashwood-wilderness") && hasFactionReward(player, "oakhaven-barkskin-infusion") && player.hp > 0 && player.hp < player.maxHp) {
    let nextBarkskinMs = playerFlagStacks(player, "barkskin-step") || 1000;
    nextBarkskinMs -= ms;
    while (nextBarkskinMs <= 0) {
      healPlayer(player, 2);
      nextBarkskinMs += 1000;
    }
    setPlayerFlagStacks(player, "barkskin-step", u16Ms(nextBarkskinMs));
  } else {
    setPlayerFlagStacks(player, "barkskin-step", 0);
  }

  let regenTicks = playerFlagStacks(player, "shout-regen");
  if (regenTicks <= 0) {
    setPlayerFlagStacks(player, "shout-regen-step", 0);
    return;
  }
  let nextTickMs = playerFlagStacks(player, "shout-regen-step") || 1000;
  nextTickMs -= ms;
  while (regenTicks > 0 && nextTickMs <= 0) {
    healPlayer(player, Math.max(1, Math.ceil(player.maxHp * 0.02)));
    regenTicks -= 1;
    nextTickMs += 1000;
  }
  setPlayerFlagStacks(player, "shout-regen", regenTicks);
  setPlayerFlagStacks(player, "shout-regen-step", regenTicks > 0 ? u16Ms(nextTickMs) : 0);
}

function healPlayersNear(state: MmoSkillDemoState, source: PlayerEntity, x: number, y: number, radius: number, amount: number) {
  let healed = 0;
  for (const target of entitiesOfType<PlayerEntity>(state, "player")) {
    if (target.hp <= 0 || target.zoneId !== source.zoneId) continue;
    if (Math.hypot(target.x - x, target.y - y) > radius + PLAYER_RADIUS) continue;
    const before = target.hp;
    healPlayer(target, amount);
    if (target.hp > before) healed += 1;
  }
  return healed;
}

function damageNpcsInRadius(
  state: MmoSkillDemoState,
  kernel: CollisionKernel,
  player: PlayerEntity,
  x: number,
  y: number,
  radius: number,
  amount: number,
  options: { knockbackModifier?: number; isHeavyImpact?: boolean; energyGain?: number; ultimate?: boolean } = {}
) {
  let hits = 0;
  for (const hit of radiusMmoTargetHits({ x, y }, hostileTargetables(state, player), { radius, includeRadius: true })) {
    const target = hit.target.target;
    if (damageNpc(state, kernel, player, target, amount, options)) hits += 1;
  }
  return hits;
}

function damageNpcsInCone(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, range: number, halfAngle: number, amount: number, options: { knockbackModifier?: number; energyGain?: number } = {}) {
  let hits = 0;
  for (const hit of coneMmoTargetHits({ x: player.x, y: player.y }, { x: player.abilityVectorX, y: player.abilityVectorY }, hostileTargetables(state, player), { range, halfAngleRad: halfAngle, includeRadius: true })) {
    const target = hit.target.target;
    if (damageNpc(state, kernel, player, target, amount, options)) hits += 1;
  }
  return hits;
}

function coneTargets(state: MmoSkillDemoState, player: PlayerEntity, range: number, halfAngle: number) {
  return coneMmoTargetHits({ x: player.x, y: player.y }, { x: player.abilityVectorX, y: player.abilityVectorY }, hostileTargetables(state, player), { range, halfAngleRad: halfAngle, includeRadius: true })
    .map((hit) => hit.target.target);
}

function movePlayerDistance(kernel: CollisionKernel, player: PlayerEntity, dx: number, dy: number, distance: number) {
  const length = Math.hypot(dx, dy) || 1;
  const move = Math.max(0, distance);
  moveMmoCircle(
    player,
    (dx / length) * move,
    (dy / length) * move,
    { rectBlocked: () => false, circleBlocked: (circle) => !canOccupy(kernel, circle.x, circle.y, circle.radius), blockedAt: (x, y, radius) => !canOccupy(kernel, x, y, radius) },
    { radius: PLAYER_RADIUS }
  );
}

function movePlayerDashDistance(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, spec: PlayerDashSpec, dx = player.abilityVectorX, dy = player.abilityVectorY) {
  const startX = player.x;
  const startY = player.y;
  movePlayerDistance(kernel, player, dx, dy, dashDistanceForPmsps(player, spec));
  const traveled = Math.hypot(player.x - startX, player.y - startY);
  if (traveled > 1 && spec.effectKind) {
    spawnPlayerEffectHazard(state, player, "line", startX, startY, player.x, player.y, 8, spec.effectKind, Math.max(220, spec.durationMs * 2));
  }
  return { startX, startY, traveled };
}

function moveMeleeDashBeforeFire(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, abilityId: MeleeDashAbilityId, dx = player.abilityVectorX, dy = player.abilityVectorY) {
  return movePlayerDashDistance(state, kernel, player, MELEE_PREFIRE_DASHES[abilityId], dx, dy);
}

function moveActiveLinearDash(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, previousMs: number, dt: number, castMs: number, travelMs: number, distance: number, effectKind: string) {
  if (player.activeMs <= castMs) return;
  const previousTravel = clamp(previousMs - castMs, 0, travelMs);
  const currentTravel = clamp(player.activeMs - castMs, 0, travelMs);
  const move = distance * ((currentTravel - previousTravel) / Math.max(1, travelMs));
  movePlayerDistance(kernel, player, player.abilityVectorX, player.abilityVectorY, move);
  if (dt > 0) spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 20, effectKind, 220);
}

function clampedAim(player: PlayerEntity, input: RuntimeInput, range: number) {
  const aim = aimPoint(player, input);
  const dx = aim.x - player.x;
  const dy = aim.y - player.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= range || distance < 1) return aim;
  return {
    x: clamp(player.x + (dx / distance) * range, PLAYER_RADIUS, mmoSkillDemoMap.pixelWidth - PLAYER_RADIUS),
    y: clamp(player.y + (dy / distance) * range, PLAYER_RADIUS, mmoSkillDemoMap.pixelHeight - PLAYER_RADIUS)
  };
}

function teleportPlayerByVector(kernel: CollisionKernel, player: PlayerEntity, dx: number, dy: number, range: number) {
  const length = Math.hypot(dx, dy) || 1;
  const distance = Math.min(range, length);
  const step = Math.max(12, distance / 12);
  for (let travel = distance; travel >= 0; travel -= step) {
    const x = clamp(player.x + (dx / length) * travel, PLAYER_RADIUS, mmoSkillDemoMap.pixelWidth - PLAYER_RADIUS);
    const y = clamp(player.y + (dy / length) * travel, PLAYER_RADIUS, mmoSkillDemoMap.pixelHeight - PLAYER_RADIUS);
    if (canOccupy(kernel, x, y, PLAYER_RADIUS)) {
      player.x = x;
      player.y = y;
      return true;
    }
  }
  return false;
}

function nearestHostileNearPoint(state: MmoSkillDemoState, player: PlayerEntity, x: number, y: number, radius: number, exclude = new Set<string>()) {
  return findNearestMmoEntity({ x, y }, hostileTargetables(state, player), { maxDistance: radius, includeRadius: false, filter: (target) => !exclude.has(target.id) })?.target;
}

function alliedPlayerNearAim(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput, range: number) {
  const aim = clampedAim(player, input, range);
  let best: PlayerEntity = player;
  let bestDistance = Math.hypot(player.x - aim.x, player.y - aim.y);
  for (const ally of entitiesOfType<PlayerEntity>(state, "player")) {
    if (ally.hp <= 0 || ally.zoneId !== player.zoneId) continue;
    const distance = Math.hypot(ally.x - aim.x, ally.y - aim.y);
    if (distance < bestDistance && Math.hypot(ally.x - player.x, ally.y - player.y) <= range) {
      best = ally;
      bestDistance = distance;
    }
  }
  return best;
}

type RewindSample = { ageMs: number; x: number; y: number; hp: number; zoneId: ZoneId };
const rewindHistory = new Map<string, RewindSample[]>();

function recordRewindSample(player: PlayerEntity, dt: number) {
  const ms = Math.max(0, Math.floor(dt * 1000));
  const samples = rewindHistory.get(player.id) ?? [];
  for (const sample of samples) sample.ageMs += ms;
  samples.unshift({ ageMs: 0, x: player.x, y: player.y, hp: player.hp, zoneId: player.zoneId });
  while (samples.length > 0 && samples[samples.length - 1].ageMs > 3400) samples.pop();
  rewindHistory.set(player.id, samples.slice(0, 90));
}

function applyRewind(kernel: CollisionKernel, player: PlayerEntity) {
  const samples = rewindHistory.get(player.id) ?? [];
  const sample = samples.find((entry) => entry.ageMs >= 2500) ?? samples[samples.length - 1];
  if (!sample) return false;
  const lostHp = Math.max(0, sample.hp - player.hp);
  const x = clamp(sample.x, PLAYER_RADIUS, mmoSkillDemoMap.pixelWidth - PLAYER_RADIUS);
  const y = clamp(sample.y, PLAYER_RADIUS, mmoSkillDemoMap.pixelHeight - PLAYER_RADIUS);
  if (canOccupy(kernel, x, y, PLAYER_RADIUS)) {
    player.x = x;
    player.y = y;
    player.zoneId = sample.zoneId;
  }
  healPlayer(player, lostHp);
  return true;
}

function lineHits(state: MmoSkillDemoState, player: PlayerEntity, dx: number, dy: number, range: number, width: number) {
  return lineMmoTargetHits({ x: player.x, y: player.y }, { x: dx, y: dy }, hostileTargetables(state, player), { range, width, includeRadius: true })
    .map((hit): LineHit => ({ target: hit.target.target, distance: hit.distance }));
}

function firstLineHit(state: MmoSkillDemoState, player: PlayerEntity, dx: number, dy: number, range: number, width: number) {
  const hit = firstMmoLineTargetHit({ x: player.x, y: player.y }, { x: dx, y: dy }, hostileTargetables(state, player), { range, width, includeRadius: true });
  return hit ? { target: hit.target.target, distance: hit.distance } : undefined;
}

function spawnBowLine(state: MmoSkillDemoState, player: PlayerEntity, dx: number, dy: number, range: number, width: number, effectKind = "arrow", lifetimeMs = 520) {
  spawnPlayerEffectHazard(state, player, "line", player.x, player.y, player.x + dx * range, player.y + dy * range, width, effectKind, lifetimeMs);
}

const PLAYER_PROJECTILE_EFFECTS = ["arcane-bolt", "frost", "missile", "hex", "mend", "focused-ray", "chaos", "dirk", "knife", "noxious-flask", "razor"] as const;
type PlayerProjectileEffectKind = (typeof PLAYER_PROJECTILE_EFFECTS)[number];
type PlayerProjectileDef = { maxRange: number; travelMs: number; homingDegPerSec: number; pierce?: boolean; noTargetCollision?: boolean };

const PLAYER_PROJECTILE_DEFS: Record<PlayerProjectileEffectKind, PlayerProjectileDef> = {
  "arcane-bolt": { maxRange: 450, travelMs: 500, homingDegPerSec: 0 },
  frost: { maxRange: 400, travelMs: 500, homingDegPerSec: 420 },
  missile: { maxRange: 540, travelMs: 320, homingDegPerSec: 912 },
  hex: { maxRange: 600, travelMs: 1600, homingDegPerSec: 0 },
  mend: { maxRange: 700, travelMs: 1334, homingDegPerSec: 420 },
  "focused-ray": { maxRange: 600, travelMs: 100, homingDegPerSec: 0, pierce: true },
  chaos: { maxRange: 500, travelMs: 450, homingDegPerSec: 180 },
  dirk: { maxRange: 280, travelMs: 300, homingDegPerSec: 0 },
  knife: { maxRange: 275, travelMs: 300, homingDegPerSec: 0 },
  "noxious-flask": { maxRange: 350, travelMs: 600, homingDegPerSec: 0, noTargetCollision: true },
  razor: { maxRange: 550, travelMs: 600, homingDegPerSec: 0, pierce: true }
};

function playerProjectileDefFor(effectKind: string) {
  return (PLAYER_PROJECTILE_EFFECTS as readonly string[]).includes(effectKind) ? PLAYER_PROJECTILE_DEFS[effectKind as PlayerProjectileEffectKind] : undefined;
}

function playerProjectileMaxRange(effectKind: PlayerProjectileEffectKind, radius: number) {
  if (effectKind !== "razor") return PLAYER_PROJECTILE_DEFS[effectKind].maxRange;
  const ratio = clamp((radius - 45) / 35, 0.2, 1);
  return 350 + 200 * ratio;
}

function playerProjectileSpeed(hazard: HazardEntity, def: PlayerProjectileDef) {
  const effectKind = hazard.effectKind as PlayerProjectileEffectKind;
  return playerProjectileMaxRange(effectKind, hazard.radius) / Math.max(0.001, def.travelMs / 1000);
}

function spawnPlayerProjectileTravelTrace(state: MmoSkillDemoState, player: PlayerEntity, effectKind: PlayerProjectileEffectKind, fromX: number, fromY: number, toX: number, toY: number, width: number, lifetimeMs: number) {
  const distance = Math.hypot(toX - fromX, toY - fromY);
  if (distance < 8) return;
  spawnPlayerEffectHazard(state, player, "line", fromX, fromY, toX, toY, Math.max(4, width), effectKind, lifetimeMs);
}

function normalizedDirection(dx: number, dy: number) {
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

function rotateDirectionToward(current: { x: number; y: number }, target: { x: number; y: number }, maxRadians: number) {
  const currentAngle = Math.atan2(current.y, current.x);
  const targetAngle = Math.atan2(target.y, target.x);
  const delta = Math.atan2(Math.sin(targetAngle - currentAngle), Math.cos(targetAngle - currentAngle));
  const nextAngle = currentAngle + clamp(delta, -maxRadians, maxRadians);
  return { x: Math.cos(nextAngle), y: Math.sin(nextAngle) };
}

function projectileHasHit(hazard: HazardEntity, targetId: string) {
  return `|${hazard.combatFlags ?? ""}|`.includes(`|${targetId}|`);
}

function markProjectileHit(hazard: HazardEntity, targetId: string) {
  hazard.combatFlags = hazard.combatFlags ? `${hazard.combatFlags}|${targetId}` : targetId;
}

function projectileTarget(state: MmoSkillDemoState, owner: PlayerEntity, hazard: HazardEntity, def: PlayerProjectileDef) {
  const current = hazard.targetId ? state.npcs[hazard.targetId] : undefined;
  if (current && isHostileNpcForPlayer(current, owner)) return current;
  if (def.homingDegPerSec <= 0) return undefined;
  const next = hostileNpcs(state, owner)
    .filter((target) => Math.hypot(target.x - hazard.x, target.y - hazard.y) <= 240 + bodyRadius(target))
    .sort((a, b) => Math.hypot(a.x - hazard.x, a.y - hazard.y) - Math.hypot(b.x - hazard.x, b.y - hazard.y))[0];
  hazard.targetId = next?.id ?? "";
  return next;
}

function spawnPlayerProjectile(
  state: MmoSkillDemoState,
  player: PlayerEntity,
  effectKind: PlayerProjectileEffectKind,
  options: {
    dx: number;
    dy: number;
    width: number;
    damage: number;
    knockbackModifier: number;
    targetId?: string;
    travelDistance?: number;
    charged?: boolean;
    isHeavyImpact?: boolean;
    armorPierce?: boolean;
  }
) {
  const def = PLAYER_PROJECTILE_DEFS[effectKind];
  const direction = normalizedDirection(options.dx, options.dy);
  const maxRange = playerProjectileMaxRange(effectKind, options.width);
  const travelDistance = clamp(options.travelDistance ?? maxRange, 1, maxRange);
  const previewDistance = Math.min(travelDistance, clamp(maxRange * 0.35, 90, 180));
  const startX = player.x + direction.x * 10;
  const startY = player.y + direction.y * 10;
  spawnPlayerProjectileTravelTrace(
    state,
    player,
    effectKind,
    startX,
    startY,
    startX + direction.x * previewDistance,
    startY + direction.y * previewDistance,
    options.width,
    clamp(def.travelMs * 0.72, 260, 420)
  );
  const id = `${effectKind}-${state.tick}-${entityTypeCount(state, "hazard")}`.slice(0, 32);
  const hazard = acquireHazardEntity();
  hazard.id = id;
  hazard.kind = "line";
  hazard.zoneId = player.zoneId;
  hazard.ownerId = player.id;
  hazard.targetId = options.targetId ?? "";
  hazard.x = startX;
  hazard.y = startY;
  hazard.aimX = direction.x;
  hazard.aimY = direction.y;
  hazard.toX = startX;
  hazard.toY = startY;
  hazard.radius = u16Ms(options.width);
  hazard.windupMs = 1;
  hazard.lifetimeMs = u16Ms(Math.ceil((travelDistance / maxRange) * def.travelMs));
  hazard.damage = u16Ms(options.damage);
  hazard.knockbackModifier = options.knockbackModifier;
  hazard.isHeavyImpact = options.isHeavyImpact ?? false;
  hazard.armorPierce = options.armorPierce ?? false;
  hazard.effectKind = effectKind;
  hazard.text = "";
  hazard.combatState = "player-projectile";
  hazard.combatFlags = "";
  hazard.pulse = options.charged ? 1 : 0;
  state.hazards[id] = hazard;
  pruneEntityTypeToMax(state, "hazard", 180);
}

function healMendingSparkAlly(state: MmoSkillDemoState, player: PlayerEntity) {
  const ally = Array.from(entitiesOfType<PlayerEntity>(state, "player"))
    .filter((candidate) => candidate.zoneId === player.zoneId && candidate.hp > 0 && candidate.hp < candidate.maxHp && Math.hypot(candidate.x - player.x, candidate.y - player.y) <= 200)
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] ?? player;
  healPlayer(ally, 5);
}

function applyFrostChainImpact(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, hazard: HazardEntity, first: NpcEntity) {
  const def = PLAYER_ABILITY_DEFS["staff-frost-chain"];
  const visited = new Set<string>();
  let current: NpcEntity | undefined = first;
  let fromX = hazard.x;
  let fromY = hazard.y;
  for (let bounce = 0; current && bounce < 4; bounce += 1) {
    visited.add(current.id);
    spawnPlayerEffectHazard(state, player, "line", fromX, fromY, current.x, current.y, 8, "frost", 420);
    damageNpc(state, kernel, player, current, hazard.damage, { knockbackModifier: hazard.knockbackModifier, energyGain: bounce === 0 ? def.energyGain : 0 });
    current.slowMs = Math.max(current.slowMs ?? 0, 1500);
    fromX = current.x;
    fromY = current.y;
    current = nearestHostileNearPoint(state, player, fromX, fromY, 180, visited);
  }
}

function applyPlayerProjectileImpact(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, hazard: HazardEntity, target: NpcEntity) {
  switch (hazard.effectKind as PlayerProjectileEffectKind) {
    case "arcane-bolt":
      damageNpc(state, kernel, player, target, hazard.damage, { knockbackModifier: hazard.knockbackModifier, energyGain: PLAYER_ABILITY_DEFS["staff-arcane-bolt"].energyGain });
      return true;
    case "frost":
      applyFrostChainImpact(state, kernel, player, hazard, target);
      return true;
    case "missile":
      damageNpc(state, kernel, player, target, hazard.damage, { knockbackModifier: hazard.knockbackModifier, energyGain: PLAYER_ABILITY_DEFS["wand-magic-missile"].energyGain });
      return true;
    case "hex":
      if (damageNpc(state, kernel, player, target, hazard.damage, { knockbackModifier: hazard.knockbackModifier, energyGain: PLAYER_ABILITY_DEFS["wand-hex"].energyGain })) {
        setNpcFlagStacks(target, "hex", Math.min(3, npcFlagStacks(target, "hex") + 1));
        target.damageAmpMs = Math.max(target.damageAmpMs, 3000);
      }
      return true;
    case "mend":
      damageNpc(state, kernel, player, target, hazard.damage, { knockbackModifier: hazard.knockbackModifier, energyGain: PLAYER_ABILITY_DEFS["wand-mending-spark"].energyGain });
      healMendingSparkAlly(state, player);
      return true;
    case "focused-ray":
      damageNpc(state, kernel, player, target, hazard.damage, { knockbackModifier: hazard.knockbackModifier, energyGain: PLAYER_ABILITY_DEFS["wand-focused-ray"].energyGain });
      return false;
    case "chaos":
      damageNpc(state, kernel, player, target, hazard.damage, { knockbackModifier: hazard.knockbackModifier, ultimate: true });
      return true;
    case "dirk":
      if (damageNpc(state, kernel, player, target, hazard.damage, { knockbackModifier: hazard.knockbackModifier, energyGain: PLAYER_ABILITY_DEFS["twin-throwing-dirk"].energyGain })) {
        target.slowMs = Math.max(target.slowMs ?? 0, 2000);
      }
      return true;
    case "knife":
      if (damageNpc(state, kernel, player, target, hazard.damage, { knockbackModifier: hazard.knockbackModifier, energyGain: PLAYER_ABILITY_DEFS["twin-fan-of-knives"].energyGain })) {
        addTimedNpcFlag(target, "antiheal", 2500);
      }
      return true;
    case "razor":
      if (damageNpc(state, kernel, player, target, hazard.damage, { knockbackModifier: hazard.knockbackModifier, energyGain: PLAYER_ABILITY_DEFS["blade-razor-wind"].energyGain }) && hazard.pulse > 0) {
        target.slowMs = Math.max(target.slowMs ?? 0, 2000);
      }
      return false;
    default:
      return true;
  }
}

function expirePlayerProjectile(state: MmoSkillDemoState, player: PlayerEntity, hazard: HazardEntity) {
  if (hazard.effectKind === "noxious-flask") {
    spawnPlayerPersistentHazard(state, player, "noxious", hazard.x, hazard.y, 100, hazard.damage, 4000, "noxious", 0);
    spawnPlayerEffectHazard(state, player, "aoe", hazard.x, hazard.y, hazard.x, hazard.y, 100, "noxious", 760);
  } else if (hazard.effectKind === "mend") {
    healMendingSparkAlly(state, player);
  }
  removeMmoEntityForReuse(state, hazard.id);
}

function advancePlayerProjectile(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, hazard: HazardEntity, dt: number) {
  const def = playerProjectileDefFor(hazard.effectKind);
  if (!def) return false;
  const ms = Math.min(hazard.lifetimeMs, Math.max(0, Math.floor(dt * 1000)));
  if (ms <= 0) return true;
  let direction = normalizedDirection(hazard.aimX ?? hazard.toX - hazard.x, hazard.aimY ?? hazard.toY - hazard.y);
  const target = projectileTarget(state, player, hazard, def);
  if (target && def.homingDegPerSec > 0) {
    direction = rotateDirectionToward(direction, normalizedDirection(target.x - hazard.x, target.y - hazard.y), (def.homingDegPerSec * Math.PI / 180) * (ms / 1000));
  }
  const fromX = hazard.x;
  const fromY = hazard.y;
  const step = playerProjectileSpeed(hazard, def) * (ms / 1000);
  hazard.x = clamp(hazard.x + direction.x * step, PLAYER_RADIUS, mmoSkillDemoMap.pixelWidth - PLAYER_RADIUS);
  hazard.y = clamp(hazard.y + direction.y * step, PLAYER_RADIUS, mmoSkillDemoMap.pixelHeight - PLAYER_RADIUS);
  hazard.toX = fromX;
  hazard.toY = fromY;
  hazard.aimX = direction.x;
  hazard.aimY = direction.y;
  hazard.lifetimeMs = u16Ms(hazard.lifetimeMs - ms);

  if (!def.noTargetCollision) {
    const hits = hostileNpcs(state, player)
      .map((candidate) => ({ target: candidate, segment: finiteSegmentDistance(candidate.x, candidate.y, fromX, fromY, hazard.x, hazard.y) }))
      .filter((entry) => !projectileHasHit(hazard, entry.target.id) && entry.segment.distance <= hazard.radius + bodyRadius(entry.target))
      .sort((a, b) => a.segment.along - b.segment.along);
    for (const hit of hits) {
      markProjectileHit(hazard, hit.target.id);
      if (applyPlayerProjectileImpact(state, kernel, player, hazard, hit.target)) {
        spawnPlayerProjectileTravelTrace(state, player, hazard.effectKind as PlayerProjectileEffectKind, fromX, fromY, hit.target.x, hit.target.y, hazard.radius, 360);
        removeMmoEntityForReuse(state, hazard.id);
        return true;
      }
      if (!def.pierce) break;
    }
  }

  if (hazard.lifetimeMs <= 0) expirePlayerProjectile(state, player, hazard);
  return true;
}

function quickShotDamage(player: PlayerEntity) {
  const base = Math.max(1, Math.floor(bowMildDamage(player) * 0.8));
  if (!consumePlayerFlagStack(player, "bow-empower")) return base;
  return Math.floor(base * 2);
}

function fireQuickShot(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["bow-quick-shot"];
  const hit = firstLineHit(state, player, player.abilityVectorX, player.abilityVectorY, BOW_QUICK_RANGE, 10);
  player.action = "lmb";
  spawnBowLine(state, player, player.abilityVectorX, player.abilityVectorY, BOW_QUICK_RANGE, 9, "arrow", 1000);
  if (hit) damageNpc(state, kernel, player, hit.target, quickShotDamage(player), { knockbackModifier: 0.35, energyGain: def.energyGain });
  setSlotCooldown(player, "LMB", def.cooldownMs);
  clearActiveAbility(player);
}

function firePrecisionShot(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["bow-precision"];
  const hits = lineHits(state, player, player.abilityVectorX, player.abilityVectorY, BOW_PRECISION_RANGE, 14);
  player.action = "rmb";
  spawnBowLine(state, player, player.abilityVectorX, player.abilityVectorY, BOW_PRECISION_RANGE, 13, "piercearrow", 250);
  for (const hit of hits) {
    damageNpc(state, kernel, player, hit.target, Math.floor(bowHighDamage(player) * 1.1), { knockbackModifier: 2.64, isHeavyImpact: true, energyGain: def.energyGain });
  }
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function fireVolley(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["bow-volley"];
  const baseAngle = Math.atan2(player.abilityVectorY, player.abilityVectorX);
  const damageByTarget = new Map<string, number>();
  player.action = "rmb";
  for (let i = 0; i < 7; i += 1) {
    const angle = baseAngle - (35 * Math.PI) / 180 + ((70 * Math.PI) / 180) * (i / 6);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    spawnBowLine(state, player, dx, dy, BOW_VOLLEY_RANGE, 8, "arrow", 1000);
    const hit = firstLineHit(state, player, dx, dy, BOW_VOLLEY_RANGE, 9);
    if (!hit) continue;
    const previous = damageByTarget.get(hit.target.id) ?? 0;
    const scale = previous === 0 ? 1 : 0.25;
    damageByTarget.set(hit.target.id, previous + 1);
    damageNpc(state, kernel, player, hit.target, Math.floor(bowMildDamage(player) * 1.4 * scale), { knockbackModifier: 0.5, energyGain: def.energyGain });
  }
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function dashDirectionFromMovementOrAim(player: PlayerEntity, input: RuntimeInput) {
  const moveLength = Math.hypot(input.dx, input.dy);
  if (moveLength > 0.05) return { x: input.dx / moveLength, y: input.dy / moveLength };
  const direction = directionFromAim(player, input);
  return { x: direction.x, y: direction.y };
}

function beginBowReposition(player: PlayerEntity, slot: AbilitySlot, def: PlayerAbilityDef, input: RuntimeInput) {
  const dash = MOVEMENT_DASHES["bow-reposition"];
  beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + dash.durationMs);
  const direction = dashDirectionFromMovementOrAim(player, input);
  player.abilityVectorX = direction.x;
  player.abilityVectorY = direction.y;
  player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
  player.iframeMs = Math.max(player.iframeMs, abilityCastMs(player, def.castMs) + dash.durationMs);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, slot, def.cooldownMs);
}

function beginBowVault(player: PlayerEntity, slot: AbilitySlot, def: PlayerAbilityDef, input: RuntimeInput) {
  const dash = MOVEMENT_DASHES["bow-vault"];
  beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + dash.durationMs);
  const direction = directionFromAim(player, input);
  player.abilityVectorX = -direction.x;
  player.abilityVectorY = -direction.y;
  player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
  player.iframeMs = Math.max(player.iframeMs, 480);
  setSlotCooldown(player, slot, def.cooldownMs);
}

function moveBowDash(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, previousMs: number, dt: number, castMs: number, spec: PlayerDashSpec) {
  player.iframeMs = Math.max(player.iframeMs, Math.max(0, player.activeDurationMs - player.activeMs));
  moveActiveLinearDash(state, kernel, player, previousMs, dt, castMs, spec.durationMs, dashDistanceForPmsps(player, spec), spec.effectKind ?? "rushdust");
}

function finishBowVault(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  player.action = "space";
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, BOW_VAULT_RADIUS, "dust", 420);
  for (const target of hostileNpcs(state, player)) {
    if (Math.hypot(target.x - player.x, target.y - player.y) > BOW_VAULT_RADIUS + bodyRadius(target)) continue;
    damageNpc(state, kernel, player, target, bowMildDamage(player), { knockbackModifier: 0.8, energyGain: PLAYER_ABILITY_DEFS["bow-vault"].energyGain });
  }
  clearActiveAbility(player);
}

function applyBowStealth(player: PlayerEntity, slot: AbilitySlot, def: PlayerAbilityDef, input: RuntimeInput) {
  beginActiveAbility(player, slot, def.id, input, 80);
  addPlayerCombatFlag(player, "stealth");
  player.damageAmpMs = Math.max(player.damageAmpMs, 3000);
  player.iframeMs = Math.max(player.iframeMs, 120);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, slot, def.cooldownMs);
  clearActiveAbility(player);
}

function spawnPlayerDecoy(state: MmoSkillDemoState, player: PlayerEntity) {
  const id = `${player.id}-decoy-${state.tick}`.slice(0, 32);
  const existing = Array.from(entitiesOfType<NpcEntity>(state, "npc")).find((npc) => npc.kind === "player-decoy" && npc.summonedBy === player.id && npc.hp > 0);
  if (existing) existing.hp = 0;
  const decoy = acquireNpcEntity();
  decoy.id = id;
  decoy.kind = "player-decoy";
  decoy.role = "decoy";
  decoy.zoneId = player.zoneId;
  decoy.elite = false;
  decoy.personality = "passive";
  decoy.impactType = "dust";
  decoy.knockbackModifier = 0;
  decoy.x = player.x;
  decoy.y = player.y;
  decoy.spawnX = player.x;
  decoy.spawnY = player.y;
  decoy.hp = 24;
  decoy.maxHp = 24;
  decoy.respawnMs = 3500;
  decoy.attackCooldownMs = 0;
  decoy.projectileCooldownMs = 0;
  decoy.phaseMs = 0;
  decoy.summonedBy = player.id;
  decoy.knockbackX = 0;
  decoy.knockbackY = 0;
  decoy.knockbackMs = 0;
  decoy.knockbackHeavy = false;
  decoy.stunMs = 0;
  decoy.iframeMs = 0;
  decoy.castMs = 0;
  decoy.damageAmpMs = 0;
  decoy.combatState = "";
  decoy.combatFlags = "";
  decoy.lastAttackStyle = "";
  state.npcs[id] = decoy;
  addEnergy(player, PLAYER_ABILITY_DEFS["bow-decoy"].energyGain);
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, BOW_DECOY_TAUNT_RANGE, "dust", 420);
}

function explodePlayerDecoy(state: MmoSkillDemoState, kernel: CollisionKernel, owner: PlayerEntity, decoy: NpcEntity) {
  spawnPlayerEffectHazard(state, owner, "aoe", decoy.x, decoy.y, decoy.x, decoy.y, 150, "spark", 520);
  for (const target of entitiesOfType<NpcEntity>(state, "npc")) {
    if (target.hp <= 0 || target.zoneId !== decoy.zoneId || isPeaceNpc(target) || target.kind === "player-decoy") continue;
    if (Math.hypot(target.x - decoy.x, target.y - decoy.y) > 150 + bodyRadius(target)) continue;
    damageNpc(state, kernel, owner, target, bowDecentDamage(owner), { knockbackModifier: 1.1, energyGain: PLAYER_ABILITY_DEFS["bow-decoy"].energyGain });
  }
}

function fireBolas(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["bow-bolas"];
  const primary = firstLineHit(state, player, player.abilityVectorX, player.abilityVectorY, BOW_BOLAS_RANGE, 48);
  player.action = "e";
  spawnBowLine(state, player, player.abilityVectorX, player.abilityVectorY, BOW_BOLAS_RANGE, 48, "root", 1500);
  if (primary) {
    damageNpc(state, kernel, player, primary.target, bowMildDamage(player), { knockbackModifier: 0.4, energyGain: def.energyGain });
    const startX = primary.target.x;
    const startY = primary.target.y;
    const endX = startX + player.abilityVectorX * BOW_BOLAS_LINK_RANGE;
    const endY = startY + player.abilityVectorY * BOW_BOLAS_LINK_RANGE;
    const secondary = hostileNpcs(state, player).filter((target) => target.id !== primary.target.id && pointSegmentDistance(target.x, target.y, startX, startY, endX, endY) <= 52 + bodyRadius(target));
    const hitTerrain = !canOccupy(kernel, endX, endY, PLAYER_RADIUS);
    const linked = secondary.length > 0 || hitTerrain;
    if (linked) {
      primary.target.stunMs = Math.max(primary.target.stunMs, 1500);
      primary.target.damageAmpMs = Math.max(primary.target.damageAmpMs, 1500);
      addCombatFlag(primary.target, "bow-vulnerable");
      for (const target of secondary) {
        damageNpc(state, kernel, player, target, Math.floor(bowMildDamage(player) * 0.7), { knockbackModifier: 0.2, energyGain: 0 });
        target.stunMs = Math.max(target.stunMs, 1500);
        target.damageAmpMs = Math.max(target.damageAmpMs, 1500);
        addCombatFlag(target, "bow-vulnerable");
      }
    } else {
      primary.target.slowMs = Math.max(primary.target.slowMs ?? 0, 1000);
    }
  }
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function spawnPlayerPersistentHazard(state: MmoSkillDemoState, player: PlayerEntity, idPrefix: string, x: number, y: number, radius: number, damage: number, lifetimeMs: number, effectKind: string, pulse = 0) {
  const id = `${idPrefix}-${state.tick}-${entityTypeCount(state, "hazard")}`.slice(0, 32);
  const hazard = acquireHazardEntity();
  hazard.id = id;
  hazard.kind = "aoe";
  hazard.zoneId = player.zoneId;
  hazard.ownerId = player.id;
  hazard.x = x;
  hazard.y = y;
  hazard.toX = x;
  hazard.toY = y;
  hazard.radius = u16Ms(radius);
  hazard.windupMs = 0;
  hazard.lifetimeMs = u16Ms(lifetimeMs);
  hazard.damage = u16Ms(damage);
  hazard.knockbackModifier = 0;
  hazard.isHeavyImpact = false;
  hazard.armorPierce = false;
  hazard.effectKind = effectKind.slice(0, 16);
  hazard.text = "";
  hazard.pulse = u16Ms(pulse);
  state.hazards[id] = hazard;
  pruneEntityTypeToMax(state, "hazard", 180);
}

function spawnPlayerTimedHazard(
  state: MmoSkillDemoState,
  player: PlayerEntity,
  idPrefix: string,
  x: number,
  y: number,
  radius: number,
  damage: number,
  lifetimeMs: number,
  effectKind: string,
  windupMs = 0,
  pulse = 0,
  toX = x,
  toY = y,
  kind: HazardEntity["kind"] = "aoe"
) {
  const id = `${idPrefix}-${state.tick}-${entityTypeCount(state, "hazard")}`.slice(0, 32);
  const hazard = acquireHazardEntity();
  hazard.id = id;
  hazard.kind = kind;
  hazard.zoneId = player.zoneId;
  hazard.ownerId = player.id;
  hazard.x = x;
  hazard.y = y;
  hazard.toX = toX;
  hazard.toY = toY;
  hazard.radius = u16Ms(radius);
  hazard.windupMs = u16Ms(windupMs);
  hazard.lifetimeMs = u16Ms(lifetimeMs);
  hazard.damage = u16Ms(damage);
  hazard.knockbackModifier = 0;
  hazard.isHeavyImpact = false;
  hazard.armorPierce = false;
  hazard.effectKind = effectKind.slice(0, 16);
  hazard.text = "";
  hazard.pulse = u16Ms(pulse);
  state.hazards[id] = hazard;
  pruneEntityTypeToMax(state, "hazard", 180);
}

function throwCaltrops(state: MmoSkillDemoState, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["bow-caltrops"];
  const ratio = clamp(player.chargeMs / 1000, 0, 1);
  const maxRange = CALTROPS_MIN_MAX_RANGE + ratio * (CALTROPS_FULL_MAX_RANGE - CALTROPS_MIN_MAX_RANGE);
  const centerRange = Math.max(36, maxRange * 0.54);
  const x = clamp(player.x + player.abilityVectorX * centerRange, 16, mmoSkillDemoMap.pixelWidth - 16);
  const y = clamp(player.y + player.abilityVectorY * centerRange, 16, mmoSkillDemoMap.pixelHeight - 16);
  const radius = Math.max(42, maxRange * 0.36);
  player.action = "e";
  spawnPlayerPersistentHazard(state, player, "caltrops", x, y, radius, Math.max(1, Math.floor(bowMildDamage(player) * 0.32)), 5200, "caltrops", 0);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function spawnArrowStorm(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["bow-arrowstorm"];
  const aim = aimPoint(player, input);
  spawnPlayerPersistentHazard(state, player, "arrowstorm", aim.x, aim.y, BOW_ARROW_STORM_RADIUS, bowMildDamage(player), 3000, "arrowstorm", 0);
  setSlotCooldown(player, "R", def.cooldownMs);
  clearActiveAbility(player);
}

function tickFlurry(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, dt: number) {
  const def = PLAYER_ABILITY_DEFS["bow-flurry"];
  const castMs = abilityCastMs(player, def.castMs);
  if (player.activeMs < castMs) {
    player.castMs = Math.max(player.castMs, Math.floor(castMs - player.activeMs));
    return;
  }
  player.abilityTickMs = u16Ms(player.abilityTickMs + Math.max(0, Math.floor(dt * 1000)));
  while (player.abilityTickMs >= 166 && player.activeMs < player.activeDurationMs) {
    player.abilityTickMs -= 166;
    const index = playerFlagStacks(player, "flurry");
    setPlayerFlagStacks(player, "flurry", index + 1);
    const spread = ((((stableHash(`${player.id}:${player.activeMs}:${index}`) % 1000) / 1000) - 0.5) * Math.PI) / 14;
    const angle = Math.atan2(player.abilityVectorY, player.abilityVectorX) + spread;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    if (index % BOW_FLURRY_VISUAL_STRIDE === 0) spawnBowLine(state, player, dx, dy, BOW_FLURRY_RANGE, 7, "arrow", 420);
    const hit = firstLineHit(state, player, dx, dy, BOW_FLURRY_RANGE, 8);
    if (hit) damageNpc(state, kernel, player, hit.target, bowMildDamage(player), { knockbackModifier: 0.01, energyGain: 0, ultimate: true });
  }
}

function fireArcaneBolt(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["staff-arcane-bolt"];
  player.action = "lmb";
  spawnPlayerProjectile(state, player, "arcane-bolt", {
    dx: player.abilityVectorX,
    dy: player.abilityVectorY,
    width: 12,
    damage: spellDamage(player, 11),
    knockbackModifier: 0.25
  });
  setSlotCooldown(player, "LMB", def.cooldownMs);
  clearActiveAbility(player);
}

function tickSiphonBeam(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput, dt: number) {
  const def = PLAYER_ABILITY_DEFS["staff-siphon-beam"];
  if (input.action !== "lmb" && player.activeMs > 80) {
    clearActiveAbility(player);
    return;
  }
  const direction = directionFromAim(player, input);
  player.abilityVectorX = direction.x;
  player.abilityVectorY = direction.y;
  player.action = "lmb";
  player.abilityTickMs = u16Ms(player.abilityTickMs + Math.max(0, Math.floor(dt * 1000)));
  while (player.abilityTickMs >= 300) {
    player.abilityTickMs -= 300;
    spawnBowLine(state, player, player.abilityVectorX, player.abilityVectorY, 350, 10, "siphon", 260);
    const hit = firstLineHit(state, player, player.abilityVectorX, player.abilityVectorY, 350, 10);
    if (hit && damageNpc(state, kernel, player, hit.target, spellDamage(player, 4), { knockbackModifier: 0.05, energyGain: def.energyGain })) healPlayer(player, 3);
  }
  if (player.activeMs >= player.activeDurationMs) clearActiveAbility(player);
}

function finishMeteor(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["staff-meteor"];
  const aim = clampedAim(player, input, 500);
  player.action = "rmb";
  spawnPlayerTimedHazard(state, player, "meteor", aim.x, aim.y, 140, spellDamage(player, 32), 120, "meteor", 1000, 0);
  spawnPlayerTimedHazard(state, player, "meteor-burn", aim.x, aim.y, 140, 4, 2000, "meteor-burn", 1000, 0);
  spawnPlayerEffectHazard(state, player, "aoe", aim.x, aim.y, aim.x, aim.y, 140, "meteor", 1200);
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishHealingPulse(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["staff-healing-pulse"];
  const aim = clampedAim(player, input, 400);
  player.action = "rmb";
  healPlayersNear(state, player, aim.x, aim.y, 160, 28);
  spawnPlayerEffectHazard(state, player, "aoe", aim.x, aim.y, aim.x, aim.y, 160, "heal", 620);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishFrostChain(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["staff-frost-chain"];
  const aim = { x: player.x + player.abilityVectorX * PLAYER_PROJECTILE_DEFS.frost.maxRange, y: player.y + player.abilityVectorY * PLAYER_PROJECTILE_DEFS.frost.maxRange };
  const target = nearestHostileNearPoint(state, player, aim.x, aim.y, 120) ?? firstLineHit(state, player, player.abilityVectorX, player.abilityVectorY, 400, 8)?.target;
  player.action = "rmb";
  spawnPlayerProjectile(state, player, "frost", {
    dx: player.abilityVectorX,
    dy: player.abilityVectorY,
    width: 8,
    damage: spellDamage(player, 14),
    knockbackModifier: 0.15,
    targetId: target?.id
  });
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishAstralWalk(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["staff-astral-walk"];
  const startX = player.x;
  const startY = player.y;
  const aim = aimPoint(player, input);
  teleportPlayerByVector(kernel, player, aim.x - player.x, aim.y - player.y, 450);
  player.action = "space";
  player.iframeMs = Math.max(player.iframeMs, 220);
  spawnPlayerTimedHazard(state, player, "astral-decoy", startX, startY, 120, spellDamage(player, 15), 120, "arcane", 1000, 0);
  spawnPlayerEffectHazard(state, player, "line", startX, startY, player.x, player.y, 8, "phase", 520);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "Space", def.cooldownMs);
  clearActiveAbility(player);
}

function tickZephyr(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, dt: number) {
  if (player.activeMs % 140 < Math.max(16, Math.floor(dt * 1000))) {
    spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 100, "zephyr", 220);
  }
  for (const target of hostileNpcs(state, player)) {
    if (Math.hypot(target.x - player.x, target.y - player.y) > 100 + bodyRadius(target)) continue;
    applyKnockback(target, player, 0.28, 2, false);
    updateKnockback(kernel, target, dt);
  }
  if (player.activeMs >= player.activeDurationMs) clearActiveAbility(player);
}

function finishIceWall(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["staff-ice-wall"];
  const aim = clampedAim(player, input, 450);
  const angle = Math.atan2(aim.y - player.y, aim.x - player.x) + Math.PI / 2;
  const half = 125;
  const x1 = aim.x + Math.cos(angle) * half;
  const y1 = aim.y + Math.sin(angle) * half;
  const x2 = aim.x - Math.cos(angle) * half;
  const y2 = aim.y - Math.sin(angle) * half;
  spawnPlayerTimedHazard(state, player, "icewall", x1, y1, 30, 0, 4000, "icewall", 0, 0, x2, y2, "line");
  spawnPlayerEffectHazard(state, player, "line", x1, y1, x2, y2, 30, "icewall", 4000);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "Q", def.cooldownMs);
  clearActiveAbility(player);
}

function tickArcaneBubble(state: MmoSkillDemoState, player: PlayerEntity, dt: number) {
  if (player.activeMs < abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-arcane-bubble"].castMs)) return;
  if (player.activeMs % 180 < Math.max(16, Math.floor(dt * 1000))) {
    spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 220, "bubble", 260);
  }
  if (player.activeMs >= player.activeDurationMs) clearActiveAbility(player);
}

function finishPetrify(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["staff-petrify"];
  player.action = "q";
  spawnPummelShockwave(state, player, 250, (60 * Math.PI) / 180, 520, "petrify");
  const hits = damageNpcsInCone(state, kernel, player, 250, (60 * Math.PI) / 180, spellDamage(player, 8), { knockbackModifier: 0.35, energyGain: def.energyGain });
  for (const target of hostileNpcs(state, player)) if (targetInFrontCone(player, target, 250, (60 * Math.PI) / 180)) target.stunMs = Math.max(target.stunMs, 1500);
  if (hits === 0) addEnergy(player, Math.floor(def.energyGain / 2));
  setSlotCooldown(player, "Q", def.cooldownMs);
  clearActiveAbility(player);
}

function finishGravityWell(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["staff-gravity-well"];
  const aim = clampedAim(player, input, 500);
  spawnPlayerTimedHazard(state, player, "gravity", aim.x, aim.y, 200, spellDamage(player, 4), 3000, "gravity", 0, 0);
  spawnPlayerEffectHazard(state, player, "aoe", aim.x, aim.y, aim.x, aim.y, 200, "gravity", 760);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function finishConsecration(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["staff-consecration"];
  const aim = clampedAim(player, input, 400);
  spawnPlayerTimedHazard(state, player, "consecrate", aim.x, aim.y, 220, spellDamage(player, 6), 4000, "consecrate", 0, 0);
  spawnPlayerEffectHazard(state, player, "aoe", aim.x, aim.y, aim.x, aim.y, 220, "consecrate", 760);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function finishDispelNova(state: MmoSkillDemoState, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["staff-dispel-nova"];
  player.action = "e";
  for (const ally of entitiesOfType<PlayerEntity>(state, "player")) {
    if (ally.zoneId !== player.zoneId || Math.hypot(ally.x - player.x, ally.y - player.y) > 300) continue;
    ally.stunMs = 0;
    ally.slowMs = 0;
    ally.damageAmpMs = 0;
    removePlayerCombatFlag(ally, "stealth");
  }
  for (const target of hostileNpcs(state, player)) {
    if (Math.hypot(target.x - player.x, target.y - player.y) > 300 + bodyRadius(target)) continue;
    target.damageAmpMs = 0;
    removeCombatFlag(target, "bow-vulnerable");
    removeCombatFlag(target, "soulbound");
    removeCombatFlag(target, "enfeebled");
    setNpcFlagStacks(target, "hex", 0);
  }
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 300, "dispel", 620);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function tickMaelstrom(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput, dt: number) {
  const def = PLAYER_ABILITY_DEFS["staff-maelstrom"];
  const castMs = abilityCastMs(player, def.castMs);
  if (player.activeMs < castMs) {
    player.castMs = Math.max(player.castMs, Math.floor(castMs - player.activeMs));
    return;
  }
  player.abilityTickMs = u16Ms(player.abilityTickMs + Math.max(0, Math.floor(dt * 1000)));
  while (player.abilityTickMs >= 400) {
    player.abilityTickMs -= 400;
    const aim = clampedAim(player, input, 500);
    spawnPlayerEffectHazard(state, player, "aoe", aim.x, aim.y, aim.x, aim.y, 260, "maelstrom", 360);
    damageNpcsInRadius(state, kernel, player, aim.x, aim.y, 260, spellDamage(player, 13), { knockbackModifier: -0.12, ultimate: true });
  }
  if (player.activeMs >= player.activeDurationMs) clearActiveAbility(player);
}

function tickTranquility(state: MmoSkillDemoState, player: PlayerEntity, dt: number) {
  const def = PLAYER_ABILITY_DEFS["staff-tranquility"];
  const castMs = abilityCastMs(player, def.castMs);
  if (player.activeMs < castMs) {
    player.castMs = Math.max(player.castMs, Math.floor(castMs - player.activeMs));
    return;
  }
  player.abilityTickMs = u16Ms(player.abilityTickMs + Math.max(0, Math.floor(dt * 1000)));
  while (player.abilityTickMs >= 400) {
    player.abilityTickMs -= 400;
    healPlayersNear(state, player, player.x, player.y, 350, 15);
    spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 350, "tranquil", 340);
  }
  if (player.activeMs >= player.activeDurationMs) clearActiveAbility(player);
}

function fireMagicMissile(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["wand-magic-missile"];
  const aim = clampedAim(player, input, PLAYER_PROJECTILE_DEFS.missile.maxRange);
  const target = nearestHostileNearPoint(state, player, aim.x, aim.y, 120) ?? firstLineHit(state, player, player.abilityVectorX, player.abilityVectorY, PLAYER_PROJECTILE_DEFS.missile.maxRange, 5)?.target;
  player.action = "lmb";
  spawnPlayerProjectile(state, player, "missile", {
    dx: player.abilityVectorX,
    dy: player.abilityVectorY,
    width: 5,
    damage: Math.max(1, Math.round(spellDamage(player, 6) * 1.1)),
    knockbackModifier: 0.18,
    targetId: target?.id
  });
  setSlotCooldown(player, "LMB", def.cooldownMs);
  clearActiveAbility(player);
}

function fireHex(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["wand-hex"];
  player.action = "lmb";
  spawnPlayerProjectile(state, player, "hex", {
    dx: player.abilityVectorX,
    dy: player.abilityVectorY,
    width: 11,
    damage: spellDamage(player, 3),
    knockbackModifier: 0.05
  });
  setSlotCooldown(player, "LMB", def.cooldownMs);
  clearActiveAbility(player);
}

function fireMendingSpark(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["wand-mending-spark"];
  const aim = { x: player.x + player.abilityVectorX * PLAYER_PROJECTILE_DEFS.mend.maxRange, y: player.y + player.abilityVectorY * PLAYER_PROJECTILE_DEFS.mend.maxRange };
  const hit = nearestHostileNearPoint(state, player, aim.x, aim.y, 120) ?? firstLineHit(state, player, player.abilityVectorX, player.abilityVectorY, PLAYER_PROJECTILE_DEFS.mend.maxRange, 16)?.target;
  player.action = "lmb";
  spawnPlayerProjectile(state, player, "mend", {
    dx: player.abilityVectorX,
    dy: player.abilityVectorY,
    width: 16,
    damage: spellDamage(player, 5),
    knockbackModifier: 0.08,
    targetId: hit?.id
  });
  setSlotCooldown(player, "LMB", def.cooldownMs);
  clearActiveAbility(player);
}

function fireFocusedRay(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["wand-focused-ray"];
  player.action = "rmb";
  spawnPlayerProjectile(state, player, "focused-ray", {
    dx: player.abilityVectorX,
    dy: player.abilityVectorY,
    width: 12,
    damage: spellDamage(player, 26),
    knockbackModifier: 0.5
  });
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishSoulBind(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["wand-soul-bind"];
  const aim = clampedAim(player, input, 500);
  const first = nearestHostileNearPoint(state, player, aim.x, aim.y, 120);
  if (first) {
    const second = nearestHostileNearPoint(state, player, first.x, first.y, 260, new Set([first.id]));
    if (second) {
      addCombatFlag(first, "soulbound");
      addCombatFlag(second, "soulbound");
      first.damageAmpMs = Math.max(first.damageAmpMs, 4000);
      second.damageAmpMs = Math.max(second.damageAmpMs, 4000);
      spawnPlayerEffectHazard(state, player, "line", first.x, first.y, second.x, second.y, 10, "soulbind", 4000);
    }
  }
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishFlashHeal(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["wand-flash-heal"];
  const ally = alliedPlayerNearAim(state, player, input, 450);
  healPlayer(ally, 22);
  ally.berserkMs = Math.max(ally.berserkMs, 1000);
  spawnPlayerEffectHazard(state, player, "line", player.x, player.y, ally.x, ally.y, 8, "heal", 420);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishBlink(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["wand-blink"];
  const startX = player.x;
  const startY = player.y;
  const aim = aimPoint(player, input);
  teleportPlayerByVector(kernel, player, aim.x - player.x, aim.y - player.y, 350);
  spawnPlayerEffectHazard(state, player, "line", startX, startY, player.x, player.y, 5, "phase", 420);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "Space", def.cooldownMs);
  clearActiveAbility(player);
}

function tickPhaseShift(state: MmoSkillDemoState, player: PlayerEntity, dt: number) {
  player.iframeMs = Math.max(player.iframeMs, Math.max(0, player.activeDurationMs - player.activeMs));
  addPlayerCombatFlag(player, "stealth");
  player.damageAmpMs = Math.max(player.damageAmpMs, Math.max(0, player.activeDurationMs - player.activeMs));
  if (player.activeMs % 180 < Math.max(16, Math.floor(dt * 1000))) spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 54, "phase", 240);
  if (player.activeMs >= player.activeDurationMs) {
    removePlayerCombatFlag(player, "stealth");
    clearActiveAbility(player);
  }
}

function finishRewind(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["wand-rewind"];
  const startX = player.x;
  const startY = player.y;
  applyRewind(kernel, player);
  spawnPlayerEffectHazard(state, player, "line", startX, startY, player.x, player.y, 8, "rewind", 620);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "Space", def.cooldownMs);
  clearActiveAbility(player);
}

function tickMirrorShield(state: MmoSkillDemoState, player: PlayerEntity, dt: number) {
  if (player.activeMs % 180 < Math.max(16, Math.floor(dt * 1000))) spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 64, "mirror", 260);
  if (player.activeMs >= player.activeDurationMs) clearActiveAbility(player);
}

function finishNightmare(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["wand-nightmare"];
  player.action = "q";
  spawnPummelShockwave(state, player, 300, (45 * Math.PI) / 180, 520, "nightmare");
  for (const target of hostileNpcs(state, player)) {
    if (!targetInFrontCone(player, target, 300, (45 * Math.PI) / 180)) continue;
    damageNpc(state, kernel, player, target, spellDamage(player, 4), { knockbackModifier: 1.2, energyGain: def.energyGain });
    target.slowMs = Math.max(target.slowMs ?? 0, 1500);
    target.attackCooldownMs = extendU16Ms(target.attackCooldownMs, 500);
    applyKnockback(target, player, 1.4, 8, false);
  }
  setSlotCooldown(player, "Q", def.cooldownMs);
  clearActiveAbility(player);
}

function finishRupture(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["wand-rupture"];
  const aim = clampedAim(player, input, 450);
  player.action = "e";
  spawnPlayerEffectHazard(state, player, "aoe", aim.x, aim.y, aim.x, aim.y, 80, "rupture", 520);
  for (const target of hostileNpcs(state, player)) {
    if (Math.hypot(target.x - aim.x, target.y - aim.y) > 80 + bodyRadius(target)) continue;
    const stacks = npcFlagStacks(target, "hex");
    damageNpc(state, kernel, player, target, spellDamage(player, 12 + stacks * 7), { knockbackModifier: 0.4, energyGain: def.energyGain });
    setNpcFlagStacks(target, "hex", 0);
    if (stacks > 0) target.damageAmpMs = 0;
  }
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function finishEnfeeble(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["wand-enfeeble"];
  const ratio = clamp(player.chargeMs / 1000, 0, 1);
  const radius = 90 + 90 * ratio;
  const aim = clampedAim(player, input, 400);
  for (const target of hostileNpcs(state, player)) {
    if (Math.hypot(target.x - aim.x, target.y - aim.y) > radius + bodyRadius(target)) continue;
    addCombatFlag(target, "enfeebled");
    target.slowMs = Math.max(target.slowMs ?? 0, 3000);
  }
  spawnPlayerTimedHazard(state, player, "enfeeble", aim.x, aim.y, radius, 0, 3000, "enfeeble", 0, 0);
  spawnPlayerEffectHazard(state, player, "aoe", aim.x, aim.y, aim.x, aim.y, radius, "enfeeble", 760);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function tickChaosVolley(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, dt: number) {
  const def = PLAYER_ABILITY_DEFS["wand-chaos-volley"];
  const castMs = abilityCastMs(player, def.castMs);
  if (player.activeMs < castMs) {
    player.castMs = Math.max(player.castMs, Math.floor(castMs - player.activeMs));
    return;
  }
  player.abilityTickMs = u16Ms(player.abilityTickMs + Math.max(0, Math.floor(dt * 1000)));
  while (player.abilityTickMs >= 125 && playerFlagStacks(player, "chaos") < 24) {
    player.abilityTickMs -= 125;
    const index = playerFlagStacks(player, "chaos");
    setPlayerFlagStacks(player, "chaos", index + 1);
    const candidates = hostileNpcs(state, player).filter((target) => targetInFrontCone(player, target, 500, (60 * Math.PI) / 180));
    const target = candidates.length ? candidates[stableHash(`${player.id}:${player.activeMs}:${index}`) % candidates.length] : undefined;
    if (!target) continue;
    spawnPlayerProjectile(state, player, "chaos", {
      dx: player.abilityVectorX,
      dy: player.abilityVectorY,
      width: 6,
      damage: spellDamage(player, 6),
      knockbackModifier: 0.05,
      targetId: target.id
    });
  }
  if (player.activeMs >= player.activeDurationMs || playerFlagStacks(player, "chaos") >= 24) clearActiveAbility(player);
}

function finishApotheosis(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const ally = alliedPlayerNearAim(state, player, input, 450);
  addPlayerCombatFlag(ally, "apotheosis");
  ally.damageAmpMs = Math.max(ally.damageAmpMs, 5000);
  ally.berserkMs = Math.max(ally.berserkMs, 1800);
  spawnPlayerEffectHazard(state, player, "line", player.x, player.y, ally.x, ally.y, 9, "apotheosis", 620);
  setSlotCooldown(player, "R", PLAYER_ABILITY_DEFS["wand-apotheosis"].cooldownMs);
  clearActiveAbility(player);
}

function pummelChargeRatio(player: PlayerEntity) {
  return clamp(player.chargeMs / PUMMEL_MAX_CHARGE_MS, 0, 1);
}

function pummelConeRange(ratio: number) {
  return 55 + clamp(ratio, 0, 1) * 57;
}

function pummelConeHalfAngle(ratio: number) {
  return ((50 + ratio * 40) * Math.PI) / 180;
}

function finishPummel(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["mace-pummel"];
  const ratio = pummelChargeRatio(player);
  const range = pummelConeRange(ratio);
  const halfAngle = pummelConeHalfAngle(ratio);
  const baseDamage = 7 + player.combatLevel * 2 + playerDamageBonus(player);
  const damage = Math.max(1, Math.floor(baseDamage * (1 + ratio * 5)));
  const kbm = 0.65 * (1 + ratio * 2);
  player.action = "lmb";
  player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
  const lungeDistance = range * (0.08 + ratio * 0.12);
  moveMmoCircle(
    player,
    player.abilityVectorX * lungeDistance,
    player.abilityVectorY * lungeDistance,
    { rectBlocked: () => false, circleBlocked: (circle) => !canOccupy(kernel, circle.x, circle.y, circle.radius), blockedAt: (x, y, radius) => !canOccupy(kernel, x, y, radius) },
    { radius: PLAYER_RADIUS }
  );
  spawnPummelShockwave(state, player, range, halfAngle);
  let hit = false;
  for (const target of hostileNpcs(state, player)) {
    if (!targetInFrontCone(player, target, range, halfAngle)) continue;
    if (damageNpc(state, kernel, player, target, damage, { knockbackModifier: kbm, isHeavyImpact: ratio > 0.5, energyGain: def.energyGain })) {
      hit = true;
      spawnCombatTextHazard(state, target, "damage", `-${damage}`);
    }
  }
  if (hit) spawnPlayerEffectHazard(state, player, "aoe", player.x + player.abilityVectorX * 34, player.y + player.abilityVectorY * 34, player.x, player.y, Math.floor(44 + ratio * 20), ratio >= 1 ? "whitehot" : "dust", 460);
  setSlotCooldown(player, "LMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishCrushingLeap(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["mace-crushing-leap"];
  player.action = "rmb";
  player.castMs = Math.max(player.castMs, 180);
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 72, "crater", 900);
  for (const target of hostileNpcs(state, player)) {
    if (Math.hypot(target.x - player.x, target.y - player.y) > 72 + bodyRadius(target)) continue;
    if (damageNpc(state, kernel, player, target, 14 + player.combatLevel * 2 + playerDamageBonus(player), { knockbackModifier: 1.85, isHeavyImpact: true, energyGain: def.energyGain })) {
      target.knockbackX += player.abilityVectorX * 90;
      target.knockbackY += player.abilityVectorY * 90;
      target.knockbackMs = Math.max(target.knockbackMs, 220);
      target.knockbackHeavy = true;
      target.stunMs = Math.max(target.stunMs, 1000);
      target.slowMs = Math.max(target.slowMs ?? 0, 3000);
      target.castMs = 0;
      target.attackCooldownMs = extendU16Ms(target.attackCooldownMs, 450);
      target.projectileCooldownMs = extendU16Ms(target.projectileCooldownMs, 250);
    }
  }
  clearActiveAbility(player);
}

function fireRockSmash(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["mace-rock-smash"];
  const ratio = clamp(player.chargeMs / 1000, 0, 1);
  const maxCharge = ratio >= 0.98;
  const baseAngle = Math.atan2(player.abilityVectorY, player.abilityVectorX);
  const shots = maxCharge ? 10 : 1;
  player.action = "e";
  player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
  let hitCount = 0;
  for (let i = 0; i < shots; i += 1) {
    const spread = shots === 1 ? 0 : -0.58 + (1.16 * i) / Math.max(1, shots - 1);
    const sizeSeed = shots === 1 ? 0.38 : ((stableHash(`${player.id}:${state.tick}:${i}`) % 100) / 100);
    const size = maxCharge ? 0.45 + sizeSeed * 1.25 : 0.55;
    const angle = baseAngle + spread;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const range = maxCharge ? 130 + (1.7 - size) * 60 : 220;
    const width = 10 + size * 10;
    const damage = Math.max(1, Math.floor(((maxCharge ? 9 : 11) + player.combatLevel * (maxCharge ? 1.2 : 1.6) + playerDamageBonus(player) + size * (maxCharge ? 13 : 4)) * 0.7));
    const kbm = (0.55 + size * (maxCharge ? 1.25 : 0.85)) * 0.8;
    const x2 = player.x + dx * range;
    const y2 = player.y + dy * range;
    spawnPlayerEffectHazard(state, player, "line", player.x + dx * 18, player.y + dy * 18, x2, y2, Math.floor(width), maxCharge ? "boulders" : "boulder", 720);
    for (const target of hostileNpcs(state, player)) {
      const distance = pointSegmentDistance(target.x, target.y, player.x, player.y, x2, y2);
      if (distance > width + bodyRadius(target)) continue;
      if (shots > 1 && activeHas(player, `rock:${target.id}:${i}`)) continue;
      if (damageNpc(state, kernel, player, target, damage, { knockbackModifier: kbm, isHeavyImpact: size > 1.1, energyGain: def.energyGain })) hitCount += 1;
      activeMark(player, `rock:${target.id}:${i}`);
    }
  }
  if (maxCharge) {
    player.knockbackX -= player.abilityVectorX * 52;
    player.knockbackY -= player.abilityVectorY * 52;
    player.knockbackMs = Math.max(player.knockbackMs, 130);
  }
  if (hitCount > 0) addEnergy(player, Math.min(12, hitCount * 2));
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function tickWhirlwind(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, dt: number) {
  const channelMs = player.activeMs - Math.max(50, player.activeDurationMs - 2750);
  if (channelMs < 0) return;
  player.abilityTickMs = u16Ms(player.abilityTickMs + Math.max(0, Math.floor(dt * 1000)));
  if (player.abilityTickMs < 250) return;
  player.abilityTickMs = 0;
  player.action = "r";
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, WHIRLWIND_RADIUS, "whirlwind", 280);
  for (const target of hostileNpcs(state, player)) {
    if (Math.hypot(target.x - player.x, target.y - player.y) > WHIRLWIND_RADIUS + bodyRadius(target)) continue;
    damageNpc(state, kernel, player, target, Math.floor((22 + Math.floor(player.combatLevel * 1.2) + playerDamageBonus(player)) * 1.3), { knockbackModifier: -0.1, isHeavyImpact: false, ultimate: true });
  }
}

function finishTwinStrike(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["twin-strike"];
  player.action = "lmb";
  moveMeleeDashBeforeFire(state, kernel, player, "twin-strike");
  spawnPummelShockwave(state, player, 55, (45 * Math.PI) / 180, 260, "twinwave");
  damageNpcsInCone(state, kernel, player, 55, (45 * Math.PI) / 180, martialDamage(player, 8), { knockbackModifier: 0.25, energyGain: def.energyGain });
  setSlotCooldown(player, "LMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishToxicSlash(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["twin-toxic-slash"];
  player.action = "lmb";
  moveMeleeDashBeforeFire(state, kernel, player, "twin-toxic-slash");
  spawnPummelShockwave(state, player, 60, (50 * Math.PI) / 180, 300, "toxicwave");
  for (const target of coneTargets(state, player, 60, (50 * Math.PI) / 180)) {
    if (damageNpc(state, kernel, player, target, martialDamage(player, 5), { knockbackModifier: 0.2, energyGain: def.energyGain })) applyNpcPoison(target);
  }
  setSlotCooldown(player, "LMB", def.cooldownMs);
  clearActiveAbility(player);
}

function fireThrowingDirk(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["twin-throwing-dirk"];
  player.action = "lmb";
  spawnPlayerProjectile(state, player, "dirk", {
    dx: player.abilityVectorX,
    dy: player.abilityVectorY,
    width: 6,
    damage: martialDamage(player, 6),
    knockbackModifier: 0.1
  });
  setSlotCooldown(player, "LMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishShadowLunge(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["twin-shadow-lunge"];
  player.action = "rmb";
  const { startX, startY } = moveMeleeDashBeforeFire(state, kernel, player, "twin-shadow-lunge");
  spawnPlayerEffectHazard(state, player, "line", startX, startY, player.x, player.y, 18, "phase", 420);
  const traveled = Math.hypot(player.x - startX, player.y - startY);
  for (const target of hostileNpcs(state, player)) {
    const distance = pointSegmentDistance(target.x, target.y, startX, startY, player.x, player.y);
    if (distance > 18 + bodyRadius(target)) continue;
    const projection = (target.x - startX) * player.abilityVectorX + (target.y - startY) * player.abilityVectorY;
    const crossed = projection > 0 && projection < traveled - bodyRadius(target);
    damageNpc(state, kernel, player, target, martialDamage(player, crossed ? 19 : 16), { knockbackModifier: 0.9, isHeavyImpact: true, energyGain: def.energyGain });
  }
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishExsanguinate(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["twin-exsanguinate"];
  player.action = "rmb";
  moveMeleeDashBeforeFire(state, kernel, player, "twin-exsanguinate");
  spawnPummelShockwave(state, player, 65, (60 * Math.PI) / 180, 360, "bloodwave");
  for (const target of coneTargets(state, player, 65, (60 * Math.PI) / 180)) {
    const stacks = consumeNpcPoison(target);
    damageNpc(state, kernel, player, target, martialDamage(player, 12 + stacks * 6), { knockbackModifier: 0.55, energyGain: def.energyGain });
  }
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function fireFanOfKnives(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["twin-fan-of-knives"];
  const baseAngle = Math.atan2(player.abilityVectorY, player.abilityVectorX);
  player.action = "rmb";
  for (let i = 0; i < 5; i += 1) {
    const angle = baseAngle - (28 * Math.PI) / 180 + ((56 * Math.PI) / 180) * (i / 4);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    spawnPlayerProjectile(state, player, "knife", {
      dx,
      dy,
      width: 5,
      damage: martialDamage(player, 10),
      knockbackModifier: 0.2
    });
  }
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function tickSwiftStep(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, previousMs: number, dt: number) {
  const def = PLAYER_ABILITY_DEFS["twin-swift-step"];
  const castMs = abilityCastMs(player, def.castMs);
  moveActiveLinearDash(state, kernel, player, previousMs, dt, castMs, 200, 220, "phase");
  if (player.activeMs >= player.activeDurationMs) {
    addTimedPlayerFlag(player, "swift", 1500);
    clearActiveAbility(player);
  }
}

function finishSmokeBomb(state: MmoSkillDemoState, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["twin-smoke-bomb"];
  player.action = "space";
  addTimedPlayerFlag(player, "stealth", 3000);
  spawnPlayerPersistentHazard(state, player, "smoke", player.x, player.y, 130, 0, 3000, "smoke", 0);
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 130, "smoke", 700);
  for (const target of hostileNpcs(state, player)) {
    if (Math.hypot(target.x - player.x, target.y - player.y) <= 130 + bodyRadius(target)) addTimedNpcFlag(target, "blind", 3000);
  }
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "Space", def.cooldownMs);
  clearActiveAbility(player);
}

function applyBloodlust(state: MmoSkillDemoState, player: PlayerEntity, slot: AbilitySlot, def: PlayerAbilityDef, input: RuntimeInput) {
  beginActiveAbility(player, slot, def.id, input, 80);
  player.action = "space";
  addTimedPlayerFlag(player, "bloodlust", 2500);
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 60, "blood", 620);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, slot, def.cooldownMs);
  clearActiveAbility(player);
}

function applyBlur(player: PlayerEntity, slot: AbilitySlot, def: PlayerAbilityDef, input: RuntimeInput) {
  beginActiveAbility(player, slot, def.id, input, 80);
  player.iframeMs = Math.max(player.iframeMs, 750);
  player.castMs = 0;
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, slot, def.cooldownMs);
  clearActiveAbility(player);
}

function finishVanish(state: MmoSkillDemoState, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["twin-vanish"];
  player.action = "q";
  addTimedPlayerFlag(player, "stealth", 4000);
  addTimedPlayerFlag(player, "vanish", 4000);
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 56, "phase", 620);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "Q", def.cooldownMs);
  clearActiveAbility(player);
}

function finishNoxiousFlask(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["twin-noxious-flask"];
  const aim = clampedAim(player, input, 350);
  const dx = aim.x - player.x;
  const dy = aim.y - player.y;
  const travelDistance = Math.max(1, Math.hypot(dx, dy));
  player.action = "e";
  spawnPlayerProjectile(state, player, "noxious-flask", {
    dx,
    dy,
    width: 10,
    damage: martialDamage(player, 3),
    knockbackModifier: 0,
    travelDistance
  });
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function finishDeathsMark(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["twin-deaths-mark"];
  const aim = clampedAim(player, input, 350);
  const target = nearestHostileNearPoint(state, player, aim.x, aim.y, 90) ?? firstLineHit(state, player, player.abilityVectorX, player.abilityVectorY, 350, 12)?.target;
  player.action = "e";
  if (target) {
    spawnPlayerEffectHazard(state, player, "line", player.x, player.y, target.x, target.y, 8, "deathmark", 620);
    damageNpc(state, kernel, player, target, martialDamage(player, 4), { knockbackModifier: 0.05, energyGain: def.energyGain });
    addTimedNpcFlag(target, "deathmark", 3000);
  }
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function tickBladeDance(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, dt: number) {
  const def = PLAYER_ABILITY_DEFS["twin-blade-dance"];
  const castMs = abilityCastMs(player, def.castMs);
  if (player.activeMs < castMs) {
    player.castMs = Math.max(player.castMs, Math.floor(castMs - player.activeMs));
    return;
  }
  player.action = "r";
  player.abilityTickMs = u16Ms(player.abilityTickMs + Math.max(0, Math.floor(dt * 1000)));
  while (player.abilityTickMs >= 250) {
    player.abilityTickMs -= 250;
    spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 110, "bladedance", 260);
    damageNpcsInRadius(state, kernel, player, player.x, player.y, 110, martialDamage(player, 8), { knockbackModifier: -0.05, ultimate: true });
  }
  if (player.activeMs >= player.activeDurationMs) clearActiveAbility(player);
}

function finishAssassinate(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput) {
  const def = PLAYER_ABILITY_DEFS["twin-assassinate"];
  const aim = clampedAim(player, input, 400);
  const target = nearestHostileNearPoint(state, player, aim.x, aim.y, 110) ?? firstLineHit(state, player, player.abilityVectorX, player.abilityVectorY, 400, 14)?.target;
  player.action = "r";
  const dashX = target ? target.x - player.x : player.abilityVectorX;
  const dashY = target ? target.y - player.y : player.abilityVectorY;
  const { startX, startY } = moveMeleeDashBeforeFire(state, kernel, player, "twin-assassinate", dashX, dashY);
  if (target) {
    spawnPlayerEffectHazard(state, player, "line", startX, startY, player.x, player.y, 8, "phase", 520);
    const before = target.hp;
    damageNpc(state, kernel, player, target, martialDamage(player, 48), { knockbackModifier: 0.2, ultimate: true });
    if (before > 0 && target.hp <= 0) addEnergy(player, 50);
  }
  setSlotCooldown(player, "R", def.cooldownMs);
  clearActiveAbility(player);
}

function finishBladeBasic(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, abilityId: "blade-cleave" | "blade-sever" | "blade-sunder") {
  const def = PLAYER_ABILITY_DEFS[abilityId];
  const params = abilityId === "blade-cleave"
    ? { range: 75, half: 65, damage: 12, flag: "" }
    : abilityId === "blade-sever"
      ? { range: 70, half: 55, damage: 10, flag: "mortal" }
      : { range: 72, half: 50, damage: 11, flag: "fractured" };
  player.action = "lmb";
  moveMeleeDashBeforeFire(state, kernel, player, abilityId);
  spawnPummelShockwave(state, player, params.range, (params.half * Math.PI) / 180, 340, abilityId === "blade-sever" ? "severwave" : abilityId === "blade-sunder" ? "sunderwave" : "bladewave");
  for (const target of coneTargets(state, player, params.range, (params.half * Math.PI) / 180)) {
    if (damageNpc(state, kernel, player, target, martialDamage(player, params.damage), { knockbackModifier: 0.45, energyGain: def.energyGain }) && params.flag) {
      addTimedNpcFlag(target, params.flag, 3000);
    }
  }
  setSlotCooldown(player, "LMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishBrutalStrike(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["blade-brutal-strike"];
  player.action = "rmb";
  moveMeleeDashBeforeFire(state, kernel, player, "blade-brutal-strike");
  spawnPummelShockwave(state, player, 85, (45 * Math.PI) / 180, 420, "brutalwave");
  for (const target of coneTargets(state, player, 85, (45 * Math.PI) / 180)) {
    if (damageNpc(state, kernel, player, target, martialDamage(player, 26), { knockbackModifier: 1.7, isHeavyImpact: true, energyGain: def.energyGain })) {
      target.stunMs = Math.max(target.stunMs, 550);
      target.castMs = 0;
      target.attackCooldownMs = extendU16Ms(target.attackCooldownMs, 250);
    }
  }
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishThrust(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["blade-thrust"];
  player.action = "rmb";
  moveMeleeDashBeforeFire(state, kernel, player, "blade-thrust");
  spawnBowLine(state, player, player.abilityVectorX, player.abilityVectorY, 180, 20, "pierceblade", 360);
  for (const hit of lineHits(state, player, player.abilityVectorX, player.abilityVectorY, 180, 20)) {
    damageNpc(state, kernel, player, hit.target, martialDamage(player, 15), { knockbackModifier: 0.55, energyGain: def.energyGain });
  }
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function finishBloodthirst(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["blade-bloodthirst"];
  player.action = "rmb";
  moveMeleeDashBeforeFire(state, kernel, player, "blade-bloodthirst");
  spawnPummelShockwave(state, player, 65, (60 * Math.PI) / 180, 360, "bloodwave");
  let dealt = 0;
  for (const target of coneTargets(state, player, 65, (60 * Math.PI) / 180)) {
    dealt += damageNpcAmount(state, kernel, player, target, martialDamage(player, 14), { knockbackModifier: 0.5, energyGain: def.energyGain });
  }
  healPlayer(player, Math.floor(dealt * 0.5));
  setSlotCooldown(player, "RMB", def.cooldownMs);
  clearActiveAbility(player);
}

function tickCombatRoll(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, previousMs: number, dt: number) {
  const dash = MOVEMENT_DASHES["blade-combat-roll"];
  const castMs = abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-combat-roll"].castMs);
  player.iframeMs = Math.max(player.iframeMs, Math.max(0, player.activeDurationMs - player.activeMs));
  moveActiveLinearDash(state, kernel, player, previousMs, dt, castMs, dash.durationMs, dashDistanceForPmsps(player, dash), dash.effectKind ?? "rushdust");
  if (player.activeMs >= player.activeDurationMs) clearActiveAbility(player);
}

function tickLeapAttack(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, previousMs: number, dt: number) {
  const dash = MOVEMENT_DASHES["blade-leap-attack"];
  const castMs = abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-leap-attack"].castMs);
  moveActiveLinearDash(state, kernel, player, previousMs, dt, castMs, dash.durationMs, dashDistanceForPmsps(player, dash), dash.effectKind ?? "dust");
  if (player.activeMs < player.activeDurationMs) return;
  const def = PLAYER_ABILITY_DEFS["blade-leap-attack"];
  player.action = "space";
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 85, "crater", 620);
  for (const target of hostileNpcs(state, player)) {
    if (Math.hypot(target.x - player.x, target.y - player.y) > 85 + bodyRadius(target)) continue;
    damageNpc(state, kernel, player, target, martialDamage(player, 14), { knockbackModifier: 0.75, energyGain: def.energyGain });
  }
  clearActiveAbility(player);
}

function applyJuggernaut(state: MmoSkillDemoState, player: PlayerEntity, slot: AbilitySlot, def: PlayerAbilityDef, input: RuntimeInput) {
  beginActiveAbility(player, slot, def.id, input, 80);
  player.action = "space";
  addTimedPlayerFlag(player, "juggernaut", 3000);
  player.slowMs = 0;
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 60, "dust", 620);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, slot, def.cooldownMs);
  clearActiveAbility(player);
}

function tickRiposte(player: PlayerEntity) {
  if (player.activeMs >= player.activeDurationMs) {
    player.guardMs = 0;
    clearActiveAbility(player);
  }
}

function applyIronWill(state: MmoSkillDemoState, player: PlayerEntity, slot: AbilitySlot, def: PlayerAbilityDef, input: RuntimeInput) {
  beginActiveAbility(player, slot, def.id, input, 80);
  player.stunMs = 0;
  player.slowMs = 0;
  player.knockbackX = 0;
  player.knockbackY = 0;
  player.knockbackMs = 0;
  addTimedPlayerFlag(player, "ironwill", 2500);
  healPlayer(player, Math.max(1, Math.floor(player.maxHp * 0.25)));
  addPlayerMsFlag(player, "ironwill-haste", 5000);
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 64, "shield", 620);
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, slot, def.cooldownMs);
  clearActiveAbility(player);
}

function finishIntimidatingShout(state: MmoSkillDemoState, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["blade-intimidating-shout"];
  const range = 192;
  player.action = "e";
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, range, "shout", 620);
  for (const target of hostileNpcs(state, player)) {
    if (Math.hypot(target.x - player.x, target.y - player.y) > range + bodyRadius(target)) continue;
    addTimedNpcFlag(target, "weakened", 4000);
    target.slowMs = Math.max(target.slowMs ?? 0, 3000);
  }
  for (const ally of entitiesOfType<PlayerEntity>(state, "player")) {
    if (ally.hp <= 0 || ally.zoneId !== player.zoneId || Math.hypot(ally.x - player.x, ally.y - player.y) > range + PLAYER_RADIUS) continue;
    addPlayerMsFlag(ally, "shout-haste", 3000);
    setPlayerFlagStacks(ally, "shout-regen", Math.max(playerFlagStacks(ally, "shout-regen"), 5));
    setPlayerFlagStacks(ally, "shout-regen-step", playerFlagStacks(ally, "shout-regen-step") || 1000);
  }
  addEnergy(player, def.energyGain);
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function finishRazorWind(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity) {
  const def = PLAYER_ABILITY_DEFS["blade-razor-wind"];
  const ratio = clamp(player.chargeMs / 1000, 0.2, 1);
  const range = 350 + 200 * ratio;
  const width = 45 + 35 * ratio;
  const damage = martialDamage(player, 12 + Math.floor(13 * ratio));
  player.action = "e";
  spawnPlayerProjectile(state, player, "razor", {
    dx: player.abilityVectorX,
    dy: player.abilityVectorY,
    width,
    damage,
    knockbackModifier: 0.35,
    travelDistance: range,
    charged: ratio >= 0.98
  });
  setSlotCooldown(player, "E", def.cooldownMs);
  clearActiveAbility(player);
}

function tickOmnislash(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, dt: number) {
  const def = PLAYER_ABILITY_DEFS["blade-omnislash"];
  const castMs = abilityCastMs(player, def.castMs);
  player.iframeMs = Math.max(player.iframeMs, Math.max(0, player.activeDurationMs - player.activeMs));
  if (player.activeMs < castMs) {
    player.castMs = Math.max(player.castMs, Math.floor(castMs - player.activeMs));
    return;
  }
  player.abilityTickMs = u16Ms(player.abilityTickMs + Math.max(0, Math.floor(dt * 1000)));
  while (player.abilityTickMs >= 300 && playerFlagStacks(player, "omni") < 8) {
    player.abilityTickMs -= 300;
    const index = playerFlagStacks(player, "omni");
    const radius = index === 0 ? 350 : 200;
    const candidates = hostileNpcs(state, player).filter((target) => Math.hypot(target.x - player.x, target.y - player.y) <= radius + bodyRadius(target));
    if (!candidates.length) break;
    const target = candidates[stableHash(`${player.id}:${player.activeMs}:${index}`) % candidates.length];
    const angle = (stableHash(`${target.id}:${index}`) / 0xffffffff) * Math.PI * 2;
    const x = clamp(target.x - Math.cos(angle) * 24, PLAYER_RADIUS, mmoSkillDemoMap.pixelWidth - PLAYER_RADIUS);
    const y = clamp(target.y - Math.sin(angle) * 24, PLAYER_RADIUS, mmoSkillDemoMap.pixelHeight - PLAYER_RADIUS);
    if (canOccupy(kernel, x, y, PLAYER_RADIUS)) {
      spawnPlayerEffectHazard(state, player, "line", player.x, player.y, x, y, 6, "phase", 260);
      player.x = x;
      player.y = y;
    }
    damageNpc(state, kernel, player, target, martialDamage(player, 12), { knockbackModifier: 0.25, ultimate: true });
    setPlayerFlagStacks(player, "omni", index + 1);
  }
  if (player.activeMs >= player.activeDurationMs || playerFlagStacks(player, "omni") >= 8) clearActiveAbility(player);
}

function applyDuelistsTrance(state: MmoSkillDemoState, player: PlayerEntity, slot: AbilitySlot, def: PlayerAbilityDef, input: RuntimeInput) {
  beginActiveAbility(player, slot, def.id, input, 80);
  addTimedPlayerFlag(player, "trance", 8000);
  spawnPlayerEffectHazard(state, player, "aoe", player.x, player.y, player.x, player.y, 70, "trance", 760);
  setSlotCooldown(player, slot, def.cooldownMs);
  clearActiveAbility(player);
}

function updateActiveAbility(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput, dt: number) {
  ensurePlayerCombatLoadout(player);
  if (!player.activeAbility) return false;
  const { previousMs, elapsedMs } = tickMmoAbility(player, dt);
  const combatSlot = combatSlotForAction(input.action);
  if (combatSlot && combatSlot !== player.activeSlot && !(player.activeAbility === "mace-whirlwind" && combatSlot !== "Space")) {
    if (!canInterruptActiveAbility(player, combatSlot)) return true;
    interruptActiveAbility(player);
    return false;
  }
  if ((player.activeAbility === "mace-pummel" || player.activeAbility === "mace-rock-smash" || player.activeAbility === "bow-caltrops" || player.activeAbility === "wand-enfeeble" || player.activeAbility === "blade-razor-wind") && combatSlot !== player.activeSlot) {
    activeMark(player, "released");
  }
  if (player.activeAbility === "bow-quick-shot") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-quick-shot"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-quick-shot"].castMs)) fireQuickShot(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "bow-precision") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-precision"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-precision"].castMs)) firePrecisionShot(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "bow-volley") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-volley"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-volley"].castMs)) fireVolley(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "bow-bolas") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-bolas"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-bolas"].castMs)) fireBolas(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "bow-decoy") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-decoy"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-decoy"].castMs)) {
      spawnPlayerDecoy(state, player);
      setSlotCooldown(player, "Q", PLAYER_ABILITY_DEFS["bow-decoy"].cooldownMs);
      clearActiveAbility(player);
    }
    return false;
  }
  if (player.activeAbility === "bow-caltrops") {
    chargeMmoAbility(player, 1000);
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-caltrops"].castMs));
    if (state.tick % 4 === 0) {
      const ratio = clamp(player.chargeMs / 1000, 0, 1);
      const range = CALTROPS_MIN_MAX_RANGE + ratio * (CALTROPS_FULL_MAX_RANGE - CALTROPS_MIN_MAX_RANGE);
      spawnPlayerEffectHazard(state, player, "line", player.x, player.y, player.x + player.abilityVectorX * range, player.y + player.abilityVectorY * range, range, "cone", 180, Math.round((CALTROPS_HALF_ANGLE * 180) / Math.PI));
    }
    if ((activeHas(player, "released") && player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-caltrops"].castMs)) || player.chargeMs >= 1000) throwCaltrops(state, player);
    return false;
  }
  if (player.activeAbility === "bow-reposition") {
    const castMs = abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-reposition"].castMs);
    moveBowDash(state, kernel, player, previousMs, dt, castMs, MOVEMENT_DASHES["bow-reposition"]);
    if (player.activeMs >= player.activeDurationMs) {
      setPlayerFlagStacks(player, "bow-empower", 3);
      clearActiveAbility(player);
    }
    return true;
  }
  if (player.activeAbility === "bow-vault") {
    const castMs = abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-vault"].castMs);
    moveBowDash(state, kernel, player, previousMs, dt, castMs, MOVEMENT_DASHES["bow-vault"]);
    if (player.activeMs >= player.activeDurationMs) finishBowVault(state, kernel, player);
    return true;
  }
  if (player.activeAbility === "bow-flurry") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    tickFlurry(state, kernel, player, dt);
    if (player.activeMs >= player.activeDurationMs) clearActiveAbility(player);
    return false;
  }
  if (player.activeAbility === "bow-arrowstorm") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-arrowstorm"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["bow-arrowstorm"].castMs)) spawnArrowStorm(state, player, input);
    return false;
  }
  if (player.activeAbility === "staff-arcane-bolt") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-arcane-bolt"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-arcane-bolt"].castMs)) fireArcaneBolt(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "staff-siphon-beam") {
    tickSiphonBeam(state, kernel, player, input, dt);
    return false;
  }
  if (player.activeAbility === "staff-meteor") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-meteor"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-meteor"].castMs)) finishMeteor(state, player, input);
    return false;
  }
  if (player.activeAbility === "staff-healing-pulse") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-healing-pulse"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-healing-pulse"].castMs)) finishHealingPulse(state, player, input);
    return false;
  }
  if (player.activeAbility === "staff-frost-chain") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-frost-chain"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-frost-chain"].castMs)) finishFrostChain(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "staff-astral-walk") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-astral-walk"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-astral-walk"].castMs)) finishAstralWalk(state, kernel, player, input);
    return true;
  }
  if (player.activeAbility === "staff-zephyr") {
    tickZephyr(state, kernel, player, dt);
    return true;
  }
  if (player.activeAbility === "staff-ice-wall") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-ice-wall"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-ice-wall"].castMs)) finishIceWall(state, player, input);
    return false;
  }
  if (player.activeAbility === "staff-arcane-bubble") {
    tickArcaneBubble(state, player, dt);
    return false;
  }
  if (player.activeAbility === "staff-petrify") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-petrify"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-petrify"].castMs)) finishPetrify(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "staff-gravity-well") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-gravity-well"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-gravity-well"].castMs)) finishGravityWell(state, player, input);
    return false;
  }
  if (player.activeAbility === "staff-consecration") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-consecration"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-consecration"].castMs)) finishConsecration(state, player, input);
    return false;
  }
  if (player.activeAbility === "staff-dispel-nova") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-dispel-nova"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["staff-dispel-nova"].castMs)) finishDispelNova(state, player);
    return false;
  }
  if (player.activeAbility === "staff-maelstrom") {
    tickMaelstrom(state, kernel, player, input, dt);
    return false;
  }
  if (player.activeAbility === "staff-tranquility") {
    tickTranquility(state, player, dt);
    return false;
  }
  if (player.activeAbility === "wand-magic-missile") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-magic-missile"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-magic-missile"].castMs)) fireMagicMissile(state, kernel, player, input);
    return false;
  }
  if (player.activeAbility === "wand-hex") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-hex"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-hex"].castMs)) fireHex(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "wand-mending-spark") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-mending-spark"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-mending-spark"].castMs)) fireMendingSpark(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "wand-focused-ray") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-focused-ray"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-focused-ray"].castMs)) fireFocusedRay(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "wand-soul-bind") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-soul-bind"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-soul-bind"].castMs)) finishSoulBind(state, player, input);
    return false;
  }
  if (player.activeAbility === "wand-flash-heal") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-flash-heal"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-flash-heal"].castMs)) finishFlashHeal(state, player, input);
    return false;
  }
  if (player.activeAbility === "wand-blink") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-blink"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-blink"].castMs)) finishBlink(state, kernel, player, input);
    return true;
  }
  if (player.activeAbility === "wand-phase-shift") {
    tickPhaseShift(state, player, dt);
    return true;
  }
  if (player.activeAbility === "wand-rewind") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-rewind"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-rewind"].castMs)) finishRewind(state, kernel, player);
    return true;
  }
  if (player.activeAbility === "wand-mirror-shield") {
    tickMirrorShield(state, player, dt);
    return false;
  }
  if (player.activeAbility === "wand-nightmare") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-nightmare"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-nightmare"].castMs)) finishNightmare(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "wand-rupture") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-rupture"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-rupture"].castMs)) finishRupture(state, kernel, player, input);
    return false;
  }
  if (player.activeAbility === "wand-enfeeble") {
    chargeMmoAbility(player, 1000);
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-enfeeble"].castMs));
    if ((activeHas(player, "released") && player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-enfeeble"].castMs)) || player.chargeMs >= 1000) finishEnfeeble(state, player, input);
    return false;
  }
  if (player.activeAbility === "wand-chaos-volley") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    tickChaosVolley(state, kernel, player, dt);
    return false;
  }
  if (player.activeAbility === "wand-apotheosis") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-apotheosis"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["wand-apotheosis"].castMs)) finishApotheosis(state, player, input);
    return false;
  }
  if (player.activeAbility === "twin-strike") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-strike"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-strike"].castMs)) finishTwinStrike(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "twin-toxic-slash") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-toxic-slash"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-toxic-slash"].castMs)) finishToxicSlash(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "twin-throwing-dirk") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-throwing-dirk"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-throwing-dirk"].castMs)) fireThrowingDirk(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "twin-shadow-lunge") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-shadow-lunge"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-shadow-lunge"].castMs)) finishShadowLunge(state, kernel, player);
    return true;
  }
  if (player.activeAbility === "twin-exsanguinate") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-exsanguinate"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-exsanguinate"].castMs)) finishExsanguinate(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "twin-fan-of-knives") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-fan-of-knives"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-fan-of-knives"].castMs)) fireFanOfKnives(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "twin-swift-step") {
    tickSwiftStep(state, kernel, player, previousMs, dt);
    return true;
  }
  if (player.activeAbility === "twin-smoke-bomb") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-smoke-bomb"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-smoke-bomb"].castMs)) finishSmokeBomb(state, player);
    return false;
  }
  if (player.activeAbility === "twin-vanish") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-vanish"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-vanish"].castMs)) finishVanish(state, player);
    return false;
  }
  if (player.activeAbility === "twin-noxious-flask") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-noxious-flask"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-noxious-flask"].castMs)) finishNoxiousFlask(state, player, input);
    return false;
  }
  if (player.activeAbility === "twin-deaths-mark") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-deaths-mark"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-deaths-mark"].castMs)) finishDeathsMark(state, kernel, player, input);
    return false;
  }
  if (player.activeAbility === "twin-blade-dance") {
    tickBladeDance(state, kernel, player, dt);
    return false;
  }
  if (player.activeAbility === "twin-assassinate") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-assassinate"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["twin-assassinate"].castMs)) finishAssassinate(state, kernel, player, input);
    return true;
  }
  if (player.activeAbility === "blade-cleave" || player.activeAbility === "blade-sever" || player.activeAbility === "blade-sunder") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    const abilityId = player.activeAbility as "blade-cleave" | "blade-sever" | "blade-sunder";
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS[abilityId].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS[abilityId].castMs)) finishBladeBasic(state, kernel, player, abilityId);
    return false;
  }
  if (player.activeAbility === "blade-brutal-strike") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-brutal-strike"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-brutal-strike"].castMs)) finishBrutalStrike(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "blade-thrust") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-thrust"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-thrust"].castMs)) finishThrust(state, kernel, player);
    return true;
  }
  if (player.activeAbility === "blade-bloodthirst") {
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-bloodthirst"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-bloodthirst"].castMs)) finishBloodthirst(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "blade-combat-roll") {
    tickCombatRoll(state, kernel, player, previousMs, dt);
    return true;
  }
  if (player.activeAbility === "blade-leap-attack") {
    tickLeapAttack(state, kernel, player, previousMs, dt);
    return true;
  }
  if (player.activeAbility === "blade-riposte") {
    tickRiposte(player);
    return false;
  }
  if (player.activeAbility === "blade-intimidating-shout") {
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-intimidating-shout"].castMs));
    if (player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-intimidating-shout"].castMs)) finishIntimidatingShout(state, player);
    return false;
  }
  if (player.activeAbility === "blade-razor-wind") {
    chargeMmoAbility(player, 1000);
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-razor-wind"].castMs));
    if ((activeHas(player, "released") && player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["blade-razor-wind"].castMs)) || player.chargeMs >= 1000) finishRazorWind(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "blade-omnislash") {
    tickOmnislash(state, kernel, player, dt);
    return true;
  }
  if (player.activeAbility === "mace-pummel") {
    chargeMmoAbility(player, PUMMEL_MAX_CHARGE_MS);
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["mace-pummel"].castMs));
    if ((activeHas(player, "released") && player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["mace-pummel"].castMs)) || player.chargeMs >= PUMMEL_MAX_CHARGE_MS) finishPummel(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "mace-rock-smash") {
    chargeMmoAbility(player, 1000);
    const direction = directionFromAim(player, input);
    player.abilityVectorX = direction.x;
    player.abilityVectorY = direction.y;
    player.castMs = Math.max(player.castMs, abilityCastMs(player, PLAYER_ABILITY_DEFS["mace-rock-smash"].castMs));
    if ((activeHas(player, "released") && player.activeMs >= abilityCastMs(player, PLAYER_ABILITY_DEFS["mace-rock-smash"].castMs)) || player.chargeMs >= 1000) fireRockSmash(state, kernel, player);
    return false;
  }
  if (player.activeAbility === "mace-crushing-leap") {
    player.iframeMs = Math.max(player.iframeMs, Math.max(0, 500 - player.activeMs));
    const castMs = abilityCastMs(player, PLAYER_ABILITY_DEFS["mace-crushing-leap"].castMs);
    if (player.activeMs > castMs && previousMs < player.activeDurationMs) {
      if (previousMs <= castMs) {
        const direction = directionFromAim(player, input);
        player.abilityVectorX = direction.x;
        player.abilityVectorY = direction.y;
        const distance = Math.hypot(direction.aim.x - player.x, direction.aim.y - player.y);
        player.activeDurationMs = u16Ms(Math.max(castMs + 90, castMs + Math.max(80, Math.min(500, (distance / 330) * 1000)) * animationDurationScale(player)));
      }
      const travelMs = Math.max(1, player.activeDurationMs - castMs);
      const previousTravelMs = clamp(previousMs - castMs, 0, travelMs);
      const currentTravelMs = clamp(player.activeMs - castMs, 0, travelMs);
      const move = (330 / animationDurationScale(player)) * ((currentTravelMs - previousTravelMs) / 1000);
      moveMmoCircle(
        player,
        player.abilityVectorX * move,
        player.abilityVectorY * move,
        { rectBlocked: () => false, circleBlocked: (circle) => !canOccupy(kernel, circle.x, circle.y, circle.radius), blockedAt: (x, y, radius) => !canOccupy(kernel, x, y, radius) },
        { radius: PLAYER_RADIUS }
      );
    }
    if (player.activeMs >= player.activeDurationMs) finishCrushingLeap(state, kernel, player);
    return true;
  }
  if (player.activeAbility === "space-rush") {
    const storedWindupMs = activeHitMs(player, "windup", "rush");
    const rushWindupMs = Number.isFinite(storedWindupMs) ? storedWindupMs : abilityCastMs(player, PLAYER_ABILITY_DEFS["space-rush"].castMs);
    if (input.action !== "space" && player.activeMs > 500) {
      endRushAbility(player);
      return false;
    }
    if (player.activeMs < rushWindupMs) {
      player.castMs = Math.max(player.castMs, Math.floor(rushWindupMs - player.activeMs));
      return true;
    }
    if (player.activeMs >= player.activeDurationMs) {
      player.action = "idle";
      endRushAbility(player);
      return false;
    }
    if (previousMs <= rushWindupMs) {
      const startDirection = directionFromAim(player, input);
      player.abilityVectorX = startDirection.x;
      player.abilityVectorY = startDirection.y;
      player.abilityTickMs = 0;
    }
    const rushT = rushProgress(player.activeMs, rushWindupMs, player.activeDurationMs);
    const direction = directionFromAim(player, input);
    const maxTurnDeg = 3 - rushT * 2.7;
    const turned = rotateVectorToward(player.abilityVectorX, player.abilityVectorY, direction.x, direction.y, (maxTurnDeg * Math.PI) / 180);
    player.abilityVectorX = turned.x;
    player.abilityVectorY = turned.y;
    const beforeX = player.x;
    const beforeY = player.y;
    const baseSpeed = 118 + Math.min(38, player.combatLevel * 2) + Math.min(14, Math.max(0, player.masteryRank - 1) * 2);
    const move = baseSpeed * rushSpeedMultiplier(player.activeMs, rushWindupMs, player.activeDurationMs) * dt;
    moveRushSwept(state, kernel, player, player.abilityVectorX * move, player.abilityVectorY * move);
    player.rushDistance = u16Ms(player.rushDistance + Math.hypot(player.x - beforeX, player.y - beforeY));
    const hitRadius = PLAYER_RADIUS * 1.2 * (1 + rushT * 1.5);
    for (const target of hostileNpcs(state, player)) {
      if (player.activeMs - activeHitMs(player, "rush", target.id) < 1000) continue;
      if (Math.hypot(target.x - player.x, target.y - player.y) > hitRadius + bodyRadius(target)) continue;
      activeMarkHitMs(player, "rush", target.id, player.activeMs);
      const scale = clamp(player.rushDistance / 240, 0, 1);
      if (damageNpc(state, kernel, player, target, Math.floor(8 + player.combatLevel * 1.5 + scale * 18), { knockbackModifier: 0.8 + scale * 2.2, isHeavyImpact: scale > 0.55, energyGain: PLAYER_ABILITY_DEFS["space-rush"].energyGain })) {
        target.attackCooldownMs = extendU16Ms(target.attackCooldownMs, 450);
      }
    }
    return true;
  }
  if (player.activeAbility === "q-berserk") {
    if (player.activeMs >= 750) clearActiveAbility(player);
    return false;
  }
  if (player.activeAbility === "mace-whirlwind") {
    tickWhirlwind(state, kernel, player, dt);
    if (player.activeMs >= player.activeDurationMs) clearActiveAbility(player);
    return false;
  }
  return false;
}

function applyMovement(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput, dt: number) {
  ensurePlayerCombatLoadout(player);
  player.aimX = normalizeWorldCoord(input.aimX, player.aimX || player.x, mmoSkillDemoMap.pixelWidth);
  player.aimY = normalizeWorldCoord(input.aimY, player.aimY || player.y, mmoSkillDemoMap.pixelHeight);
  const ms = Math.max(0, Math.floor(dt * 1000));
  player.guardMs = u16Ms(player.guardMs - ms);
  player.berserkMs = u16Ms(player.berserkMs - ms);
  player.slowMs = u16Ms((player.slowMs ?? 0) - ms);
  decayCombatTimers(player, dt);
  tickPlayerStatusEffects(player, ms);
  if (hasTimedPlayerFlag(player, "juggernaut")) player.slowMs = 0;
  if (player.damageAmpMs <= 0) {
    for (const flag of ["stealth", "apotheosis", "swift", "bloodlust", "vanish", "ironwill", "juggernaut", "trance"]) removePlayerCombatFlag(player, flag);
  }
  if (updateKnockback(kernel, player, dt) || player.stunMs > 0) {
    decayPlayerMomentum(player, dt);
    if (player.stunMs > 0) {
      if (player.activeAbility === "space-rush") endRushAbility(player);
      else clearActiveAbility(player);
      player.castMs = 0;
    }
    if (state.roomKind === "dungeon-instance") player.zoneId = "dungeon";
    else if (state.roomKind === "cottage-instance") player.zoneId = "cottage";
    else player.zoneId = zoneForPoint(player.x, player.y);
    state.players[player.id] = player;
    return;
  }
  if (player.hp > 0 && updateEscort(state, kernel, player, dt)) {
    decayPlayerMomentum(player, dt);
    if (state.roomKind === "dungeon-instance") player.zoneId = "dungeon";
    else if (state.roomKind === "cottage-instance") player.zoneId = "cottage";
    else if (!player.escortNpcId) player.zoneId = zoneForPoint(player.x, player.y);
    state.players[player.id] = player;
    return;
  }
  if (updateActiveAbility(state, kernel, player, input, dt)) {
    decayPlayerMomentum(player, dt);
    if (state.roomKind === "dungeon-instance") player.zoneId = "dungeon";
    else if (state.roomKind === "cottage-instance") player.zoneId = "cottage";
    else player.zoneId = zoneForPoint(player.x, player.y);
    state.players[player.id] = player;
    return;
  }
  const aim = aimPoint(player, input);
  const spaceRushInput = input.action === "space" && abilityDefForSlot(player, "Space")?.id === "space-rush";
  const spaceSlotReady = input.action === "space" && isSlotReady(player, "Space");
  const spaceVector = input.action === "space" && !spaceRushInput && spaceSlotReady ? { dx: aim.x - player.x, dy: aim.y - player.y } : undefined;
  const rawDx = spaceVector ? spaceVector.dx : input.dx;
  const rawDy = spaceVector ? spaceVector.dy : input.dy;
  const length = Math.hypot(rawDx, rawDy) || 1;
  const mobility =
    input.action === "space" && !spaceRushInput && spaceSlotReady && hasAbility(player, "space-ghost-walk")
      ? 190
      : input.action === "space" && !spaceRushInput && spaceSlotReady && hasAbility(player, "space-dash")
        ? 165
        : input.action === "space" && !spaceRushInput && spaceSlotReady && hasAbility(player, "space-jump")
          ? 132
          : 0;
  const boots = hasGear(player, "leather-boots") || hasGear(player, "mining-boots") ? 18 : 0;
  const berserk = berserkFactor(player);
  const whirlwindCastMs = player.activeAbility === "mace-whirlwind" ? Math.max(50, player.activeDurationMs - 2750) : PLAYER_ABILITY_DEFS["mace-whirlwind"].castMs;
  const whirlwindChannel = player.activeAbility === "mace-whirlwind" && player.activeMs > whirlwindCastMs
    ? clamp(1 - (player.activeMs - whirlwindCastMs) / 2750, 0, 1) * 1.4
    : 0;
  const mastery = Math.min(14, Math.max(0, player.masteryRank - 1) * 2);
  let tethered = false;
  for (const npc of entitiesOfType<NpcEntity>(state, "npc")) {
    if (npc.kind === "void-sent-sentinel" && npc.hp > 0 && npc.zoneId === player.zoneId && Math.hypot(npc.x - player.x, npc.y - player.y) < 150) {
      tethered = true;
      break;
    }
  }
  const stealthSpeed = hasPlayerCombatFlag(player, "stealth") ? 0.3 * clamp(player.damageAmpMs / 3000, 0, 1) : 0;
  const zephyrSpeed = player.activeAbility === "staff-zephyr" ? 0.4 : 0;
  const phaseSpeed = player.activeAbility === "wand-phase-shift" ? 0.5 : 0;
  const apotheosisSpeed = hasPlayerCombatFlag(player, "apotheosis") && player.damageAmpMs > 0 ? 0.18 : 0;
  const swiftSpeed = hasTimedPlayerFlag(player, "swift") ? 0.3 : 0;
  const bloodlustSpeed = hasTimedPlayerFlag(player, "bloodlust") ? 0.4 : 0;
  const juggernautSpeed = hasTimedPlayerFlag(player, "juggernaut") ? 0.3 : 0;
  const statusHaste = timedPlayerHasteFactor(player);
  const factionSpeed = factionMovementHaste(player);
  const slowScale = (player.slowMs ?? 0) > 0 && !hasTimedPlayerFlag(player, "juggernaut") ? 0.5 : 1;
  const speed = (118 + Math.min(38, player.combatLevel * 2) + mastery + boots + mobility) * (1 + berserk + whirlwindChannel + stealthSpeed + zephyrSpeed + phaseSpeed + apotheosisSpeed + swiftSpeed + bloodlustSpeed + juggernautSpeed + statusHaste + factionSpeed) * (tethered ? 0.72 : 1) * slowScale;
  const gatheringLocked = Boolean(player.activeGatherNodeId);
  if (gatheringLocked) {
    player.momentumX = 0;
    player.momentumY = 0;
  }
  const moving = !gatheringLocked && Math.hypot(rawDx, rawDy) > 0.05;
  const dirX = moving ? rawDx / length : 0;
  const dirY = moving ? rawDy / length : 0;
  if (moving) updatePlayerMomentum(player, dirX, dirY, speed, dt);
  else if (!gatheringLocked) decayPlayerMomentum(player, dt);
  const dx = (dirX * speed + (player.momentumX ?? 0)) * dt;
  const dy = (dirY * speed + (player.momentumY ?? 0)) * dt;
  const ghostWalk = input.action === "space" && !spaceRushInput && spaceSlotReady && hasAbility(player, "space-ghost-walk");
  if (ghostWalk) {
    player.x = clamp(player.x + dx, PLAYER_RADIUS, mmoSkillDemoMap.pixelWidth - PLAYER_RADIUS);
    player.y = clamp(player.y + dy, PLAYER_RADIUS, mmoSkillDemoMap.pixelHeight - PLAYER_RADIUS);
  } else {
    moveMmoCircle(
      player,
      dx,
      dy,
      {
        rectBlocked: () => false,
        circleBlocked: (circle) => !canOccupy(kernel, circle.x, circle.y, circle.radius),
        blockedAt: (x, y, radius) => !canOccupy(kernel, x, y, radius)
      },
      { radius: PLAYER_RADIUS }
    );
  }
  if (player.hp <= 0) {
    const homeRoute = player.homeZoneId === "crags"
      ? TRAVEL_ROUTES.ironcrag
      : player.homeZoneId === "ashwood"
        ? TRAVEL_ROUTES.oakhaven
        : player.homeZoneId === "ashwood-wilderness"
          ? TRAVEL_ROUTES["ashwood-wilderness"]
          : player.homeZoneId === "holy-reach"
            ? TRAVEL_ROUTES["holy-reach"]
            : player.homeZoneId === "canaan-desert" || player.homeZoneId === "bazaar"
              ? TRAVEL_ROUTES["canaan-desert"]
              : player.homeZoneId === "void-rift"
                ? TRAVEL_ROUTES["void-rift"]
                : player.homeZoneId === "whisperwind-ascent"
                  ? TRAVEL_ROUTES["whisperwind-ascent"]
                  : undefined;
    if (player.homeZoneId === "cottage") teleportPlayer(player, 32, 18, "cottage");
    else if (homeRoute && (!homeRoute.requiresVoidReady || readyForVoidRoute(player))) teleportToRoute(player, homeRoute);
    else teleportToRoute(player, TRAVEL_ROUTES["port-marrow"]);
    player.hp = player.maxHp;
    player.mana = player.maxMana;
  }
  if (state.roomKind === "dungeon-instance") player.zoneId = "dungeon";
  else if (state.roomKind === "cottage-instance") player.zoneId = "cottage";
  else player.zoneId = zoneForPoint(player.x, player.y);
  state.players[player.id] = player;
}

function refreshQuestProgress(player: PlayerEntity) {
  const ashLogsTotal = itemQty(player, "ash-logs") + bankQty(player, "ash-logs");
  if (ashLogsTotal >= 5 && !hasQuestFlag(player, "first-cut")) addQuestBit(player, "first-cut-ready");
  if (hasQuestFlag(player, "first-cut") && ashLogsTotal >= 12 && !hasQuestFlag(player, "second-cut")) addQuestBit(player, "second-cut-ready");
  if (player.wolfKills >= 10 && !hasQuestFlag(player, "wolf-culling")) addQuestBit(player, "wolf-culling-ready");
  if (hasQuestFlag(player, "wolf-culling") && !hasQuestFlag(player, "final-cut")) addQuestBit(player, "final-cut-ready");
  if (itemQty(player, "iron-ore") >= 10) addQuestBit(player, "hidden-vein");
  if (bankQty(player, "iron-ore") >= 50 && !hasQuestFlag(player, "heavy-lifting")) addQuestBit(player, "heavy-lifting-ready");
  if (player.batKills >= 15 && !hasQuestFlag(player, "feathered-pests")) addQuestBit(player, "feathered-pests-ready");
  if (player.bazaarSurvivalMs >= 120000 && !hasQuestFlag(player, "silent-sands")) addQuestBit(player, "silent-sands-ready");
  ensureActiveMainQuest(player);
}

function nextStarterQuest(player: PlayerEntity) {
  if (!hasQuestFlag(player, "first-cut")) return "first-cut";
  if (!hasQuestFlag(player, "second-cut")) return "second-cut";
  if (!hasQuestFlag(player, "wolf-culling")) return "wolf-culling";
  if (!hasQuestFlag(player, "final-cut")) return "final-cut";
  return "";
}

function starterQuestSelectable(player: PlayerEntity, questId: string) {
  if (hasQuestFlag(player, questId)) return false;
  if (questId === "first-cut") return true;
  if (questId === "second-cut") return hasQuestFlag(player, "first-cut");
  if (questId === "wolf-culling") return hasQuestFlag(player, "second-cut");
  if (questId === "final-cut") return hasQuestFlag(player, "wolf-culling");
  if (questId === "heavy-lifting") return playerHasTool(player, "pickaxe") || hasQuestFlag(player, "fast-travel-registered") || hasQuestFlag(player, "heavy-lifting-accepted");
  if (questId === "silent-sands") return hasQuestFlag(player, "heavy-lifting") || hasQuestFlag(player, "heavy-lifting-ready") || hasQuestFlag(player, "silent-sands-accepted") || isBazaarPressureZone(player.zoneId);
  return false;
}

function mainQuestSelectable(player: PlayerEntity, questId: string) {
  if (!questId || hasQuestFlag(player, questId)) return false;
  if (starterQuestSelectable(player, questId)) return true;
  return hasQuestFlag(player, `${questId}-accepted`);
}

function acceptedMainQuest(player: PlayerEntity) {
  for (const flag of Object.keys(player.questFlags ?? {})) {
    if (!flag.endsWith("-accepted")) continue;
    const questId = flag.slice(0, -"accepted".length - 1);
    if (mainQuestSelectable(player, questId)) return questId;
  }
  return "";
}

function defaultMainQuest(player: PlayerEntity) {
  return nextStarterQuest(player) || acceptedMainQuest(player) || "";
}

function ensureActiveMainQuest(player: PlayerEntity) {
  if (mainQuestSelectable(player, player.activeQuestId)) return;
  player.activeQuestId = defaultMainQuest(player);
  if (player.activeQuestId && !hasQuestFlag(player, `${player.activeQuestId}-accepted`) && starterQuestSelectable(player, player.activeQuestId)) {
    addQuestBit(player, `${player.activeQuestId}-accepted`);
  }
}

function selectMainQuest(player: PlayerEntity, rawQuestId: string) {
  const questId = cleanInputText(rawQuestId, 64);
  if (!mainQuestSelectable(player, questId)) return false;
  if (starterQuestSelectable(player, questId) && !hasQuestFlag(player, `${questId}-accepted`)) acceptQuest(player, questId);
  player.activeQuestId = questId;
  return true;
}

function completeQuest(player: PlayerEntity, questId: string) {
  if (hasQuestFlag(player, questId) || !hasQuestFlag(player, `${questId}-ready`)) return false;
  acceptQuest(player, questId);
  addQuestBit(player, questId);
  switch (questId) {
    case "first-cut":
      grantItem(player, "iron-hatchet");
      unlockSlot(player, "RMB");
      unlockAbility(player, "rmb-reflect");
      unlockAbility(player, "rmb-crushing-blow");
      acceptQuest(player, "second-cut");
      if (player.activeQuestId === "first-cut") player.activeQuestId = "second-cut";
      break;
    case "second-cut":
      player.renown += 12;
      awardXp(player, "woodcutting", 34);
      syncRenownRewards(player);
      acceptQuest(player, "wolf-culling");
      if (player.activeQuestId === "second-cut") player.activeQuestId = "wolf-culling";
      break;
    case "wolf-culling":
      unlockSlot(player, "Space");
      unlockAbility(player, "space-jump");
      unlockAbility(player, "space-rush");
      acceptQuest(player, "final-cut");
      if (player.activeQuestId === "wolf-culling") player.activeQuestId = "final-cut";
      break;
    case "final-cut":
      grantItem(player, "captains-map");
      player.gold += 15;
      player.renown += 18;
      syncRenownRewards(player);
      acceptQuest(player, "lost-compass");
      if (player.activeQuestId === "final-cut") player.activeQuestId = "lost-compass";
      break;
    case "heavy-lifting":
      equipItem(player, "mining-boots");
      unlockAbility(player, "space-dash");
      break;
    case "feathered-pests":
      addItem(player, "speed-potion", 5);
      break;
    case "silent-sands":
      unlockSlot(player, "Q");
      unlockAbility(player, "q-stun");
      unlockAbility(player, "q-berserk");
      break;
  }
  player.berserkMs = Math.max(player.berserkMs, 900);
  ensureActiveMainQuest(player);
  return true;
}

type RuntimeWorldFactionQuestStep = (typeof worldFactionQuestlines)[number]["steps"][number];
type RuntimeWorldQuestObjective = RuntimeWorldFactionQuestStep["objectives"][number];
type RuntimeWorldQuestReward = RuntimeWorldFactionQuestStep["rewards"][number];

function npcKindFromQuestRef(npcId: string) {
  return npcId.split(".").pop() || npcId;
}

function questNpcMatches(npcId: string, npc: NpcEntity) {
  return npcKindFromQuestRef(npcId) === npc.kind;
}

function questZoneMatchesPlayer(zoneId: string, player: PlayerEntity) {
  if (zoneId === "ashwood-wilderness") return player.zoneId === "ashwood-wilderness" || player.zoneId === "ashwood";
  if (zoneId === "holy-reach") return player.zoneId === "holy-reach" || player.zoneId === "port-marrow";
  if (zoneId === "whisperwind-ascent") return player.zoneId === "whisperwind-ascent" || player.zoneId === "port-marrow";
  if (zoneId === "canaan-desert") return player.zoneId === "canaan-desert" || player.zoneId === "bazaar";
  if (zoneId === "void-rift") return player.zoneId === "void-rift" || player.zoneId === "bazaar";
  if (zoneId === "ashwood") return player.zoneId === "ashwood" || player.zoneId === "ashwood-wilderness";
  if (zoneId === "port-marrow") return player.zoneId === "port-marrow" || player.zoneId === "holy-reach" || player.zoneId === "whisperwind-ascent";
  if (zoneId === "bazaar") return isBazaarPressureZone(player.zoneId);
  return player.zoneId === zoneId;
}

function creatureProofCount(player: PlayerEntity, creatureId: string) {
  if (creatureId === "prowling-wolf" || creatureId === "ashwood-alpha") return player.wolfKills;
  if (creatureId === "iron-eye-bat" || creatureId === "calamity-bat") return player.batKills;
  const proof = EXPANDED_CREATURE_SIGNATURE_DROPS[creatureId]?.itemId;
  return proof ? itemQty(player, proof) + bankQty(player, proof) : 0;
}

function questObjectiveMet(player: PlayerEntity, npc: NpcEntity, objective: RuntimeWorldQuestObjective) {
  switch (objective.kind) {
    case "talk":
      return questNpcMatches(objective.npcId, npc);
    case "scout":
      return questZoneMatchesPlayer(objective.zoneId, player);
    case "gather":
    case "craft":
      return itemQty(player, objective.materialId) + bankQty(player, objective.materialId) >= objective.amount;
    case "deliver":
      return questNpcMatches(objective.recipientNpcId, npc) && itemQty(player, objective.materialId) + bankQty(player, objective.materialId) >= objective.amount;
    case "defeat":
      return creatureProofCount(player, objective.creatureId) >= objective.amount;
    case "survive":
      return questZoneMatchesPlayer(objective.zoneId, player) && (isBazaarPressureZone(player.zoneId) ? player.bazaarSurvivalMs >= objective.durationSeconds * 1000 : player.berserkMs > 0);
    case "attune":
      return !objective.materialId || itemQty(player, objective.materialId) + bankQty(player, objective.materialId) > 0;
  }
}

function applyWorldQuestReward(player: PlayerEntity, reward: RuntimeWorldQuestReward) {
  if (reward.kind === "reputation") {
    grantFactionRep(player, reward.factionId, reward.amount);
  } else if (reward.kind === "material") {
    grantLootItem(player, reward.materialId, reward.amount);
  } else if (!hasFactionReward(player, reward.rewardId)) {
    addQuestBit(player, factionRewardFlag(reward.rewardId));
    applyFactionRewardUnlock(player, reward.rewardId);
  }
}

function progressWorldFactionQuestline(player: PlayerEntity, npc: NpcEntity) {
  for (const questline of worldFactionQuestlines) {
    for (const step of questline.steps) {
      if (hasQuestFlag(player, step.id)) continue;
      const startsHere = questNpcMatches(questline.startsAtNpcId, npc);
      const resolvesHere = questNpcMatches(step.npcId, npc) || step.objectives.some((objective) => objective.kind === "talk" && questNpcMatches(objective.npcId, npc)) || step.objectives.some((objective) => objective.kind === "deliver" && questNpcMatches(objective.recipientNpcId, npc));
      if (!startsHere && !resolvesHere) continue;
      acceptQuest(player, step.id);
      if (!step.objectives.every((objective) => questObjectiveMet(player, npc, objective))) return true;
      addQuestBit(player, step.id);
      grantFactionRep(player, questline.factionId, step.pace === "capstone" ? 8 : 4);
      for (const reward of step.rewards) applyWorldQuestReward(player, reward);
      player.berserkMs = Math.max(player.berserkMs, 900);
      refreshQuestProgress(player);
      return true;
    }
  }
  return false;
}

function stableHash(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function expandedCreatureReward(kind: string) {
  const creature = WORLD_CREATURE_BY_ID.get(kind);
  if (!creature) return undefined;
  const zoneId = catalogZoneForLocation(creature.location);
  const zoneReward = EXPANDED_CREATURE_ZONE_REWARDS[zoneId];
  if (!zoneReward) return undefined;
  const profile = bestiaryFor(kind).combat;
  const signature = EXPANDED_CREATURE_SIGNATURE_DROPS[kind];
  const rep = profile.class === "elite" ? 7 : profile.class === "bruiser" ? 3 : profile.class === "nimble" ? 2 : 1;
  const drops = signature ? [signature, ...zoneReward.drops] : zoneReward.drops;
  return { factionId: zoneReward.factionId, rep, drops };
}

function materialRewardForNpc(kind: string) {
  return NPC_MATERIAL_REWARDS[kind] ?? expandedCreatureReward(kind);
}

function lootTableForNpc(kind: string): LootTableDef | undefined {
  const table = NPC_LOOT_TABLES[kind];
  if (table) return table;
  const expanded = expandedCreatureReward(kind);
  if (!expanded) return undefined;
  const profile = bestiaryFor(kind).combat;
  const gold = profile.class === "elite" ? 22 : profile.class === "bruiser" ? 9 : profile.class === "nimble" ? 7 : 5;
  return {
    base: [{ itemId: "gold", amount: gold }, ...expanded.drops.map((drop) => ({ ...drop, chance: drop.chance ?? 0.45 }))],
    bonus: profile.class === "elite" ? [{ itemId: expanded.drops[0]?.itemId ?? "renown", amount: 1 }] : undefined
  };
}

function lootRoll(state: MmoSkillDemoState, player: PlayerEntity, target: NpcEntity, drop: LootDropDef, index: number) {
  if (drop.chance === undefined || drop.chance >= 1) return true;
  const roll = stableHash(`${state.tick}:${player.id}:${target.id}:${drop.itemId}:${index}`) / 0xffffffff;
  return roll <= Math.max(0, drop.chance);
}

function grantNpcMaterialRewards(state: MmoSkillDemoState, player: PlayerEntity, target: NpcEntity) {
  const reward = materialRewardForNpc(target.kind);
  if (!reward) return;
  const rep = target.role === "boss" ? reward.rep : target.elite ? Math.max(reward.rep, 4) : reward.rep;
  grantFactionRep(player, reward.factionId, rep);
  reward.drops.forEach((drop, index) => {
    if (lootRoll(state, player, target, drop, 100 + index)) grantLootItem(player, drop.itemId, drop.amount);
  });
}

function grantGatherMaterial(state: MmoSkillDemoState, player: PlayerEntity, target: ResourceEntity, amount: number) {
  const pool = target.kind === "ore" ? ORE_GATHER_MATERIALS : TREE_GATHER_MATERIALS;
  const index = stableHash(`${state.tick}:${target.id}:${player.id}:gather`) % pool.length;
  grantLootItem(player, pool[index], amount);
  grantFactionRep(player, target.kind === "ore" ? "ironcrag" : "oakhaven", target.kind === "ore" ? amount : Math.max(1, Math.floor(amount)));
  if (target.kind === "tree" && pool[index] === "dry-bramble-branch") grantFactionRep(player, "ashwood-glade", 1);
}

function spawnLootDrops(state: MmoSkillDemoState, player: PlayerEntity, target: NpcEntity) {
  const table = lootTableForNpc(target.kind);
  if (!table) return;
  const drops = [...table.base, ...(target.elite || target.role === "boss" ? table.bonus ?? [] : [])];
  let placed = 0;
  drops.forEach((drop, index) => {
    if (!lootRoll(state, player, target, drop, index)) return;
    const angle = (index + 1) * 2.18 + stableHash(target.id) * 0.0001;
    const radius = 16 + (placed % 4) * 8;
    const id = `loot-${state.tick}-${entityTypeCount(state, "loot")}`.slice(0, 32);
    const loot = acquireLootEntity();
    loot.id = id;
    loot.itemId = drop.itemId;
    loot.amount = Math.max(1, Math.floor(drop.amount));
    loot.zoneId = target.zoneId;
    loot.x = clamp(target.x + Math.cos(angle) * radius, PLAYER_RADIUS, mmoSkillDemoMap.pixelWidth - PLAYER_RADIUS);
    loot.y = clamp(target.y + Math.sin(angle) * radius, PLAYER_RADIUS, mmoSkillDemoMap.pixelHeight - PLAYER_RADIUS);
    loot.ownerId = player.id;
    loot.expiresMs = target.role === "boss" ? 30000 : target.elite ? 22000 : 16000;
    loot.pickupRadius = target.role === "boss" ? 42 : 32;
    state.loots[id] = loot;
    placed += 1;
  });
  while (entityTypeCount(state, "loot") > 96) pruneEntityTypeToMax(state, "loot", 96);
}

function nearestLoot(player: PlayerEntity, state: MmoSkillDemoState, maxDistance = LOOT_INTERACTION_RADIUS) {
  return findNearest(
    player,
    entitiesOfType<LootEntity>(state, "loot"),
    (loot) => loot.zoneId === player.zoneId && (!loot.ownerId || loot.ownerId === player.id),
    maxDistance
  );
}

function canPickupLoot(player: PlayerEntity, loot: LootEntity) {
  if (loot.zoneId !== player.zoneId) return false;
  if (loot.ownerId && loot.ownerId !== player.id) return false;
  return Math.hypot(loot.x - player.x, loot.y - player.y) <= Math.max(loot.pickupRadius, LOOT_INTERACTION_RADIUS);
}

function pickupLoot(state: MmoSkillDemoState, player: PlayerEntity, loot: LootEntity) {
  if (!canPickupLoot(player, loot)) return false;
  grantLootItem(player, loot.itemId, loot.amount);
  player.targetId = loot.id;
  removeMmoEntityForReuse(state, loot.id);
  return true;
}

function handleNpcKill(state: MmoSkillDemoState, player: PlayerEntity, target: NpcEntity) {
  target.respawnMs = mmoSkillDemoNpcRespawnMs(target);
  addEnergy(player, target.role === "boss" ? 35 : target.elite ? 20 : 10);
  recordContractKill(player, target);
  contributeWorldEvent(state, player, target.role === "boss" ? 3 : target.elite ? 2 : 1);
  grantNpcMaterialRewards(state, player, target);
  spawnLootDrops(state, player, target);
  progressDailyQuest(player, { kind: "kill", amount: target.role === "boss" ? 3 : target.elite ? 2 : 1, creatureId: target.kind, role: target.role, elite: target.elite });
  if (hasFactionReward(player, "obsidian-sanctum-soul-siphon")) {
    for (const slot of ABILITY_SLOTS) player.cooldowns[slot] = u16Ms(Math.max(0, (player.cooldowns[slot] ?? 0) - (target.role === "boss" ? 2400 : target.elite ? 1400 : 800)));
    syncLegacyCooldown(player);
  }
  if (target.kind === "prowling-wolf") player.wolfKills += 1;
  if (target.kind === "iron-eye-bat") player.batKills += 1;
  if (target.kind === "iron-core-golem") {
    addQuestBit(player, "breaking-golem");
    unlockSlot(player, "E");
    unlockAbility(player, "e-ultimate");
    player.dungeonBossKills += 1;
  }
  if (target.kind === "mirror-king") {
    addQuestBit(player, "kings-foil");
    player.prestigeTitle = "King's Foil";
    player.dungeonBossKills += 1;
  }
  refreshQuestProgress(player);
  if (state.roomKind === "dungeon-instance" && target.role === "boss") addQuestBit(player, "dungeon-clear");
}

const TRAVEL_ROUTES: Record<string, { anchorId: string; zoneId: ZoneId; requiresVoidReady?: boolean }> = {
  oakhaven: { anchorId: "oakhaven", zoneId: "ashwood" },
  ashwood: { anchorId: "oakhaven", zoneId: "ashwood" },
  "ashwood-wilderness": { anchorId: "ashwood-glade", zoneId: "ashwood" },
  "ashwood-glade": { anchorId: "ashwood-glade", zoneId: "ashwood" },
  ironcrag: { anchorId: "ironcrag", zoneId: "crags" },
  crags: { anchorId: "ironcrag", zoneId: "crags" },
  aetheria: { anchorId: "aetheria", zoneId: "port-marrow" },
  "holy-reach": { anchorId: "aetheria", zoneId: "port-marrow" },
  "port-marrow": { anchorId: "port-marrow", zoneId: "port-marrow" },
  "free-cove": { anchorId: "port-marrow", zoneId: "port-marrow" },
  bazaar: { anchorId: "sunken-bazaar", zoneId: "bazaar" },
  "sunken-bazaar": { anchorId: "sunken-bazaar", zoneId: "bazaar" },
  "canaan-desert": { anchorId: "sunken-bazaar", zoneId: "bazaar" },
  "void-rift": { anchorId: "void-rift", zoneId: "bazaar", requiresVoidReady: true },
  "obsidian-sanctum": { anchorId: "obsidian-sanctum", zoneId: "bazaar", requiresVoidReady: true },
  "high-reach-peaks": { anchorId: "high-reach-peaks", zoneId: "port-marrow" },
  "whisperwind-ascent": { anchorId: "high-reach-peaks", zoneId: "port-marrow" }
};

function routeKey(routeChoice: string) {
  return routeChoice
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 32);
}

function readyForVoidRoute(player: PlayerEntity) {
  return hasInventoryItem(player, "void-resistant-cloak") || hasInventoryItem(player, "void-portal-key") || hasQuestFlag(player, "seal-the-rift") || player.masteryRank >= 4;
}

function teleportToRoute(player: PlayerEntity, route: { anchorId: string; zoneId: ZoneId; requiresVoidReady?: boolean }) {
  if (route.requiresVoidReady && !readyForVoidRoute(player)) return false;
  const anchor = getMmoSkillDemoAnchorTile(route.anchorId);
  teleportPlayer(player, anchor.x, anchor.y, route.zoneId);
  return true;
}

function defaultRouteForZone(player: PlayerEntity) {
  switch (player.zoneId) {
    case "ashwood":
      return "ironcrag";
    case "ashwood-wilderness":
      return "oakhaven";
    case "crags":
      return "holy-reach";
    case "holy-reach":
      return "port-marrow";
    case "port-marrow":
      return readyForVoidRoute(player) ? "void-rift" : "oakhaven";
    case "canaan-desert":
    case "bazaar":
      return "holy-reach";
    case "void-rift":
      return "canaan-desert";
    case "whisperwind-ascent":
      return "holy-reach";
    default:
      return "port-marrow";
  }
}

function travelWithCaptain(player: PlayerEntity, routeChoice = "") {
  const requested = routeKey(routeChoice);
  const route = requested ? TRAVEL_ROUTES[requested] : TRAVEL_ROUTES[defaultRouteForZone(player)];
  if (route && teleportToRoute(player, route)) return;
  const fallback = TRAVEL_ROUTES[defaultRouteForZone(player)] ?? TRAVEL_ROUTES["port-marrow"];
  teleportToRoute(player, fallback);
}

function interactWithNpc(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const target = input.targetId ? state.npcs[input.targetId] : nearestNpc(player, state, undefined, 78);
  if (!target || !isPeaceNpc(target) || !canReachNpc(player, target)) return false;
  player.targetId = target.id;
  progressWorldFactionQuestline(player, target);
  progressDailyQuest(player, { kind: "interact", amount: 1, npcKind: target.kind });
  switch (target.kind) {
    case "elder-rowan":
      if (!completeQuest(player, "first-cut") && !completeQuest(player, "second-cut") && !completeQuest(player, "wolf-culling") && !completeQuest(player, "final-cut")) {
        const nextQuest = nextStarterQuest(player);
        if (nextQuest) acceptQuest(player, nextQuest);
      }
      unlockAbility(player, "lmb-strike");
      break;
    case "miller-finn":
      acceptQuest(player, "wolf-pelt-quota");
      if (!hasQuestFlag(player, "wolf-pelt-quota") && player.wolfKills >= 10) {
        addQuestBit(player, "wolf-pelt-quota");
        equipItem(player, "leather-boots");
      }
      break;
    case "scout-elara":
      acceptQuest(player, "root-of-the-problem");
      if (!hasQuestFlag(player, "root-of-the-problem") && player.dungeonBossKills > 0) {
        addQuestBit(player, "root-of-the-problem");
        grantItem(player, "nature-core");
      }
      break;
    case "overseer-bale":
      acceptQuest(player, "great-starvation");
      if (!hasQuestFlag(player, "great-starvation") && bankQty(player, "ash-logs") >= 5) {
        addQuestBit(player, "great-starvation");
        grantItem(player, "pickaxe");
      }
      break;
    case "geologist-mira":
      acceptQuest(player, "luminous-depths");
      if (!hasQuestFlag(player, "luminous-depths") && (bankQty(player, "iron-ore") >= 5 || itemQty(player, "iron-ore") >= 5)) {
        addQuestBit(player, "luminous-depths");
        grantItem(player, "prism-shards");
      }
      break;
    case "runner-kael":
      if (!hasQuestFlag(player, "silent-signal")) {
        acceptQuest(player, "silent-signal");
        addQuestBit(player, "silent-signal");
        player.gold += 8;
      }
      if (input.devText) {
        travelWithCaptain(player, input.devText);
        break;
      }
      {
        const deepFissure = getMmoSkillDemoAnchorTile(player.zoneId === "ashwood-wilderness" ? "oakhaven" : "deep-fissure");
        startEscort(player, target, deepFissure.x, deepFissure.y, player.zoneId === "ashwood-wilderness" ? "ashwood" : "crags", 12000);
      }
      break;
    case "high-arcanist-vael":
      acceptQuest(player, hasQuestFlag(player, "forbidden-scripts") ? "seal-the-rift" : "forbidden-scripts");
      if (!hasQuestFlag(player, "forbidden-scripts") && hasInventoryItem(player, "ancient-scripts")) addQuestBit(player, "forbidden-scripts");
      if (!hasQuestFlag(player, "seal-the-rift") && hasInventoryItem(player, "nature-core") && hasInventoryItem(player, "prism-shards") && hasInventoryItem(player, "ancient-scripts")) {
        addQuestBit(player, "seal-the-rift");
        unlockAbility(player, "e-ultimate");
      }
      break;
    case "navigator-kai":
      if (!hasQuestFlag(player, "coastal-draught")) {
        acceptQuest(player, "coastal-draught");
        grantItem(player, "captains-map");
        addQuestBit(player, "coastal-draught");
      }
      if (input.devText) {
        travelWithCaptain(player, input.devText);
        break;
      }
      {
        const route = player.zoneId === "whisperwind-ascent" ? getMmoSkillDemoAnchorTile("aetheria") : getMmoSkillDemoAnchorTile("port-marrow");
        startEscort(player, target, route.x + 2, route.y + 1, player.zoneId === "whisperwind-ascent" ? "holy-reach" : "port-marrow", 7000);
      }
      break;
    case "alchemist-zora":
      acceptQuest(player, "void-resistance");
      if (craftRequestedOrFirst(player, ALCHEMIST_CRAFT_RECIPES, input.devText)) break;
      if (!hasQuestFlag(player, "void-resistance") && itemQty(player, "silk-thread") >= 3 && player.gold >= 20) {
        spendItem(player, "silk-thread", 3);
        player.gold -= 20;
        grantItem(player, "void-resistant-cloak");
        addQuestBit(player, "void-resistance");
        grantFactionRep(player, player.zoneId === "void-rift" ? "obsidian-sanctum" : "port-marrow", 4);
      }
      break;
    case "foreman-iron-will":
      if (!completeQuest(player, "heavy-lifting")) acceptQuest(player, "heavy-lifting");
      if (craftRequestedOrFirst(player, FOREMAN_CRAFT_RECIPES, input.devText)) break;
      if (!playerHasTool(player, "pickaxe") && player.gold >= 12) {
        player.gold -= 12;
        grantItem(player, "pickaxe");
        grantFactionRep(player, "ironcrag", 3);
      }
      break;
    case "banker-valerius":
      depositInventoryItem(player, "ash-logs");
      depositInventoryItem(player, "iron-ore");
      refreshQuestProgress(player);
      contributeWorldEvent(state, player, state.roomKind === "cottage-instance" ? 1 : 0);
      break;
    case "merchant-kaya":
    case "broker-rex":
    case "merchant-lynd":
    case "appraiser-chloe":
      if (craftRequestedOrFirst(player, MERCHANT_CRAFT_RECIPES, input.devText)) break;
      if (player.gold >= 10) {
        player.gold -= 10;
        addItem(player, "glade-berries", 2);
        addItem(player, "cinder-ale", 1);
        grantFactionRep(player, player.zoneId === "canaan-desert" ? "sunken-bazaar" : "port-marrow", 1);
      }
      break;
    case "apprentice-jinn":
      if (player.gold >= 6) {
        player.gold -= 6;
        addItem(player, "glade-berries", 3);
      }
      break;
    case "master-kael":
      completeQuest(player, "silent-sands");
      if (hasAbility(player, "q-stun") && player.gold >= 35) {
        player.gold -= 35;
        unlockAbility(player, "q-knockback");
      }
      break;
    case "inquisitor-joran":
    case "purifier-sarah":
      acceptQuest(player, "holy-purge");
      if (!hasQuestFlag(player, "holy-purge") && (factionReputation(player, "aetheria") >= 25 || hasInventoryItem(player, "ancient-script-scroll"))) {
        addQuestBit(player, "holy-purge");
        grantLootItem(player, "solos-emblem", 1);
        grantFactionRep(player, "aetheria", 6);
      }
      break;
    case "shaman-corvus":
    case "hunter-keera":
      acceptQuest(player, "outcast-hunt");
      if (!hasQuestFlag(player, "outcast-hunt") && (player.wolfKills >= 10 || factionReputation(player, "ashwood-glade") >= 20)) {
        addQuestBit(player, "outcast-hunt");
        grantLootItem(player, "feral-blood-vial", 1);
        grantFactionRep(player, "ashwood-glade", 6);
      }
      break;
    case "monastic-scholar-jin":
    case "guardian-tariq":
      acceptQuest(player, "wind-trial");
      if (!hasQuestFlag(player, "wind-trial") && (player.masteryRank >= 2 || factionReputation(player, "high-reach-peaks") >= 20)) {
        addQuestBit(player, "wind-trial");
        grantLootItem(player, "monastic-sage-tea", 1);
        grantFactionRep(player, "high-reach-peaks", 6);
        unlockAbility(player, "space-dash");
      }
      break;
    case "acolyte-lyros":
      acceptQuest(player, "rift-containment");
      if (!hasQuestFlag(player, "rift-containment") && (hasInventoryItem(player, "void-seed-shell") || factionReputation(player, "obsidian-sanctum") >= 20)) {
        addQuestBit(player, "rift-containment");
        grantLootItem(player, "void-portal-key", 1);
        grantFactionRep(player, "obsidian-sanctum", 7);
      }
      break;
    case "captain-marrow":
      travelWithCaptain(player, input.devText);
      if (!hasQuestFlag(player, "lost-compass")) {
        grantItem(player, "captains-map");
        addQuestBit(player, "lost-compass");
      }
      if (hasQuestFlag(player, "final-cut") && !hasQuestFlag(player, "fast-travel-registered")) {
        addQuestBit(player, "fast-travel-registered");
        acceptQuest(player, "heavy-lifting");
      }
      break;
    case "contract-board":
      if (!activeContract(player)) assignNextContract(player);
      else turnInContract(player);
      break;
    case "blacksmith-silas":
    case "blacksmith":
      if (craftRequestedOrFirst(player, BLACKSMITH_CRAFT_RECIPES, input.devText)) break;
      if (!hasGear(player, "iron-chest") && itemQty(player, "iron-ore") >= 8 && player.gold >= 25) {
        spendItem(player, "iron-ore", 8);
        player.gold -= 25;
        equipItem(player, "iron-chest");
        grantFactionRep(player, "ironcrag", 4);
      }
      if (!hasGear(player, "ring-focus") && itemQty(player, "silk-thread") >= 3 && player.gold >= 35) {
        spendItem(player, "silk-thread", 3);
        player.gold -= 35;
        equipItem(player, "ring-focus");
        grantFactionRep(player, "sunken-bazaar", 4);
      }
      break;
    case "cursed-statue":
      if (craftRequestedOrFirst(player, CURSED_STATUE_CRAFT_RECIPES, input.devText)) break;
      if (!hasInventoryItem(player, "cursed-idol") && player.hp > 40 && player.gold >= 15) {
        player.hp -= 20;
        player.gold -= 15;
        grantItem(player, "cursed-idol");
        unlockAbility(player, "space-ghost-walk");
        addQuestBit(player, "cursed-statue");
        grantFactionRep(player, "obsidian-sanctum", 5);
      }
      break;
    case "innkeeper-martha":
      player.homeZoneId = player.zoneId;
      contributeWorldEvent(state, player, state.roomKind === "cottage-instance" ? 1 : 0);
      break;
  }
  setCooldown(player, "interact");
  return true;
}

function gatherCooldownMsForLevel(level: number) {
  const cappedLevel = clamp(Math.floor(level || GATHER_MIN_LEVEL), GATHER_MIN_LEVEL, GATHER_MAX_LEVEL);
  const progress = (cappedLevel - GATHER_MIN_LEVEL) / (GATHER_MAX_LEVEL - GATHER_MIN_LEVEL);
  return Math.round(GATHER_BASE_COOLDOWN_MS - (GATHER_BASE_COOLDOWN_MS - GATHER_FASTEST_COOLDOWN_MS) * progress);
}

function readableGatheringToken(value: string) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readableGatheringTools(tools: readonly string[] = []) {
  const toolSet = new Set(tools);
  if (toolSet.has("training-hatchet") && toolSet.has("iron-hatchet")) return "Hatchet";
  return tools.map(readableGatheringToken).join(" / ") || "Tool";
}

function gatheringStartFailureText(reason: string, details: { missingTools?: readonly string[] } = {}) {
  switch (reason) {
    case "level-too-low":
      return "Too low level";
    case "missing-tool":
      return `Need ${readableGatheringTools(details.missingTools)}`;
    case "depleted":
      return "Depleted";
    case "wrong-zone":
      return "Wrong zone";
    case "out-of-range":
      return "Too far";
    case "unknown-material":
      return "Unknown material";
    case "unknown-skill":
      return "Unknown skill";
    case "wrong-node":
      return "Wrong node";
    case "missing-node":
      return "No node";
    default:
      return "Cannot gather";
  }
}

function gatheringAbortFailureText(reason: string) {
  switch (reason) {
    case "missing-node":
      return "Node gone";
    case "depleted":
      return "Depleted";
    case "wrong-zone":
      return "Wrong zone";
    case "moved":
      return "Moved";
    case "damaged":
      return "Interrupted";
    case "out-of-range":
      return "Too far";
    default:
      return "Gather stopped";
  }
}

function spawnGatheringFailureText(state: MmoSkillDemoState, target: { zoneId: string; x: number; y: number }, text: string) {
  spawnTransientEffect(
    state.effects,
    {
      id: `gather-fail-${state.tick}-${state.effects.length}`.slice(0, 32),
      kind: "aoe",
      zoneId: target.zoneId,
      x: target.x,
      y: target.y - 24,
      toX: target.x,
      toY: target.y - 24,
      radius: HAZARD_SIZE.combatTextRadius,
      lifetimeMs: 720,
      effectKind: "damage",
      text,
      pulse: 1,
      priority: 74
    },
    256
  );
}

function setGatheringFailureCooldown(player: PlayerEntity, cooldownAction: keyof typeof ACTION_COOLDOWN_MS) {
  setCooldown(player, cooldownAction);
  player.cooldowns[cooldownAction] = u16Ms(Math.min(500, ACTION_COOLDOWN_MS[cooldownAction]));
  syncLegacyCooldown(player);
}

function gatherResource(
  state: MmoSkillDemoState,
  kernel: CollisionKernel,
  player: PlayerEntity,
  action: GatheringAction,
  targetId: string,
  cooldownAction: keyof typeof ACTION_COOLDOWN_MS = action === "interact" ? "interact" : action
) {
  const wantedKind = action === "mine" ? "ore" : action === "woodcut" ? "tree" : undefined;
  const fallbackSkill = gatheringSkillForLegacyAction(action);
  const target = targetId
    ? state.resources[targetId]
    : findNearest(
      player,
      entitiesOfType<ResourceEntity>(state, "resource"),
      (node) => !node.depleted && (!wantedKind || node.kind === wantedKind),
      58
    );
  if (!target) {
    clearActiveGathering(player);
    if (targetId || action !== "interact") {
      spawnGatheringFailureText(state, player, gatheringStartFailureText("missing-node"));
      setGatheringFailureCooldown(player, cooldownAction);
    }
    return false;
  }
  if (wantedKind && target.kind !== wantedKind) {
    clearActiveGathering(player);
    player.targetId = target.id;
    spawnGatheringFailureText(state, target, gatheringStartFailureText("wrong-node"));
    setGatheringFailureCooldown(player, cooldownAction);
    return false;
  }
  if (target.depleted) {
    clearActiveGathering(player);
    player.targetId = target.id;
    spawnGatheringFailureText(state, target, gatheringStartFailureText("depleted"));
    setGatheringFailureCooldown(player, cooldownAction);
    return false;
  }
  if (target.zoneId !== player.zoneId) {
    clearActiveGathering(player);
    player.targetId = target.id;
    spawnGatheringFailureText(state, target, gatheringStartFailureText("wrong-zone"));
    setGatheringFailureCooldown(player, cooldownAction);
    return false;
  }
  const targetRect = rectAround(target, 30, 30);
  if (!kernel.testCircleRectOverlap(player.x, player.y, 80, targetRect.x, targetRect.y, targetRect.w, targetRect.h)) {
    clearActiveGathering(player);
    player.targetId = target.id;
    spawnGatheringFailureText(state, target, gatheringStartFailureText("out-of-range"));
    setGatheringFailureCooldown(player, cooldownAction);
    return false;
  }

  const material = materialForGatheringNode(target, fallbackSkill);
  const started = startGatheringInteraction(player, target, { action, material });
  if (!started.ok) {
    player.targetId = target.id;
    spawnGatheringFailureText(state, target, gatheringStartFailureText(started.reason, { missingTools: started.missingTools }));
    setGatheringFailureCooldown(player, cooldownAction);
    return false;
  }
  player.momentumX = 0;
  player.momentumY = 0;
  player.action = target.kind === "ore" ? "mine" : "woodcut";
  player.targetId = target.id;
  setCooldown(player, cooldownAction);
  const level = player.gatheringLevels?.[started.skillId] ?? 1;
  player.cooldowns[cooldownAction] = u16Ms(Math.min(500, gatherCooldownMsForLevel(level)));
  syncLegacyCooldown(player);
  return true;
}

function itemIdForGatherableMaterial(material: Pick<GatherableMaterial, "name">) {
  return cleanItemId(material.name);
}

function factionForGatheringSkill(skillId: GatheringSkillId, fallback: WorldFactionId = "port-marrow"): WorldFactionId {
  switch (skillId) {
    case "lumberjacking":
    case "foraging":
    case "sap-tapping":
      return "oakhaven";
    case "mining":
    case "quarrying":
    case "gemology":
      return "ironcrag";
    case "fishing":
    case "scavenging":
    case "dredging":
      return "port-marrow";
    case "essence-siphoning":
    case "spore-hunting":
      return "obsidian-sanctum";
    case "apiculture":
    case "crop-harvesting":
    case "archaeology":
      return "aetheria";
    case "skinning":
    case "hunting":
      return "ashwood-glade";
    default:
      return fallback;
  }
}

function completeGatheringResource(state: MmoSkillDemoState, player: PlayerEntity, target: ResourceEntity, material: GatherableMaterial, skillId: GatheringSkillId) {
  const level = player.gatheringLevels?.[skillId] ?? 1;
  const yieldAmount = 1 + Math.floor(level / 25);
  target.hp = 0;
  target.depleted = true;
  target.respawnMs = u32Ms(9000 + material.tier * 2200);
  if (target.kind === "ore") addItem(player, "iron-ore", yieldAmount);
  else if (target.kind === "tree") addItem(player, "ash-logs", yieldAmount);
  addItem(player, itemIdForGatherableMaterial(material), yieldAmount);
  grantGatherMaterial(state, player, target, yieldAmount);
  grantFactionRep(player, factionForGatheringSkill(skillId), Math.max(1, material.tier));
  contributeWorldEvent(state, player, Math.max(1, material.tier));
  refreshQuestProgress(player);
  progressDailyQuest(player, { kind: "gather", amount: yieldAmount, resourceKind: target.kind });

  const hazard = resolveGatheringHazard(material, { player, node: target, tick: state.tick });
  if (hazard.triggered) {
    spawnGatheringHazard(state, hazard);
    for (const cue of hazard.soundCues) {
      spawnTransientEffect(
        state.effects,
        {
          id: `gather-cue-${state.tick}-${cue.id}`.slice(0, 32),
          kind: "aoe",
          zoneId: player.zoneId,
          x: cue.x,
          y: cue.y,
          toX: cue.x,
          toY: cue.y,
          radius: u16Ms(cue.radius),
          lifetimeMs: 1400,
          effectKind: cue.id.slice(0, 16),
          text: hazard.message.slice(0, 64),
          pulse: 1,
          priority: cue.priority
        },
        256
      );
    }
  }
}

function updateGatheringInteractions(state: MmoSkillDemoState, dt: number) {
  for (const player of entitiesOfType<PlayerEntity>(state, "player")) {
    ensureGatheringProgress(player);
    const node = player.activeGatherNodeId ? state.resources[player.activeGatherNodeId] : undefined;
    const result = tickActiveGathering(player, node, dt);
    if (result.status === "aborted") spawnGatheringFailureText(state, node ?? player, gatheringAbortFailureText(result.reason));
    if (result.status === "complete" && node) completeGatheringResource(state, player, node, result.material, result.skillId);
  }
}

function startPlayerCombatAbility(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput) {
  ensurePlayerCombatLoadout(player);
  const slot = combatSlotForAction(input.action);
  if (!slot) return false;
  const def = abilityDefForSlot(player, slot);
  if (!def) return false;
  if (player.activeAbility && player.activeSlot === slot) return true;
  if (!isSlotReady(player, slot)) return false;
  if (player.activeAbility) {
    if (!canInterruptActiveAbility(player, slot)) return false;
    interruptActiveAbility(player);
  }
  player.action = SLOT_ACTIONS[slot];
  player.targetId = input.targetId.slice(0, 32);
  if (slot === "Space") progressDailyQuest(player, { kind: "space", amount: 1 });
  switch (def.id) {
    case "mace-pummel":
      beginActiveAbility(player, slot, def.id, input, PUMMEL_MAX_CHARGE_MS);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "mace-crushing-leap":
      beginActiveAbility(player, slot, def.id, input, 600);
      {
        const aim = aimPoint(player, input);
        const distance = Math.hypot(aim.x - player.x, aim.y - player.y);
        player.activeDurationMs = u16Ms(Math.max(90, (100 + Math.max(80, Math.min(500, (distance / 330) * 1000))) * animationDurationScale(player)));
      }
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      player.iframeMs = Math.max(player.iframeMs, 500);
      setSlotCooldown(player, slot, def.cooldownMs);
      return true;
    case "space-rush":
      beginActiveAbility(player, slot, def.id, input, RUSH_DURATION_MS);
      activeMarkHitMs(player, "windup", "rush", abilityCastMs(player, def.castMs));
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "q-berserk":
      beginActiveAbility(player, slot, def.id, input, 750);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      player.guardMs = 750;
      setSlotCooldown(player, slot, def.cooldownMs);
      return true;
    case "mace-rock-smash":
      beginActiveAbility(player, slot, def.id, input, 1000);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "mace-whirlwind":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + 2750);
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "bow-quick-shot":
    case "bow-precision":
    case "bow-volley":
    case "bow-bolas":
    case "bow-decoy":
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs));
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "bow-reposition":
      beginBowReposition(player, slot, def, input);
      return true;
    case "bow-vault":
      beginBowVault(player, slot, def, input);
      return true;
    case "bow-stealth":
      applyBowStealth(player, slot, def, input);
      return true;
    case "bow-caltrops":
      beginActiveAbility(player, slot, def.id, input, 1000);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "bow-flurry":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + 5000);
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      setPlayerFlagStacks(player, "flurry", 0);
      return true;
    case "bow-arrowstorm":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs));
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "staff-arcane-bolt":
    case "staff-meteor":
    case "staff-healing-pulse":
    case "staff-frost-chain":
    case "staff-astral-walk":
    case "staff-ice-wall":
    case "staff-petrify":
    case "staff-gravity-well":
    case "staff-consecration":
    case "staff-dispel-nova":
    case "wand-magic-missile":
    case "wand-hex":
    case "wand-mending-spark":
    case "wand-focused-ray":
    case "wand-soul-bind":
    case "wand-flash-heal":
    case "wand-blink":
    case "wand-rewind":
    case "wand-nightmare":
    case "wand-rupture":
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs));
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "staff-siphon-beam":
      beginActiveAbility(player, slot, def.id, input, 65000);
      return true;
    case "staff-zephyr":
      beginActiveAbility(player, slot, def.id, input, 3000);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      addEnergy(player, def.energyGain);
      setSlotCooldown(player, slot, def.cooldownMs);
      return true;
    case "staff-arcane-bubble":
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + 3000);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      addEnergy(player, def.energyGain);
      setSlotCooldown(player, slot, def.cooldownMs);
      return true;
    case "wand-phase-shift":
      beginActiveAbility(player, slot, def.id, input, 1500);
      player.iframeMs = Math.max(player.iframeMs, 1500);
      addEnergy(player, def.energyGain);
      setSlotCooldown(player, slot, def.cooldownMs);
      return true;
    case "wand-mirror-shield":
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + 2000);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      addEnergy(player, def.energyGain);
      setSlotCooldown(player, slot, def.cooldownMs);
      return true;
    case "wand-enfeeble":
      beginActiveAbility(player, slot, def.id, input, 1000);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "staff-maelstrom":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + 4000);
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "staff-tranquility":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + 4500);
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "wand-chaos-volley":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + 3000);
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      setPlayerFlagStacks(player, "chaos", 0);
      return true;
    case "wand-apotheosis":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs));
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "twin-strike":
    case "twin-toxic-slash":
    case "twin-throwing-dirk":
    case "twin-shadow-lunge":
    case "twin-exsanguinate":
    case "twin-fan-of-knives":
    case "twin-smoke-bomb":
    case "twin-vanish":
    case "twin-noxious-flask":
    case "twin-deaths-mark":
    case "blade-cleave":
    case "blade-sever":
    case "blade-sunder":
    case "blade-brutal-strike":
    case "blade-thrust":
    case "blade-bloodthirst":
    case "blade-intimidating-shout":
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs));
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "twin-swift-step":
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + 200);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      addEnergy(player, def.energyGain);
      setSlotCooldown(player, slot, def.cooldownMs);
      return true;
    case "twin-bloodlust":
      applyBloodlust(state, player, slot, def, input);
      return true;
    case "twin-blur":
      applyBlur(player, slot, def, input);
      return true;
    case "twin-blade-dance":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + 2500);
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      setPlayerFlagStacks(player, "blade", 0);
      return true;
    case "twin-assassinate":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs));
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "blade-combat-roll":
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + MOVEMENT_DASHES["blade-combat-roll"].durationMs);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      player.iframeMs = Math.max(player.iframeMs, abilityCastMs(player, def.castMs) + MOVEMENT_DASHES["blade-combat-roll"].durationMs);
      addEnergy(player, def.energyGain);
      setSlotCooldown(player, slot, def.cooldownMs);
      return true;
    case "blade-leap-attack":
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + MOVEMENT_DASHES["blade-leap-attack"].durationMs);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      addEnergy(player, def.energyGain);
      setSlotCooldown(player, slot, def.cooldownMs);
      return true;
    case "blade-juggernaut":
      applyJuggernaut(state, player, slot, def, input);
      return true;
    case "blade-riposte":
      beginActiveAbility(player, slot, def.id, input, 1000);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      player.guardMs = 1000;
      setSlotCooldown(player, slot, def.cooldownMs);
      return true;
    case "blade-iron-will":
      applyIronWill(state, player, slot, def, input);
      return true;
    case "blade-razor-wind":
      beginActiveAbility(player, slot, def.id, input, 1000);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      return true;
    case "blade-omnislash":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      beginActiveAbility(player, slot, def.id, input, abilityCastMs(player, def.castMs) + 2500);
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      player.castMs = Math.max(player.castMs, abilityCastMs(player, def.castMs));
      setPlayerFlagStacks(player, "omni", 0);
      return true;
    case "blade-duelists-trance":
      if (player.energy < (player.maxEnergy || MAX_ENERGY)) return false;
      player.energy = Math.max(0, player.energy - MAX_ENERGY);
      applyDuelistsTrance(state, player, slot, def, input);
      return true;
    default:
      return false;
  }
}

function applyPlayerAction(state: MmoSkillDemoState, kernel: CollisionKernel, player: PlayerEntity, input: RuntimeInput) {
  ensurePlayerCombatLoadout(player);
  player.action = input.action;
  const nextTargetId = input.targetId.slice(0, 32);
  if (nextTargetId || !combatSlotForAction(input.action)) player.targetId = nextTargetId;
  if (input.action === "idle") {
    if (player.activeSlot && SLOT_ACTIONS[player.activeSlot as AbilitySlot]) player.action = SLOT_ACTIONS[player.activeSlot as AbilitySlot];
    return;
  }

  if (input.action === "dev") {
    if (devCheatsEnabled()) applyDevCheat(player, input);
    return;
  }

  if (input.action === "use-item") {
    if (utilityCooldownReady(player, "use-item") && useConsumable(player, input.itemId)) setCooldown(player, "use-item");
    return;
  }

  if (input.action === "config") {
    if (input.devField === "dailyChoice") chooseDailyQuestBranch(player, input.devText);
    else if (input.devField === "proving") applyProvingCommand(player, input.devText);
    else if (input.devField === "mainQuest") selectMainQuest(player, input.devText);
    else if (input.devField === "weapon") configureWeapon(player, input.devText);
    else configureAbilitySlot(player, input.devField, input.devText);
    return;
  }

  if ((input.action === "interact" || input.action === "travel" || input.action === "bank" || input.action === "trade") && utilityCooldownReady(player, input.action)) {
    if (input.action === "travel") {
      const captain = nearestNpc(player, state, "travel", 84);
      if (captain) {
        player.targetId = captain.id;
        if (captain.kind === "runner-kael") {
          if (input.devText) travelWithCaptain(player, input.devText);
          else {
            const deepFissure = getMmoSkillDemoAnchorTile(player.zoneId === "ashwood-wilderness" ? "oakhaven" : "deep-fissure");
            startEscort(player, captain, deepFissure.x, deepFissure.y, player.zoneId === "ashwood-wilderness" ? "ashwood" : "crags", 12000);
          }
        } else if (captain.kind === "navigator-kai") {
          if (input.devText) travelWithCaptain(player, input.devText);
          else {
            const route = player.zoneId === "whisperwind-ascent" ? getMmoSkillDemoAnchorTile("aetheria") : getMmoSkillDemoAnchorTile("port-marrow");
            startEscort(player, captain, route.x + 2, route.y + 1, player.zoneId === "whisperwind-ascent" ? "holy-reach" : "port-marrow", 7000);
          }
        } else {
          travelWithCaptain(player, input.devText);
        }
        setCooldown(player, "travel");
      }
      return;
    }
    if (input.action === "bank") {
      const banker = nearestNpc(player, state, "bank", 84);
      if (banker) {
        player.targetId = banker.id;
        depositInventoryItem(player, "ash-logs");
        depositInventoryItem(player, "iron-ore");
        refreshQuestProgress(player);
        setCooldown(player, "bank");
      }
      return;
    }
    if (input.action === "trade") {
      const merchant = marketNpcForInput(state, player, input);
      if (merchant) {
        player.targetId = merchant.id;
        if (input.devField === "market") {
          applyMarketTransaction(player, merchant, input.devText, input.itemId);
          setCooldown(player, "trade");
          return;
        }
        const crafted = merchant.kind === "alchemist-zora"
          ? craftRequestedOrFirst(player, ALCHEMIST_CRAFT_RECIPES, input.devText)
          : merchant.kind === "merchant-kaya" || merchant.kind === "broker-rex" || merchant.kind === "merchant-lynd" || merchant.kind === "appraiser-chloe"
            ? craftRequestedOrFirst(player, MERCHANT_CRAFT_RECIPES, input.devText)
            : false;
        if (!crafted && merchant.role === "merchant" && player.gold >= 8) {
          player.gold -= 8;
          addItem(player, "speed-potion", 1);
          addItem(player, "cinder-ale", 1);
          grantFactionRep(player, merchant.zoneId === "canaan-desert" ? "sunken-bazaar" : "port-marrow", 1);
        }
        setCooldown(player, "trade");
      }
      return;
    }
    const loot = input.targetId ? state.loots[input.targetId] : nearestLoot(player, state);
    if (loot && pickupLoot(state, player, loot)) {
      setCooldown(player, "interact");
      return;
    }
    if (interactWithNpc(state, player, input)) return;
    const node = input.targetId ? state.resources[input.targetId] : findNearest(player, entitiesOfType<ResourceEntity>(state, "resource"), (resource) => !resource.depleted, 58);
    if (node) {
      gatherResource(state, kernel, player, node.kind === "ore" ? "mine" : node.kind === "tree" ? "woodcut" : "interact", node.id, "interact");
      return;
    }
  }

  const canBreakControl = input.action === "q" && abilityDefForSlot(player, "Q")?.id === "blade-iron-will" && isSlotReady(player, "Q");
  if (player.stunMs > 0 && !canBreakControl) {
    player.action = "idle";
    return;
  }

  const combatAction = input.action === "attack" || input.action === "lmb" || input.action === "rmb" || input.action === "space" || input.action === "q" || input.action === "e" || input.action === "r";
  if (combatAction) {
    const started = startPlayerCombatAbility(state, kernel, player, input.action === "attack" ? { ...input, action: "lmb" } : input);
    if (!started && !player.activeAbility) player.action = "idle";
    return;
  }

  if (input.action === "mine" || input.action === "woodcut") gatherResource(state, kernel, player, input.action, input.targetId);
}

function damagePlayer(
  player: PlayerEntity,
  amount: number,
  options: { source?: { id?: string; kind?: string; x: number; y: number; hp?: number; combatFlags?: string; slowMs?: number; stunMs?: number; attackCooldownMs?: number; effectKind?: string }; knockbackModifier?: number; isHeavyImpact?: boolean; armorPierce?: boolean } = {}
) {
  ensurePlayerCombatLoadout(player);
  if (player.iframeMs > 0) return;
  const sourceMask = mmoStatusBitmask(options.source?.combatFlags, PLAYER_DAMAGE_SOURCE_MASK);
  if (hasMmoStatusBit(sourceMask, PLAYER_DAMAGE_SOURCE_BITS.BLIND) && stableHash(`${player.id}:${options.source?.id ?? ""}:${Math.floor(player.activeMs + player.cooldownMs)}`) % 2 === 0) return;
  if (player.activeAbility === "twin-blade-dance" && stableHash(`${player.id}:dance:${Math.floor(player.activeMs / 100)}`) % 5 < 3) return;
  if (player.activeAbility === "wand-mirror-shield") {
    if (options.source && typeof options.source.hp === "number") options.source.hp = Math.max(0, options.source.hp - 18);
    player.iframeMs = Math.max(player.iframeMs, 180);
    player.castMs = Math.max(player.castMs, 120);
    clearActiveAbility(player);
    return;
  }
  if (player.activeAbility === "blade-riposte" && player.guardMs > 0) {
    const def = PLAYER_ABILITY_DEFS["blade-riposte"];
    player.guardMs = 0;
    player.iframeMs = Math.max(player.iframeMs, 180);
    player.castMs = Math.max(player.castMs, 100);
    if (options.source && typeof options.source.hp === "number") {
      options.source.hp = Math.max(0, options.source.hp - 22);
      if (typeof options.source.stunMs === "number") options.source.stunMs = Math.max(options.source.stunMs, 1200);
      if (typeof options.source.attackCooldownMs === "number") options.source.attackCooldownMs = extendU16Ms(options.source.attackCooldownMs, 600);
    }
    healPlayer(player, Math.max(1, Math.floor(player.maxHp * 0.1)));
    player.cooldowns.Q = u16Ms(Math.max(0, (player.cooldowns.Q ?? 0) - Math.floor(def.cooldownMs * 0.5)));
    addEnergy(player, def.energyGain);
    clearActiveAbility(player);
    return;
  }
  if (player.guardMs > 0) {
    player.guardMs = 0;
    player.iframeMs = Math.max(player.iframeMs, 120);
    player.castMs = Math.max(player.castMs, 100);
    player.hp = Math.min(player.maxHp, player.hp + Math.max(1, Math.floor(player.maxHp * 0.1)));
    addEnergy(player, PLAYER_ABILITY_DEFS["q-berserk"].energyGain);
    player.berserkMs = 3000;
    clearActiveAbility(player);
    return;
  }
  const sourceWeakened = hasMmoStatusBit(sourceMask, PLAYER_DAMAGE_SOURCE_BITS.WEAKENED) || hasMmoStatusBit(sourceMask, PLAYER_DAMAGE_SOURCE_BITS.ENFEEBLED) && (options.source?.slowMs ?? 0) > 0;
  const voidSource = options.source?.effectKind === "void" || options.source?.kind?.includes("void") || options.source?.id?.includes("void");
  const radiantReduced = voidSource && hasFactionReward(player, "aetheria-radiant-ward") ? amount * 0.85 : amount;
  const sourceReduced = sourceWeakened ? radiantReduced * 0.7 : radiantReduced;
  const bubbleReduced = player.activeAbility === "staff-arcane-bubble" ? sourceReduced * 0.75 : sourceReduced;
  const gearReduced = !options.armorPierce && hasGear(player, "iron-chest") ? bubbleReduced * 0.72 : bubbleReduced;
  const whirlwindReduced = player.activeAbility === "mace-whirlwind" ? gearReduced * 0.75 : gearReduced;
  const ironWillReduced = hasTimedPlayerFlag(player, "ironwill") ? whirlwindReduced * 0.7 : whirlwindReduced;
  const berserkReduced = ironWillReduced * (1 - 0.5 * berserkFactor(player));
  const reduced = Math.max(1, Math.floor(berserkReduced));
  player.hp = Math.max(0, player.hp - reduced);
  if (player.hp > 0 && player.hp <= player.maxHp * 0.25 && hasFactionReward(player, "ashwood-glade-feral-rage")) player.berserkMs = Math.max(player.berserkMs, 1500);
  if (options.source && options.knockbackModifier) applyKnockback(player, options.source, options.knockbackModifier, reduced, options.isHeavyImpact);
}

function addSummonedNpc(state: MmoSkillDemoState, owner: NpcEntity, index: number, kind = "prowling-wolf") {
  const id = `${owner.id}-${kind === "prowling-wolf" ? "w" : "s"}${index}`;
  if (state.npcs[id]) return;
  const bestiary = bestiaryFor(kind);
  const elite = roleForKind(kind) === "elite";
  const hp = scaledNpcHp(kind, kind === "alpha-timberwolf" ? 78 : 18, elite);
  const npc = acquireNpcEntity();
  npc.id = id;
  npc.kind = kind;
  npc.role = roleForKind(kind);
  npc.zoneId = owner.zoneId;
  npc.elite = elite;
  npc.personality = bestiary.personality;
  npc.impactType = bestiary.combat.impactType;
  npc.knockbackModifier = bestiary.combat.knockbackModifier;
  npc.x = owner.x + (index === 1 ? -34 : 34);
  npc.y = owner.y + 20;
  npc.spawnX = owner.x;
  npc.spawnY = owner.y;
  npc.hp = hp;
  npc.maxHp = hp;
  npc.respawnMs = 0;
  npc.attackCooldownMs = 700;
  npc.projectileCooldownMs = 1200;
  npc.phaseMs = 0;
  npc.summonedBy = owner.id;
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
  state.npcs[id] = npc;
}

function spawnHazard(
  state: MmoSkillDemoState,
  owner: NpcEntity,
  target: PlayerEntity,
  kind: HazardEntity["kind"],
  damage: number,
  options: Partial<Pick<HazardEntity, "knockbackModifier" | "isHeavyImpact" | "armorPierce" | "effectKind" | "windupMs" | "lifetimeMs" | "radius">> = {}
) {
  const id = `${kind}-${state.tick}-${entityTypeCount(state, "hazard")}`.slice(0, 32);
  const dx = target.x - owner.x;
  const dy = target.y - owner.y;
  const length = Math.hypot(dx, dy) || 1;
  const range = owner.role === "boss" ? 190 : 150;
  const x = kind === "aoe" ? target.x : owner.x;
  const y = kind === "aoe" ? target.y : owner.y;
  const toX = kind === "aoe" ? target.x : owner.x + (dx / length) * range;
  const toY = kind === "aoe" ? target.y : owner.y + (dy / length) * range;
  const hazard = acquireHazardEntity();
  hazard.id = id;
  hazard.kind = kind;
  hazard.zoneId = owner.zoneId;
  hazard.ownerId = owner.id;
  hazard.x = x;
  hazard.y = y;
  hazard.toX = toX;
  hazard.toY = toY;
  hazard.radius = options.radius ?? (kind === "aoe" ? (owner.role === "boss" ? HAZARD_SIZE.bossAoeRadius : HAZARD_SIZE.aoeRadius) : HAZARD_SIZE.lineWidth);
  hazard.windupMs = u16Ms(options.windupMs ?? (kind === "aoe" ? 850 : 520));
  hazard.lifetimeMs = u16Ms(options.lifetimeMs ?? (kind === "aoe" ? 620 : 360));
  hazard.damage = u16Ms(damage);
  hazard.knockbackModifier = options.knockbackModifier ?? bestiaryFor(owner.kind).combat.knockbackModifier;
  hazard.isHeavyImpact = options.isHeavyImpact ?? Boolean(bestiaryFor(owner.kind).combat.heavyImpact);
  hazard.armorPierce = options.armorPierce ?? false;
  hazard.effectKind = options.effectKind ?? (kind === "line" ? "dust" : bestiaryFor(owner.kind).combat.impactType);
  hazard.text = "";
  hazard.pulse = 0;
  state.hazards[id] = hazard;
  pruneEntityTypeToMax(state, "hazard", 96);
}

function playerHazardInterval(effectKind: string) {
  if (effectKind === "arrowstorm") return 300;
  if (effectKind === "caltrops" || effectKind === "gravity" || effectKind === "consecrate" || effectKind === "meteor-burn" || effectKind === "noxious" || effectKind === "smoke") return 500;
  if (effectKind === "maelstrom") return 400;
  if (effectKind === "meteor") return 1000;
  return 400;
}

function playerWallBlocksHazard(state: MmoSkillDemoState, hazard: HazardEntity) {
  for (const wall of entitiesOfType<HazardEntity>(state, "hazard")) {
    if (wall.id === hazard.id || wall.effectKind !== "icewall" || !state.players[wall.ownerId] || wall.windupMs > 0) continue;
    if (wall.zoneId !== hazard.zoneId) continue;
    const startDistance = pointSegmentDistance(hazard.x, hazard.y, wall.x, wall.y, wall.toX, wall.toY);
    const endDistance = hazard.kind === "line" ? pointSegmentDistance(hazard.toX, hazard.toY, wall.x, wall.y, wall.toX, wall.toY) : startDistance;
    if (Math.min(startDistance, endDistance) <= wall.radius + Math.max(12, hazard.radius)) return true;
  }
  return false;
}

function updateHazards(state: MmoSkillDemoState, kernel: CollisionKernel, dt: number) {
  for (const hazard of snapshotEntitiesOfType(state, "hazard", updateHazardScratch)) {
    if (state.entities[hazard.id] !== hazard) continue;
    const ownerPlayer = state.players[hazard.ownerId];
    const previousWindup = hazard.windupMs;
    const ms = Math.max(0, Math.floor(dt * 1000));
    hazard.windupMs = u16Ms(hazard.windupMs - ms);
    if (ownerPlayer) {
      if (playerProjectileDefFor(hazard.effectKind)) {
        if (previousWindup <= 0) advancePlayerProjectile(state, kernel, ownerPlayer, hazard, dt);
        continue;
      }
      if (hazard.windupMs <= 0 && hazard.effectKind === "icewall") {
        for (const target of hostileNpcs(state, ownerPlayer)) {
          if (pointSegmentDistance(target.x, target.y, hazard.x, hazard.y, hazard.toX, hazard.toY) > hazard.radius + bodyRadius(target)) continue;
          target.slowMs = Math.max(target.slowMs ?? 0, 350);
          applyKnockback(target, { x: (hazard.x + hazard.toX) * 0.5, y: (hazard.y + hazard.toY) * 0.5 }, 0.22, 2, false);
        }
      }
      if (hazard.windupMs <= 0 && hazard.effectKind === "smoke") {
        hazard.pulse = u16Ms((hazard.pulse || 0) - ms);
        if (hazard.pulse <= 0) {
          hazard.pulse = playerHazardInterval(hazard.effectKind);
          for (const target of hostileNpcs(state, ownerPlayer)) {
            if (Math.hypot(target.x - hazard.x, target.y - hazard.y) > hazard.radius + bodyRadius(target)) continue;
            addTimedNpcFlag(target, "blind", 700);
          }
        }
      }
      if (hazard.windupMs <= 0 && hazard.damage > 0) {
        hazard.pulse = u16Ms((hazard.pulse || 0) - ms);
        if (hazard.pulse <= 0) {
          const interval = playerHazardInterval(hazard.effectKind);
          hazard.pulse = interval;
          for (const target of entitiesOfType<NpcEntity>(state, "npc")) {
            if (target.hp <= 0 || target.zoneId !== hazard.zoneId || isPeaceNpc(target) || target.kind === "player-decoy") continue;
            const distance =
              hazard.kind === "line"
                ? pointSegmentDistance(target.x, target.y, hazard.x, hazard.y, hazard.toX, hazard.toY)
                : Math.hypot(target.x - hazard.x, target.y - hazard.y);
            if (distance > hazard.radius + bodyRadius(target)) continue;
            if (hazard.effectKind === "gravity") moveNpcToward(kernel, target, { ...ownerPlayer, x: hazard.x, y: hazard.y }, 150, dt, true);
            damageNpc(state, kernel, ownerPlayer, target, hazard.damage, { knockbackModifier: hazard.knockbackModifier, isHeavyImpact: hazard.isHeavyImpact, ultimate: true });
            if (hazard.effectKind === "caltrops") target.slowMs = Math.max(target.slowMs ?? 0, 1000);
            if (hazard.effectKind === "arrowstorm") target.slowMs = Math.max(target.slowMs ?? 0, 650);
            if (hazard.effectKind === "gravity") target.slowMs = Math.max(target.slowMs ?? 0, 450);
            if (hazard.effectKind === "noxious") applyNpcPoison(target, 1, 4000);
          }
          if (hazard.effectKind === "consecrate") healPlayersNear(state, ownerPlayer, hazard.x, hazard.y, hazard.radius, 6);
        }
      }
      if (hazard.windupMs <= 0) hazard.lifetimeMs = u16Ms(hazard.lifetimeMs - ms);
      if (hazard.lifetimeMs <= 0) removeMmoEntityForReuse(state, hazard.id);
      continue;
    }
    if (playerWallBlocksHazard(state, hazard)) {
      removeMmoEntityForReuse(state, hazard.id);
      continue;
    }
    if (previousWindup > 0 && hazard.windupMs === 0 && hazard.pulse === 0) {
      for (const player of entitiesOfType<PlayerEntity>(state, "player")) {
        if (player.hp <= 0 || player.zoneId !== hazard.zoneId) continue;
        const distance =
          hazard.kind === "line"
            ? pointSegmentDistance(player.x, player.y, hazard.x, hazard.y, hazard.toX, hazard.toY)
            : Math.hypot(player.x - hazard.x, player.y - hazard.y);
        if (distance <= hazard.radius + 12) {
          damagePlayer(player, hazard.damage, {
            source: knockbackSourceForHazard(hazard, state.npcs[hazard.ownerId]),
            knockbackModifier: hazard.knockbackModifier,
            isHeavyImpact: hazard.isHeavyImpact,
            armorPierce: hazard.armorPierce
          });
        }
      }
      hazard.pulse = 1;
    }
    if (hazard.windupMs <= 0) hazard.lifetimeMs = u16Ms(hazard.lifetimeMs - ms);
  if (hazard.lifetimeMs <= 0) removeMmoEntityForReuse(state, hazard.id);
  }
}

const PASSIVE_NPC_PATROLS: Record<string, { radiusX: number; radiusY: number; speed: number; phase: number }> = {
  "elder-rowan": { radiusX: 18, radiusY: 10, speed: 18, phase: 0.1 },
  "blacksmith-silas": { radiusX: 12, radiusY: 16, speed: 16, phase: 1.6 },
  "miller-finn": { radiusX: 24, radiusY: 8, speed: 22, phase: 2.1 },
  "scout-elara": { radiusX: 28, radiusY: 18, speed: 28, phase: 0.8 },
  "overseer-bale": { radiusX: 20, radiusY: 14, speed: 18, phase: 3.4 },
  "geologist-mira": { radiusX: 16, radiusY: 22, speed: 17, phase: 4.2 },
  "runner-kael": { radiusX: 30, radiusY: 12, speed: 31, phase: 0.4 },
  "high-arcanist-vael": { radiusX: 26, radiusY: 18, speed: 15, phase: 2.8 },
  "navigator-kai": { radiusX: 22, radiusY: 16, speed: 21, phase: 5.1 },
  "alchemist-zora": { radiusX: 14, radiusY: 18, speed: 15, phase: 1.2 },
  "foreman-iron-will": { radiusX: 18, radiusY: 10, speed: 17, phase: 3.1 },
  "banker-valerius": { radiusX: 12, radiusY: 10, speed: 14, phase: 4.8 },
  "merchant-kaya": { radiusX: 34, radiusY: 16, speed: 24, phase: 2.4 },
  "master-kael": { radiusX: 18, radiusY: 18, speed: 18, phase: 0.6 },
  "captain-marrow": { radiusX: 20, radiusY: 12, speed: 19, phase: 5.6 },
  blacksmith: { radiusX: 10, radiusY: 14, speed: 13, phase: 1.9 },
  "apprentice-jinn": { radiusX: 20, radiusY: 14, speed: 20, phase: 2.9 },
  "innkeeper-martha": { radiusX: 14, radiusY: 12, speed: 13, phase: 4.4 }
};

function updatePassiveNpc(state: MmoSkillDemoState, kernel: CollisionKernel, npc: NpcEntity, dt: number) {
  if (npc.kind === "contract-board" || npc.kind === "cursed-statue") return;
  for (const player of entitiesOfType<PlayerEntity>(state, "player")) {
    if (player.escortNpcId === npc.id) return;
  }
  const patrol = PASSIVE_NPC_PATROLS[npc.kind];
  if (!patrol) return;
  const t = (npc.phaseMs / npcPhaseLength(npc)) * Math.PI * 2 + patrol.phase;
  const targetX = npc.spawnX + Math.cos(t) * patrol.radiusX;
  const targetY = npc.spawnY + Math.sin(t * 0.72) * patrol.radiusY;
  const dx = targetX - npc.x;
  const dy = targetY - npc.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return;
  const step = Math.min(distance, patrol.speed * dt);
  const nextX = npc.x + (dx / distance) * step;
  const nextY = npc.y + (dy / distance) * step;
  if (canOccupy(kernel, nextX, npc.y, 10)) npc.x = nextX;
  if (canOccupy(kernel, npc.x, nextY, 10)) npc.y = nextY;
}

function moveNpcBy(kernel: CollisionKernel, npc: NpcEntity, dx: number, dy: number, ignoreTerrain = false) {
  const nextX = npc.x + dx;
  const nextY = npc.y + dy;
  if (ignoreTerrain || canOccupy(kernel, nextX, npc.y, bodyRadius(npc))) npc.x = clamp(nextX, bodyRadius(npc), mmoSkillDemoMap.pixelWidth - bodyRadius(npc));
  if (ignoreTerrain || canOccupy(kernel, npc.x, nextY, bodyRadius(npc))) npc.y = clamp(nextY, bodyRadius(npc), mmoSkillDemoMap.pixelHeight - bodyRadius(npc));
}

function npcSpeedScale(npc: NpcEntity) {
  return (npc.slowMs ?? 0) > 0 ? 0.8 : 1;
}

function moveNpcToward(kernel: CollisionKernel, npc: NpcEntity, target: PlayerEntity, speed: number, dt: number, ignoreTerrain = false) {
  const move = kernel.vecNormalize(target.x - npc.x, target.y - npc.y);
  const scaled = speed * npcSpeedScale(npc);
  moveNpcBy(kernel, npc, move.x * scaled * dt, move.y * scaled * dt, ignoreTerrain);
}

function moveNpcAway(kernel: CollisionKernel, npc: NpcEntity, target: PlayerEntity, speed: number, dt: number, ignoreTerrain = false) {
  const move = kernel.vecNormalize(npc.x - target.x, npc.y - target.y);
  const beforeX = npc.x;
  const beforeY = npc.y;
  const scaled = speed * npcSpeedScale(npc);
  moveNpcBy(kernel, npc, move.x * scaled * dt, move.y * scaled * dt, ignoreTerrain);
  return Math.hypot(npc.x - beforeX, npc.y - beforeY) > 0.2;
}

function circleNpcAround(kernel: CollisionKernel, npc: NpcEntity, target: PlayerEntity, speed: number, dt: number) {
  const dx = target.x - npc.x;
  const dy = target.y - npc.y;
  const distance = Math.hypot(dx, dy) || 1;
  const toward = distance > 98 ? 0.35 : distance < 72 ? -0.35 : 0;
  const strafeSign = stableHash(npc.id) % 2 === 0 ? 1 : -1;
  const vx = (-dy / distance) * strafeSign + (dx / distance) * toward;
  const vy = (dx / distance) * strafeSign + (dy / distance) * toward;
  const length = Math.hypot(vx, vy) || 1;
  const scaled = speed * npcSpeedScale(npc);
  moveNpcBy(kernel, npc, (vx / length) * scaled * dt, (vy / length) * scaled * dt);
}

function npcProfile(npc: NpcEntity) {
  return bestiaryFor(npc.kind).combat;
}

function npcPersonality(npc: NpcEntity) {
  return bestiaryFor(npc.kind).personality;
}

function heavyKbm(npc: NpcEntity) {
  return npcProfile(npc).heavyKnockbackModifier ?? npcProfile(npc).knockbackModifier;
}

function npcMeleeReach(npc: NpcEntity) {
  const profile = npcProfile(npc);
  if (npc.role === "boss") return 58;
  if (npc.elite || npc.role === "elite") return 50;
  if (profile.class === "bruiser") return 48;
  if (profile.class === "nimble") return 44;
  return 42;
}

function npcMeleeDamage(npc: NpcEntity, buffed: boolean) {
  const profile = npcProfile(npc);
  const base =
    npc.role === "boss"
      ? 12
      : npc.elite || npc.role === "elite" || profile.class === "elite"
        ? 9
        : profile.class === "bruiser"
          ? 7
          : profile.class === "nimble"
            ? 5
            : 4;
  return base + (buffed ? 3 : 0);
}

function npcCastDurationMs(npc: NpcEntity, requestedMs?: number, heavy = false) {
  const profile = npcProfile(npc);
  const classBonus = profile.class === "boss" ? 520 : profile.class === "elite" ? 300 : profile.class === "bruiser" ? 220 : profile.class === "nimble" ? 80 : 0;
  const weightBonus = heavy || profile.heavyImpact || npc.elite || npc.role === "boss" ? 180 : 0;
  return clamp(Math.floor(requestedMs ?? profile.precastMs ?? 240) + classBonus + weightBonus, 200, 1400);
}

function leapNpcTowardTarget(kernel: CollisionKernel, npc: NpcEntity, target: PlayerEntity, maxDistance: number, stopDistance: number, ignoreTerrain = false) {
  const distance = Math.hypot(target.x - npc.x, target.y - npc.y);
  if (distance <= stopDistance) return distance;
  const move = kernel.vecNormalize(target.x - npc.x, target.y - npc.y);
  const travel = Math.min(maxDistance, Math.max(0, distance - stopDistance));
  moveNpcBy(kernel, npc, move.x * travel, move.y * travel, ignoreTerrain);
  return Math.hypot(target.x - npc.x, target.y - npc.y);
}

function spawnNpcDirectHitMarker(
  state: MmoSkillDemoState,
  npc: NpcEntity,
  target: PlayerEntity,
  damage: number,
  castMs = npcCastDurationMs(npc),
  options: Partial<Pick<HazardEntity, "knockbackModifier" | "isHeavyImpact" | "armorPierce" | "effectKind">> = {}
) {
  spawnHazard(state, npc, target, "aoe", damage, {
    knockbackModifier: options.knockbackModifier ?? heavyKbm(npc),
    isHeavyImpact: options.isHeavyImpact ?? (npc.elite || npc.role === "boss" || Boolean(npcProfile(npc).heavyImpact)),
    armorPierce: options.armorPierce ?? false,
    effectKind: options.effectKind ?? npcProfile(npc).impactType,
    radius: npc.role === "boss" ? 46 : npc.elite ? 34 : 26,
    windupMs: castMs,
    lifetimeMs: castMs + 360
  });
}

function npcDirectHit(state: MmoSkillDemoState, npc: NpcEntity, target: PlayerEntity, damage: number, options: { castMs?: number; cooldownMs?: number; knockbackModifier?: number; isHeavyImpact?: boolean; armorPierce?: boolean; effectKind?: string } = {}) {
  const castMs = npcCastDurationMs(npc, options.castMs, options.isHeavyImpact);
  const isHeavyImpact = options.isHeavyImpact ?? (npc.elite || npc.role === "boss" || Boolean(npcProfile(npc).heavyImpact));
  beginNpcCast(npc, castMs);
  spawnNpcDirectHitMarker(state, npc, target, damage, castMs, { knockbackModifier: options.knockbackModifier ?? npcProfile(npc).knockbackModifier, isHeavyImpact, armorPierce: options.armorPierce, effectKind: options.effectKind });
  if (options.cooldownMs !== undefined) npc.attackCooldownMs = options.cooldownMs;
}

function npcMeleeHit(state: MmoSkillDemoState, npc: NpcEntity, target: PlayerEntity, buffed: boolean, cooldownMs: number, damage = npcMeleeDamage(npc, buffed)) {
  npcDirectHit(state, npc, target, damage, { castMs: npcProfile(npc).precastMs, cooldownMs, knockbackModifier: heavyKbm(npc), isHeavyImpact: npc.elite || npc.role === "boss" || Boolean(npcProfile(npc).heavyImpact) });
}

function spawnNpcLungeTell(state: MmoSkillDemoState, npc: NpcEntity, target: PlayerEntity, damage: number, effectKind = npcProfile(npc).impactType) {
  const castMs = npcCastDurationMs(npc, Math.max(240, npcProfile(npc).precastMs ?? 180), true);
  beginNpcCast(npc, castMs);
  spawnHazard(state, npc, target, "line", damage, { knockbackModifier: heavyKbm(npc), isHeavyImpact: npc.elite || npc.role === "boss" || Boolean(npcProfile(npc).heavyImpact), effectKind, windupMs: castMs });
}

function beginNpcCast(npc: NpcEntity, ms?: number) {
  npc.castMs = Math.max(npc.castMs || 0, npcCastDurationMs(npc, ms));
}

function applySentinelAura(state: MmoSkillDemoState, sentinel: NpcEntity) {
  for (const player of entitiesOfType<PlayerEntity>(state, "player")) {
    if (player.hp <= 0 || player.zoneId !== sentinel.zoneId) continue;
    const distance = Math.hypot(player.x - sentinel.x, player.y - sentinel.y);
    if (distance > 170 || distance < 1) continue;
    applyKnockback(player, sentinel, -0.18, 3, false);
  }
}

function spawnRadialHazards(state: MmoSkillDemoState, owner: NpcEntity, count: number, damage: number, radius = 150, options: Partial<Pick<HazardEntity, "knockbackModifier" | "isHeavyImpact" | "armorPierce" | "effectKind">> = {}) {
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count;
    const target = {
      id: `radial-${i}`,
      entityType: "player" as const,
      name: "",
      x: owner.x + Math.cos(angle) * radius,
      y: owner.y + Math.sin(angle) * radius,
      hp: 1,
      maxHp: 1,
      mana: 0,
      maxMana: 0,
      energy: 0,
      maxEnergy: MAX_ENERGY,
      combatXp: 0,
      combatLevel: 1,
      miningXp: 0,
      miningLevel: 1,
      woodcuttingXp: 0,
      woodcuttingLevel: 1,
      zoneId: owner.zoneId,
      gold: 0,
      renown: 0,
      masteryRank: 1,
      contractId: "",
      contractKills: 0,
      contractStreak: 0,
      contractCooldownMs: 0,
      inventory: {},
      bank: {},
      equipment: {},
      abilitySlots: {},
      cooldowns: {},
      questFlags: {},
      activeQuestId: "",
      dailyQuestDate: "",
      dailyQuestStep: 0,
      dailyQuestProgress: 0,
      dailyQuestCompleted: false,
      dailyQuestResult: "",
      wolfKills: 0,
      batKills: 0,
      bazaarSurvivalMs: 0,
      dungeonBossKills: 0,
      homeZoneId: owner.zoneId,
      escortNpcId: "",
      escortTargetX: 0,
      escortTargetY: 0,
      escortTargetZoneId: owner.zoneId,
      escortMs: 0,
      instanceId: "",
      prestigeTitle: "",
      action: "idle" as const,
      targetId: "",
      aimX: owner.x,
      aimY: owner.y,
      guardMs: 0,
      berserkMs: 0,
      cooldownMs: 0,
      equippedWeaponId: MACE_WEAPON_ID,
      activeAbility: "",
      activeSlot: "",
      activeMs: 0,
      activeDurationMs: 0,
      chargeMs: 0,
      rushDistance: 0,
      abilityVectorX: 1,
      abilityVectorY: 0,
      abilityTickMs: 0,
      abilityHits: "",
      knockbackX: 0,
      knockbackY: 0,
      knockbackMs: 0,
      knockbackHeavy: false,
      stunMs: 0,
      slowMs: 0,
      iframeMs: 0,
      castMs: 0,
      damageAmpMs: 0,
      combatFlags: "",
      lastAttackStyle: "",
      visibleCount: 0
    };
    spawnHazard(state, owner, target, "line", damage, options);
  }
}

function addBossNode(state: MmoSkillDemoState, owner: NpcEntity, kind: "spore-pod" | "power-node" | "glass-clone", index: number, x: number, y: number, hp: number, combatState = "") {
  const id = `${owner.id}-${kind}-${index}`.slice(0, 32);
  if (state.npcs[id]) return state.npcs[id];
  const bestiary = bestiaryFor(kind);
  const node = acquireNpcEntity();
  node.id = id;
  node.kind = kind;
  node.role = roleForKind(kind);
  node.zoneId = owner.zoneId;
  node.elite = false;
  node.personality = bestiary.personality;
  node.impactType = bestiary.combat.impactType;
  node.knockbackModifier = bestiary.combat.knockbackModifier;
  node.x = x;
  node.y = y;
  node.spawnX = x;
  node.spawnY = y;
  node.hp = hp;
  node.maxHp = hp;
  node.respawnMs = 0;
  node.attackCooldownMs = 0;
  node.projectileCooldownMs = 0;
  node.phaseMs = 0;
  node.summonedBy = owner.id;
  node.knockbackX = 0;
  node.knockbackY = 0;
  node.knockbackMs = 0;
  node.knockbackHeavy = false;
  node.stunMs = 0;
  node.slowMs = 0;
  node.iframeMs = 0;
  node.castMs = 0;
  node.damageAmpMs = 0;
  node.combatState = combatState;
  node.combatFlags = "";
  node.lastAttackStyle = "";
  state.npcs[id] = node;
  return node;
}

function bossNodes(state: MmoSkillDemoState, owner: NpcEntity, kind: string) {
  return Array.from(entitiesOfType<NpcEntity>(state, "npc")).filter((npc) => npc.summonedBy === owner.id && npc.kind === kind && npc.hp > 0);
}

function spawnAshLordPods(state: MmoSkillDemoState, boss: NpcEntity) {
  const offsets = [
    [-112, -82],
    [112, -82],
    [-112, 82],
    [112, 82]
  ];
  offsets.forEach(([dx, dy], index) => addBossNode(state, boss, "spore-pod", index + 1, clamp(boss.x + dx, 32, mmoSkillDemoMap.pixelWidth - 32), clamp(boss.y + dy, 32, mmoSkillDemoMap.pixelHeight - 32), 36));
}

function spawnMirrorClones(state: MmoSkillDemoState, boss: NpcEntity) {
  const realIndex = (stableHash(boss.id) % 4) + 1;
  const offsets = [
    [-96, -64],
    [96, -64],
    [-96, 64],
    [96, 64]
  ];
  offsets.forEach(([dx, dy], index) => addBossNode(state, boss, "glass-clone", index + 1, clamp(boss.x + dx, 32, mmoSkillDemoMap.pixelWidth - 32), clamp(boss.y + dy, 32, mmoSkillDemoMap.pixelHeight - 32), 28, index + 1 === realIndex ? "real" : "fake"));
}

function updateBossMinigames(state: MmoSkillDemoState, npc: NpcEntity, dt: number) {
  if (npc.kind === "great-ash-lord") {
    const ratio = npc.hp / Math.max(1, npc.maxHp);
    const threshold = ratio <= 0.33 ? "ash33" : ratio <= 0.66 ? "ash66" : "";
    if (threshold && !hasCombatFlag(npc, threshold)) {
      addCombatFlag(npc, threshold);
      npc.combatState = "spore-shield";
      npc.iframeMs = 15000;
      npc.castMs = 900;
      spawnAshLordPods(state, npc);
    }
    const pods = bossNodes(state, npc, "spore-pod");
    if (npc.combatState === "spore-shield" && pods.length === 0) {
      npc.iframeMs = 0;
      npc.combatState = "";
      npc.stunMs = Math.max(npc.stunMs, 1200);
    } else if (npc.combatState === "spore-shield") {
      npc.iframeMs = Math.max(npc.iframeMs, 120);
      if (npc.projectileCooldownMs <= 0) {
        const target = Array.from(entitiesOfType<PlayerEntity>(state, "player")).find((player) => player.hp > 0 && player.zoneId === npc.zoneId);
        if (target) spawnHazard(state, npc, target, "aoe", 12, { knockbackModifier: 1.2, isHeavyImpact: true, effectKind: "spore" });
        npc.projectileCooldownMs = 900;
      }
      if (npc.iframeMs <= 140) {
        for (const [index, pod] of pods.entries()) {
          pod.hp = 0;
          addSummonedNpc(state, npc, index + 1, "alpha-timberwolf");
        }
        npc.combatState = "";
      }
    }
  } else if (npc.kind === "iron-core-golem") {
    const nodes = powerNodesForGolem(state, npc);
    if (nodes.length < 3) {
      addBossNode(state, npc, "power-node", 3, npc.x - 78, npc.y + 86, 42, "lit");
    }
    const activeNodes = activePowerNodesForGolem(state, npc);
    if (activeNodes.length > 0) {
      npc.combatState = "overdrive";
      npc.iframeMs = Math.max(npc.iframeMs, 120);
      const engagedTarget = Array.from(entitiesOfType<PlayerEntity>(state, "player")).find((player) => player.hp > 0 && player.zoneId === npc.zoneId && Math.hypot(player.x - npc.x, player.y - npc.y) <= GOLEM_OVERDRIVE_PLAYER_RADIUS);
      if (engagedTarget && npc.projectileCooldownMs <= 0) {
        spawnRadialHazards(state, npc, GOLEM_OVERDRIVE_RADIAL_COUNT, 8, 168, { knockbackModifier: 0.8, effectKind: "spark" });
        npc.projectileCooldownMs = GOLEM_OVERDRIVE_COOLDOWN_MS;
      }
      for (const node of activeNodes) {
        let standing = false;
        for (const player of entitiesOfType<PlayerEntity>(state, "player")) {
          if (player.hp > 0 && player.zoneId === node.zoneId && Math.hypot(player.x - node.x, player.y - node.y) < 24) {
            standing = true;
            break;
          }
        }
        if (standing) node.hp = Math.max(0, node.hp - dt * 14);
      }
    } else if (npc.combatState === "overdrive") {
      npc.combatState = "overloaded";
      npc.iframeMs = 0;
      npc.stunMs = Math.max(npc.stunMs, 8000);
      npc.damageAmpMs = Math.max(npc.damageAmpMs, 8000);
      npc.projectileCooldownMs = 2500;
    } else if (npc.damageAmpMs <= 0 && npc.combatState === "overloaded") {
      npc.combatState = "";
    }
  } else if (npc.kind === "mirror-king") {
    const ratio = npc.hp / Math.max(1, npc.maxHp);
    if (ratio <= 0.5 && !hasCombatFlag(npc, "mirror50")) {
      addCombatFlag(npc, "mirror50");
      npc.combatState = "gravity-well";
      npc.iframeMs = 15000;
      npc.castMs = 900;
      spawnMirrorClones(state, npc);
    }
    const clones = bossNodes(state, npc, "glass-clone");
    if (npc.combatState === "gravity-well" && clones.length > 0) {
      npc.iframeMs = Math.max(npc.iframeMs, 120);
      for (const player of entitiesOfType<PlayerEntity>(state, "player")) {
        if (player.hp <= 0 || player.zoneId !== npc.zoneId) continue;
        applyKnockback(player, npc, -0.32, 6, false);
        if (Math.hypot(player.x - npc.x, player.y - npc.y) < 26) damagePlayer(player, player.maxHp, { armorPierce: true });
      }
    } else if (npc.combatState === "gravity-well") {
      npc.iframeMs = 0;
      npc.combatState = "";
      npc.stunMs = Math.max(npc.stunMs, 1800);
    }
  }
}

function nearestPlayerForNpc(state: MmoSkillDemoState, runtime: ZoneRuntime, npc: NpcEntity, radius: number) {
  const focusedAggroId = combatFlagValue(npc, "aggro");
  if (focusedAggroId) {
    const focused = state.players[focusedAggroId];
    if (focused && focused.hp > 0 && focused.zoneId === npc.zoneId && Math.hypot(focused.x - npc.x, focused.y - npc.y) <= radius) return focused;
  }
  const candidates = runtime.logicHash.queryNearby({ x: npc.x, y: npc.y, radius }, runtime.logicScratch);
  let best: PlayerEntity | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  let sawPlayerCandidate = false;
  for (const candidate of candidates) {
    if (candidate.type !== "player") continue;
    sawPlayerCandidate = true;
    const player = state.players[candidate.id];
    if (!player || player.hp <= 0 || player.zoneId !== npc.zoneId) continue;
    if (hasPlayerCombatFlag(player, "stealth") && player.damageAmpMs > 0) continue;
    if (shouldNpcIgnorePlayerForFaction(npc, player)) continue;
    const distance = Math.hypot(player.x - npc.x, player.y - npc.y);
    if (distance <= radius && distance < bestDistance) {
      best = player;
      bestDistance = distance;
    }
  }
  if (best || sawPlayerCandidate) return best;
  return findNearest(
    npc as NpcEntity & { id: string },
    entitiesOfType<PlayerEntity>(state, "player"),
    (player) => player.hp > 0 && player.zoneId === npc.zoneId && (!hasPlayerCombatFlag(player, "stealth") || player.damageAmpMs <= 0) && !shouldNpcIgnorePlayerForFaction(npc, player),
    radius
  );
}

function spawnGatheringThreatMinion(state: MmoSkillDemoState, anchor: NpcEntity) {
  const summonKind = combatFlagValue(anchor, "summon");
  const focusedAggroId = combatFlagValue(anchor, "aggro") || anchor.summonedBy;
  if (!summonKind || !focusedAggroId) return;
  const activeSummons = Array.from(entitiesOfType<NpcEntity>(state, "npc")).filter((npc) => npc.summonedBy === anchor.id && npc.hp > 0).length;
  if (activeSummons >= 4) return;
  const id = `${anchor.id}-${summonKind}-${state.tick}-${activeSummons}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 32);
  if (state.npcs[id]) return;
  const bestiary = bestiaryFor(summonKind);
  const angle = state.tick * 0.77 + activeSummons * ((Math.PI * 2) / 4);
  const npc = acquireNpcEntity();
  npc.id = id;
  npc.kind = summonKind;
  npc.role = roleForKind(summonKind);
  npc.zoneId = anchor.zoneId;
  npc.elite = false;
  npc.personality = bestiary.personality;
  npc.impactType = bestiary.combat.impactType;
  npc.knockbackModifier = bestiary.combat.knockbackModifier;
  npc.x = anchor.x + Math.cos(angle) * 42;
  npc.y = anchor.y + Math.sin(angle) * 42;
  npc.spawnX = npc.x;
  npc.spawnY = npc.y;
  npc.hp = scaledNpcHp(summonKind, Math.max(18, Math.floor(anchor.maxHp * 0.18)), false);
  npc.maxHp = npc.hp;
  npc.respawnMs = 0;
  npc.attackCooldownMs = 120;
  npc.projectileCooldownMs = 400;
  npc.phaseMs = 0;
  npc.summonedBy = anchor.id;
  npc.knockbackX = 0;
  npc.knockbackY = 0;
  npc.knockbackMs = 0;
  npc.knockbackHeavy = false;
  npc.stunMs = 0;
  npc.slowMs = 0;
  npc.iframeMs = 0;
  npc.castMs = 0;
  npc.damageAmpMs = 0;
  npc.combatState = "gather-threat-minion";
  npc.combatFlags = `gather-hazard|aggro:${focusedAggroId}`.slice(0, 96);
  npc.lastAttackStyle = "";
  state.npcs[id] = npc;
  state.entities[id] = npc;
}

function updateNpcs(state: MmoSkillDemoState, runtime: ZoneRuntime, kernel: CollisionKernel, dt: number) {
  const ms = Math.max(0, Math.floor(dt * 1000));
  for (const npc of snapshotEntitiesOfType(state, "npc", updateNpcScratch)) {
    if (state.entities[npc.id] !== npc) continue;
    const previousPhase = npc.phaseMs;
    npc.phaseMs = u16Ms((npc.phaseMs + ms) % npcPhaseLength(npc));
    npc.slowMs = u16Ms((npc.slowMs ?? 0) - ms);
    decayCombatTimers(npc, dt);
    const poisonStacks = npcFlagStacks(npc, "poison");
    if (poisonStacks > 0 && npc.damageAmpMs > 0) {
      const previousPoisonTick = Math.floor(previousPhase / 500);
      const currentPoisonTick = Math.floor(npc.phaseMs / 500);
      if (currentPoisonTick !== previousPoisonTick || npc.phaseMs < previousPhase) npc.hp = Math.max(0, npc.hp - poisonStacks);
    }
    if (npc.damageAmpMs <= 0) {
      setNpcFlagStacks(npc, "hex", 0);
      setNpcFlagStacks(npc, "poison", 0);
      removeCombatFlag(npc, "soulbound");
      removeCombatFlag(npc, "bow-vulnerable");
      removeCombatFlag(npc, "antiheal");
      removeCombatFlag(npc, "deathmark");
      removeCombatFlag(npc, "mortal");
      removeCombatFlag(npc, "fractured");
      removeCombatFlag(npc, "blind");
      removeCombatFlag(npc, "weakened");
    }
    if ((npc.slowMs ?? 0) <= 0) removeCombatFlag(npc, "enfeebled");
    if (updateKnockback(kernel, npc, dt)) continue;
    if (npc.hp <= 0) {
      if (npc.role === "boss-node") continue;
      npc.respawnMs = u32Ms(npc.respawnMs - ms);
      if (npc.respawnMs === 0) {
        if (npc.summonedBy) {
          removeMmoEntityForReuse(state, npc.id);
          continue;
        }
        npc.hp = npc.maxHp;
        npc.x = npc.spawnX;
        npc.y = npc.spawnY;
        npc.iframeMs = 0;
        npc.stunMs = 0;
        npc.slowMs = 0;
        npc.castMs = 0;
        npc.damageAmpMs = 0;
        npc.combatState = "";
        npc.combatFlags = "";
      }
      continue;
    }
    updateBossMinigames(state, npc, dt);
    if (isPeaceNpc(npc) || npc.role === "boss-node") {
      if (isPeaceNpc(npc)) updatePassiveNpc(state, kernel, npc, dt);
      continue;
    }
    if (npc.kind === "player-decoy") {
      npc.respawnMs = u32Ms(npc.respawnMs - ms);
      npc.phaseMs = u16Ms(npc.phaseMs + ms);
      for (const other of entitiesOfType<NpcEntity>(state, "npc")) {
        if (other.id === npc.id || other.hp <= 0 || other.zoneId !== npc.zoneId || isPeaceNpc(other) || other.kind === "player-decoy") continue;
        const distance = Math.hypot(other.x - npc.x, other.y - npc.y);
        if (distance > BOW_DECOY_TAUNT_RANGE) continue;
        other.projectileCooldownMs = Math.max(other.projectileCooldownMs, 220);
        if (distance > 34) moveNpcToward(kernel, other, npc as unknown as PlayerEntity, 42, dt);
      }
      if (npc.respawnMs <= 0 || npc.hp <= 0) {
        const owner = Array.from(entitiesOfType<PlayerEntity>(state, "player")).find((player) => player.id === npc.summonedBy);
        if (owner) explodePlayerDecoy(state, kernel, owner, npc);
        removeMmoEntityForReuse(state, npc.id);
      }
      continue;
    }
    if (npc.combatState === "gather-threat-anchor") {
      npc.projectileCooldownMs = u16Ms(npc.projectileCooldownMs - ms);
      if (npc.projectileCooldownMs <= 0) {
        spawnGatheringThreatMinion(state, npc);
        npc.projectileCooldownMs = npc.kind === "infinite-magical-hornet-nest" ? 1400 : 2400;
      }
      continue;
    }
    if (npc.stunMs > 0) {
      npc.castMs = 0;
      for (const hazard of entitiesOfType<HazardEntity>(state, "hazard")) {
        if (hazard.ownerId === npc.id && hazard.windupMs > 0) removeMmoEntityForReuse(state, hazard.id);
      }
      continue;
    }
    npc.attackCooldownMs = u16Ms(npc.attackCooldownMs - ms);
    npc.projectileCooldownMs = u16Ms(npc.projectileCooldownMs - ms);
    const buffed = isNpcBuffed(npc);
    const invulnEnd = STRONG_PHASE_INVULN_START_MS + (npcProfile(npc).iframePhaseMs ?? STRONG_PHASE_INVULN_END_MS - STRONG_PHASE_INVULN_START_MS);
    if (isStrongEnemy(npc) && previousPhase < invulnEnd && npc.phaseMs >= invulnEnd) {
      npc.attackCooldownMs = 0;
      npc.projectileCooldownMs = 0;
    }
    if (isStrongEnemy(npc) && previousPhase < STRONG_PHASE_INVULN_START_MS && npc.phaseMs >= STRONG_PHASE_INVULN_START_MS) {
      beginNpcCast(npc, npc.kind === "stone-crawler" ? 500 : 320);
      if (npc.kind === "alpha-timberwolf") {
        const activeSummons = Array.from(entitiesOfType<NpcEntity>(state, "npc")).filter((other) => other.summonedBy === npc.id && other.hp > 0).length;
        if (activeSummons < 2) {
          addSummonedNpc(state, npc, 1);
          addSummonedNpc(state, npc, 2);
        }
      }
    }
    if (npc.kind === "crag-gargoyle" && isNpcInvulnerable(npc) && state.tick % 15 === 0 && !hasCombatFlag(npc, "antiheal") && !hasCombatFlag(npc, "mortal")) {
      npc.hp = Math.min(npc.maxHp, npc.hp + 2);
    }
    if (isNpcInvulnerable(npc)) continue;
    if (npc.kind === "void-sent-sentinel") applySentinelAura(state, npc);
    if ((npc.kind === "rune-priest" || npc.kind === "ember-acolyte" || npc.kind === "veil-oracle") && npc.projectileCooldownMs <= 0) {
      const ally = damagedHostileNear(state, npc, npc.kind === "ember-acolyte" ? 150 : 130);
      if (ally) {
        ally.hp = Math.min(ally.maxHp, ally.hp + (npc.kind === "veil-oracle" ? 16 : npc.kind === "ember-acolyte" ? 14 : 10));
        if (npc.kind === "veil-oracle" && isStrongEnemy(ally)) {
          ally.phaseMs = Math.max(ally.phaseMs, STRONG_PHASE_INVULN_END_MS + 220);
          ally.attackCooldownMs = 0;
          ally.projectileCooldownMs = 0;
        }
        npc.projectileCooldownMs = npc.kind === "veil-oracle" ? 1450 : npc.kind === "ember-acolyte" ? 1550 : 1850;
        continue;
      }
    }
    const target = nearestPlayerForNpc(state, runtime, npc, npcAggroRadius(npc));
    if (!target) continue;
    const distance = Math.hypot(target.x - npc.x, target.y - npc.y);
    const personality = npcPersonality(npc);
    const profile = npcProfile(npc);

    if (personality === "aggressive-pack-hunter") {
      const reach = npcMeleeReach(npc);
      if (distance > reach && distance < 148 && npc.projectileCooldownMs <= 0) {
        spawnNpcLungeTell(state, npc, target, npcMeleeDamage(npc, buffed), "dust");
        npc.projectileCooldownMs = buffed ? 900 : 1250;
      } else if (distance <= reach && npc.attackCooldownMs <= 0) {
        npcMeleeHit(state, npc, target, buffed, buffed ? 720 : 980);
      }
      if (Math.hypot(target.x - npc.x, target.y - npc.y) > reach) circleNpcAround(kernel, npc, target, profile.moveSpeed * (buffed ? 1.2 : 1), dt);
      continue;
    }

    if (personality === "berserk-high-aggro") {
      const reach = npcMeleeReach(npc);
      if (distance > reach && distance < 176 && npc.projectileCooldownMs <= 0) {
        spawnNpcLungeTell(state, npc, target, npcMeleeDamage(npc, buffed) + 1, "dust");
        npc.projectileCooldownMs = buffed ? 980 : 1380;
      } else if (distance <= reach && npc.attackCooldownMs <= 0) {
        npcMeleeHit(state, npc, target, buffed, buffed ? 760 : 1050, npcMeleeDamage(npc, buffed) + 1);
      }
      if (Math.hypot(target.x - npc.x, target.y - npc.y) > reach) moveNpcToward(kernel, npc, target, profile.moveSpeed * (buffed ? 1.25 : 1), dt);
      continue;
    }

    if (personality === "territorial-rooted") {
      if (npc.hp >= npc.maxHp) continue;
      if (npc.projectileCooldownMs <= 0 && distance > 78) {
        beginNpcCast(npc, 260);
        spawnHazard(state, npc, target, "line", 8, { knockbackModifier: profile.heavyKnockbackModifier ?? -2.2, isHeavyImpact: true, effectKind: "root" });
        npc.projectileCooldownMs = 1500;
      } else if (npc.attackCooldownMs <= 0 && distance <= 82) {
        beginNpcCast(npc, 220);
        spawnHazard(state, npc, target, "aoe", 9, { knockbackModifier: profile.knockbackModifier, isHeavyImpact: true, effectKind: "sap" });
        npc.attackCooldownMs = 1500;
      }
      continue;
    }

    if (personality === "cowardly-opportunistic") {
      if (npc.projectileCooldownMs <= 0 && distance < 156) {
        beginNpcCast(npc, 120);
        spawnHazard(state, npc, target, "aoe", buffed ? 10 : 7, { knockbackModifier: 0.8, effectKind: "spore" });
        npc.projectileCooldownMs = buffed ? 820 : 1180;
      }
      if (distance < 132) {
        const escaped = moveNpcAway(kernel, npc, target, profile.moveSpeed * (buffed ? 1.22 : 1), dt);
        if (!escaped && distance < 72 && npc.attackCooldownMs <= 0) npcDirectHit(state, npc, target, buffed ? 8 : 5, { castMs: 120, cooldownMs: 980, knockbackModifier: profile.heavyKnockbackModifier ?? -1.5 });
      }
      continue;
    }

    if (personality === "erratic-harasser") {
      const reach = npcMeleeReach(npc);
      if (npc.projectileCooldownMs <= 0 && distance > reach && distance < 170) {
        spawnNpcLungeTell(state, npc, target, npcMeleeDamage(npc, buffed), profile.impactType);
        npc.projectileCooldownMs = 1020;
      } else if (distance <= reach && npc.attackCooldownMs <= 0) {
        npcMeleeHit(state, npc, target, buffed, 1020);
      }
      if (distance < 96) moveNpcAway(kernel, npc, target, profile.moveSpeed, dt, true);
      else moveNpcToward(kernel, npc, target, profile.moveSpeed, dt, true);
      continue;
    }

    if (personality === "stoic-bruiser") {
      if (distance <= 70 && npc.attackCooldownMs <= 0) {
        beginNpcCast(npc, 500);
        spawnHazard(state, npc, target, "aoe", buffed ? 10 : 8, { knockbackModifier: heavyKbm(npc), isHeavyImpact: true, effectKind: "spark" });
        npc.attackCooldownMs = 1800;
      } else if (distance > 48) {
        moveNpcToward(kernel, npc, target, profile.moveSpeed, dt);
      }
      continue;
    }

    if (personality === "stubborn-lane-defender") {
      if (distance < 170 && npc.projectileCooldownMs <= 0) {
        beginNpcCast(npc, 220);
        spawnHazard(state, npc, target, "line", 8, { knockbackModifier: heavyKbm(npc), isHeavyImpact: true, effectKind: "dust" });
        npc.projectileCooldownMs = 1900;
      }
      if (distance > 46) moveNpcToward(kernel, npc, target, npc.phaseMs > 1900 && npc.phaseMs < 2900 ? 112 : profile.moveSpeed, dt);
      continue;
    }

    if (personality === "intelligent-skittish") {
      if (distance < 82) {
        moveNpcAway(kernel, npc, target, 126, dt);
        npc.iframeMs = Math.max(npc.iframeMs, profile.iframeMs ?? 300);
        npc.castMs = Math.max(npc.castMs, 160);
      } else if (distance > 122) {
        moveNpcToward(kernel, npc, target, profile.moveSpeed, dt);
      }
      if (npc.projectileCooldownMs <= 0 && distance < 180) {
        beginNpcCast(npc, 160);
        spawnHazard(state, npc, target, "aoe", buffed ? 10 : 7, { knockbackModifier: profile.knockbackModifier, effectKind: "spark" });
        npc.projectileCooldownMs = 1240;
      }
      continue;
    }

    if (personality === "defensive-guardian") {
      if (previousPhase < 6200 && npc.phaseMs >= 6200) {
        beginNpcCast(npc, 260);
        spawnRadialHazards(state, npc, 8, 9, 160, { knockbackModifier: heavyKbm(npc), isHeavyImpact: true, effectKind: "spark" });
      }
      if (distance > 54) moveNpcToward(kernel, npc, target, profile.moveSpeed, dt);
      continue;
    }

    if (personality === "predatory-ambush") {
      if (distance > 54 && npc.phaseMs > 2800 && npc.phaseMs < 3300) {
        npc.iframeMs = Math.max(npc.iframeMs, profile.iframeMs ?? 240);
        npc.x = clamp(target.x - 34, PLAYER_RADIUS, mmoSkillDemoMap.pixelWidth - PLAYER_RADIUS);
        npc.y = clamp(target.y + 18, PLAYER_RADIUS, mmoSkillDemoMap.pixelHeight - PLAYER_RADIUS);
        continue;
      }
      if (npc.attackCooldownMs <= 0 && distance < 86) {
        npcDirectHit(state, npc, target, buffed ? 9 : 6, { castMs: 180, cooldownMs: 1150, knockbackModifier: profile.heavyKnockbackModifier ?? -2.2 });
      } else if (distance > 48) {
        moveNpcToward(kernel, npc, target, profile.moveSpeed, dt, true);
      }
      continue;
    }

    if (personality === "intelligent-spacer") {
      if (distance < 78) {
        moveNpcAway(kernel, npc, target, 134, dt);
        npc.iframeMs = Math.max(npc.iframeMs, profile.iframeMs ?? 400);
        npc.castMs = Math.max(npc.castMs, 160);
      } else if (distance < 182 && npc.projectileCooldownMs <= 0) {
        beginNpcCast(npc, 420);
        spawnHazard(state, npc, target, "line", buffed ? 10 : 8, { knockbackModifier: profile.knockbackModifier, armorPierce: true, effectKind: "void" });
        npc.projectileCooldownMs = buffed ? 920 : 1200;
      } else if (distance < 128) {
        moveNpcAway(kernel, npc, target, profile.moveSpeed, dt);
      }
      continue;
    }

    if (personality === "support-caster") {
      if (distance < 96) {
        moveNpcAway(kernel, npc, target, profile.moveSpeed, dt);
      } else if (distance > profile.preferredRange + 24) {
        moveNpcToward(kernel, npc, target, profile.moveSpeed, dt);
      }
      if (npc.projectileCooldownMs <= 0 && distance < 178) {
        beginNpcCast(npc, profile.precastMs ?? 180);
        spawnHazard(state, npc, target, "line", buffed ? 9 : 7, { knockbackModifier: profile.knockbackModifier, effectKind: profile.impactType });
        npc.projectileCooldownMs = buffed ? 860 : 1180;
      }
      continue;
    }

    if (personality === "evasive-zoner") {
      if (distance < 150) moveNpcAway(kernel, npc, target, profile.moveSpeed, dt);
      if (npc.projectileCooldownMs <= 0 && distance < 190) {
        beginNpcCast(npc, 120);
        spawnHazard(state, npc, target, "aoe", buffed ? 11 : 8, { knockbackModifier: 0.9, effectKind: "spore" });
        npc.projectileCooldownMs = buffed ? 820 : 1120;
      }
      continue;
    }

    if (personality === "inexorable-dread") {
      if (distance > 52) moveNpcToward(kernel, npc, target, profile.moveSpeed, dt);
      else if (npc.attackCooldownMs <= 0) npcDirectHit(state, npc, target, buffed ? 13 : 10, { castMs: 360, cooldownMs: buffed ? 980 : 1350, knockbackModifier: heavyKbm(npc), isHeavyImpact: true, effectKind: "void" });
      if (npc.projectileCooldownMs <= 0 && distance < 180) {
        spawnHazard(state, npc, target, "line", buffed ? 11 : 8, { knockbackModifier: -1.4, effectKind: "void" });
        npc.projectileCooldownMs = 1500;
      }
      continue;
    }

    if (personality === "mechanical-boss") {
      if (npc.kind === "great-ash-lord" && distance < 140 && npc.attackCooldownMs <= 0) {
        beginNpcCast(npc, 520);
        spawnHazard(state, npc, target, "aoe", 14, { knockbackModifier: heavyKbm(npc), isHeavyImpact: true, effectKind: "sap" });
        npc.attackCooldownMs = 1650;
      } else if (npc.kind === "iron-core-golem" && npc.projectileCooldownMs <= 0 && distance < 190) {
        beginNpcCast(npc, 500);
        spawnHazard(state, npc, target, "line", 13, { knockbackModifier: heavyKbm(npc), isHeavyImpact: true, effectKind: "spark" });
        npc.projectileCooldownMs = 1320;
      } else if (npc.kind === "mirror-king" && target.action !== "idle" && distance < 126 && npc.attackCooldownMs <= 0) {
        beginNpcCast(npc, 240);
        const style = attackStyleForAction(target.action, target);
        npc.lastAttackStyle = style || npc.lastAttackStyle;
        if (style === "spell") spawnHazard(state, npc, target, "line", 10, { knockbackModifier: -1.5, effectKind: "void" });
        else npcDirectHit(state, npc, target, target.action === "e" ? 14 : target.action === "q" ? 10 : 7, { castMs: 240, knockbackModifier: profile.knockbackModifier, effectKind: "void" });
        npc.attackCooldownMs = 1200;
      }
      if (distance > profile.preferredRange) moveNpcToward(kernel, npc, target, profile.moveSpeed * (buffed ? 1.12 : 1), dt);
      continue;
    }

    if (npc.kind === "ash-bramble-stalker" && distance < 135 && npc.projectileCooldownMs <= 0) {
      spawnHazard(state, npc, target, "aoe", buffed ? 10 : 6);
      npc.projectileCooldownMs = buffed ? 880 : 1350;
      if (distance > 58) continue;
    }

    if (npc.kind === "crag-sapper" && distance < 170 && npc.projectileCooldownMs <= 0) {
      spawnHazard(state, npc, target, buffed ? "line" : "aoe", buffed ? 11 : 7);
      npc.projectileCooldownMs = buffed ? 940 : 1280;
      if (distance > 72) continue;
    }

    if (npc.kind === "mire-bomber" && distance < 185 && npc.projectileCooldownMs <= 0) {
      spawnHazard(state, npc, target, "aoe", buffed ? 11 : 8);
      npc.projectileCooldownMs = buffed ? 820 : 1120;
      if (distance > 92) continue;
    }

    if (npc.kind === "mire-bomber" && distance < 92) {
      const move = kernel.vecNormalize(npc.x - target.x, npc.y - target.y);
      const nextX = npc.x + move.x * 58 * dt;
      const nextY = npc.y + move.y * 58 * dt;
      if (canOccupy(kernel, nextX, npc.y)) npc.x = nextX;
      if (canOccupy(kernel, npc.x, nextY)) npc.y = nextY;
      continue;
    }

    if (npc.kind === "sand-wraith" && distance > 54 && npc.phaseMs > 2800 && npc.phaseMs < 3300) {
      npc.x = clamp(target.x - 34, PLAYER_RADIUS, mmoSkillDemoMap.pixelWidth - PLAYER_RADIUS);
      npc.y = clamp(target.y + 18, PLAYER_RADIUS, mmoSkillDemoMap.pixelHeight - PLAYER_RADIUS);
      continue;
    }

    if (npc.kind === "crystal-beetle" && distance < 170 && npc.phaseMs > 1300 && npc.phaseMs < 1900 && npc.projectileCooldownMs <= 0) {
      spawnHazard(state, npc, target, "line", 8);
      npc.projectileCooldownMs = 1900;
      continue;
    }

    if ((npc.kind === "cursed-archer" || npc.kind === "ember-acolyte" || npc.kind === "veil-oracle") && distance < 165 && npc.projectileCooldownMs <= 0) {
      spawnHazard(state, npc, target, "line", 7 + (buffed ? 2 : 0));
      npc.projectileCooldownMs = buffed ? 780 : 1050;
      continue;
    }

    if ((npc.elite || npc.role === "boss") && distance < 190 && npc.projectileCooldownMs <= 0) {
      const linePhase = buffed || npc.kind === "bazaar-guard" || npc.kind === "void-sent-sentinel" || npc.kind === "mirror-king" || npc.kind === "dungeon-revenant";
      spawnHazard(state, npc, target, linePhase ? "line" : "aoe", (npc.role === "boss" ? 13 : 9) + (buffed ? 3 : 0));
      npc.projectileCooldownMs = buffed ? (npc.role === "boss" ? 920 : 1050) : npc.role === "boss" ? 1350 : 1650;
      if (linePhase) continue;
    }

    if (npc.kind === "aggro-tree") {
      if (distance < 68 && npc.attackCooldownMs <= 0) {
        npcDirectHit(state, npc, target, 7, { castMs: 420, cooldownMs: 1700, knockbackModifier: heavyKbm(npc), isHeavyImpact: true, effectKind: "sap" });
      }
      continue;
    }

    if (npc.kind === "great-ash-lord" && npc.phaseMs > 3600 && distance < 125 && npc.attackCooldownMs <= 0) {
      spawnHazard(state, npc, target, "aoe", 14);
      npc.attackCooldownMs = 1600;
      continue;
    }

    if (npc.kind === "mirror-king" && target.action !== "idle" && distance < 115 && npc.attackCooldownMs <= 0) {
      npcDirectHit(state, npc, target, target.action === "e" ? 14 : target.action === "q" ? 10 : 7, { castMs: 240, cooldownMs: 1200, knockbackModifier: npcProfile(npc).knockbackModifier, effectKind: "void" });
      continue;
    }

    if (distance > (npc.role === "boss" ? 58 : 42)) {
      const speed =
        npc.kind === "iron-eye-bat"
          ? 82
          : npc.kind === "stone-crawler"
            ? 34
            : npc.kind === "crystal-beetle"
              ? npc.phaseMs > 1900 && npc.phaseMs < 2900
                ? 112
                : 46
            : npc.kind === "sand-wraith"
              ? 74
              : npc.kind === "mire-bomber" || npc.kind === "crag-sapper"
                ? 49
                : npc.kind === "rune-priest" || npc.kind === "ember-acolyte" || npc.kind === "veil-oracle"
                  ? 42
              : npc.kind === "ash-bramble-stalker"
                ? 58
                : npc.kind === "dungeon-revenant"
                  ? 50
              : npc.kind === "iron-core-golem"
                ? 38
                : npc.role === "boss"
                  ? 44
                  : 52;
      const scaled = speed * npcSpeedScale(npc) * (buffed ? 1.28 : 1);
      const ignoreTerrain = npc.kind === "iron-eye-bat" || npc.kind === "sand-wraith";
      if (MMO_SKILL_DEMO_ACCESSOR_CACHE_ENABLED) {
        const npcX = npc.x;
        const npcY = npc.y;
        const targetX = target.x;
        const targetY = target.y;
        const move = kernel.vecNormalize(targetX - npcX, targetY - npcY);
        const nextX = npcX + move.x * scaled * dt;
        const nextY = npcY + move.y * scaled * dt;
        const finalX = ignoreTerrain || canOccupy(kernel, nextX, npcY) ? nextX : npcX;
        const finalY = ignoreTerrain || canOccupy(kernel, finalX, nextY) ? nextY : npcY;
        if (finalX !== npcX) npc.x = finalX;
        if (finalY !== npcY) npc.y = finalY;
      } else {
        const move = kernel.vecNormalize(target.x - npc.x, target.y - npc.y);
        const nextX = npc.x + move.x * scaled * dt;
        const nextY = npc.y + move.y * scaled * dt;
        if (ignoreTerrain || canOccupy(kernel, nextX, npc.y)) npc.x = nextX;
        if (ignoreTerrain || canOccupy(kernel, npc.x, nextY)) npc.y = nextY;
      }
    } else if (npc.attackCooldownMs <= 0) {
      const playerRect = rectAround(target, 22, 24);
      const npcX = npc.x;
      const npcY = npc.y;
      const role = npc.role;
      if (kernel.testCircleRectOverlap(npcX, npcY, role === "boss" ? 54 : 38, playerRect.x, playerRect.y, playerRect.w, playerRect.h)) {
        const elite = npc.elite;
        const kind = npc.kind;
        const hit = (role === "boss" ? 11 : elite ? 8 : kind.includes("crawler") ? 5 : 3) + (buffed ? 3 : 0);
        npcDirectHit(state, npc, target, hit, { cooldownMs: buffed ? (role === "boss" ? 900 : 820) : role === "boss" ? 1400 : 1200, knockbackModifier: npcProfile(npc).knockbackModifier, isHeavyImpact: elite || role === "boss" });
      }
    }
  }
}

function updateResources(state: MmoSkillDemoState, dt: number) {
  const ms = Math.max(0, Math.floor(dt * 1000));
  for (const resource of entitiesOfType<ResourceEntity>(state, "resource")) {
    if (!resource.depleted) continue;
    resource.respawnMs = u32Ms(resource.respawnMs - ms);
    if (resource.respawnMs === 0) {
      resource.depleted = false;
      resource.hp = resource.maxHp;
    }
  }
}

function updateLoots(state: MmoSkillDemoState, dt: number) {
  const ms = Math.max(0, Math.floor(dt * 1000));
  for (const loot of snapshotEntitiesOfType(state, "loot", updateLootScratch)) {
    if (state.entities[loot.id] !== loot) continue;
    loot.expiresMs = u16Ms(loot.expiresMs - ms);
    if (loot.expiresMs <= 0) removeMmoEntityForReuse(state, loot.id);
  }
}

function updatePlayerProgression(state: MmoSkillDemoState, dt: number) {
  const ms = Math.max(0, Math.floor(dt * 1000));
  for (const player of entitiesOfType<PlayerEntity>(state, "player")) {
    ensurePlayerCombatLoadout(player);
    ensureDailyQuestState(player);
    player.mana = Math.min(player.maxMana, player.mana + Math.ceil(dt * 3));
    player.contractCooldownMs = u16Ms(player.contractCooldownMs - ms);
    if (player.hp > 0 && player.hp < player.maxHp && state.tick % 20 === 0) player.hp = Math.min(player.maxHp, player.hp + 1 + Math.floor(player.combatLevel / 18));
    if (isBazaarPressureZone(player.zoneId) && player.hp > 0) player.bazaarSurvivalMs += Math.floor(dt * 1000);
    if (isBazaarPressureZone(player.zoneId) && player.activeQuestId === "ghostly-trade" && player.bazaarSurvivalMs > 45000) {
      addQuestBit(player, "ghostly-trade");
      player.gold += 35;
      awardXp(player, "combat", 30);
    }
    if (player.zoneId === "crags" && player.x < 9 * WORLD_MAP_SCALE * TILE && player.y > 24 * WORLD_MAP_SCALE * TILE) {
      addQuestBit(player, "hidden-vein");
      player.gold += hasQuestFlag(player, "hidden-vein-paid") ? 0 : 30;
      addQuestBit(player, "hidden-vein-paid");
    }
    if (state.tick % 20 === 0) progressDailyQuest(player, { kind: "zone", amount: 1 });
    refreshQuestProgress(player);
  }
}

function upsertInterestEntities(runtime: ZoneRuntime, state: MmoSkillDemoState) {
  const nextIds = runtime.nextInterestIds;
  const nextLogicIds = runtime.nextLogicIds;
  const scratch = runtime.interestScratch;
  nextIds.clear();
  nextLogicIds.clear();
  const upsert = (id: string, type: string, x: number, y: number, radius: number, priority: number) => {
    nextIds.add(id);
    nextLogicIds.add(id);
    const previous = runtime.interestCache.get(id);
    if (previous && previous.type === type && previous.x === x && previous.y === y && previous.radius === radius && previous.priority === priority && previous.global === undefined) return;
    scratch.id = id;
    scratch.type = type;
    scratch.x = x;
    scratch.y = y;
    scratch.radius = radius;
    scratch.priority = priority;
    scratch.global = undefined;
    runtime.grid.upsert(scratch);
    runtime.logicHash.upsert({ id, type: type as MmoSkillDemoEntityKind, x, y, radius });
    runtime.interestCache.set(id, { id, type, x, y, radius, priority });
  };
  for (const entity of entitiesInState(state)) {
    if (entity.entityType === "player") {
      if (!MMO_SKILL_DEMO_ACCESSOR_CACHE_ENABLED) {
        upsert(entity.id, "player", entity.x, entity.y, PLAYER_RADIUS, 100);
        continue;
      }
      const x = entity.x;
      const y = entity.y;
      upsert(entity.id, "player", x, y, PLAYER_RADIUS, 100);
    } else if (entity.entityType === "npc") {
      if (!MMO_SKILL_DEMO_ACCESSOR_CACHE_ENABLED) {
        upsert(entity.id, "npc", entity.x, entity.y, bodyRadius(entity), entity.hp > 0 ? 50 : 10);
        continue;
      }
      const x = entity.x;
      const y = entity.y;
      const hp = entity.hp;
      upsert(entity.id, "npc", x, y, bodyRadius(entity), hp > 0 ? 50 : 10);
    } else if (entity.entityType === "resource") {
      if (!MMO_SKILL_DEMO_ACCESSOR_CACHE_ENABLED) {
        upsert(entity.id, "resource", entity.x, entity.y, (RESOURCE_SIZE_BY_KIND[entity.kind] ?? RESOURCE_SIZE_BY_KIND.ore)!.interestRadius, entity.depleted ? 5 : 25);
        continue;
      }
      const x = entity.x;
      const y = entity.y;
      upsert(entity.id, "resource", x, y, (RESOURCE_SIZE_BY_KIND[entity.kind] ?? RESOURCE_SIZE_BY_KIND.ore)!.interestRadius, entity.depleted ? 5 : 25);
    } else if (entity.entityType === "loot") {
      if (!MMO_SKILL_DEMO_ACCESSOR_CACHE_ENABLED) {
        upsert(entity.id, "loot", entity.x, entity.y, entity.pickupRadius, 35);
        continue;
      }
      const x = entity.x;
      const y = entity.y;
      upsert(entity.id, "loot", x, y, entity.pickupRadius, 35);
    } else if (entity.entityType === "hazard") {
      if (!MMO_SKILL_DEMO_ACCESSOR_CACHE_ENABLED) {
        const isLine = entity.kind === "line";
        const centerX = isLine ? (entity.x + entity.toX) * 0.5 : entity.x;
        const centerY = isLine ? (entity.y + entity.toY) * 0.5 : entity.y;
        const lineReach = isLine ? Math.hypot(entity.toX - entity.x, entity.toY - entity.y) * 0.5 : 0;
        const priority = entity.damage > 0 || entity.windupMs > 0 ? 45 : entity.effectKind === "cone" ? 30 : 18;
        upsert(entity.id, "hazard", centerX, centerY, Math.max(16, entity.radius + lineReach), priority);
        continue;
      }
      const x = entity.x;
      const y = entity.y;
      const isLine = entity.kind === "line";
      const toX = entity.toX;
      const toY = entity.toY;
      const centerX = isLine ? (x + toX) * 0.5 : x;
      const centerY = isLine ? (y + toY) * 0.5 : y;
      const lineReach = isLine ? Math.hypot(toX - x, toY - y) * 0.5 : 0;
      const priority = entity.damage > 0 || entity.windupMs > 0 ? 45 : entity.effectKind === "cone" ? 30 : 18;
      upsert(entity.id, "hazard", centerX, centerY, Math.max(16, entity.radius + lineReach), priority);
    }
  }
  for (const id of runtime.interestIds) {
    if (!nextIds.has(id)) {
      runtime.grid.remove(id);
      runtime.logicHash.remove(id);
      runtime.interestCache.delete(id);
    }
  }
  for (const id of runtime.logicIds) {
    if (!nextLogicIds.has(id)) runtime.logicHash.remove(id);
  }
  runtime.nextInterestIds = runtime.interestIds;
  runtime.interestIds = nextIds;
  runtime.nextLogicIds = runtime.logicIds;
  runtime.logicIds = nextLogicIds;
}

function mmoSegmentTopLevel(state: MmoSkillDemoState, activePlayers: number): MmoSegmentTopLevel {
  return {
    tick: state.tick,
    mapRevision: state.mapRevision,
    roomKind: state.roomKind,
    roomLabel: state.roomLabel,
    activePlayers,
    worldEventId: state.worldEventId,
    worldEventName: state.worldEventName,
    worldEventZoneId: state.worldEventZoneId,
    worldEventPhase: state.worldEventPhase,
    worldEventObjective: state.worldEventObjective,
    worldEventProgress: state.worldEventProgress,
    worldEventGoal: state.worldEventGoal,
    worldEventTimerMs: Math.ceil(Math.max(0, state.worldEventTimerMs) / 1000) * 1000,
    worldEventReward: state.worldEventReward
  };
}

function entitySegmentCellKey(entity: MmoSkillDemoEntity) {
  if (entity.entityType === "hazard" && entity.kind === "line") return mmoSkillDemoCellKey((entity.x + entity.toX) * 0.5, (entity.y + entity.toY) * 0.5);
  return mmoSkillDemoCellKey(entity.x, entity.y);
}

function mutableListBucket<T>(map: Map<string, T[]>, key: string) {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = [];
    map.set(key, bucket);
  }
  return bucket;
}

function sharedHotSlotByteOffset(runtime: MmoSkillDemoSharedHotRuntime, slotIndex: number) {
  return runtime.pool.dataByteOffset + slotIndex * runtime.pool.slotByteSize;
}

function sharedHotCellKeyForSlot(runtime: MmoSkillDemoSharedHotRuntime, view: DataView, slotIndex: number, entity: MmoSkillDemoEntity) {
  const slotOffset = sharedHotSlotByteOffset(runtime, slotIndex);
  const x = view.getFloat32(slotOffset + MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.x, true);
  const y = view.getFloat32(slotOffset + MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.y, true);
  if (entity.entityType === "hazard" && entity.kind === "line") return mmoSkillDemoCellKey((x + entity.toX) * 0.5, (y + entity.toY) * 0.5);
  return mmoSkillDemoCellKey(x, y);
}

function compactPublicCellStaticEntity(entity: ReturnType<typeof toMmoSkillDemoStaticSegmentEntity>) {
  return entity;
}

function addPublicCellSegmentRecord(
  runtime: ZoneRuntime,
  top: MmoSegmentTopLevel,
  staticRecordsByEntity: Map<string, PublicStaticRecord>,
  entity: MmoSkillDemoEntity,
  cellKey: string
) {
  const projected = sanitizeEntityForReplication(projectMmoEntityForViewer(entity, "") ?? entity);
  const staticEntity = compactPublicCellStaticEntity(toMmoSkillDemoStaticSegmentEntity(projected));
  const segmentId = `world-static:${projected.id}`;
  const record: PublicStaticRecord = {
    entityId: projected.id,
    cellKey,
    kind: "world-cell-static",
    signature: mmoSkillDemoStaticEntitySignature(staticEntity),
    segmentId,
    staticEntity
  };
  if (!MMO_SKILL_DEMO_STATIC_LAZY_ENABLED) record.segment = staticSegmentForRecord(top, record);
  runtime.staticSignatureBySegmentId.set(record.segmentId, record.signature);
  staticRecordsByEntity.set(projected.id, record);
}

function buildPublicStaticCellRecords(
  runtime: ZoneRuntime,
  top: MmoSegmentTopLevel,
  staticRecordsByEntity: Map<string, PublicStaticRecord>
) {
  const recordsByCell = new Map<string, PublicStaticRecord[]>();
  for (const record of staticRecordsByEntity.values()) {
    if (record.staticEntity.entityType === "player") continue;
    mutableListBucket(recordsByCell, record.cellKey).push(record);
  }
  const staticRecordsByCell = new Map<string, PublicStaticRecord>();
  for (const [cellKey, records] of recordsByCell) {
    records.sort((a, b) => a.entityId.localeCompare(b.entityId));
    const staticEntities: Record<string, ReturnType<typeof toMmoSkillDemoStaticSegmentEntity>> = {};
    const signatures: string[] = [];
    const entityIds: string[] = [];
    for (const record of records) {
      staticEntities[record.entityId] = record.staticEntity;
      signatures.push(record.signature);
      entityIds.push(record.entityId);
    }
    const segmentId = `world-static-cell:${cellKey}`;
    const cellRecord: PublicStaticRecord = {
      entityId: `cell:${cellKey}`,
      entityIds,
      cellKey,
      kind: "world-cell-static",
      signature: signatures.join("|"),
      segmentId,
      staticEntity: records[0]?.staticEntity ?? ({} as ReturnType<typeof toMmoSkillDemoStaticSegmentEntity>),
      staticEntities
    };
    const cacheKey = `${segmentId}:${cellRecord.signature}`;
    let segment = runtime.staticCellSegmentsBySignature.get(cacheKey);
    if (!segment) {
      segment = staticSegmentForRecord(top, cellRecord);
      runtime.staticCellSegmentsBySignature.set(cacheKey, segment);
    }
    cellRecord.segment = segment;
    runtime.staticSignatureBySegmentId.set(segmentId, cellRecord.signature);
    staticRecordsByCell.set(cellKey, cellRecord);
  }
  return staticRecordsByCell;
}

function fillPublicCellSegmentsFromSharedSlots(
  runtime: ZoneRuntime,
  state: MmoSkillDemoState,
  top: MmoSegmentTopLevel,
  publicEntityIdsByCell: Map<string, string[]>,
  volatileHotRefsByCell: Map<string, SharedCellReplicationEntity[]>,
  entityCellById: Map<string, string>,
  entityTypeById: Map<string, MmoSkillDemoEntityKind>,
  staticRecordsByEntity: Map<string, PublicStaticRecord>
) {
  if (!MMO_SKILL_DEMO_DIRECT_SHARED_SLOTS_ENABLED) return false;
  const hotRuntime = sharedHotRuntimeByState.get(state);
  if (!hotRuntime) return false;
  const index = hotRuntime.indices.all;
  if (index.count === 0 && Object.keys(state.entities ?? {}).length > 0) return false;
  const view = new DataView(hotRuntime.pool.buffer);
  for (let position = 0; position < index.count; position += 1) {
    const slotIndex = index.slots[position];
    const id = hotRuntime.entityIdsBySlot[slotIndex];
    const entityType = hotRuntime.entityTypesBySlot[slotIndex];
    const entity = id ? state.entities[id] : undefined;
    if (!id || !entityType || entity?.entityType !== entityType) continue;
    if (entity.entityType === "loot" && entity.ownerId) continue;
    const key = sharedHotCellKeyForSlot(hotRuntime, view, slotIndex, entity);
    entityCellById.set(id, key);
    entityTypeById.set(id, entityType);
    mutableListBucket(publicEntityIdsByCell, key).push(id);
    mutableListBucket(volatileHotRefsByCell, key).push({
      idCode: hotRuntime.entityIdCodesBySlot[slotIndex],
      typeCode: hotRuntime.entityTypeCodesBySlot[slotIndex],
      slotIndex,
      dirtyMask: hotRuntime.dirtyMasksBySlot[slotIndex]
    });
    addPublicCellSegmentRecord(runtime, top, staticRecordsByEntity, entity, key);
  }
  return true;
}

function rebuildPublicCellSegments(runtime: ZoneRuntime, state: MmoSkillDemoState, activePlayers: number, forceVolatileEncode = false) {
  if (runtime.segmentCache?.tick === state.tick && (!forceVolatileEncode || runtime.segmentCache.fullVolatile)) return runtime.segmentCache;
  const previousCache = runtime.segmentCache;
  const top = mmoSegmentTopLevel(state, activePlayers);
  const publicEntityIdsByCell = new Map<string, string[]>();
  const volatileHotRefsByCell = new Map<string, SharedCellReplicationEntity[]>();
  const entityCellById = new Map<string, string>();
  const entityTypeById = new Map<string, MmoSkillDemoEntityKind>();
  const staticRecordsByEntity = new Map<string, PublicStaticRecord>();
  const useSharedDirtySlabs = MMO_SKILL_DEMO_SHARED_DIRTY_SLAB_ENABLED && !forceVolatileEncode && !!previousCache;
  const fullVolatile = forceVolatileEncode || (!useSharedDirtySlabs && (!MMO_SKILL_DEMO_DIRTY_REPLICATION_ENABLED || !previousCache));
  const dirtyState = dirtyReplicationState(state);
  const dirtyCells = new Set<string>();
  const directSharedSlots = fillPublicCellSegmentsFromSharedSlots(
    runtime,
    state,
    top,
    publicEntityIdsByCell,
    volatileHotRefsByCell,
    entityCellById,
    entityTypeById,
    staticRecordsByEntity
  );

  if (!directSharedSlots) {
    for (const sourceEntity of entitiesInState(state)) {
      if (sourceEntity.entityType === "loot" && sourceEntity.ownerId) continue;
      const key = entitySegmentCellKey(sourceEntity);
      entityCellById.set(sourceEntity.id, key);
      entityTypeById.set(sourceEntity.id, sourceEntity.entityType);
      mutableListBucket(publicEntityIdsByCell, key).push(sourceEntity.id);
      let slotIndex = mmoSkillDemoSharedHotSlotForEntity(state, sourceEntity.id);
      if (slotIndex === undefined) {
        ensureSharedHotEntity(state, sourceEntity);
        slotIndex = mmoSkillDemoSharedHotSlotForEntity(state, sourceEntity.id);
      }
      if (slotIndex !== undefined) {
        const hotRuntime = sharedHotRuntimeByState.get(state);
        mutableListBucket(volatileHotRefsByCell, key).push({
          idCode: hotRuntime?.entityIdCodesBySlot[slotIndex] || mmoSkillDemoEntityIdCode(sourceEntity.id),
          typeCode: hotRuntime?.entityTypeCodesBySlot[slotIndex] || mmoSkillDemoEntityTypeCode(sourceEntity.entityType),
          slotIndex,
          dirtyMask: hotRuntime?.dirtyMasksBySlot[slotIndex] ?? MMO_SKILL_DEMO_SHARED_HOT_DIRTY_FULL
        });
      }
      addPublicCellSegmentRecord(runtime, top, staticRecordsByEntity, sourceEntity, key);
    }
  }
  if (!fullVolatile && previousCache && !useSharedDirtySlabs) {
    for (const [id, cellKey] of entityCellById) {
      const previousCell = previousCache.entityCellById.get(id);
      const previousType = previousCache.entityTypeById.get(id);
      if (dirtyState?.volatileEntityIds.has(id) || previousCell !== cellKey || previousType !== entityTypeById.get(id)) {
        dirtyCells.add(cellKey);
        if (previousCell) dirtyCells.add(previousCell);
      }
    }
    for (const id of dirtyState?.removedEntityIds ?? []) {
      const previousCell = previousCache.entityCellById.get(id);
      if (previousCell) dirtyCells.add(previousCell);
    }
  }

  const volatileBuffersByCell = new Map<string, Uint8Array>();
  const fullVolatileBuffersByCell = new Map<string, Uint8Array>();
  const hotPool = sharedHotRuntimeByState.get(state)?.pool;
  const sharedCellReplicator = hotPool ? createSharedCellReplicator<MmoSkillDemoSegmentKind>(hotPool) : undefined;
  const dirtyCellReplicator = hotPool && useSharedDirtySlabs ? createSharedCellReplicator<MmoSkillDemoSegmentKind>(hotPool, {
    fullDirtyMask: MMO_SKILL_DEMO_SHARED_HOT_DIRTY_FULL,
    dirtyRanges: [
      { mask: MMO_SKILL_DEMO_SHARED_HOT_DIRTY_POSITION, offset: MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.x, byteLength: 4 },
      { mask: MMO_SKILL_DEMO_SHARED_HOT_DIRTY_POSITION, offset: MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.y, byteLength: 4 },
      { mask: MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE, offset: MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.hp, byteLength: 2 },
      { mask: MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE, offset: MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.targetId, byteLength: 4 },
      { mask: MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE, offset: MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.action, byteLength: 1 },
      { mask: MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE, offset: MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.combatState, byteLength: 1 },
      { mask: MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE, offset: MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.statusMask, byteLength: 4 }
    ]
  }) : undefined;
  if (sharedCellReplicator) {
    for (const [key, refs] of volatileHotRefsByCell) {
      const previousBytes = previousCache?.volatileBuffersByCell.get(key);
      const bytes = dirtyCellReplicator
        ? dirtyCellReplicator.encodeCell(refs)
        : !fullVolatile && previousBytes && !dirtyCells.has(key)
          ? previousBytes
          : sharedCellReplicator.encodeCell(refs);
      volatileBuffersByCell.set(key, bytes);
    }
  }
  const staticRecordsByCell = buildPublicStaticCellRecords(runtime, top, staticRecordsByEntity);
  runtime.segmentCache = { tick: state.tick, top, fullVolatile, publicEntityIdsByCell, volatileBuffersByCell, fullVolatileBuffersByCell, volatileHotRefsByCell, sharedCellReplicator, entityCellById, entityTypeById, staticRecordsByEntity, staticRecordsByCell };
  clearMmoSkillDemoDirtyReplication(state);
  return runtime.segmentCache;
}

function fullVolatileBytesForCell(cache: PublicCellSegmentCache, key: string) {
  const cached = cache.fullVolatileBuffersByCell.get(key);
  if (cached) return cached;
  const refs = cache.volatileHotRefsByCell.get(key);
  if (!refs || !cache.sharedCellReplicator) return undefined;
  const bytes = cache.sharedCellReplicator.encodeCell(refs);
  cache.fullVolatileBuffersByCell.set(key, bytes);
  return bytes;
}

const STATIC_DISCOVERY_RECORDS_PER_TICK = 12;
const STATIC_DISCOVERY_CELL_RECORDS_PER_TICK = 9;
const STATIC_ACK_TIMEOUT_MS = 3000;

function staticCursorMap(runtime: ZoneRuntime, playerId: string) {
  let cursors = runtime.staticEntitiesByPlayer.get(playerId);
  if (!cursors) {
    cursors = new Map();
    runtime.staticEntitiesByPlayer.set(playerId, cursors);
  }
  return cursors;
}

function staticQueue(runtime: ZoneRuntime, playerId: string) {
  let queue = runtime.staticDiscoveryQueueByPlayer.get(playerId);
  if (!queue) {
    queue = [];
    runtime.staticDiscoveryQueueByPlayer.set(playerId, queue);
  }
  return queue;
}

function needsStaticDiscovery(runtime: ZoneRuntime, playerId: string, record: Pick<PublicStaticRecord, "entityId" | "signature">, nowMs: number) {
  const cursor = staticCursorMap(runtime, playerId).get(record.entityId);
  if (!cursor) return true;
  if (cursor.signature !== record.signature) return true;
  if (cursor.status === "acked") return false;
  return nowMs - cursor.sentAt >= STATIC_ACK_TIMEOUT_MS;
}

function enqueueStaticDiscovery(runtime: ZoneRuntime, playerId: string, records: readonly PublicStaticRecord[], nowMs: number, tick: number) {
  const queue = staticQueue(runtime, playerId);
  const queued = new Set(queue.map((item) => item.entityId));
  for (const record of records) {
    if (!needsStaticDiscovery(runtime, playerId, record, nowMs) || queued.has(record.entityId)) continue;
    queue.push({ entityId: record.entityId, enqueuedTick: tick });
    queued.add(record.entityId);
  }
}

function recordStaticTtd(runtime: ZoneRuntime, ticks: number) {
  runtime.staticTtdSamples.push(Math.max(0, ticks));
  while (runtime.staticTtdSamples.length > 100) runtime.staticTtdSamples.shift();
}

const STATIC_SEGMENT_TOP: MmoSegmentTopLevel = {
  tick: 0,
  mapRevision: "",
  roomKind: "",
  roomLabel: "",
  activePlayers: 0,
  worldEventId: "",
  worldEventName: "",
  worldEventZoneId: "ashwood",
  worldEventPhase: "",
  worldEventObjective: "",
  worldEventProgress: 0,
  worldEventGoal: 0,
  worldEventTimerMs: 0,
  worldEventReward: ""
};

function staticSegmentForRecord(_top: MmoSegmentTopLevel, record: PublicStaticRecord) {
  return record.segment ?? encodeMmoSkillDemoSegment(record.kind, record.segmentId, createMmoSkillDemoSegmentState(STATIC_SEGMENT_TOP, record.staticEntities ?? { [record.entityId]: record.staticEntity }));
}

function drainStaticDiscovery(
  runtime: ZoneRuntime,
  playerId: string,
  recordsByEntity: Map<string, PublicStaticRecord>,
  fallbackRecordsByEntity: Map<string, PublicStaticRecord>,
  top: MmoSegmentTopLevel,
  nowMs: number,
  tick: number
) {
  const queue = staticQueue(runtime, playerId);
  const segments: ReplicationEnvelopeSegment<MmoSkillDemoSegmentKind>[] = [];
  const nextQueue: StaticDiscoveryQueueItem[] = [];
  const consumed = new Set<string>();
  let cellChunksSent = 0;
  for (const item of queue) {
    const record = recordsByEntity.get(item.entityId) ?? fallbackRecordsByEntity.get(item.entityId);
    if (!record) continue;
    if (!needsStaticDiscovery(runtime, playerId, record, nowMs)) continue;
    const cellChunk = record.entityIds !== undefined;
    const cellChunkAllowed = !cellChunk || cellChunksSent < STATIC_DISCOVERY_CELL_RECORDS_PER_TICK;
    if (segments.length < STATIC_DISCOVERY_RECORDS_PER_TICK && cellChunkAllowed && !consumed.has(item.entityId)) {
      segments.push(staticSegmentForRecord(top, record));
      consumed.add(item.entityId);
      if (cellChunk) cellChunksSent += 1;
      recordStaticTtd(runtime, tick - item.enqueuedTick);
      nextQueue.push(item);
    } else {
      nextQueue.push(item);
    }
  }
  runtime.staticDiscoveryQueueByPlayer.set(playerId, nextQueue);
  return segments;
}

function createPrivateStaticRecord(entity: MmoSkillDemoEntity): PublicStaticRecord {
  const staticEntity = toMmoSkillDemoStaticSegmentEntity(entity);
  return {
    entityId: entity.id,
    cellKey: entitySegmentCellKey(entity),
    kind: "private-static",
    signature: mmoSkillDemoStaticEntitySignature(staticEntity),
    segmentId: `private-static:${entity.id}`,
    staticEntity
  };
}

function staticEntityIdFromSegment(segment: ReplicationEnvelopeSegment) {
  if (segment.kind !== "world-cell-static" && segment.kind !== "private-static") return undefined;
  if (segment.id.startsWith("world-static-cell:")) return `cell:${segment.id.slice("world-static-cell:".length)}`;
  const [, entityId] = segment.id.split(":");
  return entityId;
}

function staticSegmentCellKey(cache: PublicCellSegmentCache, segment: ReplicationEnvelopeSegment) {
  if (segment.kind !== "world-cell-static") return undefined;
  if (segment.id.startsWith("world-static-cell:")) return segment.id.slice("world-static-cell:".length);
  if (!segment.id.startsWith("world-static:")) return undefined;
  return cache.staticRecordsByEntity.get(segment.id.slice("world-static:".length))?.cellKey;
}

function pushFullVolatileRefreshForStaticSegments(
  segments: ReplicationEnvelopeSegment<MmoSkillDemoSegmentKind>[],
  cache: PublicCellSegmentCache,
  staticSegments: readonly ReplicationEnvelopeSegment<MmoSkillDemoSegmentKind>[]
) {
  const refreshed = new Set<string>();
  for (const segment of staticSegments) {
    const cellKey = staticSegmentCellKey(cache, segment);
    if (!cellKey || refreshed.has(cellKey)) continue;
    const bytes = fullVolatileBytesForCell(cache, cellKey) ?? cache.volatileBuffersByCell.get(cellKey);
    if (!bytes) continue;
    segments.push({ id: `cell:${cellKey}:volatile`, kind: "world-cell-volatile", bytes });
    refreshed.add(cellKey);
  }
}

function markStaticSegmentsSent(runtime: ZoneRuntime, playerId: string, sequence: number, segments: readonly ReplicationEnvelopeSegment[] | undefined, nowMs: number) {
  if (!segments?.length) return;
  const cursors = staticCursorMap(runtime, playerId);
  const records: StaticAckRecord[] = [];
  for (const segment of segments) {
    const entityId = staticEntityIdFromSegment(segment);
    if (!entityId) continue;
    const signature = runtime.staticSignatureBySegmentId.get(segment.id) ?? "";
    const previous = cursors.get(entityId);
    const nextSignature = signature || previous?.signature || "";
    cursors.set(entityId, { status: "sent", sentAt: nowMs, signature: nextSignature, sequence });
    records.push({ entityId, signature: nextSignature });
  }
  if (!records.length) return;
  let bySequence = runtime.staticAcksByPlayer.get(playerId);
  if (!bySequence) {
    bySequence = new Map();
    runtime.staticAcksByPlayer.set(playerId, bySequence);
  }
  bySequence.set(sequence, records);
}

function markStaticSegmentsAcked(runtime: ZoneRuntime, playerId: string, sequence: number) {
  const bySequence = runtime.staticAcksByPlayer.get(playerId);
  if (!bySequence) return;
  const cursors = staticCursorMap(runtime, playerId);
  for (const [sentSequence, records] of [...bySequence.entries()]) {
    if (sentSequence > sequence) continue;
    for (const record of records) {
      const cursor = cursors.get(record.entityId);
      if (cursor?.sequence === sentSequence && cursor.signature === record.signature) {
        cursors.set(record.entityId, { ...cursor, status: "acked" });
      }
    }
    bySequence.delete(sentSequence);
  }
}

const SNAPSHOT_COARSE_MAX_ENTITIES = 96;
const SNAPSHOT_COARSE_MAX_HAZARDS = 16;

function rebuildSnapshotCellCache(runtime: ZoneRuntime, state: MmoSkillDemoState) {
  if (runtime.snapshotCellCache?.tick === state.tick) return runtime.snapshotCellCache;
  const publicEntityIdsByCell = new Map<string, string[]>();
  for (const entity of entitiesInState(state)) mutableListBucket(publicEntityIdsByCell, entitySegmentCellKey(entity)).push(entity.id);
  runtime.snapshotCellCache = { tick: state.tick, publicEntityIdsByCell, publicProjectedById: new Map() };
  return runtime.snapshotCellCache;
}

function canCacheSnapshotProjection(entity: MmoSkillDemoEntity) {
  return entity.entityType !== "player" && !(entity.entityType === "loot" && entity.ownerId);
}

function buildCoarseSnapshotForPlayer(ctx: RoomContext<MmoSkillDemoState, MmoSkillDemoInput>, runtime: ZoneRuntime, player: AuthoritativePlayer, actor: PlayerEntity, interestRadius: number) {
  const cache = rebuildSnapshotCellCache(runtime, ctx.state);
  const cellKeys = mmoSkillDemoNeighborCellKeys(actor.x, actor.y);
  const entities: Record<string, MmoSkillDemoEntity> = {};
  const players: Record<string, PlayerEntity> = {};
  const npcs: Record<string, NpcEntity> = {};
  const resources: Record<string, ResourceEntity> = {};
  const loots: Record<string, LootEntity> = {};
  const hazards: Record<string, HazardEntity> = {};
  let count = 0;
  let hazardCount = 0;

  const addProjected = (id: string) => {
    if (entities[id]) return;
    const entity = ctx.state.entities[id];
    if (!entity) return;
    if (id !== player.id && count >= SNAPSHOT_COARSE_MAX_ENTITIES) return;
    if (entity.entityType === "hazard" && hazardCount >= SNAPSHOT_COARSE_MAX_HAZARDS) return;
    let projected = canCacheSnapshotProjection(entity) ? cache.publicProjectedById.get(id) : undefined;
    if (!projected) {
      const next = projectMmoEntityForViewer(entity, player.id);
      if (!next) return;
      projected = sanitizeEntityForReplication(next);
      if (canCacheSnapshotProjection(entity)) cache.publicProjectedById.set(id, projected);
    }
    if (!projected) return;
    entities[id] = projected;
    count += 1;
    if (projected.entityType === "player") players[id] = projected;
    else if (projected.entityType === "npc") npcs[id] = projected;
    else if (projected.entityType === "resource") resources[id] = projected;
    else if (projected.entityType === "loot") loots[id] = projected;
    else if (projected.entityType === "hazard") {
      hazards[id] = projected;
      hazardCount += 1;
    }
  };

  addProjected(player.id);
  for (const key of cellKeys) {
    const ids = cache.publicEntityIdsByCell.get(key);
    if (!ids) continue;
    for (const id of ids) addProjected(id);
  }
  actor.visibleCount = count;
  const snapshot = {
    ...mmoSegmentTopLevel(ctx.state, ctx.players.size),
    effects: selectTransientEffectsForViewer(ctx.state.effects, { x: actor.x, y: actor.y, radius: interestRadius, zoneId: actor.zoneId }, { maxEffects: 64 })
      .map((effect) => sanitizeEffectForReplication(effect)),
    entities,
    players,
    npcs,
    resources,
    loots,
    hazards
  };
  Object.defineProperty(snapshot, PREENCODED_SNAPSHOT_BYTES, {
    enumerable: false,
    value: buildCoarseSnapshotCellBytes(ctx, runtime, player, actor)
  });
  return snapshot;
}

function buildCoarseSnapshotCellBytes(ctx: RoomContext<MmoSkillDemoState, MmoSkillDemoInput>, runtime: ZoneRuntime, player: AuthoritativePlayer, actor: PlayerEntity) {
  const cache = rebuildPublicCellSegments(runtime, ctx.state, ctx.players.size);
  const segments: ReplicationEnvelopeSegment<MmoSkillDemoSegmentKind>[] = [];
  const cellKeys = mmoSkillDemoNeighborCellKeys(actor.x, actor.y);
  for (const key of cellKeys) {
    const volatileBytes = cache.volatileBuffersByCell.get(key);
    if (volatileBytes) segments.push({ id: `cell:${key}:volatile`, kind: "world-cell-volatile", bytes: volatileBytes });
    const record = cache.staticRecordsByCell.get(key);
    if (record?.segment) segments.push(record.segment);
  }
  const actorForViewer = sanitizeEntityForReplication(projectMmoEntityForViewer(actor, player.id) ?? actor);
  segments.push(encodeMmoSkillDemoSegment("private-volatile", `private:${player.id}:volatile`, createMmoSkillDemoSegmentState(cache.top, {
    [actorForViewer.id]: toMmoSkillDemoVolatileSegmentEntity(actorForViewer)
  })));
  return encodeMultipartReplicationEnvelope({ sequence: 0, baseline: 0, segments });
}

function staticDiscoveryTelemetry(runtime: ZoneRuntime, tick: number): StaticDiscoveryTelemetry {
  const queueDepthByClient: Record<string, number> = {};
  let queueDepth = 0;
  let maxBacklogAge = 0;
  for (const [playerId, queue] of runtime.staticDiscoveryQueueByPlayer) {
    queueDepthByClient[playerId] = queue.length;
    queueDepth += queue.length;
    for (const item of queue) maxBacklogAge = Math.max(maxBacklogAge, tick - item.enqueuedTick);
  }
  const avgTTD = runtime.staticTtdSamples.length
    ? runtime.staticTtdSamples.reduce((sum, value) => sum + value, 0) / runtime.staticTtdSamples.length
    : 0;
  return {
    queueDepthByClient,
    queueDepth,
    maxBacklogAge,
    avgTTD,
    samples: runtime.staticTtdSamples.length,
    maxStaticRecordsPerTick: STATIC_DISCOVERY_RECORDS_PER_TICK,
    adaptiveRecommended: queueDepth > 50 || maxBacklogAge > 20
  };
}

function mmoSkillDemoRoomTelemetry(ctx: RoomContext<MmoSkillDemoState, MmoSkillDemoInput>, runtime: ZoneRuntime) {
  const discovery = staticDiscoveryTelemetry(runtime, ctx.state.tick);
  const maxClientQueueDepth = Object.values(discovery.queueDepthByClient).reduce((max, value) => Math.max(max, value), 0);
  const warnings: string[] = [];
  if (maxClientQueueDepth > 50 || discovery.maxBacklogAge > 20) warnings.push("Congestion");
  return {
    replication: {
      discovery: {
        ...discovery,
        maxClientQueueDepth
      },
      adaptive: {
        reduceStaticRecordsHookAvailable: true,
        discoveryBacklogRecommended: discovery.adaptiveRecommended,
        staticDeferral: runtime.replicationAdaptive,
        reason: runtime.replicationAdaptive?.reason || (discovery.adaptiveRecommended ? "Static discovery backlog is above target" : "")
      }
    },
    warnings
  };
}

function buildMmoSkillDemoSnapshotForPlayer(ctx: RoomContext<MmoSkillDemoState, MmoSkillDemoInput>, runtime: ZoneRuntime, player: AuthoritativePlayer) {
  const actor = ctx.state.players[player.id];
  if (!actor) return sanitizeMmoReplicationSnapshot(ctx.state);
  const interestRadius = ctx.state.roomKind === "dungeon-instance" ? (actor.activeAbility === "space-rush" ? 1100 : 820) : actor.activeAbility === "space-rush" ? 1100 : 720;
  if (MMO_SKILL_DEMO_COARSE_SNAPSHOT_AOI_ENABLED) return buildCoarseSnapshotForPlayer(ctx, runtime, player, actor, interestRadius);
  const visibility = runtime.grid.computeVisibility(player.id, {
    x: actor.x,
    y: actor.y,
    radius: interestRadius
  });
  const visible = selectVisibleEntityBuckets<MmoSkillDemoEntity, MmoSkillDemoEntityKind>({
    source: ctx.state.entities,
    ids: visibility.visible,
    includeIds: [player.id],
    bucketNames: MMO_SKILL_DEMO_ENTITY_BUCKETS,
    bucketFor: (entity) => entity.entityType,
    project: (entity) => projectMmoEntityForViewer(entity, player.id)
  });
  actor.visibleCount = visible.count;
  return sanitizeMmoReplicationSnapshot({
    ...mmoSegmentTopLevel(ctx.state, ctx.players.size),
    effects: selectTransientEffectsForViewer(ctx.state.effects, { x: actor.x, y: actor.y, radius: interestRadius, zoneId: actor.zoneId }, { maxEffects: 64 }),
    entities: visible.entities,
    players: (visible.buckets.player ?? {}) as Record<string, PlayerEntity>,
    npcs: (visible.buckets.npc ?? {}) as Record<string, NpcEntity>,
    resources: (visible.buckets.resource ?? {}) as Record<string, ResourceEntity>,
    loots: (visible.buckets.loot ?? {}) as Record<string, LootEntity>,
    hazards: (visible.buckets.hazard ?? {}) as Record<string, HazardEntity>
  });
}

function buildMmoSkillDemoMultipartReplication(
  ctx: RoomContext<MmoSkillDemoState, MmoSkillDemoInput>,
  runtime: ZoneRuntime,
  player: AuthoritativePlayer,
  request: RoomReplicationRequest<MmoSkillDemoState>
) {
  const actor = ctx.state.players[player.id];
  if (!actor) return buildMmoSkillDemoSnapshotForPlayer(ctx, runtime, player);
  const cache = rebuildPublicCellSegments(runtime, ctx.state, ctx.players.size, request.kind === "snapshot");
  const cellKeys = mmoSkillDemoNeighborCellKeys(actor.x, actor.y);
  const trackVolatileCells = MMO_SKILL_DEMO_SHARED_DIRTY_SLAB_ENABLED;
  let previousVolatileCells: Set<string> | undefined;
  if (trackVolatileCells) {
    previousVolatileCells = runtime.volatileCellsByPlayer.get(player.id);
    if (!previousVolatileCells) {
      previousVolatileCells = new Set();
      runtime.volatileCellsByPlayer.set(player.id, previousVolatileCells);
    }
  }
  const cellKeySet = new Set(cellKeys);
  const segments: ReplicationEnvelopeSegment<MmoSkillDemoSegmentKind>[] = [];
  const privateVolatile: Record<string, ReturnType<typeof toMmoSkillDemoVolatileSegmentEntity>> = {};
  const recordsByEntity = new Map<string, PublicStaticRecord>();
  const publicStaticRecords: PublicStaticRecord[] = [];
  const privateStaticRecords: PublicStaticRecord[] = [];
  const interestRadius = ctx.state.roomKind === "dungeon-instance" ? (actor.activeAbility === "space-rush" ? 1100 : 820) : actor.activeAbility === "space-rush" ? 1100 : 720;

  for (const key of cellKeys) {
    const needsFullVolatile = trackVolatileCells && (request.kind === "snapshot" || !previousVolatileCells?.has(key));
    const volatileBytes = needsFullVolatile && !cache.fullVolatile ? fullVolatileBytesForCell(cache, key) : cache.volatileBuffersByCell.get(key);
    if (volatileBytes) segments.push({ id: `cell:${key}:volatile`, kind: "world-cell-volatile", bytes: volatileBytes });
    const entityIds = cache.publicEntityIdsByCell.get(key);
    if (!entityIds) continue;
    const record = cache.staticRecordsByCell.get(key);
    if (record) {
      publicStaticRecords.push(record);
      recordsByEntity.set(record.entityId, record);
    }
    for (const entityId of entityIds) {
      if (entityId === player.id || cache.entityTypeById.get(entityId) !== "player") continue;
      const playerRecord = cache.staticRecordsByEntity.get(entityId);
      if (playerRecord) {
        publicStaticRecords.push(playerRecord);
        recordsByEntity.set(playerRecord.entityId, playerRecord);
      }
    }
  }
  if (previousVolatileCells) {
    previousVolatileCells.clear();
    for (const key of cellKeys) previousVolatileCells.add(key);
  }

  const actorForViewer = sanitizeEntityForReplication(projectMmoEntityForViewer(actor, player.id) ?? actor);
  actorForViewer.visibleCount = cellKeys.reduce((count, key) => count + (cache.publicEntityIdsByCell.get(key)?.length ?? 0), 0);
  privateVolatile[actorForViewer.id] = toMmoSkillDemoVolatileSegmentEntity(actorForViewer);
  privateStaticRecords.push(createPrivateStaticRecord(actorForViewer));

  for (const entity of entitiesOfType<LootEntity>(ctx.state, "loot")) {
    if (entity.entityType !== "loot" || entity.ownerId !== player.id || !cellKeySet.has(entitySegmentCellKey(entity))) continue;
    const projected = sanitizeEntityForReplication(entity);
    privateVolatile[projected.id] = toMmoSkillDemoVolatileSegmentEntity(projected);
    privateStaticRecords.push(createPrivateStaticRecord(projected));
  }

  segments.push(encodeMmoSkillDemoSegment("private-volatile", `private:${player.id}:volatile`, createMmoSkillDemoSegmentState(cache.top, privateVolatile)));
  for (const record of privateStaticRecords) {
    runtime.staticSignatureBySegmentId.set(record.segmentId, record.signature);
    recordsByEntity.set(record.entityId, record);
  }
  enqueueStaticDiscovery(runtime, player.id, privateStaticRecords, request.now, ctx.state.tick);
  enqueueStaticDiscovery(runtime, player.id, publicStaticRecords, request.now, ctx.state.tick);

  const effects = selectTransientEffectsForViewer(ctx.state.effects, { x: actor.x, y: actor.y, radius: interestRadius, zoneId: actor.zoneId }, { maxEffects: 64 })
    .map((effect) => sanitizeEffectForReplication(effect));
  segments.push(encodeMmoSkillDemoSegment("transient", `transient:${ctx.state.tick}`, createMmoSkillDemoSegmentState(cache.top, {}, effects)));
  const staticSegments = drainStaticDiscovery(runtime, player.id, recordsByEntity, cache.staticRecordsByEntity, cache.top, request.now, ctx.state.tick);
  segments.push(...staticSegments);
  pushFullVolatileRefreshForStaticSegments(segments, cache, staticSegments);

  return {
    state: ctx.state,
    segments
  };
}

function createMmoSkillDemoRoomType(options: { name: string; maxPlayers: number; replication?: RoomReplicationOptions }) {
  return createRoomType<MmoSkillDemoState, MmoSkillDemoInput>({
    name: options.name,
    schema: mmoSkillDemoSchema,
    maxPlayers: options.maxPlayers,
    replication: options.replication,
    idleDisposeMs: 60000,
    createState: (ctx) => createMmoSkillDemoState(ctx.roomId),
    onJoin(ctx, player) {
      const runtime = ensureRuntime(ctx.roomId);
      const actor = mmoSkillDemoSharedHotPoolForState(ctx.state).withTick(() => {
        ctx.state.players[player.id] = createPlayer(
          player.id,
          player.userId,
          savedCharacterForUser(player.userId),
          ctx.state.roomKind as RoomKind,
          ctx.roomId
        );
        ctx.state.activePlayers = ctx.players.size;
        syncMmoEntityRegistry(ctx.state);
        return ctx.state.players[player.id];
      });
      runtime.inputs.set(player.id, { dx: 0, dy: 0, action: "idle", targetId: "", aimX: actor.x, aimY: actor.y, itemId: "", devField: "", devValue: 0, devText: "" });
    },
    onLeave(ctx, player) {
      const runtime = ensureRuntime(ctx.roomId);
      const active = ctx.state.players[player.id];
      if (active) {
        saveCharacterForUser(player.userId, active, {
          preserveWorldPosition: ctx.state.roomKind === "dungeon-instance" || ctx.state.roomKind === "cottage-instance",
          fallbackWorldPosition: defaultWorldPosition(player.id)
        });
      }
      mmoSkillDemoSharedHotPoolForState(ctx.state).withTick(() => {
        delete ctx.state.players[player.id];
        ctx.state.activePlayers = ctx.players.size;
        syncMmoEntityRegistry(ctx.state);
      });
      runtime.inputs.delete(player.id);
      runtime.grid.remove(player.id);
      runtime.logicHash.remove(player.id);
      runtime.interestCache.delete(player.id);
      runtime.grid.clearClient(player.id);
      runtime.staticEntitiesByPlayer.delete(player.id);
      runtime.staticDiscoveryQueueByPlayer.delete(player.id);
      runtime.staticAcksByPlayer.delete(player.id);
    },
    onInput(ctx, player, input) {
      const runtime = ensureRuntime(ctx.roomId);
      runtime.inputs.set(player.id, {
        dx: normalizeAxis(input.dx),
        dy: normalizeAxis(input.dy),
        action: validAction(input.action),
        targetId: typeof input.targetId === "string" ? input.targetId.slice(0, 32) : "",
        aimX: normalizeWorldCoord(input.aimX, ctx.state.players[player.id]?.x ?? 0, mmoSkillDemoMap.pixelWidth),
        aimY: normalizeWorldCoord(input.aimY, ctx.state.players[player.id]?.y ?? 0, mmoSkillDemoMap.pixelHeight),
        itemId: cleanItemId(input.itemId),
        devField: cleanInputText(input.devField, 32),
        devValue: Number.isFinite(input.devValue) ? Number(input.devValue) : 0,
        devText: cleanInputText(input.devText, 192)
      });
    },
    async update(ctx, dt) {
      const runtime = ensureRuntime(ctx.roomId);
      const kernel = await runtime.kernel;
      mmoSkillDemoSharedHotPoolForState(ctx.state).withTick(() => {
        ctx.state.tick += 1;
        ctx.state.activePlayers = ctx.players.size;
        for (const player of entitiesOfType<PlayerEntity>(ctx.state, "player")) {
          const input = runtime.inputs.get(player.id) ?? { dx: 0, dy: 0, action: "idle", targetId: "", aimX: player.x, aimY: player.y, itemId: "", devField: "", devValue: 0, devText: "" };
          decayPlayerCooldowns(player, dt);
          applyMovement(ctx.state, kernel, player, input, dt);
          applyPlayerAction(ctx.state, kernel, player, input);
        }
        updateGatheringInteractions(ctx.state, dt);
        upsertInterestEntities(runtime, ctx.state);
        updateNpcs(ctx.state, runtime, kernel, dt);
        updateHazards(ctx.state, kernel, dt);
        updateTransientEffects(ctx.state.effects, dt);
        updateResources(ctx.state, dt);
        updateLoots(ctx.state, dt);
        updatePlayerProgression(ctx.state, dt);
        for (const player of entitiesOfType<PlayerEntity>(ctx.state, "player")) recordRewindSample(player, dt);
        updateWorldEvent(ctx.state, dt);
        upsertInterestEntities(runtime, ctx.state);
        syncMmoEntityRegistry(ctx.state);
        flushMmoEntityPools();
      });
    },
    getInterestTarget(ctx, player) {
      const fallback = getMmoSkillDemoAnchorTile("aetheria");
      const actor = ctx.state.players[player.id] ?? tileToWorld(mmoSkillDemoMap, fallback.x, fallback.y, "center");
      const rushing = "activeAbility" in actor && actor.activeAbility === "space-rush";
      return { x: actor.x, y: actor.y, radius: ctx.state.roomKind === "dungeon-instance" ? (rushing ? 1100 : 820) : rushing ? 1100 : 720 };
    },
    getSnapshot(ctx, player) {
      const runtime = ensureRuntime(ctx.roomId);
      return buildMmoSkillDemoSnapshotForPlayer(ctx, runtime, player);
    },
    getReplication(ctx, player, request) {
      const runtime = ensureRuntime(ctx.roomId);
      return buildMmoSkillDemoMultipartReplication(ctx, runtime, player, request);
    },
    onReplicationSent(ctx, player, receipt) {
      markStaticSegmentsSent(ensureRuntime(ctx.roomId), player.id, receipt.sequence, receipt.segments, receipt.now);
    },
    onReplicationAck(ctx, player, sequence) {
      markStaticSegmentsAcked(ensureRuntime(ctx.roomId), player.id, sequence);
    },
    onReplicationTelemetry(ctx, telemetry) {
      ensureRuntime(ctx.roomId).replicationAdaptive = telemetry.adaptive;
    },
    getRoomTelemetry(ctx) {
      return mmoSkillDemoRoomTelemetry(ctx, ensureRuntime(ctx.roomId));
    }
  });
}

export const mmoSkillDemoZone = createMmoSkillDemoRoomType({
  name: "mmo-skill-demo",
  maxPlayers: 100,
  replication: { snapshotRate: 1, deltaRate: 10 }
});
export const mmoSkillDemoDungeon = createMmoSkillDemoRoomType({
  name: "mmo-skill-demo-dungeon",
  maxPlayers: 20,
  replication: { snapshotRate: 1, deltaRate: 6, maxBytesPerClientPerSecond: 32 * 1024 }
});
export const mmoSkillDemoCottage = createMmoSkillDemoRoomType({
  name: "mmo-skill-demo-cottage",
  maxPlayers: 8,
  replication: { snapshotRate: 1, deltaRate: 10 }
});
