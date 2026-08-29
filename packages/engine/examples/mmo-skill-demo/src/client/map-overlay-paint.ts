import {
  type RegionalPoint,
  type MapFilterId,
  type MapFilterState,
  type MapNodeTooltipInfo,
  type LegendItem,
  type MinimapLayout,
  type ObjectiveMarkerKind,
  REGIONAL_TILE_X,
  REGIONAL_TILE_Y,
  REGIONAL_DRAW_STEP,
  REGIONAL_WIDTH,
  REGIONAL_HEIGHT,
  ANCHORS,
  ROUTE_PAIRS,
  BIOME_PAINT,
  LEGEND_ITEMS,
  WORLD_LEGEND_STYLE,
  mapExperimentEnabled,
  clamp,
  anchorRegionalPoint,
  tileAt,
  biomePaintForTile,
  tileNoise,
  terrainColor,
  shortAnchorLabel,
  routeStyle,
  routeControlPoints
} from "./map-overlay-data.ts";
import {
  authoredZoneForMmoSkillDemoTile,
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_BANK,
  TILE_PATH,
  TILE_WATER
} from "../data/world.ts";
import { TILE } from "./world.ts";

type MapPaintContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function traceCurvedPath(ctx: MapPaintContext, points: readonly RegionalPoint[]) {
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

export function drawStar(ctx: MapPaintContext, x: number, y: number, radius: number, fill: string, stroke = "rgba(16, 12, 4, 0.86)") {
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

export function drawDiamond(ctx: MapPaintContext, x: number, y: number, radius: number, fill: string) {
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

export function drawLabelBadge(ctx: MapPaintContext, x: number, y: number, text: string, fill = "rgba(8, 13, 13, 0.82)", color = "#f5f3e8") {
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

export function drawRouteMarker(ctx: MapPaintContext, x: number, y: number, color: string, glyph: string) {
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

export function drawPlayerMarker(ctx: MapPaintContext, x: number, y: number, heading: number, large = false) {
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

export function drawDot(ctx: MapPaintContext, x: number, y: number, color: string, radius = 5, glyph = "") {
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

export function drawCheckBox(ctx: MapPaintContext, x: number, y: number, checked: boolean) {
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

export function worldLegendLayout(canvas: HTMLCanvasElement) {
  return {
    x: Math.max(36, canvas.width - 326),
    y: Math.max(96, canvas.height - 232),
    w: 290,
    h: 184
  };
}

export function worldLegendMetrics(layout: ReturnType<typeof worldLegendLayout>) {
  const padding = WORLD_LEGEND_STYLE.padding;
  const rowHeight = WORLD_LEGEND_STYLE.rowHeight;
  const rowsPerColumn = Math.max(1, Math.floor((layout.h - padding * 2) / rowHeight));
  const columns = Math.max(1, Math.ceil(LEGEND_ITEMS.length / rowsPerColumn));
  const colWidth = (layout.w - padding * 2) / columns;
  return { padding, rowHeight, rowsPerColumn, colWidth };
}

export function worldLegendItemRect(layout: ReturnType<typeof worldLegendLayout>, index: number) {
  const { padding, rowHeight, rowsPerColumn, colWidth } = worldLegendMetrics(layout);
  const column = Math.floor(index / rowsPerColumn);
  const row = index % rowsPerColumn;
  const x = layout.x + padding + column * colWidth;
  const y = layout.y + padding + row * rowHeight;
  return { x, y, w: colWidth, h: rowHeight };
}

export function pointInsideRect(rect: { x: number; y: number; w: number; h: number }, point: RegionalPoint) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

export function worldLegendFilterAt(layout: ReturnType<typeof worldLegendLayout>, point: RegionalPoint): MapFilterId | undefined {
  for (let index = 0; index < LEGEND_ITEMS.length; index += 1) {
    const filterId = LEGEND_ITEMS[index]?.filterId;
    if (!filterId) continue;
    if (pointInsideRect(worldLegendItemRect(layout, index), point)) return filterId;
  }
  return undefined;
}

export function legendItemAt(layout: ReturnType<typeof worldLegendLayout>, point: RegionalPoint): LegendItem | undefined {
  for (let index = 0; index < LEGEND_ITEMS.length; index += 1) {
    if (pointInsideRect(worldLegendItemRect(layout, index), point)) return LEGEND_ITEMS[index];
  }
  return undefined;
}

export function legendTooltip(item: LegendItem): MapNodeTooltipInfo {
  return {
    title: item.label,
    lines: [item.description, item.filterId ? "Click row to toggle this category." : "Map symbol category."]
  };
}

export function drawWorldMapLegend(ctx: MapPaintContext, layout: ReturnType<typeof worldLegendLayout>, filters: MapFilterState): void {
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

export function drawMinimapLegend(ctx: MapPaintContext, layout: MinimapLayout, filters: MapFilterState) {
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

export function minimapLegendItems() {
  return LEGEND_ITEMS.filter((item) => ["Town Anchor", "Dungeon", "Main Quest", "Travel NPC", "Gatherable Node", "Player"].includes(item.label));
}

export function minimapLegendItemRect(layout: MinimapLayout, index: number) {
  const x = layout.x - 2;
  const y = layout.y + layout.size + 18;
  const w = layout.size + 4;
  const col = index % 2;
  const row = Math.floor(index / 2);
  return { x: x + col * (w * 0.5), y: y + row * 16, w: w * 0.5, h: 16 };
}

export function minimapLegendItemAt(layout: MinimapLayout, point: RegionalPoint): LegendItem | undefined {
  const items = minimapLegendItems();
  for (let index = 0; index < items.length; index += 1) {
    if (pointInsideRect(minimapLegendItemRect(layout, index), point)) return items[index];
  }
  return undefined;
}

export function landmarkGlyph(anchor: (typeof ANCHORS)[number]) {
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

export function drawLandmarkIcon(ctx: MapPaintContext, x: number, y: number, anchor: (typeof ANCHORS)[number], color: string, label = true) {
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

export function drawObjectiveMarker(ctx: MapPaintContext, x: number, y: number, kind: ObjectiveMarkerKind, label: string) {
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

export function drawPaintedRegionalRoutes(ctx: MapPaintContext) {
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

export function drawRegionalMapGrain(ctx: MapPaintContext, tileX: number, tileY: number, tile: number) {
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

export function drawRegionalTerrain(ctx: MapPaintContext, tiles: readonly number[], bounds: { minX: number; minY: number; maxX: number; maxY: number }) {
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

export function drawMinimapTerrain(ctx: MapPaintContext, tiles: readonly number[], bounds: { minX: number; minY: number; maxX: number; maxY: number }) {
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

export function createMapTextureCanvas(width: number, height: number) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return undefined;
}

export function createRegionalTerrainTexture(tiles: readonly number[]) {
  const canvas = createMapTextureCanvas(REGIONAL_WIDTH, REGIONAL_HEIGHT);
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return undefined;
  drawRegionalTerrain(ctx, tiles, { minX: 0, minY: 0, maxX: REGIONAL_WIDTH, maxY: REGIONAL_HEIGHT });
  return {
    image: canvas,
    worldWidth: REGIONAL_WIDTH,
    worldHeight: REGIONAL_HEIGHT
  };
}
