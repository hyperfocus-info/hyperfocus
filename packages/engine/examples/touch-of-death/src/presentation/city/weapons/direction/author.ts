import { synthesizeWeaponAttacks, type CombatProject3D } from '@hyperfocus/engine/project/runtime-3d';
import { compileWeaponDirection, directedMoveFamily } from './grammar.ts';
import { weaponIntent } from './intent.ts';
import { attackVelocityScale } from '../../../../combat/balance.ts';

/** Host-owned balance differences; source move identity keeps its input and tactical job. */
export function authorDirectedWeaponAttacks(combat: CombatProject3D) {
  const { config } = combat;
  synthesizeWeaponAttacks({ config, weapons: combat.interactions!.weapons });
  for (const move of config.moves) {
    const family = directedMoveFamily(move);
    if (!family) continue;
    const intent = weaponIntent(move), heavy = move.weaponAttack === 'heavy' || move.id === 'weapon-heavy-heavy';
    const previousTotal = move.startupFrames + move.activeFrames + move.recoveryFrames;
    const previousStartup = move.startupFrames, previousActive = move.activeFrames;
    if (intent !== 'evade') {
      // Family templates supply cadence; intent keeps readable windups near the unarmed job.
      if (move.weaponSourceMoveId && move.id !== move.weaponBaseMoveId) {
        const source = config.moves.find(source => source.id === move.weaponSourceMoveId)!;
        const offset = family === 'piercing' ? -3 : family === 'blade' ? 0 : family === 'flexible' ? 1 : family === 'blunt' ? heavy ? 5 : 2 : 5;
        move.startupFrames = Math.max(6, source.startupFrames + offset);
        move.recoveryFrames = Math.max(source.recoveryFrames, family === 'blunt' && heavy ? 45 : family === 'long' ? 28 : 18);
      }
      const arc = intent === 'lunge' || family === 'piercing' ? 28 : intent === 'sweep' ? family === 'long' ? 110 : 90 : family === 'blunt' ? 60 : 55;
      // Short tools retain the existing rounded tip volume. The sector primitive
      // excludes that horizontal radius and made nunchaku/knife contacts unreachable.
      if (family === 'blade' || family === 'long' || family === 'heavy') move.hitArcDegrees = arc;
      else delete move.hitArcDegrees;
      move.hitRadius = family === 'long' ? .26 : intent === 'sweep' ? .40 : .3;
      if (intent === 'anti-air' || intent === 'rising-entry') { move.verticalImpulse = (heavy ? 10 : 4) * attackVelocityScale(move.damage); move.hitHeight = 1.55; }
      if (intent === 'body') { move.hitHeight = .85; move.verticalImpulse = 0; }
      if (intent === 'overhead') { move.hitHeight = 1.1; move.verticalImpulse = 0; }
      move.staminaCost = Math.max(move.staminaCost ?? 0, family === 'heavy' ? heavy ? 30 : 14 : family === 'blunt' && heavy ? 24 : heavy ? 18 : 8);
      move.contactRefund = Math.min(move.contactRefund ?? 0, move.staminaCost - 1);
      move.hitRecoveryFrames = Math.min(move.recoveryFrames, family === 'heavy' ? heavy ? 30 : 18 : family === 'blunt' && heavy ? 24 : heavy ? 18 : 10);
      // Short per-hit intervals get their own recoil; pressure does not teleport grips.
      if (family === 'flexible' && !heavy && !move.strikeFrames) { move.activeFrames = 13; move.strikeFrames = [0, 6, 12]; move.damage /= 3; }
    }
    const total = move.startupFrames + move.activeFrames + move.recoveryFrames;
    move.cancels = move.cancels.map(cancel => cancel.hitOnly ? { ...cancel, fromFrame: move.startupFrames + move.activeFrames, toFrame: Math.min(total - 1, move.startupFrames + move.activeFrames + (move.hitRecoveryFrames ?? move.recoveryFrames) - 1) }
      : { ...cancel, fromFrame: Math.min(total - 1, Math.round(cancel.fromFrame * total / previousTotal)), toFrame: Math.min(total - 1, Math.round(cancel.toFrame * total / previousTotal)) });
    if (move.armorFrames) move.armorFrames = Math.min(move.startupFrames + move.activeFrames, Math.round(move.armorFrames * (move.startupFrames + move.activeFrames) / (previousStartup + previousActive)));
  }
  return compileWeaponDirection(config);
}
