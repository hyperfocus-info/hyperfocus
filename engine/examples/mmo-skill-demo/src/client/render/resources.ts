import { renderRecord, type Renderable, type RenderFramePool } from "@hyperfocus/engine/render";
import type { ClientImageKey } from "../../data/assets.ts";
import { RESOURCE_SIZE_BY_KIND } from "../../data/entity-sizes.ts";
import type { ResourceEntity } from "../../shared.ts";
import { hash, type ClientImages } from "../assets.ts";
import type { InteractableTarget } from "./types.ts";

type ResourceVisual = {
  image: ClientImageKey;
  fallbackImage?: ClientImageKey;
  width: number;
  height: number;
  anchorY?: number;
  shadowFill?: string | false;
};

const DEFAULT_RESOURCE_SHADOW = "rgba(8, 13, 11, 0.32)";
const MATERIAL_MARK_COLORS = ["#f4d36b", "#6de2ff", "#ff8b7a", "#b99cff", "#91e2b3", "#d8ded0", "#ffb36b", "#73e2ff"] as const;
const MATERIAL_MARK_SHAPES = ["circle", "diamond", "square", "triangle"] as const;

const MATERIAL_RESOURCE_VISUALS: Readonly<Record<number, ResourceVisual>> = {
  1: { image: "gatherTreePineWood", width: 58, height: 58, anchorY: 0.58, shadowFill: "rgba(25, 64, 36, 0.34)" },
  2: { image: "gatherTreeElderBirch", width: 62, height: 62, anchorY: 0.58, shadowFill: "rgba(190, 225, 205, 0.26)" },
  3: { image: "gatherTreeSylvanOak", width: 64, height: 64, anchorY: 0.58, shadowFill: "rgba(35, 86, 42, 0.34)" },
  4: { image: "gatherTreeGhostwood", width: 68, height: 68, anchorY: 0.58, shadowFill: "rgba(61, 48, 78, 0.34)" },
  5: { image: "gatherTreeWorldHeart", width: 78, height: 78, anchorY: 0.58, shadowFill: "rgba(45, 104, 59, 0.36)" },
  6: { image: "gatherRockCopper", width: 34, height: 34, shadowFill: "rgba(116, 74, 42, 0.3)" },
  7: { image: "worldGuildCracks", width: 36, height: 34, shadowFill: "rgba(28, 30, 38, 0.36)" },
  8: { image: "worldHolyStatues", width: 38, height: 28, shadowFill: "rgba(210, 226, 235, 0.24)" },
  9: { image: "worldCrystalViolet1", width: 36, height: 36, shadowFill: "rgba(78, 45, 115, 0.36)" },
  10: { image: "gatherCrystalBlue", width: 38, height: 38, shadowFill: "rgba(53, 102, 135, 0.34)" },
  11: { image: "gatherPlantBloodrose", width: 30, height: 30, shadowFill: "rgba(91, 28, 35, 0.3)" },
  12: { image: "gatherPlantEarthroot", width: 30, height: 30, shadowFill: "rgba(92, 65, 34, 0.3)" },
  13: { image: "gatherPlantMoonlily", width: 30, height: 30, shadowFill: "rgba(190, 210, 210, 0.24)" },
  14: { image: "worldVoidRafflesia", width: 34, height: 30, shadowFill: "rgba(82, 34, 71, 0.34)" },
  15: { image: "gatherBushLeaf", width: 38, height: 32, shadowFill: "rgba(45, 91, 43, 0.32)" },
  16: { image: "gatherRockSandstone", width: 36, height: 34, shadowFill: "rgba(130, 104, 66, 0.3)" },
  17: { image: "gatherRockGranite", width: 38, height: 36, shadowFill: "rgba(93, 100, 96, 0.3)" },
  18: { image: "gatherRockMarble", width: 36, height: 36, shadowFill: "rgba(206, 206, 188, 0.24)" },
  19: { image: "gatherRockBasalt", width: 38, height: 36, shadowFill: "rgba(35, 35, 33, 0.36)" },
  20: { image: "worldVoidObsidianBoulder", width: 42, height: 34, shadowFill: "rgba(28, 26, 44, 0.38)" },
  21: { image: "gatherWaterShallow", width: 38, height: 22, shadowFill: false },
  22: { image: "gatherWaterSilver", width: 38, height: 22, shadowFill: false },
  23: { image: "gatherWaterDeep", width: 40, height: 24, shadowFill: false },
  24: { image: "worldPortWaterTiles", width: 42, height: 24, shadowFill: false },
  25: { image: "gatherWaterAbyss", width: 44, height: 25, shadowFill: false },
  26: { image: "worldCampWolfDen", width: 46, height: 36, shadowFill: "rgba(86, 57, 42, 0.3)" },
  27: { image: "worldCampGrayBoulder", width: 46, height: 42, shadowFill: "rgba(82, 72, 58, 0.3)" },
  28: { image: "worldForestWolfIdol", width: 56, height: 56, shadowFill: "rgba(58, 56, 48, 0.32)" },
  29: { image: "worldVoidObsidianTower", width: 38, height: 34, shadowFill: "rgba(53, 45, 65, 0.34)" },
  30: { image: "worldVoidDragonBones", width: 44, height: 44, shadowFill: "rgba(76, 65, 44, 0.32)" },
  31: { image: "gatherPlantWildFlax", width: 30, height: 30, shadowFill: "rgba(64, 103, 45, 0.3)" },
  32: { image: "gatherPlantRyeGrain", width: 30, height: 30, shadowFill: "rgba(127, 104, 44, 0.3)" },
  33: { image: "gatherPlantCotton", width: 30, height: 30, shadowFill: "rgba(174, 190, 150, 0.24)" },
  34: { image: "gatherPlantSkyOats", width: 30, height: 30, shadowFill: "rgba(120, 135, 76, 0.3)" },
  35: { image: "gatherPlantSunThread", width: 30, height: 30, shadowFill: "rgba(159, 124, 44, 0.3)" },
  36: { image: "worldPortCargoDetail", width: 32, height: 28, shadowFill: "rgba(80, 70, 52, 0.3)" },
  37: { image: "worldCampLogBarricade", width: 42, height: 28, shadowFill: "rgba(95, 63, 39, 0.3)" },
  38: { image: "worldDesertScaleDecor", width: 32, height: 36, shadowFill: "rgba(124, 91, 44, 0.28)" },
  39: { image: "worldVoidBrokenBoat", width: 42, height: 36, shadowFill: "rgba(68, 59, 63, 0.32)" },
  40: { image: "worldVoidWoodFloorHorizontal", width: 42, height: 24, shadowFill: "rgba(50, 42, 38, 0.32)" },
  41: { image: "gatherCrystalYellow", width: 30, height: 30, shadowFill: "rgba(147, 118, 38, 0.3)" },
  42: { image: "gatherCrystalRed", width: 32, height: 32, shadowFill: "rgba(58, 111, 135, 0.3)" },
  43: { image: "gatherCrystalViolet", width: 32, height: 32, shadowFill: "rgba(75, 43, 110, 0.34)" },
  44: { image: "worldRuinsWhite3", width: 34, height: 34, shadowFill: "rgba(190, 218, 228, 0.24)" },
  45: { image: "gatherCrystalGreen", width: 36, height: 36, shadowFill: "rgba(48, 112, 76, 0.32)" },
  46: { image: "gatherBushFlowerYellow", width: 34, height: 30, shadowFill: "rgba(114, 91, 38, 0.3)" },
  47: { image: "worldForestLuminousTree", width: 36, height: 36, shadowFill: "rgba(94, 117, 52, 0.3)" },
  48: { image: "gatherBushBerryRed", width: 32, height: 30, shadowFill: "rgba(92, 46, 42, 0.3)" },
  49: { image: "gatherBushLow", width: 38, height: 32, shadowFill: "rgba(142, 116, 39, 0.3)" },
  50: { image: "worldCrystalYellow1", width: 34, height: 34, shadowFill: "rgba(173, 136, 34, 0.3)" },
  51: { image: "gatherTreeAutumnAmber", width: 42, height: 42, anchorY: 0.58, shadowFill: "rgba(86, 84, 34, 0.3)" },
  52: { image: "gatherTreeBrokenResin", width: 42, height: 42, anchorY: 0.58, shadowFill: "rgba(105, 84, 39, 0.3)" },
  53: { image: "gatherTreeBurnedTar", width: 42, height: 42, anchorY: 0.58, shadowFill: "rgba(57, 40, 64, 0.34)" },
  54: { image: "worldVoidManyEyesPlant", width: 38, height: 34, shadowFill: "rgba(65, 42, 85, 0.34)" },
  55: { image: "gatherTreeFruitElixir", width: 54, height: 54, anchorY: 0.58, shadowFill: "rgba(61, 113, 56, 0.34)" },
  56: { image: "gatherMushroomGreen", width: 30, height: 30, shadowFill: "rgba(72, 100, 48, 0.3)" },
  57: { image: "gatherMushroomChanterelle", width: 28, height: 28, shadowFill: "rgba(105, 82, 36, 0.3)" },
  58: { image: "worldForestRedMushroom", width: 30, height: 30, shadowFill: "rgba(98, 82, 52, 0.3)" },
  59: { image: "gatherMushroomRed", width: 32, height: 32, shadowFill: "rgba(92, 42, 42, 0.34)" },
  60: { image: "worldVoidEyePlant", width: 34, height: 34, shadowFill: "rgba(72, 43, 92, 0.34)" },
  61: { image: "gatherWaterLeaf", width: 40, height: 24, shadowFill: false },
  62: { image: "worldVoidSwampHouse", width: 40, height: 28, shadowFill: "rgba(50, 42, 38, 0.24)" },
  63: { image: "worldVoidBoulder3", width: 40, height: 28, shadowFill: "rgba(63, 45, 35, 0.28)" },
  64: { image: "worldVoidObsidianCell", width: 40, height: 34, shadowFill: "rgba(63, 45, 35, 0.34)" },
  65: { image: "gatherWaterVoid", width: 42, height: 25, shadowFill: false },
  66: { image: "gatherBonesFossil", width: 38, height: 34, shadowFill: "rgba(110, 96, 70, 0.28)" },
  67: { image: "gatherStonePyramid", width: 34, height: 34, shadowFill: "rgba(104, 82, 50, 0.28)" },
  68: { image: "worldRuinsBlueGray5", width: 32, height: 32, shadowFill: "rgba(74, 85, 96, 0.28)" },
  69: { image: "worldRuinsSand1", width: 34, height: 34, shadowFill: "rgba(125, 97, 58, 0.28)" },
  70: { image: "worldHolyAltar", width: 42, height: 18, shadowFill: "rgba(151, 132, 78, 0.24)" },
  71: { image: "worldForestDeerIdol", width: 42, height: 42, shadowFill: "rgba(86, 58, 42, 0.3)" },
  72: { image: "worldCampScarecrowWatch", width: 34, height: 48, shadowFill: "rgba(78, 62, 45, 0.3)" },
  73: { image: "worldCampStumpCache", width: 48, height: 42, shadowFill: "rgba(87, 74, 50, 0.3)" },
  74: { image: "worldVoidJawsPlant", width: 52, height: 40, shadowFill: "rgba(71, 46, 62, 0.34)" },
  75: { image: "worldForestDragonIdol", width: 64, height: 64, shadowFill: "rgba(80, 66, 48, 0.32)" },
  76: { image: "gatherCrystalWhite", width: 32, height: 32, shadowFill: "rgba(188, 218, 226, 0.24)" },
  77: { image: "gatherCrystalRose", width: 34, height: 34, shadowFill: "rgba(126, 54, 48, 0.32)" },
  78: { image: "gatherCrystalBlueGreen", width: 34, height: 34, shadowFill: "rgba(55, 105, 139, 0.32)" },
  79: { image: "gatherCrystalBlack", width: 36, height: 36, shadowFill: "rgba(37, 32, 48, 0.36)" },
  80: { image: "worldCrystalBlue1", width: 38, height: 38, shadowFill: "rgba(54, 113, 82, 0.32)" }
};

const FALLBACK_VISUALS_BY_SKILL = {
  lumberjacking: [
    { image: "gatherTreePineWood", width: 58, height: 58, anchorY: 0.58 },
    { image: "gatherTreeSylvanOak", width: 64, height: 64, anchorY: 0.58 },
    { image: "gatherTreeElderBirch", width: 62, height: 62, anchorY: 0.58 }
  ],
  mining: [
    { image: "gatherRockCopper", width: 34, height: 34 },
    { image: "gatherCrystalBlack", width: 34, height: 34 },
    { image: "gatherCrystalWhite", width: 35, height: 35 }
  ],
  quarrying: [
    { image: "gatherRockSandstone", width: 36, height: 34 },
    { image: "gatherRockGranite", width: 38, height: 36 },
    { image: "gatherRockBasalt", width: 38, height: 36 }
  ],
  gemology: [
    { image: "gatherCrystalYellow", width: 34, height: 34 },
    { image: "gatherCrystalBlue", width: 34, height: 34 },
    { image: "gatherCrystalViolet", width: 34, height: 34 }
  ],
  foraging: [
    { image: "gatherPlantBloodrose", width: 30, height: 30 },
    { image: "gatherPlantMoonlily", width: 30, height: 30 },
    { image: "gatherBushLeaf", width: 38, height: 32 }
  ],
  "crop-harvesting": [
    { image: "gatherPlantWildFlax", width: 30, height: 30 },
    { image: "gatherPlantRyeGrain", width: 30, height: 30 },
    { image: "gatherPlantSunThread", width: 30, height: 30 }
  ],
  "spore-hunting": [
    { image: "gatherMushroomGreen", width: 30, height: 30 },
    { image: "gatherMushroomRed", width: 30, height: 30 },
    { image: "gatherMushroomChanterelle", width: 28, height: 28 }
  ],
  fishing: [
    { image: "gatherWaterShallow", width: 38, height: 22, shadowFill: false },
    { image: "gatherWaterSilver", width: 38, height: 22, shadowFill: false },
    { image: "gatherWaterDeep", width: 40, height: 24, shadowFill: false }
  ],
  dredging: [
    { image: "gatherWaterShallow", width: 36, height: 22, shadowFill: false },
    { image: "gatherWaterSilver", width: 38, height: 22, shadowFill: false },
    { image: "gatherWaterVoid", width: 40, height: 24, shadowFill: false }
  ],
  "essence-siphoning": [
    { image: "gatherCrystalYellow", width: 30, height: 30 },
    { image: "gatherCrystalBlue", width: 32, height: 32 },
    { image: "gatherCrystalViolet", width: 32, height: 32 }
  ],
  apiculture: [
    { image: "gatherBushFlowerYellow", width: 34, height: 30 },
    { image: "worldForestLuminousTree", width: 36, height: 36 }
  ],
  "sap-tapping": [
    { image: "gatherTreePineWood", width: 42, height: 42, anchorY: 0.58 },
    { image: "gatherTreeSylvanOak", width: 42, height: 42, anchorY: 0.58 }
  ],
  scavenging: [
    { image: "worldPortCargoDetail", width: 32, height: 28 },
    { image: "worldCampLogBarricade", width: 42, height: 28 }
  ],
  archaeology: [
    { image: "worldRuinsYellow5", width: 32, height: 32 },
    { image: "worldRuinsBlueGray5", width: 32, height: 32 },
    { image: "worldRuinsSand1", width: 34, height: 34 }
  ],
  skinning: [
    { image: "worldForestDeerIdol", width: 34, height: 34 },
    { image: "worldForestWolfIdol", width: 40, height: 40 }
  ],
  hunting: [
    { image: "worldForestDeerIdol", width: 38, height: 38 },
    { image: "worldForestWolfIdol", width: 34, height: 34 }
  ]
} as const satisfies Readonly<Record<string, readonly ResourceVisual[]>>;

const DEFAULT_VISUAL: ResourceVisual = { image: "resourceStones", fallbackImage: "stone1", width: 34, height: 30 };

function resourceScale(node: ResourceEntity) {
  const skillId = resourceSkill(node);
  if (skillId === "lumberjacking" || skillId === "sap-tapping") return 1.55;
  if (skillId === "mining" || skillId === "quarrying" || skillId === "gemology" || skillId === "essence-siphoning") return 1.35;
  if (skillId === "skinning" || skillId === "hunting") return 1.28;
  if (skillId === "foraging" || skillId === "spore-hunting" || skillId === "crop-harvesting" || skillId === "apiculture") return 1.4;
  if (skillId === "fishing" || skillId === "dredging") return 1.55;
  return 1.35;
}

function resourceSkill(node: ResourceEntity) {
  if (node.skillId) return node.skillId;
  if (node.kind === "tree") return "lumberjacking";
  if (node.kind === "ore") return "mining";
  return node.kind;
}

function legacyResourceImage(images: ClientImages, node: ResourceEntity) {
  const index = Math.abs(hash(node.id));
  const skillId = resourceSkill(node);
  if (skillId === "lumberjacking") {
    const treeIndex = index % 3;
    return treeIndex === 0 ? images.tree1 : treeIndex === 1 ? images.tree2 : images.tree3;
  }
  if (skillId === "foraging" || skillId === "spore-hunting") return images.worldForestRedMushroom;
  if (skillId === "crop-harvesting") return images.worldDesertCactusCluster ?? images.worldForestRedMushroom;
  if (skillId === "fishing" || skillId === "dredging") return images.worldPortWaterTiles;
  if (skillId === "scavenging") return images.worldPortCargoDetail;
  if (skillId === "essence-siphoning") return images.worldCrystalViolet1 ?? images.worldCrystalBlue1;
  if (skillId === "apiculture" || skillId === "sap-tapping") return images.worldForestLuminousTree ?? images.worldForestMossTree;
  if (skillId === "skinning" || skillId === "hunting") return images.worldForestWolfIdol;
  if (skillId === "archaeology") return images.worldRuinsSand1 ?? images.worldRuinsYellow2;
  if (skillId === "gemology") {
    const gemIndex = index % 3;
    return gemIndex === 0 ? images.worldCrystalYellow1 : gemIndex === 1 ? images.worldCrystalBlue1 : images.worldCrystalViolet1;
  }
  return images.resourceStones ?? (index % 2 === 0 ? images.stone1 : images.stone2);
}

function resourceVisual(node: ResourceEntity): ResourceVisual {
  if (typeof node.materialId === "number") {
    const materialVisual = MATERIAL_RESOURCE_VISUALS[node.materialId];
    if (materialVisual) return materialVisual;
  }
  const variants = FALLBACK_VISUALS_BY_SKILL[resourceSkill(node)];
  if (variants?.length) return variants[Math.abs(hash(node.id)) % variants.length]!;
  return DEFAULT_VISUAL;
}

function visualImage(images: ClientImages, node: ResourceEntity, visual: ResourceVisual) {
  return images[visual.image] ?? (visual.fallbackImage ? images[visual.fallbackImage] : undefined) ?? legacyResourceImage(images, node);
}

function resourceFallbackColor(node: ResourceEntity) {
  const skillId = resourceSkill(node);
  if (skillId === "lumberjacking" || skillId === "foraging" || skillId === "sap-tapping" || skillId === "spore-hunting") return "#7ed66d";
  if (skillId === "fishing" || skillId === "dredging") return "#6de2ff";
  if (skillId === "essence-siphoning" || skillId === "gemology") return "#b99cff";
  if (skillId === "apiculture" || skillId === "crop-harvesting") return "#f4d36b";
  if (skillId === "skinning" || skillId === "hunting") return "#ef8f6b";
  if (skillId === "archaeology" || skillId === "scavenging") return "#d8bc80";
  return "#87909d";
}

function appendMaterialMark(calls: Renderable[], node: ResourceEntity, x: number, y: number, width: number, height: number, pool?: RenderFramePool) {
  if (typeof node.materialId !== "number") return;
  const materialId = node.materialId;
  const radius = Math.max(4.5, Math.min(7.5, Math.min(width, height) * 0.17));
  const markX = x + width * 0.76;
  const markY = y + height * 0.74;
  const fill = MATERIAL_MARK_COLORS[(materialId - 1) % MATERIAL_MARK_COLORS.length]!;
  const shape = MATERIAL_MARK_SHAPES[Math.floor((materialId - 1) / MATERIAL_MARK_COLORS.length) % MATERIAL_MARK_SHAPES.length]!;
  const outline = "rgba(8, 12, 10, 0.82)";
  if (shape === "diamond") {
    const mark = renderRecord(pool, "polygon");
    mark.points = [
      { x: markX, y: markY - radius },
      { x: markX + radius, y: markY },
      { x: markX, y: markY + radius },
      { x: markX - radius, y: markY }
    ];
    mark.fill = fill;
    mark.stroke = outline;
    mark.lineWidth = 1.4;
    calls.push(mark as Renderable);
  } else if (shape === "triangle") {
    const mark = renderRecord(pool, "polygon");
    mark.points = [
      { x: markX, y: markY - radius * 1.1 },
      { x: markX + radius * 1.05, y: markY + radius * 0.9 },
      { x: markX - radius * 1.05, y: markY + radius * 0.9 }
    ];
    mark.fill = fill;
    mark.stroke = outline;
    mark.lineWidth = 1.4;
    calls.push(mark as Renderable);
  } else if (shape === "square") {
    const mark = renderRecord(pool, "rect");
    mark.x = markX - radius;
    mark.y = markY - radius;
    mark.width = radius * 2;
    mark.height = radius * 2;
    mark.fill = fill;
    mark.stroke = outline;
    mark.lineWidth = 1.4;
    calls.push(mark as Renderable);
  } else {
    const mark = renderRecord(pool, "circle");
    mark.x = markX;
    mark.y = markY;
    mark.radius = radius;
    mark.fill = fill;
    mark.stroke = outline;
    mark.lineWidth = 1.4;
    calls.push(mark as Renderable);
  }
  const pip = renderRecord(pool, "circle");
  pip.x = markX + radius * 0.28;
  pip.y = markY - radius * 0.28;
  pip.radius = Math.max(1.4, radius * 0.22);
  pip.fill = "rgba(255,255,255,0.78)";
  calls.push(pip as Renderable);
}

export function createResourceRenderCalls(node: ResourceEntity, images: ClientImages, currentInteractable?: InteractableTarget, out: Renderable[] = [], pool?: RenderFramePool, firstProof = false): Renderable[] {
  const visual = resourceVisual(node);
  const image = visualImage(images, node, visual);
  const baseSize = RESOURCE_SIZE_BY_KIND[node.kind] ?? RESOURCE_SIZE_BY_KIND.ore!;
  const scale = resourceScale(node);
  const width = (visual.width ?? baseSize.width) * scale;
  const height = (visual.height ?? baseSize.height) * scale;
  const anchorY = visual.anchorY ?? (resourceSkill(node) === "lumberjacking" ? 0.58 : 0.5);
  const y = node.y - height * anchorY;
  const calls: Renderable[] = pool ? pool.array() : [];
  if (visual.shadowFill !== false) {
    const shadow = renderRecord(pool, "ellipse");
    shadow.x = node.x;
    shadow.y = node.y + height * 0.26;
    shadow.radiusX = Math.max(8, width * 0.36);
    shadow.radiusY = Math.max(4, height * 0.12);
    shadow.fill = visual.shadowFill ?? DEFAULT_RESOURCE_SHADOW;
    shadow.alpha = node.depleted ? 0.12 : 0.28;
    calls.push(shadow as Renderable);
  }
  if (image) {
    const sprite = renderRecord(pool, "sprite");
    sprite.image = image;
    sprite.x = node.x;
    sprite.y = y;
    sprite.width = width;
    sprite.height = height;
    sprite.anchor = "top";
    sprite.alpha = node.depleted ? 0.34 : 1;
    calls.push(sprite as Renderable);
    appendMaterialMark(calls, node, node.x - width * 0.5, y, width, height, pool);
  } else {
    const ellipse = renderRecord(pool, "ellipse");
    ellipse.x = node.x;
    ellipse.y = node.y;
    ellipse.radiusX = width * 0.42;
    ellipse.radiusY = height * 0.42;
    ellipse.fill = resourceFallbackColor(node);
    ellipse.alpha = node.depleted ? 0.34 : 1;
    calls.push(ellipse as Renderable);
  }
  if (currentInteractable?.type === "resource" && currentInteractable.id === node.id) {
    const outline = renderRecord(pool, "outline");
    outline.x = node.x - width * 0.52;
    outline.y = node.y + 2 - height * Math.min(0.5, anchorY * 0.82);
    outline.width = width * 1.04;
    outline.height = height * (anchorY > 0.55 ? 0.76 : 0.92);
    outline.shape = "ellipse";
    outline.stroke = "#ffffff";
    outline.lineWidth = 2;
    calls.push(outline as Renderable);
  }
  if (firstProof && !node.depleted) {
    const proofRing = renderRecord(pool, "circle");
    proofRing.x = node.x;
    proofRing.y = node.y;
    proofRing.radius = Math.max(24, width * 0.36);
    proofRing.fill = "rgba(244, 211, 107, 0.07)";
    proofRing.stroke = "rgba(244, 211, 107, 0.88)";
    proofRing.lineWidth = 2;
    proofRing.shadowColor = "rgba(244, 211, 107, 0.72)";
    proofRing.shadowBlur = 14;
    calls.push(proofRing as Renderable);
    const proof = renderRecord(pool, "text");
    proof.text = "FIRST PROOF";
    proof.x = node.x;
    proof.y = y - 8;
    proof.align = "center";
    proof.fill = "#f4d36b";
    proof.font = "900 10px system-ui";
    proof.maxWidth = 96;
    calls.push(proof as Renderable);
  }
  const group = renderRecord(pool, "group");
  group.id = node.id;
  group.x = node.x;
  group.y = node.y;
  group.ySort = node.y;
  group.calls = calls;
  out.push(group as Renderable);
  return out;
}
