import { createAudioEngine, type AudioEngine, type AudioVoiceHandle } from '@hyperfocus/engine/audio';
import type { PlayableAudioCommand } from '@hyperfocus/engine/project/runtime-2d';
import { createStandaloneMusic } from './audio-playback/music.ts';
import { createStandalonePlaylists, type StandalonePlaylistOptions } from './audio-playback/playlists.ts';
import { createStandaloneEffectsQueue } from './audio-playback/effects-queue.ts';
import { createStreamingMusic } from './audio-playback/streaming.ts';
import type { StandaloneStreamedAudio } from '@hyperfocus/engine/project';
import { readCombatAudioMix3D, type CombatAudio3D } from '@hyperfocus/engine/project/runtime-3d';
import { createCombatMusicEffects } from './audio-playback/combat-effects.ts';
import { createStandaloneUiAudio, uiCueAssetKeys } from './audio-playback/ui-audio.ts';

const MAX_PENDING_COMMANDS = 128, MAX_SFX_LATENESS_MS = 180, MAX_DECODING_ASSETS = 64;
const PREDECODE_CONCURRENCY = 4, PREDECODE_BYTE_BUDGET = 16777216;
export type StandaloneAudioAsset = { id: string; mimeType: string; bytes: Uint8Array };
type Play = Extract<PlayableAudioCommand, { type: 'play' }>;
type Pending = { command: Play; at: number; ready: boolean; decoding: boolean; cancelled: boolean };
type StandaloneAudioEngine = Omit<Pick<AudioEngine, 'decode' | 'dispose' | 'hasBuffer' | 'playBuffer' | 'setMasterGain' | 'setPaused' | 'unlock'>, 'decode'> & {
  decode(id: string, bytes: Uint8Array): Promise<unknown>;
  setBusGain?: AudioEngine['setBusGain']; fadeBus?: AudioEngine['fadeBus']; context?: AudioEngine['context']; getBufferDuration?: AudioEngine['getBufferDuration']; getAudioMetadata?: AudioEngine['getAudioMetadata']; removeBuffer?: AudioEngine['removeBuffer'];
  withBus?: AudioEngine['withBus'];
  configureBusEffects?: AudioEngine['configureBusEffects']; setBusReactive?: AudioEngine['setBusReactive']; busEffectsSnapshot?: AudioEngine['busEffectsSnapshot'];
};
export type StandaloneAudioControllerOptions = StandalonePlaylistOptions & {
  engine?: StandaloneAudioEngine; masterVolume?: number; preloadAssetIds?: readonly string[];
  now?: () => number; onError?: (error: Error) => void; maxDecodedBytes?: number;
  streamedMusic?: readonly StandaloneStreamedAudio[];
  loadAsset?: (id: string) => Promise<Uint8Array>;
  combatAudio?: CombatAudio3D;
};

/** Bounded independent decoding keeps a cached hit independent of an undecoded music loop. */
export function createStandaloneAudioController(assets: readonly StandaloneAudioAsset[], options: StandaloneAudioControllerOptions = {}) {
  const streamedIds = new Set(options.streamedMusic?.map(source => source.assetId));
  const audioAssets = new Map(assets.filter(asset => asset.mimeType.startsWith('audio/')).map(asset => [asset.id, asset.bytes]));
  const predecodeQueue: string[] = [];
  let predecodeBytes = 0;
  for (const id of new Set(options.preloadAssetIds ?? [])) {
    const bytes = audioAssets.get(id);
    if (!bytes || streamedIds.has(id) || bytes.byteLength > 524288 || predecodeBytes + bytes.byteLength > PREDECODE_BYTE_BUDGET) continue;
    predecodeQueue.push(id);predecodeBytes += bytes.byteLength;
  }
  const engine = options.engine ?? createAudioEngine({ maxDecodedEntries: Math.max(128, new Set(options.preloadAssetIds ?? []).size + 8), maxDecodedBytes: options.maxDecodedBytes ?? (options.streamedMusic?.length ? 33554432 : options.playlists ? 335544320 : undefined), onRecoveryRequired: async () => { await combatEffects.recover();predecode(); }, onDiagnostic: diagnostic => { if (diagnostic.level === 'error' || diagnostic.code === 'effects-unavailable') report(new Error(diagnostic.message)); } }), now = options.now ?? (() => performance.now());
  const pending: Pending[] = [], decoding = new Map<string, Promise<void>>();
  const loading = new Set<Promise<void>>();
  const voicesByScene = new Map<string, Map<AudioVoiceHandle, string>>();
  const music = createStandaloneMusic({ engine });
  let unlocked = false, disposed = false, paused = false, pausedAt = 0;
  let predecoding = 0;
  let pauseChain = Promise.resolve(), flushChain = Promise.resolve(), unlockOperation: Promise<void> | undefined;
  const initialMix = options.combatAudio ? readCombatAudioMix3D(options.combatAudio.mix) : undefined;
  let masterVolume = clamp(options.masterVolume ?? initialMix?.master ?? 1), sfxVolume = initialMix?.sfx ?? 1, musicVolume = initialMix?.music ?? 1, ambientVolume = initialMix?.ambient ?? 1;
  const report = (cause: unknown) => { if (!disposed) options.onError?.(cause instanceof Error ? cause : new Error(String(cause))); };
  const uiAudio = createStandaloneUiAudio({ mix: () => ({ master: masterVolume, sfx: sfxVolume }), onError: report, now,
    bytesForCue: cue => { const id = options.combatAudio?.cues?.[uiCueAssetKeys[cue]];return id ? audioAssets.get(id) : undefined; } });
  const combatEffects = createCombatMusicEffects({ engine, audio: options.combatAudio, onError: report, load: async id => {
    const bytes = audioAssets.get(id);if (!bytes) throw new Error(`City impulse asset is missing: ${id}`);
    if (!engine.hasBuffer(id)) await decode(id, bytes);
  } });
  const streaming = options.streamedMusic?.length ? createStreamingMusic({ sources: options.streamedMusic,
    engine: { context: engine.context ?? (() => undefined), isUnlocked: () => unlocked && !paused,
      withBus: engine.withBus ?? (() => { throw new Error('Streaming music requires the native audio bus host.'); }) }, onError: report }) : undefined;
  const playlistEngine = streaming ? { ...engine,
    hasBuffer: (id: string) => streamedIds.has(id) ? streaming.facade.hasBuffer(id) : engine.hasBuffer(id),
    getAudioMetadata: (id: string) => streamedIds.has(id) ? streaming.facade.getAudioMetadata?.(id) : engine.getAudioMetadata?.(id),
    getBufferDuration: (id: string) => streamedIds.has(id) ? streaming.facade.getBufferDuration(id) : engine.getBufferDuration?.(id),
    playBuffer: (id: string, play: Parameters<AudioEngine['playBuffer']>[1]) => streamedIds.has(id) ? streaming.facade.playBuffer(id, play) : engine.playBuffer(id, play),
  } : engine;
  const effects = createStandaloneEffectsQueue({ engine, now, isUnlocked: () => unlocked && !paused, onError: report, saturation: combatEffects.saturation,
    onStarted(command, voice) {
      if (disposed) { voice.stop();return; }
      let voices = voicesByScene.get(command.sceneId);if (!voices) voicesByScene.set(command.sceneId, voices = new Map());
      for (const existing of voices.keys()) if (!existing.active) voices.delete(existing);
      voices.set(voice, command.category === 'voice' ? 'voice' : command.bus);music.started(command, voice);
    } });
  const musicAssetIds = new Set(Object.values(options.playlists ?? {}).flatMap(tracks => tracks.map(track => track.assetId)));
  const playlists = createStandalonePlaylists({ engine: playlistEngine, playlists: options.playlists, musicTransition: options.musicTransition, musicSeed: options.musicSeed, onError: report, load: async id => {
    if (disposed) throw new Error('Audio host has been disposed.');
    if (streaming && streamedIds.has(id)) { await streaming.load(id);streaming.prune([id, ...(playlists.snapshot()?.track ? [playlists.snapshot()!.track!.assetId] : [])]);return; }
    const bytes = audioAssets.get(id) ?? await options.loadAsset?.(id);
    if (!bytes) throw new Error(`Playlist asset is missing from assets.hfp: ${id}`);
    // Retiring sources retain their buffer; keep cache space for the hot SFX bank.
    const current = playlists.snapshot()?.track?.assetId;
    for (const musicId of musicAssetIds) if (musicId !== id && musicId !== current) engine.removeBuffer?.(musicId);
    if (!engine.hasBuffer(id)) await decode(id, bytes);
  } });
  function applyBusVolumes() {
    engine.setBusGain?.('sfx', sfxVolume);engine.setBusGain?.('voice', sfxVolume);engine.setBusGain?.('ambient', ambientVolume);music.setVolume(musicVolume);uiAudio.applyMix();
  }
  function decode(id: string, bytes: Uint8Array) {
    let operation = decoding.get(id);
    if (!operation) {
      operation = engine.decode(id, bytes).then(() => undefined).finally(() => { decoding.delete(id);predecode(); });
      decoding.set(id, operation);
    }
    return operation;
  }
  function predecode() {
    if (!unlocked || paused || disposed) return;
    while (predecodeQueue.length && predecoding < PREDECODE_CONCURRENCY && decoding.size < MAX_DECODING_ASSETS) {
      const id = predecodeQueue.shift()!;
      const bytes = audioAssets.get(id);
      if (!bytes || engine.hasBuffer(id)) continue;
      predecoding++;
      void decode(id, bytes).catch(report).finally(() => { predecoding--;if (!disposed) { scheduleFlush();predecode(); } });
    }
  }
  function enqueue(commands: readonly PlayableAudioCommand[]) {
    if (disposed) return;
    for (const command of commands) {
      if (command.type === 'stop-scene') stopScene(command.sceneId);
      else if (command.type === 'stop') stopScene(command.sceneId, command.bus);
      else {
        if (pending.length >= MAX_PENDING_COMMANDS && command.priority >= 80 && command.bus !== 'music' && !command.loop) {
          const ordinary = pending.filter(item => !item.command.loop && item.command.bus !== 'music' && item.command.priority < 80 && item.command.priority < command.priority)
            .sort((a, b) => a.command.priority - b.command.priority || a.at - b.at)[0];
          if (ordinary) { ordinary.cancelled = true;remove(ordinary); }
        }
        if (pending.length >= MAX_PENDING_COMMANDS) { report(new Error(`Standalone audio queue reached its ${MAX_PENDING_COMMANDS} command limit.`));continue; }
        if (command.bus === 'music') for (const item of [...pending]) if (item.command.sceneId === command.sceneId && item.command.bus === 'music') { item.cancelled = true;remove(item); }
        pending.push({ command: { ...command, ...(command.bus === 'voice' ? { bus: 'sfx', category: 'voice' } as const : {}) }, at: now(), ready: false, decoding: false, cancelled: false });
      }
    }
    if (unlocked && !paused) scheduleFlush();
  }
  function scheduleFlush() { flushChain = flushChain.then(flush).catch(report); }
  async function settleFlush() { let settled: Promise<void>;do { settled = flushChain;await settled; } while (settled !== flushChain); }
  async function flush() {
    let settled: Promise<void>;
    do { settled = pauseChain;await settled; } while (settled !== pauseChain);
    if (!unlocked || disposed || paused) return;
    for (const item of [...pending]) {
      const command = item.command;
      if (item.cancelled || (!command.loop && command.bus !== 'music' && now() - item.at > MAX_SFX_LATENESS_MS)) { remove(item);continue; }
      if (playlists.handle(command)) {
        music.stopScene(command.sceneId, 'music');
        const voices = voicesByScene.get(command.sceneId);
        if (voices) for (const [voice, bus] of voices) if (bus === 'music') { voice.stop();voices.delete(voice); }
        remove(item);continue;
      }
      if (command.bus === 'music') playlists.stopScene(command.sceneId, 'music');
      if (music.update(command)) { remove(item);continue; }
      const streamed = command.bus === 'music' && streamedIds.has(command.assetId) && streaming;
      const playback = streamed ? playlistEngine : engine;
      const bytes = audioAssets.get(command.assetId);
      if (!bytes && !streamed && !options.loadAsset) { remove(item);report(new Error(`Standalone audio asset is missing from assets.hfp: ${command.assetId}`));continue; }
      if (!item.ready && !playback.hasBuffer(command.assetId)) {
        if (!item.decoding) {
          if (!decoding.has(command.assetId) && decoding.size >= MAX_DECODING_ASSETS) continue;
          item.decoding = true;
          const load = streamed ? streamed.load(command.assetId) : bytes ? decode(command.assetId, bytes) : options.loadAsset!(command.assetId).then(bytes => decode(command.assetId, bytes));
          loading.add(load);
          void load.then(() => { if (!item.cancelled && !disposed) item.ready = true; }).catch(cause => { remove(item);if (!item.cancelled) report(cause); }).finally(() => { loading.delete(load);item.decoding = false;if (!disposed) scheduleFlush(); });
        }
        continue;
      }
      remove(item);
      if (command.bus !== 'music' && !command.loop) { effects.enqueue(command);continue; }
      const saturation = combatEffects.saturation(command.impactStrength);
      const result = playback.playBuffer(command.assetId, { bus: command.bus, gain: command.bus === 'music' && command.fadeSeconds ? 0 : command.gain, pan: command.pan, loop: command.loop, priority: command.priority,
        ...(command.playbackRate === undefined ? {} : { playbackRate: command.playbackRate }), ...(saturation > 0 ? { saturation } : {}) });
      if (!result.ok) { if (result.code !== 'voice-capacity') report(new Error(result.message));continue; }
      let voices = voicesByScene.get(command.sceneId);
      if (!voices) voicesByScene.set(command.sceneId, voices = new Map());
      for (const voice of voices.keys()) if (!voice.active) voices.delete(voice);
      voices.set(result.voice, command.category === 'voice' ? 'voice' : command.bus);music.started(command, result.voice);
    }
  }
  function remove(item: Pending) { const index = pending.indexOf(item);if (index >= 0) pending.splice(index, 1); }
  async function unlockAndFlush() {
    if (disposed || paused) return;
    await pauseChain;
    if (disposed || paused) return;
    if (!unlocked) {
      unlockOperation ??= engine.unlock().then(async () => {
        if (disposed) return;
        await combatEffects.configure();if (disposed) return;
        unlocked = true;engine.setMasterGain(masterVolume);applyBusVolumes();predecode();
      }).finally(() => { unlockOperation = undefined; });
      await unlockOperation;
    }
    scheduleFlush();await settleFlush();
    // Await explicit drains, while enqueued ready sounds continue through their own flush.
    while (!disposed && !paused && pending.length && (decoding.size || pending.some(item => item.decoding))) {
      await Promise.allSettled([...decoding.values(), ...loading]);await settleFlush();
    }
  }
  function stopScene(sceneId: string, bus?: string) {
    const stoppedEffects = effects.stopScene(sceneId, bus);
    for (const item of [...pending]) if (item.command.sceneId === sceneId && (bus === undefined || item.command.bus === bus || bus === 'voice' && item.command.category === 'voice')) { item.cancelled = true;remove(item); }
    music.stopScene(sceneId, bus);playlists.stopScene(sceneId, bus);
    const voices = voicesByScene.get(sceneId);
    if (!voices) return;
    for (const [voice, voiceBus] of voices) if (bus === undefined || voiceBus === bus || bus === 'sfx' && voiceBus === 'voice') { if (!stoppedEffects.has(voice)) voice.stop();voices.delete(voice); }
    if (!voices.size) voicesByScene.delete(sceneId);
  }
  async function prepareAssets(staged: readonly StandaloneAudioAsset[]) {
    if (disposed) throw Error('Audio host has been disposed.');
    const selected = staged.filter(asset => asset.mimeType.startsWith('audio/') && !streamedIds.has(asset.id));
    if (selected.reduce((sum, asset) => sum + asset.bytes.length, 0) > PREDECODE_BYTE_BUDGET) throw Error('Audio stage exceeds its preparation budget.');
    for (const asset of selected) audioAssets.set(asset.id, asset.bytes);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(PREDECODE_CONCURRENCY, selected.length) }, async () => {
      while (next < selected.length) {
        if (disposed) throw Error('Audio host has been disposed.');
        const asset = selected[next++]!;
        if (!engine.hasBuffer(asset.id)) await decode(asset.id, asset.bytes);
      }
    }));
    if (disposed) throw Error('Audio host has been disposed.');
    if (selected.some(asset => !engine.hasBuffer(asset.id))) throw Error('Fight audio exceeds the decoded audio cache.');
  }
  async function dispose() {
    if (disposed) return;
    disposed = true;pending.length = 0;predecodeQueue.length = 0;music.dispose();playlists.dispose();effects.dispose();streaming?.dispose();
    for (const sceneId of [...voicesByScene.keys()]) stopScene(sceneId);
    combatEffects.dispose();await Promise.all([engine.dispose(), uiAudio.dispose()]);
  }
  return { enqueue, unlockAndFlush, prepareAssets, stopScene, dispose, playUi: uiAudio.play, unlockUi: uiAudio.unlock, setPersonalMusicState: combatEffects.personal,
    setPaused(value: boolean) {
      if (paused !== value) {
        if (value) pausedAt = now();
        else for (const item of pending) item.at += now() - Math.max(pausedAt, item.at);
        paused = value;music.setPaused(value);playlists.setPaused(value);effects.setPaused(value);streaming?.setPaused(value);
      }
      const unlocking = unlockOperation;
      const operation = pauseChain.then(async () => { await unlocking?.catch(() => undefined);if (!disposed) await engine.setPaused({ paused: value }); });
      pauseChain = operation.catch(() => undefined);
      return operation.then(() => { if (!paused && unlocked) { scheduleFlush();predecode(); } });
    },
    setMasterVolume(value: number) {
      if (!Number.isFinite(value)) throw new Error('Master volume must be finite.');
      masterVolume = clamp(value);uiAudio.applyMix();if (unlocked && !disposed) engine.setMasterGain(masterVolume);
    },
    setMixVolumes(value: { master: number; sfx: number; music: number; voice?: number; ambient?: number }) {
      if (![value.master, value.sfx, value.music, value.voice ?? 1, value.ambient ?? 1].every(Number.isFinite)) throw new Error('Audio mix gains must be finite.');
      masterVolume = clamp(value.master);sfxVolume = clamp(value.sfx);musicVolume = clamp(value.music);ambientVolume = clamp(value.ambient ?? ambientVolume);uiAudio.applyMix();
      if (unlocked && !disposed) { engine.setMasterGain(masterVolume);applyBusVolumes(); }
    },
    update() { streaming?.update();playlists.update();effects.update(); }, musicSnapshot: playlists.snapshot, nextMusic: playlists.next, async retryMusic() { streaming?.retry();await playlists.retry(); },
    resourceSnapshot: () => ({ effects: effects.snapshot(), streaming: streaming?.snapshot(), processing: combatEffects.snapshot(), ui: uiAudio.snapshot(), mix: { master: masterVolume, music: musicVolume, sfx: sfxVolume, voice: sfxVolume, ambient: ambientVolume } }),
    pendingCount: () => pending.length + effects.pendingCount(), isUnlocked: () => unlocked,
  };
}
import { clamp01 as clamp } from '@hyperfocus/utilities/math';
