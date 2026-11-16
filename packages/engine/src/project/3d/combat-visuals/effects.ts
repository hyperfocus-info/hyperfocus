import { cos, hypot, sin } from '../../../math/simulation.ts';
import { presentCombatCamera3D } from './camera.ts';
import type { CombatEvent, CombatSnapshot } from '../../../combat/state.ts';
import type { CombatVector } from '../../../combat/config.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';

type Entity = Hyperfocus3DEvaluatedFrame['entities'][number];

/** Authored accessories keep effects bounded, editable and independent of render history. */
export function presentCombatEffects3D(options: { frame: Hyperfocus3DEvaluatedFrame; state: CombatSnapshot; events?: readonly CombatEvent[]; velocities?: ReadonlyMap<string, CombatVector>; reducedMotion?: boolean; viewportAspect?: number; grounded?: ReadonlySet<string> }) {
  const { frame, state, events = [], velocities } = options;
  presentCombatCamera3D(options);
  for (const fighter of state.fighters) {
    const root = frame.entities.find(entity => entity.id === fighter.id);
    if (!root) continue;
    let event: CombatEvent | undefined;
    for (const item of events) if (item.targetId === fighter.id && state.frame - item.frame >= 0 && state.frame - item.frame < 18) event = item;
    const age = event ? state.frame - event.frame : 18;
    const attacker = event && frame.entities.find(entity => entity.id === event.attackerId);
    const anchored = event?.contactPoint && hypot(event.impulse.x, event.impulse.z) > .001;
    const dx = anchored && event ? -event.impulse.x : (attacker?.position[0] ?? root.position[0] - fighter.facing.x) - root.position[0];
    const dz = anchored && event ? -event.impulse.z : (attacker?.position[2] ?? root.position[2] - fighter.facing.z) - root.position[2];
    const length = hypot(dx, dz) || 1, nx = dx / length, nz = dz / length;
    const blocked = event?.kind === 'block', parried = event?.kind === 'parry';
    const ground = event?.kind === 'bounce' || event?.kind === 'tech';
    const ring = ground || event?.kind === 'escape';
    const strong = !!event && (event.damage >= 18 || event.kind === 'guard-break' || event.counter);
    const lifetime = blocked ? 10 : parried ? 14 : strong ? 18 : 15;
    const t = Math.min(1, age / lifetime), active = !!event && age < lifetime;
    // Surface facing the attacker, not the middle of the defender's torso.
    const cx = event?.contactPoint?.x ?? root.position[0] + (ground ? 0 : nx * .45);
    const cy = event?.contactPoint?.y ?? root.position[1] + (ground ? -.87 : .2);
    const cz = event?.contactPoint?.z ?? root.position[2] + (ground ? 0 : nz * .45);
    const speed = velocities?.get(fighter.id);
    const magnitude = speed ? hypot(speed.x, speed.z) : 0;
    for (let index = 0; index < 12; index++) {
      const spark = frame.entities.find(entity => entity.id === `${fighter.id}:spark:${index}`);
      if (!spark) continue;
      spark.visible = active && !parried && event?.kind !== 'tech' && (!options.reducedMotion || index < 4) && (!blocked || index < 6);
      if (!spark.visible) { spark.scale = [0, 0, 0];continue; }
      // Tapered slashes open from the actual contact and travel along the force.
      // Small flecks trail four long strokes; no floating ring of round beads.
      const angle = index * 2.399963 + (event?.frame ?? 0) * .73;
      const primary = index < 4, spread = primary ? .8 : 1.3;
      const force = event?.impulse, forceLength = force ? hypot(force.x, force.y, force.z) : 0;
      const normal = ground ? event?.contactNormal : undefined;
      let ax = normal?.x ?? (forceLength > .001 ? force!.x / forceLength : -nx);
      let ay = normal?.y ?? (forceLength > .001 ? force!.y / forceLength : 0);
      let az = normal?.z ?? (forceLength > .001 ? force!.z / forceLength : -nz);
      const axisLength = hypot(ax, ay, az) || 1;ax /= axisLength;ay /= axisLength;az /= axisLength;
      const horizontal = hypot(ax, az);
      const ux = horizontal > .001 ? az / horizontal : 1, uz = horizontal > .001 ? -ax / horizontal : 0;
      const vx = ay * uz, vy = az * ux - ax * uz, vz = -ay * ux;
      const side = cos(angle) * spread, up = sin(angle) * spread;
      const forward = ring ? .18 : blocked ? -.16 : .65;
      const sx = ux * side + vx * up + ax * forward, sy = vy * up + ay * forward, sz = uz * side + vz * up + az * forward;
      const rayLength = hypot(sx, sy, sz) || 1;
      const rx = sx / rayLength, ry = sy / rayLength, rz = sz / rayLength;
      const travel = options.reducedMotion ? .1 : .06 + (1 - (1 - t) ** 2) * (strong ? 1.15 : blocked ? .42 : .72);
      const streak = (1 - t) * (primary ? strong ? .68 : .4 : .16) * (blocked ? .6 : 1);
      const width = (1 - t) ** 2 * (primary ? .034 : .022) * (strong ? 1.25 : 1);
      const x = cx + rx * travel, y = cy + ry * travel - (ground ? 0 : t * t * .12), z = cz + rz * travel;
      poseCombatLimb(spark, [x, y, z], [x + rx * streak, y + ry * streak, z + rz * streak], width);
    }
    for (let index = 0; index < 4; index++) {
      const trail = frame.entities.find(entity => entity.id === `${fighter.id}:trail:${index}`);
      if (!trail) continue;
      const distance = (index + 1) * .04;
      const grounded = options.grounded ? options.grounded.has(fighter.id) : root.position[1] < 1.15 && Math.abs(speed?.y ?? 0) < 1;
      const cadence = (state.frame + index * 4) % 14 / 14;
      const size = magnitude > 3 && (!options.reducedMotion || index < 2) ? Math.min(.17, magnitude * .012) * (1 - index / 5) * (grounded ? 1 - cadence : .5) : 0;
      trail.position = [root.position[0] - (speed?.x ?? 0) * distance, root.position[1] - (grounded ? .92 - cadence * .14 : .65 - index * .09), root.position[2] - (speed?.z ?? 0) * distance];
      trail.scale = [size, size * .45, size];
      trail.visible = size > 0;
    }
  }
}

/** Radius-one sphere geometry: half extents bridge the two joints with a small overlap. */
export function poseCombatLimb(entity: Entity, a: Entity['position'], b: Entity['position'], width: number) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const length = hypot(dx, dy, dz);
  entity.position = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const q = hypot(dz, dx, length + dy);
  entity.rotation = q > .00001 ? [dz / q, 0, -dx / q, (length + dy) / q] : [1, 0, 0, 0];
  entity.scale = [width / 2, length / 2 + width * .175, width / 2];
  entity.visible = true;
}
