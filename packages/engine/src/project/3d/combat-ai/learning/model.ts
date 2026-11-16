import { clampLowerFirst as clamp } from "@hyperfocus/utilities/math";
import type { CombatEvent, CombatFighterState, CombatSnapshot } from '../../../../combat/state.ts';
import { hypot } from '../../../../math/simulation.ts';
import type { TacticalCandidate } from '../policy/selection.ts';
import { GRAB_RELEASE_RECOVERY } from '../../combat-interaction/grabs/attempts.ts';
import { recordActionEvidence, recordHabitEvidence, recordLearningEviction, resetLearningEvidence } from './evidence.ts';
import { observeOutcomeFacts, startOutcomeAttempt, finishOutcomeAttempt } from './outcome-evidence.ts';

type Alternative = { id: string; score: number; probability: number | null };
type Trace = { frame: number; context: string; candidates: Alternative[]; omitted: number; chosen: string; probability: number; status: 'pending' | 'complete' | 'censored'; outcome: string; reward: number; move: string };
type Effectiveness = { context: string; action: string; samples: number; reward: number };
type Habit = { context: string; samples: number; guard: number; retreat: number; attack: number };
type Pending = { frame: number; context: string; action: string; move: string; serial: number; started: number; ended: number; deadline: number; reach: number; distance: number; x: number; z: number; dealt: number; received: number; contacts: number; parries: number; blocks: number; interrupted: boolean; armored: boolean };
export type LearningCandidate = TacticalCandidate & { probability?: number; reach?: number; priority?: boolean; observedMoveId?: string };

export function initialLearning({ opponentId = '' }: { opponentId?: string } = {}) {
  if (typeof opponentId !== 'string' || opponentId.length > 128) throw Error('Invalid contextual opponent identity');
  const state: { actions: Effectiveness[]; habits: Habit[]; traces: Trace[]; pending: Pending | null; next: Pending | null } = {
    actions: [], habits: [], traces: [], pending: null, next: null,
  };
  const eventIds: string[] = [];
  return { version: 1 as const, opponentId, ...state,
    transient: { frame: -1, serial: -1, habitFrame: -1, distance: 0, x: 0, z: 0, eventIds } };
}
export type CombatAiLearning = ReturnType<typeof initialLearning>;


/** Visible animation commitment is a fact; without move metadata it is not a recovery prediction. */
export function learningContext(self: CombatFighterState, target: CombatFighterState, distance: number, targetGrounded = !target.wasAirborne) {
  return `${distance < 3 ? 'near' : 'far'}:${self.wasAirborne ? 'air' : 'ground'}:${targetGrounded ? 'ground' : 'air'}:${target.stunKind === 'hit' && target.stunFrames > 0 ? 'stunned' : target.guarding ? 'guard' : target.moveId ? 'committed' : 'neutral'}`;
}

/** Records the actual distribution supplied by the selector; absent alternative probabilities remain unknown. */
export function recordDecision(memory: CombatAiLearning, options: { frame: number; context: string; candidates: readonly LearningCandidate[]; chosen: LearningCandidate; probability: number; deliveryDelay?: number }) {
  const { frame, context, candidates, chosen, probability } = options;
  if (!Number.isSafeInteger(frame) || frame < 0 || !validContext(context) || chosen.id.length > 160 || !candidates.some(c => c.id === chosen.id)
    || !Number.isFinite(probability) || probability < 0 || probability > 1 || candidates.length > 320
    || options.deliveryDelay !== undefined && (!Number.isFinite(options.deliveryDelay) || options.deliveryDelay < 0)
    || chosen.reach !== undefined && (!Number.isFinite(chosen.reach) || chosen.reach < 0)
    || chosen.observedMoveId !== undefined && (!chosen.observedMoveId || chosen.observedMoveId.length > 128)) throw Error('Invalid contextual decision');
  const ids = new Set<string>();let knownTotal = 0, allKnown = true;
  for (const candidate of candidates) {
    if (!candidate.id || candidate.id.length > 160 || ids.has(candidate.id) || !Number.isFinite(candidate.score)
      || candidate.probability !== undefined && (!Number.isFinite(candidate.probability) || candidate.probability < 0 || candidate.probability > 1)) throw Error('Invalid contextual alternatives');
    ids.add(candidate.id);
    if (candidate.probability === undefined && candidate.id !== chosen.id) allKnown = false;
    else knownTotal += candidate.probability ?? probability;
    if (candidate.id === chosen.id && candidate.probability !== undefined && candidate.probability !== probability) throw Error('Invalid contextual chosen probability');
  }
  if (knownTotal > 1.000001 || allKnown && Math.abs(knownTotal - 1) > .000001) throw Error('Invalid contextual probability distribution');
  const alternatives = candidates.slice(0, 64).map(c => ({ id: c.id, score: c.score, probability: c.probability ?? (c.id === chosen.id ? probability : null) }));
  // Keep the selected action visible even if a very large authored move set requires truncation.
  if (!alternatives.some(c => c.id === chosen.id)) alternatives[63] = { id: chosen.id, score: chosen.score, probability };
  memory.traces.push({ frame, context, candidates: alternatives, omitted: Math.max(0, candidates.length - 64), chosen: chosen.id, probability, status: 'pending', outcome: '', reward: 0, move: '' });
  if (memory.traces.length > 64) memory.traces.shift();
  if (memory.pending && (memory.pending.started >= 0 || frame <= memory.pending.deadline)) {
    if (memory.pending.started >= 0 && frame >= memory.pending.started && chosen.moveId) {
      censorNext(memory);memory.next = decisionAttempt(memory, options);
    } else memory.traces[memory.traces.length - 1]!.status = 'censored';
    return;
  }
  censor(memory);
  memory.pending = decisionAttempt(memory, options);
}

function decisionAttempt(memory: CombatAiLearning, options: Parameters<typeof recordDecision>[1]): Pending {
  const { frame, context, chosen } = options;
  const attempt = { frame, context, action: chosen.id, move: chosen.observedMoveId ?? chosen.moveId ?? '', serial: memory.transient.serial, started: -1, ended: -1,
    deadline: frame + clamp(options.deliveryDelay ?? 0, 0, 112) + (chosen.grapple ? 180 : 8), reach: chosen.reach ?? -1,
    distance: memory.transient.distance, x: memory.transient.x, z: memory.transient.z,
    dealt: 0, received: 0, contacts: 0, parries: 0, blocks: 0, interrupted: false, armored: false };
  if (!chosen.moveId && !chosen.grapple) { attempt.started = frame + clamp(options.deliveryDelay ?? 0, 0, 112);attempt.deadline = attempt.started + 12; }
  startOutcomeAttempt(memory, attempt);
  return attempt;
}

/** Committed public state only. Habits are sampled at most twice per simulated second. */
export function observeLearning(memory: CombatAiLearning, o: { state: CombatSnapshot; fighterId: string; targetId: string; distance: number; targetGrounded?: boolean; opponentId?: string; maxHealth?: number; maxStamina?: number }) {
  const self = o.state.fighters.find(f => f.id === o.fighterId), target = o.state.fighters.find(f => f.id === o.targetId);
  if (!self || !target) return;
  const frame = o.state.frame, opponentId = o.opponentId ?? o.targetId;
  if (memory.opponentId && memory.opponentId !== opponentId) resetLearning(memory, { opponentId, newOpponent: true });
  if (o.state.frame <= memory.transient.frame) return;
  const t = memory.transient;
  observeOutcomeFacts(memory, self, target, o.distance, o.maxHealth, o.maxStamina);
  memory.opponentId = opponentId;
  handoff(memory, self, target, frame, o.distance);
  attach(memory, self, target, frame, o.distance);
  if (frame - t.habitFrame >= 30) {
    const context = habitContext(learningContext(self, target, o.distance, o.targetGrounded));
    let row = memory.habits.find(r => r.context === context);
    const created = !row;
    if (!row) {
      if (memory.habits.length >= 16) { const old = memory.habits.shift()!;recordLearningEviction(memory, old.context); }
      row = { context, samples: 0, guard: 0, retreat: 0, attack: 0 };memory.habits.push(row);
    }
    for (const key of ['samples', 'guard', 'retreat', 'attack'] as const) row[key] *= .9;
    row.samples++;row.guard += Number(target.guarding);row.attack += Number(!!target.moveId);
    // Measure their public radial displacement. Our own retreat must not be
    // mistaken for an opponent habit merely because separation increased.
    const dx = target.position.x - self.position.x, dz = target.position.z - self.position.z;
    const radial = ((target.position.x - t.x) * dx + (target.position.z - t.z) * dz) / (o.distance || 1);
    const retreat = Number(t.frame >= 0 && radial > .015);
    row.retreat += retreat;recordHabitEvidence(memory, context, Number(target.guarding), retreat, Number(!!target.moveId), created);
    t.habitFrame = frame;t.distance = o.distance;
  }
  t.frame = frame;t.serial = self.attackSerial;t.x = target.position.x;t.z = target.position.z;
}

function handoff(memory: CombatAiLearning, self: CombatFighterState, target: CombatFighterState, frame: number, distance: number) {
  const next = memory.next;if (!next) return;
  if (frame > next.deadline) { censorNext(memory);return; }
  if (self.attackSerial === memory.transient.serial || self.attackSerial === next.serial || self.moveId !== next.move || frame - 1 < next.deadline - 8) return;
  retainObservedPartial(memory);censor(memory, true);
  memory.pending = next;memory.next = null;attach(memory, self, target, frame, distance);
}

function attach(memory: CombatAiLearning, self: CombatFighterState, target: CombatFighterState, frame: number, distance: number) {
  const p = memory.pending;
  if (!p || p.started >= 0 || frame > p.deadline || !p.move || !self.moveId || self.attackSerial === p.serial
    || self.attackSerial === memory.transient.serial || frame - 1 < p.deadline - 8) return;
  if (p.move && self.moveId !== p.move) { censor(memory);return; }
  // Simulation snapshots advance the frame after resolving contacts at frame - 1.
  p.move = self.moveId;p.serial = self.attackSerial;p.started = Math.max(p.frame, frame - 1);p.deadline = p.started + 180;
  p.distance = distance;p.x = target.position.x;p.z = target.position.z;
  const trace = pendingTrace(memory);if (trace) trace.move = p.move;
}

/** Feed post-step events before the next decision. Contacts earn at most one attempt's reward. */
export function resolveLearning(memory: CombatAiLearning, o: { state: CombatSnapshot; events: readonly CombatEvent[]; fighterId: string; targetId: string }) {
  const self = o.state.fighters.find(f => f.id === o.fighterId), target = o.state.fighters.find(f => f.id === o.targetId);
  if (!self || !target) { censor(memory);censorNext(memory);return; }
  handoff(memory, self, target, o.state.frame, hypot(self.position.x - target.position.x, self.position.z - target.position.z));
  attach(memory, self, target, o.state.frame, hypot(self.position.x - target.position.x, self.position.z - target.position.z));
  const p = memory.pending;if (!p) return;
  if (p.action === 'grapple' && p.started < 0) {
    const event = o.events.find(event => event.attackerId === o.fighterId && event.targetId === o.targetId && !event.environmentId
      && event.frame >= p.frame && event.frame <= p.deadline && ['grapple-teched', 'grapple-not-teched'].includes(event.defenseReason ?? ''));
    // Grapples use the interaction system, not attackSerial. These public outcomes
    // prove execution even when no attacker-visible grip observation was supplied.
    if (event) { p.started = event.frame;p.ended = event.frame;p.deadline = event.frame + 180; }
  }
  if (p.started < 0) { if (o.state.frame > p.deadline) censor(memory);return; }
  for (const event of o.events) {
    if (event.frame < p.started || event.frame > p.deadline || event.environmentId || memory.transient.eventIds.includes(event.id)) continue;
    memory.transient.eventIds.push(event.id);if (memory.transient.eventIds.length > 64) memory.transient.eventIds.shift();
    const belongs = p.move ? event.moveId === p.move : p.action === 'grapple' && ['grapple-teched', 'grapple-not-teched'].includes(event.defenseReason ?? '');
    if (event.attackerId === o.fighterId && event.targetId === o.targetId && belongs) {
      p.contacts++;p.dealt += Math.max(0, event.damage);p.parries += Number(event.kind === 'parry');p.blocks += Number(event.kind === 'block');
      if (p.action === 'grapple' && event.defenseReason === 'grapple-teched') p.parries++;
      p.armored ||= target.armorFrames > 0 && event.impulse.x === 0 && event.impulse.y === 0 && event.impulse.z === 0;
    }
    if (event.attackerId === o.targetId && event.targetId === o.fighterId) { p.received += Math.max(0, event.damage);p.interrupted ||= !!event.counter; }
  }
  // A zero-damage post-KO contact is not useful effectiveness evidence. Lethal
  // damage and received losing damage above remain valid observed outcomes.
  if ((target.health <= 0 || self.health <= 0) && p.dealt === 0 && p.received === 0) { censor(memory);return; }
  if (p.move && p.ended < 0 && (self.attackSerial !== p.serial || !self.moveId)) p.ended = o.state.frame;
  if (o.state.frame >= p.deadline && p.move && p.ended < 0) { censor(memory);censorNext(memory);return; }
  const recovery = p.action === 'grapple' && !p.parries ? GRAB_RELEASE_RECOVERY : 12;
  if (o.state.frame >= p.deadline || p.ended >= 0 && o.state.frame >= p.ended + recovery) finish(memory, target);
}

function finish(memory: CombatAiLearning, target: CombatFighterState) {
  const p = memory.pending;if (!p) return;
  const displaced = hypot(target.position.x - p.x, target.position.z - p.z) > .8;
  const outcome = p.action === 'grapple' && p.parries ? 'grapple-teched' : p.dealt > 0 ? p.armored ? 'hit-armored-observed' : 'hit' : p.parries ? 'parry' : p.blocks ? 'block' : p.contacts ? 'contact' : !p.move ? 'movement'
    : p.interrupted ? 'interruption-observed' : p.reach >= 0 && p.distance > p.reach ? 'range-predicted' : displaced ? 'displacement-predicted' : 'unknown-miss';
  const reward = clamp(p.dealt / 30 - p.received / 30 - Number(p.parries > 0) * .8 - Number(p.blocks > 0) * .15 - Number(!p.contacts && !!p.move) * .4, -1, 1);
  updateEvidence(memory, p, reward, 1);
  finishOutcomeAttempt(memory, p, 'complete', outcome, reward);
  const trace = pendingTrace(memory);
  if (trace) { trace.status = 'complete';trace.outcome = outcome;trace.reward = reward; }
  memory.pending = memory.next;memory.next = null;
}

function updateEvidence(memory: CombatAiLearning, p: Pending, reward: number, confidence: number) {
  const action = canonicalAction(p.action);
  let row = memory.actions.find(r => r.context === p.context && r.action === action);
  if (!row) {
    row = { context: p.context, action, samples: 0, reward: 0 };memory.actions.push(row);
  }
  row.samples += confidence;row.reward += reward * confidence;
  recordActionEvidence(memory, p.context, action, 1, confidence, reward * confidence);
}

/** Eight neutral prior attempts protect against a lucky hit; no untried action receives an outcome. */
export function learningAdjustment(memory: CombatAiLearning, context: string, candidate: LearningCandidate) {
  if (candidate.priority) return 0;
  const row = memory.actions.find(r => r.context === context && r.action === canonicalAction(candidate.id));
  let value = row ? 1.5 * row.reward / (row.samples + 8) : 0;
  const habit = memory.habits.find(r => r.context === habitContext(context));
  if (habit) {
    const guard = habit.guard / (habit.samples + 8), retreat = habit.retreat / (habit.samples + 8), attack = habit.attack / (habit.samples + 8);
    value += candidate.grapple ? guard * .5 : candidate.moveId ? -guard * .15 : 0;
    if (candidate.dash || candidate.sprint) value += retreat * .35;
    if (candidate.movement === 'away') value += attack * .25;
  }
  return clamp(value, -1.5, 1.5);
}

/** Confidence exists only for the context/action actually tried; eight prior attempts remain neutral. */
export function learningConfidence(memory: CombatAiLearning, context: string, actionId: string) {
  const row = memory.actions.find(r => r.context === context && r.action === canonicalAction(actionId));
  return row ? row.samples / (row.samples + 8) : 0;
}

function pendingTrace(memory: CombatAiLearning) {
  const p = memory.pending;return p ? memory.traces.find(t => t.frame === p.frame && t.chosen === p.action && t.status === 'pending') : undefined;
}
function habitContext(context: string) { return context.replace(/:(guard|committed|neutral|stunned)$/, ':neutral'); }
function canonicalAction(action: string) { return action.startsWith('forced:') ? `attack:${action.slice(7)}` : action; }
function censor(memory: CombatAiLearning, keepNext = false) {
  if (memory.pending) finishOutcomeAttempt(memory, memory.pending, 'censored', 'censored');
  const trace = pendingTrace(memory);if (trace) trace.status = 'censored';memory.pending = null;
  if (!keepNext) censorNext(memory);
}
function censorNext(memory: CombatAiLearning) {
  const next = memory.next;
  if (next) finishOutcomeAttempt(memory, next, 'censored', 'censored');
  if (next) { const trace = memory.traces.find(t => t.frame === next.frame && t.chosen === next.action && t.status === 'pending');if (trace) trace.status = 'censored'; }
  memory.next = null;
}

function retainObservedPartial(memory: CombatAiLearning) {
  const p = memory.pending;
  if (p && p.started >= 0 && (p.dealt > 0 || p.received > 0 || p.parries > 0 || p.blocks > 0)) {
    // The remaining punish window is unknown. Retain only the observed portion
    // with one quarter confidence; never turn an unfinished attempt into a miss.
    const reward = clamp(p.dealt / 30 - p.received / 30 - Number(p.parries > 0) * .8 - Number(p.blocks > 0) * .15, -1, 1);
    updateEvidence(memory, p, reward, .25);
    finishOutcomeAttempt(memory, p, 'partial', 'partial-contact', reward);
    const trace = pendingTrace(memory);if (trace) { trace.outcome = 'partial-contact';trace.reward = reward; }
  }
}

/** Boundaries retain discounted actual contact evidence and censor the unknown remainder. */
export function resetLearning(memory: CombatAiLearning, { opponentId, newOpponent = false, round = false, retainPartial = true }: { opponentId?: string; newOpponent?: boolean; round?: boolean; retainPartial?: boolean } = {}) {
  if (opponentId !== undefined && (typeof opponentId !== 'string' || opponentId.length > 128)) throw Error('Invalid contextual opponent identity');
  if (retainPartial) retainObservedPartial(memory);
  censor(memory);censorNext(memory);
  if (newOpponent || opponentId !== undefined && memory.opponentId !== opponentId) { memory.actions = [];memory.habits = [];memory.traces = [];resetLearningEvidence(memory); }
  if (opponentId !== undefined) memory.opponentId = opponentId;
  if (round || newOpponent || opponentId !== undefined) memory.transient = initialLearning().transient;
}

export function validContext(value: unknown): value is string {
  return typeof value === 'string' && /^(near|far):(ground|air):(ground|air):(guard|committed|neutral|stunned)$/.test(value);
}
