import type { Hyperfocus3DEvaluatedFrame } from '../../../../frame/3d.ts';
import { hypot } from '../../../../math/simulation.ts';

type Vec = [number, number, number];
type Entity = Hyperfocus3DEvaluatedFrame['entities'][number];

/** Nine targets per actor, independent of particle count. Only nearby gameplay
 * cues participate; cosmetic emission and inactive pools never clear scenery. */
export function appendCombatCueTargets(targets: Vec[], entities: readonly Entity[], slots: readonly number[], roots: readonly Entity[]) {
  for (const root of roots) {
    const min: Vec = [Infinity, Infinity, Infinity], max: Vec = [-Infinity, -Infinity, -Infinity];
    for (const slot of slots) {
      const cue = entities[slot]!;
      if (!cue.visible || !cue.id.startsWith(`${root.id}:`)) continue;
      if (hypot(cue.position[0] - root.position[0], cue.position[1] - root.position[1], cue.position[2] - root.position[2]) > 4) continue;
      // Rotated strokes and shield shards fit their scale's bounding sphere.
      const radius = Math.min(1.5, hypot(...cue.scale));
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis]!, cue.position[axis]! - radius);
        max[axis] = Math.max(max[axis]!, cue.position[axis]! + radius);
      }
    }
    if (!Number.isFinite(min[0])) continue;
    targets.push([(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]);
    for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) targets.push([x, y, z]);
  }
}
