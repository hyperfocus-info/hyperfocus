import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';

const entityInputLeaseBrand = Symbol('EntityInputLease3D');
type Entities = Readonly<Hyperfocus3DEvaluatedFrame['entities']>;

/** A revocable promise by an exclusive frame owner that entity records and their
 * TRS arrays will not change until revoke(). Never lease a borrowed producer or
 * writable interpolation frame. The lease does not retain the frame, and covers
 * input values only: applications must still check live scene/resource storage.
 */
export type EntityInputLease3D = { readonly [entityInputLeaseBrand]: true; revoke(): void };

const active = new WeakMap<object, WeakRef<Entities>>();

export function createEntityInputLease3D(entities: Entities): EntityInputLease3D {
  const lease = Object.freeze({ [entityInputLeaseBrand]: true as const, revoke() { active.delete(lease); } });
  active.set(lease, new WeakRef(entities));
  return lease;
}

export function assertEntityInputLease3D(lease: EntityInputLease3D, entities: Entities): void {
  const retained = active.get(lease);
  if (!retained) throw Error('Entity input lease is revoked or was not issued by this runtime');
  if (retained.deref() !== entities) throw Error('Entity input lease belongs to a different entity array');
}
