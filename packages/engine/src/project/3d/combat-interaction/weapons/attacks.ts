import type { CombatConfig, CombatMove } from '../../../../combat/config.ts';
import type { CombatInput } from '../../../../combat/state.ts';
import type { CombatInteractions } from '../config.ts';

type Weapon = Pick<CombatInteractions['weapons'][number], 'lightMoveId' | 'heavyMoveId' | 'length' | 'kit'>;

/** Author concrete, editable tool variants; runtime never invents attack values. */
export function synthesizeWeaponAttacks({ config, weapons }: { config: CombatConfig; weapons: readonly Weapon[] }) {
  const originals = config.moves.filter(move => !move.weaponBaseMoveId || move.id === move.weaponBaseMoveId);
  const combatWeapons = weapons.filter(weapon => !weapon.kit || weapon.kit === 'combat');
  const allBaseIds = new Set(weapons.flatMap(weapon => [weapon.lightMoveId, weapon.heavyMoveId]));
  const baseIds = new Set(combatWeapons.flatMap(weapon => [weapon.lightMoveId, weapon.heavyMoveId]));
  const sources = originals.filter(move => !allBaseIds.has(move.id) && !move.weaponBaseMoveId && (move.command[0] === 'jab' || move.command[0] === 'heavy' || move.pose === 'wheel-kick'));
  const variants: CombatMove[] = [];
  for (const weapon of combatWeapons) for (const attack of ['light', 'heavy'] as const) {
    const baseId = attack === 'light' ? weapon.lightMoveId : weapon.heavyMoveId;
    if (variants.some(move => move.weaponBaseMoveId === baseId)) continue;
    const base = originals.find(move => move.id === baseId), reference = originals.find(move => move.id === (attack === 'light' ? 'jab' : 'heavy'));
    if (!base || !reference) throw Error('Weapon variants require authored light/heavy templates.');
    const candidates = sources.filter(move => (move.command[0] === 'jab' ? 'light' : 'heavy') === attack);
    for (const source of candidates) {
      const primary = source.id === reference.id;
      const pose = source.pose === 'dive' ? 'jolt' : source.pose === 'wheel-kick' ? 'hook' : source.pose === 'rising-knee' ? 'uppercut'
        : source.pose ?? (attack === 'heavy' ? source.direction === 'neutral' ? 'uppercut' : 'hook' : source.direction === 'away' ? 'retreat-jab' : 'jolt');
      const cost = primary ? base.staminaCost ?? 0 : (source.staminaCost ?? 0) + Math.max(0, (base.staminaCost ?? 0) - (reference.staminaCost ?? 0));
      variants.push({ ...structuredClone(source), id: primary ? baseId : `${baseId}:${source.id}`,
        command: source.pose === 'wheel-kick' ? [...source.command] : [...base.command],
        direction: source.direction, drive: source.drive, airborne: source.airborne, stringOnly: source.stringOnly,
        pose, weaponAttack: attack, weaponBaseMoveId: baseId, weaponSourceMoveId: source.id,
        damage: primary ? base.damage : source.damage * base.damage / Math.max(1, reference.damage),
        guardDamage: primary ? base.guardDamage : (source.guardDamage ?? source.damage) * (base.guardDamage ?? base.damage) / Math.max(1, reference.guardDamage ?? reference.damage),
        reach: base.reach, staminaCost: cost, contactRefund: Math.min(Math.max(0, cost - 1), source.contactRefund ?? 0), cancels: [],
      });
      const variant = variants.at(-1)!;
      if (weapon.kit === 'combat') {
        if (primary) {
          for (const key of ['startupFrames', 'activeFrames', 'recoveryFrames', 'hitRecoveryFrames', 'hitstunFrames', 'groundedHitstunFrames', 'blockstunFrames', 'impulse', 'verticalImpulse', 'strikeFrames', 'hitRadius', 'hitArcDegrees'] as const) {
            if (base[key] === undefined) Reflect.deleteProperty(variant, key);
            else Reflect.set(variant, key, structuredClone(base[key]));
          }
        } else {
          for (const key of ['startupFrames', 'activeFrames', 'recoveryFrames'] as const) variant[key] = Math.max(key === 'startupFrames' && !!source.chargeFrames ? 2 : key === 'activeFrames' ? 1 : 0, Math.round(source[key] * base[key] / Math.max(1, reference[key])));
          if (source.strikeFrames) variant.strikeFrames = [...new Set(source.strikeFrames.map(frame => Math.min(variant.activeFrames - 1, Math.round(frame * variant.activeFrames / source.activeFrames))))];
        }
      }
    }
  }
  for (const variant of variants) {
    for (const key of Object.keys(variant)) if (Reflect.get(variant, key) === undefined) Reflect.deleteProperty(variant, key);
    if (variant.hitRecoveryFrames !== undefined) variant.hitRecoveryFrames = Math.min(variant.recoveryFrames, variant.hitRecoveryFrames);
    const source = sources.find(move => move.id === variant.weaponSourceMoveId)!;
    const family = weapons.find(weapon => weapon.lightMoveId === variant.weaponBaseMoveId || weapon.heavyMoveId === variant.weaponBaseMoveId)!;
    variant.cancels = source.cancels.map(cancel => {
      const target = variants.find(move => move.weaponSourceMoveId === cancel.moveId && (move.weaponBaseMoveId === family.lightMoveId || move.weaponBaseMoveId === family.heavyMoveId));
      const total = variant.startupFrames + variant.activeFrames + variant.recoveryFrames;
      const originalTotal = source.startupFrames + source.activeFrames + source.recoveryFrames;
      if (cancel.hitOnly && family.kit === 'combat') {
        const fromFrame = variant.startupFrames + variant.activeFrames;
        return { ...cancel, moveId: target?.id ?? cancel.moveId, fromFrame,
          toFrame: fromFrame + Math.max(0, (variant.hitRecoveryFrames ?? variant.recoveryFrames) - 1) };
      }
      return { ...cancel, moveId: target?.id ?? cancel.moveId,
        ...(family.kit === 'combat' ? { fromFrame: Math.min(total, Math.round(cancel.fromFrame * total / originalTotal)), toFrame: Math.min(total, Math.round(cancel.toFrame * total / originalTotal)) } : {}),
      };
    });
  }
  config.moves = [...originals.filter(move => !baseIds.has(move.id)), ...variants];
}

/** AI predicts the same authored variant the shared command matcher will select. */
export function weaponAttackMove(config: CombatConfig, source: CombatMove, held?: Weapon): CombatMove {
  if (!held) return source;
  const baseId = held.kit === 'single-use' || held.kit === 'ground' ? held.lightMoveId : source.command[0] === 'jab' ? held.lightMoveId : source.command[0] === 'heavy' || source.pose === 'wheel-kick' ? held.heavyMoveId : source.weaponBaseMoveId;
  if (!baseId) return source;
  const variant = config.moves.find(move => move.weaponBaseMoveId === baseId && move.weaponSourceMoveId === source.id)
    ?? config.moves.find(move => move.id === baseId) ?? source;
  return { ...variant, reach: held.kit && held.kit !== 'combat' ? variant.reach : held.length };
}

/** Keep held charging keys in the same command namespace as fresh tool presses. */
export function rewriteWeaponInputs(config: CombatConfig, input: CombatInput, weapon: Weapon, ammo?: number, spent = false) {
  const simple = !!weapon.kit && weapon.kit !== 'combat';
  const rewrite = (key: string) => {
    if (key !== 'jab' && key !== 'heavy') return simple && key === 'drive' ? [] : [key];
    if (spent) return [];
    const one = weapon.kit === 'single-use' || weapon.kit === 'ground' || weapon.kit === 'spray' && ammo === 0;
    return config.moves.find(move => move.id === (one || key === 'jab' ? weapon.lightMoveId : weapon.heavyMoveId))!.command;
  };
  if (simple) input.drive = false;
  input.pressed = input.pressed?.flatMap(rewrite);
  input.held = input.held?.flatMap(rewrite);
}
