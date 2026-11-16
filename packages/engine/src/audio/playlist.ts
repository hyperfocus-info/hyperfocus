import type { AudioEngine, AudioVoiceHandle } from './index.ts';
import type { AudioPlaylistTrack, AudioPlaylistTransition } from './playlist-contracts.ts';
import { createAudioShuffle } from './shuffle.ts';
import { supportedAudioTransitions } from './voice-transition.ts';
import { musicalPeriod, preferredTrackIndices, validateIntensity, validatePlaylistTrack, validateTransition } from './playlist-policy.ts';

export type AudioPlaylistEngine = Pick<AudioEngine, 'context' | 'getBufferDuration' | 'hasBuffer' | 'playBuffer' | 'isUnlocked'> & Partial<Pick<AudioEngine, 'getAudioMetadata'>>;

type Selection = { playlistId: string; index: number; track: AudioPlaylistTrack; generation: number; transition: AudioPlaylistTransition; cycle?: number };
type Playing = Selection & { voice: AudioVoiceHandle; gain: number; durationSeconds: number; startedAt: number; offset: number; endsAt: number; fadeEndsAt: number; bpm?: number };

export function createAudioPlaylist(options: { engine: AudioPlaylistEngine; playlists: Readonly<Record<string, readonly AudioPlaylistTrack[]>>; load?: (assetId: string) => Promise<void>; bus?: string; gain?: number; priority?: number; seed?: number; shuffle?: boolean; transition?: AudioPlaylistTransition; onTrack?: (track: { playlistId: string; assetId: string; index: number; gain: number }) => void; onError?: (assetId: string, cause: unknown) => void }) {
  const { engine } = options, playlists = new Map(Object.entries(options.playlists).map(([id, tracks]) => [id, tracks.map(track => ({ ...track }))]));
  if (playlists.size > 32) throw new RangeError('Audio playlists support at most thirty-two lists.');
  for (const tracks of playlists.values()) {
    if (tracks.length > 64 || new Set(tracks.map(track => track.assetId)).size !== tracks.length) throw new RangeError('Audio playlists need at most sixty-four distinct tracks.');
    for (const track of tracks) validatePlaylistTrack(track);
  }
  const shuffle = createAudioShuffle(options.seed), failed = new Map<string, { until: number; attempts: number }>(), retiring = new Set<Playing>(), heard = new Map<string, { cycle: number; assets: Set<string> }>();
  let gain = validateGain(options.gain ?? 1), generation = 0, playlistId = '', lastAsset = '', nextIndex = 0, paused = false, disposed = false;
  let current: Playing | undefined, candidate: Selection | undefined, wanted: Selection | undefined, processing: Promise<void> | undefined, decoding: Promise<void> | undefined;
  let transitionStyle: AudioPlaylistTransition['style'];
  let lastStyle: AudioPlaylistTransition['style'];
  let capacityBlocked = false;
  let intensity: number | undefined, error: string | undefined;
  const now = () => engine.context()?.currentTime ?? 0;
  const tempo = (track: AudioPlaylistTrack) => track.bpm ?? engine.getAudioMetadata?.(track.assetId)?.bpm;
  const isFailed = (id: string) => (failed.get(id)?.until ?? 0) > now();
  function markHeard(selection: Selection) {
    const visited = heard.get(selection.playlistId) ?? { cycle: 0, assets: new Set<string>() };
    if (selection.cycle !== undefined && selection.cycle > visited.cycle) { visited.cycle = selection.cycle;visited.assets.clear(); }
    if (selection.cycle === undefined || selection.cycle >= visited.cycle) visited.assets.add(selection.track.assetId);
    heard.set(selection.playlistId, visited);
  }
  function recordFailure(selection: Selection, cause: unknown) {
    const attempts = Math.min(3, (failed.get(selection.track.assetId)?.attempts ?? 0) + 1);
    failed.set(selection.track.assetId, { attempts, until: now() + Math.min(120, 30 * 2 ** Math.min(2, attempts - 1)) });
    error = cause instanceof Error ? cause.message : String(cause);options.onError?.(selection.track.assetId, cause);
  }
  function retryAt() {
    const tracks = playlists.get(playlistId);if (!tracks?.length || tracks.some(track => !failed.has(track.assetId))) return;
    return Math.min(...tracks.map(track => failed.get(track.assetId)!.until));
  }
  function pick(id: string, transition: AudioPlaylistTransition): Selection | undefined {
    if (current?.voice.active && current.startedAt <= now()) markHeard(current);
    const tracks = playlists.get(id);if (!tracks?.length) return;
    const eligible = tracks.map((_, index) => index).filter(index => !isFailed(tracks[index]!.assetId));
    const advanced = intensity !== undefined && tracks.some(track => track.energy !== undefined) || tracks.some(track => track.musicalKey !== undefined || tempo(track) !== undefined);
    if (advanced && eligible.length) {
      const distinct = eligible.length > 1 ? eligible.filter(index => tracks[index]!.assetId !== lastAsset) : eligible;
      let pool = distinct;
      let cycle: number | undefined;
      const visited = heard.get(id) ?? { cycle: 0, assets: new Set<string>() };heard.set(id, visited);
      const remaining = distinct.filter(index => !visited.assets.has(tracks[index]!.assetId));
      if (remaining.length) pool = remaining;
      cycle = visited.cycle + (remaining.length ? 0 : 1);
      const preferred = preferredTrackIndices(tracks, pool, intensity, current?.track, tempo);
      const index = preferred[options.shuffle === false ? nextIndex++ % preferred.length : shuffle.next(`${id}:${preferred.join(',')}`, preferred.length)]!;
      return { playlistId: id, index, track: tracks[index]!, generation, transition, cycle };
    }
    for (let attempt = 0; attempt < tracks.length; attempt++) {
      const index = options.shuffle === false ? nextIndex++ % tracks.length : shuffle.next(id, tracks.length), track = tracks[index]!;
      if (!isFailed(track.assetId) && (eligible.length === 1 || track.assetId !== lastAsset)) return { playlistId: id, index, track, generation, transition };
    }
  }
  async function prepare(selection: Selection) {
    if (decoding) await decoding.catch(() => undefined);
    if (disposed || selection.generation !== generation) return;
    if (!engine.hasBuffer(selection.track.assetId)) {
      const job = options.load?.(selection.track.assetId) ?? Promise.resolve();decoding = job;
      try { await job; } finally { if (decoding === job) decoding = undefined; }
    }
    if (disposed || selection.generation !== generation) return;
    const duration = engine.getBufferDuration(selection.track.assetId), bpm = selection.track.bpm ?? engine.getAudioMetadata?.(selection.track.assetId)?.bpm;
    let offset = selection.track.startSeconds ?? 0;
    if (bpm && selection.track.beatOffsetSeconds !== undefined && selection.transition.align && selection.transition.align !== 'immediate') {
      const first = selection.track.beatOffsetSeconds, period = musicalPeriod(selection.track, bpm, selection.transition);
      offset = first + Math.max(0, Math.ceil((offset - first) / period - 1e-9)) * period;
    }
    if (duration === undefined || duration <= offset) throw new Error('Playlist track is missing or its trim starts past the decoded duration.');
    const end = Math.min(duration, selection.track.endSeconds ?? duration);
    if (end <= offset) throw new Error('Playlist track trim has no audible duration.');
    return { durationSeconds: (end - offset), offset, bpm };
  }
  function transitionAt(selection: Selection) {
    const seconds = validateTransition(selection.transition), alignment = selection.transition.align ?? 'immediate';
    let at = now();
    if (current && alignment !== 'immediate' && current.bpm) {
      const period = musicalPeriod(current.track, current.bpm, selection.transition);
      const elapsed = at - current.startedAt + current.offset - (current.track.beatOffsetSeconds ?? 0);
      at += Math.ceil(elapsed / period - 1e-9) * period - elapsed;
      at = Math.min(at, Math.max(now(), current.endsAt - seconds));
    }
    return { at, seconds };
  }
  function warmNext() {
    if (paused || disposed || !current || candidate || wanted) return;
    candidate = pick(playlistId, options.transition ?? {});const selection = candidate;if (!selection) return;
    void prepare(selection).catch(cause => { if (selection.generation === generation) { recordFailure(selection, cause);if (candidate === selection) candidate = undefined; } });
  }
  async function process() {
    capacityBlocked = false;
    while (wanted && !disposed && !paused && engine.isUnlocked()) {
      const selection = wanted;wanted = undefined;
      try {
        const ready = await prepare(selection);if (!ready || selection.generation !== generation) continue;
        if (paused || !engine.isUnlocked()) { wanted = selection;break; }
        if (current && current.startedAt > now()) {
          const pending = current;current = [...retiring].find(track => track.voice.active && track.startedAt <= now());
          if (current) retiring.delete(current);pending.voice.stop();
        }
        const { at, seconds } = transitionAt(selection), voiceGain = Math.min(4, gain * (selection.track.gain ?? 1));
        for (const track of retiring) track.voice.stop();retiring.clear();
        const result = engine.playBuffer(selection.track.assetId, { bus: options.bus ?? 'music', priority: options.priority ?? 90, loop: false, when: at, offset: ready.offset, duration: ready.durationSeconds, gain: seconds && current ? 0 : voiceGain, onEnded(reason) {
          if (current?.generation !== selection.generation || current.track.assetId !== selection.track.assetId) return;
          if (reason === 'ended') markHeard(selection);
          current = undefined;if (reason === 'ended' && !disposed && !wanted && !processing) void next();
        } });
        if (!result.ok) {
          if (result.code === 'voice-capacity' || result.code === 'not-unlocked') { wanted = selection;capacityBlocked = result.code === 'voice-capacity';break; }
          throw new Error(result.message);
        }
        if (current) {
          const supported = supportedAudioTransitions(engine.context());
          let style = selection.transition.style ?? 'crossfade';
          if (style === 'varied') { const choices = supported.filter(value => value !== lastStyle);style = choices[shuffle.next(`transition:${choices.join(',')}`, choices.length)] ?? 'crossfade'; }
          lastStyle = style;transitionStyle = style;
          if (current.voice.transitionOut) current.voice.transitionOut({ ...selection.transition, style, durationSeconds: seconds, when: at, bpm: current.bpm });
          else { current.voice.fadeTo(0, seconds, at);current.voice.stop(at + seconds); }
          retiring.add(current);
          if (seconds) result.voice.fadeTo(voiceGain, seconds, at);
        }
        current = { ...selection, ...ready, voice: result.voice, gain: voiceGain, startedAt: at, endsAt: at + ready.durationSeconds, fadeEndsAt: current ? at + seconds : at };lastAsset = selection.track.assetId;
        if (current.startedAt <= now()) markHeard(current);
        failed.delete(selection.track.assetId);error = undefined;
        options.onTrack?.({ playlistId: selection.playlistId, assetId: selection.track.assetId, index: selection.index, gain: voiceGain });warmNext();
      } catch (cause) {
        if (selection.generation !== generation || disposed) continue;
        recordFailure(selection, cause);wanted = pick(playlistId, selection.transition);
      }
    }
  }
  function pump(): Promise<void> {
    if (!processing) processing = process().finally(() => {
      processing = undefined;
      if (wanted && !disposed && !paused && engine.isUnlocked() && !capacityBlocked) return pump();
    });
    return processing;
  }
  function next(input: { transition?: AudioPlaylistTransition } = {}): Promise<void> {
    if (disposed) return Promise.resolve();
    generation++;const transition = input.transition ?? options.transition ?? {};validateTransition(transition);
    const selected = candidate?.playlistId === playlistId && !isFailed(candidate.track.assetId) ? { ...candidate, generation, transition } : pick(playlistId, transition);
    candidate = undefined;wanted = selected;return pump();
  }
  function fadeCurrent(seconds: number) {
    if (!current) return;
    const nextGain = Math.min(4, gain * (current.track.gain ?? 1));
    if (nextGain === current.gain) return;
    current.gain = nextGain;
    current.voice.fadeTo(nextGain, Math.max(seconds, current.fadeEndsAt - now()));
  }
  function transitionLead() {
    const transition = options.transition ?? {}, seconds = validateTransition(transition);
    if (!current) return seconds;
    const advanced = transition.align === 'phrase' || current.track.beatOffsetSeconds !== undefined || current.track.beatsPerBar !== undefined;
    const lead = advanced && current.bpm && transition.align && transition.align !== 'immediate' ? seconds + musicalPeriod(current.track, current.bpm, transition) : seconds;
    return Math.min(lead, current.durationSeconds / 2);
  }
  function retry() { if (disposed || !playlistId) return Promise.resolve();failed.clear();error = undefined;candidate = undefined;return next(); }
  return {
    select(input: { playlistId: string; gain?: number; transition?: AudioPlaylistTransition; intensity?: number }): Promise<void> {
      if (disposed) return Promise.resolve();
      if (!playlists.has(input.playlistId)) throw new Error(`Unknown audio playlist ${input.playlistId}.`);
      if (input.gain !== undefined) gain = validateGain(input.gain);
      if (input.intensity !== undefined) { const value = validateIntensity(input.intensity);if (value !== intensity) candidate = undefined;intensity = value; }
      if (playlistId === input.playlistId) {
        fadeCurrent(input.transition?.durationSeconds ?? .4);
        if (!current && !wanted && !processing && !paused && (retryAt() ?? now()) <= now()) return next({ transition: input.transition });
        return processing ?? Promise.resolve();
      }
      playlistId = input.playlistId;if (input.intensity === undefined) intensity = undefined;failed.clear();candidate = undefined;nextIndex = 0;
      if (!playlists.get(playlistId)?.length) { generation++;wanted = undefined;current?.voice.stop();current = undefined;for (const track of retiring) track.voice.stop();retiring.clear();return Promise.resolve(); }
      return next({ transition: input.transition });
    }, next, retry,
    update() {
      if (disposed || paused) return;
      if (current?.voice.active && current.startedAt <= now()) markHeard(current);
      for (const track of retiring) if (!track.voice.active) retiring.delete(track);
      if (wanted) void pump();
      if (!current && !wanted && !processing && playlistId && playlists.get(playlistId)?.length && (retryAt() ?? now()) <= now()) void next();
      if (current && !wanted && !processing) {
        if (!current.voice.active) { current = undefined;void next(); }
        else if (now() >= current.endsAt - transitionLead()) void next();
        else warmNext();
      }
    },
    setGain(input: { gain: number; fadeSeconds?: number }) { gain = validateGain(input.gain);fadeCurrent(input.fadeSeconds ?? .4); },
    setPaused(input: { paused: boolean }) { paused = input.paused;if (!paused) { if (wanted) void pump();else if (!current && !processing && playlistId && playlists.get(playlistId)?.length && (retryAt() ?? now()) <= now()) void next();warmNext(); } },
    reset() { generation++;wanted = undefined;candidate = undefined;const previous = current;current = undefined;previous?.voice.stop();for (const track of retiring) track.voice.stop();retiring.clear();failed.clear();heard.clear();shuffle.reset();playlistId = '';lastAsset = '';nextIndex = 0;intensity = undefined;error = undefined; },
    snapshot() { const loading = !!decoding || !!processing, at = retryAt();const status: 'paused' | 'playing' | 'loading' | 'error' | 'idle' = !current && at !== undefined && !loading && !wanted ? 'error' : !current && (loading || wanted) ? 'loading' : paused ? 'paused' : current?.voice.active ? 'playing' : loading || wanted ? 'loading' : at !== undefined ? 'error' : 'idle';return { playlistId, paused, disposed, loading, status, retryAt: at, error, intensity, nextAssetId: candidate?.track.assetId ?? wanted?.track.assetId, transitionStyle, track: current ? { assetId: current.track.assetId, index: current.index, gain: current.gain, durationSeconds: current.durationSeconds, startedAt: current.startedAt, offset: current.offset, bpm: current.bpm, elapsedSeconds: Math.max(0, Math.min(current.durationSeconds, now() - current.startedAt)) } : undefined }; },
    dispose() { if (disposed) return;disposed = true;generation++;wanted = undefined;candidate = undefined;current?.voice.stop();current = undefined;for (const track of retiring) track.voice.stop();retiring.clear(); },
  };
}

function validateGain(value: number) { if (!Number.isFinite(value) || value < 0 || value > 4) throw new RangeError('Playlist gain must be from zero to four.');return value; }

export type AudioPlaylist = ReturnType<typeof createAudioPlaylist>;
