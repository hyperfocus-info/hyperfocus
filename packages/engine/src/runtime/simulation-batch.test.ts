import { expect, test } from 'bun:test';
import { createSimulationBatch, type SimulationTrialOutcome } from './simulation-batch.ts';

function fixture() {
  const outcomes: SimulationTrialOutcome<number>[] = [], released: number[] = [];
  const batch = createSimulationBatch({ seed: 13, seedStride: 8, maxTrialTicks: 5,
    createTrial({ seed, index }) {
      let ticks = 0;
      return { step() { ticks++;return index % 2 === 0 && ticks === 3 ? seed : undefined; }, dispose() { released.push(seed); } };
    }, onTrial(outcome) { outcomes.push(outcome); },
  });
  return { batch, outcomes, released };
}

test('batch chunks produce identical seeded trials, capped trials and cleanup', () => {
  const a = fixture(), b = fixture();
  a.batch.advance({ ticks: 19 });for (let i = 0; i < 19; i++) b.batch.advance({ ticks: 1 });
  expect(a.batch.progress()).toEqual(b.batch.progress());
  expect(a.outcomes).toEqual(b.outcomes);
  expect(a.outcomes.map(trial => [trial.seed, trial.status, trial.ticks])).toEqual([[13, 'completed', 3], [21, 'capped', 5], [29, 'completed', 3], [37, 'capped', 5], [45, 'completed', 3]]);
  a.batch.dispose();a.batch.dispose();b.batch.dispose();expect(a.released).toEqual([13, 21, 29, 37, 45]);
});

test('batch instances isolate state and return detached progress', () => {
  const a = fixture(), b = fixture();a.batch.advance({ ticks: 2 });
  const captured = a.batch.progress();captured.ticks = 999;
  expect(a.batch.progress().ticks).toBe(2);expect(b.batch.progress().ticks).toBe(0);
  a.batch.dispose();b.batch.advance({ ticks: 3 });expect(b.outcomes).toHaveLength(1);b.batch.dispose();
  expect(() => a.batch.advance({ ticks: 1 })).toThrow('disposed');
});

test('trial errors close the batch and dispose its active trial exactly once', () => {
  let releases = 0;
  const batch = createSimulationBatch({ createTrial() { return { step() { throw Error('trial failed'); }, dispose() { releases++; } }; } });
  expect(() => batch.advance({ ticks: 2 })).toThrow('trial failed');
  expect(batch.progress().status).toBe('failed');expect(releases).toBe(1);
  expect(() => batch.advance({ ticks: 1 })).toThrow('failed');batch.dispose();expect(releases).toBe(1);
});

test('outcome callback failures release the trial and preserve the primary error', () => {
  let releases = 0;
  const batch = createSimulationBatch({ createTrial() { return { step() { return 0; }, dispose() { releases++;throw Error('cleanup failed'); } }; }, onTrial() { throw Error('sink failed'); } });
  expect(() => batch.advance({ ticks: 1 })).toThrow('sink failed');expect(releases).toBe(1);expect(batch.progress().status).toBe('failed');batch.dispose();
});

test('invalid bounds never create trials and invalid chunks leave an active trial unchanged', () => {
  let creates = 0;
  const createTrial = () => { creates++;return { step() { return undefined; }, dispose() {} }; };
  expect(() => createSimulationBatch({ createTrial, seed: -1 })).toThrow('seed');
  expect(() => createSimulationBatch({ createTrial, seedStride: 0 })).toThrow(RangeError);
  expect(() => createSimulationBatch({ createTrial, maxTrialTicks: 0 })).toThrow(RangeError);expect(creates).toBe(0);
  const batch = createSimulationBatch({ createTrial });
  for (const ticks of [0, -1, .5, 601, NaN]) expect(() => batch.advance({ ticks })).toThrow('advance');
  expect(batch.progress().ticks).toBe(0);batch.dispose();
});

test('a completion sink can dispose the batch without starting another trial', () => {
  let creates = 0, releases = 0;
  const batch = createSimulationBatch({ createTrial() { creates++;return { step() { return true; }, dispose() { releases++; } }; }, onTrial() { batch.dispose(); } });
  expect(batch.advance({ ticks: 10 })).toMatchObject({ status: 'disposed', ticks: 1, completed: 1 });
  expect(creates).toBe(1);expect(releases).toBe(1);
});
