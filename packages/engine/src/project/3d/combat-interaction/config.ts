import { object } from '../gameplay-contracts.ts';

export type CombatInteractions = {
  /** Hand reach to a fighter's hurt surface or a loose object's visible shaft. */
  grappleRange?: number; grappleStartupFrames?: number; grappleTechFrames?: number; grappleDamage?: number; grappleSpeed?: number;
  grappleHitstunFrames?: number; projectileHitstunFrames?: number;
  grappleRecoveryFrames?: number; grappleWhiffFrames?: number; grappleVerticalSpeedScale?: number;
  weapons: Array<{ entityId: string; material: 'wood' | 'metal'; durability: number; length: number; lightMoveId: string; heavyMoveId: string;
    name?: string; restPose?: 'upright' | 'flat'; acousticProfile?: 'wood' | 'metal' | 'glass' | 'ceramic' | 'soft' | 'liquid' | 'scatter'; kit?: 'combat' | 'simple' | 'single-use' | 'spray' | 'ground'; ammo?: number;
    effect?: { durationFrames: number; movementScale: number; radius?: number; range?: number; arcDegrees?: number };
  }>;
};

export function readCombatInteractions(value: unknown): CombatInteractions | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object') throw new Error('Invalid combat interactions.');
  const raw = object(value);
  if (Object.keys(raw).some(key => !['weapons', 'grappleRange', 'grappleStartupFrames', 'grappleTechFrames', 'grappleDamage', 'grappleSpeed', 'grappleHitstunFrames', 'projectileHitstunFrames', 'grappleRecoveryFrames', 'grappleWhiffFrames', 'grappleVerticalSpeedScale'].includes(key))) throw new Error('Unknown interaction field.');
  if (!Array.isArray(raw.weapons) || raw.weapons.length > 64) throw new Error('Interactions require up to 64 weapons.');
  const ids = new Set<string>();
  const weapons = raw.weapons.map((item): CombatInteractions['weapons'][number] => {
    if (!item || typeof item !== 'object' || typeof item.entityId !== 'string' || !item.entityId || ids.has(item.entityId)
      || !['wood', 'metal'].includes(item.material) || !Number.isFinite(item.durability) || item.durability <= 0 || item.durability > 10000
      || !Number.isFinite(item.length) || item.length <= 0 || item.length > 10
      || typeof item.lightMoveId !== 'string' || typeof item.heavyMoveId !== 'string') throw new Error('Invalid weapon declaration.');
    ids.add(item.entityId);
    const weapon: CombatInteractions['weapons'][number] = { entityId: item.entityId, material: item.material, durability: item.durability, length: item.length, lightMoveId: item.lightMoveId, heavyMoveId: item.heavyMoveId };
    if (item.restPose !== undefined) {
      if (item.restPose !== 'upright' && item.restPose !== 'flat') throw Error('Invalid weapon resting pose.');
      weapon.restPose = item.restPose;
    }
    if (item.acousticProfile !== undefined) {
      if (!['wood', 'metal', 'glass', 'ceramic', 'soft', 'liquid', 'scatter'].includes(item.acousticProfile)) throw Error('Invalid weapon acoustic profile.');
      weapon.acousticProfile = item.acousticProfile;
    }
    if (item.name !== undefined) {
      if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80) throw Error('Invalid weapon name.');
      weapon.name = item.name;
    }
    if (item.kit !== undefined) {
      if (!['combat', 'simple', 'single-use', 'spray', 'ground'].includes(item.kit)) throw Error('Invalid weapon kit.');
      weapon.kit = item.kit;
    }
    if (item.ammo !== undefined) {
      if (item.kit !== 'spray' || !Number.isInteger(item.ammo) || item.ammo <= 0 || item.ammo > 120) throw Error('Invalid weapon ammo.');
      weapon.ammo = item.ammo;
    }
    if (item.effect !== undefined) {
      const effect = object(item.effect);
      if (!['spray', 'ground'].includes(item.kit) || Object.keys(effect).some(key => !['durationFrames', 'movementScale', 'radius', 'range', 'arcDegrees'].includes(key))
        || typeof effect.durationFrames !== 'number' || !Number.isInteger(effect.durationFrames) || effect.durationFrames <= 0 || effect.durationFrames > 3600
        || typeof effect.movementScale !== 'number' || !Number.isFinite(effect.movementScale) || effect.movementScale <= 0 || effect.movementScale > 1) throw Error('Invalid weapon effect.');
      weapon.effect = { durationFrames: effect.durationFrames, movementScale: effect.movementScale };
      for (const key of ['radius', 'range', 'arcDegrees'] as const) if (effect[key] !== undefined) {
        const number = effect[key];
        if (typeof number !== 'number' || !Number.isFinite(number) || number <= 0 || number > (key === 'arcDegrees' ? 180 : 10)) throw Error('Invalid weapon effect range.');
        weapon.effect[key] = number;
      }
    }
    if (weapon.kit === 'spray' && (!weapon.ammo || !weapon.effect) || weapon.kit === 'ground' && !weapon.effect) throw Error('Utility weapons require ammo/effect tuning.');
    return weapon;
  });
  const result: CombatInteractions = { weapons };
  for (const key of ['grappleRange', 'grappleStartupFrames', 'grappleTechFrames', 'grappleDamage', 'grappleSpeed', 'grappleHitstunFrames', 'projectileHitstunFrames', 'grappleRecoveryFrames', 'grappleWhiffFrames', 'grappleVerticalSpeedScale'] as const) {
    const number = raw[key];
    if (number !== undefined) {
      if (typeof number !== 'number' || !Number.isFinite(number) || number < (key === 'grappleStartupFrames' ? 0 : Number.MIN_VALUE) || number > 120 || key.endsWith('Frames') && !Number.isInteger(number)) throw new Error(`Invalid ${key}.`);
      result[key] = number;
    }
  }
  return result;
}
