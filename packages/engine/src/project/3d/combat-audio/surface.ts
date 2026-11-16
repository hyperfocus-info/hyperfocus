import { cos, sin } from '../../../math/simulation.ts';
import type { RigidContact3D } from '../../../physics/rigid-3d.ts';
import type { Hyperfocus3DRuntime } from '../../runtime-3d.ts';
import type { CombatProject3D } from '../combat-declaration.ts';

const contact: RigidContact3D = { a: 0, b: 0, aId: '', bId: '', normalX: 0, normalY: 0, normalZ: 0, penetration: 0, pointX: 0, pointY: 0, pointZ: 0, trigger: false, closingSpeedMetersPerSecond: 0, effectiveMassKg: 0, impactEnergyJoules: 0, normalImpulseNewtonSeconds: 0, breakthrough: false };

/** Support comes from real contacts; shallow water overrides the underlying floor. */
export function movementSurface(runtime: Hyperfocus3DRuntime, definition: CombatProject3D, fighterId: string, activeHazards: readonly string[]): 'wood' | 'metal' | 'wet' | undefined {
  const scene = runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!, body = runtime.physics.body(fighterId);
  if (!body) return;
  const halfY = body.shape.kind === 'sphere' ? body.shape.radius : body.shape.halfY;
  const radius = body.shape.kind === 'sphere' ? body.shape.radius : Math.max(body.shape.halfX, body.shape.halfZ);
  for (const hazard of definition.environment?.hazards ?? []) {
    if (hazard.kind !== 'flood' || !activeHazards.includes(hazard.entityId)) continue;
    const entity = scene.entities.find(entity => entity.id === hazard.entityId);if (!entity) continue;
    const dx = body.x - entity.position[0], dz = body.z - entity.position[2], c = cos(entity.rotationY), s = sin(entity.rotationY);
    if (Math.abs(dx * c - dz * s) < entity.scale[0] + radius && Math.abs(dx * s + dz * c) < entity.scale[2] + radius && Math.abs(body.y - entity.position[1]) < entity.scale[1] + halfY) return 'wet';
  }
  for (let index = 0; index < runtime.physics.contactCount(); index++) {
    runtime.physics.contact(index, contact);
    if (contact.trigger || fighterId !== contact.aId && fighterId !== contact.bId || Math.abs(contact.normalY) <= .5 || body.y <= contact.pointY) continue;
    const entity = scene.entities.find(entity => entity.id === (fighterId === contact.aId ? contact.bId : contact.aId));
    if (!entity || entity.physics?.type !== 'static') continue;
    const material = runtime.declaration.materials.find(material => material.id === entity.materialId);
    if (/(wood|timber)/i.test(entity.materialId)) return 'wood';
    if ((material?.metallic ?? 0) >= .5) return 'metal';
  }
}
