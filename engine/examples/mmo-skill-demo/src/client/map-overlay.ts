import { canvasPointFromClient, GameMap, type MapMarker, type MapRoute, type ZoneLabel } from "@hyperfocus/engine";
import { createHtmlTooltip, createHtmlTooltipOutlet, type HtmlTooltip } from "@hyperfocus/engine/ui";
import { factionZoneVisuals } from "../data/assets.ts";
import type { FactionVisualId } from "../data/world-landmarks.ts";
import { currentUtcDateString, dailyQuestArcForDate } from "../data/daily-quests.ts";
import { worldGatherableNodeSpecs, worldGatherableNodeSpecsById, type WorldGatherableNodeSpec } from "../data/world-gatherables.ts";
import {
  authoredZoneForMmoSkillDemoTile,
  MAP_HEIGHT,
  MAP_WIDTH,
  mmoSkillDemoRegionConfig,
  type RegionZoneId,
  resolveRegionAnchors,
  TILE_BANK,
  TILE_ORE,
  TILE_PATH,
  TILE_ROCK,
  TILE_TREE,
  TILE_WATER
} from "../data/world.ts";
import { getGatherableMaterialById } from "../shared/materials.ts";
import type { LootEntity, MmoSkillDemoState, NpcEntity, PlayerEntity, ResourceEntity } from "../shared.ts";
import { TILE } from "./world.ts";

export type MapOverlayView = {
  minimapOpen: boolean;
  worldMapOpen: boolean;
};

type CanvasInputEvent = MouseEvent | PointerEvent | WheelEvent;
type RegionalPoint = { x: number; y: number };
export type MapFilterId = "gatherables";
export type MapFilterState = Record<MapFilterId, boolean>;
export type MapNodeTooltipInfo = { title: string; lines: string[] };
type HoverMapMarker = MapMarker & { tooltip?: MapNodeTooltipInfo; hoverRadius?: number };
type LegendItem = { iconId?: string; color?: string; label: string; description: string; filterId?: MapFilterId };
type MinimapControlId = "resetZoom" | "zoomIn" | "zoomOut" | "toggleGatherables";
type MinimapLayout = { x: number; y: number; size: number };
type SmoothWorldZoom = { targetZoom: number; x: number; y: number };
type MapHoverFrame = { map: GameMap; markers: readonly HoverMapMarker[] };
type BiomePaint = {
  base: string;
  wash: string;
  light: string;
  shade: string;
  ink: string;
  route: string;
};
type ObjectiveMarkerKind = "main" | "side" | "event";
type MapPerfExperiment =
  | "control"
  | "coarse-minimap-terrain"
  | "cache-minimap-markers"
  | "skip-minimap-routes"
  | "coarse-world-terrain"
  | "world-terrain-texture"
  | "no-world-route-dup"
  | "compact-world-labels"
  | "combined";

const REGIONAL_TILE_X = 2;
const REGIONAL_TILE_Y = 18;
const REGIONAL_DRAW_STEP = 4;
const REGIONAL_WIDTH = MAP_WIDTH * REGIONAL_TILE_X;
const REGIONAL_HEIGHT = MAP_HEIGHT * REGIONAL_TILE_Y;
const MINIMAP_MIN_ZOOM = 0.06;
const MINIMAP_MAX_ZOOM = 0.16;
const WORLD_MAP_MIN_ZOOM = 0.16;
const WORLD_MAP_MAX_ZOOM = 1.2;
const SUPPORT_NPC_ROLES = new Set(["quest", "trainer", "bank", "merchant", "travel", "contract", "crafting", "home", "hidden"]);
const ANCHORS = resolveRegionAnchors();
const ANCHOR_BY_ID = new Map(ANCHORS.map((anchor) => [anchor.id, anchor]));
const ZONE_LABEL_BY_ID = new Map(mmoSkillDemoRegionConfig.zones.map((zone) => [zone.id, zone.label] as const));
const QUEST_ANCHOR_BY_ID = new Map(mmoSkillDemoRegionConfig.quests.map((quest) => [quest.id, quest.anchorId]));
const WORLD_EVENT_ANCHOR_BY_ID: Record<string, string> = {
  "ashwood-pack": "oakhaven",
  "outcast-hunt": "ashwood-glade",
  "crag-supply": "ironcrag",
  "holy-purge": "aetheria",
  "bazaar-breach": "sunken-bazaar",
  "rift-containment": "void-rift",
  "wind-trial": "high-reach-peaks",
  "dungeon-surge": "sunken-spire",
  "cottage-restock": "oakhaven"
};
const EVENT_ANCHOR_BY_ZONE: Partial<Record<RegionZoneId, string>> = {
  ashwood: "oakhaven",
  crags: "ironcrag",
  "port-marrow": "port-marrow",
  "holy-reach": "aetheria",
  "canaan-desert": "sunken-bazaar",
  "void-rift": "void-rift",
  "ashwood-wilderness": "ashwood-glade",
  "whisperwind-ascent": "high-reach-peaks",
  bazaar: "sunken-bazaar",
  dungeon: "sunken-spire",
  cottage: "oakhaven"
};
const ROUTE_PAIRS = [
  ["ironcrag", "deep-fissure"],
  ["deep-fissure", "oakhaven"],
  ["oakhaven", "overgrown-thicket"],
  ["oakhaven", "ashwood-glade"],
  ["oakhaven", "aetheria"],
  ["aetheria", "port-marrow"],
  ["aetheria", "high-reach-peaks"],
  ["port-marrow", "sunken-bazaar"],
  ["sunken-bazaar", "sunken-spire"],
  ["aetheria", "sunken-spire"],
  ["sunken-spire", "void-rift"],
  ["void-rift", "obsidian-sanctum"]
] as const;
const BIOME_PAINT: Record<RegionZoneId, BiomePaint> = {
  ashwood: { base: "#386b3a", wash: "rgba(91, 151, 76, 0.46)", light: "#7fb96f", shade: "#1f4b2e", ink: "rgba(24, 50, 31, 0.5)", route: "#c5a766" },
  crags: { base: "#61594a", wash: "rgba(151, 91, 52, 0.44)", light: "#b88954", shade: "#3d352e", ink: "rgba(45, 26, 22, 0.52)", route: "#d7a35d" },
  "port-marrow": { base: "#2d6a70", wash: "rgba(54, 138, 151, 0.44)", light: "#7bbfc2", shade: "#1f4655", ink: "rgba(22, 53, 66, 0.54)", route: "#d8bc80" },
  "holy-reach": { base: "#8c876d", wash: "rgba(223, 213, 160, 0.5)", light: "#efe5b2", shade: "#6b6959", ink: "rgba(86, 78, 54, 0.48)", route: "#f2d885" },
  "canaan-desert": { base: "#aa8950", wash: "rgba(210, 169, 91, 0.5)", light: "#e2c47c", shade: "#765b35", ink: "rgba(102, 74, 36, 0.5)", route: "#f0c574" },
  "void-rift": { base: "#3b314d", wash: "rgba(92, 59, 139, 0.5)", light: "#8b6ec6", shade: "#171b2f", ink: "rgba(30, 21, 47, 0.6)", route: "#d49be7" },
  "ashwood-wilderness": { base: "#244f2f", wash: "rgba(38, 111, 57, 0.48)", light: "#5e9f58", shade: "#152e20", ink: "rgba(13, 39, 23, 0.62)", route: "#a88954" },
  "whisperwind-ascent": { base: "#6f7f83", wash: "rgba(168, 196, 190, 0.48)", light: "#c9d8d0", shade: "#465866", ink: "rgba(52, 69, 82, 0.46)", route: "#d9e5d7" },
  dungeon: { base: "#484954", wash: "rgba(87, 92, 110, 0.5)", light: "#9da1b0", shade: "#282b36", ink: "rgba(24, 27, 36, 0.58)", route: "#d9dbe5" },
  cottage: { base: "#6c6a42", wash: "rgba(148, 137, 72, 0.5)", light: "#c0b872", shade: "#424126", ink: "rgba(45, 44, 26, 0.48)", route: "#d7c873" },
  bazaar: { base: "#aa8950", wash: "rgba(210, 169, 91, 0.5)", light: "#e2c47c", shade: "#765b35", ink: "rgba(102, 74, 36, 0.5)", route: "#f0c574" }
};
const ROUTE_STYLES = [
  { color: "#f4d184", shadow: "rgba(93, 62, 33, 0.52)", dash: [1, 10] as const },
  { color: "#9de5c0", shadow: "rgba(25, 75, 58, 0.45)", dash: [12, 8] as const },
  { color: "#ffb873", shadow: "rgba(96, 54, 31, 0.5)", dash: [5, 8] as const }
] as const;
const LEGEND_ITEMS: LegendItem[] = [
  { color: "#ffd56b", label: "Town Anchor", description: "Major settlement or faction hub." },
  { color: "#d9dbe5", label: "Dungeon", description: "Instance entrance or dangerous interior route." },
  { color: "#d49be7", label: "World Boss", description: "Endgame threat or Void route anchor." },
  { color: "#f4d36b", label: "Main Quest", description: "Current story or progression destination." },
  { color: "#78d6b4", label: "Daily Side Quest", description: "Daily task destination for today's route." },
  { color: "#ff8f6b", label: "World Event", description: "Timed regional pressure or public objective." },
  { color: "#6de2ff", label: "Travel NPC", description: "Captain, navigator, runner, gate, or escort service." },
  { color: "#7ed66d", label: "Gatherable Node", description: "Harvestable resource; checkbox toggles resource markers.", filterId: "gatherables" },
  { color: "#f4d36b", label: "Player", description: "Your current position and facing." }
];
const DEFAULT_MAP_FILTERS = { gatherables: true } satisfies MapFilterState;
const WORLD_LEGEND_STYLE = {
  panelFill: "rgba(7, 14, 18, 0.86)",
  panelStroke: "rgba(244, 211, 107, 0.62)",
  textColor: "#f5f3e8",
  font: "700 11px system-ui",
  rowHeight: 20,
  padding: 10,
  glyphSize: 9
} as const;
const MAP_PERF_EXPERIMENTS = new Set<MapPerfExperiment>([
  "control",
  "coarse-minimap-terrain",
  "cache-minimap-markers",
  "skip-minimap-routes",
  "coarse-world-terrain",
  "world-terrain-texture",
  "no-world-route-dup",
  "compact-world-labels",
  "combined"
]);
const COMBINED_MAP_PERF_EXPERIMENTS = new Set<MapPerfExperiment>([
  "coarse-minimap-terrain",
  "cache-minimap-markers",
  "skip-minimap-routes",
  "coarse-world-terrain",
  "world-terrain-texture",
  "no-world-route-dup"
]);

function activeMapPerfExperiment(): MapPerfExperiment {
  const value = (globalThis as unknown as { __mmoSkillDemoMapPerfExperiment?: string }).__mmoSkillDemoMapPerfExperiment;
  return MAP_PERF_EXPERIMENTS.has(value as MapPerfExperiment) ? value as MapPerfExperiment : "combined";
}

function mapExperimentEnabled(experiment: Exclude<MapPerfExperiment, "control" | "combined">) {
  const active = activeMapPerfExperiment();
  return active === experiment || (active === "combined" && COMBINED_MAP_PERF_EXPERIMENTS.has(experiment));
}

export function createDefaultMapFilterState(): MapFilterState {
  return { ...DEFAULT_MAP_FILTERS };
}

export function toggleMapFilter(filters: MapFilterState, filterId: MapFilterId): boolean {
  filters[filterId] = !filters[filterId];
  return filters[filterId];
}

export function mapFilterSignature(filters: MapFilterState): string {
  return `gatherables:${filters.gatherables ? 1 : 0}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function labelize(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function upperLabel(value: string) {
  return labelize(value).toUpperCase();
}

function zoneLabel(value: string) {
  return ZONE_LABEL_BY_ID.get(value as RegionZoneId) ?? labelize(value);
}

function entityName(entity: { name?: string; kind?: string; id: string }) {
  return entity.name || (entity.kind ? labelize(entity.kind) : labelize(entity.id));
}

function itemAmountLine(amount: number | undefined) {
  return `Amount ${Math.max(1, Math.floor(amount ?? 1))}`;
}

function regionVisualIdForTile(tileX: number, tileY: number): FactionVisualId {
  const zone = authoredZoneForMmoSkillDemoTile(tileX, tileY);
  switch (zone) {
    case "crags":
      return "ironcrag";
    case "holy-reach":
      return "aetheria";
    case "port-marrow":
      return "port-marrow";
    case "canaan-desert":
      return "sunken-bazaar";
    case "void-rift":
      return "obsidian-sanctum";
    case "ashwood-wilderness":
      return "ashwood-glade";
    case "whisperwind-ascent":
      return "high-reach-peaks";
    case "ashwood":
    default:
      return "oakhaven";
  }
}

function worldToRegional(worldX: number, worldY: number): RegionalPoint {
  return {
    x: worldX / TILE * REGIONAL_TILE_X,
    y: worldY / TILE * REGIONAL_TILE_Y
  };
}

function anchorRegionalPoint(anchorId: string): RegionalPoint {
  const anchor = ANCHOR_BY_ID.get(anchorId);
  if (!anchor) return { x: 0, y: 0 };
  return {
    x: (anchor.tileX + 0.5) * REGIONAL_TILE_X,
    y: (anchor.tileY + 0.5) * REGIONAL_TILE_Y
  };
}

function anchorWorldPoint(anchorId: string): RegionalPoint {
  const anchor = ANCHOR_BY_ID.get(anchorId);
  if (!anchor) return { x: 0, y: 0 };
  return {
    x: (anchor.tileX + 0.5) * TILE,
    y: (anchor.tileY + 0.5) * TILE
  };
}

function playerHeading(player: PlayerEntity | undefined) {
  if (!player) return 0;
  const dx = (player.aimX ?? player.x) - player.x;
  const dy = (player.aimY ?? player.y) - player.y;
  return Math.hypot(dx, dy) > 0.1 ? Math.atan2(dy, dx) : 0;
}

function canvasPoint(canvas: HTMLCanvasElement, event: CanvasInputEvent) {
  return canvasPointFromClient(canvas, event.clientX, event.clientY);
}

function tooltipSignature(info: MapNodeTooltipInfo) {
  return `${info.title}\n${info.lines.join("\n")}`;
}

function createMapTooltip(canvas: HTMLCanvasElement) {
  const doc = canvas.ownerDocument;
  if (!doc?.body) {
    return {
      show: (_event: MouseEvent | PointerEvent, _info: MapNodeTooltipInfo) => {},
      close: () => {}
    };
  }

  const anchor = doc.createElement("span");
  anchor.setAttribute("aria-hidden", "true");
  anchor.style.position = "fixed";
  anchor.style.left = "0";
  anchor.style.top = "0";
  anchor.style.width = "1px";
  anchor.style.height = "1px";
  anchor.style.pointerEvents = "none";
  anchor.style.zIndex = "1100";
  doc.body.appendChild(anchor);

  const outlet = createHtmlTooltipOutlet({
    document: doc,
    theme: {
      surface: "rgba(8, 13, 13, 0.94)",
      border: "rgba(244, 211, 107, 0.68)",
      text: "#fff2b7",
      muted: "#dfe6ca",
      maxWidth: "230px",
      zIndex: 1100
    }
  });
  const tooltip: HtmlTooltip = createHtmlTooltip({
    document: doc,
    target: anchor,
    outlet,
    trigger: "manual",
    placement: "top",
    offset: 10,
    showDelayMs: 0,
    hideDelayMs: 0,
    clampToViewport: true
  });
  let openSignature = "";

  return {
    show(event: MouseEvent | PointerEvent, info: MapNodeTooltipInfo) {
      anchor.style.left = `${Math.round(event.clientX)}px`;
      anchor.style.top = `${Math.round(event.clientY - 8)}px`;
      const nextSignature = tooltipSignature(info);
      if (nextSignature !== openSignature) {
        tooltip.setTitle(info.title);
        tooltip.setContent(info.lines);
        openSignature = nextSignature;
      }
      tooltip.open({ target: anchor });
    },
    close() {
      openSignature = "";
      tooltip.close();
    }
  };
}

function mapMarkerAt(frame: MapHoverFrame | undefined, point: RegionalPoint): MapNodeTooltipInfo | undefined {
  if (!frame) return undefined;
  let best: { info: MapNodeTooltipInfo; distance: number } | undefined;
  for (const marker of frame.markers) {
    if (!marker.tooltip) continue;
    const mapPoint = frame.map.worldToMapSpace(marker.worldX, marker.worldY);
    if (mapPoint.offMap) continue;
    const radius = marker.hoverRadius ?? 12;
    const distance = Math.hypot(point.x - mapPoint.x, point.y - mapPoint.y);
    if (distance > radius || (best && distance >= best.distance)) continue;
    best = { info: marker.tooltip, distance };
  }
  return best?.info;
}

function tileAt(tiles: readonly number[], tileX: number, tileY: number) {
  if (tileX < 0 || tileY < 0 || tileX >= MAP_WIDTH || tileY >= MAP_HEIGHT) return TILE_WATER;
  return tiles[tileY * MAP_WIDTH + tileX] ?? TILE_WATER;
}

function biomePaintForTile(tileX: number, tileY: number): BiomePaint {
  return BIOME_PAINT[authoredZoneForMmoSkillDemoTile(tileX, tileY)];
}

function tileNoise(tileX: number, tileY: number, salt: number) {
  const value = Math.sin(tileX * 12.9898 + tileY * 78.233 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function terrainColor(tile: number, tileX: number, tileY: number, compact: boolean) {
  const paint = biomePaintForTile(tileX, tileY);
  if (tile === TILE_WATER) return compact ? "#1b6470" : "#2d8c9a";
  if (tile === TILE_PATH) return compact ? "#b8975c" : paint.route;
  if (tile === TILE_BANK) return compact ? paint.light : "#f1d37b";
  if (tile === TILE_TREE) return compact ? paint.shade : "#315e36";
  if (tile === TILE_ORE || tile === TILE_ROCK) return compact ? "#6b6e6a" : "#8d887b";
  return compact ? paint.base : paint.wash;
}

function shortAnchorLabel(value: string) {
  return value.replace(/\s*\(.+\)\s*$/, "");
}

function eventAnchorId(state: MmoSkillDemoState): string | undefined {
  return WORLD_EVENT_ANCHOR_BY_ID[state.worldEventId] ?? EVENT_ANCHOR_BY_ZONE[state.worldEventZoneId];
}

function activeQuestAnchorId(player: PlayerEntity | undefined): string | undefined {
  if (!player) return undefined;
  const activeAnchor = QUEST_ANCHOR_BY_ID.get(player.activeQuestId);
  if (activeAnchor && !player.questFlags[player.activeQuestId]) return activeAnchor;
  for (const quest of mmoSkillDemoRegionConfig.quests) {
    if (player.questFlags[`${quest.id}-ready`] && !player.questFlags[quest.id]) return quest.anchorId;
    if (player.questFlags[`${quest.id}-accepted`] && !player.questFlags[quest.id]) return quest.anchorId;
  }
  return activeAnchor;
}

function dailyQuestAnchorId(player: PlayerEntity | undefined): string | undefined {
  if (!player || player.dailyQuestCompleted) return undefined;
  const arc = dailyQuestArcForDate(player.dailyQuestDate || currentUtcDateString());
  return arc.steps[player.dailyQuestStep || 0]?.anchorId;
}

function routeStyle(index: number) {
  return ROUTE_STYLES[index % ROUTE_STYLES.length];
}

function routeControlPoints(from: RegionalPoint, to: RegionalPoint, index: number, bendScale: number): RegionalPoint[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const bend = ((index % 2 === 0 ? 1 : -1) * Math.min(100 * bendScale, length * 0.16));
  const mid = {
    x: (from.x + to.x) * 0.5 - dy / length * bend,
    y: (from.y + to.y) * 0.5 + dx / length * bend
  };
  return [from, mid, to];
}

function traceCurvedPath(ctx: CanvasRenderingContext2D, points: readonly RegionalPoint[]) {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
    return;
  }
  for (let index = 1; index < points.length - 1; index += 1) {
    const control = points[index];
    const next = points[index + 1];
    ctx.quadraticCurveTo(control.x, control.y, next.x, next.y);
  }
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, fill: string, stroke = "rgba(16, 12, 4, 0.86)") {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI * 0.5 + index * Math.PI / 5;
    const currentRadius = index % 2 === 0 ? radius : radius * 0.44;
    const px = Math.cos(angle) * currentRadius;
    const py = Math.sin(angle) * currentRadius;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, fill: string) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = "rgba(8, 17, 14, 0.88)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + radius, y);
  ctx.lineTo(x, y + radius);
  ctx.lineTo(x - radius, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawLabelBadge(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, fill = "rgba(8, 13, 13, 0.82)", color = "#f5f3e8") {
  ctx.save();
  ctx.font = "800 10px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const width = Math.min(138, Math.max(42, ctx.measureText(text).width + 12));
  ctx.fillStyle = fill;
  ctx.strokeStyle = "rgba(244, 211, 107, 0.45)";
  ctx.lineWidth = 1;
  ctx.fillRect(x - width * 0.5, y - 8, width, 16);
  ctx.strokeRect(x - width * 0.5 + 0.5, y - 7.5, width - 1, 15);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y, width - 8);
  ctx.restore();
}

function drawRouteMarker(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, glyph: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.beginPath();
  ctx.ellipse(0, 10, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#0f2530";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.lineTo(0, -18);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(255, 244, 190, 0.9)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(24, -10);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff2b7";
  ctx.font = "800 13px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, 10, -9);
  ctx.restore();
}

function drawPlayerMarker(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, large = false) {
  const size = large ? 18 : 11;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading + Math.PI * 0.5);
  ctx.fillStyle = "#f4d36b";
  ctx.strokeStyle = "rgba(7, 12, 16, 0.92)";
  ctx.lineWidth = large ? 2.5 : 2;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.72, size * 0.72);
  ctx.lineTo(0, size * 0.32);
  ctx.lineTo(-size * 0.72, size * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, radius = 5, glyph = "") {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(9, 12, 10, 0.82)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (glyph) {
    ctx.fillStyle = "#10140f";
    ctx.font = `800 ${Math.max(8, radius + 3)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(glyph, x, y + 0.5);
  }
  ctx.restore();
}

function drawCheckBox(ctx: CanvasRenderingContext2D, x: number, y: number, checked: boolean) {
  ctx.save();
  ctx.strokeStyle = checked ? "#7ed66d" : "rgba(245, 243, 232, 0.52)";
  ctx.fillStyle = checked ? "rgba(39, 82, 43, 0.72)" : "rgba(7, 12, 12, 0.72)";
  ctx.lineWidth = 1.5;
  ctx.fillRect(x, y - 6, 12, 12);
  ctx.strokeRect(x + 0.5, y - 5.5, 11, 11);
  if (checked) {
    ctx.strokeStyle = "#f5f3e8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 3, y);
    ctx.lineTo(x + 5.4, y + 3);
    ctx.lineTo(x + 9.4, y - 3.6);
    ctx.stroke();
  }
  ctx.restore();
}

function worldLegendLayout(canvas: HTMLCanvasElement) {
  return {
    x: Math.max(36, canvas.width - 326),
    y: Math.max(96, canvas.height - 232),
    w: 290,
    h: 184
  };
}

function worldLegendMetrics(layout: ReturnType<typeof worldLegendLayout>) {
  const padding = WORLD_LEGEND_STYLE.padding;
  const rowHeight = WORLD_LEGEND_STYLE.rowHeight;
  const rowsPerColumn = Math.max(1, Math.floor((layout.h - padding * 2) / rowHeight));
  const columns = Math.max(1, Math.ceil(LEGEND_ITEMS.length / rowsPerColumn));
  const colWidth = (layout.w - padding * 2) / columns;
  return { padding, rowHeight, rowsPerColumn, colWidth };
}

function worldLegendItemRect(layout: ReturnType<typeof worldLegendLayout>, index: number) {
  const { padding, rowHeight, rowsPerColumn, colWidth } = worldLegendMetrics(layout);
  const column = Math.floor(index / rowsPerColumn);
  const row = index % rowsPerColumn;
  const x = layout.x + padding + column * colWidth;
  const y = layout.y + padding + row * rowHeight;
  return { x, y, w: colWidth, h: rowHeight };
}

function pointInsideRect(rect: { x: number; y: number; w: number; h: number }, point: RegionalPoint) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

function worldLegendFilterAt(layout: ReturnType<typeof worldLegendLayout>, point: RegionalPoint): MapFilterId | undefined {
  for (let index = 0; index < LEGEND_ITEMS.length; index += 1) {
    const filterId = LEGEND_ITEMS[index]?.filterId;
    if (!filterId) continue;
    if (pointInsideRect(worldLegendItemRect(layout, index), point)) return filterId;
  }
  return undefined;
}

function legendItemAt(layout: ReturnType<typeof worldLegendLayout>, point: RegionalPoint): LegendItem | undefined {
  for (let index = 0; index < LEGEND_ITEMS.length; index += 1) {
    if (pointInsideRect(worldLegendItemRect(layout, index), point)) return LEGEND_ITEMS[index];
  }
  return undefined;
}

function legendTooltip(item: LegendItem): MapNodeTooltipInfo {
  return {
    title: item.label,
    lines: [item.description, item.filterId ? "Click row to toggle this category." : "Map symbol category."]
  };
}

function drawWorldMapLegend(ctx: CanvasRenderingContext2D, layout: ReturnType<typeof worldLegendLayout>, filters: MapFilterState): void {
  ctx.save();
  try {
    ctx.fillStyle = WORLD_LEGEND_STYLE.panelFill;
    ctx.strokeStyle = WORLD_LEGEND_STYLE.panelStroke;
    ctx.lineWidth = 1;
    ctx.fillRect(layout.x, layout.y, layout.w, layout.h);
    ctx.strokeRect(layout.x + 0.5, layout.y + 0.5, layout.w - 1, layout.h - 1);
    ctx.font = WORLD_LEGEND_STYLE.font;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    for (let index = 0; index < LEGEND_ITEMS.length; index += 1) {
      const item = LEGEND_ITEMS[index]!;
      const rect = worldLegendItemRect(layout, index);
      const y = rect.y + rect.h * 0.5;
      const active = !item.filterId || filters[item.filterId];
      const checkboxOffset = item.filterId ? 18 : 0;
      if (item.filterId) drawCheckBox(ctx, rect.x, y, active);
      ctx.globalAlpha = active ? 1 : 0.42;
      drawDot(ctx, rect.x + checkboxOffset + WORLD_LEGEND_STYLE.glyphSize * 0.5, y, item.color ?? "#f5f3e8", WORLD_LEGEND_STYLE.glyphSize * 0.5);
      ctx.fillStyle = WORLD_LEGEND_STYLE.textColor;
      ctx.fillText(item.label, rect.x + checkboxOffset + WORLD_LEGEND_STYLE.glyphSize + 8, y, Math.max(20, rect.w - checkboxOffset - WORLD_LEGEND_STYLE.glyphSize - 12));
      ctx.globalAlpha = 1;
    }
  } finally {
    ctx.restore();
  }
}

function drawMinimapLegend(ctx: CanvasRenderingContext2D, layout: MinimapLayout, filters: MapFilterState) {
  const items = minimapLegendItems();
  const x = layout.x - 2;
  const y = layout.y + layout.size + 18;
  const w = layout.size + 4;
  const h = 56;
  ctx.save();
  ctx.fillStyle = "rgba(7, 12, 12, 0.78)";
  ctx.strokeStyle = "rgba(244, 211, 107, 0.48)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.font = "800 9px system-ui";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const col = index % 2;
    const row = Math.floor(index / 2);
    const rowX = x + 8 + col * (w * 0.5);
    const rowY = y + 10 + row * 16;
    const active = !item.filterId || filters[item.filterId];
    ctx.globalAlpha = active ? 1 : 0.42;
    drawDot(ctx, rowX, rowY, item.color ?? "#f5f3e8", 4);
    ctx.fillStyle = WORLD_LEGEND_STYLE.textColor;
    ctx.fillText(item.label.replace(" Anchor", "").replace(" Node", ""), rowX + 8, rowY, w * 0.5 - 18);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function minimapLegendItems() {
  return LEGEND_ITEMS.filter((item) => ["Town Anchor", "Dungeon", "Main Quest", "Travel NPC", "Gatherable Node", "Player"].includes(item.label));
}

function minimapLegendItemRect(layout: MinimapLayout, index: number) {
  const x = layout.x - 2;
  const y = layout.y + layout.size + 18;
  const w = layout.size + 4;
  const col = index % 2;
  const row = Math.floor(index / 2);
  return { x: x + col * (w * 0.5), y: y + row * 16, w: w * 0.5, h: 16 };
}

function minimapLegendItemAt(layout: MinimapLayout, point: RegionalPoint): LegendItem | undefined {
  const items = minimapLegendItems();
  for (let index = 0; index < items.length; index += 1) {
    if (pointInsideRect(minimapLegendItemRect(layout, index), point)) return items[index];
  }
  return undefined;
}

function landmarkGlyph(anchor: (typeof ANCHORS)[number]) {
  if (anchor.kind === "dungeon") return "D";
  if (anchor.kind === "endgame") return "V";
  switch (anchor.id) {
    case "oakhaven":
      return "O";
    case "ironcrag":
      return "I";
    case "aetheria":
      return "A";
    case "port-marrow":
      return "P";
    case "ashwood-glade":
      return "G";
    case "high-reach-peaks":
      return "H";
    case "sunken-bazaar":
      return "B";
    default:
      return "L";
  }
}

function drawLandmarkIcon(ctx: CanvasRenderingContext2D, x: number, y: number, anchor: (typeof ANCHORS)[number], color: string, label = true) {
  const isDungeon = anchor.kind === "dungeon" || Boolean(anchor.instanceId);
  const isBoss = anchor.kind === "endgame";
  const radius = isBoss ? 13 : isDungeon ? 11 : 10;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
  ctx.beginPath();
  ctx.ellipse(0, radius + 7, radius * 0.95, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (isBoss) {
    ctx.fillStyle = "rgba(39, 20, 54, 0.94)";
    ctx.strokeStyle = "#d49be7";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const angle = Math.PI / 6 + index * Math.PI / 3;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (isDungeon) {
    ctx.fillStyle = "rgba(17, 20, 27, 0.94)";
    ctx.strokeStyle = "#d9dbe5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.lineTo(radius, 0);
    ctx.lineTo(0, radius);
    ctx.lineTo(-radius, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillStyle = "rgba(20, 27, 18, 0.95)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 241, 179, 0.38)";
    ctx.beginPath();
    ctx.arc(0, 0, radius + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = isBoss ? "#f8d6ff" : isDungeon ? "#f5f3e8" : "#fff2b7";
  ctx.font = "900 11px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(landmarkGlyph(anchor), 0, 0.5);
  ctx.restore();
  if (label) drawLabelBadge(ctx, x, y + radius + 18, shortAnchorLabel(anchor.label), "rgba(8, 13, 13, 0.72)", "#f5f3e8");
}

function drawObjectiveMarker(ctx: CanvasRenderingContext2D, x: number, y: number, kind: ObjectiveMarkerKind, label: string) {
  ctx.save();
  if (kind === "main") {
    drawStar(ctx, x, y, 15, "#f4d36b");
  } else if (kind === "side") {
    drawDiamond(ctx, x, y, 12, "#78d6b4");
  } else {
    ctx.strokeStyle = "#ff8f6b";
    ctx.fillStyle = "rgba(83, 37, 26, 0.82)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 229, 166, 0.82)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 1.45);
    ctx.stroke();
  }
  drawLabelBadge(ctx, x, y + 23, label, kind === "event" ? "rgba(83, 37, 26, 0.84)" : "rgba(8, 13, 13, 0.82)", kind === "side" ? "#dff5e6" : "#fff2b7");
  ctx.restore();
}

function drawPaintedRegionalRoutes(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let index = 0; index < ROUTE_PAIRS.length; index += 1) {
    const [fromId, toId] = ROUTE_PAIRS[index];
    const points = routeControlPoints(anchorRegionalPoint(fromId), anchorRegionalPoint(toId), index, 1);
    const style = routeStyle(index);
    ctx.setLineDash([...style.dash]);
    ctx.lineDashOffset = index * -5;
    ctx.strokeStyle = style.shadow;
    ctx.lineWidth = 8;
    ctx.globalAlpha = 0.72;
    traceCurvedPath(ctx, points);
    ctx.stroke();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 3.4;
    ctx.globalAlpha = 0.92;
    traceCurvedPath(ctx, points);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 247, 195, 0.7)";
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = 0.58;
    ctx.setLineDash([1, 18]);
    traceCurvedPath(ctx, points);
    ctx.stroke();
  }
  ctx.restore();
  ctx.setLineDash([]);
}

function drawRegionalMapGrain(ctx: CanvasRenderingContext2D, tileX: number, tileY: number, tile: number) {
  if (tile === TILE_WATER) return;
  const paint = biomePaintForTile(tileX, tileY);
  const x = tileX * REGIONAL_TILE_X;
  const y = tileY * REGIONAL_TILE_Y;
  const noise = tileNoise(tileX, tileY, tile);
  ctx.save();
  ctx.globalAlpha = tile === TILE_PATH ? 0.18 : 0.13 + noise * 0.12;
  ctx.fillStyle = noise > 0.52 ? paint.light : paint.shade;
  ctx.beginPath();
  ctx.ellipse(x + 6 + noise * 16, y + 10 + tileNoise(tileX, tileY, 9) * 22, 10 + noise * 12, 3 + noise * 7, noise * Math.PI, 0, Math.PI * 2);
  ctx.fill();
  if (noise > 0.72) {
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = paint.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 8 + noise * 16);
    ctx.lineTo(x + 24, y + 5 + tileNoise(tileX, tileY, 11) * 24);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRegionalTerrain(ctx: CanvasRenderingContext2D, tiles: readonly number[], bounds: { minX: number; minY: number; maxX: number; maxY: number }) {
  const step = mapExperimentEnabled("coarse-world-terrain") ? REGIONAL_DRAW_STEP * 2 : REGIONAL_DRAW_STEP;
  const gradient = ctx.createLinearGradient(0, 0, REGIONAL_WIDTH, REGIONAL_HEIGHT);
  gradient.addColorStop(0, "#245f69");
  gradient.addColorStop(0.38, "#2d8c9a");
  gradient.addColorStop(0.74, "#547283");
  gradient.addColorStop(1, "#171b2f");
  ctx.fillStyle = gradient;
  ctx.fillRect(bounds.minX - 80, bounds.minY - 80, bounds.maxX - bounds.minX + 160, bounds.maxY - bounds.minY + 160);

  const minTileX = clamp(Math.floor(bounds.minX / REGIONAL_TILE_X) - step, 0, MAP_WIDTH - 1);
  const maxTileX = clamp(Math.ceil(bounds.maxX / REGIONAL_TILE_X) + step, 0, MAP_WIDTH - 1);
  const minTileY = clamp(Math.floor(bounds.minY / REGIONAL_TILE_Y) - step, 0, MAP_HEIGHT - 1);
  const maxTileY = clamp(Math.ceil(bounds.maxY / REGIONAL_TILE_Y) + step, 0, MAP_HEIGHT - 1);

  for (let tileY = minTileY; tileY <= maxTileY; tileY += step) {
    for (let tileX = minTileX; tileX <= maxTileX; tileX += step) {
      const tile = tileAt(tiles, tileX, tileY);
      const paint = biomePaintForTile(tileX, tileY);
      const x = tileX * REGIONAL_TILE_X;
      const y = tileY * REGIONAL_TILE_Y;
      const w = REGIONAL_TILE_X * step + 1;
      const h = REGIONAL_TILE_Y * step + 1;
      if (tile === TILE_WATER) {
        ctx.fillStyle = "rgba(149, 214, 216, 0.08)";
        ctx.globalAlpha = 0.55;
        ctx.fillRect(x, y, w, h);
        continue;
      }
      ctx.fillStyle = terrainColor(tile, tileX, tileY, false);
      ctx.globalAlpha = tile === TILE_PATH ? 0.78 : tile === TILE_BANK ? 0.72 : 0.58;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = paint.base;
      ctx.globalAlpha = tile === TILE_PATH ? 0.12 : 0.18 + tileNoise(tileX, tileY, 4) * 0.16;
      ctx.beginPath();
      ctx.ellipse(x + w * 0.5, y + h * 0.5, w * (0.44 + tileNoise(tileX, tileY, 5) * 0.2), h * (0.32 + tileNoise(tileX, tileY, 6) * 0.18), tileNoise(tileX, tileY, 7) * 0.8 - 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  for (let tileY = minTileY; tileY <= maxTileY; tileY += step * 2) {
    for (let tileX = minTileX; tileX <= maxTileX; tileX += step * 3) {
      const tile = tileAt(tiles, tileX, tileY);
      if (tile === TILE_WATER) continue;
      drawRegionalMapGrain(ctx, tileX, tileY, tile);
    }
  }

  ctx.save();
  ctx.globalAlpha = 0.32;
  ctx.lineWidth = 1.4;
  for (let tileY = minTileY; tileY <= maxTileY; tileY += step) {
    for (let tileX = minTileX; tileX <= maxTileX; tileX += step) {
      const zone = authoredZoneForMmoSkillDemoTile(tileX, tileY);
      const x = tileX * REGIONAL_TILE_X;
      const y = tileY * REGIONAL_TILE_Y;
      const rightZone = authoredZoneForMmoSkillDemoTile(clamp(tileX + step, 0, MAP_WIDTH - 1), tileY);
      const downZone = authoredZoneForMmoSkillDemoTile(tileX, clamp(tileY + step, 0, MAP_HEIGHT - 1));
      ctx.strokeStyle = BIOME_PAINT[zone].ink;
      if (rightZone !== zone) {
        ctx.beginPath();
        ctx.moveTo(x + REGIONAL_TILE_X * step, y);
        ctx.lineTo(x + REGIONAL_TILE_X * step, y + REGIONAL_TILE_Y * step);
        ctx.stroke();
      }
      if (downZone !== zone) {
        ctx.beginPath();
        ctx.moveTo(x, y + REGIONAL_TILE_Y * step);
        ctx.lineTo(x + REGIONAL_TILE_X * step, y + REGIONAL_TILE_Y * step);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
  drawPaintedRegionalRoutes(ctx);
}

function drawMinimapTerrain(ctx: CanvasRenderingContext2D, tiles: readonly number[], bounds: { minX: number; minY: number; maxX: number; maxY: number }) {
  const step = mapExperimentEnabled("coarse-minimap-terrain") ? 2 : 1;
  ctx.fillStyle = "#173e46";
  ctx.fillRect(bounds.minX - TILE, bounds.minY - TILE, bounds.maxX - bounds.minX + TILE * 2, bounds.maxY - bounds.minY + TILE * 2);
  const minTileX = clamp(Math.floor(bounds.minX / TILE) - 1, 0, MAP_WIDTH - 1);
  const maxTileX = clamp(Math.ceil(bounds.maxX / TILE) + 1, 0, MAP_WIDTH - 1);
  const minTileY = clamp(Math.floor(bounds.minY / TILE) - 1, 0, MAP_HEIGHT - 1);
  const maxTileY = clamp(Math.ceil(bounds.maxY / TILE) + 1, 0, MAP_HEIGHT - 1);
  for (let tileY = minTileY; tileY <= maxTileY; tileY += step) {
    for (let tileX = minTileX; tileX <= maxTileX; tileX += step) {
      const tile = tileAt(tiles, tileX, tileY);
      ctx.fillStyle = terrainColor(tile, tileX, tileY, true);
      ctx.fillRect(tileX * TILE, tileY * TILE, TILE * step + 0.5, TILE * step + 0.5);
      if (step === 1 && tile !== TILE_WATER && tileNoise(tileX, tileY, 19) > 0.72) {
        const paint = biomePaintForTile(tileX, tileY);
        ctx.fillStyle = tile === TILE_PATH ? "rgba(255, 237, 159, 0.32)" : paint.light;
        ctx.globalAlpha = tile === TILE_PATH ? 0.24 : 0.18;
        ctx.fillRect(tileX * TILE + TILE * 0.28, tileY * TILE + TILE * 0.32, TILE * 0.44, TILE * 0.2);
        ctx.globalAlpha = 1;
      }
    }
  }
}

function createMapTextureCanvas(width: number, height: number) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const doc = (globalThis as unknown as { document?: Document }).document;
  if (doc?.createElement) {
    const canvas = doc.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return undefined;
}

function createRegionalTerrainTexture(tiles: readonly number[]) {
  const canvas = createMapTextureCanvas(REGIONAL_WIDTH, REGIONAL_HEIGHT);
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return undefined;
  drawRegionalTerrain(ctx as CanvasRenderingContext2D, tiles, { minX: 0, minY: 0, maxX: REGIONAL_WIDTH, maxY: REGIONAL_HEIGHT });
  return {
    image: canvas as unknown as HTMLImageElement,
    worldWidth: REGIONAL_WIDTH,
    worldHeight: REGIONAL_HEIGHT
  };
}

function routeColor(index: number) {
  return routeStyle(index).color;
}

function regionalRoutes(): MapRoute[] {
  const routes: MapRoute[] = [];
  for (let index = 0; index < ROUTE_PAIRS.length; index += 1) {
    const [fromId, toId] = ROUTE_PAIRS[index];
    const style = routeStyle(index);
    routes.push({
      points: routeControlPoints(anchorRegionalPoint(fromId), anchorRegionalPoint(toId), index, 1),
      color: style.color,
      lineWidth: 2.8,
      dashPattern: [...style.dash],
      phaseOffset: index % 2 === 0 ? 0 : 4
    });
  }
  return routes;
}

function minimapRoutes(): MapRoute[] {
  return ROUTE_PAIRS.map(([fromId, toId], index) => ({
    points: routeControlPoints(anchorWorldPoint(fromId), anchorWorldPoint(toId), index, 16),
    color: routeColor(index),
    lineWidth: 1.6,
    dashPattern: [3, 7],
    phaseOffset: index * 2
  }));
}

function zoneLabels(): ZoneLabel[] {
  const compact = mapExperimentEnabled("compact-world-labels");
  return mmoSkillDemoRegionConfig.zones
    .filter((zone) => zone.id !== "dungeon" && zone.id !== "cottage")
    .map((zone) => {
      const anchors = ANCHORS.filter((anchor) => anchor.zoneId === zone.id);
      const anchor = anchors[0] ?? ANCHORS.find((candidate) => candidate.factionId === zone.factionId) ?? ANCHORS[0];
      const point = anchor ? { x: (anchor.tileX + 0.5) * REGIONAL_TILE_X, y: (anchor.tileY + 0.5) * REGIONAL_TILE_Y } : { x: 0, y: 0 };
      const paint = BIOME_PAINT[zone.id];
      return {
        text: upperLabel(zone.label),
        worldX: point.x + (zone.id === "ashwood" ? 120 : zone.id === "holy-reach" ? -90 : zone.id === "void-rift" ? 160 : 0),
        worldY: point.y + (zone.id === "crags" ? 170 : zone.id === "canaan-desert" ? 122 : zone.id === "whisperwind-ascent" ? 98 : -74),
        font: compact ? "900 48px Georgia, serif" : "900 58px Georgia, serif",
        color: paint.light,
        minZoomToShow: compact ? 0.26 : 0.16
      };
    });
}

function anchorTooltip(anchor: (typeof ANCHORS)[number]): MapNodeTooltipInfo {
  return {
    title: shortAnchorLabel(anchor.label),
    lines: [
      `${labelize(anchor.kind)} | ${zoneLabel(anchor.zoneId)}`,
      anchor.factionLabel ?? anchor.regionLabel ?? "Route anchor",
      anchor.instanceId ? "Instance entrance" : anchor.kind === "endgame" ? "Endgame route" : "World route node"
    ]
  };
}

function objectiveTooltip(kind: ObjectiveMarkerKind, label: string, anchorId: string): MapNodeTooltipInfo {
  const anchor = ANCHOR_BY_ID.get(anchorId);
  return {
    title: label,
    lines: [
      kind === "main" ? "Main quest destination" : kind === "side" ? "Daily objective destination" : "World event destination",
      anchor ? `${shortAnchorLabel(anchor.label)} | ${zoneLabel(anchor.zoneId)}` : "Route objective"
    ]
  };
}

function npcTooltip(npc: NpcEntity): MapNodeTooltipInfo {
  const hpLine = npc.maxHp > 0 ? `HP ${Math.max(0, npc.hp)}/${npc.maxHp}` : "Support NPC";
  return {
    title: entityName(npc),
    lines: [`${labelize(npc.role)} | ${zoneLabel(npc.zoneId)}`, hpLine]
  };
}

function lootTooltip(loot: LootEntity): MapNodeTooltipInfo {
  return {
    title: labelize(loot.itemId),
    lines: [itemAmountLine(loot.amount), zoneLabel(loot.zoneId)]
  };
}

function playerTooltip(player: PlayerEntity): MapNodeTooltipInfo {
  return {
    title: player.name || "You",
    lines: [`${zoneLabel(player.zoneId)} | HP ${player.hp}/${player.maxHp}`, `Combat Lv ${player.combatLevel}`]
  };
}

function regionalAnchorMarkers(): HoverMapMarker[] {
  const compact = mapExperimentEnabled("compact-world-labels");
  return ANCHORS.map((anchor) => {
    const point = anchorRegionalPoint(anchor.id);
    const visual = factionZoneVisuals[(anchor.regionLabel === "Whisperwind Ascent" ? "high-reach-peaks" : regionVisualIdForTile(anchor.tileX, anchor.tileY)) as FactionVisualId];
    const isDungeon = anchor.kind === "dungeon" || anchor.instanceId;
    const isBoss = anchor.kind === "endgame";
    const color = isBoss ? "#d49be7" : isDungeon ? "#d9dbe5" : visual.accent;
    return {
      id: `anchor:${anchor.id}`,
      worldX: point.x,
      worldY: point.y,
      color,
      tooltip: anchorTooltip(anchor),
      hoverRadius: 18,
      onDraw: (ctx, x, y) => drawLandmarkIcon(ctx, x, y, anchor, color, !compact)
    } satisfies HoverMapMarker;
  });
}

export type ResourceMarkerSource =
  | Pick<ResourceEntity, "id" | "kind" | "x" | "y" | "skillId" | "materialId" | "zoneId" | "hp" | "maxHp" | "depleted">
  | WorldGatherableNodeSpec;

function materialTierForResource(resource: ResourceMarkerSource) {
  if ("tier" in resource) return resource.tier;
  return resource.materialId ? getGatherableMaterialById(resource.materialId)?.tier ?? 1 : 1;
}

function resourceSkillId(resource: ResourceMarkerSource) {
  if (resource.skillId) return resource.skillId;
  if (resource.kind === "tree") return "lumberjacking";
  if (resource.kind === "ore") return "mining";
  return resource.kind;
}

function materialForResourceMarker(resource: ResourceMarkerSource) {
  if (typeof resource.materialId === "number") return getGatherableMaterialById(resource.materialId);
  return undefined;
}

export function mapNodeTooltipInfoForResource(resource: ResourceMarkerSource): MapNodeTooltipInfo {
  const material = materialForResourceMarker(resource);
  const tier = material?.tier ?? materialTierForResource(resource);
  const skillId = material?.skillId ?? resourceSkillId(resource);
  const title = material?.name ?? ("materialName" in resource ? resource.materialName : labelize(resource.kind ?? resource.id));
  const lines = [
    `${labelize(skillId)} | Tier ${tier}`,
    material ? `Req Lv ${material.requiredLevel} | ${material.gatherTimeSeconds.toFixed(1)}s collect` : `Node ${labelize(resource.kind ?? "resource")}`
  ];
  if ("authoredZoneId" in resource) lines.push(zoneLabel(resource.authoredZoneId));
  else lines.push(`${zoneLabel(resource.zoneId)} | ${resource.depleted ? "Depleted" : `HP ${resource.hp}/${resource.maxHp}`}`);
  return { title, lines };
}

function gatherableMarkerColor(resource: ResourceMarkerSource) {
  const tier = materialTierForResource(resource);
  if (tier >= 5) return "#f5f3e8";
  if (tier === 4) return "#c978ff";
  if (tier === 3) return "#f4d36b";
  if (tier === 2) return "#6de2ff";
  const skillId = resourceSkillId(resource);
  if (skillId === "mining" || skillId === "quarrying" || skillId === "gemology") return "#d9dbe5";
  if (skillId === "fishing" || skillId === "dredging") return "#6de2ff";
  return "#7ed66d";
}

function gatherableMarkerRadius(resource: ResourceMarkerSource, regional = false) {
  const tier = materialTierForResource(resource);
  return (regional ? 2.4 : 3.2) + tier * (regional ? 0.25 : 0.35);
}

function isKnownDepleted(state: MmoSkillDemoState, resourceId: string) {
  return state.resources?.[resourceId]?.depleted === true;
}

function regionalGatherableMarkers(state: MmoSkillDemoState): HoverMapMarker[] {
  const markers: HoverMapMarker[] = [];
  for (const spec of worldGatherableNodeSpecs) {
    if (isKnownDepleted(state, spec.id)) continue;
    const point = worldToRegional(spec.x, spec.y);
    markers.push({
      id: `gatherable:${spec.id}`,
      worldX: point.x,
      worldY: point.y,
      tooltip: mapNodeTooltipInfoForResource(spec),
      hoverRadius: 10,
      onDraw: (ctx, x, y) => drawDot(ctx, x, y, gatherableMarkerColor(spec), gatherableMarkerRadius(spec, true))
    });
  }
  for (const resource of Object.values(state.resources ?? {})) {
    if (worldGatherableNodeSpecsById[resource.id] || resource.depleted) continue;
    const point = worldToRegional(resource.x, resource.y);
    markers.push({
      id: `resource:${resource.id}`,
      worldX: point.x,
      worldY: point.y,
      tooltip: mapNodeTooltipInfoForResource(resource),
      hoverRadius: 10,
      onDraw: (ctx, x, y) => drawDot(ctx, x, y, gatherableMarkerColor(resource), gatherableMarkerRadius(resource, true))
    });
  }
  return markers;
}

function regionalLiveMarkers(state: MmoSkillDemoState, player: PlayerEntity | undefined, heading: number): HoverMapMarker[] {
  const markers: HoverMapMarker[] = [];
  if (player) {
    const point = worldToRegional(player.x, player.y);
    markers.push({
      id: "player",
      worldX: point.x,
      worldY: point.y,
      tooltip: playerTooltip(player),
      hoverRadius: 18,
      onDraw: (ctx, x, y) => drawPlayerMarker(ctx, x, y, heading, true)
    });
  }
  for (const npc of Object.values(state.npcs ?? {})) {
    if (!SUPPORT_NPC_ROLES.has(npc.role)) continue;
    const point = worldToRegional(npc.x, npc.y);
    markers.push({
      id: `npc:${npc.id}`,
      worldX: point.x,
      worldY: point.y,
      tooltip: npcTooltip(npc),
      hoverRadius: 16,
      onDraw: (ctx, x, y) => drawRouteMarker(ctx, x, y, npc.role === "travel" ? "#236dd1" : "#f04f42", npc.role === "travel" ? "^" : "!")
    });
  }
  return markers;
}

function regionalObjectiveMarkers(state: MmoSkillDemoState, player: PlayerEntity | undefined): HoverMapMarker[] {
  const markers: HoverMapMarker[] = [];
  const mainAnchorId = activeQuestAnchorId(player);
  const sideAnchorId = dailyQuestAnchorId(player);
  const worldEventAnchorId = eventAnchorId(state);
  const add = (anchorId: string | undefined, kind: ObjectiveMarkerKind, label: string, offsetX: number, offsetY: number) => {
    if (!anchorId) return;
    const point = anchorRegionalPoint(anchorId);
    markers.push({
      id: `objective:${kind}:${anchorId}`,
      worldX: point.x,
      worldY: point.y,
      tooltip: objectiveTooltip(kind, label, anchorId),
      hoverRadius: 18,
      onDraw: (ctx, x, y) => drawObjectiveMarker(ctx, x + offsetX, y + offsetY, kind, label)
    });
  };
  add(mainAnchorId, "main", "Main Quest", -18, -24);
  if (sideAnchorId !== mainAnchorId) add(sideAnchorId, "side", "Daily", 18, -20);
  if (worldEventAnchorId !== mainAnchorId && worldEventAnchorId !== sideAnchorId) {
    add(worldEventAnchorId, "event", state.worldEventName || "World Event", 0, -30);
  }
  return markers;
}

function nearby(player: PlayerEntity | undefined, entity: { x: number; y: number }, distance: number) {
  if (!player) return false;
  return Math.hypot(entity.x - player.x, entity.y - player.y) <= distance;
}

function drawMiniObjectiveMarker(ctx: CanvasRenderingContext2D, x: number, y: number, kind: ObjectiveMarkerKind) {
  if (kind === "main") {
    drawStar(ctx, x, y, 8, "#f4d36b");
    return;
  }
  if (kind === "side") {
    drawDiamond(ctx, x, y, 7, "#78d6b4");
    return;
  }
  ctx.save();
  ctx.fillStyle = "rgba(83, 37, 26, 0.9)";
  ctx.strokeStyle = "#ff8f6b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function minimapMarkers(state: MmoSkillDemoState, player: PlayerEntity | undefined, heading: number, includePlayer = true): HoverMapMarker[] {
  const markers: HoverMapMarker[] = [];
  for (const anchor of ANCHORS) {
    const point = anchorWorldPoint(anchor.id);
    const important = anchor.kind === "town" || anchor.kind === "dungeon" || anchor.kind === "endgame";
    if (!important) continue;
    markers.push({
      id: `anchor:${anchor.id}`,
      worldX: point.x,
      worldY: point.y,
      clampToEdge: true,
      tooltip: anchorTooltip(anchor),
      hoverRadius: 13,
      onDraw: (ctx, x, y) => drawLandmarkIcon(ctx, x, y, anchor, anchor.kind === "town" ? "#ffd56b" : anchor.kind === "endgame" ? "#d49be7" : "#d9dbe5", false)
    });
  }
  const objectives = [
    { anchorId: activeQuestAnchorId(player), kind: "main" as const },
    { anchorId: dailyQuestAnchorId(player), kind: "side" as const },
    { anchorId: eventAnchorId(state), kind: "event" as const }
  ];
  for (const objective of objectives) {
    if (!objective.anchorId) continue;
    const point = anchorWorldPoint(objective.anchorId);
    markers.push({
      id: `mini-objective:${objective.kind}:${objective.anchorId}`,
      worldX: point.x,
      worldY: point.y,
      clampToEdge: true,
      tooltip: objectiveTooltip(objective.kind, objective.kind === "main" ? "Main Quest" : objective.kind === "side" ? "Daily" : state.worldEventName || "World Event", objective.anchorId),
      hoverRadius: 13,
      onDraw: (ctx, x, y) => drawMiniObjectiveMarker(ctx, x, y, objective.kind)
    });
  }
  for (const npc of Object.values(state.npcs ?? {})) {
    if (!nearby(player, npc, 1600) && !SUPPORT_NPC_ROLES.has(npc.role)) continue;
    const hostile = !SUPPORT_NPC_ROLES.has(npc.role);
    markers.push({
      id: `npc:${npc.id}`,
      worldX: npc.x,
      worldY: npc.y,
      tooltip: npcTooltip(npc),
      hoverRadius: hostile ? 9 : 11,
      onDraw: (ctx, x, y) => drawDot(ctx, x, y, hostile ? "#ef6f4f" : "#f04f42", hostile ? 4 : 5, hostile ? "" : "!")
    });
  }
  const staticResourceIds = new Set<string>();
  for (const spec of worldGatherableNodeSpecs) {
    if (!nearby(player, spec, 1600) || isKnownDepleted(state, spec.id)) continue;
    staticResourceIds.add(spec.id);
    markers.push({
      id: `gatherable:${spec.id}`,
      worldX: spec.x,
      worldY: spec.y,
      tooltip: mapNodeTooltipInfoForResource(spec),
      hoverRadius: 10,
      onDraw: (ctx, x, y) => drawDot(ctx, x, y, gatherableMarkerColor(spec), gatherableMarkerRadius(spec))
    });
  }
  for (const resource of Object.values(state.resources ?? {})) {
    if (staticResourceIds.has(resource.id) || worldGatherableNodeSpecsById[resource.id] || !nearby(player, resource, 1200) || resource.depleted) continue;
    markers.push({
      id: `resource:${resource.id}`,
      worldX: resource.x,
      worldY: resource.y,
      tooltip: mapNodeTooltipInfoForResource(resource),
      hoverRadius: 10,
      onDraw: (ctx, x, y) => drawDot(ctx, x, y, gatherableMarkerColor(resource), gatherableMarkerRadius(resource))
    });
  }
  for (const loot of Object.values(state.loots ?? {})) {
    if (!nearby(player, loot, 900)) continue;
    markers.push({
      id: `loot:${loot.id}`,
      worldX: loot.x,
      worldY: loot.y,
      tooltip: lootTooltip(loot),
      hoverRadius: 9,
      onDraw: (ctx, x, y) => drawDot(ctx, x, y, "#f4d36b", 3.5)
    });
  }
  if (player && includePlayer) {
    markers.push({
      id: "player",
      worldX: player.x,
      worldY: player.y,
      tooltip: playerTooltip(player),
      hoverRadius: 12,
      onDraw: (ctx, x, y) => drawPlayerMarker(ctx, x, y, heading)
    });
  }
  return markers;
}

function headingLabel(heading: number) {
  const degrees = (heading * 180 / Math.PI + 360) % 360;
  const directions = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"] as const;
  return directions[Math.round(degrees / 45) % directions.length];
}

function nearestLandmarkHint(player: PlayerEntity | undefined) {
  if (!player) return "No signal";
  let nearest: (typeof ANCHORS)[number] | undefined;
  let nearestDistance = Infinity;
  for (const anchor of ANCHORS) {
    const point = anchorWorldPoint(anchor.id);
    const distance = Math.hypot(point.x - player.x, point.y - player.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = anchor;
    }
  }
  if (!nearest) return "No landmark";
  return `Near ${shortAnchorLabel(nearest.label)}`;
}

function resourceHint(state: MmoSkillDemoState, player: PlayerEntity | undefined, filters: MapFilterState) {
  if (!filters.gatherables) return "Resources hidden";
  if (!player) return "No resources";
  let common = 0;
  let uncommon = 0;
  let scarce = 0;
  const counted = new Set<string>();
  for (const spec of worldGatherableNodeSpecs) {
    if (!nearby(player, spec, 1200) || isKnownDepleted(state, spec.id)) continue;
    counted.add(spec.id);
    if (spec.tier === 1) common += 1;
    else if (spec.tier === 2) uncommon += 1;
    else scarce += 1;
  }
  for (const resource of Object.values(state.resources ?? {})) {
    if (counted.has(resource.id) || resource.depleted || !nearby(player, resource, 1200)) continue;
    const tier = materialTierForResource(resource);
    if (tier === 1) common += 1;
    else if (tier === 2) uncommon += 1;
    else scarce += 1;
  }
  const parts: string[] = [];
  if (common > 0) parts.push(`Common ${common}`);
  if (uncommon > 0) parts.push(`Uncommon ${uncommon}`);
  if (scarce > 0) parts.push(`Rare ${scarce}`);
  return parts.length ? parts.slice(0, 2).join("  ") : "No close resources";
}

function minimapCacheSignature(state: MmoSkillDemoState, player: PlayerEntity | undefined, filters: MapFilterState) {
  const tickBucket = Math.floor((state.tick ?? 0) / 12);
  const playerX = player ? Math.floor(player.x / 128) : -1;
  const playerY = player ? Math.floor(player.y / 128) : -1;
  return [
    tickBucket,
    playerX,
    playerY,
    player?.activeQuestId ?? "",
    player?.dailyQuestDate ?? "",
    player?.dailyQuestStep ?? 0,
    player?.dailyQuestCompleted ? 1 : 0,
    state.worldEventId,
    mapFilterSignature(filters),
    Object.keys(state.npcs ?? {}).length,
    Object.keys(state.resources ?? {}).length,
    Object.keys(state.loots ?? {}).length
  ].join(":");
}

function drawMinimapHintPanel(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, lineA: string, lineB: string) {
  ctx.save();
  ctx.fillStyle = "rgba(7, 12, 12, 0.76)";
  ctx.strokeStyle = "rgba(244, 211, 107, 0.54)";
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, width, 31);
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, 30);
  ctx.fillStyle = "#fff2b7";
  ctx.font = "800 10px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(lineA, x + width * 0.5, y + 4, width - 8);
  ctx.fillStyle = "#dfe6ca";
  ctx.font = "700 10px system-ui";
  ctx.fillText(lineB, x + width * 0.5, y + 17, width - 8);
  ctx.restore();
}

function minimapControlButtons(layout: MinimapLayout): Array<{ id: MinimapControlId; x: number; y: number; label: string }> {
  const cx = layout.x + layout.size * 0.5;
  const cy = layout.y + layout.size * 0.5;
  return [
    { id: "resetZoom", x: cx - layout.size * 0.5 - 6, y: cy, label: "N" },
    { id: "toggleGatherables", x: cx - layout.size * 0.5 - 6, y: cy - 36, label: "G" },
    { id: "zoomIn", x: cx + layout.size * 0.5 + 6, y: cy - 24, label: "+" },
    { id: "zoomOut", x: cx + layout.size * 0.5 + 6, y: cy + 24, label: "-" }
  ];
}

function minimapControlAt(layout: MinimapLayout | undefined, point: RegionalPoint): MinimapControlId | undefined {
  if (!layout) return undefined;
  for (const button of minimapControlButtons(layout)) {
    if (Math.hypot(point.x - button.x, point.y - button.y) <= 17) return button.id;
  }
  return undefined;
}

function minimapBaseZoom(size: number) {
  return clamp(size / 1900, 0.07, 0.11);
}

function minimapZoom(size: number, scale: number) {
  return clamp(minimapBaseZoom(size) * scale, MINIMAP_MIN_ZOOM, MINIMAP_MAX_ZOOM);
}

function drawMinimapChrome(ctx: CanvasRenderingContext2D, map: GameMap, x: number, y: number, size: number, hintA: string, hintB: string, heading: number, filters: MapFilterState) {
  const cx = x + size * 0.5;
  const cy = y + size * 0.5;
  ctx.save();
  const frameGradient = ctx.createRadialGradient(cx, cy, size * 0.34, cx, cy, size * 0.58);
  frameGradient.addColorStop(0, "rgba(255, 244, 178, 0.16)");
  frameGradient.addColorStop(0.62, "rgba(73, 49, 28, 0.52)");
  frameGradient.addColorStop(1, "rgba(9, 16, 18, 0.96)");
  ctx.strokeStyle = frameGradient;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.5 + 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(245, 216, 128, 0.95)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.5 + 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(10, 19, 21, 0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.5 + 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 244, 190, 0.56)";
  ctx.lineWidth = 1;
  for (let index = 0; index < 32; index += 1) {
    const angle = index / 32 * Math.PI * 2;
    const outer = size * 0.5 + 9;
    const inner = outer - (index % 4 === 0 ? 8 : 4);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(8, 13, 13, 0.86)";
  ctx.strokeStyle = "rgba(245, 216, 128, 0.88)";
  for (const button of minimapControlButtons({ x, y, size })) {
    const gatherableButton = button.id === "toggleGatherables";
    const active = !gatherableButton || filters.gatherables;
    ctx.fillStyle = gatherableButton && active ? "rgba(28, 68, 35, 0.9)" : "rgba(8, 13, 13, 0.86)";
    ctx.strokeStyle = gatherableButton && active ? "rgba(126, 214, 109, 0.92)" : "rgba(245, 216, 128, 0.88)";
    ctx.beginPath();
    ctx.arc(button.x, button.y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = active ? "#f4d36b" : "rgba(223, 230, 202, 0.48)";
    ctx.font = "800 14px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(button.label, button.x, button.y);
    ctx.fillStyle = "rgba(8, 13, 13, 0.86)";
  }
  ctx.fillStyle = "rgba(8, 13, 13, 0.9)";
  ctx.strokeStyle = "rgba(245, 216, 128, 0.76)";
  ctx.fillRect(cx - 35, y + size - 9, 70, 22);
  ctx.strokeRect(cx - 35, y + size - 9, 70, 22);
  ctx.fillStyle = "#f5f3e8";
  ctx.font = "700 12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("N Map", cx, y + size + 4);
  ctx.fillStyle = "rgba(7, 12, 12, 0.78)";
  ctx.strokeStyle = "rgba(244, 211, 107, 0.62)";
  ctx.fillRect(cx - 30, y + 8, 60, 22);
  ctx.strokeRect(cx - 30.5, y + 8.5, 61, 21);
  ctx.fillStyle = "#fff2b7";
  ctx.font = "900 12px system-ui";
  ctx.fillText(`HDG ${headingLabel(heading)}`, cx, y + 13);
  ctx.restore();
  map.drawCompassRose(ctx, { x: cx, y: y + 18, radius: 10, color: "rgba(255,245,188,0.8)", labelColor: "rgba(255,245,188,0)", accentColor: "#f4d36b" });
  drawMinimapHintPanel(ctx, x + size * 0.16, y + size - 39, size * 0.68, hintA, hintB);
}

function drawWorldMapBackdrop(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  ctx.save();
  ctx.fillStyle = "rgba(2, 8, 13, 0.97)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const vignette = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.42, canvas.width * 0.12, canvas.width * 0.5, canvas.height * 0.5, canvas.width * 0.78);
  vignette.addColorStop(0, "rgba(255, 231, 164, 0.08)");
  vignette.addColorStop(0.58, "rgba(22, 31, 36, 0.1)");
  vignette.addColorStop(1, "rgba(1, 5, 8, 0.66)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawWorldMapChrome(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, map: GameMap, player: PlayerEntity | undefined) {
  ctx.save();
  const mapX = 18;
  const mapY = 18;
  const mapW = canvas.width - 36;
  const mapH = canvas.height - 36;
  ctx.fillStyle = "rgba(226, 194, 121, 0.06)";
  ctx.fillRect(mapX + 4, mapY + 4, mapW - 8, mapH - 8);
  ctx.strokeStyle = "rgba(244, 211, 107, 0.86)";
  ctx.lineWidth = 2;
  ctx.strokeRect(mapX, mapY, mapW, mapH);
  ctx.strokeStyle = "rgba(255, 245, 190, 0.32)";
  ctx.strokeRect(mapX + 7, mapY + 7, mapW - 14, mapH - 14);
  ctx.strokeStyle = "rgba(12, 18, 18, 0.92)";
  ctx.lineWidth = 4;
  ctx.strokeRect(mapX + 2, mapY + 2, mapW - 4, mapH - 4);
  ctx.fillStyle = "rgba(7, 16, 21, 0.86)";
  ctx.fillRect(34, 30, 360, 56);
  ctx.strokeStyle = "rgba(244, 211, 107, 0.58)";
  ctx.strokeRect(34.5, 30.5, 359, 55);
  ctx.strokeStyle = "rgba(109, 226, 255, 0.24)";
  ctx.beginPath();
  ctx.moveTo(48, 82);
  ctx.lineTo(378, 82);
  ctx.stroke();
  ctx.fillStyle = "#f4d36b";
  ctx.font = "900 20px Georgia, serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("AETHERIA ROUTE ATLAS", 48, 39);
  ctx.fillStyle = "#dfe6ca";
  ctx.font = "700 11px system-ui";
  ctx.fillText(player ? `${upperLabel(player.zoneId)}  |  M closes map` : "M closes map", 48, 64);
  ctx.strokeStyle = "rgba(244, 211, 107, 0.62)";
  ctx.lineWidth = 2;
  for (const corner of [
    { x: mapX + 18, y: mapY + 18, sx: 1, sy: 1 },
    { x: mapX + mapW - 18, y: mapY + 18, sx: -1, sy: 1 },
    { x: mapX + 18, y: mapY + mapH - 18, sx: 1, sy: -1 },
    { x: mapX + mapW - 18, y: mapY + mapH - 18, sx: -1, sy: -1 }
  ]) {
    ctx.beginPath();
    ctx.moveTo(corner.x, corner.y + 42 * corner.sy);
    ctx.lineTo(corner.x, corner.y);
    ctx.lineTo(corner.x + 42 * corner.sx, corner.y);
    ctx.stroke();
  }
  ctx.restore();
  map.drawCompassRose(ctx, { x: 92, y: 140, radius: 48, color: "rgba(26, 34, 30, 0.95)", accentColor: "#d8b56a", labelColor: "#d8b56a", font: "800 15px Georgia, serif", rotationRad: 0 });
}

export function createMapOverlay(canvas: HTMLCanvasElement, tiles: readonly number[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  const regionalTerrainTexture = mapExperimentEnabled("world-terrain-texture") ? createRegionalTerrainTexture(tiles) : undefined;

  const minimap = new GameMap({
    shape: "circle",
    pixelX: 0,
    pixelY: 0,
    width: 160,
    height: 160,
    zoom: 0.08,
    minZoom: MINIMAP_MIN_ZOOM,
    maxZoom: MINIMAP_MAX_ZOOM,
    mode: "FOLLOW_TARGET",
    rotateWithTracking: false,
    borderStyle: { color: "rgba(244, 211, 107, 0.78)", accentColor: "rgba(255,255,255,0.65)", lineWidth: 2, tickCount: 24 },
    compass: false,
    onDrawTerrain: (terrainCtx, bounds) => drawMinimapTerrain(terrainCtx, tiles, bounds)
  });
  const worldMap = new GameMap({
    shape: "rectangle",
    pixelX: 18,
    pixelY: 18,
    width: Math.max(1, canvas.width - 36),
    height: Math.max(1, canvas.height - 36),
    zoom: 0.34,
    minZoom: WORLD_MAP_MIN_ZOOM,
    maxZoom: WORLD_MAP_MAX_ZOOM,
    mode: "FREE_PAN",
    centerWorldX: REGIONAL_WIDTH * 0.5,
    centerWorldY: REGIONAL_HEIGHT * 0.5,
    labelFadeZoomRange: 0.18,
    borderStyle: { color: "rgba(244, 211, 107, 0.82)", accentColor: "rgba(109, 226, 255, 0.64)", lineWidth: 2, tickCount: 0 },
    compass: false,
    terrainTexture: regionalTerrainTexture,
    onDrawTerrain: regionalTerrainTexture ? undefined : (terrainCtx, bounds) => drawRegionalTerrain(terrainCtx, tiles, bounds)
  });
  const routes = regionalRoutes();
  const labels = zoneLabels();
  const miniRoutes = minimapRoutes();
  let cachedMinimapSignature = "";
  let cachedMinimapMarkers: HoverMapMarker[] = [];
  let cachedMinimapHintA = "";
  let cachedMinimapHintB = "";
  let worldOpen = false;
  let wasWorldOpen = false;
  let mapNeedsFit = true;
  let activeWorldPointerId: number | undefined;
  let minimapVisible = false;
  let minimapLayout: MinimapLayout | undefined;
  let currentWorldLegendLayout: ReturnType<typeof worldLegendLayout> | undefined;
  const mapFilters = createDefaultMapFilterState();
  let minimapZoomScale = 1;
  let minimapMouseBlockUntilMs = Number.NEGATIVE_INFINITY;
  let smoothWorldZoom: SmoothWorldZoom | undefined;
  let hoverFrame: MapHoverFrame | undefined;
  const mapTooltip = createMapTooltip(canvas);

  function fitWorldMap() {
    const viewW = Math.max(1, canvas.width - 36);
    const viewH = Math.max(1, canvas.height - 36);
    const fitZoom = clamp(Math.min((viewW - 70) / REGIONAL_WIDTH, (viewH - 100) / REGIONAL_HEIGHT), 0.16, 0.46);
    worldMap
      .setViewport(18, 18, viewW, viewH)
      .setCenter(REGIONAL_WIDTH * 0.5, REGIONAL_HEIGHT * 0.5)
      .setZoom(fitZoom);
    worldMap.handleInput({ down: false, released: true });
    activeWorldPointerId = undefined;
    smoothWorldZoom = undefined;
    mapNeedsFit = false;
  }

  function consumeCanvasInput(event: Event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function handleMinimapPointer(event: PointerEvent) {
    if (worldOpen || !minimapVisible) return false;
    const control = minimapControlAt(minimapLayout, canvasPoint(canvas, event));
    if (!control) return false;
    if (control === "toggleGatherables") {
      toggleMapFilter(mapFilters, "gatherables");
      cachedMinimapSignature = "";
    } else if (control === "resetZoom") minimapZoomScale = 1;
    else if (control === "zoomIn") minimapZoomScale = clamp(minimapZoomScale * 1.2, 0.7, 1.8);
    else minimapZoomScale = clamp(minimapZoomScale / 1.2, 0.7, 1.8);
    minimapMouseBlockUntilMs = performance.now() + 180;
    consumeCanvasInput(event);
    return true;
  }

  function handleWorldLegendPointer(event: PointerEvent) {
    if (!worldOpen || !currentWorldLegendLayout) return false;
    const point = canvasPoint(canvas, event);
    const filterId = worldLegendFilterAt(currentWorldLegendLayout, point);
    if (filterId) {
      toggleMapFilter(mapFilters, filterId);
      cachedMinimapSignature = "";
    }
    if (!filterId && !pointInsideRect(currentWorldLegendLayout, point)) return false;
    consumeCanvasInput(event);
    return true;
  }

  function handleWorldPointer(event: PointerEvent, kind: "pressed" | "moved" | "released") {
    if (!worldOpen) return;
    const point = canvasPoint(canvas, event);
    if (kind === "pressed") {
      activeWorldPointerId = event.pointerId;
    } else if (activeWorldPointerId !== event.pointerId) {
      consumeCanvasInput(event);
      return;
    }
    const down = kind !== "released" && activeWorldPointerId === event.pointerId;
    worldMap.handleInput({
      x: point.x,
      y: point.y,
      down,
      pressed: kind === "pressed",
      released: kind === "released",
      moved: kind === "moved"
    });
    consumeCanvasInput(event);
    if (kind === "pressed" && "setPointerCapture" in canvas) canvas.setPointerCapture(event.pointerId);
    if (kind === "released" && "releasePointerCapture" in canvas) {
      activeWorldPointerId = undefined;
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer may already be released by the browser.
      }
    }
  }

  function blockGameplayMouse(event: Event) {
    if (!worldOpen && performance.now() >= minimapMouseBlockUntilMs) return;
    consumeCanvasInput(event);
  }

  function queueSmoothWorldZoom(point: RegionalPoint, deltaY: number) {
    const currentZoom = worldMap.state().zoom;
    const baseZoom = smoothWorldZoom?.targetZoom ?? currentZoom;
    smoothWorldZoom = {
      targetZoom: clamp(baseZoom * Math.exp(-deltaY * 0.0015), WORLD_MAP_MIN_ZOOM, WORLD_MAP_MAX_ZOOM),
      x: point.x,
      y: point.y
    };
  }

  function stepSmoothWorldZoom() {
    if (!smoothWorldZoom) return;
    const currentZoom = worldMap.state().zoom;
    const nextZoom = currentZoom + (smoothWorldZoom.targetZoom - currentZoom) * 0.24;
    const settled = Math.abs(nextZoom - smoothWorldZoom.targetZoom) < 0.002;
    const targetZoom = settled ? smoothWorldZoom.targetZoom : nextZoom;
    if (currentZoom > 0) {
      worldMap.handleInput({
        x: smoothWorldZoom.x,
        y: smoothWorldZoom.y,
        zoomDelta: targetZoom / currentZoom - 1
      });
    }
    if (settled) smoothWorldZoom = undefined;
  }

  function updateMapTooltip(event: PointerEvent) {
    if (activeWorldPointerId !== undefined) {
      mapTooltip.close();
      return;
    }
    const point = canvasPoint(canvas, event);
    const legendItem = worldOpen && currentWorldLegendLayout
      ? legendItemAt(currentWorldLegendLayout, point)
      : minimapVisible && minimapLayout
        ? minimapLegendItemAt(minimapLayout, point)
        : undefined;
    const tooltipInfo = legendItem ? legendTooltip(legendItem) : mapMarkerAt(hoverFrame, point);
    if (!tooltipInfo) {
      mapTooltip.close();
      return;
    }
    mapTooltip.show(event, tooltipInfo);
  }

  canvas.addEventListener("pointerdown", (event) => {
    mapTooltip.close();
    if (handleMinimapPointer(event)) return;
    if (handleWorldLegendPointer(event)) return;
    handleWorldPointer(event, "pressed");
  });
  canvas.addEventListener("pointermove", (event) => {
    updateMapTooltip(event);
    handleWorldPointer(event, "moved");
  });
  canvas.addEventListener("pointerup", (event) => {
    handleWorldPointer(event, "released");
    updateMapTooltip(event);
  });
  canvas.addEventListener("pointercancel", (event) => {
    mapTooltip.close();
    handleWorldPointer(event, "released");
  });
  canvas.addEventListener("pointerleave", () => mapTooltip.close());
  canvas.addEventListener("wheel", (event) => {
    if (!worldOpen) return;
    mapTooltip.close();
    const point = canvasPoint(canvas, event);
    queueSmoothWorldZoom(point, event.deltaY);
    consumeCanvasInput(event);
  }, { passive: false });
  canvas.addEventListener("mousedown", blockGameplayMouse, true);
  canvas.addEventListener("mousemove", blockGameplayMouse, true);
  canvas.addEventListener("mouseup", blockGameplayMouse, true);
  canvas.addEventListener("contextmenu", blockGameplayMouse, true);

  function minimapMarkerFrame(state: MmoSkillDemoState, player: PlayerEntity | undefined, heading: number) {
    if (!mapExperimentEnabled("cache-minimap-markers")) {
      return {
        markers: mapFilters.gatherables ? minimapMarkers(state, player, heading) : minimapMarkers(state, player, heading).filter((marker) => !marker.id.startsWith("gatherable:") && !marker.id.startsWith("resource:")),
        hintA: nearestLandmarkHint(player),
        hintB: resourceHint(state, player, mapFilters)
      };
    }
    const signature = minimapCacheSignature(state, player, mapFilters);
    if (signature !== cachedMinimapSignature) {
      cachedMinimapSignature = signature;
      cachedMinimapMarkers = mapFilters.gatherables
        ? minimapMarkers(state, player, heading, false)
        : minimapMarkers(state, player, heading, false).filter((marker) => !marker.id.startsWith("gatherable:") && !marker.id.startsWith("resource:"));
      cachedMinimapHintA = nearestLandmarkHint(player);
      cachedMinimapHintB = resourceHint(state, player, mapFilters);
    }
    const markers = player
      ? [
        ...cachedMinimapMarkers,
        {
          id: "player",
          worldX: player.x,
          worldY: player.y,
          tooltip: playerTooltip(player),
          hoverRadius: 12,
          onDraw: (ctx: CanvasRenderingContext2D, x: number, y: number) => drawPlayerMarker(ctx, x, y, heading)
        } satisfies HoverMapMarker
      ]
      : cachedMinimapMarkers;
    return { markers, hintA: cachedMinimapHintA, hintB: cachedMinimapHintB };
  }

  return {
    draw(state: MmoSkillDemoState, player: PlayerEntity | undefined, view: MapOverlayView): void {
      const heading = playerHeading(player);
      worldOpen = view.worldMapOpen;
      minimapVisible = view.minimapOpen && !worldOpen;
      if (worldOpen && (!wasWorldOpen || mapNeedsFit)) fitWorldMap();
      if (!worldOpen) {
        activeWorldPointerId = undefined;
        smoothWorldZoom = undefined;
        worldMap.handleInput({ down: false, released: true });
      }
      wasWorldOpen = worldOpen;
      if (worldOpen) {
        minimapLayout = undefined;
        currentWorldLegendLayout = worldLegendLayout(canvas);
        stepSmoothWorldZoom();
        drawWorldMapBackdrop(ctx, canvas);
        const worldMarkers = [...regionalAnchorMarkers(), ...(mapFilters.gatherables ? regionalGatherableMarkers(state) : []), ...regionalLiveMarkers(state, player, heading), ...regionalObjectiveMarkers(state, player)];
        hoverFrame = { map: worldMap, markers: worldMarkers };
        worldMap.draw(ctx, {
          markers: worldMarkers,
          routes: mapExperimentEnabled("no-world-route-dup") ? [] : routes,
          labels
        });
        drawWorldMapChrome(ctx, canvas, worldMap, player);
        drawWorldMapLegend(ctx, currentWorldLegendLayout, mapFilters);
        return;
      }

      if (!minimapVisible) {
        minimapLayout = undefined;
        currentWorldLegendLayout = undefined;
        hoverFrame = undefined;
        mapTooltip.close();
        return;
      }
      currentWorldLegendLayout = undefined;
      const size = clamp(Math.min(canvas.width, canvas.height) * 0.22, 126, 172);
      const x = Math.max(18, canvas.width - size - 22);
      const y = 68;
      minimapLayout = { x, y, size };
      minimap
        .setViewport(x, y, size, size)
        .setZoom(minimapZoom(size, minimapZoomScale))
        .update(0, player?.x ?? 0, player?.y ?? 0, heading);
      const minimapFrame = minimapMarkerFrame(state, player, heading);
      hoverFrame = { map: minimap, markers: minimapFrame.markers };
      minimap.draw(ctx, {
        markers: minimapFrame.markers,
        routes: mapExperimentEnabled("skip-minimap-routes") ? [] : miniRoutes
      });
      drawMinimapChrome(ctx, minimap, x, y, size, minimapFrame.hintA, minimapFrame.hintB, heading, mapFilters);
      drawMinimapLegend(ctx, minimapLayout, mapFilters);
    }
  };
}
