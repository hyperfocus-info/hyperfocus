import { atan2, cos, hypot, sin } from '../../math/simulation.ts';
import { presentCombatActionTrails3D } from './combat-visuals/action-trails.ts';
import { sampleCombatAttackPose } from './combat-visuals/attack-pose.ts';
import { poseCombatLimb, presentCombatEffects3D } from './combat-visuals/effects.ts';
import { presentCombatLocomotion3D, type CombatLocomotionEvent } from './combat-visuals/locomotion-effects.ts';
import type { CombatConfig, CombatVector } from '../../combat/config.ts';
import type { CombatEvent, CombatSnapshot } from '../../combat/state.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../frame/3d.ts';
import type { FrameRecordLookup } from '../../frame/record-lookup.ts';
import { presentGuardFractures3D, readableGuardYaw } from './combat-visuals/guard-fractures.ts';
import { presentCombatTimingRings, type CombatTimingFeedback } from './combat-visuals/timing-rings.ts';
import { presentCombatTravelLean } from './combat-visuals/travel-pose.ts';

type Entity = Hyperfocus3DEvaluatedFrame['entities'][number];

/** Optional primitive-actor presentation. Only explicitly authored accessory siblings opt a fighter in. */
export function presentCombatVisuals3D(options: { frame: Hyperfocus3DEvaluatedFrame; state: CombatSnapshot; config: CombatConfig; motion?: readonly { id: string; locked: boolean; dash?: number; wallRunning?: boolean; wallSliding?: boolean }[]; velocities?: ReadonlyMap<string, CombatVector>; events?: readonly CombatEvent[]; reducedMotion?: boolean; viewportAspect?: number; grounded?: ReadonlySet<string>; locomotionEvents?: readonly CombatLocomotionEvent[]; timingFeedback?: readonly CombatTimingFeedback[]; entityLookup?: FrameRecordLookup }) {
  const { frame, state, config } = options;
  presentCombatEffects3D(options);

  presentCombatLocomotion3D(options);
  for (const fighter of state.fighters) {
    const root = options.entityLookup ? options.entityLookup.get(frame.entities, fighter.id) : frame.entities.find(entity => entity.id === fighter.id);
    const left = options.entityLookup ? options.entityLookup.get(frame.entities, `${fighter.id}:left-hand`) : frame.entities.find(entity => entity.id === `${fighter.id}:left-hand`);
    const right = options.entityLookup ? options.entityLookup.get(frame.entities, `${fighter.id}:right-hand`) : frame.entities.find(entity => entity.id === `${fighter.id}:right-hand`);
    if (!root || !left || !right) continue;
    const motion = options.motion?.find(item => item.id === fighter.id);
    const velocity = options.velocities?.get(fighter.id);
    const freeTravel = motion?.locked === false && !fighter.moveId && !fighter.stunFrames && !fighter.guarding && !fighter.protectionFrames && velocity && hypot(velocity.x, velocity.z) > .5;
    const yaw = freeTravel ? atan2(velocity.x, velocity.z) : atan2(fighter.facing.x, fighter.facing.z);
    const move = config.moves.find(item => item.id === fighter.moveId);
    const attackYaw = yaw - (move?.impulseAngle ?? 0) * (move?.direction === 'side' ? fighter.attackSide : 1);
    const windup = move && fighter.moveFrame < move.startupFrames ? fighter.moveFrame / Math.max(1, move.startupFrames) : 0;
    const heavy = !!move && (move.startupFrames >= 12 || (move.verticalImpulse ?? 0) > 0);
    const attackPose = move ? sampleCombatAttackPose(fighter, move) : undefined;
    const coil = (attackPose?.coil ?? 0) * (heavy ? 1 : .3);
    const speed = velocity ? hypot(velocity.x, velocity.z) : 0;
    const running = Math.min(1, speed / 7);
    const airborne = options.grounded ? !options.grounded.has(fighter.id) : root.position[1] > 1.15 || Math.abs(velocity?.y ?? 0) > 1;
    const stride = sin(state.frame * .45) * running * (airborne || move || fighter.stunFrames ? 0 : 1);
    const recoil = fighter.stunFrames > 0 ? Math.min(1, fighter.stunFrames / 12) : 0;
    const guard = fighter.health > 0 && fighter.guarding && !fighter.guardBrokenFrames && !move && (fighter.stunKind === '' || fighter.stunKind === 'block');
    const tech = fighter.protectionFrames > 0;
    const landing = !move && !guard && !tech && !fighter.stunFrames ? Math.min(1, fighter.landingFrames / 5) : 0;
    const tired = Math.max(0, Math.min(1, (0.45 - fighter.stamina / Math.max(1, config.maxStamina ?? 100)) / 0.45));
    const exhaustion = !move && !guard && !tech && !fighter.stunFrames && fighter.health > 0 && !airborne && !motion?.wallRunning && !motion?.wallSliding ? tired * tired * (3 - 2 * tired) : 0;
    // The evaluated frame already contains the latest physics position; combat
    // snapshots describe the preceding fixed tick and must not move it backward.
    const influence = fighter.stunKind === 'hit' && velocity ? (velocity.x * cos(yaw) - velocity.z * sin(yaw)) / Math.max(1, speed) : 0;
    const bodyPitch = tech ? -.45 : landing * .32 + recoil * (fighter.stunKind === 'block' ? -.13 : fighter.stunKind === 'parry' ? -.28 : -.65) + (attackPose?.pitch ?? 0) + (move ? running * .12 : 0) + exhaustion * (.38 + (options.reducedMotion ? 0 : sin(state.frame * .10) * .025));
    root.rotation = poseRotation(yaw + (attackPose?.yaw ?? 0), bodyPitch, influence * -.25 + (attackPose?.roll ?? 0));
    root.scale = [1, 1 - coil * .13 - landing * .1, 1];
    const leftPoint = attackPose?.kick ? [-.4, .36, .22] : attackPose ? attackPose.hand < 0 ? attackPose.fist : attackPose.support : [guard ? -.22 : -.46, guard ? .55 : .2 - exhaustion * .38, guard ? .52 : .28 + exhaustion * .1 - stride * .22];
    const rightPoint = attackPose?.kick ? [.4, .36, .22] : attackPose ? attackPose.hand > 0 ? attackPose.fist : attackPose.support : [guard ? .22 : .46, guard ? .55 : .2 - exhaustion * .38, guard ? .52 : .28 + exhaustion * .1 + stride * .22];
    attach(left, root, yaw, leftPoint[0]!, leftPoint[1]!, leftPoint[2]!, .145, .145, .145);
    attach(right, root, yaw, rightPoint[0]!, rightPoint[1]!, rightPoint[2]!, .145, .145, .145);
    const joint = (x: number, y: number, z: number): Entity['position'] => [root.position[0] + x * cos(yaw) + z * sin(yaw), root.position[1] + y, root.position[2] - x * sin(yaw) + z * cos(yaw)];
    for (const side of [-1, 1]) {
      const name = side < 0 ? 'left' : 'right';
      const footSwing = stride * side;
      const lift = (airborne ? .15 + side * .08 : Math.max(0, footSwing) * .22) + (move?.pose === 'back-hop' ? (attackPose?.force ?? 0) * .25 : move?.pose === 'gazelle' && side === 1 ? (attackPose?.force ?? 0) * .16 : 0);
      const boot = options.entityLookup ? options.entityLookup.get(frame.entities, `${fighter.id}:${name}-boot`) : frame.entities.find(entity => entity.id === `${fighter.id}:${name}-boot`);
      const thigh = options.entityLookup ? options.entityLookup.get(frame.entities, `${fighter.id}:${name}-thigh`) : frame.entities.find(entity => entity.id === `${fighter.id}:${name}-thigh`);
      const shin = options.entityLookup ? options.entityLookup.get(frame.entities, `${fighter.id}:${name}-shin`) : frame.entities.find(entity => entity.id === `${fighter.id}:${name}-shin`);
      const arm = options.entityLookup ? options.entityLookup.get(frame.entities, `${fighter.id}:${name}-arm`) : frame.entities.find(entity => entity.id === `${fighter.id}:${name}-arm`);
      const kick = attackPose?.kick && side === 1 ? attackPose.force : 0;
      const chamber = attackPose?.kick && side === 1 ? coil : 0;
      let ankle = joint(side * (.18 + coil * .16) * (1 - kick), -.79 + lift + kick * .79 + chamber * .5, .06 + side * coil * .22 + footSwing * .32 - (airborne ? side * .15 : 0) + kick * ((move?.reach ?? 1.5) - .06));
      if (kick && attackPose) ankle = joint(attackPose.fist[0], -.79 * (1 - kick) + attackPose.fist[1] * kick, .06 * (1 - kick) + attackPose.fist[2] * kick);
      let knee = joint(side * (.19 + coil * .12), -.54 + lift * .5 - landing * .12 + kick * .45 + chamber * .6, .08 + landing * .18 + coil * .16 + Math.abs(footSwing) * .13 + (airborne ? .14 : 0) + kick * .65);
      if (move?.pose === 'rising-knee' && side === 1 && attackPose) {
        knee = joint(attackPose.fist[0], -.54 * (1 - kick) + attackPose.fist[1] * kick, .08 * (1 - kick) + attackPose.fist[2] * kick);
        ankle = joint(attackPose.fist[0], -.79 * (1 - kick) + (attackPose.fist[1] - .4) * kick, .06 * (1 - kick) + (attackPose.fist[2] - .45) * kick);
      }
      if (boot) attach(boot, root, yaw, side * (.18 + coil * .16), -.82 + lift, .06 + side * coil * .22 + footSwing * .32 - (airborne ? side * .15 : 0), .14, .16, .24);
      if (boot && attackPose?.kick && side === 1) boot.position = [...ankle];
      if (thigh) poseCombatLimb(thigh, joint(side * .16, -.26 - coil * .07, 0), knee, .22);
      if (shin) poseCombatLimb(shin, knee, ankle, .18);
      if (arm) {
        const shoulder = joint(side * .32, .38 * cos(bodyPitch), .38 * sin(bodyPitch));
        const hand = (side < 0 ? left : right).position;
        const forearm = options.entityLookup ? options.entityLookup.get(frame.entities, `${fighter.id}:${name}-forearm`) : frame.entities.find(entity => entity.id === `${fighter.id}:${name}-forearm`);
        if (forearm) {
          const bend = move?.direction === 'side' ? .35 : .18;
          const elbow: Entity['position'] = [(shoulder[0] + hand[0]) / 2 + side * cos(yaw) * bend,
            (shoulder[1] + hand[1]) / 2 - .22, (shoulder[2] + hand[2]) / 2 - side * sin(yaw) * bend];
          poseCombatLimb(arm, shoulder, elbow, .2);
          poseCombatLimb(forearm, elbow, hand, .18);
        } else poseCombatLimb(arm, shoulder, hand, .2);
      }
    }
    for (const entity of frame.entities) {
      if (entity.id === `${fighter.id}:shadow`) {
        entity.position = [root.position[0], options.grounded?.has(fighter.id) ? root.position[1] - .992 : -.012, root.position[2]];
        const radius = Math.max(.22, .48 - Math.max(0, root.position[1] - .98) * .035);
        entity.scale = [radius, .004, radius * .75];
        entity.rotation = [0, 0, 0, 1];
        entity.visible = true;
      }
      if (entity.id === `${fighter.id}:head`) attach(entity, root, yaw, 0, .78 * cos(bodyPitch), .78 * sin(bodyPitch), .24, .27, .225);
      if (entity.id === `${fighter.id}:hair`) {
        attach(entity, root, yaw, 0, cos(bodyPitch), -.02 + sin(bodyPitch), .27, .10, .23);
        entity.rotation = poseRotation(yaw, bodyPitch * .35);
      }
      if (entity.id === `${fighter.id}:face`) attach(entity, root, yaw, 0, .76 * cos(bodyPitch), .22 + .78 * sin(bodyPitch), .17, .035, .025);
      if (entity.id === `${fighter.id}:belt`) attach(entity, root, yaw, 0, -.17, 0, .295, .06, .22);
      if (entity.id === `${fighter.id}:guard-shell`) {
        const strain = 1 - fighter.guardMeter / Math.max(1, config.maxGuard ?? 100);
        const pulse = 1 + strain * .08 * (options.reducedMotion ? 0 : sin(state.frame * .12));
        const visible = guard || tech || fighter.armorFrames > 0;
        const defensive = tech || fighter.armorFrames > 0;
        // Guard faces the threat as a thin shield; protection surrounds the whole body.
            attach(entity, root, yaw, 0, .18, defensive ? .05 : .7, visible ? .84 * pulse : 0, visible ? 1.02 : 0, visible ? defensive ? .7 : .055 : 0);
          if (!defensive) entity.rotation = poseRotation(readableGuardYaw(yaw, frame.camera.position, root.position), 0);
      }
      if (entity.id === `${fighter.id}:impact`) {
        const parry = fighter.followupFrames > 0;
        const flash = parry ? .12 * fighter.followupFrames / Math.max(1, config.parryFollowupFrames ?? 18) : move?.drive && fighter.moveFrame < move.startupFrames ? windup * .05 : 0;
        attach(entity, root, attackYaw, 0, .35, .65, flash, parry ? flash * 1.8 : flash, flash);
      }
      if (entity.id === `${fighter.id}:armor`) {
        entity.visible = false;
      }
      if (entity.id === `${fighter.id}:guard-meter`) {
        entity.visible = false;
      }
    }
  }
  for (const fighter of state.fighters) {
    const motion = options.motion?.find(item => item.id === fighter.id), velocity = options.velocities?.get(fighter.id);
    if (!velocity || fighter.health <= 0 || fighter.moveId || fighter.stunFrames || fighter.guarding || fighter.protectionFrames || fighter.landingFrames || (motion?.dash ?? 0) > 0 || motion?.wallRunning || motion?.wallSliding) continue;
    presentCombatTravelLean(frame, fighter.id, velocity, !!options.reducedMotion);
  }
  presentCombatActionTrails3D(options);
  presentGuardFractures3D(options);
  presentCombatTimingRings(options);
}

function attach(entity: Entity, root: Entity, yaw: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const c = cos(yaw), s = sin(yaw);
  entity.position = [root.position[0] + x * c + z * s, root.position[1] + y, root.position[2] - x * s + z * c];
  entity.rotation = poseRotation(yaw, 0);
  entity.scale = [sx, sy, sz];
  entity.visible = sx > 0 && sy > 0 && sz > 0;
}

function poseRotation(yaw: number, pitch: number, roll = 0): Entity['rotation'] {
  const sy = sin(yaw / 2), cy = cos(yaw / 2), sx = sin(pitch / 2), cx = cos(pitch / 2);
  const sz = sin(roll / 2), cz = cos(roll / 2);
  return [cy * sx * cz + sy * cx * sz, sy * cx * cz - cy * sx * sz, cy * cx * sz - sy * sx * cz, cy * cx * cz + sy * sx * sz];
}
