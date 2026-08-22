import type { MmoVec2 } from "./types.ts";

export type MmoRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MmoCircle = MmoVec2 & {
  radius?: number;
};

export type MmoOccupancyTesterConfig = {
  bounds?: MmoRect;
  solidRects?: Iterable<MmoRect> | (() => Iterable<MmoRect>);
  cacheSolidRects?: boolean;
  tileSize?: number;
  width?: number;
  height?: number;
  isSolidTile?: (tileX: number, tileY: number) => boolean;
};

export type MmoOccupancyTester = {
  rectBlocked(rect: MmoRect): boolean;
  circleBlocked(circle: Required<MmoCircle>): boolean;
  blockedAt(x: number, y: number, radius: number): boolean;
};

export type MmoMoveCircleOptions = {
  radius?: number;
  maxDistance?: number;
};

export type MmoMoveCircleResult = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  blockedX: boolean;
  blockedY: boolean;
};

export type MmoTeleportToTileOptions = {
  radius?: number;
};

export type MmoTeleportToTileResult = {
  ok: boolean;
  x: number;
  y: number;
};

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function requireFinite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

function requireNonNegativeFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a non-negative finite number`);
  return value;
}

function requireRect(rect: MmoRect, label: string): MmoRect {
  const checked = {
    x: requireFinite(rect.x, `${label} x`),
    y: requireFinite(rect.y, `${label} y`),
    width: requireNonNegativeFinite(rect.width, `${label} width`),
    height: requireNonNegativeFinite(rect.height, `${label} height`)
  };
  if (!Number.isFinite(checked.x + checked.width) || !Number.isFinite(checked.y + checked.height)) {
    throw new RangeError(`${label} bounds must be finite`);
  }
  return checked;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function rectsOverlap(a: MmoRect, b: MmoRect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function circleRectOverlap(circle: Required<MmoCircle>, rect: MmoRect) {
  const closestX = clamp(circle.x, rect.x, rect.x + rect.width);
  const closestY = clamp(circle.y, rect.y, rect.y + rect.height);
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy < circle.radius * circle.radius;
}

function rectOutsideBounds(rect: MmoRect, bounds: MmoRect) {
  return rect.x < bounds.x || rect.y < bounds.y || rect.x + rect.width > bounds.x + bounds.width || rect.y + rect.height > bounds.y + bounds.height;
}

const EMPTY_RECTS: readonly MmoRect[] = [];

function createSolidRectSource(config: MmoOccupancyTesterConfig) {
  const rects = config.solidRects;
  if (!rects) return () => EMPTY_RECTS;
  if (config.cacheSolidRects) {
    const cached = [...(typeof rects === "function" ? rects() : rects)].map((rect) => requireRect(rect, "solid rect"));
    return () => cached;
  }
  return typeof rects === "function" ? rects : () => rects;
}

export function rectAroundPoint(point: MmoVec2, radius: number): MmoRect {
  const x = requireFinite(point.x, "point x");
  const y = requireFinite(point.y, "point y");
  const size = requireNonNegativeFinite(radius, "point radius") * 2;
  if (!Number.isFinite(size)) throw new RangeError("point diameter must be finite");
  return requireRect({ x: x - size / 2, y: y - size / 2, width: size, height: size }, "point rect");
}

export function createMmoOccupancyTester(config: MmoOccupancyTesterConfig = {}): MmoOccupancyTester {
  const tileSize = config.tileSize === undefined ? 1 : requireNonNegativeFinite(config.tileSize, "tileSize");
  if (tileSize <= 0) throw new RangeError("tileSize must be a positive finite number");
  for (const [label, value] of [["width", config.width], ["height", config.height]] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw new RangeError(`${label} must be a non-negative safe integer`);
  }
  const bounds =
    (config.bounds ? requireRect(config.bounds, "bounds") : undefined) ??
    (config.width !== undefined && config.height !== undefined
      ? { x: 0, y: 0, width: config.width * tileSize, height: config.height * tileSize }
      : undefined);
  if (bounds && (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height))) throw new RangeError("occupancy bounds must be finite");
  const getSolidRects = createSolidRectSource(config);
  const scratchTileRect: MmoRect = { x: 0, y: 0, width: tileSize, height: tileSize };

  function tileRange(rect: MmoRect) {
    return {
      minX: Math.floor(rect.x / tileSize),
      minY: Math.floor(rect.y / tileSize),
      maxX: Math.floor((rect.x + rect.width - Number.EPSILON) / tileSize),
      maxY: Math.floor((rect.y + rect.height - Number.EPSILON) / tileSize)
    };
  }

  function tileBlocked(rect: MmoRect, circle?: Required<MmoCircle>) {
    if (!config.isSolidTile) return false;
    const range = tileRange(rect);
    for (let ty = range.minY; ty <= range.maxY; ty += 1) {
      for (let tx = range.minX; tx <= range.maxX; tx += 1) {
        if ((config.width !== undefined && (tx < 0 || tx >= config.width)) || (config.height !== undefined && (ty < 0 || ty >= config.height))) return true;
        if (!config.isSolidTile(tx, ty)) continue;
        scratchTileRect.x = tx * tileSize;
        scratchTileRect.y = ty * tileSize;
        if (circle ? circleRectOverlap(circle, scratchTileRect) : rectsOverlap(rect, scratchTileRect)) return true;
      }
    }
    return false;
  }

  return {
    rectBlocked(rect) {
      const checkedRect = requireRect(rect, "occupancy rect");
      if (bounds && rectOutsideBounds(checkedRect, bounds)) return true;
      for (const solid of getSolidRects()) {
        if (rectsOverlap(checkedRect, requireRect(solid, "solid rect"))) return true;
      }
      return tileBlocked(checkedRect);
    },
    circleBlocked(circle) {
      const checkedCircle = {
        x: requireFinite(circle.x, "circle x"),
        y: requireFinite(circle.y, "circle y"),
        radius: requireNonNegativeFinite(circle.radius, "circle radius")
      };
      const rect = rectAroundPoint(checkedCircle, checkedCircle.radius);
      if (bounds && rectOutsideBounds(rect, bounds)) return true;
      for (const solid of getSolidRects()) {
        if (circleRectOverlap(checkedCircle, requireRect(solid, "solid rect"))) return true;
      }
      return tileBlocked(rect, checkedCircle);
    },
    blockedAt(x, y, radius) {
      return this.circleBlocked({ x, y, radius });
    }
  };
}

export function moveMmoCircle<TEntity extends MmoCircle>(
  entity: TEntity,
  dx: number,
  dy: number,
  tester: MmoOccupancyTester,
  options: MmoMoveCircleOptions = {}
): MmoMoveCircleResult {
  const startX = finite(entity.x);
  const startY = finite(entity.y);
  const radius = requireNonNegativeFinite(finite(options.radius ?? entity.radius ?? 0), "movement radius");
  let moveX = finite(dx);
  let moveY = finite(dy);
  const maxDistance = options.maxDistance;
  if (maxDistance !== undefined) {
    requireNonNegativeFinite(maxDistance, "movement maxDistance");
    const length = Math.hypot(moveX, moveY);
    if (length > maxDistance && length > 0) {
      const scale = maxDistance / length;
      moveX *= scale;
      moveY *= scale;
    }
  }
  let blockedX = false;
  let blockedY = false;
  entity.x = startX;
  entity.y = startY;
  if (moveX !== 0) {
    if (tester.blockedAt(startX + moveX, startY, radius)) blockedX = true;
    else entity.x = startX + moveX;
  }
  if (moveY !== 0) {
    if (tester.blockedAt(entity.x, startY + moveY, radius)) blockedY = true;
    else entity.y = startY + moveY;
  }
  return { x: entity.x, y: entity.y, dx: entity.x - startX, dy: entity.y - startY, blockedX, blockedY };
}

export function teleportMmoEntityToTile<TEntity extends MmoCircle>(
  entity: TEntity,
  tileX: number,
  tileY: number,
  tileSize: number,
  tester?: MmoOccupancyTester,
  options: MmoTeleportToTileOptions = {}
): MmoTeleportToTileResult {
  requireFinite(tileX, "tileX");
  requireFinite(tileY, "tileY");
  if (!Number.isFinite(tileSize) || tileSize <= 0) throw new RangeError("tileSize must be a positive finite number");
  const x = tileX * tileSize + tileSize / 2;
  const y = tileY * tileSize + tileSize / 2;
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError("teleport destination must be finite");
  const radius = requireNonNegativeFinite(finite(options.radius ?? entity.radius ?? 0), "teleport radius");
  if (tester?.blockedAt(x, y, radius)) return { ok: false, x: entity.x, y: entity.y };
  entity.x = x;
  entity.y = y;
  return { ok: true, x, y };
}
