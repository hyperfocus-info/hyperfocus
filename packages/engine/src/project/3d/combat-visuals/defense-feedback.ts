import type { CombatConfig } from '../../../combat/config.ts';
import { combatMoveDuration } from '../../../combat/combo/timing.ts';
import type { CombatEvent, CombatInput, CombatSnapshot } from '../../../combat/state.ts';
import { readDefenseFeedbackState3D } from './defense-feedback/snapshot.ts';

type Point = { x: number; y: number; z: number };
type Cue = { action: 'parry' | 'tech'; result: 'early' | 'late' | 'perfect'; frame: number; contactPoint?: Point; contactNormal?: Point };
type Attempt = { fighterId: string; kind: 'parry' | 'tech'; inputFrame: number; impactFrame?: number; timing: 'early' | 'late' | 'success' | 'unavailable' };
type Memory = { id: string; guard: boolean; tech: boolean; guardAt: number; techAt: number; hitAt: number; bounceAt: number; bouncePoint?: Point; bounceNormal?: Point; cue?: Cue; lastAttempt?: Attempt };

/** Timing diagnoses describe observed input/contact order, never guesses about player intent. */
export function createDefenseFeedback3D(options: { fighterIds: readonly string[]; config: CombatConfig }) {
  const fresh = (): Memory[] => options.fighterIds.map(id => ({ id, guard: false, tech: false, guardAt: -1000, techAt: -1000, hitAt: -1000, bounceAt: -1000 }));
  let memory = fresh();
  const recent = (now: number, then: number) => now >= then && now - then <= 12;
  return {
    reset() { memory = fresh(); },
    capture() { return structuredClone(memory); },
    validate(value: unknown): Memory[] {
      if (value === undefined) return fresh();
      if (!Array.isArray(value) || value.length !== options.fighterIds.length) throw new Error('Invalid defense feedback state.');
      for (const [i, raw] of value.entries()) {
        if (!raw || raw.id !== options.fighterIds[i] || typeof raw.guard !== 'boolean' || typeof raw.tech !== 'boolean') throw new Error('Invalid defense feedback fighter.');
        if (Object.keys(raw).some(key => !['id', 'guard', 'tech', 'guardAt', 'techAt', 'hitAt', 'bounceAt', 'bouncePoint', 'bounceNormal', 'cue', 'lastAttempt'].includes(key))) throw new Error('Unknown defense feedback field.');
        const attempt = raw.lastAttempt;
        if (attempt !== undefined && (!attempt || attempt.fighterId !== raw.id || !['parry', 'tech'].includes(attempt.kind) || !['early', 'late', 'success', 'unavailable'].includes(attempt.timing) || !Number.isSafeInteger(attempt.inputFrame) || attempt.inputFrame < 0 || (attempt.impactFrame !== undefined && (!Number.isSafeInteger(attempt.impactFrame) || attempt.impactFrame < 0)) || Object.keys(attempt).some(key => !['fighterId', 'kind', 'inputFrame', 'impactFrame', 'timing'].includes(key)))) throw new Error('Invalid defense attempt.');
        for (const key of ['guardAt', 'techAt', 'hitAt', 'bounceAt']) if (!Number.isSafeInteger(raw[key]) || raw[key] < -1000) throw new Error('Invalid defense feedback timing.');
        if (raw.cue && (!['parry', 'tech'].includes(raw.cue.action) || !['early', 'late', 'perfect'].includes(raw.cue.result) || !Number.isSafeInteger(raw.cue.frame) || raw.cue.frame < 0)) throw new Error('Invalid defense feedback cue.');
        if (raw.cue && Object.keys(raw.cue).some(key => !['action', 'result', 'frame', 'contactPoint', 'contactNormal'].includes(key))) throw new Error('Unknown defense feedback cue field.');
        for (const point of [raw.bouncePoint, raw.bounceNormal, raw.cue?.contactPoint, raw.cue?.contactNormal]) if (point !== undefined && (!point || Object.keys(point).some(key => !['x', 'y', 'z'].includes(key)) || ![point.x, point.y, point.z].every(Number.isFinite))) throw new Error('Invalid defense contact point.');
      }
      return readDefenseFeedbackState3D(value);
    },
    restore(value: Memory[]) { memory = structuredClone(value); },
    step(input: { before: CombatSnapshot; after: CombatSnapshot; inputs: readonly CombatInput[]; events: readonly CombatEvent[] }) {
      const frame = input.before.frame;
      for (const m of memory) {
        const fighter = input.before.fighters.find(f => f.id === m.id)!;
        const keys = input.inputs.find(i => i.fighterId === m.id);
        const guard = keys?.guard === true, tech = keys?.tech === true;
        const freshGuard = guard && !m.guard && keys?.guardFresh !== false, freshTech = tech && !m.tech;
        const cue = (action: Cue['action'], result: Cue['result'], contactPoint?: Point, contactNormal?: Point) => {
          m.cue = { action, result, frame, ...(contactPoint ? { contactPoint: { ...contactPoint } } : {}), ...(contactNormal ? { contactNormal: { ...contactNormal } } : {}) };
          const pressed = action === 'parry' ? m.guardAt : m.techAt;
          m.lastAttempt = { fighterId: m.id, kind: action, inputFrame: Math.max(0, pressed), impactFrame: result === 'late' ? action === 'parry' ? m.hitAt : m.bounceAt : frame, timing: result === 'perfect' ? 'success' : result };
        };
        const unavailable = (kind: Attempt['kind']) => { m.lastAttempt = { fighterId: m.id, kind, inputFrame: frame, timing: 'unavailable' }; };
        if (freshGuard) {
          const move = options.config.moves.find(move => move.id === fighter.moveId);
          const committed = move && fighter.moveFrame < combatMoveDuration(move, fighter);
          if (fighter.health <= 0 || committed || fighter.guardBrokenFrames > 1) unavailable('parry');
          else if (fighter.stunFrames > 1 && (fighter.stunKind === 'parry' || fighter.stunKind === 'hit' && !recent(frame, m.hitAt))) unavailable('parry');
          else { m.guardAt = frame;if (recent(frame, m.hitAt) && fighter.stunKind === 'hit' && fighter.stunFrames > 1) cue('parry', 'late'); }
        }
        // Combat decrements lockout before sampling; a value of one is eligible.
        // Rejected presses cannot refresh the accepted attempt or recolor its cue.
        if (freshTech) {
          if (fighter.health <= 0 || fighter.techLockoutFrames > 1) unavailable('tech');
          else { m.techAt = frame;if (recent(frame, m.bounceAt) && fighter.stunKind === 'hit') cue('tech', 'late', m.bouncePoint, m.bounceNormal); }
        }
        for (const event of input.events) {
          if (event.targetId !== m.id || event.environmentId) continue;
          if (event.kind === 'parry') cue('parry', 'perfect');
          if (event.kind === 'tech') cue('tech', 'perfect', event.contactPoint, event.contactNormal);
          if ((event.kind === 'block' || event.kind === 'guard-break') && frame - m.guardAt >= options.config.parryFrames && recent(frame, m.guardAt)) cue('parry', 'early');
          if (event.kind === 'hit' && !fighter.moveId && !fighter.guardBrokenFrames && fighter.stunKind !== 'hit') m.hitAt = frame;
          if (event.kind === 'bounce') {
            m.bounceAt = frame;
            if (event.contactNormal) m.bounceNormal = { ...event.contactNormal };
            else delete m.bounceNormal;
            if (event.contactPoint) m.bouncePoint = { ...event.contactPoint };
            else delete m.bouncePoint;
            if (frame - m.techAt >= (options.config.techWindowFrames ?? 4) && recent(frame, m.techAt)) cue('tech', 'early', m.bouncePoint, m.bounceNormal);
          }
        }
        m.guard = guard;m.tech = tech;
        if (m.cue && frame - m.cue.frame >= 42) delete m.cue;
        if (input.after.fighters.find(f => f.id === m.id)!.health <= 0) delete m.cue;
      }
    },
  };
}
