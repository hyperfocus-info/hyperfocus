import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { cos, hypot, sin } from '../../../math/simulation.ts';
import { poseCombatLimb } from '../combat-visuals/effects.ts';
import type { createCombatInteractions } from './session.ts';

/** A camera-facing grip countdown between fighters stays clear of their overhead HUDs. */
export function presentGrappleFeedback(frame: Hyperfocus3DEvaluatedFrame, state: ReturnType<ReturnType<typeof createCombatInteractions>['capture']>) {
  for (const grapple of state.grapples) {
    const root = frame.entities.find(entity => entity.id === grapple.target);
    if (!root) continue;
    const attacker = frame.entities.find(entity => entity.id === grapple.attacker);
    let duration = grapple.remaining;
    for (const entry of state.trace) if (entry.kind === 'grapple-start' && entry.actor === grapple.attacker && entry.target === grapple.target) duration = entry.value;
    const count = Math.ceil(12 * Math.min(1, grapple.remaining / Math.max(1, duration)));
    const x = attacker ? (root.position[0] + attacker.position[0]) / 2 : root.position[0];
    const y = root.position[1] + .45, z = attacker ? (root.position[2] + attacker.position[2]) / 2 : root.position[2];
    const cameraX = frame.camera.position[0] - x, cameraZ = frame.camera.position[2] - z, length = hypot(cameraX, cameraZ) || 1;
    const rightX = cameraZ / length, rightZ = -cameraX / length;
    for (let index = 0; index < 12; index++) {
      const cue = frame.entities.find(entity => entity.id === `${grapple.target}:spark:${index}`);
      if (!cue) continue;
      cue.visible = index < count;
      if (!cue.visible) continue;
      const a = index * Math.PI / 6, b = a + .4;
      poseCombatLimb(cue, [x + rightX * cos(a) * .35, y + sin(a) * .35, z + rightZ * cos(a) * .35],
        [x + rightX * cos(b) * .35, y + sin(b) * .35, z + rightZ * cos(b) * .35], .045);
    }
  }
}
