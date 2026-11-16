import type { CombatSnapshot } from '../../../combat/state.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { poseCombatLimb } from '../combat-visuals/effects.ts';
import type { ResolvedAppearance3D } from './catalog.ts';

/** Fresh presentation frames only. Strike endpoints, defensive cues and simulation are never edited. */
export function applyAppearanceMotion3D(options: { frame: Hyperfocus3DEvaluatedFrame; resolved: ResolvedAppearance3D; state?: CombatSnapshot; reducedMotion?: boolean }) {
  const { frame, resolved, state } = options;
  for (const patch of resolved.styles ?? []) {
    if (patch.style === 'classic' || patch.channel === 'card') continue;
    const fighter = state?.fighters.find(fighter => fighter.id === patch.actorId);
    const root = frame.entities.find(entity => entity.id === patch.actorId);
    if (!root) continue;
    if (patch.channel === 'particles') {
      for (const entity of frame.entities) {
        if (!entity.id.startsWith(`${patch.actorId}:dust:`)) continue;
        // Trails also carry dash, attack and defensive signals. Cosmetics never edit that pool.
        if (patch.style === 'ribbons') entity.scale = [entity.scale[0] * .6, entity.scale[1] * .55, entity.scale[2] * 1.7];
        if (patch.style === 'embers') entity.scale = [entity.scale[0] * .65, entity.scale[1] * 1.8, entity.scale[2] * .65];
      }
      continue;
    }
    if (!fighter || fighter.health <= 0 || options.reducedMotion) continue;
    if (patch.channel === 'hit' && fighter.stunKind === 'hit') {
      const progress = Math.min(1, fighter.stunFrames / 12);
      const angle = (patch.style === 'snap' ? -.12 : .18) * progress;
      // A small head roll adds character without moving any contact point or hiding defensive posture.
      for (const suffix of [':head', ':hair', ':face']) {
        const part = frame.entities.find(entity => entity.id === patch.actorId + suffix);
        if (!part) continue;
        const [x, y, z, w] = part.rotation, s = Math.sin(angle / 2), c = Math.cos(angle / 2);
        part.rotation = [x * c + y * s, y * c - x * s, z * c + w * s, w * c - z * s];
      }
    }
    if (patch.channel !== 'movement' || fighter.moveId || fighter.stunFrames || fighter.guarding) continue;
    for (const side of ['left', 'right']) {
      const arm = frame.entities.find(entity => entity.id === `${patch.actorId}:${side}-arm`);
      const forearm = frame.entities.find(entity => entity.id === `${patch.actorId}:${side}-forearm`);
      const hand = frame.entities.find(entity => entity.id === `${patch.actorId}:${side}-hand`);
      if (!arm || !forearm || !hand) continue;
      const elbow: [number, number, number] = [(arm.position[0] + forearm.position[0]) / 2, (arm.position[1] + forearm.position[1]) / 2, (arm.position[2] + forearm.position[2]) / 2];
      const shoulder: [number, number, number] = [arm.position[0] * 2 - elbow[0], arm.position[1] * 2 - elbow[1], arm.position[2] * 2 - elbow[2]];
      const amount = patch.style === 'loose' ? .09 : -.045;
      elbow[0] += (side === 'left' ? -1 : 1) * amount * fighter.facing.z;
      elbow[2] -= (side === 'left' ? -1 : 1) * amount * fighter.facing.x;
      elbow[1] += patch.style === 'loose' ? -.055 : .04;
      poseCombatLimb(arm, shoulder, elbow, .2);poseCombatLimb(forearm, elbow, hand.position, .18);
    }
  }
}
