import { requireText } from '@hyperfocus/utilities/text';
import { optional, readList, readObject, readTuple, requireBoolean, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';
import type { createCombatEnvironment } from './session.ts';
import type { HazardState } from './hazards/session.ts';
import type { VehicleStop } from './vehicles/vehicle-motion.ts';

let hazardFields: ObjectReaders<HazardState>;
let stopFields: ObjectReaders<VehicleStop>;
type Snapshot = ReturnType<ReturnType<typeof createCombatEnvironment>['capture']>;
let fields: ObjectReaders<Snapshot>;
export function readCombatEnvironmentState3D(value: unknown): Snapshot { return structuredClone(readObject(value, (fields ??= {
  frame: requireNumber,
  surfaces: value => readList(value, value => readObject(value, { entityId: requireText, phase: value => requireOneOf(value, ['intact', 'warning', 'removed']) })),
  trace: value => readList(value, value => readObject(value, { frame: requireNumber, entityId: requireText, kind: value => requireOneOf(value, ['warning', 'removed']), cause: value => requireOneOf(value, ['impact', 'scheduled']), actor: requireText, speed: requireNumber })),
  attackContacts: optional(value => readList(value, requireText)), traffic: optional(value => readList(value, value => readObject(value, { entityId: requireText, fighterId: requireText }))),
  vehicleStops: optional(value => readList(value, value => readObject(value, (stopFields ??= {
  entityId: requireText, position: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), cause: value => requireOneOf(value, ['impact', 'blocked']), blockerId: requireText, rotationY: optional(requireNumber), wheelDistance: optional(requireNumber),
})))), hazards: optional(value => readObject(value, (hazardFields ??= {
  frame: requireNumber,
  contacts: value => readList(value, value => readObject(value, { entityId: requireText, fighterId: requireText, active: requireBoolean, nextDamageFrame: requireNumber })),
  trace: value => readList(value, value => readObject(value, { entityId: requireText, fighterId: requireText, frame: requireNumber, kind: value => requireOneOf(value, ['enter', 'exit', 'damage']), damage: requireNumber })),
}))),
}))); }
