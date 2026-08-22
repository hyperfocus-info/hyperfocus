export type RectLike = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type CircleLike = {
  x: number;
  y: number;
  r: number;
};

export type Vec2 = {
  x: number;
  y: number;
};

export type RadiusCandidatePoint = {
  x: number;
  y?: number;
  z?: number;
};

export type RadiusCandidateEntity = {
  x?: number;
  y?: number;
  z?: number;
  radius?: number;
  priority?: number;
  id?: string | number;
};

export type RadiusCandidateHit<TEntity> = {
  target: TEntity;
  distance: number;
  distanceSq: number;
  effectiveDistance: number;
};

export type RadiusCandidateQueryOptions<TEntity> = {
  radius: number;
  includeCandidateRadius?: boolean;
  filter?: (entity: TEntity) => boolean;
  sort?: boolean;
  max?: number;
  out?: RadiusCandidateHit<TEntity>[];
  getX?: (entity: TEntity) => number;
  getY?: (entity: TEntity) => number;
  getDistanceSq?: (entity: TEntity, center: RadiusCandidatePoint) => number;
  getRadius?: (entity: TEntity) => number;
  getPriority?: (entity: TEntity) => number;
  getId?: (entity: TEntity) => string | number | undefined;
};

export type RadiusCandidateVisit<TEntity> = (entity: TEntity, distanceSq: number) => boolean | void;

export type RayBox = RectLike | readonly [x: number, y: number, w: number, h: number];

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function rectsOverlap(a: RectLike, b: RectLike) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function testOverlapRect(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function testOverlapCircle(ax: number, ay: number, ar: number, bx: number, by: number, br: number) {
  const dx = ax - bx;
  const dy = ay - by;
  const radius = ar + br;
  return dx * dx + dy * dy <= radius * radius;
}

export function pointInRect(px: number, py: number, rx: number, ry: number, rw: number, rh: number) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

export function circleRectOverlap(circle: CircleLike, rect: RectLike) {
  const closestX = clamp(circle.x, rect.x, rect.x + rect.w);
  const closestY = clamp(circle.y, rect.y, rect.y + rect.h);
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy <= circle.r * circle.r;
}

export function queryRadiusCandidates<TEntity extends RadiusCandidateEntity>(
  center: RadiusCandidatePoint,
  candidates: Iterable<TEntity>,
  options: RadiusCandidateQueryOptions<TEntity>
): RadiusCandidateHit<TEntity>[] {
  const out = options.out ?? [];
  out.length = 0;
  if (!Number.isFinite(options.radius)) return out;
  const queryRadius = Math.max(0, options.radius);
  const centerX = center.x;
  const centerY = radiusCandidateY(center);
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return out;
  const includeCandidateRadius = options.includeCandidateRadius ?? false;
  const getX = options.getX ?? ((entity: TEntity) => entity.x ?? 0);
  const getY = options.getY ?? ((entity: TEntity) => radiusCandidateY(entity));
  const requestedMax = options.max ?? Number.POSITIVE_INFINITY;
  const max = requestedMax === Number.POSITIVE_INFINITY
    ? requestedMax
    : Number.isFinite(requestedMax) ? Math.max(0, Math.floor(requestedMax)) : 0;
  if (max === 0) return out;

  for (const candidate of candidates) {
    if (options.filter && !options.filter(candidate)) continue;
    const rawCandidateRadius = includeCandidateRadius ? (options.getRadius ? options.getRadius(candidate) : candidate.radius ?? 0) : 0;
    if (!Number.isFinite(rawCandidateRadius)) continue;
    const candidateRadius = Math.max(0, rawCandidateRadius);
    const threshold = queryRadius + candidateRadius;
    const distanceSq = options.getDistanceSq
      ? options.getDistanceSq(candidate, center)
      : squaredDistance(getX(candidate) - centerX, getY(candidate) - centerY);
    if (!Number.isFinite(distanceSq) || distanceSq < 0 || distanceSq > threshold * threshold) continue;
    const distance = Math.sqrt(distanceSq);
    out.push({
      target: candidate,
      distance,
      distanceSq,
      effectiveDistance: Math.max(0, distance - candidateRadius)
    });
    if (!options.sort && out.length >= max) break;
  }

  if (options.sort) {
    out.sort((left, right) => compareRadiusCandidateHits(left, right, options));
    if (out.length > max) out.length = max;
  }
  return out;
}

export function forEachRadiusCandidate<TEntity extends RadiusCandidateEntity>(
  center: RadiusCandidatePoint,
  candidates: Iterable<TEntity>,
  options: Omit<RadiusCandidateQueryOptions<TEntity>, "out" | "sort">,
  visit: RadiusCandidateVisit<TEntity>
) {
  if (!Number.isFinite(options.radius)) return 0;
  const queryRadius = Math.max(0, options.radius);
  const centerX = center.x;
  const centerY = radiusCandidateY(center);
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return 0;
  const includeCandidateRadius = options.includeCandidateRadius ?? false;
  const getX = options.getX ?? ((entity: TEntity) => entity.x ?? 0);
  const getY = options.getY ?? ((entity: TEntity) => radiusCandidateY(entity));
  const requestedMax = options.max ?? Number.POSITIVE_INFINITY;
  const max = requestedMax === Number.POSITIVE_INFINITY
    ? requestedMax
    : Number.isFinite(requestedMax) ? Math.max(0, Math.floor(requestedMax)) : 0;
  let count = 0;
  if (max === 0) return count;

  for (const candidate of candidates) {
    if (options.filter && !options.filter(candidate)) continue;
    const rawCandidateRadius = includeCandidateRadius ? (options.getRadius ? options.getRadius(candidate) : candidate.radius ?? 0) : 0;
    if (!Number.isFinite(rawCandidateRadius)) continue;
    const candidateRadius = Math.max(0, rawCandidateRadius);
    const threshold = queryRadius + candidateRadius;
    const distanceSq = options.getDistanceSq
      ? options.getDistanceSq(candidate, center)
      : squaredDistance(getX(candidate) - centerX, getY(candidate) - centerY);
    if (!Number.isFinite(distanceSq) || distanceSq < 0 || distanceSq > threshold * threshold) continue;
    count += 1;
    if (visit(candidate, distanceSq) === false || count >= max) break;
  }

  return count;
}

export function findNearestRadiusCandidate<TEntity extends RadiusCandidateEntity>(
  center: RadiusCandidatePoint,
  candidates: Iterable<TEntity>,
  options: Omit<RadiusCandidateQueryOptions<TEntity>, "max" | "sort" | "out">
): RadiusCandidateHit<TEntity> | undefined {
  if (!Number.isFinite(options.radius)) return undefined;
  const queryRadius = Math.max(0, options.radius);
  const centerX = center.x;
  const centerY = radiusCandidateY(center);
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return undefined;
  const includeCandidateRadius = options.includeCandidateRadius ?? false;
  const getX = options.getX ?? ((entity: TEntity) => entity.x ?? 0);
  const getY = options.getY ?? ((entity: TEntity) => radiusCandidateY(entity));
  let selected: RadiusCandidateHit<TEntity> | undefined;

  for (const candidate of candidates) {
    if (options.filter && !options.filter(candidate)) continue;
    const rawCandidateRadius = includeCandidateRadius ? (options.getRadius ? options.getRadius(candidate) : candidate.radius ?? 0) : 0;
    if (!Number.isFinite(rawCandidateRadius)) continue;
    const candidateRadius = Math.max(0, rawCandidateRadius);
    const threshold = queryRadius + candidateRadius;
    const distanceSq = options.getDistanceSq
      ? options.getDistanceSq(candidate, center)
      : squaredDistance(getX(candidate) - centerX, getY(candidate) - centerY);
    if (!Number.isFinite(distanceSq) || distanceSq < 0 || distanceSq > threshold * threshold) continue;
    const distance = Math.sqrt(distanceSq);
    const hit = {
      target: candidate,
      distance,
      distanceSq,
      effectiveDistance: Math.max(0, distance - candidateRadius)
    };
    if (!selected || compareRadiusCandidateHits(hit, selected, options) < 0) selected = hit;
  }

  return selected;
}

function radiusCandidateY(value: { y?: number; z?: number }) {
  return value.y ?? value.z ?? 0;
}

function squaredDistance(dx: number, dy: number) {
  return dx * dx + dy * dy;
}

function compareRadiusCandidateHits<TEntity extends RadiusCandidateEntity>(
  left: RadiusCandidateHit<TEntity>,
  right: RadiusCandidateHit<TEntity>,
  options: RadiusCandidateQueryOptions<TEntity>
) {
  const byDistance = left.effectiveDistance - right.effectiveDistance;
  if (byDistance !== 0) return byDistance;
  const getPriority = options.getPriority ?? ((entity: TEntity) => entity.priority ?? 0);
  const rawLeftPriority = getPriority(left.target);
  const rawRightPriority = getPriority(right.target);
  const leftPriority = Number.isFinite(rawLeftPriority) ? rawLeftPriority : 0;
  const rightPriority = Number.isFinite(rawRightPriority) ? rawRightPriority : 0;
  const byPriority = rightPriority - leftPriority;
  if (byPriority !== 0) return byPriority;
  const getId = options.getId ?? ((entity: TEntity) => entity.id);
  const leftId = getId(left.target);
  const rightId = getId(right.target);
  if (leftId === undefined && rightId === undefined) return 0;
  if (leftId === undefined) return 1;
  if (rightId === undefined) return -1;
  return String(leftId).localeCompare(String(rightId));
}

export function vecDistance(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function vecAngle(x1: number, y1: number, x2: number, y2: number) {
  return Math.atan2(y2 - y1, x2 - x1);
}

export function vecNormalize<T extends Vec2 = Vec2>(x: number, y: number, out: T = { x: 0, y: 0 } as T) {
  const length = Math.hypot(x, y);
  if (length === 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  out.x = x / length;
  out.y = y / length;
  return out;
}

export function rayIntersectRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tMin = 0;
  let tMax = 1;

  if (dx === 0) {
    if (x1 < rx || x1 > rx + rw) return false;
  } else {
    const tx1 = (rx - x1) / dx;
    const tx2 = (rx + rw - x1) / dx;
    tMin = Math.max(tMin, Math.min(tx1, tx2));
    tMax = Math.min(tMax, Math.max(tx1, tx2));
  }

  if (dy === 0) {
    if (y1 < ry || y1 > ry + rh) return false;
  } else {
    const ty1 = (ry - y1) / dy;
    const ty2 = (ry + rh - y1) / dy;
    tMin = Math.max(tMin, Math.min(ty1, ty2));
    tMax = Math.min(tMax, Math.max(ty1, ty2));
  }

  return tMin <= tMax;
}

export function rayIntersectMap(x1: number, y1: number, x2: number, y2: number, boxes: readonly RayBox[]) {
  for (let i = 0; i < boxes.length; i += 1) {
    const box = boxes[i];
    if (Array.isArray(box)) {
      if (rayIntersectRect(x1, y1, x2, y2, box[0], box[1], box[2], box[3])) return true;
    } else {
      const rect = box as RectLike;
      if (rayIntersectRect(x1, y1, x2, y2, rect.x, rect.y, rect.w, rect.h)) {
        return true;
      }
    }
  }
  return false;
}
