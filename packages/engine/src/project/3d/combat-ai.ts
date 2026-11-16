import { combatMoveDuration } from '../../combat/combo/timing.ts';
import { applyCombatAiPolicy, readCombatAiPolicy, type CombatAiPolicy } from './combat-ai/policy/trained.ts';
import { initialJumping, observeJumping, canJump, recordJump, readJumping, type CombatAiJumping } from './combat-ai/lifecycle/jumping.ts';
import { initialTactics, observeTactics, readTactics, type CombatAiTactics } from './combat-ai/tactics.ts';
import { initialPersonality, observePersonality, observeEvents, personalityWeights, movePreference, resetPersonalityRound, type CombatAiPersonality } from './combat-ai/personality/index.ts';
import { readPersonality } from './combat-ai/personality/validation.ts';
import { tacticalCandidates } from './combat-ai/policy/candidates.ts';
import { candidateProbabilities, chooseTactic, initialPolicy, readPolicy, type TacticalMemory, type TacticalCandidate } from './combat-ai/policy/selection.ts';
import { overrideCombatAiDecision, type CombatAiControllerDecisionOverride } from './combat-ai/policy/override.ts';
import { reviewedPolicyEvidence } from './combat-ai/policy/tuning.ts';
import { createDecisionTimer, readCombatAiTuning, type CombatAiProfile, type CombatAiTuning } from './combat-ai/policy/instrumentation.ts';
import { initialLearning, observeLearning, resolveLearning, resetLearning, recordDecision, learningContext, learningAdjustment, type CombatAiLearning } from './combat-ai/learning/model.ts';
import { readLearning } from './combat-ai/learning/validation.ts';
import { compactLearning } from './combat-ai/learning/capture.ts';
import { captureLearningEvidence, recordLearningProbe, trackLearningEvidence } from './combat-ai/learning/evidence.ts';
import { movementPlanKey, readPlan, reusableMovement, type MovementPlan } from './combat-ai/policy/plan.ts';
import { weaponAttackMove } from './combat-interaction/weapons/attacks.ts';
import { dashAttackCandidates } from './combat-ai/dash-attacks.ts';
import { incomingProjectileImpact, type CombatWeaponObservation } from './combat-interaction/ai-observation.ts';
import { createCombatAiOutcomes } from './combat-ai/outcomes.ts';
import { readCombatAiMemory3D } from './combat-ai/memory-reader.ts';
import type { CombatBreachDecision } from './combat-environment/breach-route.ts';
import { hypot, sqrt } from '../../math/simulation.ts';
import type { CombatConfig, CombatMove, CombatVector } from '../../combat/config.ts';
import type { CombatEvent, CombatInput, CombatSnapshot } from '../../combat/state.ts';
import { object } from './gameplay-contracts.ts';
import { contactFrame, willReach, incomingImpact } from './combat-ai/policy/prediction.ts';
import { combatStyleScore } from './combat-ai/policy/style.ts';
import { readCombatTraversalPlan, type CombatTraversalPlan, type CombatTraversalRequest, type CombatTraversalDecision } from './combat-environment/traversal-plan.ts';

export type CombatAiBody3D = { x: number; y: number; z: number; velocityX: number; velocityY: number; velocityZ: number };
export type CombatAiAction3D = { input: CombatInput; direction: CombatVector; jump: boolean; dash: boolean; sprint: boolean };
export type CombatAiObservation = { opponentId?: string; grab?: { range: number; startupFrames: number }; seed?: number; dashing?: boolean; weapons?: readonly CombatWeaponObservation[]; grapple?: { remaining: number; total: number; attacker: string }; breach?: CombatBreachDecision; route?: CombatVector; blockedEscape?: CombatVector; wall?: { normal: CombatVector; jumpCost: number; runCost: number }; gravityY?: number; targetGravityY?: number; surfaceContactFrames?: number; state: CombatSnapshot; fighterId: string; targetId: string; difficulty: number; grounded: boolean; targetGrounded: boolean; collision?: boolean; body: CombatAiBody3D; targetBody: CombatAiBody3D };
type Memory = { plan?: MovementPlan; learning?: CombatAiLearning; queuedLearning?: CombatAiLearning; tuning?: CombatAiTuning; queuedPolicy?: { policy?: CombatAiPolicy }; trainedPolicy?: CombatAiPolicy; policy: TacticalMemory; jumping: CombatAiJumping; personality?: CombatAiPersonality; tactics: CombatAiTactics; tick: number; queue: CombatAiAction3D[]; guard: boolean; tech: boolean; drive: boolean; navigation?: CombatTraversalPlan };
const zero = (): CombatVector => ({ x: 0, y: 0, z: 0 });
const canonicalDirection = (vector: CombatVector): CombatVector => ({ x: vector.x || 0, y: vector.y || 0, z: vector.z || 0 });
function idle(id: string): CombatAiAction3D { return { input: { fighterId: id, pressed: [], guard: false, tech: false }, direction: zero(), jump: false, dash: false, sprint: false }; }
function recordForcedAttack(learning: CombatAiLearning, context: string, frame: number, authored: CombatMove, physical: CombatMove, delay: number, hurtRadius: number) {
  const chosen = { id: `forced:${authored.id}`, moveId: authored.id, observedMoveId: physical.id,
    score: 0, probability: 1, reach: physical.reach + physical.hitRadius + hurtRadius };
  recordDecision(learning, { frame, context, candidates: [chosen], chosen, probability: 1, deliveryDelay: delay });
}

/** Fixed-tick tactical policy. Every level observes committed combat state, never pending opponent inputs. */
export function createCombatAi3D({ config, navigate, trainedPolicy, learning, tuning, profile, decisionOverride, indirectMoveIds = [], outcomes = createCombatAiOutcomes() }: { config: CombatConfig; learning?: CombatAiLearning; tuning?: CombatAiTuning; profile?: CombatAiProfile; decisionOverride?: CombatAiControllerDecisionOverride; trainedPolicy?: CombatAiPolicy; outcomes?: ReturnType<typeof createCombatAiOutcomes>; indirectMoveIds?: readonly string[]; navigate?: (request: CombatTraversalRequest) => CombatTraversalDecision | undefined }) {
  const moves = new Map(config.moves.map(move => [move.id, move])), indirect = new Set(indirectMoveIds);
  const timer = createDecisionTimer(profile);
  const physicalCache = new Map<CombatMove, CombatMove>(), reachCache = new Map<string, number>();
  let memory: Memory = { ...(learning ? { learning: readLearning(learning) } : {}), tuning: readCombatAiTuning(tuning), ...(trainedPolicy === undefined ? {} : { trainedPolicy: readCombatAiPolicy(trainedPolicy) }), policy: initialPolicy(), jumping: initialJumping(), tick: 0, queue: [], guard: false, tech: false, drive: false, tactics: initialTactics() };
  let collectingEvidence = false;
  function trackEvidence() {
    if (memory.tuning?.mode !== 'adaptive' || memory.tuning.adaptation === false || memory.tuning.learningFrozen) return false;
    trackLearningEvidence(memory.learning ??= initialLearning({ opponentId: memory.tuning.opponentId }));return true;
  }
  function decide(o: CombatAiObservation): CombatAiAction3D {
    const adaptive = memory.tuning?.mode === 'adaptive';
    const result = idle(o.fighterId), self = o.state.fighters.find(f => f.id === o.fighterId), target = o.state.fighters.find(f => f.id === o.targetId);
    result.input.airborne = !o.grounded;
    if (!self || !target || self.health <= 0) return result;
    const personality = memory.personality ??= initialPersonality({ seed: o.seed, fighterId: o.fighterId });
    const preferences = personalityWeights(personality);
    const opponentId = o.opponentId ?? memory.tuning?.opponentId ?? o.targetId;
    const suppliedLearning = adaptive && memory.tuning?.adaptation !== false ? memory.learning ??= initialLearning({ opponentId }) : undefined;
    // Frozen evidence remains immutable; an explicitly different opponent cannot use it.
    const learning = memory.tuning?.learningFrozen && suppliedLearning?.opponentId !== opponentId ? undefined : suppliedLearning;
    if (o.grapple) {
      if (learning && !memory.tuning?.learningFrozen) observeLearning(learning, { state: o.state, fighterId: o.fighterId, targetId: o.targetId, opponentId,
        distance: hypot(o.targetBody.x - o.body.x, o.targetBody.z - o.body.z), targetGrounded: o.targetGrounded, maxHealth: config.maxHealth, maxStamina: config.maxStamina });
      const delay = (9 - o.difficulty) * 3;
      if (o.grapple.remaining > delay && !memory.queue.some(action => action.input.pressed?.includes('interact'))) result.input.pressed = ['interact'];
      return result;
    }
    if (target.health <= 0 && o.difficulty <= 6) return result;
    const dx = o.targetBody.x - o.body.x, dz = o.targetBody.z - o.body.z, dy = o.targetBody.y - o.body.y;
    const distance = hypot(dx, dz), fullDistance = hypot(dx, dy, dz), scale = distance || 1;
    if (learning && !memory.tuning?.learningFrozen) observeLearning(learning, { state: o.state, fighterId: o.fighterId, targetId: o.targetId, opponentId, distance, targetGrounded: o.targetGrounded, maxHealth: config.maxHealth, maxStamina: config.maxStamina });
    observeTactics(memory.tactics, o.state, o.fighterId, distance, memory.tick, o.seed);
    const toward = { x: dx / scale, y: 0, z: dz / scale }, away = { x: -toward.x, y: 0, z: -toward.z };
    const current = moves.get(self.moveId), active = current && self.moveFrame < combatMoveDuration(current, self) ? current : undefined;
    const held = o.weapons?.find(item => item.owner === self.id), enemyHeld = o.weapons?.find(item => item.owner === target.id);
    const enemyMove = moves.get(target.moveId), enemy = enemyMove && target.moveFrame < combatMoveDuration(enemyMove, target) ? enemyHeld ? { ...enemyMove, reach: enemyHeld.length } : enemyMove : undefined;
    if (adaptive) { physicalCache.clear();reachCache.clear(); }
    const physicalMove = (move: CombatMove) => {
      if (!adaptive) return weaponAttackMove(config, move, held);
      let physical = physicalCache.get(move);
      if (!physical) { physical = weaponAttackMove(config, move, held);physicalCache.set(move, physical); }
      return physical;
    };
    const contact = (move: CombatMove, remaining = Infinity, delivery = (9 - o.difficulty) * 3) => {
      const key = `${move.id}:${remaining}:${delivery}`;
      let frames = reachCache.get(key);
      if (frames === undefined) { frames = contactFrame(move, o, toward, config.hurtRadius, remaining, delivery, true);reachCache.set(key, frames); }
      return frames;
    };
    const eligible = (move: CombatMove) => !move.weaponAttack && (!move.dashAttack || o.dashing === true)
      && (!adaptive || (move.airborne === undefined || move.airborne === !o.grounded) && (!move.parryFollowup || self.followupFrames > (9 - o.difficulty) * 3 + 1));
    const affordable = (move: CombatMove) => (adaptive ? !config.maxStamina : config.maxStamina === undefined) || self.stamina >= (move.staminaCost ?? 0);
    // A hit confirm is only a forecast while stun remains. Delivery latency and
    // the live DI trajectory can invalidate a previously available continuation.
    const confirms = (move: CombatMove) => target.stunKind === 'hit' && (adaptive ? Number.isFinite(contact(physicalMove(move), target.stunFrames)) : willReach(physicalMove(move), o, toward, config.hurtRadius, target.stunFrames, (9 - o.difficulty) * 3));
    let policyChoice = false;
    function attack(id: string, probe = false) {
      const authored = moves.get(id), requested = authored?.weaponSourceMoveId ? moves.get(authored.weaponSourceMoveId) : authored;
      if (!requested || indirect.has(id) || !eligible(requested)) return false;
      const move = physicalMove(requested);
      if (adaptive && !move.armoredEscape && (move.airborne !== undefined && move.airborne !== !o.grounded
        || self!.stunFrames > 0 || !active && self!.landingFrames > (9 - o.difficulty) * 3 + 1
        || active && !active.cancels.some(entry => entry.moveId === move.id && self!.moveFrame + (9 - o.difficulty) * 3 >= entry.fromFrame && self!.moveFrame + (9 - o.difficulty) * 3 <= entry.toFrame))) return false;
      if (!adaptive && !active && memory.tactics.failures >= 2 && memory.tactics.failedMove === move.id && memory.tactics.quiet < 120) return false;
      if (!affordable(move)) return false;
      if (!probe && o.difficulty === 9 && target!.health > 0 && !move.special && !move.armoredEscape && (move.damage > 0 || move.impulse > 0 || (move.guardDamage ?? 0) > 0) && !(adaptive ? Number.isFinite(contact(move)) : willReach(move, o, toward, config.hurtRadius))) return false;
      result.input.pressed = [...requested.command]; result.input.drive = move.drive ?? false;
      result.input.direction = move.direction === 'toward' ? toward : move.direction === 'away' ? away : move.direction === 'side' ? { x: -toward.z, y: 0, z: toward.x } : zero();
      result.input.airborne = !o.grounded;
      // Safety and confirmed cancels are deterministic legal commands, not a
      // softmax draw. Record their singleton distribution without double-counting
      // a command already represented by the neutral/dash selector.
      if (learning && !policyChoice && !memory.tuning?.learningFrozen) {
        recordForcedAttack(learning, learningContext(self!, target!, distance, o.targetGrounded), o.state.frame,
          requested, move, (9 - o.difficulty) * 3, config.hurtRadius);
      }
      return true;
    }
    function select(candidates: TacticalCandidate[]) {
      timer.stage('scoring');applyCombatAiPolicy(candidates, memory.trainedPolicy);
      const context = learning ? learningContext(self!, target!, distance, o.targetGrounded) : '';
      const exploration = memory.tuning?.exploration ?? 0;
      if (learning && collectingEvidence) recordLearningProbe(learning, { frame: o.state.frame, context, difficulty: o.difficulty, opponentId, candidates, ...(exploration ? { exploration } : {}) });
      if (learning) for (const candidate of candidates) {
        candidate.score += learningAdjustment(learning, context, candidate);
      }
      timer.stage('selection');
      const previousRandom = memory.policy.random;
      const override = overrideCombatAiDecision(candidates, o.state.frame, decisionOverride);
      const choice = override ?? chooseTactic(memory.policy, candidates, o.difficulty, memory.tick, self!.attackSerial, memory.tactics.random, exploration);
      policyChoice = !!choice;
      if (learning && choice && (override || memory.policy.random !== previousRandom) && !memory.tuning?.learningFrozen) {
        const probabilities = override ? candidates.map(candidate => Number(candidate === override)) : candidateProbabilities(candidates, o.difficulty, exploration);
        const alternatives = candidates.map((candidate, index) => ({ ...candidate, probability: probabilities[index]!, ...(candidate.moveId ? { observedMoveId: physicalMove(moves.get(candidate.moveId)!).id } : {}) }));
        const index = candidates.indexOf(choice);
        recordDecision(learning, { frame: o.state.frame, context, candidates: alternatives, chosen: alternatives[index]!, probability: probabilities[index]!, deliveryDelay: (9 - o.difficulty) * 3 });
      }
      return choice;
    }
    timer.stage('safety');
    if (self.stunKind === 'hit') {
      delete memory.navigation;
      // Fixed-tick choices survive rollback and give successive impacts different, legal exits.
      const exit = Math.floor(memory.tick / 30) % 3;
      const influence = exit === 0 ? away : { x: -toward.z * (exit === 1 ? 1 : -1), y: 0, z: toward.x * (exit === 1 ? 1 : -1) };
      result.direction = influence; result.input.direction = influence;
      // Deliver the fresh tech close to predicted contact, including raised decks and walls.
      const delay = (9 - o.difficulty) * 3;
      const landing = o.collision || (o.surfaceContactFrames !== undefined ? o.surfaceContactFrames <= delay + 3
        : o.body.velocityY < 0 && o.body.y + o.body.velocityY * 3 / 60 <= (config.hurtRadius + .5));
      const scheduledTech = memory.queue.some(action => action.input.tech);
      if (landing && self.techLockoutFrames === 0 && !memory.tech && !scheduledTech) result.input.tech = true;
      else if (!(scheduledTech && landing) && self.escapeCharges > 0 && distance < 3 && (self.stunFrames > 20 || self.health <= config.maxHealth * .35 && self.stunFrames > 8)) attack('escape');
      return result;
    }
    if (target.health <= 0) {
      // A settled body offers no continuing juggle. Finish the committed move,
      // then stop instead of repeatedly launching at a floor-level target.
      if (o.targetGrounded || dy < -.35 && Math.abs(o.targetBody.velocityY) < .5) return result;
      if (active) return result;
      const candidates = !o.grounded ? ['drive-jab', 'jab'] : dy > 1 ? ['heavy', 'jab'] : ['jab', 'drive-jab'];
      for (const id of candidates) {
        const move = moves.get(id);
        if (move && willReach(physicalMove(move), o, toward, config.hurtRadius) && attack(id)) return result;
      }
      result.direction = o.route ?? toward;result.sprint = o.grounded && distance > 3;
      result.jump = o.grounded && dy > 1.1 && distance < 3 && hypot(o.body.velocityX, o.body.velocityZ) >= 6;
      result.dash = !o.grounded && fullDistance > 2.5 && self.stamina >= 12;
      return result;
    }
    const delay = (9 - o.difficulty) * 3;
    const feintWindow = active?.cancels.find(entry => entry.moveId === 'feint' && self.moveFrame + delay >= entry.fromFrame && self.moveFrame + delay <= entry.toFrame);
    const feintRoll = ((Math.imul(self.attackSerial + 1, 2654435761) ^ memory.tactics.random) >>> 0) / 0x100000000;
    // Anticipate a demonstrated parry habit during ordinary authored startup.
    // Waiting to see a last-frame guard makes every legal feint window too late.
    if (o.difficulty >= 7 && feintWindow && target.stunFrames === 0 &&
      (target.guarding && target.guardStarted >= 0 && o.state.frame - target.guardStarted < (config.parryFrames ?? 0)
        || (target.guarding || personality.parried > 0) && feintRoll < Math.min(.85, preferences.feint * .5)) && attack('feint')) return result;
    const impact = Math.min(enemy && !target.stunFrames ? incomingImpact(enemy, target.moveFrame, o, config.hurtRadius) : Infinity, incomingProjectileImpact(o.weapons ?? [], self.id, o.body, config.hurtRadius));
    if (Number.isFinite(impact)) {
      // Opposite input brakes retained sprint momentum; zero input alone can keep coasting into a hit.
      if ((o.body.velocityX * toward.x + o.body.velocityZ * toward.z) > 1 || self.guardBrokenFrames > 0) result.direction = away;
      // Schedule for delivery, not observation: an impact-zero request arrives late at lower levels.
      // If startup was too short to react, hold a fallback block instead of repeatedly releasing it.
      const delay = (9 - o.difficulty) * 3;
      const scheduledGuard = memory.queue.at(-1)?.input.guard ?? memory.guard;
      const cautious = preferences.parryCaution > .25 && memory.tactics.choice !== 0;
      if (self.guardBrokenFrames === 0 && !active) result.input.guard = cautious ? impact <= delay + (config.parryFrames ?? 0) + 1 : impact <= delay && (delay > 0 || !scheduledGuard);
      else if (active && impact <= 2 && o.difficulty >= 7) { result.direction = { x: -toward.z, y: 0, z: toward.x }; result.input.direction = result.direction; attack('evade'); result.input.direction = result.direction; }
      else if (self.guardBrokenFrames > 0) { result.direction = away; result.dash = true; }
      return result;
    }
    if (o.breach && o.difficulty >= 7 && o.grounded && !active && !self.stunFrames) {
      const move = o.breach.moveId && moves.get(o.breach.moveId);
      if (move && !indirect.has(move.id) && eligible(move) && affordable(move)) {
        result.input.pressed = [...move.command];result.input.drive = !!move.drive;
        result.input.direction = move.direction === 'toward' ? o.breach.direction : zero();
      } else result.direction = o.breach.direction;
      return result;
    }
    if (o.blockedEscape && o.grounded && !active && !self.stunFrames && preferences.reroute > .4) { delete memory.navigation;result.direction = o.blockedEscape;return result; }
    if (navigate && (o.targetGrounded || memory.navigation) && memory.tick >= memory.jumping.retryAt && !active && self.stunFrames === 0 && target.stunKind !== 'hit') {
      const traversal = navigate({ fighterId: self.id, targetId: target.id, grounded: o.grounded, stamina: self.stamina, delay: (9 - o.difficulty) * 3, plan: memory.navigation });
      if (traversal) memory.navigation = traversal.plan;else delete memory.navigation;
      if (traversal) { result.direction = traversal.direction;result.jump = traversal.jump;return result; }
    }
    if (o.route && o.grounded && !active && self.stunFrames === 0) { result.direction = o.route;return result; }
    if (self.stunFrames > 0) return result;
    if (active) {
      const delay = (9 - o.difficulty) * 3;
      const driveHeld = (memory.queue.length ? memory.queue.at(-1)!.input.drive ?? false : memory.drive);
      const wheel = active.cancels.find(entry => moves.get(entry.moveId)?.command[0] === 'drive' && self.moveFrame + delay >= entry.fromFrame && self.moveFrame + delay <= entry.toFrame);
      if (wheel && !driveHeld && attack(wheel.moveId)) { result.input.drive = true;return result; }
      if (active.chargeMode === 'travel') {
        if (active.chargeFrames && self.chargeFrames < active.chargeFrames && self.moveFrame < active.startupFrames + active.activeFrames && distance > active.reach + config.hurtRadius) result.input.held = ['heavy'];
        return result;
      }
      if (active.chargeFrames && self.moveFrame <= Math.ceil(active.startupFrames * .6)) {
        const baseTravel = (active.activeMovementSpeed ?? active.movementSpeed ?? 0) * active.activeFrames / 60;
        const wanted = Math.max(0, distance - active.reach - config.hurtRadius);
        if (self.chargeFrames < active.chargeFrames && baseTravel * (1 + (active.chargeSpeedScale ?? 0) * self.chargeFrames / active.chargeFrames) < wanted) result.input.held = ['heavy'];
        return result;
      }
      // Confirm the hit before linking: a miss never authorizes a blind continuation.
      if (target.stunKind === 'hit' && target.stunFrames > 0 && fullDistance < 3.2) {
        // Finish through an ordinary cancel before selecting a longer string.
        // Weapon damage and cost must describe the move the command will execute.
        const finishes = active.cancels.flatMap(entry => {
          const move = moves.get(moves.get(entry.moveId)?.weaponSourceMoveId ?? entry.moveId);
          if (!move || entry.hitOnly && !self.hitConfirmed || !eligible(move) || move.airborne !== undefined && move.airborne !== !o.grounded
            || self.moveFrame + delay < entry.fromFrame || self.moveFrame + delay > entry.toFrame) return [];
          const physical = physicalMove(move);
          return physical.damage >= target.health && affordable(physical) && confirms(move) ? [{ move, physical }] : [];
        }).sort((a, b) => a.physical.startupFrames - b.physical.startupFrames || (a.physical.staminaCost ?? 0) - (b.physical.staminaCost ?? 0));
        for (const { move } of finishes) if (attack(move.id)) return result;
        const pursuit = !o.targetGrounded && distance > 2.25;
        const sustained = !pursuit && Math.abs(dy) < 1.25;
        const link = active.cancels.map(entry => ({ entry, move: moves.get(moves.get(entry.moveId)?.weaponSourceMoveId ?? entry.moveId) })).find(({ entry, move }) => move?.stringOnly && (!entry.hitOnly || self.hitConfirmed) && eligible(move) && move.drive === sustained && move.direction === (pursuit ? 'toward' : 'neutral') && self.moveFrame + delay >= entry.fromFrame && self.moveFrame + delay <= entry.toFrame && affordable(move) && confirms(move));
        if (link?.move) attack(link.move.id);
        else {
          const launch = active.cancels.map(entry => ({ entry, move: moves.get(moves.get(entry.moveId)?.weaponSourceMoveId ?? entry.moveId) })).filter(({ entry, move }) => move?.command[0] === 'heavy' && (!entry.hitOnly || self.hitConfirmed) && eligible(move) && self.moveFrame + delay >= entry.fromFrame && self.moveFrame + delay <= entry.toFrame && affordable(move) && confirms(move))
            .sort((a, b) => Number(b.move!.damage >= target.health) - Number(a.move!.damage >= target.health) || (b.move!.hitHeight ?? 0) - (a.move!.hitHeight ?? 0));
          for (const candidate of launch) if (attack(candidate.move!.id)) break;
        }
      }
      return result;
    }
    // Standing directly above a fighter is not useful attack spacing. Step off
    // through normal movement instead of steering forever into their capsule.
    if (dy < -1.3 && distance < config.hurtRadius * 2 + .5) {
      result.direction = distance > .3 ? away : memory.tactics.random & 1 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
      return result;
    }
    if (o.dashing) {
      timer.stage('candidates');
      const recovery = enemy && target.moveFrame >= enemy.startupFrames + enemy.activeFrames ? combatMoveDuration(enemy, target) - target.moveFrame : 0;
      const candidates = dashAttackCandidates({ moves: config.moves, distance: fullDistance, above: dy, targetAirborne: !o.targetGrounded,
        targetStun: target.stunKind === 'hit' ? target.stunFrames : 0, closingSpeed: -(o.targetBody.velocityX * toward.x + o.targetBody.velocityZ * toward.z), enemyRecovery: recovery });
      const choices = candidates.filter(move => !indirect.has(move.id) && (!adaptive || eligible(move) && self.landingFrames <= delay + 1) && affordable(physicalMove(move)) &&
        (!move.damage || (adaptive ? Number.isFinite(contact(physicalMove(move))) && target.protectionFrames <= contact(physicalMove(move)) : willReach(physicalMove(move), o, toward, config.hurtRadius))))
        .map((move, index) => {
          const physical = physicalMove(move), frames = adaptive ? contact(physical) : Infinity;
          const candidate: TacticalCandidate = { id: `dash:${move.id}`, moveId: move.id,
            score: 3 - index * .45 + (adaptive ? 0 : Math.log(movePreference(personality, physical.id)) * 1.7) + (reviewedPolicyEvidence.moves[move.id] ?? 0),
            ...(adaptive ? { reach: physical.reach + move.hitRadius + config.hurtRadius, ...(Number.isFinite(frames) ? { contactFrames: frames } : {}),
              priority: physical.damage >= target.health && Number.isFinite(frames) && recovery > frames && !target.guarding && !target.escapeCharges
                && !enemy?.cancels.some(cancel => (!cancel.hitOnly || target.hitConfirmed) && target.moveFrame + frames >= cancel.fromFrame && target.moveFrame <= cancel.toFrame) } : {}) };
          if (adaptive) {
            candidate.styleScore = combatStyleScore({ preferences, candidate, move: physical, distance,
              grounded: o.grounded, targetGrounded: o.targetGrounded, held: !!held, punish: recovery > frames });
            candidate.score += candidate.styleScore;
          }
          return candidate;
        });
      // Completing an already paid dash is a legal alternative to spending
      // another attack on an opponent who is visibly running away.
      if (adaptive && distance > 2.5 && o.targetBody.velocityX * toward.x + o.targetBody.velocityZ * toward.z > 2) {
        for (const choice of choices) if (moves.get(choice.moveId!)!.damage === 0) choice.score -= 3;
        choices.push({ id: 'continue-dash', score: 3, movement: 'toward' });
      }
      const selected = select(choices);
      if (selected?.id === 'continue-dash') { result.direction = toward;return result; }
      if (selected?.moveId && attack(selected.moveId)) return result;
      timer.stage('safety');
    }
    if (target.stunKind === 'hit' && target.stunFrames > 0) {
      const cashout = config.moves.filter(move => eligible(move) && !move.stringOnly && !move.armoredEscape && !move.parryFollowup && (adaptive ? physicalMove(move).damage : move.damage) >= target.health && affordable(adaptive ? physicalMove(move) : move) && confirms(move)).sort((a, b) => a.startupFrames - b.startupFrames);
      for (const move of cashout) if (attack(move.id)) return result;
      if (o.grounded && dy > 1.1) { result.dash = self.stamina >= 12; result.jump = !result.dash && hypot(o.body.velocityX, o.body.velocityZ) >= 6; result.direction = toward; return result; }
      const finish = moves.get('drive-jab-toward');
      if (finish && target.health <= finish.damage && confirms(finish) && attack(finish.id)) return result;
      const flurry = moves.get('drive-jab');
      if (flurry && fullDistance < physicalMove(flurry).reach + flurry.hitRadius + config.hurtRadius && confirms(flurry) && (!o.grounded || dy < 1.1) && attack('drive-jab')) return result;
      result.direction = toward; result.sprint = o.grounded && distance > 3;
      result.dash = distance > 2.5 && self.stamina >= 12;
      return result;
    }
    // A contacted wall offers the same paid route to either controller. Decisions
    // still pass through reaction delay and ordinary movement input validation.
    if (!o.grounded && o.wall && distance > 2) {
      const normal = o.wall.normal, outward = toward.x * normal.x + toward.z * normal.z;
      if (outward > .3 && self.stamina >= o.wall.jumpCost) {
        result.jump = true; result.direction = toward; return result;
      }
      const tx = toward.x - normal.x * outward, tz = toward.z - normal.z * outward, tangent = hypot(tx, tz);
      if (tangent > .5 && self.stamina >= o.wall.runCost) {
        // Sloped wall normals make the horizontal steering terms nonorthogonal.
        const x = tx / tangent * .9 - normal.x * .4, z = tz / tangent * .9 - normal.z * .4;
        const strength = Math.max(1, hypot(x, z));
        result.direction = { x: x / strength, y: 0, z: z / strength };
        return result;
      }
    }
    if (adaptive && self.landingFrames > delay + 1) return result;
    const planKey = adaptive && memory.tuning?.compression !== false && distance >= 3.5 ? movementPlanKey({ self, target, body: o.body, targetBody: o.targetBody, distance,
      grounded: o.grounded, targetGrounded: o.targetGrounded, dashing: o.dashing, difficulty: o.difficulty, enemyPhase: enemy ? target.moveFrame < enemy.startupFrames ? 'startup' : target.moveFrame < enemy.startupFrames + enemy.activeFrames ? 'active' : 'recovery' : 'neutral',
      maxStamina: config.maxStamina, weapons: o.weapons, reroute: preferences.reroute, positioning: preferences.positioning }) : undefined;
    const retained = memory.plan && planKey === memory.plan.key && memory.tick < memory.plan.until && self.attackSerial === memory.plan.serial ? memory.plan.choice : undefined;
    timer.stage('candidates');
    const candidates = retained ? [] : tacticalCandidates({ config, self, target, personality, preferences, difficulty: o.difficulty,
      distance, fullDistance, above: dy, grounded: o.grounded, targetGrounded: o.targetGrounded,
      speed: hypot(o.body.velocityX, o.body.velocityZ), retreating: o.targetBody.velocityX * toward.x + o.targetBody.velocityZ * toward.z > 2,
      quiet: memory.tactics.quiet, stalled: memory.tactics.stalled, enemy, held: !!held, enemyLength: enemyHeld?.length, grab: o.grab,
      failedMove: memory.tactics.failedMove, failures: memory.tactics.failures,
      eligible: move => eligible(move) && !indirect.has(move.id), physical: physicalMove, reaches: move => willReach(move, o, toward, config.hurtRadius),
      ...(adaptive ? { adaptive, contactFrames: contact } : {}), ...(profile ? { stage: timer.stage } : {}) });
    const choice = retained ?? select(candidates);
    if (!retained) {
      if (choice && planKey && reusableMovement(choice)) memory.plan = { key: planKey, choice: { id: choice.id, score: choice.score,
        ...(choice.movement ? { movement: choice.movement } : {}), ...(choice.sprint === undefined ? {} : { sprint: choice.sprint }) }, until: Math.min(memory.policy.until, memory.tick + 6), serial: self.attackSerial };
      else delete memory.plan;
    }
    if (choice?.moveId) attack(choice.moveId, choice.probe);
    else if (choice?.grapple) result.input.pressed = ['interact'];
    else if (choice?.movement) {
      const side = memory.policy.random & 1 ? 1 : -1;
      const lateral = Math.min(.8, .18 * preferences.positioning + preferences.reroute * .5), forward = sqrt(1 - lateral * lateral);
      result.direction = choice.movement === 'away' ? away : choice.movement === 'flank'
        ? { x: toward.x * forward - toward.z * lateral * side, y: 0, z: toward.z * forward + toward.x * lateral * side } : toward;
      result.sprint = choice.sprint ?? false;result.dash = choice.dash ?? false;result.jump = choice.jump ?? false;
    }
    return result;
  }
  function validate(value: unknown): Memory {
    function keys(value: Record<string, unknown>, allowed: string[]) { if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unknown combat AI save field.'); }
    const v = object(value);
    keys(v, ['tick', 'guard', 'tech', 'drive', 'queue', 'navigation', 'tactics', 'personality', 'jumping', 'policy', 'trainedPolicy', 'queuedPolicy', 'tuning', 'learning', 'queuedLearning', 'plan']);
    if (v.drive !== undefined && typeof v.drive !== 'boolean') throw new Error('Invalid AI Drive state.');
    if (typeof v.tick !== 'number' || !Number.isSafeInteger(v.tick) || v.tick < 0 || typeof v.guard !== 'boolean' || typeof v.tech !== 'boolean' || !Array.isArray(v.queue) || v.queue.length > 32) throw new Error('Invalid combat AI memory.');
    function vector(value: unknown): CombatVector {
      const v = object(value);
      keys(v, ['x', 'y', 'z']);
      const read = (key: string) => { const n = v[key]; if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1) throw new Error('Invalid combat AI direction.'); return n; };
      return { x: read('x'), y: read('y'), z: read('z') };
    }
    const queued = v.queuedPolicy === undefined ? undefined : object(v.queuedPolicy);
    if (queued) keys(queued, ['policy']);
    const pending = queued ? readCombatAiPolicy(queued.policy) : undefined;
    const queuedPolicy = queued ? pending ? { policy: pending } : {} : undefined;
    const queue = v.queue.map((raw): CombatAiAction3D => {
      const action = object(raw), input = object(action.input);
      keys(action, ['direction', 'jump', 'dash', 'sprint', 'input']); keys(input, ['fighterId', 'pressed', 'held', 'guard', 'tech', 'drive', 'airborne', 'direction']);
      if (typeof input.fighterId !== 'string' || !input.fighterId || input.fighterId.length > 128 || typeof action.jump !== 'boolean' || typeof action.dash !== 'boolean' || typeof action.sprint !== 'boolean') throw new Error('Invalid combat AI action.');
      if (!Array.isArray(input.pressed) || input.pressed.length > 32) throw new Error('Invalid combat AI commands.');
      const pressed = input.pressed.map(key => { if (typeof key !== 'string' || !key || key.length > 128) throw new Error('Invalid combat AI command.'); return key; });
      if (input.held !== undefined && (!Array.isArray(input.held) || input.held.length > 32 || input.held.some(key => typeof key !== 'string' || !key || key.length > 128))) throw new Error('Invalid combat AI held commands.');
      const boolean = (key: string) => { const b = input[key]; if (b !== undefined && typeof b !== 'boolean') throw new Error('Invalid combat AI input.'); return b; };
      return { direction: vector(action.direction), jump: action.jump, dash: action.dash, sprint: action.sprint,
        input: { fighterId: input.fighterId, pressed, ...(input.held === undefined ? {} : { held: [...input.held] }), guard: boolean('guard'), tech: boolean('tech'), ...(input.drive === undefined ? {} : { drive: boolean('drive') }), airborne: boolean('airborne'), ...(input.direction === undefined ? {} : { direction: vector(input.direction) }) } };
    });
    return readCombatAiMemory3D({ ...(v.plan === undefined ? {} : { plan: readPlan(v.plan) }), ...(v.learning === undefined ? {} : { learning: readLearning(v.learning) }), ...(v.queuedLearning === undefined ? {} : { queuedLearning: readLearning(v.queuedLearning) }), tuning: readCombatAiTuning(v.tuning), ...(queuedPolicy ? { queuedPolicy } : {}), ...(v.trainedPolicy === undefined ? {} : { trainedPolicy: readCombatAiPolicy(v.trainedPolicy) }), policy: readPolicy(v.policy), jumping: readJumping(v.jumping), ...(v.personality === undefined ? {} : { personality: readPersonality(v.personality) }), tactics: readTactics(v.tactics), tick: v.tick, guard: v.guard, tech: v.tech, drive: v.drive === true, queue, ...(v.navigation === undefined ? {} : { navigation: readCombatTraversalPlan(v.navigation) }) });
  }
  return {
    queuePolicy(options: { policy?: CombatAiPolicy }) { const policy = readCombatAiPolicy(options.policy);memory.queuedPolicy = policy ? { policy } : {}; },
    queueLearning(options: { model?: CombatAiLearning }) { memory.queuedLearning = readLearning(options.model); },
    get hasQueuedPolicy() { return !!memory.queuedPolicy; },
    get policyId() { return memory.trainedPolicy?.id; },
    get hasProfile() { return !!memory.personality; },
    get hasLearningConfiguration() { return !!memory.tuning || !!memory.learning || !!memory.queuedLearning; },
    get adaptive() { return memory.tuning?.mode === 'adaptive'; },
    step(options: CombatAiObservation) {
      if (!Number.isInteger(options.difficulty) || options.difficulty < 1 || options.difficulty > 9) throw new Error('AI difficulty must be 1–9.');
      const delay = (9 - options.difficulty) * 3;
      const distance = hypot(options.targetBody.x - options.body.x, options.targetBody.z - options.body.z);
      const targetHealth = options.state.fighters.find(fighter => fighter.id === options.targetId)?.health ?? 0;
      observeJumping(memory.jumping, memory.tick, options.grounded, options.body, distance, targetHealth);
      if (memory.tick < memory.jumping.retryAt) delete memory.navigation;
      timer.begin();
      let decision: CombatAiAction3D;
      try { decision = decide(options); } finally { timer.end(); }
      if (memory.personality) observePersonality(memory.personality, { state: options.state, fighterId: options.fighterId, targetId: options.targetId,
        distance: hypot(options.targetBody.x - options.body.x, options.targetBody.z - options.body.z), moving: hypot(decision.direction.x, decision.direction.z) > .1, collision: options.collision });
      // JSON checkpoints cannot retain IEEE negative zero from pursuit vectors.
      decision.direction = canonicalDirection(decision.direction);
      if (decision.input.direction) decision.input.direction = canonicalDirection(decision.input.direction);
      memory.queue.push(decision);
      const result = memory.queue.length > delay ? memory.queue.shift()! : idle(options.fighterId);
      while (memory.queue.length > delay) memory.queue.shift();
      if (result.jump) {
        if (canJump(memory.jumping, memory.tick, options.body, !!options.wall)) recordJump(memory.jumping, memory.tick, options.body, distance, targetHealth);
        else result.jump = false;
      }
      memory.guard = result.input.guard ?? false; memory.tech = result.input.tech ?? false; memory.drive = result.input.drive ?? false; memory.tick++;
      const observed = moves.get(options.state.fighters.find(fighter => fighter.id === options.fighterId)?.moveId ?? '');
      const loggingStarted = profile ? performance.now() : 0;
      outcomes.choice({ attackMove: observed && (observed.damage > 0 || observed.impulse > 0) ? observed.id : undefined, state: options.state, level: options.difficulty, fighter: options.fighterId, target: options.targetId, action: result, heldWeapon: options.weapons?.find(item => item.owner === options.fighterId)?.lightMoveId });
      if (profile) profile('logging', performance.now() - loggingStarted);
      return result;
    },
    capture({ compactLearning: compact = false }: { compactLearning?: boolean } = {}) {
      return structuredClone(compact && memory.learning ? { ...memory, learning: compactLearning(memory.learning) } : memory);
    }, validate,
    learning() { return memory.learning ? structuredClone(memory.learning) : undefined; },
    startLearningEvidence() { collectingEvidence = trackEvidence();return collectingEvidence; },
    learningEvidence() { return memory.learning ? captureLearningEvidence(memory.learning) : undefined; },
    finishLearningEvidence() {
      if (memory.learning && memory.tuning?.mode === 'adaptive' && memory.tuning.adaptation !== false && !memory.tuning.learningFrozen) resetLearning(memory.learning, { round: true });
      return { learning: memory.learning ? structuredClone(memory.learning) : undefined, evidence: memory.learning ? captureLearningEvidence(memory.learning) : undefined };
    },
    restoreLearning(options: { value: unknown; opponentId?: string; newOpponent?: boolean }) { const learning = readLearning(options.value);resetLearning(learning, { opponentId: options.opponentId, newOpponent: options.newOpponent, round: true, retainPartial: memory.tuning?.mode === 'adaptive' && memory.tuning.adaptation !== false && !memory.tuning.learningFrozen });memory.learning = learning;if (collectingEvidence) collectingEvidence = trackEvidence();delete memory.plan; },
    preferences() { return personalityWeights(memory.personality ?? initialPersonality({ fighterId: '' })); },
    observe(options: { state: CombatSnapshot; events: readonly CombatEvent[]; fighterId: string; targetId: string }) {
      if (memory.personality) observeEvents(memory.personality, options);
      if (memory.learning && memory.tuning?.mode === 'adaptive' && memory.tuning.adaptation !== false && !memory.tuning.learningFrozen) resolveLearning(memory.learning, options);
    },
    outcomes,
    restore(value: unknown) { memory = validate(value);if (collectingEvidence) collectingEvidence = trackEvidence();outcomes.boundary('restore', 'restored'); },
    reset({ round = false }: { round?: boolean } = {}) {
      const personality = round ? memory.personality : undefined;
      if (personality) resetPersonalityRound(personality);
      const tactics = initialTactics();
      if (round && memory.tactics.seeded) { tactics.seeded = true;tactics.random = memory.tactics.random; }
      const policy = !round && memory.queuedPolicy ? memory.queuedPolicy.policy : memory.trainedPolicy;
      if (!round && memory.queuedLearning) memory.learning = memory.queuedLearning;
      if (memory.learning) resetLearning(memory.learning, { round: true, retainPartial: memory.tuning?.mode === 'adaptive' && memory.tuning.adaptation !== false && !memory.tuning.learningFrozen });
      memory = { ...(memory.learning ? { learning: memory.learning } : {}), ...(round && memory.queuedLearning ? { queuedLearning: memory.queuedLearning } : {}), ...(memory.tuning ? { tuning: memory.tuning } : {}), ...(round && memory.queuedPolicy ? { queuedPolicy: memory.queuedPolicy } : {}), ...(policy ? { trainedPolicy: policy } : {}), policy: initialPolicy(), jumping: initialJumping(), ...(personality ? { personality } : {}), tick: 0, queue: [], guard: false, tech: false, drive: false, tactics };outcomes.boundary(round ? 'round-reset' : 'match-reset');
    },
  };
}
