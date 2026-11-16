import { cos, sin } from '../../../math/simulation.ts';
import type { RigidWorld3D, RigidWorldCheckpoint3D, RigidBodyRuntimeConfiguration3D } from '../../../physics/rigid-3d.ts';
import type { Hyperfocus3DSnapshot } from '../../runtime-3d.ts';
import type { BoundedScene3D } from '../../../render/3d-scene.ts';
import { restoreRuntimeBody3D } from '../runtime-commands.ts';
import { assertRigidCheckpointTopology3D } from '../../../physics/rigid/checkpoint-topology.ts';

export function createRuntimeSnapshotRestorer3D(options: {
  physics: RigidWorld3D; scene: BoundedScene3D; transforms: ReadonlyMap<string, number>; physicsHandles: ReadonlyMap<string, number>;
  positions: Map<string, [number, number, number]>; rotations: Map<string, number>; poses: Map<string, [number, number, number, number]>;
  setTick(tick: number): void; setMotionSeed?(seed: number): void; snapshot(): Hyperfocus3DSnapshot;
}) {
  return (value: Hyperfocus3DSnapshot, restorePhysics = true) => {
    options.setTick(value.tick);options.setMotionSeed?.(value.motionSeed ?? 0);options.poses.clear();
    for (const item of value.entities) {
      const transform = options.transforms.get(item.id)!;
      options.positions.set(item.id, [...item.position]);options.rotations.set(item.id, item.rotationY);
      const physicsHandle = options.physicsHandles.get(item.id);
      if (restorePhysics && physicsHandle !== undefined) restoreRuntimeBody3D(options.physics, physicsHandle, item);
      options.scene.transforms.setPosition(transform, ...item.position);
      options.scene.transforms.setRotationQuaternion(transform, 0, sin(item.rotationY / 2), 0, cos(item.rotationY / 2));
      if (item.rotation) { options.poses.set(item.id, [...item.rotation]);options.scene.transforms.setRotationQuaternion(transform, ...item.rotation); }
    }
    return options.snapshot();
  };
}

export type RuntimeCheckpoint3D = {
  state: {
    world: Hyperfocus3DSnapshot;
    physics: RigidWorldCheckpoint3D;
    configurations: Array<{ id: string; configuration: RigidBodyRuntimeConfiguration3D }>;
  };
  restore(): void;
  assertValid(): void;
};

/**
 * Trusted, same-runtime rollback with fixed body/constraint topology and authored
 * configuration. Unlike portable saves, this retains rigid solver history and
 * mutable body authority/collision settings. Treat state as read-only.
 *
 * Authored speed controllers are stateless; tick determines platform animation.
 * Timeline motion controllers only produce presentation poses and are rebuilt
 * after restore. Reconfiguring their timeline/cache invalidates a checkpoint.
 * Renderer/material/skeleton output is rebuilt by the next applyFrame, not hashed.
 * External scene mutation and in-place edits to authored declarations are outside
 * this contract. Combat, behavior state, audio and host clocks are separate owners.
 */
export function createRuntimeCheckpoint3D(options: {
  physics: RigidWorld3D;
  snapshot(): Hyperfocus3DSnapshot;
  restoreTransforms(snapshot: Hyperfocus3DSnapshot): void;
  assertConfiguration(): void;
  resetPresentation(): void;
}): RuntimeCheckpoint3D {
  const physics = options.physics.checkpoint();
  const configurations = physics.topology.ids.flatMap(id => {
    if (id === undefined) return [];
    const body = options.physics.body(id)!;
    return [{ id, configuration: { type: body.type, ...(body.type === 'dynamic' ? { mass: body.mass } : {}),
      collisionLayer: body.collisionLayer, collisionMask: body.collisionMask, continuous: body.continuous } }];
  });
  const state = { world: options.snapshot(), physics, configurations };
  const assertValid = () => {
    options.assertConfiguration();
    assertRigidCheckpointTopology3D(state.physics, options.physics.checkpoint());
  };
  return { state, assertValid, restore() {
    assertValid();
    // The rigid owner validates fixed topology before restoring any body state.
    options.physics.restoreCheckpoint(state.physics);
    for (const entry of configurations) options.physics.configureBody(entry.id, entry.configuration);
    options.restoreTransforms(state.world);
    options.resetPresentation();
  } };
}
