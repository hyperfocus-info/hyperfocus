import { canvasPointFromClient, GameMap, type MapMarker } from "@hyperfocus/engine";
import { createHtmlTooltip, createHtmlTooltipOutlet, type HtmlTooltip } from "@hyperfocus/engine/ui";
import type { FactionVisualId } from "../data/world-landmarks.ts";
import { currentUtcDateString, dailyQuestArcForDate } from "../data/daily-quests.ts";
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
import { type MmoSkillDemoState, type PlayerEntity } from "../shared-contracts.ts";
import { TILE } from "./world.ts";

export type MapOverlayView = {
  minimapOpen: boolean;
  worldMapOpen: boolean;
};

export type CanvasInputEvent = MouseEvent | PointerEvent | WheelEvent;
export type RegionalPoint = { x: number; y: number };
export type MapFilterId = "gatherables";
export type MapFilterState = Record<MapFilterId, boolean>;
export type MapNodeTooltipInfo = { title: string; lines: string[] };
export type HoverMapMarker = MapMarker & { tooltip?: MapNodeTooltipInfo; hoverRadius?: number };
export type LegendItem = { iconId?: string; color?: string; label: string; description: string; filterId?: MapFilterId };
export type MinimapControlId = "resetZoom" | "zoomIn" | "zoomOut" | "toggleGatherables";
export type MinimapLayout = { x: number; y: number; size: number };
export type SmoothWorldZoom = { targetZoom: number; x: number; y: number };
export type MapHoverFrame = { map: GameMap; markers: readonly HoverMapMarker[] };
export type BiomePaint = {
  base: string;
  wash: string;
  light: string;
  shade: string;
  ink: string;
  route: string;
};
export type ObjectiveMarkerKind = "main" | "side" | "event";

export type MapOverlayInputOptions<TWorldLegendLayout> = {
  canvas: HTMLCanvasElement;
  worldMap: GameMap;
  mapFilters: MapFilterState;
  mapTooltip: { show(event: PointerEvent, info: MapNodeTooltipInfo): void; close(): void };
  worldOpen: () => boolean;
  minimapVisible: () => boolean;
  minimapLayout: () => MinimapLayout | undefined;
  worldLegendLayout: () => TWorldLegendLayout | undefined;
  hoverFrame: () => MapHoverFrame | undefined;
  invalidateMinimapCache(): void;
  minimapControlAt(layout: MinimapLayout | undefined, point: RegionalPoint): MinimapControlId | undefined;
  worldLegendFilterAt(layout: TWorldLegendLayout, point: RegionalPoint): MapFilterId | undefined;
  pointInsideWorldLegend(layout: TWorldLegendLayout, point: RegionalPoint): boolean;
  worldLegendItemAt(layout: TWorldLegendLayout, point: RegionalPoint): LegendItem | undefined;
  minimapLegendItemAt(layout: MinimapLayout, point: RegionalPoint): LegendItem | undefined;
  legendTooltip(item: LegendItem): MapNodeTooltipInfo;
  onWorldMapFit(): void;
};
export type MapPerfExperiment =
  | "control"
  | "coarse-minimap-terrain"
  | "cache-minimap-markers"
  | "skip-minimap-routes"
  | "coarse-world-terrain"
  | "world-terrain-texture"
  | "no-world-route-dup"
  | "compact-world-labels"
  | "combined";

export const REGIONAL_TILE_X = 2;
export const REGIONAL_TILE_Y = 18;
export const REGIONAL_DRAW_STEP = 4;
export const REGIONAL_WIDTH = MAP_WIDTH * REGIONAL_TILE_X;
export const REGIONAL_HEIGHT = MAP_HEIGHT * REGIONAL_TILE_Y;
export const MINIMAP_MIN_ZOOM = 0.06;
export const MINIMAP_MAX_ZOOM = 0.16;
export const WORLD_MAP_MIN_ZOOM = 0.16;
export const WORLD_MAP_MAX_ZOOM = 1.2;
export const SUPPORT_NPC_ROLES = new Set(["quest", "trainer", "bank", "merchant", "travel", "contract", "crafting", "home", "hidden"]);
export const ANCHORS = resolveRegionAnchors();
export const ANCHOR_BY_ID = new Map(ANCHORS.map((anchor) => [anchor.id, anchor]));
export const ZONE_LABEL_BY_ID = new Map<string, string>(mmoSkillDemoRegionConfig.zones.map((zone) => [zone.id, zone.label]));
export const QUEST_ANCHOR_BY_ID = new Map(mmoSkillDemoRegionConfig.quests.map((quest) => [quest.id, quest.anchorId]));
export const WORLD_EVENT_ANCHOR_BY_ID: Record<string, string> = {
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
export const EVENT_ANCHOR_BY_ZONE: Partial<Record<RegionZoneId, string>> = {
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
export const ROUTE_PAIRS = [
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
export const BIOME_PAINT: Record<RegionZoneId, BiomePaint> = {
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
export const ROUTE_STYLES = [
  { color: "#f4d184", shadow: "rgba(93, 62, 33, 0.52)", dash: [1, 10] as const },
  { color: "#9de5c0", shadow: "rgba(25, 75, 58, 0.45)", dash: [12, 8] as const },
  { color: "#ffb873", shadow: "rgba(96, 54, 31, 0.5)", dash: [5, 8] as const }
] as const;
export const LEGEND_ITEMS: LegendItem[] = [
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
export const DEFAULT_MAP_FILTERS = { gatherables: true };
export const WORLD_LEGEND_STYLE = {
  panelFill: "rgba(7, 14, 18, 0.86)",
  panelStroke: "rgba(244, 211, 107, 0.62)",
  textColor: "#f5f3e8",
  font: "700 11px system-ui",
  rowHeight: 20,
  padding: 10,
  glyphSize: 9
} as const;
export const MAP_PERF_EXPERIMENTS = new Set<MapPerfExperiment>([
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
export const COMBINED_MAP_PERF_EXPERIMENTS = new Set<MapPerfExperiment>([
  "coarse-minimap-terrain",
  "cache-minimap-markers",
  "skip-minimap-routes",
  "coarse-world-terrain",
  "world-terrain-texture",
  "no-world-route-dup"
]);

function isMapPerfExperiment(value: unknown): value is MapPerfExperiment {
  return typeof value === "string" && Array.from(MAP_PERF_EXPERIMENTS).some((experiment) => experiment === value);
}

export function activeMapPerfExperiment(): MapPerfExperiment {
  const value = Reflect.get(globalThis, "__mmoSkillDemoMapPerfExperiment");
  return isMapPerfExperiment(value) ? value : "combined";
}

export function mapExperimentEnabled(experiment: Exclude<MapPerfExperiment, "control" | "combined">) {
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

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function labelize(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function upperLabel(value: string) {
  return labelize(value).toUpperCase();
}

export function zoneLabel(value: string) {
  return ZONE_LABEL_BY_ID.get(value) ?? labelize(value);
}

export function entityName(entity: { name?: string; kind?: string; id: string }) {
  return entity.name || (entity.kind ? labelize(entity.kind) : labelize(entity.id));
}

export function itemAmountLine(amount: number | undefined) {
  return `Amount ${Math.max(1, Math.floor(amount ?? 1))}`;
}

export function regionVisualIdForTile(tileX: number, tileY: number): FactionVisualId {
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

export function worldToRegional(worldX: number, worldY: number): RegionalPoint {
  return {
    x: worldX / TILE * REGIONAL_TILE_X,
    y: worldY / TILE * REGIONAL_TILE_Y
  };
}

export function anchorRegionalPoint(anchorId: string): RegionalPoint {
  const anchor = ANCHOR_BY_ID.get(anchorId);
  if (!anchor) return { x: 0, y: 0 };
  return {
    x: (anchor.tileX + 0.5) * REGIONAL_TILE_X,
    y: (anchor.tileY + 0.5) * REGIONAL_TILE_Y
  };
}

export function anchorWorldPoint(anchorId: string): RegionalPoint {
  const anchor = ANCHOR_BY_ID.get(anchorId);
  if (!anchor) return { x: 0, y: 0 };
  return {
    x: (anchor.tileX + 0.5) * TILE,
    y: (anchor.tileY + 0.5) * TILE
  };
}

export function playerHeading(player: PlayerEntity | undefined) {
  if (!player) return 0;
  const dx = (player.aimX ?? player.x) - player.x;
  const dy = (player.aimY ?? player.y) - player.y;
  return Math.hypot(dx, dy) > 0.1 ? Math.atan2(dy, dx) : 0;
}

export function canvasPoint(canvas: HTMLCanvasElement, event: CanvasInputEvent) {
  return canvasPointFromClient(canvas, event.clientX, event.clientY);
}

export function createMapOverlayInputController<TWorldLegendLayout>(options: MapOverlayInputOptions<TWorldLegendLayout>) {
  const { canvas, worldMap, mapFilters, mapTooltip } = options;
  let activeWorldPointerId: number | undefined;
  let minimapMouseBlockUntilMs = Number.NEGATIVE_INFINITY;
  let minimapZoomScale = 1;
  let smoothWorldZoom: SmoothWorldZoom | undefined;

  function consumeCanvasInput(event: Event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function handleMinimapPointer(event: PointerEvent) {
    if (options.worldOpen() || !options.minimapVisible()) return false;
    const control = options.minimapControlAt(options.minimapLayout(), canvasPoint(canvas, event));
    if (!control) return false;
    if (control === "toggleGatherables") {
      toggleMapFilter(mapFilters, "gatherables");
      options.invalidateMinimapCache();
    } else if (control === "resetZoom") minimapZoomScale = 1;
    else if (control === "zoomIn") minimapZoomScale = clamp(minimapZoomScale * 1.2, 0.7, 1.8);
    else minimapZoomScale = clamp(minimapZoomScale / 1.2, 0.7, 1.8);
    minimapMouseBlockUntilMs = performance.now() + 180;
    consumeCanvasInput(event);
    return true;
  }

  function handleWorldLegendPointer(event: PointerEvent) {
    const layout = options.worldLegendLayout();
    if (!options.worldOpen() || !layout) return false;
    const point = canvasPoint(canvas, event);
    const filterId = options.worldLegendFilterAt(layout, point);
    if (filterId) {
      toggleMapFilter(mapFilters, filterId);
      options.invalidateMinimapCache();
    }
    if (!filterId && !options.pointInsideWorldLegend(layout, point)) return false;
    consumeCanvasInput(event);
    return true;
  }

  function handleWorldPointer(event: PointerEvent, kind: "pressed" | "moved" | "released") {
    if (!options.worldOpen()) return;
    const point = canvasPoint(canvas, event);
    if (kind === "pressed") activeWorldPointerId = event.pointerId;
    else if (activeWorldPointerId !== event.pointerId) {
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
    if (kind === "pressed") canvas.setPointerCapture(event.pointerId);
    if (kind !== "released") return;
    activeWorldPointerId = undefined;
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer may already be released by the browser.
    }
  }

  function blockGameplayMouse(event: Event) {
    if (!options.worldOpen() && performance.now() >= minimapMouseBlockUntilMs) return;
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

  function updateMapTooltip(event: PointerEvent) {
    if (activeWorldPointerId !== undefined) {
      mapTooltip.close();
      return;
    }
    const point = canvasPoint(canvas, event);
    const worldLegend = options.worldLegendLayout();
    const minimap = options.minimapLayout();
    const legendItem = options.worldOpen() && worldLegend
      ? options.worldLegendItemAt(worldLegend, point)
      : options.minimapVisible() && minimap
        ? options.minimapLegendItemAt(minimap, point)
        : undefined;
    const tooltipInfo = legendItem ? options.legendTooltip(legendItem) : mapMarkerAt(options.hoverFrame(), point);
    if (!tooltipInfo) mapTooltip.close();
    else mapTooltip.show(event, tooltipInfo);
  }

  canvas.addEventListener("pointerdown", (event) => {
    mapTooltip.close();
    if (handleMinimapPointer(event) || handleWorldLegendPointer(event)) return;
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
    if (!options.worldOpen()) return;
    mapTooltip.close();
    queueSmoothWorldZoom(canvasPoint(canvas, event), event.deltaY);
    consumeCanvasInput(event);
  }, { passive: false });
  canvas.addEventListener("mousedown", blockGameplayMouse, true);
  canvas.addEventListener("mousemove", blockGameplayMouse, true);
  canvas.addEventListener("mouseup", blockGameplayMouse, true);
  canvas.addEventListener("contextmenu", blockGameplayMouse, true);

  return {
    fitWorldMap() {
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
      options.onWorldMapFit();
    },
    resetWorldInteraction() {
      activeWorldPointerId = undefined;
      smoothWorldZoom = undefined;
      worldMap.handleInput({ down: false, released: true });
    },
    stepSmoothWorldZoom() {
      if (!smoothWorldZoom) return;
      const currentZoom = worldMap.state().zoom;
      const nextZoom = currentZoom + (smoothWorldZoom.targetZoom - currentZoom) * 0.24;
      const settled = Math.abs(nextZoom - smoothWorldZoom.targetZoom) < 0.002;
      const targetZoom = settled ? smoothWorldZoom.targetZoom : nextZoom;
      if (currentZoom > 0) {
        worldMap.handleInput({ x: smoothWorldZoom.x, y: smoothWorldZoom.y, zoomDelta: targetZoom / currentZoom - 1 });
      }
      if (settled) smoothWorldZoom = undefined;
    },
    minimapZoomScale: () => minimapZoomScale
  };
}

export function tooltipSignature(info: MapNodeTooltipInfo) {
  return `${info.title}\n${info.lines.join("\n")}`;
}

export function createMapTooltip(canvas: HTMLCanvasElement) {
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

export function mapMarkerAt(frame: MapHoverFrame | undefined, point: RegionalPoint): MapNodeTooltipInfo | undefined {
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

export function tileAt(tiles: readonly number[], tileX: number, tileY: number) {
  if (tileX < 0 || tileY < 0 || tileX >= MAP_WIDTH || tileY >= MAP_HEIGHT) return TILE_WATER;
  return tiles[tileY * MAP_WIDTH + tileX] ?? TILE_WATER;
}

export function biomePaintForTile(tileX: number, tileY: number): BiomePaint {
  return BIOME_PAINT[authoredZoneForMmoSkillDemoTile(tileX, tileY)];
}

export function tileNoise(tileX: number, tileY: number, salt: number) {
  const value = Math.sin(tileX * 12.9898 + tileY * 78.233 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

export function terrainColor(tile: number, tileX: number, tileY: number, compact: boolean) {
  const paint = biomePaintForTile(tileX, tileY);
  if (tile === TILE_WATER) return compact ? "#1b6470" : "#2d8c9a";
  if (tile === TILE_PATH) return compact ? "#b8975c" : paint.route;
  if (tile === TILE_BANK) return compact ? paint.light : "#f1d37b";
  if (tile === TILE_TREE) return compact ? paint.shade : "#315e36";
  if (tile === TILE_ORE || tile === TILE_ROCK) return compact ? "#6b6e6a" : "#8d887b";
  return compact ? paint.base : paint.wash;
}

export function shortAnchorLabel(value: string) {
  return value.replace(/\s*\(.+\)\s*$/, "");
}

export function eventAnchorId(state: MmoSkillDemoState): string | undefined {
  return WORLD_EVENT_ANCHOR_BY_ID[state.worldEventId] ?? EVENT_ANCHOR_BY_ZONE[state.worldEventZoneId];
}

export function activeQuestAnchorId(player: PlayerEntity | undefined): string | undefined {
  if (!player) return undefined;
  const activeAnchor = QUEST_ANCHOR_BY_ID.get(player.activeQuestId);
  if (activeAnchor && !player.questFlags[player.activeQuestId]) return activeAnchor;
  for (const quest of mmoSkillDemoRegionConfig.quests) {
    if (player.questFlags[`${quest.id}-ready`] && !player.questFlags[quest.id]) return quest.anchorId;
    if (player.questFlags[`${quest.id}-accepted`] && !player.questFlags[quest.id]) return quest.anchorId;
  }
  return activeAnchor;
}

export function dailyQuestAnchorId(player: PlayerEntity | undefined): string | undefined {
  if (!player || player.dailyQuestCompleted) return undefined;
  const arc = dailyQuestArcForDate(player.dailyQuestDate || currentUtcDateString());
  return arc.steps[player.dailyQuestStep || 0]?.anchorId;
}

export function routeStyle(index: number) {
  return ROUTE_STYLES[index % ROUTE_STYLES.length];
}

export function routeControlPoints(from: RegionalPoint, to: RegionalPoint, index: number, bendScale: number): RegionalPoint[] {
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
