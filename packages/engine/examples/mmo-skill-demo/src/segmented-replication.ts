import { asObject as asRecordMap } from "@hyperfocus/utilities/records";
import {
  createBinaryReader,
  createBinaryWriter,
  decodeSnapshot,
  defineSchema,
  encodeSnapshot,
  type ReplicationEnvelopeSegment
} from "@hyperfocus/engine/protocol";
import { transientEffectSchemaFields, type CompactTransientEffect } from "@hyperfocus/engine/server";
import {
  MMO_SKILL_DEMO_SHARED_HOT_BYTE_SIZE,
  MMO_SKILL_DEMO_SHARED_HOT_DIRTY_POSITION,
  MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE,
  MMO_SKILL_DEMO_SHARED_HOT_OFFSETS
} from "./shared-hot.ts";
import {
  commonSegmentFields,
  staticEntityFields,
  volatileEntityFields
} from "./segmented-replication-fields.ts";
import {
  type MmoSkillDemoEntity,
  type MmoSkillDemoState
} from "./shared-contracts.ts";
import {
  ACTION_BY_CODE,
  ACTION_CODES,
  combatFlagsFromMmoStatusMask,
  COMBAT_STATE_BY_CODE,
  ENTITY_TYPE_BY_CODE,
  ENTITY_TYPE_CODES,
  enumCode,
  mmoSkillDemoEntityTypeCode,
  SLOT_BY_CODE,
  SLOT_CODES,
  validAction,
  validZoneId,
  ZONE_BY_CODE,
  ZONE_CODES
} from "./shared/segmented-replication-values.ts";
export {
  mmoSkillDemoActionCode,
  mmoSkillDemoCombatStateCode,
  mmoSkillDemoEntityTypeCode,
  mmoSkillDemoStatusMask
} from "./shared/segmented-replication-values.ts";

export const MMO_SKILL_DEMO_SEGMENT_CELL_SIZE = 384;

export type MmoSkillDemoSegmentKind =
  | "world-cell-volatile"
  | "world-cell-static"
  | "private-volatile"
  | "private-static"
  | "transient";

type SegmentTopLevel = Omit<MmoSkillDemoState, "entities" | "players" | "npcs" | "resources" | "loots" | "hazards" | "effects">;

type SegmentEntity = {
  id: string;
  entityType: MmoSkillDemoEntity["entityType"];
};

type SegmentState = Partial<SegmentTopLevel> & {
  effects?: CompactTransientEffect[];
  entities?: Record<string, SegmentEntity>;
};

const volatileSegmentSchema = defineSchema<SegmentState>({
  ...commonSegmentFields,
  entities: {
    type: "map",
    key: "string",
    maxEntries: 160,
    value: { type: "entity", fields: volatileEntityFields }
  }
});

const staticSegmentSchema = defineSchema<SegmentState>({
  ...commonSegmentFields,
  entities: {
    type: "map",
    key: "string",
    maxEntries: 160,
    value: { type: "entity", fields: staticEntityFields }
  }
});

const transientSegmentSchema = defineSchema<SegmentState>({
  ...commonSegmentFields,
  effects: {
    type: "array",
    item: { type: "entity", fields: transientEffectSchemaFields },
    maxLength: 128
  }
});

const VOLATILE_KEYS = Object.keys(volatileEntityFields);
const STATIC_KEYS = Object.keys(staticEntityFields);

const DECODED_STATES = new WeakMap<object, { state: MmoSkillDemoState; staticCache: Record<string, SegmentEntity> }>();

type PackedVolatileFieldType = "u16" | "u32" | "f32" | "bool" | "string" | "zone" | "action" | "slot" | "idref";

type PackedVolatileField = {
  key: string;
  type: PackedVolatileFieldType;
};

const PACKED_VOLATILE_FIELDS: readonly PackedVolatileField[] = [
  { key: "zoneId", type: "zone" },
  { key: "x", type: "f32" },
  { key: "y", type: "f32" },
  { key: "hp", type: "u16" },
  { key: "maxHp", type: "u16" },
  { key: "mana", type: "u16" },
  { key: "maxMana", type: "u16" },
  { key: "energy", type: "u16" },
  { key: "maxEnergy", type: "u16" },
  { key: "action", type: "action" },
  { key: "targetId", type: "idref" },
  { key: "aimX", type: "f32" },
  { key: "aimY", type: "f32" },
  { key: "guardMs", type: "u16" },
  { key: "berserkMs", type: "u16" },
  { key: "cooldownMs", type: "u16" },
  { key: "activeAbility", type: "string" },
  { key: "activeSlot", type: "slot" },
  { key: "activeMs", type: "u16" },
  { key: "activeDurationMs", type: "u16" },
  { key: "chargeMs", type: "u16" },
  { key: "rushDistance", type: "u16" },
  { key: "abilityVectorX", type: "f32" },
  { key: "abilityVectorY", type: "f32" },
  { key: "abilityTickMs", type: "u16" },
  { key: "abilityHits", type: "string" },
  { key: "knockbackX", type: "f32" },
  { key: "knockbackY", type: "f32" },
  { key: "knockbackMs", type: "u16" },
  { key: "knockbackHeavy", type: "bool" },
  { key: "stunMs", type: "u16" },
  { key: "slowMs", type: "u16" },
  { key: "iframeMs", type: "u16" },
  { key: "castMs", type: "u16" },
  { key: "damageAmpMs", type: "u16" },
  { key: "combatState", type: "string" },
  { key: "combatFlags", type: "string" },
  { key: "lastAttackStyle", type: "string" },
  { key: "visibleCount", type: "u16" },
  { key: "respawnMs", type: "u32" },
  { key: "attackCooldownMs", type: "u16" },
  { key: "projectileCooldownMs", type: "u16" },
  { key: "phaseMs", type: "u16" },
  { key: "summonedBy", type: "idref" },
  { key: "depleted", type: "bool" },
  { key: "amount", type: "u16" },
  { key: "ownerId", type: "idref" },
  { key: "expiresMs", type: "u16" },
  { key: "pickupRadius", type: "u16" },
  { key: "toX", type: "f32" },
  { key: "toY", type: "f32" },
  { key: "radius", type: "u16" },
  { key: "windupMs", type: "u16" },
  { key: "lifetimeMs", type: "u16" },
  { key: "damage", type: "u16" },
  { key: "isHeavyImpact", type: "bool" },
  { key: "armorPierce", type: "bool" },
  { key: "effectKind", type: "string" },
  { key: "text", type: "string" },
  { key: "pulse", type: "u16" }
] as const;

function u16(value: unknown) {
  return Math.max(0, Math.min(0xffff, Math.floor(typeof value === "number" && Number.isFinite(value) ? value : 0)));
}

function u32(value: unknown) {
  return Math.max(0, Math.min(0xffffffff, Math.floor(typeof value === "number" && Number.isFinite(value) ? value : 0)));
}

function f32(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function mmoSkillDemoEntityIdCode(id: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const mmoEntityIdCode = mmoSkillDemoEntityIdCode;

function fieldShouldPack(field: PackedVolatileField, value: unknown) {
  if (value === undefined || value === null) return false;
  if (field.type === "string" || field.type === "idref") return typeof value === "string" && value.length > 0;
  if (field.type === "zone") return enumCode(ZONE_CODES, value) > 0;
  if (field.type === "action") return enumCode(ACTION_CODES, value) > 0;
  if (field.type === "slot") return enumCode(SLOT_CODES, value) > 0;
  if (field.type === "bool") return value === true;
  return true;
}

function maskHas(maskLo: number, maskHi: number, index: number) {
  return index < 32 ? (maskLo & (1 << index)) !== 0 : (maskHi & (1 << (index - 32))) !== 0;
}

function maskHas3(mask0: number, mask1: number, mask2: number, index: number) {
  if (index < 32) return (mask0 & (1 << index)) !== 0;
  if (index < 64) return (mask1 & (1 << (index - 32))) !== 0;
  return (mask2 & (1 << (index - 64))) !== 0;
}

function writePackedField(writer: ReturnType<typeof createBinaryWriter>, field: PackedVolatileField, value: unknown) {
  if (field.type === "u16") writer.writeU16(u16(value));
  else if (field.type === "u32") writer.writeU32(u32(value));
  else if (field.type === "f32") writer.writeF32(f32(value));
  else if (field.type === "bool") writer.writeU8(value === true ? 1 : 0);
  else if (field.type === "string") writer.writeStringU8(String(value ?? ""));
  else if (field.type === "zone") writer.writeU8(enumCode(ZONE_CODES, value));
  else if (field.type === "action") writer.writeU8(enumCode(ACTION_CODES, value));
  else if (field.type === "slot") writer.writeU8(enumCode(SLOT_CODES, value));
  else writer.writeU32(typeof value === "string" ? mmoEntityIdCode(value) : 0);
}

function readPackedField(reader: ReturnType<typeof createBinaryReader>, field: PackedVolatileField, idByCode: Map<number, string>) {
  if (field.type === "u16") return reader.readU16();
  if (field.type === "u32") return reader.readU32();
  if (field.type === "f32") return reader.readF32();
  if (field.type === "bool") return reader.readU8() === 1;
  if (field.type === "string") return reader.readStringU8();
  if (field.type === "zone") return ZONE_BY_CODE.get(reader.readU8()) ?? "";
  if (field.type === "action") return ACTION_BY_CODE.get(reader.readU8()) ?? "idle";
  if (field.type === "slot") return SLOT_BY_CODE.get(reader.readU8()) ?? "";
  return idByCode.get(reader.readU32()) ?? "";
}

function writeVolatileTop(writer: ReturnType<typeof createBinaryWriter>, state: SegmentState) {
  writer.writeU32(u32(state.tick));
  writer.writeU16(u16(state.activePlayers));
  writer.writeU16(u16(state.worldEventProgress));
  writer.writeU16(u16(state.worldEventGoal));
  writer.writeU32(u32(state.worldEventTimerMs));
}

function readVolatileTop(reader: ReturnType<typeof createBinaryReader>): Partial<SegmentTopLevel> {
  return {
    tick: reader.readU32(),
    activePlayers: reader.readU16(),
    worldEventProgress: reader.readU16(),
    worldEventGoal: reader.readU16(),
    worldEventTimerMs: reader.readU32()
  };
}

function encodePackedVolatileSegment(state: SegmentState) {
  const entities = Object.entries(state.entities ?? {}).map(([, entity]) => entity);
  const writer = createBinaryWriter(16 + entities.length * 80);
  writeVolatileTop(writer, state);
  writer.writeU16(entities.length);
  for (const entity of entities) {
    writer.writeU32(mmoEntityIdCode(entity.id));
    writer.writeU8(ENTITY_TYPE_CODES[entity.entityType] ?? 0);
    let maskLo = 0;
    let maskHi = 0;
    for (let index = 0; index < PACKED_VOLATILE_FIELDS.length; index += 1) {
      const field = PACKED_VOLATILE_FIELDS[index];
      if (!fieldShouldPack(field, Reflect.get(entity, field.key))) continue;
      if (index < 32) maskLo |= 1 << index;
      else maskHi |= 1 << (index - 32);
    }
    writer.writeU32(maskLo >>> 0);
    writer.writeU32(maskHi >>> 0);
    for (let index = 0; index < PACKED_VOLATILE_FIELDS.length; index += 1) {
      if (maskHas(maskLo, maskHi, index)) writePackedField(writer, PACKED_VOLATILE_FIELDS[index], Reflect.get(entity, PACKED_VOLATILE_FIELDS[index].key));
    }
  }
  return writer.toUint8Array();
}

function decodePackedVolatileSegment(bytes: Uint8Array, idByCode: Map<number, string>) {
  const reader = createBinaryReader(bytes);
  const top = readVolatileTop(reader);
  const entities: Record<string, SegmentEntity> = {};
  const count = reader.readU16();
  for (let entityIndex = 0; entityIndex < count; entityIndex += 1) {
    const id = idByCode.get(reader.readU32());
    const entityType = ENTITY_TYPE_BY_CODE.get(reader.readU8());
    const maskLo = reader.readU32();
    const maskHi = reader.readU32();
    const entity: SegmentEntity | undefined = id && entityType ? { id, entityType } : undefined;
    for (let index = 0; index < PACKED_VOLATILE_FIELDS.length; index += 1) {
      if (!maskHas(maskLo, maskHi, index)) continue;
      const field = PACKED_VOLATILE_FIELDS[index];
      const value = readPackedField(reader, field, idByCode);
      if (entity) Reflect.set(entity, field.key, value);
    }
    if (entity) entities[entity.id] = entity;
  }
  if (reader.remaining !== 0) throw new Error("packed volatile segment has trailing bytes");
  return { top, entities };
}

const SHARED_CELL_SLAB_VERSION = 1;
const SHARED_CELL_DIRTY_SLAB_VERSION = 2;
const SHARED_CELL_SLAB_HEADER_BYTES = 8;
const SHARED_CELL_SLAB_RECORD_BYTES = 12;
const SHARED_CELL_DIRTY_SLAB_RECORD_BYTES = 16;

function readSlabF32(bytes: Uint8Array, offset: number, view: DataView) {
  const absoluteOffset = bytes.byteOffset + offset;
  if (absoluteOffset % Float32Array.BYTES_PER_ELEMENT === 0) return new Float32Array(bytes.buffer, absoluteOffset, 1)[0];
  return view.getFloat32(offset, true);
}

function sharedHotSlabInfo(bytes: Uint8Array) {
  if (bytes.byteLength < SHARED_CELL_SLAB_HEADER_BYTES || bytes[0] !== SHARED_CELL_SLAB_VERSION) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(2, true);
  const stride = view.getUint16(4, true);
  const headerBytes = view.getUint16(6, true);
  if (stride !== MMO_SKILL_DEMO_SHARED_HOT_BYTE_SIZE) return undefined;
  if (headerBytes !== SHARED_CELL_SLAB_HEADER_BYTES + count * SHARED_CELL_SLAB_RECORD_BYTES) return undefined;
  if (bytes.byteLength !== headerBytes + count * stride) return undefined;
  return { view, count, stride, headerBytes };
}

function sharedHotDirtySlabInfo(bytes: Uint8Array) {
  if (bytes.byteLength < SHARED_CELL_SLAB_HEADER_BYTES || bytes[0] !== SHARED_CELL_DIRTY_SLAB_VERSION) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(2, true);
  const stride = view.getUint16(4, true);
  const headerBytes = view.getUint16(6, true);
  if (stride !== MMO_SKILL_DEMO_SHARED_HOT_BYTE_SIZE) return undefined;
  if (headerBytes !== SHARED_CELL_SLAB_HEADER_BYTES + count * SHARED_CELL_DIRTY_SLAB_RECORD_BYTES) return undefined;
  if (bytes.byteLength < headerBytes) return undefined;
  return { view, count, stride, headerBytes };
}

function decodeSharedHotSlabVolatileSegment(bytes: Uint8Array, idByCode: Map<number, string>) {
  const info = sharedHotSlabInfo(bytes);
  if (!info) return undefined;
  const entities: Record<string, SegmentEntity> = {};
  for (let index = 0; index < info.count; index += 1) {
    const recordOffset = SHARED_CELL_SLAB_HEADER_BYTES + index * SHARED_CELL_SLAB_RECORD_BYTES;
    const id = idByCode.get(info.view.getUint32(recordOffset, true));
    const entityType = ENTITY_TYPE_BY_CODE.get(info.view.getUint8(recordOffset + 8));
    if (!id || !entityType) continue;
    const blobOffset = info.headerBytes + index * info.stride;
    const targetIdCode = info.view.getUint32(blobOffset + MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.targetId, true);
    const statusMask = info.view.getUint32(blobOffset + MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.statusMask, true);
    const entity = {
      id,
      entityType,
      x: readSlabF32(bytes, blobOffset + MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.x, info.view),
      y: readSlabF32(bytes, blobOffset + MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.y, info.view),
      hp: info.view.getUint16(blobOffset + MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.hp, true),
      targetId: targetIdCode === 0 ? "" : idByCode.get(targetIdCode) ?? "",
      action: ACTION_BY_CODE.get(info.view.getUint8(blobOffset + MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.action)) ?? "idle",
      combatState: COMBAT_STATE_BY_CODE.get(info.view.getUint8(blobOffset + MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.combatState)) ?? "",
      combatFlags: combatFlagsFromMmoStatusMask(statusMask),
      statusMask
    };
    entities[id] = entity;
  }
  return { top: {}, entities };
}

function decodeSharedHotDirtySlabVolatileSegment(bytes: Uint8Array, idByCode: Map<number, string>) {
  const info = sharedHotDirtySlabInfo(bytes);
  if (!info) return undefined;
  const entities: Record<string, SegmentEntity> = {};
  for (let index = 0; index < info.count; index += 1) {
    const recordOffset = SHARED_CELL_SLAB_HEADER_BYTES + index * SHARED_CELL_DIRTY_SLAB_RECORD_BYTES;
    const id = idByCode.get(info.view.getUint32(recordOffset, true));
    const entityType = ENTITY_TYPE_BY_CODE.get(info.view.getUint8(recordOffset + 8));
    if (!id || !entityType) continue;
    const dirtyMask = info.view.getUint8(recordOffset + 9);
    const payloadOffset = info.view.getUint16(recordOffset + 10, true);
    const payloadLength = info.view.getUint16(recordOffset + 12, true);
    if (payloadOffset + payloadLength > bytes.byteLength) return undefined;
    let offset = payloadOffset;
    const entity: SegmentEntity = { id, entityType };
    if ((dirtyMask & MMO_SKILL_DEMO_SHARED_HOT_DIRTY_POSITION) !== 0) {
      Reflect.set(entity, "x", readSlabF32(bytes, offset, info.view));
      offset += 4;
      Reflect.set(entity, "y", readSlabF32(bytes, offset, info.view));
      offset += 4;
    }
    if ((dirtyMask & MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE) !== 0) {
      Reflect.set(entity, "hp", info.view.getUint16(offset, true));
      offset += 2;
      const targetIdCode = info.view.getUint32(offset, true);
      offset += 4;
      Reflect.set(entity, "targetId", targetIdCode === 0 ? "" : idByCode.get(targetIdCode) ?? "");
      Reflect.set(entity, "action", ACTION_BY_CODE.get(info.view.getUint8(offset)) ?? "idle");
      offset += 1;
      Reflect.set(entity, "combatState", COMBAT_STATE_BY_CODE.get(info.view.getUint8(offset)) ?? "");
      offset += 1;
      const statusMask = info.view.getUint32(offset, true);
      offset += 4;
      Reflect.set(entity, "combatFlags", combatFlagsFromMmoStatusMask(statusMask));
      Reflect.set(entity, "statusMask", statusMask);
    }
    if (offset !== payloadOffset + payloadLength) return undefined;
    entities[id] = entity;
  }
  return { top: {}, entities };
}

const MMO_STATIC_STRING_TABLE = [
  "",
  "ashwood",
  "crags",
  "bazaar",
  "port-marrow",
  "dungeon",
  "cottage",
  "player",
  "npc",
  "resource",
  "loot",
  "hazard",
  "tree",
  "ore",
  "boss",
  "boss-node",
  "hostile",
  "civilian",
  "merchant",
  "trainer",
  "guard",
  "line",
  "aoe",
  "idle",
  "mace",
  "bow",
  "staff",
  "wand",
  "blade",
  "weapon",
  "helmet",
  "chest",
  "boots",
  "ring",
  "LMB",
  "RMB",
  "Space",
  "Q",
  "E",
  "R",
  "first-cut",
  "wolf-contract",
  "gold",
  "ash-log",
  "iron-ore",
  "glade-berries",
  "cinder-ale",
  "silk-thread",
  "mace-rank-1",
  "bow-rank-1",
  "staff-rank-1",
  "wand-rank-1",
  "blade-rank-1",
  "iron-eye-bat",
  "timberwolf",
  "alpha-timberwolf",
  "stone-crawler",
  "crag-gargoyle",
  "great-ash-lord",
  "rune-priest",
  "ember-acolyte",
  "veil-oracle",
  "mire-bomber",
  "crag-sapper",
  "player-decoy",
  "spore-pod",
  "glass-clone",
  "mirror-king",
  "iron-core-golem",
  "power-node"
] as const;

const STATIC_STRING_IDS = new Map<string, number>(MMO_STATIC_STRING_TABLE.map((value, index) => [value, index]));

type PackedStaticFieldType = "u16" | "u32" | "f32" | "bool" | "string" | "zone" | "number-map" | "string-map" | "bool-map";

type PackedStaticField = {
  key: string;
  type: PackedStaticFieldType;
};

const PACKED_STATIC_FIELDS: readonly PackedStaticField[] = [
  { key: "name", type: "string" },
  { key: "kind", type: "string" },
  { key: "skillId", type: "string" },
  { key: "materialId", type: "u16" },
  { key: "role", type: "string" },
  { key: "zoneId", type: "zone" },
  { key: "elite", type: "bool" },
  { key: "personality", type: "string" },
  { key: "impactType", type: "string" },
  { key: "spawnX", type: "f32" },
  { key: "spawnY", type: "f32" },
  { key: "maxHp", type: "u16" },
  { key: "maxMana", type: "u16" },
  { key: "maxEnergy", type: "u16" },
  { key: "combatXp", type: "u32" },
  { key: "combatLevel", type: "u16" },
  { key: "miningXp", type: "u32" },
  { key: "miningLevel", type: "u16" },
  { key: "woodcuttingXp", type: "u32" },
  { key: "woodcuttingLevel", type: "u16" },
  { key: "gold", type: "u32" },
  { key: "renown", type: "u32" },
  { key: "masteryRank", type: "u16" },
  { key: "contractId", type: "string" },
  { key: "contractKills", type: "u16" },
  { key: "contractStreak", type: "u16" },
  { key: "contractCooldownMs", type: "u32" },
  { key: "inventory", type: "number-map" },
  { key: "bank", type: "number-map" },
  { key: "equipment", type: "string-map" },
  { key: "abilitySlots", type: "string-map" },
  { key: "cooldowns", type: "number-map" },
  { key: "questFlags", type: "bool-map" },
  { key: "activeQuestId", type: "string" },
  { key: "dailyQuestDate", type: "string" },
  { key: "dailyQuestStep", type: "u16" },
  { key: "dailyQuestProgress", type: "u16" },
  { key: "dailyQuestCompleted", type: "bool" },
  { key: "dailyQuestResult", type: "string" },
  { key: "wolfKills", type: "u16" },
  { key: "batKills", type: "u16" },
  { key: "bazaarSurvivalMs", type: "u32" },
  { key: "dungeonBossKills", type: "u16" },
  { key: "homeZoneId", type: "zone" },
  { key: "escortNpcId", type: "string" },
  { key: "escortTargetX", type: "f32" },
  { key: "escortTargetY", type: "f32" },
  { key: "escortTargetZoneId", type: "zone" },
  { key: "escortMs", type: "u16" },
  { key: "instanceId", type: "string" },
  { key: "prestigeTitle", type: "string" },
  { key: "equippedWeaponId", type: "string" },
  { key: "knockbackModifier", type: "f32" },
  { key: "itemId", type: "string" },
  { key: "depleted", type: "bool" },
  { key: "amount", type: "u16" },
  { key: "ownerId", type: "string" },
  { key: "expiresMs", type: "u16" },
  { key: "pickupRadius", type: "u16" },
  { key: "toX", type: "f32" },
  { key: "toY", type: "f32" },
  { key: "radius", type: "u16" },
  { key: "windupMs", type: "u16" },
  { key: "lifetimeMs", type: "u16" },
  { key: "damage", type: "u16" },
  { key: "isHeavyImpact", type: "bool" },
  { key: "armorPierce", type: "bool" },
  { key: "effectKind", type: "string" },
  { key: "text", type: "string" },
  { key: "pulse", type: "u16" }
] as const;

function staticFieldShouldPack(field: PackedStaticField, value: unknown) {
  if (value === undefined || value === null) return false;
  if (field.type === "string") return typeof value === "string" && value.length > 0;
  if (field.type === "zone") return enumCode(ZONE_CODES, value) > 0;
  if (field.type === "bool") return value === true;
  if (field.type.endsWith("-map")) return typeof value === "object" && value !== null && Object.keys(value).length > 0;
  return true;
}

function writeInternedString(writer: ReturnType<typeof createBinaryWriter>, value: unknown) {
  const text = String(value ?? "");
  const id = STATIC_STRING_IDS.get(text) ?? 0;
  writer.writeU16(id);
  if (id === 0) writer.writeStringU8(text);
}

function readInternedString(reader: ReturnType<typeof createBinaryReader>) {
  const id = reader.readU16();
  if (id > 0) return MMO_STATIC_STRING_TABLE[id] ?? "";
  return reader.readStringU8();
}



function writeStaticMap(writer: ReturnType<typeof createBinaryWriter>, value: unknown, kind: "number" | "string" | "bool") {
  const record = asRecordMap(value);
  const keys = Object.keys(record);
  writer.writeU16(keys.length);
  for (const key of keys) {
    writeInternedString(writer, key);
    const entry = Reflect.get(record, key);
    if (kind === "number") writer.writeU16(u16(entry));
    else if (kind === "bool") writer.writeU8(entry === true ? 1 : 0);
    else writeInternedString(writer, entry);
  }
}

function readStaticMap(reader: ReturnType<typeof createBinaryReader>, kind: "number" | "string" | "bool") {
  const count = reader.readU16();
  const out: Record<string, number | string | boolean> = {};
  for (let i = 0; i < count; i += 1) {
    const key = readInternedString(reader);
    if (kind === "number") out[key] = reader.readU16();
    else if (kind === "bool") out[key] = reader.readU8() === 1;
    else out[key] = readInternedString(reader);
  }
  return out;
}

function writePackedStaticField(writer: ReturnType<typeof createBinaryWriter>, field: PackedStaticField, value: unknown) {
  if (field.type === "u16") writer.writeU16(u16(value));
  else if (field.type === "u32") writer.writeU32(u32(value));
  else if (field.type === "f32") writer.writeF32(f32(value));
  else if (field.type === "bool") writer.writeU8(value === true ? 1 : 0);
  else if (field.type === "zone") writer.writeU8(enumCode(ZONE_CODES, value));
  else if (field.type === "number-map") writeStaticMap(writer, value, "number");
  else if (field.type === "bool-map") writeStaticMap(writer, value, "bool");
  else if (field.type === "string-map") writeStaticMap(writer, value, "string");
  else writeInternedString(writer, value);
}

function readPackedStaticField(reader: ReturnType<typeof createBinaryReader>, field: PackedStaticField) {
  if (field.type === "u16") return reader.readU16();
  if (field.type === "u32") return reader.readU32();
  if (field.type === "f32") return reader.readF32();
  if (field.type === "bool") return reader.readU8() === 1;
  if (field.type === "zone") return ZONE_BY_CODE.get(reader.readU8()) ?? "";
  if (field.type === "number-map") return readStaticMap(reader, "number");
  if (field.type === "bool-map") return readStaticMap(reader, "bool");
  if (field.type === "string-map") return readStaticMap(reader, "string");
  return readInternedString(reader);
}

function encodePackedStaticSegment(state: SegmentState) {
  const entities = Object.entries(state.entities ?? {}).map(([, entity]) => entity);
  const writer = createBinaryWriter(16 + entities.length * 160);
  writeVolatileTop(writer, state);
  writer.writeU16(entities.length);
  for (const entity of entities) {
    writer.writeStringU8(entity.id);
    writer.writeU8(ENTITY_TYPE_CODES[entity.entityType] ?? 0);
    let mask0 = 0;
    let mask1 = 0;
    let mask2 = 0;
    for (let index = 0; index < PACKED_STATIC_FIELDS.length; index += 1) {
      const field = PACKED_STATIC_FIELDS[index];
      if (!staticFieldShouldPack(field, Reflect.get(entity, field.key))) continue;
      if (index < 32) mask0 |= 1 << index;
      else if (index < 64) mask1 |= 1 << (index - 32);
      else mask2 |= 1 << (index - 64);
    }
    writer.writeU32(mask0 >>> 0);
    writer.writeU32(mask1 >>> 0);
    writer.writeU32(mask2 >>> 0);
    for (let index = 0; index < PACKED_STATIC_FIELDS.length; index += 1) {
      if (maskHas3(mask0, mask1, mask2, index)) writePackedStaticField(writer, PACKED_STATIC_FIELDS[index], Reflect.get(entity, PACKED_STATIC_FIELDS[index].key));
    }
  }
  return writer.toUint8Array();
}

function decodePackedStaticSegment(bytes: Uint8Array): SegmentState {
  const reader = createBinaryReader(bytes);
  const top = readVolatileTop(reader);
  const entities: Record<string, SegmentEntity> = {};
  const count = reader.readU16();
  for (let entityIndex = 0; entityIndex < count; entityIndex += 1) {
    const id = reader.readStringU8();
    const entityType = ENTITY_TYPE_BY_CODE.get(reader.readU8());
    const mask0 = reader.readU32();
    const mask1 = reader.readU32();
    const mask2 = reader.readU32();
    const entity: SegmentEntity | undefined = entityType ? { id, entityType } : undefined;
    for (let index = 0; index < PACKED_STATIC_FIELDS.length; index += 1) {
      if (!maskHas3(mask0, mask1, mask2, index)) continue;
      const field = PACKED_STATIC_FIELDS[index];
      const value = readPackedStaticField(reader, field);
      if (entity) Reflect.set(entity, field.key, value);
    }
    if (entity) entities[id] = entity;
  }
  if (reader.remaining !== 0) throw new Error("packed static segment has trailing bytes");
  return { ...top, entities };
}

function pickEntityFields(entity: MmoSkillDemoEntity, keys: string[]) {
  const out: SegmentEntity = { id: entity.id, entityType: entity.entityType };
  for (const key of keys) {
    const value = Reflect.get(entity, key);
    if (value !== undefined) Reflect.set(out, key, value);
  }
  return out;
}

function schemaFor(kind: MmoSkillDemoSegmentKind) {
  if (kind === "world-cell-static" || kind === "private-static") return staticSegmentSchema;
  if (kind === "transient") return transientSegmentSchema;
  return volatileSegmentSchema;
}

function isVolatileSegmentKind(kind: MmoSkillDemoSegmentKind) {
  return kind === "world-cell-volatile" || kind === "private-volatile";
}

function isStaticSegmentKind(kind: MmoSkillDemoSegmentKind) {
  return kind === "world-cell-static" || kind === "private-static";
}

const MMO_PERSONALITIES = new Set([
  "aggressive-pack-hunter", "territorial-rooted", "cowardly-opportunistic", "berserk-high-aggro",
  "erratic-harasser", "stoic-bruiser", "stubborn-lane-defender", "intelligent-skittish",
  "defensive-guardian", "predatory-ambush", "intelligent-spacer", "evasive-zoner",
  "inexorable-dread", "mechanical-boss", "support-caster",
  "passive"
]);
const MMO_IMPACT_TYPES = new Set(["blood", "sap", "spark", "dust", "void", "spore"]);
const MMO_RESOURCE_KINDS = new Set([
  "tree",
  "ore",
  "lumberjacking",
  "mining",
  "foraging",
  "quarrying",
  "fishing",
  "skinning",
  "crop-harvesting",
  "scavenging",
  "essence-siphoning",
  "apiculture",
  "sap-tapping",
  "spore-hunting",
  "dredging",
  "archaeology",
  "hunting",
  "gemology"
]);

function fieldDefault(field: PackedVolatileField | PackedStaticField) {
  if (field.type === "bool") return false;
  if (field.type.endsWith("-map")) return {};
  if (field.type === "zone") return "ashwood";
  if (field.type === "action") return "idle";
  if (field.type === "string" || field.type === "slot" || field.type === "idref") return "";
  return 0;
}

function mapValuesMatch(value: object, expected: "number" | "string" | "boolean") {
  return Object.values(value).every((entry) => typeof entry === expected);
}

function fieldValueIsValid(entity: SegmentEntity, field: PackedVolatileField | PackedStaticField) {
  const value = Reflect.get(entity, field.key);
  if (value === undefined) return true;
  if (field.type === "bool") return typeof value === "boolean";
  if (field.type === "number-map" || field.type === "string-map" || field.type === "bool-map") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const expected = field.type === "number-map" ? "number" : field.type === "string-map" ? "string" : "boolean";
    return mapValuesMatch(value, expected);
  }
  if (field.type === "u16" || field.type === "u32" || field.type === "f32") return typeof value === "number" && Number.isFinite(value);
  return typeof value === "string";
}

function normalizeSegmentEntity(entity: SegmentEntity) {
  for (const field of PACKED_STATIC_FIELDS) {
    if (Reflect.get(entity, field.key) === undefined) Reflect.set(entity, field.key, fieldDefault(field));
  }
  for (const field of PACKED_VOLATILE_FIELDS) {
    if (Reflect.get(entity, field.key) === undefined) Reflect.set(entity, field.key, fieldDefault(field));
  }
  if (entity.entityType === "resource" && !MMO_RESOURCE_KINDS.has(Reflect.get(entity, "skillId"))) {
    Reflect.deleteProperty(entity, "skillId");
  }
  return entity;
}

function isMaterializedMmoEntity(entity: SegmentEntity): entity is MmoSkillDemoEntity {
  if (!PACKED_STATIC_FIELDS.every((field) => fieldValueIsValid(entity, field))) return false;
  if (!PACKED_VOLATILE_FIELDS.every((field) => fieldValueIsValid(entity, field))) return false;
  const zoneId = validZoneId(Reflect.get(entity, "zoneId"));
  if (!zoneId) return false;
  if (entity.entityType === "player") {
    return Boolean(
      validAction(Reflect.get(entity, "action")) &&
        validZoneId(Reflect.get(entity, "homeZoneId")) &&
        validZoneId(Reflect.get(entity, "escortTargetZoneId"))
    );
  }
  if (entity.entityType === "npc") {
    return MMO_PERSONALITIES.has(Reflect.get(entity, "personality")) && MMO_IMPACT_TYPES.has(Reflect.get(entity, "impactType"));
  }
  if (entity.entityType === "resource") return MMO_RESOURCE_KINDS.has(Reflect.get(entity, "kind"));
  if (entity.entityType === "hazard") {
    const kind = Reflect.get(entity, "kind");
    return kind === "line" || kind === "aoe";
  }
  return entity.entityType === "loot";
}

function materializeSegmentEntity(entity: SegmentEntity): MmoSkillDemoEntity {
  const normalized = normalizeSegmentEntity(entity);
  if (!isMaterializedMmoEntity(normalized)) throw new Error(`Invalid ${entity.entityType} replication entity: ${entity.id}`);
  return normalized;
}

function isSegmentEntity(value: unknown): value is SegmentEntity {
  if (typeof value !== "object" || value === null) return false;
  const id = Reflect.get(value, "id");
  const entityType = Reflect.get(value, "entityType");
  return typeof id === "string" && mmoSkillDemoEntityTypeCode(entityType) > 0;
}

function isMmoSkillDemoState(value: unknown): value is MmoSkillDemoState {
  if (typeof value !== "object" || value === null) return false;
  const entities = Reflect.get(value, "entities");
  if (typeof entities !== "object" || entities === null || Array.isArray(entities)) return false;
  for (const entity of Object.values(entities)) {
    if (!isSegmentEntity(entity) || !isMaterializedMmoEntity(entity)) return false;
  }
  const numberFields = ["tick", "activePlayers", "worldEventProgress", "worldEventGoal", "worldEventTimerMs"];
  if (!numberFields.every((field) => typeof Reflect.get(value, field) === "number")) return false;
  const stringFields = [
    "mapRevision",
    "roomKind",
    "roomLabel",
    "worldEventId",
    "worldEventName",
    "worldEventPhase",
    "worldEventObjective",
    "worldEventReward"
  ];
  return stringFields.every((field) => typeof Reflect.get(value, field) === "string") && Boolean(validZoneId(Reflect.get(value, "worldEventZoneId")));
}

function emptyStateFrom(top: Partial<SegmentTopLevel> = {}): MmoSkillDemoState {
  return {
    tick: top.tick ?? 0,
    mapRevision: top.mapRevision ?? "",
    roomKind: top.roomKind ?? "world-zone",
    roomLabel: top.roomLabel ?? "",
    activePlayers: top.activePlayers ?? 0,
    worldEventId: top.worldEventId ?? "",
    worldEventName: top.worldEventName ?? "",
    worldEventZoneId: validZoneId(top.worldEventZoneId) ?? "ashwood",
    worldEventPhase: top.worldEventPhase ?? "",
    worldEventObjective: top.worldEventObjective ?? "",
    worldEventProgress: top.worldEventProgress ?? 0,
    worldEventGoal: top.worldEventGoal ?? 0,
    worldEventTimerMs: top.worldEventTimerMs ?? 0,
    worldEventReward: top.worldEventReward ?? "",
    effects: [],
    entities: {},
    players: {},
    npcs: {},
    resources: {},
    loots: {},
    hazards: {}
  };
}

function applyEntityViews(state: MmoSkillDemoState) {
  state.players = {};
  state.npcs = {};
  state.resources = {};
  state.loots = {};
  state.hazards = {};
  for (const [id, entity] of Object.entries(state.entities)) {
    if (entity.entityType === "player") state.players[id] = entity;
    else if (entity.entityType === "npc") state.npcs[id] = entity;
    else if (entity.entityType === "resource") state.resources[id] = entity;
    else if (entity.entityType === "loot") state.loots[id] = entity;
    else if (entity.entityType === "hazard") state.hazards[id] = entity;
  }
  return state;
}

function attachStaticEntityCache(state: MmoSkillDemoState, staticCache: Record<string, SegmentEntity>) {
  DECODED_STATES.set(state, { state, staticCache });
  return state;
}

export function mmoSkillDemoCellKey(x: number, y: number) {
  return `${Math.floor(x / MMO_SKILL_DEMO_SEGMENT_CELL_SIZE)},${Math.floor(y / MMO_SKILL_DEMO_SEGMENT_CELL_SIZE)}`;
}

export function mmoSkillDemoNeighborCellKeys(x: number, y: number) {
  const cx = Math.floor(x / MMO_SKILL_DEMO_SEGMENT_CELL_SIZE);
  const cy = Math.floor(y / MMO_SKILL_DEMO_SEGMENT_CELL_SIZE);
  const keys: string[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) keys.push(`${cx + dx},${cy + dy}`);
  }
  return keys;
}

export function toMmoSkillDemoVolatileSegmentEntity(entity: MmoSkillDemoEntity) {
  return pickEntityFields(entity, VOLATILE_KEYS);
}

export function toMmoSkillDemoStaticSegmentEntity(entity: MmoSkillDemoEntity) {
  return pickEntityFields(entity, STATIC_KEYS);
}

export function createMmoSkillDemoSegmentState(top: SegmentTopLevel, entities: Record<string, SegmentEntity> = {}, effects: CompactTransientEffect[] = []): SegmentState {
  return { ...top, entities, effects };
}

export function encodeMmoSkillDemoSegment(kind: MmoSkillDemoSegmentKind, id: string, state: SegmentState): ReplicationEnvelopeSegment<MmoSkillDemoSegmentKind> {
  return {
    id,
    kind,
    bytes: isVolatileSegmentKind(kind) ? encodePackedVolatileSegment(state) : isStaticSegmentKind(kind) ? encodePackedStaticSegment(state) : encodeSnapshot(schemaFor(kind), state)
  };
}

export function encodeMmoSkillDemoSegmentBytes(kind: MmoSkillDemoSegmentKind, state: SegmentState) {
  return isVolatileSegmentKind(kind) ? encodePackedVolatileSegment(state) : isStaticSegmentKind(kind) ? encodePackedStaticSegment(state) : encodeSnapshot(schemaFor(kind), state);
}

export function mmoSkillDemoStaticEntitySignature(entity: SegmentEntity) {
  return JSON.stringify({ [entity.id]: entity });
}

export function mmoSkillDemoSegmentStaticSignature(state: SegmentState) {
  return JSON.stringify(state.entities ?? {});
}

export const mmoSkillDemoMultipartCodec = {
  decodeSnapshot(segments: readonly ReplicationEnvelopeSegment<MmoSkillDemoSegmentKind>[], previousState?: unknown) {
    return decodeMmoSkillDemoMultipart(segments, previousState);
  },
  decodeDelta(segments: readonly ReplicationEnvelopeSegment<MmoSkillDemoSegmentKind>[], previousState?: unknown) {
    return decodeMmoSkillDemoMultipart(segments, previousState);
  }
};

function decodeMmoSkillDemoMultipart(segments: readonly ReplicationEnvelopeSegment<MmoSkillDemoSegmentKind>[], previousState?: unknown) {
  const previousEntry = typeof previousState === "object" && previousState !== null ? DECODED_STATES.get(previousState) : undefined;
  const previous = previousEntry?.state ?? (isMmoSkillDemoState(previousState) ? previousState : undefined);
  const staticCache: Record<string, SegmentEntity> = { ...(previousEntry?.staticCache ?? {}) };
  for (const [id, entity] of Object.entries(previous?.entities ?? {})) {
    staticCache[id] = { ...(staticCache[id] ?? {}), ...entity };
  }
  const volatileEntities: Record<string, SegmentEntity> = {};
  const volatileSegments: Uint8Array[] = [];
  let top: Partial<SegmentTopLevel> | undefined = previous;
  let effects: CompactTransientEffect[] = [];

  for (const segment of segments) {
    if (isVolatileSegmentKind(segment.kind)) {
      volatileSegments.push(segment.bytes);
      continue;
    }
    const decoded = isStaticSegmentKind(segment.kind) ? decodePackedStaticSegment(segment.bytes) : decodeSnapshot(schemaFor(segment.kind), segment.bytes);
    top = { ...(top ?? {}), ...decoded };
    if (segment.kind === "transient") {
      effects = decoded.effects ?? [];
      continue;
    }
    for (const [id, entity] of Object.entries(decoded.entities ?? {})) {
      if (segment.kind === "world-cell-static" || segment.kind === "private-static") {
        staticCache[id] = { ...entity };
      } else {
        volatileEntities[id] = { ...(volatileEntities[id] ?? {}), ...entity };
      }
    }
  }

  const idByCode = new Map<number, string>();
  const collisions = new Set<number>();
  for (const id of Object.keys(staticCache)) {
    const code = mmoEntityIdCode(id);
    if (idByCode.has(code) && idByCode.get(code) !== id) collisions.add(code);
    else idByCode.set(code, id);
  }
  for (const code of collisions) idByCode.delete(code);

  for (const bytes of volatileSegments) {
    const decoded = decodeSharedHotSlabVolatileSegment(bytes, idByCode) ?? decodeSharedHotDirtySlabVolatileSegment(bytes, idByCode) ?? decodePackedVolatileSegment(bytes, idByCode);
    top = { ...(top ?? {}), ...decoded.top };
    for (const [id, entity] of Object.entries(decoded.entities)) volatileEntities[id] = { ...(volatileEntities[id] ?? {}), ...entity };
  }

  const state = emptyStateFrom(top);
  state.effects = effects;
  for (const id of Object.keys(volatileEntities)) {
    const merged = { ...(staticCache[id] ?? {}), ...volatileEntities[id] };
    state.entities[id] = materializeSegmentEntity(merged);
  }
  return attachStaticEntityCache(applyEntityViews(state), staticCache);
}
