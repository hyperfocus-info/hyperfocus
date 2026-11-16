import { AUDIO_MUSICAL_KEYS, type AudioPlaylistTrack, type AudioPlaylistTransition } from './playlist-contracts.ts';

export function validatePlaylistTrack(track: AudioPlaylistTrack) {
  if (!track.assetId || !bounded(track.gain ?? 1, 0, 4) || !bounded(track.startSeconds ?? 0, 0, 3600) || track.endSeconds !== undefined && (!bounded(track.endSeconds, 0, 3600) || track.endSeconds <= (track.startSeconds ?? 0)) || track.bpm !== undefined && !bounded(track.bpm, 30, 300) || track.beatOffsetSeconds !== undefined && !bounded(track.beatOffsetSeconds, 0, 3600) || track.beatsPerBar !== undefined && !integer(track.beatsPerBar, 1, 12) || track.phraseBars !== undefined && !integer(track.phraseBars, 1, 16) || track.energy !== undefined && !bounded(track.energy, 0, 1) || track.musicalKey !== undefined && !AUDIO_MUSICAL_KEYS.includes(track.musicalKey)) throw new RangeError('Invalid audio playlist track.');
}

export function validateIntensity(value: number) { if (!bounded(value, 0, 1)) throw new RangeError('Playlist intensity must be from zero to one.');return value; }
export function validateTransition(value: AudioPlaylistTransition) {
  const duration = value.durationSeconds ?? 2, beats = value.beatsPerBar ?? 4;
  if (!bounded(duration, 0, 10) || !integer(beats, 1, 12)) throw new RangeError('Invalid playlist transition bounds.');
  return duration;
}

export function musicalPeriod(track: AudioPlaylistTrack, bpm: number, transition: AudioPlaylistTransition) {
  const beats = transition.align === 'beat' ? 1 : track.beatsPerBar ?? transition.beatsPerBar ?? 4;
  return 60 / bpm * beats * (transition.align === 'phrase' ? track.phraseBars ?? 4 : 1);
}

/** Camelot wheel or conventional pitch + major/minor. Unknown keys are rejected, never guessed. */
export function readMusicalKey(value: string) {
  const camelot = /^(1[0-2]|[1-9])([AB])$/i.exec(value.trim());
  if (camelot) return { position: Number(camelot[1]), mode: camelot[2]!.toUpperCase() };
  const name = /^([A-G])([#b]?)[ -]*(major|minor)$/i.exec(value.trim());if (!name) return;
  const pitch = name[1]!.toUpperCase() + name[2]!, minor = name[3]!.toLowerCase() === 'minor';
  const aliases: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B', Fb: 'E', 'E#': 'F', 'B#': 'C' };
  const pitches = minor ? ['G#', 'D#', 'A#', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'] : ['B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F', 'C', 'G', 'D', 'A', 'E'];
  const position = pitches.indexOf(aliases[pitch] ?? pitch) + 1;if (position) return { position, mode: minor ? 'A' : 'B' };
}

export function compatibleKeys(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false;
  const a = readMusicalKey(left), b = readMusicalKey(right);if (!a || !b) return false;
  const distance = Math.abs(a.position - b.position);
  return distance === 0 || a.mode === b.mode && (distance === 1 || distance === 11);
}

export function preferredTrackIndices(tracks: readonly AudioPlaylistTrack[], eligible: number[], intensity: number | undefined, previous: AudioPlaylistTrack | undefined, tempo: (track: AudioPlaylistTrack) => number | undefined = track => track.bpm) {
  let result = eligible;
  if (intensity !== undefined && eligible.some(index => tracks[index]!.energy !== undefined)) {
    const nearest = Math.min(...eligible.map(index => tracks[index]!.energy === undefined ? Infinity : Math.abs(tracks[index]!.energy! - intensity)));
    result = eligible.filter(index => tracks[index]!.energy !== undefined && Math.abs(tracks[index]!.energy! - intensity) <= nearest + .12);
  }
  if (previous?.musicalKey && result.some(index => compatibleKeys(previous.musicalKey, tracks[index]!.musicalKey))) result = result.filter(index => compatibleKeys(previous.musicalKey, tracks[index]!.musicalKey));
  const before = previous && tempo(previous);
  if (before !== undefined && bounded(before, 30, 300)) {
    const known = result.flatMap(index => {
      const bpm = tempo(tracks[index]!);
      if (bpm === undefined || !bounded(bpm, 30, 300)) return [];
      const distance = Math.abs(Math.log2(bpm / before)), metrical = Math.min(Math.abs(distance - 1), distance);
      return [{ index, distance, metrical, score: Math.min(distance, metrical + .12) }];
    });
    if (known.length) {
      const direct = known.filter(value => value.distance <= Math.log2(1.08));
      const equivalent = known.filter(value => value.metrical <= Math.log2(1.04));
      const nearest = Math.min(...known.map(value => value.score));
      result = (direct.length ? direct : equivalent.length ? equivalent : known.filter(value => value.score <= nearest + .025)).map(value => value.index);
    }
  }
  return result;
}

function bounded(value: number, low: number, high: number) { return Number.isFinite(value) && value >= low && value <= high; }
function integer(value: number, low: number, high: number) { return Number.isInteger(value) && value >= low && value <= high; }
