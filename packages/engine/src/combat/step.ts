import { sampleInput, influenceImpulse } from "./input.ts";
import { cos, hypot } from '../math/simulation.ts';
import type { CombatConfig, CombatMove, CombatVector } from "./config.ts";
import type { CombatContact, CombatEvent, CombatFighterState, CombatInput } from "./state.ts";
import { overlapsAttackSector } from './contact/geometry.ts';
import { combatMoveDuration } from './combo/timing.ts';
import { matchesCombatCommand, combatCancelAllowed, combatInputCandidates } from './combo/input.ts';

export function advanceFighter(fighter: CombatFighterState, input: CombatInput | undefined, config: CombatConfig, frame: number) {
  fighter.locomotionAllowed = false;
  fighter.charging = false;
  if (fighter.landingFrames > 0) fighter.landingFrames--;
  if (input?.airborne !== undefined) {
    if (fighter.wasAirborne && !input.airborne && fighter.stunFrames === 0 && !fighter.protectionFrames) fighter.landingFrames = config.landingRecoveryFrames ?? 0;
    fighter.wasAirborne = input.airborne;
  }
  if (fighter.health <= 0) {
    fighter.guarding = false; fighter.moveId = ''; fighter.history = [];
    fighter.techWindowFrames = 0; fighter.protectionFrames = 0;
    fighter.influenceDirection = { x: 0, y: 0, z: 0 };
    return;
  }
  const sample = sampleInput(fighter, input, config.directionMode);
  fighter.influenceDirection = input?.influenceDirection ? { ...input.influenceDirection } : sample.vector;
  for (const key of ["guardBrokenFrames", "armorFrames", "followupFrames", "techWindowFrames", "techLockoutFrames", "protectionFrames"] as const) {
    if (fighter[key] > 0) fighter[key]--;
  }
  if (fighter.guardBrokenFrames === 0 && fighter.guardMeter <= 0) fighter.guardMeter = config.maxGuard ?? 0;
  const tech = input?.tech ?? false;
  if (tech && !fighter.techHeld && fighter.techLockoutFrames === 0 && fighter.stunKind === "hit" && fighter.stunFrames > 0 && !fighter.moveId) {
    fighter.techWindowFrames = config.techWindowFrames ?? 4;
    fighter.techLockoutFrames = config.techLockoutFrames ?? 12;
    fighter.techDirection = input?.direction ? { ...input.direction } : { x: 0, y: 0, z: 0 };
  }
  fighter.techHeld = tech;
  const guard = input?.guard ?? false;
  if (guard && !fighter.guarding) { fighter.guardStarted = input?.guardFresh === false ? -1 : frame; fighter.history = []; }
  fighter.guarding = guard;
  // Preserve a fresh command through landing commitment, without reviving an
  // expired airborne input or extending buffers during ordinary recovery.
  if (fighter.landingFrames > 0 && !fighter.moveId && fighter.stunFrames === 0) {
    for (const entry of fighter.history) if (frame - entry.frame < config.inputBufferFrames) entry.frame++;
  }
  // Simultaneous dash + attack pays the real movement cost first. Its saved
  // command executes on the next tick, after locomotion has launched the dash.
  const queueDash = input?.dashStart && !fighter.moveId && !fighter.stunFrames && !fighter.landingFrames && !guard
    && input.locomotionCost !== undefined && ((config.maxStamina ?? 0) === 0 || fighter.stamina >= input.locomotionCost)
    && input.pressed?.some(key => config.moves.some(move => move.dashAttack && move.command.includes(key)));
  fighter.history = fighter.history.filter((entry) => frame - entry.frame < config.commandWindowFrames);
  for (const key of input?.pressed ?? []) if (key !== 'drive' || config.moves.some(move => move.command.includes(key) && !move.stringOnly) || config.moves.find(move => move.id === fighter.moveId)?.cancels.some(cancel => config.moves.find(move => move.id === cancel.moveId)?.command.includes(key))) fighter.history.push({ key, frame, ...(input?.dashing || queueDash ? { dashing: true } : {}), direction: sample.direction, side: sample.side, drive: input?.drive ?? false, airborne: input?.airborne ?? false });
  if (fighter.health <= 0) return;
  const escape = config.moves.find((move) => move.armoredEscape && matchesCombatCommand(fighter, move, config, frame));
  if (escape && fighter.escapeCharges > 0) {
    fighter.escapeCharges--; fighter.stunFrames = 0; fighter.stunKind = "";
    beginMove(fighter, escape);
    return;
  }
  if (fighter.stunFrames > 0) {
    if (fighter.stunKind === "hit") fighter.stamina = Math.min(config.maxStamina ?? 0, fighter.stamina + (config.hitstunStaminaRegen ?? 0));
    fighter.stunFrames--; if (fighter.stunFrames === 0) fighter.stunKind = ""; return; }
  fighter.stunKind = "";
  const current = config.moves.find((move) => move.id === fighter.moveId);
  if (current?.chargeMode === 'travel' && fighter.moveFrame < current.startupFrames + current.activeFrames && fighter.chargeFrames < (current.chargeFrames ?? 0) && input?.held?.includes(current.command.at(-1)!)) fighter.chargeFrames++;
  if (current && current.chargeMode !== 'travel' && fighter.moveFrame === Math.ceil(current.startupFrames * .6) && fighter.chargeFrames < (current.chargeFrames ?? 0) && input?.held?.includes(current.command.at(-1)!)) {
    fighter.chargeFrames++; fighter.charging = true;
  }
  if (current && fighter.moveFrame >= combatMoveDuration(current, fighter)) { fighter.moveId = ""; fighter.moveFrame = 0; }
  if (fighter.landingFrames > 0 && !fighter.moveId) {
    fighter.stamina = Math.min(config.maxStamina ?? 0, fighter.stamina + (config.staminaRegen ?? 0));
    return;
  }
  if (queueDash) {
    fighter.locomotionAllowed = true;
    fighter.stamina = Math.max(0, fighter.stamina - input!.locomotionCost!);
    return;
  }
  // Longer commands win; configuration order is the tie breaker.
  const candidates = combatInputCandidates(fighter, config, frame);
  for (const move of candidates) {
    const cancel = combatCancelAllowed(fighter, current, move);
    if ((move.parryFollowup && fighter.followupFrames === 0) || move.armoredEscape || (move.stringOnly && (!fighter.moveId || !cancel)) || (fighter.moveId && !cancel) || ((config.maxStamina ?? 0) > 0 && fighter.stamina < (move.staminaCost ?? 0))) continue;
    beginMove(fighter, move);
    if (move.parryFollowup) fighter.followupFrames = 0;
    break;
  }
  if (!fighter.moveId) {
    const cost = input?.locomotionCost;
    if (cost !== undefined && ((config.maxStamina ?? 0) === 0 || fighter.stamina >= cost)) {
      fighter.locomotionAllowed = true; fighter.stamina = Math.max(0, fighter.stamina - cost);
    } else {
      const idle = input?.idle !== false && !input?.airborne && !guard && !tech && !input?.drive && cost === undefined
        && !input?.pressed?.length && !input?.held?.length && !sample.vector.x && !sample.vector.y && !sample.vector.z;
      const regen = input?.airborne ? config.airStaminaRegen ?? config.staminaRegen ?? 0
        : idle ? config.idleStaminaRegen ?? config.staminaRegen ?? 0 : config.staminaRegen ?? 0;
      fighter.stamina = Math.min(config.maxStamina ?? 0, fighter.stamina + regen);
    }
  }
}

export function resolveContacts(fighters: CombatFighterState[], config: CombatConfig, frame: number, contacts?: CombatContact[], grounded?: ReadonlySet<string>, attackReachScales?: Readonly<Record<string, number>>, velocities?: ReadonlyMap<string, CombatVector | undefined>, attackArcDegrees?: Readonly<Record<string, number>>, attackVisibility?: (from: CombatVector, to: CombatVector) => boolean) {
  const events: CombatEvent[] = [];
  // Collect before applying damage/stun: same-frame trades do not depend on fighter ordering.
  for (const attacker of fighters) {
    const move = config.moves.find((entry) => entry.id === attacker.moveId);
    const reach = (move?.reach ?? 0) * (attackReachScales?.[attacker.id] ?? 1);
    if (!move || attacker.health <= 0 || attacker.stunFrames > 0 || attacker.moveFrame < move.startupFrames || attacker.moveFrame >= move.startupFrames + move.activeFrames) continue;
    if (move.damage === 0 && move.impulse === 0 && !move.verticalImpulse && move.hitstunFrames === 0 && !(move.guardDamage ?? 0)) continue;
    const offset = attacker.moveFrame - move.startupFrames;
    const strikes = move.strikeFrames ?? [0];
    let strike = -1;
    for (const start of strikes) if (offset >= start) strike++;
    if (strike < 0) continue;
    if (attacker.strikeIndex !== strike) { attacker.strikeIndex = strike; attacker.hitTargets = []; }
    for (const target of fighters) {
      if (target.id === attacker.id || target.protectionFrames > 0 || attacker.hitTargets.includes(target.id)) continue;
      const arc = attackArcDegrees?.[attacker.id] ?? move.hitArcDegrees;
      if (contacts ? !contacts.some((contact) => contact.attackerId === attacker.id && contact.targetId === target.id) : arc === undefined ? !overlaps(attacker, target, move, config.hurtRadius, reach) : !overlapsAttackSector(attacker, target, move, config.hurtRadius, reach, arc)) continue;
      if (arc !== undefined && attackVisibility && !attackVisibility(attacker.position, target.position)) continue;
      const guard = target.guarding && target.guardBrokenFrames === 0 && !target.moveId && (target.stunKind === "" || target.stunKind === "block") && insideGuardArc(attacker, target, config.guardArcDegrees ?? 180);
      const kind = guard ? (target.guardStarted >= 0 && frame - target.guardStarted < config.parryFrames ? "parry" : "block") : "hit";
      const defenseReason = kind === 'parry' ? 'fresh-parry' : kind === 'block' ? 'held-block'
        : target.guardBrokenFrames > 0 ? 'guard-broken' : target.moveId ? 'attack-commitment'
        : target.stunKind === 'hit' ? 'hit-recoil' : target.stunKind === 'parry' ? 'parry-recoil'
        : !target.guarding ? 'guard-not-held' : 'outside-guard-arc';
      const magnitude = kind === "hit" ? move.impulse : kind === "parry" ? -(config.parryPushback ?? 0) : move.impulse * 0.25;
      const impact = kind === 'hit' ? velocityImpact(attacker, target, velocities) : 1;
      const targetMove = config.moves.find((entry) => entry.id === target.moveId);
      const counter = kind === "hit" && target.stunFrames === 0 && targetMove && target.moveFrame < targetMove.startupFrames + targetMove.activeFrames;
      events.push({ id: `${frame}:${attacker.id}:${attacker.attackSerial}:${strike}:${target.id}`, frame, attackerId: attacker.id, targetId: target.id,
        moveId: move.id, kind, defenseReason, damage: kind === "hit" ? move.damage * impact : kind === "block" ? Math.min(Math.max(0, target.health - 1), move.damage * (config.chipRatio ?? 0)) : 0,
        ...(counter ? { counter: true as const } : {}),
        ...(kind === 'hit' ? { baseImpulse: influenceImpulse(attacker, target, move, magnitude, true, 0, impact) } : {}),
        guardDamage: kind === "block" ? move.guardDamage ?? move.damage : 0,
        contactPoint: arc === undefined ? { x: attacker.position.x + attacker.facing.x * reach, y: attacker.position.y + attacker.facing.y * reach + Math.max(0, Math.min(move.hitHeight ?? 0, target.position.y - attacker.position.y - attacker.facing.y * reach)), z: attacker.position.z + attacker.facing.z * reach } : { ...target.position },
        impulse: influenceImpulse(attacker, target, move, magnitude, kind === "hit", config.directionalInfluence ?? 0, impact) });
      attacker.hitTargets.push(target.id);
    }
  }
  for (const event of events) {
    const target = fighters.find((fighter) => fighter.id === event.targetId);
    const attacker = fighters.find((fighter) => fighter.id === event.attackerId);
    const move = config.moves.find((entry) => entry.id === event.moveId);
    if (!target || !attacker || !move) continue;
    if (!attacker.refunded && (config.maxStamina ?? 0) > 0) {
      const parried = events.some((other) => other.attackerId === event.attackerId && other.kind === "parry");
      attacker.refunded = true;
      if (!parried) attacker.stamina = Math.min(config.maxStamina ?? 0, attacker.stamina + (move.contactRefund ?? 0));
    }
    const healthBefore = target.health;
    target.health = Math.max(event.kind === "block" ? Math.min(1, target.health) : 0, target.health - event.damage);
    event.damage = healthBefore - target.health;
    if (event.kind === "parry") {
      if (target.health > 0) target.stamina = Math.min(config.maxStamina ?? 0, target.stamina + (config.parryStaminaRestore ?? 0));
      target.guardMeter = Math.min(config.maxGuard ?? 0, target.guardMeter + (config.maxGuard ?? 0) * (config.parryGuardRestore ?? .25));
      for (const fighter of [attacker, target]) { fighter.stunFrames = 0; fighter.stunKind = ""; fighter.moveId = ""; fighter.moveFrame = 0; fighter.charging = false; fighter.history = []; }
      attacker.stunFrames = config.parryRecoveryFrames ?? 0;
      attacker.stunKind = attacker.stunFrames > 0 ? 'parry' : '';
      target.followupFrames = config.parryFollowupFrames ?? 18;
      continue;
    }
    if (event.kind === "block" && (config.maxGuard ?? 0) > 0) {
      target.guardMeter = Math.max(0, target.guardMeter - (event.guardDamage ?? 0));
      if (target.guardMeter === 0) {
        target.guardBrokenFrames = config.guardBreakFrames ?? 600;
        target.guarding = false;
        event.kind = "guard-break";
      }
    }
    const armoredMove = config.moves.find(entry => entry.id === target.moveId);
    const heavy = move.command.some(command => command === 'heavy' || command.endsWith('-heavy'));
    if (event.kind === 'hit' && attacker.moveId === move.id) attacker.hitConfirmed = true;
    if (target.armorFrames > 0 && target.health > 0 && (armoredMove?.armoredEscape || !heavy)) {
      event.impulse = { x: 0, y: 0, z: 0 };
      delete event.counter;
      event.armored = true;event.hitstunFrames = 0;
      continue;
    }
    target.armorFrames = 0;
    target.stunKind = event.kind === "hit" ? "hit" : "block";
    const hitstun = grounded?.has(target.id) ? move.groundedHitstunFrames ?? move.hitstunFrames : move.hitstunFrames;
    const resolvedStun = event.kind === "hit" ? Math.round(hitstun * velocityImpact(attacker, target, velocities)) : move.blockstunFrames;
    if (event.kind === 'hit') event.hitstunFrames = resolvedStun;
    target.stunFrames = Math.max(target.stunFrames, resolvedStun);
    if (event.kind === "hit") { target.moveId = ""; target.moveFrame = 0; target.charging = false; }

  }
  for (const fighter of fighters) if (fighter.moveId && !fighter.charging) fighter.moveFrame++;
  return events;
}

// Project closing velocity onto the line between bodies, including vertical dives.
// Sideways travel and shared motion add no impact; extreme speeds stay mild.
function velocityImpact(attacker: CombatFighterState, target: CombatFighterState, velocities?: ReadonlyMap<string, CombatVector | undefined>) {
  const a = velocities?.get(attacker.id), b = velocities?.get(target.id);
  const x = target.position.x - attacker.position.x, y = target.position.y - attacker.position.y, z = target.position.z - attacker.position.z;
  const distance = hypot(x, y, z);
  if (!distance) return 1;
  const closing = (((a?.x ?? 0) - (b?.x ?? 0)) * x + ((a?.y ?? 0) - (b?.y ?? 0)) * y + ((a?.z ?? 0) - (b?.z ?? 0)) * z) / distance;
  return 1 + Math.max(-.1, Math.min(.1, closing * .01));
}
function insideGuardArc(attacker: CombatFighterState, target: CombatFighterState, degrees: number) {
  const x = attacker.position.x - target.position.x, z = attacker.position.z - target.position.z;
  const length = hypot(x, z) * hypot(target.facing.x, target.facing.z);
  return length === 0 || (x * target.facing.x + z * target.facing.z) / length + 1e-12 >= cos(degrees * Math.PI / 360);
}
function overlaps(attacker: CombatFighterState, target: CombatFighterState, move: CombatMove, hurtRadius: number, reach: number) {
  const x = attacker.position.x + attacker.facing.x * reach - target.position.x;
  const gap = target.position.y - attacker.position.y - attacker.facing.y * reach;
  const y = gap < 0 ? gap : Math.max(0, gap - (move.hitHeight ?? 0));
  const z = attacker.position.z + attacker.facing.z * reach - target.position.z;
  return x * x + y * y + z * z <= (move.hitRadius + hurtRadius) ** 2;
}

function beginMove(fighter: CombatFighterState, move: CombatMove) {
  fighter.attackSide = fighter.history.at(-1)?.side ?? 1;
  fighter.stamina = Math.max(0, fighter.stamina - (move.staminaCost ?? 0)); fighter.refunded = false; fighter.hitConfirmed = false;
  fighter.moveId = move.id; fighter.moveFrame = 0; fighter.attackSerial++;
  fighter.chargeFrames = 0; fighter.charging = false;
  fighter.hitTargets = []; fighter.history = []; fighter.guarding = false;
  fighter.strikeIndex = -1; fighter.armorFrames = move.armorFrames ?? 0;
}
