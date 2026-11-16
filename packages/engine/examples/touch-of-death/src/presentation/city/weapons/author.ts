import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { CITY_WEAPONS, cityWeapon, cityWeaponFamilies } from './catalogue.ts';
import { applyInstalledCityWeaponModels } from './models.ts';
import { authorCityWeaponLayouts, cityWeaponPool } from './layouts.ts';
import { authorCityWeaponMaterials } from './materials.ts';
import { applyAttackWeight } from '../../../combat/balance.ts';

/** Small editable templates keep single-purpose tools out of combat's role synthesis. */
export function authorCityWeaponCatalogue({ declaration, combat }: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D }) {
  const scene = declaration.scenes.find(value => value.id === declaration.activeSceneId);
  if (!scene) throw new Error('City weapons require an active scene.');
  for (const [id, color, metallic] of [
    ['tod:city:tool-wood', [.65, .38, .12, 1], 0], ['tod:city:tool-metal', [.58, .66, .67, 1], .65],
    ['tod:city:weapon-foam', [.95, .98, 1, 1], 0], ['tod:city:weapon-oil', [.23, .18, .055, 1], 0],
    ['tod:city:weapon-soap', [.25, .65, .83, 1], 0], ['tod:city:weapon-marbles', [.7, .29, .76, 1], .25],
  ] as const) if (!declaration.materials.some(material => material.id === id)) declaration.materials.push({ id, shading: 'lit', baseColor: [...color], metallic, roughness: .65, doubleSided: false });
  for (const [family, definition] of Object.entries(cityWeaponFamilies)) {
    const single = definition.kit === 'single-use' || definition.kit === 'ground';
    for (const attack of single ? ['light'] as const : ['light', 'heavy'] as const) {
      const [startupFrames, activeFrames, recoveryFrames, damage, hitstunFrames, impulse] = definition[attack];
      const id = `weapon-${family}-${attack}`;
      const length = Math.max(...CITY_WEAPONS.filter(row => row[2] === family).map(row => row[3]));
      const move = { id, command: [id], startupFrames, activeFrames, recoveryFrames,
        hitRecoveryFrames: Math.min(recoveryFrames, attack === 'light' ? 8 : 12), damage, hitstunFrames,
        blockstunFrames: family === 'ground' ? 0 : Math.min(hitstunFrames, 8), impulse, hitRadius: family === 'ground' ? .01 : .3,
        reach: family === 'ground' ? .01 : family === 'distraction' ? 1.3 : family === 'spray' && attack === 'heavy' ? 2.3 : length,
        guardDamage: family === 'heavy' && attack === 'heavy' ? 32 : damage, staminaCost: single ? 1 : attack === 'heavy' ? 8 : 3,
        pose: attack === 'heavy' ? 'hook' as const : 'jolt' as const,
        ...(family === 'spray' && attack === 'heavy' ? { hitArcDegrees: 60 } : {}),
        ...(family === 'flexible' && attack === 'light' ? { strikeFrames: [0, 6, 12] } : {}), cancels: [], stringOnly: false };
      applyAttackWeight(move);
      const index = combat.config.moves.findIndex(value => value.id === id);
      if (index >= 0) combat.config.moves[index] = move; else combat.config.moves.push(move);
    }
  }
  authorCityWeaponMaterials(declaration);
  scene.entities = scene.entities.filter(entity => !entity.id.startsWith('tod:city:weapon:') && !entity.id.startsWith('tod:city:tool:'));
  const authored = cityWeaponPool.map(({ entityId, key, position }) => {
    const { key: _key, family: _family, width, depth, ...weapon } = cityWeapon(key);
    scene.entities.push({ id: entityId, meshId: 'tod:box', materialId: `tod:city:weapon-material:${key}`, position: [...position], scale: [width / 2, weapon.length / 2, depth / 2], rotationY: 0 });
    if (weapon.kit === 'spray' || weapon.kit === 'ground') scene.entities.push({ id: `${entityId}:effect`, meshId: weapon.kit === 'spray' && declaration.meshes.some(mesh => mesh.id === 'tod:sphere') ? 'tod:sphere' : 'tod:box',
      materialId: `tod:city:weapon-${weapon.kit === 'spray' ? 'foam' : key === 'oil-bottle' ? 'oil' : key === 'bag-of-marbles' ? 'marbles' : 'soap'}`, position: [...position], scale: [0, 0, 0], rotationY: 0 });
    return { entityId, ...weapon };
  });
  combat.interactions = { ...combat.interactions, weapons: [
    ...(combat.interactions?.weapons.filter(weapon => !weapon.entityId.startsWith('tod:city:tool:') && !weapon.entityId.startsWith('tod:city:weapon:')) ?? []), ...authored,
  ] };
  authorCityWeaponLayouts({ declaration, combat });
  applyInstalledCityWeaponModels(declaration);
}
