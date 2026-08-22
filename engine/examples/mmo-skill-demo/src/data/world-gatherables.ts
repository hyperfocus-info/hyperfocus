import {
  authoredZoneForMmoSkillDemoTile,
  buildMmoSkillDemoRegionTiles,
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE,
  TILE_BANK,
  TILE_ORE,
  TILE_ROCK,
  TILE_TREE,
  TILE_WATER,
  type RegionZoneId
} from "./world.ts";
import { gatherableMaterials, type GatherableMaterial } from "../shared/materials.ts";
import type { GatheringSkillId, MaterialTier } from "../shared/skills.ts";

export type WorldGatherableNodeKind = "tree" | "ore" | GatheringSkillId;

export type WorldGatherableNodeSpec = {
  id: string;
  kind: WorldGatherableNodeKind;
  skillId: GatheringSkillId;
  materialId: number;
  materialName: string;
  tier: MaterialTier;
  authoredZoneId: RegionZoneId;
  tileX: number;
  tileY: number;
  x: number;
  y: number;
};

type WorldZoneBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const WORLD_GATHERABLE_ZONE_BOUNDS: Partial<Record<RegionZoneId, WorldZoneBounds>> = {
  ashwood: { minX: 50, maxX: 142, minY: 5, maxY: 68 },
  crags: { minX: 3, maxX: 46, minY: 4, maxY: 68 },
  "port-marrow": { minX: 194, maxX: 290, minY: 5, maxY: 68 },
  "holy-reach": { minX: 294, maxX: 366, minY: 5, maxY: 68 },
  "canaan-desert": { minX: 450, maxX: 558, minY: 5, maxY: 68 },
  "void-rift": { minX: 562, maxX: 1276, minY: 5, maxY: 68 },
  "ashwood-wilderness": { minX: 146, maxX: 190, minY: 5, maxY: 42 },
  "whisperwind-ascent": { minX: 370, maxX: 446, minY: 5, maxY: 68 }
};

const WORLD_GATHERABLE_ZONE_ALIASES = {
  oakhaven: ["ashwood"],
  bazaar: ["canaan-desert"],
  dungeon: [],
  cottage: []
} as const satisfies Record<string, readonly RegionZoneId[]>;

const NODE_COUNT_BY_TIER = {
  1: 7,
  2: 2,
  3: 1,
  4: 1,
  5: 1
} as const satisfies Record<MaterialTier, number>;

const WORLD_TILES = buildMmoSkillDemoRegionTiles();

function hash(value: string) {
  let h = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function modulo(value: number, max: number) {
  return ((value % max) + max) % max;
}

function tileAt(tileX: number, tileY: number) {
  if (tileX < 0 || tileY < 0 || tileX >= MAP_WIDTH || tileY >= MAP_HEIGHT) return TILE_WATER;
  return WORLD_TILES[tileY * MAP_WIDTH + tileX] ?? TILE_WATER;
}

function isBlockedTile(tile: number) {
  return tile === TILE_WATER || tile === TILE_BANK || tile === TILE_TREE || tile === TILE_ORE || tile === TILE_ROCK;
}

function materialWorldZones(material: GatherableMaterial) {
  const zones: RegionZoneId[] = [];
  for (const rawZone of material.spawnZones) {
    const direct = WORLD_GATHERABLE_ZONE_BOUNDS[rawZone as RegionZoneId] ? [rawZone as RegionZoneId] : undefined;
    const aliases = direct ?? WORLD_GATHERABLE_ZONE_ALIASES[rawZone as keyof typeof WORLD_GATHERABLE_ZONE_ALIASES] ?? [];
    for (const zone of aliases) if (!zones.includes(zone)) zones.push(zone);
  }
  return material.tier === 5 ? zones.slice(0, 1) : zones;
}

function kindForSkill(skillId: GatheringSkillId): WorldGatherableNodeKind {
  if (skillId === "lumberjacking") return "tree";
  if (skillId === "mining" || skillId === "quarrying" || skillId === "gemology") return "ore";
  return skillId;
}

function canUseTile(tileX: number, tileY: number, zoneId: RegionZoneId, occupied: Set<string>) {
  if (authoredZoneForMmoSkillDemoTile(tileX, tileY) !== zoneId) return false;
  if (isBlockedTile(tileAt(tileX, tileY))) return false;
  for (let y = tileY - 2; y <= tileY + 2; y += 1) {
    for (let x = tileX - 2; x <= tileX + 2; x += 1) {
      if (occupied.has(`${x}:${y}`)) return false;
    }
  }
  return true;
}

function pickTile(material: GatherableMaterial, zoneId: RegionZoneId, copyIndex: number, occupied: Set<string>) {
  const bounds = WORLD_GATHERABLE_ZONE_BOUNDS[zoneId];
  if (!bounds) throw new Error(`No gatherable bounds for ${zoneId}`);
  const spanX = bounds.maxX - bounds.minX + 1;
  const spanY = bounds.maxY - bounds.minY + 1;
  const base = hash(`${material.id}:${zoneId}:${copyIndex}`);
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const tileX = bounds.minX + modulo(base + attempt * 37 + (base >>> 11), spanX);
    const tileY = bounds.minY + modulo((base >>> 5) + attempt * 17 + (base >>> 19), spanY);
    if (!canUseTile(tileX, tileY, zoneId, occupied)) continue;
    occupied.add(`${tileX}:${tileY}`);
    return { tileX, tileY };
  }
  const tileX = Math.floor((bounds.minX + bounds.maxX) * 0.5);
  const tileY = Math.floor((bounds.minY + bounds.maxY) * 0.5);
  occupied.add(`${tileX}:${tileY}`);
  return { tileX, tileY };
}

function buildWorldGatherableNodeSpecs() {
  const occupied = new Set<string>();
  const specs: WorldGatherableNodeSpec[] = [];
  for (const material of gatherableMaterials) {
    const zones = materialWorldZones(material);
    const perZone = NODE_COUNT_BY_TIER[material.tier];
    for (const zoneId of zones) {
      for (let copy = 0; copy < perZone; copy += 1) {
        const { tileX, tileY } = pickTile(material, zoneId, copy, occupied);
        specs.push({
          id: `g-${material.id}-${zoneId}-${copy}`,
          kind: kindForSkill(material.skillId as GatheringSkillId),
          skillId: material.skillId as GatheringSkillId,
          materialId: material.id,
          materialName: material.name,
          tier: material.tier,
          authoredZoneId: zoneId,
          tileX,
          tileY,
          x: tileX * TILE + TILE * 0.5,
          y: tileY * TILE + TILE * 0.5
        });
      }
    }
  }
  return specs;
}

export const worldGatherableNodeSpecs = buildWorldGatherableNodeSpecs() as readonly WorldGatherableNodeSpec[];

export const worldGatherableNodeSpecsById = Object.fromEntries(
  worldGatherableNodeSpecs.map((spec) => [spec.id, spec])
) as Record<string, WorldGatherableNodeSpec>;
