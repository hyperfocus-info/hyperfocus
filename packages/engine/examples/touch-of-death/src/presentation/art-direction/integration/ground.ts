import type { Hyperfocus3DRuntime } from '@hyperfocus/engine/project/runtime-3d';
import type { RigidContact3D } from '@hyperfocus/engine/physics/rigid-3d';

/** Contact support is independent of world elevation, including roofs and moving lifts. */
export function directedGrounded(runtime: Hyperfocus3DRuntime, ids: readonly string[]) {
  const grounded = new Set<string>();
  const contact: RigidContact3D = { a: 0, b: 0, aId: '', bId: '', normalX: 0, normalY: 0, normalZ: 0, penetration: 0, pointX: 0, pointY: 0, pointZ: 0, trigger: false, closingSpeedMetersPerSecond: 0, effectiveMassKg: 0, impactEnergyJoules: 0, normalImpulseNewtonSeconds: 0, breakthrough: false };
  for (let i = 0; i < runtime.physics.contactCount(); i++) {
    runtime.physics.contact(i, contact);
    if (contact.trigger) continue;
    for (const id of ids) {
      if (id !== contact.aId && id !== contact.bId) continue;
      const other = id === contact.aId ? contact.bId : contact.aId, body = runtime.physics.body(id);
      if (!body || ids.includes(other) || runtime.physics.body(other)?.collisionMask === 0) continue;
      const direction = (body.x - contact.pointX) * contact.normalX + (body.y - contact.pointY) * contact.normalY + (body.z - contact.pointZ) * contact.normalZ >= 0 ? 1 : -1;
      if (contact.normalY * direction > .5 && body.velocityY < .2) grounded.add(id);
    }
  }
  return grounded;
}
