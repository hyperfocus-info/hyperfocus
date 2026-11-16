import { createVoiceTransition, type AudioContextLike, type AudioEngine, type AudioNodeLike, type AudioParamLike, type AudioPlaylistEngine, type AudioPlayResult, type AudioVoiceHandle, type GainNodeLike, type PlayBufferOptions } from '@hyperfocus/engine/audio';
import type { StandaloneStreamedAudio } from '@hyperfocus/engine/project';

export type StreamingMediaPort = {
  src: string; preload: string; currentTime: number; readonly duration: number; readonly readyState: number; readonly paused: boolean;
  loop: boolean; playbackRate: number;
  play(): Promise<void>; pause(): void; load(): void; removeAttribute(name: string): void;
  addEventListener(type: string, listener: () => void): void; removeEventListener(type: string, listener: () => void): void;
};
export type StreamingMediaFactory = (options: { source: StandaloneStreamedAudio; context: AudioContextLike }) => { media: StreamingMediaPort; node: AudioNodeLike };
type Resource = { source: StandaloneStreamedAudio; media: StreamingMediaPort; node: AudioNodeLike; gain: GainNodeLike; destination: AudioNodeLike; ready: boolean; released: boolean; promise?: Promise<void>; cancel?: () => void; voice?: Voice; listeners: Array<[string, () => void]> };
type Voice = { resource: Resource; handle: AudioVoiceHandle; live: boolean; started: boolean; pending: boolean; startAt: number; endAt: number; stopAt: number; offset: number; gain: number; rate: number; cleanup?: () => void; onEnded?: PlayBufferOptions['onEnded'] };

function isAudioNode(value: unknown): value is AudioNodeLike {
  return value !== null && typeof value === 'object' && 'connect' in value && typeof value.connect === 'function' && 'disconnect' in value && typeof value.disconnect === 'function';
}

function holdGain(parameter: AudioParamLike, at: number) {
  if (parameter.cancelAndHoldAtTime) parameter.cancelAndHoldAtTime(at);
  else { const held = parameter.value;parameter.cancelScheduledValues(at);parameter.setValueAtTime(held, at); }
}

function browserMedia({ context }: Parameters<StreamingMediaFactory>[0]) {
  const media = document.createElement('audio'), connect = Reflect.get(context, 'createMediaElementSource');
  media.crossOrigin = 'anonymous';
  if (typeof connect !== 'function') throw new Error('This audio context cannot stream media.');
  const node: unknown = connect.call(context, media);
  if (!isAudioNode(node)) throw new Error('Invalid media audio node.');
  return { media, node };
}

/** Streams compressed music through the engine mix without decoding it into the PCM cache. */
export function createStreamingMusic(options: {
  engine: Pick<AudioEngine, 'context' | 'withBus' | 'isUnlocked'>; sources: readonly StandaloneStreamedAudio[];
  createMedia?: StreamingMediaFactory; metadataTimeoutMs?: number; onError?: (assetId: string, cause: unknown) => void;
}) {
  const sources = new Map(options.sources.map(source => [source.assetId, source])), resources = new Set<Resource>();
  const failures = new Map<string, { count: number; retryAt: number }>();
  const origin = (source: StandaloneStreamedAudio) => { try { return new URL(source.url, 'https://local.invalid/').origin; } catch { return source.url; } };
  function failed(source: StandaloneStreamedAudio) {
    const key = origin(source), previous = failures.get(key), count = (previous?.count ?? 0) + 1;
    failures.set(key, { count, retryAt: count >= 3 ? Date.now() + 30000 : 0 });
  }
  let disposed = false, paused = false, nextId = 1;
  let wake: ReturnType<typeof setTimeout> | undefined, watchedContext: AudioContextLike | undefined;
  const context = () => options.engine.context();
  const clock = () => context()?.currentTime ?? 0;
  const runnable = () => !disposed && !paused && options.engine.isUnlocked() && context()?.state === 'running';
  const voices = () => [...resources].flatMap(resource => resource.voice?.live ? [resource.voice] : []);
  function scheduleWake() {
    clearTimeout(wake);wake = undefined;
    if (!runnable()) { if (!disposed && !paused && voices().length && context()?.state === 'running') wake = setTimeout(update, 25);return; }
    let at = Infinity;
    for (const voice of voices()) at = Math.min(at, voice.endAt, voice.stopAt, !voice.started && !voice.pending ? voice.startAt : Infinity);
    if (Number.isFinite(at)) wake = setTimeout(update, Math.max(1, Math.min(1000, (at - clock()) * 1000)));
  }
  function report(id: string, cause: unknown) { options.onError?.(id, cause); }
  function listen(resource: Resource, type: string, listener: () => void) {
    resource.listeners.push([type, listener]);resource.media.addEventListener(type, listener);
  }
  function release(resource: Resource) {
    if (resource.released) return;
    resource.released = true;resource.cancel?.();resource.cancel = undefined;
    for (const [type, listener] of resource.listeners) resource.media.removeEventListener(type, listener);
    resource.listeners.length = 0;resource.media.pause();resource.media.removeAttribute('src');resource.media.load();
    resource.node.disconnect();resource.gain.disconnect();resources.delete(resource);
  }
  function finish(voice: Voice, reason: 'ended' | 'stopped') {
    if (!voice.live) return;
    voice.live = false;voice.cleanup?.();voice.cleanup = undefined;release(voice.resource);voice.onEnded?.(reason);scheduleWake();
  }
  function idle(id: string) { return [...resources].find(resource => resource.source.assetId === id && !resource.voice && !resource.released); }
  function load(assetId: string): Promise<void> {
    if (disposed || !options.engine.isUnlocked()) return Promise.reject(new Error('Streaming audio requires an unlocked audio engine.'));
    const existing = idle(assetId);
    if (existing) return existing.promise ?? Promise.resolve();
    const source = sources.get(assetId);
    if (!source) return Promise.reject(new Error(`Unknown streamed music: ${assetId}`));
    if ((failures.get(origin(source))?.retryAt ?? 0) > Date.now()) return Promise.reject(new Error('Music host is unavailable; retrying after a short pause.'));
    for (const resource of resources) if (!resource.voice) release(resource);
    if (resources.size >= 3) return Promise.reject(new Error('Streamed music capacity exceeded.'));
    let resource: Resource;
    try {
      resource = options.engine.withBus('music', (audioContext, destination) => {
        if (watchedContext !== audioContext) { watchedContext?.removeEventListener?.('statechange', update);watchedContext = audioContext;watchedContext.addEventListener?.('statechange', update); }
        const { media, node } = (options.createMedia ?? browserMedia)({ source, context: audioContext }), gain = audioContext.createGain();
        gain.gain.setValueAtTime(0, audioContext.currentTime);node.connect(gain);gain.connect(destination);
        return { source, media, node, gain, destination, ready: false, released: false, listeners: [] };
      });
    } catch (cause) { report(assetId, cause);return Promise.reject(cause); }
    resources.add(resource);
    resource.promise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => fail(new Error(`Timed out loading streamed music: ${assetId}`)), options.metadataTimeoutMs ?? 15_000);
      function settle(cause?: unknown) {
        if (settled) return;
        settled = true;clearTimeout(timer);resource.cancel = undefined;
        if (cause) reject(cause);else resolve();
      }
      function fail(cause: unknown) { if (settled) return;failed(source!);settle(cause);release(resource);report(assetId, cause); }
      function ready() {
        if (resource.released || resource.ready) return;
        if (resource.media.readyState >= 1 && Number.isFinite(resource.media.duration) && resource.media.duration > 0) { resource.ready = true;failures.delete(origin(source!));settle(); }
      }
      resource.cancel = () => settle(new Error(`Streamed music load cancelled: ${assetId}`));
      listen(resource, 'loadedmetadata', ready);listen(resource, 'canplay', ready);
      listen(resource, 'error', () => {
        const cause = new Error(`Cannot play streamed music: ${assetId}`);
        if (resource.voice) { report(assetId, cause);finish(resource.voice, 'stopped'); }else if (resource.ready) { report(assetId, cause);release(resource); }else fail(cause);
      });
      listen(resource, 'ended', () => { if (resource.voice) finish(resource.voice, 'ended'); });
      try { resource.media.preload = 'metadata';resource.media.src = source.url;resource.media.load();ready(); } catch (cause) { fail(cause); }
    });
    return resource.promise;
  }
  function start(voice: Voice) {
    if (voice.pending || !voice.live) return;
    const resource = voice.resource;
    try {
      if (!voice.started) resource.media.currentTime = voice.offset + Math.max(0, clock() - voice.startAt) * voice.rate;
      voice.pending = true;
      void resource.media.play().then(() => {
        voice.pending = false;
        if (!voice.live || !runnable()) { resource.media.pause();return; }
        voice.started = true;scheduleWake();
      }).catch(cause => { voice.pending = false;if (!voice.live) return;report(resource.source.assetId, cause);finish(voice, 'stopped'); });
    } catch (cause) { voice.pending = false;report(resource.source.assetId, cause);finish(voice, 'stopped'); }
  }
  function update() {
    const now = clock();
    if (context()?.state === 'closed') { for (const voice of voices()) finish(voice, 'stopped');for (const resource of resources) release(resource); }
    if (runnable() && resources.size) options.engine.withBus('music', (_audio, destination) => {
      for (const resource of resources) if (resource.destination !== destination) { resource.gain.disconnect();resource.gain.connect(destination);resource.destination = destination; }
    });
    for (const voice of voices()) {
      if (!runnable()) { voice.resource.media.pause();continue; }
      if (now >= voice.stopAt) finish(voice, 'stopped');
      else if (now >= voice.endAt) finish(voice, 'ended');
      else if (now >= voice.startAt && (!voice.started || voice.resource.media.paused)) start(voice);
    }
    scheduleWake();
  }
  function playBuffer(assetId: string, play: PlayBufferOptions = {}): AudioPlayResult {
    function failure(code: 'disposed' | 'not-unlocked' | 'missing-buffer' | 'voice-capacity' | 'invalid-bus' | 'play-failed', message: string): AudioPlayResult { return { ok: false, code, message }; }
    if (disposed) return failure('disposed', 'Streamed audio has been disposed.');
    if (!runnable()) return failure('not-unlocked', 'Streamed audio is paused or locked.');
    if (play.bus && play.bus !== 'music') return failure('invalid-bus', 'Streamed music requires the music bus.');
    if (voices().length >= 2) return failure('voice-capacity', 'Two streamed music voices are already active.');
    const resource = idle(assetId);
    if (!resource?.ready) return failure('missing-buffer', 'Streamed music metadata is not ready.');
    const now = clock(), offset = play.offset ?? 0, rate = play.playbackRate ?? 1, duration = play.duration ?? resource.media.duration - offset, when = Math.max(now, play.when ?? now), gain = play.gain ?? 1;
    if (![offset, rate, duration, when, gain].every(Number.isFinite) || offset < 0 || offset >= resource.media.duration || rate <= 0 || duration <= 0 || gain < 0 || gain > 4) return failure('play-failed', 'Invalid streamed music timing or gain.');
    let voice: Voice;
    const handle: AudioVoiceHandle = {
      id: nextId++, assetId, get active() { return voice.live; },
      stop(at = clock()) { if (!voice.live) return;voice.stopAt = Number.isFinite(at) ? Math.max(clock(), at) : clock();if (voice.stopAt <= clock()) finish(voice, 'stopped');else scheduleWake(); },
      setGain(value, at = clock()) { if (!voice.live) return;voice.gain = value;resource.gain.gain.cancelScheduledValues(at);resource.gain.gain.setValueAtTime(value, at); },
      fadeTo(value, seconds, at = clock()) { if (!voice.live) return;voice.gain = value;holdGain(resource.gain.gain, at);resource.gain.gain.linearRampToValueAtTime(value, at + Math.max(0, seconds)); },
      setPan() {},
      transitionOut(transition) {
        if (!voice.live) return;
        const audioContext = context();if (!audioContext) return;
        const at = Math.max(clock(), transition.when ?? clock()), seconds = transition.durationSeconds ?? 2;
        if (!Number.isFinite(at) || !Number.isFinite(seconds) || seconds < 0 || seconds > 10) throw new RangeError('Invalid streamed music transition timing.');
        voice.cleanup?.();resource.node.disconnect();resource.node.connect(resource.gain);
        holdGain(resource.gain.gain, at);
        voice.cleanup = createVoiceTransition({ context: audioContext, source: resource.node, gain: resource.gain, transition, when: at, bpm: transition.bpm }).cleanup;
        resource.gain.gain.linearRampToValueAtTime(0, at + seconds);voice.stopAt = at + seconds;scheduleWake();
      },
    };
    voice = { resource, handle, live: true, started: false, pending: false, startAt: when, endAt: play.loop ? Infinity : when + Math.min(duration, resource.media.duration - offset) / rate, stopAt: Infinity, offset, gain, rate, onEnded: play.onEnded };
    resource.voice = voice;resource.media.loop = play.loop ?? false;resource.media.playbackRate = rate;resource.gain.gain.setValueAtTime(gain, when);update();
    return { ok: true, voice: handle };
  }
  function setPaused(value: boolean) { paused = value;update(); }
  function prune(keepIds: readonly string[]) { const keep = new Set(keepIds);for (const resource of resources) if (!resource.voice && !keep.has(resource.source.assetId)) release(resource); }
  function dispose() { if (disposed) return;disposed = true;clearTimeout(wake);wake = undefined;watchedContext?.removeEventListener?.('statechange', update);watchedContext = undefined;for (const voice of voices()) finish(voice, 'stopped');for (const resource of resources) release(resource); }
  const facade: AudioPlaylistEngine = { context, isUnlocked: () => runnable(), hasBuffer: id => idle(id)?.ready ?? false, getAudioMetadata: id => sources.get(id)?.audioMetadata, getBufferDuration: id => [...resources].find(resource => resource.source.assetId === id && resource.ready)?.media.duration ?? sources.get(id)?.durationSeconds, playBuffer };
  return { facade, load, update, setPaused, prune, dispose, retry() { failures.clear(); }, snapshot: () => ({ resources: resources.size, activeVoices: voices().length, preloadedSources: [...resources].filter(resource => !resource.voice).length, pendingLoads: [...resources].filter(resource => !resource.ready).length, decodedPcmBytes: 0 }) };
}
