import { expect, test } from 'bun:test';
import { schedulingFixture } from './scheduling-fixture.ts';
import { createAudioQueue } from './queue.ts';

test('SFX queue bounds waiting/active work, shuffles without repeated takes and honors voice completion', async () => {
  const f = await schedulingFixture();for (const id of ['a', 'b', 'c']) f.cache(id);
  const queue = createAudioQueue({ engine: f.engine, concurrency: 1, capacity: 3 });
  const played: string[] = [];
  for (let i = 0; i < 12; i++) { expect(queue.enqueue({ assetIds: ['a', 'b', 'c'] })).toBeDefined();await f.flush();played.push(queue.snapshot().pending[0]!.assetId);f.sources.at(-1)!.end();await f.flush(); }
  expect(played.every((id, index) => !index || id !== played[index - 1])).toBe(true);expect(new Set(played).size).toBe(3);
  expect(queue.enqueue({ assetId: 'a' })).toBeDefined();expect(queue.enqueue({ assetId: 'b' })).toBeDefined();expect(queue.enqueue({ assetId: 'c' })).toBeDefined();expect(queue.enqueue({ assetId: 'a' })).toBeUndefined();
  queue.dispose();await f.flush();expect(queue.snapshot().pending).toEqual([]);expect(f.engine.activeVoiceCount()).toBe(0);
});

test('cancellation discards late loads, pause time does not expire waiting effects, failures release queue capacity', async () => {
  const f = await schedulingFixture();let complete: (() => void) | undefined;
  const queue = createAudioQueue({ engine: f.engine, concurrency: 1, capacity: 2, load: id => new Promise<void>(resolve => { complete = () => { f.cache(id);resolve(); }; }) });
  const id = queue.enqueue({ assetId: 'pending' })!;queue.cancel({ id });complete!();await f.flush();expect(f.sources).toHaveLength(0);
  queue.setPaused({ paused: true });f.cache('cached');queue.enqueue({ assetId: 'cached' });f.at(100);queue.setPaused({ paused: false });await f.flush();expect(f.sources).toHaveLength(1);
  const reason: string[] = [];queue.enqueue({ assetId: 'cached', play: { onEnded(value) { reason.push(value); } } });f.sources[0]!.end();await f.flush();f.sources[1]!.end();await f.flush();expect(reason).toEqual(['ended']);queue.dispose();
});

test('pending priority ordering, category caps and coalescing retain bounded independent feedback', async () => {
  const f = await schedulingFixture();for (const id of ['step', 'step2', 'ambient', 'hit']) f.cache(id);
  const started: string[] = [];
  const queue = createAudioQueue({ engine: { context: f.engine.context, isUnlocked: f.engine.isUnlocked, hasBuffer: f.engine.hasBuffer, playBuffer: f.engine.playBuffer }, concurrency: 3, categoryLimits: { steps: 1 }, onStart(request) { started.push(request.assetId); } });
  queue.setPaused({ paused: true });
  const step = queue.enqueue({ assetId: 'step', category: 'steps', coalesceKey: 'fighter', play: { priority: 1 } });
  expect(queue.enqueue({ assetId: 'step2', category: 'steps', coalesceKey: 'fighter', play: { priority: 10 } })).toBe(step);
  queue.enqueue({ assetId: 'step', category: 'steps', play: { priority: 5 } });queue.enqueue({ assetId: 'ambient', category: 'ambient', play: { priority: 0 } });queue.enqueue({ assetId: 'hit', category: 'impact', play: { priority: 50 } });
  queue.setPaused({ paused: false });await f.flush();expect(started).toEqual(['hit', 'step2', 'ambient']);expect(queue.snapshot().pending.filter(item => item.category === 'steps' && item.status === 'playing')).toHaveLength(1);
  expect(queue.enqueue({ assetId: 'step', category: 'steps', coalesceKey: 'fighter', play: { priority: 12 } })).toBe(step);expect(started).toHaveLength(3);
  f.sources[1]!.end();await f.flush();expect(started).toEqual(['hit', 'step2', 'ambient', 'step']);queue.dispose();expect(f.engine.activeVoiceCount()).toBe(0);
});

test('hosts without a context inject seconds for stale request dropping and local pause preserves waiting age', async () => {
  const f = await schedulingFixture();f.cache('cached');let seconds = 0, unlocked = false;
  const queue = createAudioQueue({ engine: { isUnlocked: () => unlocked, hasBuffer: f.engine.hasBuffer, playBuffer: f.engine.playBuffer }, now: () => seconds });
  queue.enqueue({ assetId: 'cached' });seconds = .2;unlocked = true;queue.update();await f.flush();expect(f.sources).toHaveLength(0);expect(queue.snapshot().pending).toEqual([]);
  queue.setPaused({ paused: true });queue.enqueue({ assetId: 'cached' });seconds = 100;queue.setPaused({ paused: false });await f.flush();expect(f.sources).toHaveLength(1);queue.dispose();
});

test('requests created or coalesced midway through pause start aging at resume rather than a future timestamp', async () => {
  const f = await schedulingFixture();f.cache('cached');let seconds = 0, unlocked = false;
  const queue = createAudioQueue({ engine: { isUnlocked: () => unlocked, hasBuffer: f.engine.hasBuffer, playBuffer: f.engine.playBuffer }, now: () => seconds });
  queue.setPaused({ paused: true });seconds = 100;queue.enqueue({ assetId: 'cached', coalesceKey: 'paused' });seconds = 150;queue.enqueue({ assetId: 'cached', coalesceKey: 'paused' });queue.setPaused({ paused: false });
  seconds = 150.181;unlocked = true;queue.update();await f.flush();expect(f.sources).toHaveLength(0);expect(queue.snapshot().pending).toEqual([]);queue.dispose();
});
