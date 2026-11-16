import { requireText } from '@hyperfocus/utilities/text';
import { optional, readDictionary, readList, readObject, requireBoolean, requireNumber, type ObjectReaders } from '@hyperfocus/utilities/validation';
import { readCombatVector } from '../../../combat/observation-readers.ts';
import type { createCombatInteractions } from './session.ts';
import type { WeaponState } from './weapons/utility.ts';

let weaponFields: ObjectReaders<WeaponState>;
type Snapshot = ReturnType<ReturnType<typeof createCombatInteractions>['capture']>;
let fields: ObjectReaders<Snapshot>;
export function readCombatInteractionState3D(value: unknown): Snapshot { return structuredClone(readObject(value, (fields ??= {
  weapons: value => readList(value, value => readObject(value, (weaponFields ??= {
  id: requireText, owner: requireText, durability: requireNumber, length: requireNumber, position: readCombatVector, velocity: readCombatVector, projectileOwner: requireText, serial: requireNumber,
  active: optional(requireBoolean), ammo: optional(requireNumber), spentSerial: optional(requireNumber), effectSerial: optional(requireNumber), terrainContact: optional(readCombatVector),
}))),
  grapples: value => readList(value, value => readObject(value, { attacker: requireText, target: requireText, remaining: requireNumber, direction: readCombatVector })),
  attempts: optional(value => readList(value, value => readObject(value, { attacker: requireText, remaining: requireNumber, direction: readCombatVector }))),
  trace: value => readList(value, value => readObject(value, { frame: requireNumber, kind: requireText, actor: requireText, target: requireText, value: requireNumber, position: optional(readCombatVector) })),
  lastAttacks: value => readDictionary(value, requireNumber),
  zones: optional(value => readList(value, value => readObject(value, { id: requireText, weaponId: requireText, position: readCombatVector, radius: requireNumber, movementScale: requireNumber, remaining: requireNumber }))),
  slows: optional(value => readList(value, value => readObject(value, { fighterId: requireText, weaponId: requireText, movementScale: requireNumber, remaining: requireNumber }))),
}))); }
