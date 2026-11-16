import { cos, hypot, sin } from '../../math/simulation.ts';
import type { BoundedScene3D } from '../../render/3d-scene.ts';
import type { RigidWorld3D } from '../../physics/rigid-3d.ts';
import type { Hyperfocus3DSnapshot } from '../runtime-3d.ts';

export type RuntimeCommand3D =
  | { type: 'teleport'; entityId: string; position: [number, number, number]; rotationY?: number }
  | { type: 'velocity' | 'impulse'; entityId: string; value: [number, number, number] }
  | { type: 'rotate'; entityId: string; rotationY: number }
  | { type: 'pose'; entityId: string; rotation: [number, number, number, number] };

/** Validates the complete batch before changing physical or rendered state. */
export function createRuntimeCommandApplicator3D(options: {
  scene: BoundedScene3D; physics: RigidWorld3D;
  transforms: ReadonlyMap<string, number>; positions: Map<string, [number, number, number]>;
  rotations: Map<string, number>;
  poses: Map<string, [number, number, number, number]>;
  /** Called once after whole-batch validation, before any mutation. */
  onCommands?: (commands: readonly RuntimeCommand3D[]) => void;
}) {
  return (input: { commands: readonly RuntimeCommand3D[] }) => {
    const commands = validateRuntimeCommands3D(input.commands, options.positions, options.physics);
    options.onCommands?.(commands);
    for (const command of commands) {
      if (command.type === 'velocity') options.physics.setVelocity(command.entityId, ...command.value);
      else if (command.type === 'impulse') options.physics.applyImpulse(command.entityId, ...command.value);
      else if (command.type === 'pose') {
        options.poses.set(command.entityId, command.rotation);
        options.scene.transforms.setRotationQuaternion(options.transforms.get(command.entityId)!, ...command.rotation);
        if (options.physics.hasBody(command.entityId)) {
          setRuntimeBodyRotation3D(options.physics, command.entityId, command.rotation);
        }
      } else if (command.type === 'teleport' || command.type === 'rotate') {
        const transform = options.transforms.get(command.entityId)!;
        if (command.type === 'teleport') {
          options.positions.set(command.entityId, [...command.position]);
          options.scene.transforms.setPosition(transform, ...command.position);
          if (options.physics.hasBody(command.entityId)) options.physics.setPosition(command.entityId, ...command.position);
        }
        if (command.rotationY !== undefined) {
          options.rotations.set(command.entityId, command.rotationY);
          options.poses.delete(command.entityId);
          options.scene.transforms.setRotationQuaternion(transform, 0, sin(command.rotationY / 2), 0, cos(command.rotationY / 2));
          if (options.physics.hasBody(command.entityId)) {
            setRuntimeBodyRotation3D(options.physics, command.entityId, [0, sin(command.rotationY / 2), 0, cos(command.rotationY / 2)]);
          }
        }
      }
    }
  };
}

export function setRuntimeBodyRotation3D(physics: RigidWorld3D, id: string | number, rotation: [number, number, number, number]) {
  physics.setRotation(id, ...rotation);
  if (physics.body(id)?.type === 'dynamic') physics.setAngularVelocity(id, 0, 0, 0);
}

export function restoreRuntimeBody3D(physics: RigidWorld3D, id: string | number, entity: Hyperfocus3DSnapshot['entities'][number]) {
  physics.setPosition(id, ...entity.position);
  setRuntimeBodyRotation3D(physics, id, entity.rotation ?? [0, sin(entity.rotationY / 2), 0, cos(entity.rotationY / 2)]);
  if (physics.body(id)?.type === 'dynamic') physics.setVelocity(id, 0, 0, 0);
}

export function validateRuntimeCommands3D(value: unknown, entities: ReadonlyMap<string, unknown>, physics: Pick<RigidWorld3D, 'body'>): RuntimeCommand3D[] {
  if (!Array.isArray(value) || value.length > 1024) throw new Error('3D behavior requires at most 1024 commands per step.');
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || typeof raw.entityId !== 'string' || !entities.has(raw.entityId)) throw new Error('3D command references an unknown entity.');
    const entityId = raw.entityId;
    if (raw.type === 'pose') return { type: 'pose', entityId, rotation: readRotation3D(raw.rotation) };
    if (raw.type === 'teleport') return { type: 'teleport', entityId, position: vector(raw.position), ...(raw.rotationY === undefined ? {} : { rotationY: finite(raw.rotationY) }) };
    if (raw.type === 'rotate') return { type: 'rotate', entityId, rotationY: finite(raw.rotationY) };
    if (raw.type === 'velocity' || raw.type === 'impulse') {
      if (physics.body(entityId)?.type !== 'dynamic') throw new Error(`3D ${raw.type} requires a dynamic body: ${entityId}.`);
      return { type: raw.type, entityId, value: vector(raw.value) };
    }
    throw new Error(`Unsupported 3D command ${String(raw.type)}.`);
  });
}
export function readRotation3D(value: unknown): [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4 || value.some(n => typeof n !== 'number' || !Number.isFinite(n)) || Math.abs(hypot(...value) - 1) > .001) throw new Error('3D rotation must be a normalized quaternion.');
  return [value[0], value[1], value[2], value[3]];
}
function vector(value: unknown): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) throw new Error('Expected a finite 3D vector.');
  return [finite(value[0]), finite(value[1]), finite(value[2])];
}
function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1_000_000) throw new Error('3D command values must be finite and bounded.');
  return value;
}
