export type SimulationTrial<Result> = { step(): Result | undefined; dispose(): void };
export type SimulationTrialOutcome<Result> = { index: number; seed: number; ticks: number } & (
  | { status: 'completed'; result: Result }
  | { status: 'capped' }
);

/** Portable fixed-tick trials. Hosts own scheduling; adapters own simulation and results. */
export function createSimulationBatch<Result>(options: {
  seed?: number;
  seedStride?: number;
  maxTrialTicks?: number;
  createTrial(options: { index: number; seed: number }): SimulationTrial<Result>;
  onTrial?(outcome: SimulationTrialOutcome<Result>): void;
}) {
  const { seed = 0, seedStride = 1, maxTrialTicks = 36_000 } = options;
  if ((seed >>> 0) !== seed || (seedStride >>> 0) !== seedStride || !seedStride || !Number.isSafeInteger(maxTrialTicks) || maxTrialTicks < 1) throw new RangeError('Invalid seed, stride or limit.');
  let active: SimulationTrial<Result> | undefined;
  let status: 'active' | 'failed' | 'disposed' = 'active';
  let ticks = 0, trialTicks = 0, completed = 0, capped = 0, currentSeed = seed;
  function release() { const trial = active;active = undefined;trial?.dispose(); }
  function start() {
    const index = completed + capped;
    currentSeed = (seed + Math.imul(index, seedStride)) >>> 0;trialTicks = 0;
    active = options.createTrial({ index, seed: currentSeed });
    return active;
  }
  function progress() { return { status, ticks, trialTicks, completed, capped, seed: currentSeed }; }
  start();
  return {
    progress,
    advance({ ticks: count }: { ticks: number }) {
      if (status !== 'active') throw Error(`Batch ${status}.`);
      if (!Number.isInteger(count) || count < 1 || count > 600) throw new RangeError('advance: 1–600 ticks.');
      try {
        for (let tick = 0; tick < count; tick++) {
          const trial = active ?? start();
          const result = trial.step();ticks++;trialTicks++;
          if (result !== undefined || trialTicks === maxTrialTicks) {
            const identity = { index: completed + capped, seed: currentSeed, ticks: trialTicks };
            if (result !== undefined) { completed++;options.onTrial?.({ ...identity, status: 'completed', result }); }
            else { capped++;options.onTrial?.({ ...identity, status: 'capped' }); }
            release();
          }
          if (status !== 'active') break;
        }
      } catch (error) {
        status = 'failed';
        try { release(); } catch { /* Preserve the simulation's original failure. */ }
        throw error;
      }
      return progress();
    },
    dispose() { if (status === 'disposed') return;status = 'disposed';release(); },
  };
}
