import { expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sortRenderCallsByY, type Renderable, type SpriteRenderData } from "@hyperfocus/engine/render";
import { abilityTooltip } from "../client/ability-tooltips.ts";
import { clientTransientEffectTiming, RENDER_LAYER_CONFIG } from "../client/render.ts";
import { createAimReticleRenderCalls, createVisualEffectQueue } from "../client/render/effects.ts";
import { createHudRenderCalls, updateDialogState } from "../client/render/hud.ts";
import { createImpactFeedbackController } from "../client/render/impact.ts";
import { landmarkInteractionInfo } from "../client/render/interactions.ts";
import { createLootRenderCalls } from "../client/render/loot.ts";
import { createNpcRenderCalls, npcJobCue, questMarkerFor } from "../client/render/npcs.ts";
import { abilityCastSfx, abilityImpactSfx, abilityProjectileSfx, createRenderSignalTracker, impactFeedbackForAbility, npcAttackSfx } from "../client/render/signals.ts";
import { createPlayerRenderCalls } from "../client/render/players.ts";
import { createMainQuestGuideRenderCalls } from "../client/render/quests.ts";
import { createResourceRenderCalls } from "../client/render/resources.ts";
import { createHazardRenderCalls } from "../client/render/hazards.ts";
import { createTerrainRenderCalls } from "../client/render/terrain.ts";
import { createCompactPanelState } from "../client/ui-shell.ts";
import { createDefaultMapFilterState, mapFilterSignature, mapNodeTooltipInfoForResource, toggleMapFilter } from "../client/map-overlay.ts";
import { mainQuestDestination } from "../client/quest-guide.ts";
import { slotCooldownMs } from "../client/combat-view.ts";
import { clientImageSources, expandedCreatureVisuals, factionZoneVisuals } from "../data/assets.ts";
import { NPC_SIZE_BY_KIND, PLAYER_SIZE, RESOURCE_SIZE_BY_KIND } from "../data/entity-sizes.ts";
import { worldAreaCaptureAnchors, worldLandmarkId, worldLandmarkPlacements } from "../data/world-landmarks.ts";
import { worldCreatureDefinitions } from "../data/world-creatures.ts";
import { worldGatherableNodeSpecs } from "../data/world-gatherables.ts";
import { getMmoSkillDemoAnchorTile } from "../data/world.ts";
import type { HazardEntity, LootEntity, MmoSkillDemoState, NpcEntity, PlayerEntity, ResourceEntity } from "../shared.ts";
import { buildTiles, TILE } from "../client/world.ts";
import { createTestNpc, createTestPlayer } from "./test-fixtures.ts";

const renderRoot = join(import.meta.dir, "..", "client");

function renderFiles() {
  const dir = join(renderRoot, "render");
  const files = readdirSync(dir).filter((name) => name.endsWith(".ts")).map((name) => join(dir, name));
  files.push(join(renderRoot, "render.ts"));
  return files;
}

function fakeImage(width = 64, height = 64) {
  return { width, height, naturalWidth: width, naturalHeight: height } as HTMLImageElement;
}

function inspectRender<T>(call: Renderable): T {
  return call as unknown as T;
}

function readPngSize(path: string) {
  const data = readFileSync(path);
  expect([...data.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function assertStructured(call: Renderable): void {
  expect(typeof call).not.toBe("function");
  const data = inspectRender<{ kind?: string; draw?: unknown; calls?: Renderable[] }>(call);
  expect(data.kind).not.toBe("custom");
  expect(data.draw).toBeUndefined();
  for (const child of data.calls ?? []) assertStructured(child);
}

function flattenRenderCalls(calls: Renderable[]): Renderable[] {
  const flat: Renderable[] = [];
  for (const call of calls) {
    flat.push(call);
    const children = inspectRender<{ calls?: Renderable[] }>(call).calls;
    if (children) flat.push(...flattenRenderCalls(children));
  }
  return flat;
}

function player(overrides: Partial<PlayerEntity> = {}): PlayerEntity {
  return {
    ...createTestPlayer(),
    id: "p1",
    entityType: "player",
    name: "Tester",
    x: 100,
    y: 120,
    hp: 90,
    maxHp: 100,
    mana: 30,
    maxMana: 60,
    combatXp: 0,
    combatLevel: 1,
    miningXp: 0,
    miningLevel: 1,
    woodcuttingXp: 0,
    woodcuttingLevel: 1,
    zoneId: "ashwood",
    gold: 0,
    renown: 0,
    masteryRank: 1,
    contractId: "ashwood-hunt",
    contractKills: 0,
    contractStreak: 0,
    contractCooldownMs: 0,
    inventory: {},
    bank: {},
    equipment: {},
    abilitySlots: { "lmb-strike": "LMB", LMB: "unlocked" },
    questFlags: {},
    activeQuestId: "first-cut",
    wolfKills: 0,
    batKills: 0,
    bazaarSurvivalMs: 0,
    dungeonBossKills: 0,
    homeZoneId: "port-marrow",
    escortNpcId: "",
    escortTargetX: 0,
    escortTargetY: 0,
    escortTargetZoneId: "ashwood",
    escortMs: 0,
    instanceId: "",
    prestigeTitle: "",
    action: "idle",
    targetId: "",
    aimX: 100,
    aimY: 120,
    guardMs: 0,
    berserkMs: 0,
    cooldownMs: 0,
    visibleCount: 0,
    ...overrides
  };
}

function npc(overrides: Partial<NpcEntity> = {}): NpcEntity {
  return {
    ...createTestNpc(),
    id: "npc-1",
    entityType: "npc",
    kind: "prowling-wolf",
    role: "mob",
    zoneId: "ashwood",
    elite: false,
    x: 140,
    y: 160,
    spawnX: 140,
    spawnY: 160,
    hp: 20,
    maxHp: 20,
    respawnMs: 0,
    attackCooldownMs: 0,
    projectileCooldownMs: 0,
    phaseMs: 0,
    summonedBy: "",
    ...overrides
  };
}

function state(overrides: Partial<MmoSkillDemoState> = {}): MmoSkillDemoState {
  return {
    tick: 0,
    mapRevision: "test",
    roomKind: "world-zone",
    roomLabel: "Test",
    activePlayers: 1,
    worldEventId: "event",
    worldEventName: "Event",
    worldEventZoneId: "ashwood",
    worldEventPhase: "active",
    worldEventObjective: "Objective",
    worldEventProgress: 0,
    worldEventGoal: 1,
    worldEventTimerMs: 1000,
    worldEventReward: "Reward",
    effects: [],
    entities: {},
    players: {},
    npcs: {},
    resources: {},
    loots: {},
    hazards: {},
    ...overrides
  };
}

test("mmo render files do not own canvas drawing or dynamic custom calls", () => {
  const blockedCanvas = /ctx\.|getContext\(|drawImage\(|fillRect\(|strokeRect\(|beginPath\(|CanvasRenderingContext2D/;
  const blockedCustom = /kind:\s*"custom"|draw:\s*\(/;
  for (const file of renderFiles()) {
    const source = readFileSync(file, "utf8");
    expect(source.match(blockedCanvas)?.[0], file).toBeUndefined();
    expect(source.match(blockedCustom)?.[0], file).toBeUndefined();
  }
});

test("loot resources NPC and player modules return structured render data", () => {
  const images = { hero: fakeImage(176, 44), goldIcon: fakeImage() };
  const calls = [
    ...createLootRenderCalls({ id: "loot-1", entityType: "loot", itemId: "gold", amount: 3, zoneId: "ashwood", x: 210, y: 220, ownerId: "", expiresMs: 1000, pickupRadius: 32 } satisfies LootEntity, images, 1000),
    ...createResourceRenderCalls({ id: "tree-1", entityType: "resource", kind: "tree", zoneId: "ashwood", x: 230, y: 240, hp: 2, maxHp: 4, depleted: false, respawnMs: 0 } satisfies ResourceEntity, images),
    ...createNpcRenderCalls(npc(), images, player(), 1000),
    ...createPlayerRenderCalls(player(), images, 1000, player(), "p1", new Map())
  ];

  expect(calls.length).toBeGreaterThanOrEqual(4);
  for (const call of calls) assertStructured(call);
});

test("entity visual sizes use authored base numbers", () => {
  expect(PLAYER_SIZE.height).toBe(35.2);
  expect(PLAYER_SIZE.width).toBe(27.2);
  expect(PLAYER_SIZE.radius).toBe(8.8);
  expect(RESOURCE_SIZE_BY_KIND.tree!.height).toBeGreaterThan(PLAYER_SIZE.height);
  expect(RESOURCE_SIZE_BY_KIND.tree!.collisionRadius).toBe(17);
  expect(NPC_SIZE_BY_KIND["prowling-wolf"]!.height).toBeLessThan(PLAYER_SIZE.height);
  expect(NPC_SIZE_BY_KIND["alpha-timberwolf"]!.height).toBeGreaterThan(NPC_SIZE_BY_KIND["prowling-wolf"]!.height);
  expect(NPC_SIZE_BY_KIND["timber-goliath"]!.height).toBeGreaterThan(NPC_SIZE_BY_KIND["moss-grizzly"]!.height);
  expect(NPC_SIZE_BY_KIND["iron-core-golem"]!.height).toBeGreaterThan(NPC_SIZE_BY_KIND["great-ash-lord"]!.height);

  const images = { hero: fakeImage(176, 44) };
  const [group] = createPlayerRenderCalls(player(), images, 1000, player(), "p1", new Map());
  const sprite = inspectRender<{ calls: Array<{ kind?: string; width?: number; height?: number }> }>(group).calls.find((call) => call.kind === "sprite");
  expect(sprite?.height).toBe(PLAYER_SIZE.height);
});

test("expanded creature and faction zone visuals stay wired into render calls", () => {
  expect(Object.keys(expandedCreatureVisuals).sort()).toEqual(worldCreatureDefinitions.map((creature) => creature.id).sort());
  expect(Object.keys(factionZoneVisuals).sort()).toEqual(["aetheria", "ashwood-glade", "high-reach-peaks", "ironcrag", "oakhaven", "obsidian-sanctum", "port-marrow", "sunken-bazaar"]);

  const creatureCalls = flattenRenderCalls(createNpcRenderCalls(npc({ kind: "void-amalgam", role: "elite", elite: true }), {}, player(), 1000)) as Array<{ fill?: string; stroke?: string; text?: string }>;
  expect(creatureCalls.some((call) => call.fill === expandedCreatureVisuals["void-amalgam"].color || call.text === expandedCreatureVisuals["void-amalgam"].glyph)).toBe(true);

  const terrainImages: Record<string, HTMLImageElement> = Object.fromEntries([...new Set(worldLandmarkPlacements.map((placement) => placement.image))].map((imageKey) => [imageKey, fakeImage(96, 96)]));
  for (const area of worldAreaCaptureAnchors) {
    const placements = worldLandmarkPlacements.filter((placement) => placement.anchorId === area.id);
    const uniqueImages = new Set(placements.map((placement) => placement.image));
    expect(placements.length, area.id).toBeGreaterThanOrEqual(6);
    expect(uniqueImages.size, area.id).toBeGreaterThanOrEqual(5);
    expect(placements.some((placement) => placement.width * placement.height >= 6000), area.id).toBe(true);
    expect(placements.filter((placement) => placement.service).length, area.id).toBeGreaterThanOrEqual(3);
    const anchor = getMmoSkillDemoAnchorTile(area.id);
    const terrainCalls = createTerrainRenderCalls(buildTiles(), terrainImages, {
      x: (anchor.x - 6) * TILE,
      y: (anchor.y - 5) * TILE,
      width: 14 * TILE,
      height: 12 * TILE
    }) as Array<{ kind?: string; text?: string; fill?: string; image?: HTMLImageElement }>;
    const spriteCount = terrainCalls.filter((call) => call.kind === "sprite" && call.image && Object.values(terrainImages).includes(call.image)).length;
    expect(terrainCalls.some((call) => call.text === area.label), area.label).toBe(true);
    expect(spriteCount, area.id).toBeGreaterThanOrEqual(6);
  }
  const aetheriaCalls = createTerrainRenderCalls(buildTiles(), terrainImages, {
    x: (getMmoSkillDemoAnchorTile("aetheria").x - 3) * TILE,
    y: (getMmoSkillDemoAnchorTile("aetheria").y - 3) * TILE,
    width: 8 * TILE,
    height: 8 * TILE
  }) as Array<{ fill?: string }>;
  expect(aetheriaCalls.some((call) => call.fill === factionZoneVisuals.aetheria.color)).toBe(true);
});

test("world art sources stay registered and present", () => {
  const worldEntries = Object.entries(clientImageSources).filter(([key, source]) => key.startsWith("world") || source.startsWith("./assets/world/"));
  expect(worldEntries.length).toBeGreaterThanOrEqual(54);
  for (const key of [
    "worldForestDragonIdol",
    "worldGuildFire",
    "worldHolyAltar",
    "worldPortCraneTower",
    "worldDesertVaultBuilding",
    "worldRuinsWhite3",
    "worldVoidDangerSign",
    "worldVoidObsidianCell"
  ]) {
    expect(clientImageSources[key as keyof typeof clientImageSources], key).toContain("./assets/world/");
  }
  for (const [key, source] of worldEntries) {
    expect(key.startsWith("world"), key).toBe(true);
    expect(source, key).toContain("./assets/world/");
    const path = join(import.meta.dir, "..", "..", source.replace("./", ""));
    expect(existsSync(path), key).toBe(true);
    const size = readPngSize(path);
    expect(size.width, key).toBeGreaterThan(0);
    expect(size.height, key).toBeGreaterThan(0);
  }
});

test("gathering art sources stay registered and present", () => {
  const gatheringEntries = Object.entries(clientImageSources).filter(([key, source]) => key.startsWith("gather") || source.startsWith("./assets/gathering/"));
  expect(gatheringEntries.length).toBeGreaterThanOrEqual(38);
  for (const key of [
    "gatherTreePineWood",
    "gatherTreeElderBirch",
    "gatherRockCopper",
    "gatherCrystalBlack",
    "gatherPlantWildFlax",
    "gatherWaterShallow"
  ]) {
    expect(clientImageSources[key as keyof typeof clientImageSources], key).toContain("./assets/gathering/");
  }
  for (const [key, source] of gatheringEntries) {
    expect(key.startsWith("gather"), key).toBe(true);
    expect(source, key).toContain("./assets/gathering/");
    const path = join(import.meta.dir, "..", "..", source.replace("./", ""));
    expect(existsSync(path), key).toBe(true);
    const size = readPngSize(path);
    expect(size.width, key).toBeGreaterThan(0);
    expect(size.height, key).toBeGreaterThan(0);
  }
});

test("gatherable resource sprites use material identity instead of generic skill pools", () => {
  const pine = fakeImage(128, 128);
  const birch = fakeImage(128, 128);
  const copper = fakeImage(64, 64);
  const coal = fakeImage(64, 64);
  const images = {
    gatherTreePineWood: pine,
    gatherTreeElderBirch: birch,
    gatherRockCopper: copper,
    worldGuildCracks: coal
  };
  const pineCalls = flattenRenderCalls(createResourceRenderCalls({ id: "pine", entityType: "resource", kind: "tree", skillId: "lumberjacking", materialId: 1, zoneId: "ashwood", x: 100, y: 100, hp: 2, maxHp: 2, depleted: false, respawnMs: 0 }, images));
  const birchCalls = flattenRenderCalls(createResourceRenderCalls({ id: "birch", entityType: "resource", kind: "tree", skillId: "lumberjacking", materialId: 2, zoneId: "ashwood", x: 100, y: 100, hp: 2, maxHp: 2, depleted: false, respawnMs: 0 }, images));
  const copperCalls = flattenRenderCalls(createResourceRenderCalls({ id: "copper", entityType: "resource", kind: "ore", skillId: "mining", materialId: 6, zoneId: "crags", x: 100, y: 100, hp: 2, maxHp: 2, depleted: false, respawnMs: 0 }, images));
  const coalCalls = flattenRenderCalls(createResourceRenderCalls({ id: "coal", entityType: "resource", kind: "ore", skillId: "mining", materialId: 7, zoneId: "crags", x: 100, y: 100, hp: 2, maxHp: 2, depleted: false, respawnMs: 0 }, images));
  const sprite = (calls: Renderable[]) => calls.find(
    (call): call is SpriteRenderData => typeof call !== "function" && "image" in call
  );

  expect(sprite(pineCalls)?.image).toBe(pine);
  expect(sprite(birchCalls)?.image).toBe(birch);
  expect(sprite(copperCalls)?.image).toBe(copper);
  expect(sprite(coalCalls)?.image).toBe(coal);
  expect(sprite(pineCalls)?.width).not.toBe(sprite(birchCalls)?.width);
  expect(sprite(copperCalls)?.image).not.toBe(sprite(coalCalls)?.image);
});

test("enemy camp landmarks stay dense and visually unique", () => {
  const camps = worldLandmarkPlacements.filter((placement) => placement.kind === "camp");
  expect(camps.length).toBeGreaterThanOrEqual(10);
  expect(new Set(camps.map((camp) => camp.service)).size).toBe(camps.length);
  expect(new Set(camps.map((camp) => camp.image)).size).toBe(camps.length);
  expect(camps.filter((camp) => camp.visualId === "obsidian-sanctum").length).toBeGreaterThanOrEqual(3);
});

test("player mobility abilities render ghosts ribbons and readable labels", () => {
  const images = { hero: fakeImage(176, 44) };
  const cache = new Map([["p1", { x: 100, y: 120, ability: "wand-blink", activeMs: 20, activeSeenMs: 1000 }]]);
  const [group] = createPlayerRenderCalls(
    player({ x: 168, y: 120, equipment: { weapon: "wand" }, equippedWeaponId: "wand", activeAbility: "", activeSlot: "Space", abilitySlots: { Space: "unlocked", "wand-blink": "Space" }, iframeMs: 120 }),
    images,
    1120,
    player(),
    "p1",
    cache
  );
  const calls = inspectRender<{ calls: Array<{ id?: string; kind?: string; text?: string }> }>(group).calls;
  const lastMotion = calls.reduce((last, call, index) => call.id?.includes("movement-afterimage") || call.id?.includes("motion-ribbon") ? index : last, -1);
  const label = calls.findIndex((call) => call.kind === "text" && call.text === "Tester");

  expect(calls.some((call) => call.id?.includes("movement-afterimage"))).toBe(true);
  expect(calls.some((call) => call.id?.includes("motion-ribbon"))).toBe(true);
  expect(calls.some((call) => call.id?.includes("body-accent"))).toBe(true);
  expect(label).toBeGreaterThan(lastMotion);
});

test("player render tracks facing and flips the stopgap sprite", () => {
  const images = { hero: fakeImage(176, 44) };
  const rightCache = new Map([["p1", { x: 100, y: 120, facingX: 0, facingY: 1 }]]);
  const [rightGroup] = createPlayerRenderCalls(player({ x: 128, y: 120, activeAbility: "", activeSlot: "" }), images, 1000, player(), "p1", rightCache);
  const rightCalls = inspectRender<{ calls: Array<{ id?: string; kind?: string; flipX?: boolean; points?: Array<{ x: number; y: number }> }> }>(rightGroup).calls;
  const rightSprite = rightCalls.find((call) => call.kind === "sprite");
  const rightCue = rightCalls.find((call) => call.id === "player-facing-chevron");

  expect(rightSprite?.flipX).toBe(false);
  expect((rightCache.get("p1")?.facingX ?? 0)).toBeGreaterThan(0.9);
  expect((rightCue?.points?.[0]?.x ?? 0)).toBeGreaterThan(rightCue?.points?.[1]?.x ?? 0);

  const leftCache = new Map([["p1", { x: 128, y: 120, facingX: 1, facingY: 0 }]]);
  const [leftGroup] = createPlayerRenderCalls(player({ x: 100, y: 120, activeAbility: "", activeSlot: "" }), images, 1000, player(), "p1", leftCache);
  const leftCalls = inspectRender<{ calls: Array<{ id?: string; kind?: string; flipX?: boolean; points?: Array<{ x: number; y: number }> }> }>(leftGroup).calls;
  const leftSprite = leftCalls.find((call) => call.kind === "sprite");
  const leftCue = leftCalls.find((call) => call.id === "player-facing-chevron");

  expect(leftSprite?.flipX).toBe(true);
  expect((leftCache.get("p1")?.facingX ?? 0)).toBeLessThan(-0.9);
  expect((leftCue?.points?.[0]?.x ?? 0)).toBeLessThan(leftCue?.points?.[1]?.x ?? 0);
});

test("player charge renders weapon themed swirls", () => {
  const [group] = createPlayerRenderCalls(
    player({ activeAbility: "mace-pummel", activeSlot: "LMB", chargeMs: 1200, abilityVectorX: 1, abilityVectorY: 0 }),
    { hero: fakeImage(176, 44) },
    1400,
    player(),
    "p1",
    new Map()
  );
  const calls = inspectRender<{ calls: Array<{ id?: string }> }>(group).calls;

  expect(calls.filter((call) => call.id?.startsWith("charge-swirl")).length).toBe(3);
  expect(calls.some((call) => call.id === "charge-ring")).toBe(true);
  expect(calls.some((call) => call.id === "pummel-hit-indicator-fill")).toBe(true);
  expect(calls.some((call) => call.id === "pummel-hit-indicator-edge")).toBe(true);
});

test("player facing triangle follows live aim after attacks", () => {
  const [group] = createPlayerRenderCalls(
    player({ activeAbility: "mace-pummel", activeSlot: "LMB", action: "lmb", aimX: 100, aimY: 40, abilityVectorX: 1, abilityVectorY: 0 }),
    { hero: fakeImage(176, 44) },
    1400,
    player(),
    "p1",
    new Map()
  );
  const calls = inspectRender<{ calls: Array<{ id?: string; points?: Array<{ x: number; y: number }> }> }>(group).calls;
  const cue = calls.find((call) => call.id === "player-facing-chevron");

  expect((cue?.points?.[0]?.y ?? 999)).toBeLessThan(cue?.points?.[1]?.y ?? 0);
});

test("player charged actions lean without violent sprite shake", () => {
  const [group] = createPlayerRenderCalls(
    player({ activeAbility: "mace-pummel", activeSlot: "LMB", chargeMs: 1200, castMs: 180, abilityVectorX: 1, abilityVectorY: 0 }),
    { hero: fakeImage(176, 44) },
    1400,
    player(),
    "p1",
    new Map()
  );
  const calls = inspectRender<{ calls: Array<{ id?: string; kind?: string; x?: number; anchor?: string }> }>(group).calls;
  const sprite = calls.find((call) => call.kind === "sprite");

  expect(Math.abs((sprite?.x ?? 0) - 100)).toBeLessThan(1);
  expect(sprite?.anchor).toBe("top");
  expect(calls.some((call) => call.id === "player-facing-chevron")).toBe(true);
  expect(calls.some((call) => call.id === "player-facing-weapon")).toBe(false);
});

test("player charge visuals stop when charged ability is no longer active", () => {
  const cache = new Map([["p1", { x: 100, y: 120, ability: "mace-pummel", activeMs: 900, activeSeenMs: 1000, chargeMs: 1400, chargeSeenMs: 1000 }]]);
  const [group] = createPlayerRenderCalls(
    player({ activeAbility: "", activeSlot: "", chargeMs: 1400 }),
    { hero: fakeImage(176, 44) },
    1600,
    player(),
    "p1",
    cache
  );
  const calls = inspectRender<{ calls: Array<{ id?: string }> }>(group).calls;

  expect(calls.some((call) => call.id === "charge-ring")).toBe(false);
  expect(calls.some((call) => call.id?.startsWith("charge-swirl"))).toBe(false);
  expect(calls.some((call) => call.id?.startsWith("pummel-hit-indicator"))).toBe(false);
  expect(cache.get("p1")?.chargeMs).toBe(0);
});

test("zero replicated charge does not grow from cached charged state", () => {
  const cache = new Map([["p1", { x: 100, y: 120, ability: "mace-pummel", activeMs: 900, activeSeenMs: 1000, chargeMs: 1400, chargeSeenMs: 1000 }]]);
  const [group] = createPlayerRenderCalls(
    player({ activeAbility: "mace-pummel", activeSlot: "LMB", chargeMs: 0 }),
    { hero: fakeImage(176, 44) },
    1600,
    player(),
    "p1",
    cache
  );
  const calls = inspectRender<{ calls: Array<{ id?: string }> }>(group).calls;

  expect(calls.some((call) => call.id === "charge-ring")).toBe(false);
  expect(calls.some((call) => call.id?.startsWith("charge-swirl"))).toBe(false);
  expect(calls.some((call) => call.id?.startsWith("pummel-hit-indicator"))).toBe(false);
});

test("pummel hit indicator grows on client frame time", () => {
  const cache = new Map([["p1", { x: 100, y: 120, ability: "mace-pummel", activeMs: 300, activeSeenMs: 1000, chargeMs: 300, chargeSeenMs: 1000 }]]);
  const [group] = createPlayerRenderCalls(
    player({ x: 100, y: 120, activeAbility: "mace-pummel", activeSlot: "LMB", activeMs: 300, chargeMs: 300, abilityVectorX: 1, abilityVectorY: 0 }),
    { hero: fakeImage(176, 44) },
    1600,
    player(),
    "p1",
    cache
  );
  const calls = inspectRender<{ calls: Array<{ id?: string; commands?: Array<{ radius?: number }> }> }>(group).calls;
  const edge = calls.find((call) => call.id === "pummel-hit-indicator-edge");

  expect(edge?.commands?.[0]?.radius).toBeGreaterThan(68);
});

test("quest markers use available active ready visual language", () => {
  const elder = npc({ kind: "elder-rowan", role: "quest" });
  const board = npc({ kind: "contract-board", role: "contract" });
  const vael = npc({ kind: "high-arcanist-vael", role: "quest" });

  expect(questMarkerFor(elder, player({ activeQuestId: "" }))).toMatchObject({ glyph: "?", fill: "#f4d36b" });
  expect(questMarkerFor(elder, player({ activeQuestId: "first-cut" }))).toMatchObject({ glyph: "!", fill: "#687173" });
  expect(questMarkerFor(elder, player({ activeQuestId: "first-cut", questFlags: { "first-cut-ready": true } }))).toMatchObject({ glyph: "!", fill: "#f4d36b" });
  expect(questMarkerFor(elder, player({ questFlags: { "first-cut": true, "second-cut": true, "wolf-culling": true, "final-cut": true } }))).toBeUndefined();
  expect(questMarkerFor(board, player({ contractKills: 12 }))).toMatchObject({ glyph: "!", fill: "#f4d36b" });
  expect(questMarkerFor(board, player({ contractCooldownMs: 12000 }))).toBeUndefined();
  expect(questMarkerFor(vael, player({ activeQuestId: "forbidden-scripts", questFlags: { "forbidden-scripts-accepted": true } }))).toMatchObject({ glyph: "!", fill: "#687173" });
});

test("main quest guide renders shiny trail and area border", () => {
  const calls = createMainQuestGuideRenderCalls(state(), player({ x: 100, y: 120, activeQuestId: "first-cut" }), 1000);
  const flat = flattenRenderCalls(calls) as Array<{ kind?: string; stroke?: string; fill?: string; dash?: number[]; shadowBlur?: number }>;

  expect(flat.some((call) => call.kind === "line" && call.stroke === "rgba(199, 255, 168, 0.07)")).toBe(true);
  expect(flat.some((call) => call.kind === "circle" && call.stroke === "rgba(255, 255, 255, 0.66)" && call.dash)).toBe(true);
  expect(flat.some((call) => call.kind === "circle" && call.fill === "rgba(255, 255, 255, 0.58)" && (call.shadowBlur ?? 0) > 0)).toBe(true);
});

test("main quest destination prefers closest live required source", () => {
  const nearTree: ResourceEntity = { id: "near-tree", entityType: "resource", kind: "tree", skillId: "lumberjacking", zoneId: "ashwood", x: 180, y: 120, hp: 2, maxHp: 2, depleted: false, respawnMs: 0 };
  const farTree: ResourceEntity = { ...nearTree, id: "far-tree", x: 500, y: 120 };
  const cragsTree: ResourceEntity = { ...nearTree, id: "crags-tree", zoneId: "crags", x: 120, y: 120 };
  const firstCut = mainQuestDestination(state({ resources: { [nearTree.id]: nearTree, [farTree.id]: farTree, [cragsTree.id]: cragsTree } }), player({ x: 100, y: 120, activeQuestId: "first-cut" }));
  expect(firstCut).toMatchObject({ kind: "point", x: nearTree.x, y: nearTree.y, label: "Cut Ash Tree" });

  const nearWolf = npc({ id: "near-wolf", kind: "prowling-wolf", x: 210, y: 120 });
  const farWolf = npc({ id: "far-wolf", kind: "prowling-wolf", x: 900, y: 120 });
  const cragsWolf = npc({ id: "crags-wolf", kind: "prowling-wolf", zoneId: "crags", x: 120, y: 120 });
  const wolfQuest = mainQuestDestination(state({ npcs: { [nearWolf.id]: nearWolf, [farWolf.id]: farWolf, [cragsWolf.id]: cragsWolf } }), player({ x: 100, y: 120, activeQuestId: "wolf-culling", questFlags: { "second-cut": true } }));
  expect(wolfQuest).toMatchObject({ kind: "point", x: nearWolf.x, y: nearWolf.y, label: "Cull Wolf" });

  const rowan = npc({ id: "rowan", kind: "elder-rowan", role: "quest", zoneId: "ashwood", x: 300, y: 120 });
  const captain = npc({ id: "captain", kind: "captain-marrow", role: "travel", zoneId: "port-marrow", x: 900, y: 120 });
  const finalCut = mainQuestDestination(state({ npcs: { [rowan.id]: rowan, [captain.id]: captain } }), player({ activeQuestId: "final-cut", questFlags: { "wolf-culling": true } }));
  expect(finalCut).toMatchObject({ kind: "point", x: rowan.x, y: rowan.y, label: "Final Cut" });
  const route = mainQuestDestination(state({ npcs: { [rowan.id]: rowan, [captain.id]: captain } }), player({ activeQuestId: "lost-compass", questFlags: { "final-cut": true, "lost-compass-accepted": true } }));
  expect(route).toMatchObject({ kind: "point", x: captain.x, y: captain.y, label: "Lost Compass" });
});

test("first proof resource and HUD readbacks stay compact", () => {
  const tree: ResourceEntity = { id: "first-proof-tree", entityType: "resource", kind: "tree", skillId: "lumberjacking", zoneId: "ashwood", x: 180, y: 120, hp: 2, maxHp: 2, depleted: false, respawnMs: 0 };
  const resourceCalls = flattenRenderCalls(createResourceRenderCalls(tree, {}, undefined, [], undefined, true)) as Array<{ kind?: string; text?: string; stroke?: string }>;
  expect(resourceCalls.some((call) => call.kind === "text" && call.text === "FIRST PROOF")).toBe(true);
  expect(resourceCalls.some((call) => call.kind === "circle" && call.stroke === "rgba(244, 211, 107, 0.88)")).toBe(true);

  const freshHud = flattenRenderCalls(createHudRenderCalls(state(), player({ activeQuestId: "first-cut" }), {}, 1024, 720, 1000, undefined)) as Array<{ text?: string }>;
  expect(freshHud.some((call) => call.text === "Cut glowing Ash tree 0/5")).toBe(true);
  expect(freshHud.some((call) => call.text === "First Cut")).toBe(true);

  const proofHud = flattenRenderCalls(createHudRenderCalls(state(), player({ activeQuestId: "first-cut", inventory: { "ash-logs": 1 } }), {}, 1024, 720, 1000, undefined)) as Array<{ text?: string }>;
  expect(proofHud.some((call) => call.text === "Proof marked: clean cut. Cut glowing Ash tree 1/5")).toBe(true);
  expect(proofHud.some((call) => call.text === "Return")).toBe(true);
});

test("support NPC dialog keeps in-world voice without meta labels", () => {
  const rowan = npc({ id: "rowan", kind: "elder-rowan", role: "quest" });
  const rowanDialog = updateDialogState(state({ npcs: { [rowan.id]: rowan } }), player({ targetId: rowan.id, action: "interact" }), 1000);
  expect(rowanDialog?.body).toContain("First Cut: 0/5");
  expect(rowanDialog?.body).not.toContain("Mood:");
  expect(rowanDialog?.body).not.toContain("hero talk");

  const clerk = npc({ id: "route-clerk", kind: "route-clerk", role: "quest" });
  const fallbackDialog = updateDialogState(state({ npcs: { [clerk.id]: clerk } }), player({ targetId: clerk.id, action: "interact" }), 1000);
  expect(fallbackDialog?.body).toContain("has no posted work");
  expect(fallbackDialog?.body).not.toContain("watches your progress");
});

test("landmark interactables read like posted world objects", () => {
  const safeRoadSign = worldLandmarkPlacements.find((placement) => placement.service === "safe-road warning post")!;
  const safeRoadInfo = landmarkInteractionInfo(worldLandmarkId(safeRoadSign));
  expect(safeRoadInfo?.body).toContain("patrol ends here");
  expect(safeRoadInfo?.body).toContain("Painted mark: T.");

  const foragerHut = worldLandmarkPlacements.find((placement) => placement.service === "rootway forager hut")!;
  expect(landmarkInteractionInfo(worldLandmarkId(foragerHut))?.body).toContain("rest point, not a safe house");

  const marketWell = worldLandmarkPlacements.find((placement) => placement.service === "packed market well")!;
  expect(landmarkInteractionInfo(worldLandmarkId(marketWell))?.body).toContain("Rope burns");

  const wolfCamp = worldLandmarkPlacements.find((placement) => placement.service === "wolf den camp")!;
  const wolfCampBody = landmarkInteractionInfo(worldLandmarkId(wolfCamp))?.body ?? "";
  expect(wolfCampBody).toContain("fresh tracks");
  expect(wolfCampBody).not.toContain("points toward the nearest route");
  expect(wolfCampBody).not.toContain("is a civic landmark");
  expect(wolfCampBody).not.toContain("marks usable local material");
});

test("support NPC job cues use distinct badge identities", () => {
  const supportKinds = [
    "elder-rowan",
    "blacksmith-silas",
    "blacksmith",
    "miller-finn",
    "scout-elara",
    "foreman-iron-will",
    "overseer-bale",
    "geologist-mira",
    "runner-kael",
    "navigator-kai",
    "captain-marrow",
    "high-arcanist-vael",
    "alchemist-zora",
    "banker-valerius",
    "merchant-kaya",
    "apprentice-jinn",
    "innkeeper-martha",
    "contract-board",
    "master-kael",
    "cursed-statue"
  ];
  const signatures = new Set<string>();

  for (const kind of supportKinds) {
    const cue = npcJobCue({ kind });
    expect(cue, kind).toBeDefined();
    expect(cue?.icon, kind).toBeTruthy();
    signatures.add(`${cue?.shape ?? "circle"}:${cue?.fill}:${cue?.icon}:${cue?.glyph}:${cue?.accent ?? ""}`);
  }

  expect(signatures.size).toBe(supportKinds.length);
});

test("support NPCs render planted service fixtures", () => {
  const images = {
    worldPortBuildingLarge: fakeImage(224, 96),
    worldGuildInteriorObjects: fakeImage(384, 384)
  };
  const [merchantGroup] = createNpcRenderCalls(npc({ kind: "merchant-kaya", role: "merchant", zoneId: "port-marrow", spawnX: 140, spawnY: 160 }), images, player(), 1000);
  const [smithGroup] = createNpcRenderCalls(npc({ kind: "blacksmith-silas", role: "crafting", zoneId: "crags", spawnX: 180, spawnY: 190 }), images, player(), 1000);
  const merchantCalls = flattenRenderCalls([(merchantGroup as Renderable)]) as Array<{ kind?: string; image?: HTMLImageElement; text?: string }>;
  const smithCalls = flattenRenderCalls([(smithGroup as Renderable)]) as Array<{ kind?: string; image?: HTMLImageElement; text?: string }>;

  expect(merchantCalls.some((call) => call.kind === "sprite" && call.image === images.worldPortBuildingLarge)).toBe(true);
  expect(merchantCalls.some((call) => call.kind === "text" && call.text === "$")).toBe(true);
  expect(smithCalls.some((call) => call.kind === "sprite" && call.image === images.worldGuildInteriorObjects)).toBe(true);
  expect(smithCalls.some((call) => call.kind === "text" && call.text === "F")).toBe(true);
});

test("enemy debuffs render compact badge readbacks", () => {
  const [group] = createNpcRenderCalls(
    npc({ combatFlags: "hex:2|weakened|antiheal", slowMs: 1200 }),
    {},
    player(),
    1000
  );
  const calls = inspectRender<{ calls: Array<{ kind?: string; text?: string }> }>(group).calls;

  expect(calls.some((call) => call.kind === "text" && call.text === "H2")).toBe(true);
  expect(calls.some((call) => call.kind === "text" && call.text === "W")).toBe(true);
  expect(calls.some((call) => call.kind === "text" && call.text === "X")).toBe(true);
  expect(calls.some((call) => call.kind === "text" && call.text === "S")).toBe(true);
});

test("NPCs fall back to body shape when selected sprite is not drawable", () => {
  const [group] = createNpcRenderCalls(
    npc({ kind: "prowling-wolf" }),
    { enemyGoblin: fakeImage(0, 0) },
    player(),
    1000
  );
  const calls = inspectRender<{ calls: Array<{ kind?: string; image?: unknown; radius?: number }> }>(group).calls;

  expect(calls.some((call) => call.kind === "sprite" || call.image)).toBe(false);
  expect(calls.some((call) => call.kind === "circle" && call.radius === NPC_SIZE_BY_KIND["prowling-wolf"]!.radius)).toBe(true);
});

test("NPC attack SFX route by impact identity", () => {
  expect(npcAttackSfx({ impactType: "void", role: "mob" }, true)).toBe("npc-void");
  expect(npcAttackSfx({ impactType: "spark", role: "mob" }, true)).toBe("npc-spark");
  expect(npcAttackSfx({ impactType: "sap", role: "mob" }, false)).toBe("npc-sap");
  expect(npcAttackSfx({ impactType: "blood", role: "mob" }, false)).toBe("npc-claw");
  expect(npcAttackSfx({ impactType: "blood", role: "boss" }, false)).toBe("npc-cast");
});

test("player ability SFX route by weapon family and phase", () => {
  expect(abilityCastSfx("mace-pummel")).toBe("mace-cast");
  expect(abilityCastSfx("space-rush")).toBe("mace-cast");
  expect(abilityCastSfx("bow-quick-shot")).toBe("bow-cast");
  expect(abilityCastSfx("staff-meteor")).toBe("staff-cast");
  expect(abilityCastSfx("wand-hex")).toBe("wand-cast");
  expect(abilityCastSfx("twin-toxic-slash")).toBe("twin-cast");
  expect(abilityCastSfx("blade-cleave")).toBe("blade-cast");
  expect(abilityProjectileSfx("boulder")).toBe("mace-projectile");
  expect(abilityProjectileSfx("arrow")).toBe("bow-projectile");
  expect(abilityProjectileSfx("arcane-bolt")).toBe("staff-projectile");
  expect(abilityProjectileSfx("missile")).toBe("wand-projectile");
  expect(abilityProjectileSfx("dirk")).toBe("twin-projectile");
  expect(abilityProjectileSfx("razor")).toBe("blade-projectile");
  expect(abilityImpactSfx("blade-brutal-strike")).toBe("blade-impact");
});

test("impact feedback profiles cover all weapons with bounded hierarchy", () => {
  const lightAbilities = ["mace-pummel", "bow-quick-shot", "staff-arcane-bolt", "wand-hex", "twin-strike", "blade-cleave"];
  for (const abilityId of lightAbilities) {
    const profile = impactFeedbackForAbility(abilityId, 7);
    expect(profile.hitstopMs).toBeGreaterThanOrEqual(24);
    expect(profile.targetHoldMs).toBeGreaterThanOrEqual(26);
    expect(profile.shakePx).toBeLessThanOrEqual(1);
  }

  const maceLight = impactFeedbackForAbility("mace-pummel", 7);
  const bowLight = impactFeedbackForAbility("bow-quick-shot", 7);
  const bladeHeavy = impactFeedbackForAbility("blade-brutal-strike", 28);
  const staffUltimate = impactFeedbackForAbility("staff-maelstrom", 18);
  const bossUltimate = impactFeedbackForAbility("mace-whirlwind", 35, { targetRole: "boss", killed: true });

  expect(bowLight.targetHoldMs).toBeLessThan(maceLight.targetHoldMs);
  expect(bladeHeavy.hitstopMs).toBeGreaterThan(maceLight.hitstopMs);
  expect(staffUltimate.hitstopMs).toBeGreaterThan(bladeHeavy.hitstopMs);
  expect(bossUltimate.shakePx).toBeLessThanOrEqual(4);
  expect(bossUltimate.effectScale).toBeGreaterThan(staffUltimate.effectScale);
});

test("impact feedback controller holds actors briefly and keeps shake mild", () => {
  const impacts = createImpactFeedbackController();
  impacts.push({
    actorId: "npc-1",
    sourceId: "p1",
    x: 140,
    y: 160,
    sourceX: 100,
    sourceY: 160,
    directionX: 1,
    directionY: 0,
    startedMs: 1000,
    targetHoldMs: 90,
    attackerHoldMs: 35,
    shakeMs: 90,
    shakePx: 2.2,
    weight: "heavy"
  });

  const npcVisual = impacts.actorVisual("npc-1", 1020);
  const playerVisual = impacts.actorVisual("p1", 1020);
  const shaken = impacts.camera({ x: 0, y: 0 }, 1020, 960, 540);

  expect(npcVisual?.x).toBe(140);
  expect(playerVisual?.x).toBe(100);
  expect(Math.hypot(shaken.x, shaken.y)).toBeLessThanOrEqual(4.5);
  expect(impacts.actorVisual("npc-1", 1120)).toBeUndefined();
});

test("render signal tracker themes player ability NPC impacts", () => {
  const played: string[] = [];
  const pushed: Array<Record<string, unknown>> = [];
  const impacts: Array<Record<string, unknown>> = [];
  const tracker = createRenderSignalTracker({
    getClientPlayerId: () => "p1",
    sfx: { unlock() {}, play(event) { played.push(event); } },
    impact: { push(signal) { impacts.push(signal); } },
    effects: {
      push(effect) { pushed.push(effect); },
      pushFloat(text, x, y, color, timeMs, size) { pushed.push({ kind: "float", text, x, y, color, startedMs: timeMs, size }); },
      pushBurst(x, y, color, timeMs, size, text) { pushed.push({ kind: "burst", x, y, color, startedMs: timeMs, size, text }); }
    }
  });
  const attacker = player({
    action: "lmb",
    targetId: "npc-1",
    equipment: { weapon: "bow" },
    abilitySlots: { LMB: "unlocked", "bow-quick-shot": "LMB" }
  });
  const before = npc({ id: "npc-1", hp: 20, maxHp: 20, impactType: "dust" });

  tracker.sync(state({ players: { p1: attacker }, npcs: { "npc-1": before } }), 1000);
  tracker.sync(state({ players: { p1: attacker }, npcs: { "npc-1": { ...before, hp: 12 } } }), 1040);

  expect(played).toContain("bow-impact");
  expect(pushed.some((effect) => effect.kind === "burst" && effect.color === "#9bd6ff")).toBe(true);
  expect(impacts.some((impact) => impact.actorId === "npc-1" && impact.sourceId === "p1" && impact.weight === "light")).toBe(true);
  expect(impacts.every((impact) => (impact.shakePx as number) <= 4)).toBe(true);
});

test("boss stun renders large stagger readback", () => {
  const [group] = createNpcRenderCalls(
    npc({ kind: "dungeon-revenant", role: "boss", elite: true, stunMs: 1400 }),
    {},
    player(),
    1000
  );
  const calls = flattenRenderCalls([(group as Renderable)]) as Array<{ kind?: string; text?: string; radius?: number; stroke?: string }>;

  expect(calls.some((call) => call.kind === "text" && call.text === "STAGGER")).toBe(true);
  expect(calls.some((call) => call.kind === "circle" && (call.radius ?? 0) > 50)).toBe(true);
});

test("charge signal particles are small and lightly velocity biased", () => {
  const pushed: Array<Record<string, unknown>> = [];
  const tracker = createRenderSignalTracker({
    getClientPlayerId: () => "p1",
    effects: {
      push(effect) { pushed.push(effect); },
      pushFloat(text, x, y, color, timeMs, size) { pushed.push({ kind: "float", text, x, y, color, startedMs: timeMs, size }); },
      pushBurst(x, y, color, timeMs, size, text) { pushed.push({ kind: "burst", x, y, color, startedMs: timeMs, size, text }); }
    }
  });
  tracker.sync(state({ players: { p1: player({ id: "p1", activeAbility: "mace-pummel", chargeMs: 100 }) } }), 1000);
  tracker.sync(state({ players: { p1: player({ id: "p1", activeAbility: "mace-pummel", chargeMs: 260 }) } }), 1040);
  const chargeParticle = pushed.find((effect) => effect.kind === "particle");

  expect(chargeParticle?.size).toBe(4.8);
  expect(chargeParticle?.length).toBe(24);
  expect(chargeParticle?.velocityX as number).toBeGreaterThanOrEqual(-5);
  expect(chargeParticle?.velocityX as number).toBeLessThanOrEqual(5);
  expect(chargeParticle?.velocityY as number).toBeGreaterThanOrEqual(-5);
  expect(chargeParticle?.velocityY as number).toBeLessThanOrEqual(5);
});

test("render signal tracker prunes player ability particles when ability ends", () => {
  const effects = createVisualEffectQueue();
  const tracker = createRenderSignalTracker({
    getClientPlayerId: () => "p1",
    effects
  });

  tracker.sync(state({ players: { p1: player({ id: "p1", activeAbility: "", activeSlot: "", action: "idle" }) } }), 900);
  tracker.sync(state({ players: { p1: player({ id: "p1", activeAbility: "space-rush", activeSlot: "Space", action: "space", activeMs: 100, abilityVectorX: 1, abilityVectorY: 0 }) } }), 1000);
  expect(effects.active().some((effect) => effect.ownerId === "p1" && effect.abilityId === "space-rush")).toBe(true);

  tracker.sync(state({ players: { p1: player({ id: "p1", activeAbility: "", activeSlot: "", action: "idle" }) } }), 1100);
  expect(effects.active().some((effect) => effect.ownerId === "p1" && effect.abilityId === "space-rush")).toBe(false);
});

test("render signal tracker emits gathering projectile on first channel frame", () => {
  const pushed: Array<{ kind?: string; toX?: number; toY?: number }> = [];
  const tree: ResourceEntity = { id: "tree-1", entityType: "resource", kind: "tree", skillId: "lumberjacking", zoneId: "ashwood", x: 180, y: 120, hp: 2, maxHp: 2, depleted: false, respawnMs: 0 };
  const tracker = createRenderSignalTracker({
    getClientPlayerId: () => "p1",
    effects: {
      push(effect) { pushed.push(effect); },
      pushFloat() {},
      pushBurst() {}
    }
  });

  tracker.sync(state({ players: { p1: player({ id: "p1", action: "idle" }) }, resources: { [tree.id]: tree } }), 1000);
  tracker.sync(state({ players: { p1: player({ id: "p1", action: "woodcut", targetId: tree.id, activeGatherNodeId: tree.id, activeGatherMs: 0, activeGatherTotalMs: 4000 }) }, resources: { [tree.id]: tree } }), 1016);

  expect(pushed.some((effect) => effect.kind === "beam" && effect.toX === tree.x && effect.toY === tree.y - 8)).toBe(true);
});

test("world entity calls keep world coordinates", () => {
  const [lootCall] = createLootRenderCalls({ id: "loot-1", entityType: "loot", itemId: "gold", amount: 1, zoneId: "ashwood", x: 510, y: 620, ownerId: "", expiresMs: 1000, pickupRadius: 32 }, {}, 1000);
  const [resourceCall] = createResourceRenderCalls({ id: "ore-1", entityType: "resource", kind: "ore", zoneId: "crags", x: 430, y: 540, hp: 2, maxHp: 4, depleted: false, respawnMs: 0 }, {});

  expect(typeof lootCall === "function" ? undefined : lootCall.x).toBe(510);
  expect(typeof lootCall === "function" ? undefined : lootCall.y).toBe(620);
  expect(typeof resourceCall === "function" ? undefined : resourceCall.x).toBe(430);
  expect(typeof resourceCall === "function" ? undefined : resourceCall.y).toBe(540);
});

test("loot render data keeps readable ring amount and bobbing source", () => {
  const loot: LootEntity = { id: "loot-2", entityType: "loot", itemId: "gold", amount: 7, zoneId: "ashwood", x: 100, y: 140, ownerId: "", expiresMs: 1000, pickupRadius: 32 };
  const [early] = createLootRenderCalls(loot, {}, 0);
  const [later] = createLootRenderCalls(loot, {}, 500);
  const earlyGroup = inspectRender<{ calls: Array<{ kind?: string; text?: string; y?: number; radius?: number; stroke?: string }> }>(early);
  const laterGroup = inspectRender<{ calls: Array<{ kind?: string; y?: number; radius?: number }> }>(later);

  expect(earlyGroup.calls.some((call) => call.kind === "circle" && call.radius === 14 && call.stroke === "#f4d36b")).toBe(true);
  expect(earlyGroup.calls.some((call) => call.kind === "text" && call.text === "7")).toBe(true);
  expect(earlyGroup.calls.find((call) => call.kind === "circle" && call.radius === 9)?.y).not.toBe(laterGroup.calls.find((call) => call.kind === "circle" && call.radius === 9)?.y);
});

test("hud is the only camera-ignored layer", () => {
  expect(RENDER_LAYER_CONFIG.hud.ignoreCamera).toBe(true);
  for (const [name, config] of Object.entries(RENDER_LAYER_CONFIG)) {
    if (name !== "hud") expect(config.ignoreCamera ?? false).toBe(false);
  }
  expect(RENDER_LAYER_CONFIG.effects.order ?? 0).toBeGreaterThan(RENDER_LAYER_CONFIG.world.order ?? 0);
  expect(RENDER_LAYER_CONFIG.hazards.order ?? 0).toBeGreaterThan(RENDER_LAYER_CONFIG.world.order ?? 0);
});

test("visual effect queue renders rich transient effects deterministically", () => {
  const effects = createVisualEffectQueue();
  effects.push({ kind: "spark", x: 10, y: 20, color: "#f4d36b", startedMs: 1000, lifetimeMs: 420, size: 18, seed: 33, count: 5, spread: Math.PI / 2 });
  effects.push({ kind: "tether", x: 20, y: 30, toX: 70, toY: 60, controlX: 44, controlY: 6, color: "#9bd6ff", startedMs: 1000, lifetimeMs: 520, size: 4, seed: 44 });
  effects.pushAfterimpact(42, 55, "#ef6f4f", 1000, 28, { seed: 55, count: 6 });

  const first = effects.toRenderCalls(1160);
  const second = effects.toRenderCalls(1160);
  const nested = first.flatMap((call) => typeof call === "function" ? [] : inspectRender<{ calls?: Renderable[] }>(call).calls ?? []);
  const kinds = new Set(nested.filter((call) => typeof call !== "function").map((call) => call.kind));

  expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  expect(kinds.has("line")).toBe(true);
  expect(kinds.has("path")).toBe(true);
  expect(kinds.has("circle")).toBe(true);
  expect(kinds.has("ellipse")).toBe(true);
});

test("visual effect queue reuses expired effect objects", () => {
  const effects = createVisualEffectQueue();
  effects.push({ kind: "particle", x: 10, y: 20, color: "#ef6f4f", startedMs: 1000, lifetimeMs: 100, size: 18 });
  const first = effects.active()[0];

  effects.toRenderCalls(1201);
  expect(effects.active()).toHaveLength(0);
  effects.push({ kind: "ring", x: 30, y: 40, color: "#9bd6ff", startedMs: 1300, lifetimeMs: 200, size: 22 });

  const second = effects.active()[0];
  expect(second).toBe(first);
  expect(second.kind).toBe("ring");
  expect(second.color).toBe("#9bd6ff");
});

test("visual effect queue prunes matching owned effects", () => {
  const effects = createVisualEffectQueue();
  effects.push({ kind: "particle", x: 10, y: 20, color: "#9bd6ff", startedMs: 1000, lifetimeMs: 500, size: 12, ownerId: "p1", abilityId: "space-rush", cleanupOnAbilityEnd: true });
  effects.push({ kind: "ring", x: 20, y: 30, color: "#f4d36b", startedMs: 1000, lifetimeMs: 500, size: 18, ownerId: "p1", abilityId: "space-rush", cleanupOnAbilityEnd: false });

  effects.prune((effect) => effect.ownerId === "p1" && Boolean(effect.cleanupOnAbilityEnd));

  expect(effects.active()).toHaveLength(1);
  expect(effects.active()[0].kind).toBe("ring");
});

test("visual effect queue does not mutate prior render frames", () => {
  function collectRefs(calls: readonly Renderable[], refs = new Set<object>()) {
    refs.add(calls as object);
    for (const call of calls) {
      if (typeof call === "function") continue;
      refs.add(call as object);
      const nested = inspectRender<{ calls?: readonly Renderable[] }>(call).calls;
      if (nested) collectRefs(nested, refs);
      const commands = inspectRender<{ commands?: readonly object[] }>(call).commands;
      if (commands) {
        refs.add(commands as object);
        for (const command of commands) refs.add(command);
      }
    }
    return refs;
  }

  const effects = createVisualEffectQueue();
  effects.push({ kind: "swipe", x: 10, y: 20, color: "#f4d36b", startedMs: 1000, lifetimeMs: 420, size: 18, seed: 33 });
  const first = effects.toRenderCalls(1010);
  const firstJson = JSON.stringify(first);
  const firstRefs = collectRefs(first);

  effects.toRenderCalls(1020);
  const thirdRefs = collectRefs(effects.toRenderCalls(1030));

  expect(JSON.stringify(first)).toBe(firstJson);
  expect([...thirdRefs].some((ref) => firstRefs.has(ref))).toBe(false);
});

test("actor y sort stays stable for equal overlap", () => {
  const calls: Renderable[] = [
    { kind: "group", id: "first", y: 100, ySort: 100, calls: [] },
    { kind: "group", id: "front", y: 80, ySort: 80, calls: [] },
    { kind: "group", id: "second", y: 100, ySort: 100, calls: [] }
  ];

  expect(sortRenderCallsByY(calls).map((call) => typeof call === "function" ? "" : call.id)).toEqual(["front", "first", "second"]);
});

test("compact UI state starts closed and opens one panel at a time", () => {
  const panels = createCompactPanelState();

  expect(panels.activePanel).toBe("");
  expect(panels.panelIds()).toEqual([]);
  expect(panels.toggle("bag")).toBe("bag");
  expect(panels.panelIds()).toEqual(["bag"]);
  expect(panels.toggle("stats")).toBe("stats");
  expect(panels.panelIds()).toEqual(["stats"]);
  expect(panels.toggle("journal")).toBe("journal");
  expect(panels.panelIds()).toEqual(["journal"]);
  expect(panels.toggle("catalog")).toBe("catalog");
  expect(panels.panelIds()).toEqual(["catalog"]);
  expect(panels.toggle("catalog")).toBe("");
  expect(panels.panelIds()).toEqual([]);
});

test("map resource filter toggles gatherable layer state", () => {
  const filters = createDefaultMapFilterState();

  expect(filters.gatherables).toBe(true);
  expect(mapFilterSignature(filters)).toBe("gatherables:1");
  expect(toggleMapFilter(filters, "gatherables")).toBe(false);
  expect(mapFilterSignature(filters)).toBe("gatherables:0");
  expect(toggleMapFilter(filters, "gatherables")).toBe(true);
});

test("map node tooltip summarizes gatherable vital info", () => {
  const spec = worldGatherableNodeSpecs.find((node) => node.materialName === "Twilight Sky-Oats")!;
  const tooltip = mapNodeTooltipInfoForResource(spec);

  expect(tooltip.title).toBe("Twilight Sky-Oats");
  expect(tooltip.lines).toContain("Crop Harvesting | Tier 4");
  expect(tooltip.lines).toContain("Req Lv 60 | 16.0s collect");
});

test("slot cooldown view never falls back to legacy global cooldown", () => {
  const p = player({ action: "lmb", cooldownMs: 4300, cooldowns: { Space: 4300 } });

  expect(slotCooldownMs(p, "LMB")).toBe(0);
  expect(slotCooldownMs(p, "Space")).toBe(4300);
});

test("hud skill tooltip uses keybind cooldown and optional detail lines", () => {
  const p = player({ abilitySlots: { LMB: "unlocked", "mace-pummel": "LMB" } });
  const tooltip = abilityTooltip(p, "LMB", "mace-pummel");

  expect(tooltip.header).toBe("[LMB] Pummel | ready");
  expect(tooltip.description).toContain("hold-to-charge");
  expect(tooltip.details.some((line) => line.startsWith("Charge 0-2.4s"))).toBe(true);
  expect(tooltip.details.some((line) => line.includes("cone 55-112"))).toBe(true);

  const calls = createHudRenderCalls(state(), p, { connected: true }, 960, 540, 1000, undefined, undefined, { x: 305, y: 500 });
  const texts = calls.filter((call): call is Extract<Renderable, { kind: "text"; text: string }> => typeof call !== "function" && call.kind === "text").map((call) => call.text);
  expect(texts).toContain("[LMB] Pummel | ready");
});

test("aim reticle can render dimmed for controller mode", () => {
  const calls = createAimReticleRenderCalls(undefined, { x: 120, y: 140 }, [], undefined, { alpha: 0.28 });
  const group = calls.find((call): call is Extract<Renderable, { kind: "group"; alpha?: number }> => typeof call !== "function" && call.kind === "group");

  expect(group?.id).toBe("aim-reticle");
  expect(group?.alpha).toBe(0.28);
});

test("hud render tolerates missing replicated owner maps", () => {
  const sparse = player({
    inventory: undefined,
    bank: undefined,
    equipment: undefined,
    abilitySlots: undefined,
    questFlags: undefined
  } as unknown as Partial<PlayerEntity>);
  const master = npc({ kind: "master-kael", role: "trainer" });

  expect(() => createHudRenderCalls(state(), sparse, { connected: true }, 960, 540, 1000, undefined)).not.toThrow();
  expect(() => createNpcRenderCalls(master, {}, sparse, 1000)).not.toThrow();
});

test("combat text transient effects fade and expire", () => {
  const hazard: HazardEntity = {
    id: "damage-text",
    entityType: "hazard",
    kind: "aoe",
    zoneId: "ashwood",
    ownerId: "",
    x: 100,
    y: 100,
    toX: 100,
    toY: 100,
    radius: 26,
    windupMs: 0,
    lifetimeMs: 720,
    damage: 0,
    knockbackModifier: 0,
    isHeavyImpact: false,
    armorPierce: false,
    effectKind: "damage",
    text: "-9",
    pulse: 1
  };

  const early = inspectRender<{ alpha?: number; calls: Array<{ kind?: string; text?: string; alpha?: number }> }>(
    createHazardRenderCalls(hazard, { ageMs: 120, windupMs: 0, lifetimeMs: 720 })[0]!
  );
  const ended = createHazardRenderCalls(hazard, { ageMs: 720, windupMs: 0, lifetimeMs: 720 });

  expect(early.alpha).toBeGreaterThan(0);
  expect(early.calls.some((call) => call.kind === "text" && call.text === "-9" && (call.alpha ?? 0) > 0)).toBe(true);
  expect(ended).toHaveLength(0);
});

test("player ability hazard animation is driven by client render timing", () => {
  const hazard: HazardEntity = {
    id: "wave-1",
    entityType: "hazard",
    kind: "line",
    zoneId: "ashwood",
    ownerId: "p1",
    x: 100,
    y: 100,
    toX: 200,
    toY: 100,
    radius: 100,
    windupMs: 0,
    lifetimeMs: 1,
    damage: 0,
    knockbackModifier: 0,
    isHeavyImpact: false,
    armorPierce: false,
    effectKind: "conewave",
    text: "",
    pulse: 60
  };
  const early = inspectRender<{ calls: Array<{ kind?: string; lineDash?: readonly number[]; lineWidth?: number; commands?: Array<{ radius?: number }> }> }>(
    createHazardRenderCalls(hazard, { ageMs: 0, windupMs: 0, lifetimeMs: 360 })[0]!
  );
  const mid = inspectRender<{ calls: Array<{ kind?: string; lineDash?: readonly number[]; lineWidth?: number; commands?: Array<{ radius?: number }> }> }>(
    createHazardRenderCalls(hazard, { ageMs: 180, windupMs: 0, lifetimeMs: 360 })[0]!
  );
  const ended = createHazardRenderCalls(hazard, { ageMs: 360, windupMs: 0, lifetimeMs: 360 });
  const earlyRadius = Math.max(...early.calls.flatMap((call) => call.commands?.map((command) => command.radius ?? 0) ?? [0]));
  const midRadius = Math.max(...mid.calls.flatMap((call) => call.commands?.map((command) => command.radius ?? 0) ?? [0]));
  const widest = Math.max(...mid.calls.map((call) => call.lineWidth ?? 0));

  expect(earlyRadius).toBeGreaterThan(65);
  expect(midRadius).toBeGreaterThan(50);
  expect(widest).toBeLessThan(3);
  expect(mid.calls.some((call) => call.lineDash?.length)).toBe(true);
  expect(ended).toHaveLength(0);
});

test("semantic melee waves avoid thick capsule fallback", () => {
  const hazard: HazardEntity = {
    id: "toxic-wave",
    entityType: "hazard",
    kind: "line",
    zoneId: "ashwood",
    ownerId: "p1",
    x: 100,
    y: 100,
    toX: 220,
    toY: 100,
    radius: 260,
    windupMs: 0,
    lifetimeMs: 300,
    damage: 0,
    knockbackModifier: 0,
    isHeavyImpact: false,
    armorPierce: false,
    effectKind: "toxicwave",
    text: "",
    pulse: 50
  };
  const group = inspectRender<{ calls: Array<{ kind?: string; lineWidth?: number; lineDash?: readonly number[]; fill?: unknown }> }>(
    createHazardRenderCalls(hazard, { ageMs: 90, windupMs: 0, lifetimeMs: 300 })[0]!
  );
  const wideLines = group.calls.filter((call) => call.kind === "line" && (call.lineWidth ?? 0) > 6);
  const dashedLines = group.calls.filter((call) => call.kind === "line" && call.lineDash?.length);

  expect(wideLines).toHaveLength(0);
  expect(dashedLines.length).toBeGreaterThanOrEqual(2);
  expect(group.calls.some((call) => call.kind === "polygon" && typeof call.fill === "object")).toBe(true);
});

test("transient projectile traces reveal a themed tail behind the body", () => {
  const hazard: HazardEntity = {
    id: "chaos-trace",
    entityType: "hazard",
    kind: "line",
    zoneId: "ashwood",
    ownerId: "",
    x: 100,
    y: 100,
    toX: 190,
    toY: 100,
    radius: 6,
    windupMs: 0,
    lifetimeMs: 320,
    damage: 0,
    knockbackModifier: 0,
    isHeavyImpact: false,
    armorPierce: false,
    effectKind: "chaos",
    text: "",
    pulse: 0
  };
  const group = inspectRender<{ calls: Array<{ kind?: string; x1?: number; x2?: number; stroke?: string; lineWidth?: number }> }>(
    createHazardRenderCalls(hazard, { ageMs: 40, windupMs: 0, lifetimeMs: 320 })[0]!
  );
  const travelLine = group.calls.find((call) => call.kind === "line" && call.stroke === "rgba(255,98,180,0.24)");

  expect(travelLine).toBeDefined();
  expect(travelLine!.x2).toBeGreaterThan(travelLine!.x1!);
  expect(travelLine!.x2).toBeLessThan(190);
  expect(travelLine!.lineWidth).toBeLessThan(8);
  expect(group.calls.some((call) => call.kind === "line" && call.x1 === 100 && call.x2 === 190)).toBe(false);
});

test("replicated transient effects advance on client frame time between server ticks", () => {
  const cache = new Map();
  const effect = { id: "hex-echo", ageMs: 80, lifetimeMs: 360 };
  const first = clientTransientEffectTiming(effect, 1000, cache);
  const next = clientTransientEffectTiming(effect, 1016, cache);

  expect(first.ageMs).toBe(80);
  expect(next.ageMs).toBe(96);
});
