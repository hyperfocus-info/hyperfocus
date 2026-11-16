import { assertPositiveFinite, assertFinite, assertNonNegativeFinite } from "./validation.ts";
import { finiteOr } from "@hyperfocus/utilities/math";
import { getSprite } from "../canvas/drawing.ts";
import { clamp } from "../math/collision.ts";

export type GameMapMode = "FOLLOW_TARGET" | "FREE_PAN";
export type GameMapShape = "circle" | "rectangle";

export type MapWorldBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type MapMarker = {
  id: string;
  worldX: number;
  worldY: number;
  iconId?: string;
  color?: string;
  text?: string;
  scale?: number;
  clampToEdge?: boolean;
  onDraw?: (ctx: CanvasRenderingContext2D, mapX: number, mapY: number) => void;
};

export type MapRouteGradient = {
  from: string;
  to: string;
};

export type MapRoute = {
  points: readonly { x: number; y: number }[];
  color: string;
  lineWidth: number;
  dashPattern?: readonly number[];
  gradient?: MapRouteGradient;
  segmentColors?: readonly string[];
  phaseOffset?: number;
};

export type ZoneLabel = {
  text: string;
  worldX: number;
  worldY: number;
  font: string;
  color: string;
  minZoomToShow?: number;
};

export type MapBorderStyle = {
  color?: string;
  accentColor?: string;
  lineWidth?: number;
  tickCount?: number;
};

export type MapCompassCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type MapCompassOptions = {
  x?: number;
  y?: number;
  radius?: number;
  corner?: MapCompassCorner;
  margin?: number;
  color?: string;
  accentColor?: string;
  labelColor?: string;
  font?: string;
  rotationRad?: number;
};

export type MapOptions = {
  shape: GameMapShape;
  pixelX: number;
  pixelY: number;
  width: number;
  height: number;
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  mode: GameMapMode;
  rotateWithTracking?: boolean;
  centerWorldX?: number;
  centerWorldY?: number;
  labelFadeZoomRange?: number;
  wheelZoomSpeed?: number;
  borderStyle?: false | MapBorderStyle;
  compass?: false | MapCompassOptions;
  onDrawTerrain?: (ctx: CanvasRenderingContext2D, bounds: MapWorldBounds) => void;
  terrainTexture?: {
    image: CanvasImageSource;
    worldWidth: number;
    worldHeight: number;
  };
};

export type MapPointerInputState = {
  x?: number;
  y?: number;
  pointerX?: number;
  pointerY?: number;
  down?: boolean;
  pressed?: boolean;
  released?: boolean;
  moved?: boolean;
  wheelDeltaY?: number;
  deltaY?: number;
  wheelY?: number;
  zoomDelta?: number;
  zoomSpeed?: number;
};

export type GameMapDrawData = {
  markers: readonly MapMarker[];
  routes?: readonly MapRoute[];
  labels?: readonly ZoneLabel[];
};

export type MapLegendLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type MapLegendItem = {
  iconId?: string;
  color?: string;
  label: string;
};

export type MapLegendStyle = {
  panelFill?: string | CanvasGradient | CanvasPattern;
  panelStroke?: string | CanvasGradient | CanvasPattern;
  textColor?: string | CanvasGradient | CanvasPattern;
  font?: string;
  rowHeight?: number;
  padding?: number;
  glyphSize?: number;
};

export type GameMapState = {
  centerWorldX: number;
  centerWorldY: number;
  zoom: number;
  rotationRad: number;
  mode: GameMapMode;
  bounds: MapWorldBounds;
};

type MapSpacePoint = {
  x: number;
  y: number;
  offMap: boolean;
};

const DEFAULT_LABEL_FADE_ZOOM_RANGE = 0.25;
const DEFAULT_WHEEL_ZOOM_SPEED = 0.0015;
const MAX_BORDER_TICKS = 4096;
const EMPTY_DASH: number[] = [];









function boundsOverlap(a: MapWorldBounds, b: MapWorldBounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function routeBounds(route: MapRoute): MapWorldBounds | undefined {
  if (route.points.length === 0) return undefined;
  if (!Number.isFinite(route.lineWidth) || route.lineWidth < 0) return undefined;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of route.points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  const pad = Math.max(0, route.lineWidth);
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function imageSize(image: CanvasImageSource): { width: number; height: number } {
  const naturalWidth = Reflect.get(image, "naturalWidth");
  const naturalHeight = Reflect.get(image, "naturalHeight");
  if (typeof naturalWidth === "number" && naturalWidth > 0 && typeof naturalHeight === "number" && naturalHeight > 0) {
    return { width: naturalWidth, height: naturalHeight };
  }
  const videoWidth = Reflect.get(image, "videoWidth");
  const videoHeight = Reflect.get(image, "videoHeight");
  if (typeof videoWidth === "number" && videoWidth > 0 && typeof videoHeight === "number" && videoHeight > 0) {
    return { width: videoWidth, height: videoHeight };
  }
  const width = Reflect.get(image, "width");
  const height = Reflect.get(image, "height");
  return {
    width: typeof width === "number" ? width : 0,
    height: typeof height === "number" ? height : 0,
  };
}

export type GameMap = {
  update(dt: number, trackWorldX?: number, trackWorldY?: number, headingRad?: number): void;
  handleInput(pointerInputState: MapPointerInputState): void;
  worldToMapSpace(worldX: number, worldY: number): MapSpacePoint;
  screenToWorldSpace(mapX: number, mapY: number): { x: number; y: number };
  visibleWorldBounds(): MapWorldBounds;
  state(): GameMapState;
  setMode(mode: GameMapMode): GameMap;
  setCenter(worldX: number, worldY: number): GameMap;
  setZoom(zoom: number): GameMap;
  setViewport(pixelX: number, pixelY: number, width?: number, height?: number): GameMap;
  draw(ctx: CanvasRenderingContext2D, data: GameMapDrawData): void;
  drawLegend(ctx: CanvasRenderingContext2D, layout: MapLegendLayout, items: readonly MapLegendItem[], style?: MapLegendStyle): void;
  drawCompassRose(ctx: CanvasRenderingContext2D, options?: MapCompassOptions): void;
};

type GameMapFactory = {
  (options: MapOptions): GameMap;
  new(options: MapOptions): GameMap;
  readonly prototype: object;
};

type GameMapFields = {
  shape: GameMapShape;
  minZoom: number;
  maxZoom: number;
  rotateWithTracking: boolean;
  terrainTexture: MapOptions["terrainTexture"];
  onDrawTerrain: MapOptions["onDrawTerrain"];
  labelFadeZoomRange: number;
  wheelZoomSpeed: number;
  borderStyle: false | Required<MapBorderStyle>;
  compass: false | MapCompassOptions;
  pixelX: number;
  pixelY: number;
  width: number;
  height: number;
  zoom: number;
  mode: GameMapMode;
  centerWorldX: number;
  centerWorldY: number;
  rotationRad: number;
  dragging: boolean;
  dragX: number;
  dragY: number;
};

type GameMapPrivateMethods = {
  projectWorld(worldX: number, worldY: number): { x: number; y: number };
  pointInsideViewport(x: number, y: number): boolean;
  zoomAroundMapPoint(nextZoom: number, mapX: number, mapY: number): void;
  clipViewport(ctx: CanvasRenderingContext2D): void;
  drawTerrain(ctx: CanvasRenderingContext2D, bounds: MapWorldBounds): void;
  drawRoutes(ctx: CanvasRenderingContext2D, routes: readonly MapRoute[], bounds: MapWorldBounds): void;
  drawSingleRoute(ctx: CanvasRenderingContext2D, route: MapRoute): void;
  drawSegmentColoredRoute(ctx: CanvasRenderingContext2D, route: MapRoute): void;
  routeStrokeStyle(ctx: CanvasRenderingContext2D, route: MapRoute, start: MapSpacePoint, end: MapSpacePoint): string | CanvasGradient;
  drawLabels(ctx: CanvasRenderingContext2D, labels: readonly ZoneLabel[], bounds: MapWorldBounds): void;
  labelAlpha(label: ZoneLabel): number;
  drawMarkers(ctx: CanvasRenderingContext2D, markers: readonly MapMarker[], bounds: MapWorldBounds): void;
  drawMarker(ctx: CanvasRenderingContext2D, marker: MapMarker, x: number, y: number, clampedToEdge: boolean): void;
  clampMapPoint(x: number, y: number): { x: number; y: number };
  drawBorder(ctx: CanvasRenderingContext2D): void;
  drawBorderTicks(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, style: Required<MapBorderStyle>): void;
  drawLegendGlyph(ctx: CanvasRenderingContext2D, item: MapLegendItem, x: number, y: number, glyphSize: number): void;
  compassPosition(corner: MapCompassCorner, radius: number, margin: number): { x: number; y: number };
};

type InternalGameMap = GameMap & GameMapFields & GameMapPrivateMethods;

const gameMapPublicMethods = {
update(this: InternalGameMap, _dt: number, trackWorldX?: number, trackWorldY?: number, headingRad?: number): void {
    if (this.mode === "FOLLOW_TARGET" && trackWorldX !== undefined && trackWorldY !== undefined && Number.isFinite(trackWorldX) && Number.isFinite(trackWorldY)) {
      this.centerWorldX = trackWorldX;
      this.centerWorldY = trackWorldY;
    }

    if (this.mode === "FOLLOW_TARGET" && this.rotateWithTracking && headingRad !== undefined && Number.isFinite(headingRad)) {
      this.rotationRad = headingRad;
    } else if (!this.rotateWithTracking) {
      this.rotationRad = 0;
    }
  },

handleInput(this: InternalGameMap, pointerInputState: MapPointerInputState): void {
    if (this.mode !== "FREE_PAN") return;

    const pointerX = finiteOr(pointerInputState.pointerX, finiteOr(pointerInputState.x, this.pixelX + this.width * 0.5));
    const pointerY = finiteOr(pointerInputState.pointerY, finiteOr(pointerInputState.y, this.pixelY + this.height * 0.5));
    const hasPointer = Number.isFinite(pointerX) && Number.isFinite(pointerY);
    const inViewport = hasPointer && this.pointInsideViewport(pointerX, pointerY);
    const wheelDeltaY = pointerInputState.wheelDeltaY ?? pointerInputState.deltaY ?? pointerInputState.wheelY;
    const zoomDelta = pointerInputState.zoomDelta;

    if (Number.isFinite(wheelDeltaY) || Number.isFinite(zoomDelta)) {
      const speed = pointerInputState.zoomSpeed ?? this.wheelZoomSpeed;
      const factor = Number.isFinite(zoomDelta)
        ? 1 + (zoomDelta ?? 0)
        : Math.exp(-(wheelDeltaY ?? 0) * speed);
      if (Number.isFinite(factor) && factor > 0) {
        this.zoomAroundMapPoint(this.zoom * factor, inViewport ? pointerX : this.pixelX + this.width * 0.5, inViewport ? pointerY : this.pixelY + this.height * 0.5);
      }
    }

    const down = pointerInputState.down === true;
    if (pointerInputState.released || !down) {
      this.dragging = false;
      return;
    }

    if (!inViewport) return;

    if (pointerInputState.pressed || !this.dragging) {
      this.dragging = true;
      this.dragX = pointerX;
      this.dragY = pointerY;
      return;
    }

    if (pointerInputState.moved !== false) {
      const dx = pointerX - this.dragX;
      const dy = pointerY - this.dragY;
      this.centerWorldX -= dx / this.zoom;
      this.centerWorldY -= dy / this.zoom;
      this.dragX = pointerX;
      this.dragY = pointerY;
    }
  },

worldToMapSpace(this: InternalGameMap, worldX: number, worldY: number): MapSpacePoint {
    const projected = this.projectWorld(worldX, worldY);
    return { ...projected, offMap: !this.pointInsideViewport(projected.x, projected.y) };
  },

screenToWorldSpace(this: InternalGameMap, mapX: number, mapY: number): { x: number; y: number } {
    const dx = (mapX - (this.pixelX + this.width * 0.5)) / this.zoom;
    const dy = (mapY - (this.pixelY + this.height * 0.5)) / this.zoom;
    const cos = Math.cos(this.rotationRad);
    const sin = Math.sin(this.rotationRad);
    return {
      x: this.centerWorldX + dx * cos - dy * sin,
      y: this.centerWorldY + dx * sin + dy * cos
    };
  },

visibleWorldBounds(this: InternalGameMap): MapWorldBounds {
    if (this.shape === "circle") {
      const radius = Math.min(this.width, this.height) * 0.5 / this.zoom;
      return {
        minX: this.centerWorldX - radius,
        minY: this.centerWorldY - radius,
        maxX: this.centerWorldX + radius,
        maxY: this.centerWorldY + radius
      };
    }

    const halfW = this.width * 0.5 / this.zoom;
    const halfH = this.height * 0.5 / this.zoom;
    const cos = Math.abs(Math.cos(this.rotationRad));
    const sin = Math.abs(Math.sin(this.rotationRad));
    const extentX = cos * halfW + sin * halfH;
    const extentY = sin * halfW + cos * halfH;

    return {
      minX: this.centerWorldX - extentX,
      minY: this.centerWorldY - extentY,
      maxX: this.centerWorldX + extentX,
      maxY: this.centerWorldY + extentY
    };
  },

state(this: InternalGameMap): GameMapState {
    return {
      centerWorldX: this.centerWorldX,
      centerWorldY: this.centerWorldY,
      zoom: this.zoom,
      rotationRad: this.rotationRad,
      mode: this.mode,
      bounds: this.visibleWorldBounds()
    };
  },

setMode(this: InternalGameMap, mode: GameMapMode): InternalGameMap {
    this.mode = mode;
    this.dragging = false;
    if (mode === "FREE_PAN" && !this.rotateWithTracking) this.rotationRad = 0;
    return this;
  },

setCenter(this: InternalGameMap, worldX: number, worldY: number): InternalGameMap {
    this.centerWorldX = worldX;
    this.centerWorldY = worldY;
    return this;
  },

setZoom(this: InternalGameMap, zoom: number): InternalGameMap {
    this.zoom = clamp(zoom, this.minZoom, this.maxZoom);
    return this;
  },

setViewport(this: InternalGameMap, pixelX: number, pixelY: number, width = this.width, height = this.height): InternalGameMap {
    assertPositiveFinite("width", width);
    assertPositiveFinite("height", height);
    this.pixelX = pixelX;
    this.pixelY = pixelY;
    this.width = width;
    this.height = height;
    return this;
  },

draw(this: InternalGameMap, ctx: CanvasRenderingContext2D, data: GameMapDrawData): void {
    const bounds = this.visibleWorldBounds();
    ctx.save();
    try {
      this.clipViewport(ctx);
      this.drawTerrain(ctx, bounds);
      this.drawRoutes(ctx, data.routes ?? [], bounds);
      this.drawLabels(ctx, data.labels ?? [], bounds);
      this.drawMarkers(ctx, data.markers, bounds);
      this.drawBorder(ctx);
      if (this.compass) this.drawCompassRose(ctx, this.compass);
    } finally {
      ctx.restore();
    }
  },

drawLegend(this: InternalGameMap, ctx: CanvasRenderingContext2D, layout: MapLegendLayout, items: readonly MapLegendItem[], style: MapLegendStyle = {}): void {
    const padding = style.padding ?? 10;
    const rowHeight = style.rowHeight ?? 22;
    for (const [value, label] of [[layout.x, "legend x"], [layout.y, "legend y"]] as const) {
      assertFinite(label, value);
    }
    assertPositiveFinite("legend width", layout.w);
    assertPositiveFinite("legend height", layout.h);
    assertNonNegativeFinite("legend padding", padding);
    assertPositiveFinite("legend rowHeight", rowHeight);
    const rowsPerColumn = Math.max(1, Math.floor((layout.h - padding * 2) / rowHeight));
    const columns = Math.max(1, Math.ceil(items.length / rowsPerColumn));
    const colWidth = (layout.w - padding * 2) / columns;
    const glyphSize = style.glyphSize ?? 10;
    assertNonNegativeFinite("legend glyphSize", glyphSize);

    ctx.save();
    try {
      ctx.fillStyle = style.panelFill ?? "rgba(8, 13, 22, 0.84)";
      ctx.strokeStyle = style.panelStroke ?? "rgba(220, 240, 255, 0.72)";
      ctx.lineWidth = 1;
      ctx.fillRect(layout.x, layout.y, layout.w, layout.h);
      ctx.strokeRect(layout.x + 0.5, layout.y + 0.5, layout.w - 1, layout.h - 1);
      ctx.font = style.font ?? "12px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const column = Math.floor(index / rowsPerColumn);
        const row = index % rowsPerColumn;
        const x = layout.x + padding + column * colWidth;
        const y = layout.y + padding + row * rowHeight + rowHeight * 0.5;
        this.drawLegendGlyph(ctx, item, x + glyphSize * 0.5, y, glyphSize);
        ctx.fillStyle = style.textColor ?? "rgba(246, 250, 255, 0.95)";
        ctx.fillText(item.label, x + glyphSize + 8, y, Math.max(20, colWidth - glyphSize - 12));
      }
    } finally {
      ctx.restore();
    }
  },

drawCompassRose(this: InternalGameMap, ctx: CanvasRenderingContext2D, options: MapCompassOptions = {}): void {
    const radius = options.radius ?? 28;
    const margin = options.margin ?? 10;
    assertPositiveFinite("compass radius", radius);
    assertFinite("compass margin", margin);
    const position = this.compassPosition(options.corner ?? "top-right", radius, margin);
    const x = options.x ?? position.x;
    const y = options.y ?? position.y;
    const rotation = -(options.rotationRad ?? this.rotationRad);
    assertFinite("compass x", x);
    assertFinite("compass y", y);
    assertFinite("compass rotation", rotation);

    ctx.save();
    try {
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.strokeStyle = options.color ?? "rgba(236, 244, 255, 0.9)";
      ctx.fillStyle = options.accentColor ?? "rgba(80, 210, 255, 0.92)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -radius);
      ctx.lineTo(radius * 0.24, -radius * 0.16);
      ctx.lineTo(0, -radius * 0.32);
      ctx.lineTo(-radius * 0.24, -radius * 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -radius);
      ctx.lineTo(0, radius);
      ctx.moveTo(-radius, 0);
      ctx.lineTo(radius, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.rotate(-rotation);
      ctx.fillStyle = options.labelColor ?? "rgba(246, 250, 255, 0.95)";
      ctx.font = options.font ?? "11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("N", 0, -radius - 8);
      ctx.fillText("S", 0, radius + 8);
      ctx.fillText("E", radius + 8, 0);
      ctx.fillText("W", -radius - 8, 0);
    } finally {
      ctx.restore();
    }
  },
};

const gameMapProjectionMethods = {
projectWorld(this: InternalGameMap, worldX: number, worldY: number): { x: number; y: number } {
    const dx = worldX - this.centerWorldX;
    const dy = worldY - this.centerWorldY;
    const cos = Math.cos(-this.rotationRad);
    const sin = Math.sin(-this.rotationRad);
    const rotatedX = dx * cos - dy * sin;
    const rotatedY = dx * sin + dy * cos;
    return {
      x: this.pixelX + this.width * 0.5 + rotatedX * this.zoom,
      y: this.pixelY + this.height * 0.5 + rotatedY * this.zoom
    };
  },

pointInsideViewport(this: InternalGameMap, x: number, y: number): boolean {
    if (this.shape === "circle") {
      const cx = this.pixelX + this.width * 0.5;
      const cy = this.pixelY + this.height * 0.5;
      const radius = Math.min(this.width, this.height) * 0.5;
      const dx = x - cx;
      const dy = y - cy;
      return dx * dx + dy * dy <= radius * radius;
    }

    return x >= this.pixelX && x <= this.pixelX + this.width && y >= this.pixelY && y <= this.pixelY + this.height;
  },

zoomAroundMapPoint(this: InternalGameMap, nextZoom: number, mapX: number, mapY: number): void {
    const before = this.screenToWorldSpace(mapX, mapY);
    this.zoom = clamp(nextZoom, this.minZoom, this.maxZoom);
    const centerX = this.pixelX + this.width * 0.5;
    const centerY = this.pixelY + this.height * 0.5;
    const dx = (mapX - centerX) / this.zoom;
    const dy = (mapY - centerY) / this.zoom;
    const cos = Math.cos(this.rotationRad);
    const sin = Math.sin(this.rotationRad);
    this.centerWorldX = before.x - (dx * cos - dy * sin);
    this.centerWorldY = before.y - (dx * sin + dy * cos);
  },

clipViewport(this: InternalGameMap, ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    if (this.shape === "circle") {
      ctx.arc(this.pixelX + this.width * 0.5, this.pixelY + this.height * 0.5, Math.min(this.width, this.height) * 0.5, 0, Math.PI * 2);
    } else {
      ctx.rect(this.pixelX, this.pixelY, this.width, this.height);
    }
    ctx.clip();
  },

drawTerrain(this: InternalGameMap, ctx: CanvasRenderingContext2D, bounds: MapWorldBounds): void {
    if (!this.terrainTexture && !this.onDrawTerrain) return;

    ctx.save();
    try {
      ctx.translate(this.pixelX + this.width * 0.5, this.pixelY + this.height * 0.5);
      if (this.rotationRad) ctx.rotate(-this.rotationRad);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-this.centerWorldX, -this.centerWorldY);
      if (this.terrainTexture) {
        ctx.drawImage(this.terrainTexture.image, 0, 0, this.terrainTexture.worldWidth, this.terrainTexture.worldHeight);
      }
      this.onDrawTerrain?.(ctx, bounds);
    } finally {
      ctx.restore();
    }
  },

drawRoutes(this: InternalGameMap, ctx: CanvasRenderingContext2D, routes: readonly MapRoute[], bounds: MapWorldBounds): void {
    for (const route of routes) {
      if (route.points.length < 2) continue;
      const currentRouteBounds = routeBounds(route);
      if (!currentRouteBounds || !boundsOverlap(bounds, currentRouteBounds)) continue;
      if (route.segmentColors && route.segmentColors.length > 0) {
        this.drawSegmentColoredRoute(ctx, route);
      } else {
        this.drawSingleRoute(ctx, route);
      }
    }
  },

drawSingleRoute(this: InternalGameMap, ctx: CanvasRenderingContext2D, route: MapRoute): void {
    const start = this.worldToMapSpace(route.points[0].x, route.points[0].y);
    const end = this.worldToMapSpace(route.points[route.points.length - 1].x, route.points[route.points.length - 1].y);
    const previousDashOffset = ctx.lineDashOffset;

    ctx.save();
    try {
      ctx.lineWidth = route.lineWidth;
      ctx.strokeStyle = this.routeStrokeStyle(ctx, route, start, end);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash(route.dashPattern ? [...route.dashPattern] : EMPTY_DASH);
      ctx.lineDashOffset = route.phaseOffset ?? previousDashOffset;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      for (let index = 1; index < route.points.length; index += 1) {
        const point = route.points[index];
        const mapPoint = this.worldToMapSpace(point.x, point.y);
        ctx.lineTo(mapPoint.x, mapPoint.y);
      }
      ctx.stroke();
    } finally {
      ctx.restore();
      ctx.setLineDash(EMPTY_DASH);
      ctx.lineDashOffset = previousDashOffset;
    }
  },

drawSegmentColoredRoute(this: InternalGameMap, ctx: CanvasRenderingContext2D, route: MapRoute): void {
    const previousDashOffset = ctx.lineDashOffset;
    ctx.save();
    try {
      ctx.lineWidth = route.lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash(route.dashPattern ? [...route.dashPattern] : EMPTY_DASH);
      ctx.lineDashOffset = route.phaseOffset ?? previousDashOffset;
      for (let index = 1; index < route.points.length; index += 1) {
        const from = this.worldToMapSpace(route.points[index - 1].x, route.points[index - 1].y);
        const to = this.worldToMapSpace(route.points[index].x, route.points[index].y);
        const colorCount = route.segmentColors?.length ?? 1;
        const rawColorIndex = index - 1 + Math.floor(route.phaseOffset ?? 0);
        const colorIndex = ((rawColorIndex % colorCount) + colorCount) % colorCount;
        ctx.strokeStyle = route.segmentColors?.[colorIndex] ?? route.color;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    } finally {
      ctx.restore();
      ctx.setLineDash(EMPTY_DASH);
      ctx.lineDashOffset = previousDashOffset;
    }
  },

routeStrokeStyle(this: InternalGameMap, ctx: CanvasRenderingContext2D, route: MapRoute, start: MapSpacePoint, end: MapSpacePoint): string | CanvasGradient {
    if (!route.gradient) return route.color;
    const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
    gradient.addColorStop(0, route.gradient.from);
    gradient.addColorStop(1, route.gradient.to);
    return gradient;
  },
};

const gameMapDrawingMethods = {
drawLabels(this: InternalGameMap, ctx: CanvasRenderingContext2D, labels: readonly ZoneLabel[], bounds: MapWorldBounds): void {
    for (const label of labels) {
      if (label.worldX < bounds.minX || label.worldX > bounds.maxX || label.worldY < bounds.minY || label.worldY > bounds.maxY) continue;
      if (label.minZoomToShow !== undefined && this.zoom < label.minZoomToShow) continue;
      const mapPoint = this.worldToMapSpace(label.worldX, label.worldY);
      if (mapPoint.offMap) continue;
      const alpha = this.labelAlpha(label);
      if (alpha <= 0 && label.minZoomToShow === undefined) continue;
      ctx.save();
      try {
        ctx.globalAlpha *= alpha;
        ctx.translate(mapPoint.x, mapPoint.y);
        ctx.scale(this.zoom, this.zoom);
        ctx.fillStyle = label.color;
        ctx.font = label.font;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label.text, 0, 0);
      } finally {
        ctx.restore();
      }
    }
  },

labelAlpha(this: InternalGameMap, label: ZoneLabel): number {
    if (label.minZoomToShow === undefined) return 1;
    if (this.labelFadeZoomRange <= 0) return 1;
    return clamp((this.zoom - label.minZoomToShow) / this.labelFadeZoomRange, 0, 1);
  },

drawMarkers(this: InternalGameMap, ctx: CanvasRenderingContext2D, markers: readonly MapMarker[], bounds: MapWorldBounds): void {
    for (const marker of markers) {
      const shouldClamp = this.mode === "FOLLOW_TARGET" && marker.clampToEdge === true;
      if (!shouldClamp && (marker.worldX < bounds.minX || marker.worldX > bounds.maxX || marker.worldY < bounds.minY || marker.worldY > bounds.maxY)) continue;

      const mapPoint = this.worldToMapSpace(marker.worldX, marker.worldY);
      if (mapPoint.offMap && !shouldClamp) continue;

      const drawPoint = mapPoint.offMap ? this.clampMapPoint(mapPoint.x, mapPoint.y) : mapPoint;
      this.drawMarker(ctx, marker, drawPoint.x, drawPoint.y, mapPoint.offMap);
    }
  },

drawMarker(this: InternalGameMap, ctx: CanvasRenderingContext2D, marker: MapMarker, x: number, y: number, clampedToEdge: boolean): void {
    if (marker.onDraw) {
      marker.onDraw(ctx, x, y);
      return;
    }

    const scale = marker.scale ?? 1;
    const sprite = marker.iconId ? getSprite(marker.iconId) : undefined;
    ctx.save();
    try {
      if (sprite) {
        const size = imageSize(sprite.image);
        const width = (sprite.width ?? size.width ?? 12) * scale;
        const height = (sprite.height ?? size.height ?? 12) * scale;
        ctx.drawImage(sprite.image, x - width * 0.5, y - height * 0.5, width, height);
        return;
      }

      ctx.fillStyle = marker.color ?? "rgba(255, 255, 255, 0.95)";
      ctx.strokeStyle = clampedToEdge ? "rgba(8, 13, 22, 0.9)" : "rgba(8, 13, 22, 0.45)";
      ctx.lineWidth = clampedToEdge ? 2 : 1;
      if (marker.text) {
        ctx.font = `${Math.max(10, 12 * scale)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(marker.text, x, y);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2, 4 * scale), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } finally {
      ctx.restore();
    }
  },

clampMapPoint(this: InternalGameMap, x: number, y: number): { x: number; y: number } {
    const cx = this.pixelX + this.width * 0.5;
    const cy = this.pixelY + this.height * 0.5;
    const dx = x - cx;
    const dy = y - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };

    if (this.shape === "circle") {
      const radius = Math.min(this.width, this.height) * 0.5;
      const length = Math.hypot(dx, dy) || 1;
      return { x: cx + dx * radius / length, y: cy + dy * radius / length };
    }

    const halfW = this.width * 0.5;
    const halfH = this.height * 0.5;
    const scaleX = dx === 0 ? Infinity : halfW / Math.abs(dx);
    const scaleY = dy === 0 ? Infinity : halfH / Math.abs(dy);
    const scale = Math.min(scaleX, scaleY);
    return { x: cx + dx * scale, y: cy + dy * scale };
  },

drawBorder(this: InternalGameMap, ctx: CanvasRenderingContext2D): void {
    if (!this.borderStyle) return;

    const style = this.borderStyle;
    ctx.save();
    try {
      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.lineWidth;
      ctx.beginPath();
      if (this.shape === "circle") {
        const cx = this.pixelX + this.width * 0.5;
        const cy = this.pixelY + this.height * 0.5;
        const radius = Math.max(0, Math.min(this.width, this.height) * 0.5 - style.lineWidth * 0.5);
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        this.drawBorderTicks(ctx, cx, cy, radius, style);
      } else {
        ctx.strokeRect(
          this.pixelX + style.lineWidth * 0.5,
          this.pixelY + style.lineWidth * 0.5,
          Math.max(0, this.width - style.lineWidth),
          Math.max(0, this.height - style.lineWidth)
        );
      }
    } finally {
      ctx.restore();
    }
  },

drawBorderTicks(this: InternalGameMap, ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, style: Required<MapBorderStyle>): void {
    if (style.tickCount <= 0) return;

    ctx.strokeStyle = style.accentColor;
    ctx.lineWidth = Math.max(1, style.lineWidth * 0.5);
    for (let index = 0; index < style.tickCount; index += 1) {
      const angle = index / style.tickCount * Math.PI * 2 - this.rotationRad;
      const outerX = cx + Math.cos(angle) * radius;
      const outerY = cy + Math.sin(angle) * radius;
      const innerX = cx + Math.cos(angle) * (radius - 5);
      const innerY = cy + Math.sin(angle) * (radius - 5);
      ctx.beginPath();
      ctx.moveTo(innerX, innerY);
      ctx.lineTo(outerX, outerY);
      ctx.stroke();
    }
  },

drawLegendGlyph(this: InternalGameMap, ctx: CanvasRenderingContext2D, item: MapLegendItem, x: number, y: number, glyphSize: number): void {
    const sprite = item.iconId ? getSprite(item.iconId) : undefined;
    if (sprite) {
      const size = imageSize(sprite.image);
      const width = Math.min(glyphSize, sprite.width ?? size.width ?? glyphSize);
      const height = Math.min(glyphSize, sprite.height ?? size.height ?? glyphSize);
      ctx.drawImage(sprite.image, x - width * 0.5, y - height * 0.5, width, height);
      return;
    }

    ctx.fillStyle = item.color ?? "rgba(255, 255, 255, 0.95)";
    ctx.beginPath();
    ctx.arc(x, y, glyphSize * 0.5, 0, Math.PI * 2);
    ctx.fill();
  },

compassPosition(this: InternalGameMap, corner: MapCompassCorner, radius: number, margin: number): { x: number; y: number } {
    switch (corner) {
      case "top-left":
        return { x: this.pixelX + margin + radius, y: this.pixelY + margin + radius };
      case "bottom-left":
        return { x: this.pixelX + margin + radius, y: this.pixelY + this.height - margin - radius };
      case "bottom-right":
        return { x: this.pixelX + this.width - margin - radius, y: this.pixelY + this.height - margin - radius };
      case "top-right":
      default:
        return { x: this.pixelX + this.width - margin - radius, y: this.pixelY + margin + radius };
    }
  },
};

const gameMapPrototype = Object.assign({}, gameMapPublicMethods, gameMapProjectionMethods, gameMapDrawingMethods);
const gameMapMethodNames = [
  "update", "handleInput", "worldToMapSpace", "screenToWorldSpace", "visibleWorldBounds", "state", "setMode",
  "setCenter", "setZoom", "setViewport", "draw", "drawLegend", "drawCompassRose",
];

function isGameMap(value: unknown): value is GameMap {
  return typeof value === "object" && value !== null
    && gameMapMethodNames.every((name) => typeof Reflect.get(value, name) === "function");
}

export function createGameMap(options: MapOptions): GameMap {
  assertPositiveFinite("width", options.width);
  assertPositiveFinite("height", options.height);
  assertPositiveFinite("zoom", options.zoom);
  if (options.shape !== "circle" && options.shape !== "rectangle") throw new Error(`Unknown map shape: ${String(options.shape)}`);
  if (options.mode !== "FOLLOW_TARGET" && options.mode !== "FREE_PAN") throw new Error(`Unknown map mode: ${String(options.mode)}`);
  assertFinite("pixelX", options.pixelX);
  assertFinite("pixelY", options.pixelY);
  const minZoom = options.minZoom ?? 0.1;
  const maxZoom = options.maxZoom ?? 16;
  assertPositiveFinite("minZoom", minZoom);
  assertPositiveFinite("maxZoom", maxZoom);
  if (minZoom > maxZoom) throw new RangeError("minZoom must not exceed maxZoom");
  const centerWorldX = options.centerWorldX ?? 0;
  const centerWorldY = options.centerWorldY ?? 0;
  assertFinite("centerWorldX", centerWorldX);
  assertFinite("centerWorldY", centerWorldY);
  const labelFadeZoomRange = options.labelFadeZoomRange ?? DEFAULT_LABEL_FADE_ZOOM_RANGE;
  assertNonNegativeFinite("labelFadeZoomRange", labelFadeZoomRange);
  const wheelZoomSpeed = options.wheelZoomSpeed ?? DEFAULT_WHEEL_ZOOM_SPEED;
  assertFinite("wheelZoomSpeed", wheelZoomSpeed);
  const configuredBorder = options.borderStyle === false ? undefined : options.borderStyle;
  const borderLineWidth = configuredBorder?.lineWidth ?? 2;
  const borderTickCount = configuredBorder?.tickCount ?? 16;
  if (options.borderStyle !== false) {
    assertPositiveFinite("border lineWidth", borderLineWidth);
    if (!Number.isSafeInteger(borderTickCount) || borderTickCount < 0 || borderTickCount > MAX_BORDER_TICKS) {
      throw new RangeError(`border tickCount must be a safe integer between 0 and ${MAX_BORDER_TICKS}`);
    }
  }
  const borderStyle = options.borderStyle === false
    ? false
    : {
        color: configuredBorder?.color ?? "rgba(220, 240, 255, 0.9)",
        accentColor: configuredBorder?.accentColor ?? "rgba(96, 220, 255, 0.85)",
        lineWidth: borderLineWidth,
        tickCount: borderTickCount,
      };
  const map: GameMapFields = {
    shape: options.shape,
    minZoom,
    maxZoom,
    rotateWithTracking: options.rotateWithTracking ?? false,
    terrainTexture: options.terrainTexture,
    onDrawTerrain: options.onDrawTerrain,
    labelFadeZoomRange,
    wheelZoomSpeed,
    borderStyle,
    compass: options.compass ?? false,
    pixelX: options.pixelX,
    pixelY: options.pixelY,
    width: options.width,
    height: options.height,
    zoom: clamp(options.zoom, minZoom, maxZoom),
    mode: options.mode,
    centerWorldX,
    centerWorldY,
    rotationRad: 0,
    dragging: false,
    dragX: 0,
    dragY: 0,
  };
  Object.setPrototypeOf(map, gameMapPrototype);
  if (!isGameMap(map)) throw new Error("GameMap factory produced an invalid instance");
  return map;
}

function gameMapFactory(options: MapOptions): GameMap {
  return createGameMap(options);
}

function isGameMapFactory(value: unknown): value is GameMapFactory {
  if (typeof value !== "function") return false;
  try {
    Reflect.construct(Object, [], value);
    return true;
  } catch {
    return false;
  }
}

function requireGameMapFactory(value: unknown): GameMapFactory {
  if (!isGameMapFactory(value)) throw new Error("GameMap factory must be constructable");
  return value;
}

Object.defineProperty(gameMapFactory, "prototype", { value: gameMapPrototype });
export const GameMap = requireGameMapFactory(gameMapFactory);
