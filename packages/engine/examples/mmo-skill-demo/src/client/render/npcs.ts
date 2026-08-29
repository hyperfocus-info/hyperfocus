import { renderableRecord, renderRecord, type Renderable, type RenderFramePool } from "@hyperfocus/engine/render";
import { expandedCreatureVisuals, type ExpandedCreatureVisual } from "../../data/assets.ts";
import { NPC_DEFAULT_SIZE, NPC_SIZE_BY_KIND, NPC_SIZE_BY_ROLE, type EntityVisualSize } from "../../data/entity-sizes.ts";
import { worldFactionQuestSteps } from "../../data/world-quests.ts";
import { bankQty, hasInventoryItem, hasQuestFlag, itemQty } from "../../shared-loadout.ts";
import { type NpcEntity, type PlayerEntity } from "../../shared-contracts.ts";
import type { ClientImages } from "../assets.ts";
import { contractInfo } from "../progression.ts";
import { spriteSheetFrame } from "./sprite-sheets.ts";
import {
  ACTOR_LABEL_DISTANCE,
  STRONG_ENEMY_KINDS,
  STRONG_PHASE_INVULN_END_MS,
  STRONG_PHASE_INVULN_START_MS,
  hasGearOrItem,
  labelize,
  type ImpactActorVisual,
  type InteractableTarget,
  type QuestMarker
} from "./types.ts";

const EXPANDED_CREATURE_VISUAL_BY_KIND: Readonly<Record<string, ExpandedCreatureVisual>> = expandedCreatureVisuals;

function expandedCreatureVisualFor(kind: string): ExpandedCreatureVisual | undefined {
  return EXPANDED_CREATURE_VISUAL_BY_KIND[kind];
}

function npcBodySize(npc: Pick<NpcEntity, "kind" | "role" | "elite">): EntityVisualSize {
  return NPC_SIZE_BY_KIND[npc.kind] ?? NPC_SIZE_BY_ROLE[npc.role] ?? (npc.elite ? NPC_SIZE_BY_ROLE.elite : NPC_DEFAULT_SIZE);
}

function npcImage(images: ClientImages, npc: NpcEntity) {
  const creatureVisual = expandedCreatureVisualFor(npc.kind);
  if (creatureVisual) return images[creatureVisual.sprite];
  switch (npc.kind) {
    case "blacksmith-silas":
    case "blacksmith":
      return images.npcBlacksmith;
    case "merchant-kaya":
    case "apprentice-jinn":
    case "innkeeper-martha":
      return images.merchantJeweler;
    case "captain-marrow":
    case "runner-kael":
      return images.allyRobber;
    case "navigator-kai":
    case "scout-elara":
      return images.allyAssassin;
    case "banker-valerius":
    case "overseer-bale":
    case "bazaar-guard":
      return images.allyThug;
    case "elder-rowan":
    case "high-arcanist-vael":
    case "alchemist-zora":
    case "geologist-mira":
    case "foreman-iron-will":
    case "master-kael":
    case "miller-finn":
      return images.trainerSage;
    case "void-sent-sentinel":
    case "dungeon-revenant":
      return images.bossWarlord ?? images.bossVikingLeader;
    case "cursed-archer":
    case "iron-eye-bat":
      return images.allyAssassin;
    case "mire-bomber":
    case "rune-priest":
    case "ember-acolyte":
    case "veil-oracle":
    case "crag-sapper":
      return images.enemyShamanGoblin;
    case "crystal-beetle":
    case "stone-crawler":
      return images.bossGiantGoblin ?? images.monster;
    case "crag-gargoyle":
      return images.bossDragon ?? images.bossGiantGoblin;
    case "alpha-timberwolf":
    case "ash-bramble-stalker":
      return images.enemyChiefGoblin;
    case "sand-wraith":
      return images.enemyShamanGoblin;
    case "great-ash-lord":
    case "mirror-king":
      return images.bossVikingLeader ?? images.bossWarlord;
    case "iron-core-golem":
      return images.bossGiantGoblin ?? images.bossDragon;
    default:
      if (isSupportNpc(npc)) {
        return images.trainerSage;
      }
      return images.enemyGoblin ?? images.monster;
  }
}

function isDrawableImage(image: HTMLImageElement | null | undefined): image is HTMLImageElement {
  if (!image) return false;
  const width = "naturalWidth" in image && image.naturalWidth ? image.naturalWidth : image.width;
  const height = "naturalHeight" in image && image.naturalHeight ? image.naturalHeight : image.height;
  return width > 0 && height > 0;
}

export function isSupportNpc(npc: Pick<NpcEntity, "role">) {
  return npc.role === "quest" || npc.role === "trainer" || npc.role === "bank" || npc.role === "merchant" || npc.role === "travel" || npc.role === "contract" || npc.role === "crafting" || npc.role === "home" || npc.role === "hidden";
}

export function isHostileNpc(npc: NpcEntity) {
  return !isSupportNpc(npc);
}

export function isStrongEnemyVisual(npc: Pick<NpcEntity, "kind" | "role" | "elite" | "hp">) {
  return npc.hp > 0 && npc.role !== "boss-node" && (npc.elite || npc.role === "boss" || STRONG_ENEMY_KINDS.has(npc.kind));
}

export function isInvulnerablePhase(npc: Pick<NpcEntity, "kind" | "role" | "elite" | "hp" | "phaseMs" | "iframeMs">) {
  return (npc.iframeMs ?? 0) > 0 || (isStrongEnemyVisual(npc) && npc.phaseMs >= STRONG_PHASE_INVULN_START_MS && npc.phaseMs < STRONG_PHASE_INVULN_END_MS);
}

export function isBuffedPhase(npc: Pick<NpcEntity, "kind" | "role" | "elite" | "hp" | "phaseMs">) {
  return isStrongEnemyVisual(npc) && npc.phaseMs >= STRONG_PHASE_INVULN_END_MS;
}

export function isDefending(npc: NpcEntity) {
  if (isInvulnerablePhase(npc)) return true;
  if (npc.kind === "crystal-beetle") return npc.phaseMs < 1100;
  return false;
}

function shouldDrawActorLabel(npc: NpcEntity, player: PlayerEntity | undefined, currentInteractable?: InteractableTarget) {
  if (!player) return false;
  if (currentInteractable?.type === "npc" && currentInteractable.id === npc.id) return true;
  if (npc.id === player.targetId && isHostileNpc(npc)) return true;
  return Math.hypot(npc.x - player.x, npc.y - player.y) <= ACTOR_LABEL_DISTANCE;
}

export type NpcJobCue = { glyph: string; fill: string; icon?: string; shape?: "circle" | "diamond" | "square" | "triangle"; accent?: string };
const PHASE_OUTLINE_DASH = [5, 5];
const npcDebuffCueScratch: NpcJobCue[] = [];

function pooledPoint(pool: RenderFramePool | undefined, x: number, y: number) {
  return pool ? pool.point(x, y) : { x, y };
}

function pushCircle(calls: Renderable[], pool: RenderFramePool | undefined, x: number, y: number, radius: number) {
  const call = renderRecord(pool, "circle");
  call.x = x;
  call.y = y;
  call.radius = radius;
  calls.push(renderableRecord(call));
  return call;
}

function pushEllipse(calls: Renderable[], pool: RenderFramePool | undefined, x: number, y: number, radiusX: number, radiusY: number) {
  const call = renderRecord(pool, "ellipse");
  call.x = x;
  call.y = y;
  call.radiusX = radiusX;
  call.radiusY = radiusY;
  calls.push(renderableRecord(call));
  return call;
}

function pushLine(calls: Renderable[], pool: RenderFramePool | undefined, x1: number, y1: number, x2: number, y2: number) {
  const call = renderRecord(pool, "line");
  call.x1 = x1;
  call.y1 = y1;
  call.x2 = x2;
  call.y2 = y2;
  calls.push(renderableRecord(call));
  return call;
}

function pushText(calls: Renderable[], pool: RenderFramePool | undefined, text: string, x: number, y: number, font: string) {
  const call = renderRecord(pool, "text");
  call.text = text;
  call.x = x;
  call.y = y;
  call.font = font;
  calls.push(renderableRecord(call));
  return call;
}

function pushPolygon(calls: Renderable[], pool: RenderFramePool | undefined, points: Array<{ x: number; y: number }>) {
  const call = renderRecord(pool, "polygon");
  call.points = points;
  calls.push(renderableRecord(call));
  return call;
}

function pushRect(calls: Renderable[], pool: RenderFramePool | undefined, x: number, y: number, width: number, height: number) {
  const call = renderRecord(pool, "rect");
  call.x = x;
  call.y = y;
  call.width = width;
  call.height = height;
  calls.push(renderableRecord(call));
  return call;
}

function pushSprite(calls: Renderable[], pool: RenderFramePool | undefined, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const call = renderRecord(pool, "sprite");
  call.image = image;
  call.x = x;
  call.y = y;
  call.width = width;
  call.height = height;
  calls.push(renderableRecord(call));
  return call;
}

function pushOutline(calls: Renderable[], pool: RenderFramePool | undefined, x: number, y: number, width: number, height: number) {
  const call = renderRecord(pool, "outline");
  call.x = x;
  call.y = y;
  call.width = width;
  call.height = height;
  calls.push(renderableRecord(call));
  return call;
}

type SupportFixtureSpec = {
  image: string;
  width: number;
  height: number;
  dx: number;
  dy: number;
  glyph: string;
  fill: string;
};

function supportFixtureForNpc(npc: NpcEntity): SupportFixtureSpec | undefined {
  if (!isSupportNpc(npc)) return undefined;
  if (npc.kind === "cursed-statue") return { image: "worldVoidSkeleton", width: 72, height: 54, dx: -36, dy: -50, glyph: "V", fill: "#d49be7" };
  if (npc.kind.includes("blacksmith")) return { image: "worldGuildInteriorObjects", width: 70, height: 70, dx: -35, dy: -48, glyph: "F", fill: "#ffb36b" };
  if (npc.kind === "miller-finn") return { image: "worldForestLivingGazebo", width: 58, height: 58, dx: -29, dy: -46, glyph: "M", fill: "#f4d36b" };
  if (npc.kind === "elder-rowan") return { image: "worldForestLivingGazebo", width: 64, height: 64, dx: -32, dy: -52, glyph: "E", fill: "#bfe7a3" };
  if (npc.kind === "scout-elara") return { image: "worldForestLuminousTree", width: 48, height: 48, dx: -24, dy: -44, glyph: "R", fill: "#9bd6ff" };
  if (npc.kind === "high-arcanist-vael") return { image: "worldHolyInteriorObjects", width: 82, height: 43, dx: -41, dy: -42, glyph: "A", fill: "#f7f1ba" };
  if (npc.kind === "master-kael") return { image: "worldRuinsBlueGray1", width: 50, height: 57, dx: -25, dy: -50, glyph: "^", fill: "#dfe9ff" };
  if (npc.kind === "alchemist-zora") {
    return npc.id.includes("obsidian") || npc.zoneId === "bazaar"
      ? { image: "worldVoidLantern", width: 42, height: 48, dx: -21, dy: -45, glyph: "Z", fill: "#d49be7" }
      : { image: "worldHolyInteriorObjects", width: 70, height: 37, dx: -35, dy: -38, glyph: "Z", fill: "#73e2ff" };
  }
  if (npc.role === "merchant") {
    if (npc.zoneId === "port-marrow") return { image: "worldPortBuildingLarge", width: 82, height: 35, dx: -41, dy: -36, glyph: "$", fill: "#6de2ff" };
    if (npc.zoneId === "ashwood") return { image: "worldForestLivingGazebo", width: 56, height: 56, dx: -28, dy: -45, glyph: "$", fill: "#bfe7a3" };
    return { image: "worldDesertMarketDecor", width: 96, height: 49, dx: -48, dy: -42, glyph: "$", fill: "#f4d36b" };
  }
  if (npc.role === "travel") {
    return npc.zoneId === "crags"
      ? { image: "worldCrystalYellow1", width: 38, height: 38, dx: -19, dy: -38, glyph: "T", fill: "#ffb36b" }
      : { image: "worldPortTower", width: 58, height: 29, dx: -29, dy: -34, glyph: "T", fill: "#6de2ff" };
  }
  if (npc.role === "bank") return { image: "worldDesertBuilding3", width: 52, height: 84, dx: -26, dy: -68, glyph: "B", fill: "#f4d36b" };
  if (npc.role === "contract") return { image: "worldRuinsSand1", width: 46, height: 46, dx: -23, dy: -41, glyph: "!", fill: "#fff3b8" };
  if (npc.role === "trainer") return { image: "worldCrystalBlue1", width: 40, height: 40, dx: -20, dy: -40, glyph: "T", fill: "#dfe9ff" };
  if (npc.role === "crafting") return { image: "worldGuildInteriorObjects", width: 66, height: 66, dx: -33, dy: -46, glyph: "C", fill: "#ffb36b" };
  return undefined;
}

function appendSupportFixtureCalls(npc: NpcEntity, images: ClientImages, calls: Renderable[], pool?: RenderFramePool) {
  const fixture = supportFixtureForNpc(npc);
  if (!fixture) return;
  const baseX = npc.spawnX || npc.x;
  const baseY = npc.spawnY || npc.y;
  const x = baseX + fixture.dx;
  const y = baseY + fixture.dy;
  const shadow = pushEllipse(calls, pool, baseX, baseY - 5, Math.max(18, fixture.width * 0.42), Math.max(6, fixture.height * 0.16));
  shadow.fill = "rgba(0,0,0,0.3)";
  const image = images[fixture.image];
  if (isDrawableImage(image)) {
    const sprite = pushSprite(calls, pool, image, x, y, fixture.width, fixture.height);
    sprite.alpha = 0.92;
    sprite.shadowColor = "rgba(0,0,0,0.32)";
    sprite.shadowBlur = 5;
  } else {
    const fallback = pushRect(calls, pool, x, y, fixture.width, fixture.height);
    fallback.fill = "rgba(10, 13, 10, 0.62)";
    fallback.stroke = fixture.fill;
    fallback.lineWidth = 1.2;
  }
  const badge = pushCircle(calls, pool, baseX + fixture.width * 0.22, baseY - fixture.height * 0.28, 8);
  badge.fill = "rgba(10, 13, 10, 0.78)";
  badge.stroke = fixture.fill;
  badge.lineWidth = 1.3;
  const glyph = pushText(calls, pool, fixture.glyph, baseX + fixture.width * 0.22, baseY - fixture.height * 0.28 + 0.5, "800 8px system-ui");
  glyph.fill = fixture.fill;
  glyph.align = "center";
  glyph.baseline = "middle";
}

export function npcJobCue(npc: Pick<NpcEntity, "kind">): NpcJobCue | undefined {
  if (npc.kind === "elder-rowan") return { glyph: "E", fill: "#a9d88f", icon: "hatchetIcon", shape: "circle", accent: "#f4d36b" };
  if (npc.kind === "blacksmith-silas") return { glyph: "S", fill: "#c8d0d8", icon: "ironOreIcon", shape: "diamond", accent: "#ffb36b" };
  if (npc.kind === "blacksmith") return { glyph: "F", fill: "#8ca0ad", icon: "ironChestIcon", shape: "square", accent: "#f4d36b" };
  if (npc.kind === "miller-finn") return { glyph: "G", fill: "#e8c36f", icon: "ashLogsIcon", shape: "triangle", accent: "#a9d88f" };
  if (npc.kind === "scout-elara") return { glyph: "M", fill: "#9bd6ff", icon: "captainsMapIcon", shape: "diamond", accent: "#ffffff" };
  if (npc.kind === "foreman-iron-will") return { glyph: "P", fill: "#c8d0d8", icon: "pickaxeIcon", shape: "square", accent: "#73e2ff" };
  if (npc.kind === "overseer-bale") return { glyph: "C", fill: "#d3b17a", icon: "bootsIcon", shape: "circle", accent: "#6b4d2e" };
  if (npc.kind === "geologist-mira") return { glyph: "*", fill: "#73e2ff", icon: "ringFocusIcon", shape: "diamond", accent: "#f4d36b" };
  if (npc.kind === "runner-kael") return { glyph: ">", fill: "#9bd6ff", icon: "speedPotionIcon", shape: "triangle", accent: "#ffffff" };
  if (npc.kind === "navigator-kai") return { glyph: "N", fill: "#6de2ff", icon: "captainsMapIcon", shape: "circle", accent: "#15253a" };
  if (npc.kind === "captain-marrow") return { glyph: "C", fill: "#9bd6ff", icon: "captainsMapIcon", shape: "square", accent: "#f4d36b" };
  if (npc.kind === "high-arcanist-vael") return { glyph: "R", fill: "#d49be7", icon: "uniqueCapeIcon", shape: "diamond", accent: "#6de2ff" };
  if (npc.kind === "alchemist-zora") return { glyph: "A", fill: "#91e2b3", icon: "silkThreadIcon", shape: "triangle", accent: "#ffb36b" };
  if (npc.kind === "banker-valerius") return { glyph: "$", fill: "#f4d36b", icon: "goldIcon", shape: "circle", accent: "#ffffff" };
  if (npc.kind === "merchant-kaya") return { glyph: "$", fill: "#dfe6ca", icon: "gladeBerryIcon", shape: "diamond", accent: "#f4d36b" };
  if (npc.kind === "apprentice-jinn") return { glyph: "+", fill: "#ff8bb5", icon: "speedPotionIcon", shape: "triangle", accent: "#ffffff" };
  if (npc.kind === "innkeeper-martha") return { glyph: "Z", fill: "#ffb36b", icon: "cinderAleIcon", shape: "square", accent: "#f4d36b" };
  if (npc.kind === "contract-board") return { glyph: "W", fill: "#f4d36b", icon: "renownIcon", shape: "square", accent: "#8d6a24" };
  if (npc.kind === "master-kael") return { glyph: "Q", fill: "#b99cff", icon: "eliteWeaponIcon", shape: "diamond", accent: "#ffffff" };
  if (npc.kind === "cursed-statue") return { glyph: "!", fill: "#7b6f95", icon: "cursedIdolIcon", shape: "circle", accent: "#b99cff" };
  return undefined;
}

function appendJobCueBaseCalls(cue: NpcJobCue, x: number, y: number, calls: Renderable[], pool?: RenderFramePool) {
  const stroke = "rgba(12,16,12,0.86)";
  const shadowColor = "rgba(0,0,0,0.45)";
  const shadowBlur = 3;
  const shape = cue.shape ?? "circle";
  let base: Record<string, unknown>;
  if (shape === "diamond") {
    const points = pool ? pool.points(4) : [];
    points[0] = pooledPoint(pool, x, y - 10);
    points[1] = pooledPoint(pool, x + 10, y);
    points[2] = pooledPoint(pool, x, y + 10);
    points[3] = pooledPoint(pool, x - 10, y);
    base = pushPolygon(calls, pool, points);
  } else if (shape === "square") {
    base = pushRect(calls, pool, x - 8, y - 8, 16, 16);
  } else if (shape === "triangle") {
    const points = pool ? pool.points(3) : [];
    points[0] = pooledPoint(pool, x, y - 10);
    points[1] = pooledPoint(pool, x + 10, y + 8);
    points[2] = pooledPoint(pool, x - 10, y + 8);
    base = pushPolygon(calls, pool, points);
  } else {
    base = pushCircle(calls, pool, x, y, 9);
  }
  base.fill = cue.fill;
  base.stroke = stroke;
  base.lineWidth = 1.5;
  base.shadowColor = shadowColor;
  base.shadowBlur = shadowBlur;
  if (cue.accent) {
    const accent = pushCircle(calls, pool, x + 6, y - 6, 2.2);
    accent.fill = cue.accent;
    accent.stroke = "rgba(12,16,12,0.58)";
    accent.lineWidth = 0.8;
  }
}

function appendCreatureAuraCalls(npc: NpcEntity, visual: ExpandedCreatureVisual, timeMs: number, scale: number, calls: Renderable[], pool?: RenderFramePool) {
  const pulse = 0.5 + Math.sin(timeMs * 0.006 + npc.x * 0.03 + npc.y * 0.02) * 0.5;
  const radius = (npc.role === "boss" ? 34 : 22) * scale;
  const shadow = pushEllipse(calls, pool, npc.x, npc.y + 14 * scale, radius * 0.76, 5 + pulse * 1.8);
  shadow.fill = visual.shadow;
  shadow.alpha = 0.55;
  const aura = pushEllipse(calls, pool, npc.x, npc.y + 4 * scale, radius * 0.95, radius * 0.68);
  aura.fill = visual.fill;
  aura.stroke = visual.color;
  aura.lineWidth = 1.1 + pulse * 0.9;
  aura.shadowColor = visual.shadow;
  aura.shadowBlur = 5 + pulse * 6;
}

function appendCreatureMotifCalls(npc: NpcEntity, visual: ExpandedCreatureVisual, timeMs: number, scale: number, calls: Renderable[], pool?: RenderFramePool) {
  const x = npc.x;
  const y = npc.y;
  const r = 15 * scale;
  const line = (x1: number, y1: number, x2: number, y2: number, stroke = visual.accent, width = 1.5) => {
    const call = pushLine(calls, pool, x1, y1, x2, y2);
    call.stroke = stroke;
    call.lineWidth = width;
    call.cap = "round";
    return call;
  };
  if (visual.motif === "insect") {
    for (let i = -1; i <= 1; i += 1) {
      line(x - 6 * scale, y + i * 6 * scale, x - r, y + (i * 6 + 4) * scale, visual.color);
      line(x + 6 * scale, y + i * 6 * scale, x + r, y + (i * 6 + 4) * scale, visual.color);
    }
  } else if (visual.motif === "beast") {
    for (let i = 0; i < 3; i += 1) line(x - 8 * scale + i * 7 * scale, y - 16 * scale, x - 3 * scale + i * 7 * scale, y - 4 * scale, visual.accent, 2);
  } else if (visual.motif === "construct") {
    const left = pushRect(calls, pool, x - 17 * scale, y - 8 * scale, 7 * scale, 14 * scale);
    left.fill = visual.fill;
    left.stroke = visual.color;
    left.lineWidth = 1;
    const right = pushRect(calls, pool, x + 10 * scale, y - 8 * scale, 7 * scale, 14 * scale);
    right.fill = visual.fill;
    right.stroke = visual.color;
    right.lineWidth = 1;
  } else if (visual.motif === "void") {
    for (let i = 0; i < 3; i += 1) {
      const angle = timeMs * 0.004 + i * 2.1;
      const mote = pushCircle(calls, pool, x + Math.cos(angle) * r, y + Math.sin(angle) * r * 0.72, 2.4);
      mote.fill = i === 1 ? visual.accent : visual.color;
      mote.shadowColor = visual.shadow;
      mote.shadowBlur = 5;
    }
  } else if (visual.motif === "plant") {
    for (let i = 0; i < 4; i += 1) {
      const angle = i * Math.PI * 0.5 + timeMs * 0.001;
      const leaf = pushEllipse(calls, pool, x + Math.cos(angle) * 12 * scale, y + Math.sin(angle) * 8 * scale, 3.2 * scale, 6 * scale);
      leaf.fill = i % 2 ? visual.color : visual.accent;
      leaf.alpha = 0.82;
    }
  } else if (visual.motif === "aquatic") {
    for (let i = 0; i < 2; i += 1) line(x - 16 * scale, y + (9 + i * 5) * scale, x + 16 * scale, y + (7 + i * 5) * scale, i ? visual.accent : visual.color, 1.8);
  } else if (visual.motif === "sky") {
    line(x - 4 * scale, y - 8 * scale, x - 19 * scale, y - 16 * scale, visual.color, 2.2);
    line(x + 4 * scale, y - 8 * scale, x + 19 * scale, y - 16 * scale, visual.color, 2.2);
    const mote = pushCircle(calls, pool, x, y - 24 * scale + Math.sin(timeMs * 0.006) * 2, 2.6);
    mote.fill = visual.accent;
  } else if (visual.motif === "undead") {
    line(x - 12 * scale, y + 11 * scale, x + 12 * scale, y - 9 * scale, visual.accent, 1.7);
    line(x - 12 * scale, y - 9 * scale, x + 12 * scale, y + 11 * scale, visual.color, 1.7);
  } else if (visual.motif === "slime") {
    for (let i = 0; i < 3; i += 1) {
      const blob = pushCircle(calls, pool, x - 9 * scale + i * 9 * scale, y + 11 * scale + Math.sin(timeMs * 0.008 + i) * 1.2, 4.5 * scale);
      blob.fill = i === 1 ? visual.accent : visual.color;
      blob.alpha = 0.7;
    }
  }
}

function appendCreatureAccentCalls(npc: NpcEntity, visual: ExpandedCreatureVisual, timeMs: number, scale: number, calls: Renderable[], pool?: RenderFramePool) {
  const pulse = 0.5 + Math.sin(timeMs * 0.01 + npc.x) * 0.5;
  const ring = pushCircle(calls, pool, npc.x, npc.y, (npc.role === "boss" ? 31 : 20) * scale + pulse * 1.5);
  ring.stroke = visual.color;
  ring.lineWidth = 1.6;
  ring.shadowColor = visual.shadow;
  ring.shadowBlur = 7;
  appendCreatureMotifCalls(npc, visual, timeMs, scale, calls, pool);
  const x = npc.x + 17 * scale;
  const y = npc.y - 21 * scale + Math.sin(timeMs * 0.004 + npc.x) * 1.1;
  appendJobCueBaseCalls({ glyph: visual.glyph, fill: visual.color, shape: visual.shape, accent: visual.accent }, x, y, calls, pool);
  const text = pushText(calls, pool, visual.glyph, x, y + 0.4, "800 9px system-ui");
  text.align = "center";
  text.baseline = "middle";
  text.fill = "#151a11";
}

function appendJobCueCalls(npc: NpcEntity, images: ClientImages, timeMs: number, scale: number, calls: Renderable[], pool?: RenderFramePool) {
  const cue = npcJobCue(npc);
  if (!cue) return;
  const x = npc.x + 18 * scale;
  const y = npc.y - 22 * scale + Math.sin(timeMs * 0.004) * 1.2;
  const icon = cue.icon ? images[cue.icon] : undefined;
  appendJobCueBaseCalls(cue, x, y, calls, pool);
  if (icon) {
    pushSprite(calls, pool, icon, x - 6, y - 6, 12, 12);
  } else {
    const text = pushText(calls, pool, cue.glyph, x, y + 0.5, "800 10px system-ui");
    text.align = "center";
    text.baseline = "middle";
    text.fill = "#151a11";
  }
}

function hasCombatFlag(flags: string, flag: string) {
  let start = 0;
  while (start < flags.length) {
    const end = flags.indexOf("|", start);
    const partEnd = end === -1 ? flags.length : end;
    if (partEnd - start === flag.length && flags.startsWith(flag, start)) return true;
    if (end === -1) break;
    start = end + 1;
  }
  return false;
}

function combatFlagStacks(flags: string, prefix: string) {
  const marker = `${prefix}:`;
  let start = 0;
  while (start < flags.length) {
    const end = flags.indexOf("|", start);
    const partEnd = end === -1 ? flags.length : end;
    if (flags.startsWith(marker, start)) {
      let value = 0;
      for (let i = start + marker.length; i < partEnd; i += 1) {
        const digit = flags.charCodeAt(i) - 48;
        if (digit < 0 || digit > 9) break;
        value = value * 10 + digit;
      }
      return value;
    }
    if (end === -1) break;
    start = end + 1;
  }
  return 0;
}

function npcDebuffCues(npc: NpcEntity): NpcJobCue[] {
  npcDebuffCueScratch.length = 0;
  if (!isHostileNpc(npc)) return npcDebuffCueScratch;
  const flags = npc.combatFlags || "";
  const add = (cue: NpcJobCue) => {
    if (npcDebuffCueScratch.length < 4) npcDebuffCueScratch.push(cue);
  };
  const hex = combatFlagStacks(flags, "hex");
  const poison = combatFlagStacks(flags, "poison");
  if (hex > 0) add({ glyph: `H${hex}`, fill: "#c978ff", shape: "diamond", accent: "#fff3b8" });
  if (poison > 0) add({ glyph: `P${poison}`, fill: "#7ced62", shape: "triangle", accent: "#f4d36b" });
  if (hasCombatFlag(flags, "mortal") || hasCombatFlag(flags, "antiheal")) add({ glyph: "X", fill: "#ff7e68", shape: "square", accent: "#fff3b8" });
  if (hasCombatFlag(flags, "fractured")) add({ glyph: "F", fill: "#ffd36e", shape: "diamond", accent: "#151a11" });
  if (hasCombatFlag(flags, "weakened") || hasCombatFlag(flags, "enfeebled")) add({ glyph: "W", fill: "#9bd6ff", shape: "circle", accent: "#ffffff" });
  if ((npc.slowMs ?? 0) > 0) add({ glyph: "S", fill: "#8be7ff", shape: "circle", accent: "#15253a" });
  if (hasCombatFlag(flags, "blind")) add({ glyph: "B", fill: "#d8ded0", shape: "square", accent: "#151a11" });
  if (hasCombatFlag(flags, "deathmark")) add({ glyph: "D", fill: "#ff8b7a", shape: "diamond", accent: "#ffffff" });
  if (hasCombatFlag(flags, "soulbound")) add({ glyph: "L", fill: "#d49be7", shape: "circle", accent: "#6de2ff" });
  return npcDebuffCueScratch;
}

function appendDebuffCueCalls(npc: NpcEntity, calls: Renderable[], pool?: RenderFramePool) {
  const cues = npcDebuffCues(npc);
  if (!cues.length) return;
  const y = npc.y - (npc.role === "boss" ? 74 : 48);
  const startX = npc.x - ((cues.length - 1) * 7);
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index]!;
    const x = startX + index * 14;
    appendJobCueBaseCalls(cue, x, y, calls, pool);
    const text = pushText(calls, pool, cue.glyph, x, y + 0.5, "800 9px system-ui");
    text.align = "center";
    text.baseline = "middle";
    text.fill = "#151a11";
  }
}

function marker(kind: "available" | "active" | "ready"): QuestMarker {
  if (kind === "ready") return { glyph: "!", fill: "#f4d36b", stroke: "#ffffff", text: "#17140a" };
  if (kind === "active") return { glyph: "!", fill: "#687173", stroke: "#b8c0c3", text: "#edf2f4" };
  if (kind === "available") return { glyph: "?", fill: "#f4d36b", stroke: "#fff3b8", text: "#17140a" };
  return { glyph: "?", fill: "#f4d36b", stroke: "#fff3b8", text: "#17140a" };
}

const LOCAL_QUEST_IDS_BY_NPC_KIND: Record<string, readonly string[]> = {
  "elder-rowan": ["first-cut", "second-cut", "wolf-culling", "final-cut"],
  "foreman-iron-will": ["heavy-lifting"],
  "captain-marrow": ["lost-compass", "fast-travel-registered"],
  "contract-board": ["ashwood-hunt", "crag-patrol", "bazaar-sweep", "dungeon-writ", "first-arms-proving"],
  "master-kael": ["silent-sands"],
  "cursed-statue": ["cursed-statue"],
  "blacksmith": ["iron-chest", "ring-focus"],
  "blacksmith-silas": ["iron-chest", "ring-focus"],
  "miller-finn": ["wolf-pelt-quota"],
  "scout-elara": ["root-of-the-problem"],
  "overseer-bale": ["great-starvation"],
  "geologist-mira": ["luminous-depths"],
  "high-arcanist-vael": ["forbidden-scripts", "seal-the-rift"],
  "alchemist-zora": ["void-resistance"]
};

const WORLD_QUEST_IDS_BY_NPC_KIND = (() => {
  const entries = new Map<string, string[]>();
  const add = (kind: string, questId: string) => {
    const list = entries.get(kind) ?? [];
    if (!list.includes(questId)) list.push(questId);
    entries.set(kind, list);
  };
  const npcKind = (npcId: string) => npcId.split(".").pop() || npcId;
  for (const step of worldFactionQuestSteps) {
    add(npcKind(step.npcId), step.id);
    for (const objective of step.objectives) {
      if (objective.kind === "talk") add(npcKind(objective.npcId), step.id);
      if (objective.kind === "deliver") add(npcKind(objective.recipientNpcId), step.id);
    }
  }
  return entries;
})();

export function questMarkerFor(npc: NpcEntity, player: PlayerEntity | undefined): QuestMarker | undefined {
  if (!player || !isSupportNpc(npc)) return undefined;
  const done = (questId: string) => hasQuestFlag(player, questId);
  const ready = (questId: string) => hasQuestFlag(player, `${questId}-ready`) && !done(questId);
  const active = (questId: string) => (player.activeQuestId === questId || hasQuestFlag(player, `${questId}-accepted`)) && !done(questId);
  const questMarker = (questId: string, available = true) => {
    if (done(questId)) return undefined;
    if (ready(questId)) return marker("ready");
    if (active(questId)) return marker("active");
    return available ? marker("available") : undefined;
  };
  const activeQuestIds = [...(LOCAL_QUEST_IDS_BY_NPC_KIND[npc.kind] ?? []), ...(WORLD_QUEST_IDS_BY_NPC_KIND.get(npc.kind) ?? [])];
  for (const questId of activeQuestIds) {
    if (ready(questId)) return marker("ready");
    if (active(questId)) return marker("active");
  }
  if (npc.kind === "elder-rowan") {
    return questMarker("first-cut") ?? questMarker("second-cut", done("first-cut")) ?? questMarker("wolf-culling", done("second-cut")) ?? questMarker("final-cut", done("wolf-culling"));
  } else if (npc.kind === "foreman-iron-will") {
    return questMarker("heavy-lifting", hasGearOrItem(player, "pickaxe") || player.gold >= 12);
  } else if (npc.kind === "captain-marrow") {
    if (done("final-cut") && !done("fast-travel-registered")) return marker("ready");
    if (!done("lost-compass")) return active("lost-compass") ? marker("active") : marker("available");
  } else if (npc.kind === "contract-board") {
    if (player.contractCooldownMs > 0) return undefined;
    const contract = contractInfo(player.contractId);
    return player.contractKills >= contract.targetKills ? marker("ready") : marker("active");
  } else if (npc.kind === "master-kael") {
    const silent = questMarker("silent-sands", player.zoneId === "bazaar" || player.bazaarSurvivalMs > 0);
    if (silent) return silent;
    if (!player.abilitySlots?.["q-knockback"]) return marker("available");
  } else if (npc.kind === "cursed-statue") {
    if (!hasInventoryItem(player, "cursed-idol") && player.hp > 40 && player.gold >= 15) return marker("available");
  } else if (npc.kind === "blacksmith" || npc.kind === "blacksmith-silas") {
    const canChest = !hasGearOrItem(player, "iron-chest") && itemQty(player, "iron-ore") >= 8 && player.gold >= 25;
    const canRing = !hasGearOrItem(player, "ring-focus") && itemQty(player, "silk-thread") >= 3 && player.gold >= 35;
    if (canChest || canRing) return marker("ready");
    if (!hasGearOrItem(player, "iron-chest") || !hasGearOrItem(player, "ring-focus")) return marker("active");
  } else if (npc.kind === "miller-finn") {
    if (!done("wolf-pelt-quota")) return player.wolfKills >= 10 ? marker("ready") : active("wolf-pelt-quota") ? marker("active") : marker("available");
  } else if (npc.kind === "scout-elara") {
    if (!done("root-of-the-problem")) return player.dungeonBossKills > 0 ? marker("ready") : active("root-of-the-problem") ? marker("active") : marker("available");
  } else if (npc.kind === "overseer-bale") {
    if (!done("great-starvation")) return bankQty(player, "ash-logs") >= 5 ? marker("ready") : active("great-starvation") ? marker("active") : marker("available");
  } else if (npc.kind === "geologist-mira") {
    if (!done("luminous-depths")) return bankQty(player, "iron-ore") >= 5 || itemQty(player, "iron-ore") >= 5 ? marker("ready") : active("luminous-depths") ? marker("active") : marker("available");
  } else if (npc.kind === "high-arcanist-vael") {
    if (!done("seal-the-rift")) return hasInventoryItem(player, "nature-core") && hasInventoryItem(player, "prism-shards") && hasInventoryItem(player, "ancient-scripts") ? marker("ready") : marker("available");
  } else if (npc.kind === "alchemist-zora") {
    if (!done("void-resistance")) return itemQty(player, "silk-thread") >= 3 && player.gold >= 20 ? marker("ready") : active("void-resistance") ? marker("active") : marker("available");
  }
  return undefined;
}

function appendQuestMarkerCalls(npc: NpcEntity, player: PlayerEntity | undefined, scale: number, calls: Renderable[], pool?: RenderFramePool) {
  const questMarker = questMarkerFor(npc, player);
  if (!questMarker) return;
  const x = npc.x + (npc.role === "boss" ? 30 : 18) * scale;
  const y = npc.y - (npc.role === "boss" ? 58 : 50) * scale;
  const markerCircle = pushCircle(calls, pool, x, y, 10);
  markerCircle.fill = questMarker.fill;
  markerCircle.stroke = questMarker.stroke;
  markerCircle.lineWidth = 2;
  const markerText = pushText(calls, pool, questMarker.glyph, x, y + 0.5, "800 14px system-ui");
  markerText.align = "center";
  markerText.baseline = "middle";
  markerText.fill = questMarker.text;
}

export function createNpcRenderCalls(npc: NpcEntity, images: ClientImages, player: PlayerEntity | undefined, timeMs: number, currentInteractable?: InteractableTarget, out: Renderable[] = [], pool?: RenderFramePool, impact?: ImpactActorVisual): Renderable[] {
  if (npc.hp <= 0) return out;
  const calls = pool ? pool.array() : [];
  const creatureVisual = expandedCreatureVisualFor(npc.kind);
  const bodyVisual = npcBodySize(npc);
  const drawScale = bodyVisual.scale;
  const baseX = impact?.x ?? npc.x;
  const baseY = impact?.y ?? npc.y;
  const shake = npc.castMs > 0 ? Math.sin(timeMs * 0.09 + npc.x) * (npc.role === "boss" ? 4 : 2.5) : 0;
  const stunBob = npc.stunMs > 0 ? Math.sin(timeMs * 0.025) * 1.5 : 0;
  const drawX = baseX + shake + (impact?.offsetX ?? 0);
  const drawY = baseY + stunBob + (impact?.offsetY ?? 0);
  const image = npcImage(images, npc);
  appendSupportFixtureCalls(npc, images, calls, pool);
  if (creatureVisual) appendCreatureAuraCalls(npc, creatureVisual, timeMs, drawScale, calls, pool);
  if (npc.kind === "power-node") {
    const node = pushCircle(calls, pool, drawX, drawY, 14 * drawScale);
    node.fill = npc.hp > 0 ? "#73e2ff" : "#263a44";
    node.stroke = "#f7f1ba";
    node.lineWidth = 2;
  } else if (npc.kind === "spore-pod") {
    const pod = pushCircle(calls, pool, drawX, drawY, 17 * drawScale);
    pod.fill = creatureVisual?.color ?? "#8fbf5e";
    pod.stroke = creatureVisual?.accent ?? "#f7f1ba";
    pod.lineWidth = 2;
  } else if (npc.kind === "glass-clone") {
    const points = pool ? pool.points(4) : [];
    points[0] = pooledPoint(pool, drawX, drawY - 20 * drawScale);
    points[1] = pooledPoint(pool, drawX + 15 * drawScale, drawY);
    points[2] = pooledPoint(pool, drawX, drawY + 20 * drawScale);
    points[3] = pooledPoint(pool, drawX - 15 * drawScale, drawY);
    const clone = pushPolygon(calls, pool, points);
    clone.fill = "rgba(185,156,255,0.48)";
    clone.stroke = "#f5f3ff";
    clone.lineWidth = 2;
  } else if (isDrawableImage(image)) {
    const frame = spriteSheetFrame(image, timeMs);
    const sprite = pushSprite(calls, pool, image, drawX, drawY - 30 * drawScale, bodyVisual.width, bodyVisual.height);
    sprite.anchor = "top";
    sprite.sourceX = frame?.sx;
    sprite.sourceY = frame?.sy;
    sprite.sourceWidth = frame?.sw;
    sprite.sourceHeight = frame?.sh;
  } else {
    const fallback = pushCircle(calls, pool, drawX, drawY, bodyVisual.radius);
    fallback.fill = creatureVisual?.fill ?? (npc.role === "boss" ? "#7f2f72" : npc.elite ? "#8d5f24" : "#8d2e24");
    fallback.stroke = creatureVisual?.color;
  }
  if (creatureVisual) appendCreatureAccentCalls(npc, creatureVisual, timeMs, drawScale, calls, pool);
  if (npc.castMs > 0) {
    const cast = pushCircle(calls, pool, npc.x, npc.y, (npc.role === "boss" ? 40 : 24) * drawScale + Math.sin(timeMs * 0.02) * 2 * drawScale);
    cast.stroke = "rgba(255,243,184,0.82)";
    cast.lineWidth = 2;
  }
  if (npc.stunMs > 0) {
    const stun = pushText(calls, pool, "*", npc.x, npc.y - 48 * drawScale, `800 ${npc.role === "boss" ? 22 : 16}px system-ui`);
    stun.align = "center";
    stun.fill = "#fff3b8";
    if (npc.role === "boss") {
      const pulse = 1 + Math.sin(timeMs * 0.012) * 0.035;
      const staggerRadius = Math.max(56, 56 * drawScale);
      const stagger = pushCircle(calls, pool, npc.x, npc.y, staggerRadius * pulse);
      stagger.stroke = "rgba(255,243,184,0.92)";
      stagger.lineWidth = 4;
      stagger.shadowColor = "rgba(255,179,107,0.82)";
      stagger.shadowBlur = 18;
      const inner = pushCircle(calls, pool, npc.x, npc.y, Math.max(42, 42 * drawScale) * (1 - (pulse - 1)));
      inner.stroke = "rgba(255,255,255,0.72)";
      inner.lineWidth = 2;
      const labelY = npc.y - bodyVisual.height * 0.78 - 16 * drawScale;
      const shadow = pushText(calls, pool, "STAGGER", npc.x, labelY, `900 ${Math.max(16, 18 * drawScale)}px system-ui`);
      shadow.align = "center";
      shadow.stroke = "rgba(0,0,0,0.78)";
      shadow.lineWidth = 4;
      shadow.fill = "rgba(0,0,0,0)";
      const label = pushText(calls, pool, "STAGGER", npc.x, labelY, `900 ${Math.max(16, 18 * drawScale)}px system-ui`);
      label.align = "center";
      label.fill = "#fff3b8";
    }
  }
  if (npc.kind === "sand-wraith" && npc.phaseMs > 2400 && npc.phaseMs < 3400) {
    const outline = pushOutline(calls, pool, npc.x - 20 * drawScale, npc.y - 28 * drawScale, 40 * drawScale, 50 * drawScale);
    outline.stroke = "rgba(208,196,255,0.72)";
    outline.dash = PHASE_OUTLINE_DASH;
  }
  if (npc.elite) {
    const elite = pushCircle(calls, pool, npc.x, npc.y, (npc.role === "boss" ? 32 : 21) * drawScale);
    elite.stroke = "#f4c14d";
    elite.lineWidth = 2;
  }
  appendJobCueCalls(npc, images, timeMs, drawScale, calls, pool);
  appendDebuffCueCalls(npc, calls, pool);
  if (isDefending(npc)) {
    const shield = pushCircle(calls, pool, npc.x, npc.y, (npc.role === "boss" ? 39 : 25) * drawScale);
    shield.stroke = "rgba(109, 226, 255, 0.86)";
    shield.lineWidth = 3;
    shield.shadowColor = "rgba(109, 226, 255, 0.9)";
    shield.shadowBlur = 12;
    for (let i = 0; i < 7; i += 1) {
      const angle = timeMs * 0.004 + i * 0.9;
      const mote = pushCircle(calls, pool, npc.x + Math.cos(angle) * 29 * drawScale, npc.y + Math.sin(angle) * 20 * drawScale, 2.5 * drawScale);
      mote.fill = "rgba(166, 237, 255, 0.9)";
    }
  }
  if (isBuffedPhase(npc)) {
    const buff = pushCircle(calls, pool, npc.x, npc.y, (npc.role === "boss" ? 46 : 30) * drawScale);
    buff.stroke = "rgba(255, 179, 107, 0.86)";
    buff.lineWidth = 2;
    buff.shadowColor = "rgba(255, 111, 79, 0.82)";
    buff.shadowBlur = 10;
    for (let i = 0; i < 5; i += 1) {
      const angle = -timeMs * 0.005 + i * 1.25;
      const ember = pushCircle(calls, pool, npc.x + Math.cos(angle) * 25 * drawScale, npc.y + Math.sin(angle) * 17 * drawScale, 2.2 * drawScale);
      ember.fill = "rgba(255, 211, 106, 0.92)";
    }
  }
  if (currentInteractable?.type === "npc" && currentInteractable.id === npc.id) {
    const outline = pushOutline(calls, pool, npc.x - bodyVisual.width * 0.56, npc.y + 2 - bodyVisual.height * 0.62, bodyVisual.width * 1.12, bodyVisual.height * 0.98);
    outline.shape = "ellipse";
    outline.stroke = "#ffffff";
    outline.lineWidth = 2;
  }
  const hp = renderRecord(pool, "bar");
  hp.x = npc.x - bodyVisual.width * 0.5;
  hp.y = npc.y - bodyVisual.height * 0.65;
  hp.width = bodyVisual.width;
  hp.height = 4;
  hp.value = npc.hp;
  hp.max = npc.maxHp;
  hp.background = "rgba(0,0,0,0.55)";
  hp.fill = npc.role === "boss-node" ? "#73e2ff" : "#ef6f4f";
  calls.push(renderableRecord(hp));
  if (shouldDrawActorLabel(npc, player, currentInteractable)) {
    const label = pushText(calls, pool, labelize(npc.kind), npc.x, npc.y - bodyVisual.height * 0.68, "11px system-ui");
    label.align = "center";
    label.fill = npc.role === "boss" ? "#ffc0f0" : npc.elite ? "#ffd56a" : isSupportNpc(npc) ? "#bde7ff" : "#f5e8d0";
  }
  appendQuestMarkerCalls(npc, player, drawScale, calls, pool);
  const group = renderRecord(pool, "group");
  group.id = npc.id;
  group.x = npc.x;
  group.y = npc.y;
  group.ySort = npc.y;
  group.calls = calls;
  out.push(renderableRecord(group));
  return out;
}
