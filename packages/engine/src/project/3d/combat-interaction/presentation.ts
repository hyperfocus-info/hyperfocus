import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { createFrameRecordSelection } from '../../../frame/record-selection.ts';
import type { CombatSnapshot } from '../../../combat/state.ts';
import { atan2, cos, hypot, sin } from '../../../math/simulation.ts';
import { poseCombatLimb } from '../combat-visuals/effects.ts';
import type { createCombatInteractions } from './session.ts';
import { presentGrappleFeedback } from './grapple-feedback.ts';
import { presentGrapplePose } from './grapple-pose.ts';
import type { CombatConfig } from '../../../combat/config.ts';
import type { CombatInteractions } from './config.ts';
import { attachWeaponToPosedHand, heldWeaponPose, presentWeaponWear } from './weapon-pose.ts';

/** Fighter poses, grapple cues, weapons and their wear pieces do not depend on scenery. */
export function createCombatInteractionPresenter(options: { entities: readonly { id: string }[]; fighterIds: readonly string[]; definition: CombatInteractions }) {
  const roots = [...options.fighterIds, ...options.definition.weapons.map(weapon => weapon.entityId)];
  const select = createFrameRecordSelection({ ids: options.entities.filter(entity => roots.some(id => entity.id === id || entity.id.startsWith(`${id}:`))).map(entity => entity.id) });
  return (frame: Hyperfocus3DEvaluatedFrame, state: Parameters<typeof presentCombatInteractions>[1], combat: CombatSnapshot, config: CombatConfig, preserveFighterPose = false) => {
    presentCombatInteractions({ ...frame, entities: select(frame.entities) }, state, combat, config, options.definition, preserveFighterPose);
  };
}

export function presentCombatInteractions(frame: Hyperfocus3DEvaluatedFrame, state: ReturnType<ReturnType<typeof createCombatInteractions>['capture']>, combat: CombatSnapshot, config?: CombatConfig, definition?: CombatInteractions, preserveFighterPose = false) {
  if (!preserveFighterPose) { presentGrappleFeedback(frame, state);presentGrapplePose(frame, state, combat.frame, combat, definition); }
  const entities = new Map(frame.entities.map(entity => [entity.id, entity]));
  for (const item of state.weapons) {
    const entity = entities.get(item.id);
    if (!entity) continue;
    entity.visible = item.active !== false && (item.durability > 0 || !!item.owner && item.spentSerial !== undefined);
    const owner = combat.fighters.find(fighter => fighter.id === item.owner);
    const heading = owner?.facing ?? item.velocity;
    const length = hypot(heading.x, heading.z) || 1;
    const dx = heading.x / length || (heading.z ? 0 : 1), dz = heading.z / length;
    // Resting objects are centered on their actual pickup position; extending
    // from that point previously put visible ends outside the pickup radius.
    const offset = !owner && !item.projectileOwner ? item.length / 2 : 0;
    const start: [number, number, number] = [item.position.x - dx * offset, item.position.y, item.position.z - dz * offset];
    const weapon = definition?.weapons.find(weapon => weapon.entityId === item.id);
    const end: [number, number, number] = [start[0] + dx * item.length, start[1], start[2] + dz * item.length];
    let [grip, tip] = owner ? preserveFighterPose ? attachWeaponToPosedHand(frame, item, owner) : heldWeaponPose(frame, item, owner, config, weapon) : [start, end];
    // Opted-in loose item positions denote their support plane, like resolved
    // drop contacts. Raise artwork by its oriented extent; never alter saved
    // positions, pickup reach, projectiles or the gripping hand.
    if (!owner && !item.projectileOwner && weapon?.restPose) {
      if (weapon.restPose === 'upright') {
        grip = [item.position.x, item.position.y, item.position.z];
        tip = [item.position.x, item.position.y + item.length, item.position.z];
      } else {
        // Local XY is the broad face of trays/blades; local Z is thickness.
        // Keep the existing pickup shaft heading while laying its broad face
        // down, instead of balancing every plate and knife on its narrow edge.
        const centerY = item.position.y + entity.scale[2];
        grip = [start[0], centerY, start[2]];
        tip = [start[0] + dx * item.length, centerY, start[2] + dz * item.length];
      }
    }
    if (entity.visible) {
      const width = entity.scale[0], depth = entity.scale[2];
      poseCombatLimb(entity, grip, tip, .22);
      if (!owner && !item.projectileOwner && weapon?.restPose === 'flat') {
        const yaw = atan2(-dx, -dz) / 2, c = cos(yaw) * .7071067811865476, s = sin(yaw) * .7071067811865476;
        // Local +Z faces upward and local +Y follows the same pickup segment.
        entity.rotation = [-c, s, s, c];
      }
      if (weapon?.name || weapon?.restPose) { entity.scale[0] = width;entity.scale[1] = item.length / 2;entity.scale[2] = depth; }
    }
    presentWeaponWear(entities, item, state, combat.frame, grip, tip, weapon);
  }
}
