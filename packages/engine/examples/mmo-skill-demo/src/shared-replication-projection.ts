import { clampLowerFirst as clamp } from "@hyperfocus/utilities/math";

import { isRecord as isUnknownRecord } from "@hyperfocus/utilities/records";
import { getMmoSkillDemoAnchorTile, zoneForMmoSkillDemoTile } from "./data/world.ts";
import { type CompactTransientEffect } from "@hyperfocus/engine/server";
import { type MmoSkillDemoEntity, type MmoSkillDemoState, type NpcEntity, type PlayerEntity, type ZoneId } from "./shared-contracts.ts";
import { attachMmoEntityViews } from "./shared-entity-registry.ts";
import { u16Ms, validAction } from "./shared-replication-values.ts";
import { TILE } from "./shared-world-catalog.ts";



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



function isNumberRecord(value: Record<string, unknown>): value is Record<string, number> {
  return Object.values(value).every((entry) => typeof entry === "number");
}

function sanitizeU16Map(value: unknown) {
  if (!isUnknownRecord(value)) return {};
  const source = value;
  let next: Record<string, number> | undefined;
  for (const [key, raw] of Object.entries(source)) {
    const sanitized = u16Ms(typeof raw === "number" ? raw : 0);
    if (sanitized !== raw) {
      next ??= Object.fromEntries(Object.entries(source).map(([entryKey, entryValue]) => [entryKey, typeof entryValue === "number" ? entryValue : 0]));
      next[key] = sanitized;
    }
  }
  if (next) return next;
  return isNumberRecord(source) ? source : {};
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
  let next: T | undefined;
  const set = (key: string, value: unknown) => {
    next ??= { ...entity };
    Reflect.set(next, key, value);
  };
  for (const key of REPLICATED_U16_ENTITY_FIELDS) {
    if (!(key in entity)) continue;
    const value = Reflect.get(entity, key);
    const sanitized = u16Ms(typeof value === "number" ? value : 0);
    if (sanitized !== value) set(key, sanitized);
  }
  for (const key of REPLICATED_U32_ENTITY_FIELDS) {
    if (!(key in entity)) continue;
    const value = Reflect.get(entity, key);
    const sanitized = u32Value(value);
    if (sanitized !== value) set(key, sanitized);
  }
  for (const key of REPLICATED_U16_MAP_FIELDS) {
    if (!(key in entity)) continue;
    const value = Reflect.get(entity, key);
    const sanitized = sanitizeU16Map(value);
    if (sanitized !== value) set(key, sanitized);
  }
  return next ?? entity;
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

const EMPTY_NUMBER_MAP = Object.freeze<Record<string, number>>({});

const EMPTY_STRING_MAP = Object.freeze<Record<string, string>>({});

const EMPTY_BOOLEAN_MAP = Object.freeze<Record<string, boolean>>({});

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
  return zoneForMmoSkillDemoTile(tx, ty);
}

function zoneForPoint(x: number, y: number): ZoneId {
  return zoneSchemaAlias(logicalZoneForPoint(x, y));
}

export {
  EMPTY_BOOLEAN_MAP,
  EMPTY_NUMBER_MAP,
  EMPTY_STRING_MAP,
  REPLICATED_U16_ENTITY_FIELDS,
  REPLICATED_U16_MAP_FIELDS,
  REPLICATED_U32_ENTITY_FIELDS,
  clamp,
  cleanInputText,
  cleanItemId,
  elapsedReplicationMs,
  expandedZoneForTile,
  extendU16Ms,
  logicalZoneForPoint,
  normalizeAxis,
  normalizeWorldCoord,
  projectMmoEntityForViewer,
  projectNpcForReplication,
  projectRemotePlayerForReplication,
  remainingReplicationMs,
  remainingReplicationMs32,
  sanitizeEffectForReplication,
  sanitizeEntityForReplication,
  sanitizeMmoReplicationSnapshot,
  sanitizeU16Map,
  u16Ms,
  u32Ms,
  u32Value,
  validAction,
  zoneForPoint,
  zoneSchemaAlias
};
