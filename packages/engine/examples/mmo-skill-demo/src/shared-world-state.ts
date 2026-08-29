import { tileToWorld } from "@hyperfocus/engine";
import { truncateUtf8 } from "@hyperfocus/engine/core";
import { getMmoSkillDemoAnchorTile, mmoSkillDemoRegionConfig, resolveMmoSkillDemoNpcSpawns } from "./data/world.ts";
import { bestiaryFor } from "./data/bestiary.ts";
import { worldCreatureDefinitions, type WorldCreatureEcologyTag } from "./data/world-creatures.ts";
import { type SavedCharacter } from "./persistence.ts";
import { ensureGatheringProgress } from "./server/gatheringEngine.ts";
import { MACE_WEAPON_ID, MAX_ENERGY } from "./shared-ability-catalog.ts";
import { combatFlagValue } from "./shared-combat-state.ts";
import { NPC_ROLES, PEACE_NPC_ROLES, WORLD_EVENTS, type WorldEventDef } from "./shared-content-catalog.ts";
import { type MmoSkillDemoState, type NpcEntity, type PlayerEntity, type ZoneId } from "./shared-contracts.ts";
import { WORLD_CREATURE_BY_ID, syncFactionReputationRewards } from "./shared-economy.ts";
import { syncMmoEntityRegistry } from "./shared-entity-registry.ts";
import { DEFAULT_MACE_ABILITY_SET, ensureStartingEquipment, mmoInventory } from "./shared-loadout.ts";
import { ensureDailyQuestState, isPeaceNpc, rankForRenown } from "./shared-progression.ts";
import { ensureActiveMainQuest } from "./shared-quests.ts";
import { clamp, u32Ms, zoneForPoint, zoneSchemaAlias } from "./shared-replication-projection.ts";
import { LEGACY_WORLD_ZONE_IDS, MAP_HEIGHT, MAP_REVISION, MAP_WIDTH, TILE, catalogZoneForLocation } from "./shared-world-catalog.ts";
import {
  buildMmoSkillDemoMap,
  createMmoSkillDemoCollisionKernel,
  extractMmoSkillDemoResources,
  mmoSkillDemoMap,
  mmoSkillDemoSolidRectIndex,
  mmoSkillDemoSolidRects
} from "./shared-world-runtime.ts";

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

type SpawnSpot = { kind: string; x: number; y: number; hp: number; elite: boolean; zoneId?: ZoneId };

function createNpcSpawnTools() {
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
  return { near, outsideTownBuffer, expandedCreatureSpots, campSpots };
}

type NpcSpawnTools = ReturnType<typeof createNpcSpawnTools>;

function createEnemyCampSpots(tools: NpcSpawnTools): SpawnSpot[] {
  const { campSpots } = tools;
  return [
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
}

function createWorldNpcSpots(tools: NpcSpawnTools): SpawnSpot[] {
  const { near, expandedCreatureSpots } = tools;
  const regionNpcSpots: SpawnSpot[] = resolveMmoSkillDemoNpcSpawns().map((npc) => ({
    kind: npc.kind,
    x: npc.tileX,
    y: npc.tileY,
    hp: 120,
    elite: false,
    zoneId: zoneForPoint(npc.tileX * TILE, npc.tileY * TILE)
  }));
  const expandedWorldCreatureSpots = expandedCreatureSpots("world");
  const enemyCampSpots = createEnemyCampSpots(tools);
  return [
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
}

function createDungeonNpcSpots(tools: NpcSpawnTools): SpawnSpot[] {
  const { near, expandedCreatureSpots } = tools;
  const expandedDungeonCreatureSpots = expandedCreatureSpots("dungeon").map(
    (spot): SpawnSpot => ({ ...spot, zoneId: "dungeon" })
  );
  return [
    ...expandedDungeonCreatureSpots,
    near("overgrown-thicket", -2, -1, { kind: "great-ash-lord", hp: 210, elite: true, zoneId: "dungeon" }),
    near("overgrown-thicket", 2, 2, { kind: "ember-acolyte", hp: 46, elite: false, zoneId: "dungeon" }),
    near("deep-fissure", -2, 2, { kind: "dungeon-revenant", hp: 130, elite: true, zoneId: "dungeon" }),
    near("deep-fissure", 1, -2, { kind: "power-node", hp: 42, elite: false, zoneId: "dungeon" }),
    near("deep-fissure", -4, -1, { kind: "power-node", hp: 42, elite: false, zoneId: "dungeon" }),
    near("deep-fissure", 4, 0, { kind: "iron-core-golem", hp: 260, elite: true, zoneId: "dungeon" }),
    near("void-rift", -2, -1, { kind: "power-node", hp: 42, elite: false, zoneId: "dungeon" }),
    near("void-rift", 2, 1, { kind: "ember-acolyte", hp: 46, elite: false, zoneId: "dungeon" }),
    near("void-rift", 5, 3, { kind: "mirror-king", hp: 240, elite: true, zoneId: "dungeon" })
  ];
}

function createCottageNpcSpots(tools: NpcSpawnTools): SpawnSpot[] {
  const { near } = tools;
  return [
    near("aetheria", -1, 0, { kind: "innkeeper-martha", hp: 120, elite: false, zoneId: "cottage" }),
    near("aetheria", 2, 0, { kind: "banker-valerius", hp: 120, elite: false, zoneId: "cottage" })
  ];
}

function materializeNpcSpots(spots: SpawnSpot[]): NpcEntity[] {
  return spots.map((spot, index) => {
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

function createNpcSpawns(roomKind: RoomKind = "world-zone"): NpcEntity[] {
  const tools = createNpcSpawnTools();
  const spots =
    roomKind === "dungeon-instance"
      ? createDungeonNpcSpots(tools)
      : roomKind === "cottage-instance"
        ? createCottageNpcSpots(tools)
        : createWorldNpcSpots(tools);
  const safeSpots = roomKind === "world-zone" ? spots.map(tools.outsideTownBuffer) : spots;
  return materializeNpcSpots(safeSpots);
}

function spawnAtAnchor(anchorId: string, playerId: string, columns: number) {
  const lane = Number(playerId.replace(/\D/g, "")) % 8;
  const anchor = getMmoSkillDemoAnchorTile(anchorId);
  return tileToWorld(mmoSkillDemoMap, anchor.x + (lane % columns), anchor.y + Math.floor(lane / columns), "center");
}

function worldSpawnForPlayer(playerId: string) {
  return spawnAtAnchor("oakhaven", playerId, 4);
}

function defaultWorldPosition(playerId: string): { x: number; y: number; zoneId: ZoneId } {
  const point = worldSpawnForPlayer(playerId);
  return { x: point.x, y: point.y, zoneId: "ashwood" };
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

export {
  CONTRACT_RESTART_COOLDOWN_MS,
  EMPTY_ECOLOGY_TAGS,
  ESCORT_REACH_RADIUS,
  ESCORT_SPEED,
  LOOT_INTERACTION_RADIUS,
  NATURE_ALLIANCE_BEAST_KINDS,
  NEUTRAL_ON_SIGHT_ECOLOGY_TAGS,
  NPC_AGGRO_RANGE_MULTIPLIER,
  NPC_BASE_AGGRO_RADIUS,
  NPC_BOSS_AGGRO_RADIUS,
  NPC_RESPAWN_BASE_MS,
  STRONG_ENEMY_KINDS,
  STRONG_PHASE_INVULN_END_MS,
  STRONG_PHASE_INVULN_START_MS,
  STRONG_PHASE_MS,
  TERRITORIAL_ECOLOGY_AGGRO_RADIUS,
  TERRITORIAL_ECOLOGY_TAGS,
  activeWorldEvent,
  assignWorldEvent,
  buildMmoSkillDemoMap,
  createMmoSkillDemoCollisionKernel,
  createNpcSpawns,
  createPlayer,
  defaultWorldPosition,
  describeRoom,
  extractMmoSkillDemoResources,
  hasWorldCreatureEcologyTag,
  initialWorldEvent,
  isInstanceZone,
  isNpcBuffed,
  isNpcInvulnerable,
  isNpcProvoked,
  isStrongEnemy,
  isStrongEnemyKind,
  mmoSkillDemoMap,
  mmoSkillDemoSolidRects,
  mmoSkillDemoSolidRectIndex,
  nextWorldEvent,
  npcAggroRadius,
  npcHealthStrengthMultiplier,
  npcPhaseLength,
  npcRespawnBaseMs,
  npcRespawnStrengthMultiplier,
  roleForKind,
  savedWorldZone,
  scaledNpcHp,
  spawnAtAnchor,
  worldCreatureEcologyTags,
  worldEventPool,
  worldSpawnForPlayer
};

export type {
  RoomKind
};
