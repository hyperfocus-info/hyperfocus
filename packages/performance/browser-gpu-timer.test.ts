import { expect, test } from 'bun:test';
import { createGpuTimer } from './browser-gpu-timer';

function fixture(supported = true, consumeDisjoint = false) {
  let disjoint = false, lost = false, available = false, elapsed = 2e6, resultReads = 0, deleted = 0;
  const gl = { QUERY_RESULT_AVAILABLE: 1, QUERY_RESULT: 2,
    getExtension: () => supported ? { GPU_DISJOINT_EXT: 3, TIME_ELAPSED_EXT: 4 } : null,
    getParameter: () => { const value = disjoint;if (consumeDisjoint) disjoint = false;return value; }, isContextLost: () => lost,
    createQuery: () => ({}), beginQuery() {}, endQuery() {}, deleteQuery() { deleted++; },
    getQueryParameter(_query: unknown, parameter: number) { if (parameter === 1) return available;resultReads++;return elapsed; },
  };
  const timer = createGpuTimer({ getContext: () => gl });
  return { timer, anotherTimer: () => createGpuTimer({ getContext: () => gl }), set(options: { disjoint?: boolean; lost?: boolean; available?: boolean; elapsed?: number }) {
    disjoint = options.disjoint ?? disjoint;lost = options.lost ?? lost;available = options.available ?? available;elapsed = options.elapsed ?? elapsed;
  }, reads: () => resultReads, deleted: () => deleted };
}

test('GPU queries never read an unavailable result and stay bounded during a stall', () => {
  const f = fixture(), rows: Record<string, unknown>[] = [];
  for (let index = 0; index < 9; index++) { const row = {};f.timer.begin();f.timer.end(row);rows.push(row); }
  expect(f.reads()).toBe(0);expect(rows[8]!.gpuQueryStatus).toBe('queue-full');expect(f.timer.statistics().pending).toBe(8);
  f.set({ available: true });f.timer.begin();f.timer.end({});
  expect(rows.slice(0, 8).every(row => row.gpuQueryStatus === 'valid' && row.gpuDrawMs === 2)).toBe(true);
  expect(f.reads()).toBe(8);f.timer.dispose();expect(f.deleted()).toBe(9);
});

test('one context disjoint invalidates every timer even after the flag is consumed', () => {
  const f = fixture(true, true), second = f.anotherTimer();
  const firstRow: Record<string, unknown> = {}, secondRow: Record<string, unknown> = {};
  f.timer.begin();f.timer.end(firstRow);second.begin();second.end(secondRow);
  f.set({ disjoint: true, available: true });
  f.timer.begin();f.timer.end({});
  // This read sees a cleared GL flag, but the pending query crossed the event.
  second.begin();second.end({});
  expect(firstRow.gpuQueryStatus).toBe('disjoint');expect(secondRow.gpuQueryStatus).toBe('disjoint');
  expect(firstRow.gpuDrawMs).toBeUndefined();expect(secondRow.gpuDrawMs).toBeUndefined();expect(f.reads()).toBe(0);
  const recovered: Record<string, unknown> = {};
  second.begin();second.end(recovered);second.begin();second.end({});
  expect(recovered.gpuQueryStatus).toBe('valid');expect(recovered.gpuDrawMs).toBe(2);
  f.timer.dispose();second.dispose();
});

test('GPU invalidation never leaves a fabricated duration', () => {
  for (const status of ['disjoint', 'context-lost', 'invalid-result', 'disposed'] as const) {
    const f = fixture(), row: Record<string, unknown> = {};f.timer.begin();f.timer.end(row);
    if (status === 'disposed') f.timer.dispose();
    else { f.set(status === 'disjoint' ? { disjoint: true } : status === 'context-lost' ? { lost: true } : { available: true, elapsed: NaN });f.timer.begin();f.timer.end({});f.timer.dispose(); }
    expect(row.gpuQueryStatus).toBe(status);expect(row.gpuDrawMs).toBeUndefined();
  }
  const f = fixture(false), row: Record<string, unknown> = {};f.timer.begin();f.timer.end(row);
  expect(row.gpuQueryStatus).toBe('unsupported');expect(f.reads()).toBe(0);f.timer.dispose();
});
