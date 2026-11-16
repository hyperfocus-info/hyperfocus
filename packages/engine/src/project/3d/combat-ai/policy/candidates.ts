import { clamp01 as clamp } from "@hyperfocus/utilities/math";
import type { CombatConfig, CombatMove } from '../../../../combat/config.ts';
import { combatMoveDuration } from '../../../../combat/combo/timing.ts';
import { cos } from '../../../../math/simulation.ts';
import type { CombatFighterState } from '../../../../combat/state.ts';
import { movePreference, personalityWeights, type CombatAiPersonality } from '../personality/index.ts';
import type { TacticalCandidate } from './selection.ts';
import { reviewedPolicyEvidence } from './tuning.ts';
import { combatStyleScore } from './style.ts';

type Preferences = ReturnType<typeof personalityWeights> & { dogfighter?: number; whiffPunisher?: number; bait?: number; grappler?: number };
type Context = {
  config: CombatConfig; self: CombatFighterState; target: CombatFighterState; personality: CombatAiPersonality; preferences: Preferences;
  difficulty: number; distance: number; fullDistance: number; above: number; grounded: boolean; targetGrounded: boolean;
  speed: number; retreating: boolean; quiet: number; stalled: number; enemy?: CombatMove; held: boolean; enemyLength?: number;
  grab?: { range: number; startupFrames: number }; failedMove: string; failures: number;
  eligible: (move: CombatMove) => boolean; physical: (move: CombatMove) => CombatMove; reaches: (move: CombatMove) => boolean;
  adaptive?: boolean; contactFrames?: (move: CombatMove) => number; stage?: (stage: 'candidates' | 'scoring') => void;
};


/** Public observations become numeric opportunity/risk features, then scores.
 * Only command legality, physical range and resources are hard exclusions. */
export function tacticalCandidates(o: Context): TacticalCandidate[] {
  const { config, self, target } = o;
  const p = o.adaptive ? { ...o.preferences, reckless: 1, fast: 1, eager: 1, defensive: 1, items: 1, positioning: 1,
    jumping: 1, grounded: 1, dogfighter: 1, whiffPunisher: 1, bait: 1, grappler: 1 } : o.preferences;
  const candidates: TacticalCandidate[] = [];
  const physicalMoves = o.adaptive ? new Map<string, CombatMove>() : undefined;
  const stamina = config.maxStamina ? self.stamina / config.maxStamina : 1;
  const close = clamp((3.2 - o.distance) / 1.5), need = clamp((o.distance - 1.5) / 3);
  const tired = clamp((.3 - stamina) / .3), waiting = clamp(o.quiet / 120);
  const recovery = o.enemy && target.moveFrame >= o.enemy.startupFrames + o.enemy.activeFrames ? combatMoveDuration(o.enemy, target) - target.moveFrame : 0;
  const delay = (9 - o.difficulty) * 3;
  if (o.adaptive && (self.stunFrames > 0 || self.landingFrames > delay + 1 || self.moveId && config.moves.some(move => move.id === self.moveId && self.moveFrame < combatMoveDuration(move, self)))) return [{ id: 'recover', score: 0 }];
  for (const authored of config.moves) {
    if (!o.eligible(authored) || authored.stringOnly || authored.armoredEscape || authored.special || authored.damage <= 0
      || authored.parryFollowup && self.followupFrames <= 0 || authored.airborne !== undefined && authored.airborne !== !o.grounded) continue;
    const move = o.physical(authored);
    if ((o.adaptive ? (config.maxStamina ?? 0) > 0 : config.maxStamina !== undefined) && self.stamina < (move.staminaCost ?? 0)) continue;
    const contact = o.contactFrames?.(move);
    if (o.adaptive && (move.airborne !== undefined && move.airborne !== !o.grounded || move.parryFollowup && self.followupFrames <= delay + 1
      || contact !== undefined && target.protectionFrames > contact)) continue;
    const reaches = contact === undefined ? o.reaches(move) : Number.isFinite(contact);
    const range = move.reach + move.hitRadius + config.hurtRadius;
    const quick = clamp((32 - move.startupFrames) / 20), commitment = clamp(move.recoveryFrames / 45);
    const punish = o.adaptive ? recovery > (contact ?? Infinity) : recovery >= move.startupFrames + delay + 1;
    const miss = !reaches;
    // A low-commitment whiff can invite a response, but only outside the visible
    // opponent's immediate punish envelope. Weapon length participates equally.
    const punishReach = miss && move.recoveryFrames <= 18 ? immediatePunishReach(config, move.activeFrames + move.recoveryFrames, o.enemyLength) : 0;
    const retreats = (move.startupMovementSpeed ?? 0) < 0 || cos(move.movementAngle ?? 0) < -.5;
    const retreatTravel = retreats ? Math.abs(move.startupMovementSpeed ?? move.movementSpeed ?? 0) * (move.startupFrames + move.activeFrames) / 60 : 0;
    const safeProbe = miss && move.recoveryFrames <= 18 && o.fullDistance + retreatTravel > punishReach + .1
      && o.fullDistance < range + .65 && !o.enemy && !target.armorFrames;
    if (miss && !safeProbe && (o.difficulty >= 8 || o.fullDistance > range + 1.2)) continue;
    o.stage?.('scoring');
    const learned = o.adaptive ? 0 : Math.log(movePreference(o.personality, move.id));
    const antiAir = !o.targetGrounded && o.grounded && o.above > .4 ? clamp((move.hitHeight ?? 0) / .9) : 0;
    const payoff = clamp(move.damage / 30);
    const failed = !o.adaptive && o.failedMove === move.id ? Math.min(3, o.failures) : 0;
    let score = 1.2 + Number(reaches) * 1.3 + quick * p.fast * .65 + close * (p.dogfighter ?? 1) * .6
      + payoff * p.reckless * .6 - commitment * p.defensive * .65 + learned * 1.7 - failed * 1.3
      + Number(punish) * (3 + (p.whiffPunisher ?? 1) * 1.6 + payoff * 2) + antiAir * 4
      + Number(!!move.parryFollowup) * 3 + waiting * p.eager * .4
      - Number(miss) * 3 - Number(target.armorFrames > 0) * 6 - tired * (move.staminaCost ?? 0) / 10;
    score -= recovery > 0 && !punish ? 4 : 0;
    if (safeProbe) score = .5 + (p.bait ?? 1) * 1.8 + quick * .4 - p.defensive * .2 - failed;
    score += reviewedPolicyEvidence.moves[authored.id] ?? 0;
    const priority = o.adaptive && reaches && move.damage >= target.health && !target.guarding && !target.escapeCharges
      && punish && !o.enemy?.cancels.some(cancel => target.moveFrame + (contact ?? Infinity) >= cancel.fromFrame && target.moveFrame <= cancel.toFrame);
    candidates.push({ id: `attack:${authored.id}`, moveId: authored.id, score, ...(miss ? { probe: true } : {}),
      ...(o.adaptive ? { priority: !!priority, ...(Number.isFinite(contact) ? { contactFrames: contact } : {}), reach: range, duration: move.startupFrames + move.activeFrames + move.recoveryFrames } : {}) });
    physicalMoves?.set(authored.id, move);
    o.stage?.('candidates');
  }
  o.stage?.('scoring');
  const grabWindow = o.grab?.startupFrames ?? 0;
  if (o.grab && !o.held && o.grounded && o.targetGrounded && Math.abs(o.above) < 1 && !target.armorFrames
    && o.distance < o.grab.range - .2) {
    candidates.push({ id: 'grapple', grapple: true, score: 1 + (p.grappler ?? 1) * 1.5 + Number(target.guarding) * 2
      + Number(recovery > grabWindow + delay) * 2 - Number(o.retreating) * 2 - tired });
  }
  candidates.push({ id: 'approach', movement: 'toward', score: .8 + need * 2 + p.eager * .35 + waiting * .5 - close * 1.3 - tired * 2 });
  if (o.grounded && stamina > .15 && o.distance > 2.1) {
    candidates.push({ id: 'sprint', movement: 'toward', sprint: true, score: 1.2 + need * 2.2 + p.fast * .5 + Number(o.retreating) * 1.4 - tired * 2 });
    if (self.stamina >= 24 && o.distance < 10) candidates.push({ id: 'dash', movement: 'toward', dash: true,
      score: .4 + need * 1.4 + p.fast * .35 + p.eager * waiting + Number(o.retreating) * 2.4 + clamp(o.stalled / 45) * 1.2 - tired * 3 });
  }
  if (o.distance > 1.5 && o.distance < 7) candidates.push({ id: 'flank', movement: 'flank', sprint: o.grounded && o.distance > 3,
    score: .2 + p.positioning * .7 + p.reroute * 2 - Number(o.retreating) * 1.5 + waiting * .4 });
  if (o.grounded && o.targetGrounded && self.stamina >= 32 && o.speed >= 4 && o.distance > 2.8 && o.distance < 7)
    candidates.push({ id: 'jump', movement: 'toward', jump: true, score: -.8 + p.jumping * .8 + p.reroute * .4 - tired * 3 });
  // Space is a short tactical commitment, not permission to disengage forever.
  if (o.distance < 3.5) candidates.push({ id: 'space', movement: 'away', score: -.5 + p.defensive * .5 + (p.bait ?? 1) * .45
    + tired * 5 + Number(target.armorFrames > 0) * 6 + Number(recovery > 0 && recovery <= 14 + delay) * 3 - waiting * 2 });
  if (tired > 0 && o.distance >= 3.5) candidates.push({ id: 'recover', score: tired * 6 + p.defensive * .5 - waiting * .5 });
  if (o.adaptive) {
    const grappleAvailable = candidates.some(candidate => candidate.grapple);
    for (const candidate of candidates) {
      const move = candidate.moveId ? physicalMoves?.get(candidate.moveId) : undefined;
      candidate.styleScore = combatStyleScore({ preferences: o.preferences, candidate, move, distance: o.distance,
        grounded: o.grounded, targetGrounded: o.targetGrounded, held: o.held, grappleAvailable,
        punish: move && recovery > (candidate.contactFrames ?? Infinity), safeProbe: candidate.probe });
      candidate.score += candidate.styleScore;
    }
  }
  return candidates;
}

function immediatePunishReach(config: CombatConfig, frames: number, weaponLength?: number) {
  let reach = 0;
  for (const move of config.moves) {
    if (move.damage <= 0 || move.stringOnly || move.dashAttack || move.parryFollowup || move.armoredEscape || move.special || move.startupFrames >= frames) continue;
    const speed = Math.max(0, (move.movementSpeed ?? 0) * cos(move.movementAngle ?? 0));
    reach = Math.max(reach, (weaponLength ?? move.reach) + move.hitRadius + config.hurtRadius + speed * move.startupFrames / 60);
  }
  return reach;
}
