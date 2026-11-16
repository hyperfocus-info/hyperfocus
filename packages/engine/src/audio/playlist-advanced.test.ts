import { expect, test } from 'bun:test';
import { createAudioPlaylist } from './playlist.ts';
import { compatibleKeys } from './playlist-policy.ts';
import { schedulingFixture } from './scheduling-fixture.ts';

test('authored downbeat offset, track meter and phrase length align outgoing transitions and incoming cues', async () => {
  const f = await schedulingFixture();f.cache('one', 60);f.cache('two', 60);
  const playlist = createAudioPlaylist({ engine: f.engine, shuffle: false, transition: { align: 'phrase', beatsPerBar: 4, durationSeconds: 2 }, playlists: { game: [
    { assetId: 'one', bpm: 120, beatOffsetSeconds: .25, beatsPerBar: 3, phraseBars: 2 },
    { assetId: 'two', bpm: 60, beatOffsetSeconds: .5, beatsPerBar: 4, phraseBars: 2, startSeconds: 2, endSeconds: 20 },
  ] } });
  await playlist.select({ playlistId: 'game' });expect(f.sources[0]!.offset).toBe(.25);
  f.at(11);await playlist.next();expect(f.sources[1]!.starts).toEqual([13]);expect(f.sources[1]!.offset).toBe(8.5);expect(f.sources[1]!.duration).toBe(11.5);expect(f.sources[0]!.stops).toEqual([15]);playlist.dispose();
});

test('automatic phrase transitions begin early enough to reach a grid boundary before the outgoing cue ends', async () => {
  const f = await schedulingFixture();f.cache('one', 31);f.cache('two', 31);
  const playlist = createAudioPlaylist({ engine: f.engine, shuffle: false, playlists: { game: [{ assetId: 'one', bpm: 120, beatOffsetSeconds: .25, phraseBars: 4 }, { assetId: 'two', bpm: 120, beatOffsetSeconds: .5 }] }, transition: { align: 'phrase', durationSeconds: 2 } });
  await playlist.select({ playlistId: 'game' });f.at(31);playlist.update();await f.flush();
  expect(f.sources[1]!.starts).toEqual([34]);expect(f.sources[0]!.stops).toEqual([36]);expect(f.sources[1]!.offset).toBe(.5);playlist.dispose();
});

test('fight intensity changes bias the next song without cutting short the current song', async () => {
  const f = await schedulingFixture();for (const id of ['quiet', 'mid', 'loud']) f.cache(id, 60);
  const playlist = createAudioPlaylist({ engine: f.engine, shuffle: false, playlists: { game: [{ assetId: 'quiet', energy: .2 }, { assetId: 'mid', energy: .5 }, { assetId: 'loud', energy: .9 }] } });
  await playlist.select({ playlistId: 'game', intensity: .2 });expect(playlist.snapshot().track!.assetId).toBe('quiet');
  f.at(11);await playlist.select({ playlistId: 'game', intensity: .9 });expect(f.sources).toHaveLength(1);
  f.at(25.9);playlist.update();await f.flush();expect(f.sources).toHaveLength(1);
  for (const [at, intensity] of [[26, .9], [40, .2], [50, .9], [65, .9]]) {
    f.at(at!);await playlist.select({ playlistId: 'game', intensity });playlist.update();await f.flush();
    expect(playlist.snapshot().track!.assetId).toBe('quiet');expect(f.sources).toHaveLength(1);expect(f.sources[0]!.stops).toEqual([]);
  }
  f.at(68);playlist.update();await f.flush();expect(playlist.snapshot().track!.assetId).toBe('loud');expect(f.sources).toHaveLength(2);expect(f.sources[0]!.stops).toEqual([70]);playlist.dispose();
  const baseline = createAudioPlaylist({ engine: f.engine, playlists: { old: [{ assetId: 'mid' }, { assetId: 'loud' }] } });
  await baseline.select({ playlistId: 'old', intensity: .1 });const count = f.sources.length;f.at(59);await baseline.select({ playlistId: 'old', intensity: .9 });expect(f.sources).toHaveLength(count);baseline.dispose();
  const lateIntensity = createAudioPlaylist({ engine: f.engine, shuffle: false, playlists: { game: [{ assetId: 'quiet', energy: .2 }, { assetId: 'loud', energy: .9 }] } });
  await lateIntensity.select({ playlistId: 'game' });f.at(75);await lateIntensity.select({ playlistId: 'game', intensity: .9 });expect(lateIntensity.snapshot().track!.assetId).toBe('quiet');lateIntensity.dispose();
});

test('countdown and intensity gain updates preserve a long incoming transition instead of jumping to full gain', async () => {
  const f = await schedulingFixture();f.cache('lobby', 60);f.cache('fight', 60);
  const playlist = createAudioPlaylist({ engine: f.engine, playlists: { lobby: [{ assetId: 'lobby' }], fight: [{ assetId: 'fight' }] } });
  await playlist.select({ playlistId: 'lobby' });
  await playlist.select({ playlistId: 'fight', gain: .3, transition: { durationSeconds: 4, align: 'immediate', style: 'crossfade' } });
  const ramps = () => f.gains.flatMap(node => node.gain.events).filter(event => event.kind === 'ramp');
  const before = ramps().length;f.at(10.5);await playlist.select({ playlistId: 'fight', gain: .3, intensity: .8 });expect(ramps()).toHaveLength(before);
  f.at(11);await playlist.select({ playlistId: 'fight', gain: .6, intensity: .9 });expect(ramps().at(-1)).toMatchObject({ value: .6, time: 14 });
  expect(f.sources[0]!.stops).toEqual([14]);expect(f.sources).toHaveLength(2);playlist.dispose();
});

test('known musical keys prefer compatible neighbors without guessing keys or changing playback rates', async () => {
  const f = await schedulingFixture();for (const id of ['c', 'sharp', 'g', 'a']) f.cache(id);
  const playlist = createAudioPlaylist({ engine: f.engine, shuffle: false, playlists: { game: [{ assetId: 'c', musicalKey: 'C major' }, { assetId: 'sharp', musicalKey: 'C# major' }, { assetId: 'g', musicalKey: 'G major' }, { assetId: 'a', musicalKey: 'A minor' }] } });
  await playlist.select({ playlistId: 'game' });const keys: Record<string, string> = { c: 'C major', sharp: 'C# major', g: 'G major', a: 'A minor' };
  let previous = playlist.snapshot().track!.assetId;const heard = [previous];
  for (let i = 0; i < 5; i++) { await playlist.next();const id = playlist.snapshot().track!.assetId;expect(id).not.toBe(previous);if (i === 0) expect(compatibleKeys(keys[previous], keys[id])).toBe(true);heard.push(id);previous = id; }
  expect(new Set(heard.slice(0, 4)).size).toBe(4);
  expect(f.sources.every(source => source.playbackRate.value === 1)).toBe(true);playlist.dispose();
});

test('all-failed playlists report bounded retry backoff, gate pause and recover by automatic or explicit retry', async () => {
  const f = await schedulingFixture();const attempts: string[] = [];let healthy = false;
  const playlist = createAudioPlaylist({ engine: f.engine, shuffle: false, playlists: { game: [{ assetId: 'a' }, { assetId: 'b' }] }, load: async id => { attempts.push(id);if (!healthy) throw new Error('offline');f.cache(id); } });
  await playlist.select({ playlistId: 'game' });await f.flush();expect(playlist.snapshot()).toMatchObject({ status: 'error', error: 'offline', retryAt: 40 });expect(attempts).toHaveLength(2);
  for (let i = 0; i < 100; i++) playlist.update();await f.flush();expect(attempts).toHaveLength(2);
  f.at(40);playlist.update();await f.flush();expect(attempts).toHaveLength(4);expect(playlist.snapshot().retryAt).toBe(100);
  playlist.setPaused({ paused: true });f.at(100);playlist.update();await f.flush();expect(attempts).toHaveLength(4);expect(playlist.snapshot()).toMatchObject({ status: 'error', paused: true, retryAt: 100, error: 'offline' });
  playlist.setPaused({ paused: false });playlist.update();await f.flush();expect(attempts).toHaveLength(6);expect(playlist.snapshot().retryAt).toBe(220);
  healthy = true;f.at(220);playlist.update();await f.flush();expect(playlist.snapshot().status).toBe('playing');expect(playlist.snapshot().retryAt).toBeUndefined();
  playlist.reset();f.engine.clearDecodedCache();healthy = false;await playlist.select({ playlistId: 'game' });await f.flush();expect(playlist.snapshot().status).toBe('error');healthy = true;await playlist.retry();await f.flush();expect(playlist.snapshot().status).toBe('playing');playlist.dispose();
});

test('retry reset invalidates late load failures and invalid authored musical values fail at construction', async () => {
  const f = await schedulingFixture();let reject: ((cause: Error) => void) | undefined;
  const playlist = createAudioPlaylist({ engine: f.engine, playlists: { game: [{ assetId: 'a' }] }, load: () => new Promise<void>((_, fail) => { reject = fail; }) });
  const pending = playlist.select({ playlistId: 'game' });await f.flush();playlist.reset();reject!(new Error('late'));await pending;f.at(1000);playlist.update();await f.flush();expect(playlist.snapshot()).toMatchObject({ status: 'idle', playlistId: '' });expect(playlist.snapshot().error).toBeUndefined();playlist.dispose();
  for (const fields of [{ energy: 1.1 }, { beatOffsetSeconds: -1 }, { beatsPerBar: 1.5 }, { phraseBars: 17 }]) expect(() => createAudioPlaylist({ engine: f.engine, playlists: { invalid: [{ assetId: 'a', ...fields }] } })).toThrow(RangeError);
});

test('advanced preferences visit every healthy song in each deterministic cycle across heterogeneous four and nineteen track queues', async () => {
  for (const size of [4, 19]) {
    const runs: string[][] = [];
    for (let run = 0; run < 2; run++) {
      const f = await schedulingFixture(), played: string[] = [];
      const tracks = Array.from({ length: size }, (_, index) => ({ assetId: String(index), bpm: index % 3 === 0 ? 80 : index % 3 === 1 ? 120 : 170, energy: index < 2 ? .15 : .8, musicalKey: index % 2 ? 'C# major' as const : 'C major' as const }));
      for (const track of tracks) f.cache(track.assetId, 60);
      const playlist = createAudioPlaylist({ engine: f.engine, playlists: { lobby: tracks }, load: id => { f.cache(id, 60);return Promise.resolve(); }, seed: 13, onTrack(track) { played.push(track.assetId); } });
      await playlist.select({ playlistId: 'lobby', intensity: .15 });for (let count = 1; count < size * 3; count++) await playlist.next();
      for (let cycle = 0; cycle < 3; cycle++) expect(new Set(played.slice(cycle * size, (cycle + 1) * size)).size).toBe(size);
      expect(played.every((id, index) => index === 0 || id !== played[index - 1])).toBe(true);runs.push(played);playlist.dispose();
    }
    expect(runs[0]).toEqual(runs[1]);
  }
});

test('changing playlist without urgency clears prior fight intensity and preserves a varied lobby rotation', async () => {
  const f = await schedulingFixture(), played: string[] = [];
  const tracks = [{ assetId: 'quiet', energy: .15, bpm: 80 }, { assetId: 'loud', energy: .9, bpm: 160 }, { assetId: 'mid', energy: .5, bpm: 120 }, { assetId: 'unknown' }];
  for (const track of tracks) f.cache(track.assetId, 60);
  const playlist = createAudioPlaylist({ engine: f.engine, shuffle: false, playlists: { fight: [{ assetId: 'loud', energy: .9 }], lobby: tracks }, onTrack(track) { if (track.playlistId === 'lobby') played.push(track.assetId); } });
  await playlist.select({ playlistId: 'fight', intensity: .9 });await playlist.select({ playlistId: 'lobby' });expect(playlist.snapshot().intensity).toBeUndefined();
  for (let count = 1; count < 8; count++) await playlist.next();expect(new Set(played.slice(0, 4)).size).toBe(4);expect(new Set(played.slice(4, 8)).size).toBe(4);
  const count = f.sources.length;f.at(40);await playlist.select({ playlistId: 'lobby', gain: .4 });expect(f.sources).toHaveLength(count);expect(playlist.snapshot().intensity).toBeUndefined();playlist.dispose();
});

test('recurring fight intensity intents preserve exhausted backoff and never reload while paused', async () => {
  const f = await schedulingFixture();let attempts = 0, healthy = false;
  const playlist = createAudioPlaylist({ engine: f.engine, playlists: { fight: [{ assetId: 'a', energy: .2 }, { assetId: 'b', energy: .9 }] }, load: async id => { attempts++;if (!healthy) throw new Error('network unavailable');f.cache(id); } });
  await playlist.select({ playlistId: 'fight', intensity: .2 });expect(attempts).toBe(2);
  for (let count = 0; count < 20; count++) { f.at(10 + count * .5);await playlist.select({ playlistId: 'fight', intensity: count % 2 ? .8 : .2, gain: .3 }); }
  expect(attempts).toBe(2);expect(playlist.snapshot()).toMatchObject({ status: 'error', retryAt: 40, error: 'network unavailable' });
  playlist.setPaused({ paused: true });f.at(50);
  for (let count = 0; count < 20; count++) await playlist.select({ playlistId: 'fight', intensity: count % 2 ? .8 : .2 });
  expect(attempts).toBe(2);expect(playlist.snapshot()).toMatchObject({ status: 'error', paused: true, retryAt: 40, error: 'network unavailable' });
  healthy = true;playlist.setPaused({ paused: false });await f.flush();expect(playlist.snapshot().status).toBe('playing');expect(playlist.snapshot().error).toBeUndefined();playlist.dispose();
});
