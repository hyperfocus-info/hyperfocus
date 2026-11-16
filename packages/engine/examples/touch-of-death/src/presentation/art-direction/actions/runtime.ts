import type { CombatConfig } from '@hyperfocus/engine/combat';
import type { createGameplay3D } from '@hyperfocus/engine/project/runtime-3d';
import type { UniversalLocomotionBank } from '../universal-locomotion.ts';
import type { ArtMotion } from '../motion.ts';
import { CITY_WEAPONS, cityWeapon } from '../../city/weapons/catalogue.ts';
import { sampleAction } from './sample.ts';
import { sampleWeapon, type ArtWeapon } from './weapons.ts';
import { createFlexibleHandContinuity } from './weapon-motion/hand-continuity.ts';

type Snapshot = ReturnType<ReturnType<typeof createGameplay3D>['snapshot']>;
/** Native state is the authority. Review overrides are handled outside this controller. */
export function createActionController() {
  let previous = '', start = 0, lastTick = -1, last: { id: string; pose: ArtMotion; weaponKey?: string; weapon?: ArtWeapon } | undefined;
  let stateDuration = 60, health = 100, hitSerial = 0;
  const hands = createFlexibleHandContinuity();
  return {
    sample(options: { snapshot: Snapshot; id: string; bank: UniversalLocomotionBank; config: CombatConfig; gait: ArtMotion; moving: boolean; yaw: number; velocityY: number; wallSide?: number; grounded?: boolean; weapon?: ArtWeapon }) {
      const { snapshot, bank, config, gait, moving, yaw, velocityY } = options, combat = snapshot.combat!, tick = combat.state.frame;
      if (lastTick === tick && last) return last;
      const fighter = combat.state.fighters.find(f => f.id === options.id)!, motion = combat.motion?.find(m => m.id === options.id);
      const interactions = combat.interactions, held = interactions?.weapons.find(w => w.owner === fighter.id);
      const weaponKey = CITY_WEAPONS.find(([key]) => held?.id.endsWith(`:${key}`))?.[0], weapon = options.weapon ?? (weaponKey ? cityWeapon(weaponKey) : undefined);
      const grapple = interactions?.grapples.find(g => g.attacker === fighter.id || g.target === fighter.id);
      const attempt = interactions?.attempts?.find(a => a.attacker === fighter.id);
      const trace = interactions?.trace.slice().reverse().find(event => event.actor === fighter.id && tick - event.frame < 20 && ['weapon-picked-up', 'weapon-thrown', 'grapple-throw', 'grapple-tech'].includes(event.kind));
      const airborne = options.grounded === undefined ? fighter.position.y > .70 : !options.grounded;
      if (fighter.health < health) hitSerial++;
      health = fighter.health;
      const feedback = combat.defenseFeedback?.find(row => row.id === fighter.id);
      const attacker = combat.state.fighters.find(f => f.id !== fighter.id);
      const attack = config.moves.find(move => move.id === attacker?.moveId);
      let id = moving ? 'run' : 'idle', duration = 60;
      if (combat.match?.phase === 'match-result' && fighter.health > 0) id = 'victory';
      else if (combat.match?.phase === 'round-result' && fighter.health <= 0 && combat.match.ticks > 60) { id = 'get-up'; duration = 90; }
      else if (fighter.health <= 0) { id = 'knockout'; duration = 90; }
      else if (grapple) id = grapple.attacker === fighter.id ? 'grapple-hold' : 'grapple-held';
      else if (attempt) { id = 'grapple-reach'; duration = 20; }
      else if (trace?.kind === 'grapple-throw') { id = 'grapple-throw'; duration = 20; }
      else if (trace?.kind === 'grapple-tech') { id = 'grapple-tech'; duration = 20; }
      else if (fighter.guardBrokenFrames > 0) { id = 'guard-break'; duration = fighter.guardBrokenFrames; }
      else if (feedback?.cue?.action === 'tech' && feedback.cue.result === 'perfect' && tick - feedback.cue.frame < 18) { id = 'surface-tech'; duration = 18; }
      else if (feedback && tick - feedback.bounceAt < 12 && fighter.stunKind === 'hit') { id = (feedback.bounceNormal?.y ?? 0) > .5 ? 'floor-impact' : 'wall-impact'; duration = 24; }
      else if (fighter.stunFrames > 0) { id = fighter.stunKind === 'block' ? 'block' : fighter.stunKind === 'parry' ? 'parried' : airborne ? 'air-hit' : (attack?.damage ?? 10) < 12 ? 'hit-light' : 'hit-heavy'; duration = Math.max(12, fighter.stunFrames); }
      else if (fighter.moveId) id = fighter.moveId;
      else if (trace?.kind === 'weapon-picked-up') { id = 'pickup'; duration = 20; }
      else if (trace?.kind === 'weapon-thrown') { id = 'weapon-throw'; duration = 20; }
      else if (fighter.guarding) id = moving ? 'guard-walk' : tick - fighter.guardStarted < 5 ? 'parry' : 'guard';
      else if (motion?.wallRunning) id = (options.wallSide ?? -1) < 0 ? 'wall-run-left' : 'wall-run-right';
      else if (motion?.wallSliding) id = 'wall-slide';
      else if (motion?.dash) {
        const forward = motion.dx * Math.sin(yaw) + motion.dz * Math.cos(yaw), lateral = motion.dx * Math.cos(yaw) - motion.dz * Math.sin(yaw);
        id = motion.dashAirborne ? 'air-dash' : Math.abs(lateral) > Math.abs(forward) ? lateral < 0 ? 'dash-left' : 'dash-right' : forward < 0 ? 'dash-back' : 'dash-forward'; duration = motion.dashDuration;
      } else if (motion?.dashCueKind === 5 && motion.dashCue > 0) id = 'wall-jump';
      else if (airborne) id = motion?.airJumpUsed && velocityY > 0 ? 'double-jump' : velocityY > .2 ? 'jump-rise' : 'jump-fall';
      else if (fighter.landingFrames > 0) { id = 'land-soft'; duration = 12; }
      else if (motion?.recovery) { id = 'dash-brake'; duration = 12; }
      else if (motion?.sprintExhausted) id = 'exhausted';
      const key = fighter.moveId === id ? `${id}:${fighter.attackSerial}` : `${id}:${hitSerial}`;
      if (key !== previous) { start = tick; previous = key; stateDuration = duration; }
      let pose: ArtMotion;
      if (id === 'run' || id === 'idle') pose = weapon ? sampleWeapon(undefined, weapon, tick, gait) : gait;
      else {
        const frame = fighter.moveId === id ? fighter.moveFrame : id.startsWith('dash-') && motion?.dash ? motion.dashAge : tick - start + (id === 'weapon-throw' ? stateDuration * .72 : 0);
        pose = sampleAction({ bank, config, id, frame, duration: stateDuration, weapon, hitConfirmed: fighter.hitConfirmed });
        if (id === 'guard-walk') { pose.hip = gait.hip; pose.leftFoot = gait.leftFoot; pose.rightFoot = gait.rightFoot; pose.feet = gait.feet; }
      }
      if (weapon?.family === 'flexible') pose = hands.sample(key, pose); else hands.reset();
      lastTick = tick; last = { id, pose, weaponKey, weapon }; return last;
    },
  };
}
