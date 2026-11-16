import { createCombatAiInsights } from './insights.ts';
import { createCombatAiExchanges } from './exchanges/recorder.ts';
import { hypot } from '../../../math/simulation.ts';
import type { CombatEvent, CombatSnapshot, CombatInput } from '../../../combat/state.ts';
import type { CombatAiAction3D } from '../combat-ai.ts';

type Choice = { frame: number; level: number; fighter: string; target: string; distance: number; height: number; stamina: number; health: number; selfMove: string; selfMoveFrame: number; selfStun: number; targetMove: string; targetMoveFrame: number; targetStun: number; weaponLightMove: string; action: CombatAiAction3D };
type Outcome = { frame: number; level: number; fighter: string; event: CombatEvent };
type Seat = { observations: number; choice?: Choice };
export type CombatAiReportContext = { mode: 'human-vs-ai' | 'theater' | 'practice' | 'online'; match: number; round: number; fighters: { id: string; type: 'human' | 'ai'; level?: number; traits?: Record<string, number>; policyId?: string }[] };
type Segment = { context?: CombatAiReportContext; insights: ReturnType<ReturnType<typeof createCombatAiInsights>['report']>; exchanges: ReturnType<ReturnType<typeof createCombatAiExchanges>['report']>; source: 'live' | 'restored'; cause: string; observedTicks: number; levels: number[]; counts: Record<string, number>; droppedChoices: number; droppedOutcomes: number };
/** Observations only: never read by policy, serialized into saves, or used as a win-rate estimate. */
export function createCombatAiOutcomes() {
  const insights = createCombatAiInsights(), exchanges = createCombatAiExchanges();
  const choices: Choice[] = [], outcomes: Outcome[] = [];
  const segments: Segment[] = [], levels = new Set<number>();
  const seats = new Map<string, Seat>();
  let counts: Record<string, number> = {}, source: Segment['source'] = 'live', droppedSegments = 0;
  let lastFrame = -1, observedTicks = 0, droppedChoices = 0, droppedOutcomes = 0;
  let context: CombatAiReportContext | undefined;
  function clear() { insights.clear();exchanges.clear();choices.length = outcomes.length = 0;seats.clear();lastFrame = -1;observedTicks = droppedChoices = droppedOutcomes = 0;counts = {};levels.clear(); }
  function boundary(cause: string, nextSource = source) {
    if (observedTicks || outcomes.length) {
      if (segments.length === 12) { segments.shift();droppedSegments++; }
      exchanges.boundary(cause);
      segments.push({ ...(context ? { context: structuredClone(context) } : {}), insights: insights.report(), exchanges: exchanges.report(), source, cause, observedTicks, levels: [...levels], counts: { ...counts }, droppedChoices, droppedOutcomes });
    }
    clear();source = nextSource;
  }
  return {
    clear,
    context(value: CombatAiReportContext) { context = structuredClone(value); },
    boundary,
    resumeLive() { if (source !== 'live') boundary('new-live-match', 'live'); },
    choice(input: { state: CombatSnapshot; level: number; fighter: string; target: string; action: CombatAiAction3D; heldWeapon?: string; attackMove?: string }) {
      if (input.state.frame < lastFrame) boundary('frame-rewind', 'restored');
      lastFrame = input.state.frame;observedTicks++;levels.add(input.level);
      const { action } = input;
      const self = input.state.fighters.find(f => f.id === input.fighter), target = input.state.fighters.find(f => f.id === input.target);
      if (!self || !target) return;
      exchanges.observe(input.state, input.fighter, input.attackMove);
      insights.observe(input.state.frame, self, target, action, input.attackMove);
      let seat = seats.get(self.id);
      if (!seat) { if (seats.size === 16) seats.delete(seats.keys().next().value!);seat = { observations: 0 };seats.set(self.id, seat); }
      seat.observations++;
      // Each fighter owns its heartbeat and last request, including in Theater.
      if (seat.choice?.level === input.level && seat.choice.target === target.id && sameAction(seat.choice.action, action) && seat.observations % 30 !== 0) return;
      if (choices.length === 256) { choices.shift();droppedChoices++; }
      const choice = { frame: input.state.frame, level: input.level, fighter: self.id, target: target.id,
        distance: hypot(target.position.x - self.position.x, target.position.z - self.position.z), height: target.position.y - self.position.y,
        stamina: self.stamina, health: self.health, selfMove: self.moveId, selfMoveFrame: self.moveFrame, selfStun: self.stunFrames,
        targetMove: target.moveId, targetMoveFrame: target.moveFrame, targetStun: target.stunFrames, weaponLightMove: input.heldWeapon ?? '', action: structuredClone(action) };
      choices.push(choice);seat.choice = choice;
    },
    resolve(input: { events: readonly CombatEvent[]; level: number; fighter: string }) {
      exchanges.resolve(input.events);
      for (const event of input.events) {
        if (event.attackerId !== input.fighter && event.targetId !== input.fighter) continue;
        insights.resolve(event, input.fighter);
        const role = event.attackerId === input.fighter ? 'attacker' : 'defender';
        const key = `AI${input.level}:${role}:${event.kind}`;counts[key] = (counts[key] ?? 0) + 1;
        if (outcomes.length === 256) { outcomes.shift();droppedOutcomes++; }
        outcomes.push({ frame: event.frame, level: input.level, fighter: input.fighter, event: structuredClone(event) });
      }
    },
    report() {
      return { version: 1, scope: 'Current segment detail plus the latest 12 completed segment summaries in this page session. Restored/rehearsal segments are labeled separately from live play.',
        interpretation: 'Delivered requests and resolved events are observations. Whiffs do not prove a bad decision. Drought reasons describe observed constraints, not inferred intent. Exchange endings distinguish recovery, escapes and censored evidence; they do not prove an avoidable drop. Exchange damage is deduplicated across seats. No learned balance adaptation.',
        ...(context ? { context: structuredClone(context) } : {}), insights: insights.report(), exchanges: exchanges.report(), source, segments: structuredClone(segments), droppedSegments, levels: [...levels], observedTicks, droppedChoices, droppedOutcomes, counts: { ...counts }, choices: structuredClone(choices), outcomes: structuredClone(outcomes) };
    },
  };
}

function sameVector(a: CombatInput['direction'], b: CombatInput['direction']) {
  return a === b || !!a && !!b && a.x === b.x && a.y === b.y && a.z === b.z;
}
function sameButtons(a: CombatInput['pressed'], b: CombatInput['pressed']) {
  return a === b || !!a && !!b && a.length === b.length && a.every((button, index) => button === b[index]);
}
/** Exact comparisons retain input precision without allocating a JSON string every tick. */
function sameAction(a: CombatAiAction3D, b: CombatAiAction3D) {
  const x = a.input, y = b.input;
  return a.jump === b.jump && a.dash === b.dash && a.sprint === b.sprint && sameVector(a.direction, b.direction)
    && x.fighterId === y.fighterId && sameButtons(x.pressed, y.pressed) && sameButtons(x.held, y.held)
    && x.guard === y.guard && x.guardFresh === y.guardFresh && x.tech === y.tech && x.dashing === y.dashing
    && x.dashStart === y.dashStart && x.drive === y.drive && x.airborne === y.airborne && x.idle === y.idle
    && x.locomotionCost === y.locomotionCost && sameVector(x.direction, y.direction) && sameVector(x.influenceDirection, y.influenceDirection);
}
