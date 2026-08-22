import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decodeMultipartReplicationEnvelope,
  decodeReplicationFrame,
  decodeSnapshot,
  encodeDelta,
  encodeSnapshot,
  type ReplicationEnvelopeSegment
} from "@hyperfocus/engine/protocol";
import { resolveSpriteSheetFrame } from "@hyperfocus/engine/render";
import {
  createAuthoritativeServer as createAuthoritativeServerBase,
  createMmo1000Preset,
  type AuthoritativeRoom,
  type AuthoritativeServer,
  type AuthoritativeServerOptions
} from "@hyperfocus/engine/server";
import { authoredZoneForMmoSkillDemoTile, getMmoSkillDemoAnchorTile, mmoSkillDemoRegionConfig, resolveMmoSkillDemoNpcSpawns, TILE, WORLD_MAP_SCALE, zoneForMmoSkillDemoTile } from "../data/world.ts";
import { bestiaryById } from "../data/bestiary.ts";
import { dailyObjectiveTypes, dailyQuestArcForDate } from "../data/daily-quests.ts";
import { worldCreatureDefinitions } from "../data/world-creatures.ts";
import { worldFactionIds, worldFactions } from "../data/world-factions.ts";
import { worldGatherableNodeSpecs } from "../data/world-gatherables.ts";
import { worldCraftingMaterials, worldCraftingMaterialsByCategory } from "../data/world-materials.ts";
import { worldCraftingRecipes } from "../data/world-recipes.ts";
import { worldFactionQuestlines, worldFactionQuestSteps } from "../data/world-quests.ts";
import { worldReputationRewardTiers, worldReputationRewards, worldReputationRewardsByFaction } from "../data/world-reputation.ts";
import { mmoSkillDemoClientSchema } from "../client/schema.ts";
import { earlyLoopAction, earlyLoopBlockers } from "../client/early-loop.ts";
import { mainQuestDestination } from "../client/quest-guide.ts";
import { spriteSheetMetaForSize } from "../client/render/sprite-sheets.ts";
import { buildTiles, MAP_HEIGHT, MAP_WIDTH } from "../client/world.ts";
import {
  createMmoSkillDemoCollisionKernel,
  createMmoSkillDemoState,
  extractMmoSkillDemoResources,
  attachMmoEntityViews,
  addItem,
  bankQty,
  hasInventoryItem,
  hasQuestFlag,
  hasSlot,
  itemQty,
  setItemQty,
  selectedAbilityForSlot,
  mmoSkillDemoMap,
  mmoSkillDemoNpcRespawnMs,
  mmoSkillDemoCottage,
  mmoSkillDemoDungeon,
  mmoSkillDemoMultipartCodec,
  mmoSkillDemoEntityTypeCount,
  mmoSkillDemoSharedHotSlotForEntityType,
  mmoSkillDemoSharedHotBytesForEntity,
  mmoSkillDemoSharedHotSchema,
  mmoSkillDemoSchema,
  mmoCatalog,
  mmoSkillDemoZone,
  removeMmoSkillDemoEntity,
  syncMmoEntityRegistry,
  type MmoSkillDemoInput,
  type MmoSkillDemoState,
  type PlayerEntity
} from "../shared.ts";

import {
  mmoSkillDemoActionCode,
  mmoSkillDemoCellKey,
  mmoSkillDemoEntityIdCode,
  mmoSkillDemoNeighborCellKeys,
  mmoSkillDemoStatusMask,
  type MmoSkillDemoSegmentKind
} from "../segmented-replication.ts";
import { gatherableMaterials } from "../shared/materials.ts";
import { totalXpForLevel } from "../shared/skills.ts";

type MmoSkillDemoTestRoom = AuthoritativeRoom<MmoSkillDemoState, MmoSkillDemoInput>;
type MmoSkillDemoTestServer = Omit<AuthoritativeServer, "createRoom" | "joinRoom" | "rooms"> & {
  createRoom(typeName: string, roomId?: string): MmoSkillDemoTestRoom;
  joinRoom(options: Parameters<AuthoritativeServer["joinRoom"]>[0]): Promise<
    Omit<Awaited<ReturnType<AuthoritativeServer["joinRoom"]>>, "room"> & { room?: MmoSkillDemoTestRoom }
  >;
  rooms(): readonly MmoSkillDemoTestRoom[];
};

function createAuthoritativeServer(options: AuthoritativeServerOptions): MmoSkillDemoTestServer {
  return createAuthoritativeServerBase({ ...options, devMode: options.devMode ?? true }) as MmoSkillDemoTestServer;
}

async function tapPummel(server: { receiveInput: (playerId: string, input: Record<string, unknown>) => Promise<unknown>; tick: (dt?: number) => Promise<unknown> }, playerId: string, input: Record<string, unknown>) {
  await server.receiveInput(playerId, { ...input, action: input.action === "attack" ? "attack" : "lmb" });
  await server.tick(0);
  await server.receiveInput(playerId, { action: "idle", targetId: input.targetId ?? "", aimX: input.aimX, aimY: input.aimY });
  await server.tick(0.36);
}

async function castCrushingLeap(server: { receiveInput: (playerId: string, input: Record<string, unknown>) => Promise<unknown>; tick: (dt?: number) => Promise<unknown> }, playerId: string, input: Record<string, unknown>) {
  await server.receiveInput(playerId, { ...input, action: "rmb" });
  await server.tick(0);
  await server.tick(0.7);
}

async function sendConfig(server: { receiveInput: (playerId: string, input: Record<string, unknown>) => Promise<unknown>; tick: (dt?: number) => Promise<unknown> }, playerId: string, devField: string, devText: string) {
  await server.receiveInput(playerId, { action: "config", devField, devText });
  await server.tick(0);
}

const scaledTile = (value: number) => value * WORLD_MAP_SCALE;
const supportNpcRoles = new Set(["quest", "trainer", "bank", "merchant", "travel", "contract", "crafting", "hidden", "home"]);
const mmoSegmentKinds = new Set<MmoSkillDemoSegmentKind>([
  "world-cell-static",
  "world-cell-volatile",
  "private-static",
  "private-volatile",
  "transient"
]);

function typedMmoSegments(segments: readonly ReplicationEnvelopeSegment[]): readonly ReplicationEnvelopeSegment<MmoSkillDemoSegmentKind>[] {
  for (const segment of segments) {
    if (!mmoSegmentKinds.has(segment.kind as MmoSkillDemoSegmentKind)) throw new Error(`Unexpected MMO segment kind: ${segment.kind}`);
  }
  return segments as readonly ReplicationEnvelopeSegment<MmoSkillDemoSegmentKind>[];
}

function isolateCombatTarget(state: MmoSkillDemoState, targetId: string) {
  for (const npc of Object.values(state.npcs)) {
    if (npc.id === targetId || supportNpcRoles.has(npc.role) || npc.role === "boss-node") continue;
    npc.zoneId = "dungeon";
    npc.x += 200000;
    npc.y += 200000;
    npc.spawnX = npc.x;
    npc.spawnY = npc.y;
  }
  const target = state.npcs[targetId];
  if (target) {
    target.attackCooldownMs = 30000;
    target.projectileCooldownMs = 30000;
    target.stunMs = 30000;
  }
}

function defaultPlayerPmsps(player: { combatLevel: number; masteryRank: number }) {
  return 118 + Math.min(38, player.combatLevel * 2) + Math.min(14, Math.max(0, player.masteryRank - 1) * 2);
}

test("MMO Skill Demo client tiles match the authoritative map", () => {
  const clientTiles = buildTiles();
  expect(clientTiles).toHaveLength(MAP_WIDTH * MAP_HEIGHT);
  expect(MAP_WIDTH).toBe(1280);
  expect(MAP_HEIGHT).toBe(72);

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      expect(mmoSkillDemoMap.getTileAt(x, y, "ground")?.tileId).toBe(clientTiles[y * MAP_WIDTH + x]);
    }
  }
});

test("MMO Skill Demo region manifest exposes deterministic NPC anchors", () => {
  const npcMarkers = mmoSkillDemoMap.markers.filter((marker) => marker.type === "npc");
  expect(npcMarkers.some((marker) => marker.metadata?.spawnId === "oakhaven.elder-rowan")).toBe(true);
  expect(npcMarkers.every((marker) => typeof marker.metadata?.dialogTreeRef === "string")).toBe(true);
  expect(mmoSkillDemoMap.markers.some((marker) => marker.metadata?.anchorId === "void-rift" && marker.metadata?.instanceId === "void-rift")).toBe(true);
  for (const anchorId of ["ashwood-glade", "high-reach-peaks", "sunken-bazaar", "obsidian-sanctum"]) {
    expect(mmoSkillDemoMap.markers.some((marker) => marker.metadata?.anchorId === anchorId)).toBe(true);
  }
  for (const spawnId of ["high-reach-peaks.master-kael", "obsidian-sanctum.cursed-statue", "sunken-bazaar.merchant-kaya"]) {
    expect(npcMarkers.some((marker) => marker.metadata?.spawnId === spawnId)).toBe(true);
  }
});

test("MMO Skill Demo region manifest carries authored expanded zones over legacy compatibility", () => {
  const anchorZones = new Map(mmoSkillDemoRegionConfig.anchors.map((anchor) => [anchor.id, anchor.zoneId]));
  expect(anchorZones.get("aetheria")).toBe("holy-reach");
  expect(anchorZones.get("sunken-bazaar")).toBe("canaan-desert");
  expect(anchorZones.get("obsidian-sanctum")).toBe("void-rift");
  expect(anchorZones.get("ashwood-glade")).toBe("ashwood-wilderness");
  expect(anchorZones.get("high-reach-peaks")).toBe("whisperwind-ascent");

  expect(authoredZoneForMmoSkillDemoTile(scaledTile(160), scaledTile(20))).toBe("holy-reach");
  expect(authoredZoneForMmoSkillDemoTile(scaledTile(230), scaledTile(27))).toBe("canaan-desert");
  expect(authoredZoneForMmoSkillDemoTile(scaledTile(316), scaledTile(15))).toBe("void-rift");
  expect(authoredZoneForMmoSkillDemoTile(scaledTile(82), scaledTile(10))).toBe("ashwood-wilderness");
  expect(authoredZoneForMmoSkillDemoTile(scaledTile(202), scaledTile(7))).toBe("whisperwind-ascent");
  expect(zoneForMmoSkillDemoTile(scaledTile(202), scaledTile(7))).toBe("crags");

  const npcSpawns = resolveMmoSkillDemoNpcSpawns();
  expect(npcSpawns.some((npc) => npc.id === "aetheria.high-arcanist-vael" && npc.authoredZoneId === "holy-reach" && npc.zoneId === "port-marrow")).toBe(true);
  expect(npcSpawns.some((npc) => npc.id === "obsidian-sanctum.cursed-statue" && npc.authoredZoneId === "void-rift" && npc.zoneId === "bazaar")).toBe(true);
});

test("MMO Skill Demo gatherable nodes cover materials with tiered density", () => {
  const specsByMaterial = new Map<number, number>();
  const specsByTier = new Map<number, number>();
  for (const spec of worldGatherableNodeSpecs) {
    specsByMaterial.set(spec.materialId, (specsByMaterial.get(spec.materialId) ?? 0) + 1);
    specsByTier.set(spec.tier, (specsByTier.get(spec.tier) ?? 0) + 1);
  }

  for (const material of gatherableMaterials) {
    const count = specsByMaterial.get(material.id) ?? 0;
    expect(count, material.name).toBeGreaterThan(0);
    if (material.tier === 1) expect(count, material.name).toBeGreaterThanOrEqual(7);
  }

  expect(specsByTier.get(1) ?? 0).toBeGreaterThan(specsByTier.get(2) ?? 0);
  expect(specsByTier.get(2) ?? 0).toBeGreaterThan(specsByTier.get(5) ?? 0);

  const resourceIds = new Set(extractMmoSkillDemoResources().map((resource) => resource.id));
  for (const spec of worldGatherableNodeSpecs) expect(resourceIds.has(spec.id), spec.id).toBe(true);

  const maxTravelGap = (nodes: readonly { x: number }[]) => {
    const sorted = [...nodes].sort((a, b) => a.x - b.x);
    return sorted.slice(1).reduce((maxGap, node, index) => Math.max(maxGap, node.x - sorted[index]!.x), 0);
  };
  const threeScreens = 960 * 3;
  expect(maxTravelGap(extractMmoSkillDemoResources())).toBeLessThanOrEqual(threeScreens);
  expect(maxTravelGap(worldGatherableNodeSpecs.filter((spec) => spec.tier <= 2))).toBeLessThanOrEqual(threeScreens);
});

test("MMO Skill Demo expanded world-building data stays complete and linked", () => {
  const factionIds = new Set(worldFactionIds);
  const materialIds = new Set<string>(worldCraftingMaterials.map((material) => material.id));
  const gameplayItemIds = new Set<string>(mmoCatalog.items.map((item) => item.id));
  const creatureIds = new Set(worldCreatureDefinitions.map((creature) => creature.id));
  const rewardIds = new Set(worldReputationRewards.map((reward) => reward.id));
  const zoneIds = new Set(mmoCatalog.zones.map((zone) => zone.zoneId));

  expect(worldFactions).toHaveLength(8);
  expect(new Set(worldFactions.map((faction) => faction.id)).size).toBe(8);
  for (const faction of worldFactions) {
    expect(factionIds.has(faction.id)).toBe(true);
    expect(faction.keyNpcs.length).toBeGreaterThanOrEqual(3);
    for (const relation of [...faction.allies, ...faction.enemies]) expect(factionIds.has(relation.id)).toBe(true);
  }

  expect(worldCreatureDefinitions).toHaveLength(32);
  expect(new Set(worldCreatureDefinitions.map((creature) => creature.id)).size).toBe(32);
  expect(worldCreatureDefinitions.every((creature) => creature.ecologyTags.length > 0 && creature.ecologicalNiche.length > 0 && creature.idleBehavior.length > 0)).toBe(true);
  expect(worldCreatureDefinitions.some((creature) => (creature.ecologyTags as readonly string[]).includes("neutral-on-sight"))).toBe(true);
  expect(worldCreatureDefinitions.filter((creature) => !bestiaryById[creature.id])).toEqual([]);

  expect(worldReputationRewards).toHaveLength(32);
  expect(worldReputationRewardTiers).toEqual(["Recognized", "Trusted", "Respected", "Exalted"]);
  for (const factionId of worldFactionIds) {
    const rewards = worldReputationRewardsByFaction[factionId];
    expect(rewards.map((reward) => reward.tier)).toEqual([...worldReputationRewardTiers]);
    expect(rewards.map((reward) => reward.tierLevel)).toEqual([1, 2, 3, 4]);
  }

  expect(worldCraftingMaterials).toHaveLength(100);
  expect(worldCraftingMaterialsByCategory["weapon-armor-essential"]).toHaveLength(25);
  expect(worldCraftingMaterialsByCategory["enhanced-upgrade"]).toHaveLength(10);
  expect(worldCraftingMaterialsByCategory.gathering).toHaveLength(20);
  expect(worldCraftingMaterialsByCategory["monster-drop"]).toHaveLength(20);
  expect(worldCraftingMaterialsByCategory["faction-quest-rare"]).toHaveLength(25);
  expect(new Set(worldCraftingMaterials.map((material) => material.id)).size).toBe(100);

  expect(worldCraftingRecipes.length).toBeGreaterThanOrEqual(12);
  for (const recipe of worldCraftingRecipes) {
    expect(factionIds.has(recipe.factionId)).toBe(true);
    for (const stack of [...recipe.inputs, ...recipe.outputs]) {
      expect(materialIds.has(stack.itemId) || gameplayItemIds.has(stack.itemId) || stack.itemId.includes("-")).toBe(true);
      expect(stack.amount).toBeGreaterThan(0);
    }
  }

  expect(worldFactionQuestlines).toHaveLength(8);
  expect(worldFactionQuestSteps).toHaveLength(24);
  expect(new Set(worldFactionQuestlines.map((questline) => questline.factionId)).size).toBe(8);
  expect(worldFactionQuestSteps.some((step) => step.zoneId === "void-rift")).toBe(true);
  expect(worldFactionQuestSteps.some((step) => step.zoneId === "whisperwind-ascent")).toBe(true);
  const gateReadbackSteps = worldFactionQuestSteps.filter((step) => step.masteryGate && step.progressionPayoff);
  expect(gateReadbackSteps).toHaveLength(24);
  expect(new Set(gateReadbackSteps.map((step) => step.progressionBand))).toEqual(new Set(["10s", "10m", "10h", "100h"]));
  for (const questline of worldFactionQuestlines) {
    expect(factionIds.has(questline.factionId)).toBe(true);
    expect(questline.steps.length).toBeGreaterThanOrEqual(3);
    for (const step of questline.steps) {
      expect(zoneIds.has(step.zoneId)).toBe(true);
      for (const ecology of step.creatureEcology) expect(creatureIds.has(ecology.creatureId)).toBe(true);
      for (const reward of step.rewards) {
        if (reward.kind === "reputation") expect(factionIds.has(reward.factionId)).toBe(true);
        else if (reward.kind === "material") expect(materialIds.has(reward.materialId)).toBe(true);
        else expect(rewardIds.has(reward.rewardId)).toBe(true);
      }
    }
  }
});

test("MMO Skill Demo daily quest generator is date-seeded and uses world data", () => {
  const arcA = dailyQuestArcForDate("2026-06-05");
  const arcB = dailyQuestArcForDate("2026-06-05");
  const materialIds = new Set(worldCraftingMaterials.map((material) => material.id));
  const factionIds = new Set(worldFactionIds);

  expect(JSON.stringify(arcA)).toBe(JSON.stringify(arcB));
  expect(arcA.steps.length).toBeGreaterThanOrEqual(3);
  expect(arcA.steps.length).toBeLessThanOrEqual(5);
  expect(new Set(dailyObjectiveTypes).size).toBe(25);
  expect(factionIds.has(arcA.primaryFaction)).toBe(true);
  expect(factionIds.has(arcA.rivalFaction)).toBe(true);
  expect(arcA.primaryFaction).not.toBe(arcA.rivalFaction);
  expect(arcA.steps.every((step) => step.masteryGate && step.progressionPayoff)).toBe(true);
  expect(new Set(arcA.steps.map((step) => step.progressionBand))).toEqual(new Set(["10m", "10h", "100h"]));
  for (const step of arcA.steps) {
    expect(dailyObjectiveTypes.includes(step.objectiveType)).toBe(true);
    expect(materialIds.has(step.rewardMaterialId)).toBe(true);
    expect(step.choices).toHaveLength(3);
  }
});

test("MMO Skill Demo catalog mirrors expanded world-building data", () => {
  expect(mmoCatalog.factions).toHaveLength(worldFactions.length);
  expect(mmoCatalog.expandedCreatures).toHaveLength(worldCreatureDefinitions.length);
  expect(mmoCatalog.reputationRewards).toHaveLength(worldReputationRewards.length);
  expect(mmoCatalog.craftingMaterials).toHaveLength(worldCraftingMaterials.length);
  expect(mmoCatalog.factions.some((entry) => entry.id === "obsidian-sanctum" && entry.zoneId === "void-rift")).toBe(true);
  expect(mmoCatalog.expandedCreatures.some((entry) => entry.id === "gloom-weaver-spider" && entry.summary.includes("Idle:"))).toBe(true);
  expect(mmoCatalog.craftingMaterials.some((entry) => entry.id === "void-seed-shell" && entry.role === "faction-quest-rare")).toBe(true);
});

test("MMO Skill Demo world-building docs and local agent note cover expanded lore maintenance", () => {
  const root = join(import.meta.dir, "..", "..");
  const worldBuilding = readFileSync(join(root, "docs", "world-building.md"), "utf8");
  const agentNotes = readFileSync(join(root, ".agents.md"), "utf8");

  for (const text of ["The Eight Factions", "Obsidian Sanctum", "Reputation Progression", "Crafting Material Economy"]) {
    expect(worldBuilding.includes(text)).toBe(true);
  }
  expect(agentNotes.includes("./docs/world-building.md")).toBe(true);
  expect(agentNotes.includes("crafting materials")).toBe(true);
});

test("MMO Skill Demo room replication uses lower full-snapshot rates", () => {
  expect(mmoSkillDemoZone.replication).toMatchObject({ snapshotRate: 1, deltaRate: 10 });
  expect(mmoSkillDemoDungeon.replication).toMatchObject({ snapshotRate: 1, deltaRate: 6, maxBytesPerClientPerSecond: 32 * 1024 });
  expect(mmoSkillDemoCottage.replication).toMatchObject({ snapshotRate: 1, deltaRate: 10 });
});

test("MMO Skill Demo replication buckets world event timer to seconds", async () => {
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [mmoSkillDemoZone] });
  const room = server.createRoom("mmo-skill-demo", "timer-bucket");
  const join = await server.joinRoom({ roomId: "timer-bucket", roomType: "mmo-skill-demo", token: "dev:timer" });
  expect(join.ok).toBe(true);

  room.ctx.state.worldEventTimerMs = 59951;

  expect(room.snapshotFor(join.player!.id).worldEventTimerMs).toBe(60000);
});

test("MMO Skill Demo streams segmented world, private, and transient replication", async () => {
  const sent: Array<string | Uint8Array> = [];
  const socket = { send: (data: string | Uint8Array) => { sent.push(data); }, close() {} };
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [mmoSkillDemoZone], replication: { snapshotRate: 1, deltaRate: 20, telemetry: true } });
  const join = await server.joinRoom({ roomId: "segmented-demo", roomType: "mmo-skill-demo", token: "dev:segmented", connection: socket });
  expect(join.ok).toBe(true);

  await server.tick();

  const frame = decodeReplicationFrame(sent.find((data): data is Uint8Array => data instanceof Uint8Array)!);
  const envelope = decodeMultipartReplicationEnvelope<MmoSkillDemoSegmentKind>(frame.bytes);
  const kinds = new Set(envelope.segments.map((segment) => segment.kind));
  const worldVolatile = envelope.segments.find((segment) => segment.kind === "world-cell-volatile");
  const decoded = mmoSkillDemoMultipartCodec.decodeSnapshot(envelope.segments);

  expect(frame.kind).toBe("multipart_snapshot");
  expect(kinds.has("world-cell-volatile")).toBe(true);
  expect(worldVolatile?.bytes[0]).toBe(1);
  if (worldVolatile) {
    const view = new DataView(worldVolatile.bytes.buffer, worldVolatile.bytes.byteOffset, worldVolatile.bytes.byteLength);
    expect(view.getUint16(4, true)).toBe(mmoSkillDemoSharedHotSchema.byteSize);
  }
  expect(kinds.has("world-cell-static")).toBe(true);
  expect(kinds.has("private-volatile")).toBe(true);
  expect(kinds.has("private-static")).toBe(true);
  expect(kinds.has("transient")).toBe(true);
  expect(decoded.players[join.player!.id]).toBeDefined();
  const decodedWorldEntity = [...Object.values(decoded.npcs), ...Object.values(decoded.resources)].find((entity) => entity.hp > 0);
  expect(decodedWorldEntity).toBeDefined();
  expect(Number.isFinite(decodedWorldEntity!.x)).toBe(true);
  expect(Number.isFinite(decodedWorldEntity!.y)).toBe(true);
  expect(decodedWorldEntity!.maxHp).toBeGreaterThanOrEqual(decodedWorldEntity!.hp);
  expect(decodedWorldEntity!.zoneId.length).toBeGreaterThan(0);
  expect(decodedWorldEntity!.kind.length).toBeGreaterThan(0);
  const telemetry = (server.getStats().roomTelemetry[0].room as {
    replication: {
      discovery: { queueDepth: number; maxBacklogAge: number; avgTTD: number };
      adaptive: { staticDeferral?: { reduceStaticRecordsRecommended: boolean } };
    };
  }).replication;
  expect(typeof telemetry.discovery.queueDepth).toBe("number");
  expect(typeof telemetry.discovery.maxBacklogAge).toBe("number");
  expect(typeof telemetry.discovery.avgTTD).toBe("number");
  expect(telemetry.adaptive.staticDeferral?.reduceStaticRecordsRecommended).toBe(false);
});

test("MMO Skill Demo pairs static cell discovery with a full volatile refresh", async () => {
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [mmoSkillDemoZone] });
  const room = server.createRoom("mmo-skill-demo", "static-refresh-demo");
  const join = await server.joinRoom({ roomId: "static-refresh-demo", roomType: "mmo-skill-demo", token: "dev:static-refresh" });
  expect(join.ok).toBe(true);

  const initial = room.replicationFor(join.player!.id, { kind: "snapshot", now: 0 });
  if (!("segments" in initial)) throw new Error("expected segmented replication");
  const initialStaticCell = initial.segments.find((segment) => segment.kind === "world-cell-static" && segment.id.startsWith("world-static-cell:"));
  expect(initialStaticCell).toBeDefined();
  const cellKey = initialStaticCell!.id.slice("world-static-cell:".length);
  const staticEntity = [...Object.values(room.ctx.state.npcs), ...Object.values(room.ctx.state.resources)].find((entity) => mmoSkillDemoCellKey(entity.x, entity.y) === cellKey);
  expect(staticEntity).toBeDefined();

  room.replicationSent(join.player!.id, { sequence: 1, baseline: 0, kind: "multipart_snapshot", segments: initial.segments, now: 0 });
  room.replicationAck(join.player!.id, 1);
  if (staticEntity!.entityType === "npc") staticEntity!.kind = `${staticEntity!.kind}-refresh`;
  else staticEntity!.maxHp += 1;
  await room.update(0);

  const replication = room.replicationFor(join.player!.id, { kind: "delta", previousState: initial.state, now: 100 });
  if (!("segments" in replication)) throw new Error("expected segmented replication");

  const staticCell = replication.segments.find((segment) => segment.kind === "world-cell-static" && segment.id === initialStaticCell!.id);
  expect(staticCell).toBeDefined();
  const volatileRefreshes = replication.segments.filter((segment) => segment.kind === "world-cell-volatile" && segment.id === `cell:${cellKey}:volatile`);

  expect(volatileRefreshes.length).toBeGreaterThanOrEqual(2);
  expect(volatileRefreshes.at(-1)?.bytes[0]).toBe(1);
});

test("MMO Skill Demo retries deferred static cell discovery with a full volatile refresh", async () => {
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [mmoSkillDemoZone] });
  const room = server.createRoom("mmo-skill-demo", "static-deferred-refresh-demo");
  const join = await server.joinRoom({ roomId: "static-deferred-refresh-demo", roomType: "mmo-skill-demo", token: "dev:static-deferred-refresh" });
  expect(join.ok).toBe(true);

  const initial = room.replicationFor(join.player!.id, { kind: "snapshot", now: 0 });
  if (!("segments" in initial)) throw new Error("expected segmented replication");
  const staticCell = initial.segments.find((segment) => segment.kind === "world-cell-static" && segment.id.startsWith("world-static-cell:"));
  expect(staticCell).toBeDefined();
  const cellKey = staticCell!.id.slice("world-static-cell:".length);
  room.replicationSent(join.player!.id, {
    sequence: 1,
    baseline: 0,
    kind: "multipart_snapshot",
    segments: initial.segments.filter((segment) => !segment.kind.includes("static")),
    now: 0
  });

  const retry = room.replicationFor(join.player!.id, { kind: "delta", previousState: initial.state, now: 100 });
  if (!("segments" in retry)) throw new Error("expected segmented replication");

  expect(retry.segments.some((segment) => segment.kind === "world-cell-static" && segment.id === staticCell!.id)).toBe(true);
  expect(retry.segments.some((segment) => segment.kind === "world-cell-volatile" && segment.id === `cell:${cellKey}:volatile` && segment.bytes[0] === 1)).toBe(true);
});

test("MMO Skill Demo keeps static metadata when a player re-enters an acked cell", async () => {
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [mmoSkillDemoZone] });
  const room = server.createRoom("mmo-skill-demo", "static-cell-reentry-demo");
  const join = await server.joinRoom({ roomId: "static-cell-reentry-demo", roomType: "mmo-skill-demo", token: "dev:static-reentry" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const target = Object.values(room.ctx.state.npcs).find((npc) => npc.hp > 0 && npc.x > 18_000)!;
  expect(target).toBeDefined();
  const targetCell = mmoSkillDemoCellKey(target.x, target.y);
  let decoded: ReturnType<typeof mmoSkillDemoMultipartCodec.decodeSnapshot> | undefined;
  let previousState: MmoSkillDemoState | undefined;
  let sequence = 0;

  const movePlayerTo = async (x: number, y: number, zoneId: typeof player.zoneId) => {
    player.x = x;
    player.y = y;
    player.zoneId = zoneId;
    syncMmoEntityRegistry(room.ctx.state);
    await room.update(0);
  };
  const replicate = (kind: "snapshot" | "delta", now: number) => {
    const replication = room.replicationFor(player.id, { kind, previousState, now });
    if (!("segments" in replication)) throw new Error("expected segmented replication");
    decoded = decoded
      ? mmoSkillDemoMultipartCodec.decodeDelta(typedMmoSegments(replication.segments), decoded)
      : mmoSkillDemoMultipartCodec.decodeSnapshot(typedMmoSegments(replication.segments));
    sequence += 1;
    room.replicationSent(player.id, {
      sequence,
      baseline: sequence - 1,
      kind: kind === "snapshot" ? "multipart_snapshot" : "multipart_delta",
      segments: replication.segments,
      now
    });
    room.replicationAck(player.id, sequence);
    previousState = replication.state;
    return replication;
  };

  await movePlayerTo(target.x, target.y, target.zoneId);
  const visibleCells = new Set(mmoSkillDemoNeighborCellKeys(player.x, player.y));
  const occupiedCells = new Set(
    Object.values(room.ctx.state.entities)
      .filter((entity) => entity.entityType !== "player" && visibleCells.has(mmoSkillDemoCellKey(entity.x, entity.y)))
      .map((entity) => mmoSkillDemoCellKey(entity.x, entity.y))
  );
  expect(occupiedCells.size).toBeGreaterThan(1);

  const firstVisit = replicate("snapshot", 0);
  const sentStaticCells = new Set(
    firstVisit.segments
      .filter((segment) => segment.kind === "world-cell-static" && segment.id.startsWith("world-static-cell:"))
      .map((segment) => segment.id.slice("world-static-cell:".length))
  );
  for (const cell of occupiedCells) expect(sentStaticCells.has(cell)).toBe(true);
  expect(decoded!.entities[target.id]).toBeDefined();

  const oakhaven = getMmoSkillDemoAnchorTile("oakhaven");
  await movePlayerTo(oakhaven.x * TILE, oakhaven.y * TILE, "ashwood");
  replicate("delta", 100);
  expect(decoded!.entities[target.id]).toBeUndefined();

  await movePlayerTo(target.x, target.y, target.zoneId);
  const returned = replicate("delta", 200);
  expect(returned.segments.some((segment) => segment.kind === "world-cell-static" && segment.id === `world-static-cell:${targetCell}`)).toBe(false);
  expect(decoded!.entities[target.id]).toBeDefined();
  const returnedTarget = decoded!.entities[target.id];
  if (returnedTarget.entityType !== "npc" && returnedTarget.entityType !== "resource") throw new Error("expected NPC or resource");
  expect(returnedTarget.kind).toBe(target.kind);
});

test("MMO Skill Demo multipart decode preserves NPC health for hit readbacks", async () => {
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [mmoSkillDemoZone] });
  const room = server.createRoom("mmo-skill-demo", "npc-hit-replication-demo");
  const join = await server.joinRoom({ roomId: "npc-hit-replication-demo", roomType: "mmo-skill-demo", token: "dev:npc-hit-replication" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 36;
  player.y = wolf.y;
  player.combatLevel = 8;
  player.cooldownMs = 0;

  let before = undefined as ReturnType<typeof mmoSkillDemoMultipartCodec.decodeSnapshot> | undefined;
  let previousState = undefined as typeof room.ctx.state | undefined;
  for (let attempt = 0; attempt < 6 && !before?.npcs[wolf.id]; attempt += 1) {
    const replication = room.replicationFor(player.id, { kind: attempt === 0 ? "snapshot" : "delta", previousState, now: attempt * 100 });
    if (!("segments" in replication)) throw new Error("expected segmented replication");
    before = attempt === 0
      ? mmoSkillDemoMultipartCodec.decodeSnapshot(typedMmoSegments(replication.segments))
      : mmoSkillDemoMultipartCodec.decodeDelta(typedMmoSegments(replication.segments), before);
    room.replicationSent(player.id, { sequence: attempt + 1, baseline: attempt, kind: attempt === 0 ? "multipart_snapshot" : "multipart_delta", segments: replication.segments, now: attempt * 100 });
    room.replicationAck(player.id, attempt + 1);
    previousState = replication.state;
  }
  const beforeWolf = before?.npcs[wolf.id];
  expect(beforeWolf).toBeDefined();
  if (!beforeWolf) throw new Error("expected replicated wolf");
  expect(beforeWolf.maxHp).toBe(wolf.maxHp);
  expect(beforeWolf.zoneId).toBe(wolf.zoneId);

  await tapPummel(server, player.id, { action: "lmb", targetId: wolf.id, aimX: wolf.x, aimY: wolf.y });

  const afterReplication = room.replicationFor(player.id, { kind: "delta", previousState, now: 700 });
  if (!("segments" in afterReplication)) throw new Error("expected segmented replication");
  const after = mmoSkillDemoMultipartCodec.decodeDelta(typedMmoSegments(afterReplication.segments), before);

  expect(after.npcs[wolf.id].hp).toBeLessThan(beforeWolf.hp);
  expect(after.npcs[wolf.id].maxHp).toBe(beforeWolf.maxHp);
});

test("MMO Skill Demo hot player fields use shared schema accessors", async () => {
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [mmoSkillDemoZone] });
  const room = server.createRoom("mmo-skill-demo", "shared-hot-demo");
  const join = await server.joinRoom({ roomId: "shared-hot-demo", roomType: "mmo-skill-demo", token: "dev:shared-hot" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  player.x = 123.5;
  player.y = 456.25;
  player.hp = 77;
  player.action = "lmb";
  player.targetId = "npc-rowan";
  player.combatFlags = "hex:2|antiheal";

  const bytes = mmoSkillDemoSharedHotBytesForEntity(room.ctx.state, player.id)!;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getFloat32(mmoSkillDemoSharedHotSchema.fieldMap.x.offset, true)).toBe(123.5);
  expect(view.getFloat32(mmoSkillDemoSharedHotSchema.fieldMap.y.offset, true)).toBe(456.25);
  expect(view.getUint16(mmoSkillDemoSharedHotSchema.fieldMap.hp.offset, true)).toBe(77);
  expect(view.getUint8(mmoSkillDemoSharedHotSchema.fieldMap.action.offset)).toBe(mmoSkillDemoActionCode("lmb"));
  expect(view.getUint32(mmoSkillDemoSharedHotSchema.fieldMap.targetId.offset, true)).toBe(mmoSkillDemoEntityIdCode("npc-rowan"));
  expect(view.getUint32(mmoSkillDemoSharedHotSchema.fieldMap.statusMask.offset, true)).toBe(mmoSkillDemoStatusMask("hex:2|antiheal"));
});

test("MMO Skill Demo dirty shared slabs preserve previous hot fields for clean rows", () => {
  const state = createMmoSkillDemoState();
  syncMmoEntityRegistry(state);
  const wolf = Object.values(state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  wolf.x = 321;
  wolf.y = 654;
  wolf.hp = 77;

  const headerBytes = 8 + 16;
  const bytes = new Uint8Array(headerBytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  bytes[0] = 2;
  view.setUint16(2, 1, true);
  view.setUint16(4, mmoSkillDemoSharedHotSchema.byteSize, true);
  view.setUint16(6, headerBytes, true);
  view.setUint32(8, mmoSkillDemoEntityIdCode(wolf.id), true);
  view.setUint32(12, 0, true);
  bytes[16] = 2;
  bytes[17] = 0;
  view.setUint16(18, headerBytes, true);
  view.setUint16(20, 0, true);

  const decoded = mmoSkillDemoMultipartCodec.decodeDelta([{ id: "cell:test:volatile", kind: "world-cell-volatile", bytes }], state);
  expect(decoded.npcs[wolf.id].x).toBe(321);
  expect(decoded.npcs[wolf.id].y).toBe(654);
  expect(decoded.npcs[wolf.id].hp).toBe(77);
});

test("MMO Skill Demo shared-hot typed indices stay in sync with entity views", () => {
  const state = createMmoSkillDemoState("cottage");
  const makeHazard = (id: string, x: number) => ({
    id,
    entityType: "hazard" as const,
    kind: "line" as const,
    zoneId: "cottage" as const,
    ownerId: "",
    x,
    y: 48,
    toX: x + 24,
    toY: 48,
    radius: 8,
    windupMs: 0,
    lifetimeMs: 1000,
    damage: 0,
    knockbackModifier: 0,
    isHeavyImpact: false,
    armorPierce: false,
    effectKind: "test-index",
    text: "",
    pulse: 0
  });

  state.hazards["index-hazard-a"] = makeHazard("index-hazard-a", 64);
  syncMmoEntityRegistry(state);

  const firstSlot = mmoSkillDemoSharedHotSlotForEntityType(state, "hazard", 0);
  expect(Object.keys(state.hazards)).toContain("index-hazard-a");
  expect(mmoSkillDemoEntityTypeCount(state, "hazard")).toBe(1);
  expect(firstSlot).toBeNumber();
  expect(mmoSkillDemoSharedHotBytesForEntity(state, "index-hazard-a")).toBeDefined();

  removeMmoSkillDemoEntity(state, "index-hazard-a");

  expect(Object.keys(state.hazards)).not.toContain("index-hazard-a");
  expect(mmoSkillDemoEntityTypeCount(state, "hazard")).toBe(0);
  expect(mmoSkillDemoSharedHotBytesForEntity(state, "index-hazard-a")).toBeUndefined();

  state.hazards["index-hazard-b"] = makeHazard("index-hazard-b", 96);
  syncMmoEntityRegistry(state);

  expect(Object.keys(state.hazards)).toEqual(["index-hazard-b"]);
  expect(mmoSkillDemoEntityTypeCount(state, "hazard")).toBe(1);
  expect(mmoSkillDemoSharedHotSlotForEntityType(state, "hazard", 0)).toBeNumber();
});

test("MMO Skill Demo does not resend acked static segments without a signature change", async () => {
  let now = 0;
  const sent: Array<string | Uint8Array> = [];
  const socket = { send: (data: string | Uint8Array) => { sent.push(data); }, close() {} };
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone],
    now: () => now,
    replication: { snapshotRate: 1, deltaRate: 20 }
  });
  const join = await server.joinRoom({ roomId: "static-ack-demo", roomType: "mmo-skill-demo", token: "dev:static-ack", connection: socket });
  expect(join.ok).toBe(true);

  await server.tick();
  const initialFrame = decodeReplicationFrame(sent.find((data): data is Uint8Array => data instanceof Uint8Array)!);
  const initialStaticIds = new Set(decodeMultipartReplicationEnvelope(initialFrame.bytes).segments.filter((segment) => segment.kind.includes("static")).map((segment) => segment.id));
  expect(initialStaticIds.size).toBeGreaterThan(0);
  join.room!.replicationAck(join.player!.id, initialFrame.sequence);
  sent.length = 0;
  now = 100;
  await server.tick();

  const nextFrame = decodeReplicationFrame(sent.find((data): data is Uint8Array => data instanceof Uint8Array)!);
  const repeatedAckedStatic = decodeMultipartReplicationEnvelope(nextFrame.bytes).segments.some((segment) => segment.kind.includes("static") && initialStaticIds.has(segment.id));
  expect(repeatedAckedStatic).toBe(false);
});

test("MMO Skill Demo shared-world anchors are spaced into readable progression regions", () => {
  const oakhaven = getMmoSkillDemoAnchorTile("oakhaven");
  const ironcrag = getMmoSkillDemoAnchorTile("ironcrag");
  const aetheria = getMmoSkillDemoAnchorTile("aetheria");
  const voidRift = getMmoSkillDemoAnchorTile("void-rift");
  const distance = (a: typeof oakhaven, b: typeof oakhaven) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  expect(distance(oakhaven, ironcrag)).toBeGreaterThanOrEqual(56);
  expect(distance(oakhaven, aetheria)).toBeGreaterThanOrEqual(90);
  expect(distance(ironcrag, aetheria)).toBeGreaterThanOrEqual(90);
  expect(zoneForMmoSkillDemoTile(oakhaven.x, oakhaven.y)).toBe("ashwood");
  expect(zoneForMmoSkillDemoTile(ironcrag.x, ironcrag.y)).toBe("crags");
  expect(zoneForMmoSkillDemoTile(aetheria.x, aetheria.y)).toBe("port-marrow");
  expect(voidRift.x).toBeGreaterThan(aetheria.x);
  expect(voidRift.y).toBeLessThan(aetheria.y);
});

test("MMO Skill Demo schema encodes extracted resources", () => {
  const state = createMmoSkillDemoState();
  const bytes = encodeSnapshot(mmoSkillDemoSchema, state);
  const decoded = attachMmoEntityViews(decodeSnapshot(mmoSkillDemoSchema, bytes));
  const resourceEntities = Object.values(decoded.entities).filter((entity) => entity.entityType === "resource");

  expect(extractMmoSkillDemoResources().some((node) => node.kind === "tree")).toBe(true);
  expect(extractMmoSkillDemoResources().some((node) => node.kind === "ore")).toBe(true);
  expect(resourceEntities.length).toBe(Object.keys(state.resources).length);
  expect(Object.keys(decoded.resources).length).toBe(Object.keys(state.resources).length);
});

test("MMO Skill Demo schema uses map inventory fields and omits legacy scalars", () => {
  const schemaSource = JSON.stringify(mmoSkillDemoSchema.definition);
  for (const field of ["inventory", "bank", "equipment", "abilitySlots", "questFlags"]) {
    expect(schemaSource).toContain(`"${field}"`);
  }
  for (const field of [
    "ashLogs",
    "ironOre",
    "silkThread",
    "gladeBerries",
    "cinderAle",
    "speedPotions",
    "bankedAshLogs",
    "bankedIronOre",
    "inventoryFlags",
    "equipmentFlags",
    "knownAbilities",
    "unlockedSlots",
    "questBits"
  ]) {
    expect(schemaSource).not.toContain(`"${field}"`);
  }
});

test("MMO Skill Demo state serializes entities without parallel entity maps", () => {
  const state = createMmoSkillDemoState();
  const stateKeys = Object.keys(state);
  expect(stateKeys).toContain("entities");
  for (const field of ["players", "npcs", "resources", "loots", "hazards"]) {
    expect(stateKeys).not.toContain(field);
  }

  const decoded = attachMmoEntityViews(decodeSnapshot(mmoSkillDemoSchema, encodeSnapshot(mmoSkillDemoSchema, state)));
  expect(Object.keys(decoded)).not.toContain("players");
  expect(Object.keys(decoded.resources).length).toBeGreaterThan(0);
});

test("MMO Skill Demo client entity views do not require browser SharedArrayBuffer", () => {
  const state = createMmoSkillDemoState();
  const bytes = encodeSnapshot(mmoSkillDemoSchema, state);
  const decoded = decodeSnapshot(mmoSkillDemoClientSchema, bytes);
  const sharedArrayBufferDescriptor = Object.getOwnPropertyDescriptor(globalThis, "SharedArrayBuffer");

  try {
    Object.defineProperty(globalThis, "SharedArrayBuffer", { value: undefined, configurable: true, writable: true });
    expect(() => attachMmoEntityViews(decoded)).not.toThrow();
    expect(Object.keys(decoded.resources).length).toBe(Object.keys(state.resources).length);
  } finally {
    if (sharedArrayBufferDescriptor) Object.defineProperty(globalThis, "SharedArrayBuffer", sharedArrayBufferDescriptor);
  }
});

test("MMO Skill Demo server and browser schemas stay wire-compatible", () => {
  const state = createMmoSkillDemoState();
  state.loots["loot-test"] = {
    id: "loot-test",
    entityType: "loot",
    itemId: "gold",
    amount: 7,
    zoneId: "ashwood",
    x: 100,
    y: 120,
    ownerId: "",
    expiresMs: 12000,
    pickupRadius: 32
  };
  syncMmoEntityRegistry(state);
  const serverBytes = encodeSnapshot(mmoSkillDemoSchema, state);
  const decodedByClient = attachMmoEntityViews(decodeSnapshot(mmoSkillDemoClientSchema, serverBytes));
  const clientBytes = encodeSnapshot(mmoSkillDemoClientSchema, decodedByClient);
  const decodedByServer = attachMmoEntityViews(decodeSnapshot(mmoSkillDemoSchema, clientBytes));

  expect(decodedByClient.mapRevision).toBe(state.mapRevision);
  expect(decodedByClient.entities["loot-test"].entityType).toBe("loot");
  expect(decodedByClient.loots["loot-test"].itemId).toBe("gold");
  expect(Object.keys(decodedByClient.npcs).length).toBe(Object.keys(state.npcs).length);
  expect(decodedByServer.loots["loot-test"].amount).toBe(7);
  expect(Object.keys(decodedByServer.resources).length).toBe(Object.keys(state.resources).length);
});

test("MMO Skill Demo normalized snapshots keep owner-only loot private", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "loot-visibility");
  const ownerJoin = await server.joinRoom({ roomId: "loot-visibility", roomType: "mmo-skill-demo", token: "dev:owner" });
  const bystanderJoin = await server.joinRoom({ roomId: "loot-visibility", roomType: "mmo-skill-demo", token: "dev:bystander" });
  expect(ownerJoin.ok).toBe(true);
  expect(bystanderJoin.ok).toBe(true);

  const owner = room.ctx.state.players[ownerJoin.player!.id];
  const bystander = room.ctx.state.players[bystanderJoin.player!.id];
  bystander.x = owner.x + 12;
  bystander.y = owner.y;
  bystander.zoneId = owner.zoneId;
  room.ctx.state.loots["private-drop"] = {
    id: "private-drop",
    entityType: "loot",
    itemId: "gold",
    amount: 5,
    zoneId: owner.zoneId,
    x: owner.x + 8,
    y: owner.y,
    ownerId: owner.id,
    expiresMs: 12000,
    pickupRadius: 32
  };
  syncMmoEntityRegistry(room.ctx.state);
  await server.tick(0);

  const ownerSnapshot = mmoSkillDemoZone.getSnapshot!(room.ctx, ownerJoin.player!);
  const bystanderSnapshot = mmoSkillDemoZone.getSnapshot!(room.ctx, bystanderJoin.player!);

  expect(ownerSnapshot.entities["private-drop"]?.entityType).toBe("loot");
  expect(bystanderSnapshot.entities["private-drop"]).toBeUndefined();
  expect(bystanderSnapshot.loots["private-drop"]).toBeUndefined();
});

test("MMO Skill Demo boss sprite sheets resolve within one stable front row", () => {
  const firstMeta = spriteSheetMetaForSize(3360, 2880);
  const first = firstMeta ? resolveSpriteSheetFrame({ width: 3360, height: 2880, timeMs: 0, ...firstMeta }) : undefined;
  const later = firstMeta ? resolveSpriteSheetFrame({ width: 3360, height: 2880, timeMs: 150 * 12, ...firstMeta }) : undefined;
  const singleMeta = spriteSheetMetaForSize(700, 700);
  const single = singleMeta ? resolveSpriteSheetFrame({ width: 700, height: 700, timeMs: 0, ...singleMeta }) : undefined;

  expect(first).toMatchObject({ sx: 180, sy: 0, sw: 480, sh: 480, frames: 4 });
  expect(later?.sy).toBe(0);
  expect(later?.sx).toBeLessThan(3360);
  expect(single).toBeUndefined();
});

test("MMO Skill Demo collision kernel loads wasm backend for action hits", async () => {
  const kernel = await createMmoSkillDemoCollisionKernel();

  expect(kernel.backend).toBe("wasm");
  expect(kernel.testCircleRectOverlap(10, 10, 8, 12, 12, 8, 8)).toBe(true);
});

test("MMO Skill Demo public zone admits 100 players and rejects the 101st", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  server.createRoom("mmo-skill-demo", "ashwood-test");

  for (let i = 0; i < 100; i += 1) {
    const result = await server.joinRoom({ roomId: "ashwood-test", roomType: "mmo-skill-demo", token: `dev:p${i}` });
    expect(result.ok).toBe(true);
  }
  const overflow = await server.joinRoom({ roomId: "ashwood-test", roomType: "mmo-skill-demo", token: "dev:p100" });
  expect(overflow.ok).toBe(false);
});

test("MMO Skill Demo preset creates 10 public rooms", () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone],
    scale: createMmo1000Preset({ publicRoomType: "mmo-skill-demo", publicRoomPrefix: "mmo-field", publicRooms: 10 })
  });

  expect(server.rooms().filter((room) => room.id.startsWith("mmo-field-"))).toHaveLength(10);
});

test("MMO Skill Demo 1000 implicit joins distribute over 10 public rooms", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone],
    scale: createMmo1000Preset({ publicRoomType: "mmo-skill-demo", publicRoomPrefix: "mmo-field", publicRooms: 10 })
  });

  for (let i = 0; i < 1000; i += 1) {
    const result = await server.joinRoom({ token: `dev:scale-${i}` });
    expect(result.ok).toBe(true);
  }

  const loads = server
    .rooms()
    .filter((room) => room.id.startsWith("mmo-field-"))
    .map((room) => room.ctx.players.size);
  expect(Math.max(...loads)).toBe(100);
  expect(Math.max(...loads) - Math.min(...loads)).toBe(0);
  expect(await server.joinRoom({ token: "dev:scale-overflow" })).toMatchObject({ ok: false, reason: "world full" });
});

test("MMO Skill Demo inputs advance schema-owned combat and gathering state", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "ashwood-action");
  const join = await server.joinRoom({ roomId: "ashwood-action", roomType: "mmo-skill-demo", token: "dev:alice" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const goblin = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.x = goblin.x - 34;
  player.y = goblin.y;
  await tapPummel(server, player.id, { action: "attack", targetId: goblin.id });
  expect(room.ctx.state.npcs[goblin.id].hp).toBeLessThan(goblin.maxHp);
  expect(room.ctx.state.effects.some((effect) => effect.effectKind === "damage" && effect.text.startsWith("-"))).toBe(true);
  expect(room.ctx.state.players[player.id].combatXp).toBeGreaterThan(0);

  const ore = Object.values(room.ctx.state.resources).find((node) => node.kind === "ore")!;
  player.x = ore.x - 34;
  player.y = ore.y;
  addItem(player, "pickaxe");
  player.cooldownMs = 0;
  await server.receiveInput(player.id, { action: "mine", targetId: ore.id });
  await server.tick(4.1);
  expect(room.ctx.state.players[player.id].miningXp).toBeGreaterThan(0);
});

test("MMO Skill Demo gathering starts a server-authoritative duration meter", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "gather-level-cooldown");
  const join = await server.joinRoom({ roomId: "gather-level-cooldown", roomType: "mmo-skill-demo", token: "dev:gather-speed" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const ore = Object.values(room.ctx.state.resources).find((node) => node.kind === "ore")!;
  player.zoneId = ore.zoneId;
  player.x = ore.x - 34;
  player.y = ore.y;
  addItem(player, "pickaxe");

  await server.receiveInput(player.id, { action: "mine", targetId: ore.id });
  await server.tick(0);
  expect(player.activeGatherNodeId).toBe(ore.id);
  expect(player.activeGatherTotalMs).toBe(4000);
  expect(player.activeGatherMs).toBe(0);

  await server.tick(2);
  expect(player.activeGatherMs).toBe(2000);
  expect(ore.depleted).toBe(false);

  await server.tick(2.1);
  expect(player.activeGatherNodeId).toBe("");
  expect(ore.depleted).toBe(true);
  expect(player.miningXp).toBeGreaterThan(0);
});

test("MMO Skill Demo interact button starts resource gathering", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "interact-gather-resource");
  const join = await server.joinRoom({ roomId: "interact-gather-resource", roomType: "mmo-skill-demo", token: "dev:interact-gather" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const tree = Object.values(room.ctx.state.resources).find((node) => node.kind === "tree")!;
  tree.skillId = "lumberjacking";
  tree.materialId = 1;
  player.zoneId = tree.zoneId;
  player.x = tree.x - 34;
  player.y = tree.y;
  addItem(player, "training-hatchet");

  await server.receiveInput(player.id, { action: "interact", targetId: tree.id });
  await server.tick(0);
  expect(player.action).toBe("woodcut");
  expect(player.activeGatherNodeId).toBe(tree.id);

  await server.tick(4.1);
  expect(tree.depleted).toBe(true);
  expect(player.woodcuttingXp).toBeGreaterThan(0);
});

test("MMO Skill Demo low-level gathering shows readable feedback", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "low-level-gather-feedback");
  const join = await server.joinRoom({ roomId: "low-level-gather-feedback", roomType: "mmo-skill-demo", token: "dev:low-level-gather" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const tree = Object.values(room.ctx.state.resources).find((node) => node.kind === "tree")!;
  tree.skillId = "lumberjacking";
  tree.materialId = 2;
  player.zoneId = tree.zoneId;
  player.x = tree.x - 34;
  player.y = tree.y;
  addItem(player, "training-hatchet");

  await server.receiveInput(player.id, { action: "interact", targetId: tree.id });
  await server.tick(0);

  expect(player.activeGatherNodeId).toBe("");
  expect(tree.depleted).toBe(false);
  expect(room.ctx.state.effects.some((effect) => effect.effectKind === "damage" && effect.text === "Too low level")).toBe(true);
});

test("MMO Skill Demo gathering missing tool shows readable feedback", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "missing-tool-gather-feedback");
  const join = await server.joinRoom({ roomId: "missing-tool-gather-feedback", roomType: "mmo-skill-demo", token: "dev:missing-tool-gather" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const spec = worldGatherableNodeSpecs.find((node) => node.materialName === "Twilight Sky-Oats")!;
  const node = room.ctx.state.resources[spec.id]!;
  player.zoneId = node.zoneId;
  player.x = node.x - 24;
  player.y = node.y;
  player.gatheringXp = { ...(player.gatheringXp ?? {}), "crop-harvesting": totalXpForLevel(60) };

  await server.receiveInput(player.id, { action: "interact", targetId: node.id });
  await server.tick(0);

  expect(player.activeGatherNodeId).toBe("");
  expect(node.depleted).toBe(false);
  expect(room.ctx.state.effects.some((effect) => effect.effectKind === "damage" && effect.text === "Need Sickle")).toBe(true);
});

test("MMO Skill Demo gathering aborts show readable feedback", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "moved-gather-feedback");
  const join = await server.joinRoom({ roomId: "moved-gather-feedback", roomType: "mmo-skill-demo", token: "dev:moved-gather" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const tree = Object.values(room.ctx.state.resources).find((node) => node.kind === "tree")!;
  player.zoneId = tree.zoneId;
  player.x = tree.x - 24;
  player.y = tree.y;
  addItem(player, "training-hatchet");

  await server.receiveInput(player.id, { action: "interact", targetId: tree.id });
  await server.tick(0);
  expect(player.activeGatherNodeId).toBe(tree.id);

  player.x += 8;
  await server.tick(0.1);

  expect(player.activeGatherNodeId).toBe("");
  expect(room.ctx.state.effects.some((effect) => effect.effectKind === "damage" && effect.text === "Moved")).toBe(true);
});

test("MMO Skill Demo gathering clears momentum drift instead of aborting", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "momentum-gather");
  const join = await server.joinRoom({ roomId: "momentum-gather", roomType: "mmo-skill-demo", token: "dev:momentum-gather" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const tree = Object.values(room.ctx.state.resources).find((node) => node.kind === "tree")!;
  player.zoneId = tree.zoneId;
  player.x = tree.x - 24;
  player.y = tree.y;
  addItem(player, "training-hatchet");

  await server.receiveInput(player.id, { action: "idle", dx: 1, dy: 0, aimX: player.x + 500, aimY: player.y });
  await server.tick(0.5);
  expect(Math.hypot(player.momentumX ?? 0, player.momentumY ?? 0)).toBeGreaterThan(0);

  player.x = tree.x - 24;
  player.y = tree.y;
  await server.receiveInput(player.id, { action: "interact", targetId: tree.id, dx: 0, dy: 0 });
  await server.tick(0);
  expect(player.activeGatherNodeId).toBe(tree.id);
  expect(Math.hypot(player.momentumX ?? 0, player.momentumY ?? 0)).toBe(0);

  await server.receiveInput(player.id, { action: "idle", dx: 0, dy: 0 });
  await server.tick(0);
  await server.tick(0);

  expect(player.activeGatherNodeId).toBe(tree.id);
  expect(room.ctx.state.effects.some((effect) => effect.effectKind === "damage" && effect.text === "Moved")).toBe(false);
});

test("MMO Skill Demo gathering grants faction reputation and world materials", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "expanded-gather-rep");
  const join = await server.joinRoom({ roomId: "expanded-gather-rep", roomType: "mmo-skill-demo", token: "dev:expanded-gather" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const tree = Object.values(room.ctx.state.resources).find((node) => node.kind === "tree")!;
  player.zoneId = tree.zoneId;
  player.x = tree.x - 34;
  player.y = tree.y;
  addItem(player, "training-hatchet");
  tree.hp = 1;

  await server.receiveInput(player.id, { action: "woodcut", targetId: tree.id });
  await server.tick(4.1);

  const gatheredMaterialTotal = ["oakhaven-softwood", "soft-pine-bark", "oak-sap-extract", "dry-bramble-branch", "bright-clover-flower", "wild-oats-bundle", "bitter-root-herb"]
    .reduce((total, itemId) => total + itemQty(player, itemId), 0);
  expect(tree.depleted).toBe(true);
  expect(itemQty(player, "rep-oakhaven")).toBeGreaterThan(0);
  expect(gatheredMaterialTotal).toBeGreaterThan(0);
});

test("MMO Skill Demo faction reputation unlocks tier rewards through schema-safe flags", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "expanded-rep-reward");
  const join = await server.joinRoom({ roomId: "expanded-rep-reward", roomType: "mmo-skill-demo", token: "dev:rep-reward" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  setItemQty(player, "rep-oakhaven", 24);
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 34;
  player.y = wolf.y;
  wolf.hp = 1;

  await tapPummel(server, player.id, { action: "lmb", targetId: wolf.id });

  expect(itemQty(player, "rep-oakhaven")).toBeGreaterThanOrEqual(25);
  expect(hasQuestFlag(player, "reward-oakhaven-druid-guild-entry")).toBe(true);
  expect(itemQty(player, "elderwood-ash")).toBeGreaterThan(0);
});

test("MMO Skill Demo daily quest branch choices apply server-authoritative reputation and rewards", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "daily-quest-branch");
  const join = await server.joinRoom({ roomId: "daily-quest-branch", roomType: "mmo-skill-demo", token: "dev:daily-quest" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const arc = dailyQuestArcForDate(player.dailyQuestDate);
  const step = arc.steps[0];
  player.dailyQuestStep = 0;
  player.dailyQuestProgress = step.targetCount;
  player.dailyQuestCompleted = false;
  const choice = step.choices[0];
  const beforePrimary = itemQty(player, `rep-${arc.primaryFaction}`);

  await server.receiveInput(player.id, { action: "config", devField: "dailyChoice", devText: choice.id });
  await server.tick(0);

  expect(player.dailyQuestStep).toBe(1);
  expect(player.dailyQuestProgress).toBe(0);
  expect(itemQty(player, `rep-${arc.primaryFaction}`)).toBeGreaterThan(beforePrimary);
  expect(itemQty(player, step.rewardMaterialId)).toBeGreaterThan(0);
  expect(hasQuestFlag(player, `daily:${arc.dateString}:0:${choice.id}`)).toBe(true);
});

test("MMO Skill Demo NPC stations craft representative world materials into gameplay items", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "expanded-crafting");
  const join = await server.joinRoom({ roomId: "expanded-crafting", roomType: "mmo-skill-demo", token: "dev:expanded-craft" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const foreman = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "foreman-iron-will")!;
  const blacksmith = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "blacksmith-silas" && npc.zoneId === "crags")!;
  player.gold = 40;
  addItem(player, "iron-ore", 4);
  addItem(player, "fine-coal-lump", 1);
  player.zoneId = foreman.zoneId;
  player.x = foreman.x - 24;
  player.y = foreman.y;

  await server.receiveInput(player.id, { action: "interact", targetId: foreman.id });
  await server.tick(0);

  expect(itemQty(player, "refined-iron-ingot")).toBe(1);
  expect(itemQty(player, "rep-ironcrag")).toBeGreaterThanOrEqual(2);

  player.cooldownMs = 0;
  player.cooldowns = {};
  addItem(player, "refined-iron-ingot", 1);
  addItem(player, "crawler-chitin-block", 1);
  player.zoneId = blacksmith.zoneId;
  player.x = blacksmith.x - 24;
  player.y = blacksmith.y;

  await server.receiveInput(player.id, { action: "interact", targetId: blacksmith.id });
  await server.tick(0);

  expect(hasInventoryItem(player, "iron-chest")).toBe(true);
  expect(player.equipment["iron-chest"]).toBe("iron-chest");
});

test("MMO Skill Demo bow inventory unlocks configurable bow abilities", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "bow-loadout");
  const join = await server.joinRoom({ roomId: "bow-loadout", roomType: "mmo-skill-demo", token: "dev:archer" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  setItemQty(player, "bow", 1);
  expect(itemQty(player, "bow")).toBe(1);

  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "bow" });
  await server.tick(0);
  expect(player.equippedWeaponId).toBe("bow");
  expect(selectedAbilityForSlot(player, "RMB")).toBe("bow-precision");

  await server.receiveInput(player.id, { action: "config", devField: "RMB", devText: "bow-volley" });
  await server.tick(0);
  expect(selectedAbilityForSlot(player, "RMB")).toBe("bow-volley");

  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 96;
  player.y = wolf.y;
  wolf.hp = wolf.maxHp;
  await server.receiveInput(player.id, { action: "rmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.12);

  expect(wolf.hp).toBeLessThan(wolf.maxHp);
  expect(player.cooldowns.RMB).toBeGreaterThan(0);

  player.energy = 0;
  await server.receiveInput(player.id, { action: "r", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  expect(player.activeAbility).toBe("");

  player.energy = player.maxEnergy;
  await server.receiveInput(player.id, { action: "r", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  expect(player.activeAbility).toBe("bow-flurry");
  expect(player.energy).toBe(0);
});

test("MMO Skill Demo held Quick Shot recasts only after windup and cooldown", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "held-quick-shot-repeat");
  const join = await server.joinRoom({ roomId: "held-quick-shot-repeat", roomType: "mmo-skill-demo", token: "dev:held-quick" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 100;
  player.y = wolf.y;

  setItemQty(player, "bow", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "bow" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "lmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  expect(player.activeAbility).toBe("bow-quick-shot");

  await server.tick(0.12);
  expect(player.activeAbility).toBe("bow-quick-shot");
  expect(player.activeMs).toBeGreaterThanOrEqual(120);

  await server.tick(0.14);
  expect(player.activeAbility).toBe("");
  expect(player.cooldowns.LMB).toBeGreaterThan(0);

  await server.tick(0.05);
  expect(player.activeAbility).toBe("");

  await server.tick(0.06);
  expect(player.activeAbility).toBe("bow-quick-shot");
});

test("MMO Skill Demo staff loadout casts meteor and starts Maelstrom", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "staff-loadout");
  const join = await server.joinRoom({ roomId: "staff-loadout", roomType: "mmo-skill-demo", token: "dev:staff" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  setItemQty(player, "staff", 1);
  expect(itemQty(player, "staff")).toBe(1);

  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "staff" });
  await server.tick(0);
  expect(player.equippedWeaponId).toBe("staff");
  expect(selectedAbilityForSlot(player, "RMB")).toBe("staff-meteor");

  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 120;
  player.y = wolf.y;
  wolf.hp = wolf.maxHp;
  await server.receiveInput(player.id, { action: "rmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(1);

  expect(wolf.hp).toBeLessThan(wolf.maxHp);
  expect(player.cooldowns.RMB).toBeGreaterThan(0);

  player.energy = player.maxEnergy;
  await server.receiveInput(player.id, { action: "r", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  expect(player.activeAbility).toBe("staff-maelstrom");
  expect(player.energy).toBe(0);
});

test("MMO Skill Demo wand Hex stacks feed Rupture", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "wand-loadout");
  const join = await server.joinRoom({ roomId: "wand-loadout", roomType: "mmo-skill-demo", token: "dev:wand" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  setItemQty(player, "wand", 1);
  expect(itemQty(player, "wand")).toBe(1);

  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "wand" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "config", devField: "LMB", devText: "wand-hex" });
  await server.tick(0);
  expect(player.equippedWeaponId).toBe("wand");
  expect(selectedAbilityForSlot(player, "LMB")).toBe("wand-hex");

  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 100;
  player.y = wolf.y;
  wolf.hp = wolf.maxHp;
  wolf.stunMs = 9999;
  await server.receiveInput(player.id, { action: "lmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "idle", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0.26);
  await server.tick(0.35);
  expect(wolf.combatFlags).toContain("hex:1");

  const afterHex = wolf.hp;
  await server.receiveInput(player.id, { action: "e", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.22);

  expect(wolf.hp).toBeLessThan(afterHex);
  expect(wolf.combatFlags).not.toContain("hex:");
  expect(player.cooldowns.E).toBeGreaterThan(0);
});

test("MMO Skill Demo projectile skills use travel time before impact", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "projectile-speed");
  const join = await server.joinRoom({ roomId: "projectile-speed", roomType: "mmo-skill-demo", token: "dev:projectile-speed" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  for (const npc of Object.values(room.ctx.state.npcs)) if (npc.id !== wolf.id) npc.zoneId = "crags";
  setItemQty(player, "staff", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "staff" });
  await server.tick(0);

  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 360;
  player.y = wolf.y;
  wolf.hp = wolf.maxHp;
  wolf.stunMs = 9999;

  await server.receiveInput(player.id, { action: "lmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "idle", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0.31);
  const projectile = Object.values(room.ctx.state.hazards).find((hazard) => hazard.effectKind === "arcane-bolt");
  expect(projectile?.x).toBeCloseTo(player.x + 10, 5);
  expect(projectile?.y).toBeCloseTo(player.y, 5);
  await server.tick(0.2);
  expect(wolf.hp).toBe(wolf.maxHp);

  await server.tick(0.25);
  expect(wolf.hp).toBeLessThan(wolf.maxHp);
});

test("MMO Skill Demo homing projectiles bend toward selected targets", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "projectile-homing");
  const join = await server.joinRoom({ roomId: "projectile-homing", roomType: "mmo-skill-demo", token: "dev:projectile-homing" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  for (const npc of Object.values(room.ctx.state.npcs)) if (npc.id !== wolf.id) npc.zoneId = "crags";
  setItemQty(player, "wand", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "wand" });
  await server.tick(0);

  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 300;
  player.y = wolf.y;
  wolf.hp = wolf.maxHp;
  wolf.stunMs = 9999;

  await server.receiveInput(player.id, { action: "lmb", aimX: wolf.x, aimY: wolf.y + 90 });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "idle", aimX: wolf.x, aimY: wolf.y + 90 });
  await server.tick(0.21);
  expect(wolf.hp).toBe(wolf.maxHp);

  await server.tick(0.65);
  await server.tick(0.35);
  expect(wolf.hp).toBeLessThan(wolf.maxHp);
});

test("MMO Skill Demo Magic Missile uses extended range and tuned payload", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "magic-missile-tuning");
  const join = await server.joinRoom({ roomId: "magic-missile-tuning", roomType: "mmo-skill-demo", token: "dev:magic-missile-tuning" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  for (const npc of Object.values(room.ctx.state.npcs)) if (npc.id !== wolf.id) npc.zoneId = "crags";
  setItemQty(player, "wand", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "wand" });
  await server.tick(0);

  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 520;
  player.y = wolf.y;
  player.combatLevel = 1;
  wolf.hp = wolf.maxHp;
  wolf.stunMs = 9999;

  await server.receiveInput(player.id, { action: "lmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "idle", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0.41);

  const projectile = Object.values(room.ctx.state.hazards).find((hazard) => hazard.effectKind === "missile");
  expect(projectile?.targetId).toBe(wolf.id);
  expect(projectile?.damage).toBe(7);
  expect(projectile?.knockbackModifier).toBeCloseTo(0.18);
  expect(projectile?.lifetimeMs).toBe(320);

  await server.tick(0.35);
  expect(wolf.hp).toBe(wolf.maxHp - 7);
});

test("MMO Skill Demo close wand projectiles leave visible travel traces", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "projectile-traces");
  const join = await server.joinRoom({ roomId: "projectile-traces", roomType: "mmo-skill-demo", token: "dev:projectile-traces" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  for (const npc of Object.values(room.ctx.state.npcs)) if (npc.id !== wolf.id) npc.zoneId = "crags";
  setItemQty(player, "wand", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "wand" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "config", devField: "LMB", devText: "wand-hex" });
  await server.tick(0);

  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 70;
  player.y = wolf.y;
  wolf.hp = wolf.maxHp;
  wolf.stunMs = 9999;
  await server.receiveInput(player.id, { action: "lmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "idle", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0.26);
  expect(room.ctx.state.effects.some((effect) => effect.kind === "line" && effect.effectKind === "hex")).toBe(true);
  await server.tick(0.2);
  expect(wolf.combatFlags).toContain("hex:1");
  expect(room.ctx.state.effects.some((effect) => effect.kind === "line" && effect.effectKind === "hex")).toBe(true);

  player.energy = player.maxEnergy;
  player.x = wolf.x - 80;
  player.y = wolf.y;
  await server.receiveInput(player.id, { action: "r", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.21);
  await server.tick(0.13);
  expect(room.ctx.state.effects.some((effect) => effect.kind === "line" && effect.effectKind === "chaos")).toBe(true);
});

test("MMO Skill Demo twin blades poison feeds Exsanguinate", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "twin-blades-loadout");
  const join = await server.joinRoom({ roomId: "twin-blades-loadout", roomType: "mmo-skill-demo", token: "dev:twin" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  setItemQty(player, "twin-blades", 1);
  expect(itemQty(player, "twin-blades")).toBe(1);

  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "twin-blades" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "config", devField: "LMB", devText: "twin-toxic-slash" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "config", devField: "RMB", devText: "twin-exsanguinate" });
  await server.tick(0);
  expect(player.equippedWeaponId).toBe("twin-blades");
  expect(selectedAbilityForSlot(player, "LMB")).toBe("twin-toxic-slash");

  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 50;
  player.y = wolf.y;
  wolf.hp = wolf.maxHp;
  await server.receiveInput(player.id, { action: "lmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.26);
  expect(wolf.combatFlags).toContain("poison:");

  const afterPoison = wolf.hp;
  player.x = wolf.x - 50;
  player.y = wolf.y;
  await server.receiveInput(player.id, { action: "rmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.26);

  expect(wolf.hp).toBeLessThan(afterPoison);
  expect(wolf.combatFlags).not.toContain("poison:");
  expect(player.cooldowns.RMB).toBeGreaterThan(0);
  expect(() => encodeSnapshot(mmoSkillDemoSchema, room.ctx.state)).not.toThrow();
});

test("MMO Skill Demo melee basics dash before firing", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "melee-prefire-dash");
  const join = await server.joinRoom({ roomId: "melee-prefire-dash", roomType: "mmo-skill-demo", token: "dev:melee-dash" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  setItemQty(player, "twin-blades", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "twin-blades" });
  await server.tick(0);

  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 80;
  player.y = wolf.y;
  wolf.hp = wolf.maxHp;
  wolf.stunMs = 9999;
  const startX = player.x;
  const pmsps = defaultPlayerPmsps(player);

  await server.receiveInput(player.id, { action: "lmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.21);

  expect(player.x - startX).toBeGreaterThan(pmsps * 0.15 - 1);
  expect(player.x - startX).toBeLessThan(pmsps * 0.15 + 1);
  expect(wolf.hp).toBeLessThan(wolf.maxHp);
});

test("MMO Skill Demo Space dashes use pmsps movement ranges", async () => {
  const cases = [
    { roomId: "space-dash-bow-reposition", weapon: "bow", ability: "bow-reposition", seconds: 0.31, expected: 1.4, sign: 1 },
    { roomId: "space-dash-bow-vault", weapon: "bow", ability: "bow-vault", seconds: 0.46, expected: 0.85, sign: -1 },
    { roomId: "space-dash-blade-roll", weapon: "blade", ability: "blade-combat-roll", seconds: 0.36, expected: 1.6, sign: 1 },
    { roomId: "space-dash-blade-leap", weapon: "blade", ability: "blade-leap-attack", seconds: 0.61, expected: 2.15, sign: 1 }
  ] as const;

  for (const dashCase of cases) {
    const server = createAuthoritativeServer({
      transport: "websocket",
      port: 0,
      rooms: [mmoSkillDemoZone]
    });
    const room = server.createRoom("mmo-skill-demo", dashCase.roomId);
    const join = await server.joinRoom({ roomId: dashCase.roomId, roomType: "mmo-skill-demo", token: `dev:${dashCase.roomId}` });
    expect(join.ok).toBe(true);

    const player = room.ctx.state.players[join.player!.id];
    const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
    for (const npc of Object.values(room.ctx.state.npcs)) npc.zoneId = "crags";
    setItemQty(player, dashCase.weapon, 1);
    await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: dashCase.weapon });
    await server.tick(0);
    await server.receiveInput(player.id, { action: "config", devField: "Space", devText: dashCase.ability });
    await server.tick(0);

    player.zoneId = wolf.zoneId;
    player.x = wolf.x + 220;
    player.y = wolf.y + 90;
    player.cooldowns.Space = 0;
    player.cooldownMs = 0;
    const startX = player.x;
    const pmsps = defaultPlayerPmsps(player);

    await server.receiveInput(player.id, { action: "space", aimX: startX + 500, aimY: player.y });
    await server.tick(0);
    await server.tick(dashCase.seconds);

    const moved = player.x - startX;
    expect(moved * dashCase.sign).toBeGreaterThan(pmsps * dashCase.expected - 3);
    expect(moved * dashCase.sign).toBeLessThan(pmsps * dashCase.expected + 3);
    expect(player.activeAbility).toBe("");
  }
});

test("MMO Skill Demo blade loadout charges Razor Wind and gates Omnislash", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "blade-loadout");
  const join = await server.joinRoom({ roomId: "blade-loadout", roomType: "mmo-skill-demo", token: "dev:blade" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  setItemQty(player, "blade", 1);
  expect(itemQty(player, "blade")).toBe(1);

  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "blade" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "config", devField: "E", devText: "blade-razor-wind" });
  await server.tick(0);
  expect(player.equippedWeaponId).toBe("blade");
  expect(selectedAbilityForSlot(player, "RMB")).toBe("blade-brutal-strike");

  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 220;
  player.y = wolf.y;
  wolf.hp = wolf.maxHp;
  wolf.stunMs = 9999;
  await server.receiveInput(player.id, { action: "e", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(1.05);
  await server.tick(0.65);
  expect(wolf.hp).toBeLessThan(wolf.maxHp);
  expect(wolf.slowMs ?? 0).toBeGreaterThan(0);
  expect(player.cooldowns.E).toBeGreaterThan(0);

  player.energy = 0;
  await server.receiveInput(player.id, { action: "r", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  expect(player.activeAbility).toBe("");

  player.energy = player.maxEnergy;
  await server.receiveInput(player.id, { action: "r", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  expect(player.activeAbility).toBe("blade-omnislash");
  expect(player.energy).toBe(0);
});

test("MMO Skill Demo Intimidating Shout slows enemies and supports nearby allies", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "blade-shout-support");
  const first = await server.joinRoom({ roomId: "blade-shout-support", roomType: "mmo-skill-demo", token: "dev:blade-shout" });
  const second = await server.joinRoom({ roomId: "blade-shout-support", roomType: "mmo-skill-demo", token: "dev:blade-shout-ally" });
  expect(first.ok).toBe(true);
  expect(second.ok).toBe(true);

  const player = room.ctx.state.players[first.player!.id];
  const ally = room.ctx.state.players[second.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  setItemQty(player, "blade", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "blade" });
  await server.tick(0);

  player.zoneId = wolf.zoneId;
  ally.zoneId = wolf.zoneId;
  player.x = wolf.x - 80;
  player.y = wolf.y;
  ally.x = player.x + 24;
  ally.y = player.y;
  ally.maxHp = 100;
  ally.hp = 50;

  await server.receiveInput(player.id, { action: "e", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.26);

  expect(wolf.combatFlags).toContain("weakened");
  expect(wolf.slowMs ?? 0).toBeGreaterThan(0);
  expect(ally.combatFlags).toContain("shout-haste:");
  expect(ally.combatFlags).toContain("shout-regen:");

  await server.tick(1.1);
  expect(ally.hp).toBeGreaterThan(50);
});

test("MMO Skill Demo Riposte and Iron Will apply defensive bonus effects", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "blade-defenses");
  const join = await server.joinRoom({ roomId: "blade-defenses", roomType: "mmo-skill-demo", token: "dev:blade-defenses" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  setItemQty(player, "blade", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "blade" });
  await server.tick(0);
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 18;
  player.y = wolf.y;
  player.maxHp = 100;
  player.hp = 50;
  wolf.kind = "sand-wraith";
  wolf.attackCooldownMs = 0;

  expect(selectedAbilityForSlot(player, "Q")).toBe("blade-riposte");
  await server.receiveInput(player.id, { action: "q", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.3);
  expect(player.hp).toBeGreaterThanOrEqual(60);
  expect(player.cooldowns.Q).toBeLessThanOrEqual(4000);

  await server.receiveInput(player.id, { action: "config", devField: "Q", devText: "blade-iron-will" });
  await server.tick(0);
  player.cooldowns.Q = 0;
  player.hp = 50;
  player.stunMs = 1000;
  player.slowMs = 1000;
  await server.receiveInput(player.id, { action: "q" });
  await server.tick(0);

  expect(player.hp).toBe(75);
  expect(player.stunMs).toBe(0);
  expect(player.slowMs).toBe(0);
  expect(player.combatFlags).toContain("ironwill-haste:");
});

test("MMO Skill Demo caltrops charge effects remain schema-encodable", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "caltrops-encode");
  const join = await server.joinRoom({ roomId: "caltrops-encode", roomType: "mmo-skill-demo", token: "dev:caltrops" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  setItemQty(player, "bow", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "bow" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "config", devField: "E", devText: "bow-caltrops" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "e", aimX: player.x + 100, aimY: player.y });
  await server.tick(1 / 60);
  await server.tick(1 / 60);

  expect(room.ctx.state.effects.some((effect) => effect.effectKind === "cone")).toBe(true);
  expect(() => encodeSnapshot(mmoSkillDemoSchema, room.ctx.state)).not.toThrow();
});

test("MMO Skill Demo caltrops resolve to one persistent hazard", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "caltrops-single-hazard");
  const join = await server.joinRoom({ roomId: "caltrops-single-hazard", roomType: "mmo-skill-demo", token: "dev:caltrops-one" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  setItemQty(player, "bow", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "bow" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "config", devField: "E", devText: "bow-caltrops" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "e", aimX: player.x + 100, aimY: player.y });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "idle", aimX: player.x + 100, aimY: player.y });
  await server.tick(1.1);

  const caltrops = Object.values(room.ctx.state.hazards).filter((hazard) => hazard.effectKind === "caltrops");
  expect(caltrops).toHaveLength(1);
  expect(caltrops[0].radius).toBeGreaterThan(40);
  expect(() => encodeSnapshot(mmoSkillDemoSchema, room.ctx.state)).not.toThrow();
});

test("MMO Skill Demo reuses pooled hazard objects after expiry", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "hazard-pool-reuse");
  const join = await server.joinRoom({ roomId: "hazard-pool-reuse", roomType: "mmo-skill-demo", token: "dev:hazard-pool" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  setItemQty(player, "bow", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "bow" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "config", devField: "E", devText: "bow-caltrops" });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "e", aimX: player.x + 100, aimY: player.y });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "idle", aimX: player.x + 100, aimY: player.y });
  await server.tick(1.1);

  const first = Object.values(room.ctx.state.hazards).find((hazard) => hazard.effectKind === "caltrops")!;
  const firstId = first.id;
  await server.receiveInput(player.id, { action: "idle", aimX: player.x + 100, aimY: player.y });
  await server.tick(6);
  expect(room.ctx.state.entities[firstId]).toBeUndefined();

  player.cooldowns.E = 0;
  player.cooldownMs = 0;
  await server.receiveInput(player.id, { action: "e", aimX: player.x + 120, aimY: player.y });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "idle", aimX: player.x + 120, aimY: player.y });
  await server.tick(1.1);

  const second = Object.values(room.ctx.state.hazards).find((hazard) => hazard.effectKind === "caltrops")!;
  expect(second).toBe(first);
  expect(second.id).not.toBe(firstId);
  expect(() => encodeSnapshot(mmoSkillDemoSchema, room.ctx.state)).not.toThrow();
});

test("MMO Skill Demo use-item consumes only valid needed consumables", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "consumable-use");
  const join = await server.joinRoom({ roomId: "consumable-use", roomType: "mmo-skill-demo", token: "dev:item-user" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  player.maxHp = 100;
  player.hp = 50;
  setItemQty(player, "glade-berries", 2);
  await server.receiveInput(player.id, { action: "use-item", itemId: "glade-berries" });
  await server.tick(0);
  expect(player.hp).toBe(74);
  expect(itemQty(player, "glade-berries")).toBe(1);

  player.cooldownMs = 0;
  player.hp = player.maxHp;
  await server.receiveInput(player.id, { action: "use-item", itemId: "glade-berry" });
  await server.tick(0);
  expect(itemQty(player, "glade-berries")).toBe(1);

  player.cooldownMs = 0;
  player.maxMana = 60;
  player.mana = 10;
  setItemQty(player, "cinder-ale", 2);
  await server.receiveInput(player.id, { action: "use-item", itemId: "cinder-ale" });
  await server.tick(0);
  expect(player.mana).toBe(46);
  expect(itemQty(player, "cinder-ale")).toBe(1);

  player.cooldownMs = 0;
  player.mana = player.maxMana;
  await server.receiveInput(player.id, { action: "use-item", itemId: "cinder-ale" });
  await server.tick(0);
  expect(itemQty(player, "cinder-ale")).toBe(1);

  player.cooldownMs = 0;
  player.berserkMs = 0;
  setItemQty(player, "speed-potion", 2);
  await server.receiveInput(player.id, { action: "use-item", itemId: "speed-potion" });
  await server.tick(0);
  expect(itemQty(player, "speed-potion")).toBe(1);
  expect(player.berserkMs).toBeGreaterThan(0);

  player.cooldownMs = 0;
  player.berserkMs = 0;
  const before = { berries: itemQty(player, "glade-berries"), ale: itemQty(player, "cinder-ale"), potions: itemQty(player, "speed-potion"), hp: player.hp, mana: player.mana };
  await server.receiveInput(player.id, { action: "use-item", itemId: "unknown" });
  await server.tick(0);
  expect(itemQty(player, "glade-berries")).toBe(before.berries);
  expect(itemQty(player, "cinder-ale")).toBe(before.ale);
  expect(itemQty(player, "speed-potion")).toBe(before.potions);
  expect(player.hp).toBe(before.hp);
  expect(player.mana).toBe(before.mana);
});

test("MMO Skill Demo enemies drop pickupable loot from loot tables", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "loot-table");
  const join = await server.joinRoom({ roomId: "loot-table", roomType: "mmo-skill-demo", token: "dev:looter" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.x = wolf.x - 34;
  player.y = wolf.y;
  player.zoneId = wolf.zoneId;
  wolf.hp = 1;
  await tapPummel(server, player.id, { action: "lmb", targetId: wolf.id });

  const loot = Object.values(room.ctx.state.loots).find((drop) => drop.itemId === "gold");
  expect(loot).toBeDefined();
  expect(loot!.zoneId).toBe(wolf.zoneId);
  expect(loot!.amount).toBeGreaterThan(0);

  const beforeGold = player.gold;
  player.x = loot!.x;
  player.y = loot!.y;
  player.cooldownMs = 0;
  await server.receiveInput(player.id, { action: "interact", targetId: loot!.id });
  await server.tick();

  expect(room.ctx.state.loots[loot!.id]).toBeUndefined();
  expect(player.gold).toBeGreaterThan(beforeGold);
});

test("MMO Skill Demo loot pickup rejects direct ids outside reach or zone", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "loot-authority");
  const join = await server.joinRoom({ roomId: "loot-authority", roomType: "mmo-skill-demo", token: "dev:far-loot" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const oakhaven = getMmoSkillDemoAnchorTile("oakhaven");
  player.zoneId = "ashwood";
  player.x = oakhaven.x * 32 + 16;
  player.y = oakhaven.y * 32 + 16;
  room.ctx.state.loots["loot-far"] = {
    id: "loot-far",
    entityType: "loot",
    itemId: "gold",
    amount: 9,
    zoneId: "ashwood",
    x: player.x + 140,
    y: player.y,
    ownerId: player.id,
    expiresMs: 12000,
    pickupRadius: 32
  };
  room.ctx.state.loots["loot-zone"] = {
    id: "loot-zone",
    entityType: "loot",
    itemId: "iron-ore",
    amount: 3,
    zoneId: "crags",
    x: player.x,
    y: player.y,
    ownerId: player.id,
    expiresMs: 12000,
    pickupRadius: 32
  };

  await server.receiveInput(player.id, { action: "interact", targetId: "loot-far" });
  await server.tick();
  expect(room.ctx.state.loots["loot-far"]).toBeDefined();

  player.cooldownMs = 0;
  await server.receiveInput(player.id, { action: "interact", targetId: "loot-zone" });
  await server.tick();
  expect(room.ctx.state.loots["loot-zone"]).toBeDefined();
  expect(itemQty(player, "iron-ore")).toBe(0);
});

test("MMO Skill Demo loot pickup accepts highlighted interaction range", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "loot-highlight-range");
  const join = await server.joinRoom({ roomId: "loot-highlight-range", roomType: "mmo-skill-demo", token: "dev:highlight-loot" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const oakhaven = getMmoSkillDemoAnchorTile("oakhaven");
  player.zoneId = "ashwood";
  player.x = oakhaven.x * 32 + 16;
  player.y = oakhaven.y * 32 + 16;
  player.cooldownMs = 0;
  room.ctx.state.loots["loot-highlighted"] = {
    id: "loot-highlighted",
    entityType: "loot",
    itemId: "gold",
    amount: 9,
    zoneId: "ashwood",
    x: player.x + 88,
    y: player.y,
    ownerId: player.id,
    expiresMs: 12000,
    pickupRadius: 32
  };

  await server.receiveInput(player.id, { action: "interact", targetId: "loot-highlighted" });
  await server.tick();

  expect(room.ctx.state.loots["loot-highlighted"]).toBeUndefined();
  expect(player.gold).toBeGreaterThanOrEqual(9);
});

test("MMO Skill Demo rejects direct NPC interaction ids outside reach", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "npc-authority");
  const join = await server.joinRoom({ roomId: "npc-authority", roomType: "mmo-skill-demo", token: "dev:bank-check" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const elder = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "elder-rowan")!;
  const banker = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "banker-valerius")!;
  setItemQty(player, "ash-logs", 5);
  player.x = elder.x;
  player.y = elder.y;
  await server.receiveInput(player.id, { action: "interact", targetId: banker.id });
  await server.tick();
  expect(bankQty(player, "ash-logs")).toBe(0);
  expect(itemQty(player, "ash-logs")).toBe(5);

  player.x = banker.x - 24;
  player.y = banker.y;
  player.cooldownMs = 0;
  await server.receiveInput(player.id, { action: "interact", targetId: banker.id });
  await server.tick();
  expect(bankQty(player, "ash-logs")).toBe(5);
  expect(itemQty(player, "ash-logs")).toBe(0);
});

test("MMO Skill Demo read helpers treat missing replicated maps as empty", () => {
  const player = { inventory: undefined, bank: undefined, abilitySlots: undefined, questFlags: undefined } as unknown as PlayerEntity;

  expect(itemQty(player, "ash-logs")).toBe(0);
  expect(bankQty(player, "ash-logs")).toBe(0);
  expect(hasInventoryItem(player, "ash-logs")).toBe(false);
  expect(hasQuestFlag(player, "first-cut")).toBe(false);
  expect(hasSlot(player, "LMB")).toBe(false);
  expect(selectedAbilityForSlot(player, "LMB")).toBe("mace-pummel");
});

test("MMO Skill Demo rejects direct combat ids outside the player's zone", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "combat-authority");
  const join = await server.joinRoom({ roomId: "combat-authority", roomType: "mmo-skill-demo", token: "dev:duelist" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.x = wolf.x - 34;
  player.y = wolf.y;
  wolf.zoneId = "bazaar";
  await tapPummel(server, player.id, { action: "lmb", targetId: wolf.id });
  expect(wolf.hp).toBe(wolf.maxHp);

  wolf.zoneId = player.zoneId;
  player.cooldownMs = 0;
  await tapPummel(server, player.id, { action: "lmb", targetId: wolf.id });
  expect(wolf.hp).toBeLessThan(wolf.maxHp);
});

test("MMO Skill Demo rejects direct resource ids outside the player's zone", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "resource-authority");
  const join = await server.joinRoom({ roomId: "resource-authority", roomType: "mmo-skill-demo", token: "dev:miner" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const ore = Object.values(room.ctx.state.resources).find((node) => node.kind === "ore")!;
  addItem(player, "pickaxe");
  player.x = ore.x - 34;
  player.y = ore.y;
  ore.zoneId = "bazaar";
  await server.receiveInput(player.id, { action: "mine", targetId: ore.id });
  await server.tick();
  expect(ore.hp).toBe(ore.maxHp);
  expect(player.miningXp).toBe(0);

  ore.zoneId = player.zoneId;
  player.cooldownMs = 0;
  await server.receiveInput(player.id, { action: "mine", targetId: ore.id });
  await server.tick(4.1);
  expect(ore.hp).toBe(0);
  expect(player.miningXp).toBeGreaterThan(0);
});

test("MMO Skill Demo gates network dev cheats behind an explicit env flag", async () => {
  const previous = process.env.MMO_SKILL_DEMO_DEV_CHEATS;
  delete process.env.MMO_SKILL_DEMO_DEV_CHEATS;
  try {
    const server = createAuthoritativeServer({
      transport: "websocket",
      port: 0,
      rooms: [mmoSkillDemoZone]
    });
    const room = server.createRoom("mmo-skill-demo", "dev-cheat-gate");
    const join = await server.joinRoom({ roomId: "dev-cheat-gate", roomType: "mmo-skill-demo", token: "dev:qa" });
    expect(join.ok).toBe(true);

    const player = room.ctx.state.players[join.player!.id];
    await server.receiveInput(player.id, { action: "dev", devField: "hp", devValue: 1 });
    await server.tick();
    expect(player.hp).toBe(100);

    process.env.MMO_SKILL_DEMO_DEV_CHEATS = "1";
    await server.receiveInput(player.id, { action: "dev", devField: "hp", devValue: 42 });
    await server.tick();
    expect(player.hp).toBe(42);
  } finally {
    if (previous === undefined) delete process.env.MMO_SKILL_DEMO_DEV_CHEATS;
    else process.env.MMO_SKILL_DEMO_DEV_CHEATS = previous;
  }
});

test("MMO Skill Demo mouse aim drives ground-targeted abilities", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "aimed-actions");
  const join = await server.joinRoom({ roomId: "aimed-actions", roomType: "mmo-skill-demo", token: "dev:rook" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  isolateCombatTarget(room.ctx.state, wolf.id);
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 72;
  player.y = wolf.y;
  player.abilitySlots.RMB = "unlocked";
  player.abilitySlots["rmb-crushing-blow"] = "RMB";
  await castCrushingLeap(server, player.id, { action: "rmb", aimX: wolf.x, aimY: wolf.y });

  expect(wolf.hp).toBeLessThan(wolf.maxHp);
  expect(player.targetId).toBe(wolf.id);
});

test("MMO Skill Demo spawn hub does not silently lock out player abilities", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "spawn-abilities");
  const join = await server.joinRoom({ roomId: "spawn-abilities", roomType: "mmo-skill-demo", token: "dev:spawn-abilities" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  expect(player.zoneId).toBe("ashwood");

  await server.receiveInput(player.id, { action: "lmb", aimX: player.x + 90, aimY: player.y });
  await server.tick(0);

  expect(player.activeAbility).toBe("mace-pummel");
  expect(player.cooldowns.LMB ?? 0).toBe(0);
});

test("MMO Skill Demo Pummel charge preview stays client-side", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "pummel-preview");
  const join = await server.joinRoom({ roomId: "pummel-preview", roomType: "mmo-skill-demo", token: "dev:pummel-preview" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 72;
  player.y = wolf.y;

  await server.receiveInput(player.id, { action: "lmb", targetId: wolf.id, aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.05);

  const previews = room.ctx.state.effects.filter((effect) => effect.effectKind === "cone");
  expect(previews).toHaveLength(0);

  await server.receiveInput(player.id, { action: "idle", targetId: wolf.id, aimX: wolf.x, aimY: wolf.y });
  await server.tick(0.35);
  expect(room.ctx.state.effects.some((effect) => effect.effectKind === "cone")).toBe(false);
});

test("MMO Skill Demo zero-cooldown Pummel does not block other slots", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "independent-cooldowns");
  const join = await server.joinRoom({ roomId: "independent-cooldowns", roomType: "mmo-skill-demo", token: "dev:slots" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 34;
  player.y = wolf.y;

  await server.receiveInput(player.id, { action: "lmb", targetId: wolf.id, aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "idle", targetId: wolf.id, aimX: wolf.x, aimY: wolf.y });
  await server.tick(0.35);
  expect(player.cooldowns.LMB ?? 0).toBe(0);
  const shockwaves = room.ctx.state.effects.filter((effect) => effect.effectKind === "conewave");
  expect(shockwaves).toHaveLength(1);
  expect(shockwaves[0].radius).toBeGreaterThanOrEqual(55);
  expect(shockwaves[0].radius).toBeLessThanOrEqual(112);
  expect(shockwaves[0].pulse).toBeGreaterThanOrEqual(50);
  expect(shockwaves[0].pulse).toBeLessThanOrEqual(90);

  await server.receiveInput(player.id, { action: "q" });
  await server.tick(0);
  expect(player.activeAbility).toBe("q-berserk");
  expect(player.guardMs).toBe(750);
  expect(player.cooldowns.Q).toBe(10000);
});

test("MMO Skill Demo Rush auto-ends at its max channel even if held", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "rush-timeout");
  const join = await server.joinRoom({ roomId: "rush-timeout", roomType: "mmo-skill-demo", token: "dev:rush" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  isolateCombatTarget(room.ctx.state, wolf.id);
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 150;
  player.y = wolf.y;

  await server.receiveInput(player.id, { action: "space", aimX: wolf.x + 160, aimY: wolf.y });
  await server.tick(0);
  expect(player.activeAbility).toBe("space-rush");

  await server.tick(5.1);
  expect(player.activeAbility).toBe("");
  expect(player.action).toBe("idle");
  expect(player.cooldowns.Space).toBeGreaterThan(0);
  const stoppedX = player.x;
  const stoppedY = player.y;

  await server.receiveInput(player.id, { action: "space", aimX: wolf.x + 220, aimY: wolf.y });
  await server.tick(0.5);
  expect(player.activeAbility).toBe("");
  expect(Math.hypot(player.x - stoppedX, player.y - stoppedY)).toBeLessThan(1);

  await server.tick(8.5);
  expect(player.activeAbility).toBe("space-rush");
  expect(player.cooldowns.Space ?? 0).toBe(0);
});

test("MMO Skill Demo Rush movement snapshots stay schema-encodable", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "rush-snapshot-u16");
  const join = await server.joinRoom({ roomId: "rush-snapshot-u16", roomType: "mmo-skill-demo", token: "dev:rush-snapshot" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 150;
  player.y = wolf.y;

  await server.tick(0.016);
  const before = structuredClone(room.snapshotFor(player.id));
  await server.receiveInput(player.id, { action: "space", aimX: wolf.x + 160, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.7);
  const after = structuredClone(room.snapshotFor(player.id));

  expect(player.activeAbility).toBe("space-rush");
  expect(player.rushDistance).toBeGreaterThan(0);
  expect(Number.isInteger(player.rushDistance)).toBe(true);
  expect(() => encodeSnapshot(mmoSkillDemoSchema, after)).not.toThrow();
  expect(() => encodeDelta(mmoSkillDemoSchema, before, after)).not.toThrow();
});

test("MMO Skill Demo snapshots sanitize schema-constrained runtime values", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "snapshot-sanitize-u16");
  const join = await server.joinRoom({ roomId: "snapshot-sanitize-u16", roomType: "mmo-skill-demo", token: "dev:sanitize-u16" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 80;
  player.y = wolf.y;
  await server.tick(0.016);

  player.rushDistance = 12.75;
  player.cooldownMs = 70000;
  player.cooldowns.Space = 70000;
  wolf.attackCooldownMs = 70000;
  const snapshot = room.snapshotFor(player.id);
  const snapshotPlayer = snapshot.entities[player.id] as typeof player;
  const snapshotWolf = snapshot.entities[wolf.id] as typeof wolf;

  expect(snapshotPlayer.rushDistance).toBe(12);
  expect(snapshotPlayer.cooldownMs).toBe(65535);
  expect(snapshotPlayer.cooldowns.Space).toBe(65535);
  expect(snapshotWolf.attackCooldownMs).toBe(65535);
  expect(() => encodeSnapshot(mmoSkillDemoSchema, snapshot)).not.toThrow();
});

test("MMO Skill Demo held Space on cooldown does not add movement speed", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "space-cooldown-speed");
  const join = await server.joinRoom({ roomId: "space-cooldown-speed", roomType: "mmo-skill-demo", token: "dev:space-speed" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 220;
  player.y = wolf.y + 90;
  player.abilitySlots["space-jump"] = "Space";
  setItemQty(player, "bow", 1);
  await server.receiveInput(player.id, { action: "config", devField: "weapon", devText: "bow" });
  await server.tick(0);

  const startX = player.x;
  const startY = player.y;
  await server.receiveInput(player.id, { action: "idle", dx: 1, dy: 0, aimX: startX + 500, aimY: startY });
  await server.tick(0.4);
  const normalMove = Math.hypot(player.x - startX, player.y - startY);

  player.x = startX;
  player.y = startY;
  player.momentumX = 0;
  player.momentumY = 0;
  player.cooldowns.Space = 6000;
  player.cooldownMs = 6000;
  await server.receiveInput(player.id, { action: "space", dx: 1, dy: 0, aimX: startX + 500, aimY: startY });
  await server.tick(0.4);
  const heldCooldownMove = Math.hypot(player.x - startX, player.y - startY);

  expect(heldCooldownMove).toBeLessThanOrEqual(normalMove + 1);
  expect(player.activeAbility).toBe("");
});

test("MMO Skill Demo Berserk halves Rush windup timing", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "rush-berserk-speed");
  const join = await server.joinRoom({ roomId: "rush-berserk-speed", roomType: "mmo-skill-demo", token: "dev:fast-rush" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 150;
  player.y = wolf.y;
  player.berserkMs = 3000;

  await server.receiveInput(player.id, { action: "space", aimX: wolf.x + 160, aimY: wolf.y });
  await server.tick(0);
  expect(player.activeAbility).toBe("space-rush");
  expect(player.castMs).toBe(250);
  expect(player.activeDurationMs).toBe(5000);

  await server.tick(0.26);
  expect(player.rushDistance).toBeGreaterThan(0);
});

test("MMO Skill Demo Rush uses swept collision against resources", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "rush-sweep-resource");
  const join = await server.joinRoom({ roomId: "rush-sweep-resource", roomType: "mmo-skill-demo", token: "dev:rush-sweep" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const tree = Object.values(room.ctx.state.resources).find((resource) => resource.kind === "tree" && !resource.depleted)!;
  player.zoneId = tree.zoneId;
  player.x = tree.x - 90;
  player.y = tree.y;

  await server.receiveInput(player.id, { action: "space", aimX: tree.x + 220, aimY: tree.y });
  await server.tick(0.75);

  expect(player.x).toBeLessThan(tree.x);
  expect(Math.hypot(player.x - tree.x, player.y - tree.y)).toBeGreaterThanOrEqual(27);
});

test("MMO Skill Demo held casts fire toward current mouse aim", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "fire-frame-aim");
  const join = await server.joinRoom({ roomId: "fire-frame-aim", roomType: "mmo-skill-demo", token: "dev:frame-aim" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 80;
  player.y = wolf.y;
  player.abilitySlots.E = "unlocked";
  const hpBefore = wolf.hp;

  await server.receiveInput(player.id, { action: "e", aimX: player.x - 200, aimY: player.y });
  await server.tick(0);
  await server.receiveInput(player.id, { action: "idle", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0.12);

  expect(wolf.hp).toBeLessThan(hpBefore);
});

test("MMO Skill Demo stuns cancel active player attacks", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "stun-cancel-player");
  const join = await server.joinRoom({ roomId: "stun-cancel-player", roomType: "mmo-skill-demo", token: "dev:stun-cancel" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 40;
  player.y = wolf.y;

  await server.receiveInput(player.id, { action: "lmb", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  expect(player.activeAbility).toBe("mace-pummel");

  player.stunMs = 1000;
  await server.tick(0.1);
  expect(player.activeAbility).toBe("");
  expect(player.castMs).toBe(0);
});

test("MMO Skill Demo defensive input cancels a charging mace swing", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "cancel-heavy");
  const join = await server.joinRoom({ roomId: "cancel-heavy", roomType: "mmo-skill-demo", token: "dev:cancel" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 34;
  player.y = wolf.y;

  await server.receiveInput(player.id, { action: "lmb", targetId: wolf.id });
  await server.tick(0);
  expect(player.activeAbility).toBe("mace-pummel");

  await server.receiveInput(player.id, { action: "q" });
  await server.tick(0);
  expect(player.activeAbility).toBe("q-berserk");
  expect(player.guardMs).toBeGreaterThan(0);
  expect(player.activeDurationMs).toBe(750);
  expect(player.cooldowns.LMB ?? 0).toBe(0);
});

test("MMO Skill Demo windup interruption refunds interrupted slot cooldown", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "windup-refund");
  const join = await server.joinRoom({ roomId: "windup-refund", roomType: "mmo-skill-demo", token: "dev:windup-refund" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 110;
  player.y = wolf.y;

  await server.receiveInput(player.id, { action: "q" });
  await server.tick(0);
  expect(player.activeAbility).toBe("q-berserk");
  expect(player.cooldowns.Q).toBeGreaterThan(0);

  await server.receiveInput(player.id, { action: "space", aimX: wolf.x + 120, aimY: wolf.y });
  await server.tick(0);

  expect(player.activeAbility).toBe("space-rush");
  expect(player.cooldowns.Q ?? 0).toBe(0);
});

test("MMO Skill Demo abilities cannot be interrupted after cast frame", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "post-cast-no-interrupt");
  const join = await server.joinRoom({ roomId: "post-cast-no-interrupt", roomType: "mmo-skill-demo", token: "dev:post-cast" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 110;
  player.y = wolf.y;

  await server.receiveInput(player.id, { action: "q" });
  await server.tick(0);
  await server.tick(0.12);
  expect(player.activeAbility).toBe("q-berserk");

  await server.receiveInput(player.id, { action: "space", aimX: wolf.x + 120, aimY: wolf.y });
  await server.tick(0);

  expect(player.activeAbility).toBe("q-berserk");
  expect(player.cooldowns.Q).toBeGreaterThan(0);
  expect(player.cooldowns.Space ?? 0).toBe(0);
});

test("MMO Skill Demo ultimate consumes full Energy and channels mace damage", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "mace-ultimate");
  const join = await server.joinRoom({ roomId: "mace-ultimate", roomType: "mmo-skill-demo", token: "dev:ult" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 20;
  player.y = wolf.y;
  player.energy = 100;

  await server.receiveInput(player.id, { action: "r", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  expect(player.energy).toBe(0);
  expect(player.activeAbility).toBe("mace-whirlwind");
  expect(player.castMs).toBe(160);

  await server.tick(0);
  await server.tick(0.25);
  expect(wolf.hp).toBeLessThan(wolf.maxHp);
});

test("MMO Skill Demo Whirlwind ticks quickly and pulls enemies inward", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "mace-whirlwind-pull");
  const join = await server.joinRoom({ roomId: "mace-whirlwind-pull", roomType: "mmo-skill-demo", token: "dev:pull" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 105;
  player.y = wolf.y;
  player.energy = 100;
  const originalWolfX = wolf.x;

  await server.receiveInput(player.id, { action: "r", aimX: wolf.x, aimY: wolf.y });
  await server.tick(0);
  await server.tick(0.25);

  expect(wolf.hp).toBeLessThan(wolf.maxHp);
  expect(wolf.x).toBeLessThan(originalWolfX);
});

test("MMO Skill Demo immune enemies show dodge combat text", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "immune-readback");
  const join = await server.joinRoom({ roomId: "immune-readback", roomType: "mmo-skill-demo", token: "dev:immune" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 34;
  player.y = wolf.y;
  wolf.iframeMs = 1000;
  const hpBefore = wolf.hp;

  await tapPummel(server, player.id, { action: "lmb", targetId: wolf.id, aimX: wolf.x, aimY: wolf.y });

  expect(wolf.hp).toBe(hpBefore);
  expect(room.ctx.state.effects.some((effect) => effect.effectKind === "dodge")).toBe(true);
});

test("MMO Skill Demo elite line hazards telegraph before damaging players", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "hazard-patterns");
  const join = await server.joinRoom({ roomId: "hazard-patterns", roomType: "mmo-skill-demo", token: "dev:tank" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const archer = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "cursed-archer")!;
  player.zoneId = archer.zoneId;
  player.x = archer.x - 90;
  player.y = archer.y;
  archer.projectileCooldownMs = 0;
  const before = player.hp;
  await server.tick();
  expect(Object.values(room.ctx.state.hazards).some((hazard) => hazard.kind === "line")).toBe(true);

  await server.tick(20);
  expect(player.hp).toBeLessThan(before);
});

test("MMO Skill Demo restores a character by login token", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "ashwood-persist");
  const firstJoin = await server.joinRoom({ roomId: "ashwood-persist", roomType: "mmo-skill-demo", token: "dev:ranger" });
  expect(firstJoin.ok).toBe(true);
  const firstPlayer = room.ctx.state.players[firstJoin.player!.id];
  firstPlayer.combatXp = 196;
  firstPlayer.combatLevel = 3;
  firstPlayer.x += 16;
  await server.leavePlayer(firstPlayer.id);

  const secondJoin = await server.joinRoom({ roomId: "ashwood-persist", roomType: "mmo-skill-demo", token: "dev:ranger" });
  expect(secondJoin.ok).toBe(true);
  const restored = room.ctx.state.players[secondJoin.player!.id];
  expect(restored.combatXp).toBe(196);
  expect(restored.combatLevel).toBe(3);
  expect(restored.gold).toBe(firstPlayer.gold);
  expect(restored.abilitySlots["lmb-strike"]).toBe("LMB");
});

test("MMO Skill Demo persists same login across shared world and cottage without saving instance spawn", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone, mmoSkillDemoDungeon, mmoSkillDemoCottage]
  });
  const world = server.createRoom("mmo-skill-demo", "cross-room-world");
  const dungeon = server.createRoom("mmo-skill-demo-dungeon", "cross-room-dungeon");
  const cottage = server.createRoom("mmo-skill-demo-cottage", "cross-room-cottage");
  const token = "dev:cross-room-ranger";
  const firstJoin = await server.joinRoom({ roomId: "cross-room-world", roomType: "mmo-skill-demo", token });
  expect(firstJoin.ok).toBe(true);
  const firstPlayer = world.ctx.state.players[firstJoin.player!.id];
  const oakhaven = getMmoSkillDemoAnchorTile("oakhaven");
  firstPlayer.x = oakhaven.x * 32 + 16;
  firstPlayer.y = oakhaven.y * 32 + 16;
  firstPlayer.zoneId = "ashwood";
  firstPlayer.combatXp = 210;
  firstPlayer.gold = 77;
  setItemQty(firstPlayer, "glade-berries", 6);
  setItemQty(firstPlayer, "cinder-ale", 3);
  await server.leavePlayer(firstPlayer.id);

  const dungeonJoin = await server.joinRoom({ roomId: "cross-room-dungeon", roomType: "mmo-skill-demo-dungeon", token });
  expect(dungeonJoin.ok).toBe(true);
  const dungeonPlayer = dungeon.ctx.state.players[dungeonJoin.player!.id];
  expect(dungeonPlayer.zoneId).toBe("dungeon");
  expect(dungeonPlayer.combatXp).toBe(210);
  expect(dungeonPlayer.gold).toBe(77);
  expect(itemQty(dungeonPlayer, "glade-berries")).toBe(6);
  setItemQty(dungeonPlayer, "cinder-ale", 2);
  await server.leavePlayer(dungeonPlayer.id);

  const cottageJoin = await server.joinRoom({ roomId: "cross-room-cottage", roomType: "mmo-skill-demo-cottage", token });
  expect(cottageJoin.ok).toBe(true);
  const cottagePlayer = cottage.ctx.state.players[cottageJoin.player!.id];
  expect(cottagePlayer.zoneId).toBe("cottage");
  expect(cottagePlayer.combatXp).toBe(210);
  expect(cottagePlayer.gold).toBe(77);
  expect(itemQty(cottagePlayer, "glade-berries")).toBe(6);
  expect(itemQty(cottagePlayer, "cinder-ale")).toBe(2);
  setItemQty(cottagePlayer, "glade-berries", 4);
  setItemQty(cottagePlayer, "speed-potion", 2);
  await server.leavePlayer(cottagePlayer.id);

  const secondJoin = await server.joinRoom({ roomId: "cross-room-world", roomType: "mmo-skill-demo", token });
  expect(secondJoin.ok).toBe(true);
  const restored = world.ctx.state.players[secondJoin.player!.id];
  expect(restored.combatXp).toBe(210);
  expect(restored.gold).toBe(77);
  expect(itemQty(restored, "glade-berries")).toBe(4);
  expect(itemQty(restored, "speed-potion")).toBe(2);
  expect(restored.zoneId).toBe("ashwood");
  expect(restored.x).toBe(firstPlayer.x);
  expect(restored.y).toBe(firstPlayer.y);
  expect(restored.zoneId).not.toBe("cottage");
  expect(restored.zoneId).not.toBe("dungeon");
});

test("MMO Skill Demo snapshots keep nearby cross-zone actors stable at zone seams", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "zone-interest");
  const join = await server.joinRoom({ roomId: "zone-interest", roomType: "mmo-skill-demo", token: "dev:scout" });
  expect(join.ok).toBe(true);
  const player = room.ctx.state.players[join.player!.id];
  player.zoneId = "port-marrow";
  player.x = 32 * 32;
  player.y = 18 * 32;
  const elder = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "elder-rowan")!;
  elder.x = player.x + 34;
  elder.y = player.y;
  elder.zoneId = "ashwood";
  await server.tick();
  const snapshot = mmoSkillDemoZone.getSnapshot!(room.ctx, join.player!);

  expect(snapshot.npcs[elder.id]?.kind).toBe("elder-rowan");
});

test("MMO Skill Demo creates dungeon and cottage instance room states", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone, mmoSkillDemoDungeon, mmoSkillDemoCottage]
  });
  const dungeon = server.createRoom("mmo-skill-demo-dungeon", "dungeon-party-test");
  const cottage = server.createRoom("mmo-skill-demo-cottage", "cottage-test");

  expect(dungeon.ctx.state.roomKind).toBe("dungeon-instance");
  expect(Object.values(dungeon.ctx.state.npcs).some((npc) => npc.kind === "mirror-king")).toBe(true);
  expect(cottage.ctx.state.roomKind).toBe("cottage-instance");
  expect(Object.values(cottage.ctx.state.npcs).every((npc) => npc.zoneId === "cottage")).toBe(true);
});

test("MMO Skill Demo can accept multiple side quests without replacing the current focus", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "multi-quest-accept");
  const join = await server.joinRoom({ roomId: "multi-quest-accept", roomType: "mmo-skill-demo", token: "dev:quest-stack" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const miller = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "miller-finn")!;
  const scout = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "scout-elara")!;

  player.x = miller.x - 24;
  player.y = miller.y;
  player.zoneId = miller.zoneId;
  await server.receiveInput(player.id, { action: "interact", targetId: miller.id });
  await server.tick();

  player.cooldownMs = 0;
  player.cooldowns = {};
  player.x = scout.x - 24;
  player.y = scout.y;
  player.zoneId = scout.zoneId;
  await server.receiveInput(player.id, { action: "interact", targetId: scout.id });
  await server.tick();

  expect(hasQuestFlag(player, "wolf-pelt-quota-accepted")).toBe(true);
  expect(hasQuestFlag(player, "root-of-the-problem-accepted")).toBe(true);
  expect(player.activeQuestId).toBe("first-cut");

  await sendConfig(server, player.id, "mainQuest", "root-of-the-problem");
  expect(player.activeQuestId).toBe("root-of-the-problem");

  await sendConfig(server, player.id, "mainQuest", "not-a-quest");
  expect(player.activeQuestId).toBe("root-of-the-problem");
});

test("MMO Skill Demo new player starts with a zero-blocker First Cut route", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "early-zero-spawn");
  const join = await server.joinRoom({ roomId: "early-zero-spawn", roomType: "mmo-skill-demo", token: "dev:early-zero-spawn" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  expect(player.activeQuestId).toBe("first-cut");
  expect(hasQuestFlag(player, "first-cut-accepted")).toBe(true);
  expect(mainQuestDestination(room.ctx.state, player)).toBeDefined();
  expect(earlyLoopAction(room.ctx.state, player).hudText).toBe("Cut glowing Ash tree 0/5");
  expect(earlyLoopBlockers(room.ctx.state, player)).toEqual([]);
});

test("MMO Skill Demo First Arms remains optional with a First Cut fallback", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "first-arms-fallback");
  const join = await server.joinRoom({ roomId: "first-arms-fallback", roomType: "mmo-skill-demo", token: "dev:first-arms-fallback" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  await sendConfig(server, player.id, "proving", "accept");
  expect(hasQuestFlag(player, "first-arms-proving-accepted")).toBe(true);
  expect(player.activeQuestId).toBe("first-cut");
  expect(mainQuestDestination(room.ctx.state, player)).toBeDefined();
  const action = earlyLoopAction(room.ctx.state, player);
  expect(action.primaryLabel).toBe("Try next loaner");
  expect(action.fallbackLabel).toBe("Cut Ash tree");
  expect(earlyLoopBlockers(room.ctx.state, player)).toEqual([]);
});

test("MMO Skill Demo early quest completions hand off to the next route", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "early-handoffs");
  const join = await server.joinRoom({ roomId: "early-handoffs", roomType: "mmo-skill-demo", token: "dev:early-handoffs" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const rowan = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "elder-rowan")!;
  player.x = rowan.x;
  player.y = rowan.y;
  player.zoneId = rowan.zoneId;
  const resetInteract = () => {
    player.cooldownMs = 0;
    player.cooldowns = {};
    player.x = rowan.x;
    player.y = rowan.y;
    player.zoneId = rowan.zoneId;
  };

  player.questFlags["first-cut-ready"] = true;
  resetInteract();
  await server.receiveInput(player.id, { action: "interact", targetId: rowan.id });
  await server.tick();
  expect(hasQuestFlag(player, "first-cut")).toBe(true);
  expect(hasQuestFlag(player, "second-cut-accepted")).toBe(true);
  expect(player.activeQuestId).toBe("second-cut");

  player.questFlags["second-cut-ready"] = true;
  resetInteract();
  await server.receiveInput(player.id, { action: "interact", targetId: rowan.id });
  await server.tick();
  expect(hasQuestFlag(player, "second-cut")).toBe(true);
  expect(hasQuestFlag(player, "wolf-culling-accepted")).toBe(true);
  expect(player.activeQuestId).toBe("wolf-culling");

  player.questFlags["wolf-culling-ready"] = true;
  resetInteract();
  await server.receiveInput(player.id, { action: "interact", targetId: rowan.id });
  await server.tick();
  expect(hasQuestFlag(player, "wolf-culling")).toBe(true);
  expect(hasQuestFlag(player, "final-cut-accepted")).toBe(true);
  expect(player.activeQuestId).toBe("final-cut");

  player.questFlags["final-cut-ready"] = true;
  resetInteract();
  await server.receiveInput(player.id, { action: "interact", targetId: rowan.id });
  await server.tick();
  expect(hasQuestFlag(player, "final-cut")).toBe(true);
  expect(hasQuestFlag(player, "lost-compass-accepted")).toBe(true);
  expect(player.activeQuestId).toBe("lost-compass");
});

test("MMO Skill Demo first ten minute quest states have no early-loop blockers", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "early-loop-permutations");
  const join = await server.joinRoom({ roomId: "early-loop-permutations", roomType: "mmo-skill-demo", token: "dev:early-loop-permutations" });
  expect(join.ok).toBe(true);

  const base = room.ctx.state.players[join.player!.id];
  const scenarios: Array<{ label: string; player: Partial<PlayerEntity> }> = [
    { label: "spawn", player: { activeQuestId: "first-cut", questFlags: { "first-cut-accepted": true } } },
    { label: "first proof", player: { activeQuestId: "first-cut", inventory: { "ash-logs": 1 }, questFlags: { "first-cut-accepted": true } } },
    { label: "first ready", player: { activeQuestId: "first-cut", inventory: { "ash-logs": 5 }, questFlags: { "first-cut-accepted": true, "first-cut-ready": true } } },
    { label: "second cut", player: { activeQuestId: "second-cut", inventory: { "ash-logs": 7 }, questFlags: { "first-cut-accepted": true, "first-cut": true, "second-cut-accepted": true } } },
    { label: "wolf culling", player: { activeQuestId: "wolf-culling", wolfKills: 2, questFlags: { "first-cut-accepted": true, "first-cut": true, "second-cut": true, "wolf-culling-accepted": true } } },
    { label: "final cut", player: { activeQuestId: "final-cut", questFlags: { "first-cut-accepted": true, "first-cut": true, "second-cut": true, "wolf-culling": true, "final-cut-accepted": true } } },
    { label: "route registration", player: { activeQuestId: "lost-compass", questFlags: { "first-cut-accepted": true, "first-cut": true, "second-cut": true, "wolf-culling": true, "final-cut": true, "lost-compass-accepted": true } } }
  ];

  for (const scenario of scenarios) {
    const player = {
      ...base,
      inventory: {},
      bank: {},
      wolfKills: 0,
      ...scenario.player,
      questFlags: { ...(scenario.player.questFlags ?? {}) }
    } as PlayerEntity;
    expect(earlyLoopBlockers(room.ctx.state, player), scenario.label).toEqual([]);
  }
});

test("MMO Skill Demo starts new players without advanced weapons", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "starter-weapons");
  const join = await server.joinRoom({ roomId: "starter-weapons", roomType: "mmo-skill-demo", token: "dev:starter-weapons" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  expect(player.equippedWeaponId).toBe("mace");
  expect(player.zoneId).toBe("ashwood");
  expect(player.homeZoneId).toBe("ashwood");
  const oakhaven = getMmoSkillDemoAnchorTile("oakhaven");
  expect(Math.hypot(player.x - (oakhaven.x * TILE + TILE * 0.5), player.y - (oakhaven.y * TILE + TILE * 0.5))).toBeLessThan(TILE * 6);
  expect(selectedAbilityForSlot(player, "LMB")).toBe("mace-pummel");
  expect(itemQty(player, "training-hatchet")).toBe(1);
  for (const weaponId of ["bow", "staff", "wand", "twin-blades", "blade"]) {
    expect(itemQty(player, weaponId)).toBe(0);
    expect(hasInventoryItem(player, weaponId)).toBe(false);
  }

  await sendConfig(server, player.id, "weapon", "bow");
  expect(player.equippedWeaponId).toBe("mace");
  expect(selectedAbilityForSlot(player, "LMB")).toBe("mace-pummel");
});

test("MMO Skill Demo First Arms loans weapons without granting inventory", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "first-arms-loaners");
  const join = await server.joinRoom({ roomId: "first-arms-loaners", roomType: "mmo-skill-demo", token: "dev:first-arms-loaner" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  await sendConfig(server, player.id, "proving", "lesson:statuses");
  expect(hasQuestFlag(player, "first-arms-lesson-statuses")).toBe(false);

  const startingGold = player.gold;
  await sendConfig(server, player.id, "proving", "sample:bow");
  expect(hasQuestFlag(player, "first-arms-proving-accepted")).toBe(true);
  expect(hasQuestFlag(player, "first-arms-proving-sampled-bow")).toBe(true);
  expect(player.equippedWeaponId).toBe("bow");
  expect(selectedAbilityForSlot(player, "LMB")).toBe("bow-quick-shot");
  expect(itemQty(player, "bow")).toBe(0);
  expect(player.equipment["bow"]).toBeUndefined();
  expect(player.gold).toBe(startingGold + 11);

  await sendConfig(server, player.id, "proving", "sample:staff");
  expect(player.equippedWeaponId).toBe("staff");
  expect(itemQty(player, "staff")).toBe(0);
  expect(player.equipment["staff"]).toBeUndefined();

  await sendConfig(server, player.id, "proving", "sample:wand");
  expect(player.equippedWeaponId).toBe("wand");
  expect(itemQty(player, "wand")).toBe(0);
  expect(player.equipment["wand"]).toBeUndefined();
  expect(hasQuestFlag(player, "first-arms-proving")).toBe(false);
});

test("MMO Skill Demo First Arms pays one chosen weapon and starter purse once", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "first-arms-reward");
  const join = await server.joinRoom({ roomId: "first-arms-reward", roomType: "mmo-skill-demo", token: "dev:first-arms-reward" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  await sendConfig(server, player.id, "proving", "sample:bow");
  await sendConfig(server, player.id, "proving", "sample:staff");
  await sendConfig(server, player.id, "proving", "sample:wand");
  await sendConfig(server, player.id, "proving", "choose:staff");

  expect(hasQuestFlag(player, "first-arms-proving")).toBe(true);
  expect(hasQuestFlag(player, "first-arms-proving-reward-staff")).toBe(true);
  expect(hasQuestFlag(player, "first-arms-proving-reward-bow")).toBe(false);
  expect(itemQty(player, "staff")).toBe(1);
  expect(itemQty(player, "bow")).toBe(0);
  expect(itemQty(player, "wand")).toBe(0);
  expect(player.equippedWeaponId).toBe("staff");
  expect(itemQty(player, "ash-logs")).toBe(18);
  expect(itemQty(player, "iron-ore")).toBe(14);
  expect(itemQty(player, "silk-thread")).toBe(3);
  expect(itemQty(player, "speed-potion")).toBe(3);

  const paid = {
    gold: player.gold,
    renown: player.renown,
    staff: itemQty(player, "staff"),
    logs: itemQty(player, "ash-logs"),
    ore: itemQty(player, "iron-ore"),
    silk: itemQty(player, "silk-thread"),
    potions: itemQty(player, "speed-potion")
  };
  await sendConfig(server, player.id, "proving", "choose:staff");
  await sendConfig(server, player.id, "proving", "choose:bow");
  expect(player.gold).toBe(paid.gold);
  expect(player.renown).toBe(paid.renown);
  expect(itemQty(player, "staff")).toBe(paid.staff);
  expect(itemQty(player, "bow")).toBe(0);
  expect(itemQty(player, "ash-logs")).toBe(paid.logs);
  expect(itemQty(player, "iron-ore")).toBe(paid.ore);
  expect(itemQty(player, "silk-thread")).toBe(paid.silk);
  expect(itemQty(player, "speed-potion")).toBe(paid.potions);
});

test("MMO Skill Demo First Arms follow-up lessons are optional and idempotent", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "first-arms-lessons");
  const join = await server.joinRoom({ roomId: "first-arms-lessons", roomType: "mmo-skill-demo", token: "dev:first-arms-lessons" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  await sendConfig(server, player.id, "proving", "sample:bow");
  await sendConfig(server, player.id, "proving", "sample:staff");
  await sendConfig(server, player.id, "proving", "sample:wand");
  await sendConfig(server, player.id, "proving", "choose:bow");

  const before = {
    gold: player.gold,
    renown: player.renown,
    potions: itemQty(player, "speed-potion"),
    ale: itemQty(player, "cinder-ale"),
    berries: itemQty(player, "glade-berries"),
    logs: itemQty(player, "ash-logs"),
    ore: itemQty(player, "iron-ore"),
    silk: itemQty(player, "silk-thread"),
    hatchets: itemQty(player, "training-hatchet"),
    pickaxes: itemQty(player, "pickaxe"),
    maps: itemQty(player, "captains-map")
  };

  for (const lessonId of ["statuses", "crafting", "buffs", "gathering", "cities", "travel"]) {
    await sendConfig(server, player.id, "proving", `lesson:${lessonId}`);
    expect(hasQuestFlag(player, `first-arms-lesson-${lessonId}`)).toBe(true);
  }

  expect(player.gold).toBe(before.gold + 128);
  expect(player.renown).toBeGreaterThanOrEqual(before.renown + 46);
  expect(itemQty(player, "speed-potion")).toBe(before.potions + 9);
  expect(itemQty(player, "cinder-ale")).toBe(before.ale + 8);
  expect(itemQty(player, "glade-berries")).toBe(before.berries + 10);
  expect(itemQty(player, "ash-logs")).toBe(before.logs + 28);
  expect(itemQty(player, "iron-ore")).toBe(before.ore + 26);
  expect(itemQty(player, "silk-thread")).toBe(before.silk + 5);
  expect(itemQty(player, "training-hatchet")).toBe(before.hatchets + 1);
  expect(itemQty(player, "pickaxe")).toBe(before.pickaxes + 1);
  expect(itemQty(player, "captains-map")).toBe(before.maps + 2);

  const after = { gold: player.gold, renown: player.renown, potions: itemQty(player, "speed-potion") };
  await sendConfig(server, player.id, "proving", "lesson:statuses");
  expect(player.gold).toBe(after.gold);
  expect(player.renown).toBe(after.renown);
  expect(itemQty(player, "speed-potion")).toBe(after.potions);
});

test("MMO Skill Demo first-cut and wolf achievements unlock ability slots", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "progression-unlocks");
  const join = await server.joinRoom({ roomId: "progression-unlocks", roomType: "mmo-skill-demo", token: "dev:unlocker" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const tree = Object.values(room.ctx.state.resources).find((node) => node.kind === "tree")!;
  for (let i = 0; i < 5; i += 1) {
    tree.depleted = false;
    tree.hp = 1;
    player.x = tree.x - 34;
    player.y = tree.y;
    player.cooldownMs = 0;
    await server.receiveInput(player.id, { action: "woodcut", targetId: tree.id });
    await server.tick(4.1);
  }
  expect(hasQuestFlag(player, "first-cut-ready")).toBe(true);
  expect(hasInventoryItem(player, "iron-hatchet")).toBe(false);

  const elder = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "elder-rowan")!;
  player.x = elder.x - 24;
  player.y = elder.y;
  player.cooldownMs = 0;
  await server.receiveInput(player.id, { action: "interact", targetId: elder.id });
  await server.tick();
  expect(hasInventoryItem(player, "iron-hatchet")).toBe(true);
  expect(hasSlot(player, "RMB")).toBe(true);

  player.wolfKills = 10;
  await server.tick(0);
  expect(player.wolfKills).toBe(10);
  expect(hasQuestFlag(player, "wolf-culling-ready")).toBe(true);
  expect(player.abilitySlots["space-jump"]).toBeUndefined();

  player.x = elder.x - 24;
  player.y = elder.y;
  player.cooldownMs = 0;
  await server.receiveInput(player.id, { action: "interact", targetId: elder.id });
  await server.tick();
  expect(player.abilitySlots["space-jump"]).toBe("Space");
  expect(hasSlot(player, "Space")).toBe(true);
});

test("MMO Skill Demo bazaar survival unlocks Q stun", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "silent-sands");
  const join = await server.joinRoom({ roomId: "silent-sands", roomType: "mmo-skill-demo", token: "dev:sands" });
  expect(join.ok).toBe(true);
  const player = room.ctx.state.players[join.player!.id];
  const voidRift = getMmoSkillDemoAnchorTile("void-rift");
  player.x = voidRift.x * 32 + 16;
  player.y = voidRift.y * 32 + 16;
  player.zoneId = "bazaar";

  await server.tick(120);

  expect(hasQuestFlag(player, "silent-sands-ready")).toBe(true);
  expect(player.abilitySlots["q-stun"]).toBeUndefined();

  const master = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "master-kael")!;
  player.x = master.x - 24;
  player.y = master.y;
  player.cooldownMs = 0;
  await server.receiveInput(player.id, { action: "interact", targetId: master.id });
  await server.tick();
  expect(hasQuestFlag(player, "silent-sands")).toBe(true);
  expect(player.abilitySlots["q-stun"]).toBe("Q");
  expect(hasSlot(player, "Q")).toBe(true);
});

test("MMO Skill Demo golem requires power nodes before damage", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoDungeon]
  });
  const room = server.createRoom("mmo-skill-demo-dungeon", "dungeon-golem");
  const join = await server.joinRoom({ roomId: "dungeon-golem", roomType: "mmo-skill-demo-dungeon", token: "dev:golem" });
  expect(join.ok).toBe(true);
  const player = room.ctx.state.players[join.player!.id];
  const golem = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "iron-core-golem")!;
  player.x = golem.x - 42;
  player.y = golem.y;
  player.zoneId = "dungeon";
  player.combatLevel = 12;

  await tapPummel(server, player.id, { action: "lmb", targetId: golem.id });
  expect(golem.hp).toBe(golem.maxHp);

  const golemNodes = Object.values(room.ctx.state.npcs).filter((npc) => npc.kind === "power-node" && (npc.summonedBy === golem.id || Math.hypot(npc.x - golem.x, npc.y - golem.y) <= 300));
  const distantNode = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "power-node" && !golemNodes.includes(npc));
  expect(golemNodes).toHaveLength(3);
  expect(distantNode?.hp).toBeGreaterThan(0);
  for (const node of golemNodes) node.hp = 0;
  player.cooldownMs = 0;
  await tapPummel(server, player.id, { action: "lmb", targetId: golem.id });
  expect(golem.hp).toBeLessThan(golem.maxHp);
});

test("MMO Skill Demo throttles Deep Fissure golem overdrive hazards", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoDungeon]
  });
  const room = server.createRoom("mmo-skill-demo-dungeon", "dungeon-golem-hazard-throttle");
  const join = await server.joinRoom({ roomId: "dungeon-golem-hazard-throttle", roomType: "mmo-skill-demo-dungeon", token: "dev:golem-hazards" });
  expect(join.ok).toBe(true);
  const player = room.ctx.state.players[join.player!.id];
  const golem = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "iron-core-golem")!;

  player.zoneId = "dungeon";
  player.x = golem.x - 72;
  player.y = golem.y;
  golem.projectileCooldownMs = 0;
  await server.tick(1 / 60);

  expect(Object.values(room.ctx.state.hazards).filter((hazard) => hazard.ownerId === golem.id)).toHaveLength(6);
});

test("MMO Skill Demo contracts advance renown and rotate unlocked writs", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "contract-board");
  const join = await server.joinRoom({ roomId: "contract-board", roomType: "mmo-skill-demo", token: "dev:contractor" });
  expect(join.ok).toBe(true);
  const player = room.ctx.state.players[join.player!.id];
  const board = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "contract-board")!;

  player.renown = 135;
  player.masteryRank = 1;
  player.contractId = "ashwood-hunt";
  player.contractKills = 12;
  player.x = board.x - 24;
  player.y = board.y;
  player.zoneId = board.zoneId;
  await server.receiveInput(player.id, { action: "interact", targetId: board.id });
  await server.tick();

  expect(player.renown).toBeGreaterThan(135);
  expect(player.masteryRank).toBe(2);
  expect(player.contractStreak).toBe(1);
  expect(player.contractId).toBe("crag-patrol");
  expect(player.contractKills).toBe(0);
  expect(player.contractCooldownMs).toBeGreaterThan(0);
  expect(itemQty(player, "rep-oakhaven")).toBeGreaterThanOrEqual(12);
  expect(itemQty(player, "concord-oak-leaf")).toBeGreaterThan(0);

  const bat = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "iron-eye-bat")!;
  isolateCombatTarget(room.ctx.state, bat.id);
  bat.x = player.x + 58;
  bat.y = player.y;
  bat.spawnX = bat.x;
  bat.spawnY = bat.y;
  bat.zoneId = player.zoneId;
  player.x = bat.x - 34;
  player.y = bat.y;
  player.zoneId = bat.zoneId;
  player.cooldownMs = 0;
  bat.hp = 1;
  await tapPummel(server, player.id, { action: "lmb", targetId: bat.id, aimX: bat.x, aimY: bat.y });
  expect(player.contractKills).toBe(0);

  player.contractCooldownMs = 0;
  player.cooldownMs = 0;
  player.x = bat.x - 34;
  player.y = bat.y;
  player.zoneId = bat.zoneId;
  bat.hp = 1;
  bat.iframeMs = 0;
  bat.respawnMs = 0;
  await tapPummel(server, player.id, { action: "lmb", targetId: bat.id, aimX: bat.x, aimY: bat.y });
  expect(player.contractKills).toBeGreaterThan(0);
});

test("MMO Skill Demo travel NPCs escort nearby moves instead of teleporting", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "escort-route");
  const join = await server.joinRoom({ roomId: "escort-route", roomType: "mmo-skill-demo", token: "dev:escort" });
  expect(join.ok).toBe(true);
  const player = room.ctx.state.players[join.player!.id];
  const runner = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "runner-kael")!;

  player.x = runner.x - 24;
  player.y = runner.y;
  player.zoneId = runner.zoneId;
  const startX = player.x;
  const startY = player.y;
  await server.receiveInput(player.id, { action: "interact", targetId: runner.id });
  await server.tick();
  expect(player.escortNpcId).toBe(runner.id);

  await server.tick(0.5);
  expect(Math.hypot(player.x - startX, player.y - startY)).toBeGreaterThan(10);
  expect(Math.hypot(runner.x - player.x, runner.y - player.y)).toBeLessThan(36);
});

test("MMO Skill Demo captain route choice selects Ashwood or Void Rift", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "captain-route-choice");
  const ashwoodJoin = await server.joinRoom({ roomId: "captain-route-choice", roomType: "mmo-skill-demo", token: "dev:route-ashwood" });
  const voidJoin = await server.joinRoom({ roomId: "captain-route-choice", roomType: "mmo-skill-demo", token: "dev:route-void" });
  expect(ashwoodJoin.ok).toBe(true);
  expect(voidJoin.ok).toBe(true);

  const captain = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "captain-marrow")!;
  const ashwoodPlayer = room.ctx.state.players[ashwoodJoin.player!.id];
  const voidPlayer = room.ctx.state.players[voidJoin.player!.id];
  for (const player of [ashwoodPlayer, voidPlayer]) {
    player.zoneId = "port-marrow";
    player.x = captain.x;
    player.y = captain.y;
    addItem(player, "void-resistant-cloak", 1);
  }

  await server.receiveInput(ashwoodPlayer.id, { action: "interact", targetId: captain.id, devText: "ashwood" });
  await server.receiveInput(voidPlayer.id, { action: "interact", targetId: captain.id, devText: "void-rift" });
  await server.tick();

  expect(ashwoodPlayer.zoneId).toBe("ashwood");
  expect(voidPlayer.zoneId).toBe("bazaar");
});

test("MMO Skill Demo crafting NPC honors authored recipe picker ids", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "authored-recipe-picker");
  const join = await server.joinRoom({ roomId: "authored-recipe-picker", roomType: "mmo-skill-demo", token: "dev:recipe-picker" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const blacksmith = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "blacksmith-silas")!;
  player.zoneId = blacksmith.zoneId;
  player.x = blacksmith.x;
  player.y = blacksmith.y;
  player.gold = 80;
  addItem(player, "refined-iron-ingot", 2);
  addItem(player, "crawler-chitin-block", 1);
  addItem(player, "prism-crystal-shards", 2);
  addItem(player, "ancient-script-scroll", 1);

  await server.receiveInput(player.id, { action: "interact", targetId: blacksmith.id, devField: "recipe", devText: "aetheria-ring-focus" });
  await server.tick();

  expect(player.equipment["ring-focus"]).toBe("ring-focus");
  expect(player.equipment["iron-chest"]).toBeUndefined();
  expect(itemQty(player, "prism-crystal-shards")).toBe(0);
  expect(itemQty(player, "refined-iron-ingot")).toBe(2);
});

test("MMO Skill Demo marketplace trade uses targeted structured buy and sell inputs", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "marketplace-structured-actions");
  const join = await server.joinRoom({ roomId: "marketplace-structured-actions", roomType: "mmo-skill-demo", token: "dev:market-actions" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const merchant = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "merchant-kaya")!;
  player.zoneId = merchant.zoneId;
  player.x = merchant.x;
  player.y = merchant.y;
  player.gold = 20;
  setItemQty(player, "glade-berries", 0);

  await server.receiveInput(player.id, { action: "trade", targetId: merchant.id, devField: "market", devText: "buy", itemId: "glade-berries" });
  await server.tick(0.6);

  expect(player.gold).toBe(14);
  expect(itemQty(player, "glade-berries")).toBe(1);

  await server.receiveInput(player.id, { action: "trade", targetId: merchant.id, devField: "market", devText: "sell", itemId: "glade-berries" });
  await server.tick(0.6);

  expect(player.gold).toBe(16);
  expect(itemQty(player, "glade-berries")).toBe(0);

  const foreman = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "foreman-iron-will")!;
  player.zoneId = foreman.zoneId;
  player.x = foreman.x;
  player.y = foreman.y;
  player.gold = 20;
  setItemQty(player, "pickaxe", 0);

  await server.receiveInput(player.id, { action: "trade", targetId: foreman.id, devField: "market", devText: "buy", itemId: "pickaxe" });
  await server.tick(0.6);

  expect(player.gold).toBe(8);
  expect(itemQty(player, "pickaxe")).toBe(1);
});

test("MMO Skill Demo live world events reward players in the active event zone", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "world-event-reward");
  const firstJoin = await server.joinRoom({ roomId: "world-event-reward", roomType: "mmo-skill-demo", token: "dev:rally" });
  const secondJoin = await server.joinRoom({ roomId: "world-event-reward", roomType: "mmo-skill-demo", token: "dev:miner" });
  expect(firstJoin.ok).toBe(true);
  expect(secondJoin.ok).toBe(true);

  room.ctx.state.worldEventId = "ashwood-pack";
  room.ctx.state.worldEventName = "Ashwood Pack Rally";
  room.ctx.state.worldEventZoneId = "ashwood";
  room.ctx.state.worldEventPhase = "active";
  room.ctx.state.worldEventProgress = 0;
  room.ctx.state.worldEventGoal = 1;
  room.ctx.state.worldEventTimerMs = 60000;

  const rallyPlayer = room.ctx.state.players[firstJoin.player!.id];
  const distantPlayer = room.ctx.state.players[secondJoin.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  rallyPlayer.x = wolf.x - 34;
  rallyPlayer.y = wolf.y;
  rallyPlayer.zoneId = wolf.zoneId;
  distantPlayer.x = 18 * 32 + 16;
  distantPlayer.y = 18 * 32 + 16;
  distantPlayer.zoneId = "crags";
  wolf.hp = 1;

  const rallyRenown = rallyPlayer.renown;
  const distantRenown = distantPlayer.renown;
  await tapPummel(server, rallyPlayer.id, { action: "lmb", targetId: wolf.id });

  expect(room.ctx.state.worldEventPhase).toBe("success");
  expect(room.ctx.state.worldEventProgress).toBe(1);
  expect(rallyPlayer.renown).toBeGreaterThan(rallyRenown);
  expect(distantPlayer.renown).toBe(distantRenown);
});

test("MMO Skill Demo support and bomber enemies add readable encounter roles", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "new-enemy-roles");
  const join = await server.joinRoom({ roomId: "new-enemy-roles", roomType: "mmo-skill-demo", token: "dev:roles" });
  expect(join.ok).toBe(true);
  const player = room.ctx.state.players[join.player!.id];
  const priest = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "rune-priest")!;
  const guard = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "bazaar-guard")!;
  const bomber = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "mire-bomber")!;

  guard.hp = 20;
  priest.x = guard.x - 24;
  priest.y = guard.y;
  priest.zoneId = guard.zoneId;
  priest.projectileCooldownMs = 0;
  await server.tick();
  expect(guard.hp).toBeGreaterThan(20);

  player.zoneId = bomber.zoneId;
  player.x = bomber.x - 96;
  player.y = bomber.y;
  bomber.projectileCooldownMs = 0;
  await server.tick();
  expect(Object.values(room.ctx.state.hazards).some((hazard) => hazard.ownerId === bomber.id && hazard.kind === "aoe")).toBe(true);
});

test("MMO Skill Demo enemy melee attacks expose hit markers and clamped casts", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "enemy-hit-marker-casts");
  const join = await server.joinRoom({ roomId: "enemy-hit-marker-casts", roomType: "mmo-skill-demo", token: "dev:enemy-hit-marker" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  isolateCombatTarget(room.ctx.state, wolf.id);
  player.zoneId = wolf.zoneId;
  player.x = wolf.x + 18;
  player.y = wolf.y;
  wolf.combatFlags = `aggro:${player.id}`;
  wolf.stunMs = 0;
  wolf.attackCooldownMs = 0;
  wolf.projectileCooldownMs = 9999;
  const hpBefore = player.hp;

  await server.tick(0);

  expect(wolf.castMs).toBeGreaterThanOrEqual(200);
  expect(wolf.castMs).toBeLessThanOrEqual(1400);
  expect(player.hp).toBe(hpBefore);
  expect(Object.values(room.ctx.state.hazards).some((hazard) => hazard.ownerId === wolf.id && hazard.damage > 0 && hazard.windupMs >= 200 && hazard.windupMs <= 1400)).toBe(true);

  await server.tick(0.21);
  expect(player.hp).toBeLessThan(hpBefore);
});

test("MMO Skill Demo sight aggro reaches doubled detection range", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "doubled-aggro-range");
  const join = await server.joinRoom({ roomId: "doubled-aggro-range", roomType: "mmo-skill-demo", token: "dev:aggro-range" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const bat = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "iron-eye-bat")!;
  for (const npc of Object.values(room.ctx.state.npcs)) {
    if (npc.id !== bat.id) npc.hp = 0;
  }

  bat.zoneId = player.zoneId;
  bat.x = player.x + 260;
  bat.y = player.y;
  bat.spawnX = bat.x;
  bat.spawnY = bat.y;
  bat.projectileCooldownMs = 5000;

  await server.tick(0);
  const startX = bat.x;
  await server.tick(1);

  expect(bat.x).toBeLessThan(startX);
});

test("MMO Skill Demo neutral ecology tags suppress sight aggro until provoked", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "neutral-ecology-aggro");
  const join = await server.joinRoom({ roomId: "neutral-ecology-aggro", roomType: "mmo-skill-demo", token: "dev:eco-aggro" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const spider = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "gloom-weaver-spider")!;
  for (const npc of Object.values(room.ctx.state.npcs)) {
    if (npc.id !== spider.id) npc.hp = 0;
  }

  spider.zoneId = "ashwood";
  spider.x = 2200;
  spider.y = 2200;
  spider.spawnX = spider.x;
  spider.spawnY = spider.y;
  spider.hp = spider.maxHp;
  spider.projectileCooldownMs = 5000;
  player.zoneId = spider.zoneId;
  player.x = spider.x - 260;
  player.y = spider.y;

  await server.tick(0);
  const idleX = spider.x;
  const idleY = spider.y;
  await server.tick(1);
  expect(spider.x).toBe(idleX);
  expect(spider.y).toBe(idleY);

  spider.hp = spider.maxHp - 1;
  await server.tick(1);
  expect(Math.hypot(spider.x - idleX, spider.y - idleY)).toBeGreaterThan(0);
});

test("MMO Skill Demo spawns four added enemy types with stronger health", () => {
  const world = createMmoSkillDemoState();
  const dungeon = createMmoSkillDemoState("dungeon-party-test");
  const worldKinds = new Set(Object.values(world.npcs).map((npc) => npc.kind));
  const dungeonKinds = new Set(Object.values(dungeon.npcs).map((npc) => npc.kind));
  const wolf = Object.values(world.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  const bramble = Object.values(world.npcs).find((npc) => npc.kind === "ash-bramble-stalker")!;

  expect(worldKinds.has("ash-bramble-stalker")).toBe(true);
  expect(worldKinds.has("crag-sapper")).toBe(true);
  expect(worldKinds.has("veil-oracle")).toBe(true);
  expect(dungeonKinds.has("dungeon-revenant")).toBe(true);
  expect(bramble.maxHp).toBeGreaterThan(wolf.maxHp);
});

test("MMO Skill Demo spawned hostile kinds have explicit bestiary profiles", () => {
  const supportRoles = new Set(["quest", "trainer", "bank", "merchant", "travel", "contract", "crafting", "hidden", "home"]);
  const states = [createMmoSkillDemoState(), createMmoSkillDemoState("dungeon-party-test")];
  const hostileKinds = new Set(
    states.flatMap((state) => Object.values(state.npcs).filter((npc) => !supportRoles.has(npc.role)).map((npc) => npc.kind))
  );

  expect([...hostileKinds].filter((kind) => !bestiaryById[kind])).toEqual([]);
});

test("MMO Skill Demo enemy camps add world congregations", () => {
  const world = createMmoSkillDemoState();
  const counts = Object.values(world.npcs).reduce((acc, npc) => acc.set(npc.kind, (acc.get(npc.kind) ?? 0) + 1), new Map<string, number>());
  for (const kind of ["bramble-beast", "sapper-goblin", "marrow-cove-rat", "spire-sentinel", "high-peak-eagle", "scavenger-jackal", "rift-leech", "void-crawler", "cursed-oracle", "void-amalgam"]) {
    expect(counts.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(2);
  }
});

test("MMO Skill Demo keeps shared-world hostile spawns beyond town safe screens", () => {
  const supportRoles = new Set(["quest", "trainer", "bank", "merchant", "travel", "contract", "crafting", "hidden", "home"]);
  const townCenters = mmoSkillDemoRegionConfig.anchors
    .filter((anchor) => anchor.kind === "town" || anchor.id === "obsidian-sanctum")
    .map((anchor) => ({ id: anchor.id, x: anchor.tileX * TILE + TILE * 0.5, y: anchor.tileY * TILE + TILE * 0.5 }));
  const minDistance = 960 * 1.5;
  const world = createMmoSkillDemoState();
  const offenders = Object.values(world.npcs)
    .filter((npc) => !supportRoles.has(npc.role) && npc.role !== "boss-node")
    .flatMap((npc) =>
      townCenters
        .map((town) => ({ npc: npc.kind, town: town.id, distance: Math.hypot(npc.x - town.x, npc.y - town.y) }))
        .filter((entry) => entry.distance < minDistance)
        .map((entry) => `${entry.npc}@${entry.town}:${Math.round(entry.distance)}`)
    );

  expect(offenders).toEqual([]);
});

test("MMO Skill Demo enemy health scales 1.5x to 4x by strength", () => {
  const world = createMmoSkillDemoState();
  const dungeon = createMmoSkillDemoState("dungeon-party-test");
  const wolves = Object.values(world.npcs).filter((npc) => npc.kind === "prowling-wolf");
  const sapper = Object.values(world.npcs).find((npc) => npc.kind === "crag-sapper" && npc.maxHp === 104);
  const alpha = Object.values(world.npcs).find((npc) => npc.kind === "alpha-timberwolf")!;
  const boss = Object.values(dungeon.npcs).find((npc) => npc.kind === "great-ash-lord")!;
  const banker = Object.values(world.npcs).find((npc) => npc.kind === "banker-valerius")!;

  expect(wolves.some((npc) => npc.maxHp === 39 || npc.maxHp === 42)).toBe(true);
  expect(sapper).toBeDefined();
  expect(alpha.maxHp).toBe(276);
  expect(boss.maxHp).toBe(840);
  expect(banker.maxHp).toBe(120);
});

test("MMO Skill Demo enemy respawn timers scale 10x to 30x by strength", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone, mmoSkillDemoDungeon]
  });
  const killKindWithPummel = async (roomId: string, kind: string) => {
    const room = server.createRoom("mmo-skill-demo", roomId);
    const join = await server.joinRoom({ roomId, roomType: "mmo-skill-demo", token: `dev:${roomId}` });
    expect(join.ok).toBe(true);
    const player = room.ctx.state.players[join.player!.id];
    const target = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === kind)!;
    player.zoneId = target.zoneId;
    player.x = target.x - 20;
    player.y = target.y;
    player.aimX = target.x;
    player.aimY = target.y;
    player.combatLevel = 20;
    player.cooldownMs = 0;
    player.cooldowns = {};
    player.activeAbility = "";
    player.activeSlot = "";
    player.activeMs = 0;
    player.activeDurationMs = 0;
    player.chargeMs = 0;
    player.castMs = 0;
    player.abilityHits = "";
    target.hp = 1;
    target.respawnMs = 0;
    target.phaseMs = 0;
    target.iframeMs = 0;

    await tapPummel(server, player.id, { action: "lmb", targetId: target.id, aimX: target.x, aimY: target.y });

    if (target.hp !== 0) throw new Error(`${kind} survived pummel with ${target.hp} hp`);
    expect(target.hp).toBe(0);
    return target.respawnMs;
  };

  const wolfTimer = await killKindWithPummel("respawn-scale-wolf", "prowling-wolf");
  const alphaTimer = await killKindWithPummel("respawn-scale-alpha", "alpha-timberwolf");
  const dungeonState = createMmoSkillDemoState("respawn-scale-boss-dungeon");
  const boss = Object.values(dungeonState.npcs).find((npc) => npc.kind === "great-ash-lord")!;
  const bossTimer = mmoSkillDemoNpcRespawnMs(boss);

  expect(wolfTimer).toBeGreaterThanOrEqual(51500);
  expect(wolfTimer).toBeLessThanOrEqual(52000);
  expect(alphaTimer).toBeGreaterThanOrEqual(239000);
  expect(alphaTimer).toBeLessThanOrEqual(240000);
  expect(bossTimer).toBe(540000);
  expect(bossTimer).toBeGreaterThan(0xffff);
});

test("MMO Skill Demo melee pack hunters lunge instead of firing ranged lines", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "wolf-lunge");
  const join = await server.joinRoom({ roomId: "wolf-lunge", roomType: "mmo-skill-demo", token: "dev:wolf-lunge" });
  expect(join.ok).toBe(true);
  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x + 108;
  player.y = wolf.y;
  player.hp = player.maxHp;
  wolf.projectileCooldownMs = 0;
  wolf.attackCooldownMs = 0;
  const beforeDistance = Math.hypot(player.x - wolf.x, player.y - wolf.y);

  await server.tick();

  expect(Math.hypot(player.x - wolf.x, player.y - wolf.y)).toBeLessThan(beforeDistance);
  expect(player.hp).toBe(player.maxHp);
  expect(Object.values(room.ctx.state.hazards).some((hazard) => hazard.ownerId === wolf.id && hazard.kind === "line")).toBe(true);

  await server.tick(0.9);

  expect(player.hp).toBeLessThan(player.maxHp);
});

test("MMO Skill Demo elite melee wolves show lunge indicators before hits", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "alpha-lunge");
  const join = await server.joinRoom({ roomId: "alpha-lunge", roomType: "mmo-skill-demo", token: "dev:alpha-lunge" });
  expect(join.ok).toBe(true);
  const player = room.ctx.state.players[join.player!.id];
  const alpha = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "alpha-timberwolf")!;
  player.zoneId = alpha.zoneId;
  player.x = alpha.x + 136;
  player.y = alpha.y;
  player.hp = player.maxHp;
  alpha.phaseMs = 0;
  alpha.projectileCooldownMs = 0;
  alpha.attackCooldownMs = 0;
  const beforeDistance = Math.hypot(player.x - alpha.x, player.y - alpha.y);

  await server.tick();

  expect(Math.hypot(player.x - alpha.x, player.y - alpha.y)).toBeLessThan(beforeDistance);
  expect(player.hp).toBe(player.maxHp);
  expect(Object.values(room.ctx.state.hazards).some((hazard) => hazard.ownerId === alpha.id && hazard.kind === "line")).toBe(true);

  await server.tick(0.9);

  expect(player.hp).toBeLessThan(player.maxHp);
});

test("MMO Skill Demo stronger enemies phase through invulnerability then buffed attacks", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone, mmoSkillDemoDungeon]
  });
  const world = server.createRoom("mmo-skill-demo", "strong-phase");
  const worldJoin = await server.joinRoom({ roomId: "strong-phase", roomType: "mmo-skill-demo", token: "dev:phase" });
  expect(worldJoin.ok).toBe(true);

  const worldPlayer = world.ctx.state.players[worldJoin.player!.id];
  const gargoyle = Object.values(world.ctx.state.npcs).find((npc) => npc.kind === "crag-gargoyle")!;
  worldPlayer.zoneId = gargoyle.zoneId;
  worldPlayer.x = gargoyle.x - 34;
  worldPlayer.y = gargoyle.y;
  worldPlayer.combatLevel = 12;
  gargoyle.phaseMs = 3300;
  gargoyle.hp = gargoyle.maxHp;
  await tapPummel(server, worldPlayer.id, { action: "lmb", targetId: gargoyle.id });
  expect(gargoyle.hp).toBe(gargoyle.maxHp);

  const dungeon = server.createRoom("mmo-skill-demo-dungeon", "dungeon-phase");
  const dungeonJoin = await server.joinRoom({ roomId: "dungeon-phase", roomType: "mmo-skill-demo-dungeon", token: "dev:revenant" });
  expect(dungeonJoin.ok).toBe(true);
  const dungeonPlayer = dungeon.ctx.state.players[dungeonJoin.player!.id];
  const revenant = Object.values(dungeon.ctx.state.npcs).find((npc) => npc.kind === "dungeon-revenant")!;
  dungeonPlayer.zoneId = revenant.zoneId;
  dungeonPlayer.x = revenant.x - 90;
  dungeonPlayer.y = revenant.y;
  revenant.phaseMs = 5300;
  revenant.projectileCooldownMs = 0;
  await server.tick();

  expect(Object.values(dungeon.ctx.state.hazards).some((hazard) => hazard.ownerId === revenant.id && hazard.kind === "line")).toBe(true);
});

test("MMO Skill Demo crushing leap applies slam crowd-control metadata", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "combat-kbm");
  const join = await server.joinRoom({ roomId: "combat-kbm", roomType: "mmo-skill-demo", token: "dev:kbm" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 42;
  player.y = wolf.y;
  player.combatLevel = 6;
  player.abilitySlots.RMB = "unlocked";
  player.abilitySlots["rmb-crushing-blow"] = "RMB";
  player.cooldownMs = 0;

  await castCrushingLeap(server, player.id, { action: "rmb", aimX: wolf.x, aimY: wolf.y });

  expect(wolf.hp).toBeLessThan(wolf.maxHp);
  expect(wolf.stunMs).toBeGreaterThan(0);
  expect(wolf.slowMs).toBeGreaterThan(0);
  expect(player.castMs).toBeGreaterThan(0);
});

test("MMO Skill Demo crushing leap keeps replicated timer extensions encodable", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "combat-kbm-u16");
  const join = await server.joinRoom({ roomId: "combat-kbm-u16", roomType: "mmo-skill-demo", token: "dev:kbm-u16" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const wolf = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "prowling-wolf")!;
  player.zoneId = wolf.zoneId;
  player.x = wolf.x - 42;
  player.y = wolf.y;
  player.combatLevel = 6;
  player.abilitySlots.RMB = "unlocked";
  player.abilitySlots["rmb-crushing-blow"] = "RMB";
  player.cooldownMs = 0;
  wolf.attackCooldownMs = 65400;
  wolf.projectileCooldownMs = 65400;

  await server.tick(0.016);
  const before = structuredClone(room.snapshotFor(player.id));
  await castCrushingLeap(server, player.id, { action: "rmb", aimX: wolf.x, aimY: wolf.y });
  const after = structuredClone(room.snapshotFor(player.id));

  expect(wolf.attackCooldownMs).toBeLessThanOrEqual(65535);
  expect(wolf.projectileCooldownMs).toBeLessThanOrEqual(65535);
  expect(() => encodeSnapshot(mmoSkillDemoSchema, after)).not.toThrow();
  expect(() => encodeDelta(mmoSkillDemoSchema, before, after)).not.toThrow();
});

test("MMO Skill Demo personalities drive aggro-tree neutrality and vacuum roots", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "persona-tree");
  const join = await server.joinRoom({ roomId: "persona-tree", roomType: "mmo-skill-demo", token: "dev:tree" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  const tree = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "aggro-tree")!;
  player.zoneId = tree.zoneId;
  player.x = tree.x - 112;
  player.y = tree.y;
  tree.projectileCooldownMs = 0;
  await server.tick();
  expect(Object.values(room.ctx.state.hazards).some((hazard) => hazard.ownerId === tree.id)).toBe(false);

  tree.hp = tree.maxHp - 1;
  tree.projectileCooldownMs = 0;
  await server.tick();
  const root = Object.values(room.ctx.state.hazards).find((hazard) => hazard.ownerId === tree.id);
  expect(root).toBeDefined();
  expect(root!.knockbackModifier).toBeLessThan(0);
  expect(tree.personality).toBe("territorial-rooted");
});

test("MMO Skill Demo boss phase minigames spawn shield objects", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoDungeon]
  });
  const room = server.createRoom("mmo-skill-demo-dungeon", "dungeon-boss-minigames");
  const join = await server.joinRoom({ roomId: "dungeon-boss-minigames", roomType: "mmo-skill-demo-dungeon", token: "dev:boss-phase" });
  expect(join.ok).toBe(true);
  const player = room.ctx.state.players[join.player!.id];
  const ashLord = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "great-ash-lord")!;
  const mirror = Object.values(room.ctx.state.npcs).find((npc) => npc.kind === "mirror-king")!;

  player.zoneId = "dungeon";
  ashLord.hp = Math.floor(ashLord.maxHp * 0.65);
  await server.tick();
  expect(Object.values(room.ctx.state.npcs).filter((npc) => npc.kind === "spore-pod" && npc.hp > 0)).toHaveLength(4);
  expect(ashLord.combatState).toBe("spore-shield");

  mirror.hp = Math.floor(mirror.maxHp * 0.49);
  await server.tick();
  expect(Object.values(room.ctx.state.npcs).filter((npc) => npc.kind === "glass-clone" && npc.hp > 0)).toHaveLength(4);
  expect(mirror.combatState).toBe("gravity-well");
});

test("MMO Skill Demo 10-player Flurry boss benchmark stays under the server frame budget", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "flurry-dungeon-benchmark");
  const joins = [];
  for (let i = 0; i < 10; i += 1) {
    const join = await server.joinRoom({ roomId: "flurry-dungeon-benchmark", roomType: "mmo-skill-demo", token: `dev:flurry-bench-${i}` });
    expect(join.ok).toBe(true);
    joins.push(join);
  }

  const state = room.ctx.state;
  const boss = Object.values(state.npcs).find((npc) => npc.kind === "great-ash-lord")!;
  for (const id of Object.keys(state.npcs)) {
    if (id !== boss.id) delete state.npcs[id];
  }
  boss.hp = 60000;
  boss.maxHp = 60000;
  boss.attackCooldownMs = 60000;
  boss.projectileCooldownMs = 60000;
  boss.stunMs = 60000;
  boss.iframeMs = 0;
  boss.damageAmpMs = 0;
  boss.combatState = "";
  boss.combatFlags = "";

  for (let i = 0; i < joins.length; i += 1) {
    const player = state.players[joins[i].player!.id];
    player.x = Math.max(48, boss.x - 320);
    player.y = boss.y - 120 + i * 26;
    player.zoneId = "dungeon";
    player.hp = player.maxHp;
    player.energy = player.maxEnergy || 100;
    player.combatLevel = 20;
    player.inventory.bow = 1;
    player.equipment.weapon = "bow";
    player.equippedWeaponId = "bow";
    player.equipment["ability:R"] = "bow-flurry";
    player.abilitySlots["bow-flurry"] = "R";
    player.abilitySlots.R = "unlocked";
    player.aimX = boss.x;
    player.aimY = boss.y;
  }
  syncMmoEntityRegistry(state);

  for (const join of joins) await server.receiveInput(join.player!.id, { action: "r", aimX: boss.x, aimY: boss.y });
  await server.tick(0);

  const samples: number[] = [];
  for (let tick = 0; tick < 360; tick += 1) {
    for (const join of joins) {
      const player = state.players[join.player!.id];
      if (!player.activeAbility) player.energy = player.maxEnergy || 100;
      await server.receiveInput(player.id, { action: "r", aimX: boss.x, aimY: boss.y });
    }
    const start = performance.now();
    await server.tick(1 / 60);
    let bytes = 0;
    for (const join of joins) {
      const snapshot = mmoSkillDemoZone.getSnapshot!(room.ctx, join.player!);
      bytes += encodeSnapshot(mmoSkillDemoSchema, snapshot).byteLength;
    }
    expect(bytes).toBeGreaterThan(0);
    samples.push(performance.now() - start);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const avg = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const p95 = sorted[Math.floor(sorted.length * 0.95)];

  expect(avg).toBeLessThan(8);
  expect(p95).toBeLessThan(15);
  expect(60000 - state.npcs[boss.id].hp).toBeGreaterThan(1000);
  expect(Object.values(state.players).filter((player) => player.activeAbility === "bow-flurry")).toHaveLength(10);
  expect(Object.keys(state.hazards).length).toBeLessThanOrEqual(40);
});

test("MMO Skill Demo snapshots cap replicated hazards through the interest grid", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [mmoSkillDemoZone]
  });
  const room = server.createRoom("mmo-skill-demo", "hazard-interest-cap");
  const join = await server.joinRoom({ roomId: "hazard-interest-cap", roomType: "mmo-skill-demo", token: "dev:hazard-cap" });
  expect(join.ok).toBe(true);

  const player = room.ctx.state.players[join.player!.id];
  player.zoneId = "dungeon";
  player.x = 1000;
  player.y = 600;
  for (let i = 0; i < 80; i += 1) {
    room.ctx.state.hazards[`bench-hazard-${i}`] = {
      id: `bench-hazard-${i}`,
      entityType: "hazard",
      kind: "line",
      zoneId: "dungeon",
      ownerId: player.id,
      x: player.x - 80 + (i % 10) * 16,
      y: player.y - 80 + Math.floor(i / 10) * 16,
      toX: player.x + 80,
      toY: player.y,
      radius: 8,
      windupMs: 0,
      lifetimeMs: 1000,
      damage: 0,
      knockbackModifier: 0,
      isHeavyImpact: false,
      armorPierce: false,
      effectKind: "arrow",
      text: "",
      pulse: 0
    };
  }
  syncMmoEntityRegistry(room.ctx.state);
  await server.tick(0);

  const snapshot = mmoSkillDemoZone.getSnapshot!(room.ctx, join.player!);
  expect(Object.keys(room.ctx.state.hazards)).toHaveLength(80);
  expect(Object.keys(snapshot.hazards).length).toBeLessThanOrEqual(16);
});
