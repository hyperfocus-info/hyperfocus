import { expect, test } from 'bun:test';
import { preferredTrackIndices } from './playlist-policy.ts';
import { createAudioPlaylist } from './playlist.ts';
import { schedulingFixture } from './scheduling-fixture.ts';
import { id3Tag } from './metadata-fixture.ts';

test('tempo preference keeps every direct neighbor and prefers them over half-time or unknown tempo', () => {
  const tracks = [118, 125, 60, 150, undefined].map((bpm, index) => ({ assetId: String(index), bpm }));
  expect(preferredTrackIndices(tracks, [0, 1, 2, 3, 4], undefined, { assetId: 'previous', bpm: 120 })).toEqual([0, 1]);
});

test('half and double-time neighbors use a tighter tolerance and closest ratio remains a fallback', () => {
  const equivalent = [60, 62, 240, 248, 66, 150].map((bpm, index) => ({ assetId: String(index), bpm }));
  expect(preferredTrackIndices(equivalent, [0, 1, 2, 3, 4, 5], undefined, { assetId: 'previous', bpm: 120 })).toEqual([0, 1, 2, 3]);
  const fallback = [90, 91, 80, undefined].map((bpm, index) => ({ assetId: String(index), bpm }));
  expect(preferredTrackIndices(fallback, [0, 1, 2, 3], undefined, { assetId: 'previous', bpm: 120 })).toEqual([0, 1]);
});

test('tempo filters only the energy and key viable pool and keeps unknowns when that pool has no known tempo', () => {
  const tracks = [
    { assetId: 'quiet', bpm: 120, energy: .1, musicalKey: 'C major' as const },
    { assetId: 'wrong-key', bpm: 120, energy: .8, musicalKey: 'C# major' as const },
    { assetId: 'unknown', energy: .8, musicalKey: 'G major' as const },
    { assetId: 'known', bpm: 80, energy: .8, musicalKey: 'G major' as const },
  ];
  const previous = { assetId: 'previous', bpm: 120, musicalKey: 'C major' as const };
  expect(preferredTrackIndices(tracks, [0, 1, 2, 3], .8, previous)).toEqual([3]);
  expect(preferredTrackIndices(tracks, [0, 1, 2], .8, previous)).toEqual([2]);
  expect(preferredTrackIndices(tracks, [0, 1, 2], undefined, undefined)).toEqual([0, 1, 2]);
});

test('tagged tempo drives next-track preference and authored tempo takes precedence', async () => {
  for (const bpm of [undefined, 80]) {
    const f = await schedulingFixture();await f.engine.decode('tagged', id3Tag());for (const id of ['far', 'near-tag', 'near-authored']) f.cache(id);
    const playlist = createAudioPlaylist({ engine: f.engine, shuffle: false, playlists: { game: [{ assetId: 'tagged', bpm }, { assetId: 'far', bpm: 150 }, { assetId: 'near-tag', bpm: 124 }, { assetId: 'near-authored', bpm: 82 }] } });
    await playlist.select({ playlistId: 'game' });await playlist.next();
    expect(playlist.snapshot().track?.assetId).toBe(bpm ? 'near-authored' : 'near-tag');expect(f.sources.every(source => source.playbackRate.value === 1)).toBe(true);playlist.dispose();
  }
});

test('candidate tempo metadata participates before playback without overriding authored candidate BPM', async () => {
  const f = await schedulingFixture();f.cache('base');f.cache('far');await f.engine.decode('tagged', id3Tag());
  for (const bpm of [undefined, 200]) {
    const playlist = createAudioPlaylist({ engine: f.engine, shuffle: false, playlists: { game: [{ assetId: 'base', bpm: 120 }, { assetId: 'far', bpm: 130 }, { assetId: 'tagged', bpm }] } });
    await playlist.select({ playlistId: 'game' });await playlist.next();expect(playlist.snapshot().track?.assetId).toBe(bpm ? 'far' : 'tagged');playlist.dispose();
  }
});

test('compatible tempo shuffle remains deterministic, varied and never immediately repeats', async () => {
  const runs: string[][] = [];
  for (let run = 0; run < 2; run++) {
    const f = await schedulingFixture(), played: string[] = [], tracks = [118, 120, 123, 125].map((bpm, index) => ({ assetId: String(index), bpm }));
    for (const track of tracks) f.cache(track.assetId);
    const playlist = createAudioPlaylist({ engine: f.engine, playlists: { game: tracks }, seed: 37, onTrack(track) { played.push(track.assetId); } });
    await playlist.select({ playlistId: 'game' });for (let count = 0; count < 12; count++) await playlist.next();
    expect(new Set(played).size).toBe(4);expect(played.every((id, index) => index === 0 || id !== played[index - 1])).toBe(true);runs.push(played);playlist.dispose();
  }
  expect(runs[0]).toEqual(runs[1]);
});

test('all-failed paused playlists preserve Retry music state and defer an explicit retry until resume', async () => {
  const f = await schedulingFixture();let healthy = false, attempts = 0;
  const playlist = createAudioPlaylist({ engine: f.engine, playlists: { game: [{ assetId: 'one' }] }, load: async id => { attempts++;if (!healthy) throw new Error('offline');f.cache(id); } });
  await playlist.select({ playlistId: 'game' });playlist.setPaused({ paused: true });f.at(50);
  expect(playlist.snapshot()).toMatchObject({ status: 'error', paused: true, retryAt: 40, error: 'offline' });
  healthy = true;await playlist.retry();expect(playlist.snapshot()).toMatchObject({ status: 'loading', paused: true });expect(playlist.snapshot().error).toBeUndefined();expect(playlist.snapshot().retryAt).toBeUndefined();expect(attempts).toBe(1);expect(f.sources).toHaveLength(0);
  playlist.setPaused({ paused: false });await f.flush();expect(playlist.snapshot().status).toBe('playing');expect(attempts).toBe(2);playlist.dispose();
});
