import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeMultipartReplicationEnvelope, decodeReplicationFrame, decodeSnapshot, encodeSnapshot, type ReplicationEnvelopeSegment } from "@hyperfocus/engine/protocol";
import { resolveSpriteSheetFrame } from "@hyperfocus/engine/render";
import { createMmo1000Preset } from "@hyperfocus/engine/server";
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
import { mmoSkillDemoSchema as mmoSkillDemoClientSchema } from "../schema.ts";
import { spriteSheetMetaForSize } from "../client/render/sprite-sheets.ts";
import { buildTiles, MAP_HEIGHT, MAP_WIDTH } from "../client/world.ts";
import { createMmoSkillDemoCollisionKernel, createMmoSkillDemoState, extractMmoSkillDemoResources, mmoSkillDemoMap } from "../shared-world-state.ts";
import { attachMmoEntityViews, mmoSkillDemoEntityTypeCount, mmoSkillDemoSharedHotSlotForEntityType, mmoSkillDemoSharedHotBytesForEntity, removeMmoSkillDemoEntity, syncMmoEntityRegistry } from "../shared-entity-registry.ts";
import { mmoSkillDemoCottage, mmoSkillDemoDungeon, mmoSkillDemoZone } from "../shared-room.ts";
import { mmoSkillDemoMultipartCodec } from "../segmented-replication.ts";
import { mmoSkillDemoSharedHotSchema } from "../shared-hot.ts";
import { mmoSkillDemoSchema } from "../schema.ts";
import { mmoCatalog } from "../shared-world-catalog.ts";
import { type MmoSkillDemoState } from "../shared-contracts.ts";
import { mmoSkillDemoActionCode, mmoSkillDemoCellKey, mmoSkillDemoEntityIdCode, mmoSkillDemoNeighborCellKeys, mmoSkillDemoStatusMask, type MmoSkillDemoSegmentKind } from "../segmented-replication.ts";
import { gatherableMaterials } from "../shared/materials.ts";
import { createAuthoritativeServer, tapPummel } from "./shared-test-support.ts";

const scaledTile = (value: number) => value * WORLD_MAP_SCALE;

function parseMmoSegmentKind(kind: string): MmoSkillDemoSegmentKind {
  if (
    kind === "world-cell-static"
    || kind === "world-cell-volatile"
    || kind === "private-static"
    || kind === "private-volatile"
    || kind === "transient"
  ) return kind;
  throw new Error(`Unexpected MMO segment kind: ${kind}`);
}

function typedMmoSegments(segments: readonly ReplicationEnvelopeSegment[]): readonly ReplicationEnvelopeSegment<MmoSkillDemoSegmentKind>[] {
  return segments.map((segment) => ({ ...segment, kind: parseMmoSegmentKind(segment.kind) }));
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
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
  expect(worldCreatureDefinitions.some((creature) => creature.ecologyTags.some((tag) => tag === "neutral-on-sight"))).toBe(true);
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
  const envelope = decodeMultipartReplicationEnvelope(frame.bytes, { parseKind: parseMmoSegmentKind });
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
  const roomTelemetry = server.getStats().roomTelemetry[0].room;
  const replication = isUnknownRecord(roomTelemetry) ? Reflect.get(roomTelemetry, "replication") : undefined;
  const discovery = isUnknownRecord(replication) ? Reflect.get(replication, "discovery") : undefined;
  const adaptive = isUnknownRecord(replication) ? Reflect.get(replication, "adaptive") : undefined;
  if (!isUnknownRecord(discovery) || !isUnknownRecord(adaptive)) throw new Error("Expected replication telemetry records.");
  expect(typeof Reflect.get(discovery, "queueDepth")).toBe("number");
  expect(typeof Reflect.get(discovery, "maxBacklogAge")).toBe("number");
  expect(typeof Reflect.get(discovery, "avgTTD")).toBe("number");
  const staticDeferral = Reflect.get(adaptive, "staticDeferral");
  expect(isUnknownRecord(staticDeferral) ? Reflect.get(staticDeferral, "reduceStaticRecordsRecommended") : undefined).toBe(false);
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

  let before: ReturnType<typeof mmoSkillDemoMultipartCodec.decodeSnapshot> | undefined;
  let previousState: typeof room.ctx.state | undefined;
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
