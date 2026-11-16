import { requireText } from '@hyperfocus/utilities/text';
import { optional, readDictionary, readList, readObject, readTuple, requireBoolean, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';
import { readRigidContactSnapshot3D } from '../../../physics/rigid/portable-contacts.ts';
import { readGameplayState3D } from '../gameplay-contracts.ts';
import { readPlaySnapshot3D } from '../play/snapshot.ts';
import { readRuntimeSnapshotStructure3D } from '../runtime/serialization/snapshot.ts';
import { readGameplayCombatSnapshot3D } from './combat-snapshot.ts';
import type { GameplaySnapshot3D } from '../gameplay.ts';

let gameplayFields: ObjectReaders<NonNullable<GameplaySnapshot3D['gameplay']>>;
export function readGameplayContinuation3D(value: unknown) { return structuredClone(readObject(value, (gameplayFields ??= {
  version: value => requireOneOf(value, [1]), states: value => readDictionary(value, readGameplayState3D),
  velocities: value => readList(value, value => readObject(value, { id: requireText, value: value => readTuple(value, [requireNumber, requireNumber, requireNumber]) })),
  held: optional(value => readList(value, requireText)), firstStep: optional(requireBoolean), contacts: optional(readRigidContactSnapshot3D),
}))); }

let snapshotFields: ObjectReaders<Pick<GameplaySnapshot3D, 'play' | 'combat' | 'gameplay'>>;
/** Complete current structural contract, detached and without defaulting or world
 * creation. Project/config/entity/recipe compatibility remains restore's authority.
 * A renderOnly marker is preserved; runtime.restore continues to reject it. */
export function readGameplaySnapshot3D(value: unknown): GameplaySnapshot3D {
  const base = readRuntimeSnapshotStructure3D(value);
  return structuredClone({ ...base, ...readObject(base, snapshotFields ??= { play: optional(readPlaySnapshot3D), combat: optional(readGameplayCombatSnapshot3D), gameplay: optional(readGameplayContinuation3D) }) });
}
