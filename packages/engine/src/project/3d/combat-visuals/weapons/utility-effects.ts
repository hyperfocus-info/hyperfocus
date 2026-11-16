import type { Hyperfocus3DEvaluatedFrame } from '../../../../frame/3d.ts';
import type { CombatSnapshot } from '../../../../combat/state.ts';
import type { createCombatInteractions } from '../../combat-interaction/session.ts';
import type { CombatInteractions } from '../../combat-interaction/config.ts';
import { cos, hypot, sin } from '../../../../math/simulation.ts';
import type { Hyperfocus3DDeclaration } from '../../declaration.ts';

/** Render-only resources keep patches and spray cones attached to portable state. */
export function presentWeaponUtilities(options: { frame: Hyperfocus3DEvaluatedFrame; state: ReturnType<ReturnType<typeof createCombatInteractions>['capture']>; combat: CombatSnapshot; definition?: CombatInteractions; capacity: number; entities: readonly Hyperfocus3DDeclaration['scenes'][number]['entities'][number][] }) {
  const { frame, state, combat, definition } = options;
  frame.effects = frame.effects.filter(effect => !effect.id.startsWith('weapon-utility:'));
  let available = Math.max(0, options.capacity - frame.effects.reduce((count, effect) => count + effect.particles.length, 0));
  const emit = (id: string, weaponId: string, particles: Hyperfocus3DEvaluatedFrame['effects'][number]['particles']) => {
    const source = options.entities.find(entity => entity.id === `${weaponId}:effect`);
    if (!source || !available) return;
    const bounded = particles.slice(0, available);available -= bounded.length;
    if (bounded.length) frame.effects.push({ id: `weapon-utility:${id}`, kind: 'smoke', presentation: 'model', meshId: source.meshId, materialId: source.materialId, particles: bounded });
  };
  for (const zone of state.zones ?? []) emit(zone.id, zone.weaponId, [{ id: zone.id, position: [zone.position.x, zone.position.y + .025, zone.position.z], rotation: [0, 0, 0, 1], scale: [zone.radius, .025, zone.radius] }]);
  for (const item of state.weapons) {
    const weapon = definition?.weapons.find(weapon => weapon.entityId === item.id), owner = combat.fighters.find(fighter => fighter.id === item.owner);
    if (weapon?.kit !== 'spray' || !owner?.moveId || owner.moveFrame < 0) continue;
    const spraying = state.trace.some(trace => trace.kind === 'weapon-sprayed' && trace.actor === owner.id && trace.target === item.id && combat.frame - trace.frame >= 0 && combat.frame - trace.frame < 14);
    if (!spraying) continue;
    const range = weapon.effect?.range ?? 2.4, arc = (weapon.effect?.arcDegrees ?? 60) * Math.PI / 360;
    const length = hypot(owner.facing.x, owner.facing.z) || 1, dx = owner.facing.x / length, dz = owner.facing.z / length;
    const particles: Hyperfocus3DEvaluatedFrame['effects'][number]['particles'] = [];
    for (let index = 0; index < Math.min(12, available); index++) {
      const travel = ((combat.frame * 3 + index * 5) % 23 + 1) / 24, angle = (index % 5 / 4 * 2 - 1) * arc;
      const x = dx * cos(angle) - dz * sin(angle), z = dz * cos(angle) + dx * sin(angle), size = .045 + travel * .1;
      particles.push({ id: `${item.id}:${index}`, position: [owner.position.x + x * range * travel, owner.position.y + .15 + (index % 3 - 1) * travel * .18, owner.position.z + z * range * travel], rotation: [0, 0, 0, 1], scale: [size, size, size] });
    }
    emit(item.id, item.id, particles);
  }
}
