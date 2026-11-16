import { atan2, cos, hypot, sin } from '../../../math/simulation.ts';
import type { CombatConfig } from '../../../combat/config.ts';
import type { CombatEvent, CombatSnapshot } from '../../../combat/state.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { sampleCombatAttackPose } from './attack-pose.ts';
import { poseCombatLimb } from './effects.ts';

/** Four authored strokes show travel and swing paths, never another hit volume. */
export function presentCombatActionTrails3D(options: { frame: Hyperfocus3DEvaluatedFrame; state: CombatSnapshot; config: CombatConfig; events?: readonly CombatEvent[]; reducedMotion?: boolean }) {
  const { frame, state, config } = options;
  for (const fighter of state.fighters) {
    const root = frame.entities.find(entity => entity.id === fighter.id);
    if (!root || fighter.health <= 0 || fighter.stunFrames > 0) continue;
    const move = config.moves.find(item => item.id === fighter.moveId);
    const tech = fighter.protectionFrames > 0 && !move;
    let techEvent: CombatEvent | undefined;
    for (const event of options.events ?? []) if (event.targetId === fighter.id && event.kind === 'tech') techEvent = event;
    const exitAge = techEvent ? state.frame - techEvent.frame - (config.techProtectionFrames ?? 8) : -1;
    const rearmed = !move && !tech && fighter.techLockoutFrames === 0 && exitAge >= 0 && exitAge < 6;
    const drive = move?.drive && move.damage > 0;
    if (!tech && !drive && !rearmed) continue;
    const yaw = atan2(fighter.facing.x, fighter.facing.z), c = cos(yaw), s = sin(yaw);
    const world = (p: [number, number, number]): [number, number, number] => [root.position[0] + p[0] * c + p[2] * s, root.position[1] + p[1], root.position[2] - p[0] * s + p[2] * c];
    for (let i = 0; i < 4; i++) {
      const trail = frame.entities.find(entity => entity.id === `${fighter.id}:trail:${i}`);
      if (!trail) continue;
      trail.visible = false;
      if (options.reducedMotion && i > 1) continue;
      if (rearmed) {
        const side = i < 2 ? -1 : 1, slope = i % 2 ? -1 : 1;
        poseCombatLimb(trail, world([side * .38 + slope * .17, -.76, .1]), world([side * .38, -.57, .1]), .04);
      } else if (tech) {
        const direction = fighter.techDirection, length = hypot(direction.x, direction.z);
        if (length < .01) continue;
        const x = direction.x / length, z = direction.z / length, side = (i % 2 ? -1 : 1) * .32;
        const y = root.position[1] + (i < 2 ? -.6 : .25);
        poseCombatLimb(trail, [root.position[0] - z * side - x * .25, y, root.position[2] + x * side - z * .25], [root.position[0] - z * side - x * .95, y, root.position[2] + x * side - z * .95], .045);
      } else if (move) {
        // Sample the authored release itself. Broad heavies describe their arc;
        // flurry strokes terminate at the same contact center as each fist.
        const strikeStart = move.strikeFrames?.[Math.max(0, fighter.strikeIndex)] ?? 0;
        const strikeAge = fighter.moveFrame - move.startupFrames - strikeStart;
        const rising = (move.hitHeight ?? 0) > 0 && strikeAge > 0 && strikeAge < move.activeFrames;
        if (!rising && (strikeAge < -3 || strikeAge > 3)) continue;
        const fraction = .72 + i * .07;
        const a = sampleCombatAttackPose({ ...fighter, moveFrame: rising ? Math.max(move.startupFrames, fighter.moveFrame - i - 1) : Math.floor(move.startupFrames * fraction) }, move).fist;
        const b = sampleCombatAttackPose({ ...fighter, moveFrame: rising ? Math.max(move.startupFrames, fighter.moveFrame - i) : Math.floor(move.startupFrames * (fraction + .07)) }, move).fist;
        poseCombatLimb(trail, world(a), world(b), move.command[0] === 'heavy' ? .065 : .035);
      }
    }
  }
}
