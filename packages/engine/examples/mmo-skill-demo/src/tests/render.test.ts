import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createLootRenderCalls } from "../client/render/loot.ts";
import { createNpcRenderCalls } from "../client/render/npcs.ts";
import { createPlayerRenderCalls } from "../client/render/players.ts";
import { createResourceRenderCalls } from "../client/render/resources.ts";
import { createTerrainRenderCalls } from "../client/render/terrain.ts";
import { clientImageSources, expandedCreatureVisuals, factionZoneVisuals } from "../data/assets.ts";
import { NPC_SIZE_BY_KIND, PLAYER_SIZE, RESOURCE_SIZE_BY_KIND } from "../data/entity-sizes.ts";
import { worldAreaCaptureAnchors, worldLandmarkPlacements } from "../data/world-landmarks.ts";
import { worldCreatureDefinitions } from "../data/world-creatures.ts";
import { getMmoSkillDemoAnchorTile } from "../data/world.ts";
import { buildTiles, TILE } from "../client/world.ts";
import {
  assertStructured,
  fakeImage,
  flattenRenderCalls,
  inspectRenderCalls,
  npc,
  player,
  readPngSize,
  renderFiles,
  type RenderInspection,
} from "./render-test-fixtures.ts";



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
    ...createLootRenderCalls({ id: "loot-1", entityType: "loot", itemId: "gold", amount: 3, zoneId: "ashwood", x: 210, y: 220, ownerId: "", expiresMs: 1000, pickupRadius: 32 }, images, 1000),
    ...createResourceRenderCalls({ id: "tree-1", entityType: "resource", kind: "tree", zoneId: "ashwood", x: 230, y: 240, hp: 2, maxHp: 4, depleted: false, respawnMs: 0 }, images),
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
  const sprite = inspectRenderCalls(group).find((call) => call.kind === "sprite");
  expect(sprite?.height).toBe(PLAYER_SIZE.height);
});

test("expanded creature and faction zone visuals stay wired into render calls", () => {
  expect(Object.keys(expandedCreatureVisuals).sort()).toEqual(worldCreatureDefinitions.map((creature) => creature.id).sort());
  expect(Object.keys(factionZoneVisuals).sort()).toEqual(["aetheria", "ashwood-glade", "high-reach-peaks", "ironcrag", "oakhaven", "obsidian-sanctum", "port-marrow", "sunken-bazaar"]);

  const creatureCalls = flattenRenderCalls(createNpcRenderCalls(npc({ kind: "void-amalgam", role: "elite", elite: true }), {}, player(), 1000));
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
    const terrainCalls = flattenRenderCalls(createTerrainRenderCalls(buildTiles(), terrainImages, {
      x: (anchor.x - 6) * TILE,
      y: (anchor.y - 5) * TILE,
      width: 14 * TILE,
      height: 12 * TILE
    }));
    const spriteCount = terrainCalls.filter((call) => call.kind === "sprite" && call.image && Object.values(terrainImages).some((image) => image === call.image)).length;
    expect(terrainCalls.some((call) => call.text === area.label), area.label).toBe(true);
    expect(spriteCount, area.id).toBeGreaterThanOrEqual(6);
  }
  const aetheriaCalls = flattenRenderCalls(createTerrainRenderCalls(buildTiles(), terrainImages, {
    x: (getMmoSkillDemoAnchorTile("aetheria").x - 3) * TILE,
    y: (getMmoSkillDemoAnchorTile("aetheria").y - 3) * TILE,
    width: 8 * TILE,
    height: 8 * TILE
  }));
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
    expect(Reflect.get(clientImageSources, key), key).toContain("./assets/world/");
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
    expect(Reflect.get(clientImageSources, key), key).toContain("./assets/gathering/");
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
  const sprite = (calls: RenderInspection[]) => calls.find((call) => call.kind === "sprite");

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
