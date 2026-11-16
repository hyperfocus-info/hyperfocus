import type { CombatEvent, CombatSnapshot } from '../../../combat/state.ts';
import { hypot } from '../../../math/simulation.ts';

const BASE_INTENSITY = .15, UPDATE_FRAMES = 30, HYSTERESIS = .075;

/** Presentation-only urgency: quick attack, slower release, half-second publication. */
export function createCombatMusicIntensity(options: { maxHealth: number }) {
  const initial = () => ({ frame: -1, emittedAt: -1, value: BASE_INTENSITY, published: BASE_INTENSITY, pulse: 0, combo: 0, contactAt: -1, attacker: '', target: '' });
  let memory = initial();
  function step(state: CombatSnapshot, events: readonly CombatEvent[]) {
    if (state.frame <= memory.frame) return;
    const delta = memory.frame < 0 ? 1 : Math.min(30, state.frame - memory.frame);
    memory.frame = state.frame;
    if (memory.emittedAt < 0) memory.emittedAt = state.frame;
    memory.pulse = Math.max(0, memory.pulse - .004 * delta);
    if (state.frame - memory.contactAt > 90) memory.combo = 0;
    for (const event of events) {
      if (event.defenseReason === 'out-of-bounds') continue;
      if (event.kind === 'hit' && event.damage > 0) {
        memory.pulse = Math.min(.3, memory.pulse + (event.environmentId ? .04 : .08) + Math.min(.05, event.damage / options.maxHealth * .2));
        if (!event.environmentId) {
          memory.combo = memory.attacker === event.attackerId && memory.target === event.targetId && state.frame - memory.contactAt <= 90 ? Math.min(4, memory.combo + 1) : 1;
          memory.attacker = event.attackerId;memory.target = event.targetId;memory.contactAt = state.frame;
        }
      } else if (event.kind === 'block' || event.kind === 'parry' || event.kind === 'guard-break') memory.pulse = Math.min(.3, memory.pulse + .035);
    }
    let danger = 0, pressure = 0, distance = Infinity;
    for (const fighter of state.fighters) {
      danger = Math.max(danger, 1 - Math.max(0, Math.min(1, fighter.health / options.maxHealth)));
      const acting = fighter.moveId ? .1 : 0, recoil = fighter.stunFrames > 0 ? .1 : 0;
      pressure = Math.max(pressure, acting + recoil + (fighter.guarding ? .05 : 0));
      for (const other of state.fighters) if (fighter.id < other.id) distance = Math.min(distance, hypot(fighter.position.x - other.position.x, fighter.position.y - other.position.y, fighter.position.z - other.position.z));
    }
    const proximity = Math.max(0, 1 - distance / 8) * .08;
    const target = Math.min(1, BASE_INTENSITY + danger * .4 + pressure + proximity + memory.pulse + Math.max(0, memory.combo - 1) * .05);
    // Finite tick coefficients avoid timers and preserve exact checkpoint replay.
    const smoothing = Math.min(1, delta * (target > memory.value ? .08 : .012));
    memory.value += (target - memory.value) * smoothing;
    if (state.frame - memory.emittedAt < UPDATE_FRAMES || Math.abs(memory.value - memory.published) < HYSTERESIS) return;
    memory.published = Math.round(memory.value * 20) / 20;memory.emittedAt = state.frame;
    return memory.published;
  }
  return { step, value: () => memory.published,
    /** A phase command already carries the current value; restart the update cooldown. */
    emitted() { memory.emittedAt = memory.frame; },
    capture: () => ({ ...memory }), restore(saved: ReturnType<typeof initial>) { memory = { ...saved }; }, reset() { memory = initial(); },
  };
}

/** Higher urgency selects energy, while slightly lowering level to leave room for cues. */
export function combatMusicIntensityGain(intensity: number) { return 1 - Math.max(0, intensity - BASE_INTENSITY) * .15; }
