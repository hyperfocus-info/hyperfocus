import { createCollisionKernel, createStaticRectCollisionIndex, extractCollisionRects, tileToWorld, type TileMap } from "@hyperfocus/engine";
import { bestiaryFor } from "./data/bestiary.ts";
import { buildMmoSkillDemoMap as buildConfiguredMmoSkillDemoMap } from "./data/world.ts";
import { worldCreatureDefinitions, type WorldCreatureEcologyTag } from "./data/world-creatures.ts";
import { worldGatherableNodeSpecs } from "./data/world-gatherables.ts";
import { combatFlagValue } from "./shared-combat-flags.ts";
import { NPC_ROLES, PEACE_NPC_ROLES, WORLD_EVENTS, type WorldEventDef } from "./shared-content-catalog.ts";
import type { MmoSkillDemoState, NpcEntity, ResourceEntity } from "./shared-contracts.ts";
import { isPeaceNpc } from "./shared-npc-rules.ts";
import { u32Ms, zoneForPoint } from "./shared-replication-projection.ts";
import { RESOURCE_HP, resourceHpForKind } from "./shared-world-catalog.ts";

export type RoomKind = "world-zone" | "dungeon-instance" | "cottage-instance";

export function isRoomKind(value: string): value is RoomKind {
  return value === "world-zone" || value === "dungeon-instance" || value === "cottage-instance";
}

export function createMmoSkillDemoCollisionKernel() {
  return createCollisionKernel({
    fetch: Object.assign(
      async () =>
        new Response(await Bun.file(new URL("../../../wasm/collision-kernel.wasm", import.meta.url)).arrayBuffer(), {
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

export const mmoSkillDemoSolidRectIndex = createStaticRectCollisionIndex(mmoSkillDemoSolidRects);

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

export function describeRoom(roomId: string): { roomKind: RoomKind; roomLabel: string } {
  if (roomId.includes("dungeon")) return { roomKind: "dungeon-instance", roomLabel: "Party Boss Room" };
  if (roomId.includes("cottage")) return { roomKind: "cottage-instance", roomLabel: "Player Cottage" };
  return { roomKind: "world-zone", roomLabel: "Shared World Zones" };
}

export function roleForKind(kind: string) {
  return NPC_ROLES[kind] ?? bestiaryFor(kind).role ?? "mob";
}

export const STRONG_PHASE_MS = 8000;
export const STRONG_PHASE_INVULN_START_MS = 3200;
export const STRONG_PHASE_INVULN_END_MS = 5200;
export const LOOT_INTERACTION_RADIUS = 96;
export const CONTRACT_RESTART_COOLDOWN_MS = 45000;
export const ESCORT_SPEED = 136;
export const ESCORT_REACH_RADIUS = 14;
export const NPC_BASE_AGGRO_RADIUS = 150;
export const NPC_BOSS_AGGRO_RADIUS = 190;
export const NPC_AGGRO_RANGE_MULTIPLIER = 2;
export const TERRITORIAL_ECOLOGY_AGGRO_RADIUS = 90;
export const NEUTRAL_ON_SIGHT_ECOLOGY_TAGS = new Set<WorldCreatureEcologyTag>(["neutral-on-sight"]);
export const TERRITORIAL_ECOLOGY_TAGS = new Set<WorldCreatureEcologyTag>(["territorial"]);
export const STRONG_ENEMY_KINDS = new Set(["stone-crawler", "alpha-timberwolf", "crag-gargoyle", "void-sent-sentinel", "dungeon-revenant"]);
export const NATURE_ALLIANCE_BEAST_KINDS = new Set(["prowling-wolf", "alpha-timberwolf", "ash-bramble-stalker", "aggro-tree", "gloom-weaver-spider", "bramble-beast", "timber-goliath", "ashwood-alpha", "moss-grizzly"]);
export const EMPTY_ECOLOGY_TAGS: readonly WorldCreatureEcologyTag[] = [];

const WORLD_CREATURE_BY_ID = new Map<string, (typeof worldCreatureDefinitions)[number]>(worldCreatureDefinitions.map((creature) => [creature.id, creature]));

export function worldCreatureEcologyTags(kind: string): readonly WorldCreatureEcologyTag[] {
  return WORLD_CREATURE_BY_ID.get(kind)?.ecologyTags ?? EMPTY_ECOLOGY_TAGS;
}

export function hasWorldCreatureEcologyTag(kind: string, tags: ReadonlySet<WorldCreatureEcologyTag>) {
  return worldCreatureEcologyTags(kind).some((tag) => tags.has(tag));
}

export function isNpcProvoked(npc: NpcEntity) {
  return npc.hp < npc.maxHp || npc.summonedBy.length > 0 || combatFlagValue(npc, "aggro").length > 0;
}

export function npcAggroRadius(npc: NpcEntity) {
  const base = npc.role === "boss" ? NPC_BOSS_AGGRO_RADIUS : NPC_BASE_AGGRO_RADIUS;
  const doubled = base * NPC_AGGRO_RANGE_MULTIPLIER;
  if (npc.role === "boss" || isNpcProvoked(npc)) return doubled;
  if (hasWorldCreatureEcologyTag(npc.kind, NEUTRAL_ON_SIGHT_ECOLOGY_TAGS)) return 0;
  if (hasWorldCreatureEcologyTag(npc.kind, TERRITORIAL_ECOLOGY_TAGS)) return TERRITORIAL_ECOLOGY_AGGRO_RADIUS;
  return doubled;
}

export function isStrongEnemyKind(kind: string) {
  const role = roleForKind(kind);
  const combatClass = bestiaryFor(kind).combat.class;
  return role === "elite" || role === "boss" || combatClass === "elite" || combatClass === "boss" || bestiaryFor(kind).combat.iframePhaseMs !== undefined || STRONG_ENEMY_KINDS.has(kind);
}

export function isStrongEnemy(npc: NpcEntity) {
  return npc.hp > 0 && npc.role !== "boss-node" && !isPeaceNpc(npc) && isStrongEnemyKind(npc.kind);
}

export function npcPhaseLength(npc: NpcEntity) {
  if (npc.kind === "iron-core-golem") return 45000;
  return isStrongEnemy(npc) ? STRONG_PHASE_MS : 6000;
}

export function isNpcInvulnerable(npc: NpcEntity) {
  if (npc.iframeMs > 0) return true;
  if (!isStrongEnemy(npc)) return false;
  const profile = bestiaryFor(npc.kind).combat;
  const end = STRONG_PHASE_INVULN_START_MS + (profile.iframePhaseMs ?? STRONG_PHASE_INVULN_END_MS - STRONG_PHASE_INVULN_START_MS);
  return npc.phaseMs >= STRONG_PHASE_INVULN_START_MS && npc.phaseMs < end;
}

export function isNpcBuffed(npc: NpcEntity) {
  if (!isStrongEnemy(npc)) return false;
  const profile = bestiaryFor(npc.kind).combat;
  const end = STRONG_PHASE_INVULN_START_MS + (profile.iframePhaseMs ?? STRONG_PHASE_INVULN_END_MS - STRONG_PHASE_INVULN_START_MS);
  return npc.phaseMs >= end;
}

export function npcHealthStrengthMultiplier(kind: string, elite: boolean) {
  const role = roleForKind(kind);
  if (PEACE_NPC_ROLES.has(role) || role === "boss-node") return 1;
  const combatClass = bestiaryFor(kind).combat.class;
  if (role === "boss" || combatClass === "boss") return 4;
  if (elite || role === "elite" || combatClass === "elite") return 3;
  if (STRONG_ENEMY_KINDS.has(kind) || combatClass === "bruiser") return 2.5;
  if (combatClass === "nimble") return 1.8;
  return 1.5;
}

export function scaledNpcHp(kind: string, baseHp: number, elite: boolean) {
  return Math.max(1, Math.floor(baseHp * npcHealthStrengthMultiplier(kind, elite)));
}

export const NPC_RESPAWN_BASE_MS = { mob: 5200, elite: 12000, boss: 18000, bossNode: 16000 } as const;

export function npcRespawnBaseMs(npc: NpcEntity) {
  if (npc.role === "boss") return NPC_RESPAWN_BASE_MS.boss;
  if (npc.elite || npc.role === "elite") return NPC_RESPAWN_BASE_MS.elite;
  if (npc.role === "boss-node") return NPC_RESPAWN_BASE_MS.bossNode;
  return NPC_RESPAWN_BASE_MS.mob;
}

export function npcRespawnStrengthMultiplier(npc: NpcEntity) {
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

export function worldEventPool(roomKind: string) {
  if (roomKind === "dungeon-instance") return WORLD_EVENTS.filter((event) => event.zoneId === "dungeon");
  if (roomKind === "cottage-instance") return WORLD_EVENTS.filter((event) => event.zoneId === "cottage");
  return WORLD_EVENTS.filter((event) => event.zoneId !== "dungeon" && event.zoneId !== "cottage");
}

export function initialWorldEvent(roomKind: string) {
  return worldEventPool(roomKind)[0] ?? WORLD_EVENTS[0];
}

export function activeWorldEvent(state: MmoSkillDemoState) {
  return WORLD_EVENTS.find((event) => event.id === state.worldEventId) ?? initialWorldEvent(state.roomKind);
}

export function nextWorldEvent(state: MmoSkillDemoState) {
  const pool = worldEventPool(state.roomKind);
  const current = Math.max(0, pool.findIndex((event) => event.id === state.worldEventId));
  return pool[(current + 1) % Math.max(1, pool.length)] ?? initialWorldEvent(state.roomKind);
}

export function assignWorldEvent(state: MmoSkillDemoState, event: WorldEventDef) {
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
