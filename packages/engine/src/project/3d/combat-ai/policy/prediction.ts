import type { CombatMove, CombatVector } from '../../../../combat/config.ts';
import type { CombatAiObservation } from '../../combat-ai.ts';
import { cos, hypot, sin } from '../../../../math/simulation.ts';
import { sampleAttackTravel } from '../../combat-motion/attack.ts';

export function contactFrame(move: CombatMove, observation: CombatAiObservation, toward: CombatVector, hurtRadius: number, remaining = Infinity, delay = 0, predictHop = false) {
  const { body, targetBody } = observation;
  const self = observation.state.fighters.find(fighter => fighter.id === observation.fighterId)!;
  const target = observation.state.fighters.find(fighter => fighter.id === observation.targetId)!;
  const manual = target.stunKind === 'hit';
  const fx = manual ? self.facing.x : toward.x, fz = manual ? self.facing.z : toward.z;
  const length = hypot(fx, fz) || 1;
  const angle = (move.movementAngle ?? 0) * (move.direction === 'side' ? self.attackSide : 1);
  const mx = (fx * cos(angle) - fz * sin(angle)) / length, mz = (fx * sin(angle) + fz * cos(angle)) / length;
  let attackTravel = 0;
  for (let frame = 1; frame <= move.startupFrames; frame++) attackTravel += sampleAttackTravel(move, { moveFrame: frame, chargeFrames: 0 }).speed / 60;
  let attenuation = 1;
  for (let frame = 0; frame < move.startupFrames + delay; frame++) attenuation *= .985;
  for (let frame = move.startupFrames; frame < move.startupFrames + move.activeFrames && frame + delay < remaining; frame++) {
    const time = (frame + delay) / 60;
    const travel = target.stunKind === 'hit' ? (1 - attenuation) / .015 / 60 : time;
    attenuation *= .985;
    const tx = targetBody.x + targetBody.velocityX * travel, tz = targetBody.z + targetBody.velocityZ * travel;
    const ax = body.x + mx * attackTravel, az = body.z + mz * attackTravel;
    attackTravel += sampleAttackTravel(move, { moveFrame: frame + 1, chargeFrames: 0 }).speed / 60;
    const ty = observation.targetGrounded ? targetBody.y : Math.max(hurtRadius, targetBody.y + targetBody.velocityY * time + .5 * (observation.targetGravityY ?? -9.81) * time * time);
    const hop = predictHop ? move.startupHopSpeed ?? 0 : 0;
    const velocityY = Math.max(body.velocityY, hop);
    const ay = observation.grounded && !hop ? body.y : Math.max(observation.grounded ? body.y : hurtRadius,
      body.y + velocityY * time + .5 * (observation.gravityY ?? -9.81) * time * time);
    const dx = tx - ax, dy = ty - ay, dz = tz - az;
    const verticalAim = dy / Math.max(.01, hypot(dx, dz));
    const facingLength = hypot(fx / length, verticalAim, fz / length);
    const x = dx - fx / length / facingLength * move.reach, z = dz - fz / length / facingLength * move.reach;
    const y = dy - verticalAim / facingLength * move.reach;
    const vertical = y > 0 ? Math.max(0, y - (move.hitHeight ?? 0)) : y;
    if (hypot(x, vertical, z) <= move.hitRadius + hurtRadius) return frame + delay;
  }
  return Infinity;
}
/** Forecast the attack's actual swept hit sphere against continuing approach, including fresh flurry strikes. */
export function incomingImpact(move: CombatMove, moveFrame: number, o: CombatAiObservation, hurtRadius: number) {
  if (!move.damage && !move.hitstunFrames && !move.impulse) return Infinity;
  const target = o.state.fighters.find(fighter => fighter.id === o.targetId)!;
  const facing = target.facing, angle = (move.movementAngle ?? 0) * (move.direction === 'side' ? target.attackSide : 1);
  const mx = facing.x * cos(angle) - facing.z * sin(angle), mz = facing.x * sin(angle) + facing.z * cos(angle);
  const horizontal = hypot(mx, mz) || 1;
  const dx = o.targetBody.x - o.body.x, dz = o.targetBody.z - o.body.z, distance = hypot(dx, dz) || 1;
  // Consider the next approach decision even when currently stationary, so the policy does not walk into startup.
  const approach = Math.max(6, (o.body.velocityX * dx + o.body.velocityZ * dz) / distance);
  const vx = dx / distance * approach, vz = dz / distance * approach;
  const radius = move.hitRadius + hurtRadius;
  const strikes = move.strikeFrames;
  let attackTravel = 0;
  const firstFrame = Math.max(0, move.startupFrames - moveFrame);
  for (let frame = 1; frame <= firstFrame; frame++) attackTravel += sampleAttackTravel(move, { moveFrame: moveFrame + frame, chargeFrames: target.chargeFrames }).speed / 60;
  for (let frame = firstFrame; frame < Math.min(180, move.startupFrames + move.activeFrames - moveFrame); frame++) {
    const at = moveFrame + frame;
    const displacement = attackTravel;
    attackTravel += sampleAttackTravel(move, { moveFrame: at + 1, chargeFrames: target.chargeFrames }).speed / 60;
    let strike = strikes ? -1 : 0;
    if (strikes) for (const start of strikes) if (at >= move.startupFrames + start) strike++;
    if (strike < 0 || target.moveId === move.id && target.hitTargets.includes(o.fighterId) && strike === target.strikeIndex) continue;
    const time = frame / 60;
    let relativeX = dx + mx / horizontal * displacement - vx * time, relativeZ = dz + mz / horizontal * displacement - vz * time;
    // Contact stops approaching bodies; do not predict that sprinting ghosts through the attacker before startup ends.
    const separation = (relativeX * dx + relativeZ * dz) / distance, minimum = Math.min(distance, hurtRadius * 2);
    if (separation < minimum) { relativeX += dx / distance * (minimum - separation);relativeZ += dz / distance * (minimum - separation); }
    const x = relativeX + facing.x * move.reach, z = relativeZ + facing.z * move.reach;
    const y = o.targetBody.y - o.body.y + facing.y * move.reach + ((o.targetGrounded ? 0 : o.targetBody.velocityY) - (o.grounded ? 0 : o.body.velocityY)) * time;
    const vertical = y < 0 ? Math.min(0, y + (move.hitHeight ?? 0)) : y;
    if (x * x + vertical * vertical + z * z <= radius * radius) return frame;
  }
  return Infinity;
}

export function willReach(move: CombatMove, observation: CombatAiObservation, toward: CombatVector, hurtRadius: number, remaining = Infinity, delay = 0) {
  return Number.isFinite(contactFrame(move, observation, toward, hurtRadius, remaining, delay));
}
