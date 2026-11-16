import { expect, test } from 'bun:test';
import { runPairedBenchmarkLane } from './lane';
import { measurement } from './fixtures';
import type { BenchmarkLease } from './contracts';

function fixture() {
  const lease: BenchmarkLease = { resourceId: 'benchmark-worker', ownerId: 'swarm', fence: 1, expiresAt: Date.now() + 10000 };
  const operations: string[] = [];
  return { operations, options: {
    correctness: { passed: true, artifactIds: ['tests'], blockers: [] }, sessions: 1, pairsPerSession: 2,
    leases: {
      acquire: async () => { operations.push('acquire'); return lease; },
      renew: async () => lease,
      assertHeld: async () => {},
      release: async () => { operations.push('release'); },
    },
    beginSession: async () => { operations.push('session'); },
    measure: async ({ side, pair }: { side: string; pair: number }) => {
      operations.push(side);
      return measurement({ id: `${pair}-${side}`, revision: side });
    },
    persistTrial: async () => { operations.push('persist'); },
  } };
}

test('holds one lease across serial ABBA and preserves every trial before proceeding', async () => {
  const { options, operations } = fixture();
  const pairs = await runPairedBenchmarkLane(options);
  expect(pairs).toHaveLength(2);
  expect(operations).toEqual(['acquire', 'session', 'baseline', 'persist', 'candidate', 'persist', 'candidate', 'persist', 'baseline', 'persist', 'release']);
});

test('failed correctness prevents provisioning measurement resources', async () => {
  const { options, operations } = fixture(); options.correctness.passed = false;
  await expect(runPairedBenchmarkLane(options)).rejects.toThrow('Correctness');
  expect(operations).toEqual([]);
});

test('lease loss aborts the active measurement and waits for its process cleanup before release', async () => {
  const { options, operations } = fixture();
  options.leases.renew = async () => { throw new Error('lease lost'); };
  await expect(runPairedBenchmarkLane({ ...options, heartbeatMs: 1,
    measure: async ({ signal }) => {
      await new Promise<void>(resolve => signal.addEventListener('abort', () => { operations.push('remote-stopped'); resolve(); }, { once: true }));
      signal.throwIfAborted();
      return measurement({ id: 'unreachable' });
    },
  })).rejects.toThrow('lease lost');
  expect(operations.at(-2)).toBe('remote-stopped');
  expect(operations.at(-1)).toBe('release');
});

test('lease renewal carries forward the latest expiry while retaining ownership and fence', async () => {
  const { options } = fixture();
  let latest: BenchmarkLease | undefined, renewals = 0;
  let ready: () => void = () => {};
  const renewedTwice = new Promise<void>(resolve => { ready = resolve; });
  await runPairedBenchmarkLane({ ...options, heartbeatMs: 1, trialTimeoutMs: 1000,
    leases: { ...options.leases,
      acquire: async () => { latest = await options.leases.acquire(); return latest; },
      renew: async value => {
        expect(value).toEqual(latest!);
        latest = { ...value, expiresAt: value.expiresAt + 1000 };
        if (++renewals === 2) ready();
        return latest;
      },
    },
    measure: async ({ pair, side, signal }) => {
      await Promise.race([renewedTwice, new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))]);
      signal.throwIfAborted();
      return measurement({ id: `${pair}-${side}` });
    },
  });
  expect(renewals).toBeGreaterThanOrEqual(2);
});

test('timeout and cancellation preserve completed partial evidence and release ownership', async () => {
  const { options, operations } = fixture();
  await expect(runPairedBenchmarkLane({ ...options, trialTimeoutMs: 5,
    measure: async ({ side, signal }) => {
      if (side === 'baseline') return measurement({ id: 'baseline' });
      await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
      signal.throwIfAborted();
      return measurement({ id: 'unreachable' });
    },
  })).rejects.toThrow('timed out');
  expect(operations).toContain('persist');
  expect(operations.at(-1)).toBe('release');
  const cancelled = fixture(), controller = new AbortController(); controller.abort(new Error('cancelled'));
  await expect(runPairedBenchmarkLane({ ...cancelled.options, signal: controller.signal })).rejects.toThrow('cancelled');
  expect(cancelled.operations).toEqual([]);
});

test('stale worker receipts fail even when a provider returns success', async () => {
  const { options, operations } = fixture();
  await expect(runPairedBenchmarkLane({ ...options, measure: async () => {
    const result = measurement({ id: 'wrong-owner' }); result.environment.leaseFence = 8; return result;
  } })).rejects.toThrow('exclusively leased');
  expect(operations.at(-1)).toBe('release');
});
