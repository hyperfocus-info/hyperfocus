import { cos, hypot, sin } from '../../../math/simulation.ts';
import type { CombatVector } from '../../../combat/config.ts';
import type { CombatSnapshot } from '../../../combat/state.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import type { CombatTimingFeedback } from './timing-rings.ts';

export type CombatLocomotionEvent = { fighterId: string; frame: number; kind: 'step' | 'jump' | 'land'; point: CombatVector; velocity: CombatVector; strength: number };

/** Fixed-tick cosmetic history. Duplicate render samples cannot retrigger landings or jumps. */
export function createCombatLocomotionEffects3D() {
  const previous = new Map<string, { grounded: boolean; position: CombatVector; speedY: number; nextStep: number }>();
  let events: CombatLocomotionEvent[] = [], lastFrame = -1;
  const capture = () => structuredClone({ previous: [...previous], events, lastFrame });
  return {
    /** Trusted local presentation state for rollback; not a portable save schema. */
    capture,
    restore(saved: ReturnType<typeof capture>) {
      const copy = structuredClone(saved);
      previous.clear();for (const [id, memory] of copy.previous) previous.set(id, memory);
      events = copy.events;lastFrame = copy.lastFrame;
    },
    get events(): readonly CombatLocomotionEvent[] { return events; },
    reset() { previous.clear(); events = []; lastFrame = -1; },
    step(options: { state: CombatSnapshot; grounded: ReadonlySet<string>; velocities: ReadonlyMap<string, CombatVector> }) {
      const { state, grounded, velocities } = options;
      if (state.frame === lastFrame) return;
      if (state.frame < lastFrame) { previous.clear(); events = []; }
      lastFrame = state.frame; events = events.filter(event => state.frame - event.frame < 24);
      for (const fighter of state.fighters) {
        const velocity = velocities.get(fighter.id) ?? { x: 0, y: 0, z: 0 };
        const speed = hypot(velocity.x, velocity.z), onFloor = grounded.has(fighter.id), old = previous.get(fighter.id);
        let kind: CombatLocomotionEvent['kind'] | undefined;
        if (old && fighter.health > 0) {
          if (old.grounded && !onFloor && velocity.y > 1) kind = 'jump';
          else if (!old.grounded && onFloor && old.speedY < -1) kind = 'land';
          else if (onFloor && speed > 3 && !fighter.stunFrames && state.frame >= old.nextStep) kind = 'step';
        }
        if (kind) {
          const position = kind === 'jump' ? old!.position : fighter.position;
          events.push({ fighterId: fighter.id, frame: state.frame, kind, point: { x: position.x, y: position.y - .96, z: position.z }, velocity: { ...velocity }, strength: kind === 'land' ? Math.min(1.8, .7 + Math.abs(old!.speedY) / 16) : kind === 'jump' ? 1 : Math.min(1.3, speed / 8) });
        }
        previous.set(fighter.id, { grounded: onFloor, position: { ...fighter.position }, speedY: velocity.y, nextStep: kind ? state.frame + (speed > 8 ? 6 : 10) : old?.nextStep ?? state.frame });
      }
      if (events.length > 12) events.splice(0, events.length - 12);
    },
  };
}

/** Three short world-anchored plumes share a twelve-particle pool per fighter. */
export function presentCombatLocomotion3D(options: { frame: Hyperfocus3DEvaluatedFrame; state: CombatSnapshot; locomotionEvents?: readonly CombatLocomotionEvent[]; reducedMotion?: boolean; timingFeedback?: readonly CombatTimingFeedback[] }) {
  const { frame, state } = options;
  for (const fighter of state.fighters) {
    const cue = options.timingFeedback?.find(item => item.id === fighter.id)?.cue;
    const techCue = cue?.action === 'tech' && state.frame >= cue.frame && state.frame - cue.frame < 30;
    const events = (options.locomotionEvents ?? []).filter(event => event.fighterId === fighter.id && state.frame - event.frame < 24).slice(-3).reverse();
    for (let index = 0; index < 12; index++) {
      const dust = frame.entities.find(entity => entity.id === `${fighter.id}:dust:${index}`);
      if (!dust) continue;
      const event = events[Math.floor(index / 4)], age = event ? state.frame - event.frame : 24;
      dust.visible = !!event && age >= 0 && age < (event.kind === 'step' ? 17 : 24) && (!options.reducedMotion || index % 4 < 2);
      if (techCue) dust.visible = false;
      if (!event || !dust.visible) continue;
      const t = age / (event.kind === 'step' ? 17 : 24), angle = (index % 4) * Math.PI / 2 + event.frame * .7;
      const spread = (.08 + t * (event.kind === 'land' ? .85 : .45)) * event.strength;
      dust.position = [event.point.x + cos(angle) * spread - event.velocity.x * t * .035, event.point.y + .025 + sin(t * Math.PI) * .2, event.point.z + sin(angle) * spread - event.velocity.z * t * .035];
      const size = (.055 + sin(t * Math.PI) * .10) * (1 - t) * event.strength;
      dust.scale = [size * 1.5, size * .65, size]; dust.rotation = [0, 0, 0, 1];
    }
  }
}
