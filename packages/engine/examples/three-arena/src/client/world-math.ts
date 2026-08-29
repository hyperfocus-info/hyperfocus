import { wrapValue } from "./progression-data.ts";
import type * as Three from "three";
import { state } from "./arena-state.ts";
import { THREE } from "./boot-and-dom.ts";
import { WORLD_HALF_SIZE, WORLD_SIZE, toroidalWorld } from "./content-runtime.ts";
import { runtimeCallback } from "./runtime-ports.ts";
import { PERF_FLAGS } from "./environment.ts";
const cachedGeometry = runtimeCallback("contentUi", "cachedGeometry");
const runRandom = runtimeCallback("runLifecycle", "runRandom");
import { remotePlayers } from "./runtime-context.ts";
import type { Enemy, EnemyTarget, Player, WorldActor, WorldDelta, WorldPoint } from "./runtime-types.ts";

export function getConeGeometry(): Three.BufferGeometry {
  return cachedGeometry("geometry:effect:muzzleCone", () => new THREE.ConeGeometry(0.35, 0.95, 7, 1, true));
}

export function getRingGeometry(): Three.BufferGeometry {
  return cachedGeometry("geometry:effect:blastRing", () => new THREE.RingGeometry(0.55, 1.05, 28));
}

export function rebuildEnemySpatialGrid(): void {
  const items = state.enemySpatialItems;
  items.length = 0;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    enemy.y = enemy.z;
    items.push(enemy);
  }
  state.enemySpatialGrid.rebuild(items);
  state.enemySpatialDirty = false;
}

export function markEnemySpatialDirty(): void {
  state.enemySpatialDirty = true;
}

export function queryLiveEnemies(x: number, z: number, range: number, out: Enemy[] = state.enemySpatialCandidates): Enemy[] {
  if (!PERF_FLAGS.enemySpatialGrid) {
    out.length = 0;
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      const radius = Math.max(0, range) + enemy.radius;
      if (worldDistanceSquared(x, z, enemy.x, enemy.z) <= radius * radius) out.push(enemy);
    }
    return out;
  }
  if (state.enemySpatialDirty || state.enemySpatialGrid.size() !== state.enemySpatialItems.length) rebuildEnemySpatialGrid();
  return state.enemySpatialGrid.queryCircle({ x, y: z, radius: Math.max(0, range) }, out);
}

export function nearestEnemy(x: number, z: number, range: number): Enemy | null {
  const candidates = queryLiveEnemies(x, z, range);
  let best = null;
  let bestDistanceSq = range * range;
  for (const enemy of candidates) {
    if (enemy.hp <= 0) continue;
    const distanceSq = worldDistanceSquared(x, z, enemy.x, enemy.z);
    if (distanceSq <= bestDistanceSq) {
      best = enemy;
      bestDistanceSq = distanceSq;
    }
  }
  return best;
}

export function nearestPlayer(x: number, z: number, fallback: Player): EnemyTarget {
  if (remotePlayers.size === 0) return fallback;
  let best: EnemyTarget = fallback;
  let bestDist = worldDistanceSquared(x, z, fallback.x, fallback.z);
  for (const remote of remotePlayers.values()) {
    const rx = remote.mesh.position.x;
    const rz = remote.mesh.position.z;
    const d2 = worldDistanceSquared(x, z, rx, rz);
    if (d2 < bestDist) {
      bestDist = d2;
      best = { x: rx, z: rz, radius: 1 };
    }
  }
  return best;
}

export function angleTo(ax: number, az: number, bx: number, bz: number): number {
  return Math.atan2(worldAxisDelta(az, bz), worldAxisDelta(ax, bx));
}

export function distanceSquared(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

export function getWorldSize(): number {
  return WORLD_SIZE;
}

export function getWorldCenter(): WorldPoint {
  const [minX, minZ] = toroidalWorld.origin;
  return {
    x: minX + toroidalWorld.width / 2,
    z: minZ + toroidalWorld.depth / 2
  };
}

export function wrapWorld(value: number): number {
  return wrapValue(value, WORLD_SIZE);
}

export function wrapEntity<T extends { x: number; z: number }>(entity: T): void {
  entity.x = wrapWorld(entity.x);
  entity.z = wrapWorld(entity.z);
}

export function worldAxisDelta(from: number, to: number): number {
  let delta = to - from;
  if (delta > WORLD_HALF_SIZE) delta -= WORLD_SIZE;
  else if (delta < -WORLD_HALF_SIZE) delta += WORLD_SIZE;
  return delta;
}

export function worldDeltaInto(out: WorldDelta, ax: number, az: number, bx: number, bz: number): WorldDelta {
  out.dx = worldAxisDelta(ax, bx);
  out.dz = worldAxisDelta(az, bz);
  return out;
}

export function worldDelta(ax: number, az: number, bx: number, bz: number): WorldDelta {
  return { dx: worldAxisDelta(ax, bx), dz: worldAxisDelta(az, bz) };
}

export function worldDistanceSquared(ax: number, az: number, bx: number, bz: number): number {
  const dx = worldAxisDelta(ax, bx);
  const dz = worldAxisDelta(az, bz);
  return dx * dx + dz * dz;
}

export function renderPosition(x: number, z: number, anchor: Pick<WorldActor, "x" | "z"> | null = state.player): WorldPoint {
  if (!anchor) return { x, z };
  return { x: anchor.x + worldAxisDelta(anchor.x, x), z: anchor.z + worldAxisDelta(anchor.z, z) };
}

export function renderPositionInto(out: WorldPoint, x: number, z: number, anchor: Pick<WorldActor, "x" | "z"> | null = state.player): WorldPoint {
  if (!anchor) {
    out.x = x;
    out.z = z;
    return out;
  }
  out.x = anchor.x + worldAxisDelta(anchor.x, x);
  out.z = anchor.z + worldAxisDelta(anchor.z, z);
  return out;
}

export function weightedPick(mix: ReadonlyArray<readonly [string, number]>): string {
  const total = mix.reduce((sum, entry) => sum + entry[1], 0);
  let r = runRandom() * total;
  for (const [id, weight] of mix) {
    r -= weight;
    if (r <= 0) return id;
  }
  const fallback = mix[0];
  if (!fallback) throw new Error("Cannot choose from an empty weighted mix.");
  return fallback[0];
}
