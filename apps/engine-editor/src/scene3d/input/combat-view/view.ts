import type { Hyperfocus3DEvaluatedFrame } from '@hyperfocus/engine/project/runtime-3d';
import { combatInputDirection } from '../combat-direction.ts';

type CombatInputCamera = Pick<Hyperfocus3DEvaluatedFrame['camera'], 'position' | 'target'>;

/** Movement follows the last view shown to the player, including presentation-only orbits. */
export function createCombatInputView(options: { readCamera: () => CombatInputCamera }) {
  let presented: CombatInputCamera | undefined;
  const camera = () => presented ?? options.readCamera();
  return {
    camera,
    present(options: { camera: CombatInputCamera }) {
      presented ??= { position: [0, 0, 0], target: [0, 0, 0] };
      for (let axis = 0; axis < 3; axis++) {
        presented.position[axis] = options.camera.position[axis]!;
        presented.target[axis] = options.camera.target[axis]!;
      }
    },
    direction(options: { actions: ReadonlySet<string>; axes?: ArrayLike<number> }) {
      const view = camera();
      return combatInputDirection({ ...options, eye: view.position, target: view.target });
    },
  };
}
