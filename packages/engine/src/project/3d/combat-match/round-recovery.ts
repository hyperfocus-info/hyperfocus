import type { CombatSnapshot } from '../../../combat/state.ts';
import type { CombatVector } from '../../../combat/config.ts';
import type { Hyperfocus3DRuntime } from '../../runtime-3d.ts';
import type { RigidBodyState3D } from '../../../physics/rigid-3d.ts';
import { hypot } from '../../../math/simulation.ts';

type Box = { x: number; y: number; z: number; hx: number; hy: number; hz: number };
const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1], [.707107, .707107], [-.707107, .707107], [.707107, -.707107], [-.707107, -.707107]] as const;

/** Resolve a local standing pose from surviving geometry without moving the winner. */
export function combatRoundStandingTargets(options: { runtime: Hyperfocus3DRuntime; state: CombatSnapshot }): Map<string, CombatVector> {
  const { runtime, state } = options;
  const scene = runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!;
  const ids = new Set(state.fighters.map(fighter => fighter.id));
  const solids = scene.entities.flatMap(entity => {
    const body = runtime.physics.body(entity.id);
    if (!body || ids.has(entity.id) || !body.collisionMask || body.trigger || body.shape.kind !== 'box') return [];
    return [bounds(body)];
  });
  const result = new Map<string, CombatVector>();
  for (const fighter of state.fighters) {
    if (fighter.health > 0) continue;
    const body = runtime.physics.body(fighter.id)!;
    const radius = body.shape.kind === 'sphere' ? body.shape.radius : body.shape.kind === 'box' ? Math.max(body.shape.halfX, body.shape.halfY, body.shape.halfZ) : 1;
    const footprint = horizontalRadius(body);
    const opponents = state.fighters.filter(other => other.id !== fighter.id && other.health > 0).map(other => runtime.physics.body(other.id)!);
    let selected: CombatVector | undefined;
    for (let ring = 0; ring <= 8 && !selected; ring++) for (let direction = 0; direction < (ring ? 8 : 1); direction++) {
      const x = body.x + offsets[direction]![0]! * radius * .55 * ring;
      const z = body.z + offsets[direction]![1]! * radius * .55 * ring;
      let top = -Infinity;
      for (const box of solids) {
        const surface = box.y + box.hy;
        if (Math.abs(x - box.x) <= box.hx && Math.abs(z - box.z) <= box.hz && surface <= body.y + .6 && surface >= body.y - 4) top = Math.max(top, surface);
      }
      if (!Number.isFinite(top)) continue;
      const y = top + radius + .005;
      if (solids.some(box => overlaps(box, x, y, z, radius))) continue;
      if (opponents.some(live => Math.abs(live.y - y) < radius * 2 && hypot(live.x - x, live.z - z) < 2 * (footprint + horizontalRadius(live)))) continue;
      if (!clearRecoveryPath(solids, body, { x, y, z }, radius, opponents)) continue;
      selected = { x, y, z }; break;
    }
    result.set(fighter.id, selected ?? { x: body.x, y: body.y, z: body.z });
  }
  return result;
}

/** Reject shortcuts through walls, unsupported gaps, or the standing opponent. */
function clearRecoveryPath(solids: readonly Box[], body: RigidBodyState3D, target: CombatVector, radius: number, opponents: readonly RigidBodyState3D[]) {
  const distance = hypot(target.x - body.x, target.z - body.z);
  if (distance < .001) return true;
  const steps = Math.ceil(distance / .15);
  const starting = solids.map(box => clearance(box, body.x, target.y, body.z));
  const opponentClearance = opponents.map(other => hypot(other.x - body.x, other.z - body.z));
  for (let step = 1; step <= steps; step++) {
    const t = step / steps, x = body.x + (target.x - body.x) * t, z = body.z + (target.z - body.z) * t;
    if (!solids.some(box => Math.abs(x - box.x) <= box.hx && Math.abs(z - box.z) <= box.hz && Math.abs(box.y + box.hy - (target.y - radius - .005)) < .2)) return false;
    for (let index = 0; index < solids.length; index++) {
      const separation = clearance(solids[index]!, x, target.y, z);
      if (separation + .00001 < Math.min(radius * radius, starting[index]!)) return false;
      starting[index] = separation;
    }
    for (let index = 0; index < opponents.length; index++) {
      const other = opponents[index]!;
      if (Math.abs(other.y - target.y) >= radius * 2) continue;
      const separation = hypot(other.x - x, other.z - z);
      if (separation + .00001 < Math.min(horizontalRadius(body) + horizontalRadius(other), opponentClearance[index]!)) return false;
      opponentClearance[index] = separation;
    }
  }
  return true;
}

function horizontalRadius(body: RigidBodyState3D) {
  return body.shape.kind === 'sphere' ? body.shape.radius : body.shape.kind === 'box' ? Math.max(body.shape.halfX, body.shape.halfZ) : 1;
}

function overlaps(box: Box, x: number, y: number, z: number, radius: number) {
  return clearance(box, x, y, z) < radius * radius;
}

function clearance(box: Box, x: number, y: number, z: number) {
  const dx = Math.max(0, Math.abs(x - box.x) - box.hx), dy = Math.max(0, Math.abs(y - box.y) - box.hy), dz = Math.max(0, Math.abs(z - box.z) - box.hz);
  return dx * dx + dy * dy + dz * dz;
}

function bounds(body: RigidBodyState3D): Box {
  if (body.shape.kind !== 'box') throw new Error('Expected box support.');
  const { rotationX: x, rotationY: y, rotationZ: z, rotationW: w } = body;
  const { halfX: hx, halfY: hy, halfZ: hz } = body.shape;
  return { x: body.x, y: body.y, z: body.z,
    hx: Math.abs(1 - 2 * (y * y + z * z)) * hx + Math.abs(2 * (x * y - z * w)) * hy + Math.abs(2 * (x * z + y * w)) * hz,
    hy: Math.abs(2 * (x * y + z * w)) * hx + Math.abs(1 - 2 * (x * x + z * z)) * hy + Math.abs(2 * (y * z - x * w)) * hz,
    hz: Math.abs(2 * (x * z - y * w)) * hx + Math.abs(2 * (y * z + x * w)) * hy + Math.abs(1 - 2 * (x * x + y * y)) * hz };
}
