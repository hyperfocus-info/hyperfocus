import type { MmoVec2 } from "./types.ts";

export type MmoTargetableEntity = MmoVec2 & {
  id: string;
  radius?: number;
  priority?: number;
};

export type MmoTargetFilter<TEntity> = (entity: TEntity) => boolean;

export type MmoNearestEntityOptions<TEntity> = {
  maxDistance?: number;
  includeRadius?: boolean;
  filter?: MmoTargetFilter<TEntity>;
};

export type MmoAimEntityOptions<TEntity> = {
  maxAimDistance?: number;
  maxRange?: number;
  includeRadius?: boolean;
  filter?: MmoTargetFilter<TEntity>;
};

export type MmoTargetHit<TEntity> = {
  target: TEntity;
  distance: number;
};

export type MmoLineTargetOptions<TEntity> = {
  range: number;
  width: number;
  includeRadius?: boolean;
  filter?: MmoTargetFilter<TEntity>;
};

export type MmoConeTargetOptions<TEntity> = {
  range: number;
  halfAngleRad: number;
  includeRadius?: boolean;
  filter?: MmoTargetFilter<TEntity>;
};

export type MmoRadiusTargetOptions<TEntity> = {
  radius: number;
  includeRadius?: boolean;
  filter?: MmoTargetFilter<TEntity>;
};

const EPSILON = 1e-9;

function distance(a: MmoVec2, b: MmoVec2) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function mmoTargetRadius(entity: MmoTargetableEntity, includeRadius: boolean) {
  return includeRadius ? Math.max(0, entity.radius ?? 0) : 0;
}

function normalizeDirection(direction: MmoVec2): MmoVec2 {
  const length = Math.hypot(direction.x, direction.y);
  if (length <= EPSILON) return { x: 1, y: 0 };
  return { x: direction.x / length, y: direction.y / length };
}

function betterByDistance<TEntity extends MmoTargetableEntity>(candidate: TEntity, candidateDistance: number, current: TEntity | undefined, currentDistance: number) {
  if (!current) return true;
  if (candidateDistance < currentDistance - EPSILON) return true;
  if (candidateDistance > currentDistance + EPSILON) return false;
  const priority = (candidate.priority ?? 0) - (current.priority ?? 0);
  if (priority !== 0) return priority > 0;
  return candidate.id.localeCompare(current.id) < 0;
}

export function pointSegmentDistance(point: MmoVec2, start: MmoVec2, end: MmoVec2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
  return distance(point, { x: start.x + dx * t, y: start.y + dy * t });
}

export function findNearestMmoEntity<TEntity extends MmoTargetableEntity>(
  origin: MmoVec2,
  entities: Iterable<TEntity>,
  options: MmoNearestEntityOptions<TEntity> = {}
): TEntity | undefined {
  const includeRadius = options.includeRadius ?? true;
  const maxDistance = options.maxDistance ?? Number.POSITIVE_INFINITY;
  let selected: TEntity | undefined;
  let selectedDistance = Number.POSITIVE_INFINITY;
  for (const entity of entities) {
    if (options.filter && !options.filter(entity)) continue;
    const entityDistance = Math.max(0, distance(origin, entity) - mmoTargetRadius(entity, includeRadius));
    if (entityDistance > maxDistance) continue;
    if (!betterByDistance(entity, entityDistance, selected, selectedDistance)) continue;
    selected = entity;
    selectedDistance = entityDistance;
  }
  return selected;
}

export function findMmoEntityNearAim<TEntity extends MmoTargetableEntity>(
  origin: MmoVec2,
  aim: MmoVec2,
  entities: Iterable<TEntity>,
  options: MmoAimEntityOptions<TEntity> = {}
): TEntity | undefined {
  const includeRadius = options.includeRadius ?? true;
  const maxAimDistance = options.maxAimDistance ?? Number.POSITIVE_INFINITY;
  const maxRange = options.maxRange ?? Number.POSITIVE_INFINITY;
  let selected: TEntity | undefined;
  let selectedAimDistance = Number.POSITIVE_INFINITY;
  let selectedRangeDistance = Number.POSITIVE_INFINITY;
  for (const entity of entities) {
    if (options.filter && !options.filter(entity)) continue;
    const radius = mmoTargetRadius(entity, includeRadius);
    const aimDistance = Math.max(0, pointSegmentDistance(entity, origin, aim) - radius);
    const rangeDistance = Math.max(0, distance(origin, entity) - radius);
    if (aimDistance > maxAimDistance || rangeDistance > maxRange) continue;
    const aimIsBetter = aimDistance < selectedAimDistance - EPSILON;
    const aimIsWorse = aimDistance > selectedAimDistance + EPSILON;
    const priority = (entity.priority ?? 0) - (selected?.priority ?? 0);
    const rangeIsBetter = rangeDistance < selectedRangeDistance - EPSILON;
    const sameScoreLowerId = selected ? entity.id.localeCompare(selected.id) < 0 : true;
    if (selected && !aimIsBetter && (aimIsWorse || priority < 0 || (priority === 0 && !rangeIsBetter && !(Math.abs(rangeDistance - selectedRangeDistance) <= EPSILON && sameScoreLowerId)))) {
      continue;
    }
    selected = entity;
    selectedAimDistance = aimDistance;
    selectedRangeDistance = rangeDistance;
  }
  return selected;
}

export function lineMmoTargetHits<TEntity extends MmoTargetableEntity>(
  origin: MmoVec2,
  direction: MmoVec2,
  entities: Iterable<TEntity>,
  options: MmoLineTargetOptions<TEntity>
): MmoTargetHit<TEntity>[] {
  const dir = normalizeDirection(direction);
  const includeRadius = options.includeRadius ?? true;
  const range = Math.max(0, options.range);
  const width = Math.max(0, options.width);
  const end = { x: origin.x + dir.x * range, y: origin.y + dir.y * range };
  const hits: MmoTargetHit<TEntity>[] = [];
  for (const entity of entities) {
    if (options.filter && !options.filter(entity)) continue;
    const radius = mmoTargetRadius(entity, includeRadius);
    const toTargetX = entity.x - origin.x;
    const toTargetY = entity.y - origin.y;
    const projected = toTargetX * dir.x + toTargetY * dir.y;
    if (projected < -radius || projected > range + radius) continue;
    const missDistance = Math.max(0, pointSegmentDistance(entity, origin, end) - radius);
    if (missDistance > width) continue;
    hits.push({ target: entity, distance: Math.max(0, projected) });
  }
  hits.sort((a, b) => a.distance - b.distance || (b.target.priority ?? 0) - (a.target.priority ?? 0) || a.target.id.localeCompare(b.target.id));
  return hits;
}

export function firstMmoLineTargetHit<TEntity extends MmoTargetableEntity>(
  origin: MmoVec2,
  direction: MmoVec2,
  entities: Iterable<TEntity>,
  options: MmoLineTargetOptions<TEntity>
): MmoTargetHit<TEntity> | undefined {
  const dir = normalizeDirection(direction);
  const includeRadius = options.includeRadius ?? true;
  const range = Math.max(0, options.range);
  const width = Math.max(0, options.width);
  const end = { x: origin.x + dir.x * range, y: origin.y + dir.y * range };
  let selected: TEntity | undefined;
  let selectedDistance = Number.POSITIVE_INFINITY;
  for (const entity of entities) {
    if (options.filter && !options.filter(entity)) continue;
    const radius = mmoTargetRadius(entity, includeRadius);
    const toTargetX = entity.x - origin.x;
    const toTargetY = entity.y - origin.y;
    const projected = toTargetX * dir.x + toTargetY * dir.y;
    if (projected < -radius || projected > range + radius) continue;
    const missDistance = Math.max(0, pointSegmentDistance(entity, origin, end) - radius);
    if (missDistance > width) continue;
    const hitDistance = Math.max(0, projected);
    if (!betterByDistance(entity, hitDistance, selected, selectedDistance)) continue;
    selected = entity;
    selectedDistance = hitDistance;
  }
  return selected ? { target: selected, distance: selectedDistance } : undefined;
}

export function mmoTargetInCone<TEntity extends MmoTargetableEntity>(
  origin: MmoVec2,
  direction: MmoVec2,
  entity: TEntity,
  options: Pick<MmoConeTargetOptions<TEntity>, "range" | "halfAngleRad" | "includeRadius">
) {
  const dir = normalizeDirection(direction);
  const dx = entity.x - origin.x;
  const dy = entity.y - origin.y;
  const targetDistance = Math.hypot(dx, dy);
  const radius = mmoTargetRadius(entity, options.includeRadius ?? true);
  if (targetDistance > Math.max(0, options.range) + radius) return false;
  if (targetDistance <= EPSILON) return true;
  const dot = (dx / targetDistance) * dir.x + (dy / targetDistance) * dir.y;
  return dot >= Math.cos(Math.max(0, options.halfAngleRad));
}

export function coneMmoTargetHits<TEntity extends MmoTargetableEntity>(
  origin: MmoVec2,
  direction: MmoVec2,
  entities: Iterable<TEntity>,
  options: MmoConeTargetOptions<TEntity>
): MmoTargetHit<TEntity>[] {
  const hits: MmoTargetHit<TEntity>[] = [];
  for (const entity of entities) {
    if (options.filter && !options.filter(entity)) continue;
    if (!mmoTargetInCone(origin, direction, entity, options)) continue;
    hits.push({ target: entity, distance: distance(origin, entity) });
  }
  hits.sort((a, b) => a.distance - b.distance || (b.target.priority ?? 0) - (a.target.priority ?? 0) || a.target.id.localeCompare(b.target.id));
  return hits;
}

export function radiusMmoTargetHits<TEntity extends MmoTargetableEntity>(
  center: MmoVec2,
  entities: Iterable<TEntity>,
  options: MmoRadiusTargetOptions<TEntity>
): MmoTargetHit<TEntity>[] {
  const includeRadius = options.includeRadius ?? true;
  const hits: MmoTargetHit<TEntity>[] = [];
  for (const entity of entities) {
    if (options.filter && !options.filter(entity)) continue;
    const effectiveDistance = Math.max(0, distance(center, entity) - mmoTargetRadius(entity, includeRadius));
    if (effectiveDistance > Math.max(0, options.radius)) continue;
    hits.push({ target: entity, distance: effectiveDistance });
  }
  hits.sort((a, b) => a.distance - b.distance || (b.target.priority ?? 0) - (a.target.priority ?? 0) || a.target.id.localeCompare(b.target.id));
  return hits;
}
