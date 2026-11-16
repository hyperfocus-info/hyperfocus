import type { RigidOperationContext, RigidOperations } from '../rigid-3d-operations.ts';
import { requireText } from '@hyperfocus/utilities/text';
import { optional, readList, readObject, readTuple, requireBoolean, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';

type Vector = [number, number, number];
type ManifoldPoint = { point: Vector; normalImpulse: number; friction: Vector };
type Contact = {
  aId: string; bId: string; failedBodyId?: string; normal: Vector; point: Vector; penetration: number; trigger: boolean;
  closingSpeed: number; effectiveMass: number; impactEnergy: number; normalImpulse: number;
  manifoldPointCount: number; warmStartedPointCount: number; manifold: ManifoldPoint[];
};
/** JSON-safe contact observations and solver history; body IDs are resolved on restore. */
export type RigidContactSnapshot3D = { version: 1; contacts: Contact[] };

let contactFields: ObjectReaders<Contact>;
export function readRigidContactSnapshot3D(value: unknown): RigidContactSnapshot3D {
  return structuredClone(readObject(value, { version: value => requireOneOf(value, [1]), contacts: value => readList(value, value => readObject(value, (contactFields ??= {
  aId: requireText, bId: requireText, failedBodyId: optional(requireText),
  normal: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), point: value => readTuple(value, [requireNumber, requireNumber, requireNumber]),
  penetration: requireNumber, trigger: requireBoolean, closingSpeed: requireNumber, effectiveMass: requireNumber, impactEnergy: requireNumber, normalImpulse: requireNumber,
  manifoldPointCount: requireNumber, warmStartedPointCount: requireNumber,
  manifold: value => readList(value, value => readObject(value, { point: value => readTuple(value, [requireNumber, requireNumber, requireNumber]), normalImpulse: requireNumber, friction: value => readTuple(value, [requireNumber, requireNumber, requireNumber]) })),
}))) }));
}

export function createPortableRigidContacts(context: RigidOperationContext, operations: RigidOperations) {
  const { bodies, contactStorage: c, mutable, config } = context;
  function captureContactState(): RigidContactSnapshot3D {
    const contacts: Contact[] = [];
    for (let i = 0; i < mutable.currentContacts; i++) {
      // removeBody invalidates this manifold before the next collision pass;
      // reused slots must not inherit the removed body's contact observation.
      if (!bodies.alive[c.contactA[i]!] || !bodies.alive[c.contactB[i]!] || c.contactManifoldPointCount[i] === 0) continue;
      const failedBodyId = bodies.ids[c.contactFailedBody[i]!];
      const manifold: ManifoldPoint[] = [];
      for (let p = 0; p < 4; p++) {
        const n = i * 4 + p;
        manifold.push({ point: captureVector(c.contactManifoldPointX[n]!, c.contactManifoldPointY[n]!, c.contactManifoldPointZ[n]!),
          normalImpulse: canonical(c.contactManifoldNormalImpulse[n]!), friction: captureVector(c.contactManifoldFrictionX[n]!, c.contactManifoldFrictionY[n]!, c.contactManifoldFrictionZ[n]!) });
      }
      contacts.push({ aId: bodies.ids[c.contactA[i]!]!, bId: bodies.ids[c.contactB[i]!]!, ...(failedBodyId ? { failedBodyId } : {}),
        normal: captureVector(c.contactNormalX[i]!, c.contactNormalY[i]!, c.contactNormalZ[i]!), point: captureVector(c.contactPointX[i]!, c.contactPointY[i]!, c.contactPointZ[i]!),
        penetration: canonical(c.contactPenetration[i]!), trigger: c.contactTrigger[i] !== 0, closingSpeed: canonical(c.contactClosingSpeed[i]!), effectiveMass: canonical(c.contactEffectiveMass[i]!),
        impactEnergy: canonical(c.contactImpactEnergy[i]!), normalImpulse: canonical(c.contactNormalImpulse[i]!), manifoldPointCount: c.contactManifoldPointCount[i]!,
        warmStartedPointCount: c.contactWarmStartedPointCount[i]!, manifold });
    }
    return { version: 1, contacts };
  }
  function validateContactState(value: unknown): RigidContactSnapshot3D {
    const root = object(value), rows = root.contacts;
    if (root.version !== 1 || !Array.isArray(rows) || rows.length > config.maxContacts) throw Error('Invalid portable rigid contact count or version.');
    const pairs = new Set<string>();
    const contacts = Array.from(rows, row => {
      const v = object(row), aId = bodyId(v.aId), bId = bodyId(v.bId), pair = JSON.stringify([aId, bId].sort());
      if (aId === bId || pairs.has(pair)) throw Error('Invalid duplicate portable rigid contact pair.');
      pairs.add(pair);
      const failedBodyId = v.failedBodyId === undefined ? undefined : bodyId(v.failedBodyId);
      if (failedBodyId !== undefined && failedBodyId !== aId && failedBodyId !== bId) throw Error('Invalid failed contact body.');
      if (typeof v.trigger !== 'boolean') throw Error('Invalid portable contact trigger.');
      const manifoldPointCount = count(v.manifoldPointCount), warmStartedPointCount = count(v.warmStartedPointCount);
      if (warmStartedPointCount > manifoldPointCount || !Array.isArray(v.manifold) || v.manifold.length !== 4) throw Error('Invalid portable contact manifold.');
      const manifold = Array.from(v.manifold, point => { const p = object(point);return { point: vector(p.point), normalImpulse: scalar(p.normalImpulse, true), friction: vector(p.friction) }; });
      const normal = vector(v.normal);
      const lengthSquared = normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2];
      if (Math.abs(lengthSquared - 1) > .00001) throw Error('Invalid portable contact normal.');
      return { aId, bId, ...(failedBodyId ? { failedBodyId } : {}), normal, point: vector(v.point), penetration: scalar(v.penetration, true), trigger: v.trigger,
        closingSpeed: scalar(v.closingSpeed, true), effectiveMass: scalar(v.effectiveMass, true), impactEnergy: scalar(v.impactEnergy, true), normalImpulse: scalar(v.normalImpulse, true),
        manifoldPointCount, warmStartedPointCount, manifold };
    });
    return readRigidContactSnapshot3D({ version: 1, contacts });
  }
  function bodyId(value: unknown) {
    if (typeof value !== 'string' || !value || value.length > 256 || !bodies.indexById.has(value)) throw Error('Portable contact references an unknown body.');
    return value;
  }
  function restoreContactState(value: unknown) {
    const state = validateContactState(value);
    for (let i = 0; i < state.contacts.length; i++) {
      const row = state.contacts[i]!;
      c.contactA[i] = operations.resolve(row.aId);c.contactB[i] = operations.resolve(row.bId);c.contactFailedBody[i] = row.failedBodyId === undefined ? -1 : operations.resolve(row.failedBodyId);
      c.contactNormalX[i] = row.normal[0];c.contactNormalY[i] = row.normal[1];c.contactNormalZ[i] = row.normal[2];
      c.contactPointX[i] = row.point[0];c.contactPointY[i] = row.point[1];c.contactPointZ[i] = row.point[2];
      c.contactPenetration[i] = row.penetration;c.contactTrigger[i] = Number(row.trigger);c.contactClosingSpeed[i] = row.closingSpeed;
      c.contactEffectiveMass[i] = row.effectiveMass;c.contactImpactEnergy[i] = row.impactEnergy;c.contactNormalImpulse[i] = row.normalImpulse;
      c.contactManifoldPointCount[i] = row.manifoldPointCount;c.contactWarmStartedPointCount[i] = row.warmStartedPointCount;
      for (let p = 0; p < 4; p++) {
        const n = i * 4 + p, point = row.manifold[p]!;
        c.contactManifoldPointX[n] = point.point[0];c.contactManifoldPointY[n] = point.point[1];c.contactManifoldPointZ[n] = point.point[2];
        c.contactManifoldNormalImpulse[n] = point.normalImpulse;c.contactManifoldFrictionX[n] = point.friction[0];c.contactManifoldFrictionY[n] = point.friction[1];c.contactManifoldFrictionZ[n] = point.friction[2];
      }
    }
    mutable.currentContacts = state.contacts.length;
  }
  return { captureContactState, validateContactState, restoreContactState };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid portable rigid contact object.');
  return Object.fromEntries(Object.entries(value));
}
function scalar(value: unknown, nonnegative = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e12 || nonnegative && value < 0) throw Error('Invalid portable rigid contact scalar.');
  return value;
}
function count(value: unknown) {
  const result = scalar(value, true);
  if (!Number.isInteger(result) || result > 4) throw Error('Invalid portable rigid manifold count.');
  return result;
}
function vector(value: unknown): Vector {
  if (!Array.isArray(value) || value.length !== 3) throw Error('Invalid portable rigid contact vector.');
  return [scalar(value[0]), scalar(value[1]), scalar(value[2])];
}
// JSON has one zero representation. Canonical capture remains stable through JSON.
function canonical(value: number) { return value === 0 ? 0 : value; }
function captureVector(x: number, y: number, z: number): Vector { return [canonical(x), canonical(y), canonical(z)]; }
