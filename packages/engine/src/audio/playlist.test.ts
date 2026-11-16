import { expect, test } from 'bun:test';
import { schedulingFixture } from './scheduling-fixture.ts';
import { createAudioPlaylist } from './playlist.ts';
import { createVoiceTransition } from './voice-transition.ts';
import { id3Tag } from './metadata-fixture.ts';

test('playlist trims, multiplies gains, advances on natural end and never immediately repeats shuffled tracks', async () => {
  const f = await schedulingFixture();for (const id of ['one', 'two', 'three']) f.cache(id);
  const played: string[] = [];
  const playlist = createAudioPlaylist({ engine: f.engine, playlists: { lobby: [{ assetId: 'one', gain: .5, startSeconds: 2, endSeconds: 12 }, { assetId: 'two' }, { assetId: 'three' }] }, gain: .4, seed: 71, onTrack(track) { played.push(track.assetId); } });
  await playlist.select({ playlistId: 'lobby' });await f.flush();
  for (let i = 0; i < 12; i++) { f.sources.at(-1)!.end();await f.flush(); }
  expect(played).toHaveLength(13);expect(new Set(played).size).toBe(3);expect(played.every((id, index) => !index || id !== played[index - 1])).toBe(true);
  const snapshot = playlist.snapshot();expect(snapshot.track).toMatchObject({ gain: played.at(-1) === 'one' ? .2 : .4, startedAt: 10, elapsedSeconds: 0 });
  const trimmed = f.sources.filter(source => source.offset === 2);expect(trimmed.length).toBeGreaterThan(0);expect(trimmed.every(source => source.duration === 10)).toBe(true);
  playlist.dispose();await f.flush();expect(f.engine.activeVoiceCount()).toBe(0);
});

test('pre-end update schedules audio-clock bar crossfade and rapid skips retain at most two live voices', async () => {
  const f = await schedulingFixture(true);f.cache('one', 20);f.cache('two', 20);
  const playlist = createAudioPlaylist({ engine: f.engine, playlists: { game: [{ assetId: 'one', bpm: 120 }, { assetId: 'two', bpm: 120 }] }, shuffle: false, transition: { style: 'varied', durationSeconds: 2, align: 'bar' } });
  await playlist.select({ playlistId: 'game' });await f.flush();f.at(11);
  await playlist.next();expect(f.sources[1]!.starts).toEqual([12]);expect(f.sources[0]!.stops).toEqual([14]);
  expect(f.gains.some(gain => gain.gain.events.some(event => event.kind === 'ramp' && event.time === 14))).toBe(true);
  let lastStyle = playlist.snapshot().transitionStyle;
  for (let i = 0; i < 8; i++) { await playlist.next();const style = playlist.snapshot().transitionStyle;expect(style).not.toBe(lastStyle);lastStyle = style;expect(f.engine.activeVoiceCount()).toBeLessThanOrEqual(2); }
  f.at(playlist.snapshot().track!.startedAt + 18);playlist.update();await f.flush();expect(f.sources.length).toBeGreaterThan(10);
  playlist.dispose();await f.flush();expect(f.effects.every(node => node.disconnected)).toBe(true);expect(f.oscillators.every(node => node.stops.length >= 1)).toBe(true);
});

test('pending loads preserve outgoing music, cancel superseded scenes and warm at most one successor', async () => {
  const f = await schedulingFixture();f.cache('old');
  const loads: string[] = [], resolvers = new Map<string, () => void>();
  const playlist = createAudioPlaylist({ engine: f.engine, playlists: { old: [{ assetId: 'old' }], next: [{ assetId: 'next' }, { assetId: 'tail' }], latest: [{ assetId: 'latest' }] }, load: id => { loads.push(id);return new Promise<void>(resolve => resolvers.set(id, () => { f.cache(id);resolve(); })); } });
  await playlist.select({ playlistId: 'old' });await f.flush();const old = f.sources[0]!;
  const pending = playlist.select({ playlistId: 'next' });await f.flush();expect(loads).toEqual(['next']);expect(old.stops).toEqual([]);
  const superseded = playlist.select({ playlistId: 'latest' });resolvers.get('next')!();await f.flush();expect(loads).toEqual(['next', 'latest']);expect(f.sources).toHaveLength(1);
  resolvers.get('latest')!();await Promise.all([pending, superseded]);expect(playlist.snapshot().track!.assetId).toBe('latest');expect(f.sources).toHaveLength(2);
  const disposed = playlist.select({ playlistId: 'next' });await f.flush();playlist.dispose();resolvers.get('tail')?.();await disposed;await f.flush();expect(f.engine.activeVoiceCount()).toBe(0);
});

test('failed tracks recover to valid music and pause/reset cannot autoplay late loads', async () => {
  const f = await schedulingFixture();const errors: string[] = [];
  const playlist = createAudioPlaylist({ engine: f.engine, playlists: { game: [{ assetId: 'bad' }, { assetId: 'good' }] }, shuffle: false, load: async id => { if (id === 'bad') throw new Error('bad data');f.cache(id); }, onError(id) { errors.push(id); } });
  await playlist.select({ playlistId: 'game' });await f.flush();expect(playlist.snapshot().track!.assetId).toBe('good');expect(errors).toEqual(['bad']);
  playlist.setPaused({ paused: true });const count = f.sources.length;f.sources.at(-1)!.end();await f.flush();playlist.update();expect(f.sources).toHaveLength(count);
  playlist.reset();playlist.setPaused({ paused: false });await f.flush();expect(playlist.snapshot().playlistId).toBe('');expect(f.sources).toHaveLength(count);
});

test('all native transition styles clean owned nodes and unsupported processors fall back to a normal fade', async () => {
  for (const native of [false, true]) for (const style of ['filter', 'echo', 'flanger', 'stutter', 'crossfade'] as const) {
    const f = await schedulingFixture(native);f.cache('one');f.cache('two');
    const playlist = createAudioPlaylist({ engine: f.engine, playlists: { game: [{ assetId: 'one' }, { assetId: 'two' }] }, shuffle: false });
    await playlist.select({ playlistId: 'game' });await playlist.next({ transition: { style, durationSeconds: .5 } });expect(f.sources[0]!.stops).toEqual([10.5]);
    expect(f.sources).toHaveLength(2);playlist.dispose();await f.flush();expect(f.effects.every(node => node.disconnected)).toBe(true);expect(f.engine.activeVoiceCount()).toBe(0);
  }
});

test('future transitions initialize native processors safely before connecting their graphs', async () => {
  for (const style of ['filter', 'echo', 'flanger'] as const) {
    const f = await schedulingFixture(true), source = f.context.createBufferSource(), gain = f.context.createGain();
    const before = f.gains.length, transition = createVoiceTransition({ context: f.context, source, gain, when: 14, bpm: 120, transition: { style, durationSeconds: 2 } });
    if (style === 'filter') {
      expect(f.filters[0]!.frequency.events).toEqual([{ kind: 'set', value: 18000, time: 10 }, { kind: 'set', value: 18000, time: 14 }, { kind: 'ramp', value: 250, time: 16 }]);
    } else {
      expect(f.delays[0]!.delayTime.events[0]).toEqual({ kind: 'set', value: style === 'echo' ? .25 : .005, time: 10 });
      const wet = f.gains[before]!, feedback = f.gains[before + 1]!;
      expect(wet.gain.events[0]).toEqual({ kind: 'set', value: 0, time: 10 });expect(feedback.gain.events[0]).toEqual({ kind: 'set', value: 0, time: 10 });
      expect(wet.gain.events[1]).toEqual({ kind: 'set', value: style === 'echo' ? .32 : .3, time: 14 });
      expect(feedback.gain.events[1]).toEqual({ kind: 'set', value: style === 'echo' ? .32 : .2, time: 14 });
      if (style === 'flanger') expect(f.gains[before + 2]!.gain.events[0]).toEqual({ kind: 'set', value: .001, time: 10 });
    }
    transition.cleanup();expect(f.effects.every(effect => effect.disconnected)).toBe(true);
  }
});

test('a track ending during successor decode continues after completion, and failed successors retry after bounded cooldown', async () => {
  const f = await schedulingFixture();f.cache('one');let finish: (() => void) | undefined, allowBad = false;
  const attempts: string[] = [];
  const playlist = createAudioPlaylist({ engine: f.engine, playlists: { game: [{ assetId: 'one' }, { assetId: 'slow' }, { assetId: 'bad' }] }, shuffle: false, load: async id => {
    attempts.push(id);if (id === 'bad') { if (!allowBad) throw new Error('temporary decode failure');f.cache(id);return; }
    await new Promise<void>(resolve => { finish = () => { f.cache(id);resolve(); }; });
  } });
  await playlist.select({ playlistId: 'game' });await f.flush();const pending = playlist.next();f.sources[0]!.end();await f.flush();finish!();await pending;await f.flush();expect(playlist.snapshot().track!.assetId).toBe('slow');
  expect(attempts).toEqual(['slow', 'bad']);await playlist.next();expect(playlist.snapshot().track!.assetId).toBe('one');
  allowBad = true;f.at(41);await playlist.next();await f.flush();await playlist.next();await f.flush();expect(attempts.filter(id => id === 'bad')).toHaveLength(2);
  playlist.dispose();
});

test('same-turn resume/select waits for actual playback, and capacity rejection waits for a later update', async () => {
  const f = await schedulingFixture(false, 1);f.cache('one');f.cache('critical');
  const critical = f.engine.playBuffer('critical', { priority: 100, loop: true });
  const playlist = createAudioPlaylist({ engine: f.engine, playlists: { game: [{ assetId: 'one' }] } });
  playlist.setPaused({ paused: false });await playlist.select({ playlistId: 'game' });await f.flush();expect(playlist.snapshot().track).toBeUndefined();expect(f.sources).toHaveLength(1);
  if (critical.ok) critical.voice.stop();playlist.update();await f.flush();expect(playlist.snapshot().track!.assetId).toBe('one');
  playlist.reset();playlist.setPaused({ paused: false });await playlist.select({ playlistId: 'game' });expect(playlist.snapshot().track!.assetId).toBe('one');playlist.dispose();
});

test('playlist alignment and effect timing use tagged BPM automatically while authored BPM overrides it', async () => {
  for (const authored of [undefined, 60]) {
    const f = await schedulingFixture(true);await f.engine.decode('one', id3Tag());f.cache('two');
    const playlist = createAudioPlaylist({ engine: f.engine, playlists: { game: [{ assetId: 'one', bpm: authored }, { assetId: 'two' }] }, shuffle: false, transition: { style: 'echo', align: 'bar', durationSeconds: 2 } });
    await playlist.select({ playlistId: 'game' });f.at(11);await playlist.next();
    expect(f.sources[1]!.starts).toEqual([authored ? 14 : 12]);expect(f.delays[0]!.delayTime.events[0]!.value).toBe(authored ? .5 : .25);playlist.dispose();
  }
});

test('skipping again before a bar-aligned incoming track starts preserves the audible outgoing voice', async () => {
  const f = await schedulingFixture(true);for (const id of ['one', 'two', 'three']) f.cache(id);
  const playlist = createAudioPlaylist({ engine: f.engine, playlists: { game: [{ assetId: 'one', bpm: 120 }, { assetId: 'two', bpm: 120 }, { assetId: 'three', bpm: 120 }] }, shuffle: false, transition: { style: 'echo', durationSeconds: 2, align: 'bar' } });
  await playlist.select({ playlistId: 'game' });f.at(11);await playlist.next();f.at(11.1);await playlist.next();
  expect(f.sources[0]!.stops).toEqual([14, 14]);expect(f.sources[1]!.stops).toEqual([11.1]);expect(f.sources[2]!.starts).toEqual([12]);expect(f.engine.activeVoiceCount()).toBe(2);
  expect(f.effects.slice(0, 1).every(effect => effect.disconnected)).toBe(true);playlist.dispose();expect(f.engine.activeVoiceCount()).toBe(0);
});
