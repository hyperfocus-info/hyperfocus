/** Presentation-only history. Simulation-time sampling makes capture and live play agree. */
export function createCutawayFade() {
  const values = new Map<string, { opacity: number; time: number; blockedAt: number }>();
  return {
    reset() { values.clear(); },
    sample(id: string, target: number, time: number) {
      let value = values.get(id);
      if (!value || time < value.time || time - value.time > .25) {
        value = { opacity: target, time, blockedAt: target < 1 ? time : -Infinity }; values.set(id, value); return target;
      }
      const elapsed = time - value.time;
      if (target < value.opacity || target === value.opacity && target < 1) value.blockedAt = time;
      if (target <= value.opacity || time - value.blockedAt >= .12) {
        const duration = target < value.opacity ? .08 : .24;
        value.opacity += Math.max(-elapsed / duration, Math.min(elapsed / duration, target - value.opacity));
      }
      value.time = time;
      return value.opacity;
    },
  };
}
