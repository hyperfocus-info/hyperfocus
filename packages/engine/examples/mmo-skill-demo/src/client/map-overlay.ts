import { GameMap, type MapRoute, type ZoneLabel } from "@hyperfocus/engine";
import { factionZoneVisuals } from "../data/assets.ts";
import type { FactionVisualId } from "../data/world-landmarks.ts";
import { worldGatherableNodeSpecs, worldGatherableNodeSpecsById } from "../data/world-gatherables.ts";
import { mmoSkillDemoRegionConfig } from "../data/world.ts";
import { type LootEntity, type MmoSkillDemoState, type NpcEntity, type PlayerEntity } from "../shared-contracts.ts";
import {
  gatherableMarkerColor,
  gatherableMarkerRadius,
  mapNodeTooltipInfoForResource,
  materialTierForResource
} from "./map-overlay-resource.ts";
import {
  type MapOverlayView,
  type RegionalPoint,
  type MapFilterState,
  type MapNodeTooltipInfo,
  type HoverMapMarker,
  type MinimapControlId,
  type MinimapLayout,
  type MapHoverFrame,
  type ObjectiveMarkerKind,
  REGIONAL_TILE_X,
  REGIONAL_TILE_Y,
  REGIONAL_WIDTH,
  REGIONAL_HEIGHT,
  MINIMAP_MIN_ZOOM,
  MINIMAP_MAX_ZOOM,
  WORLD_MAP_MIN_ZOOM,
  WORLD_MAP_MAX_ZOOM,
  SUPPORT_NPC_ROLES,
  ANCHORS,
  ANCHOR_BY_ID,
  ROUTE_PAIRS,
  BIOME_PAINT,
  mapExperimentEnabled,
  createDefaultMapFilterState,
  mapFilterSignature,
  clamp,
  labelize,
  upperLabel,
  zoneLabel,
  entityName,
  itemAmountLine,
  regionVisualIdForTile,
  worldToRegional,
  anchorRegionalPoint,
  anchorWorldPoint,
  playerHeading,
  createMapTooltip,
  createMapOverlayInputController,
  shortAnchorLabel,
  eventAnchorId,
  activeQuestAnchorId,
  dailyQuestAnchorId,
  routeStyle,
  routeControlPoints,
} from "./map-overlay-data.ts";
import {
  drawStar,
  drawDiamond,
  drawRouteMarker,
  drawPlayerMarker,
  drawDot,
  worldLegendLayout,
  pointInsideRect,
  worldLegendFilterAt,
  legendItemAt,
  legendTooltip,
  drawWorldMapLegend,
  drawMinimapLegend,
  minimapLegendItemAt,
  drawLandmarkIcon,
  drawObjectiveMarker,
  drawRegionalTerrain,
  drawMinimapTerrain,
  createRegionalTerrainTexture,
} from "./map-overlay-paint.ts";

export {
  createDefaultMapFilterState,
  mapFilterSignature,
  toggleMapFilter
} from "./map-overlay-data.ts";
export type {
  MapFilterId,
  MapFilterState,
  MapNodeTooltipInfo,
  MapOverlayView
} from "./map-overlay-data.ts";
export { mapNodeTooltipInfoForResource } from "./map-overlay-resource.ts";
export type { ResourceMarkerSource } from "./map-overlay-resource.ts";






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
    const visualId: FactionVisualId = anchor.regionLabel === "Whisperwind Ascent"
      ? "high-reach-peaks"
      : regionVisualIdForTile(anchor.tileX, anchor.tileY);
    const visual = factionZoneVisuals[visualId];
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
    };
  });
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
  let minimapVisible = false;
  let minimapLayout: MinimapLayout | undefined;
  let currentWorldLegendLayout: ReturnType<typeof worldLegendLayout> | undefined;
  const mapFilters = createDefaultMapFilterState();
  let hoverFrame: MapHoverFrame | undefined;
  const mapTooltip = createMapTooltip(canvas);

  const inputController = createMapOverlayInputController({
    canvas,
    worldMap,
    mapFilters,
    mapTooltip,
    worldOpen: () => worldOpen,
    minimapVisible: () => minimapVisible,
    minimapLayout: () => minimapLayout,
    worldLegendLayout: () => currentWorldLegendLayout,
    hoverFrame: () => hoverFrame,
    invalidateMinimapCache: () => {
      cachedMinimapSignature = "";
    },
    minimapControlAt,
    worldLegendFilterAt,
    pointInsideWorldLegend: pointInsideRect,
    worldLegendItemAt: legendItemAt,
    minimapLegendItemAt,
    legendTooltip,
    onWorldMapFit: () => {
      mapNeedsFit = false;
    }
  });

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
        }
      ]
      : cachedMinimapMarkers;
    return { markers, hintA: cachedMinimapHintA, hintB: cachedMinimapHintB };
  }

  return {
    draw(state: MmoSkillDemoState, player: PlayerEntity | undefined, view: MapOverlayView): void {
      const heading = playerHeading(player);
      worldOpen = view.worldMapOpen;
      minimapVisible = view.minimapOpen && !worldOpen;
      if (worldOpen && (!wasWorldOpen || mapNeedsFit)) inputController.fitWorldMap();
      if (!worldOpen) inputController.resetWorldInteraction();
      wasWorldOpen = worldOpen;
      if (worldOpen) {
        minimapLayout = undefined;
        currentWorldLegendLayout = worldLegendLayout(canvas);
        inputController.stepSmoothWorldZoom();
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
        .setZoom(minimapZoom(size, inputController.minimapZoomScale()))
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
