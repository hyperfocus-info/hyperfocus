import { type MmoImpactType, type MmoPersonality } from "./data/bestiary.ts";
import { type WorldGatherableNodeKind } from "./data/world-gatherables.ts";
import { type CompactTransientEffect, type SharedCellReplicationEntity, type SharedCellReplicator, type SpatialHashEntity } from "@hyperfocus/engine/server";
import { type ReplicationEnvelopeSegment } from "@hyperfocus/engine/protocol";
import { type GatheringSkillId } from "./shared/skills.ts";
import { toMmoSkillDemoStaticSegmentEntity, type MmoSkillDemoSegmentKind } from "./segmented-replication.ts";

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

const MMO_SKILL_DEMO_ENTITY_BUCKETS = ["player", "npc", "resource", "loot", "hazard"] as const;

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

export {
  MMO_SKILL_DEMO_ENTITY_BUCKETS
};

export type {
  LogicSpatialEntity,
  MmoSegmentTopLevel,
  PlayerStaticEntityCursor,
  PublicCellSegmentCache,
  PublicStaticRecord,
  RuntimeInput,
  SnapshotCellCache,
  StaticAckRecord,
  StaticDiscoveryQueueItem,
  StaticDiscoveryTelemetry
};
