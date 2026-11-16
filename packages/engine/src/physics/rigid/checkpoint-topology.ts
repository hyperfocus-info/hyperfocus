import type { RigidWorldCheckpoint3D } from '../rigid-3d.ts';

/** Pure preflight shared by rigid restore and composite local rollback owners. */
export function assertRigidCheckpointTopology3D(
  value: Readonly<RigidWorldCheckpoint3D>,
  current: Pick<RigidWorldCheckpoint3D, 'capacity' | 'maxContacts' | 'precision' | 'topology'>,
) {
  if (!value || value.version !== 1 || value.capacity !== current.capacity || value.maxContacts !== current.maxContacts || value.precision !== current.precision) throw new Error('Rigid world checkpoint is incompatible with this world.');
  const { capacity, topology } = current;
  if (value.topology.alive.length !== capacity || value.topology.generation.length !== capacity || value.topology.ids.length !== capacity) throw new Error('Rigid world checkpoint topology has the wrong capacity.');
  for (let index = 0; index < capacity; index++) if (value.topology.alive[index] !== topology.alive[index] || value.topology.generation[index] !== topology.generation[index] || value.topology.ids[index] !== topology.ids[index]) throw new Error(`Rigid world checkpoint body topology differs at slot ${index}.`);
}
