import { describe, expect, test } from 'bun:test';
import { createSimulationMailbox } from './mailbox.ts';

describe('persistent simulation mailbox', () => {
  test('fractional 60 Hz boundaries do not lose ticks through clock subtraction rounding', () => {
    const stepMs=16.666666666666668;
    for(const origin of [0,100000,1e9]){
      const mailbox=createSimulationMailbox({input:0,nowMs:origin,stepMs,maxCatchUpMs:250,maxEvents:1,advance(){}});
      expect(mailbox.advance(origin).steps).toBe(0);
      for(let frame=1;frame<=600;frame++)expect(mailbox.advance(origin+frame*stepMs).steps).toBe(1);
      expect(mailbox.snapshot().accumulatorMs).toBeGreaterThanOrEqual(0);
    }
    const before=createSimulationMailbox({input:0,nowMs:0,stepMs,maxCatchUpMs:250,maxEvents:1,advance(){}});
    expect(before.advance(stepMs-1e-5).steps).toBe(0);
    expect(before.advance(stepMs).steps).toBe(1);
    expect(before.advance(stepMs+1000).steps).toBe(15);
  });
  test('distinguishes pending samples from the input applied to the simulated state', () => {
    const mailbox = createSimulationMailbox({ input: 0, nowMs: 0, stepMs: 10, maxCatchUpMs: 30, maxEvents: 1, advance() {} });
    mailbox.offer({ sequence: 1, sampledAtMs: 2, input: 1, events: [] });
    expect(mailbox.advance(5).appliedSampledAtMs).toBeUndefined();
    expect(mailbox.advance(10)).toMatchObject({ appliedSequence: 1, appliedSampledAtMs: 2 });
    mailbox.offer({ sequence: 2, sampledAtMs: 12, input: 2, events: [] });
    expect(mailbox.advance(15)).toMatchObject({ sampledAtMs: 12, appliedSampledAtMs: 2 });
    expect(mailbox.advance(100, true)).toMatchObject({ steps: 0, appliedSampledAtMs: 2 });
    expect(mailbox.advance(110)).toMatchObject({ appliedSequence: 2, appliedSampledAtMs: 12 });
    expect(mailbox.snapshot().appliedSampledAtMs).toBe(12);
  });
  test('coalesces held state while preserving short taps in order, consuming each only once', () => {
    const ticks: unknown[] = [];
    const mailbox = createSimulationMailbox<number, string>({ input: 0, nowMs: 0, stepMs: 10, maxCatchUpMs: 30, maxEvents: 3, advance: (input, events) => ticks.push([input, [...events]]) });
    expect(mailbox.offer({ sequence: 1, sampledAtMs: 1, input: 1, events: ['press'] })).toBe(true);
    expect(mailbox.offer({ sequence: 2, sampledAtMs: 2, input: 0, events: ['release'] })).toBe(true);
    expect(mailbox.advance(5).appliedSequence).toBe(0);
    expect(mailbox.advance(25)).toMatchObject({ steps: 2, appliedSequence: 2, sampledAtMs: 2 });
    expect(ticks).toEqual([[0, ['press', 'release']], [0, []]]);
    expect(mailbox.snapshot()).toMatchObject({ pendingEvents: 0, accumulatorMs: 5 });
  });
  test('rejects stale and overflowing updates atomically, allowing event retry after consumption', () => {
    const ticks: unknown[] = [];
    const mailbox = createSimulationMailbox<number, number>({ input: 0, nowMs: 0, stepMs: 10, maxCatchUpMs: 30, maxEvents: 1, advance: (input, events) => ticks.push([input, [...events]]) });
    const next = { sequence: 2, sampledAtMs: 2, input: 2, events: [2] };
    expect(mailbox.offer({ ...next, sequence: 1, input: 1, events: [1] })).toBe(true);
    expect(mailbox.offer(next)).toBe(false);
    expect(mailbox.offer({ ...next, sequence: 1, events: [] })).toBe(false);
    mailbox.advance(10);
    expect(mailbox.offer(next)).toBe(true);
    mailbox.advance(20);
    expect(ticks).toEqual([[1, [1]], [2, [2]]]);
  });
  test('bounds catch-up and reports dropped time; paused time never catches up on resume', () => {
    let ticks = 0;
    const mailbox = createSimulationMailbox({ input: 0, nowMs: 0, stepMs: 10, maxCatchUpMs: 30, maxEvents: 1, advance: () => ticks++ });
    expect(mailbox.advance(100)).toMatchObject({ steps: 3, droppedMs: 70 });
    expect(mailbox.advance(1000, true).steps).toBe(0);
    expect(mailbox.advance(1010).steps).toBe(1);
    expect(ticks).toBe(4);
    expect(() => mailbox.advance(1009)).toThrow('monotonic');
    expect(() => mailbox.advance(NaN)).toThrow('monotonic');
  });
  test('fails closed after a partial simulation failure and after disposal', () => {
    const mailbox = createSimulationMailbox({ input: 0, nowMs: 0, stepMs: 10, maxCatchUpMs: 30, maxEvents: 1, advance: () => { throw Error('world failed'); } });
    expect(() => mailbox.advance(10)).toThrow('world failed');
    expect(() => mailbox.advance(20)).toThrow('stopped');
    expect(mailbox.offer({ sequence: 1, sampledAtMs: 1, input: 1, events: [] })).toBe(false);
    mailbox.dispose();expect(mailbox.snapshot().pendingEvents).toBe(0);
  });
  test('rejects invalid budgets before invoking the world', () => {
    for (const limits of [{ stepMs: 0 }, { maxCatchUpMs: 5 }, { maxEvents: 0 }, { nowMs: Infinity }]) {
      expect(() => createSimulationMailbox({ input: 0, nowMs: 0, stepMs: 10, maxCatchUpMs: 30, maxEvents: 1, advance() {}, ...limits })).toThrow('limits');
    }
  });
});
