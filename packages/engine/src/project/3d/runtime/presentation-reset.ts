import { cos, sin } from '../../../math/simulation.ts';
import type { BoundedScene3D } from '../../../render/3d-scene.ts';
import { requireMapValue } from '../runtime-assets.ts';

/** Restore the runtime-owned authored render TRS, including presentation scale.
 * This is an explicit display reset, not a gameplay/snapshot restore. The caller
 * suspends presentation, retains ownership of its parsed declaration and invokes
 * this before rebuilding display history. No frame, cache or baseline arrays are
 * retained; validated setters keep dead-transform and finite-value failures.
 */
export function resetRuntimePresentationTransforms3D(options: {
  scene: BoundedScene3D;
  entities: readonly { id: string; position: readonly [number, number, number]; scale: readonly [number, number, number]; rotationY: number }[];
  transforms: ReadonlyMap<string, number>;
  resetHistory(): void;
}) {
  // A partial failed reset cannot retain an earlier lease/revision as clean.
  options.resetHistory();
  for (const entity of options.entities) {
    const transform = requireMapValue(options.transforms, entity.id, `3D reset transform ${entity.id}`);
    options.scene.transforms.setPosition(transform, ...entity.position);
    options.scene.transforms.setScale(transform, ...entity.scale);
    options.scene.transforms.setRotationQuaternion(transform, 0, sin(entity.rotationY / 2), 0, cos(entity.rotationY / 2));
  }
}
