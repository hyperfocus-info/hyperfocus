import type { CombatConfig } from '@hyperfocus/engine/combat';
import type { UniversalLocomotionBank } from '../universal-locomotion.ts';
import { traversalActions, reactionActions, interactionActions, weaponFamily } from './catalogue.ts';
import { sampleTraversal } from './traversal.ts';
import { sampleReaction, sampleInteraction } from './reactions.ts';
import { sampleAttack } from './attacks.ts';
import { sampleWeapon, type ArtWeapon } from './weapons.ts';
import { cityWeapon } from '../../city/weapons/catalogue.ts';
import { weaponGrip } from './weapons.ts';
import { solveArtArm } from '../motion.ts';

export function sampleAction(options: { bank: UniversalLocomotionBank; config: CombatConfig; id: string; frame: number; duration?: number; weapon?: ArtWeapon; hitConfirmed?: boolean }) {
  const { bank, config, id, frame, duration = 60, weapon } = options;
  const traversal = traversalActions.find(value => value === id);
  if (traversal) { const pose = sampleTraversal(bank, traversal, frame, duration); return weapon ? sampleWeapon(undefined, weapon, frame, pose) : pose; }
  const reaction = reactionActions.find(value => value === id);
  if (reaction) return sampleReaction(reaction, frame, duration);
  const interaction = interactionActions.find(value => value === id);
  if (interaction) {
    const tool = weapon ?? (interaction.startsWith('weapon-') ? cityWeapon('sword') : undefined);
    if (interaction.startsWith('weapon-') && tool && !['weapon-throw', 'weapon-drop'].includes(id)) {
      const gait = sampleTraversal(bank, id === 'weapon-walk' ? 'walk' : id === 'weapon-run' ? 'run' : 'idle', frame, duration);
      return sampleWeapon(undefined, tool, frame, gait);
    }
    const pose = sampleInteraction(interaction, frame, duration);
    if (tool) {
      weaponGrip(pose, tool, [.15, .8, .5]);
      const release = duration * (id === 'weapon-throw' ? .72 : .45);
      if ((id === 'weapon-throw' || id === 'weapon-drop') && frame >= release) {
        const origin = solveArtArm({ pose: sampleInteraction(interaction, release, duration), side: 'right' }).end, t = (frame - release) / 60;
        pose.weapon!.releasedPosition = [origin[0], Math.max(.11, origin[1] + (id === 'weapon-throw' ? 2 : 0) * t - 4.9 * t * t), origin[2] + (id === 'weapon-throw' ? 4 : .2) * t];
      }
    }
    return pose;
  }
  const found = config.moves.find(move => move.id === id);
  if (!found) throw new Error(`Unmapped Touch of Death animation: ${id}`);
  const move = options.hitConfirmed && found.hitRecoveryFrames !== undefined ? { ...found, recoveryFrames: found.hitRecoveryFrames } : found;
  const family = weaponFamily(move);
  return family ? sampleWeapon(move, weapon ?? family, frame) : sampleAttack(bank, move, frame);
}
