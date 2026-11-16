import { cos, hypot, sin } from '../../../math/simulation.ts';
import type { CombatEvent, CombatSnapshot } from '../../../combat/state.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import type { FrameRecordLookup } from '../../../frame/record-lookup.ts';
import { poseCombatLimb } from './effects.ts';

export type CombatTimingCue = { action: 'parry' | 'tech'; result: 'early' | 'late' | 'perfect'; frame: number; contactPoint?: { x: number; y: number; z: number }; contactNormal?: { x: number; y: number; z: number } };
export type CombatTimingFeedback = { id: string; cue?: CombatTimingCue };
export const COMBAT_TIMING_COLORS = { early: [1, .82, .03, 1], late: [1, .06, .03, 1], perfect: [1, 1, 1, 1] } as const;

/** Success expands into rings; missed timing sheds short downward streaks. */
export function presentCombatTimingRings(options: { frame: Hyperfocus3DEvaluatedFrame; state: CombatSnapshot; events?: readonly CombatEvent[]; timingFeedback?: readonly CombatTimingFeedback[]; reducedMotion?: boolean; entityLookup?: FrameRecordLookup }) {
  const { frame, state } = options;
  for (const fighter of state.fighters) {
    const root = options.entityLookup ? options.entityLookup.get(frame.entities, fighter.id) : frame.entities.find(e => e.id === fighter.id);
    if (!root) continue;
    let cue = options.timingFeedback?.find(item => item.id === fighter.id)?.cue;
    if (!cue) {
      const success = options.events?.slice().reverse().find(e => e.targetId === fighter.id && (e.kind === 'parry' || e.kind === 'tech'));
      if (success && (success.kind === 'parry' || success.kind === 'tech')) cue = { action: success.kind, result: 'perfect', frame: success.frame, contactPoint: success.contactPoint, contactNormal: success.contactNormal };
    }
    const age = cue ? state.frame - cue.frame : 30, t = age / 30;
    const material = frame.materials.find(m => m.id === `${fighter.id}:timing`);
    if (material && cue) material.look = { ...material.look, baseColor: COMBAT_TIMING_COLORS[cue.result], emissive: [0, 0, 0], opacity: Math.max(0, 1 - t * t) };
    const hands = frame.entities.filter(e => e.id === `${fighter.id}:left-hand` || e.id === `${fighter.id}:right-hand`);
    const handCenter = cue?.action === 'parry' && hands.length === 2 ? hands[0]!.position.map((v, i) => (v + hands[1]!.position[i]!) / 2) : undefined;
    const anchor = cue?.action === 'tech' ? cue.contactPoint : undefined;
    const x = anchor?.x ?? handCenter?.[0] ?? root.position[0] + fighter.facing.x * .55;
    const y = anchor?.y ?? handCenter?.[1] ?? root.position[1] + (cue?.action === 'tech' ? -.65 : .3);
    const z = anchor?.z ?? handCenter?.[2] ?? root.position[2] + fighter.facing.z * .55;
    const dx = frame.camera.position[0] - x, dz = frame.camera.position[2] - z, length = hypot(dx, dz) || 1;
    const rx = dz / length, rz = -dx / length;
    for (let i = 0; i < 24; i++) {
      const particle = options.entityLookup ? options.entityLookup.get(frame.entities, `${fighter.id}:parry:${i}`) : frame.entities.find(e => e.id === `${fighter.id}:parry:${i}`);
      if (!particle) continue;
      particle.visible = !!cue && age >= 0 && age < 30;
      if (!particle.visible) continue;
      const ring = Math.floor(i / 12), angle = (i % 12) * Math.PI / 6;
      if (cue!.result !== 'perfect') {
        const fall = options.reducedMotion ? .22 : .12 + t * .35 + t * t * .95;
        const spread = (.3 + ring * .16) * (options.reducedMotion ? 1 : 1 + t * .3);
        const normal = cue?.action === 'tech' ? cue.contactNormal : undefined;
        const px = x + rx * cos(angle) * spread + (normal?.x ?? 0) * .12;
        const floor = normal && normal.y > .5 ? y + .04 : -Infinity;
        const py = Math.max(floor + .2, y + (Number.isFinite(floor) ? .7 : 0) + sin(angle) * .12 - fall);
        const pz = z + rz * cos(angle) * spread + (normal?.z ?? 0) * .12;
        poseCombatLimb(particle, [px, py, pz], [px + rx * cos(angle) * .045, Math.max(floor, py - .12 - ring * .04), pz + rz * cos(angle) * .045], .022);
        continue;
      }
      const travel = options.reducedMotion ? 0 : t * .38;
      const radius = (ring ? .48 : .78) + travel;
      const end = angle + Math.PI / 6 * .96;
      const normal = cue?.action === 'tech' ? cue.contactNormal : undefined;
      // Surface-aligned rings sit fully outside the collision plane. Old saves
      // without normals retain the prior camera-facing cue.
      const point = (a: number): [number, number, number] => {
        if (!normal) return [x + rx * cos(a) * radius, y + sin(a) * radius, z + rz * cos(a) * radius];
        const len = hypot(normal.x, normal.y, normal.z) || 1;
        const nx = normal.x / len, ny = normal.y / len, nz = normal.z / len;
        const horizontal = hypot(nx, nz);
        const ux = horizontal > .001 ? nz / horizontal : 1, uz = horizontal > .001 ? -nx / horizontal : 0;
        const vx = ny * uz, vy = nz * ux - nx * uz, vz = -ny * ux;
        return [x + nx * .12 + radius * (ux * cos(a) + vx * sin(a)), y + ny * .12 + radius * vy * sin(a), z + nz * .12 + radius * (uz * cos(a) + vz * sin(a))];
      };
      poseCombatLimb(particle, point(angle), point(end), .025 + (1 - t) * .04);
    }
  }
}
