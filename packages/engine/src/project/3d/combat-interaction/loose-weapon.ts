import type { CombatVector } from '../../../combat/config.ts';
import { hypot } from '../../../math/simulation.ts';

type SurfaceProbe = (from: CombatVector, to: CombatVector, sweepRadius?: number) => { position: CombatVector; normal?: CombatVector } | undefined;

/** Dropped tools are harmless loose objects, settled only by current physical support. */
export function stepLooseWeapon(item: { position: CombatVector; velocity: CombatVector; terrainContact?: CombatVector }, surface: SurfaceProbe, supportPlane = false) {
  const { position, velocity } = item;
  if (velocity.x === 0 && velocity.y === 0 && velocity.z === 0) {
    const support = surface({ ...position, y: position.y + .2 }, { ...position, y: position.y - .2 }, supportPlane ? 0 : undefined);
    if (support && (support.normal?.y ?? 1) > .5) {
      // Preserve authored ground clearance; rising support may lift the tool.
      position.y = supportPlane ? support.position.y : Math.max(position.y, support.position.y);item.terrainContact = { ...position };return;
    }
  }
  const falling = velocity.y < 0;
  velocity.y -= 0.1635;
  const next = { x: position.x + velocity.x / 60, y: position.y + velocity.y / 60, z: position.z + velocity.z / 60 };
  const contact = surface(position, next, supportPlane ? 0 : undefined);
  if (contact && (contact.normal?.y ?? 1) > .5) {
    // A longer support query can choose nearby side geometry while this short
    // sweep still sees the floor. That is continued rest, not another impact.
    const landed = !item.terrainContact && (falling || hypot(position.x - contact.position.x, position.y - contact.position.y, position.z - contact.position.z) > 1e-6);
    item.position = contact.position;item.velocity = { x: 0, y: 0, z: 0 };
    item.terrainContact = { ...contact.position };return landed;
  } else {
    item.position = next;
    // One missed support sample must not rearm resting jitter. A full sweep
    // radius of unsupported travel establishes a new separated fall.
    if (item.terrainContact && hypot(next.x - item.terrainContact.x, next.y - item.terrainContact.y, next.z - item.terrainContact.z) > .065) delete item.terrainContact;
  }
}
