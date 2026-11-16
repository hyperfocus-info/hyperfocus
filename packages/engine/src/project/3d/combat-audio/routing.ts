import { hypot } from '../../../math/simulation.ts';
import type { CombatEvent, CombatSnapshot } from '../../../combat/state.ts';
import type { CombatProject3D } from '../combat-declaration.ts';
import type { CombatAudioEmitter } from './emitter.ts';
import { surfaceBreakCue, weaponAcousticCue, weaponDeployCue } from './acoustics.ts';
import type { CombatVector } from '../../../combat/config.ts';

export function combatImpactHeavy(definition: CombatProject3D, event: CombatEvent) {
  const move = definition.config.moves.find(move => move.id === event.moveId);
  return (move?.damage ?? 0) >= 18 || hypot(event.impulse.x, event.impulse.y, event.impulse.z) >= 8;
}

export function routeCombatInteractions(definition: CombatProject3D, emitter: CombatAudioEmitter, before: CombatSnapshot, after: CombatSnapshot, transitions: readonly { kind: string; actor: string; target?: string; position?: CombatVector }[]) {
  for (const transition of transitions) {
    const weapon = definition.interactions?.weapons.find(item => item.entityId === transition.target);
    const breaking = transition.kind === 'weapon-shortened' || transition.kind === 'weapon-broken' || transition.kind === 'weapon-contact' && weapon?.kit === 'single-use';
    const actor = after.fighters.find(fighter => fighter.id === transition.actor), move = definition.config.moves.find(move => move.id === actor?.moveId);
    // Generated weapon attacks retain the authored template identity.
    if (weapon && transition.kind === 'weapon-wear' && actor && [weapon.lightMoveId, weapon.heavyMoveId].includes(move?.weaponBaseMoveId ?? actor.moveId) && actor.attackSerial !== before.fighters.find(fighter => fighter.id === actor.id)?.attackSerial) continue;
    if (weapon && (breaking || transition.kind === 'weapon-wear' || transition.kind === 'weapon-contact')) {
      const material = weapon.material === 'wood' ? breaking ? 'weaponWoodBreak' : 'weaponWood' : breaking ? 'weaponMetalBreak' : 'weaponMetal';
      const acoustic = weaponAcousticCue(weapon, breaking ? 1 : 0);
      if (emitter.has(acoustic) || emitter.has(material)) { emitter.fallback(acoustic, material, transition.actor, breaking ? .8 : .5);continue; }
    }
    if (transition.kind === 'environment-warning' || transition.kind === 'environment-removed') {
      const surface = definition.environment?.surfaces.find(surface => surface.entityId === transition.actor), moving = surface?.stopMotionIds;
      const vehicle = definition.environment?.traffic?.some(vehicle => vehicle.entityId === transition.actor);
      const legacyBreak = emitter.has('environmentBreak') ? 'environmentBreak' : 'guardBreak';
      if (moving && transition.kind === 'environment-removed') emitter.worldFallback(vehicle ? 'trafficCrash' : 'motorShutdown', legacyBreak, transition.actor);
      else if (transition.kind === 'environment-removed') emitter.worldFallback(surfaceBreakCue(surface), legacyBreak, transition.actor);
      else emitter.worldFallback(transition.kind === 'environment-warning' ? 'environmentWarning' : 'environmentBreak', transition.kind === 'environment-warning' ? 'countdown' : 'guardBreak', transition.actor);
      if (transition.kind === 'environment-removed' && definition.environment?.hazards?.some(hazard => hazard.kind === 'fire' && hazard.activationSurfaceId === transition.actor)) emitter.worldCue('hazardIgnition', transition.actor, .7);
      continue;
    }
    switch (transition.kind) {
      case 'weapon-picked-up': emitter.fallback('weaponPickup', 'step', transition.actor);break;
      case 'weapon-thrown': emitter.fallback('weaponThrow', 'swing', transition.actor);break;
      case 'weapon-dropped': if (weapon) emitter.worldFallback(weaponAcousticCue(weapon, 2), weapon.material === 'wood' ? 'weaponWoodDrop' : 'weaponMetalDrop', weapon.entityId, 1, transition.position);break;
      case 'weapon-sprayed': emitter.cue('weaponSpray', transition.actor);break;
      case 'weapon-deployed': emitter.fallback(weaponDeployCue(weapon), 'weaponDeploy', transition.actor);break;
      case 'weapon-consumed': emitter.cue('weaponConsume', transition.actor);break;
      case 'grapple-start': emitter.fallback('grabConnect', 'swingHeavy', transition.actor);break;
      case 'grapple-whiff': emitter.fallback('grabMiss', 'swingHeavy', transition.actor);break;
      case 'weapon-shortened': case 'weapon-broken': emitter.cue('guardBreak', transition.actor);break;
      // A contacted edge may be far from a large wall's source centre.
      case 'environment-strike': emitter.cue('block', transition.actor);break;
      case 'weapon-wear': emitter.cue('block', transition.actor);break;
    }
  }
}

export function routeCombatContacts(definition: CombatProject3D, emitter: CombatAudioEmitter, after: CombatSnapshot, events: readonly CombatEvent[]) {
  for (const event of events) {
    if (event.defenseReason === 'out-of-bounds') continue;
    const alive = (after.fighters.find(fighter => fighter.id === event.targetId)?.health ?? 0) > 0;
    if (event.defenseReason === 'fire-exposure') { if (alive) emitter.voice('hurt', event.targetId, after.frame);continue; }
    if (event.defenseReason === 'traffic-impact' && event.environmentId) emitter.worldCue('trafficCrash', event.environmentId);
    if (event.kind === 'hit' && event.armored) { emitter.fallback('armor', 'block', event.targetId, .7);if (event.damage > 0 && alive) emitter.voice('hurt', event.targetId, after.frame);continue; }
    const key = event.kind === 'guard-break' ? 'guardBreak' : event.kind === 'hit' ? combatImpactHeavy(definition, event) ? 'hitHeavy' : 'hit' : event.kind;
    // Legacy events retain their authored impact. Resolved contact metadata cannot
    // borrow leftover stun, chip damage, or a health-clamped finishing hit's damage.
    const severity = event.kind === 'hit' && event.hitstunFrames !== undefined ? Math.max(0, Math.min(1, event.hitstunFrames / 180)) : undefined;
    emitter.cue(key, event.targetId, severity === undefined ? 1 : .72 + severity * .28, severity === undefined ? {} : { playbackRate: 1.04 - severity * .18, impactStrength: severity });
    if (event.kind === 'hit' && event.damage > 0) {
      if (event.counter) emitter.fallback('counter', 'guardBreak', event.targetId, .4);
      emitter.cue('blood', event.targetId, .3);
      if (alive) emitter.voice('hurt', event.targetId, after.frame);
    }
    if (event.kind === 'escape' || event.kind === 'tech') emitter.voice('effort', event.targetId, after.frame);
  }
}
